import { PropsWithChildren } from "react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

/**
 * manifestUrl must be reachable over https and match the deployed domain —
 * see public/tonconnect-manifest.json. Update its `url` field to your real
 * Vercel deployment URL before shipping.
 */
const MANIFEST_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/tonconnect-manifest.json`
    : "/tonconnect-manifest.json";

export default function TonConnectProvider({ children }: PropsWithChildren) {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      {children}
    </TonConnectUIProvider>
  );
}
