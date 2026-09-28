import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { RealSupabaseBookingGateway } from '../real-gateway';
import { mapResolvedBusinessToPublicView } from '../mappers';

// `public.business_settings` carries deposit alias/CBU, support phone and
// whatsapp. The anonymous turnero must resolve everything through the
// SECURITY DEFINER RPC `resolve_business_by_slug` so the anonymous table grants
// can stay revoked (audit 2026-09-28, C-2/M-15 expand/contract).

const RPC_PAYLOAD = {
  id: 'business-1',
  slug: 'canonical-studio',
  name: 'Canonical Studio',
  timezone: 'America/Argentina/Buenos_Aires',
  booking_policy: {
    autoConfirm: false,
    cancellationWindowMinutes: 120,
    allowClientProfessionalSelection: true,
    allowClientReschedule: false,
    allowClientCancel: true
  },
  settings: {
    slotIntervalMinutes: 45,
    bufferMinutes: 20,
    minNoticeMinutes: 240,
    maxAdvanceDays: 60,
    workingHours: { monday: { enabled: true, start: '10:00', end: '19:00' } },
    depositEnabled: true,
    depositPercent: 25,
    depositAlias: 'orvel.pagos',
    depositCbu: '0070123456789012345678',
    supportPhone: '+5491100000000'
  }
};

function fakeClient(payload: unknown) {
  const from = vi.fn(() => {
    throw new Error('anonymous turnero must not read tables directly');
  });
  return {
    client: {
      rpc: vi.fn(async () => ({ data: payload, error: null })),
      from
    },
    from
  };
}

describe('mapResolvedBusinessToPublicView', () => {
  it('maps the resolve_business_by_slug payload, including the deposit receipt data', () => {
    const view = mapResolvedBusinessToPublicView(RPC_PAYLOAD);

    expect(view.id).toBe('business-1');
    expect(view.slug).toBe('canonical-studio');
    expect(view.displayName).toBe('Canonical Studio');
    expect(view.settings.bufferMinutes).toBe(20);
    expect(view.settings.minNoticeMinutes).toBe(240);
    expect(view.settings.slotIntervalMinutes).toBe(45);
    expect(view.settings.maxAdvanceDays).toBe(60);
    expect(view.settings.depositEnabled).toBe(true);
    expect(view.settings.depositPercent).toBe(25);
    expect(view.settings.depositAlias).toBe('orvel.pagos');
    expect(view.settings.depositCbu).toBe('0070123456789012345678');
    expect(view.settings.supportPhone).toBe('+5491100000000');
    expect(view.bookingPolicy).toEqual({
      autoConfirm: false,
      cancellationWindowMinutes: 120,
      allowClientProfessionalSelection: true,
      allowClientReschedule: false,
      allowClientCancel: true
    });
  });

  it('keeps operational defaults when the payload omits settings', () => {
    const view = mapResolvedBusinessToPublicView({
      id: 'business-2',
      slug: 'bare-studio',
      name: 'Bare Studio'
    });

    expect(view.timezone).toBe('America/Argentina/Buenos_Aires');
    expect(view.settings.bufferMinutes).toBe(10);
    expect(view.settings.minNoticeMinutes).toBe(120);
    expect(view.settings.slotIntervalMinutes).toBe(30);
    expect(view.settings.maxAdvanceDays).toBe(30);
    expect(view.settings.depositEnabled).toBe(false);
    expect(view.settings.depositPercent).toBe(0);
    expect(view.settings.depositAlias).toBeNull();
    expect(view.settings.depositCbu).toBeNull();
    expect(view.settings.workingHours.monday).toEqual({ enabled: true, start: '09:00', end: '18:00' });
    expect(view.bookingPolicy).toMatchObject({
      autoConfirm: true,
      cancellationWindowMinutes: 60,
      allowClientProfessionalSelection: false
    });
  });

  it('tolerates a snake_case payload', () => {
    const view = mapResolvedBusinessToPublicView({
      id: 'business-3',
      slug: 'legacy-studio',
      name: 'Legacy Studio',
      timezone: 'America/Argentina/Buenos_Aires',
      settings: { buffer_minutes: 15, min_notice_minutes: 30, deposit_alias: '  alias.legacy  ' }
    });

    expect(view.settings.bufferMinutes).toBe(15);
    expect(view.settings.minNoticeMinutes).toBe(30);
    expect(view.settings.depositAlias).toBe('alias.legacy');
  });
});

describe('RealSupabaseBookingGateway.resolveBusinessBySlug', () => {
  it('resolves the public view without touching any table', async () => {
    const { client, from } = fakeClient(RPC_PAYLOAD);
    const gateway = new RealSupabaseBookingGateway(client as never);

    const response = await gateway.resolveBusinessBySlug({ businessSlug: 'canonical-studio' });

    expect(response.status).toBe(200);
    expect(response.data?.displayName).toBe('Canonical Studio');
    expect(response.data?.settings.depositAlias).toBe('orvel.pagos');
    expect(from).not.toHaveBeenCalled();
  });

  it('still reports a missing business as 404', async () => {
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: vi.fn()
    };
    const gateway = new RealSupabaseBookingGateway(client as never);

    const response = await gateway.resolveBusinessBySlug({ businessSlug: 'canonical-studio' });

    expect(response.status).toBe(404);
    expect(response.error?.code).toBe('BUSINESS_NOT_FOUND');
  });
});

describe('real-gateway anonymous read surface', () => {
  it('never reads business_settings or any other table directly', () => {
    const source = readFileSync(fileURLToPath(new URL('../real-gateway.ts', import.meta.url)), 'utf-8');

    expect(source).not.toMatch(/from\(\s*['"]business_settings['"]/);
    expect(source).not.toMatch(/from\(\s*['"]businesses['"]/);
    expect(source).not.toMatch(/\.from\(/);
  });
});
