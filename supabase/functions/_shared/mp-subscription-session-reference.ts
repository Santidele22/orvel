export type BillingSessionReferenceKind = "preapproval" | "subscription" | "checkout_legacy";

export interface BillingSessionReference {
  kind: BillingSessionReferenceKind;
  value: string;
  canonical: boolean;
}

const PREAPPROVAL_SESSION_PREFIX = "preapproval-session:";
const SUBSCRIPTION_SESSION_PREFIX = "subscription-session:";
const LEGACY_CHECKOUT_SESSION_PREFIX = "checkout-session:";

export function createSubscriptionSessionReference(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error("subscription session reference value is required");
  }

  return `${PREAPPROVAL_SESSION_PREFIX}${normalizedValue}`;
}

export function parseBillingSessionReference(reference: string | null | undefined): BillingSessionReference | null {
  if (typeof reference !== "string") return null;

  const normalizedReference = reference.trim();
  if (!normalizedReference) return null;

  if (normalizedReference.startsWith(PREAPPROVAL_SESSION_PREFIX)) {
    const value = normalizedReference.slice(PREAPPROVAL_SESSION_PREFIX.length);
    return value ? { kind: "preapproval", value, canonical: true } : null;
  }

  if (normalizedReference.startsWith(SUBSCRIPTION_SESSION_PREFIX)) {
    const value = normalizedReference.slice(SUBSCRIPTION_SESSION_PREFIX.length);
    return value ? { kind: "subscription", value, canonical: true } : null;
  }

  if (normalizedReference.startsWith(LEGACY_CHECKOUT_SESSION_PREFIX)) {
    const value = normalizedReference.slice(LEGACY_CHECKOUT_SESSION_PREFIX.length);
    return value ? { kind: "checkout_legacy", value, canonical: false } : null;
  }

  return null;
}

export function isLegacyCheckoutSessionReference(reference: string | null | undefined): boolean {
  return parseBillingSessionReference(reference)?.kind === "checkout_legacy";
}
