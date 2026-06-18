/**
 * Pointwell auth helpers — PURE functions only (no DOM, no network, no Supabase).
 * Loaded as a classic script in the browser (window.PointwellAuthHelpers) and
 * required by the node test harness (module.exports). Keep this dependency-free
 * so the auth flows have a testable core.
 */
(function (root) {
  var PLACEHOLDER = /YOUR_SUPABASE|^$/i;

  // Is the Supabase config real (not the shipped placeholder)?
  function isSupabaseConfigured(config) {
    if (!config || typeof config !== "object") return false;
    var url = String(config.url || "");
    var key = String(config.anonKey || "");
    if (PLACEHOLDER.test(url) || PLACEHOLDER.test(key)) return false;
    return /^https?:\/\//i.test(url) && key.length >= 20;
  }

  function emailLocalPart(email) {
    return String(email || "").trim().split("@")[0] || "";
  }

  // "@handle" from an email local part (lowercase, alphanumerics + . _ -)
  function handleFromEmail(email) {
    var local = emailLocalPart(email).toLowerCase().replace(/[^a-z0-9._-]/g, "");
    return local ? "@" + local : "@member";
  }

  // A friendly display name from an email local part ("ada.lovelace" -> "Ada Lovelace")
  function nameFromEmail(email) {
    var local = emailLocalPart(email).replace(/[._-]+/g, " ").trim();
    if (!local) return "Member";
    return local.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /**
   * Normalize a Supabase auth user (+ optional profiles row) into the shape
   * Pointwell uses for the current user. Prefers the saved profile row, then
   * signup metadata, then a sensible default derived from the email.
   *
   * user = { id, email, user_metadata?: { display_name?, handle? } }
   * profileRow = { display_name?, handle? } | null
   */
  function deriveProfileFromUser(user, profileRow) {
    user = user || {};
    profileRow = profileRow || {};
    var meta = user.user_metadata || {};
    var email = user.email || "";
    var name = profileRow.display_name || meta.display_name || nameFromEmail(email);
    var handleSource = profileRow.handle || meta.handle || handleFromEmail(email);
    var raw = String(handleSource || "").replace(/^@+/, "");
    // A handle must contain at least one alphanumeric char; otherwise fall back.
    var handle = /[a-z0-9]/i.test(raw) ? "@" + raw : "@member";
    return {
      userId: user.id || "",
      email: email,
      name: name,
      handle: handle
    };
  }

  var api = {
    isSupabaseConfigured: isSupabaseConfigured,
    handleFromEmail: handleFromEmail,
    nameFromEmail: nameFromEmail,
    deriveProfileFromUser: deriveProfileFromUser
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellAuthHelpers = api;
})(typeof window !== "undefined" ? window : globalThis);
