"use client";

import { useEffect, useState } from "react";
import { THEME, TonConnectUIProvider } from "@tonconnect/ui-react";
import { TelegramBoot } from "@/lib/telegram";

export function Providers({ children }: { children: React.ReactNode }) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);

  useEffect(() => {
    setManifestUrl(`${window.location.origin}/tonconnect-manifest.json`);
  }, []);

  if (!manifestUrl) {
    return (
      <>
        <TelegramBoot />
        {children}
      </>
    );
  }

  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      uiPreferences={{ theme: THEME.DARK, borderRadius: "s" }}
    >
      <TelegramBoot />
      {children}
    </TonConnectUIProvider>
  );
}
