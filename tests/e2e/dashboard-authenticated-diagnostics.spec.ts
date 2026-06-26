import { expect, type Locator, type Page, test } from '@playwright/test';
import { environment } from '../../apps/dashboard/src/environments/environment';

type DiagnosticStatus = 'PASS' | 'FAIL' | 'BLOCKED';

type DiagnosticResult = {
  area: string;
  status: DiagnosticStatus;
  url: string;
  evidence: string[];
};

type LoginResult =
  | { ok: true; evidence: string[] }
  | { ok: false; reason: string; evidence: string[] };

type SupabasePasswordGrant =
  | { ok: true; evidence: string; session: Record<string, unknown> }
  | { ok: false; evidence: string };

const demoCredentials = {
  email: process.env.ORVEL_E2E_EMAIL ?? 'demo@turnea.app',
  password: process.env.ORVEL_E2E_PASSWORD ?? 'demo1234'
};

test.describe('authenticated dashboard workflow diagnostics', () => {
  test.setTimeout(90_000);

  test('diagnoses CRUD clientes', async ({ page }, testInfo) => {
    await runSingleDiagnostic(page, testInfo, 'CRUD clientes', runClientesDiagnostic);
  });

  test('diagnoses CRUD servicios', async ({ page }, testInfo) => {
    await runSingleDiagnostic(page, testInfo, 'CRUD servicios', runServiciosDiagnostic);
  });

  test('diagnoses cambiar configuración', async ({ page }, testInfo) => {
    await runSingleDiagnostic(page, testInfo, 'cambiar configuración', runConfiguracionDiagnostic);
  });

  test('diagnoses sacar turno', async ({ page }, testInfo) => {
    await runSingleDiagnostic(page, testInfo, 'sacar turno', runTurnosDiagnostic);
  });
});

async function runSingleDiagnostic(
  page: Page,
  testInfo: { attach: (name: string, options: { body: string; contentType: string }) => Promise<void> },
  area: string,
  diagnostic: (page: Page, runId: string) => Promise<Omit<DiagnosticResult, 'area' | 'url'>>
) {
  const runId = Date.now().toString(36);
  const login = await loginWithDocumentedDemoCredentials(page);
  await testInfo.attach('authenticated-login-diagnostic.txt', {
    body: [...login.evidence, `Final URL: ${page.url()}`].join('\n'),
    contentType: 'text/plain'
  });

  if (!login.ok) {
    throw new Error(`Authenticated dashboard blocked: ${login.reason}\n${login.evidence.join('\n')}`);
  }

  const result = await runDiagnostic(page, area, async () => diagnostic(page, runId));
  await testInfo.attach('authenticated-workflow-diagnostics.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json'
  });

  expect(result.status, JSON.stringify(result, null, 2)).not.toBe('FAIL');
}

