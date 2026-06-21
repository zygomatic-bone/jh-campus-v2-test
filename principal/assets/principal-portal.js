/* ============================================================
   JH+ PRINCIPAL PORTAL — logic
   Read access to all academic data school-wide. The one write
   capability is publishing results (RLS: results_write_principal_admin).
   ============================================================ */

let CURRENT_PROFILE = null;

const VIEW_META = {
  dashboard: { title: "Dashboard", sub: "School-wide snapshot." },
  academic: { title: "Academic Reports", sub: "Exam performance across classes." },
  students: { title: "Student Analytics", sub: "Enrollment and class distribution." },
  attendance: { title: "Attendance Analytics", sub: "Attendance trends by class and section." },
  performance: { title: "Performance Reports", sub: "Subject-wise performance breakdown." },
  publish: { title: "Publish Results", sub: "Review and publish exam results to students." },
  profile: { title: "Profile", sub: "Your account details." },
};

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await authGuard(["principal"]);
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
      case "academic": return renderAcademic(content);
      case "students": return renderStudents(content);
      case "attendance": return renderAttendance(content);
      case "performance": return renderPerformance(content);
      case "publish": return renderPublish(content);
      case "profile": return renderProfile(content);
    }
  } catch (err) {
    console.error("[Principal Portal] error:", err);
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">Something went wrong loading this section.</div></div>`;
  }
}

