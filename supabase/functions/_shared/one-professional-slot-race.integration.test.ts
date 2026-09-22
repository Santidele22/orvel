/** Live race and operator occupancy cases against a namespaced sandbox business. */

import { assert, assertEquals } from "std/assert/mod.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SLUG = "sandbox-v1-onepro-race";
const BUSINESS_ID = "00000000-5a01-4000-a000-000000000001";
const SERVICE_30_ID = "00000000-5a01-4000-a000-000000000002";
const SERVICE_ID = SERVICE_30_ID;
const SERVICE_60_ID = "00000000-5a01-4000-a000-000000000004";
const PROFESSIONAL_ID = "00000000-5a01-4000-a000-000000000003";
const PROFESSIONAL_2_ID = "00000000-5a01-4000-a000-000000000005";

type SeedOptions = {
  professionalCount?: 1 | 2;
  durations?: Array<30 | 60>;
  bufferMinutes?: 0 | 15;
};

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

let fixtureGate: Promise<void> = Promise.resolve();

function rpcErrorText(error: RpcErrorLike): string {
  if (!error) return "";
  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
}

function isSlotConflict(error: RpcErrorLike): boolean {
  return /SLOT_CONFLICT/i.test(rpcErrorText(error));
}

function isOccupancyError(error: RpcErrorLike): boolean {
  const text = rpcErrorText(error);
  return /SLOT_CONFLICT/i.test(text) || /BLOCKED_TIME_COLLISION/i.test(text);
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

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function overlapsWindow(
  row: { starts_at: unknown; ends_at: unknown },
  windowStartIso: string,
  durationMinutes: number,
): boolean {
  const start = new Date(String(row.starts_at)).getTime();
  const end = new Date(String(row.ends_at)).getTime();
  const windowStart = new Date(windowStartIso).getTime();
  const windowEnd = windowStart + durationMinutes * 60 * 1000;
  return start < windowEnd && end > windowStart;
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
      PROFESSIONAL_ID,
      PROFESSIONAL_2_ID,
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

async function seedFixture(client: SupabaseClient, options: SeedOptions = {}): Promise<void> {
  const professionalCount = options.professionalCount ?? 1;
  const durations = options.durations ?? [30];
  const bufferMinutes = options.bufferMinutes ?? 0;
  const include30 = durations.includes(30);
  const include60 = durations.includes(60);

  const businessInsert = await client.from("businesses").upsert({
    id: BUSINESS_ID,
    slug: SLUG,
    name: "Sandbox one-pro race",
    timezone: "America/Argentina/Buenos_Aires",
  });
  if (businessInsert.error) throw new Error(`business: ${businessInsert.error.message}`);

  const settingsInsert = await client.from("business_settings").upsert({
    business_id: BUSINESS_ID,
    buffer_minutes: bufferMinutes,
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

  if (include30) {
    const serviceInsert = await client.from("services").upsert({
      id: SERVICE_30_ID,
      business_id: BUSINESS_ID,
      name: "Servicio race 30",
      description: "Ensayo de superposición 30min",
      duration_minutes: 30,
      price: 5000,
      is_active: true,
    });
    if (serviceInsert.error) throw new Error(`service 30: ${serviceInsert.error.message}`);
  }

  if (include60) {
    const serviceInsert = await client.from("services").upsert({
      id: SERVICE_60_ID,
      business_id: BUSINESS_ID,
      name: "Servicio race 60",
      description: "Ensayo de superposición 60min",
      duration_minutes: 60,
      price: 8000,
      is_active: true,
    });
    if (serviceInsert.error) throw new Error(`service 60: ${serviceInsert.error.message}`);
  }

  const professionalIds = professionalCount === 2
    ? [PROFESSIONAL_ID, PROFESSIONAL_2_ID]
    : [PROFESSIONAL_ID];
  const serviceIds = [
    ...(include30 ? [SERVICE_30_ID] : []),
    ...(include60 ? [SERVICE_60_ID] : []),
  ];

  for (const [index, professionalId] of professionalIds.entries()) {
    const professionalInsert = await client.from("professionals").upsert({
      id: professionalId,
      business_id: BUSINESS_ID,
      name: index === 0 ? "Pro race" : "Pro race 2",
      active: true,
      deleted_at: null,
    });
    if (professionalInsert.error) {
      throw new Error(`professional ${index + 1}: ${professionalInsert.error.message}`);
    }
    for (const serviceId of serviceIds) {
      const linkInsert = await client.from("professional_services").upsert({
        professional_id: professionalId,
        service_id: serviceId,
      });
      if (linkInsert.error) {
        throw new Error(`professional_services ${professionalId}: ${linkInsert.error.message}`);
      }
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
  seed: SeedOptions,
  run: (ctx: { client: SupabaseClient; branchId: string; slotT: string }) => Promise<void>,
): Promise<void> {
  let release: () => void = () => {};
  const previous = fixtureGate;
  fixtureGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const client = liveClient();
  await wipeFixture(client);
  try {
    await seedFixture(client, seed);
    const branchId = await lookupPrincipalBranchId(client);
    await run({ client, branchId, slotT: nextSlotIso() });
  } finally {
    if (!keepRows) await wipeFixture(client);
    release();
  }
}

function createPublicBooking(
  client: SupabaseClient,
  args: {
    serviceId: string;
    startsAtIso: string;
    professionalId: string;
    branchId: string;
    clientKey: string;
  },
) {
  return client.rpc("create_public_booking", {
    business_slug: SLUG,
    service_id: args.serviceId,
    starts_at_iso: args.startsAtIso,
    client: {
      fullName: `Cliente race ${args.clientKey}`,
      email: `onepro-race-${args.clientKey}@example.test`,
      phone: `+54116666${args.clientKey.replace(/[^0-9]/g, "").padStart(4, "0").slice(-4)}`,
    },
    notes: null,
    professional_id: args.professionalId,
    branch_id: args.branchId,
  });
}

function createAdminWalkIn(
  client: SupabaseClient,
  args: {
    serviceId: string;
    startsAtIso: string;
    durationMinutes: number;
    professionalId: string;
    branchId: string;
    walkInName: string;
  },
) {
  return client.rpc("create_admin_manual_booking", {
    business_id: BUSINESS_ID,
    service_id: args.serviceId,
    starts_at_iso: args.startsAtIso,
    duration_minutes: args.durationMinutes,
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
  occupancyErrors: number;
  otherErrors: string[];
} {
  let successes = 0;
  let conflicts = 0;
  let occupancyErrors = 0;
  const otherErrors: string[] = [];
  for (const response of responses) {
    if (!response.error) {
      successes += 1;
      continue;
    }
    if (isSlotConflict(response.error)) conflicts += 1;
    if (isOccupancyError(response.error)) {
      occupancyErrors += 1;
      continue;
    }
    otherErrors.push(rpcErrorText(response.error).trim());
  }
  return { successes, conflicts, occupancyErrors, otherErrors };
}

async function liveBookings(client: SupabaseClient) {
  const { data: live, error: liveError } = await client
    .from("bookings")
    .select("id, professional_id, starts_at, ends_at, status, deposit_status")
    .eq("business_id", BUSINESS_ID)
    .in("status", ["confirmed", "pending"]);
  if (liveError) throw new Error(liveError.message);
  return live ?? [];
}

Deno.test({
  name: "one professional: two concurrent public bookings at the same slot allow exactly one commit",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const responses = await Promise.all(
        [1, 2].map((index) =>
          createPublicBooking(client, {
            serviceId: SERVICE_ID,
            startsAtIso: slotT,
            professionalId: PROFESSIONAL_ID,
            branchId,
            clientKey: String(index),
          })
        ),
      );

      const { successes, conflicts, otherErrors } = countRpcOutcomes(responses);
      const overlapping = (await liveBookings(client)).filter((row) => overlapsWindow(row, slotT, 30));

      assertEquals(otherErrors, [], `unexpected RPC errors: ${otherErrors.join(" | ")}`);
      assertEquals(successes, 1, `expected exactly 1 successful booking, got ${successes}`);
      assertEquals(conflicts, 1, `expected exactly 1 SLOT_CONFLICT, got ${conflicts}`);
      assertEquals(overlapping.length, 1, `expected 1 live overlapping booking, got ${overlapping.length}`);
      assertEquals(overlapping[0]?.professional_id, PROFESSIONAL_ID);
    });
  },
});

Deno.test({
  name: "one professional: sequential public bookings at the same slot allow the first and reject the second",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "seq-1",
      });
      if (first.error) {
        throw new Error(`first public booking failed: ${rpcErrorText(first.error)}`);
      }

      const second = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "seq-2",
      });
      if (second.error && !isOccupancyError(second.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(second.error)}`);
      }

      const overlapping = (await liveBookings(client)).filter((row) => overlapsWindow(row, slotT, 30));
      assertEquals(second.error && isSlotConflict(second.error), true, "expected second booking SLOT_CONFLICT");
      assertEquals(overlapping.length, 1, `expected 1 live overlapping booking, got ${overlapping.length}`);
    });
  },
});

Deno.test({
  name: "one professional: 60min public at T then 30min public at T+30 is SLOT_CONFLICT",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30, 60], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const later = addMinutesIso(slotT, 30);
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_60_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "partial-60",
      });
      if (first.error) {
        throw new Error(`60min public booking failed: ${rpcErrorText(first.error)}`);
      }

      const second = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: later,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "partial-30",
      });
      if (second.error && !isOccupancyError(second.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(second.error)}`);
      }

      assertEquals(second.error && isSlotConflict(second.error), true, "expected partial-overlap SLOT_CONFLICT");
    });
  },
});

