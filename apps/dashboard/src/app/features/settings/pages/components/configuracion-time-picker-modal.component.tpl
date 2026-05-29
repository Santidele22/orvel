@if (isTimePickerOpen() === true) {
<div class="fixed inset-0 z-[999] flex items-center justify-center p-6 backdrop-blur-md bg-black/10 animate-in fade-in duration-300">
  <div (click)="$event.stopPropagation()"
    class="bg-white border border-(--text)/10 w-full max-w-md p-10 space-y-12 shadow-2xl rounded-[40px] relative overflow-hidden"
    [class.font-manrope]="true">

    <app-configuracion-time-picker-header [ctx]="ctx"></app-configuracion-time-picker-header>

    <div class="grid grid-cols-3 gap-10 items-center py-6 relative z-10">
      <app-configuracion-time-picker-hour-section [ctx]="ctx"></app-configuracion-time-picker-hour-section>
      <app-configuracion-time-picker-minute-section [ctx]="ctx"></app-configuracion-time-picker-minute-section>
      <app-configuracion-time-picker-ampm-section [ctx]="ctx"></app-configuracion-time-picker-ampm-section>
    </div>

    <app-configuracion-time-picker-confirm-action [ctx]="ctx"></app-configuracion-time-picker-confirm-action>
  </div>
</div>
} @else {}
