import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getSupabaseAuthClient } from '../../../core/auth/route-protection';
import { AuthService } from '../../../services/auth.service';
import { createFreeAccountBusiness } from '../create-account-business.client';
import { InAppSignupWizard } from '../in-app-signup-wizard';

const AGENDA_ROUTE = '/dashboard/turnos';

@Component({
  selector: 'app-in-app-signup-wizard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="in-app-auth">
      <section class="in-app-auth__card" [class.in-app-auth__card--success]="wizard.step === 5">
        @if (wizard.showsStepChrome()) {
          <header class="in-app-auth__header">
            @if (wizard.canGoBack()) {
              <button type="button" class="in-app-auth__back" (click)="wizard.back()">Volver</button>
            } @else {
              <a routerLink="/auth/login" class="in-app-auth__back">Volver</a>
            }
            <div class="in-app-auth__dots" aria-label="Progreso">
              @for (dot of [1, 2, 3, 4]; track dot) {
                <span class="in-app-auth__dot" [class.is-active]="wizard.step === dot"></span>
              }
            </div>
          </header>
        }

        @if (wizard.step === 1) {
          <p class="in-app-auth__eyebrow">Paso 1</p>
          <h1>¿Cómo te llamás?</h1>
          <label class="in-app-auth__field">
            Tu nombre
            <input name="ownerName" [(ngModel)]="wizard.ownerName" />
          </label>
          <label class="in-app-auth__field">
            Nombre del negocio
            <input name="businessName" [(ngModel)]="wizard.businessName" />
          </label>
          <button type="button" class="in-app-auth__cta" [disabled]="!wizard.canContinue()" (click)="wizard.continue()">
            Continuar
          </button>
        }

        @if (wizard.step === 2) {
          <p class="in-app-auth__eyebrow">Paso 2</p>
          <h1>¿Qué rubro tenés?</h1>
          <p class="in-app-auth__lede">Elegí uno o más. El primero es el Principal.</p>
          <div class="in-app-auth__chips">
            @for (rubro of wizard.rubroCatalog(); track rubro.code) {
              <button
                type="button"
                class="in-app-auth__chip"
                [class.is-selected]="wizard.selectedRubros.includes(rubro.code)"
                (click)="wizard.toggleRubro(rubro.code)"
              >
                {{ rubro.label }}
                @if (wizard.principalRubro() === rubro.code) {
                  <span class="in-app-auth__chip-badge">Principal</span>
                }
              </button>
            }
          </div>
          <button type="button" class="in-app-auth__cta" [disabled]="!wizard.canContinue()" (click)="wizard.continue()">
            Continuar
          </button>
        }

        @if (wizard.step === 3) {
          <p class="in-app-auth__eyebrow">Paso 3</p>
          <h1>Creá tu acceso</h1>
          <label class="in-app-auth__field">
            Email
            <input
              type="email"
              name="email"
              autocomplete="username"
              [(ngModel)]="wizard.email"
              (input)="syncAccessField('email', $event)"
            />
          </label>
          <label class="in-app-auth__field">
            Contraseña
            <input
              type="password"
              name="password"
              autocomplete="new-password"
              [(ngModel)]="wizard.password"
              (input)="syncAccessField('password', $event)"
            />
          </label>
          <label class="in-app-auth__field">
            Confirmá la contraseña
            <input
              type="password"
              name="confirmPassword"
              autocomplete="new-password"
              [(ngModel)]="wizard.confirmPassword"
              (input)="syncAccessField('confirmPassword', $event)"
            />
          </label>
          @if (errorMessage()) {
            <p class="in-app-auth__error" role="alert">{{ errorMessage() }}</p>
          } @else if (wizard.accessError()) {
            <p class="in-app-auth__error" role="alert">{{ wizard.accessError() }}</p>
          }
          <button type="button" class="in-app-auth__cta" [disabled]="!wizard.canContinue() || submitting()" (click)="createAccount()">
            Crear cuenta
          </button>
        }

        @if (wizard.step === 4) {
          <p class="in-app-auth__step-pill">Paso 4 de 4</p>
          <h1>¿Qué plan querés?</h1>
          <p class="in-app-auth__lede">Arrancás gratis igual. Vos decidís cuándo sumar más.</p>
          <div class="in-app-auth__plans">
            <article class="in-app-auth__plan">
              <header class="in-app-auth__plan-head">
                <h2 class="in-app-auth__plan-title">Free</h2>
                <span class="in-app-auth__plan-badge in-app-auth__plan-badge--free">Activo ya</span>
              </header>
              <p class="in-app-auth__lede">Entrás ahora, sin pagar nada.</p>
              <ul class="in-app-auth__plan-list">
                <li>1 local</li>
                <li>1 rubro</li>
                <li>Sin pago, sin tarjeta</li>
              </ul>
              <button type="button" class="in-app-auth__cta in-app-auth__cta--light" (click)="chooseFree()">Empezar gratis</button>
            </article>
            <article class="in-app-auth__plan in-app-auth__plan--premium">
              <header class="in-app-auth__plan-head">
                <h2 class="in-app-auth__plan-title">Premium</h2>
                <span class="in-app-auth__plan-badge in-app-auth__plan-badge--premium">Pendiente</span>
              </header>
              <p class="in-app-auth__lede">Lo pedís, lo activamos nosotros.</p>
              <ul class="in-app-auth__plan-list">
                <li>Más rubros</li>
                <li>Agenda sin límites</li>
                <li>No se cobra ni se activa solo</li>
              </ul>
              <button type="button" class="in-app-auth__cta" (click)="requestPremium()">Pedir Premium y entrar</button>
            </article>
          </div>
        }

        @if (wizard.step === 5) {
          <p class="in-app-auth__success-badge" aria-hidden="true">✓</p>
          <h1>Ya estás adentro</h1>
          <p class="in-app-auth__lede">Tu negocio ya tiene agenda. Si pediste Premium, te avisamos cuando lo activemos.</p>
          <button type="button" class="in-app-auth__cta" (click)="enterAgenda()">Entrar a la agenda</button>
        }
      </section>
    </main>
  `,
  styles: `
    :host {
      display: block;
      position: fixed;
      inset: 0;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      background: #0A0A0A;
    }
    .in-app-auth {
      box-sizing: border-box;
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      background: #0A0A0A;
      color: #F1F5F9;
      font-family: Onest, var(--or-font-family);
    }
    .in-app-auth__card {
      width: min(100%, 40rem);
      padding: 32px;
      border: 1px solid #334155;
      border-radius: 24px;
      background: #121212;
    }
    .in-app-auth__card--success {
      border: 0;
      background: transparent;
      padding: 24px 8px;
      text-align: center;
    }
    .in-app-auth__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .in-app-auth__back {
      background: none;
      border: 0;
      color: #94A3B8;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .in-app-auth__dots { display: flex; gap: 8px; }
    .in-app-auth__dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #334155;
    }
    .in-app-auth__dot.is-active { background: #7C3AED; }
    .in-app-auth__eyebrow {
      margin: 0 0 12px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #A78BFA;
    }
    .in-app-auth__step-pill {
      display: inline-flex;
      align-items: center;
      margin: 0 0 16px;
      padding: 6px 12px;
      border-radius: 999px;
      background: #1e1b4b;
      color: #A78BFA;
      font-size: 12px;
      font-weight: 700;
    }
    h1 { margin: 0 0 16px; font-size: 28px; }
    .in-app-auth__lede { margin: 0 0 16px; color: #94A3B8; }
    .in-app-auth__field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #94A3B8;
    }
    .in-app-auth__field input {
      padding: 12px 16px;
      border: 1px solid #334155;
      border-radius: 12px;
      background: #0A0A0A;
      color: #F1F5F9;
      font-size: 16px;
      font-weight: 400;
      letter-spacing: normal;
      text-transform: none;
    }
    .in-app-auth__chips {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 24px;
    }
    .in-app-auth__plans {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .in-app-auth__chip, .in-app-auth__plan {
      padding: 12px 16px;
      border: 1px solid #334155;
      border-radius: 16px;
      background: #0A0A0A;
      color: #F1F5F9;
      text-align: left;
    }
    .in-app-auth__plan {
      padding: 24px;
      border-radius: 24px;
      background: #0A0A0A;
    }
    .in-app-auth__plan--premium {
      border-color: #4c1d95;
    }
    .in-app-auth__plan-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }
    .in-app-auth__plan-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    .in-app-auth__plan-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }
    .in-app-auth__plan-badge--free {
      background: #065f46;
      color: #6ee7b7;
    }
    .in-app-auth__plan-badge--premium {
      background: #2e1065;
      color: #A78BFA;
    }
    .in-app-auth__plan-list {
      margin: 0 0 20px;
      padding-left: 18px;
      color: #94A3B8;
    }
    .in-app-auth__plan-list li { margin-bottom: 6px; }
    .in-app-auth__chip {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .in-app-auth__chip-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: #7C3AED;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .in-app-auth__chip.is-selected {
      border-color: #7C3AED;
    }
    .in-app-auth__error { margin: 0 0 12px; color: #EF4444; font-weight: 600; }
    .in-app-auth__success-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      margin: 0 auto 20px;
      border-radius: 999px;
      background: #7C3AED;
      box-shadow: 0 0 0 8px rgba(167, 139, 250, 0.22);
      color: #F8F7FF;
      font-size: 32px;
      font-weight: 700;
    }
    .in-app-auth__cta {
      width: 100%;
      padding: 16px 32px;
      border: 0;
      border-radius: 999px;
      background: #7C3AED;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .in-app-auth__cta:hover { background: #6D28D9; }
    .in-app-auth__cta:disabled { opacity: 0.45; cursor: not-allowed; }
    .in-app-auth__cta--light {
      background: #F1F5F9;
      color: #0A0A0A;
    }
    .in-app-auth__cta--light:hover { background: #E2E8F0; }
    @media (max-width: 640px) {
      .in-app-auth__chips { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      .in-app-auth__cta, .in-app-auth__chip, .in-app-auth__dot { transition: none; }
    }
  `
})
export class InAppSignupWizardPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly wizard = new InAppSignupWizard();
  protected readonly errorMessage = signal('');
  protected readonly submitting = signal(false);

  protected syncAccessField(field: 'email' | 'password' | 'confirmPassword', event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.wizard[field] = value;
  }

  protected async createAccount(): Promise<void> {
    if (!this.wizard.canContinue() || this.submitting()) return;
    this.errorMessage.set('');
    this.submitting.set(true);
    try {
      const payload = this.wizard.buildCreateAccountPayload();
      const created = await createFreeAccountBusiness(payload);
      if (!created.ok) {
        this.errorMessage.set(created.message || 'No pudimos crear la cuenta.');
        return;
      }
      await firstValueFrom(this.auth.login({ email: payload.email, password: payload.password }));
      this.wizard.markAccountCreated();
    } catch {
      this.errorMessage.set('No pudimos crear la cuenta. Reintentá en unos segundos.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected chooseFree(): void {
    this.wizard.chooseFree();
    this.triggerSignupSuccessConfetti();
  }

  protected async requestPremium(): Promise<void> {
    this.wizard.requestPremium();
    this.triggerSignupSuccessConfetti();
    await getSupabaseAuthClient().updateUser({ data: this.wizard.premiumRequestMetadata() });
  }

  private triggerSignupSuccessConfetti(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion) {
      return;
    }

    void import('canvas-confetti')
      .then(({ default: confetti }) => {
        try {
          confetti({
            particleCount: 130,
            spread: 72,
            origin: { y: 0.64 },
            colors: ['#8b5cf6', '#a855f7', '#34d399', '#f8f7ff']
          });
        } catch {
          // Confetti is decorative only; signup success must never block on canvas support.
        }
      })
      .catch(() => {
        // Ignore loading issues for the optional celebration effect.
      });
  }

  protected enterAgenda(): void {
    void this.router.navigateByUrl(AGENDA_ROUTE);
  }
}
