import { expect, test } from '@playwright/test';

const SCRAPE_TSV = [
  'Title\tComplete address\tPhone\tWebsite\tAverage rating\tReviews count\tCategory',
  'Peluquería Norte\tMitre 100, San Carlos de Bariloche, Río Negro, Argentina\t+54 9 294 412-3390\thttps://example.com\t4.5\t120\tPeluquería',
  'Estética Bianco\tAv. Bustillo 4200, San Carlos de Bariloche, Río Negro, Argentina\t0294 15 455-7712\t\t4.2\t80\tEstética',
  'Salon Providencia\tProvidencia 123, Santiago, Chile\t+56 9 8765 4321\t\t4.8\t200\tPeluquería'
].join('\n');

test('imports Argentine Instant Data Scraper rows into the pipeline', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('orvel-ops.v1');
  });

  await page.goto('/importar');
  await expect(page.getByRole('heading', { name: 'Importar' })).toBeVisible();

  await page.locator('textarea').fill(SCRAPE_TSV);
  await page.getByRole('button', { name: 'Vista previa' }).click();

  await expect(page.getByText('fuera de AR', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirmar importación \(2\)/ })).toBeVisible();

  await page.getByRole('button', { name: /Confirmar importación \(2\)/ }).click();
  await expect(page.getByText(/2 importados/)).toBeVisible();

  await page.getByRole('link', { name: 'Pipeline' }).click();
  await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();
  await expect(page.getByText('Peluquería Norte')).toBeVisible();
  await expect(page.getByText('Estética Bianco')).toBeVisible();
  await expect(page.getByText('Salon Providencia')).toHaveCount(0);
});
