import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationsDir = new URL("../../migrations/", import.meta.url);
const functionsDir = new URL("../", import.meta.url);

async function readText(url: URL): Promise<string> {
  return await Deno.readTextFile(url);
}

async function readAllSqlMigrations(): Promise<string> {
  const entries: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) entries.push(entry.name);
  }
  entries.sort();
  return (await Promise.all(entries.map((name) => readText(new URL(name, migrationsDir))))).join("\n");
}

function latestFunctionBody(sql: string, functionName: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );
  const bodies = Array.from(sql.matchAll(pattern), (match) => match[1]);
  assert(bodies.length > 0, `Expected public.${functionName} to be defined in migrations`);
  return bodies.at(-1)!;
}

function latestFunctionDefinition(sql: string, functionName: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as\\s+\\$\\$[\\s\\S]*?\\$\\$`,
    "gi",
  );
  const definitions = Array.from(sql.matchAll(pattern), (match) => match[0]);
  assert(definitions.length > 0, `Expected public.${functionName} to be defined in migrations`);
  return definitions.at(-1)!;
}

function createTableBody(sql: string, tableName: string): string {
  const match = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${tableName}\\s*\\(([\\s\\S]*?)\\);`,
    "i",
  ).exec(sql);
  assert(match?.[1], `Expected public.${tableName} table definition to be present`);
  return match[1];
}

Deno.test("RED signup email confirmation schema: stores only hashed opaque tokens with TTL and no credentials", async () => {
  const sql = await readAllSqlMigrations();

  assert(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.signup_email_confirmations\b/i.test(sql),
    "FREE/PAID signup must persist confirmation intents in public.signup_email_confirmations before provisioning",
  );
  assertStringIncludes(sql, "token_hash", "confirmation storage must store a hash of the opaque token, never the raw token");
  assertStringIncludes(sql, "expires_at", "confirmation storage must include a TTL column");
  assertStringIncludes(sql, "consumed_at", "confirmation storage must mark single-use consumption atomically");
  assertStringIncludes(sql, "email_hmac", "confirmation storage must use a non-enumerable email identity such as email_hmac");

  const confirmationTable = sql.slice(sql.search(/public\.signup_email_confirmations/i));
  assert(
    !/\b(password|plain(?:text)?_password|raw_token|token\s+text|credential|secret)\b/i.test(confirmationTable),
    "pending confirmation storage must not contain plaintext password, credential, secret, raw token, or token text fields",
  );
});

Deno.test("RED FREE PII contract: signup_email_confirmations never stores plaintext signup metadata", async () => {
  const sql = await readAllSqlMigrations();
  const table = createTableBody(sql, "signup_email_confirmations");
  const landingSource = await readText(new URL("../../../apps/landing/src/pages/api/signup/create-account-business.ts", import.meta.url));
  const confirmationPayload = /const\s+confirmationPayload\s*=\s*\{[\s\S]*?\n\s*\};/.exec(landingSource)?.[0] ?? "";

  assert(confirmationPayload.length > 0, "Guard must inspect the FREE confirmation payload written by landing");
  assert(
    /email_hmac\b/i.test(table),
    "signup_email_confirmations must keep only non-enumerable email identity such as email_hmac",
  );
  assert(
    /(?:metadata|signup_payload|pii).*encrypted|encrypted_(?:metadata|signup_payload)|first_name_encrypted|business_name_encrypted/i.test(table),
    "FREE signup PII needed after confirmation must be encrypted, HMAC protected, or stored by opaque reference; not plaintext metadata",
  );
  assert(
    !/metadata\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i.test(table),
    "Generic metadata jsonb without encryption/field constraints invites plaintext email/name/business/phone storage",
  );
  assert(
    !/metadata\s*:\s*\{[\s\S]*?\b(email|first_name|last_name|business_name|phone)\b[\s\S]*?\}/i.test(confirmationPayload),
    "FREE confirmation insert must not place plaintext email, first_name, last_name, business_name, or phone inside metadata",
  );
});

