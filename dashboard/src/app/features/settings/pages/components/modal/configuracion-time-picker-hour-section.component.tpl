<div class="space-y-3 rounded-2xl border border-white/10 bg-bg-primary/80 p-3 shadow-inner">
  <label for="configuracion-time-picker-hour" class="block text-center text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Hora</label>
  <div class="flex flex-col items-center gap-2">
    <button type="button" (click)="ctx.selectedHour.set(ctx.selectedHour() >= 12 ? 1 : ctx.selectedHour() + 1)" 
      aria-label="Aumentar hora"
      class="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-bg-secondary text-text-secondary transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-95">
      <i class="ri-arrow-up-s-line"></i>
    </button>

    <input id="configuracion-time-picker-hour" #hourInput type="number"
      [value]="ctx.selectedHour()"
      (input)="h.value = (h.value === '' ? '' : (Number(h.value) > 12 ? '12' : (Number(h.value) < 1 && h.value !== '' ? '1' : h.value))); ctx.selectedHour.set(h.value === '' ? 1 : Number(h.value))"
      (focus)="$any($event.target).select()"
      #h
      min="1" max="12"
      inputmode="numeric"
      aria-label="Hora seleccionada"
      class="h-16 w-full rounded-xl border border-transparent bg-transparent p-0 text-center font-manrope text-5xl font-bold tabular-nums text-text-primary outline-none transition-all [appearance:textfield] focus:border-primary/50 focus:bg-bg-secondary focus:ring-2 focus:ring-primary/60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>

    <button type="button" (click)="ctx.selectedHour.set(ctx.selectedHour() <= 1 ? 12 : ctx.selectedHour() - 1)" 
      aria-label="Disminuir hora"
      class="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-bg-secondary text-text-secondary transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-95">
      <i class="ri-arrow-down-s-line"></i>
    </button>
  </div>
</div>
