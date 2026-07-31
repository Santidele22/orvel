import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createSubscriptionHandler } from "../create-subscription/index.ts";
import { syncMpPlansHandler } from "../sync-mp-plans/index.ts";

const PREMIUM_PREAPPROVAL_PLAN_ID = "69fe95756d4d42748f573ef24846cb7b";

type MockCall = {
  table: string;
  operation: string;
  values?: unknown;
};

type CatalogRow = {
  id: string;
  tier: string;
  cadence: string;
  tier_code: string;
  preapproval_plan_id: string | null;
  amount: number;
  currency: string;
  frequency: number;
  frequency_type: string;
};

function premiumCatalogRow(
  overrides: Partial<CatalogRow> = {},
): CatalogRow {
  return {
    id: "catalog-premium-monthly",
    tier: "premium",
    cadence: "monthly",
    tier_code: "PREMIUM_MONTHLY",
    preapproval_plan_id: PREMIUM_PREAPPROVAL_PLAN_ID,
    amount: 9900,
    currency: "ARS",
    frequency: 1,
    frequency_type: "months",
    ...overrides,
  };
}

function createEnvGet(values: Record<string, string>) {
  return (key: string) => values[key];
}

function setRequiredServerSecrets() {
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
}

function createSubscriptionRequest() {
  return new Request("http://localhost/functions/v1/create-subscription", {
    method: "POST",
    headers: {
      Authorization: "Bearer user-token",
      "Content-Type": "application/json",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: JSON.stringify({ tier: "premium", cadence: "monthly" }),
  });
}

function createCreateSubscriptionMock(catalogRow: CatalogRow) {
  const calls: MockCall[] = [];

  class QueryBuilder {
    private operation: string | null = null;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq() {
      return this;
    }

    limit() {
      return this;
    }

    insert(values: unknown) {
      calls.push({ table: this.table, operation: "insert", values });
      this.operation = "insert";
      return this;
    }

    update(values: unknown) {
      calls.push({ table: this.table, operation: "update", values });
      this.operation = "update";
      return this;
    }

    async single() {
      calls.push({ table: this.table, operation: "single" });

      if (this.table === "businesses") {
        return { data: { id: "business-1", owner_id: "user-1", name: "Orvel Test" }, error: null };
      }

      if (this.table === "plans") {
        return {
          data: {
            id: "plan-premium",
            code: "PREMIUM",
            name: "Premium",
            price: 9900,
            currency: "ARS",
            duration_days: 30,
            billing_frequency: 1,
            billing_frequency_type: "months",
          },
          error: null,
        };
      }

      if (this.table === "billing_checkout_sessions") {
        if (this.operation === "insert") {
          return { data: { id: "checkout-session-1", external_reference: "ors_test" }, error: null };
        }
        if (this.operation === "update") {
          return { data: { id: "checkout-session-1" }, error: null };
        }
      }

      if (this.table === "business_subscriptions" && this.operation === "insert") {
        return { data: { id: "subscription-1" }, error: null };
      }

      throw new Error(`Unexpected single() for ${this.table}`);
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.resolveAwaited()).then(onfulfilled, onrejected);
    }

    private resolveAwaited() {
      calls.push({ table: this.table, operation: "await" });

      if (this.table === "mp_plan_catalog") {
        return { data: [catalogRow], error: null };
      }

      throw new Error(`Unexpected awaited query for ${this.table}`);
    }
  }

  const client = {
    auth: {
      async getUser() {
        calls.push({ table: "auth", operation: "getUser" });
        return { data: { user: { id: "user-1", email: "owner@example.com" } }, error: null };
      },
    },
    from(table: string) {
      calls.push({ table, operation: "from" });
      return new QueryBuilder(table);
    },
  };

  return { calls, client };
}

Deno.test("create-subscription uses configured PREMIUM_MONTHLY preapproval plan without manual configuration failure", async () => {
  setRequiredServerSecrets();
  const mock = createCreateSubscriptionMock(premiumCatalogRow());
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      id: "mp-preapproval-1",
      init_point: "https://www.mercadopago.com.ar/subscriptions/checkout/test",
      preapproval_plan_id: PREMIUM_PREAPPROVAL_PLAN_ID,
      status: "pending",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const response = await createSubscriptionHandler(createSubscriptionRequest(), {
    createClient: (() => mock.client) as never,
    fetch: fetchImpl as typeof fetch,
    envGet: createEnvGet({ MP_ACCESS_TOKEN: "TEST-mp-token", DENO_ENV: "development" }),
  });
  const body = await response.json() as Record<string, unknown>;

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(fetchCalls.length, 1);

  const requestBody = JSON.parse(String(fetchCalls[0].init?.body)) as Record<string, unknown>;
  const autoRecurring = requestBody.auto_recurring as Record<string, unknown>;
  assertEquals(requestBody.preapproval_plan_id, PREMIUM_PREAPPROVAL_PLAN_ID);
  assertEquals(autoRecurring.transaction_amount, 9900);
  assertEquals(autoRecurring.currency_id, "ARS");
  assertEquals(autoRecurring.frequency, 1);
  assertEquals(autoRecurring.frequency_type, "months");
  assertEquals(body.error, undefined);
});

Deno.test("create-subscription fails before Mercado Pago fetch when PREMIUM_MONTHLY preapproval plan id is blank", async () => {
  setRequiredServerSecrets();
  const mock = createCreateSubscriptionMock(premiumCatalogRow({ preapproval_plan_id: " " }));
  let fetchCalled = false;

  const response = await createSubscriptionHandler(createSubscriptionRequest(), {
    createClient: (() => mock.client) as never,
    fetch: (() => {
      fetchCalled = true;
      throw new Error("Mercado Pago fetch must not be called");
    }) as typeof fetch,
    envGet: createEnvGet({ MP_ACCESS_TOKEN: "TEST-mp-token", DENO_ENV: "development" }),
  });
  const body = await response.json() as Record<string, unknown>;

  assertEquals(response.status, 409);
  assertEquals(body.error, "PREAPPROVAL_PLAN_MANUAL_CONFIGURATION_REQUIRED");
  assertEquals(fetchCalled, false);
});

function createSyncRequest() {
  return new Request("http://localhost/functions/v1/sync-mp-plans", {
    method: "POST",
    headers: { "x-cron-key": "cron-test-key" },
  });
}

function createSyncMock(rows: CatalogRow[]) {
  class QueryBuilder {
    select() {
      return this;
    }

    eq() {
      return this;
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
    }
  }

  return {
    from(table: string) {
      assertEquals(table, "mp_plan_catalog");
      return new QueryBuilder();
    },
  };
}

Deno.test("sync-mp-plans reports configured and manual_configuration_required rows", async () => {
  setRequiredServerSecrets();
  const response = await syncMpPlansHandler(createSyncRequest(), {
    createClient: (() => createSyncMock([
      premiumCatalogRow(),
      premiumCatalogRow({ id: "catalog-missing", preapproval_plan_id: null }),
    ])) as never,
    envGet: createEnvGet({ CRON_KEY: "cron-test-key" }),
  });
  const body = await response.json() as { results: Array<Record<string, unknown>> };

  assertEquals(response.status, 200);
  assertEquals(body.results[0].status, "configured");
  assertEquals(body.results[0].id, PREMIUM_PREAPPROVAL_PLAN_ID);
  assertEquals(body.results[1].status, "manual_configuration_required");
  assert(!("id" in body.results[1]));
});
