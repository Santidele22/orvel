import { assert, assertEquals } from "std/assert/mod.ts";

const migrationUrl = new URL(
  "../../migrations/20260704140000_fix_public_booking_dashboard_and_email_contracts.sql",
  import.meta.url,
);

Deno.test("public booking dashboard migration only references checked-in branch active column", async () => {
  const migration = await Deno.readTextFile(migrationUrl);
  const branchPredicate = migration.match(/FROM public\.branches br[\s\S]*?LIMIT 1;/)?.[0] ?? "";

  assert(branchPredicate.length > 0, "Guard must inspect the list_admin_bookings branch lookup");
  assertEquals(branchPredicate.includes("br.active"), false);
  assert(branchPredicate.includes("br.is_active"));
});
