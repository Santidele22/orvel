<header class="relative z-10 flex items-start justify-between gap-4">
  <div class="space-y-2">
    <p class="text-[11px] font-semibold uppercase tracking-wider text-primary-light">Ajuste de horario</p>
    <h3 id="configuracion-time-picker-title" class="text-2xl font-bold tracking-tight text-text-primary">
      @if (ctx.editingField() === 'start' || ctx.editingField() === 'start2') {
        Hora de apertura
      } @else {
        Hora de cierre
      }
    </h3>
    <p id="configuracion-time-picker-description" class="max-w-xs text-sm leading-6 text-text-secondary">
      Ajustá la hora con los controles o escribí el valor exacto.
    </p>
  </div>
  <button type="button" (click)="ctx.closeTimePicker()"
    aria-label="Cerrar selector de horario"
    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-bg-primary text-text-secondary shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary active:scale-95">
    <i class="ri-close-line text-xl"></i>
  </button>
</header>
