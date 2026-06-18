const auth = require("../outputs/auth-helpers.js");
const { isSupabaseConfigured, handleFromEmail, nameFromEmail, deriveProfileFromUser } = auth;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// isSupabaseConfigured — placeholders / missing => false, real values => true
assertEqual(isSupabaseConfigured({ url: "YOUR_SUPABASE_URL", anonKey: "YOUR_SUPABASE_ANON_KEY" }), false, "config placeholder");
assertEqual(isSupabaseConfigured({ url: "", anonKey: "" }), false, "config empty");
assertEqual(isSupabaseConfigured({ url: "https://abc.supabase.co", anonKey: "short" }), false, "config short key");
assertEqual(isSupabaseConfigured(null), false, "config null");
assertEqual(isSupabaseConfigured({ url: "https://abc.supabase.co", anonKey: "x".repeat(40) }), true, "config real");

// handleFromEmail
assertEqual(handleFromEmail("Ada.Lovelace@example.com"), "@ada.lovelace", "handle from email");
assertEqual(handleFromEmail(""), "@member", "handle from empty");

// nameFromEmail
assertEqual(nameFromEmail("ada.lovelace@example.com"), "Ada Lovelace", "name from email");
assertEqual(nameFromEmail("noah@x.com"), "Noah", "name single token");

// deriveProfileFromUser — profile row wins over metadata wins over email default
const fromRow = deriveProfileFromUser(
  { id: "u1", email: "ada@x.com", user_metadata: { display_name: "Meta Ada" } },
  { display_name: "Row Ada", handle: "ada_l" }
);
assertEqual(fromRow.userId, "u1", "derive userId");
assertEqual(fromRow.name, "Row Ada", "derive prefers profile row name");
assertEqual(fromRow.handle, "@ada_l", "derive normalizes handle with @");

const fromMeta = deriveProfileFromUser({ id: "u2", email: "noah@x.com", user_metadata: { display_name: "Noah Stone" } }, null);
assertEqual(fromMeta.name, "Noah Stone", "derive falls back to metadata name");
assertEqual(fromMeta.handle, "@noah", "derive handle from email when no row");

const fromEmail = deriveProfileFromUser({ id: "u3", email: "iris.k@x.com" }, null);
assertEqual(fromEmail.name, "Iris K", "derive name from email default");
assertEqual(fromEmail.handle, "@iris.k", "derive handle from email default");

// degenerate handles must fall back to @member (no "@"-only handles)
assertEqual(deriveProfileFromUser({ id: "u5", email: "x@x.com" }, { handle: "@" }).handle, "@member", "derive guards bare @ handle");
assertEqual(deriveProfileFromUser({ id: "u6", email: "+++@x.com" }, null).handle, "@member", "derive guards all-symbol email");

console.log("Auth helper tests passed");
