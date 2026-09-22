import { useState } from "react";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import type { MintableNft, GenerateMintSignatureResponse } from "../types";
import CountdownTimer from "./CountdownTimer";
import { buildMintTransaction } from "../lib/mintTransaction";

interface Props {
  nft: MintableNft;
  onMinted?: (index: number) => void;
  onError?: (message: string) => void;
}

export default function NftCard({ nft, onMinted, onError }: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();
  const [isMinting, setIsMinting] = useState(false);

  const { metadata, index, isAvailable, isSoldOut, isWithinMintWindow } = nft;

  async function handleMint() {
    if (!walletAddress) {
      onError?.("Connect your TON wallet first.");
      return;
    }
    setIsMinting(true);
    try {
      const sigRes = await fetch("/api/generate-mint-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadataUrl: nft.metadataUrl,
          walletAddress,
          itemIndex: index
        })
      });

      if (!sigRes.ok) {
        const body = await sigRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to authorize mint.");
      }

      const authorization = (await sigRes.json()) as GenerateMintSignatureResponse;

      const tx = buildMintTransaction({
        itemIndex: index,
        walletAddress,
        mintingPriceTon: metadata.mintingPrice,
        authorization
      });

      await tonConnectUI.sendTransaction(tx);
      onMinted?.(index);
    } catch (err) {
      console.error("Mint failed:", err);
      onError?.(err instanceof Error ? err.message : "Mint failed. Please try again.");
    } finally {
      setIsMinting(false);
    }
  }

  return (
    <div className="card">
      <img
        className="card-image"
        src={metadata.image}
        alt={metadata.name}
        loading="lazy"
      />
      <div className="card-body">
        {isSoldOut && <span className="status-pill sold-out">Sold out</span>}
        {!isSoldOut && isWithinMintWindow && (
          <span className="status-pill live">Live</span>
        )}
        <p className="card-title">{metadata.name}</p>
        <span className="card-price">{metadata.mintingPrice} TON</span>
        <span className="card-meta">Max supply: {metadata.maxSupply}</span>

        {metadata.attributes?.length > 0 && (
          <div className="attributes">
            {metadata.attributes.slice(0, 4).map((attr, i) => (
              <span className="attr-pill" key={`${attr.trait_type}-${i}`}>
                {attr.trait_type}: {attr.value}
              </span>
            ))}
          </div>
        )}

        <CountdownTimer targetDate={metadata.mintEndDate} />

        <button
          className="btn"
          disabled={!isAvailable || isMinting}
          onClick={handleMint}
        >
          {isMinting ? (
            <span className="spinner small" aria-label="Broadcasting transaction" />
          ) : isSoldOut ? (
            "Sold out"
          ) : !isWithinMintWindow ? (
            "Not open"
          ) : (
            "Mint now"
          )}
        </button>
      </div>
    </div>
  );
}
