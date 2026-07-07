/**
 * Plans Service - Fetches plans from Supabase
 * Used by the landing page to display pricing
 */

import { createClient } from '@supabase/supabase-js';

let hasWarnedMissingSupabaseEnv = false;

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

// MVP billing supports monthly pricing only.
export type BillingPeriod = 'monthly';

// Extended plan with calculated prices for different billing periods
export interface PlanWithBilling extends Plan {
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
}

const CANONICAL_PLAN_ORDER = ['FREE', 'PREMIUM'] as const;
const CANONICAL_PLAN_NAMES: Record<string, string> = {
  FREE: 'Gratis',
  PREMIUM: 'Premium'
};

const CANONICAL_PLAN_DESCRIPTIONS: Record<string, string> = {
  FREE: 'Para empezar con una agenda online y un local principal.',
  PREMIUM: 'Para recibir turnos ilimitados en tu local principal.'
};

function normalizeStaticPlanCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (['BASIC', 'STARTED', 'SIMPLE', 'STARTER', 'MEDIUM', 'CRECE', 'GROWTH', 'ESCALA', 'PRO'].includes(normalized)) return 'PREMIUM';
  return normalized;
}

function normalizePlanCode(plan: Pick<Plan, 'code' | 'name'>): string | null {
  const raw = `${plan.code ?? ''} ${plan.name ?? ''}`.trim().toUpperCase();
  const normalized = raw.replace(/[^A-Z0-9]+/g, ' ');
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));

  if (tokens.has('FREE') || tokens.has('GRATIS')) return 'FREE';
  if (tokens.has('PREMIUM')) return 'PREMIUM';
  if (tokens.has('STARTER') || tokens.has('STARTED') || tokens.has('BASIC') || tokens.has('SIMPLE')) return 'PREMIUM';
  if (tokens.has('GROWTH') || tokens.has('MEDIUM') || tokens.has('CRECE')) return 'PREMIUM';
  if (tokens.has('PRO') || tokens.has('ESCALA')) return 'PREMIUM';

  return null;
}

function isBillingVariant(plan: Pick<Plan, 'code' | 'name'>): boolean {
  return /\b(MENSUAL|MONTHLY|TRIMESTRAL|QUARTERLY|ANUAL|ANNUAL)\b/i.test(`${plan.code} ${plan.name}`);
}

function canonicalPlanPriority(plan: Plan, canonicalCode: string): number {
  let priority = 0;
  const code = plan.code.trim().toUpperCase();
  const name = plan.name.trim().toUpperCase();

  if (code === canonicalCode) priority += 100;
  if (name === CANONICAL_PLAN_NAMES[canonicalCode]?.toUpperCase()) priority += 50;
  if (plan.is_featured) priority += 5;
  if (isBillingVariant(plan)) priority -= 100;

  return priority;
}

function canonicalizePlan(plan: Plan, canonicalCode: string): Plan {
  return {
    ...plan,
    code: canonicalCode,
    name: CANONICAL_PLAN_NAMES[canonicalCode] ?? plan.name,
    description: plan.description || CANONICAL_PLAN_DESCRIPTIONS[canonicalCode] || null,
    is_featured: canonicalCode === 'PREMIUM' ? true : Boolean(plan.is_featured && canonicalCode !== 'FREE')
  };
}

export function normalizeActivePlansForLanding(plans: Plan[]): Plan[] {
  const bestByCode = new Map<string, { plan: Plan; priority: number }>();

  for (const plan of plans) {
    if (plan.is_active === false) continue;
    const canonicalCode = normalizePlanCode(plan);
    if (!canonicalCode || !CANONICAL_PLAN_ORDER.includes(canonicalCode as (typeof CANONICAL_PLAN_ORDER)[number])) continue;

    const priority = canonicalPlanPriority(plan, canonicalCode);
    const current = bestByCode.get(canonicalCode);
    if (!current || priority > current.priority) {
      bestByCode.set(canonicalCode, { plan: canonicalizePlan(plan, canonicalCode), priority });
    }
  }

  return CANONICAL_PLAN_ORDER
    .map((code) => bestByCode.get(code)?.plan)
    .filter((plan): plan is Plan => Boolean(plan));
}

/**
 * Create Supabase client for anonymous access
 * Uses PUBLIC variables from .env
 */
function createPublicClient() {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!hasWarnedMissingSupabaseEnv) {
      console.warn('Public Supabase environment is missing; using static fallback plans.');
      hasWarnedMissingSupabaseEnv = true;
    }
    return null;
  }

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
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
    if (!supabase) {
      return getStaticPlans();
    }

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

    const normalizedPlans = normalizeActivePlansForLanding(data as Plan[]);
    return normalizedPlans.length > 0 ? normalizedPlans : getStaticPlans();
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
    if (!supabase) {
      const staticPlans = getStaticPlans();
      return staticPlans.find(p => p.code === normalizedCode) || null;
    }

    const { data, error } = await supabase.rpc('get_plan_by_code', { p_code: normalizedCode });

    if (error || !data) {
      const staticPlans = getStaticPlans();
      return staticPlans.find(p => p.code === normalizedCode) || null;
    }

    // RPC may return either a single row or an array depending on function shape
    const plan = Array.isArray(data) ? data[0] : data;
    if (!plan) {
      const staticPlans = getStaticPlans();
      return staticPlans.find(p => p.code === normalizedCode) || null;
    }

    const canonicalCode = normalizePlanCode(plan as Plan) ?? normalizedCode;
    return canonicalizePlan(plan as Plan, canonicalCode);
  } catch {
    // Fallback to static plans
    const staticPlans = getStaticPlans();
    return staticPlans.find(p => p.code === normalizedCode) || null;
  }
}

/**
 * Calculate prices for different billing periods
 * monthly: price as-is
 * MVP billing supports monthly pricing only.
 */
export function calculateBillingPrices(plan: Plan): PlanWithBilling {
  const monthly_price = plan.price;
  
  const quarterly_price = 0;
  const annual_price = 0;

  return {
    ...plan,
    monthly_price,
    quarterly_price,
    annual_price
  };
}

/**
 * Get billing prices for the monthly-only MVP billing model.
 */
export function getBillingPrice(
  plan: PlanWithBilling,
  _period: BillingPeriod
): { price: number; label: string } {
  return { price: plan.monthly_price, label: '/mes' };
}

/**
 * Calculate savings compared to monthly billing
 */
export function getSavingsAmount(
  plan: PlanWithBilling,
  _period: BillingPeriod
): number {
  return 0;
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
      description: 'Para empezar con una agenda online y un local principal.',
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
      id: 'static-premium',
      code: 'PREMIUM',
      name: 'Premium',
      description: 'Para recibir turnos ilimitados en tu local principal.',
      price: 25000,
      price_quarterly: 0,
      price_annual: 0,
      currency: 'ARS',
      billing_frequency: 1,
      billing_frequency_type: 'months',
      duration_days: 30,
      is_active: true,
      is_featured: true,
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
    case 'PREMIUM':
      return 'Elegir Premium';
    default:
      return 'Elegir Plan';
  }
}
