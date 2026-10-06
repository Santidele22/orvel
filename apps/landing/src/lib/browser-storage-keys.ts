export const SIGNUP_STORAGE_KEYS = {
  plan: 'orvel.signup.plan',
  billing: 'orvel.signup.billing',
  email: 'orvel.signup.email',
  nombre: 'orvel.signup.nombre',
  apellido: 'orvel.signup.apellido',
  negocioNombre: 'orvel.signup.negocioNombre',
  telefono: 'orvel.signup.telefono',
  tipoNegocio: 'orvel.signup.tipoNegocio',
  pendingSignupIntent: 'orvel.signup.pending_signup_intent',
  accountFirstSession: 'orvel.signup.account_first_session'
} as const;

export function subscriptionAttemptStorageKey(plan: string): string {
  return `orvel.subscription.attempt.${plan}`;
}

/**
 * Non-secret hint that this browser signed in on the landing before. It exists so
 * a plan click can route into onboarding instead of the credentials form; it is
 * deliberately not a session and holds no credential (audit S2).
 */
export const AUTH_PRESENCE_KEY = 'orvel.auth.present';
