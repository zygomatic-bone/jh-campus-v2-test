/* ============================================================
   JH+ SUPER ADMIN — Floating "+" Content Wizard
   No-code content creation: every flow here ends in a real
   Supabase insert/update — nothing here is a mockup.
   ============================================================ */

const WIZARD_ROOT_OPTIONS = [
  { id: "create_section", label: "Create New Homepage Section", icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { id: "edit_section", label: "Edit Existing Section", icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/>' },
  { id: "add_achiever", label: "Add Achiever", icon: '<path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-7Z"/>' },
  { id: "add_gallery", label: "Add Gallery Photos", icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>' },
  { id: "add_announcement", label: "Add Announcement", icon: '<path d="M3 11l18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 0 1-5.8-1.4"/>' },
  { id: "add_download", label: "Add Download / PDF", icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>' },
  { id: "director_message", label: "Update Director Message", icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' },
  { id: "hero_banner", label: "Replace Hero Banner", icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 16l5-5 4 4 5-6 4 4"/>' },
  { id: "homepage_stats", label: "Manage Homepage Statistics", icon: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/>' },
];

let WIZARD_STATE = {};

document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("jhFab");
  const overlay = document.getElementById("jhWizardOverlay");
  if (!fab || !overlay) return;

  fab.addEventListener("click", () => openWizardRoot());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeWizard();
  });
});

function closeWizard() {
  document.getElementById("jhWizardOverlay").classList.remove("show");
  WIZARD_STATE = {};
}

function wizardShell(innerHtml, { showClose = true } = {}) {
  const box = document.getElementById("jhWizardBox");
  box.innerHTML = `
    ${showClose ? `<button class="jh-wizard-close" id="wizCloseBtn">✕</button>` : ""}
    ${innerHtml}
  `;
  document.getElementById("jhWizardOverlay").classList.add("show");
  const closeBtn = document.getElementById("wizCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeWizard);
}

function openWizardRoot() {
  wizardShell(`
    <div class="jh-wizard-title">What would you like to do?</div>
    <div class="jh-wizard-sub">Pick an action — everything here updates the live website, no coding involved.</div>
    <div class="jh-wizard-options">
      ${WIZARD_ROOT_OPTIONS.map((o) => `
        <button class="jh-wizard-option" data-action="${o.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${o.icon}</svg>
          ${o.label}
        </button>
      `).join("")}
    </div>
  `);

  document.querySelectorAll(".jh-wizard-option[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => routeWizardAction(btn.dataset.action));
  });
}

function routeWizardAction(action) {
  WIZARD_STATE = { action, step: 1, data: {} };
  switch (action) {
    case "create_section": return wizardCreateSectionStep1();
    case "edit_section": return wizardEditSectionList();
    case "add_achiever": return wizardAddAchiever();
    case "add_gallery": return wizardAddGallery();
    case "add_announcement": return wizardAddAnnouncement();
    case "add_download": return wizardAddDownload();
    case "director_message": return wizardDirectorMessage();
    case "hero_banner": return wizardHeroBanner();
    case "homepage_stats": return wizardHomepageStats();
  }
}

function stepDots(total, current) {
  return `<div class="jh-wizard-steps">${Array.from({ length: total }, (_, i) =>
    `<div class="jh-wizard-step-dot ${i + 1 < current ? "done" : i + 1 === current ? "active" : ""}"></div>`
  ).join("")}</div>`;
}

/* ============================================================
   CREATE NEW HOMEPAGE SECTION — 7 step wizard
   ============================================================ */
function wizardCreateSectionStep1() {
  wizardShell(`
    ${stepDots(7, 1)}
    <div class="jh-wizard-title">Step 1 — Section Name</div>
    <div class="jh-wizard-sub">What should this section be called? e.g. "BM Superhit Batch", "NEET 2027"</div>
    <input type="text" id="wizSectionName" class="login-input" placeholder="Section name" value="${WIZARD_STATE.data.name || ""}">
    <div class="jh-wizard-nav">
      <span></span>
      <button class="jh-btn jh-btn-primary" id="wizNext">Next</button>
    </div>
  `);
  document.getElementById("wizNext").addEventListener("click", () => {
    const val = document.getElementById("wizSectionName").value.trim();
    if (!val) return;
    WIZARD_STATE.data.name = val;
    wizardCreateSectionStep2();
  });
}

function wizardCreateSectionStep2() {
  const types = [
    { id: "cards", label: "Cards" },
    { id: "gallery", label: "Gallery" },
    { id: "timeline", label: "Timeline / Banner" },
    { id: "statistics", label: "Statistics" },
    { id: "grid", label: "Achievers Grid" },
    { id: "custom", label: "Custom Section" },
  ];
  wizardShell(`
    ${stepDots(7, 2)}
    <div class="jh-wizard-title">Step 2 — Section Type</div>
    <div class="jh-wizard-sub">How should this content be displayed?</div>
    <div class="jh-wizard-options">
      ${types.map((t) => `<button class="jh-wizard-option" data-type="${t.id}">${t.label}</button>`).join("")}
    </div>
  `);
  document.querySelectorAll(".jh-wizard-option[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      WIZARD_STATE.data.layout = btn.dataset.type;
      wizardCreateSectionStep3();
    });
  });
}

