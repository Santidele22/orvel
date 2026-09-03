import {
  PREMIUM_TRANSFER_ALIAS,
  buildPremiumWhatsAppUrl,
  copyPremiumAlias,
  markPremiumReviewPending
} from '../../../core/billing/premium-alias-receipt';
import type { PlanCode } from '../../../core/plans/plan-entitlements';
import { normalizePlanCode } from '../../../core/plans/plan-entitlements';
import { ONBOARDING_PLAN_STORAGE_KEY } from '../../onboarding/pages/signup-plan-step.page';
import {
  createSubscription,
  type CreateSubscriptionResult
} from '../data-access/payments/subscriptions/create-subscription.api';
import {
  requestSubscriptionCancellation,
  RequestSubscriptionCancellationError,
  type RequestSubscriptionCancellationResult
} from '../data-access/payments/subscriptions/request-subscription-cancellation.api';

export const BILLING_SUBSCRIPTION_UNAVAILABLE_MESSAGE =
  'Los pagos online no están disponibles en este momento. Contactá soporte para activar tu plan.';

const BILLING_SUBSCRIPTION_HEADINGS: Record<
  BillingSubscriptionMode,
  { kicker: string; title: string; subtitle?: string }
> = {
  activation: {
    kicker: 'PASO FINAL',
    title: 'Transferí y mandá el comprobante',
    subtitle: 'No usamos Mercado Pago ni tarjeta. Es una transferencia directa que validamos a mano.'
  },
  cancellation: {
    kicker: 'Baja de suscripción',
    title: 'Solicitud de baja manual'
  }
};

export const BILLING_SUBSCRIPTION_CANCELLATION_READY_MESSAGE =
  'Podés solicitar la baja de tu suscripción. Santi la procesa a mano. No hay cancelación automática.';

export const BILLING_SUBSCRIPTION_CANCELLATION_REQUESTED_MESSAGE =
  'Recibimos tu solicitud de baja. Santi la va a procesar a mano.';

const BILLING_SUBSCRIPTION_CANCELLATION_GENERIC_ERROR_MESSAGE =
  'No pudimos registrar la solicitud de baja. Contactá soporte para procesarla manualmente.';

type BillingSubscriptionMode = 'activation' | 'cancellation';

export type BillingSubscriptionState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'alias_ready'; message: string }
  | { status: 'redirecting'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string }
  | { status: 'cancellation_ready'; message: string }
  | { status: 'cancellation_loading'; message: string }
  | { status: 'cancellation_requested'; message: string };

type BillingStorage = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem'>>;

type BillingSubscriptionDeps = {
  storage?: BillingStorage | null;
  createSubscription?: (input: { planCode: PlanCode }) => Promise<CreateSubscriptionResult>;
  requestCancellation?: (input: { businessId: string; reason: 'manual_request' }) => Promise<RequestSubscriptionCancellationResult>;
  resolveCancellationBusinessId?: () => Promise<string | null>;
  redirectTo?: (url: string) => void;
  mode?: BillingSubscriptionMode;
};

export class BillingSubscriptionPage {
  private readonly storage: BillingStorage | null;
  private readonly createSubscriptionFn: (input: { planCode: PlanCode }) => Promise<CreateSubscriptionResult>;
  private readonly requestCancellationFn: (input: {
    businessId: string;
    reason: 'manual_request';
  }) => Promise<RequestSubscriptionCancellationResult>;
  private readonly resolveCancellationBusinessIdFn: () => Promise<string | null>;
  private readonly redirectTo: (url: string) => void;
  private readonly currentMode: BillingSubscriptionMode;
  private currentState: BillingSubscriptionState = {
    status: 'idle',
    message: 'Preparando la suscripción segura.'
  };

  constructor(deps: BillingSubscriptionDeps = {}) {
    this.storage = deps.storage === undefined ? this.getBrowserStorage() : deps.storage;
    this.createSubscriptionFn = deps.createSubscription ?? createSubscription;
    this.requestCancellationFn = deps.requestCancellation ?? requestSubscriptionCancellation;
    this.resolveCancellationBusinessIdFn = deps.resolveCancellationBusinessId ?? this.resolveBusinessIdFromBrowserSession;
    this.redirectTo = deps.redirectTo ?? ((url) => window.location.assign(url));
    this.currentMode = deps.mode ?? 'activation';
  }

