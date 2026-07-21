import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function processGroupIsAlive(processGroupId) {
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) return false;
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function ownerIsAlive(owner) {
  return processIsAlive(owner?.wrapperPid)
    || processIsAlive(owner?.activeChild?.pid)
    || processGroupIsAlive(owner?.activeChild?.processGroupId);
}

async function writeOwner(lockDirectory, owner, token) {
  const ownerPath = resolve(lockDirectory, 'owner.json');
  const temporaryPath = resolve(lockDirectory, `owner.${token}.tmp`);
  await writeFile(temporaryPath, JSON.stringify(owner), { mode: 0o600 });
  await rename(temporaryPath, ownerPath);
}

async function quarantineAndRemove(lockDirectory) {
  const quarantineDirectory = `${lockDirectory}.quarantine-${randomUUID()}`;
  try {
    await rename(lockDirectory, quarantineDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  await rm(quarantineDirectory, { recursive: true, force: true });
  return true;
}

async function readLockSnapshot(lockDirectory) {
  const [rawOwner, lockStat] = await Promise.all([
    readFile(resolve(lockDirectory, 'owner.json'), 'utf8'),
    stat(lockDirectory),
  ]);
  const owner = JSON.parse(rawOwner);
  const identity = typeof owner.token === 'string'
    ? `token:${owner.token}`
    : `inode:${lockStat.ino}:${lockStat.mtimeMs}:${rawOwner}`;
  return { identity, owner };
}

async function acquireRecoveryLease(lockDirectory, staleIdentity, options) {
  const recoveryKey = createHash('sha256').update(staleIdentity).digest('hex').slice(0, 24);
  const recoveryDirectory = `${lockDirectory}.recovery-${recoveryKey}`;
  const completedPath = resolve(recoveryDirectory, 'completed');
  await mkdir(recoveryDirectory, { recursive: true });

  while (Date.now() < options.deadline) {
    if (await stat(completedPath).then(() => true).catch(() => false)) return null;
    const generations = (await readdir(recoveryDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^generation-\d{10}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const latest = generations.at(-1);
    let nextGeneration = 1;
    if (latest) {
      nextGeneration = Number(latest.slice('generation-'.length)) + 1;
      const generationDirectory = resolve(recoveryDirectory, latest);
      const recoveryOwner = await readFile(resolve(generationDirectory, 'owner.json'), 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      if (processIsAlive(recoveryOwner?.pid)) {
        await sleep(options.pollMs);
        continue;
      }
      if (!recoveryOwner) {
        const generationStat = await stat(generationDirectory).catch(() => null);
        if (generationStat && Date.now() - generationStat.mtimeMs < options.recoveryStaleMs) {
          await sleep(options.pollMs);
          continue;
        }
      }
    }

    const generationName = `generation-${String(nextGeneration).padStart(10, '0')}`;
    const generationDirectory = resolve(recoveryDirectory, generationName);
    try {
      await mkdir(generationDirectory);
      const recoveryToken = randomUUID();
      await writeFile(resolve(generationDirectory, 'owner.json'), JSON.stringify({
        pid: process.pid,
        token: recoveryToken,
        createdAt: new Date().toISOString(),
      }), { flag: 'wx', mode: 0o600 });
      return {
        async complete() {
          await writeFile(completedPath, JSON.stringify({ recoveryToken }), { flag: 'wx', mode: 0o600 })
            .catch((error) => { if (error?.code !== 'EEXIST') throw error; });
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Timed out waiting for landing build stale-recovery ownership');
}

async function removeStaleLock(lockDirectory, staleMs, options) {
  let observed;
  try {
    observed = await readLockSnapshot(lockDirectory);
    if (ownerIsAlive(observed.owner)) return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    const lockStat = await stat(lockDirectory).catch(() => null);
    if (lockStat && Date.now() - lockStat.mtimeMs < staleMs) return false;
    return false;
  }
  await options.onStaleOwnerObserved?.(observed);
  const lease = await acquireRecoveryLease(lockDirectory, observed.identity, options);
  try {
    if (!lease) return false;
    await options.onRecoveryLeaseAcquired?.();
    const current = await readLockSnapshot(lockDirectory).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (!current || current.identity !== observed.identity || ownerIsAlive(current.owner)) return false;
    return quarantineAndRemove(lockDirectory);
  } finally {
    await lease?.complete();
    options.onStaleRecoverySettled?.();
  }
}

export async function withBuildLock(callback, options = {}) {
  const lockDirectory = options.lockDirectory ?? resolve(process.cwd(), '.build-lock');
  const timeoutMs = options.timeoutMs ?? 240_000;
  const pollMs = options.pollMs ?? 100;
  const staleMs = options.staleMs ?? 600_000;
  const recoveryStaleMs = options.recoveryStaleMs ?? 30_000;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const token = randomUUID();

  while (true) {
    try {
      await mkdir(lockDirectory);
      try {
        await writeFile(resolve(lockDirectory, 'owner.json'), JSON.stringify({
          wrapperPid: process.pid,
          activeChild: null,
          token,
          createdAt: new Date().toISOString(),
        }), { flag: 'wx', mode: 0o600 });
      } catch (error) {
        await rm(lockDirectory, { recursive: true, force: true });
        throw error;
      }
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      await removeStaleLock(lockDirectory, staleMs, {
        deadline,
        pollMs,
        recoveryStaleMs,
        onStaleOwnerObserved: options.onStaleOwnerObserved,
        onRecoveryLeaseAcquired: options.onRecoveryLeaseAcquired,
        onStaleRecoverySettled: options.onStaleRecoverySettled,
      });
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting ${timeoutMs}ms for landing build lock`);
      }
      await sleep(pollMs);
    }
  }

  const ownership = {
    async setActiveChild(activeChild) {
      const owner = await readFile(resolve(lockDirectory, 'owner.json'), 'utf8').then(JSON.parse);
      if (owner.token !== token) throw new Error('Landing build lock ownership changed');
      await writeOwner(lockDirectory, { ...owner, activeChild }, token);
    },
    async waitForSignalsAndChild(child) {
      let receivedSignal;
      const forwardSignal = (signal) => {
        receivedSignal ??= signal;
        const processGroupId = child.pid;
        try { process.kill(-processGroupId, signal); } catch (error) {
          if (error?.code !== 'ESRCH') throw error;
        }
      };
      const onSigint = () => forwardSignal('SIGINT');
      const onSigterm = () => forwardSignal('SIGTERM');
      process.once('SIGINT', onSigint);
      process.once('SIGTERM', onSigterm);
      try {
        const result = await new Promise((resolvePromise, reject) => {
          child.once('error', reject);
          child.once('exit', (code, signal) => resolvePromise({ code, signal }));
        });
        if (receivedSignal) throw new Error(`Landing build interrupted by ${receivedSignal}`);
        if (result.code !== 0) throw new Error(`Astro build failed (${result.signal ?? result.code})`);
      } finally {
        process.off('SIGINT', onSigint);
        process.off('SIGTERM', onSigterm);
      }
    },
  };

  try {
    return await callback(ownership);
  } finally {
    const owner = await readFile(resolve(lockDirectory, 'owner.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    if (owner?.token === token) {
      await quarantineAndRemove(lockDirectory);
    }
  }
}
