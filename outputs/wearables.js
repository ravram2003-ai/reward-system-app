/**
 * Pointwell — Wearables (Fitbit + Whoop) browser client.
 *
 * Thin layer over the `wearables` Supabase Edge Function. It NEVER sees tokens:
 * it starts the OAuth redirect, finishes it after the provider sends the user
 * back, and asks the connector for normalized metrics. All real work (secrets,
 * token storage/refresh, provider API calls) happens server-side in the function.
 *
 * The OAuth round-trip deliberately returns to `wearable-callback.html` (a tiny
 * page that stashes ?code&state in sessionStorage and bounces back here) so the
 * Supabase auth client never sees the provider's ?code= and try to consume it as
 * its own PKCE auth code.
 *
 * Loaded as a classic script (window.PointwellWearables). No DOM. Network calls
 * swallow transport errors and return { error } so a dropped connection never
 * throws an unhandled rejection.
 */
(function (root) {
  var REAL_PROVIDERS = ["google-health", "fitbit", "whoop"];
  var PENDING_KEY = "pointwell_wearable_pending";
  var CALLBACK_KEY = "pointwell_wearable_callback";

  function config() {
    return root.POINTWELL_SUPABASE || {};
  }

  // Edge Function endpoint derived from the Supabase project URL.
  function functionUrl() {
    var url = String(config().url || "").replace(/\/+$/, "");
    return url ? url + "/functions/v1/wearables" : "";
  }

  function authClient() {
    var auth = root.PointwellAuth;
    return auth && typeof auth.getClient === "function" ? auth.getClient() : null;
  }

  function isConfigured() {
    return !!functionUrl() && !!authClient();
  }

  function isRealProvider(id) {
    return REAL_PROVIDERS.indexOf(id) !== -1;
  }

  // The OAuth redirect target: the callback bounce page next to the current page.
  function redirectUri() {
    var dir = String(root.location.pathname || "/").replace(/[^/]*$/, "");
    return root.location.origin + dir + "wearable-callback.html";
  }

  function safeGet(store, key) {
    try { return root[store].getItem(key); } catch (e) { return null; }
  }
  function safeSet(store, key, value) {
    try { root[store].setItem(key, value); } catch (e) { /* ignore */ }
  }
  function safeRemove(store, key) {
    try { root[store].removeItem(key); } catch (e) { /* ignore */ }
  }

  async function accessToken() {
    var client = authClient();
    if (!client) return "";
    try {
      var res = await client.auth.getSession();
      var session = res && res.data ? res.data.session : null;
      return session ? session.access_token : "";
    } catch (e) {
      return "";
    }
  }

  // POST { action, ...payload } to the connector with the user's JWT.
  async function call(action, payload) {
    var endpoint = functionUrl();
    if (!endpoint) return { error: { message: "Device sync isn't configured for this app yet." } };
    var token = await accessToken();
    if (!token) return { error: { message: "Sign in with your account to connect a device." } };
    try {
      var resp = await root.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "apikey": config().anonKey || ""
        },
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      });
      var data = null;
      try { data = await resp.json(); } catch (e) { data = null; }
      if (!resp.ok) {
        var message = (data && data.error) || ("Sync service error (" + resp.status + ").");
        return { error: { message: message } };
      }
      return { data: data || {} };
    } catch (e) {
      return { error: { message: "Couldn't reach the sync service. Check your connection." } };
    }
  }

  // Start OAuth: get the provider's consent URL, remember which provider we're
  // connecting (for UI labeling), then send the browser to the provider.
  async function connect(provider) {
    if (!isRealProvider(provider)) return { error: { message: "Unsupported device." } };
    var res = await call("authorize", { provider: provider, redirect_uri: redirectUri() });
    if (res.error) return res;
    if (!res.data || !res.data.url) return { error: { message: "Couldn't start the connection." } };
    safeSet("sessionStorage", PENDING_KEY, provider);
    root.location.assign(res.data.url);
    return { data: { redirecting: true } };
  }

  // wearable-callback.html stashes the provider's ?code&state here before bouncing
  // back, so the main app reads it from storage (never from its own URL).
  function readCallback() {
    var raw = safeGet("sessionStorage", CALLBACK_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // If we just returned from a provider, finish the token exchange server-side.
  // Returns null when there's nothing to finish.
  async function completeRedirect() {
    var cb = readCallback();
    if (!cb) return null;
    safeRemove("sessionStorage", CALLBACK_KEY);
    var provider = safeGet("sessionStorage", PENDING_KEY) || "";
    safeRemove("sessionStorage", PENDING_KEY);
    if (cb.error) return { provider: provider, error: { message: "The connection was cancelled." } };
    if (!cb.code || !cb.state) return null;
    var res = await call("callback", { code: cb.code, state: cb.state, redirect_uri: redirectUri() });
    if (res.error) return { provider: provider, error: res.error };
    return { provider: (res.data && res.data.provider) || provider, data: res.data };
  }

  async function sync(provider) {
    return await call("sync", provider ? { provider: provider } : {});
  }

  async function status() {
    return await call("status", {});
  }

  async function disconnect(provider) {
    return await call("disconnect", { provider: provider });
  }

  var api = {
    REAL_PROVIDERS: REAL_PROVIDERS,
    isConfigured: isConfigured,
    isRealProvider: isRealProvider,
    connect: connect,
    completeRedirect: completeRedirect,
    sync: sync,
    status: status,
    disconnect: disconnect
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellWearables = api;
})(typeof window !== "undefined" ? window : globalThis);
