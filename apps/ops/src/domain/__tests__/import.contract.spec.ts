import { describe, expect, it } from 'vitest';
import { createContact } from '../contact';
import { parseImportTable, previewImportRows } from '../import-parse';

describe('parseImportTable', () => {
  it('parses tab-separated Instant Data Scraper paste with a header', () => {
    const raw = [
      'nombre\ttelefono\tciudad\tcategoria',
      'Peluquería Sur\t+54 9 294 490-1122\tBariloche\tPeluquería',
      'Nails Studio Vero\t0294 15 455-3387\tBariloche\tUñas'
    ].join('\n');
    const rows = parseImportTable(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: 'Peluquería Sur',
      phoneRaw: '+54 9 294 490-1122',
      city: 'Bariloche',
      category: 'peluqueria',
      address: '',
      rating: null
    });
    expect(rows[1]?.category).toBe('unas');
  });

  it('parses comma-separated rows without a header', () => {
    const rows = parseImportTable('Estética del Lago,2944809034,Bariloche,Estética');
    expect(rows[0]?.name).toBe('Estética del Lago');
    expect(rows[0]?.category).toBe('estetica');
  });

  it('maps Instant Data Scraper Google Maps columns and extracts city', () => {
    const raw = [
      'Title\tAddress\tPhone\tRating\tCategory',
      'Peluquería Sur\tAv. Bustillo 4200, San Carlos de Bariloche, Río Negro, Argentina\t+54 9 294 490-1122\t4.6\tHair salon'
    ].join('\n');
    const rows = parseImportTable(raw);
    expect(rows[0]).toMatchObject({
      name: 'Peluquería Sur',
      phoneRaw: '+54 9 294 490-1122',
      city: 'San Carlos de Bariloche',
      address: 'Av. Bustillo 4200, San Carlos de Bariloche, Río Negro, Argentina',
      rating: 4.6,
      category: 'peluqueria'
    });
  });
});

describe('previewImportRows', () => {
  it('flags duplicates by normalized phone against existing contacts', () => {
    const existing = [
      createContact({
        id: 'existing',
        name: 'Salón Delfina',
        phoneRaw: '+54 9 294 421-9087',
        city: 'Bariloche',
        category: 'unas',
        notes: ''
      })
    ];
    const preview = previewImportRows(
      [
        {
          name: 'Salón Delfina',
          phoneRaw: '0294 15 421-9087',
          city: 'Bariloche',
          category: 'unas',
          address: 'Bariloche, Río Negro, Argentina',
          rating: null
        },
        {
          name: 'Barbería Andes',
          phoneRaw: '2944027765',
          city: 'Bariloche',
          category: 'barberia',
          address: 'Bariloche, Río Negro, Argentina',
          rating: null
        }
      ],
      existing
    );
    expect(preview[0]?.duplicate).toBe(true);
    expect(preview[0]?.selected).toBe(false);
    expect(preview[1]?.duplicate).toBe(false);
    expect(preview[1]?.selected).toBe(true);
    expect(preview[1]?.phoneNormalized).toBe('5492944027765');
  });

  it('does not select rows outside Argentina', () => {
    const preview = previewImportRows(
      [
        {
          name: 'Salon Santiago',
          phoneRaw: '+56 9 8765 4321',
          city: 'Santiago',
          category: 'peluqueria',
          address: 'Providencia 123, Santiago, Chile',
          rating: 4.2
        }
      ],
      []
    );
    expect(preview[0]?.inArgentina).toBe(false);
    expect(preview[0]?.selected).toBe(false);
  });
});

const INSTANT_DATA_SCRAPER_MAPS_TSV = [
  'Title\tComplete address\tPhone\tWebsite\tAverage rating\tReviews count\tCategory',
  'Peluquería Norte\tMitre 100, San Carlos de Bariloche, Río Negro, Argentina\t+54 9 294 412-3390\thttps://example.com\t4.5\t120\tPeluquería',
  'Estética Bianco\tAv. Bustillo 4200, San Carlos de Bariloche, Río Negro, Argentina\t0294 15 455-7712\t\t4.2\t80\tEstética',
  'Salon Providencia\tProvidencia 123, Santiago, Chile\t+56 9 8765 4321\t\t4.8\t200\tPeluquería'
].join('\n');

describe('Instant Data Scraper Google Maps paste', () => {
  it('keeps Argentine rows and drops Chile despite extra scraper columns', () => {
    const rows = parseImportTable(INSTANT_DATA_SCRAPER_MAPS_TSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: 'Peluquería Norte',
      city: 'San Carlos de Bariloche',
      rating: 4.5,
      category: 'peluqueria'
    });
    const preview = previewImportRows(rows, []);
    expect(preview.filter((row) => row.selected).map((row) => row.name)).toEqual([
      'Peluquería Norte',
      'Estética Bianco'
    ]);
    expect(preview[2]?.inArgentina).toBe(false);
  });
});
