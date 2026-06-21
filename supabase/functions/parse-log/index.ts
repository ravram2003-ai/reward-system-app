// Pointwell — "Quick log" parser Edge Function.
//
// Maps a short natural-language (or voice-transcribed) log into structured entries
// against the user's OWN loggable rules. Modeled on generate-rules for auth, the
// ANTHROPIC_API_KEY secret, and the LLM call. The caller passes its rule catalog, so
// this function never touches the database — like generate-rules it's a stateless LLM
// proxy, and the Supabase platform requires the caller's session to invoke it.
//
// Contract:
//   POST { text, rules: [{ id, label, unit, type ("number"|"yesNo"),
//                          contextType ("personal"|"community"), contextId, contextName }] }
//   -> 200 {
//        entries: [{ contextType, contextId, ruleId, amount? (number) | done? (bool),
//                    note?, confidence (0-1) }],
//        clarifications: [{ ruleHint, question, amount, done,
//                           options: [{ contextType, contextId, contextName, ruleId, type }] }]
//          (amount + done are both carried; the client uses the one matching the rule
//           the user picks. `type` is "number" | "yesNo" for that option's rule.)
//      }
//   -> 4xx/5xx { error: "<clean, user-facing message>" }
//
// The output is SANITIZED server-side: an entry is only accepted for a ruleId we were
// given, its context is forced from that rule (the model can't redirect a log to a
// context it doesn't belong to), amounts are coerced by rule type, and clarification
// options are rebuilt from the real rules (never trusted from the model).

const MODEL = "claude-haiku-4-5"; // cheapest current model — ideal for short parsing
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You convert a short natural-language activity log into structured entries against a FIXED list of the user's loggable rules.

You receive the user's text and a JSON list of rules. Each rule has:
- "id": opaque rule id — echo it back EXACTLY; never invent one.
- "label": what it tracks (e.g. "10k steps", "Lifting", "Protein").
- "unit": the measure (e.g. "steps", "session", "g", "minutes", "done").
- "type": "number" (a numeric amount) or "yesNo" (did it / didn't).
- "contextType": "personal" or "community".
- "contextId" / "contextName": which system or community the rule belongs to.

TASK: For each thing the user clearly did, output one entry mapped to the BEST-matching rule by label + unit.
- "number" rule → set "amount" to the number the user said, converting words/units ("ten thousand" → 10000; "an hour" for a minutes unit → 60; "a couple miles" → 2). If the user is vague, give your best numeric guess and a LOWER confidence.
- "yesNo" rule → set "done": true (omit amount).
- Echo "contextType", "contextId", "ruleId" from the matched rule.
- "note": a short optional note only if the user added color ("felt great"). Omit otherwise.
- "confidence": 0-1, how sure you are of the mapping.

RULES YOU MUST FOLLOW:
- NEVER invent a rule. Only use rule ids from the input list. If a phrase matches nothing, skip it.
- If a phrase could match the SAME activity in MORE THAN ONE context (e.g. a "Lifting" rule exists in two different communities), DO NOT GUESS the context — instead add a "clarifications" item: { "ruleHint": the activity label, "question": a short question, plus "amount" or "done" for the value the user implied } and DO NOT emit an entry for it. (The server fills in the candidate options.)
- One entry per distinct activity. Don't duplicate.

OUTPUT: respond with ONLY a single minified JSON object — no prose, no markdown fences:
{"entries":[{"contextType":string,"contextId":string,"ruleId":string,"amount":number,"done":boolean,"note":string,"confidence":number}],"clarifications":[{"ruleHint":string,"question":string,"amount":number,"done":boolean}]}
- Each entry includes "amount" OR "done" (not both): "amount" for number rules, "done":true for yesNo rules.
- Use [] for empty entries/clarifications.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface CatalogRule {
  id: string; label: string; unit: string; type: "number" | "yesNo";
  contextType: "personal" | "community"; contextId: string; contextName: string;
}

// Clamp + normalize the rule catalog so a huge/malformed body can't amplify cost.
function sanitizeRules(input: unknown): CatalogRule[] {
  const arr = Array.isArray(input) ? input.slice(0, 200) : [];
  const out: CatalogRule[] = [];
  for (const r of arr) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? "").slice(0, 80);
    const label = String(o.label ?? "").slice(0, 120);
    if (!id || !label) continue;
    out.push({
      id, label,
      unit: String(o.unit ?? "").slice(0, 40),
      type: o.type === "yesNo" ? "yesNo" : "number",
      contextType: o.contextType === "community" ? "community" : "personal",
      contextId: String(o.contextId ?? "").slice(0, 80),
      contextName: String(o.contextName ?? "").slice(0, 120),
    });
  }
  return out;
}

