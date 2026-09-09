import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { markBookingLinkCopied } from './mark-booking-link-copied';

const helperPath = resolve(process.cwd(), 'src/app/core/booking/mark-booking-link-copied.ts');
const publicUrlPath = resolve(process.cwd(), 'src/app/core/booking/public-booking-url.ts');
const homePath = resolve(process.cwd(), 'src/app/features/dashboard-home/pages/dashboard-home.page.ts');
const settingsPath = resolve(process.cwd(), 'src/app/features/settings/pages/configuracion.page.ts');
const pwaPath = resolve(process.cwd(), 'src/app/features/pwa-install/pages/pwa-install.page.ts');

const helper = readFileSync(helperPath, 'utf8');
const home = readFileSync(homePath, 'utf8');
const settings = readFileSync(settingsPath, 'utf8');
const pwa = readFileSync(pwaPath, 'utf8');

function methodBody(source: string, name: string): string {
  const match = source.match(
    new RegExp(
      `(?:protected\\s+)?(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*:\\s*Promise<void>\\s*\\{([\\s\\S]*?)\\n  \\}`,
    ),
  );
  return match?.[1] ?? '';
}

describe('markBookingLinkCopied contract', () => {
  it('lives next to public-booking-url and calls the set-if-null RPC', () => {
    expect(helperPath.startsWith(resolve(process.cwd(), 'src/app/core/booking'))).toBe(true);
    expect(publicUrlPath.endsWith('public-booking-url.ts')).toBe(true);
    expect(helper).toMatch(/rpc\(\s*['"]mark_booking_link_copied['"]/);
    expect(helper).toMatch(/p_business_id/);
    expect(helper).not.toMatch(/from\(\s*['"]business_settings['"]\s*\)/);
    expect(helper).not.toMatch(/\.update\(/);
  });

  it('is invoked from home and settings copyBookingUrl after clipboard.writeText of the public booking URL', () => {
    const homeCopy = methodBody(home, 'copyBookingUrl');
    const settingsCopy = methodBody(settings, 'copyBookingUrl');
    expect(homeCopy.length).toBeGreaterThan(0);
    expect(settingsCopy.length).toBeGreaterThan(0);

    expect(home).toMatch(/from ['"]\.\.\/\.\.\/\.\.\/core\/booking\/mark-booking-link-copied['"]/);
    expect(settings).toMatch(/from ['"]\.\.\/\.\.\/\.\.\/core\/booking\/mark-booking-link-copied['"]/);

    const homeWrite = homeCopy.indexOf('clipboard.writeText');
    const homeMark = homeCopy.search(/markBookingLinkCopied\s*\(/);
    expect(homeWrite).toBeGreaterThanOrEqual(0);
    expect(homeMark).toBeGreaterThan(homeWrite);
    expect(homeCopy).toMatch(/bookingUrl\(\)|buildPublicBookingUrl/);

    const settingsWrite = settingsCopy.indexOf('clipboard.writeText');
    const settingsMark = settingsCopy.search(/markBookingLinkCopied\s*\(/);
    expect(settingsWrite).toBeGreaterThanOrEqual(0);
    expect(settingsMark).toBeGreaterThan(settingsWrite);
    expect(settingsCopy).toMatch(/publicBookingUrl\(\)|buildPublicBookingUrl/);
  });

  it('is not used by professional booking copy or PWA install copy of window.location.href', () => {
    const professional = methodBody(settings, 'copyProfessionalBookingUrl');
    const install = methodBody(pwa, 'copyInstallLink');
    expect(professional.length).toBeGreaterThan(0);
    expect(install.length).toBeGreaterThan(0);
    expect(professional).not.toMatch(/markBookingLinkCopied|mark_booking_link_copied/);
    expect(pwa).not.toMatch(/markBookingLinkCopied|mark_booking_link_copied|booking_link_copied_at/);
    expect(install).toContain('window.location.href');
  });

  it('calls the RPC once and swallows persistence errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await markBookingLinkCopied('biz-1', { rpc });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_booking_link_copied', { p_business_id: 'biz-1' });

    rpc.mockReset();
    await markBookingLinkCopied('', { rpc });
    await markBookingLinkCopied('biz-1', null);
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockRejectedValueOnce(new Error('network'));
    await expect(markBookingLinkCopied('biz-1', { rpc })).resolves.toBeUndefined();
  });
});