Deno.test({
  name: "one professional: buffer 0 allows back-to-back 30min public bookings",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const later = addMinutesIso(slotT, 30);
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "btb-1",
      });
      if (first.error) {
        throw new Error(`first back-to-back booking failed: ${rpcErrorText(first.error)}`);
      }

      const second = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: later,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "btb-2",
      });
      if (second.error) {
        throw new Error(`second back-to-back booking failed: ${rpcErrorText(second.error)}`);
      }

      const live = await liveBookings(client);
      const firstWindow = live.filter((row) => overlapsWindow(row, slotT, 30));
      const secondWindow = live.filter((row) => overlapsWindow(row, later, 30));
      assertEquals(firstWindow.length, 1);
      assertEquals(secondWindow.length, 1);
    });
  },
});

Deno.test({
  name: "one professional: buffer 15 blocks adjacent 30min public bookings",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 15 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const later = addMinutesIso(slotT, 30);
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "buf-1",
      });
      if (first.error) {
        throw new Error(`first buffered booking failed: ${rpcErrorText(first.error)}`);
      }

      const second = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: later,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "buf-2",
      });
      if (second.error && !isOccupancyError(second.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(second.error)}`);
      }

      assertEquals(second.error && isSlotConflict(second.error), true, "expected buffer-adjacent SLOT_CONFLICT");
    });
  },
});

Deno.test({
  name: "walk-in then public at the same professional slot is SLOT_CONFLICT",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const walkIn = await createAdminWalkIn(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        durationMinutes: 30,
        professionalId: PROFESSIONAL_ID,
        branchId,
        walkInName: "Walk-in race",
      });
      if (walkIn.error) {
        throw new Error(`walk-in booking failed: ${rpcErrorText(walkIn.error)}`);
      }

      const publicBooking = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "after-walkin",
      });
      if (publicBooking.error && !isOccupancyError(publicBooking.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(publicBooking.error)}`);
      }

      assertEquals(
        publicBooking.error && isSlotConflict(publicBooking.error),
        true,
        "expected public SLOT_CONFLICT after walk-in",
      );
    });
  },
});

