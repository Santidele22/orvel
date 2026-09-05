import { getRuntimeReferenceCatalogSnapshot } from '../../core/catalog/reference-catalog.gateway';

export type SignupWizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export type SignupRubroOption = {
  code: string;
  label: string;
};

export type CreateAccountBusinessPayload = {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  negocioNombre: string;
  rubro: string;
  selected_business_types: string[];
  plan: 'FREE';
};

const MIN_PASSWORD_LENGTH = 8;

export class InAppSignupWizard {
  step: SignupWizardStep = 1;
  ownerName = '';
  ownerLastName = '';
  businessName = '';
  selectedRubros: string[] = [];
  email = '';
  password = '';
  confirmPassword = '';
  createdFree = false;
  premiumRequested = false;

  rubroCatalog(): SignupRubroOption[] {
    return getRuntimeReferenceCatalogSnapshot().businessTypes.map(item => ({
      code: item.code,
      label: item.label
    }));
  }

  principalRubro(): string | null {
    return this.selectedRubros[0] ?? null;
  }

  toggleRubro(code: string): void {
    if (this.selectedRubros.length === 1 && this.selectedRubros[0] === code) {
      this.selectedRubros = [];
      return;
    }
    this.selectedRubros = [code];
  }

  canContinue(): boolean {
    if (this.step === 1) {
      return (
        this.ownerName.trim().length > 0 &&
        this.ownerLastName.trim().length > 0 &&
        this.businessName.trim().length > 0
      );
    }
    if (this.step === 2) {
      return this.selectedRubros.length === 1;
    }
    if (this.step === 3) {
      return this.canCreateAccess();
    }
    return false;
  }

  canCreateAccess(): boolean {
    return (
      this.email.trim().length > 0 &&
      this.password.length >= MIN_PASSWORD_LENGTH &&
      this.password === this.confirmPassword
    );
  }

  accessError(): string {
    if (!this.email.trim() && !this.password && !this.confirmPassword) {
      return '';
    }
    if (!this.email.trim()) {
      return 'Ingresá tu email.';
    }
    if (this.password.length > 0 && this.password.length < MIN_PASSWORD_LENGTH) {
      return 'Mínimo 8 caracteres.';
    }
    if (this.confirmPassword.length > 0 && this.password !== this.confirmPassword) {
      return 'Las contraseñas no coinciden.';
    }
    if (this.password.length < MIN_PASSWORD_LENGTH || this.confirmPassword.length === 0) {
      return 'Completá y confirmá la contraseña (mínimo 8).';
    }
    return '';
  }

  continue(): void {
    if (!this.canContinue()) return;
    if (this.step === 1) this.step = 2;
    else if (this.step === 2) this.step = 3;
  }

  back(): void {
    if (!this.canGoBack()) return;
    if (this.step === 2) this.step = 1;
    else if (this.step === 3) this.step = 2;
    else if (this.step === 4) this.step = 3;
    else if (this.step === 6) this.step = 4;
  }

  canGoBack(): boolean {
    return this.step === 2 || this.step === 3 || this.step === 4 || this.step === 6;
  }

  showsStepChrome(): boolean {
    return this.step !== 5;
  }

  buildCreateAccountPayload(): CreateAccountBusinessPayload {
    return {
      email: this.email.trim().toLowerCase(),
      password: this.password,
      nombre: this.ownerName.trim(),
      apellido: this.ownerLastName.trim(),
      negocioNombre: this.businessName.trim(),
      rubro: this.principalRubro() ?? '',
      selected_business_types: [...this.selectedRubros],
      plan: 'FREE'
    };
  }

  markAccountCreated(): void {
    this.createdFree = true;
    this.step = 4;
  }

  chooseFree(): void {
    this.premiumRequested = false;
    this.step = 5;
  }

  startPremiumTrial(): void {
    this.premiumRequested = true;
    this.step = 5;
  }

  requestPremium(): void {
    this.premiumRequested = true;
    this.step = 6;
  }

  premiumRequestMetadata(): { plan: 'FREE'; premium_requested: boolean } {
    return {
      plan: 'FREE',
      premium_requested: this.premiumRequested
    };
  }
}
