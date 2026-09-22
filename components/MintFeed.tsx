import { useCallback, useEffect, useState } from "react";
import type { MintableNft } from "../types";
import { fetchMintFeed } from "../lib/nft";
import NftCard from "./NftCard";

export default function MintFeed() {
  const [nfts, setNfts] = useState<MintableNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const feed = await fetchMintFeed();
      setNfts(feed);
    } catch (err) {
      console.error(err);
      setError("Could not load the mint feed. Pull to refresh or try again shortly.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (error) {
    return (
      <div className="empty-state">
        {error}
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!nfts) {
    return (
      <div className="loader-wrap">
        <div className="spinner" />
        Loading available drops…
      </div>
    );
  }

  const visible = nfts.filter((n) => !n.isSoldOut || n.isWithinMintWindow);

  if (visible.length === 0) {
    return <div className="empty-state">No drops available right now. Check back soon 🔥</div>;
  }

  return (
    <>
      <div className="grid">
        {visible.map((nft) => (
          <NftCard
            key={nft.index}
            nft={nft}
            onMinted={() => {
              setToast({ type: "success", text: "Mint transaction sent! It may take a moment to confirm." });
              load();
            }}
            onError={(msg) => setToast({ type: "error", text: msg })}
          />
        ))}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
    </>
  );
}
