"use client";

import { useEffect, useState } from "react";
import { useTonAddress } from "@tonconnect/ui-react";
import { COPY } from "@/lib/copy";
import type { OwnedNft } from "@/lib/nft-types";
import { CollectionCard } from "./CollectionCard";
import { SkeletonCard, Spinner } from "./ui";

export function MyCollection({
  onNotice,
}: {
  onNotice: (message: string, isError?: boolean) => void;
}) {
  const address = useTonAddress();
  const [items, setItems] = useState<OwnedNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setItems(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setItems(null);
    (async () => {
      try {
        const response = await fetch(`/api/my-nfts?wallet=${encodeURIComponent(address)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { items?: OwnedNft[]; error?: string };
        if (!response.ok) throw new Error(data.error || COPY.errors.chain);
        if (!cancelled) setItems(data.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : COPY.errors.chain);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) return <p className="muted">{COPY.collection.connectPrompt}</p>;
  if (error) return <p className="banner error">{error}</p>;
  if (!items) {
    return (
      <section className="stack">
        <Spinner label={COPY.collection.loading} />
        <SkeletonCard />
      </section>
    );
  }
  if (items.length === 0) return <p className="muted">{COPY.collection.empty}</p>;

  return (
    <section className="stack">
      {items.map((nft) => (
        <CollectionCard key={nft.address} nft={nft} onNotice={onNotice} />
      ))}
    </section>
  );
}
