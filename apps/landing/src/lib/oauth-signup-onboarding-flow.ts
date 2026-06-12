type OAuthProvider = 'google';

export type OAuthSignupPlan = 'STARTED' | 'GROWTH' | 'PRO' | 'FREE' | 'BASIC' | 'MEDIUM';

export type OAuthSignupIntent = {
  id: string;
  plan: string;
  provider: OAuthProvider;
  expiresAt: number;
};

export type OAuthSignupIntentStore = {
  create: (intent: Omit<OAuthSignupIntent, 'id'>) => Promise<OAuthSignupIntent>;
  consume: (id: string, now: number) => Promise<OAuthSignupIntent | null>;
};

type OAuthSessionUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type BuildGoogleOAuthSignupRequestInput = {
  origin: string;
  selectedPlan: string;
  intentStore: OAuthSignupIntentStore;
  now?: number;
};

type HandleOAuthOnboardingCallbackInput = {
  url: string;
  intentStore: OAuthSignupIntentStore;
  exchangeCodeForSession: (code: string) => Promise<{ user: OAuthSessionUser }>;
  getCurrentSessionUser?: () => Promise<{ user: OAuthSessionUser | null }>;
  fallbackPlan?: string | null;
  now?: number;
};

const SIGNUP_INTENT_TTL_MS = 5 * 60_000;
const SIGNUP_COMPLETION_ROUTE = '/auth/signup/complete';
const DEFAULT_OAUTH_SIGNUP_PLAN = 'STARTED';

const PLAN_ALIASES: Record<string, string> = {
  FREE: 'FREE',
  BASIC: 'STARTED',
  STARTER: 'STARTED',
  MEDIUM: 'GROWTH'
};
const CANONICAL_OAUTH_SIGNUP_PLANS = new Set(['FREE', 'STARTED', 'GROWTH', 'PRO']);
const PAID_OAUTH_SIGNUP_PLANS = new Set(['BASIC', 'STARTER', 'STARTED', 'MEDIUM', 'GROWTH', 'PRO']);

export type OAuthOnboardingErrorCode =
  | 'missing_provider_code'
  | 'missing_signup_context'
  | 'intent_provider_mismatch'
  | 'missing_or_expired_intent'
  | 'paid_oauth_signup_blocked';

export class OAuthOnboardingError extends Error {
  readonly code: OAuthOnboardingErrorCode;

  constructor(code: OAuthOnboardingErrorCode, message: string) {
    super(message);
    this.name = 'OAuthOnboardingError';
    this.code = code;
  }
}

export function normalizeOAuthSignupPlan(rawPlan: unknown): string | null {
  if (typeof rawPlan !== 'string' || rawPlan.trim().length === 0) {
    return null;
  }

  const normalized = rawPlan.trim().toUpperCase();
  const canonical = PLAN_ALIASES[normalized] ?? normalized;

  return CANONICAL_OAUTH_SIGNUP_PLANS.has(canonical) ? canonical : null;
}

function canonicalPlan(rawPlan: string): string {
  return normalizeOAuthSignupPlan(rawPlan) ?? DEFAULT_OAUTH_SIGNUP_PLAN;
}

export function isPaidOAuthSignupPlan(rawPlan: unknown): boolean {
  if (typeof rawPlan !== 'string' || rawPlan.trim().length === 0) {
    return false;
  }

  return PAID_OAUTH_SIGNUP_PLANS.has(rawPlan.trim().toUpperCase());
}

function safeOrigin(rawOrigin: string): string {
  const origin = rawOrigin.trim().replace(/\/+$/, '');
  if (!origin) {
    throw new Error('OAuth signup requires a valid origin.');
  }

  return origin;
}

