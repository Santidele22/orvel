<div class="space-y-4">
  <span class="text-[10px] font-bold text-(--text)/40 uppercase tracking-widest text-center block">Periodo</span>
  <div class="flex flex-col gap-3 h-full pt-6">
    <button type="button" (click)="ctx.selectedAmPm.set('AM')"
      [class]="ctx.selectedAmPm() === 'AM' ? 'bg-[#006B54] text-white shadow-lg shadow-[#006B54]/20' : 'bg-(--text)/5 text-(--text)/40'"
      class="flex-1 py-4 font-black uppercase text-xs tracking-widest transition-all rounded-2xl">AM</button>
    <button type="button" (click)="ctx.selectedAmPm.set('PM')"
      [class]="ctx.selectedAmPm() === 'PM' ? 'bg-[#006B54] text-white shadow-lg shadow-[#006B54]/20' : 'bg-(--text)/5 text-(--text)/40'"
      class="flex-1 py-4 font-black uppercase text-xs tracking-widest transition-all rounded-2xl">PM</button>
  </div>
</div>
