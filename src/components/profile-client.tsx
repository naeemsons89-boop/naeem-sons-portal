"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar, Badge, Button, Card, Input, Label } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import type { AppRole, Profile } from "@/types/database";

export function ProfileClient({ profile }: { profile: Profile }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [uploading, setUploading] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const role = profile.role as AppRole | null;

  async function saveProfile(patch: Record<string, string | null>) {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Update failed");
    return json;
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setInfoError(null);
    setInfoMessage(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${profile.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;

      await saveProfile({ avatar_url: url });
      setAvatarUrl(url);
      setInfoMessage("Profile photo updated");
      router.refresh();
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSavingInfo(true);
    setInfoError(null);
    setInfoMessage(null);
    try {
      await saveProfile({ full_name: fullName, phone });
      setInfoMessage("Personal information saved");
      router.refresh();
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingInfo(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPasswordMessage("Password updated");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="flex flex-col items-center gap-4 text-center">
        <Avatar src={avatarUrl} name={profile.full_name ?? profile.email} size="lg" />
        <div>
          <p className="font-semibold text-[var(--ink)]">
            {profile.full_name ?? profile.email}
          </p>
          <p className="text-sm text-[var(--ink-muted)]">{profile.email}</p>
        </div>
        <Badge tone="mint">{role ? ROLE_LABELS[role] : "No role"}</Badge>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onAvatarChange}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Change photo"}
        </Button>
        <p className="text-xs text-[var(--ink-muted)]">JPG, PNG or WEBP. Max 2MB.</p>
      </Card>

      <div className="space-y-4">
        <Card>
          <form onSubmit={onSaveInfo} className="space-y-4">
            <h2 className="font-semibold text-[var(--ink)]">Personal information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03XX-XXXXXXX"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={profile.email} disabled className="opacity-70" />
              </div>
              <div>
                <Label>Role</Label>
                <Input
                  value={role ? ROLE_LABELS[role] : "No role"}
                  disabled
                  className="opacity-70"
                />
              </div>
            </div>
            {infoError ? <p className="text-sm text-[var(--danger)]">{infoError}</p> : null}
            {infoMessage ? <p className="text-sm text-[var(--brand)]">{infoMessage}</p> : null}
            <Button type="submit" disabled={savingInfo}>
              {savingInfo ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Card>

        <Card>
          <form onSubmit={onChangePassword} className="space-y-4">
            <h2 className="font-semibold text-[var(--ink)]">Change password</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            {passwordError ? (
              <p className="text-sm text-[var(--danger)]">{passwordError}</p>
            ) : null}
            {passwordMessage ? (
              <p className="text-sm text-[var(--brand)]">{passwordMessage}</p>
            ) : null}
            <Button type="submit" variant="secondary" disabled={savingPassword}>
              {savingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
