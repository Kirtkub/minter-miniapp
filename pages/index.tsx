import { useState } from "react";
import Head from "next/head";
import { TonConnectButton, useTonAddress } from "@tonconnect/ui-react";
import BottomNav, { AppTab } from "../components/BottomNav";
import MintFeed from "../components/MintFeed";
import MyCollection from "../components/MyCollection";

export default function Home() {
  const [tab, setTab] = useState<AppTab>("mint");
  const walletAddress = useTonAddress();

  return (
    <>
      <Head>
        <title>Spicy Pic Mint</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0f0f12" />
      </Head>

      <div className="app-shell">
        <header className="app-header">
          <h1>{tab === "mint" ? "Mint Spicy Pic" : "My Collection"}</h1>
          <div className="tonconnect-btn-wrap">
            <TonConnectButton />
          </div>
        </header>
        {!walletAddress && (
          <p className="connect-hint">Connect your TON wallet to mint and view your items.</p>
        )}

        <main className="content">
          {tab === "mint" ? <MintFeed /> : <MyCollection />}
        </main>
      </div>

      <BottomNav active={tab} onChange={setTab} />
    </>
  );
}
