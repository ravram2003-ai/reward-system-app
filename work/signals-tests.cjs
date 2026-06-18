const signals = require("../outputs/signals.js");
const insight = require("../outputs/insight.js");

function assert(cond, label) {
  if (!cond) throw new Error("FAIL: " + label);
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── presets ────────────────────────────────────────────────────────────────
assert(signals.KUDOS_PRESETS.length >= 3, "kudos has presets");
assert(signals.MOTIVATION_PRESETS.length >= 2, "motivation has presets");
assert(signals.presetsForType("kudos").includes("Proud of you"), "kudos preset content");
assert(signals.presetsForType("motivation").includes("You've got this"), "motivation preset content");
// presetsForType returns a copy (mutating it must not affect the source)
signals.presetsForType("kudos").push("HACK");
assert(!signals.KUDOS_PRESETS.includes("HACK"), "presetsForType returns a copy");

// ── validateSignalDraft (mirrors DB constraints) ────────────────────────────
const ME = "user-a", PEER = "user-b";
assertEqual(validReason({ type: "kudos", body: "Proud of you", fromUser: ME, toUser: PEER }), true, "valid kudos");
assertEqual(validReason({ type: "motivation", body: "You've got this", fromUser: ME, toUser: PEER }), true, "valid motivation");
assertEqual(validReason({ type: "text", body: "hey there", fromUser: ME, toUser: PEER }), true, "valid text message");
assertEqual(validReason({ type: "text", body: "x".repeat(281), fromUser: ME, toUser: PEER }), "That message is a little long.", "text respects length cap");
assertEqual(validReason({ type: "text", body: "hi", fromUser: ME, toUser: ME }), "You can't send a signal to yourself.", "text rejects self-send");
assertEqual(validReason({ type: "boo", body: "x", fromUser: ME, toUser: PEER }), "Unknown signal type.", "rejects bad type");

// messaging API surface exists
["fetchThread", "blockUser", "unblockUser", "isBlockedByMe", "reportMessage"].forEach((fn) => {
  assert(typeof signals[fn] === "function", "signals." + fn + " exists");
});
assertEqual(validReason({ type: "kudos", body: "   ", fromUser: ME, toUser: PEER }), "Pick a message to send.", "rejects empty body");
assertEqual(validReason({ type: "kudos", body: "x".repeat(281), fromUser: ME, toUser: PEER }), "That message is a little long.", "rejects long body");
assertEqual(validReason({ type: "kudos", body: "hi", fromUser: "", toUser: PEER }), "Sign in to send a signal.", "rejects no sender");
assertEqual(validReason({ type: "kudos", body: "hi", fromUser: ME, toUser: "" }), "This member isn't on a real account yet.", "rejects no recipient");
assertEqual(validReason({ type: "kudos", body: "hi", fromUser: ME, toUser: ME }), "You can't send a signal to yourself.", "rejects self-send (rule d)");
// body is trimmed in the ok result
const okDraft = signals.validateSignalDraft({ type: "kudos", body: "  Keep it up  ", fromUser: ME, toUser: PEER });
assertEqual(okDraft.body, "Keep it up", "trims body");

function validReason(draft) {
  const r = signals.validateSignalDraft(draft);
  return r.ok ? true : r.reason;
}

// ── unreadCount ──────────────────────────────────────────────────────────────
assertEqual(signals.unreadCount([{ read: false }, { read: true }, { read: false }]), 2, "unread count");
assertEqual(signals.unreadCount([]), 0, "unread count empty");
assertEqual(signals.unreadCount(null), 0, "unread count null-safe");

// ── formatRelativeTime (deterministic via injected now) ──────────────────────
const now = Date.parse("2026-06-18T12:00:00Z");
assertEqual(signals.formatRelativeTime("2026-06-18T11:59:40Z", now), "just now", "relative just now");
assertEqual(signals.formatRelativeTime("2026-06-18T11:45:00Z", now), "15m", "relative minutes");
assertEqual(signals.formatRelativeTime("2026-06-18T09:00:00Z", now), "3h", "relative hours");
assertEqual(signals.formatRelativeTime("2026-06-16T12:00:00Z", now), "2d", "relative days");
assertEqual(signals.formatRelativeTime("2026-06-01T12:00:00Z", now), "2w", "relative weeks");

// ── isReady is false in node (no PointwellAuth) — must not throw ─────────────
assertEqual(signals.isReady(), false, "isReady false without auth");

// ── shared "behind" definition matches insight.js (no second definition) ─────
// Below 0.7 * weeklyAverage → behind; at/above → not behind; no average → not behind.
assertEqual(insight.isBehind({ dailyPointTotal: 2, weeklyAverage: 10 }), true, "behind when total < 0.7*avg");
assertEqual(insight.isBehind({ dailyPointTotal: 7, weeklyAverage: 10 }), false, "not behind at 0.7*avg");
assertEqual(insight.isBehind({ dailyPointTotal: 1, weeklyAverage: 0 }), false, "not behind with zero avg");
assertEqual(insight.isBehind({ dailyPointTotal: 1 }), false, "not behind with no avg (fresh user)");
// the Daily Insight sentence and the predicate agree
const behindFacts = insight.computeInsightFacts({ total: 2, target: 10, entryCount: 1, weeklyAverage: 10, rules: [] });
assert(insight.isBehind(behindFacts) === true, "predicate agrees with behind facts");
assert(insight.generateInsightText(behindFacts).indexOf("below your usual pace") !== -1, "sentence reflects behind");

console.log("Signals + behind-predicate tests passed");
