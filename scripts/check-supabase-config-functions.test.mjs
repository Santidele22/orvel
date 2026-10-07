import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectDeclaredWithoutSource,
  findDeclaredWithoutSource,
  listFunctionSources,
  parseDeclaredFunctionNames,
} from './check-supabase-config-functions.mjs';

const configUrl = new URL('../supabase/config.toml', import.meta.url);

test('parseDeclaredFunctionNames reads table headers and ignores comments', () => {
  const source = [
    '# [functions.commented-out]',
    'verify_jwt = false',
    '',
    '[functions.alpha]',
    'verify_jwt = false',
    '',
    '[functions.beta]',
    '  verify_jwt = true',
    '',
    '[functions.alpha]',
    'verify_jwt = true',
  ].join('\n');

  assert.deepEqual(parseDeclaredFunctionNames(source), ['alpha', 'beta']);
});

test('findDeclaredWithoutSource reports only the declared names that have no source', () => {
  assert.deepEqual(
    findDeclaredWithoutSource(['alpha', 'ghost', 'beta'], ['alpha', 'beta']),
    ['ghost'],
  );
});

test('listFunctionSources returns directories that ship an index.ts', async () => {
  const sources = await listFunctionSources();
  assert.ok(sources.includes('process-email-outbox'), 'expected a known function directory');
  assert.ok(!sources.includes('_shared'), '_shared has no index.ts and is not a function');
});

test('every function declared in supabase/config.toml has a source directory', async () => {
  const missing = await collectDeclaredWithoutSource();
  assert.deepEqual(
    missing,
    [],
    `supabase/config.toml declares function(s) with no source: ${missing.join(', ')}`,
  );
});

test('the guard fails on the shape it exists to catch', async () => {
  const source = await readFile(configUrl, 'utf8');
  assert.ok(
    source.includes('[functions.sync-mp-plans]') === false,
    'the dead sync-mp-plans block was re-added to supabase/config.toml',
  );
});

test('infra/context/architecture.md states the real number of Edge Functions', async () => {
  const architecture = await readFile(
    new URL('../infra/context/architecture.md', import.meta.url),
    'utf8',
  );
  const declared = architecture.match(/(\d+)\s+Edge Functions/);
  assert.ok(declared, 'expected the supabase/functions entry to state a function count');

  const sources = await listFunctionSources();
  assert.equal(
    Number(declared[1]),
    sources.length,
    `architecture.md claims ${declared[1]} Edge Functions but supabase/functions/ has ${sources.length}`,
  );
});
