"use client";

import { useState } from "react";
import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { COPY } from "@/lib/copy";
import type { MintableNft } from "@/lib/nft-types";
import { formatTon } from "@/lib/ton";
import { tonConnectNetwork } from "@/lib/ton-connect-network";
import { Countdown } from "./ui";

export function MintCard({
  item,
  onNotice,
}: {
  item: MintableNft;
  onNotice: (message: string, isError?: boolean) => void;
}) {
  const wallet = useTonWallet();
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [busy, setBusy] = useState(false);

  const remaining = Math.max(0, item.metadata.maxSupply - item.mintedCount);
  const priceLabel = `${formatTon(item.mintingPriceNano)} TON`;

  async function mint() {
    if (!wallet || !address) {
      onNotice(COPY.mint.connectFirst, true);
      await tonConnectUI.openModal();
      return;
    }

    setBusy(true);
    onNotice(COPY.mint.signing);

    try {
      const response = await fetch("/api/generate-mint-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadataUrl: item.metadataUrl,
          walletAddress: address,
          itemIndex: item.index,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        bodyBoc?: string;
        amountNano?: string;
        collectionAddress?: string;
      };
      if (!response.ok || !data.bodyBoc || !data.amountNano || !data.collectionAddress) {
        throw new Error(data.error || COPY.errors.signature);
      }

      onNotice(COPY.mint.broadcasting);
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: tonConnectNetwork(),
        messages: [
          {
            address: data.collectionAddress,
            amount: data.amountNano,
            payload: data.bodyBoc,
          },
        ],
      });
      onNotice(COPY.mint.success);
    } catch (error) {
      const message = error instanceof Error ? error.message : COPY.mint.failed;
      if (/reject|cancel|denied/i.test(message)) {
        onNotice(COPY.mint.rejected, true);
      } else {
        onNotice(message || COPY.mint.failed, true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card">
      <div className="image-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.metadata.image} alt={item.metadata.name} />
      </div>
      <div className="card-body">
        <h2>{item.metadata.name}</h2>
        {item.metadata.description ? <p className="muted">{item.metadata.description}</p> : null}
        <dl className="meta">
          <div>
            <dt>{COPY.mint.price}</dt>
            <dd>{priceLabel}</dd>
          </div>
          <div>
            <dt>{COPY.mint.supply}</dt>
            <dd>
              {item.mintedCount}/{item.metadata.maxSupply} · {remaining} left
            </dd>
          </div>
        </dl>
        {item.metadata.attributes?.length ? (
          <div className="attrs">
            <p className="label">{COPY.mint.attributes}</p>
            <ul>
              {item.metadata.attributes.map((attr) => (
                <li key={`${attr.trait_type}-${attr.value}`}>
                  <span>{attr.trait_type}</span>
                  <strong>{String(attr.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="label">
          {COPY.mint.endsIn} <Countdown endMs={item.mintEndMs} />
        </p>
        <button type="button" className="primary" disabled={busy} onClick={() => void mint()}>
          {busy ? COPY.mint.broadcasting : COPY.mint.action}
        </button>
      </div>
    </article>
  );
}
