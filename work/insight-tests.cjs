const insight = require("../outputs/insight.js");
const { computeInsightFacts, generateInsightText } = insight;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function sentence(state) {
  return generateInsightText(computeInsightFacts(state));
}

// 1. Empty state — no entries today
assertEqual(
  sentence({ mode: "personal", total: 0, target: 10, entryCount: 0, rules: [] }),
  "No entries yet — log one thing to start building momentum.",
  "empty state"
);

// 2. Near target — within NEAR_TARGET_POINTS of the goal (beats high-completion)
assertEqual(
  sentence({ mode: "personal", total: 9, target: 10, entryCount: 2, rules: [{ label: "Steps", points: 9, value: 8000, target: 10 }] }),
  "You're close — only 1 points left to hit today's goal.",
  "near target"
);

// 3. Top contributor — names the best-performing rule
assertEqual(
  sentence({
    mode: "personal", total: 5, target: 12, entryCount: 2,
    rules: [{ label: "Steps", points: 3, value: 6000, target: 6 }, { label: "Lifting", points: 2, value: 1, target: 2 }]
  }),
  "Steps is your top contributor today.",
  "top contributor"
);

// 4. High completion — strong day, but not within near-target margin
assertEqual(
  sentence({ mode: "personal", total: 17, target: 20, entryCount: 3, rules: [{ label: "A", points: 17, value: 1, target: 20 }] }),
  "Strong day — you're already 85% of the way to your target.",
  "high completion"
);

// 5. Below pace — only when a real weekly average exists (beats top contributor)
assertEqual(
  sentence({
    mode: "personal", total: 3, target: 20, entryCount: 1, weeklyAverage: 10,
    rules: [{ label: "Steps", points: 3, value: 6000, target: 20 }]
  }),
  "You're below your usual pace, but one strong entry can close the gap.",
  "below pace"
);

// 6. Above weekly average — when there's no single top contributor
assertEqual(
  sentence({ mode: "personal", total: 8, target: 20, entryCount: 2, weeklyAverage: 5, rules: [{ label: "X", points: 0, value: 1, target: 10 }] }),
  "You're above your weekly average.",
  "above weekly average"
);

// 7. Fallback — personal mode wording
assertEqual(
  sentence({ mode: "personal", total: 4, target: 20, entryCount: 1, rules: [{ label: "X", points: 0, value: 1, target: 10 }] }),
  "You're 20% of the way to today's goal.",
  "fallback personal"
);

// 8. Fallback — community mode refers to the user's own community score only
assertEqual(
  sentence({ mode: "community", total: 4, target: 20, entryCount: 1, rules: [{ label: "X", points: 0, value: 1, target: 10 }] }),
  "You're 20% of the way to your community goal today.",
  "fallback community"
);

// 9. computeInsightFacts derives facts and omits absent optional data
const facts = computeInsightFacts({ mode: "personal", total: 6, target: 12, entryCount: 2, rules: [{ label: "Run", points: 4, value: 3, target: 6 }] });
assertEqual(facts.percentComplete, 0.5, "facts percentComplete");
assertEqual(facts.topContributorRule.label, "Run", "facts top contributor label");
assertEqual(facts.entryCountToday, 2, "facts entry count");
assertEqual("weeklyAverage" in facts, false, "facts omits missing weeklyAverage");
assertEqual("streak" in facts, false, "facts omits missing streak");

console.log("Insight tests passed");
