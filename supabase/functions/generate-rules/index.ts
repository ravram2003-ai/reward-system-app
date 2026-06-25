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
- OPTIONAL "condition": for a "yesNo" rule, a short specific phrase for what counts as done (e.g. "do a 45-minute workout"). Omit when the label already says it.
- OPTIONAL "uncertain": true when you filled in a target or condition the user did NOT specify, so they should confirm it. Omit otherwise.
- OPTIONAL "suggestions": 1–4 short alternative phrasings for an uncertain "yesNo" condition. Omit when not needed.

GUIDELINES:
- 4–8 rules total. Lean toward "core" rules; add "extra"/"bonus" for depth.
- Respect strictness: "lenient" = fewer, easier rules and lower targets; "balanced" = moderate; "strict" = more rules, higher targets, and include penalties if any were given.
- Only include PENALTY rules (tier "penalty", negative points) if the user actually listed habits to discourage. For a penalty, "goal" is the minimum acceptable amount per day.
- Honor any numeric targets the user gave.
- Keep labels concrete and concise. No fluff.

OUTPUT: Respond with ONLY a single minified JSON object, no prose, no markdown code fences. Exact shape (the last three rule keys are OPTIONAL — include only when useful):
{"title":string,"category":string,"description":string,"explanation":string,"rules":[{"label":string,"category":string,"unit":string,"style":"goal"|"every"|"yesNo","goal":number,"every":number,"points":number,"tier":"core"|"extra"|"bonus"|"penalty","condition"?:string,"uncertain"?:boolean,"suggestions"?:string[]}]}
- "title": a short name for the system.
- "description": one sentence on what it rewards.
- "explanation": 1–2 sentences on why these rules, for the review screen.`;

// Refine mode — the user is editing an EXISTING system via a chat instruction.
const REFINE_SYSTEM_PROMPT = `You are SURGICALLY editing an EXISTING Pointwell reward system from the user's instruction. The CURRENT system JSON is the source of truth — it already reflects the user's own manual edits, so never discard them.

You receive the CURRENT system as JSON plus an instruction describing a change (e.g. "raise protein to 180g", "add a stretching rule", "make it stricter"). Make the SMALLEST edit that satisfies it:
- Echo back EVERY rule the instruction does NOT mention EXACTLY as given — identical label, category, unit, style, goal, every, points, tier (and any condition/uncertain/suggestions). Do not rename, re-point, re-target, reorder, reword, or drop them.
- Add a rule only if asked; modify only the specific rule(s) named; remove a rule only if explicitly asked to.
- NEVER regenerate a fresh or generic system, and NEVER replace the whole rule set. If the instruction is vague, make the minimal sensible change and keep everything else untouched.
- Keep title/category/description unless the instruction changes the focus.

Each rule keeps this shape:
- "label", "category", "unit" (what is measured).
- "style": "goal" (hit a daily target once), "every" (points per increment), or "yesNo" (did it / didn't, goal 0).
- "goal": numeric daily target (0 for yesNo). "every": increment for "every" style (0 otherwise).
- "points": small number 0.5–3; NEGATIVE for a penalty rule.
- "tier": "core" | "extra" | "bonus" | "penalty".
- OPTIONAL "condition"/"uncertain"/"suggestions" (as in generation) — preserve them on rules you do not change.

OUTPUT: Respond with ONLY a single minified JSON object — the FULL updated system — in this EXACT shape, no prose, no markdown code fences (the last three rule keys are OPTIONAL):
{"title":string,"category":string,"description":string,"explanation":string,"rules":[{"label":string,"category":string,"unit":string,"style":"goal"|"every"|"yesNo","goal":number,"every":number,"points":number,"tier":"core"|"extra"|"bonus"|"penalty","condition"?:string,"uncertain"?:boolean,"suggestions"?:string[]}]}
- Keep "title"/"category" unless the instruction changes the focus.
- "explanation": ONE short sentence stating what you just changed.`;

// Recap mode — write a short, warm "Yesterday, recapped" line from the user's OWN summary.
const RECAP_SYSTEM_PROMPT = `You write a SHORT daily recap of YESTERDAY for one Pointwell user, to greet them on their first app open today.

You receive a plain summary of what THEY did yesterday: the rules/habits they logged, the points they earned, their best current streak, and their leaderboard standing in a community (if any).

Write 1–2 warm, second-person sentences ("you …") that celebrate the day and weave in the concrete facts you were given — name the habits, the points, the streak length, and the community standing when present. Sound like an encouraging friend, not a report.

HARD RULES:
- Use ONLY the facts in the summary. Never invent numbers, habits, streaks, or rankings.
- No health, medical, diet, or weight advice of any kind. Just reflect what they did.
- Keep it under ~240 characters. No emojis except an optional single 🔥 when a streak is mentioned. No hashtags, no markdown, no quotes.
- Output ONLY the recap sentence(s) as plain text — nothing else.`;

// Build the user turn for a recap: yesterday's structured summary → readable lines.
function buildRecapMessage(input: Record<string, unknown>): string {
  const summary = (input.summary && typeof input.summary === "object" ? input.summary : {}) as Record<string, unknown>;
  const s = (v: unknown) => String(v ?? "").trim().slice(0, 120);
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const rules = Array.isArray(summary.rules) ? (summary.rules as any[]).slice(0, 6) : [];
  const ruleText = rules.length
    ? rules.map((r) => `${s(r?.label)}${num(r?.points) ? ` (+${num(r.points)} pts)` : ""}`).join(", ")
    : "(nothing logged)";
  const lines = [
    `Habits logged yesterday: ${ruleText}`,
    `Total points earned yesterday: ${num(summary.totalPoints)}`,
  ];
  const streak = summary.streak && typeof summary.streak === "object" ? summary.streak as Record<string, unknown> : null;
  if (streak && num(streak.length) >= 2) lines.push(`Current streak: ${num(streak.length)} days${streak.name ? ` in ${s(streak.name)}` : ""}`);
  const standing = summary.standing && typeof summary.standing === "object" ? summary.standing as Record<string, unknown> : null;
  if (standing && num(standing.rank) >= 1) lines.push(`Leaderboard standing: #${num(standing.rank)}${standing.total ? ` of ${num(standing.total)}` : ""}${standing.name ? ` in ${s(standing.name)}` : ""}`);
  return lines.join("\n");
}

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
  if (String(input.kind ?? "") === "community") {
    lines.push("This system is for a COMMUNITY of people working toward a shared goal — keep any new or changed rules fair and broadly applicable.");
  }
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

  // Recap mode — return a short prose recap of yesterday (plain text, NOT a system JSON).
  // Handled first so the normal generate/refine path below is completely untouched.
  if (String(input.mode ?? "") === "recap") {
    try {
      const resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 200,
          system: RECAP_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildRecapMessage(input) }],
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        console.error("Anthropic recap error:", resp.status, detail.slice(0, 300));
        return jsonResponse({ error: messageForStatus(resp.status) }, 502);
      }
      const data = await resp.json();
      const recap = (data?.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").trim();
      if (!recap) return jsonResponse({ error: "The AI returned an unexpected response." }, 502);
      return jsonResponse({ recap: recap.slice(0, 400) }, 200);
    } catch (err: any) {
      console.error("recap failed:", err?.message);
      return jsonResponse({ error: "Couldn't reach the AI service. Please try again." }, 502);
    }
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
