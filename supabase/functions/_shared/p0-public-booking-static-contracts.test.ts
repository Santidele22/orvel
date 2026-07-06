const migrationsDir = new URL("../../migrations/", import.meta.url);

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

Deno.test("P0 booking storage contract: public booking creation hashes bearer values and never persists plaintext management links", async () => {
  const createPublicBooking = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "create_public_booking",
    (body) => /INSERT\s+INTO\s+public\.bookings/i.test(body),
  );
  const insertStart = createPublicBooking.search(
    /INSERT\s+INTO\s+public\.bookings\s*\(/i,
  );
  const returningStart = insertStart >= 0
    ? createPublicBooking.indexOf("RETURNING", insertStart)
    : -1;
  const bookingInsert = insertStart >= 0 && returningStart > insertStart
    ? createPublicBooking.slice(insertStart, returningStart)
    : "";

  assert(
    bookingInsert.length > 0,
    "Guard must inspect create_public_booking bookings insert",
  );
  assert(
    /manage_token_hash/i.test(bookingInsert),
    "create_public_booking must persist only the management bearer hash",
  );
  assert(
    /_hash_manage_token\(/i.test(bookingInsert),
    "create_public_booking must hash generated management bearer values before storing them",
  );
  const insertColumns = bookingInsert.split(/\bVALUES\b/i)[0] ?? bookingInsert;
  assert(
    !/\bmanage_token\b(?!_hash|_expires_at|_revoked_at)/i.test(
      insertColumns,
    ),
    "create_public_booking must not insert a plaintext management bearer column",
  );
});

Deno.test("P0 booking storage migration contract: plaintext booking bearer column is nullable before clearing legacy values", async () => {
  const migration = await readText(
    new URL(
      "../../migrations/20260616130000_hash_only_booking_management_bearers.sql",
      import.meta.url,
    ),
  );
  const dropNotNullIndex = migration.search(
    /ALTER\s+TABLE\s+public\.bookings[\s\S]*?ALTER\s+COLUMN\s+manage_token\s+DROP\s+NOT\s+NULL/i,
  );
  const clearPlaintextIndex = migration.search(
    /UPDATE\s+public\.bookings\s+SET\s+manage_token\s*=\s*NULL/i,
  );

  assert(
    dropNotNullIndex >= 0,
    "Hash-only migration must drop bookings.manage_token NOT NULL before clearing legacy plaintext values",
  );
  assert(
    clearPlaintextIndex > dropNotNullIndex,
    "Hash-only migration must make bookings.manage_token nullable before setting legacy plaintext values to NULL",
  );
});

Deno.test("P0 public booking contract: create_public_booking validates branch_id belongs to resolved business", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "create_public_booking",
    (body) => /v_branch_id/i.test(body) && /public\.branches/i.test(body),
  );

  assert(
    /from\s+public\.branches\s+br/i.test(body),
    "create_public_booking must query public.branches when branch_id is supplied",
  );
  assert(
    /br\.id\s*=\s*v_branch_id/i.test(body) &&
      /br\.business_id\s*=\s*v_business_id/i.test(body),
    "create_public_booking must reject branch_id values that do not belong to the resolved business",
  );
});

Deno.test("P0 public booking contract: anon RPC never creates or repairs tenant branches", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "create_public_booking",
    (body) => /INSERT\s+INTO\s+public\.bookings/i.test(body),
  );
  const branchResolution = body.match(
    /IF\s+v_branch_id\s+IS\s+NULL\s+THEN[\s\S]*?ELSIF\s+NOT\s+EXISTS\s*\([\s\S]*?END\s+IF;/i,
  )?.[0] ?? "";
  const branchResolutionIndex = body.indexOf(branchResolution);
  const bookingInsertIndex = body.search(/INSERT\s+INTO\s+public\.bookings/i);

  assert(
    branchResolution.length > 0,
    "Guard must inspect the exact branch resolution/validation block inside create_public_booking",
  );
  assert(
    branchResolutionIndex >= 0 && branchResolutionIndex < bookingInsertIndex,
    "create_public_booking must resolve/validate an existing branch before inserting bookings",
  );

  assert(
    !/INSERT\s+INTO\s+public\.branches/i.test(body),
    "create_public_booking is granted to anon/authenticated and must not insert tenant branches at runtime",
  );
  assert(
    !/UPDATE\s+public\.branches/i.test(body),
    "create_public_booking is granted to anon/authenticated and must not reactivate or repair tenant branches at runtime",
  );
  assert(
    !/ON\s+CONFLICT\s*\(\s*business_id\s*,\s*slug\s*\)[\s\S]*?DO\s+UPDATE/i
      .test(body),
    "create_public_booking must not upsert-and-repair public.branches via ON CONFLICT DO UPDATE",
  );
  assert(
    /FROM\s+public\.branches\s+br/i.test(branchResolution) &&
      /br\.business_id\s*=\s*v_business_id/i.test(branchResolution) &&
      /br\.slug\s*=\s*'principal'/i.test(branchResolution),
    "create_public_booking must select the fallback branch from existing tenant-owned principal branches",
  );
  assert(
    /BOOKING_BRANCH_CONFIGURATION_REQUIRED|PRINCIPAL_BRANCH_REQUIRED|BRANCH_NOT_FOUND/
      .test(branchResolution),
    "create_public_booking must fail closed with a clear configuration error when no existing active tenant-owned branch can be selected",
  );
});

Deno.test("P0 public booking contract: create_public_booking uses deployed is_active branch predicate", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "create_public_booking",
    (body) =>
      /FROM\s+public\.branches\s+br/i.test(body) &&
      /INSERT\s+INTO\s+public\.bookings/i.test(body),
  );

  assert(
    !/br\.active\s+IS\s+TRUE|branches\.active/i.test(body),
    "create_public_booking must not depend on branches.active because the deployed remote schema uses branches.is_active",
  );
  assert(
    /COALESCE\(br\.is_active,\s*true\)\s*=\s*true/i.test(body),
    "create_public_booking branch selection/validation must use the deployed remote-compatible branches.is_active predicate",
  );
});

Deno.test("P0 public booking contract: create_public_booking returns DB atomic side-effect marker and branch_id", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "create_public_booking",
    (body) =>
      /jsonb_build_object/i.test(body) &&
      /INSERT\s+INTO\s+public\.bookings/i.test(body),
  );

  assert(
    /'branch_id'\s*,\s*v_branch_id/i.test(body),
    "create_public_booking response must include the selected branch_id for runtime deployment-order fail-closed checks",
  );
  assert(
    /'db_atomic_visibility_notifications'\s*,\s*true/i.test(body),
    "create_public_booking response must include a marker proving DB-owned visibility/notification side effects are active",
  );
});
