import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findMigrationDrift,
  isActiveMigration,
  migrationDescription,
} from './check-migration-drift.mjs';

const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), 'check-migration-drift.mjs');

const OLD_PURGE = 'supabase/migrations/20260828120000_purge_elapsed_bookings.sql';
const NEW_PURGE = 'supabase/migrations/20260906211000_purge_elapsed_bookings.sql';
const OLD_SLOT_CAPACITY = 'supabase/migrations/20260905203000_slot_capacity_from_professionals.sql';
const NEW_SLOT_CAPACITY = 'supabase/migrations/20260906211100_slot_capacity_from_professionals.sql';

test('isActiveMigration accepts active migrations and rejects archives and non-migrations', () => {
  assert.equal(isActiveMigration('supabase/migrations/20260906211000_purge_elapsed_bookings.sql'), true);
  assert.equal(isActiveMigration('supabase/migrations/20260501_consolidated_schema.sql'), true);

  assert.equal(isActiveMigration('supabase/migrations/_legacy/20260906211000_purge_elapsed_bookings.sql'), false);
  assert.equal(isActiveMigration('supabase/migrations/README.md'), false);
  assert.equal(isActiveMigration('supabase/functions/purge/index.ts'), false);
  assert.equal(isActiveMigration('supabase/migrations'), false);
  assert.equal(isActiveMigration(undefined), false);
});

test('migrationDescription strips the 14-digit prefix and keeps an unprefixed basename', () => {
  assert.equal(migrationDescription(NEW_PURGE), 'purge_elapsed_bookings.sql');
  assert.equal(migrationDescription('supabase/migrations/20260501_consolidated_schema.sql'), '20260501_consolidated_schema.sql');
  assert.equal(migrationDescription('supabase/migrations/_legacy/20260906211100_slot_capacity_from_professionals.sql'), 'slot_capacity_from_professionals.sql');
  assert.equal(migrationDescription('supabase/migrations/notes.sql'), 'notes.sql');
});

test('findMigrationDrift returns no violations for aligned migration sets', () => {
  const aligned = [
    'supabase/migrations/20260501_consolidated_schema.sql',
    OLD_SLOT_CAPACITY,
    NEW_PURGE,
  ];

  assert.deepEqual(findMigrationDrift({ mergedPaths: aligned, headPaths: aligned }), []);
  assert.deepEqual(findMigrationDrift({ mergedPaths: [], headPaths: [] }), []);
});

test('findMigrationDrift reports the real incident shape with both violation codes', () => {
  const violations = findMigrationDrift({
    mergedPaths: [OLD_PURGE, NEW_PURGE, OLD_SLOT_CAPACITY, NEW_SLOT_CAPACITY],
    headPaths: [NEW_PURGE, NEW_SLOT_CAPACITY],
  });

  assert.deepEqual(
    violations.map((violation) => violation.code),
    [
      'DUPLICATE_MIGRATION_DESCRIPTION',
      'DUPLICATE_MIGRATION_DESCRIPTION',
      'MIGRATION_NOT_CARRIED_BY_HEAD',
      'MIGRATION_NOT_CARRIED_BY_HEAD',
    ]
  );

  const [firstDuplicate, secondDuplicate] = violations;
  assert.deepEqual(firstDuplicate.paths, [OLD_PURGE, NEW_PURGE]);
  assert.match(firstDuplicate.message, /purge_elapsed_bookings\.sql/);
  assert.deepEqual(secondDuplicate.paths, [OLD_SLOT_CAPACITY, NEW_SLOT_CAPACITY]);
  assert.match(secondDuplicate.message, /slot_capacity_from_professionals\.sql/);

  assert.deepEqual(
    violations.slice(2).map((violation) => violation.paths),
    [[OLD_PURGE], [OLD_SLOT_CAPACITY]]
  );
});

test('findMigrationDrift reports a single unpaired migration without a duplicate', () => {
  const violations = findMigrationDrift({
    mergedPaths: [NEW_PURGE, OLD_SLOT_CAPACITY],
    headPaths: [NEW_PURGE],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].code, 'MIGRATION_NOT_CARRIED_BY_HEAD');
  assert.deepEqual(violations[0].paths, [OLD_SLOT_CAPACITY]);
  assert.match(violations[0].message, /20260905203000_slot_capacity_from_professionals\.sql/);
});

