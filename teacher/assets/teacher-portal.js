/* ============================================================
   JH+ TEACHER PORTAL — logic
   Every upload form is scoped to the sections this teacher is
   actually assigned to (teacher_assignments table). RLS enforces
   this server-side too — this client-side scoping is for UX,
   not security.
   ============================================================ */

let CURRENT_PROFILE = null;
let MY_ASSIGNMENTS = []; // [{class_id, section_id, subject, classes:{name}, sections:{name}}]

const VIEW_META = {
  dashboard: { title: "Dashboard", sub: "Your sections at a glance." },
  attendance: { title: "Attendance", sub: "Mark daily attendance for your sections." },
  marks: { title: "Marks", sub: "Enter subject-wise marks for an exam." },
  assignments: { title: "Assignments", sub: "Post assignments to your sections." },
  downloads: { title: "Downloads", sub: "Share notes and resources." },
  qbank: { title: "Question Bank", sub: "Upload practice papers and question sets." },
  announcements: { title: "Announcements", sub: "Post updates visible to students/staff." },
  profile: { title: "Profile", sub: "Your account details." },
};

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await authGuard(["teacher"]);
  if (!profile) return;

  CURRENT_PROFILE = profile;
  jhInitShell(profile);

  const { data: assignments } = await sb
    .from("teacher_assignments")
    .select("class_id, section_id, subject, classes(name), sections(name)")
    .eq("teacher_id", profile.id);
  MY_ASSIGNMENTS = assignments || [];

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
      case "attendance": return renderAttendanceForm(content);
      case "marks": return renderMarksForm(content);
      case "assignments": return renderAssignmentsForm(content);
      case "downloads": return renderDownloadsForm(content);
      case "qbank": return renderQBankForm(content);
      case "announcements": return renderAnnouncementsForm(content);
      case "profile": return renderProfile(content);
    }
  } catch (err) {
    console.error("[Teacher Portal] render error:", err);
    content.innerHTML = `<div class="jh-card"><div class="jh-empty">Something went wrong loading this section.</div></div>`;
  }
}

function sectionOptionsHtml() {
  if (!MY_ASSIGNMENTS.length) {
    return `<option value="">No sections assigned to you yet</option>`;
  }
  return MY_ASSIGNMENTS.map(
    (a) => `<option value="${a.section_id}" data-class="${a.class_id}" data-subject="${escapeHtml(a.subject || "")}">${escapeHtml(a.classes?.name || "")} — ${escapeHtml(a.sections?.name || "")}${a.subject ? " (" + escapeHtml(a.subject) + ")" : ""}</option>`
  ).join("");
}

/* ---------------------------------------------------------- */
async function renderDashboard(content) {
  const sectionIds = MY_ASSIGNMENTS.map((a) => a.section_id);
  let studentCount = 0;
  if (sectionIds.length) {
    const { count } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("section_id", sectionIds);
    studentCount = count || 0;
  }

  content.innerHTML = `
    <div class="jh-grid jh-grid-3" style="margin-bottom:24px;">
      <div class="jh-card jh-stat">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div>
        <div class="value">${studentCount}</div>
        <div class="label">Students Across Your Sections</div>
      </div>
      <div class="jh-card jh-stat">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></div>
        <div class="value">${MY_ASSIGNMENTS.length}</div>
        <div class="label">Section Assignments</div>
      </div>
    </div>
    <div class="jh-card">
      <div class="jh-section-title">Your Sections</div>
      ${
        MY_ASSIGNMENTS.length
          ? `<table class="jh-table"><thead><tr><th>Class</th><th>Section</th><th>Subject</th></tr></thead><tbody>
              ${MY_ASSIGNMENTS.map((a) => `<tr><td>${escapeHtml(a.classes?.name || "—")}</td><td>${escapeHtml(a.sections?.name || "—")}</td><td>${escapeHtml(a.subject || "—")}</td></tr>`).join("")}
            </tbody></table>`
          : `<div class="jh-empty">You have not been assigned to any sections yet. Contact an administrator.</div>`
      }
    </div>
  `;
}

