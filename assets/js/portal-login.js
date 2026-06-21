/* ============================================================
   JH+ PORTAL LOGIN — SHARED PAGE BEHAVIOR
   Used by all six login pages. Each page sets window.JH_PORTAL_ROLE
   before loading this script.
   ============================================================ */
(function () {
  const ROLE = window.JH_PORTAL_ROLE;
  const ROLE_LABEL = {
    student: "Student",
    teacher: "Teacher",
    principal: "Principal",
    trust_member: "Trust Member",
    admin: "Admin",
    super_admin: "Super Admin",
  }[ROLE] || "Portal";

  document.addEventListener("DOMContentLoaded", async () => {
    // If already logged in with the right role, skip the form entirely.
    await jhRedirectIfLoggedIn();

    const form = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const toggleBtn = document.getElementById("togglePw");
    const rememberInput = document.getElementById("remember");
    const forgotBtn = document.getElementById("forgotBtn");
    const googleBtn = document.getElementById("googleBtn");
    const submitBtn = document.getElementById("submitBtn");
    const msg = document.getElementById("loginMsg");

    // Restore remembered email, if any.
    const rememberedEmail = localStorage.getItem("jh_remember_email_" + ROLE);
    if (rememberedEmail && emailInput) {
      emailInput.value = rememberedEmail;
      if (rememberInput) rememberInput.checked = true;
    }

    function showMsg(text, type) {
      if (!msg) return;
      msg.textContent = text;
      msg.className = "login-msg show " + type;
    }
    function hideMsg() {
      if (!msg) return;
      msg.className = "login-msg";
    }

    if (toggleBtn && passwordInput) {
      toggleBtn.addEventListener("click", () => {
        const isPw = passwordInput.type === "password";
        passwordInput.type = isPw ? "text" : "password";
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideMsg();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
          showMsg("Please enter both email and password.", "error");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spin"></span>Signing in…';

        const result = await jhLoginWithPassword(email, password);

        if (!result.success) {
          showMsg(result.error || "Login failed. Please check your credentials.", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = `Sign in to ${ROLE_LABEL} Portal`;
          return;
        }

        if (result.profile.role !== ROLE) {
          showMsg(
            `This account is registered as ${result.profile.role.replace("_", " ")}, not ${ROLE_LABEL.toLowerCase()}. Please use the correct portal.`,
            "error"
          );
          await jhLogout.call(null); // sign out the mismatched session
          submitBtn.disabled = false;
          submitBtn.textContent = `Sign in to ${ROLE_LABEL} Portal`;
          return;
        }

        if (rememberInput && rememberInput.checked) {
          localStorage.setItem("jh_remember_email_" + ROLE, email);
        } else {
          localStorage.removeItem("jh_remember_email_" + ROLE);
        }

        showMsg("Signed in. Redirecting…", "success");

        if (result.profile.must_change_password) {
          window.location.href = `force-password-change.html`;
        } else {
          window.location.href = JH_ROLE_HOME[ROLE] || "/index.html";
        }
      });
    }

    if (forgotBtn) {
      forgotBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        if (!email) {
          showMsg("Enter your email above first, then click Forgot Password.", "error");
          return;
        }
        hideMsg();
        forgotBtn.disabled = true;
        const result = await jhSendPasswordReset(email);
        forgotBtn.disabled = false;

        if (result.success) {
          showMsg("Password reset link sent. Check your email.", "success");
        } else {
          showMsg(result.error || "Could not send reset email.", "error");
        }
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener("click", async () => {
        hideMsg();
        const result = await jhLoginWithGoogle(window.location.origin + window.location.pathname.replace("login.html", "oauth-callback.html") + "?role=" + ROLE);
        if (!result.success) {
          showMsg(result.error || "Google sign-in failed.", "error");
        }
        // On success, Supabase redirects the browser away — nothing else to do here.
      });
    }
  });
})();
