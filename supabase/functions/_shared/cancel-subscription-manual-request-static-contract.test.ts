import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(
  new URL("../cancel-subscription/index.ts", import.meta.url),
);

Deno.test("cancel-subscription records a manual request instead of terminal cancellation", () => {
  assertStringIncludes(source, "subscription_events");
  assertStringIncludes(source, "subscription.cancellation_requested");
  assertStringIncludes(source, "account.cancellation_requested");
  assertStringIncludes(source, "account.cancellation_scheduled");
  assertStringIncludes(source, "account.cancellation_provider_failed");
  assertStringIncludes(source, "account.cancellation_provider_cancelled");
  assertStringIncludes(source, "manual_review");
  assertStringIncludes(source, "REQUEST_MANUAL_CANCELLATION");
  assertStringIncludes(source, "REQUEST_ACCOUNT_CANCELLATION");
  assertStringIncludes(source, "SCHEDULE_ACCOUNT_CANCELLATION");
  assertStringIncludes(source, "ACCOUNT_CANCELLATION_PROVIDER_FAILED");
  assertStringIncludes(source, "ACCOUNT_CANCELLATION_PROVIDER_CANCELLED");
  assertStringIncludes(source, "previous_status: input.subscription?.status");
  assertStringIncludes(source, "next_status: input.subscription?.status");
  assert(!/next_status:\s*["']cancelled["']/.test(source));
  assertStringIncludes(source, "cancel_at_period_end: true");
  assertStringIncludes(source, 'cancel_reason: "account_cancellation_requested"');
  assert(!/Suscripci[oó]n cancelada/i.test(source));
});

Deno.test("cancel-subscription keeps Mercado Pago provider identifiers for future automation", () => {
  assertStringIncludes(source, "provider_subscription_id");
  assertStringIncludes(source, "mp_preapproval_id");
  assertStringIncludes(source, "resolveProviderSubscriptionId");
  assert(
    !/providerSubscriptionId\s*=\s*[\s\S]{0,120}currentSubscription\.id/.test(
      source,
    ),
  );
  assertStringIncludes(source, "MP_ACCESS_TOKEN");
  assertStringIncludes(source, "api.mercadopago.com");
  assertStringIncludes(source, "encodeURIComponent(input.providerSubscriptionId)");
  assertStringIncludes(source, 'body: JSON.stringify({ status: "cancelled" })');
});

Deno.test("cancel-subscription uses a deterministic manual cancellation idempotency key", () => {
  assertStringIncludes(source, '"orvel_manual"');
  assertStringIncludes(source, '"orvel_account"');
  assertStringIncludes(source, 'manual-cancel-request:${currentSubscription!.id}');
  assertStringIncludes(source, 'account-cancel-request:${business_id}:${currentSubscription?.id || "no-subscription"}');
  assertStringIncludes(source, '${accountCancellationBaseId}:requested');
  assertStringIncludes(source, '${accountCancellationBaseId}:provider-cancelled');
  assertStringIncludes(source, '${accountCancellationBaseId}:scheduled');
  assertStringIncludes(source, '${accountCancellationBaseId}:provider-failed');
  assertStringIncludes(source, "provider: eventProvider");
  assertStringIncludes(source, "provider_event_id: input.providerEventId");
  assertStringIncludes(source, '.eq("provider", eventProvider)');
  assertStringIncludes(
    source,
    '.eq("provider_event_id", cancellationRequestProviderEventId)',
  );
  assertStringIncludes(source, 'error?.code === "23505"');
  assert(!/const eventProvider\s*=\s*currentSubscription\./.test(source));
  assert(
    !/provider_event_id:\s*`manual-cancel-request:\$\{currentSubscription\.id\}:/
      .test(source),
  );
  assert(
    !/provider_event_id:[\s\S]{0,120}(?:Date\.now\(\)|getTime\(\)|requestedAt)/
      .test(source),
  );
});

Deno.test("subscription_events allows nullable provider_subscription_id for honest manual requests", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/_legacy/20260703190000_allow_nullable_subscription_event_provider_subscription_id.sql",
      import.meta.url,
    ),
  );

  assertStringIncludes(migration, "ALTER TABLE public.subscription_events");
  assertStringIncludes(
    migration,
    "ALTER COLUMN provider_subscription_id DROP NOT NULL",
  );
});

Deno.test("cancel-subscription response copy stays in manual request mode", () => {
  assertStringIncludes(source, "Solicitud de baja recibida");
  assertStringIncludes(source, "procesar manualmente");
  assertStringIncludes(source, "manual_support_processing");
  assertStringIncludes(source, "Baja de cuenta solicitada");
  assertStringIncludes(source, "mantenemos el acceso hasta el final del período pago");
  assert(!/cancelaci[oó]n completada|ya est[aá] cancelada/i.test(source));
});

Deno.test("cancel-subscription preserves manual provider ids but omits them for account cancellation responses", () => {
  assertStringIncludes(source, "function buildSubscriptionResponse");
  assertStringIncludes(source, "includeProviderSubscriptionId: true");
  assertStringIncludes(source, "response.provider_subscription_id");
  assertStringIncludes(source, "buildScheduledAccountCancellationResponse");
  assert(!/subscription:\s*buildSubscriptionResponse\(currentSubscription,\s*\{\s*includeProviderSubscriptionId:\s*true[\s\S]{0,260}account_closure_at/.test(source));
});