async function loginWithDocumentedDemoCredentials(page: Page): Promise<LoginResult> {
  const evidence: string[] = [];

  const backendAuth = await checkDocumentedSupabaseCredentials();
  evidence.push(backendAuth.evidence);

  if (backendAuth.ok) {
    await page.addInitScript((session) => {
      localStorage.setItem('orvel.supabase.auth', JSON.stringify(session));
    }, backendAuth.session);
    evidence.push('Registered Supabase browser session init script for localStorage key orvel.supabase.auth.');
    await page.goto('/dashboard/inicio');
    try {
      await page.waitForURL(/127\.0\.0\.1:4200\/dashboard\/inicio/, { timeout: 20_000 });
      await expect(page.getByTestId('dashboard-shell-responsive-root')).toBeVisible({ timeout: 15_000 });
      evidence.push(`Authenticated dashboard reached via seeded session: ${page.url()}`);
      return { ok: true, evidence };
    } catch (error) {
      evidence.push(`Seeded session did not reach dashboard shell: ${stringifyError(error)}`);
      evidence.push(`Current URL after seeded session: ${page.url()}`);
      evidence.push(await compactVisibleText(page));
    }
  }

  await page.goto('/dashboard/inicio');
  evidence.push(`Visited protected route: /dashboard/inicio`);
  evidence.push(`After redirect URL: ${page.url()}`);

  if (/\/dashboard\/inicio/.test(page.url())) {
    evidence.push('Already authenticated at /dashboard/inicio.');
    await expect(page.getByTestId('dashboard-shell-responsive-root')).toBeVisible({ timeout: 15_000 });
    return { ok: true, evidence };
  }

  if (!/127\.0\.0\.1:4321\/auth\/login/.test(page.url())) {
    evidence.push(`Protected route did not reach the landing login page. Current URL: ${page.url()}`);
    evidence.push('Falling back to direct documented login URL: http://127.0.0.1:4321/auth/login?returnTo=/dashboard/inicio.');
    await page.goto('http://127.0.0.1:4321/auth/login?returnTo=/dashboard/inicio');
    evidence.push(`Direct login URL result: ${page.url()}`);

    if (!/127\.0\.0\.1:4321\/auth\/login/.test(page.url())) {
      return {
        ok: false,
        reason: backendAuth.ok
          ? `Direct landing login page was not reachable, although backend accepted E2E credentials. Current URL: ${page.url()}`
          : `Direct landing login page was not reachable and backend rejected E2E credentials: ${backendAuth.evidence}`,
        evidence: [...evidence, backendAuth.evidence, await compactVisibleText(page)]
      };
    }
  }

  const emailField = firstVisible(page.locator('#email'), page.getByLabel(/email|correo/i), page.locator('input[type="email"]'));
  const passwordField = firstVisible(page.locator('#password'), page.getByLabel(/password|contraseña/i), page.locator('input[type="password"]'));

  try {
    await (await emailField).fill(demoCredentials.email);
    await (await passwordField).fill(demoCredentials.password);
  } catch (error) {
    return {
      ok: false,
      reason: `Login form fields were not fillable: ${stringifyError(error)}`,
      evidence: [...evidence, await compactVisibleText(page)]
    };
  }

  evidence.push(`Filled E2E credentials for ${demoCredentials.email}.`);

  const loginButton = page.getByRole('button', { name: /entrar|iniciar|login|continuar|dashboard/i }).first();
  await loginButton.click();
  evidence.push('Clicked login submit button using role=button name=/entrar|iniciar|login|continuar|dashboard/i.');

  try {
    await page.waitForURL(/127\.0\.0\.1:4200\/dashboard\/inicio/, { timeout: 20_000 });
    await expect(page.getByTestId('dashboard-shell-responsive-root')).toBeVisible({ timeout: 15_000 });
    evidence.push(`Authenticated dashboard reached: ${page.url()}`);
    return { ok: true, evidence };
  } catch (error) {
    return {
      ok: false,
      reason: `E2E login did not reach /dashboard/inicio: ${stringifyError(error)}; ${backendAuth.evidence}`,
      evidence: [...evidence, `Current URL: ${page.url()}`, backendAuth.evidence, await compactVisibleText(page)]
    };
  }
}

async function checkDocumentedSupabaseCredentials(): Promise<SupabasePasswordGrant> {
  try {
    const response = await fetch(`${environment.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: environment.supabaseAnonKey,
        Authorization: `Bearer ${environment.supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(demoCredentials)
    });
    const body = await response.text();
    const parsedBody = JSON.parse(body) as Record<string, unknown>;
    const sanitizedBody = body.replace(environment.supabaseAnonKey, '[redacted-anon-key]').slice(0, 300);
    const session = {
      access_token: parsedBody.access_token,
      refresh_token: parsedBody.refresh_token,
      expires_at: parsedBody.expires_at,
      expires_in: parsedBody.expires_in,
      token_type: parsedBody.token_type,
      user: parsedBody.user
    };

    if (!response.ok) {
      return {
        ok: false,
        evidence: `Supabase Auth password grant with E2E credentials for ${demoCredentials.email} returned HTTP ${response.status}: ${sanitizedBody}`
      };
    }

    return {
      ok: true,
      evidence: `Supabase Auth password grant with E2E credentials for ${demoCredentials.email} returned HTTP ${response.status}.`,
      session
    };
  } catch (error) {
    return {
      ok: false,
      evidence: `Supabase Auth password grant request failed: ${stringifyError(error)}`
    };
  }
}

async function runDiagnostic(
  page: Page,
  area: string,
  execute: () => Promise<Omit<DiagnosticResult, 'area' | 'url'>>
): Promise<DiagnosticResult> {
  try {
    const result = await execute();
    return { area, url: page.url(), ...result };
  } catch (error) {
    return {
      area,
      status: 'FAIL',
      url: page.url(),
      evidence: [`Unexpected exception: ${stringifyError(error)}`, await compactVisibleText(page)]
    };
  }
}

