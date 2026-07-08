import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Servicio } from '../../../models/servicio.model';
import { ServicioService } from '../data-access/servicio.service';
import {
  getSuggestedServicesForRubros,
  type SuggestedService
} from '../data-access/service-catalog-suggestions';
import { ThemeService } from '../../../core/theming/theme.service';
import {
  ORVEL_SECTION_PRIMITIVES,
  ORVEL_BADGE_TONE_CLASS,
  type OrvelBadgeTone
} from '../../../shared/dashboard-section-primitives/zen-section-primitives';
import { validateCreateCategory, validateCreateServicio } from './servicios.validation';
import {
  ONBOARDING_BUSINESS_TYPES_STORAGE_KEY,
  type BusinessTypeCode
} from '../../onboarding/data-access/onboarding-business-types-storage';

type CategoriaItem = {
  id: string;
  nombre: string;
  activa: boolean;
  serviciosCount: number;
};

const SAVE_SERVICE_ERROR_MESSAGE = 'No se pudo guardar el servicio. Intentá nuevamente en unos minutos.';
const DELETE_SERVICE_ERROR_MESSAGE = 'No se pudo eliminar el servicio. Intentá nuevamente en unos minutos.';

@Component({
  selector: 'app-servicios-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './servicios.page.html'
})
export class ServiciosPage {
  private readonly servicioService = inject(ServicioService);
  protected readonly themeService = inject(ThemeService);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly feedback = signal('');
  readonly activeModalType = signal<'categoria' | 'servicio' | null>(null);
  readonly searchQuery = signal('');
  readonly showModal = signal(false);
  readonly modalType = signal<'categoria' | 'servicio'>('servicio');
  readonly ui = ORVEL_SECTION_PRIMITIVES;
  categoryFieldErrors = signal<Record<string, string>>({});
  serviceFieldErrors = signal<Record<string, string>>({});
  
  readonly categorias = signal<CategoriaItem[]>([]);
  readonly servicios = signal<Servicio[]>([]);
  readonly selectedRubros = signal<BusinessTypeCode[]>([]);
  readonly deleteConfirmServiceId = signal<string | null>(null);
  
  // DB-FIX-003: Selected service ID to track which service is being edited/deleted
  readonly selectedServiceId = signal<string | null>(null);

  readonly deleteConfirmService = computed(() => {
    const serviceId = this.deleteConfirmServiceId();
    return serviceId ? this.servicios().find(service => service.id === serviceId) ?? null : null;
  });

  get isZen() { return this.themeService.activeTheme() === 'zen'; }

