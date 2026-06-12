const migrationsDir = new URL("../../migrations/", import.meta.url);
const functionsDir = new URL("../", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
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

function definedColumnsFor(sql: string, tableName: string): Set<string> {
  const columns = new Set<string>();
  const createTable = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${tableName}\\s*\\((?<body>[\\s\\S]*?)\\);`,
    "i",
  ).exec(sql)?.groups?.body ?? "";

  for (const line of createTable.split("\n")) {
    const match = /^\s*([a-z_][a-z0-9_]*)\s+/i.exec(line);
    if (
      match &&
      !["constraint", "primary", "foreign", "unique", "check"].includes(
        match[1].toLowerCase(),
      )
    ) {
      columns.add(match[1].toLowerCase());
    }
  }

  const alterColumnPattern = new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${tableName}[\\s\\S]*?add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?([a-z_][a-z0-9_]*)`,
    "gi",
  );
  for (const match of sql.matchAll(alterColumnPattern)) {
    columns.add(match[1].toLowerCase());
  }

  return columns;
}

function latestFunctionBody(sql: string, functionName: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );

  const bodies = Array.from(sql.matchAll(pattern), (match) => match[1]);
  assert(
    bodies.length > 0,
    `Expected to find public.${functionName} in migrations`,
  );
  return bodies.at(-1)!;
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

Deno.test("P0 email outbox logging contract: process-email-outbox never logs recipient email or raw provider errors", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const consoleStatements = source.match(/console\.(?:log|error|warn)\s*\([\s\S]*?\);/g) ?? [];

  assert(
    consoleStatements.length > 0,
    "Guard must inspect process-email-outbox logging statements",
  );

  for (const statement of consoleStatements) {
    assert(
      !/to_email\b/.test(statement),
      "process-email-outbox logs must not include notification_email_outbox.to_email",
    );
    assert(
      !/,\s*(?:err|error|resultText)\b/.test(statement),
      "process-email-outbox logs must not dump raw Error/SDK/provider payloads",
    );
  }

  assert(
    !/details\s*:\s*resultText/.test(source),
    "process-email-outbox responses must not expose raw SendGrid provider error bodies",
  );
});

Deno.test("P0 billing schema contract: every business_subscriptions column referenced by functions exists in migrations", async () => {
  const migrationsSql = await readAllSqlMigrations();
  const businessSubscriptionColumns = definedColumnsFor(
    migrationsSql,
    "business_subscriptions",
  );

  const functionFiles = [
    "cancel-subscription/index.ts",
    "subscription-expiry-check/index.ts",
    "mercadopago-webhook/index.ts",
    "change-subscription/index.ts",
    "create-subscription/index.ts",
  ];
  const functionSource = (await Promise.all(
    functionFiles.map((file) => readText(new URL(file, functionsDir))),
  )).join("\n");

  const referencedCancellationColumns = ["cancelled_at", "cancel_reason"]
    .filter((column) => functionSource.includes(column));

  assert(
    referencedCancellationColumns.length > 0,
    "Guard must cover cancellation columns referenced by billing functions",
  );
  for (const column of referencedCancellationColumns) {
    assert(
      businessSubscriptionColumns.has(column),
      `business_subscriptions.${column} is referenced by Edge Functions but is not defined by checked-in migrations`,
    );
  }
});

