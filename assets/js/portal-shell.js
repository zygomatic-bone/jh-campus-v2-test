/* ============================================================
   JH+ PORTAL SHELL — shared dashboard behavior
   Call jhInitShell(profile) after authGuard() resolves on every
   portal page to wire up the sidebar footer + mobile toggle.
   ============================================================ */

function jhInitShell(profile) {
  const nameEl = document.getElementById("jhUserName");
  const roleEl = document.getElementById("jhUserRole");
  const avatarEl = document.getElementById("jhUserAvatar");
  const logoutBtn = document.getElementById("jhLogoutBtn");
  const mobileToggle = document.getElementById("jhMobileToggle");
  const sidebar = document.getElementById("jhSidebar");
  const overlay = document.getElementById("jhSidebarOverlay");

  if (nameEl) nameEl.textContent = profile.full_name || profile.email;
  if (roleEl) roleEl.textContent = (profile.role || "").replace("_", " ");
  if (avatarEl) {
    if (profile.profile_photo_url) {
      avatarEl.innerHTML = `<img src="${profile.profile_photo_url}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      const initial = (profile.full_name || profile.email || "?").charAt(0).toUpperCase();
      avatarEl.textContent = initial;
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const role = profile.role === "super_admin" ? "super-admin" : profile.role;
      await jhLogout(`${window.JH_SITE_ROOT}${role}/login.html`);
    });
  }

  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener("click", () => {
      sidebar.classList.add("open");
      if (overlay) overlay.classList.add("show");
    });
  }
  if (overlay && sidebar) {
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("show");
    });
  }
}

/**
 * Tiny helper to format a Postgres date/timestamp into a readable string.
 */
function jhFormatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
