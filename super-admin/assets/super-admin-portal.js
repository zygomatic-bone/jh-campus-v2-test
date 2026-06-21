/* ============================================================
   JH+ SUPER ADMIN PORTAL — logic
   ============================================================ */

let CURRENT_PROFILE = null;

const VIEW_META = {
  dashboard: { title: "Dashboard", sub: "Full system control." },
  users: { title: "User Management", sub: "Create, edit, and manage every account." },
  academic: { title: "Classes & Sections", sub: "Manage the academic structure used everywhere." },
  sections: { title: "Section Builder", sub: "Homepage sections — reorder, hide, publish, delete." },
  media: { title: "Media Library", sub: "All uploaded images and documents." },
  logs: { title: "Logs", sub: "Full system activity history." },
  settings: { title: "Settings", sub: "Account and system settings." },
  profile: { title: "Profile", sub: "Your account details." },
};

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await authGuard(["super_admin"]);
  if (!profile) return;
  CURRENT_PROFILE = profile;
  jhInitShell(profile);

  document.querySelectorAll(".jh-nav-link[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".jh-nav-link[data-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("jhSidebar").classList.remove("open");
      document.getElementById("jhSidebarOverlay").classList.remove("show");
      renderView(btn.dataset.view);
    });
  });

  renderView("dashboard");
});

function setViewHeader(view) {
  const meta = VIEW_META[view];
  document.getElementById("viewTitle").textContent = meta.title;
  document.getElementById("viewSub").textContent = meta.sub;
}

async function renderView(view) {
  setViewHeader(view);
  const content = document.getElementById("viewContent");
  content.innerHTML = '<div class="jh-loading"><div class="jh-spin"></div></div>';
  try {
    switch (view) {
      case "dashboard": return renderDashboard(content);
      case "users": return renderUsers(content);
      case "academic": return renderAcademic(content);
      case "sections": return renderSections(content);
      case "media": return renderMedia(content);
      case "logs": return renderLogs(content);
      case "settings": return renderSettings(content);
      case "profile": return renderProfile(content);
    }
  } catch (err) {
    console.error("[Super Admin] error:", err);
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">Something went wrong loading this section.</div></div>`;
  }
}

async function logActivity(action, targetTable, targetId, details) {
  await sb.from("activity_logs").insert({ actor_id: CURRENT_PROFILE.id, action, target_table: targetTable || null, target_id: targetId || null, details: details || null });
}

/* ---------------------------------------------------------- */
async function renderDashboard(content) {
  const [{ count: userCount }, { count: sectionCount }, { count: mediaCount }, { data: mediaSizes }] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("homepage_sections").select("id", { count: "exact", head: true }).eq("is_published", true),
    sb.from("media_library").select("id", { count: "exact", head: true }),
    sb.from("media_library").select("size_bytes"),
  ]);

  const totalBytes = (mediaSizes || []).reduce((sum, m) => sum + (m.size_bytes || 0), 0);

  content.innerHTML = `
    <div class="jh-grid jh-grid-4">
      ${statCard("Total Users", userCount || 0, '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>')}
      ${statCard("Live Sections", sectionCount || 0, '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>')}
      ${statCard("Media Files", mediaCount || 0, '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/>')}
      ${statCard("Storage Used", formatBytes(totalBytes), '<path d="M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>')}
    </div>
  `;
}

function statCard(label, value, icon) {
  return `<div class="jh-card jh-stat"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div><div class="value">${value}</div><div class="label">${label}</div></div>`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB";
}

/* ---------------------------------------------------------- */
/* ---------------------------------------------------------- */
/* USER MANAGEMENT — full CRUD without opening Supabase       */
/* ---------------------------------------------------------- */

const JH_ROLES_LIST = ["student","teacher","principal","trust_member","admin","super_admin"];

function roleBadge(role) {
  const colors = { student:"#0a84ff", teacher:"#30d158", principal:"#d4a857", trust_member:"#bf5af2", admin:"#ff9f0a", super_admin:"#ff453a" };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:980px;font-size:11px;font-weight:600;background:${colors[role]||"#555"}22;color:${colors[role]||"#ccc"};border:1px solid ${colors[role]||"#555"}44;">${(role||"").replace(/_/g," ")}</span>`;
}

