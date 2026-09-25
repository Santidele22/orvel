import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { BillingSubscriptionPage } from './billing-subscription.page';

@Component({
  selector: 'app-billing-subscription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './billing-subscription.page.html',
  styleUrl: './billing-subscription.page.scss'
})
export class BillingSubscriptionComponent extends BillingSubscriptionPage implements OnInit {
  readonly aliasCopied = signal(false);

  constructor(route: ActivatedRoute) {
    super({
      mode: route.snapshot.routeConfig?.path === 'billing/subscription/cancel' ? 'cancellation' : 'activation'
    });
  }

  async ngOnInit(): Promise<void> {
    await this.initialize();
  }

  override async copyAlias(): Promise<boolean> {
    const copied = await super.copyAlias();
    if (copied) {
      this.aliasCopied.set(true);
    }
    return copied;
  }
}
