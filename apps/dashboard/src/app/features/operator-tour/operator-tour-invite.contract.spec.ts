import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOUR_INVITE_ACCEPT_LABEL,
  TOUR_INVITE_DECLINE_LABEL,
  TOUR_INVITE_DESCRIPTION,
  TOUR_INVITE_TITLE,
  shouldOfferTourInvite,
} from './operator-tour-invite';

/**
 * The tour used to open by itself, only on the home route. A brand-new operator
 * lands on the agenda, so it never fired, and nobody was asked. The invite is
 * the front door: a modal that asks first, wherever the operator landed.
 */

function readInviteComponent(): string {
  try {
    return readFileSync(
      resolve(process.cwd(), 'src/app/features/operator-tour/operator-tour-invite.component.ts'),
      'utf8',
    );
  } catch {
    return '';
  }
}

describe('operator tour invite contract', () => {
  it('offers the tour to a first-time operator', () => {
    expect(shouldOfferTourInvite({ canAutoStart: () => true })).toBe(true);
  });

  it('never asks twice on the same device', () => {
    expect(shouldOfferTourInvite({ canAutoStart: () => false })).toBe(false);
  });

  it('stays inert when the shell has no tour wired (SSR, web console without provider)', () => {
    expect(shouldOfferTourInvite(null)).toBe(false);
    expect(shouldOfferTourInvite(undefined)).toBe(false);
  });

  it('survives a gate that throws instead of breaking the shell', () => {
    const throwing = {
      canAutoStart: () => {
        throw new Error('storage disabled');
      },
    };

    expect(shouldOfferTourInvite(throwing)).toBe(false);
  });

  it('asks in the operator voice, naming the tour', () => {
    expect(TOUR_INVITE_TITLE).toContain('Orvel');
    expect(TOUR_INVITE_DESCRIPTION.trim()).not.toBe('');
    expect(TOUR_INVITE_DESCRIPTION.length).toBeLessThanOrEqual(240);
    expect(TOUR_INVITE_ACCEPT_LABEL.trim()).not.toBe('');
    expect(TOUR_INVITE_DECLINE_LABEL.trim()).not.toBe('');
  });

  it('renders an accessible dialog with both answers on the dashboard surface', () => {
    const source = readInviteComponent();

    expect(source, 'invite component is missing').not.toBe('');
    expect(source).toMatch(/role=["']dialog["']/i);
    expect(source).toMatch(/aria-modal=["']true["']/i);
    expect(source).toContain('aria-labelledby="operator-tour-invite-title"');
    expect(source).toContain('aria-describedby="operator-tour-invite-description"');
    expect(source).toContain('data-testid="operator-tour-invite"');
    expect(source).toContain('data-testid="operator-tour-invite-accept"');
    expect(source).toContain('data-testid="operator-tour-invite-decline"');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toMatch(/bg-slate-950\/80|bg-black\/70/);
    expect(source).not.toMatch(/class=["'][^"']*bg-white\b/i);
  });

  it('answers through the shell chrome port instead of reaching into the feature', () => {
    const source = readInviteComponent();

    expect(source).toContain('DASHBOARD_TOUR');
    expect(source).not.toContain("from './operator-tour.service'");
  });
});
