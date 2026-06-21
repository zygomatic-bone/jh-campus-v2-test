/* ============================================================
   JH+ STUDENT PORTAL — logic
   ============================================================ */

let CURRENT_PROFILE = null;

const VIEW_META = {
  dashboard: { title: "Dashboard", sub: "Welcome back — here's your overview." },
  attendance: { title: "Attendance", sub: "Your day-by-day attendance record." },
  marks: { title: "Marks", sub: "Subject-wise marks for each exam." },
  results: { title: "Results", sub: "Published results for completed exams." },
  assignments: { title: "Assignments", sub: "Work assigned to your section." },
  downloads: { title: "Downloads", sub: "Notes, syllabus and shared resources." },
  qbank: { title: "Question Bank", sub: "Practice papers and question sets for your class." },
  announcements: { title: "Announcements", sub: "Updates from school administration." },
  profile: { title: "Profile", sub: "Your account details." },
};

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await authGuard(["student"]);
  if (!profile) return; // authGuard already redirected

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
      case "attendance": return renderAttendance(content);
      case "marks": return renderMarks(content);
      case "results": return renderResults(content);
      case "assignments": return renderAssignments(content);
      case "downloads": return renderDownloads(content);
      case "qbank": return renderQuestionBank(content);
      case "announcements": return renderAnnouncements(content);
      case "profile": return renderProfile(content);
    }
  } catch (err) {
    console.error("[Student Portal] render error:", err);
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">Something went wrong loading this section. Please try again.</div></div>`;
  }
}

