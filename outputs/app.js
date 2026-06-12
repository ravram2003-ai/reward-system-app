(function () {
  let todayIso = localDateKey();
  const storageKey = "pointwell-state-v1";
  const scoring = window.PointwellScoring;

  const categories = [
    "Fitness",
    "Running",
    "Lifting",
    "Sleep",
    "Academics",
    "Finance",
    "Personal habits",
    "Productivity",
    "General wellness"
  ];

  const dataSourceOptions = [
    { id: "manual", label: "Manual Entry" },
    { id: "apple-health", label: "Apple Health" },
    { id: "google-health-connect", label: "Google Health Connect" },
    { id: "chase", label: "Bank Account / Chase" },
    { id: "plaid", label: "Plaid" },
    { id: "calculated", label: "Calculated Total" }
  ];

  const sourceMetricOptions = {
    manual: [
      { id: "manual", label: "Manual entry" }
    ],
    "apple-health": [
      { id: "steps", label: "Steps" },
      { id: "sleep-hours", label: "Sleep hours" },
      { id: "workouts", label: "Workouts" },
      { id: "exercise-minutes", label: "Exercise minutes" },
      { id: "active-calories", label: "Active calories" },
      { id: "nutrition-protein", label: "Nutrition - protein" },
      { id: "nutrition-carbs", label: "Nutrition - carbs" },
      { id: "nutrition-fat", label: "Nutrition - fat" }
    ],
    "google-health-connect": [
      { id: "steps", label: "Steps" },
      { id: "sleep", label: "Sleep" },
      { id: "exercise-sessions", label: "Exercise sessions" },
      { id: "calories", label: "Calories" },
      { id: "nutrition", label: "Nutrition" }
    ],
    chase: [
      { id: "transactions", label: "Transactions" },
      { id: "daily-spending", label: "Daily spending" },
      { id: "dining-spending", label: "Spending by category - dining" },
      { id: "shopping-spending", label: "Spending by category - shopping" },
      { id: "recurring-charges", label: "Recurring charges" },
      { id: "account-balance", label: "Account balance" }
    ],
    plaid: [
      { id: "transactions", label: "Transactions" },
      { id: "daily-spending", label: "Daily spending" },
      { id: "dining-spending", label: "Spending by category - dining" },
      { id: "shopping-spending", label: "Spending by category - shopping" },
      { id: "recurring-charges", label: "Recurring charges" },
      { id: "account-balance", label: "Account balance" }
    ],
    calculated: [
      { id: "total-calories", label: "Total calories from macros" },
      { id: "workout-minutes", label: "Workout minutes total" },
      { id: "net-spending", label: "Net spending total" }
    ]
  };

  const integrationDefinitions = [
    {
      id: "apple-health",
      label: "Apple Health",
      description: "Steps, sleep, workouts, exercise minutes, active calories, and nutrition when shared.",
      privacy: "Apple Health data is only used to calculate your reward-system progress. You control which health data types are shared."
    },
    {
      id: "google-health-connect",
      label: "Google Health Connect",
      description: "Steps, sleep, exercise sessions, calories, and nutrition when available.",
      privacy: "Google Health Connect data is only used for the rules you link to this app. You can disconnect anytime."
    },
    {
      id: "chase",
      label: "Chase",
      description: "Transactions, daily spending, category spending, recurring charges, and balances.",
      privacy: "Bank data is only used to calculate finance-related goals such as daily spending or budgets. You can disconnect anytime."
    },
    {
      id: "plaid",
      label: "Plaid",
      description: "A future finance connection for transactions, spending categories, recurring charges, and balances.",
      privacy: "Plaid data is only used for finance-related goals you choose. Private bank details are not shared publicly."
    }
  ];

  const defaultMockSyncData = {
    "apple-health": {
      steps: 8500,
      "sleep-hours": 7.2,
      workouts: 1,
      "exercise-minutes": 45,
      "active-calories": 520,
      "nutrition-protein": 132,
      "nutrition-carbs": 210,
      "nutrition-fat": 61
    },
    "google-health-connect": {
      steps: 8200,
      sleep: 7.1,
      "exercise-sessions": 1,
      calories: 2180,
      nutrition: 1
    },
    chase: {
      transactions: 6,
      "daily-spending": 42,
      "dining-spending": 18,
      "shopping-spending": 0,
      "recurring-charges": 12,
      "account-balance": 2400
    },
    plaid: {
      transactions: 7,
      "daily-spending": 42,
      "dining-spending": 18,
      "shopping-spending": 0,
      "recurring-charges": 12,
      "account-balance": 2420
    },
    calculated: {
      "total-calories": 1917,
      "workout-minutes": 45,
      "net-spending": 42
    }
  };

  const setupSteps = [
    {
      title: "Basic Info",
      intro: "Start with the name, purpose, focus area, and visibility for this reward system.",
      nextLabel: "Next: Add scoring rules"
    },
    {
      title: "Scoring Rules",
      intro: "Add the actions, goals, rewards, and penalties that make up this system.",
      nextLabel: "Next: Advanced options",
      skipLabel: "Skip for now"
    },
    {
      title: "Advanced Options",
      intro: "Add optional calculated totals like calories, workout minutes, study time, or spending.",
      nextLabel: "Next: Review",
      skipLabel: "Skip advanced options"
    },
    {
      title: "Review & Complete",
      intro: "Check the system before finishing. You can go back to adjust anything.",
      nextLabel: "Complete"
    }
  ];

  const seedState = {
    profile: {
      id: "me",
      name: "Avery Rivera",
      handle: "@avery",
      privacy: "public",
      dailyTarget: 8,
      accent: "#355d91"
    },
    activeView: "dashboard",
    selectedSystemId: "life-core",
    trackerSystemId: "life-core",
    selectedCommunityId: "gym-crew",
    selectedCommunityMemberId: "me",
    scoreContext: "personal",
    buildMode: "home",
    buildSearchQuery: "",
    communitySearchQuery: "",
    pendingIntegrationId: "",
    integrations: {
      "apple-health": { status: "not-connected", lastSynced: "" },
      "google-health-connect": { status: "not-connected", lastSynced: "" },
      chase: { status: "not-connected", lastSynced: "" },
      plaid: { status: "not-connected", lastSynced: "" }
    },
    mockSyncData: structuredClone(defaultMockSyncData),
    buildViewedPublicId: "",
    buildViewedProfileId: "",
    aiDraftSystem: null,
    systemSetupStep: 0,
    systemEditorOpen: false,
    topCardPreferences: {},
    weeklyChartPreferences: {},
    editingRuleId: "",
    draftInputs: {},
    quickEntries: [],
    communityEntries: [
      communityEntry("ce-gym-me-gym", "gym-crew", "me", "gym", 1, "Gym session", "sessions", todayIso, "2026-06-12T09:05:00.000Z"),
      communityEntry("ce-gym-me-steps", "gym-crew", "me", "steps", 8500, "Steps", "steps", todayIso, "2026-06-12T09:10:00.000Z"),
      communityEntry("ce-gym-me-lifting", "gym-crew", "me", "lifting", 45, "Lifting", "minutes", todayIso, "2026-06-12T09:15:00.000Z"),
      communityEntry("ce-gym-maya-gym", "gym-crew", "maya", "gym", 1, "Gym session", "sessions", todayIso, "2026-06-12T08:20:00.000Z"),
      communityEntry("ce-gym-maya-steps", "gym-crew", "maya", "steps", 11000, "Steps", "steps", todayIso, "2026-06-12T08:25:00.000Z"),
      communityEntry("ce-gym-maya-lifting", "gym-crew", "maya", "lifting", 60, "Lifting", "minutes", todayIso, "2026-06-12T08:30:00.000Z"),
      communityEntry("ce-gym-jules-gym", "gym-crew", "jules", "gym", 1, "Gym session", "sessions", todayIso, "2026-06-12T10:00:00.000Z"),
      communityEntry("ce-gym-jules-steps", "gym-crew", "jules", "steps", 7200, "Steps", "steps", todayIso, "2026-06-12T10:05:00.000Z"),
      communityEntry("ce-gym-tariq-steps", "gym-crew", "tariq", "steps", 9900, "Steps", "steps", todayIso, "2026-06-12T07:45:00.000Z"),
      communityEntry("ce-gym-tariq-lifting", "gym-crew", "tariq", "lifting", 35, "Lifting", "minutes", todayIso, "2026-06-12T07:50:00.000Z"),
      communityEntry("ce-study-me-focus", "study-room", "me", "focus", 2, "Focused study block", "blocks", todayIso, "2026-06-12T14:00:00.000Z"),
      communityEntry("ce-study-me-practice", "study-room", "me", "practice", 30, "Practice problems", "problems", todayIso, "2026-06-12T14:10:00.000Z"),
      communityEntry("ce-study-noah-focus", "study-room", "noah", "focus", 4, "Focused study block", "blocks", todayIso, "2026-06-12T12:45:00.000Z"),
      communityEntry("ce-study-noah-practice", "study-room", "noah", "practice", 45, "Practice problems", "problems", todayIso, "2026-06-12T12:50:00.000Z"),
      communityEntry("ce-study-iris-focus", "study-room", "iris", "focus", 3, "Focused study block", "blocks", todayIso, "2026-06-12T13:20:00.000Z"),
      communityEntry("ce-study-iris-review", "study-room", "iris", "review", 1, "Review session", "done", todayIso, "2026-06-12T13:25:00.000Z")
    ],
    communityDraftInputs: {},
    systems: [
      {
        id: "life-core",
        ownerId: "me",
        ownerName: "Avery Rivera",
        title: "Lifestyle baseline",
        category: "General wellness",
        visibility: "public",
        description: "A daily score that balances movement, study, sleep, and budget discipline.",
        rules: [
          rule("steps", "Steps", "Fitness", "per", 5000, "steps", 1),
          rule("lifting", "Lifting", "Lifting", "per", 30, "minutes", 0.5),
          rule("study", "Study session", "Academics", "count", 1, "sessions", 1),
          rule("sleep", "Sleep below seven hours", "Sleep", "below", 7, "hours", -0.5),
          rule("budget", "Spending over budget", "Finance", "over", 0, "dollars", -1)
        ]
      },
      {
        id: "academic-sprint",
        ownerId: "me",
        ownerName: "Avery Rivera",
        title: "Academic sprint",
        category: "Academics",
        visibility: "private",
        description: "Rewards focused study blocks, assignments, and early planning.",
        rules: [
          rule("deep-work", "Deep work block", "Productivity", "count", 1, "blocks", 1.5),
          rule("reading", "Reading", "Academics", "per", 25, "pages", 1),
          rule("assignment", "Assignment submitted", "Academics", "once", 1, "done", 3),
          rule("late-start", "Started after planned time", "Personal habits", "over", 0, "minutes", -0.75)
        ]
      },
      {
        id: "run-build",
        ownerId: "me",
        ownerName: "Avery Rivera",
        title: "Run build",
        category: "Running",
        visibility: "private",
        description: "Mileage, mobility, and recovery for a steady running block.",
        rules: [
          rule("miles", "Miles run", "Running", "per", 1, "miles", 1),
          rule("zone-two", "Zone 2 time", "Running", "per", 20, "minutes", 0.75),
          rule("mobility", "Mobility session", "General wellness", "once", 1, "done", 1),
          rule("sleep-debt", "Sleep below target", "Sleep", "below", 8, "hours", -0.5)
        ]
      }
    ],
    publicSystems: [
      {
        id: "public-maya-strength",
        ownerId: "maya",
        ownerName: "Maya Chen",
        ownerHandle: "@mayalifts",
        title: "Strength consistency",
        category: "Fitness",
        visibility: "public",
        description: "Simple weights, steps, and recovery scoring for getting to the gym.",
        rules: [
          rule("gym", "Gym session", "Fitness", "count", 1, "sessions", 2),
          rule("steps", "Steps", "Fitness", "per", 5000, "steps", 1),
          rule("lifting", "Lifting", "Lifting", "per", 30, "minutes", 0.5),
          rule("missed", "Missed planned workout", "Fitness", "count", 1, "misses", -1)
        ]
      },
      {
        id: "public-noah-focus",
        ownerId: "noah",
        ownerName: "Noah Patel",
        ownerHandle: "@noahfocus",
        title: "Exam week focus",
        category: "Academics",
        visibility: "public",
        description: "A sprint template for study sessions, practice sets, and sleep protection.",
        rules: [
          rule("sessions", "Study session", "Academics", "count", 1, "sessions", 1),
          rule("practice", "Practice problems", "Academics", "per", 15, "problems", 1),
          rule("phone", "Phone over limit", "Productivity", "over", 45, "minutes", -1),
          rule("sleep", "Sleep below target", "Sleep", "below", 7, "hours", -0.5)
        ]
      },
      {
        id: "public-sam-money",
        ownerId: "sam",
        ownerName: "Sam Okafor",
        ownerHandle: "@samplans",
        title: "Budget guardrails",
        category: "Finance",
        visibility: "public",
        description: "Daily finance habits with small rewards for checking, saving, and staying under budget.",
        rules: [
          rule("check", "Budget check-in", "Finance", "once", 1, "done", 1),
          rule("save", "Dollars saved", "Finance", "per", 25, "dollars", 1),
          rule("over", "Spending over daily budget", "Finance", "over", 0, "dollars", -1.5),
          rule("impulse", "Impulse purchases", "Personal habits", "count", 1, "purchases", -0.75)
        ]
      },
      {
        id: "public-eli-wellness",
        ownerId: "eli",
        ownerName: "Eli Morgan",
        ownerHandle: "@eliwell",
        title: "Wellness floor",
        category: "General wellness",
        visibility: "public",
        description: "A gentle score for sleep, hydration, movement, and checking in.",
        rules: [
          rule("water", "Water", "General wellness", "per", 24, "ounces", 0.5),
          rule("walk", "Walk", "Fitness", "per", 15, "minutes", 0.5),
          rule("journal", "Journal entry", "Personal habits", "once", 1, "done", 1),
          rule("sleep", "Sleep below target", "Sleep", "below", 7.5, "hours", -0.5)
        ]
      }
    ],
    entries: [
      {
        id: "entry-1",
        date: offsetDate(-1),
        systemId: "life-core",
        values: { steps: 9800, lifting: 45, study: 2, sleep: 6.5, budget: 0 },
        total: 4.75
      },
      {
        id: "entry-2",
        date: offsetDate(-2),
        systemId: "life-core",
        values: { steps: 6500, lifting: 0, study: 1, sleep: 8, budget: 20 },
        total: 1
      },
      {
        id: "entry-3",
        date: offsetDate(-3),
        systemId: "academic-sprint",
        values: { "deep-work": 3, reading: 62, assignment: 1, "late-start": 0 },
        total: 7
      }
    ],
    communities: [
      {
        id: "gym-crew",
        name: "Friday Gym Crew",
        category: "Fitness",
        description: "Friends keeping each other honest on planned workouts.",
        inviteCode: "GYM-742",
        system: {
          id: "gym-crew-system",
          title: "Gym consistency",
          category: "Fitness",
          rules: [
            rule("gym", "Gym session", "Fitness", "count", 1, "sessions", 2),
            rule("steps", "Steps", "Fitness", "per", 5000, "steps", 1),
            rule("missed", "Missed planned workout", "Fitness", "count", 1, "misses", -1),
            rule("lifting", "Lifting", "Lifting", "per", 30, "minutes", 0.5)
          ]
        },
        members: [
          member("me", "Avery Rivera", "@avery", "#355d91"),
          member("maya", "Maya Chen", "@mayalifts", "#266b5e"),
          member("jules", "Jules Hart", "@jules", "#bb6a2f"),
          member("tariq", "Tariq Lane", "@tariq", "#7a4b86")
        ],
        logs: [
          log("me", todayIso, 4, 31),
          log("maya", todayIso, 6, 42),
          log("jules", todayIso, 3, 28),
          log("tariq", todayIso, 5, 35),
          log("me", offsetDate(-1), 5, 27),
          log("maya", offsetDate(-1), 4, 36),
          log("jules", offsetDate(-1), 4, 25),
          log("tariq", offsetDate(-1), 3, 30)
        ]
      },
      {
        id: "study-room",
        name: "Library Sprint",
        category: "Academics",
        description: "Shared points for focused study and finished practice sets.",
        inviteCode: "LIB-119",
        system: {
          id: "study-room-system",
          title: "Study accountability",
          category: "Academics",
          rules: [
            rule("focus", "Focused study block", "Academics", "count", 1, "blocks", 1),
            rule("practice", "Practice problems", "Academics", "per", 20, "problems", 1),
            rule("review", "Review session", "Academics", "once", 1, "done", 1.5),
            rule("phone", "Phone over limit", "Productivity", "over", 30, "minutes", -1)
          ]
        },
        members: [
          member("me", "Avery Rivera", "@avery", "#355d91"),
          member("noah", "Noah Patel", "@noahfocus", "#266b5e"),
          member("iris", "Iris West", "@iris", "#bb6a2f")
        ],
        logs: [
          log("me", todayIso, 3.5, 23),
          log("noah", todayIso, 6, 39),
          log("iris", todayIso, 4, 31),
          log("me", offsetDate(-1), 5, 19.5),
          log("noah", offsetDate(-1), 4, 33),
          log("iris", offsetDate(-1), 4.5, 27)
        ]
      }
    ],
    publicCommunities: [
      {
        id: "public-morning-lifts",
        name: "Morning Lifts",
        category: "Fitness",
        goalType: "Gym",
        keywords: ["gym", "fitness", "lifting", "steps", "strength"],
        visibility: "public",
        memberCount: 12,
        description: "Daily lifting and steps accountability.",
        inviteCode: "LFT-284",
        system: {
          id: "morning-lifts-system",
          title: "Morning lifting accountability",
          category: "Fitness",
          rules: [
            rule("lift", "Lift workout", "Fitness", "count", 1, "workouts", 2),
            rule("steps", "Steps", "Fitness", "per", 5000, "steps", 1),
            rule("protein", "Protein target", "Nutrition", "once", 1, "done", 1),
            rule("missed", "Missed planned workout", "Fitness", "count", 1, "misses", -1)
          ]
        },
        members: [
          member("maya-public", "Maya Chen", "@mayalifts", "#266b5e"),
          member("leo-public", "Leo Park", "@leopark", "#bb6a2f"),
          member("riley-public", "Riley Stone", "@riley", "#7a4b86")
        ]
      },
      {
        id: "public-study-hall",
        name: "Study Hall Push",
        category: "Academics",
        goalType: "Study",
        keywords: ["study", "school", "academics", "productivity", "exams"],
        visibility: "private",
        memberCount: 8,
        description: "Focused study blocks, practice problems, and phone limits.",
        inviteCode: "STU-638",
        system: {
          id: "study-hall-system",
          title: "Study hall focus",
          category: "Academics",
          rules: [
            rule("focus", "Focused study block", "Academics", "count", 1, "blocks", 1),
            rule("practice", "Practice problems", "Academics", "per", 20, "problems", 1),
            rule("review", "Review session", "Academics", "once", 1, "done", 1.5),
            rule("phone", "Phone over limit", "Productivity", "over", 30, "minutes", -1)
          ]
        },
        members: [
          member("noah-public", "Noah Patel", "@noahfocus", "#266b5e"),
          member("iris-public", "Iris West", "@iris", "#bb6a2f"),
          member("cam-public", "Cam Brooks", "@camb", "#355d91")
        ]
      },
      {
        id: "public-runner-base",
        name: "Runner Base Camp",
        category: "Running",
        goalType: "Running",
        keywords: ["running", "fitness", "miles", "mobility", "cardio"],
        visibility: "public",
        memberCount: 15,
        description: "Mileage, mobility, and recovery for consistent base training.",
        inviteCode: "RUN-427",
        system: {
          id: "runner-base-system",
          title: "Runner base training",
          category: "Running",
          rules: [
            rule("miles", "Miles run", "Running", "per", 1, "miles", 1),
            rule("mobility", "Mobility session", "General wellness", "once", 1, "done", 1),
            rule("zone-two", "Zone 2 time", "Running", "per", 20, "minutes", 0.75),
            rule("sleep", "Sleep below target", "Sleep", "below", 7, "hours", -0.5)
          ]
        },
        members: [
          member("tariq-public", "Tariq Lane", "@tariq", "#7a4b86"),
          member("sam-public", "Sam Okafor", "@samruns", "#bb6a2f"),
          member("jules-public", "Jules Hart", "@jules", "#266b5e")
        ]
      },
      {
        id: "public-sleep-reset",
        name: "Nightly Sleep Reset",
        category: "Sleep",
        goalType: "Sleep",
        keywords: ["sleep", "wellness", "recovery", "habits", "routine"],
        visibility: "public",
        memberCount: 6,
        description: "A calm group for better bedtimes and morning energy.",
        inviteCode: "SLP-905",
        system: {
          id: "sleep-reset-system",
          title: "Sleep reset",
          category: "Sleep",
          rules: [
            rule("bedtime", "On-time bedtime", "Sleep", "once", 1, "done", 2),
            rule("hours", "Sleep below target", "Sleep", "below", 7.5, "hours", -1),
            rule("screens", "Late screen time", "Personal habits", "over", 0, "minutes", -0.75),
            rule("morning", "Morning check-in", "General wellness", "once", 1, "done", 1)
          ]
        },
        members: [
          member("eli-public", "Eli Morgan", "@eliwell", "#266b5e"),
          member("ana-public", "Ana Ruiz", "@anar", "#355d91"),
          member("drew-public", "Drew Kim", "@drew", "#bb6a2f")
        ]
      },
      {
        id: "public-budget-buddies",
        name: "Budget Buddies",
        category: "Finance",
        goalType: "Budgeting",
        keywords: ["budgeting", "budget", "finance", "saving", "productivity"],
        visibility: "private",
        memberCount: 10,
        description: "Daily budget checks, savings goals, and spending guardrails.",
        inviteCode: "BUD-316",
        system: {
          id: "budget-buddies-system",
          title: "Budget accountability",
          category: "Finance",
          rules: [
            rule("check", "Budget check-in", "Finance", "once", 1, "done", 1),
            rule("save", "Dollars saved", "Finance", "per", 25, "dollars", 1),
            rule("over", "Spending over daily budget", "Finance", "over", 0, "dollars", -1.5),
            rule("impulse", "Impulse purchases", "Personal habits", "count", 1, "purchases", -0.75)
          ]
        },
        members: [
          member("sam-budget", "Sam Okafor", "@samplans", "#bb6a2f"),
          member("priya-budget", "Priya Shah", "@priya", "#266b5e"),
          member("gabe-budget", "Gabe Lin", "@gabe", "#355d91")
        ]
      },
      {
        id: "public-productivity-loop",
        name: "Productivity Loop",
        category: "Productivity",
        goalType: "Productivity",
        keywords: ["productivity", "focus", "habits", "planning", "study"],
        visibility: "public",
        memberCount: 9,
        description: "Plan the day, finish focus blocks, and keep distractions low.",
        inviteCode: "PRD-552",
        system: {
          id: "productivity-loop-system",
          title: "Productivity loop",
          category: "Productivity",
          rules: [
            rule("plan", "Daily plan", "Productivity", "once", 1, "done", 1),
            rule("focus", "Focus block", "Productivity", "count", 1, "blocks", 1),
            rule("admin", "Admin sweep", "Productivity", "once", 1, "done", 0.75),
            rule("scroll", "Scrolling over limit", "Personal habits", "over", 30, "minutes", -1)
          ]
        },
        members: [
          member("noah-loop", "Noah Patel", "@noahfocus", "#266b5e"),
          member("lina-loop", "Lina Torres", "@lina", "#7a4b86"),
          member("riley-loop", "Riley Stone", "@riley", "#bb6a2f")
        ]
      }
    ]
  };

  let state = loadState();
  let addEntryDraft = { ruleId: "", amount: 0 };
  let topCardDraftBlocks = null;
  let weeklyChartDraftBlocks = null;
  const els = {};
  let toastTimer = null;
  let dayRolloverTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    resetSavedBuildSubpage();
    cacheElements();
    bindEvents();
    render();
    startDateRolloverWatcher();
  }

  function cacheElements() {
    const ids = [
      "profileAvatar",
      "profileNameLabel",
      "profileHandleLabel",
      "profileVisibilityLabel",
      "todayLabel",
      "resetDemoButton",
      "dashboardView",
      "addEntryView",
      "customizeTopCardView",
      "customizeChartsView",
      "systemsView",
      "discoverView",
      "communitiesView",
      "communityDetailView",
      "communitySettingsView",
      "communityMemberActivityView",
      "findCommunitiesView",
      "profileView",
      "scoreContextSelect",
      "trackerSystemSelect",
      "addEntrySystemSelect",
      "customizeTopCardSystemSelect",
      "customizeChartsSystemSelect",
      "openAddEntryButton",
      "backToDashboardButton",
      "cancelTopCardButton",
      "saveTopCardButton",
      "cancelChartsButton",
      "saveChartsButton",
      "saveEntryButton",
      "scoreLabel",
      "liveScore",
      "activeSystemName",
      "dailyTargetLabel",
      "dailyProgressLabel",
      "dailyTargetFill",
      "dailyStatusLabel",
      "syncSampleButton",
      "customizeTopCardButton",
      "customizeChartsButton",
      "topCardBlockCount",
      "topCardBlockList",
      "availableTopCardBlocks",
      "weeklyChartCount",
      "weeklyChartList",
      "chartBlockCount",
      "chartBlockList",
      "availableChartMetricSelect",
      "addChartBlockButton",
      "ruleProgressList",
      "categoryProgressList",
      "ruleCountLabel",
      "dailyInputList",
      "scoreBreakdown",
      "breakdownTitle",
      "todaySavedLabel",
      "newSystemButton",
      "buildStartPanel",
      "buildSearchPanel",
      "buildPublicSearchInput",
      "buildPublicSearchResults",
      "buildAiPanel",
      "buildAiForm",
      "aiGoalsInput",
      "aiRewardHabitsInput",
      "aiPenaltyHabitsInput",
      "aiCategoriesInput",
      "aiStrictnessInput",
      "aiTargetsInput",
      "aiDraftReview",
      "systemList",
      "systemEditorPanel",
      "duplicateSystemButton",
      "deleteSystemButton",
      "systemForm",
      "systemTitleInput",
      "systemCategoryInput",
      "systemDescriptionInput",
      "systemVisibilityInput",
      "setupStepKicker",
      "setupStepTitle",
      "setupStepIntro",
      "systemSetupStepper",
      "setupBackButton",
      "setupSkipButton",
      "setupNextButton",
      "setupCompleteButton",
      "setupReview",
      "selectedRuleCount",
      "ruleList",
      "ruleForm",
      "ruleFormTitle",
      "cancelRuleEditButton",
      "addNewRuleButton",
      "ruleLabelInput",
      "ruleUnitInput",
      "ruleDailyTargetSlider",
      "ruleDailyTargetInput",
      "ruleSimpleStyleInput",
      "goalPointsFields",
      "ruleGoalPointsSlider",
      "ruleGoalPointsInput",
      "everyPointsFields",
      "ruleEveryAmountSlider",
      "ruleEveryAmountInput",
      "ruleEveryPointsSlider",
      "ruleEveryPointsInput",
      "yesNoPointsFields",
      "ruleYesNoPointsSlider",
      "ruleYesNoPointsInput",
      "penaltyToggleWrap",
      "rulePenaltyEnabledInput",
      "penaltyFields",
      "ruleMinimumSlider",
      "ruleMinimumInput",
      "rulePenaltyPointsSlider",
      "rulePenaltyPointsInput",
      "rulePenaltyModeInput",
      "addThresholdButton",
      "extraThresholdList",
      "ruleInputMethodInput",
      "ruleDataSourceInput",
      "ruleSourceMetricInput",
      "ruleManualOverrideInput",
      "ruleDataSourceHelp",
      "rulePreviewText",
      "ruleCategoryInput",
      "ruleMaxDailyPointsInput",
      "ruleInputMaxInput",
      "ruleInputStepInput",
      "ruleSubmitLabel",
      "calculatedTotalList",
      "calculatedTotalForm",
      "calcTotalNameInput",
      "calcTotalUnitInput",
      "calcTotalGoalInput",
      "calcTotalPointsInput",
      "calcTotalFormulaInput",
      "calcTotalTrackingOnlyInput",
      "calcTotalInputList",
      "discoverFilter",
      "discoverGrid",
      "newCommunityButton",
      "findCommunitiesButton",
      "communityList",
      "communityDetailTitle",
      "communityMeta",
      "communityDescription",
      "communityStatus",
      "backToCommunitiesButton",
      "inviteButton",
      "communitySettingsButton",
      "inviteOptions",
      "copyInviteLinkButton",
      "copyInviteCodeButton",
      "sendInviteTextButton",
      "sendInviteEmailButton",
      "communityLeader",
      "backFromCommunitySettingsButton",
      "communitySettingsTitle",
      "communitySettingsMode",
      "communityNameInput",
      "communityDescriptionInput",
      "communityVisibilityInput",
      "saveCommunitySettingsButton",
      "addCommunityRuleButton",
      "communityRulesHint",
      "copyCommunitySystemButton",
      "communityRules",
      "leaderboardList",
      "backFromMemberActivityButton",
      "memberActivityTitle",
      "memberActivityTotal",
      "memberActivityPanel",
      "communityCheckinSection",
      "communityLiveScore",
      "communityInputList",
      "saveCommunityEntryButton",
      "backFromFindCommunitiesButton",
      "findCommunitySearchInput",
      "findCommunityResults",
      "saveProfileButton",
      "profileNameInput",
      "profileHandleInput",
      "profilePrivacyInput",
      "dailyTargetInput",
      "largeAvatar",
      "publicPreviewStatus",
      "publicPreview",
      "integrationList",
      "toast"
    ];
    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
    els.tabs = Array.from(document.querySelectorAll("[data-view]"));
    els.views = {
      dashboard: els.dashboardView,
      "add-entry": els.addEntryView,
      "customize-top-card": els.customizeTopCardView,
      "customize-charts": els.customizeChartsView,
      systems: els.systemsView,
      communities: els.communitiesView,
      "community-detail": els.communityDetailView,
      "community-settings": els.communitySettingsView,
      "community-member-activity": els.communityMemberActivityView,
      "find-communities": els.findCommunitiesView,
      profile: els.profileView
    };
  }

  function bindEvents() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.activeView = tab.dataset.view;
        if (state.activeView === "systems") {
          state.systemEditorOpen = false;
          state.editingRuleId = "";
          resetBuildHome();
        }
        saveState();
        render();
        if (state.activeView === "systems" && !state.systemEditorOpen) {
          scrollSystemsListToTop();
        }
      });
    });

    els.openAddEntryButton.addEventListener("click", openAddEntryPage);
    els.backToDashboardButton.addEventListener("click", returnToDashboard);
    els.customizeTopCardButton.addEventListener("click", openCustomizeTopCardPage);
    els.cancelTopCardButton.addEventListener("click", cancelTopCardCustomization);
    els.saveTopCardButton.addEventListener("click", saveTopCardCustomization);
    els.customizeChartsButton.addEventListener("click", openCustomizeChartsPage);
    els.cancelChartsButton.addEventListener("click", cancelChartCustomization);
    els.saveChartsButton.addEventListener("click", saveChartCustomization);
    els.addChartBlockButton.addEventListener("click", addWeeklyChartDraftBlock);

    els.scoreContextSelect.addEventListener("change", (event) => {
      state.scoreContext = event.target.value || "personal";
      if (isCommunityScoreContext(state.scoreContext)) state.selectedCommunityId = getScoreCommunityId(state.scoreContext);
      addEntryDraft = { ruleId: "", amount: 0 };
      saveState();
      renderDashboard();
    });
    els.trackerSystemSelect.addEventListener("change", (event) => {
      state.trackerSystemId = event.target.value;
      state.scoreContext = "personal";
      state.draftInputs = {};
      addEntryDraft = { ruleId: "", amount: 0 };
      topCardDraftBlocks = null;
      weeklyChartDraftBlocks = null;
      saveState();
      renderDashboard();
    });
    els.addEntrySystemSelect.addEventListener("change", (event) => {
      if (event.target.value.startsWith("community:")) {
        state.scoreContext = event.target.value;
        state.selectedCommunityId = getScoreCommunityId(state.scoreContext);
      } else {
        state.scoreContext = "personal";
        state.trackerSystemId = event.target.value;
      }
      state.draftInputs = {};
      addEntryDraft = { ruleId: "", amount: 0 };
      topCardDraftBlocks = null;
      weeklyChartDraftBlocks = null;
      saveState();
      render();
    });
    els.customizeTopCardSystemSelect.addEventListener("change", (event) => {
      state.trackerSystemId = event.target.value;
      state.draftInputs = {};
      topCardDraftBlocks = null;
      saveState();
      render();
    });
    els.customizeChartsSystemSelect.addEventListener("change", (event) => {
      state.trackerSystemId = event.target.value;
      state.draftInputs = {};
      weeklyChartDraftBlocks = null;
      saveState();
      render();
    });

    els.syncSampleButton.addEventListener("click", () => {
      const system = getTrackerSystem();
      if (!system) return;
      replaceTodayEntriesWithSample(system);
      syncDraftInputsFromEntries(system);
      autoSaveToday(system);
      saveState();
      renderDashboard();
      showToast("Sample data synced");
    });

    els.saveEntryButton.addEventListener("click", saveDailyEntry);

    els.newSystemButton?.addEventListener("click", openBuildOptions);
    Array.from(document.querySelectorAll("[data-build-mode]")).forEach((button) => {
      button.addEventListener("click", () => setBuildMode(button.dataset.buildMode));
    });
    els.buildPublicSearchInput.addEventListener("input", (event) => {
      state.buildSearchQuery = event.target.value;
      renderBuildSearchResults();
    });
    els.buildAiForm.addEventListener("submit", generateAiDraftSystem);
    els.duplicateSystemButton.addEventListener("click", duplicateSelectedSystem);
    els.deleteSystemButton.addEventListener("click", deleteSelectedSystem);
    els.setupBackButton.addEventListener("click", () => moveSetupStep(-1));
    els.setupNextButton.addEventListener("click", () => moveSetupStep(1));
    els.setupSkipButton.addEventListener("click", () => moveSetupStep(1, { skip: true }));
    els.setupCompleteButton.addEventListener("click", completeSystemSetup);
    els.addNewRuleButton.addEventListener("click", () => {
      state.editingRuleId = "";
      resetRuleForm();
      saveState();
      renderSystems();
      els.ruleLabelInput.focus();
    });

    [
      els.systemTitleInput,
      els.systemCategoryInput,
      els.systemDescriptionInput,
      els.systemVisibilityInput
    ].forEach((input) => {
      input.addEventListener("input", updateSelectedSystemFromForm);
      input.addEventListener("change", updateSelectedSystemFromForm);
    });

    els.ruleForm.addEventListener("submit", saveRuleFromForm);
    els.calculatedTotalForm.addEventListener("submit", addCalculatedTotal);
    els.calcTotalFormulaInput.addEventListener("change", () => {
      const system = getSelectedSystem();
      if (system) renderCalculatedTotalSetup(system);
    });
    els.cancelRuleEditButton.addEventListener("click", () => {
      state.editingRuleId = "";
      resetRuleForm();
      saveState();
      renderSystems();
    });
    bindRuleBuilderEvents();

    els.discoverFilter?.addEventListener("change", renderDiscover);

    els.newCommunityButton.addEventListener("click", createCommunity);
    els.findCommunitiesButton.addEventListener("click", openFindCommunities);
    els.backToCommunitiesButton.addEventListener("click", returnToCommunities);
    els.communitySettingsButton.addEventListener("click", openCommunitySettings);
    els.backFromCommunitySettingsButton.addEventListener("click", returnToCommunityDetail);
    els.backFromMemberActivityButton.addEventListener("click", returnToCommunityDetail);
    els.backFromFindCommunitiesButton.addEventListener("click", returnToCommunities);
    els.findCommunitySearchInput.addEventListener("input", (event) => {
      state.communitySearchQuery = event.target.value;
      renderFindCommunities();
    });
    els.inviteButton.addEventListener("click", toggleInviteOptions);
    els.copyInviteLinkButton.addEventListener("click", copyInviteLink);
    els.copyInviteCodeButton.addEventListener("click", copyInviteCode);
    els.sendInviteTextButton.addEventListener("click", sendInviteText);
    els.sendInviteEmailButton.addEventListener("click", sendInviteEmail);
    els.saveCommunitySettingsButton.addEventListener("click", saveCommunitySettings);
    els.addCommunityRuleButton.addEventListener("click", addCommunityRule);
    els.copyCommunitySystemButton.addEventListener("click", copyCommunitySystem);
    els.saveCommunityEntryButton.addEventListener("click", saveCommunityEntry);

    els.saveProfileButton.addEventListener("click", saveProfile);
    els.resetDemoButton.addEventListener("click", () => {
      localStorage.removeItem(storageKey);
      state = structuredClone(seedState);
      saveState();
      render();
      showToast("Demo data reset");
    });
  }

  function render() {
    renderChrome();
    renderActiveView();
    renderDashboard();
    renderSystems();
    renderDiscover();
    renderCommunities();
    renderCommunitySettings();
    renderCommunityMemberActivity();
    renderFindCommunities();
    renderProfile();
  }

  function renderChrome() {
    if (!els.views[state.activeView]) state.activeView = "dashboard";
    els.tabs.forEach((tab) => {
      const isActive = tab.dataset.view === state.activeView
        || ((state.activeView === "add-entry" || state.activeView === "customize-top-card" || state.activeView === "customize-charts") && tab.dataset.view === "dashboard")
        || ((state.activeView === "community-detail" || state.activeView === "community-settings" || state.activeView === "community-member-activity" || state.activeView === "find-communities") && tab.dataset.view === "communities");
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-current", isActive ? "page" : "false");
    });
    Object.entries(els.views).forEach(([name, view]) => {
      view.classList.toggle("is-visible", name === state.activeView);
    });

    const initials = getInitials(state.profile.name);
    els.profileAvatar.textContent = initials;
    els.largeAvatar.textContent = initials;
    els.profileNameLabel.textContent = state.profile.name;
    els.profileHandleLabel.textContent = cleanHandle(state.profile.handle);
    els.profileVisibilityLabel.textContent = capitalize(state.profile.privacy);
    els.profileVisibilityLabel.className = `status-pill ${state.profile.privacy}`;
    els.todayLabel.textContent = formatDate(todayIso);
  }

  function renderActiveView() {
    Object.entries(els.views).forEach(([viewName, view]) => {
      view.setAttribute("aria-hidden", viewName === state.activeView ? "false" : "true");
    });
  }

  function scrollSystemsListToTop() {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function resetSavedBuildSubpage() {
    if (state.activeView !== "systems" || state.systemEditorOpen) return;
    if (state.buildMode !== "search" && state.buildMode !== "ai") return;
    resetBuildHome();
    saveState();
  }

  function resetBuildHome() {
    state.buildMode = "home";
    state.buildViewedProfileId = "";
    state.buildViewedPublicId = "";
  }

  function openFindCommunities() {
    state.activeView = "find-communities";
    saveState();
    render();
    requestAnimationFrame(() => {
      els.findCommunitySearchInput.focus();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function returnToCommunities() {
    state.activeView = "communities";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function returnToCommunityDetail() {
    state.activeView = "community-detail";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openCommunitySettings() {
    if (!getSelectedCommunity()) return;
    state.activeView = "community-settings";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openCommunityMemberActivity(memberId) {
    if (!getSelectedCommunity()) return;
    state.selectedCommunityMemberId = memberId || "me";
    state.activeView = "community-member-activity";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openAddEntryPage() {
    const system = getActiveScoreContext().system;
    if (!system) {
      showToast("Create a reward system first");
      return;
    }
    if (!system.rules.length) {
      showToast("Add a scoring rule first");
      return;
    }
    state.activeView = "add-entry";
    saveState();
    render();
    requestAnimationFrame(() => {
      els.dailyInputList.querySelector("[data-add-entry-rule]")?.focus();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function returnToDashboard() {
    state.activeView = "dashboard";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openCustomizeTopCardPage() {
    const system = getTrackerSystem();
    if (!system) {
      showToast("Create a reward system first");
      return;
    }
    topCardDraftBlocks = [...getTopCardPreferences(system)];
    state.activeView = "customize-top-card";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function cancelTopCardCustomization() {
    topCardDraftBlocks = null;
    returnToDashboard();
  }

  function saveTopCardCustomization() {
    const system = getTrackerSystem();
    if (!system) return;
    state.topCardPreferences = state.topCardPreferences || {};
    state.topCardPreferences[system.id] = sanitizeTopCardBlocks(system, topCardDraftBlocks || []);
    topCardDraftBlocks = null;
    state.activeView = "dashboard";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    showToast("Top card updated");
  }

  function openCustomizeChartsPage() {
    const system = getTrackerSystem();
    if (!system) {
      showToast("Create a reward system first");
      return;
    }
    weeklyChartDraftBlocks = cloneChartBlocks(getWeeklyChartPreferences(system));
    state.activeView = "customize-charts";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function cancelChartCustomization() {
    weeklyChartDraftBlocks = null;
    returnToDashboard();
  }

  function saveChartCustomization() {
    const system = getTrackerSystem();
    if (!system) return;
    state.weeklyChartPreferences = state.weeklyChartPreferences || {};
    state.weeklyChartPreferences[system.id] = sanitizeWeeklyChartBlocks(system, weeklyChartDraftBlocks || []);
    weeklyChartDraftBlocks = null;
    state.activeView = "dashboard";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    showToast("Charts updated");
  }

  function renderScoreContextOptions() {
    const communityOptions = state.communities.map((community) => `
      <option value="community:${escapeHtml(community.id)}">${escapeHtml(community.name)}</option>
    `).join("");
    return `
      <option value="personal">Personal Reward Systems</option>
      ${communityOptions}
    `;
  }

  function renderAddEntryContextOptions(systemOptions) {
    const communityOptions = state.communities.map((community) => `
      <option value="community:${escapeHtml(community.id)}">${escapeHtml(community.name)}</option>
    `).join("");
    return `
      <optgroup label="Personal Reward Systems">${systemOptions}</optgroup>
      ${communityOptions ? `<optgroup label="Communities">${communityOptions}</optgroup>` : ""}
    `;
  }

  function normalizeScoreContextValue(value) {
    return normalizeScoreContextForState(state, value);
  }

  function normalizeScoreContextForState(sourceState, value) {
    if (String(value || "").startsWith("community:")) {
      const communityId = String(value).replace(/^community:/, "");
      if ((sourceState.communities || []).some((community) => community.id === communityId)) return value;
    }
    return "personal";
  }

  function isCommunityScoreContext(value = state.scoreContext) {
    return String(value || "").startsWith("community:");
  }

  function getScoreCommunityId(value = state.scoreContext) {
    return isCommunityScoreContext(value) ? String(value).replace(/^community:/, "") : "";
  }

  function getActiveScoreContext() {
    const communityId = getScoreCommunityId();
    const community = state.communities.find((item) => item.id === communityId);
    if (community) {
      community.system = normalizeSystem(community.system || { rules: [] });
      return {
        type: "community",
        community,
        system: community.system,
        label: community.name
      };
    }
    const system = getTrackerSystem();
    return {
      type: "personal",
      community: null,
      system,
      label: system?.title || "Personal Reward Systems"
    };
  }

  function valuesForScoreContext(context) {
    if (context.type === "community") {
      return communityValuesForMember(context.community.id, "me", todayIso);
    }
    return state.draftInputs || {};
  }

  function getCommunityEntriesForMemberToday(communityId, userId) {
    return getCommunityEntriesForMemberOnDate(communityId, userId, todayIso);
  }

  function getCommunityEntriesForMemberOnDate(communityId, userId, date) {
    return (state.communityEntries || []).filter((entry) => {
      return entry.communityId === communityId
        && entry.userId === userId
        && entryDateKey(entry) === date;
    }).sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  }

  function communityValuesForMember(communityId, userId, date = todayIso) {
    const values = {};
    const community = state.communities.find((item) => item.id === communityId);
    (community?.system?.rules || []).forEach((item) => {
      const rule = scoring.normalizeRule(item);
      values[rule.id] = syncedValueForRule(rule, { userId, date, scope: "community" }) ?? 0;
    });
    getCommunityEntriesForMemberOnDate(communityId, userId, date).forEach((entry) => {
      values[entry.ruleId] = numberOrDefault(values[entry.ruleId], 0) + numberOrDefault(entry.amount, 0);
    });
    return values;
  }

  function communityTotalForMember(community, userId, date = todayIso) {
    if (!community) return 0;
    community.system = normalizeSystem(community.system || { rules: [] });
    const values = collectDraftValues(community.system, communityValuesForMember(community.id, userId, date));
    return scoring.calculateSystem(community.system, values).total;
  }

  function communityTotalAcrossDates(community, userId) {
    const dates = new Set((state.communityEntries || [])
      .filter((entry) => entry.communityId === community.id && entry.userId === userId)
      .map(entryDateKey));
    return Array.from(dates).reduce((sum, date) => sum + communityTotalForMember(community, userId, date), 0);
  }

  function communitySummaryForMember(communityId, userId, date = todayIso) {
    const community = state.communities.find((item) => item.id === communityId);
    if (!community) return null;
    const total = communityTotalForMember(community, userId, date);
    return { date, total, values: communityValuesForMember(communityId, userId, date) };
  }

  function addCommunityEntry(communityId, userId, rule, amount, source = "manual") {
    const dateKey = getTodayKey();
    state.communityEntries = state.communityEntries || [];
    state.communityEntries.push({
      id: makeId("community-entry"),
      communityId,
      userId,
      ruleId: rule.id,
      amount,
      label: rule.label,
      unit: rule.unit,
      date: dateKey,
      dateKey,
      timestamp: new Date().toISOString(),
      source
    });
  }

  function deleteCommunityEntry(entryId) {
    const entry = (state.communityEntries || []).find((item) => item.id === entryId);
    if (!entry) return;
    state.communityEntries = (state.communityEntries || []).filter((item) => item.id !== entryId);
    const community = state.communities.find((item) => item.id === entry.communityId);
    if (community) saveCommunitySummaryForMember(community, entry.userId);
    saveState();
    render();
    showToast("Community entry removed");
  }

  function saveCommunitySummaryForMember(community, userId) {
    if (!community) return;
    community.logs = Array.isArray(community.logs) ? community.logs : [];
    const total = communityTotalForMember(community, userId, todayIso);
    const priorTotal = community.logs
      .filter((entry) => entry.memberId === userId && entry.date !== todayIso)
      .reduce((sum, entry) => sum + numberOrDefault(entry.today, 0), 0);
    const existing = community.logs.find((entry) => entry.memberId === userId && entry.date === todayIso);
    if (existing) {
      existing.today = total;
      existing.total = priorTotal + total;
    } else {
      community.logs.push(log(userId, todayIso, total, priorTotal + total));
    }
  }

  function renderCommunityWeeklyProgress(community) {
    const days = currentWeekDateKeys();
    const values = days.map((date) => communityTotalForMember(community, "me", date));
    const max = Math.max(...values.map((value) => Math.abs(value)), 1);
    els.weeklyChartCount.textContent = "1 chart";
    els.weeklyChartList.innerHTML = `
      <article class="weekly-chart-card">
        <div class="weekly-chart-card-heading">
          <div>
            <h4>My Community Daily Total</h4>
            <span>${escapeHtml(community.name)}</span>
          </div>
          <strong>${escapeHtml(formatMetricValue(values.reduce((sum, value) => sum + value, 0), { type: "points" }))}</strong>
        </div>
        <div class="weekly-chart" aria-label="My Community Daily Total by day">
          ${days.map((date, index) => renderWeeklyChartBar(date, values[index], max, { type: "points", label: "My Community Daily Total", unit: "points" })).join("")}
        </div>
      </article>
    `;
  }

  function renderDashboard() {
    refreshToday();
    if (!state.trackerSystemId || !state.systems.some((system) => system.id === state.trackerSystemId)) {
      state.trackerSystemId = state.systems[0]?.id || "";
    }
    state.scoreContext = normalizeScoreContextValue(state.scoreContext);

    const systemOptions = state.systems
      .map((system) => `<option value="${escapeHtml(system.id)}">${escapeHtml(system.title)}</option>`)
      .join("");
    els.scoreContextSelect.innerHTML = renderScoreContextOptions();
    els.scoreContextSelect.value = state.scoreContext;
    els.trackerSystemSelect.innerHTML = systemOptions;
    els.addEntrySystemSelect.innerHTML = renderAddEntryContextOptions(systemOptions);
    els.customizeTopCardSystemSelect.innerHTML = systemOptions;
    els.customizeChartsSystemSelect.innerHTML = systemOptions;
    els.trackerSystemSelect.value = state.trackerSystemId;
    els.addEntrySystemSelect.value = isCommunityScoreContext() ? state.scoreContext : state.trackerSystemId;
    els.customizeTopCardSystemSelect.value = state.trackerSystemId;
    els.customizeChartsSystemSelect.value = state.trackerSystemId;
    els.trackerSystemSelect.hidden = isCommunityScoreContext();
    els.syncSampleButton.hidden = isCommunityScoreContext();

    const context = getActiveScoreContext();
    const system = context.system;
    if (!system) {
      els.dailyInputList.innerHTML = emptyState("Create a reward system to start scoring days.");
      els.ruleProgressList.innerHTML = emptyState("Create a reward system to see today's breakdown.");
      els.categoryProgressList.innerHTML = `<div class="category-mini-empty">Create a reward system to see rule progress.</div>`;
      els.scoreBreakdown.innerHTML = "";
      els.weeklyChartCount.textContent = "0 charts";
      els.weeklyChartList.innerHTML = emptyState("Create a reward system to see weekly progress.");
      els.liveScore.textContent = "0 / 0 points";
      els.activeSystemName.textContent = "No system selected";
      els.dailyTargetLabel.textContent = "0 / 0 target";
      els.dailyProgressLabel.textContent = "0%";
      els.dailyTargetFill.style.width = "0%";
      els.dailyStatusLabel.textContent = "Create a reward system to start.";
      els.openAddEntryButton.disabled = true;
      els.customizeTopCardButton.disabled = true;
      els.customizeChartsButton.disabled = true;
      els.topCardBlockList.innerHTML = "";
      els.availableTopCardBlocks.innerHTML = "";
      els.chartBlockList.innerHTML = "";
      els.availableChartMetricSelect.innerHTML = "";
      return;
    }

    system.rules = system.rules.map(scoring.normalizeRule);
    system.calculatedTotals = normalizeCalculatedTotals(system.calculatedTotals);
    if (context.type === "personal") {
      pruneDailyEntriesForSystem(system);
      syncDraftInputsFromEntries(system);
      if (hasSyncedValueToday(system)) autoSaveToday(system);
    } else {
      saveCommunitySummaryForMember(context.community, "me");
    }
    els.scoreLabel.textContent = context.type === "community" ? "My Community Daily Total" : "Daily Point Total";
    els.activeSystemName.textContent = context.type === "community" ? `Community: ${context.label.trim()}` : context.label;
    els.breakdownTitle.textContent = "Entries Added Today";
    els.ruleCountLabel.textContent = plural(system.rules.length, "rule");
    els.openAddEntryButton.disabled = !system.rules.length;
    els.customizeTopCardButton.disabled = !system.rules.length;
    els.customizeChartsButton.disabled = false;

    const saved = context.type === "community"
      ? communitySummaryForMember(context.community.id, "me", todayIso)
      : findEntry(todayIso, system.id);
    els.todaySavedLabel.textContent = saved ? `Saved ${formatPoints(saved.total)}` : "0 entries";

    els.dailyInputList.innerHTML = renderAddEntryPanel(system);
    bindDailyInputs();
    updateDashboardComputed();

    if (context.type === "personal") renderWeeklyProgress(system);
    else renderCommunityWeeklyProgress(context.community);
    renderCustomizeTopCardView(system);
    renderCustomizeChartsView(system);
  }

  function renderSystems() {
    const isEditorOpen = Boolean(state.systemEditorOpen);
    const isBuildSubpage = !isEditorOpen && (state.buildMode === "search" || state.buildMode === "ai");
    els.systemsView.classList.toggle("is-editing-system", isEditorOpen);
    els.systemsView.classList.toggle("is-build-subpage", isBuildSubpage);
    els.buildStartPanel.hidden = isEditorOpen || isBuildSubpage;
    els.buildSearchPanel.hidden = isEditorOpen || state.buildMode !== "search";
    els.buildAiPanel.hidden = isEditorOpen || state.buildMode !== "ai";
    els.buildPublicSearchInput.value = state.buildSearchQuery || "";
    renderBuildSearchResults();
    renderAiDraftReview();

    if (!state.selectedSystemId || !state.systems.some((system) => system.id === state.selectedSystemId)) {
      state.selectedSystemId = state.systems[0]?.id || "";
    }

    els.systemList.innerHTML = state.systems.length
      ? state.systems.map(renderSystemCard).join("")
      : emptyState("Create your first custom reward system.");

    Array.from(els.systemList.querySelectorAll("[data-edit-system-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSystemId = button.dataset.editSystemId;
        state.editingRuleId = "";
        state.systemSetupStep = 0;
        state.systemEditorOpen = true;
        saveState();
        renderSystems();
        openSelectedSystemEditor();
      });
    });
    Array.from(els.systemList.querySelectorAll("[data-delete-system-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSystemId = button.dataset.deleteSystemId;
        deleteSelectedSystem();
      });
    });
    const system = getSelectedSystem();
    els.systemEditorPanel.hidden = !state.systemEditorOpen;
    const hasSystem = Boolean(system);
    [
      els.systemTitleInput,
      els.systemCategoryInput,
      els.systemDescriptionInput,
      els.systemVisibilityInput,
      els.duplicateSystemButton,
      els.deleteSystemButton,
      els.cancelRuleEditButton,
      els.ruleLabelInput,
      els.ruleUnitInput,
      els.ruleDailyTargetSlider,
      els.ruleDailyTargetInput,
      els.ruleSimpleStyleInput,
      els.ruleGoalPointsSlider,
      els.ruleGoalPointsInput,
      els.ruleEveryAmountSlider,
      els.ruleEveryAmountInput,
      els.ruleEveryPointsSlider,
      els.ruleEveryPointsInput,
      els.ruleYesNoPointsSlider,
      els.ruleYesNoPointsInput,
      els.rulePenaltyEnabledInput,
      els.ruleMinimumSlider,
      els.ruleMinimumInput,
      els.rulePenaltyPointsSlider,
      els.rulePenaltyPointsInput,
      els.rulePenaltyModeInput,
      els.addThresholdButton,
      els.ruleInputMethodInput,
      els.ruleDataSourceInput,
      els.ruleSourceMetricInput,
      els.ruleManualOverrideInput,
      els.ruleCategoryInput,
      els.ruleMaxDailyPointsInput,
      els.ruleInputMaxInput,
      els.ruleInputStepInput
    ].forEach((input) => {
      input.disabled = !hasSystem;
    });

    if (!system) {
      els.systemTitleInput.value = "";
      els.systemCategoryInput.value = "";
      els.systemDescriptionInput.value = "";
      els.systemVisibilityInput.value = "private";
      els.selectedRuleCount.textContent = "0 rules";
      els.ruleList.innerHTML = emptyState("Rules will appear after you create a system.");
      renderSetupFlow(null);
      resetRuleForm();
      return;
    }

    system.rules = system.rules.map(scoring.normalizeRule);
    els.systemTitleInput.value = system.title;
    els.systemCategoryInput.value = system.category;
    els.systemDescriptionInput.value = system.description || "";
    els.systemVisibilityInput.value = system.visibility;
    els.selectedRuleCount.textContent = plural(system.rules.length, "rule");
    els.ruleList.innerHTML = system.rules.length
      ? system.rules.map((item) => renderRuleRow(item, "personal")).join("")
      : emptyState("Add a rule to define how points are earned or lost.");
    renderRuleForm(system);
    renderCalculatedTotalSetup(system);
    renderSetupFlow(system);

    Array.from(els.ruleList.querySelectorAll("[data-edit-rule-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.editingRuleId = button.dataset.editRuleId;
        state.systemSetupStep = 1;
        saveState();
        renderSystems();
        els.ruleLabelInput.focus();
      });
    });

    Array.from(els.ruleList.querySelectorAll("[data-delete-rule-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        const selected = getSelectedSystem();
        const deletedRuleId = button.dataset.deleteRuleId;
        selected.rules = selected.rules.filter((item) => item.id !== deletedRuleId);
        selected.calculatedTotals = normalizeCalculatedTotals(selected.calculatedTotals).map((total) => ({
          ...total,
          inputIds: total.inputIds.filter((id) => id !== deletedRuleId)
        })).filter((total) => total.inputIds.length);
        removeRuleDailyData(selected.id, deletedRuleId);
        if (state.editingRuleId === deletedRuleId) state.editingRuleId = "";
        syncDraftInputsFromEntries(selected);
        autoSaveToday(selected);
        saveState();
        render();
        showToast("Rule removed");
      });
    });

    Array.from(els.calculatedTotalList.querySelectorAll("[data-delete-total-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        const selected = getSelectedSystem();
        selected.calculatedTotals = normalizeCalculatedTotals(selected.calculatedTotals).filter((item) => item.id !== button.dataset.deleteTotalId);
        syncDraftInputsFromEntries(selected);
        autoSaveToday(selected);
        saveState();
        render();
        showToast("Calculated total removed");
      });
    });
  }

  function setBuildMode(mode) {
    if (mode === "scratch") {
      createSystem();
      return;
    }
    state.buildMode = mode === "search" || mode === "ai" ? mode : "home";
    if (state.buildMode === "home") {
      state.buildViewedProfileId = "";
      state.buildViewedPublicId = "";
    }
    saveState();
    renderSystems();
    if (state.buildMode === "search") els.buildPublicSearchInput.focus();
    if (state.buildMode === "ai") els.aiGoalsInput.focus();
  }

  function openBuildOptions() {
    state.activeView = "systems";
    state.systemEditorOpen = false;
    state.editingRuleId = "";
    resetBuildHome();
    saveState();
    render();
    requestAnimationFrame(() => {
      els.buildStartPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function getBuildPublicSystems() {
    const ownPublic = state.profile.privacy === "public"
      ? state.systems
          .filter((system) => system.visibility === "public")
          .map((system) => ({
            ...system,
            ownerName: state.profile.name,
            ownerHandle: cleanHandle(state.profile.handle)
          }))
      : [];
    return [...state.publicSystems, ...ownPublic];
  }

  function renderBuildSearchResults() {
    if (!els.buildPublicSearchResults) return;
    const query = String(state.buildSearchQuery || "").trim().toLowerCase();
    const systems = getBuildPublicSystems();
    const profiles = getBuildPublicProfiles(systems);

    if (state.buildViewedProfileId) {
      const profile = profiles.find((item) => item.id === state.buildViewedProfileId);
      if (!profile) {
        state.buildViewedProfileId = "";
        renderBuildSearchResults();
        return;
      }
      els.buildPublicSearchResults.innerHTML = renderBuildProfileDetail(profile);
    } else {
      const visibleProfiles = profiles.filter((profile) => matchesProfileSearch(profile, query));
      const visibleSystems = systems.filter((system) => matchesSystemSearch(system, query));
      els.buildPublicSearchResults.innerHTML = `
        <section class="build-result-section" aria-label="Profiles">
          <div class="build-result-section-heading">
            <h3>Profiles</h3>
            <span>${plural(visibleProfiles.length, "result")}</span>
          </div>
          ${visibleProfiles.length ? visibleProfiles.map(renderBuildProfileResult).join("") : emptyState("No public profiles match that search.")}
        </section>
        <section class="build-result-section" aria-label="Reward Systems">
          <div class="build-result-section-heading">
            <h3>Reward Systems</h3>
            <span>${plural(visibleSystems.length, "result")}</span>
          </div>
          ${visibleSystems.length ? visibleSystems.map(renderBuildPublicResult).join("") : emptyState("No public reward systems match that search.")}
        </section>
      `;
    }

    Array.from(els.buildPublicSearchResults.querySelectorAll("[data-build-copy-public-id]")).forEach((button) => {
      button.addEventListener("click", () => copyPublicSystem(button.dataset.buildCopyPublicId, systems));
    });
    Array.from(els.buildPublicSearchResults.querySelectorAll("[data-build-view-profile-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.buildViewedProfileId = button.dataset.buildViewProfileId;
        state.buildViewedPublicId = "";
        saveState();
        renderBuildSearchResults();
      });
    });
    Array.from(els.buildPublicSearchResults.querySelectorAll("[data-build-back-results]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.buildViewedProfileId = "";
        state.buildViewedPublicId = "";
        saveState();
        renderBuildSearchResults();
      });
    });
    Array.from(els.buildPublicSearchResults.querySelectorAll("[data-build-view-public-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.buildViewedPublicId = state.buildViewedPublicId === button.dataset.buildViewPublicId
          ? ""
          : button.dataset.buildViewPublicId;
        saveState();
        renderBuildSearchResults();
      });
    });
  }

  function getBuildPublicProfiles(systems) {
    const grouped = new Map();
    systems.forEach((system) => {
      const id = system.ownerId || system.ownerHandle || system.ownerName || "public";
      if (!grouped.has(id)) {
        grouped.set(id, {
          id,
          name: system.ownerName || "Public profile",
          handle: system.ownerHandle || "",
          systems: []
        });
      }
      grouped.get(id).systems.push(system);
    });
    return Array.from(grouped.values()).sort((a, b) => b.systems.length - a.systems.length || a.name.localeCompare(b.name));
  }

  function matchesProfileSearch(profile, query) {
    if (!query) return true;
    const searchable = [
      profile.name,
      profile.handle,
      ...profile.systems.map((system) => `${system.title} ${system.category} ${system.description}`)
    ].join(" ").toLowerCase();
    return searchable.includes(query);
  }

  function matchesSystemSearch(system, query) {
    if (!query) return true;
    const searchable = [
      system.title,
      system.ownerName,
      system.ownerHandle,
      system.category,
      system.description,
      ...(system.rules || []).map((item) => `${item.label} ${item.category} ${item.unit}`)
    ].join(" ").toLowerCase();
    return searchable.includes(query);
  }

  function renderBuildProfileResult(profile) {
    return `
      <article class="build-result-card profile-result-card">
        <div class="build-result-main">
          <strong>${escapeHtml(profile.name)}</strong>
          <span>${escapeHtml(profile.handle || "@public")}</span>
          <span>${plural(profile.systems.length, "public system")}</span>
        </div>
        <div class="build-result-actions">
          <button class="secondary-button small" type="button" data-build-view-profile-id="${escapeHtml(profile.id)}">View Profile</button>
        </div>
      </article>
    `;
  }

  function renderBuildProfileDetail(profile) {
    return `
      <section class="build-profile-detail">
        <div class="build-profile-header">
          <button class="ghost-button small" type="button" data-build-back-results>Back</button>
          <div>
            <h3>${escapeHtml(profile.name)}</h3>
            <span>${escapeHtml(profile.handle || "@public")} &middot; ${plural(profile.systems.length, "public system")}</span>
          </div>
        </div>
        <div class="build-search-results">
          ${profile.systems.map(renderBuildPublicResult).join("")}
        </div>
      </section>
    `;
  }

  function renderBuildPublicResult(system) {
    const showDetails = state.buildViewedPublicId === system.id;
    const rules = (system.rules || []).slice(0, 6).map((item) => `<li>${escapeHtml(ruleSentence(item))}</li>`).join("");
    return `
      <article class="build-result-card">
        <div class="build-result-main">
          <strong>${escapeHtml(system.title)}</strong>
          <span>by ${escapeHtml(system.ownerName || "Public profile")}${system.ownerHandle ? ` &middot; ${escapeHtml(system.ownerHandle)}` : ""}</span>
          <span>${escapeHtml(system.category || "General wellness")} &middot; ${plural((system.rules || []).length, "rule")}</span>
          <p>${escapeHtml(system.description || "Public reward system you can copy and customize.")}</p>
        </div>
        <div class="build-result-actions">
          <button class="secondary-button small" type="button" data-build-copy-public-id="${escapeHtml(system.id)}">Copy</button>
          <button class="ghost-button small" type="button" data-build-view-public-id="${escapeHtml(system.id)}">View details</button>
        </div>
        ${showDetails ? `<ul class="discover-rules build-result-details">${rules}</ul>` : ""}
      </article>
    `;
  }

  function generateAiDraftSystem(event) {
    event.preventDefault();
    state.aiDraftSystem = createMockAiDraftSystem();
    state.buildMode = "ai";
    renderSystems();
    showToast("Draft generated");
  }

  function createMockAiDraftSystem() {
    const goals = els.aiGoalsInput.value.trim();
    const rewards = els.aiRewardHabitsInput.value.trim();
    const penalties = els.aiPenaltyHabitsInput.value.trim();
    const categories = els.aiCategoriesInput.value.trim();
    const strictness = els.aiStrictnessInput.value;
    const targets = els.aiTargetsInput.value.trim();
    const combined = `${goals} ${rewards} ${penalties} ${categories} ${targets}`.toLowerCase();
    const scale = strictness === "easy" ? 0.75 : (strictness === "intense" ? 1.25 : 1);
    const category = inferCategory(categories || goals || rewards) || "General wellness";
    const rules = [];

    if (/protein|nutrition|food|healthy|cut|muscle/.test(combined)) {
      rules.push(aiRule("Protein", "Nutrition", "grams", targetFromText(targets, /(\d+(?:\.\d+)?)\s*g?\s*protein/i, 150), roundScore(2 * scale)));
    }
    if (/steps|walk|fitness|cut|running|run/.test(combined) || !rules.length) {
      rules.push(scoring.createRule({
        id: makeId("steps"),
        label: "Steps",
        category: "Fitness",
        metric: "steps",
        unit: "steps",
        simpleStyle: "both",
        dailyTarget: targetFromText(targets, /(\d+(?:,\d{3})*|\d+)\s*steps/i, 10000),
        goalPoints: roundScore(2 * scale),
        everyAmount: 5000,
        everyPoints: roundScore(1 * scale),
        inputMethod: "slider",
        inputMax: 20000,
        inputStep: 500
      }));
    }
    if (/lift|gym|strength|muscle|workout/.test(combined)) {
      rules.push(aiRule("Lifting", "Fitness", "minutes", targetFromText(targets, /(\d+(?:\.\d+)?)\s*(?:min|minutes).*lift/i, 60), roundScore(1.5 * scale)));
    }
    if (/study|school|academic|focus|productivity|work/.test(combined)) {
      rules.push(aiRule("Focused study", "Academics", "minutes", targetFromText(targets, /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?).*(?:study|studying)/i, 2) * 60, roundScore(2 * scale)));
    }
    if (/sleep|recovery/.test(combined) || penalties.toLowerCase().includes("sleep")) {
      rules.push(scoring.createRule({
        id: makeId("sleep"),
        label: "Sleep",
        category: "Sleep",
        metric: "sleep",
        unit: "hours",
        simpleStyle: "penalty",
        dailyTarget: targetFromText(targets, /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?).*sleep/i, 7.5),
        minimumRequired: targetFromText(targets, /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?).*sleep/i, 7),
        penaltyEnabled: true,
        penaltyPoints: roundScore(-0.5 * scale),
        penaltyMode: "proportional",
        inputMethod: "number",
        inputMax: 12,
        inputStep: 0.25
      }));
    }
    if (/budget|finance|spend|money/.test(combined)) {
      rules.push(scoring.createRule({
        id: makeId("budget"),
        label: "Spending over budget",
        category: "Finance",
        metric: "spending",
        unit: "dollars",
        simpleStyle: "penalty",
        dailyTarget: 0,
        minimumRequired: 0,
        penaltyEnabled: true,
        penaltyPoints: roundScore(-1 * scale),
        inputMethod: "number",
        inputMax: 500,
        inputStep: 1
      }));
    }

    return normalizeSystem({
      id: makeId("draft"),
      ownerId: "me",
      ownerName: state.profile.name,
      title: `${capitalize(strictness)} ${category} system`,
      category,
      visibility: "private",
      description: goals || "A draft reward system generated from your goals.",
      rules,
      calculatedTotals: []
    });
  }

  function aiRule(label, category, unit, dailyTarget, goalPoints) {
    return scoring.createRule({
      id: makeId(label.toLowerCase().replace(/\s+/g, "-")),
      label,
      category,
      metric: label.toLowerCase(),
      unit,
      simpleStyle: "goal",
      dailyTarget,
      goalPoints,
      inputMethod: "slider",
      inputMax: Math.max(dailyTarget * 2, 10),
      inputStep: unit === "grams" ? 5 : 5
    });
  }

  function targetFromText(text, pattern, fallback) {
    const match = String(text || "").match(pattern);
    if (!match) return fallback;
    return numberOrDefault(match[1].replace(/,/g, ""), fallback);
  }

  function renderAiDraftReview() {
    const draft = state.aiDraftSystem ? normalizeSystem(state.aiDraftSystem) : null;
    els.buildAiForm.hidden = Boolean(draft);
    els.aiDraftReview.hidden = !draft;
    if (!draft) {
      els.aiDraftReview.innerHTML = "";
      return;
    }
    const target = calculateTargetSummary(draft).total;
    els.aiDraftReview.innerHTML = `
      <div class="ai-draft-card">
        <div class="panel-heading tight">
          <div>
            <h3>${escapeHtml(draft.title)}</h3>
            <span>${escapeHtml(draft.category)} Â· estimated ${formatPoints(target)} points per day</span>
          </div>
          <button class="secondary-button small" type="button" id="useAiDraftButton">Use This System</button>
        </div>
        <p>${escapeHtml(draft.description || "")}</p>
        <p class="review-note">Review this draft, then use it to open the full setup editor and customize every rule.</p>
        <div class="compact-rule-list">
          ${draft.rules.map((item) => renderRuleRow(item, "preview")).join("")}
        </div>
      </div>
    `;
    document.getElementById("useAiDraftButton")?.addEventListener("click", useAiDraftSystem);
  }

  function useAiDraftSystem() {
    if (!state.aiDraftSystem) return;
    const draft = cloneSystem(normalizeSystem(state.aiDraftSystem), state.aiDraftSystem.title || "AI draft reward system");
    state.systems.unshift(draft);
    state.selectedSystemId = draft.id;
    state.trackerSystemId = draft.id;
    state.aiDraftSystem = null;
    state.buildMode = "home";
    state.buildViewedProfileId = "";
    state.buildViewedPublicId = "";
    state.activeView = "systems";
    state.systemSetupStep = 0;
    state.systemEditorOpen = true;
    saveState();
    render();
    openSelectedSystemEditor();
    showToast("Draft added to your systems");
  }

  function renderSetupFlow(system) {
    const step = clampSetupStep(state.systemSetupStep);
    state.systemSetupStep = step;
    const config = setupSteps[step];
    document.querySelectorAll("[data-setup-step]").forEach((panel) => {
      panel.hidden = Number(panel.dataset.setupStep) !== step;
    });
    els.setupStepKicker.textContent = `Step ${step + 1} of ${setupSteps.length}`;
    els.setupStepTitle.textContent = config.title;
    els.setupStepIntro.textContent = config.intro;
    els.systemSetupStepper.innerHTML = setupSteps.map((item, index) => `
      <button class="setup-step-dot${index === step ? " active" : ""}${index < step ? " complete" : ""}" type="button" data-setup-jump="${index}" aria-current="${index === step ? "step" : "false"}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(item.title)}</strong>
      </button>
    `).join("");
    Array.from(els.systemSetupStepper.querySelectorAll("[data-setup-jump]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.systemSetupStep = clampSetupStep(button.dataset.setupJump);
        saveState();
        renderSystems();
      });
    });
    els.setupBackButton.hidden = step === 0;
    els.setupNextButton.hidden = step === setupSteps.length - 1;
    els.setupCompleteButton.hidden = step !== setupSteps.length - 1;
    els.setupSkipButton.hidden = !(step === 1 || step === 2);
    els.setupNextButton.textContent = config.nextLabel;
    els.setupSkipButton.textContent = config.skipLabel || "Skip for now";
    if (system) renderSetupReview(system);
  }

  function moveSetupStep(delta, options = {}) {
    const step = clampSetupStep(state.systemSetupStep);
    if (delta > 0 && !options.skip) {
      const message = validateSetupStep(step);
      if (message) {
        showToast(message);
        return;
      }
    }
    state.systemSetupStep = clampSetupStep(step + delta);
    saveState();
    renderSystems();
    openSelectedSystemEditor();
  }

  function validateSetupStep(step) {
    if (step !== 0) return "";
    if (!els.systemTitleInput.value.trim()) return "Please add a reward system name.";
    if (!els.systemCategoryInput.value.trim()) return "Please add a category or focus area.";
    return "";
  }

  function completeSystemSetup() {
    const message = validateSetupStep(0);
    if (message) {
      state.systemSetupStep = 0;
      saveState();
      renderSystems();
      showToast(message);
      return;
    }
    const system = getSelectedSystem();
    if (!system) return;
    state.selectedSystemId = system.id;
    state.trackerSystemId = system.id;
    state.activeView = "systems";
    state.buildMode = "home";
    state.aiDraftSystem = null;
    state.buildViewedProfileId = "";
    state.buildViewedPublicId = "";
    state.systemEditorOpen = false;
    state.systemSetupStep = 0;
    state.editingRuleId = "";
    saveState();
    render();
    scrollSystemsListToTop();
    showToast("Reward system complete");
  }

  function renderSetupReview(system) {
    const normalized = normalizeSystem(system);
    const target = calculateTargetSummary(normalized).total;
    const ruleRows = normalized.rules.length
      ? normalized.rules.map((item) => `
        <li>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${[...scoring.describeRule(item), ruleSourceSummary(item)].map(escapeHtml).join(" · ")}</span>
        </li>
      `).join("")
      : `<li><span>No scoring rules yet.</span></li>`;
    const totals = normalizeCalculatedTotals(normalized.calculatedTotals);
    const totalRows = totals.length
      ? totals.map((total) => `
        <li>
          <strong>${escapeHtml(total.name)}</strong>
          <span>${escapeHtml(calculatedTotalSummary(total, normalized.rules))}</span>
        </li>
      `).join("")
      : `<li><span>No calculated totals yet.</span></li>`;
    els.setupReview.innerHTML = `
      <div class="review-card">
        <span>Reward system</span>
        <strong>${escapeHtml(normalized.title || "Untitled system")}</strong>
        <p>${escapeHtml(normalized.description || "No intent added yet.")}</p>
      </div>
      <div class="review-grid">
        <div class="review-card">
          <span>Category</span>
          <strong>${escapeHtml(normalized.category || "No category yet")}</strong>
        </div>
        <div class="review-card">
          <span>Visibility</span>
          <strong>${escapeHtml(capitalize(normalized.visibility || "private"))}</strong>
        </div>
        <div class="review-card">
          <span>Daily point target</span>
          <strong>${escapeHtml(formatPoints(target))} points</strong>
        </div>
      </div>
      <div class="review-card">
        <span>Scoring rules</span>
        <ul class="review-list">${ruleRows}</ul>
      </div>
      <div class="review-card">
        <span>Calculated totals</span>
        <ul class="review-list">${totalRows}</ul>
      </div>
    `;
  }

  function renderDiscover() {
    const ownPublic = state.profile.privacy === "public"
      ? state.systems
          .filter((system) => system.visibility === "public")
          .map((system) => ({
            ...system,
            ownerName: state.profile.name,
            ownerHandle: cleanHandle(state.profile.handle)
          }))
      : [];
    const allPublic = [...state.publicSystems, ...ownPublic];
    const filter = els.discoverFilter.value || "all";
    const visibleSystems = allPublic.filter((system) => filter === "all" || system.category === filter);

    els.discoverGrid.innerHTML = visibleSystems.length
      ? visibleSystems.map(renderDiscoverCard).join("")
      : emptyState("No public systems match this filter.");

    Array.from(els.discoverGrid.querySelectorAll("[data-copy-public-id]")).forEach((button) => {
      button.addEventListener("click", () => copyPublicSystem(button.dataset.copyPublicId, allPublic));
    });
  }

  function renderCommunities() {
    if (!state.selectedCommunityId || !state.communities.some((community) => community.id === state.selectedCommunityId)) {
      state.selectedCommunityId = state.communities[0]?.id || "";
    }

    els.communityList.innerHTML = state.communities.length
      ? state.communities.map(renderCommunityCard).join("")
      : emptyState("No communities yet.");

    Array.from(els.communityList.querySelectorAll("[data-community-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedCommunityId = button.dataset.communityId;
        state.communityDraftInputs = {};
        state.activeView = "community-detail";
        saveState();
        render();
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    });

    renderCommunityDetail();
  }

  function renderCommunityDetail() {
    const community = getSelectedCommunity();
    if (!community) {
      els.communityDetailTitle.textContent = "Community";
      els.communityMeta.textContent = "";
      els.communityDescription.textContent = "";
      els.communityStatus.textContent = "Private";
      els.communityStatus.className = "visibility-pill private";
      els.communityLeader.textContent = "-";
      els.leaderboardList.innerHTML = "";
      return;
    }

    community.system.rules = community.system.rules.map(scoring.normalizeRule);
    saveCommunitySummaryForMember(community, "me");
    if (!state.selectedCommunityMemberId || !community.members.some((memberItem) => memberItem.id === state.selectedCommunityMemberId)) {
      state.selectedCommunityMemberId = "me";
    }
    const standings = getCommunityStandings(community);
    const leader = standings[0];
    const visibility = communityVisibility(community);

    els.inviteOptions.hidden = true;
    els.communityDetailTitle.textContent = community.name;
    els.communityMeta.textContent = `${plural(getCommunityMemberCount(community), "member")} · ${capitalize(visibility)}`;
    els.communityDescription.textContent = community.description || "";
    els.communityStatus.textContent = capitalize(visibility);
    els.communityStatus.className = `visibility-pill ${visibility}`;
    els.communityLeader.textContent = leader ? `${leader.name.split(" ")[0]} leads today` : "Daily community points";
    els.leaderboardList.innerHTML = standings.map(renderLeaderboardRow).join("");
    bindLeaderboardRows();
  }

  function renderCommunitySettings() {
    const community = getSelectedCommunity();
    if (!community) {
      els.communitySettingsTitle.textContent = "Community Rules";
      els.communitySettingsMode.textContent = "View Rules";
      els.communityNameInput.value = "";
      els.communityDescriptionInput.value = "";
      els.communityVisibilityInput.value = "private";
      els.communityRules.innerHTML = "";
      return;
    }

    community.system = normalizeSystem(community.system || { rules: [] });
    const canEdit = isCommunityAdmin(community);
    els.communitySettingsTitle.textContent = canEdit ? "Edit Rules" : "View Rules";
    els.communitySettingsMode.textContent = canEdit ? "Community Rules" : "Read-only rules";
    els.communityRulesHint.textContent = canEdit ? "Edit Rules" : "View Rules";
    els.communityNameInput.value = community.name || "";
    els.communityDescriptionInput.value = community.description || "";
    els.communityVisibilityInput.value = communityVisibility(community);
    [els.communityNameInput, els.communityDescriptionInput, els.communityVisibilityInput].forEach((input) => {
      input.disabled = !canEdit;
    });
    els.saveCommunitySettingsButton.hidden = !canEdit;
    els.addCommunityRuleButton.hidden = !canEdit;
    els.communityRules.innerHTML = community.system.rules.length
      ? community.system.rules.map((item) => canEdit ? renderCommunityRuleEditor(item) : renderRuleRow(item, "community")).join("")
      : emptyState(canEdit ? "Add a community rule to define scoring." : "No community rules yet.");
    bindCommunityRuleEditors();
  }

  function renderCommunityMemberActivity() {
    const community = getSelectedCommunity();
    els.communityCheckinSection.hidden = true;
    els.communityCheckinSection.innerHTML = "";
    if (!community) {
      els.memberActivityTitle.textContent = "Member Activity";
      els.memberActivityTotal.textContent = "0 points today";
      els.memberActivityPanel.innerHTML = emptyState("No activity yet.");
      return;
    }
    renderMemberActivity(community);
  }

  function renderFindCommunities() {
    const query = state.communitySearchQuery || "";
    if (els.findCommunitySearchInput.value !== query) {
      els.findCommunitySearchInput.value = query;
    }
    const results = getVisiblePublicCommunities(query);

    els.findCommunityResults.innerHTML = results.length
      ? results.map(renderFindCommunityResult).join("")
      : emptyState("No communities found.");

    Array.from(els.findCommunityResults.querySelectorAll("[data-join-community-id]")).forEach((button) => {
      button.addEventListener("click", () => joinPublicCommunity(button.dataset.joinCommunityId));
    });
  }

  function renderProfile() {
    els.profileNameInput.value = state.profile.name;
    els.profileHandleInput.value = state.profile.handle.replace(/^@/, "");
    els.profilePrivacyInput.value = state.profile.privacy;
    els.dailyTargetInput.value = state.profile.dailyTarget;

    const publicSystems = state.profile.privacy === "public"
      ? state.systems.filter((system) => system.visibility === "public")
      : [];

    els.publicPreviewStatus.textContent = state.profile.privacy === "public"
      ? `${plural(publicSystems.length, "visible system")}`
      : "Profile is private";

    els.publicPreview.innerHTML = publicSystems.length
      ? publicSystems.map((system) => `
        <div class="public-system-row">
          <div>
            <strong>${escapeHtml(system.title)}</strong>
            <div class="system-meta">${escapeHtml(system.category)} · ${plural(system.rules.length, "rule")}</div>
          </div>
          <span class="visibility-pill public">Public</span>
        </div>
      `).join("")
      : emptyState(state.profile.privacy === "public"
        ? "Make a system public to include it in your preview."
        : "Switch the profile to public to show shareable systems.");

    renderIntegrations();
  }

  function renderIntegrations() {
    if (!els.integrationList) return;
    const pending = integrationDefinitions.find((item) => item.id === state.pendingIntegrationId);
    const cards = integrationDefinitions.map(renderIntegrationCard).join("");
    const permissionCard = pending ? renderIntegrationPermissionCard(pending) : "";
    els.integrationList.innerHTML = `${cards}${permissionCard}`;
    Array.from(els.integrationList.querySelectorAll("[data-connect-integration]")).forEach((button) => {
      button.addEventListener("click", () => openMockIntegrationPermission(button.dataset.connectIntegration));
    });
    Array.from(els.integrationList.querySelectorAll("[data-confirm-integration]")).forEach((button) => {
      button.addEventListener("click", () => confirmMockIntegration(button.dataset.confirmIntegration));
    });
    Array.from(els.integrationList.querySelectorAll("[data-cancel-integration]")).forEach((button) => {
      button.addEventListener("click", closeMockIntegrationPermission);
    });
    Array.from(els.integrationList.querySelectorAll("[data-disconnect-integration]")).forEach((button) => {
      button.addEventListener("click", () => disconnectIntegration(button.dataset.disconnectIntegration));
    });
    Array.from(els.integrationList.querySelectorAll("[data-manage-integration]")).forEach((button) => {
      button.addEventListener("click", () => manageIntegration(button.dataset.manageIntegration));
    });
  }

  function renderIntegrationCard(definition) {
    const integration = state.integrations?.[definition.id] || { status: "not-connected", lastSynced: "" };
    const connected = integration.status === "connected";
    const metrics = Object.entries(state.mockSyncData?.[definition.id] || defaultMockSyncData[definition.id] || {})
      .slice(0, 3)
      .map(([metric, value]) => `${sourceMetricLabel(definition.id, metric)}: ${formatValue(value)}`)
      .join(" · ");
    return `
      <article class="integration-card">
        <div class="integration-main">
          <strong>${escapeHtml(definition.label)}</strong>
          <span>${escapeHtml(connected ? "Connected in demo mode" : "Not connected")}</span>
          <p>${escapeHtml(definition.description)}</p>
          <small>${escapeHtml(metrics || "Mock data ready for testing.")}</small>
        </div>
        <div class="integration-actions">
          ${connected
            ? `<button class="secondary-button small" type="button" data-manage-integration="${escapeHtml(definition.id)}">Manage</button>
               <button class="ghost-button small" type="button" data-disconnect-integration="${escapeHtml(definition.id)}">Disconnect</button>`
            : `<button class="secondary-button small" type="button" data-connect-integration="${escapeHtml(definition.id)}">Connect</button>`}
        </div>
      </article>
    `;
  }

  function renderIntegrationPermissionCard(definition) {
    const connected = integrationStatus(definition.id) === "connected";
    return `
      <article class="integration-permission-card">
        <div>
          <span class="eyebrow">${connected ? "Manage demo connection" : "Mock permission flow"}</span>
          <h3>${escapeHtml(definition.label)}</h3>
          <p>${escapeHtml(definition.privacy)}</p>
          <p>This prototype uses sample data only. No real health or bank account connection is created.</p>
        </div>
        <div class="integration-permission-actions">
          ${connected
            ? `<button class="primary-button small" type="button" data-cancel-integration>Done</button>`
            : `<button class="primary-button small" type="button" data-confirm-integration="${escapeHtml(definition.id)}">Connect</button>
               <button class="ghost-button small" type="button" data-cancel-integration>Back</button>`}
        </div>
      </article>
    `;
  }

  function openMockIntegrationPermission(integrationId) {
    state.pendingIntegrationId = integrationId;
    saveState();
    renderProfile();
  }

  function confirmMockIntegration(integrationId) {
    state.integrations = normalizeIntegrations(state.integrations);
    state.integrations[integrationId] = {
      status: "connected",
      lastSynced: new Date().toISOString()
    };
    state.pendingIntegrationId = "";
    const system = getTrackerSystem();
    if (system) {
      syncDraftInputsFromEntries(system);
      autoSaveToday(system);
    }
    saveState();
    render();
    showToast(`${dataSourceLabel(integrationId)} connected in demo mode`);
  }

  function closeMockIntegrationPermission() {
    state.pendingIntegrationId = "";
    saveState();
    renderProfile();
  }

  function disconnectIntegration(integrationId) {
    state.integrations = normalizeIntegrations(state.integrations);
    state.integrations[integrationId] = {
      status: "not-connected",
      lastSynced: ""
    };
    state.pendingIntegrationId = "";
    const system = getTrackerSystem();
    if (system) {
      syncDraftInputsFromEntries(system);
      autoSaveToday(system);
    }
    saveState();
    render();
    showToast(`${dataSourceLabel(integrationId)} disconnected`);
  }

  function manageIntegration(integrationId) {
    state.pendingIntegrationId = integrationId;
    saveState();
    renderProfile();
  }

  function bindDailyInputs() {
    const ruleSelect = els.dailyInputList.querySelector("[data-add-entry-rule]");
    if (ruleSelect) {
      ruleSelect.addEventListener("change", () => {
        changeAddEntryRule(ruleSelect.value);
      });
    }
    Array.from(els.dailyInputList.querySelectorAll("[data-add-entry-amount]")).forEach((input) => {
      input.addEventListener("input", () => {
        syncAddEntryAmount(input.value, input);
      });
      input.addEventListener("change", () => {
        syncAddEntryAmount(input.value, input);
      });
    });
    Array.from(els.dailyInputList.querySelectorAll("[data-add-entry-toggle]")).forEach((input) => {
      input.addEventListener("change", () => {
        syncAddEntryAmount(input.checked ? 1 : 0, input);
      });
    });
    Array.from(els.dailyInputList.querySelectorAll("[data-add-entry-button]")).forEach((button) => {
      button.addEventListener("click", () => addDailyEntryFromDraft());
    });
  }

  function bindCommunityInputs() {
    Array.from(els.communityInputList.querySelectorAll("[data-community-input-rule]")).forEach((input) => {
      input.addEventListener("input", () => {
        state.communityDraftInputs[input.dataset.communityInputRule] = normalizeInputValue(input);
        saveState();
        renderCommunities();
      });
      input.addEventListener("change", () => {
        state.communityDraftInputs[input.dataset.communityInputRule] = normalizeInputValue(input);
        saveState();
        renderCommunities();
      });
    });
  }

  function renderAddEntryPanel(system) {
    const rules = system.rules.map(scoring.normalizeRule);
    if (!rules.length) return emptyState("Add a scoring rule before adding entries.");
    const values = valuesForScoreContext(getActiveScoreContext());
    if (!addEntryDraft.ruleId || !rules.some((item) => item.id === addEntryDraft.ruleId)) {
      const firstRule = rules[0];
      addEntryDraft = { ruleId: firstRule.id, amount: suggestedEntryAmount(firstRule) };
    }
    const selectedRule = rules.find((item) => item.id === addEntryDraft.ruleId) || rules[0];
    const amount = normalizeAddEntryAmount(addEntryDraft.amount, selectedRule);
    addEntryDraft.amount = amount;
    const currentTotal = numberOrDefault(values[selectedRule.id], 0);
    const goal = goalAmountForRule(selectedRule);
    const currentPercent = progressPercent(currentTotal, goal);
    const previewTotal = currentTotal + amount;
    const previewPercent = progressPercent(previewTotal, goal);
    const options = rules.map((item) => `
      <option value="${escapeHtml(item.id)}"${item.id === selectedRule.id ? " selected" : ""}>
        ${escapeHtml(item.label)}
      </option>
    `).join("");

    return `
      <div class="add-entry-card" data-add-entry-card>
        <label class="wide-entry-field">
          <span>Metric/rule</span>
          <select data-add-entry-rule aria-label="Choose metric to add">${options}</select>
        </label>
        ${renderAddEntrySourceNotice(selectedRule)}
        <div class="add-entry-progress-grid">
          <div class="add-entry-progress-card">
            <span class="entry-preview-label">Current progress</span>
            <strong data-add-current-line>${escapeHtml(formatAddEntryProgressLine(selectedRule, currentTotal))}</strong>
            <span data-add-current-percent>${escapeHtml(formatPercent(currentPercent))} complete</span>
            <div class="mini-progress-track" aria-hidden="true">
              <div class="mini-progress-fill${currentPercent > 100 ? " over-goal" : ""}" data-add-current-fill style="width:${Math.min(currentPercent, 100)}%"></div>
            </div>
          </div>
          <div class="add-entry-progress-card preview">
            <span class="entry-preview-label">After adding</span>
            <strong data-add-preview-line>${escapeHtml(formatAddEntryProgressLine(selectedRule, previewTotal))}</strong>
            <span data-add-preview-percent>${escapeHtml(formatPercent(previewPercent))} complete</span>
            <div class="mini-progress-track" aria-hidden="true">
              <div class="mini-progress-fill${previewPercent > 100 ? " over-goal" : ""}" data-add-preview-fill style="width:${Math.min(previewPercent, 100)}%"></div>
            </div>
          </div>
        </div>
        ${renderAddEntryAmountControl(selectedRule, amount)}
      </div>
    `;
  }

  function renderAddEntrySourceNotice(rule) {
    if (!isRuleSynced(rule)) return "";
    const source = rule.dataSource;
    const value = syncedValueForRule(rule, { userId: "me", date: todayIso, scope: getActiveScoreContext().type });
    const status = value === null ? "Not connected" : `${formatValue(value)} ${rule.unit} synced today`;
    const action = rule.allowManualOverride === false ? "Manual adjustment is off." : "Use Add Entry only for a manual adjustment.";
    return `
      <div class="source-notice">
        <strong>${escapeHtml(dataSourceLabel(source))}</strong>
        <span>${escapeHtml(sourceMetricLabel(source, rule.sourceMetric))} - ${escapeHtml(status)}. ${escapeHtml(action)}</span>
      </div>
    `;
  }

  function formatAddEntryProgressLine(rule, total) {
    const goal = goalAmountForRule(rule);
    if (rule.simpleStyle === "yesNo") {
      return `${rule.label}: ${total > 0 ? "complete" : "not complete"}`;
    }
    return `${rule.label}: ${formatValue(total)} / ${formatValue(goal || 0)} ${rule.unit}`;
  }

  function renderAddEntryAmountControl(rule, amount) {
    const adjustmentLabel = isRuleSynced(rule) ? "adjustment" : "";
    if (rule.inputMethod === "toggle") {
      const checked = Number(amount) > 0;
      return `
        <div class="add-entry-control">
          <label class="check-input add-entry-check">
            <input data-add-entry-toggle type="checkbox" aria-label="${escapeHtml(rule.label)} completed"${checked ? " checked" : ""}>
            <span>Completed today</span>
          </label>
          <button class="primary-button" type="button" data-add-entry-button>
            <span aria-hidden="true">+</span>
            <span data-add-entry-button-label>${checked ? `Add ${escapeHtml(rule.label)}${adjustmentLabel ? ` ${adjustmentLabel}` : ""}` : "Choose completion"}</span>
          </button>
        </div>
      `;
    }

    const settings = entrySliderSettings(rule);
    const safeAmount = clampToRange(amount, settings.min, settings.max);
    return `
      <div class="add-entry-control">
        <label class="entry-amount-field">
          <span>Amount</span>
          <div class="entry-slider-line">
            <input data-add-entry-amount aria-label="${escapeHtml(rule.label)} slider" type="range" min="${escapeHtml(String(settings.min))}" max="${escapeHtml(String(settings.max))}" step="${escapeHtml(String(settings.step))}" value="${escapeHtml(String(safeAmount))}">
            <div class="manual-entry">
              <input data-add-entry-amount aria-label="${escapeHtml(rule.label)} amount" type="number" min="${escapeHtml(String(settings.min))}" max="${escapeHtml(String(settings.max))}" step="${escapeHtml(String(settings.step))}" value="${escapeHtml(String(safeAmount))}">
              <span>${escapeHtml(rule.unit)}</span>
            </div>
          </div>
        </label>
        <button class="primary-button" type="button" data-add-entry-button>
          <span aria-hidden="true">+</span>
          <span data-add-entry-button-label>Add ${escapeHtml(formatValue(safeAmount))} ${escapeHtml(rule.unit)} ${escapeHtml(rule.label)}${adjustmentLabel ? ` ${adjustmentLabel}` : ""}</span>
        </button>
      </div>
    `;
  }

  function renderInputRow(item, scope = "personal") {
    item = scoring.normalizeRule(item);
    const valueMap = scope === "community" ? state.communityDraftInputs : state.draftInputs;
    const value = valueMap[item.id] ?? 0;
    const attr = scope === "community" ? "data-community-input-rule" : "data-input-rule";
    const score = scoring.calculateRule(item, value);
    const percent = progressPercent(value, item.dailyTarget || item.minimumRequired);
    let input = `
      <div class="daily-entry-control">
        <input ${attr}="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.label)} slider" type="range" min="${escapeHtml(String(item.inputMin))}" max="${escapeHtml(String(item.inputMax))}" step="${escapeHtml(String(item.inputStep))}" value="${escapeHtml(String(value))}">
        <div class="manual-entry">
          <input ${attr}="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.label)} amount" type="number" step="${escapeHtml(String(item.inputStep))}" value="${escapeHtml(String(value))}" placeholder="0">
          <span>${escapeHtml(item.unit)}</span>
        </div>
      </div>
    `;
    if (item.inputMethod === "toggle") {
      input = `
        <label class="check-input">
          <input ${attr}="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.label)}" type="checkbox"${Number(value) > 0 ? " checked" : ""}>
          <span>Completed today?</span>
        </label>
      `;
    }

    return `
      <div class="input-row progress-input-row" data-rule-card="${escapeHtml(item.id)}">
        <div class="input-info">
          <strong>${escapeHtml(item.label)}</strong>
          <span data-rule-goal-text="${escapeHtml(item.id)}">${escapeHtml(progressText(item, value))}</span>
          <div class="mini-progress-track" aria-hidden="true">
            <div class="mini-progress-fill" data-rule-progress-fill="${escapeHtml(item.id)}" style="width:${Math.min(percent, 140)}%"></div>
          </div>
          <span class="progress-percent" data-rule-progress-text="${escapeHtml(item.id)}">${formatPercent(percent)} of goal${percent > 100 ? " · over goal" : ""}</span>
          <em data-rule-points="${escapeHtml(item.id)}">Points from this rule today: ${escapeHtml(formatSigned(score.totalPoints))}</em>
        </div>
        <div class="input-actions">
          ${input}
          ${scope === "personal" && item.inputMethod !== "toggle" ? `
            <div class="quick-add">
              <input data-quick-add-value="${escapeHtml(item.id)}" type="number" step="${escapeHtml(String(item.inputStep))}" placeholder="Add ${escapeHtml(item.unit)}" aria-label="Quick add ${escapeHtml(item.label)}">
              <button class="ghost-button small" type="button" data-quick-add-button="${escapeHtml(item.id)}">Add entry</button>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  function renderCalculatedTotalCard(total) {
    total = normalizeCalculatedTotal(total);
    return `
      <div class="input-row progress-input-row calculated-card" data-total-card="${escapeHtml(total.id)}">
        <div class="input-info">
          <strong>${escapeHtml(total.name)}</strong>
          <span data-total-goal-text="${escapeHtml(total.id)}">Tracking total</span>
          <div class="mini-progress-track" aria-hidden="true">
            <div class="mini-progress-fill" data-total-progress-fill="${escapeHtml(total.id)}" style="width:0%"></div>
          </div>
          <span class="progress-percent" data-total-progress-text="${escapeHtml(total.id)}">0% of goal</span>
          <em data-total-value="${escapeHtml(total.id)}">0 ${escapeHtml(total.unit)}</em>
        </div>
        <span class="tracking-pill">${total.trackingOnly ? "Tracking only" : "Calculated"}</span>
      </div>
    `;
  }

  function changeAddEntryRule(ruleId) {
    const system = getActiveScoreContext().system;
    const rule = system?.rules.map(scoring.normalizeRule).find((item) => item.id === ruleId);
    if (!system || !rule) return;
    addEntryDraft = { ruleId, amount: suggestedEntryAmount(rule) };
    els.dailyInputList.innerHTML = renderAddEntryPanel(system);
    bindDailyInputs();
  }

  function syncAddEntryAmount(value, sourceInput) {
    const system = getActiveScoreContext().system;
    const rule = system?.rules.map(scoring.normalizeRule).find((item) => item.id === addEntryDraft.ruleId);
    if (!rule) return;
    const amount = normalizeAddEntryAmount(value, rule);
    addEntryDraft.amount = amount;
    if (sourceInput?.type === "checkbox") {
      updateAddEntryPreview(rule, amount);
      return;
    }
    if (sourceInput && String(sourceInput.value) !== String(amount)) {
      sourceInput.value = amount;
    }
    Array.from(els.dailyInputList.querySelectorAll("[data-add-entry-amount]")).forEach((input) => {
      if (input === sourceInput) return;
      input.value = amount;
    });
    updateAddEntryPreview(rule, amount);
  }

  function updateAddEntryPreview(rule, amount) {
    const currentTotal = numberOrDefault(valuesForScoreContext(getActiveScoreContext())[rule.id], 0);
    const previewTotal = currentTotal + amount;
    const goal = goalAmountForRule(rule);
    const currentPercent = progressPercent(currentTotal, goal);
    const previewPercent = progressPercent(previewTotal, goal);
    setText("[data-add-current-line]", formatAddEntryProgressLine(rule, currentTotal));
    setText("[data-add-current-percent]", `${formatPercent(currentPercent)} complete`);
    setText("[data-add-preview-line]", formatAddEntryProgressLine(rule, previewTotal));
    setText("[data-add-preview-percent]", `${formatPercent(previewPercent)} complete`);
    setWidth("[data-add-current-fill]", currentPercent);
    setWidth("[data-add-preview-fill]", previewPercent);
    const buttonLabel = rule.inputMethod === "toggle"
      ? (amount > 0 ? `Add ${rule.label}${isRuleSynced(rule) ? " adjustment" : ""}` : "Choose completion")
      : `Add ${formatValue(amount)} ${rule.unit} ${rule.label}${isRuleSynced(rule) ? " adjustment" : ""}`;
    setText("[data-add-entry-button-label]", buttonLabel);
  }

  function addDailyEntryFromDraft() {
    const context = getActiveScoreContext();
    const system = context.system;
    if (!system) return;
    const rule = system.rules.map(scoring.normalizeRule).find((item) => item.id === addEntryDraft.ruleId);
    if (!rule) return;
    if (isRuleSynced(rule) && rule.allowManualOverride === false) {
      showToast("Manual adjustment is off for this rule");
      return;
    }
    const amount = normalizeAddEntryAmount(addEntryDraft.amount, rule);
    if (!amount) {
      showToast("Choose an amount to add");
      return;
    }
    if (context.type === "community") {
      addCommunityEntry(context.community.id, "me", rule, amount, isRuleSynced(rule) ? "manual-adjustment" : "manual");
      saveCommunitySummaryForMember(context.community, "me");
    } else {
      const dateKey = getTodayKey();
      state.quickEntries = state.quickEntries || [];
      state.quickEntries.push({
        id: makeId("quick"),
        date: dateKey,
        dateKey,
        createdAt: new Date().toISOString(),
        systemId: system.id,
        rewardSystemId: system.id,
        ruleId: rule.id,
        label: rule.label,
        unit: rule.unit,
        amount,
        source: isRuleSynced(rule) ? "manual-adjustment" : "manual"
      });
      syncDraftInputsFromEntries(system);
      autoSaveToday(system);
    }
    addEntryDraft = { ruleId: rule.id, amount: suggestedEntryAmount(rule) };
    state.activeView = "dashboard";
    saveState();
    render();
    showToast("Entry added");
  }

  function normalizeAddEntryAmount(value, rule) {
    if (rule.inputMethod === "toggle") return Number(value) > 0 ? 1 : 0;
    const settings = entrySliderSettings(rule);
    return clampToRange(numberOrDefault(value, suggestedEntryAmount(rule)), settings.min, settings.max);
  }

  function suggestedEntryAmount(rule) {
    if (rule.inputMethod === "toggle") return 1;
    const text = `${rule.label} ${rule.unit}`.toLowerCase();
    if (text.includes("step")) return 5000;
    if (text.includes("sleep")) return 8;
    if (text.includes("protein")) return 40;
    if (text.includes("carb")) return 40;
    if (text.includes("fat")) return 20;
    if (text.includes("calorie")) return 500;
    if (text.includes("spend") || text.includes("budget") || text.includes("dollar")) return 25;
    if (text.includes("minute") || text.includes("lifting") || text.includes("lift") || text.includes("study")) return 30;
    return Math.max(numberOrDefault(rule.everyAmount, 0), numberOrDefault(rule.inputStep, 1), 1);
  }

  function entrySliderSettings(rule) {
    const text = `${rule.label} ${rule.unit}`.toLowerCase();
    if (rule.inputMethod === "toggle") return { min: 0, max: 1, step: 1 };
    if (text.includes("step")) return { min: 0, max: 30000, step: 500 };
    if (text.includes("sleep")) return { min: 0, max: 12, step: 0.25 };
    if (text.includes("protein")) return { min: 0, max: 250, step: 5 };
    if (text.includes("carb")) return { min: 0, max: 500, step: 5 };
    if (text.includes("fat")) return { min: 0, max: 200, step: 5 };
    if (text.includes("calorie")) return { min: 0, max: 5000, step: 50 };
    if (text.includes("lifting") || text.includes("lift") || text.includes("study") || text.includes("minute")) {
      return { min: 0, max: 300, step: 5 };
    }
    if (text.includes("spend") || text.includes("budget") || text.includes("dollar")) return { min: 0, max: 500, step: 1 };
    return {
      min: numberOrDefault(rule.inputMin, 0),
      max: Math.max(numberOrDefault(rule.inputMax, 0), numberOrDefault(rule.dailyTarget, 0), 10),
      step: numberOrDefault(rule.inputStep, 1)
    };
  }

  function clampToRange(value, min, max) {
    return Math.min(Math.max(numberOrDefault(value, min), min), max);
  }

  function setDailyRuleValue(ruleId, value, sourceInput) {
    state.draftInputs[ruleId] = value;
    syncRuleInputs(ruleId, value, sourceInput);
    updateDashboardComputed();
    saveState();
  }

  function syncRuleInputs(ruleId, value, sourceInput) {
    Array.from(els.dailyInputList.querySelectorAll(`[data-input-rule="${cssEscape(ruleId)}"]`)).forEach((input) => {
      if (input === sourceInput) return;
      if (input.type === "checkbox") input.checked = value > 0;
      else input.value = value;
    });
  }

  function updateDashboardComputed() {
    const context = getActiveScoreContext();
    const system = context.system;
    if (!system) return;
    const values = collectDraftValues(system, valuesForScoreContext(context));
    const summary = calculateDashboardSummary(system, values, context);

    renderDailyTargetProgress(summary.total, summary.target.total);
    renderVisualBreakdown(summary.breakdown, summary.calculatedTotals, system, summary.target, summary.total);
    renderTopCardHighlights(summary.breakdown, summary.calculatedTotals, system, summary.target, summary.total);
    renderEntriesAddedSection(system, summary.breakdown, context);

    bindQuickEntryDeletes();
  }

  function calculateDashboardSummary(system, values, context = null) {
    const normalizedSystem = {
      ...system,
      rules: system.rules.map(scoring.normalizeRule),
      calculatedTotals: normalizeCalculatedTotals(system.calculatedTotals)
    };
    const result = scoring.calculateSystem(normalizedSystem, values);
    const activeRuleIds = context?.type === "community"
      ? communityEntryRuleIdsForToday(context.community.id, "me")
      : entryRuleIdsForToday(normalizedSystem);
    const breakdown = result.breakdown.map((item) => activeRuleIds.has(item.rule.id) ? item : emptyRuleScore(item));
    const calculatedTotals = calculateCalculatedTotals(normalizedSystem, values);
    const calculatedPoints = calculatedTotals.reduce((sum, item) => sum + numberOrDefault(item.totalPoints, 0), 0);
    const total = roundScore(breakdown.reduce((sum, item) => sum + item.totalPoints, 0) + calculatedPoints);
    const target = calculateTargetSummary(normalizedSystem);
    const categories = calculateCategorySummaries(normalizedSystem, breakdown, calculatedTotals, target);
    return {
      breakdown,
      calculatedTotals,
      total,
      target,
      categories
    };
  }

  function entryRuleIdsForToday(system) {
    const systemId = typeof system === "string" ? system : system?.id;
    const ids = new Set(getQuickEntriesForToday(systemId).map((entry) => entry.ruleId));
    (system?.rules || []).map(scoring.normalizeRule).forEach((rule) => {
      if (syncedValueForRule(rule, { userId: "me", date: todayIso, scope: "personal" }) !== null) ids.add(rule.id);
    });
    return ids;
  }

  function communityEntryRuleIdsForToday(communityId, userId) {
    const ids = new Set(getCommunityEntriesForMemberToday(communityId, userId).map((entry) => entry.ruleId));
    const community = state.communities.find((item) => item.id === communityId);
    (community?.system?.rules || []).map(scoring.normalizeRule).forEach((rule) => {
      if (syncedValueForRule(rule, { userId, date: todayIso, scope: "community" }) !== null) ids.add(rule.id);
    });
    return ids;
  }

  function emptyRuleScore(item) {
    return {
      ...item,
      value: 0,
      totalPoints: 0,
      rewardPoints: 0,
      penaltyPoints: 0,
      score: 0,
      explanation: "No entries added yet.",
      detail: "No entries added yet."
    };
  }

  function calculateTargetSummary(system) {
    const ruleTargets = new Map();
    const categoryTargets = {};
    system.rules.map(scoring.normalizeRule).forEach((rule) => {
      const targetPoints = targetPointsForRule(rule);
      ruleTargets.set(rule.id, targetPoints);
      if (targetPoints > 0) {
        categoryTargets[rule.category] = roundScore(numberOrDefault(categoryTargets[rule.category], 0) + targetPoints);
      }
    });
    normalizeCalculatedTotals(system.calculatedTotals).forEach((total) => {
      if (!total.trackingOnly && total.goalPoints > 0) {
        categoryTargets["Calculated totals"] = roundScore(numberOrDefault(categoryTargets["Calculated totals"], 0) + total.goalPoints);
      }
    });
    const total = roundScore(Object.values(categoryTargets).reduce((sum, value) => sum + value, 0));
    return { total, ruleTargets, categoryTargets };
  }

  function targetPointsForRule(ruleInput) {
    const rule = scoring.normalizeRule(ruleInput);
    if (rule.simpleStyle === "penalty") return Math.max(0, numberOrDefault(rule.goalPoints, 0));
    const targetValue = rule.simpleStyle === "yesNo" ? 1 : numberOrDefault(rule.dailyTarget, 0);
    const result = scoring.calculateRule(rule, targetValue);
    return Math.max(0, numberOrDefault(result.rewardPoints, 0));
  }

  function calculateCategorySummaries(system, breakdown, calculatedTotals, targetSummary) {
    const categoriesByName = {};
    Object.entries(targetSummary.categoryTargets).forEach(([name, target]) => {
      categoriesByName[name] = { name, target, earned: 0 };
    });
    breakdown.forEach((item) => {
      const name = item.rule.category || "Personal habits";
      if (!categoriesByName[name]) {
        categoriesByName[name] = { name, target: 0, earned: 0 };
      }
      categoriesByName[name].earned = roundScore(categoriesByName[name].earned + item.totalPoints);
    });
    calculatedTotals.forEach((total) => {
      if (!total.trackingOnly && total.goalPoints > 0) {
        const name = "Calculated totals";
        if (!categoriesByName[name]) {
          categoriesByName[name] = { name, target: 0, earned: 0 };
        }
        categoriesByName[name].earned = roundScore(categoriesByName[name].earned + total.totalPoints);
      }
    });
    return Object.values(categoriesByName)
      .filter((item) => item.target > 0 || item.earned !== 0)
      .sort((a, b) => b.target - a.target || a.name.localeCompare(b.name));
  }

  function topCardOptionList() {
    return [
      { id: "points-by-rule", label: "Points by Rule" },
      { id: "goal-completion", label: "Goal Completion by Rule" }
    ];
  }

  function defaultTopCardPreferences(system) {
    return system.rules.length ? ["points-by-rule", "goal-completion"] : [];
  }

  function getTopCardPreferences(system) {
    return sanitizeTopCardBlocks(system, rawTopCardPreferenceSource(system));
  }

  function rawTopCardPreferenceSource(system) {
    const hasSaved = state.topCardPreferences
      && Object.prototype.hasOwnProperty.call(state.topCardPreferences, system.id);
    return hasSaved ? state.topCardPreferences[system.id] : defaultTopCardPreferences(system);
  }

  function sanitizeTopCardBlocks(system, source) {
    const validIds = new Set(topCardOptionList().map((option) => option.id));
    const seen = new Set();
    return (Array.isArray(source) ? source : [])
      .filter((id) => validIds.has(id))
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }

  function renderCustomizeTopCardView(system) {
    if (!els.customizeTopCardView) return;
    if (!topCardDraftBlocks || state.activeView !== "customize-top-card") {
      topCardDraftBlocks = [...getTopCardPreferences(system)];
    }
    topCardDraftBlocks = sanitizeTopCardBlocks(system, topCardDraftBlocks);
    const options = topCardOptionList();
    els.topCardBlockCount.textContent = plural(topCardDraftBlocks.length, "block");
    els.topCardBlockList.innerHTML = topCardDraftBlocks.length
      ? topCardDraftBlocks.map((blockId, index) => renderTopCardBuilderRow(blockId, index, topCardDraftBlocks.length)).join("")
      : `<div class="empty-mini">Add a block to show rule visuals on Score Today.</div>`;
    els.availableTopCardBlocks.innerHTML = options.map((option) => {
      const alreadyAdded = topCardDraftBlocks.includes(option.id);
      return `
        <button class="available-block-button" type="button" data-add-top-card-block="${escapeHtml(option.id)}"${alreadyAdded ? " disabled" : ""}>
          <strong>${escapeHtml(option.label)}</strong>
          <span>${alreadyAdded ? "Already added" : "Add block"}</span>
        </button>
      `;
    }).join("");

    Array.from(els.topCardBlockList.querySelectorAll("[data-delete-top-card-block]")).forEach((button) => {
      button.addEventListener("click", () => deleteTopCardDraftBlock(Number(button.dataset.deleteTopCardBlock)));
    });
    Array.from(els.topCardBlockList.querySelectorAll("[data-move-top-card-block]")).forEach((button) => {
      button.addEventListener("click", () => moveTopCardDraftBlock(Number(button.dataset.moveTopCardBlock), Number(button.dataset.moveDirection)));
    });
    Array.from(els.availableTopCardBlocks.querySelectorAll("[data-add-top-card-block]")).forEach((button) => {
      button.addEventListener("click", () => addTopCardDraftBlock(button.dataset.addTopCardBlock));
    });
  }

  function renderTopCardBuilderRow(blockId, index, total) {
    return `
      <div class="top-card-builder-row">
        <div class="top-card-builder-main">
          <span>${index + 1}</span>
          <strong>${escapeHtml(topCardBlockLabel(blockId))}</strong>
        </div>
        <div class="inline-actions">
          <button class="ghost-button small" type="button" data-move-top-card-block="${index}" data-move-direction="-1"${index === 0 ? " disabled" : ""}>Move Up</button>
          <button class="ghost-button small" type="button" data-move-top-card-block="${index}" data-move-direction="1"${index === total - 1 ? " disabled" : ""}>Move Down</button>
          <button class="danger-button small" type="button" data-delete-top-card-block="${index}">Delete</button>
        </div>
      </div>
    `;
  }

  function addTopCardDraftBlock(blockId) {
    const system = getTrackerSystem();
    if (!system) return;
    const validIds = new Set(topCardOptionList().map((option) => option.id));
    if (!validIds.has(blockId)) return;
    topCardDraftBlocks = sanitizeTopCardBlocks(system, topCardDraftBlocks || []);
    if (!topCardDraftBlocks.includes(blockId)) topCardDraftBlocks.push(blockId);
    renderCustomizeTopCardView(system);
  }

  function deleteTopCardDraftBlock(index) {
    const system = getTrackerSystem();
    if (!system) return;
    topCardDraftBlocks = sanitizeTopCardBlocks(system, topCardDraftBlocks || []);
    topCardDraftBlocks.splice(index, 1);
    renderCustomizeTopCardView(system);
  }

  function moveTopCardDraftBlock(index, direction) {
    const system = getTrackerSystem();
    if (!system) return;
    topCardDraftBlocks = sanitizeTopCardBlocks(system, topCardDraftBlocks || []);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= topCardDraftBlocks.length) return;
    const [item] = topCardDraftBlocks.splice(index, 1);
    topCardDraftBlocks.splice(nextIndex, 0, item);
    renderCustomizeTopCardView(system);
  }

  function topCardBlockLabel(blockId) {
    return topCardOptionList().find((option) => option.id === blockId)?.label || "Top card block";
  }

  function renderTopCardHighlights(breakdown, calculatedTotals, system, targetSummary, dailyTotal) {
    const preferences = getTopCardPreferences(system);
    const blocks = preferences.map((blockId) => renderTopCardBlock(blockId, breakdown, targetSummary)).filter(Boolean);
    els.categoryProgressList.innerHTML = blocks.length
      ? blocks.join("")
      : `<div class="empty-mini">Use Customize Top Card to add rule visuals.</div>`;
  }

  function renderTopCardBlock(blockId, breakdown, targetSummary) {
    if (blockId === "points-by-rule") {
      const rows = breakdown.slice(0, 4).map((item) => {
        const possiblePoints = numberOrDefault(targetSummary.ruleTargets?.get(item.rule.id), targetPointsForRule(item.rule));
        const percent = progressPercent(Math.max(0, item.totalPoints), possiblePoints);
        return renderTopCardHighlightRow({
          label: item.rule.label,
          detail: `${formatPoints(item.totalPoints)} / ${formatPoints(possiblePoints)} points`,
          percent
        });
      }).join("");
      return `
        <article class="top-rule-block">
          <div class="top-rule-block-heading">
            <h4>Points by Rule</h4>
            <span>Points</span>
          </div>
          <div class="top-rule-row-list">${rows}</div>
        </article>
      `;
    }
    if (blockId === "goal-completion") {
      const rows = breakdown.slice(0, 4).map((item) => renderTopCardRuleProgress(item.rule, item.value)).join("");
      return `
        <article class="top-rule-block">
          <div class="top-rule-block-heading">
            <h4>Goal Completion by Rule</h4>
            <span>Progress</span>
          </div>
          <div class="top-rule-row-list">${rows}</div>
        </article>
      `;
    }
    return "";
  }

  function weeklyChartMetricOptions(system) {
    const rules = (system.rules || []).map(scoring.normalizeRule).map((item) => ({
      id: `rule:${item.id}`,
      label: item.label,
      unit: item.unit || "units",
      type: "rule",
      sourceId: item.id
    }));
    const totals = normalizeCalculatedTotals(system.calculatedTotals).map((item) => ({
      id: `total:${item.id}`,
      label: item.name,
      unit: item.unit || "units",
      type: "total",
      sourceId: item.id
    }));
    return [
      { id: "points", label: "Daily Point Total", unit: "points", type: "points" },
      ...rules,
      ...totals
    ];
  }

  function defaultWeeklyChartPreferences() {
    return [{ id: "weekly-points", metricId: "points" }];
  }

  function getWeeklyChartPreferences(system) {
    return sanitizeWeeklyChartBlocks(system, rawWeeklyChartPreferenceSource(system));
  }

  function rawWeeklyChartPreferenceSource(system) {
    const hasSaved = state.weeklyChartPreferences
      && Object.prototype.hasOwnProperty.call(state.weeklyChartPreferences, system.id);
    return hasSaved ? state.weeklyChartPreferences[system.id] : defaultWeeklyChartPreferences(system);
  }

  function sanitizeWeeklyChartBlocks(system, source) {
    const validMetrics = new Set(weeklyChartMetricOptions(system).map((option) => option.id));
    return (Array.isArray(source) ? source : [])
      .map((item) => {
        if (typeof item === "string") return { id: makeId("chart"), metricId: item };
        return {
          id: item?.id || makeId("chart"),
          metricId: item?.metricId || "points"
        };
      })
      .filter((item) => validMetrics.has(item.metricId));
  }

  function cloneChartBlocks(blocks) {
    return blocks.map((item) => ({ ...item }));
  }

  function renderWeeklyProgress(system) {
    const blocks = getWeeklyChartPreferences(system);
    els.weeklyChartCount.textContent = plural(blocks.length, "chart");
    els.weeklyChartList.innerHTML = blocks.length
      ? blocks.map((block) => renderWeeklyChartCard(system, block)).join("")
      : emptyState("Use Customize Charts to add weekly progress charts.");
  }

  function renderWeeklyChartCard(system, block) {
    const metric = weeklyChartMetricOptions(system).find((option) => option.id === block.metricId)
      || weeklyChartMetricOptions(system)[0];
    const days = currentWeekDateKeys();
    const values = days.map((date) => metricValueForDate(system, metric, date));
    const max = Math.max(...values.map((value) => Math.abs(value)), 1);
    const total = values.reduce((sum, value) => sum + value, 0);
    const average = total / values.length;
    const bars = days.map((date, index) => renderWeeklyChartBar(date, values[index], max, metric)).join("");
    return `
      <article class="weekly-chart-card">
        <div class="weekly-chart-card-heading">
          <div>
            <h4>${escapeHtml(metric.label)}</h4>
            <span>${escapeHtml(metric.unit)} by day</span>
          </div>
          <strong>${escapeHtml(formatMetricValue(total, metric))}</strong>
        </div>
        <div class="weekly-chart" aria-label="${escapeHtml(metric.label)} by day">${bars}</div>
        <div class="weekly-chart-summary">
          <span>Total ${escapeHtml(formatMetricValue(total, metric))}</span>
          <span>Avg ${escapeHtml(formatMetricValue(average, metric))}</span>
        </div>
      </article>
    `;
  }

  function renderWeeklyChartBar(date, value, max, metric) {
    const height = Math.max(Math.abs(value) / max * 100, value === 0 ? 3 : 8);
    const tone = value >= 0 ? "positive" : "negative";
    return `
      <div class="chart-day">
        <div class="chart-bar-wrap">
          <div class="chart-bar ${tone}" style="height:${height}%"></div>
        </div>
        <strong>${escapeHtml(formatMetricValue(value, metric, { compact: true }))}</strong>
        <span>${escapeHtml(formatWeekday(date))}</span>
      </div>
    `;
  }

  function metricValueForDate(system, metric, date) {
    const entry = findEntry(date, system.id);
    if (metric.type === "points") return numberOrDefault(entry?.total, 0);
    if (metric.type === "rule") return numberOrDefault(entry?.values?.[metric.sourceId], 0);
    if (metric.type === "total") {
      const totals = calculateCalculatedTotals(system, entry?.values || {});
      const total = totals.find((item) => item.id === metric.sourceId);
      return numberOrDefault(total?.value, 0);
    }
    return 0;
  }

  function formatMetricValue(value, metric, options = {}) {
    const formatted = formatValue(value);
    if (metric.type === "points") return options.compact ? formatted : `${formatted} points`;
    if (options.compact) return formatted;
    return `${formatted} ${metric.unit}`;
  }

  function renderCustomizeChartsView(system) {
    if (!els.customizeChartsView) return;
    if (!weeklyChartDraftBlocks || state.activeView !== "customize-charts") {
      weeklyChartDraftBlocks = cloneChartBlocks(getWeeklyChartPreferences(system));
    }
    weeklyChartDraftBlocks = sanitizeWeeklyChartBlocks(system, weeklyChartDraftBlocks);
    const metrics = weeklyChartMetricOptions(system);
    els.chartBlockCount.textContent = plural(weeklyChartDraftBlocks.length, "chart");
    els.chartBlockList.innerHTML = weeklyChartDraftBlocks.length
      ? weeklyChartDraftBlocks.map((block, index) => renderWeeklyChartBuilderRow(block, index, weeklyChartDraftBlocks.length, metrics)).join("")
      : `<div class="empty-mini">Add a chart to show weekly trends on Score Today.</div>`;
    els.availableChartMetricSelect.innerHTML = metrics.map((metric) => `
      <option value="${escapeHtml(metric.id)}">${escapeHtml(metric.label)}</option>
    `).join("");

    Array.from(els.chartBlockList.querySelectorAll("[data-chart-metric-index]")).forEach((select) => {
      select.addEventListener("change", () => updateWeeklyChartDraftMetric(Number(select.dataset.chartMetricIndex), select.value));
    });
    Array.from(els.chartBlockList.querySelectorAll("[data-delete-chart-block]")).forEach((button) => {
      button.addEventListener("click", () => deleteWeeklyChartDraftBlock(Number(button.dataset.deleteChartBlock)));
    });
    Array.from(els.chartBlockList.querySelectorAll("[data-move-chart-block]")).forEach((button) => {
      button.addEventListener("click", () => moveWeeklyChartDraftBlock(Number(button.dataset.moveChartBlock), Number(button.dataset.moveDirection)));
    });
  }

  function renderWeeklyChartBuilderRow(block, index, total, metrics) {
    const options = metrics.map((metric) => `
      <option value="${escapeHtml(metric.id)}"${metric.id === block.metricId ? " selected" : ""}>${escapeHtml(metric.label)}</option>
    `).join("");
    return `
      <div class="chart-builder-row">
        <div class="chart-builder-main">
          <span>${index + 1}</span>
          <label>
            <span>Metric</span>
            <select data-chart-metric-index="${index}">${options}</select>
          </label>
        </div>
        <div class="inline-actions">
          <button class="ghost-button small" type="button" data-move-chart-block="${index}" data-move-direction="-1"${index === 0 ? " disabled" : ""}>Move Up</button>
          <button class="ghost-button small" type="button" data-move-chart-block="${index}" data-move-direction="1"${index === total - 1 ? " disabled" : ""}>Move Down</button>
          <button class="danger-button small" type="button" data-delete-chart-block="${index}">Delete</button>
        </div>
      </div>
    `;
  }

  function addWeeklyChartDraftBlock() {
    const system = getTrackerSystem();
    if (!system) return;
    weeklyChartDraftBlocks = sanitizeWeeklyChartBlocks(system, weeklyChartDraftBlocks || []);
    weeklyChartDraftBlocks.push({
      id: makeId("chart"),
      metricId: els.availableChartMetricSelect.value || "points"
    });
    renderCustomizeChartsView(system);
  }

  function updateWeeklyChartDraftMetric(index, metricId) {
    const system = getTrackerSystem();
    if (!system) return;
    weeklyChartDraftBlocks = sanitizeWeeklyChartBlocks(system, weeklyChartDraftBlocks || []);
    if (!weeklyChartDraftBlocks[index]) return;
    weeklyChartDraftBlocks[index].metricId = metricId;
    weeklyChartDraftBlocks = sanitizeWeeklyChartBlocks(system, weeklyChartDraftBlocks);
    renderCustomizeChartsView(system);
  }

  function deleteWeeklyChartDraftBlock(index) {
    const system = getTrackerSystem();
    if (!system) return;
    weeklyChartDraftBlocks = sanitizeWeeklyChartBlocks(system, weeklyChartDraftBlocks || []);
    weeklyChartDraftBlocks.splice(index, 1);
    renderCustomizeChartsView(system);
  }

  function moveWeeklyChartDraftBlock(index, direction) {
    const system = getTrackerSystem();
    if (!system) return;
    weeklyChartDraftBlocks = sanitizeWeeklyChartBlocks(system, weeklyChartDraftBlocks || []);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= weeklyChartDraftBlocks.length) return;
    const [item] = weeklyChartDraftBlocks.splice(index, 1);
    weeklyChartDraftBlocks.splice(nextIndex, 0, item);
    renderCustomizeChartsView(system);
  }

  function renderTopCardHighlightRow({ label, detail, percent }) {
    return `
      <div class="top-rule-row">
        <div class="rule-mini-main">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
        <div class="rule-mini-track" aria-hidden="true">
          <div class="rule-mini-fill${percent > 100 ? " over-goal" : ""}" style="width:${Math.min(percent, 100)}%"></div>
        </div>
      </div>
    `;
  }

  function renderTopCardRuleProgress(rule, value) {
    const goal = goalAmountForRule(rule);
    const percent = progressPercent(value, goal);
    return renderTopCardHighlightRow({
      label: rule.label,
      detail: `${formatValue(value)} / ${formatValue(goal || 0)} ${rule.unit} · ${formatPercent(percent)}`,
      percent
    });
  }

  function renderVisualBreakdown(breakdown, calculatedTotals, system) {
    const goalRows = [
      ...breakdown.map(renderGoalCompletionVisualRow),
      ...calculatedTotals.map(renderCalculatedGoalCompletionVisualRow)
    ];

    els.ruleProgressList.innerHTML = `
      <div class="visual-breakdown-grid">
        <section class="visual-card points-donut-card" aria-label="Points by rule">
          <div class="visual-card-heading">
            <h4>Points by Rule</h4>
            <span>Contribution share</span>
          </div>
          ${renderPointsDonut(breakdown, calculatedTotals)}
        </section>
        <section class="visual-card" aria-label="Goal completion">
          <div class="visual-card-heading">
            <h4>Goal Completion</h4>
            <span>Progress rings</span>
          </div>
          <div class="goal-ring-grid">
            ${goalRows.length ? goalRows.join("") : `<div class="empty-mini">Add rules to see completion.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function renderPointsDonut(breakdown, calculatedTotals) {
    const colorPalette = ["#266b5e", "#355d91", "#bb6a2f", "#7a4b86", "#a73c36", "#5f7f48", "#2f6f88"];
    const items = [
      ...breakdown.map((item) => ({
        label: item.rule.label,
        points: numberOrDefault(item.totalPoints, 0)
      })),
      ...calculatedTotals
        .filter((item) => !item.trackingOnly || item.totalPoints !== 0)
        .map((item) => ({
          label: item.name,
          points: numberOrDefault(item.totalPoints, 0)
        }))
    ];
    const weighted = items.map((item) => ({
      ...item,
      weight: Math.abs(item.points)
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const totalPoints = items.reduce((sum, item) => sum + item.points, 0);

    if (!items.length) {
      return `<div class="empty-mini">Add rules to see points by rule.</div>`;
    }

    let cursor = 0;
    const segments = totalWeight > 0
      ? weighted.map((item, index) => {
          const start = cursor;
          const end = cursor + (item.weight / totalWeight * 100);
          cursor = end;
          return `${colorPalette[index % colorPalette.length]} ${start}% ${end}%`;
        }).join(", ")
      : "#dce3dc 0% 100%";

    const legendRows = items.slice(0, 6).map((item, index) => `
      <div class="donut-legend-row">
        <span class="donut-dot" style="background:${colorPalette[index % colorPalette.length]}"></span>
        <strong>${escapeHtml(item.label)}</strong>
        <em>${escapeHtml(formatSigned(item.points))}</em>
      </div>
    `).join("");

    return `
      <div class="points-donut-layout">
        <div class="points-donut" style="background:conic-gradient(${segments})" aria-hidden="true">
          <div class="points-donut-center">
            <strong>${escapeHtml(formatPoints(totalPoints))}</strong>
            <span>points</span>
          </div>
        </div>
        <div class="donut-legend">
          ${legendRows}
        </div>
      </div>
    `;
  }

  function renderGoalCompletionVisualRow(item) {
    const rule = item.rule;
    const goal = goalAmountForRule(rule);
    const percent = progressPercent(item.value, goal);
    const sourceLabel = shortRuleValueSourceLabel(rule);
    return `
      <div class="goal-ring-card">
        ${renderProgressRing(percent)}
        <div class="goal-ring-main">
          <strong>${escapeHtml(rule.label)}</strong>
          <span>${escapeHtml(formatValue(item.value))} / ${escapeHtml(formatValue(goal || 0))} ${escapeHtml(rule.unit)} · ${escapeHtml(formatPercent(percent))} · ${escapeHtml(sourceLabel)}</span>
        </div>
      </div>
    `;
  }

  function renderCalculatedGoalCompletionVisualRow(total) {
    const percent = progressPercent(total.value, total.goal);
    return `
      <div class="goal-ring-card">
        ${renderProgressRing(percent)}
        <div class="goal-ring-main">
          <strong>${escapeHtml(total.name)}</strong>
          <span>${escapeHtml(formatValue(total.value))} / ${escapeHtml(formatValue(total.goal))} ${escapeHtml(total.unit)} · ${escapeHtml(formatPercent(percent))}</span>
        </div>
      </div>
    `;
  }

  function renderProgressRing(percent) {
    const safePercent = Math.min(Math.max(numberOrDefault(percent, 0), 0), 100);
    return `
      <div class="progress-ring${percent > 100 ? " over-goal" : ""}" style="--ring-progress:${safePercent}%">
        <span>${escapeHtml(formatPercent(percent))}</span>
      </div>
    `;
  }

  function renderPointsByRuleRow(item, maxPoints) {
    const points = numberOrDefault(item.totalPoints, 0);
    const tone = points < 0 ? "negative" : "positive";
    const width = Math.min(Math.abs(points) / maxPoints * 100, 100);
    return `
      <div class="visual-row">
        <div class="visual-row-main">
          <strong>${escapeHtml(item.rule.label)}</strong>
          <span>${escapeHtml(pointEarnedText(points))}</span>
        </div>
        <div class="visual-bar-track" aria-hidden="true">
          <div class="visual-bar-fill ${tone}" style="width:${width}%"></div>
        </div>
      </div>
    `;
  }

  function renderCalculatedPointsRow(total, maxPoints) {
    const points = numberOrDefault(total.totalPoints, 0);
    const tone = points < 0 ? "negative" : "positive";
    const width = Math.min(Math.abs(points) / maxPoints * 100, 100);
    return `
      <div class="visual-row">
        <div class="visual-row-main">
          <strong>${escapeHtml(total.name)}</strong>
          <span>${escapeHtml(total.trackingOnly ? "Tracking only" : pointEarnedText(points))}</span>
        </div>
        <div class="visual-bar-track" aria-hidden="true">
          <div class="visual-bar-fill ${tone}" style="width:${width}%"></div>
        </div>
      </div>
    `;
  }

  function renderEntriesSummaryRows(system) {
    const entries = getQuickEntriesForToday(system.id);
    if (!entries.length) return "";
    const ruleMap = new Map(system.rules.map((item) => {
      const rule = scoring.normalizeRule(item);
      return [rule.id, rule];
    }));
    const grouped = new Map();
    entries.forEach((entry) => {
      const existing = grouped.get(entry.ruleId) || { count: 0, total: 0 };
      existing.count += 1;
      existing.total += numberOrDefault(entry.amount, 0);
      grouped.set(entry.ruleId, existing);
    });
    return Array.from(grouped.entries()).map(([ruleId, summary]) => {
      const rule = ruleMap.get(ruleId);
      const label = rule?.label || "Entry";
      const unit = rule?.unit || "units";
      const goal = rule ? goalAmountForRule(rule) : 0;
      const percent = progressPercent(summary.total, goal);
      return `
        <div class="visual-row compact">
          <div class="visual-row-main">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(plural(summary.count, "entry"))} · ${escapeHtml(formatValue(summary.total))} ${escapeHtml(unit)} · ${escapeHtml(formatPercent(percent))} complete</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderRuleProgress(breakdown, calculatedTotals, system) {
    const rows = [
      ...breakdown.map((item) => renderRuleProgressCard(item, system)),
      ...calculatedTotals.map(renderCalculatedRuleProgressCard)
    ];
    els.ruleProgressList.innerHTML = rows.length
      ? rows.join("")
      : `<div class="empty-mini">Add rules to see goal progress.</div>`;
  }

  function renderRuleProgressCard(item, system) {
    const rule = item.rule;
    const goal = goalAmountForRule(rule);
    const percent = progressPercent(item.value, goal);
    const progressLine = [
      `${formatValue(item.value)} / ${formatValue(goal || 0)} ${rule.unit}`,
      `${formatPercent(percent)} complete`,
      pointEarnedText(item.totalPoints),
      shortRuleValueSourceLabel(rule),
      percent > 100 ? "over goal" : ""
    ].filter(Boolean).join(" · ");
    return `
      <div class="rule-progress-card">
        <div class="rule-progress-main">
          <div class="rule-progress-metric">
            <strong>${escapeHtml(rule.label)}</strong>
            <span>${escapeHtml(progressLine)}</span>
          </div>
          <span class="rule-progress-percent">${escapeHtml(formatPercent(percent))}</span>
        </div>
        ${renderSegmentedProgressBar(rule, system, item.value)}
      </div>
    `;
  }

  function renderCalculatedRuleProgressCard(total) {
    const percent = progressPercent(total.value, total.goal);
    const pointsText = total.trackingOnly ? "Tracking only" : pointEarnedText(total.totalPoints);
    const progressLine = [
      `${formatValue(total.value)} / ${formatValue(total.goal)} ${total.unit}`,
      `${formatPercent(percent)} complete`,
      pointsText,
      percent > 100 ? "over goal" : ""
    ].filter(Boolean).join(" · ");
    return `
      <div class="rule-progress-card">
        <div class="rule-progress-main">
          <div class="rule-progress-metric">
            <strong>${escapeHtml(total.name)}</strong>
            <span>${escapeHtml(progressLine)}</span>
          </div>
          <span class="rule-progress-percent">${escapeHtml(formatPercent(percent))}</span>
        </div>
        <div class="mini-progress-track" aria-hidden="true">
          <div class="mini-progress-fill${percent > 100 ? " over-goal" : ""}" style="width:${Math.min(percent, 100)}%"></div>
        </div>
      </div>
    `;
  }

  function renderHeroRuleProgress(breakdown, ruleTargets) {
    els.categoryProgressList.innerHTML = breakdown.length
      ? breakdown.map((item) => {
          const rule = item.rule;
          const possiblePoints = numberOrDefault(ruleTargets?.get(rule.id), targetPointsForRule(rule));
          const pointsPercent = progressPercent(Math.max(0, item.totalPoints), possiblePoints);
          const pointWord = possiblePoints === 1 ? "point" : "points";
          const pointsLine = `${formatPoints(item.totalPoints)} / ${formatPoints(possiblePoints)} ${pointWord} \u00b7 ${formatPercent(pointsPercent)} points`;
          return `
            <div class="rule-mini-row">
              <div class="rule-mini-main">
                <strong>${escapeHtml(rule.label)}</strong>
                <span>${escapeHtml(pointsLine)}</span>
              </div>
              <div class="rule-mini-track" aria-hidden="true">
                <div class="rule-mini-fill${pointsPercent > 100 ? " over-goal" : ""}" style="width:${Math.min(pointsPercent, 100)}%"></div>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="category-mini-empty">Add rules to see today’s rule progress.</div>`;
  }

  function renderSegmentedProgressBar(rule, system, value) {
    const entries = system ? getQuickEntriesForToday(system.id).filter((entry) => entry.ruleId === rule.id) : [];
    const goal = goalAmountForRule(rule);
    const rawPercent = progressPercent(value, goal);
    if (!entries.length || goal <= 0) {
      return `
        <div class="mini-progress-track" aria-hidden="true">
          <div class="mini-progress-fill${rawPercent > 100 ? " over-goal" : ""}" style="width:${Math.min(rawPercent, 100)}%"></div>
        </div>
      `;
    }
    let running = 0;
    const markers = entries.map((entry) => {
      running += numberOrDefault(entry.amount, 0);
      const left = Math.min(Math.max(running / goal * 100, 0), 100);
      if (left <= 0) return "";
      return `<span class="mini-progress-marker" style="left:${left}%"></span>`;
    }).join("");
    return `
      <div class="mini-progress-track marker-progress-track${rawPercent > 100 ? " over-goal" : ""}" aria-hidden="true">
        <div class="mini-progress-fill${rawPercent > 100 ? " over-goal" : ""}" style="width:${Math.min(rawPercent, 100)}%"></div>
        ${markers}
      </div>
    `;
  }

  function renderEntriesAddedSection(system, breakdown, context = getActiveScoreContext()) {
    const manualEntries = context.type === "community"
      ? getCommunityEntriesForMemberToday(context.community.id, "me")
      : getQuickEntriesForToday(system.id);
    const entries = [
      ...syncedEntriesForContext(context, system),
      ...manualEntries
    ];
    const ruleMap = new Map(system.rules.map((item) => {
      const rule = scoring.normalizeRule(item);
      return [rule.id, rule];
    }));
    const body = entries.length
      ? entries.map((entry) => {
          const rule = ruleMap.get(entry.ruleId);
          return renderQuickEntryRow(entry, rule, context.type);
        }).join("")
      : `<div class="empty-mini">No entries added yet.</div>`;
    els.todaySavedLabel.textContent = plural(entries.length, "entry");
    els.scoreBreakdown.innerHTML = body;
  }

  function renderTotalsTodaySection(breakdown, calculatedTotals) {
    const rows = [
      ...breakdown.map(renderTotalTodayRow),
      ...calculatedTotals.map(renderCalculatedTotalRow)
    ];
    els.totalsTodayCount.textContent = plural(rows.length, "total");
    els.totalsTodayList.innerHTML = rows.length ? rows.join("") : `<div class="empty-mini">Totals will appear after you add rules.</div>`;
  }

  function renderPointsEarnedSection(breakdown, calculatedTotals, dailyTarget, dailyTotal) {
    const scoredCalculated = calculatedTotals.filter((item) => !item.trackingOnly || item.totalPoints !== 0);
    const rows = [
      ...breakdown.map((item) => renderBreakdownRow(item, dailyTarget)),
      ...scoredCalculated.map((item) => renderCalculatedBreakdownRow(item, dailyTarget)),
      renderDailyTotalBreakdown(dailyTotal, dailyTarget)
    ];
    els.pointsEarnedTotal.textContent = `${formatPoints(dailyTotal)} points`;
    els.pointsEarnedList.innerHTML = rows.join("");
  }

  function renderBreakdownSection(title, meta, body) {
    return `
      <section class="breakdown-section">
        <div class="breakdown-section-heading">
          <h4>${escapeHtml(title)}</h4>
          <span>${escapeHtml(meta)}</span>
        </div>
        <div class="breakdown-section-list">
          ${body}
        </div>
      </section>
    `;
  }

  function renderTotalTodayRow(item) {
    const rule = item.rule;
    const goal = rule.simpleStyle === "penalty" ? rule.minimumRequired : rule.dailyTarget;
    const percent = progressPercent(item.value, goal);
    const amountText = rule.simpleStyle === "penalty" && rule.penaltyDirection === "over"
      ? `${formatValue(item.value)} / ${formatValue(goal || 0)} ${rule.unit} limit`
      : `${formatValue(item.value)} / ${formatValue(goal || 0)} ${rule.unit}`;
    return `
      <div class="breakdown-row">
        <div class="breakdown-main">
          <strong>${escapeHtml(rule.label)}</strong>
          <span>${escapeHtml(amountText)}</span>
          <span>${escapeHtml(formatPercent(percent))} complete${percent > 100 ? " · over goal" : ""}</span>
          <div class="mini-progress-track" aria-hidden="true">
            <div class="mini-progress-fill${percent > 100 ? " over-goal" : ""}" style="width:${Math.min(percent, 140)}%"></div>
          </div>
        </div>
        <span class="tracking-pill">${escapeHtml(formatValue(item.value))} ${escapeHtml(rule.unit)}</span>
      </div>
    `;
  }

  function renderCalculatedTotalRow(total) {
    const percent = progressPercent(total.value, total.goal);
    return `
      <div class="breakdown-row tracking-breakdown">
        <div class="breakdown-main">
          <strong>${escapeHtml(total.name)}</strong>
          <span>${escapeHtml(formatValue(total.value))} / ${escapeHtml(formatValue(total.goal))} ${escapeHtml(total.unit)}</span>
          <span>${escapeHtml(formatPercent(percent))} complete${percent > 100 ? " · over goal" : ""}</span>
          <span>${escapeHtml(total.explanation)}</span>
          <div class="mini-progress-track" aria-hidden="true">
            <div class="mini-progress-fill${percent > 100 ? " over-goal" : ""}" style="width:${Math.min(percent, 140)}%"></div>
          </div>
        </div>
        <span class="tracking-pill">${total.trackingOnly ? "Tracking only" : `${formatSigned(total.totalPoints)} points`}</span>
      </div>
    `;
  }

  function updateRuleProgressCard(item) {
    const rule = item.rule;
    const percent = progressPercent(item.value, rule.simpleStyle === "penalty" ? rule.minimumRequired : rule.dailyTarget);
    setText(`[data-rule-goal-text="${cssEscape(rule.id)}"]`, progressText(rule, item.value));
    setText(`[data-rule-progress-text="${cssEscape(rule.id)}"]`, progressPercentText(rule, item.value, percent));
    setText(`[data-rule-points="${cssEscape(rule.id)}"]`, `Points from this rule today: ${formatSigned(item.totalPoints)}`);
    setWidth(`[data-rule-progress-fill="${cssEscape(rule.id)}"]`, percent);
  }

  function updateCalculatedTotalCard(total) {
    const percent = progressPercent(total.value, total.goal);
    setText(`[data-total-goal-text="${cssEscape(total.id)}"]`, `${formatValue(total.value)} / ${formatValue(total.goal)} ${total.unit}`);
    setText(`[data-total-progress-text="${cssEscape(total.id)}"]`, `${formatPercent(percent)} of goal${percent > 100 ? " · over goal" : ""}`);
    setText(`[data-total-value="${cssEscape(total.id)}"]`, `${formatValue(total.value)} ${total.unit}`);
    setWidth(`[data-total-progress-fill="${cssEscape(total.id)}"]`, percent);
  }

  function addQuickEntry(ruleId) {
    const input = els.dailyInputList.querySelector(`[data-quick-add-value="${cssEscape(ruleId)}"]`);
    const amount = numberOrDefault(input?.value, 0);
    if (!amount) return;
    const system = getTrackerSystem();
    const rule = system?.rules.find((item) => item.id === ruleId);
    const dateKey = getTodayKey();
    state.quickEntries.push({
      id: makeId("quick"),
      date: dateKey,
      dateKey,
      createdAt: new Date().toISOString(),
      systemId: system.id,
      rewardSystemId: system.id,
      ruleId,
      label: rule?.label || "Entry",
      unit: rule?.unit || "units",
      amount
    });
    if (input) input.value = "";
    syncDraftInputsFromEntries(system);
    autoSaveToday(system);
    saveState();
    renderDashboard();
  }

  function deleteQuickEntry(entryId) {
    const entry = state.quickEntries.find((item) => item.id === entryId);
    if (!entry) return;
    state.quickEntries = state.quickEntries.filter((item) => item.id !== entryId);
    const system = state.systems.find((item) => item.id === entrySystemId(entry)) || getTrackerSystem();
    if (system) {
      syncDraftInputsFromEntries(system);
      autoSaveToday(system);
    }
    saveState();
    renderDashboard();
  }

  function bindQuickEntryDeletes() {
    Array.from(els.scoreBreakdown.querySelectorAll("[data-delete-quick-entry]")).forEach((button) => {
      button.addEventListener("click", () => deleteQuickEntry(button.dataset.deleteQuickEntry));
    });
    Array.from(els.scoreBreakdown.querySelectorAll("[data-delete-community-entry]")).forEach((button) => {
      button.addEventListener("click", () => deleteCommunityEntry(button.dataset.deleteCommunityEntry));
    });
  }

  function renderBreakdownRow(item, dailyTarget) {
    const tone = item.score >= 0 ? "positive" : "negative";
    const rule = item.rule;
    const label = rule?.label || item.label;
    const goal = rule?.simpleStyle === "penalty" ? rule.minimumRequired : rule?.dailyTarget;
    const percent = progressPercent(item.value, goal);
    const percentText = progressPercentText(rule, item.value, percent);
    const amountText = rule?.simpleStyle === "penalty" && rule.penaltyDirection === "over"
      ? `Current: ${formatValue(item.value)} ${rule.unit}; limit: ${formatValue(goal || 0)} ${rule.unit}`
      : `${formatValue(item.value)} / ${formatValue(goal || 0)} ${rule?.unit || "units"}`;
    const contribution = pointContribution(item.totalPoints, dailyTarget);
    return `
      <div class="breakdown-row">
        <div class="breakdown-main">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(amountText)}</span>
          <span>${escapeHtml(percentText)}</span>
          <span>Rewards: ${escapeHtml(formatSigned(item.rewardPoints))} · Penalties: ${escapeHtml(formatSigned(item.penaltyPoints))}</span>
          <span>${escapeHtml(contribution)}</span>
          <span>${escapeHtml(item.explanation)}</span>
        </div>
        <span class="point-pill ${tone}">${formatSigned(item.score)}</span>
      </div>
    `;
  }

  function renderCalculatedBreakdownRow(total, dailyTarget) {
    const percent = progressPercent(total.value, total.goal);
    const tone = total.totalPoints >= 0 ? "positive" : "negative";
    return `
      <div class="breakdown-row tracking-breakdown">
        <div class="breakdown-main">
          <strong>${escapeHtml(total.name)}</strong>
          <span>${escapeHtml(formatValue(total.value))} / ${escapeHtml(formatValue(total.goal))} ${escapeHtml(total.unit)}</span>
          <span>${escapeHtml(formatPercent(percent))} of goal${percent > 100 ? " · over goal" : ""}</span>
          <span>${escapeHtml(pointContribution(total.totalPoints, dailyTarget))}</span>
          <span>${escapeHtml(total.explanation)}</span>
        </div>
        <span class="point-pill ${tone}">${formatSigned(total.totalPoints)}</span>
      </div>
    `;
  }

  function renderQuickEntryRow(entry, rule, source = "personal") {
    const text = entryLogText(entry, rule);
    const isReadOnly = entry.source === "synced" || entry.source === "calculated";
    const attr = source === "community"
      ? `data-delete-community-entry="${escapeHtml(entry.id)}"`
      : `data-delete-quick-entry="${escapeHtml(entry.id)}"`;
    const sourceLabel = entrySourceLabel(entry, rule);
    return `
      <div class="entry-log-row quick-entry-row">
        <div class="entry-log-main">
          <strong>${escapeHtml(text)}</strong>
          <span>${escapeHtml(sourceLabel)}</span>
        </div>
        ${isReadOnly ? `<span class="tracking-pill">${escapeHtml(entry.source === "calculated" ? "Calculated" : "Synced")}</span>` : `<button class="ghost-button small" type="button" ${attr}>Delete</button>`}
      </div>
    `;
  }

  function entrySourceLabel(entry, rule) {
    if (entry.source === "synced") {
      return `${dataSourceLabel(entry.dataSource || rule?.dataSource)} - ${sourceMetricLabel(entry.dataSource || rule?.dataSource, entry.sourceMetric || rule?.sourceMetric)}`;
    }
    if (entry.source === "calculated") {
      return `Calculated Total - ${sourceMetricLabel("calculated", entry.sourceMetric || rule?.sourceMetric)}`;
    }
    if (entry.source === "manual-adjustment") return "Manual adjustment";
    return "Manual";
  }

  function entryLogText(entry, rule) {
    const label = rule?.label || entry.label || "Entry";
    const unit = rule?.unit || entry.unit || "units";
    const amount = formatValue(entry.amount);
    if (rule?.inputMethod === "toggle" || unit === "done") return label;
    const compactUnits = new Set(["g", "mg", "kg", "oz", "lb"]);
    const valueText = compactUnits.has(String(unit).toLowerCase())
      ? `${amount}${unit}`
      : `${amount} ${unit}`;
    return `${valueText} ${label}`;
  }

  function goalAmountForRule(ruleInput) {
    const rule = scoring.normalizeRule(ruleInput);
    if (rule.simpleStyle === "yesNo") return 1;
    if (rule.simpleStyle === "penalty") return Math.max(numberOrDefault(rule.minimumRequired, 0), numberOrDefault(rule.dailyTarget, 0));
    return numberOrDefault(rule.dailyTarget, 0);
  }

  function renderDailyTotalBreakdown(total, target) {
    const percent = progressPercent(total, target);
    return `
      <div class="breakdown-row daily-total-row">
        <div class="breakdown-main">
          <strong>Daily Point Total</strong>
          <span>${escapeHtml(formatPoints(total))} / ${escapeHtml(formatPoints(target))} points</span>
          <span>${escapeHtml(formatPercent(percent))} complete</span>
        </div>
        <span class="point-pill positive">${formatPoints(total)}</span>
      </div>
    `;
  }

  function renderHistoryCard(entry) {
    const date = entry.dateKey || entry.date;
    return `
      <article class="history-card">
        <span>${escapeHtml(formatDate(date))}</span>
        <strong>${formatPoints(entry.total)}</strong>
      </article>
    `;
  }

  function renderDailyTargetProgress(total, dailyTarget) {
    const target = Math.max(numberOrDefault(dailyTarget, 0), 0);
    const percent = progressPercent(total, target);
    const remaining = Math.max(target - total, 0);
    els.liveScore.textContent = `${formatPoints(total)} / ${formatPoints(target)} points`;
    els.dailyTargetLabel.textContent = "Daily point target";
    els.dailyProgressLabel.textContent = `${formatPercent(percent)} complete`;
    els.dailyStatusLabel.textContent = target > 0
      ? (remaining > 0 ? `${formatPoints(remaining)} points left to hit today’s goal` : "Daily point goal reached")
      : "Add positive scoring rules to set a daily target";
    els.dailyStatusLabel.textContent = target > 0
      ? (remaining > 0 ? `${formatPoints(remaining)} points left today` : "Daily point target reached")
      : "Add positive scoring rules to set a daily target";
    setWidth("#dailyTargetFill", percent);
  }

  function renderWeeklyChart(systemId) {
    const system = state.systems.find((item) => item.id === systemId);
    const target = system ? calculateTargetSummary(system).total : 1;
    const days = Array.from({ length: 7 }, (_, index) => offsetDate(index - 6));
    const totals = days.map((date) => {
      const entry = state.entries.find((item) => (item.rewardSystemId || item.systemId) === systemId && (item.dateKey || item.date) === date);
      return entry?.total || 0;
    });
    const max = Math.max(...totals.map((value) => Math.abs(value)), target, 1);
    return days.map((date, index) => {
      const total = totals[index];
      const height = Math.max(Math.abs(total) / max * 100, total === 0 ? 3 : 8);
      const tone = total >= 0 ? "positive" : "negative";
      return `
        <div class="chart-day">
          <div class="chart-bar-wrap">
            <div class="chart-bar ${tone}" style="height:${height}%"></div>
          </div>
          <strong>${formatPoints(total)}</strong>
          <span>${escapeHtml(formatWeekday(date))}</span>
        </div>
      `;
    }).join("");
  }

  function renderSystemCard(system) {
    const active = system.id === state.selectedSystemId ? " active" : "";
    const title = system.title || "Untitled system";
    const category = system.category || "No category yet";
    return `
      <article class="system-card${active}" data-system-id="${escapeHtml(system.id)}">
        <div class="system-card-main">
          <strong>${escapeHtml(title)}</strong>
          <span class="system-meta">${escapeHtml(category)} · ${plural(system.rules.length, "rule")}</span>
        </div>
        <div class="system-card-actions">
          <span class="visibility-pill ${escapeHtml(system.visibility)}">${capitalize(system.visibility)}</span>
          <button class="secondary-button small" type="button" data-edit-system-id="${escapeHtml(system.id)}">Edit</button>
          <button class="danger-button small" type="button" data-delete-system-id="${escapeHtml(system.id)}">Delete</button>
        </div>
      </article>
    `;
  }

  function renderRuleRow(item, context) {
    item = scoring.normalizeRule(item);
    const actions = context === "personal"
      ? `<div class="rule-actions">
          <button class="ghost-button small" type="button" data-edit-rule-id="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.label)}">Edit</button>
          <button class="ghost-button small" type="button" data-delete-rule-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.label)}">Delete</button>
        </div>`
      : "";
    const summary = [...scoring.describeRule(item), ruleSourceSummary(item)];
    const primaryPoints = item.simpleStyle === "penalty" ? item.penaltyPoints : (item.simpleStyle === "yesNo" ? item.yesNoPoints : (item.goalPoints || item.everyPoints));
    const tone = primaryPoints >= 0 ? "positive" : "negative";
    return `
      <div class="rule-row">
        <div class="rule-main">
          <strong>${escapeHtml(item.label)}</strong>
          <div class="rule-summary-lines">
            ${summary.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
          </div>
        </div>
        <span class="point-pill ${tone}">${formatSigned(primaryPoints)}</span>
        ${actions}
      </div>
    `;
  }

  function renderCommunityRuleEditor(item) {
    item = scoring.normalizeRule(item);
    const points = item.simpleStyle === "penalty"
      ? item.penaltyPoints
      : (item.simpleStyle === "yesNo" ? item.yesNoPoints : item.everyPoints);
    const goal = item.simpleStyle === "penalty" ? item.minimumRequired : item.dailyTarget;
    return `
      <article class="community-rule-editor" data-community-rule-id="${escapeHtml(item.id)}">
        <div class="community-rule-editor-grid">
          <label>
            <span>Rule</span>
            <input data-community-rule-field="label" type="text" value="${escapeHtml(item.label)}">
          </label>
          <label>
            <span>Goal</span>
            <input data-community-rule-field="goal" type="number" step="${escapeHtml(String(item.inputStep || 1))}" value="${escapeHtml(String(goal || 0))}">
          </label>
          <label>
            <span>Unit</span>
            <input data-community-rule-field="unit" type="text" value="${escapeHtml(item.unit)}">
          </label>
          <label>
            <span>Points</span>
            <input data-community-rule-field="points" type="number" step="0.25" value="${escapeHtml(String(points || 0))}">
          </label>
          <label>
            <span>Data source</span>
            <select data-community-rule-field="dataSource">
              ${renderDataSourceOptionHtml(item.dataSource || "manual")}
            </select>
          </label>
          <label>
            <span>Metric</span>
            <select data-community-rule-field="sourceMetric">
              ${renderSourceMetricOptionHtml(item.dataSource || "manual", item.sourceMetric || "manual")}
            </select>
          </label>
        </div>
        <div class="community-rule-editor-actions">
          <button class="ghost-button small" type="button" data-edit-community-rule="${escapeHtml(item.id)}">Edit Rule</button>
          <button class="danger-button small" type="button" data-delete-community-rule="${escapeHtml(item.id)}">Delete Rule</button>
        </div>
      </article>
    `;
  }

  function bindCommunityRuleEditors() {
    Array.from(els.communityRules.querySelectorAll('[data-community-rule-field="dataSource"]')).forEach((select) => {
      select.addEventListener("change", () => {
        const row = select.closest("[data-community-rule-id]");
        const metricSelect = row?.querySelector('[data-community-rule-field="sourceMetric"]');
        if (!metricSelect) return;
        metricSelect.innerHTML = renderSourceMetricOptionHtml(select.value || "manual", "");
      });
    });
    Array.from(els.communityRules.querySelectorAll("[data-edit-community-rule]")).forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest("[data-community-rule-id]");
        row?.querySelector("input")?.focus();
      });
    });
    Array.from(els.communityRules.querySelectorAll("[data-delete-community-rule]")).forEach((button) => {
      button.addEventListener("click", () => deleteCommunityRule(button.dataset.deleteCommunityRule));
    });
  }

  function renderDiscoverCard(system) {
    const rules = system.rules.slice(0, 4).map((item) => `<li>${escapeHtml(ruleSentence(item))}</li>`).join("");
    return `
      <article class="discover-card">
        <header>
          <div class="avatar" aria-hidden="true" style="background:${avatarColor(system.ownerName)}">${getInitials(system.ownerName)}</div>
          <div class="discover-main">
            <strong>${escapeHtml(system.title)}</strong>
            <span class="system-meta">${escapeHtml(system.ownerName)} · ${escapeHtml(system.ownerHandle || "")}</span>
          </div>
        </header>
        <span class="category-pill">${escapeHtml(system.category)}</span>
        <p>${escapeHtml(system.description || "")}</p>
        <ul class="discover-rules">${rules}</ul>
        <button class="secondary-button" type="button" data-copy-public-id="${escapeHtml(system.id)}">
          <span aria-hidden="true">＋</span>
          <span>Copy system</span>
        </button>
      </article>
    `;
  }

  function renderCommunityCard(community) {
    const visibility = communityVisibility(community);
    const myScore = communityTotalForMember(community, "me", todayIso);
    return `
      <button class="community-card" type="button" data-community-id="${escapeHtml(community.id)}">
        <div class="community-card-main">
          <strong>${escapeHtml(community.name)}</strong>
          <span class="community-card-description">${escapeHtml(communityDescriptionLine(community))}</span>
          <span class="community-meta">${plural(getCommunityMemberCount(community), "member")} · ${escapeHtml(capitalize(visibility))}</span>
          <span class="community-score-line">My score today: ${escapeHtml(formatPoints(myScore))} points</span>
        </div>
        <span class="visibility-pill ${escapeHtml(visibility)}">${escapeHtml(capitalize(visibility))}</span>
      </button>
    `;
  }

  function communityDescriptionLine(community) {
    return community.description || community.category || "Community accountability";
  }

  function communityVisibility(community) {
    return community.visibility === "public" ? "public" : "private";
  }

  function isCommunityAdmin(community) {
    if (!community) return false;
    if ((community.ownerId || "me") === "me") return true;
    return Array.isArray(community.adminIds) && community.adminIds.includes("me");
  }

  function renderFindCommunityResult(community) {
    const joined = isCommunityJoined(community.id);
    const isPrivate = community.visibility === "private";
    const query = String(state.communitySearchQuery || "").trim().toLowerCase();
    const codeMatch = query && String(community.inviteCode || "").toLowerCase() === query;
    const actionLabel = joined ? "Joined" : (codeMatch ? "Join with Code" : (isPrivate ? "Request to Join" : "Join"));
    return `
      <article class="find-community-card">
        <div class="find-community-main">
          <strong>${escapeHtml(community.name)}</strong>
          <span class="community-meta">${escapeHtml(community.category)} · ${plural(getCommunityMemberCount(community), "member")}</span>
          <p>${escapeHtml(community.description || "")}</p>
        </div>
        <button class="${isPrivate ? "secondary-button" : "primary-button"} small" type="button" data-join-community-id="${escapeHtml(community.id)}"${joined ? " disabled" : ""}>${escapeHtml(actionLabel)}</button>
      </article>
    `;
  }

  function renderLeaderboardRow(memberStanding, index) {
    const isSelected = memberStanding.id === state.selectedCommunityMemberId;
    const progress = progressPercent(memberStanding.today, memberStanding.target || 1);
    return `
      <button class="member-row leaderboard-button${isSelected ? " active" : ""}" type="button" data-community-member-id="${escapeHtml(memberStanding.id)}" aria-pressed="${isSelected ? "true" : "false"}">
        <div class="member-left">
          <div class="member-avatar" aria-hidden="true" style="background:${escapeHtml(memberStanding.color)}">${getInitials(memberStanding.name)}</div>
          <div class="member-main">
            <strong>${index + 1}. ${escapeHtml(memberStanding.name)}</strong>
            <span>${escapeHtml(memberStanding.handle)}</span>
            <div class="mini-progress-track leaderboard-progress" aria-hidden="true">
              <div class="mini-progress-fill${progress > 100 ? " over-goal" : ""}" style="width:${Math.min(progress, 100)}%"></div>
            </div>
          </div>
        </div>
        <div class="member-score">
          ${formatPoints(memberStanding.today)}
          <span>points today</span>
        </div>
      </button>
    `;
  }

  function bindLeaderboardRows() {
    Array.from(els.leaderboardList.querySelectorAll("[data-community-member-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        openCommunityMemberActivity(button.dataset.communityMemberId);
      });
    });
  }

  function renderMemberActivity(community) {
    const memberId = state.selectedCommunityMemberId || "me";
    const memberItem = community.members.find((item) => item.id === memberId) || community.members[0];
    if (!memberItem) {
      els.memberActivityTitle.textContent = "Today’s Activity";
      els.memberActivityTotal.textContent = "0 points";
      els.memberActivityPanel.innerHTML = emptyState("No activity yet.");
      return;
    }
    const values = collectDraftValues(community.system, communityValuesForMember(community.id, memberItem.id, todayIso));
    const summary = calculateMemberCommunitySummary(community, values);
    const entries = [
      ...syncedEntriesForContext({ type: "community", community }, community.system, { userId: memberItem.id }),
      ...getCommunityEntriesForMemberOnDate(community.id, memberItem.id, todayIso)
    ];
    const target = calculateTargetSummary(community.system).total;
    const percent = progressPercent(summary.total, target);
    els.memberActivityTitle.textContent = `${memberItem.name.split(" ")[0]}'s Activity`;
    els.memberActivityTotal.textContent = community.name;
    els.memberActivityPanel.innerHTML = `
      <div class="member-dashboard">
        <section class="score-band member-score-band" aria-label="Community Daily Point Total">
          <div class="score-summary">
            <div class="member-dashboard-profile">
              <div class="member-avatar" aria-hidden="true" style="background:${escapeHtml(memberItem.color)}">${getInitials(memberItem.name)}</div>
              <div>
                <span class="score-label">Daily Point Total</span>
                <strong>${escapeHtml(memberItem.name)}</strong>
              </div>
            </div>
            <strong class="member-daily-score">${escapeHtml(formatPoints(summary.total))} / ${escapeHtml(formatPoints(target))} points</strong>
            <div class="target-meter" aria-label="Daily point target progress">
              <div class="target-meter-meta">
                <span>${escapeHtml(formatPercent(percent))} complete</span>
                <span>${escapeHtml(community.name)}</span>
              </div>
              <div class="target-track" aria-hidden="true">
                <div class="target-fill${percent > 100 ? " over-goal" : ""}" style="width:${Math.min(percent, 100)}%"></div>
              </div>
              <span class="target-status">${escapeHtml(memberItem.name.split(" ")[0])}'s community score today</span>
            </div>
          </div>
        </section>

        <section class="top-card-panel" aria-labelledby="memberGoalCompletionTitle">
          <div class="panel-heading tight">
            <div>
              <h3 id="memberGoalCompletionTitle">Goal Completion by Rule</h3>
              <span>${escapeHtml(plural(summary.breakdown.length, "rule"))}</span>
            </div>
          </div>
          <div class="rule-progress-list">
            ${summary.breakdown.length ? summary.breakdown.map((item) => renderMemberRuleProgressCard(item, community.system)).join("") : `<div class="empty-mini">No community rules yet.</div>`}
          </div>
        </section>

        <section class="visual-breakdown-panel" aria-labelledby="memberVisualBreakdownTitle">
          <div class="panel-heading tight">
            <div>
              <h3 id="memberVisualBreakdownTitle">Visual Breakdown</h3>
              <span>Community rules only</span>
            </div>
          </div>
          ${renderMemberVisualBreakdown(summary)}
        </section>

        <section class="weekly-chart-card member-weekly-panel" aria-labelledby="memberWeeklyTitle">
          <div class="weekly-chart-card-heading">
            <div>
              <h4 id="memberWeeklyTitle">Weekly Community Points</h4>
              <span>${escapeHtml(community.name)}</span>
            </div>
            <strong>${escapeHtml(formatMetricValue(weeklyCommunityTotal(community, memberItem.id), { type: "points" }))}</strong>
          </div>
          ${renderMemberCommunityWeekly(community, memberItem.id)}
        </section>

        <section class="section-band member-entries-panel" aria-labelledby="memberEntriesTitle">
          <div class="panel-heading tight">
            <div>
              <h3 id="memberEntriesTitle">Entries Added Today</h3>
              <span>${escapeHtml(plural(entries.length, "entry"))}</span>
            </div>
          </div>
          <div class="entries-log-list">
            ${entries.length ? entries.map((entry) => renderMemberEntryLogRow(entry, community)).join("") : `<div class="empty-mini">No community entries today.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function calculateMemberCommunitySummary(community, values) {
    const system = normalizeSystem(community.system || { rules: [] });
    const ruleSummary = scoring.calculateSystem(system, values);
    const calculatedTotals = calculateCalculatedTotals({ ...system, rules: system.rules }, values);
    const calculatedPoints = calculatedTotals.reduce((sum, item) => sum + numberOrDefault(item.totalPoints, 0), 0);
    return {
      ...ruleSummary,
      calculatedTotals,
      total: roundScore(numberOrDefault(ruleSummary.total, 0) + calculatedPoints)
    };
  }

  function renderMemberRuleProgressCard(item, system) {
    const rule = item.rule;
    const goal = goalAmountForRule(rule);
    const percent = progressPercent(item.value, goal);
    const progressLine = [
      `${formatValue(item.value)} / ${formatValue(goal || 0)} ${rule.unit}`,
      `${formatPercent(percent)} complete`,
      pointEarnedText(item.totalPoints),
      shortRuleValueSourceLabel(rule)
    ].join(" · ");
    return `
      <div class="rule-progress-card">
        <div class="rule-progress-main">
          <div class="rule-progress-metric">
            <strong>${escapeHtml(rule.label)}</strong>
            <span>${escapeHtml(progressLine)}</span>
          </div>
          <span class="rule-progress-percent">${escapeHtml(formatPercent(percent))}</span>
        </div>
        <div class="mini-progress-track" aria-hidden="true">
          <div class="mini-progress-fill${percent > 100 ? " over-goal" : ""}" style="width:${Math.min(percent, 100)}%"></div>
        </div>
      </div>
    `;
  }

  function renderMemberVisualBreakdown(summary) {
    const goalRows = [
      ...summary.breakdown.map(renderGoalCompletionVisualRow),
      ...(summary.calculatedTotals || []).map(renderCalculatedGoalCompletionVisualRow)
    ];
    return `
      <div class="visual-breakdown-grid">
        <section class="visual-card points-donut-card" aria-label="Points by rule">
          <div class="visual-card-heading">
            <h4>Points by Rule</h4>
            <span>Contribution share</span>
          </div>
          ${renderPointsDonut(summary.breakdown, summary.calculatedTotals || [])}
        </section>
        <section class="visual-card" aria-label="Goal completion">
          <div class="visual-card-heading">
            <h4>Goal Completion</h4>
            <span>Progress</span>
          </div>
          <div class="goal-ring-grid">
            ${goalRows.length ? goalRows.join("") : `<div class="empty-mini">No community rules yet.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function weeklyCommunityTotal(community, memberId) {
    return currentWeekDateKeys().reduce((sum, date) => sum + communityTotalForMember(community, memberId, date), 0);
  }

  function renderMemberCommunityWeekly(community, memberId) {
    const days = currentWeekDateKeys();
    const values = days.map((date) => communityTotalForMember(community, memberId, date));
    const max = Math.max(...values.map((value) => Math.abs(value)), 1);
    return `
      <div class="member-weekly-chart" aria-label="Weekly community points">
        ${days.map((date, index) => {
          const value = values[index];
          const height = Math.max(Math.abs(value) / max * 100, value === 0 ? 4 : 10);
          return `
            <div class="member-weekly-day">
              <div class="mini-chart-bar-wrap" aria-hidden="true">
                <div class="mini-chart-bar${value < 0 ? " negative" : ""}" style="height:${height}%"></div>
              </div>
              <strong>${escapeHtml(formatPoints(value))}</strong>
              <span>${escapeHtml(formatWeekday(date))}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMemberActivityEntry(entry, community) {
    const rule = community.system.rules.map(scoring.normalizeRule).find((item) => item.id === entry.ruleId);
    return `<div class="activity-row">${escapeHtml(entryLogText(entry, rule))}</div>`;
  }

  function renderMemberEntryLogRow(entry, community) {
    const rule = community.system.rules.map(scoring.normalizeRule).find((item) => item.id === entry.ruleId);
    return `
      <div class="entry-log-row member-entry-row">
        <div class="entry-log-main">
          <strong>${escapeHtml(memberEntryText(entry, rule))}</strong>
          <span>${escapeHtml(entrySourceLabel(entry, rule))}</span>
        </div>
      </div>
    `;
  }

  function memberEntryText(entry, rule) {
    const label = rule?.label || entry.label || "Entry";
    const unit = rule?.unit || entry.unit || "units";
    const amount = formatValue(entry.amount);
    if (rule?.inputMethod === "toggle" || unit === "done") return `${label} completed`;
    if (Number(entry.amount) === 1 && String(unit).toLowerCase().startsWith("session")) return `${label} completed`;
    return `${amount} ${unit} ${label}`;
  }

  function renderMemberProgressRow(ruleInput, values) {
    const rule = scoring.normalizeRule(ruleInput);
    const value = numberOrDefault(values[rule.id], 0);
    const goal = goalAmountForRule(rule);
    return `
      <div class="activity-row">
        <strong>${escapeHtml(rule.label)}</strong>
        <span>${escapeHtml(formatValue(value))} / ${escapeHtml(formatValue(goal || 0))} ${escapeHtml(rule.unit)}</span>
      </div>
    `;
  }

  function renderMemberPointsRow(item) {
    return `
      <div class="activity-row">
        <strong>${escapeHtml(item.rule.label)}</strong>
        <span>${escapeHtml(formatSigned(item.totalPoints))} points</span>
      </div>
    `;
  }

  function createSystem() {
    const newSystem = {
      id: makeId("system"),
      ownerId: "me",
      ownerName: state.profile.name,
      title: "",
      category: "",
      visibility: "private",
      description: "",
      rules: [],
      calculatedTotals: []
    };
    state.systems.unshift(newSystem);
    state.selectedSystemId = newSystem.id;
    state.trackerSystemId = newSystem.id;
    state.activeView = "systems";
    state.buildMode = "home";
    state.aiDraftSystem = null;
    state.buildViewedProfileId = "";
    state.buildViewedPublicId = "";
    state.systemSetupStep = 0;
    state.systemEditorOpen = true;
    state.editingRuleId = "";
    saveState();
    render();
    openSelectedSystemEditor();
    showToast("New setup started");
  }

  function duplicateSelectedSystem() {
    const selected = getSelectedSystem();
    if (!selected) return;
    const copy = cloneSystem(selected, `${selected.title} copy`);
    copy.visibility = "private";
    state.systems.unshift(copy);
    state.selectedSystemId = copy.id;
    state.trackerSystemId = copy.id;
    state.systemSetupStep = 0;
    state.buildMode = "home";
    state.aiDraftSystem = null;
    state.buildViewedProfileId = "";
    state.buildViewedPublicId = "";
    state.systemEditorOpen = true;
    saveState();
    render();
    openSelectedSystemEditor();
    showToast("System duplicated");
  }

  function deleteSelectedSystem() {
    const selected = getSelectedSystem();
    if (!selected) return;
    if (state.systems.length === 1) {
      showToast("Keep at least one system");
      return;
    }
    state.systems = state.systems.filter((system) => system.id !== selected.id);
    state.entries = state.entries.filter((entry) => entrySystemId(entry) !== selected.id);
    state.quickEntries = (state.quickEntries || []).filter((entry) => entrySystemId(entry) !== selected.id);
    state.selectedSystemId = state.systems[0]?.id || "";
    state.trackerSystemId = state.systems[0]?.id || "";
    state.systemSetupStep = 0;
    state.systemEditorOpen = false;
    saveState();
    render();
    showToast("System deleted");
  }

  function updateSelectedSystemFromForm() {
    const system = getSelectedSystem();
    if (!system) return;
    system.title = els.systemTitleInput.value.trim();
    system.category = els.systemCategoryInput.value.trim();
    system.description = els.systemDescriptionInput.value.trim();
    system.visibility = els.systemVisibilityInput.value;
    system.ownerName = state.profile.name;
    saveState();
    renderChrome();
    renderDashboard();
    renderDiscover();
    renderProfile();
  }

  function openSelectedSystemEditor() {
    requestAnimationFrame(() => {
      els.systemForm?.scrollIntoView({ block: "start", behavior: "smooth" });
      els.systemTitleInput?.focus({ preventScroll: true });
    });
  }

  function saveRuleFromForm(event) {
    event.preventDefault();
    const system = getSelectedSystem();
    if (!system) return;
    const editingId = state.editingRuleId;
    const validationMessage = validateRuleForm();
    if (validationMessage) {
      showToast(validationMessage);
      return;
    }
    const item = buildRuleFromForm(editingId || makeId("rule"));
    const existingIndex = system.rules.findIndex((ruleItem) => ruleItem.id === editingId);
    if (existingIndex >= 0) {
      system.rules.splice(existingIndex, 1, item);
    } else {
      system.rules.push(item);
    }
    state.editingRuleId = "";
    resetRuleForm();
    syncDraftInputsFromEntries(system);
    autoSaveToday(system);
    saveState();
    render();
    showToast(existingIndex >= 0 ? "Rule updated" : "Rule added");
  }

  function buildRuleFromForm(id) {
    const simpleStyle = els.ruleSimpleStyleInput.value;
    const label = els.ruleLabelInput.value.trim();
    const unit = simpleStyle === "yesNo" ? "yes/no" : (els.ruleUnitInput.value.trim() || "units");
    const dailyTarget = numberOrDefault(els.ruleDailyTargetInput.value, simpleStyle === "yesNo" ? 1 : 0);
    const inputMax = smartInputMax(unit, dailyTarget, numberOrDefault(els.ruleInputMaxInput.value, 0));
    const inputStep = smartInputStep(unit, numberOrDefault(els.ruleInputStepInput.value, 1));
    return scoring.createRule({
      id,
      label,
      category: els.ruleCategoryInput.value.trim() || inferCategory(label),
      metric: label.toLowerCase(),
      unit,
      simpleStyle,
      dailyTarget,
      goalPoints: numberOrDefault(els.ruleGoalPointsInput.value, 2),
      everyAmount: numberOrDefault(els.ruleEveryAmountInput.value, 1),
      everyPoints: numberOrDefault(els.ruleEveryPointsInput.value, 1),
      yesNoPoints: numberOrDefault(els.ruleYesNoPointsInput.value, 2),
      penaltyEnabled: els.rulePenaltyEnabledInput.checked || simpleStyle === "penalty",
      penaltyDirection: "below",
      penaltyPoints: scoring.normalizePenalty(els.rulePenaltyPointsInput.value),
      minimumRequired: numberOrDefault(els.ruleMinimumInput.value, 0),
      penaltyMode: els.rulePenaltyModeInput.value,
      extraThresholds: collectExtraThresholds(),
      maxDailyPoints: numberOrDefault(els.ruleMaxDailyPointsInput.value, 0),
      inputMethod: els.ruleInputMethodInput.value,
      inputMin: 0,
      inputMax,
      inputStep,
      dataSource: els.ruleDataSourceInput.value || "manual",
      sourceMetric: els.ruleSourceMetricInput.value || "manual",
      allowManualOverride: els.ruleManualOverrideInput.checked
    });
  }

  function validateRuleForm() {
    const simpleStyle = els.ruleSimpleStyleInput.value;
    if (!els.ruleLabelInput.value.trim()) return "Please add what you want to track.";
    if (simpleStyle !== "yesNo" && !els.ruleUnitInput.value.trim()) return "Please add a unit.";
    if (simpleStyle !== "yesNo" && simpleStyle !== "penalty" && !hasPositiveNumber(els.ruleDailyTargetInput.value)) {
      return "Please add a daily goal.";
    }
    if ((simpleStyle === "goal" || simpleStyle === "both") && !hasNumberValue(els.ruleGoalPointsInput.value)) {
      return "Please add how many points this is worth.";
    }
    if ((simpleStyle === "every" || simpleStyle === "both") && !hasPositiveNumber(els.ruleEveryAmountInput.value)) {
      return "Please add the amount for each reward.";
    }
    if ((simpleStyle === "every" || simpleStyle === "both") && !hasNumberValue(els.ruleEveryPointsInput.value)) {
      return "Please add how many points each amount is worth.";
    }
    if (simpleStyle === "yesNo" && !hasNumberValue(els.ruleYesNoPointsInput.value)) {
      return "Please add how many points this is worth.";
    }
    if ((simpleStyle === "penalty" || els.rulePenaltyEnabledInput.checked) && !hasPositiveNumber(els.ruleMinimumInput.value)) {
      return "Please add a minimum requirement.";
    }
    if ((simpleStyle === "penalty" || els.rulePenaltyEnabledInput.checked) && !hasNonZeroNumber(els.rulePenaltyPointsInput.value)) {
      return "Please add the penalty points.";
    }
    return "";
  }

  function renderRuleForm(system) {
    const editingRule = system.rules.find((item) => item.id === state.editingRuleId);
    if (!editingRule) {
      if (state.editingRuleId) state.editingRuleId = "";
      resetRuleForm();
      return;
    }
    fillRuleForm(scoring.normalizeRule(editingRule));
    els.ruleFormTitle.textContent = `Editing ${editingRule.label}`;
    els.ruleSubmitLabel.textContent = "Save changes";
    els.cancelRuleEditButton.hidden = false;
  }

  function fillRuleForm(item) {
    els.ruleLabelInput.value = item.label;
    els.ruleCategoryInput.value = item.category;
    els.ruleUnitInput.value = item.unit;
    setPairedValue("ruleDailyTarget", item.dailyTarget);
    els.ruleSimpleStyleInput.value = item.simpleStyle;
    setPairedValue("ruleGoalPoints", item.goalPoints);
    setPairedValue("ruleEveryAmount", item.everyAmount);
    setPairedValue("ruleEveryPoints", item.everyPoints);
    setPairedValue("ruleYesNoPoints", item.yesNoPoints);
    els.rulePenaltyEnabledInput.checked = item.penaltyEnabled || item.simpleStyle === "penalty";
    setPairedValue("ruleMinimum", item.minimumRequired);
    setPairedValue("rulePenaltyPoints", item.penaltyPoints);
    els.rulePenaltyPointsInput.value = item.penaltyPoints;
    els.rulePenaltyModeInput.value = item.penaltyMode;
    els.ruleMaxDailyPointsInput.value = item.maxDailyPoints;
    els.ruleInputMethodInput.value = item.inputMethod;
    els.ruleDataSourceInput.value = item.dataSource || "manual";
    renderRuleSourceMetricOptions(item.dataSource || "manual", item.sourceMetric || "manual");
    els.ruleManualOverrideInput.checked = item.allowManualOverride !== false;
    els.ruleInputMaxInput.value = item.inputMax;
    els.ruleInputStepInput.value = item.inputStep;
    renderExtraThresholds(item.extraThresholds);
    updateRuleSourceControls();
    updateRuleBuilderVisibility();
    renderRulePreview();
  }

  function resetRuleForm() {
    if (!els.ruleForm) return;
    els.ruleForm.reset();
    els.ruleFormTitle.textContent = "Add scoring rule";
    els.ruleSubmitLabel.textContent = "Add rule";
    els.cancelRuleEditButton.hidden = true;
    els.ruleLabelInput.value = "";
    els.ruleUnitInput.value = "";
    els.ruleCategoryInput.value = "";
    els.ruleSimpleStyleInput.value = "goal";
    clearPairedValue("ruleDailyTarget", 0);
    clearPairedValue("ruleGoalPoints", 0);
    clearPairedValue("ruleEveryAmount", 1);
    clearPairedValue("ruleEveryPoints", 0);
    clearPairedValue("ruleYesNoPoints", 0);
    els.rulePenaltyEnabledInput.checked = false;
    clearPairedValue("ruleMinimum", 0);
    clearPairedValue("rulePenaltyPoints", 0);
    els.rulePenaltyModeInput.value = "fixed";
    els.ruleMaxDailyPointsInput.value = "";
    els.ruleInputMethodInput.value = "slider";
    els.ruleDataSourceInput.value = "manual";
    renderRuleSourceMetricOptions("manual", "manual");
    els.ruleManualOverrideInput.checked = true;
    els.ruleInputMaxInput.value = "";
    els.ruleInputStepInput.value = "";
    renderExtraThresholds([]);
    updateRuleSourceControls();
    updateRuleBuilderVisibility();
    renderRulePreview();
  }

  function renderRuleSourceMetricOptions(source, selectedMetric = "") {
    if (!els.ruleSourceMetricInput) return;
    const dataSource = source || "manual";
    const options = sourceMetricOptions[dataSource] || sourceMetricOptions.manual;
    const fallback = suggestedSourceMetric(dataSource);
    const selected = options.some((option) => option.id === selectedMetric)
      ? selectedMetric
      : (options.some((option) => option.id === fallback) ? fallback : options[0]?.id || "manual");
    els.ruleSourceMetricInput.innerHTML = options.map((option) => `
      <option value="${escapeHtml(option.id)}"${option.id === selected ? " selected" : ""}>${escapeHtml(option.label)}</option>
    `).join("");
    els.ruleSourceMetricInput.value = selected;
  }

  function updateRuleSourceControls() {
    if (!els.ruleDataSourceInput || !els.ruleSourceMetricInput) return;
    const source = els.ruleDataSourceInput.value || "manual";
    const previousMetric = els.ruleSourceMetricInput.value || "";
    renderRuleSourceMetricOptions(source, previousMetric);
    const isManual = source === "manual";
    els.ruleSourceMetricInput.disabled = isManual;
    els.ruleManualOverrideInput.disabled = isManual;
    if (isManual) els.ruleManualOverrideInput.checked = true;
    els.ruleDataSourceHelp.textContent = ruleSourceHelpText(source, els.ruleSourceMetricInput.value);
  }

  function suggestedSourceMetric(source) {
    const text = `${els.ruleLabelInput?.value || ""} ${els.ruleUnitInput?.value || ""}`.toLowerCase();
    if (source === "apple-health") {
      if (text.includes("sleep")) return "sleep-hours";
      if (text.includes("workout") || text.includes("gym")) return "workouts";
      if (text.includes("lifting") || text.includes("exercise")) return "exercise-minutes";
      if (text.includes("active calorie")) return "active-calories";
      if (text.includes("protein")) return "nutrition-protein";
      if (text.includes("carb")) return "nutrition-carbs";
      if (text.includes("fat")) return "nutrition-fat";
      return "steps";
    }
    if (source === "google-health-connect") {
      if (text.includes("sleep")) return "sleep";
      if (text.includes("workout") || text.includes("exercise") || text.includes("gym")) return "exercise-sessions";
      if (text.includes("calorie")) return "calories";
      if (text.includes("nutrition") || text.includes("protein") || text.includes("carb") || text.includes("fat")) return "nutrition";
      return "steps";
    }
    if (source === "chase" || source === "plaid") {
      if (text.includes("dining")) return "dining-spending";
      if (text.includes("shopping")) return "shopping-spending";
      if (text.includes("transaction")) return "transactions";
      if (text.includes("recurring")) return "recurring-charges";
      if (text.includes("balance")) return "account-balance";
      return "daily-spending";
    }
    if (source === "calculated") {
      if (text.includes("workout") || text.includes("exercise")) return "workout-minutes";
      if (text.includes("spend")) return "net-spending";
      return "total-calories";
    }
    return "manual";
  }

  function ruleSourceHelpText(source, metric) {
    if (source === "manual") return "Manual rules use Add Entry.";
    if (source === "calculated") return `${sourceMetricLabel(source, metric)} is calculated from other tracked values in this demo.`;
    const status = integrationStatus(source);
    const connection = status === "connected" ? "Connected in demo mode." : "Connect this integration in Profile to use mock synced values.";
    return `${sourceMetricLabel(source, metric)} will update automatically. ${connection}`;
  }

  function bindRuleBuilderEvents() {
    [
      ["ruleDailyTargetSlider", "ruleDailyTargetInput"],
      ["ruleGoalPointsSlider", "ruleGoalPointsInput"],
      ["ruleEveryAmountSlider", "ruleEveryAmountInput"],
      ["ruleEveryPointsSlider", "ruleEveryPointsInput"],
      ["ruleYesNoPointsSlider", "ruleYesNoPointsInput"],
      ["ruleMinimumSlider", "ruleMinimumInput"],
      ["rulePenaltyPointsSlider", "rulePenaltyPointsInput"]
    ].forEach(([sliderId, inputId]) => bindPairedInputs(els[sliderId], els[inputId]));

    [
      els.ruleLabelInput,
      els.ruleUnitInput,
      els.ruleCategoryInput,
      els.ruleSimpleStyleInput,
      els.rulePenaltyEnabledInput,
      els.rulePenaltyModeInput,
      els.ruleInputMethodInput,
      els.ruleDataSourceInput,
      els.ruleSourceMetricInput,
      els.ruleManualOverrideInput,
      els.ruleMaxDailyPointsInput,
      els.ruleInputMaxInput,
      els.ruleInputStepInput
    ].forEach((input) => {
      input.addEventListener("input", handleRuleBuilderChange);
      input.addEventListener("change", handleRuleBuilderChange);
    });

    els.addThresholdButton.addEventListener("click", () => {
      const thresholds = collectExtraThresholds();
      const target = numberOrDefault(els.ruleDailyTargetInput.value, 0);
      thresholds.push({ id: makeId("threshold"), amount: target ? target + thresholds.length * 5000 + 5000 : 1, points: 1 });
      renderExtraThresholds(thresholds);
      renderRulePreview();
    });
  }

  function bindPairedInputs(slider, input) {
    const sync = (source, target) => {
      target.value = source.value;
      handleRuleBuilderChange();
    };
    slider.addEventListener("input", () => sync(slider, input));
    input.addEventListener("input", () => sync(input, slider));
  }

  function handleRuleBuilderChange() {
    if (els.ruleSimpleStyleInput.value === "yesNo") {
      els.ruleInputMethodInput.value = "toggle";
      els.ruleUnitInput.value = "yes/no";
    }
    if (els.ruleSimpleStyleInput.value === "penalty") {
      els.rulePenaltyEnabledInput.checked = true;
    }
    updateRuleSourceControls();
    updateRuleBuilderVisibility();
    renderRulePreview();
  }

  function updateRuleBuilderVisibility() {
    const style = els.ruleSimpleStyleInput.value;
    const showGoal = style === "goal" || style === "both";
    const showEvery = style === "every" || style === "both";
    const showYesNo = style === "yesNo";
    const showPenalty = style === "penalty" || els.rulePenaltyEnabledInput.checked;
    els.goalPointsFields.hidden = !showGoal;
    els.everyPointsFields.hidden = !showEvery;
    els.yesNoPointsFields.hidden = !showYesNo;
    els.penaltyToggleWrap?.setAttribute?.("aria-hidden", style === "penalty" ? "true" : "false");
    els.rulePenaltyEnabledInput.disabled = style === "penalty";
    els.penaltyFields.hidden = !showPenalty;
    document.getElementById("dailyGoalField").hidden = showYesNo;
  }

  function renderRulePreview() {
    if (!els.rulePreviewText) return;
    if (!els.ruleLabelInput.value.trim()) {
      els.rulePreviewText.textContent = "Add what you want to track to see a preview.";
      return;
    }
    const previewRule = buildRuleFromForm(state.editingRuleId || "preview");
    els.rulePreviewText.textContent = `${scoring.previewRule(previewRule)} ${ruleSourceSummary(previewRule)}.`;
  }

  function setPairedValue(prefix, value) {
    const slider = els[`${prefix}Slider`];
    const input = els[`${prefix}Input`];
    if (slider) slider.value = value;
    if (input) input.value = value;
  }

  function clearPairedValue(prefix, sliderValue) {
    const slider = els[`${prefix}Slider`];
    const input = els[`${prefix}Input`];
    if (slider) slider.value = sliderValue;
    if (input) input.value = "";
  }

  function collectExtraThresholds() {
    return Array.from(els.extraThresholdList.querySelectorAll("[data-threshold-row]")).map((row) => ({
      id: row.dataset.thresholdId || makeId("threshold"),
      amount: numberOrDefault(row.querySelector("[data-threshold-amount]").value, 0),
      points: numberOrDefault(row.querySelector("[data-threshold-points]").value, 0)
    })).filter((item) => item.amount > 0 && item.points !== 0);
  }

  function renderExtraThresholds(thresholds) {
    els.extraThresholdList.innerHTML = thresholds.length
      ? thresholds.map((item) => `
        <div class="threshold-row" data-threshold-row data-threshold-id="${escapeHtml(item.id || makeId("threshold"))}">
          <span>At</span>
          <input data-threshold-amount type="number" step="1" value="${escapeHtml(String(item.amount))}" aria-label="Extra threshold amount">
          <span>${escapeHtml(els.ruleUnitInput.value || "units")}, add</span>
          <input data-threshold-points type="number" step="0.5" value="${escapeHtml(String(item.points))}" aria-label="Extra threshold points">
          <span>points</span>
          <button class="ghost-button small" type="button" data-remove-threshold>Delete</button>
        </div>
      `).join("")
      : `<div class="empty-mini">No extra rewards yet.</div>`;

    Array.from(els.extraThresholdList.querySelectorAll("input")).forEach((input) => {
      input.addEventListener("input", renderRulePreview);
    });
    Array.from(els.extraThresholdList.querySelectorAll("[data-remove-threshold]")).forEach((button) => {
      button.addEventListener("click", () => {
        button.closest("[data-threshold-row]").remove();
        renderRulePreview();
      });
    });
  }

  function renderCalculatedTotalSetup(system) {
    system.calculatedTotals = normalizeCalculatedTotals(system.calculatedTotals);
    els.calculatedTotalList.innerHTML = system.calculatedTotals.length
      ? system.calculatedTotals.map((total) => `
        <div class="calc-total-row">
          <div>
            <strong>${escapeHtml(total.name)}</strong>
            <span>${total.trackingOnly ? "Tracking only" : `${escapeHtml(formatSigned(total.goalPoints))} if goal is met`}</span>
            <span>${escapeHtml(calculatedTotalSummary(total, system.rules))}</span>
          </div>
          <button class="ghost-button small" type="button" data-delete-total-id="${escapeHtml(total.id)}">Delete</button>
        </div>
      `).join("")
      : `<div class="empty-mini">No calculated totals yet.</div>`;

    els.calcTotalInputList.innerHTML = system.rules.length
      ? system.rules.map((ruleItem) => `
        <div class="calc-input-option">
          <label class="calc-choice">
            <input type="checkbox" value="${escapeHtml(ruleItem.id)}" data-calc-input-id="${escapeHtml(ruleItem.id)}">
            <span>${escapeHtml(ruleItem.label)} (${escapeHtml(ruleItem.unit)})</span>
          </label>
          <label class="calc-multiplier-field">
            <span>Multiplier</span>
            <input type="number" step="0.25" value="${escapeHtml(String(suggestedMultiplierForRule(ruleItem, els.calcTotalFormulaInput.value)))}" data-calc-multiplier="${escapeHtml(ruleItem.id)}" aria-label="${escapeHtml(ruleItem.label)} multiplier">
          </label>
        </div>
      `).join("")
      : `<div class="empty-mini">Add rules first, then choose them here.</div>`;
  }

  function addCalculatedTotal(event) {
    event.preventDefault();
    const system = getSelectedSystem();
    if (!system) return;
    const selectedCheckboxes = Array.from(els.calcTotalInputList.querySelectorAll("[data-calc-input-id]:checked"));
    const selectedInputs = selectedCheckboxes.map((input) => input.value);
    if (!selectedInputs.length) {
      showToast("Choose at least one input");
      return;
    }
    const multipliers = selectedCheckboxes.reduce((result, input) => {
      const multiplierInput = els.calcTotalInputList.querySelector(`[data-calc-multiplier="${cssEscape(input.value)}"]`);
      result[input.value] = numberOrDefault(multiplierInput?.value, suggestedMultiplierForRule(input.value, els.calcTotalFormulaInput.value));
      return result;
    }, {});
    const total = normalizeCalculatedTotal({
      id: makeId("total"),
      name: els.calcTotalNameInput.value.trim() || "Calculated total",
      unit: els.calcTotalUnitInput.value.trim() || "units",
      goal: numberOrDefault(els.calcTotalGoalInput.value, 0),
      goalPoints: numberOrDefault(els.calcTotalPointsInput.value, 1),
      formula: els.calcTotalFormulaInput.value,
      inputIds: selectedInputs,
      multipliers,
      trackingOnly: els.calcTotalTrackingOnlyInput.checked
    });
    system.calculatedTotals = [...normalizeCalculatedTotals(system.calculatedTotals), total];
    els.calculatedTotalForm.reset();
    els.calcTotalTrackingOnlyInput.checked = true;
    els.calcTotalPointsInput.value = "1";
    saveState();
    render();
    showToast("Calculated total added");
  }

  function copyPublicSystem(id, publicSystems) {
    const source = publicSystems.find((system) => system.id === id);
    if (!source) return;
    const copy = cloneSystem(source, `${source.title} remix`);
    copy.ownerId = "me";
    copy.ownerName = state.profile.name;
    copy.visibility = "private";
    state.systems.unshift(copy);
    state.selectedSystemId = copy.id;
    state.trackerSystemId = copy.id;
    state.activeView = "systems";
    state.buildMode = "home";
    state.aiDraftSystem = null;
    state.buildViewedProfileId = "";
    state.buildViewedPublicId = "";
    state.systemSetupStep = 0;
    state.systemEditorOpen = true;
    saveState();
    render();
    openSelectedSystemEditor();
    showToast("Copied into your systems");
  }

  function saveCommunitySettings() {
    const community = getSelectedCommunity();
    if (!community || !isCommunityAdmin(community)) return;
    community.name = els.communityNameInput.value.trim() || community.name || "Community";
    community.description = els.communityDescriptionInput.value.trim();
    community.visibility = els.communityVisibilityInput.value === "public" ? "public" : "private";
    community.system = normalizeSystem(community.system || { rules: [] });
    community.system.title = `${community.name} rules`;
    community.system.category = community.category || community.system.category || "Community";
    community.system.rules = collectCommunityRuleEditorValues(community);
    saveState();
    render();
    showToast("Community rules saved");
  }

  function collectCommunityRuleEditorValues(community) {
    return Array.from(els.communityRules.querySelectorAll("[data-community-rule-id]")).map((row) => {
      const original = community.system.rules.map(scoring.normalizeRule).find((item) => item.id === row.dataset.communityRuleId) || scoring.createRule();
      const label = row.querySelector('[data-community-rule-field="label"]')?.value.trim() || original.label;
      const unit = row.querySelector('[data-community-rule-field="unit"]')?.value.trim() || original.unit;
      const goal = Math.max(numberOrDefault(row.querySelector('[data-community-rule-field="goal"]')?.value, goalAmountForRule(original)), 0);
      const pointsInput = numberOrDefault(row.querySelector('[data-community-rule-field="points"]')?.value, original.everyPoints || original.goalPoints || original.yesNoPoints || original.penaltyPoints);
      const dataSource = row.querySelector('[data-community-rule-field="dataSource"]')?.value || original.dataSource || "manual";
      const metricOptions = sourceMetricOptions[dataSource] || sourceMetricOptions.manual;
      const rawMetric = row.querySelector('[data-community-rule-field="sourceMetric"]')?.value || original.sourceMetric || metricOptions[0]?.id || "manual";
      const sourceMetric = metricOptions.some((option) => option.id === rawMetric) ? rawMetric : metricOptions[0]?.id || "manual";
      const nextRule = scoring.normalizeRule({ ...original, label, unit });
      nextRule.metric = label.toLowerCase();
      nextRule.dataSource = dataSource;
      nextRule.sourceMetric = sourceMetric;
      nextRule.allowManualOverride = original.allowManualOverride !== false;
      if (nextRule.simpleStyle === "penalty") {
        nextRule.minimumRequired = goal;
        nextRule.penaltyPoints = pointsInput > 0 ? -pointsInput : pointsInput;
      } else if (nextRule.simpleStyle === "yesNo") {
        nextRule.dailyTarget = 1;
        nextRule.yesNoPoints = pointsInput;
      } else {
        nextRule.dailyTarget = goal;
        nextRule.everyPoints = pointsInput;
        if (nextRule.simpleStyle === "goal") nextRule.goalPoints = pointsInput;
      }
      nextRule.inputMax = Math.max(numberOrDefault(nextRule.inputMax, 0), goal * 2, 10);
      return nextRule;
    });
  }

  function addCommunityRule() {
    const community = getSelectedCommunity();
    if (!community || !isCommunityAdmin(community)) return;
    community.system = normalizeSystem(community.system || { rules: [] });
    community.system.rules.push(scoring.createRule({
      id: makeId("community-rule"),
      label: "New community goal",
      category: community.category || "Community",
      unit: "times",
      simpleStyle: "every",
      dailyTarget: 1,
      everyAmount: 1,
      everyPoints: 1,
      inputMax: 10,
      inputStep: 1
    }));
    saveState();
    renderCommunitySettings();
    showToast("Rule added");
  }

  function deleteCommunityRule(ruleId) {
    const community = getSelectedCommunity();
    if (!community || !isCommunityAdmin(community)) return;
    community.system.rules = community.system.rules.filter((item) => item.id !== ruleId);
    state.communityEntries = (state.communityEntries || []).filter((entry) => {
      return entry.communityId !== community.id || entry.ruleId !== ruleId;
    });
    saveCommunitySummaryForMember(community, "me");
    saveState();
    render();
    showToast("Rule deleted");
  }

  function createCommunity() {
    const baseSystem = getSelectedSystem() || state.systems[0];
    const community = {
      id: makeId("community"),
      ownerId: "me",
      adminIds: ["me"],
      name: `${baseSystem.category} Circle`,
      category: baseSystem.category,
      description: `Shared accountability for ${baseSystem.title}.`,
      visibility: "private",
      inviteCode: makeInviteCode(baseSystem.category),
      system: cloneSystem(baseSystem, `${baseSystem.title} shared`),
      members: [
        member("me", state.profile.name, cleanHandle(state.profile.handle), state.profile.accent || "#355d91"),
        member(makeId("member"), "Jordan Lee", "@jordan", "#266b5e"),
        member(makeId("member"), "Riley Stone", "@riley", "#bb6a2f")
      ],
      logs: [
        log("me", todayIso, 0, 0),
        log("Jordan Lee".toLowerCase().replace(/\s/g, "-"), todayIso, 3, 12)
      ]
    };
    community.system.id = makeId("community-system");
    community.memberCount = community.members.length;
    community.logs = [
      log("me", todayIso, 0, 0),
      log(community.members[1].id, todayIso, 3, 12),
      log(community.members[2].id, todayIso, 2, 9)
    ];
    state.communities.unshift(community);
    state.selectedCommunityId = community.id;
    state.activeView = "community-detail";
    state.communityDraftInputs = {};
    saveState();
    render();
    showToast("Community created");
  }

  function joinPublicCommunity(communityId) {
    const source = state.publicCommunities.find((community) => community.id === communityId);
    if (!source) return;

    const existing = state.communities.find((community) => community.id === communityId);
    if (existing) {
      state.selectedCommunityId = existing.id;
      state.activeView = "communities";
      saveState();
      render();
      showToast("Already joined");
      return;
    }

    const joinedCommunity = clonePublicCommunityForJoin(source);
    state.communities.unshift(joinedCommunity);
    seedJoinedCommunityEntries(joinedCommunity);
    state.selectedCommunityId = joinedCommunity.id;
    state.activeView = "communities";
    state.communityDraftInputs = {};
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    showToast(source.visibility === "private" ? "Request sent" : "Joined community");
  }

  function clonePublicCommunityForJoin(source) {
    const community = structuredClone(source);
    const currentMember = member(
      "me",
      state.profile.name,
      cleanHandle(state.profile.handle),
      state.profile.accent || "#355d91"
    );
    const otherMembers = Array.isArray(community.members)
      ? community.members.filter((item) => item.id !== "me")
      : [];
    community.members = [currentMember, ...otherMembers];
    community.ownerId = community.ownerId || source.ownerId || source.id || "public";
    community.adminIds = Array.isArray(community.adminIds) ? community.adminIds : [];
    community.memberCount = Math.max(Number(community.memberCount) || 0, community.members.length);
    community.inviteCode = community.inviteCode || makeInviteCode(community.category);
    community.system = normalizeSystem(community.system || {
      id: makeId("community-system"),
      title: `${community.name} rules`,
      category: community.category,
      rules: []
    });
    community.system.id = community.system.id || makeId("community-system");
    community.logs = Array.isArray(community.logs) && community.logs.length
      ? community.logs
      : makeDemoCommunityLogs(community.members);
    if (!community.logs.some((entry) => entry.memberId === "me" && entry.date === todayIso)) {
      community.logs.push(log("me", todayIso, 0, 0));
    }
    return community;
  }

  function makeDemoCommunityLogs(members) {
    return members.flatMap((item, index) => {
      if (item.id === "me") {
        return [
          log(item.id, todayIso, 0, 0),
          log(item.id, offsetDate(-1), 0, 0)
        ];
      }
      const today = Math.max(1, 6 - index);
      const yesterday = Math.max(1, 5 - index);
      return [
        log(item.id, todayIso, today, today + yesterday),
        log(item.id, offsetDate(-1), yesterday, yesterday)
      ];
    });
  }

  function seedJoinedCommunityEntries(community) {
    state.communityEntries = state.communityEntries || [];
    if (state.communityEntries.some((entry) => entry.communityId === community.id)) return;
    const entries = buildDemoCommunityEntries(community, { includeCurrentUser: false });
    state.communityEntries.push(...entries);
    (community.members || []).filter((item) => item.id !== "me").forEach((item) => saveCommunitySummaryForMember(community, item.id));
    saveCommunitySummaryForMember(community, "me");
  }

  function buildDemoCommunityEntries(community, options = {}) {
    const includeCurrentUser = options.includeCurrentUser !== false;
    const rules = (community.system?.rules || []).map(scoring.normalizeRule).slice(0, 3);
    if (!rules.length) return [];
    const members = (community.members || [])
      .filter((item) => includeCurrentUser || item.id !== "me")
      .slice(0, 5);
    return members.flatMap((item, memberIndex) => {
      return rules.map((ruleItem, ruleIndex) => {
        const amount = demoCommunityAmount(ruleItem, memberIndex, ruleIndex);
        if (!amount) return null;
        return communityEntry(
          makeId("community-entry"),
          community.id,
          item.id,
          ruleItem.id,
          amount,
          ruleItem.label,
          ruleItem.unit,
          todayIso,
          demoTimestamp(8 + memberIndex, 12 + (ruleIndex * 7))
        );
      }).filter(Boolean);
    });
  }

  function demoCommunityAmount(ruleItem, memberIndex, ruleIndex) {
    if (ruleItem.inputMethod === "toggle" || ruleItem.simpleStyle === "yesNo") return memberIndex === 0 || ruleIndex === 0 ? 1 : 0;
    if (ruleItem.simpleStyle === "penalty") return 0;
    const base = ruleItem.dailyTarget || ruleItem.everyAmount || 1;
    const multipliers = [1.15, 0.85, 0.7, 1.35];
    const value = base * (multipliers[memberIndex % multipliers.length] || 1);
    const step = Math.max(numberOrDefault(ruleItem.inputStep, 1), 1);
    return Math.max(step, Math.round(value / step) * step);
  }

  function demoTimestamp(hour, minute) {
    return `${todayIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
  }

  function toggleInviteOptions() {
    const community = getSelectedCommunity();
    if (!community) return;
    els.inviteOptions.hidden = !els.inviteOptions.hidden;
  }

  function communityInviteLink(community) {
    const code = encodeURIComponent(community.inviteCode || "");
    return `https://join.pointwell.app/community/${code}`;
  }

  function copyInviteLink() {
    const community = getSelectedCommunity();
    if (!community) return;
    writeClipboardText(communityInviteLink(community), "Invite link copied", `Invite link: ${communityInviteLink(community)}`);
  }

  function copyInviteCode() {
    const community = getSelectedCommunity();
    if (!community) return;
    writeClipboardText(community.inviteCode, "Invite code copied", `Invite code: ${community.inviteCode}`);
  }

  function communityInviteMessage(community) {
    return `Join my community "${community.name}": ${communityInviteLink(community)}\nInvite code: ${community.inviteCode}`;
  }

  function sendInviteEmail() {
    const community = getSelectedCommunity();
    if (!community) return;
    const subject = "Join my community on the app";
    const body = `Join my community "${community.name}" using this link: ${communityInviteLink(community)}\nOr enter invite code: ${community.inviteCode}`;
    openInviteDeepLink(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      body,
      "Opening email invite"
    );
  }

  function sendInviteText() {
    const community = getSelectedCommunity();
    if (!community) return;
    const message = communityInviteMessage(community);
    openInviteDeepLink(
      `sms:?&body=${encodeURIComponent(message)}`,
      message,
      "Opening text invite"
    );
  }

  function openInviteDeepLink(url, fallbackText, openingMessage) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      showToast(openingMessage);
      return;
    }
    writeClipboardText(fallbackText, "Copied invite message", `Invite message: ${fallbackText}`);
  }

  function writeClipboardText(text, successMessage, fallbackMessage) {
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text || "";
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }
      textarea.remove();
      showToast(copied ? successMessage : fallbackMessage);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast(successMessage),
        fallbackCopy
      );
    } else {
      fallbackCopy();
    }
  }

  function copyCommunitySystem() {
    const community = getSelectedCommunity();
    if (!community) return;
    const copy = cloneSystem(community.system, `${community.system.title} copy`);
    copy.ownerId = "me";
    copy.ownerName = state.profile.name;
    copy.visibility = "private";
    state.systems.unshift(copy);
    state.selectedSystemId = copy.id;
    state.trackerSystemId = copy.id;
    state.activeView = "systems";
    state.systemSetupStep = 0;
    state.systemEditorOpen = true;
    saveState();
    render();
    openSelectedSystemEditor();
    showToast("Community system copied");
  }

  function saveDailyEntry() {
    const context = getActiveScoreContext();
    const system = context.system;
    if (!system) return;
    const values = collectDraftValues(system, valuesForScoreContext(context));
    const total = calculateDashboardSummary(system, values, context).total;
    if (context.type === "community") saveCommunitySummaryForMember(context.community, "me");
    else saveDailySummary(system, values, total);
    saveState();
    renderDashboard();
    showToast(`${context.type === "community" ? "Community day" : "Saved today"}: ${formatPoints(total)} points`);
  }

  function saveCommunityEntry() {
    const community = getSelectedCommunity();
    if (!community) return;
    const rules = community.system.rules.map(scoring.normalizeRule);
    const values = collectDraftValues(community.system, state.communityDraftInputs);
    const entriesToAdd = rules
      .map((ruleItem) => ({ rule: ruleItem, amount: numberOrDefault(values[ruleItem.id], 0) }))
      .filter((item) => item.amount !== 0);
    if (!entriesToAdd.length) {
      showToast("Add a community entry first");
      return;
    }
    entriesToAdd.forEach((item) => addCommunityEntry(community.id, "me", item.rule, item.amount));
    saveCommunitySummaryForMember(community, "me");
    state.communityDraftInputs = {};
    state.selectedCommunityMemberId = "me";
    saveState();
    render();
    showToast("Community entry added");
  }

  function saveProfile() {
    const name = els.profileNameInput.value.trim() || "Avery Rivera";
    const handle = cleanHandle(els.profileHandleInput.value.trim() || "avery");
    state.profile.name = name;
    state.profile.handle = handle;
    state.profile.privacy = els.profilePrivacyInput.value;
    state.profile.dailyTarget = numberOrDefault(els.dailyTargetInput.value, 8);
    state.systems.forEach((system) => {
      system.ownerName = name;
    });
    state.communities.forEach((community) => {
      const me = community.members.find((item) => item.id === "me");
      if (me) {
        me.name = name;
        me.handle = handle;
      }
    });
    saveState();
    render();
    showToast("Profile saved");
  }

  function collectDraftValues(system, values) {
    return system.rules.reduce((result, item) => {
      item = scoring.normalizeRule(item);
      result[item.id] = Number(values[item.id] || 0);
      return result;
    }, {});
  }

  function calculateCalculatedTotals(system, values) {
    return normalizeCalculatedTotals(system.calculatedTotals).map((total) => {
      const includedRules = system.rules.filter((ruleItem) => total.inputIds.includes(ruleItem.id));
      const value = includedRules.reduce((sum, ruleItem) => {
        const factor = calculatedMultiplierForRule(total, ruleItem);
        return sum + (numberOrDefault(values[ruleItem.id], 0) * factor);
      }, 0);
      const explanation = calculatedTotalSummary(total, system.rules);
      const totalPoints = !total.trackingOnly && total.goal > 0 && value >= total.goal
        ? numberOrDefault(total.goalPoints, 0)
        : 0;
      const scoreText = total.trackingOnly
        ? "Tracking only."
        : (totalPoints > 0 ? `${formatSigned(totalPoints)} for hitting the goal.` : "No points earned yet.");
      return {
        ...total,
        value,
        rewardPoints: totalPoints,
        penaltyPoints: 0,
        totalPoints,
        explanation: `${explanation} ${scoreText}`
      };
    });
  }

  function calorieFactorFor(ruleItem) {
    const label = `${ruleItem.label} ${ruleItem.metric || ""}`.toLowerCase();
    if (label.includes("fat")) return 9;
    if (label.includes("protein") || label.includes("carb")) return 4;
    return 1;
  }

  function calculatedMultiplierForRule(total, ruleItem) {
    const saved = total.multipliers?.[ruleItem.id];
    if (saved !== undefined) return numberOrDefault(saved, 1);
    return suggestedMultiplierForRule(ruleItem, total.formula);
  }

  function suggestedMultiplierForRule(ruleItem, formula) {
    if (formula === "calories") return calorieFactorFor(typeof ruleItem === "string" ? { label: ruleItem } : ruleItem);
    return 1;
  }

  function calculatedTotalSummary(total, rules = []) {
    total = normalizeCalculatedTotal(total);
    const ruleMap = new Map(rules.map((item) => [item.id, item]));
    const pieces = total.inputIds.map((id) => {
      const ruleItem = ruleMap.get(id);
      const label = ruleItem?.label || id;
      const multiplier = calculatedMultiplierForRule(total, ruleItem || { id, label });
      return multiplier === 1 ? label : `${label} x ${formatValue(multiplier)}`;
    });
    const formulaText = pieces.length ? pieces.join(" + ") : "No metrics selected";
    const mode = total.trackingOnly
      ? "tracking only"
      : `${formatSigned(total.goalPoints)} if goal is reached`;
    return `${formulaText}; ${mode}; goal ${formatValue(total.goal)} ${total.unit}`;
  }

  function normalizeCalculatedTotals(totals) {
    if (!Array.isArray(totals)) return [];
    return totals.map(normalizeCalculatedTotal);
  }

  function normalizeCalculatedTotal(total) {
    return {
      id: total.id || makeId("total"),
      name: total.name || "Calculated total",
      unit: total.unit || "units",
      goal: numberOrDefault(total.goal, 0),
      goalPoints: numberOrDefault(total.goalPoints, total.trackingOnly === false ? 1 : 0),
      formula: total.formula || "sum",
      inputIds: Array.isArray(total.inputIds) ? total.inputIds : [],
      multipliers: total.multipliers && typeof total.multipliers === "object" ? total.multipliers : {},
      trackingOnly: total.trackingOnly !== false
    };
  }

  function getQuickEntriesForToday(systemId) {
    const dateKey = getTodayKey();
    return (state.quickEntries || []).filter((entry) => {
      return entrySystemId(entry) === systemId && entryDateKey(entry) === dateKey;
    });
  }

  function syncDraftInputsFromEntries(system) {
    state.draftInputs = todayValuesForSystem(system);
    return state.draftInputs;
  }

  function todayValuesForSystem(system) {
    const values = {};
    (system.rules || []).forEach((item) => {
      const rule = scoring.normalizeRule(item);
      values[rule.id] = syncedValueForRule(rule, { userId: "me", date: todayIso, scope: "personal" }) ?? 0;
    });
    getQuickEntriesForToday(system.id).forEach((entry) => {
      values[entry.ruleId] = numberOrDefault(values[entry.ruleId], 0) + numberOrDefault(entry.amount, 0);
    });
    return values;
  }

  function autoSaveToday(system) {
    if (!system) return;
    const values = collectDraftValues(system, todayValuesForSystem(system));
    const total = calculateDashboardSummary(system, values).total;
    saveDailySummary(system, values, total);
  }

  function saveDailySummary(system, values, total) {
    const dateKey = getTodayKey();
    const existing = findEntry(dateKey, system.id);
    if (existing) {
      existing.values = values;
      existing.total = total;
    } else {
      state.entries.unshift({
        id: makeId("entry"),
        date: dateKey,
        dateKey,
        systemId: system.id,
        rewardSystemId: system.id,
        values,
        total
      });
    }
  }

  function replaceTodayEntriesWithSample(system) {
    const dateKey = getTodayKey();
    const values = sampleInputsFor(system);
    state.quickEntries = (state.quickEntries || []).filter((entry) => {
      return !(entrySystemId(entry) === system.id && entryDateKey(entry) === dateKey);
    });
    system.rules.map(scoring.normalizeRule).forEach((rule) => {
      const amount = numberOrDefault(values[rule.id], 0);
      if (!amount) return;
      state.quickEntries.push({
        id: makeId("quick"),
        date: dateKey,
        dateKey,
        createdAt: new Date().toISOString(),
        systemId: system.id,
        rewardSystemId: system.id,
        ruleId: rule.id,
        label: rule.label,
        unit: rule.unit,
        amount
      });
    });
  }

  function entrySystemId(entry) {
    return entry.rewardSystemId || entry.systemId;
  }

  function entryDateKey(entry) {
    return entry.dateKey || entry.date;
  }

  function getTodayKey() {
    refreshToday();
    return todayIso;
  }

  function refreshToday() {
    const current = localDateKey();
    if (current === todayIso) return false;
    todayIso = current;
    state.draftInputs = {};
    state.communityDraftInputs = {};
    addEntryDraft = { ruleId: "", amount: 0 };
    els.todayLabel && (els.todayLabel.textContent = formatDate(todayIso));
    return true;
  }

  function startDateRolloverWatcher() {
    clearInterval(dayRolloverTimer);
    dayRolloverTimer = setInterval(() => {
      if (!refreshToday()) return;
      saveState();
      renderDashboard();
      renderCommunities();
    }, 60000);
  }

  function pruneDailyEntriesForSystem(system) {
    const activeRuleIds = new Set(system.rules.map((item) => item.id));
    state.quickEntries = (state.quickEntries || []).filter((entry) => {
      return entrySystemId(entry) !== system.id || activeRuleIds.has(entry.ruleId);
    });
  }

  function removeRuleDailyData(systemId, ruleId) {
    delete state.draftInputs[ruleId];
    state.quickEntries = (state.quickEntries || []).filter((entry) => {
      return !(entrySystemId(entry) === systemId && entry.ruleId === ruleId);
    });
    state.entries.forEach((entry) => {
      if (entrySystemId(entry) === systemId && entry.values) delete entry.values[ruleId];
    });
    if (addEntryDraft.ruleId === ruleId) addEntryDraft = { ruleId: "", amount: 0 };
  }

  function sampleInputsFor(system) {
    return system.rules.reduce((result, item) => {
      item = scoring.normalizeRule(item);
      if (item.simpleStyle === "yesNo") result[item.id] = 1;
      if (item.simpleStyle === "goal") result[item.id] = item.dailyTarget;
      if (item.simpleStyle === "every") result[item.id] = item.everyAmount * 2;
      if (item.simpleStyle === "both") result[item.id] = item.extraThresholds[0]?.amount || item.dailyTarget;
      if (item.simpleStyle === "penalty") {
        result[item.id] = item.penaltyDirection === "over"
          ? item.minimumRequired + item.everyAmount
          : Math.max(0, item.minimumRequired - item.everyAmount);
      }
      return result;
    }, {});
  }

  function getCommunityStandings(community) {
    const target = calculateTargetSummary(community.system).total || 1;
    return community.members.map((item) => {
      return {
        ...item,
        today: communityTotalForMember(community, item.id, todayIso),
        total: communityTotalAcrossDates(community, item.id),
        target
      };
    }).sort((a, b) => b.today - a.today || b.total - a.total);
  }

  function findEntry(date, systemId) {
    return state.entries.find((entry) => {
      return (entry.dateKey || entry.date) === date && (entry.rewardSystemId || entry.systemId) === systemId;
    });
  }

  function getSelectedSystem() {
    return state.systems.find((system) => system.id === state.selectedSystemId);
  }

  function getTrackerSystem() {
    return state.systems.find((system) => system.id === state.trackerSystemId);
  }

  function clampSetupStep(value) {
    return Math.min(Math.max(Number(value) || 0, 0), setupSteps.length - 1);
  }

  function getSelectedCommunity() {
    return state.communities.find((community) => community.id === state.selectedCommunityId);
  }

  function getVisiblePublicCommunities(query) {
    const cleaned = (query || "").trim().toLowerCase();
    const communities = Array.isArray(state.publicCommunities) ? state.publicCommunities : [];
    if (!cleaned) return communities;
    return communities.filter((community) => communityMatchesSearch(community, cleaned));
  }

  function communityMatchesSearch(community, query) {
    return communitySearchText(community).includes(query);
  }

  function communitySearchText(community) {
    const ruleText = (community.system?.rules || [])
      .flatMap((item) => [item.label, item.category, item.unit])
      .join(" ");
    return [
      community.name,
      community.category,
      community.goalType,
      community.description,
      community.inviteCode,
      community.visibility,
      ...(community.keywords || []),
      community.system?.title,
      ruleText
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function isCommunityJoined(communityId) {
    return state.communities.some((community) => community.id === communityId);
  }

  function getCommunityMemberCount(community) {
    return Math.max(Number(community.memberCount) || 0, Array.isArray(community.members) ? community.members.length : 0);
  }

  function cloneSystem(system, title) {
    const ruleIdMap = new Map();
    const rules = system.rules.map((item) => {
      const newId = makeId(item.id);
      ruleIdMap.set(item.id, newId);
      return scoring.normalizeRule({ ...item, id: newId });
    });
    return {
      id: makeId("system"),
      ownerId: "me",
      ownerName: state.profile.name,
      title,
      category: system.category,
      visibility: "private",
      description: system.description || "",
      rules,
      calculatedTotals: normalizeCalculatedTotals(system.calculatedTotals).map((total) => ({
        ...total,
        id: makeId("total"),
        inputIds: total.inputIds.map((id) => ruleIdMap.get(id) || id),
        multipliers: Object.fromEntries(Object.entries(total.multipliers || {}).map(([id, value]) => [ruleIdMap.get(id) || id, value]))
      }))
    };
  }

  function rule(idOrConfig, label, category, type, threshold, unit, points) {
    if (typeof idOrConfig === "object") {
      return scoring.createRule(idOrConfig);
    }
    return scoring.normalizeRule({ id: idOrConfig, label, category, type, threshold, unit, points });
  }

  function member(id, name, handle, color) {
    return { id, name, handle, color };
  }

  function log(memberId, date, today, total) {
    return { memberId, date, today, total };
  }

  function communityEntry(id, communityId, userId, ruleId, amount, label, unit, date, timestamp, source = "manual") {
    return {
      id,
      communityId,
      userId,
      ruleId,
      amount,
      label,
      unit,
      date,
      dateKey: date,
      timestamp,
      source
    };
  }

  function ruleSentence(item) {
    return scoring.describeRule(item).join(" · ");
  }

  function primaryGoalLine(item) {
    const rule = scoring.normalizeRule(item);
    if (rule.simpleStyle === "yesNo") return `Goal: complete this today`;
    if (rule.simpleStyle === "penalty" && rule.penaltyDirection === "over") return `Limit: ${formatValue(rule.minimumRequired)} ${rule.unit}`;
    if (rule.simpleStyle === "penalty") return `Minimum: ${formatValue(rule.minimumRequired)} ${rule.unit}`;
    return `Goal: ${formatValue(rule.dailyTarget)} ${rule.unit}`;
  }

  function dataSourceLabel(source) {
    return dataSourceOptions.find((option) => option.id === source)?.label || "Manual Entry";
  }

  function renderDataSourceOptionHtml(selectedSource) {
    return dataSourceOptions.map((option) => `
      <option value="${escapeHtml(option.id)}"${option.id === selectedSource ? " selected" : ""}>${escapeHtml(option.label)}</option>
    `).join("");
  }

  function renderSourceMetricOptionHtml(source, selectedMetric) {
    const options = sourceMetricOptions[source] || sourceMetricOptions.manual;
    const selected = options.some((option) => option.id === selectedMetric)
      ? selectedMetric
      : options[0]?.id || "manual";
    return options.map((option) => `
      <option value="${escapeHtml(option.id)}"${option.id === selected ? " selected" : ""}>${escapeHtml(option.label)}</option>
    `).join("");
  }

  function sourceMetricLabel(source, metric) {
    const options = sourceMetricOptions[source] || sourceMetricOptions.manual;
    return options.find((option) => option.id === metric)?.label || "Manual entry";
  }

  function isRuleSynced(ruleInput) {
    const rule = scoring.normalizeRule(ruleInput);
    return rule.dataSource && rule.dataSource !== "manual";
  }

  function isExternalRuleSynced(ruleInput) {
    const rule = scoring.normalizeRule(ruleInput);
    return isRuleSynced(rule) && rule.dataSource !== "calculated";
  }

  function ruleSourceSummary(ruleInput) {
    const rule = scoring.normalizeRule(ruleInput);
    if (!isRuleSynced(rule)) return "Data source: Manual Entry";
    return `Data source: ${dataSourceLabel(rule.dataSource)} - ${sourceMetricLabel(rule.dataSource, rule.sourceMetric)}`;
  }

  function shortRuleValueSourceLabel(ruleInput) {
    const rule = scoring.normalizeRule(ruleInput);
    if (!isRuleSynced(rule)) return "Manual";
    if (rule.dataSource === "calculated") return "Calculated";
    return isSourceConnected(rule.dataSource) ? "Synced" : "Not connected";
  }

  function integrationStatus(source) {
    if (source === "manual" || source === "calculated") return "connected";
    return state.integrations?.[source]?.status === "connected" ? "connected" : "not-connected";
  }

  function isSourceConnected(source) {
    return integrationStatus(source) === "connected";
  }

  function syncedValueForRule(ruleInput, options = {}) {
    const rule = scoring.normalizeRule(ruleInput);
    if (!isRuleSynced(rule)) return null;
    const date = options.date || todayIso;
    if (date !== todayIso) return null;
    if (options.userId && options.userId !== "me") return null;
    if (isExternalRuleSynced(rule) && !isSourceConnected(rule.dataSource)) return null;
    const sourceData = state.mockSyncData?.[rule.dataSource] || defaultMockSyncData[rule.dataSource] || {};
    const value = sourceData[rule.sourceMetric];
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function syncedEntriesForContext(context, system, options = {}) {
    if (!system || !context) return [];
    const userId = options.userId || "me";
    return system.rules
      .map(scoring.normalizeRule)
      .map((rule) => {
        const amount = syncedValueForRule(rule, {
          userId,
          date: todayIso,
          scope: context.type
        });
        if (amount === null) return null;
        return {
          id: `synced-${context.type}-${rule.id}`,
          ruleId: rule.id,
          label: rule.label,
          unit: rule.unit,
          amount,
          date: todayIso,
          dateKey: todayIso,
          source: rule.dataSource === "calculated" ? "calculated" : "synced",
          dataSource: rule.dataSource,
          sourceMetric: rule.sourceMetric
        };
      })
      .filter(Boolean);
  }

  function hasSyncedValueToday(system) {
    return (system?.rules || []).map(scoring.normalizeRule).some((rule) => {
      return syncedValueForRule(rule, { userId: "me", date: todayIso, scope: "personal" }) !== null;
    });
  }

  function normalizeInputValue(input) {
    if (input.type === "checkbox") return input.checked ? 1 : 0;
    return Number(input.value || 0);
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return structuredClone(seedState);
      const parsed = JSON.parse(saved);
      return mergeState(structuredClone(seedState), parsed);
    } catch (error) {
      return structuredClone(seedState);
    }
  }

  function mergeState(seed, saved) {
    return migrateState({
      ...seed,
      ...saved,
      profile: { ...seed.profile, ...(saved.profile || {}) },
      scoreContext: saved.scoreContext || seed.scoreContext,
      selectedCommunityMemberId: saved.selectedCommunityMemberId || seed.selectedCommunityMemberId,
      editingRuleId: saved.editingRuleId || "",
      systemSetupStep: clampSetupStep(saved.systemSetupStep),
      systemEditorOpen: Boolean(saved.systemEditorOpen),
      buildMode: ["home", "search", "ai"].includes(saved.buildMode) ? saved.buildMode : seed.buildMode,
      buildSearchQuery: saved.buildSearchQuery || "",
      communitySearchQuery: saved.communitySearchQuery || "",
      pendingIntegrationId: saved.pendingIntegrationId || "",
      integrations: normalizeIntegrations(saved.integrations || seed.integrations),
      mockSyncData: mergeMockSyncData(saved.mockSyncData),
      buildViewedPublicId: saved.buildViewedPublicId || "",
      buildViewedProfileId: saved.buildViewedProfileId || "",
      aiDraftSystem: saved.aiDraftSystem ? normalizeSystem(saved.aiDraftSystem) : null,
      topCardPreferences: saved.topCardPreferences && typeof saved.topCardPreferences === "object" ? saved.topCardPreferences : {},
      weeklyChartPreferences: saved.weeklyChartPreferences && typeof saved.weeklyChartPreferences === "object" ? saved.weeklyChartPreferences : {},
      systems: Array.isArray(saved.systems) && saved.systems.length ? saved.systems : seed.systems,
      publicSystems: seed.publicSystems,
      publicCommunities: seed.publicCommunities,
      entries: Array.isArray(saved.entries) ? saved.entries : seed.entries,
      quickEntries: Array.isArray(saved.quickEntries) ? saved.quickEntries : seed.quickEntries,
      communityEntries: Array.isArray(saved.communityEntries) ? saved.communityEntries : seed.communityEntries,
      communities: Array.isArray(saved.communities) && saved.communities.length ? saved.communities : seed.communities
    });
  }

  function migrateState(nextState) {
    nextState.integrations = normalizeIntegrations(nextState.integrations);
    nextState.mockSyncData = mergeMockSyncData(nextState.mockSyncData);
    if (!integrationDefinitions.some((item) => item.id === nextState.pendingIntegrationId)) {
      nextState.pendingIntegrationId = "";
    }
    nextState.systems = (nextState.systems || []).map(normalizeSystem);
    nextState.publicSystems = (nextState.publicSystems || []).map(normalizeSystem);
    nextState.scoreContext = normalizeScoreContextForState(nextState, nextState.scoreContext);
    nextState.communityEntries = (nextState.communityEntries || []).map(normalizeCommunityEntry);
    nextState.publicCommunities = (nextState.publicCommunities || []).map((community) => ({
      ...community,
      ownerId: community.ownerId || community.id || "public",
      adminIds: Array.isArray(community.adminIds) ? community.adminIds : [],
      visibility: communityVisibility(community),
      members: Array.isArray(community.members) ? community.members : [],
      logs: Array.isArray(community.logs) ? community.logs : [],
      system: normalizeSystem(community.system || { rules: [] })
    }));
    nextState.communities = (nextState.communities || []).map((community) => ({
      ...community,
      ownerId: community.ownerId || (String(community.id || "").startsWith("public-") ? community.id : "me"),
      adminIds: Array.isArray(community.adminIds) ? community.adminIds : (String(community.id || "").startsWith("public-") ? [] : ["me"]),
      visibility: communityVisibility(community),
      members: Array.isArray(community.members) ? community.members : [],
      logs: Array.isArray(community.logs) ? community.logs : [],
      system: normalizeSystem(community.system || { rules: [] })
    }));
    nextState.communityEntries = backfillDemoCommunityEntries(nextState);
    return nextState;
  }

  function normalizeIntegrations(source = {}) {
    return integrationDefinitions.reduce((result, definition) => {
      const saved = source?.[definition.id] || {};
      result[definition.id] = {
        status: saved.status === "connected" ? "connected" : "not-connected",
        lastSynced: saved.lastSynced || ""
      };
      return result;
    }, {});
  }

  function mergeMockSyncData(source = {}) {
    return Object.entries(defaultMockSyncData).reduce((result, [sourceId, metrics]) => {
      result[sourceId] = {
        ...metrics,
        ...(source?.[sourceId] || {})
      };
      return result;
    }, {});
  }

  function backfillDemoCommunityEntries(nextState) {
    const entries = Array.isArray(nextState.communityEntries) ? [...nextState.communityEntries] : [];
    (nextState.communities || []).forEach((community) => {
      if (!shouldBackfillCommunityEntries(community)) return;
      if (entries.some((entry) => entry.communityId === community.id)) return;
      entries.push(...buildDemoCommunityEntries(community, { includeCurrentUser: true }));
    });
    return entries;
  }

  function shouldBackfillCommunityEntries(community) {
    const id = String(community.id || "");
    return id === "gym-crew" || id === "study-room" || id.startsWith("public-");
  }

  function normalizeSystem(system) {
    return {
      ...system,
      rules: (system.rules || []).map(scoring.normalizeRule),
      calculatedTotals: normalizeCalculatedTotals(system.calculatedTotals)
    };
  }

  function normalizeCommunityEntry(entry) {
    const date = entry.dateKey || entry.date || todayIso;
    return {
      id: entry.id || makeId("community-entry"),
      communityId: entry.communityId || "",
      userId: entry.userId || entry.memberId || "me",
      ruleId: entry.ruleId || "",
      amount: numberOrDefault(entry.amount, 0),
      label: entry.label || "Entry",
      unit: entry.unit || "units",
      date,
      dateKey: date,
      timestamp: entry.timestamp || entry.createdAt || new Date().toISOString(),
      source: entry.source || "manual"
    };
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function makeId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function makeInviteCode(category) {
    const prefix = (category || "GOAL").slice(0, 3).toUpperCase();
    return `${prefix}-${Math.floor(100 + Math.random() * 900)}`;
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function offsetDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return localDateKey(date);
  }

  function currentWeekDateKeys() {
    const [year, month, day] = todayIso.split("-").map(Number);
    const monday = new Date(year, month - 1, day);
    const weekday = monday.getDay();
    const distanceFromMonday = weekday === 0 ? 6 : weekday - 1;
    monday.setDate(monday.getDate() - distanceFromMonday);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return localDateKey(date);
    });
  }

  function formatDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }

  function formatWeekday(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: "short"
    });
  }

  function formatPoints(value) {
    const rounded = Math.round(Number(value || 0) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
  }

  function formatSigned(value) {
    const num = Number(value || 0);
    return `${num >= 0 ? "+" : ""}${formatPoints(num)}`;
  }

  function pointEarnedText(value) {
    const absValue = Math.abs(numberOrDefault(value, 0));
    const word = absValue === 1 ? "point" : "points";
    return `${formatSigned(value)} ${word}`;
  }

  function formatValue(value) {
    const num = Number(value || 0);
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100);
  }

  function formatPercent(value) {
    const rounded = Math.round(numberOrDefault(value, 0));
    return `${rounded}%`;
  }

  function progressPercent(value, goal) {
    const target = Math.abs(numberOrDefault(goal, 0));
    if (target <= 0) return 0;
    return Math.max(0, numberOrDefault(value, 0) / target * 100);
  }

  function progressText(rule, value) {
    rule = scoring.normalizeRule(rule);
    if (rule.simpleStyle === "yesNo") return value > 0 ? "Completed today" : "Not completed yet";
    if (rule.simpleStyle === "penalty" && rule.penaltyDirection === "over") {
      return `Limit: ${formatValue(rule.minimumRequired)} ${rule.unit}; current: ${formatValue(value)} ${rule.unit}`;
    }
    const goal = rule.simpleStyle === "penalty" ? rule.minimumRequired : rule.dailyTarget;
    const label = rule.simpleStyle === "penalty" && rule.penaltyDirection === "over" ? "Limit" : (rule.simpleStyle === "penalty" ? "Minimum" : "Goal");
    return `${label}: ${formatValue(value)} / ${formatValue(goal)} ${rule.unit}`;
  }

  function progressPercentText(rule, value, percent) {
    rule = scoring.normalizeRule(rule);
    if (rule.simpleStyle === "penalty" && rule.penaltyDirection === "over" && rule.minimumRequired <= 0) {
      return value > rule.minimumRequired ? "Over limit" : "At limit";
    }
    return `${formatPercent(percent)} of goal${percent > 100 ? " · over goal" : ""}`;
  }

  function pointContribution(points, dailyTarget) {
    const target = numberOrDefault(dailyTarget, 0);
    if (!target) return "No daily point target yet.";
    const percent = Math.abs(points / target * 100);
    if (points < 0) return `Subtracts ${formatPercent(percent)} from daily point goal.`;
    return `This is ${formatPercent(percent)} of daily point goal.`;
  }

  function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  }

  function setWidth(selector, percent) {
    const node = document.querySelector(selector);
    if (!node) return;
    node.style.width = `${Math.min(Math.max(numberOrDefault(percent, 0), 0), 140)}%`;
    node.classList.toggle("over-goal", numberOrDefault(percent, 0) > 100);
  }

  function cssEscape(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function numberOrDefault(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function hasPositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }

  function hasNumberValue(value) {
    if (String(value).trim() === "") return false;
    const parsed = Number(value);
    return Number.isFinite(parsed);
  }

  function hasNonZeroNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed !== 0;
  }

  function roundScore(value) {
    return Math.round(numberOrDefault(value, 0) * 100) / 100;
  }

  function plural(count, singular) {
    if (count === 1) return `${count} ${singular}`;
    const pluralWord = /[^aeiou]y$/i.test(singular)
      ? `${singular.slice(0, -1)}ies`
      : `${singular}s`;
    return `${count} ${pluralWord}`;
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function cleanHandle(value) {
    return `@${String(value || "user").replace(/^@+/, "").replace(/\s+/g, "").toLowerCase()}`;
  }

  function inferCategory(label) {
    const value = String(label || "").toLowerCase();
    if (value.includes("sleep")) return "Sleep";
    if (value.includes("run") || value.includes("steps")) return "Fitness";
    if (value.includes("gym") || value.includes("lift")) return "Fitness";
    if (value.includes("study") || value.includes("homework")) return "Academics";
    if (value.includes("spend") || value.includes("budget") || value.includes("money")) return "Finance";
    return "Personal habits";
  }

  function smartInputMax(unit, dailyTarget, currentMax) {
    const lower = String(unit || "").toLowerCase();
    if (lower === "yes/no") return 1;
    if (lower.includes("step")) return Math.max(currentMax || 0, dailyTarget * 2, 20000);
    if (currentMax === 20000 || currentMax <= 0) return Math.max(dailyTarget * 2, 10);
    return currentMax;
  }

  function smartInputStep(unit, currentStep) {
    const lower = String(unit || "").toLowerCase();
    if (lower === "yes/no") return 1;
    if (lower.includes("step")) return currentStep && currentStep !== 1 ? currentStep : 100;
    if (["hours", "hour", "dollars", "dollar", "miles", "mile"].includes(lower) && currentStep === 100) return 0.25;
    return currentStep || 1;
  }

  function getInitials(name) {
    return String(name || "User")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  function avatarColor(name) {
    const palette = ["#355d91", "#266b5e", "#bb6a2f", "#7a4b86", "#8a4d43"];
    const index = String(name).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
    return palette[index];
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
