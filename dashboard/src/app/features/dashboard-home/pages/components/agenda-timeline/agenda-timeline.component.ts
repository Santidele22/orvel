import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppointmentCardComponent } from '../appointment-card/appointment-card.component';
import { DashboardStructuralTokens, DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

export interface AppointmentData {
  hour: string;
  title: string;
  client: string;
  duration: string;
  staff: string;
  avatar: string;
  location: string;
  status: string;
  positionClasses: string;
  isHighlight?: boolean;
  isProgress?: boolean;
  endTime?: string;
  themeClasses?: string;
  statusClasses?: string;
}

@Component({
  selector: 'app-agenda-timeline',
  standalone: true,
  imports: [CommonModule, AppointmentCardComponent],
  template: `
    <div [class]="'flex-1 overflow-y-auto ' + structure.cardPadding + ' no-scrollbar relative'">
      @for (hour of timeline; track hour) {
        <div [class]="'relative flex items-stretch group ' + structure.timelineRowHeight">
          <!-- Hour Label -->
          <div class="w-zen-control-lg pt-zen-md pr-zen-xl text-right shrink-0 border-r border-border relative">
             <span class="zen-font-micro font-black text-text-tertiary/40 uppercase tracking-zen-wide group-hover:text-primary transition-colors">{{ hour }}</span>
             <!-- Small dot indicator -->
             <div class="absolute top-zen-lg -right-zen-xs w-zen-sm h-zen-sm rounded-full border-zen-icon-sm border-bg bg-surface-muted group-hover:bg-primary transition-all"></div>
          </div>

          <!-- Content Slot -->
          <div [class]="'flex-1 relative ' + structure.innerGap">
             @for (appt of getAppointmentsForHour(hour); track appt.title) {
                <app-appointment-card
                  class="h-full"
                  [title]="appt.title"
                  [client]="appt.client"
                  [duration]="appt.duration"
                  [staff]="appt.staff"

                  [avatar]="appt.avatar"
                  [location]="appt.location"
                  [status]="appt.status"
                  [positionClasses]="appt.positionClasses"
                  [isHighlight]="appt.isHighlight || false"
                  [isProgress]="appt.isProgress || false"
                  [endTime]="appt.endTime || ''"
                  [themeClasses]="appt.themeClasses || 'bg-surface border-l-zen-lg border-primary'"
                  [statusClasses]="appt.statusClasses || 'bg-surface-muted text-text-tertiary border-border'">
                </app-appointment-card>
             }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class AgendaTimelineComponent {
  protected readonly structure: DashboardStructuralTokens = DASHBOARD_STRUCTURAL_TOKENS;
  @Input() timeline: string[] = [];
  @Input() appointments: AppointmentData[] = [];

  getAppointmentsForHour(hour: string): AppointmentData[] {
    return this.appointments.filter(a => a.hour === hour);
  }
}
