import { assert, assertEquals, assertStringIncludes } from "std/assert/mod.ts";

const migrationUrl = new URL(
  "../../migrations/20260704140000_fix_public_booking_dashboard_and_email_contracts.sql",
  import.meta.url,
);

const hardenedPublicBookingUrl = new URL(
  "../../migrations/20260705213000_harden_public_booking_email_before_bell.sql",
  import.meta.url,
);

const listAdminBookingsServiceIdContractUrl = new URL(
  "../../migrations/20260706232000_fix_list_admin_bookings_service_id_contract.sql",
  import.meta.url,
);

function latestCreatePublicBookingBody(sql: string): string {
  const pattern = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_public_booking\s*\([\s\S]*?\)\s*RETURNS\s+jsonb[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$/gi;
  const bodies = Array.from(sql.matchAll(pattern), (match) => match[1]);
  const body = bodies.filter((candidate) =>
    /INSERT\s+INTO\s+public\.bookings/i.test(candidate)
  ).at(-1) ?? "";

  assert(body.length > 0, "Guard must inspect the latest writable create_public_booking body");
  return body;
}

function requiredMatch(source: string, pattern: RegExp, message: string): string {
  const match = source.match(pattern)?.[0] ?? "";
  assert(match.length > 0, message);
  return match;
}

Deno.test("public booking dashboard migration only references checked-in branch active column", async () => {
  const migration = await Deno.readTextFile(migrationUrl);
  const branchPredicate = migration.match(/FROM public\.branches br[\s\S]*?LIMIT 1;/)?.[0] ?? "";

  assert(branchPredicate.length > 0, "Guard must inspect the list_admin_bookings branch lookup");
  assertEquals(branchPredicate.includes("br.active"), false);
  assert(branchPredicate.includes("br.is_active"));
});

Deno.test("admin booking list RPC returns service_id as text to match bookings and dashboard contracts", async () => {
  const migration = await Deno.readTextFile(listAdminBookingsServiceIdContractUrl);
  const returnTable = requiredMatch(
    migration,
    /RETURNS\s+TABLE\s*\([\s\S]*?\)\s*LANGUAGE\s+plpgsql/i,
    "Guard must inspect list_admin_bookings return table",
  );
  const body = requiredMatch(
    migration,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.list_admin_bookings[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$/i,
    "Guard must inspect list_admin_bookings body",
  );

  assertStringIncludes(migration, "DROP FUNCTION IF EXISTS public.list_admin_bookings(uuid, timestamptz, timestamptz)");
  assertStringIncludes(returnTable, "service_id text");
  assertEquals(/service_id\s+uuid/i.test(returnTable), false);
  assertStringIncludes(body, "bk.service_id::text");
  assertEquals(/bk\.service_id::uuid/i.test(body), false);
  assertStringIncludes(body, "br.is_active IS TRUE");
  assertStringIncludes(migration, "REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM PUBLIC");
  assertStringIncludes(migration, "REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM anon");
  assertStringIncludes(migration, "REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM authenticated");
  assertStringIncludes(migration, "GRANT EXECUTE ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) TO authenticated");
});

Deno.test("public booking RPC requires business email outbox before non-fatal bell notification", async () => {
  const migration = await Deno.readTextFile(hardenedPublicBookingUrl);
  const body = latestCreatePublicBookingBody(migration);
  const businessEmailInsert = requiredMatch(
    body,
    /INSERT\s+INTO\s+public\.notification_email_outbox[\s\S]*?'appointment_created_business'[\s\S]*?GET\s+DIAGNOSTICS\s+v_business_email_rows\s+=\s+ROW_COUNT;/i,
    "Guard must inspect the business email outbox insert plus row-count check",
  );
  const businessEmailRequiredCheck = requiredMatch(
    body,
    /IF\s+v_business_email_rows\s+<\s+1\s+THEN[\s\S]*?BUSINESS_EMAIL_OUTBOX_REQUIRED[\s\S]*?END\s+IF;/i,
    "Guard must inspect the fail-closed business email outbox requirement",
  );
  const customerEmailBlock = requiredMatch(
    body,
    /IF\s+v_customer_email\s+IS\s+NOT\s+NULL\s+THEN[\s\S]*?'appointment_confirmation'[\s\S]*?EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]*?END\s+IF;/i,
    "Guard must inspect the non-fatal customer email block",
  );
  const bellBlock = requiredMatch(
    body,
    /BEGIN\s+INSERT\s+INTO\s+public\.dashboard_notifications[\s\S]*?EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]*?END;/i,
    "Guard must inspect the non-fatal bell notification block",
  );

  const businessEmailInsertIndex = body.indexOf(businessEmailInsert);
  const businessEmailRequiredCheckIndex = body.indexOf(businessEmailRequiredCheck);
  const customerEmailBlockIndex = body.indexOf(customerEmailBlock);
  const bellBlockIndex = body.indexOf(bellBlock);

  assert(businessEmailInsertIndex > -1, "business-owner email outbox must be enqueued");
  assert(customerEmailBlockIndex > -1, "customer confirmation email must still be attempted");
  assert(bellBlockIndex > -1, "bell notification insert must still be attempted");
  assert(
    businessEmailInsertIndex < businessEmailRequiredCheckIndex,
    "business-owner email outbox must be row-count checked before any best-effort side effect",
  );
  assert(
    businessEmailRequiredCheckIndex < customerEmailBlockIndex,
    "customer confirmation email must only run after required business email enqueue succeeds",
  );
  assert(
    customerEmailBlockIndex < bellBlockIndex,
    "customer confirmation email must be attempted before bell notification insert",
  );
  assert(
    businessEmailInsertIndex < bellBlockIndex,
    "business-owner email outbox must happen before bell notification insert",
  );
  assertStringIncludes(body, "BUSINESS_EMAIL_RECIPIENT_REQUIRED");
  assertStringIncludes(customerEmailBlock, "EXCEPTION WHEN OTHERS THEN");
  assertStringIncludes(bellBlock, "EXCEPTION WHEN OTHERS THEN");
  assertStringIncludes(body, "business_email_outbox_enqueued");
});

