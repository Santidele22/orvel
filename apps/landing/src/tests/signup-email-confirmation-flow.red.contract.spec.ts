import { describe, expect, it } from 'vitest';

const CREATE_ACCOUNT_BUSINESS_API = new URL('../pages/api/signup/create-account-business.ts', import.meta.url);
const CONFIRM_EMAIL_API = new URL('../pages/api/signup/confirm-email.ts', import.meta.url);
const PENDING_SIGNUP_PROTECT_API = new URL('../pages/api/signup/pending-intent/protect.ts', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const MIGRATIONS_DIR = new URL('../../../../supabase/migrations/', import.meta.url);

async function readSource(url: URL): Promise<string> {
  return await import('node:fs/promises').then(({ readFile }) => readFile(url, 'utf8'));
}

async function readMigrationSources(): Promise<string> {
  const { readdir, readFile } = await import('node:fs/promises');
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql')).map((entry) => entry.name).sort();

  return (await Promise.all(sqlFiles.map((fileName) => readFile(new URL(fileName, MIGRATIONS_DIR), 'utf8')))).join('\n');
}

function sliceBefore(source: string, marker: RegExp): string {
  const match = marker.exec(source);
  expect(match, `Expected source to contain marker ${marker}`).toBeTruthy();
  return source.slice(0, match!.index);
}

function migrationsDefineBusinessIsActive(migrations: string): boolean {
  const businessCreateBlocks = Array.from(
    migrations.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.businesses\s*\(([\s\S]*?)\n\);/gi),
    (match) => match[1] ?? '',
  );

  return businessCreateBlocks.some((block) => /\bis_active\b/i.test(block))
    || /alter\s+table\s+(?:if\s+exists\s+)?public\.businesses[\s\S]{0,240}add\s+column(?:\s+if\s+not\s+exists)?\s+is_active\b/i.test(migrations);
}

