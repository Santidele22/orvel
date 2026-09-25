<div class="space-y-3 rounded-2xl border border-white/10 bg-bg-primary/80 p-3 shadow-inner">
  <label for="configuracion-time-picker-minute" class="block text-center text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Minutos</label>
  <div class="flex flex-col items-center gap-2">
    <button type="button" (click)="ctx.selectedMinute.set(ctx.selectedMinute() >= 55 ? 0 : ctx.selectedMinute() + 5)" 
      aria-label="Aumentar minutos"
      class="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-bg-secondary text-text-secondary transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-95">
      <i class="ri-arrow-up-s-line"></i>
    </button>

    <input id="configuracion-time-picker-minute" #minInput type="number"
      [value]="ctx.selectedMinute()"
      (input)="m.value = (m.value === '' ? '' : (Number(m.value) > 59 ? '59' : (Number(m.value) < 0 && m.value !== '' ? '0' : m.value))); ctx.selectedMinute.set(m.value === '' ? 0 : Number(m.value))"
      (focus)="$any($event.target).select()"
      #m
      min="0" max="59"
      inputmode="numeric"
      aria-label="Minutos seleccionados"
      class="h-16 w-full rounded-xl border border-transparent bg-transparent p-0 text-center font-manrope text-5xl font-bold tabular-nums text-text-primary outline-none transition-all [appearance:textfield] focus:border-primary/50 focus:bg-bg-secondary focus:ring-2 focus:ring-primary/60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>

    <button type="button" (click)="ctx.selectedMinute.set(ctx.selectedMinute() <= 0 ? 55 : ctx.selectedMinute() - 5)" 
      aria-label="Disminuir minutos"
      class="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-bg-secondary text-text-secondary transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-95">
      <i class="ri-arrow-down-s-line"></i>
    </button>
  </div>
</div>
