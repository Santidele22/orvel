/**
 * Operator first-run tour: step contract.
 *
 * The dashboard ships the desktop and mobile layouts of the same screen in one
 * DOM (Tailwind `lg:` classes), so a step declares the surfaces it belongs to
 * and is filtered twice:
 *
 * 1. by the active surface (viewport), and
 * 2. by anchor presence at runtime (optional steps are dropped instead of
 *    highlighted against a missing element).
 *
 * The journey also walks the app (#1136), so every anchored step declares the
 * shell route its anchor lives on. The presence probe only applies to the route
 * the plan is built on: an anchor on another page is not in the DOM yet, and
 * dropping it would delete the first-steps journey before it starts.
 *
 * Anchors use the `data-tour` attribute so selectors survive restyling and stay
 * greppable from the codebase.
 */

export const TOUR_TARGET_ATTRIBUTE = 'data-tour';

/**
 * Class driver.js puts on the popover wrapper. The dashboard stylesheet themes
 * the popover through it, because driver.js ships a light default theme.
 */
export const OPERATOR_TOUR_POPOVER_CLASS = 'orvel-operator-tour';

/**
 * Shell routes the journey walks. The shell is mounted at `/dashboard/*` and at
 * the root, so both spellings resolve to the same route identity here.
 */
export const TOUR_ROUTES = {
  inicio: '/dashboard/inicio',
  servicios: '/dashboard/servicios',
  configuracion: '/dashboard/configuracion',
} as const;

export const TOUR_SURFACE_BREAKPOINTS = {
  mobile: '(max-width: 1023px)',
  desktop: '(min-width: 1024px)',
} as const;

export type TourSurface = keyof typeof TOUR_SURFACE_BREAKPOINTS;

/**
 * Settings tabs of the configuration page. The name is the tab `key` the page
 * renders, so the anchor a step needs can be derived from it once.
 */
export type TourSettingsTab = 'perfil' | 'negocio' | 'equipo';

/**
 * Prefix of the tab button anchors, shared with the template binding
 * `[attr.data-tour]="'config-tab-' + tab.key"` so the two cannot drift.
 */
export const TOUR_SETTINGS_TAB_ANCHOR_PREFIX = 'config-tab-';

export function settingsTabAnchor(tab: TourSettingsTab): string {
  return `${TOUR_SETTINGS_TAB_ANCHOR_PREFIX}${tab}`;
}

export type TourPopoverSide = 'top' | 'right' | 'bottom' | 'left';
export type TourPopoverAlign = 'start' | 'center' | 'end';

export interface OperatorTourStep {
  /** Stable, kebab-case identity. Used by tests and by the help telemetry. */
  readonly id: string;
  /** CSS selector for a `data-tour` anchor. Absent for element-less steps. */
  readonly target?: string;
  /** Shell route the anchor lives on. Absent only for the element-less opener. */
  readonly route?: string;
  /** Surfaces on which this step is meaningful. */
  readonly surfaces: readonly TourSurface[];
  readonly title: string;
  readonly description: string;
  readonly side?: TourPopoverSide;
  readonly align?: TourPopoverAlign;
  /**
   * When true the step is dropped if its anchor is not in the DOM. Every
   * content step is optional so the tour still completes on an empty agenda.
   */
  readonly optional?: boolean;
  /**
   * Advance when the operator clicks the highlighted element. The settings tabs
   * are picked by the operator instead of being switched behind their back, so
   * the tour never describes a tab the operator is not looking at.
   */
  readonly advanceOnClick?: boolean;
  /**
   * Settings tab whose panel holds this anchor. The panel is rendered by
   * `@if (isActiveTab(...))`, so without this the step has no anchor until the
   * operator taps the tab, and "Siguiente" would skip it. The tour activates the
   * tab instead, which keeps both ways of moving forward working.
   */
  readonly settingsTab?: TourSettingsTab;
}

export interface OperatorTourFilterOptions {
  /**
   * Runtime anchor probe, applied to optional steps only. Defaults to a DOM
   * presence query. Presence is enough because Angular only renders an element
   * when its branch is active; the desktop/mobile split is decided by the
   * `surfaces` declaration instead (a `lg:hidden` nav is still in the DOM).
   */
  readonly hasElement?: (selector: string) => boolean;
  /**
   * Shell route the plan is built on. Defaults to the tour's start route,
   * because the shell only auto-runs the tour on the home route.
   */
  readonly activeRoute?: string;
}

/**
 * Fase 2 of #1098: the surface decision takes the platform port's primitive
 * (`matchesMediaQuery`) instead of a `matchMedia` object, so the host access
 * lives in `core/platform` and this stays a pure function.
 */
export interface TourSurfaceEnvironment {
  readonly matchesMediaQuery?: (query: string) => boolean;
}