Deno.test({
  name: "public then walk-in at the same professional slot is SLOT_CONFLICT",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const publicBooking = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "before-walkin",
      });
      if (publicBooking.error) {
        throw new Error(`public booking failed: ${rpcErrorText(publicBooking.error)}`);
      }

      const walkIn = await createAdminWalkIn(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        durationMinutes: 30,
        professionalId: PROFESSIONAL_ID,
        branchId,
        walkInName: "Walk-in after public",
      });
      if (walkIn.error && !isOccupancyError(walkIn.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(walkIn.error)}`);
      }

      assert(
        Boolean(walkIn.error),
        "admin walk-in must not occupy a slot already taken by a public booking (roster capacity 1)",
      );
      assertEquals(
        isSlotConflict(walkIn.error),
        true,
        `expected admin SLOT_CONFLICT, got ${rpcErrorText(walkIn.error)}`,
      );
    });
  },
});

Deno.test({
  name: "blocked time covering the slot rejects a later public booking",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const blocked = await client.rpc("create_admin_blocked_time", {
        business_id: BUSINESS_ID,
        starts_at_iso: slotT,
        ends_at_iso: addMinutesIso(slotT, 30),
        reason: "QA overlap block",
        performed_by: null,
        branch_id: branchId,
      });
      if (blocked.error) {
        throw new Error(`blocked time failed: ${rpcErrorText(blocked.error)}`);
      }

      const publicBooking = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "after-block",
      });
      if (publicBooking.error && !isOccupancyError(publicBooking.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(publicBooking.error)}`);
      }

      assert(
        Boolean(publicBooking.error) && isOccupancyError(publicBooking.error),
        `expected BLOCKED_TIME_COLLISION or SLOT_CONFLICT, got ${rpcErrorText(publicBooking.error)}`,
      );
    });
  },
});