function statusBadge(status) {
  if (status === "active")  return '<span class="jh-badge jh-badge-green">Active</span>';
  if (status === "pending") return '<span class="jh-badge jh-badge-gold">Pending</span>';
  return '<span class="jh-badge jh-badge-gray">Inactive</span>';
}

async function renderUsers(content) {
  const { data: users, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) { content.innerHTML = `<div class="jh-card" style="color:var(--red);">Error loading users: ${escapeHtml(error.message)}</div>`; return; }

  content.innerHTML = `
    <!-- ── CREATE USER ─────────────────────────────────── -->
    <div class="jh-card" style="margin-bottom:20px;">
      <div class="jh-section-title" style="margin-bottom:14px;">Create User</div>
      <div id="createUserMsg" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:10px;font-size:13px;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:12px;color:var(--text-faint);display:block;margin-bottom:4px;">Full Name *</label>
          <input id="cuName" class="login-input" placeholder="e.g. Ahmed Khan" style="width:100%;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-faint);display:block;margin-bottom:4px;">Email Address *</label>
          <input id="cuEmail" class="login-input" type="email" placeholder="user@example.com" style="width:100%;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-faint);display:block;margin-bottom:4px;">Password *</label>
          <input id="cuPassword" class="login-input" type="password" placeholder="Min 8 characters" style="width:100%;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-faint);display:block;margin-bottom:4px;">Role *</label>
          <select id="cuRole" class="login-input" style="width:100%;box-sizing:border-box;">
            ${JH_ROLES_LIST.map(r=>`<option value="${r}">${r.replace(/_/g," ")}</option>`).join("")}
          </select>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
        <button id="cuSubmitBtn" class="jh-btn jh-btn-primary" style="padding:9px 22px;">Create Account</button>
        <span style="font-size:12px;color:var(--text-faint);">A confirmation email will be sent to the user.</span>
      </div>
    </div>

    <!-- ── PENDING APPROVALS ───────────────────────────── -->
    ${(users||[]).filter(u=>u.status==="pending").length ? `
    <div class="jh-card" style="margin-bottom:20px;border:1px solid rgba(212,168,87,.3);">
      <div class="jh-section-title" style="margin-bottom:12px;color:var(--gold);">⏳ Pending Approvals (${(users||[]).filter(u=>u.status==="pending").length})</div>
      <table class="jh-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>
          ${(users||[]).filter(u=>u.status==="pending").map(u=>`
          <tr>
            <td>${escapeHtml(u.full_name||"—")}</td>
            <td>${escapeHtml(u.email||"—")}</td>
            <td>${roleBadge(u.role)}</td>
            <td>
              <button class="jh-btn jh-btn-primary approve-btn" data-id="${u.id}" style="padding:5px 12px;font-size:11.5px;margin-right:4px;">Approve</button>
              <button class="jh-btn jh-btn-ghost deactivate-btn" data-id="${u.id}" style="padding:5px 10px;font-size:11.5px;">Reject</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <!-- ── ALL USERS ───────────────────────────────────── -->
    <div class="jh-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div class="jh-section-title" style="margin:0;">All Users (${(users||[]).length})</div>
        <input id="userSearch" class="login-input" placeholder="Search name or email…" style="width:220px;padding:6px 12px;font-size:12.5px;">
      </div>
      <div style="overflow-x:auto;">
      <table class="jh-table" id="usersTable">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${(users||[]).map((u) => `
            <tr data-name="${escapeHtml((u.full_name||"").toLowerCase())}" data-email="${escapeHtml((u.email||"").toLowerCase())}">
              <td>
                <div style="font-weight:600;font-size:13.5px;">${escapeHtml(u.full_name||"—")}</div>
                <div style="font-size:11px;color:var(--text-faint);">${u.id===CURRENT_PROFILE.id?"(you)":""}</div>
              </td>
              <td style="font-size:13px;">${escapeHtml(u.email||"—")}</td>
              <td>
                <select class="login-input role-select" data-id="${u.id}" style="width:auto;padding:4px 8px;font-size:12px;" ${u.id===CURRENT_PROFILE.id?"disabled":""}>
                  ${JH_ROLES_LIST.map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${r.replace(/_/g," ")}</option>`).join("")}
                </select>
              </td>
              <td>${statusBadge(u.status)}</td>
              <td style="white-space:nowrap;">
                <button class="jh-btn jh-btn-ghost edit-btn" data-id="${u.id}" data-name="${escapeHtml(u.full_name||"")}" data-email="${escapeHtml(u.email||"")}" style="padding:4px 9px;font-size:11.5px;margin-right:3px;" title="Edit name/email">✏️</button>
                <button class="jh-btn jh-btn-ghost reset-pw-btn" data-id="${u.id}" style="padding:4px 9px;font-size:11.5px;margin-right:3px;" title="Force password reset">🔑</button>
                ${u.status==="active"
                  ? `<button class="jh-btn jh-btn-ghost deactivate-btn" data-id="${u.id}" style="padding:4px 9px;font-size:11.5px;margin-right:3px;" title="Deactivate">⏸</button>`
                  : `<button class="jh-btn jh-btn-ghost activate-btn" data-id="${u.id}" style="padding:4px 9px;font-size:11.5px;margin-right:3px;" title="Activate / Approve">▶</button>`
                }
                ${u.id!==CURRENT_PROFILE.id?`<button class="jh-btn jh-btn-ghost delete-btn" data-id="${u.id}" data-name="${escapeHtml(u.full_name||u.email||"this user")}" style="padding:4px 9px;font-size:11.5px;color:#ff453a;" title="Delete user">🗑</button>`:""}
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>
    </div>

    <!-- ── EDIT USER MODAL ─────────────────────────────── -->
    <div id="editUserModal" style="display:none;position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.75);backdrop-filter:blur(18px);align-items:center;justify-content:center;padding:24px;">
      <div style="background:rgba(22,22,26,.96);border:1px solid rgba(255,255,255,.14);border-radius:20px;width:min(96%,480px);padding:32px;position:relative;">
        <button id="editModalClose" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:50%;width:34px;height:34px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
        <div style="font-size:16px;font-weight:700;margin-bottom:20px;">Edit User</div>
        <input type="hidden" id="editUserId">
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-faint);display:block;margin-bottom:4px;">Full Name</label>
          <input id="editUserName" class="login-input" style="width:100%;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:20px;">
          <label style="font-size:12px;color:var(--text-faint);display:block;margin-bottom:4px;">Email Address</label>
          <input id="editUserEmail" class="login-input" type="email" style="width:100%;box-sizing:border-box;">
        </div>
        <div id="editUserMsg" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:10px;font-size:13px;"></div>
        <button id="editUserSave" class="jh-btn jh-btn-primary" style="width:100%;padding:11px;">Save Changes</button>
      </div>
    </div>
  `;

  /* ---- Search filter ---- */
  document.getElementById("userSearch").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll("#usersTable tbody tr").forEach(tr => {
      tr.style.display = (!q || tr.dataset.name.includes(q) || tr.dataset.email.includes(q)) ? "" : "none";
    });
  });

  /* ---- Create User ---- */
  document.getElementById("cuSubmitBtn").addEventListener("click", async () => {
    const name  = document.getElementById("cuName").value.trim();
    const email = document.getElementById("cuEmail").value.trim();
    const pw    = document.getElementById("cuPassword").value;
    const role  = document.getElementById("cuRole").value;
    const msgEl = document.getElementById("createUserMsg");
    const btn   = document.getElementById("cuSubmitBtn");

    if (!name || !email || !pw) { showMsg(msgEl, "Please fill in all required fields.", false); return; }
    if (pw.length < 8)          { showMsg(msgEl, "Password must be at least 8 characters.", false); return; }

    btn.disabled = true; btn.textContent = "Creating…";
    msgEl.style.display = "none";

    /* ------------------------------------------------------------
       IMPORTANT: This calls a server-side Edge Function, NOT
       sb.auth.signUp(). signUp() signs the CURRENT BROWSER in as
       the newly created user, which would log the Super Admin out
       of their own session every time they create someone — that
       was the previous (broken) behavior here.

       The Edge Function uses the service-role key (server-side
       only) to call the Admin API instead, which creates the auth
       user AND the profile row without affecting the caller's
       session at all. See:
       /supabase/functions/admin-create-user/index.ts
       ------------------------------------------------------------ */
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      showMsg(msgEl, "Your session has expired — please refresh and log in again.", false);
      btn.disabled = false; btn.textContent = "Create Account";
      return;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name, email, password: pw, role }),
      });
      const result = await res.json();

      if (!res.ok || result.error) {
        showMsg(msgEl, result.error || "Failed to create account.", false);
        btn.disabled = false; btn.textContent = "Create Account";
        return;
      }

      showMsg(msgEl, `✅ Account created for ${name} (${role.replace(/_/g," ")}). They must change their password on first login.`, true);
      document.getElementById("cuName").value = "";
      document.getElementById("cuEmail").value = "";
      document.getElementById("cuPassword").value = "";
      setTimeout(() => renderUsers(content), 1800);
    } catch (err) {
      showMsg(msgEl, "Network error contacting admin-create-user function: " + err.message, false);
    }
    btn.disabled = false; btn.textContent = "Create Account";
  });

  /* ---- Role change ---- */
  content.querySelectorAll(".role-select").forEach((sel) => sel.addEventListener("change", async () => {
    await sb.from("profiles").update({ role: sel.value }).eq("id", sel.dataset.id);
    await logActivity("user.role_changed", "profiles", sel.dataset.id, { new_role: sel.value });
  }));

  /* ---- Approve (pending → active) ---- */
  content.querySelectorAll(".approve-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ status: "active" }).eq("id", btn.dataset.id);
    await logActivity("user.approved", "profiles", btn.dataset.id);
    renderUsers(content);
  }));

  /* ---- Activate ---- */
  content.querySelectorAll(".activate-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ status: "active" }).eq("id", btn.dataset.id);
    await logActivity("user.activated", "profiles", btn.dataset.id);
    renderUsers(content);
  }));

  /* ---- Deactivate ---- */
  content.querySelectorAll(".deactivate-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ status: "inactive" }).eq("id", btn.dataset.id);
    await logActivity("user.deactivated", "profiles", btn.dataset.id);
    renderUsers(content);
  }));

  /* ---- Force password reset ---- */
  content.querySelectorAll(".reset-pw-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ must_change_password: true }).eq("id", btn.dataset.id);
    await logActivity("user.forced_password_reset", "profiles", btn.dataset.id);
    alert("✅ Done — that user must set a new password on their next login.");
  }));

  /* ---- Delete user ---- */
  content.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm(`Delete "${btn.dataset.name}"?\n\nThis removes them from the profiles table. Their Supabase Auth account remains (sign in to Supabase Auth to remove it) but they will lose all portal access immediately.`)) return;
    await sb.from("profiles").delete().eq("id", btn.dataset.id);
    await logActivity("user.deleted", "profiles", btn.dataset.id);
    renderUsers(content);
  }));

  /* ---- Edit user (name + email in profiles) ---- */
  const editModal = document.getElementById("editUserModal");
  content.querySelectorAll(".edit-btn").forEach((btn) => btn.addEventListener("click", () => {
    document.getElementById("editUserId").value   = btn.dataset.id;
    document.getElementById("editUserName").value  = btn.dataset.name;
    document.getElementById("editUserEmail").value = btn.dataset.email;
    document.getElementById("editUserMsg").style.display = "none";
    editModal.style.display = "flex";
  }));
  document.getElementById("editModalClose").addEventListener("click", () => { editModal.style.display = "none"; });
  document.getElementById("editUserSave").addEventListener("click", async () => {
    const id    = document.getElementById("editUserId").value;
    const name  = document.getElementById("editUserName").value.trim();
    const email = document.getElementById("editUserEmail").value.trim();
    const msgEl = document.getElementById("editUserMsg");
    if (!name || !email) { showMsg(msgEl, "Name and email are required.", false); return; }
    const { error } = await sb.from("profiles").update({ full_name: name, email }).eq("id", id);
    if (error) { showMsg(msgEl, "Error: " + error.message, false); return; }
    await logActivity("user.edited", "profiles", id, { full_name: name, email });
    editModal.style.display = "none";
    renderUsers(content);
  });
}