test('findMigrationDrift ignores identical descriptions archived under _legacy', () => {
  const violations = findMigrationDrift({
    mergedPaths: [
      'supabase/migrations/_legacy/20260828120000_purge_elapsed_bookings.sql',
      'supabase/migrations/_legacy/20260906211000_purge_elapsed_bookings.sql',
      'supabase/migrations/20260501_consolidated_schema.sql',
      'supabase/migrations/_legacy/notes.md',
    ],
    headPaths: ['supabase/migrations/20260501_consolidated_schema.sql'],
  });

  assert.deepEqual(violations, []);
});

test('findMigrationDrift does not crash on a filename without a 14-digit prefix', () => {
  const unprefixed = 'supabase/migrations/20260501_consolidated_schema.sql';

  assert.deepEqual(findMigrationDrift({ mergedPaths: [unprefixed], headPaths: [unprefixed] }), []);

  const drifted = findMigrationDrift({
    mergedPaths: [unprefixed, 'supabase/migrations/20260506_consolidated_billing.sql'],
    headPaths: [unprefixed],
  });

  assert.deepEqual(
    drifted.map((violation) => violation.code),
    ['MIGRATION_NOT_CARRIED_BY_HEAD']
  );
  assert.deepEqual(drifted[0].paths, ['supabase/migrations/20260506_consolidated_billing.sql']);
});

test('findMigrationDrift keeps a prefixed and an unprefixed basename distinct', () => {
  const violations = findMigrationDrift({
    mergedPaths: [
      'supabase/migrations/20260501_consolidated_schema.sql',
      'supabase/migrations/20260906211000_consolidated_schema.sql',
    ],
    headPaths: ['supabase/migrations/20260501_consolidated_schema.sql'],
  });

  assert.deepEqual(
    violations.map((violation) => violation.code),
    ['MIGRATION_NOT_CARRIED_BY_HEAD']
  );
});

function git(cwd, args) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.email=drift-guard@example.com',
      '-c',
      'user.name=Drift Guard',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8' }
  );
}

function writeMigration(repo, path, contents) {
  mkdirSync(join(repo, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(join(repo, path), contents);
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' });
}

/**
 * Reproduce the promotion incident end to end. `qa` and `dev` diverge from a
 * common ancestor that predates the migration, so the retimestamp on `qa` is
 * not seen as a rename and `git merge-tree` reports a clean merge that still
 * carries both filename variants — exactly what happened to #943/#945/#1030.
 */
test('CLI reproduces the retimestamp incident and clears once filenames are aligned', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'orvel-migration-drift-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'README.md'), '# throwaway\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'root']);

  git(repo, ['checkout', '-q', '-b', 'dev']);
  writeMigration(repo, 'supabase/migrations/20260828120000_purge_elapsed_bookings.sql', 'select 1;\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'dev adds the original timestamp']);

  git(repo, ['checkout', '-q', '-b', 'qa', 'main']);
  writeMigration(repo, 'supabase/migrations/20260828120000_purge_elapsed_bookings.sql', 'select 1;\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'qa adds the original timestamp']);
  git(repo, ['mv', 'supabase/migrations/20260828120000_purge_elapsed_bookings.sql', 'supabase/migrations/20260906211000_purge_elapsed_bookings.sql']);
  git(repo, ['commit', '-qm', 'qa retimestamps the migration']);

  const drifted = runCli(repo, ['--base', 'qa', '--head', 'dev']);
  assert.equal(drifted.status, 1, `expected exit 1, got ${drifted.status}: ${drifted.stdout}${drifted.stderr}`);
  assert.match(drifted.stderr, /DUPLICATE_MIGRATION_DESCRIPTION/);
  assert.match(drifted.stderr, /20260828120000_purge_elapsed_bookings\.sql/);
  assert.match(drifted.stderr, /20260906211000_purge_elapsed_bookings\.sql/);
  assert.match(drifted.stderr, /MIGRATION_NOT_CARRIED_BY_HEAD/);

  git(repo, ['checkout', '-q', 'dev']);
  git(repo, ['mv', 'supabase/migrations/20260828120000_purge_elapsed_bookings.sql', 'supabase/migrations/20260906211000_purge_elapsed_bookings.sql']);
  git(repo, ['commit', '-qm', 'dev adopts the promoted timestamp']);

  const aligned = runCli(repo, ['--base', 'qa', '--head', 'dev']);
  assert.equal(aligned.status, 0, `expected exit 0, got ${aligned.status}: ${aligned.stdout}${aligned.stderr}`);
  assert.match(aligned.stdout, /no drift/);
});
