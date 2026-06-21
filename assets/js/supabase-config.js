/* ============================================================
   JH+ CAMPUS MANAGEMENT SYSTEM
   Shared Supabase Client + Authentication Helpers
   ------------------------------------------------------------
   This is the ONLY place Supabase is initialized. Every portal
   page (student/teacher/principal/trust/admin/super-admin) and
   every login page loads this file before using auth.

   IMPORTANT: Replace the placeholder values below with your
   real Supabase project URL and anon (public) key once your
   project exists. NEVER put the service_role key here — this
   file ships to the browser.
   ============================================================ */

// ---- Load the Supabase JS SDK (v2) from CDN ----
// Add this script tag BEFORE this file in every page that needs auth:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Guard so this file can be safely included multiple times.
if (typeof window.supabaseClient === "undefined") {
  if (typeof window.supabase === "undefined") {
    console.error(
      "[JH+] Supabase SDK not found. Add the CDN <script> tag before supabase-config.js."
    );
  }

  window.supabaseClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
}

const sb = window.supabaseClient;

/* ============================================================
   ROLE CONSTANTS
   ============================================================ */
const JH_ROLES = Object.freeze({
  STUDENT: "student",
  TEACHER: "teacher",
  PRINCIPAL: "principal",
  TRUST_MEMBER: "trust_member",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
});

// Maps each role to its portal home page.
const JH_ROLE_HOME = Object.freeze({
  student: "/student/index.html",
  teacher: "/teacher/index.html",
  principal: "/principal/index.html",
  trust_member: "/trust/index.html",
  admin: "/admin/index.html",
  super_admin: "/super-admin/index.html",
});

// Maps each role to its login page (used for redirects on logout / denied access).
const JH_ROLE_LOGIN = Object.freeze({
  student: "/student/login.html",
  teacher: "/teacher/login.html",
  principal: "/principal/login.html",
  trust_member: "/trust/login.html",
  admin: "/admin/login.html",
  super_admin: "/super-admin/login.html",
});

/* ============================================================
   CORE SESSION HELPERS
   ============================================================ */

/**
 * Returns the current Supabase auth session, or null.
 */
async function jhGetSession() {
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("[JH+] getSession error:", error.message);
    return null;
  }
  return data.session;
}

/**
 * Fetches the profile row (id, email, role, full_name, must_change_password, etc.)
 * for the currently logged-in user from the `profiles` table.
 * Returns null if not logged in or no profile exists.
 */
async function jhGetProfile() {
  const session = await jhGetSession();
  if (!session) return null;

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("[JH+] getProfile error:", error.message);
    return null;
  }
  return data;
}

/* ============================================================
   AUTH ACTIONS
   ============================================================ */

/**
 * Email + password login.
 * Returns { success, error, profile }.
 */
async function jhLoginWithPassword(email, password) {
  if (!sb) return { success: false, error: "Supabase not initialized." };

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    return { success: false, error: error.message };
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    await sb.auth.signOut();
    return { success: false, error: "No profile found for this account." };
  }

  return { success: true, profile };
}

/**
 * Google OAuth login. Redirects the browser to Google, then back to
 * `redirectTo` (defaults to the current page's portal login-callback handler).
 *
 * NOTE: This requires the Google provider to be enabled in your
 * Supabase project (Authentication -> Providers -> Google) and a
 * matching OAuth Client ID/Secret configured in Google Cloud Console.
 * This is a one-time dashboard setup step, not something this file can do.
 */
async function jhLoginWithGoogle(redirectTo) {
  if (!sb) return { success: false, error: "Supabase not initialized." };

  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo || window.location.origin + window.location.pathname,
    },
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Sends a password-reset email via Supabase.
 */
async function jhSendPasswordReset(email, redirectTo) {
  if (!sb) return { success: false, error: "Supabase not initialized." };

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo || window.location.origin + "/reset-password.html",
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Updates the logged-in user's password. Used both for normal password
 * changes and for the forced first-login password reset flow.
 */
async function jhUpdatePassword(newPassword) {
  if (!sb) return { success: false, error: "Supabase not initialized." };

  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message };

  // Clear the forced-reset flag once the password has been changed.
  const session = await jhGetSession();
  if (session) {
    await sb
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", session.user.id);
  }

  return { success: true };
}

/**
 * Logs the current user out and redirects to the given login page
 * (defaults to the public homepage).
 */
async function jhLogout(redirectTo) {
  if (sb) await sb.auth.signOut();
  window.location.href = redirectTo || "/index.html";
}

/* ============================================================
   AUTH GUARD
   ------------------------------------------------------------
   Call this at the top of every protected portal page:

     <script>
       authGuard(['student']).then(profile => {
         // profile is guaranteed non-null and role-matched here.
         document.getElementById('welcome').textContent = profile.full_name;
       });
     </script>

   Behavior:
   - No session            -> redirect to that role's login page
   - Session but wrong role -> redirect to an "access denied" page
   - must_change_password   -> redirect to the forced password-change page
   - Otherwise              -> resolves with the user's profile
   ============================================================ */
async function authGuard(allowedRoles) {
  const session = await jhGetSession();

  if (!session) {
    const fallbackLogin = allowedRoles && allowedRoles[0]
      ? JH_ROLE_LOGIN[allowedRoles[0]]
      : "/index.html";
    window.location.href = fallbackLogin;
    return null;
  }

  const profile = await jhGetProfile();

  if (!profile) {
    await jhLogout();
    return null;
  }

  if (Array.isArray(allowedRoles) && !allowedRoles.includes(profile.role)) {
    window.location.href = "/access-denied.html";
    return null;
  }

  // Force password change before allowing any dashboard access.
  const onForcedResetPage = window.location.pathname.includes("force-password-change");
  if (profile.must_change_password && !onForcedResetPage) {
    const role = profile.role;
    window.location.href = `/${role === "super_admin" ? "super-admin" : role}/force-password-change.html`;
    return null;
  }

  return profile;
}

/**
 * Lightweight redirect-if-already-logged-in helper for login pages,
 * so a logged-in user landing on /student/login.html gets bounced
 * straight to their dashboard instead of seeing the login form again.
 */
async function jhRedirectIfLoggedIn() {
  const session = await jhGetSession();
  if (!session) return;

  const profile = await jhGetProfile();
  if (!profile) return;

  if (profile.must_change_password) {
    const role = profile.role;
    window.location.href = `/${role === "super_admin" ? "super-admin" : role}/force-password-change.html`;
    return;
  }

  window.location.href = JH_ROLE_HOME[profile.role] || "/index.html";
}
