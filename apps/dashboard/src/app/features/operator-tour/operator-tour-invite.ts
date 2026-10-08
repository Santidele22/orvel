/**
 * First-run invite: the modal that asks before the tour takes over the screen.
 *
 * The tour used to open by itself, but only on the home route (#1136) — and a
 * new operator lands on the agenda, so it never fired. Worse, nobody was asked:
 * an unannounced tour hijacks the screen of someone who just signed up.
 *
 * The invite is the front door, and it is deliberately thin: the decision
 * belongs to the shell chrome port, this module only names the copy and guards
 * a gate that may be absent (SSR, or a shell rendered without the feature).
 */

export const TOUR_INVITE_TITLE = '¿Te muestro Orvel en un minuto?';

export const TOUR_INVITE_DESCRIPTION =
  'Te cuento qué podés hacer con Orvel y los primeros pasos: cargar tus servicios, configurar tu negocio y compartir tu link de reservas.';

export const TOUR_INVITE_ACCEPT_LABEL = 'Sí, mostrame el tour';

export const TOUR_INVITE_DECLINE_LABEL = 'Ahora no';

/** The slice of `DashboardTourPort` the invite needs to decide. */
export interface TourInviteGate {
  canAutoStart(): boolean;
}

export function shouldOfferTourInvite(gate: TourInviteGate | null | undefined): boolean {
  if (!gate) {
    return false;
  }

  try {
    return gate.canAutoStart();
  } catch {
    // A throwing gate (blocked storage, private mode) must not break the shell.
    return false;
  }
}
