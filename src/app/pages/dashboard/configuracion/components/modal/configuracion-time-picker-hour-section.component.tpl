<div class="space-y-3">
  <span class="text-[9px] font-bold text-(--text)/40 uppercase tracking-widest text-center block">Hora</span>
  <div class="flex flex-col items-center gap-2">
    <button type="button" (click)="ctx.selectedHour.set(ctx.selectedHour() >= 12 ? 1 : ctx.selectedHour() + 1)" 
      class="w-full py-3 border border-(--text)/5 hover:bg-(--primary)/10 text-(--text)/40 hover:text-(--primary) transition-all rounded-2xl">
      <i class="ri-arrow-up-s-line"></i>
    </button>

    <input #hourInput type="number"
      [value]="ctx.selectedHour()"
      (input)="h.value = (h.value === '' ? '' : (Number(h.value) > 12 ? '12' : (Number(h.value) < 1 && h.value !== '' ? '1' : h.value))); ctx.selectedHour.set(h.value === '' ? 1 : Number(h.value))"
      (focus)="$any($event.target).select()"
      #h
      min="1" max="12"
      class="w-full bg-transparent text-5xl font-black text-(--text) text-center tabular-nums p-0 border-none outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-manrope"/>

    <button type="button" (click)="ctx.selectedHour.set(ctx.selectedHour() <= 1 ? 12 : ctx.selectedHour() - 1)" 
      class="w-full py-3 border border-(--text)/5 hover:bg-(--primary)/10 text-(--text)/40 hover:text-(--primary) transition-all rounded-2xl">
      <i class="ri-arrow-down-s-line"></i>
    </button>
  </div>
</div>
