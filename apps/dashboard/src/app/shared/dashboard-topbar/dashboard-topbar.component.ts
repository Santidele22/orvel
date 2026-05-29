import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardThemeName } from '../../core/theming/theme.tokens';
import { ThemeService } from '../../core/theming/theme.service';

@Component({
  selector: 'app-dashboard-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-topbar.component.html',
  styleUrl: './dashboard-topbar.component.scss'
})
export class DashboardTopbarComponent {
  private readonly themeService = inject(ThemeService);
  
  @Input({ required: true }) theme!: DashboardThemeName;
  @Input() dashboards: any[] = [];
  @Input() userName = 'User';
  @Input() userRole = 'Admin';
  @Input() userAvatar = '';
  @Output() readonly themeChange = new EventEmitter<DashboardThemeName>();

  protected readonly activeTemplate = this.themeService.activeTemplate;
  protected searchQuery: string = '';

  protected selectTheme(theme: DashboardThemeName): void {
    this.themeChange.emit(theme);
  }

  protected onSearch() {
    // Search logic here
  }

  protected openNewTurnoModal() {
    // Modal logic here
  }
}
