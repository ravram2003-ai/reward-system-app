// Pointwell — Wearables connector (Supabase Edge Function, Deno).
//
// The ONE secure place that holds the OAuth client secrets and user tokens. The
// static browser app never sees a token; it only calls these JSON actions:
//
//   { action: "authorize",  provider, redirect_uri }  -> { url }          (start OAuth)
//   { action: "callback",   code, state, redirect_uri} -> { provider }    (finish OAuth)
//   { action: "sync",       provider? }                -> { providers:{…}} (live metrics)
//   { action: "status" }                               -> { connections:[…] }
//   { action: "disconnect", provider }                 -> { disconnected }
//
// Providers:
//   "google-health"  Google Health API (the replacement for the now-closed Fitbit
//                    Web API) — this is how Fitbit data reaches the web app.
//   "whoop"          WHOOP API v2.
//
// Every call must carry the signed-in user's Supabase JWT in the Authorization
// header; the function resolves it to a user id and scopes all DB access to that
// user. Tokens are read/written with the service-role key (RLS is bypassed); the
// tables themselves are locked to client roles (see supabase/wearables.sql).
//
// Required function secrets (set with `supabase secrets set …`):
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   (from the Google Cloud OAuth client)
//   WHOOP_CLIENT_ID  / WHOOP_CLIENT_SECRET    (optional — only if using Whoop)
//   WEARABLE_ALLOWED_REDIRECTS                (optional CSV; localhost + *.github.io
//                                              are allowed by default)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by the
// platform automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "google-health" | "whoop";

interface ProviderConfig {
  envPrefix: string;             // GOOGLE / WHOOP → {PREFIX}_CLIENT_ID / _SECRET
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  secretStyle: "body" | "basic"; // where the client_secret goes at the token endpoint
  extraAuthParams?: Record<string, string>; // provider-specific authorize params
  refreshScope?: string;         // scope value to resend on token refresh, if needed
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  "google-health": {
    envPrefix: "GOOGLE",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: [
      "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
      "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    ].join(" "),
    secretStyle: "body",
    // access_type=offline + prompt=consent are what make Google return a refresh_token.
    extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  whoop: {
    envPrefix: "WHOOP",
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    scope: "read:recovery read:sleep read:cycles read:workout read:profile offline",
    secretStyle: "body",
    refreshScope: "offline",
  },
};

const GOOGLE_HEALTH_API = "https://health.googleapis.com/v4";
const WHOOP_API = "https://api.prod.whoop.com/developer/v2";

function isProvider(p: string): p is Provider {
  return p === "google-health" || p === "whoop";
}
function clientId(p: Provider): string { return env(`${PROVIDERS[p].envPrefix}_CLIENT_ID`); }
function clientSecret(p: Provider): string { return env(`${PROVIDERS[p].envPrefix}_CLIENT_SECRET`); }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}
function env(name: string): string {
  return Deno.env.get(name) ?? "";
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken(byteLen = 24): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// ── redirect allow-list (prevents the connector being used as an open redirect) ─
function allowedRedirect(uri: string): boolean {
  if (!uri) return false;
  const extra = env("WEARABLE_ALLOWED_REDIRECTS").split(",").map((s) => s.trim()).filter(Boolean);
  let host: URL;
  try { host = new URL(uri); } catch { return false; }
  const isLocal = host.hostname === "127.0.0.1" || host.hostname === "localhost";
  const isPages = host.hostname.endsWith(".github.io");
  if ((isLocal || isPages) && (host.protocol === "http:" || host.protocol === "https:")) return true;
  return extra.some((allowed) => uri === allowed || uri.startsWith(allowed));
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function put(out: Record<string, number>, key: string, value: number | null) {
  if (value !== null && Number.isFinite(value)) out[key] = Math.round(value * 100) / 100;
}
// First finite number found anywhere inside a small object (used to read a single
// aggregated value like {count_sum: 8500} without hard-coding every field spelling).
function deepNum(obj: unknown, depth = 4): number | null {
  if (obj == null || depth < 0) return null;
  if (typeof obj === "number") return Number.isFinite(obj) ? obj : null;
  if (typeof obj === "string") { const n = Number(obj); return Number.isFinite(n) ? n : null; }
  if (typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const n = deepNum(v, depth - 1);
      if (n !== null) return n;
    }
  }
  return null;
}

// ── token exchange / refresh ─────────────────────────────────────────────────
interface Tokens {
  access_token: string;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
}

function tokenRequest(provider: Provider, params: URLSearchParams): Request {
  const cfg = PROVIDERS[provider];
  const id = clientId(provider);
  const secret = clientSecret(provider);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  params.set("client_id", id);
  if (cfg.secretStyle === "basic" && secret) {
    headers["Authorization"] = "Basic " + btoa(`${id}:${secret}`);
  } else if (secret) {
    params.set("client_secret", secret); // "body" style (Google + Whoop)
  }
  return new Request(cfg.tokenUrl, { method: "POST", headers, body: params.toString() });
}

async function parseTokens(resp: Response): Promise<Tokens> {
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || data.errors?.[0]?.message || `token request failed (${resp.status})`);
  }
  const expiresIn = num(data.expires_in);
  const expiresAt = expiresIn !== null ? new Date(Date.now() + (expiresIn - 60) * 1000).toISOString() : null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    token_type: data.token_type ?? null,
    scope: data.scope ?? null,
    expires_at: expiresAt,
  };
}

