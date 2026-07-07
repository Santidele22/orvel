import { assert, assertStringIncludes } from "std/assert/mod.ts";

const migrationPath = new URL(
  "../../migrations/20260707180000_pre_mvp_business_identity_settings_cleanup.sql",
  import.meta.url,
);

const migrationsDir = new URL("../../migrations/", import.meta.url);

const dashboardSettingsPath = new URL(
  "../../../apps/dashboard/src/app/features/settings/data-access/business-settings.facade.ts",
  import.meta.url,
);

const confirmEmailPath = new URL(
  "../../../apps/landing/src/pages/api/signup/confirm-email.ts",
  import.meta.url,
);

const dashboardOnboardingPath = new URL(
  "../../../apps/dashboard/src/app/features/onboarding/pages/signup-business-types-step.page.ts",
  import.meta.url,
);

function latestFunctionDefinition(sql: string, functionName: string): string {
  return functionDefinitions(sql, functionName).at(-1) ?? "";
}

function functionDefinitions(sql: string, functionName: string): string[] {
  const pattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "gi",
  );
  return Array.from(sql.matchAll(pattern), (match) => match[0]);
}

async function readAllMigrations(): Promise<string> {
  const sql: string[] = [];
  const entries: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) {
      entries.push(entry.name);
    }
  }

  entries.sort();
  for (const entry of entries) {
    sql.push(await Deno.readTextFile(new URL(entry, migrationsDir)));
  }

  return sql.join("\n");
}

Deno.test("business schema cleanup guards identity drift and migrates capacity before dropping duplicated columns", async () => {
  const migration = await Deno.readTextFile(migrationPath);

  assertStringIncludes(migration, "business_settings.slug drift detected");
  assertStringIncludes(migration, "business_settings.business_name drift detected");
  assertStringIncludes(migration, "business_settings.timezone drift detected");
  assert(!/UPDATE\s+public\.businesses\s+b[\s\S]*?SET\s+slug\s*=\s*bs\.slug/i.test(migration));
  assert(!/UPDATE\s+public\.businesses\s+b[\s\S]*?SET\s+name\s*=\s*bs\.business_name/i.test(migration));
  assert(!/UPDATE\s+public\.businesses\s+b[\s\S]*?SET\s+timezone\s*=\s*bs\.timezone/i.test(migration));
  assertStringIncludes(migration, "UPDATE public.business_settings bs");
  assertStringIncludes(migration, "COALESCE(b.capacity, bs.capacity, 1)");
  assertStringIncludes(migration, "DROP COLUMN IF EXISTS slug");
  assertStringIncludes(migration, "DROP COLUMN IF EXISTS business_name");
  assertStringIncludes(migration, "DROP COLUMN IF EXISTS timezone");
  assertStringIncludes(migration, "DROP COLUMN IF EXISTS capacity");
});

Deno.test("booking capacity reads business_settings after businesses.capacity is dropped", async () => {
  const migration = await Deno.readTextFile(migrationPath);

  const assertNoSlotConflict = latestFunctionDefinition(migration, "_assert_no_slot_conflict");
  const queryAvailability = latestFunctionDefinition(migration, "_query_booking_slot_availability");
  const createAppointmentDefinitions = functionDefinitions(migration, "create_appointment");

  assert(assertNoSlotConflict.length > 0, "cleanup migration must redefine _assert_no_slot_conflict before dropping businesses.capacity");
  assertStringIncludes(assertNoSlotConflict, "COALESCE(bs.capacity, 1)");
  assert(!/b\.capacity/.test(assertNoSlotConflict), "slot conflict helper must not read businesses.capacity");

  assertStringIncludes(queryAvailability, "COALESCE(bs.capacity, 1)");
  assert(!/b\.capacity/.test(queryAvailability), "public availability must not read businesses.capacity");
  assert(createAppointmentDefinitions.length === 2, "cleanup migration must redefine both create_appointment overloads before dropping businesses.capacity");
  assert(
    createAppointmentDefinitions.some((definition) => /p_service_id\s+uuid/.test(definition) && /p_branch_id\s+uuid/i.test(definition)),
    "cleanup migration must redefine the legacy branch-aware create_appointment overload",
  );
  assert(
    createAppointmentDefinitions.some((definition) => /p_service_id\s+text/i.test(definition) && !/p_branch_id\s+uuid/i.test(definition)),
    "cleanup migration must redefine the current admin create_appointment overload",
  );
  for (const createAppointment of createAppointmentDefinitions) {
    assertStringIncludes(createAppointment, "COALESCE(bs.capacity, 1)");
    assert(!/b\.capacity/.test(createAppointment), "create_appointment overloads must not read businesses.capacity");
  }

  const dropCapacityIndex = migration.search(/ALTER\s+TABLE\s+public\.businesses[\s\S]*?DROP\s+COLUMN\s+IF\s+EXISTS\s+capacity/i);
  const helperIndex = migration.search(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\._assert_no_slot_conflict/i);
  assert(helperIndex >= 0 && dropCapacityIndex >= 0 && helperIndex < dropCapacityIndex, "_assert_no_slot_conflict must be redefined before businesses.capacity is dropped");

  const allMigrations = await readAllMigrations();
  const callers = [
    "create_public_booking",
    "reschedule_booking_by_token",
    "create_admin_manual_booking",
    "reschedule_admin_booking",
  ];

  for (const caller of callers) {
    const definitions = functionDefinitions(allMigrations, caller);
    assert(definitions.length > 0, `expected to inspect ${caller} definitions`);
    assert(
      definitions.some((definition) => definition.includes("public._assert_no_slot_conflict")),
      `${caller} must keep a writable overload that calls public._assert_no_slot_conflict`,
    );
  }
});

Deno.test("settings writers and onboarding no longer write removed columns", async () => {
  const dashboardSettings = await Deno.readTextFile(dashboardSettingsPath);
  const confirmEmail = await Deno.readTextFile(confirmEmailPath);
  const dashboardOnboarding = await Deno.readTextFile(dashboardOnboardingPath);
  const combined = `${dashboardSettings}\n${confirmEmail}\n${dashboardOnboarding}`;

  const businessSettingsWrites = combined.match(/from\(['"]business_settings['"]\)[\s\S]{0,220}\.(?:insert|upsert|update)\((?:.|\n){0,900}?\)/g) ?? [];
  assert(businessSettingsWrites.length >= 3, "expected dashboard, landing signup, and onboarding settings writes to remain covered");

  for (const write of businessSettingsWrites) {
    assert(!/business_name\s*:/.test(write), "business_settings writes must not include business_name");
    assert(!/slug\s*:/.test(write), "business_settings writes must not include slug");
    assert(!/timezone\s*:/.test(write), "business_settings writes must not include timezone");
  }

  const businessWrites = dashboardOnboarding.match(/from\(['"]businesses['"]\)[\s\S]{0,220}\.(?:insert|upsert|update)\((?:.|\n){0,700}?\)/g) ?? [];
  assert(businessWrites.length >= 1, "expected onboarding business identity write to remain covered");
  for (const write of businessWrites) {
    assert(!/capacity\s*:/.test(write), "businesses writes must not include dropped capacity");
  }
});
