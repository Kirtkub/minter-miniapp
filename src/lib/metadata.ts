import { APP_CONFIG } from "@/config";
import type { NftMetadata } from "./nft-types";
import { isAllowedAssetUrl } from "./urls";

function toUnixMs(value: number | string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    return value > 1e12 ? value : value * 1000;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mintWindow(metadata: NftMetadata): { startMs: number; endMs: number } {
  const startMs = toUnixMs(metadata.mintStartDate, 0);
  const endSource = metadata.mintEndDate ?? metadata.mintDeadline;
  const endMs = toUnixMs(endSource, Number.MAX_SAFE_INTEGER);
  return { startMs, endMs };
}

export function isMintWindowOpen(metadata: NftMetadata, now = Date.now()): boolean {
  const { startMs, endMs } = mintWindow(metadata);
  return now >= startMs && now <= endMs;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return (await response.json()) as T;
}

export async function loadMetadataIndex(): Promise<string[]> {
  const urls = await fetchJson<string[]>(APP_CONFIG.nftsMetadataIndex);
  if (!Array.isArray(urls)) {
    throw new Error("Metadata index is not an array");
  }
  return urls.filter((url) => typeof url === "string" && isAllowedAssetUrl(url));
}

export async function loadNftMetadata(url: string): Promise<NftMetadata> {
  if (!isAllowedAssetUrl(url)) {
    throw new Error("Metadata URL is not allowed");
  }
  const data = await fetchJson<NftMetadata>(url);
  if (!data?.name || !data?.image || typeof data.maxSupply !== "number") {
    throw new Error("NFT metadata is incomplete");
  }
  return data;
}

export function metadataUriFromItem(item: {
  metadata?: { metadata_url?: string };
  metadata_url?: string;
  content?: { uri?: string };
}): string | undefined {
  return (
    item.metadata_url ||
    item.metadata?.metadata_url ||
    item.content?.uri ||
    undefined
  );
}
