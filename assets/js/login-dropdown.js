/* ============================================================
   JH+ PUBLIC SITE — LOGIN DROPDOWN BEHAVIOR
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const dd = document.getElementById("loginDropdown");
  if (!dd) return;
  const btn = dd.querySelector(".login-dd-btn");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dd.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target)) dd.classList.remove("open");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dd.classList.remove("open");
  });
});
