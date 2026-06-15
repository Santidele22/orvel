---
name: orvel-supabase-auth-wiring
description: Dual provider auth (mock/supabase) with Supabase PKCE, route guards, returnTo sanitization and encrypted token storage for the Orvel dashboard.
triggers: "auth, login, signup, supabase session, route guard, PKCE, returnTo, encrypted storage, dashboard auth, mock auth, session mapping"
---

# Orvel Supabase Auth Wiring

## Purpose
Standardize how the Orvel dashboard wires authentication: dual-provider pattern (mock ↔ Supabase), PKCE flow configuration, Supabase session mapping, route guards with onboarding metadata checks, returnTo sanitization, and AES-GCM encrypted token storage.

## When to Use
- Implementing or modifying authentication flows (login/signup)
- Adding route guards for protected dashboard routes
- Working with session storage or token encryption
- Changing the returnTo redirect logic
- Wiring mock or Supabase auth providers
- Adding new auth-related features (password reset, email update)

## Mandatory Rules

### 1. Dual Provider Pattern (Mock / Supabase)
- The auth system MUST support two providers: **mock** (for development/testing) and **Supabase** (for production).
- The `createSupabaseAuthClient()` factory creates the real Supabase adapter with PKCE flow.
- Mock providers should implement the same `SupabaseAuthClient` interface for drop-in replacement.
- Runtime switching happens via environment config: `SUPABASE_CONFIG.url` and `SUPABASE_CONFIG.anonKey`.

### 2. PKCE Flow Configuration
- Always configure Supabase auth with `flowType: 'pkce'`.
- Enable `autoRefreshToken: true` and `persistSession: true`.
- Use `window.localStorage` as storage when available.
- Include `detectSessionInUrl: true` for handling OAuth redirects.

```typescript
const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }
});
```

### 3. SupabaseAuthClientAdapter
- Wrap the Supabase client in `SupabaseAuthClientAdapter` for typed method signatures.
- Map Supabase session/user types to the local `SupabaseSession` / `SupabaseUser` interfaces.
- Every public method MUST have try/catch with typed error responses (`AuthError`).
- Implement: `getSession`, `signInWithPassword`, `signUp`, `signOut`, `resetPasswordForEmail`, `updateUser`, `onAuthStateChange`.

### 4. Session Mapping
- The `mapSession()` private method converts `@supabase/supabase-js` `Session` → internal `SupabaseSession`.
- The `mapUser()` private method converts `User` → internal `SupabaseUser`.
- Return `null` from mappers when the input is null.
- Always validate `session.user` exists before mapping.

### 5. Route Guards with Onboarding Metadata
- Use `canAccessDashboardAsync()` (async) for production routing — never the synchronous `canAccessDashboard()`.
- The async check uses Supabase session:
  1. Calls `authClient.getSession()` to verify session exists.
  2. Checks `hasCompletedMandatoryOnboarding(metadata)` on user metadata.
  3. Redirects to login if no session, onboarding if metadata is incomplete.
- Route guard wiring: `dashboardAuthGuard` / `dashboardAuthChildGuard` → `resolveDashboardAccessRedirect()` → `canAccessDashboardAsync()`.
- Legacy localStorage (`TURNERA_SESSION_KEY`) is NEVER accepted for dashboard access.

```typescript
export async function canAccessDashboardAsync(): Promise<{ allowed: boolean; redirectTo?: string }> {
  return checkSupabaseSession();
}
```

### 6. returnTo Sanitization (Security Critical)
- `sanitizeDashboardReturnTo()` MUST reject:
  - Empty/null values → fallback to `/`.
  - External URLs (not starting with `/`, or starting with `//`).
  - JavaScript/data protocol URLs.
  - `/auth` paths (to prevent redirect loops).
  - URLs containing token-bearing params (`access_token`, `refresh_token`, `token`, `id_token`, `code`).
- `sanitizeReturnTo()` (in route-protection.ts) follows similar rules but is for route-level redirects.

### 7. Encrypted Token Storage (AES-GCM)
- Use `encrypted-token-storage.ts` for storing sensitive tokens.
- The encryption key is held ONLY in memory (never persisted to localStorage).
- `initEncryption()` MUST be called once on app startup.
- `encryptToken(token)` → base64(IV + ciphertext) using AES-GCM 256-bit.
- `decryptToken(encryptedToken)` → plaintext.
- This protects against XSS attacks where an attacker gains localStorage access.

### 8. Session Validation
- `validateSessionSchema()` checks the TurneaSession contract:
  - Version must be `'v1'`.
  - Token must be a non-empty string.
  - `issuedAt` / `expiresAt` must be finite numbers.
  - User must have `id`, `email`, `name` as strings.
  - `selectedBusinessTypes` must be an array of allowed values.
  - Session must not be expired (`expiresAt > now`).

## Anti-Patterns

- ❌ **Calling Supabase SDK directly from components** — always go through the adapter.
- ❌ **Using synchronous `canAccessDashboard()` in production** — it always returns `{ allowed: false }`.
- ❌ **Trusting localStorage session for dashboard access** — Supabase session is the source of truth.
- ❌ **Skipping returnTo sanitization** — creates open redirect vulnerabilities.
- ❌ **Hard-coding auth URLs** — always use helper functions like `buildLandingLoginRedirect()`.
- ❌ **Storing encryption keys in localStorage** — the entire point of AES-GCM is key-in-memory.
- ❌ **Mixing mock and real providers in the same config** — choose one via environment.

## Examples

### Route Guard Setup
```typescript
// app.routes.ts
{
  path: 'dashboard',
  canActivate: [dashboardAuthGuard],
  canActivateChild: [dashboardAuthChildGuard],
  loadChildren: () => import('./pages/dashboard/dashboard.routes')
}
```

### Supabase Auth Client Wiring
```typescript
// In auth.service.ts
import { createSupabaseAuthClient } from '../core/auth/supabase-auth.client';
import { SUPABASE_CONFIG } from '../core/auth/supabase-config';

const authClient = createSupabaseAuthClient({
  supabaseUrl: SUPABASE_CONFIG.url,
  supabaseAnonKey: SUPABASE_CONFIG.anonKey
});

const { data, error } = await authClient.getSession();
```

### Encrypted Token Usage
```typescript
import { initEncryption, encryptToken, decryptToken } from './encrypted-token-storage';

await initEncryption();
const encrypted = await encryptToken('my-token-value');
localStorage.setItem('secure.token', encrypted);
const decrypted = await decryptToken(encrypted);
```

## Checklist
- [ ] PKCE flow configured with auto-refresh and session persistence
- [ ] SupabaseAuthClientAdapter wraps all Supabase auth methods
- [ ] Session mapping converts Supabase types to local types correctly
- [ ] canAccessDashboardAsync() is used in route guards (not sync version)
- [ ] returnTo sanitization blocks external URLs, /auth paths, and token-bearing params
- [ ] Encrypted token storage initialized at app startup
- [ ] Session validation checks version, token, timestamps, and business types
- [ ] Mock auth provider implements the same interface as Supabase adapter
