/**
 * Signup Credentials Page Angular Component
 *
 * Angular wrapper that adds @Component decorator to SignupCredentialsPage class.
 * This file should only be imported by Angular (app.routes.ts).
 * For tests, import from signup-credentials.page.ts instead.
 */
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SignupCredentialsPage } from './signup-credentials.page';

/**
 * Angular Component for Credentials & Profile
 *
 * Step 2 of the onboarding flow - Credentials & Profile.
 */
@Component({
  selector: 'app-signup-credentials-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signup-credentials.page.html',
  styleUrl: './signup-credentials.page.scss'
})
export class SignupCredentialsPageComponent extends SignupCredentialsPage {
  private readonly router = inject(Router);

  constructor() {
    super();
    this.setRouter(this.router);
  }
}