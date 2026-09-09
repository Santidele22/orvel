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
const pwaInstallPageUrl = new URL(
  "../../../apps/dashboard/src/app/features/pwa-install/pages/pwa-install.page.ts",
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

const ONBOARDING_TYPES = [
  "onboarding.no_services",
  "onboarding.no_hours",
  "onboarding.copy_link",
  "onboarding.share_day7",
] as const;

const RETENTION_TYPES = [
  "retention.first_public_booking",
  "retention.public_gap_7d",
  "retention.customer_cancelled_twice",
] as const;

const SLICE_2_3_TYPES = [...ONBOARDING_TYPES, ...RETENTION_TYPES] as const;

const ELEVEN_TYPES = [...OPS_TYPES, ...SLICE_2_3_TYPES] as const;

const ONBOARDING_ONCE_FLAGS = [
  "booking_link_copied_at",
  "onboarding_no_services_notified_at",
  "onboarding_no_hours_notified_at",
  "onboarding_copy_link_notified_at",
  "onboarding_share_day7_notified_at",
] as const;

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

async function readLatestNamedMigration(suffix: string): Promise<{ name: string; sql: string }> {
  const names: string[] = [];
  const pattern = new RegExp(`_${suffix}\\.sql$`);
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && pattern.test(entry.name)) {
      names.push(entry.name);
    }
  }
  names.sort();
  const name = names.at(-1);
  assert(name, `expected newest supabase/migrations/*_${suffix}.sql`);
  return { name, sql: await Deno.readTextFile(new URL(name, migrationsDir)) };
}

async function readLatestOpsMigration(): Promise<{ name: string; sql: string }> {
  return readLatestNamedMigration("operator_lifecycle_ops");
}

async function readLatestOnboardingMigration(): Promise<{ name: string; sql: string }> {
  return readLatestNamedMigration("operator_lifecycle_onboarding");
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
  const pushSw = await Deno.readTextFile(pushSwUrl);

  assertMatch(rpcBody, /ISODOW[\s\S]{0,80}BETWEEN\s+1\s+AND\s+5/i);
  assertMatch(rpcBody, /LIMIT\s+1/i);
  assertEquals(/mark_booking_link_copied/.test(sql), false);
  assertEquals(/booking_link_copied_at/.test(sql), false);
  assertStringIncludes(pushSw, "/dashboard/turnos");

  let reminderFiles = 0;
  for await (const entry of Deno.readDir(remindersDir)) {
    if (entry.isFile) reminderFiles += 1;
  }
  assert(reminderFiles > 0, "appointment-reminders-24h must remain present and untouched by this contract");
});

