import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveProxyTarget, withForwardedHeaders } from './local-dev-proxy.mjs';

test('routes canonical landing and auth paths to Astro landing', () => {
  for (const path of ['/', '/auth/login', '/auth/callback?code=provider-code', '/billing/subscription']) {
    assert.equal(resolveProxyTarget({ url: path, headers: {} }).name, 'landing');
  }
});

test('routes dashboard-owned onboarding auth route to Angular dashboard', () => {
  const target = resolveProxyTarget({ url: '/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard', headers: {} });

  assert.equal(target.name, 'dashboard');
  assert.equal(
    target.rewritePath('/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard'),
    '/dashboard/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard'
  );
});

test('routes dashboard app paths to Angular dashboard', () => {
  for (const path of ['/dashboard', '/dashboard/inicio', '/dashboard/turnos?filtro=hoy']) {
    assert.equal(resolveProxyTarget({ url: path, headers: {} }).name, 'dashboard');
  }
});

test('preserves dashboard prefixed Angular index and browser bundle paths', () => {
  for (const path of ['/dashboard', '/dashboard/inicio', '/dashboard/main.js', '/dashboard/chunk-ABC123.js']) {
    const target = resolveProxyTarget({ url: path, headers: {} });

    assert.equal(target.name, 'dashboard');
    assert.equal(target.rewritePath(path), path);
  }
});

test('keeps Angular dev assets for dashboard-owned auth route on dashboard dev server', () => {
  for (const path of ['/dashboard/main.js', '/dashboard/chunk-ONBOARDING.js', '/dashboard/styles.js']) {
    assert.equal(resolveProxyTarget({ url: path, headers: { referer: 'http://localhost:3000/auth/onboarding' } }).name, 'dashboard');
  }
});

test('dashboard proxy dev command serves Angular under dashboard path', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const command = packageJson.scripts['dev:dashboard:proxy'];

  assert.match(command, /--serve-path\s+\/dashboard(?:\s|$)/);
});

test('dashboard development build uses dashboard base href for proxied assets', () => {
  const angularJson = JSON.parse(readFileSync(new URL('../apps/dashboard/angular.json', import.meta.url), 'utf8'));
  const developmentConfig = angularJson.projects['salon-de-belleza'].architect.build.configurations.development;

  assert.equal(developmentConfig.baseHref, '/dashboard/');
});

test('routes shared dev assets by dashboard referer only when needed', () => {
  assert.equal(
    resolveProxyTarget({ url: '/@vite/client', headers: { referer: 'http://localhost:3000/dashboard/inicio' } }).name,
    'dashboard'
  );

  assert.equal(
    resolveProxyTarget({ url: '/@vite/client', headers: { referer: 'http://localhost:3000/auth/login' } }).name,
    'landing'
  );
});

test('does not route OAuth codes or tokens through dashboard URL rewriting', () => {
  const target = resolveProxyTarget({ url: '/auth/callback?code=provider-code', headers: {} });

  assert.equal(target.name, 'landing');
  assert.equal(target.rewritePath('/auth/callback?code=provider-code'), '/auth/callback?code=provider-code');
});

test('preserves browser proxy Host while forwarding target host separately', () => {
  const headers = withForwardedHeaders(
    { headers: { host: 'localhost:3000' } },
    new URL('http://127.0.0.1:4321/auth/login')
  );

  assert.equal(headers.host, 'localhost:3000');
  assert.equal(headers['x-forwarded-host'], 'localhost:3000');
  assert.equal(headers['x-orvel-target-host'], '127.0.0.1:4321');
});
