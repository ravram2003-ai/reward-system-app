// Pointwell — "Generate with AI" Edge Function.
// Calls the real Anthropic Claude API server-side so the API key NEVER touches the
// frontend or the (public) repo. The key is read from the Supabase secret
// ANTHROPIC_API_KEY (set in the dashboard: Edge Functions -> Secrets, or via the CLI).
//
// Uses a plain fetch to the Anthropic Messages API (no external dependency) so it
// deploys cleanly from the Supabase dashboard editor or the CLI.
//
// Contract:
//   POST { goals, rewards, penalties, categories, strictness, targets, adjust, kind }
//   -> 200 { system: { title, category, description, explanation, rules: [...] } }
//   -> 4xx/5xx { error: "<clean, user-facing message>" }
//
// Each rule is the SIMPLE spec the app already consumes:
//   { label, category, unit, style: "goal"|"every"|"yesNo", goal, every, points, tier }
//   tier: "core"|"extra"|"bonus"|"penalty"  (penalty rules use negative points)

const MODEL = "claude-haiku-4-5"; // cheapest current model — ideal for short rule generation
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You design "reward systems" for Pointwell, a daily habit/goal tracker. A reward system is a small set of scoring rules a person checks off each day to earn (or lose) points.

You will receive the user's goals, habits to reward, habits to discourage (penalties), categories, a strictness level, and optional numeric targets. Produce a focused, motivating system tailored to THEM — specific to their actual words, not generic.

RULE MODEL — every rule has:
- "label": short, specific name of the habit (e.g. "Deep work block", "10k steps").
- "category": a short grouping label.
- "unit": what is being measured (e.g. "minutes", "steps", "sessions", "pages", "times").
- "style": one of
    - "goal"  — hit a daily target once (use "goal" = the target amount).
    - "every" — earn points repeatedly per increment (use "goal" = daily target, "every" = the increment that earns points).
    - "yesNo" — simple did-it / didn't (set "goal" to 0).
- "goal": numeric daily target (0 for yesNo).
- "every": numeric increment for "every" style (0 otherwise).
- "points": points earned, a small number (0.5–3). For PENALTY rules use a NEGATIVE number.
- "tier": "core" (essential), "extra" (supporting), "bonus" (stretch), or "penalty".

GUIDELINES:
- 4–8 rules total. Lean toward "core" rules; add "extra"/"bonus" for depth.
- Respect strictness: "lenient" = fewer, easier rules and lower targets; "balanced" = moderate; "strict" = more rules, higher targets, and include penalties if any were given.
- Only include PENALTY rules (tier "penalty", negative points) if the user actually listed habits to discourage. For a penalty, "goal" is the minimum acceptable amount per day.
- Honor any numeric targets the user gave.
- Keep labels concrete and concise. No fluff.

OUTPUT: Respond with ONLY a single minified JSON object, no prose, no markdown code fences. Exact shape:
{"title":string,"category":string,"description":string,"explanation":string,"rules":[{"label":string,"category":string,"unit":string,"style":"goal"|"every"|"yesNo","goal":number,"every":number,"points":number,"tier":"core"|"extra"|"bonus"|"penalty"}]}
- "title": a short name for the system.
- "description": one sentence on what it rewards.
- "explanation": 1–2 sentences on why these rules, for the review screen.`;

// Refine mode — the user is editing an EXISTING system via a chat instruction.
const REFINE_SYSTEM_PROMPT = `You are editing an existing Pointwell reward system based on the user's instruction.

You receive the CURRENT system as JSON plus an instruction describing a change (e.g. "raise protein to 180g", "add a stretching rule", "make it stricter"). Apply ONLY what the instruction asks. Keep every other rule and field exactly as-is — preserve the labels, units, points, and tiers of rules the instruction does not mention. Do not drop rules unless asked to.

