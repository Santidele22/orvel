import { assert, assertEquals, assertMatch, assertStringIncludes } from "std/assert/mod.ts";

const migrationsDir = new URL("../../migrations/", import.meta.url);
const configUrl = new URL("../../config.toml", import.meta.url);
const functionUrl = new URL("../operator-lifecycle-pushes/index.ts", import.meta.url);
const workflowUrl = new URL(
  "../../../.github/workflows/operator-lifecycle-pushes.yml",
  import.meta.url,
);
const deployPromotionUrl = new URL(
  "../../../.github/workflows/deploy-promotion.yml",
  import.meta.url,
);
const homePageUrl = new URL(
  "../../../apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.ts",
  import.meta.url,
);
const settingsPageUrl = new URL(
  "../../../apps/dashboard/src/app/features/settings/pages/configuracion.page.ts",
  import.meta.url,
);
const pushSwUrl = new URL("../../../apps/dashboard/src/orvel-push-sw.js", import.meta.url);
const remindersDir = new URL("../appointment-reminders-24h/", import.meta.url);

const OPS_TYPES = [
  "lifecycle.briefing",
  "lifecycle.first_turno_soon",
  "lifecycle.empty_agenda",
  "lifecycle.stale_deposit_claim",
] as const;

const SLICE_2_3_TYPES = [
  "onboarding.no_services",
  "onboarding.no_hours",
  "onboarding.copy_link",
  "onboarding.share_day7",
  "retention.first_public_booking",
  "retention.public_gap_7d",
  "retention.customer_cancelled_twice",
] as const;

const ELEVEN_TYPES = [...OPS_TYPES, ...SLICE_2_3_TYPES] as const;

function functionBody(sql: string, name: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );
  const bodies = Array.from(sql.matchAll(pattern), (match) => match[1]);
  const body = bodies.at(-1);
  assert(body && body.length > 0, `expected public.${name} body in ops migration`);
  return body;
}

