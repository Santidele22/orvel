<div class="space-y-3 rounded-2xl border border-white/10 bg-bg-primary/80 p-3 shadow-inner">
  <span id="configuracion-time-picker-period-label" class="block text-center text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Periodo</span>
  <div class="flex h-[calc(100%-1.5rem)] flex-col gap-2 pt-1" role="group" aria-labelledby="configuracion-time-picker-period-label">
    <button type="button" (click)="ctx.selectedAmPm.set('AM')"
      [attr.aria-pressed]="ctx.selectedAmPm() === 'AM'"
      [class]="ctx.selectedAmPm() === 'AM' ? 'border-primary bg-primary text-white shadow-lg shadow-primary/25' : 'border-white/10 bg-bg-secondary text-text-secondary hover:border-primary/40 hover:bg-primary/10 hover:text-primary-light'"
      class="flex min-h-14 flex-1 items-center justify-center rounded-xl border text-sm font-bold uppercase tracking-wider transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-95">
      <span>AM</span>
      @if (ctx.selectedAmPm() === 'AM') {
      <span class="sr-only"> seleccionado</span>
      }
    </button>
    <button type="button" (click)="ctx.selectedAmPm.set('PM')"
      [attr.aria-pressed]="ctx.selectedAmPm() === 'PM'"
      [class]="ctx.selectedAmPm() === 'PM' ? 'border-primary bg-primary text-white shadow-lg shadow-primary/25' : 'border-white/10 bg-bg-secondary text-text-secondary hover:border-primary/40 hover:bg-primary/10 hover:text-primary-light'"
      class="flex min-h-14 flex-1 items-center justify-center rounded-xl border text-sm font-bold uppercase tracking-wider transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-95">
      <span>PM</span>
      @if (ctx.selectedAmPm() === 'PM') {
      <span class="sr-only"> seleccionado</span>
      }
    </button>
  </div>
</div>
