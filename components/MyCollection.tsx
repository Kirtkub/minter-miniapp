import { useCallback, useEffect, useState } from "react";
import { useTonAddress } from "@tonconnect/ui-react";
import type { OwnedNft } from "../types";
import { APP_CONFIG } from "../config";
import { getOwnedNftsFromTonApi } from "../lib/ton";
import { resolveOwnedNftMetadata } from "../lib/nft";
import OwnedNftCard from "./OwnedNftCard";

export default function MyCollection() {
  const walletAddress = useTonAddress();
  const [items, setItems] = useState<OwnedNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!walletAddress) {
      setItems(null);
      return;
    }
    setError(null);
    setItems(null);
    try {
      const raw = await getOwnedNftsFromTonApi(walletAddress, APP_CONFIG.collectionAddress);
      const resolved = await resolveOwnedNftMetadata(raw);
      setItems(resolved);
    } catch (err) {
      console.error(err);
      setError("Could not load your collection. Try again shortly.");
    }
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!walletAddress) {
    return (
      <div className="empty-state">
        Connect your TON wallet to view items you own in this collection.
      </div>
    );
  }

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

  if (!items) {
    return (
      <div className="loader-wrap">
        <div className="spinner" />
        Scanning your wallet…
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="empty-state">You don&apos;t own any items yet. Go mint one! 🔥</div>;
  }

  return (
    <>
      <div className="grid">
        {items.map((item) => (
          <OwnedNftCard key={item.address} item={item} onError={setToast} />
        ))}
      </div>
      {toast && <div className="toast error">{toast}</div>}
    </>
  );
}
