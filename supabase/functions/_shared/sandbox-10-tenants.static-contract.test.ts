import { assert, assertEquals } from "std/assert/mod.ts";

import {
  SANDBOX_SLUG_PREFIX,
  SANDBOX_TENANT_COUNT,
  SANDBOX_TENANTS,
  isDisposableSupabaseUrl,
  nextSandboxSlotIso,
  sandboxBusinessId,
  sandboxProfessionalId,
  sandboxServiceId,
} from "./sandbox-10-tenants.ts";

const seedUrl = new URL("../../seeds/sandbox-10-businesses.sql", import.meta.url);
const auditUrl = new URL("../../seeds/sandbox-10-overlap-audit.sql", import.meta.url);

Deno.test("sandbox fixture lists 100 tenants with cycling sizes", () => {
  assertEquals(SANDBOX_TENANTS.length, SANDBOX_TENANT_COUNT);
  assertEquals(SANDBOX_TENANT_COUNT, 100);
  const slugs = new Set(SANDBOX_TENANTS.map((tenant) => tenant.slug));
  assertEquals(slugs.size, 100);
  assert(SANDBOX_TENANTS.every((tenant) => tenant.slug.startsWith(SANDBOX_SLUG_PREFIX)));
  assertEquals(SANDBOX_TENANTS[0].slug, "sandbox-v1-micro-001");
  assertEquals(SANDBOX_TENANTS[0].professionals, 1);
  assertEquals(SANDBOX_TENANTS[99].slug, "sandbox-v1-peak-100");
  assertEquals(SANDBOX_TENANTS[99].professionals, 6);
  assert(SANDBOX_TENANTS.some((tenant) => tenant.durationMinutes === 60));
});

Deno.test("sandbox seed is wipeable and generates 100 tenants", async () => {
  const seed = await Deno.readTextFile(seedUrl);
  const audit = await Deno.readTextFile(auditUrl);

  assert(seed.includes(`slug LIKE '${SANDBOX_SLUG_PREFIX}%'`));
  assert(!/delete from public\.businesses;/i.test(seed));
  assert(!/orvel-test/i.test(seed));
  assert(!/tzqgwziyiospmvpdgbnt/i.test(seed));
  assert(seed.includes("generate_series(1, 100)"));
  assert(seed.includes("sandbox-v1-%s-%s"));
  assert(seed.includes("00000000-5a00-4000-a000-01"));
  assert(seed.includes("00000000-5a00-4000-a000-02"));
  assert(seed.includes("00000000-5a00-4000-a000-03"));
  assertEquals(sandboxBusinessId(1), "00000000-5a00-4000-a000-010010000000");
  assertEquals(sandboxServiceId(100), "00000000-5a00-4000-a000-021000000000");
  assertEquals(sandboxProfessionalId(100, 6), "00000000-5a00-4000-a000-031000600000");

  assert(audit.includes(`slug LIKE '${SANDBOX_SLUG_PREFIX}%'`));
  assert(audit.includes("tstzrange"));
  assert(audit.toLowerCase().includes("capacity"));
});

Deno.test("sandbox refuses production-looking supabase urls", () => {
  assertEquals(isDisposableSupabaseUrl("http://127.0.0.1:54321"), true);
  assertEquals(isDisposableSupabaseUrl("http://localhost:54321"), true);
  assertEquals(isDisposableSupabaseUrl("https://orvel.pro"), false);
  assertEquals(isDisposableSupabaseUrl("https://xxxx.supabase.co"), false);
  assertEquals(isDisposableSupabaseUrl("https://xxxx.supabase.co", true), true);
  assertEquals(isDisposableSupabaseUrl("https://orvel-prod.supabase.co", true), false);
});

Deno.test("sandbox slot stays on a weekday at 10:00 Argentina", () => {
  const sundayUtc = new Date("2026-06-07T15:00:00.000Z");
  const slot = new Date(nextSandboxSlotIso(sundayUtc));
  const ar = new Date(slot.getTime() - 3 * 60 * 60 * 1000);
  assertEquals(ar.getUTCDay() === 0, false);
  assertEquals(ar.getUTCHours(), 10);
});
