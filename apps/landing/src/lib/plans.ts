/**
 * Plans Service - Fetches plans from Supabase
 * Used by the landing page to display pricing
 */

import { createClient } from '@supabase/supabase-js';

// Plan data structure matching the database schema
export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_frequency: number;
  billing_frequency_type: 'days' | 'months' | 'years';
  duration_days: number;
  is_active: boolean;
  is_featured: boolean | null;
  price_quarterly: number | null;
  price_annual: number | null;
  created_at: string;
  updated_at: string;
}

// Billing period types for display
export type BillingPeriod = 'monthly' | 'quarterly' | 'annual';

// Extended plan with calculated prices for different billing periods
export interface PlanWithBilling extends Plan {
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
}

function normalizeStaticPlanCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized === 'BASIC' || normalized === 'STARTER') return 'STARTER';
  if (normalized === 'MEDIUM') return 'GROWTH';
  return normalized;
}

/**
 * Create Supabase client for anonymous access
 * Uses PUBLIC variables from .env
 */
function createPublicClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

/**
 * Fetch all active plans from the database
 * Falls back to a static list if the database is unavailable
 */
export async function getActivePlans(): Promise<Plan[]> {
  try {
    const supabase = createPublicClient();
    // RPC-first to avoid direct table dependency in landing
    const { data, error } = await supabase.rpc('get_active_plans');

    if (error) {
      if (error.code === 'PGRST205') {
        console.warn('public.plans is unavailable; using static fallback plans.', error);
      } else {
        console.error('Error fetching plans from database:', error);
      }
      return getStaticPlans();
    }

    if (!data || data.length === 0) {
      return getStaticPlans();
    }

    return data as Plan[];
  } catch (err) {
    console.error('Supabase connection error:', err);
    return getStaticPlans();
  }
}

/**
 * Fetch a single plan by code
 */
export async function getPlanByCode(code: string): Promise<Plan | null> {
  const normalizedCode = normalizeStaticPlanCode(code);

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc('get_plan_by_code', { p_code: normalizedCode });

    if (error || !data) {
      const staticPlans = getStaticPlans();
      return staticPlans.find(p => p.code === normalizedCode) || null;
    }

    // RPC may return either a single row or an array depending on function shape
    const plan = Array.isArray(data) ? data[0] : data;
    if (!plan) {
      const staticPlans = getStaticPlans();
      return staticPlans.find(p => p.code === code) || null;
    }

    return plan as Plan;
  } catch {
    // Fallback to static plans
    const staticPlans = getStaticPlans();
    return staticPlans.find(p => p.code === normalizedCode) || null;
  }
}

/**
 * Calculate prices for different billing periods
 * monthly: price as-is
 * quarterly: 3 months at a slight discount (price * 3 * 0.95)
 * annual: 12 months at a significant discount (price * 12 * 0.85)
 */
export function calculateBillingPrices(plan: Plan): PlanWithBilling {
  const monthly_price = plan.price;
  
  // Use DB values if available, otherwise use hardcoded fallbacks
  let quarterly_price = plan.price_quarterly ?? 0;
  let annual_price = plan.price_annual ?? 0;

  if (!plan.price_quarterly || !plan.price_annual) {
    switch (plan.code) {
      case 'STARTER':
        quarterly_price = 30;
        annual_price = 99;
        break;
      case 'GROWTH':
        quarterly_price = 55;
        annual_price = 179;
        break;
      case 'PRO':
        quarterly_price = 99;
        annual_price = 299;
        break;
      default:
        quarterly_price = 0;
        annual_price = 0;
        break;
    }
  }

  return {
    ...plan,
    monthly_price,
    quarterly_price,
    annual_price
  };
}

/**
 * Get billing prices based on period
 */
export function getBillingPrice(
  plan: PlanWithBilling,
  period: BillingPeriod
): { price: number; label: string } {
  switch (period) {
    case 'monthly':
      return { price: plan.monthly_price, label: '/mes' };
    case 'quarterly':
      return { price: plan.quarterly_price, label: '/trimestre' };
    case 'annual':
      return { price: plan.annual_price, label: '/año' };
  }
}

/**
 * Calculate savings compared to monthly billing
 */
export function getSavingsAmount(
  plan: PlanWithBilling,
  period: BillingPeriod
): number {
  if (period === 'monthly') return 0;

  const { price } = getBillingPrice(plan, period);
  const monthlyEquivalent = period === 'quarterly' ? price / 3 : price / 12;
  const monthlyTotal = plan.monthly_price * (period === 'quarterly' ? 3 : 12);

  return Math.round(monthlyTotal - price);
}

/**
 * Static fallback plans if database is unavailable
 * These match the current pricing section in index.astro
 */
function getStaticPlans(): Plan[] {
  return [
    {
      id: 'static-free',
      code: 'FREE',
      name: 'Gratis',
      description: 'Para probar Orvel sin riesgo.',
      price: 0,
      price_quarterly: 0,
      price_annual: 0,
      currency: 'ARS',
      billing_frequency: 1,
      billing_frequency_type: 'months',
      duration_days: 30,
      is_active: true,
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'static-starter',
      code: 'STARTER',
      name: 'Starter',
      description: 'Para profesionales y negocios chicos que quieren dejar de manejar todo por WhatsApp.',
      price: 12900,
      price_quarterly: 32895, // aprox -15%
      price_annual: 108360, // aprox -30%
      currency: 'ARS',
      billing_frequency: 1,
      billing_frequency_type: 'months',
      duration_days: 30,
      is_active: true,
      is_featured: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'static-growth',
      code: 'GROWTH',
      name: 'Growth',
      description: 'Para equipos que necesitan más organización y menos ausencias.',
      price: 24900,
      price_quarterly: 63495,
      price_annual: 209160,
      currency: 'ARS',
      billing_frequency: 1,
      billing_frequency_type: 'months',
      duration_days: 30,
      is_active: true,
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'static-pro',
      code: 'PRO',
      name: 'Pro',
      description: 'Para negocios con varias agendas y operación avanzada.',
      price: 44900,
      price_quarterly: 114495,
      price_annual: 377160,
      currency: 'ARS',
      billing_frequency: 1,
      billing_frequency_type: 'months',
      duration_days: 30,
      is_active: true,
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
}

/**
 * Create a subscription using the Edge Function
 * Requires authenticated user
 */
export async function createSubscription(planCode: string): Promise<{
  success: boolean;
  init_point?: string;
  subscription?: unknown;
  message?: string;
  error?: string;
}> {
  // Get the session token from localStorage
  const sessionData = localStorage.getItem('orvel.session.v1');
  if (!sessionData) {
    return { success: false, error: 'No hay sesión activa' };
  }

  try {
    const session = JSON.parse(sessionData);
    const token = session.token;

    const response = await fetch(
      `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/create-subscription`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan_code: planCode })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.message || 'Error al crear suscripción' };
    }

    return result;
  } catch (err) {
    console.error('Subscription error:', err);
    return { success: false, error: 'Error de conexión' };
  }
}

/**
 * Map plan code to display name for buttons
 */
export function getPlanButtonLabel(code: string): string {
  switch (code) {
    case 'FREE':
      return 'Empezar gratis';
    case 'STARTER':
      return 'Elegir Starter';
    case 'GROWTH':
      return 'Elegir Growth';
    case 'PRO':
      return 'Elegir Pro';
    default:
      return 'Elegir Plan';
  }
}
