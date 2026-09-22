import { describe, expect, it } from 'vitest';
import { createContact } from '../../domain/contact';
import { DEFAULT_TEMPLATES } from '../../domain/seed-templates';
import { createLocalStorageRepos, OPS_STORAGE_KEY } from '../local-storage.store';

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('createLocalStorageRepos', () => {
  it('seeds default templates once and survives a new adapter instance', async () => {
    const storage = new MemoryStorage();
    const first = createLocalStorageRepos(storage);
    expect(await first.templates.list()).toEqual(DEFAULT_TEMPLATES);

    await first.contacts.save(
      createContact({
        id: 'c1',
        name: 'Peluquería Norte',
        phoneRaw: '2944123390',
        city: 'Bariloche',
        category: 'peluqueria',
        notes: ''
      })
    );

    const second = createLocalStorageRepos(storage);
    const listed = await second.contacts.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('Peluquería Norte');
    expect(storage.getItem(OPS_STORAGE_KEY)).toContain('Peluquería Norte');
  });
});
