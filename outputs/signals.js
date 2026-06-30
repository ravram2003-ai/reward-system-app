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

  // ── Storage egress guards ──────────────────────────────────────────────────
  // Private-bucket signed URLs are valid ~1h, but createSignedUrl mints a NEW token
  // every call → a new URL → the browser re-downloads the SAME image on every render /
  // tab switch (the main driver of our egress blow-out: 22MB stored, ~9GB downloaded).
  // Memoize by path so repeated paints reuse ONE stable URL → browser cache hit, no
  // re-download. TTL kept under the 1h token life; failures ("" / not permitted) aren't
  // cached so they retry. In-flight calls are deduped via the stored promise.
  var _signedUrlCache = {};            // "bucket:path" -> { url, expires } | { promise, expires }
  var SIGNED_URL_TTL_MS = 55 * 60 * 1000;
  function cachedSignedUrl(key, make) {
    var now = Date.now();
    var hit = _signedUrlCache[key];
    if (hit && hit.expires > now) {
      if (hit.url) return Promise.resolve(hit.url);   // resolved + still fresh
      if (hit.promise) return hit.promise;            // in-flight → dedupe
    }
    var p = Promise.resolve().then(make).then(function (url) {
      if (url) _signedUrlCache[key] = { url: url, expires: Date.now() + SIGNED_URL_TTL_MS };
      else delete _signedUrlCache[key];
      return url || "";
    }).catch(function () { delete _signedUrlCache[key]; return ""; });
    _signedUrlCache[key] = { promise: p, expires: now + SIGNED_URL_TTL_MS };
    return p;
  }

  // Downscale + re-encode a picked image BEFORE upload so storage AND every future
  // download stay small: cap the longest edge to ~1080px, re-encode JPEG ~0.8. Returns a
  // Blob, or the ORIGINAL file unchanged on any failure / non-image / no gain — never
  // blocks an upload. Browser-only (canvas); the node test harness never calls it.
  async function resizeImageForUpload(file, maxEdge, quality) {
    try {
      if (!file || typeof document === "undefined") return file;
      var type = file.type || "";
      if (type.indexOf("image/") !== 0 || type === "image/gif") return file; // skip non-images + animations
      maxEdge = maxEdge || 1080; quality = quality || 0.8;
      var bmp;
      if (typeof createImageBitmap === "function") {
        bmp = await createImageBitmap(file);
      } else {
        bmp = await new Promise(function (resolve, reject) {
          var img = new Image(); var url = URL.createObjectURL(file);
          img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
          img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
          img.src = url;
        });
      }
      var w = bmp.width, h = bmp.height;
      if (!w || !h) return file;
      var scale = Math.min(1, maxEdge / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement("canvas");
      canvas.width = tw; canvas.height = th;
      var ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bmp, 0, 0, tw, th);
      if (bmp.close) bmp.close();
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", quality); });
      if (!blob) return file;
      if (scale === 1 && blob.size >= file.size) return file; // already small + no gain → keep original
      try { blob.name = (file.name ? file.name.replace(/\.[^.]+$/, "") : "photo") + ".jpg"; } catch (e) { /* Blob.name is best-effort */ }
      return blob;
    } catch (e) {
      return file;
    }
  }

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
        .select("allow_motivation_when_behind, handle, visibility, onboarding_completed, avatar_url, bio, cover_url")
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
    // bio: a short description (≤280, also DB-CHECK enforced). Pass "" to clear it.
    if (typeof fields.bio === "string") patch.bio = fields.bio.slice(0, 280);
    // avatar_url is set when present; pass null/"" to clear it back to the initials avatar.
    if (Object.prototype.hasOwnProperty.call(fields, "avatar_url")) {
      patch.avatar_url = fields.avatar_url ? String(fields.avatar_url) : null;
    }
    // cover_url: the profile banner image (public URL from the avatars bucket). "" → clear it.
    if (Object.prototype.hasOwnProperty.call(fields, "cover_url")) {
      patch.cover_url = fields.cover_url ? String(fields.cover_url) : null;
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
      file = await resizeImageForUpload(file, 1080, 0.8); // shrink storage + every future download
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
    return cachedSignedUrl("entry-photos:" + path, function () {
      return sb.storage.from("entry-photos").createSignedUrl(path, 3600).then(function (res) {
        return (res && res.data && res.data.signedUrl) ? res.data.signedUrl : "";
      });
    });
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
      file = await resizeImageForUpload(file, 1080, 0.8); // shrink storage + every future download
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

  // Upload a world cover / app icon to the PRIVATE "world-media" bucket under the owner's
  // own "<uid>/<world_id>/…" folder (RLS: only the authenticated owner may write there; the
  // anon key never can — supabase/world-media.sql). Returns { error, path }. The path is saved
  // to communities/public_systems.cover_url|icon_url and resolved to a signed URL on read.
  async function uploadWorldMedia(file, uid, worldId) {
    var sb = getClient();
    if (!sb || !sb.storage) return { error: { message: "Photo upload needs a connection." } };
    if (!file) return { error: { message: "No photo selected." } };
    if (!uid || !worldId) return { error: { message: "Sign in to set this photo." } };
    try {
      file = await resizeImageForUpload(file, 1080, 0.8); // shrink storage + every future download
      var ext = "jpg";
      if (file.name && file.name.indexOf(".") > -1) {
        var raw = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
        if (raw) ext = raw;
      } else if (file.type && file.type.indexOf("/") > -1) {
        ext = file.type.split("/").pop().replace(/[^a-z0-9]/g, "") || "jpg";
      }
      var safeWorld = String(worldId).replace(/[^a-zA-Z0-9_-]/g, "");
      var path = String(uid).replace(/\/+$/, "") + "/" + safeWorld + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      var res = await sb.storage.from("world-media").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (res.error) return { error: { message: res.error.message || "Photo upload failed." } };
      return { error: null, path: path };
    } catch (e) {
      return { error: { message: "Couldn't upload the photo." } };
    }
  }

  // Short-lived signed URL for a world-media object (the bucket is private; the SELECT policy
  // decides who's allowed). Returns "" when not permitted — callers fall back to the gradient.
  async function worldMediaSignedUrl(path) {
    var sb = getClient();
    if (!sb || !sb.storage || !path) return "";
    return cachedSignedUrl("world-media:" + path, function () {
      return sb.storage.from("world-media").createSignedUrl(path, 3600).then(function (res) {
        return (res && res.data && res.data.signedUrl) ? res.data.signedUrl : "";
      });
    });
  }

  // Save cover_url/icon_url onto a community row. RLS (communities "update own") permits this
  // only for the owner; a non-owner / anon write is rejected by the database. patch is
  // { cover_url?, icon_url? }. Returns { error }.
  async function updateCommunityMedia(communityId, patch) {
    var sb = getClient();
    if (!sb || !communityId) return { error: { message: "Couldn't save the photo." } };
    try {
      var res = await sb.from("communities").update(patch || {}).eq("id", communityId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
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

  // Delete one of MY OWN posts (a community_entries row). The author-only "entries delete own"
  // RLS policy is the real guard; the .eq("user_id") here is a belt-and-suspenders match so a
  // non-author request is a no-op even before RLS. Returns { error }.
  async function deleteCommunityEntry(entryId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(entryId)) || !userId) return { error: { message: "Couldn't delete that." } };
    try {
      var res = await sb.from("community_entries").delete().eq("id", entryId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // ── Profile posts: personal posts on your profile (profile-posts.sql) ──
  // A profile post is a standalone {photo, caption} authored on your own profile; followers
  // see it via the Friends feed (RLS gates visibility). Likes/comments live in PARALLEL tables
  // (profile_post_likes / profile_post_comments) with the SAME shape as the community ones, so
  // the feed UI is reused. Photos REUSE the entry-photos bucket (uploadEntryPhoto / signed URL).

  // Insert one of MY profile posts. Needs a photo OR a caption (mirrors the app rule + the CHECK).
  async function uploadProfilePost(userId, message, photoPath) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(userId))) return { error: { message: "Sign in to post." } };
    var msg = (message == null ? "" : String(message)).trim().slice(0, 2000);
    var photo = photoPath ? String(photoPath) : null;
    if (!msg && !photo) return { error: { message: "Add a photo or caption." } };
    try {
      var res = await sb.from("profile_posts").insert({ user_id: userId, message: msg || null, photo_path: photo }).select().single();
      if (res.error) return { error: res.error };
      return { error: null, post: res.data || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // One user's profile posts (newest first). RLS returns only the ones the caller may see
  // (own + public, or private-but-approved-follower); used to render a profile's posts.
  async function fetchProfilePosts(userId, limit) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(userId))) return [];
    try {
      var res = await sb.from("profile_posts").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(limit || 30);
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Profile posts authored by a given set of users (the people I follow), newest first — the
  // Friends-feed source. Pass the author ids (resolved via profileFollowing, which is the
  // SECURITY DEFINER read of my follow graph); RLS still filters to posts I'm allowed to see.
  async function fetchFollowedProfilePosts(authorIds, limit) {
    var sb = getClient();
    var ids = Array.isArray(authorIds) ? authorIds.filter(function (x) { return x && UUID_RE.test(String(x)); }) : [];
    if (!sb || !ids.length) return [];
    try {
      var res = await sb.from("profile_posts").select("*").in("user_id", ids)
        .order("created_at", { ascending: false }).limit(limit || 40);
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Delete one of MY OWN profile posts (author-only RLS is the real guard; the user_id match is
  // belt-and-suspenders). The likes/comments cascade-delete with it (FK on delete cascade).
  async function deleteProfilePost(postId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't delete that." } };
    try {
      var res = await sb.from("profile_posts").delete().eq("id", postId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Likes/comments on profile posts — mirror the community feed-social fns against the parallel
  // tables + definer RPCs (get_profile_posts_social / get_profile_post_comments).
  async function likeProfilePost(postId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't like that." } };
    try {
      var res = await sb.from("profile_post_likes").insert({ post_id: postId, user_id: userId });
      if (res.error && !/duplicate|unique/i.test(res.error.message || "")) return { error: res.error };
      return { error: null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function unlikeProfilePost(postId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't unlike that." } };
    try {
      var res = await sb.from("profile_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Batch social state for visible profile posts (counts + liked_by_me + last-comment preview).
  // The RPC returns rows keyed by post_id (the app maps that to its shared social cache).
  async function getProfilePostsSocial(postIds) {
    var sb = getClient();
    var list = Array.isArray(postIds) ? postIds.filter(function (x) { return x && UUID_RE.test(String(x)); }) : [];
    if (!sb || !list.length) return [];
    try {
      var res = await sb.rpc("get_profile_posts_social", { pids: list });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  async function addProfilePostComment(postId, userId, body) {
    var sb = getClient();
    var text = String(body || "").trim().slice(0, 2000);
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't post that." } };
    if (!text) return { error: { message: "Write a comment first." } };
    try {
      var res = await sb.from("profile_post_comments").insert({ post_id: postId, user_id: userId, body: text }).select().single();
      if (res.error) return { error: res.error };
      return { error: null, comment: res.data || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  async function getProfilePostComments(postId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId))) return [];
    try {
      var res = await sb.rpc("get_profile_post_comments", { pid: postId });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  async function deleteProfilePostComment(commentId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(commentId)) || !userId) return { error: { message: "Couldn't delete that." } };
    try {
      var res = await sb.from("profile_post_comments").delete().eq("id", commentId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // ── Post-first feed: ONE post fans out to many feeds (post-first-feed.sql, #26) ──
  // A post = caption + photo + the AI-parsed activity, published to any mix of the author's profile
  // and the communities its rules match. RLS gates visibility; photos reuse the entry-photos bucket.

  // Insert one post (author = me). activity = [{ruleLabel, emoji, amount, unit}]. Returns { error, post }.
  async function createPost(userId, caption, photoPath, activity, isShared) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(userId))) return { error: { message: "Sign in to post." } };
    var cap = (caption == null ? "" : String(caption)).trim().slice(0, 2000);
    var photo = photoPath ? String(photoPath) : null;
    var acts = Array.isArray(activity) ? activity : [];
    if (!cap && !photo && !acts.length) return { error: { message: "Add a photo, caption, or activity." } };
    try {
      var res = await sb.from("posts").insert({
        author_user: userId, caption: cap || null, photo_path: photo,
        activity: acts, is_shared: isShared !== false
      }).select().single();
      if (res.error) return { error: res.error };
      return { error: null, post: res.data || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Fan a post out to one feed: target_type 'profile' (target_id = author) or 'community' (community id),
  // with the per-target point rollup. RLS only lets the post's author insert, for a community they belong
  // to or their own profile. Returns { error }.
  async function addPostTarget(postId, targetType, targetId, points) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId)) || !UUID_RE.test(String(targetId))) return { error: { message: "Couldn't share that." } };
    if (targetType !== "profile" && targetType !== "community") return { error: { message: "Bad target." } };
    try {
      var res = await sb.from("post_targets").insert({
        post_id: postId, target_type: targetType, target_id: targetId, points: Number(points) || 0
      });
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Delete one of MY posts (cascades post_targets, likes, comments, and the linked community_entries
  // — so the points it logged are removed too). Author-only RLS is the real guard. Returns { error }.
  async function deletePost(postId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't delete that." } };
    try {
      var res = await sb.from("posts").delete().eq("id", postId).eq("author_user", userId);
      return { error: res.error || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // ── Phase 3 reads: surface posts from their targets. RLS (can_view_post) gates which posts
  // come back; the inner join to posts also drops targets whose post isn't visible. We order on
  // post_targets.created_at (≈ the post's, and indexed) to avoid embedded-order quirks. Each
  // returns one row per (target) carrying the nested post + its per-target points.
  var POST_COLS = "id, author_user, caption, photo_path, activity, is_shared, created_at";

  // Posts in a set of communities (the community / world feed). Returns [{post, communityId, points}].
  async function fetchCommunityPosts(communityIds, limit) {
    var sb = getClient();
    var ids = Array.isArray(communityIds) ? communityIds.filter(function (x) { return x && UUID_RE.test(String(x)); }) : [];
    if (!sb || !ids.length) return [];
    try {
      var res = await sb.from("post_targets")
        .select("points, target_id, created_at, posts!inner(" + POST_COLS + ")")
        .eq("target_type", "community").in("target_id", ids)
        .order("created_at", { ascending: false }).limit(limit || 60);
      if (res.error) return [];
      return (res.data || []).map(function (r) {
        var post = r && (Array.isArray(r.posts) ? r.posts[0] : r.posts);
        return post ? { post: post, communityId: r.target_id, points: Number(r.points) || 0 } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  // Posts authored by people I follow that hit their PROFILE feed (the Friends feed). authorIds
  // come from profileFollowing (my follow graph). Returns [{post, points}].
  async function fetchFollowedPostsV2(authorIds, limit) {
    var sb = getClient();
    var ids = Array.isArray(authorIds) ? authorIds.filter(function (x) { return x && UUID_RE.test(String(x)); }) : [];
    if (!sb || !ids.length) return [];
    try {
      var res = await sb.from("post_targets")
        .select("points, target_id, created_at, posts!inner(" + POST_COLS + ")")
        .eq("target_type", "profile").in("target_id", ids)
        .order("created_at", { ascending: false }).limit(limit || 40);
      if (res.error) return [];
      return (res.data || []).map(function (r) {
        var post = r && (Array.isArray(r.posts) ? r.posts[0] : r.posts);
        return post ? { post: post, points: Number(r.points) || 0 } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  // One user's profile-targeted posts (their profile page). Returns [{post, points}].
  async function fetchProfilePostsV2(userId, limit) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(userId))) return [];
    try {
      var res = await sb.from("post_targets")
        .select("points, target_id, created_at, posts!inner(" + POST_COLS + ")")
        .eq("target_type", "profile").eq("target_id", userId)
        .order("created_at", { ascending: false }).limit(limit || 30);
      if (res.error) return [];
      return (res.data || []).map(function (r) {
        var post = r && (Array.isArray(r.posts) ? r.posts[0] : r.posts);
        return post ? { post: post, points: Number(r.points) || 0 } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  // One post by id + its targets I can see (for opening a post from a notification when it isn't
  // in any loaded feed batch). RLS (can_view_post) gates the post; post_targets RLS gates the
  // targets (anon/non-member rows are dropped). Returns the post row with `post_targets` or null.
  async function fetchPostById(postId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId))) return null;
    try {
      var res = await sb.from("posts")
        .select(POST_COLS + ", post_targets(target_type, target_id, points)")
        .eq("id", postId).maybeSingle();
      return (res.error || !res.data) ? null : res.data;
    } catch (e) { return null; }
  }

  // ── Engagement on a POST (shared thread across every feed it appears in) — mirrors the
  // profile_post_* fns against post_likes / post_comments + the definer RPCs from #26.
  async function likePost(postId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't like that." } };
    try {
      var res = await sb.from("post_likes").insert({ post_id: postId, user_id: userId });
      if (res.error && !/duplicate|unique/i.test(res.error.message || "")) return { error: res.error };
      return { error: null };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  async function unlikePost(postId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't unlike that." } };
    try {
      var res = await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      return { error: res.error || null };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  async function getPostsSocial(postIds) {
    var sb = getClient();
    var list = Array.isArray(postIds) ? postIds.filter(function (x) { return x && UUID_RE.test(String(x)); }) : [];
    if (!sb || !list.length) return [];
    try {
      var res = await sb.rpc("get_posts_social", { pids: list });
      return res.error ? [] : (res.data || []);
    } catch (e) { return []; }
  }

  async function addPostComment(postId, userId, body) {
    var sb = getClient();
    var text = String(body || "").trim().slice(0, 2000);
    if (!sb || !UUID_RE.test(String(postId)) || !userId) return { error: { message: "Couldn't post that." } };
    if (!text) return { error: { message: "Write a comment first." } };
    try {
      var res = await sb.from("post_comments").insert({ post_id: postId, user_id: userId, body: text }).select().single();
      if (res.error) return { error: res.error };
      return { error: null, comment: res.data || null };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  async function getPostComments(postId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(postId))) return [];
    try {
      var res = await sb.rpc("get_post_comments", { pid: postId });
      return res.error ? [] : (res.data || []);
    } catch (e) { return []; }
  }

  // Delete a comment: own (RLS) OR the post author (RLS also allows author).
  async function deletePostComment(commentId, userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(commentId)) || !userId) return { error: { message: "Couldn't delete that." } };
    try {
      var res = await sb.from("post_comments").delete().eq("id", commentId);
      return { error: res.error || null };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
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

  // ── Head-to-head (1v1) challenges. A challenge is a 2-person leaderboard over a window;
  //    scores are computed in the APP from community_entries (never stored here). RLS
  //    (challenges.sql) is the real guard — member inserts as challenger, participants + owner
  //    read, the opponent accepts/declines while pending, the owner finalizes. These functions
  //    just call the table and swallow transport errors, like the rest of this module. ──────────
  async function createChallenge(payload) {
    var sb = getClient();
    if (!sb || !payload || !payload.community_id || !payload.challenger_user || !payload.opponent_user) {
      return { error: { message: "Couldn't start the challenge." } };
    }
    try {
      var res = await sb.from("challenges").insert({
        community_id: payload.community_id,
        challenger_user: payload.challenger_user,
        opponent_user: payload.opponent_user,
        metric: payload.metric || "points",
        duration: payload.duration || null,
        status: "pending",
        forfeit: payload.forfeit || null
      }).select("*").single();
      if (res.error) return { error: { message: res.error.message || "Couldn't start the challenge." } };
      return { error: null, challenge: res.data || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Every challenge I'm in (RLS already limits the rows to me-as-participant or my-community-as-owner;
  // the .or keeps the payload to ones I actually play in). Returns [] on any failure.
  async function fetchMyChallenges(userId) {
    var sb = getClient();
    if (!sb || !userId || !UUID_RE.test(String(userId))) return [];
    try {
      var res = await sb.from("challenges")
        .select("*")
        .or("challenger_user.eq." + userId + ",opponent_user.eq." + userId)
        .order("created_at", { ascending: false });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Generic status write. Accept = { status:'active', start_at, end_at } (opponent, RLS-gated);
  // decline = { status:'declined' }; finalize = { status:'done', winner_user, forfeit } (owner).
  // RLS decides whether the caller is allowed — the client never validates the transition.
  async function setChallengeStatus(challengeId, patch) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(challengeId)) || !patch) return { error: { message: "Couldn't update that." } };
    try {
      var res = await sb.from("challenges").update(patch).eq("id", challengeId).select("*").maybeSingle();
      if (res.error) return { error: { message: res.error.message || "Couldn't update that." } };
      return { error: null, challenge: res.data || null };
    } catch (e) {
      return { error: { message: "Couldn't reach the server." } };
    }
  }

  // Record the app-computed outcome. winnerUserId may be null (draw). Owner-only via RLS.
  async function finalizeChallenge(challengeId, winnerUserId, forfeitNote) {
    return setChallengeStatus(challengeId, {
      status: "done",
      winner_user: winnerUserId || null,
      forfeit: forfeitNote || null
    });
  }

  // ── Compete: generalized contests (team battles; tournaments next). Scores compute in the app
  //    from community_entries — these calls just persist structure/status. RLS (compete-contests.sql)
  //    is the real guard: any community member reads; the creator/owner manages; anon is denied. ──
  async function createContest(payload) {
    var sb = getClient();
    if (!sb || !payload || !payload.community_id || !payload.creator_user) return { error: { message: "Couldn't start the contest." } };
    try {
      var res = await sb.from("contests").insert({
        community_id: payload.community_id,
        creator_user: payload.creator_user,
        format: payload.format,
        metric: payload.metric || "points",
        scoring_mode: payload.scoring_mode || "total",
        start_at: payload.start_at || null,
        end_at: payload.end_at || null,
        status: payload.status || "active"
      }).select("*").single();
      if (res.error) return { error: { message: res.error.message || "Couldn't start the contest." } };
      return { error: null, contest: res.data || null };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  // Every contest in a community I belong to, with its teams + participants embedded. The rows are
  // scoped ENTIRELY by RLS (read = is_community_member of the contest's community via auth.uid()) —
  // `userId` is NOT a server filter, just a signed-in guard so we don't query before auth is ready.
  // Returns [] on failure. One query, no N+1.
  async function fetchMyContests(userId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(userId))) return [];
    try {
      var res = await sb.from("contests")
        .select("*, contest_teams(*), contest_participants(*), contest_matches(*)")
        .order("created_at", { ascending: false });
      return res.error ? [] : (res.data || []);
    } catch (e) { return []; }
  }

  // Insert teams; returns the created rows (we need their ids to assign participants).
  async function addContestTeams(contestId, teams) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(contestId)) || !Array.isArray(teams) || !teams.length) return { error: { message: "Couldn't create teams." } };
    try {
      var rows = teams.map(function (t) { return { contest_id: contestId, name: String(t.name || "Team").slice(0, 40), color: t.color || null }; });
      var res = await sb.from("contest_teams").insert(rows).select("*");
      if (res.error) return { error: res.error };
      return { error: null, teams: res.data || [] };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  // Draft participants into the contest. parts = [{ user_id, team_id?, seed? }].
  async function addContestParticipants(contestId, parts) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(contestId)) || !Array.isArray(parts) || !parts.length) return { error: { message: "Couldn't add players." } };
    try {
      var rows = parts.filter(function (p) { return p && UUID_RE.test(String(p.user_id)); }).map(function (p) {
        return { contest_id: contestId, user_id: p.user_id, team_id: p.team_id || null, seed: (typeof p.seed === "number" ? p.seed : null) };
      });
      if (!rows.length) return { error: { message: "No valid players." } };
      var res = await sb.from("contest_participants").insert(rows);
      return { error: res.error || null };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  // Status/window patch — creator/owner via RLS. Returns the updated row (or null).
  async function setContestStatus(contestId, patch) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(contestId)) || !patch) return { error: { message: "Couldn't update that." } };
    try {
      var res = await sb.from("contests").update(patch).eq("id", contestId).select("*").maybeSingle();
      return { error: res.error || null, contest: res.error ? null : (res.data || null) };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  // Cancel a contest (creator/owner via RLS; cascades teams + participants + matches).
  async function deleteContest(contestId) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(contestId))) return { error: { message: "Couldn't delete that." } };
    try {
      var res = await sb.from("contests").delete().eq("id", contestId);
      return { error: res.error || null };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  // ── Tournament bracket (compete-tournaments.sql) — creator/owner write via RLS ──
  // Insert match shells. matches = [{ round, slot, a_user?, b_user?, window_start?, window_end?, status?,
  // winner_user?, a_score?, b_score? }]. Returns the created rows.
  async function addContestMatches(contestId, matches) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(contestId)) || !Array.isArray(matches) || !matches.length) return { error: { message: "Couldn't build the bracket." } };
    try {
      var rows = matches.map(function (m) {
        return {
          contest_id: contestId, round: m.round, slot: m.slot,
          a_user: m.a_user || null, b_user: m.b_user || null,
          a_score: (typeof m.a_score === "number" ? m.a_score : null),
          b_score: (typeof m.b_score === "number" ? m.b_score : null),
          winner_user: m.winner_user || null,
          window_start: m.window_start || null, window_end: m.window_end || null,
          status: m.status || "pending"
        };
      });
      var res = await sb.from("contest_matches").insert(rows).select("*");
      if (res.error) return { error: res.error };
      return { error: null, matches: res.data || [] };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
  }

  // Patch one match (set scores/winner/status, or fill an advancing player into a_user/b_user).
  async function setContestMatch(matchId, patch) {
    var sb = getClient();
    if (!sb || !UUID_RE.test(String(matchId)) || !patch) return { error: { message: "Couldn't update the match." } };
    try {
      var res = await sb.from("contest_matches").update(patch).eq("id", matchId).select("*").maybeSingle();
      return { error: res.error || null, match: res.error ? null : (res.data || null) };
    } catch (e) { return { error: { message: "Couldn't reach the server." } }; }
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

  // Popular communities — PUBLIC communities ordered by member count, for the
  // onboarding "Communities to join" fallback when interest matches are thin (the Join
  // action is public-only). Same row shape as searchCommunities (member count + my
  // membership/request status). The popular_communities SECURITY DEFINER RPC returns
  // public only — private and request_to_join are excluded at the DB level. [] on fail.
  async function popularCommunities(limit) {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("popular_communities", { lim: Number(limit) > 0 ? Number(limit) : 12 });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // ── Public reward systems (copyable) ─────────────────────────────────────────
  // A public profile's public systems are mirrored to public.public_systems and
  // surfaced for copying. All four RPCs are SECURITY DEFINER and public-only by RLS
  // (supabase/public-systems.sql); the anon key can never read them.

  // Mirror the caller's CURRENT set of public systems (upsert + prune in one call).
  // list = [{ client_id, title, category, description, payload }]. {error} on completion.
  async function syncPublicSystems(list) {
    var sb = getClient();
    if (!sb) return { error: null };
    try {
      var res = await sb.rpc("sync_public_systems", { systems: Array.isArray(list) ? list : [] });
      return { error: res.error || null };
    } catch (e) {
      return { error: e };
    }
  }

  // Title/category/description search across public profiles' public systems (excludes
  // self + blocked). Rows: { id, owner_user, owner_name, owner_handle, title, category,
  // description, payload, copy_count }. [] on fail.
  async function searchPublicSystems(query) {
    var sb = getClient();
    var q = String(query || "").trim();
    if (!sb || q.length < 2) return [];
    try {
      var res = await sb.rpc("search_public_systems", { q: q });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Public systems ranked by copy count — the fallback pool for "Public systems you
  // can copy". Same row shape as searchPublicSystems. [] on fail.
  async function popularPublicSystems(limit) {
    var sb = getClient();
    if (!sb) return [];
    try {
      var res = await sb.rpc("popular_public_systems", { lim: Number(limit) > 0 ? Number(limit) : 24 });
      return res.error ? [] : (res.data || []);
    } catch (e) {
      return [];
    }
  }

  // Bump a public system's copy_count when someone copies it (best-effort popularity).
  async function incrementPublicSystemCopy(id) {
    var sb = getClient();
    if (!sb || !id) return;
    try {
      await sb.rpc("increment_public_system_copy", { sid: id });
    } catch (e) {
      /* best-effort */
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

  // Unfollow (delete my follow row). Idempotent.
  async function unfollowUser(targetId) {
    var sb = getClient();
    if (!sb || !targetId) return { error: { message: "Couldn't unfollow." } };
    try {
      var res = await sb.rpc("unfollow_user", { target: targetId });
      return res.error ? { error: res.error } : { error: null };
    } catch (e) {
      return { error: { message: "Couldn't unfollow." } };
    }
  }

  // One-call profile overview (profile-view.sql get_profile_overview): header +
  // relationship state, and — ONLY when the server says can_view — the person's PUBLIC
  // communities + recent PUBLIC posts. Returns a single row object (or null).
  async function getProfileOverview(targetId) {
    var sb = getClient();
    if (!sb || !targetId) return null;
    try {
      var res = await sb.rpc("get_profile_overview", { target: targetId });
      if (res.error) return null;
      var rows = res.data || [];
      return rows.length ? rows[0] : null;
    } catch (e) {
      return null;
    }
  }

  // Privacy-gated bio for any profile (profile-bio-rpc.sql) — text, or null when locked/blocked.
  async function profileBio(targetId) {
    var sb = getClient();
    if (!sb || !targetId) return null;
    try {
      var res = await sb.rpc("profile_bio", { target: targetId });
      return res.error ? null : (res.data || null);
    } catch (e) { return null; }
  }

  // Privacy-gated follower / following LISTS (profile-bio-connections.sql). Each row:
  // { id, display_name, handle, avatar_url, viewer_follows }. A private profile the caller
  // can't view returns [] (the locked state) — the gate is server-side, never the client.
  async function profileFollowers(targetId) {
    var sb = getClient();
    if (!sb || !targetId) return [];
    try {
      var res = await sb.rpc("profile_followers", { target: targetId });
      return res.error ? [] : (res.data || []);
    } catch (e) { return []; }
  }
  async function profileFollowing(targetId) {
    var sb = getClient();
    if (!sb || !targetId) return [];
    try {
      var res = await sb.rpc("profile_following", { target: targetId });
      return res.error ? [] : (res.data || []);
    } catch (e) { return []; }
  }

  // Follower / following counts for any profile (SECURITY DEFINER — follows RLS is
  // participant-only). Returns { follower_count, following_count } or null on failure.
  async function getFollowCounts(targetId) {
    var sb = getClient();
    if (!sb || !targetId) return null;
    try {
      var res = await sb.rpc("get_follow_counts", { target: targetId });
      if (res.error) return null;
      var rows = res.data || [];
      return rows.length ? rows[0] : null;
    } catch (e) {
      return null;
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

  // "Yesterday, recapped" — reuses the SAME generate Edge Function ("bright-api") with
  // mode:"recap", passing yesterday's structured summary. Returns { error, recap } where
  // recap is a short, warm, second-person prose string. Mirrors generateRules: never throws,
  // degrades to { error } so the client can fall back to its own composed recap.
  async function generateRecap(summary) {
    var sb = getClient();
    if (!sb || !sb.functions || typeof sb.functions.invoke !== "function") {
      return { error: { message: "Recap needs a connection." } };
    }
    try {
      // Same deployed slug as generateRules — the function branches on body.mode.
      var res = await sb.functions.invoke("bright-api", { body: { mode: "recap", summary: summary || {} } });
      if (res.error) return { error: res.error };
      var data = res.data || {};
      if (data.error) return { error: { message: String(data.error) } };
      if (typeof data.recap !== "string" || !data.recap.trim()) {
        return { error: { message: "The AI returned an unexpected response." } };
      }
      return { error: null, recap: data.recap.trim() };
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

  // Coach chat ROUTER: classify a message as log / question / chat and (for questions) pick
  // which deterministic data lookup the client should run. The model never returns numbers —
  // the client computes every figure from local state. Returns { error, intent, query, reply,
  // clarify } and never throws. `context` carries only NAMES (communities/systems/metrics/
  // rules) so the router can resolve params — no figures are sent.
  async function coachChat(text, context) {
    var sb = getClient();
    if (!sb || !sb.functions || typeof sb.functions.invoke !== "function") {
      return { error: { message: "Coach needs a connection." } };
    }
    try {
      // Deployed Edge Function slug — must match how coach-chat is deployed in Supabase.
      var res = await sb.functions.invoke("coach-chat", {
        body: { text: String(text || ""), context: context || {} }
      });
      if (res.error) return { error: res.error };
      var data = res.data || {};
      if (data.error) return { error: { message: String(data.error) } };
      return {
        error: null,
        intent: data.intent || "chat",
        query: data.query || null,
        reply: data.reply || "",
        clarify: data.clarify || ""
      };
    } catch (e) {
      return { error: { message: "Couldn't reach the AI service." } };
    }
  }

  // "Snap a meal" — send a meal photo (base64, no data: prefix) + optional text hint to
  // the food-estimate Edge Function, which runs the Anthropic vision call server-side.
  // Mirrors parseLog — sb.functions.invoke handles URL/apikey/JWT. Returns a structured
  // { error, estimate: { calories, protein, carbs, fat, items, note, confidence } } and
  // never throws. The numbers are rough ESTIMATES the caller must keep editable.
  async function estimateFood(imageBase64, mediaType, hint) {
    var sb = getClient();
    if (!sb || !sb.functions || typeof sb.functions.invoke !== "function") {
      return { error: { message: "Food estimates need a connection." } };
    }
    try {
      // Deployed Edge Function slug — must match how food-estimate is deployed in Supabase.
      var res = await sb.functions.invoke("food-estimate", {
        body: { image: String(imageBase64 || ""), mediaType: String(mediaType || "image/jpeg"), hint: String(hint || "") }
      });
      if (res.error) return { error: res.error };
      var data = res.data || {};
      if (data.error) return { error: { message: String(data.error) } };
      return { error: null, estimate: data };
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
    popularCommunities: popularCommunities,
    syncPublicSystems: syncPublicSystems,
    searchPublicSystems: searchPublicSystems,
    popularPublicSystems: popularPublicSystems,
    incrementPublicSystemCopy: incrementPublicSystemCopy,
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
    generateRecap: generateRecap,
    parseLog: parseLog,
    coachChat: coachChat,
    estimateFood: estimateFood,
    upsertCommunityEntry: upsertCommunityEntry,
    uploadEntryPhoto: uploadEntryPhoto,
    getEntryPhotoSignedUrl: getEntryPhotoSignedUrl,
    uploadAvatar: uploadAvatar,
    uploadWorldMedia: uploadWorldMedia,
    worldMediaSignedUrl: worldMediaSignedUrl,
    updateCommunityMedia: updateCommunityMedia,
    getProfileCards: getProfileCards,
    likeEntry: likeEntry,
    unlikeEntry: unlikeEntry,
    getEntriesSocial: getEntriesSocial,
    addEntryComment: addEntryComment,
    getEntryComments: getEntryComments,
    deleteEntryComment: deleteEntryComment,
    deleteCommunityEntry: deleteCommunityEntry,
    uploadProfilePost: uploadProfilePost,
    fetchProfilePosts: fetchProfilePosts,
    fetchFollowedProfilePosts: fetchFollowedProfilePosts,
    deleteProfilePost: deleteProfilePost,
    likeProfilePost: likeProfilePost,
    unlikeProfilePost: unlikeProfilePost,
    getProfilePostsSocial: getProfilePostsSocial,
    addProfilePostComment: addProfilePostComment,
    getProfilePostComments: getProfilePostComments,
    deleteProfilePostComment: deleteProfilePostComment,
    createPost: createPost,
    addPostTarget: addPostTarget,
    deletePost: deletePost,
    fetchCommunityPosts: fetchCommunityPosts,
    fetchFollowedPostsV2: fetchFollowedPostsV2,
    fetchProfilePostsV2: fetchProfilePostsV2,
    fetchPostById: fetchPostById,
    likePost: likePost,
    unlikePost: unlikePost,
    getPostsSocial: getPostsSocial,
    addPostComment: addPostComment,
    getPostComments: getPostComments,
    deletePostComment: deletePostComment,
    fetchMyCommunities: fetchMyCommunities,
    createChallenge: createChallenge,
    fetchMyChallenges: fetchMyChallenges,
    setChallengeStatus: setChallengeStatus,
    finalizeChallenge: finalizeChallenge,
    createContest: createContest,
    fetchMyContests: fetchMyContests,
    addContestTeams: addContestTeams,
    addContestParticipants: addContestParticipants,
    setContestStatus: setContestStatus,
    deleteContest: deleteContest,
    addContestMatches: addContestMatches,
    setContestMatch: setContestMatch,
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
    followUser: followUser,
    unfollowUser: unfollowUser,
    getProfileOverview: getProfileOverview,
    profileBio: profileBio,
    profileFollowers: profileFollowers,
    profileFollowing: profileFollowing,
    getFollowCounts: getFollowCounts
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellSignals = api;
})(typeof window !== "undefined" ? window : globalThis);
