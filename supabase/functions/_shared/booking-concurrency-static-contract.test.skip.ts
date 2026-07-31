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

type FunctionDefinition = {
  name: string;
  body: string;
  fullDefinition: string;
};

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function functionDefinitions(sql: string, functionName: string): FunctionDefinition[] {
  const cleanSql = stripSqlComments(sql);
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+(\\$[a-z_0-9]*\\$)([\\s\\S]*?)\\1`,
    "gi",
  );

  return Array.from(cleanSql.matchAll(pattern), (match) => ({
    name: functionName,
    body: match[2],
    fullDefinition: match[0],
  }));
}

function latestFunctionBodyMatching(
  sql: string,
  functionName: string,
  predicate: (definition: FunctionDefinition) => boolean,
): string {
  const body = functionDefinitions(sql, functionName).filter(predicate).at(-1)
    ?.body;
  assert(
    body,
    `Expected to find canonical public.${functionName} writer in migrations`,
  );
  return body;
}

function normalizeSql(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

const lockCallPattern = /(?:perform\s+public\._[a-z0-9_]*(?:lock|advisory)[a-z0-9_]*(?:booking|slot|conflict|window)[a-z0-9_]*\s*\(|perform\s+public\._[a-z0-9_]*(?:booking|slot|conflict|window)[a-z0-9_]*(?:lock|advisory)[a-z0-9_]*\s*\(|perform\s+pg_advisory_xact_lock\s*\()/i;

function assertLockHelperExists(sql: string): void {
  assert(
    /create\s+or\s+replace\s+function\s+public\._[a-z0-9_]*(?:lock|advisory)[a-z0-9_]*(?:booking|slot|conflict|window)[a-z0-9_]*\s*\(/i
      .test(sql) ||
      /create\s+or\s+replace\s+function\s+public\._[a-z0-9_]*(?:booking|slot|conflict|window)[a-z0-9_]*(?:lock|advisory)[a-z0-9_]*\s*\(/i
        .test(sql),
    "Expected a transaction-scoped booking conflict-window lock helper, e.g. public._lock_booking_conflict_window(...)",
  );
}

function assertLockBeforeConflictCheckAndMutation(
  functionName: string,
  body: string,
  mutationPattern: RegExp,
): void {
  const normalized = normalizeSql(body);
  const lockIndex = normalized.search(lockCallPattern);
  assert(
    lockIndex >= 0,
    `${functionName} must acquire a transaction-scoped booking conflict-window lock helper before checking/inserting/updating the slot`,
  );

  const conflictIndex = normalized.search(/perform\s+public\._assert_no_slot_conflict\s*\(/i);
  assert(
    conflictIndex >= 0,
    `${functionName} must still call public._assert_no_slot_conflict after acquiring the lock`,
  );
  assert(
    lockIndex < conflictIndex,
    `${functionName} must lock before public._assert_no_slot_conflict; count-before-write without a lock is racy`,
  );

  const mutationIndex = normalized.search(mutationPattern);
  assert(
    mutationIndex >= 0,
    `${functionName} contract did not find the expected booking/block mutation`,
  );
  assert(
    lockIndex < mutationIndex,
    `${functionName} must acquire the lock before mutating bookings/blocked_times`,
  );
}

function assertConfirmedTransitionIsLockedOrExplicitlyGuarded(body: string): void {
  const normalized = normalizeSql(body);
  const rejectsConfirmed = /status\s*=\s*'confirmed'\s+then\s+perform\s+public\._raise_rpc\s*\(/i
    .test(normalized) ||
    /status\s+not\s+in\s*\((?:(?!'confirmed')[^)])+\)/i.test(normalized);
  const explicitNoOpOnlyGuard = /status\s*=\s*'confirmed'[\s\S]{0,220}(?:already|existing|current)[\s\S]{0,220}confirmed/i
    .test(normalized);
  const updateIndex = normalized.search(/update\s+public\.bookings/i);
  const lockIndex = normalized.search(lockCallPattern);
  const conflictIndex = normalized.search(/perform\s+public\._assert_no_slot_conflict\s*\(/i);
  const lockedAndValidated = lockIndex >= 0 && conflictIndex >= 0 &&
    lockIndex < conflictIndex && conflictIndex < updateIndex;

  assert(
    rejectsConfirmed || explicitNoOpOnlyGuard || lockedAndValidated,
    "update_booking_status transition to confirmed must reject the transition, prove it is a no-op-only guard, or acquire the booking conflict-window lock and validate before UPDATE",
  );
}

Deno.test("booking concurrency contract: a transaction-scoped booking conflict-window lock helper exists", async () => {
  assertLockHelperExists(await readAllSqlMigrations());
});

const writerContracts = [
  {
    name: "create_public_booking",
    mutation: /insert\s+into\s+public\.bookings/i,
    predicate: (definition: FunctionDefinition) =>
      /insert\s+into\s+public\.bookings/i.test(definition.body),
  },
  {
    name: "create_admin_manual_booking",
    mutation: /insert\s+into\s+public\.bookings/i,
    predicate: (definition: FunctionDefinition) =>
      /insert\s+into\s+public\.bookings/i.test(definition.body),
  },
  {
    name: "reschedule_admin_booking",
    mutation: /update\s+public\.bookings/i,
    predicate: (definition: FunctionDefinition) =>
      /update\s+public\.bookings/i.test(definition.body),
  },
  {
    name: "reschedule_booking_by_token",
    mutation: /update\s+public\.bookings/i,
    predicate: (definition: FunctionDefinition) =>
      /update\s+public\.bookings/i.test(definition.body),
  },
  {
    name: "update_admin_booking",
    mutation: /update\s+public\.bookings/i,
    predicate: (definition: FunctionDefinition) =>
      /v_should_recalculate_slot/i.test(definition.body) &&
      /update\s+public\.bookings/i.test(definition.body),
  },
  {
    name: "create_admin_blocked_time",
    mutation: /insert\s+into\s+public\.blocked_times/i,
    predicate: (definition: FunctionDefinition) =>
      /insert\s+into\s+public\.blocked_times/i.test(definition.body),
  },
];

for (const contract of writerContracts) {
  Deno.test(`booking concurrency contract: ${contract.name} locks before conflict checks and slot mutations`, async () => {
  const migrationsSql = await readAllSqlMigrations();
    const body = latestFunctionBodyMatching(
      migrationsSql,
      contract.name,
      contract.predicate,
    );
    assertLockBeforeConflictCheckAndMutation(
      contract.name,
      body,
      contract.mutation,
    );
  });
}

Deno.test("booking concurrency contract: update_booking_status cannot confirm a booking without a lock/validation guard", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "update_booking_status",
    (definition) => /update\s+public\.bookings/i.test(definition.body),
  );

  assertConfirmedTransitionIsLockedOrExplicitlyGuarded(body);
});
