import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIAS_SERVICIOS } from '../../models/servicio.model';

const EXACT_BUSINESS_SERVICE_CATALOG: Record<string, string[]> = {
  'Barbería': [
    'Corte de cabello',
    'Corte + barba',
    'Arreglo de barba',
    'Afeitado clásico',
    'Perfilado de cejas',
    'Coloración de cabello',
    'Coloración de barba',
    'Tratamiento capilar',
    'Lavado y peinado'
  ],
  'Peluquería': [
    'Corte mujer',
    'Corte hombre',
    'Lavado',
    'Peinado',
    'Brushing',
    'Coloración',
    'Mechas/Balayage',
    'Alisado',
    'Keratina',
    'Tratamientos capilares'
  ],
  'Uñas': [
    'Manicura',
    'Pedicura',
    'Esmaltado tradicional',
    'Esmaltado semipermanente',
    'Kapping',
    'Uñas gel',
    'Uñas acrílicas',
    'Nail Art',
    'Retiro de producto',
    'Reparación de uñas'
  ],
  'Pestañas y Cejas': [
    'Extensiones de pestañas',
    'Lifting de pestañas',
    'Permanente de pestañas',
    'Tinte de pestañas',
    'Perfilado de cejas',
    'Diseño de cejas',
    'Laminado de cejas'
  ],
  'Depilación': [
    'Cera facial',
    'Cera corporal',
    'Axilas',
    'Piernas',
    'Ingles',
    'Depilación con hilo',
    'Depilación láser'
  ],
  'Estética Facial': [
    'Limpieza facial',
    'Hidratación facial',
    'Antiacné',
    'Dermaplaning',
    'Peeling',
    'Rejuvenecimiento facial',
    'Tratamientos antimanchas'
  ],
  'Estética Corporal': [
    'Drenaje linfático',
    'Radiofrecuencia',
    'Presoterapia',
    'Cavitación',
    'Maderoterapia',
    'Exfoliación corporal',
    'Hidratación corporal',
    'Tonificación corporal'
  ],
  'Masajes': [
    'Relajante',
    'Descontracturante',
    'Deportivo',
    'Antiestrés',
    'Reflexología',
    'Drenaje linfático'
  ],
  'Maquillaje': [
    'Social',
    'Novias',
    'Eventos',
    'Quinceaños',
    'Producción fotográfica'
  ],
  'Spa / Bienestar': [
    'Circuito spa',
    'Masajes',
    'Tratamientos faciales',
    'Exfoliación corporal',
    'Hidroterapia',
    'Sauna',
    'Relax day'
  ]
};

function readDashboardSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

function readClientFormSources(): string {
  return [
    'src/app/features/clientes/pages/clientes.page.ts',
    'src/app/features/clientes/pages/clientes.page.html',
    'src/app/features/clientes/data-access/clientes-ui.facade.ts',
    'src/app/features/clientes/data-access/cliente.service.ts'
  ].map(readDashboardSource).join('\n');
}

function readSettingsSources(): string {
  return [
    'src/app/features/settings/pages/configuracion.page.ts',
    'src/app/features/settings/pages/configuracion.page.html',
    'src/app/features/settings/pages/themes/configuracion-zen-theme.component.ts',
    'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html',
    'src/app/features/settings/data-access/business.service.ts'
  ].map(readDashboardSource).join('\n');
}

function readServiciosPageSource(): string {
  return readDashboardSource('src/app/features/servicios/pages/servicios.page.ts');
}

describe('Dashboard second bugfix slice RED contracts', () => {
  it('uses the exact user-approved business categories as the service category source of truth', () => {
    expect([...CATEGORIAS_SERVICIOS]).toEqual(Object.keys(EXACT_BUSINESS_SERVICE_CATALOG));
  });

  it('exposes every user-approved service label in the dashboard service catalog contract', () => {
    const serviceSources = [
      'src/app/models/servicio.model.ts',
      'src/app/features/servicios/data-access/servicio.service.ts',
      'src/app/core/catalog/reference-catalog.ts'
    ].map(readDashboardSource).join('\n');

    for (const [category, services] of Object.entries(EXACT_BUSINESS_SERVICE_CATALOG)) {
      expect(serviceSources, `Missing category ${category}`).toContain(category);
      for (const service of services) {
        expect(serviceSources, `Missing ${category} service: ${service}`).toContain(service);
      }
    }
  });

  it('New Client modal has a real create-submit contract instead of a generic edit-only save affordance', () => {
    const source = readClientFormSources();

    expect(source).toMatch(/data-testid=["']clientes-modal-add-trigger["']/);
    expect(source).toMatch(/editingClientId\.set\(null\)[\s\S]*clientForm\.reset\(\)[\s\S]*showModal\.set\(true\)/);
    expect(source).toMatch(/<form[\s\S]*data-testid=["']client-form["'][\s\S]*\(ngSubmit\)=["']onSubmit\(\)["']/);
    expect(source).toMatch(/<button[^>]*type=["']submit["'][^>]*data-testid=["']client-form-submit["'][\s\S]*Crear cliente/);
    expect(source).toMatch(/if\s*\(editingId\)[\s\S]*facade\.edit[\s\S]*else[\s\S]*facade\.create[\s\S]*clients\.set\(this\.facade\.getList\(\)\)/);
  });

  it('Working hours form exposes deterministic controls, blocks invalid ranges, and saves changed hours', () => {
    const source = readSettingsSources();

    expect(source).toMatch(/<form[\s\S]*data-testid=["']settings-form["'][\s\S]*\(ngSubmit\)=["']onSubmit\(\)["']/);
    expect(source).toMatch(/formGroupName=["']workingHours["'][\s\S]*data-testid=["']working-hours-section["']/);
    expect(source).toMatch(/data-testid=["']working-hours-monday-enabled["'][\s\S]*formControlName=["']enabled["']/);
    expect(source).toMatch(/data-testid=["']working-hours-monday-start["'][\s\S]*openTimePicker\([^)]*monday[^)]*start/);
    expect(source).toMatch(/data-testid=["']working-hours-monday-end["'][\s\S]*openTimePicker\([^)]*monday[^)]*end/);
    expect(source).toMatch(/invalidRange[\s\S]*config-field-error-workingHours/);
    expect(source).toMatch(/workingHours:\s*values\.workingHours/);
    expect(source).toMatch(/data-testid=["']settings-save-submit["'][\s\S]*Guardar cambios/);
  });

  it('service save and delete feedback does not expose raw backend error messages', () => {
    const source = readServiciosPageSource();

    expect(source).not.toMatch(/feedback\.set\([^)]*\(error as Error\)\.message/);
    expect(source).toContain('No se pudo guardar el servicio. Intentá nuevamente en unos minutos.');
    expect(source).toContain('No se pudo eliminar el servicio. Intentá nuevamente en unos minutos.');
  });
});
