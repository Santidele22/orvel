import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageTs = readFileSync(new URL('./turno-form.page.ts', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('./turno-form.page.html', import.meta.url), 'utf8');

describe('turno form mobile create', () => {
  it('does not query admin slots until a service is selected', () => {
    expect(pageTs).toMatch(/if\s*\(\s*!this\.servicioId\(\)\s*\)/);
    expect(pageTs).toMatch(/Elegí un servicio para ver horarios/);
  });

  it('sends local dateIso and resolved businessId to availability', () => {
    expect(pageTs).toMatch(/dateIso:\s*this\.fecha\(\)/);
    expect(pageTs).toMatch(/businessId/);
    expect(pageTs).not.toMatch(/fecha = signal<string>\(new Date\(\)\.toISOString\(\)/);
  });

  it('matches the Nuevo Cliente modal field chrome', () => {
    expect(pageHtml).toContain('Formulario');
    expect(pageHtml).toContain('rounded-xl border border-white/10 bg-[#182033]');
    expect(pageHtml).toContain('h-11 rounded-xl bg-primary');
  });

  it('uses a centered cliente-style modal sheet instead of a full-viewport sheet', () => {
    expect(pageHtml).toMatch(
      /data-testid=["']turno-admin-new-modal-overlay["'][\s\S]{0,220}items-center justify-center/
    );
    expect(pageHtml).toMatch(
      /data-testid=["']turno-admin-new-modal["'][\s\S]{0,280}(?:max-w-lg|rounded-3xl|bg-\[#121827\])/
    );
    expect(pageHtml).not.toContain('h-[100dvh]');
  });

  it('exposes tappable slot chips for phone while keeping the select contract', () => {
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-available-slot-select["']/);
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-available-slot-chips["']/);
  });
});
