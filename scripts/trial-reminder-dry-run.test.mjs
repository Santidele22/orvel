import assert from "node:assert/strict";
import test from "node:test";
import { validateDryRun } from "./trial-reminder-dry-run.mjs";

const expected = "20260712213000";
const valid = `DRY RUN: migrations will *not* be pushed to the database.\nConnecting to remote database...\nWould push these migrations:\n • 20260712213000_generic_one_time_email_contract.sql\nFinished supabase db push.`;

test("accepts exactly the expected pending migration", () => {
  assert.deepEqual(validateDryRun(valid, expected), { pending_migration: expected });
});

test("rejects empty, extra, duplicate, malformed, and unexpected dry-run plans", () => {
  for (const fixture of [
    "DRY RUN: migrations will *not* be pushed to the database.\nWould push these migrations:",
    `${valid.replace("Finished supabase db push.", "")}\n • 20260712214000_extra.sql`,
    `${valid.replace("Finished supabase db push.", "")}\n • 20260712213000_generic_one_time_email_contract.sql`,
    "Would push these migrations:\nunknown output",
    "Would push these migrations:\n • 20260712214000_unexpected.sql",
    "20260712213000_generic_one_time_email_contract.sql",
  ]) assert.throws(() => validateDryRun(fixture, expected), /dry-run migration plan failed/);
});
