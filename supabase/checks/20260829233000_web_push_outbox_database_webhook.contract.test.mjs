import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260829233000_web_push_outbox_database_webhook.sql",
  import.meta.url,
);

test("clones email webhook onto web_push_outbox without embedding secrets", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;/m);
  assert.match(sql, /NOTIFY pgrst,\s*'reload schema'/);
  assert.match(sql, /process-email-outbox/);
  assert.match(sql, /process-web-push-outbox/);
  assert.match(sql, /web_push_outbox/);
  assert.match(sql, /supabase_functions\.http_request/);
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(sql, /Bearer [A-Za-z0-9._-]+/);
});
