import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { BillingCheckoutPage } from './billing-checkout.page';

@Component({
  selector: 'app-billing-checkout',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './billing-checkout.page.html',
  styleUrl: './billing-checkout.page.scss'
})
export class BillingCheckoutComponent extends BillingCheckoutPage implements OnInit {
  constructor() {
    super();
  }

  async ngOnInit(): Promise<void> {
    await this.startCheckout();
  }
}
