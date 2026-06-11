// Integration scaffold for booking double-booking race protection.
//
// This file is intentionally skipped until a disposable Supabase test database
// is available. It must never require production credentials.
//
// Required environment for a future enabled run:
// - ORVEL_TEST_SUPABASE_URL: URL for a local/ephemeral Supabase instance.
// - ORVEL_TEST_SUPABASE_SERVICE_ROLE_KEY: service-role key for that disposable instance.
// - ORVEL_TEST_BUSINESS_ID / ORVEL_TEST_SERVICE_ID or a fixture seeding helper.
//
// Intended race contract:
// 1. Seed one business, branch, service, settings, and customer fixture.
// 2. Fire concurrent create_public_booking/create_admin_manual_booking requests
//    for the exact same business/branch/time window.
// 3. Assert exactly one confirmed booking/block is committed and all other
//    contenders fail with a controlled conflict error.
// 4. Repeat for admin/public reschedule and status transition to confirmed.

Deno.test.ignore("booking concurrency integration: concurrent writers allow exactly one booking per conflict window", () => {
  throw new Error(
    "Enable only against a disposable Supabase test database with ORVEL_TEST_* environment variables; never against production.",
  );
});
