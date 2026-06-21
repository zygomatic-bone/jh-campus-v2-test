/* ============================================================
   JH+ PUBLIC SITE — THEME TOGGLE
   Light Mode is default for first-time visitors. Returning
   visitors get their saved preference restored automatically.
   This script is intentionally tiny and dependency-free.
   ============================================================ */
(function () {
  const STORAGE_KEY = "jh_theme";

  function applyTheme(theme, animate) {
    const root = document.documentElement;
    if (animate) {
      root.classList.add("theme-transition");
      window.setTimeout(() => root.classList.remove("theme-transition"), 450);
    }
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }

  // Apply saved (or default light) theme ASAP — this script is loaded
  // in <head> specifically so there is no flash of the wrong theme.
  const saved = localStorage.getItem(STORAGE_KEY);
  applyTheme(saved || "light", false);

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const next = isLight ? "dark" : "light";
      applyTheme(next, true);
      localStorage.setItem(STORAGE_KEY, next);
    });
  });
})();
