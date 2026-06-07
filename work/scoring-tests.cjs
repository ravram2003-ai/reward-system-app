const scoring = require("../outputs/scoring.js");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "every",
    everyAmount: 5000,
    everyPoints: 1
  }), 10000).totalPoints,
  2,
  "points for every amount"
);

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "goal",
    dailyTarget: 10000,
    goalPoints: 3
  }), 9500).totalPoints,
  0,
  "goal bonus below target"
);

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "both",
    dailyTarget: 10000,
    goalPoints: 2,
    everyAmount: 5000,
    everyPoints: 1
  }), 10000).totalPoints,
  4,
  "both every and goal bonus"
);

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "yesNo",
    yesNoPoints: 2
  }), 1).totalPoints,
  2,
  "yes no completion"
);

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "penalty",
    minimumRequired: 7,
    everyAmount: 1,
    penaltyMode: "proportional",
    penaltyPoints: -0.5
  }), 6).totalPoints,
  -0.5,
  "proportional minimum penalty"
);

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "penalty",
    penaltyDirection: "over",
    minimumRequired: 0,
    everyAmount: 1,
    penaltyMode: "proportional",
    penaltyPoints: -1
  }), 1).totalPoints,
  -1,
  "over zero penalty"
);

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "both",
    dailyTarget: 10000,
    goalPoints: 2,
    everyAmount: 5000,
    everyPoints: 1,
    extraThresholds: [{ amount: 15000, points: 1 }]
  }), 15000).totalPoints,
  6,
  "extra threshold"
);

assertEqual(
  scoring.calculateRule(scoring.createRule({
    simpleStyle: "every",
    everyAmount: 5000,
    everyPoints: 1,
    maxDailyPoints: 5
  }), 40000).totalPoints,
  5,
  "max daily points"
);

const edited = scoring.createRule({ label: "Steps", simpleStyle: "goal", dailyTarget: 10000, goalPoints: 2 });
edited.dailyTarget = 12000;
assertEqual(scoring.normalizeRule(edited).dailyTarget, 12000, "editing saved rule");

const result = scoring.calculateRule(edited, 12000);
if (!result.explanation.includes("hitting your goal")) {
  throw new Error("explanation should match point calculation");
}

console.log("Scoring tests passed");
