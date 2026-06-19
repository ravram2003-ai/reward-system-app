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
      accent: "#355d91",
      // Opt-in for the "motivation when behind" signal. Default OFF; mirrored to
      // the server (profiles.allow_motivation_when_behind), which is what RLS reads.
      allowMotivation: false
    },
    // Authenticated account (Supabase). null = local mode / not signed in.
    // The local current-user id stays "me"; account.userId is its real identity.
    account: null,
    activeView: "dashboard",
    selectedSystemId: "life-core",
    trackerSystemId: "life-core",
    selectedCommunityId: "",
    selectedCommunityMemberId: "",
    communityLeaderboardPeriod: "",
    communityTrendMemberId: "",
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
    aiDraftInputs: null,
    aiDraftAdjustments: null,
    aiLearning: { saved: {}, feedback: [], deletedRuleLabels: {}, likedRuleLabels: {} },
    systemSetupStep: 0,
    systemEditorOpen: false,
    topCardPreferences: {},
    weeklyChartPreferences: {},
    editingRuleId: "",
    draftInputs: {},
    quickEntries: [],
    communityEntries: [],
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
    publicSystems: [],
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
    communities: [],
    publicCommunities: []
  };

  let state = loadState();
  let addEntryDraft = { ruleId: "", amount: 0 };
  let topCardDraftBlocks = null;
  let weeklyChartDraftBlocks = null;
  let communityDraft = null;
  let communityDraftStep = 0;
  let communityDraftMethod = "";
  let editingCommunityDraftRuleId = "";
  let authConfigured = false;
  const els = {};
  let toastTimer = null;
  let dayRolloverTimer = null;
  // Positive signals (kudos / motivation) — in-app notifications state.
  let inboxSignals = [];
  let unsubscribeInbox = null;
  let currentInboxUid = null;
  // The conversation thread currently open on screen, so realtime inserts can
  // live-update it (not just the inbox). { peerId, community, memberItem, thread }.
  let activeThread = null;
  let behindPushTimer = null;
  let lastPushedBehind = null;
  let lastBehindWriteAt = 0;
  // Real people-search (Build → Search "People"): results from the search_profiles
  // RPC, plus a sequence guard so a slow earlier query can't overwrite a newer one.
  let peopleResults = [];
  let peopleSearchLoading = false;
  let peopleSearchSeq = 0;
  let peopleSearchTimer = null;
  // Shared-community (DB) state: an invite code being looked up in "Find", and a
  // join code captured from a ?join= invite link before sign-in resolves.
  let communityCodeResult = null; // null | "notfound" | { id, name, category, description, member_count }
  let communitySearchResults = []; // name-search matches (public + request_to_join)
  let ownerJoinRequests = [];      // pending join requests for communities I own
  let pendingJoinCode = "";
  // Friends system (friends.sql). `friends` = userIds of my accepted friends;
  // `incomingFriendRequests` = pending requests addressed to me (Accept/Decline + badge).
  let friends = new Set();
  let incomingFriendRequests = [];
  // Peers I blocked from a message request this session — hidden from the inbox
  // immediately (the DB block is the durable guarantee; this is just responsive UI).
  let sessionHiddenPeers = new Set();
  // Chats toolbar panels: "New message" (search people I can message) and
  // "Add friend" (search + send requests). Each has its own debounced search state.
  let chatsActivePanel = "";       // "" | "new-message" | "add-friend"
  let messageSearchResults = [];
  let messageSearchLoading = false;
  let messageSearchSeq = 0;
  let messageSearchTimer = null;
  let friendSearchResults = [];    // [{ id, display_name, handle, status }]
  let friendSearchLoading = false;
  let friendSearchSeq = 0;
  let friendSearchTimer = null;
  // First-run onboarding overlay state.
  let onboardingActive = false;
  let onboardingStep = 1;
  let onboardingFocus = "";
  let onboardingShownThisSession = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    resetSavedBuildSubpage();
    captureJoinCodeFromUrl();
    cacheElements();
    bindEvents();
    render();
    startDateRolloverWatcher();
    initAuthGate();
  }

  // An invite link is <app-url>?join=CODE. Capture the code, then strip it from the
  // address bar so a refresh doesn't re-trigger the join. It's resolved after sign-in.
  function captureJoinCodeFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = (params.get("join") || "").trim();
      if (!code) return;
      pendingJoinCode = code;
      params.delete("join");
      const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
      window.history.replaceState({}, "", clean);
    } catch (e) { /* ignore */ }
  }

  // ── Auth bridge ───────────────────────────────────────────────────────────
  // auth.js (the Supabase module) owns sign-in/up/out and emits `pointwell:auth`
  // events. Here we only react: gate the app behind the auth screen when Supabase
  // is configured, and bind the authenticated identity onto the local "me" user.
  function initAuthGate() {
    const config = window.POINTWELL_SUPABASE || {};
    const helpers = window.PointwellAuthHelpers;
    authConfigured = !!(helpers && helpers.isSupabaseConfigured(config));
    document.addEventListener("pointwell:auth", handleAuthEvent);
    if (authConfigured) showAuthScreen();
    // Apply any auth state that resolved before this listener attached.
    if (window.__pointwellAuthState) handleAuthEvent({ detail: window.__pointwellAuthState });
  }

  function handleAuthEvent(event) {
    const detail = (event && event.detail) || {};
    if (detail.status === "signed-in") {
      applyAccountIdentity(detail.user || {}, detail.profile);
      if (els.signOutButton) els.signOutButton.hidden = false;
      if (els.profileSignOutButton) els.profileSignOutButton.hidden = false;
      hideAuthScreen();
      initSignals().catch(() => {});
    } else if (detail.status === "signed-out") {
      state.account = null;
      // Don't let one account's opt-in linger in localStorage on a shared device.
      state.profile.allowMotivation = false;
      if (els.allowMotivationInput) els.allowMotivationInput.checked = false;
      if (els.signOutButton) els.signOutButton.hidden = true;
      if (els.profileSignOutButton) els.profileSignOutButton.hidden = true;
      teardownSignals();
      // Clear onboarding session state so a DIFFERENT brand-new account signing in
      // next (same tab, no reload) is evaluated for onboarding cleanly.
      resetOnboardingSession();
      saveState();
      if (authConfigured) showAuthScreen();
    } else {
      // "unconfigured" or "error" → local mode, app stays usable
      state.account = null;
      if (els.signOutButton) els.signOutButton.hidden = true;
      if (els.profileSignOutButton) els.profileSignOutButton.hidden = true;
      teardownSignals();
      hideAuthScreen();
    }
  }

  // Bind the authenticated account to the local current user ("me").
  function applyAccountIdentity(user, profile) {
    state.account = { userId: user.id || "", email: user.email || "" };
    // Bind the real Supabase id onto the local "me" member in every community so
    // signals can resolve a real sender/recipient (other members are demo personas
    // with no real account and therefore stay un-signalable until they're real).
    state.communities.forEach((community) => {
      const me = community.members.find((member) => member.id === "me");
      if (me) me.userId = state.account.userId;
    });
    if (profile) {
      if (profile.name) state.profile.name = profile.name;
      if (profile.handle) state.profile.handle = cleanHandle(profile.handle);
      state.systems.forEach((system) => { system.ownerName = state.profile.name; });
      state.communities.forEach((community) => {
        const me = community.members.find((member) => member.id === "me");
        if (me) {
          me.name = state.profile.name;
          me.handle = state.profile.handle;
        }
      });
    }
    saveState();
    render();
  }

  function showAuthScreen() {
    if (els.authScreen) els.authScreen.hidden = false;
    document.body.classList.add("auth-locked");
  }

  function hideAuthScreen() {
    if (els.authScreen) els.authScreen.hidden = true;
    document.body.classList.remove("auth-locked");
  }

  // ── First-run onboarding ───────────────────────────────────────────────────
  // Shown ONLY to brand-new accounts (profiles.onboarding_completed = false, gated
  // server-side; existing accounts were backfilled true). Four calm screens, one
  // concept each, a visible "Skip for now" everywhere, every choice a tap. No fake
  // users or demo members appear. The payoff drops the user into a real, pre-filled
  // starter reward system built through the normal creation path.
  const ONBOARDING_FOCI = [
    { key: "fitness", label: "Fitness", icon: "🏋", blurb: "Move, train, and rest.",
      system: { title: "Fitness baseline", category: "Fitness", rules: [
        { label: "Workout", unit: "session", simpleStyle: "yesNo", yesNoPoints: 3 },
        { label: "10,000 steps", unit: "steps", simpleStyle: "goal", dailyTarget: 10000, goalPoints: 2, inputMethod: "number", inputMax: 30000, inputStep: 500 },
        { label: "Sleep 8h", unit: "hours", simpleStyle: "goal", dailyTarget: 8, goalPoints: 1, inputMethod: "number", inputMax: 12, inputStep: 0.5 }
      ] } },
    { key: "study", label: "Study", icon: "📚", blurb: "Focus and learn.",
      system: { title: "Study sprint", category: "Study", rules: [
        { label: "Deep work 2h", unit: "session", simpleStyle: "yesNo", yesNoPoints: 3 },
        { label: "Read 30 min", unit: "session", simpleStyle: "yesNo", yesNoPoints: 2 },
        { label: "Review notes", unit: "session", simpleStyle: "yesNo", yesNoPoints: 1 }
      ] } },
    { key: "habits", label: "Habits", icon: "✦", blurb: "Small daily wins.",
      system: { title: "Daily habits", category: "Habits", rules: [
        { label: "Wake by 7am", unit: "day", simpleStyle: "yesNo", yesNoPoints: 1 },
        { label: "Meditate 10 min", unit: "session", simpleStyle: "yesNo", yesNoPoints: 2 },
        { label: "Plan tomorrow", unit: "day", simpleStyle: "yesNo", yesNoPoints: 1 }
      ] } },
    { key: "money", label: "Money", icon: "$", blurb: "Spend with intent.",
      system: { title: "Money habits", category: "Finance", rules: [
        { label: "Logged spending", unit: "day", simpleStyle: "yesNo", yesNoPoints: 1 },
        { label: "No impulse buy", unit: "day", simpleStyle: "yesNo", yesNoPoints: 2 },
        { label: "Saved today", unit: "day", simpleStyle: "yesNo", yesNoPoints: 1 }
      ] } }
  ];

  function maybeStartOnboarding() {
    if (onboardingShownThisSession || onboardingActive || !els.onboardingScreen) return;
    showOnboarding();
  }

  // Reset the per-session onboarding guard + overlay (called on sign-out) so a
  // different account in the same tab gets a clean onboarding evaluation.
  function resetOnboardingSession() {
    onboardingShownThisSession = false;
    onboardingActive = false;
    if (els.onboardingScreen) els.onboardingScreen.hidden = true;
    document.body.classList.remove("onboarding-locked");
  }

  function showOnboarding() {
    if (!els.onboardingScreen) return;
    onboardingShownThisSession = true;
    onboardingActive = true;
    onboardingStep = 1;
    onboardingFocus = "";
    els.onboardingScreen.hidden = false;
    document.body.classList.add("onboarding-locked");
    renderOnboarding();
  }

  function renderOnboarding() {
    if (!els.onboardingBody) return;
    els.onboardingBody.innerHTML = onboardingScreenMarkup();
  }

  function starterRulePoints(rule) {
    const pts = rule.yesNoPoints != null ? rule.yesNoPoints : (rule.goalPoints != null ? rule.goalPoints : 1);
    return "+" + pts;
  }

  function onboardingScreenMarkup() {
    const skip = `<button class="ghost-button small onboard-skip" type="button" data-onboard="skip">Skip for now</button>`;
    if (onboardingStep === 2) {
      return `
        <div class="onboard-screen onboard-fork">
          <p class="eyebrow">Choose a starting point</p>
          <h2>How do you want to begin?</h2>
          <div class="onboard-cards">
            <button class="onboard-card onboard-card-primary" type="button" data-onboard="fork-build">
              <span class="onboard-card-icon" aria-hidden="true">◎</span>
              <strong>Build my own</strong>
              <span>Start a personal reward system — it works on your own, right away.</span>
            </button>
            <button class="onboard-card" type="button" data-onboard="fork-community">
              <span class="onboard-card-icon" aria-hidden="true">◧</span>
              <strong>Join a community</strong>
              <span>Do it together with others. You can always start one later.</span>
            </button>
          </div>
          ${skip}
        </div>`;
    }
    if (onboardingStep === 3) {
      return `
        <div class="onboard-screen onboard-focus">
          <p class="eyebrow">One tap</p>
          <h2>What do you want to focus on?</h2>
          <div class="onboard-focus-grid">
            ${ONBOARDING_FOCI.map((focus) => `
              <button class="onboard-focus-card" type="button" data-onboard="focus" data-focus="${escapeHtml(focus.key)}">
                <span class="onboard-card-icon" aria-hidden="true">${focus.icon}</span>
                <strong>${escapeHtml(focus.label)}</strong>
                <span>${escapeHtml(focus.blurb)}</span>
              </button>`).join("")}
          </div>
          ${skip}
        </div>`;
    }
    if (onboardingStep === 4) {
      const focus = ONBOARDING_FOCI.find((item) => item.key === onboardingFocus) || ONBOARDING_FOCI[0];
      return `
        <div class="onboard-screen onboard-payoff">
          <p class="eyebrow">${escapeHtml(focus.label)} · your starter system</p>
          <h2>${escapeHtml(focus.system.title)}</h2>
          <p class="onboard-sub">Pre-filled and ready. Start now, or tweak the rules anytime.</p>
          <ul class="onboard-rule-list">
            ${focus.system.rules.map((rule) => `
              <li>
                <span>${escapeHtml(rule.label)}</span>
                <span class="onboard-rule-points">${escapeHtml(starterRulePoints(rule))}</span>
              </li>`).join("")}
          </ul>
          <div class="onboard-actions">
            <button class="primary-button" type="button" data-onboard="start" data-focus="${escapeHtml(focus.key)}">Start tracking</button>
            ${skip}
          </div>
        </div>`;
    }
    // Step 1 — welcome.
    return `
      <div class="onboard-screen onboard-welcome">
        <div class="onboard-brand">
          <div class="brand-mark" aria-hidden="true">P</div>
          <p class="eyebrow">Welcome to Pointwell</p>
        </div>
        <h2>Track what matters to you and earn points for showing up.</h2>
        <div class="onboard-actions">
          <button class="primary-button" type="button" data-onboard="continue">Get started</button>
          ${skip}
        </div>
      </div>`;
  }

  function handleOnboardingClick(event) {
    const target = event.target.closest && event.target.closest("[data-onboard]");
    if (!target) return;
    const action = target.dataset.onboard;
    if (action === "skip") { finishOnboarding(); return; }
    if (action === "continue") { onboardingStep = 2; renderOnboarding(); return; }
    if (action === "fork-build") { onboardingStep = 3; renderOnboarding(); return; }
    if (action === "fork-community") { finishOnboarding({ landing: "communities" }); return; }
    if (action === "focus") { onboardingFocus = target.dataset.focus || ""; onboardingStep = 4; renderOnboarding(); return; }
    if (action === "start") { startStarterSystem(target.dataset.focus || onboardingFocus); return; }
  }

  // Build the chosen starter system through the normal model (scoring.normalizeRule),
  // make it the active tracker, and land the user on the dashboard holding it.
  function startStarterSystem(focusKey) {
    const focus = ONBOARDING_FOCI.find((item) => item.key === focusKey) || ONBOARDING_FOCI[0];
    const tpl = focus.system;
    const system = {
      id: makeId("system"),
      ownerId: "me",
      ownerName: state.profile.name,
      title: tpl.title,
      category: tpl.category,
      visibility: "private",
      description: "Your starter " + focus.label.toLowerCase() + " system — edit the rules anytime.",
      rules: tpl.rules.map((rule) => scoring.normalizeRule(Object.assign({ category: tpl.category }, rule))),
      calculatedTotals: []
    };
    state.systems.unshift(system);
    state.selectedSystemId = system.id;
    state.trackerSystemId = system.id;
    state.systemEditorOpen = false;
    state.buildMode = "home";
    state.activeView = "dashboard";
    finishOnboarding({ skipRender: true });
    saveState();
    render();
    showToast("Your starter system is ready");
  }

  function finishOnboarding(opts) {
    opts = opts || {};
    onboardingActive = false;
    if (els.onboardingScreen) els.onboardingScreen.hidden = true;
    document.body.classList.remove("onboarding-locked");
    // Persist the completed flag so onboarding never shows again for this account.
    if (signalsReady()) {
      Promise.resolve(window.PointwellSignals.setOnboardingCompleted(state.account.userId)).catch(() => {});
    }
    if (opts.landing === "communities") state.activeView = "communities";
    if (!opts.skipRender) { saveState(); render(); }
  }

  // ── Positive signals (kudos / motivation) + in-app notifications ───────────
  // The DB is the real guard for every rule (see supabase/signals.sql); the data
  // layer is in outputs/signals.js. Here we wire the inbox bell, the per-member
  // send affordances, and push the current user's self-reported "behind" flag
  // (computed with the single definition exported by insight.js).

  function signalsReady() {
    return !!(window.PointwellSignals && window.PointwellSignals.isReady() && state.account && state.account.userId);
  }

  async function initSignals() {
    if (!signalsReady()) { teardownSignals(); return; }
    const uid = state.account.userId;
    // Token refresh re-fires "signed-in" for the same user; don't re-subscribe.
    const alreadySubscribed = unsubscribeInbox && currentInboxUid === uid;
    // Sync the opt-in from server truth (what RLS reads), then reflect it in the UI.
    const flags = await window.PointwellSignals.getMyFlags(uid);
    if (flags && typeof flags.allow_motivation_when_behind === "boolean") {
      state.profile.allowMotivation = flags.allow_motivation_when_behind;
      if (els.allowMotivationInput) els.allowMotivationInput.checked = state.profile.allowMotivation;
    }
    if (flags) {
      // Reflect server truth for the searchable handle + visibility choice.
      if (flags.handle) state.profile.handle = cleanHandle(flags.handle);
      if (flags.visibility === "public" || flags.visibility === "private") state.profile.privacy = flags.visibility;
      // Brand-new account that hasn't finished first-run onboarding → show it now.
      // Existing accounts were backfilled onboarding_completed=true (search-onboarding.sql),
      // so they're never re-onboarded. A failed/null fetch is treated as completed.
      if (flags.onboarding_completed === false) maybeStartOnboarding();
    }
    await refreshInbox();
    pushMyBehindStatus();
    if (!alreadySubscribed) {
      if (unsubscribeInbox) { try { unsubscribeInbox(); } catch (e) { /* ignore */ } }
      unsubscribeInbox = window.PointwellSignals.subscribeInbox(uid, handleInboxChange);
      currentInboxUid = uid;
    }
    // Load the user's shared communities (one DB row each) into local state, then
    // act on any ?join= invite link that brought them here.
    await loadCommunitiesFromDb();
    await resolvePendingJoin();
  }

  function teardownSignals() {
    if (unsubscribeInbox) { try { unsubscribeInbox(); } catch (e) { /* ignore */ } unsubscribeInbox = null; }
    currentInboxUid = null;
    inboxSignals = [];
    ownerJoinRequests = [];
    friends = new Set();
    incomingFriendRequests = [];
    lastPushedBehind = null;
    lastBehindWriteAt = 0;
    clearTimeout(behindPushTimer);
    behindPushTimer = null;
    activeThread = null;
    if (els.chatsLayout) els.chatsLayout.classList.remove("has-active");
    renderNotifications();
  }

  async function refreshInbox() {
    if (!signalsReady()) {
      inboxSignals = []; ownerJoinRequests = []; friends = new Set(); incomingFriendRequests = [];
      renderNotifications();
      return;
    }
    // Inbox messages, pending join requests I own, my friends, and incoming friend
    // requests — fetched together so the badge and both inbox tiers stay in sync.
    const out = await Promise.all([
      window.PointwellSignals.fetchInbox(state.account.userId, 200),
      window.PointwellSignals.getOwnerJoinRequests(),
      window.PointwellSignals.getFriends(),
      window.PointwellSignals.getIncomingFriendRequests()
    ]);
    inboxSignals = Array.isArray(out[0]) ? out[0] : [];
    ownerJoinRequests = Array.isArray(out[1]) ? out[1] : [];
    const friendRows = Array.isArray(out[2]) ? out[2] : [];
    friends = new Set(friendRows.map((f) => String(f.user_id)));
    // Names from friends/requests help the inbox label conversations I started.
    friendRows.forEach((f) => { if (f.display_name) rememberPeerName(String(f.user_id), f.display_name); });
    incomingFriendRequests = Array.isArray(out[3]) ? out[3] : [];
    renderNotifications();
  }

  function handleInboxChange(payload) {
    // The Chats inbox is rebuilt from the freshly-fetched inbox and re-sorted by
    // latest time, so the affected conversation moves to the top automatically.
    refreshInbox();
    // Also live-update an OPEN thread with the same peer so a new message appears
    // without a reload — for recipient (incoming) and sender (peer's reply) alike.
    // offsetParent !== null means the thread is actually on screen, so we never
    // mark messages read while it's collapsed or behind another view.
    if (activeThread && activeThread.thread && activeThread.thread.isConnected
        && activeThread.thread.offsetParent !== null
        && payload && payload.new && payload.new.from_user === activeThread.peerId) {
      refreshThread(activeThread.community, activeThread.memberItem, activeThread.thread).catch(() => {});
    }
    if (payload && payload.eventType === "INSERT" && payload.new && !payload.new.read) {
      const who = payload.new.from_name || "A teammate";
      const t = payload.new.type;
      const kind = t === "motivation" ? "motivation" : (t === "text" ? "a message" : "kudos");
      showToast(`${who} sent you ${kind}`);
    }
  }

  // The unread count drives the Chats nav-tab badge — the SAME unreadCount over
  // the SAME fetched inbox the conversation list is built from, so the badge and
  // the list can never disagree. (The old desktop-only bell + notif panel were
  // removed; the Chats inbox supersedes them.)
  function renderNotifications() {
    const ready = signalsReady();
    const me = state.account && state.account.userId;
    // Count only RECEIVED unread — the inbox now also holds my sent rows, which are
    // never "unread" for me.
    // Exclude peers I blocked-from-a-request this session so the badge can't count
    // a hidden conversation's unread (keeps badge and list in agreement).
    const unread = ready ? window.PointwellSignals.unreadCount(inboxSignals.filter((s) => s.to_user === me && !sessionHiddenPeers.has(String(s.from_user)))) : 0;
    const requestCount = ready ? ownerJoinRequests.length : 0;
    const friendReqCount = ready ? incomingFriendRequests.length : 0;
    const badge = unread + requestCount + friendReqCount; // tab badge: messages + join requests + friend requests
    if (els.chatsUnreadBadge) {
      els.chatsUnreadBadge.textContent = badge > 9 ? "9+" : String(badge);
      els.chatsUnreadBadge.hidden = badge === 0;
    }
    if (els.chatsMarkAllButton) els.chatsMarkAllButton.hidden = unread === 0;
    renderOwnerRequests(ready);
    renderFriendRequests(ready);
    renderChats(ready);
  }

  // Pending join requests for communities I own — action items (Accept / Decline),
  // deliberately NOT chat rows (no reply box). Shown above the conversation list.
  function renderOwnerRequests(ready) {
    if (!els.chatsRequests) return;
    if (!ready || !ownerJoinRequests.length) {
      els.chatsRequests.innerHTML = "";
      els.chatsRequests.hidden = true;
      return;
    }
    els.chatsRequests.hidden = false;
    els.chatsRequests.innerHTML =
      `<div class="join-requests-head"><strong>Join requests</strong><span>${ownerJoinRequests.length} pending</span></div>` +
      ownerJoinRequests.map(renderJoinRequestItem).join("");
  }

  function renderJoinRequestItem(req) {
    const label = req.requester_name || req.requester_handle || "A member";
    const who = escapeHtml(label);
    const initials = escapeHtml(getInitials(label));
    const community = escapeHtml(req.community_name || "your community");
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(req.created_at, Date.now()));
    const id = escapeHtml(String(req.request_id));
    return `
      <div class="join-request-item" data-request-id="${id}">
        <span class="member-avatar" aria-hidden="true">${initials}</span>
        <div class="join-request-main">
          <strong>${who}</strong>
          <span>wants to join ${community} &middot; ${when}</span>
        </div>
        <div class="join-request-actions">
          <button class="primary-button small" type="button" data-request-accept="${id}">Accept</button>
          <button class="ghost-button small" type="button" data-request-decline="${id}">Decline</button>
        </div>
      </div>
    `;
  }

  async function respondToRequest(requestId, accept) {
    if (!signalsReady() || !requestId) return;
    const res = await window.PointwellSignals.respondToJoinRequest(requestId, accept);
    if (res.error) { showToast(communityDbError(res.error, "Couldn't respond to that request")); return; }
    showToast(accept ? "Request accepted — they're now a member" : "Request declined");
    await refreshInbox();          // drop it from the pending list + badge
    await loadCommunitiesFromDb(); // member count reflects the new member
  }

  // Remember a peer's display name so a conversation I STARTED (whose rows carry
  // only my own from_name) still shows the right name in the Chats list, even after
  // a reload and before the peer has replied.
  function rememberPeerName(peerId, name) {
    if (!peerId || !name) return;
    if (!state.peerNames) state.peerNames = {};
    if (state.peerNames[peerId] !== name) {
      state.peerNames[peerId] = name;
      saveState();
    }
  }
  function rememberedPeerName(peerId) {
    return (state.peerNames && state.peerNames[peerId]) || "Member";
  }

  // Group the inbox into one row per OTHER person — a conversation. The inbox holds
  // BOTH directions now (sent + received), so the conversation shows for both
  // participants. The peer is whichever party isn't me. Unread counts RECEIVED
  // unread only (a row I sent is never "unread" for me).
  function groupConversations(signals) {
    const me = state.account && state.account.userId;
    const groups = new Map();
    signals.forEach((sig) => {
      const peer = sig.from_user === me ? sig.to_user : sig.from_user;
      if (!peer || peer === me) return;
      if (sessionHiddenPeers.has(String(peer))) return; // blocked from a request this session
      const incoming = sig.to_user === me;
      let group = groups.get(peer);
      if (!group) {
        group = { peerId: peer, name: "", latest: sig, communityId: sig.community_id || "", unread: 0,
                  hasIncomingText: false, hasOutgoingText: false };
        groups.set(peer, group);
      }
      // The peer's display name is only carried on rows THEY sent (from_name).
      if (incoming && sig.from_name) group.name = sig.from_name;
      if (sig.type === "text") {
        if (incoming) group.hasIncomingText = true; else group.hasOutgoingText = true;
      }
      if (new Date(sig.created_at) >= new Date(group.latest.created_at)) {
        group.latest = sig;
        if (sig.community_id) group.communityId = sig.community_id;
      }
      if (incoming && !sig.read) group.unread += 1;
    });
    return Array.from(groups.values())
      .map((group) => {
        const isFriend = friends.has(String(group.peerId));
        // "Message request": a non-friend cold-messaged me and I never replied. Once
        // we're friends OR I've sent any text back, it graduates to the Main inbox.
        // Kudos/motivation-only conversations never qualify (no incoming text).
        const isRequest = !isFriend && group.hasIncomingText && !group.hasOutgoingText;
        return { ...group, name: group.name || rememberedPeerName(group.peerId), isFriend, isRequest };
      })
      .sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));
  }

  function renderChats(ready) {
    if (!els.chatsList) return;
    if (!ready) {
      els.chatsList.innerHTML = `<div class="chats-empty">Sign in to see your chats.</div>`;
      renderMessageRequests(false, []);
      if (els.chatsLayout) els.chatsLayout.classList.remove("has-active");
      return;
    }
    const groups = groupConversations(inboxSignals);
    const main = groups.filter((g) => !g.isRequest);
    const requests = groups.filter((g) => g.isRequest);
    els.chatsList.innerHTML = main.length
      ? main.map(renderChatRow).join("")
      : `<div class="chats-empty">No chats yet. Messages, kudos, and motivation from friends show up here.</div>`;
    renderMessageRequests(true, requests);
  }

  // Tier 2 of the inbox: conversations a NON-friend started with me that I haven't
  // engaged. Each row opens (to read/reply, which graduates it), or I can add them
  // as a friend or block them outright.
  function renderMessageRequests(ready, requests) {
    if (!els.chatsMessageRequests) return;
    if (!ready || !requests.length) {
      els.chatsMessageRequests.innerHTML = "";
      els.chatsMessageRequests.hidden = true;
      return;
    }
    els.chatsMessageRequests.hidden = false;
    els.chatsMessageRequests.innerHTML =
      `<div class="join-requests-head"><strong>Message requests</strong><span>${requests.length} from people you haven't added</span></div>` +
      requests.map(renderMessageRequestRow).join("");
  }

  function renderMessageRequestRow(group) {
    const who = escapeHtml(group.name);
    const initials = escapeHtml(getInitials(group.name));
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(group.latest.created_at, Date.now()));
    const preview = escapeHtml(group.latest.body || "");
    const peer = escapeHtml(String(group.peerId));
    return `
      <div class="message-request-item${group.unread ? " unread" : ""}">
        <button class="message-request-open" type="button" data-msgreq-open="${peer}" data-msgreq-name="${who}" data-community-id="${escapeHtml(group.communityId || "")}">
          <span class="member-avatar" aria-hidden="true">${initials}</span>
          <span class="chat-row-main">
            <span class="chat-row-top"><strong>${who}</strong><span class="chat-row-time">${when}</span></span>
            <span class="chat-row-preview"><span class="chat-row-preview-text">${preview}</span></span>
          </span>
          ${group.unread ? '<span class="notif-dot" aria-hidden="true"></span>' : ""}
        </button>
        <div class="message-request-actions">
          <button class="primary-button small" type="button" data-msgreq-add="${peer}" data-msgreq-name="${who}">Add friend</button>
          <button class="ghost-button small" type="button" data-msgreq-block="${peer}" data-msgreq-name="${who}">Block</button>
        </div>
      </div>
    `;
  }

  function renderChatRow(group) {
    const me = state.account && state.account.userId;
    const who = escapeHtml(group.name);
    const initials = escapeHtml(getInitials(group.name));
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(group.latest.created_at, Date.now()));
    const labels = { kudos: "Kudos", motivation: "Motivation" };
    const type = group.latest.type;
    const pill = labels[type] ? `<span class="signal-pill ${type}">${labels[type]}</span>` : "";
    const mine = group.latest.from_user === me;
    const preview = escapeHtml((mine ? "You: " : "") + (group.latest.body || ""));
    return `
      <button class="chat-row${group.unread ? " unread" : ""}" type="button" data-peer-id="${escapeHtml(group.peerId)}" data-peer-name="${who}" data-community-id="${escapeHtml(group.communityId || "")}">
        <span class="member-avatar" aria-hidden="true">${initials}</span>
        <span class="chat-row-main">
          <span class="chat-row-top"><strong>${who}</strong><span class="chat-row-time">${when}</span></span>
          <span class="chat-row-preview">${pill}<span class="chat-row-preview-text">${preview}</span></span>
        </span>
        ${group.unread ? '<span class="notif-dot" aria-hidden="true"></span>' : ""}
      </button>
    `;
  }

  // Open a conversation from the Chats inbox. Reuses the EXISTING thread view:
  // mount the shared messageThreadMarkup() and drive it with the existing
  // bindThreadControls() + openMessageThread() — no second thread implementation.
  function openChatConversation(peerId, peerName, communityId) {
    if (!els.chatsThreadMount || !signalsReady() || !peerId) return;
    const community = { id: communityId || null };
    const memberItem = { id: peerId, userId: peerId, name: peerName || "A teammate" };
    const firstName = escapeHtml(memberFirstName(memberItem));
    // Fresh markup each open => no stacked listeners from a prior conversation.
    els.chatsThreadMount.innerHTML = messageThreadMarkup(firstName, { hidden: false });
    const thread = els.chatsThreadMount.querySelector(".message-thread");
    if (!thread) return;
    bindThreadControls(community, memberItem, thread);
    openMessageThread(community, memberItem, thread).catch(() => {});
    if (els.chatsLayout) els.chatsLayout.classList.add("has-active");
    // Tapping a conversation clears its unread — including kudos/motivation, which
    // have no thread of their own. refreshThread() also marks text messages read;
    // doing both is idempotent and keeps the badge and list in sync.
    const unreadIds = inboxSignals
      .filter((sig) => sig.from_user === peerId && !sig.read)
      .map((sig) => sig.id);
    if (unreadIds.length) {
      Promise.resolve(window.PointwellSignals.markRead(unreadIds)).then(() => refreshInbox()).catch(() => {});
    }
  }

  // ── Friends: incoming requests (Accept/Decline) ───────────────────────────
  // Renders into the "Add friend" panel and keeps the toolbar badge in sync. Runs
  // on every inbox refresh so the badge is right even while the panel is closed.
  function renderFriendRequests(ready) {
    const count = ready ? incomingFriendRequests.length : 0;
    if (els.chatsFriendReqBadge) {
      els.chatsFriendReqBadge.textContent = count > 9 ? "9+" : String(count);
      els.chatsFriendReqBadge.hidden = count === 0;
    }
    if (!els.chatsFriendRequests) return;
    if (!count) {
      els.chatsFriendRequests.innerHTML = `<p class="chats-panel-empty">No pending friend requests.</p>`;
      return;
    }
    els.chatsFriendRequests.innerHTML =
      `<div class="join-requests-head"><strong>Friend requests</strong><span>${count} pending</span></div>` +
      incomingFriendRequests.map(renderFriendRequestItem).join("");
  }

  function renderFriendRequestItem(req) {
    const label = req.requester_name || req.requester_handle || "Someone";
    const who = escapeHtml(label);
    const initials = escapeHtml(getInitials(label));
    const handle = escapeHtml(cleanHandle(req.requester_handle || "") || "");
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(req.created_at, Date.now()));
    const id = escapeHtml(String(req.request_id));
    return `
      <div class="join-request-item" data-friend-request-id="${id}">
        <span class="member-avatar" aria-hidden="true">${initials}</span>
        <div class="join-request-main">
          <strong>${who}</strong>
          <span>wants to connect${handle ? " &middot; " + handle : ""} &middot; ${when}</span>
        </div>
        <div class="join-request-actions">
          <button class="primary-button small" type="button" data-friend-accept="${id}">Accept</button>
          <button class="ghost-button small" type="button" data-friend-decline="${id}">Decline</button>
        </div>
      </div>
    `;
  }

  async function respondToFriendRequest(requestId, accept) {
    if (!signalsReady() || !requestId) return;
    // Capture the requester BEFORE refreshInbox clears the pending list, so we can
    // fix the search-panel row's status in place (it self-corrects otherwise only on
    // the next keystroke).
    const req = incomingFriendRequests.find((r) => String(r.request_id) === String(requestId));
    const requesterId = req ? String(req.requester_user) : "";
    const res = await window.PointwellSignals.respondToFriendRequest(requestId, accept);
    if (res.error) { showToast(communityDbError(res.error, "Couldn't respond to that request")); return; }
    showToast(accept ? "Friend request accepted" : "Friend request declined");
    await refreshInbox();          // updates friends set, badge, and reclassifies the inbox
    if (requesterId) {
      const row = friendSearchResults.find((p) => String(p.id) === requesterId);
      if (row) row.status = accept ? "friends" : "none";
    }
    renderFriendSearchResults();   // reflect the change if the search list is showing them
  }

  // Accept the pending request a given user sent me (used from the search results,
  // where I only know their user id). Looks the request up in the incoming list.
  function acceptFriendByUser(userId) {
    const req = incomingFriendRequests.find((r) => String(r.requester_user) === String(userId));
    if (req) respondToFriendRequest(req.request_id, true);
  }

  // ── Chats toolbar panels: "New message" + "Add friend" ─────────────────────
  function toggleChatsPanel(panel) {
    chatsActivePanel = chatsActivePanel === panel ? "" : panel;
    renderChatsPanels();
    if (chatsActivePanel === "new-message" && els.chatsNewMessageInput) {
      requestAnimationFrame(() => els.chatsNewMessageInput.focus());
    }
    if (chatsActivePanel === "add-friend" && els.chatsAddFriendInput) {
      requestAnimationFrame(() => els.chatsAddFriendInput.focus());
    }
  }

  function renderChatsPanels() {
    if (els.chatsNewMessagePanel) els.chatsNewMessagePanel.hidden = chatsActivePanel !== "new-message";
    if (els.chatsAddFriendPanel) els.chatsAddFriendPanel.hidden = chatsActivePanel !== "add-friend";
    if (els.chatsNewMessageButton) els.chatsNewMessageButton.classList.toggle("active", chatsActivePanel === "new-message");
    if (els.chatsAddFriendButton) els.chatsAddFriendButton.classList.toggle("active", chatsActivePanel === "add-friend");
  }

  // "New message": search people I'm ALLOWED to message (public OR friends), via the
  // server-side gate. Selecting one opens the shared thread view. Debounced + guarded.
  function runMessageSearch(rawQuery) {
    const query = String(rawQuery || "").trim();
    clearTimeout(messageSearchTimer);
    if (!signalsReady() || query.length < 2) {
      messageSearchResults = [];
      messageSearchLoading = false;
      messageSearchSeq++;
      renderMessageSearchResults();
      return;
    }
    messageSearchLoading = true;
    const seq = ++messageSearchSeq;
    renderMessageSearchResults();
    messageSearchTimer = setTimeout(() => {
      Promise.resolve(window.PointwellSignals.searchMessageableProfiles(query)).then((rows) => {
        if (seq !== messageSearchSeq) return;
        messageSearchResults = Array.isArray(rows) ? rows : [];
        messageSearchLoading = false;
        renderMessageSearchResults();
      }).catch(() => {
        if (seq !== messageSearchSeq) return;
        messageSearchResults = [];
        messageSearchLoading = false;
        renderMessageSearchResults();
      });
    }, 250);
  }

  function renderMessageSearchResults() {
    if (!els.chatsNewMessageResults) return;
    if (messageSearchLoading) { els.chatsNewMessageResults.innerHTML = `<p class="chats-panel-empty">Searching…</p>`; return; }
    if (!messageSearchResults.length) {
      els.chatsNewMessageResults.innerHTML = `<p class="chats-panel-empty">Search by name or handle to start a conversation. You can message friends and anyone with a public profile.</p>`;
      return;
    }
    els.chatsNewMessageResults.innerHTML = messageSearchResults.map((p) => renderChatsPersonRow(p, "message")).join("");
  }

  // "Add friend": general people search, each annotated with our relationship so the
  // button reflects state (Add / Requested / Friends / Accept). Debounced + guarded.
  function runFriendSearch(rawQuery) {
    const query = String(rawQuery || "").trim();
    clearTimeout(friendSearchTimer);
    if (!signalsReady() || query.length < 2) {
      friendSearchResults = [];
      friendSearchLoading = false;
      friendSearchSeq++;
      renderFriendSearchResults();
      return;
    }
    friendSearchLoading = true;
    const seq = ++friendSearchSeq;
    renderFriendSearchResults();
    friendSearchTimer = setTimeout(() => {
      Promise.resolve(window.PointwellSignals.searchProfiles(query)).then(async (rows) => {
        if (seq !== friendSearchSeq) return;
        const list = Array.isArray(rows) ? rows : [];
        const statuses = await Promise.all(
          list.map((p) => Promise.resolve(window.PointwellSignals.getFriendshipStatus(String(p.id))).catch(() => "none"))
        );
        if (seq !== friendSearchSeq) return;
        friendSearchResults = list.map((p, i) => ({ ...p, status: statuses[i] || "none" }));
        friendSearchLoading = false;
        renderFriendSearchResults();
      }).catch(() => {
        if (seq !== friendSearchSeq) return;
        friendSearchResults = [];
        friendSearchLoading = false;
        renderFriendSearchResults();
      });
    }, 250);
  }

  function renderFriendSearchResults() {
    if (!els.chatsAddFriendResults) return;
    if (friendSearchLoading) { els.chatsAddFriendResults.innerHTML = `<p class="chats-panel-empty">Searching…</p>`; return; }
    if (!friendSearchResults.length) {
      els.chatsAddFriendResults.innerHTML = `<p class="chats-panel-empty">Search by name or handle to send a friend request.</p>`;
      return;
    }
    els.chatsAddFriendResults.innerHTML = friendSearchResults.map((p) => renderChatsPersonRow(p, "friend")).join("");
  }

  // One person row, shared by both panels. mode "message" → a Message button;
  // mode "friend" → an action that reflects the relationship status.
  function renderChatsPersonRow(person, mode) {
    const name = escapeHtml(person.display_name || "Member");
    const handle = escapeHtml(cleanHandle(person.handle || "") || "@member");
    const initials = escapeHtml(getInitials(person.display_name || "Member"));
    const id = escapeHtml(String(person.id));
    let action;
    if (mode === "message") {
      action = `<button class="primary-button small" type="button" data-message-person="${id}" data-message-name="${name}">Message</button>`;
    } else if (person.status === "friends") {
      action = `<span class="chats-person-status">Friends</span>`;
    } else if (person.status === "pending_out") {
      action = `<span class="chats-person-status">Requested</span>`;
    } else if (person.status === "pending_in") {
      action = `<button class="primary-button small" type="button" data-friend-accept-user="${id}">Accept request</button>`;
    } else {
      action = `<button class="primary-button small" type="button" data-friend-add="${id}" data-friend-name="${name}">Add friend</button>`;
    }
    return `
      <div class="chats-person-row">
        <span class="member-avatar" aria-hidden="true">${initials}</span>
        <div class="chats-person-main"><strong>${name}</strong><span>${handle}</span></div>
        ${action}
      </div>
    `;
  }

  async function sendFriendRequestTo(userId, name) {
    if (!signalsReady() || !userId) return;
    const res = await window.PointwellSignals.sendFriendRequest(state.account.userId, userId);
    if (res.error) { showToast(communityDbError(res.error, "Couldn't send friend request")); return; }
    if (name) rememberPeerName(userId, name);
    showToast(res.already ? "Friend request already sent" : `Friend request sent to ${name || "them"}`);
    const row = friendSearchResults.find((p) => String(p.id) === String(userId));
    if (row) { row.status = "pending_out"; renderFriendSearchResults(); }
  }

  // Open a conversation from a panel (New message) or message-request row. Closes the
  // open panel and reuses the shared thread view via openChatConversation().
  function openConversationFromPanel(userId, name) {
    if (!userId) return;
    if (name) rememberPeerName(userId, name);
    chatsActivePanel = "";
    renderChatsPanels();
    openChatConversation(userId, name || rememberedPeerName(userId), "");
  }

  async function blockFromRequest(userId, name) {
    if (!signalsReady() || !userId) return;
    const res = await window.PointwellSignals.blockUser(state.account.userId, userId);
    if (res.error) { showToast("Couldn't block right now"); return; }
    sessionHiddenPeers.add(String(userId)); // drop the request row immediately
    showToast(`Blocked ${name || "them"} — they can no longer message you`);
    renderNotifications(); // re-render BOTH the list and the badge from the same source
  }

  // The top-right header avatar routes to the existing Profile & privacy view —
  // the settings content and Save are unchanged; only how it's reached moved here.
  function openProfile() {
    state.activeView = "profile";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  async function markAllSignalsRead() {
    if (!signalsReady()) return;
    await window.PointwellSignals.markAllRead(state.account.userId);
    await refreshInbox();
  }

  // The current user's "behind" status from their PERSONAL daily pace, using the
  // single definition exported by insight.js (never a second definition).
  function computeMyBehind() {
    const system = getTrackerSystem();
    if (!system || !window.PointwellInsight) return false;
    const context = { type: "personal", community: null, system, label: "" };
    const values = collectDraftValues(system, valuesForScoreContext(context));
    const summary = calculateDashboardSummary(system, values, context);
    const facts = window.PointwellInsight.computeInsightFacts({
      mode: "personal",
      total: summary.total,
      target: summary.target.total,
      entryCount: summary.entryCount,
      weeklyAverage: insightWeeklyAverage(context, system),
      rules: []
    });
    return window.PointwellInsight.isBehind(facts);
  }

  function pushMyBehindStatus() {
    if (!signalsReady()) return;
    clearTimeout(behindPushTimer);
    behindPushTimer = setTimeout(() => {
      if (!signalsReady()) return;
      const behind = computeMyBehind();
      const now = Date.now();
      const changed = behind !== lastPushedBehind;
      // Write on change; while still behind, refresh at most every 5 min so the
      // server-stamped behind_updated_at stays inside the "currently" window
      // without a write storm.
      const refreshWhileBehind = behind && (now - lastBehindWriteAt > 5 * 60 * 1000);
      if (!changed && !refreshWhileBehind) return;
      lastPushedBehind = behind;
      lastBehindWriteAt = now;
      Promise.resolve(window.PointwellSignals.updateBehind(state.account.userId, behind)).catch(() => {});
    }, 400);
  }

  function memberFirstName(member) {
    return String((member && member.name) || "Member").split(" ")[0] || "Member";
  }

  // Per-member send affordances rendered into the member-activity view.
  function renderMemberSignalActions(community, memberItem) {
    if (!memberItem || memberItem.id === "me" || !signalsReady()) return "";
    const firstName = escapeHtml(memberFirstName(memberItem));
    return `
      <section class="signal-actions" aria-label="Connect with this member">
        <div class="signal-actions-head">
          <strong>Connect with ${firstName}</strong>
          <span>Send a signal, or open a private conversation.</span>
        </div>
        <div class="signal-actions-buttons">
          <button class="secondary-button small signal-open-button" type="button" data-signal-type="kudos">Send kudos</button>
          <button class="ghost-button small signal-open-button signal-motivation-button" type="button" data-signal-type="motivation" hidden>Send motivation</button>
          <button class="ghost-button small message-open-button" type="button">Message</button>
        </div>
        <div class="signal-composer" hidden>
          <span class="signal-composer-label"></span>
          <div class="signal-presets"></div>
        </div>
        ${messageThreadMarkup(firstName, { hidden: true })}
      </section>
    `;
  }

  // Single source of truth for the conversation-thread markup. Used by the member
  // activity panel AND the Chats inbox so there is exactly one thread view. The
  // child selectors (.message-thread-list, .message-composer, …) are what
  // bindThreadControls() and openMessageThread() wire up. firstName must already
  // be escaped by the caller.
  function messageThreadMarkup(firstName, opts) {
    const hidden = opts && opts.hidden ? " hidden" : "";
    return `
        <div class="message-thread"${hidden}>
          <div class="message-thread-head">
            <strong>Conversation with ${firstName}</strong>
            <button class="ghost-button small message-block-button" type="button" data-blocked="false">Block</button>
          </div>
          <div class="message-thread-list" aria-live="polite"></div>
          <p class="message-blocked-note" hidden>You blocked ${firstName}. Unblock to message again.</p>
          <form class="message-composer">
            <textarea class="message-input" rows="2" maxlength="280" placeholder="Write a message…" aria-label="Message text"></textarea>
            <div class="message-composer-foot">
              <span class="message-counter">0/280</span>
              <button class="primary-button small message-send-button" type="submit" disabled>Send</button>
            </div>
          </form>
        </div>`;
  }

  function bindMemberSignalActions(community, memberItem, root) {
    root = root || els.memberActivityPanel;
    if (!root || !memberItem || memberItem.id === "me" || !signalsReady()) return;
    const actions = root.querySelector(".signal-actions");
    if (!actions) return;
    const composer = actions.querySelector(".signal-composer");
    const label = actions.querySelector(".signal-composer-label");
    const presets = actions.querySelector(".signal-presets");

    actions.querySelectorAll(".signal-open-button").forEach((button) => {
      button.addEventListener("click", () => {
        const type = button.dataset.signalType === "motivation" ? "motivation" : "kudos";
        label.textContent = type === "motivation" ? "Pick an encouragement to send:" : "Pick a kudos to send:";
        presets.innerHTML = window.PointwellSignals.presetsForType(type)
          .map((text) => `<button class="signal-preset-chip" type="button" data-signal-type="${type}" data-signal-body="${escapeHtml(text)}">${escapeHtml(text)}</button>`)
          .join("");
        presets.querySelectorAll(".signal-preset-chip").forEach((chip) => {
          chip.addEventListener("click", () => {
            sendChosenSignal(community, memberItem, chip.dataset.signalType, chip.dataset.signalBody, composer);
          });
        });
        composer.hidden = false;
      });
    });

    // Reveal the motivation affordance ONLY if the member is nudgeable (opted-in
    // AND currently behind). The DB is the real guard; this just hides it otherwise.
    const motivationButton = actions.querySelector(".signal-motivation-button");
    if (motivationButton && memberItem.userId) {
      window.PointwellSignals.isNudgeable(memberItem.userId).then((ok) => {
        // Explicitly set both ways so a falsy result hides it, not just relying on
        // the initial hidden state (defensive; the DB still blocks the insert).
        // isConnected guards against a stale async result after the panel re-rendered.
        if (motivationButton.isConnected) motivationButton.hidden = !ok;
      }).catch(() => {});
    }

    // ── Messaging: "Message" opens the private conversation thread ──
    const messageButton = actions.querySelector(".message-open-button");
    const thread = actions.querySelector(".message-thread");
    if (messageButton && thread) {
      bindThreadControls(community, memberItem, thread);
      messageButton.addEventListener("click", () => {
        const opening = thread.hidden;
        thread.hidden = !opening;
        if (opening) openMessageThread(community, memberItem, thread).catch(() => {});
        else if (activeThread && activeThread.thread === thread) activeThread = null;
      });
    }
  }

  // ── Free-text messaging thread (inside the member-activity view) ───────────
  async function openMessageThread(community, memberItem, thread) {
    const list = thread.querySelector(".message-thread-list");
    const form = thread.querySelector(".message-composer");
    if (!memberItem.userId) {
      if (list) list.innerHTML = `<p class="message-empty">${escapeHtml(memberFirstName(memberItem))} is a demo member — messaging works between real accounts.</p>`;
      if (form) form.hidden = true;
      return;
    }
    if (form) form.hidden = false;
    // Remember this as the on-screen thread so realtime inserts refresh it live.
    activeThread = { peerId: memberItem.userId, community: community, memberItem: memberItem, thread: thread };
    rememberPeerName(memberItem.userId, memberItem.name);
    await refreshThread(community, memberItem, thread);
    await refreshBlockState(memberItem, thread);
  }

  async function refreshThread(community, memberItem, thread) {
    if (!signalsReady() || !memberItem.userId) return;
    const list = thread.querySelector(".message-thread-list");
    const messages = await window.PointwellSignals.fetchThread(state.account.userId, memberItem.userId, 100);
    if (!thread.isConnected || !list) return;
    list.innerHTML = messages.length
      ? messages.map(renderMessageBubble).join("")
      : `<p class="message-empty">No messages yet. Say hello 👋</p>`;
    list.scrollTop = list.scrollHeight;
    // Mark received-but-unread messages in this thread as read, then refresh the bell.
    const unreadIds = messages
      .filter((m) => m.to_user === state.account.userId && !m.read)
      .map((m) => m.id);
    if (unreadIds.length) {
      Promise.resolve(window.PointwellSignals.markRead(unreadIds)).then(() => refreshInbox()).catch(() => {});
    }
  }

  function renderMessageBubble(m) {
    const mine = m.from_user === state.account.userId;
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(m.created_at, Date.now()));
    return `
      <div class="message-bubble ${mine ? "mine" : "theirs"}">
        <p>${escapeHtml(m.body)}</p>
        <div class="message-bubble-foot">
          <span>${when}</span>
          ${mine ? "" : `<button class="message-report-link" type="button" data-report-id="${escapeHtml(m.id)}">Report</button>`}
        </div>
      </div>
    `;
  }

  function bindThreadControls(community, memberItem, thread) {
    const form = thread.querySelector(".message-composer");
    const input = thread.querySelector(".message-input");
    const counter = thread.querySelector(".message-counter");
    const sendButton = thread.querySelector(".message-send-button");
    const blockButton = thread.querySelector(".message-block-button");
    const list = thread.querySelector(".message-thread-list");
    const max = (window.PointwellSignals && window.PointwellSignals.MAX_BODY) || 280;
    if (input) input.setAttribute("maxlength", String(max)); // keep the cap in sync with MAX_BODY

    function updateCounter() {
      const len = (input.value || "").length;
      if (counter) counter.textContent = len + "/" + max;
      if (sendButton) sendButton.disabled = len === 0 || len > max;
    }
    if (input) { input.addEventListener("input", updateCounter); updateCounter(); }

    if (form) form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = (input.value || "").trim();
      if (!body) return;
      if (!memberItem.userId) { showToast(`${memberFirstName(memberItem)} is a demo member`); return; }
      if (sendButton) sendButton.disabled = true;
      const result = await window.PointwellSignals.sendSignal({
        type: "text",
        body: body,
        fromUser: state.account.userId,
        toUser: memberItem.userId,
        fromName: state.profile.name,
        communityId: community.id
      });
      if (result.error) {
        // Neutral message — never reveal whether the recipient blocked you.
        showToast("Couldn't send your message right now.");
        if (sendButton) sendButton.disabled = false;
        return;
      }
      input.value = "";
      updateCounter();
      await refreshThread(community, memberItem, thread);
      // Realtime won't echo my own send (the inbox channel filters to_user=me), so
      // refresh the inbox locally → the conversation shows/moves to top in MY Chats.
      refreshInbox();
    });

    if (blockButton) blockButton.addEventListener("click", () => { toggleBlock(memberItem, thread, blockButton).catch(() => {}); });

    if (list) list.addEventListener("click", (event) => {
      const link = event.target.closest && event.target.closest(".message-report-link");
      if (link) reportThreadMessage(link.dataset.reportId).catch(() => {});
    });
  }

  async function toggleBlock(memberItem, thread, blockButton) {
    if (!signalsReady() || !memberItem.userId) { showToast("Messaging works between real accounts"); return; }
    const me = state.account.userId;
    const firstName = memberFirstName(memberItem);
    if (blockButton.dataset.blocked === "true") {
      await window.PointwellSignals.unblockUser(me, memberItem.userId);
      showToast(`Unblocked ${firstName}`);
    } else {
      const res = await window.PointwellSignals.blockUser(me, memberItem.userId);
      if (res.error) { showToast("Couldn't block right now"); return; }
      showToast(`Blocked ${firstName}`);
    }
    await refreshBlockState(memberItem, thread);
  }

  async function refreshBlockState(memberItem, thread) {
    if (!signalsReady() || !memberItem.userId) return;
    const blocked = await window.PointwellSignals.isBlockedByMe(state.account.userId, memberItem.userId);
    if (!thread.isConnected) return;
    const blockButton = thread.querySelector(".message-block-button");
    const form = thread.querySelector(".message-composer");
    const note = thread.querySelector(".message-blocked-note");
    if (blockButton) {
      blockButton.dataset.blocked = blocked ? "true" : "false";
      blockButton.textContent = blocked ? "Unblock" : "Block";
    }
    if (form) form.hidden = blocked;
    if (note) note.hidden = !blocked;
    // Re-sync the counter + send-button now the composer may have reappeared.
    const inputEl = thread.querySelector(".message-input");
    if (inputEl && !blocked) inputEl.dispatchEvent(new Event("input"));
  }

  async function reportThreadMessage(messageId) {
    if (!signalsReady() || !messageId) return;
    const res = await window.PointwellSignals.reportMessage(state.account.userId, messageId, "Reported from conversation");
    showToast(res.error ? "Couldn't file the report" : "Reported. Thanks — we'll review it.");
  }

  async function sendChosenSignal(community, memberItem, type, body, composer) {
    const firstName = memberFirstName(memberItem);
    if (!signalsReady()) { showToast("Sign in to send a signal"); return; }
    if (!memberItem.userId) {
      if (composer) composer.hidden = true;
      showToast(`${firstName} is a demo member — invite real friends to send signals`);
      return;
    }
    const result = await window.PointwellSignals.sendSignal({
      type,
      body,
      fromUser: state.account.userId,
      toUser: memberItem.userId,
      fromName: state.profile.name,
      communityId: community.id
    });
    if (composer) composer.hidden = true;
    if (result.error) {
      const message = /duplicate|unique/i.test(result.error.message || "")
        ? `You already sent ${firstName} ${type === "motivation" ? "motivation" : "kudos"} today`
        : (result.error.message || "Couldn't send that signal");
      showToast(message);
      return;
    }
    showToast(`${type === "motivation" ? "Motivation" : "Kudos"} sent to ${firstName}`);
    // Show the conversation in MY Chats too (realtime won't echo my own send).
    rememberPeerName(memberItem.userId, memberItem.name);
    refreshInbox();
  }

  function cacheElements() {
    const ids = [
      "profileAvatar",
      "headerAvatarButton",
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
      "viewLeaderboardButton",
      "openCommunityButton",
      "addEntryTitle",
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
      "dailyInsightCard",
      "dailyInsightText",
      "quickLogChips",
      "topCardPanel",
      "visualBreakdownPanel",
      "weeklyProgressPanel",
      "authScreen",
      "signOutButton",
      "profileSignOutButton",
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
      "communityFeed",
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
      "communityLeaderboardPanel",
      "communityPeriodTabs",
      "communityAnalytics",
      "communityAnalyticsSettings",
      "communityAnalyticsSettingsHint",
      "ccModuleLeaderboard",
      "ccModuleGroupTrends",
      "ccModuleIndividualTrends",
      "ccModuleUnderperforming",
      "ccDefaultPeriodInput",
      "ccMetricInput",
      "backFromMemberActivityButton",
      "memberActivityTitle",
      "memberActivityTotal",
      "memberActivityPanel",
      "communityCheckinSection",
      "communityLiveScore",
      "communityInputList",
      "saveCommunityEntryButton",
      "createCommunityView",
      "cancelCreateCommunityButton",
      "createCommunityStepKicker",
      "createCommunityStepTitle",
      "createCommunityStepIntro",
      "createCommunityStepper",
      "createCommunityForm",
      "ccNameInput",
      "ccCategoryInput",
      "ccDescriptionInput",
      "ccVisibilityInput",
      "communityDraftRuleCount",
      "communityDraftRuleList",
      "communityDraftRuleForm",
      "ccRuleFormTitle",
      "cancelCcRuleEditButton",
      "ccRuleLabelInput",
      "ccRuleUnitField",
      "ccRuleUnitInput",
      "ccRuleTypeInput",
      "ccRuleGoalField",
      "ccRuleGoalLabel",
      "ccRuleGoalInput",
      "ccRuleEveryAmountField",
      "ccRuleEveryAmountInput",
      "ccRulePointsLabel",
      "ccRulePointsInput",
      "ccRuleDataSourceInput",
      "ccRuleSourceMetricInput",
      "ccRuleManualOverrideInput",
      "ccRuleSubmitLabel",
      "createCommunityReview",
      "createCommunityBackButton",
      "createCommunityNextButton",
      "createCommunityCompleteButton",
      "ccMethodLanding",
      "ccEditorPanel",
      "ccAiPanel",
      "ccRulesPanel",
      "ccAiGoalsInput",
      "ccAiRewardInput",
      "ccAiPenalizeInput",
      "ccAiStrictnessInput",
      "ccAiTargetsInput",
      "ccAiGenerateButton",
      "ccRegenerateButton",
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
      "chatsView",
      "chatsList",
      "chatsRequests",
      "chatsThread",
      "chatsThreadMount",
      "chatsBackButton",
      "chatsMarkAllButton",
      "chatsUnreadBadge",
      "chatsLayout",
      "chatsNewMessageButton",
      "chatsAddFriendButton",
      "chatsFriendReqBadge",
      "chatsNewMessagePanel",
      "chatsNewMessageInput",
      "chatsNewMessageResults",
      "chatsAddFriendPanel",
      "chatsAddFriendInput",
      "chatsAddFriendResults",
      "chatsFriendRequests",
      "chatsMessageRequests",
      "onboardingScreen",
      "onboardingBody",
      "allowMotivationInput",
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
      "create-community": els.createCommunityView,
      "community-detail": els.communityDetailView,
      "community-settings": els.communitySettingsView,
      "community-member-activity": els.communityMemberActivityView,
      "find-communities": els.findCommunitiesView,
      chats: els.chatsView,
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
        if (state.activeView === "chats") refreshInbox();
        if (state.activeView === "communities") loadCommunitiesFromDb();
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
      const value = event.target.value || "";
      if (value.startsWith("community:")) {
        state.scoreContext = value;
        state.selectedCommunityId = getScoreCommunityId(value);
      } else {
        // personal:<systemId> — set the active personal system in the same step.
        state.scoreContext = "personal";
        state.trackerSystemId = value.replace(/^personal:/, "");
      }
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
      state.buildViewedProfileId = ""; // a new query leaves any open profile view
      runPeopleSearch(event.target.value);
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

    els.newCommunityButton.addEventListener("click", openCreateCommunity);
    els.findCommunitiesButton.addEventListener("click", openFindCommunities);
    els.viewLeaderboardButton.addEventListener("click", viewCommunityLeaderboardFromScore);
    els.openCommunityButton.addEventListener("click", openCommunityFromScore);
    els.backToCommunitiesButton.addEventListener("click", returnToCommunities);
    els.communitySettingsButton.addEventListener("click", openCommunitySettings);
    els.backFromCommunitySettingsButton.addEventListener("click", returnToCommunityDetail);
    els.backFromMemberActivityButton.addEventListener("click", returnToCommunityDetail);
    els.backFromFindCommunitiesButton.addEventListener("click", returnToCommunities);
    els.findCommunitySearchInput.addEventListener("input", (event) => {
      runCommunityCodeSearch(event.target.value);
    });
    if (els.chatsRequests) els.chatsRequests.addEventListener("click", (event) => {
      const accept = event.target.closest && event.target.closest("[data-request-accept]");
      const decline = event.target.closest && event.target.closest("[data-request-decline]");
      if (accept) respondToRequest(accept.dataset.requestAccept, true);
      else if (decline) respondToRequest(decline.dataset.requestDecline, false);
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

    els.cancelCreateCommunityButton.addEventListener("click", cancelCreateCommunity);
    els.createCommunityBackButton.addEventListener("click", () => {
      if (communityDraftStep === 0) setCommunityDraftMethod("");
      else moveCreateCommunityStep(-1);
    });
    els.createCommunityNextButton.addEventListener("click", () => moveCreateCommunityStep(1));
    els.createCommunityCompleteButton.addEventListener("click", finalizeCommunityDraft);
    els.createCommunityForm.addEventListener("input", syncCommunityDraftFromForm);
    els.createCommunityForm.addEventListener("change", syncCommunityDraftFromForm);
    els.createCommunityView.addEventListener("click", (event) => {
      const methodButton = event.target.closest("[data-cc-method]");
      if (methodButton) setCommunityDraftMethod(methodButton.dataset.ccMethod);
    });
    els.ccAiGenerateButton.addEventListener("click", generateCommunityAiRules);
    els.ccRegenerateButton.addEventListener("click", () => {
      const draft = ensureCommunityDraft();
      draft.rules = [];
      editingCommunityDraftRuleId = "";
      resetCommunityDraftRuleForm();
      saveState();
      renderCreateCommunity();
      requestAnimationFrame(() => els.ccAiGoalsInput?.focus());
    });
    els.communityDraftRuleForm.addEventListener("submit", saveCommunityDraftRule);
    els.ccRuleTypeInput.addEventListener("change", updateCcRuleBuilderVisibility);
    els.ccRuleDataSourceInput.addEventListener("change", () => {
      els.ccRuleSourceMetricInput.innerHTML = renderSourceMetricOptionHtml(els.ccRuleDataSourceInput.value || "manual", "");
    });
    els.cancelCcRuleEditButton.addEventListener("click", () => {
      editingCommunityDraftRuleId = "";
      resetCommunityDraftRuleForm();
      renderCreateCommunity();
    });

    els.saveProfileButton.addEventListener("click", saveProfile);
    if (els.profileSignOutButton) els.profileSignOutButton.addEventListener("click", () => {
      Promise.resolve(window.PointwellAuth && window.PointwellAuth.signOut && window.PointwellAuth.signOut()).catch(() => {});
    });
    if (els.headerAvatarButton) els.headerAvatarButton.addEventListener("click", openProfile);
    if (els.onboardingScreen) els.onboardingScreen.addEventListener("click", handleOnboardingClick);
    if (els.chatsMarkAllButton) els.chatsMarkAllButton.addEventListener("click", markAllSignalsRead);
    if (els.chatsNewMessageButton) els.chatsNewMessageButton.addEventListener("click", () => toggleChatsPanel("new-message"));
    if (els.chatsAddFriendButton) els.chatsAddFriendButton.addEventListener("click", () => toggleChatsPanel("add-friend"));
    if (els.chatsNewMessageInput) els.chatsNewMessageInput.addEventListener("input", (event) => runMessageSearch(event.target.value));
    if (els.chatsAddFriendInput) els.chatsAddFriendInput.addEventListener("input", (event) => runFriendSearch(event.target.value));
    if (els.chatsNewMessageResults) els.chatsNewMessageResults.addEventListener("click", (event) => {
      const t = event.target.closest && event.target.closest("[data-message-person]");
      if (t) openConversationFromPanel(t.dataset.messagePerson, t.dataset.messageName);
    });
    if (els.chatsAddFriendResults) els.chatsAddFriendResults.addEventListener("click", (event) => {
      const add = event.target.closest && event.target.closest("[data-friend-add]");
      const acceptUser = event.target.closest && event.target.closest("[data-friend-accept-user]");
      if (add) sendFriendRequestTo(add.dataset.friendAdd, add.dataset.friendName);
      else if (acceptUser) acceptFriendByUser(acceptUser.dataset.friendAcceptUser);
    });
    if (els.chatsFriendRequests) els.chatsFriendRequests.addEventListener("click", (event) => {
      const accept = event.target.closest && event.target.closest("[data-friend-accept]");
      const decline = event.target.closest && event.target.closest("[data-friend-decline]");
      if (accept) respondToFriendRequest(accept.dataset.friendAccept, true);
      else if (decline) respondToFriendRequest(decline.dataset.friendDecline, false);
    });
    if (els.chatsMessageRequests) els.chatsMessageRequests.addEventListener("click", (event) => {
      const open = event.target.closest && event.target.closest("[data-msgreq-open]");
      const add = event.target.closest && event.target.closest("[data-msgreq-add]");
      const block = event.target.closest && event.target.closest("[data-msgreq-block]");
      if (add) sendFriendRequestTo(add.dataset.msgreqAdd, add.dataset.msgreqName);
      else if (block) blockFromRequest(block.dataset.msgreqBlock, block.dataset.msgreqName);
      else if (open) openConversationFromPanel(open.dataset.msgreqOpen, open.dataset.msgreqName);
    });
    if (els.chatsList) els.chatsList.addEventListener("click", (event) => {
      const row = event.target.closest && event.target.closest(".chat-row");
      if (!row) return;
      openChatConversation(row.dataset.peerId, row.dataset.peerName, row.dataset.communityId);
    });
    if (els.chatsBackButton) els.chatsBackButton.addEventListener("click", () => {
      if (els.chatsLayout) els.chatsLayout.classList.remove("has-active");
      activeThread = null; // leaving the open thread → stop live-refreshing it
    });
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
    renderCreateCommunity();
    renderCommunitySettings();
    renderCommunityMemberActivity();
    renderFindCommunities();
    renderProfile();
    renderNotifications();
    pushMyBehindStatus();
  }

  function renderChrome() {
    if (!els.views[state.activeView]) state.activeView = "dashboard";
    els.tabs.forEach((tab) => {
      const isActive = tab.dataset.view === state.activeView
        || ((state.activeView === "add-entry" || state.activeView === "customize-top-card" || state.activeView === "customize-charts") && tab.dataset.view === "dashboard")
        || ((state.activeView === "create-community" || state.activeView === "community-detail" || state.activeView === "community-settings" || state.activeView === "community-member-activity" || state.activeView === "find-communities") && tab.dataset.view === "communities");
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-current", isActive ? "page" : "false");
    });
    Object.entries(els.views).forEach(([name, view]) => {
      view.classList.toggle("is-visible", name === state.activeView);
    });

    const initials = getInitials(state.profile.name);
    if (els.profileAvatar) els.profileAvatar.textContent = initials;
    if (els.largeAvatar) els.largeAvatar.textContent = initials;
    if (els.headerAvatarButton) els.headerAvatarButton.classList.toggle("is-active", state.activeView === "profile");
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

  function openCommunityFromScore() {
    const context = getActiveScoreContext();
    if (context.type !== "community" || !context.community) return;
    state.selectedCommunityId = context.community.id;
    state.activeView = "community-detail";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function viewCommunityLeaderboardFromScore() {
    const context = getActiveScoreContext();
    if (context.type !== "community" || !context.community) return;
    state.selectedCommunityId = context.community.id;
    state.activeView = "community-detail";
    saveState();
    render();
    requestAnimationFrame(() => {
      const panel = els.leaderboardList?.closest(".community-leaderboard-panel") || els.leaderboardList;
      if (panel && typeof panel.scrollIntoView === "function") {
        panel.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    });
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
    // ONE grouped dropdown: a concrete option per personal system and per joined
    // community. The value encodes the full context (personal:<systemId> /
    // community:<communityId>) so picking it sets everything in one step.
    const personalOptions = state.systems.map((system) => `
      <option value="personal:${escapeHtml(system.id)}">${escapeHtml(system.title || "Untitled system")}</option>
    `).join("");
    const communityOptions = state.communities.map((community) => `
      <option value="community:${escapeHtml(community.id)}">${escapeHtml(community.name)}</option>
    `).join("");
    return `
      ${personalOptions ? `<optgroup label="Personal">${personalOptions}</optgroup>` : ""}
      ${communityOptions ? `<optgroup label="Communities">${communityOptions}</optgroup>` : ""}
    `;
  }

  // The dropdown's current value: community:<id> in community mode, else
  // personal:<trackerSystemId> for the active personal system.
  function currentScoreContextValue() {
    return isCommunityScoreContext() ? state.scoreContext : ("personal:" + state.trackerSystemId);
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

    // Default analytics visibility; updateDashboardComputed() flips these for the
    // action-first empty state (and the no-system branch below leaves them visible).
    if (els.topCardPanel) els.topCardPanel.hidden = false;
    if (els.visualBreakdownPanel) els.visualBreakdownPanel.hidden = false;
    if (els.weeklyProgressPanel) els.weeklyProgressPanel.hidden = false;
    if (els.quickLogChips) els.quickLogChips.hidden = true;

    const systemOptions = state.systems
      .map((system) => `<option value="${escapeHtml(system.id)}">${escapeHtml(system.title)}</option>`)
      .join("");
    els.scoreContextSelect.innerHTML = renderScoreContextOptions();
    els.scoreContextSelect.value = currentScoreContextValue();
    els.addEntrySystemSelect.innerHTML = renderAddEntryContextOptions(systemOptions);
    els.customizeTopCardSystemSelect.innerHTML = systemOptions;
    els.customizeChartsSystemSelect.innerHTML = systemOptions;
    els.addEntrySystemSelect.value = isCommunityScoreContext() ? state.scoreContext : state.trackerSystemId;
    els.customizeTopCardSystemSelect.value = state.trackerSystemId;
    els.customizeChartsSystemSelect.value = state.trackerSystemId;
    els.syncSampleButton.hidden = isCommunityScoreContext();

    const context = getActiveScoreContext();
    const system = context.system;
    const inCommunityMode = context.type === "community" && Boolean(context.community);
    els.addEntryTitle.textContent = inCommunityMode ? `Add Entry for ${context.community.name}` : "Add Entry";
    // Community actions now live next to the switcher (the lower banner is gone),
    // shown only under a community context.
    els.viewLeaderboardButton.hidden = !inCommunityMode;
    els.openCommunityButton.hidden = !inCommunityMode;
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
      if (els.dailyInsightText) els.dailyInsightText.textContent = "Create a reward system to start your daily insight.";
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
    const emptyDay = updateDashboardComputed();

    // Skip the weekly chart when the day is empty (updateDashboardComputed already
    // hid its panel) — it's restored the moment an entry exists.
    if (!emptyDay) {
      if (context.type === "personal") renderWeeklyProgress(system);
      else renderCommunityWeeklyProgress(context.community);
    }
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
    Array.from(els.systemList.querySelectorAll("[data-turn-community-id]")).forEach((button) => {
      button.addEventListener("click", () => turnSystemIntoCommunity(button.dataset.turnCommunityId));
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
        const deletedRule = selected.rules.find((item) => item.id === deletedRuleId);
        if (selected.aiDomain && deletedRule) recordAiRuleDeletion(selected.aiDomain, deletedRule.label);
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
    state.aiDraftSystem = null;
    state.aiDraftInputs = null;
    state.aiDraftAdjustments = null;
    if (state.buildMode === "home") {
      state.buildViewedProfileId = "";
      state.buildViewedPublicId = "";
    }
    saveState();
    renderSystems();
    if (state.buildMode === "search") {
      els.buildPublicSearchInput.focus();
      runPeopleSearch(state.buildSearchQuery); // refresh real people for any persisted query
    }
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

    // A selected real person → open their profile view, where the existing
    // kudos / motivation / message flows are reused (renderMemberSignalActions).
    if (state.buildViewedProfileId) {
      const person = peopleResults.find((item) => String(item.id) === state.buildViewedProfileId);
      if (!person) {
        state.buildViewedProfileId = "";
      } else {
        els.buildPublicSearchResults.innerHTML = renderPersonDetail(person);
        const back = els.buildPublicSearchResults.querySelector("[data-build-back-results]");
        if (back) back.addEventListener("click", () => {
          state.buildViewedProfileId = "";
          state.buildViewedPublicId = "";
          saveState();
          renderBuildSearchResults();
        });
        bindMemberSignalActions(personCommunity(), personToMember(person), els.buildPublicSearchResults);
        return;
      }
    }

    const visibleSystems = systems.filter((system) => matchesSystemSearch(system, query));
    els.buildPublicSearchResults.innerHTML = `
      <section class="build-result-section" aria-label="People">
        <div class="build-result-section-heading">
          <h3>People</h3>
          <span>${plural(peopleResults.length, "result")}</span>
        </div>
        ${renderPeopleSection(query)}
      </section>
      <section class="build-result-section" aria-label="Reward Systems">
        <div class="build-result-section-heading">
          <h3>Reward Systems</h3>
          <span>${plural(visibleSystems.length, "result")}</span>
        </div>
        ${visibleSystems.length ? visibleSystems.map(renderBuildPublicResult).join("") : emptyState("No public reward systems match that search.")}
      </section>
    `;

    Array.from(els.buildPublicSearchResults.querySelectorAll("[data-build-copy-public-id]")).forEach((button) => {
      button.addEventListener("click", () => copyPublicSystem(button.dataset.buildCopyPublicId, systems));
    });
    Array.from(els.buildPublicSearchResults.querySelectorAll("[data-build-view-person-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.buildViewedProfileId = button.dataset.buildViewPersonId;
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

  // Debounced real user search via the search_profiles RPC. A sequence guard drops
  // out-of-order (slow earlier) responses so the freshest query always wins.
  function runPeopleSearch(rawQuery) {
    const query = String(rawQuery || "").trim();
    clearTimeout(peopleSearchTimer);
    if (!signalsReady() || query.length < 2) {
      peopleResults = [];
      peopleSearchLoading = false;
      peopleSearchSeq++; // invalidate any in-flight request
      if (state.buildMode === "search") renderBuildSearchResults();
      return;
    }
    peopleSearchLoading = true;
    const seq = ++peopleSearchSeq;
    if (state.buildMode === "search") renderBuildSearchResults(); // show "Searching…"
    peopleSearchTimer = setTimeout(() => {
      Promise.resolve(window.PointwellSignals.searchProfiles(query)).then((rows) => {
        if (seq !== peopleSearchSeq) return;
        peopleResults = Array.isArray(rows) ? rows : [];
        peopleSearchLoading = false;
        if (state.buildMode === "search") renderBuildSearchResults();
      }).catch(() => {
        if (seq !== peopleSearchSeq) return;
        peopleResults = [];
        peopleSearchLoading = false;
        if (state.buildMode === "search") renderBuildSearchResults();
      });
    }, 250);
  }

  function renderPeopleSection(query) {
    if (!signalsReady()) return emptyState("Sign in to search for people.");
    if (query.length < 2) return emptyState("Type at least 2 characters to find people by name or handle.");
    if (peopleSearchLoading) return emptyState("Searching…");
    if (!peopleResults.length) return emptyState("No people match that search.");
    return peopleResults.map(renderPersonResult).join("");
  }

  function renderPersonResult(person) {
    const name = escapeHtml(person.display_name || "Member");
    const handle = escapeHtml(cleanHandle(person.handle || "") || "@member");
    const initials = escapeHtml(getInitials(person.display_name || "Member"));
    return `
      <article class="build-result-card person-result-card">
        <div class="person-result-identity">
          <span class="member-avatar" aria-hidden="true">${initials}</span>
          <div class="build-result-main">
            <strong>${name}</strong>
            <span>${handle}</span>
          </div>
        </div>
        <div class="build-result-actions">
          <button class="secondary-button small" type="button" data-build-view-person-id="${escapeHtml(String(person.id))}">View profile</button>
        </div>
      </article>
    `;
  }

  function renderPersonDetail(person) {
    const name = escapeHtml(person.display_name || "Member");
    const handle = escapeHtml(cleanHandle(person.handle || "") || "@member");
    const initials = escapeHtml(getInitials(person.display_name || "Member"));
    return `
      <section class="build-profile-detail person-detail">
        <div class="build-profile-header">
          <button class="ghost-button small" type="button" data-build-back-results>Back</button>
          <div class="person-detail-identity">
            <span class="large-avatar person-detail-avatar" aria-hidden="true">${initials}</span>
            <div>
              <h3>${name}</h3>
              <span>${handle}</span>
            </div>
          </div>
        </div>
        ${renderMemberSignalActions(personCommunity(), personToMember(person))}
      </section>
    `;
  }

  // Shape a searched person like a community member so the existing connect flows
  // (kudos / motivation / message + thread) work unchanged. id is a real uuid (not
  // "me") and userId is set, so the member is fully signalable.
  function personToMember(person) {
    return { id: String(person.id), userId: String(person.id), name: person.display_name || "Member", handle: person.handle || "" };
  }
  function personCommunity() {
    return { id: null, members: [] };
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
    state.aiDraftInputs = readAiFormInputs();
    state.aiDraftAdjustments = blankAiAdjustments();
    state.aiDraftSystem = createMockAiDraftSystem(state.aiDraftInputs, state.aiDraftAdjustments);
    state.buildMode = "ai";
    saveState();
    renderSystems();
    showToast("Draft generated");
  }

  function readAiFormInputs() {
    return {
      goals: els.aiGoalsInput.value.trim(),
      rewards: els.aiRewardHabitsInput.value.trim(),
      penalties: els.aiPenaltyHabitsInput.value.trim(),
      categories: els.aiCategoriesInput.value.trim(),
      strictness: els.aiStrictnessInput.value,
      targets: els.aiTargetsInput.value.trim()
    };
  }

  function blankAiAdjustments() {
    return { strictnessDelta: 0, specificity: 0, extraRules: 0, removePenalties: false, focus: "" };
  }

  function regenerateAiDraft() {
    const inputs = state.aiDraftInputs || readAiFormInputs();
    state.aiDraftAdjustments = state.aiDraftAdjustments || blankAiAdjustments();
    state.aiDraftSystem = createMockAiDraftSystem(inputs, state.aiDraftAdjustments);
    saveState();
    renderSystems();
  }

  // Domain library: each domain detects from the user's words and supplies
  // specific, relevant rules. Tiers (core/extra/bonus) gate by strictness.
  const AI_DOMAINS = [
    {
      key: "chess",
      category: "Chess / Skill development",
      name: "Chess Improvement Sprint",
      keywords: ["chess", "elo", "tactic", "puzzle", "opening", "endgame", "checkmate", "rated game", "blitz", "rapid", "lichess", "grandmaster"],
      explanation: "This system focuses on tactics, game review, and rated play because those are the most direct ways to improve at chess. Rating improvement is treated as a bonus because it matters, but it should not be the only thing rewarded.",
      rules: [
        { label: "Focused chess practice", category: "Chess", unit: "minutes", style: "goal", goal: 30, points: 1, tier: "core", inputMethod: "slider" },
        { label: "Tactics puzzles solved", category: "Chess", unit: "puzzles", style: "goal", goal: 20, points: 1.5, tier: "core" },
        { label: "Review a completed game", category: "Chess", unit: "games", style: "goal", goal: 1, points: 1, tier: "core" },
        { label: "Play rated games", category: "Chess", unit: "games", style: "goal", goal: 2, points: 1, tier: "extra" },
        { label: "Study opening or endgame", category: "Chess", unit: "minutes", style: "goal", goal: 20, points: 1, tier: "extra", inputMethod: "slider" },
        { label: "Analyze mistakes after games", category: "Chess", unit: "times", style: "yesNo", points: 0.5, tier: "extra" },
        { label: "Weekly rating increase", category: "Chess", unit: "points", style: "goal", goal: 1, points: 2, tier: "bonus" }
      ]
    },
    {
      key: "academics",
      category: "Academics",
      name: "Deep Study Plan",
      keywords: ["study", "studying", "school", "academic", "homework", "assignment", "exam", "class", "college", "university", "course", "lecture", "deep work", "gpa", "revision"],
      explanation: "This plan rewards deep work, reading, and finishing assignments because focused effort and completed tasks drive academic results more reliably than time spent alone.",
      rules: [
        { label: "Deep work block", category: "Academics", unit: "minutes", style: "every", goal: 120, every: 30, points: 1, tier: "core", inputMethod: "slider" },
        { label: "Pages read", category: "Academics", unit: "pages", style: "every", goal: 30, every: 10, points: 0.5, tier: "core" },
        { label: "Practice problems", category: "Academics", unit: "problems", style: "every", goal: 20, every: 10, points: 1, tier: "core" },
        { label: "Assignment submitted", category: "Academics", unit: "assignments", style: "goal", goal: 1, points: 1.5, tier: "extra" },
        { label: "Study session completed", category: "Academics", unit: "sessions", style: "yesNo", points: 1, tier: "extra" }
      ]
    },
    {
      key: "fitness",
      category: "Fitness",
      name: "Body Recomposition Plan",
      keywords: ["fitness", "gym", "lift", "lifting", "workout", "strength", "muscle", "steps", "walk", "run", "running", "cardio", "weight", "exercise", "training", "recomp"],
      explanation: "This plan combines training, daily movement, and recovery because progress comes from consistent lifting, steady activity, and enough sleep — not any single metric.",
      rules: [
        { label: "Lifting session", category: "Fitness", unit: "sessions", style: "yesNo", points: 2, tier: "core" },
        { label: "Steps", category: "Fitness", unit: "steps", style: "both", goal: 10000, every: 5000, points: 1, tier: "core", inputMethod: "slider", inputStep: 500, targetPattern: /(\d[\d,]*)\s*steps/i },
        { label: "Cardio", category: "Fitness", unit: "minutes", style: "every", goal: 30, every: 15, points: 0.5, tier: "extra", inputMethod: "slider" },
        { label: "Calories within target", category: "Nutrition", unit: "times", style: "yesNo", points: 1, tier: "extra" },
        { label: "Sleep 7+ hours", category: "Sleep", unit: "hours", style: "goal", goal: 7, points: 1, tier: "extra", inputMethod: "number", inputStep: 0.25, targetPattern: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s*)?sleep/i }
      ]
    },
    {
      key: "nutrition",
      category: "Nutrition",
      name: "Nutrition Plan",
      keywords: ["protein", "nutrition", "diet", "macros", "calorie", "meal", "carbs", "eating", "hydration"],
      explanation: "This plan rewards hitting protein and eating choices because nutrition is the biggest lever for body composition.",
      rules: [
        { label: "Protein", category: "Nutrition", unit: "grams", style: "goal", goal: 150, points: 2, tier: "core", inputMethod: "slider", inputStep: 5, targetPattern: /(\d+(?:\.\d+)?)\s*g?\s*protein/i },
        { label: "Water", category: "Nutrition", unit: "glasses", style: "every", goal: 8, every: 2, points: 0.25, tier: "extra" },
        { label: "No junk food", category: "Nutrition", unit: "times", style: "yesNo", points: 0.5, tier: "extra" }
      ]
    },
    {
      key: "finance",
      category: "Finance",
      name: "Money Discipline Plan",
      keywords: ["finance", "money", "spend", "spending", "budget", "save", "saving", "savings", "invest", "investing", "debt", "expense", "frugal", "purchase"],
      explanation: "This plan rewards staying under budget, saving, and avoiding impulse purchases because consistent small choices build wealth faster than occasional big wins.",
      rules: [
        { label: "Stayed under spending limit", category: "Finance", unit: "times", style: "yesNo", points: 1.5, tier: "core" },
        { label: "Money saved", category: "Finance", unit: "dollars", style: "every", goal: 20, every: 10, points: 0.5, tier: "core" },
        { label: "No unnecessary purchases", category: "Finance", unit: "times", style: "yesNo", points: 1, tier: "core" },
        { label: "Logged today's spending", category: "Finance", unit: "times", style: "yesNo", points: 0.5, tier: "extra" },
        { label: "Investing contribution", category: "Finance", unit: "dollars", style: "goal", goal: 10, points: 1, tier: "extra" },
        { label: "Weekly budget review", category: "Finance", unit: "times", style: "yesNo", points: 1, tier: "bonus" }
      ]
    },
    {
      key: "sleep",
      category: "Sleep",
      name: "Sleep Reset Plan",
      keywords: ["sleep", "bedtime", "wake", "insomnia", "circadian", "rested", "nap"],
      explanation: "This plan rewards enough sleep and a consistent schedule because regular bed and wake times matter as much as total hours.",
      rules: [
        { label: "Hours slept", category: "Sleep", unit: "hours", style: "goal", goal: 7.5, points: 2, tier: "core", inputMethod: "number", inputStep: 0.25, targetPattern: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i },
        { label: "Consistent bedtime", category: "Sleep", unit: "times", style: "yesNo", points: 1, tier: "core" },
        { label: "Consistent wake time", category: "Sleep", unit: "times", style: "yesNo", points: 1, tier: "core" },
        { label: "No phone before bed", category: "Sleep", unit: "times", style: "yesNo", points: 1, tier: "extra" }
      ]
    },
    {
      key: "reading",
      category: "Reading",
      name: "Reading Habit Plan",
      keywords: ["read", "reading", "book", "novel", "pages"],
      explanation: "This plan rewards regular reading time and reflection so the habit compounds.",
      rules: [
        { label: "Pages read", category: "Reading", unit: "pages", style: "every", goal: 30, every: 10, points: 0.75, tier: "core" },
        { label: "Reading session", category: "Reading", unit: "minutes", style: "goal", goal: 30, points: 1, tier: "core", inputMethod: "slider" },
        { label: "Reflect on what you read", category: "Reading", unit: "times", style: "yesNo", points: 0.5, tier: "extra" }
      ]
    },
    {
      key: "coding",
      category: "Programming",
      name: "Coding Growth Plan",
      keywords: ["code", "coding", "program", "programming", "leetcode", "developer", "software", "github", "algorithm"],
      explanation: "This plan rewards focused coding, solving problems, and shipping work because consistent practice and real projects build skill fastest.",
      rules: [
        { label: "Focused coding", category: "Programming", unit: "minutes", style: "every", goal: 120, every: 30, points: 1, tier: "core", inputMethod: "slider" },
        { label: "Problems solved", category: "Programming", unit: "problems", style: "every", goal: 3, every: 1, points: 1, tier: "core" },
        { label: "Commit to a project", category: "Programming", unit: "times", style: "yesNo", points: 1, tier: "core" },
        { label: "Learn something new", category: "Programming", unit: "times", style: "yesNo", points: 0.5, tier: "extra" }
      ]
    },
    {
      key: "language",
      category: "Language learning",
      name: "Language Fluency Plan",
      keywords: ["language", "spanish", "french", "german", "japanese", "vocab", "vocabulary", "duolingo", "fluent", "grammar"],
      explanation: "This plan rewards vocabulary, practice, and real speaking or listening because exposure plus output drives fluency.",
      rules: [
        { label: "New vocabulary", category: "Language learning", unit: "words", style: "every", goal: 10, every: 5, points: 0.5, tier: "core" },
        { label: "Practice session", category: "Language learning", unit: "minutes", style: "goal", goal: 20, points: 1, tier: "core", inputMethod: "slider" },
        { label: "Speak or listen", category: "Language learning", unit: "times", style: "yesNo", points: 1, tier: "extra" }
      ]
    },
    {
      key: "mindfulness",
      category: "Mindfulness",
      name: "Mindfulness Plan",
      keywords: ["meditat", "mindful", "breath", "calm", "anxiety", "stress", "gratitude", "journal"],
      explanation: "This plan rewards short, regular practice because consistency matters more than long sessions for calm and focus.",
      rules: [
        { label: "Meditation", category: "Mindfulness", unit: "minutes", style: "goal", goal: 10, points: 1, tier: "core", inputMethod: "slider" },
        { label: "Journaling", category: "Mindfulness", unit: "times", style: "yesNo", points: 0.5, tier: "core" },
        { label: "Gratitude note", category: "Mindfulness", unit: "times", style: "yesNo", points: 0.5, tier: "extra" }
      ]
    },
    {
      key: "music",
      category: "Music practice",
      name: "Music Practice Plan",
      keywords: ["guitar", "piano", "instrument", "drums", "violin", "singing", "music practice", "scales"],
      explanation: "This plan rewards regular practice and learning new material because daily reps build musical skill.",
      rules: [
        { label: "Instrument practice", category: "Music practice", unit: "minutes", style: "every", goal: 30, every: 15, points: 0.75, tier: "core", inputMethod: "slider" },
        { label: "Technique or scales", category: "Music practice", unit: "times", style: "yesNo", points: 0.5, tier: "core" },
        { label: "Learn part of a song", category: "Music practice", unit: "times", style: "yesNo", points: 0.5, tier: "extra" }
      ]
    },
    {
      key: "writing",
      category: "Writing",
      name: "Writing Habit Plan",
      keywords: ["writing", "write", "blog", "essay", "author", "manuscript", "words"],
      explanation: "This plan rewards a daily word count and editing because finished writing comes from showing up consistently.",
      rules: [
        { label: "Words written", category: "Writing", unit: "words", style: "every", goal: 500, every: 250, points: 0.75, tier: "core" },
        { label: "Writing session", category: "Writing", unit: "minutes", style: "goal", goal: 30, points: 1, tier: "core", inputMethod: "slider" },
        { label: "Edit or revise", category: "Writing", unit: "times", style: "yesNo", points: 0.5, tier: "extra" }
      ]
    }
  ];

  function detectAiDomains(text) {
    const value = String(text || "").toLowerCase();
    return AI_DOMAINS
      .map((domain) => {
        let score = 0;
        domain.keywords.forEach((kw) => {
          try {
            if (new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(value)) score += 1;
          } catch (error) {
            if (value.includes(kw)) score += 1;
          }
        });
        return { domain, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  function ensureAiLearning() {
    if (!state.aiLearning || typeof state.aiLearning !== "object") {
      state.aiLearning = { saved: {}, feedback: [], deletedRuleLabels: {}, likedRuleLabels: {} };
    }
    state.aiLearning.saved = state.aiLearning.saved || {};
    state.aiLearning.feedback = Array.isArray(state.aiLearning.feedback) ? state.aiLearning.feedback : [];
    state.aiLearning.deletedRuleLabels = state.aiLearning.deletedRuleLabels || {};
    state.aiLearning.likedRuleLabels = state.aiLearning.likedRuleLabels || {};
    return state.aiLearning;
  }

  function aiLearningFeedbackCounts(domainKey) {
    const learning = ensureAiLearning();
    const counts = {};
    learning.feedback.forEach((entry) => {
      if (entry.domain === domainKey) counts[entry.type] = (counts[entry.type] || 0) + 1;
    });
    return counts;
  }

  function aiRuleSuppressed(domainKey, label) {
    const learning = ensureAiLearning();
    const map = learning.deletedRuleLabels[domainKey] || {};
    return (map[String(label || "").toLowerCase()] || 0) >= 2;
  }

  function recordAiRuleDeletion(domainKey, label) {
    if (!domainKey) return;
    const learning = ensureAiLearning();
    learning.deletedRuleLabels[domainKey] = learning.deletedRuleLabels[domainKey] || {};
    const key = String(label || "").toLowerCase();
    learning.deletedRuleLabels[domainKey][key] = (learning.deletedRuleLabels[domainKey][key] || 0) + 1;
  }

  function recordAiSave(system) {
    const learning = ensureAiLearning();
    const domainKey = system.aiDomain || "general";
    learning.saved[domainKey] = (learning.saved[domainKey] || 0) + 1;
    learning.likedRuleLabels[domainKey] = learning.likedRuleLabels[domainKey] || {};
    (system.rules || []).forEach((rule) => {
      const key = String(rule.label || "").toLowerCase();
      learning.likedRuleLabels[domainKey][key] = (learning.likedRuleLabels[domainKey][key] || 0) + 1;
    });
  }

  function resolveAiStrictness(base, adjustments, feedbackNet, genericBoost) {
    const order = ["easy", "balanced", "intense"];
    let index = order.indexOf(base);
    if (index < 0) index = 1;
    index += numberOrDefault(adjustments.strictnessDelta, 0) + numberOrDefault(feedbackNet, 0);
    index = Math.min(2, Math.max(0, index));
    const key = order[index];
    const tiers = key === "easy" ? ["core"] : (key === "balanced" ? ["core", "extra"] : ["core", "extra", "bonus"]);
    let cap = key === "easy" ? 4 : (key === "balanced" ? 6 : 8);
    const boost = numberOrDefault(genericBoost, 0);
    if (boost > 0) {
      if (!tiers.includes("extra")) tiers.push("extra");
      if (boost > 1 && !tiers.includes("bonus")) tiers.push("bonus");
      cap += 2 * boost;
    }
    if (numberOrDefault(adjustments.extraRules, 0) > 0) {
      if (!tiers.includes("extra")) tiers.push("extra");
      if (!tiers.includes("bonus")) tiers.push("bonus");
      cap += adjustments.extraRules;
    }
    if (adjustments.focus === "outcomes" && !tiers.includes("bonus")) tiers.push("bonus");
    return {
      key,
      tiers,
      cap,
      targetScale: key === "easy" ? 0.75 : (key === "intense" ? 1.25 : 1),
      pointScale: key === "easy" ? 0.9 : (key === "intense" ? 1.1 : 1)
    };
  }

  function aiScaleTarget(value, scale, unit) {
    if (!value) return value;
    let next = value * scale;
    if (String(unit || "").toLowerCase() === "hours") return Math.round(next * 4) / 4;
    return next >= 10 ? Math.round(next) : Math.max(1, Math.round(next));
  }

  function aiMakeRule(desc, ctx) {
    const strict = ctx.strict;
    let goal = desc.goal != null ? desc.goal : 0;
    if (desc.targetPattern && ctx.targets) goal = targetFromText(ctx.targets, desc.targetPattern, goal);
    goal = aiScaleTarget(goal, strict.targetScale, desc.unit);
    const points = roundScore(numberOrDefault(desc.points, 1) * strict.pointScale);
    const every = Math.max(numberOrDefault(desc.every, 1), 1);
    const style = desc.style || "goal";
    const base = {
      id: makeId("ai-rule"),
      label: desc.label,
      category: desc.category || ctx.category,
      metric: String(desc.label || "").toLowerCase(),
      unit: desc.unit || "times",
      dataSource: "manual",
      sourceMetric: "manual",
      allowManualOverride: true,
      inputMethod: desc.inputMethod || (style === "yesNo" ? "toggle" : (style === "every" ? "slider" : "number")),
      inputStep: desc.inputStep || (String(desc.unit || "").toLowerCase() === "hours" ? 0.25 : 1),
      inputMax: Math.max(goal * 2, every * 2, 10)
    };
    if (style === "yesNo") {
      Object.assign(base, { simpleStyle: "yesNo", dailyTarget: 1, yesNoPoints: points });
    } else if (style === "every") {
      Object.assign(base, { simpleStyle: "every", dailyTarget: goal, everyAmount: every, everyPoints: points });
    } else if (style === "both") {
      Object.assign(base, { simpleStyle: "both", dailyTarget: goal, everyAmount: every, everyPoints: roundScore(points / 2), goalPoints: points });
    } else {
      Object.assign(base, { simpleStyle: "goal", dailyTarget: goal || 1, goalPoints: points });
    }
    return scoring.createRule(base);
  }

  function aiCollectDomainRules(domain, tiersAllowed, ctx, usedLabels, target) {
    domain.rules.forEach((desc) => {
      if (target.length >= ctx.strict.cap) return;
      if (!tiersAllowed.includes(desc.tier || "core")) return;
      const labelKey = desc.label.toLowerCase();
      if (usedLabels.has(labelKey)) return;
      if (aiRuleSuppressed(domain.key, desc.label)) return;
      usedLabels.add(labelKey);
      target.push(aiMakeRule(desc, ctx));
    });
  }

  function parseHabitList(text) {
    return String(text || "")
      .split(/[,\n;]|\band\b|\bplus\b|\bthen\b/i)
      .map((part) => part.trim())
      .filter((part) => part.length > 1 && part.length < 60)
      .slice(0, 8);
  }

  function isMeaningfulText(text) {
    const value = String(text || "").trim().toLowerCase();
    if (!value) return false;
    return !["no", "none", "nothing", "n/a", "na", "no penalties", "no penalty"].includes(value);
  }

  function aiGenericRules(rewards, goals, ctx) {
    const items = parseHabitList(rewards).length ? parseHabitList(rewards) : parseHabitList(goals);
    const rules = [];
    const usedLabels = new Set();
    items.forEach((item) => {
      if (rules.length >= ctx.strict.cap) return;
      const labelKey = item.toLowerCase();
      if (usedLabels.has(labelKey)) return;
      usedLabels.add(labelKey);
      const lower = item.toLowerCase();
      const timeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)/);
      const countMatch = lower.match(/(\d+)/);
      const label = capitalize(item.replace(/\s+/g, " ").slice(0, 48));
      if (timeMatch) {
        const isHours = /hour|hr/.test(timeMatch[2]);
        rules.push(aiMakeRule({ label, category: ctx.category, unit: isHours ? "hours" : "minutes", style: "goal", goal: numberOrDefault(timeMatch[1], isHours ? 1 : 30), points: 1, inputMethod: "slider" }, ctx));
      } else if (countMatch) {
        rules.push(aiMakeRule({ label, category: ctx.category, unit: "times", style: "every", goal: numberOrDefault(countMatch[1], 1), every: 1, points: 1 }, ctx));
      } else {
        rules.push(aiMakeRule({ label, category: ctx.category, unit: "times", style: "yesNo", points: 1 }, ctx));
      }
    });
    if (!rules.length) {
      rules.push(aiMakeRule({ label: "Daily progress toward goal", category: ctx.category, unit: "times", style: "yesNo", points: 1 }, ctx));
    }
    return rules;
  }

  function aiPenaltyRulesFromText(penalties, ctx) {
    return parseHabitList(penalties).map((item) => {
      const label = capitalize(item.replace(/\s+/g, " ").slice(0, 48));
      return aiMakeRule({ label, category: ctx.category, unit: "times", style: "yesNo", points: -roundScore(1 * ctx.strict.pointScale) }, ctx);
    });
  }

  function aiSystemName(primary, inputs) {
    if (primary) return primary.name;
    const goalText = String(inputs.goals || inputs.rewards || "").replace(/^i\s+(want|need|would like)\s+to\s+/i, "").trim();
    if (goalText) {
      const words = goalText.split(/\s+/).slice(0, 4).join(" ");
      return `${capitalize(words)} Plan`;
    }
    return `${capitalize(inputs.strictness || "balanced")} reward plan`;
  }

  function aiExplanationText(primary, ctx, rules, wantsPenalties) {
    let base = primary
      ? primary.explanation
      : `This plan turns your goals into daily, trackable habits${rules.length ? ": " + rules.slice(0, 3).map((rule) => rule.label.toLowerCase()).join(", ") : ""}.`;
    const strictnessNote = ctx.strict.key === "easy"
      ? " Targets are kept light so the habit sticks."
      : (ctx.strict.key === "intense" ? " Targets are ambitious, with optional bonuses for extra effort." : " Targets are realistic for steady daily progress.");
    const focusNote = ctx.focus === "consistency"
      ? " It leans on daily consistency."
      : (ctx.focus === "outcomes" ? " It emphasizes outcome-based bonuses." : "");
    const penaltyNote = wantsPenalties ? " Penalties were added for the habits you asked to discourage." : " No penalties were added.";
    return base + strictnessNote + focusNote + penaltyNote;
  }

  function createMockAiDraftSystem(inputs, adjustments) {
    inputs = inputs || readAiFormInputs();
    const adj = adjustments || blankAiAdjustments();
    const detectionText = `${inputs.goals} ${inputs.rewards} ${inputs.categories} ${inputs.targets} ${inputs.penalties}`.toLowerCase();
    const detected = detectAiDomains(detectionText);
    const primary = detected.length ? detected[0].domain : null;
    const domainKey = primary ? primary.key : "general";

    const feedback = aiLearningFeedbackCounts(domainKey);
    const feedbackNet = Math.max(-2, Math.min(2, (feedback["too-easy"] || 0) - (feedback["too-hard"] || 0)));
    const genericBoost = ((feedback["too-generic"] || 0) > 0 ? 1 : 0) + numberOrDefault(adj.specificity, 0);
    const strict = resolveAiStrictness(inputs.strictness || "balanced", adj, feedbackNet, genericBoost);
    const wantsPenalties = !adj.removePenalties && isMeaningfulText(inputs.penalties);
    const category = primary ? primary.category : (inferCategory(inputs.categories || inputs.goals || inputs.rewards) || "Personal habits");
    const ctx = { strict, targets: inputs.targets, category, focus: adj.focus };

    let rules = [];
    if (primary) {
      const usedLabels = new Set();
      const healthCluster = new Set(["fitness", "nutrition", "sleep", "mindfulness"]);
      aiCollectDomainRules(primary, strict.tiers, ctx, usedLabels, rules);
      detected.slice(1).forEach((entry) => {
        const sameCluster = healthCluster.has(entry.domain.key) && healthCluster.has(primary.key);
        if (sameCluster || entry.score >= 2) {
          aiCollectDomainRules(entry.domain, ["core"], ctx, usedLabels, rules);
        }
      });
    } else {
      rules = aiGenericRules(inputs.rewards, inputs.goals, ctx);
    }
    rules = rules.slice(0, strict.cap);
    if (wantsPenalties) rules = rules.concat(aiPenaltyRulesFromText(inputs.penalties, ctx));
    if (adj.focus === "consistency") {
      rules.sort((a, b) => (a.simpleStyle === "yesNo" ? -1 : 0) - (b.simpleStyle === "yesNo" ? -1 : 0));
    }

    return normalizeSystem({
      id: makeId("draft"),
      ownerId: "me",
      ownerName: state.profile.name,
      title: aiSystemName(primary, inputs),
      category,
      visibility: "private",
      description: inputs.goals || inputs.rewards || "A reward system generated from your goals.",
      rules,
      calculatedTotals: [],
      aiDomain: domainKey,
      aiExplanation: aiExplanationText(primary, ctx, rules, wantsPenalties)
    });
  }

  const AI_IMPROVEMENTS = {
    stricter: (adj) => { adj.strictnessDelta = numberOrDefault(adj.strictnessDelta, 0) + 1; },
    easier: (adj) => { adj.strictnessDelta = numberOrDefault(adj.strictnessDelta, 0) - 1; },
    specific: (adj) => { adj.specificity = numberOrDefault(adj.specificity, 0) + 1; },
    "more-rules": (adj) => { adj.extraRules = numberOrDefault(adj.extraRules, 0) + 2; },
    "remove-penalties": (adj) => { adj.removePenalties = true; },
    consistency: (adj) => { adj.focus = "consistency"; },
    outcomes: (adj) => { adj.focus = "outcomes"; }
  };

  function applyAiImprovement(kind) {
    if (!state.aiDraftSystem) return;
    state.aiDraftAdjustments = state.aiDraftAdjustments || blankAiAdjustments();
    const apply = AI_IMPROVEMENTS[kind];
    if (!apply) return;
    apply(state.aiDraftAdjustments);
    regenerateAiDraft();
    showToast("Draft updated");
  }

  function recordAiFeedback(type) {
    if (!state.aiDraftSystem) return;
    const learning = ensureAiLearning();
    const domainKey = state.aiDraftSystem.aiDomain || "general";
    learning.feedback.push({ domain: domainKey, type, at: new Date().toISOString() });
    const regenerating = ["too-generic", "too-easy", "too-hard"].includes(type);
    if (type === "too-generic") {
      state.aiDraftAdjustments = state.aiDraftAdjustments || blankAiAdjustments();
      state.aiDraftAdjustments.specificity = numberOrDefault(state.aiDraftAdjustments.specificity, 0) + 1;
    }
    saveState();
    if (regenerating) {
      regenerateAiDraft();
      showToast("Thanks — updated from your feedback");
    } else {
      showToast("Thanks — noted for next time");
    }
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
      if (state.aiDraftInputs) {
        const saved = state.aiDraftInputs;
        const restore = (el, value) => { if (el && document.activeElement !== el) el.value = value || ""; };
        restore(els.aiGoalsInput, saved.goals);
        restore(els.aiRewardHabitsInput, saved.rewards);
        restore(els.aiPenaltyHabitsInput, saved.penalties);
        restore(els.aiCategoriesInput, saved.categories);
        restore(els.aiStrictnessInput, saved.strictness);
        restore(els.aiTargetsInput, saved.targets);
      }
      return;
    }
    const target = calculateTargetSummary(draft).total;
    const explanation = draft.aiExplanation || "";
    const feedbackButtons = [
      { type: "good", label: "Good suggestion" },
      { type: "too-generic", label: "Too generic" },
      { type: "too-easy", label: "Too easy" },
      { type: "too-hard", label: "Too hard" },
      { type: "bad-weights", label: "Bad weights" },
      { type: "wrong-category", label: "Wrong category" }
    ];
    const improveButtons = [
      { kind: "stricter", label: "Make it stricter" },
      { kind: "easier", label: "Make it easier" },
      { kind: "specific", label: "More specific" },
      { kind: "more-rules", label: "Add more rules" },
      { kind: "remove-penalties", label: "Remove penalties" },
      { kind: "consistency", label: "Focus on consistency" },
      { kind: "outcomes", label: "Focus on outcomes" }
    ];
    els.aiDraftReview.innerHTML = `
      <div class="ai-draft-card">
        <div class="panel-heading tight">
          <div>
            <h3>${escapeHtml(draft.title)}</h3>
            <span>${escapeHtml(draft.category)} · estimated ${formatPoints(target)} points per day</span>
          </div>
          <div class="inline-actions">
            <button class="ghost-button small" type="button" id="editAiPromptButton">Edit prompt</button>
            <button class="primary-button small" type="button" id="useAiDraftButton">Use This System</button>
          </div>
        </div>
        ${explanation ? `<div class="source-notice"><strong>Why these rules</strong><span>${escapeHtml(explanation)}</span></div>` : ""}
        <div class="compact-rule-list">
          ${draft.rules.length ? draft.rules.map((item) => renderRuleRow(item, "preview")).join("") : emptyState("No rules generated. Try adding more detail to your goals.")}
        </div>
        <div class="ai-feedback">
          <span class="eyebrow">How is this draft?</span>
          <div class="ai-feedback-row">
            ${feedbackButtons.map((item) => `<button class="ghost-button small" type="button" data-ai-feedback="${item.type}">${escapeHtml(item.label)}</button>`).join("")}
          </div>
        </div>
        <div class="ai-improve">
          <button class="secondary-button small" type="button" id="aiImproveToggle">Improve this system</button>
          <div class="ai-improve-panel" id="aiImprovePanel" hidden>
            <span class="eyebrow">What should change?</span>
            <div class="ai-feedback-row">
              ${improveButtons.map((item) => `<button class="ghost-button small" type="button" data-ai-improve="${item.kind}">${escapeHtml(item.label)}</button>`).join("")}
            </div>
          </div>
        </div>
        <p class="review-note">Use this system to open the full setup editor and customize every rule.</p>
      </div>
    `;
    document.getElementById("useAiDraftButton")?.addEventListener("click", useAiDraftSystem);
    document.getElementById("editAiPromptButton")?.addEventListener("click", () => {
      state.aiDraftSystem = null;
      saveState();
      renderSystems();
      requestAnimationFrame(() => els.aiGoalsInput?.focus());
    });
    document.getElementById("aiImproveToggle")?.addEventListener("click", () => {
      const panel = document.getElementById("aiImprovePanel");
      if (panel) panel.hidden = !panel.hidden;
    });
    Array.from(els.aiDraftReview.querySelectorAll("[data-ai-feedback]")).forEach((button) => {
      button.addEventListener("click", () => recordAiFeedback(button.dataset.aiFeedback));
    });
    Array.from(els.aiDraftReview.querySelectorAll("[data-ai-improve]")).forEach((button) => {
      button.addEventListener("click", () => applyAiImprovement(button.dataset.aiImprove));
    });
  }

  function useAiDraftSystem() {
    if (!state.aiDraftSystem) return;
    const source = normalizeSystem(state.aiDraftSystem);
    recordAiSave(source);
    const draft = cloneSystem(source, state.aiDraftSystem.title || "AI draft reward system");
    draft.aiDomain = source.aiDomain || "general";
    state.systems.unshift(draft);
    state.selectedSystemId = draft.id;
    state.trackerSystemId = draft.id;
    state.aiDraftSystem = null;
    state.aiDraftInputs = null;
    state.aiDraftAdjustments = null;
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

    renderCommunityFeed();

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

  // ── Recent activity feed (top of Communities view) ──────────────────────────
  // ONE chronological list of recent check-ins across all joined communities,
  // built from the community entries already in state — no new tables/queries.
  function renderCommunityFeed() {
    if (!els.communityFeed) return;
    const items = (state.communityEntries || [])
      .map((entry) => {
        const community = state.communities.find((item) => item.id === entry.communityId);
        if (!community) return null;
        const member = (community.members || []).find((item) => item.id === entry.userId);
        if (!member) return null;
        const rule = (community.system.rules || []).map(scoring.normalizeRule).find((item) => item.id === entry.ruleId);
        return { entry: entry, community: community, member: member, rule: rule, when: entry.timestamp || entry.dateKey || entry.date || "" };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)))
      .slice(0, 15);

    // Hide entirely when there's nothing to show (no joined communities at all);
    // show a friendly empty state when you have communities but no logs yet.
    if (!items.length && !state.communities.length) {
      els.communityFeed.hidden = true;
      els.communityFeed.innerHTML = "";
      return;
    }
    els.communityFeed.hidden = false;
    els.communityFeed.innerHTML = `
      <div class="panel-heading">
        <h3>Recent activity</h3>
        ${items.length ? `<span>${plural(items.length, "update")}</span>` : ""}
      </div>
      ${items.length
        ? `<div class="community-feed-list">${items.map(renderCommunityFeedRow).join("")}</div>`
        : emptyState("No check-ins yet — log a community day and it'll show up here.")}
    `;
    bindCommunityFeedActions();
  }

  function renderCommunityFeedRow(item) {
    const isMe = item.entry.userId === "me";
    const first = escapeHtml(memberFirstName(item.member));
    const points = item.rule ? scoring.calculateRule(item.rule, item.entry.amount).totalPoints : 0;
    const log = escapeHtml(entryLogText(item.entry, item.rule));
    const rel = window.PointwellSignals.formatRelativeTime(item.when, Date.now()) || "";
    const relText = escapeHtml(rel === "just now" || !rel ? (rel || "") : rel + " ago");
    const actions = isMe ? "" : `
        <div class="community-feed-actions">
          <button class="secondary-button small community-feed-cheer" type="button" data-feed-member="${escapeHtml(item.member.id)}" data-feed-community="${escapeHtml(item.community.id)}">Cheer</button>
          <button class="ghost-button small community-feed-message" type="button" data-feed-message="${escapeHtml(item.member.userId || "")}" data-feed-name="${escapeHtml(item.member.name)}" data-feed-community="${escapeHtml(item.community.id)}">Message</button>
        </div>`;
    return `
      <div class="community-feed-row">
        <div class="member-avatar" aria-hidden="true" style="background:${escapeHtml(item.member.color || "#355d91")}">${escapeHtml(getInitials(item.member.name))}</div>
        <div class="community-feed-main">
          <strong>${first} <span class="community-feed-log">${log} · ${escapeHtml(formatPoints(points))} pts</span></strong>
          <span class="community-feed-meta">${escapeHtml(item.community.name)}${relText ? " · " + relText : ""}</span>
        </div>
        ${actions}
      </div>
    `;
  }

  function bindCommunityFeedActions() {
    Array.from(els.communityFeed.querySelectorAll("[data-feed-member]")).forEach((button) => {
      button.addEventListener("click", () => {
        const community = state.communities.find((item) => item.id === button.dataset.feedCommunity);
        const member = community && (community.members || []).find((item) => item.id === button.dataset.feedMember);
        if (community && member) {
          sendChosenSignal(community, member, "kudos", window.PointwellSignals.presetsForType("kudos")[0], null).catch(() => {});
        }
      });
    });
    Array.from(els.communityFeed.querySelectorAll("[data-feed-message]")).forEach((button) => {
      button.addEventListener("click", () => {
        openChatConversation(button.dataset.feedMessage, button.dataset.feedName, button.dataset.feedCommunity);
        state.activeView = "chats";
        saveState();
        render();
      });
    });
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
      els.communityPeriodTabs.innerHTML = "";
      els.communityAnalytics.innerHTML = "";
      return;
    }

    community.system.rules = community.system.rules.map(scoring.normalizeRule);
    saveCommunitySummaryForMember(community, "me");
    if (!state.selectedCommunityMemberId || !community.members.some((memberItem) => memberItem.id === state.selectedCommunityMemberId)) {
      state.selectedCommunityMemberId = "me";
    }

    const analytics = normalizeCommunityAnalytics(community);
    const target = communityTarget(community);
    const period = COMMUNITY_PERIODS.some((item) => item.id === state.communityLeaderboardPeriod)
      ? state.communityLeaderboardPeriod
      : analytics.defaultPeriod;
    const visibility = communityVisibility(community);

    els.inviteOptions.hidden = true;
    els.communityDetailTitle.textContent = community.name;
    els.communityMeta.textContent = `${plural(getCommunityMemberCount(community), "member")} · ${visibilityLabel(visibility)}`;
    els.communityDescription.textContent = community.description || "";
    els.communityStatus.textContent = visibilityLabel(visibility);
    els.communityStatus.className = `visibility-pill ${visibility === "request_to_join" ? "request" : visibility}`;

    els.communityLeaderboardPanel.hidden = !analytics.modules.leaderboard;
    if (analytics.modules.leaderboard) {
      const standings = communityStandings(community, period, analytics.metric);
      const leader = standings[0];
      const metricLabel = analytics.metric === "completion" ? "goal completion" : "points";
      els.communityLeader.textContent = leader
        ? `${leader.name.split(" ")[0]} leads · ${communityPeriod(period).label.toLowerCase()} ${metricLabel}`
        : "Community points";
      els.communityPeriodTabs.innerHTML = COMMUNITY_PERIODS.map((item) => `
        <button class="segmented-button${item.id === period ? " active" : ""}" type="button" role="tab" aria-selected="${item.id === period ? "true" : "false"}" data-cc-period="${item.id}">${escapeHtml(item.label)}</button>
      `).join("");
      Array.from(els.communityPeriodTabs.querySelectorAll("[data-cc-period]")).forEach((button) => {
        button.addEventListener("click", () => {
          state.communityLeaderboardPeriod = button.dataset.ccPeriod;
          saveState();
          renderCommunityDetail();
        });
      });
      els.leaderboardList.innerHTML = standings.map(renderLeaderboardRow).join("");
      bindLeaderboardRows();
    } else {
      els.communityPeriodTabs.innerHTML = "";
      els.leaderboardList.innerHTML = "";
      els.communityLeader.textContent = "";
    }

    renderCommunityAnalytics(community, analytics, period, target);
  }

  function trendDayLabel(dateKey) {
    return String(Number(dateKey.split("-")[2]));
  }

  function renderCommunityTrendChart(series, options) {
    options = options || {};
    const max = Math.max(1, ...series.map((point) => point.value));
    const labelEvery = options.labelEvery || Math.max(1, Math.ceil(series.length / 5));
    return `
      <div class="trend-chart" role="img" aria-label="${escapeHtml(options.ariaLabel || "Points over time")}">
        ${series.map((point, index) => {
          const height = point.value > 0 ? Math.max(5, Math.round((point.value / max) * 100)) : 2;
          const showLabel = index === series.length - 1 || index % labelEvery === 0;
          return `
            <div class="trend-col" title="${escapeHtml(formatDate(point.date))}: ${escapeHtml(formatPoints(point.value))}">
              <div class="trend-bar-wrap"><div class="trend-bar" style="height:${height}%"></div></div>
              <span class="trend-col-label">${showLabel ? escapeHtml(trendDayLabel(point.date)) : ""}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderCommunityAnalytics(community, analytics, period, target) {
    const modules = analytics.modules;
    const parts = [];

    if (modules.groupTrends) {
      const groupSeries = communityGroupSeries(community, COMMUNITY_TREND_DAYS, target);
      const weekTotal = communityGroupSeries(community, 7, target).reduce((sum, point) => sum + point.value, 0);
      const compare = communityStandings(community, period, "points");
      const maxCompare = Math.max(1, ...compare.map((item) => item.periodPoints));
      const compareRows = compare.map((item) => `
        <div class="cc-compare-row">
          <span class="cc-compare-name">${escapeHtml(item.name.split(" ")[0])}</span>
          <div class="mini-progress-track cc-compare-track" aria-hidden="true"><div class="mini-progress-fill" style="width:${Math.round((item.periodPoints / maxCompare) * 100)}%"></div></div>
          <strong class="cc-compare-value">${escapeHtml(formatPoints(item.periodPoints))}</strong>
        </div>
      `).join("");
      parts.push(`
        <section class="tool-panel cc-panel">
          <div class="panel-heading tight">
            <div><h3>Group trend</h3><span>Community points · last ${COMMUNITY_TREND_DAYS} days</span></div>
            <strong class="cc-stat">${escapeHtml(formatPoints(weekTotal))} this week</strong>
          </div>
          ${renderCommunityTrendChart(groupSeries, { ariaLabel: "Community points over time" })}
          <div class="cc-subhead">Member comparison · ${escapeHtml(communityPeriod(period).label.toLowerCase())}</div>
          <div class="cc-compare">${compareRows}</div>
        </section>
      `);
    }

    if (modules.individualTrends) {
      let memberId = state.communityTrendMemberId;
      if (!memberId || !community.members.some((member) => member.id === memberId)) {
        memberId = community.members.some((member) => member.id === state.selectedCommunityMemberId)
          ? state.selectedCommunityMemberId
          : (community.members[0] && community.members[0].id) || "me";
      }
      const member = community.members.find((item) => item.id === memberId) || community.members[0];
      const memberSeries = member ? communityMemberSeries(community, member, COMMUNITY_TREND_DAYS, target) : [];
      const memberWeek = member ? communityMemberPeriodScore(community, member, "weekly", target) : 0;
      const optionsHtml = community.members.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === memberId ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
      parts.push(`
        <section class="tool-panel cc-panel">
          <div class="panel-heading tight">
            <div><h3>Individual trend</h3><span>Last ${COMMUNITY_TREND_DAYS} days</span></div>
          </div>
          <label class="cc-member-select"><span>Member</span><select id="communityTrendMemberSelect">${optionsHtml}</select></label>
          ${member ? renderCommunityTrendChart(memberSeries, { ariaLabel: `${member.name} points over time` }) : emptyState("No members yet.")}
          <div class="cc-subhead">${member ? escapeHtml(member.name.split(" ")[0]) : ""} · ${escapeHtml(formatPoints(memberWeek))} this week</div>
        </section>
      `);
    }

    if (modules.underperforming) {
      const under = communityUnderperformers(community, target);
      const rows = under.length
        ? under.map((item) => {
            const flag = item.label === "No activity today" ? "neutral" : "warm";
            return `
              <div class="cc-under-row">
                <div class="member-left">
                  <div class="member-avatar" aria-hidden="true" style="background:${escapeHtml(item.color)}">${getInitials(item.name)}</div>
                  <div class="member-main">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${escapeHtml(formatPoints(item.today))} of ${escapeHtml(formatPoints(item.target))} today</span>
                  </div>
                </div>
                <span class="cc-flag ${flag}">${escapeHtml(item.label)}</span>
              </div>
            `;
          }).join("")
        : `<div class="cc-allgood">Everyone is on track today.</div>`;
      parts.push(`
        <section class="tool-panel cc-panel">
          <div class="panel-heading tight">
            <div><h3>Underperforming today</h3><span>Accountability nudges, not call-outs</span></div>
          </div>
          <div class="cc-under-list">${rows}</div>
        </section>
      `);
    }

    els.communityAnalytics.innerHTML = parts.join("");
    const memberSelect = document.getElementById("communityTrendMemberSelect");
    if (memberSelect) {
      memberSelect.addEventListener("change", () => {
        state.communityTrendMemberId = memberSelect.value;
        saveState();
        renderCommunityDetail();
      });
    }
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

    const analytics = normalizeCommunityAnalytics(community);
    els.communityAnalyticsSettings.hidden = !canEdit;
    els.ccModuleLeaderboard.checked = analytics.modules.leaderboard;
    els.ccModuleGroupTrends.checked = analytics.modules.groupTrends;
    els.ccModuleIndividualTrends.checked = analytics.modules.individualTrends;
    els.ccModuleUnderperforming.checked = analytics.modules.underperforming;
    els.ccDefaultPeriodInput.value = analytics.defaultPeriod;
    els.ccMetricInput.value = analytics.metric;
    [els.ccModuleLeaderboard, els.ccModuleGroupTrends, els.ccModuleIndividualTrends, els.ccModuleUnderperforming, els.ccDefaultPeriodInput, els.ccMetricInput].forEach((input) => {
      input.disabled = !canEdit;
    });
  }

  function renderCommunityMemberActivity() {
    // Only (re)build this view when it's actually on screen. Avoids collapsing an
    // open message thread — and an off-screen isNudgeable call — on background
    // renders (e.g. the bell refreshing) while the user is elsewhere.
    if (state.activeView !== "community-member-activity") return;
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
    const q = query.trim();
    if (!communitiesAreShared()) {
      els.findCommunityResults.innerHTML = emptyState("Sign in to find and join communities.");
      return;
    }
    if (q.length < 2) {
      els.findCommunityResults.innerHTML = emptyState("Search by community name, or paste an invite code.");
      return;
    }

    // Merge name-search matches with the exact invite-code match (which may be a
    // private community not present in name results). Dedup by id.
    const byId = new Map();
    communitySearchResults.forEach((item) => byId.set(String(item.id), item));
    if (communityCodeResult && typeof communityCodeResult === "object") {
      const id = String(communityCodeResult.id);
      if (!byId.has(id)) {
        byId.set(id, {
          id: communityCodeResult.id,
          name: communityCodeResult.name,
          category: communityCodeResult.category,
          description: communityCodeResult.description,
          member_count: communityCodeResult.member_count,
          visibility: "code", // found by exact code → instant join regardless of tier
          is_member: state.communities.some((c) => c.id === communityCodeResult.id),
          request_status: null
        });
      }
    }

    const results = Array.from(byId.values());
    els.findCommunityResults.innerHTML = results.length
      ? results.map(renderCommunitySearchCard).join("")
      : emptyState(`No communities found for "${escapeHtml(q)}". Try another name, or paste an exact invite code.`);

    Array.from(els.findCommunityResults.querySelectorAll("[data-join-community-id]")).forEach((button) => {
      button.addEventListener("click", () => joinCommunityById(button.dataset.joinCommunityId));
    });
    Array.from(els.findCommunityResults.querySelectorAll("[data-request-community-id]")).forEach((button) => {
      button.addEventListener("click", () => requestToJoinById(button.dataset.requestCommunityId));
    });
  }

  function renderCommunitySearchCard(item) {
    const id = escapeHtml(String(item.id));
    const already = item.is_member || state.communities.some((community) => community.id === item.id);
    let action;
    if (already) {
      action = `<button class="secondary-button small" type="button" data-join-community-id="${id}">Open</button>`;
    } else if (item.visibility === "request_to_join") {
      if (item.request_status === "pending") {
        action = `<button class="ghost-button small" type="button" disabled>Requested</button>`;
      } else if (item.request_status === "declined") {
        action = `<button class="secondary-button small" type="button" data-request-community-id="${id}">Request again</button>`;
      } else {
        action = `<button class="primary-button small" type="button" data-request-community-id="${id}">Request to join</button>`;
      }
    } else {
      // public, or found by exact invite code (any tier) → join instantly
      action = `<button class="primary-button small" type="button" data-join-community-id="${id}">Join</button>`;
    }
    const tier = item.visibility === "request_to_join"
      ? `<span class="visibility-pill request">Request to join</span>`
      : item.visibility === "public" ? `<span class="visibility-pill public">Public</span>` : "";
    return `
      <article class="find-community-card">
        <div class="find-community-main">
          <strong>${escapeHtml(item.name || "Community")}</strong>
          <span>${escapeHtml(item.category || "Community")} &middot; ${plural(Number(item.member_count) || 0, "member")} ${tier}</span>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
        </div>
        <div class="find-community-actions">${action}</div>
      </article>
    `;
  }

  async function requestToJoinById(communityId) {
    if (!communitiesAreShared() || !communityId) return;
    const res = await window.PointwellSignals.requestToJoin(communityId, state.account.userId);
    if (res.error) { showToast(communityDbError(res.error, "Couldn't request to join")); return; }
    showToast(res.already ? "You've already requested to join" : "Request sent — the owner will review it");
    runCommunityCodeSearch(state.communitySearchQuery || ""); // refresh the action to "Requested"
  }

  function renderProfile() {
    els.profileNameInput.value = state.profile.name;
    els.profileHandleInput.value = state.profile.handle.replace(/^@/, "");
    els.profilePrivacyInput.value = state.profile.privacy;
    els.dailyTargetInput.value = state.profile.dailyTarget;
    if (els.allowMotivationInput) els.allowMotivationInput.checked = state.profile.allowMotivation === true;

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
      // Persist to the shared DB just like the community check-in button does, so a
      // dashboard "Add Entry" survives navigation / reload / other members. Surface
      // the real error if the write is rejected instead of keeping it device-local.
      const dbCommunity = context.community;
      const dbRuleId = rule.id;
      Promise.resolve(pushCommunityEntryToDb(dbCommunity, dbRuleId)).then((result) => {
        if (result && result.error) {
          showToast(communityDbError(result.error, "Logged here, but couldn't save it to the community"));
        }
      });
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
    if (!system) return false;
    const values = collectDraftValues(system, valuesForScoreContext(context));
    const summary = calculateDashboardSummary(system, values, context);

    renderDailyTargetProgress(summary.total, summary.target.total);
    renderDailyInsight(context, system, summary);

    // Action-first empty state: "empty" = no entries for today's context, off the
    // SAME entryCount the analytics use (so they always agree). When empty, skip the
    // zero-value analytics and offer one quick-log chip per rule instead.
    const empty = summary.entryCount === 0;
    if (els.topCardPanel) els.topCardPanel.hidden = empty;
    if (els.visualBreakdownPanel) els.visualBreakdownPanel.hidden = empty;
    if (els.weeklyProgressPanel) els.weeklyProgressPanel.hidden = empty;
    if (els.quickLogChips) els.quickLogChips.hidden = !empty;
    if (empty) {
      renderQuickLogChips(system);
    } else {
      els.quickLogChips.innerHTML = "";
      renderVisualBreakdown(summary.breakdown, summary.calculatedTotals, system, summary.target, summary.total);
      renderTopCardHighlights(summary.breakdown, summary.calculatedTotals, system, summary.target, summary.total);
    }
    renderEntriesAddedSection(system, summary.breakdown, context);

    bindQuickEntryDeletes();
    return empty;
  }

  // One tappable chip per rule in the active system. yes/no rules log in one tap at
  // their default value (showing the point value); rules that need an amount open
  // the existing Add Entry UI prefilled to that rule.
  function renderQuickLogChips(system) {
    if (!els.quickLogChips) return;
    const rules = (system.rules || []).map(scoring.normalizeRule);
    els.quickLogChips.innerHTML = rules.map((rule) => {
      const points = canOneTapLog(rule) ? ` <span class="quick-log-chip-points">+${escapeHtml(formatPoints(rule.yesNoPoints))}</span>` : "";
      return `<button class="signal-preset-chip quick-log-chip" type="button" data-quick-log-rule="${escapeHtml(rule.id)}">${escapeHtml(rule.label)}${points}</button>`;
    }).join("");
    Array.from(els.quickLogChips.querySelectorAll("[data-quick-log-rule]")).forEach((button) => {
      button.addEventListener("click", () => quickLogChipTap(button.dataset.quickLogRule));
    });
  }

  // yes/no (toggle) rules have a fixed completion value, so they can be logged in
  // one tap; everything else needs a chosen amount.
  function canOneTapLog(rule) {
    return rule.inputMethod === "toggle" || rule.simpleStyle === "yesNo";
  }

  function quickLogChipTap(ruleId) {
    const system = getActiveScoreContext().system;
    const rule = system && system.rules.map(scoring.normalizeRule).find((item) => item.id === ruleId);
    if (!rule) return;
    // Reuse the EXISTING add-entry path — no new logging flow.
    addEntryDraft = { ruleId: rule.id, amount: suggestedEntryAmount(rule) };
    if (canOneTapLog(rule)) {
      addDailyEntryFromDraft();
    } else {
      openAddEntryPage();
    }
  }

  // Daily Insight: build a fact snapshot from the SAME summary the score uses
  // (so the card never drifts), then let the insight module interpret it.
  function renderDailyInsight(context, system, summary) {
    if (!els.dailyInsightText || !window.PointwellInsight) return;
    const snapshot = {
      mode: context.type === "community" ? "community" : "personal",
      total: summary.total,
      target: summary.target.total,
      entryCount: summary.entryCount,
      rules: summary.breakdown.map((item) => ({
        label: item.rule.label,
        points: roundScore(item.totalPoints),
        value: numberOrDefault(item.value, 0),
        target: targetPointsForRule(item.rule)
      })),
      weeklyAverage: insightWeeklyAverage(context, system),
      streak: null
    };
    const facts = window.PointwellInsight.computeInsightFacts(snapshot);
    els.dailyInsightText.textContent = window.PointwellInsight.generateInsightText(facts);
  }

  // Truthful weekly average from REAL saved history only (no fabricated data).
  // Personal: prior-day saved daily summaries. Community: the current user's own
  // prior-day community logs. Returns null when no real history exists.
  function insightWeeklyAverage(context, system) {
    const totals = [];
    if (context.type === "community" && context.community) {
      const logs = Array.isArray(context.community.logs) ? context.community.logs : [];
      for (let i = 1; i <= 6; i++) {
        const dateKey = offsetDate(-i);
        const entry = logs.find((item) => item.memberId === "me" && item.date === dateKey);
        if (entry && Number.isFinite(Number(entry.today))) totals.push(Number(entry.today));
      }
    } else if (system) {
      for (let i = 1; i <= 6; i++) {
        const entry = findEntry(offsetDate(-i), system.id);
        if (entry && Number.isFinite(Number(entry.total))) totals.push(Number(entry.total));
      }
    }
    if (!totals.length) return null;
    return roundScore(totals.reduce((sum, value) => sum + value, 0) / totals.length);
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
      categories,
      entryCount: activeRuleIds.size
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
          <button class="ghost-button small" type="button" data-turn-community-id="${escapeHtml(system.id)}">Turn into Community</button>
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
          <span class="community-meta">${plural(getCommunityMemberCount(community), "member")} · ${escapeHtml(visibilityLabel(visibility))}</span>
          <span class="community-score-line">My score today: ${escapeHtml(formatPoints(myScore))} points</span>
        </div>
        <span class="visibility-pill ${visibility === "request_to_join" ? "request" : escapeHtml(visibility)}">${escapeHtml(visibilityLabel(visibility))}</span>
      </button>
    `;
  }

  function communityDescriptionLine(community) {
    return community.description || community.category || "Community accountability";
  }

  // Three discovery tiers; anything unrecognized falls back to the safest (private).
  function normalizeVisibilityTier(value) {
    return (value === "public" || value === "request_to_join") ? value : "private";
  }

  function communityVisibility(community) {
    return normalizeVisibilityTier(community.visibility);
  }

  function visibilityLabel(value) {
    if (value === "public") return "Public";
    if (value === "request_to_join") return "Request to join";
    return "Private";
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
    const metric = memberStanding.metric || "points";
    const periodPoints = memberStanding.periodPoints != null ? memberStanding.periodPoints : memberStanding.today;
    const denom = metric === "completion" ? 100 : (memberStanding.periodTarget || memberStanding.target || 1);
    const progressValue = metric === "completion" ? (memberStanding.completion || 0) : periodPoints;
    const progress = progressPercent(progressValue, denom);
    const value = metric === "completion" ? `${memberStanding.completion || 0}%` : formatPoints(periodPoints);
    const sub = memberStanding.periodLabel || "today";
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
          ${value}
          <span>${escapeHtml(sub)}</span>
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

        ${renderMemberSignalActions(community, memberItem)}

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
    bindMemberSignalActions(community, memberItem);
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
    community.visibility = normalizeVisibilityTier(els.communityVisibilityInput.value);
    community.system = normalizeSystem(community.system || { rules: [] });
    community.system.title = `${community.name} rules`;
    community.system.category = community.category || community.system.category || "Community";
    community.system.rules = collectCommunityRuleEditorValues(community);
    const analytics = normalizeCommunityAnalytics(community);
    analytics.modules.leaderboard = els.ccModuleLeaderboard.checked;
    analytics.modules.groupTrends = els.ccModuleGroupTrends.checked;
    analytics.modules.individualTrends = els.ccModuleIndividualTrends.checked;
    analytics.modules.underperforming = els.ccModuleUnderperforming.checked;
    analytics.defaultPeriod = COMMUNITY_PERIODS.some((item) => item.id === els.ccDefaultPeriodInput.value) ? els.ccDefaultPeriodInput.value : "weekly";
    analytics.metric = els.ccMetricInput.value === "completion" ? "completion" : "points";
    community.analytics = analytics;
    saveState();
    render();
    showToast("Community settings saved");
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

  // ── Create Community: multi-step setup flow (mirrors the reward-system builder) ──
  const createCommunitySteps = [
    { title: "Basic Info", intro: "Name the community and describe what it is about.", nextLabel: "Next: Add Rules" },
    { title: "Community Rules", intro: "Generate rules with AI, or build them from scratch.", nextLabel: "Next: Review" },
    { title: "Review & Complete", intro: "Check the community before creating it. You can go back to adjust anything.", nextLabel: "Complete" }
  ];

  function blankCommunityDraft() {
    return { name: "", category: "", description: "", visibility: "private", rules: [] };
  }

  function ensureCommunityDraft() {
    if (!communityDraft) {
      communityDraft = blankCommunityDraft();
      communityDraftStep = 0;
      editingCommunityDraftRuleId = "";
    }
    return communityDraft;
  }

  function openCreateCommunity() {
    communityDraft = blankCommunityDraft();
    communityDraftStep = 0;
    communityDraftMethod = "";
    editingCommunityDraftRuleId = "";
    state.activeView = "create-community";
    saveState();
    render();
    requestAnimationFrame(() => {
      els.ccNameInput?.focus();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function turnSystemIntoCommunity(systemId) {
    const system = state.systems.find((item) => item.id === systemId);
    if (!system) return;
    const normalized = normalizeSystem(system);
    communityDraft = {
      name: `${system.title || "Reward system"} Community`,
      category: system.category || "Community",
      description: `Shared accountability based on ${system.title || "this reward system"}.`,
      visibility: "private",
      rules: normalized.rules.map((rule) => scoring.createRule({ ...scoring.normalizeRule(rule), id: makeId("community-rule") }))
    };
    communityDraftStep = 0;
    communityDraftMethod = "scratch";
    editingCommunityDraftRuleId = "";
    state.activeView = "create-community";
    saveState();
    render();
    requestAnimationFrame(() => {
      els.ccNameInput?.focus();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    showToast(`Community draft created from ${system.title || "reward system"}`);
  }

  function setCommunityDraftMethod(method) {
    communityDraftMethod = (method === "ai" || method === "scratch") ? method : "";
    if (communityDraftMethod !== "") {
      const draft = ensureCommunityDraft();
      communityDraftStep = (draft.name.trim() && draft.category.trim()) ? 1 : 0;
    }
    renderCreateCommunity();
    if (communityDraftMethod === "") return;
    requestAnimationFrame(() => {
      if (communityDraftStep === 0) els.ccNameInput?.focus();
      else if (communityDraftMethod === "ai") els.ccAiGoalsInput?.focus();
      else els.ccRuleLabelInput?.focus();
    });
  }

  function generateCommunityAiRules() {
    const draft = ensureCommunityDraft();
    const inputs = {
      goals: els.ccAiGoalsInput.value.trim(),
      rewards: els.ccAiRewardInput.value.trim(),
      penalties: els.ccAiPenalizeInput.value.trim(),
      categories: (draft.category || els.ccCategoryInput.value || "").trim(),
      strictness: els.ccAiStrictnessInput.value,
      targets: els.ccAiTargetsInput.value.trim()
    };
    if (!inputs.goals && !inputs.rewards) {
      showToast("Describe the community goal first");
      return;
    }
    const generated = createMockAiDraftSystem(inputs, blankAiAdjustments());
    draft.rules = (generated.rules || []).map((rule) => scoring.createRule({ ...scoring.normalizeRule(rule), id: makeId("community-rule") }));
    editingCommunityDraftRuleId = "";
    saveState();
    renderCreateCommunity();
    showToast(draft.rules.length ? `Generated ${draft.rules.length} rules — review and edit below` : "No rules generated — add more detail");
  }

  function cancelCreateCommunity() {
    communityDraft = null;
    communityDraftStep = 0;
    communityDraftMethod = "";
    editingCommunityDraftRuleId = "";
    returnToCommunities();
  }

  function syncCommunityDraftFromForm() {
    const draft = ensureCommunityDraft();
    draft.name = els.ccNameInput.value;
    draft.category = els.ccCategoryInput.value;
    draft.description = els.ccDescriptionInput.value;
    draft.visibility = normalizeVisibilityTier(els.ccVisibilityInput.value);
  }

  function validateCreateCommunityStep(step) {
    if (step === 0) {
      if (!els.ccNameInput.value.trim()) return "Add a community name";
      if (!els.ccCategoryInput.value.trim()) return "Add a category or focus area";
    }
    return "";
  }

  function moveCreateCommunityStep(delta) {
    syncCommunityDraftFromForm();
    if (delta > 0) {
      const error = validateCreateCommunityStep(communityDraftStep);
      if (error) {
        showToast(error);
        return;
      }
    }
    communityDraftStep = Math.min(Math.max(communityDraftStep + delta, 0), createCommunitySteps.length - 1);
    saveState();
    renderCreateCommunity();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function goToCreateCommunityStep(step) {
    syncCommunityDraftFromForm();
    communityDraftStep = Math.min(Math.max(Number(step) || 0, 0), createCommunitySteps.length - 1);
    renderCreateCommunity();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function renderCreateCommunity() {
    if (state.activeView !== "create-community") return;
    const draft = ensureCommunityDraft();
    communityDraftStep = Math.min(Math.max(communityDraftStep, 0), createCommunitySteps.length - 1);
    const step = communityDraftStep;
    const config = createCommunitySteps[step];

    els.createCommunityStepKicker.textContent = `Step ${step + 1} of ${createCommunitySteps.length}`;
    els.createCommunityStepTitle.textContent = config.title;
    els.createCommunityStepIntro.textContent = config.intro;

    if (document.activeElement !== els.ccNameInput) els.ccNameInput.value = draft.name;
    if (document.activeElement !== els.ccCategoryInput) els.ccCategoryInput.value = draft.category;
    if (document.activeElement !== els.ccDescriptionInput) els.ccDescriptionInput.value = draft.description;
    els.ccVisibilityInput.value = draft.visibility;

    els.createCommunityStepper.innerHTML = createCommunitySteps.map((item, index) => {
      const stateClass = index === step ? "active" : (index < step ? "complete" : "");
      return `<button class="setup-step-dot ${stateClass}" type="button" data-cc-step-jump="${index}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(item.title)}</strong>
      </button>`;
    }).join("");
    Array.from(els.createCommunityStepper.querySelectorAll("[data-cc-step-jump]")).forEach((button) => {
      button.addEventListener("click", () => goToCreateCommunityStep(button.dataset.ccStepJump));
    });

    Array.from(els.createCommunityView.querySelectorAll("[data-cc-step]")).forEach((panel) => {
      panel.hidden = Number(panel.dataset.ccStep) !== step;
    });

    const method = communityDraftMethod;
    const hasRules = draft.rules.length > 0;
    els.ccMethodLanding.hidden = method !== "";
    els.ccEditorPanel.hidden = method === "";
    els.ccAiPanel.hidden = !(method === "ai" && !hasRules);
    els.ccRulesPanel.hidden = !(method === "scratch" || (method === "ai" && hasRules));
    els.ccRegenerateButton.hidden = method !== "ai";

    els.createCommunityBackButton.textContent = "Back";
    els.createCommunityNextButton.textContent = config.nextLabel;
    els.createCommunityNextButton.hidden = step >= createCommunitySteps.length - 1;
    els.createCommunityCompleteButton.hidden = step !== createCommunitySteps.length - 1;

    if (!els.ccRuleDataSourceInput.options.length) {
      els.ccRuleDataSourceInput.innerHTML = renderDataSourceOptionHtml("manual");
    }
    if (!els.ccRuleSourceMetricInput.options.length) {
      els.ccRuleSourceMetricInput.innerHTML = renderSourceMetricOptionHtml(els.ccRuleDataSourceInput.value || "manual", "");
    }

    renderCommunityDraftRules();
    renderCommunityDraftRuleForm();
    if (step === createCommunitySteps.length - 1) renderCreateCommunityReview();
  }

  function renderCommunityDraftRules() {
    const draft = ensureCommunityDraft();
    const rules = draft.rules.map(scoring.normalizeRule);
    els.communityDraftRuleCount.textContent = `${rules.length} ${rules.length === 1 ? "rule" : "rules"}`;
    els.communityDraftRuleList.innerHTML = rules.length
      ? rules.map(renderCommunityDraftRuleRow).join("")
      : emptyState("No community rules yet. Add your first rule below.");
    Array.from(els.communityDraftRuleList.querySelectorAll("[data-cc-edit-rule]")).forEach((button) => {
      button.addEventListener("click", () => editCommunityDraftRule(button.dataset.ccEditRule));
    });
    Array.from(els.communityDraftRuleList.querySelectorAll("[data-cc-delete-rule]")).forEach((button) => {
      button.addEventListener("click", () => deleteCommunityDraftRule(button.dataset.ccDeleteRule));
    });
  }

  function renderCommunityDraftRuleRow(item) {
    const summary = [...scoring.describeRule(item), ruleSourceSummary(item)];
    const primaryPoints = item.simpleStyle === "penalty"
      ? item.penaltyPoints
      : (item.simpleStyle === "yesNo" ? item.yesNoPoints : (item.goalPoints || item.everyPoints));
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
        <div class="rule-actions">
          <button class="ghost-button small" type="button" data-cc-edit-rule="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.label)}">Edit</button>
          <button class="ghost-button small" type="button" data-cc-delete-rule="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.label)}">Delete</button>
        </div>
      </div>
    `;
  }

  function communityDraftRuleType(rule) {
    if (rule.simpleStyle === "yesNo") return "yesNo";
    if (rule.simpleStyle === "penalty") return "penalty";
    if (rule.simpleStyle === "goal") return "goal";
    return "every";
  }

  function communityDraftRulePoints(rule, type) {
    if (type === "yesNo") return rule.yesNoPoints;
    if (type === "penalty") return Math.abs(rule.penaltyPoints);
    if (type === "goal") return rule.goalPoints;
    return rule.everyPoints;
  }

  function renderCommunityDraftRuleForm() {
    const draft = ensureCommunityDraft();
    const editing = editingCommunityDraftRuleId
      ? draft.rules.map(scoring.normalizeRule).find((item) => item.id === editingCommunityDraftRuleId)
      : null;
    if (editing) {
      const type = communityDraftRuleType(editing);
      els.ccRuleTypeInput.value = type;
      els.ccRuleLabelInput.value = editing.label;
      els.ccRuleUnitInput.value = editing.unit;
      els.ccRuleGoalInput.value = type === "penalty" ? editing.minimumRequired : editing.dailyTarget;
      els.ccRuleEveryAmountInput.value = editing.everyAmount;
      els.ccRulePointsInput.value = communityDraftRulePoints(editing, type);
      els.ccRuleDataSourceInput.innerHTML = renderDataSourceOptionHtml(editing.dataSource || "manual");
      els.ccRuleSourceMetricInput.innerHTML = renderSourceMetricOptionHtml(editing.dataSource || "manual", editing.sourceMetric || "manual");
      els.ccRuleManualOverrideInput.checked = editing.allowManualOverride !== false;
      els.ccRuleFormTitle.textContent = `Editing ${editing.label}`;
      els.ccRuleSubmitLabel.textContent = "Save rule";
      els.cancelCcRuleEditButton.hidden = false;
      updateCcRuleBuilderVisibility();
    } else {
      resetCommunityDraftRuleForm();
    }
  }

  function updateCcRuleBuilderVisibility() {
    const type = els.ccRuleTypeInput.value;
    els.ccRuleGoalField.hidden = !(type === "every" || type === "goal" || type === "penalty");
    els.ccRuleEveryAmountField.hidden = type !== "every";
    els.ccRuleUnitField.hidden = type === "yesNo";
    els.ccRuleGoalLabel.textContent = type === "penalty" ? "Minimum required" : "Daily goal";
    els.ccRulePointsLabel.textContent = type === "yesNo" ? "Points when completed"
      : type === "every" ? "Points each time"
      : type === "penalty" ? "Penalty points"
      : "Points for hitting goal";
  }

  function resetCommunityDraftRuleForm() {
    els.ccRuleTypeInput.value = "yesNo";
    els.ccRuleLabelInput.value = "";
    els.ccRuleUnitInput.value = "";
    els.ccRuleGoalInput.value = "";
    els.ccRuleEveryAmountInput.value = "";
    els.ccRulePointsInput.value = "";
    els.ccRuleDataSourceInput.innerHTML = renderDataSourceOptionHtml("manual");
    els.ccRuleSourceMetricInput.innerHTML = renderSourceMetricOptionHtml("manual", "manual");
    els.ccRuleManualOverrideInput.checked = true;
    els.ccRuleFormTitle.textContent = "Add community rule";
    els.ccRuleSubmitLabel.textContent = "Add rule";
    els.cancelCcRuleEditButton.hidden = true;
    updateCcRuleBuilderVisibility();
  }

  function validateCommunityDraftRule() {
    const type = els.ccRuleTypeInput.value;
    if (!els.ccRuleLabelInput.value.trim()) return "Name what you are tracking";
    if (type !== "yesNo" && !els.ccRuleUnitInput.value.trim()) return "Add a unit (e.g. steps, minutes)";
    if ((type === "every" || type === "goal" || type === "penalty") && numberOrDefault(els.ccRuleGoalInput.value, 0) <= 0) {
      return type === "penalty" ? "Set the minimum required" : "Set a daily goal";
    }
    if (type === "every" && numberOrDefault(els.ccRuleEveryAmountInput.value, 0) <= 0) return "Set the 'every' amount";
    if (numberOrDefault(els.ccRulePointsInput.value, 0) === 0) return "Set the points";
    return "";
  }

  function buildCommunityDraftRuleFromForm(id) {
    const draft = ensureCommunityDraft();
    const type = els.ccRuleTypeInput.value;
    const label = els.ccRuleLabelInput.value.trim();
    const unit = type === "yesNo" ? "times" : (els.ccRuleUnitInput.value.trim() || "times");
    const goal = Math.max(numberOrDefault(els.ccRuleGoalInput.value, 0), 0);
    const everyAmount = Math.max(numberOrDefault(els.ccRuleEveryAmountInput.value, 1), 1);
    const points = numberOrDefault(els.ccRulePointsInput.value, 0);
    const dataSource = els.ccRuleDataSourceInput.value || "manual";
    const metricOptions = sourceMetricOptions[dataSource] || sourceMetricOptions.manual;
    const rawMetric = els.ccRuleSourceMetricInput.value || metricOptions[0]?.id || "manual";
    const sourceMetric = metricOptions.some((option) => option.id === rawMetric) ? rawMetric : (metricOptions[0]?.id || "manual");
    const overrides = {
      id,
      label,
      category: draft.category.trim() || "Community",
      metric: label.toLowerCase(),
      unit,
      dataSource,
      sourceMetric,
      allowManualOverride: els.ccRuleManualOverrideInput.checked,
      inputMethod: type === "yesNo" ? "toggle" : "slider",
      inputMax: Math.max(goal * 2, everyAmount * 2, 10),
      inputStep: 1,
      extraThresholds: []
    };
    if (type === "yesNo") {
      overrides.simpleStyle = "yesNo";
      overrides.dailyTarget = 1;
      overrides.yesNoPoints = points;
    } else if (type === "every") {
      overrides.simpleStyle = "every";
      overrides.dailyTarget = goal;
      overrides.everyAmount = everyAmount;
      overrides.everyPoints = points;
    } else if (type === "penalty") {
      overrides.simpleStyle = "penalty";
      overrides.minimumRequired = goal;
      overrides.penaltyEnabled = true;
      overrides.penaltyMode = "fixed";
      overrides.penaltyPoints = points > 0 ? -points : points;
    } else {
      overrides.simpleStyle = "goal";
      overrides.dailyTarget = goal;
      overrides.goalPoints = points;
    }
    return scoring.createRule(overrides);
  }

  function saveCommunityDraftRule(event) {
    if (event) event.preventDefault();
    const draft = ensureCommunityDraft();
    const error = validateCommunityDraftRule();
    if (error) {
      showToast(error);
      return;
    }
    const editing = Boolean(editingCommunityDraftRuleId);
    const id = editingCommunityDraftRuleId || makeId("community-rule");
    const rule = buildCommunityDraftRuleFromForm(id);
    if (editing) {
      const index = draft.rules.findIndex((item) => item.id === editingCommunityDraftRuleId);
      if (index >= 0) {
        draft.rules[index] = rule;
      } else {
        editingCommunityDraftRuleId = "";
        draft.rules.push(rule);
      }
    } else {
      draft.rules.push(rule);
    }
    editingCommunityDraftRuleId = "";
    resetCommunityDraftRuleForm();
    saveState();
    renderCreateCommunity();
    showToast(editing ? "Rule updated" : "Rule added");
  }

  function editCommunityDraftRule(id) {
    editingCommunityDraftRuleId = id;
    renderCreateCommunity();
    requestAnimationFrame(() => {
      els.ccRuleLabelInput?.focus();
      els.communityDraftRuleForm?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function deleteCommunityDraftRule(id) {
    const draft = ensureCommunityDraft();
    draft.rules = draft.rules.filter((item) => item.id !== id);
    if (editingCommunityDraftRuleId === id) {
      editingCommunityDraftRuleId = "";
      resetCommunityDraftRuleForm();
    }
    saveState();
    renderCreateCommunity();
    showToast("Rule deleted");
  }

  function renderCreateCommunityReview() {
    const draft = ensureCommunityDraft();
    const name = draft.name.trim() || "Untitled community";
    const category = draft.category.trim() || "Community";
    const reviewSystem = normalizeSystem({ rules: draft.rules, calculatedTotals: [] });
    const target = calculateTargetSummary(reviewSystem).total;
    const ruleRows = reviewSystem.rules.length
      ? reviewSystem.rules.map((item) => `
        <li>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${[...scoring.describeRule(item), ruleSourceSummary(item)].map(escapeHtml).join(" · ")}</span>
        </li>
      `).join("")
      : `<li><span>No rules yet.</span></li>`;
    els.createCommunityReview.innerHTML = `
      <div class="review-card">
        <span>Community</span>
        <strong>${escapeHtml(name)}</strong>
        <p>${escapeHtml(draft.description.trim() || "No description added yet.")}</p>
      </div>
      <div class="review-grid">
        <div class="review-card">
          <span>Category</span>
          <strong>${escapeHtml(category)}</strong>
        </div>
        <div class="review-card">
          <span>Visibility</span>
          <strong>${escapeHtml(capitalize(draft.visibility || "private"))}</strong>
        </div>
        <div class="review-card">
          <span>Daily point target</span>
          <strong>${escapeHtml(formatPoints(target))} points</strong>
        </div>
      </div>
      <div class="review-card">
        <span>Community rules</span>
        <ul class="review-list">${ruleRows}</ul>
      </div>
    `;
  }

  async function finalizeCommunityDraft() {
    syncCommunityDraftFromForm();
    const draft = ensureCommunityDraft();
    const name = draft.name.trim();
    const category = draft.category.trim();
    if (!name || !category) {
      communityDraftStep = 0;
      renderCreateCommunity();
      showToast(!name ? "Add a community name" : "Add a category or focus area");
      return;
    }
    if (!communitiesAreShared()) {
      showToast("Sign in to create a shared community");
      return;
    }
    const system = normalizeSystem({
      id: makeId("community-system"),
      title: `${name} rules`,
      category,
      rules: draft.rules,
      calculatedTotals: []
    });
    const res = await window.PointwellSignals.createCommunity({
      owner_user: state.account.userId,
      name,
      category,
      description: draft.description.trim(),
      visibility: normalizeVisibilityTier(draft.visibility),
      invite_code: makeInviteCode(category),
      system: system
    });
    if (res.error || !res.data) {
      if (/duplicate|unique/i.test((res.error && res.error.message) || "")) {
        showToast("That invite code already exists — try creating again.");
      } else {
        showToast(communityDbError(res.error, "Couldn't save the community"));
      }
      return;
    }
    // Creator becomes the first member (owner). If THIS fails, the community would
    // be saved but invisible (membership is how it loads) — so surface it.
    const joined = await window.PointwellSignals.joinCommunity(res.data.id, state.account.userId, "owner");
    if (joined && joined.error) {
      showToast(communityDbError(joined.error, "Saved the community, but couldn't add you as a member"));
      return;
    }
    state.communityDraftInputs = {};
    communityDraft = null;
    communityDraftStep = 0;
    communityDraftMethod = "";
    editingCommunityDraftRuleId = "";
    state.selectedCommunityId = res.data.id;
    state.activeView = "community-detail";
    await loadCommunitiesFromDb();
    // If the freshly-created community didn't come back from the DB, don't show a
    // blank "Community" — say why so it's diagnosable instead of silently empty.
    if (!state.communities.some((community) => community.id === res.data.id)) {
      showToast("Saved, but couldn't reload it — re-run supabase/communities.sql in Supabase.");
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    showToast(`Created "${name}"`);
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
    // Point at the REAL running app (its own origin+path), with the code as a
    // ?join= param the app reads on load. No invented domain.
    const base = window.location.origin + window.location.pathname;
    return `${base}?join=${code}`;
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
    // Share the logged points with the rest of the community (one row per rule/day).
    // Surface the real error if the shared write is rejected (e.g. the
    // community_entries RLS policies weren't applied) instead of silently keeping
    // it device-local — that's why a log could vanish on reload / for other members.
    Promise.all(entriesToAdd.map((item) => pushCommunityEntryToDb(community, item.rule.id))).then((results) => {
      const failed = results.find((result) => result && result.error);
      showToast(failed
        ? communityDbError(failed.error, "Logged here, but couldn't save it to the community")
        : "Community entry added");
    });
  }

  function saveProfile() {
    const name = els.profileNameInput.value.trim() || "Avery Rivera";
    const handle = cleanHandle(els.profileHandleInput.value.trim() || "avery");
    state.profile.name = name;
    state.profile.handle = handle;
    state.profile.privacy = els.profilePrivacyInput.value;
    state.profile.dailyTarget = numberOrDefault(els.dailyTargetInput.value, 8);
    // Persist the searchable basics + visibility to the DB (RLS allows self-update).
    // This is what makes you findable by your chosen name/handle and applies your
    // public/private choice server-side — and fixes edits being lost on reload.
    if (signalsReady()) {
      Promise.resolve(window.PointwellSignals.updateProfile(state.account.userId, {
        display_name: name,
        handle: handle,
        visibility: state.profile.privacy === "private" ? "private" : "public"
      })).catch(() => {});
    }
    if (els.allowMotivationInput) {
      state.profile.allowMotivation = els.allowMotivationInput.checked;
      // Mirror the opt-in to the server (what the RLS motivation gate reads), then
      // refresh our "behind" flag so opting in while behind takes effect at once.
      if (signalsReady()) {
        Promise.resolve(window.PointwellSignals.setOptIn(state.account.userId, state.profile.allowMotivation)).catch(() => {});
        pushMyBehindStatus();
      }
    }
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

  // ── Community analytics: periods, deterministic demo history, aggregation ──
  const COMMUNITY_PERIODS = [
    { id: "daily", label: "Daily", days: 1, since: "today" },
    { id: "weekly", label: "Weekly", days: 7, since: "this week" },
    { id: "monthly", label: "Monthly", days: 30, since: "this month" },
    { id: "all", label: "All-time", days: 56, since: "all-time" }
  ];
  const COMMUNITY_TREND_DAYS = 14;

  function communityPeriod(periodId) {
    return COMMUNITY_PERIODS.find((item) => item.id === periodId) || COMMUNITY_PERIODS[1];
  }

  function communityTarget(community) {
    return calculateTargetSummary(community.system).total || 6;
  }

  // deterministic 0..1 hash so demo history is stable across renders
  function hashUnit(str) {
    let hash = 2166136261;
    const value = String(str);
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 100000) / 100000;
  }

  function communityMemberStrength(member) {
    return 0.55 + hashUnit((member.id || "") + ":strength") * 0.7;
  }

  // Points a member earned on a date — REAL, from the shared community_entries (no
  // more per-member simulation). Members who haven't logged that day score 0, so
  // every account sees the same leaderboard.
  function communityMemberPointsOnDate(community, member, dateKey) {
    return roundScore(communityTotalForMember(community, member.id, dateKey));
  }

  function communityMemberPeriodScore(community, member, periodId, target) {
    const days = communityPeriod(periodId).days;
    let sum = 0;
    for (let i = 0; i < days; i++) {
      sum += communityMemberPointsOnDate(community, member, offsetDate(-i), target);
    }
    return roundScore(sum);
  }

  function communityMemberSeries(community, member, days, target) {
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const dateKey = offsetDate(-i);
      series.push({ date: dateKey, value: communityMemberPointsOnDate(community, member, dateKey, target) });
    }
    return series;
  }

  function communityGroupSeries(community, days, target) {
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const dateKey = offsetDate(-i);
      const total = community.members.reduce((sum, member) => sum + communityMemberPointsOnDate(community, member, dateKey, target), 0);
      series.push({ date: dateKey, value: roundScore(total) });
    }
    return series;
  }

  function communityStandings(community, periodId, metric) {
    const target = communityTarget(community);
    const period = communityPeriod(periodId);
    const periodTarget = target * period.days;
    return community.members.map((member) => {
      const periodPoints = communityMemberPeriodScore(community, member, period.id, target);
      const today = communityMemberPointsOnDate(community, member, todayIso, target);
      const completion = periodTarget > 0 ? Math.round((periodPoints / periodTarget) * 100) : 0;
      return {
        ...member,
        today,
        target,
        periodId: period.id,
        periodLabel: period.since,
        metric,
        periodPoints,
        periodTarget,
        completion,
        score: metric === "completion" ? completion : periodPoints
      };
    }).sort((a, b) => b.score - a.score || b.periodPoints - a.periodPoints);
  }

  function communityUnderperformers(community, target) {
    return community.members.map((member) => {
      const today = communityMemberPointsOnDate(community, member, todayIso, target);
      const weekAvg = communityMemberPeriodScore(community, member, "weekly", target) / 7;
      let label = "";
      if (today <= 0) label = "No activity today";
      else if (today < target) label = "Behind goal";
      else if (today < weekAvg * 0.75) label = "Down from weekly average";
      return { ...member, today, weekAvg, target, label };
    }).filter((item) => item.label).sort((a, b) => {
      const rank = (label) => label === "No activity today" ? 0 : (label === "Behind goal" ? 1 : 2);
      return rank(a.label) - rank(b.label) || a.today - b.today;
    });
  }

  function normalizeCommunityAnalytics(community) {
    const source = community.analytics && typeof community.analytics === "object" ? community.analytics : {};
    const modules = source.modules && typeof source.modules === "object" ? source.modules : {};
    community.analytics = {
      modules: {
        leaderboard: modules.leaderboard !== false,
        groupTrends: modules.groupTrends !== false,
        individualTrends: modules.individualTrends !== false,
        underperforming: modules.underperforming !== false
      },
      defaultPeriod: COMMUNITY_PERIODS.some((item) => item.id === source.defaultPeriod) ? source.defaultPeriod : "weekly",
      metric: source.metric === "completion" ? "completion" : "points"
    };
    return community.analytics;
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

  // ── Shared (DB-backed) communities bridge ──────────────────────────────────
  // Communities + membership + entries live in Supabase (supabase/communities.sql).
  // We load them into state.communities/state.communityEntries in the SAME shape the
  // local UI already renders, so the rendering/scoring code is untouched — only the
  // data SOURCE changed (per-user simulation → one shared row many people can join).
  function communitiesAreShared() { return signalsReady(); }

  // Turn a raw Supabase error into a human message — and, crucially, detect the
  // "tables don't exist yet" case so a failed write tells you to run the migration
  // instead of failing silently.
  function communityDbError(error, fallback) {
    const msg = (error && error.message) ? String(error.message) : "";
    if (/relation .* does not exist|could not find the table|schema cache|does not exist/i.test(msg)) {
      return "Communities aren't set up in the database yet — run supabase/communities.sql in Supabase.";
    }
    if (/permission denied|row-level security|violates row-level/i.test(msg)) {
      return "Blocked by the database — re-run supabase/communities.sql so the policies are applied.";
    }
    return msg ? (fallback + ": " + msg) : fallback;
  }

  function memberColorFor(id) {
    const palette = ["#266b5e", "#bb6a2f", "#7a4b86", "#355d91", "#2f7d6b", "#a4562f"];
    const key = String(id || "");
    let sum = 0;
    for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
    return palette[sum % palette.length];
  }

  function communityFromDb(row, memberRows) {
    const myId = state.account && state.account.userId;
    const members = (memberRows || []).map((m) => {
      const isMe = m.user_id === myId;
      return {
        id: isMe ? "me" : m.user_id,
        userId: m.user_id,
        name: isMe ? state.profile.name : (m.display_name || "Member"),
        handle: cleanHandle(m.handle || ""),
        color: isMe ? (state.profile.accent || "#355d91") : memberColorFor(m.user_id)
      };
    });
    const ownerIsMe = row.owner_user === myId;
    const system = (row.system && Array.isArray(row.system.rules))
      ? row.system
      : { id: makeId("community-system"), title: (row.name || "") + " rules", category: row.category, rules: [], calculatedTotals: [] };
    return {
      id: row.id,
      ownerId: ownerIsMe ? "me" : row.owner_user,
      adminIds: ownerIsMe ? ["me"] : [],
      name: row.name,
      category: row.category || "",
      description: row.description || "",
      visibility: row.visibility === "public" ? "public" : "private",
      inviteCode: row.invite_code,
      system: normalizeSystem(system),
      members: members,
      logs: [],
      memberCount: members.length
    };
  }

  function communityEntryFromDb(entry) {
    const myId = state.account && state.account.userId;
    return {
      id: entry.id,
      communityId: entry.community_id,
      userId: entry.user_id === myId ? "me" : entry.user_id,
      ruleId: entry.rule_id,
      amount: numberOrDefault(entry.amount, 0),
      date: entry.entry_date,
      dateKey: entry.entry_date,
      timestamp: entry.updated_at || ""
    };
  }

  // Replace state.communities/entries with the shared truth from the database.
  async function loadCommunitiesFromDb() {
    if (!communitiesAreShared()) return;
    const res = await window.PointwellSignals.fetchMyCommunities(state.account.userId);
    state.communities = (res.communities || []).map((row) =>
      communityFromDb(row, (res.membersByCommunity || {})[row.id] || []));
    state.communityEntries = (res.entries || []).map(communityEntryFromDb);
    if (!state.communities.some((community) => community.id === state.selectedCommunityId)) {
      state.selectedCommunityId = state.communities[0] ? state.communities[0].id : "";
    }
    saveState();
    render();
  }

  // Persist a member's logged check-in for one rule/day to the shared table (the
  // per-rule daily TOTAL, to match the table's one-row-per-rule/day shape).
  function pushCommunityEntryToDb(community, ruleId) {
    if (!communitiesAreShared() || !community || !ruleId) return Promise.resolve({ error: null });
    const today = getTodayKey();
    const total = getCommunityEntriesForMemberOnDate(community.id, "me", today)
      .filter((entry) => entry.ruleId === ruleId)
      .reduce((sum, entry) => sum + numberOrDefault(entry.amount, 0), 0);
    return Promise.resolve(window.PointwellSignals.upsertCommunityEntry({
      community_id: community.id,
      user_id: state.account.userId,
      rule_id: ruleId,
      amount: total,
      entry_date: today
    })).catch(() => ({ error: { message: "Couldn't reach the server." } }));
  }

  function runCommunityCodeSearch(query) {
    state.communitySearchQuery = query;
    const q = String(query || "").trim();
    if (!communitiesAreShared() || q.length < 2) {
      communityCodeResult = null;
      communitySearchResults = [];
      renderFindCommunities();
      return;
    }
    // Two lookups in parallel: NAME search (public + request_to_join only, private
    // excluded in the DB) AND an exact invite-code match (finds ANY tier, incl.
    // private — invites keep working for everyone).
    Promise.all([
      Promise.resolve(window.PointwellSignals.searchCommunities(q)).catch(() => []),
      Promise.resolve(window.PointwellSignals.findCommunityByCode(q)).catch(() => null)
    ]).then((out) => {
      communitySearchResults = Array.isArray(out[0]) ? out[0] : [];
      communityCodeResult = out[1] || null;
      renderFindCommunities();
    });
  }

  async function joinCommunityById(communityId) {
    if (!communitiesAreShared() || !communityId) return;
    const res = await window.PointwellSignals.joinCommunity(communityId, state.account.userId, "member");
    if (res.error) { showToast(communityDbError(res.error, "Couldn't join that community")); return; }
    state.selectedCommunityId = communityId;
    state.activeView = "community-detail";
    communityCodeResult = null;
    state.communitySearchQuery = "";
    await loadCommunitiesFromDb();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    showToast("Joined community");
  }

  // Resolve a ?join=CODE invite link once the user is signed in.
  async function resolvePendingJoin() {
    if (!pendingJoinCode || !communitiesAreShared()) return;
    const code = pendingJoinCode;
    pendingJoinCode = "";
    const found = await window.PointwellSignals.findCommunityByCode(code);
    if (!found) { showToast("That invite link is no longer valid"); return; }
    await joinCommunityById(found.id);
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
      account: saved.account && typeof saved.account === "object" ? saved.account : null,
      scoreContext: saved.scoreContext || seed.scoreContext,
      selectedCommunityMemberId: saved.selectedCommunityMemberId || seed.selectedCommunityMemberId,
      communityLeaderboardPeriod: saved.communityLeaderboardPeriod || seed.communityLeaderboardPeriod,
      communityTrendMemberId: saved.communityTrendMemberId || seed.communityTrendMemberId,
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
    // Retire the seeded demo communities (and their entries) so the removed demo
    // personas can't linger in a returning user's saved state. Real, user-created
    // communities (non-demo ids) are kept untouched.
    nextState.communities = nextState.communities.filter((community) => !isSeededDemoCommunity(community.id));
    nextState.communityEntries = (nextState.communityEntries || []).filter((entry) => !isSeededDemoCommunity(entry.communityId));
    if (!nextState.communities.some((community) => community.id === nextState.selectedCommunityId)) {
      nextState.selectedCommunityId = nextState.communities[0] ? nextState.communities[0].id : "";
    }
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

  // Demo communities are no longer seeded; this guard now disables ALL demo-entry
  // re-seeding so the removed personas can never reappear on load.
  function shouldBackfillCommunityEntries() {
    return false;
  }

  function isSeededDemoCommunity(id) {
    const value = String(id || "");
    return value === "gym-crew" || value === "study-room" || value.startsWith("public-");
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
