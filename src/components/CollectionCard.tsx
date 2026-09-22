"use client";

import { useState } from "react";
import { COPY } from "@/lib/copy";
import type { OwnedNft } from "@/lib/nft-types";
import { saveImageFromUrl } from "@/lib/save-image";
import { privateImageProxySrc } from "@/lib/urls";

export function CollectionCard({
  nft,
  onNotice,
}: {
  nft: OwnedNft;
  onNotice: (message: string, isError?: boolean) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const src = nft.privateImage
    ? privateImageProxySrc(nft.privateImage)
    : nft.publicImage;

  async function save() {
    if (!src) return;
    setSaving(true);
    onNotice(COPY.collection.saving);
    try {
      const safeName = `${nft.name.replace(/[^\w.-]+/g, "_")}-${nft.index}.jpg`;
      await saveImageFromUrl(src, safeName);
      onNotice(COPY.collection.saved);
    } catch {
      onNotice(COPY.collection.saveFailed, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card">
      <div className="image-wrap">
        {!loaded && !failed ? <div className="skeleton image-skeleton overlay" /> : null}
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={nft.name}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : (
          <p className="muted center">{COPY.collection.imageError}</p>
        )}
      </div>
      <div className="card-body">
        <h2>{nft.name}</h2>
        {nft.description ? <p className="muted">{nft.description}</p> : null}
        <button type="button" className="primary" disabled={!src || saving} onClick={() => void save()}>
          {saving ? COPY.collection.saving : COPY.collection.save}
        </button>
      </div>
    </article>
  );
}
