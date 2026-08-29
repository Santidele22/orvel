import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { sanitizeReturnTo } from '../../../core/auth/route-protection';
import { AuthService } from '../../../services/auth.service';

const DEFAULT_RETURN_TO = '/dashboard/turnos';

@Component({
  selector: 'app-in-app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="in-app-auth">
      <section class="in-app-auth__card">
        <p class="in-app-auth__eyebrow">Orvel</p>
        <h1>Ingresá</h1>
        <p class="in-app-auth__lede">Estás en la app. Entrá con tu cuenta.</p>
        <form class="in-app-auth__form" (ngSubmit)="submit()">
          <label class="in-app-auth__field">
            Email
            <input type="email" name="email" autocomplete="username" [(ngModel)]="email" required />
          </label>
          <label class="in-app-auth__field">
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
            <p class="in-app-auth__error" role="alert">{{ errorMessage() }}</p>
          }
          <button type="submit" class="in-app-auth__cta" [disabled]="submitting()">Entrar</button>
        </form>
        <p class="in-app-auth__footer">
          ¿No tenés cuenta?
          <a routerLink="/dashboard/auth/signup">Creá tu alta</a>
        </p>
      </section>
    </main>
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
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
      width: min(100%, 28rem);
      padding: 32px;
      border: 1px solid #334155;
      border-radius: 24px;
      background: #121212;
    }
    .in-app-auth__eyebrow {
      margin: 0 0 12px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #A78BFA;
    }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .in-app-auth__lede { margin: 0 0 24px; color: #94A3B8; }
    .in-app-auth__form { display: flex; flex-direction: column; gap: 16px; }
    .in-app-auth__field {
      display: flex;
      flex-direction: column;
      gap: 8px;
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
    .in-app-auth__error { margin: 0; color: #EF4444; font-weight: 600; }
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
    .in-app-auth__cta:disabled { opacity: 0.7; cursor: wait; }
    .in-app-auth__footer { margin: 24px 0 0; color: #94A3B8; }
    .in-app-auth__footer a { color: #A78BFA; font-weight: 700; }
    @media (prefers-reduced-motion: reduce) {
      .in-app-auth__cta { transition: none; }
    }
  `
})
export class InAppLoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected email = '';
  protected password = '';
  protected readonly errorMessage = signal('');
  protected readonly submitting = signal(false);

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
      }
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
