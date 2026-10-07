#!/usr/bin/env node
/**
 * Dashboard suite failure-parity gate (#1076, Fase 0 item 3).
 *
 * `apps/dashboard` ships 296 spec files and 2045 tests, but the gates run 14 of
 * them (~4.5 %). The full suite is red — 162 failures after Fase 0.1 batches 1
 * and 2 — so "make CI run the whole suite" cannot mean "CI must be green".
 * Fase 0 of #1076 prescribes the intermediate gate instead:
 *
 *     paridad de fallos (0 nuevos) + tsc + ng build
 *
 * This script is that gate. It runs the whole dashboard suite, compares the
 * failing set against a committed baseline snapshot, and exits non-zero when the
 * set changes in either direction:
 *
 *   - a NEW failing test, or a NEW file that fails at collection time, is a
 *     regression: the PR is blocked;
 *   - a baseline entry that stopped failing means the baseline is stale: it must
 *     be regenerated in the same PR, otherwise a later regression of that same
 *     test would be invisible (it would still be "known failing").
 *
 * Parity is exact on purpose. The escape hatch is a `flaky` list in the baseline
 * (tests that legitimately pass or fail depending on the wall clock/network),
 * recorded there as `{ "<id>": "<reason>" }`.
 *
 * Usage:
 *   node scripts/check-dashboard-failure-parity.mjs                      # run suite + compare
 *   node scripts/check-dashboard-failure-parity.mjs --report <file.json> # compare an existing report
 *   node scripts/check-dashboard-failure-parity.mjs --update             # rewrite the baseline
 *
 * Exit 0 = parity, 1 = violated, 2 = the gate could not run.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_BASELINE = join(REPO_ROOT, 'scripts/fixtures/dashboard-failure-baseline.json');
export const DEFAULT_REPORT = join(REPO_ROOT, '.cache/dashboard-failure-report.json');
const DASHBOARD_DIR = join(REPO_ROOT, 'apps/dashboard');
const DASHBOARD_MARKER = '/apps/dashboard/';
const UPDATE_HINT = 'pnpm run test:dashboard:parity:update';

/**
 * Vitest reports absolute paths, which differ between a laptop and a runner.
 * Everything in the baseline is keyed by the path relative to apps/dashboard/.
 */
