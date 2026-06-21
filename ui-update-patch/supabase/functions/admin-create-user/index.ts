// ============================================================
// admin-create-user
// ------------------------------------------------------------
// Lets a Super Admin create a Student/Teacher/Principal/Trust
// Member/Admin account WITHOUT hijacking their own browser
// session — which is what happens if the front-end calls
// supabase.auth.signUp() directly (signUp() signs the *current
// browser* in as the newly created user).
//
// This function runs server-side, using the SERVICE ROLE key
// (never shipped to the browser), and:
//   1. Verifies the caller is logged in and has role = super_admin
//      (re-checked here — never trust the client to self-report
//      its own role). Role only, not status — see the matching
//      note in 002_full_rls_audit_and_fix.sql for why a status
//      check here would risk the same deadlock that motivated
//      this whole fix.
//   2. Creates the auth user via the Admin API
//      (auth.admin.createUser) — this does NOT touch the
//      caller's session at all.
//   3. Inserts the corresponding profiles row using the same
//      elevated service-role client, so it bypasses RLS safely
//      (RLS still protects the table from the browser; this
//      function is one trusted path allowed to insert on
//      someone else's behalf — the other is the super_admin
//      RLS policy itself, for direct table access).
//
// Deploy with:
//   supabase functions deploy admin-create-user
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
// automatically inside every Edge Function — no manual secrets
// setup needed for those two.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ROLES = ["student", "teacher", "principal", "trust_member", "admin", "super_admin"];

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // tighten to your real domain(s) before going live
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header." }, 401, corsHeaders);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // ---- Client #1: scoped to the CALLER's own JWT ----
    // Used only to verify who is calling.
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) {
      return jsonResponse({ error: "Invalid or expired session." }, 401, corsHeaders);
    }

    // ---- Client #2: full service-role admin client ----
    // Used for privileged operations (admin.createUser, and the
    // profiles insert below). Never exposed to the browser.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Re-check the caller's role server-side. NEVER trust a role
    // value sent in the request body — only trust what's actually
    // stored against their own row. Role only — see file header.
    const { data: callerProfile, error: callerProfileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .single();

    if (callerProfileErr || !callerProfile) {
      return jsonResponse({ error: "Caller profile not found." }, 403, corsHeaders);
    }
    if (callerProfile.role !== "super_admin") {
      return jsonResponse({ error: "Only super_admin may create users." }, 403, corsHeaders);
    }

    // ---- Parse + validate input ----
    const body = await req.json().catch(() => ({}));
    const { name, email, password, role } = body;

    if (!name || !email || !password || !role) {
      return jsonResponse({ error: "name, email, password, and role are all required." }, 400, corsHeaders);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "Password must be at least 8 characters." }, 400, corsHeaders);
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return jsonResponse({ error: `role must be one of: ${ALLOWED_ROLES.join(", ")}` }, 400, corsHeaders);
    }

    // ---- 1. Create the auth user (admin API — no session impact) ----
    const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email confirmation since an admin is vouching for this account
      user_metadata: { full_name: name },
    });

    if (createErr) {
      return jsonResponse({ error: "Auth error: " + createErr.message }, 400, corsHeaders);
    }

    const newUserId = createdUser?.user?.id;
    if (!newUserId) {
      return jsonResponse({ error: "User created but no ID was returned." }, 500, corsHeaders);
    }

    // ---- 2. Insert the profile row (service role bypasses RLS) ----
    const { error: profileErr } = await adminClient.from("profiles").upsert({
      id: newUserId,
      email,
      full_name: name,
      role,
      status: "active",
      must_change_password: true, // force them to set their own password on first login
    });

    if (profileErr) {
      return jsonResponse(
        {
          error:
            "Auth account created, but profile insert failed: " +
            profileErr.message +
            ". The auth user (id: " +
            newUserId +
            ") exists without a profile — check Authentication > Users in Supabase.",
        },
        500,
        corsHeaders
      );
    }

    // ---- 3. Log the action (best-effort, don't fail the request over it) ----
    await adminClient.from("activity_logs").insert({
      actor_id: callerData.user.id,
      action: "user.created",
      target_table: "profiles",
      target_id: newUserId,
      details: { role, email },
    }).catch(() => {});

    return jsonResponse({ success: true, userId: newUserId }, 200, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: "Unexpected error: " + (err?.message || String(err)) }, 500, corsHeaders);
  }
});

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
