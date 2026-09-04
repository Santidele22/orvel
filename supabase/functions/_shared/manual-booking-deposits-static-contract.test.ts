const migrationsDir = new URL("../../migrations/", import.meta.url);
const wu1MigrationName = "20260904120000_manual_booking_deposits.sql";

const DEPOSIT_STATUSES = [
  "none",
  "pending",
  "paid",
  "claim_pending",
  "released",
  "abandoned",
  "void",
] as const;

const occupancyDepositFilter =
  /COALESCE\s*\(\s*(?:bk\.)?deposit_status\s*,\s*'none'\s*\)\s*NOT\s+IN\s*\(\s*'released'\s*,\s*'abandoned'\s*,\s*'void'\s*\)/i;

const occupancyLifecycleStatus =
  /(?:bk\.)?status\s+IN\s*\(\s*'confirmed'\s*,\s*'pending'\s*\)/i;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readText(url: URL): Promise<string> {
  return await Deno.readTextFile(url);
}

async function readAllSqlMigrations(): Promise<string> {
  const entries: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) entries.push(entry.name);
  }
  entries.sort();

  const chunks = await Promise.all(
    entries.map(async (name) =>
      `\n-- file: ${name}\n${await readText(new URL(name, migrationsDir))}`
    ),
  );
  return chunks.join("\n");
}

function latestFunctionBodyMatching(
  sql: string,
  functionName: string,
  predicate: (body: string) => boolean,
): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );

  const bodies = Array.from(sql.matchAll(pattern), (match) => match[1]);
  const body = bodies.filter(predicate).at(-1);
  assert(
    body,
    `Expected to find public.${functionName} matching the requested contract in migrations`,
  );
  return body;
}

