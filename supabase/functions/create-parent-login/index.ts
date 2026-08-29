// ============================================================
// EDGE FUNCTION: create-parent-login
//
// Implements "Create Parent Login" from the spec — a guardian
// gets their own login, auto-linked to their children, restricted
// to only ever seeing those children's records (enforced by RLS).
//
//   const { data, error } = await supabaseClient.functions.invoke(
//     'create-parent-login',
//     { body: { guardian_id, email, full_name } }
//   );
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { guardian_id, email, full_name } = await req.json();

    if (!guardian_id || !email || !full_name) {
      return jsonResponse({ error: "Missing required fields." }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ---- 1. Identify the caller ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !caller) {
      return jsonResponse({ error: "Not authenticated." }, 401);
    }

    // ---- 2. Authorize: caller must be Group Admin, or Academy Admin
    //         of an academy where this guardian has a linked student ----
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("is_group_admin")
      .eq("id", caller.id)
      .single();

    let authorized = callerProfile?.is_group_admin === true;

    if (!authorized) {
      const { data: link } = await supabaseAdmin
        .from("student_guardians")
        .select("students!inner(academy_id)")
        .eq("guardian_id", guardian_id);

      const academyIds = (link ?? []).map((row: any) => row.students.academy_id);

      if (academyIds.length > 0) {
        const { data: adminRole } = await supabaseAdmin
          .from("user_roles")
          .select("id, roles!inner(name)")
          .eq("user_id", caller.id)
          .eq("roles.name", "academy_admin")
          .in("academy_id", academyIds)
          .maybeSingle();
        authorized = !!adminRole;
      }
    }

    if (!authorized) {
      return jsonResponse({ error: "Not authorized to create a login for this guardian." }, 403);
    }

    // ---- 3. Create the auth account via invite email ----
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (createError) {
      return jsonResponse({ error: createError.message }, 400);
    }

    const newUserId = newUser.user.id;

    // ---- 4. Create the profile, linked to the guardian record ----
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      full_name,
      email,
      guardian_id,
      status: "active",
    });
    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    // ---- 5. Assign the 'parent' role. No academy_id — access is
    //         scoped by guardian_id → student_guardians instead,
    //         via the RLS policies already in place. ----
    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", "parent")
      .single();

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role_id: role?.id,
      academy_id: null,
    });
    if (roleError) {
      return jsonResponse({ error: roleError.message }, 400);
    }

    return jsonResponse({
      success: true,
      message: `Invite sent to ${email}. They'll set their own password and see only their linked children.`,
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
