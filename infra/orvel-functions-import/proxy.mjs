import http from 'http';

const PORT = 8080;
const LANDING_PORT = 4321;
const DASHBOARD_PORT = 4200;

function createProxy(targetPort, stripPrefix = null) {
  return (req, res) => {
    let path = req.url;
    if (stripPrefix && path.startsWith(stripPrefix)) {
      path = path.slice(stripPrefix.length) || '/';
    }

    const options = {
      hostname: 'localhost',
      port: targetPort,
      path: path,
      method: req.method,
      headers: {
        ...req.headers,
        host: `localhost:${targetPort}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });

    proxyReq.on('error', (err) => {
      console.error(`Error proxying to ${targetPort}:`, err.message);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Bad Gateway: ${targetPort} unreachable`);
    });
  };
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // Landing-specific API routes should go to landing
  if (url.startsWith('/api/checkout') || url.startsWith('/api/auth')) {
    console.log(`[PROXY] ${url} → localhost:${LANDING_PORT}${url}`);
    createProxy(LANDING_PORT)(req, res);
    return;
  }

  // Static assets and Dashboard API calls go to dashboard
  if (
    url.endsWith('.js') ||
    url.endsWith('.css') ||
    url.endsWith('.map') ||
    url.startsWith('/api') ||
    url.startsWith('/@')
  ) {
    console.log(`[PROXY] ${url} → localhost:${DASHBOARD_PORT}${url}`);
    createProxy(DASHBOARD_PORT)(req, res);
    return;
  }

  // /dashboard, /booking and /payments routes to Angular (strip /dashboard prefix if present)
  if (url.startsWith('/dashboard') || url === '/dashboard' || url.startsWith('/booking') || url.startsWith('/payments')) {
    const isDashboard = url.startsWith('/dashboard');
    console.log(`[PROXY] ${url} → localhost:${DASHBOARD_PORT}${isDashboard ? url.replace('/dashboard', '') : url}`);
    createProxy(DASHBOARD_PORT, isDashboard ? '/dashboard' : null)(req, res);
    return;
  }

  // Everything else to Landing
  console.log(`[PROXY] ${url} → localhost:${LANDING_PORT}${url}`);
  createProxy(LANDING_PORT)(req, res);
});

server.listen(PORT, () => {
  console.log(`
 🌐 Reverse Proxy Started on http://localhost:${PORT}
    
    Routes:
    /              → http://localhost:${LANDING_PORT}   (Landing)
    /auth/*        → http://localhost:${LANDING_PORT}   (Landing)
    /api/checkout  → http://localhost:${LANDING_PORT}   (Landing)
    /api/auth      → http://localhost:${LANDING_PORT}   (Landing)
    /dashboard     → http://localhost:${DASHBOARD_PORT} (Dashboard)
    *.js, *.css   → http://localhost:${DASHBOARD_PORT} (Static)

 ⚠️  Make sure both apps are running:
    - Landing:    cd landing && pnpm dev       (port ${LANDING_PORT})
    - Dashboard: cd dashboard && bun start   (port ${DASHBOARD_PORT})
`);
});
