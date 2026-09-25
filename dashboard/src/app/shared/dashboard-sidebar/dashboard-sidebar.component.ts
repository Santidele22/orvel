import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ZenSidebarComponent } from './templates/zen-sidebar.component';

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ZenSidebarComponent
  ],
  host: {
    class: 'h-full'
  },
  templateUrl: './dashboard-sidebar.component.html',
  styleUrls: ['./dashboard-sidebar.component.scss']
})
export class DashboardSidebarComponent {
  @Input() theme: string = 'zen';
  @Input() businessName: string = 'Mi negocio Orvel';
  @Input() dashboards: any[] = [];
  @Input() collapsed: boolean = false;
  @Output() themeChange = new EventEmitter<any>();
  @Output() logoutConfirm = new EventEmitter<void>();
  @Output() readonly collapseToggle = new EventEmitter<void>();

  protected readonly isLogoutConfirmModalOpen = signal(false);

  protected readonly onThemeChangeBound = (theme: string) => this.selectTheme(theme);
  protected readonly onToggleCollapseBound = () => this.collapseToggle.emit();
  protected readonly onLogoutBound = () => this.openLogoutConfirmModal();

  selectTheme(theme: string) {
    this.themeChange.emit(theme);
  }

  protected openLogoutConfirmModal(): void {
    this.isLogoutConfirmModalOpen.set(true);
  }

  protected confirmLogout(): void {
    this.isLogoutConfirmModalOpen.set(false);
    this.logoutConfirm.emit();
  }

  protected cancelLogout(): void {
    this.isLogoutConfirmModalOpen.set(false);
  }
}