Deno.test("P0 MercadoPago webhook contract: payment_webhook_events writes processing_state, not a non-schema status column", async () => {
  const migrationsSql = await readAllSqlMigrations();
  const paymentWebhookColumns = definedColumnsFor(
    migrationsSql,
    "payment_webhook_events",
  );
  assert(
    paymentWebhookColumns.has("processing_state"),
    "payment_webhook_events.processing_state must be in schema",
  );
  assertEquals(
    paymentWebhookColumns.has("status"),
    false,
    "payment_webhook_events.status must not be assumed by functions",
  );

  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const paymentWebhookWrites = webhookSource.match(
    /\.from\(\"payment_webhook_events\"\)[\s\S]*?(?:\.upsert|\.insert|\.update)\s*\(\s*\{[\s\S]*?\}\s*(?:,|\))/g,
  ) ?? [];

  assert(
    paymentWebhookWrites.length > 0,
    "Guard must inspect direct payment_webhook_events writes",
  );
  for (const write of paymentWebhookWrites) {
    assert(
      !/\bstatus\s*:/.test(write),
      "mercadopago-webhook must write payment_webhook_events.processing_state instead of status",
    );
    assert(
      !/processing_state\s*:\s*["']received["']/.test(write),
      "mercadopago-webhook must only write canonical payment_webhook_events processing_state values",
    );
  }
});

Deno.test("P0 admin booking contract: create_admin_manual_booking validates service_id belongs to business_id before insert", async () => {
  const body = latestFunctionBody(
    await readAllSqlMigrations(),
    "create_admin_manual_booking",
  );

  assert(
    /from\s+public\.services\s+s/i.test(body),
    "create_admin_manual_booking must query public.services before creating the booking",
  );
  assert(
    /s\.id\s*=\s*v_service_id/i.test(body) &&
      /s\.business_id\s*=\s*create_admin_manual_booking\.business_id/i.test(
        body,
      ),
    "create_admin_manual_booking must reject service_id values that do not belong to the requested business_id",
  );
});

Deno.test("P0 admin booking contract: create_admin_manual_booking validates client_id customer belongs to business_id before insert", async () => {
  const body = latestFunctionBody(
    await readAllSqlMigrations(),
    "create_admin_manual_booking",
  );

  assert(
    /from\s+public\.customers\s+c/i.test(body),
    "create_admin_manual_booking must query public.customers when client_id is supplied",
  );
  assert(
    /c\.id\s*=\s*v_customer_id/i.test(body) &&
      /c\.business_id\s*=\s*create_admin_manual_booking\.business_id/i.test(
        body,
      ),
    "create_admin_manual_booking must reject client_id values that do not belong to the requested business_id",
  );
  assert(
    /CUSTOMER_TENANT_MISMATCH/.test(body),
    "create_admin_manual_booking must raise a controlled CUSTOMER_TENANT_MISMATCH error for cross-tenant client_id values",
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

Deno.test("P0 admin blocked-time contract: create_admin_blocked_time preserves branch tenant validation", async () => {
  const body = latestFunctionBody(
    await readAllSqlMigrations(),
    "create_admin_blocked_time",
  );

  assert(
    /from\s+public\.branches\s+br/i.test(body),
    "create_admin_blocked_time must query public.branches when branch_id is supplied",
  );
  assert(
    /br\.id\s*=\s*create_admin_blocked_time\.branch_id/i.test(body),
    "create_admin_blocked_time must validate the supplied branch_id exists",
  );
  assert(
    /BRANCH_NOT_FOUND/.test(body),
    "create_admin_blocked_time must raise BRANCH_NOT_FOUND for missing branch_id values",
  );
  assert(
    /br\.business_id\s*=\s*create_admin_blocked_time\.business_id/i.test(body),
    "create_admin_blocked_time must reject branch_id values owned by another business/tenant",
  );
  assert(
    /BRANCH_TENANT_MISMATCH/.test(body),
    "create_admin_blocked_time must raise BRANCH_TENANT_MISMATCH for cross-tenant branch_id values",
  );
});

Deno.test("P0 monetization contract: multi-branch is an ARS 20,000 add-on entitlement, not bundled in base plans", async () => {
  const migrationsSql = await readAllSqlMigrations();

  assert(
    /multi[_-]?branch|multi[_-]?tenant|multi[_-]?local|multi[_-]?sucursal/i
      .test(migrationsSql),
    "Plan/catalog migrations must represent a separate multi-tenant/multi-branch add-on",
  );
  assert(
    /20000/.test(migrationsSql) && /ARS/i.test(migrationsSql),
    "The multi-tenant/multi-branch add-on must be priced as ARS 20,000",
  );
  assert(
    /(entitlement|addon|add_on|feature_flag|business_addons)/i.test(
      migrationsSql,
    ),
    "The multi-branch add-on must be represented as an entitlement/add-on separate from conventional plan rows",
  );

  const activeBasePlanRows = Array.from(
    migrationsSql.matchAll(
      /\('(?:FREE|STARTER|GROWTH|PRO)'\s*,[^\n]*?\btrue\s*,\s*(?:true|false)\s*,\s*(\d+)/gi,
    ),
    (match) => Number(match[1]),
  );

  assert(
    activeBasePlanRows.length >= 4,
    "Guard must inspect seeded base plan max_locales values",
  );
  assert(
    activeBasePlanRows.every((maxLocales) => maxLocales <= 1),
    "Base plans must not grant multiple branches; multiple branches require the ARS 20,000 add-on entitlement",
  );
});

Deno.test("Launch signup contract: pending paid signup does not require business_type before payment", async () => {
  const createSubscriptionSource = await readText(
    new URL("create-subscription/index.ts", functionsDir),
  );

  assert(
    /pending_signup_intent/i.test(createSubscriptionSource),
    "Guard must inspect the pending paid signup branch",
  );
  assert(
    !/PENDING_SIGNUP_BUSINESS_REQUIRED/.test(createSubscriptionSource),
    "create-subscription must not reject pending paid signup when business_type is deferred to onboarding",
  );
  assert(
    !/!pendingSignupEmail\s*\|\|\s*!pendingSignupBusinessType/.test(
      createSubscriptionSource,
    ),
    "Pending paid signup validation may require email, but business_type must stay optional/backwards-compatible",
  );
});

Deno.test("Launch signup contract: MP approval materializes paid account without completing onboarding", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );

  const materializeBody = /async\s+function\s+materializePendingSignup[\s\S]*?\n}\n\n\/\/ Verify payment status/.exec(
    webhookSource,
  )?.[0] ?? "";

  assert(materializeBody, "Guard must inspect materializePendingSignup");
  assert(
    !/onboarding_completed\s*:\s*true|onboardingCompleted\s*:\s*true/.test(
      materializeBody,
    ),
    "Paid materialization must not mark onboarding completed in auth metadata",
  );
  assert(
    !/current_step\s*:\s*["']dashboard_ready["']|dashboard_ready_at\s*:/.test(
      materializeBody,
    ),
    "Paid materialization must not mark business_onboarding_state as dashboard ready",
  );
  assert(
    /onboarding_required\s*:\s*true|onboarding_completed\s*:\s*false|current_step\s*:\s*["']onboarding_required["']/.test(
      materializeBody,
    ),
    "Paid materialization must persist an incomplete/onboarding-required state",
  );
});

Deno.test("Launch signup contract: onboarding completion RPC creates dashboard readiness materialization", async () => {
  const migrationsSql = await readAllSqlMigrations();
  const body = latestFunctionBody(migrationsSql, "complete_signup_onboarding");

  assert(
    /public\.businesses/i.test(body) && /public\.business_settings/i.test(body),
    "complete_signup_onboarding must create/upsert main business and business_settings",
  );
  assert(
    /business_onboarding_state/i.test(body) && /dashboard_ready_at\s*=\s*now\(\)/i.test(body),
    "complete_signup_onboarding must mark dashboard readiness only after onboarding completion",
  );
  assert(
    /auth\.users/i.test(body) && /onboarding_completed/i.test(body) && /true/i.test(body),
    "complete_signup_onboarding must persist dashboard-required onboarding metadata on the Supabase user",
  );
});
