import assert from "node:assert/strict";
import test from "node:test";
import { validateMigrationList } from "./trial-reminder-migration-list.mjs";

const expected = "20260712213000";

test("accepts expected migration only when applied and every parsed row is aligned", () => {
  const fixture = `Local | Remote | Time\n\`20260710210000\` | \`20260710210000\` | time\n\`20260712213000\` | \`20260712213000\` | time`;
  assert.deepEqual(validateMigrationList(fixture, expected), { migration_alignment: "aligned" });
});

test("rejects missing expected migration and any local/remote mismatch", () => {
  for (const fixture of [
    "`20260708193000` | `20260708193000` | time",
    "`20260712213000` | ` ` | time",
    "`20260712213000` | `20260712213001` | time",
    "Local | Remote | Time\n`20260712213000` | `20260712213000` | time\nunexpected diagnostic",
    "Local | Remote | Time\nmalformed | row | time\n`20260712213000` | `20260712213000` | time",
    "`20260712213000` | `20260712213000` | time\n`20260712213000` | `20260712213000` | duplicate",
    "unparseable output",
  ]) assert.throws(() => validateMigrationList(fixture, expected), /migration alignment failed/);
});
