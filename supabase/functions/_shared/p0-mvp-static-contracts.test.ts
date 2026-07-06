const migrationsDir = new URL("../../migrations/", import.meta.url);
const functionsDir = new URL("../", import.meta.url);
const supabaseConfigUrl = new URL("../../config.toml", import.meta.url);
const repoRoot = new URL("../../../", import.meta.url);

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

function providerFetchIndex(source: string, fromIndex = 0): number {
  const searchSource = source.slice(fromIndex);
  const match = searchSource.search(/fetch\(\s*(?:MAILTRAP_API_URL|mailtrapApiUrl|providerApiUrl)/);
  return match >= 0 ? fromIndex + match : -1;
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

function matchingClosingBraceIndex(source: string, openingBraceIndex: number): number {
  let depth = 0;
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
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
    "process-email-outbox responses must not expose raw provider error bodies",
  );
});

Deno.test("P0 email outbox delivery contract: process-email-outbox atomically claims persisted rows before provider fetch", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const migrationsSql = await readAllSqlMigrations();
  const fetchIndex = providerFetchIndex(source);
  const sentAtSkipIndex = source.indexOf("record.sent_at");
  const claimIndex = source.indexOf("claimOutboxRecordBeforeProviderSend");
  const rpcCallIndex = source.indexOf("claim_notification_email_outbox_for_send");

  assert(fetchIndex > 0, "Guard must inspect the email provider fetch call");
  assert(
    sentAtSkipIndex > 0 && sentAtSkipIndex < fetchIndex,
    "process-email-outbox must skip records with sent_at before calling the email provider",
  );
  assert(
    claimIndex > 0 && claimIndex < fetchIndex,
    "process-email-outbox must claim the outbox row before calling the email provider when service access is available",
  );
  assert(
    rpcCallIndex > claimIndex && rpcCallIndex < fetchIndex,
    "process-email-outbox must use the atomic outbox claim RPC before the provider fetch, not a SELECT recheck",
  );
  assert(
    /processing_claim_id/i.test(migrationsSql) &&
      /processing_claimed_at/i.test(migrationsSql) &&
      /claim_notification_email_outbox_for_send/i.test(migrationsSql),
    "Migrations must define claim columns and public.claim_notification_email_outbox_for_send for atomic provider-send claims",
  );
});

Deno.test("P0 email outbox delivery contract: persisted rows are claimed before Mailtrap booking/template fetches", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const insertBranchIndex = source.indexOf('payload.type === "INSERT"');
  const claimIndex = source.indexOf("claimOutboxRecordBeforeProviderSend", insertBranchIndex);
  const bookingFetchIndex = source.indexOf('.from("bookings")', insertBranchIndex);
  const providerFetch = providerFetchIndex(source, insertBranchIndex);

  assert(insertBranchIndex > 0, "Guard must inspect the INSERT outbox event path");
  assert(claimIndex > insertBranchIndex, "Persisted outbox processing must attempt an atomic claim");
  assert(bookingFetchIndex > claimIndex, "Booking/template enrichment queries must only run after the persisted row claim succeeds");
  assert(providerFetch > claimIndex, "Mailtrap provider fetch must only run after the persisted row claim succeeds");
});

Deno.test("P0 email outbox delivery contract: missing persisted rows are not reported as already_sent", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const claimStart = source.indexOf("async function claimOutboxRecordBeforeProviderSend");
  const serveStart = source.indexOf("Deno.serve", claimStart);
  const claimBody = claimStart >= 0 && serveStart > claimStart
    ? source.slice(claimStart, serveStart)
    : "";

  assert(claimBody.length > 0, "Guard must inspect the outbox claim/recheck helper");
  assert(
    !/if\s*\(\s*!data\s*\)\s*return\s+false\s*;/.test(claimBody),
    "A missing notification_email_outbox row must be distinguishable from an already-sent row; do not collapse both to false/already_sent",
  );
  assert(
    !/unavailable\s+or\s+already\s+sent[\s\S]{0,240}skipped\s*:\s*["']already_sent["']/.test(source),
    "process-email-outbox must not label unavailable/missing outbox rows as skipped: already_sent",
  );
});

