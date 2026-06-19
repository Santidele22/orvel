import {
  shouldValidateCreateSubscriptionAuthorization,
} from "./create-subscription-auth.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test(
  "create-subscription auth is optional for pending signup intent with malformed Authorization",
  () => {
    const shouldValidate = shouldValidateCreateSubscriptionAuthorization({
      authHeader: "Bearer iVmqV0OH1g-malformed-token",
      requestBody: {
        mode: "pending_signup_intent",
        pending_signup_intent: {
          email: "owner@example.com",
          business_type: "beauty",
        },
      },
      supabaseAnonKey: "anon-key",
    });

    assertEquals(shouldValidate, false);
  },
);

Deno.test(
  "create-subscription auth stays strict for legacy account-first signup mode",
  () => {
    const shouldValidate = shouldValidateCreateSubscriptionAuthorization({
      authHeader: "Bearer iVmqV0OH1g-malformed-token",
      requestBody: {
        mode: "account_first_signup",
      },
      supabaseAnonKey: "anon-key",
    });

    assertEquals(shouldValidate, true);
  },
);

Deno.test(
  "create-subscription auth remains strict for existing-user mode with invalid Authorization",
  () => {
    const shouldValidate = shouldValidateCreateSubscriptionAuthorization({
      authHeader: "Bearer iVmqV0OH1g-malformed-token",
      requestBody: {
        mode: "existing_user",
        pending_signup_intent: {
          email: "owner@example.com",
          business_type: "beauty",
        },
      },
      supabaseAnonKey: "anon-key",
    });

    assertEquals(shouldValidate, true);
  },
);

Deno.test(
  "create-subscription auth remains strict when no pending signup intent is present",
  () => {
    const shouldValidate = shouldValidateCreateSubscriptionAuthorization({
      authHeader: "Bearer iVmqV0OH1g-malformed-token",
      requestBody: {
        mode: "existing_user",
      },
      supabaseAnonKey: "anon-key",
    });

    assertEquals(shouldValidate, true);
  },
);
