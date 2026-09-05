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

test('deploy-promotion builds the dashboard with an Angular configuration that exists', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.match(source, /echo "angular_config=production"/);
  assert.doesNotMatch(
    source,
    /angular_config=qa/,
    'apps/dashboard has no Angular configuration named qa (only production and development).',
  );
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
