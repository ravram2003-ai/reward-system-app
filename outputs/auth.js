/**
 * Pointwell auth module (ES module).
 *
 * Wraps supabase-js v2 (loaded from the esm.sh CDN) for email/password accounts:
 * sign up, sign in, sign out, restore session on load, and getCurrentUser().
 * It owns all Supabase interaction; the rest of the app reacts to `pointwell:auth`
 * DOM events ({ status: 'signed-in' | 'signed-out' | 'unconfigured' | 'error' }).
 *
 * Only the anon/public key is ever used here. No service_role key. All access
 * control is enforced by RLS policies in the database.
 */
(async function () {
  const helpers = window.PointwellAuthHelpers;
  const config = window.POINTWELL_SUPABASE || {};

  function emit(status, detail) {
    const payload = Object.assign({ status: status }, detail || {});
    window.__pointwellAuthState = payload;
    document.dispatchEvent(new CustomEvent("pointwell:auth", { detail: payload }));
  }

  function whenReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function setAuthError(message) {
    const el = document.getElementById("authError");
    if (el) {
      el.textContent = message || "";
      el.hidden = !message;
    }
  }

  function setAuthBusy(busy) {
    const form = document.getElementById("authForm");
    if (form) Array.from(form.querySelectorAll("button, input")).forEach((node) => { node.disabled = !!busy; });
  }

  // ── Not configured → local mode (app keeps working without accounts) ──────
  if (!helpers || !helpers.isSupabaseConfigured(config)) {
    const notConfigured = async () => ({ error: { message: "Supabase is not configured yet." } });
    window.PointwellAuth = {
      isConfigured: () => false,
      signUp: notConfigured,
      signIn: notConfigured,
      signOut: async () => {},
      getCurrentUser: async () => null
    };
    whenReady(() => emit("unconfigured"));
    return;
  }

  let createClient;
  try {
    ({ createClient } = await import("https://esm.sh/@supabase/supabase-js@2"));
  } catch (error) {
    window.PointwellAuth = {
      isConfigured: () => true,
      signUp: async () => ({ error: { message: "Auth library failed to load." } }),
      signIn: async () => ({ error: { message: "Auth library failed to load." } }),
      signOut: async () => {},
      getCurrentUser: async () => null
    };
    whenReady(() => emit("error", { message: "Couldn't load the sign-in library. Check your connection and reload." }));
    return;
  }

  const supabase = createClient(config.url, config.anonKey);

  async function loadProfileRow(userId) {
    try {
      const { data } = await supabase.from("profiles").select("display_name, handle").eq("id", userId).maybeSingle();
      return data || null;
    } catch (error) {
      return null; // profiles table optional; fall back to email-derived identity
    }
  }

  async function publishSession(session) {
    const user = session && session.user ? session.user : null;
    if (!user) {
      emit("signed-out");
      return;
    }
    const row = await loadProfileRow(user.id);
    emit("signed-in", {
      user: { id: user.id, email: user.email },
      profile: helpers.deriveProfileFromUser(user, row)
    });
  }

  window.PointwellAuth = {
    isConfigured: () => true,
    signUp: async (email, password, displayName) => {
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { display_name: displayName || helpers.nameFromEmail(email) },
          // Return the confirmation link to the exact URL the user signed up from
          // (works for both the live GitHub Pages URL and local testing).
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });
      return { data: data, error: error, needsConfirmation: !!(data && !data.session) };
    },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email, password: password });
      return { error: error };
    },
    signOut: async () => { await supabase.auth.signOut(); },
    getCurrentUser: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data || !data.user) return null;
      return helpers.deriveProfileFromUser(data.user, await loadProfileRow(data.user.id));
    }
  };

  // React to all future auth changes (sign in / out / token refresh).
  supabase.auth.onAuthStateChange((_event, session) => { publishSession(session); });

  // Restore an existing session on load.
  const { data: sessionData } = await supabase.auth.getSession();
  await publishSession(sessionData && sessionData.session ? sessionData.session : null);

  // ── Auth form wiring (sign in / sign up toggle) ───────────────────────────
  whenReady(function () {
    const form = document.getElementById("authForm");
    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    const toggle = document.getElementById("authToggle");
    const submit = document.getElementById("authSubmit");
    const heading = document.getElementById("authHeading");
    const signOutButton = document.getElementById("signOutButton");
    let mode = "signin"; // or 'signup'

    function applyMode() {
      if (heading) heading.textContent = mode === "signup" ? "Create your account" : "Welcome back";
      if (submit) submit.textContent = mode === "signup" ? "Create account" : "Sign in";
      if (toggle) toggle.textContent = mode === "signup" ? "Have an account? Sign in" : "New here? Create an account";
      setAuthError("");
    }

    if (toggle) toggle.addEventListener("click", function () {
      mode = mode === "signup" ? "signin" : "signup";
      applyMode();
    });
    applyMode();

    if (form) form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setAuthError("");
      const email = (emailInput && emailInput.value || "").trim();
      const password = passwordInput && passwordInput.value || "";
      if (!email || !password) { setAuthError("Enter your email and password."); return; }
      setAuthBusy(true);
      try {
        if (mode === "signup") {
          const result = await window.PointwellAuth.signUp(email, password);
          if (result.error) { setAuthError(result.error.message); return; }
          if (result.needsConfirmation) {
            mode = "signin";
            applyMode();
            setAuthError("Account created — check your email to confirm, then sign in.");
            return;
          }
          // confirmed signups sign in automatically via onAuthStateChange
        } else {
          const result = await window.PointwellAuth.signIn(email, password);
          if (result.error) { setAuthError(result.error.message); return; }
        }
      } finally {
        setAuthBusy(false);
        if (passwordInput) passwordInput.value = "";
      }
    });

    if (signOutButton) signOutButton.addEventListener("click", async function () {
      await window.PointwellAuth.signOut();
    });
  });
})();
