import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMigrationList } from "./trial-reminder-migration-list.mjs";

const expected = ["20260712190000", "20260712213000"];
const productionFixture = readFileSync(new URL("./fixtures/supabase-2.98.2-migration-list-redacted.txt", import.meta.url), "utf8");

test("accepts the sanitized real mixed 8- and 14-digit Supabase CLI history", () => {
  assert.deepEqual(validateMigrationList(productionFixture, expected, "two_pending"), { migration_alignment: "aligned", migration_state: "two_pending" });
});

test("accepts expected migration only when applied and every parsed row is aligned", () => {
  const fixture = productionFixture
    .replace("20260712190000 |               ", "20260712190000 | 20260712190000")
    .replace("20260712213000 |               ", "20260712213000 | 20260712213000");
  assert.deepEqual(validateMigrationList(fixture, expected, "fully_applied"), { migration_alignment: "aligned", migration_state: "fully_applied" });
});

test("rejects missing expected migration and any local/remote mismatch", () => {
  for (const fixture of [
    productionFixture.replace("Local          | Remote", "Local          | Upstream"),
    productionFixture.replace("----------------|", "--------------- |"),
    productionFixture.replace("20260710210000 | 20260710210000", "`20260710210000` | `20260710210000`"),
    productionFixture.replace("20260710210000 | 20260710210000", "20260710210000 | 20260710210001"),
    productionFixture.replace("20260506       | 20260506      ", "20260506       | 20260507      "),
    productionFixture.replace("20260506       | 20260506      ", "20260506       |               "),
    productionFixture.replace("20260506       | 20260506      ", "202605060      | 202605060     "),
    productionFixture.replace(
      "  20260506       | 20260506       | 2026-05-06 00:00:00",
      "  20260506       | 20260506       | 2026-05-06 00:00:00\n  20260506       | 20260506       | 2026-05-06 00:00:00",
    ),
    `${productionFixture}unexpected diagnostic\n`,
    productionFixture.replace("20260712190000 |", "malformed      |"),
    productionFixture.replace("  20260712213000", "  20260712190000"),
    `${productionFixture}  20260712214000 |                | 2026-07-12 21:40:00\n`,
    productionFixture.replace(
      "  20260712190000 |                | 2026-07-12 19:00:00\n  20260712213000 |                | 2026-07-12 21:30:00",
      "  20260712213000 |                | 2026-07-12 21:30:00\n  20260712190000 |                | 2026-07-12 19:00:00",
    ),
    productionFixture.replace("                | 2026-07-12 19:00:00", "               x| 2026-07-12 19:00:00"),
    "unparseable output",
  ]) assert.throws(() => validateMigrationList(fixture, expected), /migration alignment failed/);

  for (const invalidExpected of [
    ["20260712", "20260712213000"],
    ["20260712190000", "20260712190000"],
    ["20260712213000", "20260712190000"],
  ]) assert.throws(() => validateMigrationList(productionFixture, invalidExpected), /migration alignment failed/);
});

test("detects both pending migrations in exact order", () => {
  assert.deepEqual(validateMigrationList(productionFixture, expected, "two_pending"), { migration_alignment: "aligned", migration_state: "two_pending" });
});

test("detects the recoverable ACL-applied generic-pending state", () => {
  const fixture = productionFixture.replace("20260712190000 |               ", "20260712190000 | 20260712190000");
  assert.deepEqual(validateMigrationList(fixture, expected, "acl_applied_generic_pending"), { migration_alignment: "aligned", migration_state: "acl_applied_generic_pending" });
});

test("rejects impossible generic-without-ACL history and other drift", () => {
  for (const fixture of [
    productionFixture.replace("20260712213000 |               ", "20260712213000 | 20260712213000"),
    productionFixture.replace("20260710210000 | 20260710210000", "20260710210000 |               "),
    `${productionFixture}  20260712213000 |                | 2026-07-12 21:30:00\n`,
    `${productionFixture}  20260712214000 | 20260712214000 | 2026-07-12 21:40:00\n`,
  ]) assert.throws(() => validateMigrationList(fixture, expected), /migration alignment failed/);
});