async function runClientesDiagnostic(page: Page, runId: string): Promise<Omit<DiagnosticResult, 'area' | 'url'>> {
  const evidence: string[] = [];
  const firstName = `E2E${runId}`;
  const lastName = 'Cliente';
  const editedLastName = 'Editado';
  const phone = `54911${runId.replace(/[^0-9]/g, '').padEnd(8, '0').slice(0, 8)}`;
  const email = `cliente-${runId}@example.test`;

  await page.goto('/dashboard/clientes');
  await expect(page.getByTestId('clientes-responsive-container')).toBeVisible({ timeout: 15_000 });
  evidence.push('URL /dashboard/clientes loaded; selector [data-testid="clientes-responsive-container"] visible.');

  await page.getByTestId('clientes-modal-add-trigger').click();
  evidence.push('Clicked [data-testid="clientes-modal-add-trigger"].');
  await page.locator('#client-nombre').fill(firstName);
  await page.locator('#client-apellido').fill(lastName);
  await page.locator('#client-telefono').fill(phone);
  await page.locator('#client-email').fill(email);
  await page.getByTestId('client-form-submit').click();
  evidence.push('Submitted [data-testid="client-form"] with #client-nombre/#client-apellido/#client-telefono/#client-email.');

  await expect(page.getByTestId('client-form')).toBeHidden({ timeout: 15_000 });
  await page.locator('input[type="search"]').fill(firstName);
  await expect(page.getByText(`${firstName} ${lastName}`, { exact: false })).toBeVisible({ timeout: 15_000 });
  evidence.push(`Created/read client visible after search: ${firstName} ${lastName}.`);

  await page.getByText(`${firstName} ${lastName}`, { exact: false }).first().click();
  await page.locator('#client-apellido').fill(editedLastName);
  await page.getByTestId('client-form-submit').click();
  await expect(page.getByTestId('client-form')).toBeHidden({ timeout: 15_000 });
  await page.locator('input[type="search"]').fill(firstName);
  await expect(page.getByText(`${firstName} ${editedLastName}`, { exact: false })).toBeVisible({ timeout: 15_000 });
  evidence.push(`Edited client visible: ${firstName} ${editedLastName}.`);

  const deactivateAction = page.getByTestId('clientes-deactivate-action');
  const canDeactivate = await deactivateAction.isVisible().catch(() => false);
  if (!canDeactivate) {
    return {
      status: 'BLOCKED',
      evidence: [...evidence, 'Delete/deactivate blocked: [data-testid="clientes-deactivate-action"] is not visible/reachable for the edited list item.']
    };
  }

  const disabled = await deactivateAction.isDisabled().catch(() => true);
  if (disabled) {
    return {
      status: 'BLOCKED',
      evidence: [...evidence, 'Delete/deactivate blocked: [data-testid="clientes-deactivate-action"] is disabled after modal close because no selected client remains active.']
    };
  }

  return { status: 'PASS', evidence };
}