Deno.test("RED signup email confirmation consume: token hash is TTL-bound and single-use before provisioning", async () => {
  const sql = await readAllSqlMigrations();
  const body = latestFunctionBody(sql, "consume_signup_email_confirmation");

  assert(/\btoken_hash\b/i.test(body), "consume RPC must match by hashed opaque token only");
  assert(/expires_at\s*>\s*now\s*\(/i.test(body), "consume RPC must reject expired tokens before provisioning");
  assert(/consumed_at\s+is\s+null/i.test(body), "consume RPC must reject reused tokens before provisioning");
  assert(/update\s+public\.signup_email_confirmations[\s\S]*returning/i.test(body), "consume must atomically claim exactly one confirmation row");
  assert(/business_welcome/i.test(sql), "successful consume/provisioning must enqueue business_welcome only after the account/business/subscription exist");
});

Deno.test("RED FREE confirmation reissue contract: expired pending rows are atomically expired/replaced before resend", async () => {
  const sql = await readAllSqlMigrations();
  const landingSource = await readText(new URL("../../../apps/landing/src/pages/api/signup/create-account-business.ts", import.meta.url));
  const beforeConfirmationInsert = landingSource.slice(0, landingSource.indexOf(".from(\"signup_email_confirmations\")"));

  assert(
    /status\s*=\s*'expired'|status\s*:\s*["']expired["']|expire_signup_email_confirmation|reissue_signup_email_confirmation/i.test(beforeConfirmationInsert) ||
      /create\s+or\s+replace\s+function\s+public\.(?:expire|reissue)_signup_email_confirmation/i.test(sql),
    "Before inserting a resend, expired pending confirmations for the same email/purpose must be marked expired or replaced atomically",
  );
  assert(
    !/unique\s+index[\s\S]{0,240}signup_email_confirmations[\s\S]{0,240}where\s+status\s*=\s*'pending'\s+and\s+consumed_at\s+is\s+null\s*(?:;|$)/i.test(sql),
    "The active-confirmation uniqueness guard must not let expired pending rows keep blocking resend forever",
  );
});

Deno.test("RED FREE materialization retry contract: consuming a token must not lose retryable provisioning state", async () => {
  const sql = await readAllSqlMigrations();
  const table = createTableBody(sql, "signup_email_confirmations");
  const consumeBody = latestFunctionBody(sql, "consume_signup_email_confirmation");

  assert(
    /materializing|failed_materialization|materialized/i.test(table),
    "FREE confirmation rows must have a durable materialization state machine: materializing/failed_materialization/materialized or equivalent",
  );
  assert(
    /status\s*=\s*'materializing'|materialization_status\s*=\s*'materializing'|claim_signup_materialization/i.test(consumeBody),
    "Token consume must claim retryable FREE materialization state instead of ending at consumed with no retry state",
  );
});

Deno.test("RED FREE complete materialization contract: RPC reports zero-row updates before public success", async () => {
  const sql = await readAllSqlMigrations();
  const body = latestFunctionBody(sql, "complete_signup_email_materialization");
  const landingSource = await readText(new URL("../../../apps/landing/src/pages/api/signup/confirm-email.ts", import.meta.url));
  const finalSuccessIndex = landingSource.search(/return\s+htmlResponse\s*\(\s*\{\s*status\s*:\s*["']materialized["'][\s\S]{0,260}(?:Ingresar a Orvel|inici[áa]\s+sesi[oó]n|auth\/login)/i);
  const finalCompleteIndex = landingSource.search(/complete_signup_email_materialization[\s\S]{0,220}p_status\s*:\s*["']materialized["']/i);
  const finalSlice = finalCompleteIndex >= 0 && finalSuccessIndex > finalCompleteIndex
    ? landingSource.slice(finalCompleteIndex, finalSuccessIndex)
    : "";

  assert(
    /returns\s+(?:boolean|integer|table|jsonb)|returning|raise\s+exception|GET\s+DIAGNOSTICS[\s\S]{0,120}ROW_COUNT/i.test(body),
    "complete_signup_email_materialization must expose or raise on zero-row updates; RETURNS void with unchecked UPDATE can create false public success",
  );
  assert(
    /ROW_COUNT|RETURNING|FOUND|not\s+found|raise\s+exception|updated_count/i.test(body),
    "complete_signup_email_materialization must detect that exactly one materializing confirmation row was updated",
  );
  assert(finalCompleteIndex > 0, "Guard must inspect final materialized RPC call in confirm-email endpoint");
  assert(finalSuccessIndex > finalCompleteIndex, "Guard must inspect public success HTML/login CTA after materialized RPC");
  assert(
    /const\s*\{[\s\S]{0,120}(?:error|data|count)[\s\S]{0,120}\}\s*=\s*await|if\s*\([\s\S]{0,180}(?:materializationError|completeError|error|!\s*data|count\s*!==\s*1|!\s*updated)/i.test(finalSlice),
    "confirm-email must check complete_signup_email_materialization result before returning public success HTML/login CTA",
  );
});

Deno.test("RED FREE complete materialization SQL contract: RPC RETURNS boolean and returns matched-row success", async () => {
  const sql = await readAllSqlMigrations();
  const definition = latestFunctionDefinition(sql, "complete_signup_email_materialization");
  const body = latestFunctionBody(sql, "complete_signup_email_materialization");

  assert(
    /returns\s+boolean\b/i.test(definition),
    "complete_signup_email_materialization must declare RETURNS boolean so callers can trust a false zero-row update before public success",
  );
  assert(
    /update\s+public\.signup_email_confirmations[\s\S]*where[\s\S]*status\s*=\s*'materializing'/i.test(body),
    "complete_signup_email_materialization must update exactly the materializing confirmation row",
  );
  assert(
    /return\s+(?:found|updated|matched|row_count\s*=\s*1)\b|GET\s+DIAGNOSTICS[\s\S]{0,160}ROW_COUNT[\s\S]{0,160}return\s+\(?\s*\w+\s*=\s*1/i.test(body),
    "complete_signup_email_materialization must explicitly return whether the update matched/succeeded",
  );
});

Deno.test("RED FREE expiration SQL contract: expire_signup_email_confirmation returns boolean in every path", async () => {
  const sql = await readAllSqlMigrations();
  const definition = latestFunctionDefinition(sql, "expire_signup_email_confirmation");
  const body = latestFunctionBody(sql, "expire_signup_email_confirmation");

  assert(/returns\s+boolean\b/i.test(definition), "expire_signup_email_confirmation must declare RETURNS boolean");
  assert(
    /return\s+(?:true|false|found|expired|updated|matched|row_count\s*>\s*0)\b|GET\s+DIAGNOSTICS[\s\S]{0,160}ROW_COUNT[\s\S]{0,160}return/i.test(body),
    "expire_signup_email_confirmation must explicitly return a boolean on the successful service-role path, including the zero-row case",
  );
  assert(
    !/END\s*;\s*$/i.test(body.trim()) || /return\b[\s\S]*END\s*;\s*$/i.test(body.trim()),
    "expire_signup_email_confirmation must not fall through to END without RETURN in a RETURNS boolean function",
  );
});

Deno.test("RED FREE duplicate auth user contract: auth-first signup binds the created user before confirm materialization", async () => {
  const signupSource = await readText(new URL("../../../apps/landing/src/pages/api/signup/create-account-business.ts", import.meta.url));
  const confirmSource = await readText(new URL("../../../apps/landing/src/pages/api/signup/confirm-email.ts", import.meta.url));
  const createUserIndex = signupSource.search(/auth\.admin\.createUser/);
  const confirmationInsertIndex = signupSource.search(/\.from\(["']signup_email_confirmations["']\)[\s\S]{0,120}\.insert\(confirmationPayload\)/i);
  const confirmationPayload = /const\s+confirmationPayload\s*=\s*\{[\s\S]*?\n\s*\};/.exec(signupSource)?.[0] ?? "";
  const duplicateBranch = /if\s*\(\s*isDuplicateUserError\([\s\S]*?\n\s*}\s*\n\s*return\s+jsonResponse/i.exec(signupSource)?.[0] ?? "";
  const firstProfileMutationIndex = confirmSource.search(/\.from\(["']profiles["']\)[\s\S]{0,120}\.upsert|\.from\(["']businesses["']\)[\s\S]{0,120}\.(?:insert|upsert)|\.from\(["']business_settings["']\)[\s\S]{0,120}\.upsert/i);
  const beforeMutation = firstProfileMutationIndex > 0 ? confirmSource.slice(0, firstProfileMutationIndex) : "";

  assert(createUserIndex > 0, "Guard must inspect auth user creation in signup request endpoint");
  assert(confirmationInsertIndex > createUserIndex, "Guard must inspect confirmation insert after signup-created auth user");
  assert(
    !/auth\.admin\.createUser|generateLink/i.test(confirmSource),
    "Confirm route must not create an auth user or generate login/welcome action links; auth user creation happens during signup request",
  );
  assert(
    !/findAuthUserByEmail|listUsers|getUserByEmail|existing(?:Auth)?User/i.test(signupSource.slice(0, createUserIndex)),
    "FREE signup must not pre-adopt an existing auth user by email before createUser; existing-account duplicate must fail closed/generic",
  );
  assert(
    /created_user_id\s*:\s*authUserId|trusted_user_id|bound_user_id|materialization_user_id/i.test(confirmationPayload),
    "FREE confirmation rows must bind the signup-created trusted user id, not rely on email lookup during confirmation",
  );
  assert(
    !/findAuthUserByEmail|listUsers|getUserByEmail|existing(?:Auth)?User|adopt/i.test(duplicateBranch),
    "Duplicate createUser handling must not adopt the existing auth user and later mutate profile/business/settings/onboarding/subscription/welcome from unauth metadata",
  );
  assert(
    /metadata\.created_user_id|created_user_id|trustedUserId|bound_user_id/i.test(beforeMutation),
    "Confirm route profile/business mutations must be gated on the trusted/bound user id from the same signup intent",
  );
  assert(
    /deleteUser\s*\(|cleanupCreatedAuthUser|createdUserId|authUserId/i.test(signupSource.slice(confirmationInsertIndex)),
    "If durable confirmation user_id binding fails after signup createUser, the just-created auth user must be cleaned up before retry",
  );
});

Deno.test("RED PAID consume contract: success requires durable pending_signup_intents confirmation update", async () => {
  const sql = await readAllSqlMigrations();
  const body = latestFunctionBody(sql, "consume_signup_email_confirmation");
  const finalSelect = body.slice(body.lastIndexOf("SELECT"));

  assert(/paid_mark/i.test(body), "Guard must inspect paid pending_signup_intents marking CTE");
  assert(
    /paid_mark/i.test(finalSelect) && /(?:left\s+join|join|exists)[\s\S]*paid_mark/i.test(finalSelect),
    "For paid_signup, consume RPC must return success only when pending_signup_intents was durably marked confirmed; zero-row paid_mark must not consume/return token success",
  );
  assert(
    /c\.purpose\s*<>\s*'paid_signup'|c\.purpose\s*=\s*'free_signup'|paid_mark\.id\s+is\s+not\s+null/i.test(finalSelect),
    "Final consume result must distinguish FREE rows from PAID rows and require a paid_mark row for PAID success",
  );
});

Deno.test("RED email outbox success scrub contract: token-bearing payload fields are scrubbed only after provider success", async () => {
  const source = await readText(new URL("process-email-outbox/index.ts", functionsDir));
  const markStart = source.indexOf("async function markOutboxRecordSent");
  const markEnd = source.indexOf("Deno.serve", markStart);
  const markBody = markStart >= 0 && markEnd > markStart ? source.slice(markStart, markEnd) : "";
  const clearStart = source.indexOf("async function clearOutboxClaimAfterProviderError");
  const clearEnd = source.indexOf("async function markOutboxRecordSent", clearStart);
  const clearBody = clearStart >= 0 && clearEnd > clearStart ? source.slice(clearStart, clearEnd) : "";
  const sensitiveFields = ["confirmation_url", "set_password_url", "first_login_url", "action_link"];

  assert(markBody.length > 0, "Guard must inspect successful outbox finalization helper");
  assert(/payload\s*:|jsonb_set|jsonb_strip_nulls|scrub/i.test(markBody), "Successful finalization must update/scrub the persisted outbox payload");
  for (const field of sensitiveFields) {
    assertStringIncludes(markBody, field, `Successful outbox finalization must scrub payload.${field}`);
  }
  assert(
    /token-bearing|token_bearing|https?:\/\/|url/i.test(markBody) && /null|delete|undefined|scrub/i.test(markBody),
    "Successful outbox finalization must also remove raw token-bearing URLs, not only named fields",
  );
  assert(
    !/payload\s*:|jsonb_set|jsonb_strip_nulls|scrub/i.test(clearBody),
    "Provider failure claim-clear must retain the original payload so retry can render the same email",
  );
});

Deno.test("RED paid signup ordering: create-subscription cannot create Mercado Pago preapproval before email confirmation", async () => {
  const source = await readText(new URL("create-subscription/index.ts", functionsDir));
  const providerFetchIndex = source.search(/fetch\(\s*`?\$?\{?MP_API_BASE[\s\S]{0,120}\/preapproval/);
  assert(providerFetchIndex > 0, "Guard must inspect the Mercado Pago preapproval fetch");

  const beforeProviderFetch = source.slice(0, providerFetchIndex);
  assert(
    /signup_email_confirmations|email_confirmed_at|confirmation_status|verified_at|status\s*[,)]/.test(beforeProviderFetch),
    "create-subscription must load a verified email confirmation/pending verified intent before Mercado Pago preapproval",
  );
  assert(
    /email_confirmed|confirmed|verified/.test(beforeProviderFetch),
    "create-subscription must fail closed unless the pending signup email has been confirmed",
  );
});

Deno.test("RED paid signup webhook: first-login/set-password link is preserved and plaintext password is never materialized", async () => {
  const source = await readText(new URL("mercadopago-webhook/index.ts", functionsDir));
  const materializeStart = source.indexOf("async function materializePendingSignup");
  const materializeEnd = source.indexOf("// Verify payment status", materializeStart);
  const materializeBody = materializeStart >= 0 && materializeEnd > materializeStart
    ? source.slice(materializeStart, materializeEnd)
    : "";

  assert(materializeBody.length > 0, "Guard must inspect paid signup materialization");
  assert(/generateSetPasswordLink|set_password_url|firstLoginUrl|first_login_url/i.test(source), "webhook welcome path must preserve a secure first-login/set-password action link");
  assert(!/password\s*:/i.test(materializeBody), "webhook materialization must not set or store a plaintext password");
});

Deno.test("RED PAID MP post-provider persistence: init_point is returned only after checked DB updates", async () => {
  const source = await readText(new URL("create-subscription/index.ts", functionsDir));
  const providerSuccessIndex = source.indexOf("const mpData = await mpResponse.json()");
  const returnInitPointIndex = source.indexOf("init_point: effectiveInitPoint", providerSuccessIndex);
  const successSlice = providerSuccessIndex >= 0 && returnInitPointIndex > providerSuccessIndex
    ? source.slice(providerSuccessIndex, returnInitPointIndex)
    : "";

  assert(providerSuccessIndex > 0, "Guard must inspect the Mercado Pago success response handling");
  assert(returnInitPointIndex > providerSuccessIndex, "Guard must inspect the response that returns init_point/payment URL");
  assert(
    /billing_checkout_sessions[\s\S]{0,260}update[\s\S]{0,260}(?:error|count|data)/i.test(successSlice),
    "After MP success, billing_checkout_sessions provider update must capture/check error or matched row count before returning init_point",
  );
  assert(
    /(?:billingSessionUpdateError|checkoutSessionUpdateError|subscriptionSessionUpdateError)|(?:count\s*[,}]|select\(["'][^"']*id)/i.test(successSlice),
    "Checkout session provider update must expose a checked error and/or matched-row signal",
  );
  assert(
    /if\s*\([\s\S]{0,220}(?:billingSessionUpdateError|checkoutSessionUpdateError|subscriptionSessionUpdateError|!\s*updatedCheckoutSession|checkoutSessionUpdateCount\s*!==\s*1|count\s*!==\s*1)/i.test(successSlice),
    "Checkout session persistence failure or zero matched rows must fail closed before init_point is returned",
  );
  assert(
    /if\s*\(\s*pendingSignupRecord\s*\)\s*\{[\s\S]*pending_signup_intents[\s\S]{0,260}update[\s\S]{0,260}(?:error|count|data)/i.test(successSlice),
    "Pending-signup provider update must capture/check error or matched row count before returning init_point",
  );
  assert(
    /(?:pendingSignupUpdateError|pendingIntentProviderUpdateError|pendingSignupProviderUpdateError)|(?:pendingSignupUpdateCount|pendingIntentUpdateCount)|(?:updatedPendingSignup|updatedPendingIntent)/i.test(successSlice),
    "Pending-signup provider update must expose a checked error and/or matched-row signal",
  );
  assert(
    /if\s*\([\s\S]{0,220}(?:pendingSignupUpdateError|pendingIntentProviderUpdateError|pendingSignupProviderUpdateError|!\s*updatedPendingSignup|!\s*updatedPendingIntent|pendingSignupUpdateCount\s*!==\s*1|pendingIntentUpdateCount\s*!==\s*1)/i.test(successSlice),
    "Pending-signup persistence failure or zero matched rows must fail closed before init_point is returned",
  );
});

Deno.test("RED PAID MP recovery contract: approved webhook can recover pending signup by trusted session/external_reference when provider binding update failed", async () => {
  const sql = await readAllSqlMigrations();
  const validationDefinition = latestFunctionDefinition(sql, "validate_pending_signup_subscription_session");
  const validationBody = latestFunctionBody(sql, "validate_pending_signup_subscription_session");
  const webhookSource = await readText(new URL("mercadopago-webhook/index.ts", functionsDir));

  assert(
    /billing_checkout_sessions/i.test(validationBody) && /pending_signup_intents/i.test(validationBody),
    "validate_pending_signup_subscription_session must bind trusted checkout-session state to pending_signup_intents",
  );
  assert(
    /pending_signup_intent_id/i.test(validationBody) && /external_reference\s*=\s*normalized_reference/i.test(validationBody),
    "Pending signup recovery must be anchored by trusted billing_checkout_sessions.pending_signup_intent_id and external_reference",
  );
  assert(
    /(?:psi\.provider_subscription_id\s*=\s*normalized_provider_subscription_id|psi\.provider_subscription_id\s+is\s+null|coalesce\s*\(\s*psi\.provider_subscription_id\s*,\s*normalized_provider_subscription_id\s*\))/i.test(validationBody),
    "Validation must accept or repair the case where MP succeeded but pending_signup_intents.provider_subscription_id was not durably updated yet",
  );
  assert(
    /provider_subscription_id\s*=\s*(?:coalesce\s*\(\s*provider_subscription_id\s*,\s*normalized_provider_subscription_id\s*\)|normalized_provider_subscription_id)|provider_subscription_id\s*,\s*updated_at/i.test(validationBody),
    "Recovery validation must durably bind provider_subscription_id before returning the pending signup intent id",
  );
  assert(
    /psi\.status\s+IN\s*\([^)]*'failed'[^)]*\)|\.in\(\s*["']status["']\s*,\s*\[[^\]]*["']failed["'][^\]]*\]/i.test(validationBody),
    "Validation must accept retry of failed pending signup materialization rows after a trusted MP approval",
  );
  assert(
    !/psi\.user_id\s+IS\s+NULL/i.test(validationBody),
    "Failed pending signup retry must not reject a trusted partial intent solely because user_id was already durably bound to that same intent",
  );
  assert(
    /psi\.business_id\s+IS\s+NULL/i.test(validationBody) && /psi\.materialized_at\s+IS\s+NULL/i.test(validationBody),
    "Failed pending signup retry is only valid before business/materialization completion",
  );
  assert(
    /NOT\s+EXISTS[\s\S]{0,260}business_subscriptions[\s\S]{0,260}(?:provider_subscription_id|preapproval_id|mercadopago_subscription_id)/i.test(validationBody),
    "Failed pending signup retry must be rejected once a subscription for the trusted provider resource already exists",
  );
  assert(
    /psi\.status\s*<>\s*'failed'[\s\S]{0,260}(?:bcs\.provider_resource_id\s*=\s*normalized_provider_subscription_id|bcs\.provider_preference_id\s*=\s*normalized_provider_subscription_id|psi\.provider_subscription_id\s*=\s*normalized_provider_subscription_id)/i.test(validationBody),
    "Failed pending signup retry must be anchored by an already bound provider_subscription_id on the intent or checkout session, not any arbitrary failed row",
  );
  assert(
    /validate_pending_signup_subscription_session[\s\S]{0,260}p_external_reference:\s*externalReference[\s\S]{0,260}p_provider_subscription_id:\s*lookupResourceId/i.test(webhookSource),
    "Webhook must call pending-signup validation with trusted external_reference/session and provider resource identity",
  );
  assert(
    /returns\s+(?:uuid|table|jsonb)\b/i.test(validationDefinition),
    "Validation must return a durable pending signup identity only after binding checks/recovery succeed",
  );
});

Deno.test("RED PAID webhook partial materialization retry: failed/materializing signup is re-claimable without unsafe auth adoption", async () => {
  const source = await readText(new URL("mercadopago-webhook/index.ts", functionsDir));
  const materializeStart = source.indexOf("async function materializePendingSignup");
  const materializeEnd = source.indexOf("// Verify payment status", materializeStart);
  const materializeBody = materializeStart >= 0 && materializeEnd > materializeStart
    ? source.slice(materializeStart, materializeEnd)
    : "";

  assert(materializeBody.length > 0, "Guard must inspect paid signup materialization");
  assert(
    /pending_signup_intents[\s\S]{0,260}(?:update|rpc\(["']claim)[\s\S]{0,260}status[\s\S]{0,160}(?:failed|materializing|approved)/i.test(materializeBody),
    "Webhook retry must atomically re-claim materializing/failed partial pending signup rows instead of only selecting materializing rows",
  );
  assert(
    /\.in\(\s*["']status["']\s*,\s*\[[^\]]*(?:failed|approved)[^\]]*materializing|status\s+in\s*\([^)]*(?:failed|approved)[^)]*materializing/i.test(materializeBody),
    "Re-claim contract must include failed/partial states, not only status = materializing",
  );
  assert(
    !/findAuthUserByEmail|listUsers|getUserByEmail|existing(?:Auth)?User|adoptedUser|adopt/i.test(materializeBody),
    "Paid materialization must not adopt an arbitrary existing auth user by email; only a trusted user_id already bound to the same intent may be reused",
  );
  assert(
    /intent\.user_id|user_id[\s\S]{0,160}(?:params\.pendingSignupIntentId|intent\.id)|created_user_id|trusted_user_id|bound_user_id/i.test(materializeBody),
    "Paid materialization retry may reuse only user_id already trusted/bound to the same pending_signup_intent",
  );
  assert(
    /23505|duplicate|already\s*(?:exists|registered)|user_already_exists|EMAIL_ALREADY_REGISTERED/i.test(materializeBody),
    "Duplicate auth/business retry signals must fail closed or retry trusted bound progress, not adopt unrelated existing users",
  );
  assert(
    /deleteUser\s*\(|cleanupJustCreatedPendingSignupAuthUser|createdUserId/i.test(materializeBody),
    "If durable pending_signup_intents.user_id binding fails after createUser, the just-created paid signup auth user must be cleaned up before retry",
  );
});

Deno.test("RED PAID webhook materialization persistence: onboarding and final intent updates are checked before processed", async () => {
  const source = await readText(new URL("mercadopago-webhook/index.ts", functionsDir));
  const materializeStart = source.indexOf("async function materializePendingSignup");
  const materializeEnd = source.indexOf("// Verify payment status", materializeStart);
  const materializeBody = materializeStart >= 0 && materializeEnd > materializeStart
    ? source.slice(materializeStart, materializeEnd)
    : "";
  const onboardingIndex = materializeBody.search(/business_onboarding_state[\s\S]{0,180}upsert/i);
  const subscriptionIndex = materializeBody.search(/business_subscriptions[\s\S]{0,220}(?:insert|upsert)/i);
  const finalIntentIndex = materializeBody.search(/pending_signup_intents[\s\S]{0,220}status\s*:\s*["']materialized["']/i);
  const returnIndex = materializeBody.lastIndexOf("return subscription");
  const onboardingSlice = onboardingIndex >= 0 && subscriptionIndex > onboardingIndex ? materializeBody.slice(onboardingIndex, subscriptionIndex) : "";
  const finalIntentSlice = finalIntentIndex >= 0 && returnIndex > finalIntentIndex ? materializeBody.slice(finalIntentIndex, returnIndex) : "";

  assert(materializeBody.length > 0, "Guard must inspect paid signup materialization");
  assert(onboardingIndex > 0, "Paid webhook must upsert onboarding state during materialization");
  assert(
    /const\s*\{[\s\S]{0,120}(?:error|data|count)[\s\S]{0,120}\}\s*=\s*await|(?:onboardingError|onboardingResult|onboardingState|updatedOnboarding)/i.test(onboardingSlice),
    "business_onboarding_state upsert result must be captured and checked before webhook success/processed",
  );
  assert(
    /if\s*\([\s\S]{0,180}(?:onboardingError|!\s*onboarding|!\s*onboardingState|count\s*!==\s*1|!\s*updatedOnboarding)/i.test(onboardingSlice),
    "business_onboarding_state upsert failure or zero-row result must fail materialization before processed",
  );
  assert(finalIntentIndex > 0, "Paid webhook must mark pending_signup_intents materialized only after side effects succeed");
  assert(
    /const\s*\{[\s\S]{0,120}(?:error|data|count)[\s\S]{0,120}\}\s*=\s*await|(?:pendingSignupMaterializedError|pendingIntentMaterializedError|materializedIntent|updatedIntent|intentUpdateCount)/i.test(finalIntentSlice),
    "Final pending_signup_intents materialized update result must be captured before returning subscription",
  );
  assert(
    /if\s*\([\s\S]{0,220}(?:pendingSignupMaterializedError|pendingIntentMaterializedError|!\s*materializedIntent|!\s*updatedIntent|intentUpdateCount\s*!==\s*1|count\s*!==\s*1)/i.test(finalIntentSlice),
    "Final pending_signup_intents materialized update failure or zero-row result must prevent webhook processed success",
  );
});

Deno.test("RED PAID webhook partial failure contract: failed welcome/outbox leaves no stranded active materializing intent", async () => {
  const source = await readText(new URL("mercadopago-webhook/index.ts", functionsDir));
  const materializeStart = source.indexOf("async function materializePendingSignup");
  const materializeEnd = source.indexOf("// Verify payment status", materializeStart);
  const materializeBody = materializeStart >= 0 && materializeEnd > materializeStart
    ? source.slice(materializeStart, materializeEnd)
    : "";
  const welcomeFailureIndex = materializeBody.search(/pending_signup_welcome_bootstrap_missing|welcomeBootstrapSatisfied[\s\S]{0,120}throw/i);
  const failureSlice = welcomeFailureIndex > 0 ? materializeBody.slice(Math.max(0, welcomeFailureIndex - 600), welcomeFailureIndex + 260) : "";

  assert(materializeBody.length > 0, "Guard must inspect paid signup materialization");
  assert(welcomeFailureIndex > 0, "Guard must inspect welcome/outbox bootstrap failure path");
  assert(
    /catch\s*\(|try\s*\{|markPendingSignupIntentFailed|pending_signup_intents[\s\S]{0,220}update[\s\S]{0,180}status\s*:\s*["'](?:failed|expired|approved)["']|allow_retry|retryable/i.test(failureSlice),
    "If paid handoff materialization fails after partial confirmation/outbox work, the pending intent must be marked/reverted failed/expired/approved-retryable or otherwise explicitly re-claimable",
  );
  assert(
    !/status\s*:\s*["']materializing["'][\s\S]{0,320}throw\s+new\s+Error\(["']pending_signup_welcome_bootstrap_missing/i.test(materializeBody),
    "Welcome/outbox failure must not throw while leaving the intent stranded in active materializing state",
  );
});

Deno.test("RED email branding: confirmation and welcome emails use Orvel dark/violet palette and reject old beige/brown palette", async () => {
  const templateSource = await readText(new URL("_shared/templates/business-templates.ts", functionsDir));
  const requiredPalette = ["#0A0A0A", "#121212", "#F1F5F9", "#94A3B8", "#7C3AED", "#6D28D9", "#A78BFA"];
  const oldPalette = ["#f6efe7", "#30251d", "#fffaf5", "#ead8c7", "#9a6b43", "#8a5a36"];

  assert(/renderSignupEmailConfirmation|signup_email_confirmation/i.test(templateSource), "confirmation email template must exist");
  assert(/renderBusinessWelcomeEmail|business_welcome/i.test(templateSource), "welcome email template must exist");

  for (const color of requiredPalette) {
    assertStringIncludes(templateSource, color, `email templates must include Orvel palette color ${color}`);
  }
  for (const color of oldPalette) {
    assertEquals(templateSource.includes(color), false, `email templates must not use old beige/brown palette color ${color}`);
  }
});

Deno.test("RED appointment email branding: appointment templates reject beige/brown and require dark/violet plus inline secondary links", async () => {
  const templateSource = await readText(new URL("_shared/templates/appointment-templates.ts", functionsDir));
  const requiredPalette = ["#0A0A0A", "#121212", "#F1F5F9", "#94A3B8", "#7C3AED", "#6D28D9", "#A78BFA"];
  const oldPalette = ["#f6efe7", "#f7f0e8", "#30251d", "#2b2118", "#fffaf5", "#ead8c7", "#9a6b43", "#8a5a36", "#6b5b50"];

  assert(/renderAppointment(?:Confirmation|Reminder24h|Cancellation|Reschedule|BusinessNotification)Email/i.test(templateSource), "appointment email templates must be inspectable");
  for (const color of requiredPalette) {
    assertStringIncludes(templateSource, color, `appointment templates must include Orvel dark/violet palette color ${color}`);
  }
  for (const color of oldPalette) {
    assertEquals(templateSource.includes(color), false, `appointment templates must not use old beige/brown palette color ${color}`);
  }
  assert(
    /cancelLink[\s\S]{0,240}style\s*=\s*["'][^"']*color\s*:\s*#A78BFA|rescheduleLink[\s\S]{0,240}style\s*=\s*["'][^"']*color\s*:\s*#A78BFA/i.test(templateSource),
    "Secondary appointment action links (cancel/reschedule) must set inline violet link color for email clients",
  );
});