function wizardCreateSectionStep3() {
  WIZARD_STATE.data.images = WIZARD_STATE.data.images || [];
  wizardShell(`
    ${stepDots(7, 3)}
    <div class="jh-wizard-title">Step 3 — Upload Images</div>
    <div class="jh-wizard-sub">Add a banner image and/or photos for this section. Max 5MB each — larger images are compressed automatically.</div>
    <div class="jh-dropzone" id="wizDropzone">Click or drag images here</div>
    <input type="file" id="wizFileInput" accept="image/*" multiple style="display:none;">
    <div class="jh-thumb-grid" id="wizThumbGrid"></div>
    <div id="wizUploadMsg" class="login-msg" style="margin-top:10px;"></div>
    <div class="jh-wizard-nav">
      <button class="jh-btn jh-btn-ghost" id="wizBack">Back</button>
      <button class="jh-btn jh-btn-primary" id="wizNext">Next</button>
    </div>
  `);
  renderThumbGrid();

  const dz = document.getElementById("wizDropzone");
  const input = document.getElementById("wizFileInput");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
    handleWizardFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", () => handleWizardFiles(input.files));

  document.getElementById("wizBack").addEventListener("click", wizardCreateSectionStep2);
  document.getElementById("wizNext").addEventListener("click", wizardCreateSectionStep4);
}

async function handleWizardFiles(files) {
  const msg = document.getElementById("wizUploadMsg");
  for (const file of files) {
    try {
      msg.className = "login-msg show";
      msg.textContent = `Uploading ${file.name}…`;
      const result = await jhUploadMedia(file, "media", "sections", CURRENT_PROFILE.id);
      WIZARD_STATE.data.images.push(result.url);
      renderThumbGrid();
      msg.className = "login-msg";
    } catch (err) {
      msg.className = "login-msg show error";
      msg.textContent = err.message;
    }
  }
}

function renderThumbGrid() {
  const grid = document.getElementById("wizThumbGrid");
  if (!grid) return;
  grid.innerHTML = (WIZARD_STATE.data.images || []).map((url, i) => `
    <div class="jh-thumb">
      <img src="${url}" alt="">
      <button class="rm" data-idx="${i}">✕</button>
    </div>
  `).join("");
  grid.querySelectorAll(".rm").forEach((btn) => btn.addEventListener("click", () => {
    WIZARD_STATE.data.images.splice(parseInt(btn.dataset.idx), 1);
    renderThumbGrid();
  }));
}

function wizardCreateSectionStep4() {
  wizardShell(`
    ${stepDots(7, 4)}
    <div class="jh-wizard-title">Step 4 — Description</div>
    <div class="jh-wizard-sub">Tell visitors what this section is about.</div>
    <textarea id="wizDesc" class="login-input" rows="4" style="resize:vertical;">${WIZARD_STATE.data.description || ""}</textarea>
    <div class="jh-wizard-nav">
      <button class="jh-btn jh-btn-ghost" id="wizBack">Back</button>
      <button class="jh-btn jh-btn-primary" id="wizNext">Next</button>
    </div>
  `);
  document.getElementById("wizBack").addEventListener("click", wizardCreateSectionStep3);
  document.getElementById("wizNext").addEventListener("click", () => {
    WIZARD_STATE.data.description = document.getElementById("wizDesc").value.trim();
    wizardCreateSectionStep5();
  });
}

