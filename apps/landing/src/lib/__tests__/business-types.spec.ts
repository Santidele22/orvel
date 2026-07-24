import { describe, expect, it } from 'vitest';
import {
  getPromotedBusinessTypes,
  getBusinessTypesForSignup,
  BUSINESS_TYPES_CATALOG,
} from '../business-types';

describe('getPromotedBusinessTypes', () => {
  it('returns exactly 4 promoted business types', () => {
    const promoted = getPromotedBusinessTypes();
    expect(promoted).toHaveLength(4);
  });

  it('returns the correct promoted codes', () => {
    const promoted = getPromotedBusinessTypes();
    const codes = promoted.map((bt) => bt.code).sort();
    expect(codes).toEqual(['barberia', 'masajes', 'peluqueria', 'unas'].sort());
  });

  it('each promoted type has code and label strings', () => {
    const promoted = getPromotedBusinessTypes();
    for (const bt of promoted) {
      expect(typeof bt.code).toBe('string');
      expect(bt.code.length).toBeGreaterThan(0);
      expect(typeof bt.label).toBe('string');
      expect(bt.label.length).toBeGreaterThan(0);
    }
  });

  it('returns code and label for each entry (no extra fields)', () => {
    const promoted = getPromotedBusinessTypes();
    for (const bt of promoted) {
      const keys = Object.keys(bt).sort();
      expect(keys).toEqual(['code', 'label']);
    }
  });
});

describe('getBusinessTypesForSignup', () => {
  it('returns exactly 5 options (4 promoted + Otro)', () => {
    const options = getBusinessTypesForSignup();
    expect(options).toHaveLength(5);
  });

  it('includes all 4 promoted business types', () => {
    const options = getBusinessTypesForSignup();
    const promoted = getPromotedBusinessTypes();
    for (const p of promoted) {
      const found = options.find((o) => o.code === p.code);
      expect(found).toBeDefined();
    }
  });

  it('includes "Otro" as the last option', () => {
    const options = getBusinessTypesForSignup();
    const last = options[options.length - 1];
    expect(last.code).toBe('otro');
    expect(last.label.toLowerCase()).toContain('otro');
  });

  it('each option has code and label strings', () => {
    const options = getBusinessTypesForSignup();
    for (const opt of options) {
      expect(typeof opt.code).toBe('string');
      expect(opt.code.length).toBeGreaterThan(0);
      expect(typeof opt.label).toBe('string');
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

describe('BUSINESS_TYPES_CATALOG', () => {
  it('contains exactly 5 entries (4 promoted + otro)', () => {
    expect(BUSINESS_TYPES_CATALOG).toHaveLength(5);
  });

  it('all entries have unique codes', () => {
    const codes = BUSINESS_TYPES_CATALOG.map((bt) => bt.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});