Each rule keeps this shape:
- "label", "category", "unit" (what is measured).
- "style": "goal" (hit a daily target once), "every" (points per increment), or "yesNo" (did it / didn't, goal 0).
- "goal": numeric daily target (0 for yesNo). "every": increment for "every" style (0 otherwise).
- "points": small number 0.5–3; NEGATIVE for a penalty rule.
- "tier": "core" | "extra" | "bonus" | "penalty".

OUTPUT: Respond with ONLY a single minified JSON object — the FULL updated system — in this EXACT shape, no prose, no markdown code fences:
{"title":string,"category":string,"description":string,"explanation":string,"rules":[{"label":string,"category":string,"unit":string,"style":"goal"|"every"|"yesNo","goal":number,"every":number,"points":number,"tier":"core"|"extra"|"bonus"|"penalty"}]}
- Keep "title"/"category" unless the instruction changes the focus.
- "explanation": ONE short sentence stating what you just changed.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function buildUserMessage(input: Record<string, unknown>): string {
  // Clamp every field — bounds the prompt size so a large body can't amplify API cost.
  const s = (v: unknown) => String(v ?? "").trim().slice(0, 600);
  const lines = [
    `Goals: ${s(input.goals) || "(not specified)"}`,
    `Habits to reward: ${s(input.rewards) || "(not specified)"}`,
    `Habits to discourage (penalties): ${s(input.penalties) || "(none)"}`,
    `Categories / focus: ${s(input.categories) || "(not specified)"}`,
    `Strictness: ${s(input.strictness) || "balanced"}`,
    `Targets: ${s(input.targets) || "(none)"}`,
  ];
  const adjust = s(input.adjust);
  if (adjust) lines.push(`Adjustments to apply this time: ${adjust}.`);
  const kind = s(input.kind);
  if (kind === "community") {
    lines.unshift("This system is for a COMMUNITY of people working toward a shared goal — keep rules fair and broadly applicable.");
  }
  return lines.join("\n");
}

// Build the user turn for a refine request: current system + recent chat + instruction.
function buildRefineMessage(input: Record<string, unknown>): string {
  let currentJson = "{}";
  try { currentJson = JSON.stringify(input.current ?? {}).slice(0, 6000); } catch { currentJson = "{}"; }
  const instruction = String(input.instruction ?? "").trim().slice(0, 600) || "(no change requested)";
  const history = Array.isArray(input.history) ? (input.history as any[]).slice(-6) : [];
  const histText = history
    .map((m) => `${String(m?.role) === "user" ? "User" : "Assistant"}: ${String(m?.text ?? "").slice(0, 300)}`)
    .join("\n");
  const lines = [`Current system (JSON):\n${currentJson}`];
  if (histText) lines.push(`Recent conversation:\n${histText}`);
  lines.push(`Apply this change and return the FULL updated system as JSON:\n${instruction}`);
  return lines.join("\n\n");
}

// Defensive: pull the JSON object out of the model's text even if it wrapped it in
// prose or markdown code fences.
function extractJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "AI is temporarily unavailable.";
  if (status === 429) return "The AI is busy right now — try again in a moment.";
  if (status === 400) return "The AI couldn't process that request.";
  return "Couldn't reach the AI service. Please try again.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not set on this Edge Function.");
    return jsonResponse({ error: "AI isn't configured yet." }, 500);
  }

  let input: Record<string, unknown> = {};
  try {
    input = (await req.json()) || {};
  } catch {
    input = {};
  }

  // Two modes, ONE function/path/key: "refine" edits an existing system from a chat
  // instruction; anything else generates a fresh system from the form inputs.
  const isRefine = String(input.mode ?? "") === "refine";
  const systemPrompt = isRefine ? REFINE_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const userContent = isRefine ? buildRefineMessage(input) : buildUserMessage(input);

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
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("Anthropic error:", resp.status, detail.slice(0, 300));
      return jsonResponse({ error: messageForStatus(resp.status) }, 502);
    }

    const data = await resp.json();
    const text = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("");

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.rules) || parsed.rules.length === 0) {
      return jsonResponse({ error: "The AI returned an unexpected response. Please try again." }, 502);
    }
    return jsonResponse({ system: parsed }, 200);
  } catch (err: any) {
    console.error("generate-rules failed:", err?.message);
    return jsonResponse({ error: "Couldn't reach the AI service. Please try again." }, 502);
  }
});
