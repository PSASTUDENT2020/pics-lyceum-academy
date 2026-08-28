// ============================================================
// AUTH GUARD — include after supabase-client.js on every
// protected page (dashboard, students, staff, etc.)
// ============================================================

// Returns the logged-in user's profile (id, full_name, role) or
// redirects to login if not authenticated / no profile found.
async function requireAuth() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();

  if (error || !user) {
    window.location.href = "index.html";
    return null;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
    return null;
  }

  return profile;
}

// Fetches the single school_settings row — used to populate
// school name, address, phone, logo everywhere instead of
// hardcoding it. Edit the row once in Supabase (or later via
// a School Settings page) and every page updates automatically.
async function getSchoolSettings() {
  const { data, error } = await supabaseClient
    .from("school_settings")
    .select("*")
    .single();

  if (error) {
    console.error("Could not load school settings:", error);
    return null;
  }

  return data;
}

// Wires up any element with id="logoutButton" on the page.
function setupLogout() {
  const btn = document.getElementById("logoutButton");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });
}
