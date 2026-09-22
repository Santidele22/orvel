#!/usr/bin/env node
/**
 * Promotion drift guard.
 *
 * Promotion across `feature -> dev -> qa -> main` is a squash-copied tree, so
 * `qa` and `dev` end up with unrelated histories. `git merge-tree` then finds an
 * old merge base and happily reports a clean merge that still contains BOTH
 * name variants of a retimestamped migration (incident: #943, #945, #1030).
 * `supabase db push` rejects the stale timestamp afterwards and the promotion
 * needs manual repair.
 *
 * This module exposes the pure detection core plus a CLI that inspects a real
 * merge result:
 *
 *   node scripts/check-migration-drift.mjs --base origin/qa --head <branch>
 *
 * Exit 0 = no drift, exit 1 = drift (or the merge result could not be read).
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MIGRATIONS_DIR = 'supabase/migrations/';
const LEGACY_DIR = 'supabase/migrations/_legacy/';
const TIMESTAMP_PREFIX = /^\d{14}_/;
const TREE_OID = /^[0-9a-f]{40}$/;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

const USAGE = 'usage: node scripts/check-migration-drift.mjs --base <ref> --head <ref>';

/**
 * True only for `supabase/migrations/*.sql` paths that are still active, i.e.
 * direct children of the migrations directory that are not archived under
 * `supabase/migrations/_legacy/` (those are inert and never pushed).
 */
export function isActiveMigration(path) {
  if (typeof path !== 'string') return false;
  if (!path.startsWith(MIGRATIONS_DIR)) return false;
  if (path.startsWith(LEGACY_DIR)) return false;

  const relative = path.slice(MIGRATIONS_DIR.length);
  if (relative.length === 0 || relative.includes('/')) return false;

  return relative.endsWith('.sql');
}

/**
 * The basename with a leading 14-digit timestamp prefix stripped. A basename
 * without that prefix (for example `20260501_consolidated_schema.sql`) is
 * returned whole instead of crashing.
 */
export function migrationDescription(path) {
  const basename = String(path ?? '').split('/').pop() ?? '';
  return basename.replace(TIMESTAMP_PREFIX, '');
}

function compareViolations(left, right) {
  if (left.code !== right.code) return left.code < right.code ? -1 : 1;

  const leftPaths = left.paths.join('\u0000');
  const rightPaths = right.paths.join('\u0000');
  if (leftPaths !== rightPaths) return leftPaths < rightPaths ? -1 : 1;

  if (left.message === right.message) return 0;
  return left.message < right.message ? -1 : 1;
}

/**
 * Pure drift detection over two path listings.
 *
 * @param {{ mergedPaths?: string[], headPaths?: string[] }} input
 *   `mergedPaths` is the file listing of the merge result, `headPaths` the
 *   listing of the promotion head (the branch the change is promoted into).
 * @returns {Array<{ code: string, message: string, paths: string[] }>}
 */
export function findMigrationDrift({ mergedPaths = [], headPaths = [] } = {}) {
  const activeMerged = [...new Set(mergedPaths.filter(isActiveMigration))].sort();
  const activeHead = new Set(headPaths.filter(isActiveMigration));

  const byDescription = new Map();
  for (const path of activeMerged) {
    const description = migrationDescription(path);
    const bucket = byDescription.get(description);
    if (bucket) {
      bucket.push(path);
    } else {
      byDescription.set(description, [path]);
    }
  }

  const violations = [];

  for (const [description, paths] of byDescription) {
    if (paths.length < 2) continue;

    violations.push({
      code: 'DUPLICATE_MIGRATION_DESCRIPTION',
      message: `two or more active migrations share the description "${description}": ${paths.join(', ')}`,
      paths: [...paths].sort(),
    });
  }

  for (const path of activeMerged) {
    if (activeHead.has(path)) continue;

    violations.push({
      code: 'MIGRATION_NOT_CARRIED_BY_HEAD',
      message: `active migration ${path} is present in the merge result but absent from the promotion head`,
      paths: [path],
    });
  }

  return violations.sort(compareViolations);
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });

  if (result.error) {
    throw new Error(`could not run git ${args.join(' ')}: ${result.error.message}`);
  }

  return result;
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--base' || argument === '--head') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return { error: `missing value for ${argument}` };
      }
      parsed[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    if (argument.startsWith('--base=') || argument.startsWith('--head=')) {
      const [flag, value] = argument.split('=', 2);
      if (value.length === 0) return { error: `missing value for ${flag}` };
      parsed[flag.slice(2)] = value;
      continue;
    }

    return { error: `unknown argument: ${argument}` };
  }

  if (!parsed.base) return { error: 'missing required --base <ref>' };
  if (!parsed.head) return { error: 'missing required --head <ref>' };

  return { base: parsed.base, head: parsed.head };
}

function listTreePaths(rev) {
  const result = runGit(['ls-tree', '-r', '--name-only', rev]);

  if (result.status !== 0) {
    throw new Error(`git ls-tree failed for "${rev}": ${(result.stderr || '').trim() || `exit ${result.status}`}`);
  }

  return result.stdout.split('\n').filter((line) => line.length > 0);
}

/**
 * Compute the merge result tree of `base` and `head`. `git merge-tree
 * --write-tree` exits non-zero when the merge conflicts and still prints the
 * resulting tree oid as its first stdout line, so the oid is parsed regardless
 * of exit status.
 */
function mergeResultTree(base, head) {
  const result = runGit(['merge-tree', '--write-tree', base, head]);

  const firstLine = (result.stdout || '').split('\n', 1)[0].trim();
  if (!TREE_OID.test(firstLine)) {
    const detail = (result.stderr || '').trim() || (result.stdout || '').trim() || `exit ${result.status}`;
    throw new Error(
      `could not parse a merge tree oid from "git merge-tree --write-tree ${base} ${head}" (exit ${result.status}): ${detail}`
    );
  }

  return firstLine;
}

export function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);

  if (parsed.error) {
    console.error(`check-migration-drift: ${parsed.error}`);
    console.error(USAGE);
    return 1;
  }

  const { base, head } = parsed;

  let mergedPaths;
  let headPaths;
  try {
    const treeOid = mergeResultTree(base, head);
    mergedPaths = listTreePaths(treeOid);
    headPaths = listTreePaths(head);
  } catch (error) {
    console.error(`check-migration-drift: ${error.message}`);
    return 1;
  }

  const violations = findMigrationDrift({ mergedPaths, headPaths });

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`check-migration-drift: ${violation.code}: ${violation.message}`);
    }
    console.error(
      `check-migration-drift: ${violations.length} violation(s) in the merge result of '${head}' onto '${base}'; align the migration filenames on 'dev' first`
    );
    return 1;
  }

  const checked = new Set(mergedPaths.filter(isActiveMigration)).size;
  console.log(`check-migration-drift: no drift between '${base}' and '${head}' (${checked} active migrations checked)`);
  return 0;
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exit(main(process.argv.slice(2)));
}
