/**
 * Signup Plan Step Page Angular Component
 *
 * Angular wrapper that adds @Component decorator to SignupPlanStepPage class.
 * This file should only be imported by Angular (app.routes.ts).
 * For tests, import from signup-plan-step.page.ts instead.
 */
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SignupPlanStepPage } from './signup-plan-step.page';

/**
 * Angular Component for Plan Selection
 *
 * Step 1 of the onboarding flow - Plan Selection.
 */
@Component({
  selector: 'app-signup-plan-step-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signup-plan-step.page.html',
  styleUrl: './signup-plan-step.page.scss'
})
export class SignupPlanStepPageComponent extends SignupPlanStepPage {
  private readonly router = inject(Router);

  constructor() {
    super();
    this.setRouter(this.router);
  }
}