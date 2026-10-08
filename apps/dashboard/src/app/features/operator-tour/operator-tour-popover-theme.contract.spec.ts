import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATOR_TOUR_POPOVER_CLASS } from './operator-tour-steps';

/**
 * driver.js ships a light default theme, so the tour popover used to open as a
 * white card on top of the dark dashboard. The class is the seam: the service
 * tags the popover and the shared stylesheet (loaded by both targets) themes it.
 */

const sharedStyles = readFileSync(resolve(process.cwd(), 'src/styles.scss'), 'utf8');
const serviceSource = readFileSync(
  resolve(process.cwd(), 'src/app/features/operator-tour/operator-tour.service.ts'),
  'utf8',
);

describe('operator tour popover theme contract', () => {
  it('tags the popover so the dashboard can theme it', () => {
    expect(OPERATOR_TOUR_POPOVER_CLASS).toBe('orvel-operator-tour');
    expect(serviceSource).toContain('popoverClass: OPERATOR_TOUR_POPOVER_CLASS');
  });

  it('paints the popover with the dashboard surface instead of the light default', () => {
    const popover = `.${OPERATOR_TOUR_POPOVER_CLASS}.driver-popover`;

    expect(sharedStyles).toContain(popover);
    expect(sharedStyles).toContain(`.${OPERATOR_TOUR_POPOVER_CLASS} .driver-popover-title`);
    expect(sharedStyles).toContain(`.${OPERATOR_TOUR_POPOVER_CLASS} .driver-popover-description`);
    expect(sharedStyles).toContain(`.${OPERATOR_TOUR_POPOVER_CLASS} .driver-popover-footer-btn`);
    expect(sharedStyles).toContain(`.${OPERATOR_TOUR_POPOVER_CLASS} .driver-popover-next-btn`);
    expect(sharedStyles).toContain(`.${OPERATOR_TOUR_POPOVER_CLASS} .driver-popover-progress-text`);

    const block = sharedStyles.slice(sharedStyles.indexOf(popover));
    expect(block).toContain('var(--bg-secondary)');
    expect(block).toContain('var(--text-primary)');
  });

  it('recolours the arrow per side, because driver.js draws it with borders', () => {
    for (const side of ['left', 'right', 'top', 'bottom']) {
      expect(sharedStyles).toContain(
        `.${OPERATOR_TOUR_POPOVER_CLASS} .driver-popover-arrow-side-${side}`,
      );
    }
  });
});
