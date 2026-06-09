import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { BillingSubscriptionPage } from './billing-subscription.page';

@Component({
  selector: 'app-billing-subscription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './billing-subscription.page.html',
  styleUrl: './billing-subscription.page.scss'
})
export class BillingSubscriptionComponent extends BillingSubscriptionPage implements OnInit {
  constructor() {
    super();
  }

  async ngOnInit(): Promise<void> {
    await this.startSubscription();
  }
}
