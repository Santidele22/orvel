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
