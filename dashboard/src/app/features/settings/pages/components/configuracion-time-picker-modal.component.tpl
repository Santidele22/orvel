@if (isTimePickerOpen() === true) {
<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200 md:p-6">
  <div (click)="$event.stopPropagation()"
    (keydown)="handleDialogKeydown($event)"
    data-configuracion-time-picker-dialog
    role="dialog"
    aria-modal="true"
    aria-labelledby="configuracion-time-picker-title"
    aria-describedby="configuracion-time-picker-description"
    tabindex="-1"
    class="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-bg-secondary p-6 text-text-primary shadow-2xl shadow-black/40 ring-1 ring-primary/10 md:p-8"
    [class.font-manrope]="true">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"></div>

    <app-configuracion-time-picker-header [ctx]="ctx"></app-configuracion-time-picker-header>

    <div class="relative z-10 grid grid-cols-3 items-stretch gap-3 py-6 md:gap-4">
      <app-configuracion-time-picker-hour-section [ctx]="ctx"></app-configuracion-time-picker-hour-section>
      <app-configuracion-time-picker-minute-section [ctx]="ctx"></app-configuracion-time-picker-minute-section>
      <app-configuracion-time-picker-ampm-section [ctx]="ctx"></app-configuracion-time-picker-ampm-section>
    </div>

    <app-configuracion-time-picker-confirm-action [ctx]="ctx"></app-configuracion-time-picker-confirm-action>
  </div>
</div>
} @else {}
