import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const CREATE_SUBSCRIPTION = new URL("../create-subscription/index.ts", import.meta.url);
const MP_WEBHOOK = new URL("../mercadopago-webhook/index.ts", import.meta.url);

async function source(path: URL): Promise<string> {
  return Deno.readTextFile(path);
}

function sliceBetween(sourceText: string, startMarker: string, endMarker?: string): string {
  const start = sourceText.indexOf(startMarker);
  assert(start >= 0, `Missing start marker: ${startMarker}`);
  const end = endMarker ? sourceText.indexOf(endMarker, start + startMarker.length) : sourceText.length;
  assert(end > start, `Missing end marker: ${endMarker}`);
  return sourceText.slice(start, end);
}

Deno.test("payment-first create-subscription starts Mercado Pago from pending signup intent without account-first or pre-approval materialization", async () => {
  const sourceText = await source(CREATE_SUBSCRIPTION);
  const preapprovalSection = sliceBetween(sourceText, "// 5. CREATE MERCADO PAGO PREAPPROVAL", "// Build MP preapproval request");

  assertStringIncludes(sourceText, "pending_signup_intent");
  assert(sourceText.match(/mode\s*===\s*["']pending_signup_intent["']|body\.mode\s*===\s*["']pending_signup_intent["']/), "create-subscription must expose pending_signup_intent mode");
  assert(!sourceText.match(/account_first|accountFirst/), "payment-first contract replaces obsolete account-first sessions");
  assert(!preapprovalSection.match(/auth\.admin\.createUser|from\(["']businesses["']\)\s*\.insert|from\(["']business_subscriptions["']\)\s*\.insert/i), "create-subscription must not create auth users, businesses, or subscriptions before MP approval");
});

Deno.test("approved Mercado Pago webhook materializes pending signup into auth account, business, and active subscription", async () => {
  const sourceText = await source(MP_WEBHOOK);
  const materializeSection = sliceBetween(sourceText, "async function materializePendingSignup", "async function verifyPaymentStatus");
  const approvedWebhookPath = sliceBetween(sourceText, "validate_pending_signup_subscription_session", "// =============================================================================\n    // 6. UPDATE BUSINESS SUBSCRIPTION");

  assert(materializeSection.match(/auth\s*\.\s*admin\.createUser/), "approved webhook must create the auth user");
  assert(materializeSection.match(/from\(["']businesses["']\)[\s\S]{0,300}\.insert/i), "approved webhook must create the business");
  assert(materializeSection.match(/from\(["']business_subscriptions["']\)[\s\S]{0,500}status:\s*["']active["']/i), "approved webhook must create an active subscription");
  assert(approvedWebhookPath.match(/approved|active/i), "materialization must live on the approved payment path");
  assert(approvedWebhookPath.indexOf("validate_pending_signup_subscription_session") < approvedWebhookPath.indexOf("materializePendingSignup"), "webhook must validate the pending signup session before materialization");
});
