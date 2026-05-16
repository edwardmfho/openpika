"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SetupOverlay } from "@/components/SetupOverlay";
import { useAppStore } from "@/store/store";
import { fetchSetupStatus } from "@/lib/api";

export default function Home() {
  const theme = useAppStore((s) => s.settings.theme);
  const updateSettings = useAppStore((s) => s.updateSettings);
  // null = still checking, true = show overlay, false = ready
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    }
  }, [theme]);

  useEffect(() => {
    fetchSetupStatus().then((status) => {
      if (!status) {
        // Backend unreachable — don't block the UI
        setNeedsSetup(false);
        return;
      }
      if (status.ready) {
        updateSettings({ model: status.model });
        setNeedsSetup(false);
      } else {
        setNeedsSetup(true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppShell />
      {needsSetup && (
        <SetupOverlay
          onComplete={(model) => {
            updateSettings({ model });
            setNeedsSetup(false);
          }}
        />
      )}
    </>
  );
}
