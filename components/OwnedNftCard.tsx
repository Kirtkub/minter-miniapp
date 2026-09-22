import { useState } from "react";
import type { OwnedNft } from "../types";
import { proxiedPrivateImageUrl } from "../lib/nft";

interface Props {
  item: OwnedNft;
  onError?: (message: string) => void;
}

export default function OwnedNftCard({ item, onError }: Props) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const metadata = item.metadata;
  const proxiedUrl = metadata ? proxiedPrivateImageUrl(metadata.privateImage) : null;

  async function handleSave() {
    if (!proxiedUrl || !metadata) return;
    setIsSaving(true);
    try {
      const res = await fetch(proxiedUrl);
      if (!res.ok) throw new Error("Could not download the image.");
      const blob = await res.blob();

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      const safeName = metadata.name.replace(/[^a-z0-9_\-]+/gi, "_");
      a.download = `${safeName || "nft"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Save image failed:", err);
      onError?.(err instanceof Error ? err.message : "Failed to save image.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="card">
      {proxiedUrl ? (
        <>
          {!imgLoaded && <div className="image-skeleton" />}
          <img
            className="card-image"
            style={{ display: imgLoaded ? "block" : "none" }}
            src={proxiedUrl}
            alt={metadata?.name ?? `NFT #${item.index}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => onError?.("Failed to load private image.")}
          />
        </>
      ) : (
        <div className="image-skeleton" />
      )}
      <div className="card-body">
        <p className="card-title">{metadata?.name ?? `Item #${item.index}`}</p>
        <span className="card-meta">Index #{item.index}</span>
        <button className="btn" disabled={!proxiedUrl || isSaving} onClick={handleSave}>
          {isSaving ? (
            <span className="spinner small" aria-label="Preparing download" />
          ) : (
            "Save image"
          )}
        </button>
      </div>
    </div>
  );
}
