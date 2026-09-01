import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Contract: landing pricing and signup navigation hotfix', () => {
  it('renders FREE in home pricing instead of filtering it out', () => {
    const pricing = source('src/components/organisms/Pricing.astro');
    const lanzamiento = source('src/pages/lanzamiento.astro');
    const planCard = source('src/components/molecules/PlanCard.astro');

    expect(pricing).toContain('plansWithBilling.map');
    expect(pricing).not.toMatch(/filter\s*\([^)]*code\s*!==\s*['"]FREE['"]/);
    expect(planCard).toContain("case 'FREE': return 'Empezar gratis'");
    expect(planCard).toContain("{isFree && \"Que entren y usen el producto.\"}");
    expect(lanzamiento).not.toMatch(/planCode\s*===\s*['"]FREE['"][\s\S]{0,240}classList\.add\(['"]hidden['"]\)/);
  });

  it('shows an accessible login back link to home', () => {
    const login = source('src/pages/auth/login.astro');

    expect(login).toMatch(/<a[^>]+href=["']\/["'][^>]*>[\s\S]*Volver al inicio[\s\S]*<\/a>/i);
    expect(login).toMatch(/aria-label=["']Volver al inicio["']/i);
  });

  it('uses deterministic signup back anchors and never javascript history navigation', () => {
    const signupPlan = source('src/pages/auth/signup/plan.astro');
    const signupCredentials = source('src/pages/auth/signup/account.astro');
    const combined = `${signupPlan}\n${signupCredentials}`;

    expect(combined).not.toMatch(/javascript:history\.back\(|history\.back\(|window\.history\.back\(/);
    expect(signupPlan).toMatch(/<a[^>]+href=["']\/["'][^>]*>[\s\S]*(Volver al inicio|Inicio)[\s\S]*<\/a>/i);
    expect(signupCredentials).toMatch(/<a[^>]+id=["']backLink["'][^>]+href=["']\/auth\/signup\/plan["'][^>]*>/i);
  });

  it('signup back flow eventually reaches home instead of looping credentials and plan', () => {
    const signupPlan = source('src/pages/auth/signup/plan.astro');
    const signupCredentials = source('src/pages/auth/signup/account.astro');

    expect(signupCredentials).toMatch(/id=["']backLink["'][^>]+href=["']\/auth\/signup\/plan["']/i);
    expect(signupPlan).toMatch(/href=["']\/["']/);
    expect(signupPlan).not.toMatch(/href=["']\/auth\/signup\/credentials/);
  });
});
