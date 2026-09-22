/**
 * Operator onboarding tour: step contract.
 *
 * The dashboard ships the desktop and mobile layouts of the same screen in one
 * DOM (Tailwind `lg:` classes), so a step declares the surfaces it belongs to
 * and is filtered twice:
 *
 * 1. by the active surface (viewport), and
 * 2. by anchor presence at runtime (optional steps are dropped instead of
 *    highlighted against a missing element).
 *
 * Anchors use the `data-tour` attribute so selectors survive restyling and stay
 * greppable from the codebase.
 */

export const TOUR_TARGET_ATTRIBUTE = 'data-tour';

export const TOUR_SURFACE_BREAKPOINTS = {
  mobile: '(max-width: 1023px)',
  desktop: '(min-width: 1024px)',
} as const;

export type TourSurface = keyof typeof TOUR_SURFACE_BREAKPOINTS;

export type TourPopoverSide = 'top' | 'right' | 'bottom' | 'left';
export type TourPopoverAlign = 'start' | 'center' | 'end';

export interface OperatorTourStep {
  /** Stable, kebab-case identity. Used by tests and by the help telemetry. */
  readonly id: string;
  /** CSS selector for a `data-tour` anchor. Absent for element-less steps. */
  readonly target?: string;
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
}

export interface OperatorTourFilterOptions {
  /**
   * Runtime anchor probe, applied to optional steps only. Defaults to a DOM
   * presence query. Presence is enough because Angular only renders an element
   * when its branch is active; the desktop/mobile split is decided by the
   * `surfaces` declaration instead (a `lg:hidden` nav is still in the DOM).
   */
  readonly hasElement?: (selector: string) => boolean;
}

export interface TourMatchMediaEnvironment {
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

const anchor = (name: string): string => `[${TOUR_TARGET_ATTRIBUTE}="${name}"]`;

export const OPERATOR_TOUR_STEPS: readonly OperatorTourStep[] = [
  {
    id: 'inicio-tour',
    surfaces: ['desktop', 'mobile'],
    title: 'Tu agenda, ahora en Orvel',
    description:
      'Te muestro en un minuto cómo ver tus turnos, compartir tu link de reservas y encontrar cada sección. Podés salir cuando quieras.',
  },
  {
    id: 'marca-negocio',
    target: anchor('sidebar-logo'),
    surfaces: ['desktop'],
    title: 'El negocio activo',
    description:
      'Acá ves el negocio con el que estás operando. Si manejás más de uno, desde el menú cambiás de agenda sin cerrar sesión.',
    side: 'right',
    align: 'start',
  },
  {
    id: 'navegacion-lateral',
    target: anchor('sidebar-nav'),
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
    surfaces: ['desktop', 'mobile'],
    title: 'Próximos turnos',
    description:
      'Los turnos que vienen, con cliente, servicio y hora. Si un turno espera seña, lo confirmás desde acá en un toque.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'acciones-rapidas',
    target: anchor('home-quick-actions'),
    surfaces: ['desktop', 'mobile'],
    title: 'Crear turno a mano',
    description:
      '¿Te escriben por WhatsApp? Cargá el turno desde acá, aunque el cliente no haya reservado por el link.',
    side: 'top',
    align: 'start',
    optional: true,
  },
  {
    id: 'panel-reservas',
    target: anchor('home-booking-portal'),
    surfaces: ['desktop', 'mobile'],
    title: 'Tu link de reservas',
    description:
      'Compartilo en tu bio de Instagram o por WhatsApp. Todo lo que reserven tus clientes cae directo en tu agenda.',
    side: 'left',
    align: 'center',
    optional: true,
  },
  {
    id: 'repetir-tutorial',
    target: anchor('tour-help'),
    surfaces: ['desktop', 'mobile'],
    title: '¿Lo querés ver de nuevo?',
    description:
      'Tocá este botón cuando quieras y el tutorial arranca otra vez desde el principio. Cualquier duda, escribinos.',
    side: 'left',
    align: 'end',
  },
];

/** SSR, jsdom and very old browsers fall back to the desktop tour. */
export function resolveTourSurface(environment: TourMatchMediaEnvironment): TourSurface {
  try {
    const mobile = environment.matchMedia?.(TOUR_SURFACE_BREAKPOINTS.mobile);
    if (mobile?.matches) return 'mobile';
    const desktop = environment.matchMedia?.(TOUR_SURFACE_BREAKPOINTS.desktop);
    if (desktop?.matches) return 'desktop';
  } catch {
    // A throwing matchMedia must not break the shell bootstrap.
  }
  return 'desktop';
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

  return OPERATOR_TOUR_STEPS.filter((step) => {
    if (!step.surfaces.includes(surface)) {
      return false;
    }
    if (!step.target || !step.optional) {
      return true;
    }
    return hasElement(step.target);
  });
}
