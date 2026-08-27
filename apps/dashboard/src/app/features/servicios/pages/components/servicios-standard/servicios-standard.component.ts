import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Servicio } from '../../../../../models/servicio.model';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-servicios-standard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section [class]="structure.pageRoot + ' bg-bg text-text-primary'" data-testid="servicios-responsive-container">
      <div [class]="'flex-1 overflow-y-auto h-full no-scrollbar ' + structure.containerPadding">
        <div class="grid grid-cols-12" [class]="structure.containerGap">
          <main class="col-span-12 lg:col-span-8 flex flex-col" [class]="structure.innerGap" data-layout-section="main_agenda">
            <header class="flex flex-col gap-zen-sm border-b border-text-primary/10 pb-zen-lg">
              <h1 class="text-3xl font-black text-text-primary uppercase tracking-zen-tight" [style.fontFamily]="'var(--heading-font)'">Servicios</h1>
              <p class="text-sm font-medium text-text-secondary opacity-80">Gestión de categorías y servicios.</p>
            </header>

            <div class="flex flex-col md:flex-row gap-zen-md">
              <input
                type="search"
                [value]="searchQuery()"
                (input)="handleSearch($event)"
                class="h-zen-control-md w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-md text-sm font-medium focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all font-body"
                placeholder="Filtrar por nombre"
              />
              <div class="flex gap-zen-sm">
                <button (click)="openModal.emit('categoria')" class="h-zen-control-md rounded-zen-xl border border-text-primary/10 px-zen-lg text-xs font-black uppercase tracking-zen-wide hover:bg-text-primary/5 transition-all">Categoría</button>
                <button (click)="openModal.emit('servicio')" class="h-zen-control-md rounded-zen-xl bg-primary px-zen-lg text-xs font-black uppercase tracking-zen-wide text-white shadow-md shadow-primary/20 hover:opacity-90 active:scale-95 transition-all">Nuevo</button>
              </div>
            </div>

            @if (loading()) {
              <div data-testid="servicios-loading-skeleton" role="status" class="animate-pulse space-y-3">
                <div data-testid="servicios-skeleton-card" class="h-20 bg-surface-muted/50 rounded-zen-md"></div>
                <div data-testid="servicios-skeleton-card" class="h-20 bg-surface-muted/50 rounded-zen-md"></div>
                <div data-testid="servicios-skeleton-card" class="h-20 bg-surface-muted/50 rounded-zen-md"></div>
              </div>
            } @else {
              <div class="flex flex-col gap-zen-md">
                @for (s of filteredServicios(); track s.id) {
                  <article class="rounded-zen-card border border-text-primary/10 bg-surface p-zen-lg hover:border-primary/50 hover:shadow-sm transition-all group">
                    <div class="flex items-center justify-between gap-zen-lg">
                      <div>
                        <h3 class="text-base font-semibold">{{ s.nombre }}</h3>
                        <p class="text-sm opacity-70">{{ s.categoria }} · {{ s.duracionMinutos }} min</p>
                      </div>
                      <p class="text-lg font-black">{{ '$' }}{{ s.precio }}</p>
                    </div>
                  </article>
                } @empty {
                  <div class="text-center py-(--zen-space-section) opacity-50">
                    No se encontraron servicios que coincidan con la búsqueda.
                  </div>
                }
              </div>
            }
          </main>

          <aside class="col-span-12 lg:col-span-4 flex flex-col gap-zen-lg" data-layout-section="right_panel">
            <article class="rounded-zen-card border border-text-primary/10 bg-surface p-zen-lg flex flex-col gap-zen-sm">
              <h2 class="zen-font-micro font-black uppercase tracking-zen-wide text-primary">Resumen</h2>
              <p class="text-sm font-medium text-text-secondary">Total servicios: <span class="font-black text-text-primary">{{ servicios().length }}</span></p>
            </article>
          </aside>
        </div>
      </div>
    </section>
  `
})
export class ServiciosStandardComponent {
  loading = input<boolean>(false);
  servicios = input<Servicio[]>([]);
  filteredServicios = input<Servicio[]>([]);
  searchQuery = input<string>('');
  
  onSearch = output<string>();
  openModal = output<'categoria' | 'servicio'>();

  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;

  handleSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.onSearch.emit(value);
  }
}
