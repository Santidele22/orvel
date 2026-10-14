import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20261014230000_public_booking_rate_limit.sql",
  import.meta.url,
);
const previousUrl = new URL(
  "../migrations/20260904180000_service_deposit_percent.sql",
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

test("rate limit table has RLS, an index, and no public-facing grants", async () => {
  const sql = await migrationSql();

  assert.match(sql, /create table if not exists public\.public_booking_rate_limits/);
  assert.match(sql, /alter table public\.public_booking_rate_limits enable row level security;/);
  assert.match(sql, /create index if not exists public_booking_rate_limits_bucket_idx/);
  assert.doesNotMatch(sql, /grant .* on table public\.public_booking_rate_limits/);
  assert.doesNotMatch(sql, /create policy .* on public\.public_booking_rate_limits/);
});

test("guard function is internal-only (no grant for any role)", async () => {
  const sql = await migrationSql();

  assert.match(sql, /create or replace function public\._guard_public_booking_rate_limit\(\s*p_bucket_hash text,\s*p_max_requests integer default 5,\s*p_window interval default interval '10 minutes'\s*\)/);
  assert.match(
    sql,
    /revoke all on function public\._guard_public_booking_rate_limit\(text, integer, interval\) from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(sql, /grant .*_guard_public_booking_rate_limit/);
});

test("create_public_booking keeps its grants and calls the guard before any tenant lookup", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /revoke all on function public\.create_public_booking\(text, text, text, jsonb, text, text, text\) from public;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.create_public_booking\(text, text, text, jsonb, text, text, text\) to anon, authenticated;/,
  );

  const guardIndex = sql.indexOf("public._guard_public_booking_rate_limit(");
  const tenantLookupIndex = sql.indexOf("from public.businesses b");
  assert.ok(guardIndex >= 0 && tenantLookupIndex >= 0);
  assert.ok(guardIndex < tenantLookupIndex, "guard must run before the tenant lookup");
  assert.match(sql, /_raise_rpc\('booking_rate_limited'\)/);
});

test("the recreated booking body is identical to the previous one apart from the guard", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  const previous = (await readFile(previousUrl, "utf8")).toLowerCase();

  const signature =
    "create or replace function public.create_public_booking(\n  business_slug text,\n  service_id text,\n  starts_at_iso text,\n  client jsonb,\n  notes text default null,\n  professional_id text default null,\n  branch_id text default null\n)";

  const oldBody = extractFunctionBody(previous, signature);
  let newBody = extractFunctionBody(sql, signature);

  // Strip the two extra DECLARE variables and the guard block from the new body.
  newBody = newBody.replace("\n  v_headers jsonb;\n  v_client_ip text;", "");
  const guardStart = newBody.indexOf("  -- #1165:");
  const guardEnd = newBody.indexOf("end if;", guardStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart, "guard block not found in new body");
  newBody = newBody.slice(0, guardStart) + newBody.slice(guardEnd + "end if;".length);
  // The guard block was surrounded by blank lines; collapse the seam.
  newBody = newBody.replace(/\n{3,}/g, "\n\n");

  assert.equal(newBody, oldBody, "booking function body drifted beyond the rate-limit guard");
});