export function normalizeFile(file) {
  if (typeof file !== 'string') return '';
  const marker = file.indexOf(DASHBOARD_MARKER);
  if (marker !== -1) return file.slice(marker + DASHBOARD_MARKER.length);
  return file.replace(/^\.\//, '');
}

function firstLine(text) {
  return String(text ?? '').split('\n')[0].trim();
}

/**
 * Reduce a `vitest run --reporter=json` report to the two things that define
 * parity: the failing test ids and the files that never got to run a test.
 */
export function parseReport(report) {
  const failures = [];
  const collectionErrors = {};

  for (const suite of report?.testResults ?? []) {
    const file = normalizeFile(suite.name);
    const assertions = suite.assertionResults ?? [];
    const failed = assertions.filter((assertion) => assertion.status === 'failed');

    if (failed.length === 0 && suite.status === 'failed') {
      collectionErrors[file] = firstLine(suite.message);
      continue;
    }
    for (const assertion of failed) {
      failures.push(`${file} :: ${assertion.fullName || assertion.title || '(unnamed)'}`);
    }
  }

  return {
    failures: [...new Set(failures)].sort(),
    collectionErrors: Object.fromEntries(Object.entries(collectionErrors).sort(([a], [b]) => a.localeCompare(b))),
    totals: {
      tests: report?.numTotalTests ?? 0,
      passed: report?.numPassedTests ?? 0,
      failed: report?.numFailedTests ?? 0,
      skipped: report?.numPendingTests ?? 0,
      collectionErrors: Object.keys(collectionErrors).length,
    },
  };
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

/**
 * Exact parity between a baseline snapshot and a fresh report. Tests listed in
 * `baseline.flaky` are excluded from both directions.
 */
export function compareReports(baseline, current) {
  const flaky = new Set(Object.keys(baseline?.flaky ?? {}));
  const known = (baseline?.failures ?? []).filter((id) => !flaky.has(id));
  const found = current.failures.filter((id) => !flaky.has(id));

  const newFailures = difference(found, known);
  const removedFailures = difference(known, found);
  const knownErrors = Object.keys(baseline?.collectionErrors ?? {});
  const foundErrors = Object.keys(current.collectionErrors ?? {});
  const newCollectionErrors = difference(foundErrors, knownErrors);
  const removedCollectionErrors = difference(knownErrors, foundErrors);

  return {
    ok:
      newFailures.length === 0 &&
      removedFailures.length === 0 &&
      newCollectionErrors.length === 0 &&
      removedCollectionErrors.length === 0,
    newFailures,
    removedFailures,
    newCollectionErrors,
    removedCollectionErrors,
    totals: { baseline: baseline?.totals ?? null, current: current.totals },
  };
}

export function formatComparison(comparison, { baselinePath = DEFAULT_BASELINE } = {}) {
  const lines = [];
  const { totals } = comparison;

  lines.push(
    `dashboard suite: ${totals.current.failed} failing tests, ` +
      `${totals.current.collectionErrors} collection error(s) of ${totals.current.tests} tests ` +
      `(baseline ${totals.baseline?.failed ?? '?'} failing)`,
  );

  if (comparison.newFailures.length > 0) {
    lines.push('', `NEW failing tests (${comparison.newFailures.length}) - regressions, fix them or revert:`);
    lines.push(...comparison.newFailures.map((id) => `  + ${id}`));
  }
  if (comparison.newCollectionErrors.length > 0) {
    lines.push('', `NEW files failing at collection (${comparison.newCollectionErrors.length}):`);
    lines.push(...comparison.newCollectionErrors.map((id) => `  + ${id}`));
  }
  if (comparison.removedFailures.length > 0) {
    lines.push('', `Baseline entries that now pass (${comparison.removedFailures.length}):`);
    lines.push(...comparison.removedFailures.map((id) => `  - ${id}`));
  }
  if (comparison.removedCollectionErrors.length > 0) {
    lines.push('', `Files that no longer fail at collection (${comparison.removedCollectionErrors.length}):`);
    lines.push(...comparison.removedCollectionErrors.map((id) => `  - ${id}`));
  }

  if (!comparison.ok) {
    const removals = comparison.removedFailures.length + comparison.removedCollectionErrors.length;
    lines.push('', `baseline: ${baselinePath}`);
    if (removals > 0) {
      lines.push(
        `This PR removes ${removals} known failure(s): regenerate the baseline with \`${UPDATE_HINT}\``,
        'and commit it here, otherwise a future regression of those tests would stay invisible in it.',
      );
    }
  }

  lines.push('', comparison.ok ? 'PARITY OK' : 'PARITY VIOLATED');
  return lines.join('\n');
}

export function buildBaseline({ current, revision, previous = {}, now = new Date() }) {
  return {
    revision,
    recordedAt: now.toISOString().slice(0, 10),
    issue: 1076,
    notes:
      'Known-failing dashboard tests at `revision`. Exact parity is enforced by ' +
      'scripts/check-dashboard-failure-parity.mjs: no new failure is allowed, and every entry here ' +
      'must still be failing. Regenerate with `pnpm run test:dashboard:parity:update` whenever a fix ' +
      'lands or a batch of dead specs is deleted.',
    totals: current.totals,
    collectionErrors: current.collectionErrors,
    failures: current.failures,
    flaky: previous.flaky ?? {},
  };
}

function runSuite(reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  const vitest = join(DASHBOARD_DIR, 'node_modules/.bin/vitest');
  if (!existsSync(vitest)) {
    console.error(`parity gate: ${vitest} not found - run pnpm install first`);
    process.exit(2);
  }
  const run = spawnSync(vitest, ['run', '--reporter=json', `--outputFile=${reportPath}`], {
    cwd: DASHBOARD_DIR,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (!existsSync(reportPath)) {
    console.error(`parity gate: the suite produced no report (exit ${run.status})`);
    process.exit(2);
  }
}

function readJson(path, label) {
  if (!existsSync(path)) {
    console.error(`${label} not found: ${path}`);
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`${label} is not valid JSON: ${path} (${error.message})`);
    process.exit(2);
  }
}

function currentRevision() {
  const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return rev.status === 0 ? rev.stdout.trim() : 'unknown';
}

function parseArgs(argv) {
  const args = { report: DEFAULT_REPORT, baseline: DEFAULT_BASELINE, update: false, revision: null, run: true };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--report') { args.report = resolve(argv[++i] ?? ''); args.run = false; }
    else if (flag === '--baseline') args.baseline = resolve(argv[++i] ?? '');
    else if (flag === '--revision') args.revision = argv[++i] ?? null;
    else if (flag === '--update') args.update = true;
    else if (flag === '--help' || flag === '-h') { console.log('usage: node scripts/check-dashboard-failure-parity.mjs [--report <file>] [--baseline <file>] [--update] [--revision <sha>]'); process.exit(0); }
    else { console.error(`parity gate: unknown argument ${flag}`); process.exit(2); }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.run) runSuite(args.report);

  const report = readJson(args.report, 'report');
  const current = parseReport(report);

  if (args.update) {
    const previous = existsSync(args.baseline) ? readJson(args.baseline, 'baseline') : {};
    const next = buildBaseline({ current, revision: args.revision ?? currentRevision(), previous });
    mkdirSync(dirname(args.baseline), { recursive: true });
    writeFileSync(args.baseline, `${JSON.stringify(next, null, 2)}\n`);
    console.log(
      `baseline updated: ${current.failures.length} failing tests, ` +
        `${current.totals.collectionErrors} collection error(s), revision ${next.revision}`,
    );
    console.log(`  ${args.baseline}`);
    process.exit(0);
  }

  const baseline = readJson(args.baseline, 'baseline');
  const comparison = compareReports(baseline, current);
  console.log(formatComparison(comparison, { baselinePath: args.baseline }));
  process.exit(comparison.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2));
}
