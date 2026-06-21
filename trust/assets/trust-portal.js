/* ============================================================
   JH+ TRUST PORTAL — logic
   Strictly read-only. No insert/update/delete anywhere in this
   file by design — trust_member has no write policies in RLS,
   and the UI deliberately mirrors that (no forms, no buttons
   that would only fail).
   ============================================================ */

let CURRENT_PROFILE = null;

const VIEW_META = {
  dashboard: { title: "Dashboard", sub: "School-wide overview (read-only)." },
  reports: { title: "Reports", sub: "Exam and academic reports." },
  analytics: { title: "Analytics", sub: "Attendance and performance analytics." },
  users: { title: "Users", sub: "Staff and student directory." },
  profile: { title: "Profile", sub: "Your account details." },
};

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await authGuard(["trust_member"]);
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
      case "reports": return renderReports(content);
      case "analytics": return renderAnalytics(content);
      case "users": return renderUsers(content);
      case "profile": return renderProfile(content);
    }
  } catch (err) {
    console.error("[Trust Portal] error:", err);
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">Something went wrong loading this section.</div></div>`;
  }
}

/* ---------------------------------------------------------- */
async function renderDashboard(content) {
  const [{ count: studentCount }, { count: teacherCount }, { count: classCount }] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
    sb.from("classes").select("id", { count: "exact", head: true }),
  ]);

  content.innerHTML = `
    <div class="jh-grid jh-grid-3">
      ${statCard("Total Students", studentCount || 0, '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>')}
      ${statCard("Total Teachers", teacherCount || 0, '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>')}
      ${statCard("Classes", classCount || 0, '<rect x="3" y="4" width="18" height="18" rx="2"/>')}
    </div>
    <p style="color:var(--text-faint);font-size:12px;margin-top:18px;">This portal is read-only. To make changes, contact a Principal or Admin.</p>
  `;
}

function statCard(label, value, icon) {
  return `
    <div class="jh-card jh-stat">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>
      <div class="value">${value}</div>
      <div class="label">${label}</div>
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderReports(content) {
  const { data: exams } = await sb.from("exams").select("id, name, classes(name)").order("created_at", { ascending: false });

  if (!exams || !exams.length) {
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">No exam reports available yet.</div></div>`;
    return;
  }

  const rows = await Promise.all(exams.map(async (exam) => {
    const { data: results } = await sb.from("results").select("percentage").eq("exam_id", exam.id).eq("published", true);
    const avg = results && results.length ? (results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(1) : "—";
    return { ...exam, avg, count: results?.length || 0 };
  }));

  content.innerHTML = `
    <div class="jh-card">
      <table class="jh-table">
        <thead><tr><th>Exam</th><th>Class</th><th>Published Results</th><th>Average %</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.classes?.name || "—")}</td><td>${r.count}</td><td>${r.avg}${r.avg !== "—" ? "%" : ""}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderAnalytics(content) {
  const { data: sections } = await sb.from("sections").select("id, name, classes(name)");
  const rows = await Promise.all(
    (sections || []).map(async (s) => {
      const { data: att } = await sb.from("attendance").select("status").eq("section_id", s.id);
      const total = att?.length || 0;
      const present = att?.filter((a) => a.status === "present").length || 0;
      const pct = total ? Math.round((present / total) * 100) : 0;
      return { ...s, pct, total };
    })
  );

  content.innerHTML = `
    <div class="jh-card">
      <div class="jh-section-title">Attendance by Section</div>
      ${rows.length ? `<table class="jh-table">
        <thead><tr><th>Class</th><th>Section</th><th>Attendance %</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.classes?.name || "—")}</td><td>${escapeHtml(r.name)}</td><td>${r.pct}%</td></tr>`).join("")}</tbody>
      </table>` : `<div class="jh-empty">No attendance data yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderUsers(content) {
  const { data: users } = await sb.from("profiles").select("full_name, email, role, status").order("role");

  content.innerHTML = `
    <div class="jh-card">
      <table class="jh-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>
          ${(users || []).map((u) => `
            <tr>
              <td>${escapeHtml(u.full_name)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td style="text-transform:capitalize;">${escapeHtml(u.role.replace("_"," "))}</td>
              <td>${u.status === "active" ? '<span class="jh-badge jh-badge-green">Active</span>' : u.status === "pending" ? '<span class="jh-badge jh-badge-gold">Pending</span>' : '<span class="jh-badge jh-badge-gray">Inactive</span>'}</td>
            </tr>`).join("")}
        </tbody>
      </table>
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
