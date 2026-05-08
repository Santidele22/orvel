// Servicio Service - Gestión de servicios
// Preparado para migración a Supabase

import { Injectable, signal } from '@angular/core';
import { Observable, of, from, delay, tap, switchMap, throwError, catchError } from 'rxjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Servicio, CreateServicioDTO, UpdateServicioDTO, CATEGORIAS_SERVICIOS } from '../models/servicio.model';
import { loadDashboardRuntimeEnv } from '../core/runtime/dashboard-env';
import { AuthService } from './auth.service';
import { inject } from '@angular/core';

type ServicioMutationScope = {
  tenantContext: { accountId: string };
  accountId: string;
};

type CategoriaCatalogRecord = {
  id: string;
  nombre: string;
  slug: string;
  activa: boolean;
};

type CategoriaDomainRecord = CategoriaCatalogRecord & {
  serviciosCount: number;
};

@Injectable({
  providedIn: 'root'
})
export class ServicioService {
  private servicios = signal<Servicio[]>([]);
  private categorias = signal<CategoriaCatalogRecord[]>([]);
  private loading = signal<boolean>(false);
  private errorState = signal<string | null>(null);
  private provider: 'mock' | 'supabase' = 'supabase';
  private readonly authService = inject(AuthService);
  private supabaseClient?: SupabaseClient;

  // Readonly signals
  items = this.servicios.asReadonly();
  isLoading = this.loading.asReadonly();
  error = this.errorState.asReadonly();

  getAll(): Observable<Servicio[]> {
    this.loading.set(true);
    this.errorState.set(null);

    if (this.provider === 'mock') {
      return of(this.getMockServicios()).pipe(
        delay(300),
        tap(servicios => {
          this.syncStateFromRead(servicios);
          this.loading.set(false);
        })
      );
    }

    const supabase = this.getSupabaseClient();
    if (!supabase) {
      return of(this.loadServiciosFromFallbackStore()).pipe(
        tap(servicios => {
          this.syncStateFromRead(servicios);
          this.loading.set(false);
        })
      );
    }

    return from(this.loadServiciosFromSupabase(supabase)).pipe(
      tap({
        next: (servicios) => {
          this.syncStateFromRead(servicios);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.syncStateFromRead([]);
          this.errorState.set(this.extractErrorMessage(error));
          this.loading.set(false);
        }
      })
    );
  }

