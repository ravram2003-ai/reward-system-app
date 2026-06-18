/**
 * Pointwell — Positive Signals (Kudos + Motivation) data layer.
 *
 * Kudos: any community member, any time. Motivation: only to a member who has
 * opted in AND is currently behind (the database is the real guard — see
 * supabase/signals.sql; this module's checks are a friendly fast-fail surface).
 *
 * Network calls run through the SHARED authenticated client from auth.js
 * (window.PointwellAuth.getClient()) so every read/write is subject to RLS under
 * the signed-in user's session. Only the anon/public key is ever used. Every
 * network function swallows transport errors and returns a safe default so a
 * dropped connection never produces an unhandled rejection.
 *
 * The pure helpers (presets, validation, formatting, unread count) carry no DOM
 * or network and are exported for the node test harness (module.exports).
 */
(function (root) {
  // ── Preset messages (no free text yet — a deliberate later phase) ──────────
  var KUDOS_PRESETS = ["Proud of you", "Keep it up", "Strong week"];
  var MOTIVATION_PRESETS = ["You've got this", "One entry gets you back on track"];
  var MAX_BODY = 280;

  function presetsForType(type) {
    return (type === "motivation" ? MOTIVATION_PRESETS : KUDOS_PRESETS).slice();
  }

  // Validate a draft before sending. Mirrors the DB constraints (type, non-empty
  // body, length, no self-send, real recipient) so the UI can fail fast — but the
  // database remains the real enforcement.
  function validateSignalDraft(draft) {
    draft = draft || {};
    if (draft.type !== "kudos" && draft.type !== "motivation") {
      return { ok: false, reason: "Unknown signal type." };
    }
    var body = typeof draft.body === "string" ? draft.body.trim() : "";
    if (!body) return { ok: false, reason: "Pick a message to send." };
    if (body.length > MAX_BODY) return { ok: false, reason: "That message is a little long." };
    if (!draft.fromUser) return { ok: false, reason: "Sign in to send a signal." };
    if (!draft.toUser) return { ok: false, reason: "This member isn't on a real account yet." };
    if (draft.toUser === draft.fromUser) return { ok: false, reason: "You can't send a signal to yourself." };
    return { ok: true, body: body };
  }

  function unreadCount(signals) {
    if (!Array.isArray(signals)) return 0;
    return signals.reduce(function (n, s) { return n + (s && !s.read ? 1 : 0); }, 0);
  }

  // Short relative time for the inbox. `nowMs` is injected for testability.
  function formatRelativeTime(iso, nowMs) {
    var then = Date.parse(iso);
    if (!Number.isFinite(then)) return "";
    var now = Number.isFinite(nowMs) ? nowMs : (typeof Date !== "undefined" ? Date.now() : then);
    var diff = Math.max(0, now - then);
    var min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h";
    var days = Math.floor(hr / 24);
    if (days < 7) return days + "d";
    return Math.floor(days / 7) + "w";
  }

  var pure = {
    KUDOS_PRESETS: KUDOS_PRESETS,
    MOTIVATION_PRESETS: MOTIVATION_PRESETS,
    MAX_BODY: MAX_BODY,
    presetsForType: presetsForType,
    validateSignalDraft: validateSignalDraft,
    unreadCount: unreadCount,
    formatRelativeTime: formatRelativeTime
  };

  // ── Browser-only network layer (lazy: never touches Supabase at load time) ──
  function getClient() {
    var auth = root && root.PointwellAuth;
    if (!auth || typeof auth.getClient !== "function") return null;
    return auth.getClient();
  }

  function isReady() {
    var auth = root && root.PointwellAuth;
    if (!auth || typeof auth.isConfigured !== "function" || !auth.isConfigured()) return false;
    return !!getClient();
  }

  async function sendSignal(draft) {
    var v = validateSignalDraft(draft);
    if (!v.ok) return { error: { message: v.reason } };
    var sb = getClient();
    if (!sb) return { error: { message: "Notifications need a connection." } };
    try {
      // created_at / read / from_name are forced server-side (see signals.sql);
      // anything we send for them is ignored.
      var res = await sb.from("signals").insert({
        from_user: draft.fromUser,
        to_user: draft.toUser,
        community_id: draft.communityId || null,
        type: draft.type,
        body: v.body,
        from_name: draft.fromName || null
      });
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server. Try again." } };
    }
  }

  async function fetchInbox(userId, limit) {
    var sb = getClient();
    if (!sb || !userId) return [];
    try {
      // RLS already restricts rows to the recipient; the explicit filter is
      // belt-and-suspenders and keeps intent clear.
      var res = await sb
        .from("signals")
        .select("id, from_user, from_name, community_id, type, body, created_at, read")
        .eq("to_user", userId)
        .order("created_at", { ascending: false })
        .limit(limit || 50);
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  async function markRead(ids) {
    var sb = getClient();
    if (!sb || !Array.isArray(ids) || !ids.length) return { error: null };
    try {
      var res = await sb.from("signals").update({ read: true }).in("id", ids);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function markAllRead(userId) {
    var sb = getClient();
    if (!sb || !userId) return { error: null };
    try {
      var res = await sb.from("signals").update({ read: true }).eq("to_user", userId).eq("read", false);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function setOptIn(userId, value) {
    var sb = getClient();
    if (!sb || !userId) return { error: null };
    try {
      var res = await sb.from("profiles").update({ allow_motivation_when_behind: !!value }).eq("id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Writes only is_behind; behind_updated_at is stamped server-side (signals.sql).
  async function updateBehind(userId, behind) {
    var sb = getClient();
    if (!sb || !userId) return { error: null };
    try {
      var res = await sb.from("profiles").update({ is_behind: !!behind }).eq("id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function getMyFlags(userId) {
    var sb = getClient();
    if (!sb || !userId) return null;
    try {
      var res = await sb
        .from("profiles")
        .select("allow_motivation_when_behind")
        .eq("id", userId)
        .maybeSingle();
      return res.error ? null : (res.data || null);
    } catch (e) {
      return null;
    }
  }

  // The ONLY thing a sender learns about another member: one boolean.
  async function isNudgeable(userId) {
    var sb = getClient();
    if (!sb || !userId) return false;
    try {
      var res = await sb.rpc("is_member_nudgeable", { target: userId });
      return res.error ? false : !!res.data;
    } catch (e) {
      return false;
    }
  }

  // Realtime inbox subscription. Returns an unsubscribe function.
  function subscribeInbox(userId, onChange) {
    var sb = getClient();
    if (!sb || !userId || typeof sb.channel !== "function") return function () {};
    try {
      var channel = sb
        .channel("signals-inbox-" + userId)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "signals", filter: "to_user=eq." + userId },
          function (payload) { try { onChange(payload); } catch (e) { /* ignore */ } }
        )
        .subscribe();
      return function () { try { sb.removeChannel(channel); } catch (e) { /* ignore */ } };
    } catch (e) {
      return function () {};
    }
  }

  var api = {
    KUDOS_PRESETS: KUDOS_PRESETS,
    MOTIVATION_PRESETS: MOTIVATION_PRESETS,
    MAX_BODY: MAX_BODY,
    presetsForType: presetsForType,
    validateSignalDraft: validateSignalDraft,
    unreadCount: unreadCount,
    formatRelativeTime: formatRelativeTime,
    isReady: isReady,
    sendSignal: sendSignal,
    fetchInbox: fetchInbox,
    markRead: markRead,
    markAllRead: markAllRead,
    setOptIn: setOptIn,
    updateBehind: updateBehind,
    getMyFlags: getMyFlags,
    isNudgeable: isNudgeable,
    subscribeInbox: subscribeInbox
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellSignals = api;
})(typeof window !== "undefined" ? window : globalThis);
