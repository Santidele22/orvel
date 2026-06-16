import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

export const PROXY_PORT = Number(process.env.ORVEL_LOCAL_PROXY_PORT || 3000);

export const TARGETS = {
  landing: {
    name: 'landing',
    origin: process.env.ORVEL_LANDING_DEV_ORIGIN || 'http://127.0.0.1:4321'
  },
  dashboard: {
    name: 'dashboard',
    origin: process.env.ORVEL_DASHBOARD_DEV_ORIGIN || 'http://127.0.0.1:4200'
  }
};

const DASHBOARD_PATH_PREFIXES = [
  '/dashboard',
  '/booking',
  '/ngsw',
  '/ngsw.json'
];

const DASHBOARD_AUTH_PATH_PREFIXES = [
  '/auth/onboarding'
];

const DASHBOARD_DEV_ASSET_PATTERNS = [
  /^\/(?:main|polyfills|styles|runtime)\.js(?:\.map)?(?:\?|$)/,
  /^\/chunk-[^/]+\.js(?:\.map)?(?:\?|$)/,
  /^\/@ng\//,
  /^\/node_modules\/(?:\.vite\/)?@angular\//
];

const SHARED_DEV_ASSET_PREFIXES = [
  '/@vite/',
  '/@fs/',
  '/src/'
];

function pathnameFromUrl(rawUrl = '/') {
  return new URL(rawUrl, 'http://localhost').pathname;
}

function requestCameFromDashboard(headers = {}) {
  const referer = headers.referer || headers.referrer;
  if (typeof referer !== 'string' || !referer) return false;

  try {
    return new URL(referer).pathname.startsWith('/dashboard');
  } catch {
    return false;
  }
}

export function withForwardedHeaders(req, targetUrl) {
  const proxyHost = req.headers.host ?? `localhost:${PROXY_PORT}`;
  return {
    ...req.headers,
    host: proxyHost,
    'x-forwarded-host': proxyHost,
    'x-forwarded-proto': 'http',
    'x-forwarded-port': String(PROXY_PORT),
    'x-orvel-target-host': targetUrl.host
  };
}

function samePath(path) {
  return path;
}

function underDashboardServePath(path) {
  return `/dashboard${path}`;
}

export function resolveProxyTarget(req) {
  const pathname = pathnameFromUrl(req.url);
  const cameFromDashboard = requestCameFromDashboard(req.headers);

  if (pathname === '/booking' || pathname.startsWith('/booking/')) {
    return { ...TARGETS.dashboard, rewritePath: underDashboardServePath };
  }

  if (DASHBOARD_PATH_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return { ...TARGETS.dashboard, rewritePath: samePath };
  }

  if (DASHBOARD_AUTH_PATH_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return { ...TARGETS.dashboard, rewritePath: underDashboardServePath };
  }

  if (DASHBOARD_DEV_ASSET_PATTERNS.some(pattern => pattern.test(req.url ?? pathname))) {
    return { ...TARGETS.dashboard, rewritePath: samePath };
  }

  if (cameFromDashboard && SHARED_DEV_ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return { ...TARGETS.dashboard, rewritePath: samePath };
  }

  return { ...TARGETS.landing, rewritePath: samePath };
}

function proxyHttpRequest(req, res) {
  const target = resolveProxyTarget(req);
  const targetUrl = new URL(target.rewritePath(req.url ?? '/'), target.origin);

  const proxyReq = http.request(
    targetUrl,
    {
      method: req.method,
      headers: withForwardedHeaders(req, targetUrl)
    },
    proxyRes => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.statusMessage, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', error => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end(`Orvel local proxy could not reach ${target.name} dev server at ${target.origin}: ${error.message}`);
  });

  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head) {
  const target = resolveProxyTarget(req);
  const targetUrl = new URL(target.origin);

  const upstream = net.connect(Number(targetUrl.port), targetUrl.hostname, () => {
    upstream.write(`${req.method} ${target.rewritePath(req.url ?? '/')} HTTP/${req.httpVersion}\r\n`);

    const proxyHost = req.headers.host ?? `localhost:${PROXY_PORT}`;
    const headers = {
      ...req.headers,
      host: proxyHost,
      origin: `http://${proxyHost}`,
      'x-forwarded-host': proxyHost,
      'x-forwarded-proto': 'http',
      'x-forwarded-port': String(PROXY_PORT),
      'x-orvel-target-host': targetUrl.host
    };

    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${name}: ${item}\r\n`);
      } else if (value !== undefined) {
        upstream.write(`${name}: ${value}\r\n`);
      }
    }

    upstream.write('\r\n');
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}

export function createLocalDevProxyServer() {
  const server = http.createServer(proxyHttpRequest);
  server.on('upgrade', proxyWebSocket);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createLocalDevProxyServer().listen(PROXY_PORT, () => {
    console.log(`[orvel-local-proxy] http://localhost:${PROXY_PORT}`);
    console.log(`[orvel-local-proxy] landing  -> ${TARGETS.landing.origin}`);
    console.log(`[orvel-local-proxy] dashboard -> ${TARGETS.dashboard.origin}`);
  });
}
