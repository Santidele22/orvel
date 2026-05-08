import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { manageBookingByToken } from '../../core/api/supabase-booking.api';

@Component({
  selector: 'app-manage-booking-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-booking.page.html'
})
export class ManageBookingPage implements OnInit {
  protected readonly loading = signal(true);
  protected readonly invalidToken = signal(false);
  protected readonly expiredToken = signal(false);
  protected readonly policyWindowClosed = signal(false);
  protected readonly canCancelOrReschedule = signal(false);
  protected readonly bookingId = signal('');

  constructor(private readonly route: ActivatedRoute) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!token) {
      this.invalidToken.set(true);
      this.loading.set(false);
      return;
    }

    const response = await manageBookingByToken({
      token,
      nowIso: new Date().toISOString()
    });

    if (response.data) {
      this.bookingId.set(response.data.bookingId);
      this.canCancelOrReschedule.set(response.data.canCancelOrReschedule);
      this.loading.set(false);
      return;
    }

    const code = response.error?.code;
    this.invalidToken.set(code === 'INVALID_TOKEN');
    this.expiredToken.set(code === 'TOKEN_EXPIRED');
    this.policyWindowClosed.set(code === 'POLICY_WINDOW_CLOSED');
    this.loading.set(false);
  }

  protected handleCancel(): void {
    this.canCancelOrReschedule.set(false);
  }

  protected handleReschedule(): void {
    this.canCancelOrReschedule.set(false);
  }
}
