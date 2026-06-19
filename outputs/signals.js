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
    if (draft.type !== "kudos" && draft.type !== "motivation" && draft.type !== "text") {
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
    // userId feeds an .or() filter string, so require a real UUID. RLS is still the
    // real guarantee — it limits rows to ones where you are the sender OR recipient.
    if (!UUID_RE.test(String(userId))) return [];
    try {
      // BOTH directions (received AND sent) so a conversation shows for BOTH
      // participants — the recipient sees what was sent to them, and the sender
      // sees conversations they started. to_user is selected so the UI can tell who
      // the peer is and which rows are incoming (for the unread count).
      var res = await sb
        .from("signals")
        .select("id, from_user, to_user, from_name, community_id, type, body, created_at, read")
        .or("to_user.eq." + userId + ",from_user.eq." + userId)
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
        .select("allow_motivation_when_behind, handle, visibility, onboarding_completed")
        .eq("id", userId)
        .maybeSingle();
      return res.error ? null : (res.data || null);
    } catch (e) {
      return null;
    }
  }

  // Persist the editable profile basics to the DB (self-update is allowed by the
  // existing "profiles self update" RLS policy). This is what makes a user
  // findable by their chosen name/handle and applies their visibility choice.
  async function updateProfile(userId, fields) {
    var sb = getClient();
    if (!sb || !userId || !fields) return { error: null };
    var patch = {};
    if (typeof fields.display_name === "string") patch.display_name = fields.display_name;
    if (typeof fields.handle === "string") patch.handle = fields.handle;
    if (fields.visibility === "public" || fields.visibility === "private") patch.visibility = fields.visibility;
    if (!Object.keys(patch).length) return { error: null };
    try {
      var res = await sb.from("profiles").update(patch).eq("id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Mark first-run onboarding done so it never shows again for this account.
  async function setOnboardingCompleted(userId) {
    var sb = getClient();
    if (!sb || !userId) return { error: null };
    try {
      var res = await sb.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Real user search via the SECURITY DEFINER RPC. Visibility, self-exclusion, and
  // the safe column set are enforced server-side (search-onboarding.sql); this is
  // convenience only. Returns [{ id, display_name, handle }].
  async function searchProfiles(query) {
    var sb = getClient();
    var q = String(query || "").trim();
    if (!sb || q.length < 2) return [];
    try {
      var res = await sb.rpc("search_profiles", { q: q });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
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

  // ── Free-text messaging: thread, block, report ─────────────────────────────

  // The full two-way conversation (type='text') between me and another user,
  // oldest first. RLS limits this to threads I'm part of; the filter narrows to
  // this one pair.
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function fetchThread(meId, otherId, limit) {
    var sb = getClient();
    if (!sb || !meId || !otherId) return [];
    // Both ids feed a PostgREST or() filter string; require real UUIDs so nothing
    // can malform the filter. RLS is still the real isolation guarantee — this
    // .or() pair-filter is only a convenience narrowing to one conversation.
    if (!UUID_RE.test(String(meId)) || !UUID_RE.test(String(otherId))) return [];
    try {
      var res = await sb
        .from("signals")
        .select("id, from_user, to_user, from_name, body, created_at, read, type")
        .eq("type", "text")
        .or("and(from_user.eq." + meId + ",to_user.eq." + otherId + "),and(from_user.eq." + otherId + ",to_user.eq." + meId + ")")
        .order("created_at", { ascending: true })
        .limit(limit || 100);
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  async function blockUser(blocker, blocked) {
    var sb = getClient();
    if (!sb || !blocker || !blocked) return { error: { message: "Couldn't block." } };
    try {
      var res = await sb.from("blocks").insert({ blocker_user: blocker, blocked_user: blocked });
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function unblockUser(blocker, blocked) {
    var sb = getClient();
    if (!sb || !blocker || !blocked) return { error: null };
    try {
      var res = await sb.from("blocks").delete().eq("blocker_user", blocker).eq("blocked_user", blocked);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // True if I (blocker) have blocked this user. (We can never see if THEY blocked
  // us — that stays private; a send to them just fails neutrally.)
  async function isBlockedByMe(meId, otherId) {
    var sb = getClient();
    if (!sb || !meId || !otherId) return false;
    try {
      var res = await sb
        .from("blocks")
        .select("blocked_user")
        .eq("blocker_user", meId)
        .eq("blocked_user", otherId)
        .maybeSingle();
      return res.error ? false : !!res.data;
    } catch (e) {
      return false;
    }
  }

  async function reportMessage(reporterId, messageId, reason) {
    var sb = getClient();
    if (!sb || !reporterId || !messageId) return { error: { message: "Couldn't file the report." } };
    try {
      var res = await sb.from("reports").insert({
        reporter_user: reporterId,
        reported_message_id: messageId,
        reason: reason || null
      });
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
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
    updateProfile: updateProfile,
    setOnboardingCompleted: setOnboardingCompleted,
    searchProfiles: searchProfiles,
    isNudgeable: isNudgeable,
    subscribeInbox: subscribeInbox,
    fetchThread: fetchThread,
    blockUser: blockUser,
    unblockUser: unblockUser,
    isBlockedByMe: isBlockedByMe,
    reportMessage: reportMessage
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellSignals = api;
})(typeof window !== "undefined" ? window : globalThis);
