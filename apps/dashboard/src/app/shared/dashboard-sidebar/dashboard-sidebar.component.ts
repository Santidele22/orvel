import { Component, EventEmitter, Input, Output, inject, computed } from '@angular/core';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../core/theming/theme.service';

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NgComponentOutlet
  ],
  host: {
    class: 'block h-full'
  },
  templateUrl: './dashboard-sidebar.component.html',
  styleUrls: ['./dashboard-sidebar.component.scss']
})
export class DashboardSidebarComponent {
  private readonly themeService = inject(ThemeService);

  @Input() theme: string = 'zen';
  @Input() businessName: string = 'Atelier Zen';
  @Input() dashboards: any[] = [];
  @Output() themeChange = new EventEmitter<any>();
  @Output() logoutConfirm = new EventEmitter<void>();

  protected readonly activeTemplate = this.themeService.activeTemplate;

  // New: Compute inputs for the dynamic component
  protected readonly templateInputs = computed(() => ({
    activeTheme: this.theme,
    dashboards: this.dashboards,
    businessName: this.businessName,
    onThemeChange: (theme: string) => this.selectTheme(theme),
    onLogout: () => this.openLogoutConfirmModal()
  }));

  protected readonly templateOutputs = computed(() => ({
    selectTheme: (theme: string) => this.selectTheme(theme)
  }));

  protected isEditProfileModalOpen = false;
  protected isLogoutConfirmModalOpen = false;

  protected profileForm = {
    name: '',
    email: '',
    phone: '',
    avatar: ''
  };

  selectTheme(theme: string) {
    this.themeChange.emit(theme);
  }

  protected showBusinessSwitcher(): boolean {
    return this.dashboards.length > 1;
  }

  protected openEditProfileModal(): void {
    this.isEditProfileModalOpen = true;
  }

  protected closeEditProfileModal(): void {
    this.isEditProfileModalOpen = false;
  }

  protected saveProfile(): void {
    this.isEditProfileModalOpen = false;
  }

  protected openLogoutConfirmModal(): void {
    this.isLogoutConfirmModalOpen = true;
  }

  protected confirmLogout(): void {
    this.isLogoutConfirmModalOpen = false;
    this.logoutConfirm.emit();
  }

  protected cancelLogout(): void {
    this.isLogoutConfirmModalOpen = false;
  }
}
