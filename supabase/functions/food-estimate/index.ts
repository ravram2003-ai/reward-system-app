// Pointwell — "Snap a meal" food-photo estimator Edge Function.
//
// Takes a meal photo and returns a ROUGH calorie + macro estimate the user reviews and
// edits before logging. Modeled on parse-log for auth, the ANTHROPIC_API_KEY secret, and
// the LLM call — the only difference is a multimodal message (text + image block). Like
// parse-log it's a stateless LLM proxy and never touches the database.
//
// Contract:
//   POST { image: base64 (no "data:" prefix), mediaType ("image/jpeg"|"image/png"|
//          "image/webp"|"image/gif"), hint?: string }
//   -> 200 { calories, protein, carbs, fat, items: string[], note, confidence (0-1) }
//        Every number is the model's best ESTIMATE — the client labels it as such and
//        keeps it editable. We never claim precision.
//   -> 4xx/5xx { error: "<clean, user-facing message>" }
//
// The output is SANITIZED server-side: numbers are coerced to finite, non-negative,
// rounded values; strings are clamped; nothing here is trusted as exact.

const MODEL = "claude-haiku-4-5"; // multimodal + cheap — fine for a rough estimate
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// base64 of a ~6MB image ≈ 8M chars. Reject larger bodies so a giant payload can't
// amplify cost (the client already caps photos at 5MB before upload).
const MAX_IMAGE_CHARS = 9_000_000;

const SYSTEM_PROMPT = `You analyze ONE photo a user attached in a habit/goal tracker and return a structured, ROUGH estimate they will review and edit. First classify the image into "kind":

- "food": a meal, snack, or drink. Estimate for the whole item: "calories" (kcal), "protein", "carbs", "fat" (grams), and "items" (up to 6 short food names).
- "workout": a cardio-machine display (treadmill/bike/rower), a fitness-app or smartwatch workout summary, or a photo clearly showing a completed activity. Set "activity" (e.g. "Run","Walk","Cycling","Lift"), "duration" (minutes), "distance" (number) with "distanceUnit" ("mi" or "km"), and "calories" (kcal) — fill in the ones you can read, use 0 for the rest.
- "other": anything else. Set "note" to a one-line description of what you see, and "suggestion" to a short idea of what habit it might count toward (e.g. "Looks like a yoga session — log it to a mindfulness rule?").

Always set "confidence" 0-1 (lower it when values/portions are unclear). If the photo is unreadable or you can't tell, set kind "other", confidence 0, and note "I couldn't make out that photo.". These are ROUGH estimates — never claim precision, and never invent a number you cannot actually see (use 0).

The user may add a short text hint — use it to refine the estimate.

OUTPUT: respond with ONLY a single minified JSON object — no prose, no markdown fences:
{"kind":"food"|"workout"|"other","calories":number,"protein":number,"carbs":number,"fat":number,"items":[string],"activity":string,"duration":number,"distance":number,"distanceUnit":"mi"|"km","note":string,"suggestion":string,"confidence":number}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Pull the JSON object out of the model's text even if it wrapped it in prose/fences.
function extractJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

// Non-negative, finite, rounded to a whole number (or 1 decimal for macros). A negative
// or NaN value from the model becomes 0 — never a fabricated guess of our own.
function nonNegNumber(v: unknown, decimals = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function sanitizeResult(parsed: any) {
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items = rawItems
    .map((it: unknown) => String(it ?? "").trim().slice(0, 60))
    .filter((it: string) => it.length > 0)
    .slice(0, 6);
  const kind = parsed?.kind === "food" || parsed?.kind === "workout" ? parsed.kind : "other";
  return {
    kind,
    calories: nonNegNumber(parsed?.calories, 0),
    protein: nonNegNumber(parsed?.protein, 1),
    carbs: nonNegNumber(parsed?.carbs, 1),
    fat: nonNegNumber(parsed?.fat, 1),
    items,
    activity: String(parsed?.activity ?? "").trim().slice(0, 40),
    duration: nonNegNumber(parsed?.duration, 0),
    distance: nonNegNumber(parsed?.distance, 2),
    distanceUnit: parsed?.distanceUnit === "km" ? "km" : "mi",
    note: String(parsed?.note ?? "").trim().slice(0, 200),
    suggestion: String(parsed?.suggestion ?? "").trim().slice(0, 160),
    confidence: clamp01(parsed?.confidence),
  };
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "AI is temporarily unavailable.";
  if (status === 429) return "The AI is busy right now — try again in a moment.";
  if (status === 400) return "The AI couldn't read that photo.";
  return "Couldn't reach the AI service. Please try again.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not set on this Edge Function.");
    return jsonResponse({ error: "Food estimates aren't configured yet." }, 500);
  }

  let input: Record<string, unknown> = {};
  try { input = (await req.json()) || {}; } catch { input = {}; }

  // Strip a stray "data:<type>;base64," prefix if the client sent one.
  let image = String(input.image ?? "");
  const comma = image.indexOf(",");
  if (image.startsWith("data:") && comma > -1) image = image.slice(comma + 1);
  image = image.trim();

  const mediaType = ALLOWED_MEDIA.has(String(input.mediaType)) ? String(input.mediaType) : "image/jpeg";
  const hint = String(input.hint ?? "").trim().slice(0, 200);

  if (!image) return jsonResponse({ error: "Attach a photo of the meal." }, 400);
  if (image.length > MAX_IMAGE_CHARS) return jsonResponse({ error: "That photo is too large — try a smaller one." }, 400);

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: hint ? `The user added: "${hint}". Estimate this meal.` : "Estimate this meal." },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("Anthropic error:", resp.status, detail.slice(0, 300));
      return jsonResponse({ error: messageForStatus(resp.status) }, 502);
    }

    const data = await resp.json();
    const out = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("");

    const parsed = extractJson(out);
    if (!parsed || typeof parsed !== "object") {
      return jsonResponse({ error: "The AI returned an unexpected response. Please try again." }, 502);
    }
    return jsonResponse(sanitizeResult(parsed), 200);
  } catch (err: any) {
    console.error("food-estimate failed:", err?.message);
    return jsonResponse({ error: "Couldn't reach the AI service. Please try again." }, 502);
  }
});
