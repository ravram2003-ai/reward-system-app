/**
 * Pointwell Daily Insight — hybrid rule-based (+ future AI-reworded) interpretation.
 *
 * PRINCIPLE: code computes the facts; AI may only reword the sentence later.
 * This module is pure (no DOM, no network) and is loaded both in the browser
 * (window.PointwellInsight) and in the node test harness (module.exports).
 *
 * computeInsightFacts(state)  -> plain facts object (no DOM access)
 * generateInsightText(facts)  -> exactly ONE sentence, priority ladder
 * generateAIInsight(facts)    -> drop-in for a future AI rewording (same in/out).
 *                                Today it simply returns generateInsightText(facts).
 */
(function (root) {
  // ── Tunable thresholds (tune the feel here, not the logic) ──────────────
  var INSIGHT_THRESHOLDS = {
    HIGH_COMPLETION: 0.8,    // fraction of target that counts as a "strong day"
    NEAR_TARGET_POINTS: 2,   // points-from-goal that counts as "close"
    BELOW_PACE_RATIO: 0.7    // today's total vs. the user's weekly average
  };

  function num(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function formatNum(value) {
    var n = num(value, 0);
    var rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function asPercent(fraction) {
    return Math.round(num(fraction, 0) * 100);
  }

  /**
   * Derive the plain facts from a day snapshot. The snapshot is assembled by the
   * app from the SAME numbers the Daily Point Total uses, so the card never drifts.
   *
   * state = {
   *   mode: 'personal' | 'community',
   *   total: number,            // daily point total (already computed in code)
   *   target: number,           // daily point target
   *   entryCount: number,       // distinct rules with activity logged today
   *   rules: [{ label, points, value, target }],
   *   weeklyAverage?: number,   // omit / null when no real history exists
   *   streak?: number           // omit / null when not tracked
   * }
   */
  function computeInsightFacts(state) {
    state = state || {};
    var rules = Array.isArray(state.rules) ? state.rules : [];
    var total = num(state.total, 0);
    var target = num(state.target, 0);

    var topContributorRule = null;
    rules.forEach(function (rule) {
      var points = num(rule.points, 0);
      if (points > 0 && (!topContributorRule || points > topContributorRule.points)) {
        topContributorRule = { label: rule.label, points: points };
      }
    });

    // weakest = the goal-bearing rule with the least progress / no activity today
    var weakestOrMissingRule = null;
    var weakestProgress = Infinity;
    rules.forEach(function (rule) {
      var ruleTarget = num(rule.target, 0);
      if (ruleTarget <= 0) return;
      var progress = num(rule.points, 0) / ruleTarget;
      var missing = num(rule.value, 0) <= 0 ? -1 : progress; // prefer untouched rules
      if (missing < weakestProgress) {
        weakestProgress = missing;
        weakestOrMissingRule = { label: rule.label, points: num(rule.points, 0) };
      }
    });

    var facts = {
      mode: state.mode === "community" ? "community" : "personal",
      dailyPointTotal: Math.round(total * 100) / 100,
      dailyTarget: Math.round(target * 100) / 100,
      percentComplete: target > 0 ? total / target : 0,
      topContributorRule: topContributorRule,
      weakestOrMissingRule: weakestOrMissingRule,
      entryCountToday: Math.max(0, Math.round(num(state.entryCount, 0)))
    };

    // Only include optional fields when the data genuinely exists.
    if (state.weeklyAverage !== null && state.weeklyAverage !== undefined && Number.isFinite(Number(state.weeklyAverage))) {
      facts.weeklyAverage = Math.round(Number(state.weeklyAverage) * 100) / 100;
    }
    if (state.streak !== null && state.streak !== undefined && Number.isFinite(Number(state.streak))) {
      facts.streak = Math.round(Number(state.streak));
    }
    return facts;
  }

  /**
   * Turn facts into exactly ONE sentence using a strict priority ladder.
   * Multiple conditions are often true at once — first match wins, never stack.
   */
  function generateInsightText(facts) {
    facts = facts || {};
    var T = INSIGHT_THRESHOLDS;
    var total = num(facts.dailyPointTotal, 0);
    var target = num(facts.dailyTarget, 0);
    var percent = num(facts.percentComplete, 0);
    var remaining = target - total;

    // 1. No entries today
    if (num(facts.entryCountToday, 0) <= 0) {
      return "No entries yet — log one thing to start building momentum.";
    }

    // 2. Near target (almost at the goal)
    if (target > 0 && remaining > 0 && remaining <= T.NEAR_TARGET_POINTS) {
      return "You're close — only " + formatNum(remaining) + " points left to hit today's goal.";
    }

    // 3. High completion
    if (percent >= T.HIGH_COMPLETION) {
      return "Strong day — you're already " + asPercent(percent) + "% of the way to your target.";
    }

    // 4. Below pace (only when a real weekly average exists)
    if (typeof facts.weeklyAverage === "number" && facts.weeklyAverage > 0 && total < facts.weeklyAverage * T.BELOW_PACE_RATIO) {
      return "You're below your usual pace, but one strong entry can close the gap.";
    }

    // 5. Top contributor
    if (facts.topContributorRule && facts.topContributorRule.label) {
      return facts.topContributorRule.label + " is your top contributor today.";
    }

    // 6. Above weekly average (only when a real weekly average exists)
    if (typeof facts.weeklyAverage === "number" && total > facts.weeklyAverage) {
      return "You're above your weekly average.";
    }

    // 7. Neutral fallback (mode-aware; first person only — never other members)
    if (facts.mode === "community") {
      return "You're " + asPercent(percent) + "% of the way to your community goal today.";
    }
    return "You're " + asPercent(percent) + "% of the way to today's goal.";
  }

  /**
   * Future AI rewording hook. A later implementation may send ONLY these summary
   * facts (never raw logs / health / finance / community data) to a model and
   * return a single reworded sentence. It must be a drop-in for generateInsightText:
   * same `facts` input, same one-sentence string output. No API is wired up now.
   */
  function generateAIInsight(facts) {
    return generateInsightText(facts);
  }

  var api = {
    INSIGHT_THRESHOLDS: INSIGHT_THRESHOLDS,
    computeInsightFacts: computeInsightFacts,
    generateInsightText: generateInsightText,
    generateAIInsight: generateAIInsight
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PointwellInsight = api;
})(typeof window !== "undefined" ? window : globalThis);
