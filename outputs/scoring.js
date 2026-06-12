(function (root) {
  const simpleStyleLabels = {
    goal: "Give me points when I hit my goal",
    every: "Give me points for every amount I complete",
    both: "Give me both",
    yesNo: "Yes/No goal",
    penalty: "Penalty goal"
  };

  const inputMethodLabels = {
    slider: "Slider + manual entry",
    number: "Slider + manual entry",
    toggle: "Yes/No checkbox"
  };

  function createRule(overrides) {
    return normalizeRule({
      id: "rule",
      label: "Steps",
      category: "Fitness",
      metric: "steps",
      unit: "steps",
      simpleStyle: "both",
      dailyTarget: 10000,
      goalPoints: 2,
      everyAmount: 5000,
      everyPoints: 1,
      yesNoPoints: 2,
      penaltyEnabled: false,
      penaltyDirection: "below",
      minimumRequired: 0,
      penaltyPoints: -1,
      penaltyMode: "fixed",
      extraThresholds: [],
      maxDailyPoints: 0,
      inputMethod: "slider",
      inputMin: 0,
      inputMax: 20000,
      inputStep: 100,
      dataSource: "manual",
      sourceMetric: "manual",
      allowManualOverride: true,
      ...(overrides || {})
    });
  }

  function normalizeRule(rule) {
    if (!rule) return createRule();
    if (rule.simpleStyle) return normalizeSimpleRule(rule);
    return normalizeLegacyRule(rule);
  }

  function normalizeSimpleRule(rule) {
    const label = cleanText(rule.label || rule.metric || "Steps");
    const unit = cleanText(rule.unit || "units");
    const simpleStyle = rule.simpleStyle || "both";
    const dailyTarget = numberOrDefault(rule.dailyTarget, simpleStyle === "yesNo" ? 1 : 100);
    const everyAmount = numberOrDefault(rule.everyAmount ?? rule.awardEvery, Math.max(1, dailyTarget / 2));
    const inputMethod = simpleStyle === "yesNo" ? "toggle" : (rule.inputMethod || "slider");
    const source = normalizeRuleSource(rule, label, unit);
    return {
      id: cleanText(rule.id || makeId("rule")),
      label,
      category: cleanText(rule.category || "Personal habits"),
      metric: cleanText(rule.metric || label.toLowerCase()),
      unit,
      simpleStyle,
      dailyTarget,
      goalPoints: numberOrDefault(rule.goalPoints ?? rule.rewardPoints, 2),
      everyAmount,
      everyPoints: numberOrDefault(rule.everyPoints ?? rule.rewardPoints, 1),
      yesNoPoints: numberOrDefault(rule.yesNoPoints ?? rule.rewardPoints, 2),
      penaltyEnabled: Boolean(rule.penaltyEnabled || simpleStyle === "penalty"),
      penaltyDirection: rule.penaltyDirection || "below",
      minimumRequired: numberOrDefault(rule.minimumRequired, simpleStyle === "penalty" ? dailyTarget : 0),
      penaltyPoints: normalizePenalty(rule.penaltyPoints),
      penaltyMode: rule.penaltyMode || "fixed",
      extraThresholds: normalizeThresholds(rule.extraThresholds),
      maxDailyPoints: numberOrDefault(rule.maxDailyPoints, 0),
      inputMethod,
      inputMin: numberOrDefault(rule.inputMin, 0),
      inputMax: numberOrDefault(rule.inputMax, inferInputMax(rule, dailyTarget, inputMethod)),
      inputStep: numberOrDefault(rule.inputStep, inferInputStep(unit, inputMethod)),
      dataSource: source.dataSource,
      sourceMetric: source.sourceMetric,
      allowManualOverride: rule.allowManualOverride !== false,
      style: rule.style,
      type: rule.type,
      threshold: rule.threshold,
      points: rule.points
    };
  }

  function normalizeLegacyRule(rule) {
    const type = rule.type || "";
    const style = rule.style || legacyTypeToStyle(type);
    const threshold = numberOrDefault(rule.threshold, 1);
    const reward = numberOrDefault(rule.rewardPoints ?? rule.points, 1);
    const penalty = normalizePenalty(rule.penaltyPoints ?? rule.points ?? -1);
    const base = {
      id: cleanText(rule.id || makeId("rule")),
      label: cleanText(rule.label || "Rule"),
      category: cleanText(rule.category || "Personal habits"),
      metric: cleanText(rule.metric || rule.label || "metric").toLowerCase(),
      unit: cleanText(rule.unit || "units"),
      dailyTarget: numberOrDefault(rule.dailyTarget, inferLegacyDailyTarget(rule, threshold)),
      inputMethod: rule.inputMethod || (type === "once" || style === "bonusOnly" ? "toggle" : "slider"),
      inputMax: rule.inputMax,
      inputStep: rule.inputStep,
      maxDailyPoints: rule.maxDailyPoints || 0,
      extraThresholds: rule.extraThresholds || [],
      dataSource: rule.dataSource,
      sourceMetric: rule.sourceMetric || rule.syncedMetric,
      allowManualOverride: rule.allowManualOverride
    };

    if (style === "targetBonus") {
      return createRule({ ...base, simpleStyle: "goal", goalPoints: Math.abs(reward) });
    }
    if (style === "bonusOnly") {
      return createRule({ ...base, simpleStyle: "yesNo", yesNoPoints: Math.abs(reward), dailyTarget: 1, inputMethod: "toggle" });
    }
    if (style === "penaltyOnly" || style === "minimumRequirement") {
      return createRule({
        ...base,
        simpleStyle: "penalty",
        penaltyEnabled: true,
        penaltyDirection: "below",
        minimumRequired: numberOrDefault(rule.minimumRequired, numberOrDefault(rule.dailyTarget, threshold)),
        penaltyMode: rule.penaltyMode || "proportional",
        penaltyPoints: penalty,
        everyAmount: numberOrDefault(rule.awardEvery, 1)
      });
    }
    if (style === "overLimit") {
      return createRule({
        ...base,
        simpleStyle: "penalty",
        penaltyEnabled: true,
        penaltyDirection: "over",
        minimumRequired: numberOrDefault(rule.minimumRequired, numberOrDefault(rule.dailyTarget, threshold)),
        penaltyMode: rule.penaltyMode || "proportional",
        penaltyPoints: penalty,
        everyAmount: numberOrDefault(rule.awardEvery, 1)
      });
    }
    if (style === "aboveBelow") {
      return createRule({
        ...base,
        simpleStyle: "both",
        goalPoints: 0,
        everyAmount: numberOrDefault(rule.awardEvery, 1),
        everyPoints: Math.abs(reward),
        penaltyEnabled: true,
        minimumRequired: numberOrDefault(rule.minimumRequired, threshold),
        penaltyMode: "proportional",
        penaltyPoints: penalty
      });
    }
    return createRule({
      ...base,
      simpleStyle: type === "count" ? "every" : "every",
      everyAmount: numberOrDefault(rule.awardEvery, type === "count" ? 1 : threshold),
      everyPoints: Math.abs(reward)
    });
  }

  function calculateRule(ruleInput, rawValue) {
    const rule = normalizeRule(ruleInput);
    const value = numberOrDefault(rawValue, 0);
    let rewardPoints = 0;
    let penaltyPoints = 0;
    const parts = [];

    if (rule.simpleStyle === "goal" || rule.simpleStyle === "both") {
      if (value >= rule.dailyTarget && rule.goalPoints !== 0) {
        rewardPoints += rule.goalPoints;
        parts.push(`${formatSigned(rule.goalPoints)} for hitting your goal`);
      }
    }

    if (rule.simpleStyle === "every" || rule.simpleStyle === "both") {
      const units = Math.floor(value / safePositive(rule.everyAmount));
      const earned = units * rule.everyPoints;
      if (earned !== 0) {
        rewardPoints += earned;
        parts.push(`${formatSigned(earned)} from ${units} x ${formatValue(rule.everyAmount)} ${rule.unit}`);
      }
    }

    if (rule.simpleStyle === "yesNo") {
      if (value > 0) {
        rewardPoints += rule.yesNoPoints;
        parts.push(`${formatSigned(rule.yesNoPoints)} for completing it`);
      }
    }

    const extra = calculateExtraThresholds(rule, value);
    if (extra.rewardPoints !== 0) {
      rewardPoints += extra.rewardPoints;
      parts.push(extra.explanation);
    }

    if (rule.penaltyEnabled || rule.simpleStyle === "penalty") {
      const penalty = calculatePenalty(rule, value);
      penaltyPoints += penalty.points;
      if (penalty.explanation) parts.push(penalty.explanation);
    }

    const cappedReward = applyRewardCap(rewardPoints, rule.maxDailyPoints);
    if (cappedReward !== rewardPoints) {
      parts.push(`rewards capped at ${formatValue(rule.maxDailyPoints)} points`);
      rewardPoints = cappedReward;
    }

    rewardPoints = roundScore(rewardPoints);
    penaltyPoints = roundScore(penaltyPoints);
    const totalPoints = roundScore(rewardPoints + penaltyPoints);

    return {
      rule,
      value,
      totalPoints,
      rewardPoints,
      penaltyPoints,
      score: totalPoints,
      explanation: parts.length ? sentenceJoin(parts) : "No points earned yet.",
      detail: parts.length ? sentenceJoin(parts) : `${formatValue(value)} ${rule.unit} entered.`
    };
  }

  function calculateSystem(system, values) {
    const rules = (system?.rules || []).map(normalizeRule);
    const breakdown = rules.map((rule) => calculateRule(rule, values?.[rule.id]));
    const total = roundScore(breakdown.reduce((sum, item) => sum + item.totalPoints, 0));
    return { breakdown, total };
  }

  function calculateExtraThresholds(rule, value) {
    const hit = rule.extraThresholds.filter((item) => value >= item.amount);
    const rewardPoints = roundScore(hit.reduce((sum, item) => sum + item.points, 0));
    return {
      rewardPoints,
      explanation: rewardPoints ? `${formatSigned(rewardPoints)} from extra rewards` : ""
    };
  }

  function calculatePenalty(rule, value) {
    const minimum = numberOrDefault(rule.minimumRequired, 0);
    if (minimum <= 0 && rule.penaltyDirection !== "over") return { points: 0, explanation: "" };
    const missed = rule.penaltyDirection === "over" ? value > minimum : value < minimum;
    if (!missed) return { points: 0, explanation: "" };
    const penalty = normalizePenalty(rule.penaltyPoints);
    if (rule.penaltyMode === "proportional") {
      const distance = Math.abs(value - minimum);
      const units = Math.ceil(distance / safePositive(rule.everyAmount || 1));
      const points = roundScore(units * penalty);
      return {
        points,
        explanation: `${formatSigned(points)} penalty for being ${rule.penaltyDirection === "over" ? "over" : "under"} ${formatValue(minimum)} ${rule.unit}`
      };
    }
    return {
      points: penalty,
      explanation: `${formatSigned(penalty)} penalty for missing the minimum`
    };
  }

  function describeRule(ruleInput) {
    const rule = normalizeRule(ruleInput);
    const lines = [];
    if (rule.simpleStyle !== "yesNo" && rule.simpleStyle !== "penalty") {
      lines.push(`Goal: ${formatValue(rule.dailyTarget)} ${rule.unit}`);
    }
    if (rule.simpleStyle === "goal") {
      lines.push(`Scoring: ${formatSigned(rule.goalPoints)} if goal is reached`);
    }
    if (rule.simpleStyle === "every") {
      lines.push(`Scoring: ${formatSigned(rule.everyPoints)} per ${formatValue(rule.everyAmount)} ${rule.unit}`);
    }
    if (rule.simpleStyle === "both") {
      lines.push(`Scoring: ${formatSigned(rule.everyPoints)} per ${formatValue(rule.everyAmount)} ${rule.unit}`);
      if (rule.goalPoints) lines.push(`Bonus: ${formatSigned(rule.goalPoints)} if goal is reached`);
    }
    if (rule.simpleStyle === "yesNo") {
      lines.push(`Scoring: ${formatSigned(rule.yesNoPoints)} when completed`);
    }
    if (rule.simpleStyle === "penalty") {
      const direction = rule.penaltyDirection === "over" ? "over" : "under";
      lines.push(`Penalty: ${formatSigned(rule.penaltyPoints)} if ${direction} ${formatValue(rule.minimumRequired)} ${rule.unit}`);
    }
    if (rule.penaltyEnabled && rule.simpleStyle !== "penalty") {
      lines.push(`Penalty: ${formatSigned(rule.penaltyPoints)} if under ${formatValue(rule.minimumRequired)} ${rule.unit}`);
    }
    if (rule.extraThresholds.length) {
      lines.push(`Extra: ${rule.extraThresholds.map((item) => `${formatSigned(item.points)} at ${formatValue(item.amount)}`).join(", ")}`);
    }
    lines.push(`Input: ${inputMethodLabels[rule.inputMethod] || "Manual entry"}`);
    return lines;
  }

  function previewRule(ruleInput) {
    const rule = normalizeRule(ruleInput);
    const parts = [`${rule.label}:`];
    if (rule.simpleStyle !== "yesNo" && rule.simpleStyle !== "penalty") {
      parts.push(`Your goal is ${formatValue(rule.dailyTarget)} ${rule.unit}.`);
    }
    if (rule.simpleStyle === "goal") {
      parts.push(`You get ${formatSigned(rule.goalPoints)} points if you hit your goal.`);
    }
    if (rule.simpleStyle === "every") {
      parts.push(`You get ${formatSigned(rule.everyPoints)} point for every ${formatValue(rule.everyAmount)} ${rule.unit}.`);
    }
    if (rule.simpleStyle === "both") {
      parts.push(`You get ${formatSigned(rule.everyPoints)} point for every ${formatValue(rule.everyAmount)} ${rule.unit}`);
      if (rule.goalPoints) parts.push(`plus ${formatSigned(rule.goalPoints)} bonus points if you hit your goal.`);
      else parts.push(".");
    }
    if (rule.simpleStyle === "yesNo") {
      parts.push(`You get ${formatSigned(rule.yesNoPoints)} points when you check it off.`);
    }
    if (rule.simpleStyle === "penalty") {
      const direction = rule.penaltyDirection === "over" ? "more than" : "fewer than";
      parts.push(`You lose ${formatSigned(rule.penaltyPoints)} points if you get ${direction} ${formatValue(rule.minimumRequired)} ${rule.unit}.`);
    }
    if (rule.penaltyEnabled && rule.simpleStyle !== "penalty") {
      const mode = rule.penaltyMode === "proportional" ? `for every ${formatValue(rule.everyAmount)} ${rule.unit} under` : "if under";
      parts.push(`You lose ${formatSigned(rule.penaltyPoints)} points ${mode} ${formatValue(rule.minimumRequired)} ${rule.unit}.`);
    }
    if (rule.extraThresholds.length) {
      parts.push(`Extra rewards: ${rule.extraThresholds.map((item) => `${formatSigned(item.points)} at ${formatValue(item.amount)} ${rule.unit}`).join("; ")}.`);
    }
    return parts.join(" ").replace(/\s+\./g, ".");
  }

  function normalizeThresholds(thresholds) {
    if (!Array.isArray(thresholds)) return [];
    return thresholds
      .map((item) => ({
        id: item.id || makeId("threshold"),
        amount: numberOrDefault(item.amount, 0),
        points: numberOrDefault(item.points, 1)
      }))
      .filter((item) => item.amount > 0 && item.points !== 0);
  }

  function applyRewardCap(points, maxDailyPoints) {
    const cap = numberOrDefault(maxDailyPoints, 0);
    if (cap <= 0 || points <= cap || points <= 0) return points;
    return cap;
  }

  function legacyTypeToStyle(type) {
    if (type === "below") return "penaltyOnly";
    if (type === "over") return "overLimit";
    if (type === "once") return "bonusOnly";
    return "linear";
  }

  function inferInputMax(rule, dailyTarget, inputMethod) {
    if (inputMethod === "toggle") return 1;
    return Math.max(numberOrDefault(rule.inputMax, 0), dailyTarget * 2, 10);
  }

  function inferLegacyDailyTarget(rule, threshold) {
    const unit = String(rule.unit || "").toLowerCase();
    if (rule.type === "per" && unit.includes("step")) return threshold * 2;
    return threshold;
  }

  function inferInputStep(unit, inputMethod) {
    if (inputMethod === "toggle") return 1;
    const lower = String(unit || "").toLowerCase();
    if (["hours", "miles", "dollars"].includes(lower)) return 0.25;
    if (["steps"].includes(lower)) return 100;
    return 1;
  }

  function normalizeRuleSource(rule, label, unit) {
    const supported = new Set(["manual", "apple-health", "google-health-connect", "chase", "plaid", "calculated"]);
    const savedSource = cleanText(rule.dataSource || rule.source || "");
    if (shouldStayManualSource(label, unit)) {
      return { dataSource: "manual", sourceMetric: "manual" };
    }
    const inferred = inferRuleSource(label, unit);
    const dataSource = supported.has(savedSource)
      ? savedSource
      : (rule.dataSource === undefined && rule.sourceMetric === undefined ? inferred.dataSource : "manual");
    const sourceMetric = cleanText(rule.sourceMetric || rule.syncedMetric || "")
      || (dataSource === inferred.dataSource ? inferred.sourceMetric : dataSource);
    return {
      dataSource,
      sourceMetric: sourceMetric || "manual"
    };
  }

  function inferRuleSource(label, unit) {
    const text = `${label || ""} ${unit || ""}`.toLowerCase();
    if (text.includes("step")) return { dataSource: "apple-health", sourceMetric: "steps" };
    if (text.includes("sleep")) return { dataSource: "apple-health", sourceMetric: "sleep-hours" };
    if (text.includes("active calorie")) return { dataSource: "apple-health", sourceMetric: "active-calories" };
    if (text.includes("calorie")) return { dataSource: "calculated", sourceMetric: "total-calories" };
    if (text.includes("workout") || text.includes("gym session")) return { dataSource: "apple-health", sourceMetric: "workouts" };
    if (text.includes("lifting") || text.includes("exercise minute")) return { dataSource: "apple-health", sourceMetric: "exercise-minutes" };
    if (text.includes("dining")) return { dataSource: "plaid", sourceMetric: "dining-spending" };
    if (text.includes("shopping")) return { dataSource: "plaid", sourceMetric: "shopping-spending" };
    if (text.includes("spending") || text.includes("budget") || text.includes("transaction") || text.includes("dollar")) {
      return { dataSource: "plaid", sourceMetric: "daily-spending" };
    }
    return { dataSource: "manual", sourceMetric: "manual" };
  }

  function shouldStayManualSource(label, unit) {
    const text = `${label || ""} ${unit || ""}`.toLowerCase();
    return [
      "missed",
      "late",
      "phone",
      "screen",
      "scroll",
      "impulse",
      "check-in",
      "journal",
      "bedtime",
      "morning"
    ].some((term) => text.includes(term));
  }

  function normalizePenalty(value) {
    const number = numberOrDefault(value, -1);
    return number > 0 ? -number : number;
  }

  function numberOrDefault(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function safePositive(value) {
    return Math.max(numberOrDefault(value, 1), 0.0001);
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function formatSigned(value) {
    const number = numberOrDefault(value, 0);
    return `${number >= 0 ? "+" : ""}${formatValue(number)}`;
  }

  function formatValue(value) {
    const rounded = roundScore(value);
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
  }

  function roundScore(value) {
    return Math.round(numberOrDefault(value, 0) * 100) / 100;
  }

  function sentenceJoin(parts) {
    return parts.join("; ");
  }

  function makeId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  const api = {
    simpleStyleLabels,
    inputMethodLabels,
    createRule,
    normalizeRule,
    calculateRule,
    calculateSystem,
    describeRule,
    previewRule,
    formatSigned,
    formatValue,
    normalizePenalty
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellScoring = api;
})(typeof window !== "undefined" ? window : globalThis);
