import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readServiciosSources(): { pageTs: string; pageHtml: string; merged: string } {
  const pageTsPath = resolve(process.cwd(), 'src/app/pages/dashboard/servicios/servicios.page.ts');
  const pageHtmlPath = resolve(process.cwd(), 'src/app/pages/dashboard/servicios/servicios.page.html');

  const pageTs = existsSync(pageTsPath) ? readFileSync(pageTsPath, 'utf-8') : '';
  const pageHtml = existsSync(pageHtmlPath) ? readFileSync(pageHtmlPath, 'utf-8') : '';

  return {
    pageTs,
    pageHtml,
    merged: `${pageTs}\n${pageHtml}`
  };
}

describe('C3 - Servicios submit/create validation integration RED contract', () => {
  it('blocks category create persistence when validation contract fails', () => {
    const { pageTs } = readServiciosSources();

    expect(pageTs).toMatch(/import\s*\{\s*validateCreateCategory\s*,\s*validateCreateServicio\s*\}\s*from\s*['"]\.\/servicios\.validation['"]/);
    expect(pageTs).toMatch(/const\s+validation\s*=\s*validateCreateCategory\(\s*this\.categoryForm\.getRawValue\(\)\s*\)/);
    expect(pageTs).toMatch(/if\s*\(!validation\.isValid\)\s*\{[\s\S]*markAllAsTouched\([\s\S]*return\s*;[\s\S]*\}/);

    const validationIndex = pageTs.indexOf('validateCreateCategory(');
    const createIndex = pageTs.indexOf('servicioService.createCategoria(');
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeLessThan(createIndex);
  });

  it('blocks service create persistence when validation contract fails', () => {
    const { pageTs } = readServiciosSources();

    expect(pageTs).toMatch(/const\s+validation\s*=\s*validateCreateServicio\(\s*this\.servicioForm\.getRawValue\(\)\s*\)/);
    expect(pageTs).toMatch(/if\s*\(!validation\.isValid\)\s*\{[\s\S]*markAllAsTouched\([\s\S]*return\s*;[\s\S]*\}/);

    const validationIndex = pageTs.indexOf('validateCreateServicio(');
    const createIndex = pageTs.indexOf('servicioService.create(');
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeLessThan(createIndex);
  });

  it('exposes field-level errors for category and service forms in TS+HTML', () => {
    const { pageTs, pageHtml } = readServiciosSources();

    expect(pageTs).toMatch(/categoryFieldErrors\s*=\s*signal<Record<string,\s*string>>\(\{\}\)/);
    expect(pageTs).toMatch(/serviceFieldErrors\s*=\s*signal<Record<string,\s*string>>\(\{\}\)/);
    expect(pageTs).toMatch(/this\.categoryFieldErrors\.set\(validation\.fieldErrors\)/);
    expect(pageTs).toMatch(/this\.serviceFieldErrors\.set\(validation\.fieldErrors\)/);

    expect(pageHtml).toMatch(/categoryFieldErrors\(\)\./);
    expect(pageHtml).toMatch(/serviceFieldErrors\(\)\./);
    expect(pageHtml).toMatch(/data-testid="category-field-error-/);
    expect(pageHtml).toMatch(/data-testid="service-field-error-/);
  });

  it('keeps deterministic UX contract for invalid submit feedback', () => {
    const { merged } = readServiciosSources();

    expect(merged).toMatch(/Formulario inválido/i);
    expect(merged).toMatch(/onCreateCategory\(\)/);
    expect(merged).toMatch(/onSaveServicio\(\)/);
    expect(merged).toMatch(/field-error-/i);
  });
});
