import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { ALL_ROLES, can } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/middleware";
import type { AppRole } from "@/types/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId, profile } = await getSessionProfile();
  if (!userId || !can(profile?.role as AppRole, "approveUsers")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    email?: string;
    full_name?: string;
    role?: AppRole;
  };

  const email = body.email?.trim().toLowerCase() ?? "";
  const fullName = body.full_name?.trim() || email.split("@")[0];
  const role = body.role;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!role || !ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: "Select a valid role" }, { status: 400 });
  }
  if (role === "admin" && profile?.email !== "naeem.sons89@gmail.com") {
    // Allow only primary admin to invite other admins — keep simple: any admin can invite admin
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  const redirectTo = `${appUrl}/auth/callback?next=/app`;

  const admin = createServiceClient();

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        invited_role: role,
      },
      redirectTo,
    });

  if (inviteError) {
    return NextResponse.json(
      { error: inviteError.message },
      { status: 400 },
    );
  }

  const invitedUser = invited.user;
  if (!invitedUser) {
    return NextResponse.json(
      { error: "Invite sent but no user returned" },
      { status: 500 },
    );
  }

  // Ensure profile is approved with the chosen role (invite email sets password)
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", invitedUser.id)
    .maybeSingle();

  if (existingProfile) {
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        email,
        full_name: fullName,
        role,
        status: "approved",
        approved_by: userId,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", invitedUser.id);

    if (updateError) {
      return NextResponse.json(
        {
          error: `Invite email sent, but profile update failed: ${updateError.message}`,
        },
        { status: 500 },
      );
    }
  } else {
    const { error: insertError } = await admin.from("profiles").insert({
      id: invitedUser.id,
      email,
      full_name: fullName,
      role,
      status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    });
    if (insertError) {
      return NextResponse.json(
        {
          error: `Invite email sent, but profile create failed: ${insertError.message}`,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Invite sent to ${email}. They will set a password from the email link, then can open the portal as ${role.replaceAll("_", " ")}.`,
    user_id: invitedUser.id,
  });
}
