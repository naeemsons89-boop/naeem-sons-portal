"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Input, Label } from "@/components/ui";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import type { AppRole, Profile, UserStatus } from "@/types/database";

export function UsersAdminClient({ initialUsers }: { initialUsers: Profile[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("warehouse_operator");

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setInviteMessage(null);
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        full_name: inviteName,
        role: inviteRole,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    setInviting(false);
    if (!res.ok) {
      setError(json.error ?? "Invite failed");
      return;
    }
    setInviteMessage(json.message ?? "Invite sent");
    setInviteEmail("");
    setInviteName("");
    router.refresh();
    // Soft refresh list
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setUsers(data as Profile[]);
  }

  async function updateUser(
    id: string,
    patch: { status?: UserStatus; role?: AppRole; rejection_reason?: string },
  ) {
    setBusyId(id);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        ...patch,
        approved_by: user?.id ?? null,
        approved_at: patch.status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select("*")
      .single();

    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? (data as Profile) : u)));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-semibold text-[var(--ink)]">Invite staff by email</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Sends a Supabase invite email. They set their password from the link, then
          sign in with the role you assign.
        </p>
        <form onSubmit={sendInvite} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="inviteEmail">Email</Label>
            <Input
              id="inviteEmail"
              type="email"
              required
              placeholder="staff@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inviteName">Full name</Label>
            <Input
              id="inviteName"
              placeholder="Optional"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inviteRole">Role</Label>
            <select
              id="inviteRole"
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as AppRole)}
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={inviting}>
              {inviting ? "Sending invite…" : "Send invite email"}
            </Button>
          </div>
        </form>
        {inviteMessage ? (
          <p className="mt-3 text-sm text-[var(--brand)]">{inviteMessage}</p>
        ) : null}
      </Card>

      <div>
        <h2 className="mb-3 font-semibold">All users</h2>
        <div className="space-y-3">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {users.map((user) => (
            <Card
              key={user.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">{user.full_name ?? "—"}</p>
                <p className="text-sm text-[var(--ink-muted)]">{user.email}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-[var(--accent)]">
                  {user.status}
                  {user.role ? ` · ${ROLE_LABELS[user.role]}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-sm"
                  defaultValue={user.role ?? ""}
                  id={`role-${user.id}`}
                  disabled={busyId === user.id}
                >
                  <option value="" disabled>
                    Select role
                  </option>
                  {ALL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={busyId === user.id}
                  onClick={() => {
                    const select = document.getElementById(
                      `role-${user.id}`,
                    ) as HTMLSelectElement | null;
                    const role = select?.value as AppRole | undefined;
                    if (!role) {
                      setError("Select a role before approving");
                      return;
                    }
                    void updateUser(user.id, { status: "approved", role });
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busyId === user.id}
                  onClick={() =>
                    void updateUser(user.id, {
                      status: "rejected",
                      rejection_reason: "Rejected by admin",
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </Card>
          ))}
          {users.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--ink-muted)]">No users yet.</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
