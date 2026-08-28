// ============================================================
// SUPABASE CLIENT — shared across every page
// This is the ONLY file where these values should live.
// ============================================================

const SUPABASE_URL = "https://wscaiebgqxgtfbisamyc.supabase.co";

// This is the PUBLISHABLE key only — safe to expose in frontend code.
// Never put the secret key here or anywhere in this project.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NSF28nhImZqYL9_3RUTmFg_yDANCLr6";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