const anchor = (name: string): string => `[${TOUR_TARGET_ATTRIBUTE}="${name}"]`;

export const OPERATOR_TOUR_STEPS: readonly OperatorTourStep[] = [
  {
    id: 'inicio-tour',
    surfaces: ['desktop', 'mobile'],
    title: 'Bienvenida a Orvel',
    description:
      'Orvel es tu agenda de turnos online: tus clientes reservan solos desde tu link y todo cae en este panel. Te muestro qué ofrecemos y los primeros pasos. Podés salir cuando quieras.',
  },
  {
    id: 'navegacion-lateral',
    target: anchor('sidebar-nav'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['desktop'],
    title: 'Todas tus secciones',
    description:
      'Desde el menú lateral entrás a Turnos, Clientes, Servicios y Configuración. En escritorio esta columna queda siempre visible.',
    side: 'right',
    align: 'start',
  },
  {
    id: 'encabezado-movil',
    target: anchor('mobile-header'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['mobile'],
    title: 'Tu resumen del día',
    description:
      'En el celular arrancás acá: el saludo, la fecha y tu cuenta. Deslizá hacia abajo para ver el resto del resumen.',
    side: 'bottom',
    align: 'center',
    optional: true,
  },
  {
    id: 'navegacion-movil',
    target: anchor('mobile-nav'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['mobile'],
    title: 'Navegación rápida',
    description:
      'Con el dedo saltás entre Inicio, Agenda, Clientes, Avisos y Perfil. Es la misma información que en la versión de escritorio.',
    side: 'top',
    align: 'center',
  },
  {
    id: 'metrica-operativa',
    target: anchor('home-metrics'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['desktop', 'mobile'],
    title: 'Cómo viene el día',
    description:
      'Turnos agendados, horarios libres y ocupación de hoy. Se actualiza solo cuando entra, se cancela o se reprograma un turno.',
    side: 'bottom',
    align: 'start',
    optional: true,
  },
  {
    id: 'agenda-hoy',
    target: anchor('home-agenda'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['desktop', 'mobile'],
    title: 'Próximos turnos',
    description:
      'Los turnos que vienen, con cliente, servicio y hora.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'acciones-rapidas',
    target: anchor('home-quick-actions'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['desktop', 'mobile'],
    title: 'Crear turno a mano',
    description:
      '¿Te escriben por WhatsApp? Cargá el turno desde acá, aunque el cliente no haya reservado por el link.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'primer-paso-servicios',
    target: anchor('servicios-add'),
    route: TOUR_ROUTES.servicios,
    surfaces: ['desktop', 'mobile'],
    title: 'Paso 1: cargá tus servicios',
    description:
      'Cada servicio con su duración y precio. Es lo que tus clientes van a poder reservar desde tu link, así que empezá por acá.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'configuracion-general',
    target: anchor('config-tabs'),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    title: 'Paso 2: configurá tu negocio',
    description:
      'Configuración tiene tres pestañas: Negocio (reglas y horarios), Equipo (profesionales) y Perfil (tus datos y tu plan). Te muestro las tres.',
    side: 'bottom',
    align: 'center',
  },
  {
    // Anchors inside `@if (isActiveTab(...))` only exist once their tab is
    // active, so the tour asks for the exact button before walking the content.
    // The strip is always in the DOM and never proved which tab was picked.
    id: 'configuracion-tab-negocio',
    target: anchor(settingsTabAnchor('negocio')),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    title: 'Empezá por Negocio',
    description:
      'Tocá Negocio y seguimos: ahí están las reglas de reserva y los horarios de atención del local.',
    side: 'bottom',
    align: 'center',
    advanceOnClick: true,
  },
  {
    id: 'configuracion-politicas',
    target: anchor('config-politicas'),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    settingsTab: 'negocio',
    title: 'Políticas y logística',
    description:
      'Aprobación de turnos (automática o manual), anticipación mínima, cancelación y pausas. Lo que guardes, tus clientes lo ven al instante.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'configuracion-horarios',
    target: anchor('config-horarios'),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    settingsTab: 'negocio',
    title: 'Horarios de atención',
    description:
      'Días y franjas del local, con descansos y bloqueos. Son los que tu portal usa para ofrecer turnos disponibles.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'configuracion-tab-equipo',
    target: anchor(settingsTabAnchor('equipo')),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    title: 'Paso 3: tu equipo (si hace falta)',
    description:
      'Si atendés sola o solo, salteá este paso sin problema. Si tenés equipo, tocá Equipo y cargá a cada profesional.',
    side: 'bottom',
    align: 'center',
    advanceOnClick: true,
  },
  {
    id: 'configuracion-equipo',
    target: anchor('config-equipo'),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    settingsTab: 'equipo',
    title: 'Profesionales y agenda',
    description:
      'Sumá profesionales, elegí con qué servicios atiende cada uno y si el cliente puede elegir con quién atenderse. Cada uno tiene su link.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'configuracion-tab-perfil',
    target: anchor(settingsTabAnchor('perfil')),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    title: 'Y acá, lo tuyo',
    description: 'Tocá Perfil para ver tus datos, el contacto que ve el cliente y tu cuenta.',
    side: 'bottom',
    align: 'center',
    advanceOnClick: true,
  },
  {
    id: 'configuracion-perfil-datos',
    target: anchor('config-perfil-datos'),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    settingsTab: 'perfil',
    title: 'Tus datos personales',
    description:
      'Tu nombre, apellido y teléfono: los usamos para avisarte de tus turnos. No se publican en tu portal.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'configuracion-perfil-contacto',
    target: anchor('config-perfil-contacto'),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    settingsTab: 'perfil',
    title: 'Contacto público',
    description:
      'El correo de soporte que ve tu cliente cuando entra al portal de reservas.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'configuracion-perfil-cuenta',
    target: anchor('config-perfil-cuenta'),
    route: TOUR_ROUTES.configuracion,
    surfaces: ['desktop', 'mobile'],
    settingsTab: 'perfil',
    title: 'Cuenta y suscripción',
    description:
      'Cambiá tu email o tu contraseña desde acá y mirá tu plan actual. Premium se activa a mano.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'compartir-link',
    target: anchor('home-booking-portal'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['desktop', 'mobile'],
    title: 'Paso 4: compartí tu link',
    description:
      'Este es tu link de reservas. Pegalo en la bio de Instagram o mandalo por WhatsApp: todo lo que reserven cae directo en tu agenda.',
    side: 'left',
    align: 'center',
    optional: true,
  },
  {
    id: 'repetir-tutorial',
    target: anchor('tour-help'),
    route: TOUR_ROUTES.inicio,
    surfaces: ['desktop', 'mobile'],
    title: '¿Lo querés ver de nuevo?',
    description:
      'Tocá este botón cuando quieras y el tutorial arranca otra vez desde el principio. Cualquier duda, escribinos.',
    side: 'left',
    align: 'end',
  },
];

/** SSR, jsdom and very old browsers fall back to the desktop tour. */
export function resolveTourSurface(environment: TourSurfaceEnvironment): TourSurface {
  try {
    if (environment.matchesMediaQuery?.(TOUR_SURFACE_BREAKPOINTS.mobile)) return 'mobile';
    if (environment.matchesMediaQuery?.(TOUR_SURFACE_BREAKPOINTS.desktop)) return 'desktop';
  } catch {
    // A throwing host query must not break the shell bootstrap.
  }
  return 'desktop';
}

/**
 * `/dashboard/servicios/` and `/servicios` are the same destination: the shell
 * is mounted twice (the `dashboard/*` prefix and the root), so route identity
 * must not depend on which door the operator came in through.
 */
export function normalizeTourRoute(url: string): string {
  const path = (url.split('?')[0] ?? '').split('#')[0] ?? '';
  const withoutShellPrefix = path.startsWith('/dashboard/')
    ? path.slice('/dashboard'.length)
    : path === '/dashboard'
      ? '/'
      : path;
  const trimmed = withoutShellPrefix.replace(/\/+$/, '');

  return trimmed === '' ? '/' : trimmed;
}

export function isSameTourRoute(left: string, right: string): boolean {
  return normalizeTourRoute(left) === normalizeTourRoute(right);
}

/**
 * The shell renders `<app-mobile-bottom-nav>` at every width and hides it with
 * `lg:hidden`, so a hidden element still answers `querySelector`. That is why
 * the surface decision comes from `surfaces` and this probe only guards the
 * optional content steps (which the page may not render at all).
 */
function isPresentInDom(selector: string): boolean {
  try {
    if (typeof document === 'undefined') return true;
    return document.querySelector(selector) !== null;
  } catch {
    return false;
  }
}

export function filterOperatorTourSteps(
  surface: TourSurface,
  options: OperatorTourFilterOptions = {},
): OperatorTourStep[] {
  const hasElement = options.hasElement ?? isPresentInDom;
  const activeRoute = options.activeRoute ?? TOUR_ROUTES.inicio;

  return OPERATOR_TOUR_STEPS.filter((step) => {
    if (!step.surfaces.includes(surface)) {
      return false;
    }
    if (!step.target || !step.optional) {
      return true;
    }
    // A step on another route has no DOM to probe yet. Its anchor is verified
    // after the journey navigates there, by driver.js `waitForElement` and by
    // the skip-missing-element rule.
    if (step.route && !isSameTourRoute(step.route, activeRoute)) {
      return true;
    }
    return hasElement(step.target);
  });
}
