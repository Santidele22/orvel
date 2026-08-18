import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

type ForbiddenAccess = {
  file: string;
  snippets: string[];
};

const FORBIDDEN_DOT_ACCESS: ForbiddenAccess[] = [
  {
    file: 'src/app/services/cliente.service.ts',
    snippets: ['customer.full_name', 'row.created_at', 'row.updated_at', 'item.serviciosFavoritos', 'sanitized.createdAt']
  },
  {
    file: 'src/app/services/servicio.service.ts',
    snippets: ['payload.name', 'payload.duration_minutes', 'row.created_at', 'item.duracionMinutos', 'sanitized.createdAt']
  },
  {
    file: 'src/app/features/booking/data-access/turno.facade.ts',
    snippets: ['booking.starts_at', 'booking.ends_at', 'booking.customer_id', 'booking.service_id', 'booking.created_at']
  },
  {
    file: 'src/test-setup.ts',
    snippets: ['process.env.NEXT_PUBLIC_SUPABASE_URL', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY']
  }
];

describe('TS4111 guard - index-signature access style', () => {
  it('avoids dot-property access for dynamic/index-signature records in known blocker files', () => {
    const offenders: Array<{ file: string; snippet: string }> = [];

    for (const entry of FORBIDDEN_DOT_ACCESS) {
      const absolutePath = join(process.cwd(), entry.file);
      const source = readFileSync(absolutePath, 'utf8');

      for (const snippet of entry.snippets) {
        if (source.includes(snippet)) {
          offenders.push({ file: entry.file, snippet });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
