import type { SupabaseClient } from "@supabase/supabase-js";

export type ProvisionFreeSignupInput = {
  userId: string;
  firstName: string;
  lastName: string;
  businessName: string;
  businessType: string;
  selectedBusinessTypes: string[];
  phone: string | null;
};

export type ProvisionFreeSignupResult = {
  businessId: string;
  businessSlug: string;
};

function slugifyBusinessName(name: string): string {
  const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${base || "mi-negocio"}-${crypto.randomUUID().slice(0, 8)}`;
}

async function markTrustedAuthUserOnboardingComplete(
  supabaseAdmin: SupabaseClient,
  input: { userId: string; businessId: string; businessName: string; businessSlug: string; businessType: string; selectedBusinessTypes: string[] },
): Promise<void> {
  const { data: authMetadataData, error: authMetadataError } = await supabaseAdmin.auth.admin.updateUserById(input.userId, {
    user_metadata: {
      onboardingCompleted: true,
      onboarding_completed: true,
      onboarding_required: false,
      business_type: input.businessType,
      tipoNegocio: input.businessType,
      business_id: input.businessId,
      business_name: input.businessName,
      business_slug: input.businessSlug,
      negocioNombre: input.businessName,
      selectedBusinessTypes: input.selectedBusinessTypes,
      selected_business_types: input.selectedBusinessTypes,
      additionalRubros: input.selectedBusinessTypes.slice(1),
    },
  });
  const authMetadataUser = authMetadataData?.user;
  if (authMetadataError || !authMetadataUser || authMetadataUser.id !== input.userId) {
    throw authMetadataError || new Error("signup_auth_metadata_update_failed");
  }
}

export async function provisionFreeSignupTenant(
  supabaseAdmin: SupabaseClient,
  input: ProvisionFreeSignupInput,
): Promise<ProvisionFreeSignupResult> {
  const { data: existingBusiness } = await supabaseAdmin.from("businesses").select("id, slug").eq("owner_id", input.userId).limit(1).maybeSingle();
  const businessId = existingBusiness?.id || crypto.randomUUID();
  const slug = slugifyBusinessName(input.businessName);
  const businessSlug = existingBusiness?.slug || slug;

  await supabaseAdmin.from("profiles").upsert({
    id: input.userId,
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
  });

  const { error: businessError } = existingBusiness
    ? { error: null }
    : await supabaseAdmin.from("businesses").insert({
      id: businessId,
      slug,
      name: input.businessName,
      owner_id: input.userId,
      timezone: "America/Argentina/Buenos_Aires",
    });
  if (businessError) {
    throw businessError;
  }

  const dashboardReadyAt = new Date().toISOString();
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("business_settings")
    .upsert({
      business_id: businessId,
      business_type: input.businessType,
      selected_business_types: input.selectedBusinessTypes,
      plan: "free",
      support_phone: input.phone,
      updated_at: dashboardReadyAt,
    })
    .select("business_id")
    .single();
  const { data: onboarding, error: onboardingError } = await supabaseAdmin
    .from("business_onboarding_state")
    .upsert({
      business_id: businessId,
      current_step: "dashboard_ready",
      dashboard_ready_at: dashboardReadyAt,
      selected_plan_code: "FREE",
      account_user_id: input.userId,
      business_type: input.businessType,
      updated_at: dashboardReadyAt,
    })
    .select("business_id")
    .single();
  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from("business_subscriptions")
    .upsert({
      business_id: businessId,
      tenant_id: input.userId,
      plan_code: "FREE",
      subscription_status: "active",
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .select("business_id")
    .single();
  const { data: defaultServicesProvisioned, error: defaultServicesError } = await supabaseAdmin.rpc(
    "provision_default_services_for_business",
    { p_business_id: businessId, p_business_types: input.selectedBusinessTypes },
  );

  if (
    settingsError
    || onboardingError
    || subscriptionError
    || defaultServicesError
    || !settings
    || !onboarding
    || !subscription
    || typeof defaultServicesProvisioned !== "number"
  ) {
    throw settingsError || onboardingError || subscriptionError || defaultServicesError || new Error("signup_provision_failed");
  }

  await markTrustedAuthUserOnboardingComplete(supabaseAdmin, {
    userId: input.userId,
    businessId,
    businessName: input.businessName,
    businessSlug,
    businessType: input.businessType,
    selectedBusinessTypes: input.selectedBusinessTypes,
  });

  return { businessId, businessSlug };
}
