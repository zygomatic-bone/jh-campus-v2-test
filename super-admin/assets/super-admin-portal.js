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
async function renderUsers(content) {
  const { data: users } = await sb.from("profiles").select("*").order("created_at", { ascending: false });

  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;margin-bottom:20px;">
      <div class="jh-section-title">Create User</div>
      <p style="color:var(--text-faint);font-size:12px;margin-bottom:14px;">
        New accounts must be created via Supabase Auth (Dashboard → Authentication → Add User) for security —
        passwords are never set through this interface. After creating the auth user, assign their role here.
      </p>
    </div>
    <div class="jh-card">
      <table class="jh-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${(users || []).map((u) => `
            <tr>
              <td>${escapeHtml(u.full_name)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td>
                <select class="login-input role-select" data-id="${u.id}" style="width:auto;padding:5px 8px;font-size:12px;" ${u.id === CURRENT_PROFILE.id ? "disabled" : ""}>
                  ${["student","teacher","principal","trust_member","admin","super_admin"].map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${r.replace("_"," ")}</option>`).join("")}
                </select>
              </td>
              <td>${u.status === "active" ? '<span class="jh-badge jh-badge-green">Active</span>' : u.status === "pending" ? '<span class="jh-badge jh-badge-gold">Pending</span>' : '<span class="jh-badge jh-badge-gray">Inactive</span>'}</td>
              <td>
                <button class="jh-btn jh-btn-ghost reset-pw-btn" data-id="${u.id}" style="padding:5px 10px;font-size:11.5px;margin-right:4px;">Force Reset</button>
                ${u.status === "active"
                  ? `<button class="jh-btn jh-btn-ghost deactivate-btn" data-id="${u.id}" style="padding:5px 10px;font-size:11.5px;">Deactivate</button>`
                  : `<button class="jh-btn jh-btn-ghost activate-btn" data-id="${u.id}" style="padding:5px 10px;font-size:11.5px;">Activate</button>`
                }
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;

  content.querySelectorAll(".role-select").forEach((sel) => sel.addEventListener("change", async () => {
    await sb.from("profiles").update({ role: sel.value }).eq("id", sel.dataset.id);
    await logActivity("user.role_changed", "profiles", sel.dataset.id, { new_role: sel.value });
  }));
  content.querySelectorAll(".activate-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ status: "active" }).eq("id", btn.dataset.id);
    await logActivity("user.activated", "profiles", btn.dataset.id);
    renderUsers(content);
  }));
  content.querySelectorAll(".deactivate-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ status: "inactive" }).eq("id", btn.dataset.id);
    await logActivity("user.deactivated", "profiles", btn.dataset.id);
    renderUsers(content);
  }));
  content.querySelectorAll(".reset-pw-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ must_change_password: true }).eq("id", btn.dataset.id);
    await logActivity("user.forced_password_reset", "profiles", btn.dataset.id);
    alert("That user will be required to set a new password on their next login.");
  }));
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
