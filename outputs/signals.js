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
        .select("allow_motivation_when_behind, handle, visibility, onboarding_completed, avatar_url")
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
    // avatar_url is set when present; pass null/"" to clear it back to the initials avatar.
    if (Object.prototype.hasOwnProperty.call(fields, "avatar_url")) {
      patch.avatar_url = fields.avatar_url ? String(fields.avatar_url) : null;
    }
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

  // Realtime subscription to MY notification rows (likes/comments/friend events). Mirrors
  // subscribeInbox but on the notifications table, filtered to recipient_user. Returns an
  // unsubscribe function. Drives the live bell badge + ring.
  function subscribeNotifications(userId, onChange) {
    var sb = getClient();
    if (!sb || !userId || typeof sb.channel !== "function") return function () {};
    try {
      var channel = sb
        .channel("notifications-" + userId)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: "recipient_user=eq." + userId },
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

  // ── Shared communities (DB-backed) ─────────────────────────────────────────
  // A community is ONE row in public.communities; membership is the relationship
  // table public.community_members. All access rules are RLS (supabase/communities.sql).

  async function createCommunity(row) {
    var sb = getClient();
    if (!sb) return { error: { message: "Communities need a connection." }, data: null };
    try {
      var res = await sb.from("communities").insert(row).select().single();
      return { error: res.error || null, data: res.error ? null : res.data };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." }, data: null };
    }
  }

  async function joinCommunity(communityId, userId, role) {
    var sb = getClient();
    if (!sb || !communityId || !userId) return { error: { message: "Couldn't join." } };
    try {
      // Plain INSERT — NOT upsert. An upsert emits "INSERT ... ON CONFLICT DO UPDATE",
      // which RLS blocks unless the table has an UPDATE policy (community_members has
      // none, by design — you can't edit a membership). Joining is a pure insert; a
      // duplicate just means you're already a member, which we treat as success.
      var res = await sb.from("community_members")
        .insert({ community_id: communityId, user_id: userId, role: role || "member" });
      if (res.error) {
        var detail = String(res.error.message || "") + " " + String(res.error.code || "");
        if (/duplicate|unique|already exists|23505/i.test(detail)) return { error: null };
        return { error: res.error };
      }
      return { error: null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function leaveCommunity(communityId, userId) {
    var sb = getClient();
    if (!sb || !communityId || !userId) return { error: null };
    try {
      var res = await sb.from("community_members").delete()
        .eq("community_id", communityId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Look up a community by its invite code (works for non-members so they can join).
  async function findCommunityByCode(code) {
    var sb = getClient();
    var c = String(code || "").trim();
    if (!sb || c.length < 2) return null;
    try {
      var res = await sb.rpc("find_community_by_code", { code: c });
      if (res.error) return null;
      var rows = res.data || [];
      return rows.length ? rows[0] : null;
    } catch (e) {
      return null;
    }
  }

  async function upsertCommunityEntry(entry) {
    var sb = getClient();
    if (!sb || !entry || !entry.community_id || !entry.user_id) return { error: null };
    try {
      var res = await sb.from("community_entries")
        .upsert(entry, { onConflict: "community_id,user_id,rule_id,entry_date" });
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Upload an entry photo to the private "entry-photos" bucket. `folder` sets the
  // visibility path: "<community_id>/<user_id>" or "personal/<user_id>". Storage
  // policies (not this code) enforce who can read it. Returns { error, path }.
  async function uploadEntryPhoto(file, folder) {
    var sb = getClient();
    if (!sb || !sb.storage) return { error: { message: "Photo upload needs a connection." } };
    if (!file) return { error: { message: "No photo selected." } };
    if (!folder) return { error: { message: "Missing photo destination." } };
    try {
      var ext = "jpg";
      if (file.name && file.name.indexOf(".") > -1) {
        var raw = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
        if (raw) ext = raw;
      } else if (file.type && file.type.indexOf("/") > -1) {
        ext = file.type.split("/").pop().replace(/[^a-z0-9]/g, "") || "jpg";
      }
      var path = String(folder).replace(/\/+$/, "") + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      var res = await sb.storage.from("entry-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (res.error) return { error: { message: res.error.message || "Photo upload failed." } };
      return { error: null, path: path };
    } catch (e) {
      return { error: { message: "Couldn't upload the photo." } };
    }
  }

  // Short-lived signed URL so a thumbnail can render. Returns "" if not permitted
  // (the Storage read policy denies it) — callers must handle the empty string.
  async function getEntryPhotoSignedUrl(path) {
    var sb = getClient();
    if (!sb || !sb.storage || !path) return "";
    try {
      var res = await sb.storage.from("entry-photos").createSignedUrl(path, 3600);
      return (res && res.data && res.data.signedUrl) ? res.data.signedUrl : "";
    } catch (e) {
      return "";
    }
  }

  // Upload a profile avatar to the PUBLIC "avatars" bucket under "<uid>/...". Unlike
  // entry photos (private + short-lived signed URLs), avatars are public-read so the
  // returned public URL renders for ANYONE who can see the profile, everywhere.
  // Returns { error, path, url }.
  async function uploadAvatar(file, uid) {
    var sb = getClient();
    if (!sb || !sb.storage) return { error: { message: "Photo upload needs a connection." } };
    if (!file) return { error: { message: "No photo selected." } };
    if (!uid) return { error: { message: "Sign in to set a profile picture." } };
    try {
      var ext = "jpg";
      if (file.name && file.name.indexOf(".") > -1) {
        var raw = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
        if (raw) ext = raw;
      } else if (file.type && file.type.indexOf("/") > -1) {
        ext = file.type.split("/").pop().replace(/[^a-z0-9]/g, "") || "jpg";
      }
      var path = String(uid).replace(/\/+$/, "") + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      var res = await sb.storage.from("avatars").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (res.error) return { error: { message: res.error.message || "Photo upload failed." } };
      var pub = sb.storage.from("avatars").getPublicUrl(path);
      var url = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : "";
      return { error: null, path: path, url: url };
    } catch (e) {
      return { error: { message: "Couldn't upload the photo." } };
    }
  }

  // Resolve { id, display_name, handle, avatar_url } cards for a set of peer ids the
  // caller is already allowed to see (public / friends / existing thread). Used to
  // show peer avatars + names in Chats, which is built from the signals table and has
  // no other definer to read from. Returns [] on any error.
  async function getProfileCards(ids) {
    var sb = getClient();
    var list = Array.isArray(ids) ? ids.filter(function (x) { return x && UUID_RE.test(String(x)); }) : [];
    if (!sb || !list.length) return [];
    try {
      var res = await sb.rpc("get_profile_cards", { uids: list });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // ── Feed social: likes + comments on community feed entries (feed-social.sql) ──
  // Writes go straight to the RLS-guarded tables (a user may only like/comment on an
  // entry they can see, only as themselves); reads use definer RPCs (counts + author
  // identity, since profiles RLS is self-only). entryId must be a real DB uuid.

  // Like an entry I can see. Idempotent at the DB (primary key (entry_id,user_id)).
  async function likeEntry(entryId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(entryId)) || !userId) return { error: { message: "Couldn't like that." } };
    try {
      var res = await sb.from("entry_likes").insert({ entry_id: entryId, user_id: userId });
      // A duplicate (already liked) is not a real failure for a toggle.
      if (res.error && !/duplicate|unique/i.test(res.error.message || "")) return { error: res.error };
      return { error: null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function unlikeEntry(entryId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(entryId)) || !userId) return { error: { message: "Couldn't unlike that." } };
    try {
      var res = await sb.from("entry_likes").delete().eq("entry_id", entryId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Batch social state for the visible feed: like/comment counts, liked_by_me, and a
  // preview of the most-recent comment. Returns [] on any error.
  async function getEntriesSocial(entryIds) {
    var sb = getClient();
    var list = Array.isArray(entryIds) ? entryIds.filter(function (x) { return x && UUID_RE.test(String(x)); }) : [];
    if (!sb || !list.length) return [];
    try {
      var res = await sb.rpc("get_entries_social", { eids: list });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Post a comment on an entry I can see. Returns { error, comment }.
  async function addEntryComment(entryId, userId, body) {
    var sb = getClient();
    var text = String(body || "").trim().slice(0, 2000);
    if (!sb || !UUID_RE.test(String(entryId)) || !userId) return { error: { message: "Couldn't post that." } };
    if (!text) return { error: { message: "Write a comment first." } };
    try {
      var res = await sb.from("entry_comments").insert({ entry_id: entryId, user_id: userId, body: text }).select().single();
      if (res.error) return { error: res.error };
      return { error: null, comment: res.data || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Full comment thread for one entry, with each author's name/handle/avatar.
  async function getEntryComments(entryId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(entryId))) return [];
    try {
      var res = await sb.rpc("get_entry_comments", { eid: entryId });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  async function deleteEntryComment(commentId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(commentId)) || !userId) return { error: { message: "Couldn't delete that." } };
    try {
      var res = await sb.from("entry_comments").delete().eq("id", commentId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Every community the user belongs to, with its members (names via a definer
  // function, since profiles RLS is self-only) and the shared entries.
  async function fetchMyCommunities(userId) {
    var sb = getClient();
    var empty = { communities: [], membersByCommunity: {}, entries: [] };
    if (!sb || !userId || !UUID_RE.test(String(userId))) return empty;
    try {
      var mine = await sb.from("community_members").select("community_id").eq("user_id", userId);
      if (mine.error) return empty;
      var ids = [];
      (mine.data || []).forEach(function (r) { if (ids.indexOf(r.community_id) === -1) ids.push(r.community_id); });
      if (!ids.length) return empty;
      var cRes = await sb.from("communities").select("*").in("id", ids);
      var eRes = await sb.from("community_entries").select("*").in("community_id", ids);
      var membersByCommunity = {};
      for (var i = 0; i < ids.length; i++) {
        var mr = await sb.rpc("get_community_members", { cid: ids[i] });
        membersByCommunity[ids[i]] = mr.error ? [] : (mr.data || []);
      }
      return {
        communities: cRes.error ? [] : (cRes.data || []),
        membersByCommunity: membersByCommunity,
        entries: eRes.error ? [] : (eRes.data || [])
      };
    } catch (e) {
      return empty;
    }
  }

  // ── Community discovery: name search + request-to-join ──────────────────────

  // Name search — returns only public + request_to_join communities (private is
  // excluded in the DB function), each with member count + my membership/request
  // status so the UI shows the right per-tier action.
  async function searchCommunities(query) {
    var sb = getClient();
    var q = String(query || "").trim();
    if (!sb || q.length < 2) return [];
    try {
      var res = await sb.rpc("search_communities", { q: q });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Discover feed — ranked recent PUBLIC posts similar to what the caller tracks. The
  // discover_feed SECURITY DEFINER RPC enforces public-only authors + excludes the
  // caller / friends / followed / blocked server-side, so the anon key never reads
  // private posts. Returns [] on any failure.
  async function discoverFeed(categories, since, maxRows) {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("discover_feed", {
        categories: Array.isArray(categories) ? categories : [],
        since: since || null,
        max_rows: maxRows || 30
      });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Follow a PUBLIC account (one-directional, instant). Idempotent server-side
  // (follow_user does ON CONFLICT DO NOTHING + validates public/not-blocked/not-self).
  async function followUser(targetId) {
    var sb = getClient();
    if (!sb || !targetId) return { error: { message: "Couldn't follow." } };
    try {
      var res = await sb.rpc("follow_user", { target: targetId });
      return res.error ? { error: res.error } : { error: null };
    } catch (e) {
      return { error: { message: "Couldn't follow." } };
    }
  }

  // Create a PENDING request to join a request_to_join community. A duplicate
  // (already pending) is treated as success. DB RLS enforces the real rules.
  async function requestToJoin(communityId, userId) {
    var sb = getClient();
    if (!sb || !communityId || !userId) return { error: { message: "Couldn't request to join." } };
    try {
      var res = await sb.from("join_requests").insert({ community_id: communityId, requester_user: userId });
      if (res.error) {
        var detail = String(res.error.message || "") + " " + String(res.error.code || "");
        if (/duplicate|unique|already exists|23505/i.test(detail)) return { error: null, already: true };
        return { error: res.error };
      }
      return { error: null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Pending requests for communities I OWN (with requester names) — owner inbox.
  async function getOwnerJoinRequests() {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("get_owner_join_requests");
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // My own requests + their status (pending / accepted / declined).
  async function getMyJoinRequests() {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("get_my_join_requests");
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Owner-only: accept (creates the membership) or decline a request.
  async function respondToJoinRequest(requestId, accept) {
    var sb = getClient();
    if (!sb || !requestId) return { error: { message: "Couldn't respond." } };
    try {
      var res = await sb.rpc("respond_to_join_request", { req_id: requestId, accept: !!accept });
      return { error: res.error || null, status: res.error ? null : res.data };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // ── Friends ─────────────────────────────────────────────────────────────
  // Send a friend request (insert pending as myself; RLS gates self/blocked/dupes).
  async function sendFriendRequest(requesterId, addresseeId) {
    var sb = getClient();
    if (!sb || !requesterId || !addresseeId) return { error: { message: "Couldn't send request." } };
    try {
      var res = await sb.from("friend_requests").insert({ requester_user: requesterId, addressee_user: addresseeId });
      if (res.error) {
        var detail = String(res.error.message || "") + " " + String(res.error.code || "");
        if (/duplicate|unique|already exists|23505/i.test(detail)) return { error: null, already: true };
        return { error: res.error };
      }
      return { error: null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Addressee-only accept/decline of a pending request.
  async function respondToFriendRequest(requestId, accept) {
    var sb = getClient();
    if (!sb || !requestId) return { error: { message: "Couldn't respond." } };
    try {
      var res = await sb.rpc("respond_to_friend_request", { req_id: requestId, accept: !!accept });
      return { error: res.error || null, status: res.error ? null : res.data };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // My accepted friends (with names).
  async function getFriends() {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("get_friends");
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Pending friend requests addressed to me (with requester names).
  async function getIncomingFriendRequests() {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("get_incoming_friend_requests");
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Bell notifications — activity ABOUT me (likes/comments on my posts, friend requests +
  // accepts, plus cheers/kudos). Direct messages are EXCLUDED server-side (get_notifications
  // in notifications.sql). RLS + the function's auth.uid() filter keep it to my own rows.
  async function getNotifications() {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("get_notifications");
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Mark specific notification-table rows read (cheers/kudos signals are marked via markRead).
  async function markNotificationsRead(ids) {
    var sb = getClient();
    if (!sb || !Array.isArray(ids) || !ids.length) return { error: null };
    try {
      var res = await sb.rpc("mark_notifications_read", { ids: ids });
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Relationship with one user: 'friends' | 'pending_out' | 'pending_in' | 'none'.
  async function getFriendshipStatus(otherId) {
    var sb = getClient();
    if (!sb || !otherId) return "none";
    try {
      var res = await sb.rpc("get_friendship_status", { other: otherId });
      return res.error ? "none" : (res.data || "none");
    } catch (e) {
      return "none";
    }
  }

  // People I'm ALLOWED to message (public OR friends, not blocked) — for "New message".
  async function searchMessageableProfiles(query) {
    var sb = getClient();
    var q = String(query || "").trim();
    if (!sb || q.length < 2) return [];
    try {
      var res = await sb.rpc("search_messageable_profiles", { q: q });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // "Generate with AI" — calls the generate-rules Supabase Edge Function, which runs
  // the Anthropic Claude call server-side (the API key never reaches the client).
  // Returns { error, system } where system = { title, category, description, explanation, rules:[...] }.
  async function generateRules(inputs) {
    var sb = getClient();
    if (!sb || !sb.functions || typeof sb.functions.invoke !== "function") {
      return { error: { message: "AI generation needs a connection." } };
    }
    try {
      // Deployed Edge Function slug (Supabase auto-named it "bright-api").
      var res = await sb.functions.invoke("bright-api", { body: inputs || {} });
      if (res.error) return { error: res.error };
      var data = res.data || {};
      if (data.error) return { error: { message: String(data.error) } };
      if (!data.system || !Array.isArray(data.system.rules)) {
        return { error: { message: "The AI returned an unexpected response." } };
      }
      return { error: null, system: data.system };
    } catch (e) {
      return { error: { message: "Couldn't reach the AI service." } };
    }
  }

  // Natural-language "quick log": send the user's text + their loggable rule catalog
  // to the parse-log Edge Function; get back validated draft entries + clarifications.
  // Mirrors generateRules — sb.functions.invoke handles URL/apikey/JWT. Returns a
  // structured { error, entries, clarifications } and never throws.
  async function parseLog(text, rules) {
    var sb = getClient();
    if (!sb || !sb.functions || typeof sb.functions.invoke !== "function") {
      return { error: { message: "Quick log needs a connection." } };
    }
    try {
      // Deployed Edge Function slug — must match how parse-log is deployed in Supabase.
      var res = await sb.functions.invoke("parse-log", {
        body: { text: String(text || ""), rules: Array.isArray(rules) ? rules : [] }
      });
      if (res.error) return { error: res.error };
      var data = res.data || {};
      if (data.error) return { error: { message: String(data.error) } };
      return {
        error: null,
        entries: Array.isArray(data.entries) ? data.entries : [],
        clarifications: Array.isArray(data.clarifications) ? data.clarifications : []
      };
    } catch (e) {
      return { error: { message: "Couldn't reach the AI service." } };
    }
  }

  // Today's community activity for a friend, gated server-side by friendship +
  // their visibility + our shared communities. forDate = the viewer's local today key.
  // Returns [{ community_id, community_name, rule_id, amount, entry_date }].
  async function getFriendTodayActivity(targetId, forDate) {
    var sb = getClient();
    if (!sb || !targetId || !forDate) return [];
    try {
      var res = await sb.rpc("get_friend_today_activity", { target: targetId, for_date: forDate });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Which of my friends have visible activity today (for the "active today" dot).
  // Returns [{ user_id }].
  async function getFriendsActiveToday(forDate) {
    var sb = getClient();
    if (!sb || !forDate) return [];
    try {
      var res = await sb.rpc("friends_active_today", { for_date: forDate });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
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
    createCommunity: createCommunity,
    joinCommunity: joinCommunity,
    leaveCommunity: leaveCommunity,
    findCommunityByCode: findCommunityByCode,
    searchCommunities: searchCommunities,
    requestToJoin: requestToJoin,
    getOwnerJoinRequests: getOwnerJoinRequests,
    getMyJoinRequests: getMyJoinRequests,
    respondToJoinRequest: respondToJoinRequest,
    sendFriendRequest: sendFriendRequest,
    respondToFriendRequest: respondToFriendRequest,
    getFriends: getFriends,
    getIncomingFriendRequests: getIncomingFriendRequests,
    getFriendshipStatus: getFriendshipStatus,
    searchMessageableProfiles: searchMessageableProfiles,
    getFriendTodayActivity: getFriendTodayActivity,
    getFriendsActiveToday: getFriendsActiveToday,
    generateRules: generateRules,
    parseLog: parseLog,
    upsertCommunityEntry: upsertCommunityEntry,
    uploadEntryPhoto: uploadEntryPhoto,
    getEntryPhotoSignedUrl: getEntryPhotoSignedUrl,
    uploadAvatar: uploadAvatar,
    getProfileCards: getProfileCards,
    likeEntry: likeEntry,
    unlikeEntry: unlikeEntry,
    getEntriesSocial: getEntriesSocial,
    addEntryComment: addEntryComment,
    getEntryComments: getEntryComments,
    deleteEntryComment: deleteEntryComment,
    fetchMyCommunities: fetchMyCommunities,
    isNudgeable: isNudgeable,
    subscribeInbox: subscribeInbox,
    fetchThread: fetchThread,
    blockUser: blockUser,
    unblockUser: unblockUser,
    isBlockedByMe: isBlockedByMe,
    reportMessage: reportMessage,
    getNotifications: getNotifications,
    markNotificationsRead: markNotificationsRead,
    subscribeNotifications: subscribeNotifications,
    discoverFeed: discoverFeed,
    followUser: followUser
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellSignals = api;
})(typeof window !== "undefined" ? window : globalThis);