Deno.test("P0 email outbox auth contract: manual INSERT payloads require service-role/admin authorization before recipient-controlled send", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const insertBranchIndex = source.indexOf('payload.type === "INSERT"');
  const providerFetch = providerFetchIndex(source);
  const authHeaderIndex = source.search(/req\.headers\.get\(\s*["']Authorization["']\s*\)/);
  const serviceRoleKeyIndex = source.indexOf("SUPABASE_SERVICE_ROLE_KEY");

  assert(insertBranchIndex > 0, "Guard must inspect the INSERT outbox event path");
  assert(providerFetch > insertBranchIndex, "Guard must inspect provider send after INSERT handling");
  assert(
    authHeaderIndex > 0 && authHeaderIndex < insertBranchIndex,
    "process-email-outbox must read the caller Authorization header before accepting manual INSERT payloads",
  );
  assert(
    serviceRoleKeyIndex > 0 && serviceRoleKeyIndex < providerFetch,
    "process-email-outbox must have service-role/admin material available before any recipient-controlled provider send",
  );
  assert(
    /401|403/.test(source.slice(insertBranchIndex, providerFetch)),
    "Unauthorized/manual INSERT email payloads must be rejected with an auth failure before provider fetch",
  );
});

Deno.test("P0 email outbox auth contract: process-email-outbox requires explicit Supabase JWT verification", async () => {
  const config = await readText(supabaseConfigUrl);
  const functionConfig = config.match(/\[functions\.process-email-outbox\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";

  assert(
    functionConfig.length > 0,
    "supabase/config.toml must explicitly configure [functions.process-email-outbox]",
  );
  assert(
    /verify_jwt\s*=\s*true\b/.test(functionConfig),
    "process-email-outbox must explicitly enable verify_jwt=true before trusting service_role JWT claims",
  );
  assert(
    !/verify_jwt\s*=\s*false\b/.test(functionConfig),
    "process-email-outbox must not disable JWT verification",
  );
});

Deno.test("P0 email outbox auth contract: privileged invocation accepts exact service key or verified service_role JWT only", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const helperStart = source.indexOf("function hasPrivilegedEmailInvocationAuthorization");
  const helperEnd = helperStart >= 0 ? source.indexOf("// Basic HTML Template", helperStart) : -1;
  const helperBody = helperStart >= 0 && helperEnd > helperStart
    ? source.slice(helperStart, helperEnd)
    : "";
  const providerFetch = providerFetchIndex(source);

  assert(helperBody.length > 0, "Guard must inspect the process-email-outbox privileged auth helper");
  assert(providerFetch > 0, "Guard must inspect the email provider fetch call");
  assert(
    /timingSafeEqualString\(bearerToken,\s*serviceRoleKey\)/.test(helperBody),
    "Privileged auth helper must accept only a timing-safe exact Bearer SUPABASE_SERVICE_ROLE_KEY match",
  );
  assert(
    /if\s*\(\s*!serviceRoleKey\s*\)\s*return\s+false\s*;/.test(helperBody),
    "Exact service-key authorization must fail closed when SUPABASE_SERVICE_ROLE_KEY is unavailable",
  );
  assert(
    /decodeJwtPayloadClaims/.test(helperBody) && /service_role/.test(helperBody),
    "process-email-outbox may use decoded JWT role claims only as the secondary verified service_role fallback",
  );
  assert(
    /verify_jwt=true/.test(helperBody) || /verify_jwt\s*=\s*true/.test(helperBody),
    "JWT role fallback must document that it is safe only because process-email-outbox has verify_jwt=true",
  );
});

Deno.test("P0 email outbox auth contract: anon/public/publishable roles are denied before provider fetch", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const insertBranchIndex = source.indexOf('payload.type === "INSERT"');
  const providerFetch = providerFetchIndex(source);
  const preProviderAuthPath = insertBranchIndex >= 0 && providerFetch > insertBranchIndex
    ? source.slice(insertBranchIndex, providerFetch)
    : "";

  assert(insertBranchIndex > 0, "Guard must inspect the INSERT outbox event path");
  assert(providerFetch > insertBranchIndex, "Guard must inspect provider send after INSERT handling");
  assert(
    /anon|anonymous|authenticated|public|publishable/i.test(preProviderAuthPath),
    "process-email-outbox must explicitly reject anon/public/publishable/authenticated Supabase roles before provider fetch",
  );
  assert(
    /401|403/.test(preProviderAuthPath),
    "Rejected anon/public/publishable callers must receive an auth failure before provider fetch",
  );
});

Deno.test("P0 email outbox privacy contract: logs and responses never expose raw request, recipient, or provider bodies", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const consoleStatements = source.match(/console\.(?:log|error|warn)\s*\([\s\S]*?\);/g) ?? [];
  const responseBodies = source.match(/new\s+Response\s*\([\s\S]*?\)/g) ?? [];

  assert(consoleStatements.length > 0, "Guard must inspect process-email-outbox logging statements");
  for (const statement of consoleStatements) {
    const sanitizedStatement = statement.replace(/safeLogContext\([\s\S]*?\)/g, "safeLogContext()");
    assert(
      !/\b(?:payload|emailData|fullData|sgPayload|resultText|res\.text\(\)|res\.json\(\))\b/.test(sanitizedStatement),
      "process-email-outbox logs must not expose raw request, recipient-controlled payloads, provider bodies, or provider responses",
    );
    assert(
      !/\b(?:to_email|html|content|personalizations)\b/.test(statement),
      "process-email-outbox logs must not expose recipient addresses or rendered provider payload content",
    );
  }

  for (const response of responseBodies) {
    const sanitizedResponse = response.replace(/Email content missing/g, "Email missing body");
    assert(
      !/\b(?:payload|record|emailData|fullData|sgPayload|resultText|to_email|html|content|personalizations)\b/.test(sanitizedResponse),
      "process-email-outbox responses must not expose raw request, recipient, or provider payload bodies",
    );
  }
});

Deno.test("P0 email outbox delivery contract: process-email-outbox sanitizes subjects before provider payload", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const payloadIndex = source.search(/const\s+(?:mailtrapPayload|providerPayload)\s*=/);
  const sanitizerIndex = source.indexOf("sanitizeEmailSubject");
  const subjectAssignmentIndex = source.indexOf("const providerSubject = sanitizeEmailSubject");

  assert(payloadIndex > 0, "Guard must inspect provider payload creation");
  assert(sanitizerIndex > 0, "process-email-outbox must define a subject sanitizer");
  assert(
    subjectAssignmentIndex > 0 && subjectAssignmentIndex < payloadIndex,
    "process-email-outbox must sanitize the subject before building the provider payload",
  );
});