/* ---------------------------------------------------------- */
async function renderDashboard(content) {
  const studentId = CURRENT_PROFILE.id;

  const [{ data: attendanceRows }, { data: resultsRows }, { data: assignmentRows }, { data: announcementRows }] = await Promise.all([
    sb.from("attendance").select("status").eq("student_id", studentId),
    sb.from("results").select("*").eq("student_id", studentId).eq("published", true).order("created_at", { ascending: false }).limit(1),
    sb.from("assignments").select("id").eq("section_id", CURRENT_PROFILE.section_id || "00000000-0000-0000-0000-000000000000"),
    sb.from("announcements").select("*").order("created_at", { ascending: false }).limit(4),
  ]);

  const totalDays = attendanceRows?.length || 0;
  const presentDays = attendanceRows?.filter((r) => r.status === "present").length || 0;
  const attendancePct = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;
  const latestResult = resultsRows?.[0];
  const assignmentCount = assignmentRows?.length || 0;

  content.innerHTML = `
    <div class="jh-grid jh-grid-4" style="margin-bottom:24px;">
      <div class="jh-card jh-stat">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
        <div class="value">${attendancePct}%</div>
        <div class="label">Attendance (${presentDays}/${totalDays} days)</div>
      </div>
      <div class="jh-card jh-stat">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M3 4h18l-1.5 9.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5L3 4Z"/></svg></div>
        <div class="value">${latestResult ? latestResult.percentage.toFixed(1) + "%" : "—"}</div>
        <div class="label">Latest Result</div>
      </div>
      <div class="jh-card jh-stat">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6"/></svg></div>
        <div class="value">${assignmentCount}</div>
        <div class="label">Active Assignments</div>
      </div>
      <div class="jh-card jh-stat">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div>
        <div class="value" style="font-size:16px;">${CURRENT_PROFILE.student_id || "—"}</div>
        <div class="label">Student ID</div>
      </div>
    </div>

    <div class="jh-card">
      <div class="jh-section-title">Recent Announcements</div>
      ${
        announcementRows && announcementRows.length
          ? announcementRows.map((a) => `
            <div style="padding:12px 0;border-bottom:1px solid var(--line);">
              <div style="font-weight:600;font-size:14px;">${escapeHtml(a.title)}</div>
              <div style="color:var(--text-dim);font-size:13px;margin-top:3px;">${escapeHtml(a.body)}</div>
              <div style="color:var(--text-faint);font-size:11.5px;margin-top:5px;">${jhFormatDate(a.created_at)}</div>
            </div>`).join("")
          : `<div class="jh-empty">No announcements yet.</div>`
      }
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderAttendance(content) {
  const { data, error } = await sb
    .from("attendance")
    .select("date, status")
    .eq("student_id", CURRENT_PROFILE.id)
    .order("date", { ascending: false })
    .limit(60);

  if (error) throw error;

  const present = data.filter((r) => r.status === "present").length;
  const pct = data.length ? Math.round((present / data.length) * 100) : 0;

  content.innerHTML = `
    <div class="jh-card" style="margin-bottom:20px;">
      <div class="jh-section-title">Overview (last ${data.length} recorded days)</div>
      <div style="font-size:32px;font-weight:700;color:var(--gold);">${pct}%</div>
      <div style="color:var(--text-dim);font-size:13px;">${present} present out of ${data.length} recorded days</div>
    </div>
    <div class="jh-card">
      ${data.length ? `
        <table class="jh-table">
          <thead><tr><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            ${data.map((r) => `
              <tr>
                <td>${jhFormatDate(r.date)}</td>
                <td>${attendanceBadge(r.status)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      ` : `<div class="jh-empty">No attendance records yet.</div>`}
    </div>
  `;
}

function attendanceBadge(status) {
  const map = {
    present: '<span class="jh-badge jh-badge-green">Present</span>',
    absent: '<span class="jh-badge jh-badge-red">Absent</span>',
    late: '<span class="jh-badge jh-badge-gold">Late</span>',
    excused: '<span class="jh-badge jh-badge-gray">Excused</span>',
  };
  return map[status] || status;
}

/* ---------------------------------------------------------- */
async function renderMarks(content) {
  const { data, error } = await sb
    .from("marks")
    .select("subject, marks_obtained, marks_total, exams(name)")
    .eq("student_id", CURRENT_PROFILE.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? `
        <table class="jh-table">
          <thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>%</th></tr></thead>
          <tbody>
            ${data.map((r) => `
              <tr>
                <td>${escapeHtml(r.exams?.name || "—")}</td>
                <td>${escapeHtml(r.subject)}</td>
                <td>${r.marks_obtained} / ${r.marks_total}</td>
                <td>${((r.marks_obtained / r.marks_total) * 100).toFixed(1)}%</td>
              </tr>`).join("")}
          </tbody>
        </table>
      ` : `<div class="jh-empty">No marks entered yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderResults(content) {
  const { data, error } = await sb
    .from("results")
    .select("*, exams(name)")
    .eq("student_id", CURRENT_PROFILE.id)
    .eq("published", true)
    .order("published_at", { ascending: false });

  if (error) throw error;

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? `
        <table class="jh-table">
          <thead><tr><th>Exam</th><th>Marks</th><th>Percentage</th><th>Grade</th><th>Published</th></tr></thead>
          <tbody>
            ${data.map((r) => `
              <tr>
                <td>${escapeHtml(r.exams?.name || "—")}</td>
                <td>${r.total_obtained} / ${r.total_possible}</td>
                <td>${r.percentage.toFixed(1)}%</td>
                <td><span class="jh-badge jh-badge-gold">${escapeHtml(r.grade || "—")}</span></td>
                <td>${jhFormatDate(r.published_at)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      ` : `<div class="jh-empty">No published results yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderAssignments(content) {
  const { data, error } = await sb
    .from("assignments")
    .select("*")
    .eq("section_id", CURRENT_PROFILE.section_id)
    .order("due_date", { ascending: true });

  if (error) throw error;

  content.innerHTML = `
    <div class="jh-grid jh-grid-2">
      ${data && data.length ? data.map((a) => `
        <div class="jh-card">
          <div style="display:flex;justify-content:space-between;align-items:start;">
            <div style="font-weight:700;font-size:15px;">${escapeHtml(a.title)}</div>
            ${a.due_date ? `<span class="jh-badge jh-badge-gold">Due ${jhFormatDate(a.due_date)}</span>` : ""}
          </div>
          ${a.subject ? `<div style="color:var(--text-faint);font-size:12px;margin-top:4px;">${escapeHtml(a.subject)}</div>` : ""}
          <div style="color:var(--text-dim);font-size:13.5px;margin-top:10px;line-height:1.6;">${escapeHtml(a.description || "")}</div>
          ${a.file_url ? `<a href="${a.file_url}" target="_blank" class="jh-btn jh-btn-ghost" style="margin-top:14px;">Download Attachment</a>` : ""}
        </div>
      `).join("") : `<div class="jh-card"><div class="jh-empty">No assignments right now.</div></div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderDownloads(content) {
  const { data, error } = await sb
    .from("downloads")
    .select("*")
    .or(`class_id.is.null,class_id.eq.${CURRENT_PROFILE.class_id}`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? `
        <table class="jh-table">
          <thead><tr><th>Title</th><th>Description</th><th></th></tr></thead>
          <tbody>
            ${data.map((d) => `
              <tr>
                <td>${escapeHtml(d.title)}</td>
                <td style="color:var(--text-dim);">${escapeHtml(d.description || "")}</td>
                <td><a href="${d.file_url}" target="_blank" class="jh-btn jh-btn-ghost">Download</a></td>
              </tr>`).join("")}
          </tbody>
        </table>
      ` : `<div class="jh-empty">No downloads available yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderQuestionBank(content) {
  const { data, error } = await sb
    .from("question_bank")
    .select("*")
    .or(`class_id.is.null,class_id.eq.${CURRENT_PROFILE.class_id}`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? `
        <table class="jh-table">
          <thead><tr><th>Title</th><th>Subject</th><th></th></tr></thead>
          <tbody>
            ${data.map((q) => `
              <tr>
                <td>${escapeHtml(q.title)}</td>
                <td>${escapeHtml(q.subject)}</td>
                <td><a href="${q.file_url}" target="_blank" class="jh-btn jh-btn-ghost">Download</a></td>
              </tr>`).join("")}
          </tbody>
        </table>
      ` : `<div class="jh-empty">No question bank entries yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderAnnouncements(content) {
  const { data, error } = await sb
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  content.innerHTML = `
    <div class="jh-card">
      ${data && data.length ? data.map((a) => `
        <div style="padding:14px 0;border-bottom:1px solid var(--line);">
          <div style="font-weight:600;">${escapeHtml(a.title)}</div>
          <div style="color:var(--text-dim);font-size:13.5px;margin-top:4px;">${escapeHtml(a.body)}</div>
          <div style="color:var(--text-faint);font-size:11.5px;margin-top:6px;">${jhFormatDate(a.created_at)}</div>
        </div>
      `).join("") : `<div class="jh-empty">No announcements yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderProfile(content) {
  const p = CURRENT_PROFILE;

  const [{ data: cls }, { data: sec }, { data: batch }] = await Promise.all([
    p.class_id ? sb.from("classes").select("name").eq("id", p.class_id).single() : { data: null },
    p.section_id ? sb.from("sections").select("name").eq("id", p.section_id).single() : { data: null },
    p.batch_id ? sb.from("batches").select("label").eq("id", p.batch_id).single() : { data: null },
  ]);

  content.innerHTML = `
    <div class="jh-card" style="max-width:560px;">
      <div class="jh-section-title">Account Details</div>
      ${profileRow("Full Name", p.full_name)}
      ${profileRow("Email", p.email)}
      ${profileRow("Phone", p.phone || "—")}
      ${profileRow("Student ID", p.student_id || "—")}
      ${profileRow("Class", cls?.name || "—")}
      ${profileRow("Section", sec?.name || "—")}
      ${profileRow("Batch", batch?.label || "—")}
      ${profileRow("Status", `<span class="jh-badge jh-badge-green">${p.status}</span>`, true)}
    </div>
  `;
}

function profileRow(label, value, isHtml) {
  return `
    <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
      <span style="color:var(--text-dim);">${label}</span>
      <span style="font-weight:600;">${isHtml ? value : escapeHtml(String(value))}</span>
    </div>
  `;
}

/* ---------------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
