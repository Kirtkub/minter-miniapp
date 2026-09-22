"use client";

import { useMemo, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";
import { APP_CONFIG } from "@/config";
import { COPY } from "@/lib/copy";
import { BottomNav } from "./BottomNav";
import { MintFeed } from "./MintFeed";
import { MyCollection } from "./MyCollection";

export function AppShell() {
  const [tab, setTab] = useState<"mint" | "collection">("mint");
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const wallet = useTonWallet();

  const chainLabel =
    APP_CONFIG.tonChain === "Mainnet" ? COPY.status.mainnet : COPY.status.testnet;

  const onNotice = (text: string, isError = false) => {
    setNotice({ text, isError });
  };

  const headerTitle = useMemo(
    () => (tab === "mint" ? COPY.mint.title : COPY.collection.title),
    [tab],
  );

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">{COPY.appName}</p>
          <h1>{headerTitle}</h1>
          <p className="muted small">{chainLabel}</p>
        </div>
        <TonConnectButton />
      </header>

      {notice ? (
        <p className={notice.isError ? "banner error" : "banner"}>{notice.text}</p>
      ) : null}

      {!wallet && tab === "mint" ? (
        <p className="muted">{COPY.wallet.required}</p>
      ) : null}

      <main>
        {tab === "mint" ? (
          <>
            <p className="lead">{COPY.mint.subtitle}</p>
            <MintFeed onNotice={onNotice} />
          </>
        ) : (
          <>
            <p className="lead">{COPY.collection.subtitle}</p>
            <MyCollection onNotice={onNotice} />
          </>
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}
