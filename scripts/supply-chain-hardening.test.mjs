import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = new URL('..', import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);


async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, repoRoot), 'utf8'));
}

async function readText(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

function parseNpmrc(source) {
  const entries = new Map();

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    entries.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  return entries;
}

function getYamlObjectKeys(source, key) {
  const lines = source.split('\n');
  const sectionIndex = lines.findIndex((line) => line.trim() === `${key}:`);
  if (sectionIndex === -1) return [];

  const keys = [];
  for (const line of lines.slice(sectionIndex + 1)) {
    if (!line.trim()) continue;
    if (!line.startsWith('  ')) break;

    const match = line.match(/^\s{2}(['"]?)([^:'"]+)\1:\s*(.+)$/);
    if (match) keys.push(match[2]);
  }

  return keys;
}

function trackedPnpmLockfiles() {
  const tracked = spawnSync('git', ['ls-files', '--', 'pnpm-lock.yaml', 'apps/*/pnpm-lock.yaml'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
    },
  });

  assert.equal(tracked.status, 0, `Expected git ls-files to discover tracked pnpm lockfiles.\n${tracked.stderr}`);

  return tracked.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function trackedPnpmLockfileRoots() {
  return trackedPnpmLockfiles().map((lockfilePath) => dirname(lockfilePath) === '.' ? '.' : dirname(lockfilePath));
}

test('root package manager is pinned to pnpm', async () => {
  const rootPackage = await readJson('package.json');

  assert.match(
    rootPackage.packageManager ?? '',
    /^pnpm@\d+\.\d+\.\d+$/,
    'Root package.json must pin packageManager to an exact pnpm version.',
  );
});

test('checked-in install policy enables pnpm supply-chain hardening', async () => {
  assert.ok(
    existsSync(new URL('.npmrc', repoRoot)),
    'Expected a checked-in root .npmrc with pnpm hardening policy.',
  );

  const npmrc = parseNpmrc(await readText('.npmrc'));

  assert.equal(npmrc.get('save-exact'), 'true', 'Expected .npmrc to enforce save-exact=true.');
  assert.equal(npmrc.get('ignore-scripts'), 'true', 'Expected .npmrc to enforce ignore-scripts=true.');
  assert.equal(
    npmrc.get('strict-peer-dependencies'),
    'true',
    'Expected .npmrc to enforce strict-peer-dependencies=true.',
  );

  const minimumReleaseAge = Number(npmrc.get('minimum-release-age'));
  assert.ok(
    Number.isFinite(minimumReleaseAge) && minimumReleaseAge > 0,
    'Expected .npmrc to enforce minimum-release-age with a positive value.',
  );
});

test('pnpm workspace explicitly allow-lists native build dependencies', async () => {
  const workspace = await readText('pnpm-workspace.yaml');
  const approvedNativeBuilds = new Set([
    ...getYamlObjectKeys(workspace, 'allowBuilds'),
    ...getYamlObjectKeys(workspace, 'onlyBuiltDependencies'),
  ]);

  for (const dependency of ['@parcel/watcher', 'esbuild', 'lmdb', 'msgpackr-extract', 'sharp']) {
    assert.ok(
      approvedNativeBuilds.has(dependency),
      `Expected pnpm-workspace.yaml to explicitly allow native build dependency ${dependency}.`,
    );
  }
});

test('root exposes a production audit gate script', async () => {
  const rootPackage = await readJson('package.json');
  const scripts = rootPackage.scripts ?? {};
  const auditScript = Object.values(scripts).find(
    (script) => typeof script === 'string' && /pnpm\s+audit\s+--prod\b/.test(script),
  );

  assert.ok(
    auditScript,
    'Expected a root package.json script that runs the production dependency gate: pnpm audit --prod.',
  );
});

test('production dependency audit is green for every tracked pnpm lockfile root', { timeout: 180_000 }, () => {
  const lockfileRoots = trackedPnpmLockfileRoots();

  assert.ok(lockfileRoots.includes('.'), 'Expected the supply-chain gate to audit the root workspace.');
  assert.ok(
    lockfileRoots.includes('apps/landing'),
    'Expected the supply-chain gate to audit the tracked landing app-local pnpm lockfile root.',
  );

  const tempConfigDir = mkdtempSync(join(tmpdir(), 'orvel-pnpm-audit-'));
  const emptyUserConfig = join(tempConfigDir, 'npmrc');
  writeFileSync(emptyUserConfig, '', { mode: 0o600 });

  for (const root of lockfileRoots) {
    const audit = spawnSync('pnpm', ['audit', '--prod'], {
      cwd: join(repoRootPath, root),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: tempConfigDir,
        NPM_CONFIG_USERCONFIG: emptyUserConfig,
      },
      maxBuffer: 1024 * 1024 * 5,
    });

    assert.equal(
      audit.status,
      0,
      `Expected pnpm audit --prod to pass in ${root} with no production vulnerabilities after dependency updates.\n${audit.stdout}\n${audit.stderr}`,
    );
  }
});
