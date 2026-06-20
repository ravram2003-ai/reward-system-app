// Pointwell — Wearables connector (Supabase Edge Function, Deno).
//
// The ONE secure place that holds the Fitbit/Whoop client secrets and OAuth tokens.
// The static browser app never sees a token; it only calls these JSON actions:
//
//   { action: "authorize",  provider, redirect_uri }  -> { url }          (start OAuth)
//   { action: "callback",   code, state, redirect_uri} -> { provider }    (finish OAuth)
//   { action: "sync",       provider? }                -> { providers:{…}} (live metrics)
//   { action: "status" }                               -> { connections:[…] }
//   { action: "disconnect", provider }                 -> { disconnected }
//
// Every call must carry the signed-in user's Supabase JWT in the Authorization
// header; the function resolves it to a user id and scopes all DB access to that
// user. Tokens are read/written with the service-role key (RLS is bypassed); the
// tables themselves are locked to client roles (see supabase/wearables.sql).
//
// Required function secrets (set with `supabase secrets set …`):
//   FITBIT_CLIENT_ID            (required for Fitbit)
//   FITBIT_CLIENT_SECRET        (optional — omit for a PKCE "Personal"/"Client" app)
//   WHOOP_CLIENT_ID             (required for Whoop)
//   WHOOP_CLIENT_SECRET         (required for Whoop)
//   WEARABLE_ALLOWED_REDIRECTS  (optional CSV of allowed redirect URLs; sensible
//                                localhost + *.github.io defaults are built in)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by the
// platform automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "fitbit" | "whoop";

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  usesPkce: boolean;
  // client_secret placement at the token endpoint:
  //  - "basic": HTTP Basic header  (Fitbit confidential apps)
  //  - "body":  form fields         (Whoop)
  //  - "none":  PKCE only, no secret (Fitbit Personal/Client apps)
  secretStyle: "basic" | "body" | "none";
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  fitbit: {
    authorizeUrl: "https://www.fitbit.com/oauth2/authorize",
    tokenUrl: "https://api.fitbit.com/oauth2/token",
    scope: "activity heartrate sleep profile",
    usesPkce: true,
    secretStyle: "basic", // downgraded to "none" automatically if no secret is set
  },
  whoop: {
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    // `offline` is what makes Whoop return a refresh_token.
    scope: "read:recovery read:sleep read:cycles read:workout read:profile offline",
    usesPkce: false,
    secretStyle: "body",
  },
};

const WHOOP_API = "https://api.prod.whoop.com/developer/v2";
const FITBIT_API = "https://api.fitbit.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function env(name: string): string {
  return Deno.env.get(name) ?? "";
}

// ── small crypto helpers (PKCE + state) ──────────────────────────────────────
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// ── redirect allow-list (prevents the connector being used as an open redirect) ─
function allowedRedirect(uri: string): boolean {
  if (!uri) return false;
  const extra = env("WEARABLE_ALLOWED_REDIRECTS")
    .split(",").map((s) => s.trim()).filter(Boolean);
  let host: URL;
  try { host = new URL(uri); } catch { return false; }
  // Built-in: any localhost/127.0.0.1 port, and any *.github.io page.
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
  const clientId = env(provider === "fitbit" ? "FITBIT_CLIENT_ID" : "WHOOP_CLIENT_ID");
  const clientSecret = env(provider === "fitbit" ? "FITBIT_CLIENT_SECRET" : "WHOOP_CLIENT_SECRET");
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  params.set("client_id", clientId);

  const style = cfg.secretStyle === "basic" && !clientSecret ? "none" : cfg.secretStyle;
  if (style === "basic") {
    headers["Authorization"] = "Basic " + btoa(`${clientId}:${clientSecret}`);
  } else if (style === "body" && clientSecret) {
    params.set("client_secret", clientSecret);
  }
  return new Request(cfg.tokenUrl, { method: "POST", headers, body: params.toString() });
}

async function parseTokens(resp: Response): Promise<Tokens> {
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(data.errors?.[0]?.message || data.error_description || data.error || `token request failed (${resp.status})`);
  }
  const expiresIn = num(data.expires_in);
  const expiresAt = expiresIn !== null
    ? new Date(Date.now() + (expiresIn - 60) * 1000).toISOString()
    : null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    token_type: data.token_type ?? null,
    scope: data.scope ?? null,
    expires_at: expiresAt,
  };
}

