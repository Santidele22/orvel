import { describe, expect, it } from 'vitest';
import { interpolateTemplate, whatsappUrl } from '../message-template';

describe('interpolateTemplate', () => {
  it('replaces nombre and ciudad placeholders', () => {
    const body =
      'Hola {nombre}! Vi que están en {ciudad} y quería contarte cómo funciona.';
    expect(interpolateTemplate(body, { nombre: 'Estética Bianco', ciudad: 'Bariloche' })).toBe(
      'Hola Estética Bianco! Vi que están en Bariloche y quería contarte cómo funciona.'
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolateTemplate('link {link}', { nombre: 'A', ciudad: 'B' })).toBe('link {link}');
  });
});

describe('whatsappUrl', () => {
  it('builds a wa.me link with encoded text', () => {
    const url = whatsappUrl('5492944557712', 'Hola Bianco!');
    expect(url).toBe('https://wa.me/5492944557712?text=Hola%20Bianco!');
  });
});
