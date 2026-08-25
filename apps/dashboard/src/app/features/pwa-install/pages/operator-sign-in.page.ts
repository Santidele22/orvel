import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { buildLandingSignupRedirect, sanitizeReturnTo } from '../../../core/auth/route-protection';
import { AuthService } from '../../../services/auth.service';

const DEFAULT_RETURN_TO = '/dashboard/turnos';

@Component({
  selector: 'app-operator-sign-in-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="operator-sign-in">
      <img
        class="operator-sign-in__logo"
        src="/dashboard/icons/icon-192x192.png"
        width="96"
        height="96"
        alt="Orvel"
      />
      <h1>Ingresá</h1>
      <p>Estás en la app. Entrá con tu cuenta.</p>
      <form class="operator-sign-in__form" (ngSubmit)="submit()">
        <label class="operator-sign-in__field">
          Email
          <input
            type="email"
            name="email"
            autocomplete="username"
            [(ngModel)]="email"
            required
          />
        </label>
        <label class="operator-sign-in__field">
          Contraseña
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            [(ngModel)]="password"
            required
          />
        </label>
        @if (errorMessage()) {
          <p class="operator-sign-in__error" role="alert">{{ errorMessage() }}</p>
        }
        <button type="submit" class="operator-sign-in__cta" [disabled]="submitting()">
          Ingresar
        </button>
      </form>
      <a class="operator-sign-in__signup" [href]="signupHref">Crear cuenta</a>
    </main>
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
    .operator-sign-in {
      box-sizing: border-box;
      min-height: 100%;
      padding: 48px 24px;
      text-align: center;
      background: var(--or-bg-primary);
      color: var(--or-text-primary);
      font-family: var(--or-font-family);
    }
    .operator-sign-in__logo {
      display: block;
      width: 96px;
      height: 96px;
      margin: 0 auto 24px;
      border-radius: 24px;
    }
    h1 { margin: 0 0 16px; font-size: var(--or-font-h2); }
    p { max-width: 28rem; margin: 0 auto 24px; color: var(--or-text-secondary); }
    .operator-sign-in__form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 22rem;
      margin: 0 auto 24px;
      text-align: left;
    }
    .operator-sign-in__field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: var(--or-text-primary);
      font-weight: 600;
    }
    .operator-sign-in__field input {
      padding: 12px 16px;
      border: 1px solid var(--or-border);
      border-radius: 12px;
      background: var(--or-bg-secondary);
      color: var(--or-text-primary);
      font-weight: 400;
    }
    .operator-sign-in__error {
      margin: 0;
      color: var(--or-danger, #b42318);
      font-weight: 600;
    }
    .operator-sign-in__cta {
      padding: 16px 32px;
      border: 0;
      border-radius: 999px;
      background: var(--or-primary);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .operator-sign-in__cta:disabled {
      opacity: 0.7;
      cursor: wait;
    }
    .operator-sign-in__signup {
      color: var(--or-primary);
      font-weight: 700;
    }
  `,
})
export class OperatorSignInPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected email = '';
  protected password = '';
  protected readonly errorMessage = signal('');
  protected readonly submitting = signal(false);
  protected readonly signupHref = buildLandingSignupRedirect();

  ngOnInit(): void {
    if (this.auth.authenticated() || this.auth.isLogged()) {
      void this.router.navigateByUrl(this.resolveReturnTo());
    }
  }

  protected submit(): void {
    this.errorMessage.set('');
    this.submitting.set(true);
    this.auth.login({ email: this.email.trim(), password: this.password }).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl(this.resolveReturnTo());
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Credenciales inválidas. Revisá email y contraseña.');
      },
    });
  }

  private resolveReturnTo(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnTo');
    const safe = sanitizeReturnTo(raw || DEFAULT_RETURN_TO);
    if (safe === '/auth' || safe.startsWith('/auth/')) {
      return DEFAULT_RETURN_TO;
    }
    return safe;
  }
}