function wizardCreateSectionStep5() {
  wizardShell(`
    ${stepDots(7, 5)}
    <div class="jh-wizard-title">Step 5 — Optional Button</div>
    <div class="jh-wizard-sub">Add a call-to-action button, or leave blank to skip.</div>
    <div class="login-field"><label>Button Text</label><input type="text" id="wizBtnText" class="login-input" placeholder="e.g. Learn More" value="${WIZARD_STATE.data.buttonText || ""}"></div>
    <div class="login-field"><label>Button URL</label><input type="url" id="wizBtnUrl" class="login-input" placeholder="https://..." value="${WIZARD_STATE.data.buttonUrl || ""}"></div>
    <div class="jh-wizard-nav">
      <button class="jh-btn jh-btn-ghost" id="wizBack">Back</button>
      <button class="jh-btn jh-btn-primary" id="wizNext">Preview</button>
    </div>
  `);
  document.getElementById("wizBack").addEventListener("click", wizardCreateSectionStep4);
  document.getElementById("wizNext").addEventListener("click", () => {
    WIZARD_STATE.data.buttonText = document.getElementById("wizBtnText").value.trim();
    WIZARD_STATE.data.buttonUrl = document.getElementById("wizBtnUrl").value.trim();
    wizardCreateSectionStep6();
  });
}

function wizardCreateSectionStep6() {
  const d = WIZARD_STATE.data;
  wizardShell(`
    ${stepDots(7, 6)}
    <div class="jh-wizard-title">Step 6 — Preview</div>
    <div class="jh-card" style="margin-bottom:6px;">
      ${d.images[0] ? `<img src="${d.images[0]}" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:14px;">` : ""}
      <div style="font-weight:700;font-size:16px;">${escapeHtmlWiz(d.name)}</div>
      <div style="color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:4px 0 10px;">${escapeHtmlWiz(d.layout)} layout · ${d.images.length} image(s)</div>
      <div style="color:var(--text-dim);font-size:13.5px;line-height:1.6;">${escapeHtmlWiz(d.description || "")}</div>
      ${d.buttonText ? `<button class="jh-btn jh-btn-primary" style="margin-top:14px;" disabled>${escapeHtmlWiz(d.buttonText)}</button>` : ""}
    </div>
    <div class="jh-wizard-nav">
      <button class="jh-btn jh-btn-ghost" id="wizBack">Back</button>
      <button class="jh-btn jh-btn-primary" id="wizPublish">Publish</button>
    </div>
  `);
  document.getElementById("wizBack").addEventListener("click", wizardCreateSectionStep5);
  document.getElementById("wizPublish").addEventListener("click", wizardCreateSectionStep7Publish);
}

async function wizardCreateSectionStep7Publish() {
  const d = WIZARD_STATE.data;
  const slug = d.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);

  wizardShell(`${stepDots(7, 7)}<div class="jh-wizard-title">Publishing…</div><div class="jh-loading"><div class="jh-spin"></div></div>`, { showClose: false });

  const { data: section, error } = await sb.from("homepage_sections").insert({
    name: d.name,
    slug,
    layout: d.layout,
    banner_url: d.images[0] || null,
    description: d.description || null,
    is_published: true,
    is_hidden: false,
    created_by: CURRENT_PROFILE.id,
  }).select().single();

  if (error) {
    wizardShell(`<div class="jh-wizard-title">Could not publish</div><div class="login-msg show error">${escapeHtmlWiz(error.message)}</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-ghost" id="wizDone">Close</button></div>`);
    document.getElementById("wizDone").addEventListener("click", closeWizard);
    return;
  }

  // Insert images as section_items
  const items = d.images.map((url, i) => ({
    section_id: section.id,
    item_type: "image",
    media_url: url,
    display_order: i,
  }));
  if (d.buttonText) {
    items.push({ section_id: section.id, item_type: "button", title: d.buttonText, link_url: d.buttonUrl, display_order: items.length });
  }
  if (items.length) await sb.from("section_items").insert(items);

  await sb.from("activity_logs").insert({ actor_id: CURRENT_PROFILE.id, action: "section.created", target_table: "homepage_sections", target_id: section.id });

  wizardShell(`
    <div class="jh-wizard-title">Section Published 🎉</div>
    <div class="jh-wizard-sub">"${escapeHtmlWiz(d.name)}" is now live on the homepage.</div>
    <div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>
  `);
  document.getElementById("wizDone").addEventListener("click", () => {
    closeWizard();
    if (typeof renderView === "function" && document.querySelector('.jh-nav-link[data-view="sections"]')) {
      document.querySelector('.jh-nav-link[data-view="sections"]').click();
    }
  });
}

/* ============================================================
   EDIT EXISTING SECTION
   ============================================================ */
