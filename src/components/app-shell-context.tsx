"use client";

import { createContext, useContext } from "react";

import type { Profile } from "@/types/database";

type AppShellContextValue = {
  profile: Profile;
  displayName: string;
  signOut: () => Promise<void>;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({
  value,
  children,
}: {
  value: AppShellContextValue;
  children: React.ReactNode;
}) {
  return (
    <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
  );
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return ctx;
}

export function useAppShellOptional() {
  return useContext(AppShellContext);
}
