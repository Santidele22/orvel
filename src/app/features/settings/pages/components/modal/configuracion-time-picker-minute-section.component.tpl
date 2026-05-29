<div class="space-y-3">
  <span class="text-[9px] font-bold text-(--text)/40 uppercase tracking-widest text-center block">Minutos</span>
  <div class="flex flex-col items-center gap-2">
    <button type="button" (click)="ctx.selectedMinute.set(ctx.selectedMinute() >= 55 ? 0 : ctx.selectedMinute() + 5)" 
      class="w-full py-3 border border-(--text)/5 hover:bg-(--primary)/10 text-(--text)/40 hover:text-(--primary) transition-all rounded-2xl">
      <i class="ri-arrow-up-s-line"></i>
    </button>

    <input #minInput type="number"
      [value]="ctx.selectedMinute()"
      (input)="m.value = (m.value === '' ? '' : (Number(m.value) > 59 ? '59' : (Number(m.value) < 0 && m.value !== '' ? '0' : m.value))); ctx.selectedMinute.set(m.value === '' ? 0 : Number(m.value))"
      (focus)="$any($event.target).select()"
      #m
      min="0" max="59"
      class="w-full bg-transparent text-5xl font-black text-(--text) text-center tabular-nums p-0 border-none outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-manrope"/>

    <button type="button" (click)="ctx.selectedMinute.set(ctx.selectedMinute() <= 0 ? 55 : ctx.selectedMinute() - 5)" 
      class="w-full py-3 border border-(--text)/5 hover:bg-(--primary)/10 text-(--text)/40 hover:text-(--primary) transition-all rounded-2xl">
      <i class="ri-arrow-down-s-line"></i>
    </button>
  </div>
</div>
