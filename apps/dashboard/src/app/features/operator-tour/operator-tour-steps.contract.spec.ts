import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_TOUR_STEPS,
  TOUR_ROUTES,
  TOUR_SETTINGS_TAB_ANCHOR_PREFIX,
  TOUR_SURFACE_BREAKPOINTS,
  TOUR_TARGET_ATTRIBUTE,
  filterOperatorTourSteps,
  isSameTourRoute,
  normalizeTourRoute,
  resolveTourSurface,
  settingsTabAnchor,
  type OperatorTourStep,
  type TourSurface,
  type TourSurfaceEnvironment,
} from './operator-tour-steps';

const dashboardRoot = resolve(process.cwd(), 'src/app');
// Fase 3 of #1098: the shared core lives in packages/dashboard-core.
const coreRoot = resolve(process.cwd(), '../../packages/dashboard-core/src');

const read = (relativePath: string): string =>
  readFileSync(resolve(dashboardRoot, relativePath), 'utf8');

const readCore = (relativePath: string): string =>
  readFileSync(resolve(coreRoot, relativePath), 'utf8');

/**
 * The dashboard ships the desktop and mobile variants of the same screen in one
 * DOM (Tailwind `lg:` classes), so a step may point at an element that exists
 * but is hidden on the active surface. Anchor presence is therefore asserted
 * against the real templates, not against a runtime viewport.
 */
const templateMarkup = [
  read('shared/dashboard-shell/dashboard-shell.component.html'),
  read('features/dashboard-home/pages/dashboard-home.page.html'),
  read('shared/dashboard-sidebar/templates/zen-sidebar.component.ts'),
  readCore('shell/mobile-bottom-nav/mobile-bottom-nav.component.ts'),
  read('features/operator-tour/operator-tour-help-button.component.ts'),
  // The journey now walks the first-steps pages, so their anchors are part of
  // the shipped contract too.
  read('features/servicios/pages/servicios.page.html'),
  read('features/settings/pages/themes/configuracion-zen-theme.component.html'),
].join('\n');

const templateDocument = new JSDOM(`<body>${templateMarkup}</body>`).window.document;

const ANCHOR_PATTERN = new RegExp(`^\\[${TOUR_TARGET_ATTRIBUTE}="([a-z0-9-]+)"\\]$`);
const TRACKED_PATTERN = new RegExp(`^\\[${TOUR_TARGET_ATTRIBUTE}=`);

const CONFIG_THEME_TEMPLATE = 'features/settings/pages/themes/configuracion-zen-theme.component.html';
const CONFIG_THEME_COMPONENT = 'features/settings/pages/themes/configuracion-zen-theme.component.ts';

/**
 * The settings tab buttons are rendered by one `@for`, so their anchors come
 * from the binding `[attr.data-tour]="'config-tab-' + tab.key"` and are not
 * literal attributes in the raw markup. The guard expands that binding from the
 * tab keys the component declares, so renaming or dropping a tab leaves the
 * matching step anchored to nothing and fails here instead of in production.
 */
function declaredConfigTabAnchors(): string[] {
  const bindsTabAnchors = read(CONFIG_THEME_TEMPLATE).includes(
    `[attr.data-tour]="'${TOUR_SETTINGS_TAB_ANCHOR_PREFIX}' + tab.key"`,
  );
  if (!bindsTabAnchors) return [];

  const tabsBlock = /readonly tabs\s*=\s*\[([\s\S]*?)\];/.exec(read(CONFIG_THEME_COMPONENT))?.[1] ?? '';

  return [...tabsBlock.matchAll(/key:\s*'([a-z0-9-]+)'/g)].map(
    (match) => `${TOUR_SETTINGS_TAB_ANCHOR_PREFIX}${match[1]}`,
  );
}

const DECLARED_CONFIG_TAB_ANCHORS = declaredConfigTabAnchors();

/**
 * A step whose anchor lives inside `@if (isActiveTab(...))` only exists once its
 * tab is active: the tab button is the step that proves which one the operator
 * picked, and the strip alone never did. The step also declares that tab, so the
 * tour can activate it when the operator advances with "Siguiente" instead.
 */
