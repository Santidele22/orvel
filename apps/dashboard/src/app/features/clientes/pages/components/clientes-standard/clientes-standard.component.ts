import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-clientes-standard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="structure.pageViewport + ' bg-bg text-text-primary'">
      <div [class]="structure.twoColumnGrid">
        <main [class]="structure.mainColumn + ' space-y-zen-xxl'\" data-layout-section=\"main_agenda\">
          <header class=\"space-y-zen-sm\">
            <h1 class="text-4xl font-bold tracking-tight text-text-primary">Directorio de Clientes</h1>
            <p class="text-sm font-medium text-text-secondary">Gestiona y organiza tu base de datos de clientes de forma sencilla.</p>
          </header>

          <div class="flex flex-col md:flex-row gap-zen-lg">
            <div class="relative flex-1">
              <span class="absolute left-zen-lg top-zen-sm text-text-tertiary">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                type="search"
                [value]="searchQuery()"
                (input)="search.emit($any($event.target).value)"
                class="h-zen-control-lg w-full rounded-zen-xl border border-border bg-surface pl-zen-section pr-zen-lg text-sm focus:outline-none focus:ring-primary transition-all shadow-sm"
                placeholder="Nombre, teléfono o correo electrónico..."
              />
            </div>
            <button (click)="openModal.emit()" class="h-zen-control-lg rounded-zen-xl bg-primary px-zen-xxl text-sm font-bold text-white shadow-sm hover:brightness-110 active:scale-95 transition-all">
              Añadir Cliente
            </button>
          </div>

          @if (loading()) {
            <div data-testid="clientes-loading-skeleton" role="status" class="animate-pulse grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-zen-xl">
              <article data-testid="clientes-skeleton-row" class="rounded-zen-xl border border-border bg-surface p-zen-xl flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-surface-muted/50 shrink-0"></div>
                <div class="space-y-2 min-w-0 flex-1">
                  <div class="h-4 w-32 bg-surface-muted/50 rounded-zen-md"></div>
                  <div class="h-3 w-24 bg-surface-muted/50 rounded-zen-md"></div>
                </div>
              </article>
              <article data-testid="clientes-skeleton-row" class="rounded-zen-xl border border-border bg-surface p-zen-xl flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-surface-muted/50 shrink-0"></div>
                <div class="space-y-2 min-w-0 flex-1">
                  <div class="h-4 w-28 bg-surface-muted/50 rounded-zen-md"></div>
                  <div class="h-3 w-20 bg-surface-muted/50 rounded-zen-md"></div>
                </div>
              </article>
              <article data-testid="clientes-skeleton-row" class="rounded-zen-xl border border-border bg-surface p-zen-xl flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-surface-muted/50 shrink-0"></div>
                <div class="space-y-2 min-w-0 flex-1">
                  <div class="h-4 w-36 bg-surface-muted/50 rounded-zen-md"></div>
                  <div class="h-3 w-28 bg-surface-muted/50 rounded-zen-md"></div>
                </div>
              </article>
            </div>
          } @else {
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-zen-xl">
              @for (cliente of filteredClients(); track cliente.id) {
                <article 
                  (click)="startEdit.emit(cliente)"
                  class="group cursor-pointer rounded-zen-xl border border-border bg-surface p-zen-xl transition-all hover:shadow-sm hover:border-primary">
                  <div class="flex flex-col gap-zen-lg">
                    <div class="w-zen-icon-lg h-zen-icon-lg rounded-zen-xl bg-primary-soft text-primary flex items-center justify-center text-xl font-bold group-hover:bg-primary group-hover:text-white transition-all">
                      {{ cliente.fullName.charAt(0) | uppercase }}
                    </div>
                    <div class="space-y-zen-xs">
                      <h3 class="text-lg font-bold text-text-primary leading-tight">{{ cliente.fullName | titlecase }}</h3>
                      <p class="text-sm font-medium text-text-tertiary">{{ cliente.telefono }}</p>
                    </div>
                    @if (cliente.email) {
                      <div class="pt-zen-lg border-t border-border mt-zen-sm overflow-hidden overflow-ellipsis whitespace-nowrap text-xs font-medium text-text-tertiary">
                        {{ cliente.email }}
                      </div>
                    }
                  </div>
                </article>
              } @empty {
                <div class="col-span-full py-zen-section text-center rounded-zen-card border-2 border-dashed border-border bg-surface-muted">
                  <p class="text-sm font-medium text-text-tertiary">No hay clientes que coincidan con la búsqueda.</p>
                </div>
              }
            </div>
          }
        </main>

        <aside [class]="structure.asideColumn + ' space-y-zen-xl'\" data-layout-section=\"right_panel\">
          <div class=\"sticky top-zen-xl space-y-zen-xl\">
            <div class=\"rounded-zen-card bg-primary p-zen-xxl text-white shadow-sm\">
              <h3 class=\"text-xs font-black uppercase tracking-widest opacity-80\">Total de Clientes</h3>
              <div class=\"mt-zen-lg flex items-baseline gap-zen-sm\">
                <span class="text-6xl font-bold tracking-tighter">{{ clients().length }}</span>
                <span class="text-sm font-bold opacity-70">fichas activas</span>
              </div>
            </div>

            <div class="rounded-zen-card border border-border bg-surface p-zen-xxl shadow-sm">
              <h3 class="text-sm font-bold text-text-primary">Gestión Rápida</h3>
              <p class="mt-zen-sm text-xs font-medium text-text-secondary leading-relaxed">
                Haga clic en la tarjeta de un cliente para editar su información personal o historial de servicios.
              </p>
              <button (click)="openModal.emit()" class="mt-zen-xl w-full h-zen-control-lg rounded-zen-xl border border-primary text-primary text-xs font-bold hover:bg-primary hover:text-white transition-all">
                Crear Nuevo Registro
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `
})
export class ClientesStandardComponent {
  clients = input<any[]>([]);
  filteredClients = input<any[]>([]);
  searchQuery = input<string>('');
  loading = input<boolean>(false);

  search = output<string>();
  openModal = output<void>();
  startEdit = output<any>();

  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;
}