function latestFunctionDefinition(
  sql: string,
  functionName: string,
  predicate: (definition: string) => boolean = () => true,
): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+\\$\\$[\\s\\S]*?\\$\\$`,
    "gi",
  );
  const definitions = Array.from(sql.matchAll(pattern), (match) => match[0])
    .filter(predicate);
  const definition = definitions.at(-1);
  assert(
    definition,
    `Expected to find public.${functionName} definition in migrations`,
  );
  return definition;
}

function assertOccupancyExcludesReleasedHolds(body: string, functionName: string) {
  assert(
    occupancyLifecycleStatus.test(body),
    `${functionName} must keep counting confirmed and pending bookings for occupancy`,
  );
  assert(
    occupancyDepositFilter.test(body),
    `${functionName} must exclude deposit_status in (released, abandoned, void) so a released hold frees the slot without mutating bookings.status`,
  );
}

Deno.test("WU1 schema: bookings.deposit_status CHECK lists the orthogonal machine and defaults to none", async () => {
  const sql = await readAllSqlMigrations();

  assert(
    /ALTER\s+TABLE\s+public\.bookings[\s\S]*deposit_status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'none'/i
      .test(sql),
    "bookings.deposit_status must be text NOT NULL DEFAULT 'none'",
  );

  for (const status of DEPOSIT_STATUSES) {
    assert(
      new RegExp(`deposit_status[\\s\\S]{0,400}\\b${status}\\b`, "i").test(sql),
      `bookings.deposit_status CHECK must allow '${status}'`,
    );
  }
});

Deno.test("WU1 schema: partial unique index bookings_deposit_code_uidx exists", async () => {
  const sql = await readAllSqlMigrations();

  assert(
    /CREATE\s+UNIQUE\s+INDEX\s+bookings_deposit_code_uidx\s+ON\s+public\.bookings\s*\(\s*deposit_code\s*\)\s*WHERE\s+deposit_code\s+IS\s+NOT\s+NULL/i
      .test(sql),
    "Expected partial unique index bookings_deposit_code_uidx on non-null deposit_code",
  );
});

Deno.test("WU1 schema: business_settings deposit columns default off", async () => {
  const sql = await readAllSqlMigrations();

  assert(
    /ALTER\s+TABLE\s+public\.business_settings[\s\S]*deposit_enabled\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i
      .test(sql),
    "business_settings.deposit_enabled must be boolean NOT NULL DEFAULT false",
  );
  assert(
    /deposit_amount_pesos\s+numeric\s*\(\s*10\s*,\s*2\s*\)/i.test(sql),
    "business_settings must add deposit_amount_pesos numeric(10,2)",
  );
  assert(
    /deposit_alias\s+text/i.test(sql),
    "business_settings must add deposit_alias",
  );
  assert(
    /deposit_cbu\s+text/i.test(sql),
    "business_settings must add deposit_cbu",
  );
});

Deno.test("WU1 occupancy: latest _query_booking_slot_availability excludes released holds", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "_query_booking_slot_availability",
    (candidate) => /v_booking_count/i.test(candidate),
  );
  assertOccupancyExcludesReleasedHolds(body, "_query_booking_slot_availability");
});

Deno.test("WU1 occupancy: latest _assert_no_slot_conflict excludes released holds", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "_assert_no_slot_conflict",
    (candidate) => /v_occupied/i.test(candidate) || /SLOT_CONFLICT/i.test(candidate),
  );
  assertOccupancyExcludesReleasedHolds(body, "_assert_no_slot_conflict");
});

Deno.test("WU1 hold clock: deposit hold expiry is created_at + interval '30 minutes'", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "_booking_deposit_hold_expires_at",
    (candidate) => /interval\s+'30 minutes'/i.test(candidate),
  );

  assert(
    /interval\s+'30 minutes'/i.test(body),
    "Hold clock helper must add interval '30 minutes'",
  );
});

Deno.test("WU1 release: pending timeout sets released and never inserts a strike", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "release_expired_booking_hold",
    (candidate) => /deposit_hold_expires_at/i.test(candidate),
  );

  assert(
    /deposit_status\s+IN\s*\(\s*'pending'\s*,\s*'claim_pending'\s*\)/i.test(body),
    "release_expired_booking_hold must select pending and claim_pending holds",
  );
  assert(
    /deposit_hold_expires_at\s*<\s*now\s*\(\s*\)/i.test(body),
    "release_expired_booking_hold must expire holds past deposit_hold_expires_at",
  );
  assert(
    /deposit_status\s*=\s*'released'/i.test(body),
    "release_expired_booking_hold must set deposit_status to released",
  );
  assert(
    !/SET\s+status\s*=/i.test(body),
    "release_expired_booking_hold must not mutate bookings.status",
  );

  const pendingBranch = body.match(
    /IF\s+[\s\S]*?'pending'[\s\S]*?THEN([\s\S]*?)END\s+IF/i,
  )?.[1] ?? "";
  assert(
    pendingBranch.length > 0,
    "release_expired_booking_hold must have an explicit pending branch",
  );
  assert(
    !/INSERT\s+INTO\s+public\.booking_deposit_strikes/i.test(pendingBranch),
    "pending timeout must insert zero strike rows",
  );
});

Deno.test("WU1 release: claim_pending timeout records one strike and timeout_strike evidence", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "release_expired_booking_hold",
    (candidate) => /timeout_strike/i.test(candidate),
  );

  const claimBranch = body.match(
    /IF\s+[\s\S]*?'claim_pending'[\s\S]*?THEN([\s\S]*?)END\s+IF/i,
  )?.[1] ?? "";
  assert(
    claimBranch.length > 0,
    "release_expired_booking_hold must have an explicit claim_pending branch",
  );
  assert(
    /INSERT\s+INTO\s+public\.booking_deposit_strikes/i.test(claimBranch),
    "claim_pending timeout must insert one booking_deposit_strikes row",
  );
  assert(
    /ON\s+CONFLICT\s*\(\s*booking_id\s*\)\s*DO\s+NOTHING/i.test(claimBranch),
    "strike insert must be idempotent on booking_id",
  );
  assert(
    /INSERT\s+INTO\s+public\.booking_deposit_evidence[\s\S]*'timeout_strike'/i
      .test(claimBranch),
    "claim_pending timeout must write evidence event_type timeout_strike",
  );
});

Deno.test("WU1 release: SECURITY DEFINER RPC is granted to anon, authenticated, and service_role", async () => {
  const sql = await readAllSqlMigrations();
  const definition = latestFunctionDefinition(
    sql,
    "release_expired_booking_hold",
  );

  assert(
    /SECURITY\s+DEFINER/i.test(definition),
    "release_expired_booking_hold must be SECURITY DEFINER",
  );
  assert(
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.release_expired_booking_hold[\s\S]*FROM\s+PUBLIC/i
      .test(sql),
    "release_expired_booking_hold must REVOKE ALL FROM PUBLIC",
  );
  assert(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.release_expired_booking_hold[\s\S]*TO\s+anon\s*,\s*authenticated\s*,\s*service_role/i
      .test(sql),
    "release_expired_booking_hold must GRANT EXECUTE to anon, authenticated, service_role",
  );
});

Deno.test("WU1 lazy expiry: availability query releases expired holds before occupancy count", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "_query_booking_slot_availability",
    (candidate) => /v_booking_count/i.test(candidate),
  );
  const releaseIndex = body.search(/release_expired_booking_hold\s*\(/i);
  const countIndex = body.search(/SELECT\s+count\(\*\)/i);

  assert(
    releaseIndex >= 0,
    "_query_booking_slot_availability must call release_expired_booking_hold",
  );
  assert(
    countIndex > releaseIndex,
    "lazy release must run before occupancy count so a released hold frees the slot",
  );
});

Deno.test("WU1 evidence and strikes tables enable RLS and revoke anon", async () => {
  const sql = await readAllSqlMigrations();

  for (const table of ["booking_deposit_evidence", "booking_deposit_strikes"]) {
    assert(
      new RegExp(`CREATE\\s+TABLE\\s+public\\.${table}\\s*\\(`, "i").test(sql),
      `Expected public.${table}`,
    );
    assert(
      new RegExp(
        `ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        "i",
      ).test(sql),
      `${table} must enable RLS`,
    );
    assert(
      new RegExp(
        `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+[\\s\\S]*\\banon\\b`,
        "i",
      ).test(sql),
      `${table} must REVOKE ALL FROM anon`,
    );
    assert(
      !new RegExp(`CREATE\\s+POLICY[\\s\\S]{0,200}\\b${table}\\b[\\s\\S]{0,200}\\banon\\b`, "i")
        .test(sql),
      `${table} must not grant an anon policy`,
    );
  }
});