async function wizardEditSectionList() {
  wizardShell(`<div class="jh-wizard-title">Edit Existing Section</div><div class="jh-loading"><div class="jh-spin"></div></div>`);
  const { data: sections } = await sb.from("homepage_sections").select("*").order("display_order");

  wizardShell(`
    <div class="jh-wizard-title">Edit Existing Section</div>
    <div class="jh-wizard-sub">Choose a section to update.</div>
    <div class="jh-wizard-options">
      ${sections && sections.length ? sections.map((s) => `<button class="jh-wizard-option" data-id="${s.id}">${escapeHtmlWiz(s.name)} <span style="margin-left:auto;color:var(--text-faint);font-weight:500;">${s.is_published ? "Live" : "Draft"}</span></button>`).join("") : `<div class="jh-empty">No sections created yet. Try "Create New Homepage Section" instead.</div>`}
    </div>
  `);
  document.querySelectorAll(".jh-wizard-option[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => wizardEditSectionAddWhat(btn.dataset.id));
  });
}

function wizardEditSectionAddWhat(sectionId) {
  const items = [
    { id: "photo", label: "Photo" },
    { id: "text", label: "Text" },
    { id: "pdf", label: "PDF" },
    { id: "video", label: "Video Link" },
    { id: "button", label: "Button" },
    { id: "stat", label: "Statistic" },
  ];
  wizardShell(`
    <div class="jh-wizard-title">What would you like to add?</div>
    <div class="jh-wizard-options">
      ${items.map((i) => `<button class="jh-wizard-option" data-kind="${i.id}">${i.label}</button>`).join("")}
    </div>
    <div class="jh-wizard-nav"><button class="jh-btn jh-btn-ghost" id="wizBack">Back</button><span></span></div>
  `);
  document.getElementById("wizBack").addEventListener("click", wizardEditSectionList);
  document.querySelectorAll(".jh-wizard-option[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => wizardEditSectionAddItem(sectionId, btn.dataset.kind));
  });
}

function wizardEditSectionAddItem(sectionId, kind) {
  const formsByKind = {
    photo: `<div class="jh-dropzone" id="wizDropzone">Click to choose a photo</div><input type="file" id="wizFileInput" accept="image/*" style="display:none;"><div id="wizUploadMsg" class="login-msg" style="margin-top:10px;"></div>`,
    text: `<div class="login-field"><label>Heading</label><input id="wizTitle" class="login-input"></div><div class="login-field"><label>Body</label><textarea id="wizBody" class="login-input" rows="3" style="resize:vertical;"></textarea></div>`,
    pdf: `<div class="login-field"><label>Title</label><input id="wizTitle" class="login-input"></div><div class="jh-dropzone" id="wizDropzone">Click to choose a PDF</div><input type="file" id="wizFileInput" accept="application/pdf" style="display:none;"><div id="wizUploadMsg" class="login-msg" style="margin-top:10px;"></div>`,
    video: `<div class="login-field"><label>Title</label><input id="wizTitle" class="login-input"></div><div class="login-field"><label>Video URL (YouTube, etc.)</label><input id="wizUrl" type="url" class="login-input" placeholder="https://..."></div>`,
    button: `<div class="login-field"><label>Button Text</label><input id="wizTitle" class="login-input"></div><div class="login-field"><label>Button URL</label><input id="wizUrl" type="url" class="login-input" placeholder="https://..."></div>`,
    stat: `<div class="login-field"><label>Label</label><input id="wizTitle" class="login-input" placeholder="e.g. Pass Rate"></div><div class="login-field"><label>Value</label><input id="wizStatValue" class="login-input" placeholder="e.g. 98%"></div>`,
  };

  wizardShell(`
    <div class="jh-wizard-title">Add ${kind}</div>
    <div id="wizFormArea">${formsByKind[kind]}</div>
    <div class="jh-wizard-nav">
      <button class="jh-btn jh-btn-ghost" id="wizBack">Back</button>
      <button class="jh-btn jh-btn-primary" id="wizSave">Save</button>
    </div>
  `);

  let pendingUrl = null;
  const dz = document.getElementById("wizDropzone");
  const input = document.getElementById("wizFileInput");
  if (dz && input) {
    dz.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const msg = document.getElementById("wizUploadMsg");
      try {
        msg.className = "login-msg show";
        msg.textContent = "Uploading…";
        const bucket = kind === "pdf" ? "documents" : "media";
        const result = await jhUploadMedia(input.files[0], bucket, "section-items", CURRENT_PROFILE.id);
        pendingUrl = result.url;
        msg.className = "login-msg show success";
        msg.textContent = "Uploaded.";
      } catch (err) {
        msg.className = "login-msg show error";
        msg.textContent = err.message;
      }
    });
  }

  document.getElementById("wizBack").addEventListener("click", () => wizardEditSectionAddWhat(sectionId));
  document.getElementById("wizSave").addEventListener("click", async () => {
    const itemTypeMap = { photo: "image", text: "card", pdf: "document", video: "video", button: "button", stat: "stat" };
    const row = {
      section_id: sectionId,
      item_type: itemTypeMap[kind],
      title: document.getElementById("wizTitle")?.value.trim() || null,
      body: document.getElementById("wizBody")?.value.trim() || null,
      link_url: document.getElementById("wizUrl")?.value.trim() || null,
      stat_value: document.getElementById("wizStatValue")?.value.trim() || null,
      media_url: pendingUrl,
    };
    const { error } = await sb.from("section_items").insert(row);
    if (error) {
      alert(error.message); // simple fallback; main forms use inline messages
      return;
    }
    await sb.from("activity_logs").insert({ actor_id: CURRENT_PROFILE.id, action: "section_item.added", target_table: "homepage_sections", target_id: sectionId });
    wizardShell(`<div class="jh-wizard-title">Added ✅</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>`);
    document.getElementById("wizDone").addEventListener("click", closeWizard);
  });
}

