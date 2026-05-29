import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const landingDir = join(rootDir, 'apps', 'landing');
const dashboardDir = join(rootDir, 'apps', 'dashboard');
const landingOutputDir = join(landingDir, '.vercel', 'output');
const dashboardBrowserDir = join(dashboardDir, 'dist', 'salon-de-belleza', 'browser');
const dashboardStaticDir = join(landingOutputDir, 'static', 'dashboard');
const outputConfigPath = join(landingOutputDir, 'config.json');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function patchVercelOutputConfig() {
  const rawConfig = await readFile(outputConfigPath, 'utf8');
  const config = JSON.parse(rawConfig);
  const dashboardRewrite = { src: '/dashboard(?:/.*)?', dest: '/dashboard/index.html' };
  const existingRoutes = Array.isArray(config.routes) ? config.routes : [];
  const withoutDashboardRewrite = existingRoutes.filter(
    (route) => !(route?.src === dashboardRewrite.src && route?.dest === dashboardRewrite.dest)
  );
  const filesystemIndex = withoutDashboardRewrite.findIndex((route) => route?.handle === 'filesystem');

  config.routes =
    filesystemIndex >= 0
      ? [
          ...withoutDashboardRewrite.slice(0, filesystemIndex + 1),
          dashboardRewrite,
          ...withoutDashboardRewrite.slice(filesystemIndex + 1)
        ]
      : [{ handle: 'filesystem' }, dashboardRewrite, ...withoutDashboardRewrite];

  await writeFile(outputConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function main() {
  await rm(join(dashboardDir, 'dist'), { recursive: true, force: true });
  await run('bun', ['run', '--cwd', 'apps/dashboard', 'build', '--', '--base-href', '/', '--deploy-url', '/dashboard/']);

  if (!existsSync(dashboardBrowserDir)) {
    throw new Error(`Dashboard browser output not found at ${dashboardBrowserDir}`);
  }

  await run('pnpm', ['--dir', 'apps/landing', 'run', 'build']);

  await rm(dashboardStaticDir, { recursive: true, force: true });
  await mkdir(dashboardStaticDir, { recursive: true });
  await cp(dashboardBrowserDir, dashboardStaticDir, { recursive: true });
  await patchVercelOutputConfig();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
