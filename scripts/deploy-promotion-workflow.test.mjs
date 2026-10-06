import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflowUrl = new URL('../.github/workflows/deploy-promotion.yml', import.meta.url);

function environmentBlock(source) {
  const match = source.replace(/\r\n/g, '\n').match(/\n {4}environment:\n((?: {6}.+\n)+)/);
  assert.ok(match, 'Expected jobs.deploy.environment to be a YAML mapping.');
  const entries = new Map();
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^ {6}([A-Za-z0-9_]+):\s*(.*)$/);
    if (entry) entries.set(entry[1], entry[2]);
  }
  return entries;
}

test('deploy-promotion job environment has a name so GitHub can parse the workflow', async () => {
  const source = await readFile(workflowUrl, 'utf8');
  const environment = environmentBlock(source);

  assert.ok(
    environment.has('name') && environment.get('name').length > 0,
    'GitHub rejects environment mappings without name (0 jobs, "workflow file issue").',
  );
});

test('deploy-promotion leaves the build to Vercel instead of prebuilding on the runner', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  // #1039/#1040 retired the standalone dashboard build from the workflow: Vercel runs
  // `build:vercel` (and now `build:vercel:web`) during its own build, so the runner must not
  // carry an Angular build step or upload a prebuilt output.
  assert.doesNotMatch(source, /angular_config/);
  assert.doesNotMatch(source, /Build dashboard/);
  assert.doesNotMatch(source, /--prebuilt/);
});

test('deploy-promotion does not pass Vercel CLI --target preview on QA', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.doesNotMatch(source, /vercel_target=preview/);
  assert.doesNotMatch(source, /--target preview/);
  assert.doesNotMatch(source, /vercel-args: '--target /);
  assert.match(
    source,
    /vercel_args=--prod/,
    'Production deploys must keep --prod. QA must omit --target; Vercel CLI 25 rejects --target preview.',
  );
});

test('deploy-promotion uses Vercel CLI 47+ instead of vercel-action v25', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.doesNotMatch(source, /amondnet\/vercel-action/);
  assert.match(source, /npx vercel@59\.11\.7/);
});

test('deploy-promotion keeps the combined site alias per environment', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.match(source, /vercel_alias=qa\.orvel\.pro/);
  assert.match(source, /alias "\$URL" "\$\{\{ steps\.target\.outputs\.vercel_alias \}\}"/);
  assert.doesNotMatch(
    source,
    /dist\/salon-de-belleza\/browser/,
    'The prebuilt upload was retired in #1039; the combined build happens on Vercel.',
  );
});

test('deploy-promotion deploys the operator console as its own project and origin', async () => {
  const source = await readFile(workflowUrl, 'utf8');
  const consoleStep = source.slice(source.indexOf('Deploy the operator console'));

  assert.ok(consoleStep.length > 0, 'expected a console deploy step');
  assert.match(source, /vercel_alias=qa\.orvel\.pro/);
  assert.match(source, /console_alias=dashboard\.qa\.orvel\.pro/);
  assert.match(source, /console_alias=dashboard\.orvel\.pro/);
  assert.match(consoleStep, /VERCEL_PROJECT_ID: \$\{\{ secrets\.VERCEL_PROJECT_ID_WEB \}\}/);
  assert.doesNotMatch(
    consoleStep,
    /secrets\.VERCEL_PROJECT_ID\s*\}\}/,
    'The console must not deploy into the combined project.',
  );
  assert.match(consoleStep, /alias "\$URL" "\$CONSOLE_ALIAS"/);
});

test('the console deploy skips instead of failing while its project does not exist', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.match(source, /if \[\[ -z "\$\{VERCEL_PROJECT_ID:-\}" \]\]/);
  assert.match(source, /Skipping the console deploy/);
});

test('deploy-promotion uses separate QA and prod Supabase access tokens', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.match(source, /secrets\.SUPABASE_ACCESS_TOKEN_QA/);
  assert.match(source, /secrets\.SUPABASE_ACCESS_TOKEN_PROD/);
  assert.doesNotMatch(
    source,
    /secrets\.SUPABASE_ACCESS_TOKEN[^\w]/,
    'Shared SUPABASE_ACCESS_TOKEN would let a prod rotate clobber QA (or the reverse).',
  );
});

test('deploy-promotion publishes process-email-outbox and release-expired-booking-holds', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.match(
    source,
    /supabase functions deploy process-email-outbox --project-ref \$\{\{ steps\.target\.outputs\.supabase_ref \}\}/,
  );
  assert.match(
    source,
    /supabase functions deploy release-expired-booking-holds --project-ref \$\{\{ steps\.target\.outputs\.supabase_ref \}\}/,
  );
});