  readonly categoryForm = this.formBuilder.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(60)]]
  });

  readonly servicioForm = this.formBuilder.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(60)]],
    categoria: ['', [Validators.required]],
    duracionMinutos: [30, [Validators.min(5), Validators.max(480)]],
    precio: [0, [Validators.required, Validators.min(0)]],
    activo: [true]
  });

  readonly filteredCategorias = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    
    return this.categorias().filter(cat => {
       const matchesQuery = !query || cat.nombre.toLowerCase().includes(query);
       return matchesQuery;
    });
  });

  readonly filteredServicios = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();

    return this.servicios().filter(servicio => {
      if (!servicio.activo) {
        return false;
      }

      const matchesQuery = !query || 
        servicio.nombre.toLowerCase().includes(query) ||
        servicio.categoria.toLowerCase().includes(query);
      return matchesQuery;
    });
  });

  readonly groupedServicios = computed(() => {
    const badges: OrvelBadgeTone[] = ['primary', 'accent', 'neutral'];
    const grouped = new Map<string, Array<Servicio & { badge: string; tone: OrvelBadgeTone }>>();

    this.filteredServicios().forEach((servicio, index) => {
      const badge = index % 2 === 0 ? 'Popular' : 'Nuevo';
      const tone = badges[index % badges.length];
      const current = grouped.get(servicio.categoria) ?? [];
      current.push({ ...servicio, badge, tone });
      grouped.set(servicio.categoria, current);
    });

    return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));
  });

  readonly suggestedServices = computed(() => {
    const existingKeys = new Set(
      this.servicios()
        .filter((servicio) => servicio.activo)
        .map((servicio) => this.serviceSuggestionKey(servicio))
    );
    return getSuggestedServicesForRubros(this.selectedRubros()).filter(
      (suggestion) => !existingKeys.has(this.serviceSuggestionKey(suggestion))
    );
  });

  readonly shouldShowSuggestions = computed(() => this.suggestedServices().length > 0 && this.filteredServicios().length < 3);

  constructor() {
    void this.loadData();
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  openModal(type: 'categoria' | 'servicio', reset: boolean = true): void {
    this.activeModalType.set(type);
    this.modalType.set(type);
    this.feedback.set('');
    
    if (reset) {
      this.selectedServiceId.set(null);
      if (type === 'categoria') this.categoryForm.reset();
      else this.servicioForm.reset({ duracionMinutos: 30, precio: 0, activo: true, nombre: '', categoria: '' });
    }

    if (type === 'categoria') this.categoryFieldErrors.set({});
    else this.serviceFieldErrors.set({});
    
    this.showModal.set(true);
  }

  openSuggestedServicio(suggestion: SuggestedService): void {
    this.openModal('servicio');
    this.servicioForm.patchValue({
      nombre: suggestion.nombre,
      categoria: suggestion.categoria,
      duracionMinutos: suggestion.duracionMinutos,
      precio: suggestion.precio,
      activo: true
    });
  }

  closeModal(): void {
    this.showModal.set(false);
    this.activeModalType.set(null);
    this.selectedServiceId.set(null);
    this.feedback.set('');
  }

  cancelDeleteServicio(): void {
    this.deleteConfirmServiceId.set(null);
    this.selectedServiceId.set(null);
    this.feedback.set('');
  }

  badgeToneClass(tone: OrvelBadgeTone): string {
    return ORVEL_BADGE_TONE_CLASS[tone];
  }

  async onCreateCategory(): Promise<void> {
    const validation = validateCreateCategory(this.categoryForm.getRawValue());
    this.categoryFieldErrors.set(validation.fieldErrors);
    if (!validation.isValid) {
      this.feedback.set('Formulario inválido. Revisa los campos requeridos.');
      this.categoryForm.markAllAsTouched();
      return;
    }

    const nombre = this.categoryForm.controls.nombre.value.trim();

    try {
      this.servicioService.createCategoria({ nombre });
      this.categorias.set(this.servicioService.listCategorias());
      this.closeModal();
    } catch {
      this.feedback.set('La categoría ya existe.');
    }
  }

  async onSaveServicio(): Promise<void> {
    const validation = validateCreateServicio(this.servicioForm.getRawValue());
    this.serviceFieldErrors.set(validation.fieldErrors);
    if (!validation.isValid) {
      this.feedback.set('Formulario inválido. Revisa los campos requeridos.');
      this.servicioForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const val = this.servicioForm.getRawValue();
    const serviceId = this.selectedServiceId();

    try {
      if (serviceId) {
        // Mode: Edit
        await firstValueFrom(this.servicioService.update(serviceId, val as Partial<Servicio>));
      } else {
        // Mode: Create
        await firstValueFrom(this.servicioService.create(val as any));
      }
      
      this.servicios.set(this.servicioService.items());
      this.closeModal();
    } catch (error) {
      console.error('[Servicios] guardado fallido', error);
      this.feedback.set(SAVE_SERVICE_ERROR_MESSAGE);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.feedback.set('');
    try {
      await firstValueFrom(this.servicioService.getAll());
      this.servicios.set(this.servicioService.items());
    } catch (error) {
      console.error('[Servicios] carga fallida', error);
      this.feedback.set('No se pudieron cargar los servicios. El catálogo de categorías sigue disponible; podés reintentar en unos minutos.');
    } finally {
      this.selectedRubros.set(this.readSelectedRubrosDraft());
      this.categorias.set(this.servicioService.listCategorias());
      this.loading.set(false);
    }
  }

  private readSelectedRubrosDraft(): BusinessTypeCode[] {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ONBOARDING_BUSINESS_TYPES_STORAGE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? (parsed.filter((item) => typeof item === 'string') as BusinessTypeCode[]) : [];
    } catch {
      return [];
    }
  }

  private serviceSuggestionKey(service: Pick<Servicio, 'nombre' | 'categoria'>): string {
    return `${this.normalizeSuggestionComparable(service.nombre)}::${this.normalizeSuggestionComparable(service.categoria)}`;
  }

  private normalizeSuggestionComparable(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  // DB-FIX-003: Edit service - opens modal with selected service ID
  openEditServicio(serviceId: string): void {
    const service = this.servicios().find(s => s.id === serviceId);
    if (service) {
      this.selectedServiceId.set(serviceId);
      this.servicioForm.patchValue({
        nombre: service.nombre,
        categoria: service.categoria,
        duracionMinutos: service.duracionMinutos,
        precio: service.precio,
        activo: service.activo
      });
      // Open without reset
      this.openModal('servicio', false);
    }
  }

  openDeleteServicio(serviceId: string): void {
    this.selectedServiceId.set(serviceId);
    this.deleteConfirmServiceId.set(serviceId);
    this.feedback.set('');
  }

  // DB-FIX-003: Soft delete implementation for servicio
  async performDeleteServicio(serviceId: string): Promise<void> {
    try {
      await firstValueFrom(this.servicioService.update(serviceId, { activo: false } as Partial<Servicio>));
      this.servicios.set(this.servicioService.items());
      this.deleteConfirmServiceId.set(null);
      this.selectedServiceId.set(null);
    } catch (error) {
      throw error;
    }
  }

  async confirmDeleteServicio(serviceId: string = this.deleteConfirmServiceId() ?? ''): Promise<void> {
    if (!serviceId) return;

    try {
      await this.performDeleteServicio(serviceId);
    } catch (error) {
      console.error('[Servicios] eliminación fallida', error);
      this.feedback.set(DELETE_SERVICE_ERROR_MESSAGE);
    }
  }

  onDeleteServicio(serviceId: string): void {
    this.openDeleteServicio(serviceId);
  }

  deleteSelectedServicio(): void {
    const currentId = this.selectedServiceId();
    if (currentId) {
      void this.confirmDeleteServicio(currentId);
    }
  }
}
