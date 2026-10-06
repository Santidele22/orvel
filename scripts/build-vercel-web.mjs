#!/usr/bin/env node
/**
 * Fase 4 of #1098 / ADR 0012 — the standalone artifact of the operator console.
 *
 * `scripts/build-vercel.mjs` builds the *combined* deployment: the landing's Astro output, with the
 * PWA's dist copied inside it and the `/dashboard/*`, `/booking/*` and share-preview rewrites
 * patched in. The console is its own origin and its own Vercel project, so it needs the opposite
 * artifact: an Angular SPA served from the root, with none of the landing's rewrites.
 *
 * Nothing here deploys. It emits a Vercel Build Output (`.vercel/output`) at the repository root,
 * which is where `vercel deploy` (without `--prebuilt`) reads it from, exactly like the combined
 * build does. The Vercel project for this target must run this script as its build command.
 *
 * The build steps are invoked directly (`node <ng entry>`) instead of through `pnpm run build`, so
 * the script runs in any environment that has the workspace installed — including the agent
 * sandbox, where pnpm cannot write its global lockfile.
 *
 * Usage: node scripts/build-vercel-web.mjs
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WEB_CONSOLE_HOSTING_ROUTES, patchVercelOutputConfig } from './vercel-output-config.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const webDir = join(rootDir, 'apps', 'dashboard-web');
const generateEnvScript = join(rootDir, 'apps', 'dashboard', 'scripts', 'generate-dashboard-env.mjs');
const ngEntry = join(webDir, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const webBrowserDir = join(webDir, 'dist', 'orvel-dashboard-web', 'browser');
const webOutputDir = join(webDir, '.vercel', 'output');
const webStaticDir = join(webOutputDir, 'static');
const outputConfigPath = join(webOutputDir, 'config.json');
const rootOutputDir = join(rootDir, '.vercel', 'output');

/** The console is served from the root of its own origin, so its runtime env lives at `/`. */
const RUNTIME_ENV_SCRIPT_SRC = '/runtime-env.js';

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

/**
 * Bake the environment the console reads at runtime.
 *
 * The web app resolves env through the shared core, which prefers `window.__ORVEL_DASHBOARD_ENV__`
 * over the build-time generated module. Injecting it keeps one artifact per environment and lets a
 * promoted build read the values of the origin it is serving, which is what the combined build
 * does for the PWA. No `VAPID_PUBLIC_KEY`: this target has no web push.
 */
async function writeConsoleRuntimeEnv(browserDir) {
  const runtimeEnv = {
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL ?? '',
    PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
    PUBLIC_LANDING_URL: process.env.PUBLIC_LANDING_URL ?? process.env.PUBLIC_DASHBOARD_URL ?? ''
  };

  await writeFile(
    join(browserDir, 'runtime-env.js'),
    `window.__ORVEL_DASHBOARD_ENV__=${JSON.stringify(runtimeEnv)};\n`
  );

  const indexPath = join(browserDir, 'index.html');
  const html = await readFile(indexPath, 'utf8');

  if (html.includes(`src="${RUNTIME_ENV_SCRIPT_SRC}"`)) {
    return;
  }

  if (!/<head[^>]*>/i.test(html)) {
    throw new Error('Console index.html is missing <head>; cannot inject runtime-env.js');
  }

  await writeFile(
    indexPath,
    html.replace(/<head([^>]*)>/i, `<head$1><script src="${RUNTIME_ENV_SCRIPT_SRC}"></script>`)
  );
}

async function writeConsoleOutputConfig() {
  const config = patchVercelOutputConfig(
    { version: 3, routes: [{ handle: 'filesystem' }] },
    {
      supabaseOrigin: process.env.PUBLIC_SUPABASE_URL ?? '',
      hostingRoutes: WEB_CONSOLE_HOSTING_ROUTES
    }
  );

  await writeFile(outputConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function main() {
  for (const required of [generateEnvScript, ngEntry]) {
    if (!existsSync(required)) {
      throw new Error(`Missing build prerequisite: ${required}. Run the workspace install first.`);
    }
  }

  await rm(join(webDir, 'dist'), { recursive: true, force: true });
  await run(process.execPath, [generateEnvScript, '--production']);
  await run(process.execPath, [ngEntry, 'build'], { cwd: webDir });

  if (!existsSync(webBrowserDir)) {
    throw new Error(`Console browser output not found at ${webBrowserDir}`);
  }

  await writeConsoleRuntimeEnv(webBrowserDir);

  await rm(webOutputDir, { recursive: true, force: true });
  await mkdir(webStaticDir, { recursive: true });
  await cp(webBrowserDir, webStaticDir, { recursive: true });
  await writeConsoleOutputConfig();

  await rm(rootOutputDir, { recursive: true, force: true });
  await mkdir(dirname(rootOutputDir), { recursive: true });
  await cp(webOutputDir, rootOutputDir, { recursive: true });

  console.log(`Console artifact written to ${rootOutputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
