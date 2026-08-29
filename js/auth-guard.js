// ============================================================
// AUTH GUARD — rebuilt for the multi-academy schema
// (organizations, academies, roles, user_roles, profiles)
// ============================================================

// Returns the logged-in profile (with is_group_admin) or redirects to login.
async function requireAuth() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) {
    window.location.href = "index.html";
    return null;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, full_name, email, status, is_group_admin")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.status !== "active") {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
    return null;
  }

  return profile;
}

// The organization (PICS Lyceum Group) — for branding everywhere.
async function getOrganization() {
  const { data, error } = await supabaseClient
    .from("organizations")
    .select("*")
    .limit(1)
    .single();
  if (error) {
    console.error("Could not load organization:", error);
    return null;
  }
  return data;
}

// Every academy this profile can access, with their role(s) in each.
// Group Admin gets every academy in the system, role 'group_admin'.
async function getUserAcademies(profile) {
  if (profile.is_group_admin) {
    const { data: academies } = await supabaseClient
      .from("academies")
      .select("id, name, status")
      .eq("status", "active")
      .order("name");
    return (academies || []).map(a => ({ ...a, role: "group_admin" }));
  }

  const { data: roles } = await supabaseClient
    .from("user_roles")
    .select("academy_id, roles(name), academies(id, name, status)")
    .eq("user_id", profile.id);

  const seen = new Map();
  (roles || []).forEach(r => {
    if (r.academies && r.academies.status === "active" && !seen.has(r.academies.id)) {
      seen.set(r.academies.id, { id: r.academies.id, name: r.academies.name, role: r.roles.name });
    }
  });
  return Array.from(seen.values());
}

// Which academy is currently "in view." Persists across pages via
// sessionStorage (clears when the tab closes — fine for this use).
function getCurrentAcademyId() {
  return sessionStorage.getItem("currentAcademyId");
}

function setCurrentAcademyId(id) {
  sessionStorage.setItem("currentAcademyId", id);
}

function setupLogout() {
  const btn = document.getElementById("logoutButton");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    sessionStorage.removeItem("currentAcademyId");
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });
}
