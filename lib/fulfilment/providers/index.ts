import { appMode, ConfigError, giftCardProviderCode } from "../../config";
import type { GiftCardProvider } from "../types";
import { demoGiftCardProvider } from "./demo";

/*
 * Registered gift-card provider adapters, keyed by Provider.code.
 * Pine Labs: after official API docs + credentials, add
 * lib/fulfilment/providers/pine-labs.ts implementing GiftCardProvider and
 * register it here as PINELABS. Nothing else in the app changes.
 */
const PROVIDERS: Record<string, GiftCardProvider> = {
  DEMO: demoGiftCardProvider,
};

export function getProvider(code: string): GiftCardProvider {
  const provider = PROVIDERS[code];
  if (!provider) throw new ConfigError(`Unknown gift-card provider "${code}".`);
  if (provider.isDemo && appMode() === "live") {
    throw new ConfigError(
      "The demo gift-card provider is disabled in live mode.",
    );
  }
  return provider;
}

/** The provider the catalogue is synced from (GIFT_CARD_PROVIDER). */
export function activeProvider(): GiftCardProvider {
  return getProvider(giftCardProviderCode());
}