  state(): BillingSubscriptionState {
    return this.currentState;
  }

  mode(): BillingSubscriptionMode {
    return this.currentMode;
  }

  heading(): { kicker: string; title: string; subtitle?: string } {
    return BILLING_SUBSCRIPTION_HEADINGS[this.currentMode];
  }

  premiumAlias(): string {
    return PREMIUM_TRANSFER_ALIAS;
  }

  async copyAlias(): Promise<boolean> {
    return copyPremiumAlias();
  }

  async initialize(): Promise<void> {
    if (this.currentMode === 'cancellation') {
      this.currentState = {
        status: 'cancellation_ready',
        message: BILLING_SUBSCRIPTION_CANCELLATION_READY_MESSAGE
      };
      return;
    }

    await this.startSubscription();
  }

  selectedPlan(): PlanCode {
    return normalizePlanCode(this.storage?.getItem(ONBOARDING_PLAN_STORAGE_KEY)) as PlanCode;
  }

  formatMonthlyPrice(priceMonthlyCents: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(priceMonthlyCents / 100);
  }

  whatsAppUrl(): string {
    return buildPremiumWhatsAppUrl();
  }

  async startSubscription(): Promise<void> {
    markPremiumReviewPending({
      setItem: (key, value) => {
        this.storage?.setItem?.(key, value);
      }
    });
    this.currentState = {
      status: 'alias_ready',
      message: 'Transferí al alias orvel.pagos y mandá el comprobante por WhatsApp. Hasta entonces tu cuenta funciona en plan Gratis.'
    };
  }

  async requestCancellation(): Promise<void> {
    this.currentState = {
      status: 'cancellation_loading',
      message: 'Registrando solicitud de baja…'
    };

    try {
      const businessId = await this.resolveCancellationBusinessIdFn();

      if (!businessId) {
        this.currentState = {
          status: 'error',
          message: 'No encontramos el negocio asociado a tu cuenta. Contactá soporte para solicitar la baja.'
        };
        return;
      }

      await this.requestCancellationFn({ businessId, reason: 'manual_request' });

      this.currentState = {
        status: 'cancellation_requested',
        message: BILLING_SUBSCRIPTION_CANCELLATION_REQUESTED_MESSAGE
      };
    } catch (error) {
      this.currentState = {
        status: 'error',
        message:
          error instanceof RequestSubscriptionCancellationError
            ? error.message
            : BILLING_SUBSCRIPTION_CANCELLATION_GENERIC_ERROR_MESSAGE
      };
    }
  }

  private resolveBusinessIdFromBrowserSession = async (): Promise<string | null> => {
    const rawBusinessId =
      this.storage?.getItem('orvel.active_business_id') ??
      this.storage?.getItem('orvel.dashboard.business_id') ??
      this.storage?.getItem('business_id');
    const businessId = rawBusinessId?.trim();

    if (businessId) {
      return businessId;
    }

    try {
      const [{ SUPABASE_CONFIG }, { createSupabaseAuthClient }] = await Promise.all([
        import('../../../core/auth/supabase-config'),
        import('../../../core/auth/supabase-auth.client')
      ]);
      const authClient = createSupabaseAuthClient({
        supabaseUrl: SUPABASE_CONFIG.url,
        supabaseAnonKey: SUPABASE_CONFIG.anonKey
      });
      const { data } = await authClient.getSession();
      const metadata = data.session?.user.user_metadata ?? {};
      const metadataBusinessId = metadata['business_id'] ?? metadata['businessId'] ?? metadata['dashboard_business_id'];

      return typeof metadataBusinessId === 'string' && metadataBusinessId.trim() ? metadataBusinessId.trim() : null;
    } catch {
      return null;
    }
  };

  private getBrowserStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage ?? null;
  }
}