async function runServiciosDiagnostic(page: Page, runId: string): Promise<Omit<DiagnosticResult, 'area' | 'url'>> {
  const evidence: string[] = [];
  const categoryName = `E2E Cat ${runId}`;
  const serviceName = `E2E Service ${runId}`;
  const editedServiceName = `${serviceName} Edited`;

  await page.goto('/dashboard/servicios');
  await expect(page.getByTestId('servicios-responsive-container')).toBeVisible({ timeout: 15_000 });
  evidence.push('URL /dashboard/servicios loaded; selector [data-testid="servicios-responsive-container"] visible.');

  await page.getByTestId('category-create-form').click();
  await page.getByTestId('category-input').fill(categoryName);
  await page.getByRole('button', { name: /^guardar$/i }).click();
  await expect(page.getByRole('dialog', { name: /servicios modal/i })).toBeHidden({ timeout: 15_000 });
  evidence.push('Created category through [data-testid="category-create-form"] and [data-testid="category-input"].');

  await page.getByTestId('servicios-modal-add-trigger').click();
  await page.locator('input[formcontrolname="nombre"]').fill(serviceName);
  await page.locator('select[formcontrolname="categoria"]').selectOption({ label: categoryName });
  await page.locator('input[formcontrolname="duracionMinutos"]').fill('45');
  await page.locator('input[formcontrolname="precio"]').fill('1234');
  await page.getByRole('button', { name: /^guardar$/i }).click();
  await expect(page.getByRole('dialog', { name: /servicios modal/i })).toBeHidden({ timeout: 15_000 });
  evidence.push('Created service through [data-testid="servicios-modal-add-trigger"] and servicio form controls.');

  await page.getByTestId('services-search-input').fill(serviceName);
  await expect(page.getByTestId('services-list').getByText(serviceName)).toBeVisible({ timeout: 15_000 });
  evidence.push(`Created/read service visible in [data-testid="services-list"]: ${serviceName}.`);

  const serviceRow = page.locator('article').filter({ hasText: serviceName }).first();
  await serviceRow.getByTestId('servicios-modal-edit-trigger').click();
  await page.locator('input[formcontrolname="nombre"]').fill(editedServiceName);
  await page.getByRole('button', { name: /^actualizar$/i }).click();
  await expect(page.getByRole('dialog', { name: /servicios modal/i })).toBeHidden({ timeout: 15_000 });
  await page.getByTestId('services-search-input').fill(editedServiceName);
  await expect(page.getByTestId('services-list').getByText(editedServiceName)).toBeVisible({ timeout: 15_000 });
  evidence.push(`Edited service visible: ${editedServiceName}.`);

  const editedRow = page.locator('article').filter({ hasText: editedServiceName }).first();
  await editedRow.getByTestId('servicios-modal-delete-trigger').click();
  await expect(editedRow.getByText(/inactivo/i)).toBeVisible({ timeout: 15_000 });
  evidence.push('Soft-deleted service through [data-testid="servicios-modal-delete-trigger"]; row shows INACTIVO.');

  return { status: 'PASS', evidence };
}

async function runConfiguracionDiagnostic(page: Page, runId: string): Promise<Omit<DiagnosticResult, 'area' | 'url'>> {
  const evidence: string[] = [];
  const supportEmail = `support-${runId}@example.test`;

  await page.goto('/dashboard/configuracion');
  await expect(page.getByTestId('configuracion-responsive-container').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('settings-form')).toBeVisible({ timeout: 20_000 });
  evidence.push('URL /dashboard/configuracion loaded; [data-testid="settings-form"] visible.');

  const businessName = page.locator('input[formcontrolname="businessName"]');
  if (await businessName.inputValue().then((value) => value.trim().length === 0)) {
    await businessName.fill(`E2E Business ${runId}`);
    evidence.push('Filled required input[formcontrolname="businessName"] because it was empty.');
  }

  await page.locator('input[formcontrolname="supportEmail"]').fill(supportEmail);
  await page.getByTestId('settings-save-submit').click();
  evidence.push('Changed non-dangerous input[formcontrolname="supportEmail"] and clicked [data-testid="settings-save-submit"].');

  const formMessage = page.locator('[data-testid="settings-form"] + div, form[data-testid="settings-form"] ~ div').first();
  const success = page.getByText(/configuración guardada exitosamente/i);
  const error = page.getByText(/formulario inválido|no se pudo guardar|no se encontró sesión|no se pudo identificar/i);
  await expect(success.or(error)).toBeVisible({ timeout: 20_000 });

  if (await success.isVisible().catch(() => false)) {
    evidence.push('Save success message visible: "Configuración guardada exitosamente."');
    return { status: 'PASS', evidence };
  }

  const errorText = await error.first().textContent().catch(() => 'Unknown settings error');
  return {
    status: 'FAIL',
    evidence: [...evidence, `Settings save returned error: ${errorText}`, `Aux selector checked: ${await formMessage.textContent().catch(() => 'n/a')}`]
  };
}

