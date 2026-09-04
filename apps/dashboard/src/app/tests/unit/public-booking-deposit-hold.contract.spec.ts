import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEPOSIT_HOLD_RELEASE_COPY,
  readPublicDepositHold
} from '../../features/booking/pages/public/public-booking-deposit-hold';

const FORBIDDEN_REFUND_COPY = 'te devolvemos la plata';

function readUtf8(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing source: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf-8');
}

describe('public booking deposit hold success copy', () => {
  const pageSource = readUtf8('src/app/features/booking/pages/public/public-booking.page.ts');
  const pageTemplate = readUtf8('src/app/features/booking/pages/public/public-booking.page.html');
  const gatewaySource = readUtf8('../../packages/booking/src/infrastructure/supabase/real-gateway.ts');
  const confirmationTypes = readUtf8('../../packages/booking/src/types.ts');
  const combinedUi = `${pageSource}\n${pageTemplate}`;

  it('maps a create response with pending hold keys into a visible hold view', () => {
    const hold = readPublicDepositHold({
      depositCode: 'ORV-1A2B3C4D',
      depositAmount: 15000,
      depositAlias: 'salon.zen',
      depositCbu: '0000003100010000000001',
      depositHoldExpiresAt: '2026-09-04T16:30:00.000Z',
      depositHoldMessage: DEPOSIT_HOLD_RELEASE_COPY,
      manageToken: 'manage-once'
    });

    expect(hold).toEqual({
      code: 'ORV-1A2B3C4D',
      amountPesos: 15000,
      alias: 'salon.zen',
      cbu: '0000003100010000000001',
      expiresAtIso: '2026-09-04T16:30:00.000Z',
      message: DEPOSIT_HOLD_RELEASE_COPY,
      manageToken: 'manage-once'
    });
  });

  it('returns null when the create response has no pending hold code', () => {
    expect(readPublicDepositHold({
      bookingId: 'booking-1',
      status: 'confirmed'
    })).toBeNull();
    expect(readPublicDepositHold(null)).toBeNull();
  });

  it('falls back to the honest hold copy when the RPC omits depositHoldMessage', () => {
    const hold = readPublicDepositHold({
      depositCode: 'ORV-ZZZZZZZZ',
      depositAmount: 2000,
      depositHoldExpiresAt: '2026-09-04T17:00:00.000Z'
    });

    expect(hold?.message).toBe(DEPOSIT_HOLD_RELEASE_COPY);
    expect(hold?.alias).toBeNull();
    expect(hold?.cbu).toBeNull();
  });

  it('shows the hold screen instead of Reserva confirmada when pending hold keys exist', () => {
    expect(DEPOSIT_HOLD_RELEASE_COPY).toBe('Si no se confirma la seña, el horario se libera.');
    expect(pageTemplate).toContain(DEPOSIT_HOLD_RELEASE_COPY);
    expect(combinedUi).not.toContain(FORBIDDEN_REFUND_COPY);
    expect(pageTemplate).toMatch(/data-testid=["']booking-deposit-hold-state["']/);
    expect(pageTemplate).toMatch(/depositHold\(\)/);
    expect(pageTemplate).toMatch(/Seña pendiente/);
    expect(pageTemplate).toMatch(/hold\.code|depositHold\(\)\.code/);
    expect(pageTemplate).toMatch(/hold\.alias|depositHold\(\)\.alias/);
    expect(pageTemplate).toMatch(/hold\.amountPesos|depositHold\(\)\.amountPesos/);
    expect(pageTemplate).toMatch(/hold\.expiresAtIso|depositHoldExpiryLabel|countdown/);

    const holdBlockStart = pageTemplate.indexOf('booking-deposit-hold-state');
    expect(holdBlockStart).toBeGreaterThan(0);
    const holdBlock = pageTemplate.slice(holdBlockStart, holdBlockStart + 1800);
    expect(holdBlock).not.toMatch(/Reserva confirmada/);
  });

  it('maps create_public_booking hold keys through the live public gateway', () => {
    expect(confirmationTypes).toMatch(/depositCode\?:/);
    expect(confirmationTypes).toMatch(/depositAmount\?:/);
    expect(confirmationTypes).toMatch(/depositAlias\?:/);
    expect(confirmationTypes).toMatch(/depositCbu\?:/);
    expect(confirmationTypes).toMatch(/depositHoldExpiresAt\?:/);
    expect(confirmationTypes).toMatch(/depositHoldMessage\?:/);

    expect(gatewaySource).toMatch(/deposit_code/);
    expect(gatewaySource).toMatch(/depositCode/);
    expect(gatewaySource).toMatch(/deposit_amount/);
    expect(gatewaySource).toMatch(/depositHoldExpiresAt/);
    expect(gatewaySource).toMatch(/depositHoldMessage/);

    expect(pageSource).toMatch(/readPublicDepositHold\(/);
    expect(pageSource).toMatch(/depositHold\.set\(/);
  });
});