Deno.test("onboarding migration adds once-flag columns and clock branches 5-8", async () => {
  const { sql } = await readLatestOnboardingMigration();
  const rpcDef = functionDefinition(sql, "enqueue_operator_lifecycle_pushes");
  const rpcBody = functionBody(sql, "enqueue_operator_lifecycle_pushes");

  assertMatch(sql, /ALTER\s+TABLE\s+public\.business_settings/i);
  for (const column of ONBOARDING_ONCE_FLAGS) {
    assertStringIncludes(sql, `ADD COLUMN IF NOT EXISTS ${column} timestamptz`);
  }
  assertEquals(/retention_first_public_notified_at/.test(sql), false);
  assertEquals(/retention_gap7_notified_at/.test(sql), false);

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
  assertEquals(/last_login_at/.test(sql), false);
  assertEquals(/professional_hours/.test(rpcBody), false);
  assertEquals(/notification_email_outbox/i.test(rpcBody), false);

  for (const eventType of [...OPS_TYPES, ...ONBOARDING_TYPES]) {
    assertStringIncludes(rpcBody, `'${eventType}'`);
  }
  for (const eventType of RETENTION_TYPES) {
    assertEquals(rpcBody.includes(`'${eventType}'`), false, `slice 2 RPC must not insert ${eventType}`);
  }

  for (const eventType of ONBOARDING_TYPES) {
    const typeIndex = rpcBody.indexOf(`'${eventType}'`);
    assert(typeIndex >= 0, `missing ${eventType}`);
    const window = rpcBody.slice(Math.max(0, typeIndex - 400), typeIndex + 500);
    assertStringIncludes(window, "'once'");
    assertMatch(window, /p_appointment_id\s*:=\s*NULL/i);
  }

  assertStringIncludes(rpcBody, "'onboarding.no_services'");
  assertStringIncludes(rpcBody, "Faltan servicios");
  assertStringIncludes(rpcBody, "Todavía no hay un servicio activo.");
  assertStringIncludes(rpcBody, "onboarding_no_services_notified_at");
  assertMatch(rpcBody, /is_active/);
  assertMatch(
    rpcBody,
    /timezone\([\s\S]{0,80}created_at[\s\S]{0,80}\)::date|[\s\S]{0,40}created_at[\s\S]{0,80}timezone/i,
  );
  assertMatch(rpcBody, /onboarding\.no_services[\s\S]{0,800}>=\s*1|v_day_n\s*>=\s*1/i);

  assertStringIncludes(rpcBody, "'onboarding.no_hours'");
  assertStringIncludes(rpcBody, "Faltan horarios");
  assertStringIncludes(rpcBody, "No hay un día con horario habilitado.");
  assertStringIncludes(rpcBody, "onboarding_no_hours_notified_at");
  assertMatch(rpcBody, /monday['"]?[\s\S]{0,120}tuesday['"]?[\s\S]{0,120}wednesday['"]?[\s\S]{0,120}thursday['"]?[\s\S]{0,120}friday/i);
  assertStringIncludes(rpcBody, "(value->>'enabled') = 'true'");
  assertEquals(
    rpcBody.includes('{"monday":{"enabled":true,"start":"09:00","end":"18:00"}'),
    false,
    "default weekday 09-18 JSON must not be treated as HOURS_ALL_CLOSED",
  );
  assertMatch(rpcBody, /onboarding\.no_hours[\s\S]{0,800}>=\s*2|v_day_n\s*>=\s*2/i);

  assertStringIncludes(rpcBody, "'onboarding.copy_link'");
  assertStringIncludes(rpcBody, "Compartí tu link");
  assertStringIncludes(rpcBody, "Tu turnero está listo.");
  assertStringIncludes(rpcBody, "https://orvel.pro/booking/");
  assertStringIncludes(rpcBody, "onboarding_copy_link_notified_at");
  assertStringIncludes(rpcBody, "booking_link_copied_at IS NULL");
  assertMatch(rpcBody, /onboarding\.copy_link[\s\S]{0,800}>=\s*3|v_day_n\s*>=\s*3/i);

  assertStringIncludes(rpcBody, "'onboarding.share_day7'");
  assertStringIncludes(rpcBody, "Sin reservas públicas");
  assertStringIncludes(rpcBody, "A una semana, nadie reservó desde el link.");
  assertStringIncludes(rpcBody, "onboarding_share_day7_notified_at");
  assertStringIncludes(rpcBody, "client-self-service");
  assertEquals(/status\s*(<>|!=|NOT\s+IN)\s*'cancelled'/i.test(rpcBody), false);
  assertMatch(rpcBody, /onboarding\.share_day7[\s\S]{0,800}>=\s*7|v_day_n\s*>=\s*7/i);
});

Deno.test("mark_booking_link_copied is authenticated set-if-null and PWA install does not call it", async () => {
  const { sql } = await readLatestOnboardingMigration();
  const def = functionDefinition(sql, "mark_booking_link_copied");
  const body = functionBody(sql, "mark_booking_link_copied");
  const pwa = await Deno.readTextFile(pwaInstallPageUrl);

  assertMatch(def, /mark_booking_link_copied\s*\(\s*p_business_id\s+uuid\s*\)/i);
  assertMatch(def, /RETURNS\s+timestamptz/i);
  assertStringIncludes(def, "SECURITY DEFINER");
  assertMatch(def, /search_path\s*=\s*public,\s*pg_temp/i);
  assertStringIncludes(body, "can_manage_business");
  assertMatch(body, /booking_link_copied_at\s*=\s*(COALESCE\s*\(\s*booking_link_copied_at\s*,\s*now\(\)\s*\)|now\(\))/i);
  assertEquals(/working_hours/.test(body), false);
  assertEquals(/onboarding_no_services_notified_at/.test(body), false);
  assertMatch(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.mark_booking_link_copied\s*\(\s*uuid\s*\)\s+TO\s+authenticated/i,
  );
  assertEquals(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.mark_booking_link_copied[\s\S]{0,80}\banon\b/i.test(sql),
    false,
  );
  assertEquals(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\._insert_operator_lifecycle_notification[\s\S]{0,200}\b(anon|authenticated)\b/i
      .test(sql),
    false,
  );

  assertStringIncludes(pwa, "window.location.href");
  assertEquals(/mark_booking_link_copied/.test(pwa), false);
  assertEquals(/booking_link_copied_at/.test(pwa), false);
});
