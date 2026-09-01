import { assert, assertEquals, assertMatch, assertStringIncludes } from "std/assert/mod.ts";

const migrationsDir = new URL("../../migrations/", import.meta.url);
const configUrl = new URL("../../config.toml", import.meta.url);
const functionUrl = new URL("../purge-elapsed-bookings/index.ts", import.meta.url);
const remindersUrl = new URL("../appointment-reminders-24h/index.ts", import.meta.url);

async function purgeMigrationSql(): Promise<string> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql") && entry.name.includes("purge_elapsed_bookings")) {
      names.push(entry.name);
    }
  }
  names.sort();
  const fileName = names.at(-1);
  assert(fileName, "expected a YYYYMMDDHHMMSS_purge_elapsed_bookings.sql migration");
  assertMatch(fileName, /^\d{14}_purge_elapsed_bookings\.sql$/);
  return await Deno.readTextFile(new URL(fileName, migrationsDir));
}

Deno.test("purge RPC hard-deletes only elapsed bookings by ends_at <= now() and is service_role-only", async () => {
  const sql = await purgeMigrationSql();

  assertMatch(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.purge_elapsed_bookings\s*\(\s*\)/i);
  assertMatch(sql, /RETURNS\s+integer/i);
  assertMatch(sql, /SECURITY\s+DEFINER/i);
  assertMatch(sql, /DELETE\s+FROM\s+public\.bookings\s+WHERE\s+ends_at\s*<=\s*now\(\)\s*;/i);
  assertEquals(/DELETE\s+FROM\s+public\.bookings[\s\S]{0,200}ends_at\s*>\s*now\(\)/i.test(sql), false);
  assertEquals(/to_char\s*\(|\btimezone\s*\(|AT\s+TIME\s+ZONE/i.test(sql), false);
  assertEquals(/pg_cron|cron\.schedule/i.test(sql), false);
  assertEquals(/CREATE\s+TABLE[\s\S]{0,80}archive/i.test(sql), false);
  assertMatch(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.purge_elapsed_bookings\s*\(\s*\)\s+FROM\s+PUBLIC/i);
  assertMatch(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.purge_elapsed_bookings\s*\(\s*\)\s+FROM\s+anon/i);
  assertMatch(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.purge_elapsed_bookings\s*\(\s*\)\s+FROM\s+authenticated/i);
  assertMatch(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.purge_elapsed_bookings\s*\(\s*\)\s+TO\s+service_role/i);
  assertEquals(/GRANT\s+EXECUTE[\s\S]{0,80}purge_elapsed_bookings[\s\S]{0,80}(anon|authenticated)/i.test(sql), false);
});

Deno.test("purge cron function rejects missing cron key like appointment-reminders-24h and calls the RPC", async () => {
  const source = await Deno.readTextFile(functionUrl);
  const reminderCron = await Deno.readTextFile(remindersUrl);
  const config = await Deno.readTextFile(configUrl);

  assertStringIncludes(source, 'Deno.env.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("x-cron-key")');
  assertStringIncludes(source, "UNAUTHORIZED");
  assertMatch(source, /status:\s*401/);
  assertStringIncludes(source, 'rpc("purge_elapsed_bookings")');
  assertEquals(/pg_cron/.test(source), false);
  assertStringIncludes(reminderCron, 'Deno.env.get("CRON_KEY")');
  assertStringIncludes(config, "[functions.purge-elapsed-bookings]");
  assertMatch(config, /\[functions\.purge-elapsed-bookings\]\s*\nverify_jwt\s*=\s*false/);
  assertMatch(config, /external scheduler POSTs/i);
});