function showMsg(el, text, success) {
  el.style.display = "block";
  el.style.background = success ? "rgba(48,209,88,.15)" : "rgba(255,69,58,.15)";
  el.style.border = `1px solid ${success ? "rgba(48,209,88,.3)" : "rgba(255,69,58,.3)"}`;
  el.style.color = success ? "#30d158" : "#ff453a";
  el.textContent = text;
}

/* ---------------------------------------------------------- */
async function renderAcademic(content) {
  const [{ data: classes }, { data: sections }, { data: batches }] = await Promise.all([
    sb.from("classes").select("*").order("display_order"),
    sb.from("sections").select("*, classes(name)").order("name"),
    sb.from("batches").select("*").order("label"),
  ]);

  content.innerHTML = `
    <div class="jh-grid jh-grid-2" style="margin-bottom:20px;">
      <div class="jh-card">
        <div class="jh-section-title">Classes</div>
        <form id="addClassForm" style="display:flex;gap:8px;margin-bottom:14px;">
          <input id="newClassName" class="login-input" placeholder="e.g. 1st PUC" required>
          <button class="jh-btn jh-btn-primary" type="submit" style="white-space:nowrap;">Add</button>
        </form>
        ${(classes || []).map((c) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px;">${escapeHtml(c.name)}<button class="jh-btn jh-btn-ghost del-class-btn" data-id="${c.id}" style="padding:3px 8px;font-size:11px;">Delete</button></div>`).join("")}
      </div>
      <div class="jh-card">
        <div class="jh-section-title">Batches</div>
        <form id="addBatchForm" style="display:flex;gap:8px;margin-bottom:14px;">
          <input id="newBatchLabel" class="login-input" placeholder="e.g. 2027" required>
          <button class="jh-btn jh-btn-primary" type="submit" style="white-space:nowrap;">Add</button>
        </form>
        ${(batches || []).map((b) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px;">${escapeHtml(b.label)}<button class="jh-btn jh-btn-ghost del-batch-btn" data-id="${b.id}" style="padding:3px 8px;font-size:11px;">Delete</button></div>`).join("")}
      </div>
    </div>
    <div class="jh-card">
      <div class="jh-section-title">Sections</div>
      <form id="addSectionForm" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
        <select id="newSectionClass" class="login-input" style="flex:1;min-width:140px;">
          ${(classes || []).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
        </select>
        <input id="newSectionName" class="login-input" placeholder="e.g. Science A" style="flex:1;min-width:140px;" required>
        <button class="jh-btn jh-btn-primary" type="submit" style="white-space:nowrap;">Add</button>
      </form>
      <table class="jh-table">
        <thead><tr><th>Class</th><th>Section</th><th></th></tr></thead>
        <tbody>${(sections || []).map((s) => `<tr><td>${escapeHtml(s.classes?.name || "—")}</td><td>${escapeHtml(s.name)}</td><td><button class="jh-btn jh-btn-ghost del-section-btn" data-id="${s.id}" style="padding:4px 9px;font-size:11px;">Delete</button></td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;

  document.getElementById("addClassForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await sb.from("classes").insert({ name: document.getElementById("newClassName").value.trim() });
    await logActivity("class.created");
    renderAcademic(content);
  });
  document.getElementById("addBatchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await sb.from("batches").insert({ label: document.getElementById("newBatchLabel").value.trim() });
    await logActivity("batch.created");
    renderAcademic(content);
  });
  document.getElementById("addSectionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await sb.from("sections").insert({ class_id: document.getElementById("newSectionClass").value, name: document.getElementById("newSectionName").value.trim() });
    await logActivity("section_academic.created");
    renderAcademic(content);
  });
  content.querySelectorAll(".del-class-btn").forEach((b) => b.addEventListener("click", async () => { await sb.from("classes").delete().eq("id", b.dataset.id); renderAcademic(content); }));
  content.querySelectorAll(".del-batch-btn").forEach((b) => b.addEventListener("click", async () => { await sb.from("batches").delete().eq("id", b.dataset.id); renderAcademic(content); }));
  content.querySelectorAll(".del-section-btn").forEach((b) => b.addEventListener("click", async () => { await sb.from("sections").delete().eq("id", b.dataset.id); renderAcademic(content); }));
}

/* ---------------------------------------------------------- */
async function renderSections(content) {
  const { data: sections } = await sb.from("homepage_sections").select("*").order("display_order");

  content.innerHTML = `
    <div style="margin-bottom:16px;">
      <button class="jh-btn jh-btn-primary" id="newSectionBtn">+ Create New Section</button>
    </div>
    <div class="jh-card">
      ${sections && sections.length ? `<table class="jh-table">
        <thead><tr><th>Order</th><th>Name</th><th>Layout</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${sections.map((s, i) => `
            <tr data-id="${s.id}">
              <td>
                <button class="jh-btn jh-btn-ghost move-up-btn" data-id="${s.id}" style="padding:3px 7px;font-size:11px;" ${i === 0 ? "disabled" : ""}>↑</button>
                <button class="jh-btn jh-btn-ghost move-down-btn" data-id="${s.id}" style="padding:3px 7px;font-size:11px;" ${i === sections.length - 1 ? "disabled" : ""}>↓</button>
              </td>
              <td>${escapeHtml(s.name)}</td>
              <td style="text-transform:capitalize;">${escapeHtml(s.layout)}</td>
              <td>
                ${s.is_published ? (s.is_hidden ? '<span class="jh-badge jh-badge-gray">Hidden</span>' : '<span class="jh-badge jh-badge-green">Live</span>') : '<span class="jh-badge jh-badge-gold">Draft</span>'}
              </td>
              <td>
                <button class="jh-btn jh-btn-ghost toggle-publish-btn" data-id="${s.id}" data-val="${s.is_published}" style="padding:4px 9px;font-size:11px;">${s.is_published ? "Unpublish" : "Publish"}</button>
                <button class="jh-btn jh-btn-ghost toggle-hide-btn" data-id="${s.id}" data-val="${s.is_hidden}" style="padding:4px 9px;font-size:11px;">${s.is_hidden ? "Show" : "Hide"}</button>
                <button class="jh-btn jh-btn-ghost del-section-btn2" data-id="${s.id}" style="padding:4px 9px;font-size:11px;">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>` : `<div class="jh-empty">No sections yet. Click "Create New Section" or use the + button.</div>`}
    </div>
  `;

  document.getElementById("newSectionBtn").addEventListener("click", () => {
    if (typeof routeWizardAction === "function") {
      WIZARD_STATE = { action: "create_section", step: 1, data: { images: [] } };
      wizardCreateSectionStep1();
    }
  });

  content.querySelectorAll(".move-up-btn, .move-down-btn").forEach((btn) => btn.addEventListener("click", async () => {
    const id = btn.dataset.id;
    const idx = sections.findIndex((s) => s.id === id);
    const swapIdx = btn.classList.contains("move-up-btn") ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const a = sections[idx], b = sections[swapIdx];
    await Promise.all([
      sb.from("homepage_sections").update({ display_order: b.display_order }).eq("id", a.id),
      sb.from("homepage_sections").update({ display_order: a.display_order }).eq("id", b.id),
    ]);
    renderSections(content);
  }));

  content.querySelectorAll(".toggle-publish-btn").forEach((btn) => btn.addEventListener("click", async () => {
    const newVal = btn.dataset.val !== "true";
    await sb.from("homepage_sections").update({ is_published: newVal }).eq("id", btn.dataset.id);
    await logActivity(newVal ? "section.published" : "section.unpublished", "homepage_sections", btn.dataset.id);
    renderSections(content);
  }));
  content.querySelectorAll(".toggle-hide-btn").forEach((btn) => btn.addEventListener("click", async () => {
    const newVal = btn.dataset.val !== "true";
    await sb.from("homepage_sections").update({ is_hidden: newVal }).eq("id", btn.dataset.id);
    await logActivity(newVal ? "section.hidden" : "section.shown", "homepage_sections", btn.dataset.id);
    renderSections(content);
  }));
  content.querySelectorAll(".del-section-btn2").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Delete this section and all its content? This cannot be undone.")) return;
    await sb.from("homepage_sections").delete().eq("id", btn.dataset.id);
    await logActivity("section.deleted", "homepage_sections", btn.dataset.id);
    renderSections(content);
  }));
}

/* ---------------------------------------------------------- */
async function renderMedia(content) {
  const { data: media } = await sb.from("media_library").select("*").order("created_at", { ascending: false });

  const totalBytes = (media || []).reduce((s, m) => s + (m.size_bytes || 0), 0);
  const imageBytes = (media || []).filter((m) => m.media_type === "image").reduce((s, m) => s + (m.size_bytes || 0), 0);
  const pdfBytes = (media || []).filter((m) => m.media_type === "pdf").reduce((s, m) => s + (m.size_bytes || 0), 0);

  // Storage dashboard assumes a soft plan ceiling for warning color purposes.
  // Adjust JH_STORAGE_PLAN_BYTES below to match your actual Supabase plan quota.
  const planBytes = JH_STORAGE_PLAN_BYTES;
  const usedPct = Math.min(100, (totalBytes / planBytes) * 100);
  const warnLevel = usedPct >= 95 ? "red" : usedPct >= 85 ? "gold" : usedPct >= 70 ? "gold" : "green";

  content.innerHTML = `
    <div class="jh-card" style="margin-bottom:20px;">
      <div class="jh-section-title">Storage Dashboard</div>
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-dim);margin-bottom:8px;">
        <span>${formatBytes(totalBytes)} used of ${formatBytes(planBytes)} (estimate, based on CMS uploads)</span>
        <span>${usedPct.toFixed(1)}%</span>
      </div>
      <div style="height:8px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden;">
        <div style="height:100%;width:${usedPct}%;background:${warnLevel === "red" ? "var(--red)" : "var(--gold)"};"></div>
      </div>
      ${usedPct >= 70 ? `<div style="margin-top:10px;font-size:12px;color:${usedPct >= 95 ? "var(--red)" : "var(--gold)"};">${usedPct >= 95 ? "⚠ Critical: storage nearly full." : usedPct >= 85 ? "⚠ Storage usage is high." : "Note: storage usage has crossed 70%."}</div>` : ""}
      <div class="jh-grid jh-grid-2" style="margin-top:18px;">
        <div style="font-size:13px;"><span style="color:var(--text-dim);">Image Storage:</span> <strong>${formatBytes(imageBytes)}</strong></div>
        <div style="font-size:13px;"><span style="color:var(--text-dim);">PDF Storage:</span> <strong>${formatBytes(pdfBytes)}</strong></div>
      </div>
      <p style="color:var(--text-faint);font-size:11px;margin-top:10px;">
        These totals reflect files uploaded through this CMS (tracked in the media library index) — they are not a live read of Supabase Storage account-wide usage.
      </p>
    </div>

    <div class="jh-card" style="margin-bottom:20px;max-width:480px;">
      <div class="jh-section-title">Upload File</div>
      <div id="mediaMsg" class="login-msg"></div>
      <div class="jh-dropzone" id="mediaDropzone">Click or drag an image/PDF here (max 5MB)</div>
      <input type="file" id="mediaFileInput" accept="image/*,application/pdf" style="display:none;">
    </div>

    <div class="jh-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div class="jh-section-title" style="margin:0;">All Files</div>
        <input id="mediaSearch" class="login-input" placeholder="Search by file name…" style="width:220px;">
      </div>
      <div id="mediaList"></div>
    </div>
  `;

  function renderMediaList(filterText) {
    const filtered = (media || []).filter((m) => !filterText || m.file_name.toLowerCase().includes(filterText.toLowerCase()));
    document.getElementById("mediaList").innerHTML = filtered.length ? `
      <table class="jh-table">
        <thead><tr><th></th><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
        <tbody>
          ${filtered.map((m) => `
            <tr>
              <td>${m.media_type === "image" ? `<img src="${m.file_url}" style="width:34px;height:34px;border-radius:6px;object-fit:cover;">` : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/></svg>'}</td>
              <td>${escapeHtml(m.file_name)}</td>
              <td style="text-transform:capitalize;">${m.media_type}</td>
              <td>${formatBytes(m.size_bytes || 0)}</td>
              <td>${jhFormatDate(m.created_at)}</td>
              <td><a href="${m.file_url}" target="_blank" class="jh-btn jh-btn-ghost" style="padding:4px 9px;font-size:11px;">View</a> <button class="jh-btn jh-btn-ghost del-media-btn" data-id="${m.id}" style="padding:4px 9px;font-size:11px;">Delete</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    ` : `<div class="jh-empty">No files match.</div>`;

    document.querySelectorAll(".del-media-btn").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Delete this file's record? (The underlying storage file should be removed from Supabase Storage separately if no longer referenced.)")) return;
      await sb.from("media_library").delete().eq("id", btn.dataset.id);
      await logActivity("media.deleted", "media_library", btn.dataset.id);
      renderMedia(content);
    }));
  }
  renderMediaList("");

  document.getElementById("mediaSearch").addEventListener("input", (e) => renderMediaList(e.target.value));

  const dz = document.getElementById("mediaDropzone");
  const input = document.getElementById("mediaFileInput");
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const msg = document.getElementById("mediaMsg");
    const file = input.files[0];
    try {
      msg.className = "login-msg show"; msg.textContent = "Uploading…";
      const bucket = file.type === "application/pdf" ? "documents" : "media";
      await jhUploadMedia(file, bucket, "library", CURRENT_PROFILE.id);
      await logActivity("media.uploaded");
      renderMedia(content);
    } catch (err) {
      msg.className = "login-msg show error"; msg.textContent = err.message;
    }
  });
}

// Soft plan ceiling used only for the storage dashboard's progress bar / warning
// colors. This is NOT pulled live from Supabase — update it to match your
// actual plan's storage quota (Free tier is 1GB; Pro is 100GB at time of writing).
const JH_STORAGE_PLAN_BYTES = 1 * 1024 * 1024 * 1024;

/* ---------------------------------------------------------- */
async function renderLogs(content) {
  const { data } = await sb.from("activity_logs").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(150);

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? `<table class="jh-table">
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th></tr></thead>
        <tbody>${data.map((l) => `<tr><td>${new Date(l.created_at).toLocaleString("en-IN")}</td><td>${escapeHtml(l.profiles?.full_name || "—")}</td><td>${escapeHtml(l.action)}</td></tr>`).join("")}</tbody>
      </table>` : `<div class="jh-empty">No activity recorded yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderSettings(content) {
  content.innerHTML = `
    <div class="jh-card" style="max-width:560px;">
      <div class="jh-section-title">Change Password</div>
      <div id="settingsMsg" class="login-msg"></div>
      <form id="pwChangeForm">
        <div class="login-field"><label>New Password</label><input type="password" id="newPw" class="login-input" minlength="8" required></div>
        <div class="login-field"><label>Confirm New Password</label><input type="password" id="confirmPw" class="login-input" minlength="8" required></div>
        <button type="submit" class="jh-btn jh-btn-primary">Update Password</button>
      </form>
    </div>
  `;

  document.getElementById("pwChangeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("settingsMsg");
    const pw1 = document.getElementById("newPw").value;
    const pw2 = document.getElementById("confirmPw").value;
    if (pw1 !== pw2) { msg.className = "login-msg show error"; msg.textContent = "Passwords do not match."; return; }
    const result = await jhUpdatePassword(pw1);
    if (!result.success) { msg.className = "login-msg show error"; msg.textContent = result.error; return; }
    msg.className = "login-msg show success"; msg.textContent = "Password updated.";
    document.getElementById("pwChangeForm").reset();
  });
}

/* ---------------------------------------------------------- */
async function renderProfile(content) {
  const p = CURRENT_PROFILE;
  content.innerHTML = `
    <div class="jh-card" style="max-width:560px;">
      <div class="jh-section-title">Account Details</div>
      ${profileRow("Full Name", p.full_name)}
      ${profileRow("Email", p.email)}
      ${profileRow("Role", "Super Admin")}
      ${profileRow("Status", `<span class="jh-badge jh-badge-green">${p.status}</span>`, true)}
    </div>
  `;
}

function profileRow(label, value, isHtml) {
  return `<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line);font-size:13.5px;"><span style="color:var(--text-dim);">${label}</span><span style="font-weight:600;">${isHtml ? value : escapeHtml(String(value))}</span></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