Deno.test({
  name: "cancel_booking_by_token frees the slot for a later public booking",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "cancel-1",
      });
      if (first.error) {
        throw new Error(`public booking failed: ${rpcErrorText(first.error)}`);
      }

      const payload = first.data as { manage_token?: string } | null;
      assert(payload?.manage_token, "expected create_public_booking to return manage_token");

      const cancelled = await client.rpc("cancel_booking_by_token", {
        token: payload.manage_token,
        now_iso: new Date().toISOString(),
      });
      if (cancelled.error) {
        throw new Error(`cancel_booking_by_token failed: ${rpcErrorText(cancelled.error)}`);
      }

      const second = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "cancel-2",
      });
      if (second.error) {
        throw new Error(`rebook after cancel failed: ${rpcErrorText(second.error)}`);
      }

      const overlapping = (await liveBookings(client)).filter((row) => overlapsWindow(row, slotT, 30));
      assertEquals(overlapping.length, 1, `expected 1 live overlapping booking after cancel+rebook, got ${overlapping.length}`);
    });
  },
});

Deno.test({
  name: "two professionals: concurrent public bookings at the same starts_at both succeed",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 2, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const responses = await Promise.all([
        createPublicBooking(client, {
          serviceId: SERVICE_30_ID,
          startsAtIso: slotT,
          professionalId: PROFESSIONAL_ID,
          branchId,
          clientKey: "two-pro-1",
        }),
        createPublicBooking(client, {
          serviceId: SERVICE_30_ID,
          startsAtIso: slotT,
          professionalId: PROFESSIONAL_2_ID,
          branchId,
          clientKey: "two-pro-2",
        }),
      ]);

      const { successes, conflicts, otherErrors } = countRpcOutcomes(responses);
      assertEquals(otherErrors, [], `unexpected RPC errors: ${otherErrors.join(" | ")}`);
      assertEquals(successes, 2, `expected 2 successful bookings, got ${successes}`);
      assertEquals(conflicts, 0, `expected 0 SLOT_CONFLICT, got ${conflicts}`);
    });
  },
});

