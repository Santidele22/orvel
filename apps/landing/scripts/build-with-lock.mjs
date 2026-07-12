import { spawn } from 'node:child_process';
import { cleanBuildOutput } from './clean-build-output.mjs';
import { withBuildLock } from './build-lock.mjs';

await withBuildLock(async (ownership) => {
  await cleanBuildOutput();
  const child = spawn('astro', ['build'], { detached: true, stdio: 'inherit' });
  await ownership.setActiveChild({ pid: child.pid, processGroupId: child.pid });
  await ownership.waitForSignalsAndChild(child);
});
