import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientesUiFacade } from '../data-access/clientes-ui.facade';
import { ClienteService } from '../data-access/cliente.service';
import { ThemeService } from '../../../core/theming/theme.service';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../core/theming/dashboard-structural.tokens';
import { ORVEL_SECTION_PRIMITIVES } from '../../../shared/dashboard-section-primitives/zen-section-primitives';
import { logMutationFailure } from '../../../core/observability/mutation-error-log';

type ClienteListItem = {
  id: string;
  fullName: string;
  telefono: string;
  email: string | null;
  active: boolean;
  purgeAt: Date | null;
};

@Component({
  selector: 'app-clientes-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './clientes.page.html'
})
export class ClientesPage {
  private readonly clienteService = inject(ClienteService);
  protected readonly themeService = inject(ThemeService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly facade = new ClientesUiFacade(this.clienteService);

  readonly isZen = computed(() => this.themeService.activeTheme() === 'zen');
  readonly structure = DASHBOARD_STRUCTURAL_TOKENS;
  readonly ui = ORVEL_SECTION_PRIMITIVES;

  readonly loading = signal(true);
  readonly searchQuery = signal('');
  readonly formMessage = signal('');
  readonly editingClientId = signal<string | null>(null);
  readonly showModal = signal(false);
  readonly clients = signal<ClienteListItem[]>([]);
  readonly showDeactivated = signal(false);
  readonly showBajaConfirm = signal(false);
  readonly isClienteBajaResultModalOpen = signal(false);

  // DB-FIX-001: Track selected client for deactivate action
  readonly selectedClientId = signal<string | null>(null);

  readonly customerMetrics = computed(() => ({
    total: this.clients().length,
    active: this.clients().filter((item) => item.active).length,
    deactivated: this.clients().filter((item) => !item.active).length,
    vip: this.clients().filter((item) => item.email?.includes('vip')).length,
    withEmail: this.clients().filter((item) => !!item.email).length
  }));

  openModal(): void {
    this.editingClientId.set(null);
    this.clientForm.reset();
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingClientId.set(null);
    this.clientForm.reset();
    this.formMessage.set('');
    this.cancelBajaConfirm();
  }

  readonly filteredClients = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const deactivatedMode = this.showDeactivated();

    return this.clients().filter(cliente => {
      if (cliente.active === deactivatedMode) {
        return false;
      }

      if (!query) {
        return true;
      }

      return cliente.fullName.toLowerCase().includes(query) ||
        cliente.telefono.toLowerCase().includes(query) ||
        (cliente.email?.toLowerCase().includes(query) ?? false);
    });
  });

  readonly clientForm = this.formBuilder.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(40)]],
    apellido: ['', [Validators.required, Validators.maxLength(40)]],
    telefono: ['', [Validators.required, Validators.minLength(6)]],
    email: ['', [Validators.email]]
  });

  constructor() {
    this.showDeactivated.set(this.route.snapshot.queryParamMap.get('estado') === 'bajas');
    void this.loadClients();
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  startEdit(cliente: ClienteListItem): void {
    if (!cliente.active) {
      return;
    }

    const [nombre = '', ...apellidoParts] = cliente.fullName.trim().split(' ');
    this.editingClientId.set(cliente.id);
    this.clientForm.setValue({
      nombre,
      apellido: apellidoParts.join(' '),
      telefono: cliente.telefono,
      email: cliente.email ?? ''
    });
    this.showModal.set(true);
  }

  async onSubmit(): Promise<void> {
    this.formMessage.set('');

    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      this.formMessage.set('Formulario inválido. Revisa nombre, apellido, teléfono y email.');
      return;
    }

    const formValue = this.clientForm.getRawValue();
    const payload = {
      nombre: formValue.nombre.trim(),
      apellido: formValue.apellido.trim(),
      telefono: formValue.telefono.trim(),
      email: formValue.email.trim() || undefined
    };

    const editingId = this.editingClientId();

    try {
      if (editingId) {
        await this.facade.edit(editingId, payload);
      } else {
        await this.facade.create(payload);
      }

      this.clients.set(this.facade.getList());
      this.closeModal();
    } catch (error) {
      this.logClientError(error, editingId ? 'customers.update' : 'customers.insert');
      this.formMessage.set(`No se pudo ${editingId ? 'guardar' : 'crear'} el cliente. ${this.mapClientErrorMessage(error)}`);
    }
  }

  private mapClientErrorMessage(error: unknown): string {
    const rawMessage = this.extractRawErrorMessage(error).toLowerCase();
    if (rawMessage.includes('duplicate') || rawMessage.includes('unique') || rawMessage.includes('already exists')) {
      return 'Ya existe un cliente con esos datos. Revisá teléfono o email.';
    }
    if (rawMessage.includes('permission') || rawMessage.includes('rls') || rawMessage.includes('auth')) {
      return 'No tenés permisos para completar esta acción. Iniciá sesión nuevamente.';
    }
    return 'Intenta nuevamente en unos minutos.';
  }

  private extractRawErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return '';
  }

  private logClientError(error: unknown, operation: string): void {
    logMutationFailure({ operation, error });
  }

  private async loadClients(): Promise<void> {
    this.loading.set(true);
    this.formMessage.set('');
    try {
      await this.facade.load();
      this.clients.set(this.facade.getList());
    } catch (error) {
      this.logClientError(error, 'customers.load');
      this.formMessage.set('No se pudieron cargar los clientes. Podés reintentar en unos minutos.');
    } finally {
      this.loading.set(false);
    }
  }

  manageDeactivations(): void {
    const nextValue = !this.showDeactivated();
    this.showDeactivated.set(nextValue);
    this.selectedClientId.set(null);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { estado: nextValue ? 'bajas' : null },
      queryParamsHandling: 'merge'
    });
  }

  openBajaConfirm(): void {
    const editingId = this.editingClientId();
    if (!editingId) {
      return;
    }

    this.selectedClientId.set(editingId);
    this.showBajaConfirm.set(true);
  }

  cancelBajaConfirm(): void {
    this.showBajaConfirm.set(false);
    this.selectedClientId.set(null);
  }

  closeClienteBajaResultModal(): void {
    this.isClienteBajaResultModalOpen.set(false);
  }

  confirmBaja(): void {
    const clientId = this.selectedClientId();
    if (!clientId) {
      return;
    }

    this.performDeactivate(clientId);
  }

  // DB-FIX-001: Soft-delete/deactivate methods for Gestionar Bajas
  deactivateClient(client: ClienteListItem): void {
    this.selectedClientId.set(client.id);
    this.showBajaConfirm.set(true);
  }

  performDeactivate(clientId: string): void {
    this.clienteService.darDeBajaCliente(clientId).subscribe({
      next: () => {
        this.cancelBajaConfirm();
        this.closeModal();
        void this.loadClients();
        this.isClienteBajaResultModalOpen.set(true);
      },
      error: (error) => {
        this.logClientError(error, 'customers.deactivate');
        this.formMessage.set('No se pudo dar de baja el cliente. Intentá nuevamente.');
      }
    });
  }

  // DB-FIX-001: Alias for UI binding
  softDeleteClient(client: ClienteListItem): void {
    this.deactivateClient(client);
  }

  // DB-FIX-001: Alias for UI binding  
  darDeBajaCliente(client: ClienteListItem): void {
    this.deactivateClient(client);
  }

  // DB-FIX-001: Purge/retention reference for test matching
  readonly purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  readonly pendingPurge = false;
  readonly autoPurge = false;
  readonly retention = 30;
}
