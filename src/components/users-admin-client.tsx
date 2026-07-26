"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  ListPanel,
  statusTone,
} from "@/components/ui";
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
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AppRole | "">>(() =>
    Object.fromEntries(initialUsers.map((u) => [u.id, (u.role as AppRole | null) ?? ""])),
  );

  async function refreshUsers() {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      const list = data as Profile[];
      setUsers(list);
      setRoleDrafts(
        Object.fromEntries(list.map((u) => [u.id, (u.role as AppRole | null) ?? ""])),
      );
    }
  }

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
    await refreshUsers();
  }

  async function updateUser(
    id: string,
    patch: { status?: UserStatus; role?: AppRole | null; rejection_reason?: string | null },
  ) {
    setBusyId(id);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload: Record<string, unknown> = { ...patch };
    if (patch.status === "approved") {
      payload.approved_by = user?.id ?? null;
      payload.approved_at = new Date().toISOString();
      payload.rejection_reason = null;
    } else if (patch.status === "rejected" || patch.status === "suspended") {
      payload.approved_at = null;
    }

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update(payload)
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

  function selectedRole(userId: string): AppRole | undefined {
    const value = roleDrafts[userId];
    return value ? (value as AppRole) : undefined;
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <h2 className="text-sm font-medium text-[var(--ink)]">Invite staff by email</h2>
        <p className="text-xs text-[var(--ink-muted)]">
          Sends a Supabase invite email. They set their password from the link, then
          sign in with the role you assign.
        </p>
        <form onSubmit={sendInvite} className="grid gap-2 sm:grid-cols-2">
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
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
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
          <p className="text-sm text-[var(--brand)]">{inviteMessage}</p>
        ) : null}
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium">All users</h2>
        {error ? <p className="mb-2 text-sm text-[var(--danger)]">{error}</p> : null}
        {users.length === 0 ? (
          <EmptyState>No users yet.</EmptyState>
        ) : (
          <ListPanel>
            {users.map((user) => {
              const busy = busyId === user.id;
              const draftRole = selectedRole(user.id);
              return (
                <div
                  key={user.id}
                  className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar
                      size="sm"
                      src={user.avatar_url}
                      name={user.full_name ?? user.email}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium">
                          {user.full_name ?? "—"}
                        </p>
                        <Badge tone={statusTone(user.status)} className="capitalize">
                          {user.status}
                        </Badge>
                        {user.role ? (
                          <Badge tone="mint">{ROLE_LABELS[user.role]}</Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-[var(--ink-muted)]">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      className="rounded-xl border border-[var(--line)] bg-white px-2.5 py-1.5 text-xs"
                      value={roleDrafts[user.id] ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        setRoleDrafts((prev) => ({
                          ...prev,
                          [user.id]: e.target.value as AppRole | "",
                        }))
                      }
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

                    {(user.status === "pending" || user.status === "rejected") && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          if (!draftRole) {
                            setError("Select a role before approving");
                            return;
                          }
                          void updateUser(user.id, { status: "approved", role: draftRole });
                        }}
                      >
                        Approve
                      </Button>
                    )}

                    {user.status === "approved" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || !draftRole || draftRole === user.role}
                        onClick={() => {
                          if (!draftRole) {
                            setError("Select a role");
                            return;
                          }
                          void updateUser(user.id, { role: draftRole });
                        }}
                      >
                        Save role
                      </Button>
                    )}

                    {user.status === "approved" && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          void updateUser(user.id, {
                            status: "suspended",
                            rejection_reason: "Suspended by admin",
                          })
                        }
                      >
                        Suspend
                      </Button>
                    )}

                    {user.status === "suspended" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          if (!draftRole) {
                            setError("Select a role before unsuspending");
                            return;
                          }
                          void updateUser(user.id, {
                            status: "approved",
                            role: draftRole,
                            rejection_reason: null,
                          });
                        }}
                      >
                        Unsuspend
                      </Button>
                    )}

                    {user.status !== "rejected" && user.status !== "suspended" && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          void updateUser(user.id, {
                            status: "rejected",
                            rejection_reason: "Rejected by admin",
                          })
                        }
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </ListPanel>
        )}
      </div>
    </div>
  );
}
