import assert from "node:assert/strict";
import test from "node:test";
import { validateMigrationList } from "./trial-reminder-migration-list.mjs";

const expected = ["20260712190000", "20260712213000"];

test("accepts expected migration only when applied and every parsed row is aligned", () => {
  const fixture = `Local | Remote | Time\n\`20260710210000\` | \`20260710210000\` | time\n\`20260712190000\` | \`20260712190000\` | time\n\`20260712213000\` | \`20260712213000\` | time`;
  assert.deepEqual(validateMigrationList(fixture, expected, "fully_applied"), { migration_alignment: "aligned", migration_state: "fully_applied" });
});

test("rejects missing expected migration and any local/remote mismatch", () => {
  for (const fixture of [
    "`20260708193000` | `20260708193000` | time",
    "`20260712213000` | `20260712213001` | time",
    "Local | Remote | Time\n`20260712213000` | `20260712213000` | time\nunexpected diagnostic",
    "Local | Remote | Time\nmalformed | row | time\n`20260712213000` | `20260712213000` | time",
    "`20260712213000` | `20260712213000` | time\n`20260712213000` | `20260712213000` | duplicate",
    "`20260712190000` | `20260712190000` | time\n`20260712213000` | `20260712213000` | time\n`20260712214000` | `20260712214000` | extra",
    "unparseable output",
  ]) assert.throws(() => validateMigrationList(fixture, expected), /migration alignment failed/);
});

test("detects both pending migrations in exact order", () => {
  const fixture = `Local | Remote | Time\n\`20260710210000\` | \`20260710210000\` | time\n\`20260712190000\` | \` \` | time\n\`20260712213000\` | \` \` | time`;
  assert.deepEqual(validateMigrationList(fixture, expected, "two_pending"), { migration_alignment: "aligned", migration_state: "two_pending" });
});

test("detects the recoverable ACL-applied generic-pending state", () => {
  const fixture = `Local | Remote | Time\n\`20260710210000\` | \`20260710210000\` | time\n\`20260712190000\` | \`20260712190000\` | time\n\`20260712213000\` | \` \` | time`;
  assert.deepEqual(validateMigrationList(fixture, expected, "acl_applied_generic_pending"), { migration_alignment: "aligned", migration_state: "acl_applied_generic_pending" });
});

test("rejects impossible generic-without-ACL history and other drift", () => {
  for (const fixture of [
    "`20260712190000` | ` ` | time\n`20260712213000` | `20260712213000` | time",
    "`20260710210000` | ` ` | time\n`20260712213000` | ` ` | time",
    "`20260712190000` | ` ` | time\n`20260712213000` | ` ` | time\n`20260712213000` | ` ` | duplicate",
    "`20260712190000` | ` ` | time\n`20260712213000` | ` ` | time\n`20260712214000` | `20260712214000` | extra",
  ]) assert.throws(() => validateMigrationList(fixture, expected), /migration alignment failed/);
});
