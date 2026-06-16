import { describe, expect, it, vi } from 'vitest';
import { navigateAfterLogout } from '../../shared/dashboard-shell/logout-navigation';

describe('dashboard logout navigation', () => {
  it('uses document navigation for absolute landing login URLs and does not call Angular router', async () => {
    const router = { navigateByUrl: vi.fn() };
    const location = { assign: vi.fn() };
    const landingLoginUrl = 'https://orvel.pro/auth/login?returnTo=%2Fdashboard';

    await navigateAfterLogout(landingLoginUrl, router, location);

    expect(location.assign).toHaveBeenCalledWith(landingLoginUrl);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('uses document navigation for local dev absolute landing URLs', async () => {
    const router = { navigateByUrl: vi.fn() };
    const location = { assign: vi.fn() };
    const localLandingUrl = 'http://localhost:4321/auth/login?returnTo=%2Fdashboard';

    await navigateAfterLogout(localLandingUrl, router, location);

    expect(location.assign).toHaveBeenCalledWith(localLandingUrl);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('keeps internal fallback paths on Angular router', async () => {
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    const location = { assign: vi.fn() };

    await navigateAfterLogout('/auth/login?returnTo=%2Fdashboard', router, location);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login?returnTo=%2Fdashboard');
    expect(location.assign).not.toHaveBeenCalled();
  });
});
