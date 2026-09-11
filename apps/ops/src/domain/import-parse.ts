import { extractCityFromAddress, isArgentinaProspect } from './argentina';
import { parseCategory, type ContactCategory } from './category';
import type { Contact } from './contact';
import { normalizePhoneForWhatsApp } from './phone';

export type ImportColumn = 'name' | 'phoneRaw' | 'city' | 'category' | 'address' | 'rating';

export type ImportDraft = {
  name: string;
  phoneRaw: string;
  city: string;
  category: ContactCategory;
  address: string;
  rating: number | null;
};

export type ImportPreviewRow = ImportDraft & {
  phoneNormalized: string | null;
  duplicate: boolean;
  inArgentina: boolean;
  selected: boolean;
};

const HEADER_ALIASES: Record<string, ImportColumn> = {
  nombre: 'name',
  name: 'name',
  title: 'name',
  título: 'name',
  titulo: 'name',
  salon: 'name',
  salón: 'name',
  telefono: 'phoneRaw',
  teléfono: 'phoneRaw',
  phone: 'phoneRaw',
  'phone number': 'phoneRaw',
  ciudad: 'city',
  city: 'city',
  categoria: 'category',
  categoría: 'category',
  category: 'category',
  rubro: 'category',
  type: 'category',
  address: 'address',
  dirección: 'address',
  direccion: 'address',
  'full address': 'address',
  'complete address': 'address',
  rating: 'rating',
  calificación: 'rating',
  calificacion: 'rating',
  stars: 'rating',
  'average rating': 'rating'
};

export function parseImportTable(raw: string): ImportDraft[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const firstCells = splitRow(lines[0], delimiter);
  const headerMap = detectHeader(firstCells);
  const dataLines = headerMap ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const cells = splitRow(line, delimiter);
    if (headerMap) {
      return draftFromCells(cells, headerMap);
    }
    return {
      name: cells[0] ?? '',
      phoneRaw: cells[1] ?? '',
      city: cells[2] ?? '',
      category: parseCategory(cells[3]),
      address: '',
      rating: null
    };
  });
}

export function previewImportRows(drafts: ImportDraft[], existing: Contact[]): ImportPreviewRow[] {
  const known = new Set(
    existing.map((contact) => contact.phoneNormalized).filter((phone): phone is string => Boolean(phone))
  );
  const seenInFile = new Set<string>();
  return drafts.map((draft) => {
    const phoneNormalized = normalizePhoneForWhatsApp(draft.phoneRaw);
    const duplicateInStore = phoneNormalized !== null && known.has(phoneNormalized);
    const duplicateInFile = phoneNormalized !== null && seenInFile.has(phoneNormalized);
    if (phoneNormalized) {
      seenInFile.add(phoneNormalized);
    }
    const duplicate = duplicateInStore || duplicateInFile;
    const inArgentina = isArgentinaProspect({
      address: draft.address,
      phoneRaw: draft.phoneRaw,
      city: draft.city
    });
    return {
      ...draft,
      phoneNormalized,
      duplicate,
      inArgentina,
      selected: !duplicate && phoneNormalized !== null && inArgentina
    };
  });
}

function draftFromCells(cells: string[], headerMap: Partial<Record<ImportColumn, number>>): ImportDraft {
  const address = cell(cells, headerMap.address);
  const cityCell = cell(cells, headerMap.city);
  return {
    name: cell(cells, headerMap.name),
    phoneRaw: cell(cells, headerMap.phoneRaw),
    city: cityCell || extractCityFromAddress(address),
    category: parseCategory(cell(cells, headerMap.category)),
    address,
    rating: parseRating(cell(cells, headerMap.rating))
  };
}

function cell(cells: string[], index: number | undefined): string {
  if (index === undefined || index < 0) {
    return '';
  }
  return cells[index] ?? '';
}

function parseRating(raw: string): number | null {
  if (!raw) {
    return null;
  }
  const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return value >= 0 && value <= 5 ? value : null;
}

function splitRow(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cellValue) => cellValue.trim());
}

function detectHeader(cells: string[]): Partial<Record<ImportColumn, number>> | null {
  const mapped = cells.map((item) => HEADER_ALIASES[item.trim().toLowerCase()]);
  if (!mapped.includes('name') || !mapped.includes('phoneRaw')) {
    return null;
  }
  const headerMap: Partial<Record<ImportColumn, number>> = {};
  mapped.forEach((column, index) => {
    if (column && headerMap[column] === undefined) {
      headerMap[column] = index;
    }
  });
  return headerMap;
}
