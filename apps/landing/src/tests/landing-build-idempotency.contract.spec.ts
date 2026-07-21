import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { withBuildLock } from '../../scripts/build-lock.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = resolve(__dirname, '..', '..');

describe('landing build idempotency contract', () => {
  it('runs clean and Astro build inside one bounded cross-process lock', async () => {
    const packageJson = JSON.parse(await readFile(resolve(landingRoot, 'package.json'), 'utf8'));
    const cleanScript = await readFile(resolve(landingRoot, 'scripts', 'clean-build-output.mjs'), 'utf8');
    const buildScript = await readFile(resolve(landingRoot, 'scripts', 'build-with-lock.mjs'), 'utf8');

    expect(packageJson.scripts.prebuild).toBeUndefined();
    expect(packageJson.scripts.build).toBe('node ./scripts/build-with-lock.mjs');
    expect(cleanScript).toContain("'dist'");
    expect(cleanScript).toContain("'.vercel/output'");
    expect(cleanScript).toContain('rm(');
    expect(cleanScript).not.toMatch(/rm\s*\([^)]*force:\s*false/);
    expect(buildScript).toContain('withBuildLock');
    expect(buildScript).toContain("spawn('astro', ['build']");
  });

  it('publishes wrapper and active child process-group ownership', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orvel-landing-lock-owner-'));
    const lockDirectory = resolve(directory, 'build.lock');
    try {
      await withBuildLock(async (ownership) => {
        await ownership.setActiveChild({ pid: 424_242, processGroupId: 424_242 });
        const owner = JSON.parse(await readFile(resolve(lockDirectory, 'owner.json'), 'utf8'));
        expect(owner.wrapperPid).toBe(process.pid);
        expect(owner.activeChild).toEqual({ pid: 424_242, processGroupId: 424_242 });
      }, { lockDirectory });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serializes two independent processes and cleans the lock', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orvel-landing-lock-'));
    const lockDirectory = resolve(directory, 'build.lock');
    const events = resolve(directory, 'events.log');
    const moduleUrl = new URL('../../scripts/build-lock.mjs', import.meta.url).href;
    const worker = resolve(directory, 'worker.mjs');
    await writeFile(worker, `import { appendFile } from 'node:fs/promises';\nimport { withBuildLock } from ${JSON.stringify(moduleUrl)};\nconst [lock, log, name, hold] = process.argv.slice(2);\nawait withBuildLock(async () => { await appendFile(log, name + ':start\\n'); await new Promise(r => setTimeout(r, Number(hold))); await appendFile(log, name + ':end\\n'); }, { lockDirectory: lock, timeoutMs: 5000, pollMs: 20 });\n`);
    const run = (name: string, hold: string) => new Promise<void>((resolvePromise, reject) => {
      const child = spawn(process.execPath, [worker, lockDirectory, events, name, hold], { stdio: 'pipe' });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${name} exited ${code}`)));
    });
    try {
      await Promise.all([run('first', '200'), run('second', '20')]);
      const lines = (await readFile(events, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(4);
      expect(lines[0].split(':')[1]).toBe('start');
      expect(lines[1]).toBe(`${lines[0].split(':')[0]}:end`);
      expect(lines[2].split(':')[1]).toBe('start');
      expect(lines[3]).toBe(`${lines[2].split(':')[0]}:end`);
      await expect(readFile(resolve(lockDirectory, 'owner.json'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails within the configured bound when a live process owns the lock', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orvel-landing-lock-timeout-'));
    const lockDirectory = resolve(directory, 'build.lock');
    await mkdir(lockDirectory);
    await writeFile(resolve(lockDirectory, 'owner.json'), JSON.stringify({ wrapperPid: process.pid, token: 'live' }));
    const startedAt = Date.now();
    try {
      await expect(withBuildLock(() => Promise.resolve(), {
        lockDirectory,
        timeoutMs: 60,
        pollMs: 10,
        staleMs: 1,
      })).rejects.toThrow(/Timed out waiting 60ms/);
      expect(Date.now() - startedAt).toBeLessThan(500);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps an orphaned wrapper lock while its child group lives, then recovers it after child death', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orvel-landing-lock-orphan-'));
    const lockDirectory = resolve(directory, 'build.lock');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
    child.unref();
    await mkdir(lockDirectory);
    await writeFile(resolve(lockDirectory, 'owner.json'), JSON.stringify({
      wrapperPid: 2_147_483_647,
      activeChild: { pid: child.pid, processGroupId: child.pid },
      token: 'orphan-with-live-child',
    }));
    try {
      await expect(withBuildLock(() => Promise.resolve(), {
        lockDirectory, timeoutMs: 80, pollMs: 10, staleMs: 1,
      })).rejects.toThrow(/Timed out waiting 80ms/);
      expect(JSON.parse(await readFile(resolve(lockDirectory, 'owner.json'), 'utf8')).token)
        .toBe('orphan-with-live-child');

      process.kill(-child.pid!, 'SIGKILL');
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          process.kill(child.pid!, 0);
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
        } catch { break; }
      }
      await withBuildLock(() => Promise.resolve(), {
        lockDirectory, timeoutMs: 1_000, pollMs: 10, staleMs: 1,
      });
      await expect(readFile(resolve(lockDirectory, 'owner.json'), 'utf8')).rejects.toThrow();
    } finally {
      try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already dead */ }
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serializes stale takeover contenders and never deletes a newly acquired token', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orvel-landing-lock-stale-race-'));
    const lockDirectory = resolve(directory, 'build.lock');
    await mkdir(lockDirectory);
    await writeFile(resolve(lockDirectory, 'owner.json'), JSON.stringify({
      wrapperPid: 2_147_483_647,
      token: 'observed-stale-token',
    }));

    let observedCount = 0;
    let settleCount = 0;
    let callbackEntries = 0;
    let activeCallbacks = 0;
    let maximumActiveCallbacks = 0;
    let releaseObserved!: () => void;
    let releaseFirstOwner!: () => void;
    let releaseFirstOwnerStarted!: () => void;
    const allObserved = new Promise<void>((resolvePromise) => { releaseObserved = resolvePromise; });
    const firstOwnerRelease = new Promise<void>((resolvePromise) => { releaseFirstOwner = resolvePromise; });
    const firstOwnerStarted = new Promise<void>((resolvePromise) => { releaseFirstOwnerStarted = resolvePromise; });
    let releaseRecoveryAttemptsSettled!: () => void;
    const allRecoveryAttemptsSettled = new Promise<void>((resolvePromise) => {
      releaseRecoveryAttemptsSettled = resolvePromise;
    });
    const options = {
      lockDirectory,
      timeoutMs: 2_000,
      pollMs: 5,
      staleMs: 1,
      recoveryStaleMs: 50,
      async onStaleOwnerObserved() {
        observedCount += 1;
        if (observedCount === 2) releaseObserved();
        await allObserved;
      },
      onStaleRecoverySettled() {
        settleCount += 1;
        if (settleCount === 2) releaseRecoveryAttemptsSettled();
      },
    };
    const run = () => withBuildLock(async () => {
      callbackEntries += 1;
      const callbackEntry = callbackEntries;
      activeCallbacks += 1;
      maximumActiveCallbacks = Math.max(maximumActiveCallbacks, activeCallbacks);
      if (callbackEntry === 1) {
        releaseFirstOwnerStarted();
        await firstOwnerRelease;
      }
      activeCallbacks -= 1;
    }, options);

    try {
      const contenders = [run(), run()];
      await Promise.all([allRecoveryAttemptsSettled, firstOwnerStarted]);
      const newOwner = JSON.parse(await readFile(resolve(lockDirectory, 'owner.json'), 'utf8'));
      expect(newOwner.token).not.toBe('observed-stale-token');
      expect(activeCallbacks).toBe(1);
      expect(maximumActiveCallbacks).toBe(1);
      releaseFirstOwner();
      await Promise.all(contenders);
      expect(maximumActiveCallbacks).toBe(1);
    } finally {
      releaseObserved();
      releaseFirstOwner();
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 });
    }
  });

  it('recovers bounded stale recovery ownership after its process dies', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orvel-landing-lock-recovery-owner-'));
    const lockDirectory = resolve(directory, 'build.lock');
    const recoveryReady = resolve(directory, 'recovery-ready');
    const worker = resolve(directory, 'recovery-worker.mjs');
    const moduleUrl = new URL('../../scripts/build-lock.mjs', import.meta.url).href;
    await mkdir(lockDirectory);
    await writeFile(resolve(lockDirectory, 'owner.json'), JSON.stringify({
      wrapperPid: 2_147_483_647,
      token: 'stale-before-recovery-crash',
    }));
    await writeFile(worker, `import { writeFile } from 'node:fs/promises';\nimport { withBuildLock } from ${JSON.stringify(moduleUrl)};\nawait withBuildLock(() => Promise.resolve(), { lockDirectory: ${JSON.stringify(lockDirectory)}, timeoutMs: 5000, pollMs: 5, recoveryStaleMs: 20, onRecoveryLeaseAcquired: async () => { await writeFile(${JSON.stringify(recoveryReady)}, 'ready'); await new Promise(() => {}); } });\n`);
    const crashedRecovery = spawn(process.execPath, [worker], { stdio: 'pipe' });
    try {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if (await readFile(recoveryReady, 'utf8').then(() => true).catch(() => false)) break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      }
      await expect(readFile(recoveryReady, 'utf8')).resolves.toBe('ready');
      crashedRecovery.kill('SIGKILL');
      for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
          process.kill(crashedRecovery.pid!, 0);
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
        } catch { break; }
      }
      expect(() => process.kill(crashedRecovery.pid!, 0)).toThrow();

      let entered = false;
      await withBuildLock(() => { entered = true; }, {
        lockDirectory,
        timeoutMs: 1_000,
        pollMs: 5,
        recoveryStaleMs: 20,
      });
      expect(entered).toBe(true);
    } finally {
      crashedRecovery.kill('SIGKILL');
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 });
    }
  });

  it('terminates and waits for the active child group before releasing the lock on SIGTERM', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orvel-landing-lock-signal-'));
    const lockDirectory = resolve(directory, 'build.lock');
    const moduleUrl = new URL('../../scripts/build-lock.mjs', import.meta.url).href;
    const worker = resolve(directory, 'signal-worker.mjs');
    await writeFile(worker, `import { spawn } from 'node:child_process';\nimport { withBuildLock } from ${JSON.stringify(moduleUrl)};\nawait withBuildLock(async (ownership) => { const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }); await ownership.setActiveChild({ pid: child.pid, processGroupId: child.pid }); await ownership.waitForSignalsAndChild(child); }, { lockDirectory: ${JSON.stringify(lockDirectory)} });\n`);
    const wrapper = spawn(process.execPath, [worker], { stdio: 'pipe' });
    try {
      let owner: { activeChild?: { pid: number; processGroupId: number } } | undefined;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        owner = await readFile(resolve(lockDirectory, 'owner.json'), 'utf8').then(JSON.parse).catch(() => undefined);
        if (owner?.activeChild) break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      }
      expect(owner?.activeChild?.processGroupId).toBeGreaterThan(0);
      wrapper.kill('SIGTERM');
      const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => {
        wrapper.once('exit', (code, signal) => resolvePromise({ code, signal }));
      });
      expect(exit.code).not.toBe(0);
      expect(() => process.kill(owner!.activeChild!.pid, 0)).toThrow();
      await expect(readFile(resolve(lockDirectory, 'owner.json'), 'utf8')).rejects.toThrow();
    } finally {
      wrapper.kill('SIGKILL');
      await rm(directory, { recursive: true, force: true });
    }
  });
});
