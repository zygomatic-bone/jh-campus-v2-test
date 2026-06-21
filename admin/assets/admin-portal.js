/* ============================================================
   JH+ ADMIN PORTAL — logic
   ============================================================ */

let CURRENT_PROFILE = null;

const VIEW_META = {
  dashboard: { title: "Dashboard", sub: "Content and operations overview." },
  approvals: { title: "Approvals", sub: "Review pending content submissions." },
  gallery: { title: "Gallery", sub: "Manage public photo gallery." },
  downloads: { title: "Downloads", sub: "Manage shared school-wide resources." },
  announcements: { title: "Announcements", sub: "Post updates — optionally to the public homepage." },
  requests: { title: "User Requests", sub: "Pending account approvals (Google sign-ups)." },
  logs: { title: "Activity Logs", sub: "Recent system activity." },
  profile: { title: "Profile", sub: "Your account details." },
};

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await authGuard(["admin"]);
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
      case "approvals": return renderApprovals(content);
      case "gallery": return renderGallery(content);
      case "downloads": return renderDownloads(content);
      case "announcements": return renderAnnouncements(content);
      case "requests": return renderRequests(content);
      case "logs": return renderLogs(content);
      case "profile": return renderProfile(content);
    }
  } catch (err) {
    console.error("[Admin Portal] error:", err);
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">Something went wrong loading this section.</div></div>`;
  }
}

async function logActivity(action, targetTable, targetId, details) {
  await sb.from("activity_logs").insert({
    actor_id: CURRENT_PROFILE.id,
    action,
    target_table: targetTable || null,
    target_id: targetId || null,
    details: details || null,
  });
}

/* ---------------------------------------------------------- */
async function renderDashboard(content) {
  const [{ count: pendingApprovals }, { count: pendingUsers }, { count: galleryCount }] = await Promise.all([
    sb.from("content_approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("gallery_items").select("id", { count: "exact", head: true }),
  ]);

  content.innerHTML = `
    <div class="jh-grid jh-grid-3">
      ${statCard("Pending Approvals", pendingApprovals || 0, '<path d="M9 11l3 3L22 4"/>')}
      ${statCard("Pending User Requests", pendingUsers || 0, '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>')}
      ${statCard("Gallery Items", galleryCount || 0, '<rect x="3" y="3" width="18" height="18" rx="2"/>')}
    </div>
  `;
}

function statCard(label, value, icon) {
  return `<div class="jh-card jh-stat"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div><div class="value">${value}</div><div class="label">${label}</div></div>`;
}

/* ---------------------------------------------------------- */
async function renderApprovals(content) {
  const { data } = await sb.from("content_approvals").select("*, profiles!content_approvals_submitted_by_fkey(full_name)").eq("status", "pending").order("created_at", { ascending: false });

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? `<table class="jh-table">
        <thead><tr><th>Type</th><th>Submitted By</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>${data.map((a) => `
          <tr>
            <td>${escapeHtml(a.target_table)}</td>
            <td>${escapeHtml(a.profiles?.full_name || "—")}</td>
            <td>${jhFormatDate(a.created_at)}</td>
            <td>
              <button class="jh-btn jh-btn-primary approve-btn" data-id="${a.id}" style="padding:6px 12px;font-size:12px;margin-right:6px;">Approve</button>
              <button class="jh-btn jh-btn-ghost reject-btn" data-id="${a.id}" style="padding:6px 12px;font-size:12px;">Reject</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>` : `<div class="jh-empty">No pending approvals.</div>`}
    </div>
  `;

  content.querySelectorAll(".approve-btn").forEach((btn) => btn.addEventListener("click", () => reviewApproval(btn.dataset.id, "approved", content)));
  content.querySelectorAll(".reject-btn").forEach((btn) => btn.addEventListener("click", () => reviewApproval(btn.dataset.id, "rejected", content)));
}

async function reviewApproval(id, status, content) {
  await sb.from("content_approvals").update({ status, reviewed_by: CURRENT_PROFILE.id, reviewed_at: new Date().toISOString() }).eq("id", id);
  await logActivity(`approval.${status}`, "content_approvals", id);
  renderApprovals(content);
}

/* ---------------------------------------------------------- */
async function renderGallery(content) {
  const { data } = await sb.from("gallery_items").select("*").order("display_order");

  content.innerHTML = `
    <div class="jh-card" style="max-width:600px;margin-bottom:20px;">
      <div class="jh-section-title">Add Photo</div>
      <div id="galMsg" class="login-msg"></div>
      <form id="galForm">
        <div class="login-field"><label>Title</label><input type="text" id="galTitle" class="login-input"></div>
        <div class="login-field"><label>Image URL</label><input type="url" id="galUrl" class="login-input" placeholder="https://..." required></div>
        <div class="login-field"><label>Caption</label><input type="text" id="galCaption" class="login-input"></div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);margin-bottom:14px;">
          <input type="checkbox" id="galPublish" checked> Publish immediately
        </label>
        <button type="submit" class="jh-btn jh-btn-primary">Add to Gallery</button>
      </form>
    </div>
    <div class="jh-grid jh-grid-4" id="galGrid">
      ${(data || []).map((g) => `
        <div class="jh-card" style="padding:0;overflow:hidden;">
          <img src="${g.image_url}" style="width:100%;height:120px;object-fit:cover;display:block;" alt="">
          <div style="padding:12px;">
            <div style="font-weight:600;font-size:13px;">${escapeHtml(g.title || "Untitled")}</div>
            <div style="margin-top:8px;display:flex;gap:6px;">
              <span class="jh-badge ${g.is_published ? "jh-badge-green" : "jh-badge-gray"}">${g.is_published ? "Published" : "Draft"}</span>
              <button class="jh-btn jh-btn-ghost del-gallery-btn" data-id="${g.id}" style="padding:3px 8px;font-size:11px;margin-left:auto;">Delete</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  document.getElementById("galForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("galMsg");
    const { error } = await sb.from("gallery_items").insert({
      title: document.getElementById("galTitle").value.trim() || null,
      image_url: document.getElementById("galUrl").value.trim(),
      caption: document.getElementById("galCaption").value.trim() || null,
      is_published: document.getElementById("galPublish").checked,
      uploaded_by: CURRENT_PROFILE.id,
    });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; }
    else { await logActivity("gallery.created"); renderGallery(content); }
  });

  content.querySelectorAll(".del-gallery-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("gallery_items").delete().eq("id", btn.dataset.id);
    await logActivity("gallery.deleted", "gallery_items", btn.dataset.id);
    renderGallery(content);
  }));
}

