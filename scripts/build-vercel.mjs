import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { patchVercelOutputConfig } from './vercel-output-config.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const landingDir = join(rootDir, 'apps', 'landing');
const dashboardDir = join(rootDir, 'apps', 'dashboard');
const landingOutputDir = join(landingDir, '.vercel', 'output');
const rootOutputDir = join(rootDir, '.vercel', 'output');
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

async function writeDashboardRuntimeEnv(browserDir) {
  const runtimeEnv = {
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL ?? '',
    PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
    PUBLIC_LANDING_URL: process.env.PUBLIC_LANDING_URL ?? process.env.PUBLIC_DASHBOARD_URL ?? '',
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? ''
  };

  await writeFile(
    join(browserDir, 'runtime-env.js'),
    `window.__ORVEL_DASHBOARD_ENV__=${JSON.stringify(runtimeEnv)};\n`
  );

  const indexPath = join(browserDir, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  if (html.includes('src="/dashboard/runtime-env.js"')) {
    return;
  }

  if (!/<head[^>]*>/i.test(html)) {
    throw new Error('Dashboard index.html is missing <head>; cannot inject runtime-env.js');
  }

  await writeFile(
    indexPath,
    html.replace(/<head([^>]*)>/i, '<head$1><script src="/dashboard/runtime-env.js"></script>')
  );
}

async function writePatchedVercelOutputConfig() {
  const rawConfig = await readFile(outputConfigPath, 'utf8');
  const config = patchVercelOutputConfig(JSON.parse(rawConfig));
  await writeFile(outputConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

function loadEsbuild() {
  try {
    const requireFromLanding = createRequire(join(landingDir, 'package.json'));
    const astroPackageJson = requireFromLanding.resolve('astro/package.json');
    const vitePackageJson = createRequire(astroPackageJson).resolve('vite/package.json');
    const esbuild = createRequire(vitePackageJson)('esbuild');
    if (typeof esbuild.build !== 'function') {
      throw new Error('esbuild.build is not a function');
    }
    return esbuild;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load esbuild via landing vite: ${detail}`);
  }
}

async function emitBookingShareEdgeFunction() {
  const funcDir = join(landingOutputDir, 'functions', 'booking-share.func');
  await mkdir(funcDir, { recursive: true });
  const esbuild = loadEsbuild();
  await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: [join(landingDir, 'src', 'edge', 'booking-share.ts')],
    bundle: true,
    format: 'esm',
    outfile: join(funcDir, 'index.js'),
    platform: 'neutral',
    target: 'es2022',
    legalComments: 'none'
  });
  const vcConfig = { runtime: 'edge', entrypoint: 'index.js' };
  await writeFile(join(funcDir, '.vc-config.json'), `${JSON.stringify(vcConfig)}\n`);
}

async function main() {
  await rm(join(dashboardDir, 'dist'), { recursive: true, force: true });
  await run('pnpm', ['--dir', 'apps/dashboard', 'run', 'build', '--base-href', '/', '--deploy-url', '/dashboard/']);

  if (!existsSync(dashboardBrowserDir)) {
    throw new Error(`Dashboard browser output not found at ${dashboardBrowserDir}`);
  }

  await writeDashboardRuntimeEnv(dashboardBrowserDir);

  await run('pnpm', ['--dir', 'apps/landing', 'run', 'build']);

  await rm(dashboardStaticDir, { recursive: true, force: true });
  await mkdir(dashboardStaticDir, { recursive: true });
  await cp(dashboardBrowserDir, dashboardStaticDir, { recursive: true });
  await writePatchedVercelOutputConfig();
      await emitBookingShareEdgeFunction();

  await rm(rootOutputDir, { recursive: true, force: true });
  await mkdir(dirname(rootOutputDir), { recursive: true });
  await cp(landingOutputDir, rootOutputDir, { recursive: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