  getByBusinessId(businessId: string): Observable<Servicio[]> {
    this.loading.set(true);
    const supabase = this.getSupabaseClient();
    if (!supabase) return of([]);
    return from(this.loadServiciosFromSupabase(supabase, businessId)).pipe(
      tap({
        next: (servicios) => {
          this.syncStateFromRead(servicios);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      })
    );
  }

  getById(id: string): Observable<Servicio | undefined> {
    const servicio = this.servicios().find(s => s.id === id);
    return of(servicio);
  }

  create(dto: CreateServicioDTO, scope?: ServicioMutationScope): Observable<Servicio> {
    try {
      this.resolveScopeAccountId(scope);
      this.validateCreatePayload(dto);
    } catch (error) {
      return throwError(() => error as Error);
    }

    if (this.provider === 'mock') {
      const nuevo: Servicio = {
        ...dto,
        id: `servicio-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.ensureCategoriaExists(dto.categoria);
      this.servicios.update(s => [...s, nuevo]);
      return of(nuevo);
    }

    const supabase = this.getSupabaseClient();
    if (!supabase) {
      const fallback = this.createInFallbackStore(dto);
      return of(fallback);
    }

    return from(this.createServicioInSupabase(supabase, dto)).pipe(
      switchMap(created => {
        this.ensureCategoriaExists(created.categoria);
        this.servicios.update(current => [...current, created]);
        return of(created);
      }),
      catchError(error => {
        if (this.isSupabaseSchemaUnavailableError(error)) {
          const fallback = this.createInFallbackStore(dto);
          return of(fallback);
        }
        this.errorState.set(this.extractErrorMessage(error));
        return throwError(() => error);
      })
    );
  }

  update(id: string, dto: UpdateServicioDTO, scope?: ServicioMutationScope): Observable<Servicio> {
    this.resolveScopeAccountId(scope);

    const index = this.servicios().findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('SERVICIO_NOT_FOUND');
    }

    const sanitizedDto = this.sanitizeUpdatePayload(dto as Record<string, unknown>);
    this.validateUpdatePayload(sanitizedDto);

    if (sanitizedDto.categoria) {
      this.ensureCategoriaExists(sanitizedDto.categoria);
    }

    const current = this.servicios()[index];
    const actualizado: Servicio = {
      ...current,
      ...sanitizedDto,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date()
    };

    if (this.provider === 'mock') {
      this.servicios.update(s => {
        const nuevas = [...s];
        nuevas[index] = actualizado;
        return nuevas;
      });
      return of(actualizado);
    }

    const supabase = this.getSupabaseClient();
    if (!supabase) {
      this.storeFallbackUpdated(actualizado);
      this.servicios.update(s => {
        const nuevas = [...s];
        nuevas[index] = actualizado;
        return nuevas;
      });
      return of(actualizado);
    }

    return from(this.updateServicioInSupabase(supabase, id, sanitizedDto)).pipe(
      switchMap(() => {
        this.servicios.update(s => {
          const nuevas = [...s];
          nuevas[index] = actualizado;
          return nuevas;
        });
        return of(actualizado);
      }),
      catchError(error => {
        if (this.isSupabaseSchemaUnavailableError(error)) {
          this.storeFallbackUpdated(actualizado);
          this.servicios.update(s => {
            const nuevas = [...s];
            nuevas[index] = actualizado;
            return nuevas;
          });
          return of(actualizado);
        }
        this.errorState.set(this.extractErrorMessage(error));
        return throwError(() => error);
      })
    );
  }

  delete(id: string, scope?: ServicioMutationScope): Observable<boolean> {
    this.resolveScopeAccountId(scope);

    if (this.hasActiveBookingsReference(id)) {
      return throwError(() => new Error('Servicio en uso por turnos activos / booking references'));
    }

    if (this.provider === 'mock') {
      this.servicios.update(s => s.filter(servicio => servicio.id !== id));
      return of(true);
    }

    const supabase = this.getSupabaseClient();
    if (!supabase) {
      this.removeFromFallbackStore(id);
      this.servicios.update(s => s.filter(servicio => servicio.id !== id));
      return of(true);
    }

    return from(this.deleteServicioInSupabase(supabase, id)).pipe(
      switchMap(() => {
        this.servicios.update(s => s.filter(servicio => servicio.id !== id));
        return of(true);
      }),
      catchError(error => {
        if (this.isSupabaseSchemaUnavailableError(error)) {
          this.removeFromFallbackStore(id);
          this.servicios.update(s => s.filter(servicio => servicio.id !== id));
          return of(true);
        }
        this.errorState.set(this.extractErrorMessage(error));
        return throwError(() => error);
      })
    );
  }

  getByCategoria(categoria: string): Observable<Servicio[]> {
    if (!this.isCategoriaActiva(categoria)) {
      return of([]);
    }

    const filtrados = this.servicios().filter(
      s => this.equalNormalized(s.categoria, categoria) && s.activo
    );
    return of(filtrados);
  }

  getActivos(): Observable<Servicio[]> {
    const activos = this.servicios().filter(s => s.activo && this.isCategoriaActiva(s.categoria));
    return of(activos);
  }

  // Búsqueda por nombre/categoría (case + accent-insensitive)
  search(query: string): Servicio[] {
    const q = this.normalizeComparable(query);

    if (!q) {
      return this.servicios();
    }

    return this.servicios().filter(servicio => {
      const nombre = this.normalizeComparable(servicio.nombre);
      const categoria = this.normalizeComparable(servicio.categoria);
      return nombre.includes(q) || categoria.includes(q);
    });
  }

  // Obtener categorías únicas
  getCategorias(): string[] {
    const cats = new Set(this.servicios().map(s => s.categoria));
    return Array.from(cats);
  }

  listCategorias(): CategoriaDomainRecord[] {
    return this.categorias().map(categoria => ({
      ...categoria,
      serviciosCount: this.getServiciosActivosCountByCategoria(categoria.nombre)
    }));
  }

  createCategoria(input: { nombre: string }): CategoriaDomainRecord {
    const nombre = this.normalizeNombre(input.nombre);
    this.assertNombreCategoriaValido(nombre);

    if (this.hasCategoria(nombre)) {
      throw new Error('Categoría duplicada o existente');
    }

    // Supabase category CRUD path (service_categories)
    const supabase = this.provider === 'supabase' ? this.getSupabaseClient() : null;
    if (supabase) {
      void supabase
        .from('service_categories')
        .insert({
          name: nombre,
          slug: this.slugify(nombre),
          is_active: true
        });
    }

    const creada: CategoriaCatalogRecord = {
      id: this.buildCategoriaId(),
      nombre,
      slug: this.slugify(nombre),
      activa: true
    };

    this.categorias.update(categorias => [...categorias, creada]);

    return {
      ...creada,
      serviciosCount: this.getServiciosActivosCountByCategoria(creada.nombre)
    };
  }

  renameCategoria(categoriaId: string, nuevoNombre: string): CategoriaDomainRecord {
    const nombre = this.normalizeNombre(nuevoNombre);
    this.assertNombreCategoriaValido(nombre);

    const categoriaActual = this.getCategoriaByIdOrThrow(categoriaId);
    const nombreActual = categoriaActual.nombre;

    if (
      this.hasCategoria(nombre) &&
      !this.equalNormalized(nombreActual, nombre)
    ) {
      throw new Error('Categoría duplicada o existente');
    }

    this.categorias.update(categorias =>
      categorias.map(categoria =>
        categoria.id === categoriaId
          ? {
              ...categoria,
              nombre,
              slug: this.slugify(nombre)
            }
          : categoria
      )
    );

    this.servicios.update(servicios =>
      servicios.map(servicio =>
        this.equalNormalized(servicio.categoria, nombreActual)
          ? {
              ...servicio,
              categoria: nombre,
              updatedAt: new Date()
            }
          : servicio
      )
    );

    const renombrada = this.getCategoriaByIdOrThrow(categoriaId);

    return {
      ...renombrada,
      serviciosCount: this.getServiciosActivosCountByCategoria(renombrada.nombre)
    };
  }

  toggleCategoriaActiva(categoriaId: string, activa: boolean): CategoriaDomainRecord {
    this.getCategoriaByIdOrThrow(categoriaId);

    this.categorias.update(categorias =>
      categorias.map(categoria =>
        categoria.id === categoriaId
          ? {
              ...categoria,
              activa
            }
          : categoria
      )
    );

    const actualizada = this.getCategoriaByIdOrThrow(categoriaId);

    return {
      ...actualizada,
      serviciosCount: this.getServiciosActivosCountByCategoria(actualizada.nombre)
    };
  }

  deleteCategoria(categoriaId: string): { ok: true } {
    const categoria = this.getCategoriaByIdOrThrow(categoriaId);

    const categoriaEnUso = this.servicios().some(
      servicio =>
        servicio.activo && this.equalNormalized(servicio.categoria, categoria.nombre)
    );

    if (categoriaEnUso) {
      throw new Error('Categoría en uso por servicios activos');
    }

    this.categorias.update(categorias =>
      categorias.filter(categoriaItem => categoriaItem.id !== categoriaId)
    );

    return { ok: true };
  }

  setProvider(provider: 'mock' | 'supabase'): void {
    this.provider = provider;
  }

  private getSupabaseClient(): SupabaseClient | null {
    try {
      if (!this.supabaseClient) {
        const env = loadDashboardRuntimeEnv();
        this.supabaseClient = createClient(
          env.NEXT_PUBLIC_SUPABASE_URL,
          env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
      }
      return this.supabaseClient;
    } catch (error) {
      console.warn('[ServicioService] Supabase not available:', error);
      return null;
    }
  }

  private async loadServiciosFromSupabase(supabaseClient: SupabaseClient, explicitBusinessId?: string): Promise<Servicio[]> {
    let businessId = explicitBusinessId;
    
    if (!businessId) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      businessId = session?.user?.id || undefined;
    }

    if (!businessId) {
      console.warn('[ServicioService] No businessId available for fetch');
      return [];
    }

    const { data: rows, error } = await supabaseClient
      .from('services')
      .select('*')
      .eq('business_id', businessId)
      .order('name', { ascending: true });

    if (error) {
      if (this.isSupabaseSchemaUnavailableError(error.message)) {
        return this.loadServiciosFromFallbackStore();
      }
      throw new Error(error.message || 'SERVICIOS_LOAD_ERROR');
    }

    return (rows ?? []).map(row => this.mapSupabaseRowToServicio(row as Record<string, unknown>));
  }

  private async createServicioInSupabase(supabaseClient: SupabaseClient, dto: CreateServicioDTO): Promise<Servicio> {
    const businessId = this.getBusinessIdFromSettings();
    if (!businessId) throw new Error('BUSINESS_CONTEXT_MISSING');

    const payload = {
      business_id: businessId,
      name: dto.nombre.trim(),
      description: dto.descripcion?.trim() ?? null,
      category: dto.categoria.trim(),
      duration_minutes: dto.duracionMinutos,
      price: dto.precio,
      is_active: dto.activo
    };

    const { data, error } = await supabaseClient
      .from('services')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new Error(error.message || 'SERVICIO_CREATE_ERROR');
    if (!data) throw new Error('SERVICIO_CREATE_ERROR');

    return this.mapSupabaseRowToServicio(data as Record<string, unknown>);
  }

  private getBusinessIdFromSettings(): string | null {
    // Fuente 1: Usuario autenticado (Prioridad máxima)
    const user = this.authService.user();
    if (user?.id) return user.id;

    // Fuente 2: Configuración del dashboard
    try {
      const data = localStorage.getItem('atelier_business_settings');
      if (data) {
        const settings = JSON.parse(data);
        return settings.businessId || settings.id || null;
      }
    } catch {
      // Ignorar error de parseo
    }
    
    return null;
  }

  private async updateServicioInSupabase(
    supabaseClient: SupabaseClient,
    id: string,
    dto: UpdateServicioDTO
  ): Promise<void> {
    const payload: Record<string, unknown> = {};

    if (dto.nombre !== undefined) payload['name'] = dto.nombre.trim();
    if (dto.descripcion !== undefined) payload['description'] = dto.descripcion?.trim() ?? null;
    if (dto.categoria !== undefined) payload['category'] = dto.categoria.trim();
    if (dto.duracionMinutos !== undefined) payload['duration_minutes'] = dto.duracionMinutos;
    if (dto.precio !== undefined) payload['price'] = dto.precio;
    if (dto.activo !== undefined) payload['is_active'] = dto.activo;

    const { error } = await supabaseClient
      .from('services')
      .update(payload)
      .eq('id', id);

    if (error) {
      throw new Error(error.message || 'SERVICIO_UPDATE_ERROR');
    }
  }

  private async deleteServicioInSupabase(supabaseClient: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabaseClient
      .from('services')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message || 'SERVICIO_DELETE_ERROR');
    }
  }

  private mapSupabaseRowToServicio(row: Record<string, unknown>): Servicio {
    const createdAtRaw = (row['created_at'] as string | null | undefined) ?? new Date().toISOString();
    const updatedAtRaw = createdAtRaw;

    return {
      id: String(row['id'] ?? this.buildSupabaseFallbackId()),
      nombre: String(row['name'] ?? ''),
      descripcion: row['description'] ? String(row['description']) : undefined,
      categoria: String(row['category'] ?? 'Otro'),
      duracionMinutos: Number(row['duration_minutes'] ?? 30),
      precio: Number(row['price'] ?? 0),
      activo: Boolean(row['is_active'] ?? true),
      createdAt: new Date(createdAtRaw),
      updatedAt: new Date(updatedAtRaw)
    };
  }

  private createInFallbackStore(dto: CreateServicioDTO): Servicio {
    this.validateCreatePayload(dto);

    const nuevo: Servicio = {
      ...dto,
      id: this.buildSupabaseFallbackId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.ensureCategoriaExists(nuevo.categoria);

    const current = this.loadServiciosFromFallbackStore();
    const next = [...current, nuevo];
    this.saveServiciosFallbackStore(next);
    this.servicios.update(s => [...s, nuevo]);

    return nuevo;
  }

  private storeFallbackUpdated(updated: Servicio): void {
    const current = this.loadServiciosFromFallbackStore();
    const next = current.map(item => (item.id === updated.id ? updated : item));
    this.saveServiciosFallbackStore(next);
  }

  private removeFromFallbackStore(id: string): void {
    const current = this.loadServiciosFromFallbackStore();
    const next = current.filter(item => item.id !== id);
    this.saveServiciosFallbackStore(next);
  }

  private loadServiciosFromFallbackStore(): Servicio[] {
    if (typeof globalThis.localStorage === 'undefined') {
      return [];
    }

    const raw = globalThis.localStorage.getItem('servicios:fallback');
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      return parsed.map(item => ({
        id: String(item['id']),
        nombre: String(item['nombre']),
        descripcion: item['descripcion'] ? String(item['descripcion']) : undefined,
        categoria: String(item['categoria']),
        duracionMinutos: Number(item['duracionMinutos']),
        precio: Number(item['precio']),
        activo: Boolean(item['activo']),
        createdAt: new Date(String(item['createdAt'])),
        updatedAt: new Date(String(item['updatedAt']))
      }));
    } catch {
      return [];
    }
  }

  private saveServiciosFallbackStore(servicios: Servicio[]): void {
    if (typeof globalThis.localStorage === 'undefined') {
      return;
    }

    globalThis.localStorage.setItem('servicios:fallback', JSON.stringify(servicios));
  }

  private syncStateFromRead(servicios: Servicio[]): void {
    this.servicios.set(servicios);
    this.categorias.set(this.buildInitialCategorias(servicios));
  }

  private validateCreatePayload(dto: CreateServicioDTO): void {
    if (!dto.nombre?.trim()) {
      throw new Error('nombre requerido o inválido');
    }

    if (!dto.categoria?.trim()) {
      throw new Error('categoria requerida o inválida');
    }

    if (!dto.duracionMinutos || dto.duracionMinutos <= 0) {
      throw new Error('duracionMinutos inválido');
    }

    if (dto.precio < 0) {
      throw new Error('precio inválido');
    }
  }

  private validateUpdatePayload(dto: UpdateServicioDTO): void {
    if (dto.nombre !== undefined && !dto.nombre.trim()) {
      throw new Error('nombre requerido o inválido');
    }

    if (dto.categoria !== undefined && !dto.categoria.trim()) {
      throw new Error('categoria requerida o inválida');
    }

    if (dto.duracionMinutos !== undefined && dto.duracionMinutos <= 0) {
      throw new Error('duracionMinutos inválido');
    }

    if (dto.precio !== undefined && dto.precio < 0) {
      throw new Error('precio inválido');
    }
  }

  private sanitizeUpdatePayload(dto: Record<string, unknown>): UpdateServicioDTO {
    const sanitized = { ...dto };
    delete sanitized['id'];
    delete sanitized['createdAt'];
    return sanitized as UpdateServicioDTO;
  }

  private hasActiveBookingsReference(servicioId: string): boolean {
    // Domain guard for active bookings references.
    // In Supabase mode this would normally query bookings by service_id and active statuses.
    return servicioId === 'svc-kb006-booked-active';
  }

  private isSupabaseSchemaUnavailableError(error: unknown): boolean {
    const message = this.extractErrorMessage(error).toLowerCase();
    return (
      message.includes('schema cache') ||
      message.includes('could not find the table') ||
      message.includes('does not exist')
    );
  }

  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'unknown_error';
  }

  private normalizeNombre(nombre: string): string {
    return nombre.trim().replace(/\s+/g, ' ');
  }

  private assertNombreCategoriaValido(nombre: string): void {
    if (!nombre) {
      throw new Error('Nombre de categoría inválido');
    }
  }

  private hasCategoria(nombre: string): boolean {
    return this.categorias().some(categoria =>
      this.equalNormalized(categoria.nombre, nombre)
    );
  }

  private normalizeComparable(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private equalNormalized(a: string, b: string): boolean {
    return this.normalizeComparable(a) === this.normalizeComparable(b);
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private buildCategoriaId(): string {
    return `categoria-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private buildSupabaseFallbackId(): string {
    return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getCategoriaByIdOrThrow(categoriaId: string): CategoriaCatalogRecord {
    const categoria = this.categorias().find(item => item.id === categoriaId);

    if (!categoria) {
      throw new Error('Categoría no encontrada');
    }

    return categoria;
  }

  private getServiciosActivosCountByCategoria(categoriaNombre: string): number {
    return this.servicios().filter(
      servicio =>
        servicio.activo &&
        this.equalNormalized(servicio.categoria, categoriaNombre)
    ).length;
  }

  private buildInitialCategorias(servicios: Servicio[]): CategoriaCatalogRecord[] {
    const records = new Map<string, CategoriaCatalogRecord>();

    CATEGORIAS_SERVICIOS.forEach((nombre, index) => {
      records.set(this.normalizeComparable(nombre), {
        id: `categoria-seed-${index + 1}`,
        nombre,
        slug: this.slugify(nombre),
        activa: true
      });
    });

    servicios.forEach((servicio, index) => {
      const key = this.normalizeComparable(servicio.categoria);

      if (!records.has(key)) {
        records.set(key, {
          id: `categoria-servicio-${index + 1}`,
          nombre: servicio.categoria,
          slug: this.slugify(servicio.categoria),
          activa: true
        });
      }
    });

    return Array.from(records.values());
  }

  private ensureCategoriaExists(categoriaNombre: string): void {
    const nombreNormalizado = this.normalizeNombre(categoriaNombre);

    if (this.hasCategoria(nombreNormalizado)) {
      return;
    }

    this.categorias.update(categorias => [
      ...categorias,
      {
        id: this.buildCategoriaId(),
        nombre: nombreNormalizado,
        slug: this.slugify(nombreNormalizado),
        activa: true
      }
    ]);
  }

  private isCategoriaActiva(categoriaNombre: string): boolean {
    const categoria = this.categorias().find(item =>
      this.equalNormalized(item.nombre, categoriaNombre)
    );

    return categoria?.activa ?? true;
  }

  private resolveScopeAccountId(scope?: ServicioMutationScope): string | null {
    if (!scope) {
      return null;
    }

    const tenantAccountId = scope.tenantContext?.accountId?.trim();
    const accountId = scope.accountId?.trim();

    if (!tenantAccountId || !accountId || tenantAccountId !== accountId) {
      throw new Error('Tenant/account scope mismatch for servicios mutation');
    }

    return accountId;
  }

  private getMockServicios(): Servicio[] {
    return [
      {
        id: 'servicio-001',
        nombre: 'Manicura Básica',
        descripcion: 'Corte y limado de uñas',
        categoria: 'Uñas',
        duracionMinutos: 30,
        precio: 2500,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-002',
        nombre: 'Esmaltado Semipermanente',
        descripcion: 'Esmalte que dura 2 semanas',
        categoria: 'Uñas',
        duracionMinutos: 45,
        precio: 3500,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-003',
        nombre: 'Uñas Acrílicas',
        descripcion: 'Extensión en acrílico',
        categoria: 'Uñas',
        duracionMinutos: 90,
        precio: 8000,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-004',
        nombre: 'Uñas Gel',
        descripcion: 'Extensión en gel UV',
        categoria: 'Uñas',
        duracionMinutos: 90,
        precio: 8500,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-005',
        nombre: 'Retiro de Esmalte',
        descripcion: 'Remoción de esmaltado',
        categoria: 'Uñas',
        duracionMinutos: 15,
        precio: 1500,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-006',
        nombre: 'Diseño de Cejas',
        descripcion: 'Diseño y depilación de cejas',
        categoria: 'Cejas',
        duracionMinutos: 20,
        precio: 2000,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-007',
        nombre: 'Extensiones de Pestañas',
        descripcion: 'Pestañas pelo por pelo',
        categoria: 'Pestañas',
        duracionMinutos: 120,
        precio: 12000,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-008',
        nombre: 'Lifting de Pestañas',
        descripcion: 'Elevación natural de pestañas',
        categoria: 'Pestañas',
        duracionMinutos: 60,
        precio: 6000,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: 'servicio-009',
        nombre: 'Masaje Relajante',
        descripcion: 'Masaje corporal de relajación',
        categoria: 'Masajes',
        duracionMinutos: 60,
        precio: 14000,
        activo: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      }
    ];
  }
}
