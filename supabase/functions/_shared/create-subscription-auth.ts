type CreateSubscriptionRequestBody = {
  mode?: unknown;
  pending_signup_intent?: unknown;
  account_first_intent_id?: unknown;
  account_first_session?: unknown;
};

export function getBearerToken(authHeader: string): string {
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

export function isSupabaseAnonBearer(
  authHeader: string,
  supabaseAnonKey?: string | null,
): boolean {
  const anonKey = supabaseAnonKey?.trim();
  return !!anonKey && getBearerToken(authHeader) === anonKey;
}

export function isPendingSignupAuthOptional(
  requestBody: CreateSubscriptionRequestBody,
): boolean {
  if (requestBody.mode === "pending_signup_intent") return true;
  if (
    requestBody.mode === "account_first_signup" &&
    typeof requestBody.account_first_intent_id === "string" &&
    typeof requestBody.account_first_session === "string"
  ) return true;
  if (requestBody.mode === "existing_user") return false;

  return requestBody.pending_signup_intent !== null &&
    requestBody.pending_signup_intent !== undefined;
}

export function shouldValidateCreateSubscriptionAuthorization({
  authHeader,
  requestBody,
  supabaseAnonKey,
}: {
  authHeader: string | null;
  requestBody: CreateSubscriptionRequestBody;
  supabaseAnonKey?: string | null;
}): boolean {
  if (!authHeader) return false;
  if (isSupabaseAnonBearer(authHeader, supabaseAnonKey)) return false;
  if (isPendingSignupAuthOptional(requestBody)) return false;

  return true;
}