/* ============================================================
   ADD ACHIEVER
   ============================================================ */
function wizardAddAchiever() {
  let photoUrl = null;
  wizardShell(`
    <div class="jh-wizard-title">Add Achiever</div>
    <div id="wizMsg" class="login-msg"></div>
    <div class="login-field"><label>Student Name</label><input id="wizName" class="login-input" required></div>
    <div class="login-field"><label>Achievement</label><input id="wizAchievement" class="login-input" placeholder="e.g. NEET 2026 Qualifier"></div>
    <div class="login-field"><label>Rank / Score (optional)</label><input id="wizRank" class="login-input" placeholder="e.g. AIR 412"></div>
    <div class="login-field"><label>Class / Batch (optional)</label><input id="wizClassLabel" class="login-input" placeholder="e.g. 12th PUC Science, Batch 2026"></div>
    <div class="login-field"><label>Photo</label>
      <div class="jh-dropzone" id="wizDropzone">Click to upload photo</div>
      <input type="file" id="wizFileInput" accept="image/*" style="display:none;">
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);margin-bottom:6px;">
      <input type="checkbox" id="wizFeatured"> Pin as featured achiever
    </label>
    <div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizSave">Add Achiever</button></div>
  `);

  document.getElementById("wizDropzone").addEventListener("click", () => document.getElementById("wizFileInput").click());
  document.getElementById("wizFileInput").addEventListener("change", async (e) => {
    const msg = document.getElementById("wizMsg");
    try {
      msg.className = "login-msg show"; msg.textContent = "Uploading photo…";
      const result = await jhUploadMedia(e.target.files[0], "media", "achievers", CURRENT_PROFILE.id);
      photoUrl = result.url;
      msg.className = "login-msg show success"; msg.textContent = "Photo uploaded.";
    } catch (err) {
      msg.className = "login-msg show error"; msg.textContent = err.message;
    }
  });

  document.getElementById("wizSave").addEventListener("click", async () => {
    const msg = document.getElementById("wizMsg");
    const name = document.getElementById("wizName").value.trim();
    if (!name) { msg.className = "login-msg show error"; msg.textContent = "Student name is required."; return; }

    const { error } = await sb.from("achievers").insert({
      student_name: name,
      achievement: document.getElementById("wizAchievement").value.trim() || "Achiever",
      rank_label: document.getElementById("wizRank").value.trim() || null,
      class_label: document.getElementById("wizClassLabel").value.trim() || null,
      photo_url: photoUrl,
      is_featured: document.getElementById("wizFeatured").checked,
      is_published: true,
      created_by: CURRENT_PROFILE.id,
    });

    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; return; }
    wizardShell(`<div class="jh-wizard-title">Achiever Added 🎉</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>`);
    document.getElementById("wizDone").addEventListener("click", closeWizard);
  });
}

/* ============================================================
   ADD GALLERY PHOTOS (bulk)
   ============================================================ */
