-- Document the Core Slice 2 plan/business-type eligibility contract in remote DB metadata.
-- Policy: all_plans_all_types. Every active core plan can choose from every active
-- business type; max_rubros entitlements limit how many rubros a business may select.

COMMENT ON TABLE public.plan_business_types IS
  'Policy: all_plans_all_types. Every active core plan can choose from every active business type; max_rubros entitlements limit how many rubros a business may select.';
