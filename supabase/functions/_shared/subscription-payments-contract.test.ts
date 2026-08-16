import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSubscriptionPaymentInsert,
  type SubscriptionPaymentSupabaseClient,
  upsertSubscriptionPayment,
} from "./subscription-payments.ts";

const repoRoot = new URL("../../../", import.meta.url);
const functionsDir = new URL("../", import.meta.url);
const dashboardSrcDir = new URL(
  "../../../apps/dashboard/src/",
  import.meta.url,
);
const migrationsDir = new URL("../../migrations/", import.meta.url);

async function readText(url: URL): Promise<string> {
  return await Deno.readTextFile(url);
}

async function collectFiles(dir: URL, extension: string): Promise<URL[]> {
  const files: URL[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name, `${dir.href}/`);
    if (entry.isDirectory) {
      files.push(...await collectFiles(child, extension));
    } else if (entry.isFile && entry.name.endsWith(extension)) {
      files.push(child);
    }
  }
  return files;
}

Deno.test("billing ledger pruning contract: runtime no longer writes legacy payment ledgers", async () => {
  const runtimeFiles = [
    ...await collectFiles(functionsDir, ".ts"),
    ...await collectFiles(dashboardSrcDir, ".ts"),
  ];

  const offenders: string[] = [];
  for (const file of runtimeFiles) {
    const source = await readText(file);
    if (
      /\.from\(\s*["'](?:payments|mp_webhook_events)["']\s*\)\s*\.[\s\S]{0,120}(?:insert|upsert|update)\s*\(/
        .test(source)
    ) {
      offenders.push(file.href.replace(repoRoot.href, ""));
    }
  }

  assertEquals(
    offenders,
    [],
    "runtime must not write legacy payments or mp_webhook_events tables",
  );
});

function createSubscriptionPaymentMock(error: unknown | null = null) {
  const calls: Array<{ table: string; row: unknown; options: unknown }> = [];
  const client: SubscriptionPaymentSupabaseClient = {
    from(table: "subscription_payments") {
      return {
        async upsert(row, options) {
          calls.push({ table, row, options });
          return { error };
        },
      };
    },
  };

  return { client, calls };
}

Deno.test("subscription payment builder maps a mocked payment payload to canonical insert", () => {
  const record = buildSubscriptionPaymentInsert({
    subscriptionId: "sub-1",
    businessId: "business-1",
    tenantId: "tenant-1",
    provider: "manual",
    providerPaymentId: "payment-123",
    providerSubscriptionId: "preapproval-123",
    providerEventId: "event-123",
    amount: 16800,
    currency: "ARS",
    status: "approved",
    statusDetail: "accredited",
    paidAt: "2026-07-08T10:00:00.000Z",
    processedAt: "2026-07-08T10:00:01.000Z",
    rawPayload: { type: "payment", data: { id: "payment-123" } },
  });

  assertEquals(record, {
    subscription_id: "sub-1",
    business_id: "business-1",
    tenant_id: "tenant-1",
    provider: "manual",
    provider_payment_id: "payment-123",
    provider_subscription_id: "preapproval-123",
    provider_event_id: "event-123",
    amount: 16800,
    currency: "ARS",
    status: "approved",
    status_detail: "accredited",
    paid_at: "2026-07-08T10:00:00.000Z",
    processed_at: "2026-07-08T10:00:01.000Z",
    raw_payload: { type: "payment", data: { id: "payment-123" } },
  });
});

Deno.test("payment recording behavior: mocked approved payment writes one canonical subscription_payments row", async () => {
  const { client, calls } = createSubscriptionPaymentMock();

  const result = await upsertSubscriptionPayment(client, {
    subscriptionId: "sub-1",
    businessId: "business-1",
    tenantId: "tenant-1",
    provider: "manual",
    providerPaymentId: "payment-123",
    providerSubscriptionId: "preapproval-123",
    providerEventId: "event-123",
    amount: 16800,
    currency: "ARS",
    status: "approved",
    statusDetail: "accredited",
    paidAt: "2026-07-08T10:00:00.000Z",
    processedAt: "2026-07-08T10:00:01.000Z",
    rawPayload: { type: "payment", data: { id: "payment-123" } },
  });

  assertEquals(result.error, null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0], {
    table: "subscription_payments",
    row: {
      subscription_id: "sub-1",
      business_id: "business-1",
      tenant_id: "tenant-1",
      provider: "manual",
      provider_payment_id: "payment-123",
      provider_subscription_id: "preapproval-123",
      provider_event_id: "event-123",
      amount: 16800,
      currency: "ARS",
      status: "approved",
      status_detail: "accredited",
      paid_at: "2026-07-08T10:00:00.000Z",
      processed_at: "2026-07-08T10:00:01.000Z",
      raw_payload: { type: "payment", data: { id: "payment-123" } },
    },
    options: { onConflict: "provider,provider_payment_id" },
  });
});

Deno.test("payment recording behavior: mocked duplicate payment uses provider payment id upsert key", async () => {
  const { client, calls } = createSubscriptionPaymentMock();

  await upsertSubscriptionPayment(client, {
    subscriptionId: "sub-1",
    businessId: "business-1",
    provider: "manual",
    providerPaymentId: "payment-duplicate",
    providerEventId: "event-1",
    amount: 16800,
    currency: "ARS",
    status: "approved",
    processedAt: "2026-07-08T10:00:01.000Z",
  });
  await upsertSubscriptionPayment(client, {
    subscriptionId: "sub-1",
    businessId: "business-1",
    provider: "manual",
    providerPaymentId: "payment-duplicate",
    providerEventId: "event-2",
    amount: 16800,
    currency: "ARS",
    status: "approved",
    processedAt: "2026-07-08T10:00:02.000Z",
  });

  assertEquals(calls.length, 2);
  assertEquals(calls[0].options, { onConflict: "provider,provider_payment_id" });
  assertEquals(calls[1].options, { onConflict: "provider,provider_payment_id" });
  assertEquals(
    (calls[1].row as Record<string, unknown>).provider_payment_id,
    "payment-duplicate",
  );
});

Deno.test("payment recording behavior: payment write failure is returned before processed finalization", async () => {
  const writeError = new Error("subscription_payments unavailable");
  const { client, calls } = createSubscriptionPaymentMock(writeError);

  const result = await upsertSubscriptionPayment(client, {
    subscriptionId: "sub-1",
    businessId: "business-1",
    provider: "manual",
    providerPaymentId: "payment-123",
    providerEventId: "event-123",
    amount: 16800,
    currency: "ARS",
    status: "approved",
    processedAt: "2026-07-08T10:00:01.000Z",
  });

  assertEquals(result.error, writeError);
  assertEquals(calls.length, 1);
});

Deno.test("billing ledger pruning migration creates canonical subscription_payments and guards legacy drops", async () => {
  const migration = await readText(
    new URL("20260708100000_prune_legacy_billing_ledgers.sql", migrationsDir),
  );

  assertStringIncludes(
    migration,
    "CREATE TABLE IF NOT EXISTS public.subscription_payments",
  );
  assertStringIncludes(migration, "UNIQUE (provider, provider_payment_id)");
  assertStringIncludes(
    migration,
    "subscription_payments_provider_payment_uidx",
  );
  assertStringIncludes(migration, "DROP TABLE public.payments");
  assertStringIncludes(migration, "DROP TABLE public.mp_webhook_events");
  assertStringIncludes(
    migration,
    "Refusing to drop non-empty legacy table public.payments",
  );
  assertStringIncludes(
    migration,
    "Refusing to drop non-empty legacy table public.mp_webhook_events",
  );
});
