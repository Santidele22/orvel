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
  assertStringIncludes(source, "manual_review");
  assertStringIncludes(source, "REQUEST_MANUAL_CANCELLATION");
  assertStringIncludes(source, "previous_status: currentSubscription.status");
  assertStringIncludes(source, "next_status: currentSubscription.status");
  assert(!/status:\s*["']cancelled["']/.test(source));
  assert(!/next_status:\s*["']cancelled["']/.test(source));
  assert(
    !/\.from\(["']business_subscriptions["']\)[\s\S]{0,240}\.update\s*\(/.test(
      source,
    ),
  );
  assert(!/Suscripci[oó]n cancelada/i.test(source));
});

Deno.test("cancel-subscription keeps Mercado Pago provider identifiers for future automation", () => {
  assertStringIncludes(source, "provider_subscription_id");
  assertStringIncludes(source, "mp_preapproval_id");
  assert(/currentSubscription\.mp_preapproval_id\s*\|\|\s*null/.test(source));
  assert(
    !/providerSubscriptionId\s*=\s*[\s\S]{0,120}currentSubscription\.id/.test(
      source,
    ),
  );
  assert(!/mercadopago\.com|api\.mercadopago|MP_ACCESS_TOKEN/.test(source));
});

Deno.test("cancel-subscription uses a deterministic manual cancellation idempotency key", () => {
  assertStringIncludes(source, 'const eventProvider = "orvel_manual"');
  assert(
    /const cancellationRequestProviderEventId\s*=\s*`manual-cancel-request:\$\{currentSubscription\.id\}`/
      .test(source),
  );
  assertStringIncludes(source, "provider: eventProvider");
  assertStringIncludes(
    source,
    "provider_event_id: cancellationRequestProviderEventId",
  );
  assertStringIncludes(source, '.eq("provider", eventProvider)');
  assertStringIncludes(
    source,
    '.eq("provider_event_id", cancellationRequestProviderEventId)',
  );
  assertStringIncludes(source, 'eventError?.code === "23505"');
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
      "../../migrations/20260703190000_allow_nullable_subscription_event_provider_subscription_id.sql",
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
  assert(!/cancelaci[oó]n completada|ya est[aá] cancelada/i.test(source));
});