Deno.test("WU1 migration must not redefine create_public_booking", async () => {
  const wu1 = await readText(new URL(wu1MigrationName, migrationsDir));

  assert(
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_public_booking/i.test(wu1),
    "WU1 must not redefine create_public_booking (that belongs to WU2)",
  );
});

const DEPOSITS_OFF_RETURN_KEYS = [
  "booking_id",
  "branch_id",
  "status",
  "manage_token",
  "source",
  "db_atomic_visibility_notifications",
  "business_email_outbox_enqueued",
] as const;

const DEPOSIT_HOLD_RETURN_KEYS = [
  "deposit_code",
  "deposit_amount",
  "deposit_alias",
  "deposit_cbu",
  "deposit_hold_expires_at",
  "deposit_hold_message",
] as const;

const HOLD_MESSAGE = "Si no se confirma la seña, el horario se libera.";
const FORBIDDEN_REFUND_COPY = "te devolvemos la plata";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function latestCreatePublicBookingBody(sql: string): string {
  return latestFunctionBodyMatching(
    sql,
    "create_public_booking",
    (body) => /INSERT\s+INTO\s+public\.bookings/i.test(body),
  );
}

function extractBalancedCall(sql: string, start: number): string {
  const open = sql.indexOf("(", start);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return sql.slice(start, i + 1);
    }
  }
  return "";
}

function baseReturnObject(body: string): string {
  const insertIndex = body.search(/INSERT\s+INTO\s+public\.bookings/i);
  assert(insertIndex >= 0, "create_public_booking must insert into public.bookings");
  const haystack = body.slice(insertIndex);
  const pattern = /jsonb_build_object\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(haystack)) !== null) {
    const call = extractBalancedCall(haystack, match.index);
    if (/'booking_id'/i.test(call) && /'manage_token'/i.test(call)) {
      return call;
    }
  }
  throw new Error("create_public_booking must return a booking_id/manage_token object after insert");
}

function latestWu2MigrationName(names: string[]): string {
  const later = names
    .filter((name) => name.endsWith(".sql") && name > wu1MigrationName)
    .sort();
  return later.at(-1) ?? "";
}

Deno.test("WU2 deposits-off: create_public_booking keeps the 7-key return without hold fields", async () => {
  const body = latestCreatePublicBookingBody(await readAllSqlMigrations());
  const baseObject = baseReturnObject(body);

  assert(baseObject.length > 0, "deposits-off path must build a jsonb return object");
  for (const key of DEPOSITS_OFF_RETURN_KEYS) {
    assert(
      new RegExp(`'${key}'`, "i").test(baseObject),
      `deposits-off return must keep '${key}'`,
    );
  }
  for (const key of DEPOSIT_HOLD_RETURN_KEYS) {
    assert(
      !new RegExp(`'${key}'`, "i").test(baseObject),
      `deposits-off 7-key return must not include '${key}'`,
    );
  }
});