export function createBrowserOAuthSignupIntentStore(storage: Storage): OAuthSignupIntentStore {
  const prefix = 'orvel.oauth.signup.intent.';

  return {
    async create(intent) {
      const id = `signup-intent-${intent.plan.toLowerCase()}-${intent.provider}-${crypto.randomUUID()}`;
      const record: OAuthSignupIntent = { id, ...intent };
      storage.setItem(`${prefix}${id}`, JSON.stringify(record));
      return record;
    },

    async consume(id, now) {
      const key = `${prefix}${id}`;
      const raw = storage.getItem(key);
      storage.removeItem(key);

      if (!raw) {
        return null;
      }

      const intent = JSON.parse(raw) as OAuthSignupIntent;
      if (intent.expiresAt <= now) {
        return null;
      }

      return intent;
    }
  };
}

export async function buildGoogleOAuthSignupRequest(input: BuildGoogleOAuthSignupRequestInput) {
  const now = input.now ?? Date.now();
  const plan = canonicalPlan(input.selectedPlan);
  const intent = await input.intentStore.create({
    plan,
    provider: 'google',
    expiresAt: now + SIGNUP_INTENT_TTL_MS
  });

  const redirectTo = new URL('/auth/oauth/onboarding-callback', safeOrigin(input.origin));
  redirectTo.searchParams.set('signup_intent', intent.id);
  redirectTo.searchParams.set('plan', plan);

  return {
    provider: 'google' as const,
    options: {
      redirectTo: redirectTo.toString(),
      queryParams: {
        onboarding_required: 'true'
      }
    }
  };
}

export async function handleOAuthOnboardingCallback(input: HandleOAuthOnboardingCallbackInput) {
  const now = input.now ?? Date.now();
  const callbackUrl = new URL(input.url);
  const code = callbackUrl.searchParams.get('code');
  const signupIntentId = callbackUrl.searchParams.get('signup_intent');

  if (!code && !callbackUrl.hash && !input.getCurrentSessionUser) {
    throw new OAuthOnboardingError('missing_provider_code', 'OAuth onboarding callback is missing the provider code.');
  }

  if (!signupIntentId) {
    throw new OAuthOnboardingError('missing_signup_context', 'OAuth onboarding callback is missing the signup intent.');
  }

  const intent = signupIntentId ? await input.intentStore.consume(signupIntentId, now) : null;
  if (intent && intent.provider !== 'google') {
    throw new OAuthOnboardingError('intent_provider_mismatch', 'OAuth signup intent is missing or expired.');
  }

  if (!intent) {
    throw new OAuthOnboardingError('missing_or_expired_intent', 'OAuth signup intent is missing or expired.');
  }

  const explicitUrlPlan = normalizeOAuthSignupPlan(callbackUrl.searchParams.get('plan'));
  const fallbackPlan = normalizeOAuthSignupPlan(input.fallbackPlan);
  const intentPlan = normalizeOAuthSignupPlan(intent.plan);
  const plan = explicitUrlPlan ?? intentPlan ?? fallbackPlan ?? DEFAULT_OAUTH_SIGNUP_PLAN;
  const explicitFreePlan = explicitUrlPlan === 'FREE';

  if (
    isPaidOAuthSignupPlan(plan) ||
    (!explicitFreePlan && (isPaidOAuthSignupPlan(intent.plan) || isPaidOAuthSignupPlan(input.fallbackPlan)))
  ) {
    throw new OAuthOnboardingError(
      'paid_oauth_signup_blocked',
      'Google OAuth signup is not available before payment for paid plans.'
    );
  }

  const session = code
    ? await input.exchangeCodeForSession(code)
    : await input.getCurrentSessionUser?.();

  if (!session?.user) {
    throw new OAuthOnboardingError('missing_provider_code', 'OAuth onboarding callback is missing the provider code.');
  }

  const redirectTo = new URL(SIGNUP_COMPLETION_ROUTE, 'https://orvel.local');
  redirectTo.searchParams.set('plan', plan);
  redirectTo.searchParams.set('signup_intent', intent.id);
  redirectTo.searchParams.set('oauth', 'google');

  return {
    redirectTo: `${redirectTo.pathname}${redirectTo.search}`,
    user: session.user,
    plan
  };
}
