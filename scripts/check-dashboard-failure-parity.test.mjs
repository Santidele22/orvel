import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compareReports,
  formatComparison,
  normalizeFile,
  parseReport,
} from './check-dashboard-failure-parity.mjs';

const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), 'check-dashboard-failure-parity.mjs');

const COLLECTION_ERROR_REPORT = {
  numTotalTests: 3,
  numPassedTests: 2,
  numFailedTests: 1,
  numPendingTests: 0,
  success: false,
  testResults: [
    {
      name: '/home/runner/work/orvel/orvel/apps/dashboard/src/app/a.spec.ts',
      status: 'failed',
      assertionResults: [
        { fullName: 'a > fails', status: 'failed' },
        { fullName: 'a > passes', status: 'passed' },
      ],
    },
    {
      name: '/home/runner/work/orvel/orvel/apps/dashboard/src/app/b.spec.ts',
      status: 'failed',
      message: '[vitest] No "X" export is defined on the mock.\nsecond line',
      assertionResults: [{ fullName: 'b > skipped', status: 'skipped' }],
    },
  ],
};

function reportWith(failures, { collectionErrors = [] } = {}) {
  return {
    numTotalTests: failures.length + 1,
    numPassedTests: 1,
    numFailedTests: failures.length,
    numPendingTests: 0,
    success: failures.length === 0,
    testResults: [
      {
        name: '/home/runner/work/orvel/orvel/apps/dashboard/src/app/a.spec.ts',
        status: failures.length ? 'failed' : 'passed',
        assertionResults: [
          ...failures.map((fullName) => ({ fullName, status: 'failed' })),
          { fullName: 'a > passes', status: 'passed' },
        ],
      },
      ...collectionErrors.map((file) => ({
        name: `/home/runner/work/orvel/orvel/apps/dashboard/${file}`,
        status: 'failed',
        message: 'boom\nsecond line',
        assertionResults: [],
      })),
    ],
  };
}

const baseline = {
  revision: 'deadbee',
  failures: ['src/app/a.spec.ts :: a > fails'],
  collectionErrors: { 'src/app/b.spec.ts': 'boom' },
  flaky: { 'src/app/a.spec.ts :: a > flaky': 'clock-dependent by design' },
};

test('normalizeFile strips everything up to apps/dashboard and leaves relative paths alone', () => {
  assert.equal(
    normalizeFile('/home/runner/work/orvel/orvel/apps/dashboard/src/app/a.spec.ts'),
    'src/app/a.spec.ts',
  );
  assert.equal(normalizeFile('/home/aegir/orvel/apps/dashboard/src/app/tests/unit/x.spec.ts'), 'src/app/tests/unit/x.spec.ts');
  assert.equal(normalizeFile('src/app/a.spec.ts'), 'src/app/a.spec.ts');
});

test('parseReport extracts failing tests, collection errors and totals', () => {
  const parsed = parseReport(COLLECTION_ERROR_REPORT);

  assert.deepEqual(parsed.failures, ['src/app/a.spec.ts :: a > fails']);
  assert.deepEqual(parsed.collectionErrors, {
    'src/app/b.spec.ts': '[vitest] No "X" export is defined on the mock.',
  });
  assert.deepEqual(parsed.totals, {
    tests: 3,
    passed: 2,
    failed: 1,
    skipped: 0,
    collectionErrors: 1,
  });
});

test('parseReport tolerates a suite where nothing fails', () => {
  const parsed = parseReport(reportWith([]));

  assert.deepEqual(parsed.failures, []);
  assert.deepEqual(parsed.collectionErrors, {});
});

test('compareReports reports parity when the failing set is identical', () => {
  const current = parseReport(reportWith(['a > fails'], { collectionErrors: ['src/app/b.spec.ts'] }));
  const cmp = compareReports(baseline, current);

  assert.equal(cmp.ok, true);
  assert.deepEqual(cmp.newFailures, []);
  assert.deepEqual(cmp.removedFailures, []);
  assert.deepEqual(cmp.newCollectionErrors, []);
  assert.deepEqual(cmp.removedCollectionErrors, []);
});

test('compareReports fails on a new failing test and on a new collection error', () => {
  const current = parseReport(
    reportWith(['a > fails', 'a > regressed'], { collectionErrors: ['src/app/b.spec.ts', 'src/app/c.spec.ts'] }),
  );
  const cmp = compareReports(baseline, current);

  assert.equal(cmp.ok, false);
  assert.deepEqual(cmp.newFailures, ['src/app/a.spec.ts :: a > regressed']);
  assert.deepEqual(cmp.newCollectionErrors, ['src/app/c.spec.ts']);
});

