import { assert, assertEquals, assertMatch, assertStringIncludes } from "std/assert/mod.ts";

const configUrl = new URL("../../config.toml", import.meta.url);
const functionUrl = new URL("../release-expired-booking-holds/index.ts", import.meta.url);
const purgeUrl = new URL("../purge-elapsed-bookings/index.ts", import.meta.url);
const workflowUrl = new URL(
  "../../../.github/workflows/release-expired-booking-holds.yml",
  import.meta.url,
);
const accountClosureWorkflowUrl = new URL(
  "../../../.github/workflows/account-closure.yml",
  import.meta.url,
);
const occupancyContractUrl = new URL(
  "./manual-booking-deposits-static-contract.test.ts",
  import.meta.url,
);
const emailTemplatesUrl = new URL(
  "../../../apps/shared/email-templates/appointment-templates.ts",
  import.meta.url,
);
const migrationsDir = new URL("../../migrations/", import.meta.url);

const occupancyDepositFilter =
  /COALESCE\s*\(\s*(?:bk\.)?deposit_status\s*,\s*'none'\s*\)\s*NOT\s+IN\s*\(\s*'released'\s*,\s*'abandoned'\s*,\s*'void'\s*\)/i;

Deno.test("release cron function rejects missing or bad CRON_KEY with 401 and does not call the RPC", async () => {
  const source = await Deno.readTextFile(functionUrl);
  const purgeCron = await Deno.readTextFile(purgeUrl);
  const config = await Deno.readTextFile(configUrl);

  assertStringIncludes(source, 'Deno.env.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("x-cron-key")');
  assertStringIncludes(source, "UNAUTHORIZED");
  assertMatch(source, /status:\s*401/);
  assertStringIncludes(purgeCron, 'Deno.env.get("CRON_KEY")');

  const unauthorizedIndex = source.search(/status:\s*401/);
  const rpcIndex = source.search(/rpc\(\s*"release_expired_booking_hold"/);
  assert(unauthorizedIndex >= 0, "missing/bad CRON_KEY must return 401");
  assert(rpcIndex > unauthorizedIndex, "RPC must not run before the 401 CRON_KEY gate");
  assertEquals(/rpc\([\s\S]*release_expired_booking_hold[\s\S]*status:\s*401/.test(source), false);

  assertMatch(
    source,
    /rpc\(\s*"release_expired_booking_hold"\s*,\s*\{\s*p_booking_id:\s*null\s*,\s*p_business_id:\s*null,?\s*\}/,
  );
  assertEquals(/pg_cron/.test(source), false);
  assertStringIncludes(config, "[functions.release-expired-booking-holds]");
  assertMatch(config, /\[functions\.release-expired-booking-holds\]\s*\nverify_jwt\s*=\s*false/);
  assertMatch(config, /external scheduler POSTs/i);
});

Deno.test("release cron workflow missing FUNCTION_URL / CRON_SECRET fails like account-closure", async () => {
  const workflow = await Deno.readTextFile(workflowUrl);
  const accountClosure = await Deno.readTextFile(accountClosureWorkflowUrl);

  assertStringIncludes(accountClosure, "ACCOUNT_CLOSURE_FUNCTION_URL");
  assertStringIncludes(accountClosure, "ACCOUNT_CLOSURE_CRON_SECRET");
  assertStringIncludes(accountClosure, 'if [ -z "$ACCOUNT_CLOSURE_FUNCTION_URL" ] || [ -z "$ACCOUNT_CLOSURE_CRON_SECRET" ]; then');
  assertStringIncludes(accountClosure, "exit 1");
  assertStringIncludes(accountClosure, "workflow_dispatch");

  assertStringIncludes(workflow, "RELEASE_EXPIRED_BOOKING_HOLDS_FUNCTION_URL");
  assertStringIncludes(workflow, "RELEASE_EXPIRED_BOOKING_HOLDS_CRON_SECRET");
  assertStringIncludes(
    workflow,
    'if [ -z "$RELEASE_EXPIRED_BOOKING_HOLDS_FUNCTION_URL" ] || [ -z "$RELEASE_EXPIRED_BOOKING_HOLDS_CRON_SECRET" ]; then',
  );
  assertStringIncludes(workflow, "exit 1");
  assertMatch(workflow, /cron:\s*"\*\/5 \* \* \* \*"/);
  assertStringIncludes(workflow, "workflow_dispatch");
  assertEquals(/pg_cron/.test(workflow), false);
});

Deno.test("occupancy exclude and timeout released contract stay unchanged; hold-released copy has no refund", async () => {
  const occupancyContract = await Deno.readTextFile(occupancyContractUrl);
  const templates = await Deno.readTextFile(emailTemplatesUrl);

  assertStringIncludes(
    occupancyContract,
    "must exclude deposit_status in (released, abandoned, void)",
  );
  assertStringIncludes(
    occupancyContract,
    "release_expired_booking_hold must set deposit_status to released",
  );
  assertEquals(/pg_cron/.test(occupancyContract), false);

  const names: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) names.push(entry.name);
  }
  names.sort();
  const chunks = await Promise.all(
    names.map(async (name) => await Deno.readTextFile(new URL(name, migrationsDir))),
  );
  const sql = chunks.join("\n");
  const releaseBodies = Array.from(
    sql.matchAll(
      /create\s+or\s+replace\s+function\s+public\.release_expired_booking_hold[\s\S]*?as\s+\$\$([\s\S]*?)\$\$/gi,
    ),
    (match) => match[1],
  );
  const releaseBody = releaseBodies.at(-1) ?? "";
  assert(releaseBody.length > 0, "expected release_expired_booking_hold body");
  assert(/deposit_status\s*=\s*'released'/i.test(releaseBody), "timeout must write released");
  assertEquals(/deposit_status\s*=\s*'abandoned'/i.test(releaseBody), false);
  assert(occupancyDepositFilter.test(sql), "occupancy must still exclude released/abandoned/void");

  assertEquals(/reembolso|devoluci[oó]n|\brefund\b/i.test(templates), false);
  assertStringIncludes(templates, "renderAppointmentHoldReleasedEmail");
});