async function exchangeCode(provider: Provider, code: string, redirectUri: string): Promise<Tokens> {
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirectUri);
  return parseTokens(await fetch(tokenRequest(provider, params)));
}

async function refreshTokens(provider: Provider, refreshToken: string): Promise<Tokens> {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  const refreshScope = PROVIDERS[provider].refreshScope;
  if (refreshScope) params.set("scope", refreshScope);
  const tokens = await parseTokens(await fetch(tokenRequest(provider, params)));
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken; // Google omits it on refresh
  return tokens;
}

// ── provider data fetch → normalized metrics ─────────────────────────────────
async function getJson(url: string, token: string): Promise<any | null> {
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Google Health API helpers -----------------------------------------------------
// CivilDateTime at UTC midnight, `offset` days from now (used for dailyRollUp range).
function civilDay(offset: number) {
  const d = new Date(Date.now() + offset * 86400000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hours: 0, minutes: 0, seconds: 0, nanos: 0, timeZone: { id: "UTC" },
  };
}
// "active-energy-burned" -> "activeEnergyBurned" (the per-point payload key)
function camelKey(dataType: string): string {
  return dataType.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
async function googleRollup(dataType: string, token: string): Promise<any | null> {
  const body = {
    range: { start: civilDay(-1), end: civilDay(1) },
    windowSizeDays: 1,
    dataSourceFamily: "users/me/dataSourceFamilies/all-sources",
  };
  try {
    const resp = await fetch(`${GOOGLE_HEALTH_API}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
function googleList(dataType: string, token: string, pageSize = 10): Promise<any | null> {
  return getJson(`${GOOGLE_HEALTH_API}/users/me/dataTypes/${dataType}/dataPoints?pageSize=${pageSize}`, token);
}
// Most recent rolled-up daily value for a data type (scans newest-last).
function latestRollupValue(roll: any, dataType: string): number | null {
  const pts = roll?.rollupDataPoints;
  if (!Array.isArray(pts)) return null;
  const key = camelKey(dataType);
  for (let i = pts.length - 1; i >= 0; i--) {
    const v = deepNum(pts[i]?.[key]);
    if (v !== null) return v;
  }
  return null;
}
// Most recent list data point that carries `key` (e.g. "sleep", "heartRate").
function latestListPoint(list: any, key: string): any | null {
  const pts = list?.dataPoints;
  if (!Array.isArray(pts) || !pts.length) return null;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (pts[i]?.[key]) return pts[i];
  }
  return pts[pts.length - 1];
}

async function fetchGoogleHealth(token: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  // Steps — daily total (rollup)
  put(out, "steps", latestRollupValue(await googleRollup("steps", token), "steps"));
  // Active calories — daily total (rollup)
  put(out, "active-calories", latestRollupValue(await googleRollup("active-energy-burned", token), "active-energy-burned"));
  // Sleep — most recent session
  const sleepPt = latestListPoint(await googleList("sleep", token), "sleep");
  const mins = num(sleepPt?.sleep?.summary?.minutesAsleep);
  if (mins !== null && mins > 0) put(out, "sleep-hours", mins / 60);
  // Resting heart rate — newest heart-rate sample (proxy)
  const hrPt = latestListPoint(await googleList("heart-rate", token, 1), "heartRate");
  put(out, "resting-heart-rate", num(hrPt?.heartRate?.beatsPerMinute));
  return out;
}

async function fetchWhoop(token: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const recovery = await getJson(`${WHOOP_API}/recovery?limit=1`, token);
  const rScore = recovery?.records?.[0]?.score;
  if (rScore) {
    put(out, "recovery", num(rScore.recovery_score));
    put(out, "resting-heart-rate", num(rScore.resting_heart_rate));
    put(out, "hrv", num(rScore.hrv_rmssd_milli));
  }
  const sleep = await getJson(`${WHOOP_API}/activity/sleep?limit=1`, token);
  const sScore = sleep?.records?.[0]?.score;
  if (sScore) {
    const st = sScore.stage_summary || {};
    const asleepMilli = (num(st.total_light_sleep_time_milli) ?? 0)
      + (num(st.total_slow_wave_sleep_time_milli) ?? 0)
      + (num(st.total_rem_sleep_time_milli) ?? 0);
    if (asleepMilli > 0) put(out, "sleep-hours", asleepMilli / 3600000);
    put(out, "sleep-performance", num(sScore.sleep_performance_percentage));
  }
  const cycle = await getJson(`${WHOOP_API}/cycle?limit=1`, token);
  const cScore = cycle?.records?.[0]?.score;
  if (cScore) {
    put(out, "strain", num(cScore.strain));
    const kj = num(cScore.kilojoule);
    put(out, "calories", kj !== null ? kj / 4.184 : null);
  }
  return out;
}

function fetchMetrics(provider: Provider, token: string): Promise<Record<string, number>> {
  return provider === "google-health" ? fetchGoogleHealth(token) : fetchWhoop(token);
}

// ── main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey) return fail("Connector is missing Supabase configuration.", 500);

  // Resolve the caller from their JWT (no server session — pass the token explicitly).
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return fail("Sign in to connect a device.", 401);
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData } = await authClient.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return fail("Sign in to connect a device.", 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok for status */ }
  const action = String(body.action || "");

  try {
    if (action === "authorize") {
      const provider = String(body.provider || "");
      if (!isProvider(provider)) return fail("Unknown provider.");
      if (!clientId(provider)) return fail(`${provider} is not configured on the server yet.`, 500);
      const redirectUri = String(body.redirect_uri || "");
      if (!allowedRedirect(redirectUri)) return fail("Redirect URL is not allowed.");

      const cfg = PROVIDERS[provider];
      const state = randomToken(24);

      await db.from("wearable_oauth_states")
        .delete().lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
      const ins = await db.from("wearable_oauth_states").insert({
        state, user_id: user.id, provider, code_verifier: null, redirect_uri: redirectUri,
      });
      if (ins.error) return fail("Could not start the connection.", 500);

      const url = new URL(cfg.authorizeUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId(provider));
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", cfg.scope);
      url.searchParams.set("state", state);
      for (const [k, v] of Object.entries(cfg.extraAuthParams || {})) url.searchParams.set(k, v);
      return json({ url: url.toString() });
    }

    if (action === "callback") {
      const code = String(body.code || "");
      const state = String(body.state || "");
      if (!code || !state) return fail("Missing authorization code.");
      const stateRow = await db.from("wearable_oauth_states")
        .select("*").eq("state", state).eq("user_id", user.id).maybeSingle();
      if (stateRow.error || !stateRow.data) return fail("This connection link has expired. Please try again.");
      const provider = stateRow.data.provider as Provider;
      if (!isProvider(provider)) return fail("Unknown provider.");
      const redirectUri = stateRow.data.redirect_uri || String(body.redirect_uri || "");

      const tokens = await exchangeCode(provider, code, redirectUri);
      const up = await db.from("wearable_connections").upsert({
        user_id: user.id,
        provider,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        scope: tokens.scope ?? PROVIDERS[provider].scope,
        expires_at: tokens.expires_at,
      }, { onConflict: "user_id,provider" });
      if (up.error) return fail("Connected, but couldn't save the connection.", 500);
      await db.from("wearable_oauth_states").delete().eq("state", state);
      return json({ provider, connected: true });
    }

    if (action === "sync") {
      const only = body.provider ? [String(body.provider)] : null;
      const conns = await db.from("wearable_connections").select("*").eq("user_id", user.id);
      if (conns.error) return fail("Could not read your connections.", 500);
      const providers: Record<string, unknown> = {};
      for (const conn of conns.data || []) {
        if (only && !only.includes(conn.provider)) continue;
        if (!isProvider(conn.provider)) continue;
        const provider = conn.provider as Provider;
        let accessToken = conn.access_token as string;
        const expired = !accessToken || (conn.expires_at && Date.parse(conn.expires_at) <= Date.now() + 60000);
        if (expired) {
          if (!conn.refresh_token) { providers[provider] = { error: "reconnect" }; continue; }
          try {
            const refreshed = await refreshTokens(provider, conn.refresh_token);
            accessToken = refreshed.access_token;
            await db.from("wearable_connections").update({
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
              expires_at: refreshed.expires_at,
              scope: refreshed.scope ?? conn.scope,
            }).eq("user_id", user.id).eq("provider", provider);
          } catch {
            providers[provider] = { error: "reconnect" };
            continue;
          }
        }
        const metrics = await fetchMetrics(provider, accessToken);
        const syncedAt = new Date().toISOString();
        await db.from("wearable_connections")
          .update({ last_metrics: metrics, last_synced_at: syncedAt })
          .eq("user_id", user.id).eq("provider", provider);
        providers[provider] = { metrics, last_synced_at: syncedAt };
      }
      return json({ providers });
    }

    if (action === "status") {
      const conns = await db.from("wearable_connections")
        .select("provider, scope, last_synced_at, last_metrics").eq("user_id", user.id);
      if (conns.error) return fail("Could not read your connections.", 500);
      return json({
        connections: (conns.data || []).map((c) => ({
          provider: c.provider,
          connected: true,
          scope: c.scope,
          last_synced_at: c.last_synced_at,
          last_metrics: c.last_metrics || {},
        })),
      });
    }

    if (action === "disconnect") {
      const provider = String(body.provider || "");
      if (!provider) return fail("Missing provider.");
      const del = await db.from("wearable_connections")
        .delete().eq("user_id", user.id).eq("provider", provider);
      if (del.error) return fail("Could not disconnect.", 500);
      return json({ provider, disconnected: true });
    }

    return fail("Unknown action.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unexpected connector error.", 500);
  }
});
