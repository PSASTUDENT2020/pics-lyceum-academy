// ============================================================
// EDGE FUNCTION: create-staff-user
//
// Implements "Staff → Create System User" from the spec.
// Runs on Supabase's servers — the ONLY place the secret
// (service role) key is ever used. The frontend never sees it.
//
// Called from the app like this:
//
//   const { data, error } = await supabaseClient.functions.invoke(
//     'create-staff-user',
//     { body: { staff_id, email, full_name, role_name, academy_id } }
//   );
//
// The caller's login session is automatically forwarded, so this
// function can check WHO is asking before doing anything privileged.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { staff_id, email, full_name, role_name, academy_id } = await req.json();

    if (!staff_id || !email || !full_name || !role_name || !academy_id) {
      return jsonResponse({ error: "Missing required fields." }, 400);
    }

    // These three env vars are automatically available in every
    // Supabase Edge Function — nothing to configure manually.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Admin client — full privileges, used ONLY here, server-side.
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ---- 1. Identify the caller from their session token ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !caller) {
      return jsonResponse({ error: "Not authenticated." }, 401);
    }

    // ---- 2. Authorize: caller must be Group Admin, or Academy Admin
    //         for this exact academy. Never allow self-elevation. ----
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("is_group_admin")
      .eq("id", caller.id)
      .single();

    let authorized = callerProfile?.is_group_admin === true;

    if (!authorized) {
      const { data: adminRole } = await supabaseAdmin
        .from("user_roles")
        .select("id, roles!inner(name)")
        .eq("user_id", caller.id)
        .eq("academy_id", academy_id)
        .eq("roles.name", "academy_admin")
        .maybeSingle();
      authorized = !!adminRole;
    }

    if (!authorized) {
      return jsonResponse({ error: "Not authorized to create users for this academy." }, 403);
    }

    // Academy Admins may never grant academy_admin or group_admin roles
    // (matches the RLS rule and the spec's "cannot increase own permissions").
    if (!callerProfile?.is_group_admin && ["academy_admin", "group_admin"].includes(role_name)) {
      return jsonResponse({ error: "Only Group Admin can assign this role." }, 403);
    }

    // ---- 3. Create the auth account (invite email — no plaintext password ever handled) ----
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (createError) {
      return jsonResponse({ error: createError.message }, 400);
    }

    const newUserId = newUser.user.id;

    // ---- 4. Create the profile, linked to the staff record ----
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      full_name,
      email,
      staff_id,
      status: "active",
    });
    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    // ---- 5. Look up the role id and create the User → Role → Academy grant ----
    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", role_name)
      .single();

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role_id: role?.id,
      academy_id,
    });
    if (roleError) {
      return jsonResponse({ error: roleError.message }, 400);
    }

    return jsonResponse({
      success: true,
      message: `Invite sent to ${email}. They'll set their own password via the emailed link.`,
      user_id: newUserId,
    });

  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
