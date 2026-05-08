import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Servicio } from '../../../models/servicio.model';
import { ServicioService } from '../../../services/servicio.service';
import { ThemeService } from '../../../core/theming/theme.service';
import {
  ORVEL_SECTION_PRIMITIVES,
  ORVEL_BADGE_TONE_CLASS,
  type OrvelBadgeTone
} from '../../../shared/dashboard-section-primitives/zen-section-primitives';
import { validateCreateCategory, validateCreateServicio } from './servicios.validation';

type CategoriaItem = {
  id: string;
  nombre: string;
  activa: boolean;
  serviciosCount: number;
};

const ZEN_CATEGORIES = ['Masajes', 'Tratamientos', 'Spa', 'Wellness', 'Cejas', 'Pestañas'];

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
  
  // DB-FIX-003: Selected service ID to track which service is being edited/deleted
  readonly selectedServiceId = signal<string | null>(null);

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

  closeModal(): void {
    this.showModal.set(false);
    this.activeModalType.set(null);
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
      this.feedback.set('Error al guardar: ' + (error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    await firstValueFrom(this.servicioService.getAll());
    this.servicios.set(this.servicioService.items());
    this.categorias.set(this.servicioService.listCategorias());
    this.loading.set(false);
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

  // DB-FIX-003: Delete service - soft delete (activo: false)
  async openDeleteServicio(serviceId: string): Promise<void> {
    this.selectedServiceId.set(serviceId);
    try {
      await this.performDeleteServicio(serviceId);
    } catch (error) {
      this.feedback.set('Error al eliminar: ' + (error as Error).message);
    }
  }

  // DB-FIX-003: Soft delete implementation for servicio
  async performDeleteServicio(serviceId: string): Promise<void> {
    try {
      await firstValueFrom(this.servicioService.update(serviceId, { activo: false } as Partial<Servicio>));
      this.servicios.set(this.servicioService.items());
    } catch (error) {
      throw error;
    }
  }

  // DB-FIX-003: Aliases for UI binding
  confirmDeleteServicio(serviceId: string): void {
    this.openDeleteServicio(serviceId);
  }

  onDeleteServicio(serviceId: string): void {
    this.openDeleteServicio(serviceId);
  }

  deleteSelectedServicio(): void {
    const currentId = this.selectedServiceId();
    if (currentId) {
      this.performDeleteServicio(currentId);
    }
  }
}
