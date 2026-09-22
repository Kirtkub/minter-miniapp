import { CHAIN } from "@tonconnect/ui-react";
import { isTestnet } from "./ton";

export function tonConnectNetwork(): CHAIN {
  return isTestnet() ? CHAIN.TESTNET : CHAIN.MAINNET;
}
