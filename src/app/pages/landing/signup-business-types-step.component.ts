/**
 * Signup Business Types Step Angular Component
 *
 * Angular wrapper that adds @Component decorator to SignupBusinessTypesStepPage class.
 * This file should only be imported by Angular (app.routes.ts).
 * For tests, import from signup-business-types-step.page.ts instead.
 */
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SignupBusinessTypesStepPage, createSupabaseOnboardingCompletionHandler } from './signup-business-types-step.page';

/**
 * Angular Component for Business Types Selection
 *
 * Step 3 of the onboarding flow - Business Types Selection.
 */
@Component({
  selector: 'app-signup-business-types-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signup-business-types-step.page.html',
  styleUrl: './signup-business-types-step.page.scss'
})
export class SignupBusinessTypesStepComponent extends SignupBusinessTypesStepPage {
  private readonly router = inject(Router);

  constructor() {
    super();
    this.setRouter(this.router);
    this.setOnboardingCompletionHandler(createSupabaseOnboardingCompletionHandler());
  }
}