Deno.test("WU2 deposits-on: hold keys, confirmed status, Crockford code, and slot occupancy", async () => {
  const sql = await readAllSqlMigrations();
  const body = latestCreatePublicBookingBody(sql);

  assert(
    /deposit_enabled/i.test(body),
    "create_public_booking must branch on deposit_enabled",
  );
  for (const key of DEPOSIT_HOLD_RETURN_KEYS) {
    assert(
      new RegExp(`'${key}'`, "i").test(body),
      `deposits-on return must include '${key}'`,
    );
  }
  assert(
    /deposit_status\s*=\s*'pending'/i.test(body),
    "deposits-on insert must set deposit_status pending",
  );
  assert(
    /v_status\s*:=\s*'confirmed'/i.test(body) ||
      /status\s*,[\s\S]*'confirmed'/i.test(body),
    "deposits-on hold must keep bookings.status confirmed so the hold occupies the slot",
  );
  assert(
    /_booking_deposit_hold_expires_at\s*\(/i.test(body),
    "create_public_booking must reuse _booking_deposit_hold_expires_at",
  );
  assert(
    /'ORV-'\s*\|\|/i.test(sql) || /ORV-/i.test(body),
    "deposit_code must use the ORV- prefix",
  );
  assert(
    sql.includes(CROCKFORD) || body.includes(CROCKFORD),
    "deposit_code must draw 8 characters from Crockford base32",
  );
  assert(
    /unique_violation/i.test(sql) || /unique_violation/i.test(body),
    "deposit_code generation must retry on unique_violation",
  );
  assert(
    /_assert_no_slot_conflict\s*\(/i.test(body),
    "create_public_booking must still occupy the slot through conflict assertion",
  );
});

Deno.test("WU2 confirm_booking_deposit_received: pending to paid only, never update_booking_status", async () => {
  const sql = await readAllSqlMigrations();
  const definition = latestFunctionDefinition(
    sql,
    "confirm_booking_deposit_received",
    (candidate) => /booking_id/i.test(candidate) && /performed_by/i.test(candidate),
  );
  const body = latestFunctionBodyMatching(
    sql,
    "confirm_booking_deposit_received",
    (candidate) => /BOOKING_DEPOSIT_CONFIRM_REJECTED/i.test(candidate),
  );

  assert(/SECURITY\s+DEFINER/i.test(definition), "confirm RPC must be SECURITY DEFINER");
  assert(
    /confirm_booking_deposit_received\s*\(\s*booking_id\s+uuid\s*,\s*performed_by\s+uuid/i
      .test(definition),
    "confirm_booking_deposit_received(booking_id, performed_by) signature is required",
  );
  assert(
    /can_manage_business\s*\(/i.test(body),
    "confirm RPC must authorize via can_manage_business",
  );
  assert(
    /release_expired_booking_hold\s*\(/i.test(body),
    "confirm RPC must lazy-release expired holds first",
  );
  assert(
    /deposit_status\s*=\s*'paid'/i.test(body),
    "confirm RPC must advance pending to paid",
  );
  assert(
    /BOOKING_DEPOSIT_CONFIRM_REJECTED/i.test(body),
    "confirm RPC must reject non-pending rows with BOOKING_DEPOSIT_CONFIRM_REJECTED",
  );
  assert(
    !/update_booking_status\s*\(/i.test(body),
    "confirm RPC must never call update_booking_status",
  );
  assert(
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.confirm_booking_deposit_received[\s\S]*FROM\s+PUBLIC/i
      .test(sql),
    "confirm RPC must REVOKE ALL FROM PUBLIC",
  );
  assert(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.confirm_booking_deposit_received[\s\S]*TO\s+authenticated\s*,\s*service_role/i
      .test(sql),
    "confirm RPC must GRANT EXECUTE to authenticated, service_role",
  );
});

Deno.test("WU2 claim_booking_deposit: pending to claim_pending with evidence, never paid", async () => {
  const sql = await readAllSqlMigrations();
  const definition = latestFunctionDefinition(
    sql,
    "claim_booking_deposit",
    (candidate) => /manage_token/i.test(candidate),
  );
  const body = latestFunctionBodyMatching(
    sql,
    "claim_booking_deposit",
    (candidate) => /claim_pending/i.test(candidate),
  );

  assert(/SECURITY\s+DEFINER/i.test(definition), "claim RPC must be SECURITY DEFINER");
  assert(
    /claim_booking_deposit\s*\(\s*manage_token\s+text\s*,\s*note\s+text/i.test(definition),
    "claim_booking_deposit(manage_token, note) signature is required",
  );
  assert(
    /_hash_manage_token\s*\(/i.test(body),
    "claim RPC must resolve the booking via _hash_manage_token",
  );
  assert(
    /release_expired_booking_hold\s*\(/i.test(body),
    "claim RPC must lazy-release expired holds first",
  );
  assert(
    /deposit_status\s*=\s*'claim_pending'/i.test(body),
    "claim RPC must set deposit_status to claim_pending",
  );
  assert(
    /deposit_claimed_at\s*=\s*now\s*\(\s*\)/i.test(body),
    "claim RPC must stamp deposit_claimed_at",
  );
  assert(
    /INSERT\s+INTO\s+public\.booking_deposit_evidence[\s\S]*'claim'/i.test(body),
    "claim RPC must write evidence event_type claim",
  );
  assert(
    !/deposit_status\s*=\s*'paid'/i.test(body),
    "claim RPC must never set paid",
  );
  assert(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_booking_deposit[\s\S]*TO\s+anon\s*,\s*authenticated/i
      .test(sql),
    "claim RPC must GRANT EXECUTE to anon, authenticated",
  );
});

Deno.test("WU2 copy, admin skip, incomplete settings, config, and legacy-only scope", async () => {
  const sql = await readAllSqlMigrations();
  const createBody = latestCreatePublicBookingBody(sql);
  const configBody = latestFunctionBodyMatching(
    sql,
    "_read_business_booking_config",
    (candidate) => /deposit_enabled/i.test(candidate),
  );
  const adminBody = latestFunctionBodyMatching(
    sql,
    "create_admin_manual_booking",
    (candidate) => /INSERT\s+INTO\s+public\.bookings/i.test(candidate),
  );
  const sixArg = latestFunctionBodyMatching(
    sql,
    "create_public_booking",
    (candidate) =>
      /SELECT\s+public\.create_public_booking\s*\([\s\S]*NULL::text\s*\)/i.test(candidate),
  );

  assert(
    createBody.includes(HOLD_MESSAGE),
    "hold message must be exactly 'Si no se confirma la seña, el horario se libera.'",
  );
  assert(
    !createBody.toLowerCase().includes(FORBIDDEN_REFUND_COPY),
    "create_public_booking must not imply Orvel refunds money",
  );
  assert(
    /BOOKING_DEPOSIT_SETTINGS_INCOMPLETE/i.test(createBody),
    "incomplete deposit settings must raise BOOKING_DEPOSIT_SETTINGS_INCOMPLETE",
  );
  assert(
    /deposit_enabled/i.test(configBody) &&
      /deposit_amount_pesos/i.test(configBody) &&
      /deposit_alias/i.test(configBody) &&
      /deposit_cbu/i.test(configBody),
    "_read_business_booking_config must surface deposit settings",
  );
  assert(
    !/deposit_status\s*=\s*'pending'/i.test(adminBody),
    "admin/walk-in insert must omit pending holds",
  );
  assert(
    /SELECT\s+public\.create_public_booking\s*\(/i.test(sixArg),
    "6-arg create_public_booking must keep delegating to the 7-arg hold path",
  );

  const entries: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) entries.push(entry.name);
  }
  const wu2Name = latestWu2MigrationName(entries);
  assert(
    wu2Name.length > 0 && wu2Name !== wu1MigrationName,
    "WU2 must add a later-timestamp migration instead of editing WU1",
  );
  const wu2 = await readText(new URL(wu2Name, migrationsDir));
  assert(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_public_booking/i.test(wu2),
    "WU2 migration must redefine create_public_booking",
  );
  assert(
    !/INSERT\s+INTO\s+public\.appointments\b/i.test(wu2) &&
      !/FROM\s+public\.appointments\b/i.test(wu2),
    "WU2 must stay on legacy public.bookings, not appointments",
  );
  assert(
    !/packages\/billing/i.test(wu2),
    "WU2 must not reuse packages/billing",
  );
});
