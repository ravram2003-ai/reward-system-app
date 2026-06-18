/**
 * Pointwell — Supabase configuration.
 *
 * KEY SAFETY:
 *  - The anon / public key is DESIGNED to ship in frontend code. It is safe here.
 *  - NEVER put the service_role key in this file, in any frontend file, or in the repo.
 *    The service_role key bypasses Row Level Security and must stay server-side only.
 *  - Security is NOT provided by hiding keys. ALL access control is enforced by
 *    Row Level Security (RLS) policies in the database (see the setup SQL).
 */
window.POINTWELL_SUPABASE = {
  url: "https://ejoccpqbozgzixrejlhd.supabase.co",
  // anon / public key (JWT). Public by design — safe in the browser with RLS enabled.
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqb2NjcHFib3pneml4cmVqbGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDU3NTcsImV4cCI6MjA5NzM4MTc1N30.2xf7Raa4fGXGfQZ0bWY_VJ41HSt7WUMZWP0Xqp3pFWc"
};
