import { APP_RUNTIME } from "@/config";

export function isAllowedAssetUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return APP_RUNTIME.metadataHostAllowlist.includes(
      url.hostname as (typeof APP_RUNTIME.metadataHostAllowlist)[number],
    );
  } catch {
    return false;
  }
}

export function privateImageProxySrc(privateImageUrl: string): string {
  const params = new URLSearchParams({ url: privateImageUrl });
  return `/api/private-image-proxy?${params.toString()}`;
}