function wizardAddGallery() {
  const uploaded = [];
  wizardShell(`
    <div class="jh-wizard-title">Add Gallery Photos</div>
    <div class="jh-wizard-sub">Upload as many as you like — each is compressed automatically.</div>
    <div class="jh-dropzone" id="wizDropzone">Click or drag photos here</div>
    <input type="file" id="wizFileInput" accept="image/*" multiple style="display:none;">
    <div class="jh-thumb-grid" id="wizThumbGrid"></div>
    <div id="wizMsg" class="login-msg" style="margin-top:10px;"></div>
    <div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Publish All</button></div>
  `);

  const dz = document.getElementById("wizDropzone");
  const input = document.getElementById("wizFileInput");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("dragover"); handleFiles(e.dataTransfer.files); });
  input.addEventListener("change", () => handleFiles(input.files));

  async function handleFiles(files) {
    const msg = document.getElementById("wizMsg");
    for (const file of files) {
      try {
        msg.className = "login-msg show"; msg.textContent = `Uploading ${file.name}…`;
        const result = await jhUploadMedia(file, "media", "gallery", CURRENT_PROFILE.id);
        uploaded.push(result.url);
        renderThumbs();
        msg.className = "login-msg";
      } catch (err) {
        msg.className = "login-msg show error"; msg.textContent = err.message;
      }
    }
  }
  function renderThumbs() {
    document.getElementById("wizThumbGrid").innerHTML = uploaded.map((u) => `<div class="jh-thumb"><img src="${u}"></div>`).join("");
  }

  document.getElementById("wizDone").addEventListener("click", async () => {
    if (!uploaded.length) { closeWizard(); return; }
    const rows = uploaded.map((url, i) => ({ image_url: url, is_published: true, display_order: i, uploaded_by: CURRENT_PROFILE.id }));
    await sb.from("gallery_items").insert(rows);
    await sb.from("activity_logs").insert({ actor_id: CURRENT_PROFILE.id, action: "gallery.bulk_added", details: { count: rows.length } });
    wizardShell(`<div class="jh-wizard-title">${rows.length} Photo(s) Published 🎉</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizClose2">Done</button></div>`);
    document.getElementById("wizClose2").addEventListener("click", closeWizard);
  });
}

/* ============================================================
   ADD ANNOUNCEMENT / DOWNLOAD (reuse simple forms)
   ============================================================ */
function wizardAddAnnouncement() {
  wizardShell(`
    <div class="jh-wizard-title">Add Announcement</div>
    <div id="wizMsg" class="login-msg"></div>
    <div class="login-field"><label>Title</label><input id="wizTitle" class="login-input" required></div>
    <div class="login-field"><label>Message</label><textarea id="wizBody" class="login-input" rows="3" style="resize:vertical;" required></textarea></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);margin-bottom:14px;">
      <input type="checkbox" id="wizPublic" checked> Show on public homepage
    </label>
    <div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizSave">Post</button></div>
  `);
  document.getElementById("wizSave").addEventListener("click", async () => {
    const msg = document.getElementById("wizMsg");
    const title = document.getElementById("wizTitle").value.trim();
    const body = document.getElementById("wizBody").value.trim();
    if (!title || !body) { msg.className = "login-msg show error"; msg.textContent = "Title and message are required."; return; }
    const { error } = await sb.from("announcements").insert({ title, body, audience: "all", is_public: document.getElementById("wizPublic").checked, created_by: CURRENT_PROFILE.id });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; return; }
    wizardShell(`<div class="jh-wizard-title">Posted ✅</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>`);
    document.getElementById("wizDone").addEventListener("click", closeWizard);
  });
}

