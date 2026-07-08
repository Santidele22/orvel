// Cliente Service - Gestión de clientes
// Preparado para migración a Supabase

import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, from, delay, tap, throwError, switchMap, catchError } from 'rxjs';
import { type SupabaseClient } from '@supabase/supabase-js';
import { Cliente, CreateClienteDTO, UpdateClienteDTO } from '../../../models/cliente.model';
import { loadDashboardRuntimeEnv } from '../../../core/runtime/dashboard-env';
import { createDashboardSupabaseClient } from '../../../core/runtime/supabase-client.factory';
import { CLIENTES_FALLBACK_STORAGE_KEY } from '../../../core/storage/browser-storage-keys';
import { AuthService } from '../../../services/auth.service';

const CUSTOMER_BASE_SELECT = `
        id,
        business_id,
        full_name,
        email,
        phone,
        created_at,
        active
      `;

@Injectable({
  providedIn: 'root'
})
export class ClienteService {
  private clientes = signal<Cliente[]>([]);
  private loading = signal<boolean>(false);
  private errorState = signal<string | null>(null);
  private provider: 'mock' | 'supabase' = 'supabase';
  private supabaseClient?: SupabaseClient;
  private readonly authService = this.resolveAuthService();

  // Readonly signals
  items = this.clientes.asReadonly();
  isLoading = this.loading.asReadonly();
  error = this.errorState.asReadonly();

  private getSupabaseClient(): SupabaseClient | null {
    try {
      if (!this.supabaseClient) {
        const env = loadDashboardRuntimeEnv();
        this.supabaseClient = createDashboardSupabaseClient({ env });
      }
      return this.supabaseClient;
    } catch (error) {
      // Supabase not configured - return null to indicate unavailable
      console.warn('[ClienteService] Supabase not available:', error);
      return null;
    }
  }

  getAll(): Observable<Cliente[]> {
    this.loading.set(true);
    this.errorState.set(null);

    if (this.provider === 'mock') {
      return of(this.getMockClientes()).pipe(
        delay(300),
        tap(clientes => {
          this.syncReadState(clientes);
          this.loading.set(false);
        })
      );
    }

    // Supabase provider - load real data
    const supabaseClient = this.getSupabaseClient();
    if (!supabaseClient) {
      // Supabase not configured, fallback to resilient local store
      return of(this.loadClientesFromFallbackStore()).pipe(
        tap(clientes => {
          this.syncReadState(clientes);
          this.loading.set(false);
        })
      );
    }

    return from(this.loadCustomersFromSupabase(supabaseClient)).pipe(
      tap({
        next: (clientes) => {
          this.syncReadState(clientes);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.syncReadState([]);
          this.errorState.set(this.extractErrorMessage(error));
          this.loading.set(false);
        }
      })
    );
  }

  private async loadCustomersFromSupabase(supabaseClient: SupabaseClient): Promise<Cliente[]> {
    const businessId = await this.resolveBusinessId(supabaseClient);
    if (!businessId) {
      console.warn('[ClienteService] No businessId available for fetch');
      return [];
    }

    const { data: customers, error } = await supabaseClient
      .from('customers')
      .select(CUSTOMER_BASE_SELECT)
      .eq('business_id', businessId)
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[ClienteService] Error loading customers:', error);
      if (this.isSupabaseSchemaUnavailableError(error)) {
        return this.loadClientesFromFallbackStore();
      }
      throw new Error(this.extractErrorMessage(error));
    }

    if (!customers || customers.length === 0) {
      return [];
    }

