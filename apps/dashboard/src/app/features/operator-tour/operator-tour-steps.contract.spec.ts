import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_TOUR_STEPS,
  TOUR_SURFACE_BREAKPOINTS,
  TOUR_TARGET_ATTRIBUTE,
  filterOperatorTourSteps,
  resolveTourSurface,
  type OperatorTourStep,
  type TourSurface,
  type TourSurfaceEnvironment,
} from './operator-tour-steps';

const dashboardRoot = resolve(process.cwd(), 'src/app');

const read = (relativePath: string): string =>
  readFileSync(resolve(dashboardRoot, relativePath), 'utf8');

/**
 * The dashboard ships the desktop and mobile variants of the same screen in one
 * DOM (Tailwind `lg:` classes), so a step may point at an element that exists
 * but is hidden on the active surface. Anchor presence is therefore asserted
 * against the real templates, not against a runtime viewport.
 */
const templateMarkup = [
  'shared/dashboard-shell/dashboard-shell.component.html',
  'features/dashboard-home/pages/dashboard-home.page.html',
  'shared/dashboard-sidebar/templates/zen-sidebar.component.ts',
  'core/shell/mobile-bottom-nav/mobile-bottom-nav.component.ts',
  'features/operator-tour/operator-tour-help-button.component.ts',
]
  .map(read)
  .join('\n');

const templateDocument = new JSDOM(`<body>${templateMarkup}</body>`).window.document;

const ANCHOR_PATTERN = new RegExp(`^\\[${TOUR_TARGET_ATTRIBUTE}="([a-z0-9-]+)"\\]$`);
const TRACKED_PATTERN = new RegExp(`^\\[${TOUR_TARGET_ATTRIBUTE}=`);

function anchorName(target: string): string {
  return ANCHOR_PATTERN.exec(target)?.[1] ?? '';
}

function resolvesInTemplates(step: OperatorTourStep): boolean {
  return templateDocument.querySelector(step.target ?? '') !== null;
}

const trackedSteps = OPERATOR_TOUR_STEPS.filter((step) => TRACKED_PATTERN.test(step.target ?? ''));

