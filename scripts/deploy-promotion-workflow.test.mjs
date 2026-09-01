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
