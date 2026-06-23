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

const SYSTEM_PROMPT = `You estimate the nutrition of a meal from a single photo. You are a rough estimator, not a scale — give your best guess for a typical serving of what you see.

Return ONE estimate for the WHOLE plate/meal in the image:
- "calories": total kilocalories (number).
- "protein": grams of protein (number).
- "carbs": grams of carbohydrate (number).
- "fat": grams of fat (number).
- "items": a short array of the main foods you recognize (e.g. ["grilled chicken","rice","broccoli"]). Keep it to at most 6 short strings.
- "note": one short sentence on what you assumed (e.g. "Assumed a ~200g chicken breast and 1 cup of rice."). Keep it under 160 characters.
- "confidence": 0-1, how sure you are. Lower it when the portion size or ingredients are unclear, or the photo is not food.

If the image is clearly NOT food, set every number to 0, items to [], confidence to 0, and note to "No food detected in the photo.".

The user may add a short text hint about the meal — use it to refine the estimate.

OUTPUT: respond with ONLY a single minified JSON object — no prose, no markdown fences:
{"calories":number,"protein":number,"carbs":number,"fat":number,"items":[string],"note":string,"confidence":number}`;

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
  return {
    calories: nonNegNumber(parsed?.calories, 0),
    protein: nonNegNumber(parsed?.protein, 1),
    carbs: nonNegNumber(parsed?.carbs, 1),
    fat: nonNegNumber(parsed?.fat, 1),
    items,
    note: String(parsed?.note ?? "").trim().slice(0, 200),
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