Deno.test("public booking RPC uses an existing active principal branch and never creates or repairs branches", async () => {
  const migration = await Deno.readTextFile(hardenedPublicBookingUrl);
  const body = latestCreatePublicBookingBody(migration);
  const branchResolution = requiredMatch(
    body,
    /IF\s+v_branch_id\s+IS\s+NULL\s+THEN[\s\S]*?ELSIF\s+NOT\s+EXISTS\s*\([\s\S]*?END\s+IF;/i,
    "Guard must inspect the complete branch-scope resolution and validation block",
  );
  const bookingInsertIndex = body.search(/INSERT\s+INTO\s+public\.bookings/i);
  const branchResolutionIndex = body.indexOf(branchResolution);

  assert(branchResolution.length > 0, "Guard must inspect missing branch-scope resolution");
  assertEquals(/INSERT\s+INTO\s+public\.branches/i.test(body), false);
  assertEquals(/UPDATE\s+public\.branches/i.test(body), false);
  assertEquals(/ON\s+CONFLICT\s*\(business_id,\s*slug\)[\s\S]*DO\s+UPDATE/i.test(body), false);
  assert(
    branchResolutionIndex > -1 && branchResolutionIndex < bookingInsertIndex,
    "branch selection/validation must complete before the booking row is inserted",
  );
  assertStringIncludes(branchResolution, "FROM public.branches br");
  assertStringIncludes(branchResolution, "br.business_id = v_business_id");
  assertStringIncludes(branchResolution, "br.slug = 'principal'");
  assertStringIncludes(branchResolution, "COALESCE(br.is_active, true) = true");
  assertStringIncludes(branchResolution, "BOOKING_BRANCH_CONFIGURATION_REQUIRED");
  assertStringIncludes(branchResolution, "BRANCH_TENANT_MISMATCH");
  assertStringIncludes(body, "INSERT INTO public.bookings");
  assertStringIncludes(body, "v_business_id, v_branch_id");
  assertStringIncludes(body, "'status', 'confirmed'");
});

Deno.test("public booking reliability documents why CI uses deterministic static contracts instead of local DB behavior", async () => {
  const repoRoot = new URL("../../../", import.meta.url);
  const rootPackageJson = await Deno.readTextFile(new URL("package.json", repoRoot));
  const packageJson = JSON.parse(rootPackageJson) as { scripts?: Record<string, string> };
  const rootScripts = packageJson.scripts ?? {};
  const rootScriptValues = Object.values(rootScripts);

  let hasSupabaseConfig = true;
  try {
    await Deno.stat(new URL("../../config.toml", import.meta.url));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      hasSupabaseConfig = false;
    } else {
      throw error;
    }
  }

  assertEquals(hasSupabaseConfig, true, "Guard must inspect checked-in Supabase local config before documenting test limits");
  assertStringIncludes(
    rootScripts["supabase:dry-run"] ?? "",
    "supabase db lint --local",
  );
  assertEquals(
    rootScriptValues.some((script) => /\bsupabase\b[\s\S]*\b(?:db\s+test|test\s+db|pg_prove|pgtap|pglite|db\s+reset|start)\b/i.test(script)),
    false,
    "Root scripts do not provide a deterministic non-secret Supabase DB behavior test runner; CI must use focused Deno static contracts for this regression",
  );
});
