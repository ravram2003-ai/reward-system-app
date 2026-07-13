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
      signInWithOAuth: notConfigured,
      signOut: async () => {},
      getCurrentUser: async () => null,
      getClient: () => null
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
      signInWithOAuth: async () => ({ error: { message: "Auth library failed to load." } }),
      signOut: async () => {},
      getCurrentUser: async () => null,
      getClient: () => null
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
    // Unified "Continue with Apple/Google": signs in an existing user OR creates an account
    // for a new one — Supabase treats OAuth as a single upsert-on-first-login flow.
    // skipBrowserRedirect lets us catch a synchronous { error } BEFORE navigating; on success
    // we do the redirect ourselves. NOTE: supabase builds the /authorize URL client-side
    // without validating the provider, so a provider that isn't enabled in the Supabase
    // dashboard does NOT resolve with an { error } here — it redirects and GoTrue rejects it
    // server-side. That rejection comes back as an ?error=/#error= fragment which the app
    // surfaces via surfaceOAuthRedirectError() on reload (and the providers must still be
    // enabled in the dashboard for the buttons to actually complete).
    signInWithOAuth: async (provider) => {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: provider,
          options: {
            redirectTo: window.location.origin + window.location.pathname,
            skipBrowserRedirect: true
          }
        });
        if (error) return { error: error };
        if (data && data.url) { window.location.assign(data.url); }
        return { data: data, error: null };
      } catch (error) {
        return { error: error || { message: "Sign-in failed." } };
      }
    },
    signOut: async () => { await supabase.auth.signOut(); },
    getCurrentUser: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data || !data.user) return null;
      return helpers.deriveProfileFromUser(data.user, await loadProfileRow(data.user.id));
    },
    // The authenticated client, shared so feature modules (e.g. signals) run
    // their RLS-enforced reads/writes through the SAME session — never a 2nd client.
    getClient: () => supabase
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
    const providers = document.getElementById("authProviders");
    const emailButton = document.getElementById("authEmailButton");
    const backButton = document.getElementById("authBackButton");
    let mode = "signin"; // or 'signup'

    function applyMode() {
      if (heading) heading.textContent = mode === "signup" ? "Create your account" : "Welcome back";
      if (submit) submit.textContent = mode === "signup" ? "Create account" : "Sign in";
      // innerHTML (static strings, no user input) so the "Create an account"/"Sign in" part
      // keeps its accent styling from the hero's .auth-toggle-link span.
      if (toggle) toggle.innerHTML = mode === "signup"
        ? 'Have an account? <span>Sign in</span>'
        : 'New here? <span>Create an account</span>';
      setAuthError("");
    }

    // Sign-in-FIRST: the provider buttons lead; the email form is revealed on demand and
    // defaults to sign-in. The toggle ("Create an account") is the ONLY path to sign-up.
    function showEmailForm(signup) {
      mode = signup ? "signup" : "signin";
      if (providers) providers.hidden = true;
      if (form) form.hidden = false;
      applyMode();
      if (emailInput) { try { emailInput.focus(); } catch (e) { /* focus is best-effort */ } }
    }
    function showProviders() {
      mode = "signin";
      if (form) form.hidden = true;
      if (providers) providers.hidden = false;
      applyMode();
      // The back button lives inside the (now hidden) form, so focus would fall to <body>;
      // move it to the first provider control instead.
      if (emailButton) { try { emailButton.focus(); } catch (e) { /* focus is best-effort */ } }
    }

    if (emailButton) emailButton.addEventListener("click", function () { showEmailForm(false); });
    if (backButton) backButton.addEventListener("click", function () { showProviders(); });

    // Sign-out is same-tab (no reload), so reset the hero to its providers-lead, sign-in
    // default — otherwise a returning/next user on a shared device would land on whatever
    // sub-state (e.g. the sign-up form) the previous session left behind.
    document.addEventListener("pointwell:auth", function (e) {
      if (e && e.detail && e.detail.status === "signed-out") showProviders();
    });

    if (toggle) toggle.addEventListener("click", function () {
      // From the provider view (form hidden) the toggle opens the email form straight into
      // sign-up; once the form is showing it just flips sign-in <-> sign-up.
      if (form && form.hidden) { showEmailForm(true); return; }
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
