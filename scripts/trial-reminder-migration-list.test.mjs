import assert from "node:assert/strict";
import test from "node:test";
import { validateMigrationList } from "./trial-reminder-migration-list.mjs";

const expected = ["20260712190000", "20260712213000"];

test("accepts expected migration only when applied and every parsed row is aligned", () => {
  const fixture = `Local | Remote | Time\n\`20260710210000\` | \`20260710210000\` | time\n\`20260712190000\` | \`20260712190000\` | time\n\`20260712213000\` | \`20260712213000\` | time`;
  assert.deepEqual(validateMigrationList(fixture, expected), { migration_alignment: "aligned" });
});

test("rejects missing expected migration and any local/remote mismatch", () => {
  for (const fixture of [
    "`20260708193000` | `20260708193000` | time",
    "`20260712190000` | `20260712190000` | time\n`20260712213000` | ` ` | time",
    "`20260712213000` | `20260712213001` | time",
    "Local | Remote | Time\n`20260712213000` | `20260712213000` | time\nunexpected diagnostic",
    "Local | Remote | Time\nmalformed | row | time\n`20260712213000` | `20260712213000` | time",
    "`20260712213000` | `20260712213000` | time\n`20260712213000` | `20260712213000` | duplicate",
    "`20260712190000` | `20260712190000` | time\n`20260712213000` | `20260712213000` | time\n`20260712214000` | `20260712214000` | extra",
    "unparseable output",
  ]) assert.throws(() => validateMigrationList(fixture, expected), /migration alignment failed/);
});

test("accepts the expected migration as the only pending history row", () => {
  const fixture = `Local | Remote | Time\n\`20260710210000\` | \`20260710210000\` | time\n\`20260712190000\` | \` \` | time\n\`20260712213000\` | \` \` | time`;
  assert.deepEqual(validateMigrationList(fixture, expected, "pending"), { migration_alignment: "aligned" });
});

test("rejects pending history with the expected migration applied or other drift", () => {
  for (const fixture of [
    "`20260712190000` | `20260712190000` | time\n`20260712213000` | `20260712213000` | time",
    "`20260710210000` | ` ` | time\n`20260712213000` | ` ` | time",
    "`20260712190000` | ` ` | time\n`20260712213000` | ` ` | time\n`20260712213000` | ` ` | duplicate",
    "`20260712190000` | ` ` | time\n`20260712213000` | ` ` | time\n`20260712214000` | `20260712214000` | extra",
  ]) assert.throws(() => validateMigrationList(fixture, expected, "pending"), /migration alignment failed/);
});
