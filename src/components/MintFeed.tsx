"use client";

import { useEffect, useState } from "react";
import { COPY } from "@/lib/copy";
import type { MintableNft } from "@/lib/nft-types";
import { MintCard } from "./MintCard";
import { SkeletonCard, Spinner } from "./ui";

export function MintFeed({
  onNotice,
}: {
  onNotice: (message: string, isError?: boolean) => void;
}) {
  const [items, setItems] = useState<MintableNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/nft-feed", { cache: "no-store" });
        const data = (await response.json()) as { items?: MintableNft[]; error?: string };
        if (!response.ok) throw new Error(data.error || COPY.errors.metadata);
        if (!cancelled) setItems(data.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : COPY.errors.metadata);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="banner error">{error}</p>;
  if (!items) {
    return (
      <section className="stack">
        <Spinner label={COPY.mint.loading} />
        <SkeletonCard />
        <SkeletonCard />
      </section>
    );
  }
  if (items.length === 0) return <p className="muted">{COPY.mint.empty}</p>;

  return (
    <section className="stack">
      {items.map((item) => (
        <MintCard key={item.metadataUrl} item={item} onNotice={onNotice} />
      ))}
    </section>
  );
}
