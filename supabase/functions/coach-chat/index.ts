// Pointwell — "Coach" chat ROUTER Edge Function.
//
// Classifies a Coach message as a log / question / chat and, for questions, picks WHICH
// deterministic data lookup the app should run. It NEVER computes, estimates, or states any
// number — every figure in an answer is computed in the client from local state. The model's
// only job here is intent + routing (+ a short friendly reply for plain chat). Modeled on
// parse-log for auth, the ANTHROPIC_API_KEY secret, and the LLM call; stateless, no DB.
//
// Contract:
//   POST { text, context?: { communities?: string[], systems?: string[],
//                            metrics?: string[], rules?: string[] } }
//   -> 200 {
//        intent: "log" | "question" | "chat",
//        query?:  { id, metric?, context?, rule?, period? },   // when intent="question"
//        reply?:  string,                                       // when intent="chat"
//        clarify?: string                                       // ambiguous → one question
//      }
//   -> 4xx/5xx { error: "<clean, user-facing message>" }

const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const QUERY_IDS = new Set(["metric_today", "context_score", "rule_progress", "rank", "unlogged", "was_logged", "week_summary", "overview"]);
const METRICS = new Set(["steps", "sleep", "calories", "distance"]);

// Server-side backstop: even if the model mis-classifies, never answer a health/medical/diet
// question with tracking data — force it to a plain refusal.
const MEDICAL = /\b(doctor|medical|prescription|symptom|diagnos|disease|illness|medication|nutritionist|eating disorder|diet plan|lose weight|weight loss|calorie deficit|how many calories should|is it (safe|healthy|ok) to)\b/i;
const MEDICAL_REPLY = "I can only help with your Pointwell tracking — for health, diet, or medical questions, please talk to a qualified professional.";

