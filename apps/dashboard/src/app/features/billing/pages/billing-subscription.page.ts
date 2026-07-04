import type { PlanCode } from '../../../core/plans/plan-entitlements';
import { normalizePlanCode } from '../../../core/plans/plan-entitlements';
import { ONBOARDING_PLAN_STORAGE_KEY } from '../../onboarding/pages/signup-plan-step.page';
import {
  createSubscription,
  CreateSubscriptionError,
  type CreateSubscriptionResult
} from '../data-access/payments/subscriptions/create-subscription.api';
import {
  requestSubscriptionCancellation,
  RequestSubscriptionCancellationError,
  type RequestSubscriptionCancellationResult
} from '../data-access/payments/subscriptions/request-subscription-cancellation.api';

export const BILLING_SUBSCRIPTION_UNAVAILABLE_MESSAGE =
  'Los pagos online no están disponibles en este momento. Contactá soporte para activar tu plan.';

const BILLING_SUBSCRIPTION_GENERIC_ERROR_MESSAGE =
  'No pudimos iniciar el pago. Reintentá en unos minutos o contactá soporte.';

const BILLING_SUBSCRIPTION_HEADINGS: Record<BillingSubscriptionMode, { kicker: string; title: string }> = {
  activation: {
    kicker: 'Suscripción',
    title: 'Activación de plan'
  },
  cancellation: {
    kicker: 'Baja de suscripción',
    title: 'Solicitud de baja manual'
  }
};

export const BILLING_SUBSCRIPTION_CANCELLATION_READY_MESSAGE =
  'Podés solicitar la baja de tu suscripción. La procesamos manualmente con soporte y Mercado Pago antes del próximo ciclo de facturación.';

export const BILLING_SUBSCRIPTION_CANCELLATION_REQUESTED_MESSAGE =
  'Recibimos tu solicitud de baja. El equipo de soporte la va a procesar manualmente con Mercado Pago antes del próximo ciclo de facturación.';

const BILLING_SUBSCRIPTION_CANCELLATION_GENERIC_ERROR_MESSAGE =
  'No pudimos registrar la solicitud de baja. Contactá soporte para procesarla manualmente.';

type BillingSubscriptionMode = 'activation' | 'cancellation';

export type BillingSubscriptionState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'redirecting'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string }
  | { status: 'cancellation_ready'; message: string }
  | { status: 'cancellation_loading'; message: string }
  | { status: 'cancellation_requested'; message: string };

type BillingSubscriptionDeps = {
  storage?: Pick<Storage, 'getItem'> | null;
  createSubscription?: (input: { planCode: PlanCode }) => Promise<CreateSubscriptionResult>;
  requestCancellation?: (input: { businessId: string; reason: 'manual_request' }) => Promise<RequestSubscriptionCancellationResult>;
  resolveCancellationBusinessId?: () => Promise<string | null>;
  redirectTo?: (url: string) => void;
  mode?: BillingSubscriptionMode;
};

export class BillingSubscriptionPage {
  private readonly storage: Pick<Storage, 'getItem'> | null;
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

  heading(): { kicker: string; title: string } {
    return BILLING_SUBSCRIPTION_HEADINGS[this.currentMode];
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

  async startSubscription(): Promise<void> {
    this.currentState = {
      status: 'loading',
      message: 'Iniciando suscripción segura…'
    };

    try {
      const result = await this.createSubscriptionFn({ planCode: this.selectedPlan() });

      if (!result.ok || !result.initPoint) {
        this.currentState = {
          status: 'unavailable',
          message: BILLING_SUBSCRIPTION_UNAVAILABLE_MESSAGE
        };
        return;
      }

      this.currentState = {
        status: 'redirecting',
        message: 'Redirigiendo a Mercado Pago…'
      };
      this.redirectTo(result.initPoint);
    } catch (error) {
      if (error instanceof CreateSubscriptionError && error.code === 'SERVER_CONFIG_ERROR') {
        this.currentState = {
          status: 'unavailable',
          message: BILLING_SUBSCRIPTION_UNAVAILABLE_MESSAGE
        };
        return;
      }

      this.currentState = {
        status: 'error',
        message: error instanceof CreateSubscriptionError ? error.message : BILLING_SUBSCRIPTION_GENERIC_ERROR_MESSAGE
      };
    }
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