/* ---------------------------------------------------------- */
async function renderDashboard(content) {
  const [{ count: studentCount }, { count: teacherCount }, { count: classCount }, { data: pendingResults }] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
    sb.from("classes").select("id", { count: "exact", head: true }),
    sb.from("results").select("id").eq("published", false),
  ]);

  content.innerHTML = `
    <div class="jh-grid jh-grid-4">
      ${statCard("Total Students", studentCount || 0, '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>')}
      ${statCard("Total Teachers", teacherCount || 0, '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>')}
      ${statCard("Classes", classCount || 0, '<rect x="3" y="4" width="18" height="18" rx="2"/>')}
      ${statCard("Results Awaiting Publish", pendingResults?.length || 0, '<path d="M9 11l3 3L22 4"/>')}
    </div>
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
async function renderAcademic(content) {
  const { data: exams } = await sb.from("exams").select("id, name, classes(name)").order("created_at", { ascending: false });

  if (!exams || !exams.length) {
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">No exams created yet.</div></div>`;
    return;
  }

  const rows = await Promise.all(exams.map(async (exam) => {
    const { data: results } = await sb.from("results").select("percentage").eq("exam_id", exam.id);
    const avg = results && results.length ? (results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(1) : "—";
    return { ...exam, avg, count: results?.length || 0 };
  }));

  content.innerHTML = `
    <div class="jh-card">
      <table class="jh-table">
        <thead><tr><th>Exam</th><th>Class</th><th>Results Recorded</th><th>Average %</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.classes?.name || "—")}</td><td>${r.count}</td><td>${r.avg}${r.avg !== "—" ? "%" : ""}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderStudents(content) {
  const { data: classes } = await sb.from("classes").select("id, name");
  const counts = await Promise.all(
    (classes || []).map(async (c) => {
      const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("class_id", c.id);
      return { ...c, count: count || 0 };
    })
  );

  content.innerHTML = `
    <div class="jh-card">
      <div class="jh-section-title">Students by Class</div>
      <table class="jh-table">
        <thead><tr><th>Class</th><th>Enrolled Students</th></tr></thead>
        <tbody>${counts.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${c.count}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderAttendance(content) {
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
        <thead><tr><th>Class</th><th>Section</th><th>Records</th><th>Attendance %</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.classes?.name || "—")}</td><td>${escapeHtml(r.name)}</td><td>${r.total}</td><td>${r.pct}%</td></tr>`).join("")}</tbody>
      </table>` : `<div class="jh-empty">No sections created yet.</div>`}
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderPerformance(content) {
  const { data: marks } = await sb.from("marks").select("subject, marks_obtained, marks_total");
  if (!marks || !marks.length) {
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">No marks recorded yet.</div></div>`;
    return;
  }

  const bySubject = {};
  marks.forEach((m) => {
    if (!bySubject[m.subject]) bySubject[m.subject] = { obtained: 0, total: 0, count: 0 };
    bySubject[m.subject].obtained += m.marks_obtained;
    bySubject[m.subject].total += m.marks_total;
    bySubject[m.subject].count += 1;
  });

  content.innerHTML = `
    <div class="jh-card">
      <div class="jh-section-title">Average Performance by Subject</div>
      <table class="jh-table">
        <thead><tr><th>Subject</th><th>Entries</th><th>Average %</th></tr></thead>
        <tbody>
          ${Object.entries(bySubject).map(([subj, d]) => `<tr><td>${escapeHtml(subj)}</td><td>${d.count}</td><td>${((d.obtained / d.total) * 100).toFixed(1)}%</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderPublish(content) {
  const { data: exams } = await sb.from("exams").select("id, name").order("created_at", { ascending: false });

  content.innerHTML = `
    <div class="jh-card" style="max-width:600px;margin-bottom:20px;">
      <div class="jh-section-title">Select Exam</div>
      <select id="publishExam" class="login-input">
        ${exams && exams.length ? exams.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("") : `<option value="">No exams yet</option>`}
      </select>
      <button id="loadPendingBtn" class="jh-btn jh-btn-ghost" style="margin-top:14px;">Load Pending Results</button>
    </div>
    <div id="publishMsg" class="login-msg" style="max-width:600px;"></div>
    <div id="publishList"></div>
  `;

  document.getElementById("loadPendingBtn").addEventListener("click", async () => {
    const examId = document.getElementById("publishExam").value;
    if (!examId) return;

    // Compute results from marks if not already present, otherwise show existing unpublished.
    const { data: marksForExam } = await sb.from("marks").select("student_id, marks_obtained, marks_total, profiles(full_name)").eq("exam_id", examId);

    if (!marksForExam || !marksForExam.length) {
      document.getElementById("publishList").innerHTML = `<div class="jh-card"><div class="jh-empty">No marks entered for this exam yet.</div></div>`;
      return;
    }

    const byStudent = {};
    marksForExam.forEach((m) => {
      if (!byStudent[m.student_id]) byStudent[m.student_id] = { obtained: 0, total: 0, name: m.profiles?.full_name };
      byStudent[m.student_id].obtained += m.marks_obtained;
      byStudent[m.student_id].total += m.marks_total;
    });

    const list = document.getElementById("publishList");
    list.innerHTML = `
      <div class="jh-card">
        <table class="jh-table">
          <thead><tr><th>Student</th><th>Total</th><th>%</th></tr></thead>
          <tbody>
            ${Object.entries(byStudent).map(([sid, d]) => `<tr data-student="${sid}" data-obtained="${d.obtained}" data-total="${d.total}"><td>${escapeHtml(d.name || sid)}</td><td>${d.obtained}/${d.total}</td><td>${((d.obtained/d.total)*100).toFixed(1)}%</td></tr>`).join("")}
          </tbody>
        </table>
        <button id="publishBtn" class="jh-btn jh-btn-primary" style="margin-top:16px;">Publish These Results</button>
      </div>
    `;

    document.getElementById("publishBtn").addEventListener("click", async () => {
      const rows = [...list.querySelectorAll("tr[data-student]")].map((tr) => {
        const obtained = parseFloat(tr.dataset.obtained);
        const total = parseFloat(tr.dataset.total);
        const pct = (obtained / total) * 100;
        return {
          exam_id: examId,
          student_id: tr.dataset.student,
          total_obtained: obtained,
          total_possible: total,
          percentage: pct,
          grade: gradeFor(pct),
          published: true,
          published_by: CURRENT_PROFILE.id,
          published_at: new Date().toISOString(),
        };
      });

      const msg = document.getElementById("publishMsg");
      const { error } = await sb.from("results").upsert(rows, { onConflict: "exam_id,student_id" });
      if (error) {
        msg.className = "login-msg show error";
        msg.textContent = error.message;
      } else {
        msg.className = "login-msg show success";
        msg.textContent = `Published results for ${rows.length} students.`;
      }
    });
  });
}

function gradeFor(pct) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
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