/* ---------------------------------------------------------- */
async function renderDownloads(content) {
  const { data } = await sb.from("downloads").select("*, classes(name)").order("created_at", { ascending: false });

  content.innerHTML = `
    <div class="jh-card" style="max-width:600px;margin-bottom:20px;">
      <div class="jh-section-title">Add Download</div>
      <div id="dlMsg" class="login-msg"></div>
      <form id="dlForm">
        <div class="login-field"><label>Title</label><input type="text" id="dlTitle" class="login-input" required></div>
        <div class="login-field"><label>Description</label><input type="text" id="dlDesc" class="login-input"></div>
        <div class="login-field"><label>File URL</label><input type="url" id="dlFile" class="login-input" required placeholder="https://..."></div>
        <button type="submit" class="jh-btn jh-btn-primary">Add Download</button>
      </form>
    </div>
    <div class="jh-card">
      ${data && data.length ? `<table class="jh-table">
        <thead><tr><th>Title</th><th>Scope</th><th></th></tr></thead>
        <tbody>${data.map((d) => `<tr><td>${escapeHtml(d.title)}</td><td>${escapeHtml(d.classes?.name || "Everyone")}</td><td><button class="jh-btn jh-btn-ghost del-dl-btn" data-id="${d.id}" style="padding:5px 10px;font-size:12px;">Delete</button></td></tr>`).join("")}</tbody>
      </table>` : `<div class="jh-empty">No downloads yet.</div>`}
    </div>
  `;

  document.getElementById("dlForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("dlMsg");
    const { error } = await sb.from("downloads").insert({
      title: document.getElementById("dlTitle").value.trim(),
      description: document.getElementById("dlDesc").value.trim() || null,
      file_url: document.getElementById("dlFile").value.trim(),
      uploaded_by: CURRENT_PROFILE.id,
    });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; }
    else { await logActivity("download.created"); renderDownloads(content); }
  });

  content.querySelectorAll(".del-dl-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("downloads").delete().eq("id", btn.dataset.id);
    await logActivity("download.deleted", "downloads", btn.dataset.id);
    renderDownloads(content);
  }));
}

