// Synthetic env vars for the web target's specs, mirroring
// apps/dashboard/src/test-setup.ts. Values are placeholders: never point tests at a real project.
if (!process.env['NEXT_PUBLIC_SUPABASE_URL']) {
  process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://dashboard-tests.invalid';
}
if (!process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
}

export {};
