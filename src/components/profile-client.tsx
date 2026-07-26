"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PasswordStrength } from "@/components/password-strength";
import { Avatar, Badge, Button, Card, Input, Label } from "@/components/ui";
import { checkPassword, passwordsMatch } from "@/lib/password";
import { ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import type { AppRole, Profile } from "@/types/database";

export type MfaFactor = { id: string; status: string; friendly_name?: string };

export function ProfileClient({
  profile,
  initialMfaFactors = [],
}: {
  profile: Profile;
  initialMfaFactors?: MfaFactor[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [uploading, setUploading] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState(profile.email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>(initialMfaFactors);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const role = profile.role as AppRole | null;

  async function refreshMfa() {
    setMfaLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.listFactors();
    setMfaLoading(false);
    if (error) {
      setMfaError(error.message);
      return;
    }
    setMfaFactors(
      data.totp.map((f) => ({
        id: f.id,
        status: f.status,
        friendly_name: f.friendly_name ?? undefined,
      })),
    );
    setMfaError(null);
  }

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

  async function onChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailMessage(null);
    const email = newEmail.trim().toLowerCase();
    if (!email || email === profile.email) {
      setEmailError("Enter a different email address");
      return;
    }
    setSavingEmail(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email });
    setSavingEmail(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailMessage(
      "Confirmation sent. Check the new inbox (and the old one if required) to finish the change.",
    );
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    if (!currentPassword) {
      setPasswordError("Enter your current password");
      return;
    }
    const strength = checkPassword(newPassword);
    if (!strength.ok) {
      setPasswordError(strength.message);
      return;
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      setPasswordError("Passwords do not match");
      return;
    }

    setSavingPassword(true);
    const supabase = createClient();
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });
    if (reauthError) {
      setSavingPassword(false);
      setPasswordError("Current password is incorrect");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPasswordMessage("Password updated");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function startMfaEnroll() {
    setMfaBusy(true);
    setMfaError(null);
    setMfaMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    setMfaBusy(false);
    if (error || !data) {
      setMfaError(error?.message ?? "Could not start MFA enrollment");
      return;
    }
    setEnrollFactorId(data.id);
    setEnrollQr(data.totp.qr_code);
    setEnrollSecret(data.totp.secret);
  }

  async function confirmMfaEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollFactorId) return;
    setMfaBusy(true);
    setMfaError(null);
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollFactorId,
    });
    if (challengeError || !challenge) {
      setMfaBusy(false);
      setMfaError(challengeError?.message ?? "Challenge failed");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollFactorId,
      challengeId: challenge.id,
      code: enrollCode.trim(),
    });
    setMfaBusy(false);
    if (verifyError) {
      setMfaError(verifyError.message);
      return;
    }
    setEnrollQr(null);
    setEnrollSecret(null);
    setEnrollFactorId(null);
    setEnrollCode("");
    setMfaMessage("Two-factor authentication is on");
    await refreshMfa();
    router.refresh();
  }

  async function disableMfa(factorId: string) {
    setMfaBusy(true);
    setMfaError(null);
    setMfaMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setMfaBusy(false);
    if (error) {
      setMfaError(error.message);
      return;
    }
    setMfaMessage("Two-factor authentication turned off");
    await refreshMfa();
  }

  async function signOutOthers() {
    setSessionBusy(true);
    setSessionError(null);
    setSessionMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setSessionBusy(false);
    if (error) {
      setSessionError(error.message);
      return;
    }
    setSessionMessage("Signed out of other devices. This device stays signed in.");
  }

  async function signOutEverywhere() {
    setSessionBusy(true);
    setSessionError(null);
    setSessionMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setSessionBusy(false);
    if (error) {
      setSessionError(error.message);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  const verifiedMfa = mfaFactors.filter((f) => f.status === "verified");

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
                <Label>Role</Label>
                <Input
                  value={role ? ROLE_LABELS[role] : "No role"}
                  disabled
                  className="opacity-70"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input value={profile.status} disabled className="opacity-70 capitalize" />
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
          <form onSubmit={onChangeEmail} className="space-y-4">
            <h2 className="font-semibold text-[var(--ink)]">Email address</h2>
            <p className="text-sm text-[var(--ink-muted)]">
              Changing email requires confirmation. Your login email updates after you confirm.
            </p>
            <div>
              <Label htmlFor="newEmail">Email</Label>
              <Input
                id="newEmail"
                type="email"
                autoComplete="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            {emailError ? <p className="text-sm text-[var(--danger)]">{emailError}</p> : null}
            {emailMessage ? <p className="text-sm text-[var(--brand)]">{emailMessage}</p> : null}
            <Button type="submit" variant="secondary" disabled={savingEmail}>
              {savingEmail ? "Sending…" : "Update email"}
            </Button>
          </form>
        </Card>

        <Card>
          <form onSubmit={onChangePassword} className="space-y-4">
            <h2 className="font-semibold text-[var(--ink)]">Change password</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
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
                <PasswordStrength password={newPassword} />
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
            <p className="text-xs text-[var(--ink-muted)]">
              Locked out? Use{" "}
              <a href="/forgot-password" className="font-semibold text-[var(--brand)]">
                Forgot password
              </a>{" "}
              on the login screen.
            </p>
          </form>
        </Card>

        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-[var(--ink)]">Two-factor authentication</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Protect your account with an authenticator app (Google Authenticator, 1Password, etc.).
              </p>
            </div>
            {mfaLoading ? (
              <p className="text-sm text-[var(--ink-muted)]">Checking MFA status…</p>
            ) : verifiedMfa.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--brand)]">MFA is enabled.</p>
                {verifiedMfa.map((factor) => (
                  <div
                    key={factor.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2"
                  >
                    <span className="text-sm">{factor.friendly_name || "Authenticator"}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={mfaBusy}
                      onClick={() => void disableMfa(factor.id)}
                    >
                      Turn off
                    </Button>
                  </div>
                ))}
              </div>
            ) : enrollQr ? (
              <form onSubmit={confirmMfaEnroll} className="space-y-3">
                <p className="text-sm text-[var(--ink-muted)]">
                  Scan this QR code, then enter the 6-digit code to confirm.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollQr}
                  alt="MFA QR code"
                  className="mx-auto h-48 w-48 rounded-xl border border-[var(--line)] bg-white p-2"
                />
                {enrollSecret ? (
                  <p className="break-all text-center text-xs text-[var(--ink-muted)]">
                    Manual key: {enrollSecret}
                  </p>
                ) : null}
                <div>
                  <Label htmlFor="enrollCode">Verification code</Label>
                  <Input
                    id="enrollCode"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={enrollCode}
                    onChange={(e) =>
                      setEnrollCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={mfaBusy || enrollCode.length !== 6}>
                    {mfaBusy ? "Confirming…" : "Confirm and enable"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={mfaBusy}
                    onClick={() => {
                      setEnrollQr(null);
                      setEnrollSecret(null);
                      setEnrollFactorId(null);
                      setEnrollCode("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button type="button" disabled={mfaBusy} onClick={() => void startMfaEnroll()}>
                {mfaBusy ? "Starting…" : "Set up authenticator"}
              </Button>
            )}
            {mfaError ? <p className="text-sm text-[var(--danger)]">{mfaError}</p> : null}
            {mfaMessage ? <p className="text-sm text-[var(--brand)]">{mfaMessage}</p> : null}
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-[var(--ink)]">Sessions</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Sign out of other browsers or end every session including this one.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={sessionBusy}
                onClick={() => void signOutOthers()}
              >
                Sign out other devices
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={sessionBusy}
                onClick={() => void signOutEverywhere()}
              >
                Sign out everywhere
              </Button>
            </div>
            {sessionError ? <p className="text-sm text-[var(--danger)]">{sessionError}</p> : null}
            {sessionMessage ? (
              <p className="text-sm text-[var(--brand)]">{sessionMessage}</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
