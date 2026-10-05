#!/usr/bin/env node
/**
 * Serves a built Orvel dashboard app over HTTP, for the e2e seam.
 *
 * Why a build and not `ng serve`: the service worker is only registered outside dev mode
 * (`provideServiceWorker(..., { enabled: !isDevMode() })`) and `ngsw-worker.js` is only emitted by a
 * production build. An install/manifest e2e against a dev server would assert nothing.
 *
 * The built dashboard expects to live under `/dashboard/` (its `index.html` links
 * `/dashboard/manifest.webmanifest` and registers `/dashboard/orvel-push-sw.js` with scope
 * `/dashboard/`), so the app's directory is mounted at both `/` and `/dashboard/`, with an SPA
 * fallback for extension-less paths.
 *
 * Usage:
 *   node scripts/serve-dashboard-dist.mjs --app dashboard|dashboard-web [--port 4400]
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const APPS = {
  dashboard: join(REPO_ROOT, 'apps', 'dashboard', 'dist', 'salon-de-belleza', 'browser'),
  'dashboard-web': join(REPO_ROOT, 'apps', 'dashboard-web', 'dist', 'orvel-dashboard-web', 'browser')
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function parseArgs(argv) {
  const args = { app: 'dashboard', port: 4400 };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--app') args.app = argv[index + 1];
    if (argv[index] === '--port') args.port = Number(argv[index + 1]);
  }

  return args;
}

const { app, port } = parseArgs(process.argv.slice(2));

if (!Object.hasOwn(APPS, app)) {
  console.error(`serve-dashboard-dist: unknown --app '${app}'. Use one of: ${Object.keys(APPS).join(', ')}`);
  process.exit(2);
}

const distDir = APPS[app];

if (!existsSync(distDir)) {
  console.error(
    `serve-dashboard-dist: missing build output for '${app}' at ${relative(REPO_ROOT, distDir)}.\n` +
      'Build it first: pnpm run build:dashboard (or build:dashboard-web).'
  );
  process.exit(2);
}

/** `/dashboard/x` and `/x` both resolve inside the dist directory. */
function toFilePath(pathname) {
  let path = pathname;

  if (path === '/dashboard' || path === '/dashboard/') return join(distDir, 'index.html');
  if (path.startsWith('/dashboard/')) path = path.slice('/dashboard'.length);

  const candidate = join(distDir, normalize(path));
  if (!candidate.startsWith(distDir)) return null;
  return candidate;
}

function resolveFile(pathname) {
  const candidate = toFilePath(pathname);
  if (!candidate) return { status: 403 };

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return { status: 200, file: candidate };
  }

  // SPA fallback: a path with no extension is a client route, not a missing asset.
  if (!extname(pathname)) {
    return { status: 200, file: join(distDir, 'index.html'), fallback: true };
  }

  return { status: 404 };
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  const resolved = resolveFile(decodeURIComponent(url.pathname));

  if (resolved.status !== 200) {
    response.writeHead(resolved.status, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(String(resolved.status));
    return;
  }

  const body = readFileSync(resolved.file);
  const isServiceWorker = /(?:^|\/)(ngsw-worker|orvel-push-sw)\.js$/.test(resolved.file);
  const isEntry = resolved.file.endsWith('index.html');

  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(resolved.file)] ?? 'application/octet-stream',
    'content-length': body.byteLength,
    // Never let a stale service worker or entry document mask a build.
    'cache-control': isServiceWorker || isEntry ? 'no-store' : 'public, max-age=3600',
    ...(isServiceWorker ? { 'service-worker-allowed': '/' } : {})
  });
  response.end(body);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serve-dashboard-dist: serving '${app}' at http://127.0.0.1:${port}/dashboard/`);
});
