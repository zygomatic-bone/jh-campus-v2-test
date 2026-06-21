/* ============================================================
   JH+ PUBLIC HOMEPAGE — Dynamic Section Renderer
   ------------------------------------------------------------
   Fetches Super-Admin-published homepage_sections (+ items) and
   renders them into #jhDynamicSections. No login required — the
   public RLS policy on homepage_sections/section_items allows
   anonymous reads of is_published=true, is_hidden=false rows.

   This is what makes "new sections appear automatically without
   touching code" actually true, rather than just a CMS that has
   no effect on the live site.
   ============================================================ */
(async function () {
  const container = document.getElementById("jhDynamicSections");
  if (!container || !window.supabaseClient) return;
  const sb = window.supabaseClient;

  const [{ data: sections }, { data: achievers }, { data: gallery }, { data: announcements }, { data: settingsRows }] = await Promise.all([
    sb.from("homepage_sections").select("*, section_items(*)").eq("is_published", true).eq("is_hidden", false).order("display_order"),
    sb.from("achievers").select("*").eq("is_published", true).order("display_order").limit(12),
    sb.from("gallery_items").select("*").eq("is_published", true).order("display_order").limit(12),
    sb.from("announcements").select("*").eq("is_public", true).order("created_at", { ascending: false }).limit(5),
    sb.from("site_settings").select("key, value"),
  ]);

  const settings = {};
  (settingsRows || []).forEach((r) => { settings[r.key] = r.value; });

  // Hero override: only touches the DOM if a Super Admin has actually
  // entered a value via the wizard. Leaves the original hardcoded hero
  // (video, animations, existing stats) completely untouched otherwise —
  // per the "do not change existing design" rule from the integration phase.
  const hero = settings.hero_banner;
  if (hero && (hero.headline || hero.subheadline || hero.image_url)) {
    const headlineEl = document.getElementById("jhHeroHeadline");
    const subEl = document.getElementById("jhHeroSub");
    const bgEl = document.querySelector(".hero-vbg");
    if (hero.headline && headlineEl) headlineEl.textContent = hero.headline;
    if (hero.subheadline && subEl) subEl.textContent = hero.subheadline;
    if (hero.image_url && bgEl) bgEl.style.backgroundImage = `url('${hero.image_url}')`;
  }

  const stats = settings.homepage_stats;
  if (stats && stats.items && stats.items.length) {
    const statsEl = document.getElementById("jhHeroStats");
    if (statsEl) {
      statsEl.innerHTML = stats.items.map((s) => `<div class="stat"><div class="num">${escapeHtml(s.value || "")}</div><div class="lab">${escapeHtml(s.label || "")}</div></div>`).join("");
    }
  }

  let html = "";

  // Director message: rendered as a SEPARATE additive block, not a
  // replacement for the existing Rector's Message modal/content —
  // only appears if a Super Admin has filled it in via the wizard.
  const director = settings.director_message;
  if (director && director.message) {
    html += `
      <section style="padding:60px 24px 20px;">
        <div style="max-width:900px;margin:0 auto;display:flex;gap:28px;align-items:start;flex-wrap:wrap;">
          ${director.photo_url ? `<img src="${escapeHtml(director.photo_url)}" alt="" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,168,87,.4);flex-shrink:0;">` : ""}
          <div style="flex:1;min-width:240px;">
            <div style="color:var(--gold);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(director.title || "A Message")}</div>
            <p style="color:var(--text-dim);font-size:15px;line-height:1.7;">${escapeHtml(director.message)}</p>
            ${director.name ? `<div style="color:var(--text);font-weight:700;font-size:14px;margin-top:12px;">${escapeHtml(director.name)}</div>` : ""}
          </div>
        </div>
      </section>
    `;
  }

  if (announcements && announcements.length) {
    html += `
      <section style="padding:60px 24px 20px;">
        <div style="max-width:1100px;margin:0 auto;">
          <h2 style="font-size:clamp(24px,3.6vw,32px);font-weight:800;letter-spacing:-0.02em;margin-bottom:24px;color:var(--text);">Latest Announcements</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;">
            ${announcements.map((a) => `
              <div style="padding:20px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);">
                <div style="font-weight:700;font-size:14.5px;margin-bottom:6px;color:var(--text);">${escapeHtml(a.title)}</div>
                <div style="color:var(--text-dim);font-size:13.5px;line-height:1.55;">${escapeHtml(a.body)}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </section>
    `;
  }

  if (achievers && achievers.length) {
    html += `
      <section style="padding:60px 24px;">
        <div style="max-width:1100px;margin:0 auto;">
          <h2 style="font-size:clamp(24px,3.6vw,32px);font-weight:800;letter-spacing:-0.02em;margin-bottom:24px;color:var(--text);">Our Achievers</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;">
            ${achievers.map((a) => `
              <div style="text-align:center;padding:22px 16px;border-radius:16px;background:${a.is_featured ? "rgba(212,168,87,.1)" : "rgba(255,255,255,.04)"};border:1px solid ${a.is_featured ? "rgba(212,168,87,.35)" : "rgba(255,255,255,.08)"};">
                ${a.photo_url ? `<img src="${escapeHtml(a.photo_url)}" loading="lazy" alt="" style="width:84px;height:84px;border-radius:50%;object-fit:cover;margin:0 auto 14px;display:block;border:2px solid rgba(212,168,87,.4);">` : `<div style="width:84px;height:84px;border-radius:50%;background:var(--surface);margin:0 auto 14px;"></div>`}
                <div style="font-weight:700;font-size:14.5px;color:var(--text);">${escapeHtml(a.student_name)}</div>
                ${a.rank_label ? `<div style="color:var(--gold);font-size:13px;font-weight:600;margin-top:3px;">${escapeHtml(a.rank_label)}</div>` : ""}
                <div style="color:var(--text-dim);font-size:12.5px;margin-top:4px;">${escapeHtml(a.achievement)}</div>
                ${a.class_label ? `<div style="color:var(--text-faint);font-size:11px;margin-top:4px;">${escapeHtml(a.class_label)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        </div>
      </section>
    `;
  }

  if (gallery && gallery.length) {
    html += `
      <section style="padding:60px 24px;">
        <div style="max-width:1100px;margin:0 auto;">
          <h2 style="font-size:clamp(24px,3.6vw,32px);font-weight:800;letter-spacing:-0.02em;margin-bottom:24px;color:var(--text);">Gallery</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">
            ${gallery.map((g) => `<img src="${escapeHtml(g.image_url)}" loading="lazy" alt="${escapeHtml(g.caption || g.title || "")}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;">`).join("")}
          </div>
        </div>
      </section>
    `;
  }

  if (sections && sections.length) {
    html += sections.map(renderSection).join("");
  }

  if (html) container.innerHTML = html;

  function renderSection(section) {
    const items = (section.section_items || []).sort((a, b) => a.display_order - b.display_order);

    return `
      <section class="jh-dyn-section" style="padding:80px 24px;">
        <div style="max-width:1100px;margin:0 auto;">
          ${section.banner_url ? `<img src="${escapeHtml(section.banner_url)}" alt="" style="width:100%;max-height:320px;object-fit:cover;border-radius:20px;margin-bottom:32px;">` : ""}
          <h2 style="font-size:clamp(26px,4vw,38px);font-weight:800;letter-spacing:-0.02em;margin-bottom:12px;color:var(--text);">${escapeHtml(section.name)}</h2>
          ${section.description ? `<p style="color:var(--text-dim);font-size:16px;max-width:680px;line-height:1.7;margin-bottom:36px;">${escapeHtml(section.description)}</p>` : ""}
          ${renderItemsByLayout(section.layout, items)}
        </div>
      </section>
    `;
  }

  function renderItemsByLayout(layout, items) {
    const images = items.filter((i) => i.item_type === "image");
    const buttons = items.filter((i) => i.item_type === "button");
    const stats = items.filter((i) => i.item_type === "stat");
    const cards = items.filter((i) => i.item_type === "card");
    const docs = items.filter((i) => i.item_type === "document");
    const videos = items.filter((i) => i.item_type === "video");

    let html = "";

    if (layout === "statistics" && stats.length) {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:20px;margin-bottom:24px;">
        ${stats.map((s) => `
          <div style="text-align:center;padding:24px;border-radius:18px;background:rgba(212,168,87,.08);border:1px solid rgba(212,168,87,.2);">
            <div style="font-size:32px;font-weight:800;color:var(--gold);">${escapeHtml(s.stat_value || "")}</div>
            <div style="font-size:13px;color:var(--text-dim);margin-top:6px;">${escapeHtml(s.title || "")}</div>
          </div>
        `).join("")}
      </div>`;
    } else if (images.length) {
      const gridStyle = layout === "gallery"
        ? "grid-template-columns:repeat(auto-fill,minmax(220px,1fr));"
        : "grid-template-columns:repeat(auto-fit,minmax(260px,1fr));";
      html += `<div style="display:grid;${gridStyle}gap:18px;margin-bottom:24px;">
        ${images.map((img) => `<img src="${escapeHtml(img.media_url)}" loading="lazy" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;">`).join("")}
      </div>`;
    }

    if (cards.length) {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-bottom:24px;">
        ${cards.map((c) => `
          <div style="padding:22px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);">
            ${c.title ? `<div style="font-weight:700;font-size:16px;margin-bottom:8px;color:var(--text);">${escapeHtml(c.title)}</div>` : ""}
            ${c.body ? `<div style="color:var(--text-dim);font-size:14px;line-height:1.6;">${escapeHtml(c.body)}</div>` : ""}
          </div>
        `).join("")}
      </div>`;
    }

    if (docs.length) {
      html += `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px;">
        ${docs.map((d) => `<a href="${escapeHtml(d.link_url || d.media_url)}" target="_blank" rel="noopener" style="padding:10px 18px;border-radius:980px;background:rgba(212,168,87,.12);color:var(--gold);border:1px solid rgba(212,168,87,.3);font-size:13.5px;font-weight:600;">${escapeHtml(d.title || "Download")}</a>`).join("")}
      </div>`;
    }

    if (videos.length) {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-bottom:24px;">
        ${videos.map((v) => `<a href="${escapeHtml(v.link_url)}" target="_blank" rel="noopener" style="display:block;padding:16px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:var(--text);font-size:14px;font-weight:600;">▶ ${escapeHtml(v.title || "Watch Video")}</a>`).join("")}
      </div>`;
    }

    if (buttons.length) {
      html += `<div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${buttons.map((b) => `<a href="${escapeHtml(b.link_url || "#")}" target="_blank" rel="noopener" class="btn-primary" style="display:inline-block;">${escapeHtml(b.title || "Learn More")}</a>`).join("")}
      </div>`;
    }

    return html;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
})();
