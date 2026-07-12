import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  inject,
} from '@angular/core';
import { ConfiguracionTimePickerAmPmSectionComponent } from './modal/configuracion-time-picker-ampm-section.component';
import { ConfiguracionTimePickerConfirmActionComponent } from './modal/configuracion-time-picker-confirm-action.component';
import { ConfiguracionTimePickerHeaderComponent } from './modal/configuracion-time-picker-header.component';
import { ConfiguracionTimePickerHourSectionComponent } from './modal/configuracion-time-picker-hour-section.component';
import { ConfiguracionTimePickerMinuteSectionComponent } from './modal/configuracion-time-picker-minute-section.component';

@Component({
  selector: 'app-configuracion-time-modal',
  standalone: true,
  imports: [
    CommonModule,
    ConfiguracionTimePickerHeaderComponent,
    ConfiguracionTimePickerHourSectionComponent,
    ConfiguracionTimePickerMinuteSectionComponent,
    ConfiguracionTimePickerAmPmSectionComponent,
    ConfiguracionTimePickerConfirmActionComponent,
  ],
  templateUrl: './configuracion-time-picker-modal.component.tpl',
})
export class ConfiguracionTimePickerModalComponent implements AfterViewChecked, OnDestroy {
  @Input({ required: true }) ctx!: any;

  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyOpen = false;
  private focusBeforeOpen: HTMLElement | null = null;

  get isTimePickerOpen() {
    return this.ctx.isTimePickerOpen;
  }

  closeTimePicker(): void {
    this.ctx.closeTimePicker();
  }

  ngAfterViewChecked(): void {
    const isOpen = this.isTimePickerOpen() === true;

    if (isOpen && !this.previouslyOpen) {
      this.previouslyOpen = true;
      this.focusBeforeOpen = this.getFocusableActiveElement();
      queueMicrotask(() => this.focusInitialDialogElement());
      return;
    }

    if (!isOpen && this.previouslyOpen) {
      this.previouslyOpen = false;
      queueMicrotask(() => this.restoreFocusToTrigger());
    }
  }

  ngOnDestroy(): void {
    if (this.previouslyOpen) {
      this.restoreFocusToTrigger();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (this.isTimePickerOpen() !== true) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeTimePicker();
      return;
    }

    if (event.key === 'Tab') {
      this.keepFocusInsideDialog(event);
    }
  }

  handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      this.keepFocusInsideDialog(event);
    }
  }

  private focusInitialDialogElement(): void {
    const dialog = this.getDialogElement();
    if (!dialog || this.dialogContainsActiveElement(dialog)) {
      return;
    }

    dialog.focus({ preventScroll: true });
  }

  private keepFocusInsideDialog(event: KeyboardEvent): void {
    const dialog = this.getDialogElement();
    if (!dialog) {
      return;
    }

    const focusableElements = this.getFocusableDialogElements(dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (!this.dialogContainsActiveElement(dialog)) {
      event.preventDefault();
      firstFocusable.focus({ preventScroll: true });
      return;
    }

    if (event.shiftKey && activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus({ preventScroll: true });
    }
  }

  private restoreFocusToTrigger(): void {
    const trigger = this.focusBeforeOpen;
    this.focusBeforeOpen = null;

    if (!trigger?.isConnected) {
      return;
    }

    trigger.focus({ preventScroll: true });
  }

  private getDialogElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector<HTMLElement>(
      '[data-configuracion-time-picker-dialog]',
    );
  }

  private getFocusableActiveElement(): HTMLElement | null {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : null;
  }

  private dialogContainsActiveElement(dialog: HTMLElement): boolean {
    return document.activeElement instanceof Node && dialog.contains(document.activeElement);
  }

  private getFocusableDialogElements(dialog: HTMLElement): HTMLElement[] {
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null || element === document.activeElement);
  }
}
