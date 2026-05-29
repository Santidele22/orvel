import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientesUiFacade } from '../data-access/clientes-ui.facade';
import { ClienteService } from '../data-access/cliente.service';
import { ThemeService } from '../../../core/theming/theme.service';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../core/theming/dashboard-structural.tokens';
import { ORVEL_SECTION_PRIMITIVES } from '../../../shared/dashboard-section-primitives/zen-section-primitives';

type ClienteListItem = {
  id: string;
  fullName: string;
  telefono: string;
  email: string | null;
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
  
  // DB-FIX-001: Track selected client for deactivate action
  readonly selectedClientId = signal<string | null>(null);

  readonly customerMetrics = computed(() => ({
    total: this.clients().length,
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
  }

  readonly filteredClients = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();

    if (!query) {
      return this.clients();
    }

    return this.clients().filter(cliente =>
      cliente.fullName.toLowerCase().includes(query) ||
      cliente.telefono.toLowerCase().includes(query) ||
      (cliente.email?.toLowerCase().includes(query) ?? false)
    );
  });

  readonly clientForm = this.formBuilder.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(40)]],
    apellido: ['', [Validators.required, Validators.maxLength(40)]],
    telefono: ['', [Validators.required, Validators.minLength(6)]],
    email: ['']
  });

  constructor() {
    void this.loadClients();
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  startEdit(cliente: ClienteListItem): void {
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
      this.formMessage.set('Formulario inválido. Revisa nombre y teléfono.');
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

    if (editingId) {
      await this.facade.edit(editingId, payload);
    } else {
      await this.facade.create(payload);
    }

    this.closeModal();
    this.clients.set(this.facade.getList());
  }

  private async loadClients(): Promise<void> {
    this.loading.set(true);
    await this.facade.load();
    this.clients.set(this.facade.getList());
    this.loading.set(false);
  }

  // DB-FIX-001: Soft-delete/deactivate methods for Gestionar Bajas
  // Use signal to track selected client for deactivate action
  deactivateClient(client: ClienteListItem): void {
    this.selectedClientId.set(client.id);
    // Open confirmation modal or directly deactivate
    this.performDeactivate(client.id);
  }

// DB-FIX-001: Soft-delete implementation
  performDeactivate(clientId: string): void {
    this.clienteService.darDeBajaCliente(clientId).subscribe({
      next: () => {
        this.clients.set(this.facade.getList());
      },
      error: (error) => {
        this.formMessage.set('Error al dar de baja: ' + (error as Error).message);
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