/* ---------------------------------------------------------- */
async function renderAttendanceForm(content) {
  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;">
      <div class="jh-section-title">Mark Attendance</div>
      <div id="formMsg" class="login-msg" style="margin-bottom:14px;"></div>
      <form id="attForm">
        <div class="login-field"><label>Section</label>
          <select id="attSection" class="login-input">${sectionOptionsHtml()}</select>
        </div>
        <div class="login-field"><label>Date</label>
          <input type="date" id="attDate" class="login-input" value="${new Date().toISOString().slice(0,10)}" required>
        </div>
        <button type="button" id="attLoadBtn" class="jh-btn jh-btn-ghost" style="margin-bottom:16px;">Load Students</button>
        <div id="attStudentList"></div>
        <button type="submit" id="attSubmitBtn" class="jh-btn jh-btn-primary" style="display:none;margin-top:10px;">Save Attendance</button>
      </form>
    </div>
  `;

  document.getElementById("attLoadBtn").addEventListener("click", async () => {
    const sectionId = document.getElementById("attSection").value;
    if (!sectionId) return;
    const { data: students } = await sb
      .from("profiles")
      .select("id, full_name, student_id")
      .eq("section_id", sectionId)
      .eq("role", "student")
      .order("full_name");

    const list = document.getElementById("attStudentList");
    if (!students || !students.length) {
      list.innerHTML = `<div class="jh-empty">No students found in this section.</div>`;
      return;
    }

    list.innerHTML = students.map((s) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);">
        <span style="font-size:13.5px;">${escapeHtml(s.full_name)} ${s.student_id ? `<span style="color:var(--text-faint);">(${escapeHtml(s.student_id)})</span>` : ""}</span>
        <select data-student-id="${s.id}" class="att-status login-input" style="width:auto;padding:6px 10px;font-size:12.5px;">
          <option value="present" selected>Present</option>
          <option value="absent">Absent</option>
          <option value="late">Late</option>
          <option value="excused">Excused</option>
        </select>
      </div>
    `).join("");
    document.getElementById("attSubmitBtn").style.display = "inline-flex";
  });

  document.getElementById("attForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = document.getElementById("attDate").value;
    const sectionSelect = document.getElementById("attSection");
    const sectionId = sectionSelect.value;
    const classId = sectionSelect.selectedOptions[0]?.dataset.class;
    const rows = [...document.querySelectorAll(".att-status")].map((sel) => ({
      student_id: sel.dataset.studentId,
      class_id: classId,
      section_id: sectionId,
      date,
      status: sel.value,
      marked_by: CURRENT_PROFILE.id,
    }));

    const msg = document.getElementById("formMsg");
    const { error } = await sb.from("attendance").upsert(rows, { onConflict: "student_id,date" });
    if (error) {
      msg.className = "login-msg show error";
      msg.textContent = error.message;
    } else {
      msg.className = "login-msg show success";
      msg.textContent = `Attendance saved for ${rows.length} students.`;
    }
  });
}

