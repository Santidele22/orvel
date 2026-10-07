#!/usr/bin/env node
/**
 * Fase 3 of #1098 — the artifact contract of the web/pwa split.
 *
 * The acceptance criterion for `apps/dashboard-web` is about the *artifact*, not about intent: its
 * build must not contain `ngsw-worker.js` or `manifest.webmanifest`, and the PWA must keep shipping
 * them. Checking the config (`angular.json` has no `serviceWorker`) is not enough — the config could
 * be right while an asset list still copies the manifest.
 *
 * This runs after both builds in the `check` gate. It also refuses to pass when a build output is
 * missing, so "the split is fine" can never mean "nothing was built".
 *
 * Usage:
 *   node scripts/check-dashboard-web-pwa-artifacts.mjs
 *
 * Exit 0 = contract holds, 1 = violated, 2 = the gate could not run.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WEB_DIST = join(REPO_ROOT, 'apps', 'dashboard-web', 'dist', 'orvel-dashboard-web', 'browser');
const PWA_DIST = join(REPO_ROOT, 'apps', 'dashboard', 'dist', 'salon-de-belleza', 'browser');

/** The PWA-only machinery. `ngsw.json` is the generated service-worker manifest. */
const PWA_ONLY_ARTIFACTS = ['ngsw-worker.js', 'ngsw.json', 'manifest.webmanifest', 'orvel-push-sw.js'];

/** These two are the ones the issue names explicitly; kept separate for the failure message. */
const NAMED_IN_ACCEPTANCE = ['ngsw-worker.js', 'manifest.webmanifest'];

function rel(absolute) {
  return relative(REPO_ROOT, absolute).replace(/\\/g, '/');
}

function fail(lines) {
  console.error(['dashboard-web artifact contract: VIOLATED', '', ...lines].join('\n'));
  process.exit(1);
}

function assertDistExists(dir, appLabel) {
  if (!existsSync(dir)) {
    console.error(
      `dashboard-web artifact contract: cannot run.\n` +
        `Missing build output for ${appLabel} at ${rel(dir)}.\n` +
        `The gate must build both targets before checking artifacts.`
    );
    process.exit(2);
  }
}

assertDistExists(WEB_DIST, 'apps/dashboard-web');
assertDistExists(PWA_DIST, 'apps/dashboard');

const webFiles = new Set(readdirSync(WEB_DIST));
const pwaFiles = new Set(readdirSync(PWA_DIST));

const leaked = PWA_ONLY_ARTIFACTS.filter((name) => webFiles.has(name));
if (leaked.length > 0) {
  const named = leaked.filter((name) => NAMED_IN_ACCEPTANCE.includes(name));
  fail([
    `The web build ships PWA machinery: ${leaked.join(', ')}.`,
    named.length > 0
      ? `That is exactly what #1098 Fase 3 forbids (${named.join(', ')}).`
      : 'Remove it from apps/dashboard-web/angular.json assets/config.',
    `Inspected: ${rel(WEB_DIST)}`
  ]);
}

const missingInPwa = PWA_ONLY_ARTIFACTS.filter((name) => !pwaFiles.has(name));
if (missingInPwa.length > 0) {
  fail([
    `The PWA build lost PWA machinery: ${missingInPwa.join(', ')}.`,
    'The web/pwa split must not change the installable product (ADR 0011).',
    `Inspected: ${rel(PWA_DIST)}`
  ]);
}

console.log(
  `dashboard-web artifact contract: OK — web ships none of [${PWA_ONLY_ARTIFACTS.join(', ')}], ` +
    `PWA still ships all of them.`
);
