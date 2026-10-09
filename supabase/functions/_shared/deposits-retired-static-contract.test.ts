// Static contract for the seña retirement (20261008120000_retire_deposits.sql).
//
// The migration disables the manual alias/CBU deposit without dropping any
// schema object, and converts the bookings that were still holding a slot so no
// reservation is lost. This test reads the migration text to lock both halves:
// the invariant that keeps the seña off, and the absence of destructive DDL.

const migrationsDir = new URL("../../migrations/", import.meta.url);
const migrationToken = "_business_deposits_retired";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readRetirementMigration(): Promise<{ name: string; sql: string }> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) names.push(entry.name);
  }
  names.sort();

  const matches: Array<{ name: string; sql: string }> = [];
  for (const name of names) {
    const sql = await Deno.readTextFile(new URL(name, migrationsDir));
    if (sql.includes(migrationToken)) matches.push({ name, sql });
  }

  assert(
    matches.length === 1,
    `Expected exactly one migration defining ${migrationToken}, found ${matches.length}`,
  );
  return matches[0];
}

Deno.test("seña retirement turns the switch off for every business", async () => {
  const { sql } = await readRetirementMigration();

  assert(
    /update\s+public\.business_settings\s+set\s+deposit_enabled\s*=\s*false/i.test(sql),
    "Expected the migration to set deposit_enabled = false on business_settings",
  );
  assert(
    /where\s+deposit_enabled\s+is\s+distinct\s+from\s+false/i.test(sql),
    "Expected the flag update to be scoped to rows that are still on",
  );
  assert(
    !/deposit_percent\s*=\s*0/i.test(sql) && !/deposit_alias\s*=\s*null/i.test(sql),
    "Expected the operator's percent/alias/CBU configuration to be preserved",
  );
});

Deno.test("seña retirement pins the flag so a stale client cannot re-enable it", async () => {
  const { sql } = await readRetirementMigration();

  assert(
    /create\s+trigger\s+trg_business_deposits_retired\s+before\s+insert\s+or\s+update\s+on\s+public\.business_settings/i
      .test(sql.replace(/\s+/g, " ")),
    "Expected a BEFORE INSERT OR UPDATE trigger on business_settings",
  );
  assert(
    /new\.deposit_enabled\s*:=\s*false/i.test(sql),
    "Expected the trigger to force NEW.deposit_enabled = false",
  );
});

Deno.test("seña retirement converts held bookings instead of letting them expire", async () => {
  const { sql } = await readRetirementMigration();
  const compact = sql.replace(/\s+/g, " ");

  assert(
    /set\s+deposit_status\s*=\s*'paid'/i.test(compact),
    "Expected held bookings to become paid (confirmed) bookings",
  );
  assert(
    /where\s+deposit_status\s+in\s*\(\s*'pending'\s*,\s*'claim_pending'\s*\)/i.test(compact),
    "Expected the conversion to cover pending and claim_pending holds",
  );
  assert(
    /'appointment_confirmation'/i.test(compact),
    "Expected the converted bookings to enqueue the appointment_confirmation email",
  );
  assert(
    /notification_email_outbox/i.test(compact),
    "Expected the confirmation to be enqueued in notification_email_outbox",
  );
});

Deno.test("seña retirement drops no schema object", async () => {
  const { sql } = await readRetirementMigration();

  assert(
    !/drop\s+column/i.test(sql),
    "Expected no DROP COLUMN: the retirement must stay reversible",
  );
  assert(
    !/drop\s+table/i.test(sql),
    "Expected no DROP TABLE: the retirement must stay reversible",
  );
  assert(
    !/drop\s+function/i.test(sql),
    "Expected no DROP FUNCTION: the deposit RPCs stay in place",
  );
});