describe('RED signup email confirmation flow contract', () => {
  it('FREE signup request creates the Supabase Auth user with the canonical password before confirmation intent/outbox', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);
    const authCreateIndex = source.search(/auth\.admin\.createUser\s*\(/);
    const confirmationInsertIndex = source.search(/\.from\(["']signup_email_confirmations["']\)[\s\S]{0,180}\.insert\(/);
    const outboxInsertIndex = source.search(/\.from\(["']notification_email_outbox["']\)[\s\S]{0,180}\.insert\(/);
    const authCreateSlice = authCreateIndex >= 0 ? source.slice(authCreateIndex, authCreateIndex + 900) : '';

    expect(authCreateIndex, 'signup must create Supabase Auth user during the signup request, not during confirm').toBeGreaterThan(0);
    expect(confirmationInsertIndex, 'signup must still create a confirmation intent').toBeGreaterThan(authCreateIndex);
    expect(outboxInsertIndex, 'signup must enqueue only the email-confirmation email after auth user creation').toBeGreaterThan(confirmationInsertIndex);
    expect(authCreateSlice, 'password is the canonical credential and must be passed only to Supabase Auth signup/createUser').toMatch(/password\s*:\s*(?:password|body\.password|cleanPassword|validated\.password|payload\.password)/i);
    expect(authCreateSlice).toMatch(/email_confirm\s*:\s*true/i);
    expect(source, 'FREE signup must provision the tenant before returning signup_ready').toMatch(/provisionFreeSignupTenant|\.from\(["']businesses["']\)/);
  });

  it('pending confirmation request path never stores plaintext/reversible password, credential fields, raw token, or sensitive logs outside Supabase Auth', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);
    const confirmationPayloadSlice = source.match(/const\s+confirmationPayload\s*=\s*\{[\s\S]*?\n\s*\};/i)?.[0] ?? source;
    const pendingSlice = source.slice(0, source.search(/return\s+jsonResponse\s*\(\s*\{\s*ok\s*:\s*true/i));

    expect(pendingSlice).toMatch(/token_hash|hashToken|sha256Text|crypto\.subtle\.digest/i);
    expect(confirmationPayloadSlice).not.toMatch(/password|plain(?:text)?_password|credential|raw_token/i);
    expect(pendingSlice).not.toMatch(/plain(?:text)?_password|raw_token|console\.(?:log|warn|error)\([\s\S]*(?:email|password|token)/i);
  });

  it('FREE public responses are generic for request/resend/existing-email cases', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);

    expect(source).toMatch(/signup_ready|ok\s*:\s*true/i);
    expect(source).not.toMatch(/signup_existing_or_created|EMAIL_ALREADY_REGISTERED|already registered|already exists|continuá con el ingreso/i);
    expect(source).not.toMatch(/error\s*:\s*["']signup_create_failed["'][\s\S]{0,160}No pudimos crear la cuenta/i);
  });

  it('FREE success is durable only after both confirmation intent and email outbox inserts are checked', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);
    const confirmationInsertIndex = source.search(/\.from\(["']signup_email_confirmations["']\)[\s\S]{0,120}\.insert\(/);
    const outboxInsertIndex = source.search(/\.from\(["']notification_email_outbox["']\)[\s\S]{0,120}\.insert\(/);
    const successMatches = Array.from(source.matchAll(/return\s+jsonResponse\s*\(\s*\{\s*ok\s*:\s*true\s*,\s*status\s*:\s*["']signup_ready["']/gi));
    const successIndex = successMatches.map((match) => match.index ?? -1).find((index) => index > outboxInsertIndex) ?? -1;
    const confirmationSlice = confirmationInsertIndex >= 0 && outboxInsertIndex > confirmationInsertIndex ? source.slice(confirmationInsertIndex, outboxInsertIndex) : '';
    const outboxSlice = outboxInsertIndex >= 0 && successIndex > outboxInsertIndex ? source.slice(outboxInsertIndex, successIndex) : '';

    expect(confirmationInsertIndex, 'confirmation insert must happen before public success').toBeGreaterThan(0);
    expect(outboxInsertIndex, 'confirmation email outbox insert must happen before public success').toBeGreaterThan(confirmationInsertIndex);
    expect(successIndex, 'public success response must be inspectable').toBeGreaterThan(outboxInsertIndex);
    expect(confirmationSlice).toMatch(/error\s*:\s*(?:confirmationError|confirmationInsertError)|if\s*\(\s*(?:confirmationError|confirmationInsertError|!\s*confirmation)/i);
    expect(confirmationSlice, 'confirmation insert failure must not be ignored as public success unless an existing usable confirmation and outbox are verified').not.toMatch(/if\s*\(\s*confirmationError\s*\)\s*\{[\s\S]{0,240}return\s+jsonResponse\s*\(\s*\{\s*ok\s*:\s*true\s*,\s*status\s*:\s*["']signup_ready["']/i);
    expect(confirmationSlice).toMatch(/throw|rollback|delete\(\)|status\s*:\s*["']failed|existing[\s\S]{0,160}(?:notification_email_outbox|outbox)/i);
    expect(outboxSlice).toMatch(/error\s*:\s*(?:outboxError|emailOutboxError|confirmationEmailError)|if\s*\(\s*(?:outboxError|emailOutboxError|confirmationEmailError|!\s*outbox)/i);
    expect(outboxSlice, 'outbox insert failure must not return public success after cancelling a confirmation unless a durable outbox exists').not.toMatch(/if\s*\(\s*outboxError\s*\)\s*\{[\s\S]{0,360}return\s+jsonResponse\s*\(\s*\{\s*ok\s*:\s*true\s*,\s*status\s*:\s*["']signup_ready["']/i);
    expect(outboxSlice).toMatch(/throw|rollback|delete\(\)|status\s*:\s*["']failed|existing[\s\S]{0,160}(?:notification_email_outbox|outbox)/i);
  });

  it('FREE confirm endpoint does not create/reset credentials or enqueue second welcome/password email after confirmation', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);

    expect(source, 'auth user must already exist from signup request; confirm only materializes domain rows').not.toMatch(/auth\.admin\.createUser\s*\(/i);
    expect(source, 'password remains canonical from signup; confirmation must not generate recovery/reset/change-password links').not.toMatch(/auth\.admin\.generateLink|type\s*:\s*["']recovery["']|set_password_url|reset|change-password/i);
    expect(source, 'email confirmation must not enqueue business_welcome or any second post-confirmation email').not.toMatch(/template_key\s*:\s*["']business_welcome["']|welcomeOutbox|notification_email_outbox[\s\S]{0,260}insert/i);
  });

  it('FREE confirm endpoint flips product email_confirmed_at without provisioning a tenant', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);
    const freeSignupIndex = source.search(/purpose\s*===\s*["']free_signup["']|purpose\s*!==\s*["']paid_signup["']/i);
    const freeSlice = freeSignupIndex >= 0 ? source.slice(freeSignupIndex) : source;

    expect(freeSlice, 'confirm must set the product-level email_confirmed_at flag').toMatch(/email_confirmed_at/i);
    expect(freeSlice, 'late confirm must re-enable the public turnero').toMatch(/public_turnero_disabled_at\s*:\s*null/i);
    expect(freeSlice, 'free_signup confirm must not insert businesses').not.toMatch(/\.from\(["']businesses["']\)[\s\S]{0,320}\.insert\(/i);
    expect(freeSlice).not.toMatch(/password\s*:|generateLink|recovery|reset|change-password/i);
  });

  it('FREE confirm endpoint uses the RPC confirmation_id contract when completing materialization', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);
    const completeCalls = Array.from(source.matchAll(/complete_signup_email_materialization[\s\S]{0,180}/gi)).map((match) => match[0]).join('\n');

    expect(source).toMatch(/consume_signup_email_confirmation/);
    expect(source).toMatch(/confirmation_id|confirmationId/);
    expect(completeCalls, 'complete_signup_email_materialization must receive the RPC-returned confirmation_id, not nonexistent confirmation.id').toMatch(/p_confirmation_id\s*:\s*(?:confirmation\.confirmation_id|confirmationId|confirmation\[["']confirmation_id["']\])/i);
    expect(completeCalls).not.toMatch(/p_confirmation_id\s*:\s*confirmation\.id\b/i);
  });

  it('FREE confirm uses the trusted signup-created auth user id and fails closed instead of adopting by email', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);
    const createUserIndex = source.search(/auth\.admin\.createUser/);

    expect(createUserIndex, 'auth user creation moved to signup request; this legacy confirm-time creation marker must be absent').toBe(-1);
    expect(source, 'confirmation payload/RPC result must carry the trusted auth user id created at signup in protected metadata').toMatch(/created_user_id|trusted_user_id|bound_user_id|materialization_user_id/i);
    expect(source, 'application code must not depend on a signup_email_confirmations.auth_user_id column that migrations/RPC do not define').not.toMatch(/auth_user_id/i);
    expect(source, 'unauthenticated confirmation metadata must not be used to pre-adopt an existing auth user by email').not.toMatch(/listUsers|getUserByEmail|findAuthUserByEmail|adopt/i);
    expect(source).toMatch(/failed_materialization|cancelled|confirmation_invalid_or_expired|signup_materialize_failed|already_materialized/i);
  });

  it('FREE signup provision seeds support_email, working hours, and live booking defaults', async () => {
    const provisionSource = await readSource(new URL('../lib/server/provision-free-signup.ts', import.meta.url));
    const inputType = provisionSource.match(/export type ProvisionFreeSignupInput\s*=\s*\{[\s\S]*?\};/)?.[0] ?? '';
    const settingsUpsert = provisionSource.match(/\.from\(["']business_settings["']\)[\s\S]*?\.select\(/)?.[0] ?? '';

    expect(inputType, 'provision input must accept the alta email').toMatch(/\bemail\s*:/);
    expect(settingsUpsert, 'business_settings upsert must be inspectable').toMatch(/business_settings/i);
    expect(settingsUpsert).toMatch(/support_email\s*:\s*input\.email/);
    expect(settingsUpsert).toMatch(/support_phone\s*:\s*input\.phone/);
    expect(settingsUpsert).toMatch(/buffer_minutes\s*:\s*15/);
    expect(settingsUpsert).toMatch(/min_notice_minutes\s*:\s*120/);
    expect(settingsUpsert).toMatch(/slot_interval_minutes\s*:\s*30/);
    expect(settingsUpsert).toMatch(/cancellation_window_minutes\s*:\s*60/);
    expect(settingsUpsert).toMatch(/working_hours\s*:/);
    expect(settingsUpsert).toMatch(/monday\s*:\s*\{\s*enabled\s*:\s*true\s*,\s*start\s*:\s*["']09:00["']\s*,\s*end\s*:\s*["']18:00["']\s*\}/);
    expect(settingsUpsert).toMatch(/saturday\s*:\s*\{\s*enabled\s*:\s*true\s*,\s*start\s*:\s*["']10:00["']\s*,\s*end\s*:\s*["']14:00["']\s*\}/);
    expect(settingsUpsert).toMatch(/sunday\s*:\s*\{\s*enabled\s*:\s*false/);
    expect(settingsUpsert, 'working hours must be a real weekday object, not the DB empty-object default').not.toMatch(/working_hours\s*:\s*\{\s*\}/);
  });

  it('FREE signup provision marks onboarding dashboard-ready with captured business type and account user', async () => {
    const provisionSource = await readSource(new URL('../lib/server/provision-free-signup.ts', import.meta.url));
    const onboardingUpsert = provisionSource.match(/\.from\(["']business_onboarding_state["']\)[\s\S]{0,260}\.upsert\(\s*\{[\s\S]{0,720}?\}\s*\)/i)?.[0] ?? '';

    expect(onboardingUpsert, 'business_onboarding_state upsert must be inspectable').toMatch(/business_onboarding_state/i);
    expect(onboardingUpsert).toMatch(/current_step\s*:\s*["']dashboard_ready["']/i);
    expect(onboardingUpsert).toMatch(/dashboard_ready_at\s*:/i);
    expect(onboardingUpsert).toMatch(/selected_plan_code\s*:\s*["']FREE["']/i);
    expect(onboardingUpsert).toMatch(/account_user_id\s*:/i);
    expect(onboardingUpsert).toMatch(/business_type\s*:/i);
    expect(onboardingUpsert).not.toMatch(/current_step\s*:\s*["']welcome_login["']/i);
  });

  it('FREE signup provision updates trusted auth metadata as onboarding complete with business identity', async () => {
    const provisionSource = await readSource(new URL('../lib/server/provision-free-signup.ts', import.meta.url));

    expect(provisionSource).toMatch(/auth\.admin\.updateUserById\s*\(\s*(?:userId|input\.userId)[\s\S]{0,900}user_metadata/i);
    expect(provisionSource).toMatch(/onboardingCompleted\s*:\s*true/i);
    expect(provisionSource).toMatch(/onboarding_completed\s*:\s*true/i);
    expect(provisionSource).toMatch(/onboarding_required\s*:\s*false/i);
    expect(provisionSource).toMatch(/business_type\s*:\s*(?:businessType|input\.businessType)/i);
    expect(provisionSource).toMatch(/tipoNegocio\s*:\s*(?:businessType|input\.businessType)/i);
    expect(provisionSource).toMatch(/business_id\s*:\s*(?:businessId|input\.businessId)/i);
    expect(provisionSource).toMatch(/business_name\s*:\s*(?:businessName|input\.businessName)/i);
    expect(provisionSource).toMatch(/business_slug\s*:\s*(?:businessSlug|input\.businessSlug)/i);
  });

  it('FREE materialization RPC/update results are checked before public HTML success UX', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);
    const markHelper = source.match(/async\s+function\s+markMaterialization[\s\S]*?^}/im)?.[0] ?? source;
    const htmlHelper = source.match(/function\s+htmlResponse[\s\S]*?^}/im)?.[0] ?? source;
    const successIndex = source.search(/return\s+htmlResponse\s*\(\s*\{\s*status\s*:\s*["']materialized["']/i);
    const finalMaterializedIndex = source.search(/complete_signup_email_materialization[\s\S]{0,220}p_status\s*:\s*["']materialized["']/i);
    const finalSlice = finalMaterializedIndex >= 0 && successIndex > finalMaterializedIndex ? source.slice(finalMaterializedIndex, successIndex) : '';

    expect(markHelper, 'markMaterialization helper must be inspectable').toMatch(/complete_signup_email_materialization/i);
    expect(markHelper, 'markMaterialization must capture RPC errors/data/count instead of fire-and-forget').toMatch(/const\s*\{[\s\S]{0,120}(?:error|data|count)[\s\S]{0,120}\}\s*=\s*await\s+supabaseAdmin\.rpc/i);
    expect(markHelper, 'failed/materialized status updates must throw or return failure when the RPC did not update one row').toMatch(/if\s*\([\s\S]{0,180}(?:materializationError|completeError|error|!\s*data|count\s*!==\s*1|!\s*updated)/i);
    expect(finalMaterializedIndex, 'final materialized RPC must run before public HTML success').toBeGreaterThan(0);
    expect(successIndex, 'public HTML success must be inspectable').toBeGreaterThan(finalMaterializedIndex);
    expect(finalSlice, 'final materialized RPC result must be checked before public success').toMatch(/const\s*\{[\s\S]{0,120}(?:error|data|count)[\s\S]{0,120}\}\s*=\s*await|if\s*\([\s\S]{0,160}(?:materializationError|completeError|error|!\s*data|count\s*!==\s*1|!\s*updated)/i);
    expect(htmlHelper, 'success UX must be an HTML response, not raw JSON').toMatch(/text\/html|<!doctype html|<main/i);
    expect(htmlHelper, 'success UX must include a login CTA for confirmed accounts').toMatch(/<a[\s\S]{0,120}href=|loginUrl|auth\/login|Ingresar|Iniciar sesi[oó]n/i);
    expect(source, 'browser-facing confirmation route must not expose raw JSON response bodies').not.toMatch(/return\s+jsonResponse\s*\(/i);
  });

  it('FREE confirm endpoint does not insert businesses', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);
    const freeSignupIndex = source.search(/purpose\s*===\s*["']paid_signup["']/i);
    const afterPaidBranch = freeSignupIndex >= 0 ? source.slice(freeSignupIndex) : source;

    expect(afterPaidBranch, 'free_signup confirm must not insert a businesses row').not.toMatch(/\.from\(["']businesses["']\)[\s\S]{0,320}\.insert\(/i);
  });

  it('soft email confirmation migration adds nullable email_confirmed_at on business_onboarding_state', async () => {
    const migrations = await readMigrationSources();
    expect(migrations).toMatch(/alter\s+table\s+(?:if\s+exists\s+)?public\.business_onboarding_state[\s\S]{0,240}add\s+column(?:\s+if\s+not\s+exists)?\s+email_confirmed_at\b/i);
  });

  it('FREE confirm endpoint keeps materialization failures generic in public responses', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);

    expect(source).toMatch(/signup_materialize_failed|confirmation_invalid_or_expired|confirmation_metadata_invalid/i);
    expect(source, 'public response bodies must not expose granular database step names such as business_create_failed').not.toMatch(/error\s*:\s*["']business_create_failed["']/i);
  });

  it('FREE duplicate, pending, and rate controls are DB-backed instead of in-memory only', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);
    const rateLimitFunction = /async\s+function\s+isRateLimited[\s\S]*?^}/m.exec(source)?.[0] ?? source;
    const beforeConfirmationInsert = sliceBefore(source, /\.from\(["']signup_email_confirmations["']\)[\s\S]{0,120}\.insert\(/);

    expect(rateLimitFunction, 'rate guard helper must be present and inspectable').toMatch(/isRateLimited/);
    expect(rateLimitFunction).toMatch(/supabase|rpc\(|signup_rate_limits|signup_request_rate_limits|rate_limit/i);
    expect(rateLimitFunction).not.toMatch(/new\s+Map|rateLimitStore\.get|rateLimitStore\.set/i);
    expect(beforeConfirmationInsert).toMatch(/signup_email_confirmations[\s\S]*(email_hmac|active|pending)|rpc\(["'](?:claim|guard|reissue)_signup/i);
  });

  it('signup endpoint does not call Mailtrap directly; only the outbox processor may deliver email', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);

    expect(source).not.toMatch(/send\.api\.mailtrap\.io|MAILTRAP_API_URL|fetch\([\s\S]{0,120}mailtrap/i);
    expect(source).toMatch(/notification_email_outbox/i);
  });

  it('confirm-email browser route returns Orvel-friendly HTML UX with a login CTA instead of raw JSON', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);

    expect(source).toMatch(/text\/html|<!doctype html|<main|login|Ingresar|Iniciar sesi[oó]n|auth\/login/i);
    expect(source, 'browser-facing confirmation route must not expose raw JSON response bodies').not.toMatch(/return\s+jsonResponse\s*\(/i);
    expect(source).toMatch(/already_materialized|materialized|email_confirmed|confirmaci[oó]n/i);
  });

  it('confirm-email browser route uses the Orvel dark/violet result-page palette, not the old generic cream/orange shell', async () => {
    const source = await readSource(CONFIRM_EMAIL_API);
    const htmlHelper = source.match(/function\s+htmlResponse[\s\S]*?^}/im)?.[0] ?? source;
    const requiredPalette = ['#0A0A0A', '#121212', '#F1F5F9', '#94A3B8', '#7C3AED', '#6D28D9', '#A78BFA'];
    const oldPalette = ['#fff7ed', '#ffedd5', '#ffffff', '#f97316', '#c2410c', '#dcfce7', '#15803d'];

    expect(htmlHelper, 'confirm-email HTML shell must be inspectable').toMatch(/function\s+htmlResponse/);
    for (const color of requiredPalette) {
      expect(htmlHelper, `confirm-email result page must include Orvel palette color ${color}`).toContain(color);
    }
    for (const color of oldPalette) {
      expect(htmlHelper, `confirm-email result page must not use old generic palette color ${color}`).not.toContain(color);
    }
    expect(htmlHelper).toMatch(/color-scheme:\s*dark|linear-gradient\(135deg,\s*var\(--brand\),\s*var\(--brand-dark\)\)/i);
  });

  it('PAID signup start requires a verified email confirmation before server-side Mercado Pago checkout creation', async () => {
    const protectSource = await readSource(PENDING_SIGNUP_PROTECT_API);
    const startSource = await readSource(SUBSCRIPTION_START_API);

    expect(protectSource).toMatch(/signup_email_confirmation|signup_email_confirmations|confirmation_intent|email_confirmation/i);
    expect(startSource).toMatch(/pending_signup_reference/i);
    expect(startSource).toMatch(/email_confirmed_at|confirmation_status|verified_at|email_confirmed|confirmed|verified/i);
    expect(startSource).not.toMatch(/create-subscription[\s\S]{0,240}pending_signup_reference[\s\S]{0,240}(?!email_confirmed|verified)/i);
  });

  it('PAID duplicate/existing/pending cases remain generic accepted responses to the browser', async () => {
    const protectSource = await readSource(PENDING_SIGNUP_PROTECT_API);
    const startSource = await readSource(SUBSCRIPTION_START_API);
    const combined = `${protectSource}\n${startSource}`;

    expect(combined).toMatch(/signup_confirmation_requested|confirmation_requested|accepted|ok\s*:\s*true/i);
    expect(combined).not.toMatch(/EMAIL_ALREADY_REGISTERED|PENDING_SIGNUP_ALREADY_EXISTS|PENDING_SIGNUP_REFERENCE_INVALID|Este email ya tiene una cuenta|Ya existe un alta paga pendiente/i);
  });

  it('FREE confirmation token TTL is 14 days', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);
    const ttlConstant = source.match(/FREE_CONFIRMATION_TTL_MS\s*=\s*([^;]+);/)?.[1] ?? '';
    const expiresAtLine = source.match(/const\s+expiresAt\s*=\s*new Date\(([\s\S]*?)\)\.toISOString\(\)/)?.[1] ?? '';

    expect(ttlConstant, 'FREE signup confirmation tokens must last 14 days so day-7 confirm still works').toMatch(/14\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(expiresAtLine, 'FREE signup must use the 14-day confirmation TTL').toMatch(/FREE_CONFIRMATION_TTL_MS/);
    expect(expiresAtLine, 'FREE signup confirmation tokens must not keep the 30-minute TTL').not.toMatch(/30\s*\*\s*60\s*\*\s*1000/);
  });

  it('PAID confirmation tokens stay at the existing 30-minute handoff TTL', async () => {
    const paidSource = await readSource(new URL('../lib/server/pending-signup-handoff.ts', import.meta.url));
    const paidConfirmationInsert = paidSource.match(/from\(['"]signup_email_confirmations['"]\)\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? '';

    expect(paidSource).toMatch(/HANDOFF_MAX_AGE_SECONDS\s*=\s*30\s*\*\s*60/);
    expect(paidConfirmationInsert, 'paid signup confirmation expires_at must keep HANDOFF_MAX_AGE_SECONDS').toMatch(/expires_at:\s*new Date\([\s\S]*HANDOFF_MAX_AGE_SECONDS/);
    expect(paidConfirmationInsert).not.toMatch(/14\s*\*\s*24/);
  });

  it('PAID protect endpoint uses the same accepted public body for fresh and duplicate/pending cases, without redirect or cookie before email proof', async () => {
    const protectSource = await readSource(PENDING_SIGNUP_PROTECT_API);
    const successSlice = protectSource.slice(protectSource.indexOf('await createPendingSignupHandoff'), protectSource.indexOf('} catch (error)'));
    const duplicateSlice = protectSource.slice(protectSource.indexOf('if (isDuplicateProtectionConflict)'), protectSource.indexOf('const status ='));

    expect(successSlice).toMatch(/jsonResponse\(PUBLIC_SIGNUP_CONFIRMATION_REQUESTED,\s*202\)/);
    expect(successSlice).not.toMatch(/pending_signup_reference|serverRedirectUrl|serverIssuedRedirect|Set-Cookie/);
    expect(duplicateSlice).toMatch(/jsonResponse\(PUBLIC_DUPLICATE_PROTECTION_CONFLICT,\s*202\)/);
    expect(duplicateSlice).not.toMatch(/pending_signup_reference|serverRedirectUrl|serverIssuedRedirect|Set-Cookie|error\s*:/);
  });
});