describe('operator tour steps contract', () => {
  it('uses one documented target attribute so anchors stay greppable', () => {
    expect(TOUR_TARGET_ATTRIBUTE).toBe('data-tour');
  });

  it('declares the breakpoints that match the dashboard shell', () => {
    expect(TOUR_SURFACE_BREAKPOINTS.mobile).toBe('(max-width: 1023px)');
    expect(TOUR_SURFACE_BREAKPOINTS.desktop).toBe('(min-width: 1024px)');
  });

  it('resolves the surface from a matchMedia-like environment', () => {
    const desktopEnv: TourSurfaceEnvironment = {
      matchMedia: (query: string) => ({ matches: query === TOUR_SURFACE_BREAKPOINTS.desktop }),
    };
    const mobileEnv: TourSurfaceEnvironment = {
      matchMedia: (query: string) => ({ matches: query === TOUR_SURFACE_BREAKPOINTS.mobile }),
    };

    expect(resolveTourSurface(desktopEnv)).toBe<TourSurface>('desktop');
    expect(resolveTourSurface(mobileEnv)).toBe<TourSurface>('mobile');
  });

  it('falls back to desktop when matchMedia is unavailable (SSR / tests)', () => {
    expect(resolveTourSurface({})).toBe<TourSurface>('desktop');
  });

  it('allows element-less steps and at least one exists', () => {
    const elementLessSteps = OPERATOR_TOUR_STEPS.filter((step) => !step.target);

    expect(elementLessSteps.length).toBeGreaterThan(0);
    expect(elementLessSteps.every((step) => step.surfaces.length > 0)).toBe(true);
  });

  it('gives every step operator-facing copy that fits a phone popover', () => {
    for (const step of OPERATOR_TOUR_STEPS) {
      expect(step.title.trim(), `${step.id} needs a title`).not.toBe('');
      expect(step.description.trim(), `${step.id} needs a description`).not.toBe('');
      expect(
        step.description.length,
        `${step.id} description must stay short enough for a phone popover`,
      ).toBeLessThanOrEqual(220);
    }
  });

  it('declares at least one supported surface per step', () => {
    for (const step of OPERATOR_TOUR_STEPS) {
      expect(step.surfaces.length, `${step.id} must declare surfaces`).toBeGreaterThan(0);
      for (const surface of step.surfaces) {
        expect(['mobile', 'desktop'], `${step.id} has an unknown surface`).toContain(surface);
      }
    }
  });

  it('exposes stable, unique step ids', () => {
    const ids = OPERATOR_TOUR_STEPS.map((step) => step.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('anchors every tracked step through data-tour, never a stale CSS path', () => {
    expect(trackedSteps.length).toBeGreaterThan(0);
    for (const step of trackedSteps) {
      expect(anchorName(step.target ?? ''), `${step.id} has a malformed anchor`).not.toBe('');
      expect(
        resolvesInTemplates(step),
        `${step.id} target ${step.target} is missing from the shipped templates`,
      ).toBe(true);
    }
  });

  it('starts with an element-less welcome step valid on both surfaces', () => {
    expect(OPERATOR_TOUR_STEPS[0]?.target).toBeFalsy();
    expect(OPERATOR_TOUR_STEPS[0]?.surfaces).toEqual(['desktop', 'mobile']);
  });

  it('ends with the replay control so the operator learns how to repeat it', () => {
    const last = OPERATOR_TOUR_STEPS.at(-1);

    expect(last?.target).toBe(`[${TOUR_TARGET_ATTRIBUTE}="tour-help"]`);
    expect(last?.surfaces).toEqual(['desktop', 'mobile']);
  });

  it('covers the desktop shell and the mobile shell with distinct anchors', () => {
    const desktopAnchors = OPERATOR_TOUR_STEPS.filter((step) =>
      step.surfaces.includes('desktop'),
    ).map((step) => anchorName(step.target ?? ''));
    const mobileAnchors = OPERATOR_TOUR_STEPS.filter((step) =>
      step.surfaces.includes('mobile'),
    ).map((step) => anchorName(step.target ?? ''));

    expect(desktopAnchors).toContain('sidebar-nav');
    expect(desktopAnchors).toContain('sidebar-logo');
    expect(mobileAnchors).toContain('mobile-nav');
    expect(mobileAnchors).toContain('mobile-header');
  });

  it('keeps the shared home metrics step available on both surfaces', () => {
    const metricsStep = OPERATOR_TOUR_STEPS.find((step) => step.id === 'metrica-operativa');

    expect(metricsStep?.surfaces).toEqual(['desktop', 'mobile']);
    expect(metricsStep?.target).toBe(`[${TOUR_TARGET_ATTRIBUTE}="home-metrics"]`);
  });

  it('filters steps per surface while preserving contract order', () => {
    const desktop = filterOperatorTourSteps('desktop');
    const mobile = filterOperatorTourSteps('mobile');

    expect(desktop.map((step) => step.id)).toEqual(
      OPERATOR_TOUR_STEPS.filter((step) => step.surfaces.includes('desktop')).map((step) => step.id),
    );
    expect(mobile.map((step) => step.id)).toEqual(
      OPERATOR_TOUR_STEPS.filter((step) => step.surfaces.includes('mobile')).map((step) => step.id),
    );
    expect(desktop.map((step) => step.id)).not.toEqual(mobile.map((step) => step.id));
    expect(desktop.at(-1)?.id).toBe('repetir-tutorial');
    expect(mobile.at(-1)?.id).toBe('repetir-tutorial');
  });

  it('drops optional steps whose anchor is absent at runtime', () => {
    const presentAnchors = new Set(['sidebar-nav', 'home-metrics', 'tour-help']);
    const filtered = filterOperatorTourSteps('desktop', {
      hasElement: (selector: string) => {
        const name = anchorName(selector);
        // Element-less steps and unknown selectors stay; only data-tour anchors
        // are subject to the presence check.
        if (!name) return true;
        return presentAnchors.has(name);
      },
    });
    const ids = filtered.map((step) => step.id);

    expect(ids).toContain('inicio-tour');
    expect(ids).toContain('metrica-operativa');
    expect(ids).toContain('navegacion-lateral');
    expect(ids.at(-1)).toBe('repetir-tutorial');
    expect(ids).not.toContain('panel-reservas');
  });

  it('always keeps structural anchors, even when the probe rejects them', () => {
    const filtered = filterOperatorTourSteps('mobile', { hasElement: () => false });
    const ids = filtered.map((step) => step.id);

    // The shell always renders these, so a probe miss must not silently remove
    // the navigation tour. Only optional content steps consult the probe.
    expect(ids).toContain('navegacion-movil');
    expect(ids).toContain('repetir-tutorial');
  });

  it('never returns an empty tour: the element-less welcome survives a bare DOM', () => {
    const filtered = filterOperatorTourSteps('mobile', { hasElement: () => false });
    const ids = filtered.map((step) => step.id);

    expect(ids).toEqual(['inicio-tour', 'navegacion-movil', 'repetir-tutorial']);
  });
});
