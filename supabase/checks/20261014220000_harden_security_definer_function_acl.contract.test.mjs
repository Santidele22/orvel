import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20261014220000_harden_security_definer_function_acl.sql",
  import.meta.url,
);

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

test("migration is transactional and ends with a pgrst schema reload", async () => {
  const sql = await migrationSql();

  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

test("issue #1162: release_expired_booking_hold loses anon and authenticated execute", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /revoke execute on function public\.release_expired_booking_hold\(uuid, uuid\) from public, anon, authenticated;/,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.release_expired_booking_hold\(uuid, uuid\) to anon/,
  );
});

test("issue #1163: _read_business_booking_config is revoked from public-facing roles", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /revoke all on function public\._read_business_booking_config\(uuid\) from public, anon, authenticated;/,
  );
  assert.match(
    sql,
    /grant execute on function public\._read_business_booking_config\(uuid\) to service_role;/,
  );
});

test("issue #1164: entitlements (text, text) overload keeps named params and gains the owner guard", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /create or replace function public\.get_business_entitlements_snapshot\(business_id text, tenant_id text\)/,
  );
  assert.match(sql, /auth\.role\(\) <> 'service_role'/);
  assert.match(sql, /not public\.is_business_owner\(\$1::uuid\)/);
  assert.match(sql, /errcode = '42501'/);
  assert.match(
    sql,
    /revoke all on function public\.get_business_entitlements_snapshot\(text, text\) from public, anon;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_business_entitlements_snapshot\(text, text\) to authenticated, service_role;/,
  );
});

test("issue #1164: the guarded overload preserves the original query shape", async () => {
  const sql = await migrationSql();
  const original = await readFile(
    new URL(
      "../migrations/20260928210000_decouple_signup_and_entitlements_from_mp.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const fragment of [
    "from public.business_settings bs",
    "join public.businesses b",
    "left join public.business_onboarding_state bos",
    "left join public.plan_aliases pa",
    "join public.plan_entitlements pe",
    "coalesce(bos.account_user_id, b.owner_id)::text = $2",
  ]) {
    assert.ok(sql.includes(fragment), `missing fragment: ${fragment}`);
    assert.ok(original.toLowerCase().includes(fragment), `fragment not in original: ${fragment}`);
  }
});

test("issue #1169: trigger helpers are revoked from PUBLIC and client roles", async () => {
  const sql = await migrationSql();

  for (const fn of [
    "request_web_push_outbox_processing()",
    "ensure_business_principal_branch()",
    "handle_booking_notifications()",
    "enqueue_web_push_outbox()",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${fn.replace("()", "\\(\\)")} from public, anon, authenticated;`),
      `missing revoke for ${fn}`,
    );
  }
});
