import { expect, test, type Page } from '@playwright/test';

const SCRAPE_TSV = [
  'Title\tComplete address\tPhone\tWebsite\tAverage rating\tReviews count\tCategory',
  'Peluquería Norte\tMitre 100, San Carlos de Bariloche, Río Negro, Argentina\t+54 9 294 412-3390\thttps://example.com\t4.5\t120\tPeluquería',
  'Estética Bianco\tAv. Bustillo 4200, San Carlos de Bariloche, Río Negro, Argentina\t0294 15 455-7712\t\t4.2\t80\tEstética',
  'Salon Providencia\tProvidencia 123, Santiago, Chile\t+56 9 8765 4321\t\t4.8\t200\tPeluquería'
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const flag = '__ops_e2e_cleared';
    if (!sessionStorage.getItem(flag)) {
      window.localStorage.removeItem('orvel-ops.v1');
      sessionStorage.setItem(flag, '1');
    }
  });
});

async function importArgentineLeads(page: Page) {
  await page.goto('/importar');
  await page.locator('textarea').fill(SCRAPE_TSV);
  await page.getByRole('button', { name: 'Vista previa' }).click();
  await page.getByRole('button', { name: /Confirmar importación \(2\)/ }).click();
  await expect(page.getByText(/2 importados/)).toBeVisible();
}

test('navigates the four ops screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Orvel Ops')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();

  await page.getByRole('link', { name: 'Contactos' }).click();
  await expect(page.getByRole('heading', { name: 'Contactos' })).toBeVisible();

  await page.getByRole('link', { name: 'Mensajes' }).click();
  await expect(page.getByRole('heading', { name: 'Mensajes' })).toBeVisible();
  await expect(page.locator('.tmpl-card .name', { hasText: 'Primer contacto' })).toBeVisible();
  await expect(page.locator('.tmpl-card .name', { hasText: 'Seguimiento' })).toBeVisible();
  await expect(page.locator('.tmpl-card .name', { hasText: 'Cierre' })).toBeVisible();

  await page.getByRole('link', { name: 'Importar' }).click();
  await expect(page.getByRole('heading', { name: 'Importar' })).toBeVisible();
});

test('creates and deletes a message template', async ({ page }) => {
  await page.goto('/mensajes');
  await page.getByRole('button', { name: '+ Nueva plantilla' }).click();
  await page.getByRole('heading', { name: 'Nueva plantilla' }).waitFor();
  await page.locator('.modal input.field-input').first().fill('Recordatorio');
  await page.getByRole('button', { name: 'Insertar {nombre}' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Plantilla guardada')).toBeVisible();
  await expect(page.locator('.tmpl-card', { hasText: 'Recordatorio' })).toBeVisible();
  await expect(page.locator('.tmpl-card', { hasText: 'Recordatorio' }).locator('.tmpl-text')).toHaveText('{nombre}');

  await page.locator('.tmpl-card', { hasText: 'Recordatorio' }).getByRole('button', { name: 'Borrar' }).click();
  await expect(page.getByText('Plantilla borrada')).toBeVisible();
  await expect(page.locator('.tmpl-card', { hasText: 'Recordatorio' })).toHaveCount(0);
});

test('imports Argentine rows, drops Chile, and persists after reload', async ({ page }) => {
  await importArgentineLeads(page);

  await page.getByRole('link', { name: 'Pipeline' }).click();
  await expect(page.getByText('Peluquería Norte')).toBeVisible();
  await expect(page.getByText('Estética Bianco')).toBeVisible();
  await expect(page.getByText('Salon Providencia')).toHaveCount(0);
  await expect(page.locator('.stat-card', { hasText: 'Contactos' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.locator('.stat-card', { hasText: 'Nuevos' }).getByText('2', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();
  await expect(page.getByText('Peluquería Norte')).toBeVisible();
  await expect(page.getByText('Estética Bianco')).toBeVisible();
});

test('sends WhatsApp from the pipeline and moves nuevo to contactado', async ({ page }) => {
  await importArgentineLeads(page);
  await page.getByRole('link', { name: 'Pipeline' }).click();

  const card = page.locator('.lead-card', { hasText: 'Peluquería Norte' });
  const popupPromise = page.waitForEvent('popup');
  await card.getByRole('button', { name: 'Enviar' }).click();
  const popup = await popupPromise;
  expect(popup.url()).toContain('5492944123390');
  expect(popup.url()).toMatch(/text=|text\+/);
  await popup.close();

  await expect(page.getByText('WhatsApp abierto — estado actualizado')).toBeVisible();
  const contactado = page.locator('.kanban-col', { hasText: 'Contactado' });
  await expect(contactado.getByText('Peluquería Norte')).toBeVisible();
});

test('filters, edits and deletes a contact', async ({ page }) => {
  await importArgentineLeads(page);
  await page.getByRole('link', { name: 'Contactos' }).click();
  await expect(page.getByText('Peluquería Norte')).toBeVisible();
  await expect(page.getByText('Estética Bianco')).toBeVisible();

  await page.getByPlaceholder('Buscar por nombre o ciudad…').fill('Norte');
  await expect(page.getByText('Peluquería Norte')).toBeVisible();
  await expect(page.getByText('Estética Bianco')).toHaveCount(0);

  await page.getByRole('button', { name: 'Editar' }).click();
  await page.locator('.modal input.field-input').first().fill('Peluquería Norte Centro');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Contacto guardado')).toBeVisible();
  await page.getByPlaceholder('Buscar por nombre o ciudad…').fill('');
  await expect(page.getByText('Peluquería Norte Centro')).toBeVisible();

  await page.locator('.contact-row', { hasText: 'Estética Bianco' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Contacto eliminado')).toBeVisible();
  await expect(page.getByText('Estética Bianco')).toHaveCount(0);
});
