<header class="flex justify-between items-start relative z-10">
  <div class="space-y-0.5">
    <p class="text-[10px] font-bold uppercase tracking-widest text-(--text)/40">Ajuste de Horario</p>
    <h3 class="text-2xl font-black tracking-tight text-(--text)">
      @if (ctx.editingField() === 'start') {
        Hora de Apertura
      } @else {
        Hora de Cierre
      }
    </h3>
  </div>
  <button type="button" (click)="ctx.closeTimePicker()"
    class="w-10 h-10 rounded-xl border border-(--text)/5 flex items-center justify-center text-(--text)/40 hover:text-(--text) hover:bg-(--text)/5 transition-all">
    <i class="ri-close-line text-xl"></i>
  </button>
</header>
