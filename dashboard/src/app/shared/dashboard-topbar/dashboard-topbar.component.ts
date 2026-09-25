import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardThemeName } from '../../core/theming/theme.tokens';
import { ZenTopbarComponent } from './templates/zen-topbar.component';

@Component({
  selector: 'app-dashboard-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule, ZenTopbarComponent],
  templateUrl: './dashboard-topbar.component.html',
  styleUrl: './dashboard-topbar.component.scss'
})
export class DashboardTopbarComponent {
  @Input({ required: true }) theme!: DashboardThemeName;
  @Input() dashboards: any[] = [];
  @Input() userName = 'User';
  @Input() userRole = 'Admin';
  @Input() userAvatar = '';
  @Input() onLogout: () => Promise<void> = async () => { };
  @Output() readonly themeChange = new EventEmitter<DashboardThemeName>();

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