test('compareReports treats a fixed test as a stale baseline entry until the baseline is updated', () => {
  const current = parseReport(reportWith([], { collectionErrors: [] }));
  const cmp = compareReports(baseline, current);

  assert.equal(cmp.ok, false);
  assert.deepEqual(cmp.removedFailures, ['src/app/a.spec.ts :: a > fails']);
  assert.deepEqual(cmp.removedCollectionErrors, ['src/app/b.spec.ts']);
});

test('compareReports ignores tests listed as flaky on either side of the comparison', () => {
  const flakyBaseline = { ...baseline, failures: [...baseline.failures, 'src/app/a.spec.ts :: a > flaky'] };
  const current = parseReport(reportWith(['a > fails'], { collectionErrors: ['src/app/b.spec.ts'] }));

  const cmp = compareReports(flakyBaseline, current);

  assert.equal(cmp.ok, true);
  assert.deepEqual(cmp.removedFailures, []);
});

test('formatComparison names the failures, the remedy and the update command', () => {
  const current = parseReport(reportWith(['a > fails', 'a > regressed']));
  const text = formatComparison(compareReports(baseline, current), { baselinePath: 'scripts/fixtures/x.json' });

  assert.match(text, /NEW failing tests \(1\)/);
  assert.match(text, /a > regressed/);
  assert.match(text, /test:dashboard:parity:update/);
  assert.match(text, /scripts\/fixtures\/x\.json/);
});

test('CLI: exits 0 on parity, 1 on a new failure, and --update rewrites the baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  try {
    const baselinePath = join(dir, 'baseline.json');
    const reportPath = join(dir, 'report.json');
    writeFileSync(baselinePath, JSON.stringify(baseline));
    writeFileSync(reportPath, JSON.stringify(reportWith(['a > fails'], { collectionErrors: ['src/app/b.spec.ts'] })));

    const ok = execFileSync('node', [CLI_PATH, '--report', reportPath, '--baseline', baselinePath], {
      encoding: 'utf8',
    });
    assert.match(ok, /PARITY OK/);

    writeFileSync(reportPath, JSON.stringify(reportWith(['a > fails', 'a > regressed'], { collectionErrors: ['src/app/b.spec.ts'] })));
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--report', reportPath, '--baseline', baselinePath], { encoding: 'utf8' }),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stdout, /PARITY VIOLATED/);
        return true;
      },
    );

    execFileSync('node', [CLI_PATH, '--update', '--report', reportPath, '--baseline', baselinePath, '--revision', 'cafe123'], {
      encoding: 'utf8',
    });
    const updated = JSON.parse(readFileSync(baselinePath, 'utf8'));
    assert.equal(updated.revision, 'cafe123');
    assert.deepEqual(updated.failures, ['src/app/a.spec.ts :: a > fails', 'src/app/a.spec.ts :: a > regressed']);
    assert.deepEqual(updated.collectionErrors, { 'src/app/b.spec.ts': 'boom' });
    assert.equal(updated.totals.failed, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: rejects a missing baseline or report with a clear message', () => {
  assert.throws(
    () => execFileSync('node', [CLI_PATH, '--report', 'does-not-exist.json', '--baseline', 'also-missing.json'], {
      encoding: 'utf8',
    }),
    (error) => {
      assert.equal(error.status, 2);
      assert.match(error.stderr, /baseline not found|report not found/);
      return true;
    },
  );
});

test('the committed baseline matches this repository and is well formed', () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dashboard-failure-baseline.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));

  assert.equal(typeof data.revision, 'string');
  assert.ok(Array.isArray(data.failures) && data.failures.length > 0);
  assert.equal(Object.getPrototypeOf(data.flaky), Object.prototype, 'flaky must be an object map of id -> reason');
  for (const [id, reason] of Object.entries(data.flaky)) {
    assert.match(id, /^src\/.+ :: .+/);
    assert.ok(reason.length > 10, `flaky entry ${id} must record why`);
  }
  for (const id of data.failures) {
    assert.match(id, /^src\/.+ :: .+/, `failure id must be "<file> :: <test>", got ${id}`);
    assert.ok(!id.startsWith('/'), `failure id must be repo-relative, got ${id}`);
  }
  assert.deepEqual([...data.failures].sort(), data.failures, 'failures must be sorted for stable diffs');
});