/* ---------------------------------------------------------- */
async function renderMarksForm(content) {
  const { data: exams } = await sb.from("exams").select("id, name").order("created_at", { ascending: false });

  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;">
      <div class="jh-section-title">Enter Marks</div>
      <div id="formMsg" class="login-msg" style="margin-bottom:14px;"></div>
      <form id="marksForm">
        <div class="login-field"><label>Exam</label>
          <select id="marksExam" class="login-input">
            ${exams && exams.length ? exams.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("") : `<option value="">No exams created yet — ask admin to add one</option>`}
          </select>
        </div>
        <div class="login-field"><label>Section</label>
          <select id="marksSection" class="login-input">${sectionOptionsHtml()}</select>
        </div>
        <div class="login-field"><label>Subject</label>
          <input type="text" id="marksSubject" class="login-input" placeholder="e.g. Physics" required>
        </div>
        <div class="login-field"><label>Total Marks</label>
          <input type="number" id="marksTotal" class="login-input" placeholder="100" required>
        </div>
        <button type="button" id="marksLoadBtn" class="jh-btn jh-btn-ghost" style="margin-bottom:16px;">Load Students</button>
        <div id="marksStudentList"></div>
        <button type="submit" id="marksSubmitBtn" class="jh-btn jh-btn-primary" style="display:none;margin-top:10px;">Save Marks</button>
      </form>
    </div>
  `;

  document.getElementById("marksLoadBtn").addEventListener("click", async () => {
    const sectionId = document.getElementById("marksSection").value;
    if (!sectionId) return;
    const { data: students } = await sb
      .from("profiles")
      .select("id, full_name, student_id")
      .eq("section_id", sectionId)
      .eq("role", "student")
      .order("full_name");

    const list = document.getElementById("marksStudentList");
    if (!students || !students.length) {
      list.innerHTML = `<div class="jh-empty">No students found in this section.</div>`;
      return;
    }
    list.innerHTML = students.map((s) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);gap:10px;">
        <span style="font-size:13.5px;flex:1;">${escapeHtml(s.full_name)}</span>
        <input type="number" data-student-id="${s.id}" class="marks-input login-input" style="width:90px;padding:7px 10px;" placeholder="0">
      </div>
    `).join("");
    document.getElementById("marksSubmitBtn").style.display = "inline-flex";
  });

  document.getElementById("marksForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const examId = document.getElementById("marksExam").value;
    const subject = document.getElementById("marksSubject").value.trim();
    const total = parseFloat(document.getElementById("marksTotal").value);
    const msg = document.getElementById("formMsg");

    if (!examId) { msg.className = "login-msg show error"; msg.textContent = "Select an exam first."; return; }

    const rows = [...document.querySelectorAll(".marks-input")]
      .filter((inp) => inp.value !== "")
      .map((inp) => ({
        exam_id: examId,
        student_id: inp.dataset.studentId,
        subject,
        marks_obtained: parseFloat(inp.value),
        marks_total: total,
        entered_by: CURRENT_PROFILE.id,
      }));

    if (!rows.length) { msg.className = "login-msg show error"; msg.textContent = "Enter at least one mark."; return; }

    const { error } = await sb.from("marks").upsert(rows, { onConflict: "exam_id,student_id,subject" });
    if (error) {
      msg.className = "login-msg show error";
      msg.textContent = error.message;
    } else {
      msg.className = "login-msg show success";
      msg.textContent = `Marks saved for ${rows.length} students.`;
    }
  });
}

/* ---------------------------------------------------------- */
async function renderAssignmentsForm(content) {
  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;">
      <div class="jh-section-title">Post an Assignment</div>
      <div id="formMsg" class="login-msg" style="margin-bottom:14px;"></div>
      <form id="assignForm">
        <div class="login-field"><label>Section</label>
          <select id="assignSection" class="login-input">${sectionOptionsHtml()}</select>
        </div>
        <div class="login-field"><label>Title</label>
          <input type="text" id="assignTitle" class="login-input" required>
        </div>
        <div class="login-field"><label>Subject</label>
          <input type="text" id="assignSubject" class="login-input">
        </div>
        <div class="login-field"><label>Description</label>
          <textarea id="assignDesc" class="login-input" rows="3" style="resize:vertical;"></textarea>
        </div>
        <div class="login-field"><label>Due Date</label>
          <input type="date" id="assignDue" class="login-input">
        </div>
        <div class="login-field"><label>File URL (upload to Media Library first, then paste link)</label>
          <input type="url" id="assignFile" class="login-input" placeholder="https://...">
        </div>
        <button type="submit" class="jh-btn jh-btn-primary">Post Assignment</button>
      </form>
    </div>
  `;

  document.getElementById("assignForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const sectionSelect = document.getElementById("assignSection");
    const sectionId = sectionSelect.value;
    const classId = sectionSelect.selectedOptions[0]?.dataset.class;
    const msg = document.getElementById("formMsg");

    const { error } = await sb.from("assignments").insert({
      title: document.getElementById("assignTitle").value.trim(),
      subject: document.getElementById("assignSubject").value.trim() || null,
      description: document.getElementById("assignDesc").value.trim() || null,
      due_date: document.getElementById("assignDue").value || null,
      file_url: document.getElementById("assignFile").value.trim() || null,
      class_id: classId,
      section_id: sectionId,
      created_by: CURRENT_PROFILE.id,
    });

    if (error) {
      msg.className = "login-msg show error";
      msg.textContent = error.message;
    } else {
      msg.className = "login-msg show success";
      msg.textContent = "Assignment posted.";
      document.getElementById("assignForm").reset();
    }
  });
}

/* ---------------------------------------------------------- */
async function renderDownloadsForm(content) {
  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;">
      <div class="jh-section-title">Share a Download</div>
      <div id="formMsg" class="login-msg" style="margin-bottom:14px;"></div>
      <form id="dlForm">
        <div class="login-field"><label>Title</label><input type="text" id="dlTitle" class="login-input" required></div>
        <div class="login-field"><label>Description</label><textarea id="dlDesc" class="login-input" rows="2" style="resize:vertical;"></textarea></div>
        <div class="login-field"><label>File URL</label><input type="url" id="dlFile" class="login-input" placeholder="https://..." required></div>
        <div class="login-field"><label>Restrict to a class (optional)</label>
          <select id="dlClass" class="login-input">
            <option value="">Visible to everyone</option>
            ${[...new Set(MY_ASSIGNMENTS.map((a) => JSON.stringify({ id: a.class_id, name: a.classes?.name })))].map((s) => { const o = JSON.parse(s); return `<option value="${o.id}">${escapeHtml(o.name || "")}</option>`; }).join("")}
          </select>
        </div>
        <button type="submit" class="jh-btn jh-btn-primary">Share Download</button>
      </form>
    </div>
  `;

  document.getElementById("dlForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("formMsg");
    const { error } = await sb.from("downloads").insert({
      title: document.getElementById("dlTitle").value.trim(),
      description: document.getElementById("dlDesc").value.trim() || null,
      file_url: document.getElementById("dlFile").value.trim(),
      class_id: document.getElementById("dlClass").value || null,
      uploaded_by: CURRENT_PROFILE.id,
    });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; }
    else { msg.className = "login-msg show success"; msg.textContent = "Download shared."; document.getElementById("dlForm").reset(); }
  });
}

