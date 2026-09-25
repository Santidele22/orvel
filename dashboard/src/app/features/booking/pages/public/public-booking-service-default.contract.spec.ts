import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageTs = readFileSync(new URL('./public-booking.page.ts', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('./public-booking.page.html', import.meta.url), 'utf8');

describe('Public booking service default', () => {
  it('does not preselect the first service as already chosen', () => {
    expect(pageTs).not.toMatch(/:\s*mapped\[0\]\.id/);
    expect(pageTs).toMatch(/this\.preloadServiceId && mapped\.some/);
    expect(pageHtml).toMatch(/data-testid=["']booking-service-collapsed["']/);
    expect(pageHtml).toMatch(/border-emerald-400\/30 bg-emerald-500\/15/);
  });

  it('keeps the service step open unless a preloaded service is restored', () => {
    expect(pageTs).toMatch(/expandedStep\.set\('service'\)/);
    expect(pageTs).toMatch(/if \(!preloadService\)/);
  });
});
