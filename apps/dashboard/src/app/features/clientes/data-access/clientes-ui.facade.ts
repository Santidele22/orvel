import { firstValueFrom } from 'rxjs';
import { ClienteService } from './cliente.service';

type ClienteListItem = {
  id: string;
  fullName: string;
  telefono: string;
  email: string | null;
  active: boolean;
  purgeAt: Date | null;
};

type CreateClienteInput = {
  nombre: string;
  apellido: string;
  telefono: string;
  email?: string;
  notas?: string;
};

type EditClienteInput = {
  nombre?: string;
  apellido?: string;
  telefono?: string;
  email?: string;
  notas?: string;
};

export class ClientesUiFacade {
  private list: ClienteListItem[] = [];

  constructor(private readonly clienteService: ClienteService) {}

  async load(): Promise<void> {
    await firstValueFrom(this.clienteService.getAll());
    this.syncFromService();
  }

  getList(): ClienteListItem[] {
    return [...this.list];
  }

  search(query: string): ClienteListItem[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return this.getList();
    }

    return this.list.filter(item =>
      item.fullName.toLowerCase().includes(normalizedQuery) ||
      item.telefono.includes(normalizedQuery) ||
      (item.email?.toLowerCase().includes(normalizedQuery) ?? false)
    );
  }

  async create(input: CreateClienteInput): Promise<{ id: string }> {
    const created = await firstValueFrom(this.clienteService.create(input));
    this.syncFromService();

    return { id: created.id };
  }

  async edit(id: string, input: EditClienteInput): Promise<void> {
    await firstValueFrom(this.clienteService.update(id, input));
    this.syncFromService();
  }

  private syncFromService(): void {
    this.list = this.clienteService.items().map(cliente => ({
      id: cliente.id,
      fullName: `${cliente.nombre} ${cliente.apellido}`.trim(),
      telefono: cliente.telefono,
      email: cliente.email ?? null,
      active: this.resolveActiveState(cliente),
      purgeAt: cliente.purgeAt ?? null
    }));
  }

  private resolveActiveState(cliente: { activo?: boolean; active?: boolean }): boolean {
    if (cliente.activo === false || cliente.active === false) {
      return false;
    }

    return true;
  }
}
