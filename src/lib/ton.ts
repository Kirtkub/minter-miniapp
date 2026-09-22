import { Address, fromNano, toNano } from "@ton/core";
import { APP_CONFIG, APP_RUNTIME, type TonChain } from "@/config";

export function isTestnet(chain: TonChain = APP_CONFIG.tonChain): boolean {
  return chain === "Testnet";
}

export function tonApiBaseUrl(chain: TonChain = APP_CONFIG.tonChain): string {
  return isTestnet(chain) ? "https://testnet.tonapi.io" : "https://tonapi.io";
}

export function parseFriendlyAddress(value: string): Address {
  return Address.parse(value);
}

export function toRawAddress(value: string): string {
  return Address.parse(value).toRawString();
}

export function formatTon(nano: bigint | string): string {
  const asBig = typeof nano === "string" ? BigInt(nano) : nano;
  const value = fromNano(asBig);
  const [whole, frac = ""] = value.split(".");
  const trimmedFrac = frac.replace(/0+$/, "").slice(0, 4);
  return trimmedFrac ? `${whole}.${trimmedFrac}` : whole;
}

export function parsePriceToNano(price: unknown): bigint {
  if (typeof price === "number" && Number.isFinite(price)) {
    return toNano(String(price));
  }
  if (typeof price === "string" && price.trim().length > 0) {
    const trimmed = price.trim().toUpperCase().replace(/TON$/, "").trim();
    if (/^\d+$/.test(trimmed) && BigInt(trimmed) > toNano("1000")) {
      return BigInt(trimmed);
    }
    return toNano(trimmed);
  }
  return toNano(APP_RUNTIME.defaultMintingPriceTon);
}

export function mintTotalNano(mintingPriceNano: bigint): bigint {
  return mintingPriceNano + toNano(APP_RUNTIME.mintGasTon);
}

export async function tonApiFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.TONAPI_KEY) {
    headers.Authorization = `Bearer ${process.env.TONAPI_KEY}`;
  }
  const response = await fetch(`${tonApiBaseUrl()}${path}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`TonAPI request failed (${response.status})`);
  }
  return (await response.json()) as T;
}
