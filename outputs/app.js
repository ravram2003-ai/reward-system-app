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
    { id: "google-health", label: "Google Health (Fitbit)" },
    { id: "whoop", label: "Whoop" },
    { id: "calculated", label: "Calculated Total" }
  ];

  // Sources backed by a REAL live OAuth connection (the Supabase wearables
  // connector), not the in-app mock/sample data. See outputs/wearables.js.
  // "google-health" = the Google Health API (how real Fitbit data reaches the web app).
  const REAL_WEARABLE_SOURCES = new Set(["google-health", "whoop"]);

  const sourceMetricOptions = {
    manual: [
      { id: "manual", label: "Manual entry" }
    ],
    "google-health": [
      { id: "steps", label: "Steps" },
      { id: "sleep-hours", label: "Sleep hours" },
      { id: "resting-heart-rate", label: "Resting heart rate" },
      { id: "active-calories", label: "Active calories" }
    ],
    whoop: [
      { id: "recovery", label: "Recovery %" },
      { id: "sleep-hours", label: "Sleep hours" },
      { id: "sleep-performance", label: "Sleep performance %" },
      { id: "resting-heart-rate", label: "Resting heart rate" },
      { id: "hrv", label: "HRV (ms)" },
      { id: "strain", label: "Day strain" },
      { id: "calories", label: "Calories" }
    ],
    calculated: [
      { id: "total-calories", label: "Total calories from macros" },
      { id: "workout-minutes", label: "Workout minutes total" },
      { id: "net-spending", label: "Net spending total" }
    ]
  };

  const integrationDefinitions = [
    {
      id: "google-health",
      label: "Google Health (Fitbit)",
      description: "Live steps, sleep, resting heart rate, and active calories from your Fitbit via the Google Health API.",
      privacy: "Pointwell connects through Google with read-only access and only uses the data to calculate your reward-system progress. You can disconnect anytime, which deletes the stored connection."
    },
    {
      id: "whoop",
      label: "Whoop",
      description: "Live recovery, sleep, resting heart rate, HRV, day strain, and calories from your WHOOP account.",
      privacy: "Pointwell connects to WHOOP with read-only access and only uses the data to calculate your reward-system progress. You can disconnect anytime, which deletes the stored connection."
    },
    {
      // Placeholder only — not connectable yet, and intentionally NOT a synced data source or in
      // defaultMockSyncData, so the Coach never sees fake finance values.
      id: "plaid",
      label: "Plaid",
      comingSoon: true,
      description: "Transactions, spending categories, recurring charges, and balances — a future finance connection."
    }
  ];

  // Only the LIVE wearables remain (google-health/Fitbit + whoop). These zeros are the
  // pre-sync fallback — real values arrive from the wearables connector and overwrite them.
  // (calculated totals are derived from other tracked values, not a synced device.)
  const defaultMockSyncData = {
    "google-health": {
      steps: 0,
      "sleep-hours": 0,
      "resting-heart-rate": 0,
      "active-calories": 0
    },
    whoop: {
      recovery: 0,
      "sleep-hours": 0,
      "sleep-performance": 0,
      "resting-heart-rate": 0,
      hrv: 0,
      strain: 0,
      calories: 0
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
      // Short profile description (≤280, mirrored to profiles.bio).
      bio: "",
      accent: "#355d91",
      // Uploaded profile picture (public URL from the "avatars" bucket). "" = use the
      // initials avatar. Mirrored to the server (profiles.avatar_url).
      avatarUrl: "",
      // Uploaded profile cover/banner (public URL, also the "avatars" bucket). "" = the
      // default gradient. Mirrored to the server (profiles.cover_url).
      coverUrl: "",
      // Opt-in for the "motivation when behind" signal. Default OFF; mirrored to
      // the server (profiles.allow_motivation_when_behind), which is what RLS reads.
      allowMotivation: false,
      // Auto-count connected-device (Fitbit/Whoop) totals into PERSONAL rules on login/sync.
      // Default ON (personal); a user can turn it off here. Community auto-sync is gated separately
      // by each community's allow_device_autosync owner setting.
      allowAutoSync: true
    },
    // Authenticated account (Supabase). null = local mode / not signed in.
    // The local current-user id stays "me"; account.userId is its real identity.
    account: null,
    activeView: "dashboard",
    selectedSystemId: "life-core",
    trackerSystemId: "life-core",
    selectedCommunityId: "",
    selectedCommunityMemberId: "",
    feedTab: "friends",
    communityLeaderboardPeriod: "",
    communityHubTab: "feed",
    communityFeedSort: "new",
    communityTrendMemberId: "",
    dashboardAnalyticsOpen: false,
    inactiveCommunitiesOpen: false,
    scheduleExpanded: false,
    scoreContext: "personal",
    buildMode: "home",
    buildSearchQuery: "",
    communitySearchQuery: "",
    integrations: {
      "google-health": { status: "not-connected", lastSynced: "" },
      whoop: { status: "not-connected", lastSynced: "" }
    },
    mockSyncData: structuredClone(defaultMockSyncData),
    buildViewedPublicId: "",
    buildViewedProfileId: "",
    profileUserId: "",            // the OTHER user whose profile page is open
    profilePostsView: "grid",     // profile "Recent posts" layout: "grid" | "list"
    profileCommunityContextId: "",   // community the profile was opened from (→ "Today in" section)
    profileRuleBreakdownOpen: false, // "See rule breakdown" toggle in the "Today in" section
    aiDraftSystem: null,
    aiDraftInputs: null,
    aiDraftAdjustments: null,
    aiDraftRawSystem: null,   // last AI-shape system (refine source of truth)
    aiDraftChat: [],          // improve-this-system conversation: [{ role, text }]
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
    knownWorkoutIds: [],   // wearable workout/exercise session ids we've already seen
    pendingWorkout: null,  // a newly-detected workout awaiting the "log it?" prompt
    wearableLastSeen: {},  // { provider: { metric: { value, dateKey } } } — for sync deltas
    syncProgress: {},      // { dateKey: { ruleId: { logged, baseline } } } — incremental sync
    catchUp: null,         // the pending "Catch up your day" card
    coachProfile: null,    // code-computed behavioral profile (streaks/usual-times/trends/motivation)
    coachLearning: { proactiveOff: false, weekKey: "", byType: {}, byHour: {}, byRule: {}, shownDay: "", shownCount: 0 }, // nudge feedback loop (by type + per rule)
    coachLastPeekSig: "",  // last proactively-peeked nudge signature (no re-nag across reloads)
    coachSoftPromptDay: "", // YYYY-MM-DD the soft "want to log anything?" invite last showed (once/day)
    lastRecapDay: "",       // YYYY-MM-DD the "Yesterday, recapped" daily AI card last showed (once/day)
    streakMilestones: {},   // { "<type>:<id>": highestMilestoneCelebrated } — celebrate each badge once
    streakRiskDay: "",      // YYYY-MM-DD the streak-at-risk nudge last showed (once/day, later in the day)
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
  let aiPrefilledComposer = false; // AI Quick Log mapped one entry → composer is pre-filled
  let composerSourceTag = ""; // when set (a wearable provider id), the next posted entry
                              // carries a "via Fitbit" badge (synced-entry → post upgrade)
  // Optional message + photo for the next Add Entry. Both optional; reset after save.
  let addEntryAttachment = { message: "", file: null, previewUrl: "" };
  const ENTRY_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // ~5 MB cap (protects free-tier storage)
  // Pending profile-picture change on the Profile page: a chosen-but-unsaved file +
  // local preview, or a flag to clear the saved picture. Applied on "Save profile".
  let profileAvatarDraft = { file: null, previewUrl: "", remove: false };
  // Direct cover/avatar upload from the profile page (own profile): tap banner / 📷 badge →
  // library picker → uploadAvatar → save cover_url/avatar_url. Separate from the Settings draft.
  let profileImgUploadTarget = ""; // "cover" | "avatar"
  let profileImgUploading = false;
  // Guards the async profile save so a double-click can't upload the avatar twice.
  let profileSaving = false;
  const ENTRY_MESSAGE_MAX = 280;
  let topCardDraftBlocks = null;
  let weeklyChartDraftBlocks = null;
  let communityDraft = null;
  let communityDraftStep = 0;
  let communityDraftMethod = "";
  let editingCommunityDraftRuleId = "";
  let communityDraftRuleFormOpen = false;   // is the rule-builder form expanded?
  let communityDraftJustAddedId = "";        // id of the rule just added (flash + banner)
  let authConfigured = false;
  const els = {};
  let toastTimer = null;
  let dayRolloverTimer = null;
  // Positive signals (kudos / motivation) — in-app notifications state.
  let inboxSignals = [];
  let notifPanelOpen = false; // header bell dropdown open state
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
  let communityListFilter = "";    // Communities header search: live filter of joined communities
  let ownerJoinRequests = [];      // pending join requests for communities I own
  let pendingJoinCode = "";
  // Friends system (friends.sql). `friends` = userIds of my accepted friends;
  // `incomingFriendRequests` = pending requests addressed to me (Accept/Decline + badge).
  let friends = new Set();
  let incomingFriendRequests = [];
  // Bell notifications (notifications.sql get_notifications): activity ABOUT me —
  // likes/comments on my posts, friend requests + accepts, cheers/kudos. NEVER direct
  // messages (those are excluded server-side and live only in Chats).
  let bellNotifications = [];
  let unsubscribeNotifications = null;
  let lastBellBadge = null;        // previous bell count, to detect an increase → ring the bell
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
  // Friends activity (friends-activity.sql): the Friends view + a friend's today view.
  let friendsDetailed = [];        // accepted friends WITH names: [{ user_id, display_name, handle, since }]
  let friendsActiveTodayIds = new Set(); // friends with visible activity today (the dot)
  let viewedFriend = null;         // { id, name } whose activity view is open
  let friendActivityRows = [];     // [{ community_id, community_name, rule_id, amount, entry_date }]
  let friendActivityLoading = false;
  let aiGenerating = false;         // guards the async "Generate with AI" calls
  let pendingBuildMode = "";        // a start card was picked; awaiting the personal/community choice
  let buildCommunityResults = [];   // public communities matching the build search
  let aiRefining = false;           // guards the async "Improve this system" chat calls
  let aiImproveOpen = false;        // keep the improve/chat panel open across re-renders
  let aiChatFocusWanted = false;    // restore chat-input focus after a send (input is disabled mid-refine)
  // First-run onboarding overlay state — the guided, AI-personalized 4-screen flow.
  let onboardingActive = false;
  let onboardingStep = 1;               // 1 explain · 2 create-profile · 3 interests · 4 AI picks
  let onboardingShownThisSession = false;
  // Create-profile screen (step 2) state.
  let onboardingProfileName = "";       // display name (prefilled from account/profile)
  let onboardingProfileHandle = "";     // raw @handle input value (without leading @)
  let onboardingProfilePrivacy = "public"; // profile visibility: "public" | "private"
  let onboardingAvatarDraft = { file: null, previewUrl: "" }; // picked-but-not-saved photo
  let onboardingHandleStatus = "";      // "" | checking | available | taken | short
  let onboardingHandleCheckSeq = 0;     // debounce/stale-drop guard for availability
  let onboardingHandleCheckTimer = null;
  let onboardingProfileSaving = false;  // guards the async Continue (avatar upload + save)
  let onboardingInterests = [];         // chosen interests [{ key, label, custom }]
  let onboardingLevel = "start";        // start | building | hard → AI strictness
  let onboardingStay = [];              // ["solo","friends","community"]
  let onboardingDetail = "";            // optional free-text "Anything specific?"
  let onboardingDraft = null;           // generated AI system (app-shape draft)
  let onboardingGenerating = false;     // AI generation in flight
  let onboardingMatchesLoading = false; // community search in flight
  let onboardingRunSeq = 0;             // stale-drop guard for the async picks run (draft + community fetch)
  let onboardingPublicMatches = [];     // public systems matching the interests
  let onboardingCommunityMatches = [];  // public communities matching the interests
  let onboardingCopiedIds = [];         // public-system ids copied this run
  let onboardingJoinedIds = [];         // community ids joined this run
  let onboardingAddedSystemId = "";     // the AI system id once Added

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    resetSavedBuildSubpage();
    state.profileListMode = null; // transient view state — never restore a stale followers/following list
    captureJoinCodeFromUrl();
    cacheElements();
    bindEvents();
    render();
    startDateRolloverWatcher();
    startHeaderHeightWatcher();
    initAuthGate();
  }

  // Mobile fixed-header clearance. Below 1050px the shared header (.sidebar) is
  // position:fixed and wraps from one row to two at narrow phone widths, so its
  // height varies (~44px → ~98px) and gains the iOS notch inset on top. CSS can't
  // read a fixed sibling's height, so we measure it and expose --mobile-header-h;
  // the workspace top padding and the notification panel offset both read it so
  // the green "+ Add entry" bar and the bell dropdown always clear the header.
  function syncHeaderHeight() {
    const header = document.querySelector(".sidebar");
    if (!header) return;
    const root = document.documentElement;
    if (window.matchMedia("(max-width: 1050px)").matches) {
      root.style.setProperty("--mobile-header-h", header.offsetHeight + "px");
    } else {
      root.style.removeProperty("--mobile-header-h"); // desktop uses the base layout
    }
  }

  let headerHeightRaf = 0;
  function startHeaderHeightWatcher() {
    const schedule = () => {
      if (headerHeightRaf) cancelAnimationFrame(headerHeightRaf);
      headerHeightRaf = requestAnimationFrame(() => { headerHeightRaf = 0; syncHeaderHeight(); });
    };
    syncHeaderHeight();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("load", syncHeaderHeight);
    // Web-font swap can change the wrapped header's height after first paint.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncHeaderHeight).catch(() => {});
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
      initWearables();
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
      // Local mode has its communities/systems in state already → recap can run (uses the client composer).
      Promise.resolve(maybeShowDailyRecap()).catch(() => {});
      try { maybeShowStreakAtRisk(); } catch (e) { /* nudge is best-effort */ }
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
  // server-side; existing accounts were backfilled true). Three calm screens, every
  // choice a tap, a visible "Skip for now" everywhere. Screen 3 turns the answers
  // into a real AI-personalized reward system (generate-rules) plus public systems
  // to copy and communities to join — nothing auto-saves except marking onboarding
  // complete; the user still taps Add / Copy / Join.
  const ONBOARDING_INTEREST_GROUPS = [
    { label: "Popular", items: [
      { key: "fitness", label: "Fitness" },
      { key: "running", label: "Running" },
      { key: "study", label: "Study" },
      { key: "sleep", label: "Sleep" },
      { key: "nutrition", label: "Nutrition" },
      { key: "habits", label: "Habits" },
      { key: "money", label: "Money" },
      { key: "mindfulness", label: "Mindfulness" }
    ] },
    { label: "Skills & niche", niche: true, items: [
      { key: "chess", label: "Chess" },
      { key: "language", label: "Language" },
      { key: "instrument", label: "Instrument" },
      { key: "coding", label: "Coding" },
      { key: "reading", label: "Reading" },
      { key: "speaking", label: "Public speaking" },
      { key: "art", label: "Art" },
      { key: "gaming", label: "Gaming skill" }
    ] }
  ];
  const ONBOARDING_LEVELS = [
    { key: "start", label: "Just starting", strictness: "lenient" },
    { key: "building", label: "Building a routine", strictness: "balanced" },
    { key: "hard", label: "Going hard", strictness: "strict" }
  ];
  const ONBOARDING_STAY = [
    { key: "solo", label: "Solo" },
    { key: "friends", label: "With friends" },
    { key: "community", label: "In a community" }
  ];
  // The picks step never shows an empty "copy"/"join" section: interest matches come
  // first, then we top up with popular public picks until each section has at least
  // ONBOARD_MIN_PICKS (capped at ONBOARD_PICKS_CAP). Only a section with genuinely
  // zero public items in the whole app falls through to the empty message.
  const ONBOARD_MIN_PICKS = 2;
  const ONBOARD_PICKS_CAP = 3;

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
    resetOnboardingAnswers();
    els.onboardingScreen.hidden = false;
    document.body.classList.add("onboarding-locked");
    renderOnboarding();
  }

  function renderOnboarding() {
    if (!els.onboardingBody) return;
    els.onboardingBody.innerHTML = onboardingScreenMarkup();
  }

  function resetOnboardingAnswers() {
    onboardingInterests = [];
    onboardingLevel = "start";
    onboardingStay = [];
    onboardingDetail = "";
    onboardingDraft = null;
    onboardingGenerating = false;
    onboardingMatchesLoading = false;
    onboardingPublicMatches = [];
    onboardingCommunityMatches = [];
    onboardingCopiedIds = [];
    onboardingJoinedIds = [];
    onboardingAddedSystemId = "";
    onboardingProfileName = "";
    onboardingProfileHandle = "";
    onboardingProfilePrivacy = "public";
    if (onboardingAvatarDraft && onboardingAvatarDraft.previewUrl) {
      try { URL.revokeObjectURL(onboardingAvatarDraft.previewUrl); } catch (err) {}
    }
    onboardingAvatarDraft = { file: null, previewUrl: "" };
    onboardingHandleStatus = "";
    onboardingProfileSaving = false;
    onboardingHandleCheckSeq++;
    clearTimeout(onboardingHandleCheckTimer);
  }

  function onboardingLevelStrictness() {
    const level = ONBOARDING_LEVELS.find((item) => item.key === onboardingLevel);
    return level ? level.strictness : "balanced";
  }

  // Map the screen-2 answers (interests incl. niche/custom, level, free-text) onto
  // the generate-rules input contract. The interest words go into BOTH goals and
  // categories so the offline fallback's keyword detector can fire on them too.
  function buildOnboardingAiInputs() {
    const interestsJoined = onboardingInterests.map((item) => item.label).join(", ");
    const detail = String(onboardingDetail || "").trim();
    const goals = [detail, interestsJoined].filter(Boolean).join(" — ");
    return {
      goals: goals,
      rewards: "",
      penalties: "",
      categories: interestsJoined,
      strictness: onboardingLevelStrictness(),
      targets: detail,
      adjust: "",
      kind: "personal"
    };
  }

  function onboardingScreenMarkup() {
    const skip = `<button class="ghost-button small onboard-skip" type="button" data-onboard="skip">Skip for now</button>`;
    if (onboardingStep === 2) return onboardingProfileMarkup(skip);
    if (onboardingStep === 3) return onboardingInterestsMarkup(skip);
    if (onboardingStep === 4) return onboardingPicksMarkup(skip);
    return onboardingExplainMarkup(skip);
  }

  // Screen 1 — welcome hero. Rows fade/slide up in sequence on open (staggered ~80ms via
  // per-row animation-delay); the logo floats and the CTA glows. All motion is disabled under
  // prefers-reduced-motion (see styles.css). Behavior unchanged: Get started → profile, Skip.
  function onboardingExplainMarkup() {
    return `
      <div class="onboard-screen onboard-welcome onboard-scroll">
        <div class="pwrow onboard-brand" style="animation-delay:.04s">
          <div class="onboard-logo" aria-hidden="true">P</div>
          <p class="eyebrow">Welcome to Pointwell</p>
        </div>
        <h2 class="pwrow" style="animation-delay:.12s">Chase your goals — <span class="onboard-accent">together.</span></h2>
        <p class="pwrow onboard-sub" style="animation-delay:.2s">Build a system, check in daily, and let your community keep you showing up.</p>
        <div class="pwrow onboard-step" style="animation-delay:.28s"><span class="onboard-step-num" aria-hidden="true">1</span><span>Build a reward system for your goals</span></div>
        <div class="pwrow onboard-step" style="animation-delay:.36s"><span class="onboard-step-num" aria-hidden="true">2</span><span>Log your check-in each day</span></div>
        <div class="pwrow onboard-feat" style="animation-delay:.44s">
          <div class="onboard-feat-head">
            <span class="onboard-feat-avatars" aria-hidden="true"><span class="onboard-av onboard-av-a"></span><span class="onboard-av onboard-av-b"></span><span class="onboard-av onboard-av-c"></span></span>
            <span class="onboard-feat-tag">Your crew shows up with you</span>
          </div>
          <p class="onboard-feat-line"><strong>Stay accountable</strong> — everyone sees who logged today.</p>
          <p class="onboard-feat-line"><strong>Get hyped</strong> — cheer, compete, climb the leaderboard. 🔥</p>
        </div>
        <button class="primary-button onboard-cta-glow" type="button" data-onboard="to-profile">Get started</button>
        <button class="ghost-button small onboard-skip pwrow" type="button" data-onboard="skip" style="animation-delay:.58s">Skip for now</button>
      </div>`;
  }

  // Screen 2 — create profile: avatar (reuses uploadAvatar/avatar_url), display name,
  // @handle with a live availability check, and a Public/Private visibility picker.
  // Persisted to the profiles row via updateProfile on Continue. Skip keeps defaults.
  function initOnboardingProfile() {
    onboardingProfileName = onboardingPrefillName();
    onboardingProfileHandle = String(state.profile.handle || "").replace(/^@+/, "");
    onboardingProfilePrivacy = state.profile.privacy === "private" ? "private" : "public";
    if (onboardingAvatarDraft && onboardingAvatarDraft.previewUrl) {
      try { URL.revokeObjectURL(onboardingAvatarDraft.previewUrl); } catch (err) {}
    }
    onboardingAvatarDraft = { file: null, previewUrl: "" };
    onboardingHandleStatus = "";
    onboardingHandleCheckSeq++;
    clearTimeout(onboardingHandleCheckTimer);
  }

  // Prefer a real display name; fall back to the email local-part for a fresh account.
  function onboardingPrefillName() {
    const name = String(state.profile.name || "").trim();
    if (name && name !== "Avery Rivera") return name;
    const email = state.account && state.account.email ? String(state.account.email) : "";
    const local = email.split("@")[0] || "";
    return local || name || "";
  }

  function onboardingHandleStatusText() {
    if (onboardingHandleStatus === "checking") return "Checking…";
    if (onboardingHandleStatus === "available") return "✓ available";
    if (onboardingHandleStatus === "taken") return "Taken — try another";
    if (onboardingHandleStatus === "short") return "At least 2 characters";
    return "";
  }

  function onboardingHandleStatusClass() {
    if (onboardingHandleStatus === "available") return "is-available";
    if (onboardingHandleStatus === "taken") return "is-taken";
    if (onboardingHandleStatus === "checking" || onboardingHandleStatus === "short") return "is-muted";
    return "";
  }

  function onboardingProfileMarkup(skip) {
    const name = onboardingProfileName;
    const avatarUrl = onboardingAvatarDraft.previewUrl || state.profile.avatarUrl || "";
    const avatarInner = avatarUrl
      ? `<img class="avatar-img" src="${escapeHtml(avatarUrl)}" alt="" aria-hidden="true">`
      : escapeHtml(getInitials(name));
    return `
      <div class="onboard-screen onboard-create-profile onboard-scroll">
        <p class="eyebrow">Your profile</p>
        <h2>How others will see you.</h2>
        <div class="onboard-avatar-row">
          <div class="profile-avatar-attach onboard-avatar-attach">
            <div class="large-avatar onboard-avatar-square" id="onboardAvatarPreview" aria-hidden="true">${avatarInner}</div>
            <button class="profile-avatar-edit" type="button" data-onboard="avatar-pick" aria-label="Add a photo"><span aria-hidden="true">📷</span></button>
            <input type="file" accept="image/*" data-onboard-field="avatar" hidden>
          </div>
          <div class="onboard-avatar-text">
            <strong>Add a photo</strong>
            <span class="onboard-sub">Optional — we'll use your initials if you skip it.</span>
            ${onboardingAvatarDraft.previewUrl ? `<button class="ghost-button small" type="button" data-onboard="avatar-remove">Remove photo</button>` : ""}
          </div>
        </div>
        <div class="profile-form onboard-profile-form">
          <label>
            <span>Display name</span>
            <input type="text" data-onboard-field="name" value="${escapeHtml(name)}" placeholder="Your name" autocomplete="name" maxlength="60">
          </label>
          <label>
            <span>Handle</span>
            <div class="onboard-handle-field">
              <span class="onboard-handle-at" aria-hidden="true">@</span>
              <input type="text" data-onboard-field="handle" value="${escapeHtml(onboardingProfileHandle)}" placeholder="yourhandle" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30">
            </div>
            <span class="onboard-handle-status ${onboardingHandleStatusClass()}" id="onboardHandleStatus">${escapeHtml(onboardingHandleStatusText())}</span>
          </label>
        </div>
        <div class="onboard-chip-group">
          <p class="onboard-group-label">Profile visibility</p>
          <div class="onboard-cards onboard-vis-cards">
            <button class="onboard-card${onboardingProfilePrivacy === "public" ? " onboard-card-primary" : ""}" type="button" data-onboard="visibility" data-visibility="public" aria-pressed="${onboardingProfilePrivacy === "public" ? "true" : "false"}">
              <span class="onboard-card-icon" aria-hidden="true">◍</span>
              <strong>Public</strong>
              <span>Anyone can find you and follow your activity.</span>
            </button>
            <button class="onboard-card${onboardingProfilePrivacy === "private" ? " onboard-card-primary" : ""}" type="button" data-onboard="visibility" data-visibility="private" aria-pressed="${onboardingProfilePrivacy === "private" ? "true" : "false"}">
              <span class="onboard-card-icon" aria-hidden="true">◐</span>
              <strong>Private</strong>
              <span>Only approved followers see your activity.</span>
            </button>
          </div>
        </div>
        <div class="onboard-actions">
          <button class="primary-button" type="button" data-onboard="profile-continue">Continue</button>
          ${skip}
        </div>
      </div>`;
  }

  // Persist the typed name/handle into module state before any re-render wipes them.
  function syncOnboardingProfileFields() {
    if (!els.onboardingBody) return;
    const nameEl = els.onboardingBody.querySelector('[data-onboard-field="name"]');
    const handleEl = els.onboardingBody.querySelector('[data-onboard-field="handle"]');
    if (nameEl) onboardingProfileName = nameEl.value;
    if (handleEl) onboardingProfileHandle = handleEl.value;
  }

  function updateOnboardingHandleBadge() {
    if (!els.onboardingBody) return;
    const badge = els.onboardingBody.querySelector("#onboardHandleStatus");
    if (!badge) return;
    badge.textContent = onboardingHandleStatusText();
    badge.className = "onboard-handle-status " + onboardingHandleStatusClass();
  }

  // Live @handle availability — debounced searchProfiles (fuzzy), filtered to an exact
  // match excluding self. Updates the badge in place so the input keeps focus.
  function checkOnboardingHandle() {
    const normalized = cleanHandle(onboardingProfileHandle || "");
    const slug = normalized.slice(1);
    clearTimeout(onboardingHandleCheckTimer);
    const seq = ++onboardingHandleCheckSeq;
    if (slug.length < 2) { onboardingHandleStatus = "short"; updateOnboardingHandleBadge(); return; }
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.searchProfiles !== "function") {
      onboardingHandleStatus = ""; updateOnboardingHandleBadge(); return;
    }
    onboardingHandleStatus = "checking";
    updateOnboardingHandleBadge();
    onboardingHandleCheckTimer = setTimeout(() => {
      Promise.resolve(window.PointwellSignals.searchProfiles(slug)).then((rows) => {
        if (seq !== onboardingHandleCheckSeq) return;
        onboardingHandleStatus = onboardingHandleRowsTaken(rows, normalized) ? "taken" : "available";
        updateOnboardingHandleBadge();
      }).catch(() => {
        if (seq !== onboardingHandleCheckSeq) return;
        onboardingHandleStatus = ""; updateOnboardingHandleBadge();
      });
    }, 250);
  }

  // A handle is taken if another profile (not me) has the exact normalized handle.
  function onboardingHandleRowsTaken(rows, normalized) {
    const myId = state.account && state.account.userId;
    return (Array.isArray(rows) ? rows : []).some((row) =>
      cleanHandle(row.handle || "") === normalized && String(row.id) !== String(myId));
  }

  // Authoritative check on Continue (the live badge may still be mid-debounce).
  async function onboardingHandleIsTaken(normalized) {
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.searchProfiles !== "function") return false;
    const slug = normalized.slice(1);
    if (slug.length < 2) return false;
    const rows = await Promise.resolve(window.PointwellSignals.searchProfiles(slug)).catch(() => []);
    return onboardingHandleRowsTaken(rows, normalized);
  }

  function chooseOnboardingAvatar(file) {
    if (!/^image\//i.test(file.type || "")) { showToast("That's not an image — choose a photo"); return; }
    if (file.size > ENTRY_PHOTO_MAX_BYTES) { showToast("Photo is too big (max 5 MB) — pick a smaller one"); return; }
    if (onboardingAvatarDraft.previewUrl) { try { URL.revokeObjectURL(onboardingAvatarDraft.previewUrl); } catch (err) {} }
    onboardingAvatarDraft = { file: file, previewUrl: URL.createObjectURL(file) };
    syncOnboardingProfileFields();
    renderOnboarding();
  }

  function clearOnboardingAvatar() {
    if (onboardingAvatarDraft.previewUrl) { try { URL.revokeObjectURL(onboardingAvatarDraft.previewUrl); } catch (err) {} }
    onboardingAvatarDraft = { file: null, previewUrl: "" };
    syncOnboardingProfileFields();
    renderOnboarding();
  }

  // Continue → validate handle (block taken/invalid), save the profile via the existing
  // updateProfile path, then advance to the interests screen. Skip is handled by "skip".
  async function onboardingProfileContinue() {
    if (onboardingProfileSaving) return;
    syncOnboardingProfileFields();
    const normalized = cleanHandle(onboardingProfileHandle || "");
    if (normalized.length < 3) {
      onboardingHandleStatus = "short"; updateOnboardingHandleBadge();
      showToast("Pick a handle (at least 2 characters)");
      return;
    }
    onboardingProfileSaving = true;
    try {
      if (await onboardingHandleIsTaken(normalized)) {
        onboardingHandleStatus = "taken"; updateOnboardingHandleBadge();
        showToast("That handle's taken — try another");
        return;
      }
      await saveOnboardingProfile(normalized);
      onboardingStep = 3;
      renderOnboarding();
    } finally {
      onboardingProfileSaving = false;
    }
  }

  // Mirror saveProfile's write path: upload the avatar (if picked) to the avatars bucket,
  // then updateProfile(display_name, handle, visibility, avatar_url?). Avatar/save are
  // best-effort — onboarding proceeds even if the network write fails.
  async function saveOnboardingProfile(normalizedHandle) {
    const name = String(onboardingProfileName || "").trim() || onboardingPrefillName() || "Member";
    const privacy = onboardingProfilePrivacy === "private" ? "private" : "public";
    state.profile.name = name;
    state.profile.handle = normalizedHandle;
    state.profile.privacy = privacy;
    const profilePatch = { display_name: name, handle: normalizedHandle, visibility: privacy };
    const uid = state.account && state.account.userId;
    if (onboardingAvatarDraft.file && signalsReady() && uid && window.PointwellSignals && typeof window.PointwellSignals.uploadAvatar === "function") {
      const up = await Promise.resolve(window.PointwellSignals.uploadAvatar(onboardingAvatarDraft.file, uid)).catch(() => ({ error: { message: "upload failed" } }));
      if (up && !up.error && up.url) {
        state.profile.avatarUrl = up.url;
        profilePatch.avatar_url = up.url;
      } else {
        showToast("Couldn't upload the photo — saved without it");
      }
    }
    if (signalsReady() && uid && window.PointwellSignals && typeof window.PointwellSignals.updateProfile === "function") {
      Promise.resolve(window.PointwellSignals.updateProfile(uid, profilePatch)).catch(() => {});
    }
    // Keep system ownership labels in sync with the new display name (saveProfile parity).
    state.systems.forEach((system) => { if (system.ownerId === "me") system.ownerName = name; });
    saveState();
    syncMyPublicSystems(); // a public profile chosen here publishes any public systems
  }

  function onboardingInterestChipMarkup(item, niche) {
    const selected = onboardingInterests.some((entry) => entry.key === item.key);
    const nicheClass = niche ? " onboard-chip-niche" : "";
    return `<button class="signal-preset-chip onboard-chip${nicheClass}${selected ? " is-selected" : ""}" type="button" data-onboard="interest" data-interest="${escapeHtml(item.key)}" data-label="${escapeHtml(item.label)}" aria-pressed="${selected ? "true" : "false"}">${escapeHtml(item.label)}</button>`;
  }

  function onboardingCustomChipMarkup(item) {
    return `<button class="signal-preset-chip onboard-chip is-selected onboard-chip-custom" type="button" data-onboard="interest-remove" data-interest="${escapeHtml(item.key)}" aria-pressed="true" aria-label="Remove ${escapeHtml(item.label)}">${escapeHtml(item.label)}<span class="onboard-chip-x" aria-hidden="true">×</span></button>`;
  }

  // Screen 2 — get to know you: interests (incl. add-your-own), level, stay-on-track,
  // and an optional free-text note. Every choice is a tap; nothing is required.
  function onboardingInterestsMarkup(skip) {
    const customItems = onboardingInterests.filter((item) => item.custom);
    return `
      <div class="onboard-screen onboard-interests onboard-scroll">
        <p class="eyebrow">A few quick taps</p>
        <h2>What do you want to work on?</h2>
        <p class="onboard-sub">Pick anything that fits — you can change this later.</p>
        ${ONBOARDING_INTEREST_GROUPS.map((group) => `
          <div class="onboard-chip-group">
            <p class="onboard-group-label">${escapeHtml(group.label)}</p>
            <div class="signal-presets">${group.items.map((item) => onboardingInterestChipMarkup(item, group.niche)).join("")}</div>
          </div>`).join("")}
        <div class="onboard-chip-group">
          <p class="onboard-group-label">Add your own</p>
          ${customItems.length ? `<div class="signal-presets">${customItems.map(onboardingCustomChipMarkup).join("")}</div>` : ""}
          <div class="onboard-add-row">
            <input type="text" id="onboardInterestInput" class="onboard-add-input" placeholder="e.g. Bouldering" autocomplete="off" data-onboard-field="custom">
            <button class="secondary-button small" type="button" data-onboard="interest-add">Add</button>
          </div>
        </div>
        <div class="onboard-chip-group">
          <p class="onboard-group-label">Where are you at?</p>
          <div class="segmented" role="group" aria-label="Your current level">
            ${ONBOARDING_LEVELS.map((level) => `
              <button class="segmented-button${onboardingLevel === level.key ? " active" : ""}" type="button" data-onboard="level" data-level="${escapeHtml(level.key)}" aria-pressed="${onboardingLevel === level.key ? "true" : "false"}">${escapeHtml(level.label)}</button>`).join("")}
          </div>
        </div>
        <div class="onboard-chip-group">
          <p class="onboard-group-label">How do you like to stay on track?</p>
          <div class="signal-presets">
            ${ONBOARDING_STAY.map((item) => {
              const selected = onboardingStay.includes(item.key);
              return `<button class="signal-preset-chip onboard-chip${selected ? " is-selected" : ""}" type="button" data-onboard="stay" data-stay="${escapeHtml(item.key)}" aria-pressed="${selected ? "true" : "false"}">${escapeHtml(item.label)}</button>`;
            }).join("")}
          </div>
        </div>
        <label class="onboard-field">
          <span class="onboard-group-label">Anything specific? (optional)</span>
          <textarea id="onboardDetailInput" rows="2" placeholder="e.g. training for a half marathon" data-onboard-field="detail">${escapeHtml(onboardingDetail)}</textarea>
        </label>
        <div class="onboard-actions">
          <button class="primary-button" type="button" data-onboard="build-suggestions">Next</button>
          ${skip}
        </div>
      </div>`;
  }

  // Screen 3 — AI picks for you: a tailored personal system, public systems to copy,
  // and communities to join. Empty sections stay calm instead of blank.
  function onboardingPicksMarkup(skip) {
    return `
      <div class="onboard-screen onboard-system onboard-scroll">
        <p class="eyebrow">Made for you</p>
        <h2>AI picks for you</h2>
        <section class="onboard-section">
          <p class="onboard-group-label">Your personal system</p>
          ${onboardingAiSystemSection()}
        </section>
        <section class="onboard-section">
          <p class="onboard-group-label">Communities to join</p>
          ${onboardingMatchesLoading
            ? `<p class="onboard-sub">Looking for communities…</p>`
            : onboardingCommunityMatches.length
              ? `<div class="onboard-result-list">${onboardingCommunityMatches.map(onboardingCommunityRow).join("")}</div>`
              : `<p class="empty-state onboard-empty">Nothing here yet — you're early.</p>`}
        </section>
        <section class="onboard-section">
          <p class="onboard-group-label">Public systems you can copy</p>
          ${onboardingPublicMatches.length
            ? `<div class="onboard-result-list">${onboardingPublicMatches.map(onboardingPublicSystemRow).join("")}</div>`
            : `<p class="empty-state onboard-empty">Nothing here yet — you're early.</p>`}
        </section>
        <div class="onboard-actions">
          <button class="primary-button" type="button" data-onboard="done">Done — go to my day</button>
          ${skip}
        </div>
      </div>`;
  }

  function onboardingAiSystemSection() {
    if (onboardingGenerating) {
      return `
        <div class="onboard-system-card onboard-system-loading">
          <div class="onboard-spinner" aria-hidden="true"></div>
          <p class="onboard-sub">Building a system from your answers…</p>
        </div>`;
    }
    if (!onboardingDraft) {
      return `<p class="empty-state onboard-empty">We couldn't build one just now — you can create a system anytime from Build.</p>`;
    }
    const draft = onboardingDraft;
    const added = onboardingAddedSystemId && state.systems.some((item) => item.id === onboardingAddedSystemId);
    const ruleChips = (draft.rules || []).slice(0, 6).map((rule) => {
      const pts = numberOrDefault(draftPrimaryPoints(rule), 0);
      const ptsLabel = (pts < 0 ? "−" : "+") + formatPoints(Math.abs(pts));
      return `<span class="onboard-rule-chip">${draftRuleIcon(rule)} ${escapeHtml(rule.label || "Rule")} <span class="onboard-rule-chip-pts">${escapeHtml(ptsLabel)}</span></span>`;
    }).join("");
    return `
      <div class="onboard-feat onboard-system-feat">
        <div class="onboard-system-head">
          <strong>${escapeHtml(draft.title || "Your reward system")}</strong>
          <span class="onboard-system-spark" aria-hidden="true">✦</span>
        </div>
        <div class="onboard-rule-chips">${ruleChips}</div>
        ${added
          ? `<button class="secondary-button" type="button" disabled>Added ✓</button>`
          : `<button class="primary-button" type="button" data-onboard="add-system">Add this system</button>`}
      </div>`;
  }

  function onboardingPublicSystemRow(system) {
    const copied = onboardingCopiedIds.includes(system.id);
    return `
      <article class="build-result-card">
        <div class="build-result-main">
          <div class="onboard-result-head">
            <strong>${escapeHtml(system.title)}</strong>
            ${system._popular ? `<span class="onboard-tag onboard-popular-tag">Popular</span>` : ""}
          </div>
          <span>${escapeHtml(system.category || "General wellness")} &middot; ${plural((system.rules || []).length, "rule")}</span>
          <p>${escapeHtml(system.description || "Public reward system you can copy and customize.")}</p>
        </div>
        <div class="build-result-actions">
          ${copied
            ? `<button class="secondary-button small" type="button" disabled>Copied ✓</button>`
            : `<button class="secondary-button small" type="button" data-onboard="copy-system" data-system="${escapeHtml(system.id)}">Copy</button>`}
        </div>
      </article>`;
  }

  function onboardingCommunityRow(row) {
    const id = String(row.id);
    const joined = onboardingJoinedIds.includes(id) || isCommunityJoined(row.id);
    const count = Number(row.member_count) || 0;
    const name = row.name || "Community";
    // Deterministic green/purple avatar tint so the list has the demo's varied look.
    const purple = (name.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2) === 1;
    return `
      <article class="find-community-card onboard-community-card">
        <div class="onboard-result-av${purple ? " onboard-result-av-purple" : ""}" aria-hidden="true">${escapeHtml(getInitials(name))}</div>
        <div class="find-community-main">
          <div class="onboard-result-head">
            <strong>${escapeHtml(name)}</strong>
            ${row._popular ? `<span class="onboard-tag onboard-popular-tag">Popular</span>` : ""}
          </div>
          <span class="community-meta">${escapeHtml(row.category || "Community")} &middot; ${plural(count, "member")}</span>
          ${row.description ? `<p>${escapeHtml(row.description)}</p>` : ""}
        </div>
        ${joined
          ? `<button class="secondary-button small" type="button" disabled>Joined ✓</button>`
          : `<button class="primary-button small" type="button" data-onboard="join-community" data-community="${escapeHtml(id)}">Join</button>`}
      </article>`;
  }

  function handleOnboardingClick(event) {
    const target = event.target.closest && event.target.closest("[data-onboard]");
    if (!target) return;
    const action = target.dataset.onboard;
    if (action === "skip") { finishOnboarding(); return; }
    if (action === "to-profile") { initOnboardingProfile(); onboardingStep = 2; renderOnboarding(); return; }
    if (action === "visibility") { syncOnboardingProfileFields(); onboardingProfilePrivacy = target.dataset.visibility === "private" ? "private" : "public"; renderOnboarding(); return; }
    if (action === "avatar-pick") { const inp = els.onboardingBody && els.onboardingBody.querySelector('[data-onboard-field="avatar"]'); if (inp) inp.click(); return; }
    if (action === "avatar-remove") { clearOnboardingAvatar(); return; }
    if (action === "profile-continue") { onboardingProfileContinue(); return; }
    if (action === "interest") { toggleOnboardingInterest(target.dataset.interest, target.dataset.label); return; }
    if (action === "interest-remove") { removeOnboardingInterest(target.dataset.interest); return; }
    if (action === "interest-add") { addCustomOnboardingInterest(); return; }
    if (action === "level") { syncOnboardingFields(); onboardingLevel = target.dataset.level || "start"; renderOnboarding(); return; }
    if (action === "stay") { toggleOnboardingStay(target.dataset.stay); return; }
    if (action === "build-suggestions") { startOnboardingSuggestions(); return; }
    if (action === "add-system") { onboardingAddAiSystem(); return; }
    if (action === "copy-system") { onboardingCopyPublicSystem(target.dataset.system); return; }
    if (action === "join-community") { onboardingJoinCommunity(target.dataset.community); return; }
    if (action === "done") { state.activeView = "dashboard"; finishOnboarding(); return; }
  }

  // Pressing Enter in the "add your own" field adds it as a removable interest chip.
  function handleOnboardingKeydown(event) {
    const field = event.target.closest && event.target.closest('[data-onboard-field="custom"]');
    if (!field || event.key !== "Enter") return;
    event.preventDefault();
    addCustomOnboardingInterest();
  }

  // Live handle-availability check + name sync as the user types the profile fields.
  function handleOnboardingInput(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-onboard-field="handle"]')) {
      onboardingProfileHandle = target.value;
      checkOnboardingHandle();
      return;
    }
    if (target.closest('[data-onboard-field="name"]')) {
      onboardingProfileName = target.value;
    }
  }

  // The avatar file picker (a hidden <input type=file> inside the overlay).
  function handleOnboardingChange(event) {
    const input = event.target.closest && event.target.closest('[data-onboard-field="avatar"]');
    if (!input) return;
    const file = input.files && input.files[0];
    input.value = "";
    if (file) chooseOnboardingAvatar(file);
  }

  // Persist the free-text answer before any re-render (innerHTML replace) wipes it.
  function syncOnboardingFields() {
    if (!els.onboardingBody) return;
    const detail = els.onboardingBody.querySelector('[data-onboard-field="detail"]');
    if (detail) onboardingDetail = detail.value;
  }

  function toggleOnboardingInterest(key, label) {
    if (!key) return;
    syncOnboardingFields();
    const index = onboardingInterests.findIndex((item) => item.key === key);
    if (index >= 0) onboardingInterests.splice(index, 1);
    else onboardingInterests.push({ key: key, label: label || key, custom: false });
    renderOnboarding();
  }

  function removeOnboardingInterest(key) {
    syncOnboardingFields();
    onboardingInterests = onboardingInterests.filter((item) => item.key !== key);
    renderOnboarding();
  }

  function addCustomOnboardingInterest() {
    syncOnboardingFields();
    const field = els.onboardingBody && els.onboardingBody.querySelector('[data-onboard-field="custom"]');
    const label = field ? String(field.value || "").trim().slice(0, 40) : "";
    if (!label) { if (field) field.focus(); return; }
    const key = "custom:" + label.toLowerCase();
    if (!onboardingInterests.some((item) => item.key === key)) {
      onboardingInterests.push({ key: key, label: label, custom: true });
    }
    renderOnboarding();
    const next = els.onboardingBody && els.onboardingBody.querySelector('[data-onboard-field="custom"]');
    if (next) next.focus();
  }

  function toggleOnboardingStay(key) {
    if (!key) return;
    syncOnboardingFields();
    if (onboardingStay.includes(key)) onboardingStay = onboardingStay.filter((item) => item !== key);
    else onboardingStay = onboardingStay.concat(key);
    renderOnboarding();
  }

  // Move to screen 3 and kick off generation + matching. Public systems match
  // synchronously; the AI system and communities resolve asynchronously and patch
  // the screen in as they land.
  function startOnboardingSuggestions() {
    syncOnboardingFields();
    onboardingStep = 4;
    onboardingDraft = null;
    onboardingGenerating = true;
    onboardingPublicMatches = matchOnboardingPublicSystems();
    onboardingCommunityMatches = [];
    // Always look for communities when shared — with no interests (or too few matches)
    // the search falls back to popular public communities, so the section is never empty.
    onboardingMatchesLoading = communitiesAreShared();
    renderOnboarding();
    runOnboardingSuggestions();
  }

  async function runOnboardingSuggestions() {
    // Tag this run; a later one (re-entry, e.g. a different account in the same tab)
    // supersedes it. A superseded run must not write results or clear the loading
    // state — otherwise a stale fetch could render onto the new run's screen.
    const myRun = ++onboardingRunSeq;
    const isCurrent = () => myRun === onboardingRunSeq && onboardingActive && onboardingStep === 4;
    if (onboardingMatchesLoading) {
      Promise.resolve(matchOnboardingCommunities())
        .then((rows) => { if (myRun === onboardingRunSeq) onboardingCommunityMatches = rows; })
        .catch(() => { if (myRun === onboardingRunSeq) onboardingCommunityMatches = []; })
        .then(() => {
          if (myRun !== onboardingRunSeq) return;
          onboardingMatchesLoading = false;
          if (isCurrent()) renderOnboarding();
        });
    }
    // Refresh the public-systems pool from the server (in case it loaded after sign-in
    // or changed since), then re-derive the copy section. Both the state write and the
    // render are run-token guarded so a superseded run can't clobber a newer account.
    if (signalsReady()) {
      Promise.resolve(loadPublicSystemsFromDb())
        .then((mapped) => {
          if (myRun !== onboardingRunSeq) return;
          state.publicSystems = mapped;
          onboardingPublicMatches = matchOnboardingPublicSystems();
        })
        .catch(() => {})
        .then(() => { if (isCurrent()) renderOnboarding(); });
    }
    try {
      const draft = await aiGenerateDraft(buildOnboardingAiInputs(), blankAiAdjustments(), "personal");
      if (myRun === onboardingRunSeq) onboardingDraft = draft;
    } catch (error) {
      if (myRun === onboardingRunSeq) onboardingDraft = null;
    } finally {
      if (myRun === onboardingRunSeq) {
        onboardingGenerating = false;
        if (isCurrent()) renderOnboarding();
      }
    }
  }

  // Public systems for the "copy" section, reusing the Build search pool
  // (getBuildPublicSystems + matchesSystemSearch) — which now includes other public
  // profiles' public systems loaded from the server (loadPublicSystemsFromDb) plus the
  // user's own public systems. Interest matches first; if fewer than ONBOARD_MIN_PICKS,
  // top up with popular systems from the same pool (tagged _popular). Deduped, capped at
  // ONBOARD_PICKS_CAP. Empty only when the pool is genuinely empty (zero public systems).
  // Same content → same card. public_systems carries many identical rows from different
  // owners (e.g. seven "Lifestyle baseline"), so deduping by id alone leaves duplicates.
  // Key on normalized title + category (case/whitespace-insensitive).
  function publicSystemContentKey(system) {
    const norm = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    return `${norm(system.title)}|${norm(system.category)}`;
  }

  // Collapse same-content systems to one, keeping the most-copied representative (then the
  // richest rule set; first-seen wins on a full tie). Original pool order is preserved.
  function dedupePublicSystemsByContent(list) {
    const hasContent = (key) => key.replace(/\|/g, "").trim().length > 0;
    const bestByKey = new Map();
    list.forEach((system) => {
      const key = publicSystemContentKey(system);
      if (!hasContent(key)) return; // keyless rows are never collapsed
      const current = bestByKey.get(key);
      const better = !current
        || (system.copyCount || 0) > (current.copyCount || 0)
        || ((system.copyCount || 0) === (current.copyCount || 0)
            && (system.rules || []).length > (current.rules || []).length);
      if (better) bestByKey.set(key, system);
    });
    const chosen = new Set(bestByKey.values());
    return list.filter((system) => {
      const key = publicSystemContentKey(system);
      return !hasContent(key) || chosen.has(system);
    });
  }

  function matchOnboardingPublicSystems() {
    // Exclude the user's own public systems — "Public systems you can copy" is about
    // discovering OTHER people's (the Build search still shows your own).
    const pool = dedupePublicSystemsByContent(
      getBuildPublicSystems().filter((system) => system.ownerId !== "me")
    );
    if (!pool.length) return [];
    const seen = new Set();
    const out = [];
    onboardingInterests.forEach((interest) => {
      const query = String(interest.label || "").toLowerCase();
      if (!query) return;
      pool.forEach((system) => {
        if (seen.has(system.id) || !matchesSystemSearch(system, query)) return;
        seen.add(system.id);
        out.push({ ...system, _popular: false });
      });
    });
    if (out.length < ONBOARD_MIN_PICKS) {
      popularOnboardingSystems(pool).forEach((system) => {
        if (out.length >= ONBOARD_PICKS_CAP || seen.has(system.id)) return;
        seen.add(system.id);
        out.push({ ...system, _popular: true });
      });
    }
    return out.slice(0, ONBOARD_PICKS_CAP);
  }

  // Rank the public-systems pool for the "Popular" fallback: server-backed systems by
  // real copy count first, then a richer rule set (the proxy for local/own systems with
  // no copy count), then title for a deterministic tiebreak.
  function popularOnboardingSystems(pool) {
    return [...pool].sort((a, b) =>
      ((b.copyCount || 0) - (a.copyCount || 0)) ||
      ((b.rules || []).length - (a.rules || []).length) ||
      String(a.title || "").localeCompare(String(b.title || "")));
  }

  // Public communities for the "join" section. Interest matches via search_communities
  // first; if fewer than ONBOARD_MIN_PICKS, top up with popular public communities
  // (popular_communities RPC, ordered by member count, tagged _popular). Public-tier,
  // not already-joined, deduped, capped at ONBOARD_PICKS_CAP. Empty only when the app
  // has genuinely zero public communities.
  async function matchOnboardingCommunities() {
    if (!communitiesAreShared() || !window.PointwellSignals || typeof window.PointwellSignals.searchCommunities !== "function") return [];
    const seen = new Set();
    const out = [];
    const addRow = (row, popular) => {
      if (out.length >= ONBOARD_PICKS_CAP || !row || row.visibility !== "public") return;
      if (row.is_member || isCommunityJoined(row.id)) return;
      const id = String(row.id);
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ ...row, _popular: popular });
    };
    // 1) Interest matches.
    const queries = onboardingInterests
      .map((interest) => String(interest.label || "").trim())
      .filter((query) => query.length >= 2)
      .slice(0, 4);
    if (queries.length) {
      const lists = await Promise.all(queries.map((query) =>
        Promise.resolve(window.PointwellSignals.searchCommunities(query)).catch(() => [])));
      lists.forEach((rows) => (Array.isArray(rows) ? rows : []).forEach((row) => addRow(row, false)));
    }
    // 2) Popular fallback to keep the section populated.
    if (out.length < ONBOARD_MIN_PICKS && typeof window.PointwellSignals.popularCommunities === "function") {
      const popular = await Promise.resolve(window.PointwellSignals.popularCommunities(12)).catch(() => []);
      (Array.isArray(popular) ? popular : []).forEach((row) => addRow(row, true));
    }
    return out.slice(0, ONBOARD_PICKS_CAP);
  }

  // "Add" the AI system through the normal creation path (mirrors startStarterSystem):
  // clone into a fresh private system, make it the active tracker, mark it added.
  // Stays in onboarding so the user can also Copy/Join before tapping Done.
  function onboardingAddAiSystem() {
    if (!onboardingDraft) return;
    const source = normalizeSystem(onboardingDraft);
    const system = cloneSystem(source, onboardingDraft.title || "Your reward system");
    system.aiDomain = source.aiDomain || "ai";
    state.systems.unshift(system);
    state.selectedSystemId = system.id;
    state.trackerSystemId = system.id;
    state.systemEditorOpen = false;
    state.buildMode = "home";
    state.activeView = "dashboard";
    onboardingAddedSystemId = system.id;
    saveState();
    showToast("Added to your systems");
    renderOnboarding();
  }

  // Copy a matched public system into the user's systems WITHOUT leaving onboarding
  // (the core of copyPublicSystem, minus its view/editor navigation).
  function onboardingCopyPublicSystem(id) {
    const source = (onboardingPublicMatches || []).find((system) => system.id === id);
    if (!source) return;
    const copy = cloneSystem(source, `${source.title} remix`);
    copy.ownerId = "me";
    copy.ownerName = state.profile.name;
    copy.visibility = "private";
    state.systems.unshift(copy);
    state.selectedSystemId = copy.id;
    state.trackerSystemId = copy.id;
    state.activeView = "dashboard";
    if (!onboardingCopiedIds.includes(id)) onboardingCopiedIds.push(id);
    bumpPublicSystemCopy(source);
    saveState();
    showToast("Copied into your systems");
    renderOnboarding();
  }

  // Join a matched community WITHOUT leaving onboarding — uses the low-level join
  // signal (not joinCommunityById, which navigates to the community detail view).
  async function onboardingJoinCommunity(id) {
    const communityId = String(id || "");
    if (!communityId || !communitiesAreShared() || onboardingJoinedIds.includes(communityId)) return;
    const res = await window.PointwellSignals.joinCommunity(communityId, state.account.userId, "member");
    if (res && res.error) { showToast(communityDbError(res.error, "Couldn't join that community")); return; }
    onboardingJoinedIds.push(communityId);
    if (onboardingActive && onboardingStep === 4) renderOnboarding();
    // Resync state.communities in the background so the joined community is present
    // when the user lands; render() runs behind the overlay, so it's invisible here.
    Promise.resolve(loadCommunitiesFromDb()).catch(() => {});
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
    if (opts.landing === "communities") state.activeView = "dashboard"; // worlds live on Today now
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
      // Server truth for the uploaded profile picture + bio + cover (so they show on every device).
      state.profile.avatarUrl = flags.avatar_url || "";
      state.profile.coverUrl = flags.cover_url || "";
      if (typeof flags.bio === "string") state.profile.bio = flags.bio;
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
      // Live bell: a new notification row (like/comment/friend event) refetches the bell
      // + rings it (renderNotifications rings when the count goes up).
      if (unsubscribeNotifications) { try { unsubscribeNotifications(); } catch (e) { /* ignore */ } }
      if (typeof window.PointwellSignals.subscribeNotifications === "function") {
        unsubscribeNotifications = window.PointwellSignals.subscribeNotifications(uid, handleNotificationChange);
      }
      currentInboxUid = uid;
    }
    // Publish my public systems for others to copy, and load theirs into local state.
    syncMyPublicSystems();
    state.publicSystems = await loadPublicSystemsFromDb();
    // Load the user's shared communities (one DB row each) into local state, then
    // act on any ?join= invite link that brought them here.
    await loadCommunitiesFromDb();
    await resolvePendingJoin();
    // Communities are loaded now → safe to compute yesterday's leaderboard standing for the recap.
    Promise.resolve(maybeShowDailyRecap()).catch(() => {});
    try { maybeShowStreakAtRisk(); } catch (e) { /* nudge is best-effort */ }
  }

  function teardownSignals() {
    if (unsubscribeInbox) { try { unsubscribeInbox(); } catch (e) { /* ignore */ } unsubscribeInbox = null; }
    if (unsubscribeNotifications) { try { unsubscribeNotifications(); } catch (e) { /* ignore */ } unsubscribeNotifications = null; }
    currentInboxUid = null;
    inboxSignals = [];
    bellNotifications = [];
    lastBellBadge = null;
    ownerJoinRequests = [];
    friends = new Set();
    incomingFriendRequests = [];
    friendsDetailed = [];
    friendsActiveTodayIds = new Set();
    viewedFriend = null;
    friendActivityRows = [];
    lastPushedBehind = null;
    lastBehindWriteAt = 0;
    clearTimeout(behindPushTimer);
    behindPushTimer = null;
    activeThread = null;
    if (els.chatsLayout) els.chatsLayout.classList.remove("has-active");
    renderNotifications();
  }

  // Peer profile cards (name/handle/avatar) for Chats, which is built straight from
  // the signals table and has no definer to read avatars from. Seeded from friends +
  // request senders (who already carry avatars and are re-seeded fresh on every inbox
  // poll) and filled lazily via get_profile_cards for cold-message peers; used to
  // upgrade chat & notification rows to photos. Lazily-resolved (non-friend) cards are
  // pinned for the session — a peer who changes their picture mid-session refreshes on
  // the next full reload, which is plenty for avatars.
  const profileCardCache = new Map(); // peerId -> { id, display_name, handle, avatar_url }

  function peerAvatarUrl(peerId) {
    const card = profileCardCache.get(String(peerId));
    return card && card.avatar_url ? card.avatar_url : "";
  }

  async function ensureProfileCards(ids) {
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.getProfileCards !== "function") return;
    const missing = [];
    (ids || []).forEach((raw) => {
      const id = String(raw || "");
      // Reserve the id immediately (placeholder) so overlapping calls don't refetch.
      if (id && !profileCardCache.has(id)) { profileCardCache.set(id, {}); missing.push(id); }
    });
    if (!missing.length) return;
    try {
      const cards = await window.PointwellSignals.getProfileCards(missing);
      let any = false;
      (cards || []).forEach((c) => { if (c && c.id) { profileCardCache.set(String(c.id), c); any = true; } });
      if (any) { renderNotifications(); renderChats(signalsReady()); }
    } catch (e) { /* ignore */ }
  }

  async function refreshInbox() {
    if (!signalsReady()) {
      inboxSignals = []; ownerJoinRequests = []; friends = new Set(); incomingFriendRequests = []; friendsDetailed = []; bellNotifications = [];
      renderNotifications();
      return;
    }
    // Inbox messages, pending join requests I own, my friends, and incoming friend
    // requests — fetched together so the badge and both inbox tiers stay in sync.
    const out = await Promise.all([
      window.PointwellSignals.fetchInbox(state.account.userId, 200),
      window.PointwellSignals.getOwnerJoinRequests(),
      window.PointwellSignals.getFriends(),
      window.PointwellSignals.getIncomingFriendRequests(),
      window.PointwellSignals.getNotifications()        // bell: activity about me, DMs excluded server-side
    ]);
    inboxSignals = Array.isArray(out[0]) ? out[0] : [];
    ownerJoinRequests = Array.isArray(out[1]) ? out[1] : [];
    const friendRows = Array.isArray(out[2]) ? out[2] : [];
    friends = new Set(friendRows.map((f) => String(f.user_id)));
    friendsDetailed = friendRows; // accepted friends WITH names, for the Friends view
    // Names from friends/requests help the inbox label conversations I started.
    friendRows.forEach((f) => { if (f.display_name) rememberPeerName(String(f.user_id), f.display_name); });
    incomingFriendRequests = Array.isArray(out[3]) ? out[3] : [];
    bellNotifications = Array.isArray(out[4]) ? out[4] : [];
    // Seed the chat peer-card cache from rows that already carry avatars (friends +
    // request senders); the rest (cold-message peers) resolve lazily below.
    friendRows.forEach((f) => { if (f.user_id) profileCardCache.set(String(f.user_id), f); });
    incomingFriendRequests.forEach((r) => {
      if (r.requester_user) profileCardCache.set(String(r.requester_user), {
        id: r.requester_user, display_name: r.requester_name, handle: r.requester_handle, avatar_url: r.requester_avatar_url
      });
    });
    renderNotifications();
    const peerIds = [];
    inboxSignals.forEach((s) => {
      [s.from_user, s.to_user].forEach((u) => {
        const id = String(u || "");
        if (id && id !== String(state.account.userId) && peerIds.indexOf(id) === -1) peerIds.push(id);
      });
    });
    ensureProfileCards(peerIds);
  }

  // A new/updated notification row arrived (like/comment/friend event). Refetch the bell;
  // renderNotifications bumps the badge and rings the bell when the unread count rises.
  function handleNotificationChange() {
    refreshInbox();
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
    // Chats badge = unread DIRECT MESSAGES only (type 'text'). Cheers/kudos now route to
    // the bell, so they no longer count here (and can never double-count across badges).
    const chatsUnread = ready ? window.PointwellSignals.unreadCount(inboxSignals.filter((s) => s.to_user === me && s.type === "text" && !sessionHiddenPeers.has(String(s.from_user)))) : 0;
    const requestCount = ready ? ownerJoinRequests.length : 0;
    const friendReqCount = ready ? incomingFriendRequests.length : 0;
    // Bell badge = unread activity ABOUT me from get_notifications (likes/comments/friend
    // events/cheers — DMs are excluded server-side) + pending community join requests.
    const bellUnread = ready ? bellNotifications.filter((n) => !n.read).length : 0;
    const bellBadge = bellUnread + requestCount;
    // Header cluster badges, each its own live count: Alerts bell = activity about me
    // (NEVER direct messages), Friends = pending friend requests, Chats = unread DMs.
    const fmt = (n) => (n > 9 ? "9+" : String(n));
    if (els.notifBellBadge) {
      els.notifBellBadge.textContent = fmt(bellBadge);
      els.notifBellBadge.hidden = bellBadge === 0;
    }
    // Ring the bell only when the count goes UP (a new notification arrived) — not on the
    // first render, and not when it drops (marking read).
    if (lastBellBadge !== null && bellBadge > lastBellBadge) ringBell();
    lastBellBadge = bellBadge;
    if (els.headerChatsBadge) {
      els.headerChatsBadge.textContent = fmt(chatsUnread);
      els.headerChatsBadge.hidden = chatsUnread === 0;
    }
    if (notifPanelOpen) renderNotifPanel(); // keep an open dropdown in sync with the data
    if (els.chatsMarkAllButton) els.chatsMarkAllButton.hidden = chatsUnread === 0;
    // The friends-view "Add friend" button also surfaces the pending friend-request count.
    if (els.friendsAddBadge) { els.friendsAddBadge.textContent = fmt(friendReqCount); els.friendsAddBadge.hidden = friendReqCount === 0; }
    renderOwnerRequests(ready);
    renderFriendRequests(ready);
    renderChats(ready);
  }

  // ── Header notifications bell ──────────────────────────────────────────────
  // A dropdown that re-surfaces the SAME actionable events as the Chats inbox
  // (friend requests, community join requests, received kudos/cheers/messages).
  // No parallel store — it reads incomingFriendRequests / ownerJoinRequests /
  // inboxSignals and reuses the same accept/decline/mark-read/open actions.
  // Briefly "ring" the bell icon (a quick wobble) when a new notification arrives.
  function ringBell() {
    const icon = els.notifBellButton && els.notifBellButton.querySelector(".bell-icon");
    if (!icon) return;
    icon.classList.remove("is-ringing");
    void icon.offsetWidth; // restart the animation if it's already mid-ring
    icon.classList.add("is-ringing");
    setTimeout(() => { if (icon) icon.classList.remove("is-ringing"); }, 750);
  }

  // Mark the currently-shown bell notifications read: notification-table rows via
  // mark_notifications_read, and cheer/kudos signal rows via the signals markRead — so
  // opening the bell clears its badge WITHOUT touching unread direct messages.
  function markBellNotificationsRead() {
    if (!signalsReady()) return;
    const notifIds = [];
    const signalIds = [];
    bellNotifications.forEach((n) => {
      if (n.read) return;
      if (n.source === "signal") signalIds.push(n.row_id);
      else notifIds.push(n.row_id);
    });
    if (!notifIds.length && !signalIds.length) return;
    bellNotifications.forEach((n) => { n.read = true; }); // optimistic
    lastBellBadge = null; // suppress a spurious ring on the refresh that follows
    const calls = [];
    if (notifIds.length && typeof window.PointwellSignals.markNotificationsRead === "function") {
      calls.push(Promise.resolve(window.PointwellSignals.markNotificationsRead(notifIds)).catch(() => {}));
    }
    if (signalIds.length) calls.push(Promise.resolve(window.PointwellSignals.markRead(signalIds)).catch(() => {}));
    Promise.all(calls).then(() => refreshInbox());
    renderNotifications();
  }

  // Switch to the Feed and open a specific post: expand its comment thread and scroll the
  // matching ig-card into view. Shared by the notification tap and the schedule-block tap.
  // Tapping a post (profile grid/list, a like/comment notification, a schedule block) opens THAT post
  // as an in-place overlay — the same IG-style card the feed uses, with likes + comments — WITHOUT
  // switching to the Feed or losing your scroll position. Reuses renderFeedPost + the feed handlers.
  function openEntryPost(entryId) {
    if (!entryId) return;
    let item = feedItemById(String(entryId));
    if (!item) item = buildFeedItemForEntry((state.communityEntries || []).find((e) => e.id === entryId));
    if (!item) { showToast("That post isn't available"); return; }
    openPostOverlay(item);
  }

  function openPostOverlay(item) {
    if (!item || !item.entry) return;
    closePostOverlay();
    postOverlayItem = item;
    postOverlayOpenView = state.activeView;
    const entryId = String(item.entry.id);
    feedCommentsOpen.add(entryId); // open the thread by default, like the reference's opened post
    const back = document.createElement("div");
    back.className = "post-overlay-backdrop";
    back.setAttribute("data-post-overlay", "");
    back.innerHTML = `
      <div class="post-overlay-sheet" role="dialog" aria-modal="true" aria-label="Post">
        <div class="post-overlay-bar">
          <span class="post-overlay-grab" aria-hidden="true"></span>
          <button type="button" class="post-overlay-close" data-post-overlay-close aria-label="Close">✕</button>
        </div>
        <div class="post-overlay-scroll"><div class="community-feed-list">${renderFeedPost(item)}</div></div>
      </div>`;
    document.body.appendChild(back);
    // Bind the SAME feed handlers to the overlay so likes/comments/share/save work here unchanged.
    const scroll = back.querySelector(".post-overlay-scroll");
    if (scroll) { scroll.addEventListener("click", onFeedClick); scroll.addEventListener("input", onFeedInput); scroll.addEventListener("submit", onFeedSubmit); }
    bindEntryPhotos(back);
    back.addEventListener("click", (e) => { if (e.target === back) closePostOverlay(); }); // tap-outside
    const closeBtn = back.querySelector("[data-post-overlay-close]");
    if (closeBtn) closeBtn.addEventListener("click", closePostOverlay);
    bindPostOverlaySwipe(back.querySelector(".post-overlay-sheet"));
    document.addEventListener("keydown", onPostOverlayKey);
    ensureEntrySocial(entryId);    // like counts, if not already loaded for this post
    expandFeedComments(entryId);   // load + show the comment thread (updates the overlay card in place)
  }

  function closePostOverlay() {
    const back = document.querySelector("[data-post-overlay]");
    if (back) back.remove();
    postOverlayItem = null;
    document.removeEventListener("keydown", onPostOverlayKey);
  }

  function onPostOverlayKey(e) { if (e.key === "Escape") closePostOverlay(); }

  // Like/comment counts for a single overlay post that may not be in the live feed list.
  function ensureEntrySocial(entryId) {
    if (!signalsReady() || !isDbEntryId(entryId) || !window.PointwellSignals || typeof window.PointwellSignals.getEntriesSocial !== "function") return;
    if (feedSocialFetched.has(String(entryId))) return;
    feedSocialFetched.add(String(entryId));
    Promise.resolve(window.PointwellSignals.getEntriesSocial([entryId])).then((rows) => {
      (rows || []).forEach((r) => {
        if (r && r.entry_id) feedSocialCache.set(String(r.entry_id), {
          like_count: Number(r.like_count) || 0, comment_count: Number(r.comment_count) || 0,
          liked_by_me: !!r.liked_by_me, last_comment_name: r.last_comment_name || "", last_comment_body: r.last_comment_body || ""
        });
      });
      replaceFeedCard(entryId);
    }).catch(() => {});
  }

  // Swipe down from the top of the sheet to dismiss (mobile "pull to close").
  function bindPostOverlaySwipe(sheet) {
    if (!sheet) return;
    const scroll = sheet.querySelector(".post-overlay-scroll");
    let startY = 0, dy = 0, active = false;
    sheet.addEventListener("touchstart", (e) => {
      if (!e.touches || e.touches.length !== 1) { active = false; return; }
      active = (!scroll || scroll.scrollTop <= 0); startY = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (!active || !e.touches || !e.touches.length) return;
      dy = e.touches[0].clientY - startY;
      if (dy > 0) sheet.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sheet.addEventListener("touchend", () => {
      if (!active) return;
      sheet.style.transform = "";
      if (dy > 90) closePostOverlay();
      active = false; dy = 0;
    });
  }

  // Tap a like/comment notification → open the Feed and expand that post's comments.
  function openPostFromNotif(entryId) {
    if (!entryId) return;
    closeNotifPanel();
    openEntryPost(entryId);
  }

  function toggleNotifPanel() {
    notifPanelOpen = !notifPanelOpen;
    if (els.notifBellButton) els.notifBellButton.setAttribute("aria-expanded", notifPanelOpen ? "true" : "false");
    if (els.notifPanel) els.notifPanel.hidden = !notifPanelOpen;
    if (notifPanelOpen) {
      renderNotifPanel();
      markBellNotificationsRead(); // opening the bell clears its unread badge (DMs untouched)
      document.addEventListener("click", handleNotifOutsideClick, true);
      document.addEventListener("keydown", handleNotifEscape);
    } else {
      document.removeEventListener("click", handleNotifOutsideClick, true);
      document.removeEventListener("keydown", handleNotifEscape);
    }
  }

  function closeNotifPanel() {
    if (!notifPanelOpen) return;
    notifPanelOpen = false;
    if (els.notifBellButton) els.notifBellButton.setAttribute("aria-expanded", "false");
    if (els.notifPanel) els.notifPanel.hidden = true;
    document.removeEventListener("click", handleNotifOutsideClick, true);
    document.removeEventListener("keydown", handleNotifEscape);
  }

  function handleNotifOutsideClick(event) {
    if (!els.notifPanel) return;
    if (els.notifPanel.contains(event.target)) return;
    if (els.notifBellButton && els.notifBellButton.contains(event.target)) return;
    closeNotifPanel();
  }

  function handleNotifEscape(event) {
    if (event.key === "Escape") closeNotifPanel();
  }


  function renderNotifPanel() {
    if (!els.notifPanel) return;
    if (!signalsReady()) {
      els.notifPanel.innerHTML = `<div class="notif-empty">Sign in to see notifications.</div>`;
      return;
    }
    const notifs = (bellNotifications || []).slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const showMarkAll = notifs.some((n) => !n.read);

    let html = `<div class="notif-head"><strong>Notifications</strong>${showMarkAll ? `<button class="ghost-button small" type="button" data-notif-mark-all>Mark all read</button>` : ""}</div>`;
    const sections = [];

    // Community join requests (owner-side) — their own actionable section.
    if (ownerJoinRequests.length) {
      sections.push(`<div class="notif-section"><span class="notif-section-label">Community requests</span>` +
        ownerJoinRequests.map((r) => {
          const label = r.requester_name || r.requester_handle || "A member";
          const id = escapeHtml(String(r.request_id));
          const community = escapeHtml(r.community_name || "your community");
          return `
            <div class="notif-item">
              ${renderAvatar({ name: label, avatarUrl: r.requester_avatar_url })}
              <div class="notif-item-main"><strong>${escapeHtml(label)}</strong><span>wants to join ${community}</span></div>
              <div class="notif-item-actions">
                <button class="primary-button small" type="button" data-notif-join-accept="${id}">Accept</button>
                <button class="ghost-button small" type="button" data-notif-join-decline="${id}">Decline</button>
              </div>
            </div>`;
        }).join("") + `</div>`);
    }

    // Activity about me (likes/comments/friend requests + accepts/cheers) — from
    // get_notifications, which NEVER includes direct messages.
    if (notifs.length) {
      sections.push(`<div class="notif-section"><span class="notif-section-label">Recent</span>` +
        notifs.slice(0, 15).map(renderBellNotification).join("") + `</div>`);
    }

    html += sections.length ? sections.join("") : `<div class="notif-empty">You're all caught up.</div>`;
    els.notifPanel.innerHTML = html;
  }

  // One row in the bell panel. Friend requests get inline Approve/Decline (when still
  // pending); like/comment are tappable (open the post in the feed); cheers/kudos open
  // the Chats conversation; friend-accept is read-only.
  function renderBellNotification(n) {
    const who = n.actor_name || n.actor_handle || "Someone";
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(n.created_at, Date.now()));
    const avatar = renderAvatar({ name: who, avatarUrl: n.actor_avatar_url });
    const dot = n.read ? "" : '<span class="notif-dot" aria-hidden="true"></span>';
    const unreadCls = n.read ? "" : " unread";

    if (n.kind === "friend_request" && n.action_id) {
      const id = escapeHtml(String(n.action_id));
      return `
        <div class="notif-item${unreadCls}">
          ${avatar}
          <div class="notif-item-main"><strong>${escapeHtml(who)}</strong><span>sent you a friend request · ${when}</span></div>
          <div class="notif-item-actions">
            <button class="primary-button small" type="button" data-notif-friend-accept="${id}">Approve</button>
            <button class="ghost-button small" type="button" data-notif-friend-decline="${id}">Decline</button>
          </div>
        </div>`;
    }

    let subtext;
    let attrs = "";
    let tag = "div";
    if (n.kind === "like") {
      subtext = "liked your post";
      tag = "button"; attrs = ` type="button" data-notif-post="${escapeHtml(String(n.entry_id || ""))}"`;
    } else if (n.kind === "comment") {
      subtext = n.body ? ("commented: " + escapeHtml(String(n.body))) : "commented on your post";
      tag = "button"; attrs = ` type="button" data-notif-post="${escapeHtml(String(n.entry_id || ""))}"`;
    } else if (n.kind === "kudos") {
      subtext = "sent you kudos";
      tag = "button"; attrs = ` type="button" data-notif-open="${escapeHtml(String(n.actor_user))}" data-notif-name="${escapeHtml(who)}"`;
    } else if (n.kind === "motivation") {
      subtext = "sent you motivation";
      tag = "button"; attrs = ` type="button" data-notif-open="${escapeHtml(String(n.actor_user))}" data-notif-name="${escapeHtml(who)}"`;
    } else if (n.kind === "friend_accept") {
      subtext = "accepted your friend request";
    } else if (n.kind === "friend_request") {
      subtext = "sent you a friend request"; // resolved (no longer pending)
    } else {
      subtext = "sent you a notification";
    }

    const cls = tag === "button" ? "notif-item notif-item-signal" : "notif-item";
    return `
      <${tag} class="${cls}${unreadCls}"${attrs}>
        ${avatar}
        <div class="notif-item-main"><strong>${escapeHtml(who)}</strong><span>${subtext} · ${when}</span></div>
        ${dot}
      </${tag}>`;
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
    const community = escapeHtml(req.community_name || "your community");
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(req.created_at, Date.now()));
    const id = escapeHtml(String(req.request_id));
    return `
      <div class="join-request-item" data-request-id="${id}">
        ${renderAvatar({ name: label, avatarUrl: req.requester_avatar_url })}
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
        return { ...group, name: group.name || rememberedPeerName(group.peerId), isFriend, isRequest, avatarUrl: peerAvatarUrl(group.peerId) };
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
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(group.latest.created_at, Date.now()));
    const preview = escapeHtml(group.latest.body || "");
    const peer = escapeHtml(String(group.peerId));
    return `
      <div class="message-request-item${group.unread ? " unread" : ""}">
        <button class="message-request-open" type="button" data-msgreq-open="${peer}" data-msgreq-name="${who}" data-community-id="${escapeHtml(group.communityId || "")}">
          ${renderAvatar({ name: group.name, avatarUrl: group.avatarUrl })}
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
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(group.latest.created_at, Date.now()));
    const labels = { kudos: "Kudos", motivation: "Motivation" };
    const type = group.latest.type;
    const pill = labels[type] ? `<span class="signal-pill ${type}">${labels[type]}</span>` : "";
    const mine = group.latest.from_user === me;
    const preview = escapeHtml((mine ? "You: " : "") + (group.latest.body || ""));
    return `
      <button class="chat-row${group.unread ? " unread" : ""}" type="button" data-peer-id="${escapeHtml(group.peerId)}" data-peer-name="${who}" data-community-id="${escapeHtml(group.communityId || "")}">
        ${renderAvatar({ name: group.name, avatarUrl: group.avatarUrl })}
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
    const handle = escapeHtml(cleanHandle(req.requester_handle || "") || "");
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(req.created_at, Date.now()));
    const id = escapeHtml(String(req.request_id));
    return `
      <div class="join-request-item" data-friend-request-id="${id}">
        ${renderAvatar({ name: label, avatarUrl: req.requester_avatar_url })}
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
    // The row (avatar + name/handle) opens the person's profile via the same path the
    // feed uses (openUserProfile); the action button is handled first in the delegated
    // click listeners, so tapping it never opens the profile.
    return `
      <div class="chats-person-row is-tappable" data-open-profile-user="${id}">
        ${renderAvatar({ name: person.display_name || "Member", avatarUrl: person.avatar_url })}
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

  // The header avatar opens YOUR profile the way others see it (the public profile view,
  // with a Settings button) — not the edit form directly. Falls back to the edit form
  // when there's no server identity to fetch (local/demo or signed-out).
  function openMyProfile() {
    const uid = state.account && state.account.userId;
    if (signalsReady() && uid) openUserProfile(String(uid));
    else openProfile();
  }

  // Back from the Settings edit form → the own profile view (reusing its cached overview
  // so the profile-page's own Back target is preserved), with sensible fallbacks.
  function backFromProfileEdit() {
    const uid = state.account && state.account.userId;
    if (uid && String(state.profileUserId) === String(uid)) {
      state.activeView = "profile-page";
      saveState();
      render();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else if (signalsReady() && uid) {
      openUserProfile(String(uid));
    } else {
      state.activeView = "dashboard";
      saveState();
      render();
    }
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
      "wearablePrompt",
      "profileAvatar",
      "todayLabel",
      "dashboardView",
      "addEntryView",
      "customizeTopCardView",
      "customizeChartsView",
      "systemsView",
      "discoverView",
      "feedView",
      "feedTabs",
      "feedCount",
      "searchView",
      "headerSearchButton",
      "headerSearchForm",
      "headerSearchInput",
      "headerSearchResults",
      "communitiesView",
      "communityDetailView",
      "communitySettingsView",
      "communityMemberActivityView",
      "findCommunitiesView",
      "profileView",
      "scoreContextSelect",
      "scoreHeroContext",
      "scoreHeroBarFill",
      "openCommunityButton",
      "editSystemButton",
      "addEntryTitle",
      "addEntrySystemSelect",
      "quickLogCapture",
      "quickLogInput",
      "quickLogMic",
      "quickLogSubmit",
      "quickLogSnapButton",
      "quickLogMealInput",
      "quickLogHint",
      "quickLogDraft",
      "coachLauncher",
      "coachLauncherBadge",
      "coachPeek",
      "coachPanel",
      "coachPanelClose",
      "coachProactiveToggle",
      "coachThread",
      "coachForm",
      "coachInput",
      "coachSend",
      "coachMic",
      "coachPhotoButton",
      "coachPhotoInput",
      "customizeTopCardSystemSelect",
      "customizeChartsSystemSelect",
      "createFab",
      "backToDashboardButton",
      "cancelTopCardButton",
      "saveTopCardButton",
      "cancelChartsButton",
      "saveChartsButton",
      "saveEntryButton",
      "liveScore",
      "dailyStatusLabel",
      "scoreNudge",
      "scoreRingFill",
      "miniLeaderboard",
      "analyticsToggle",
      "dashboardAnalytics",
      "worldGrid",
      "worldGridHint",
      "streakCard",
      "dashboardDetail",
      "notifBellButton",
      "notifBellBadge",
      "notifPanel",
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
      "buildIntentHome",
      "buildIntentForm",
      "buildIntentInput",
      "buildIntentSubmit",
      "buildIntentChips",
      "buildIntentLinks",
      "buildYourBuildsList",
      "buildYourBuildsCount",
      "buildAudiencePanel",
      "buildCommunitiesWrap",
      "buildCommunityList",
      "buildSearchPanel",
      "buildPublicSearchInput",
      "buildPublicSearchResults",
      "buildAiPanel",
      "buildDraftEditor",
      "buildAiForm",
      "aiGoalsInput",
      "aiRewardHabitsInput",
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
      "communitySearchInput",
      "communitySearchForm",
      "communityList",
      "communityFeed",
      "worldBanner",
      "worldBannerImg",
      "worldCoverEdit",
      "worldIcon",
      "worldIconImg",
      "worldIconFallback",
      "worldIconEdit",
      "worldName",
      "worldSubtitle",
      "worldEditButton",
      "worldHeadActions",
      "worldActions",
      "worldChips",
      "systemMediaFields",
      "systemCoverThumb",
      "systemCoverImg",
      "systemIconThumb",
      "systemIconImg",
      "communityMediaFields",
      "communityCoverThumb",
      "communityCoverImg",
      "communityIconThumb",
      "communityIconImg",
      "personalRulesPanel",
      "personalRules",
      "worldPostsPanel",
      "worldPosts",
      "worldTrendsPanel",
      "worldTrendsToggle",
      "worldTrendsBody",
      "worldCoverInput",
      "worldIconInput",
      "backToCommunitiesButton",
      "inviteButton",
      "communitySettingsButton",
      "communityDangerZone",
      "inviteOptions",
      "copyInviteLinkButton",
      "copyInviteCodeButton",
      "sendInviteTextButton",
      "sendInviteEmailButton",
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
      "leaderboardExpand",
      "communityLeaderboardPanel",
      "communityPeriodTabs",
      "communityYourDayPanel",
      "communityYourDay",
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
      "ccRuleCollapsed",
      "ccRuleAddedBanner",
      "ccRuleAddedText",
      "ccAddAnotherRuleButton",
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
      "profileBioInput",
      "profileBioCounter",
      "profilePrivacyInput",
      "backFromProfileEditButton",
      "largeAvatar",
      "profileAvatarEditButton",
      "profileAvatarMenu",
      "profileAvatarRemoveButton",
      "profileAvatarCameraInput",
      "profileAvatarLibraryInput",
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
      "headerTitle",
      "headerChatsButton",
      "headerChatsBadge",
      "friendsView",
      "backFromFriendsButton",
      "friendsAddButton",
      "friendsAddBadge",
      "friendsList",
      "friendActivityView",
      "profilePageView",
      "profilePageBody",
      "friendActivityTitle",
      "friendActivitySubtitle",
      "friendActivityAvatar",
      "friendActivityBody",
      "backFromFriendActivityButton",
      "onboardingScreen",
      "onboardingBody",
      "allowMotivationInput",
      "allowAutoSyncInput",
      "ccAllowDeviceAutosync",
      "communityHubTabs",
      "communityComposer",
      "communityComposerPhoto",
      "communityFeedSort",
      "communityMembersPanel",
      "communityMembersList",
      "communityAboutPanel",
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
      feed: els.feedView,
      search: els.searchView,
      "create-community": els.createCommunityView,
      "community-detail": els.communityDetailView,
      "community-settings": els.communitySettingsView,
      "community-member-activity": els.communityMemberActivityView,
      "find-communities": els.findCommunitiesView,
      friends: els.friendsView,
      "friend-activity": els.friendActivityView,
      chats: els.chatsView,
      profile: els.profileView,
      "profile-page": els.profilePageView
    };
  }

  function bindEvents() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // The Profile tab opens the existing own-profile self-view (loads the overview),
        // so it can't just set activeView directly like the other tabs.
        if (tab.dataset.view === "profile-page") { openMyProfile(); return; }
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
        // Feed reads community data; refresh it on open.
        if (state.activeView === "feed") loadCommunitiesFromDb();
      });
    });

    if (els.feedTabs) els.feedTabs.addEventListener("click", onFeedTabClick);

    // The "+" FAB is the single entry point for logging (creating systems/communities
    // lives in Build). openAddEntryPage guards the no-system / no-rules cases with a toast.
    if (els.createFab) els.createFab.addEventListener("click", openAddEntryPage);
    // Bubble-tile home: tap a tile to open it; long-press (touch) / click-drag (desktop)
    // to reorder. Top two of the new order become the featured/large tiles (drag up to
    // feature, down to shrink); order persists in state.homeLayout.order.
    if (els.worldGrid) {
      els.worldGrid.addEventListener("click", onWorldGridClick);
      els.worldGrid.addEventListener("keydown", onWorldGridKeydown);
      els.worldGrid.addEventListener("pointerdown", onWorldGridPointerDown);
      // move/up on window so the drag keeps tracking outside the grid bounds.
      window.addEventListener("pointermove", onWorldGridPointerMove, { passive: false });
      window.addEventListener("pointerup", onWorldGridPointerUp);
      window.addEventListener("pointercancel", onWorldGridPointerCancel);
    }
    bindQuickLogControls();
    bindCoach();
    bindWearablePrompt();
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
    if (els.analyticsToggle) els.analyticsToggle.addEventListener("click", toggleDashboardAnalytics);
    if (els.miniLeaderboard) els.miniLeaderboard.addEventListener("click", (event) => {
      if (event.target.closest && event.target.closest("[data-open-full-leaderboard]")) { viewCommunityLeaderboardFromScore(); return; }
      const row = event.target.closest && event.target.closest("[data-community-member-id]");
      if (row) openStandingsMember(row.dataset.communityMemberId);
    });

    els.newSystemButton?.addEventListener("click", openBuildOptions);
    Array.from(document.querySelectorAll("[data-build-mode]")).forEach((button) => {
      button.addEventListener("click", () => setBuildMode(button.dataset.buildMode));
    });
    // Start cards now lead to a personal/community choice before the flow begins.
    Array.from(document.querySelectorAll("[data-build-start]")).forEach((button) => {
      button.addEventListener("click", () => chooseBuildStart(button.dataset.buildStart));
    });
    Array.from(document.querySelectorAll("[data-build-audience]")).forEach((button) => {
      button.addEventListener("click", () => startBuildForAudience(button.dataset.buildAudience));
    });
    els.buildPublicSearchInput.addEventListener("input", (event) => {
      state.buildSearchQuery = event.target.value;
      state.buildViewedProfileId = ""; // a new query leaves any open profile view
      runPeopleSearch(event.target.value);
      runBuildCommunitySearch(event.target.value);
      renderBuildSearchResults();
    });
    els.buildAiForm.addEventListener("submit", generateAiDraftSystem);
    if (els.buildIntentForm) els.buildIntentForm.addEventListener("submit", (e) => {
      e.preventDefault();
      generateDraftFromIntent(els.buildIntentInput ? els.buildIntentInput.value : "");
    });
    if (els.buildIntentChips) els.buildIntentChips.addEventListener("click", (e) => {
      const b = e.target.closest("[data-intent]"); if (!b) return;
      if (els.buildIntentInput) els.buildIntentInput.value = b.dataset.intent;
      generateDraftFromIntent(b.dataset.intent);
    });
    if (els.buildIntentLinks) els.buildIntentLinks.addEventListener("click", (e) => {
      const b = e.target.closest("[data-intent-route]"); if (!b) return;
      const route = b.dataset.intentRoute;
      if (route === "ai") { els.buildIntentInput?.focus(); }
      else if (route === "search") setBuildMode("search");
      else if (route === "scratch") setBuildMode("scratch");
    });
    if (els.buildDraftEditor) {
      els.buildDraftEditor.addEventListener("pointerdown", onDialPointerDown);
      els.buildDraftEditor.addEventListener("wheel", onDialWheel, { passive: false });
      els.buildDraftEditor.addEventListener("keydown", onDialKeyDown);
      els.buildDraftEditor.addEventListener("click", onDraftEditorClick);
      els.buildDraftEditor.addEventListener("input", onDraftEditorInput);
      document.addEventListener("pointermove", onDialPointerMove);
      document.addEventListener("pointerup", onDialPointerUp);
    }
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

    if (els.newCommunityButton) els.newCommunityButton.addEventListener("click", openCreateCommunity);
    if (els.findCommunitiesButton) els.findCommunitiesButton.addEventListener("click", openFindCommunities);
    if (els.communitySearchInput) {
      // Live-filter the joined community cards by name as the user types.
      els.communitySearchInput.addEventListener("input", (event) => {
        communityListFilter = event.target.value || "";
        renderCommunities();
      });
    }
    if (els.communitySearchForm) {
      // Submitting routes the query to the existing community name search (discovery).
      els.communitySearchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const query = (els.communitySearchInput.value || "").trim();
        if (query.length >= 2) {
          openFindCommunities();
          runCommunityCodeSearch(query);
        }
      });
    }
    els.openCommunityButton.addEventListener("click", openCommunityFromScore);
    els.editSystemButton.addEventListener("click", editSystemFromScore);
    els.backToCommunitiesButton.addEventListener("click", returnToCommunities);
    els.communitySettingsButton.addEventListener("click", openCommunitySettings);
    bindWorldDetail();
    els.backFromCommunitySettingsButton.addEventListener("click", returnToCommunityDetail);
    els.backFromMemberActivityButton.addEventListener("click", returnToCommunityDetail);
    els.backFromFindCommunitiesButton.addEventListener("click", returnToCommunities);
    if (els.headerSearchButton) els.headerSearchButton.addEventListener("click", openHeaderSearch);
    if (els.headerSearchForm) els.headerSearchForm.addEventListener("submit", (event) => event.preventDefault());
    if (els.headerSearchInput) els.headerSearchInput.addEventListener("input", (event) => {
      state.searchQuery = event.target.value;
      state.buildViewedPublicId = ""; // a new query closes any open "view details"
      runPeopleSearch(event.target.value);
      runBuildCommunitySearch(event.target.value);
      renderHeaderSearchResults();
    });
    // The standalone Friends header icon was removed — friend requests are surfaced (and
    // accepted/declined) in the bell, and the followers/following list lives on Profile.
    if (els.headerChatsButton) els.headerChatsButton.addEventListener("click", openChats);
    if (els.backFromFriendsButton) els.backFromFriendsButton.addEventListener("click", returnToDashboard);
    if (els.friendsAddButton) els.friendsAddButton.addEventListener("click", openAddFriendFromFriends);
    if (els.backFromFriendActivityButton) els.backFromFriendActivityButton.addEventListener("click", returnToFriends);
    if (els.friendsList) els.friendsList.addEventListener("click", (event) => {
      const row = event.target.closest && event.target.closest("[data-friend-open]");
      // Open the friend's full profile (same path as the feed), not the old
      // "What <name> logged today" shared-activity screen.
      if (row) openUserProfile(row.dataset.friendOpen);
    });
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
    els.ccAddAnotherRuleButton.addEventListener("click", openCommunityDraftRuleForm);
    els.ccRuleTypeInput.addEventListener("change", updateCcRuleBuilderVisibility);
    els.ccRuleDataSourceInput.addEventListener("change", () => {
      els.ccRuleSourceMetricInput.innerHTML = renderSourceMetricOptionHtml(els.ccRuleDataSourceInput.value || "manual", "");
    });
    els.cancelCcRuleEditButton.addEventListener("click", () => {
      editingCommunityDraftRuleId = "";
      communityDraftRuleFormOpen = false;
      communityDraftJustAddedId = "";
      resetCommunityDraftRuleForm();
      renderCreateCommunity();
    });

    els.saveProfileButton.addEventListener("click", saveProfile);
    if (els.profileBioInput) els.profileBioInput.addEventListener("input", updateBioCounter);
    bindProfileAvatarControls();
    if (els.profileSignOutButton) els.profileSignOutButton.addEventListener("click", () => {
      Promise.resolve(window.PointwellAuth && window.PointwellAuth.signOut && window.PointwellAuth.signOut()).catch(() => {});
    });
    if (els.backFromProfileEditButton) els.backFromProfileEditButton.addEventListener("click", backFromProfileEdit);
    if (els.onboardingScreen) els.onboardingScreen.addEventListener("click", handleOnboardingClick);
    if (els.onboardingScreen) els.onboardingScreen.addEventListener("keydown", handleOnboardingKeydown);
    if (els.onboardingScreen) els.onboardingScreen.addEventListener("input", handleOnboardingInput);
    if (els.onboardingScreen) els.onboardingScreen.addEventListener("change", handleOnboardingChange);
    if (els.notifBellButton) els.notifBellButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleNotifPanel();
    });
    if (els.notifPanel) els.notifPanel.addEventListener("click", (event) => {
      const t = event.target;
      const friendAccept = t.closest && t.closest("[data-notif-friend-accept]");
      const friendDecline = t.closest && t.closest("[data-notif-friend-decline]");
      const joinAccept = t.closest && t.closest("[data-notif-join-accept]");
      const joinDecline = t.closest && t.closest("[data-notif-join-decline]");
      const markAll = t.closest && t.closest("[data-notif-mark-all]");
      const openPost = t.closest && t.closest("[data-notif-post]");
      const open = t.closest && t.closest("[data-notif-open]");
      if (friendAccept) respondToFriendRequest(friendAccept.dataset.notifFriendAccept, true);
      else if (friendDecline) respondToFriendRequest(friendDecline.dataset.notifFriendDecline, false);
      else if (joinAccept) respondToRequest(joinAccept.dataset.notifJoinAccept, true);
      else if (joinDecline) respondToRequest(joinDecline.dataset.notifJoinDecline, false);
      else if (markAll) markBellNotificationsRead();
      else if (openPost) { openPostFromNotif(openPost.dataset.notifPost); }
      else if (open) {
        closeNotifPanel();
        openChatConversation(open.dataset.notifOpen, open.dataset.notifName, "");
        state.activeView = "chats";
        saveState();
        render();
      }
    });
    if (els.chatsMarkAllButton) els.chatsMarkAllButton.addEventListener("click", markAllSignalsRead);
    if (els.chatsNewMessageButton) els.chatsNewMessageButton.addEventListener("click", () => toggleChatsPanel("new-message"));
    if (els.chatsAddFriendButton) els.chatsAddFriendButton.addEventListener("click", () => toggleChatsPanel("add-friend"));
    if (els.chatsNewMessageInput) els.chatsNewMessageInput.addEventListener("input", (event) => runMessageSearch(event.target.value));
    if (els.chatsAddFriendInput) els.chatsAddFriendInput.addEventListener("input", (event) => runFriendSearch(event.target.value));
    if (els.chatsNewMessageResults) els.chatsNewMessageResults.addEventListener("click", (event) => {
      const t = event.target.closest && event.target.closest("[data-message-person]");
      if (t) { openConversationFromPanel(t.dataset.messagePerson, t.dataset.messageName); return; }
      // Anywhere else on the row → open that person's profile (same path as the feed).
      const row = event.target.closest && event.target.closest("[data-open-profile-user]");
      if (row) openUserProfile(row.dataset.openProfileUser);
    });
    if (els.chatsAddFriendResults) els.chatsAddFriendResults.addEventListener("click", (event) => {
      const add = event.target.closest && event.target.closest("[data-friend-add]");
      const acceptUser = event.target.closest && event.target.closest("[data-friend-accept-user]");
      // Action button takes precedence and never opens the profile.
      if (add) { sendFriendRequestTo(add.dataset.friendAdd, add.dataset.friendName); return; }
      if (acceptUser) { acceptFriendByUser(acceptUser.dataset.friendAcceptUser); return; }
      // Anywhere else on the row → open that person's profile (same path as the feed).
      const row = event.target.closest && event.target.closest("[data-open-profile-user]");
      if (row) openUserProfile(row.dataset.openProfileUser);
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
  }

  function render() {
    // An open post overlay floats over the current screen; a navigation that changed the view dismisses it
    // (background re-renders that keep the same view leave it intact). Tap-out/X/swipe/Esc close it directly.
    if (postOverlayItem && state.activeView !== postOverlayOpenView) closePostOverlay();
    renderChrome();
    renderActiveView();
    renderDashboard();
    renderSystems();
    renderDiscover();
    renderFeed();
    renderCommunities();
    renderCreateCommunity();
    renderCommunitySettings();
    renderCommunityMemberActivity();
    renderFindCommunities();
    renderFriends();
    renderFriendActivity();
    renderProfilePage();
    renderProfile();
    renderNotifications();
    renderCoachLauncher();
    renderWearablePrompt();
    pushMyBehindStatus();
    // Load signed-URL thumbnails for any entry photos rendered this pass (the helper
    // skips ones already loaded; Storage policy decides if each is actually viewable).
    bindEntryPhotos(document);
  }

  function renderChrome() {
    if (!els.views[state.activeView]) state.activeView = "dashboard";
    const ownProfileActive = state.activeView === "profile"
      || (state.activeView === "profile-page" && !!(state.account && String(state.profileUserId) === String(state.account.userId)));
    els.tabs.forEach((tab) => {
      const isActive = tab.dataset.view === "profile-page"
        // The Profile tab is active only for YOUR OWN profile/settings — not when viewing
        // someone else's profile-page (opened from the feed/leaderboard).
        ? ownProfileActive
        : (tab.dataset.view === state.activeView
          || ((state.activeView === "add-entry" || state.activeView === "customize-top-card" || state.activeView === "customize-charts") && tab.dataset.view === "dashboard"));
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-current", isActive ? "page" : "false");
    });
    Object.entries(els.views).forEach(([name, view]) => {
      view.classList.toggle("is-visible", name === state.activeView);
    });

    const myAvatar = state.profile.avatarUrl || "";
    paintAvatarNode(els.profileAvatar, state.profile.name, myAvatar);
    paintAvatarNode(els.largeAvatar, state.profile.name, myAvatar);
    if (els.headerChatsButton) els.headerChatsButton.classList.toggle("is-active", state.activeView === "chats");
    if (els.headerTitle) els.headerTitle.textContent = headerTitleForView(state.activeView);
    els.todayLabel.textContent = formatDate(todayIso);
  }

  // Contextual header title — reflects the active view (mirrors the bottom-tab wayfinding).
  // Sub-views map to their parent tab (e.g. Add Entry / a world detail → "Today").
  function headerTitleForView(view) {
    switch (view) {
      case "feed": return "Feed";
      case "systems": return "Build";
      case "profile": case "profile-page": return "Profile";
      case "chats": return "Chats";
      case "friends": case "friend-activity": return "Friends";
      case "search": return "Search";
      case "communities": case "find-communities": return "Communities";
      default: return "Today"; // dashboard, add-entry, customize-*, community-detail/settings, …
    }
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
    pendingBuildMode = "";
  }

  // Public-community results for the Build search — reuses the existing community
  // name search (PointwellSignals.searchCommunities) with a local fallback.
  function runBuildCommunitySearch(rawQuery) {
    const q = String(rawQuery || "").trim();
    if (q.length < 2) {
      buildCommunityResults = [];
      refreshSearchSurfaces();
      return;
    }
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.searchCommunities !== "function") {
      buildCommunityResults = getVisiblePublicCommunities(q);
      refreshSearchSurfaces();
      return;
    }
    Promise.resolve(window.PointwellSignals.searchCommunities(q)).catch(() => []).then((rows) => {
      buildCommunityResults = Array.isArray(rows) ? rows : [];
      refreshSearchSurfaces();
    });
  }

  // "Your Communities" list on the Build & Edit home — communities I own or belong to.
  function renderBuildCommunities() {
    if (!els.buildCommunityList) return;
    const communities = Array.isArray(state.communities) ? state.communities : [];
    els.buildCommunityList.innerHTML = communities.length
      ? communities.map(renderBuildCommunityCard).join("")
      : emptyState("No communities yet. Start one above, or turn a system into a community with Invite people.");
    Array.from(els.buildCommunityList.querySelectorAll("[data-open-community-id]")).forEach((button) => {
      button.addEventListener("click", () => openBuildCommunity(button.dataset.openCommunityId, "detail"));
    });
    Array.from(els.buildCommunityList.querySelectorAll("[data-edit-community-id]")).forEach((button) => {
      button.addEventListener("click", () => openBuildCommunity(button.dataset.editCommunityId, "settings"));
    });
  }

  function renderBuildCommunityCard(community) {
    const visibility = communityVisibility(community);
    return `
      <article class="system-card" data-community-id="${escapeHtml(community.id)}">
        <div class="system-card-main">
          <strong>${escapeHtml(community.name)}</strong>
          <span class="system-meta">${escapeHtml(visibilityLabel(visibility))} · ${plural(getCommunityMemberCount(community), "member")}</span>
        </div>
        <div class="system-card-actions">
          <span class="visibility-pill ${visibility === "request_to_join" ? "request" : escapeHtml(visibility)}">${escapeHtml(visibilityLabel(visibility))}</span>
          <button class="secondary-button small" type="button" data-edit-community-id="${escapeHtml(community.id)}">Edit</button>
          <button class="ghost-button small" type="button" data-open-community-id="${escapeHtml(community.id)}">Open</button>
        </div>
      </article>
    `;
  }

  // Open a community from the Build list → its detail view, or its settings editor.
  function openBuildCommunity(communityId, where) {
    if (!state.communities.some((item) => item.id === communityId)) return;
    leaveConfirmOpen = false; // start the Settings danger zone un-confirmed on every fresh entry
    state.selectedCommunityId = communityId;
    state.activeView = where === "settings" ? "community-settings" : "community-detail";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  // Finding/joining communities now lives in the universal header search (the Communities tab
  // was removed). Any remaining "find communities" entry point routes there.
  function openFindCommunities() {
    openHeaderSearch();
  }

  // "Back" from a community detail/settings now lands on Today (the Communities tab is gone).
  function returnToCommunities() {
    state.activeView = "dashboard";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function returnToCommunityDetail() {
    state.worldDetailType = "community";
    state.activeView = "community-detail";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openCommunitySettings() {
    if (!getSelectedCommunity()) return;
    leaveConfirmOpen = false; // always start the danger zone un-confirmed
    state.activeView = "community-settings";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openCommunityFromScore() {
    const context = getActiveScoreContext();
    if (context.type !== "community" || !context.community) return;
    state.worldDetailType = "community";
    state.selectedCommunityId = context.community.id;
    state.worldDetailType = "community";
    state.activeView = "community-detail";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  // Personal-context counterpart to openCommunityFromScore: jump straight to the
  // Build editor for the system currently selected in the score switcher.
  function editSystemFromScore() {
    const context = getActiveScoreContext();
    if (context.type === "community" || !context.system) return;
    state.activeView = "systems";
    state.selectedSystemId = context.system.id;
    state.editingRuleId = "";
    state.systemSetupStep = 0;
    state.systemEditorOpen = true;
    saveState();
    render();
    openSelectedSystemEditor();
  }

  function viewCommunityLeaderboardFromScore() {
    const context = getActiveScoreContext();
    if (context.type !== "community" || !context.community) return;
    state.selectedCommunityId = context.community.id;
    state.worldDetailType = "community";
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

  // A leaderboard row → open that member's FULL profile (same as tapping someone in the
  // feed), carrying the community context so the profile shows a "Today in <community>"
  // section. Real members route by their user id; demo members (no user id) fall back to
  // the local member-day view so they still work.
  function openMemberProfile(community, memberId) {
    if (!community) return;
    const member = (community.members || []).find((m) => String(m.id) === String(memberId))
      || (community.members || []).find((m) => String(m.userId) === String(memberId));
    if (!member) return; // unknown member id — never silently open someone else's activity
    if (member.userId) {
      state.selectedCommunityMemberId = member.id; // keep the leaderboard row highlight in sync
      openUserProfile(member.userId, community.id);
      return;
    }
    state.selectedCommunityId = community.id;
    openCommunityMemberActivity(member.id); // demo member without a real profile
  }

  // Home Standings row tapped → open that member's full profile in the score-context
  // community. Only ever this one shared community's data, so visibility is preserved.
  function openStandingsMember(memberId) {
    const context = getActiveScoreContext();
    if (context.type !== "community" || !context.community) return;
    state.selectedCommunityId = context.community.id;
    openMemberProfile(context.community, memberId);
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
    resetAddEntryAttachment(); // each Add Entry starts with a clean message/photo
    resetQuickLog();           // ...and a clean quick-log box
    aiPrefilledComposer = false; // a fresh manual open is not AI-prefilled
    composerSourceTag = "";      // ...and carries no "via Fitbit" tag
    state.activeView = "add-entry";
    saveState();
    render();
    requestAnimationFrame(() => {
      // The AI quick-log box is the primary path; focus it first, manual is the fallback.
      (els.quickLogInput || els.dailyInputList.querySelector("[data-add-entry-rule]"))?.focus();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  // PART B — turn a synced entry (or a Fitbit workout) into a full post: open the EXISTING
  // composer pre-filled with the rule + value in its own context, tagged so the posted entry
  // keeps a "via Fitbit" badge. Reuses prefillComposerFromQuickLog's seam entirely; the user
  // just adds an optional photo/caption and taps the normal Post button.
  function upgradeSyncedEntryToPost(contextType, contextId, ruleId, amount, viaSource) {
    const ok = prefillComposerFromQuickLog({
      contextType: contextType === "community" ? "community" : "personal",
      contextId,
      ruleId,
      amount: numberOrDefault(amount, 0)
    });
    if (!ok) { showToast("Couldn't open that entry"); return; }
    aiPrefilledComposer = false;             // show the "via" note, not the AI note
    composerSourceTag = REAL_WEARABLE_SOURCES.has(viaSource) ? viaSource : "";
    render(); // re-render the add-entry panel so the source note + tag take effect
  }

  function returnToDashboard() {
    state.activeView = "dashboard";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  // ── Friends view + a friend's today activity ───────────────────────────────
  // Open the friends list (reached from the Today top-left "Friends" button).
  // Open the Chats view from the header Chats icon (Chats is no longer a nav tab).
  function openChats() {
    state.activeView = "chats";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (signalsReady()) refreshInbox();
  }

  function openFriends() {
    state.activeView = "friends";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (!signalsReady()) return;
    refreshInbox(); // refresh friend names + pending badge from server truth
    // Load which friends have visible activity today (the "active today" dot).
    Promise.resolve(window.PointwellSignals.getFriendsActiveToday(getTodayKey())).then((rows) => {
      friendsActiveTodayIds = new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.user_id)));
      renderFriends();
    }).catch(() => {});
  }

  function returnToFriends() {
    viewedFriend = null;
    state.activeView = "friends";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  // The friends-view "Add friend" shortcut reuses the full Chats add-friend panel
  // (search + send + incoming requests) rather than duplicating that machinery.
  function openAddFriendFromFriends() {
    state.activeView = "chats";
    chatsActivePanel = "add-friend";
    saveState();
    render();
    renderChatsPanels();
    requestAnimationFrame(() => { if (els.chatsAddFriendInput) els.chatsAddFriendInput.focus(); });
  }

  function renderFriends() {
    if (!els.friendsList) return;
    if (!signalsReady()) {
      els.friendsList.innerHTML = emptyState("Sign in to see your friends.");
      return;
    }
    els.friendsList.innerHTML = friendsDetailed.length
      ? friendsDetailed.map(renderFriendListRow).join("")
      : emptyState("No friends yet. Tap “Add friend” to send a request.");
  }

  function renderFriendListRow(f) {
    const id = escapeHtml(String(f.user_id));
    const label = f.display_name || "Friend";
    const name = escapeHtml(label);
    const handle = escapeHtml(cleanHandle(f.handle || "") || "@member");
    const active = friendsActiveTodayIds.has(String(f.user_id));
    return `
      <button class="friend-row" type="button" data-friend-open="${id}" data-friend-name="${name}">
        ${renderAvatar({ name: label, avatarUrl: f.avatar_url })}
        <span class="friend-row-main">
          <span class="friend-row-top"><strong>${name}</strong>${active ? '<span class="friend-active-dot" title="Active today" aria-label="Active today"></span>' : ""}</span>
          <span class="friend-row-handle">${handle}</span>
        </span>
        ${active ? '<span class="friend-active-label">Active today</span>' : ""}
      </button>
    `;
  }

  // Open a friend's TODAY activity. The DB function enforces the visibility rules;
  // this just fetches and renders (empty result → clean "no shared activity" state).
  function openFriendActivity(friendId, name) {
    if (!friendId) return;
    const friendRow = (friendsDetailed || []).find((f) => String(f.user_id) === String(friendId));
    viewedFriend = {
      id: String(friendId),
      name: name || rememberedPeerName(friendId) || "Friend",
      avatarUrl: (friendRow && friendRow.avatar_url) || peerAvatarUrl(friendId)
    };
    friendActivityRows = [];
    friendActivityLoading = true;
    state.activeView = "friend-activity";
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    Promise.resolve(window.PointwellSignals.getFriendTodayActivity(viewedFriend.id, getTodayKey())).then((rows) => {
      if (!viewedFriend || viewedFriend.id !== String(friendId)) return; // navigated away
      friendActivityRows = Array.isArray(rows) ? rows : [];
      friendActivityLoading = false;
      renderFriendActivity();
    }).catch(() => {
      if (!viewedFriend || viewedFriend.id !== String(friendId)) return;
      friendActivityLoading = false;
      renderFriendActivity();
    });
  }

  function renderFriendActivity() {
    if (!els.friendActivityBody) return;
    const name = viewedFriend ? viewedFriend.name : "Friend";
    if (els.friendActivityTitle) els.friendActivityTitle.textContent = name;
    paintAvatarNode(els.friendActivityAvatar, name, viewedFriend && viewedFriend.avatarUrl);
    if (els.friendActivitySubtitle) {
      els.friendActivitySubtitle.textContent = friendActivityLoading
        ? "Loading today’s activity…"
        : `What ${name} logged today`;
    }
    if (!viewedFriend) { els.friendActivityBody.innerHTML = ""; return; }
    if (friendActivityLoading) { els.friendActivityBody.innerHTML = emptyState("Loading…"); return; }
    if (!friendActivityRows.length) {
      // PRIVATE friend with no shared community, or simply nothing logged today.
      els.friendActivityBody.innerHTML = emptyState("No shared activity today.");
      return;
    }
    // Group the visible rows by community.
    const byCommunity = new Map();
    friendActivityRows.forEach((r) => {
      const key = String(r.community_id);
      if (!byCommunity.has(key)) byCommunity.set(key, { id: r.community_id, name: r.community_name || "Community", rules: [] });
      byCommunity.get(key).rules.push(r);
    });
    els.friendActivityBody.innerHTML = Array.from(byCommunity.values()).map(renderFriendActivityCommunity).join("");
  }

  function renderFriendActivityCommunity(group) {
    const name = escapeHtml(group.name);
    const rows = group.rules.map((r) => {
      const ruleLabel = escapeHtml(friendActivityRuleLabel(r.community_id, r.rule_id));
      const amount = escapeHtml(formatActivityAmount(r.amount));
      return `<li class="friend-activity-rule"><span class="friend-activity-rule-label">${ruleLabel}</span><span class="friend-activity-amount">${amount}</span></li>`;
    }).join("");
    return `
      <section class="friend-activity-community">
        <h3>${name}</h3>
        <ul class="friend-activity-rules">${rows}</ul>
      </section>
    `;
  }

  // Resolve a rule_id to its label using the viewer's own copy of the community's
  // scoring rules (available for communities the viewer is in). For a public friend's
  // community the viewer isn't in, fall back to the raw rule id.
  function friendActivityRuleLabel(communityId, ruleId) {
    const community = (state.communities || []).find((c) => String(c.id) === String(communityId));
    const rule = community && community.system && Array.isArray(community.system.rules)
      ? community.system.rules.find((r) => String(r.id) === String(ruleId))
      : null;
    return (rule && rule.label) || String(ruleId || "Activity");
  }

  function formatActivityAmount(amount) {
    const n = Number(amount);
    if (!isFinite(n)) return String(amount == null ? "" : amount);
    return formatCount(n);
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
      ${communityOptions ? `<optgroup label="Communities">${communityOptions}</optgroup>` : ""}
      ${personalOptions ? `<optgroup label="Personal">${personalOptions}</optgroup>` : ""}
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
      ${communityOptions ? `<optgroup label="Communities">${communityOptions}</optgroup>` : ""}
      <optgroup label="Personal Reward Systems">${systemOptions}</optgroup>
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
    // Manual logs ADD on top of the synced value (and of each other). A "materialized" post
    // of the synced value (viaSource — the Part B share) already equals it, so for that rule
    // the synced base is dropped to avoid double-counting.
    const manual = {};
    getCommunityEntriesForMemberOnDate(communityId, userId, date).forEach((entry) => {
      if (entry.viaSource) return; // synced/materialized entries are superseded by syncProgress
      manual[entry.ruleId] = numberOrDefault(manual[entry.ruleId], 0) + numberOrDefault(entry.amount, 0);
    });
    (community?.system?.rules || []).forEach((item) => {
      const rule = scoring.normalizeRule(item);
      // Synced contribution per the incremental model; hand-logged entries add on top.
      values[rule.id] = syncedContribution(rule, { userId, date }) + numberOrDefault(manual[rule.id], 0);
    });
    Object.keys(manual).forEach((ruleId) => {
      if (!(ruleId in values)) values[ruleId] = manual[ruleId];
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

  function addCommunityEntry(communityId, userId, rule, amount, source = "manual", message = "", photoPath = "", viaSource = "") {
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
      message: message || "",
      photoPath: photoPath || "",
      source,
      viaSource: viaSource || ""
    });
  }

  function deleteCommunityEntry(entryId, toastMsg) {
    const entry = (state.communityEntries || []).find((item) => item.id === entryId);
    if (!entry) return;
    state.communityEntries = (state.communityEntries || []).filter((item) => item.id !== entryId);
    const community = state.communities.find((item) => item.id === entry.communityId);
    if (community) saveCommunitySummaryForMember(community, entry.userId);
    saveState();
    render();
    showToast(toastMsg || "Community entry removed");
  }

  // ── Delete-on-posts (author-only) ──────────────────────────────────────────
  // The feed ⋯ menu's "Delete post" opens a styled confirm (honest about points). On confirm we
  // delete the community_entries row in the DB (author-only "entries delete own" RLS is the real
  // guard), then drop it from state.communityEntries + re-render so it disappears from feed /
  // community / profile and the leaderboard recomputes. Local-only (demo) posts skip the DB call.
  function openDeletePostConfirm(entryId) {
    if (!entryId) return;
    closeDeletePostConfirm();
    const menuRoot = activeFeedRoot();
    if (menuRoot) Array.from(menuRoot.querySelectorAll(".ig-menu-pop")).forEach((p) => { p.hidden = true; });
    const back = document.createElement("div");
    back.className = "post-confirm-backdrop";
    back.setAttribute("data-postdel-backdrop", "");
    back.innerHTML = `
      <div class="post-confirm-card" role="dialog" aria-modal="true" aria-labelledby="postdel-title">
        <div class="post-confirm-ico" aria-hidden="true">🗑</div>
        <strong id="postdel-title">Delete this post?</strong>
        <p>This removes the post and the points it logged. This can't be undone.</p>
        <div class="post-confirm-btns">
          <button type="button" class="ghost-button" data-postdel-cancel>Cancel</button>
          <button type="button" class="post-confirm-delete" data-postdel-confirm>Delete</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.addEventListener("click", (e) => { if (e.target === back) closeDeletePostConfirm(); });
    const cancel = back.querySelector("[data-postdel-cancel]");
    if (cancel) cancel.addEventListener("click", closeDeletePostConfirm);
    const confirm = back.querySelector("[data-postdel-confirm]");
    if (confirm) confirm.addEventListener("click", (e) => confirmDeletePost(entryId, e.currentTarget));
  }

  function closeDeletePostConfirm() {
    const back = document.querySelector("[data-postdel-backdrop]");
    if (back) back.remove();
  }

  function confirmDeletePost(entryId, btn) {
    const entry = (state.communityEntries || []).find((item) => item.id === entryId);
    if (!entry) { closeDeletePostConfirm(); return; }
    const cancelBtn = document.querySelector("[data-postdel-cancel]");
    if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }   // in-flight: block double-submit
    if (cancelBtn) cancelBtn.disabled = true;
    const finishLocal = () => { closeDeletePostConfirm(); deleteCommunityEntry(entryId, "Post deleted"); };
    const fail = (msg) => {
      if (btn) { btn.disabled = false; btn.textContent = "Delete"; } // keep the post; let them retry
      if (cancelBtn) cancelBtn.disabled = false;
      showToast(msg || "Couldn't delete the post");
    };
    const uid = state.account && state.account.userId;
    const canDb = signalsReady() && isDbEntryId(entryId) && window.PointwellSignals
      && typeof window.PointwellSignals.deleteCommunityEntry === "function";
    if (!canDb) { finishLocal(); return; }   // local/demo post — no DB row to delete
    Promise.resolve(window.PointwellSignals.deleteCommunityEntry(entryId, uid)).then((res) => {
      if (res && res.error) { fail(communityDbError(res.error, "Couldn't delete the post")); return; }
      finishLocal();
    }).catch(() => fail("Couldn't delete the post"));
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

  // ════════════════════════════════════════════════════════════════════════════
  // BUBBLE-TILE HOME (Phase 1) — the Today body is a grid of "world" tiles, one per
  // community the user belongs to + one per personal system. Each tile shows the world's
  // name + today's score ring (your points vs the world's daily target). The top two are
  // featured (large): a big community tile shows a mini leaderboard (reusing
  // communityStandings); a big personal tile shows "X to go". Tapping a tile opens that
  // world via the EXISTING handlers (no new detail views). The header + "+" FAB are kept.
  // Reuses communityTarget/communityMemberPointsOnDate/communityStandings (community) and
  // todayValuesForSystem/calculateDashboardSummary (personal) + the score-ring markup.
  // ════════════════════════════════════════════════════════════════════════════
  function worldTileKey(t) { return t.type + ":" + t.id; }

  // Phase 2 drag-reorder state (long-press on touch / click-drag on desktop).
  const worldDrag = { key: null, pointerId: null, startX: 0, startY: 0, started: false, longPress: null, ghost: null, ghostDX: 0, ghostDY: 0, placeholder: null, suppressClick: false };

  function buildWorldTiles() {
    const tiles = [];
    (state.communities || []).forEach((community) => {
      const me = (community.members || []).find((m) => m.id === "me");
      const target = communityTarget(community);
      const myPoints = me ? communityMemberPointsOnDate(community, me, todayIso) : 0;
      tiles.push({ type: "community", id: community.id, name: community.name || "Community", myPoints: myPoints, target: target, percent: progressPercent(myPoints, target), community: community, coverPath: community.coverUrl || community.cover_url || "", iconPath: community.iconUrl || community.icon_url || "", ownerIsMe: isCommunityAdmin(community) });
    });
    (state.systems || []).forEach((rawSystem) => {
      const system = normalizeSystem(rawSystem);
      const values = todayValuesForSystem(system);
      const summary = calculateDashboardSummary(system, values);
      const myPoints = roundScore(summary.total);
      const target = numberOrDefault(summary.target && summary.target.total, 0);
      tiles.push({ type: "personal", id: rawSystem.id, name: rawSystem.title || "System", myPoints: myPoints, target: target, percent: progressPercent(myPoints, target), toGo: Math.max(target - myPoints, 0), coverPath: rawSystem.coverUrl || "", iconPath: rawSystem.iconUrl || "", ownerIsMe: true });
    });
    return applyWorldLayout(tiles);
  }

  // Order: if the user has dragged tiles (state.homeLayout.order, Phase 2), honor that;
  // otherwise default to communities first (by today's points desc), then personal systems
  // (by points desc). Each tile's SIZE is explicit + persisted (worldTileSize), not derived.
  function applyWorldLayout(tiles) {
    const layout = state.homeLayout;
    if (layout && Array.isArray(layout.order) && layout.order.length) {
      const byKey = {};
      tiles.forEach((t) => { byKey[worldTileKey(t)] = t; });
      const ordered = [];
      layout.order.forEach((k) => { if (byKey[k]) { ordered.push(byKey[k]); delete byKey[k]; } });
      Object.keys(byKey).forEach((k) => ordered.push(byKey[k])); // newly-joined worlds at the end
      return ordered;
    }
    const score = (t) => numberOrDefault(t.myPoints, 0);
    return tiles.slice().sort((a, b) => {
      if (a.type !== b.type) return a.type === "community" ? -1 : 1;
      return score(b) - score(a);
    });
  }

  // ── Per-tile SIZE (small · medium · large), persisted per user ────────────────
  // Size is now EXPLICIT (not position-derived): hold-drag reorders, the ⤢ control cycles
  // size. Default = a single hero (first tile large) + the rest as a compact small grid.
  const WORLD_SIZES = ["small", "medium", "large"];
  function worldLayout() {
    state.homeLayout = state.homeLayout || {};
    state.homeLayout.sizes = state.homeLayout.sizes || {};
    state.homeLayout.sections = state.homeLayout.sections || {};
    return state.homeLayout;
  }
  function worldTileSize(key, index) {
    const saved = worldLayout().sizes[key];
    if (WORLD_SIZES.indexOf(saved) > -1) return saved;
    return index === 0 ? "large" : "small";
  }
  function setWorldTileSize(key, size) {
    if (WORLD_SIZES.indexOf(size) === -1) return;
    worldLayout().sizes[key] = size;
    saveState();
    renderWorldGrid();
  }
  function worldTileFromKey(key) {
    return buildWorldTiles().find((t) => worldTileKey(t) === key) || null;
  }

  // ── Large-widget SECTIONS — default Leaderboard → Recent posts, add/remove inline ──
  const WORLD_SECTION_DEFS = {
    lb:       { label: "Leaderboard",      chip: "+ Leaderboard",      types: ["community"] },
    posts:    { label: "Recent posts",     chip: "+ Posts",            types: ["community"] },
    members:  { label: "Members",          chip: "+ Members",          types: ["community"] },
    trend:    { label: "Week trend",       chip: "+ Trend",            types: ["community", "personal"] },
    schedule: { label: "Today's schedule", chip: "+ Today's schedule", types: ["community", "personal"] },
  };
  const WORLD_SECTION_ORDER = ["lb", "posts", "members", "trend", "schedule"];
  function worldSectionApplies(t, key) {
    const def = WORLD_SECTION_DEFS[key];
    if (!def || def.types.indexOf(t.type) === -1) return false;
    if (key === "lb") {
      const modules = (t.community && t.community.analytics && t.community.analytics.modules) || {};
      if (modules.leaderboard === false) return false;
    }
    return true;
  }
  function worldDefaultSections(t) {
    return t.type === "community" ? ["lb", "posts"] : ["schedule", "trend"];
  }
  function worldSectionsFor(t) {
    const saved = worldLayout().sections[worldTileKey(t)];
    const list = Array.isArray(saved) ? saved.slice() : worldDefaultSections(t);
    return list.filter((k) => worldSectionApplies(t, k));
  }
  function addWorldSection(key, sec) {
    const t = worldTileFromKey(key);
    if (!t || !worldSectionApplies(t, sec)) return;
    const list = worldSectionsFor(t);
    if (list.indexOf(sec) === -1) list.push(sec);
    worldLayout().sections[key] = list;
    saveState();
    renderWorldGrid();
  }
  function removeWorldSection(key, sec) {
    const t = worldTileFromKey(key);
    if (!t) return;
    worldLayout().sections[key] = worldSectionsFor(t).filter((k) => k !== sec);
    saveState();
    renderWorldGrid();
  }

  // Compact "Xh ago" for a post timestamp or dateKey (reuses entry timestamps; no new data).
  function worldAgo(ts) {
    if (!ts) return "";
    const then = /^\d{4}-\d{2}-\d{2}$/.test(String(ts)) ? new Date(ts + "T12:00:00") : new Date(ts);
    const ms = Date.now() - then.getTime();
    if (!Number.isFinite(ms)) return "";
    const min = Math.round(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    const hr = Math.round(min / 60);
    if (hr < 24) return hr + "h ago";
    return Math.round(hr / 24) + "d ago";
  }

  // Standings / rank / active-count helpers (reuse communityStandings).
  function worldStandings(community) {
    try { return communityStandings(community, COMMUNITY_PERIODS[0].id, "points"); } catch (e) { return []; }
  }
  function worldMyRank(community) {
    const idx = worldStandings(community).findIndex((m) => m.id === "me");
    return idx >= 0 ? idx + 1 : 0;
  }
  function worldActiveToday(community) {
    return worldStandings(community).filter((m) => numberOrDefault(m.today, 0) > 0).length;
  }

  function renderWorldGrid() {
    const mount = els.worldGrid;
    if (!mount) return;
    if (worldDrag.started) return; // never rebuild mid-drag — it would drop the ghost/placeholder
    const tiles = buildWorldTiles();
    if (els.worldGridHint) els.worldGridHint.hidden = tiles.length < 1;
    // Slim section header shows the world count as a small muted number ("Your worlds  5").
    if (els.worldCount) els.worldCount.textContent = tiles.length ? String(tiles.length) : "";
    const addTile = `<div class="world-tile world-add" role="button" tabindex="0" data-world-add aria-label="Add a world">
        <span class="world-add-plus" aria-hidden="true">+</span>
        <span class="world-add-label">${tiles.length ? "New" : "Create your first world"}</span>
      </div>`;
    if (!tiles.length) { mount.innerHTML = addTile; return; }
    mount.innerHTML = tiles.map((t, i) => renderWorldTile(t, worldTileSize(worldTileKey(t), i))).join("") + addTile;
    paintWorldTilesMedia(tiles);
  }

  // The SAME circular progress ring on every tile/size: a donut with "X/Y" centered inside.
  // Per-type colour comes from CSS (.tile-community / .tile-personal stroke the fill green/purple).
  function renderWorldRing(t, size) {
    const target = numberOrDefault(t.target, 0);
    const pct = Math.min(Math.max(numberOrDefault(t.percent, 0), 0), 100);
    // No target yet (e.g. a system with no rules) → show just the points, never "X/0".
    const label = target > 0
      ? `${escapeHtml(formatPoints(t.myPoints))}/${escapeHtml(formatPoints(target))}`
      : `${escapeHtml(formatPoints(t.myPoints))}`;
    return `<div class="score-ring world-ring world-ring-${size}" aria-hidden="true">
        <svg class="score-ring-svg" viewBox="0 0 44 44">
          <circle class="score-ring-bg" cx="22" cy="22" r="19"></circle>
          <circle class="score-ring-fill" cx="22" cy="22" r="19" pathLength="100" style="stroke-dashoffset:${100 - pct}"></circle>
        </svg>
        <strong class="score-ring-label">${label}</strong>
      </div>`;
  }

  // Medium/large top stat: community → rank + active; personal → to-go.
  function renderWorldStat(t, full) {
    if (t.type === "community") {
      const rank = worldMyRank(t.community), active = worldActiveToday(t.community);
      const bits = [];
      if (rank) bits.push("Rank #" + rank);
      if (active) bits.push(active + (full ? " active today" : " active"));
      return escapeHtml(bits.join(" · ") || "community");
    }
    const toGo = numberOrDefault(t.toGo, 0);
    return toGo > 0 ? escapeHtml(formatPoints(toGo) + (full ? " to go today" : " to go")) : "Goal hit today 🎉";
  }

  // Slim cover strip (cover_url or the per-type gradient fallback) with the world's icon
  // (icon_url or initials) overlapping its bottom — mirrors the detail-page banner. Images are
  // painted async (signed URLs) by paintWorldTilesMedia after the grid renders.
  function renderTileCover(t, size) {
    const initials = escapeHtml((getInitials(t.name) || "W").slice(0, 2));
    return `<div class="world-tile-cover world-tile-cover-${size}">
        <img class="world-tile-cover-img" alt="" hidden>
        <span class="world-tile-icon">
          <img class="world-tile-icon-img" alt="" hidden>
          <span class="world-tile-icon-fallback" aria-hidden="true">${initials}</span>
        </span>
      </div>`;
  }

  function renderWorldTile(t, size) {
    const key = worldTileKey(t);
    const typeClass = t.type === "community" ? "tile-community" : "tile-personal";
    const attrs = `data-world-type="${escapeHtml(t.type)}" data-world-id="${escapeHtml(t.id)}" data-world-key="${escapeHtml(key)}" data-world-size="${size}"`;
    const sizeBtn = `<button type="button" class="world-size-btn" data-world-size-cycle aria-label="Resize ${escapeHtml(t.name)} (small, medium, large)" title="Resize"><span aria-hidden="true">⤢</span></button>`;
    const open = `role="button" tabindex="0" aria-label="Open ${escapeHtml(t.name)}"`;
    const hasCover = !!t.coverPath;
    const initials = escapeHtml((getInitials(t.name) || "W").slice(0, 2));
    // LARGE + MEDIUM: render the cover banner ONLY when the world has a real cover photo. With no
    // cover we keep the original compact tile (ring + name inline on the solid green/purple
    // gradient, then sections) — see work/home-widget-demo.html — so the tile stays its old size.
    // An uploaded icon may still show inline next to the ring; icon-less worlds match the demo 1:1.
    const inlineIcon = (!hasCover && t.iconPath)
      ? `<span class="world-tile-icon world-tile-icon-inline"><img class="world-tile-icon-img" alt="" hidden><span class="world-tile-icon-fallback" aria-hidden="true">${initials}</span></span>`
      : "";
    if (size === "large") {
      const head = `<div class="world-tile-head world-large-head">${inlineIcon}${renderWorldRing(t, "large")}<div class="world-tile-main"><strong class="world-tile-name">${escapeHtml(t.name)}</strong><span class="world-tile-stat">${renderWorldStat(t, true)}</span></div></div>`;
      if (hasCover) {
        return `<div class="world-tile ${typeClass} size-large" ${attrs} ${open}>
            ${sizeBtn}
            ${renderTileCover(t, "large")}
            <div class="world-tile-body">${head}${renderWorldSections(t)}</div>
          </div>`;
      }
      return `<div class="world-tile ${typeClass} size-large" ${attrs} ${open}>
          ${sizeBtn}
          ${head}
          ${renderWorldSections(t)}
        </div>`;
    }
    if (size === "medium") {
      const head = `<div class="world-tile-head">${inlineIcon}${renderWorldRing(t, "medium")}<div class="world-tile-main"><strong class="world-tile-name">${escapeHtml(t.name)}</strong><span class="world-tile-stat">${renderWorldStat(t, false)}</span></div></div>`;
      if (hasCover) {
        return `<div class="world-tile ${typeClass} size-medium" ${attrs} ${open}>
            ${sizeBtn}
            ${renderTileCover(t, "medium")}
            <div class="world-tile-body">${head}${renderWorldMediumSlots(t)}</div>
          </div>`;
      }
      return `<div class="world-tile ${typeClass} size-medium" ${attrs} ${open}>
          ${sizeBtn}
          ${head}
          ${renderWorldMediumSlots(t)}
        </div>`;
    }
    // Small/collapsed tiles: cover-photo-dominant (140px). Cover fills the tile, dark bottom
    // scrim for legibility, icon top-left, ring top-right, name + a thin progress bar at the
    // bottom. Cover/icon paint async (signed URLs) via paintWorldTilesMedia; gradient + initials
    // fallback. Owner of a no-cover world sees a subtle "Add a cover ＋" nudge instead of the bar.
    const pct = Math.min(Math.max(numberOrDefault(t.percent, 0), 0), 100);
    const fillColor = t.type === "community" ? "#3ddc97" : "#9a7fe0";
    const metaLine = (!t.coverPath && t.ownerIsMe)
      ? `<span class="world-tile-stat world-tile-add-cover">Add a cover ＋</span>`
      : `<span class="world-tile-stat">${renderWorldStat(t, false)}</span><div class="world-tile-bar"><i style="width:${pct}%;background:${fillColor}"></i></div>`;
    return `<div class="world-tile ${typeClass} size-small" ${attrs} ${open}>
        ${sizeBtn}
        <div class="world-tile-cover"><img class="world-tile-cover-img" alt="" hidden></div>
        <div class="world-tile-scrim"></div>
        <div class="world-tile-inner">
          <div class="world-tile-toprow">
            <span class="world-tile-icon"><img class="world-tile-icon-img" alt="" hidden><span class="world-tile-icon-fallback" aria-hidden="true">${initials}</span></span>
            ${renderWorldRing(t, "small")}
          </div>
          <div class="world-tile-meta">
            <strong class="world-tile-name">${escapeHtml(t.name)}</strong>
            ${metaLine}
          </div>
        </div>
      </div>`;
  }

  // Paint cover/icon signed-URLs onto the rendered tiles (gradient/initials fallback stays
  // when there's no image). Reuses paintWorldMediaSlot's seq guard so stale paints drop.
  function paintWorldTilesMedia(tiles) {
    if (!els.worldGrid) return;
    const seq = ++worldTilePaintSeq;
    const stale = () => seq !== worldTilePaintSeq;
    const nodes = Array.from(els.worldGrid.querySelectorAll(".world-tile[data-world-key]"));
    (tiles || []).forEach((t) => {
      const el = nodes.find((n) => n.dataset.worldKey === worldTileKey(t));
      if (!el) return;
      paintWorldMediaSlot(t.coverPath, el.querySelector(".world-tile-cover"), el.querySelector(".world-tile-cover-img"), stale);
      paintWorldMediaSlot(t.iconPath, el.querySelector(".world-tile-icon"), el.querySelector(".world-tile-icon-img"), stale);
    });
  }

  // ── Large-widget sections (default Leaderboard → Recent posts) + the inline add bar ──
  function renderWorldSections(t) {
    const active = worldSectionsFor(t);
    const body = active.map((sec) => renderWorldSection(t, sec)).join("");
    const addable = WORLD_SECTION_ORDER.filter((sec) => worldSectionApplies(t, sec) && active.indexOf(sec) === -1);
    const chips = addable.map((sec) => `<button type="button" class="world-add-chip" data-world-add-sec="${sec}">${escapeHtml(WORLD_SECTION_DEFS[sec].chip)}</button>`).join("");
    const addbar = chips ? `<div class="world-addbar">${chips}</div>` : "";
    return `<div class="world-sections">${body}</div>${addbar}`;
  }

  function renderWorldSection(t, sec) {
    const def = WORLD_SECTION_DEFS[sec];
    return `<div class="world-section" data-world-sec="${sec}">
        <div class="world-section-head">
          <p class="world-cap">${escapeHtml(def.label)}</p>
          <button type="button" class="world-section-rm" data-world-rm-sec="${sec}">remove</button>
        </div>
        ${worldSectionBody(t, sec)}
      </div>`;
  }

  function worldSectionBody(t, sec, compact) {
    if (sec === "lb") return worldLbBody(t.community, compact ? 2 : 3);
    if (sec === "posts") return worldPostsBody(t.community, compact ? 1 : 3);
    if (sec === "members") return worldMembersBody(t.community);
    if (sec === "trend") return worldTrendBody(t);
    if (sec === "schedule") return worldScheduleBody(t, compact ? 2 : 5);
    return "";
  }

  // MEDIUM tile = header + TWO swappable mini-slots side by side. Each slot shows one section
  // and its ⇄ opens a dropdown to pick a different one. The two slots are sections[0] and
  // sections[1] (reuses the same homeLayout.sections list as the large widget), so the picks
  // persist and carry over when the tile is enlarged.
  function worldMediumSlots(t) {
    const applicable = WORLD_SECTION_ORDER.filter((k) => worldSectionApplies(t, k));
    const slots = worldSectionsFor(t).filter((k) => applicable.indexOf(k) > -1).slice(0, 2);
    applicable.forEach((k) => { if (slots.length < 2 && slots.indexOf(k) === -1) slots.push(k); });
    while (slots.length < 2) slots.push(applicable[0] || "lb"); // degenerate: fewer than 2 applicable
    return slots.slice(0, 2);
  }
  // Pick a section for one slot from its dropdown (the menu already excludes the other slot's
  // section, so the two can never duplicate). Persists; keeps any large-only extra sections.
  function setWorldSlot(key, idx, sec) {
    const t = worldTileFromKey(key);
    if (!t || !worldSectionApplies(t, sec)) return;
    const slots = worldMediumSlots(t);
    if (slots[idx] === sec) return;
    slots[idx] = sec;
    const rest = worldSectionsFor(t).filter((k) => worldSectionApplies(t, k) && k !== slots[0] && k !== slots[1]);
    worldLayout().sections[key] = slots.concat(rest);
    saveState();
    renderWorldGrid();
  }
  function closeWorldSlotMenus() {
    if (!els.worldGrid) return false;
    if (!els.worldGrid.querySelector(".world-slot-menu:not([hidden])")) return false;
    els.worldGrid.querySelectorAll(".world-slot-menu").forEach((m) => { m.hidden = true; });
    els.worldGrid.querySelectorAll("[data-world-slot-toggle]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    els.worldGrid.querySelectorAll(".world-tile.world-menu-open").forEach((el) => el.classList.remove("world-menu-open"));
    return true;
  }
  function renderWorldMediumSlots(t) {
    const applicable = WORLD_SECTION_ORDER.filter((k) => worldSectionApplies(t, k));
    const slots = worldMediumSlots(t);
    return `<div class="world-med-slots">${slots.map((sec, i) => renderWorldSlot(t, sec, i, applicable, slots[1 - i])).join("")}</div>`;
  }
  function renderWorldSlot(t, sec, idx, applicable, otherSec) {
    const def = WORLD_SECTION_DEFS[sec];
    if (!def) return `<div class="world-slot"></div>`;
    // Pickable options = applicable sections minus the OTHER slot's (current always included).
    const opts = applicable.filter((k) => k === sec || k !== otherSec);
    const swap = opts.length > 1
      ? `<div class="world-slot-swapwrap" data-world-slot-swap>
          <button type="button" class="world-slot-swap" data-world-slot-toggle aria-haspopup="true" aria-expanded="false" aria-label="Swap this slot" title="Swap section">⇄</button>
          <div class="world-slot-menu" hidden>${opts.map((k) => `<button type="button" class="world-slot-opt${k === sec ? " is-current" : ""}" data-world-slot-pick-idx="${idx}" data-world-slot-pick-sec="${k}">${escapeHtml(WORLD_SECTION_DEFS[k].label)}${k === sec ? `<span class="world-slot-check" aria-hidden="true">✓</span>` : ""}</button>`).join("")}</div>
        </div>`
      : "";
    return `<div class="world-slot" data-world-slot="${idx}">
        <div class="world-slot-head"><span class="world-cap">${escapeHtml(def.label)}</span>${swap}</div>
        ${worldSectionBody(t, sec, true)}
      </div>`;
  }

  function worldAvatarMarkup(member) {
    return renderAvatar({ className: "world-av", name: member && member.name, avatarUrl: member && member.avatarUrl, color: avatarColor((member && member.name) || "Member") });
  }

  function worldLbBody(community, limit) {
    const standings = worldStandings(community).slice(0, limit || 3);
    if (!standings.length) return `<p class="world-section-empty">No standings yet.</p>`;
    return standings.map((m, i) => {
      const me = m.id === "me";
      return `<div class="world-lb-row${me ? " is-me" : ""}">
          <span class="world-lb-rank">${i + 1}</span>
          ${worldAvatarMarkup(m)}
          <span class="world-lb-name">${me ? "You" : escapeHtml(m.name || "Member")}</span>
          <strong class="world-lb-pts">${escapeHtml(formatPoints(m.today))}</strong>
        </div>`;
    }).join("");
  }

  function worldPostsBody(community, limit) {
    const posts = (state.communityEntries || [])
      .filter((e) => e.communityId === community.id)
      .slice()
      .sort((a, b) => String(b.timestamp || b.dateKey || b.date || "").localeCompare(String(a.timestamp || a.dateKey || a.date || "")))
      .slice(0, limit || 3);
    if (!posts.length) return `<p class="world-section-empty">No posts yet — log a day to start the feed.</p>`;
    const rules = (community.system && community.system.rules || []).map(scoring.normalizeRule);
    return posts.map((e) => {
      const member = (community.members || []).find((m) => m.id === e.userId) || { name: "Member" };
      const rule = rules.find((r) => r.id === e.ruleId);
      const who = member.id === "me" ? "You" : (member.name || "Member");
      const cap = e.message ? e.message : (rule ? rule.label : "logged a day");
      return `<div class="world-post">
          ${worldAvatarMarkup(member)}
          <div class="world-post-main">
            <p class="world-post-line"><strong>${escapeHtml(who)}</strong> · ${escapeHtml(cap)}</p>
            <p class="world-post-meta">${escapeHtml(worldAgo(e.timestamp || e.dateKey || e.date))}</p>
          </div>
        </div>`;
    }).join("");
  }

  function worldMembersBody(community) {
    const members = (community.members || []).slice(0, 6);
    if (!members.length) return `<p class="world-section-empty">Just you so far.</p>`;
    const avs = members.map((m) => `<span class="world-member-av">${worldAvatarMarkup(m)}</span>`).join("");
    const more = (community.members || []).length > 6 ? `<span class="world-member-more">+${community.members.length - 6}</span>` : "";
    return `<div class="world-members">${avs}${more}</div>`;
  }

  function worldTrendBody(t) {
    const week = currentWeekDateKeys();
    const me = t.type === "community" ? (t.community.members || []).find((m) => m.id === "me") : null;
    const vals = week.map((d) => {
      if (t.type === "community") return me ? numberOrDefault(communityMemberPointsOnDate(t.community, me, d), 0) : 0;
      const e = findEntry(d, t.id);
      return e ? numberOrDefault(e.total, 0) : 0;
    });
    const max = Math.max.apply(null, vals.concat([1]));
    const today = getTodayKey();
    const bars = week.map((d, i) => `<div class="world-bar${d === today ? " is-today" : ""}" style="height:${Math.max(6, Math.round((vals[i] / max) * 100))}%"></div>`).join("");
    return `<div class="world-bars" aria-hidden="true">${bars}</div>`;
  }

  function worldScheduleBody(t, limit) {
    const sys = t.type === "community"
      ? normalizeSystem(t.community.system || { rules: [] })
      : normalizeSystem((state.systems || []).find((s) => s.id === t.id) || { rules: [] });
    const rules = (sys.rules || []).map(scoring.normalizeRule).filter((r) => r.simpleStyle !== "penalty").slice(0, limit || 5);
    if (!rules.length) return `<p class="world-section-empty">No rules yet.</p>`;
    const today = getTodayKey();
    return rules.map((r) => {
      const done = t.type === "community"
        ? (state.communityEntries || []).some((e) => e.communityId === t.id && e.userId === "me" && e.ruleId === r.id && (e.dateKey || e.date) === today)
        : ((state.quickEntries || []).some((e) => e.systemId === t.id && e.ruleId === r.id && (e.dateKey || e.date) === today) || numberOrDefault(syncedContribution(r, { date: todayIso }), 0) > 0);
      return `<div class="world-sched-row${done ? " is-done" : ""}">
          <span class="world-sched-check" aria-hidden="true">${done ? "✓" : "○"}</span>
          <span class="world-sched-name">${escapeHtml(r.label || "Rule")}</span>
        </div>`;
    }).join("");
  }

  // ── Tile taps → open that world via existing handlers (no new detail views) ──
  // Editing controls (resize / add-section / remove-section) are handled FIRST and never
  // open the world. Everything else on a tile = open.
  function onWorldGridClick(event) {
    // A click that follows a drag must not also open the tile.
    if (worldDrag.suppressClick) { worldDrag.suppressClick = false; return; }
    const t = event.target;
    const sizeCycle = t.closest("[data-world-size-cycle]");
    if (sizeCycle) {
      const tile = sizeCycle.closest("[data-world-key]");
      if (tile) setWorldTileSize(tile.dataset.worldKey, WORLD_SIZES[(WORLD_SIZES.indexOf(tile.dataset.worldSize) + 1) % WORLD_SIZES.length]);
      return;
    }
    // Medium-tile slot "⇄" → toggle its dropdown; pick a section to set that slot.
    const slotToggle = t.closest("[data-world-slot-toggle]");
    if (slotToggle) {
      const wrap = slotToggle.parentNode, menu = wrap && wrap.querySelector(".world-slot-menu");
      const willOpen = menu && menu.hidden;
      closeWorldSlotMenus();
      if (willOpen) { menu.hidden = false; slotToggle.setAttribute("aria-expanded", "true"); const tile = slotToggle.closest(".world-tile"); if (tile) tile.classList.add("world-menu-open"); }
      return;
    }
    const slotPick = t.closest("[data-world-slot-pick-sec]");
    if (slotPick) { const tile = slotPick.closest("[data-world-key]"); if (tile) setWorldSlot(tile.dataset.worldKey, Number(slotPick.dataset.worldSlotPickIdx) || 0, slotPick.dataset.worldSlotPickSec); return; }
    if (t.closest("[data-world-slot-swap]")) return; // inside the swap wrap/menu chrome — contained
    if (closeWorldSlotMenus()) return; // any other tap closes an open menu (don't open the world)
    const addSec = t.closest("[data-world-add-sec]");
    if (addSec) { const tile = addSec.closest("[data-world-key]"); if (tile) addWorldSection(tile.dataset.worldKey, addSec.dataset.worldAddSec); return; }
    const rmSec = t.closest("[data-world-rm-sec]");
    if (rmSec) { const tile = rmSec.closest("[data-world-key]"); if (tile) removeWorldSection(tile.dataset.worldKey, rmSec.dataset.worldRmSec); return; }
    if (t.closest("[data-world-add]")) { openAddWorld(); return; }
    const tile = t.closest("[data-world-id]");
    if (!tile) return;
    if (tile.dataset.worldType === "community") openWorldCommunity(tile.dataset.worldId);
    else openWorldPersonal(tile.dataset.worldId);
  }

  // Keyboard: Enter/Space on a focused tile opens it (it's role="button"). Inner controls are
  // real <button>s and fire their own click, so skip them here.
  function onWorldGridKeydown(event) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    const t = event.target;
    if (!t.closest) return;
    if (t.closest("[data-world-size-cycle],[data-world-add-sec],[data-world-rm-sec],[data-world-slot-swap]")) return;
    const tile = t.closest(".world-tile");
    if (!tile) return;
    event.preventDefault();
    if (tile.hasAttribute("data-world-add")) { openAddWorld(); return; }
    if (!tile.dataset.worldId) return;
    if (tile.dataset.worldType === "community") openWorldCommunity(tile.dataset.worldId);
    else openWorldPersonal(tile.dataset.worldId);
  }

  // ── Drag to reorder (long-press on touch / click-drag on desktop) ────────────
  // Reorder only — size is separate (the ⤢ control). Order persists in state.homeLayout.order;
  // per-tile size in state.homeLayout.sizes; per-widget sections in state.homeLayout.sections.
  function worldTilesInDom() {
    return els.worldGrid ? Array.from(els.worldGrid.querySelectorAll(".world-tile[data-world-key]")) : [];
  }

  function worldTileByKey(key) {
    return worldTilesInDom().find((el) => el.dataset.worldKey === key) || null;
  }

  function commitWorldOrder() {
    const order = worldTilesInDom().map((el) => el.dataset.worldKey);
    state.homeLayout = state.homeLayout || {};
    state.homeLayout.order = order; // top two => featured; size follows position
    saveState();
  }

  function worldDragMoveGhost(x, y) {
    if (worldDrag.ghost) {
      worldDrag.ghost.style.left = (x - worldDrag.ghostDX) + "px";
      worldDrag.ghost.style.top = (y - worldDrag.ghostDY) + "px";
    }
  }

  function worldDragBegin(tile, x, y) {
    worldDrag.started = true;
    worldDrag.placeholder = tile;
    tile.classList.add("is-dragging");
    if (els.worldGrid) els.worldGrid.classList.add("is-reordering"); // uniform sizes → no resize jank
    const rect = tile.getBoundingClientRect();
    const ghost = tile.cloneNode(true);
    ghost.classList.add("world-ghost");
    ghost.classList.remove("is-dragging");
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    worldDrag.ghostDX = x - rect.left;
    worldDrag.ghostDY = y - rect.top;
    document.body.appendChild(ghost);
    worldDrag.ghost = ghost;
    worldDragMoveGhost(x, y);
  }

  function worldDragOver(x, y) {
    if (!worldDrag.placeholder || !els.worldGrid) return;
    const under = document.elementFromPoint(x, y);
    if (!under) return;
    const tile = under.closest && under.closest(".world-tile[data-world-key]");
    if (!tile || tile === worldDrag.placeholder) return;
    const rect = tile.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    // Same row → decide by X; different row → decide by Y.
    const before = (Math.abs(y - midY) <= rect.height / 2) ? (x < rect.left + rect.width / 2) : (y < midY);
    els.worldGrid.insertBefore(worldDrag.placeholder, before ? tile : tile.nextSibling);
  }

  function worldDragEnd(commit) {
    if (worldDrag.longPress) { clearTimeout(worldDrag.longPress); worldDrag.longPress = null; }
    const wasDragging = worldDrag.started;
    if (worldDrag.ghost && worldDrag.ghost.parentNode) worldDrag.ghost.parentNode.removeChild(worldDrag.ghost);
    if (worldDrag.placeholder) worldDrag.placeholder.classList.remove("is-dragging");
    if (els.worldGrid) els.worldGrid.classList.remove("is-reordering");
    worldDrag.ghost = null;
    worldDrag.placeholder = null;
    worldDrag.started = false;
    worldDrag.key = null;
    worldDrag.pointerId = null;
    if (wasDragging) {
      if (commit) commitWorldOrder();
      // Swallow the click that fires right after pointerup. Re-rendering can drop that
      // synthesized click, so also auto-clear shortly after so the next tap isn't eaten.
      worldDrag.suppressClick = true;
      setTimeout(() => { worldDrag.suppressClick = false; }, 60);
      renderWorldGrid(); // re-render with real sizes (top two large) from the new order
    }
  }

  function onWorldGridPointerDown(event) {
    if (event.button != null && event.button !== 0) return; // primary / touch only
    // Editing controls (resize / add / remove / swap) are taps, never drag handles.
    if (event.target.closest && event.target.closest("[data-world-size-cycle],[data-world-add-sec],[data-world-rm-sec],[data-world-slot-swap]")) return;
    const tile = event.target.closest && event.target.closest(".world-tile[data-world-key]");
    if (!tile) return; // the Add tile (no data-world-key) and empty space fall through to click
    worldDrag.key = tile.dataset.worldKey;
    worldDrag.pointerId = event.pointerId;
    worldDrag.startX = event.clientX;
    worldDrag.startY = event.clientY;
    worldDrag.started = false;
    if (event.pointerType === "touch") {
      // Long-press to pick up (so a tap still opens and a swipe still scrolls).
      worldDrag.longPress = setTimeout(() => {
        worldDrag.longPress = null;
        const t = worldTileByKey(worldDrag.key);
        if (t) { worldDragBegin(t, worldDrag.startX, worldDrag.startY); try { t.setPointerCapture(worldDrag.pointerId); } catch (e) { /* ignore */ } }
      }, 230);
    }
  }

  function onWorldGridPointerMove(event) {
    if (worldDrag.key == null || event.pointerId !== worldDrag.pointerId) return;
    const dist = Math.hypot(event.clientX - worldDrag.startX, event.clientY - worldDrag.startY);
    if (!worldDrag.started) {
      if (worldDrag.longPress) { // touch waiting to pick up: a real move = scroll → cancel arming
        if (dist > 12) { clearTimeout(worldDrag.longPress); worldDrag.longPress = null; worldDrag.key = null; }
        return;
      }
      if (event.pointerType !== "touch" && dist > 6) { // mouse: start once past threshold (taps still open)
        const t = worldTileByKey(worldDrag.key);
        if (t) { worldDragBegin(t, event.clientX, event.clientY); try { t.setPointerCapture(worldDrag.pointerId); } catch (e) { /* ignore */ } }
      }
      return;
    }
    event.preventDefault(); // stop scroll/selection while dragging
    worldDragMoveGhost(event.clientX, event.clientY);
    worldDragOver(event.clientX, event.clientY);
  }

  function onWorldGridPointerUp(event) {
    if (worldDrag.key == null || (worldDrag.pointerId != null && event.pointerId !== worldDrag.pointerId)) return;
    worldDragEnd(true);
  }

  function onWorldGridPointerCancel() {
    if (worldDrag.key == null) return;
    worldDragEnd(false); // gesture interrupted → discard the in-progress reorder
  }

  function openWorldCommunity(id) {
    if (!(state.communities || []).some((c) => c.id === id)) return;
    state.worldDetailType = "community";
    state.scoreContext = "community:" + id;
    saveState();
    openCommunityFromScore(); // sets selectedCommunityId + community-detail view + renders
  }

  // A personal world opens the SAME detail view (branched to the personal body) — tap a tile to
  // VIEW it; logging stays on the "+" FAB / Coach.
  function openWorldPersonal(id) {
    if (!(state.systems || []).some((s) => s.id === id)) return;
    state.detailSystemId = id;
    state.scoreContext = "personal";
    state.trackerSystemId = id;
    state.activeView = "community-detail";
    state.worldDetailType = "personal"; // assert AFTER the view set so it wins
    saveState();
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openAddWorld() {
    // Build creates BOTH systems and communities (house rule); land on the Build home.
    state.activeView = "systems";
    state.systemEditorOpen = false;
    state.editingRuleId = "";
    if (typeof resetBuildHome === "function") resetBuildHome();
    saveState();
    render();
    if (typeof scrollSystemsListToTop === "function") scrollSystemsListToTop();
  }

  function renderDashboard() {
    refreshToday();
    if (!state.trackerSystemId || !state.systems.some((system) => system.id === state.trackerSystemId)) {
      state.trackerSystemId = state.systems[0]?.id || "";
    }
    state.scoreContext = normalizeScoreContextValue(state.scoreContext);

    // Bubble-tile home (Phase 1): the visible Today body. The per-system detail below is
    // hidden (#dashboardDetail) but still computed — its values feed the Add Entry view.
    renderWorldGrid();
    renderStreakCard(); // prominent streak card under the tiles (reuses coachContextStreak)

    // Default analytics visibility; updateDashboardComputed() flips these for the
    // action-first empty state (and the no-system branch below leaves them visible).
    if (els.topCardPanel) els.topCardPanel.hidden = false;
    if (els.visualBreakdownPanel) els.visualBreakdownPanel.hidden = false;
    if (els.weeklyProgressPanel) els.weeklyProgressPanel.hidden = false;
    if (els.quickLogChips) els.quickLogChips.hidden = true;
    renderDashboardAnalyticsToggle();

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
    els.openCommunityButton.hidden = !inCommunityMode;
    // Personal contexts get an "Edit System" shortcut where a community shows "Open Community".
    els.editSystemButton.hidden = inCommunityMode || !system;
    if (!system) {
      els.dailyInputList.innerHTML = emptyState("Create a reward system to start scoring days.");
      els.ruleProgressList.innerHTML = emptyState("Create a reward system to see today's breakdown.");
      els.categoryProgressList.innerHTML = `<div class="category-mini-empty">Create a reward system to see rule progress.</div>`;
      els.scoreBreakdown.innerHTML = "";
      els.weeklyChartCount.textContent = "0 charts";
      els.weeklyChartList.innerHTML = emptyState("Create a reward system to see weekly progress.");
      els.liveScore.textContent = "0/0";
      if (els.scoreRingFill) els.scoreRingFill.style.strokeDashoffset = "100";
      if (els.scoreHeroBarFill) els.scoreHeroBarFill.style.width = "0%";
      if (els.scoreHeroContext) els.scoreHeroContext.textContent = "Today";
      if (els.miniLeaderboard) els.miniLeaderboard.hidden = true;
      els.dailyStatusLabel.textContent = "Create a reward system to start.";
      if (els.dailyInsightText) els.dailyInsightText.textContent = "Create a reward system to start your daily insight.";
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
    els.breakdownTitle.textContent = "Entries Added Today";
    els.ruleCountLabel.textContent = plural(system.rules.length, "rule");
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
    const choosingAudience = !isEditorOpen && !isBuildSubpage && Boolean(pendingBuildMode);
    const isBuildHome = !isEditorOpen && !isBuildSubpage && !choosingAudience;
    els.systemsView.classList.toggle("is-editing-system", isEditorOpen);
    els.systemsView.classList.toggle("is-build-subpage", isBuildSubpage || choosingAudience);
    els.systemsView.classList.toggle("is-intent-home", isBuildHome);
    if (els.buildIntentHome) els.buildIntentHome.hidden = !isBuildHome;
    els.buildStartPanel.hidden = true; // superseded by the intent home (kept in DOM for refs)
    if (els.buildAudiencePanel) els.buildAudiencePanel.hidden = !choosingAudience;
    els.buildSearchPanel.hidden = isEditorOpen || state.buildMode !== "search";
    // When an AI draft exists, the new sentence-card editor (Screen 2) replaces the
    // classic generate form/review; otherwise the form shows for prompt entry.
    const hasAiDraft = !isEditorOpen && state.buildMode === "ai" && Boolean(state.aiDraftSystem);
    els.buildAiPanel.hidden = isEditorOpen || state.buildMode !== "ai" || hasAiDraft;
    if (els.buildDraftEditor) els.buildDraftEditor.hidden = !hasAiDraft;
    els.buildPublicSearchInput.value = state.buildSearchQuery || "";
    renderBuildSearchResults();
    renderAiDraftReview();
    renderDraftEditor();
    // "Your Communities" shows on the build home only (hidden in the editor/subpages).
    if (els.buildCommunitiesWrap) els.buildCommunitiesWrap.hidden = isEditorOpen || isBuildSubpage || choosingAudience;
    renderBuildCommunities();

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
    renderBuildYourBuilds();
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
    // Cover/icon thumbnails for this personal world (saves on pick → chooseWorldMedia).
    paintEditorMedia("system", system.coverUrl || "", system.iconUrl || "", els.systemCoverThumb, els.systemCoverImg, els.systemIconThumb, els.systemIconImg);
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
    pendingBuildMode = ""; // leaving the audience choice
    if (mode === "scratch") {
      createSystem();
      return;
    }
    state.buildMode = mode === "search" || mode === "ai" ? mode : "home";
    state.aiDraftSystem = null;
    state.aiDraftInputs = null;
    state.aiDraftAdjustments = null;
    state.aiDraftRawSystem = null;
    state.aiDraftChat = [];
    aiImproveOpen = false;
    if (state.buildMode === "home") {
      state.buildViewedProfileId = "";
      state.buildViewedPublicId = "";
    }
    saveState();
    renderSystems();
    if (state.buildMode === "search") {
      els.buildPublicSearchInput.focus();
      runPeopleSearch(state.buildSearchQuery); // refresh real people for any persisted query
      runBuildCommunitySearch(state.buildSearchQuery); // and public communities
    }
    if (state.buildMode === "ai") els.aiGoalsInput.focus();
  }

  // Step 1 of every start card: pick personal vs community before the flow begins.
  function chooseBuildStart(mode) {
    if (mode !== "search" && mode !== "ai" && mode !== "scratch") return;
    pendingBuildMode = mode;
    renderSystems();
    requestAnimationFrame(() => els.buildAudiencePanel?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  // Route the chosen start card into the existing personal OR community flow.
  function startBuildForAudience(audience) {
    const mode = pendingBuildMode;
    if (!mode) return;
    if (audience === "community") {
      // Communities require an account (they live server-side).
      if (!signalsReady()) {
        pendingBuildMode = "";
        renderSystems();
        showToast("Sign in to create a community");
        showAuthScreen();
        return;
      }
      pendingBuildMode = "";
      if (mode === "search") { setBuildMode("search"); return; } // search finds public communities too
      openCreateCommunity();
      setCommunityDraftMethod(mode === "ai" ? "ai" : "scratch");
      return;
    }
    // Personal → the existing personal-system flows.
    setBuildMode(mode);
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
    // Tapping a person opens the dedicated profile page (openUserProfile).
    const visibleSystems = systems.filter((system) => matchesSystemSearch(system, query));
    els.buildPublicSearchResults.innerHTML = `
      <section class="build-result-section" aria-label="People">
        <div class="build-result-section-heading"><h3>People</h3><span>${plural(peopleResults.length, "result")}</span></div>
        ${renderPeopleSection(query)}
      </section>
      <section class="build-result-section" aria-label="Reward Systems">
        <div class="build-result-section-heading"><h3>Reward Systems</h3><span>${plural(visibleSystems.length, "result")}</span></div>
        ${visibleSystems.length ? visibleSystems.map(renderBuildPublicResult).join("") : emptyState("No public reward systems match that search.")}
      </section>
      <section class="build-result-section" aria-label="Communities">
        <div class="build-result-section-heading"><h3>Communities</h3><span>${plural(buildCommunityResults.length, "result")}</span></div>
        ${buildCommunityResults.length ? buildCommunityResults.map(renderFindCommunityResult).join("") : emptyState("Search by name to find public communities to join.")}
      </section>`;
    bindSearchResultActions(els.buildPublicSearchResults, systems);
  }

  // ── Universal header search — reuses the SAME queries + result cards as Build search ─
  // (searchProfiles / getBuildPublicSystems / searchCommunities), but as its own view opened
  // from the header 🔍, with empty groups hidden. Communities you're in stay on Today.
  function openHeaderSearch() {
    state.activeView = "search";
    saveState();
    render();
    requestAnimationFrame(() => {
      // Sync state to whatever the field holds (browser-restored text or the last query) so the
      // shown results always match the box, then re-run the transient people/community queries.
      const q = String((els.headerSearchInput && els.headerSearchInput.value) || state.searchQuery || "");
      state.searchQuery = q;
      if (els.headerSearchInput) { els.headerSearchInput.value = q; els.headerSearchInput.focus(); }
      if (q.trim().length >= 2) { runPeopleSearch(q); runBuildCommunitySearch(q); }
      renderHeaderSearchResults();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function searchSection(title, count, body) {
    return `<section class="build-result-section" aria-label="${escapeHtml(title)}">
        <div class="build-result-section-heading"><h3>${escapeHtml(title)}</h3><span>${plural(count, "result")}</span></div>
        ${body}
      </section>`;
  }

  function renderHeaderSearchResults() {
    if (!els.headerSearchResults) return;
    const query = String(state.searchQuery || "").trim().toLowerCase();
    if (query.length < 2) {
      els.headerSearchResults.innerHTML = emptyState(signalsReady() ? "Search communities, people, and public systems by name." : "Sign in to search.");
      return;
    }
    const systems = getBuildPublicSystems();
    const visibleSystems = systems.filter((s) => matchesSystemSearch(s, query));
    const sections = [];
    if (buildCommunityResults.length) sections.push(searchSection("Communities", buildCommunityResults.length, buildCommunityResults.map(renderFindCommunityResult).join("")));
    if (peopleSearchLoading || peopleResults.length) sections.push(searchSection("People", peopleResults.length, renderPeopleSection(query)));
    if (visibleSystems.length) sections.push(searchSection("Reward systems", visibleSystems.length, visibleSystems.map(renderBuildPublicResult).join("")));
    els.headerSearchResults.innerHTML = sections.length ? sections.join("") : emptyState("No matches yet — try another name.");
    bindSearchResultActions(els.headerSearchResults, systems);
  }

  // Re-render whichever search surface is live (Build panel and/or header view) when an async
  // people/community query lands or a "view details" toggles.
  function refreshSearchSurfaces() {
    renderBuildSearchResults();
    if (state.activeView === "search") renderHeaderSearchResults();
  }

  // Shared result-card handlers — identical for both search surfaces (reuse existing handlers).
  function bindSearchResultActions(container, systems) {
    if (!container) return;
    container.querySelectorAll("[data-build-copy-public-id]").forEach((b) => b.addEventListener("click", () => copyPublicSystem(b.dataset.buildCopyPublicId, systems)));
    container.querySelectorAll("[data-join-community-id]").forEach((b) => b.addEventListener("click", () => joinCommunityById(b.dataset.joinCommunityId)));
    container.querySelectorAll("[data-open-community-detail-id]").forEach((b) => b.addEventListener("click", () => openBuildCommunity(b.dataset.openCommunityDetailId, "detail")));
    container.querySelectorAll("[data-build-view-person-id]").forEach((b) => b.addEventListener("click", () => openUserProfile(b.dataset.buildViewPersonId)));
    container.querySelectorAll("[data-add-friend-id]").forEach((b) => b.addEventListener("click", () => sendFriendRequestTo(b.dataset.addFriendId, b.dataset.addFriendName || "")));
    container.querySelectorAll("[data-build-view-public-id]").forEach((b) => b.addEventListener("click", () => {
      state.buildViewedPublicId = state.buildViewedPublicId === b.dataset.buildViewPublicId ? "" : b.dataset.buildViewPublicId;
      saveState();
      refreshSearchSurfaces();
    }));
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
      refreshSearchSurfaces();
      return;
    }
    peopleSearchLoading = true;
    const seq = ++peopleSearchSeq;
    refreshSearchSurfaces(); // show "Searching…"
    peopleSearchTimer = setTimeout(() => {
      Promise.resolve(window.PointwellSignals.searchProfiles(query)).then((rows) => {
        if (seq !== peopleSearchSeq) return;
        peopleResults = Array.isArray(rows) ? rows : [];
        peopleSearchLoading = false;
        refreshSearchSurfaces();
      }).catch(() => {
        if (seq !== peopleSearchSeq) return;
        peopleResults = [];
        peopleSearchLoading = false;
        refreshSearchSurfaces();
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
    const id = escapeHtml(String(person.id));
    return `
      <article class="build-result-card person-result-card">
        <button class="person-result-identity" type="button" data-build-view-person-id="${id}" aria-label="View ${name}'s profile">
          ${renderAvatar({ name: person.display_name || "Member", avatarUrl: person.avatar_url })}
          <div class="build-result-main">
            <strong>${name}</strong>
            <span>${handle}</span>
          </div>
        </button>
        <div class="build-result-actions">
          <button class="secondary-button small" type="button" data-add-friend-id="${id}" data-add-friend-name="${name}">Add friend</button>
          <button class="ghost-button small" type="button" data-build-view-person-id="${id}">View profile</button>
        </div>
      </article>
    `;
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

  async function generateAiDraftSystem(event) {
    if (event) event.preventDefault();
    if (aiGenerating) return;
    const inputs = readAiFormInputs();
    if (!isMeaningfulText(inputs.goals) && !isMeaningfulText(inputs.rewards)) {
      showToast("Describe your goals or habits first");
      return;
    }
    aiGenerating = true;
    showToast("Generating with AI…");
    try {
      state.aiDraftInputs = inputs;
      state.aiDraftAdjustments = blankAiAdjustments();
      state.aiDraftRawSystem = null;
      state.aiDraftChat = [];   // fresh draft → fresh improve conversation
      aiImproveOpen = false;
      state.aiDraftSystem = await aiGenerateDraft(inputs, state.aiDraftAdjustments, "personal");
      state.buildMode = "ai";
      saveState();
      renderSystems();
      showToast("Draft generated");
    } finally {
      aiGenerating = false;
    }
  }

  // Intent-home submit: one plain-English sentence → the SAME AI draft path as the
  // 3-field form (no parallel generator). The sentence maps to `goals`; everything
  // else takes the existing defaults so the Edge Function contract is unchanged.
  async function generateDraftFromIntent(sentence) {
    if (aiGenerating) return;
    const text = String(sentence || "").trim();
    if (!isMeaningfulText(text)) { showToast("Type a goal first"); els.buildIntentInput?.focus(); return; }
    const inputs = { goals: text, rewards: "", penalties: "", categories: "", strictness: "balanced", targets: "" };
    if (els.aiGoalsInput) els.aiGoalsInput.value = text; // keep the classic form in sync for round-trip
    const group = intentImpliesGroup(text);
    draftAudience = group ? "community" : "personal"; // default the audience toggle from the wording
    aiGenerating = true;
    showToast("Generating with AI…");
    try {
      state.aiDraftInputs = inputs;
      state.aiDraftAdjustments = blankAiAdjustments();
      state.aiDraftRawSystem = null;
      state.aiDraftChat = [];
      aiImproveOpen = false;
      draftOpenBlank = -1;
      state.aiDraftSystem = await aiGenerateDraft(inputs, state.aiDraftAdjustments, group ? "community" : "personal");
      state.buildMode = "ai";
      saveState();
      renderSystems();
      showToast("Draft generated");
    } finally {
      aiGenerating = false;
    }
  }

  // Build-row icon tile: a category glyph on a tinted gradient (public → green, study-ish →
  // purple, else green-blue). Presentational only — mirrors work/your-builds-redesign.html.
  function buildIconStyle(category, isPublic) {
    const c = String(category || "").toLowerCase();
    let glyph = "🎯";
    if (/fit|gym|lift|strength|workout|exercise/.test(c)) glyph = "🏋️";
    else if (/study|academ|school|learn|read|book|class/.test(c)) glyph = "📚";
    else if (/well|health|lifestyle|mind|habit|balance/.test(c)) glyph = "🌱";
    else if (/nutri|diet|food|eat|meal/.test(c)) glyph = "🥗";
    else if (/sleep|rest|recovery/.test(c)) glyph = "😴";
    else if (/run|cardio|walk|step|mile/.test(c)) glyph = "🏃";
    else if (/money|financ|budget|spend|save|cash/.test(c)) glyph = "💰";
    else if (/work|product|focus|deep|career/.test(c)) glyph = "💻";
    const purple = /study|academ|school|learn|read|book|class/.test(c);
    const bg = isPublic
      ? "linear-gradient(135deg, #2f7a5c, #244a6e)"
      : (purple ? "linear-gradient(135deg, #2a2342, #243a52)" : "linear-gradient(135deg, #1e3a30, #243a52)");
    return { glyph, bg };
  }

  // One compact build row: icon + name + visibility pill + meta + a primary Edit + a ⋯ menu.
  function buildRowShell(opts) {
    return `
      <div class="ybuild-row${opts.isPublic ? " is-public" : ""}" ${opts.rootAttr}>
        <div class="ybuild-icon" style="background:${opts.icon.bg}" aria-hidden="true">${opts.icon.glyph}</div>
        <div class="ybuild-main">
          <div class="ybuild-titlerow">
            <strong class="ybuild-name">${escapeHtml(opts.name)}</strong>
            <span class="ybuild-pill ${opts.pillClass}">${escapeHtml(opts.pillLabel)}</span>
          </div>
          <p class="ybuild-meta">${escapeHtml(opts.meta)}</p>
        </div>
        <button class="ybuild-edit" type="button" ${opts.editAttr}>Edit</button>
        <button class="ybuild-more" type="button" data-ybuild-more aria-haspopup="true" aria-expanded="false" aria-label="More actions for ${escapeHtml(opts.name)}"><span aria-hidden="true">⋯</span></button>
        <div class="ybuild-menu" role="menu" hidden>${opts.menuItems}</div>
      </div>`;
  }

  function renderYourBuildSystemRow(system) {
    const visibility = system.visibility === "public" ? "public" : "private";
    const id = escapeHtml(system.id);
    return buildRowShell({
      rootAttr: `data-system-id="${id}"`,
      isPublic: visibility === "public",
      icon: buildIconStyle(system.category, visibility === "public"),
      name: system.title || "Untitled system",
      pillClass: visibility,
      pillLabel: capitalize(visibility),
      meta: `${system.category || "No category yet"} · ${plural(system.rules.length, "rule")}`,
      editAttr: `data-edit-system-id="${id}"`,
      menuItems: `
        <button class="ybuild-menu-item" type="button" role="menuitem" data-turn-community-id="${id}"><span aria-hidden="true">👥</span> Invite people</button>
        <button class="ybuild-menu-item ybuild-menu-del" type="button" role="menuitem" data-delete-system-id="${id}"><span aria-hidden="true">🗑</span> Delete</button>`
    });
  }

  function renderYourBuildCommunityRow(community) {
    const visibility = communityVisibility(community);
    const isPublic = visibility === "public";
    const id = escapeHtml(community.id);
    return buildRowShell({
      rootAttr: `data-community-id="${id}"`,
      isPublic,
      icon: { glyph: "👥", bg: isPublic ? "linear-gradient(135deg, #2f7a5c, #244a6e)" : "linear-gradient(135deg, #1e3a30, #243a52)" },
      name: community.name || "Community",
      pillClass: isPublic ? "public" : (visibility === "request_to_join" ? "request" : "private"),
      pillLabel: visibilityLabel(visibility),
      meta: `${visibilityLabel(visibility)} · ${plural(getCommunityMemberCount(community), "member")}`,
      editAttr: `data-edit-community-id="${id}"`,
      menuItems: `<button class="ybuild-menu-item" type="button" role="menuitem" data-open-community-id="${id}"><span aria-hidden="true">↗</span> Open</button>`
    });
  }

  // Intent-home "Edit your builds" = personal systems + communities as compact rows, reusing the
  // exact same edit/invite/delete/open ACTIONS (same data-* attrs → bindBuildCardActions).
  function renderBuildYourBuilds() {
    if (!els.buildYourBuildsList) return;
    const systems = state.systems || [];
    const communities = Array.isArray(state.communities) ? state.communities : [];
    const rows = systems.map(renderYourBuildSystemRow).join("") + communities.map(renderYourBuildCommunityRow).join("");
    els.buildYourBuildsList.innerHTML = rows || emptyState("Nothing yet — describe a goal above to build your first one.");
    if (els.buildYourBuildsCount) els.buildYourBuildsCount.textContent = String(systems.length + communities.length);
    bindBuildCardActions(els.buildYourBuildsList);
    bindYourBuildsMenus(els.buildYourBuildsList);
  }

  // ⋯ overflow menu: toggle on tap, close others, close on outside-click / Escape (global
  // listeners bound once). Invite/Delete/Open inside the menu keep their own data-* handlers.
  let ybuildMenuGlobalBound = false;
  function closeAllYbuildMenus() {
    document.querySelectorAll(".ybuild-menu:not([hidden])").forEach((m) => { m.hidden = true; });
    document.querySelectorAll(".ybuild-more.is-open").forEach((b) => { b.classList.remove("is-open"); b.setAttribute("aria-expanded", "false"); });
  }
  function bindYourBuildsMenus(container) {
    if (!container) return;
    Array.from(container.querySelectorAll("[data-ybuild-more]")).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // keep the document outside-click handler from immediately re-closing it
        const menu = btn.parentElement.querySelector(".ybuild-menu");
        if (!menu) return;
        const willOpen = menu.hidden;
        closeAllYbuildMenus();
        if (willOpen) { menu.hidden = false; btn.classList.add("is-open"); btn.setAttribute("aria-expanded", "true"); }
      });
    });
    if (ybuildMenuGlobalBound) return;
    ybuildMenuGlobalBound = true;
    document.addEventListener("click", (e) => {
      if (e.target.closest(".ybuild-more") || e.target.closest(".ybuild-menu")) return; // inside a menu/toggle
      closeAllYbuildMenus();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllYbuildMenus(); });
  }

  // Reuse the standard system/community card button behavior inside any container.
  function bindBuildCardActions(container) {
    if (!container) return;
    Array.from(container.querySelectorAll("[data-edit-system-id]")).forEach((b) => b.addEventListener("click", () => {
      state.selectedSystemId = b.dataset.editSystemId; state.editingRuleId = ""; state.systemSetupStep = 0;
      state.systemEditorOpen = true; saveState(); renderSystems(); openSelectedSystemEditor();
    }));
    Array.from(container.querySelectorAll("[data-delete-system-id]")).forEach((b) => b.addEventListener("click", () => {
      state.selectedSystemId = b.dataset.deleteSystemId; deleteSelectedSystem();
    }));
    Array.from(container.querySelectorAll("[data-turn-community-id]")).forEach((b) => b.addEventListener("click", () => turnSystemIntoCommunity(b.dataset.turnCommunityId)));
    Array.from(container.querySelectorAll("[data-edit-community-id]")).forEach((b) => b.addEventListener("click", () => openBuildCommunity(b.dataset.editCommunityId, "settings")));
    Array.from(container.querySelectorAll("[data-open-community-id]")).forEach((b) => b.addEventListener("click", () => openBuildCommunity(b.dataset.openCommunityId, "detail")));
  }

  // ── Screen 2: AI draft editor (sentence cards + scrub-dial pills) ──────────
  // Renders state.aiDraftSystem — the SAME draft the 4-step editor edits — so it
  // round-trips. Pills map onto canonical rule fields; negative points route to
  // the penalty path exactly like buildRuleFromForm / aiRuleFromAiSpec.
  function draftPrimaryPoints(rule) {
    return rule.simpleStyle === "penalty" ? rule.penaltyPoints
      : (rule.simpleStyle === "yesNo" ? rule.yesNoPoints : (rule.goalPoints || rule.everyPoints));
  }
  function dialPointsLabel(v) {
    if (v === 0) return "0 pts";
    return (v < 0 ? "−" : "+") + formatPoints(Math.abs(v)) + " " + (Math.abs(v) === 1 ? "pt" : "pts");
  }
  function dialUnitStep(unit) {
    var u = String(unit || "").toLowerCase();
    if (/step/.test(u)) return 500;
    if (/gram|protein/.test(u) || u === "g") return 5;
    return 1;
  }
  function dialNumberLabel(v, unit) {
    var n = Number(v || 0).toLocaleString();
    var u = String(unit || "").trim();
    if (!u) return n;
    return /^(g|kg|lb|lbs)$/i.test(u) ? n + u : n + " " + u;
  }
  function draftRuleIcon(rule) {
    var s = ((rule.label || "") + " " + (rule.category || "")).toLowerCase();
    if (/run|jog|marathon/.test(s)) return "🏃";
    if (/step|walk/.test(s)) return "👟";
    if (/gym|lift|workout|strength|muscle/.test(s)) return "💪";
    if (/sleep|bed|rest/.test(s)) return "😴";
    if (/study|read|learn|class|exam|focus/.test(s)) return "📚";
    if (/protein|eat|meal|cal|food|diet/.test(s)) return "🍗";
    if (/water|hydrat|drink/.test(s)) return "💧";
    if (/cycle|bike|ride/.test(s)) return "🚴";
    if (/meditat|mindful|calm/.test(s)) return "🧘";
    if (/money|budget|save|spend/.test(s)) return "💰";
    return "◆";
  }
  function dialPillHtml(kind, ruleIndex, field, value, opts) {
    opts = opts || {};
    var step = kind === "points" ? 0.5 : (opts.step || 1);
    var min = kind === "points" ? -10 : 0;
    var max = kind === "points" ? 10 : (opts.max || 1000000);
    var tone = kind === "points" ? (value > 0 ? "pos" : (value < 0 ? "neg" : "zero")) : "num";
    var text = kind === "points" ? dialPointsLabel(value) : dialNumberLabel(value, opts.unit);
    return '<span class="scrub-dial ' + kind + '-dial ' + tone + '" role="spinbutton" tabindex="0"'
      + ' data-rule-index="' + ruleIndex + '" data-field="' + field + '" data-kind="' + kind + '"'
      + ' data-step="' + step + '" data-min="' + min + '" data-max="' + max + '" data-value="' + value + '"'
      + ' data-unit="' + escapeHtml(opts.unit || "") + '"'
      + ' aria-valuenow="' + value + '" aria-valuemin="' + min + '" aria-valuemax="' + max + '"'
      + ' aria-label="' + escapeHtml(opts.label || field) + '" title="Drag, scroll, or use arrow keys">'
      + escapeHtml(text) + "</span>";
  }
  function renderDraftRuleCard(rule, index) {
    var pts = numberOrDefault(draftPrimaryPoints(rule), 0);
    var isPenalty = rule.simpleStyle === "penalty" || pts < 0;
    var verb = '<span class="bde-verb" data-rule-index="' + index + '">' + (pts < 0 ? "Take away" : "Give me") + "</span>";
    var unit = rule.unit || "times";
    var ptsPill = dialPillHtml("points", index, "points", pts, { label: "Points for " + rule.label });
    var body;
    if (rule.simpleStyle === "yesNo") {
      body = verb + " " + ptsPill + " when I " + conditionBlankHtml(rule, index);
    } else if (rule.simpleStyle === "penalty") {
      var minPill = dialPillHtml("number", index, "goal", numberOrDefault(rule.minimumRequired, 0), { unit: unit, step: dialUnitStep(unit), label: "Minimum " + unit });
      body = "Take away " + ptsPill + " when I fall below " + minPill;
    } else if (rule.simpleStyle === "every") {
      var everyPill = dialPillHtml("number", index, "every", numberOrDefault(rule.everyAmount, 1), { unit: unit, step: dialUnitStep(unit), label: "Every " + unit });
      body = verb + " " + ptsPill + " every " + everyPill;
    } else {
      var goalPill = dialPillHtml("number", index, "goal", numberOrDefault(rule.dailyTarget, 0), { unit: unit, step: dialUnitStep(unit), label: "Goal " + unit });
      body = verb + " " + ptsPill + " when I hit " + goalPill;
    }
    return '<div class="bde-card' + (isPenalty ? " is-penalty" : "") + '" data-rule-index="' + index + '">'
      + '<div class="bde-card-head"><span class="bde-card-icon" aria-hidden="true">' + draftRuleIcon(rule) + "</span>"
      + '<strong class="bde-card-label">' + escapeHtml(rule.label) + "</strong>"
      + '<button class="bde-remove" type="button" data-remove-rule="' + index + '" aria-label="Remove ' + escapeHtml(rule.label) + '">✕</button></div>'
      + '<p class="bde-sentence">' + body + "</p>"
      + (draftOpenBlank === index ? renderBlankHelper(rule, index) : "")
      + "</div>";
  }
  // The optional AI fields (condition/uncertain/suggestions) live on the raw AI
  // shape only (display-only, dropped on save). Absent until the Edge Function is
  // redeployed — everything below falls back gracefully when they're missing.
  function draftRawRule(index) {
    var raw = state.aiDraftRawSystem;
    return raw && Array.isArray(raw.rules) ? raw.rules[index] : null;
  }
  function conditionBlankHtml(rule, index) {
    var raw = draftRawRule(index);
    var condition = raw && typeof raw.condition === "string" ? raw.condition.trim() : "";
    var shown = condition || String(rule.label || "").trim();
    var blank = (raw && raw.uncertain === true) || !shown || /^(new habit|untitled|habit|rule|entry)$/i.test(shown);
    return '<button class="bde-blank ' + (blank ? "empty" : "filled") + '" type="button" data-blank-rule="' + index + '"'
      + ' aria-haspopup="true" aria-expanded="' + (draftOpenBlank === index) + '" aria-label="What should count as done">'
      + (blank ? '______ <span class="bde-blank-spark" aria-hidden="true">✦</span>' : escapeHtml(shown))
      + "</button>";
  }
  function conditionSuggestions(rule, index) {
    var raw = draftRawRule(index);
    if (raw && Array.isArray(raw.suggestions) && raw.suggestions.length) {
      return raw.suggestions.slice(0, 4).map(function (x) { return String(x); });
    }
    var s = ((rule.label || "") + " " + (rule.category || "")).toLowerCase();
    if (/gym|lift|workout|strength|muscle/.test(s)) return ["complete a workout", "train 45+ minutes", "hit every set"];
    if (/run|jog/.test(s)) return ["finish my run", "run without walking", "log 3+ km"];
    if (/step|walk/.test(s)) return ["hit my step goal", "walk after dinner", "take the stairs"];
    if (/sleep|bed/.test(s)) return ["in bed by my target", "sleep 7+ hours", "no screens before bed"];
    if (/study|read|learn|exam|focus/.test(s)) return ["study 1+ focused hour", "finish the day's reading", "no phone while studying"];
    if (/protein|eat|meal|diet|cal|food/.test(s)) return ["hit my protein target", "eat a home-cooked meal", "no late-night snacking"];
    if (/water|hydrat/.test(s)) return ["drink my water goal", "a glass with each meal"];
    return ["do it today", "complete it fully", "show up consistently"];
  }
  function renderBlankHelper(rule, index) {
    var sugg = conditionSuggestions(rule, index);
    return '<div class="bde-helper">'
      + '<div class="bde-helper-title">What should count as done?</div>'
      + '<div class="bde-helper-chips">'
      + sugg.map(function (x) { return '<button class="bde-helper-chip" type="button" data-fill-rule="' + index + '" data-fill-text="' + escapeHtml(x) + '">' + escapeHtml(x) + "</button>"; }).join("")
      + "</div>"
      + '<div class="bde-helper-ask">'
      + '<input class="bde-helper-input" id="bdeHelperInput' + index + '" type="text" placeholder="…or describe it / ask AI" aria-label="Describe what counts">'
      + '<button class="ghost-button small bde-helper-ai" type="button" data-ask-ai-rule="' + index + '" title="Ask AI to phrase it">✦ Ask AI</button>'
      + '<button class="primary-button small bde-helper-set" type="button" data-set-rule="' + index + '">Set</button>'
      + "</div></div>";
  }
  function toggleBlank(index) {
    draftOpenBlank = draftOpenBlank === index ? -1 : index;
    renderDraftEditor();
    if (draftOpenBlank === index && els.buildDraftEditor) {
      requestAnimationFrame(function () { var i = els.buildDraftEditor.querySelector("#bdeHelperInput" + index); if (i) i.focus(); });
    }
  }
  function fillBlank(index, text) {
    var t = String(text || "").trim(); if (!t) return;
    setDraftRuleField(index, "label", t);
    draftOpenBlank = -1;
    saveState();
    renderDraftEditor();
  }
  function setBlankFromInput(index) {
    var input = els.buildDraftEditor && els.buildDraftEditor.querySelector("#bdeHelperInput" + index);
    fillBlank(index, input ? input.value : "");
  }
  function askAiBlank(index) {
    var input = els.buildDraftEditor && els.buildDraftEditor.querySelector("#bdeHelperInput" + index);
    var text = input ? input.value.trim() : "";
    var rule = state.aiDraftSystem && state.aiDraftSystem.rules[index];
    if (!rule) return;
    if (!text) { showToast("Type what you want first"); return; }
    if (!signalsReady() || typeof refineAiDraft !== "function") { fillBlank(index, text); return; }
    draftOpenBlank = -1;
    var label = scoring.normalizeRule(rule).label;
    refineAiDraft('For the rule "' + label + '", change what counts as completing it to express: "' + text + '". Keep every other rule and all points and goals identical.');
  }
  function renderDraftEditor() {
    if (!els.buildDraftEditor) return;
    var draft = state.aiDraftSystem;
    if (!draft || els.buildDraftEditor.hidden) { if (!draft) els.buildDraftEditor.innerHTML = ""; return; }
    var rules = (draft.rules || []).map(scoring.normalizeRule);
    els.buildDraftEditor.innerHTML =
      '<div class="bde-head">'
      + '<div class="bde-badge"><span aria-hidden="true">✦</span> AI drafted · tap any blank to fix it</div>'
      + '<div class="bde-name-row"><input class="bde-name" id="bdeNameInput" value="' + escapeHtml(draft.title || "") + '" aria-label="System name" placeholder="Name your system"><span class="bde-name-pencil" aria-hidden="true">✎</span></div>'
      + '<button class="link-button bde-advanced" type="button" id="bdeEditAdvanced">Edit advanced ▸</button>'
      + "</div>"
      + '<div class="bde-cards">' + rules.map(renderDraftRuleCard).join("") + "</div>"
      + '<button class="ghost-button bde-add" type="button" id="bdeAddRule"><span aria-hidden="true">＋</span> Add a habit</button>'
      + '<div class="bde-tweak">'
        + '<div class="bde-tweak-label"><span aria-hidden="true">✦</span> Tweak with AI</div>'
        + '<div class="bde-tweak-chips">'
          + '<button class="bde-tweak-chip" type="button" data-tweak="stricter">Make it harder</button>'
          + '<button class="bde-tweak-chip" type="button" data-tweak="easier">Make it easier</button>'
          + '<button class="bde-tweak-chip" type="button" data-tweak="fewer">Fewer rules</button>'
          + '<button class="bde-tweak-chip" type="button" data-tweak="penalty">Add a penalty</button>'
        + '</div>'
        + '<div class="bde-tweak-ask">'
          + '<input class="bde-tweak-input" id="bdeTweakInput" type="text" placeholder="Ask AI to change anything…" aria-label="Ask AI to change the draft">'
          + '<button class="primary-button small bde-tweak-send" type="button" id="bdeTweakSend">Send</button>'
        + '</div>'
      + '</div>'
      + '<div class="bde-audience-row">'
        + '<div class="bde-audience" role="tablist" aria-label="Who is this for">'
          + '<button class="bde-aud' + (draftAudience === "personal" ? " active" : "") + '" type="button" role="tab" aria-selected="' + (draftAudience === "personal") + '" data-audience="personal"><span aria-hidden="true">🔒</span> Just me</button>'
          + '<button class="bde-aud' + (draftAudience === "community" ? " active" : "") + '" type="button" role="tab" aria-selected="' + (draftAudience === "community") + '" data-audience="community"><span aria-hidden="true">👥</span> Community</button>'
        + '</div>'
        + '<p class="bde-nudge">' + (draftAudience === "community" ? "Sounds like a group goal — invite people after you create it." : "Make it a community to keep each other accountable — invite people after.") + '</p>'
      + '</div>'
      + '<div class="bde-foot"><div class="bde-total" id="bdeTotal"></div>'
      + '<button class="primary-button bde-create" type="button" id="bdeCreate">' + (draftAudience === "community" ? "Create community" : "Create system") + '</button></div>';
    updateDraftTotal();
  }
  function updateDraftTotal() {
    if (!els.buildDraftEditor) return;
    var total = els.buildDraftEditor.querySelector("#bdeTotal");
    if (!total || !state.aiDraftSystem) return;
    var sys = normalizeSystem(state.aiDraftSystem);
    var best = numberOrDefault(calculateTargetSummary(sys).total, 0);
    var hasPenalty = (sys.rules || []).some(function (r) { return numberOrDefault(draftPrimaryPoints(scoring.normalizeRule(r)), 0) < 0; });
    total.classList.toggle("has-penalty", hasPenalty);
    total.innerHTML = "<strong>" + formatSigned(best) + "</strong> <span>best day</span>";
  }
  function setDraftRuleField(index, field, value) {
    var draft = state.aiDraftSystem;
    if (!draft || !draft.rules[index]) return;
    var rule = scoring.normalizeRule(draft.rules[index]);
    var patch = Object.assign({}, rule);
    if (field === "points") {
      if (value < 0) {
        patch.simpleStyle = "penalty";
        patch.penaltyEnabled = true;
        patch.penaltyMode = "fixed";
        patch.penaltyPoints = -(Math.abs(value) || 0.5);
        if (!numberOrDefault(patch.minimumRequired, 0)) patch.minimumRequired = numberOrDefault(rule.dailyTarget, 0);
      } else if (rule.simpleStyle === "penalty") {
        patch.simpleStyle = "goal"; patch.penaltyEnabled = false; patch.goalPoints = value;
        patch.dailyTarget = numberOrDefault(rule.minimumRequired, rule.dailyTarget);
      } else if (rule.simpleStyle === "yesNo") {
        patch.yesNoPoints = value;
      } else if (rule.simpleStyle === "every") {
        patch.everyPoints = value;
      } else {
        patch.goalPoints = value;
      }
    } else if (field === "goal") {
      if (rule.simpleStyle === "penalty") patch.minimumRequired = value; else patch.dailyTarget = value;
    } else if (field === "every") {
      patch.everyAmount = Math.max(value, 1);
    } else if (field === "unit") {
      patch.unit = value;
    } else if (field === "label") {
      patch.label = value;
    }
    draft.rules[index] = scoring.createRule(patch);
  }

  // ── Scrub-dial interaction (drag / wheel / arrow keys) ────────────────────
  var draftDialDrag = null;
  var draftOpenBlank = -1;   // rule index whose tap-to-fix helper is open (-1 = none)
  var draftAudience = "personal";   // "personal" | "community" — drives the Create CTA
  var draftCommitTimer = null;
  var draftSaveTimer = null;
  function dialClamp(v, min, max, step) {
    v = Math.max(min, Math.min(max, v));
    v = Math.round(v / step) * step;
    return Math.round(v * 100) / 100;
  }
  function dialLiveUpdate(dial, v) {
    var kind = dial.dataset.kind;
    dial.dataset.value = String(v);
    dial.setAttribute("aria-valuenow", String(v));
    dial.textContent = kind === "points" ? dialPointsLabel(v) : dialNumberLabel(v, dial.dataset.unit);
    if (kind === "points") {
      dial.classList.remove("pos", "neg", "zero");
      dial.classList.add(v > 0 ? "pos" : (v < 0 ? "neg" : "zero"));
      var verb = els.buildDraftEditor.querySelector('.bde-verb[data-rule-index="' + dial.dataset.ruleIndex + '"]');
      if (verb) verb.textContent = v < 0 ? "Take away" : "Give me";
    }
    setDraftRuleField(parseInt(dial.dataset.ruleIndex, 10), dial.dataset.field, v);
    updateDraftTotal();
  }
  function dialCommit() {
    var active = document.activeElement;
    var refocus = active && active.classList && active.classList.contains("scrub-dial")
      ? { idx: active.dataset.ruleIndex, field: active.dataset.field } : null;
    saveState();
    renderDraftEditor();
    if (refocus && els.buildDraftEditor) {
      var el = els.buildDraftEditor.querySelector('.scrub-dial[data-rule-index="' + refocus.idx + '"][data-field="' + refocus.field + '"]');
      if (el) el.focus();
    }
  }
  function scheduleDialCommit() { clearTimeout(draftCommitTimer); draftCommitTimer = setTimeout(dialCommit, 320); }
  function scheduleDraftSave() { clearTimeout(draftSaveTimer); draftSaveTimer = setTimeout(function () { saveState(); }, 400); }
  function onDialPointerDown(e) {
    var dial = e.target.closest && e.target.closest(".scrub-dial"); if (!dial) return;
    e.preventDefault();
    try { dial.setPointerCapture(e.pointerId); } catch (err) {}
    draftDialDrag = { dial: dial, pointerId: e.pointerId, startY: e.clientY,
      startValue: parseFloat(dial.dataset.value) || 0, step: parseFloat(dial.dataset.step) || 1,
      min: parseFloat(dial.dataset.min), max: parseFloat(dial.dataset.max) };
    dial.classList.add("dragging");
    dial.focus();
  }
  function onDialPointerMove(e) {
    if (!draftDialDrag || e.pointerId !== draftDialDrag.pointerId) return;
    var steps = Math.round((draftDialDrag.startY - e.clientY) / 15);
    var v = dialClamp(draftDialDrag.startValue + steps * draftDialDrag.step, draftDialDrag.min, draftDialDrag.max, draftDialDrag.step);
    if (v !== (parseFloat(draftDialDrag.dial.dataset.value) || 0)) dialLiveUpdate(draftDialDrag.dial, v);
  }
  function onDialPointerUp(e) {
    if (!draftDialDrag) return;
    draftDialDrag.dial.classList.remove("dragging");
    try { draftDialDrag.dial.releasePointerCapture(e.pointerId); } catch (err) {}
    draftDialDrag = null;
    dialCommit();
  }
  function dialStep(dial, dir) {
    var step = parseFloat(dial.dataset.step) || 1;
    var v = dialClamp((parseFloat(dial.dataset.value) || 0) + dir * step, parseFloat(dial.dataset.min), parseFloat(dial.dataset.max), step);
    dialLiveUpdate(dial, v);
    scheduleDialCommit();
  }
  function onDialWheel(e) {
    var dial = e.target.closest && e.target.closest(".scrub-dial"); if (!dial) return;
    e.preventDefault();
    dialStep(dial, e.deltaY < 0 ? 1 : -1);
  }
  function onDialKeyDown(e) {
    var hinput = e.target.closest && e.target.closest(".bde-helper-input");
    if (hinput && e.key === "Enter") { e.preventDefault(); setBlankFromInput(parseInt(hinput.id.replace("bdeHelperInput", ""), 10)); return; }
    var tinput = e.target.closest && e.target.closest("#bdeTweakInput");
    if (tinput && e.key === "Enter") { e.preventDefault(); sendTweak(); return; }
    var dial = e.target.closest && e.target.closest(".scrub-dial"); if (!dial) return;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); dialStep(dial, 1); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); dialStep(dial, -1); }
  }
  function onDraftEditorClick(e) {
    var blank = e.target.closest("[data-blank-rule]");
    if (blank) { toggleBlank(parseInt(blank.dataset.blankRule, 10)); return; }
    var fill = e.target.closest("[data-fill-rule]");
    if (fill) { fillBlank(parseInt(fill.dataset.fillRule, 10), fill.dataset.fillText); return; }
    var setBtn = e.target.closest("[data-set-rule]");
    if (setBtn) { setBlankFromInput(parseInt(setBtn.dataset.setRule, 10)); return; }
    var ask = e.target.closest("[data-ask-ai-rule]");
    if (ask) { askAiBlank(parseInt(ask.dataset.askAiRule, 10)); return; }
    var tweak = e.target.closest("[data-tweak]");
    if (tweak) { doTweak(tweak.dataset.tweak); return; }
    if (e.target.closest("#bdeTweakSend")) { sendTweak(); return; }
    var aud = e.target.closest("[data-audience]");
    if (aud) { setDraftAudience(aud.dataset.audience); return; }
    if (e.target.closest("#bdeCreate")) { if (draftAudience === "community") createCommunityFromDraft(); else createSystemFromDraft(); return; }
    if (e.target.closest("#bdeEditAdvanced")) { useAiDraftSystem(); return; }
    if (e.target.closest("#bdeAddRule")) { addDraftRule(); return; }
    var rem = e.target.closest("[data-remove-rule]");
    if (rem) { removeDraftRule(parseInt(rem.dataset.removeRule, 10)); return; }
  }
  function onDraftEditorInput(e) {
    var name = e.target.closest && e.target.closest("#bdeNameInput");
    if (name && state.aiDraftSystem) { state.aiDraftSystem.title = name.value; scheduleDraftSave(); }
  }
  function addDraftRule() {
    if (!state.aiDraftSystem) return;
    draftOpenBlank = -1;
    state.aiDraftSystem.rules.push(scoring.createRule({
      id: makeId("rule"), label: "New habit", category: state.aiDraftSystem.category || "Personal habits",
      unit: "times", simpleStyle: "yesNo", yesNoPoints: 1, dailyTarget: 1
    }));
    saveState();
    renderDraftEditor();
  }
  function removeDraftRule(index) {
    if (!state.aiDraftSystem || !state.aiDraftSystem.rules[index]) return;
    draftOpenBlank = -1;
    state.aiDraftSystem.rules.splice(index, 1);
    saveState();
    renderDraftEditor();
  }
  function createSystemFromDraft() {
    var draft = state.aiDraftSystem;
    if (!draft) return;
    if (!draft.rules || !draft.rules.length) { showToast("Add at least one habit first"); return; }
    var nameInput = els.buildDraftEditor && els.buildDraftEditor.querySelector("#bdeNameInput");
    if (nameInput) draft.title = nameInput.value.trim() || draft.title;
    var sys = cloneSystem(normalizeSystem(draft), draft.title || "AI draft reward system");
    sys.aiDomain = draft.aiDomain || "general";
    recordAiSave(normalizeSystem(draft));
    state.systems.unshift(sys);
    state.selectedSystemId = sys.id;
    state.trackerSystemId = sys.id;
    state.aiDraftSystem = null; state.aiDraftInputs = null; state.aiDraftAdjustments = null;
    state.aiDraftRawSystem = null; state.aiDraftChat = [];
    resetBuildHome();
    saveState();
    render();
    showToast("System created");
  }

  // §8: does the intent sound like a shared/group goal?
  function intentImpliesGroup(text) {
    var t = String(text || "");
    return /\b(we|us|our|team|crew|squad|group|club|friends|the boys|the girls|together|each other|everyone)\b/i.test(t)
      || /\bwith\s+[A-Z][a-z]+/.test(t);
  }
  function setDraftAudience(a) {
    draftAudience = a === "community" ? "community" : "personal";
    renderDraftEditor();
  }
  // Step 5: "Tweak with AI" — reuse the existing refine path (no new endpoint).
  function doTweak(kind) {
    if (!state.aiDraftSystem) return;
    draftOpenBlank = -1;
    if (kind === "stricter") refineAiDraft(cannedInstructionForPreset("stricter"), "stricter");
    else if (kind === "easier") refineAiDraft(cannedInstructionForPreset("easier"), "easier");
    else if (kind === "fewer") refineAiDraft("Use fewer rules — keep only the most important ones, merge or drop the rest.");
    else if (kind === "penalty") refineAiDraft("Add one penalty rule that takes away points for a relevant slip-up, and keep the existing rewards.");
    else return;
    showToast("Tweaking with AI…");
  }
  function sendTweak() {
    var input = els.buildDraftEditor && els.buildDraftEditor.querySelector("#bdeTweakInput");
    var t = input ? input.value.trim() : "";
    if (!t) { showToast("Type a change first"); return; }
    draftOpenBlank = -1;
    refineAiDraft(t);
    showToast("Tweaking with AI…");
  }
  // Step 6: Create a COMMUNITY from the draft, reusing finalizeCommunityDraft's DB
  // writes (createCommunity + owner joinCommunity + reload). Seed the cc-form els it
  // reads via syncCommunityDraftFromForm.
  async function createCommunityFromDraft() {
    var draft = state.aiDraftSystem;
    if (!draft) return;
    if (!draft.rules || !draft.rules.length) { showToast("Add at least one habit first"); return; }
    if (!communitiesAreShared()) {
      showToast("Sign in to create a community");
      if (typeof showAuthScreen === "function") showAuthScreen();
      return;
    }
    var nameInput = els.buildDraftEditor && els.buildDraftEditor.querySelector("#bdeNameInput");
    var name = (nameInput ? nameInput.value.trim() : "") || draft.title || "New community";
    communityDraft = blankCommunityDraft();
    communityDraft.rules = draft.rules.map(function (r) { return scoring.createRule(Object.assign({}, scoring.normalizeRule(r), { id: makeId("community-rule") })); });
    if (els.ccNameInput) els.ccNameInput.value = name;
    if (els.ccCategoryInput) els.ccCategoryInput.value = draft.category || "Community";
    if (els.ccDescriptionInput) els.ccDescriptionInput.value = draft.description || "";
    if (els.ccVisibilityInput) els.ccVisibilityInput.value = draft.visibility || "private";
    showToast("Creating community…");
    await finalizeCommunityDraft();
    if (state.activeView === "community-detail") {
      state.aiDraftSystem = null; state.aiDraftInputs = null; state.aiDraftAdjustments = null;
      state.aiDraftRawSystem = null; state.aiDraftChat = [];
      resetBuildHome();
      saveState();
    }
  }

  function readAiFormInputs() {
    // Form was simplified to 3 fields. The removed inputs get sensible defaults so
    // the Edge Function contract is unchanged: balanced strictness, no penalties,
    // and an empty category (the generator infers it from the goals server-side).
    return {
      goals: els.aiGoalsInput.value.trim(),
      rewards: els.aiRewardHabitsInput.value.trim(),
      penalties: "",
      categories: "",
      strictness: "balanced",
      targets: els.aiTargetsInput.value.trim()
    };
  }

  function blankAiAdjustments() {
    return { strictnessDelta: 0, specificity: 0, extraRules: 0, removePenalties: false, focus: "" };
  }

  async function regenerateAiDraft() {
    if (aiGenerating) return;
    const inputs = state.aiDraftInputs || readAiFormInputs();
    state.aiDraftAdjustments = state.aiDraftAdjustments || blankAiAdjustments();
    aiGenerating = true;
    showToast("Regenerating…");
    try {
      state.aiDraftSystem = await aiGenerateDraft(inputs, state.aiDraftAdjustments, "personal");
      saveState();
      renderSystems();
    } finally {
      aiGenerating = false;
    }
  }

  // Calls the real AI Edge Function; on any failure shows a clean message and falls
  // back to the local template so the feature still produces an editable draft.
  async function aiGenerateDraft(inputs, adjustments, kind) {
    if (signalsReady() && window.PointwellSignals && typeof window.PointwellSignals.generateRules === "function") {
      const res = await window.PointwellSignals.generateRules({
        goals: inputs.goals,
        rewards: inputs.rewards,
        penalties: inputs.penalties,
        categories: inputs.categories,
        strictness: inputs.strictness,
        targets: inputs.targets,
        adjust: aiAdjustInstruction(adjustments),
        kind: kind || "personal"
      });
      if (!res.error && res.system) {
        // Keep the raw AI-shape system so "Improve this system" can refine from it.
        state.aiDraftRawSystem = res.system;
        return buildAiDraftFromAiSystem(res.system, inputs, adjustments);
      }
      const reason = res.error && res.error.message ? res.error.message : "AI is unavailable right now.";
      showToast(reason + " Using a starter template you can edit.");
    }
    return createMockAiDraftSystem(inputs, adjustments);
  }

  // Translate the review-screen improvement chips (adjustments) into a plain-English
  // instruction the AI can act on when regenerating.
  function aiAdjustInstruction(adj) {
    if (!adj) return "";
    const parts = [];
    if (numberOrDefault(adj.strictnessDelta, 0) > 0) parts.push("make the rules stricter with higher targets");
    if (numberOrDefault(adj.strictnessDelta, 0) < 0) parts.push("make the rules easier with lower targets");
    if (numberOrDefault(adj.specificity, 0) > 0) parts.push("make the rules more specific and detailed");
    if (numberOrDefault(adj.extraRules, 0) > 0) parts.push("add a few more rules");
    if (adj.removePenalties) parts.push("remove all penalty rules");
    if (adj.focus === "consistency") parts.push("favor simple yes/no consistency habits");
    else if (adj.focus) parts.push("focus on " + adj.focus);
    return parts.join("; ");
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

  // Convert ONE Edge-Function rule spec into a normalized rule. Rewards reuse the same
  // aiMakeRule() the local generator uses; penalties build a penalty rule directly.
  function aiRuleFromAiSpec(spec, ctx) {
    spec = spec || {};
    const label = (String(spec.label || "").trim() || "Habit").slice(0, 80);
    const unit = (String(spec.unit || "").trim() || "times").slice(0, 30);
    const category = (String(spec.category || "").trim() || ctx.category || "Personal habits").slice(0, 60);
    const points = numberOrDefault(spec.points, 1);
    const isPenalty = spec.tier === "penalty" || spec.style === "penalty" || points < 0;
    if (isPenalty) {
      const minimum = Math.max(numberOrDefault(spec.goal, 1), 0) || 1;
      return scoring.createRule({
        id: makeId("ai-rule"),
        label, category, metric: label.toLowerCase(), unit,
        simpleStyle: "penalty",
        dailyTarget: minimum,
        minimumRequired: minimum,
        penaltyEnabled: true,
        penaltyDirection: "below",
        penaltyPoints: -(Math.abs(points) || 1),
        penaltyMode: "fixed",
        inputMethod: spec.inputMethod || "number",
        dataSource: "manual", sourceMetric: "manual", allowManualOverride: true
      });
    }
    const style = ["goal", "every", "yesNo", "both"].includes(spec.style) ? spec.style : "goal";
    return aiMakeRule({
      label, category, unit, style,
      goal: numberOrDefault(spec.goal, 0),
      every: Math.max(numberOrDefault(spec.every, 1), 1),
      points: Math.abs(points) || 1,
      inputMethod: spec.inputMethod
    }, ctx);
  }

  // Build a draft system from the Edge Function's response — SAME shape/normalization
  // as createMockAiDraftSystem, so the review/edit/save flow is unchanged.
  function buildAiDraftFromAiSystem(aiSystem, inputs, adjustments) {
    aiSystem = aiSystem || {};
    const adj = adjustments || blankAiAdjustments();
    const category = (String(aiSystem.category || inputs.categories || "").trim()) ||
      (inferCategory(inputs.categories || inputs.goals || inputs.rewards) || "Personal habits");
    // Neutral scaling — the AI already accounted for strictness, so don't re-scale here.
    const ctx = { strict: { pointScale: 1, targetScale: 1 }, targets: inputs.targets, category, focus: adj.focus };
    const specs = Array.isArray(aiSystem.rules) ? aiSystem.rules.slice(0, 16) : [];
    const usedLabels = new Set();
    const rules = [];
    specs.forEach((spec) => {
      const rule = aiRuleFromAiSpec(spec, ctx);
      const key = String(rule.label || "").toLowerCase();
      if (!key || usedLabels.has(key)) return;
      usedLabels.add(key);
      rules.push(rule);
    });
    return normalizeSystem({
      id: makeId("draft"),
      ownerId: "me",
      ownerName: state.profile.name,
      title: (String(aiSystem.title || "").trim()) || aiSystemName(null, inputs),
      category,
      visibility: "private",
      description: (String(aiSystem.description || "").trim()) || inputs.goals || inputs.rewards || "A reward system generated from your goals.",
      rules,
      calculatedTotals: [],
      aiDomain: "ai",
      aiExplanation: (String(aiSystem.explanation || "").trim()) || "These rules were generated from your goals — review and tweak anything before saving."
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

  async function applyAiImprovement(kind) {
    if (!state.aiDraftSystem) return;
    const apply = AI_IMPROVEMENTS[kind];
    if (!apply) return;
    if (aiGenerating) { showToast("Still generating — try again in a moment"); return; }
    state.aiDraftAdjustments = state.aiDraftAdjustments || blankAiAdjustments();
    apply(state.aiDraftAdjustments);
    await regenerateAiDraft(); // toast only after the (async) regenerate actually completes
    showToast("Draft updated");
  }

  // ── Conversational "Improve this system" ────────────────────────────────────
  // Preset chips feed the SAME refine path as the free-text chat, via a canned line.
  const AI_PRESET_INSTRUCTIONS = {
    stricter: "Make the whole system stricter: raise the daily targets and point thresholds, and add a sensible penalty rule if there isn't one.",
    easier: "Make the system easier: lower the daily targets and make points easier to earn.",
    specific: "Make every rule more specific and measurable, with concrete numeric targets.",
    "more-rules": "Add two more useful rules that fit these goals.",
    "remove-penalties": "Remove all penalty rules (any rule with negative points).",
    consistency: "Shift the focus toward daily consistency and streak-friendly habits.",
    outcomes: "Shift the focus toward outcome-based goals and add a stretch bonus rule."
  };
  const AI_PRESET_LABELS = {
    stricter: "Make it stricter", easier: "Make it easier", specific: "More specific",
    "more-rules": "Add more rules", "remove-penalties": "Remove penalties",
    consistency: "Focus on consistency", outcomes: "Focus on outcomes"
  };
  function cannedInstructionForPreset(kind) {
    return AI_PRESET_INSTRUCTIONS[kind] || "";
  }

  function pushAiChat(role, text) {
    state.aiDraftChat = Array.isArray(state.aiDraftChat) ? state.aiDraftChat : [];
    state.aiDraftChat.push({ role: role === "user" ? "user" : "ai", text: String(text || "") });
  }

  function refineConfirmation(system) {
    const note = system && typeof system.explanation === "string" ? system.explanation.trim() : "";
    const count = system && Array.isArray(system.rules) ? system.rules.length : 0;
    return note ? `Done — ${note}` : `Done — updated to ${plural(count, "rule")}.`;
  }

  // A precise "what actually changed" confirmation from a before/after rule diff (by label),
  // so the user sees their edits were kept — e.g. "Added 'Stretching' · kept your other 5 rules".
  function refineRuleKey(r) { return String((r && r.label) || "").trim().toLowerCase(); }
  function refineDiffSummary(before, after) {
    if (!before || !after || !Array.isArray(before.rules) || !Array.isArray(after.rules)) return "";
    const beforeByKey = {}, afterByKey = {};
    before.rules.forEach((r) => { const k = refineRuleKey(r); if (k) beforeByKey[k] = r; });
    after.rules.forEach((r) => { const k = refineRuleKey(r); if (k) afterByKey[k] = r; });
    const added = after.rules.filter((r) => { const k = refineRuleKey(r); return k && !beforeByKey[k]; }).map((r) => r.label);
    const removed = before.rules.filter((r) => { const k = refineRuleKey(r); return k && !afterByKey[k]; }).map((r) => r.label);
    const changed = [];
    let kept = 0;
    after.rules.forEach((r) => {
      const k = refineRuleKey(r); if (!k || !beforeByKey[k]) return;
      const b = beforeByKey[k];
      const diff = numberOrDefault(r.points, 0) !== numberOrDefault(b.points, 0)
        || numberOrDefault(r.goal, 0) !== numberOrDefault(b.goal, 0)
        || numberOrDefault(r.every, 0) !== numberOrDefault(b.every, 0)
        || String(r.style || "") !== String(b.style || "");
      if (diff) changed.push(r.label); else kept += 1;
    });
    const list = (arr) => arr.slice(0, 3).map((x) => `“${String(x)}”`).join(", ") + (arr.length > 3 ? ` +${arr.length - 3}` : "");
    const parts = [];
    if (added.length) parts.push(`Added ${list(added)}`);
    if (removed.length) parts.push(`Removed ${list(removed)}`);
    if (changed.length) parts.push(`Updated ${list(changed)}`);
    if (!parts.length) {
      if (String(before.title || "") !== String(after.title || "") && after.title) return `Done — renamed it to “${after.title}” · kept your ${plural(kept, "rule")}.`;
      return ""; // nothing structural detected → caller falls back to the AI's own note
    }
    return `Done — ${parts.join("; ")}${kept ? ` · kept your other ${plural(kept, "rule")}` : ""}.`;
  }

  // Reject anything that isn't the exact shape with sane values, so we NEVER apply
  // broken AI data to the draft.
  function validateAiSystem(system) {
    if (!system || typeof system !== "object") return false;
    if (!Array.isArray(system.rules) || system.rules.length === 0 || system.rules.length > 24) return false;
    const styles = ["goal", "every", "yesNo"];
    return system.rules.every((rule) => {
      if (!rule || typeof rule !== "object") return false;
      if (typeof rule.label !== "string" || !rule.label.trim()) return false;
      const points = Number(rule.points);
      if (!Number.isFinite(points) || Math.abs(points) > 50) return false;
      const goal = Number(rule.goal);
      if (!Number.isFinite(goal) || goal < 0 || goal > 1e7) return false;
      if (rule.every !== undefined && rule.every !== null && rule.every !== "") {
        const every = Number(rule.every);
        if (!Number.isFinite(every) || every < 0 || every > 1e7) return false;
      }
      if (rule.style !== undefined && rule.style !== null && rule.style !== "" && !styles.includes(String(rule.style))) return false;
      return true;
    });
  }

  // Convert the app-shape draft back to the simple AI shape (fallback refine source
  // if no raw system was stored, e.g. after an offline starter template).
  function aiShapeRuleFromAppRule(ruleInput) {
    const r = scoring.normalizeRule(ruleInput);
    let style = "goal";
    let goal = numberOrDefault(r.dailyTarget, 0);
    let every = 0;
    let points = numberOrDefault(r.goalPoints, 1);
    let tier = "core";
    if (r.simpleStyle === "yesNo") { style = "yesNo"; goal = 0; points = numberOrDefault(r.yesNoPoints, r.goalPoints); }
    else if (r.simpleStyle === "every") { style = "every"; every = numberOrDefault(r.everyAmount, 1); points = numberOrDefault(r.everyPoints, 1); }
    else if (r.simpleStyle === "both") { style = "every"; every = numberOrDefault(r.everyAmount, 1); points = numberOrDefault(r.everyPoints, r.goalPoints); }
    else if (r.simpleStyle === "penalty") { style = "goal"; goal = numberOrDefault(r.minimumRequired, r.dailyTarget); points = -Math.abs(numberOrDefault(r.penaltyPoints, 1)); tier = "penalty"; }
    if (numberOrDefault(points, 0) < 0) tier = "penalty";
    return { label: r.label, category: r.category, unit: r.unit, style: style, goal: goal, every: every, points: points, tier: tier };
  }
  function appSystemToAiShape(appSystem) {
    const s = normalizeSystem(appSystem || {});
    return {
      title: s.title || "",
      category: s.category || "",
      description: s.description || "",
      explanation: s.aiExplanation || "",
      rules: (s.rules || []).map(aiShapeRuleFromAppRule)
    };
  }

  function renderAiChatMessages() {
    const chat = Array.isArray(state.aiDraftChat) ? state.aiDraftChat : [];
    const rows = chat.map((m) => `<div class="ai-chat-msg ai-chat-${m.role === "user" ? "user" : "ai"}">${escapeHtml(m.text)}</div>`);
    if (aiRefining) rows.push(`<div class="ai-chat-msg ai-chat-ai ai-chat-pending">Thinking…</div>`);
    if (!rows.length) return `<div class="ai-chat-empty">Tell the AI what to change — e.g. “raise protein to 180g and add a stretching rule”.</div>`;
    return rows.join("");
  }

  // Refine the current draft from a typed instruction (or a preset's canned line) via
  // the SAME Edge Function. Validates before applying; on any failure the previous
  // draft is kept and a clean message is shown — never apply broken data or crash.
  async function refineAiDraft(instruction, presetKind) {
    if (!state.aiDraftSystem) return;
    const text = String(instruction || "").trim();
    if (!text) return;
    if (aiRefining || aiGenerating) { showToast("Hang on — still working on the last change."); return; }
    aiImproveOpen = true;
    pushAiChat("user", presetKind ? (AI_PRESET_LABELS[presetKind] || text) : text);

    // Offline: presets fall back to the local adjustment regenerate; free-text needs the API.
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.generateRules !== "function") {
      if (presetKind && AI_IMPROVEMENTS[presetKind]) {
        pushAiChat("ai", "Applied that preset offline.");
        saveState();
        renderSystems();
        await applyAiImprovement(presetKind);
        // The local regenerate replaced the visible draft but not the raw system, so
        // drop the raw — the next refine derives `current` from the current draft.
        state.aiDraftRawSystem = null;
        return;
      }
      pushAiChat("ai", "Connect your account to refine with the AI — your system is unchanged.");
      saveState();
      renderSystems();
      return;
    }

    aiRefining = true;
    saveState();
    renderSystems(); // shows the user message + a "Thinking…" line
    try {
      // Base every refine on the LIVE draft (which includes the user's manual edits) — never a
      // stale cached AI response, which would silently discard those edits ("reverts to the same thing").
      const current = appSystemToAiShape(state.aiDraftSystem);
      const history = (state.aiDraftChat || []).slice(-8).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));
      const res = await window.PointwellSignals.generateRules({ mode: "refine", current: current, instruction: text, history: history, kind: draftAudience });
      if (res.error || !res.system || !validateAiSystem(res.system)) {
        pushAiChat("ai", "Couldn't apply that — the AI response wasn't valid, so nothing changed. Try rephrasing.");
      } else {
        state.aiDraftRawSystem = res.system;
        state.aiDraftSystem = buildAiDraftFromAiSystem(res.system, state.aiDraftInputs || readAiFormInputs(), state.aiDraftAdjustments || blankAiAdjustments());
        // Confirm what ACTUALLY changed (before/after diff), falling back to the AI's own note.
        pushAiChat("ai", refineDiffSummary(current, res.system) || refineConfirmation(res.system));
      }
    } catch (e) {
      pushAiChat("ai", "Something went wrong reaching the AI — your system is unchanged.");
    } finally {
      aiRefining = false;
      saveState();
      renderSystems();
    }
  }

  async function recordAiFeedback(type) {
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
      if (aiGenerating) { showToast("Still generating — try again in a moment"); return; }
      await regenerateAiDraft();
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
    // Preserve any in-progress chat text/focus across this rebuild (restored after).
    const prevChatEl = document.getElementById("aiChatInput");
    const prevChatValue = prevChatEl ? prevChatEl.value : "";
    const prevChatFocused = !!prevChatEl && document.activeElement === prevChatEl;
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
          <button class="secondary-button small" type="button" id="aiImproveToggle" aria-expanded="${aiImproveOpen ? "true" : "false"}">Improve this system</button>
          <div class="ai-improve-panel" id="aiImprovePanel"${aiImproveOpen ? "" : " hidden"}>
            <span class="eyebrow">Quick changes</span>
            <div class="ai-feedback-row">
              ${improveButtons.map((item) => `<button class="ghost-button small" type="button" data-ai-improve="${item.kind}">${escapeHtml(item.label)}</button>`).join("")}
            </div>
            <span class="eyebrow">Or tell the AI what to change</span>
            <div class="ai-chat-log" id="aiChatLog">${renderAiChatMessages()}</div>
            <form class="ai-chat-form" id="aiChatForm">
              <input class="ai-chat-input" id="aiChatInput" type="text" autocomplete="off" placeholder="e.g. raise protein to 180g and add a stretching rule"${(aiRefining || aiGenerating) ? " disabled" : ""}>
              <button class="primary-button small" type="submit"${(aiRefining || aiGenerating) ? " disabled" : ""}>Send</button>
            </form>
          </div>
        </div>
        <p class="review-note">Use this system to open the full setup editor and customize every rule.</p>
      </div>
    `;
    document.getElementById("useAiDraftButton")?.addEventListener("click", useAiDraftSystem);
    document.getElementById("editAiPromptButton")?.addEventListener("click", () => {
      state.aiDraftSystem = null;
      state.aiDraftRawSystem = null;
      state.aiDraftChat = [];
      aiImproveOpen = false;
      saveState();
      renderSystems();
      requestAnimationFrame(() => els.aiGoalsInput?.focus());
    });
    document.getElementById("aiImproveToggle")?.addEventListener("click", () => {
      aiImproveOpen = !aiImproveOpen;
      const panel = document.getElementById("aiImprovePanel");
      if (panel) panel.hidden = !aiImproveOpen;
      if (aiImproveOpen) requestAnimationFrame(() => document.getElementById("aiChatInput")?.focus());
    });
    Array.from(els.aiDraftReview.querySelectorAll("[data-ai-feedback]")).forEach((button) => {
      button.addEventListener("click", () => recordAiFeedback(button.dataset.aiFeedback));
    });
    // Preset chips and the free-text chat feed the SAME refine path.
    Array.from(els.aiDraftReview.querySelectorAll("[data-ai-improve]")).forEach((button) => {
      button.addEventListener("click", () => refineAiDraft(cannedInstructionForPreset(button.dataset.aiImprove), button.dataset.aiImprove));
    });
    const chatForm = document.getElementById("aiChatForm");
    if (chatForm) {
      chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = document.getElementById("aiChatInput");
        const text = input ? input.value.trim() : "";
        if (!text) return;
        // Guard BEFORE clearing so a submit during a busy window never loses the text.
        if (aiRefining || aiGenerating) { showToast("Hang on — still working on the last change."); return; }
        input.value = "";
        aiChatFocusWanted = true; // re-focus after the refine completes (input is disabled mid-flight)
        refineAiDraft(text);
      });
    }
    // Restore any in-progress chat text + focus (a background render can rebuild this
    // panel), and keep the log scrolled to the newest message.
    const chatInputEl = document.getElementById("aiChatInput");
    if (chatInputEl && !aiRefining) {
      if (prevChatValue) chatInputEl.value = prevChatValue;
      if (prevChatFocused || aiChatFocusWanted) { chatInputEl.focus(); aiChatFocusWanted = false; }
    }
    const chatLog = document.getElementById("aiChatLog");
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
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

    const filter = communityListFilter.trim().toLowerCase();
    const matches = filter
      ? state.communities.filter((community) => communitySearchText(community).includes(filter))
      : state.communities.slice();

    if (!state.communities.length) {
      els.communityList.innerHTML = emptyState("No communities yet.");
    } else if (!matches.length) {
      els.communityList.innerHTML = emptyState("No communities match your search.");
    } else {
      // Active = has members active today (or a real-sized group); dormant ones drop
      // under a subtle INACTIVE heading as compact rows.
      const active = matches.filter((community) => !communityIsDormant(community));
      const inactive = matches.filter((community) => communityIsDormant(community));
      let html = "";
      if (active.length) {
        html += `<div class="community-grid">${active.map(renderCommunityCard).join("")}</div>`;
      }
      if (inactive.length) {
        // Dormant communities are collapsed behind a tappable header by default; the
        // open/closed choice persists in state.inactiveCommunitiesOpen.
        const open = !!state.inactiveCommunitiesOpen;
        html += `
          <div class="community-inactive">
            <button type="button" class="community-inactive-toggle" data-toggle-inactive aria-expanded="${open ? "true" : "false"}">
              <span class="community-inactive-label">Inactive (${inactive.length})</span>
              <span class="community-inactive-caret" aria-hidden="true">${open ? "▴" : "▾"}</span>
            </button>
            <div class="community-inactive-list"${open ? "" : " hidden"}>${inactive.map(renderCommunityInactiveRow).join("")}</div>
          </div>`;
      }
      els.communityList.innerHTML = html;
    }

    Array.from(els.communityList.querySelectorAll("[data-community-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedCommunityId = button.dataset.communityId;
        state.communityDraftInputs = {};
        state.worldDetailType = "community";
        state.activeView = "community-detail";
        saveState();
        render();
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    });

    const inactiveToggle = els.communityList.querySelector("[data-toggle-inactive]");
    if (inactiveToggle) {
      inactiveToggle.addEventListener("click", () => {
        state.inactiveCommunitiesOpen = !state.inactiveCommunitiesOpen;
        saveState();
        renderCommunities();
      });
    }

    renderCommunityDetail();
  }

  // ── Recent activity feed (the Feed tab) — Instagram-style posts ─────────────
  // Chronological community check-ins, built from the entries already in state. Each
  // post is one member's per-rule day (community_entries.id). Likes + comments are
  // server truth (feed-social.sql) cached per entry id and fetched lazily.
  const feedSocialCache = new Map();   // entryId -> { like_count, comment_count, liked_by_me, last_comment_name, last_comment_body }
  const feedCommentsCache = new Map(); // entryId -> [ comment rows ]
  const feedCommentsOpen = new Set();  // entryIds whose full thread is expanded
  const feedCaptionOpen = new Set();   // entryIds whose long caption is expanded ("… more")
  const feedSavedEntries = new Set();  // entryIds bookmarked this session (local-only, no backend)
  const feedSocialFetched = new Set(); // entryIds already requested (prevents refetch loops)
  let feedItems = [];
  // Discover (ranked public feed) state — fetched once per session via the discover_feed RPC.
  let discoverFeedRows = [];     // raw rows from discover_feed
  let discoverFeedItems = [];    // mapped into the { entry, community, member, rule, when, discover } shape
  let discoverLoading = false;
  let discoverLoaded = false;

  // A real DB id (uuid) means likes/comments can attach; a just-logged local entry
  // (makeId("community-entry")) cannot until the next loadCommunitiesFromDb().
  function isDbEntryId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
  }

  function feedSocialFor(entryId) {
    return feedSocialCache.get(String(entryId)) || { like_count: 0, comment_count: 0, liked_by_me: false, last_comment_name: "", last_comment_body: "" };
  }

  // Preserve any half-typed comment drafts (+ which one is focused) across a feed
  // rebuild so an unrelated re-render never wipes what someone is typing.
  function captureFeedDrafts(root) {
    const drafts = {};
    if (!root) return drafts;
    Array.from(root.querySelectorAll("[data-feed-comment-input]")).forEach((input) => {
      if (input.value) drafts[input.dataset.feedCommentInput] = { value: input.value, focused: document.activeElement === input };
    });
    return drafts;
  }

  function restoreFeedDrafts(root, drafts) {
    if (!root || !drafts) return;
    Object.keys(drafts).forEach((entryId) => {
      const input = root.querySelector(`[data-feed-comment-input="${entryId}"]`);
      if (!input) return;
      input.value = drafts[entryId].value;
      const post = input.parentElement && input.parentElement.querySelector(".ig-comment-post");
      if (post) post.disabled = !input.value.trim();
      if (drafts[entryId].focused) { input.focus(); const n = input.value.length; try { input.setSelectionRange(n, n); } catch (e) { /* ignore */ } }
    });
  }

  // ── Feed tabs: Friends (existing community feed) | Discover (ranked public feed) ──
  const FEED_TABS = [{ id: "friends", label: "Friends" }, { id: "discover", label: "Discover" }];

  function currentFeedTab() {
    return state.feedTab === "discover" ? "discover" : "friends";
  }

  function renderFeed() {
    renderFeedTabs();
    renderActiveFeed();
  }

  // The post count now lives on the compact header line (next to "Feed"), not in a per-list
  // "Recent activity / N updates" subheader row. "" clears it (loading / signed-out / empty).
  function setFeedCount(text) {
    if (els.feedCount) els.feedCount.textContent = text || "";
  }

  function renderFeedTabs() {
    if (!els.feedTabs) return;
    const tab = currentFeedTab();
    els.feedTabs.innerHTML = FEED_TABS.map((t) =>
      `<button class="segmented-button${t.id === tab ? " active" : ""}" type="button" role="tab" aria-selected="${t.id === tab ? "true" : "false"}" data-feed-tab="${t.id}">${escapeHtml(t.label)}</button>`
    ).join("");
  }

  // Render whichever feed the active tab selects — both render into #communityFeed so
  // the existing like/comment/photo delegation + feedItems plumbing is reused as-is.
  function renderActiveFeed() {
    if (currentFeedTab() === "discover") renderDiscoverFeed();
    else renderCommunityFeed();
  }

  function onFeedTabClick(event) {
    const btn = event.target.closest && event.target.closest("[data-feed-tab]");
    if (!btn) return;
    const tab = btn.dataset.feedTab === "discover" ? "discover" : "friends";
    if (currentFeedTab() === tab) return;
    state.feedTab = tab;
    saveState();
    if (tab === "discover" && !discoverLoaded && !discoverLoading) loadDiscoverFeed();
    renderFeed();
  }

  // Caller's interest categories: personal systems' rule categories + the categories of
  // communities they're in (deduped). Kept split so the affinity tag can say whether a
  // match came from a system ("Like your X") or a community ("Popular in X").
  function discoverCallerCatSets() {
    const system = new Set();
    const community = new Set();
    const norm = (c) => String(c || "").trim();
    (state.systems || []).forEach((s) => {
      if (norm(s.category)) system.add(norm(s.category));
      (s.rules || []).forEach((r) => { const c = norm(scoring.normalizeRule(r).category); if (c) system.add(c); });
    });
    (state.communities || []).forEach((cm) => {
      if (norm(cm.category)) community.add(norm(cm.category));
      const sys = cm.system || { rules: [] };
      (sys.rules || []).forEach((r) => { const c = norm(scoring.normalizeRule(r).category); if (c) community.add(c); });
    });
    return { system: system, community: community };
  }

  function callerDiscoverCategories() {
    const sets = discoverCallerCatSets();
    return Array.from(new Set([...sets.system, ...sets.community]));
  }

  // Fetch the ranked public feed once per session. Never throws (the RPC enforces all
  // visibility server-side); on any failure we simply show the empty state.
  async function loadDiscoverFeed() {
    if (discoverLoading) return;
    discoverLoading = true;
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.discoverFeed !== "function") {
      discoverFeedRows = [];
      discoverFeedItems = [];
      discoverLoading = false;
      discoverLoaded = true;
      if (state.activeView === "feed" && currentFeedTab() === "discover") renderActiveFeed();
      return;
    }
    let rows = [];
    try {
      rows = await window.PointwellSignals.discoverFeed(callerDiscoverCategories(), null, 30);
    } catch (error) {
      rows = [];
    }
    discoverFeedRows = Array.isArray(rows) ? rows : [];
    discoverFeedItems = discoverFeedRows.map(mapDiscoverRowToItem).filter(Boolean);
    discoverLoading = false;
    discoverLoaded = true;
    if (state.activeView === "feed" && currentFeedTab() === "discover") renderActiveFeed();
  }

  // Shape a discover_feed row into the { entry, community, member, rule, when, discover }
  // item renderFeedPost expects. rule is null + entry.unit "done", so the metric helpers
  // (entryMetricText / entryLogText) fall back to just the activity label (we don't have the
  // source community's rule config here).
  function mapDiscoverRowToItem(row) {
    if (!row || !row.entry_id) return null;
    const authorId = String(row.author_id || "");
    const matched = row.matched_category ? String(row.matched_category).trim() : "";
    const sets = discoverCallerCatSets();
    let reason = "Suggested for you";
    if (matched) {
      if (sets.system.has(matched)) reason = `Like your ${matched} system`;
      else if (sets.community.has(matched)) reason = `Popular in ${matched}`;
      else reason = `Matches your ${matched}`;
    }
    return {
      entry: {
        id: row.entry_id,
        userId: authorId,
        ruleId: row.rule_id || "",
        label: row.rule_id || "Check-in",
        unit: "done",
        amount: numberOrDefault(row.amount, 0),
        message: row.message || "",
        photoPath: row.photo_path || "",
        timestamp: row.updated_at || "",
        dateKey: row.entry_date || ""
      },
      community: { id: row.community_id || "", name: row.community_name || "Community", category: row.community_category || "" },
      member: { id: authorId, userId: authorId, name: row.author_name || "Member", handle: row.author_handle || "", avatarUrl: row.author_avatar_url || "", color: "#355d91" },
      rule: null,
      when: row.updated_at || "",
      discover: { authorId: authorId, reason: reason, matched: matched, following: false, score: numberOrDefault(row.score, 0) }
    };
  }

  // + Follow on a Discover card — reuses the follow signal; flips to "Following" in place
  // (no reload). Followed authors are excluded from future discover_feed loads server-side.
  function followFromDiscover(authorId, btn) {
    if (!signalsReady()) { showToast("Sign in to follow"); return; }
    if (!authorId || !window.PointwellSignals || typeof window.PointwellSignals.followUser !== "function") return;
    const card = btn.closest && btn.closest("[data-feed-entry]");
    const item = card && feedItemById(card.dataset.feedEntry);
    if (item && item.discover) item.discover.following = true;
    const span = document.createElement("span");
    span.className = "ig-following";
    span.textContent = "Following";
    btn.replaceWith(span);
    Promise.resolve(window.PointwellSignals.followUser(authorId)).then((res) => {
      if (res && res.error) showToast("Couldn't follow — try again");
      else showToast("Following");
    }).catch(() => showToast("Couldn't follow — try again"));
  }

  function renderDiscoverFeed() {
    if (!els.communityFeed) return;
    if (!signalsReady()) {
      feedItems = [];
      setFeedCount("");
      els.communityFeed.hidden = false;
      els.communityFeed.innerHTML = emptyState("Sign in to discover public posts.");
      return;
    }
    if (!discoverLoaded && !discoverLoading) loadDiscoverFeed();
    if (discoverLoading && !discoverLoaded) {
      feedItems = [];
      setFeedCount("");
      els.communityFeed.hidden = false;
      els.communityFeed.innerHTML = `<p class="feed-discover-loading">Finding posts like yours…</p>`;
      return;
    }
    feedItems = discoverFeedItems;
    setFeedCount(feedItems.length ? plural(feedItems.length, "post") : "");
    const drafts = captureFeedDrafts(els.communityFeed);
    els.communityFeed.hidden = false;
    els.communityFeed.innerHTML = feedItems.length
      ? `<div class="community-feed-list">${feedItems.map(renderFeedPost).join("")}</div>`
      : emptyState("No similar public posts yet — try following people or making your profile public.");
    bindEntryPhotos(els.communityFeed);
    bindFeedDelegation();
    restoreFeedDrafts(els.communityFeed, drafts);
    fetchFeedSocial();
  }

  function renderCommunityFeed() {
    if (!els.communityFeed) return;
    feedItems = (state.communityEntries || [])
      .map(buildFeedItemForEntry)
      .filter(Boolean)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)))
      .slice(0, 15);

    // Hide entirely when there's nothing to show (no joined communities at all);
    // show a friendly empty state when you have communities but no logs yet.
    if (!feedItems.length && !state.communities.length) {
      els.communityFeed.hidden = true;
      els.communityFeed.innerHTML = "";
      setFeedCount("");
      return;
    }
    setFeedCount(feedItems.length ? plural(feedItems.length, "update") : "");
    const drafts = captureFeedDrafts(els.communityFeed);
    els.communityFeed.hidden = false;
    els.communityFeed.innerHTML = feedItems.length
      ? `<div class="community-feed-list">${feedItems.map(renderFeedPost).join("")}</div>`
      : emptyState("No check-ins yet — log a community day and it'll show up here.");
    bindEntryPhotos(els.communityFeed);
    bindFeedDelegation();
    restoreFeedDrafts(els.communityFeed, drafts);
    fetchFeedSocial();
  }

  // Pull like/comment counts (+ liked_by_me + latest-comment preview) for the visible
  // posts in one call; re-render once when they arrive. The fetched-set guards against
  // a refetch loop (the re-render re-enters here with every id already requested).
  // The feed-post component is reused on the Feed tab AND the world-detail page; these resolve
  // the live surface so social refreshes/in-place card swaps target the one on screen.
  function activeFeedRoot() {
    if (postOverlayItem) { const ov = document.querySelector("[data-post-overlay] .community-feed-list"); if (ov) return ov; }
    if (state.activeView === "community-detail") { const w = currentDetailWorld(); if (w && w.type === "community" && els.worldPosts) return els.worldPosts; }
    return els.communityFeed;
  }
  function refreshActiveFeedSurface() {
    if (state.activeView === "community-detail") { const w = currentDetailWorld(); if (w && w.type === "community") { renderWorldPosts(w); return; } }
    renderActiveFeed();
  }

  function fetchFeedSocial() {
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.getEntriesSocial !== "function") return;
    const missing = feedItems
      .map((item) => item.entry.id)
      .filter((id) => isDbEntryId(id) && !feedSocialFetched.has(String(id)));
    if (!missing.length) return;
    missing.forEach((id) => feedSocialFetched.add(String(id)));
    Promise.resolve(window.PointwellSignals.getEntriesSocial(missing)).then((rows) => {
      let any = false;
      (rows || []).forEach((r) => {
        if (r && r.entry_id) {
          feedSocialCache.set(String(r.entry_id), {
            like_count: Number(r.like_count) || 0,
            comment_count: Number(r.comment_count) || 0,
            liked_by_me: !!r.liked_by_me,
            last_comment_name: r.last_comment_name || "",
            last_comment_body: r.last_comment_body || ""
          });
          any = true;
        }
      });
      if (any) refreshActiveFeedSurface();
    }).catch(() => {});
  }

  const FEED_HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
  const FEED_COMMENT_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>`;
  const FEED_SHARE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
  const FEED_SAVE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

  function renderFeedPost(item) {
    const entry = item.entry;
    const entryId = String(entry.id);
    const isMe = entry.userId === "me";
    const isDiscover = !!item.discover;
    const name = escapeHtml(item.member.name || "Member");
    const points = item.rule ? scoring.calculateRule(item.rule, entry.amount).totalPoints : 0;
    const rel = window.PointwellSignals.formatRelativeTime(item.when, Date.now()) || "";
    const relText = rel === "just now" || !rel ? (rel || "") : rel + " ago";
    const sub = escapeHtml(item.community.name) + (relText ? " · " + escapeHtml(relText) : "");
    const goal = item.rule ? goalAmountForRule(item.rule) : 0;
    const milestone = goal > 0 && numberOrDefault(entry.amount, 0) >= goal;
    // A post upgraded from a wearable sync keeps a small "via Fitbit" badge.
    const viaBadge = REAL_WEARABLE_SOURCES.has(entry.viaSource)
      ? `<span class="via-source-tag">via ${escapeHtml(wearableShortLabel(entry.viaSource))}</span>`
      : "";
    const canSocial = signalsReady() && isDbEntryId(entry.id);
    const social = feedSocialFor(entryId);

    const photoPath = entry.photoPath || entry.photo_path || "";
    const message = entry.message ? String(entry.message) : "";
    // Feed size rhythm: a logged-progress-ONLY post (no real caption AND no photo — just a logged
    // metric) renders COMPACT (a one-line "logged X" card), NOT a big media/gradient block. A real
    // caption → the style-B medium card; a photo → full media.
    const isLoggedOnly = !photoPath && !message;
    const metricText = isLoggedOnly ? entryMetricText(entry, item.rule) : "";
    // Multi-photo marker (dormant until posts carry >1 photo).
    const carousel = Number(entry.photo_count) > 1 ? `<span class="ig-carousel" aria-hidden="true">⧉</span>` : "";
    // Media (non-compact only): a photo, or the style-B caption card with a thin accent bar.
    let mediaHtml = "";
    if (photoPath) {
      mediaHtml = `<div class="ig-photo" data-entry-photo="${escapeHtml(photoPath)}" role="img" aria-label="Post photo"><img alt="" loading="lazy">${carousel}</div>`;
    } else if (message) {
      const tileColor = dayScheduleColor(entry.ruleId || entry.communityId || entryId);
      // Style B: caption with a thin vertical accent bar (bright → darker same hue), auto-height.
      mediaHtml = `<div class="ig-textbody"><span class="ig-textbody-accent" style="background:linear-gradient(180deg, ${tileColor}, ${shadeHex(tileColor, 0.5)})" aria-hidden="true"></span><p>${escapeHtml(message)}</p></div>`;
    }

    // ⋯ menu: your OWN post → Delete (author-only; DB-enforced via RLS). Someone else's → Message.
    // Discover posts (never yours) keep no menu. Delete shows for own posts whether DB-backed or local.
    const menuInner = isMe
      ? `<button type="button" class="ig-menu-del" data-feed-delete="${escapeHtml(entryId)}">🗑 Delete post</button>`
      : `<button type="button" data-feed-menu-msg>Message ${escapeHtml(memberFirstName(item.member))}</button>`;
    const menuHtml = isDiscover ? "" : `
        <div class="ig-menu-wrap" data-feed-menu-wrap>
          <button class="ig-menu" type="button" data-feed-menu aria-haspopup="true" aria-expanded="false" aria-label="More options">⋯</button>
          <div class="ig-menu-pop" hidden>
            ${menuInner}
          </div>
        </div>`;

    // Progress tag in the header (rule glyph + label + signed points), e.g. "🏋️ Workout +2".
    const tagHtml = item.rule
      ? `<span class="ig-tag">${draftRuleIcon(item.rule)} ${escapeHtml(item.rule.label)} ${escapeHtml(formatSigned(points))}</span>`
      : "";
    const affinityHtml = (isDiscover && item.discover.reason)
      ? `<span class="ig-affinity">${escapeHtml(item.discover.reason)}</span>`
      : "";

    const likeBtn = canSocial
      ? `<button class="ig-action-btn${social.liked_by_me ? " is-liked" : ""}" type="button" data-feed-like="${escapeHtml(entryId)}" aria-pressed="${social.liked_by_me ? "true" : "false"}" aria-label="${social.liked_by_me ? "Unlike" : "Like"}">${FEED_HEART_SVG}</button>`
      : "";
    const commentBtn = canSocial
      ? `<button class="ig-action-btn" type="button" data-feed-comment-focus="${escapeHtml(entryId)}" aria-label="Comment">${FEED_COMMENT_SVG}</button>`
      : "";
    const shareBtn = `<button class="ig-action-btn" type="button" data-feed-share="${escapeHtml(entryId)}" aria-label="Share">${FEED_SHARE_SVG}</button>`;
    const saved = feedSavedEntries.has(entryId);
    const saveBtn = `<button class="ig-action-btn ig-action-save${saved ? " is-saved" : ""}" type="button" data-feed-save="${escapeHtml(entryId)}" aria-pressed="${saved ? "true" : "false"}" aria-label="${saved ? "Saved" : "Save"}">${FEED_SAVE_SVG}</button>`;
    // Discover-only: a + Follow button (reuses the follow signal).
    const followBtn = (isDiscover && signalsReady() && item.discover.authorId)
      ? (item.discover.following
          ? `<span class="ig-following">Following</span>`
          : `<button class="ig-action-follow" type="button" data-discover-follow="${escapeHtml(item.discover.authorId)}"><span aria-hidden="true">+</span> Follow</button>`)
      : "";

    // Like-count line + zero state.
    const likeLine = canSocial
      ? (social.like_count > 0
          ? `<div class="ig-likes">${plural(social.like_count, "like")}</div>`
          : `<div class="ig-likes-zero">Be the first to like this</div>`)
      : "";
    // Caption line — only for photo posts (text-only posts already show the caption as the media),
    // with a "… more" truncation for long captions.
    const captionHtml = (photoPath && message)
      ? `<div class="ig-caption"><span class="ig-name">${name}</span>${captionWithMore(message, entryId)}</div>`
      : "";
    const commentsHtml = renderFeedComments(item, canSocial, social);
    const timeHtml = relText ? `<div class="ig-time">${escapeHtml(relText.toUpperCase())}</div>` : "";
    const inputHtml = canSocial ? renderFeedCommentInput(entryId) : "";
    // The author avatar+name is tappable → opens their profile (not for your own posts).
    const authorId = item.member && item.member.userId ? String(item.member.userId) : "";
    const authorTap = !isMe && authorId && authorId !== "me";
    const authorOpen = authorTap ? `<button class="ig-author" type="button" data-feed-author="${escapeHtml(authorId)}" aria-label="View ${name}'s profile">` : `<div class="ig-author ig-author-static">`;
    const authorClose = authorTap ? `</button>` : `</div>`;

    // Compact logged-progress card: a one-line "{name} logged {metric}" header + the progress tag
    // + the like/comment row (no media block, no separate likes/time line — the time is in the
    // sub). Keeps tap-to-open (author) + like/comment via the same reused buttons/handlers.
    if (isLoggedOnly) {
      const compactCount = (canSocial && social.like_count > 0)
        ? `<span class="ig-compact-count">${escapeHtml(plural(social.like_count, "like"))}</span>` : "";
      // Stays a tight one-line card until you engage: the composer (comments + input) appears only
      // once you tap 💬 (which expands the thread) or there's already a conversation. So the comment
      // button focuses the visible input when expanded, and otherwise reveals it.
      const compactExpanded = feedCommentsOpen.has(entryId) || (canSocial && social.comment_count > 0);
      const compactCommentBtn = canSocial
        ? (compactExpanded
            ? commentBtn
            : `<button class="ig-action-btn" type="button" data-feed-expand="${escapeHtml(entryId)}" aria-label="Comment">${FEED_COMMENT_SVG}</button>`)
        : "";
      return `
        <article class="ig-card ig-card-compact${milestone ? " is-milestone" : ""}" data-feed-entry="${escapeHtml(entryId)}">
          <div class="ig-card-header ig-compact-header">
            ${authorOpen}
              ${renderAvatar({ className: "member-avatar ig-compact-avatar", name: item.member.name, color: item.member.color || "#355d91", avatarUrl: item.member.avatarUrl })}
              <div class="ig-head-main">
                <p class="ig-compact-line"><strong>${name}</strong> logged <strong class="ig-compact-metric">${escapeHtml(metricText)}</strong></p>
                <span class="ig-head-sub">${sub}</span>
              </div>
            ${authorClose}
            ${viaBadge}
            ${isDiscover ? affinityHtml : tagHtml}
            ${menuHtml}
          </div>
          <div class="ig-actions ig-compact-actions">
            ${likeBtn}
            ${compactCommentBtn}
            ${shareBtn}
            ${followBtn}
            ${saveBtn}
            ${compactCount}
          </div>
          ${compactExpanded ? commentsHtml + inputHtml : ""}
        </article>
      `;
    }

    return `
      <article class="ig-card${milestone ? " is-milestone" : ""}" data-feed-entry="${escapeHtml(entryId)}">
        <div class="ig-card-header">
          ${authorOpen}
            ${renderAvatar({ name: item.member.name, color: item.member.color || "#355d91", avatarUrl: item.member.avatarUrl })}
            <div class="ig-head-main">
              <span class="ig-head-name">${name}</span>
              <span class="ig-head-sub">${sub}</span>
            </div>
          ${authorClose}
          ${viaBadge}
          ${isDiscover ? affinityHtml : tagHtml}
          ${menuHtml}
        </div>
        ${mediaHtml}
        <div class="ig-actions">
          ${likeBtn}
          ${commentBtn}
          ${shareBtn}
          ${followBtn}
          ${saveBtn}
        </div>
        ${likeLine}
        ${captionHtml}
        ${commentsHtml}
        ${timeHtml}
        ${inputHtml}
      </article>
    `;
  }

  // Caption with an Instagram-style "… more" truncation; "more" expands it in place.
  function captionWithMore(message, entryId) {
    const LIMIT = 140;
    const id = String(entryId);
    if (feedCaptionOpen.has(id) || message.length <= LIMIT) return escapeHtml(message);
    return escapeHtml(message.slice(0, LIMIT).replace(/\s+\S*$/, "")) + `… <button class="ig-caption-more" type="button" data-feed-caption-expand="${escapeHtml(id)}">more</button>`;
  }

  function renderFeedComments(item, canSocial, social) {
    if (!canSocial) return "";
    const entryId = String(item.entry.id);
    const count = social.comment_count || 0;
    if (!count) return `<div class="ig-comments"><div class="ig-nocomment">No comments yet — start the conversation.</div></div>`;
    if (feedCommentsOpen.has(entryId)) {
      const rows = feedCommentsCache.get(entryId);
      if (!rows) return `<div class="ig-comments"><div class="ig-comment">Loading…</div></div>`;
      const list = rows.map((c) => `<div class="ig-comment"><span class="ig-name">${escapeHtml(c.display_name || "Member")}</span>${escapeHtml(c.body || "")}</div>`).join("");
      return `<div class="ig-comments">${list}</div>`;
    }
    // Collapsed: a "View all" link (when >1) + the most-recent comment preview.
    const more = count > 1 ? `<button class="ig-comments-more" type="button" data-feed-expand="${escapeHtml(entryId)}">View all ${count} comments</button>` : "";
    const last = social.last_comment_body
      ? `<div class="ig-comment"><span class="ig-name">${escapeHtml(social.last_comment_name || "Member")}</span>${escapeHtml(social.last_comment_body)}</div>`
      : "";
    return (more || last) ? `<div class="ig-comments">${more}${last}</div>` : "";
  }

  function renderFeedCommentInput(entryId) {
    return `
      <div class="ig-comment-input">
        ${renderAvatar({ name: state.profile.name, color: state.profile.accent || "#355d91", avatarUrl: state.profile.avatarUrl })}
        <form data-feed-comment-form="${escapeHtml(entryId)}">
          <input type="text" data-feed-comment-input="${escapeHtml(entryId)}" placeholder="Add a comment…" maxlength="2000" autocomplete="off" aria-label="Add a comment">
          <button type="submit" class="ig-comment-post" disabled>Post</button>
        </form>
      </div>
    `;
  }

  // One delegated set of listeners on the feed container (bound once) — survives the
  // innerHTML re-renders and avoids per-card rebinding.
  function bindFeedDelegation() {
    const root = els.communityFeed;
    if (!root || root.dataset.feedBound === "1") return;
    root.dataset.feedBound = "1";
    root.addEventListener("click", onFeedClick);
    root.addEventListener("input", onFeedInput);
    root.addEventListener("submit", onFeedSubmit);
  }

  // The single post shown in the in-place overlay (openEntryPost), or null. Module-level so the shared
  // feed handlers resolve its card by id even though it isn't part of feedItems.
  let postOverlayItem = null;
  let postOverlayOpenView = ""; // the view active when the overlay opened → dismiss it if navigation changes the view

  function feedItemById(entryId) {
    if (postOverlayItem && String(postOverlayItem.entry.id) === String(entryId)) return postOverlayItem;
    return feedItems.find((item) => String(item.entry.id) === String(entryId)) || null;
  }

  // The {entry, community, member, rule, when} feed-item shape for one loaded entry — shared by the
  // community feed and the post overlay so a post renders identically wherever it's opened.
  function buildFeedItemForEntry(entry) {
    if (!entry) return null;
    const community = state.communities.find((item) => item.id === entry.communityId);
    if (!community) return null;
    const member = (community.members || []).find((item) => item.id === entry.userId);
    if (!member) return null;
    const rule = (community.system.rules || []).map(scoring.normalizeRule).find((item) => item.id === entry.ruleId);
    return { entry: entry, community: community, member: member, rule: rule, when: entry.timestamp || entry.dateKey || entry.date || "" };
  }

  // Re-render a single feed card in place so other cards' comment inputs keep their
  // text/focus; preserves an already-loaded photo to avoid a re-fetch flash.
  function replaceFeedCard(entryId) {
    const root = activeFeedRoot();
    if (!root) return;
    const card = root.querySelector(`[data-feed-entry="${entryId}"]`);
    const item = feedItemById(entryId);
    if (!card || !item) { refreshActiveFeedSurface(); return; }
    // Preserve this card's half-typed comment (+ focus) and its already-loaded photo.
    const oldInput = card.querySelector("[data-feed-comment-input]");
    const draftVal = oldInput ? oldInput.value : "";
    const draftFocused = oldInput && document.activeElement === oldInput;
    const oldImg = card.querySelector(".ig-photo img");
    const oldSrc = oldImg && oldImg.src ? oldImg.src : "";
    const tmp = document.createElement("div");
    tmp.innerHTML = renderFeedPost(item);
    const fresh = tmp.firstElementChild;
    if (!fresh) return;
    card.replaceWith(fresh);
    const newPhoto = fresh.querySelector(".ig-photo");
    const newImg = fresh.querySelector(".ig-photo img");
    if (oldSrc && newImg) {
      newImg.src = oldSrc;
      if (newPhoto) {
        newPhoto.dataset.photoBound = "1";
        // Re-attach the open-in-new-tab affordance (we skipped bindEntryPhotos' re-fetch) — but
        // not when the photo is inside a post-open tile/card, so the tap opens the full post.
        if (!newPhoto.closest("[data-profile-post]")) {
          newPhoto.addEventListener("click", () => { try { window.open(oldSrc, "_blank", "noopener"); } catch (e) { /* ignore */ } });
        }
      }
    } else {
      bindEntryPhotos(root);
    }
    const newInput = fresh.querySelector("[data-feed-comment-input]");
    if (newInput && draftVal) {
      newInput.value = draftVal;
      const post = newInput.parentElement && newInput.parentElement.querySelector(".ig-comment-post");
      if (post) post.disabled = !draftVal.trim();
      if (draftFocused) { newInput.focus(); const n = draftVal.length; try { newInput.setSelectionRange(n, n); } catch (e) { /* ignore */ } }
    }
  }

  function onFeedClick(event) {
    // Close any open "⋯" menu unless the click is on a menu toggle or inside a menu.
    const menuRoot = activeFeedRoot();
    if (menuRoot && !event.target.closest("[data-feed-menu]") && !event.target.closest(".ig-menu-pop")) {
      Array.from(menuRoot.querySelectorAll(".ig-menu-pop")).forEach((p) => { p.hidden = true; });
    }
    const authorBtn = event.target.closest("[data-feed-author]");
    if (authorBtn) { openUserProfile(authorBtn.dataset.feedAuthor); return; }
    const likeBtn = event.target.closest("[data-feed-like]");
    if (likeBtn) { toggleFeedLike(likeBtn.dataset.feedLike); return; }
    const commentBtn = event.target.closest("[data-feed-comment-focus]");
    if (commentBtn) { focusFeedComment(commentBtn.dataset.feedCommentFocus); return; }
    const shareBtn = event.target.closest("[data-feed-share]");
    if (shareBtn) { sharePost(shareBtn.dataset.feedShare); return; }
    const saveBtn = event.target.closest("[data-feed-save]");
    if (saveBtn) { toggleFeedSave(saveBtn.dataset.feedSave); return; }
    const capMore = event.target.closest("[data-feed-caption-expand]");
    if (capMore) { feedCaptionOpen.add(String(capMore.dataset.feedCaptionExpand)); replaceFeedCard(capMore.dataset.feedCaptionExpand); return; }
    const followBtn = event.target.closest("[data-discover-follow]");
    if (followBtn) { followFromDiscover(followBtn.dataset.discoverFollow, followBtn); return; }
    const expandBtn = event.target.closest("[data-feed-expand]");
    if (expandBtn) { expandFeedComments(expandBtn.dataset.feedExpand); return; }
    const menuBtn = event.target.closest("[data-feed-menu]");
    if (menuBtn) { toggleFeedMenu(menuBtn); return; }
    const msgBtn = event.target.closest("[data-feed-menu-msg]");
    if (msgBtn) { messageFromFeed(msgBtn); return; }
    const delBtn = event.target.closest("[data-feed-delete]");
    if (delBtn) { openDeletePostConfirm(delBtn.dataset.feedDelete); return; }
  }

  function onFeedInput(event) {
    const input = event.target.closest("[data-feed-comment-input]");
    if (!input) return;
    const post = input.parentElement && input.parentElement.querySelector(".ig-comment-post");
    if (post) post.disabled = !input.value.trim();
  }

  function onFeedSubmit(event) {
    const form = event.target.closest("[data-feed-comment-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("[data-feed-comment-input]");
    const body = input ? input.value.trim() : "";
    if (body) postFeedComment(form.dataset.feedCommentForm, body);
  }

  function toggleFeedLike(entryId) {
    if (!signalsReady()) { showToast("Sign in to like posts"); return; }
    if (!isDbEntryId(entryId)) return;
    const before = feedSocialFor(entryId);
    const wasLiked = before.liked_by_me;
    const next = { ...before, liked_by_me: !wasLiked, like_count: Math.max(0, (before.like_count || 0) + (wasLiked ? -1 : 1)) };
    feedSocialCache.set(String(entryId), next);
    updateFeedLikeUi(entryId, next);
    const fn = wasLiked ? window.PointwellSignals.unlikeEntry : window.PointwellSignals.likeEntry;
    Promise.resolve(fn(entryId, state.account.userId)).then((res) => {
      if (res && res.error) {
        feedSocialCache.set(String(entryId), before); // revert to server truth
        updateFeedLikeUi(entryId, before);
        showToast("Couldn't update like");
      }
    }).catch(() => { feedSocialCache.set(String(entryId), before); updateFeedLikeUi(entryId, before); });
  }

  // Surgical like-button + count update (no full card re-render → no photo re-fetch,
  // no other comment inputs disturbed).
  function updateFeedLikeUi(entryId, social) {
    const root = activeFeedRoot();
    const card = root && root.querySelector(`[data-feed-entry="${entryId}"]`);
    if (!card) return;
    const btn = card.querySelector("[data-feed-like]");
    if (btn) {
      btn.classList.toggle("is-liked", !!social.liked_by_me);
      btn.setAttribute("aria-pressed", social.liked_by_me ? "true" : "false");
      btn.setAttribute("aria-label", social.liked_by_me ? "Unlike" : "Like");
    }
    // Like-line: "{n} likes" when > 0, else the "Be the first to like this" zero state.
    const actions = card.querySelector(".ig-actions");
    const likesEl = card.querySelector(".ig-likes");
    const zeroEl = card.querySelector(".ig-likes-zero");
    if (social.like_count > 0) {
      if (zeroEl) zeroEl.remove();
      const text = plural(social.like_count, "like");
      if (likesEl) likesEl.textContent = text;
      else if (actions) {
        const d = document.createElement("div");
        d.className = "ig-likes";
        d.textContent = text;
        actions.insertAdjacentElement("afterend", d);
      }
    } else {
      if (likesEl) likesEl.remove();
      if (!zeroEl && actions) {
        const z = document.createElement("div");
        z.className = "ig-likes-zero";
        z.textContent = "Be the first to like this";
        actions.insertAdjacentElement("afterend", z);
      }
    }
  }

  // Share a post — native share sheet if available, else copy the caption to the clipboard.
  function sharePost(entryId) {
    const item = feedItemById(String(entryId));
    const text = item && item.entry && item.entry.message ? String(item.entry.message) : "Check out this post on Pointwell";
    if (navigator.share) { Promise.resolve(navigator.share({ text: text })).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard")).catch(() => showToast("Couldn't share"));
      return;
    }
    showToast("Sharing isn't available here");
  }

  // Save/bookmark a post — local-only for this session (no backend; the fill is optimistic).
  function toggleFeedSave(entryId) {
    const id = String(entryId);
    if (feedSavedEntries.has(id)) feedSavedEntries.delete(id); else feedSavedEntries.add(id);
    const saved = feedSavedEntries.has(id);
    Array.from(document.querySelectorAll("[data-feed-save]")).filter((b) => b.dataset.feedSave === id).forEach((btn) => {
      btn.classList.toggle("is-saved", saved);
      btn.setAttribute("aria-pressed", saved ? "true" : "false");
      btn.setAttribute("aria-label", saved ? "Saved" : "Save");
    });
  }

  function focusFeedComment(entryId) {
    const root = activeFeedRoot();
    const card = root && root.querySelector(`[data-feed-entry="${entryId}"]`);
    const input = card && card.querySelector("[data-feed-comment-input]");
    if (input) input.focus();
  }

  function expandFeedComments(entryId) {
    feedCommentsOpen.add(String(entryId));
    replaceFeedCard(entryId);
    if (!window.PointwellSignals || typeof window.PointwellSignals.getEntryComments !== "function") return;
    Promise.resolve(window.PointwellSignals.getEntryComments(entryId)).then((rows) => {
      feedCommentsCache.set(String(entryId), Array.isArray(rows) ? rows : []);
      replaceFeedCard(entryId);
    }).catch(() => {});
  }

  function postFeedComment(entryId, body) {
    if (!signalsReady()) { showToast("Sign in to comment"); return; }
    if (!isDbEntryId(entryId)) return;
    // Clear the live input now so the card rebuild starts the comment box empty
    // (the draft-preservation in replaceFeedCard must not restore the sent text).
    const liveRoot = activeFeedRoot();
    const liveCard = liveRoot && liveRoot.querySelector(`[data-feed-entry="${entryId}"]`);
    const liveInput = liveCard && liveCard.querySelector("[data-feed-comment-input]");
    if (liveInput) liveInput.value = "";
    Promise.resolve(window.PointwellSignals.addEntryComment(entryId, state.account.userId, body)).then((res) => {
      if (!res || res.error) { showToast((res && res.error && res.error.message) || "Couldn't post comment"); return; }
      const before = feedSocialFor(entryId);
      const myName = state.profile.name;
      feedSocialCache.set(String(entryId), { ...before, comment_count: (before.comment_count || 0) + 1, last_comment_name: myName, last_comment_body: body });
      if (feedCommentsOpen.has(String(entryId))) {
        const rows = feedCommentsCache.get(String(entryId)) || [];
        const c = res.comment || {};
        rows.push({ id: c.id, user_id: state.account.userId, body: body, created_at: c.created_at || new Date().toISOString(), display_name: myName, handle: state.profile.handle, avatar_url: state.profile.avatarUrl });
        feedCommentsCache.set(String(entryId), rows);
      }
      replaceFeedCard(entryId);
    }).catch(() => showToast("Couldn't post comment"));
  }

  function toggleFeedMenu(menuBtn) {
    const wrap = menuBtn.closest("[data-feed-menu-wrap]");
    const pop = wrap && wrap.querySelector(".ig-menu-pop");
    if (!pop) return;
    const willOpen = pop.hidden;
    const menuRoot = activeFeedRoot() || els.communityFeed;
    if (menuRoot) Array.from(menuRoot.querySelectorAll(".ig-menu-pop")).forEach((p) => { p.hidden = true; });
    pop.hidden = !willOpen;
    menuBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  function messageFromFeed(msgBtn) {
    const card = msgBtn.closest("[data-feed-entry]");
    const item = card && feedItemById(card.dataset.feedEntry);
    if (!item) return;
    openChatConversation(item.member.userId, item.member.name, item.community.id);
    state.activeView = "chats";
    saveState();
    render();
  }

  // ── World detail (style D) — one view for both world types, body branched by type ──
  // Banner (cover_url / default gradient) + overlapping icon + name/subtitle + action row +
  // stat chips + body (community leaderboard OR personal rules) + recent-posts feed + a
  // collapsible "See trends & breakdown". Reuses communityStandings / renderCommunityAnalytics
  // / renderFeedPost / the invite+settings handlers; security stays in the DB.
  function renderCommunityDetail() {
    const world = currentDetailWorld();
    if (!world) {
      if (els.worldName) els.worldName.textContent = "World";
      ["leaderboardList", "communityPeriodTabs", "communityAnalytics", "worldPosts", "personalRules", "worldChips"].forEach((k) => { if (els[k]) els[k].innerHTML = ""; });
      return;
    }
    renderWorldChrome(world);
    if (world.type === "personal") renderPersonalWorldDetail(world);
    else renderCommunityWorldDetail(world);
  }

  // The world the detail view shows: a personal system (worldDetailType "personal" + a valid
  // system) or the selected community. Carries owner flag + cover/icon storage paths.
  function currentDetailWorld() {
    if (state.worldDetailType === "personal") {
      const sys = (state.systems || []).find((s) => s.id === state.detailSystemId);
      if (sys) return { type: "personal", id: sys.id, name: sys.title || "System", system: sys, ownerIsMe: true, coverPath: sys.coverUrl || "", iconPath: sys.iconUrl || "" };
    }
    const c = getSelectedCommunity();
    if (c) return { type: "community", id: c.id, name: c.name || "Community", community: c, ownerIsMe: isCommunityAdmin(c), coverPath: c.coverUrl || c.cover_url || "", iconPath: c.iconUrl || c.icon_url || "" };
    return null;
  }

  function worldPersonalStreak(system) {
    try { return coachContextStreak({ type: "personal", id: system.id, system: system }); } catch (e) { return 0; }
  }

  // Shared chrome: banner gradient/cover, icon, name, subtitle, action visibility, owner photo
  // controls, stat chips. Cover/icon images are painted async (signed URLs) by paintWorldMedia.
  function renderWorldChrome(world) {
    const personal = world.type === "personal";
    if (els.communityDetailView) els.communityDetailView.classList.toggle("is-personal-world", personal);
    if (els.worldBanner) els.worldBanner.classList.toggle("is-personal", personal);
    if (els.worldIcon) els.worldIcon.classList.toggle("is-personal", personal);
    if (els.worldName) els.worldName.textContent = world.name;
    if (els.worldIconFallback) els.worldIconFallback.textContent = (getInitials(world.name) || "W").slice(0, 2);
    if (els.worldSubtitle) {
      if (personal) {
        const streak = worldPersonalStreak(world.system);
        els.worldSubtitle.textContent = streak > 0 ? `Personal · 🔥 ${streak}-day streak` : "Personal";
      } else {
        const vis = communityVisibility(world.community);
        const lock = vis === "public" ? "🌐" : (vis === "request_to_join" ? "🙋" : "🔒");
        els.worldSubtitle.textContent = `${lock} ${visibilityLabel(vis)} · ${plural(getCommunityMemberCount(world.community), "member")}`;
      }
    }
    // Actions: community → Invite + Settings; personal → Edit only.
    if (els.worldActions) els.worldActions.hidden = personal;
    if (els.inviteButton) els.inviteButton.hidden = personal;
    if (els.communitySettingsButton) els.communitySettingsButton.hidden = personal;
    if (els.worldEditButton) els.worldEditButton.hidden = !personal;
    if (els.inviteOptions) els.inviteOptions.hidden = true;
    if (els.personalRulesPanel) els.personalRulesPanel.hidden = !personal;
    // Owner-only inline shortcuts (full controls live in Edit/Settings): the ✎ Cover hint pill +
    // the icon camera badge, plus the whole banner is tappable. Non-owners see only the gradient.
    const owner = world.ownerIsMe;
    if (els.worldBanner) els.worldBanner.classList.toggle("is-owner", owner);
    if (els.worldCoverEdit) els.worldCoverEdit.hidden = !owner;
    if (els.worldIconEdit) els.worldIconEdit.hidden = !owner;
    renderWorldChips(world);
    paintWorldMedia(world);
  }

  // 3 stat chips. Community = members / group-today / your streak; personal = today / week / streak.
  function renderWorldChips(world) {
    if (!els.worldChips) return;
    let chips;
    if (world.type === "personal") {
      const sys = normalizeSystem(world.system);
      const today = roundScore(numberOrDefault(calculateDashboardSummary(sys, todayValuesForSystem(sys)).total, 0));
      const todayKey = getTodayKey();
      const week = currentWeekDateKeys().reduce((sum, d) => { if (d > todayKey) return sum; const e = findEntry(d, world.id); return sum + (e ? numberOrDefault(e.total, 0) : 0); }, 0);
      const streak = worldPersonalStreak(world.system);
      chips = [[formatPoints(today), "today"], [formatPoints(roundScore(week)), "this week"], [(streak > 0 ? "🔥" : "") + streak, "streak"]];
    } else {
      const community = world.community;
      const standings = (function () { try { return communityStandings(community, "daily", "points"); } catch (e) { return []; } })();
      const groupToday = standings.reduce((s, m) => s + numberOrDefault(m.today, 0), 0);
      const myStreak = (function () { try { return coachContextStreak({ type: "community", id: community.id, community: community }); } catch (e) { return 0; } })();
      chips = [[String(getCommunityMemberCount(community)), "members"], [formatPoints(roundScore(groupToday)), "group today"], [(myStreak > 0 ? "🔥" : "") + myStreak, "streak"]];
    }
    els.worldChips.innerHTML = chips.map(([v, l]) => `<div class="world-chip"><p class="world-chip-value">${escapeHtml(String(v))}</p><p class="world-chip-label">${escapeHtml(l)}</p></div>`).join("");
  }

  function renderCommunityWorldDetail(world) {
    const community = world.community;
    community.system.rules = community.system.rules.map(scoring.normalizeRule);
    saveCommunitySummaryForMember(community, "me");
    if (!state.selectedCommunityMemberId || !community.members.some((m) => m.id === state.selectedCommunityMemberId)) state.selectedCommunityMemberId = "me";
    const analytics = normalizeCommunityAnalytics(community);
    const target = communityTarget(community);
    const period = COMMUNITY_PERIODS.some((i) => i.id === state.communityLeaderboardPeriod) ? state.communityLeaderboardPeriod : analytics.defaultPeriod;

    if (els.communityLeaderboardPanel) els.communityLeaderboardPanel.hidden = !analytics.modules.leaderboard;
    if (analytics.modules.leaderboard) {
      const standings = communityStandings(community, period, analytics.metric);
      els.communityPeriodTabs.innerHTML = COMMUNITY_PERIODS.map((item) => `<button class="segmented-button${item.id === period ? " active" : ""}" type="button" role="tab" aria-selected="${item.id === period ? "true" : "false"}" data-cc-period="${item.id}">${escapeHtml(item.label)}</button>`).join("");
      Array.from(els.communityPeriodTabs.querySelectorAll("[data-cc-period]")).forEach((b) => b.addEventListener("click", () => { state.communityLeaderboardPeriod = b.dataset.ccPeriod; saveState(); renderCommunityDetail(); }));
      renderCommunityLeaderboard(standings, analytics.metric, community.id);
    } else if (els.communityPeriodTabs) {
      els.communityPeriodTabs.innerHTML = ""; els.leaderboardList.innerHTML = "";
      if (els.leaderboardExpand) els.leaderboardExpand.hidden = true;
    }
    renderCommunityYourDay(community);
    renderWorldPosts(world);
    if (els.worldTrendsPanel) els.worldTrendsPanel.hidden = !(analytics.modules.groupTrends || analytics.modules.individualTrends);
    renderCommunityAnalytics(community, analytics, period, target);
    applyWorldTrendsCollapsed();
    renderCommunityHub(world, analytics);
  }

  function renderPersonalWorldDetail(world) {
    hideCommunityHubChrome();
    renderPersonalRules(world.system);
    renderWorldPosts(world);
    if (els.worldTrendsPanel) els.worldTrendsPanel.hidden = false;
    renderPersonalTrends(world.system);
    applyWorldTrendsCollapsed();
  }

  // ── Community hub: Feed · Leaderboard · Members · About ──────────────────────
  // A tabbed shell layered over the existing community detail sections. The leaderboard +
  // feed reuse their existing render paths unchanged; we add the tab switcher, a Feed
  // composer + sort, a Members list, and an About panel, then toggle section visibility by
  // the persisted state.communityHubTab. Personal worlds skip all of this.
  const COMMUNITY_HUB_TABS = [
    { id: "feed", label: "Feed" },
    { id: "leaderboard", label: "Leaderboard" },
    { id: "members", label: "Members" },
    { id: "about", label: "About" }
  ];
  const COMMUNITY_FEED_SORTS = [
    { id: "new", label: "🆕 New" },
    { id: "hot", label: "🔥 Hot" },
    { id: "top", label: "🏆 Top" }
  ];

  // Transient composer state (a draft share — not persisted, cleared on post/cancel).
  let communityComposerOpen = false;
  let communityComposerCaption = "";
  let communityComposerPhoto = null; // { file, previewUrl }
  // AI auto-fill: "edit" (submit runs parse-log) → "thinking" → "suggest" (Confirm/Change) →
  // "change" (rule/amount picker) → "ready" (a choice is locked; Post posts).
  let communityComposerStage = "edit";
  let communityComposerPick = null;  // { ruleId, amount } to log, or null = no-points / unmatched
  let communityLeaveArmed = false;   // two-tap confirm for the About-tab Leave button
  // User ids I follow — lazily loaded once for the Members tab follow buttons.
  let communityFollowingSet = new Set();
  let communityFollowingLoaded = false;

  function activeCommunityHubTab() {
    return COMMUNITY_HUB_TABS.some((t) => t.id === state.communityHubTab) ? state.communityHubTab : "feed";
  }

  function renderCommunityHub(world, analytics) {
    renderCommunityHubTabs();
    renderCommunityComposer(world);
    renderCommunityFeedSort();
    renderCommunityMembers(world);
    renderCommunityAbout(world);
    applyCommunityHubTab(analytics);
  }

  // Hide every community-only hub element (personal worlds keep the classic layout). Also
  // discards any in-progress composer draft — revoking its preview blob URL so it can't leak.
  function hideCommunityHubChrome() {
    resetCommunityComposer();
    // Hide every community-only panel when a PERSONAL world is shown (this runs only from
    // renderPersonalWorldDetail) so none leak in from a previously-viewed community — including the
    // leaderboard + "Your day" panels, which the community path re-shows on its own.
    ["communityHubTabs", "communityComposer", "communityComposerPhoto", "communityFeedSort", "communityMembersPanel", "communityAboutPanel", "communityLeaderboardPanel", "communityYourDayPanel"].forEach((k) => { if (els[k]) els[k].hidden = true; });
  }

  function renderCommunityHubTabs() {
    if (!els.communityHubTabs) return;
    const active = activeCommunityHubTab();
    els.communityHubTabs.innerHTML = COMMUNITY_HUB_TABS.map((t) =>
      `<button class="segmented-button${t.id === active ? " active" : ""}" type="button" role="tab" aria-selected="${t.id === active ? "true" : "false"}" data-hub-tab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`).join("");
    Array.from(els.communityHubTabs.querySelectorAll("[data-hub-tab]")).forEach((b) =>
      b.addEventListener("click", () => { state.communityHubTab = b.dataset.hubTab; saveState(); renderCommunityDetail(); }));
  }

  // Feed sort tabs (Hot / New / Top) — client-side reorder of the already-loaded posts.
  function renderCommunityFeedSort() {
    if (!els.communityFeedSort) return;
    const active = COMMUNITY_FEED_SORTS.some((s) => s.id === state.communityFeedSort) ? state.communityFeedSort : "new";
    els.communityFeedSort.innerHTML = COMMUNITY_FEED_SORTS.map((s) =>
      `<button class="community-sort-pill${s.id === active ? " is-active" : ""}" type="button" role="tab" aria-selected="${s.id === active ? "true" : "false"}" data-feed-sort="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`).join("");
    Array.from(els.communityFeedSort.querySelectorAll("[data-feed-sort]")).forEach((b) =>
      b.addEventListener("click", () => { state.communityFeedSort = b.dataset.feedSort; saveState(); renderCommunityDetail(); }));
  }

  // Sort feed items by the active mode. New = recency; Top = most cheers/likes; Hot = a
  // recency+engagement blend. Engagement comes from the social cache (populated async by
  // fetchFeedSocial), so Top/Hot sharpen as that warms.
  function sortCommunityFeed(items) {
    const mode = COMMUNITY_FEED_SORTS.some((s) => s.id === state.communityFeedSort) ? state.communityFeedSort : "new";
    const list = items.slice();
    const recency = (it) => String(it.when || "");
    const engagement = (it) => { const s = feedSocialFor(String(it.entry.id)); return (Number(s.like_count) || 0) * 2 + (Number(s.comment_count) || 0); };
    const ageHours = (it) => { const t = Date.parse(it.when); return isFinite(t) ? Math.max(0, (Date.now() - t) / 3600000) : 9999; };
    if (mode === "new") {
      list.sort((a, b) => recency(b).localeCompare(recency(a)));
    } else if (mode === "top") {
      list.sort((a, b) => (engagement(b) - engagement(a)) || recency(b).localeCompare(recency(a)));
    } else {
      list.sort((a, b) => ((engagement(b) - ageHours(b) * 0.5) - (engagement(a) - ageHours(a) * 0.5)) || recency(b).localeCompare(recency(a)));
    }
    return list;
  }

  // Feed composer — collapsed "Share your progress…" bar that expands to a caption + optional
  // photo. On submit it runs the EXISTING parse-log AI (+ photo vision) scoped to this
  // community's rules to suggest a rule + points; Confirm logs via the EXISTING community-entry
  // path (points + leaderboard) AND posts with the rule tag. No parallel AI or write path.
  function renderCommunityComposer(world) {
    if (!els.communityComposer) return;
    const community = world && world.community;
    if (!communityComposerOpen) {
      els.communityComposer.innerHTML =
        `<button class="community-composer-bar" type="button" data-composer-open>
          ${renderAvatar({ name: state.profile.name, avatarUrl: state.profile.avatarUrl, color: state.profile.accent || "#355d91", className: "community-composer-av" })}
          <span class="community-composer-placeholder">Share your progress…</span>
          <span class="community-composer-cam" aria-hidden="true">📷</span>
        </button>`;
      const open = els.communityComposer.querySelector("[data-composer-open]");
      if (open) open.addEventListener("click", () => { communityComposerOpen = true; renderCommunityDetail(); });
      return;
    }
    const preview = communityComposerPhoto && communityComposerPhoto.previewUrl
      ? `<div class="community-composer-photo"><img src="${escapeHtml(communityComposerPhoto.previewUrl)}" alt=""><button type="button" class="community-composer-photo-x" data-composer-photo-remove aria-label="Remove photo">×</button></div>`
      : "";
    const destName = escapeHtml(community ? (community.name || "your community") : "your community");
    const stage = communityComposerStage;
    const postLabel = stage === "edit" ? "Continue" : (stage === "thinking" ? "Thinking…" : "Post");
    const postReady = stage === "ready";
    const postDisabled = stage === "thinking" || stage === "suggest" || stage === "change";
    els.communityComposer.innerHTML =
      `<div class="community-composer-form">
        <div class="community-composer-to">
          ${renderAvatar({ name: state.profile.name, avatarUrl: state.profile.avatarUrl, color: state.profile.accent || "#355d91", className: "community-composer-av sm" })}
          <span class="community-composer-to-lbl">Posting to</span>
          <span class="community-composer-dest">👥 ${destName}</span>
          <button type="button" class="community-composer-x" data-composer-cancel aria-label="Close composer">×</button>
        </div>
        <textarea class="community-composer-input" data-composer-caption maxlength="${ENTRY_MESSAGE_MAX}" rows="3" placeholder="What did you do? (press Enter)">${escapeHtml(communityComposerCaption)}</textarea>
        ${preview}
        ${renderComposerAiBox(community)}
        <div class="community-composer-footer">
          <button type="button" class="community-composer-photo-btn" data-composer-photo aria-label="Add photo"><span aria-hidden="true">📷</span></button>
          <button type="button" class="community-composer-post${postReady ? " is-ready" : ""}" data-composer-post${postDisabled ? " disabled" : ""}>${escapeHtml(postLabel)}</button>
        </div>
      </div>`;
    bindCommunityComposer(world);
  }

  // The stage-dependent AI block above the Post button (see work/composer-ai-autofill.html).
  function renderComposerAiBox(community) {
    const stage = communityComposerStage;
    if (stage === "edit" || !community) return "";
    if (stage === "thinking") {
      return `<div class="community-composer-ai"><div class="community-composer-ai-head"><span aria-hidden="true">✨</span> Reading your log…</div></div>`;
    }
    if (stage === "ready") {
      const r = communityComposerPick && resolveQuickLogRule("community", community.id, communityComposerPick.ruleId);
      if (!r) return `<div class="community-composer-ai is-ready"><span class="community-composer-ai-chip">Just sharing — no points</span></div>`;
      const pts = scoring.calculateRule(r.rule, communityComposerPick.amount).totalPoints;
      return `<div class="community-composer-ai is-ready"><span class="community-composer-ai-chip">✓ ${escapeHtml(r.rule.label)} ${escapeHtml(formatSigned(pts))}</span><span class="community-composer-ai-note">logs to your day &amp; the leaderboard</span></div>`;
    }
    if (stage === "change") {
      const rules = (community.system.rules || []).map(scoring.normalizeRule).filter((rl) => rl.simpleStyle !== "penalty" && rl.dataSource !== "calculated");
      const sel = communityComposerPick ? communityComposerPick.ruleId : "";
      const opts = rules.map((rl) => {
        const p = scoring.calculateRule(rl, composerDefaultAmount(rl)).totalPoints;
        return `<option value="${escapeHtml(rl.id)}"${rl.id === sel ? " selected" : ""}>${escapeHtml(rl.label)} (${escapeHtml(formatSigned(p))})</option>`;
      }).join("");
      const amt = communityComposerPick ? communityComposerPick.amount : 1;
      return `<div class="community-composer-ai">
          <div class="community-composer-ai-head"><span aria-hidden="true">✨</span> Pick what to log</div>
          <div class="community-composer-change-row">
            <select class="community-composer-rulesel" data-composer-rule aria-label="Rule to log">
              ${opts}
              <option value="__none__"${communityComposerPick ? "" : " selected"}>— No points, just post</option>
            </select>
            <input class="community-composer-amt" data-composer-amt type="number" min="0" step="1" value="${escapeHtml(String(amt))}" aria-label="Amount">
            <button type="button" class="community-composer-confirm" data-composer-save>Save</button>
          </div>
        </div>`;
    }
    // suggest
    const r = communityComposerPick && resolveQuickLogRule("community", community.id, communityComposerPick.ruleId);
    if (!r) return "";
    const pts = scoring.calculateRule(r.rule, communityComposerPick.amount).totalPoints;
    return `<div class="community-composer-ai">
        <div class="community-composer-ai-head"><span aria-hidden="true">✨</span> Log this with your post?</div>
        <div class="community-composer-ai-row">
          <span class="community-composer-ai-lbl"><strong>✅ ${escapeHtml(r.rule.label)}</strong> <span class="community-composer-ai-pts">${escapeHtml(formatSigned(pts))}</span></span>
          <button type="button" class="community-composer-change" data-composer-change>Change</button>
          <button type="button" class="community-composer-confirm" data-composer-confirm>Confirm</button>
        </div>
      </div>`;
  }

  function composerDefaultAmount(rule) {
    if (rule.simpleStyle === "yesNo") return 1;
    const g = goalAmountForRule(rule);
    return g > 0 ? g : 1;
  }

  function bindCommunityComposer(world) {
    const root = els.communityComposer;
    if (!root) return;
    const community = world && world.community;
    const cap = root.querySelector("[data-composer-caption]");
    if (cap) {
      cap.addEventListener("input", () => {
        communityComposerCaption = cap.value;
        // Editing invalidates a shown suggestion → drop to "edit" WITHOUT a re-render (keep focus).
        if (communityComposerStage !== "edit" && communityComposerStage !== "thinking") {
          communityComposerStage = "edit"; communityComposerPick = null;
          const ai = root.querySelector(".community-composer-ai"); if (ai) ai.remove();
          const post = root.querySelector("[data-composer-post]");
          if (post) { post.textContent = "Continue"; post.classList.remove("is-ready"); post.disabled = false; }
        }
      });
      cap.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); communityComposerCaption = cap.value; submitOrAdvanceComposer(world); }
      });
    }
    const photoBtn = root.querySelector("[data-composer-photo]");
    if (photoBtn) photoBtn.addEventListener("click", () => { if (cap) communityComposerCaption = cap.value; if (els.communityComposerPhoto) els.communityComposerPhoto.click(); });
    const removeBtn = root.querySelector("[data-composer-photo-remove]");
    if (removeBtn) removeBtn.addEventListener("click", () => { if (cap) communityComposerCaption = cap.value; clearCommunityComposerPhoto(); renderCommunityDetail(); });
    const cancel = root.querySelector("[data-composer-cancel]");
    if (cancel) cancel.addEventListener("click", () => { resetCommunityComposer(); renderCommunityDetail(); });
    const post = root.querySelector("[data-composer-post]");
    if (post) post.addEventListener("click", () => { if (post.disabled) return; if (cap) communityComposerCaption = cap.value; submitOrAdvanceComposer(world); });
    const confirmBtn = root.querySelector("[data-composer-confirm]");
    if (confirmBtn) confirmBtn.addEventListener("click", () => { communityComposerStage = "ready"; renderCommunityDetail(); });
    const changeBtn = root.querySelector("[data-composer-change]");
    if (changeBtn) changeBtn.addEventListener("click", () => { communityComposerStage = "change"; renderCommunityDetail(); });
    const saveBtn = root.querySelector("[data-composer-save]");
    if (saveBtn) saveBtn.addEventListener("click", () => {
      const selEl = root.querySelector("[data-composer-rule]");
      const amtEl = root.querySelector("[data-composer-amt]");
      const val = selEl ? selEl.value : "__none__";
      if (val === "__none__" || !val) {
        communityComposerPick = null;
      } else {
        const rl = community ? (community.system.rules || []).map(scoring.normalizeRule).find((x) => x.id === val) : null;
        if (!rl) { showToast("That rule isn't available anymore"); return; } // stay in the picker, don't lose the choice
        const amt = rl.simpleStyle === "yesNo" ? 1 : Math.max(0, numberOrDefault(amtEl ? amtEl.value : 1, 1));
        communityComposerPick = { ruleId: rl.id, amount: amt };
      }
      communityComposerStage = "ready";
      renderCommunityDetail();
    });
    if (els.communityComposerPhoto) {
      els.communityComposerPhoto.onchange = () => {
        const file = els.communityComposerPhoto.files && els.communityComposerPhoto.files[0];
        els.communityComposerPhoto.value = "";
        if (!file) return;
        clearCommunityComposerPhoto();
        communityComposerPhoto = { file: file, previewUrl: URL.createObjectURL(file) };
        renderCommunityDetail();
      };
    }
  }

  // Submit handler shared by Enter and the Post button: run the AI from "edit"; post from "ready".
  function submitOrAdvanceComposer(world) {
    if (communityComposerStage === "thinking") return;
    if (communityComposerStage === "ready") { submitCommunityComposer(world); return; }
    runCommunityComposerAi(world);
  }

  async function runCommunityComposerAi(world) {
    const community = world && world.community;
    if (!community) return;
    const caption = (communityComposerCaption || "").trim();
    const hasPhoto = !!(communityComposerPhoto && communityComposerPhoto.file);
    if (caption.length < 2 && !hasPhoto) { showToast("Add a caption or photo first"); return; }
    communityComposerStage = "thinking";
    communityComposerPick = null;
    renderCommunityDetail();
    let best = null;
    try { best = await suggestCommunityLogEntry(community, caption, hasPhoto ? communityComposerPhoto.file : null); } catch (e) { best = null; }
    if (communityComposerStage !== "thinking") return; // user edited/closed mid-flight
    if (best) { communityComposerPick = { ruleId: best.ruleId, amount: best.amount }; communityComposerStage = "suggest"; }
    else { communityComposerPick = null; communityComposerStage = "ready"; } // no confident match → just post
    renderCommunityDetail();
  }

  // Reuse parse-log (text) + the photo vision estimate, scoped to THIS community's rules; return
  // the single best-matching normalized entry { ruleId, amount, confidence } or null.
  async function suggestCommunityLogEntry(community, caption, file) {
    const catalog = buildLoggableRuleCatalog().filter((c) => c.contextType === "community" && c.contextId === community.id);
    if (!catalog.length) return null;
    const tasks = [];
    if (caption && caption.length >= 2 && signalsReady() && window.PointwellSignals && typeof window.PointwellSignals.parseLog === "function") {
      tasks.push(Promise.resolve(window.PointwellSignals.parseLog(caption, catalog)).then((r) => (r && !r.error ? (r.entries || []) : [])).catch(() => []));
    } else { tasks.push(Promise.resolve([])); }
    if (file && signalsReady() && window.PointwellSignals && typeof window.PointwellSignals.estimateFood === "function") {
      tasks.push(communityPhotoEstimateRows(community, file, caption).catch(() => []));
    } else { tasks.push(Promise.resolve([])); }
    const [textEntries, photoRows] = await Promise.all(tasks);
    const candidates = textEntries.map(normalizeQuickLogEntry).filter(Boolean).concat(photoRows)
      .filter((e) => e.contextType === "community" && e.contextId === community.id && numberOrDefault(e.amount, 0) > 0);
    candidates.sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    return candidates[0] || null;
  }

  // Photo → the EXISTING vision estimate → draft rows, filtered to this community's rules.
  async function communityPhotoEstimateRows(community, file, hint) {
    try {
      const parts = await fileToBase64Parts(file);
      const res = await window.PointwellSignals.estimateFood(parts.data, parts.mediaType, hint || "");
      if (!res || res.error || !res.estimate || res.estimate.kind === "other") return [];
      return buildEstimateDraftRows(res.estimate).filter((r) => r.contextType === "community" && r.contextId === community.id);
    } catch (e) { return []; }
  }

  function clearCommunityComposerPhoto() {
    if (communityComposerPhoto && communityComposerPhoto.previewUrl) { try { URL.revokeObjectURL(communityComposerPhoto.previewUrl); } catch (e) { /* ignore */ } }
    communityComposerPhoto = null;
  }
  function resetCommunityComposer() {
    communityComposerOpen = false;
    communityComposerCaption = "";
    communityComposerStage = "edit";
    communityComposerPick = null;
    clearCommunityComposerPhoto();
  }

  async function submitCommunityComposer(world) {
    const community = world && world.community;
    if (!community) return;
    const caption = (communityComposerCaption || "").trim().slice(0, ENTRY_MESSAGE_MAX);
    const hasPhoto = !!(communityComposerPhoto && communityComposerPhoto.file);
    if (!caption && !hasPhoto) { showToast("Add a caption or photo first"); return; }
    // The locked pick (AI suggestion or the Change picker) decides what to LOG. No pick → a
    // pure share on the first rule (0 points, no double-count). A pick with amount>0 logs that
    // rule via the same path the Coach uses (points land + the leaderboard updates).
    const rules = (community.system.rules || []).map(scoring.normalizeRule);
    let rule = null, amount = 0;
    if (communityComposerPick) {
      const r = resolveQuickLogRule("community", community.id, communityComposerPick.ruleId);
      if (r) { rule = r.rule; amount = numberOrDefault(communityComposerPick.amount, 0); }
    }
    if (!rule) { rule = rules[0]; amount = 0; }
    if (!rule) { showToast("This community has no rules yet"); return; }
    const uid = state.account && state.account.userId;
    let photoPath = "";
    if (hasPhoto) {
      if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.uploadEntryPhoto !== "function") {
        showToast("Sign in to attach photos — posting without it.");
      } else {
        try {
          const up = await window.PointwellSignals.uploadEntryPhoto(communityComposerPhoto.file, community.id + "/" + uid);
          if (up && !up.error && up.path) photoPath = up.path;
          else showToast("Couldn't upload the photo — posting without it.");
        } catch (e) { showToast("Couldn't upload the photo — posting without it."); }
      }
    }
    // Double-count guard (mirrors the Coach log-and-share path): if this rule is already logged
    // for me today in this community, enrich that entry/post — never add the amount twice.
    let didLog = false, enriched = false;
    if (amount > 0) {
      const today = getTodayKey();
      const mine = (state.communityEntries || []).filter((e) => e.communityId === community.id && coachIsMine(e) && e.ruleId === rule.id && (e.dateKey || e.date) === today);
      const existing = mine[mine.length - 1];
      if (existing) {
        if (caption) existing.message = caption;
        if (photoPath) existing.photoPath = photoPath;
        enriched = true;
      } else {
        addCommunityEntry(community.id, "me", rule, amount, "manual", caption, photoPath, "");
        didLog = true;
      }
    } else {
      addCommunityEntry(community.id, "me", rule, 0, "manual", caption, photoPath, "");
    }
    saveCommunitySummaryForMember(community, "me");
    resetCommunityComposer();
    state.communityHubTab = "feed";
    state.communityFeedSort = "new";
    saveState();
    Promise.resolve(pushCommunityEntryToDb(community, rule.id, caption, photoPath)).then((r) => { if (r && r.error) showToast("Posted here, but it didn't sync"); }).catch(() => {});
    renderCommunityDetail();
    showToast(didLog ? ("Logged " + (rule.label || "rule") + " + shared") : (enriched ? "Updated today's log + shared" : ("Shared to " + (community.name || "your community"))));
  }

  // Lazily load who I follow (once) so member rows can show Follow vs Following. Privacy-gated
  // server-side; profileFollowing(myUid) returns my full following list.
  function ensureCommunityFollowing() {
    if (communityFollowingLoaded) return;
    communityFollowingLoaded = true;
    const uid = state.account && state.account.userId;
    if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.profileFollowing !== "function") return;
    Promise.resolve(window.PointwellSignals.profileFollowing(uid)).then((rows) => {
      communityFollowingSet = new Set((rows || []).map((r) => String(r.id)));
      if (state.activeView === "community-detail" && activeCommunityHubTab() === "members") renderCommunityDetail();
    }).catch(() => {});
  }

  function renderCommunityMembers(world) {
    if (!els.communityMembersList) return;
    ensureCommunityFollowing();
    const community = world.community;
    const members = community.members || [];
    const count = getCommunityMemberCount(community);
    const ownerId = community.ownerId || "";
    const cap = `<p class="community-section-cap">${escapeHtml(plural(count, "member").toUpperCase())}</p>`;
    els.communityMembersList.innerHTML = cap + members.map((m) => renderCommunityMemberRow(m, ownerId)).join("");
    bindCommunityMemberRows();
  }

  function renderCommunityMemberRow(m, ownerId) {
    const isMe = m.id === "me";
    const isOwner = isMe ? (ownerId === "me") : (!!m.userId && String(m.userId) === String(ownerId));
    const name = isMe ? "You" : escapeHtml(m.name || "Member");
    const handle = escapeHtml(cleanHandle(m.handle || "") || "@member");
    const role = isOwner ? `<span class="community-role owner">Owner</span>` : `<span class="community-role member">Member</span>`;
    const followed = !!m.userId && communityFollowingSet.has(String(m.userId));
    const action = (isMe || !m.userId) ? "" : (followed
      ? `<button class="community-follow-btn is-following" type="button" data-member-unfollow="${escapeHtml(String(m.userId))}">Following</button>`
      : `<button class="community-follow-btn" type="button" data-member-follow="${escapeHtml(String(m.userId))}"><span aria-hidden="true">+</span> Follow</button>`);
    const tapOpen = (!isMe && m.userId)
      ? `<button class="community-member-identity" type="button" data-open-profile-user="${escapeHtml(String(m.userId))}" aria-label="View ${name}'s profile">`
      : `<div class="community-member-identity is-static">`;
    const tapClose = (!isMe && m.userId) ? `</button>` : `</div>`;
    return `<div class="community-member-row">
        ${tapOpen}
          ${renderAvatar({ name: m.name, color: m.color, avatarUrl: m.avatarUrl, className: "community-member-av" })}
          <div class="community-member-who">
            <div class="community-member-nameline"><strong>${name}</strong>${role}</div>
            <span class="community-member-handle">${handle}</span>
          </div>
        ${tapClose}
        ${action}
      </div>`;
  }

  function bindCommunityMemberRows() {
    if (!els.communityMembersList) return;
    Array.from(els.communityMembersList.querySelectorAll("[data-open-profile-user]")).forEach((b) =>
      b.addEventListener("click", () => openUserProfile(b.dataset.openProfileUser)));
    Array.from(els.communityMembersList.querySelectorAll("[data-member-follow]")).forEach((b) =>
      b.addEventListener("click", () => communityMemberFollow(b.dataset.memberFollow, true)));
    Array.from(els.communityMembersList.querySelectorAll("[data-member-unfollow]")).forEach((b) =>
      b.addEventListener("click", () => communityMemberFollow(b.dataset.memberUnfollow, false)));
  }

  // Optimistic follow/unfollow from the members list (mirrors profileListFollow): flip the
  // local set + re-render now, revert on error. Server enforces public/not-blocked/not-self.
  function communityMemberFollow(userId, follow) {
    const sig = window.PointwellSignals;
    if (!signalsReady() || !sig) { showToast("Sign in to follow"); return; }
    if (follow) communityFollowingSet.add(String(userId)); else communityFollowingSet.delete(String(userId));
    renderCommunityDetail();
    const fn = follow ? sig.followUser : sig.unfollowUser;
    if (typeof fn !== "function") return;
    Promise.resolve(fn(userId)).then((r) => {
      if (r && r.error) {
        if (follow) communityFollowingSet.delete(String(userId)); else communityFollowingSet.add(String(userId));
        renderCommunityDetail();
        showToast(follow ? "Couldn't follow" : "Couldn't unfollow");
      }
    }).catch(() => {});
  }

  // About tab: description · how points work (rules) · meta row · Leave.
  function renderCommunityAbout(world) {
    if (!els.communityAboutPanel) return;
    const community = world.community;
    const desc = community.description
      ? `<p class="community-about-desc">${escapeHtml(community.description)}</p>`
      : `<p class="community-about-desc is-empty">No description yet.</p>`;
    const rules = (community.system.rules || []).map(scoring.normalizeRule).filter((r) => r.simpleStyle !== "penalty");
    const rulesHtml = rules.length
      ? `<p class="community-section-cap">HOW POINTS WORK · ${escapeHtml(plural(rules.length, "rule").toUpperCase())}</p>` + rules.map(renderCommunityAboutRule).join("")
      : "";
    const vis = communityVisibility(community);
    const visIcon = vis === "public" ? "🌐" : (vis === "request_to_join" ? "🙋" : "🔒");
    const count = getCommunityMemberCount(community);
    const ownerName = community.ownerId === "me"
      ? (state.profile.name || "You")
      : (((community.members || []).find((m) => m.userId && String(m.userId) === String(community.ownerId)) || {}).name || "—");
    const created = formatCommunityCreated(community.createdAt);
    const meta = `<div class="community-about-meta">
        <span>${visIcon} ${escapeHtml(visibilityLabel(vis))}</span>
        <span>👥 ${escapeHtml(plural(count, "member"))}</span>
        <span>👑 ${escapeHtml(ownerName)}</span>
        ${created ? `<span>📅 Created ${escapeHtml(created)}</span>` : ""}
      </div>`;
    const leave = world.ownerIsMe ? "" : `<button class="community-leave-btn" type="button" data-community-leave>${communityLeaveArmed ? "Tap again to leave" : "Leave community"}</button>`;
    els.communityAboutPanel.innerHTML = desc + rulesHtml + meta + leave;
    const leaveBtn = els.communityAboutPanel.querySelector("[data-community-leave]");
    if (leaveBtn) leaveBtn.addEventListener("click", () => {
      if (!communityLeaveArmed) { communityLeaveArmed = true; renderCommunityDetail(); return; }
      communityLeaveArmed = false;
      leaveCommunityConfirmed(community);
    });
  }

  function renderCommunityAboutRule(rule) {
    const primaryPoints = rule.simpleStyle === "yesNo" ? rule.yesNoPoints : (rule.goalPoints || rule.everyPoints || 0);
    return `<div class="community-rule-row">
        <span class="community-rule-icon" aria-hidden="true">${draftRuleIcon(rule)}</span>
        <span class="community-rule-label">${escapeHtml(rule.label || "Rule")}</span>
        <span class="community-rule-points">${escapeHtml(formatSigned(primaryPoints))} pts</span>
      </div>`;
  }

  function formatCommunityCreated(iso) {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!isFinite(t)) return "";
    try { return new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" }); } catch (e) { return ""; }
  }

  // Toggle which sections are visible for the active tab. Leaderboard/trends still respect
  // their analytics module flags; the composer/sort/posts ride the Feed tab. Personal rules
  // never show for a community.
  function applyCommunityHubTab(analytics) {
    const tab = activeCommunityHubTab();
    const lbOn = !!(analytics && analytics.modules && analytics.modules.leaderboard);
    const trendsOn = !!(analytics && analytics.modules && (analytics.modules.groupTrends || analytics.modules.individualTrends));
    const show = (key, on) => { if (els[key]) els[key].hidden = !on; };
    if (els.communityHubTabs) els.communityHubTabs.hidden = false;
    show("communityComposer", tab === "feed");
    show("communityFeedSort", tab === "feed");
    show("worldPostsPanel", tab === "feed");
    show("communityLeaderboardPanel", tab === "leaderboard" && lbOn);
    show("communityYourDayPanel", tab === "leaderboard");
    show("worldTrendsPanel", tab === "leaderboard" && trendsOn);
    show("communityMembersPanel", tab === "members");
    show("communityAboutPanel", tab === "about");
    if (els.personalRulesPanel) els.personalRulesPanel.hidden = true;
  }

  // Compact, you-centered leaderboard. Collapsed shows a small window — the leader (🥇), a "···"
  // gap, then YOUR row with the neighbor above + below you (or just the top window when you're
  // already in the top few). "Show all {N}" expands to the full scrollable list (your row stays
  // highlighted + scrolled into view); collapse snaps back. Reuses renderWorldLbRow + communityStandings.
  let lbExpanded = false;     // is the full list expanded?
  let lbExpandedFor = "";     // which community id the expansion applies to (collapse on switch)
  function renderCommunityLeaderboard(standings, metric, communityId) {
    if (!els.leaderboardList) return;
    const total = standings.length;
    const expanded = lbExpanded && lbExpandedFor === communityId;
    const myIndex = standings.findIndex((m) => m.id === "me");
    // The collapsed window of indices: leader + your neighborhood, or the top window if you're high up.
    let windowIdx;
    if (myIndex >= 3) {
      windowIdx = [0];
      for (let i = myIndex - 1; i <= myIndex + 1; i++) { if (i >= 1 && i < total && windowIdx.indexOf(i) < 0) windowIdx.push(i); }
    } else {
      windowIdx = [];
      for (let i = 0; i < Math.min(4, total); i++) windowIdx.push(i);
    }
    const canCollapse = total > windowIdx.length; // there's more behind the window
    let rows;
    if (expanded || !canCollapse) {
      rows = standings.map((m, i) => renderWorldLbRow(m, i, metric)).join("");
    } else {
      let out = "", prev = -1;
      windowIdx.forEach((i) => {
        if (prev >= 0 && i > prev + 1) out += `<div class="world-lb-gap" aria-hidden="true">···</div>`;
        out += renderWorldLbRow(standings[i], i, metric);
        prev = i;
      });
      rows = out;
    }
    els.leaderboardList.innerHTML = rows;
    els.leaderboardList.classList.toggle("is-expanded", expanded);
    bindLeaderboardRows();
    if (els.leaderboardExpand) {
      els.leaderboardExpand.hidden = !canCollapse;
      els.leaderboardExpand.textContent = expanded ? "Show less" : `Show all ${total}`;
      els.leaderboardExpand.onclick = () => {
        lbExpanded = !(lbExpanded && lbExpandedFor === communityId);
        lbExpandedFor = communityId;
        renderCommunityDetail();
        if (lbExpanded && els.leaderboardList) {
          const meRow = els.leaderboardList.querySelector(".world-lb-detail-row.is-me");
          if (meRow && meRow.scrollIntoView) meRow.scrollIntoView({ block: "nearest" });
        }
      };
    }
  }

  // Clean leaderboard row: rank · avatar · name · points, your row highlighted, NO progress bar.
  // Keeps data-community-member-id so the existing bindLeaderboardRows drill-down still works.
  function renderWorldLbRow(m, index, metric) {
    const me = m.id === "me";
    const periodPoints = m.periodPoints != null ? m.periodPoints : m.today;
    const value = metric === "completion" ? `${m.completion || 0}%` : formatPoints(periodPoints);
    const rank = index === 0 ? "🥇" : String(index + 1);
    return `<button class="world-lb-detail-row${me ? " is-me" : ""}" type="button" data-community-member-id="${escapeHtml(m.id)}">
        <span class="world-lb-detail-rank${index === 0 ? " is-leader" : ""}">${rank}</span>
        ${renderAvatar({ className: "member-avatar world-lb-detail-av", name: m.name, color: m.color, avatarUrl: m.avatarUrl })}
        <span class="world-lb-detail-name">${me ? "You" : escapeHtml(m.name || "Member")}</span>
        <strong class="world-lb-detail-pts">${escapeHtml(value)}</strong>
      </button>`;
  }

  // Personal "Today's rules" — icon + name + a per-rule progress bar + value (no leaderboard).
  // One-tap logging from a Today/world-detail rule card. Reuses the existing Add Entry log path
  // (addDailyEntryFromDraft) but stays on the card so it can animate to its logged state.
  let justLoggedRuleId = ""; // the rule whose card should play the just-logged animation once

  function quickLogRule(ruleId) {
    const world = currentDetailWorld();
    if (!world || world.type !== "personal") return;
    const system = world.system;
    const rule = (system.rules || []).map(scoring.normalizeRule).find((r) => r.id === ruleId);
    if (!rule || rule.simpleStyle === "penalty") return;
    if (isRuleSynced(rule) && rule.allowManualOverride === false) { showToast("Manual logging is off for this rule"); return; }
    const values = todayValuesForSystem(normalizeSystem(system));
    if (rule.simpleStyle === "yesNo" && numberOrDefault(values[rule.id], 0) > 0) return; // already done — don't double-log
    // Point the active score context at this world's system so the existing log path writes here.
    state.scoreContext = "personal";
    state.trackerSystemId = system.id;
    resetAddEntryAttachment();
    composerSourceTag = "";
    aiPrefilledComposer = false;
    addEntryDraft = { ruleId: rule.id, amount: rule.simpleStyle === "yesNo" ? 1 : suggestedEntryAmount(rule) };
    justLoggedRuleId = rule.id;
    addDailyEntryFromDraft({ stayInView: true });
  }

  // Tap the rule card body → open the full Add Entry form pre-pointed at this rule for editing.
  function openAddEntryForRule(ruleId) {
    const world = currentDetailWorld();
    if (!world || world.type !== "personal") return;
    const system = world.system;
    const rule = (system.rules || []).map(scoring.normalizeRule).find((r) => r.id === ruleId);
    if (!rule) return;
    state.scoreContext = "personal";
    state.trackerSystemId = system.id;
    addEntryDraft = { ruleId: rule.id, amount: suggestedEntryAmount(rule) };
    openAddEntryPage();
  }

  function renderPersonalRules(system) {
    if (!els.personalRules) return;
    const sys = normalizeSystem(system);
    const values = todayValuesForSystem(sys);
    const rules = (sys.rules || []).map(scoring.normalizeRule).filter((r) => r.simpleStyle !== "penalty");
    if (!rules.length) { els.personalRules.innerHTML = emptyState("No rules yet — add some in Build."); return; }
    const justLogged = justLoggedRuleId; justLoggedRuleId = ""; // consume the one-shot animation flag
    els.personalRules.innerHTML = rules.map((rule) => {
      const total = numberOrDefault(values[rule.id], 0);
      const goal = goalAmountForRule(rule) || 0;
      const isYesNo = rule.simpleStyle === "yesNo";
      const pct = isYesNo ? (total > 0 ? 100 : 0) : (goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : (total > 0 ? 100 : 0));
      const value = isYesNo ? (total > 0 ? "Done" : "—") : `${formatValue(total)}/${formatValue(goal)}`;
      const logged = isYesNo ? total > 0 : (goal > 0 ? total >= goal : total > 0);
      const manualOff = isRuleSynced(rule) && rule.allowManualOverride === false;
      const ruleId = escapeHtml(rule.id);
      const nameHtml = logged
        ? `${escapeHtml(rule.label || "Rule")} <span class="world-rule-loggedtag">✓ logged</span>`
        : escapeHtml(rule.label || "Rule");
      const action = logged
        ? `<span class="world-rule-done" aria-hidden="true">✓</span>`
        : (manualOff ? "" : `<button class="world-rule-log${isYesNo ? " is-yesno" : ""}" type="button" data-quick-log-rule="${ruleId}">${isYesNo ? "✓ Done" : "+ Log"}</button>`);
      return `<div class="world-rule-row${logged ? " is-logged" : ""}${rule.id === justLogged ? " is-just-logged" : ""}">
          <button class="world-rule-open" type="button" data-open-entry-rule="${ruleId}" aria-label="Edit ${escapeHtml(rule.label || "rule")} entry">
            <span class="world-rule-icon" aria-hidden="true">${draftRuleIcon(rule)}</span>
            <div class="world-rule-main">
              <p class="world-rule-name">${nameHtml}</p>
              <div class="world-rule-track" aria-hidden="true"><div class="world-rule-fill" style="width:${pct}%"></div></div>
            </div>
            <span class="world-rule-value">${escapeHtml(value)}</span>
          </button>
          ${action}
        </div>`;
    }).join("");
    Array.from(els.personalRules.querySelectorAll("[data-quick-log-rule]")).forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); quickLogRule(b.dataset.quickLogRule); }));
    Array.from(els.personalRules.querySelectorAll("[data-open-entry-rule]")).forEach((b) =>
      b.addEventListener("click", () => openAddEntryForRule(b.dataset.openEntryRule)));
  }

  // "Your day" — the community's rules as rows with x/y progress + an action, shown on the Leaderboard
  // tab. Mirrors renderPersonalRules (same .world-rule-* markup), reading the member's community values.
  // Yes/no rules get a one-tap "✓ Done" (quickLogCommunityRule). COUNTER rules + the rule body open the
  // full Add Entry composer pre-pointed at this community rule (openAddEntryForCommunityRule), so you
  // can type a manual amount and optionally add a photo/caption + post. Both paths update points + the
  // leaderboard through the EXISTING community-entry path.
  function renderCommunityYourDay(community) {
    if (!els.communityYourDay) return;
    const sys = normalizeSystem(community.system);
    const values = communityValuesForMember(community.id, "me", getTodayKey());
    const rules = (sys.rules || []).map(scoring.normalizeRule).filter((r) => r.simpleStyle !== "penalty");
    if (!rules.length) { els.communityYourDay.innerHTML = emptyState("No rules in this community yet."); return; }
    const justLogged = justLoggedRuleId; justLoggedRuleId = ""; // consume the one-shot animation flag
    els.communityYourDay.innerHTML = rules.map((rule) => {
      const total = numberOrDefault(values[rule.id], 0);
      const goal = goalAmountForRule(rule) || 0;
      const isYesNo = rule.simpleStyle === "yesNo";
      const pct = isYesNo ? (total > 0 ? 100 : 0) : (goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : (total > 0 ? 100 : 0));
      const value = isYesNo ? (total > 0 ? "Done" : "—") : `${formatValue(total)}/${formatValue(goal)}`;
      const logged = isYesNo ? total > 0 : (goal > 0 ? total >= goal : total > 0);
      const manualOff = isRuleSynced(rule) && rule.allowManualOverride === false;
      const ruleId = escapeHtml(rule.id);
      const nameHtml = logged
        ? `${escapeHtml(rule.label || "Rule")} <span class="world-rule-loggedtag">✓ logged</span>`
        : escapeHtml(rule.label || "Rule");
      // Yes/no → one-tap "✓ Done"; counter → "+ Log" opens the composer so the amount is yours to type.
      const action = logged
        ? `<span class="world-rule-done" aria-hidden="true">✓</span>`
        : (manualOff ? ""
          : (isYesNo
            ? `<button class="world-rule-log is-yesno" type="button" data-cc-log-rule="${ruleId}">✓ Done</button>`
            : `<button class="world-rule-log" type="button" data-cc-open-rule="${ruleId}">+ Log</button>`));
      return `<div class="world-rule-row${logged ? " is-logged" : ""}${rule.id === justLogged ? " is-just-logged" : ""}">
          <button class="world-rule-open" type="button" data-cc-open-rule="${ruleId}" aria-label="Log ${escapeHtml(rule.label || "rule")}">
            <span class="world-rule-icon" aria-hidden="true">${draftRuleIcon(rule)}</span>
            <div class="world-rule-main">
              <p class="world-rule-name">${nameHtml}</p>
              <div class="world-rule-track" aria-hidden="true"><div class="world-rule-fill" style="width:${pct}%"></div></div>
            </div>
            <span class="world-rule-value">${escapeHtml(value)}</span>
          </button>
          ${action}
        </div>`;
    }).join("");
    Array.from(els.communityYourDay.querySelectorAll("[data-cc-log-rule]")).forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); quickLogCommunityRule(community, b.dataset.ccLogRule); }));
    Array.from(els.communityYourDay.querySelectorAll("[data-cc-open-rule]")).forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); openAddEntryForCommunityRule(community, b.dataset.ccOpenRule); }));
  }

  // Open the full Add Entry composer pre-pointed at a COMMUNITY rule — the community analog of
  // openAddEntryForRule. Lets the member type a manual amount and optionally attach a photo/caption +
  // post; submitting writes through the same community-entry path (points + leaderboard update).
  function openAddEntryForCommunityRule(community, ruleId) {
    const sys = normalizeSystem(community.system);
    const rule = (sys.rules || []).map(scoring.normalizeRule).find((r) => r.id === ruleId);
    if (!rule) return;
    if (isRuleSynced(rule) && rule.allowManualOverride === false) { showToast("Manual logging is off for this rule"); return; }
    state.scoreContext = "community:" + community.id;
    addEntryDraft = { ruleId: rule.id, amount: rule.simpleStyle === "yesNo" ? 1 : suggestedEntryAmount(rule) };
    openAddEntryPage();
  }

  // One-tap community log — the community analog of quickLogRule. Points the active score context at
  // this community so the shared addDailyEntryFromDraft writes a community entry (points + leaderboard
  // update, DB push), then stays on the detail view so the rule card animates to its logged state.
  function quickLogCommunityRule(community, ruleId) {
    const sys = normalizeSystem(community.system);
    const rule = (sys.rules || []).map(scoring.normalizeRule).find((r) => r.id === ruleId);
    if (!rule || rule.simpleStyle === "penalty") return;
    if (isRuleSynced(rule) && rule.allowManualOverride === false) { showToast("Manual logging is off for this rule"); return; }
    const values = communityValuesForMember(community.id, "me", getTodayKey());
    if (rule.simpleStyle === "yesNo" && numberOrDefault(values[rule.id], 0) > 0) return; // already done — don't double-log
    state.scoreContext = "community:" + community.id;
    resetAddEntryAttachment();
    composerSourceTag = "";
    aiPrefilledComposer = false;
    addEntryDraft = { ruleId: rule.id, amount: rule.simpleStyle === "yesNo" ? 1 : suggestedEntryAmount(rule) };
    justLoggedRuleId = rule.id;
    addDailyEntryFromDraft({ stayInView: true });
  }

  // Personal trend: your points over the last COMMUNITY_TREND_DAYS, rendered with the same
  // bar chart the community trends use. Encouraging empty state when there's no history.
  function renderPersonalTrends(system) {
    if (!els.communityAnalytics) return;
    const days = COMMUNITY_TREND_DAYS;
    const series = [];
    for (let i = days - 1; i >= 0; i--) { const d = offsetDate(-i); const e = findEntry(d, system.id); series.push({ date: d, value: e ? numberOrDefault(e.total, 0) : 0 }); }
    const weekTotal = series.slice(-7).reduce((s, p) => s + p.value, 0);
    els.communityAnalytics.innerHTML = series.some((p) => p.value > 0)
      ? `<section class="tool-panel cc-panel"><div class="panel-heading tight"><div><h3>Your trend</h3><span>Points · last ${days} days</span></div><strong class="cc-stat">${escapeHtml(formatPoints(roundScore(weekTotal)))} this week</strong></div>${renderCommunityTrendChart(series, { ariaLabel: "Your points over time" })}</section>`
      : emptyState("Log a few days and your trend will fill in here. 📈");
  }

  // Recent-posts feed scoped to this world. Community → the shared feed-post component (with
  // like/comment/cheer); personal → your own captioned/photo check-ins (lightweight cards).
  function renderWorldPosts(world) {
    if (!els.worldPosts) return;
    if (world.type === "community") {
      const community = world.community;
      const items = (state.communityEntries || []).filter((e) => e.communityId === world.id).map((entry) => {
        const member = (community.members || []).find((m) => m.id === entry.userId);
        if (!member) return null;
        const rule = (community.system.rules || []).map(scoring.normalizeRule).find((r) => r.id === entry.ruleId);
        return { entry: entry, community: community, member: member, rule: rule, when: entry.timestamp || entry.dateKey || entry.date || "" };
      }).filter(Boolean);
      const shown = sortCommunityFeed(items).slice(0, 12);
      if (!shown.length) { els.worldPosts.innerHTML = emptyState("No posts yet — share your progress and it'll show up here."); return; }
      feedItems = shown; // so the shared feed handlers (like/comment/cheer) resolve each card by id
      els.worldPosts.innerHTML = `<div class="community-feed-list">${shown.map(renderFeedPost).join("")}</div>`;
      bindWorldFeedDelegation();
      bindEntryPhotos(els.worldPosts);
      fetchFeedSocial();
      return;
    }
    const posts = (state.quickEntries || []).filter((e) => e.systemId === world.id && (e.message || e.photoPath || e.photo_path))
      .slice().sort((a, b) => String(b.timestamp || b.dateKey || b.date || "").localeCompare(String(a.timestamp || a.dateKey || a.date || ""))).slice(0, 12);
    if (!posts.length) { els.worldPosts.innerHTML = emptyState("Your check-ins with a note or photo will show up here."); return; }
    els.worldPosts.innerHTML = `<div class="community-feed-list">${posts.map(renderPersonalPost).join("")}</div>`;
    bindEntryPhotos(els.worldPosts);
  }

  function renderPersonalPost(entry) {
    const when = entry.timestamp || entry.dateKey || entry.date || "";
    const rel = (window.PointwellSignals && typeof window.PointwellSignals.formatRelativeTime === "function") ? (window.PointwellSignals.formatRelativeTime(when, Date.now()) || "") : "";
    const relText = rel && rel !== "just now" ? rel + " ago" : (rel || "");
    const photoPath = entry.photoPath || entry.photo_path || "";
    const photoHtml = photoPath ? `<div class="ig-photo" data-entry-photo="${escapeHtml(photoPath)}" role="img" aria-label="Post photo"><img alt="" loading="lazy"></div>` : "";
    const msg = entry.message ? escapeHtml(String(entry.message)) : "";
    return `<article class="ig-card">
        <div class="ig-card-header">
          <div class="ig-author ig-author-static">${renderAvatar({ name: state.profile.name, avatarUrl: state.profile.avatarUrl, color: "#355d91" })}<div class="ig-head-main"><span class="ig-head-name">You</span><span class="ig-head-sub">${escapeHtml(relText)}</span></div></div>
        </div>
        ${photoHtml}
        ${msg ? `<div class="ig-caption"><span class="ig-name">You</span>${msg}</div>` : ""}
      </article>`;
  }

  function bindWorldFeedDelegation() {
    const root = els.worldPosts;
    if (!root || root.dataset.feedBound === "1") return;
    root.dataset.feedBound = "1";
    root.addEventListener("click", onFeedClick);
    root.addEventListener("input", onFeedInput);
    root.addEventListener("submit", onFeedSubmit);
  }

  function applyWorldTrendsCollapsed() {
    const open = !!state.worldTrendsOpen;
    if (els.worldTrendsBody) els.worldTrendsBody.hidden = !open;
    if (els.worldTrendsToggle) els.worldTrendsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (els.worldTrendsPanel) els.worldTrendsPanel.classList.toggle("is-open", open);
  }

  // ── World cover/icon: paint signed URLs (private bucket) or fall back to the gradient ──
  // Separate paint sequences per surface (detail banner / home tiles / editor thumbs) so a
  // render() that repaints several of them in one pass can't clobber the others' in-flight
  // signed-URL resolves. Each call passes an isStale() closure bound to its own counter. The
  // editor counter is keyed per surface ("system" | "community") because BOTH editors repaint
  // in a single render() pass — one shared counter would drop the first one's thumbnail.
  let worldMediaPaintSeq = 0;
  let worldTilePaintSeq = 0;
  const worldEditorPaintSeq = {};
  function paintWorldMedia(world) {
    const seq = ++worldMediaPaintSeq; // drop stale paints when the user navigates between worlds
    const stale = () => seq !== worldMediaPaintSeq;
    paintWorldMediaSlot(world.coverPath, els.worldBanner, els.worldBannerImg, stale);
    paintWorldMediaSlot(world.iconPath, els.worldIcon, els.worldIconImg, stale);
  }
  function paintWorldMediaSlot(path, container, img, isStale) {
    if (!container || !img) return;
    if (!path || !signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.worldMediaSignedUrl !== "function") {
      img.hidden = true; img.removeAttribute("src"); delete img.dataset.paintedPath; container.classList.remove("has-photo");
      return;
    }
    // Already showing this exact object → skip the re-fetch/re-set (the signed URL is also
    // memoized in signals.js, so even a forced re-paint wouldn't re-download — this just avoids churn).
    if (img.dataset.paintedPath === path && img.getAttribute("src")) {
      img.hidden = false; container.classList.add("has-photo");
      return;
    }
    Promise.resolve(window.PointwellSignals.worldMediaSignedUrl(path)).then((url) => {
      if (isStale()) return; // a newer paint of this surface is showing → ignore
      if (url) { img.src = url; img.dataset.paintedPath = path; img.hidden = false; container.classList.add("has-photo"); }
      else { img.hidden = true; img.removeAttribute("src"); delete img.dataset.paintedPath; container.classList.remove("has-photo"); }
    }).catch(() => { if (!isStale()) { img.hidden = true; container.classList.remove("has-photo"); } });
  }
  // Paint the cover+icon thumbnails in the open Edit/Settings form (signed URLs; the ＋ hint
  // stays when there's no image). Own seq so it can't clobber the tile/detail paints.
  function paintEditorMedia(surface, coverPath, iconPath, coverThumb, coverImg, iconThumb, iconImg) {
    const seq = (worldEditorPaintSeq[surface] = (worldEditorPaintSeq[surface] || 0) + 1);
    const stale = () => seq !== worldEditorPaintSeq[surface];
    paintWorldMediaSlot(coverPath, coverThumb, coverImg, stale);
    paintWorldMediaSlot(iconPath, iconThumb, iconImg, stale);
  }

  // The world whose cover/icon is being edited RIGHT NOW: the open system editor (personal) or
  // the community settings form, else the detail page. Owner-resolved either way, so the same
  // chooseWorldMedia/uploadWorldMedia path serves the relocated Edit/Settings controls.
  function currentMediaWorld() {
    if (state.activeView === "systems" && state.selectedSystemId) {
      const sys = (state.systems || []).find((s) => s.id === state.selectedSystemId);
      if (sys) return { type: "personal", id: sys.id, name: sys.title || "System", system: sys, ownerIsMe: true, coverPath: sys.coverUrl || "", iconPath: sys.iconUrl || "" };
    }
    if (state.activeView === "community-settings" && state.selectedCommunityId) {
      const c = getSelectedCommunity();
      if (c) return { type: "community", id: c.id, name: c.name || "Community", community: c, ownerIsMe: isCommunityAdmin(c), coverPath: c.coverUrl || c.cover_url || "", iconPath: c.iconUrl || c.icon_url || "" };
    }
    return currentDetailWorld();
  }

  // ── Owner cover/icon upload (reuses the image picker; uploads to world-media; saves path) ──
  async function chooseWorldMedia(file, kind) {
    const world = currentMediaWorld();
    if (!world || !world.ownerIsMe || !file) return;
    if (!/^image\//i.test(file.type || "")) { showToast("That's not an image — choose a photo"); return; }
    if (file.size > ENTRY_PHOTO_MAX_BYTES) { showToast("Photo is too big (max 5 MB) — pick a smaller one"); return; }
    const uid = state.account && state.account.userId;
    if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.uploadWorldMedia !== "function") { showToast("Sign in to set a photo"); return; }
    showToast(kind === "cover" ? "Uploading cover…" : "Uploading icon…");
    const up = await Promise.resolve(window.PointwellSignals.uploadWorldMedia(file, uid, world.id)).catch(() => ({ error: { message: "upload failed" } }));
    if (!up || up.error || !up.path) { showToast((up && up.error && up.error.message) || "Couldn't upload the photo"); return; }
    const col = kind === "cover" ? "cover_url" : "icon_url";
    if (world.type === "community") {
      // RLS lets only the owner write this; reflected locally regardless of network result.
      if (window.PointwellSignals && typeof window.PointwellSignals.updateCommunityMedia === "function") {
        const res = await Promise.resolve(window.PointwellSignals.updateCommunityMedia(world.id, { [col]: up.path })).catch(() => ({ error: { message: "save failed" } }));
        if (res && res.error) { showToast(communityDbError(res.error, "Couldn't save the photo")); return; }
      }
      const c = (state.communities || []).find((x) => x.id === world.id);
      if (c) { if (kind === "cover") c.coverUrl = up.path; else c.iconUrl = up.path; }
    } else {
      const sys = (state.systems || []).find((s) => s.id === world.id);
      if (sys) { if (kind === "cover") sys.coverUrl = up.path; else sys.iconUrl = up.path; }
    }
    saveState();
    showToast(kind === "cover" ? "Cover updated" : "Icon updated");
    // Re-render whichever surface is showing so the new image paints (editor thumb, or detail).
    if (state.activeView === "systems") renderSystems();
    else if (state.activeView === "community-settings") renderCommunitySettings();
    else renderCommunityDetail();
  }

  function bindWorldDetail() {
    const pick = (input) => { if (input) input.click(); };
    // Detail-page inline shortcuts: tap the cover banner → cover picker (ignore the Back pill);
    // tap the icon camera badge → icon picker. The ✎ Cover hint pill sits inside the banner, so
    // its click bubbles here too. Full cover/icon controls live in Edit/Settings.
    if (els.worldBanner) els.worldBanner.addEventListener("click", (e) => {
      if (e.target.closest("#backToCommunitiesButton")) return;
      const w = currentDetailWorld();
      if (w && w.ownerIsMe) pick(els.worldCoverInput);
    });
    if (els.worldIconEdit) els.worldIconEdit.addEventListener("click", () => pick(els.worldIconInput));
    // Edit (personal) / Settings (community) cover+icon pickers reuse the SAME file inputs;
    // currentMediaWorld() resolves which world from the active view.
    if (els.systemCoverThumb) els.systemCoverThumb.addEventListener("click", () => pick(els.worldCoverInput));
    if (els.systemIconThumb) els.systemIconThumb.addEventListener("click", () => pick(els.worldIconInput));
    if (els.communityCoverThumb) els.communityCoverThumb.addEventListener("click", () => pick(els.worldCoverInput));
    if (els.communityIconThumb) els.communityIconThumb.addEventListener("click", () => pick(els.worldIconInput));
    if (els.worldCoverInput) els.worldCoverInput.addEventListener("change", () => { const f = els.worldCoverInput.files && els.worldCoverInput.files[0]; els.worldCoverInput.value = ""; if (f) chooseWorldMedia(f, "cover"); });
    if (els.worldIconInput) els.worldIconInput.addEventListener("change", () => { const f = els.worldIconInput.files && els.worldIconInput.files[0]; els.worldIconInput.value = ""; if (f) chooseWorldMedia(f, "icon"); });
    if (els.worldTrendsToggle) els.worldTrendsToggle.addEventListener("click", () => { state.worldTrendsOpen = !state.worldTrendsOpen; saveState(); applyWorldTrendsCollapsed(); });
    if (els.worldEditButton) els.worldEditButton.addEventListener("click", editSystemFromScore); // personal → Build editor
  }

  function trendDayLabel(dateKey) {
    return String(Number(dateKey.split("-")[2]));
  }

  // Smooth area chart (gradient fill + line + a dot on the latest point) from the existing
  // {date,value} series. Responsive viewBox so it scales cleanly at 390px. Shared by the group
  // + individual trends. opts.id keeps each chart's gradient <defs> unique.
  function renderAreaChart(series, opts) {
    opts = opts || {};
    const vals = (series || []).map((p) => Math.max(0, numberOrDefault(p.value, 0)));
    const n = vals.length;
    const ariaLabel = escapeHtml(opts.ariaLabel || "Points over time");
    if (!n) return `<svg class="cc-area" viewBox="0 0 320 90" role="img" aria-label="${ariaLabel}"></svg>`;
    const W = 320, H = opts.height || 90, padTop = 8, padBottom = 6;
    const usable = H - padTop - padBottom;
    const max = Math.max(1, ...vals);
    const xAt = (i) => n === 1 ? W : (i / (n - 1)) * W;
    const yAt = (v) => padTop + (1 - (v / max)) * usable;
    const coords = vals.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
    const line = "M" + coords.join(" L");
    const area = `${line} L${W},${H} L0,${H} Z`;
    const gid = "cc-area-grad-" + (opts.id || "x");
    const lx = xAt(n - 1).toFixed(1), ly = yAt(vals[n - 1]).toFixed(1);
    return `<svg class="cc-area" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ariaLabel}">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3ddc97" stop-opacity="0.42"/><stop offset="100%" stop-color="#3ddc97" stop-opacity="0"/></linearGradient></defs>
        <path d="${area}" fill="url(#${gid})"/>
        <path d="${line}" fill="none" stroke="#3ddc97" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lx}" cy="${ly}" r="4" fill="#3ddc97" stroke="#0b100e" stroke-width="2"/>
      </svg>`;
  }

  // "▲ {pct}% vs last week" — this week's sum vs last week's, from the existing series.
  function trendStatChip(thisWeek, lastWeek) {
    if (lastWeek <= 0) return thisWeek > 0 ? `<span class="cc-stat-chip up">▲ New this week</span>` : "";
    const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    const up = pct >= 0;
    return `<span class="cc-stat-chip ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(pct)}% vs last week</span>`;
  }

  // Consecutive days hitting the daily target, latest-first (today may be unfinished — don't
  // count it against the streak). Mirrors coachContextStreak; derived from the existing series.
  function seriesStreak(series, target) {
    if (!(target > 0) || !series || !series.length) return 0;
    let streak = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      const hit = numberOrDefault(series[i].value, 0) >= target;
      if (i === series.length - 1 && !hit) continue;
      if (hit) streak += 1; else break;
    }
    return streak;
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
      const total = groupSeries.reduce((s, p) => s + numberOrDefault(p.value, 0), 0);
      const thisWeek = groupSeries.slice(-7).reduce((s, p) => s + numberOrDefault(p.value, 0), 0);
      const lastWeek = groupSeries.slice(-14, -7).reduce((s, p) => s + numberOrDefault(p.value, 0), 0);
      const compare = communityStandings(community, period, "points");
      const maxCompare = Math.max(1, ...compare.map((m) => numberOrDefault(m.periodPoints, 0)));
      const compareRows = compare.map((m, i) => {
        const pts = numberOrDefault(m.periodPoints, 0);
        const isLeader = i === 0 && pts > 0;       // standings are sorted leader-first
        const zero = !(pts > 0);
        const width = Math.max(4, Math.round((pts / maxCompare) * 100));
        const tone = isLeader ? " is-leader" : (zero ? " is-zero" : "");
        return `
          <div class="cc-mc-row">
            <span class="cc-mc-medal" aria-hidden="true">${isLeader ? "🥇" : ""}</span>
            ${renderAvatar({ className: "cc-mc-av", name: m.name, color: m.color, avatarUrl: m.avatarUrl })}
            <span class="cc-mc-name${tone}">${escapeHtml(String(m.name || "Member").split(" ")[0])}</span>
            <div class="cc-mc-track" aria-hidden="true">${zero ? "" : `<div class="cc-mc-fill ${isLeader ? "leader" : "norm"}" style="width:${width}%"></div>`}</div>
            <strong class="cc-mc-val${tone}">${escapeHtml(formatPoints(pts))}</strong>
          </div>`;
      }).join("");
      parts.push(`
        <section class="tool-panel cc-panel">
          <div class="cc-trend-head"><strong>Group trend</strong>${trendStatChip(thisWeek, lastWeek)}</div>
          <p class="cc-trend-sub">Points · last ${COMMUNITY_TREND_DAYS} days · <strong>${escapeHtml(formatPoints(roundScore(total)))} total</strong></p>
          ${renderAreaChart(groupSeries, { id: "group", ariaLabel: "Community points over time" })}
          <div class="cc-mc-title">Member comparison · ${escapeHtml(communityPeriod(period).label.toLowerCase())}</div>
          <div class="cc-mc-list">${compareRows}</div>
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
      const streak = seriesStreak(memberSeries, target);
      const dailyAvg = roundScore(memberWeek / 7);
      const optionsHtml = community.members.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === memberId ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
      parts.push(`
        <section class="tool-panel cc-panel cc-it">
          <div class="cc-it-head">
            <strong>Individual trend</strong>
            <div class="cc-picker">
              ${member ? renderAvatar({ className: "cc-picker-av", name: member.name, color: member.color, avatarUrl: member.avatarUrl }) : ""}
              <select id="communityTrendMemberSelect" class="cc-picker-select" aria-label="Member">${optionsHtml}</select>
            </div>
          </div>
          ${member ? `
            <div class="cc-statstrip">
              <div class="cc-ss"><p class="cc-ss-n accent">${escapeHtml(formatPoints(memberWeek))}</p><p class="cc-ss-c">this week</p></div>
              <div class="cc-ss"><p class="cc-ss-n streak">🔥 ${escapeHtml(String(streak))}</p><p class="cc-ss-c">streak</p></div>
              <div class="cc-ss"><p class="cc-ss-n">${escapeHtml(formatPoints(dailyAvg))}</p><p class="cc-ss-c">daily avg</p></div>
            </div>
            ${renderAreaChart(memberSeries, { id: "member", ariaLabel: `${member.name} points over time` })}`
          : emptyState("No members yet.")}
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
                  ${renderAvatar({ name: item.name, color: item.color, avatarUrl: item.avatarUrl })}
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

  // Two-step confirm flag for the community Settings "Leave community" danger action.
  let leaveConfirmOpen = false;

  function renderCommunitySettings() {
    const community = getSelectedCommunity();
    if (!community) {
      els.communitySettingsTitle.textContent = "Community Rules";
      els.communitySettingsMode.textContent = "View Rules";
      els.communityNameInput.value = "";
      els.communityDescriptionInput.value = "";
      els.communityVisibilityInput.value = "private";
      els.communityRules.innerHTML = "";
      els.communityRules.dataset.ruleSig = "";
      return;
    }

    community.system = normalizeSystem(community.system || { rules: [] });
    const canEdit = isCommunityAdmin(community);
    els.communitySettingsTitle.textContent = canEdit ? "Edit Rules" : "View Rules";
    els.communitySettingsMode.textContent = canEdit ? "Community Rules" : "Read-only rules";
    els.communityRulesHint.textContent = canEdit ? "Edit Rules" : "View Rules";
    // These are live form inputs holding possibly-unsaved edits. render() runs from many
    // background events (e.g. a wearable sync finishing after sign-in), so never overwrite an
    // input the user is currently focused in — that would wipe their edit before they save.
    if (document.activeElement !== els.communityNameInput) els.communityNameInput.value = community.name || "";
    if (document.activeElement !== els.communityDescriptionInput) els.communityDescriptionInput.value = community.description || "";
    if (document.activeElement !== els.communityVisibilityInput) els.communityVisibilityInput.value = communityVisibility(community);
    [els.communityNameInput, els.communityDescriptionInput, els.communityVisibilityInput].forEach((input) => {
      input.disabled = !canEdit;
    });
    // Owner-only cover/icon controls (saves on pick → chooseWorldMedia); hidden for non-admins,
    // and skip the signed-URL fetch entirely when they're hidden.
    if (els.communityMediaFields) els.communityMediaFields.hidden = !canEdit;
    if (canEdit) paintEditorMedia("community", community.coverUrl || community.cover_url || "", community.iconUrl || community.icon_url || "", els.communityCoverThumb, els.communityCoverImg, els.communityIconThumb, els.communityIconImg);
    els.saveCommunitySettingsButton.hidden = !canEdit;
    els.addCommunityRuleButton.hidden = !canEdit;
    // The rule editor is an uncontrolled form (its data-source/metric dropdowns hold unsaved
    // state in the DOM). Only rebuild it when the community/mode/rule-set actually changes —
    // otherwise a background render() would reset an in-progress dropdown change to its saved
    // value, and "Save Changes" would then read the reset value. Add/Delete/community-switch
    // change the signature and do refresh.
    const ruleSig = `${community.id}|${canEdit ? "edit" : "view"}|${(community.system.rules || []).map((item) => item.id).join(",")}`;
    if (els.communityRules.dataset.ruleSig !== ruleSig) {
      els.communityRules.dataset.ruleSig = ruleSig;
      els.communityRules.innerHTML = community.system.rules.length
        ? community.system.rules.map((item) => canEdit ? renderCommunityRuleEditor(item) : renderRuleRow(item, "community")).join("")
        : emptyState(canEdit ? "Add a community rule to define scoring." : "No community rules yet.");
      bindCommunityRuleEditors();
    }

    const analytics = normalizeCommunityAnalytics(community);
    els.communityAnalyticsSettings.hidden = !canEdit;
    els.ccModuleLeaderboard.checked = analytics.modules.leaderboard;
    els.ccModuleGroupTrends.checked = analytics.modules.groupTrends;
    els.ccModuleIndividualTrends.checked = analytics.modules.individualTrends;
    els.ccModuleUnderperforming.checked = analytics.modules.underperforming;
    els.ccDefaultPeriodInput.value = analytics.defaultPeriod;
    els.ccMetricInput.value = analytics.metric;
    // Owner opt-in: let members' connected-device data auto-count toward the leaderboard.
    if (els.ccAllowDeviceAutosync && document.activeElement !== els.ccAllowDeviceAutosync) {
      els.ccAllowDeviceAutosync.checked = !!community.allowDeviceAutosync;
    }
    [els.ccModuleLeaderboard, els.ccModuleGroupTrends, els.ccModuleIndividualTrends, els.ccModuleUnderperforming, els.ccDefaultPeriodInput, els.ccMetricInput, els.ccAllowDeviceAutosync].forEach((input) => {
      if (input) input.disabled = !canEdit;
    });
    renderCommunityDangerZone(community);
  }

  // A community backed by the shared DB (real uuid id while signed in) vs a
  // demo/local-only one (synthetic id or offline) — drives whether Leave hits the server.
  function isServerBackedCommunity(community) {
    return !!community && communitiesAreShared() &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(community.id || ""));
  }

  function removeCommunityFromState(communityId) {
    state.communities = (state.communities || []).filter((community) => community.id !== communityId);
    state.communityEntries = (state.communityEntries || []).filter((entry) => entry.communityId !== communityId);
    if (state.selectedCommunityId === communityId) {
      state.selectedCommunityId = state.communities[0] ? state.communities[0].id : "";
    }
  }

  // Danger zone in the community Settings screen: a "Leave community" action with a
  // confirm step. Owners of a real community can't leave (no delete-community policy);
  // members delete their own membership row; demo/local communities just drop locally.
  function renderCommunityDangerZone(community) {
    const zone = els.communityDangerZone;
    if (!zone) return;
    if (!community) { zone.hidden = true; zone.innerHTML = ""; return; }
    zone.hidden = false;
    const name = escapeHtml(community.name || "this community");
    const ownerLocked = isCommunityAdmin(community) && isServerBackedCommunity(community);
    if (ownerLocked) {
      zone.innerHTML = `
        <h3 class="community-danger-title">Danger zone</h3>
        <button class="danger-button" type="button" disabled>Leave community</button>
        <p class="community-danger-note">You own this community; transferring or deleting isn't available yet.</p>`;
      return;
    }
    if (leaveConfirmOpen) {
      zone.innerHTML = `
        <h3 class="community-danger-title">Danger zone</h3>
        <p class="community-danger-confirm">Leave ${name}?</p>
        <div class="community-danger-actions">
          <button class="danger-button" type="button" data-leave-confirm>Leave</button>
          <button class="ghost-button small" type="button" data-leave-cancel>Cancel</button>
        </div>`;
    } else {
      zone.innerHTML = `
        <h3 class="community-danger-title">Danger zone</h3>
        <button class="danger-button" type="button" data-leave-start>Leave community</button>`;
    }
    const startBtn = zone.querySelector("[data-leave-start]");
    if (startBtn) startBtn.addEventListener("click", () => { leaveConfirmOpen = true; renderCommunityDangerZone(community); });
    const cancelBtn = zone.querySelector("[data-leave-cancel]");
    if (cancelBtn) cancelBtn.addEventListener("click", () => { leaveConfirmOpen = false; renderCommunityDangerZone(community); });
    const confirmBtn = zone.querySelector("[data-leave-confirm]");
    if (confirmBtn) confirmBtn.addEventListener("click", () => leaveCommunityConfirmed(community));
  }

  function leaveCommunityConfirmed(community) {
    if (!community) return;
    if (isCommunityAdmin(community) && isServerBackedCommunity(community)) return; // owner: not allowed
    leaveConfirmOpen = false;
    const name = community.name || "this community";
    const finishLocally = () => {
      removeCommunityFromState(community.id);
      state.activeView = "dashboard";
      saveState();
      render();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      showToast(`Left ${name}`);
    };
    // Demo/local-only (owner or member, not server-backed): just drop local state.
    if (!isServerBackedCommunity(community)) { finishLocally(); return; }
    // Real membership: delete my own community_members row first; only touch local
    // state on success so an error never leaves a half-updated list.
    const uid = state.account && state.account.userId;
    Promise.resolve(window.PointwellSignals.leaveCommunity(community.id, uid)).then((res) => {
      if (res && res.error) {
        showToast(communityDbError(res.error, "Couldn't leave the community"));
        renderCommunityDangerZone(community); // restore the Leave button; state untouched
        return;
      }
      finishLocally();
    }).catch(() => {
      showToast("Couldn't leave the community");
      renderCommunityDangerZone(community);
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

  // ── Profile picture upload control ──────────────────────────────────────────
  // Mirrors the entry-photo picker: tap the avatar's camera badge → Take photo /
  // Choose from library → local preview → applied on "Save profile" (uploadAvatar).
  function bindProfileAvatarControls() {
    if (els.profileAvatarEditButton) {
      els.profileAvatarEditButton.addEventListener("click", () => {
        const menu = els.profileAvatarMenu;
        if (!menu) return;
        menu.hidden = !menu.hidden;
        els.profileAvatarEditButton.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
      });
    }
    [["camera", els.profileAvatarCameraInput], ["library", els.profileAvatarLibraryInput]].forEach((pair) => {
      const which = pair[0];
      const input = pair[1];
      const pick = els.profileAvatarMenu && els.profileAvatarMenu.querySelector(`[data-avatar-pick="${which}"]`);
      if (pick && input) pick.addEventListener("click", () => input.click());
      if (input) {
        input.addEventListener("change", () => {
          const file = input.files && input.files[0];
          if (file) chooseProfileAvatar(file);
          input.value = ""; // allow re-picking the same file
        });
      }
    });
    if (els.profileAvatarRemoveButton) {
      els.profileAvatarRemoveButton.addEventListener("click", removeProfileAvatar);
    }
  }

  function closeProfileAvatarMenu() {
    if (els.profileAvatarMenu) els.profileAvatarMenu.hidden = true;
    if (els.profileAvatarEditButton) els.profileAvatarEditButton.setAttribute("aria-expanded", "false");
  }

  function chooseProfileAvatar(file) {
    if (!file) return;
    if (!/^image\//i.test(file.type || "")) {
      showToast("That's not an image — choose a photo");
      return;
    }
    if (file.size > ENTRY_PHOTO_MAX_BYTES) {
      showToast("Photo is too big (max 5 MB) — pick a smaller one");
      return;
    }
    if (profileAvatarDraft.previewUrl) { try { URL.revokeObjectURL(profileAvatarDraft.previewUrl); } catch (e) { /* ignore */ } }
    profileAvatarDraft.file = file;
    profileAvatarDraft.previewUrl = URL.createObjectURL(file);
    profileAvatarDraft.remove = false;
    closeProfileAvatarMenu();
    refreshProfileAvatar();
  }

  function removeProfileAvatar() {
    if (profileAvatarDraft.previewUrl) { try { URL.revokeObjectURL(profileAvatarDraft.previewUrl); } catch (e) { /* ignore */ } }
    profileAvatarDraft.file = null;
    profileAvatarDraft.previewUrl = "";
    // Only worth a server clear if there's actually a saved picture.
    profileAvatarDraft.remove = !!state.profile.avatarUrl;
    closeProfileAvatarMenu();
    refreshProfileAvatar();
  }

  function resetProfileAvatarDraft() {
    if (profileAvatarDraft.previewUrl) { try { URL.revokeObjectURL(profileAvatarDraft.previewUrl); } catch (e) { /* ignore */ } }
    profileAvatarDraft = { file: null, previewUrl: "", remove: false };
  }

  // Reflect the pending/preview state on the large profile avatar + the Remove button.
  function refreshProfileAvatar() {
    const previewUrl = profileAvatarDraft.previewUrl
      || (profileAvatarDraft.remove ? "" : (state.profile.avatarUrl || ""));
    paintAvatarNode(els.largeAvatar, state.profile.name, previewUrl);
    if (els.profileAvatarRemoveButton) els.profileAvatarRemoveButton.hidden = !previewUrl;
  }

  // ── Tappable user profile page (an OTHER user; own profile uses renderProfile) ──
  // openUserProfile(id) → the "profile-page" view, which fetches get_profile_overview
  // (server-gated by can_view_profile) and renders header + you-might-like + an
  // all-communities expander + recent posts. All visibility is enforced server-side.
  let profileOverview = null;
  let profileOverviewLoading = false;
  let profileBackView = "";
  let profileListData = null;       // cached followers/following rows for the list view
  let profileListLoading = false;

  function openUserProfile(userId, communityContextId) {
    const id = String(userId || "");
    if (!id) return;
    closePostOverlay(); // tapping a post's author navigates away → dismiss the overlay first
    // (Own id is allowed through: it opens the public profile view with a Settings button,
    // a "what others see" self-preview — see renderProfilePage / openMyProfile.)
    // When opened from a community (leaderboard), remember it → the "Today in <community>"
    // section. Any other entry point (feed, friends, search) clears it.
    state.profileCommunityContextId = communityContextId ? String(communityContextId) : "";
    profileBackView = (state.activeView && state.activeView !== "profile-page") ? state.activeView : "feed";
    state.profileUserId = id;
    state.profileListMode = null; // always open the profile itself, not a stale followers list
    profileListData = null;
    profileOverview = null;
    profileOverviewLoading = true; // show the loading state on the first paint, not an error flash
    state.activeView = "profile-page";
    saveState();
    render();
    loadProfileOverview(id);
  }

  async function loadProfileOverview(id) {
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.getProfileOverview !== "function") {
      profileOverviewLoading = false; profileOverview = null; renderProfilePage(); return;
    }
    profileOverviewLoading = true;
    renderProfilePage();
    let row = null, counts = null, bio = null;
    try {
      const out = await Promise.all([
        Promise.resolve(window.PointwellSignals.getProfileOverview(id)).catch(() => null),
        (typeof window.PointwellSignals.getFollowCounts === "function"
          ? Promise.resolve(window.PointwellSignals.getFollowCounts(id)).catch(() => null)
          : Promise.resolve(null)),
        (typeof window.PointwellSignals.profileBio === "function"
          ? Promise.resolve(window.PointwellSignals.profileBio(id)).catch(() => null)
          : Promise.resolve(null))
      ]);
      row = out[0]; counts = out[1]; bio = out[2];
    } catch (e) { row = null; }
    if (String(state.profileUserId) !== String(id)) return; // navigated away mid-fetch
    // Attach follower/following counts + the gated bio to the profile row for the hero.
    if (row && counts) { row.follower_count = counts.follower_count; row.following_count = counts.following_count; }
    if (row) row.bio = bio;
    profileOverviewLoading = false;
    profileOverview = row;
    if (state.activeView === "profile-page") renderProfilePage();
  }

  // ── Followers / Following list (opened by tapping a stat card) ───────────────
  function openProfileList(mode) {
    state.profileListMode = mode === "following" ? "following" : "followers";
    profileListData = null;
    profileListLoading = true;
    saveState();
    renderProfilePage();
    loadProfileList();
  }

  async function loadProfileList() {
    const id = state.profileUserId, mode = state.profileListMode;
    const sig = window.PointwellSignals;
    const fnName = mode === "following" ? "profileFollowing" : "profileFollowers";
    if (!id || !signalsReady() || !sig || typeof sig[fnName] !== "function") {
      profileListLoading = false; profileListData = []; renderProfilePage(); return;
    }
    let rows = [];
    try { rows = await Promise.resolve(sig[fnName](id)).catch(() => []); } catch (e) { rows = []; }
    if (String(state.profileUserId) !== String(id) || state.profileListMode !== mode) return; // navigated away
    profileListLoading = false;
    profileListData = Array.isArray(rows) ? rows : [];
    renderProfilePage();
  }

  // The list view (replaces the profile body). Privacy is server-enforced: the RPC returns [] for a
  // private profile the viewer can't see — we then show the locked state (chosen by o.can_view, a
  // presentation decision only; the data itself is already withheld by the DB).
  function renderProfileListView(o, isOwnProfile) {
    const root = els.profilePageBody;
    if (!root) return;
    const mode = state.profileListMode;
    const fullName = escapeHtml(o.display_name || "Member");
    const firstName = escapeHtml(String(o.display_name || "Member").split(" ")[0] || "them");
    const title = mode === "following" ? "Following" : "Followers";
    const back = `<button class="ghost-button small profile-page-back" type="button" data-profile-list-back>← ${fullName}</button>`;
    const list = profileListData || [];
    let body;
    if (profileListLoading) {
      body = `<p class="profile-page-loading">Loading ${escapeHtml(title.toLowerCase())}…</p>`;
    } else if (list.length) {
      body = `<div class="profile-list">${list.map(renderProfileListRow).join("")}</div>`;
    } else if (!o.can_view) {
      body = `
        <div class="profile-list-locked">
          <div class="profile-list-locked-icon" aria-hidden="true">🔒</div>
          <strong>${mode === "following" ? "Who they follow is private" : "Followers are private"}</strong>
          <p>Follow ${firstName} to see who follows them and who they follow.</p>
          ${profileLockedButton(o)}
        </div>`;
    } else {
      body = emptyState(mode === "following"
        ? `${fullName}${isOwnProfile ? " (you)" : ""} isn't following anyone yet.`
        : `No ${title.toLowerCase()} yet.`);
    }
    root.innerHTML = back + `<section class="profile-section profile-list-section"><h2 class="profile-list-title">${title}</h2>${body}</section>`;
  }

  function renderProfileListRow(p) {
    const pName = escapeHtml(p.display_name || "Member");
    const pHandle = escapeHtml(cleanHandle(p.handle || "") || "@member");
    const id = escapeHtml(String(p.id));
    const isMe = !!(state.account && String(p.id) === String(state.account.userId));
    const action = isMe ? `<span class="profile-rel-status">You</span>`
      : (p.viewer_follows
        ? `<button class="ghost-button small profile-following" type="button" data-profile-list-unfollow="${id}">Following</button>`
        : `<button class="primary-button small" type="button" data-profile-list-follow="${id}"><span aria-hidden="true">+</span> Follow</button>`);
    return `
      <div class="profile-list-row">
        <button class="profile-list-identity" type="button" data-profile-list-open="${id}" aria-label="View ${pName}'s profile">
          ${renderAvatar({ className: "profile-list-avatar", name: p.display_name || "Member", avatarUrl: p.avatar_url })}
          <div class="profile-list-who"><strong>${pName}</strong><span>${pHandle}</span></div>
        </button>
        ${action}
      </div>`;
  }

  // Follow/unfollow a person FROM the list (instant follows table). Optimistic — flip the row's
  // button + re-render now, revert on error. (Private accounts no-op server-side; self-corrects on
  // the next list load.)
  function profileListFollow(id, follow) {
    const sig = window.PointwellSignals;
    if (!signalsReady() || !sig) return;
    const row = (profileListData || []).find((p) => String(p.id) === String(id));
    if (row) row.viewer_follows = follow;
    renderProfilePage();
    const fn = follow ? sig.followUser : sig.unfollowUser;
    if (typeof fn !== "function") return;
    Promise.resolve(fn(id)).then((r) => {
      if (r && r.error) { if (row) row.viewer_follows = !follow; renderProfilePage(); showToast(follow ? "Couldn't follow" : "Couldn't unfollow"); }
    }).catch(() => {});
  }

  // Make a URL safe to drop inside a CSS url('…') token: percent-encode the few chars that
  // could terminate the url()/quote (legit storage URLs already have these percent-encoded).
  function cssUrlSafe(u) {
    return String(u || "").replace(/[\s'"()\\]/g, encodeURIComponent);
  }

  function renderProfilePage() {
    if (!els.profilePageBody || state.activeView !== "profile-page") return;
    const root = els.profilePageBody;
    bindProfilePage();
    const back = `<button class="ghost-button small profile-page-back" type="button" data-profile-back>← Back</button>`;
    if (!state.profileUserId) { root.innerHTML = back + emptyState("No profile selected."); return; }
    if (profileOverviewLoading && !profileOverview) { root.innerHTML = back + `<p class="profile-page-loading">Loading profile…</p>`; return; }
    // Viewing your OWN profile → a "what others see" preview with a Settings button in
    // place of Follow/Message. (Derived from state, so it's valid even before the
    // overview loads / if it fails.)
    const isOwnProfile = !!(state.account && String(state.profileUserId) === String(state.account.userId));

    const o = profileOverview;
    if (!o) {
      // The remote profile failed to load, but the "Today in <community>" data is LOCAL
      // (co-member data) — still show it when community-scoped, above the error note.
      root.innerHTML = back + renderProfileTodayInCommunity(isOwnProfile) + emptyState("Couldn't load this profile.");
      centerProfileTodaySchedule(root);
      return;
    }
    // Tapped a Followers/Following stat → render that list view instead of the profile.
    if (state.profileListMode === "followers" || state.profileListMode === "following") {
      renderProfileListView(o, isOwnProfile);
      return;
    }
    const name = escapeHtml(o.display_name || "Member");
    const handle = escapeHtml(cleanHandle(o.handle || "") || "@member");
    const canView = !!o.can_view;
    // Bio: own profile uses local state (reflects unsaved edits); others use the gated server bio.
    const bio = isOwnProfile ? (state.profile.bio || "") : (o.bio || "");
    const bioHtml = bio
      ? `<p class="profile-hero-bio">${escapeHtml(bio)}</p>`
      : (isOwnProfile ? `<button class="profile-hero-addbio" type="button" data-profile-settings>+ Add a bio</button>` : "");
    const followers = Number(o.follower_count) || 0;
    const following = Number(o.following_count) || 0;
    const commCount = (o.communities || []).length + (Number(o.private_count) || 0);
    // Followers/Following are tappable stat cards (› affordance); Communities is a static stat.
    const statCard = (mode, num, label) =>
      `<button class="profile-stat" type="button" data-profile-stat="${mode}"><p class="profile-stat-num">${escapeHtml(formatFollowCount(num))}</p><p class="profile-stat-cap">${label} ›</p></button>`;
    const actionRow = (!isOwnProfile && canView)
      ? `<div class="profile-hero-actions-row">${profileRelationshipButton(o)}${profileMessageButton(name)}</div>` : "";
    // Cover banner + avatar are OWN-profile fields (state.profile) so they reflect a just-uploaded
    // image immediately; others' covers aren't exposed by the gated overview read → default gradient.
    const coverUrl = isOwnProfile ? (state.profile.coverUrl || "") : "";
    const avatarUrl = isOwnProfile ? (state.profile.avatarUrl || "") : (o.avatar_url || "");
    // Neutralize the CSS url('…') context (defense-in-depth): percent-encode any quote/paren/
    // backslash/whitespace so a value can't break out of url(); then escapeHtml the attribute.
    const bannerStyle = coverUrl ? ` style="background-image:url('${escapeHtml(cssUrlSafe(coverUrl))}')"` : "";
    // The whole banner is also a cover tap target for the owner (not just the chips). Back/gear
    // are checked first in onProfilePageClick, so tapping them never falls through to the cover.
    const bannerOwnerAttr = isOwnProfile ? ` data-profile-cover-edit` : "";
    const coverEditHtml = isOwnProfile
      ? (coverUrl
          ? `<button class="profile-banner-edit" type="button" data-profile-cover-edit aria-label="Change cover photo"><span aria-hidden="true">📷</span></button>`
          : `<button class="profile-banner-add" type="button" data-profile-cover-edit><span aria-hidden="true">＋</span> Add cover photo</button>`)
      : "";
    const bannerGearHtml = isOwnProfile
      ? `<button class="profile-banner-btn profile-banner-gear" type="button" data-profile-settings aria-label="Edit profile and privacy settings"><span aria-hidden="true">⚙</span></button>` : "";
    const avatarCamHtml = isOwnProfile
      ? `<button class="profile-avatar-cam" type="button" data-profile-avatar-edit aria-label="Change profile photo"><span aria-hidden="true">📷</span></button>` : "";
    let html = `
      <section class="profile-hero profile-hero-card">
        <div class="profile-banner${coverUrl ? " has-cover" : ""}"${bannerStyle}${bannerOwnerAttr}>
          <button class="profile-banner-btn profile-banner-back" type="button" data-profile-back aria-label="Back"><span aria-hidden="true">‹</span> Back</button>
          ${bannerGearHtml}
          ${coverEditHtml}
        </div>
        <div class="profile-hero-body">
          <div class="profile-hero-avwrap">
            ${renderAvatar({ className: "large-avatar profile-hero-avatar", name: o.display_name || "Member", avatarUrl: avatarUrl })}
            ${avatarCamHtml}
          </div>
          <div class="profile-hero-id">
            <strong class="profile-hero-name">${name}</strong>
            <span class="profile-hero-handle">${handle}</span>
            ${bioHtml}
          </div>
          ${actionRow}
          <div class="profile-hero-stats">
            ${statCard("followers", followers, "Followers")}
            ${statCard("following", following, "Following")}
            <div class="profile-stat profile-stat-accent profile-stat-static"><p class="profile-stat-num">${escapeHtml(formatFollowCount(commCount))}</p><p class="profile-stat-cap">Communities</p></div>
          </div>
        </div>
        ${isOwnProfile ? `<input type="file" accept="image/*" data-profile-img-input hidden>` : ""}
      </section>`;

    // "Today in <community>" — community-scoped data the viewer already has as a co-member,
    // so it shows even when the broader profile is locked (private). "" otherwise.
    html += renderProfileTodayInCommunity(isOwnProfile);

    if (!canView) {
      html += `
        <section class="profile-locked-card">
          <span class="profile-locked-icon" aria-hidden="true">🔒</span>
          <strong>This profile is private</strong>
          <p>Request to follow to see their posts, communities, and goals.</p>
          ${profileLockedButton(o)}
        </section>`;
      root.innerHTML = html;
      centerProfileTodaySchedule(root);
      return;
    }

    html += renderProfileYouMightLike(o, isOwnProfile) + renderProfileRecentPosts(o);
    root.innerHTML = html;
    bindEntryPhotos(root);
    centerProfileTodaySchedule(root);
  }

  // The "Today in <community>" section, folded into the profile when it was opened from a
  // community (leaderboard). Reuses the member-day data + renderers (schedule, rule
  // breakdown) — compact, with rank + a one-tap Kudos. Returns "" otherwise.
  function renderProfileTodayInCommunity(isOwnProfile) {
    const communityId = state.profileCommunityContextId || "";
    if (!communityId) return "";
    const community = state.communities.find((c) => String(c.id) === String(communityId));
    if (!community) return "";
    const member = (community.members || []).find((m) => String(m.userId) === String(state.profileUserId));
    if (!member) return "";

    const values = collectDraftValues(community.system, communityValuesForMember(community.id, member.id, todayIso));
    const summary = calculateMemberCommunitySummary(community, values);
    const target = calculateTargetSummary(community.system).total;
    const percent = progressPercent(summary.total, target);
    const standings = communityStandings(community, COMMUNITY_PERIODS[0].id, "points").slice().sort((a, b) => b.today - a.today);
    const rank = standings.findIndex((item) => item.id === member.id) + 1;
    const memberCount = standings.length;
    const memberManual = getCommunityEntriesForMemberOnDate(community.id, member.id, todayIso);
    const memberMaterializedRuleIds = new Set(memberManual.filter((entry) => entry.viaSource).map((entry) => entry.ruleId));
    const entries = [
      ...syncedEntriesForContext({ type: "community", community }, community.system, { userId: member.id }).filter((entry) => !memberMaterializedRuleIds.has(entry.ruleId)),
      ...memberManual
    ].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
    const breakdownOpen = !!state.profileRuleBreakdownOpen;
    const ringOffset = 100 - Math.min(Math.max(percent, 0), 100);
    const kudos = (!isOwnProfile && member.userId && signalsReady())
      ? `<button class="secondary-button small profile-today-kudos" type="button" data-today-kudos="${escapeHtml(member.id)}"><span aria-hidden="true">♥</span> Kudos</button>`
      : "";

    return `
      <section class="profile-section profile-today-section">
        <div class="profile-today-head">
          <h3 class="profile-section-title">Today in ${escapeHtml(community.name)}</h3>
          ${kudos}
        </div>
        <div class="score-strip profile-today-strip">
          <div class="score-ring profile-today-ring" aria-hidden="true">
            <svg class="score-ring-svg" viewBox="0 0 44 44">
              <circle class="score-ring-bg" cx="22" cy="22" r="19"></circle>
              <circle class="score-ring-fill" cx="22" cy="22" r="19" pathLength="100" style="stroke-dashoffset:${ringOffset}"></circle>
            </svg>
            <strong class="profile-today-ring-label">${escapeHtml(formatPercent(percent))}</strong>
          </div>
          <div class="profile-today-meta">
            <strong>${escapeHtml(formatPoints(summary.total))} of ${escapeHtml(formatPoints(target))} · ${escapeHtml(formatPercent(percent))}</strong>
            ${rank ? `<span class="member-rank-pill">Rank #${rank} of ${memberCount}</span>` : ""}
          </div>
        </div>
        ${renderMemberDaySchedule(entries, community)}
        <button class="profile-expander" type="button" data-profile-rule-toggle aria-expanded="${breakdownOpen ? "true" : "false"}">
          <span>See rule breakdown (${summary.breakdown.length})</span>
          <span class="profile-expander-chevron" aria-hidden="true">${breakdownOpen ? "▴" : "▾"}</span>
        </button>
        ${breakdownOpen ? `<div class="rule-progress-list">${summary.breakdown.length ? summary.breakdown.map((item) => renderMemberRuleProgressCard(item, community.system)).join("") : `<div class="empty-mini">No community rules yet.</div>`}</div>` : ""}
      </section>`;
  }

  // Center the Today's-Schedule timeline on the now-marker (parity with bindMemberSchedule).
  function centerProfileTodaySchedule(root) {
    const cal = root && root.querySelector(".ds-cal");
    if (cal && cal.dataset.nowTop) cal.scrollTop = Math.max(0, Number(cal.dataset.nowTop) - cal.clientHeight / 2);
  }

  function profileMessageButton(name) {
    return `<button class="secondary-button small" type="button" data-profile-message aria-label="Message ${name}"><span aria-hidden="true">✉</span> Message</button>`;
  }

  // 128 → "128", 1200 → "1.2k", 12000 → "12k".
  function formatFollowCount(n) {
    const v = Math.max(0, Number(n) || 0);
    if (v < 1000) return String(v);
    return Number((v / 1000).toFixed(1)) + "k";
  }

  // Header relationship button: public → instant Follow/Following (follows table);
  // private → friend-request approval (Request to follow → Requested → Friends).
  function profileRelationshipButton(o) {
    const id = escapeHtml(String(state.profileUserId));
    const fs = o.friend_status || "none";
    if (fs === "friends") return `<span class="profile-rel-status">Friends</span>`;
    if (fs === "pending_out") return `<span class="profile-rel-status">Requested</span>`;
    if (fs === "pending_in") return `<button class="primary-button small" type="button" data-profile-friend-accept="${id}">Accept request</button>`;
    if (o.visibility === "private") return `<button class="primary-button small" type="button" data-profile-follow-request="${id}">Request to follow</button>`;
    return o.is_following
      ? `<button class="secondary-button small profile-following" type="button" data-profile-unfollow="${id}">Following</button>`
      : `<button class="primary-button small" type="button" data-profile-follow="${id}"><span aria-hidden="true">+</span> Follow</button>`;
  }

  function profileLockedButton(o) {
    const id = escapeHtml(String(state.profileUserId));
    const fs = o.friend_status || "none";
    if (fs === "pending_out") return `<span class="profile-rel-status">Requested — pending approval</span>`;
    if (fs === "pending_in") return `<button class="primary-button" type="button" data-profile-friend-accept="${id}">Accept their request</button>`;
    return `<button class="primary-button" type="button" data-profile-follow-request="${id}">Request to follow</button>`;
  }

  // Rank the person's public/request-to-join communities by overlap with the viewer's
  // tracked categories (reuses the discover relevance helper).
  function profileRankedCommunities(o) {
    const cats = callerDiscoverCategories();
    const norm = (c) => String(c || "").trim();
    return (o.communities || []).map((c) => {
      let rel = cats.includes(norm(c.category)) ? 2 : 0;
      const rules = (c.system && Array.isArray(c.system.rules)) ? c.system.rules : [];
      rules.forEach((r) => { if (cats.includes(norm((r || {}).category))) rel += 1; });
      return { c: c, rel: rel };
    }).sort((a, b) => b.rel - a.rel).map((x) => x.c);
  }

  // "You might like" — public communities this person is in that YOU are not. Hidden on
  // your own profile. Never recommends a community you're already a member of.
  function renderProfileYouMightLike(o, isOwnProfile) {
    if (isOwnProfile) return "";
    const top = profileSuggestions(o);
    if (!top.length) return "";
    return `
      <section class="profile-section">
        <h3 class="profile-section-title">You might like</h3>
        <div class="profile-suggest-list">${top.map(profileSuggestRow).join("")}</div>
      </section>`;
  }

  // Ranked community suggestions, excluding any you're already a member of (so a
  // community you're in is never recommended). Shared by "You might like" and the
  // "all communities" dedup so they stay consistent.
  function profileSuggestions(o) {
    return profileRankedCommunities(o).filter((c) => !c.is_member).slice(0, 4);
  }

  // Every "you might like" item is a COMMUNITY → Community tag + Join/Request action
  // (request_to_join → Request/Requested). Members are filtered out upstream.
  function profileSuggestRow(c) {
    const name = escapeHtml(c.name || "Community");
    const action = profileCommunityAction(c, "primary-button small");
    return `<div class="profile-suggest-row"><span class="profile-type-tag tag-community">Community</span><span class="profile-suggest-name">${name}</span>${action}</div>`;
  }

  function profileCommunityAction(c, btnClass) {
    const id = escapeHtml(String(c.id));
    if (c.is_member) return `<span class="profile-rel-status">Joined</span>`;
    if (c.visibility === "request_to_join") {
      return c.request_status === "pending"
        ? `<span class="profile-rel-status">Requested</span>`
        : `<button class="${btnClass}" type="button" data-profile-request="${id}">Request</button>`;
    }
    return `<button class="${btnClass}" type="button" data-profile-join="${id}">Join</button>`;
  }

  // Recent posts — a hybrid grid (default) or the stacked list. Both render the SAME
  // server-gated posts (o.posts), so visibility is already enforced; tiles tap to open
  // the full post via openEntryPost, exactly like the list cards.
  function renderProfileRecentPosts(o) {
    // Profile "Recent posts" is a PHOTO grid: caption-only text posts and bare logs live in the
    // feed, not here. Filter to posts that carry a photo (they still show their caption in the tile/card).
    const posts = (o.posts || []).filter((p) => p.photo_path);
    // No "Recent posts" heading — the posts attach straight under the profile header (CSS pulls this
    // section up onto it) so the header → Grid/List tabs → grid read as one continuous IG-style block.
    if (!posts.length) {
      return `<section class="profile-section profile-posts-section">${emptyState("No photos yet.")}</section>`;
    }
    // Grid/List as a full-width tab bar attached to the top of the grid (IG-style): the active tab
    // gets a bottom accent underline. Same toggle state + handler (data-profile-posts-view) —
    // just relocated from beside the title so the control + photos read as one connected block.
    const gridOn = state.profilePostsView !== "list";
    const tab = (view, glyph, label, on) =>
      `<button class="profile-posts-tab${on ? " is-active" : ""}" type="button" role="tab" aria-selected="${on ? "true" : "false"}" data-profile-posts-view="${view}" aria-label="${label}"><span aria-hidden="true">${glyph}</span></button>`;
    const tabs = `<div class="profile-posts-tabs" role="tablist" aria-label="Posts layout">${tab("grid", "▦", "Grid view", gridOn)}${tab("list", "☰", "List view", !gridOn)}</div>`;
    const body = state.profilePostsView === "list"
      ? `<div class="profile-posts-list">${posts.map(renderProfilePostCard).join("")}</div>`
      : `<div class="profile-posts-grid">${posts.map(renderProfilePostTile).join("")}</div>`;
    return `<section class="profile-section profile-posts-section"><div class="profile-posts-block">${tabs}${body}</div></section>`;
  }

  // One square grid tile — PHOTO posts only (the grid is filtered to photos upstream). Image
  // thumbnail with a small like/comment counts scrim. Tappable → the full post (openEntryPost).
  function renderProfilePostTile(p) {
    const photoPath = p.photo_path || "";
    if (!photoPath) return ""; // defensive: non-photo posts are filtered out before we get here
    const entryId = escapeHtml(String(p.entry_id));
    const likes = Number(p.like_count) || 0;
    const comments = Number(p.comment_count) || 0;
    const parts = [];
    if (likes) parts.push(`♥ ${escapeHtml(formatFollowCount(likes))}`);
    if (comments) parts.push(`💬 ${escapeHtml(formatFollowCount(comments))}`);
    const counts = parts.length ? `<span class="profile-tile-counts">${parts.join(" · ")}</span>` : "";
    // Multi-photo marker (⧉) — shown only when the post carries more than one photo. Posts
    // are single-photo today, so this stays dormant until that data exists.
    const carousel = Number(p.photo_count) > 1 ? `<span class="profile-tile-carousel" aria-hidden="true">⧉</span>` : "";
    return `<button class="profile-post-tile profile-tile-photo" type="button" data-profile-post="${entryId}" aria-label="Open post">
        <div class="ig-photo profile-tile-img" data-entry-photo="${escapeHtml(photoPath)}" role="img" aria-label="Post photo"><img alt="" loading="lazy"></div>
        ${carousel}
        ${counts}
      </button>`;
  }

  // Read-only ig-card for the profile body — photo + caption + like/comment COUNTS,
  // tappable to open the full interactive post in the Feed (avoids the feed's
  // #communityFeed-bound like/comment delegation entirely).
  function renderProfilePostCard(p) {
    const o = profileOverview || {};
    const entryId = escapeHtml(String(p.entry_id));
    const name = escapeHtml(o.display_name || "Member");
    const when = escapeHtml(window.PointwellSignals.formatRelativeTime(p.updated_at || p.entry_date, Date.now()) || "");
    const sub = escapeHtml(p.community_name || "Community") + (when ? " · " + when : "");
    const photoPath = p.photo_path || "";
    const photoHtml = photoPath ? `<div class="ig-photo" data-entry-photo="${escapeHtml(photoPath)}" role="img" aria-label="Post photo"><img alt="" loading="lazy"></div>` : "";
    const message = p.message ? `<div class="ig-caption"><span class="ig-name">${name}</span>${escapeHtml(String(p.message))}</div>` : "";
    const likes = Number(p.like_count) || 0, comments = Number(p.comment_count) || 0;
    const counts = (likes || comments)
      ? `<div class="ig-likes">${[likes ? plural(likes, "like") : "", comments ? plural(comments, "comment") : ""].filter(Boolean).join(" · ")}</div>`
      : "";
    return `
      <article class="ig-card profile-post-card" role="button" tabindex="0" data-profile-post="${entryId}" aria-label="Open post">
        <div class="ig-card-header">
          ${renderAvatar({ name: o.display_name || "Member", avatarUrl: o.avatar_url })}
          <div class="ig-head-main"><span class="ig-head-name">${name}</span><span class="ig-head-sub">${sub}</span></div>
          <span class="ds-go" aria-hidden="true">›</span>
        </div>
        ${photoHtml}
        ${message}
        ${counts}
      </article>`;
  }

  // Owner taps the banner / "Add cover photo" / the avatar 📷 badge → open the library
  // picker (the hidden file input rendered in the hero), remembering which field to write.
  function triggerProfileImgPick(target) {
    if (profileImgUploading) return;
    profileImgUploadTarget = target === "cover" ? "cover" : "avatar";
    const input = els.profilePageBody && els.profilePageBody.querySelector("[data-profile-img-input]");
    if (input) { input.value = ""; input.click(); }
  }

  function onProfilePageChange(event) {
    const input = event.target.closest && event.target.closest("[data-profile-img-input]");
    if (!input) return;
    const file = input.files && input.files[0];
    if (file) uploadProfileImage(file, profileImgUploadTarget);
    input.value = ""; // allow re-picking the same file
  }

  // Upload via the EXISTING avatar path (avatars bucket, owner <uid>/ folder), then save the
  // public URL to cover_url/avatar_url and reflect it in state.profile so it persists + re-renders.
  async function uploadProfileImage(file, target) {
    if (!file) return;
    if (!/^image\//i.test(file.type || "")) { showToast("That's not an image — choose a photo"); return; }
    if (file.size > ENTRY_PHOTO_MAX_BYTES) { showToast("Photo is too big (max 5 MB) — pick a smaller one"); return; }
    const uid = state.account && state.account.userId;
    if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.uploadAvatar !== "function") {
      showToast("Sign in to set a photo");
      return;
    }
    const isCover = target === "cover";
    profileImgUploading = true;
    showToast(isCover ? "Uploading cover…" : "Uploading photo…");
    const up = await Promise.resolve(window.PointwellSignals.uploadAvatar(file, uid)).catch(() => ({ error: { message: "upload failed" } }));
    profileImgUploading = false;
    if (up.error || !up.url) {
      showToast(up.error && up.error.message ? up.error.message : "Couldn't upload — try again");
      return;
    }
    if (isCover) state.profile.coverUrl = up.url; else state.profile.avatarUrl = up.url;
    const patch = isCover ? { cover_url: up.url } : { avatar_url: up.url };
    Promise.resolve(window.PointwellSignals.updateProfile(uid, patch)).then((r) => {
      if (r && r.error) showToast("Saved here, but couldn't sync to the server");
    }).catch(() => {});
    saveState();
    renderProfilePage();
    showToast(isCover ? "Cover photo updated" : "Profile photo updated");
  }

  function bindProfilePage() {
    const root = els.profilePageBody;
    if (!root || root.dataset.profileBound === "1") return;
    root.dataset.profileBound = "1";
    root.addEventListener("click", onProfilePageClick);
    root.addEventListener("change", onProfilePageChange);
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!event.target.closest) return;
      const block = event.target.closest("[data-schedule-entry]");
      if (block) { event.preventDefault(); openScheduleEntry(block.dataset.scheduleEntry); return; }
      const card = event.target.closest("[data-profile-post]");
      if (card) { event.preventDefault(); openEntryPost(card.dataset.profilePost); }
    });
  }

  function onProfilePageClick(event) {
    const t = event.target;
    const find = (sel) => t.closest && t.closest(sel);
    const listBack = find("[data-profile-list-back]"); if (listBack) { state.profileListMode = null; saveState(); renderProfilePage(); return; }
    const back = find("[data-profile-back]"); if (back) { state.activeView = profileBackView || "feed"; saveState(); render(); return; }
    const settings = find("[data-profile-settings]"); if (settings) { openProfile(); return; }
    const coverEdit = find("[data-profile-cover-edit]"); if (coverEdit) { triggerProfileImgPick("cover"); return; }
    const avatarEdit = find("[data-profile-avatar-edit]"); if (avatarEdit) { triggerProfileImgPick("avatar"); return; }
    const stat = find("[data-profile-stat]"); if (stat) { openProfileList(stat.dataset.profileStat); return; }
    const listOpen = find("[data-profile-list-open]"); if (listOpen) { openUserProfile(listOpen.dataset.profileListOpen); return; }
    const listFollow = find("[data-profile-list-follow]"); if (listFollow) { profileListFollow(listFollow.dataset.profileListFollow, true); return; }
    const listUnfollow = find("[data-profile-list-unfollow]"); if (listUnfollow) { profileListFollow(listUnfollow.dataset.profileListUnfollow, false); return; }
    const follow = find("[data-profile-follow]"); if (follow) { profileFollow(follow.dataset.profileFollow); return; }
    const unfollow = find("[data-profile-unfollow]"); if (unfollow) { profileUnfollow(unfollow.dataset.profileUnfollow); return; }
    const req = find("[data-profile-follow-request]"); if (req) { profileFollowRequest(req.dataset.profileFollowRequest); return; }
    const acc = find("[data-profile-friend-accept]"); if (acc) { acceptFriendByUser(acc.dataset.profileFriendAccept); setTimeout(() => loadProfileOverview(state.profileUserId), 500); return; }
    const msg = find("[data-profile-message]"); if (msg) { profileMessage(); return; }
    const join = find("[data-profile-join]"); if (join) { profileJoinCommunity(join.dataset.profileJoin); return; }
    const rj = find("[data-profile-request]"); if (rj) { profileRequestCommunity(rj.dataset.profileRequest); return; }
    const copy = find("[data-profile-copy]"); if (copy) { profileCopySystem(copy.dataset.profileCopy); return; }
    const pv = find("[data-profile-posts-view]"); if (pv) { state.profilePostsView = pv.dataset.profilePostsView === "list" ? "list" : "grid"; saveState(); renderProfilePage(); return; }
    // "Today in <community>" section interactions (kudos, rule breakdown, schedule).
    const kudos = find("[data-today-kudos]"); if (kudos) { sendProfileTodayKudos(); return; }
    const ruleToggle = find("[data-profile-rule-toggle]"); if (ruleToggle) { state.profileRuleBreakdownOpen = !state.profileRuleBreakdownOpen; saveState(); renderProfilePage(); return; }
    const schedToggle = find("[data-toggle-schedule]"); if (schedToggle) { state.scheduleExpanded = !state.scheduleExpanded; saveState(); renderProfilePage(); return; }
    const schedBlock = find("[data-schedule-entry]"); if (schedBlock) { openScheduleEntry(schedBlock.dataset.scheduleEntry); return; }
    const post = find("[data-profile-post]"); if (post) { openEntryPost(post.dataset.profilePost); return; }
  }

  // One-tap kudos from the "Today in <community>" strip — reuses sendChosenSignal with the
  // first kudos preset (same as the standings quick-kudos).
  function sendProfileTodayKudos() {
    const community = state.communities.find((c) => String(c.id) === String(state.profileCommunityContextId));
    if (!community) return;
    const member = (community.members || []).find((m) => String(m.userId) === String(state.profileUserId));
    if (!member) return;
    const preset = (window.PointwellSignals && typeof window.PointwellSignals.presetsForType === "function")
      ? window.PointwellSignals.presetsForType("kudos")[0]
      : "Nice work";
    sendChosenSignal(community, member, "kudos", preset, null);
  }

  function profileFollow(id) {
    if (!signalsReady()) { showToast("Sign in to follow"); return; }
    if (profileOverview) {
      profileOverview.is_following = true;
      // Following this profile adds the viewer to its followers — reflect it at once.
      if (profileOverview.follower_count != null) profileOverview.follower_count = Number(profileOverview.follower_count) + 1;
    }
    renderProfilePage();
    Promise.resolve(window.PointwellSignals.followUser(id)).then((r) => { if (r && r.error) { showToast("Couldn't follow"); loadProfileOverview(id); } }).catch(() => loadProfileOverview(id));
  }
  function profileUnfollow(id) {
    if (profileOverview) {
      profileOverview.is_following = false;
      if (profileOverview.follower_count != null) profileOverview.follower_count = Math.max(0, Number(profileOverview.follower_count) - 1);
    }
    renderProfilePage();
    Promise.resolve(window.PointwellSignals.unfollowUser(id)).then((r) => { if (r && r.error) loadProfileOverview(id); }).catch(() => loadProfileOverview(id));
  }
  function profileFollowRequest(id) {
    if (!signalsReady()) { showToast("Sign in to send a request"); return; }
    const nm = (profileOverview && profileOverview.display_name) || "";
    sendFriendRequestTo(id, nm);
    if (profileOverview) profileOverview.friend_status = "pending_out";
    renderProfilePage();
  }
  function profileMessage() {
    const o = profileOverview || {};
    state.activeView = "chats";
    saveState();
    render();
    openChatConversation(String(state.profileUserId), o.display_name || "Member", "");
  }
  function profileJoinCommunity(id) {
    if (!communitiesAreShared()) return;
    Promise.resolve(window.PointwellSignals.joinCommunity(id, state.account.userId, "member")).then((r) => {
      if (r && r.error) { showToast(communityDbError(r.error, "Couldn't join that community")); return; }
      showToast("Joined community");
      Promise.resolve(loadCommunitiesFromDb()).catch(() => {});
      loadProfileOverview(state.profileUserId);
    }).catch(() => {});
  }
  function profileRequestCommunity(id) {
    if (!communitiesAreShared()) return;
    Promise.resolve(window.PointwellSignals.requestToJoin(id, state.account.userId)).then((r) => {
      if (r && r.error) { showToast(communityDbError(r.error, "Couldn't request to join")); return; }
      showToast(r.already ? "You've already requested to join" : "Request sent — the owner will review it");
      loadProfileOverview(state.profileUserId);
    }).catch(() => {});
  }
  function profileCopySystem(communityId) {
    const o = profileOverview || {};
    const c = (o.communities || []).find((x) => String(x.id) === String(communityId));
    if (!c || !c.system) { showToast("No system to copy"); return; }
    const source = normalizeSystem(Object.assign({}, c.system, { title: c.system.title || (c.name + " system"), category: c.system.category || c.category || "" }));
    const copy = cloneSystem(source, (source.title || "System") + " remix");
    copy.ownerId = "me";
    copy.ownerName = state.profile.name;
    copy.visibility = "private";
    state.systems.unshift(copy);
    saveState();
    showToast("Copied into your systems");
  }

  function renderProfile() {
    els.profileNameInput.value = state.profile.name;
    els.profileHandleInput.value = state.profile.handle.replace(/^@/, "");
    if (els.profileBioInput) els.profileBioInput.value = state.profile.bio || "";
    updateBioCounter();
    els.profilePrivacyInput.value = state.profile.privacy;
    if (els.allowMotivationInput) els.allowMotivationInput.checked = state.profile.allowMotivation === true;
    if (els.allowAutoSyncInput) els.allowAutoSyncInput.checked = state.profile.allowAutoSync !== false; // default ON
    refreshProfileAvatar();

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
    // Only real wearables remain (Fitbit / Whoop) — every Connect starts a live OAuth flow.
    els.integrationList.innerHTML = integrationDefinitions.map(renderIntegrationCard).join("");
    Array.from(els.integrationList.querySelectorAll("[data-connect-integration]")).forEach((button) => {
      button.addEventListener("click", () => connectWearable(button.dataset.connectIntegration));
    });
    Array.from(els.integrationList.querySelectorAll("[data-sync-integration]")).forEach((button) => {
      button.addEventListener("click", () => syncAllConnectedAndCatchUp({ manual: true }));
    });
    Array.from(els.integrationList.querySelectorAll("[data-disconnect-integration]")).forEach((button) => {
      button.addEventListener("click", () => disconnectIntegration(button.dataset.disconnectIntegration));
    });
  }

  function renderIntegrationCard(definition) {
    // Coming-soon placeholder: shown but not connectable (no live OAuth, no fake data).
    if (definition.comingSoon) {
      return `
        <article class="integration-card is-coming-soon">
          <div class="integration-main">
            <strong>${escapeHtml(definition.label)}</strong>
            <span>Coming soon</span>
            <p>${escapeHtml(definition.description)}</p>
          </div>
          <div class="integration-actions">
            <button class="secondary-button small" type="button" disabled>Coming soon</button>
          </div>
        </article>
      `;
    }
    const integration = state.integrations?.[definition.id] || { status: "not-connected", lastSynced: "" };
    const connected = integration.status === "connected";
    // Live wearable: show the synced metric values; zeros (pre-sync) are hidden until it syncs.
    const metrics = Object.entries(state.mockSyncData?.[definition.id] || defaultMockSyncData[definition.id] || {})
      .filter(([, value]) => Number(value) > 0)
      .slice(0, 3)
      .map(([metric, value]) => `${sourceMetricLabel(definition.id, metric)}: ${formatCount(value)}`)
      .join(" · ");
    const statusText = connected ? wearableSyncedLabel(integration.lastSynced) : "Not connected";
    return `
      <article class="integration-card">
        <div class="integration-main">
          <strong>${escapeHtml(definition.label)}</strong>
          <span>${escapeHtml(statusText)}</span>
          <p>${escapeHtml(definition.description)}</p>
          <small>${escapeHtml(metrics || "Connect to start syncing your live data.")}</small>
        </div>
        <div class="integration-actions">
          ${connected
            ? `<button class="secondary-button small" type="button" data-sync-integration="${escapeHtml(definition.id)}">Sync now</button>
               <button class="ghost-button small" type="button" data-disconnect-integration="${escapeHtml(definition.id)}">Disconnect</button>`
            : `<button class="secondary-button small" type="button" data-connect-integration="${escapeHtml(definition.id)}">Connect</button>`}
        </div>
      </article>
    `;
  }

  // "Synced just now / 5m ago", reusing the signals relative-time formatter.
  function wearableSyncedLabel(iso) {
    if (!iso) return "Connected";
    const rel = window.PointwellSignals && typeof window.PointwellSignals.formatRelativeTime === "function"
      ? window.PointwellSignals.formatRelativeTime(iso)
      : "";
    if (!rel) return "Connected";
    return rel === "just now" ? "Synced just now" : `Synced ${rel} ago`;
  }

  function disconnectIntegration(integrationId) {
    state.integrations = normalizeIntegrations(state.integrations);
    state.integrations[integrationId] = {
      status: "not-connected",
      lastSynced: ""
    };
    // For a real device, revoke server-side and clear the cached live values.
    if (isRealWearable(integrationId)) {
      state.mockSyncData = mergeMockSyncData(state.mockSyncData);
      state.mockSyncData[integrationId] = { ...defaultMockSyncData[integrationId] };
      if (window.PointwellWearables) window.PointwellWearables.disconnect(integrationId).catch(() => {});
    }
    const system = getTrackerSystem();
    if (system) {
      syncDraftInputsFromEntries(system);
      autoSaveToday(system);
    }
    saveState();
    render();
    showToast(`${dataSourceLabel(integrationId)} disconnected`);
  }

  // ── Real wearable devices (Fitbit / Whoop) — live OAuth + sync ───────────────
  // These funnel real metrics into state.mockSyncData[provider], so the entire
  // existing synced-rule pipeline (syncedValueForRule, dashboards, charts) renders
  // live data with no further changes.
  function isRealWearable(id) {
    return REAL_WEARABLE_SOURCES.has(id) && !!window.PointwellWearables;
  }

  async function connectWearable(provider) {
    const api = window.PointwellWearables;
    if (!api || !api.isConfigured()) {
      showToast("Sign in with your account first to connect a device.");
      return;
    }
    showToast(`Opening ${dataSourceLabel(provider)} to connect…`);
    const res = await api.connect(provider);
    // On success the browser is already redirecting; only surface failures.
    if (res && res.error) showToast(res.error.message || "Couldn't start the connection.");
  }

  // Friendly short name for sync toasts/badges ("Fitbit" reads better than the full
  // "Google Health (Fitbit)" label in a one-line confirmation).
  function wearableShortLabel(provider) {
    if (provider === "google-health") return "Fitbit";
    if (provider === "whoop") return "Whoop";
    return dataSourceLabel(provider);
  }

  // After a wearable sync, push the freshly-synced values into EVERY rule that reads them —
  // across all personal systems AND every community the user is in — recalculating + saving
  // each context so standings and the feed reflect them everywhere (not just the active
  // tracker). Synced values are computed live (syncedValueForRule); in todayValuesForSystem/
  // communityValuesForMember manual logs ADD on top of the synced value (and re-syncing just
  // refreshes the live base, so it never stacks). Returns the count of rules tied to
  // `provider` that received a synced value today.
  function fanOutSyncedMetricsToContexts(provider) {
    let updated = 0;
    const countRule = (rule) => {
      if (provider && rule.dataSource !== provider) return;
      const value = syncedValueForRule(rule, { userId: "me", date: todayIso });
      if (value !== null && Number(value) > 0) updated += 1;
    };
    (state.systems || []).forEach((system) => {
      (system.rules || []).forEach((item) => countRule(scoring.normalizeRule(item)));
      autoSaveToday(system);
    });
    (state.communities || []).forEach((community) => {
      const sys = normalizeSystem(community.system || { rules: [] });
      (sys.rules || []).forEach((item) => countRule(scoring.normalizeRule(item)));
      saveCommunitySummaryForMember(community, "me");
    });
    const active = getTrackerSystem();
    if (active) syncDraftInputsFromEntries(active);
    return updated;
  }

  // Sync one real wearable via its API: pull metrics, fan them out to every rule, detect new
  // workouts. The "Catch up your day" card is built once after all sources sync (runCatchUp).
  async function syncWearable(provider, options = {}) {
    const api = window.PointwellWearables;
    if (!api) return false;
    if (!options.silent) showToast(`Syncing ${wearableShortLabel(provider)}…`);
    const res = await api.sync(provider);
    if (res.error) {
      if (!options.silent) showToast(res.error.message || "Couldn't sync right now.");
      return false;
    }
    const result = res.data && res.data.providers && res.data.providers[provider];
    const changed = applyWearableMetrics(res.data && res.data.providers);
    if (changed) fanOutSyncedMetricsToContexts(provider);
    detectNewWorkouts(provider, result && result.workouts);
    if (result && result.error === "reconnect" && !options.silent) {
      showToast(`Reconnect ${wearableShortLabel(provider)} to keep syncing.`);
    }
    saveState();
    // Re-run catch-up after EACH successful standalone sync (not just login/batch), so metrics
    // that sync LATER (e.g. Fitbit sleep after waking) still surface "you slept Xh — log it?".
    // The batch path passes deferRender and runs catch-up once itself.
    if (!options.deferRender) { if (changed) runCatchUp(); else render(); }
    return changed;
  }

  // Sync ALL connected integrations (source-agnostic: real wearables hit their API; mock
  // sources already hold data), then surface the unified "Catch up your day" card.
  async function syncAllConnectedAndCatchUp(options = {}) {
    const api = window.PointwellWearables;
    if (api) {
      if (options.manual) showToast("Syncing your devices…");
      const real = Object.keys(state.integrations || {}).filter((id) => isRealWearable(id) && integrationStatus(id) === "connected");
      await Promise.all(real.map((p) => syncWearable(p, { silent: true, deferRender: true })));
    }
    runCatchUp(options);
  }

  // Rebuild the proactive nudge set (device increments + behind-a-habit) and let Coach decide
  // whether to peek/badge. Fired after a device sync and on today-refresh — NOT just for opening
  // the app (buildCatchUp returns null when there's nothing new, so Coach stays quiet).
  function runCatchUp(options = {}) {
    const card = buildCatchUp();
    const auto = autoApplyCatchUp(card); // auto-count eligible device increments; trims `card`
    // Drop the card if auto-sync consumed every prompt row (no remaining device rows, no manual).
    const trimmed = card && (card.devices.length || (card.manual || []).length) ? card : null;
    state.catchUp = trimmed; // null when nothing new / everything auto-counted
    saveState();
    coachIngestNudges();
    // Manual "Sync now" gets explicit feedback: a confirmation toast if anything auto-counted (the
    // recap lands in the Coach thread, which may be closed), else the "all caught up" note.
    if (options.manual && auto.applied.length) showToast("Synced — auto-counted your latest progress.");
    else if (options.manual && !trimmed) showToast("You're all caught up — nothing new to log.");
    render();
    coachShowAutoSyncRecap(auto.applied, auto.lastLogged); // confirmation + "post?" offer in the Coach thread
  }

  // Re-sync + rebuild catch-up when the app regains focus, so data that lands while the user is
  // away — last night's sleep, ready when they open the app after waking — surfaces WITHOUT a
  // manual sync (the old code only synced at login). Throttled so flipping tabs doesn't hammer
  // the connectors; runCatchUp itself stays quiet when there's genuinely nothing new.
  let lastAutoResyncAt = 0;
  let autoResyncBound = false;
  function maybeAutoResync() {
    if (!wearablesBootstrapped) return;             // wait for the initial bootstrap/login sync
    if (!state.account) return;                     // signed out → no background sync or nudges over the auth screen
    if (typeof document !== "undefined" && document.hidden) return;
    // Re-check the streak-at-risk nudge on every focus (its own once/day + later-in-the-day guards
    // keep it quiet) so re-opening the app in the evening surfaces it even without a re-login.
    try { maybeShowStreakAtRisk(); } catch (e) { /* best-effort */ }
    const now = Date.now();
    if (now - lastAutoResyncAt < 15 * 60 * 1000) return; // at most once / 15 min (was 5; cuts focus-driven community re-fetch egress)
    lastAutoResyncAt = now;
    syncAllConnectedAndCatchUp({ background: true });
  }
  function bindAutoResync() {
    if (autoResyncBound || typeof document === "undefined") return;
    autoResyncBound = true;
    document.addEventListener("visibilitychange", maybeAutoResync);
    window.addEventListener("focus", maybeAutoResync);
  }

  // Merge connector results into local state. Returns true if any value landed.
  function applyWearableMetrics(providers) {
    if (!providers || typeof providers !== "object") return false;
    state.mockSyncData = mergeMockSyncData(state.mockSyncData);
    state.integrations = normalizeIntegrations(state.integrations);
    let changed = false;
    Object.keys(providers).forEach((provider) => {
      const result = providers[provider] || {};
      if (!result.metrics) return;
      const numeric = numericMetrics(result.metrics);
      state.integrations[provider] = {
        status: "connected",
        lastSynced: result.last_synced_at || new Date().toISOString()
      };
      state.mockSyncData[provider] = { ...(state.mockSyncData[provider] || {}), ...numeric };
      if (Object.keys(numeric).length) changed = true;
    });
    return changed;
  }

  function numericMetrics(metrics) {
    const out = {};
    Object.keys(metrics || {}).forEach((key) => {
      const value = Number(metrics[key]);
      if (Number.isFinite(value)) out[key] = value;
    });
    return out;
  }

  // Finish an OAuth round-trip if the user just returned from Fitbit/Whoop, then
  // refresh status + pull a fresh snapshot for any already-connected device.
  let wearablesBootstrapped = false;
  function initWearables() {
    bindAutoResync();
    const api = window.PointwellWearables;
    // Even with no wearable API, surface the catch-up card for manual still-to-log rules.
    if (!api) { if (!wearablesBootstrapped) { wearablesBootstrapped = true; runCatchUp({ login: true }); } return; }
    completeWearableRedirect().catch(() => {});
    if (wearablesBootstrapped) return;
    wearablesBootstrapped = true;
    api.status().then((res) => {
      const connections = (res && res.data && res.data.connections) || [];
      if (connections.length) {
        const providers = {};
        connections.forEach((c) => {
          providers[c.provider] = { metrics: c.last_metrics || {}, last_synced_at: c.last_synced_at };
        });
        applyWearableMetrics(providers);
        saveState();
        render();
      }
      // Refresh every connected device live, then show ONE unified catch-up card.
      syncAllConnectedAndCatchUp({ login: true });
    }).catch(() => runCatchUp({ login: true }));
  }

  async function completeWearableRedirect() {
    const api = window.PointwellWearables;
    if (!api) return;
    const result = await api.completeRedirect();
    if (!result) return;
    if (result.error) {
      showToast(result.error.message || "The connection didn't complete.");
      return;
    }
    const provider = result.provider;
    if (!provider) return;
    state.integrations = normalizeIntegrations(state.integrations);
    state.integrations[provider] = { status: "connected", lastSynced: new Date().toISOString() };
    saveState();
    render();
    showToast(`${dataSourceLabel(provider)} connected — syncing your data…`);
    await syncWearable(provider, { silent: true });
    showToast(`${dataSourceLabel(provider)} connected`);
  }

  // ── PART C — detect new Fitbit workouts and prompt to log them ───────────────
  // The sync response carries recent exercise/workout sessions. We remember which we've
  // seen (so none ever nags twice) and queue the newest unseen one for a dismissible
  // "log it?" prompt. Logging reuses the AI quick-log confirm card + add-entry/save path.
  function detectNewWorkouts(provider, workouts) {
    if (provider !== "google-health" || !Array.isArray(workouts) || !workouts.length) return;
    state.knownWorkoutIds = Array.isArray(state.knownWorkoutIds) ? state.knownWorkoutIds : [];
    const known = new Set(state.knownWorkoutIds.map(String));
    const fresh = workouts.filter((w) => w && w.id && !known.has(String(w.id)));
    if (!fresh.length) return;
    // Remember every fresh id now so a dismissed/declined session never re-prompts.
    fresh.forEach((w) => state.knownWorkoutIds.push(String(w.id)));
    if (state.knownWorkoutIds.length > 200) state.knownWorkoutIds = state.knownWorkoutIds.slice(-200);
    // Queue the most recent fresh session (don't clobber one already awaiting a decision).
    if (!state.pendingWorkout) {
      const newest = fresh.slice().sort((a, b) => String(b.startTime || "").localeCompare(String(a.startTime || "")))[0];
      state.pendingWorkout = { ...newest, provider };
    }
  }

  // Best-effort workout → loggable rule: prefer a rule whose label/unit mentions the workout
  // type or is workout/exercise/minutes-flavored; else the first number rule. Returns a
  // catalog item (the user can still change it in the confirm card) or null.
  function matchWorkoutToRule(workout, catalog) {
    if (!catalog.length) return null;
    const typeWords = String(workout.type || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const score = (c) => {
      const hay = `${c.label} ${c.unit}`.toLowerCase();
      let s = 0;
      if (typeWords.some((w) => hay.includes(w))) s += 5;
      if (/workout|exercise|train|gym|cardio|run|lift|move|active|sport/.test(hay)) s += 2;
      if (/\b(min|minute|minutes)\b/.test(String(c.unit).toLowerCase())) s += 1;
      if (c.type === "number") s += 1;
      return s;
    };
    let best = null, bestScore = -1;
    catalog.forEach((c) => { const s = score(c); if (s > bestScore) { bestScore = s; best = c; } });
    return best;
  }

  // "Log it" — drop the workout into the quick-log confirm card (matched rule + duration as
  // the amount), tagged as a Fitbit import, and open Add Entry. The user can change the
  // rule/context, multi-log, or add a photo/caption, then Confirm — all via existing paths.
  function startWorkoutLog() {
    const workout = state.pendingWorkout;
    if (!workout) return;
    const catalog = buildLoggableRuleCatalog();
    if (!catalog.length) { showToast("Add a rule to a system or community first."); return; }
    const match = matchWorkoutToRule(workout, catalog);
    if (!match) { showToast("No rule to log this to yet."); return; }
    const entry = normalizeQuickLogEntry({
      contextType: match.contextType,
      contextId: match.contextId,
      ruleId: match.id,
      amount: numberOrDefault(workout.durationMinutes, 0) || 1,
    });
    if (!entry) { showToast("Couldn't map that workout."); return; }
    entry.isFitbitImport = true;
    quickLogDraft = [entry];
    quickLogClarifications = [];
    quickLogEditing = true; // import needs the rule/amount + "add photo" controls, not the one-tap view
    state.pendingWorkout = null; // the prompt has been acted on
    state.activeView = "add-entry";
    setQuickLogHint(`From ${wearableShortLabel(workout.provider || "google-health")}: ${workout.type || "Workout"} — pick the rule/amount, then Confirm.`);
    saveState();
    render();
    renderQuickLogDraft();
    requestAnimationFrame(() => {
      if (els.quickLogDraft && els.quickLogDraft.scrollIntoView) els.quickLogDraft.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function dismissWorkoutPrompt() {
    state.pendingWorkout = null; // already remembered in knownWorkoutIds → won't re-prompt
    saveState();
    renderWearablePrompt();
  }

  // Non-blocking, dismissible prompt mounted in its own fixed container (#wearablePrompt).
  function renderWearablePrompt() {
    const mount = els.wearablePrompt;
    if (!mount) return;
    const w = state.pendingWorkout;
    if (!w) { mount.hidden = true; mount.innerHTML = ""; return; }
    const dur = numberOrDefault(w.durationMinutes, 0);
    const durText = dur > 0 ? ` · ${dur} min` : "";
    const calText = w.calories ? ` · ${formatValue(w.calories)} cal` : "";
    mount.hidden = false;
    mount.innerHTML = `
      <div class="wearable-prompt-card">
        <div class="wearable-prompt-main">
          <span class="via-source-tag">via ${escapeHtml(wearableShortLabel(w.provider || "google-health"))}</span>
          <strong>New ${escapeHtml(w.type || "Workout")}${escapeHtml(durText)}${escapeHtml(calText)}</strong>
          <span class="wearable-prompt-sub">Log it to a rule?</span>
        </div>
        <div class="wearable-prompt-actions">
          <button type="button" class="ghost-button small" data-workout-dismiss>Not now</button>
          <button type="button" class="primary-button small" data-workout-log>Log it</button>
        </div>
      </div>`;
  }

  function bindWearablePrompt() {
    if (!els.wearablePrompt) return;
    els.wearablePrompt.addEventListener("click", (event) => {
      if (event.target.closest("[data-workout-dismiss]")) { dismissWorkoutPrompt(); return; }
      if (event.target.closest("[data-workout-log]")) { startWorkoutLog(); return; }
    });
  }

  // ── PART A — "since your last check-in" sync card ────────────────────────────
  // Every rule the user can log to (personal systems + communities), with what we need to
  // match a device metric to it. Source-agnostic: a Fitbit step count can be logged to ANY
  // steps-ish rule the user picks, even one not wired to Fitbit.
  function loggableRuleTargets() {
    const out = [];
    const add = (rawRule, contextType, contextId, contextName) => {
      const rule = scoring.normalizeRule(rawRule);
      if (rule.simpleStyle === "penalty" || rule.allowManualOverride === false) return;
      out.push({ ruleId: rule.id, rule, contextType, contextId, contextName, label: rule.label || "", unit: rule.unit || "", sourceMetric: rule.sourceMetric });
    };
    (state.systems || []).forEach((s) => (s.rules || []).forEach((r) => add(r, "personal", s.id, s.title || "System")));
    (state.communities || []).forEach((c) => {
      const sys = normalizeSystem(c.system || { rules: [] });
      (sys.rules || []).forEach((r) => add(r, "community", c.id, c.name || "Community"));
    });
    return out;
  }

  // How well a rule fits a device metric: exact sourceMetric match (3) beats a label/unit word
  // match (1, e.g. a manual "Steps" rule for the "steps" metric); 0 = no match.
  function ruleMatchScore(target, source, metric) {
    if (target.sourceMetric && target.sourceMetric === metric) return 3;
    const words = `${sourceMetricLabel(source, metric)} ${metric}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
    const hay = `${target.label} ${target.unit}`.toLowerCase();
    return words.some((w) => hay.includes(w)) ? 1 : 0;
  }

  // True if a rule has a genuine HAND-logged entry today (not a synced/materialized one).
  function ruleHasManualEntryToday(contextType, contextId, ruleId) {
    const today = getTodayKey();
    if (contextType === "community") {
      return (state.communityEntries || []).some((e) =>
        e.communityId === contextId && e.userId === "me" && e.ruleId === ruleId && (e.dateKey || e.date) === today && !e.viaSource);
    }
    return (state.quickEntries || []).some((e) =>
      e.systemId === contextId && e.ruleId === ruleId && (e.dateKey || e.date) === today && !e.viaSource);
  }

  // Is this manual rule logged on a MEANINGFUL share of recent days (frequency-based, not just
  // "ever logged once")? Counts distinct days with a hand-log in the last 14 and requires it on
  // ≥50% of the days it's been around — min 3 logged days, so a one-off or rare habit never
  // qualifies (that was the noisy "you usually log X" bug).
  function ruleLoggedFrequently(systemId, ruleId, today) {
    const WINDOW = 14;
    const agoOf = {}; // dateKey -> days ago (1..WINDOW)
    for (let i = 1; i <= WINDOW; i++) agoOf[offsetDate(-i)] = i;
    const loggedAgo = new Set();
    const consider = (dateKey) => { if (agoOf[dateKey]) loggedAgo.add(agoOf[dateKey]); };
    (state.quickEntries || []).forEach((e) => { if (e.systemId === systemId && e.ruleId === ruleId) consider(e.dateKey || e.date); });
    (state.entries || []).forEach((e) => {
      if ((e.systemId === systemId || e.rewardSystemId === systemId) && e.values && numberOrDefault(e.values[ruleId], 0) > 0) consider(e.dateKey || e.date);
    });
    const loggedDays = loggedAgo.size;
    if (loggedDays < 3) return false;                                            // too small a sample to call it a habit
    const span = Math.max.apply(null, Array.from(loggedAgo));                    // days since the oldest log in the window
    return loggedDays / Math.min(WINDOW, span) >= 0.5;
  }

  // "Still to log": manual rules (no data feed) the user FREQUENTLY logs but hasn't yet today.
  // Frequency-gated so it never nags about something logged only once; PROACTIVE callers also drop
  // rules the user has repeatedly dismissed (direct "what's left?" answers stay complete).
  function buildStillToLog(opts) {
    const proactive = !!(opts && opts.proactive);
    const today = getTodayKey();
    const out = [];
    (state.systems || []).forEach((system) => {
      (system.rules || []).map(scoring.normalizeRule).forEach((rule) => {
        if (rule.dataSource !== "manual" || rule.simpleStyle === "penalty") return;
        const loggedToday = (state.quickEntries || []).some((e) => e.systemId === system.id && e.ruleId === rule.id && (e.dateKey || e.date) === today);
        if (loggedToday) return;
        if (!ruleLoggedFrequently(system.id, rule.id, today)) return;
        if (proactive && coachRuleSuppressed(system.id, rule.id)) return;
        out.push({ ruleId: rule.id, contextType: "personal", contextId: system.id, contextName: system.title || "System", label: rule.label, unit: rule.unit });
      });
    });
    return out.slice(0, 6); // gentle — never a nag wall
  }

  // Build the "Catch up your day" card: for EVERY connected source, surface each metric that
  // changed since last seen ("you added +X steps · now Y"), matched to any rule that fits it
  // (so you can log it to any system you pick — Fitbit-wired or not) + the points it'd earn.
  // Plus manual still-to-log. Returns null when there's nothing new/unlogged.
  // ── Incremental sync reconciliation ──────────────────────────────────────────
  // Device "total" metrics (steps/sleep/calories/distance/…) accumulate over the day and reset
  // at midnight, so we add only what the device counted SINCE the last reconcile — never the raw
  // total (which would double-count manual logs). Per rule/day we keep a BASELINE (device reading
  // at the last reconcile) + the LOGGED increments so far; a rule's synced value = its logged
  // increments, and a manual log re-baselines so already-counted activity isn't re-added. EVENT/
  // count metrics (separate workouts, "times") stack normally and are NOT baselined.
  const TOTAL_METRICS = new Set([
    "steps", "sleep-hours", "sleep", "active-calories", "calories", "total-calories",
    "distance", "exercise-minutes", "workout-minutes", "daily-spending", "net-spending",
    "dining-spending", "shopping-spending", "nutrition-protein", "nutrition-carbs", "nutrition-fat", "nutrition",
  ]);
  function isTotalMetric(metric) { return TOTAL_METRICS.has(metric); }

  // Per-rule/day synced state { logged, baseline }. Keyed by today's date so it resets daily
  // (device totals reset daily; baselines never carry over). Old days are pruned.
  function syncProgressToday() {
    state.syncProgress = state.syncProgress || {};
    const today = getTodayKey();
    Object.keys(state.syncProgress).forEach((k) => { if (k !== today) delete state.syncProgress[k]; });
    return (state.syncProgress[today] = state.syncProgress[today] || {});
  }
  // Read-only (no mutation — safe to call during scoring/render).
  function syncProgressForRule(ruleId) {
    const today = getTodayKey();
    return (state.syncProgress && state.syncProgress[today] && state.syncProgress[today][ruleId]) || null;
  }
  // The synced contribution to a rule's value today = the increments logged for it (NOT the raw total).
  function loggedSyncedForRule(ruleId) {
    const p = syncProgressForRule(ruleId);
    return p ? numberOrDefault(p.logged, 0) : 0;
  }
  // A rule's synced contribution today under the model: calculated → its formula value; a device
  // daily-TOTAL metric → the logged increments (incremental reconciliation); a device measurement/
  // event metric (resting HR, recovery, strain, balance, …) → its live value as before (those
  // aren't baselined). Read-only.
  function syncedContribution(rule, opts = {}) {
    const userId = opts.userId || "me";
    const date = opts.date || todayIso;
    if (rule.dataSource !== "calculated" && isTotalMetric(rule.sourceMetric)) {
      return (userId === "me" && date === todayIso) ? loggedSyncedForRule(rule.id) : 0;
    }
    return syncedValueForRule(rule, { userId, date }) ?? 0;
  }
  // The device's CURRENT total for the rule's own source+metric (null if not a connected device rule).
  function deviceTotalForRule(rule) {
    if (!isExternalRuleSynced(rule) || !isSourceConnected(rule.dataSource)) return null;
    const v = Number((state.mockSyncData?.[rule.dataSource] || {})[rule.sourceMetric]);
    return Number.isFinite(v) ? v : null;
  }
  // Sum of TODAY's HAND-logged (non-synced) entries for a rule across personal + community.
  function manualSumTodayForRule(ruleId) {
    const today = getTodayKey();
    let sum = 0;
    (state.quickEntries || []).forEach((e) => { if (e.ruleId === ruleId && (e.dateKey || e.date) === today && !e.viaSource) sum += numberOrDefault(e.amount, 0); });
    (state.communityEntries || []).forEach((e) => { if (e.ruleId === ruleId && e.userId === "me" && (e.dateKey || e.date) === today && !e.viaSource) sum += numberOrDefault(e.amount, 0); });
    return sum;
  }
  // Snapshot the current device reading as the rule's baseline (no increment added) — used after a
  // manual log so device activity counted before it isn't re-added on the next sync.
  function rebaselineRuleSync(rule) {
    if (!isTotalMetric(rule.sourceMetric)) return;
    const device = deviceTotalForRule(rule);
    if (device === null) return;
    const day = syncProgressToday();
    (day[rule.id] = day[rule.id] || { logged: 0, baseline: device }).baseline = device;
  }
  // Apply this sync's increment: logged += max(0, device − baseline); baseline = device. Returns it.
  function applySyncIncrementForRule(rule) {
    if (!isTotalMetric(rule.sourceMetric)) return 0;
    const device = deviceTotalForRule(rule);
    if (device === null) return 0;
    const day = syncProgressToday();
    const p = day[rule.id] = day[rule.id] || { logged: 0, baseline: 0 };
    const inc = Math.max(0, device - numberOrDefault(p.baseline, 0));
    p.logged = numberOrDefault(p.logged, 0) + inc;
    p.baseline = device;
    return inc;
  }
  // What we'd apply right now, without mutating state → { increment, current, unknown }. unknown =
  // no baseline yet AND a manual value already exists today (→ show Keep/Update conflict, don't guess).
  function syncIncrementPreview(rule) {
    if (!isTotalMetric(rule.sourceMetric)) return null;
    const current = deviceTotalForRule(rule);
    if (current === null) return null;
    const p = syncProgressForRule(rule.id);
    if (!p) {
      if (manualSumTodayForRule(rule.id) > 0) return { increment: 0, current, unknown: true };
      return { increment: current, current, unknown: false }; // fresh day → today's whole total
    }
    return { increment: Math.max(0, current - numberOrDefault(p.baseline, 0)), current, unknown: false };
  }

  // ── No-rule synced metrics: surface them so device data is never silently ignored ──
  // wearableLastSeen holds the last value we've SHOWN-AND-HANDLED per source+metric+day, so a
  // metric the user isn't tracking yet (no matching rule) still surfaces once per NEW value — and
  // never re-nags the same number. (Matched rules already dedupe via the syncProgress baseline.)
  function wearableValueSeen(source, metric, current, today) {
    const seen = ((state.wearableLastSeen || {})[source] || {})[metric];
    return !!(seen && seen.dateKey === today && Number(seen.value) === Number(current));
  }
  function markWearableSeen(source, metric, value) {
    const map = state.wearableLastSeen || (state.wearableLastSeen = {});
    (map[source] = map[source] || {})[metric] = { value: Number(value), dateKey: getTodayKey() };
  }
  // Only offer to start tracking movement/sleep/energy metrics — not bank-balance / stat noise.
  const TRACKABLE_OFFER_METRICS = /^(steps|sleep|sleep-hours|active-calories|calories|total-calories|distance|exercise-minutes|workout-minutes)$/;
  function canOfferTracking(metric) { return TRACKABLE_OFFER_METRICS.test(metric); }
  function primaryPersonalSystem() { return (state.systems || [])[0] || null; }
  // Sensible starter config for a brand-new tracking rule created from a synced metric.
  function trackingConfigForMetric(metric, fallback) {
    const m = String(metric || "").toLowerCase();
    const label = (fallback && fallback.label) || sourceMetricLabel((fallback && fallback.source) || "", metric) || "Metric";
    if (/step/.test(m)) return { label: "Steps", category: "Fitness", unit: "steps", target: 10000, every: 1000, max: 20000, step: 100 };
    if (/sleep/.test(m)) return { label: "Sleep", category: "Wellness", unit: "hours", target: 8, every: 1, max: 12, step: 0.5 };
    if (/calorie/.test(m)) return { label: label, category: "Fitness", unit: "cal", target: 500, every: 100, max: 2000, step: 10 };
    if (/distance/.test(m)) return { label: "Distance", category: "Fitness", unit: "mi", target: 3, every: 1, max: 26, step: 0.5 };
    if (/minute|exercise|workout/.test(m)) return { label: label, category: "Fitness", unit: "minutes", target: 30, every: 10, max: 180, step: 5 };
    const cur = Math.max(1, Math.round(numberOrDefault(fallback && fallback.current, 1)));
    return { label: label, category: "General", unit: (fallback && fallback.unit) || "units", target: cur, every: 1, max: Math.max(10, cur * 2), step: 1 };
  }

  function buildCatchUp() {
    const targets = loggableRuleTargets();
    const today = getTodayKey();
    const devices = [];
    const offers = []; // synced metrics with NO matching rule yet — "start tracking?" rows
    Object.keys(state.mockSyncData || {}).forEach((source) => {
      if (source === "manual" || source === "calculated" || !isSourceConnected(source)) return;
      const data = state.mockSyncData[source] || {};
      Object.keys(data).forEach((metric) => {
        if (!isTotalMetric(metric)) return; // incremental card is for daily-total metrics
        const current = Number(data[metric]);
        if (!Number.isFinite(current) || current <= 0) return;
        // Match the metric to any rule it could log to (exact metric, then label). Skip stat noise.
        const matched = targets.map((t) => ({ t, score: ruleMatchScore(t, source, metric) }))
          .filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
        if (matched.length) {
          // Only a rule that's actually device-reconcilable — a synced total-metric rule on a
          // connected source (syncIncrementPreview non-null) — can receive the incremental delta.
          // A MANUAL rule that merely matches by LABEL cannot; don't black-hole the metric on it.
          const reconcilable = matched.filter((m) => syncIncrementPreview(m.t.rule));
          if (reconcilable.length) {
            const best = reconcilable[0].t;
            const preview = syncIncrementPreview(best.rule);
            if (!preview.unknown && preview.increment === 0) return; // nothing new since last time
            devices.push({
              source, metric,
              label: sourceMetricLabel(source, metric),
              sourceLabel: wearableShortLabel(source),
              unit: best.rule.unit || "",
              current, increment: preview.increment, unknown: !!preview.unknown,
              conflictMine: preview.unknown ? manualSumTodayForRule(best.rule.id) : 0,
              points: preview.unknown ? 0 : scoring.calculateRule(best.rule, preview.increment).totalPoints,
              targets: reconcilable.map((m) => ({ contextType: m.t.contextType, contextId: m.t.contextId, contextName: m.t.contextName, ruleId: m.t.ruleId, label: m.t.label })),
              primary: best.contextId + "|" + best.ruleId,
              checked: !preview.unknown,
            });
            return;
          }
          // A manual rule matches by LABEL but nothing is device-reconcilable yet (e.g. a hand-
          // logged "Steps" rule + Fitbit steps). Don't drop the metric — offer to CONNECT the
          // device feed to that existing rule. Deduped once per new value, like the create offer.
          if (canOfferTracking(metric) && !wearableValueSeen(source, metric, current, today)) {
            const t0 = matched[0].t;
            offers.push({
              source, metric, connect: true,
              contextType: t0.contextType, contextId: t0.contextId, contextName: t0.contextName, ruleId: t0.ruleId,
              label: sourceMetricLabel(source, metric), ruleLabel: t0.label,
              sourceLabel: wearableShortLabel(source),
              unit: t0.unit || "",
              current, increment: current, unknown: false, conflictMine: 0, points: 0,
              targets: [], primary: "", checked: false,
            });
          }
          return;
        }
        // No rule maps to this metric at all — surface it once per new value with a "start
        // tracking (create a new rule)" offer (deduped via wearableLastSeen).
        if (!canOfferTracking(metric)) return;
        if (wearableValueSeen(source, metric, current, today)) return;
        if (!primaryPersonalSystem()) return; // nowhere to add a rule → stay quiet
        offers.push({
          source, metric, noRule: true,
          label: sourceMetricLabel(source, metric),
          sourceLabel: wearableShortLabel(source),
          unit: trackingConfigForMetric(metric, { source, current, label: sourceMetricLabel(source, metric) }).unit,
          current, increment: current, unknown: false, conflictMine: 0, points: 0,
          targets: [], primary: "", checked: false,
        });
      });
    });
    // Device deltas take PRIORITY over manual nudges; cap "start tracking" offers so it never nags.
    const allDevices = devices.concat(offers.slice(0, 2));
    const manual = buildStillToLog({ proactive: true });
    if (!allDevices.length && !manual.length) return null;
    return { at: new Date().toISOString(), devices: allDevices, manual };
  }

  // Advance every device target's baseline to the current reading (so dismissed/handled rows
  // aren't re-offered, and the rule's next increment is measured from here). Doesn't add anything.
  // Apply the increment of one checked device row to a target rule (incremental model).
  // Reused by the Coach "Log it" nudge action.
  function applyDeviceRowToTarget(target, source, touched) {
    const resolved = resolveQuickLogRule(target.contextType, target.contextId, target.ruleId);
    if (!resolved) return false;
    applySyncIncrementForRule(resolved.rule); // logged += increment; baseline = current
    if (target.contextType === "community") {
      const community = (state.communities || []).find((c) => c.id === target.contextId);
      if (community) saveCommunitySummaryForMember(community, "me");
    } else if (touched) {
      touched.add(target.contextId);
    }
    return true;
  }

  // Should this catch-up target auto-count on login/sync WITHOUT a manual tap?
  //   • PERSONAL rules  → yes, unless the user turned off "Auto-count my connected-device data".
  //   • COMMUNITY rules → only when the owner enabled allow_device_autosync AND the member has the
  //     rule's device source connected (the latter is implicit for any emitted row, but checked).
  // Anything not eligible falls through to the existing "want to log this?" catch-up prompt.
  function autoSyncEligibleForTarget(target) {
    if (!target) return false;
    if (target.contextType === "community") {
      const community = (state.communities || []).find((c) => c.id === target.contextId);
      if (!community || community.allowDeviceAutosync !== true) return false;
      const resolved = resolveQuickLogRule(target.contextType, target.contextId, target.ruleId);
      return !!(resolved && isSourceConnected(resolved.rule.dataSource));
    }
    return state.profile.allowAutoSync !== false; // personal default ON
  }

  // On login / app-open / each device sync, auto-apply connected-device increments into eligible
  // rules (per the gates above) using the SAME incremental path as the Coach "Log it" nudge
  // (applyDeviceRowToTarget → applySyncIncrementForRule). Mutates `card` in place: fully-applied
  // rows are dropped, partially-applied rows keep only their still-manual targets (so the later
  // catch-up prompt can't re-apply the auto ones → no double-count). Returns the per-row recap +
  // a coach.lastLogged-shaped array for the post offer. Never touches connect/noRule offers or
  // unknown-baseline conflict rows (those must stay an explicit Keep/Update choice).
  function autoApplyCatchUp(card) {
    const applied = [];    // [{ sourceLabel, increment, unit, label, contexts:[{type,name,points}] }]
    const lastLogged = []; // coach.lastLogged shape, for coachOfferPost()
    if (!card || !Array.isArray(card.devices)) return { applied, lastLogged };
    const touched = new Set();
    const remaining = [];
    card.devices.forEach((row) => {
      if (row.connect || row.noRule || row.unknown || !Array.isArray(row.targets) || !row.targets.length) {
        remaining.push(row);
        return;
      }
      const contexts = [];
      const keepTargets = [];
      row.targets.forEach((target) => {
        if (!autoSyncEligibleForTarget(target) || !applyDeviceRowToTarget(target, row.source, touched)) {
          keepTargets.push(target);
          return;
        }
        lastLogged.push({ contextType: target.contextType, contextId: target.contextId, ruleId: target.ruleId, amount: row.increment, isYesNo: false });
        const r = resolveQuickLogRule(target.contextType, target.contextId, target.ruleId);
        const points = r ? scoring.calculateRule(r.rule, row.increment).totalPoints : 0;
        contexts.push({ type: target.contextType, name: target.contextName, points });
      });
      if (contexts.length) applied.push({ sourceLabel: row.sourceLabel, increment: row.increment, unit: row.unit, label: row.label, contexts });
      if (keepTargets.length) {
        // Some targets still need a manual tap → keep a trimmed row that renders correctly.
        row.targets = keepTargets;
        row.primary = keepTargets[0].contextId + "|" + keepTargets[0].ruleId;
        const pr = resolveQuickLogRule(keepTargets[0].contextType, keepTargets[0].contextId, keepTargets[0].ruleId);
        if (pr) row.points = scoring.calculateRule(pr.rule, row.increment).totalPoints;
        remaining.push(row);
      }
      // else: fully auto-applied → drop the row from the prompt.
    });
    (state.systems || []).forEach((system) => { if (touched.has(system.id)) { syncDraftInputsFromEntries(system); autoSaveToday(system); } });
    card.devices = remaining;
    return { applied, lastLogged };
  }

  // After auto-sync applies something, show the compact "Fitbit synced — added X to today"
  // confirmation (per work/login-recap-autosync.html) and offer to turn it into a post. REUSES
  // coachOfferPost → coachOpenPostPicker → composer (same destination/learn path; no parallel post).
  function coachShowAutoSyncRecap(applied, lastLogged) {
    if (!applied || !applied.length) return;
    applied.forEach((a) => {
      const amount = escapeHtml(formatMetricPhrase(a.increment, a.unit, (a.label || "").toLowerCase()));
      const lines = (a.contexts || []).map((c) => {
        const pts = c.points ? ` · ${escapeHtml(formatSigned(c.points))} pts` : "";
        const where = c.type === "community"
          ? `auto-counted in <strong>${escapeHtml(c.name || "your community")}</strong>`
          : `counted toward <strong>${escapeHtml(c.name || "your system")}</strong>`;
        return `<div class="coach-sync-line">↳ ${where}${pts}</div>`;
      }).join("");
      coachSay(`
        <div class="coach-card coach-sync-card">
          <p class="coach-card-title">✅ ${escapeHtml(a.sourceLabel || "Device")} synced — added ${amount} to today</p>
          ${lines}
        </div>`);
    });
    coach.lastLogged = lastLogged;
    coachOfferPost();
    if (typeof renderCoachLauncher === "function") renderCoachLauncher();
  }

  // Conflict resolution for an unknown-baseline row: "Keep mine" rebaselines (device counts from
  // here on, manual value kept); "Update" sets the rule to the device total (logged makes up the
  // difference over the manual value) and rebaselines.
  function resolveCatchUpConflict(rowIndex, choice) {
    const d = state.catchUp && state.catchUp.devices && state.catchUp.devices[rowIndex];
    if (!d) return;
    const touched = new Set();
    (d.targets || []).forEach((target) => {
      const resolved = resolveQuickLogRule(target.contextType, target.contextId, target.ruleId);
      if (!resolved) return;
      const device = deviceTotalForRule(resolved.rule);
      if (device === null) { rebaselineRuleSync(resolved.rule); return; }
      const day = syncProgressToday();
      const p = day[resolved.rule.id] = day[resolved.rule.id] || { logged: 0, baseline: 0 };
      if (choice === "update") p.logged = Math.max(0, device - manualSumTodayForRule(resolved.rule.id)); // total → device value
      p.baseline = device;
      if (target.contextType === "community") {
        const community = (state.communities || []).find((c) => c.id === target.contextId);
        if (community) saveCommunitySummaryForMember(community, "me");
      } else { touched.add(target.contextId); }
    });
    (state.systems || []).forEach((system) => {
      if (touched.has(system.id)) { syncDraftInputsFromEntries(system); autoSaveToday(system); }
    });
    state.catchUp.devices.splice(rowIndex, 1); // resolved → drop the row
    if (!state.catchUp.devices.length && !state.catchUp.manual.length) state.catchUp = null;
    saveState();
    render();
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
    Array.from(els.dailyInputList.querySelectorAll("[data-add-entry-step]")).forEach((button) => {
      button.addEventListener("click", () => stepAddEntryAmount(Number(button.dataset.addEntryStep)));
    });
    Array.from(els.dailyInputList.querySelectorAll("[data-add-entry-button]")).forEach((button) => {
      button.addEventListener("click", () => addDailyEntryFromDraft());
    });
    bindEntryAttachControls();
  }

  function bindEntryAttachControls() {
    const root = els.dailyInputList;
    if (!root) return;
    const messageInput = root.querySelector("[data-entry-message]");
    if (messageInput) {
      messageInput.addEventListener("input", () => {
        addEntryAttachment.message = messageInput.value.slice(0, ENTRY_MESSAGE_MAX);
        const counter = root.querySelector("[data-entry-message-count]");
        if (counter) counter.textContent = `${addEntryAttachment.message.length}/${ENTRY_MESSAGE_MAX}`;
      });
    }
    const addBtn = root.querySelector("[data-entry-photo-add]");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const menu = root.querySelector("[data-entry-photo-menu]");
        if (menu) menu.hidden = !menu.hidden;
      });
    }
    Array.from(root.querySelectorAll("[data-entry-photo-pick]")).forEach((button) => {
      button.addEventListener("click", () => {
        const which = button.dataset.entryPhotoPick;
        const input = root.querySelector(`[data-entry-photo-input="${which}"]`);
        if (input) input.click();
      });
    });
    Array.from(root.querySelectorAll("[data-entry-photo-input]")).forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file) chooseEntryPhoto(file);
      });
    });
    const removeBtn = root.querySelector("[data-entry-photo-remove]");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        if (addEntryAttachment.previewUrl) { try { URL.revokeObjectURL(addEntryAttachment.previewUrl); } catch (e) { /* ignore */ } }
        addEntryAttachment.file = null;
        addEntryAttachment.previewUrl = "";
        refreshAddEntryPanel();
      });
    }
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

  // ── AI quick-log ─────────────────────────────────────────────────────────────
  // Type or speak what you did → parse-log maps it to your rules → editable draft →
  // confirm saves through the EXISTING add paths. AI output is ALWAYS a proposal.
  let quickLogDraft = [];          // [{ _id, contextType, contextId, ruleId, isYesNo, amount, note, confidence, isPhotoEstimate? }]
  let quickLogClarifications = []; // [{ _id, ruleHint, question, amount?, done?, selected, options:[{contextType,contextId,contextName,ruleId,type}] }]
  let quickLogBusy = false;
  let quickLogEditing = false;     // false = compact one-tap-confirm view; true = per-row edit controls (behind "Edit")
  let quickLogRecognition = null;
  let quickLogRecording = false;

  function resetQuickLog() {
    quickLogDraft = [];
    quickLogClarifications = [];
    quickLogBusy = false;
    quickLogEditing = false;
    if (quickLogRecording) stopQuickLogMic();
    if (els.quickLogInput) els.quickLogInput.value = "";
    setQuickLogHint("");
    renderQuickLogDraft();
  }

  function setQuickLogHint(text) {
    if (els.quickLogHint) els.quickLogHint.textContent = text || "";
  }

  // Every rule the user can manually log, across their systems + joined communities.
  function buildLoggableRuleCatalog() {
    const catalog = [];
    const pushRule = (rawRule, contextType, contextId, contextName) => {
      const rule = scoring.normalizeRule(rawRule);
      if (rule.simpleStyle === "penalty") return;                       // penalties aren't logged toward a goal
      if (rule.dataSource === "calculated") return;                     // derived totals, not directly logged
      const externalSynced = rule.dataSource && rule.dataSource !== "manual" && rule.dataSource !== "calculated";
      if (externalSynced && rule.allowManualOverride === false) return; // manual logging is off for this rule
      catalog.push({
        id: rule.id,
        label: rule.label,
        unit: rule.unit,
        type: rule.simpleStyle === "yesNo" ? "yesNo" : "number",
        contextType: contextType,
        contextId: contextId,
        contextName: contextName,
      });
    };
    (state.systems || []).forEach((system) => {
      (system.rules || []).forEach((r) => pushRule(r, "personal", system.id, system.title || "Untitled system"));
    });
    (state.communities || []).forEach((community) => {
      const sys = normalizeSystem(community.system || { rules: [] });
      (sys.rules || []).forEach((r) => pushRule(r, "community", community.id, community.name || "Community"));
    });
    return catalog;
  }

  // Resolve a draft item back to its real rule object + context name (the draft only carries ids).
  function resolveQuickLogRule(contextType, contextId, ruleId) {
    if (contextType === "community") {
      const community = (state.communities || []).find((c) => c.id === contextId);
      if (!community) return null;
      const sys = normalizeSystem(community.system || { rules: [] });
      const rule = (sys.rules || []).map(scoring.normalizeRule).find((r) => r.id === ruleId);
      return rule ? { rule: rule, contextName: community.name || "Community" } : null;
    }
    const system = (state.systems || []).find((s) => s.id === contextId);
    if (!system) return null;
    const rule = (system.rules || []).map(scoring.normalizeRule).find((r) => r.id === ruleId);
    return rule ? { rule: rule, contextName: system.title || "System" } : null;
  }

  function normalizeQuickLogEntry(e) {
    const resolved = resolveQuickLogRule(e.contextType, e.contextId, e.ruleId);
    if (!resolved) return null;
    const isYesNo = resolved.rule.simpleStyle === "yesNo";
    return {
      _id: makeId("qlog"),
      contextType: e.contextType === "community" ? "community" : "personal",
      contextId: e.contextId,
      ruleId: e.ruleId,
      isYesNo: isYesNo,
      amount: isYesNo ? (e.done === false ? 0 : 1) : numberOrDefault(e.amount, 1),
      note: typeof e.note === "string" ? e.note.slice(0, ENTRY_MESSAGE_MAX) : "",
      confidence: numberOrDefault(e.confidence, 0.5),
    };
  }

  // Single mapped entry → drop it into the existing manual composer (rule + amount) in
  // the entry's own context, so the user adds an optional note/photo and taps the same
  // "Post" button. Reuses the composer + add-entry/save path entirely — no parallel post
  // mechanism. Returns false (without side effects) if the rule can't be resolved, so the
  // caller falls back to the review-list card.
  function prefillComposerFromQuickLog(entry) {
    const resolved = resolveQuickLogRule(entry.contextType, entry.contextId, entry.ruleId);
    if (!resolved) return false;
    // Switch the composer to the entry's system/community (mirrors the score-context switch).
    if (entry.contextType === "community") {
      state.scoreContext = "community:" + entry.contextId;
      state.selectedCommunityId = entry.contextId;
    } else {
      state.scoreContext = "personal";
      state.trackerSystemId = entry.contextId;
    }
    state.draftInputs = {};
    // Pre-fill the manual draft (renderAddEntryPanel re-normalizes the amount for the rule).
    addEntryDraft = { ruleId: entry.ruleId, amount: entry.amount };
    aiPrefilledComposer = true;
    // Clear the capture box + any draft so the single-entry review card never shows.
    quickLogDraft = [];
    quickLogClarifications = [];
    if (els.quickLogInput) els.quickLogInput.value = "";
    setQuickLogHint("");
    renderQuickLogDraft();
    saveState();
    render(); // re-renders the add-entry view: composer pre-filled (rule+amount) + AI note
    requestAnimationFrame(() => {
      if (els.dailyInputList && els.dailyInputList.scrollIntoView) els.dailyInputList.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return true;
  }

  async function runQuickLog() {
    const text = els.quickLogInput ? els.quickLogInput.value.trim() : "";
    if (!text) { setQuickLogHint("Type or say what you did first."); return; }
    if (quickLogBusy) return;
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.parseLog !== "function") {
      setQuickLogHint("Sign in to use AI quick log — or log manually below.");
      return;
    }
    const catalog = buildLoggableRuleCatalog();
    if (!catalog.length) { setQuickLogHint("Add a rule to a system or community first."); return; }
    quickLogBusy = true;
    setQuickLogHint("Reading your log…");
    if (els.quickLogSubmit) els.quickLogSubmit.disabled = true;
    try {
      const res = await window.PointwellSignals.parseLog(text, catalog);
      if (res.error) { setQuickLogHint((res.error && res.error.message) || "Quick log is unavailable right now."); return; }
      quickLogDraft = (res.entries || []).map(normalizeQuickLogEntry).filter(Boolean);
      // Pre-pick the best-guess option (server returns candidates top-ranked first) so the user
      // can confirm without resolving each clarification; they can still switch the pick.
      quickLogClarifications = (res.clarifications || []).map((c, i) => Object.assign({}, c, { _id: "clar-" + i, selected: 0 }));
      quickLogEditing = false;
      if (!quickLogDraft.length && !quickLogClarifications.length) {
        setQuickLogHint("Couldn't match that to a rule. Try naming the metric, or log manually below.");
        renderQuickLogDraft();
      } else if (quickLogDraft.length === 1 && !quickLogClarifications.length && prefillComposerFromQuickLog(quickLogDraft[0])) {
        // Exactly one mapped entry → drop it into the single composer (rule + amount),
        // where the user adds an optional note/photo and taps Post. No confirm card.
      } else {
        // Multiple entries (or an unresolved clarification) → keep the review list.
        setQuickLogHint("");
        renderQuickLogDraft();
      }
    } catch (e) {
      setQuickLogHint("Quick log failed — try again or log manually below.");
    } finally {
      quickLogBusy = false;
      if (els.quickLogSubmit) els.quickLogSubmit.disabled = false;
    }
  }

  // Parse-log confidence (0-1) → high / med / low tier (drives both the badge and the ✓ color).
  function quickLogConfidenceLevel(confidence) {
    const c = Math.min(1, Math.max(0, numberOrDefault(confidence, 0)));
    return c >= 0.9 ? "high" : (c >= 0.6 ? "med" : "low");
  }

  // "NN% sure" badge, green when high / amber when medium / red-ish when low. Shown per matched
  // entry so the user can trust-or-edit at a glance.
  function quickLogConfidenceBadge(confidence) {
    const pct = Math.round(Math.min(1, Math.max(0, numberOrDefault(confidence, 0))) * 100);
    return `<span class="quick-log-confidence is-${quickLogConfidenceLevel(confidence)}">${pct}% sure</span>`;
  }

  function renderQuickLogDraft() {
    const mount = els.quickLogDraft;
    if (!mount) return;
    if (!quickLogDraft.length && !quickLogClarifications.length) {
      mount.hidden = true;
      mount.innerHTML = "";
      return;
    }
    mount.hidden = false;
    const catalog = buildLoggableRuleCatalog();
    const rows = quickLogDraft.map((entry) => renderQuickLogRow(entry, catalog)).filter(Boolean).join("");
    const clars = quickLogClarifications.map(renderQuickLogClarification).join("");
    // Each matched entry + each pre-picked clarification becomes one log on confirm.
    const count = quickLogDraft.length + quickLogClarifications.length;
    const cta = count === 1 ? "Log it →" : (count === 2 ? "Log both →" : "Log all " + count + " →");
    mount.innerHTML = `
      <div class="ai-draft-card quick-log-draft-card">
        <div class="quick-log-draft-head">
          <span class="quick-log-draft-title"><span aria-hidden="true">✨</span> Here's what I'll log${quickLogEditing ? "" : " — tap to confirm"}</span>
          <button type="button" class="quick-log-discard-x" data-quick-log-discard aria-label="Discard">✕</button>
        </div>
        ${rows ? `<div class="quick-log-rows">${rows}</div>` : ""}
        ${clars ? `<div class="ai-improve-panel quick-log-clarify">${clars}</div>` : ""}
        <div class="quick-log-draft-actions">
          <button type="button" class="ghost-button quick-log-edit" data-quick-log-edit>${quickLogEditing ? "Done" : "Edit"}</button>
          <button type="button" class="primary-button quick-log-confirm-cta" data-quick-log-confirm${count ? "" : " disabled"}>${count ? escapeHtml(cta) : "Nothing to log"}</button>
        </div>
      </div>`;
  }

  function renderQuickLogRow(entry, catalog) {
    const resolved = resolveQuickLogRule(entry.contextType, entry.contextId, entry.ruleId);
    if (!resolved) return "";
    const rule = resolved.rule;
    const label = escapeHtml(rule.label);
    const unit = rule.unit || "";
    const estimateTag = entry.isPhotoEstimate ? `<span class="quick-log-estimate-tag">AI estimate</span>` : "";
    const fitbitTag = entry.isFitbitImport ? `<span class="quick-log-estimate-tag">via Fitbit</span>` : "";
    // Confidence is a text-match score; photo/Fitbit imports aren't AI text-matches, so no badge
    // (and their ✓ stays green). Otherwise the ✓ follows the confidence tier so a low-confidence
    // match doesn't read as already-approved next to its red-ish badge.
    const isMatch = !entry.isPhotoEstimate && !entry.isFitbitImport;
    const conf = isMatch ? quickLogConfidenceBadge(entry.confidence) : "";
    const checkLevel = isMatch ? quickLogConfidenceLevel(entry.confidence) : "high";

    // Compact confirm view (default): icon + "label · summary" + confidence + a ✓. No controls —
    // editing lives behind the "Edit" toggle so the default path is one tap to confirm.
    if (!quickLogEditing) {
      const summary = entry.isYesNo
        ? (entry.amount > 0 ? (unit ? `1 ${escapeHtml(unit)}` : "done") : "not done")
        : escapeHtml(formatMetricPhrase(entry.amount, unit, ""));
      return `
        <div class="quick-log-row-item is-compact" data-quick-log-id="${escapeHtml(entry._id)}">
          <span class="quick-log-row-icon" aria-hidden="true">${draftRuleIcon(rule)}</span>
          <div class="quick-log-row-summary"><strong>${label}</strong> · ${summary}${estimateTag}${fitbitTag}</div>
          ${conf}
          <span class="quick-log-row-check is-${checkLevel}" aria-hidden="true">✓</span>
        </div>`;
    }

    // Edit view: full per-row controls (amount/toggle, context picker, remove) + points pill.
    const points = scoring.calculateRule(rule, entry.amount).totalPoints;
    const opts = catalog.filter((c) => c.label === rule.label);
    const contextControl = opts.length > 1
      ? `<select class="quick-log-context" data-quick-log-context="${escapeHtml(entry._id)}" aria-label="Where to log ${label}">
           ${opts.map((o) => `<option value="${escapeHtml(o.contextId + "|" + o.id)}"${o.contextId === entry.contextId && o.id === entry.ruleId ? " selected" : ""}>${escapeHtml(o.contextName)}</option>`).join("")}
         </select>`
      : `<span class="quick-log-context-name">${escapeHtml(resolved.contextName)}</span>`;
    const amountControl = entry.isYesNo
      ? `<button type="button" class="quick-log-done${entry.amount > 0 ? " is-on" : ""}" data-quick-log-toggle="${escapeHtml(entry._id)}" aria-pressed="${entry.amount > 0 ? "true" : "false"}">${entry.amount > 0 ? "Done ✓" : "Mark done"}</button>`
      : `<input type="number" class="quick-log-amount" data-quick-log-amount="${escapeHtml(entry._id)}" value="${escapeHtml(String(entry.amount))}" min="0" step="any" inputmode="decimal" aria-label="Amount for ${label}"><span class="quick-log-unit">${escapeHtml(unit)}</span>`;
    // A Fitbit import can become a full post with a selfie + caption (reuses Part B).
    const photoLink = entry.isFitbitImport
      ? `<button type="button" class="quick-log-photo-link" data-quick-log-photo="${escapeHtml(entry._id)}">📷 Add photo &amp; caption</button>`
      : "";
    return `
      <div class="quick-log-row-item" data-quick-log-id="${escapeHtml(entry._id)}">
        <div class="quick-log-row-main">
          <div class="quick-log-row-title"><strong>${label}</strong>${conf}${estimateTag}${fitbitTag}</div>
          <div class="quick-log-row-controls">${amountControl}</div>
          <div class="quick-log-row-context">${contextControl}</div>
          ${photoLink}
        </div>
        <span class="point-pill ${points < 0 ? "negative" : "positive"}">${points >= 0 ? "+" : ""}${escapeHtml(formatPoints(points))} pts</span>
        <button type="button" class="quick-log-remove" data-quick-log-remove="${escapeHtml(entry._id)}" aria-label="Remove ${label}">✕</button>
      </div>`;
  }

  function renderQuickLogClarification(c) {
    const sel = numberOrDefault(c.selected, 0);
    const chips = (c.options || []).map((o, idx) => {
      const on = idx === sel;
      return `<button type="button" class="signal-preset-chip quick-log-clar-chip${on ? " is-selected" : ""}" data-quick-log-clar-pick="${escapeHtml(c._id + "::" + idx)}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(o.contextName)}${on ? " ✓" : ""}</button>`;
    }).join("");
    return `
      <div class="quick-log-clar-item">
        <span class="quick-log-clar-q">${escapeHtml(c.question)} <span class="quick-log-clar-hint">best guess pre-picked</span></span>
        <div class="signal-presets quick-log-clar-chips">${chips}</div>
      </div>`;
  }

  function quickLogEntryById(id) {
    return quickLogDraft.find((e) => e._id === id) || null;
  }

  // Delegated on the static #quickLogDraft container (bound once; survives re-renders).
  function onQuickLogDraftClick(event) {
    const removeBtn = event.target.closest("[data-quick-log-remove]");
    if (removeBtn) {
      quickLogDraft = quickLogDraft.filter((e) => e._id !== removeBtn.dataset.quickLogRemove);
      renderQuickLogDraft();
      return;
    }
    const toggleBtn = event.target.closest("[data-quick-log-toggle]");
    if (toggleBtn) {
      const entry = quickLogEntryById(toggleBtn.dataset.quickLogToggle);
      if (entry) { entry.amount = entry.amount > 0 ? 0 : 1; renderQuickLogDraft(); }
      return;
    }
    const photoBtn = event.target.closest("[data-quick-log-photo]");
    if (photoBtn) {
      const entry = quickLogEntryById(photoBtn.dataset.quickLogPhoto);
      if (entry) upgradeSyncedEntryToPost(entry.contextType, entry.contextId, entry.ruleId, entry.amount, "google-health");
      return;
    }
    const clarChip = event.target.closest("[data-quick-log-clar-pick]");
    if (clarChip) { pickQuickLogClarification(clarChip.dataset.quickLogClarPick); return; }
    if (event.target.closest("[data-quick-log-edit]")) { quickLogEditing = !quickLogEditing; renderQuickLogDraft(); return; }
    if (event.target.closest("[data-quick-log-discard]")) { resetQuickLog(); return; }
    if (event.target.closest("[data-quick-log-confirm]")) { confirmQuickLog(); return; }
  }

  function onQuickLogDraftInput(event) {
    const amountInput = event.target.closest("[data-quick-log-amount]");
    if (!amountInput) return;
    const entry = quickLogEntryById(amountInput.dataset.quickLogAmount);
    if (!entry) return;
    entry.amount = Math.max(0, numberOrDefault(amountInput.value, 0));
    // Refresh just the points pill (no full re-render → the amount input keeps focus).
    const row = amountInput.closest("[data-quick-log-id]");
    const pill = row && row.querySelector(".point-pill");
    const resolved = resolveQuickLogRule(entry.contextType, entry.contextId, entry.ruleId);
    if (pill && resolved) {
      const points = scoring.calculateRule(resolved.rule, entry.amount).totalPoints;
      pill.textContent = `${points >= 0 ? "+" : ""}${formatPoints(points)} pts`;
      pill.classList.toggle("negative", points < 0);
      pill.classList.toggle("positive", points >= 0);
    }
  }

  function onQuickLogDraftChange(event) {
    const contextSelect = event.target.closest("[data-quick-log-context]");
    if (!contextSelect) return;
    const entry = quickLogEntryById(contextSelect.dataset.quickLogContext);
    if (!entry) return;
    const parts = String(contextSelect.value).split("|");
    const match = buildLoggableRuleCatalog().find((c) => c.contextId === parts[0] && c.id === parts[1]);
    if (match) {
      entry.contextType = match.contextType;
      entry.contextId = parts[0];
      entry.ruleId = parts[1];
      // The new context's rule may be a different type — refresh so the row's control
      // (toggle vs number) and points pill match it.
      entry.isYesNo = match.type === "yesNo";
      if (entry.isYesNo) entry.amount = 1;
      else if (!(entry.amount > 0)) entry.amount = 1;
    }
    renderQuickLogDraft();
  }

  // Switch which candidate a clarification is pre-picked to (token = "<clarId>::<optionIndex>").
  // Just updates the selection + re-renders; the pick is materialized into an entry on confirm.
  function pickQuickLogClarification(token) {
    const sep = token.indexOf("::");
    if (sep === -1) return;
    const clarId = token.slice(0, sep);
    const idx = parseInt(token.slice(sep + 2), 10);
    const clar = quickLogClarifications.find((c) => c._id === clarId);
    if (clar && idx >= 0 && idx < (clar.options || []).length) {
      clar.selected = idx;
      renderQuickLogDraft();
    }
  }

  // Turn every pre-picked clarification into a draft entry (its selected candidate), so a single
  // "Log all" confirms the matches AND the clarifications without resolving each one by hand.
  function materializeQuickLogClarifications() {
    quickLogClarifications.forEach((clar) => {
      const option = (clar.options || [])[numberOrDefault(clar.selected, 0)];
      if (!option) return;
      const entry = normalizeQuickLogEntry({
        contextType: option.contextType, contextId: option.contextId, ruleId: option.ruleId,
        amount: clar.amount, done: clar.done,
      });
      // Don't double-add a rule that's already in the draft (avoids same-day double-count).
      if (entry && !quickLogDraft.some((d) => d.contextId === option.contextId && d.ruleId === option.ruleId)) {
        quickLogDraft.push(entry);
      }
    });
    quickLogClarifications = [];
  }

  // Persist one quick-log amount to a PERSONAL system (durable per-entry + daily total).
  // autoSaveToday reads todayValuesForSystem directly, so it doesn't touch the active
  // draft cache; that's re-synced once after the whole batch in confirmQuickLog.
  function addQuickLogPersonalEntry(system, rule, amount, note) {
    state.quickEntries = state.quickEntries || [];
    state.quickEntries.push({
      id: makeId("quick"),
      date: getTodayKey(),
      dateKey: getTodayKey(),
      createdAt: new Date().toISOString(),
      systemId: system.id,
      rewardSystemId: system.id,
      ruleId: rule.id,
      label: rule.label,
      unit: rule.unit,
      amount: amount,
      message: note,
      photoPath: "",
      source: isRuleSynced(rule) ? "manual-adjustment" : "manual",
    });
    rebaselineRuleSync(rule); // device activity already counted isn't re-added on the next sync
    autoSaveToday(system);
  }

  function confirmQuickLog() {
    materializeQuickLogClarifications(); // fold each pre-picked clarification into the draft first
    if (!quickLogDraft.length) return;
    const items = quickLogDraft.slice();
    let saved = 0;
    let failed = 0;
    const dbPushes = [];
    items.forEach((entry) => {
      const resolved = resolveQuickLogRule(entry.contextType, entry.contextId, entry.ruleId);
      if (!resolved) { failed += 1; return; }
      const rule = resolved.rule;
      const amount = normalizeAddEntryAmount(entry.amount, rule);
      if (amount <= 0) { failed += 1; return; } // skip empties — a number left at 0 OR a yes/no toggled "not done"
      const note = (entry.note || "").slice(0, ENTRY_MESSAGE_MAX);
      try {
        if (entry.contextType === "community") {
          const community = state.communities.find((c) => c.id === entry.contextId);
          if (!community) { failed += 1; return; }
          addCommunityEntry(community.id, "me", rule, amount, isRuleSynced(rule) ? "manual-adjustment" : "manual", note, "");
          rebaselineRuleSync(rule); // device activity already counted isn't re-added next sync
          saveCommunitySummaryForMember(community, "me");
          dbPushes.push(Promise.resolve(pushCommunityEntryToDb(community, rule.id, note, "")).catch(() => ({ error: { message: "push failed" } })));
        } else {
          const system = state.systems.find((s) => s.id === entry.contextId);
          if (!system) { failed += 1; return; }
          addQuickLogPersonalEntry(system, rule, amount, note);
        }
        saved += 1;
      } catch (e) {
        failed += 1;
      }
    });
    // Re-sync the active personal system's draft cache so the manual panel reflects the logs.
    const activeCtx = getActiveScoreContext();
    if (activeCtx.type === "personal" && activeCtx.system) syncDraftInputsFromEntries(activeCtx.system);
    if (dbPushes.length) {
      Promise.all(dbPushes).then((results) => {
        if (results.some((r) => r && r.error)) showToast("Logged here, but a community save didn't sync");
      }).catch(() => {});
    }
    resetQuickLog();
    saveState();
    render();
    if (saved && failed) showToast(`Logged ${saved}, ${failed} skipped`);
    else if (saved) showToast(`Logged ${plural(saved, "entry")}`);
    else showToast("Nothing to log");
  }

  // Voice capture — gracefully hidden when SpeechRecognition is unavailable (text-only).
  function setupQuickLogMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !els.quickLogMic) return;
    els.quickLogMic.hidden = false;
    els.quickLogMic.addEventListener("click", () => {
      if (quickLogRecording) { stopQuickLogMic(); return; }
      try {
        quickLogRecognition = new SR();
        quickLogRecognition.lang = "en-US";
        quickLogRecognition.interimResults = true;
        quickLogRecognition.continuous = false;
        quickLogRecognition.onresult = (event) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
          if (els.quickLogInput) els.quickLogInput.value = transcript.trim();
        };
        quickLogRecognition.onend = () => setQuickLogRecording(false);
        quickLogRecognition.onerror = () => setQuickLogRecording(false);
        quickLogRecognition.start();
        setQuickLogRecording(true);
      } catch (e) {
        setQuickLogRecording(false);
      }
    });
  }

  function setQuickLogRecording(on) {
    quickLogRecording = on;
    if (els.quickLogMic) {
      els.quickLogMic.classList.toggle("is-recording", on);
      els.quickLogMic.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (on) setQuickLogHint("Listening… speak now, then tap Log it.");
    else if (els.quickLogHint && String(els.quickLogHint.textContent).indexOf("Listening") === 0) setQuickLogHint("");
  }

  function stopQuickLogMic() {
    if (quickLogRecognition) { try { quickLogRecognition.stop(); } catch (e) { /* ignore */ } }
    setQuickLogRecording(false);
  }

  // ── "Snap a photo" → AI estimate → editable draft rows ────────────────────────
  // Sends the photo to the food-estimate vision Edge Function (same provider + secret as
  // parse-log). It classifies the image as food / workout / other and returns a ROUGH
  // ESTIMATE we map onto the user's matching rule(s) — always labeled and editable before
  // Confirm. We never fabricate numbers: if the photo is unreadable, is "other", or the
  // vision call is unavailable, we say so and let the user type the entry instead.

  // Map a photo ESTIMATE (food or workout) onto the user's actual rules → editable draft
  // rows. Value-driven: for each estimated figure that HAS a value, find the best-matching
  // rule in the catalog (each rule used at most once). Shared by the Coach and the
  // quick-log "Snap" flow so both map photos to rules identically. Returns [] when nothing
  // matches — never fabricates a row.
  function buildEstimateDraftRows(est) {
    if (!est || est.kind === "other") return [];
    const catalog = buildLoggableRuleCatalog();
    const wanted = est.kind === "workout"
      ? [
        { keys: /minute|duration|workout|exercise|cardio|training|gym|run|walk|cycl|ride|lift/i, unitKeys: /min/i, val: est.duration },
        { keys: /distance|mile|\bkm\b|run|walk|cycl|ride/i, unitKeys: /mi|km|mile|distance/i, val: est.distance },
        { keys: /calorie|kcal|energy|active/i, unitKeys: /cal|kcal/i, val: est.calories },
      ]
      : [
        { keys: /calorie|kcal|energy/i, val: est.calories },
        { keys: /protein/i, val: est.protein },
        { keys: /carb/i, val: est.carbs },
        { keys: /fat/i, val: est.fat },
      ];
    const built = [];
    const usedRules = {};
    wanted.forEach((w) => {
      if (!(numberOrDefault(w.val, 0) > 0)) return;
      const c = catalog.find((cc) => {
        if (usedRules[cc.contextId + "|" + cc.id]) return false;
        return w.keys.test(`${cc.label} ${cc.unit}`) || (w.unitKeys && w.unitKeys.test(cc.unit || ""));
      });
      if (!c) return;
      const resolved = resolveQuickLogRule(c.contextType, c.contextId, c.id);
      if (!resolved) return;
      usedRules[c.contextId + "|" + c.id] = true;
      built.push({ _id: makeId("qlog"), contextType: c.contextType, contextId: c.contextId, ruleId: c.id, isYesNo: resolved.rule.simpleStyle === "yesNo", amount: numberOrDefault(w.val, 0), note: "", confidence: numberOrDefault(est.confidence, 0.4) });
    });
    return built;
  }

  async function startPhotoEstimate(file) {
    if (!file) return;
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.estimateFood !== "function") {
      setQuickLogHint("Sign in to read photos — or just type what you did above.");
      return;
    }
    let estimate = null;
    setQuickLogHint("Reading your photo…");
    try {
      const parts = await fileToBase64Parts(file);
      const res = await window.PointwellSignals.estimateFood(parts.data, parts.mediaType, els.quickLogInput ? els.quickLogInput.value.trim() : "");
      if (!res.error && res.estimate) estimate = res.estimate;
    } catch (e) { /* handled below */ }
    if (!estimate) { setQuickLogHint("Couldn't read that photo — type what you did above instead."); return; }
    // "other" → describe / suggest; never fabricate numbers for it.
    if (estimate.kind === "other") {
      setQuickLogHint(estimate.suggestion || estimate.note || "I couldn't put a number on that — type what you did above instead.");
      return;
    }
    const rows = buildEstimateDraftRows(estimate);
    if (!rows.length) {
      setQuickLogHint(estimate.kind === "workout"
        ? "No workout rule (minutes / distance / calories) yet — add one in Build, then snap again."
        : "No calories/protein rule yet — add one in Build, then snap again.");
      return;
    }
    rows.forEach((r) => { r.isPhotoEstimate = true; quickLogDraft.push(r); });
    quickLogEditing = true; // rough AI estimates must be reviewable/editable, not one-tap confirmed
    setQuickLogHint(estimate.kind === "workout" ? "Workout estimate ready — review, then Confirm." : "AI estimate ready — review the numbers, then Confirm.");
    renderQuickLogDraft();
  }

  function bindQuickLogControls() {
    if (els.quickLogSubmit) els.quickLogSubmit.addEventListener("click", runQuickLog);
    if (els.quickLogInput) {
      els.quickLogInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); runQuickLog(); }
      });
    }
    if (els.quickLogDraft) {
      els.quickLogDraft.addEventListener("click", onQuickLogDraftClick);
      els.quickLogDraft.addEventListener("input", onQuickLogDraftInput);
      els.quickLogDraft.addEventListener("change", onQuickLogDraftChange);
    }
    if (els.quickLogSnapButton) {
      els.quickLogSnapButton.addEventListener("click", () => { if (els.quickLogMealInput) els.quickLogMealInput.click(); });
    }
    if (els.quickLogMealInput) {
      els.quickLogMealInput.addEventListener("change", () => {
        const file = els.quickLogMealInput.files && els.quickLogMealInput.files[0];
        els.quickLogMealInput.value = "";
        if (file) startPhotoEstimate(file);
      });
    }
    setupQuickLogMic();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // COACH — an AI chat (floating bottom-left launcher → pop-out panel) that maps what
  // you say / snap to your rules, confirms, logs, and (optionally) turns it into a post.
  // It is a conversational WRAPPER: it reuses the same parse-log call + catalog
  // (buildLoggableRuleCatalog), the same quick-log save path (confirmQuickLog), the same
  // food-estimate vision call, and the same community post path (addCommunityEntry /
  // pushCommunityEntryToDb). No parallel logging or post logic lives here.
  // It is also PROACTIVE: device-increment + behind-a-habit nudges (built by buildCatchUp)
  // are surfaced as confirm-gated chat bubbles + a launcher badge/peek — see coachIngestNudges.
  // ════════════════════════════════════════════════════════════════════════════
  const coach = {
    greeted: false,
    busy: false,
    panelOpen: false,   // pop-out panel visibility
    draft: null,        // { entries:[…], clars:[…], routeAll:bool }  awaiting confirm
    draftCardEl: null,  // the live confirm card element (re-rendered in place)
    post: null,         // composer awaiting post: { kind:'personal'|'community', name, alreadyLogged, amount, caption, file, previewUrl } (+ system/rule for personal, contextId/ruleId for community)
    estimate: null,     // { calories, protein, carbs, fat, items, note, file, previewUrl }
    lastLogged: [],     // [{ contextType, contextId, ruleId, amount, isYesNo }] — for the post offer
    posted: {},         // nudge keys already dropped into the thread (post-once)
    lastPeekSig: "",    // signature of the last peeked nudge set (no re-nag)
    peekTimer: null,
    recapPending: false, // a "Yesterday, recapped" card is waiting in the thread (badge until opened)
  };

  // Read an image File into base64 (no data: prefix) + its media type, for the
  // multimodal food-estimate call. Shared by Coach and the "Snap a photo" quick-log.
  function fileToBase64Parts(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        const comma = url.indexOf(",");
        const meta = url.slice(0, comma);
        const m = meta.match(/data:([^;]+)/);
        resolve({ data: comma > -1 ? url.slice(comma + 1) : url, mediaType: (m && m[1]) || file.type || "image/jpeg" });
      };
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  function coachFirstName() {
    return String((state.profile && state.profile.name) || "there").trim().split(/\s+/)[0] || "there";
  }

  function coachScroll() {
    if (els.coachThread) els.coachThread.scrollTop = els.coachThread.scrollHeight;
  }

  // Append a chat bubble. `html` for coach bubbles is trusted markup built here (any
  // user-derived text inside MUST already be escaped); user bubbles pass escaped text.
  function coachAppendBubble(role, html) {
    if (!els.coachThread) return null;
    const wrap = document.createElement("div");
    wrap.className = "message-bubble coach-bubble " + (role === "user" ? "mine" : "theirs");
    wrap.innerHTML = html;
    els.coachThread.appendChild(wrap);
    coachScroll();
    return wrap;
  }

  function coachSay(html) { return coachAppendBubble("coach", html); }
  function coachSayText(text) { return coachAppendBubble("coach", `<p>${escapeHtml(text)}</p>`); }
  function coachUserText(text) { return coachAppendBubble("user", `<p>${escapeHtml(text)}</p>`); }

  function coachGreet() {
    if (coach.greeted) return;
    coach.greeted = true;
    coachSay(`<p>Hey ${escapeHtml(coachFirstName())} 👋 Tell me what you did — like <em>“ran 5 miles”</em> or <em>“lifted with the boys”</em> — and I'll map it to the right rule and confirm before logging. Tap 📷 to log a meal or workout from a photo.</p>`);
  }

  // Graceful fallback: when the user opens Coach and there's genuinely nothing to surface (no
  // device deltas, nothing FREQUENTLY-logged still outstanding), offer a soft, dismissable invite
  // instead of a canned/irrelevant list — at most once a day, and never if they keep waving it off.
  function coachMaybeSoftPrompt() {
    if (coachActiveNudgeCount()) return;            // real nudges are already in the thread
    if (coachLearning().proactiveOff) return;       // off switch
    if (!coachShouldPeekType("soft")) return;       // keeps dismissing it → stay quiet
    const today = getTodayKey();
    if (state.coachSoftPromptDay === today) return; // at most once / day
    state.coachSoftPromptDay = today;
    saveState();
    coachLearnRecord("soft", "shown");
    coachSay(`
      <div class="coach-card coach-nudge-card is-active">
        <p class="coach-card-title">Want to log anything? Tell me what you did, or tap 📷 to snap a photo.</p>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-softdismiss>Not now</button>
        </div>
      </div>`);
  }
  function coachSoftDismiss(cardEl) {
    coachLearnRecord("soft", "dismissed");
    coachFinalizeCard(cardEl);
  }

  // ── "Yesterday, recapped" — once-per-day AI recap shown on the first open of a new day ──
  // Reuses the existing AI infra (the generate Edge Function, via PointwellSignals.generateRecap)
  // with a robust CLIENT-COMPOSED fallback, and the existing Coach post composer for "Post recap".
  let coachRecap = null;          // { plain, lastLogged } — held so "Post recap" can prefill/seed
  let coachPendingCaption = "";   // one-shot caption to prefill the next composer (recap post)
  let recapHandledThisLoad = false; // dedupe concurrent / token-refresh re-fires within one page load

  // Streak length THROUGH YESTERDAY for one context (mirrors coachContextStreak but anchored at
  // yesterday — a "Yesterday, recapped" card must not fold in today's early-synced partial progress).
  function recapStreakForContext(ctx) {
    let target, getPts;
    if (ctx.type === "community") {
      target = communityTarget(ctx.community);
      const me = (ctx.community.members || []).find((m) => m.id === "me");
      getPts = (d) => me ? communityMemberPointsOnDate(ctx.community, me, d) : 0;
    } else {
      const sys = normalizeSystem(ctx.system);
      target = numberOrDefault(calculateTargetSummary(sys).total, 0);
      getPts = (d) => { const e = findEntry(d, ctx.id); return e ? numberOrDefault(e.total, 0) : 0; };
    }
    if (!(target > 0)) return 0;
    let streak = 0;
    for (let i = 1; i <= 30; i++) { // i=1 is yesterday; today (i=0) is deliberately excluded
      if (getPts(offsetDate(-i)) >= target) streak += 1; else break;
    }
    return streak;
  }
  function recapBestStreak() {
    let best = null;
    (state.systems || []).forEach((s) => { const n = recapStreakForContext({ type: "personal", id: s.id, system: s }); if (n >= 2 && (!best || n > best.length)) best = { length: n, name: s.title || "System" }; });
    (state.communities || []).forEach((c) => { const n = recapStreakForContext({ type: "community", id: c.id, community: c }); if (n >= 2 && (!best || n > best.length)) best = { length: n, name: c.name || "Community" }; });
    return best;
  }

  // Gather what the user did YESTERDAY from their own data: rules logged (+points), total points,
  // best streak, and best community standing. `lastLogged` seeds the post composer's destinations.
  function buildYesterdaySummary() {
    const yKey = offsetDate(-1);
    const rules = [];        // [{ label, points }]
    const lastLogged = [];   // [{ contextType, contextId, ruleId, amount, isYesNo }]
    let totalPoints = 0;
    let standing = null;     // best (lowest-rank) community placement where I scored
    // Personal systems
    (state.systems || []).forEach((sys) => {
      const e = findEntry(yKey, sys.id);
      if (!e || !e.values) return;
      const normRules = (sys.rules || []).map(scoring.normalizeRule);
      Object.keys(e.values).forEach((ruleId) => {
        const amount = numberOrDefault(e.values[ruleId], 0);
        if (!(amount > 0)) return;
        const rule = normRules.find((r) => r.id === ruleId);
        if (!rule || rule.simpleStyle === "penalty" || rule.dataSource === "calculated") return;
        const pts = scoring.calculateRule(rule, amount).totalPoints;
        rules.push({ label: rule.label || "a habit", points: pts });
        lastLogged.push({ contextType: "personal", contextId: sys.id, ruleId: ruleId, amount: amount, isYesNo: rule.simpleStyle === "yesNo" });
      });
      totalPoints += numberOrDefault(e.total, 0);
    });
    // Communities — points + which rules I logged + my rank that day
    (state.communities || []).forEach((community) => {
      const me = (community.members || []).find((m) => m.id === "me");
      if (!me) return;
      const myPts = communityMemberPointsOnDate(community, me, yKey);
      totalPoints += numberOrDefault(myPts, 0);
      const values = communityValuesForMember(community.id, "me", yKey);
      const normRules = ((community.system && community.system.rules) || []).map(scoring.normalizeRule);
      Object.keys(values || {}).forEach((ruleId) => {
        const amount = numberOrDefault(values[ruleId], 0);
        if (!(amount > 0)) return;
        const rule = normRules.find((r) => r.id === ruleId);
        if (!rule || rule.simpleStyle === "penalty" || rule.dataSource === "calculated") return;
        const pts = scoring.calculateRule(rule, amount).totalPoints;
        rules.push({ label: rule.label || "a habit", points: pts });
        lastLogged.push({ contextType: "community", contextId: community.id, ruleId: ruleId, amount: amount, isYesNo: rule.simpleStyle === "yesNo" });
      });
      if (myPts > 0) {
        // Competition ranking: 1 + members who scored STRICTLY more than me. Ties share a rank
        // (tied-for-1st reads as #1), so the standing never depends on member array order.
        const rank = 1 + (community.members || []).filter((m) => m.id !== "me" && communityMemberPointsOnDate(community, m, yKey) > myPts).length;
        if (!standing || rank < standing.rank) {
          standing = { rank: rank, total: (community.members || []).length, name: community.name || "your community" };
        }
      }
    });
    const streak = recapBestStreak(); // longest streak THROUGH YESTERDAY (>= 2 days), else null
    // Keep the strongest few habits for a tight recap line.
    rules.sort((a, b) => b.points - a.points);
    return {
      active: rules.length > 0 || totalPoints > 0,
      rules: rules.slice(0, 4),
      totalPoints: Math.round(totalPoints * 10) / 10,
      streak: streak,
      standing: standing,
      lastLogged: lastLogged,
    };
  }

  // The trimmed structured summary handed to the AI edge function (no internal ids).
  function recapSummaryForAI(summary) {
    return {
      rules: (summary.rules || []).map((r) => ({ label: r.label, points: Math.round(r.points * 10) / 10 })),
      totalPoints: summary.totalPoints,
      streak: summary.streak,
      standing: summary.standing,
    };
  }

  // Client-composed recap (the always-available fallback). Returns { html, plain } — html bolds the
  // facts for the card (every user-derived value escaped); plain is the unformatted post caption.
  function buildRecapParts(summary) {
    const b = (text) => `<strong>${escapeHtml(text)}</strong>`;
    const labels = (summary.rules || []).map((r) => r.label).filter(Boolean);
    const labelList = labels.slice(0, 2);
    const pts = summary.totalPoints || 0;
    const opener = pts >= 6 ? "Strong day" : pts >= 2 ? "Nice day" : "You showed up";
    let html = `${escapeHtml(opener)} — `;
    let plain = `${opener} — `;
    if (labelList.length) {
      const htmlList = labelList.map((l) => b(String(l).toLowerCase())).join(" and ");
      const plainList = labelList.map((l) => String(l).toLowerCase()).join(" and ");
      html += `you logged ${htmlList}`;
      plain += `you logged ${plainList}`;
      if (labels.length > labelList.length) { html += " and more"; plain += " and more"; }
    } else {
      html += "you kept things moving";
      plain += "you kept things moving";
    }
    if (pts > 0) {
      html += ` for ${b("+" + formatPoints(pts) + " pts")}`;
      plain += ` for +${formatPoints(pts)} pts`;
    }
    html += ".";
    plain += ".";
    const tail = [];
    const tailPlain = [];
    if (summary.standing && summary.standing.rank >= 1 && summary.standing.rank <= 3) {
      tail.push(`That kept you ${b("#" + summary.standing.rank + " in " + (summary.standing.name || "your community"))}`);
      tailPlain.push(`That kept you #${summary.standing.rank} in ${summary.standing.name || "your community"}`);
    }
    if (summary.streak && summary.streak.length >= 2) {
      const streakTxt = `🔥 ${summary.streak.length}-day streak`;
      if (tail.length) { tail[0] += ` and on a ${b(streakTxt)}`; tailPlain[0] += ` and on a ${streakTxt}`; }
      else { tail.push(`You're on a ${b(streakTxt)}`); tailPlain.push(`You're on a ${streakTxt}`); }
    }
    if (tail.length) { html += " " + tail.join(" ") + "."; plain += " " + tailPlain.join(" ") + "."; }
    return { html: html, plain: plain.slice(0, ENTRY_MESSAGE_MAX) };
  }

  // Decide whether to show the daily recap, build it (AI with fallback), and surface the card.
  // Called once data is loaded on a sign-in; the once-per-day guard makes it safe to call again.
  async function maybeShowDailyRecap() {
    if (recapHandledThisLoad) return;               // dedupe both hooks + token-refresh re-fires this load
    if (onboardingActive) return;                   // don't interrupt first-run onboarding
    const today = getTodayKey();
    if (state.lastRecapDay === today) return;       // already shown today (no re-pop on refresh)
    if (coachLearning().proactiveOff) return;       // user turned proactive surfacing off → stay quiet
    const summary = buildYesterdaySummary();
    // Brand-new / empty account → nothing to recap and nowhere to anchor; skip without nagging.
    if (!summary.active && !(state.systems || []).length && !(state.communities || []).length) return;
    // Claim this page load NOW so a concurrent/token-refresh call can't also show a card; lastRecapDay
    // is set AFTER the card is built (below) so a reload mid-AI-call re-attempts rather than silently skips.
    recapHandledThisLoad = true;
    const markShown = () => { state.lastRecapDay = today; saveState(); };
    if (!summary.active) {
      // Off-day with tracking set up → gentle "fresh start", but back off if they keep waving it away.
      if (coachShouldPeekType("recap")) { markShown(); coachShowRecapCard({ fresh: true }); }
      else { markShown(); }
      return;
    }
    let aiText = "";
    if (signalsReady() && window.PointwellSignals && typeof window.PointwellSignals.generateRecap === "function") {
      try {
        const r = await window.PointwellSignals.generateRecap(recapSummaryForAI(summary));
        if (r && !r.error && typeof r.recap === "string") aiText = r.recap.trim();
      } catch (e) { /* fall back to the client-composed recap */ }
    }
    markShown();
    coachShowRecapCard({ summary: summary, aiText: aiText });
  }

  function coachShowRecapCard(opts) {
    opts = opts || {};
    let bodyHtml, plain, lastLogged;
    if (opts.fresh) {
      bodyHtml = "New day, fresh start — log your first win today and I'll recap it for you tomorrow.";
      plain = "";
      lastLogged = [];
    } else if (opts.aiText) {
      bodyHtml = escapeHtml(opts.aiText); // AI output is untrusted text → escape before innerHTML
      plain = opts.aiText.slice(0, ENTRY_MESSAGE_MAX);
      lastLogged = (opts.summary && opts.summary.lastLogged) || [];
    } else {
      const parts = buildRecapParts(opts.summary || {});
      bodyHtml = parts.html;
      plain = parts.plain;
      lastLogged = (opts.summary && opts.summary.lastLogged) || [];
    }
    coachRecap = { plain: plain, lastLogged: lastLogged };
    coachLearnRecord("recap", "shown");
    // Fresh-start "Got it" counts as a dismissal (feeds coachShouldPeekType suppression so an
    // inactive user isn't nagged daily); on a REAL recap, both buttons are positive engagement.
    const actions = opts.fresh
      ? `<button type="button" class="ghost-button small" data-coach-recapdismiss>Got it</button>`
      : `<button type="button" class="ghost-button small" data-coach-recapkeep>Keep for me</button>
         <button type="button" class="primary-button small" data-coach-recappost>Post recap</button>`;
    coachSay(`
      <div class="coach-card coach-recap-card coach-nudge-card is-active" data-coach-recap-card>
        <div class="coach-recap-eyebrow"><span aria-hidden="true">✨</span> Yesterday, recapped</div>
        <p class="coach-recap-text">${bodyHtml}</p>
        <div class="coach-card-actions">${actions}</div>
      </div>`);
    if (!coach.panelOpen) coach.recapPending = true; // badge the launcher so it surfaces on login
    renderCoachLauncher();
    coachScroll();
  }

  function coachRecapKeep(cardEl) {
    coachLearnRecord("recap", "acted"); // "Keep for me" is the expected positive choice, not a rejection
    coach.recapPending = false;
    renderCoachLauncher();
    coachFinalizeCard(cardEl);
  }
  function coachRecapDismiss(cardEl) { // fresh-start "Got it" → record as dismissed for suppression
    coachLearnRecord("recap", "dismissed");
    coach.recapPending = false;
    renderCoachLauncher();
    coachFinalizeCard(cardEl);
  }

  // "Post recap" → reuse the Coach post composer, prefilled with the recap text, user picks where.
  function coachRecapPost(cardEl) {
    coachLearnRecord("recap", "acted");
    coach.recapPending = false;
    coachFinalizeCard(cardEl);
    if (coachRecap) {
      // Seed lastLogged with yesterday's activity so the personal feed + matching communities
      // resolve as destinations (and post as "already logged" → carries the caption, no re-count).
      coach.lastLogged = (coachRecap.lastLogged || []).slice();
      coachPendingCaption = coachRecap.plain || "";
    }
    if (!coachPostDestinations().length) {
      coachPendingCaption = ""; // no composer will open → don't leave the prefill dangling
      coachSayText("Nowhere to post this yet — add a system or join a community in Build, then try again.");
      renderCoachLauncher();
      return;
    }
    coachOpenPostPicker();
    renderCoachLauncher();
  }

  // ── Floating launcher (bottom-left) + pop-out panel ─────────────────────────
  function openCoachPanel() {
    if (!els.coachPanel) return;
    coach.panelOpen = true;
    coach.recapPending = false; // opening the panel surfaces the recap card → clear its badge
    els.coachPanel.hidden = false;
    els.coachPanel.classList.add("is-open");
    if (els.coachLauncher) els.coachLauncher.setAttribute("aria-expanded", "true");
    coachHidePeek();
    coachProfileFresh();   // refresh the behavioral profile (streaks/trends/usual times) for tailored answers
    renderCoachProactiveToggle();
    const greetedBefore = coach.greeted;
    coachGreet();
    coachRenderNudges();   // drop any pending proactive nudges into the thread
    if (greetedBefore) coachMaybeSoftPrompt(); // idle re-open with nothing to surface → soft invite
    renderCoachLauncher(); // clears the badge now that you're looking
    coachScroll();
    requestAnimationFrame(() => { if (els.coachInput) els.coachInput.focus(); });
  }

  function closeCoachPanel() {
    coach.panelOpen = false;
    if (els.coachPanel) { els.coachPanel.classList.remove("is-open"); els.coachPanel.hidden = true; }
    if (els.coachLauncher) els.coachLauncher.setAttribute("aria-expanded", "false");
    renderCoachLauncher();
  }

  function toggleCoachPanel() { if (coach.panelOpen) closeCoachPanel(); else openCoachPanel(); }

  // Badge on the launcher = count of active proactive nudges (only while the panel is closed).
  function renderCoachLauncher() {
    if (!els.coachLauncherBadge) return;
    const n = coachActiveNudgeCount();
    const show = !coach.panelOpen && n > 0 && !coachLearning().proactiveOff; // opt-out hides proactive surfacing
    els.coachLauncherBadge.hidden = !show;
    els.coachLauncherBadge.textContent = n > 9 ? "9+" : String(n);
    if (els.coachLauncher) els.coachLauncher.classList.toggle("has-nudges", show);
  }

  function coachActiveNudgeCount() {
    const recap = coach.recapPending ? 1 : 0;
    const c = state.catchUp;
    if (!c) return recap;
    return recap + (c.devices || []).length + ((c.manual || []).length ? 1 : 0);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PART B — SMART + LEARNING COACH (all numbers computed in CODE).
  // (1) A per-user BEHAVIORAL PROFILE (streaks, usual log times, weekly trends, motivation
  //     style) computed from local history and persisted; used to tailor nudges + answers.
  // (2) A FEEDBACK LOOP: each proactive nudge's outcome (shown/acted/dismissed) is recorded
  //     by TYPE + time-of-day, decayed weekly; types the user keeps dismissing are suppressed,
  //     with a daily frequency cap. Interpretable thresholds, not a black box.
  // (3) An easy OFF switch (state.coachLearning.proactiveOff). Always dismissable; never nags.
  // ════════════════════════════════════════════════════════════════════════════
  function coachLearning() {
    const L = state.coachLearning = state.coachLearning || { proactiveOff: false, weekKey: "", byType: {}, byHour: {}, byRule: {}, shownDay: "", shownCount: 0 };
    L.byType = L.byType || {}; L.byHour = L.byHour || {}; L.byRule = L.byRule || {}; // defensive for older saves
    return L;
  }
  function coachHourBucket(h) { return h < 6 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"; }
  function coachNowHour() { try { return new Date().getHours(); } catch (e) { return 12; } }
  function coachWeekKey() { const wk = currentWeekDateKeys(); return (wk && wk.length) ? wk[0] : getTodayKey(); }
  function coachDecayCounters(map) {
    Object.keys(map || {}).forEach((k) => {
      const c = map[k];
      c.shown = Math.round((c.shown || 0) * 0.5); c.acted = Math.round((c.acted || 0) * 0.5); c.dismissed = Math.round((c.dismissed || 0) * 0.5);
      if ((c.shown || 0) < 1 && (c.acted || 0) < 1 && (c.dismissed || 0) < 1) delete map[k];
    });
  }
  // Record a proactive-nudge outcome, tagged by type + time-of-day. Weekly decay keeps it recent.
  function coachLearnRecord(type, outcome) {
    if (!type || ["shown", "acted", "dismissed"].indexOf(outcome) === -1) return;
    const L = coachLearning();
    const wk = coachWeekKey();
    if (L.weekKey !== wk) { L.weekKey = wk; coachDecayCounters(L.byType); coachDecayCounters(L.byHour); coachDecayCounters(L.byRule); }
    const bucket = coachHourBucket(coachNowHour());
    const bump = (map, key) => { const c = map[key] = map[key] || { shown: 0, acted: 0, dismissed: 0 }; c[outcome] = (c[outcome] || 0) + 1; };
    bump(L.byType, type);
    bump(L.byHour, type + "@" + bucket);
    saveState();
  }
  // Suppress a nudge TYPE the user repeatedly dismisses (overall, or at this time of day).
  function coachShouldPeekType(type) {
    const L = coachLearning();
    const t = L.byType[type];
    if (t && t.shown >= 4 && t.dismissed / Math.max(t.shown, 1) >= 0.6) return false;
    const h = L.byHour[type + "@" + coachHourBucket(coachNowHour())];
    if (h && h.shown >= 3 && h.dismissed / Math.max(h.shown, 1) >= 0.7) return false;
    return true;
  }
  // Per-RULE feedback: stop proactively nudging a SPECIFIC habit the user keeps dismissing or
  // never acts on (distinct from the by-TYPE suppression above). Recorded when a "behind" nudge
  // is shown / acted / dismissed; decayed weekly like the others.
  function coachLearnRule(ruleKey, outcome) {
    if (!ruleKey || ["shown", "acted", "dismissed"].indexOf(outcome) === -1) return;
    const L = coachLearning();
    const c = L.byRule[ruleKey] = L.byRule[ruleKey] || { shown: 0, acted: 0, dismissed: 0 };
    c[outcome] = (c[outcome] || 0) + 1;
    saveState();
  }
  function coachRuleSuppressed(contextId, ruleId) {
    const c = coachLearning().byRule[contextId + ":" + ruleId];
    if (!c) return false;
    if ((c.dismissed || 0) >= 3 && (c.acted || 0) === 0) return true;                       // dismissed repeatedly, never acted
    if ((c.shown || 0) >= 4 && (c.dismissed || 0) / Math.max(c.shown, 1) >= 0.6) return true; // high dismiss rate
    return false;
  }
  // Proactive peeks allowed now? (off switch + at most 3 auto-peeks/day.)
  function coachProactiveAllowed() {
    const L = coachLearning();
    if (L.proactiveOff) return false;
    const today = getTodayKey();
    if (L.shownDay !== today) { L.shownDay = today; L.shownCount = 0; saveState(); } // persist the daily reset even if no peek follows
    return L.shownCount < 3;
  }
  function coachNotePeekShown() {
    const L = coachLearning();
    const today = getTodayKey();
    if (L.shownDay !== today) { L.shownDay = today; L.shownCount = 0; }
    L.shownCount += 1;
    saveState();
  }
  function coachToggleProactive() {
    const L = coachLearning();
    L.proactiveOff = !L.proactiveOff;
    saveState();
    if (L.proactiveOff) coachHidePeek();
    renderCoachLauncher();
    renderCoachProactiveToggle();
    coachSayText(L.proactiveOff ? "Proactive nudges are off — I'll stay quiet until you ask. Turn them back on anytime." : "Proactive nudges are on — I'll surface timely catch-ups.");
  }
  function renderCoachProactiveToggle() {
    if (!els.coachProactiveToggle) return;
    const off = coachLearning().proactiveOff;
    els.coachProactiveToggle.classList.toggle("is-off", off);
    els.coachProactiveToggle.setAttribute("aria-pressed", off ? "false" : "true");
    els.coachProactiveToggle.title = off ? "Proactive nudges off — tap to turn on" : "Proactive nudges on — tap to turn off";
  }

  // ── Behavioral profile (streaks, usual log times, weekly trends, motivation) ─
  function coachHourOf(iso) { try { const h = new Date(iso).getHours(); return Number.isFinite(h) ? h : null; } catch (e) { return null; } }
  function coachUsualHourForRule(ruleId) {
    const hours = [];
    (state.quickEntries || []).forEach((e) => { if (e.ruleId === ruleId) { const h = coachHourOf(e.createdAt || e.timestamp || e.date); if (h != null) hours.push(h); } });
    (state.communityEntries || []).forEach((e) => { if (e.ruleId === ruleId && e.userId === "me") { const h = coachHourOf(e.timestamp || e.createdAt || e.date); if (h != null) hours.push(h); } });
    if (!hours.length) return null;
    const counts = {}; let best = hours[0], bestN = 0;
    hours.forEach((h) => { counts[h] = (counts[h] || 0) + 1; if (counts[h] > bestN) { bestN = counts[h]; best = h; } });
    return best;
  }
  // The per-day "hit" primitive shared by every streak computation: the daily target + a getPts(date)
  // that reads the same points coachContextStreak uses. Extracted so the streak CARD (week dots,
  // best-run, at-risk) reuses the EXACT same hit logic instead of re-deriving streaks from scratch.
  function streakContextProbe(ctx) {
    if (ctx.type === "community") {
      const target = communityTarget(ctx.community);
      const me = (ctx.community.members || []).find((m) => m.id === "me");
      return { target: target, getPts: (d) => me ? communityMemberPointsOnDate(ctx.community, me, d) : 0 };
    }
    const sys = normalizeSystem(ctx.system);
    const target = numberOrDefault(calculateTargetSummary(sys).total, 0);
    return { target: target, getPts: (d) => { const e = findEntry(d, ctx.id); return e ? numberOrDefault(e.total, 0) : 0; } };
  }

  function coachContextStreak(ctx) {
    const probe = streakContextProbe(ctx);
    if (!(probe.target > 0)) return 0;
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const hit = probe.getPts(offsetDate(-i)) >= probe.target;
      if (i === 0 && !hit) continue; // today may be unfinished — don't count it against the streak
      if (hit) streak += 1; else break;
    }
    return streak;
  }
  // ── Streak system: surface + celebrate the streak data that already exists ──────────
  const STREAK_MILESTONES = [7, 30, 100];
  let streakCelebrateKey = ""; // one-shot: the ctx whose card should play the milestone pop once

  // The streak context the Today card + at-risk nudge act on: the user's ACTIVE score context
  // (personal system or community), shaped for the existing streak fns. Null when nothing trackable.
  function streakActiveContext() {
    const c = getActiveScoreContext();
    if (c && c.type === "community" && c.community) return { type: "community", id: c.community.id, community: c.community };
    if (c && c.system) return { type: "personal", id: c.system.id, system: c.system };
    return null;
  }

  function weekdayInitial(dateKey) {
    const p = String(dateKey).split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()] || "";
  }

  // Last 7 days as dots, using the SAME hit logic as coachContextStreak (probe.getPts >= target).
  function streakWeekDots(ctx, probe) {
    probe = probe || streakContextProbe(ctx);
    const today = getTodayKey();
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const date = offsetDate(-i);
      out.push({ label: weekdayInitial(date), hit: probe.getPts(date) >= probe.target, isToday: date === today });
    }
    return out;
  }

  // Next badge + progress toward it (matches the reference: % of the way to the next milestone).
  function streakMilestoneInfo(streak) {
    const next = STREAK_MILESTONES.find((m) => m > streak) || 0;
    if (!next) return { next: 0, daysTo: 0, pct: 100 };
    return { next: next, daysTo: next - streak, pct: Math.max(0, Math.min(100, Math.round((streak / next) * 100))) };
  }

  // Celebrate each badge ONCE per context. Re-arms if the streak breaks below a celebrated badge.
  function maybeCelebrateMilestone(ctx, streak) {
    const key = ctx.type + ":" + ctx.id;
    state.streakMilestones = state.streakMilestones || {};
    const celebrated = numberOrDefault(state.streakMilestones[key], 0);
    let reached = 0;
    STREAK_MILESTONES.forEach((m) => { if (streak >= m) reached = m; });
    if (reached > celebrated) {
      state.streakMilestones[key] = reached;
      saveState();
      streakCelebrateKey = key;
      showToast("🔥 " + streak + "-day streak — " + reached + "-day badge earned!");
    } else if (reached < celebrated) {
      state.streakMilestones[key] = reached; // streak dropped → allow the badge to celebrate again later
      saveState();
    }
  }

  // The prominent Today streak card (amber flame + count + 7-day dots + milestone progress). Reuses
  // coachContextStreak for the count and the shared probe for the dots/best-run — no new streak math.
  function renderStreakCard() {
    if (!els.streakCard) return;
    const ctx = streakActiveContext();
    const probe = ctx ? streakContextProbe(ctx) : null;
    if (!ctx || !probe || !(probe.target > 0)) { els.streakCard.hidden = true; els.streakCard.innerHTML = ""; return; }
    els.streakCard.hidden = false;
    const streak = coachContextStreak(ctx);
    maybeCelebrateMilestone(ctx, streak);
    const key = ctx.type + ":" + ctx.id;
    const celebrating = streakCelebrateKey === key; if (celebrating) streakCelebrateKey = "";
    // Slim inline dot strip (no day labels): hit = filled, miss = faint, today = outlined (or filled if hit).
    const dots = streakWeekDots(ctx, probe).map((d) => {
      const cls = d.isToday ? (d.hit ? "hit" : "today") : (d.hit ? "hit" : "miss");
      return `<span class="streak-idot ${cls}"></span>`;
    }).join("");
    const ms = streakMilestoneInfo(streak);
    // Tiny subline: encouragement + the milestone as a small note (the full progress bar is dropped).
    let sub;
    if (streak <= 0) sub = "Log today to start";
    else if (ms.next) sub = "Keep it going · " + ms.daysTo + "d to 🏅 " + ms.next;
    else sub = "🏅 100-day legend";
    els.streakCard.innerHTML = `
      <div class="streak-bar${streak <= 0 ? " is-zero" : ""}${celebrating ? " is-celebrating" : ""}">
        <span class="streak-flame" aria-hidden="true">🔥</span>
        <div class="streak-headline">
          <strong class="streak-count">${escapeHtml(String(streak))}-day streak</strong>
          <p class="streak-sub">${escapeHtml(sub)}</p>
        </div>
        <div class="streak-week-inline" aria-hidden="true">${dots}</div>
      </div>`;
  }

  // ── Streak at-risk nudge: the return driver. When a streak is ALIVE but today isn't logged yet,
  // surface "your N-day streak ends tonight" + a Log-now CTA — once/day, only later in the day. ──
  function maybeShowStreakAtRisk() {
    if (onboardingActive) return;
    if (coachLearning().proactiveOff) return;          // respect the global off switch
    const today = getTodayKey();
    if (state.streakRiskDay === today) return;          // once/day (no nag, no re-pop)
    if (coachNowHour() < 16) return;                    // "later in the day" — never in the morning
    const ctx = streakActiveContext();
    if (!ctx) return;
    const probe = streakContextProbe(ctx);
    if (!(probe.target > 0)) return;
    const streak = coachContextStreak(ctx);             // reuse existing streak math
    const todayHit = probe.getPts(today) >= probe.target;
    if (!(streak > 0) || todayHit) return;              // not at risk (no streak, or already kept alive)
    state.streakRiskDay = today;
    saveState();
    coachShowStreakRiskCard(streak);
  }

  function coachShowStreakRiskCard(streak) {
    coachLearnRecord("streakrisk", "shown");
    coachSay(`
      <div class="coach-card coach-streakrisk-card coach-nudge-card is-active" data-coach-streakrisk-card>
        <div class="coach-streakrisk-row">
          <span class="coach-streakrisk-flame" aria-hidden="true">🔥</span>
          <div class="coach-streakrisk-main">
            <strong>Your ${escapeHtml(String(streak))}-day streak ends tonight</strong>
            <p>Log anything today to keep it alive.</p>
          </div>
        </div>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-streakdismiss>Not now</button>
          <button type="button" class="primary-button small" data-coach-streaklog>Log now</button>
        </div>
      </div>`);
    if (!coach.panelOpen) coach.recapPending = true;     // badge the launcher so it surfaces in Today
    renderCoachLauncher();
    coachScroll();
  }

  function coachStreakLog(cardEl) {
    coachLearnRecord("streakrisk", "acted");
    coach.recapPending = false;
    coachFinalizeCard(cardEl);
    if (coach.panelOpen) closeCoachPanel();
    openAddEntryPage(); // the existing quick-log path
  }
  function coachStreakDismiss(cardEl) {
    coachLearnRecord("streakrisk", "dismissed");
    coach.recapPending = false;
    renderCoachLauncher();
    coachFinalizeCard(cardEl);
  }

  function coachMetricTrend(ruleId, systemId) {
    const avg = (start) => {
      let sum = 0, n = 0;
      for (let i = 0; i < 7; i++) { const e = findEntry(offsetDate(start - i), systemId); if (e && e.values && e.values[ruleId] != null) { sum += numberOrDefault(e.values[ruleId], 0); n += 1; } }
      return n ? sum / n : null;
    };
    const thisWk = avg(0), lastWk = avg(-7);
    if (thisWk == null || lastWk == null || lastWk === 0) return "flat";
    const change = (thisWk - lastWk) / lastWk;
    return change > 0.08 ? "up" : change < -0.08 ? "down" : "flat";
  }
  function coachMotivationStyle() {
    const L = coachLearning();
    const dev = L.byType.device || {}, behind = L.byType.behind || {};
    const competition = (dev.acted || 0) + ((state.communities || []).length ? 1 : 0);
    const consistency = (behind.acted || 0) + 1; // slight default lean to consistency
    if (competition > consistency + 1) return "competition";
    if (consistency > competition + 1) return "consistency";
    return "unknown";
  }
  function coachBuildProfile() {
    const profile = { builtAt: getTodayKey(), contexts: {}, rules: {}, trends: {}, motivation: coachMotivationStyle() };
    (state.systems || []).forEach((s) => { profile.contexts["personal:" + s.id] = { name: s.title || "System", streak: coachContextStreak({ type: "personal", id: s.id, system: s }) }; });
    (state.communities || []).forEach((c) => { profile.contexts["community:" + c.id] = { name: c.name || "Community", streak: coachContextStreak({ type: "community", id: c.id, community: c }) }; });
    loggableRuleTargets().forEach((t) => {
      profile.rules[t.contextId + ":" + t.ruleId] = { label: t.label, usualHour: coachUsualHourForRule(t.ruleId) };
      if (t.contextType === "personal" && t.sourceMetric) {
        const dir = coachMetricTrend(t.ruleId, t.contextId);
        if (dir !== "flat") profile.trends[t.sourceMetric] = { dir: dir, label: t.label };
      }
    });
    state.coachProfile = profile;
    saveState();
    return profile;
  }
  function coachProfileFresh() {
    if (!state.coachProfile || state.coachProfile.builtAt !== getTodayKey()) return coachBuildProfile();
    return state.coachProfile;
  }
  function coachBestStreak() {
    const prof = coachProfileFresh();
    let best = null;
    Object.keys(prof.contexts || {}).forEach((k) => { const c = prof.contexts[k]; if (c.streak >= 2 && (!best || c.streak > best.streak)) best = c; });
    return best;
  }
  function coachTrendLine() {
    const prof = coachProfileFresh();
    const keys = Object.keys(prof.trends || {});
    if (!keys.length) return "";
    const t = prof.trends[keys[0]];
    return `${t.dir === "up" ? "📈" : "📉"} ${escapeHtml(t.label)} ${t.dir} vs last week`;
  }

  // ── Proactive nudges: device increments + behind-a-habit, surfaced via Coach ─
  // state.catchUp (built by buildCatchUp after a sync / refresh) is the nudge source.
  // We only PEEK when there's genuinely something new (signature changed); otherwise the
  // launcher just carries a badge. Triggers: after a device sync (new numbers only — an
  // unchanged reading yields no increment, so nothing fires) and when a usually-logged
  // habit is still empty. Never just for opening the app.
  function coachIngestNudges() {
    coach.posted = coach.posted || {};
    if (!coach._peekSigSeeded) { coach.lastPeekSig = state.coachLastPeekSig || coach.lastPeekSig; coach._peekSigSeeded = true; }
    if (coach.panelOpen) { coachRenderNudges(); renderCoachLauncher(); return; }
    renderCoachLauncher();
    if (!coachActiveNudgeCount()) { coachHidePeek(); return; }
    if (!coachProactiveAllowed()) return; // off switch OR daily cap reached → badge only, no peek
    const sig = coachNudgeSignature();
    if (sig && sig !== coach.lastPeekSig) {
      coach.lastPeekSig = sig;
      state.coachLastPeekSig = sig; // persist so a reload doesn't re-nag the same set
      saveState();
      coachShowPeek();
    }
  }

  function coachNudgeSignature() {
    const c = state.catchUp;
    if (!c) return "";
    const dev = (c.devices || []).map((d) => `${d.source}:${d.metric}:${d.unknown ? "C" : ""}${formatValue(d.current)}`).join("|");
    const man = (c.manual || []).map((m) => m.ruleId).sort().join(",");
    return dev + "#" + man;
  }

  function coachShowPeek() {
    if (!els.coachPeek) return;
    const c = state.catchUp;
    if (!c) return;
    const best = coachBestStreak();
    const motivation = coachProfileFresh().motivation;
    const lines = [];
    (c.devices || []).forEach((d) => {
      if (lines.length >= 2) return;
      const type = d.connect ? "connect" : d.noRule ? "track" : d.unknown ? "conflict" : "device";
      if (!coachShouldPeekType(type)) return; // user keeps dismissing this type → skip the peek
      if (d.connect) lines.push({ type: type, head: d.sourceLabel, text: `${formatMetricPhrase(d.current, d.unit, d.label.toLowerCase())} today — track with your ${d.ruleLabel} rule?` });
      else if (d.noRule) lines.push({ type: type, head: d.sourceLabel, text: `${formatMetricPhrase(d.current, d.unit, d.label.toLowerCase())} today — start tracking?` });
      else if (d.unknown) lines.push({ type: type, head: d.sourceLabel, text: `${d.label}: you logged ${formatCount(d.conflictMine)}, device shows ${formatCount(d.current)}` });
      else lines.push({ type: type, head: d.sourceLabel, text: `+${formatMetricPhrase(d.increment, d.unit, d.label.toLowerCase())} since last time` });
    });
    if (lines.length < 2 && (c.manual || []).length && coachShouldPeekType("behind")) {
      let text = `${plural(c.manual.length, "thing")} you usually log ${c.manual.length === 1 ? "isn't" : "aren't"} in yet`;
      // Consistency-minded users get a streak framing; competition-minded get the plain prompt.
      if (best && motivation !== "competition") text += ` — keep your ${best.streak}-day streak`;
      lines.push({ type: "behind", head: "Catch up", text: text });
    }
    if (!lines.length) { coachHidePeek(); return; } // every applicable type is suppressed
    els.coachPeek.innerHTML = lines.map((l) => `
      <button type="button" class="coach-peek-bubble" data-coach-peek-open>
        <span class="coach-peek-head">${l.type === "behind" ? "✨" : "⌚"} ${escapeHtml(l.head)}</span>
        <span class="coach-peek-text">${escapeHtml(l.text)}</span>
      </button>`).join("") + `<button type="button" class="coach-peek-x" data-coach-peek-dismiss aria-label="Dismiss">✕</button>`;
    els.coachPeek.hidden = false;
    coach.peekTypes = lines.map((l) => l.type);
    const seen = {};
    lines.forEach((l) => { if (!seen[l.type]) { seen[l.type] = true; coachLearnRecord(l.type, "shown"); } });
    coachNotePeekShown();
    if (coach.peekTimer) clearTimeout(coach.peekTimer);
    coach.peekTimer = setTimeout(() => coachHidePeek(), 9000);
  }

  function coachHidePeek() {
    if (coach.peekTimer) { clearTimeout(coach.peekTimer); coach.peekTimer = null; }
    if (els.coachPeek) { els.coachPeek.hidden = true; els.coachPeek.innerHTML = ""; }
  }
  // The X is an explicit dismiss → teach the loop to back off these types (auto-hide doesn't).
  function coachDismissPeek() {
    (coach.peekTypes || []).forEach((tp) => coachLearnRecord(tp, "dismissed"));
    coach.peekTypes = [];
    coachHidePeek();
  }

  // Post nudge bubbles into the thread (each unique nudge once; acted bubbles stay finalized).
  function coachRenderNudges() {
    coach.posted = coach.posted || {};
    const c = state.catchUp;
    if (!c) return;
    (c.devices || []).forEach((d) => {
      const key = `${d.unknown ? "conf" : "dev"}:${d.source}:${d.metric}:${formatValue(d.current)}`;
      if (coach.posted[key]) return;
      coach.posted[key] = true;
      coachPostDeviceNudge(d);
    });
    if ((c.manual || []).length) {
      const key = `behind:${c.manual.map((m) => m.ruleId).sort().join(",")}`;
      if (!coach.posted[key]) { coach.posted[key] = true; coachPostBehindNudge(c.manual.slice()); }
    }
  }

  function coachDeviceByKey(source, metric) {
    return ((state.catchUp && state.catchUp.devices) || []).find((d) => d.source === source && d.metric === metric) || null;
  }

  function coachPostDeviceNudge(d) {
    const tok = escapeHtml(d.source + "|" + d.metric);
    if (d.connect) {
      coachSay(`
        <div class="coach-card coach-nudge-card is-active">
          <div class="coach-nudge-head"><span class="via-source-tag">${escapeHtml(d.sourceLabel)}</span> Connect a feed</div>
          <p class="coach-card-title">${escapeHtml(d.sourceLabel)} shows ${escapeHtml(formatMetricPhrase(d.current, d.unit, d.label.toLowerCase()))} today — track it with your ${escapeHtml(d.ruleLabel)} rule?</p>
          <div class="coach-card-actions">
            <button type="button" class="ghost-button small" data-coach-connectdismiss="${tok}">Not now</button>
            <button type="button" class="primary-button small" data-coach-connect="${tok}">Connect</button>
          </div>
        </div>`);
      return;
    }
    if (d.noRule) {
      coachSay(`
        <div class="coach-card coach-nudge-card is-active">
          <div class="coach-nudge-head"><span class="via-source-tag">${escapeHtml(d.sourceLabel)}</span> Not tracked yet</div>
          <p class="coach-card-title">${escapeHtml(d.sourceLabel)} shows ${escapeHtml(formatMetricPhrase(d.current, d.unit, d.label.toLowerCase()))} today. Want to start tracking it?</p>
          <div class="coach-card-actions">
            <button type="button" class="ghost-button small" data-coach-trackdismiss="${tok}">Not now</button>
            <button type="button" class="primary-button small" data-coach-track="${tok}">Track it</button>
          </div>
        </div>`);
      return;
    }
    if (d.unknown) {
      coachSay(`
        <div class="coach-card coach-nudge-card is-active">
          <div class="coach-nudge-head"><span class="via-source-tag">${escapeHtml(d.sourceLabel)}</span> ${escapeHtml(d.label)}</div>
          <p class="coach-card-title">You logged ${escapeHtml(formatCount(d.conflictMine))}, but ${escapeHtml(d.sourceLabel)} shows ${escapeHtml(formatMetricPhrase(d.current, d.unit, ""))}.</p>
          <div class="coach-card-actions">
            <button type="button" class="ghost-button small" data-coach-confkeep="${tok}">Keep mine</button>
            <button type="button" class="primary-button small" data-coach-confupdate="${tok}">Update → ${escapeHtml(formatCount(d.current))}</button>
          </div>
        </div>`);
      return;
    }
    const pts = `${d.points >= 0 ? "+" : ""}${formatPoints(d.points)}`;
    coachSay(`
      <div class="coach-card coach-nudge-card is-active">
        <div class="coach-nudge-head"><span class="via-source-tag">${escapeHtml(d.sourceLabel)}</span> From your device</div>
        <p class="coach-card-title">+${escapeHtml(formatMetricPhrase(d.increment, d.unit, d.label.toLowerCase()))} since last time — now ${escapeHtml(formatCount(d.current))}.</p>
        <div class="coach-nudge-sub">Worth ${escapeHtml(pts)} pts</div>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-devdismiss="${tok}">Dismiss</button>
          <button type="button" class="secondary-button small" data-coach-devpost="${tok}">Log &amp; post 📷</button>
          <button type="button" class="primary-button small" data-coach-devlog="${tok}">Log it</button>
        </div>
      </div>`);
  }

  function coachPostBehindNudge(manual) {
    manual.forEach((m) => coachLearnRule(m.contextId + ":" + m.ruleId, "shown"));
    const names = manual.slice(0, 3).map((m) => escapeHtml(m.label)).join(", ") + (manual.length > 3 ? `, +${manual.length - 3} more` : "");
    coachSay(`
      <div class="coach-card coach-nudge-card is-active">
        <div class="coach-nudge-head">✨ Catch up</div>
        <p class="coach-card-title">You usually log ${names} by now. Want to knock ${manual.length === 1 ? "it" : "them"} out?</p>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-behinddismiss>Not now</button>
          <button type="button" class="primary-button small" data-coach-behind>Catch me up</button>
        </div>
      </div>`);
  }

  function coachFinalizeCard(cardEl) {
    if (!cardEl) return;
    cardEl.classList.remove("is-active");
    cardEl.classList.add("is-done");
    Array.from(cardEl.querySelectorAll("button, input, select, textarea")).forEach((el) => { el.disabled = true; });
  }

  function coachRemoveDeviceNudge(source, metric) {
    if (!state.catchUp) return;
    state.catchUp.devices = (state.catchUp.devices || []).filter((d) => !(d.source === source && d.metric === metric));
    if (!coachActiveNudgeCount()) state.catchUp = null;
  }

  // "Log it" on a device nudge → apply its increment to every rule it maps to (reuses the
  // catch-up fan-out + incremental model), then offer to post.
  function coachDeviceLog(source, metric, cardEl, opts = {}) {
    coachLearnRecord("device", "acted");
    const d = coachDeviceByKey(source, metric);
    if (!d) { coachFinalizeCard(cardEl); return; }
    const touched = new Set();
    const logged = [];
    (d.targets || []).forEach((target) => {
      if (applyDeviceRowToTarget(target, d.source, touched)) {
        logged.push({ contextType: target.contextType, contextId: target.contextId, ruleId: target.ruleId, amount: d.increment, isYesNo: false });
      }
    });
    (state.systems || []).forEach((system) => { if (touched.has(system.id)) { syncDraftInputsFromEntries(system); autoSaveToday(system); } });
    coach.lastLogged = logged;
    const inc = d.increment, unit = d.unit, label = d.label;
    coachRemoveDeviceNudge(source, metric);
    saveState();
    render();
    coachFinalizeCard(cardEl);
    coachSay(`<p>✅ Logged +${escapeHtml(formatMetricPhrase(inc, unit, label.toLowerCase()))}.</p>`);
    if (opts.post) coachOpenPostComposer(); else coachOfferPost();
  }

  function coachDeviceDismiss(source, metric, cardEl) {
    coachLearnRecord("device", "dismissed");
    const d = coachDeviceByKey(source, metric);
    if (d) (d.targets || []).forEach((target) => { const r = resolveQuickLogRule(target.contextType, target.contextId, target.ruleId); if (r) rebaselineRuleSync(r.rule); });
    coachRemoveDeviceNudge(source, metric);
    saveState();
    coachFinalizeCard(cardEl);
    renderCoachLauncher();
  }

  // "Track it" on a not-yet-tracked synced metric → create a SYNCED rule in the user's primary
  // system (sane defaults, fully editable in Build), log today's reading as its first increment,
  // and mark the value seen so it never re-nags. Reuses the same incremental-sync + autosave path
  // as a normal device nudge; future syncs then auto-map to the new rule.
  function coachTrackMetric(source, metric, cardEl) {
    coachLearnRecord("track", "acted");
    const d = coachDeviceByKey(source, metric);
    const system = primaryPersonalSystem();
    if (!d || !system) { coachSayText("Add a system in Build first and I'll track that for you."); coachFinalizeCard(cardEl); return; }
    const cfg = trackingConfigForMetric(metric, d);
    const newRule = scoring.createRule({
      id: makeId("rule"),
      label: cfg.label, category: cfg.category, unit: cfg.unit,
      simpleStyle: "every", dailyTarget: cfg.target, everyAmount: cfg.every, everyPoints: 1,
      inputMethod: "slider", inputMin: 0, inputMax: cfg.max, inputStep: cfg.step,
      dataSource: source, sourceMetric: metric, allowManualOverride: true,
    });
    system.rules = system.rules || [];
    system.rules.push(newRule);
    markWearableSeen(source, metric, d.current);
    // Apply today's reading as the first synced increment (baseline 0 → logs the whole total).
    const target = { contextType: "personal", contextId: system.id, contextName: system.title || "System", ruleId: newRule.id, label: newRule.label };
    applyDeviceRowToTarget(target, source, new Set());
    syncDraftInputsFromEntries(system);
    autoSaveToday(system);
    coach.lastLogged = [{ contextType: "personal", contextId: system.id, ruleId: newRule.id, amount: d.current, isYesNo: false }];
    const cur = d.current, unit = newRule.unit, label = newRule.label, srcLabel = d.sourceLabel;
    coachRemoveDeviceNudge(source, metric);
    saveState();
    render();
    coachFinalizeCard(cardEl);
    coachSay(`<p>✅ Now tracking <strong>${escapeHtml(label)}</strong> from ${escapeHtml(srcLabel)} — logged ${escapeHtml(formatMetricPhrase(cur, unit, ""))} today. Edit it anytime in Build.</p>`);
    coachOfferPost();
  }

  function coachTrackDismiss(source, metric, cardEl) {
    coachLearnRecord("track", "dismissed");
    const d = coachDeviceByKey(source, metric);
    if (d) markWearableSeen(source, metric, d.current); // remember this value so it never re-nags
    coachRemoveDeviceNudge(source, metric);
    saveState();
    coachFinalizeCard(cardEl);
    renderCoachLauncher();
  }

  // Wire an existing (manual-matched) rule to a device feed on the RAW stored rule so future syncs
  // auto-map (resolveQuickLogRule returns a normalized copy — must mutate the stored object).
  function coachConnectRuleFeed(contextType, contextId, ruleId, source, metric) {
    let rawRule = null;
    if (contextType === "community") {
      const c = (state.communities || []).find((x) => x.id === contextId);
      const sys = c && c.system;
      rawRule = sys && (sys.rules || []).find((x) => x.id === ruleId);
    } else {
      const s = (state.systems || []).find((x) => x.id === contextId);
      rawRule = s && (s.rules || []).find((x) => x.id === ruleId);
    }
    if (!rawRule) return false;
    rawRule.dataSource = source;
    rawRule.sourceMetric = metric;
    // Defensive: scoring.normalizeRule resets a dataSource that isn't in its source allowlist back
    // to "manual" on every read — which would silently re-drop the metric (the very bug this fixes).
    // If that would happen for this source, undo and report failure instead of black-holing it.
    if (scoring.normalizeRule(rawRule).dataSource !== source) {
      rawRule.dataSource = "manual"; delete rawRule.sourceMetric; return false;
    }
    return true;
  }

  // "Connect" on a device nudge that matched an EXISTING manual rule by label → wire that rule to
  // the feed (future syncs auto-map), then reconcile today's reading as the first increment via the
  // SAME incremental path (applyDeviceRowToTarget). If the rule already has a hand-log today, hand
  // off to the Keep/Update conflict flow instead of blindly adding (no double-count). Mirrors
  // coachTrackMetric but reuses the existing rule rather than creating one.
  function coachDeviceConnect(source, metric, cardEl) {
    coachLearnRecord("connect", "acted");
    const d = coachDeviceByKey(source, metric);
    if (!d || !d.ruleId) { coachFinalizeCard(cardEl); return; }
    if (!coachConnectRuleFeed(d.contextType, d.contextId, d.ruleId, source, metric)) {
      coachSayText("I couldn't connect that feed to your rule — set its data source on the rule in Build."); coachFinalizeCard(cardEl); return;
    }
    markWearableSeen(source, metric, d.current);
    const resolved = resolveQuickLogRule(d.contextType, d.contextId, d.ruleId);
    const rule = resolved ? resolved.rule : null;
    const preview = rule ? syncIncrementPreview(rule) : null;
    const target = { contextType: d.contextType, contextId: d.contextId, contextName: d.contextName || "", ruleId: d.ruleId, label: d.ruleLabel };
    if (preview && preview.unknown) {
      // Already a hand-log today → don't double-count. Re-surface as a Keep/Update conflict (reuses
      // coachConflict → resolveCatchUpConflict, which advances the baseline either way).
      coachRemoveDeviceNudge(source, metric);
      state.catchUp = state.catchUp || { at: new Date().toISOString(), devices: [], manual: [] };
      const row = { source, metric, unknown: true, label: d.label, sourceLabel: d.sourceLabel,
        unit: (rule && rule.unit) || d.unit, current: d.current, increment: 0,
        conflictMine: manualSumTodayForRule(rule.id), points: 0,
        targets: [target], primary: d.contextId + "|" + d.ruleId, checked: false };
      state.catchUp.devices.push(row);
      coach.posted = coach.posted || {};
      coach.posted[`conf:${source}:${metric}:${formatValue(d.current)}`] = true; // posted manually below
      saveState();
      coachFinalizeCard(cardEl);
      coachSay(`<p>Connected <strong>${escapeHtml(d.ruleLabel)}</strong> to ${escapeHtml(d.sourceLabel)} — you've already logged some ${escapeHtml(d.label.toLowerCase())} today, so keep yours or use the device total:</p>`);
      coachPostDeviceNudge(row);
      renderCoachLauncher();
      return;
    }
    // Fresh today → reconcile the whole reading now (baseline 0 → logs the device total). Report
    // the LIVE device value (not the buildCatchUp snapshot, which may have drifted since the sync).
    const cur = rule ? numberOrDefault(deviceTotalForRule(rule), d.current) : d.current;
    const touched = new Set();
    applyDeviceRowToTarget(target, source, touched);
    (state.systems || []).forEach((system) => { if (touched.has(system.id)) { syncDraftInputsFromEntries(system); autoSaveToday(system); } });
    if (target.contextType === "community") { const c = (state.communities || []).find((x) => x.id === target.contextId); if (c) saveCommunitySummaryForMember(c, "me"); }
    coach.lastLogged = [{ contextType: d.contextType, contextId: d.contextId, ruleId: d.ruleId, amount: cur, isYesNo: false }];
    const unit = (rule && rule.unit) || d.unit, label = d.ruleLabel, srcLabel = d.sourceLabel, ml = d.label.toLowerCase();
    coachRemoveDeviceNudge(source, metric);
    saveState();
    render();
    coachFinalizeCard(cardEl);
    coachSay(`<p>✅ Connected <strong>${escapeHtml(label)}</strong> to ${escapeHtml(srcLabel)} — logged ${escapeHtml(formatMetricPhrase(cur, unit, ml))} today. Future syncs add only what's new.</p>`);
    coachOfferPost();
  }

  function coachConnectDismiss(source, metric, cardEl) {
    coachLearnRecord("connect", "dismissed");
    const d = coachDeviceByKey(source, metric);
    if (d) markWearableSeen(source, metric, d.current);
    coachRemoveDeviceNudge(source, metric);
    saveState();
    coachFinalizeCard(cardEl);
    renderCoachLauncher();
  }

  // Conflict (unknown baseline) → reuse the catch-up resolver (it advances the baseline).
  function coachConflict(source, metric, choice, cardEl) {
    coachLearnRecord("conflict", "acted");
    const idx = ((state.catchUp && state.catchUp.devices) || []).findIndex((d) => d.source === source && d.metric === metric);
    if (idx === -1) { coachFinalizeCard(cardEl); return; }
    const d = state.catchUp.devices[idx];
    const label = d.label, current = d.current;
    resolveCatchUpConflict(idx, choice); // splices the row, saves, renders
    coachFinalizeCard(cardEl);
    coachSay(`<p>✅ ${choice === "update" ? `Updated ${escapeHtml(label.toLowerCase())} to ${escapeHtml(formatCount(current))}` : "Kept your number"}.</p>`);
    renderCoachLauncher();
  }

  // "Catch me up" → turn the still-to-log habits into an editable confirm draft (reuses the
  // same manual confirm/save flow). Rebuilt LIVE from buildStillToLog so a rule already logged
  // elsewhere since the nudge appeared is never re-drafted (no double-log).
  function coachBehindCatchUp(cardEl, opts) {
    // The proactive NUDGE card drafts the same (suppression-filtered) set it offered; a DIRECT
    // "Log these" answer drafts everything it named (suppression must not silently drop a listed rule).
    const proactive = !opts || opts.proactive !== false;
    coachLearnRecord("behind", "acted");
    const stillBehind = buildStillToLog({ proactive: proactive });
    stillBehind.forEach((m) => coachLearnRule(m.contextId + ":" + m.ruleId, "acted"));
    if (state.catchUp) { state.catchUp.manual = []; if (!coachActiveNudgeCount()) state.catchUp = null; saveState(); }
    coachFinalizeCard(cardEl);
    renderCoachLauncher();
    const entries = stillBehind.map((m) => {
      const resolved = resolveQuickLogRule(m.contextType, m.contextId, m.ruleId);
      if (!resolved) return null;
      const isYesNo = resolved.rule.simpleStyle === "yesNo";
      return { _id: makeId("qlog"), contextType: m.contextType, contextId: m.contextId, ruleId: m.ruleId, isYesNo: isYesNo, amount: isYesNo ? 1 : suggestedEntryAmount(resolved.rule), note: "", confidence: 0.6 };
    }).filter(Boolean);
    if (!entries.length) { coachSayText("You're all caught up — nothing left to log."); return; }
    coach.draft = { entries: entries, clars: [], routeAll: false };
    coach.draftCardEl = null;
    coachSay(`<p>Here's what you usually log — tweak the amounts and confirm:</p>`);
    coachRenderDraftCard();
  }

  function coachBehindDismiss(cardEl) {
    coachLearnRecord("behind", "dismissed");
    ((state.catchUp && state.catchUp.manual) || []).forEach((m) => coachLearnRule(m.contextId + ":" + m.ruleId, "dismissed"));
    if (state.catchUp) { state.catchUp.manual = []; if (!coachActiveNudgeCount()) state.catchUp = null; saveState(); }
    coachFinalizeCard(cardEl);
    renderCoachLauncher();
  }

  function coachSetupMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !els.coachMic) return;
    els.coachMic.hidden = false;
    let recognition = null;
    let recording = false;
    const setRecording = (on) => {
      recording = on;
      els.coachMic.classList.toggle("is-recording", on);
      els.coachMic.setAttribute("aria-pressed", on ? "true" : "false");
    };
    els.coachMic.addEventListener("click", () => {
      if (recording) { if (recognition) { try { recognition.stop(); } catch (e) { /* ignore */ } } setRecording(false); return; }
      try {
        recognition = new SR();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.onresult = (event) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
          if (els.coachInput) els.coachInput.value = transcript.trim();
        };
        recognition.onend = () => setRecording(false);
        recognition.onerror = () => setRecording(false);
        recognition.start();
        setRecording(true);
      } catch (e) { setRecording(false); }
    });
  }

  function bindCoach() {
    if (els.coachLauncher) els.coachLauncher.addEventListener("click", toggleCoachPanel);
    if (els.coachPanelClose) els.coachPanelClose.addEventListener("click", closeCoachPanel);
    if (els.coachProactiveToggle) els.coachProactiveToggle.addEventListener("click", coachToggleProactive);
    if (els.coachPeek) els.coachPeek.addEventListener("click", (event) => {
      if (event.target.closest("[data-coach-peek-dismiss]")) { coachDismissPeek(); return; }
      openCoachPanel();
    });
    if (els.coachForm) els.coachForm.addEventListener("submit", (event) => { event.preventDefault(); coachSendText(); });
    if (els.coachThread) {
      els.coachThread.addEventListener("click", onCoachThreadClick);
      els.coachThread.addEventListener("input", onCoachThreadInput);
      els.coachThread.addEventListener("change", onCoachThreadChange);
    }
    if (els.coachPhotoButton) {
      els.coachPhotoButton.addEventListener("click", () => { coachPickPhoto("meal"); });
    }
    if (els.coachPhotoInput) {
      els.coachPhotoInput.addEventListener("change", () => {
        const file = els.coachPhotoInput.files && els.coachPhotoInput.files[0];
        els.coachPhotoInput.value = "";
        if (file) coachHandlePhoto(file);
      });
    }
    coachSetupMic();
  }

  let coachPhotoMode = "meal"; // what the next chosen photo means: "meal" estimate | "post" attach
  function coachPickPhoto(mode) {
    coachPhotoMode = mode;
    if (els.coachPhotoInput) els.coachPhotoInput.click();
  }

  function coachHandlePhoto(file) {
    if (!/^image\//i.test(file.type || "")) { coachSayText("That's not an image — try a photo."); return; }
    if (file.size > ENTRY_PHOTO_MAX_BYTES) { coachSayText("That photo's a bit big (max 5 MB) — try a smaller one."); return; }
    if (coachPhotoMode === "post" && coach.post) { coachAttachPostPhoto(file); return; }
    coachAnalyzePhoto(file);
  }

  // ── Text in → parse-log → confirm card ──────────────────────────────────────
  function coachSendText() {
    const text = els.coachInput ? els.coachInput.value.trim() : "";
    if (!text || coach.busy) return;
    els.coachInput.value = "";
    coachUserText(text);
    // A reply that just redirects an in-flight draft ("all relevant places" / "just the
    // boys") adjusts routing rather than starting a new parse.
    if (coach.draft && coachApplyRoutingReply(text)) return;
    // Classify intent first (log / question / chat) — questions are answered from local
    // state, not logged. Logs flow to the existing parse → confirm card.
    coachClassifyAndRoute(text);
  }

  function coachTextWantsAll(text) {
    return /\ball\b/.test(text.toLowerCase()) && /\b(relevant|places|systems|everywhere|them)\b/.test(text.toLowerCase())
      || /\beverywhere\b/.test(text.toLowerCase());
  }

  function coachApplyRoutingReply(text) {
    const t = text.toLowerCase().trim();
    if (!/^(just|only|all|everywhere|both|to)\b/.test(t) && !coachTextWantsAll(t)) return false;
    if (coachTextWantsAll(t) || /^all\b/.test(t)) {
      coach.draft.routeAll = true;
      coachSay(`<p>Got it — I'll log to <strong>every place</strong> that tracks ${escapeHtml(coachDraftLabels())}. Confirm below.</p>`);
      coachRenderDraftCard(true);
      return true;
    }
    const m = t.match(/^(?:just|only|to)\s+(.+)$/);
    if (m) {
      const name = m[1].replace(/[.?!]+$/, "").trim();
      const ctx = coachFindContextByName(name);
      if (ctx) {
        coach.draft.routeAll = false;
        coach.draft.entries.forEach((e) => {
          const opt = coachContextOptionFor(e, ctx);
          if (opt) { e.contextType = opt.contextType; e.contextId = opt.contextId; e.ruleId = opt.id; e.isYesNo = opt.type === "yesNo"; if (e.isYesNo && !(e.amount > 0)) e.amount = 1; }
        });
        coachSay(`<p>Okay — just <strong>${escapeHtml(ctx.name)}</strong>. Confirm below.</p>`);
        coachRenderDraftCard(true);
        return true;
      }
      coachSayText(`I couldn't find a place called “${name}”. Pick one below instead.`);
      coachRenderDraftCard(true);
      return true;
    }
    return false;
  }

  function coachDraftLabels() {
    const labels = [];
    (coach.draft.entries || []).forEach((e) => { const l = coachRuleLabel(e.contextType, e.contextId, e.ruleId); if (l && labels.indexOf(l) === -1) labels.push(l); });
    return labels.join(", ") || "these";
  }

  function coachRuleLabel(contextType, contextId, ruleId) {
    const r = resolveQuickLogRule(contextType, contextId, ruleId);
    return r ? r.rule.label : "";
  }

  // Match a spoken place name ("the boys") to a system/community in the catalog.
  function coachFindContextByName(name) {
    const n = name.toLowerCase();
    const seen = {};
    const places = [];
    buildLoggableRuleCatalog().forEach((c) => {
      const key = c.contextType + ":" + c.contextId;
      if (seen[key]) return;
      seen[key] = true;
      places.push({ contextType: c.contextType, contextId: c.contextId, name: c.contextName });
    });
    let hit = places.find((p) => p.name.toLowerCase() === n);
    if (!hit) hit = places.find((p) => { const pn = p.name.toLowerCase(); return pn.indexOf(n) > -1 || n.indexOf(pn) > -1; });
    return hit || null;
  }

  // The catalog option (rule) for a given draft entry's rule LABEL inside a chosen context.
  function coachContextOptionFor(entry, ctx) {
    const label = coachRuleLabel(entry.contextType, entry.contextId, entry.ruleId);
    if (!label) return null;
    return buildLoggableRuleCatalog().find((c) => c.contextId === ctx.contextId && c.contextType === ctx.contextType && c.label === label) || null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // COACH ANSWERS — intent routing + GROUNDED, code-computed answers.
  // The model (coach-chat edge fn) ONLY classifies intent and, for a question, picks which
  // deterministic helper applies. EVERY figure in an answer is computed here from local
  // state — the model never produces a number. Questions render as plain bubbles (no confirm
  // card) with an optional action chip; logging/posting still always confirm. If the edge
  // call fails we degrade to a keyword classifier so lookups + logging keep working.
  // ════════════════════════════════════════════════════════════════════════════
  const METRIC_SOURCE = {
    steps: ["steps"], sleep: ["sleep-hours", "sleep"],
    calories: ["active-calories", "calories", "total-calories"], distance: ["distance"],
  };

  // Names only (no figures) so the router can resolve params like "the boys" / "steps".
  function coachContextPayload() {
    const metrics = [], rules = [], seenMetric = {};
    const scan = (sys) => (sys.rules || []).map(scoring.normalizeRule).forEach((r) => {
      if (r.label) rules.push(r.label);
      if (r.dataSource && r.dataSource !== "manual" && r.dataSource !== "calculated" && r.sourceMetric && !seenMetric[r.sourceMetric]) { seenMetric[r.sourceMetric] = true; metrics.push(r.sourceMetric); }
    });
    (state.systems || []).forEach((s) => scan(normalizeSystem(s)));
    (state.communities || []).forEach((c) => scan(normalizeSystem(c.system || { rules: [] })));
    return {
      communities: (state.communities || []).map((c) => c.name || "Community").slice(0, 30),
      systems: (state.systems || []).map((s) => s.title || "System").slice(0, 30),
      metrics: metrics.slice(0, 20),
      rules: rules.slice(0, 60),
    };
  }

  function coachClassifyAndRoute(text) {
    // Device-data questions are answered deterministically from LOCAL state — the edge router has
    // no view of the live device metrics, so "what's my fitbit data / steps" stays accurate.
    if (coachLooksLikeQuestion(text) && coachLooksLikeDeviceQuery(text)) {
      const gm = coachGuessMetric(text);
      coachAnswer(gm ? { id: "metric_today", metric: gm } : { id: "device_summary" }, text);
      return;
    }
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.coachChat !== "function") {
      coachFallbackRoute(text, false); // signed out / no router → keyword fallback keeps working
      return;
    }
    coach.busy = true;
    const thinking = coachSay(`<p class="coach-thinking">One sec…</p>`);
    Promise.resolve(window.PointwellSignals.coachChat(text, coachContextPayload())).then((res) => {
      coach.busy = false;
      if (res.error) { if (thinking) thinking.remove(); coachFallbackRoute(text, true); return; }
      if (res.intent === "question") { if (thinking) thinking.remove(); coachAnswer(res.query || { id: "overview" }, text); return; }
      if (res.intent === "chat") {
        if (thinking) thinking.remove();
        coachSayText(res.clarify || res.reply || "I'm here — tell me what you did, or ask how today's going.");
        return;
      }
      // intent "log" (default): let coachRunParse render its own "Reading that…" first, THEN
      // drop the "One sec…" bubble so there's no flicker/gap between the two.
      coachRunParse(text);
      if (thinking) thinking.remove();
    }).catch(() => { if (thinking) thinking.remove(); coach.busy = false; coachFallbackRoute(text, true); });
  }

  // Degradation: without the router, a simple keyword classifier still answers data
  // questions from local state and still routes logs to parse-log.
  function coachLooksLikeQuestion(t) {
    const s = t.trim().toLowerCase();
    return /\?\s*$/.test(s) || /^(how|what|whats|what's|when|which|who|why|am i|do i|did i|have i|is |are |where|tell me|show me)/.test(s);
  }
  // Mentions a connected device / wearable by name → answer from live device metrics, not a rule.
  function coachLooksLikeDeviceQuery(t) {
    return /\b(fitbit|whoop|wearable|health connect|apple ?health|google ?health|device data|wearable data|my (device|watch|wearable))\b/.test(String(t || "").toLowerCase());
  }

  function coachKeywordQuery(text) {
    const t = text.toLowerCase();
    if (!coachLooksLikeQuestion(t)) return null;
    if (/\bdid i log|\bhave i (logged|done)|\bhave i hit\b/.test(t)) return { id: "was_logged", rule: text.replace(/.*\b(?:log|logged|done|hit)\b/i, "").replace(/[?]/g, "").trim() };
    if (/\bstep/.test(t)) return { id: "metric_today", metric: "steps" };
    if (/\bsleep/.test(t)) return { id: "metric_today", metric: "sleep" };
    if (/\bcalorie|\bcals?\b/.test(t)) return { id: "metric_today", metric: "calories" };
    if (/\bdistance|\bmiles?\b|\bkm\b/.test(t)) return { id: "metric_today", metric: "distance" };
    if (coachLooksLikeDeviceQuery(t)) return { id: "device_summary" };
    if (/\brank|\blead\b|\bleading\b|first place|\bwinning\b|\bbehind\b|\bahead\b/.test(t)) return { id: "rank" };
    if (/\bleft\b|\bunlogged|\bstill (need|have|to)|\bto do\b|\bremaining\b|haven'?t/.test(t)) return { id: "unlogged" };
    if (/\bweek\b/.test(t)) return { id: "week_summary" };
    if (/\bpoint|\bscore|\bhow am i|\bhow'?s? (it|my|today|things)|\bprogress\b/.test(t)) return { id: "overview" };
    return { id: "overview" };
  }

  function coachFallbackRoute(text, fromError) {
    const q = coachKeywordQuery(text);
    if (q) {
      if (fromError) coachSayText("(Offline — answering from your saved data.)");
      coachAnswer(q, text);
      return;
    }
    if (coachLooksLikeQuestion(text)) {
      coachSayText("I can't reach the AI right now, but I can still tell you about your steps, points, rank, or what's left to log — try one of those.");
      return;
    }
    coachRunParse(text); // looks like a log → existing parse flow (has its own offline guard)
  }

  // ── Answer dispatcher: maps a query id → a deterministic helper. ─────────────
  function coachAnswer(query, text) {
    getTodayKey(); // refresh the day key (and todayIso) before any helper reads today's data
    const id = (query && query.id) || "overview";
    let res;
    try {
      if (id === "metric_today") res = coachAnsMetricToday(query.metric, text);
      else if (id === "device_summary") res = coachAnsDeviceSummary();
      else if (id === "context_score") res = coachAnsContextScore(query.context);
      else if (id === "rule_progress") res = coachAnsRuleProgress(query.rule, query.context);
      else if (id === "rank") res = coachAnsRank(query.context);
      else if (id === "unlogged") res = coachAnsUnlogged();
      else if (id === "was_logged") res = coachAnsWasLogged(query.rule || query.metric);
      else if (id === "week_summary") res = coachAnsWeekSummary(query.context);
      else res = coachAnsOverview();
    } catch (e) { res = { html: "<p>I hit a snag pulling that up — try again in a sec.</p>" }; }
    if (!res || !res.html) res = { html: "<p>I don't have that one — ask about your steps, points, rank, or what's left to log.</p>" };
    coachSay(`<div class="coach-answer">${res.html}${res.chip || ""}</div>`);
  }

  // ── Resolution helpers (state → context/rule objects) ───────────────────────
  function coachResolveContext(name) {
    const raw = String(name || "").trim();
    if (!raw || /^(active|current|this|here)$/i.test(raw)) {
      const ctx = getActiveScoreContext();
      if (ctx.type === "community" && ctx.community) return { type: "community", id: ctx.community.id, name: ctx.community.name || "Community", community: ctx.community };
      if (ctx.system) return { type: "personal", id: ctx.system.id, name: ctx.system.title || "System", system: ctx.system };
      return null;
    }
    const n = raw.toLowerCase();
    const matchName = (s) => { const v = (s || "").toLowerCase(); return v === n || (v && (v.indexOf(n) > -1 || n.indexOf(v) > -1)); };
    const com = (state.communities || []).find((c) => matchName(c.name));
    if (com) return { type: "community", id: com.id, name: com.name || "Community", community: com };
    const sys = (state.systems || []).find((s) => matchName(s.title));
    if (sys) return { type: "personal", id: sys.id, name: sys.title || "System", system: sys };
    return null;
  }

  function coachDefaultContext() {
    const a = coachResolveContext("active");
    if (a) return a;
    const c = (state.communities || [])[0];
    if (c) return { type: "community", id: c.id, name: c.name || "Community", community: c };
    const s = (state.systems || [])[0];
    if (s) return { type: "personal", id: s.id, name: s.title || "System", system: s };
    return null;
  }

  function coachContextPointsToday(ctx) {
    const today = getTodayKey();
    if (ctx.type === "community") {
      const me = (ctx.community.members || []).find((m) => m.id === "me");
      return { points: me ? communityMemberPointsOnDate(ctx.community, me, today) : 0, target: communityTarget(ctx.community) };
    }
    const system = normalizeSystem(ctx.system);
    const summary = calculateDashboardSummary(system, todayValuesForSystem(system));
    return { points: roundScore(summary.total), target: numberOrDefault(summary.target && summary.target.total, 0), summary: summary };
  }

  // Today's value for a rule: the device's raw total if it's a connected wearable rule,
  // otherwise the sum of today's logged entries for it.
  function coachRuleValueToday(rule, contextType, contextId) {
    if (contextType === "community") return numberOrDefault(communityValuesForMember(contextId, "me", getTodayKey())[rule.id], 0);
    const sys = (state.systems || []).find((s) => s.id === contextId);
    return sys ? numberOrDefault(todayValuesForSystem(normalizeSystem(sys))[rule.id], 0) : 0;
  }
  function coachRuleValueOrDevice(rule, contextType, contextId) {
    if (rule.dataSource && rule.dataSource !== "manual" && rule.dataSource !== "calculated" && isSourceConnected(rule.dataSource)) {
      const d = deviceTotalForRule(rule);
      if (d != null) return d;
    }
    return coachRuleValueToday(rule, contextType, contextId);
  }

  function coachFindMetricRule(metric) {
    const keys = METRIC_SOURCE[metric] || [metric];
    let best = null;
    const scan = (sys, contextType, contextId, contextName) => (sys.rules || []).map(scoring.normalizeRule).forEach((r) => {
      if (keys.indexOf(r.sourceMetric) === -1) return;
      const connected = !!(r.dataSource && r.dataSource !== "manual" && r.dataSource !== "calculated" && isSourceConnected(r.dataSource));
      const cand = { rule: r, contextType, contextId, contextName, connected };
      if (connected && (!best || !best.connected)) best = cand;
      else if (!best) best = cand;
    });
    (state.systems || []).forEach((s) => scan(normalizeSystem(s), "personal", s.id, s.title || "System"));
    (state.communities || []).forEach((c) => scan(normalizeSystem(c.system || { rules: [] }), "community", c.id, c.name || "Community"));
    return best;
  }

  function coachFindRuleByLabel(label, contextName) {
    const n = String(label || "").toLowerCase().trim();
    if (!n) return null;
    const ctxFilter = contextName ? coachResolveContext(contextName) : null;
    const out = [];
    const scan = (sys, contextType, contextId, cName) => (sys.rules || []).map(scoring.normalizeRule).forEach((r) => {
      if (!r.label) return;
      const rl = r.label.toLowerCase();
      if (rl === n || rl.indexOf(n) > -1 || n.indexOf(rl) > -1) out.push({ rule: r, contextType, contextId, contextName: cName });
    });
    (state.systems || []).forEach((s) => scan(normalizeSystem(s), "personal", s.id, s.title || "System"));
    (state.communities || []).forEach((c) => scan(normalizeSystem(c.system || { rules: [] }), "community", c.id, c.name || "Community"));
    if (ctxFilter) { const f = out.find((o) => o.contextId === ctxFilter.id); if (f) return f; }
    return out[0] || null;
  }

  function coachGuessMetric(text) {
    const t = String(text || "").toLowerCase();
    if (/\bstep/.test(t)) return "steps";
    if (/\bsleep/.test(t)) return "sleep";
    if (/\bcalorie|\bcals?\b/.test(t)) return "calories";
    if (/\bdistance|\bmiles?\b|\bkm\b/.test(t)) return "distance";
    return "";
  }

  // ── The deterministic answer helpers (ALL figures come from these) ──────────
  // Live device reading for a metric across CONNECTED sources (independent of whether a rule maps
  // to it) → { source, sourceLabel, metric, label, value } or null.
  function coachDeviceMetricValue(metric) {
    const keys = METRIC_SOURCE[metric] || [metric];
    let best = null;
    Object.keys(state.mockSyncData || {}).forEach((source) => {
      if (best || source === "manual" || source === "calculated" || !isSourceConnected(source)) return;
      const data = state.mockSyncData[source] || {};
      keys.forEach((k) => {
        if (best) return;
        const v = Number(data[k]);
        if (Number.isFinite(v) && v > 0) best = { source, sourceLabel: wearableShortLabel(source), metric: k, label: sourceMetricLabel(source, k), value: v };
      });
    });
    return best;
  }
  // Every connected device's live metrics today → [{ source, sourceLabel, metric, label, value }].
  function coachConnectedDeviceMetrics() {
    const out = [];
    Object.keys(state.mockSyncData || {}).forEach((source) => {
      if (source === "manual" || source === "calculated" || !isSourceConnected(source)) return;
      const data = state.mockSyncData[source] || {};
      Object.keys(data).forEach((metric) => {
        const v = Number(data[metric]);
        if (Number.isFinite(v) && v > 0) out.push({ source, sourceLabel: wearableShortLabel(source), metric, label: sourceMetricLabel(source, metric), value: v });
      });
    });
    return out;
  }

  function coachAnsMetricToday(metric, text) {
    const m = String(metric || "").toLowerCase() || coachGuessMetric(text);
    if (!m) return { html: `<p>Which one? I can check your steps, sleep, calories, or distance.</p>` };
    // The LIVE device number wins over a rule's hand-logged total (the old answer read the rule and
    // reported 0 for a Fitbit metric matched only to a manual rule). Find a matching rule for the
    // goal + connect nudge: by feed first, else by label (a manual "Steps" rule).
    const device = coachDeviceMetricValue(m);
    let found = coachFindMetricRule(m);
    if (!found) { const byLabel = coachFindRuleByLabel(m); if (byLabel) found = { rule: byLabel.rule, contextType: byLabel.contextType, contextId: byLabel.contextId, contextName: byLabel.contextName, connected: false }; }
    if (device) {
      const label = device.label || m;
      let line = `Your ${escapeHtml(device.sourceLabel)} shows <strong>${escapeHtml(formatCount(device.value))} ${escapeHtml(String(label).toLowerCase())}</strong> today`;
      const goal = found ? goalAmountForRule(found.rule) : 0;
      if (goal > 0) {
        const toGo = Math.max(goal - device.value, 0);
        line += toGo > 0 ? ` — ${escapeHtml(formatCount(toGo))} to go to hit ${escapeHtml(formatCount(goal))}` : ` — past your ${escapeHtml(formatCount(goal))} goal! 🎉`;
      }
      line += ".";
      if (found && !found.connected) line += ` Your <strong>${escapeHtml(found.rule.label)}</strong> rule isn't wired to ${escapeHtml(device.sourceLabel)} yet — I'll offer to connect it the next time it syncs.`;
      return { html: `<p>${line}</p>` };
    }
    if (!found) return { html: `<p>I don't see a ${escapeHtml(m)} tracker set up or a device sending it — add one in Build (and connect a device) and I'll track it.</p>` };
    const r = found.rule;
    const goal = goalAmountForRule(r);
    const label = sourceMetricLabel(r.dataSource, r.sourceMetric) || r.label || m;
    let value = found.connected ? deviceTotalForRule(r) : coachRuleValueToday(r, found.contextType, found.contextId);
    if (value == null) value = syncedContribution(r, { userId: "me", date: todayIso });
    value = numberOrDefault(value, 0);
    let line = `You're at <strong>${escapeHtml(formatCount(value))} ${escapeHtml(String(label).toLowerCase())}</strong> today`;
    if (found.connected) line += ` (via ${escapeHtml(wearableShortLabel(r.dataSource))})`;
    if (goal > 0) {
      const toGo = Math.max(goal - value, 0);
      line += toGo > 0 ? ` — ${escapeHtml(formatCount(toGo))} to go to hit ${escapeHtml(formatCount(goal))}.` : ` — past your ${escapeHtml(formatCount(goal))} goal! 🎉`;
    } else line += ".";
    return { html: `<p>${line}</p>` };
  }

  // "What's my Fitbit/device data" → list every connected device's live metrics today.
  function coachAnsDeviceSummary() {
    const all = coachConnectedDeviceMetrics();
    if (!all.length) return { html: `<p>No connected device is sending data yet — connect Fitbit, Apple Health, or Whoop in Profile and I'll show today's numbers.</p>` };
    const bySource = {};
    all.forEach((it) => { (bySource[it.sourceLabel] = bySource[it.sourceLabel] || []).push(it); });
    const lines = Object.keys(bySource).map((sl) => {
      const items = bySource[sl].map((it) => `${escapeHtml(formatCount(it.value))} ${escapeHtml(String(it.label).toLowerCase())}`).join(" · ");
      return `<strong>${escapeHtml(sl)} today:</strong> ${items}`;
    });
    return { html: `<p>${lines.join("<br>")}</p>` };
  }

  function coachAnsContextScore(name) {
    const ctx = coachResolveContext(name) || coachDefaultContext();
    if (!ctx) return { html: `<p>Set up a reward system in Build and I'll track your points here.</p>` };
    const { points, target } = coachContextPointsToday(ctx);
    let line = `You're at <strong>${escapeHtml(formatPoints(points))}${target > 0 ? "/" + escapeHtml(formatPoints(target)) : ""}</strong> points in <strong>${escapeHtml(ctx.name)}</strong> today`;
    if (target > 0) { const toGo = Math.max(target - points, 0); line += toGo > 0 ? ` — ${escapeHtml(formatPoints(toGo))} to go (${Math.round(progressPercent(points, target))}%).` : ` — goal hit! 🎉`; }
    else line += ".";
    return { html: `<p>${line}</p>` };
  }

  function coachAnsRuleProgress(ruleLabel, contextName) {
    const found = coachFindRuleByLabel(ruleLabel, contextName);
    if (!found) return { html: `<p>I couldn't find a “${escapeHtml(ruleLabel || "")}” habit. Ask about one of your tracked rules.</p>` };
    const r = found.rule, value = coachRuleValueOrDevice(r, found.contextType, found.contextId), goal = goalAmountForRule(r);
    let line;
    if (r.simpleStyle === "yesNo") {
      line = value > 0 ? `<strong>${escapeHtml(r.label)}</strong> is done for today ✓ (${escapeHtml(found.contextName)}).` : `<strong>${escapeHtml(r.label)}</strong> isn't logged yet today (${escapeHtml(found.contextName)}).`;
    } else {
      line = `<strong>${escapeHtml(r.label)}</strong>: ${escapeHtml(formatCount(value))}${goal > 0 ? " / " + escapeHtml(formatCount(goal)) : ""} ${escapeHtml(r.unit || "")} today`;
      if (goal > 0) { const toGo = Math.max(goal - value, 0); line += toGo > 0 ? ` — ${escapeHtml(formatCount(toGo))} ${escapeHtml(r.unit || "")} to go.` : ` — goal hit! 🎉`; }
      else line += ".";
    }
    return { html: `<p>${line}</p>` };
  }

  function coachAnsRank(contextName) {
    let ctx = coachResolveContext(contextName);
    if (!ctx || ctx.type !== "community") {
      const c = (state.communities || [])[0];
      if (!c) return { html: `<p>You're not in a community yet — join or create one in Build to see standings.</p>` };
      ctx = { type: "community", id: c.id, name: c.name || "Community", community: c };
    }
    const modules = (ctx.community.analytics && ctx.community.analytics.modules) || {};
    if (modules.leaderboard === false) return { html: `<p>${escapeHtml(ctx.name)} has its leaderboard turned off, so I can't show standings.</p>` };
    let standings = [];
    try { standings = communityStandings(ctx.community, COMMUNITY_PERIODS[0].id, "points"); } catch (e) { standings = []; }
    const myIndex = standings.findIndex((m) => m.id === "me");
    if (myIndex === -1) return { html: `<p>No standings to show for ${escapeHtml(ctx.name)} yet today.</p>` };
    const me = standings[myIndex], rank = myIndex + 1;
    let line;
    if (rank === 1) {
      const second = standings[1];
      line = second ? `You're <strong>#1</strong> in ${escapeHtml(ctx.name)} today — ${escapeHtml(formatPoints(Math.max(me.today - second.today, 0)))} ahead of #2. 🥇` : `You're <strong>#1</strong> in ${escapeHtml(ctx.name)} today. 🥇`;
    } else {
      const gap = Math.max(standings[0].today - me.today, 0);
      line = `You're <strong>#${rank}</strong> of ${standings.length} in ${escapeHtml(ctx.name)} today — ${escapeHtml(formatPoints(gap))} more point${formatPoints(gap) === "1" ? "" : "s"} to take the lead.`;
    }
    return { html: `<p>${line}</p>` };
  }

  function coachAnsUnlogged() {
    const items = buildStillToLog();
    if (!items.length) return { html: `<p>You're all caught up — nothing you usually log is left for today. 🙌</p>` };
    const names = items.slice(0, 5).map((m) => escapeHtml(m.label)).join(", ") + (items.length > 5 ? `, +${items.length - 5} more` : "");
    return { html: `<p>Still to log today: ${names}.</p>`, chip: `<div class="coach-card-actions"><button type="button" class="secondary-button small coach-chip" data-coach-answer-action="catchup">Log these</button></div>` };
  }

  function coachAnsWasLogged(thing) {
    const n = String(thing || "").toLowerCase().trim();
    if (!n) return { html: `<p>Log what, exactly? Name a habit or metric and I'll check.</p>` };
    if (METRIC_SOURCE[n]) {
      const f = coachFindMetricRule(n);
      if (f) { const v = numberOrDefault(coachRuleValueOrDevice(f.rule, f.contextType, f.contextId), 0); return { html: `<p>${v > 0 ? `Yes — ${escapeHtml(f.rule.label || n)} shows ${escapeHtml(formatValue(v))} today.` : `No ${escapeHtml(n)} recorded yet today.`}</p>` }; }
    }
    const found = coachFindRuleByLabel(n, null);
    if (!found) return { html: `<p>I couldn't find “${escapeHtml(thing)}” among your habits.</p>` };
    const logged = ruleHasManualEntryToday(found.contextType, found.contextId, found.rule.id) || numberOrDefault(coachRuleValueOrDevice(found.rule, found.contextType, found.contextId), 0) > 0;
    const chip = logged ? "" : `<div class="coach-card-actions"><button type="button" class="secondary-button small coach-chip" data-coach-answer-action="log:${escapeHtml(found.contextType + "|" + found.contextId + "|" + found.rule.id)}">Log it</button></div>`;
    return { html: `<p>${logged ? `Yes — <strong>${escapeHtml(found.rule.label)}</strong> is logged for today ✓` : `Not yet — <strong>${escapeHtml(found.rule.label)}</strong> isn't logged today`} (${escapeHtml(found.contextName)}).</p>`, chip: chip };
  }

  function coachAnsWeekSummary(contextName) {
    const ctx = coachResolveContext(contextName) || coachDefaultContext();
    if (!ctx) return { html: `<p>Set up a system or community first and I'll summarize your week.</p>` };
    const week = currentWeekDateKeys(), today = getTodayKey();
    const target = ctx.type === "community" ? communityTarget(ctx.community) : coachContextPointsToday(ctx).target;
    let daysHit = 0, daysSoFar = 0;
    const me = ctx.type === "community" ? (ctx.community.members || []).find((m) => m.id === "me") : null;
    week.forEach((d) => {
      if (d > today) return;
      daysSoFar += 1;
      let pts;
      if (ctx.type === "community") pts = me ? communityMemberPointsOnDate(ctx.community, me, d) : 0;
      else { const e = findEntry(d, ctx.id); pts = e ? numberOrDefault(e.total, 0) : 0; }
      if (target > 0 && pts >= target) daysHit += 1;
    });
    let line = `This week in <strong>${escapeHtml(ctx.name)}</strong>: you hit your goal <strong>${daysHit}</strong> of ${daysSoFar} day${daysSoFar === 1 ? "" : "s"} so far.`;
    return { html: `<p>${line}</p>` };
  }

  function coachAnsOverview() {
    const ctx = coachDefaultContext();
    if (!ctx) return { html: `<p>Set up a reward system in Build and I'll track your day here.</p>` };
    const { points, target } = coachContextPointsToday(ctx);
    let line = `In <strong>${escapeHtml(ctx.name)}</strong> you're at <strong>${escapeHtml(formatPoints(points))}${target > 0 ? "/" + escapeHtml(formatPoints(target)) : ""}</strong> points today`;
    if (target > 0) { const toGo = Math.max(target - points, 0); line += toGo > 0 ? ` (${Math.round(progressPercent(points, target))}%).` : ` — goal hit! 🎉`; }
    else line += ".";
    const still = buildStillToLog();
    let chip = "";
    if (still.length) { line += ` ${still.length} thing${still.length === 1 ? "" : "s"} you usually log ${still.length === 1 ? "isn't" : "aren't"} in yet.`; chip = `<div class="coach-card-actions"><button type="button" class="secondary-button small coach-chip" data-coach-answer-action="catchup">Log these</button></div>`; }
    // Tailor with the behavioral profile (streak + weekly trend) — both computed in code.
    const extras = [];
    const best = coachBestStreak();
    if (best) extras.push(`🔥 ${best.streak}-day streak in ${escapeHtml(best.name)}`);
    const trend = coachTrendLine();
    if (trend) extras.push(trend);
    const extraHtml = extras.length ? `<p class="coach-est-note">${extras.join(" · ")}</p>` : "";
    return { html: `<p>${line}</p>${extraHtml}`, chip: chip };
  }

  // Action chips on answer bubbles → run the REAL (confirm-gated) flow, never auto-log.
  function coachAnswerAction(action) {
    if (action === "catchup") { coachBehindCatchUp(null, { proactive: false }); return; }
    if (action.indexOf("log:") === 0) {
      const parts = action.slice(4).split("|");
      const resolved = resolveQuickLogRule(parts[0], parts[1], parts[2]);
      if (!resolved) { coachSayText("That rule isn't available anymore."); return; }
      const isYesNo = resolved.rule.simpleStyle === "yesNo";
      coach.draft = { entries: [{ _id: makeId("qlog"), contextType: parts[0], contextId: parts[1], ruleId: parts[2], isYesNo: isYesNo, amount: isYesNo ? 1 : suggestedEntryAmount(resolved.rule), note: "", confidence: 0.7 }], clars: [], routeAll: false };
      coach.draftCardEl = null;
      coachSay(`<p>Sure — set the amount and confirm:</p>`);
      coachRenderDraftCard();
    }
  }

  function coachRunParse(text) {
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.parseLog !== "function") {
      coachSayText("Sign in to use Coach — then I can read your logs and map them to your rules.");
      return;
    }
    const catalog = buildLoggableRuleCatalog();
    if (!catalog.length) { coachSayText("Add a rule to a system or community first, then I can log to it."); return; }
    coach.busy = true;
    const thinking = coachSay(`<p class="coach-thinking">Reading that…</p>`);
    Promise.resolve(window.PointwellSignals.parseLog(text, catalog)).then((res) => {
      if (thinking) thinking.remove();
      if (res.error) { coachSayText((res.error && res.error.message) || "Coach is unavailable right now."); return; }
      const entries = (res.entries || []).map(normalizeQuickLogEntry).filter(Boolean);
      const clars = (res.clarifications || []).map((c, i) => Object.assign({}, c, { _id: "cclar-" + i }));
      if (!entries.length && !clars.length) {
        coachSayText("I couldn't match that to a rule. Try naming the metric — e.g. “8000 steps” or “30 min lifting”.");
        return;
      }
      coach.draft = { entries: entries, clars: clars, routeAll: coachTextWantsAll(text) };
      coach.draftCardEl = null;
      coachRenderDraftCard();
    }).catch(() => {
      if (thinking) thinking.remove();
      coachSayText("That didn't go through — try again.");
    }).finally(() => { coach.busy = false; });
  }

  function coachDraftCardHtml() {
    const d = coach.draft;
    const catalog = buildLoggableRuleCatalog();
    const rows = d.entries.map((e) => coachDraftRow(e, catalog)).filter(Boolean).join("");
    const clars = (d.clars || []).map(coachClarRow).join("");
    const anyFanout = d.entries.some((e) => { const l = coachRuleLabel(e.contextType, e.contextId, e.ruleId); return l && catalog.filter((c) => c.label === l).length > 1; });
    const fan = anyFanout ? `<label class="coach-fanout"><input type="checkbox" data-coach-fanout${d.routeAll ? " checked" : ""}> Log everywhere this is tracked</label>` : "";
    const canLog = d.entries.length > 0;
    return `
      <p class="coach-card-title">Here's what I'll log — review &amp; confirm:</p>
      ${clars ? `<div class="coach-clars">${clars}</div>` : ""}
      <div class="coach-rows">${rows}</div>
      ${fan}
      <div class="coach-card-actions">
        <button type="button" class="ghost-button small" data-coach-cancel>Cancel</button>
        <button type="button" class="secondary-button small" data-coach-log-post${canLog ? "" : " disabled"}>Log &amp; post 📷</button>
        <button type="button" class="primary-button small" data-coach-log${canLog ? "" : " disabled"}>Log it</button>
      </div>`;
  }

  // Render (or re-render in place) the live confirm card so edits don't spawn new bubbles.
  function coachRenderDraftCard() {
    if (!coach.draft) return;
    const html = coachDraftCardHtml();
    if (coach.draftCardEl && coach.draftCardEl.isConnected) {
      coach.draftCardEl.innerHTML = html;
    } else {
      coachDisableStaleCards();
      const bubble = coachSay(`<div class="coach-card coach-draft-card is-active" data-coach-card></div>`);
      coach.draftCardEl = bubble.querySelector("[data-coach-card]");
      coach.draftCardEl.innerHTML = html;
    }
    coachScroll();
  }

  function coachDraftRow(e, catalog) {
    const resolved = resolveQuickLogRule(e.contextType, e.contextId, e.ruleId);
    if (!resolved) return "";
    const rule = resolved.rule;
    const label = escapeHtml(rule.label);
    const pts = scoring.calculateRule(rule, e.amount).totalPoints;
    const opts = catalog.filter((c) => c.label === rule.label);
    const ctxControl = opts.length > 1
      ? `<select class="coach-ctx" data-coach-ctx="${escapeHtml(e._id)}" aria-label="Where to log ${label}">${opts.map((o) => `<option value="${escapeHtml(o.contextId + "|" + o.id)}"${o.contextId === e.contextId && o.id === e.ruleId ? " selected" : ""}>${escapeHtml(o.contextName)}</option>`).join("")}</select>`
      : `<span class="coach-ctx-name">${escapeHtml(resolved.contextName)}</span>`;
    const amtControl = e.isYesNo
      ? `<button type="button" class="coach-done${e.amount > 0 ? " is-on" : ""}" data-coach-toggle="${escapeHtml(e._id)}" aria-pressed="${e.amount > 0 ? "true" : "false"}">${e.amount > 0 ? "Done ✓" : "Mark done"}</button>`
      : `<input type="number" class="coach-amt" data-coach-amt="${escapeHtml(e._id)}" value="${escapeHtml(String(e.amount))}" min="0" step="any" inputmode="decimal" aria-label="Amount for ${label}"><span class="coach-unit">${escapeHtml(rule.unit || "")}</span>`;
    return `
      <div class="coach-row" data-coach-row="${escapeHtml(e._id)}">
        <div class="coach-row-main">
          <strong>${label}</strong>
          <div class="coach-row-controls">${amtControl}</div>
          <div class="coach-row-ctx">${ctxControl}</div>
        </div>
        <span class="point-pill ${pts < 0 ? "negative" : "positive"}" data-coach-pill="${escapeHtml(e._id)}">${pts >= 0 ? "+" : ""}${escapeHtml(formatPoints(pts))} pts</span>
      </div>`;
  }

  function coachClarRow(c) {
    const chips = (c.options || []).map((o) =>
      `<button type="button" class="signal-preset-chip coach-clar-chip" data-coach-clar="${escapeHtml(c._id + "::" + o.contextId + "|" + o.ruleId)}">${escapeHtml(o.contextName)}</button>`
    ).join("");
    return `<div class="coach-clar-item"><span class="coach-clar-q">${escapeHtml(c.question)}</span><div class="signal-presets">${chips}</div></div>`;
  }

  function coachDraftEntryById(id) { return coach.draft ? coach.draft.entries.find((e) => e._id === id) : null; }

  function coachResolveClar(token) {
    if (!coach.draft) return;
    const sep = token.indexOf("::");
    if (sep === -1) return;
    const clarId = token.slice(0, sep);
    const idPart = token.slice(sep + 2).split("|");
    const clar = (coach.draft.clars || []).find((c) => c._id === clarId);
    if (clar) {
      const option = (clar.options || []).find((o) => o.contextId === idPart[0] && o.ruleId === idPart[1]);
      if (option) {
        const entry = normalizeQuickLogEntry({ contextType: option.contextType, contextId: idPart[0], ruleId: idPart[1], amount: clar.amount, done: clar.done });
        if (entry && !coach.draft.entries.some((d) => d.contextId === idPart[0] && d.ruleId === idPart[1])) coach.draft.entries.push(entry);
      }
    }
    coach.draft.clars = (coach.draft.clars || []).filter((c) => c._id !== clarId);
    coachRenderDraftCard();
  }

  function coachDisableStaleCards() {
    if (!els.coachThread) return;
    Array.from(els.coachThread.querySelectorAll(".coach-card.is-active")).forEach((card) => {
      card.classList.remove("is-active");
      card.classList.add("is-done");
      Array.from(card.querySelectorAll("button, input, select, textarea")).forEach((el) => { el.disabled = true; });
    });
  }

  // Build a quickLogDraft-shaped entry so we can hand off to confirmQuickLog (the SAME
  // save path the quick-log panel uses). `place` is a catalog rule {contextType,contextId,id,type}.
  function coachToQuickEntry(e, place) {
    const isYesNo = place.type === "yesNo";
    return {
      _id: makeId("qlog"),
      contextType: place.contextType, contextId: place.contextId, ruleId: place.id,
      isYesNo: isYesNo,
      amount: isYesNo ? (e.amount > 0 ? 1 : 0) : e.amount,
      note: "", confidence: numberOrDefault(e.confidence, 0.6),
    };
  }

  function coachConfirmLog(wantPost) {
    const d = coach.draft;
    if (!d || !d.entries.length) return;
    const catalog = buildLoggableRuleCatalog();
    const built = [];
    d.entries.forEach((e) => {
      if (d.routeAll) {
        const label = coachRuleLabel(e.contextType, e.contextId, e.ruleId);
        const places = label ? catalog.filter((c) => c.label === label) : [];
        const targets = places.length ? places : [{ contextType: e.contextType, contextId: e.contextId, id: e.ruleId, type: e.isYesNo ? "yesNo" : "number" }];
        targets.forEach((p) => built.push(coachToQuickEntry(e, p)));
      } else {
        built.push(coachToQuickEntry(e, { contextType: e.contextType, contextId: e.contextId, id: e.ruleId, type: e.isYesNo ? "yesNo" : "number" }));
      }
    });
    // De-dupe one entry per context+rule so a fan-out never double-counts.
    const seen = {};
    const finalDraft = [];
    built.forEach((b) => { const k = b.contextId + "|" + b.ruleId; if (!seen[k]) { seen[k] = true; finalDraft.push(b); } });
    if (!finalDraft.length) { coachSayText("Nothing to log — set an amount first."); return; }

    coach.lastLogged = finalDraft.map((b) => ({ contextType: b.contextType, contextId: b.contextId, ruleId: b.ruleId, amount: b.amount, isYesNo: b.isYesNo }));
    // Hand off to the existing batch save (personal + community + DB push + toast).
    quickLogDraft = finalDraft;
    quickLogClarifications = [];
    confirmQuickLog();

    coachFinalizeDraftCard();
    coach.draft = null;
    coach.draftCardEl = null;
    coachSay(`<p>✅ Logged ${escapeHtml(coachLoggedSummary(finalDraft))}.</p>`);
    if (wantPost) coachOpenPostComposer();
    else coachOfferPost();
  }

  function coachFinalizeDraftCard() {
    if (coach.draftCardEl && coach.draftCardEl.isConnected) {
      coach.draftCardEl.classList.remove("is-active");
      coach.draftCardEl.classList.add("is-done");
      Array.from(coach.draftCardEl.querySelectorAll("button, input, select, textarea")).forEach((el) => { el.disabled = true; });
    }
  }

  function coachLoggedSummary(draft) {
    const parts = draft.slice(0, 4).map((b) => {
      const r = resolveQuickLogRule(b.contextType, b.contextId, b.ruleId);
      if (!r) return "";
      const amt = b.isYesNo ? "done" : `${formatPoints(b.amount)} ${r.rule.unit || ""}`.trim();
      return `${r.rule.label} (${amt}) → ${r.contextName}`;
    }).filter(Boolean);
    let text = parts.join(", ");
    if (draft.length > 4) text += `, +${draft.length - 4} more`;
    return text || "your entry";
  }

  function coachCancelDraft() {
    coachFinalizeDraftCard();
    coach.draft = null;
    coach.draftCardEl = null;
    coachSayText("No problem — nothing logged.");
  }

  // ── Post offer → destination picker → composer ───────────────────────────────
  // After any coach log, offer to turn it into a post. Destinations: the user's OWN feed
  // (always) + every community they're a member of. Community posts publish through the
  // existing community_entries path (follower/member-visible today). "Your feed" creates a
  // LOCAL personal entry only for now — see coachSubmitPersonalPost's TODO.

  // A community entry is "mine" if it carries the local "me" id OR my real account uid
  // (community entries reload from the DB keyed by the real uid).
  function coachIsMine(entry) {
    if (!entry) return false;
    if (entry.userId === "me") return true;
    return !!(state.account && state.account.userId && entry.userId === state.account.userId);
  }

  // The personal-feed source for "Your feed": the just-logged personal activity. Prefer an
  // entry already logged to a personal system (→ enrich it, never re-add the amount, so no
  // double count); otherwise map the first logged rule's label to a personal rule, falling
  // back to the primary personal system + the logged rule itself for a fresh local entry.
  // Returns null only when there is nothing logged or no personal system to store it in.
  function coachPersonalPostSource() {
    const logged = coach.lastLogged || [];
    if (!logged.length) return null;
    for (let i = 0; i < logged.length; i++) {
      const l = logged[i];
      if (l.contextType !== "personal") continue;
      const sys = (state.systems || []).find((s) => s.id === l.contextId);
      const r = resolveQuickLogRule("personal", l.contextId, l.ruleId);
      if (sys && r) return { system: sys, rule: r.rule, amount: l.amount, alreadyLogged: true };
    }
    const sys = primaryPersonalSystem();
    if (!sys) return null;
    const first = logged[0];
    const firstResolved = resolveQuickLogRule(first.contextType, first.contextId, first.ruleId);
    if (!firstResolved) return null;
    const sysRules = (sys.rules || []).map(scoring.normalizeRule)
      .filter((r) => r.simpleStyle !== "penalty" && r.dataSource !== "calculated");
    if (!sysRules.length) return null;
    const label = String(firstResolved.rule.label || "").toLowerCase();
    // Always a REAL rule of this system (matching label, else its first loggable rule) — never a
    // foreign community rule, which would write an orphan ruleId into the personal entries.
    const rule = sysRules.find((r) => String(r.label || "").toLowerCase() === label) || sysRules[0];
    return { system: sys, rule: rule, amount: first.amount, alreadyLogged: false };
  }

  // Resolve a community to a post target: the rule matching a just-logged label if any
  // (matchedByLabel), else the community's first loggable rule (so "allow any community"
  // still has somewhere to post). alreadyLogged means the coach just logged THIS rule to
  // THIS community → enrich, don't re-add. Null when the community has no loggable rule.
  function coachCommunityTarget(community) {
    const sys = normalizeSystem(community.system || { rules: [] });
    const rules = (sys.rules || []).map(scoring.normalizeRule)
      .filter((r) => r.simpleStyle !== "penalty" && r.dataSource !== "calculated");
    if (!rules.length) return null;
    const labels = {};
    (coach.lastLogged || []).forEach((l) => { const lbl = coachRuleLabel(l.contextType, l.contextId, l.ruleId); if (lbl) labels[lbl.toLowerCase()] = l.amount; });
    let rule = rules.find((r) => String(r.label || "").toLowerCase() in labels);
    const matchedByLabel = !!rule;
    let amount;
    if (rule) { amount = labels[String(rule.label).toLowerCase()]; }
    // No matching rule → log a clean default check-in to the first rule, not a clamped-wrong amount.
    else { rule = rules[0]; amount = suggestedEntryAmount(rule); }
    const alreadyLogged = (coach.lastLogged || []).some((l) => l.contextType === "community" && l.contextId === community.id && l.ruleId === rule.id);
    return { contextId: community.id, contextName: community.name || "Community", ruleId: rule.id, label: rule.label, amount: amount, alreadyLogged: alreadyLogged, matchedByLabel: matchedByLabel };
  }

  // All post destinations for the just-logged activity: your own feed (always, when there's
  // somewhere to store it) + every community you're a member of, matching ones first.
  function coachPostDestinations() {
    const out = [];
    if (coachPersonalPostSource()) {
      out.push({ kind: "personal", id: "personal", name: "Your feed", sub: "Only you can see this for now", matching: true });
    }
    (state.communities || []).forEach((c) => {
      const tgt = coachCommunityTarget(c);
      if (!tgt) return; // no loggable rule → nothing to post to here
      out.push({ kind: "community", id: c.id, name: c.name || "Community", sub: tgt.matchedByLabel ? `Tracks ${tgt.label}` : "Your community", matching: tgt.matchedByLabel });
    });
    out.sort((a, b) => (b.matching ? 1 : 0) - (a.matching ? 1 : 0));
    return out;
  }

  // Offer to turn the just-logged entry into a post. Shows whenever there's ≥1 destination
  // (your own feed always counts). Learns dismissals like the other nudges (coachLearnRecord
  // + coachShouldPeekType suppression after repeated "Not now").
  function coachOfferPost() {
    coachPendingCaption = ""; // a normal post offer must never inherit a stale recap prefill
    if (!(coach.lastLogged || []).length) return;
    if (!coachPostDestinations().length) return;
    if (!coachShouldPeekType("post")) return;
    coachLearnRecord("post", "shown");
    coachDisableStaleCards();
    coachSay(`
      <div class="coach-card coach-postoffer-card is-active" data-coach-postoffer-card>
        <p class="coach-card-title">Want to turn this into a post?</p>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-postno>Not now</button>
          <button type="button" class="primary-button small" data-coach-postyes>Yes</button>
        </div>
      </div>`);
    coachScroll();
  }

  // Step 2: "Where would you like to post it?" — single-select list of destinations. Also
  // the entry point for the "Log & post" shortcuts (which skip the Yes/Not now offer).
  function coachOpenPostPicker() {
    const dests = coachPostDestinations();
    if (!dests.length) {
      coachSayText("Nowhere to post this yet — add a system or join a community in Build, then tell me again.");
      return;
    }
    coachDisableStaleCards();
    const rows = dests.map((d) => `
      <button type="button" class="coach-dest-btn" data-coach-postdest="${escapeHtml(d.kind + ":" + d.id)}">
        <span class="coach-dest-name">${escapeHtml(d.name)}</span>
        <span class="coach-dest-sub">${escapeHtml(d.sub)}</span>
      </button>`).join("");
    coachSay(`
      <div class="coach-card coach-postpick-card is-active" data-coach-postpick-card>
        <p class="coach-card-title">Where would you like to post it?</p>
        <div class="coach-dest-list">${rows}</div>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-postno>Not now</button>
        </div>
      </div>`);
    coachScroll();
  }
  // Back-compat alias: the "Log & post" shortcuts open the destination picker directly.
  function coachOpenPostComposer() { coachPendingCaption = ""; coachOpenPostPicker(); } // "Log & post" shortcuts: never inherit a recap prefill

  // Step 3: a destination was picked → open the composer (caption + photo) for it.
  function coachChooseDestination(kind, id) {
    let post;
    if (kind === "personal") {
      const src = coachPersonalPostSource();
      if (!src) { coachSayText("I couldn't find your personal activity to post — try logging something first."); return; }
      post = { kind: "personal", name: "Your feed", system: src.system, rule: src.rule, amount: src.amount, alreadyLogged: src.alreadyLogged };
    } else {
      const community = (state.communities || []).find((c) => c.id === id);
      if (!community) { coachSayText("That community isn't available anymore."); return; }
      const tgt = coachCommunityTarget(community);
      if (!tgt) { coachSayText("That community has no rule to post to yet."); return; }
      post = { kind: "community", name: community.name || "Community", contextId: tgt.contextId, ruleId: tgt.ruleId, amount: tgt.amount, alreadyLogged: tgt.alreadyLogged };
    }
    coach.post = Object.assign(post, { caption: (coachPendingCaption || "").slice(0, ENTRY_MESSAGE_MAX), file: null, previewUrl: "", cardEl: null });
    coachPendingCaption = ""; // one-shot: consume any recap prefill
    coachDisableStaleCards();
    const bubble = coachSay(`<div class="coach-card coach-post-card is-active" data-coach-post-card></div>`);
    coach.post.cardEl = bubble.querySelector("[data-coach-post-card]");
    coachRenderPostCard();
  }

  // "Not now" on either the offer or the picker → dismiss cleanly + learn the dismissal.
  function coachDeclinePost() {
    coachLearnRecord("post", "dismissed");
    coachPendingCaption = ""; // declining clears any pending recap prefill too
    coach.post = null;
    coachDisableStaleCards();
    coachSayText("No problem — logged, not posted.");
  }

  // A post needs a PHOTO or a non-empty CAPTION (a bare log stays activity-only). With no photo the
  // caption is required, so the Post button stays disabled (with a hint) until one is added.
  function coachPostCanSubmit() {
    const p = coach.post;
    return !!p && (!!(p.file || p.previewUrl) || !!(p.caption || "").trim());
  }
  // Live-toggle the Post button + hint as the caption is typed (no re-render → keeps textarea focus).
  function updateCoachPostSubmitState() {
    const p = coach.post;
    if (!p || !p.cardEl || !p.cardEl.isConnected) return;
    const canPost = coachPostCanSubmit();
    const btn = p.cardEl.querySelector("[data-coach-post-submit]");
    if (btn) btn.disabled = !canPost;
    const hint = p.cardEl.querySelector("[data-coach-post-hint]");
    if (hint) hint.hidden = canPost;
  }

  function coachRenderPostCard() {
    if (!coach.post || !coach.post.cardEl || !coach.post.cardEl.isConnected) return;
    const p = coach.post;
    const photoSlot = p.previewUrl
      ? `<div class="coach-post-photo has-photo"><img src="${escapeHtml(p.previewUrl)}" alt="Post photo preview"><button type="button" class="entry-photo-remove" data-coach-post-photo-remove aria-label="Remove photo">×</button></div>`
      : `<button type="button" class="ghost-button small coach-post-addphoto" data-coach-post-photo>📷 Add photo</button>`;
    const canPost = coachPostCanSubmit();
    coach.post.cardEl.innerHTML = `
      <p class="coach-card-title">Post to ${escapeHtml(p.name || "your feed")}</p>
      <label class="coach-field"><span>Caption</span>
        <textarea data-coach-post-caption maxlength="${ENTRY_MESSAGE_MAX}" rows="2" placeholder="Say something…">${escapeHtml(p.caption || "")}</textarea></label>
      ${photoSlot}
      <div class="coach-card-actions">
        <span class="coach-post-hint" data-coach-post-hint${canPost ? " hidden" : ""}>Add a caption to post</span>
        <button type="button" class="ghost-button small" data-coach-post-cancel>Not now</button>
        <button type="button" class="primary-button small" data-coach-post-submit${canPost ? "" : " disabled"}>Post</button>
      </div>`;
    coachScroll();
  }

  function coachAttachPostPhoto(file) {
    if (!coach.post) return;
    if (coach.post.previewUrl) { try { URL.revokeObjectURL(coach.post.previewUrl); } catch (e) { /* ignore */ } }
    coach.post.file = file;
    coach.post.previewUrl = URL.createObjectURL(file);
    coachRenderPostCard();
  }

  async function coachSubmitPost() {
    const p = coach.post;
    if (!p) return;
    // A post needs a photo or a non-empty caption — a bare log is activity only, never a full post.
    if (!coachPostCanSubmit()) { showToast("Add a caption or photo to post"); return; }
    if (p.kind === "personal") { coachSubmitPersonalPost(p); return; }
    const community = (state.communities || []).find((c) => c.id === p.contextId);
    if (!community) { coachSayText("That community isn't available anymore."); return; }
    const resolved = resolveQuickLogRule("community", p.contextId, p.ruleId);
    if (!resolved) { coachSayText("That rule isn't available anymore."); return; }
    const rule = resolved.rule;
    const uid = state.account && state.account.userId;
    const caption = (p.caption || "").trim().slice(0, ENTRY_MESSAGE_MAX);

    let photoPath = "";
    if (p.file) {
      if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.uploadEntryPhoto !== "function") {
        coachSayText("Sign in to attach photos — posting without it.");
      } else {
        const up = await window.PointwellSignals.uploadEntryPhoto(p.file, community.id + "/" + uid);
        if (up.error || !up.path) coachSayText("Couldn't upload the photo — posting without it.");
        else photoPath = up.path;
      }
    }

    const today = getTodayKey();
    // The amount was logged exactly once during confirmQuickLog. `p.alreadyLogged` (captured
    // when the composer opened) is the source of truth for whether THIS community already has
    // that log — NOT a runtime scan, which can mis-fire after a DB reload aggregates entries.
    if (p.alreadyLogged) {
      // ENRICH today's entry with the caption/photo — never add amount (would double-count).
      // Match "mine" by either the local "me" id or my real uid (after a DB reload). If none
      // is found we still push the message/photo to the aggregated DB row below.
      const mine = (state.communityEntries || []).filter((e) => e.communityId === community.id && coachIsMine(e) && e.ruleId === rule.id && (e.dateKey || e.date) === today);
      const target = mine[mine.length - 1];
      if (target) {
        if (caption) target.message = caption;
        if (photoPath) target.photoPath = photoPath;
      }
    } else {
      // Sharing to a community we did NOT log to yet → this is a legitimate new log there.
      const amt = normalizeAddEntryAmount(p.amount, rule);
      addCommunityEntry(community.id, "me", rule, amt, isRuleSynced(rule) ? "manual-adjustment" : "manual", caption, photoPath, "");
    }
    rebaselineRuleSync(rule); // keep the sync baseline current whether we logged or enriched
    saveCommunitySummaryForMember(community, "me");
    saveState();
    Promise.resolve(pushCommunityEntryToDb(community, rule.id, caption, photoPath)).then((r) => { if (r && r.error) showToast("Posted here, but the community didn't sync"); }).catch(() => {});

    coachFinalizePostCard();
    coach.post = null;
    render();
    coachSay(`<p>✅ Posted to <strong>${escapeHtml(community.name || "your community")}</strong>. <button type="button" class="coach-inline-btn" data-coach-viewfeed>View in feed</button></p>`);
  }

  function coachFinalizePostCard() {
    if (coach.post && coach.post.cardEl && coach.post.cardEl.isConnected) {
      coach.post.cardEl.classList.remove("is-active");
      coach.post.cardEl.classList.add("is-done");
      Array.from(coach.post.cardEl.querySelectorAll("button, input, select, textarea")).forEach((el) => { el.disabled = true; });
    }
  }

  function coachCancelPost() {
    coachFinalizePostCard();
    coach.post = null;
    coachSayText("Okay — logged, not posted.");
  }

  function coachLatestPersonalEntry(systemId, ruleId, dateKey) {
    const mine = (state.quickEntries || []).filter((e) => e.systemId === systemId && e.ruleId === ruleId && (e.dateKey || e.date) === dateKey);
    return mine[mine.length - 1] || null;
  }

  // "Your feed" post. PLACEHOLDER for this diff: it creates/enriches a LOCAL personal entry
  // (reusing the exact personal Add Entry path — photo → personal/<uid>, then enrich or
  // addQuickLogPersonalEntry) so the post shows in the user's OWN app. It is NOT yet visible
  // to followers.
  // TODO(personal-feed backend, next diff): persist this to a dedicated personal_posts table
  // with follow-gated RLS + likes/comments generalized off community_entries.id, so "Your
  // feed" posts actually reach followers. Do NOT route it through community_entries.
  async function coachSubmitPersonalPost(p) {
    const system = p.system;
    if (!system) { coachSayText("That system isn't available anymore."); return; }
    const rule = p.rule;
    const uid = state.account && state.account.userId;
    const caption = (p.caption || "").trim().slice(0, ENTRY_MESSAGE_MAX);

    let photoPath = "";
    if (p.file) {
      if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.uploadEntryPhoto !== "function") {
        coachSayText("Sign in to attach photos — posting without it.");
      } else {
        const up = await window.PointwellSignals.uploadEntryPhoto(p.file, "personal/" + uid);
        if (up.error || !up.path) coachSayText("Couldn't upload the photo — posting without it.");
        else photoPath = up.path;
      }
    }

    const today = getTodayKey();
    // CRITICAL double-count rule: gate on p.alreadyLogged, NEVER on whether a local row was
    // found (the community branch does the same). A just-tracked SYNCED metric is already
    // counted in state.syncProgress and has NO quickEntry — re-adding it would double-count.
    if (p.alreadyLogged) {
      const existing = coachLatestPersonalEntry(system.id, rule.id, today);
      if (existing) {
        // A hand-logged manual entry already holds the amount → enrich it in place.
        if (caption) existing.message = caption;
        if (photoPath) existing.photoPath = photoPath;
      } else {
        // Synced metric (lives in syncProgress, not quickEntries) → record the caption/photo as
        // a viaSource "materialized" entry. todayValuesForSystem EXCLUDES viaSource rows from the
        // manual total, so the post keeps its content WITHOUT re-adding the already-counted amount.
        coachAddPersonalPostEntry(system, rule, normalizeAddEntryAmount(p.amount, rule), caption, photoPath);
      }
    } else {
      // No prior entry for this activity → a genuine new local personal log.
      addQuickLogPersonalEntry(system, rule, normalizeAddEntryAmount(p.amount, rule), caption);
      if (photoPath) { const t = coachLatestPersonalEntry(system.id, rule.id, today); if (t) t.photoPath = photoPath; }
    }
    syncDraftInputsFromEntries(system);
    saveState();

    coachFinalizePostCard();
    coach.post = null;
    render();
    coachSay(`<p>✅ Added to <strong>your feed</strong>. <span class="coach-post-note">Only you can see this for now — follower sharing is coming soon.</span></p>`);
  }

  // A "materialized" post of an already-counted synced value: a viaSource quickEntry carrying
  // the caption/photo. todayValuesForSystem skips viaSource rows (app.js: "if (entry.viaSource)
  // return") since they're superseded by syncProgress, so this NEVER adds to the rule's total —
  // it just gives the synced metric a local post. Mirrors the Add Entry "share synced value" path.
  function coachAddPersonalPostEntry(system, rule, amount, message, photoPath) {
    state.quickEntries = state.quickEntries || [];
    state.quickEntries.push({
      id: makeId("quick"),
      date: getTodayKey(),
      dateKey: getTodayKey(),
      createdAt: new Date().toISOString(),
      systemId: system.id,
      rewardSystemId: system.id,
      ruleId: rule.id,
      label: rule.label,
      unit: rule.unit,
      amount: amount,
      message: message,
      photoPath: photoPath,
      source: "manual-adjustment",
      viaSource: rule.dataSource && rule.dataSource !== "manual" && rule.dataSource !== "calculated" ? rule.dataSource : "synced",
    });
    autoSaveToday(system);
  }

  // ── Food photo → calorie/macro estimate ─────────────────────────────────────
  // Analyze ANY attached photo: the vision model classifies food / workout / other and returns
  // a ROUGH, editable estimate (never fabricated). Confirm-gated like every log.
  async function coachAnalyzePhoto(file) {
    if (!signalsReady() || !window.PointwellSignals || typeof window.PointwellSignals.estimateFood !== "function") {
      coachSayText("Sign in to analyze photos. You can still tell me what you did — e.g. “logged 600 cal” or “ran 30 min”.");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    coachAppendBubble("user", `<div class="coach-photo-sent"><img src="${escapeHtml(previewUrl)}" alt="Attached photo"></div>`);
    coach.busy = true;
    const thinking = coachSay(`<p class="coach-thinking">Looking at your photo…</p>`);
    try {
      const parts = await fileToBase64Parts(file);
      const res = await window.PointwellSignals.estimateFood(parts.data, parts.mediaType, "");
      if (thinking) thinking.remove();
      if (res.error || !res.estimate) { coachSayText((res.error && res.error.message) || "I couldn't read that photo — tell me what to log and I'll add it."); return; }
      const est = res.estimate;
      // Unreadable → say so, never fabricate numbers.
      if (numberOrDefault(est.confidence, 0) <= 0 && est.kind === "other") {
        coachSayText(est.note || "I couldn't make out that photo — tell me what to log and I'll add it.");
        return;
      }
      coach.estimate = Object.assign({ file: file, previewUrl: previewUrl }, est);
      coachRenderEstimateCard();
    } catch (e) {
      if (thinking) thinking.remove();
      coachSayText("That photo didn't go through — try again.");
    } finally { coach.busy = false; }
  }

  function coachRenderEstimateCard() {
    const est = coach.estimate;
    if (!est) return;
    const numField = (key, label, val) => `<label class="coach-est-field"><span>${escapeHtml(label)}</span><input type="number" min="0" step="any" inputmode="decimal" data-coach-est="${key}" value="${escapeHtml(String(numberOrDefault(val, 0)))}"></label>`;
    const note = est.note ? `<p class="coach-est-note">${escapeHtml(est.note)}</p>` : "";
    coachDisableStaleCards();
    const bubble = coachSay(`<div class="coach-card coach-est-card is-active" data-coach-est-card></div>`);
    est.cardEl = bubble.querySelector("[data-coach-est-card]");
    if (est.kind === "workout") {
      est.cardEl.innerHTML = `
        <p class="coach-card-title">Looks like a ${escapeHtml(est.activity || "workout")} <span class="quick-log-estimate-tag">AI estimate</span></p>
        <div class="coach-est-grid">
          ${numField("duration", "Duration (min)", est.duration)}
          ${numField("distance", "Distance (" + escapeHtml(est.distanceUnit || "mi") + ")", est.distance)}
          ${numField("calories", "Calories", est.calories)}
        </div>
        ${note}
        <p class="coach-est-disclaim">Rough estimate — edit any number before logging.</p>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-est-cancel>Cancel</button>
          <button type="button" class="primary-button small" data-coach-est-log>Log it</button>
        </div>`;
    } else if (est.kind === "food") {
      const items = (est.items || []).length ? `<p class="coach-est-items">${escapeHtml(est.items.join(", "))}</p>` : "";
      est.cardEl.innerHTML = `
        <p class="coach-card-title">Here's my estimate <span class="quick-log-estimate-tag">AI estimate</span></p>
        ${items}
        <div class="coach-est-grid">
          ${numField("calories", "Calories", est.calories)}
          ${numField("protein", "Protein (g)", est.protein)}
          ${numField("carbs", "Carbs (g)", est.carbs)}
          ${numField("fat", "Fat (g)", est.fat)}
        </div>
        ${note}
        <p class="coach-est-disclaim">Rough estimate — edit any number before logging.</p>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-est-cancel>Cancel</button>
          <button type="button" class="primary-button small" data-coach-est-log>Log these</button>
        </div>`;
    } else {
      // "other" — describe + suggest a rule; no fabricated numbers, nothing to log.
      const sugg = est.suggestion ? `<p class="coach-est-note">${escapeHtml(est.suggestion)}</p>` : "";
      est.cardEl.innerHTML = `
        <p class="coach-card-title">Here's what I see</p>
        ${note}${sugg}
        <p class="coach-est-disclaim">I can't put a number on that — tell me what to log and I'll add it.</p>
        <div class="coach-card-actions">
          <button type="button" class="ghost-button small" data-coach-est-cancel>OK</button>
        </div>`;
    }
    coachScroll();
  }

  function coachLogEstimate() {
    const est = coach.estimate;
    if (!est || est.kind === "other") { coachCancelEstimate(); return; }
    const built = buildEstimateDraftRows(est);
    if (!built.length) {
      coachSayText(est.kind === "workout"
        ? "I don't see a workout rule (minutes / distance / calories) to log this to. Add one in Build, then snap again."
        : "I don't see a calories/protein rule to log this to. Add one in Build, then snap again.");
      return;
    }
    coach.lastLogged = built.map((b) => ({ contextType: b.contextType, contextId: b.contextId, ruleId: b.ruleId, amount: b.amount, isYesNo: b.isYesNo }));
    quickLogDraft = built;
    quickLogClarifications = [];
    confirmQuickLog();
    coachFinalizeEstimateCard();
    coach.estimate = null;
    coachSay(`<p>✅ Logged ${escapeHtml(coachLoggedSummary(built))}.</p>`);
    coachOfferPost();
  }

  function coachFinalizeEstimateCard() {
    const est = coach.estimate;
    if (est && est.cardEl && est.cardEl.isConnected) {
      est.cardEl.classList.remove("is-active");
      est.cardEl.classList.add("is-done");
      Array.from(est.cardEl.querySelectorAll("button, input, select, textarea")).forEach((el) => { el.disabled = true; });
    }
  }

  function coachCancelEstimate() {
    coachFinalizeEstimateCard();
    coach.estimate = null;
    coachSayText("No worries — nothing logged.");
  }

  // ── Delegated thread handlers ───────────────────────────────────────────────
  function onCoachThreadClick(event) {
    const t = event.target;
    const answerAction = t.closest("[data-coach-answer-action]");
    if (answerAction) { coachAnswerAction(answerAction.dataset.coachAnswerAction); return; }
    const card = () => t.closest(".coach-nudge-card");
    const devLog = t.closest("[data-coach-devlog]");
    if (devLog) { const p = devLog.dataset.coachDevlog.split("|"); coachDeviceLog(p[0], p[1], card(), { post: false }); return; }
    const devPost = t.closest("[data-coach-devpost]");
    if (devPost) { const p = devPost.dataset.coachDevpost.split("|"); coachDeviceLog(p[0], p[1], card(), { post: true }); return; }
    const devDismiss = t.closest("[data-coach-devdismiss]");
    if (devDismiss) { const p = devDismiss.dataset.coachDevdismiss.split("|"); coachDeviceDismiss(p[0], p[1], card()); return; }
    const devTrack = t.closest("[data-coach-track]");
    if (devTrack) { const p = devTrack.dataset.coachTrack.split("|"); coachTrackMetric(p[0], p[1], card()); return; }
    const devTrackDismiss = t.closest("[data-coach-trackdismiss]");
    if (devTrackDismiss) { const p = devTrackDismiss.dataset.coachTrackdismiss.split("|"); coachTrackDismiss(p[0], p[1], card()); return; }
    const devConnect = t.closest("[data-coach-connect]");
    if (devConnect) { const p = devConnect.dataset.coachConnect.split("|"); coachDeviceConnect(p[0], p[1], card()); return; }
    const devConnectDismiss = t.closest("[data-coach-connectdismiss]");
    if (devConnectDismiss) { const p = devConnectDismiss.dataset.coachConnectdismiss.split("|"); coachConnectDismiss(p[0], p[1], card()); return; }
    const confKeep = t.closest("[data-coach-confkeep]");
    if (confKeep) { const p = confKeep.dataset.coachConfkeep.split("|"); coachConflict(p[0], p[1], "keep", card()); return; }
    const confUpdate = t.closest("[data-coach-confupdate]");
    if (confUpdate) { const p = confUpdate.dataset.coachConfupdate.split("|"); coachConflict(p[0], p[1], "update", card()); return; }
    if (t.closest("[data-coach-behind]")) { coachBehindCatchUp(card()); return; }
    if (t.closest("[data-coach-behinddismiss]")) { coachBehindDismiss(card()); return; }
    if (t.closest("[data-coach-softdismiss]")) { coachSoftDismiss(card()); return; }
    if (t.closest("[data-coach-cancel]")) { coachCancelDraft(); return; }
    if (t.closest("[data-coach-log-post]")) { coachConfirmLog(true); return; }
    if (t.closest("[data-coach-log]")) { coachConfirmLog(false); return; }
    const toggle = t.closest("[data-coach-toggle]");
    if (toggle) { const e = coachDraftEntryById(toggle.dataset.coachToggle); if (e) { e.amount = e.amount > 0 ? 0 : 1; coachRenderDraftCard(); } return; }
    const clar = t.closest("[data-coach-clar]");
    if (clar) { coachResolveClar(clar.dataset.coachClar); return; }
    if (t.closest("[data-coach-recappost]")) { coachRecapPost(card()); return; }
    if (t.closest("[data-coach-recapkeep]")) { coachRecapKeep(card()); return; }
    if (t.closest("[data-coach-recapdismiss]")) { coachRecapDismiss(card()); return; }
    if (t.closest("[data-coach-streaklog]")) { coachStreakLog(card()); return; }
    if (t.closest("[data-coach-streakdismiss]")) { coachStreakDismiss(card()); return; }
    if (t.closest("[data-coach-postyes]")) { coachLearnRecord("post", "acted"); coachOpenPostPicker(); return; }
    if (t.closest("[data-coach-postno]")) { coachDeclinePost(); return; }
    const postDest = t.closest("[data-coach-postdest]");
    if (postDest) { const parts = postDest.dataset.coachPostdest.split(":"); coachChooseDestination(parts[0], parts.slice(1).join(":")); return; }
    if (t.closest("[data-coach-post-photo]")) { coachPickPhoto("post"); return; }
    if (t.closest("[data-coach-post-photo-remove]")) { if (coach.post) { if (coach.post.previewUrl) { try { URL.revokeObjectURL(coach.post.previewUrl); } catch (e) { /* ignore */ } } coach.post.file = null; coach.post.previewUrl = ""; coachRenderPostCard(); } return; }
    if (t.closest("[data-coach-post-submit]")) { coachSubmitPost(); return; }
    if (t.closest("[data-coach-post-cancel]")) { coachCancelPost(); return; }
    if (t.closest("[data-coach-est-log]")) { coachLogEstimate(); return; }
    if (t.closest("[data-coach-est-cancel]")) { coachCancelEstimate(); return; }
    if (t.closest("[data-coach-viewfeed]")) { state.activeView = "feed"; saveState(); render(); if (typeof loadCommunitiesFromDb === "function") loadCommunitiesFromDb(); return; }
  }

  function onCoachThreadInput(event) {
    const amt = event.target.closest("[data-coach-amt]");
    if (amt) {
      const e = coachDraftEntryById(amt.dataset.coachAmt);
      if (!e) return;
      e.amount = Math.max(0, numberOrDefault(amt.value, 0));
      const row = amt.closest("[data-coach-row]");
      const pill = row && row.querySelector("[data-coach-pill]");
      const resolved = resolveQuickLogRule(e.contextType, e.contextId, e.ruleId);
      if (pill && resolved) {
        const pts = scoring.calculateRule(resolved.rule, e.amount).totalPoints;
        pill.textContent = `${pts >= 0 ? "+" : ""}${formatPoints(pts)} pts`;
        pill.classList.toggle("negative", pts < 0);
        pill.classList.toggle("positive", pts >= 0);
      }
      return;
    }
    const cap = event.target.closest("[data-coach-post-caption]");
    if (cap && coach.post) { coach.post.caption = cap.value.slice(0, ENTRY_MESSAGE_MAX); updateCoachPostSubmitState(); return; }
    const est = event.target.closest("[data-coach-est]");
    if (est && coach.estimate) { coach.estimate[est.dataset.coachEst] = Math.max(0, numberOrDefault(est.value, 0)); return; }
  }

  function onCoachThreadChange(event) {
    const ctx = event.target.closest("[data-coach-ctx]");
    if (ctx) {
      const e = coachDraftEntryById(ctx.dataset.coachCtx);
      if (!e) return;
      const parts = String(ctx.value).split("|");
      const match = buildLoggableRuleCatalog().find((c) => c.contextId === parts[0] && c.id === parts[1]);
      if (match) {
        e.contextType = match.contextType; e.contextId = parts[0]; e.ruleId = parts[1];
        e.isYesNo = match.type === "yesNo";
        if (e.isYesNo) e.amount = 1; else if (!(e.amount > 0)) e.amount = 1;
      }
      coachRenderDraftCard();
      return;
    }
    const fan = event.target.closest("[data-coach-fanout]");
    if (fan && coach.draft) { coach.draft.routeAll = !!fan.checked; return; }
  }

  function renderAddEntryPanel(system) {
    const rules = system.rules.map(scoring.normalizeRule);
    if (!rules.length) return emptyState("Add a scoring rule before adding entries.");
    const context = getActiveScoreContext();
    const values = valuesForScoreContext(context);
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
    // A normal log adds on top (current + amount). A "materialize" (Part B share, composerSourceTag
    // set) just turns the existing synced value into a post — the total doesn't change.
    const previewTotal = composerSourceTag ? currentTotal : currentTotal + amount;
    const previewPercent = progressPercent(previewTotal, goal);
    const isSingleRule = rules.length === 1;
    const options = isSingleRule ? "" : rules.map((item) => `
      <option value="${escapeHtml(item.id)}"${item.id === selectedRule.id ? " selected" : ""}>
        ${escapeHtml(item.label)}
      </option>
    `).join("");
    // One rule → no dropdown to choose from; show it as a label header (icon + name + the
    // system/community it belongs to). Multiple rules keep the picker select.
    const ruleHeader = isSingleRule
      ? `<div class="add-entry-rule-label">
          <span class="add-entry-rule-icon" aria-hidden="true">${draftRuleIcon(selectedRule)}</span>
          <strong>${escapeHtml(selectedRule.label)}</strong>
          ${context.label ? `<span class="add-entry-rule-context">${escapeHtml(context.label)}</span>` : ""}
        </div>`
      : `<label class="wide-entry-field">
          <span>Metric/rule</span>
          <select data-add-entry-rule aria-label="Choose metric to add">${options}</select>
        </label>`;

    const viaNote = REAL_WEARABLE_SOURCES.has(composerSourceTag)
      ? `<p class="add-entry-ai-note"><span aria-hidden="true">⌚</span> From ${escapeHtml(wearableShortLabel(composerSourceTag))} — add a photo &amp; caption, then post.</p>`
      : "";
    return `
      <div class="add-entry-card" data-add-entry-card>
        ${aiPrefilledComposer ? `<p class="add-entry-ai-note"><span aria-hidden="true">✨</span> AI filled this in — review, add a photo/caption, and post.</p>` : viaNote}
        ${ruleHeader}
        ${renderAddEntrySourceNotice(selectedRule)}
        <div class="add-entry-progress-grid">
          <div class="add-entry-progress-card">
            <span class="entry-preview-label">Current progress</span>
            <strong data-add-current-line>${escapeHtml(formatAddEntryProgressLine(selectedRule, currentTotal))}</strong>
            <span data-add-current-percent>${escapeHtml(formatPercent(displayCompletionPercent(currentPercent)))} complete</span>
            <div class="mini-progress-track" aria-hidden="true">
              <div class="mini-progress-fill${currentPercent > 100 ? " over-goal" : ""}" data-add-current-fill style="width:${Math.min(currentPercent, 100)}%"></div>
            </div>
          </div>
          <div class="add-entry-progress-card preview">
            <span class="entry-preview-label">After adding</span>
            <strong data-add-preview-line>${escapeHtml(formatAddEntryProgressLine(selectedRule, previewTotal))}</strong>
            <span data-add-preview-percent>${escapeHtml(formatPercent(displayCompletionPercent(previewPercent)))} complete</span>
            <div class="mini-progress-track" aria-hidden="true">
              <div class="mini-progress-fill${previewPercent > 100 ? " over-goal" : ""}" data-add-preview-fill style="width:${Math.min(previewPercent, 100)}%"></div>
            </div>
          </div>
        </div>
        ${renderAddEntryAmountControl(selectedRule, amount)}
        ${renderEntryAttachControls()}
        <button class="primary-button add-entry-submit${selectedRule.inputMethod === "toggle" ? " add-entry-markdone" : ""}" type="button" data-add-entry-button>
          <span data-add-entry-button-label>${escapeHtml(addEntryButtonLabel(selectedRule, amount))}</span>
        </button>
      </div>
    `;
  }

  // Optional message + photo attach control for the Add Entry panel. Both optional, and tucked
  // behind a collapsed "＋ Add a photo or note" accordion so the default path is just amount → Post.
  // Stays expanded when something is already attached (so a re-render doesn't hide your work).
  function renderEntryAttachControls() {
    const msg = addEntryAttachment.message || "";
    const hasDetails = Boolean(msg) || Boolean(addEntryAttachment.previewUrl);
    const photo = addEntryAttachment.previewUrl
      ? `<div class="entry-photo-preview">
           <img src="${escapeHtml(addEntryAttachment.previewUrl)}" alt="Attached photo preview">
           <button type="button" class="entry-photo-remove" data-entry-photo-remove aria-label="Remove photo">×</button>
         </div>`
      : `<div class="entry-photo-attach">
           <button type="button" class="entry-photo-add" data-entry-photo-add><span aria-hidden="true">+</span><span>Add photo</span></button>
           <div class="entry-photo-menu" data-entry-photo-menu hidden>
             <button type="button" data-entry-photo-pick="camera">Take photo</button>
             <button type="button" data-entry-photo-pick="library">Choose from library</button>
           </div>
         </div>`;
    return `
      <details class="entry-details"${hasDetails ? " open" : ""}>
        <summary class="entry-details-summary">
          <span>＋ Add a photo or note</span>
          <span class="entry-details-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="entry-attach">
          <label class="entry-message-field">
            <span>Add a note (optional)</span>
            <textarea data-entry-message maxlength="${ENTRY_MESSAGE_MAX}" rows="2" placeholder="What happened? (optional)">${escapeHtml(msg)}</textarea>
            <span class="entry-message-count" data-entry-message-count>${msg.length}/${ENTRY_MESSAGE_MAX}</span>
          </label>
          ${photo}
          <input type="file" accept="image/*" capture="environment" data-entry-photo-input="camera" hidden>
          <input type="file" accept="image/*" data-entry-photo-input="library" hidden>
        </div>
      </details>
    `;
  }

  function resetAddEntryAttachment() {
    if (addEntryAttachment.previewUrl) {
      try { URL.revokeObjectURL(addEntryAttachment.previewUrl); } catch (e) { /* ignore */ }
    }
    addEntryAttachment = { message: "", file: null, previewUrl: "" };
  }

  // Re-render just the Add Entry panel (to reflect a photo preview add/remove) and
  // re-bind its controls, without disturbing the rest of the view.
  function refreshAddEntryPanel() {
    const system = getActiveScoreContext().system;
    if (!system || !els.dailyInputList) return;
    els.dailyInputList.innerHTML = renderAddEntryPanel(system);
    bindDailyInputs();
  }

  function chooseEntryPhoto(file) {
    if (!file) return;
    if (!/^image\//i.test(file.type || "")) {
      showToast("That's not an image — choose a photo");
      return;
    }
    if (file.size > ENTRY_PHOTO_MAX_BYTES) {
      showToast("Photo is too big (max 5 MB) — pick a smaller one");
      return;
    }
    if (addEntryAttachment.previewUrl) {
      try { URL.revokeObjectURL(addEntryAttachment.previewUrl); } catch (e) { /* ignore */ }
    }
    addEntryAttachment.file = file;
    addEntryAttachment.previewUrl = URL.createObjectURL(file);
    refreshAddEntryPanel();
  }

  // ── Displaying an entry's optional message + photo ──────────────────────────
  // The photo thumbnail loads a short-lived signed URL; Storage policy denies it
  // (→ "") to viewers who can't see the entry, so visibility is enforced server-side.
  function renderEntryAttachmentMarkup(entry) {
    if (!entry) return "";
    const message = entry.message ? String(entry.message) : "";
    const path = entry.photoPath || entry.photo_path || "";
    if (!message && !path) return "";
    const msgHtml = message ? `<p class="entry-message">${escapeHtml(message)}</p>` : "";
    const photoHtml = path
      ? `<button type="button" class="entry-photo-thumb" data-entry-photo="${escapeHtml(path)}" aria-label="View attached photo"><img alt="Entry photo" loading="lazy"></button>`
      : "";
    return `<div class="entry-attachment">${msgHtml}${photoHtml}</div>`;
  }

  function bindEntryPhotos(root) {
    if (!root || !window.PointwellSignals || typeof window.PointwellSignals.getEntryPhotoSignedUrl !== "function") return;
    Array.from(root.querySelectorAll("[data-entry-photo]")).forEach((thumb) => {
      if (thumb.dataset.photoBound === "1") return;
      thumb.dataset.photoBound = "1";
      const path = thumb.dataset.entryPhoto;
      const img = thumb.querySelector("img");
      Promise.resolve(window.PointwellSignals.getEntryPhotoSignedUrl(path)).then((url) => {
        if (!url) { thumb.classList.add("is-unavailable"); if (img) img.alt = "Photo unavailable"; return; }
        if (img) img.src = url;
        // Don't hijack the tap when the photo sits inside a post-open tile/card (profile grid +
        // list) — let the click bubble so the tile opens the full post via openEntryPost. Photos
        // elsewhere (feed cards) keep the open-in-new-tab affordance.
        if (!thumb.closest("[data-profile-post]")) {
          thumb.addEventListener("click", () => { try { window.open(url, "_blank", "noopener"); } catch (e) { /* ignore */ } });
        }
      }).catch(() => { thumb.classList.add("is-unavailable"); });
    });
  }

  function renderAddEntrySourceNotice(rule) {
    if (!isRuleSynced(rule)) return "";
    const source = rule.dataSource;
    const value = syncedValueForRule(rule, { userId: "me", date: todayIso, scope: getActiveScoreContext().type });
    const status = value === null ? "Not connected" : `${formatValue(value)} ${rule.unit} synced today`;
    const action = rule.allowManualOverride === false ? "Manual logging is off for this rule." : "Logging here adds on top of today's synced value.";
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
    // Yes/no rules have no amount to pick — the "✓ Mark done" submit button is the whole control.
    if (rule.inputMethod === "toggle") return "";

    // Counter rules get ONE control: a big, tap-friendly −/value/+ stepper. The value itself is a
    // number input, so tapping it lets you type a precise amount; the buttons step by one unit.
    const settings = entrySliderSettings(rule);
    const safeAmount = clampToRange(amount, settings.min, settings.max);
    return `
      <div class="add-entry-control">
        <div class="add-entry-stepper">
          <button class="stepper-btn" type="button" data-add-entry-step="-1" aria-label="Decrease ${escapeHtml(rule.label)}">−</button>
          <label class="stepper-value">
            <input data-add-entry-amount class="stepper-input" type="number" inputmode="decimal" aria-label="${escapeHtml(rule.label)} amount" min="${escapeHtml(String(settings.min))}" max="${escapeHtml(String(settings.max))}" step="${escapeHtml(String(settings.step))}" value="${escapeHtml(String(safeAmount))}">
            <span class="stepper-unit">${escapeHtml(rule.unit)}</span>
          </label>
          <button class="stepper-btn" type="button" data-add-entry-step="1" aria-label="Increase ${escapeHtml(rule.label)}">+</button>
        </div>
      </div>
    `;
  }

  // The submit button's label — "✓ Mark done" for yes/no rules (the button IS the toggle), or
  // "Post <value> <unit> <rule>" for counters. Shared by the initial render and the live preview
  // update. (How a synced-rule log combines with the synced value is conveyed by the source
  // notice, not a button suffix.)
  function addEntryButtonLabel(rule, amount) {
    if (rule.inputMethod === "toggle") return "✓ Mark done";
    return `Post ${formatMetricPhrase(amount, rule.unit, rule.label)}`;
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
    aiPrefilledComposer = false; // user picked a different rule → drop the AI-filled note
    composerSourceTag = "";      // ...and the "via Fitbit" tag no longer applies
    addEntryDraft = { ruleId, amount: suggestedEntryAmount(rule) };
    els.dailyInputList.innerHTML = renderAddEntryPanel(system);
    bindDailyInputs();
  }

  // −/+ stepper: nudge the draft amount by one unit-step, then reuse the shared sync so the
  // number input and the live preview update exactly as typing would.
  function stepAddEntryAmount(direction) {
    const system = getActiveScoreContext().system;
    const rule = system?.rules.map(scoring.normalizeRule).find((item) => item.id === addEntryDraft.ruleId);
    if (!rule || rule.inputMethod === "toggle") return;
    const settings = entrySliderSettings(rule);
    syncAddEntryAmount(numberOrDefault(addEntryDraft.amount, 0) + direction * settings.step, null);
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
    const context = getActiveScoreContext();
    const currentTotal = numberOrDefault(valuesForScoreContext(context)[rule.id], 0);
    // A normal log adds on top; a "materialize" (Part B share) leaves the total unchanged.
    const previewTotal = composerSourceTag ? currentTotal : currentTotal + amount;
    const goal = goalAmountForRule(rule);
    const currentPercent = progressPercent(currentTotal, goal);
    const previewPercent = progressPercent(previewTotal, goal);
    setText("[data-add-current-line]", formatAddEntryProgressLine(rule, currentTotal));
    setText("[data-add-current-percent]", `${formatPercent(displayCompletionPercent(currentPercent))} complete`);
    setText("[data-add-preview-line]", formatAddEntryProgressLine(rule, previewTotal));
    setText("[data-add-preview-percent]", `${formatPercent(displayCompletionPercent(previewPercent))} complete`);
    setWidth("[data-add-current-fill]", currentPercent);
    setWidth("[data-add-preview-fill]", previewPercent);
    setText("[data-add-entry-button-label]", addEntryButtonLabel(rule, amount));
  }

  async function addDailyEntryFromDraft(opts) {
    opts = opts || {};
    const context = getActiveScoreContext();
    const system = context.system;
    if (!system) return;
    const rule = system.rules.map(scoring.normalizeRule).find((item) => item.id === addEntryDraft.ruleId);
    if (!rule) return;
    if (isRuleSynced(rule) && rule.allowManualOverride === false) {
      showToast("Manual logging is off for this rule");
      return;
    }
    const amount = normalizeAddEntryAmount(addEntryDraft.amount, rule);
    if (!amount) {
      showToast("Choose an amount to add");
      return;
    }

    // A synced-entry/workout → post upgrade tags the saved entry so the feed card shows a
    // small "via Fitbit" badge. Only real wearable providers qualify.
    const viaSource = REAL_WEARABLE_SOURCES.has(composerSourceTag) ? composerSourceTag : "";

    // Optional message + photo. Both optional; logging with neither is unchanged.
    const message = (addEntryAttachment.message || "").trim().slice(0, ENTRY_MESSAGE_MAX);
    let photoPath = "";
    if (addEntryAttachment.file) {
      const uid = state.account && state.account.userId;
      if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.uploadEntryPhoto !== "function") {
        showToast("Sign in to attach photos — saving the log without it");
      } else {
        const folder = context.type === "community" ? `${context.community.id}/${uid}` : `personal/${uid}`;
        const up = await window.PointwellSignals.uploadEntryPhoto(addEntryAttachment.file, folder);
        // Upload failure must not lose the log — save it without the photo.
        if (up.error || !up.path) showToast("Couldn't upload the photo — saved the log without it");
        else photoPath = up.path;
      }
    }

    if (context.type === "community") {
      addCommunityEntry(context.community.id, "me", rule, amount, isRuleSynced(rule) ? "manual-adjustment" : "manual", message, photoPath, viaSource);
      saveCommunitySummaryForMember(context.community, "me");
      // Persist to the shared DB just like the community check-in button does, so a
      // dashboard "Add Entry" survives navigation / reload / other members. Surface
      // the real error if the write is rejected instead of keeping it device-local.
      const dbCommunity = context.community;
      const dbRuleId = rule.id;
      Promise.resolve(pushCommunityEntryToDb(dbCommunity, dbRuleId, message, photoPath)).then((result) => {
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
        message,
        photoPath,
        source: isRuleSynced(rule) ? "manual-adjustment" : "manual",
        viaSource
      });
      syncDraftInputsFromEntries(system);
      autoSaveToday(system);
    }
    if (!viaSource) rebaselineRuleSync(rule); // hand log → device counts from here on
    addEntryDraft = { ruleId: rule.id, amount: suggestedEntryAmount(rule) };
    resetAddEntryAttachment();
    aiPrefilledComposer = false;
    composerSourceTag = "";
    // One-tap logging from a rule card stays on the current view (so the card animates to its
    // logged state); the full Add Entry form returns to the dashboard as before.
    if (!opts.stayInView) state.activeView = "dashboard";
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
    if (els.scoreHeroContext) els.scoreHeroContext.textContent = context.label || "Today";
    const values = collectDraftValues(system, valuesForScoreContext(context));
    const summary = calculateDashboardSummary(system, values, context);

    renderDailyTargetProgress(summary.total, summary.target.total);
    renderScoreNudge(context);
    renderMiniLeaderboard(context);
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

  // Rules that are "active" today (scored even with no manual entry): hand-logged rules, plus
  // calculated rules with a value, plus device rules that have a logged increment.
  function entryRuleIdsForToday(system) {
    const systemId = typeof system === "string" ? system : system?.id;
    const ids = new Set(getQuickEntriesForToday(systemId).map((entry) => entry.ruleId));
    (system?.rules || []).map(scoring.normalizeRule).forEach((rule) => {
      if (syncedContribution(rule, { userId: "me", date: todayIso }) > 0) ids.add(rule.id);
    });
    return ids;
  }

  function communityEntryRuleIdsForToday(communityId, userId) {
    const ids = new Set(getCommunityEntriesForMemberToday(communityId, userId).map((entry) => entry.ruleId));
    const community = state.communities.find((item) => item.id === communityId);
    (community?.system?.rules || []).map(scoring.normalizeRule).forEach((rule) => {
      if (syncedContribution(rule, { userId, date: todayIso }) > 0) ids.add(rule.id);
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
    const formatted = formatCount(value);
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
    // A normal manual log ADDS on top of the synced value, so both rows show and both count.
    // But a "materialized" post (viaSource) already represents the synced value, so its rule's
    // synced base is dropped from scoring — drop the synced pseudo-row too so it isn't a phantom.
    const materializedRuleIds = new Set(manualEntries.filter((entry) => entry.viaSource).map((entry) => entry.ruleId));
    const entries = [
      ...syncedEntriesForContext(context, system).filter((entry) => !materializedRuleIds.has(entry.ruleId)),
      ...manualEntries
    ];
    const ruleMap = new Map(system.rules.map((item) => {
      const rule = scoring.normalizeRule(item);
      return [rule.id, rule];
    }));
    const contextId = context.type === "community" ? context.community.id : system.id;
    const body = entries.length
      ? entries.map((entry) => {
          const rule = ruleMap.get(entry.ruleId);
          return renderQuickEntryRow(entry, rule, context.type, contextId);
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
    Array.from(els.scoreBreakdown.querySelectorAll("[data-upgrade-synced]")).forEach((button) => {
      button.addEventListener("click", () => upgradeSyncedEntryToPost(
        button.dataset.upgradeCtxType,
        button.dataset.upgradeCtxId,
        button.dataset.upgradeSynced,
        button.dataset.upgradeAmount,
        button.dataset.upgradeSource
      ));
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

  function renderQuickEntryRow(entry, rule, source = "personal", contextId = "") {
    const text = entryLogText(entry, rule);
    const isReadOnly = entry.source === "synced" || entry.source === "calculated";
    const attr = source === "community"
      ? `data-delete-community-entry="${escapeHtml(entry.id)}"`
      : `data-delete-quick-entry="${escapeHtml(entry.id)}"`;
    const sourceLabel = entrySourceLabel(entry, rule);
    const attach = renderEntryAttachmentMarkup(entry);
    // A live synced wearable value can be turned into a full feed post (photo + caption) —
    // only when the rule allows a manual post (otherwise the composer's Post would block).
    const canUpgrade = entry.source === "synced" && REAL_WEARABLE_SOURCES.has(entry.dataSource)
      && rule && rule.allowManualOverride !== false;
    const upgradeBtn = canUpgrade
      ? `<button class="ghost-button small entry-upgrade-button" type="button" data-upgrade-synced="${escapeHtml(entry.ruleId)}" data-upgrade-ctx-type="${escapeHtml(source)}" data-upgrade-ctx-id="${escapeHtml(contextId)}" data-upgrade-amount="${escapeHtml(String(entry.amount))}" data-upgrade-source="${escapeHtml(entry.dataSource || "")}">Add photo &amp; caption</button>`
      : "";
    const viaBadge = REAL_WEARABLE_SOURCES.has(entry.viaSource)
      ? `<span class="via-source-tag">via ${escapeHtml(wearableShortLabel(entry.viaSource))}</span>`
      : "";
    const rightSide = isReadOnly
      ? `<div class="entry-row-actions">${upgradeBtn}<span class="tracking-pill">${escapeHtml(entry.source === "calculated" ? "Calculated" : "Synced")}</span></div>`
      : `<button class="ghost-button small" type="button" ${attr}>Delete</button>`;
    return `
      <div class="entry-log-row quick-entry-row${attach ? " has-attach" : ""}">
        <div class="entry-log-main">
          <strong>${escapeHtml(text)}${viaBadge}</strong>
          <span>${escapeHtml(sourceLabel)}</span>
        </div>
        ${rightSide}
        ${attach}
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
    if (rule?.inputMethod === "toggle" || unit === "done") return label;
    return formatMetricPhrase(entry.amount, unit, label);
  }

  // Comma-grouped count for display ("13253" → "13,253"). Never use where the string is parsed back.
  function formatCount(value) {
    const num = Number(value || 0);
    const rounded = Number.isInteger(num) ? num : Math.round(num * 100) / 100;
    return rounded.toLocaleString("en-US");
  }

  // "{comma value} {unit} {name}" — the shared metric phrasing for device nudges, activity/leaderboard
  // rows and the post button. Drops a name that merely echoes the unit (fixes "8,500 steps steps" /
  // "steps Steps") but keeps a distinct one ("1,500 reps Pushups"). Compact units (g/kg/oz…) hug the
  // number. Pass label "" for the name-less variant ("8,500 steps").
  function formatMetricPhrase(value, unit, label) {
    const grouped = formatCount(value);
    const u = String(unit || "").trim();
    const l = String(label || "").trim();
    if (!u) return l ? `${grouped} ${l}` : grouped;
    const compact = new Set(["g", "mg", "kg", "oz", "lb"]);
    const valueUnit = compact.has(u.toLowerCase()) ? `${grouped}${u}` : `${grouped} ${u}`;
    if (!l || l.toLowerCase() === u.toLowerCase()) return valueUnit;
    return `${valueUnit} ${l}`;
  }

  // Clean one-line metric for a logged-progress feed post: "{value} {unit}" with the number
  // comma-grouped and NO trailing rule name. Yes/no or unit-less entries → just the label.
  function entryMetricText(entry, rule) {
    const unit = (rule && rule.unit) || entry.unit || "";
    const label = (rule && rule.label) || entry.label || "Entry";
    if ((rule && rule.inputMethod === "toggle") || unit === "done" || !unit) return label;
    return formatMetricPhrase(entry.amount, unit, "");
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
    // Compact strip: ring center shows points/target ("1/3"); the SVG arc fills by
    // percent; the status line reads "1 of 3 points · 2 to go".
    els.liveScore.textContent = `${formatPoints(total)}/${formatPoints(target)}`;
    const clampedPercent = Math.min(Math.max(percent, 0), 100);
    if (els.scoreRingFill) els.scoreRingFill.style.strokeDashoffset = String(100 - clampedPercent);
    if (els.scoreHeroBarFill) els.scoreHeroBarFill.style.width = `${clampedPercent}%`;
    els.dailyStatusLabel.textContent = target > 0
      ? (remaining > 0
          ? `${formatPoints(total)} of ${formatPoints(target)} points · ${formatPoints(remaining)} to go`
          : "Daily point goal reached")
      : "Add positive scoring rules to set a daily target";
  }

  // Subtle social nudge under the progress bar: the top OTHER member's points today
  // in the community being logged to. Uses only the leaderboard standing already
  // visible to members. Personal context (or no leader) → nothing.
  function renderScoreNudge(context) {
    if (!els.scoreNudge) return;
    let text = "";
    if (context && context.type === "community" && context.community && Array.isArray(context.community.members)) {
      // Only when this community's leaderboard module is shown to members — never
      // surface standings the owner has hidden (defaults to on when unset).
      const modules = (context.community.analytics && context.community.analytics.modules) || {};
      if (modules.leaderboard !== false) {
        const me = state.account && state.account.userId;
        const standings = communityStandings(context.community, state.communityLeaderboardPeriod || "weekly", "points");
        const leader = standings
          .filter((m) => m.id !== "me" && String(m.userId || "") !== String(me || "") && m.today > 0)
          .sort((a, b) => b.today - a.today)[0];
        if (leader) text = `${memberFirstName(leader)}’s already at ${formatPoints(leader.today)}`;
      }
    }
    els.scoreNudge.textContent = text;
    els.scoreNudge.hidden = !text;
  }

  // Inline mini leaderboard on the dashboard — only under a community context, and
  // only when this community's leaderboard module is shown to members. Reuses
  // communityStandings(); shows the top 3 by today's points with my row highlighted.
  function renderMiniLeaderboard(context) {
    if (!els.miniLeaderboard) return;
    const community = context && context.type === "community" ? context.community : null;
    const modules = (community && community.analytics && community.analytics.modules) || {};
    if (!community || !Array.isArray(community.members) || modules.leaderboard === false) {
      els.miniLeaderboard.hidden = true;
      els.miniLeaderboard.innerHTML = "";
      return;
    }
    const period = COMMUNITY_PERIODS.some((p) => p.id === state.communityLeaderboardPeriod)
      ? state.communityLeaderboardPeriod
      : COMMUNITY_PERIODS[0].id;
    const top = communityStandings(community, period, "points")
      .slice()
      .sort((a, b) => b.today - a.today)
      .slice(0, 3);
    els.miniLeaderboard.hidden = false;
    els.miniLeaderboard.innerHTML = `
      <div class="panel-heading">
        <h3>Standings · ${escapeHtml(community.name)}</h3>
        <button class="link-button mini-lb-full" type="button" data-open-full-leaderboard>Full leaderboard ›</button>
      </div>
      <div class="mini-lb-list">${top.map(renderMiniLeaderboardRow).join("")}</div>
    `;
  }

  function renderMiniLeaderboardRow(member, index) {
    const isMe = member.id === "me";
    const pts = numberOrDefault(member.today, 0);
    // Whole row is a button → that member's breakdown in this community (existing
    // community-member view; scoped to a shared community, so visibility is preserved).
    return `
      <button class="mini-lb-row mini-lb-row-button${isMe ? " is-me" : ""}" type="button" data-community-member-id="${escapeHtml(member.id)}">
        <span class="mini-lb-rank">${index + 1}</span>
        ${renderAvatar({ className: "member-avatar mini-lb-avatar", name: member.name, color: member.color || "#355d91", avatarUrl: member.avatarUrl })}
        <span class="mini-lb-name">${isMe ? "You" : escapeHtml(member.name)}</span>
        <span class="mini-lb-points">${escapeHtml(formatPoints(pts))} ${pts === 1 ? "pt" : "pts"}</span>
        <span class="mini-lb-chevron" aria-hidden="true">›</span>
      </button>
    `;
  }

  // Collapsed analytics: one toggle row reveals/hides the detail panels (insight,
  // Top Card, Visual Breakdown, Weekly Progress, entries log). Persisted in state.
  function renderDashboardAnalyticsToggle() {
    const open = Boolean(state.dashboardAnalyticsOpen);
    if (els.dashboardAnalytics) els.dashboardAnalytics.hidden = !open;
    if (els.analyticsToggle) els.analyticsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toggleDashboardAnalytics() {
    state.dashboardAnalyticsOpen = !state.dashboardAnalyticsOpen;
    saveState();
    renderDashboardAnalyticsToggle();
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
          <button class="ghost-button small" type="button" data-turn-community-id="${escapeHtml(system.id)}">Invite people</button>
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
    const activeToday = communityActiveTodayCount(community);
    const category = community.category || communityDescriptionLine(community);
    return `
      <button class="community-card" type="button" data-community-id="${escapeHtml(community.id)}">
        <div class="community-card-top">
          <strong class="community-card-name">${escapeHtml(community.name)}</strong>
          <span class="visibility-pill ${visibility === "request_to_join" ? "request" : escapeHtml(visibility)}">${escapeHtml(visibilityLabel(visibility))}</span>
        </div>
        <span class="community-meta">${plural(getCommunityMemberCount(community), "member")} · ${escapeHtml(category)}</span>
        <div class="community-card-social">
          ${renderCommunityAvatarCluster(community)}
          <span class="community-card-activity${activeToday > 0 ? " is-live" : ""}">${activeToday > 0 ? `● ${activeToday} active today` : "No activity today"}</span>
        </div>
        <span class="community-score-line">Your score today: ${escapeHtml(formatPoints(myScore))}</span>
      </button>
    `;
  }

  // Stacked initials-avatars (reuses .member-avatar) + a "+N" chip when there are
  // more members than we show. Derived entirely from the local member list.
  function renderCommunityAvatarCluster(community) {
    const members = Array.isArray(community.members) ? community.members : [];
    const total = getCommunityMemberCount(community);
    const shown = members.slice(0, total <= 3 ? 3 : 2);
    const extra = Math.max(total - shown.length, 0);
    const avatars = shown
      .map((member) => renderAvatar({ className: "member-avatar community-cluster-avatar", name: member.name, color: member.color || "#355d91", avatarUrl: member.avatarUrl }))
      .join("");
    const more = extra > 0
      ? `<span class="member-avatar community-cluster-avatar community-cluster-more" aria-hidden="true">+${extra}</span>`
      : "";
    return `<div class="community-cluster">${avatars}${more}</div>`;
  }

  // Dormant communities render as compact rows: "<name>  <N> members · <visibility>  No activity".
  function renderCommunityInactiveRow(community) {
    const visibility = communityVisibility(community);
    return `
      <button class="community-row" type="button" data-community-id="${escapeHtml(community.id)}">
        <span class="community-row-name">${escapeHtml(community.name)}</span>
        <span class="community-row-meta">${plural(getCommunityMemberCount(community), "member")} · ${escapeHtml(visibilityLabel(visibility))}</span>
        <span class="community-row-status">No activity</span>
      </button>
    `;
  }

  // How many members logged points today — drives the "● N active today" cue.
  function communityActiveTodayCount(community) {
    const members = Array.isArray(community.members) ? community.members : [];
    return members.reduce((count, member) => count + (communityTotalForMember(community, member.id, todayIso) > 0 ? 1 : 0), 0);
  }

  // Dormant = nobody active today AND a tiny membership (1–2). Matches the reference,
  // where small no-activity communities sit under the INACTIVE heading.
  function communityIsDormant(community) {
    return communityActiveTodayCount(community) === 0 && getCommunityMemberCount(community) <= 2;
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
    // The active search query across any surface (header / Build / old find), for code matches.
    const query = String(state.searchQuery || state.buildSearchQuery || state.communitySearchQuery || "").trim().toLowerCase();
    const codeMatch = query && String(community.inviteCode || "").toLowerCase() === query;
    // Already a member → "Open" the community; otherwise Join / Request / Join with Code.
    const action = joined
      ? `<button class="ghost-button small" type="button" data-open-community-detail-id="${escapeHtml(community.id)}">Open</button>`
      : `<button class="${isPrivate ? "secondary-button" : "primary-button"} small" type="button" data-join-community-id="${escapeHtml(community.id)}">${escapeHtml(codeMatch ? "Join with Code" : (isPrivate ? "Request to Join" : "Join"))}</button>`;
    return `
      <article class="find-community-card">
        <div class="find-community-main">
          <strong>${escapeHtml(community.name)}</strong>
          <span class="community-meta">${escapeHtml(community.category)} · ${plural(getCommunityMemberCount(community), "member")}</span>
          <p>${escapeHtml(community.description || "")}</p>
        </div>
        ${action}
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
          ${renderAvatar({ name: memberStanding.name, color: memberStanding.color, avatarUrl: memberStanding.avatarUrl })}
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
        openMemberProfile(getSelectedCommunity(), button.dataset.communityMemberId);
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
    // Newest entry first (timestamps shown per row below).
    const memberItemManual = getCommunityEntriesForMemberOnDate(community.id, memberItem.id, todayIso);
    const memberItemMaterializedRuleIds = new Set(memberItemManual.filter((entry) => entry.viaSource).map((entry) => entry.ruleId));
    const entries = [
      ...syncedEntriesForContext({ type: "community", community }, community.system, { userId: memberItem.id }).filter((entry) => !memberItemMaterializedRuleIds.has(entry.ruleId)),
      ...memberItemManual
    ].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
    const target = calculateTargetSummary(community.system).total;
    const percent = progressPercent(summary.total, target);
    // This member's rank today within the community standings (sorted by today's points).
    const standings = communityStandings(community, COMMUNITY_PERIODS[0].id, "points")
      .slice()
      .sort((a, b) => b.today - a.today);
    const rank = standings.findIndex((item) => item.id === memberItem.id) + 1;
    const memberCount = standings.length;
    els.memberActivityTitle.textContent = `${memberItem.name.split(" ")[0]}'s Activity`;
    els.memberActivityTotal.textContent = community.name;
    els.memberActivityPanel.innerHTML = `
      <div class="member-dashboard">
        <section class="score-band member-score-band" aria-label="Community Daily Point Total">
          <div class="score-summary">
            <div class="member-dashboard-profile">
              ${renderAvatar({ name: memberItem.name, color: memberItem.color, avatarUrl: memberItem.avatarUrl })}
              <div>
                <span class="score-label">Daily Point Total</span>
                <strong>${escapeHtml(memberItem.name)}</strong>
              </div>
            </div>
            <div class="member-score-line">
              <strong class="member-daily-score">${escapeHtml(formatPoints(summary.total))} / ${escapeHtml(formatPoints(target))} points</strong>
              ${rank ? `<span class="member-rank-pill">Rank #${rank} of ${memberCount}</span>` : ""}
            </div>
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

        ${renderMemberDaySchedule(entries, community)}

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
    bindMemberSchedule(community);
  }

  // Today's Schedule interactions: the "Show full day"/"Show less" toggle, the clickable
  // blocks (each opens its entry's post), and centering the scroll on the now-marker.
  function bindMemberSchedule(community) {
    const panel = els.memberActivityPanel;
    if (!panel) return;
    const toggle = panel.querySelector("[data-toggle-schedule]");
    if (toggle) toggle.addEventListener("click", () => {
      state.scheduleExpanded = !state.scheduleExpanded;
      saveState();
      renderMemberActivity(community);
    });
    Array.from(panel.querySelectorAll("[data-schedule-entry]")).forEach((block) => {
      const open = () => openScheduleEntry(block.dataset.scheduleEntry);
      block.addEventListener("click", open);
      block.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
      });
    });
    // Center the now-marker (matters once expanded to 24h; the windowed view already fits).
    const cal = panel.querySelector(".ds-cal");
    if (cal && cal.dataset.nowTop) {
      cal.scrollTop = Math.max(0, Number(cal.dataset.nowTop) - cal.clientHeight / 2);
    }
  }

  // A schedule block was tapped → open that entry's post in the Feed (reuses openEntryPost
  // → the ig-card with photo/caption/likes/comments). Synced/personal entries (no uuid id,
  // no post) degrade gracefully to a toast instead of erroring.
  function openScheduleEntry(entryId) {
    if (!entryId || !isDbEntryId(entryId)) { showToast("This entry doesn't have a post yet"); return; }
    openEntryPost(entryId);
  }

  // ── Today's Schedule: each of the member's logged entries placed on a
  // time-of-day grid (vertical position = when it was logged, in the viewer's
  // local time; color = which rule). Durations aren't tracked, so each entry is
  // a fixed-size marker; entries logged close together split into side-by-side
  // columns like a calendar day view. Ported from the standings day-view mockup.
  var DAY_SCHEDULE_PALETTE = ["#fa4d56", "#ff832b", "#a56eff", "#4589ff", "#ee5396", "#08bdba", "#33b1ff", "#d2a106", "#3ddbd9", "#6fdc8c", "#ff7eb6", "#82cfff"];
  function dayScheduleColor(key) {
    var s = String(key || ""), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return DAY_SCHEDULE_PALETTE[h % DAY_SCHEDULE_PALETTE.length];
  }
  // Darken a #rrggbb hex toward black by `factor` (0-1), preserving hue. Used for the feed
  // text-post accent bar's bright→dark gradient. Returns the input unchanged if not 6-digit hex.
  function shadeHex(hex, factor) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = Math.round(((n >> 16) & 255) * factor);
    var g = Math.round(((n >> 8) & 255) * factor);
    var b = Math.round((n & 255) * factor);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function dayScheduleClock(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  function renderMemberDaySchedule(entries, community) {
    var HOUR_PX = 40, PX_PER_MIN = HOUR_PX / 60, NOMINAL = 38, MIN_BLOCK = 24;
    var rules = ((community.system && community.system.rules) || []).map(scoring.normalizeRule);
    var ruleById = new Map(rules.map(function (r) { return [r.id, r]; }));
    var marks = [];
    (entries || []).forEach(function (entry) {
      if (!entry || !entry.timestamp) return;
      var d = new Date(entry.timestamp);
      if (isNaN(d.getTime())) return;
      var start = d.getHours() * 60 + d.getMinutes();
      var rule = ruleById.get(entry.ruleId);
      var pts = rule ? numberOrDefault(scoring.calculateRule(rule, numberOrDefault(entry.amount, 0)).totalPoints, 0) : 0;
      var label = (rule && rule.label) || entry.label || "Entry";
      marks.push({
        id: entry.id, key: entry.ruleId || label, label: label, pts: pts,
        s: start, e: Math.min(1440, start + NOMINAL),
        color: dayScheduleColor(entry.ruleId || label)
      });
    });
    marks.sort(function (a, b) { return a.s - b.s || b.e - a.e; });

    // No timestamped activity → compact empty card instead of a tall blank grid.
    if (!marks.length) {
      return '\n      <section class="section-band member-schedule-panel" aria-labelledby="memberScheduleTitle">'
        + '\n        <div class="panel-heading tight"><div>'
        + '\n          <h3 id="memberScheduleTitle">Today’s Schedule</h3>'
        + '\n          <span>your local time</span>'
        + '\n        </div></div>'
        + '\n        <div class="empty-mini">No activities logged today yet.</div>'
        + '\n      </section>\n    ';
    }

    // Default to a compact window around NOW (2h before → 4h after, in the viewer's
    // local time); "Show full day" expands to the whole 24h. state.scheduleExpanded
    // persists the choice. now/nowMin are local (getHours/getMinutes) → "your local time".
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var winStart, winEnd;
    if (state.scheduleExpanded) {
      winStart = 0; winEnd = 1440;
    } else {
      winStart = Math.max(0, nowMin - 120);
      winEnd = Math.min(1440, nowMin + 240);
    }
    // Windowed view only places blocks intersecting the window (so off-window entries
    // don't consume calendar columns); full day shows everything.
    var visMarks = state.scheduleExpanded ? marks.slice() : marks.filter(function (m) { return m.e > winStart && m.s < winEnd; });

    // Column-pack overlapping markers within each cluster.
    var clusters = [], cur = [], cEnd = -Infinity;
    visMarks.forEach(function (x) {
      if (cur.length && x.s >= cEnd) { clusters.push(cur); cur = []; cEnd = -Infinity; }
      cur.push(x); cEnd = Math.max(cEnd, x.e);
    });
    if (cur.length) clusters.push(cur);
    clusters.forEach(function (cl) {
      var colEnd = [];
      cl.forEach(function (x) {
        var c = colEnd.findIndex(function (end) { return end <= x.s; });
        if (c === -1) { c = colEnd.length; colEnd.push(x.e); } else colEnd[c] = x.e;
        x.col = c;
      });
      cl.forEach(function (x) { x.cols = colEnd.length; });
    });

    var trackH = Math.round((winEnd - winStart) * PX_PER_MIN);
    var hours = "";
    for (var h = Math.ceil(winStart / 60); h <= Math.floor(winEnd / 60); h++) {
      hours += '<div class="ds-hour" style="top:' + Math.round((h * 60 - winStart) * PX_PER_MIN) + 'px">' + String(h).padStart(2, "0") + ':00</div>';
    }
    // Each block is a clickable affordance (role=button + chevron) that opens the entry's
    // post in the Feed; data-schedule-entry carries the community_entries id.
    var blocks = visMarks.map(function (m) {
      var top = Math.round((m.s - winStart) * PX_PER_MIN);
      var bh = Math.max(Math.round((m.e - m.s) * PX_PER_MIN), MIN_BLOCK);
      var leftPct = (m.col / m.cols) * 100, widthPct = (1 / m.cols) * 100;
      var ptsText = (m.pts >= 0 ? "+" : "") + formatPoints(m.pts);
      var aria = m.label + " " + ptsText + " at " + dayScheduleClock(m.s) + " — open post";
      return '<div class="ds-block" role="button" tabindex="0" data-schedule-entry="' + escapeHtml(m.id || "") + '" style="--c:' + m.color + ';top:' + top + 'px;height:' + bh + 'px;left:calc(' + leftPct + '% + 2px);width:calc(' + widthPct + '% - 4px)" title="' + escapeHtml(aria) + '" aria-label="' + escapeHtml(aria) + '">'
        + '<span class="ds-bl">' + escapeHtml(m.label) + ' ' + escapeHtml(ptsText) + '</span>'
        + '<span class="ds-bt">' + dayScheduleClock(m.s) + '</span>'
        + '<span class="ds-go" aria-hidden="true">›</span></div>';
    }).join("");

    var seen = {};
    var legend = visMarks.filter(function (m) { if (seen[m.key]) return false; seen[m.key] = 1; return true; })
      .map(function (m) { return '<span class="ds-lg"><span class="ds-sw" style="background:' + m.color + '"></span>' + escapeHtml(m.label) + '</span>'; }).join("");

    var nowTop = Math.round((nowMin - winStart) * PX_PER_MIN);
    var nowLine = (nowMin >= winStart && nowMin <= winEnd)
      ? '<div class="ds-now" style="top:' + nowTop + 'px"><span class="ds-now-lab">' + dayScheduleClock(nowMin) + '</span></div>'
      : "";
    var body = visMarks.length ? '<div class="ds-events">' + blocks + '</div>' : '<div class="ds-empty">Nothing around now — tap “Show full day”.</div>';
    var toggle = '<button type="button" class="ds-toggle" data-toggle-schedule aria-expanded="' + (state.scheduleExpanded ? "true" : "false") + '">' + (state.scheduleExpanded ? "Show less" : "Show full day") + '</button>';

    return '\n      <section class="section-band member-schedule-panel" aria-labelledby="memberScheduleTitle">'
      + '\n        <div class="panel-heading tight"><div>'
      + '\n          <h3 id="memberScheduleTitle">Today’s Schedule</h3>'
      + '\n          <span>' + escapeHtml(plural(marks.length, "activity")) + ' · your local time</span>'
      + '\n        </div>' + toggle + '</div>'
      + (legend ? '\n        <div class="ds-legend">' + legend + '</div>' : "")
      + '\n        <div class="ds-cal" data-now-top="' + nowTop + '" style="--ds-hour:' + HOUR_PX + 'px">'
      + '\n          <div class="ds-hours">' + hours + '</div>'
      + '\n          <div class="ds-track" style="height:' + trackH + 'px">' + nowLine + body + '</div>'
      + '\n        </div>'
      + '\n      </section>\n    ';
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
    const overGoal = percent > 100;
    const progressLine = [
      `${formatValue(item.value)} / ${formatValue(goal || 0)} ${rule.unit}`,
      `${formatPercent(percent)} complete`,
      pointEarnedText(item.totalPoints),
      shortRuleValueSourceLabel(rule)
    ].join(" · ");
    // Over goal: keep the bar full (fill capped at 100%) and show the real overage as a
    // distinct over-goal label, e.g. "+4 · 300% of goal" — never an overflowing bar.
    const percentLabel = overGoal
      ? `+${escapeHtml(formatValue(item.value - goal))} · ${escapeHtml(formatPercent(percent))} of goal`
      : escapeHtml(formatPercent(percent));
    return `
      <div class="rule-progress-card">
        <div class="rule-progress-main">
          <div class="rule-progress-metric">
            <strong>${escapeHtml(rule.label)}</strong>
            <span>${escapeHtml(progressLine)}</span>
          </div>
          <span class="rule-progress-percent${overGoal ? " over-goal" : ""}">${percentLabel}</span>
        </div>
        <div class="mini-progress-track" aria-hidden="true">
          <div class="mini-progress-fill${overGoal ? " over-goal" : ""}" style="width:${Math.min(percent, 100)}%"></div>
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
    const points = rule ? scoring.calculateRule(rule, entry.amount).totalPoints : 0;
    const when = entry.timestamp || entry.dateKey || entry.date || "";
    const rel = (window.PointwellSignals && typeof window.PointwellSignals.formatRelativeTime === "function")
      ? (window.PointwellSignals.formatRelativeTime(when, Date.now()) || "")
      : "";
    const relText = rel ? (rel === "just now" ? "just now" : `${rel} ago`) : "";
    const attach = renderEntryAttachmentMarkup(entry);
    return `
      <div class="entry-log-row member-entry-row${attach ? " has-attach" : ""}">
        <div class="entry-log-main">
          <strong>${escapeHtml(memberEntryText(entry, rule))}</strong>
          <span>${escapeHtml(entrySourceLabel(entry, rule))}</span>
        </div>
        <div class="member-entry-meta">
          <span class="member-entry-points">${points >= 0 ? "+" : ""}${escapeHtml(formatPoints(points))} pts</span>
          ${relText ? `<span class="member-entry-time">${escapeHtml(relText)}</span>` : ""}
        </div>
        ${attach}
      </div>
    `;
  }

  function memberEntryText(entry, rule) {
    const label = rule?.label || entry.label || "Entry";
    const unit = rule?.unit || entry.unit || "units";
    if (rule?.inputMethod === "toggle" || unit === "done") return `${label} completed`;
    if (Number(entry.amount) === 1 && String(unit).toLowerCase().startsWith("session")) return `${label} completed`;
    return formatMetricPhrase(entry.amount, unit, label);
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
    // Confirm — deleting a system also removes its logged entries.
    if (typeof confirm === "function" && !confirm(`Delete "${selected.title || "this reward system"}"? This can't be undone.`)) return;
    state.systems = state.systems.filter((system) => system.id !== selected.id);
    state.entries = state.entries.filter((entry) => entrySystemId(entry) !== selected.id);
    state.quickEntries = (state.quickEntries || []).filter((entry) => entrySystemId(entry) !== selected.id);
    state.selectedSystemId = state.systems[0]?.id || "";
    state.trackerSystemId = state.systems[0]?.id || "";
    state.systemSetupStep = 0;
    state.systemEditorOpen = false;
    saveState();
    syncMyPublicSystems(); // prune the deleted system from the server if it was public
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
    syncMyPublicSystems(); // publish/unpublish to match the system's new visibility
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
    if (source === "calculated") {
      if (text.includes("workout") || text.includes("exercise")) return "workout-minutes";
      if (text.includes("spend")) return "net-spending";
      return "total-calories";
    }
    if (source === "google-health") {
      if (text.includes("sleep")) return "sleep-hours";
      if (text.includes("resting") || text.includes("heart")) return "resting-heart-rate";
      if (text.includes("calorie")) return "active-calories";
      return "steps";
    }
    if (source === "whoop") {
      if (text.includes("sleep performance")) return "sleep-performance";
      if (text.includes("sleep")) return "sleep-hours";
      if (text.includes("recovery")) return "recovery";
      if (text.includes("hrv")) return "hrv";
      if (text.includes("strain")) return "strain";
      if (text.includes("calorie")) return "calories";
      if (text.includes("resting") || text.includes("heart")) return "resting-heart-rate";
      return "recovery";
    }
    return "manual";
  }

  function ruleSourceHelpText(source, metric) {
    if (source === "manual") return "Manual rules use Add Entry.";
    if (source === "calculated") return `${sourceMetricLabel(source, metric)} is calculated from other tracked values.`;
    // Only real wearables (Fitbit / Whoop) remain as synced sources.
    const status = integrationStatus(source);
    const connection = status === "connected"
      ? "Connected — syncs live from your device."
      : `Connect ${dataSourceLabel(source)} in Profile to sync this automatically.`;
    return `${sourceMetricLabel(source, metric)} updates from your ${dataSourceLabel(source)} account. ${connection}`;
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
    bumpPublicSystemCopy(source);
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
    // Device auto-sync opt-in is a top-level community column (NOT analytics). Persist it server-side
    // via the existing owner-gated community-update path so it applies for every member, not just
    // this device — unlike the rest of community settings, which are local-only today.
    if (els.ccAllowDeviceAutosync) {
      community.allowDeviceAutosync = els.ccAllowDeviceAutosync.checked;
      if (signalsReady() && isServerBackedCommunity(community) && window.PointwellSignals && typeof window.PointwellSignals.updateCommunityMedia === "function") {
        Promise.resolve(window.PointwellSignals.updateCommunityMedia(community.id, { allow_device_autosync: community.allowDeviceAutosync }))
          .then((res) => { if (res && res.error) showToast("Saved here, but the auto-sync setting didn't sync"); })
          .catch(() => {});
      }
    }
    saveState();
    showToast("Community settings saved");
    // Save AND exit: a successful save returns to the community (the same place "Back" goes), so the
    // owner doesn't have to tap Back separately. Reuses the existing back navigation. (This save is
    // synchronous, so navigating away here also makes a double-tap a no-op — the view is already gone.)
    returnToCommunityDetail();
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

  async function generateCommunityAiRules() {
    if (aiGenerating) return;
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
    aiGenerating = true;
    showToast("Generating with AI…");
    try {
      const generated = await aiGenerateDraft(inputs, blankAiAdjustments(), "community");
      draft.rules = (generated.rules || []).map((rule) => scoring.createRule({ ...scoring.normalizeRule(rule), id: makeId("community-rule") }));
      editingCommunityDraftRuleId = "";
      saveState();
      renderCreateCommunity();
      showToast(draft.rules.length ? `Generated ${draft.rules.length} rules — review and edit below` : "No rules generated — add more detail");
    } finally {
      aiGenerating = false;
    }
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
    communityDraftJustAddedId = "";        // don't carry the "added" banner across steps
    communityDraftRuleFormOpen = false;
    editingCommunityDraftRuleId = "";
    saveState();
    renderCreateCommunity();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function goToCreateCommunityStep(step) {
    syncCommunityDraftFromForm();
    communityDraftStep = Math.min(Math.max(Number(step) || 0, 0), createCommunitySteps.length - 1);
    communityDraftJustAddedId = "";
    communityDraftRuleFormOpen = false;
    editingCommunityDraftRuleId = "";
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
    // Once a rule exists, collapse the (tall) builder into a clear "added → add
    // another" state: the list + confirmation come together into view, and the
    // next step is one obvious button. The form re-opens for the first rule, an
    // edit, or an explicit "Add another rule".
    const showForm = Boolean(editingCommunityDraftRuleId) || communityDraftRuleFormOpen || rules.length === 0;
    els.communityDraftRuleForm.hidden = !showForm;
    els.ccRuleCollapsed.hidden = showForm;
    els.ccRuleAddedBanner.hidden = !(communityDraftJustAddedId && !showForm);
  }

  function renderCommunityDraftRuleRow(item) {
    const summary = [...scoring.describeRule(item), ruleSourceSummary(item)];
    const primaryPoints = item.simpleStyle === "penalty"
      ? item.penaltyPoints
      : (item.simpleStyle === "yesNo" ? item.yesNoPoints : (item.goalPoints || item.everyPoints));
    const tone = primaryPoints >= 0 ? "positive" : "negative";
    const flash = item.id === communityDraftJustAddedId ? " cc-rule-row-flash" : "";
    return `
      <div class="rule-row${flash}" data-cc-rule-id="${escapeHtml(item.id)}">
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
    communityDraftRuleFormOpen = false;        // collapse to the "add another" state
    communityDraftJustAddedId = rule.id;       // flash this row + show the banner
    resetCommunityDraftRuleForm();
    saveState();
    renderCreateCommunity();
    if (els.ccRuleAddedText) els.ccRuleAddedText.textContent = editing ? "Rule updated!" : "Rule added — nice work!";
    showToast(editing ? "✓ Rule updated" : "✓ Rule added");
    // Bring the freshly added rule + the confirmation into view together.
    requestAnimationFrame(() => {
      const row = els.communityDraftRuleList &&
        els.communityDraftRuleList.querySelector('[data-cc-rule-id="' + rule.id + '"]');
      (row || els.ccRuleCollapsed || els.communityDraftRuleList)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  // Re-open a fresh, empty builder for the next rule (distinct from editing).
  function openCommunityDraftRuleForm() {
    editingCommunityDraftRuleId = "";
    communityDraftJustAddedId = "";
    communityDraftRuleFormOpen = true;
    resetCommunityDraftRuleForm();
    renderCreateCommunity();
    requestAnimationFrame(() => {
      els.ccRuleLabelInput?.focus();
      els.communityDraftRuleForm?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function editCommunityDraftRule(id) {
    editingCommunityDraftRuleId = id;
    communityDraftJustAddedId = "";
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
    communityDraftJustAddedId = "";
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
    state.worldDetailType = "community";
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
      state.worldDetailType = "community";
      state.activeView = "community-detail";
      saveState();
      render();
      showToast("Already joined");
      return;
    }

    const joinedCommunity = clonePublicCommunityForJoin(source);
    state.communities.unshift(joinedCommunity);
    seedJoinedCommunityEntries(joinedCommunity);
    state.selectedCommunityId = joinedCommunity.id;
    state.worldDetailType = "community";
    state.activeView = "community-detail";
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

  // Live "{n} / 150" counter under the Bio field; cap matches the textarea maxlength.
  function updateBioCounter() {
    if (!els.profileBioCounter) return;
    const len = els.profileBioInput ? els.profileBioInput.value.length : 0;
    els.profileBioCounter.textContent = len + " / 150";
  }

  async function saveProfile() {
    if (profileSaving) return; // ignore double-clicks while an avatar upload is in flight
    profileSaving = true;
    if (els.saveProfileButton) els.saveProfileButton.disabled = true;
    try {
    const name = els.profileNameInput.value.trim() || "Avery Rivera";
    const handle = cleanHandle(els.profileHandleInput.value.trim() || "avery");
    const bio = els.profileBioInput ? els.profileBioInput.value.trim().slice(0, 150) : (state.profile.bio || "");
    state.profile.name = name;
    state.profile.handle = handle;
    state.profile.bio = bio;
    state.profile.privacy = els.profilePrivacyInput.value;

    // Persist the searchable basics + visibility + bio to the DB (RLS allows self-update).
    // This is what makes you findable by your chosen name/handle and applies your
    // public/private choice server-side — and fixes edits being lost on reload.
    const profilePatch = {
      display_name: name,
      handle: handle,
      bio: bio,
      visibility: state.profile.privacy === "private" ? "private" : "public"
    };
    // Resolve a pending profile-picture change BEFORE persisting so the picture and
    // the rest of the profile save together — never half-saved. An upload failure
    // keeps the existing picture and warns, but still saves everything else.
    let avatarChanged = false;
    if (profileAvatarDraft.file) {
      const uid = state.account && state.account.userId;
      if (!signalsReady() || !uid || !window.PointwellSignals || typeof window.PointwellSignals.uploadAvatar !== "function") {
        showToast("Sign in to set a profile picture");
      } else {
        const up = await window.PointwellSignals.uploadAvatar(profileAvatarDraft.file, uid);
        if (up.error || !up.url) {
          showToast(up.error && up.error.message ? up.error.message : "Couldn't upload the picture — kept your current one");
        } else {
          state.profile.avatarUrl = up.url;
          profilePatch.avatar_url = up.url;
          avatarChanged = true;
        }
      }
    } else if (profileAvatarDraft.remove && state.profile.avatarUrl) {
      state.profile.avatarUrl = "";
      profilePatch.avatar_url = null;
      avatarChanged = true;
    }

    if (signalsReady()) {
      Promise.resolve(window.PointwellSignals.updateProfile(state.account.userId, profilePatch)).catch(() => {});
    }
    if (els.allowAutoSyncInput) state.profile.allowAutoSync = els.allowAutoSyncInput.checked; // local-only client preference
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
        // Keep my own avatar in sync across community standings immediately.
        if (avatarChanged) me.avatarUrl = state.profile.avatarUrl;
      }
    });
    resetProfileAvatarDraft();
    saveState();
    // Public/private toggle or a renamed system changes what others can copy → resync.
    syncMyPublicSystems();
    showToast("Profile saved");
    // Save AND exit: the local profile save always succeeds (the network sync is best-effort, and an
    // avatar-upload hiccup only warns above), so on completion return to the profile page — the same
    // place "Back" goes — instead of stranding the user on the edit form. The button stays disabled
    // until the finally below, so it can't be double-tapped during the async save.
    backFromProfileEdit();
    } finally {
      profileSaving = false;
      if (els.saveProfileButton) els.saveProfileButton.disabled = false;
    }
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
    // Sum hand-logged entries per rule; manual logs ADD on top of the synced value (and of
    // each other). A "materialized" post of the synced value (viaSource — the Part B share)
    // already equals it, so for that rule the synced base is dropped to avoid double-counting.
    const manual = {};
    getQuickEntriesForToday(system.id).forEach((entry) => {
      if (entry.viaSource) return; // synced/materialized entries are superseded by syncProgress
      manual[entry.ruleId] = numberOrDefault(manual[entry.ruleId], 0) + numberOrDefault(entry.amount, 0);
    });
    (system.rules || []).forEach((item) => {
      const rule = scoring.normalizeRule(item);
      // Synced contribution per the incremental model (total metrics → logged increments;
      // calculated/measurement metrics → their value); hand-logged entries add on top.
      values[rule.id] = syncedContribution(rule, { userId: "me", date: todayIso }) + numberOrDefault(manual[rule.id], 0);
    });
    // Manual entries for a rule no longer in the system still count toward the day total.
    Object.keys(manual).forEach((ruleId) => {
      if (!(ruleId in values)) values[ruleId] = manual[ruleId];
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
        color: isMe ? (state.profile.accent || "#355d91") : memberColorFor(m.user_id),
        // Uploaded picture (from get_community_members). "me" uses my own so it shows
        // in standings immediately; falls back to the initials avatar when empty.
        avatarUrl: isMe ? (state.profile.avatarUrl || "") : (m.avatar_url || "")
      };
    });
    const ownerIsMe = row.owner_user === myId;
    const system = (row.system && Array.isArray(row.system.rules))
      ? row.system
      : { id: makeId("community-system"), title: (row.name || "") + " rules", category: row.category, rules: [], calculatedTotals: [] };
    return {
      id: row.id,
      createdAt: row.created_at || "",
      ownerId: ownerIsMe ? "me" : row.owner_user,
      adminIds: ownerIsMe ? ["me"] : [],
      name: row.name,
      category: row.category || "",
      description: row.description || "",
      visibility: row.visibility === "public" ? "public" : "private",
      inviteCode: row.invite_code,
      // Carry the world cover/icon paths through (camelCase, as tiles + detail read them) so
      // they survive a reload — fetchMyCommunities selects *, so the row has these columns.
      coverUrl: row.cover_url || "",
      iconUrl: row.icon_url || "",
      // Owner opt-in to auto-count members' connected-device totals on login/sync (fetchMyCommunities
      // selects *, so the column is present). Default false until the owner enables it.
      allowDeviceAutosync: row.allow_device_autosync === true,
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
      timestamp: entry.updated_at || "",
      message: entry.message || "",
      photoPath: entry.photo_path || ""
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

  // ── Public reward systems (copyable) ────────────────────────────────────────
  // A public profile's PUBLIC systems are mirrored to the server so anyone can copy
  // them; other people's land in state.publicSystems (which feeds getBuildPublicSystems,
  // so both the Build "Reward Systems" search and onboarding's "Public systems you can
  // copy" pick them up). Server-side RLS guarantees only public-profile public systems
  // are ever exposed (supabase/public-systems.sql). All calls are best-effort no-ops
  // when Supabase isn't configured.

  // Mirror MY public systems to the server (only when my profile is public; a private
  // profile publishes nothing → the server prunes my rows). Sends the full set.
  function syncMyPublicSystems() {
    if (!signalsReady() || typeof window.PointwellSignals.syncPublicSystems !== "function") return;
    const list = state.profile.privacy === "public"
      ? state.systems
          .filter((system) => system.visibility === "public")
          .map((system) => ({
            client_id: String(system.id),
            title: system.title || "Reward system",
            category: system.category || "",
            description: system.description || "",
            payload: publicSystemPayload(system)
          }))
      : [];
    Promise.resolve(window.PointwellSignals.syncPublicSystems(list)).catch(() => {});
  }

  // The portable system shape stored server-side and cloned by a copier (the fields
  // cloneSystem reads). Keep it minimal — no owner/visibility/ids (those are re-derived).
  function publicSystemPayload(system) {
    return {
      title: system.title || "Reward system",
      category: system.category || "",
      description: system.description || "",
      rules: system.rules || [],
      calculatedTotals: system.calculatedTotals || []
    };
  }

  // Fetch OTHER people's public systems (ranked by copy count) mapped to client shape.
  // Returns the array (does NOT assign) so the caller controls when state.publicSystems
  // is written — important during a same-tab account switch, where a stale run must not
  // clobber the new account's pool.
  async function loadPublicSystemsFromDb() {
    if (!signalsReady() || typeof window.PointwellSignals.popularPublicSystems !== "function") return [];
    const rows = await Promise.resolve(window.PointwellSignals.popularPublicSystems(50)).catch(() => []);
    return (Array.isArray(rows) ? rows : []).map(publicSystemFromDb);
  }

  // Map a public_systems row to a client-shaped system. Carries serverPublicId (to bump
  // the copy counter) and copyCount (the popularity sort key).
  function publicSystemFromDb(row) {
    const payload = row && row.payload && typeof row.payload === "object" ? row.payload : {};
    return normalizeSystem({
      id: String(row.id),
      serverPublicId: String(row.id),
      ownerId: String(row.owner_user || "public"),
      ownerName: row.owner_name || "Public profile",
      ownerHandle: row.owner_handle ? cleanHandle(row.owner_handle) : "",
      title: row.title || payload.title || "Reward system",
      category: row.category || payload.category || "",
      description: row.description || payload.description || "",
      visibility: "public",
      rules: Array.isArray(payload.rules) ? payload.rules : [],
      calculatedTotals: Array.isArray(payload.calculatedTotals) ? payload.calculatedTotals : [],
      copyCount: Number(row.copy_count) || 0
    });
  }

  // Best-effort popularity bump when a server-backed public system is copied.
  function bumpPublicSystemCopy(source) {
    if (source && source.serverPublicId && signalsReady()
        && typeof window.PointwellSignals.incrementPublicSystemCopy === "function") {
      Promise.resolve(window.PointwellSignals.incrementPublicSystemCopy(source.serverPublicId)).catch(() => {});
    }
  }

  // Persist a member's logged check-in for one rule/day to the shared table (the
  // per-rule daily TOTAL, to match the table's one-row-per-rule/day shape).
  function pushCommunityEntryToDb(community, ruleId, message = "", photoPath = "") {
    if (!communitiesAreShared() || !community || !ruleId) return Promise.resolve({ error: null });
    const today = getTodayKey();
    const total = getCommunityEntriesForMemberOnDate(community.id, "me", today)
      .filter((entry) => entry.ruleId === ruleId)
      .reduce((sum, entry) => sum + numberOrDefault(entry.amount, 0), 0);
    const payload = {
      community_id: community.id,
      user_id: state.account.userId,
      rule_id: ruleId,
      amount: total,
      entry_date: today
    };
    // Only send message/photo_path when set, so a plain add never nulls out an
    // attachment already on today's aggregated row for this rule.
    if (message) payload.message = message;
    if (photoPath) payload.photo_path = photoPath;
    return Promise.resolve(window.PointwellSignals.upsertCommunityEntry(payload))
      .catch(() => ({ error: { message: "Couldn't reach the server." } }));
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
    state.worldDetailType = "community";
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

  // Synthetic "synced" rows for the entries list — calculated rules show their formula value;
  // device rules show the LOGGED increments (so the row matches the scored value, not the raw
  // device total). Only rows with a positive value are shown.
  function syncedEntriesForContext(context, system, options = {}) {
    if (!system || !context) return [];
    const userId = options.userId || "me";
    return system.rules
      .map(scoring.normalizeRule)
      .map((rule) => {
        if (!isRuleSynced(rule)) return null;
        const amount = syncedContribution(rule, { userId, date: todayIso });
        if (!(amount > 0)) return null;
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
      return syncedContribution(rule, { userId: "me", date: todayIso }) > 0;
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
      feedTab: saved.feedTab === "discover" ? "discover" : "friends",
      communityLeaderboardPeriod: saved.communityLeaderboardPeriod || seed.communityLeaderboardPeriod,
      communityHubTab: saved.communityHubTab || seed.communityHubTab,
      communityFeedSort: saved.communityFeedSort || seed.communityFeedSort,
      communityTrendMemberId: saved.communityTrendMemberId || seed.communityTrendMemberId,
      dashboardAnalyticsOpen: Boolean(saved.dashboardAnalyticsOpen),
      inactiveCommunitiesOpen: Boolean(saved.inactiveCommunitiesOpen),
      scheduleExpanded: Boolean(saved.scheduleExpanded),
      editingRuleId: saved.editingRuleId || "",
      systemSetupStep: clampSetupStep(saved.systemSetupStep),
      systemEditorOpen: Boolean(saved.systemEditorOpen),
      buildMode: ["home", "search", "ai"].includes(saved.buildMode) ? saved.buildMode : seed.buildMode,
      buildSearchQuery: saved.buildSearchQuery || "",
      communitySearchQuery: saved.communitySearchQuery || "",
      integrations: normalizeIntegrations(saved.integrations || seed.integrations),
      mockSyncData: mergeMockSyncData(saved.mockSyncData),
      buildViewedPublicId: saved.buildViewedPublicId || "",
      buildViewedProfileId: saved.buildViewedProfileId || "",
      profileUserId: saved.profileUserId || "",
      profilePostsView: saved.profilePostsView === "list" ? "list" : "grid",
      profileCommunityContextId: saved.profileCommunityContextId || "",
      profileRuleBreakdownOpen: Boolean(saved.profileRuleBreakdownOpen),
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
    // normalizeIntegrations + mergeMockSyncData rebuild from the current definitions, so a returning
    // user's removed demo providers (apple-health / google-health-connect / chase) AND any fake
    // synced values (incl. the old plaid mock data — plaid is now just a coming-soon card with no
    // data source) are dropped from saved state — the Coach can no longer treat them as logged.
    nextState.integrations = normalizeIntegrations(nextState.integrations);
    nextState.mockSyncData = mergeMockSyncData(nextState.mockSyncData);
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

  // Completion % shown in the Add Entry "X% complete" labels never exceeds 100 — a
  // yes/no "done" rule logged a few times would otherwise read "400% complete". The
  // progress bar keeps its own over-goal cue; only the displayed % text is capped.
  function displayCompletionPercent(percent) {
    return Math.min(100, Math.max(0, numberOrDefault(percent, 0)));
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

  // Shared avatar renderer. Returns an <img> (the avatar element itself) when the
  // person has an uploaded picture, else the existing initials circle. When avatarUrl
  // is empty the output is byte-identical to the old initials markup, so swapping this
  // into a render site changes nothing until a photo actually exists. `className` is
  // the full class string for the site (e.g. "member-avatar mini-lb-avatar", "avatar",
  // "large-avatar person-detail-avatar"); `color` preserves the inline background used
  // by community/leaderboard rows; `useNameColor` reproduces the hashed avatarColor().
  function renderAvatar(opts) {
    const o = opts || {};
    const cls = escapeHtml(o.className || "member-avatar");
    const url = o.avatarUrl ? String(o.avatarUrl) : "";
    if (url) {
      return `<img class="${cls}" src="${escapeHtml(url)}" alt="" aria-hidden="true" loading="lazy">`;
    }
    const bg = o.color || (o.useNameColor ? avatarColor(o.name) : "");
    const style = bg ? ` style="background:${escapeHtml(bg)}"` : "";
    return `<span class="${cls}" aria-hidden="true"${style}>${escapeHtml(getInitials(o.name))}</span>`;
  }

  // Paint a PERSISTENT avatar node (the header, profile-editor and friend-activity
  // avatars are long-lived DOM nodes we update in place rather than re-render). Shows
  // an inner <img> when a picture is set, else falls back to the initials text.
  function paintAvatarNode(el, name, avatarUrl) {
    if (!el) return;
    if (avatarUrl) {
      el.innerHTML = `<img class="avatar-img" src="${escapeHtml(String(avatarUrl))}" alt="" loading="lazy">`;
    } else {
      el.textContent = getInitials(name);
    }
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
