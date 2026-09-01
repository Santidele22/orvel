import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageTs = readFileSync(new URL('./public-booking.page.ts', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('./public-booking.page.html', import.meta.url), 'utf8');

describe('Public booking professional picker', () => {
  it('hides the picker unless allowClientProfessionalSelection is on', () => {
    expect(pageHtml).toMatch(/data-testid=["']public-professional-picker["']/);
    expect(pageHtml).toMatch(/@if\s*\(canShowProfessionalStep\(\)\)[\s\S]{0,240}data-testid=["']public-professional-picker["']/);
    expect(pageTs).toMatch(/allowClientProfessionalSelection/);
    expect(pageTs).toMatch(/list_public_professionals_for_service|listPublicProfessionalsForService/);
  });

  it('defaults to no preference and only submits a specific professionalId', () => {
    expect(pageHtml).toMatch(/Cualquier profesional/);
    expect(pageTs).toMatch(/professionalId/);
    expect(pageHtml).toMatch(/Te atiende/);
  });

  it('locks a dedicated professional turnero from the route slug', () => {
    expect(pageTs).toMatch(/professionalSlug/);
    expect(pageTs).toMatch(/resolvePublicProfessional/);
    expect(pageTs).toMatch(/lockedProfessionalSlug/);
  });

  it('gates later booking steps until the previous step is complete', () => {
    expect(pageTs).toMatch(/canShowProfessionalStep/);
    expect(pageTs).toMatch(/canShowScheduleStep/);
    expect(pageTs).toMatch(/canShowContactStep/);
    expect(pageTs).toMatch(/professionalChoiceMade/);
    expect(pageHtml).toMatch(/canShowScheduleStep\(\)/);
    expect(pageHtml).toMatch(/canShowContactStep\(\)/);
  });
});
