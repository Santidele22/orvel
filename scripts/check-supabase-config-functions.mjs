#!/usr/bin/env node
/**
 * Guard against declared-but-absent Edge Functions.
 *
 * `supabase/config.toml` may declare `[functions.<name>]` blocks to override
 * per-function settings (today only `verify_jwt`). A block whose function has no
 * source under `supabase/functions/<name>/` is unauditable: it documents a
 * deployable endpoint that nobody can read. That is audit finding S7
 * (`sync-mp-plans` declared with `verify_jwt = false` and no source).
 *
 * The invariant is one-directional on purpose: every declared block must have a
 * source, but not every function needs a block, because `verify_jwt` defaults to
 * `true` and most functions are happy with the default.
 *
 * Usage: node scripts/check-supabase-config-functions.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_URL = new URL('../supabase/config.toml', import.meta.url);
const DEFAULT_FUNCTIONS_URL = new URL('../supabase/functions/', import.meta.url);

/**
 * Extract the function names declared as `[functions.<name>]` table headers.
 *
 * Line-based on purpose: TOML parsers in this repo would be a new dependency for
 * a single header shape, and header lines are unambiguous (the table name cannot
 * contain whitespace).
 *
 * @param {string} source contents of `supabase/config.toml`
 * @returns {string[]} declared function names, in file order, de-duplicated
 */
export function parseDeclaredFunctionNames(source) {
  const names = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('#')) continue;
    const match = line.match(/^\[functions\.([A-Za-z0-9_-]+)\]$/);
    if (match && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/**
 * Names that are declared but have no `index.ts` next to them.
 *
 * @param {string[]} declared declared function names
 * @param {string[]} available function directory names that contain `index.ts`
 * @returns {string[]} declared names without source, in declared order
 */
export function findDeclaredWithoutSource(declared, available) {
  const present = new Set(available);
  return declared.filter((name) => !present.has(name));
}

/**
 * Function directory names that actually ship an entry point.
 *
 * @param {URL} functionsUrl directory holding one subdirectory per function
 * @returns {Promise<string[]>} sorted directory names containing `index.ts`
 */
export async function listFunctionSources(functionsUrl = DEFAULT_FUNCTIONS_URL) {
  const entries = await readdir(functionsUrl, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await readFile(new URL(`${entry.name}/index.ts`, functionsUrl), 'utf8');
      names.push(entry.name);
    } catch {
      // No entry point: not a function directory (e.g. `_shared`).
    }
  }
  return names.sort();
}

export async function collectDeclaredWithoutSource({
  configUrl = DEFAULT_CONFIG_URL,
  functionsUrl = DEFAULT_FUNCTIONS_URL,
} = {}) {
  const [configSource, available] = await Promise.all([
    readFile(configUrl, 'utf8'),
    listFunctionSources(functionsUrl),
  ]);
  return findDeclaredWithoutSource(parseDeclaredFunctionNames(configSource), available);
}

async function main() {
  const missing = await collectDeclaredWithoutSource();
  if (missing.length === 0) {
    console.log('supabase/config.toml: every declared function has a source.');
    return;
  }
  console.error(
    `supabase/config.toml declares ${missing.length} function(s) with no source under supabase/functions/:`,
  );
  for (const name of missing) {
    console.error(`  - ${name}: no supabase/functions/${name}/index.ts`);
  }
  console.error('Remove the stale block or restore the source before merging.');
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
