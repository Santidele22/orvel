import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, inject, computed, signal } from '@angular/core';
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
export class DashboardSidebarComponent implements OnChanges {
  private readonly themeService = inject(ThemeService);
  private readonly templateInputVersion = signal(0);

  @Input() theme: string = 'zen';
  @Input() businessName: string = 'Mi negocio Orvel';
  @Input() dashboards: any[] = [];
  @Input() collapsed: boolean = false;
  @Output() themeChange = new EventEmitter<any>();
  @Output() logoutConfirm = new EventEmitter<void>();
  @Output() readonly collapseToggle = new EventEmitter<void>();

  protected readonly activeTemplate = this.themeService.activeTemplate;

  // New: Compute inputs for the dynamic component
  protected readonly templateInputs = computed(() => ({
    activeTheme: this.theme,
    dashboards: (this.templateInputVersion(), this.dashboards),
    businessName: this.businessName,
    collapsed: this.collapsed,
    onThemeChange: (theme: string) => this.selectTheme(theme),
    onToggleCollapse: () => this.collapseToggle.emit(),
    onLogout: () => this.openLogoutConfirmModal()
  }));

  protected readonly templateOutputs = computed(() => ({
    selectTheme: (theme: string) => this.selectTheme(theme)
  }));

  protected isEditProfileModalOpen = false;
  protected isLogoutConfirmModalOpen = false;

  ngOnChanges(_changes: SimpleChanges): void {
    this.templateInputVersion.update(version => version + 1);
  }

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
