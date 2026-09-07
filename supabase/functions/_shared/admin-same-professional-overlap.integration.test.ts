/** Sequential admin walk-ins must not double-book the same professional when roster capacity is 2. */

import { assert, assertEquals } from "std/assert/mod.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SLUG = "sandbox-v1-admin-same-pro";
const BUSINESS_ID = "00000000-5a02-4000-a000-000000000101";
const SERVICE_ID = "00000000-5a02-4000-a000-000000000102";
const PROFESSIONAL_A_ID = "00000000-5a02-4000-a000-000000000103";
const PROFESSIONAL_B_ID = "00000000-5a02-4000-a000-000000000104";

type RpcErrorLike = { message?: string; code?: string; details?: string } | null;
type RpcResponse = { data: unknown; error: RpcErrorLike };

function readEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function isDisposableSupabaseUrl(url: string, allowRemote: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.includes("prod") || host.endsWith("orvel.pro")) return false;
  return allowRemote && host.endsWith(".supabase.co");
}

const testUrl = readEnv("ORVEL_TEST_SUPABASE_URL") ?? "";
const testKey = readEnv("ORVEL_TEST_SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowRemote = readEnv("ORVEL_TEST_ALLOW_REMOTE") === "1";
const keepRows = readEnv("ORVEL_TEST_SANDBOX_KEEP") === "1";
const canRun = Boolean(testUrl && testKey) && isDisposableSupabaseUrl(testUrl, allowRemote);

const liveTest = {
  ignore: !canRun,
  sanitizeOps: false,
  sanitizeResources: false,
} as const;

function rpcErrorText(error: RpcErrorLike): string {
  if (!error) return "";
  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
}

function isSlotConflict(error: RpcErrorLike): boolean {
  return /SLOT_CONFLICT/i.test(rpcErrorText(error));
}

/** Next in-hours slot in America/Argentina/Buenos_Aires (UTC-3, no DST). */
function nextSlotIso(from = new Date()): string {
  const candidate = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  candidate.setUTCMinutes(0, 0, 0);
  candidate.setUTCHours(13);
  const arWeekday = new Date(candidate.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
  if (arWeekday === 0) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString();
}

async function wipeFixture(client: SupabaseClient): Promise<void> {
  const { data: businesses, error } = await client.from("businesses").select("id").eq("slug", SLUG);
  if (error) throw new Error(`wipe list failed: ${error.message}`);
  const ids = (businesses ?? []).map((row) => row.id as string);
  if (ids.length === 0) return;

  const { data: professionals, error: professionalsError } = await client
    .from("professionals")
    .select("id")
    .in("business_id", ids);
  if (professionalsError) throw new Error(`wipe professionals list failed: ${professionalsError.message}`);
  const professionalIds = [
    ...new Set([
      ...(professionals ?? []).map((row) => row.id as string),
      PROFESSIONAL_A_ID,
      PROFESSIONAL_B_ID,
    ]),
  ];

  await client.from("notification_email_outbox").delete().in("business_id", ids);
  await client.from("dashboard_notifications").delete().in("business_id", ids);
  await client.from("bookings").delete().in("business_id", ids);
  await client.from("customers").delete().in("business_id", ids);
  await client.from("blocked_times").delete().in("business_id", ids);
  await client.from("professional_services").delete().in("professional_id", professionalIds);
  await client.from("professionals").delete().in("business_id", ids);
  await client.from("services").delete().in("business_id", ids);
  await client.from("business_settings").delete().in("business_id", ids);
  await client.from("branches").delete().in("business_id", ids);
  await client.from("businesses").delete().in("id", ids);
}

async function seedFixture(client: SupabaseClient): Promise<void> {
  const businessInsert = await client.from("businesses").upsert({
    id: BUSINESS_ID,
    slug: SLUG,
    name: "Sandbox admin same-pro overlap",
    timezone: "America/Argentina/Buenos_Aires",
  });
  if (businessInsert.error) throw new Error(`business: ${businessInsert.error.message}`);

  const settingsInsert = await client.from("business_settings").upsert({
    business_id: BUSINESS_ID,
    buffer_minutes: 0,
    min_notice_minutes: 0,
    slot_interval_minutes: 30,
    working_hours: {
      monday: { enabled: true, start: "09:00", end: "18:00" },
      tuesday: { enabled: true, start: "09:00", end: "18:00" },
      wednesday: { enabled: true, start: "09:00", end: "18:00" },
      thursday: { enabled: true, start: "09:00", end: "18:00" },
      friday: { enabled: true, start: "09:00", end: "18:00" },
      saturday: { enabled: true, start: "09:00", end: "18:00" },
      sunday: { enabled: false, start: "10:00", end: "14:00" },
    },
    auto_confirm: true,
    auto_assign_professional: true,
    allow_client_professional_selection: true,
    allow_client_cancel: true,
    allow_client_reschedule: true,
    deposit_enabled: false,
    deposit_percent: 0,
    max_advance_days: 60,
  });
  if (settingsInsert.error) throw new Error(`settings: ${settingsInsert.error.message}`);

  const serviceInsert = await client.from("services").upsert({
    id: SERVICE_ID,
    business_id: BUSINESS_ID,
    name: "Admin same-pro 30",
    description: "Walk-in same-chair overlap",
    duration_minutes: 30,
    price: 5000,
    is_active: true,
  });
  if (serviceInsert.error) throw new Error(`service: ${serviceInsert.error.message}`);

  for (const [index, professionalId] of [PROFESSIONAL_A_ID, PROFESSIONAL_B_ID].entries()) {
    const professionalInsert = await client.from("professionals").upsert({
      id: professionalId,
      business_id: BUSINESS_ID,
      name: index === 0 ? "Admin same-pro A" : "Admin same-pro B",
      active: true,
      deleted_at: null,
    });
    if (professionalInsert.error) {
      throw new Error(`professional ${index + 1}: ${professionalInsert.error.message}`);
    }
    const linkInsert = await client.from("professional_services").upsert({
      professional_id: professionalId,
      service_id: SERVICE_ID,
    });
    if (linkInsert.error) {
      throw new Error(`professional_services ${professionalId}: ${linkInsert.error.message}`);
    }
  }
}

async function lookupPrincipalBranchId(client: SupabaseClient): Promise<string> {
  const { data: branch, error: branchError } = await client
    .from("branches")
    .select("id")
    .eq("business_id", BUSINESS_ID)
    .eq("slug", "principal")
    .maybeSingle();
  if (branchError) throw new Error(`branch lookup: ${branchError.message}`);
  assert(branch?.id, "expected trigger-created principal branch");
  return branch.id as string;
}

function liveClient(): SupabaseClient {
  assert(isDisposableSupabaseUrl(testUrl, allowRemote), "refusing non-disposable Supabase URL");
  return createClient(testUrl, testKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function withIsolatedFixture(
  run: (ctx: { client: SupabaseClient; branchId: string; slotT: string }) => Promise<void>,
): Promise<void> {
  const client = liveClient();
  await wipeFixture(client);
  try {
    await seedFixture(client);
    const branchId = await lookupPrincipalBranchId(client);
    await run({ client, branchId, slotT: nextSlotIso() });
  } finally {
    if (!keepRows) await wipeFixture(client);
  }
}

function createAdminWalkIn(
  client: SupabaseClient,
  args: {
    startsAtIso: string;
    professionalId: string;
    branchId: string;
    walkInName: string;
  },
) {
  return client.rpc("create_admin_manual_booking", {
    business_id: BUSINESS_ID,
    service_id: SERVICE_ID,
    starts_at_iso: args.startsAtIso,
    duration_minutes: 30,
    client_id: null,
    walk_in_name: args.walkInName,
    professional_id: args.professionalId,
    performed_by: null,
    notes: null,
    branch_id: args.branchId,
  });
}

function countRpcOutcomes(responses: RpcResponse[]): {
  successes: number;
  conflicts: number;
  otherErrors: string[];
} {
  let successes = 0;
  let conflicts = 0;
  const otherErrors: string[] = [];
  for (const response of responses) {
    if (!response.error) {
      successes += 1;
      continue;
    }
    if (isSlotConflict(response.error)) {
      conflicts += 1;
      continue;
    }
    otherErrors.push(rpcErrorText(response.error).trim());
  }
  return { successes, conflicts, otherErrors };
}

async function liveBookingsForProfessional(client: SupabaseClient, professionalId: string) {
  const { data: live, error: liveError } = await client
    .from("bookings")
    .select("id, professional_id, starts_at, ends_at, status")
    .eq("business_id", BUSINESS_ID)
    .eq("professional_id", professionalId)
    .in("status", ["confirmed", "pending"]);
  if (liveError) throw new Error(`live bookings: ${liveError.message}`);
  return live ?? [];
}

Deno.test({
  name: "admin walk-in: same professional, same slot, roster of 2 → 1 success and 1 SLOT_CONFLICT",
  ...liveTest,
  async fn() {
    await withIsolatedFixture(async ({ client, branchId, slotT }) => {
      const first = await createAdminWalkIn(client, {
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_A_ID,
        branchId,
        walkInName: "Walk-in same-pro A",
      });
      const second = await createAdminWalkIn(client, {
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_A_ID,
        branchId,
        walkInName: "Walk-in same-pro A2",
      });
      const outcomes = countRpcOutcomes([first, second]);
      assertEquals(
        outcomes.otherErrors,
        [],
        `unexpected RPC errors: ${outcomes.otherErrors.join(" | ")}`,
      );
      assertEquals(outcomes.successes, 1, "exactly one walk-in must occupy the chair");
      assertEquals(outcomes.conflicts, 1, "the second same-chair walk-in must be SLOT_CONFLICT");
      const live = await liveBookingsForProfessional(client, PROFESSIONAL_A_ID);
      assertEquals(live.length, 1, "exactly one live booking must remain for that professional");
    });
  },
});

Deno.test({
  name: "admin walk-in: different professionals, same slot, roster of 2 → 2 successes",
  ...liveTest,
  async fn() {
    await withIsolatedFixture(async ({ client, branchId, slotT }) => {
      const first = await createAdminWalkIn(client, {
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_A_ID,
        branchId,
        walkInName: "Walk-in other-pro A",
      });
      const second = await createAdminWalkIn(client, {
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_B_ID,
        branchId,
        walkInName: "Walk-in other-pro B",
      });
      const outcomes = countRpcOutcomes([first, second]);
      assertEquals(
        outcomes.otherErrors,
        [],
        `unexpected RPC errors: ${outcomes.otherErrors.join(" | ")}`,
      );
      assertEquals(outcomes.successes, 2, "two different chairs may share the wall-clock slot");
      assertEquals(outcomes.conflicts, 0);
    });
  },
});
