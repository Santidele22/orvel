import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260829220000_publish_dashboard_notifications_realtime.sql",
  import.meta.url,
);

async function migrationSql() {
  return await readFile(migrationUrl, "utf8");
}

test("forward migration wraps in BEGIN/COMMIT and reloads schema", async () => {
  const sql = await migrationSql();
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;/m);
  assert.match(sql, /NOTIFY pgrst,\s*'reload schema'/m);
});

test("publishes dashboard_notifications to supabase_realtime with replica identity full", async () => {
  const sql = await migrationSql();
  assert.match(sql, /ALTER TABLE public\.dashboard_notifications[\s\S]*REPLICA IDENTITY FULL/i);
  assert.match(
    sql,
    /ALTER PUBLICATION supabase_realtime ADD TABLE public\.dashboard_notifications/,
  );
});

test("guards publication add with pg_publication_tables IF NOT EXISTS DO block", async () => {
  const sql = await migrationSql();
  assert.match(sql, /DO\s+\$\$/);
  assert.match(sql, /pg_publication_tables/);
  assert.match(sql, /IF NOT EXISTS/i);
  assert.match(sql, /pubname\s*=\s*'supabase_realtime'/);
  assert.match(sql, /tablename\s*=\s*'dashboard_notifications'/);
});
