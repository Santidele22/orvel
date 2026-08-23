/**
 * packages-booking-shape.red.contract.spec.ts
 *
 * Drift guard for the @orvel/booking package surface.
 * Per sdd-design D4 + sdd-spec REQ-BOOKING-SPEC-2.
 *
 * Asserts:
 * - Exports the 18 type declarations from types.ts, the SupabaseBookingGateway
 *   interface, and the normalizePublicBookingSlug / isValidPublicBookingSlug
 *   runtime (slug moves WHOLE — zero imports, no split like auth).
 * - The runtime namespace is exactly the 2 slug functions: no real gateway, no
 *   api wrapper, no dashboard-internal runtime leaks into the package.
 * - The dashboard tsconfig resolves @orvel/booking to packages/booking/ and the
 *   types.ts old path is still a re-export shim (migration window).
 *   gateway-interface.ts and public-booking-slug.ts dashboard shims are deleted (WU7).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'booking');
const PACKAGE_PACKAGE_JSON = join(PACKAGE_ROOT, 'package.json');
const PACKAGE_INDEX = join(PACKAGE_ROOT, 'src', 'index.ts');
const PACKAGE_TYPES = join(PACKAGE_ROOT, 'src', 'types.ts');
const PACKAGE_GATEWAY = join(PACKAGE_ROOT, 'src', 'gateway-interface.ts');
const PACKAGE_SLUG = join(PACKAGE_ROOT, 'src', 'public-booking-slug.ts');
const DASHBOARD_TYPES_SHIM = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'core', 'api', 'supabase-booking', 'types.ts');
const DASHBOARD_GATEWAY_SHIM = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'core', 'api', 'supabase-booking', 'gateway-interface.ts');
const DASHBOARD_SLUG_SHIM = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'core', 'api', 'supabase-booking', 'public-booking-slug.ts');
const DASHBOARD_PACKAGE_JSON = join(REPO_ROOT, 'apps', 'dashboard', 'package.json');

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

const BOOKING_TYPE_NAMES = [
  'ApiErrorCode',
  'ApiError',
  'ApiResponse',
  'BusinessPublicView',
  'PublicBookingPayload',
  'ManageBookingInput',
  'PublicSlotAvailabilityInput',
  'PublicSlot',
  'PublicBookingConfirmation',
  'ManageBookingDetails',
  'CancelBookingByTokenInput',
  'RescheduleBookingByTokenInput',
  'AdminManualBookingPayload',
  'AdminBlockedTimePayload',
  'AdminUpdateBookingPayload',
  'AdminCancelBookingPayload',
  'AdminRescheduleBookingPayload',
  'AdminStatusUpdatePayload'
];

describe('@orvel/booking package shape contract (chore-extract-booking-package)', () => {
  it('package.json exports the canonical entry', () => {
    const packageJson = JSON.parse(readSource(PACKAGE_PACKAGE_JSON));

    expect(packageJson.name).toBe('@orvel/booking');
    expect(packageJson.type).toBe('module');
    expect(packageJson.exports).toBeDefined();
    expect(packageJson.exports['.']).toBeDefined();
    expect(packageJson.exports['.'].types).toBe('./src/index.ts');
    expect(packageJson.exports['.'].default).toBe('./src/index.ts');
    // Subpath exports per hexagonal pilot REQ-CONSUMER-2 (./domain added in WU1, ./infrastructure added in WU2).
    expect(Object.keys(packageJson.exports)).toEqual(['.', './domain', './application', './infrastructure']);
  });

  it('src/index.ts re-exports the full public surface (18 types + interface + 2 functions)', () => {
    const indexSource = readSource(PACKAGE_INDEX);

    // Type-only re-export block (design D2 — explicit names, no export *)
    expect(indexSource).toContain('export type {');
    for (const name of BOOKING_TYPE_NAMES) {
      expect(indexSource).toContain(name);
    }
    expect(indexSource).toContain('SupabaseBookingGateway');
    expect(indexSource).toContain("SupabaseBookingGateway } from './gateway-interface'");
    expect(indexSource).toContain('normalizePublicBookingSlug');
    expect(indexSource).toContain('isValidPublicBookingSlug');
    // No runtime function bodies in the barrel
    expect(indexSource).not.toContain('function ');
  });

  it('src/types.ts is types-only with exactly the 18 export type declarations', () => {
    const typesSource = readSource(PACKAGE_TYPES);

    for (const name of BOOKING_TYPE_NAMES) {
      expect(typesSource).toContain(`export type ${name}`);
    }
    const exportTypeCount = (typesSource.match(/export type /g) || []).length;
    expect(exportTypeCount).toBe(18);
    // No runtime bodies in the type contract file
    expect(typesSource).not.toContain('function ');
    expect(typesSource).not.toContain('export const ');
    expect(typesSource).not.toContain('export class ');
  });

  it('src/gateway-interface.ts declares SupabaseBookingGateway via export type with no runtime body', () => {
    const gatewaySource = readSource(PACKAGE_GATEWAY);

    expect(gatewaySource).toContain('export type SupabaseBookingGateway');
    // Its only cross-file dependency resolves within the package (relative ./types)
    expect(gatewaySource).toContain("from './types'");
    expect(gatewaySource).not.toContain('function ');
  });

  it('src/public-booking-slug.ts exports exactly the 2 slug functions (no split)', () => {
    const slugSource = readSource(PACKAGE_SLUG);

    expect(slugSource).toContain('export function normalizePublicBookingSlug');
    expect(slugSource).toContain('export function isValidPublicBookingSlug');
    // Zero imports — this is why the runtime moves whole (no auth-style split)
    expect(slugSource).not.toContain("from '");
  });

  it('package source contains no dashboard-internal imports', () => {
    const packageSources = [
      readSource(PACKAGE_TYPES),
      readSource(PACKAGE_GATEWAY),
      readSource(PACKAGE_SLUG),
      readSource(PACKAGE_INDEX)
    ];
    const bannedSubstrings = [
      'core/runtime/dashboard-env',
      'services/auth.service',
      'features/onboarding/'
    ];

    for (const source of packageSources) {
      for (const banned of bannedSubstrings) {
        expect(source, `banned dashboard-internal import '${banned}'`).not.toContain(banned);
      }
    }
  });

  it('dashboard types.ts shim re-exports all 18 type names from @orvel/booking', () => {
    const shim = readSource(DASHBOARD_TYPES_SHIM);

    expect(shim).toContain("from '@orvel/booking'");
    expect(shim).toContain('export type {');
    for (const name of BOOKING_TYPE_NAMES) {
      expect(shim).toContain(name);
    }
    // No runtime body re-published through the shim
    expect(shim).not.toContain('function ');
  });

  it('dashboard gateway-interface.ts shim is deleted', () => {
    expect(existsSync(DASHBOARD_GATEWAY_SHIM)).toBe(false);
  });

  it('dashboard public-booking-slug.ts shim is deleted', () => {
    expect(existsSync(DASHBOARD_SLUG_SHIM)).toBe(false);
  });

  it('apps/dashboard/package.json declares @orvel/booking as a workspace dependency', () => {
    const dashboardPackageJson = JSON.parse(readSource(DASHBOARD_PACKAGE_JSON));

    expect(dashboardPackageJson.dependencies['@orvel/booking']).toBe('workspace:*');
  });

  it('resolves at runtime through the workspace junction with working slug helpers and no runtime leak', async () => {
    const booking = await import('@orvel/booking');

    // Runtime surface: the 2 slug functions + the booking-core domain layer
    // (WU1 of the hexagonal pilot re-exports domain from the package root;
    // grows as availability-core and public-booking-url land in WU1).
    expect(Object.keys(booking).sort()).toEqual([
      'buildPublicBookingUrl',
      'canClientCancelOrReschedule',
      'cancelAppointment',
      'computeAvailableSlots',
      'computePublicAvailability',
      'createAppointment',
      'getPublicBookingOrigin',
      'isValidPublicBookingSlug',
      'normalizePublicBookingSlug',
      'rescheduleAppointment',
      'utcDayRange',
      'validateSelfServiceToken'
    ]);
    expect(typeof booking.normalizePublicBookingSlug).toBe('function');
    expect(typeof booking.isValidPublicBookingSlug).toBe('function');
    expect(booking.normalizePublicBookingSlug('  Peluquería   Ñandú Central  ')).toBe('peluqueria-nandu-central');
    expect(booking.isValidPublicBookingSlug('valid-slug-123')).toBe(true);
    expect(booking.isValidPublicBookingSlug(' --- ')).toBe(false);
    // Runtime (real gateway / api wrapper) stays in the dashboard — REQ-BOOKING-SPEC-2
    expect(booking).not.toHaveProperty('realSupabaseBookingGateway');
  });
});