/* ---------------------------------------------------------- */
async function renderAnnouncements(content) {
  const { data } = await sb.from("announcements").select("*").order("created_at", { ascending: false });

  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;margin-bottom:20px;">
      <div class="jh-section-title">Post Announcement</div>
      <div id="annMsg" class="login-msg"></div>
      <form id="annForm">
        <div class="login-field"><label>Title</label><input type="text" id="annTitle" class="login-input" required></div>
        <div class="login-field"><label>Message</label><textarea id="annBody" class="login-input" rows="3" style="resize:vertical;" required></textarea></div>
        <div class="login-field"><label>Audience</label>
          <select id="annAudience" class="login-input">
            <option value="all">Everyone (logged in)</option>
            <option value="students">Students</option>
            <option value="teachers">Teachers</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);margin-bottom:14px;">
          <input type="checkbox" id="annPublic"> Also show on public homepage
        </label>
        <button type="submit" class="jh-btn jh-btn-primary">Post Announcement</button>
      </form>
    </div>
    <div class="jh-card">
      ${data && data.length ? data.map((a) => `
        <div style="padding:12px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:start;gap:12px;">
          <div>
            <div style="font-weight:600;">${escapeHtml(a.title)} ${a.is_public ? '<span class="jh-badge jh-badge-gold">Public</span>' : ""}</div>
            <div style="color:var(--text-dim);font-size:13px;margin-top:3px;">${escapeHtml(a.body)}</div>
          </div>
          <button class="jh-btn jh-btn-ghost del-ann-btn" data-id="${a.id}" style="padding:5px 10px;font-size:12px;flex-shrink:0;">Delete</button>
        </div>
      `).join("") : `<div class="jh-empty">No announcements yet.</div>`}
    </div>
  `;

  document.getElementById("annForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("annMsg");
    const { error } = await sb.from("announcements").insert({
      title: document.getElementById("annTitle").value.trim(),
      body: document.getElementById("annBody").value.trim(),
      audience: document.getElementById("annAudience").value,
      is_public: document.getElementById("annPublic").checked,
      created_by: CURRENT_PROFILE.id,
    });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; }
    else { await logActivity("announcement.created"); renderAnnouncements(content); }
  });

  content.querySelectorAll(".del-ann-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("announcements").delete().eq("id", btn.dataset.id);
    await logActivity("announcement.deleted", "announcements", btn.dataset.id);
    renderAnnouncements(content);
  }));
}

/* ---------------------------------------------------------- */
async function renderRequests(content) {
  const { data } = await sb.from("profiles").select("*").eq("status", "pending").order("created_at", { ascending: false });

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? `<table class="jh-table">
        <thead><tr><th>Name</th><th>Email</th><th>Requested Role</th><th>Signed up via</th><th>Actions</th></tr></thead>
        <tbody>${data.map((u) => `
          <tr>
            <td>${escapeHtml(u.full_name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td style="text-transform:capitalize;">${escapeHtml(u.role.replace("_"," "))}</td>
            <td>${escapeHtml(u.auth_provider)}</td>
            <td>
              <button class="jh-btn jh-btn-primary approve-user-btn" data-id="${u.id}" style="padding:6px 12px;font-size:12px;margin-right:6px;">Activate</button>
              <button class="jh-btn jh-btn-ghost reject-user-btn" data-id="${u.id}" style="padding:6px 12px;font-size:12px;">Reject</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>` : `<div class="jh-empty">No pending user requests.</div>`}
    </div>
  `;

  content.querySelectorAll(".approve-user-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ status: "active" }).eq("id", btn.dataset.id);
    await logActivity("user.activated", "profiles", btn.dataset.id);
    renderRequests(content);
  }));
  content.querySelectorAll(".reject-user-btn").forEach((btn) => btn.addEventListener("click", async () => {
    await sb.from("profiles").update({ status: "inactive" }).eq("id", btn.dataset.id);
    await logActivity("user.rejected", "profiles", btn.dataset.id);
    renderRequests(content);
  }));
}

/* ---------------------------------------------------------- */
async function renderLogs(content) {
  const { data } = await sb.from("activity_logs").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(100);

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
async function renderProfile(content) {
  const p = CURRENT_PROFILE;
  content.innerHTML = `
    <div class="jh-card" style="max-width:560px;">
      <div class="jh-section-title">Account Details</div>
      ${profileRow("Full Name", p.full_name)}
      ${profileRow("Email", p.email)}
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