function functionDefinition(sql: string, name: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+\\$\\$[\\s\\S]*?\\$\\$`,
    "gi",
  );
  const definitions = Array.from(sql.matchAll(pattern), (match) => match[0]);
  const definition = definitions.at(-1);
  assert(definition && definition.length > 0, `expected public.${name} definition in ops migration`);
  return definition;
}

async function readLatestOpsMigration(): Promise<{ name: string; sql: string }> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && /_operator_lifecycle_ops\.sql$/.test(entry.name)) {
      names.push(entry.name);
    }
  }
  names.sort();
  const name = names.at(-1);
  assert(name, "expected newest supabase/migrations/*_operator_lifecycle_ops.sql");
  return { name, sql: await Deno.readTextFile(new URL(name, migrationsDir)) };
}

Deno.test("ops migration unique idempotency index and helper catch unique_violation", async () => {
  const { sql } = await readLatestOpsMigration();
  const helperDef = functionDefinition(sql, "_insert_operator_lifecycle_notification");
  const helperBody = functionBody(sql, "_insert_operator_lifecycle_notification");

  assertStringIncludes(sql, "dashboard_notifications_lifecycle_idempotency_uidx");
  assertMatch(
    sql,
    /ON\s+public\.dashboard_notifications\s*\(\s*business_id\s*,\s*event_type\s*,\s*\(metadata->>'idempotency_key'\)\s*\)/i,
  );
  assertMatch(
    sql,
    /WHERE\s+coalesce\(\s*metadata->>'idempotency_key'\s*,\s*''\s*\)\s*<>\s*''/i,
  );

  assertStringIncludes(helperDef, "SECURITY DEFINER");
  assertMatch(helperDef, /search_path\s*=\s*public,\s*pg_temp/i);
  assertStringIncludes(helperBody, "unique_violation");
  assertStringIncludes(helperBody, "idempotency_key");
  assertEquals(/where\s+not\s+exists/i.test(helperBody), false);
  assertEquals(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\._insert_operator_lifecycle_notification[\s\S]{0,200}\b(anon|authenticated)\b/i
      .test(sql),
    false,
  );
  assertMatch(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\._insert_operator_lifecycle_notification\([^)]+\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
  );
});

Deno.test("clock RPC is service_role only, timezone aware, and inserts only ops types", async () => {
  const { sql } = await readLatestOpsMigration();
  const rpcDef = functionDefinition(sql, "enqueue_operator_lifecycle_pushes");
  const rpcBody = functionBody(sql, "enqueue_operator_lifecycle_pushes");

  assertMatch(rpcDef, /RETURNS\s+integer/i);
  assertMatch(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.enqueue_operator_lifecycle_pushes\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
  );
  assertMatch(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_operator_lifecycle_pushes\(\)\s+TO\s+service_role/i,
  );
  assertStringIncludes(rpcBody, "account_closed_at IS NOT NULL");
  assertStringIncludes(rpcBody, "COALESCE(businesses.timezone, 'America/Argentina/Buenos_Aires')");
  assertEquals(/pg_cron/i.test(sql), false);
  assertEquals(/enqueue_appointment_reminders_24h/i.test(rpcBody), false);
  assertEquals(/notification_email_outbox/i.test(rpcBody), false);

  for (const eventType of OPS_TYPES) {
    assertStringIncludes(rpcBody, `'${eventType}'`);
  }
  for (const eventType of SLICE_2_3_TYPES) {
    assertEquals(rpcBody.includes(`'${eventType}'`), false, `RPC must not insert ${eventType} in slice 1`);
  }
});

Deno.test("latest enqueue allowlist names eleven spec strings and keeps fail-open", async () => {
  const { sql } = await readLatestOpsMigration();
  const enqueueBody = functionBody(sql, "enqueue_web_push_outbox");
  const enqueueDef = functionDefinition(sql, "enqueue_web_push_outbox");

  for (const eventType of [
    ...ELEVEN_TYPES,
    "appointment.created",
    "appointment.cancelled",
    "appointment.rescheduled",
    "appointment.reminder",
  ]) {
    assertStringIncludes(enqueueBody, `'${eventType}'`);
  }
  assertEquals(enqueueBody.includes("'deposit.claimed'"), false);
  assertEquals(enqueueBody.includes("'system.welcome'"), false);
  assertMatch(enqueueDef, /EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s+RETURN\s+NEW/i);
});

Deno.test("ops predicates: briefing window, first remaining 60-90, empty after busy yesterday, stale claim 15m", async () => {
  const { sql } = await readLatestOpsMigration();
  const rpcBody = functionBody(sql, "enqueue_operator_lifecycle_pushes");

  assertStringIncludes(rpcBody, "'lifecycle.briefing'");
  assertStringIncludes(rpcBody, "Resumen de hoy");
  assertMatch(rpcBody, /ISODOW/i);
  assertStringIncludes(rpcBody, "08:30");
  assertStringIncludes(rpcBody, "08:45");
  assertEquals(/09:30/.test(rpcBody), false);
  assertMatch(rpcBody, /appointment_id[\s\S]{0,80}NULL[\s\S]{0,200}'lifecycle\.briefing'/i);

  assertStringIncludes(rpcBody, "'lifecycle.first_turno_soon'");
  assertMatch(rpcBody, /ORDER\s+BY\s+[\s\S]*starts_at/i);
  assertStringIncludes(rpcBody, "interval '60 minutes'");
  assertStringIncludes(rpcBody, "interval '90 minutes'");
  assertMatch(rpcBody, /status\s+IN\s*\(\s*'booked'\s*,\s*'confirmed'\s*\)/i);

  assertStringIncludes(rpcBody, "'lifecycle.empty_agenda'");
  assertMatch(rpcBody, /interval\s+'1 day'|-\s*1/i);

  assertStringIncludes(rpcBody, "'lifecycle.stale_deposit_claim'");
  assertStringIncludes(rpcBody, "claim_pending");
  assertStringIncludes(rpcBody, "deposit_claimed_at");
  assertStringIncludes(rpcBody, "interval '15 minutes'");
  assertStringIncludes(rpcBody, "booking:");
  assertEquals(/'deposit\.claimed'/.test(rpcBody), false);
  assertEquals(/interval '30 minutes'/.test(rpcBody), false);
});

Deno.test("operator-lifecycle-pushes Edge Function rejects bad CRON_KEY with 401 before rpc", async () => {
  const source = await Deno.readTextFile(functionUrl);
  const config = await Deno.readTextFile(configUrl);

  assertStringIncludes(source, 'Deno.env.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("x-cron-key")');
  assertStringIncludes(source, "UNAUTHORIZED");
  assertStringIncludes(source, "SERVER_CONFIGURATION_ERROR");
  assertStringIncludes(source, "OPERATOR_LIFECYCLE_PUSHES_FAILED");
  assertMatch(source, /status:\s*401/);
  assertEquals(/isPrivilegedWebPushAuthorization/.test(source), false);
  assertEquals(/pg_cron/.test(source), false);

  const unauthorizedIndex = source.search(/status:\s*401/);
  const rpcIndex = source.search(/rpc\(\s*"enqueue_operator_lifecycle_pushes"/);
  assert(unauthorizedIndex >= 0, "missing/bad CRON_KEY must return 401");
  assert(rpcIndex > unauthorizedIndex, "RPC must not run before the 401 CRON_KEY gate");
  assertEquals(/rpc\([\s\S]*enqueue_operator_lifecycle_pushes[\s\S]*status:\s*401/.test(source), false);

  assertEquals(/SUPABASE_SERVICE_ROLE_KEY/.test(source.slice(source.indexOf("return new Response"))), true);
  const responses = Array.from(source.matchAll(/JSON\.stringify\(\s*\{([\s\S]*?)\}\s*\)/g), (m) => m[1]);
  assert(responses.length > 0, "expected JSON responses");
  for (const body of responses) {
    assertEquals(/service_role/i.test(body), false);
    assertEquals(/CRON_KEY/.test(body), false);
    assertEquals(/SERVICE_ROLE/.test(body), false);
  }

  assertStringIncludes(config, "[functions.operator-lifecycle-pushes]");
  assertMatch(config, /\[functions\.operator-lifecycle-pushes\]\s*\nverify_jwt\s*=\s*false/);
  assertMatch(config, /CRON_KEY/);
});

Deno.test("lifecycle workflow posts every 15 minutes with dedicated cron secrets", async () => {
  const workflow = await Deno.readTextFile(workflowUrl);

  assertMatch(workflow, /cron:\s*"\*\/15 \* \* \* \*"/);
  assertStringIncludes(workflow, "workflow_dispatch");
  assertStringIncludes(workflow, "OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL");
  assertStringIncludes(workflow, "OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET");
  assertStringIncludes(
    workflow,
    'if [ -z "$OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL" ] || [ -z "$OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET" ]; then',
  );
  assertStringIncludes(workflow, "exit 1");
  assertStringIncludes(workflow, "--output /dev/null");
  assertStringIncludes(workflow, "Authorization: Bearer ${OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET}");
  assertEquals(/SERVICE_ROLE/.test(workflow), false);
  assertEquals(/pg_cron/.test(workflow), false);
  assertMatch(workflow, /unique index|idempotency/i);

  const deployPromotion = await Deno.readTextFile(deployPromotionUrl);
  assertStringIncludes(
    deployPromotion,
    "supabase functions deploy operator-lifecycle-pushes",
  );
});

Deno.test("slice-1 clock no-ops and does not instrument copy-link or reminder email", async () => {
  const { sql } = await readLatestOpsMigration();
  const rpcBody = functionBody(sql, "enqueue_operator_lifecycle_pushes");
  const home = await Deno.readTextFile(homePageUrl);
  const settings = await Deno.readTextFile(settingsPageUrl);
  const pushSw = await Deno.readTextFile(pushSwUrl);

  assertMatch(rpcBody, /ISODOW[\s\S]{0,80}BETWEEN\s+1\s+AND\s+5/i);
  assertMatch(rpcBody, /LIMIT\s+1/i);
  assertEquals(/mark_booking_link_copied/.test(sql), false);
  assertEquals(/booking_link_copied_at/.test(sql), false);
  assertEquals(/mark_booking_link_copied/.test(home), false);
  assertEquals(/booking_link_copied_at/.test(home), false);
  assertEquals(/mark_booking_link_copied/.test(settings), false);
  assertEquals(/booking_link_copied_at/.test(settings), false);
  assertStringIncludes(pushSw, "/dashboard/turnos");

  let reminderFiles = 0;
  for await (const entry of Deno.readDir(remindersDir)) {
    if (entry.isFile) reminderFiles += 1;
  }
  assert(reminderFiles > 0, "appointment-reminders-24h must remain present and untouched by this contract");
});
