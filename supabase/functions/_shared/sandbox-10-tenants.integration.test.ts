import { assert, assertEquals } from "std/assert/mod.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  SANDBOX_HAMMER_TENANT_CONCURRENCY,
  SANDBOX_SLUG_PREFIX,
  SANDBOX_TENANTS,
  SANDBOX_WORKING_HOURS,
  isDisposableSupabaseUrl,
  mapPool,
  nextSandboxSlotIso,
  sandboxBusinessId,
  sandboxProfessionalId,
  sandboxServiceId,
  type SandboxTenant,
} from "./sandbox-10-tenants.ts";

function readEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

const testUrl = readEnv("ORVEL_TEST_SUPABASE_URL") ?? "";
const testKey = readEnv("ORVEL_TEST_SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowRemote = readEnv("ORVEL_TEST_ALLOW_REMOTE") === "1";
const keepRows = readEnv("ORVEL_TEST_SANDBOX_KEEP") === "1";
const canRun = Boolean(testUrl && testKey) && isDisposableSupabaseUrl(testUrl, allowRemote);

type HammerResult = {
  slug: string;
  capacity: number;
  attempts: number;
  successes: number;
  conflicts: number;
  otherErrors: string[];
};

function rpcErrorText(error: { message?: string; code?: string; details?: string } | null): string {
  if (!error) return "";
  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
}

async function wipeSandbox(client: SupabaseClient): Promise<void> {
  const { data: businesses, error } = await client
    .from("businesses")
    .select("id")
    .like("slug", `${SANDBOX_SLUG_PREFIX}%`);
  if (error) throw new Error(`wipe list failed: ${error.message}`);
  const ids = (businesses ?? []).map((row) => row.id as string);
  if (ids.length === 0) return;

  const { data: professionals } = await client
    .from("professionals")
    .select("id")
    .in("business_id", ids);
  const professionalIds = (professionals ?? []).map((row) => row.id as string);

  await client.from("notification_email_outbox").delete().in("business_id", ids);
  await client.from("dashboard_notifications").delete().in("business_id", ids);
  await client.from("bookings").delete().in("business_id", ids);
  await client.from("customers").delete().in("business_id", ids);
  await client.from("blocked_times").delete().in("business_id", ids);
  if (professionalIds.length > 0) {
    await client.from("professional_services").delete().in("professional_id", professionalIds);
  }
  await client.from("professionals").delete().in("business_id", ids);
  await client.from("services").delete().in("business_id", ids);
  await client.from("business_settings").delete().in("business_id", ids);
  await client.from("branches").delete().in("business_id", ids);
  await client.from("businesses").delete().in("id", ids);
}

async function seedTenant(client: SupabaseClient, tenant: SandboxTenant): Promise<void> {
  const businessId = sandboxBusinessId(tenant.n);
  const serviceId = sandboxServiceId(tenant.n);

  const businessInsert = await client.from("businesses").upsert({
    id: businessId,
    slug: tenant.slug,
    name: tenant.name,
    timezone: "America/Argentina/Buenos_Aires",
  });
  if (businessInsert.error) throw new Error(`${tenant.slug} business: ${businessInsert.error.message}`);

  const settingsInsert = await client.from("business_settings").upsert({
    business_id: businessId,
    buffer_minutes: 0,
    min_notice_minutes: 0,
    slot_interval_minutes: 30,
    working_hours: SANDBOX_WORKING_HOURS,
    auto_confirm: true,
    auto_assign_professional: true,
    deposit_enabled: false,
    deposit_percent: 0,
    max_advance_days: 60,
  });
  if (settingsInsert.error) throw new Error(`${tenant.slug} settings: ${settingsInsert.error.message}`);

  const serviceInsert = await client.from("services").upsert({
    id: serviceId,
    business_id: businessId,
    name: "Servicio sandbox",
    description: "Servicio de ensayo de capacidad",
    duration_minutes: tenant.durationMinutes,
    price: 5000,
    is_active: true,
  });
  if (serviceInsert.error) throw new Error(`${tenant.slug} service: ${serviceInsert.error.message}`);

  for (let index = 1; index <= tenant.professionals; index += 1) {
    const professionalId = sandboxProfessionalId(tenant.n, index);
    const professionalInsert = await client.from("professionals").upsert({
      id: professionalId,
      business_id: businessId,
      name: `Pro ${tenant.n}-${index}`,
      active: true,
      deleted_at: null,
    });
    if (professionalInsert.error) {
      throw new Error(`${tenant.slug} professional: ${professionalInsert.error.message}`);
    }

    const linkInsert = await client.from("professional_services").upsert({
      professional_id: professionalId,
      service_id: serviceId,
    });
    if (linkInsert.error) throw new Error(`${tenant.slug} professional_services: ${linkInsert.error.message}`);
  }
}

async function seedSandbox(client: SupabaseClient): Promise<void> {
  await mapPool(
    SANDBOX_TENANTS,
    SANDBOX_HAMMER_TENANT_CONCURRENCY,
    (tenant) => seedTenant(client, tenant),
  );
}

async function hammerTenant(
  client: SupabaseClient,
  tenant: SandboxTenant,
  startsAtIso: string,
): Promise<HammerResult> {
  const attempts = tenant.professionals + 3;
  const responses = await Promise.all(
    Array.from({ length: attempts }, (_, index) =>
      client.rpc("create_public_booking", {
        business_slug: tenant.slug,
        service_id: sandboxServiceId(tenant.n),
        starts_at_iso: startsAtIso,
        client: {
          fullName: `Cliente ${tenant.n}-${index + 1}`,
          email: `sandbox-${tenant.n}-${index + 1}@example.test`,
          phone: `+54115555${String(tenant.n).padStart(3, "0")}${String(index).padStart(2, "0")}`,
        },
        notes: null,
        professional_id: null,
        branch_id: null,
      })
    ),
  );

  let successes = 0;
  let conflicts = 0;
  const otherErrors: string[] = [];
  for (const response of responses) {
    if (!response.error) {
      successes += 1;
      continue;
    }
    const text = rpcErrorText(response.error);
    if (/SLOT_CONFLICT/i.test(text)) {
      conflicts += 1;
      continue;
    }
    otherErrors.push(text.trim());
  }

  return {
    slug: tenant.slug,
    capacity: tenant.professionals,
    attempts,
    successes,
    conflicts,
    otherErrors,
  };
}

async function countIllegalOverlaps(client: SupabaseClient): Promise<number> {
  const { data: businesses, error: businessError } = await client
    .from("businesses")
    .select("id, slug")
    .like("slug", `${SANDBOX_SLUG_PREFIX}%`);
  if (businessError) throw new Error(businessError.message);

  let illegal = 0;
  for (const business of businesses ?? []) {
    const tenant = SANDBOX_TENANTS.find((row) => row.slug === business.slug);
    const capacity = tenant?.professionals ?? 0;
    const { data: bookings, error } = await client
      .from("bookings")
      .select("id, starts_at, ends_at, status, deposit_status")
      .eq("business_id", business.id)
      .in("status", ["confirmed", "pending"]);
    if (error) throw new Error(error.message);

    const live = (bookings ?? []).filter((row) =>
      !["released", "abandoned", "void"].includes(String(row.deposit_status ?? "none"))
    );

    for (const booking of live) {
      const start = new Date(String(booking.starts_at)).getTime();
      const end = new Date(String(booking.ends_at)).getTime();
      const overlapping = live.filter((other) => {
        const otherStart = new Date(String(other.starts_at)).getTime();
        const otherEnd = new Date(String(other.ends_at)).getTime();
        return otherStart < end && otherEnd > start;
      }).length;
      if (overlapping > capacity) illegal += 1;
    }
  }
  return illegal;
}

Deno.test({
  name: "sandbox-100 integration: concurrent public booking respects roster capacity and isolation",
  ignore: !canRun,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    assert(isDisposableSupabaseUrl(testUrl, allowRemote), "refusing non-disposable Supabase URL");
    const client = createClient(testUrl, testKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await wipeSandbox(client);
    await seedSandbox(client);

    const slot = nextSandboxSlotIso();
    const results = await mapPool(
      SANDBOX_TENANTS,
      SANDBOX_HAMMER_TENANT_CONCURRENCY,
      (tenant) => hammerTenant(client, tenant, slot),
    );

    assertEquals(results.length, SANDBOX_TENANTS.length);
    for (const result of results) {
      assertEquals(
        result.otherErrors,
        [],
        `${result.slug} had unexpected RPC errors: ${result.otherErrors.join(" | ")}`,
      );
      assertEquals(
        result.successes,
        result.capacity,
        `${result.slug} expected ${result.capacity} confirmed bookings, got ${result.successes} (${result.conflicts} conflicts)`,
      );
      assertEquals(result.successes + result.conflicts, result.attempts);
    }

    const { data: sandboxBusinesses, error } = await client
      .from("businesses")
      .select("id, slug")
      .like("slug", `${SANDBOX_SLUG_PREFIX}%`);
    if (error) throw new Error(error.message);
    assertEquals((sandboxBusinesses ?? []).length, SANDBOX_TENANTS.length);
    for (const business of sandboxBusinesses ?? []) {
      assert(
        SANDBOX_TENANTS.some((tenant) => tenant.slug === business.slug),
        `unexpected sandbox slug ${business.slug}`,
      );
    }

    assertEquals(await countIllegalOverlaps(client), 0);

    if (!keepRows) await wipeSandbox(client);
  },
});
