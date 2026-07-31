import { assert, assertStringIncludes } from "std/assert/mod.ts";

const migrationsDir = new URL("../../migrations/", import.meta.url);
const repoRoot = new URL("../../../", import.meta.url);
const cleanupMigrationPath = new URL(
  "../../migrations/20260707210000_drop_legacy_booking_time_columns.sql",
  import.meta.url,
);
const historicalLintMigrationPath = new URL(
  "../../migrations/20260609140000_fix_supabase_lint_blockers.sql",
  import.meta.url,
);
const historicalBusinessCleanupMigrationPath = new URL(
  "../../migrations/20260707180000_pre_mvp_business_identity_settings_cleanup.sql",
  import.meta.url,
);

async function collectFiles(dir: URL, suffix: string): Promise<URL[]> {
  const files: URL[] = [];

  for await (const entry of Deno.readDir(dir)) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory ? "/" : ""}`, dir);
    if (entry.isDirectory) {
      files.push(...await collectFiles(entryUrl, suffix));
    } else if (entry.isFile && entry.name.endsWith(suffix)) {
      files.push(entryUrl);
    }
  }

  return files;
}

function toRepoRelative(file: URL): string {
  return decodeURIComponent(file.pathname).replace(
    decodeURIComponent(repoRoot.pathname),
    "",
  );
}

Deno.test("booking time cleanup migration fails on legacy drift, copies unambiguous legacy values, and drops duplicate columns", async () => {
  const migration = await Deno.readTextFile(cleanupMigrationPath);

  assertStringIncludes(migration, "bookings legacy time column drift detected");
  assertStringIncludes(
    migration,
    "starts_at = COALESCE(starts_at, start_time)",
  );
  assertStringIncludes(migration, "ends_at = COALESCE(ends_at, end_time)");
  assertStringIncludes(migration, "DROP COLUMN IF EXISTS start_time");
  assertStringIncludes(migration, "DROP COLUMN IF EXISTS end_time");

  const redefineIndex = migration.search(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_appointment/i,
  );
  const dropIndex = migration.search(
    /ALTER\s+TABLE\s+public\.bookings[\s\S]*?DROP\s+COLUMN\s+IF\s+EXISTS\s+start_time/i,
  );
  assert(
    redefineIndex >= 0 && dropIndex >= 0 && redefineIndex < dropIndex,
    "create_appointment must be canonical before dropping legacy booking time columns",
  );
});

Deno.test("historical migrations are left untouched even when they contain legacy booking columns", async () => {
  const lintMigration = await Deno.readTextFile(historicalLintMigrationPath);
  const businessCleanupMigration = await Deno.readTextFile(
    historicalBusinessCleanupMigrationPath,
  );

  assertStringIncludes(
    lintMigration,
    "INSERT INTO public.bookings (business_id, customer_id, service_id, start_time, end_time, starts_at, ends_at, status, manage_token, notes)",
  );
  assertStringIncludes(
    businessCleanupMigration,
    "INSERT INTO public.bookings (business_id, customer_id, service_id, start_time, end_time, starts_at, ends_at, status, manage_token, notes)",
  );
});

Deno.test("new forward migration and active source never write legacy booking time columns", async () => {
  const cleanupMigration = await Deno.readTextFile(cleanupMigrationPath);
  const activeSourceFiles = [
    ...await collectFiles(new URL("apps/dashboard/src/", repoRoot), ".ts"),
    ...await collectFiles(new URL("supabase/functions/", repoRoot), ".ts"),
  ];
  const legacyBookingInsert =
    /INSERT\s+INTO\s+public\.bookings\s*\([^)]*\b(?:start_time|end_time)\b[^)]*\)/i;

  assert(
    !legacyBookingInsert.test(cleanupMigration),
    "forward cleanup migration must only write starts_at/ends_at to public.bookings",
  );

  const legacyColumnReference =
    /\b(?:booking|bookings)\b[\s\S]{0,120}\b(?:start_time|end_time)\b|\b(?:start_time|end_time)\b[\s\S]{0,120}\b(?:booking|bookings)\b/i;

  for (const file of activeSourceFiles) {
    if (file.pathname.endsWith("booking-time-schema-cleanup-static-contract.test.ts")) {
      continue;
    }

    const contents = await Deno.readTextFile(file);
    assert(
      !legacyColumnReference.test(contents),
      `${toRepoRelative(file)} must not reference legacy bookings.start_time/end_time`,
    );
  }
});
