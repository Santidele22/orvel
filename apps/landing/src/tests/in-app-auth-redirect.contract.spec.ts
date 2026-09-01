import { describe, expect, it } from 'vitest';

import { buildInAppAuthRedirect } from '../lib/in-app-auth-redirect';

describe('Contract: landing in-app auth redirect lands on Angular /dashboard paths', () => {
  it('from dashboard.orvel.pro/auth/login hops to /dashboard/login, never /auth/login', () => {
    const redirect = new URL(
      buildInAppAuthRedirect(
        new URL('https://dashboard.orvel.pro/auth/login'),
        'login',
        'https://dashboard.orvel.pro'
      )
    );

    expect(redirect.origin).toBe('https://dashboard.orvel.pro');
    expect(redirect.pathname).toBe('/dashboard/login');
    expect(redirect.pathname).not.toBe('/auth/login');
  });

  it('from orvel.pro/auth/login hops to dashboard.orvel.pro/dashboard/login', () => {
    const redirect = new URL(
      buildInAppAuthRedirect(
        new URL('https://orvel.pro/auth/login'),
        'login',
        'https://dashboard.orvel.pro'
      )
    );

    expect(redirect.origin).toBe('https://dashboard.orvel.pro');
    expect(redirect.pathname).toBe('/dashboard/login');
    expect(redirect.pathname).not.toBe('/auth/login');
  });

  it('signup hops to /dashboard/signup from both landing and dashboard hosts', () => {
    const fromLanding = new URL(
      buildInAppAuthRedirect(
        new URL('https://orvel.pro/auth/signup'),
        'signup',
        'https://dashboard.orvel.pro'
      )
    );
    const fromDashboard = new URL(
      buildInAppAuthRedirect(
        new URL('https://dashboard.orvel.pro/auth/signup'),
        'signup',
        'https://dashboard.orvel.pro'
      )
    );

    expect(fromLanding.origin).toBe('https://dashboard.orvel.pro');
    expect(fromLanding.pathname).toBe('/dashboard/signup');
    expect(fromLanding.pathname).not.toBe('/auth/signup');
    expect(fromDashboard.origin).toBe('https://dashboard.orvel.pro');
    expect(fromDashboard.pathname).toBe('/dashboard/signup');
    expect(fromDashboard.pathname).not.toBe('/auth/signup');
  });
});