const TAB_GATED_CONTENT: readonly { readonly tab: string; readonly anchors: readonly string[] }[] = [
  { tab: settingsTabAnchor('negocio'), anchors: ['config-politicas', 'config-horarios'] },
  { tab: settingsTabAnchor('equipo'), anchors: ['config-equipo'] },
  {
    tab: settingsTabAnchor('perfil'),
    anchors: ['config-perfil-datos', 'config-perfil-contacto', 'config-perfil-cuenta'],
  },
];

function anchorName(target: string): string {
  return ANCHOR_PATTERN.exec(target)?.[1] ?? '';
}

function anchorIsRendered(name: string): boolean {
  if (DECLARED_CONFIG_TAB_ANCHORS.includes(name)) return true;

  return templateDocument.querySelector(`[${TOUR_TARGET_ATTRIBUTE}="${name}"]`) !== null;
}

function resolvesInTemplates(step: OperatorTourStep): boolean {
  const name = anchorName(step.target ?? '');

  return name ? anchorIsRendered(name) : templateDocument.querySelector(step.target ?? '') !== null;
}

function stepIndexOfAnchor(name: string): number {
  return OPERATOR_TOUR_STEPS.findIndex((step) => anchorName(step.target ?? '') === name);
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

  it('resolves the surface from the platform port primitive', () => {
    const desktopEnv: TourSurfaceEnvironment = {
      matchesMediaQuery: (query: string) => query === TOUR_SURFACE_BREAKPOINTS.desktop,
    };
    const mobileEnv: TourSurfaceEnvironment = {
      matchesMediaQuery: (query: string) => query === TOUR_SURFACE_BREAKPOINTS.mobile,
    };

    expect(resolveTourSurface(desktopEnv)).toBe<TourSurface>('desktop');
    expect(resolveTourSurface(mobileEnv)).toBe<TourSurface>('mobile');
  });

  it('falls back to desktop when the host cannot answer (SSR / tests)', () => {
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
    expect(mobileAnchors).toContain('mobile-nav');
    expect(mobileAnchors).toContain('mobile-header');
  });

  it('does not promise a business switcher the product does not have', () => {
    // The data model allows several businesses (`business_members`), but the app
    // resolves one active business and the only "selector" is a hidden stub
    // (`dashboard-sidebar.component.html`), so no menu can change businesses.
    const ids = OPERATOR_TOUR_STEPS.map((step) => step.id);
    const copy = OPERATOR_TOUR_STEPS.map((step) => `${step.title} ${step.description}`).join(' ');

    expect(ids).not.toContain('marca-negocio');
    expect(copy).not.toMatch(/m[áa]s de un negocio|cambi[áa]s de agenda/i);
  });

  it('leaves no orphan anchor behind in the shipped templates', () => {
    const declared = new Set(
      OPERATOR_TOUR_STEPS.map((step) => anchorName(step.target ?? '')).filter(Boolean),
    );
    const present = [
      ...[...templateDocument.querySelectorAll(`[${TOUR_TARGET_ATTRIBUTE}]`)]
        .map((element) => element.getAttribute(TOUR_TARGET_ATTRIBUTE) ?? '')
        .filter(Boolean),
      // Tab anchors come from a binding, so they are invisible to the raw
      // markup query above and have to be expanded explicitly.
      ...DECLARED_CONFIG_TAB_ANCHORS,
    ];

    expect(present.length).toBeGreaterThan(0);
    for (const name of new Set(present)) {
      expect(declared.has(name), `anchor ${name} is not used by any step`).toBe(true);
    }
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

  it('declares the shell route of every anchored step', () => {
    for (const step of OPERATOR_TOUR_STEPS) {
      if (!step.target) continue;

      expect(step.route, `${step.id} needs the route its anchor lives on`).toBeTruthy();
    }
  });

  it('normalizes both shell mounts to one route identity', () => {
    expect(normalizeTourRoute('/dashboard/servicios/')).toBe('/servicios');
    expect(normalizeTourRoute('/servicios')).toBe('/servicios');
    expect(normalizeTourRoute('/dashboard/inicio?tab=equipo')).toBe('/inicio');
    expect(normalizeTourRoute('/dashboard/servicios#team')).toBe('/servicios');
    expect(isSameTourRoute('/dashboard/servicios', '/servicios')).toBe(true);
    expect(isSameTourRoute('/dashboard/servicios', '/dashboard/configuracion')).toBe(false);
  });

  it('keeps first-steps anchors that are not mounted yet on the active route', () => {
    const ids = filterOperatorTourSteps('desktop', {
      activeRoute: TOUR_ROUTES.inicio,
      hasElement: () => false,
    }).map((step) => step.id);

    // The servicios and configuracion pages are not in the DOM while the tour
    // is planned on Inicio, so a probe miss must not delete the journey.
    expect(ids).toContain('primer-paso-servicios');
    expect(ids).toContain('configuracion-politicas');
    expect(ids).toContain('configuracion-equipo');
  });

  it('probes the anchors of the active route only', () => {
    const dropped = filterOperatorTourSteps('desktop', {
      activeRoute: TOUR_ROUTES.configuracion,
      hasElement: () => false,
    }).map((step) => step.id);
    const kept = filterOperatorTourSteps('desktop', {
      activeRoute: TOUR_ROUTES.configuracion,
      hasElement: (selector: string) => anchorName(selector) === 'config-equipo',
    }).map((step) => step.id);

    // On its own route the detail step depends on the picked tab, so the probe
    // is the authority there...
    expect(dropped).not.toContain('configuracion-equipo');
    expect(kept).toContain('configuracion-equipo');
    expect(kept).not.toContain('configuracion-politicas');
    // ...while steps from other routes stay planned: they are not mounted yet.
    expect(dropped).toContain('primer-paso-servicios');
  });

  it('walks the first steps in order: services, business, team, profile, then the link', () => {
    const ids = OPERATOR_TOUR_STEPS.map((step) => step.id);

    expect(ids.indexOf('primer-paso-servicios')).toBeLessThan(ids.indexOf('configuracion-general'));
    expect(ids.indexOf('configuracion-politicas')).toBeLessThan(ids.indexOf('configuracion-tab-equipo'));
    expect(ids.indexOf('configuracion-equipo')).toBeLessThan(ids.indexOf('configuracion-tab-perfil'));
    expect(ids.indexOf('configuracion-perfil-cuenta')).toBeLessThan(ids.indexOf('compartir-link'));
  });

  it('anchors the first steps on the real first-steps pages', () => {
    const required = [
      'servicios-add',
      'config-tabs',
      'config-politicas',
      'config-horarios',
      'config-equipo',
      'config-perfil-datos',
      'config-perfil-contacto',
      'config-perfil-cuenta',
    ];

    for (const name of required) {
      expect(anchorIsRendered(name), `${name} is missing from the shipped templates`).toBe(true);
    }
  });

  it('asks for the exact tab button before highlighting the content behind it', () => {
    for (const { tab, anchors } of TAB_GATED_CONTENT) {
      const tabIndex = stepIndexOfAnchor(tab);

      expect(tabIndex, `${tab} has no step`).toBeGreaterThanOrEqual(0);
      const tabStep = OPERATOR_TOUR_STEPS[tabIndex];
      expect(tabStep?.advanceOnClick, `${tab} must advance when the operator taps it`).toBe(true);

      for (const name of anchors) {
        const contentIndex = stepIndexOfAnchor(name);

        expect(contentIndex, `${name} has no step`).toBeGreaterThan(tabIndex);
        // The closest tab step before the content is the tab that renders it.
        const previousTabStep = OPERATOR_TOUR_STEPS.slice(0, contentIndex)
          .reverse()
          .find((step) => DECLARED_CONFIG_TAB_ANCHORS.includes(anchorName(step.target ?? '')));

        expect(
          anchorName(previousTabStep?.target ?? ''),
          `${name} is not preceded by ${tab}`,
        ).toBe(tab);
      }
    }
  });

  it('never waits for a tab click on the whole strip', () => {
    // The stall in #1153: the team step highlighted the strip and advanced on
    // any click over it, so the tour moved on with the active tab still on
    // Perfil and the team content step had no anchor to highlight.
    const stripStep = OPERATOR_TOUR_STEPS.find(
      (step) => anchorName(step.target ?? '') === 'config-tabs',
    );

    expect(stripStep).toBeDefined();
    expect(stripStep?.advanceOnClick ?? false).toBe(false);
  });

  it('keeps every tab-gated content step optional so a missing tab is skipped', () => {
    for (const { anchors } of TAB_GATED_CONTENT) {
      for (const name of anchors) {
        const step = OPERATOR_TOUR_STEPS.find((candidate) => anchorName(candidate.target ?? '') === name);

        expect(step?.optional, `${name} must be optional`).toBe(true);
      }
    }
  });

  it('declares the settings tab each tab-gated step lives in', () => {
    // The popover's "Siguiente" has to reach the panel too, and the panel only
    // mounts once its tab is active: the step carries the tab so the tour can
    // activate it, instead of relying on the operator tapping the button.
    for (const { tab, anchors } of TAB_GATED_CONTENT) {
      const expectedTab = tab.slice(TOUR_SETTINGS_TAB_ANCHOR_PREFIX.length);

      for (const name of anchors) {
        const step = OPERATOR_TOUR_STEPS.find((candidate) => anchorName(candidate.target ?? '') === name);

        expect(step?.settingsTab, `${name} must declare the ${expectedTab} tab`).toBe(expectedTab);
      }
    }
  });

  it('builds the tab anchors from the tab names, never a hand-written string', () => {
    expect(settingsTabAnchor('negocio')).toBe(`${TOUR_SETTINGS_TAB_ANCHOR_PREFIX}negocio`);

    for (const { tab } of TAB_GATED_CONTENT) {
      const step = OPERATOR_TOUR_STEPS.find((candidate) => anchorName(candidate.target ?? '') === tab);

      expect(step, `${tab} has no step`).toBeDefined();
      expect(step?.settingsTab, `${tab} is a tab button, not a panel`).toBeUndefined();
    }
  });

  it('covers every settings tab the page renders', () => {
    expect(DECLARED_CONFIG_TAB_ANCHORS.length).toBeGreaterThan(0);
    expect(new Set(DECLARED_CONFIG_TAB_ANCHORS)).toEqual(
      new Set(TAB_GATED_CONTENT.map((entry) => entry.tab)),
    );
    for (const { tab } of TAB_GATED_CONTENT) {
      expect(stepIndexOfAnchor(tab), `${tab} has no step`).toBeGreaterThanOrEqual(0);
    }
  });

  it('closes the journey back on the home route so the link step is reachable', () => {
    const linkStep = OPERATOR_TOUR_STEPS.find((step) => step.id === 'compartir-link');

    expect(linkStep?.route).toBe(TOUR_ROUTES.inicio);
    expect(linkStep?.target).toBe(`[${TOUR_TARGET_ATTRIBUTE}="home-booking-portal"]`);
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
    expect(ids).not.toContain('compartir-link');
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

    // On a bare Inicio the journey keeps the welcome, the mobile navigation,
    // the replay control and every first-steps step that lives elsewhere.
    expect(ids).toEqual([
      'inicio-tour',
      'navegacion-movil',
      'primer-paso-servicios',
      'configuracion-general',
      'configuracion-tab-negocio',
      'configuracion-politicas',
      'configuracion-horarios',
      'configuracion-tab-equipo',
      'configuracion-equipo',
      'configuracion-tab-perfil',
      'configuracion-perfil-datos',
      'configuracion-perfil-contacto',
      'configuracion-perfil-cuenta',
      'repetir-tutorial',
    ]);
  });
});