Deno.test({
  name: "one professional: public reschedule onto occupied slot is SLOT_CONFLICT",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const slotTPlus60 = addMinutesIso(slotT, 60);
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-pub-a",
      });
      if (first.error) {
        throw new Error(`public booking A failed: ${rpcErrorText(first.error)}`);
      }

      const second = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotTPlus60,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-pub-b",
      });
      if (second.error) {
        throw new Error(`public booking B failed: ${rpcErrorText(second.error)}`);
      }

      const payload = second.data as { manage_token?: string } | null;
      assert(payload?.manage_token, "expected create_public_booking to return manage_token");

      const rescheduled = await client.rpc("reschedule_booking_by_token", {
        token: payload.manage_token,
        now_iso: new Date().toISOString(),
        starts_at_iso: slotT,
      });
      if (rescheduled.error && !isOccupancyError(rescheduled.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(rescheduled.error)}`);
      }

      const live = await liveBookings(client);
      const atT = live.filter((row) => overlapsWindow(row, slotT, 30));
      const atTPlus60 = live.filter((row) => overlapsWindow(row, slotTPlus60, 30));
      assertEquals(
        rescheduled.error && isSlotConflict(rescheduled.error),
        true,
        "expected public reschedule SLOT_CONFLICT",
      );
      assertEquals(atT.length, 1, `expected 1 live overlapping booking at T, got ${atT.length}`);
      assertEquals(
        atTPlus60.length,
        1,
        `expected B to remain at T+60 (confirmed/pending), got ${atTPlus60.length}`,
      );
    });
  },
});

Deno.test({
  name: "one professional: admin reschedule onto occupied slot is SLOT_CONFLICT",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const slotTPlus60 = addMinutesIso(slotT, 60);
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-adm-a",
      });
      if (first.error) {
        throw new Error(`public booking A failed: ${rpcErrorText(first.error)}`);
      }

      const walkIn = await createAdminWalkIn(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotTPlus60,
        durationMinutes: 30,
        professionalId: PROFESSIONAL_ID,
        branchId,
        walkInName: "Walk-in reschedule B",
      });
      if (walkIn.error) {
        throw new Error(`walk-in booking B failed: ${rpcErrorText(walkIn.error)}`);
      }

      const payload = walkIn.data as { booking_id?: string } | null;
      assert(payload?.booking_id, "expected create_admin_manual_booking to return booking_id");

      const rescheduled = await client.rpc("reschedule_admin_booking", {
        booking_id: payload.booking_id,
        starts_at_iso: slotT,
        branch_id: branchId,
        performed_by: null,
        notes: null,
        reason: null,
      });
      if (rescheduled.error && !isOccupancyError(rescheduled.error)) {
        throw new Error(`unexpected RPC error: ${rpcErrorText(rescheduled.error)}`);
      }

      const live = await liveBookings(client);
      const atT = live.filter((row) => overlapsWindow(row, slotT, 30));
      const atTPlus60 = live.filter((row) => overlapsWindow(row, slotTPlus60, 30));
      assert(
        Boolean(rescheduled.error),
        "admin reschedule must not occupy a slot already taken (roster capacity 1)",
      );
      assertEquals(
        isSlotConflict(rescheduled.error),
        true,
        `expected admin reschedule SLOT_CONFLICT, got ${rpcErrorText(rescheduled.error)}`,
      );
      assertEquals(atT.length, 1, `expected 1 live overlapping booking at T, got ${atT.length}`);
      assertEquals(
        atTPlus60.length,
        1,
        `expected B to remain at T+60 (confirmed/pending), got ${atTPlus60.length}`,
      );
    });
  },
});

Deno.test({
  name: "one professional: public reschedule to a free slot succeeds",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const slotTPlus60 = addMinutesIso(slotT, 60);
      const slotTPlus90 = addMinutesIso(slotT, 90);
      const first = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-free-a",
      });
      if (first.error) {
        throw new Error(`public booking A failed: ${rpcErrorText(first.error)}`);
      }

      const second = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotTPlus60,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-free-b",
      });
      if (second.error) {
        throw new Error(`public booking B failed: ${rpcErrorText(second.error)}`);
      }

      const payload = second.data as { manage_token?: string } | null;
      assert(payload?.manage_token, "expected create_public_booking to return manage_token");

      const rescheduled = await client.rpc("reschedule_booking_by_token", {
        token: payload.manage_token,
        now_iso: new Date().toISOString(),
        starts_at_iso: slotTPlus90,
      });
      if (rescheduled.error) {
        throw new Error(`reschedule to free slot failed: ${rpcErrorText(rescheduled.error)}`);
      }

      const live = await liveBookings(client);
      const atT = live.filter((row) => overlapsWindow(row, slotT, 30));
      const atTPlus60 = live.filter((row) => overlapsWindow(row, slotTPlus60, 30));
      const atTPlus90 = live.filter((row) => overlapsWindow(row, slotTPlus90, 30));
      assertEquals(atT.length, 1, `expected A to remain at T, got ${atT.length}`);
      assertEquals(atTPlus60.length, 0, `expected T+60 vacated after reschedule, got ${atTPlus60.length}`);
      assertEquals(atTPlus90.length, 1, `expected B at T+90, got ${atTPlus90.length}`);
    });
  },
});

Deno.test({
  name: "one professional: concurrent admin walk-in and public at the same slot allow exactly one commit",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const responses = await Promise.all([
        createAdminWalkIn(client, {
          serviceId: SERVICE_30_ID,
          startsAtIso: slotT,
          durationMinutes: 30,
          professionalId: PROFESSIONAL_ID,
          branchId,
          walkInName: "Walk-in concurrent",
        }),
        createPublicBooking(client, {
          serviceId: SERVICE_30_ID,
          startsAtIso: slotT,
          professionalId: PROFESSIONAL_ID,
          branchId,
          clientKey: "concurrent-public",
        }),
      ]);

      const { successes, occupancyErrors, otherErrors } = countRpcOutcomes(responses);
      const overlapping = (await liveBookings(client)).filter((row) => overlapsWindow(row, slotT, 30));

      assertEquals(otherErrors, [], `unexpected RPC errors: ${otherErrors.join(" | ")}`);
      assertEquals(successes, 1, `expected exactly 1 successful booking, got ${successes}`);
      assertEquals(
        occupancyErrors,
        1,
        `expected exactly 1 SLOT_CONFLICT or occupancy error, got ${occupancyErrors}`,
      );
      assertEquals(overlapping.length, 1, `expected 1 live overlapping booking, got ${overlapping.length}`);
    });
  },
});

Deno.test({
  name: "one professional: two concurrent public reschedules to the same free slot allow exactly one commit",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const slotTPlus60 = addMinutesIso(slotT, 60);
      const slotTPlus90 = addMinutesIso(slotT, 90);

      const bookingA = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-race-pub-a",
      });
      if (bookingA.error) {
        throw new Error(`public booking A failed: ${rpcErrorText(bookingA.error)}`);
      }
      const payloadA = bookingA.data as { manage_token?: string } | null;
      assert(payloadA?.manage_token, "expected create_public_booking to return manage_token");

      const bookingB = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotTPlus60,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-race-pub-b",
      });
      if (bookingB.error) {
        throw new Error(`public booking B failed: ${rpcErrorText(bookingB.error)}`);
      }
      const payloadB = bookingB.data as { manage_token?: string } | null;
      assert(payloadB?.manage_token, "expected create_public_booking to return manage_token");

      const responses = await Promise.all([
        client.rpc("reschedule_booking_by_token", {
          token: payloadA.manage_token,
          now_iso: new Date().toISOString(),
          starts_at_iso: slotTPlus90,
        }),
        client.rpc("reschedule_booking_by_token", {
          token: payloadB.manage_token,
          now_iso: new Date().toISOString(),
          starts_at_iso: slotTPlus90,
        }),
      ]);

      const { successes, conflicts, otherErrors } = countRpcOutcomes(responses);
      const live = await liveBookings(client);
      const atT = live.filter((row) => overlapsWindow(row, slotT, 30));
      const atTPlus60 = live.filter((row) => overlapsWindow(row, slotTPlus60, 30));
      const atTPlus90 = live.filter((row) => overlapsWindow(row, slotTPlus90, 30));

      assertEquals(otherErrors, [], `unexpected RPC errors: ${otherErrors.join(" | ")}`);
      assertEquals(successes, 1, `expected exactly 1 successful reschedule, got ${successes}`);
      assertEquals(conflicts, 1, `expected exactly 1 SLOT_CONFLICT, got ${conflicts}`);
      assertEquals(atTPlus90.length, 1, `expected 1 live overlapping booking at T+90, got ${atTPlus90.length}`);
      assertEquals(
        atT.length + atTPlus60.length,
        1,
        `expected the loser to remain at T or T+60 (combined live overlapping = 1), got ${atT.length} at T and ${atTPlus60.length} at T+60`,
      );
      assertEquals(live.length, 2, `expected 2 live confirmed/pending bookings, got ${live.length}`);
    });
  },
});

Deno.test({
  name: "one professional: concurrent public and admin reschedules to the same free slot allow exactly one commit",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 1, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const slotTPlus60 = addMinutesIso(slotT, 60);
      const slotTPlus90 = addMinutesIso(slotT, 90);

      const bookingA = await createPublicBooking(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        professionalId: PROFESSIONAL_ID,
        branchId,
        clientKey: "rs-race-mixed-a",
      });
      if (bookingA.error) {
        throw new Error(`public booking A failed: ${rpcErrorText(bookingA.error)}`);
      }
      const payloadA = bookingA.data as { manage_token?: string } | null;
      assert(payloadA?.manage_token, "expected create_public_booking to return manage_token");

      const walkInB = await createAdminWalkIn(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotTPlus60,
        durationMinutes: 30,
        professionalId: PROFESSIONAL_ID,
        branchId,
        walkInName: "Walk-in reschedule race B",
      });
      if (walkInB.error) {
        throw new Error(`walk-in booking B failed: ${rpcErrorText(walkInB.error)}`);
      }
      const payloadB = walkInB.data as { booking_id?: string } | null;
      assert(payloadB?.booking_id, "expected create_admin_manual_booking to return booking_id");

      const responses = await Promise.all([
        client.rpc("reschedule_booking_by_token", {
          token: payloadA.manage_token,
          now_iso: new Date().toISOString(),
          starts_at_iso: slotTPlus90,
        }),
        client.rpc("reschedule_admin_booking", {
          booking_id: payloadB.booking_id,
          starts_at_iso: slotTPlus90,
          branch_id: branchId,
          performed_by: null,
          notes: null,
          reason: null,
        }),
      ]);

      const { successes, occupancyErrors, otherErrors } = countRpcOutcomes(responses);
      const live = await liveBookings(client);
      const atT = live.filter((row) => overlapsWindow(row, slotT, 30));
      const atTPlus60 = live.filter((row) => overlapsWindow(row, slotTPlus60, 30));
      const atTPlus90 = live.filter((row) => overlapsWindow(row, slotTPlus90, 30));

      assertEquals(otherErrors, [], `unexpected RPC errors: ${otherErrors.join(" | ")}`);
      assertEquals(successes, 1, `expected exactly 1 successful reschedule, got ${successes}`);
      assertEquals(
        occupancyErrors,
        1,
        `expected exactly 1 SLOT_CONFLICT or occupancy error, got ${occupancyErrors}`,
      );
      assertEquals(atTPlus90.length, 1, `expected 1 live overlapping booking at T+90, got ${atTPlus90.length}`);
      assertEquals(
        atT.length + atTPlus60.length,
        1,
        `expected the loser to remain at T or T+60 (combined live overlapping = 1), got ${atT.length} at T and ${atTPlus60.length} at T+60`,
      );
      assertEquals(live.length, 2, `expected 2 live confirmed/pending bookings, got ${live.length}`);
    });
  },
});

Deno.test({
  name: "two professionals: two sequential admin walk-ins on the same professional at the same slot allow exactly one commit",
  ...liveTest,
  async fn() {
    await withIsolatedFixture({ professionalCount: 2, durations: [30], bufferMinutes: 0 }, async ({
      client,
      branchId,
      slotT,
    }) => {
      const first = await createAdminWalkIn(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        durationMinutes: 30,
        professionalId: PROFESSIONAL_ID,
        branchId,
        walkInName: "Walk-in same-pro A",
      });
      const second = await createAdminWalkIn(client, {
        serviceId: SERVICE_30_ID,
        startsAtIso: slotT,
        durationMinutes: 30,
        professionalId: PROFESSIONAL_ID,
        branchId,
        walkInName: "Walk-in same-pro B",
      });

      const { successes, conflicts, occupancyErrors, otherErrors } = countRpcOutcomes([first, second]);
      const overlapping = (await liveBookings(client)).filter((row) => overlapsWindow(row, slotT, 30));
      const samePro = overlapping.filter((row) => row.professional_id === PROFESSIONAL_ID);

      assertEquals(otherErrors, [], `unexpected RPC errors: ${otherErrors.join(" | ")}`);
      assertEquals(successes, 1, `expected exactly 1 successful walk-in on the same professional, got ${successes}`);
      assertEquals(
        occupancyErrors >= 1 || conflicts >= 1,
        true,
        `expected the second walk-in to be SLOT_CONFLICT, got successes=${successes} conflicts=${conflicts} occupancyErrors=${occupancyErrors}`,
      );
      assertEquals(
        samePro.length,
        1,
        `expected 1 live booking for that professional at T, got ${samePro.length} (roster has 2 professionals)`,
      );
    });
  },
});
