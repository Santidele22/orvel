import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(process.cwd(), 'src/app');
const pageTsPath = resolve(appRoot, 'features/booking/pages/public/manage-booking.page.ts');
const pageHtmlPath = resolve(appRoot, 'features/booking/pages/public/manage-booking.page.html');
const servicePath = resolve(appRoot, 'features/booking/data-access/public-booking.service.ts');

function readRequired(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`M5 public cancel contract target is missing: ${relative(process.cwd(), path)}`);
  }

  return readFileSync(path, 'utf8');
}

function pageSource(): string {
  return `${readRequired(pageTsPath)}\n${readRequired(pageHtmlPath)}`;
}

function productiveTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return productiveTsFiles(path);
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
      return [];
    }

    return [path];
  });
}

describe('M5 public manage link cancel UI RED contract', () => {
  it('loads manage state from the URL token through PublicBookingService only', () => {
    const source = pageSource();

    expect(source).toMatch(/queryParamMap\.get\(['"]token['"]\)/);
    expect(source).toMatch(/PublicBookingService/);
    expect(source).toMatch(/manageBookingByToken\(\s*token\s*,\s*new Date\(\)\.toISOString\(\)/);
    expect(source, 'public manage page must not use local fixtures for token-managed booking state').not.toMatch(/fixture|mockBooking|localStorage|sessionStorage/i);
    expect(source, 'public manage page must not query Supabase tables directly').not.toMatch(/\.from\(['"][^'"]+['"]\)/);
    expect(source, 'raw manage tokens are private and must never be selected in the public page').not.toMatch(/manage_token/);
  });

  it('renders a safe booking summary and exposes cancel only when backend policy allows it', () => {
    const source = pageSource();

    expect(source).toMatch(/canCancelOrReschedule/);
    expect(source).toMatch(/data-testid=["']manage-booking-summary["']/i);
    expect(source).toMatch(/data-testid=["']manage-cancel-action["']/i);
    expect(source).toMatch(/@if\s*\(\s*canCancelOrReschedule\(\)\s*\)/);
    expect(source, 'safe summary should include business/service/time labels from backend payload, not the private token').toMatch(
      /business|service|startsAtIso|fecha|horario|profesional/i
    );
    expect(source, 'private token must not be interpolated into visible UI').not.toMatch(/{{\s*token\s*(?:\(\))?\s*}}/);
  });

  it('submits cancellation through cancelBookingByToken lifecycle path and never admin/direct table update', () => {
    const source = pageSource();

    expect(source).toMatch(/cancelBookingByToken\(\s*token\s*,\s*new Date\(\)\.toISOString\(\)/);
    expect(source).toMatch(/await\s+this\.publicBookingService\.cancelBookingByToken/);
    expect(source, 'public cancel must not call admin lifecycle methods').not.toMatch(/cancelBooking\(|updateBookingStatus|adminCancel|createAdmin/i);
    expect(source, 'public cancel must not update bookings directly from the browser').not.toMatch(/\.from\(['"]bookings['"]\)[\s\S]{0,300}\.update\(/);
  });

  it.each([
    ['INVALID_TOKEN', 'manage-token-invalid-state'],
    ['TOKEN_EXPIRED', 'manage-token-expired-state'],
    ['TOKEN_REVOKED', 'manage-token-revoked-state'],
    ['BOOKING_ALREADY_CANCELLED', 'manage-already-cancelled-state'],
    ['POLICY_WINDOW_CLOSED', 'manage-policy-window-state']
  ] as const)('fails closed for %s with a deterministic safe state', (errorCode, testId) => {
    const source = pageSource();

    expect(source).toMatch(new RegExp(errorCode));
    expect(source).toMatch(new RegExp(`data-testid=["']${testId}["']`, 'i'));
    expect(source, `${errorCode} must not leave public cancel enabled`).toMatch(/canCancelOrReschedule\.set\(false\)/);
  });

  it('handles successful cancel as a terminal cancelled state or refreshes manage state', () => {
    const source = pageSource();

    expect(source).toMatch(/cancelled|cancelado|manage-cancelled-state|manageBookingByToken\(/i);
    expect(source).toMatch(/data-testid=["']manage-cancelled-state["']|manageBookingByToken\(\s*token\s*,\s*new Date\(\)\.toISOString\(\)/i);
  });

  it('does not leak manage tokens through logs, visible UI, or frontend direct lookup code', () => {
    const combinedProductiveSource = productiveTsFiles(appRoot)
      .map((file) => `\n/* ${relative(appRoot, file)} */\n${readFileSync(file, 'utf8')}`)
      .join('\n');

    const serviceSource = readRequired(servicePath);
    const source = pageSource();

    expect(source, 'public page must not log private manage tokens').not.toMatch(/console\.(?:log|info|warn|error|debug)\([^)]*token/i);
    expect(source, 'public page must not render private manage tokens').not.toMatch(/manageToken|manage_token|management_key/i);
    expect(serviceSource, 'PublicBookingService must remain gateway-only').not.toMatch(/createClient|\.rpc\(|\.from\(/);
    expect(combinedProductiveSource, 'frontend productive code must not perform raw manage_token equality lookup').not.toMatch(
      /\.eq\(\s*['"]manage_token['"]\s*,\s*(?:token|manageToken|managementKey)/i
    );
    expect(combinedProductiveSource, 'frontend productive code must not direct-select manage_token from tables').not.toMatch(
      /\.from\(['"][^'"]+['"]\)[\s\S]{0,500}\.select\([^)]*manage_token/i
    );
  });
});