async function exchangeCode(provider: Provider, code: string, verifier: string | null, redirectUri: string): Promise<Tokens> {
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirectUri);
  if (verifier) params.set("code_verifier", verifier);
  return parseTokens(await fetch(tokenRequest(provider, params)));
}

async function refreshTokens(provider: Provider, refreshToken: string): Promise<Tokens> {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  if (provider === "whoop") params.set("scope", "offline");
  const tokens = await parseTokens(await fetch(tokenRequest(provider, params)));
  // Some providers omit a new refresh_token on refresh — keep the old one.
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
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

async function fetchFitbit(token: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  // `today` resolves in the account's own timezone, so no server-side date math.
  const activity = await getJson(`${FITBIT_API}/1/user/-/activities/date/today.json`, token);
  if (activity?.summary) {
    const s = activity.summary;
    put(out, "steps", num(s.steps));
    put(out, "active-calories", num(s.activityCalories ?? s.caloriesOut));
    put(out, "active-minutes", (num(s.veryActiveMinutes) ?? 0) + (num(s.fairlyActiveMinutes) ?? 0));
    const total = Array.isArray(s.distances) ? s.distances.find((d: any) => d.activity === "total") : null;
    put(out, "distance-miles", total ? num(total.distance) : null);
  }
  const sleep = await getJson(`${FITBIT_API}/1.2/user/-/sleep/date/today.json`, token);
  if (sleep?.summary) put(out, "sleep-hours", (num(sleep.summary.totalMinutesAsleep) ?? 0) / 60);
  const heart = await getJson(`${FITBIT_API}/1/user/-/activities/heart/date/today/1d.json`, token);
  const restingHr = heart?.["activities-heart"]?.[0]?.value?.restingHeartRate;
  put(out, "resting-heart-rate", num(restingHr));
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
    put(out, "calories", kj !== null ? kj / 4.184 : null); // kJ → kcal
  }
  return out;
}

function fetchMetrics(provider: Provider, token: string): Promise<Record<string, number>> {
  return provider === "fitbit" ? fetchFitbit(token) : fetchWhoop(token);
}

// ── main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey) return fail("Connector is missing Supabase configuration.", 500);

  // Resolve the caller from their JWT. getUser() must be given the token
  // explicitly — there is no local session on the server.
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
      const provider = body.provider as Provider;
      if (!PROVIDERS[provider]) return fail("Unknown provider.");
      if (!env(provider === "fitbit" ? "FITBIT_CLIENT_ID" : "WHOOP_CLIENT_ID")) {
        return fail(`${provider} is not configured on the server yet.`, 500);
      }
      const redirectUri = String(body.redirect_uri || "");
      if (!allowedRedirect(redirectUri)) return fail("Redirect URL is not allowed.");

      const cfg = PROVIDERS[provider];
      const state = randomToken(24);
      let verifier: string | null = null;
      let challenge: string | null = null;
      if (cfg.usesPkce) {
        verifier = randomToken(48);
        challenge = await pkceChallenge(verifier);
      }

      // prune stale handshakes (older than 15 min) then record this one
      await db.from("wearable_oauth_states")
        .delete().lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
      const ins = await db.from("wearable_oauth_states").insert({
        state, user_id: user.id, provider, code_verifier: verifier, redirect_uri: redirectUri,
      });
      if (ins.error) return fail("Could not start the connection.", 500);

      const url = new URL(cfg.authorizeUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", env(provider === "fitbit" ? "FITBIT_CLIENT_ID" : "WHOOP_CLIENT_ID"));
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", cfg.scope);
      url.searchParams.set("state", state);
      if (challenge) {
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");
      }
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
      const redirectUri = stateRow.data.redirect_uri || String(body.redirect_uri || "");

      const tokens = await exchangeCode(provider, code, stateRow.data.code_verifier, redirectUri);
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
        const provider = conn.provider as Provider;
        let accessToken = conn.access_token as string;
        // Refresh if the token is missing or within 60s of expiry.
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
