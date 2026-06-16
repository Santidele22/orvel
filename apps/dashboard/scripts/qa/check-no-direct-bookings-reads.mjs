#!/usr/bin/env node

/**
 * Regression guard for the Supabase public.bookings grants forward-fix.
 *
 * Dashboard browser/runtime code must not read public.bookings directly because
 * anon/authenticated table grants are intentionally revoked. Admin list and
 * public enrichment flows must go through least-privilege RPC contracts instead.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = new URL('../../../../', import.meta.url).pathname;
const appRoot = join(repoRoot, 'apps/dashboard/src/app');

const ignoredPathFragments = [
  '/tests/',
  '.spec.ts',
  '.contract.ts',
  '.contract.spec.ts',
  '.red.contract.spec.ts',
];

const sourceExtensions = new Set(['.ts', '.js', '.mjs']);

const directBookingsSelect = /(?:\.schema\(\s*['"]public['"]\s*\)\s*)?\.from\(\s*['"](?:public\.)?bookings['"]\s*\)[\s\S]{0,450}?\.select\s*\(/gi;

function hasSourceExtension(path) {
  return [...sourceExtensions].some((extension) => path.endsWith(extension));
}

function shouldIgnore(path) {
  const normalized = path.replaceAll('\\', '/');
  return ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function walk(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile() || !hasSourceExtension(fullPath) || shouldIgnore(fullPath)) return [];
    return [fullPath];
  });
}

const violations = [];

for (const file of walk(appRoot)) {
  if (!statSync(file).isFile()) continue;
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(directBookingsSelect)) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push({
      file: relative(repoRoot, file),
      line,
      snippet: match[0].replace(/\s+/g, ' ').slice(0, 220),
    });
  }
}

if (violations.length > 0) {
  console.error('Direct public.bookings reads found in dashboard runtime code.');
  console.error('Replace these paths with least-privilege RPC calls before release:');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} :: ${violation.snippet}`);
  }
  process.exit(1);
}

console.log('OK: no direct public.bookings .select() reads found in dashboard runtime code.');
