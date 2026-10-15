import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20261015003000_fix_enqueue_reminders_service_join.sql",
  import.meta.url,
);
const previousUrl = new URL(
  "../migrations/20260829180000_reminder_operator_push_and_premium_activated.sql",
  import.meta.url,
);

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

function extractFunctionBody(sql, signature) {
  const start = sql.indexOf(signature);
  assert.ok(start >= 0, `function not found: ${signature}`);
  const bodyStart = sql.indexOf("as $$", start);
  const bodyEnd = sql.indexOf("$$;", bodyStart);
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, `body markers not found for ${signature}`);
  return sql.slice(bodyStart + "as $$".length, bodyEnd);
}

test("migration is transactional and reloads the postgrest schema", async () => {
  const sql = await migrationSql();

  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

test("services join matches uuid = uuid with no single-sided text cast", async () => {
  const sql = await migrationSql();
  const body = extractFunctionBody(
    sql,
    "create or replace function public.enqueue_appointment_reminders_24h()",
  );

  assert.match(body, /join public\.services s on s\.id = b\.service_id/);
  assert.doesNotMatch(body, /s\.id::text = b\.service_id/);
  assert.doesNotMatch(body, /s\.id = b\.service_id::text/);
});

test("function acl stays internal: service_role only", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /revoke all on function public\.enqueue_appointment_reminders_24h\(\) from public, anon, authenticated;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.enqueue_appointment_reminders_24h\(\) to service_role;/,
  );
});

test("the recreated body is identical to the previous one apart from the join", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  const previous = (await readFile(previousUrl, "utf8")).toLowerCase();

  const signature = "create or replace function public.enqueue_appointment_reminders_24h()";

  const oldBody = extractFunctionBody(previous, signature);
  const newBody = extractFunctionBody(sql, signature).replace(
    "join public.services s on s.id = b.service_id",
    "join public.services s on s.id::text = b.service_id",
  );

  assert.equal(newBody, oldBody, "reminder function body drifted beyond the join fix");
});