/* ---------------------------------------------------------- */
async function renderQBankForm(content) {
  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;">
      <div class="jh-section-title">Upload to Question Bank</div>
      <div id="formMsg" class="login-msg" style="margin-bottom:14px;"></div>
      <form id="qbForm">
        <div class="login-field"><label>Title</label><input type="text" id="qbTitle" class="login-input" required></div>
        <div class="login-field"><label>Subject</label><input type="text" id="qbSubject" class="login-input" required></div>
        <div class="login-field"><label>File URL</label><input type="url" id="qbFile" class="login-input" placeholder="https://..." required></div>
        <button type="submit" class="jh-btn jh-btn-primary">Upload</button>
      </form>
    </div>
  `;

  document.getElementById("qbForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("formMsg");
    const { error } = await sb.from("question_bank").insert({
      title: document.getElementById("qbTitle").value.trim(),
      subject: document.getElementById("qbSubject").value.trim(),
      file_url: document.getElementById("qbFile").value.trim(),
      uploaded_by: CURRENT_PROFILE.id,
    });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; }
    else { msg.className = "login-msg show success"; msg.textContent = "Uploaded."; document.getElementById("qbForm").reset(); }
  });
}

/* ---------------------------------------------------------- */
async function renderAnnouncementsForm(content) {
  content.innerHTML = `
    <div class="jh-card" style="max-width:640px;">
      <div class="jh-section-title">Post an Announcement</div>
      <div id="formMsg" class="login-msg" style="margin-bottom:14px;"></div>
      <form id="annForm">
        <div class="login-field"><label>Title</label><input type="text" id="annTitle" class="login-input" required></div>
        <div class="login-field"><label>Message</label><textarea id="annBody" class="login-input" rows="3" style="resize:vertical;" required></textarea></div>
        <div class="login-field"><label>Audience</label>
          <select id="annAudience" class="login-input">
            <option value="students">Students</option>
            <option value="staff">Staff</option>
            <option value="all">Everyone</option>
          </select>
        </div>
        <button type="submit" class="jh-btn jh-btn-primary">Post Announcement</button>
      </form>
      <p style="color:var(--text-faint);font-size:12px;margin-top:10px;">Note: announcements you post are not shown on the public homepage — only Admin/Super Admin can do that.</p>
    </div>
  `;

  document.getElementById("annForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("formMsg");
    const { error } = await sb.from("announcements").insert({
      title: document.getElementById("annTitle").value.trim(),
      body: document.getElementById("annBody").value.trim(),
      audience: document.getElementById("annAudience").value,
      is_public: false,
      created_by: CURRENT_PROFILE.id,
    });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; }
    else { msg.className = "login-msg show success"; msg.textContent = "Announcement posted."; document.getElementById("annForm").reset(); }
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
      ${profileRow("Phone", p.phone || "—")}
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