function buildUserMessage(text: string, rules: CatalogRule[]): string {
  const clean = text.trim().slice(0, 1000);
  const compact = rules.map((r) => ({
    id: r.id, label: r.label, unit: r.unit, type: r.type,
    contextType: r.contextType, contextId: r.contextId, contextName: r.contextName,
  }));
  return `User said:\n${clean || "(nothing)"}\n\nRules (JSON):\n${JSON.stringify(compact)}`;
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

// Validate the model output against the rules we actually sent. The model is never
// trusted to set a context or a rule we don't recognize.
function sanitizeResult(parsed: any, rules: CatalogRule[]) {
  const byId = new Map(rules.map((r) => [r.id, r]));

  const entries: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const e of (Array.isArray(parsed?.entries) ? parsed.entries : [])) {
    const ruleId = String(e?.ruleId ?? "");
    const rule = byId.get(ruleId);
    if (!rule) continue;                 // never accept a rule we didn't send
    if (seen.has(ruleId)) continue;      // de-dupe
    const entry: Record<string, unknown> = {
      contextType: rule.contextType,     // forced from the real rule, not the model
      contextId: rule.contextId,
      ruleId,
      confidence: clamp01(e?.confidence),
    };
    if (rule.type === "yesNo") {
      entry.done = true;
    } else {
      const amt = Number(e?.amount);
      entry.amount = Number.isFinite(amt) && amt > 0 ? Math.round(amt * 100) / 100 : 1;
    }
    const note = String(e?.note ?? "").trim().slice(0, 200);
    if (note) entry.note = note;
    entries.push(entry);
    seen.add(ruleId);
  }

  // For each clarification, rebuild the candidate options from the REAL rules whose
  // label matches the hint (across contexts). Only keep a clarification that's truly
  // ambiguous (≥2 candidate contexts) and not already covered by an emitted entry.
  const clarifications: Record<string, unknown>[] = [];
  const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
  for (const c of (Array.isArray(parsed?.clarifications) ? parsed.clarifications : [])) {
    const hint = String(c?.ruleHint ?? "").trim();
    if (!hint) continue;
    const lc = hint.toLowerCase();
    // Prefer rules whose label EXACTLY equals the hint (the real "same activity in two
    // contexts" case). Fall back to a shared whole-word token — not a raw substring,
    // which over-matched (e.g. "run" → "running", "work" inside "workout").
    let matches = rules.filter((r) => r.label.toLowerCase() === lc);
    if (matches.length < 2) {
      const hintTokens = tokens(hint);
      matches = rules.filter((r) => Array.from(tokens(r.label)).some((t) => hintTokens.has(t)));
    }
    const options = matches
      .filter((r) => !seen.has(r.id))
      .map((r) => ({ contextType: r.contextType, contextId: r.contextId, contextName: r.contextName, ruleId: r.id, type: r.type }));
    if (options.length < 2) continue;    // not actually ambiguous
    const amt = Number(c?.amount);
    clarifications.push({
      ruleHint: hint.slice(0, 120),
      question: (String(c?.question ?? "").trim() || `Log "${hint}" to which one?`).slice(0, 200),
      // Carry BOTH implied values — candidate rules can differ in type, so the client
      // uses "amount" for a number rule or "done" for a yes/no rule, whichever is picked.
      amount: Number.isFinite(amt) && amt > 0 ? Math.round(amt * 100) / 100 : 1,
      done: true,
      options,
    });
  }

  return { entries, clarifications };
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
  try { input = (await req.json()) || {}; } catch { input = {}; }

  const text = String(input.text ?? "");
  const rules = sanitizeRules(input.rules);
  if (!text.trim()) return jsonResponse({ error: "Say what you did." }, 400);
  if (!rules.length) return jsonResponse({ error: "No loggable rules to match against." }, 400);

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
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(text, rules) }],
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
    const result = sanitizeResult(parsed, rules);
    return jsonResponse(result, 200);
  } catch (err: any) {
    console.error("parse-log failed:", err?.message);
    return jsonResponse({ error: "Couldn't reach the AI service. Please try again." }, 502);
  }
});