Deno.test("P0 email outbox delivery contract: empty rendered content cannot bypass provider send with unconditional success", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const insertBranchIndex = source.indexOf('payload.type === "INSERT"');
  const htmlIfIndex = source.indexOf("if (html)", insertBranchIndex);
  const htmlIfOpenBraceIndex = source.indexOf("{", htmlIfIndex);
  const htmlIfCloseBraceIndex = matchingClosingBraceIndex(source, htmlIfOpenBraceIndex);
  const insertBranchCloseBraceIndex = matchingClosingBraceIndex(
    source,
    source.indexOf("{", insertBranchIndex),
  );
  const postOptionalSendPath = htmlIfCloseBraceIndex >= 0 && insertBranchCloseBraceIndex > htmlIfCloseBraceIndex
    ? source.slice(htmlIfCloseBraceIndex + 1, insertBranchCloseBraceIndex)
    : "";

  assert(insertBranchIndex > 0, "Guard must inspect the INSERT outbox event path");
  assert(htmlIfIndex > insertBranchIndex, "Guard must inspect the optional rendered-html provider path");
  assert(htmlIfCloseBraceIndex > htmlIfOpenBraceIndex, "Guard must parse the optional rendered-html provider block");
  assert(
    !/return\s+new\s+Response\s*\(\s*JSON\.stringify\s*\(\s*\{\s*success\s*:\s*true\s*\}/.test(postOptionalSendPath),
    "process-email-outbox must not return bare success after an optional if (html) provider block; empty content must be rejected before success",
  );
});

Deno.test("P0 email outbox delivery contract: missing rendered content returns sanitized non-2xx before provider success", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const insertBranchIndex = source.indexOf('payload.type === "INSERT"');
  const htmlInitIndex = source.indexOf("let html", insertBranchIndex);
  const providerFetch = providerFetchIndex(source, insertBranchIndex);
  const preProviderPath = htmlInitIndex >= 0 && providerFetch > htmlInitIndex
    ? source.slice(htmlInitIndex, providerFetch)
    : "";

  assert(insertBranchIndex > 0, "Guard must inspect the INSERT outbox event path");
  assert(htmlInitIndex > insertBranchIndex, "Guard must inspect rendered content initialization");
  assert(providerFetch > htmlInitIndex, "Guard must inspect provider send after rendered content handling");
  assert(
    /if\s*\(\s*!\s*html\b[\s\S]{0,800}?return\s+new\s+Response\s*\(\s*JSON\.stringify\s*\(\s*\{\s*error\s*:\s*["']Email content missing["'][\s\S]{0,300}?status\s*:\s*4\d\d/.test(preProviderPath),
    "Missing/empty rendered email content must return a sanitized 4xx error before any provider success path",
  );
});

Deno.test("P0 email outbox delivery contract: validation failures clear acquired persisted claims", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const insertBranchIndex = source.indexOf('payload.type === "INSERT"');
  const htmlMissingIndex = source.indexOf("if (!html)", insertBranchIndex);
  const providerFetch = providerFetchIndex(source, insertBranchIndex);
  const missingContentPath = htmlMissingIndex >= 0 && providerFetch > htmlMissingIndex
    ? source.slice(htmlMissingIndex, providerFetch)
    : "";

  assert(insertBranchIndex > 0, "Guard must inspect the INSERT outbox event path");
  assert(htmlMissingIndex > insertBranchIndex, "Guard must inspect missing rendered content handling");
  assert(providerFetch > htmlMissingIndex, "Missing content handling must happen before provider send");
  assert(
    /clearOutboxClaimAfterProviderError\(supabase,\s*record,\s*claim\.claimId,\s*["']email_content_missing["']\)/.test(missingContentPath),
    "A claimed persisted outbox row must have its claim cleared with a sanitized processing_error when rendered content validation fails",
  );
  assert(
    /processing_error\s*:\s*processingError/.test(source) && /mailtrap_error|email_content_missing/.test(source),
    "Claim-clear updates must write only sanitized processing_error labels",
  );
});

Deno.test("P0 email outbox delivery contract: provider success requires checked outbox finalization", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const markStart = source.indexOf("async function markOutboxRecordSent");
  const serveStart = source.indexOf("Deno.serve", markStart);
  const markBody = markStart >= 0 && serveStart > markStart
    ? source.slice(markStart, serveStart)
    : "";
  const providerFetch = providerFetchIndex(source);
  const successReturnIndex = source.indexOf("JSON.stringify({ success: true", providerFetch);
  const providerSuccessPath = providerFetch >= 0 && successReturnIndex > providerFetch
    ? source.slice(providerFetch, successReturnIndex)
    : "";

  assert(markBody.length > 0, "Guard must inspect the outbox finalization helper");
  assert(providerFetch > 0, "Guard must inspect the Mailtrap provider fetch call");
  assert(successReturnIndex > providerFetch, "Guard must inspect provider success response");
  assert(
    /Promise<boolean>/.test(markBody) && /if\s*\(\s*error\s*\)/.test(markBody) && /if\s*\(\s*!\s*data\s*\)/.test(markBody),
    "markOutboxRecordSent must report finalization success only after checking update errors and matched/returned rows",
  );
  assert(
    /\.eq\(\s*["']processing_claim_id["'],\s*claimId\s*\)/.test(markBody) && /\.select\(\s*["']id["']\s*\)/.test(markBody),
    "Outbox finalization must constrain by claim id when available and select the updated row to verify a match",
  );
  assert(
    /const\s+finalized\s*=\s*await\s+markOutboxRecordSent/.test(providerSuccessPath) &&
      /if\s*\(\s*!finalized\s*\)[\s\S]{0,300}outbox_finalization_failed/.test(providerSuccessPath),
    "After Mailtrap 2xx, process-email-outbox must not return sent:true unless outbox finalization succeeds",
  );
});

Deno.test("P0 email outbox delivery contract: provider success is tied to provider ok or explicit sent indicator", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const providerFetch = providerFetchIndex(source);
  const providerOkIndex = source.indexOf("res.ok", providerFetch);
  const okElseIndex = source.indexOf("} else {", providerOkIndex);
  const okElseOpenBraceIndex = source.indexOf("{", okElseIndex);
  const okElseCloseBraceIndex = matchingClosingBraceIndex(source, okElseOpenBraceIndex);
  const successReturnIndex = source.indexOf("JSON.stringify({ success: true", providerFetch);
  const successResponse = successReturnIndex >= 0
    ? source.slice(successReturnIndex, source.indexOf(")", successReturnIndex) + 1)
    : "";
  const successIsInsideProviderOkPath = okElseOpenBraceIndex >= 0 &&
    okElseCloseBraceIndex > okElseOpenBraceIndex &&
    successReturnIndex > okElseOpenBraceIndex &&
    successReturnIndex < okElseCloseBraceIndex;
  const successHasExplicitSentIndicator = /sent\s*:\s*true|provider[_-]?attempt|providerAttempt/.test(successResponse);

  assert(providerFetch > 0, "Guard must inspect the email provider fetch call");
  assert(providerOkIndex > providerFetch, "Guard must inspect the provider res.ok branch");
  assert(successReturnIndex > providerFetch, "Guard must inspect the provider success response");
  assert(
    successIsInsideProviderOkPath || successHasExplicitSentIndicator,
    "Provider success must either be returned inside the provider res.ok send path or explicitly include sent/provider-attempt state",
  );
});

Deno.test("P0 Mailtrap migration contract: process-email-outbox has no SendGrid provider dependency", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));

  assert(
    !/SENDGRID|SendGrid|sendgrid|api\.sendgrid\.com/i.test(source),
    "process-email-outbox must remove SendGrid env names, response labels, payload constants, and endpoints after Mailtrap migration",
  );
});

Deno.test("P0 Mailtrap migration contract: process-email-outbox uses Mailtrap env, endpoint, and payload shape", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const providerFetchIndex = source.search(/fetch\(\s*(?:MAILTRAP_API_URL|mailtrapApiUrl)/);
  const providerPayloadIndex = source.search(/(?:mailtrapPayload|providerPayload)\s*=\s*\{/);

  assert(
    /MAILTRAP_(?:API_KEY|API_TOKEN)/.test(source),
    "process-email-outbox must read the Mailtrap API key/token env name, not the legacy SendGrid key",
  );
  assert(
    /MAILTRAP_FROM_EMAIL/.test(source),
    "process-email-outbox must read MAILTRAP_FROM_EMAIL for the sender address",
  );
  assert(
    /https:\/\/(?:send\.)?api\.mailtrap\.io\/api\/send/.test(source),
    "process-email-outbox must target the Mailtrap direct API send endpoint",
  );
  assert(
    providerPayloadIndex > 0,
    "process-email-outbox must build an explicit Mailtrap provider payload",
  );
  const payloadBody = source.slice(providerPayloadIndex, source.indexOf("};", providerPayloadIndex) + 2);
  assert(
    /from\s*:\s*\{[\s\S]*?email/.test(payloadBody) &&
      /to\s*:\s*\[[\s\S]*?email/.test(payloadBody) &&
      /subject\s*:/.test(payloadBody) &&
      /html\s*:/.test(payloadBody),
    "Mailtrap provider payload must include from.email, to[].email, sanitized subject, and html body fields",
  );
  assert(
    providerFetchIndex > providerPayloadIndex,
    "process-email-outbox must send the Mailtrap payload through the Mailtrap provider fetch",
  );
});

Deno.test("P0 Mailtrap migration contract: provider success only follows Mailtrap 2xx and responses/logs stay sanitized", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const providerFetchIndex = source.search(/fetch\(\s*(?:MAILTRAP_API_URL|mailtrapApiUrl)/);
  const providerOkIndex = source.search(/(?:res|response)\.ok|status\s*>=\s*200[\s\S]{0,120}status\s*<\s*300/);
  const successReturnIndex = source.indexOf("JSON.stringify({ success: true", providerFetchIndex);
  const consoleStatements = source.match(/console\.(?:log|error|warn)\s*\([\s\S]*?\);/g) ?? [];

  assert(providerFetchIndex > 0, "Guard must inspect the Mailtrap provider fetch call");
  assert(
    providerOkIndex > providerFetchIndex && successReturnIndex > providerOkIndex,
    "process-email-outbox must return success only after a Mailtrap 2xx/ok provider response",
  );
  assert(
    /Mailtrap Error|mailtrap_error|provider_error/.test(source),
    "Provider failure responses should use a sanitized Mailtrap/provider error label, never legacy SendGrid wording",
  );
  for (const statement of consoleStatements) {
    const sanitizedStatement = statement.replace(/safeLogContext\([\s\S]*?\)/g, "safeLogContext()");
    assert(
      !/\b(?:to_email|html|content|mailtrapPayload|providerPayload|resultText|res\.text\(\)|res\.json\(\))\b/.test(sanitizedStatement),
      "Mailtrap provider logs must not expose recipient addresses, rendered content, provider payloads, or raw provider bodies",
    );
  }
});

Deno.test("P0 booking management link contract: process-email-outbox does not select or render plaintext booking bearer values", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const dashboardGatewaySource = await readText(new URL("apps/dashboard/src/app/core/api/supabase-booking/real-gateway.ts", repoRoot));
  const bookingQuery = source.match(
    /\.from\("bookings"\)[\s\S]*?\.single\(\)/,
  )?.[0] ?? "";

  assert(
    bookingQuery.length > 0,
    "Guard must inspect process-email-outbox booking enrichment query",
  );
  assert(
    !/\.select\(\s*["']\*/.test(bookingQuery),
    "process-email-outbox must select an explicit safe booking projection, never bookings.*",
  );
  assert(
    !/manage_token\b/.test(bookingQuery),
    "process-email-outbox must not select plaintext booking management bearer values from the database",
  );
  assert(
    !/booking\.manage_token\b/.test(source),
    "process-email-outbox must not build public management links from persisted plaintext booking values",
  );
  assert(
    /\/booking\/manage\?token=/.test(dashboardGatewaySource),
    "Public booking notification payload must point to the routed per-booking management page",
  );
  assert(
    !/\/turnos\/gestionar\?token=/.test(dashboardGatewaySource),
    "Public booking notification payload must not point to the legacy unrouted manage path",
  );
});

Deno.test("P0 booking management link contract: process-email-outbox normalizes fallback appointment links before rendering", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const bookingFallbackIndex = source.indexOf("// Fallback if booking query failed");
  const noBookingFallbackIndex = source.indexOf("// No booking_id, ensure minimal structure for template");
  const renderIndex = source.indexOf("// 3. Render Template based on key");
  const bookingFallbackPath = bookingFallbackIndex >= 0 && noBookingFallbackIndex > bookingFallbackIndex
    ? source.slice(bookingFallbackIndex, noBookingFallbackIndex)
    : "";
  const noBookingFallbackPath = noBookingFallbackIndex >= 0 && renderIndex > noBookingFallbackIndex
    ? source.slice(noBookingFallbackIndex, renderIndex)
    : "";
  const normalizeHelper = source.slice(
    source.indexOf("function normalizeAppointmentLinks"),
    source.indexOf("function relationOne"),
  );

  assert(bookingFallbackPath.length > 0, "Guard must inspect the booking-query-failed fallback path");
  assert(noBookingFallbackPath.length > 0, "Guard must inspect the no-booking-id fallback path");
  assert(
    /fullData\.links\s*=\s*normalizeAppointmentLinks\(fullData\.links,\s*dashboardUrl\)/.test(bookingFallbackPath),
    "Booking enrichment failure fallback must normalize relative appointment links before template rendering",
  );
  assert(
    /fullData\.links\s*=\s*normalizeAppointmentLinks\(fullData\.links,\s*dashboardUrl\)/.test(noBookingFallbackPath),
    "No-booking-id fallback must normalize relative appointment links before template rendering",
  );
  assert(
    !/view:\s*["']#["']|cancel:\s*["']#["']|reschedule:\s*["']#["']/.test(source),
    "process-email-outbox must not inject inert appointment href placeholders; templates omit unavailable links",
  );
  assert(
    normalizeHelper.length > 0 && !/return\s+["']#["']/.test(normalizeHelper),
    "normalizeAppointmentLinks must not convert unavailable appointment links into inert # URLs",
  );
});

Deno.test("P0 customer appointment confirmation email is minimal and links to the exact booking manager", async () => {
  const templateSource = await readText(new URL("_shared/templates/appointment-templates.ts", functionsDir));
  const migrationsSource = await readAllSqlMigrations();
  const confirmationSection = templateSource.slice(
    templateSource.indexOf("export function renderAppointmentConfirmationEmail"),
    templateSource.indexOf("export function renderAppointmentBusinessNotificationEmail"),
  );

  assert(confirmationSection.length > 0, "Guard must inspect the appointment confirmation renderer");
  assert(confirmationSection.includes("subject: 'Turno confirmado'"), "Customer confirmation email subject must be Turno confirmado");
  assert(confirmationSection.includes("Turno confirmado"), "Customer confirmation email must show Turno confirmado");
  assert(confirmationSection.includes("gracias por confiar en nosotros"), "Customer confirmation email must thank the customer for trusting Orvel/us");
  assert(confirmationSection.includes("Ver y gestionar turno"), "Customer confirmation email must include a single management link CTA");
  assert(!/Negocio:|Dirección:|Servicio:|Fecha:|Horario:|Duración:|Precio:/.test(confirmationSection), "Customer confirmation email must not render appointment detail list");
  assert(!/cancelar|reprogramar/i.test(confirmationSection), "Customer confirmation email should contain one management link, not separate cancel/reschedule links");
  assert(!/href=\"#\"|return '#'/i.test(confirmationSection), "Customer confirmation email must not render inert links");
  assert(
    /'appointment_confirmation'[\s\S]*\/booking\/manage\?token=/.test(migrationsSource),
    "Customer confirmation payload must receive the tokenized management link",
  );
});

Deno.test("P0 business appointment notification never receives or renders customer management bearer links", async () => {
  const templateSource = await readText(new URL("_shared/templates/appointment-templates.ts", functionsDir));
  const migrationsSource = await readAllSqlMigrations();
  const businessOutboxInsert = migrationsSource.match(
    /'appointment_created_business'[\s\S]*?jsonb_build_object\([\s\S]*?\)\s*\n\s*WHERE NOT EXISTS/,
  )?.[0] ?? "";

  assert(businessOutboxInsert.length > 0, "Guard must inspect business appointment notification outbox insert");
  assert(
    !/\/booking\/manage\?token=|cancel|reschedule|v_management_bearer/.test(businessOutboxInsert),
    "Business appointment notification payload must not include public management links or bearer tokens",
  );
  assert(
    /const\s+canRenderSelfServiceLinks\s*=\s*kind\s*!==\s*['"]business_notification['"]/.test(templateSource),
    "Business appointment template must suppress self-service action links even if links are present",
  );
});

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
    !/ON\s+CONFLICT\s*\(\s*business_id\s*,\s*slug\s*\)[\s\S]*?DO\s+UPDATE/i.test(body),
    "create_public_booking must not upsert-and-repair public.branches via ON CONFLICT DO UPDATE",
  );
  assert(
    /FROM\s+public\.branches\s+br/i.test(branchResolution) &&
      /br\.business_id\s*=\s*v_business_id/i.test(branchResolution) &&
      /br\.slug\s*=\s*'principal'/i.test(branchResolution),
    "create_public_booking must select the fallback branch from existing tenant-owned principal branches",
  );
  assert(
    /BOOKING_BRANCH_CONFIGURATION_REQUIRED|PRINCIPAL_BRANCH_REQUIRED|BRANCH_NOT_FOUND/.test(branchResolution),
    "create_public_booking must fail closed with a clear configuration error when no existing active tenant-owned branch can be selected",
  );
});

Deno.test("P0 public booking contract: create_public_booking uses deployed is_active branch predicate", async () => {
  const body = latestFunctionBodyMatching(
    await readAllSqlMigrations(),
    "create_public_booking",
    (body) => /FROM\s+public\.branches\s+br/i.test(body) &&
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
    (body) => /jsonb_build_object/i.test(body) && /INSERT\s+INTO\s+public\.bookings/i.test(body),
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

Deno.test("Launch welcome email contract: free signup enqueues a business welcome email after email confirmation provisioning", async () => {
  const createAccountBusinessSource = await readText(
    new URL("../../../apps/landing/src/pages/api/signup/create-account-business.ts", import.meta.url),
  );
  const confirmEmailSource = await readText(
    new URL("../../../apps/landing/src/pages/api/signup/confirm-email.ts", import.meta.url),
  );
  const firstProvisioningIndex = confirmEmailSource.search(/\.from\(["']businesses["']\)[\s\S]*?\.(?:insert|upsert)\s*\(/);
  const outboxInsertIndex = confirmEmailSource.search(/\.from\(["']notification_email_outbox["']\)[\s\S]*?\.insert\s*\(/);
  const successResponseIndex = confirmEmailSource.lastIndexOf("ok: true");

  assert(
    /signup_email_confirmation|signup_email_confirmations|consume_signup_email_confirmation/i.test(createAccountBusinessSource),
    "Free signup request must create a confirmation intent instead of provisioning immediately",
  );

  assert(
    firstProvisioningIndex > 0,
    "Guard must inspect the free signup provisioning path",
  );
  assert(
    outboxInsertIndex > firstProvisioningIndex,
    "Free signup must enqueue notification_email_outbox only after account/business provisioning succeeds",
  );
  assert(
    outboxInsertIndex < successResponseIndex,
    "Free signup success response must not be returned before the welcome email outbox enqueue is attempted",
  );
  assert(
    /template_key\s*:\s*["'](?:business_welcome|welcome_email)["']/.test(
      confirmEmailSource.slice(outboxInsertIndex, successResponseIndex),
    ),
    "Free signup welcome enqueue must use the canonical business_welcome/welcome_email template key",
  );
});

Deno.test("Launch welcome email contract: paid MP approval enqueues a business welcome email after materialization", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const materializeBody = /async\s+function\s+materializePendingSignup[\s\S]*?\n}\n\n\/\/ Verify payment status/.exec(
    webhookSource,
  )?.[0] ?? "";
  const helperBody = /async\s+function\s+ensurePaidSignupWelcomeBootstrap[\s\S]*?\n}\n/.exec(
    webhookSource,
  )?.[0] ?? "";
  const subscriptionInsertIndex = materializeBody.search(/\.from\(["']business_subscriptions["']\)[\s\S]*?\.insert\s*\(/);
  const ensureCallIndex = materializeBody.search(/ensurePaidSignupWelcomeBootstrap\s*\(/);
  const outboxEnsureIndex = helperBody.search(/\.insert\s*\(\s*\{|ensure_business_welcome_outbox/);
  const returnIndex = materializeBody.lastIndexOf("return subscription");

  assert(materializeBody, "Guard must inspect materializePendingSignup");
  assert(helperBody, "Guard must inspect ensurePaidSignupWelcomeBootstrap");
  assert(
    subscriptionInsertIndex > 0,
    "Guard must inspect paid subscription materialization before welcome enqueue",
  );
  assert(
    ensureCallIndex > subscriptionInsertIndex && outboxEnsureIndex > 0,
    "Paid signup must ensure notification_email_outbox only after approved payment materializes account/business/subscription",
  );
  assert(
    ensureCallIndex < returnIndex,
    "Paid materialization must not return success before the welcome email outbox enqueue is attempted",
  );
  assert(
    /template_key\s*:\s*["'](?:business_welcome|welcome_email)["']|ensure_business_welcome_outbox/.test(
      helperBody.slice(outboxEnsureIndex),
    ),
    "Paid signup welcome enqueue must use the canonical business_welcome/welcome_email template key, not only a payment or magic-link notification",
  );
});

Deno.test("Launch first-login bootstrap contract: paid MP approval generates Supabase action link before business welcome outbox", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const materializeBody = /async\s+function\s+materializePendingSignup[\s\S]*?\n}\n\n\/\/ Verify payment status/.exec(
    webhookSource,
  )?.[0] ?? "";
  const helperBody = /async\s+function\s+ensurePaidSignupWelcomeBootstrap[\s\S]*?\n}\n/.exec(
    webhookSource,
  )?.[0] ?? "";
  const createUserIndex = materializeBody.search(/auth[\s\S]*?\.admin\.createUser\s*\(/);
  const ensureCallIndex = materializeBody.search(/ensurePaidSignupWelcomeBootstrap\s*\(/);
  const generateLinkIndex = helperBody.search(/auth[\s\S]*?\.admin\.generateLink\s*\(|generate(?:Recovery|Action|FirstLogin|SetPassword)Link\s*\(/);
  const outboxEnsureIndex = helperBody.search(/\.insert\s*\(\s*\{|ensure_business_welcome_outbox/);

  assert(materializeBody, "Guard must inspect materializePendingSignup");
  assert(helperBody, "Guard must inspect ensurePaidSignupWelcomeBootstrap");
  assert(createUserIndex > 0, "Guard must inspect the paid signup Supabase admin createUser call");
  assert(
    ensureCallIndex > createUserIndex && generateLinkIndex > 0,
    "Paid signup materialization must generate a Supabase admin action/recovery link after createUser for first login/password setup",
  );
  assert(
    outboxEnsureIndex > generateLinkIndex,
    "business_welcome outbox must be inserted or atomically ensured only after the first-login/set-password action link has been generated",
  );
});

Deno.test("Launch first-login bootstrap contract: paid business_welcome payload carries only action-link credentials", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const materializeBody = /async\s+function\s+materializePendingSignup[\s\S]*?\n}\n\n\/\/ Verify payment status/.exec(
    webhookSource,
  )?.[0] ?? "";
  const helperBody = /async\s+function\s+ensurePaidSignupWelcomeBootstrap[\s\S]*?\n}\n/.exec(
    webhookSource,
  )?.[0] ?? "";
  const outboxEnsureIndex = helperBody.search(/\.insert\s*\(\s*\{|ensure_business_welcome_outbox/);
  const welcomeOutboxSlice = outboxEnsureIndex >= 0
    ? helperBody.slice(outboxEnsureIndex)
    : "";

  assert(welcomeOutboxSlice.length > 0, "Guard must inspect paid business_welcome outbox insert/ensure payload");
  assert(
    /template_key\s*:\s*["']business_welcome["']|ensure_business_welcome_outbox/.test(welcomeOutboxSlice),
    "Paid first-login bootstrap must use the business_welcome outbox template",
  );
  assert(
    /(?:first_login_url|set_password_url)\s*:/.test(welcomeOutboxSlice),
    "Paid business_welcome payload must include first_login_url or set_password_url for the CTA",
  );
  assert(
    !/\b(?:password|plain_password|plaintext_password|temporary_password|temp_password|generated_password|credential|credentials)\s*:/.test(welcomeOutboxSlice),
    "Paid business_welcome payload must not include plaintext password or credential-like fields",
  );
});

Deno.test("Launch first-login bootstrap contract: business welcome template renders CTA from action link", async () => {
  const templateSource = await readText(
    new URL("_shared/templates/business-templates.ts", functionsDir),
  );

  assert(
    /firstLoginUrl\??\s*:|setPasswordUrl\??\s*:|first_login_url\??\s*:|set_password_url\??\s*:/.test(templateSource),
    "BusinessWelcomeEmailData must accept an optional first-login/set-password URL",
  );
  assert(
    /firstLoginUrl|setPasswordUrl|first_login_url|set_password_url/.test(templateSource) &&
      /(?:Configur|Crear|Definir|Establecer|Ingresar|Primer ingreso|contraseña|password|set password|first login)/i.test(templateSource),
    "Business welcome template must render a first-login/set-password CTA when the action URL is present",
  );
});

Deno.test("Launch first-login bootstrap privacy guard: generated action links are not logged or returned to browsers", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const consoleStatements = webhookSource.match(/console\.(?:log|error|warn)\s*\([\s\S]*?\);/g) ?? [];
  const responseBodies = webhookSource.match(/new\s+Response\s*\([\s\S]*?\)/g) ?? [];
  const sensitiveActionLinkPattern = /(?:first_login_url|set_password_url|action_link|actionLink|recoveryLink|properties\s*\.\s*action_link|generateLink)/;

  for (const statement of consoleStatements) {
    assert(
      !sensitiveActionLinkPattern.test(statement),
      "mercadopago-webhook logs must not expose generated first-login/set-password action links",
    );
  }

  for (const response of responseBodies) {
    assert(
      !sensitiveActionLinkPattern.test(response),
      "mercadopago-webhook browser/API responses must not expose generated first-login/set-password action links",
    );
  }
});

Deno.test("Launch first-login retry contract: existing-subscription approved webhooks ensure welcome bootstrap before processed", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const subscriptionFoundIndex = webhookSource.search(/if\s*\(\s*subscription\s*\)\s*\{/);
  const transitionIndex = webhookSource.indexOf("apply_subscription_event_transition", subscriptionFoundIndex);
  const processedIndex = webhookSource.indexOf("p_state: \"processed\"", transitionIndex);
  const existingSubscriptionPath = subscriptionFoundIndex >= 0 && processedIndex > subscriptionFoundIndex
    ? webhookSource.slice(subscriptionFoundIndex, processedIndex)
    : "";

  assert(existingSubscriptionPath.length > 0, "Guard must inspect the existing-subscription approved webhook path");
  assert(
    /ensurePaidSignupWelcomeBootstrap\s*\(/.test(existingSubscriptionPath),
    "Approved webhooks that find an existing subscription tied to a pending paid signup must ensure the paid welcome bootstrap before marking the webhook processed",
  );
});

Deno.test("Launch first-login retry contract: pending paid signup becomes materialized only after welcome bootstrap succeeds", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const materializeBody = /async\s+function\s+materializePendingSignup[\s\S]*?\n}\n\n\/\/ Verify payment status/.exec(
    webhookSource,
  )?.[0] ?? "";
  const statusMaterializedIndex = materializeBody.search(/status\s*:\s*["']materialized["']/);
  const welcomeBootstrapSuccessIndex = materializeBody.search(
    /ensurePaidSignupWelcomeBootstrap\s*\([\s\S]*?\)|\.from\(["']notification_email_outbox["']\)[\s\S]*?\.insert\s*\([\s\S]*?\)\s*;[\s\S]*?if\s*\(\s*welcomeEmailError\s*\)/,
  );

  assert(materializeBody, "Guard must inspect materializePendingSignup");
  assert(statusMaterializedIndex > 0, "Guard must inspect pending_signup_intents.status = materialized");
  assert(welcomeBootstrapSuccessIndex > 0, "Guard must inspect welcome bootstrap outbox insert/ensure success before materialization");
  assert(
    statusMaterializedIndex > welcomeBootstrapSuccessIndex,
    "pending_signup_intents.status must be set to materialized only after business_welcome outbox insert/ensure succeeds, so failed welcome bootstrap remains retryable",
  );
});

Deno.test("Launch first-login retry contract: processed webhook state follows verified welcome outbox existence", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const approvedPathStart = webhookSource.indexOf("const webhookPaymentApproved");
  const processedIndex = webhookSource.indexOf("p_state: \"processed\"", approvedPathStart);
  const approvedBeforeProcessed = approvedPathStart >= 0 && processedIndex > approvedPathStart
    ? webhookSource.slice(approvedPathStart, processedIndex)
    : "";

  assert(approvedBeforeProcessed.length > 0, "Guard must inspect approved webhook side effects before processed state");
  assert(
    /ensurePaidSignupWelcomeBootstrap\s*\([\s\S]*?\)/.test(approvedBeforeProcessed) &&
      /business_welcome/.test(approvedBeforeProcessed) &&
      /notification_email_outbox/.test(approvedBeforeProcessed),
    "Webhook processed state must happen only after verified business_welcome outbox existence or successful ensure, preventing false success without the bootstrap email",
  );
});

Deno.test("Launch first-login idempotency contract: welcome bootstrap checks existing business_welcome before insert", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const helperMatch = /async\s+function\s+ensurePaidSignupWelcomeBootstrap[\s\S]*?\n}\n/.exec(webhookSource);
  const helperBody = helperMatch?.[0] ?? "";
  const existingRowCheckIndex = helperBody.search(
    /\.from\(["']notification_email_outbox["']\)[\s\S]*?\.eq\(["']template_key["'],\s*["']business_welcome["']\)[\s\S]*?\.maybeSingle\s*\(\s*\)/,
  );
  const insertIndex = helperBody.search(/\.insert\s*\(\s*\{|ensure_business_welcome_outbox/);

  assert(helperBody.length > 0, "Guard must inspect ensurePaidSignupWelcomeBootstrap");
  assert(existingRowCheckIndex >= 0, "ensurePaidSignupWelcomeBootstrap must check for an existing business_welcome outbox row");
  assert(insertIndex > existingRowCheckIndex, "A duplicate/retry must not insert or atomically ensure another business_welcome row after an existing row already satisfies the bootstrap");
});

Deno.test("Launch first-login concurrency contract: business_welcome bootstrap dedupe is DB-backed and atomic", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const migrationsSql = await readAllSqlMigrations();
  const helperMatch = /async\s+function\s+ensurePaidSignupWelcomeBootstrap[\s\S]*?\n}\n/.exec(webhookSource);
  const helperBody = helperMatch?.[0] ?? "";

  assert(helperBody.length > 0, "Guard must inspect ensurePaidSignupWelcomeBootstrap");

  const uniqueBusinessWelcomeIndex = /create\s+unique\s+index[\s\S]{0,500}on\s+public\.notification_email_outbox\s*\([\s\S]{0,160}\bbusiness_id\b[\s\S]{0,160}\btemplate_key\b[\s\S]{0,160}\)[\s\S]{0,260}where[\s\S]{0,160}\btemplate_key\b\s*=\s*['"]business_welcome['"]/i.test(
    migrationsSql,
  );
  const uniqueBusinessTemplateConstraint = /alter\s+table\s+(?:if\s+exists\s+)?public\.notification_email_outbox[\s\S]{0,400}add\s+constraint[\s\S]{0,240}unique\s*\(\s*business_id\s*,\s*template_key\s*\)/i.test(
    migrationsSql,
  );
  const helperHandlesDbConflict = /\.(?:upsert)\s*\(|onConflict\s*:|ignoreDuplicates\s*:|\b23505\b|duplicate key/i.test(
    helperBody,
  );
  const uniqueIndexWithConflictHandling = (uniqueBusinessWelcomeIndex || uniqueBusinessTemplateConstraint) &&
    helperHandlesDbConflict;

  const rpcNames = Array.from(
    helperBody.matchAll(/\.rpc\s*\(\s*['"]([a-z0-9_]*welcome[a-z0-9_]*)['"]/gi),
    (match) => match[1],
  );
  const atomicWelcomeRpcUsed = rpcNames.some((rpcName) => {
    const rpcDefinition = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${rpcName}\\s*\\([\\s\\S]*?notification_email_outbox[\\s\\S]*?business_welcome[\\s\\S]*?(?:security\\s+definer|pg_advisory_xact_lock|for\\s+update|on\\s+conflict|insert[\\s\\S]{0,300}where\\s+not\\s+exists)`,
      "i",
    );
    return rpcDefinition.test(migrationsSql);
  });

  const helperUsesDirectCheckThenPlainInsert = /\.maybeSingle\s*\(\s*\)[\s\S]*?\.insert\s*\(\s*\{/.test(helperBody) &&
    !helperHandlesDbConflict &&
    rpcNames.length === 0;

  assert(
    uniqueIndexWithConflictHandling || atomicWelcomeRpcUsed,
    "Concurrent paid webhook retries must dedupe business_welcome with a DB-backed atomic mechanism: e.g. a unique business_welcome outbox index/constraint plus conflict handling/upsert, or a webhook-used atomic SECURITY DEFINER RPC/server-side lock/check/insert. A pre-insert maybeSingle check followed by a plain insert is not sufficient because two retries can both observe no row and insert duplicates.",
  );
  assert(
    !helperUsesDirectCheckThenPlainInsert,
    "ensurePaidSignupWelcomeBootstrap must not rely only on check-then-insert for business_welcome dedupe; the dedupe must be enforced atomically in the database.",
  );
});

Deno.test("Launch first-login retry contract: generateLink failure after partial materialization is recoverable", async () => {
  const webhookSource = await readText(
    new URL("mercadopago-webhook/index.ts", functionsDir),
  );
  const helperMatch = /async\s+function\s+ensurePaidSignupWelcomeBootstrap[\s\S]*?\n}\n/.exec(webhookSource);
  const helperBody = helperMatch?.[0] ?? "";
  const existingCheckIndex = helperBody.search(/business_welcome[\s\S]*?\.maybeSingle\s*\(\s*\)/);
  const generateLinkIndex = helperBody.search(/generateSetPasswordLink\s*\(|auth[\s\S]*?\.admin\.generateLink\s*\(/);
  const insertIndex = helperBody.search(/\.insert\s*\(\s*\{|ensure_business_welcome_outbox/);
  const existingSubscriptionPathStart = webhookSource.search(/if\s*\(\s*subscription\s*\)\s*\{/);
  const processedIndex = webhookSource.indexOf("p_state: \"processed\"", existingSubscriptionPathStart);
  const existingSubscriptionPath = existingSubscriptionPathStart >= 0 && processedIndex > existingSubscriptionPathStart
    ? webhookSource.slice(existingSubscriptionPathStart, processedIndex)
    : "";

  assert(helperBody.length > 0, "Guard must inspect the recovery bootstrap helper");
  assert(existingCheckIndex >= 0, "Recovery bootstrap must first treat an existing business_welcome outbox row as already satisfied");
  assert(
    generateLinkIndex > existingCheckIndex && insertIndex > generateLinkIndex,
    "Recovery bootstrap must generate the action link only when inserting or atomically ensuring a missing business_welcome row, so generateLink failures remain retryable without duplicating successful rows",
  );
  assert(
    /ensurePaidSignupWelcomeBootstrap\s*\(/.test(existingSubscriptionPath),
    "Existing-subscription retries must invoke recovery bootstrap so partial materialization after generateLink failure can be retried before webhook processed state",
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
