export const ONBOARDING_COMPLETION_KEY = 'orvel.onboarding.signup.v1';

type SignupOnboardingCompletionRecord = {
  completedAt: number;
  selectedRubros: string[];
};

type SignupOnboardingCompletionStore = Record<string, SignupOnboardingCompletionRecord>;

type MarkSignupOnboardingCompletedInput = {
  email: string;
  selectedRubros: string[];
  now?: number;
};

type ReadSignupOnboardingCompletionInput = {
  email: string;
};

type ReadSignupOnboardingCompletionResult = {
  completed: boolean;
  selectedRubros: string[];
  completedAt?: number;
};

type ShouldBypassOnboardingForLoginInput = {
  email: string;
  rawFlagValue?: unknown;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeSelectedRubros(selectedRubros: string[]): string[] {
  return selectedRubros
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readStore(): SignupOnboardingCompletionStore {
  if (!canUseLocalStorage()) {
    return {};
  }

  const rawStore = localStorage.getItem(ONBOARDING_COMPLETION_KEY);
  if (!rawStore) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawStore) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed as SignupOnboardingCompletionStore;
  } catch {
    return {};
  }
}

function writeStore(store: SignupOnboardingCompletionStore): void {
  if (!canUseLocalStorage()) {
    return;
  }

  localStorage.setItem(ONBOARDING_COMPLETION_KEY, JSON.stringify(store));
}

export function resolveOnboardingOnSignupOnlyFlag(rawValue: unknown): boolean {
  if (rawValue === true) {
    return true;
  }

  if (rawValue === false) {
    return false;
  }

  if (typeof rawValue !== 'string') {
    return true;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return true;
}

export function markSignupOnboardingCompleted(input: MarkSignupOnboardingCompletedInput): void {
  const email = normalizeEmail(input.email);
  if (!email) {
    return;
  }

  const selectedRubros = sanitizeSelectedRubros(input.selectedRubros);
  const completedAt = input.now ?? Date.now();
  const store = readStore();

  store[email] = {
    completedAt,
    selectedRubros
  };

  writeStore(store);
}

export function readSignupOnboardingCompletion(
  input: ReadSignupOnboardingCompletionInput
): ReadSignupOnboardingCompletionResult {
  const email = normalizeEmail(input.email);
  if (!email) {
    return {
      completed: false,
      selectedRubros: []
    };
  }

  const record = readStore()[email];
  if (!record) {
    return {
      completed: false,
      selectedRubros: []
    };
  }

  return {
    completed: true,
    selectedRubros: sanitizeSelectedRubros(record.selectedRubros),
    completedAt: record.completedAt
  };
}

export function shouldBypassOnboardingForLogin(input: ShouldBypassOnboardingForLoginInput): boolean {
  const onboardingOnSignupOnly = resolveOnboardingOnSignupOnlyFlag(input.rawFlagValue);
  if (onboardingOnSignupOnly) {
    return true;
  }

  return readSignupOnboardingCompletion({ email: input.email }).completed;
}