const SYSTEM_PROMPT = `You are the ROUTER for Pointwell's "Coach" assistant. Pointwell tracks habits/goals as points. You NEVER compute, estimate, guess, or state ANY number, score, step count, rank, or metric value — the app computes every figure in code from the user's own data. Your ONLY job is to (a) classify the message and (b) for a question, choose which data lookup applies.

Respond with ONLY a single minified JSON object — no prose, no markdown fences:
{"intent":string,"query":{"id":string,"metric":string,"context":string,"rule":string,"period":string},"reply":string,"clarify":string}

intent is one of:
- "log": the user is REPORTING something they did and want it recorded (e.g. "ran 5 miles", "lifted with the boys", "hit my protein", "8000 steps done"). Omit query/reply/clarify.
- "question": the user is ASKING about their own tracked data (e.g. "how many steps today?", "what's my rank in the boys?", "what's left to log?", "did I hit my reading?"). Set "query".
- "chat": greetings, thanks, encouragement, or anything that is not a log or a data question. Put a short friendly reply (<200 chars, NO numbers) in "reply". If the message is genuinely AMBIGUOUS between logging and asking, instead set "clarify" to ONE short question (e.g. "Want me to log that, or are you asking how you're doing?").

For intent "question", set query.id to exactly one of:
- "metric_today": a wearable metric today or vs goal (steps / sleep / calories / distance). Also set query.metric to one of: steps, sleep, calories, distance.
- "context_score": points or progress in a system/community today ("how many points today?", "how am I doing in THE BOYS?"). Set query.context to the named system/community, otherwise "active".
- "rule_progress": progress on a specific rule/habit ("how's my protein?", "am I on track for reading?"). Set query.rule to the rule/habit name; set query.context if a place is named.
- "rank": the user's rank or gap to the leader in a community ("what's my rank?", "am I winning?", "how far behind am I?"). Set query.context to the community, else "active".
- "unlogged": what the user still hasn't logged today ("what's left?", "what do I still need to do?").
- "was_logged": whether a specific thing was already logged today ("did I log my steps?", "have I done reading?"). Set query.rule or query.metric.
- "week_summary": this week so far ("how was my week?", "how many days did I hit my goal?"). Set query.context if named.
- "overview": a general "how am I doing today?" with no specific metric/place.
If a question doesn't fit a specific id, use "overview".

CONTEXT the user may reference (names only — never read figures into these):
{{CONTEXT}}

HARD RULES:
- Output NO numbers, scores, counts, or metric values anywhere (not even in reply/clarify).
- NEVER give medical, diet, weight, or calorie-target advice. If asked for that, set intent "chat" with a reply that you can only help with their Pointwell tracking, not health/medical advice.
- reply and clarify must be <200 characters, friendly, plain text.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

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

function str(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function buildContextBlock(ctx: any): string {
  const list = (arr: unknown, max: number) =>
    (Array.isArray(arr) ? arr : []).map((v) => str(v, 60)).filter(Boolean).slice(0, max).join(", ") || "(none)";
  const communities = list(ctx?.communities, 30);
  const systems = list(ctx?.systems, 30);
  const metrics = list(ctx?.metrics, 20);
  const rules = list(ctx?.rules, 60);
  return `- Communities: ${communities}\n- Personal systems: ${systems}\n- Tracked wearable metrics: ${metrics}\n- Rules/habits: ${rules}`;
}

// Validate the model output. The model is never trusted to produce numbers; intent + query.id
// are clamped to known enums; free text is length-limited.
function sanitizeResult(parsed: any) {
  const intent = parsed?.intent === "log" || parsed?.intent === "question" ? parsed.intent : (parsed?.intent === "chat" ? "chat" : "chat");
  const out: Record<string, unknown> = { intent };
  if (intent === "question") {
    const q = parsed?.query || {};
    const id = QUERY_IDS.has(String(q?.id)) ? String(q.id) : "overview";
    const query: Record<string, string> = { id };
    if (id === "metric_today" && METRICS.has(String(q?.metric))) query.metric = String(q.metric);
    const ctx = str(q?.context, 60);
    if (ctx) query.context = ctx;
    const rule = str(q?.rule, 80);
    if (rule) query.rule = rule;
    const period = str(q?.period, 20);
    if (period) query.period = period;
    out.query = query;
  } else if (intent === "chat") {
    const clarify = str(parsed?.clarify, 200);
    const reply = str(parsed?.reply, 200);
    if (clarify) out.clarify = clarify;
    else out.reply = reply || "I'm here to help you log things and answer questions about your day.";
  }
  return out;
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "AI is temporarily unavailable.";
  if (status === 429) return "The AI is busy right now — try again in a moment.";
  return "Couldn't reach the AI service. Please try again.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not set on this Edge Function.");
    return jsonResponse({ error: "Coach isn't configured yet." }, 500);
  }

  let input: Record<string, unknown> = {};
  try { input = (await req.json()) || {}; } catch { input = {}; }
  const text = str(input.text, 1000);
  if (!text) return jsonResponse({ error: "Say something first." }, 400);

  // Hard refusal for medical/diet questions — don't even ask the model.
  if (MEDICAL.test(text)) return jsonResponse({ intent: "chat", reply: MEDICAL_REPLY }, 200);

  const system = SYSTEM_PROMPT.replace("{{CONTEXT}}", buildContextBlock(input.context));

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("Anthropic error:", resp.status, detail.slice(0, 300));
      return jsonResponse({ error: messageForStatus(resp.status) }, 502);
    }
    const data = await resp.json().catch(() => null);
    if (!data || !Array.isArray(data.content)) {
      console.error("Unexpected Anthropic response shape");
      return jsonResponse({ error: "The AI returned an unexpected response. Please try again." }, 502);
    }
    const out = data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
    const parsed = extractJson(out);
    if (!parsed || typeof parsed !== "object") {
      return jsonResponse({ error: "The AI returned an unexpected response. Please try again." }, 502);
    }
    // Backstop: if a medical/diet message slipped through as a non-chat intent, refuse.
    const result = sanitizeResult(parsed);
    if (result.intent !== "chat" && MEDICAL.test(text)) return jsonResponse({ intent: "chat", reply: MEDICAL_REPLY }, 200);
    return jsonResponse(result, 200);
  } catch (err: any) {
    console.error("coach-chat failed:", err?.message);
    return jsonResponse({ error: "Couldn't reach the AI service. Please try again." }, 502);
  }
});
