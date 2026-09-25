import { describe, expect, it } from 'vitest';

import {
  buildProfessionalFilterChips,
  turnoMatchesProfessionalFilter
} from './turnos-professional-chips';

describe('buildProfessionalFilterChips', () => {
  it('lists every active Equipo member even when they have no bookings', () => {
    const chips = buildProfessionalFilterChips(
      [
        { id: 'pro-javier', name: 'Javier Mansilla', active: true },
        { id: 'pro-santi', name: 'Santiago Delebecq', active: true }
      ],
      ['Javier Mansilla']
    );

    expect(chips.map((chip) => chip.name)).toEqual(['Javier Mansilla', 'Santiago Delebecq']);
  });

  it('omits inactive Equipo members', () => {
    const chips = buildProfessionalFilterChips(
      [
        { id: 'pro-javier', name: 'Javier Mansilla', active: true },
        { id: 'pro-santi', name: 'Santiago Delebecq', active: false }
      ],
      []
    );

    expect(chips).toEqual([{ id: 'pro-javier', name: 'Javier Mansilla' }]);
  });

  it('falls back to booked names when Equipo is empty', () => {
    const chips = buildProfessionalFilterChips([], ['Javier Mansilla', 'Javier Mansilla']);

    expect(chips).toEqual([{ id: 'Javier Mansilla', name: 'Javier Mansilla' }]);
  });
});

describe('turnoMatchesProfessionalFilter', () => {
  const chips = [
    { id: 'pro-javier', name: 'Javier Mansilla' },
    { id: 'pro-santi', name: 'Santiago Delebecq' }
  ];

  it('keeps every turno when filter is todas', () => {
    expect(
      turnoMatchesProfessionalFilter({ professionalNombre: 'Javier Mansilla' }, 'todas', chips)
    ).toBe(true);
  });

  it('matches a professional with no bookings by Equipo id', () => {
    expect(
      turnoMatchesProfessionalFilter(
        { professionalId: 'pro-santi', professionalNombre: 'Santiago Delebecq' },
        'pro-santi',
        chips
      )
    ).toBe(true);
  });

  it('matches by name when the booking only has professionalNombre', () => {
    expect(
      turnoMatchesProfessionalFilter({ professionalNombre: 'Santiago Delebecq' }, 'pro-santi', chips)
    ).toBe(true);
  });
});