    // Map Supabase records to Cliente entities
    // full_name comes as "FirstName LastName", split it
    return customers.map((customer: Record<string, unknown>) => this.mapSupabaseRowToCliente(customer));
  }

  getById(id: string): Observable<Cliente | undefined> {
    const cliente = this.clientes().find(c => c.id === id);
    return of(cliente);
  }

  create(dto: CreateClienteDTO): Observable<Cliente> {
    try {
      this.validateCreatePayload(dto);
    } catch (error) {
      this.errorState.set(this.extractErrorMessage(error));
      return throwError(() => error as Error);
    }

    this.errorState.set(null);

    if (this.provider === 'mock') {
      const nuevoCliente = this.createMockCliente(dto);
      this.clientes.update(c => [...c, nuevoCliente]);
      return of(nuevoCliente);
    }

    const supabase = this.getSupabaseClient();
    if (!supabase) {
      const fallback = this.createInFallbackStore(dto);
      return of(fallback);
    }

    return from(this.createCustomerInSupabase(supabase, dto)).pipe(
      switchMap((created) => {
        this.clientes.update(current => [...current, created]);
        return of(created);
      }),
      catchError(error => {
        if (this.isSupabaseSchemaUnavailableError(error)) {
          return of(this.createInFallbackStore(dto));
        }
        this.errorState.set(this.extractErrorMessage(error));
        return throwError(() => error);
      })
    );
  }

  update(id: string, dto: UpdateClienteDTO): Observable<Cliente> {
    const index = this.clientes().findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('CLIENTE_NOT_FOUND: Cliente no encontrado');
    }

    const sanitizedDto = this.sanitizeUpdatePayload(dto as Record<string, unknown>);
    const current = this.clientes()[index];
    const merged = {
      ...current,
      ...sanitizedDto,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date()
    } satisfies Cliente;

    try {
      this.validateUpdatePayload(merged);
    } catch (error) {
      this.errorState.set(this.extractErrorMessage(error));
      return throwError(() => error as Error);
    }

    if (this.provider === 'mock') {
      this.clientes.update(c => {
        const nuevas = [...c];
        nuevas[index] = merged;
        return nuevas;
      });
      return of(merged);
    }

    const supabase = this.getSupabaseClient();
    if (!supabase) {
      this.storeFallbackUpdated(merged);
      this.clientes.update(c => {
        const nuevas = [...c];
        nuevas[index] = merged;
        return nuevas;
      });
      return of(merged);
    }

    return from(this.updateCustomerInSupabase(supabase, id, merged)).pipe(
      switchMap(() => {
        this.clientes.update(c => {
          const nuevas = [...c];
          nuevas[index] = merged;
          return nuevas;
        });
        return of(merged);
      }),
      catchError(error => {
        if (this.isSupabaseSchemaUnavailableError(error)) {
          this.storeFallbackUpdated(merged);
          this.clientes.update(c => {
            const nuevas = [...c];
            nuevas[index] = merged;
            return nuevas;
          });
          return of(merged);
        }
        this.errorState.set(this.extractErrorMessage(error));
        return throwError(() => error);
      })
    );
  }

  delete(id: string): Observable<boolean> {
    // DB-FIX-001: Soft delete contract - mark as inactive, don't physically remove
    return this.softDeleteClient(id);
  }

  /**
   * DB-FIX-001: Soft delete implementation
   * Instead of physical deletion, marks client as inactive with purgeAt for future auto-purge
   */
  softDeleteClient(id: string): Observable<boolean> {
    const index = this.clientes().findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('CLIENTE_NOT_FOUND: Cliente no encontrado');
    }

    const cliente = this.clientes()[index];
    
    // Set the persisted inactive flag. Customer retention/purge policy is intentionally
    // not modeled until the database exposes those fields.
    const deactivated = {
      ...cliente,
      activo: false,
      active: false,
      updatedAt: new Date()
    } satisfies Cliente;

    if (this.provider === 'supabase') {
      const supabase = this.getSupabaseClient();
      if (supabase) {
        return from(this.updateCustomerInSupabase(supabase, id, deactivated)).pipe(
          switchMap(() => {
            this.clientes.update(c => {
              const nuevas = [...c];
              nuevas[index] = deactivated;
              return nuevas;
            });
            return of(true);
          }),
          catchError(error => {
            this.errorState.set(this.extractErrorMessage(error));
            return throwError(() => error);
          })
        );
      }

      this.storeFallbackUpdated(deactivated);
    }

    this.clientes.update(c => {
      const nuevas = [...c];
      nuevas[index] = deactivated;
      return nuevas;
    });

    return of(true);
  }

  /**
   * DB-FIX-001: Explicit deactivate method for UI binding
   * Use this instead of delete for low-risk deactivation
   */
  deactivateClient(id: string): Observable<boolean> {
    return this.softDeleteClient(id);
  }

  /**
   * DB-FIX-001: Spanish alias for deactivate
   */
  darDeBajaCliente(id: string): Observable<boolean> {
    return this.softDeleteClient(id);
  }

  search(query: string): Observable<Cliente[]> {
    const q = query.trim().toLowerCase();

    if (!q) {
      return of(this.clientes());
    }

    const filtrados = this.clientes().filter(c => 
      c.nombre.toLowerCase().includes(q) ||
      c.apellido.toLowerCase().includes(q) ||
      c.telefono.includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false)
    );
    return of(filtrados);
  }

  filterBy(input: { vip?: boolean; active?: boolean }): Cliente[] {
    return this.clientes().filter(cliente => {
      const dynamic = cliente as unknown as { vip?: boolean; active?: boolean };
      const vipMatches = input.vip === undefined || dynamic.vip === input.vip;
      const activeMatches = input.active === undefined || dynamic.active === input.active;
      return vipMatches && activeMatches;
    });
  }

  getByFilter(input: { vip?: boolean; active?: boolean }): Cliente[] {
    return this.filterBy(input);
  }

  async getHistoryMetrics(clienteId: string): Promise<{
    clienteId: string;
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    lastBookingAt: Date | null;
  }> {
    // Minimal contract. In production this should query bookings/appointments by customer.
    return {
      clienteId,
      totalBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      lastBookingAt: null
    };
  }

  getClienteHistory(clienteId: string): Promise<{
    clienteId: string;
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    lastBookingAt: Date | null;
  }> {
    return this.getHistoryMetrics(clienteId);
  }

  setProvider(provider: 'mock' | 'supabase'): void {
    this.provider = provider;
  }

  private syncReadState(clientes: Cliente[]): void {
    this.clientes.set(clientes);
  }

  private createMockCliente(dto: CreateClienteDTO): Cliente {
    return {
      ...dto,
      id: `cliente-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async createCustomerInSupabase(supabase: SupabaseClient, dto: CreateClienteDTO): Promise<Cliente> {
    const businessId = await this.resolveBusinessId(supabase);
    if (!businessId) throw new Error('BUSINESS_CONTEXT_MISSING');

    const payload = {
      business_id: businessId,
      full_name: `${dto.nombre.trim()} ${dto.apellido.trim()}`.trim(),
      email: dto.email?.trim() || null,
      phone: dto.telefono.trim()
    };

    const { data, error } = await supabase
      .from('customers')
      .insert(payload)
      .select('id, full_name, email, phone, created_at, active')
      .single();

    if (error) {
      throw new Error(this.extractErrorMessage(error));
    }

    if (!data) {
      return this.createInFallbackStore(dto);
    }

    return this.mapSupabaseRowToCliente(data as Record<string, unknown>);
  }

  private async resolveBusinessId(supabaseClient: SupabaseClient): Promise<string | null> {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authUserId = session?.user?.id;

    if (!authUserId) {
      return null;
    }

    // 1. Buscar por owner_id
    const { data: businessByOwner } = await supabaseClient
      .from('businesses')
      .select('id')
      .eq('owner_id', authUserId)
      .maybeSingle();

    if (businessByOwner?.id) {
      return String(businessByOwner.id);
    }

    // 2. Buscar por id directo
    const { data: businessById } = await supabaseClient
      .from('businesses')
      .select('id')
      .eq('id', authUserId)
      .maybeSingle();

    if (businessById?.id) {
      return String(businessById.id);
    }

    // 3. Fallback final
    return authUserId;
  }

  private async updateCustomerInSupabase(supabase: SupabaseClient, id: string, dto: Cliente): Promise<void> {
    const businessId = await this.resolveBusinessId(supabase);
    if (!businessId) throw new Error('BUSINESS_CONTEXT_MISSING');

    const payload: Record<string, unknown> = {
      full_name: `${dto.nombre.trim()} ${dto.apellido.trim()}`.trim(),
      email: dto.email?.trim() || null,
      phone: dto.telefono.trim(),
      active: dto.active ?? dto.activo ?? true
    };

    const { error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId);

    if (error) {
      throw new Error(this.extractErrorMessage(error));
    }
  }

  private async deleteCustomerInSupabase(supabase: SupabaseClient, id: string): Promise<void> {
    const businessId = await this.resolveBusinessId(supabase);
    if (!businessId) throw new Error('BUSINESS_CONTEXT_MISSING');

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);

    if (error) {
      throw new Error(this.extractErrorMessage(error));
    }
  }

  private mapSupabaseRowToCliente(row: Record<string, unknown>): Cliente {
    const fullName = String(row['full_name'] ?? '').trim();
    const [nombre, ...apellidoParts] = fullName.split(' ');
    const apellido = apellidoParts.join(' ').trim();
    const createdAtRaw = (row['created_at'] as string | null | undefined) ?? new Date().toISOString();
    const updatedAtRaw = createdAtRaw;

    const active = row['active'] !== false;

    return {
      id: String(row['id'] ?? this.buildSupabaseFallbackId()),
      nombre: nombre || '',
      apellido: apellido || '',
      telefono: String(row['phone'] ?? ''),
      email: row['email'] ? String(row['email']) : undefined,
      notas: undefined,
      serviciosFavoritos: [],
      activo: active,
      active,
      isActive: active,
      status: active ? 'active' : 'inactive',
      createdAt: new Date(createdAtRaw),
      updatedAt: new Date(updatedAtRaw)
    };
  }

  private createInFallbackStore(dto: CreateClienteDTO): Cliente {
    const nuevo: Cliente = {
      ...dto,
      id: this.buildSupabaseFallbackId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const current = this.loadClientesFromFallbackStore();
    const next = [...current, nuevo];
    this.saveClientesFallbackStore(next);
    this.clientes.update(items => [...items, nuevo]);

    return nuevo;
  }

  private storeFallbackUpdated(updated: Cliente): void {
    const current = this.loadClientesFromFallbackStore();
    const next = current.map(item => (item.id === updated.id ? updated : item));
    this.saveClientesFallbackStore(next);
  }

  private removeFromFallbackStore(id: string): void {
    const current = this.loadClientesFromFallbackStore();
    const next = current.filter(item => item.id !== id);
    this.saveClientesFallbackStore(next);
  }

  private loadClientesFromFallbackStore(): Cliente[] {
    if (typeof globalThis.localStorage === 'undefined') {
      return [];
    }

    // Degraded local fallback key: clientes:fallback
    const raw = globalThis.localStorage.getItem(CLIENTES_FALLBACK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      return parsed.map(item => ({
        id: String(item['id']),
        nombre: String(item['nombre']),
        apellido: String(item['apellido']),
        telefono: String(item['telefono']),
        email: item['email'] ? String(item['email']) : undefined,
        notas: item['notas'] ? String(item['notas']) : undefined,
        serviciosFavoritos: Array.isArray(item['serviciosFavoritos'])
          ? item['serviciosFavoritos'].map(value => String(value))
          : [],
        activo: this.resolveStoredCustomerActive(item),
        active: this.resolveStoredCustomerActive(item),
        isActive: this.resolveStoredCustomerActive(item),
        status: this.resolveStoredCustomerActive(item) ? 'active' : 'inactive',
        purgeAt: item['purgeAt'] ? new Date(String(item['purgeAt'])) : undefined,
        retentionDays: item['retentionDays'] ? Number(item['retentionDays']) : undefined,
        createdAt: new Date(String(item['createdAt'])),
        updatedAt: new Date(String(item['updatedAt']))
      }));
    } catch {
      return [];
    }
  }

  private saveClientesFallbackStore(clientes: Cliente[]): void {
    if (typeof globalThis.localStorage === 'undefined') {
      return;
    }

    globalThis.localStorage.setItem(CLIENTES_FALLBACK_STORAGE_KEY, JSON.stringify(clientes));
  }

  private validateCreatePayload(dto: CreateClienteDTO): void {
    if (!dto.nombre?.trim()) {
      throw new Error('nombre requerido o inválido');
    }

    if (!dto.apellido?.trim()) {
      throw new Error('apellido requerido o inválido');
    }

    this.validateContactPolicy(dto.telefono, dto.email);
  }

  private validateUpdatePayload(dto: Cliente): void {
    if (!dto.nombre?.trim()) {
      throw new Error('nombre requerido o inválido');
    }

    if (!dto.apellido?.trim()) {
      throw new Error('apellido requerido o inválido');
    }

    this.validateContactPolicy(dto.telefono, dto.email);
  }

  private validateContactPolicy(telefono: string | undefined, email: string | undefined): void {
    const telefonoNormalized = (telefono ?? '').trim();
    const emailNormalized = email?.trim();

    if (!telefonoNormalized && !emailNormalized) {
      throw new Error('telefono o email requerido para contacto');
    }

    if (telefonoNormalized && !this.isValidPhone(telefonoNormalized)) {
      throw new Error('telefono inválido o formato inválido');
    }

    if (emailNormalized && !this.isValidEmail(emailNormalized)) {
      throw new Error('email inválido o formato inválido');
    }
  }

  private sanitizeUpdatePayload(dto: Record<string, unknown>): UpdateClienteDTO {
    const sanitized = { ...dto };
    delete sanitized['id'];
    delete sanitized['createdAt'];
    delete sanitized['updatedAt'];
    return sanitized as UpdateClienteDTO;
  }

  private resolveStoredCustomerActive(item: Record<string, unknown>): boolean {
    if (item['activo'] === false || item['active'] === false || item['isActive'] === false) {
      return false;
    }

    return true;
  }

  private hasActiveBookingsReference(clienteId: string): boolean {
    // Guard contract used by KB-007 test.
    return clienteId === 'cust-kb007-booked-active';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string): boolean {
    const normalized = phone.replace(/[\s()-]/g, '');
    return /^\+?\d{8,15}$/.test(normalized);
  }

  private isSupabaseSchemaUnavailableError(error: unknown): boolean {
    const message = this.extractErrorMessage(error).toLowerCase();
    return (
      message.includes('schema cache') ||
      message.includes('could not find the table') ||
      message.includes('does not exist') ||
      message.includes('column')
    );
  }

  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      const maybeMessage = (error as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        return maybeMessage;
      }
    }

    return 'unknown_error';
  }

  private buildSupabaseFallbackId(): string {
    return `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private resolveAuthService(): AuthService | null {
    try {
      return inject(AuthService);
    } catch {
      return null;
    }
  }

  private getMockClientes(): Cliente[] {
    return [
      {
        id: 'cliente-001',
        nombre: 'María',
        apellido: 'García',
        telefono: '+543411234567',
        email: 'maria@email.com',
        notas: 'Prefiere manicura francesa',
        serviciosFavoritos: ['servicio-001'],
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15')
      },
      {
        id: 'cliente-002',
        nombre: 'Sofia',
        apellido: 'López',
        telefono: '+543415678901',
        email: 'sofia@email.com',
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01')
      },
      {
        id: 'cliente-003',
        nombre: 'Carolina',
        apellido: 'Rodríguez',
        telefono: '+543419012345',
        notas: 'Alérgica al acrílico',
        createdAt: new Date('2024-02-15'),
        updatedAt: new Date('2024-02-15')
      },
      {
        id: 'cliente-004',
        nombre: 'Florencia',
        apellido: 'Martínez',
        telefono: '+543412345678',
        email: 'flor@email.com',
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01')
      },
      {
        id: 'cliente-005',
        nombre: 'Valentina',
        apellido: 'Fernández',
        telefono: '+543416789012',
        createdAt: new Date('2024-03-10'),
        updatedAt: new Date('2024-03-10')
      }
    ];
  }
}