function wizardAddDownload() {
  let fileUrl = null;
  wizardShell(`
    <div class="jh-wizard-title">Add Download / PDF</div>
    <div id="wizMsg" class="login-msg"></div>
    <div class="login-field"><label>Title</label><input id="wizTitle" class="login-input" required></div>
    <div class="login-field"><label>Description</label><input id="wizDesc" class="login-input"></div>
    <div class="jh-dropzone" id="wizDropzone">Click to upload PDF</div>
    <input type="file" id="wizFileInput" accept="application/pdf" style="display:none;">
    <div class="jh-wizard-nav" style="margin-top:14px;"><span></span><button class="jh-btn jh-btn-primary" id="wizSave">Add Download</button></div>
  `);
  document.getElementById("wizDropzone").addEventListener("click", () => document.getElementById("wizFileInput").click());
  document.getElementById("wizFileInput").addEventListener("change", async (e) => {
    const msg = document.getElementById("wizMsg");
    try {
      msg.className = "login-msg show"; msg.textContent = "Uploading…";
      const result = await jhUploadMedia(e.target.files[0], "documents", "downloads", CURRENT_PROFILE.id);
      fileUrl = result.url;
      msg.className = "login-msg show success"; msg.textContent = "Uploaded.";
    } catch (err) {
      msg.className = "login-msg show error"; msg.textContent = err.message;
    }
  });
  document.getElementById("wizSave").addEventListener("click", async () => {
    const msg = document.getElementById("wizMsg");
    const title = document.getElementById("wizTitle").value.trim();
    if (!title || !fileUrl) { msg.className = "login-msg show error"; msg.textContent = "Title and a PDF upload are both required."; return; }
    const { error } = await sb.from("downloads").insert({ title, description: document.getElementById("wizDesc").value.trim() || null, file_url: fileUrl, uploaded_by: CURRENT_PROFILE.id });
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; return; }
    wizardShell(`<div class="jh-wizard-title">Added ✅</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>`);
    document.getElementById("wizDone").addEventListener("click", closeWizard);
  });
}

/* ============================================================
   DIRECTOR MESSAGE / HERO BANNER / HOMEPAGE STATS
   All read/write the site_settings key-value table.
   ============================================================ */
async function wizardDirectorMessage() {
  wizardShell(`<div class="jh-wizard-title">Director Message</div><div class="jh-loading"><div class="jh-spin"></div></div>`);
  const { data } = await sb.from("site_settings").select("value").eq("key", "director_message").single();
  const v = data?.value || {};
  let photoUrl = v.photo_url || null;

  wizardShell(`
    <div class="jh-wizard-title">Update Director Message</div>
    <div id="wizMsg" class="login-msg"></div>
    <div class="login-field"><label>Name</label><input id="wizName" class="login-input" value="${escapeHtmlWiz(v.name || "")}"></div>
    <div class="login-field"><label>Title</label><input id="wizTitle" class="login-input" value="${escapeHtmlWiz(v.title || "")}" placeholder="e.g. Director"></div>
    <div class="login-field"><label>Message</label><textarea id="wizBody" class="login-input" rows="4" style="resize:vertical;">${escapeHtmlWiz(v.message || "")}</textarea></div>
    <div class="login-field"><label>Photo</label>
      <div class="jh-dropzone" id="wizDropzone">${photoUrl ? "Click to replace photo" : "Click to upload photo"}</div>
      <input type="file" id="wizFileInput" accept="image/*" style="display:none;">
    </div>
    <div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizSave">Save</button></div>
  `);

  document.getElementById("wizDropzone").addEventListener("click", () => document.getElementById("wizFileInput").click());
  document.getElementById("wizFileInput").addEventListener("change", async (e) => {
    const msg = document.getElementById("wizMsg");
    try {
      msg.className = "login-msg show"; msg.textContent = "Uploading…";
      const result = await jhUploadMedia(e.target.files[0], "media", "director", CURRENT_PROFILE.id);
      photoUrl = result.url;
      msg.className = "login-msg show success"; msg.textContent = "Photo uploaded.";
    } catch (err) {
      msg.className = "login-msg show error"; msg.textContent = err.message;
    }
  });

  document.getElementById("wizSave").addEventListener("click", async () => {
    const msg = document.getElementById("wizMsg");
    const newValue = {
      name: document.getElementById("wizName").value.trim(),
      title: document.getElementById("wizTitle").value.trim(),
      message: document.getElementById("wizBody").value.trim(),
      photo_url: photoUrl,
    };
    const { error } = await sb.from("site_settings").update({ value: newValue, updated_by: CURRENT_PROFILE.id, updated_at: new Date().toISOString() }).eq("key", "director_message");
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; return; }
    wizardShell(`<div class="jh-wizard-title">Saved ✅</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>`);
    document.getElementById("wizDone").addEventListener("click", closeWizard);
  });
}

