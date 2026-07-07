import { assert } from "std/assert/assert.ts";

const MIGRATION_URL = new URL("../../migrations/20260707150000_mvp_free_premium_pricing_catalog.sql", import.meta.url);
const SYNC_MP_PLANS_URL = new URL("../sync-mp-plans/index.ts", import.meta.url);
const CREATE_SUBSCRIPTION_URL = new URL("../create-subscription/index.ts", import.meta.url);

Deno.test({ name: "MVP migration seeds only FREE/PREMIUM active plans and Premium monthly MP catalog", permissions: { read: true } }, async () => {
  const migration = await Deno.readTextFile(MIGRATION_URL);
  assert(migration.includes("('PREMIUM', 'Premium'"));
  assert(migration.includes("'PREMIUM_MONTHLY'"));
  assert(migration.includes("'69fe95756d4d42748f573ef24846cb7b'"));
  assert(migration.includes("25000"));
  assert(migration.includes("preapproval_plan_id = EXCLUDED.preapproval_plan_id"));
  assert(migration.includes("'active'"));
  assert(migration.includes("status = 'inactive'"));
  assert(migration.includes("code IN ('FREE', 'PREMIUM')"));
});

Deno.test({ name: "sync-mp-plans reports configured Premium monthly MP plans without creating plans", permissions: { read: true } }, async () => {
  const syncMpPlans = await Deno.readTextFile(SYNC_MP_PLANS_URL);
  assert(syncMpPlans.includes('.eq("tier", "premium")'));
  assert(syncMpPlans.includes('.eq("cadence", "monthly")'));
  assert(syncMpPlans.includes('status: "configured"'));
  assert(syncMpPlans.includes('manual_configuration_required'));
  assert(!syncMpPlans.includes('/preapproval_plan'));
});

Deno.test({ name: "MVP migration keeps legacy plan rows by deactivating instead of deleting", permissions: { read: true } }, async () => {
  const migration = await Deno.readTextFile(MIGRATION_URL);
  assert(migration.includes("WHERE code NOT IN ('FREE', 'PREMIUM')"));
  assert(migration.includes("is_active = false"));
  assert(!migration.match(/DELETE\s+FROM\s+public\.plans/i));
});

Deno.test({ name: "create-subscription fails before Mercado Pago when Premium plan id is not configured", permissions: { read: true } }, async () => {
  const createSubscription = await Deno.readTextFile(CREATE_SUBSCRIPTION_URL);
  const guardIndex = createSubscription.indexOf("PREAPPROVAL_PLAN_MANUAL_CONFIGURATION_REQUIRED");
  const mpFetchIndex = createSubscription.indexOf("fetch(`${MP_API_BASE}/preapproval`");

  assert(guardIndex > -1);
  assert(mpFetchIndex > -1);
  assert(guardIndex < mpFetchIndex);
  assert(createSubscription.includes("preapproval_plan_id: catalogRow.preapproval_plan_id"));
});