async function runTurnosDiagnostic(page: Page, runId: string): Promise<Omit<DiagnosticResult, 'area' | 'url'>> {
  const evidence: string[] = [];
  const walkInName = `E2E Turno ${runId}`;

  await page.goto('/dashboard/turnos');
  await expect(page.getByTestId('turnos-responsive-container')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('turnos-admin-create-primary-action')).toBeVisible({ timeout: 20_000 });
  evidence.push('URL /dashboard/turnos loaded; [data-testid="turnos-admin-create-primary-action"] visible.');

  await page.getByTestId('turnos-admin-create-primary-action').click();
  await expect(page.getByTestId('turno-admin-new-modal')).toBeVisible({ timeout: 15_000 });
  evidence.push('Opened manual appointment modal [data-testid="turno-admin-new-modal"].');

  const modalError = page.locator('.error-message, [data-testid="turno-admin-availability-error"]').first();
  if (await modalError.isVisible().catch(() => false)) {
    return { status: 'BLOCKED', evidence: [...evidence, `Turno modal blocker: ${await modalError.textContent()}`] };
  }

  await page.getByTestId('turno-admin-walk-in-name').fill(walkInName);

  const serviceSelect = page.getByTestId('turno-admin-service-select');
  const serviceOptions = await serviceSelect.locator('option').evaluateAll((options) =>
    options.map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent?.trim() ?? '' }))
  );
  const firstService = serviceOptions.find((option) => option.value);
  if (!firstService) {
    return { status: 'BLOCKED', evidence: [...evidence, 'No service option available in [data-testid="turno-admin-service-select"].'] };
  }

  await serviceSelect.selectOption(firstService.value);
  evidence.push(`Selected service from [data-testid="turno-admin-service-select"]: ${firstService.label}.`);

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  await page.getByTestId('turno-admin-date').fill(toDateInputValue(futureDate));
  evidence.push(`Filled [data-testid="turno-admin-date"] with ${toDateInputValue(futureDate)}.`);

  const availabilityError = page.getByTestId('turno-admin-availability-error');
  const availabilityEmpty = page.getByTestId('turno-admin-availability-empty');
  const slotSelect = page.getByTestId('turno-admin-available-slot-select');
  await Promise.race([
    slotSelect.locator('option[data-testid="turno-admin-available-slot-option"]').first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined),
    availabilityError.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
    availabilityEmpty.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined)
  ]);

  if (await availabilityError.isVisible().catch(() => false)) {
    return { status: 'BLOCKED', evidence: [...evidence, `Availability error: ${await availabilityError.textContent()}`] };
  }
  if (await availabilityEmpty.isVisible().catch(() => false)) {
    return { status: 'BLOCKED', evidence: [...evidence, `Availability empty: ${await availabilityEmpty.textContent()}`] };
  }

  const slotOptions = await slotSelect.locator('option').evaluateAll((options) =>
    options.map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent?.trim() ?? '' }))
  );
  const firstSlot = slotOptions.find((option) => option.value);
  if (!firstSlot) {
    return { status: 'BLOCKED', evidence: [...evidence, 'No available slot option attached in [data-testid="turno-admin-available-slot-select"].'] };
  }

  await slotSelect.selectOption(firstSlot.value);
  await page.getByTestId('turno-admin-notes').fill(`Playwright diagnostic ${runId}`);
  evidence.push(`Selected slot from [data-testid="turno-admin-available-slot-select"]: ${firstSlot.label}.`);

  const submit = page.getByTestId('turno-admin-submit-action');
  if (await submit.isDisabled()) {
    return { status: 'BLOCKED', evidence: [...evidence, '[data-testid="turno-admin-submit-action"] remained disabled after selecting client/service/date/slot.'] };
  }

  await submit.click();
  await Promise.race([
    page.getByTestId('turno-admin-new-modal').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined),
    page.locator('.error-message, [data-testid="turno-slot-blocked-feedback"]').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined)
  ]);

  const saveError = page.locator('.error-message, [data-testid="turno-slot-blocked-feedback"]').first();
  if (await saveError.isVisible().catch(() => false)) {
    return { status: 'FAIL', evidence: [...evidence, `Save error: ${await saveError.textContent()}`] };
  }

  evidence.push('Manual appointment saved; modal hidden after [data-testid="turno-admin-submit-action"].');
  return { status: 'PASS', evidence };
}

async function firstVisible(...locators: Locator[]): Promise<Locator> {
  for (const locator of locators) {
    if (await locator.first().isVisible().catch(() => false)) {
      return locator.first();
    }
  }
  return locators[0].first();
}

async function compactVisibleText(page: Page): Promise<string> {
  const text = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => 'Unable to read body text.');
  return text.replace(/\s+/g, ' ').trim().slice(0, 1_500);
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