async function wizardHeroBanner() {
  wizardShell(`<div class="jh-wizard-title">Hero Banner</div><div class="jh-loading"><div class="jh-spin"></div></div>`);
  const { data } = await sb.from("site_settings").select("value").eq("key", "hero_banner").single();
  const v = data?.value || {};
  let imageUrl = v.image_url || null;

  wizardShell(`
    <div class="jh-wizard-title">Replace Hero Banner</div>
    <div id="wizMsg" class="login-msg"></div>
    <div class="jh-dropzone" id="wizDropzone">${imageUrl ? "Click to replace banner image" : "Click to upload banner image"}</div>
    <input type="file" id="wizFileInput" accept="image/*" style="display:none;">
    <div class="login-field" style="margin-top:14px;"><label>Headline</label><input id="wizHeadline" class="login-input" value="${escapeHtmlWiz(v.headline || "")}"></div>
    <div class="login-field"><label>Subheadline</label><input id="wizSub" class="login-input" value="${escapeHtmlWiz(v.subheadline || "")}"></div>
    <div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizSave">Save</button></div>
  `);

  document.getElementById("wizDropzone").addEventListener("click", () => document.getElementById("wizFileInput").click());
  document.getElementById("wizFileInput").addEventListener("change", async (e) => {
    const msg = document.getElementById("wizMsg");
    try {
      msg.className = "login-msg show"; msg.textContent = "Uploading…";
      const result = await jhUploadMedia(e.target.files[0], "media", "hero", CURRENT_PROFILE.id);
      imageUrl = result.url;
      msg.className = "login-msg show success"; msg.textContent = "Banner uploaded.";
    } catch (err) {
      msg.className = "login-msg show error"; msg.textContent = err.message;
    }
  });

  document.getElementById("wizSave").addEventListener("click", async () => {
    const msg = document.getElementById("wizMsg");
    const newValue = { image_url: imageUrl, headline: document.getElementById("wizHeadline").value.trim(), subheadline: document.getElementById("wizSub").value.trim() };
    const { error } = await sb.from("site_settings").update({ value: newValue, updated_by: CURRENT_PROFILE.id, updated_at: new Date().toISOString() }).eq("key", "hero_banner");
    if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; return; }
    wizardShell(`<div class="jh-wizard-title">Saved ✅</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>`);
    document.getElementById("wizDone").addEventListener("click", closeWizard);
  });
}

async function wizardHomepageStats() {
  wizardShell(`<div class="jh-wizard-title">Homepage Statistics</div><div class="jh-loading"><div class="jh-spin"></div></div>`);
  const { data } = await sb.from("site_settings").select("value").eq("key", "homepage_stats").single();
  let items = (data?.value?.items) || [];

  function render() {
    wizardShell(`
      <div class="jh-wizard-title">Manage Homepage Statistics</div>
      <div id="wizMsg" class="login-msg"></div>
      <div id="statRows">
        ${items.map((it, i) => `
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input class="login-input stat-label" data-i="${i}" value="${escapeHtmlWiz(it.label || "")}" placeholder="Label, e.g. Years of Excellence">
            <input class="login-input stat-value" data-i="${i}" value="${escapeHtmlWiz(it.value || "")}" placeholder="Value, e.g. 25+" style="width:110px;">
            <button class="jh-btn jh-btn-ghost rm-stat" data-i="${i}" style="padding:8px 10px;">✕</button>
          </div>
        `).join("")}
      </div>
      <button class="jh-btn jh-btn-ghost" id="addStatBtn" style="margin-bottom:16px;">+ Add Statistic</button>
      <div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizSave">Save</button></div>
    `);

    document.querySelectorAll(".stat-label, .stat-value").forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = parseInt(inp.dataset.i);
        items[i] = items[i] || {};
        items[i][inp.classList.contains("stat-label") ? "label" : "value"] = inp.value;
      });
    });
    document.querySelectorAll(".rm-stat").forEach((btn) => btn.addEventListener("click", () => { items.splice(parseInt(btn.dataset.i), 1); render(); }));
    document.getElementById("addStatBtn").addEventListener("click", () => { items.push({ label: "", value: "" }); render(); });
    document.getElementById("wizSave").addEventListener("click", async () => {
      const msg = document.getElementById("wizMsg");
      const { error } = await sb.from("site_settings").update({ value: { items }, updated_by: CURRENT_PROFILE.id, updated_at: new Date().toISOString() }).eq("key", "homepage_stats");
      if (error) { msg.className = "login-msg show error"; msg.textContent = error.message; return; }
      wizardShell(`<div class="jh-wizard-title">Saved ✅</div><div class="jh-wizard-nav"><span></span><button class="jh-btn jh-btn-primary" id="wizDone">Done</button></div>`);
      document.getElementById("wizDone").addEventListener("click", closeWizard);
    });
  }
  render();
}

/* ---------------------------------------------------------- */
function escapeHtmlWiz(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
