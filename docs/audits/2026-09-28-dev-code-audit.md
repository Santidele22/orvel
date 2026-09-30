# Auditoría técnica de `dev` — Orvel

- **Fecha:** 2026-09-28
- **Rama auditada:** `dev` local en `31e1f5c` (working tree; `origin/dev` está 1 commit adelante: `402eb73` *fix(landing): make the footer Instagram link visible (#1053)*, que solo toca `Footer.astro`, un spec SEO y docs de OpenSpec)
- **Alcance:** monorepo completo — `apps/dashboard` (Angular 21 PWA, ~88k LOC), `apps/landing` (Astro 6, ~39k LOC), `apps/ops` (Vue 3, ~2.8k LOC), `packages/*` (~6k LOC), `supabase/` (16 Edge Functions + 142 migraciones), `scripts/`, `.github/workflows/`, configuración de build y deploy
- **Método:** auditoría de solo lectura (lectura de fuentes, `rg`, `git`, ejecución de un test existente sin efectos). Cinco barridos paralelos por área (Supabase/SQL, Edge Functions, dashboard Angular, landing/ops/packages, CI/supply-chain) más verificación manual de cada hallazgo de peso. Nada se modificó, desplegó ni invocó de forma remota
- **Naturaleza:** informe de trabajo para Santi. Está en español porque es un entregable de lectura; si se va a commitear, la convención del repo pide inglés y lo traduzco
- **Estado:** borrador de trabajo, sin commitear

## Cómo leerlo

| Severidad | Significado |
|---|---|
| **Crítica** | Explotable o rompe una garantía de seguridad/producción hoy. Arreglar primero |
| **Alta** | Riesgo real con mitigantes parciales, o puerta de calidad que no está cumpliendo su función |
| **Media** | Deuda con impacto concreto en seguridad, dinero, datos o mantenibilidad |
| **Baja** | Limpieza, drift de documentación, ergonomía |

Cada hallazgo trae **evidencia** (`archivo:línea` verificada), **impacto** e **implementación sugerida** con esfuerzo (`S` ≤ 1 día, `M` 2-5 días, `L` > 1 semana).

## 0. Estado de remediación (actualizado 2026-09-28, tras confirmar C-2)

| Hallazgo | Estado | Detalle |
|---|---|---|
| **A-14** (overload anónimo) | ✅ **Cerrado en pre-release** | Migración `20260928150000_harden_public_tenant_reads.sql` (rama `fix/harden-public-tenant-reads`, commit `2afe264`): `REVOKE ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated, service_role`. No se borró el overload porque **el dashboard llama esa firma** (`entitlements.api.ts:47`). Verificado: `anon` pasó de `200` con datos a `401 42501` |
| **C-2 · `businesses`** | ✅ **Cerrado en pre-release** | `DROP POLICY "Public view businesses"` + `REVOKE ALL ... FROM anon`. Verificado: `200` con 15 filas → `401 42501` |
| **C-2 · `business_settings`** (CBU/alias) | ✅ **Cerrado en pre-release** | Expand en `b0118bd` (el turnero resuelve solo por RPC) y contract en la migración `20260928151800_revoke_anon_business_settings.sql` (`DROP POLICY` + `REVOKE ALL ... FROM anon`). Aplicado en pre-release y verificado: la tabla pasó de `200` con 15 filas (5 con alias y CBU) a **`401 42501`**, mientras `resolve_business_by_slug` y `query_public_slot_availability` siguen dando `200` con datos reales. En el repo: PR #1059 (`dev`, `a454a049`) y #1060 (`qa`, `b068b670`) |
| **M-15 · `branches`** | ✅ **Cerrado en pre-release** | Sin consumidor anónimo en el repo. Verificado: `200` con 15 filas → `401 42501` |
| **M-15 · `services`** | ⚠️ **Abierto, mismo patrón** | La página pública lee `services` con la anon key y `select('*')` (`public-booking.page.ts:449` → `ServicioService.getByBusinessId`, `servicio.service.ts:596`) porque necesita mostrar precios. Requiere un RPC definer (`list_public_services`) y el mismo expand/contract que `business_settings` |
| Producción | ⏳ Pendiente | Entra por `dev` → `qa` → `main` (el `db push` de la promoción aplica la migración). Ya está en `dev` y en `qa`: PR #1057 (merge `3f368575`) y PR #1058 (merge `4bda2e77`, deploy de qa OK). El `db push` manual con el token de producción es posible pero evita el flujo documentado |

Estado de la promoción (2026-09-28): `dev` y `qa` tienen el árbol idéntico tras la promoción (`git diff --name-only origin/dev origin/qa` → 0 archivos), así que el back-sync `dev ← qa` no tiene nada que copiar. El run `Deploy promotion` de qa terminó en verde (todos los pasos, incluido `Apply migrations`, que fue no-op porque la migración ya estaba aplicada en pre-release) y `qa.orvel.pro` responde 200 en `/`, `/dashboard/runtime-env.js` y `/booking/<slug>`.

Nota de entorno (no afecta al repo remoto): durante la sesión, el working tree local perdió 10 archivos rastreados en dos eventos (5 specs de `apps/dashboard/src/app/core/api/supabase-booking*` y 5 scripts de `apps/dashboard/scripts*`) y otro archivo apareció reformateado sin intervención. No hay hooks ni filtros git configurados. Los borrados se restauraron desde `HEAD`; los commits, los PR y el deploy no se vieron afectados (verificado contra `origin/dev`, `origin/qa` y el check `Full repo checks` de CI).

Verificación funcional post-migración en pre-release (con la anon key): `resolve_business_by_slug` sigue devolviendo `200` con `booking_policy`, `settings` (incluye `maxAdvanceDays`, `workingHours`, `depositAlias`, `depositCbu`) y el nombre del negocio, así que el turnero público no depende de los privilegios revocados (las RPC son `SECURITY DEFINER`).

### Fase 2 — revoke de `business_settings` (APLICADO en pre-release)

Vive como migración real: `supabase/migrations/20260928151800_revoke_anon_business_settings.sql`.

```sql
BEGIN;
DROP POLICY IF EXISTS "Public view settings" ON public.business_settings;
REVOKE ALL ON TABLE public.business_settings FROM anon;
COMMIT;
NOTIFY pgrst, 'reload schema';
```

Se aplicó cuando el bundle nuevo ya estaba en `dev` y `qa` (PRs #1057/#1058). Verificación con la anon key de pre-release y de qa:

| Chequeo | Antes | Después |
|---|---|---|
| `GET /rest/v1/business_settings` | `200`, 15 filas (5 con alias/CBU) | **`401 42501`** |
| `POST /rpc/resolve_business_by_slug` | `200` | **`200`** (mismo payload: alias, CBU, `workingHours`, `maxAdvanceDays`) |
| `POST /rpc/query_public_slot_availability` | `200` | **`200`** (slots reales) |
| `qa.orvel.pro/booking/<slug>` | `200` | **`200`** |
| `supabase migration list` | alineado | **alineado** (144) |

Seguridad previa: las **siete** funciones alcanzables por `anon` que leen la tabla son `SECURITY DEFINER` (`resolve_business_by_slug`, `query_public_slot_availability`, `list_public_professionals_for_service`, `create_public_booking`, `manage_booking_by_token`, `cancel_booking_by_token`, `reschedule_booking_by_token`, `get_booking_notification_context`), y el dashboard lee por la política autenticada `Owners manage settings` (`is_business_owner`), que sigue intacta.

Pendiente: la promoción `qa → main` para que aplique en producción, y `services` (necesita el RPC definer `list_public_services` antes de su propio revoke).

---

## 1. Resumen ejecutivo

El repo está en mucho mejor estado del que suele encontrarse en un SaaS de este tamaño: 449 archivos de test, RLS habilitado en **todas** las tablas, ningún `GRANT` de tabla a `anon` declarado en migraciones (el acceso público se diseñó por RPC), outbox de email con claim atómico, sanitización de `returnTo` en ambos lados del handoff, política de instalación endurecida (`ignore-scripts`, `minimum-release-age`, `save-exact`) y una operación de producción (`trial-reminder`) con capability por fd, verificación de project ref y limpieza.

Los problemas se concentran en cinco frentes:

1. **Exposición de datos entre negocios desde el cliente público.** Un XSS almacenado explotable en `/booking/<slug>` (reproducido con el código del repo) y dos políticas RLS `USING (true)` sobre `businesses` y `business_settings` que publican el `owner_id` de cada negocio y sus datos de cobro (alias/CBU), email y teléfono a cualquiera con la anon key — **confirmado en runtime**: 15 negocios enumerables, 5 con CBU y alias cargados, más el encadenamiento A-14 para leer entitlements de cualquier negocio. Sin CSP que mitigue lo primero.
2. **Los gates de CI no cubren lo que dicen cubrir.** El check requerido `Dashboard booking regressions` ejecuta 6 specs de 298 del dashboard; `pnpm run check` corre 5 más de dashboard y 2 de landing; de los 298 specs del dashboard corren 14 (4,7%), hay 77 archivos `.red.contract.spec.ts` que no corren en ninguna puerta, los e2e nunca corren, y el propio workflow del guard de migraciones se lee del árbol del PR que gatea.
3. **Superficie de autorización inconsistente en la base y en las Edge Functions:** un overload `SECURITY DEFINER` ejecutable por `anon`, un RPC destructivo otorgado a `anon`, un mismo secreto (`CRON_KEY`) que desbloquea desde envío de emails hasta el borrado definitivo de usuarios, y dos funciones que autorizan por un claim JWT **sin verificar firma** confiando en un flag de configuración que CI no comprueba (solo 4 de 16 funciones se despliegan por CI).
4. **Bugs de fecha/hora en el corazón del producto.** La conversión civil→UTC de bloqueos y turnos manuales usa constructores locales (depende del TZ del dispositivo) y el render de horarios no fija `timeZone`: en un equipo fuera de Argentina la agenda se guarda y se muestra desplazada horas.
5. **Fuentes de verdad duplicadas o congeladas** (planes, precios, rubros, entitlements, catálogo de referencia, gateway de booking, plantillas de email) contra la dirección explícita de `infra/context/product.md`; el gate de acceso al dashboard se resuelve contra un fixture hardcodeado que nunca se refresca.

### Top de riesgos priorizados

| # | Hallazgo | Sev. | Esf. |
|---|---|---|---|
| C-1 | XSS almacenado en `/booking/<slug>` vía `<title>` sin escapar (nombre de negocio) — reproducido en el código | Crítica | S |
| C-2 | `business_settings` y `businesses` legibles por `anon` con `USING (true)`: CBU/alias/email/teléfono y `owner_id` de todos los tenants — **confirmado en pre-release y en producción** (3 negocios con CBU/alias expuestos) | Crítica | S |
| A-1 | `process-email-outbox` / `process-web-push-outbox` autorizan por claim `role` sin verificar firma | Alta | S |
| A-2 | `deploy-promotion.yml` aplica `supabase db push` a producción sin dry-run, sin verificación de identidad y antes de validar el build | Alta | M |
| A-3 | El check requerido puede neutralizarse desde el propio PR (guard leído del head, sin CODEOWNERS) | Alta | S |
| A-4 | Un solo `CRON_KEY` habilita purge destructivo + `auth.admin.deleteUser` | Alta | M |
| A-5 | Secretos de servidor leídos por `import.meta.env` en SSR: 500 en el alta o secreto horneado en el artefacto | Alta | M |
| A-6 | Endpoints públicos que envían email y crean intents sin rate limit, sin `Content-Type` ni `Origin` | Alta | M |
| A-7 | `email_confirm: true` en el alta gratuita: cuentas con email de tercero y contraseña elegida por el atacante | Alta | M |
| A-8 | El CLI que migra producción va en `version: latest` y el build desplegado no usa `--frozen-lockfile` | Alta | S |
| A-9 | Las puertas de test no ejecutan la suite (14 de 298 specs del dashboard; e2e nunca) | Alta | M |
| A-10 | 7 lockfiles y dos `packageManager` contradictorios para grafos solapados | Alta | M |
| A-11 | Cinco de siete workflows sin `permissions:` y sin OIDC | Alta | S |
| A-12 | Fuentes de verdad duplicadas: planes, precios, rubros y entitlements en 8+ lugares | Alta | L |
| A-13 | Gate de `CRON_KEY` inconsistente y `appointment-reminders-24h` sin bloque de `verify_jwt` | Alta | S |
| A-14 | Overload `get_business_entitlements_snapshot(text,text)` ejecutable por `anon` — **confirmado con prueba diferencial** | Alta | S |
| A-15 | Bloqueos y turnos manuales se convierten a UTC con el TZ del dispositivo; el render no fija `timeZone` | Alta | M |
| A-16 | El gate de acceso y los entitlements se resuelven contra un fixture congelado; `plan` es escribible por el cliente | Alta | M |

---

## 2. Hallazgos críticos

### C-1 · XSS almacenado en `/booking/<slug>` por el nombre del negocio (reproducido)

**Evidencia**
```ts
// apps/landing/src/lib/booking-share-rewriter.ts:7-12
function replaceTitle(html: string, title: string): string {
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`); // ← sin escapar
  }
  return html.replace(/<head([^>]*)>/i, `<head$1><title>${title}</title>`);
}
```
- El título se construye con el nombre del negocio: `apps/landing/src/lib/booking-share-head.ts:74` → ``title: `${name} · Reservá turno | Orvel` ``
- Ese nombre lo escribe el dueño del turnero y **no tiene validación de formato**: `supabase/migrations/20260501_consolidated_schema.sql:20` (`name text NOT NULL`), escritura directa desde el dashboard (`apps/dashboard/src/app/features/settings/data-access/business-settings.facade.ts:369`), alta desde la landing (`apps/landing/src/pages/api/signup/create-account-business.ts:159` solo recorta longitud)
- El HTML lo sirve la Edge Function con `content-type: text/html` y caché pública: `apps/landing/src/edge/booking-share.ts:5` (`public, s-maxage=60, stale-while-revalidate=300`) y `:122`
- Los `meta` **sí** se escapan (`escapeAttr`, `booking-share-rewriter.ts:3-5`); el `<title>` es contenido raw-text y no pasa por esa función

**Reproducción** (ejecutada sobre el código del repo, sin escribir nada):

```js
rewriteBookingShareHead(shell, { title: 'Uñas </title><script>alert(document.domain)</script> · Reservá turno | Orvel', ... })
// → <html><head><title>Uñas </title><script>alert(document.domain)</script> · Reservá turno | Orvel</title>...
// contiene script ejecutable: true
```

**Impacto:** XSS almacenado en `https://orvel.pro/booking/<slug>`, en el **mismo origen** que el dashboard (`/dashboard`) y el alta. Quien tenga un turnero (o quien consiga escribir ese nombre por cualquier otra vía de escritura) ejecuta JS en el navegador de cada visitante del link público. Como la sesión de Supabase vive en `localStorage['orvel.supabase.auth']` (ver M-8), el botín natural es el token de una operadora que abra su propio link de reserva: toma de cuenta completa. No hay CSP (ver M-7), así que nada limita el payload.

**Implementación:** un `escapeText()` (`&`, `<`, `>`) usado por `replaceTitle` (y por cualquier otro punto que arme HTML por concatenación); test de contrato en `apps/landing/src/tests/booking-share-head.contract.spec.ts` con un `name` que contenga `</title><script>`. Considerar además una restricción de formato en `businesses.name` (regex sin `<>`) como defensa en profundidad.

**Esfuerzo:** S

### C-2 · Políticas `USING (true)` dejan `businesses` y `business_settings` abiertas a `anon` — **CONFIRMADO en runtime**

**Evidencia (código)**
```sql
-- supabase/migrations/20260501_consolidated_schema.sql
:161  CREATE POLICY "Public view businesses" ON public.businesses FOR SELECT USING (true);
:163  CREATE POLICY "Public view settings"   ON public.business_settings FOR SELECT USING (true);
```
- Ninguna migración posterior borra esas dos políticas ni revoca privilegios sobre esas tablas (`rg -i "revoke[^;]*on (table )?(public\.)?(business_settings|businesses)"` → 0 resultados). Sí hay `REVOKE` explícitos sobre otras tablas (`20260615174014_harden_public_bookings_direct_access.sql:8-10`, `20260824231000_create_web_push_outbox.sql:21-31`), lo que confirma que los grants por defecto existen.
- `business_settings` ganó columnas sensibles después: `20260904120000_manual_booking_deposits.sql:35-36` (`deposit_alias`, `deposit_cbu`), `20260905193000_add_business_settings_whatsapp.sql:7` (`whatsapp`), `20260618143000_repair_business_settings_signup_columns.sql:9` (`support_phone`)
- La vía pública prevista es por RPC y por slug: `resolve_business_by_slug(...)` ya devuelve lo necesario (`20260904240000_public_deposit_receipt_contact.sql:52-75`)

**Evidencia (runtime, 2026-09-28)** — solo `GET`, con la anon key pública. La anon key de producción es la que el propio sitio sirve en `https://orvel.pro/dashboard/runtime-env.js` (HTTP 200), y su proyecto coincide con el digest de `supabase/production-project-ref.sha256`; la de `.env.local` apunta al proyecto de pre-release (`orvel-qa-dev`).

| Consulta con la anon key | Pre-release | **Producción** |
|---|---|---|
| `GET /rest/v1/businesses?select=id,slug,name,owner_id` | HTTP 200 — 15 filas, 2 con `owner_id` | **HTTP 200 — 19 filas, 5 con `owner_id`** |
| `GET /rest/v1/business_settings?select=business_id,deposit_alias,deposit_cbu,whatsapp,support_phone` | HTTP 200 — 15 filas, 5 con `deposit_alias`, 5 con `deposit_cbu`, 8 con `support_phone` | **HTTP 200 — 19 filas, 3 con `deposit_alias`, 3 con `deposit_cbu`, 6 con `support_phone`** |
| `GET /rest/v1/services?select=id&is_active=eq.true` | HTTP 200 — 166 filas (M-15) | **HTTP 200 — 180 filas (M-15)** |
| `GET /rest/v1/branches?select=id&is_active=eq.true` | HTTP 200 — 15 filas (M-15) | **HTTP 200 — 19 filas (M-15)** |
| *control* `GET /rest/v1/bookings?select=*` | HTTP 401 `42501` (grant revocado: OK) | HTTP 401 `42501` (OK) |
| *control* `customers` / `notification_email_outbox` | HTTP 200 `[]` (default-deny: OK) | HTTP 200 `[]` (OK) |

Los valores **no se volcaron** en ningún momento (solo conteos y estados HTTP). Esto prueba además el mecanismo: los privilegios de tabla por defecto **sí** existen para `anon` (si no, los controles devolverían 401 como `bookings`). Lo que filtra no es el grant, son las políticas `USING (true)`.

**Impacto:** cualquiera con la anon key que el sitio entrega en claro en `runtime-env.js` enumera todos los negocios, obtiene su `owner_id` y, donde estén cargados, el alias y el CBU con los que ese negocio cobra las señas. En producción eso son **3 negocios con destino de cobro real legible** (más 6 con teléfono de soporte): es información que habilita phishing de pago ("depositá en este alias") y fraude por redirección de seña, además de inteligencia comercial cross-tenant. Las políticas no aportan nada que las RPC no cubran mejor.

**Implementación:** `DROP POLICY IF EXISTS "Public view settings" ON public.business_settings;` + `REVOKE SELECT ON public.business_settings FROM anon;` (ídem `businesses`, o reemplazar por una política con proyección estricta sin `owner_id`); dejar el turnero público servido por `resolve_business_by_slug()`. Añadir un check estático/contrato que falle ante políticas `USING (true)` en tablas con PII o datos de cobro. Como es producción, el arreglo entra por `dev` → `qa` → `main` en el mismo ciclo.

**Esfuerzo:** S


---

## 3. Hallazgos altos

### A-1 · Autorización por claim JWT sin verificar firma en los workers de outbox

**Evidencia**
```ts
// supabase/functions/_shared/process-web-push-outbox.ts:87-90
// Safe only with verify_jwt=true on process-web-push-outbox (gateway verifies the JWT).
return role === "service_role";

// supabase/functions/process-email-outbox/index.ts:96-99
return getEmailInvocationJwtRole(authorizationHeader) === "service_role";
```
Ambos decodifican el payload en el propio código (`_shared/process-web-push-outbox.ts:60-72`, `process-email-outbox/index.ts:112-134`) y comparan primero el Bearer contra `SUPABASE_SERVICE_ROLE_KEY` con comparación timing-safe; el fallback por `role` es lo que queda cuando esa comparación no aplica.

**Impacto:** la única barrera del fallback es un flag de configuración del gateway. Si se pierde (deploy con `--no-verify-jwt`, o `config.toml` desincronizado porque esas funciones **no** se despliegan por CI — ver M-5), un JWT sin firmar `{"role":"service_role"}` da control total del relay de correo saliente del dominio Orvel (`to_email`/`html`/`subject` vienen del body) y de la cola de push. La autorización no debería depender de una capa que el repo no verifica.

**Implementación:** eliminar el fallback por claim; autorizar solo con comparación timing-safe contra el secreto o con `supabase.auth.getUser(token)` y rol real. Añadir contrato estático que exija verificación en el código, no solo `verify_jwt = true`.

**Esfuerzo:** S

### A-2 · El deploy a producción muta el esquema antes de validar la app y sin verificación de identidad

**Evidencia** (`.github/workflows/deploy-promotion.yml`)
- `:51` `supabase link --project-ref ${{ steps.target.outputs.supabase_ref }}`
- `:56` `run: supabase db push` — sin `--dry-run`, sin rollback, sin verificación de identidad del proyecto destino
- `:61,66,71,76` cuatro `supabase functions deploy`
- `:88` y `:101` recién ahí `pnpm install --frozen-lockfile` y el build real (`npx vercel@59.11.7 deploy`)
- Contraste: `scripts/trial-reminder-production.sh:64-76` **sí** verifica el project ref enlazado contra `supabase/production-project-ref.sha256`

**Impacto:** un merge a `main` muta el esquema de producción de forma irreversible. Si el build de Vercel falla (TypeScript, env, lockfile), producción queda con esquema nuevo y código viejo, sin rollback automatizado. Nada comprueba que `SUPABASE_PROJECT_REF_PROD ≠ SUPABASE_PROJECT_REF_QA`. El freno humano depende de que el environment `orvel-prod` tenga required reviewers: **no verificable desde el repo**.

**Implementación:** `db push --dry-run` como paso previo revisable; mover el build a un job anterior bloqueante (`needs:`); verificar el project ref contra el digest (`production-project-ref.sha256`) antes de tocar nada; documentar el rollback; exigir required reviewers en `orvel-prod`.

**Esfuerzo:** M

### A-3 · El check requerido se lee del árbol del PR que gatea

**Evidencia**
- `.github/workflows/promotion-drift-guard.yml:27` → `run: node scripts/check-migration-drift.mjs --base origin/${{ github.base_ref }} --head origin/pr-head` (el script sale del checkout del merge-ref)
- `.github/workflows/booking-regression.yml:19` → `name: Dashboard booking regressions` (el nombre que exige el ruleset lo fija el fichero que el PR puede editar)
- No existe `.github/CODEOWNERS` ni Dependabot (`ls .github/` → solo `workflows/`)

**Impacto:** un PR a `qa` puede editar el guard para que devuelva 0 y el check requerido `Migration drift guard` reporta verde; un PR a `dev`/`main` puede vaciar los pasos del job conservando el `name` y `ci-gate` pasa. Con Santi como único owner usando el bypass `--admin` por PR, este guard es en la práctica la única protección automática de la promoción.

**Implementación:** ejecutar el guard desde el base ref (`git show origin/${{ github.base_ref }}:scripts/check-migration-drift.mjs > /tmp/guard.mjs`); añadir `.github/CODEOWNERS` con `.github/workflows/**` y `scripts/check-migration-drift.mjs`.

**Esfuerzo:** S

### A-4 · Un único `CRON_KEY` habilita desde envíos hasta el borrado de usuarios

**Evidencia**
- `supabase/config.toml:444-445, 449-450, 460-461, 465-466, 471-472`: cinco funciones con `verify_jwt = false` que se autentican con el mismo `CRON_KEY`
- `supabase/functions/account-closure/index.ts:600` → `await input.supabaseAdmin.auth.admin.deleteUser(deletionOwnerId)`
- `.github/workflows/account-closure.yml:21-22` documenta que el secreto del scheduler debe coincidir con el `CRON_KEY` desplegado
- `supabase/functions/appointment-reminders-24h/index.ts:36` lee el mismo `CRON_KEY`

**Impacto:** un solo secreto — replicado además en secrets de GitHub Actions — desbloquea purge de bookings, liberación de holds, encolado de emails y push, y el borrado definitivo de usuarios de auth. Sin separación de privilegios ni scopes; rotarlo obliga a tocar 5 funciones y 3 workflows. Cualquier fuga (log, captura, secreto mal gestionado) es de radio máximo.

**Implementación:** un secreto por función (o HMAC por función con `x-timestamp` + nonce anti-replay), secretos destructivos en Vault, y confirmación/dual-control para `account-closure`. Unificar además la comparación timing-safe (hoy `account-closure/index.ts:37` y `subscription-expiry-check/index.ts:38` comparan con `===`).

**Esfuerzo:** M

### A-5 · Secretos de servidor leídos por `import.meta.env` en rutas SSR

**Evidencia**
- Lecturas: `apps/landing/src/lib/server/pending-signup-pii-protection.ts:24-26`, `apps/landing/src/pages/api/signup/confirm-email.ts:135-136`, `apps/landing/src/pages/api/signup/create-account-business.ts:170-171`, `apps/landing/src/lib/server/pending-signup-handoff.ts:127-128`, `apps/landing/src/pages/api/subscriptions/start.ts:136-137`, `apps/landing/src/pages/api/subscriptions/status.ts:21-22`
- Artefacto SSR construido (`pnpm --dir apps/landing run build`, gitignored) → `apps/landing/.vercel/output/_functions/chunks/pending-signup-pii-protection_*.mjs:1`:
  ```js
  const __vite_import_meta_env__ = {"ASSETS_PREFIX": undefined, "BASE_URL": "/", "DEV": false, "MODE": "production", "PROD": true, "SITE": undefined, "SSR": true}
  // :22-26  getSecret(name) lee Object.assign(__vite_import_meta_env__, {})[name]
  ```
- El único consumidor que lo hace bien: `apps/landing/src/pages/api/waitlist.ts:41-42` (`process.env.X || import.meta.env.X`)

**Impacto:** `import.meta.env` se reemplaza estáticamente en build. Con el literal observado, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` y `PENDING_SIGNUP_*` no llegan al runtime → las rutas de alta fallan con 500 (`*_missing`). Si el entorno de build de Vercel sí las tuviera, el resultado es el opuesto pero igual de malo: **secreto horneado en el artefacto** (rotar exige rebuild; filtrar el artefacto compromete la clave de cifrado de PII). Los dos desenlaces se arreglan igual. No pude verificar el bundle desplegado.

**Implementación:** migrar a `process.env` o `astro:env` con schema server-side; test que falle si una ruta de servidor lee un secreto por `import.meta.env`; verificar con `rg PENDING_SIGNUP .vercel/output` antes de dar por cerrado.

**Esfuerzo:** M

### A-6 · Endpoints públicos que envían email o crean estado, sin rate limit ni validación de origen

**Evidencia**
- `apps/landing/src/pages/api/signup/pending-intent/protect.ts:53-56` → `POST` que hace `await request.json()` y llama `createPendingSignupHandoff(...)` sin comprobar `Content-Type`, `Origin` ni límite
- Ese flujo inserta en `notification_email_outbox` (`apps/landing/src/lib/server/pending-signup-handoff.ts:308-310`) y barre usuarios con `auth.admin.listUsers({ page, perPage: 1000 })` hasta 10 páginas (`:137-138`) → hasta 10.000 usuarios por request
- `apps/landing/src/pages/api/waitlist.ts:16-43` escribe al webhook de Sheets sin límite
- Contraste: `apps/landing/src/pages/api/signup/create-account-business.ts:116-122` **sí** usa `guard_signup_request_rate_limit`
- El limitador de `create-subscription` se apoya en headers de cliente: `supabase/functions/create-subscription/index.ts:28-35` (`cf-connecting-ip`, `x-forwarded-for`) con `Map` en memoria del isolate (`:37-52`); igual en `cancel-subscription` y `change-subscription`

**Impacto:** un `<form enctype="text/plain">` de un sitio de terceros puede producir un body JSON válido → altas de intent y **emails a direcciones arbitrarias desde el dominio de Orvel** (email bombing), más amplificación de `listUsers`. En las funciones de suscripción, rotar el header de IP y repartir entre isolates esquiva el límite, que es la única defensa del alta anónima (`_shared/create-subscription-auth.ts:18-26,37-39`).

**Implementación:** reutilizar el RPC `guard_signup_request_rate_limit` (IP + email) en `protect`, `finalize` y `waitlist`; exigir `Content-Type: application/json` y `Origin` allowlisted en los POST; sustituir el barrido `listUsers` por una RPC de existencia por `email_hmac`; mover el límite de las funciones a DB.

**Esfuerzo:** M

### A-7 · `email_confirm: true`: la verificación de email no protege el acceso

**Evidencia**
```ts
// apps/landing/src/pages/api/signup/create-account-business.ts:231-235
const { data: createdAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
  email, password: password, email_confirm: true,
  user_metadata: { first_name: firstName, last_name: lastName, phone, plan: "FREE", ... },
});
```
- El flujo pago **sí** exige confirmación: `apps/landing/src/pages/api/subscriptions/start.ts:182` (`!pendingSignupIntent?.email_confirmed_at || confirmation_status !== "confirmed"`)
- El token de confirmación se usa después solo para materializar (`apps/landing/src/pages/api/signup/confirm-email.ts:221-225`)
- Expuesto también: `supabase/config.toml` → `minimum_password_length = 6`, `password_requirements = ""`

**Impacto:** cualquiera se registra con el email de un tercero, elige la contraseña, entra de inmediato (la cuenta ya está confirmada y el tenant provisionado) y el email de confirmación queda como trámite cosmético. Además, el requisito de confirmación del camino pago es una garantía falsa. Contraseña mínima 6 sin requisitos agrava la toma de cuentas.

**Implementación:** decidir el comportamiento con Santi. Si la verificación debe proteger el acceso: `email_confirm: false` y crear/usar la sesión solo al consumir el token (o mover `auth.admin.createUser` a `confirm-email.ts`, que ya tiene el token verificado). Si el acceso inmediato es intencional, quitar el requisito de `start.ts` para no dar falsa garantía y documentarlo. Subir `minimum_password_length` a 8+ y activar `password_requirements`.

**Esfuerzo:** M

### A-8 · Cadena de suministro del deploy: CLI `latest` y build sin lockfile congelado

**Evidencia**
- `.github/workflows/deploy-promotion.yml:44-46` → `uses: supabase/setup-cli@v1` / `with:` / `version: latest`
- `.github/workflows/deploy-promotion.yml:101,104` → `npx vercel@59.11.7 deploy ...` (descarga en runtime; el pin del paquete es explícito pero fuera del lockfile)
- `vercel.json:4` → `"installCommand": "pnpm install"` (sin `--frozen-lockfile`) mientras CI usa `--frozen-lockfile` en los tres workflows
- `package.json:7` declara `"supabaseCliVersion": "2.98.2"` y `package.json:84` fija `"supabase": "2.117.0"`; `scripts/trial-reminder-production.sh:59` usa la primera
- Todas las acciones están fijadas por tag mutable (`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `denoland/setup-deno@v2`, `supabase/setup-cli@v1`) y no hay Dependabot

**Impacto:** la herramienta que ejecuta `db push` sobre producción cambia sin diff revisable, en un job que tiene `SUPABASE_ACCESS_TOKEN_PROD` y `VERCEL_TOKEN` en el entorno. El artefacto publicado se resuelve sin congelar el lockfile, así que "lo que pasó CI" y "lo que se publicó" pueden diferir. Tres versiones distintas de Supabase CLI conviven en el repo.

**Implementación:** `version: 2.98.2` (o la que se decida) en `setup-cli`; `pnpm exec vercel` desde la devDependency en lugar de `npx`; `"installCommand": "pnpm install --frozen-lockfile"` en `vercel.json`; fijar acciones por SHA con comentario de versión y añadir `.github/dependabot.yml` con `package-ecosystem: github-actions`.

**Esfuerzo:** S

### A-9 · Las puertas de test no ejecutan la suite

**Evidencia**
- `package.json:15` (`check`) encadena `check:dashboard` y `check:landing`, que ejecutan 5 y 2 specs respectivamente (`package.json:53-56`)
- Recuento real: 298 specs en `apps/dashboard`, 67 en `apps/landing`, 43 en `supabase`, 16 en `packages`, 11 en `scripts`, 11 en `apps/ops`
- El check **requerido** (`booking-regression.yml`) ejecuta 6 specs de dashboard + 5 archivos Deno
- Ningún workflow referencia `playwright` ni `test:e2e`: `tests/e2e/*` nunca corre
- Peor aún dentro del dashboard: de sus **298** specs corren **14** (4,7%) y existen **77** archivos `*.red.contract.spec.ts` que no corren en ninguna puerta (el rótulo RED es una afirmación del propio archivo, p. ej. `apps/dashboard/src/app/tests/integration/kb001-supabase-connection-guard.red.contract.spec.ts:4`); `apps/dashboard/vitest.config.ts:31-35` define thresholds de coverage (70/70/60/70) que ningún script pasa con `--coverage`; y `apps/dashboard/src/app/tests/e2e/auth-flow.spec.ts` (719 líneas) vive fuera de `testDir: './tests/e2e'`, así que ni siquiera `pnpm run test:e2e` lo ejecutaría
- `apps/ops` está fuera del workspace y de `check` por diseño (`pnpm-workspace.yaml`, `apps/ops/AGENTS.md`): sus 11 specs y sus 2 e2e no corren en ninguna puerta
- `scripts/supply-chain-hardening.test.mjs` no está referenciado por ningún script ni workflow (única mención: `infra/context/architecture.md:46`)
- `scripts/deploy-promotion-workflow.test.mjs` **falla hoy**: `node --test scripts/deploy-promotion-workflow.test.mjs` → `ERR_ASSERTION` esperando `/dist/salon-de-belleza/browser/` (línea 62), que vive en `scripts/build-vercel.mjs`, no en el workflow

**Impacto:** un cambio puede llegar a `main` verde sin haber ejecutado su test. El gate de supply-chain (que incluye `pnpm audit --prod` y verificación de lockfiles) existe pero nunca corre, y uno de sus tests está en rojo sin que nadie se entere.

**Implementación:** añadir a `ci.yml` y al workflow requerido jobs con la suite completa de dashboard y landing; job e2e con `playwright install --with-deps`; cablear `test:supply-chain` en `check` y arreglar las aserciones obsoletas; decidir explícitamente si `apps/ops` queda fuera de todo gate (hoy lo está por escrito pero sin test que lo garantice).

**Esfuerzo:** M

### A-10 · Siete lockfiles, dos gestores y `packageManager` contradictorio

**Evidencia**
- `git ls-files` → `pnpm-lock.yaml`, `bun.lock` (254 KB), `deno.lock`, `apps/landing/pnpm-lock.yaml`, `apps/dashboard/bun.lock`, `apps/dashboard/package-lock.json`, `supabase/functions/deno.lock`
- `package.json:5` → `"packageManager": "pnpm@11.0.8"` vs `apps/dashboard/package.json:16` → `"packageManager": "bun@1.3.10"`
- Los tres workflows solo usan `pnpm install --frozen-lockfile`; `build:dashboard:bun` / `test:dashboard:bun` / `check:dashboard:bun` (`package.json:12,17,49`) producen artefactos por un grafo que nadie audita
- La política de `.npmrc` (`ignore-scripts`, `minimum-release-age`, `strict-peer-dependencies`) es de pnpm: el camino bun queda fuera

**Impacto:** resoluciones paralelas del mismo grafo que pueden derivar en silencio de `pnpm-lock.yaml`; distinto comportamiento entre lo verificado y lo construido localmente.

**Implementación:** un gestor canónico por grafo. Si bun es solo soporte local, quitar `packageManager` de `apps/dashboard` y los lockfiles que CI no usa, o añadir un job que al menos valide `bun install --frozen-lockfile`. Documentar la decisión en `pnpm-workspace.yaml`.

**Esfuerzo:** M

### A-11 · Cinco de siete workflows sin `permissions:` y sin OIDC

**Evidencia** — solo declaran `permissions:` `booking-regression.yml:14` y `promotion-drift-guard.yml:7`. Sin bloque: `ci.yml`, `deploy-promotion.yml`, `account-closure.yml`, `operator-lifecycle-pushes.yml`, `release-expired-booking-holds.yml`. No hay OIDC: todos los proveedores usan tokens estáticos de larga vida.

**Impacto:** el `GITHUB_TOKEN` hereda el default del repo/org; en `deploy-promotion` convive con los secretos de producción, ampliando el radio de daño ante una acción comprometida. El impacto real depende de `default_workflow_permissions`, **no verificable desde el repo** — por eso es Alta y no Crítica.

**Implementación:** `permissions: contents: read` en los cinco (y `permissions: {}` donde no se necesite nada); evaluar OIDC para Vercel/Supabase.

**Esfuerzo:** S

### A-12 · Fuentes de verdad duplicadas: planes, precios, rubros y entitlements

**Evidencia**
- Alias legacy `STARTED/STARTER/BASIC/MEDIUM/GROWTH/PRO/SIMPLE/CRECE/ESCALA → PREMIUM` repetidos en al menos 8 lugares: `apps/landing/src/lib/plan-entitlements.ts:34`, `apps/landing/src/lib/plans.ts:52,63-65`, `apps/landing/src/pages/api/subscriptions/start.ts:29`, `apps/landing/src/pages/api/signup/create-account-business.ts:91`, `apps/landing/src/lib/server/pending-signup-handoff.ts:87`, `apps/landing/src/lib/subscription-page-controller.ts:9`, `supabase/functions/_shared/plan-catalog.ts:11-22`, `supabase/functions/_shared/canonical-plan-codes.ts:7-13` — además de la tabla `public.plan_aliases` (`supabase/migrations/20260707150000_mvp_free_premium_pricing_catalog.sql:126-137`), que es la fuente declarada
- Entitlements hardcodeados e idénticos: `apps/landing/src/lib/plan-entitlements.ts:10-19` (`FREE` y `PREMIUM` con `maxLocales: 1, maxRubros: 1`) mientras la DB modela límites por plan (`plan_entitlements`) y existe `packages/domain/src/reference-catalog.ts`
- Precio duplicado y hardcodeado: `apps/dashboard/src/app/features/billing/data-access/landing-plans-source.api.ts:61` (`priceMonthlyCents: 2_500_000`) y, peor, en el template `apps/dashboard/src/app/features/billing/pages/billing-subscription.page.html:22` (`$25.000/mes`); `apps/landing/src/lib/plans.ts:283` (`price: 25000` en el fallback estático)
- Rubros: `packages/types/src/user.model.ts:16-24` (`TipoNegocio`) no incluye `estetica` ni `maquillaje`, que sí están en `ALLOWED_BUSINESS_TYPES` (`create-account-business.ts:12`) y en el catálogo; `UserPlan` mezcla legacy y duplica `'STARTER'` (`packages/types/src/user.model.ts:26`) y `business.model.ts:33` anula su unión con `| string`
- Norma incumplida: `infra/context/product.md:57` — "Plans and business types must come from Supabase/reference catalog sources of truth, not hardcoded application lists"

**Impacto:** drift garantizado. Un alias o precio nuevo exige tocar 8-9 puntos; olvidar uno hace que el mismo pago se comporte distinto según la ruta. El template con `$25.000` se desincroniza de la DB en cuanto cambie el precio (hay ramas activas sobre precios). El plan gating efectivo es un no-op.

**Implementación:** una sola fuente (catálogo + `plan_aliases` en DB) expuesta por `@orvel/domain` y consumida por landing, dashboard y Edge Functions; eliminar las uniones literales duplicadas o añadir un contrato que las compare con el catálogo; mover el precio del template a un binding.

**Esfuerzo:** L

### A-13 · Gate de `CRON_KEY` inconsistente y función de recordatorios sin bloque de `verify_jwt`

**Evidencia**
- `supabase/config.toml` declara bloques para 9 funciones (líneas 430-472); **no existe** `[functions.appointment-reminders-24h]`, cuya única barrera es `CRON_KEY` (`supabase/functions/appointment-reminders-24h/index.ts:35-47`, acepta `x-cron-key` o `Authorization: Bearer $CRON_KEY`)
- La convención del repo para estas funciones es `verify_jwt = false` (así lo hacen `purge-elapsed-bookings`, `release-expired-booking-holds`, `operator-lifecycle-pushes`, `account-closure`)
- `release-expired-booking-holds` invoca `release_expired_booking_hold(NULL, NULL)` (barrido global) y ese RPC está **granted a `anon`**: `supabase/migrations/20260904120000_manual_booking_deposits.sql:136`, mientras `purge_elapsed_bookings` sí exige `auth.role() = 'service_role'` (`20260906211000_purge_elapsed_bookings.sql:15-18`)

**Impacto:** con el default `verify_jwt = true`, un scheduler que mande `Bearer $CRON_KEY` recibe 401 y los recordatorios **nunca corren** (outage silencioso) — y si se desplegó con `--no-verify-jwt`, ese hecho no está documentado ni cubierto por CI. Del otro lado, el efecto del cron de holds es alcanzable por `anon` vía PostgREST: el `CRON_KEY` no agrega autorización real (acotado a holds ya vencidos, pero escribe `booking_deposit_strikes`/`booking_deposit_evidence`).

**Implementación:** añadir el bloque `verify_jwt = false` explícito con test estático (como purge/release); revocar `EXECUTE` a `anon`/`authenticated` en `release_expired_booking_hold` o exigir `service_role` para la forma global; validar `req.method === 'POST'` en todas las funciones cron (hoy solo lo hacen `account-closure` y `subscription-expiry-check`).

**Esfuerzo:** S

### A-14 · Overload `SECURITY DEFINER` ejecutable por `anon` que filtra entitlements de cualquier negocio — **CONFIRMADO en runtime**

**Evidencia**
```sql
-- supabase/migrations/20260529000000_billing_plans_and_entitlements.sql:84-108
create or replace function public.get_business_entitlements_snapshot(
  business_id text, tenant_id text)
... language sql security definer stable     -- sin SET search_path, sin chequeo de rol/uid
```
- Todos los `DROP`/`REVOKE` posteriores apuntan a la firma **`(uuid, uuid)`**: `20260609130000_p0_mvp_backend_contract_fixes.sql:173`, `20260905210000_premium_trial_14_days.sql:170-171`, `20260506_consolidated_billing.sql:343-344`
- La variante `(text, text)`, creada en `20260529000000`, **nunca se borra ni se revoca**, así que conserva el `EXECUTE` por defecto a `PUBLIC`
- PostgREST resuelve por nombres de argumento, y el `tenant_id` es `businesses.owner_id` (`supabase/functions/create-subscription/index.ts:504`, `20260905210000_premium_trial_14_days.sql:109`), que expone C-2

**Evidencia (runtime, prueba diferencial)** — misma business/tenant, misma sesión anónima, solo cambia el nombre de los parámetros:

| `POST /rest/v1/rpc/get_business_entitlements_snapshot` | Pre-release | **Producción** |
|---|---|---|
| `{"business_id": …, "tenant_id": …}` → firma `(text,text)` | HTTP 200, 1 fila | **HTTP 200, 1 fila** |
| `{"p_business_id": …, "p_tenant_id": …}` → firma `(uuid,uuid)` (revocada) | HTTP 401 `42501` | **HTTP 401 `42501`** |

Columnas devueltas: `plan_code`, `subscription_status`, `max_locales`, `max_rubros`, `max_monthly_bookings`, `ai_credits_monthly`, `business_id`, `tenant_id` (valores no volcados). La diferencia entre las dos filas es la prueba de que el `REVOKE` se aplicó a la firma equivocada.

**Impacto:** sin autenticación, con la anon key, se leen plan, estado de suscripción y límites de cualquier negocio cuyo `owner_id` se conozca — y C-2 lo entrega (5 de 19 negocios en producción). Es inteligencia comercial cross-tenant y confirma que la base no distingue "overload nuevo" de "overload revocado".

**Implementación:** `DROP FUNCTION IF EXISTS public.get_business_entitlements_snapshot(text, text);` y añadir guard (`auth.role()` / `is_business_owner`) a cualquier overload nuevo, con `SET search_path = public, pg_temp`. Un check estático que compare las firmas creadas contra las revocadas evitaría la recurrencia.

**Esfuerzo:** S

### A-15 · Fechas: conversión civil→UTC dependiente del dispositivo y render sin `timeZone`

**Evidencia (construcción)**
```ts
// apps/dashboard/src/app/features/booking/pages/turnos-list.page.ts:891-895
startsAtIso: new Date(`${date}T${startTime}:00`).toISOString(),   // interpreta hora local del dispositivo

// packages/booking/src/application/booking-record.ts:36-48
export function toArgentinaDate(date: Date): Date {
  const [year, month, day] = date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }).split('-').map(Number);
  return new Date(year, month - 1, day);        // Date local con wall clock argentino
}
export function toStartsAtIso(fecha: Date, hora: string): string {
  const start = new Date(fecha);
  start.setHours(hours, minutes, 0, 0);         // aplica el offset del dispositivo
  return start.toISOString();
}
```
También `apps/dashboard/src/app/features/booking/pages/turno-form.page.ts:574` (`new Date(year, month-1, day)`). El repo ya tiene el patrón correcto en el mismo módulo (`toArgentinaTime` con `timeZone`, `booking-record.ts:33-35`) y en `apps/dashboard/src/app/core/time/argentina-clock.ts:1-21`.

Reproducción del mismo input en dos dispositivos (ejecutada):

```
TZ=UTC                            → 2026-09-28T09:00:00.000Z
TZ=America/Argentina/Buenos_Aires → 2026-09-28T12:00:00.000Z   # 3 h de diferencia
```

**Evidencia (render)** — `Intl`/`toLocale*` sin `timeZone`: `public-booking.page.ts:1060-1067` (`formatSlot`), `manage-booking.page.ts:158-162`, `public-booking-deposit-hold.ts:207-228`, `turnos-list.page.ts:780-784`.

**Impacto:** en un dispositivo que no esté en `America/Argentina/Buenos_Aires` (notebook en UTC, operadora de viaje, tablet mal configurada) los bloqueos y los turnos manuales/walk-in se guardan desplazados (3 h en UTC): huecos o solapamientos en la agenda, y el bloqueo no cubre el rango elegido. Del otro lado, el cliente ve el horario del slot, el de su turno confirmado y el vencimiento de la seña desplazados por el offset de *su* dispositivo, así que puede llegar a la hora equivocada. En un producto de turnos esto es un bug de negocio, no cosmético.

**Implementación:** un único helper `civilToUtcIso(dateKey, hhmm, timeZone)` en `core/time/` usado en `buildBlockedTimeIso`, `toStartsAtIso` y `turno-form.page.ts`; pasar `timeZone: businessTimezone() || DEFAULT_BUSINESS_TIMEZONE` en todas las llamadas de `Intl` de las rutas de booking. Tests con `TZ=UTC` y `TZ=America/Argentina/Buenos_Aires` que exijan el mismo ISO/label (hoy `vitest.config.ts` no fija `TZ`).

**Esfuerzo:** M

### A-16 · El gate de acceso y los entitlements viven en un fixture congelado, y `plan` es escribible por el cliente

**Evidencia**
- `apps/dashboard/src/app/core/plans/plan-entitlements.ts:22` → `const referenceCatalog = getRuntimeReferenceCatalogSnapshot();` (y de ahí `CANONICAL_PLAN_CODES:24`, `PLAN_CODE_ALIASES:26`, `CANONICAL_PLAN_ENTITLEMENTS:32`), evaluado **una vez** al importar el módulo
- `apps/dashboard/src/app/features/onboarding/data-access/business-type-defaults.ts:37,39-52,72-90` congela el mismo snapshot y además hardcodea `onboardingBusinessTypeDisplayOrder`
- `apps/dashboard/src/app/core/catalog/reference-catalog.gateway.ts:27` → el fallback es `DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE` (`packages/domain/src/reference-catalog.ts:46-105`: planes, precios, 9 alias y 8 rubros hardcodeados)
- `refreshRuntimeReferenceCatalog()` se llama **solo** desde `apps/dashboard/src/app/features/onboarding/pages/signup-business-types-step.page.ts:343`; `apps/dashboard/src/app/app.config.ts` no tiene `provideAppInitializer`
- La guarda de rutas consume esas constantes congeladas: `apps/dashboard/src/app/core/auth/route-protection.ts:7,290,321-335`
- El límite de negocios por plan se decide en la UI sobre el claim del usuario: `business.service.ts:561-575` (`const plan = (user.plan || '').toUpperCase(); if (plan === 'FREE' | 'STARTER' | '') …`) y ese claim lo escribe el propio cliente: `signup-business-types-step.page.ts:181-199` (`plan: defaults.plan` dentro de `supabase.auth.updateUser({ data: metadata })`)

**Impacto:** en una sesión normal el catálogo runtime nunca se refresca, así que sigue siendo el fixture: agregar o quitar un rubro o un plan en Supabase (la fuente de verdad declarada) **no tiene efecto** en quién puede entrar al dashboard ni en los entitlements. Al mismo tiempo, `user_metadata.plan` es escribible por el usuario autenticado, de modo que el gating de multi-negocio y del tema premium es auto-asignable sin pago (la sincronización con la DB es cosmética). La autorización de acceso al producto depende de datos que el cliente controla o que quedaron hardcodeados.

**Implementación:** exponer planes/rubros desde un getter que lea el snapshot vivo (o signals) y sembrar el catálogo en `app.config.ts` con `provideAppInitializer` antes del primer `canActivate`; mover el gating de plan y de tema a `get_business_entitlements_snapshot` (ya existe y se consume en `features/billing/data-access/subscriptions/entitlements.api.ts:46`), tratando `user_metadata.plan` como cosmético; eliminar `onboardingBusinessTypeDisplayOrder` usando `sort_order` del catálogo.

**Esfuerzo:** M

---

## 4. Hallazgos medios

### M-1 · `web_push_outbox` sin claim atómico: doble envío y pérdida silenciosa
`_shared/process-web-push-outbox.ts:181-182` lee `.eq("status","pending").limit(50)` sin `FOR UPDATE SKIP LOCKED` y marca el estado **después** de enviar (`:202`); el trigger de encolado hace `net.http_post` por fila (`supabase/migrations/20260825004500_request_web_push_outbox_processing.sql:41-45`), así que dos drains concurrentes envían el mismo push. Peor: `:204` marca `skipped` ante cualquier error inesperado, sin reintento ni alerta. El outbox de **email** sí implementa el patrón correcto (`20260620120000_atomic_notification_email_outbox_claim.sql:19-61`) y sirve de molde. **Esf.: M**

### M-2 · Solo 4 de 16 Edge Functions se despliegan por CI
`deploy-promotion.yml:61,66,71,76` despliega `process-email-outbox`, `release-expired-booking-holds`, `operator-lifecycle-pushes` y `account-closure`. El resto (recordatorios, purge, verificación de signup, push, handoffs, billing, `subscription-status`) se despliega a mano, así que el `verify_jwt` remoto puede no coincidir con `config.toml`. Existe ya un contrato rojo que lo reclama (`apps/dashboard/src/app/tests/integration/orvel-appointment-reminder-scheduler.red.contract.spec.ts:179-190`) y una nota en `openspec/changes/operator-lifecycle-pushes/exploration.md:44-45`. **Esf.: M**

### M-3 · `subscription-status`: lectura de estado de suscripción sin identidad, con service role
`supabase/functions/subscription-status/index.ts:30-42` toma `subscription_session_id`/`preapproval_id` de la query y consulta `business_subscriptions` y `pending_signup_intents` con la service role, sin usuario ni ownership (`:44-85`). El identificador es una capacidad (`external_reference = preapproval-session:<hash|token>`, `create-subscription/index.ts:826`), así que no es enumerable — de ahí Media y no Alta — pero sigue siendo datos de otro negocio servidos a un anónimo si el id se filtra (referer, logs, analytics) y una función heredada de Mercado Pago. **Esf.: S**

### M-4 · Superficie Mercado Pago zombie que contradice ADR 0009
- `supabase/config.toml:430-431` mantiene `[functions.sync-mp-plans] verify_jwt = false` para una función que **no existe** en el repo, cuando `infra/context/architecture.md:26` afirma que no está
- `supabase/functions/account-closure/index.ts:49` sigue defaulteando `provider` a `"mercado_pago"` y leyendo `mp_preapproval_id` — el follow-up #2 de `docs/adr/0009-remove-mercadopago.md` (flip del default a `'manual'`) nunca se hizo
- `supabase/functions/subscription-expiry-check/index.ts` (no está en `config.toml`, no está en ningún workflow) lee `MP_ACCESS_TOKEN` sin usarlo (`:107`), loguea `mp_preapproval_id` (`:111`) y **escribe** `status: "expired"` (`:89-96`), lo que puede encadenar cierre de cuenta
- `apps/landing/src/pages/api/subscriptions/start.ts` (333 líneas) crea preapprovals y redirige al `init_point`, pero `create-subscription` ya devuelve siempre `init_point: null` (`:533`, `:967`, `message: "manual_mode"`), así que ese camino **no puede tener éxito** con el código del repo; el modelo vigente es transferencia manual por alias (`apps/landing/src/pages/billing/subscription.astro:16`)

**Impacto:** código muerto que parece vivo, con escrituras de estado en el medio; un bloque de config que dejaría un endpoint sin JWT si alguien redespliega esa función. **Esf.: M**

### M-5 · `localStorage`: el "cifrado de tokens" es teatro de seguridad y el código está muerto
`apps/dashboard/src/app/services/encrypted-token-storage.ts` y `apps/landing/src/lib/encrypted-token-storage.ts` son **idénticos** y afirman: *"This ensures tokens cannot be decrypted even if XSS attacker gains access to localStorage"* (`:5-7`). Falso: la clave vive en memoria del mismo contexto JS donde corre el XSS, `generateKey(..., true, ...)` la marca extraíble (`:20-24`) y el atacante puede llamar a `decryptToken`. Además la clave se **regenera en cada carga** (`:19-27`), `initEncryption()` solo se llama al persistir (`auth-provider.ts:167`), `getDecryptedSessionToken()` exige `isEncryptionReady()` (`:98`) y **no tiene consumidores**; `expiresAt` (`:186`) nunca se valida. La sesión real la persiste supabase-js en texto plano bajo `orvel.supabase.auth` (`core/runtime/supabase-client.factory.ts:8-11`, `supabase-auth-adapter.ts:71-74`), que es lo que un XSS busca primero (ver C-1). `apps/dashboard/src/app/services/auth.service.ts:3` repite el mismo comentario engañoso.

**Impacto:** falsa sensación de seguridad en revisiones futuras, más código muerto y duplicado entre apps; un `orvel.session.v1` v2 que nunca se puede descifrar. **Esf.: M** (eliminar el módulo o mover la sesión a cookie `HttpOnly` si se quiere protección real contra XSS)

### M-6 · Endpoints públicos: enumeración de usuarios y ausencia de CSP/HSTS
- **Enumeración:** `create-account-business.ts:237-239` responde `202 signup_confirmation_requested` para email existente y `:322` `200 signup_ready` para email nuevo; `waitlist.ts:49-57` devuelve 409 `already_exists`. Permite construir listas de clientes/prospectos sin autenticación
- **Cabeceras:** `scripts/vercel-output-config.mjs:11-16` define solo `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` (deprecado) y `Referrer-Policy`. Faltan `Content-Security-Policy`, `Strict-Transport-Security` y `Permissions-Policy`, con JSON-LD inline y `@vercel/analytics` en la landing y scripts inline en `apps/dashboard/src/index.html`. Las cabeceras solo existen en el patch del Build Output: cualquier regeneración a mano de `config.json` las pierde (comentario en `:6-10`)

**Impacto:** sin CSP, C-1 se explota sin mitigación (una CSP con nonces es la mitigación estructural mientras se arregla el escape). La enumeración facilita phishing y prospección competitiva. **Esf.: M** (CSP: L)

### M-7 · PII en claro donde el diseño dice cifrado
`apps/landing/src/pages/api/signup/create-account-business.ts:235` guarda `first_name`, `last_name` y `phone` en `user_metadata` (texto plano en `auth.users.raw_user_meta_data`), mientras el flujo de alta paga cifra la misma PII con AES-GCM + HMAC (`apps/landing/src/lib/server/pending-signup-pii-protection.ts:60-73`, `create-account-business.ts:278-287`). Se elude por el camino gratuito el diseño de protección que el repo ya tiene. **Esf.: M**

### M-8 · `apps/ops` guarda PII de prospectos en `localStorage` sin validación
`apps/ops/src/infrastructure/local-storage.store.ts:7` (`orvel-ops.v1`), `:32-36` valida solo `version`/arrays y castea el resto; `:44-46` escribe sin manejar `QuotaExceededError`. Los contactos incluyen nombre, teléfono, dirección y notas (`apps/ops/src/domain/contact.ts:11-24`), sin caducidad ni borrado. El contrato hexagonal sí se respeta (nada de Vue/DOM en dominio y aplicación) y está fuera del workspace por decisión documentada. **Esf.: M**

### M-9 · Credenciales demo commiteadas y usadas por los e2e
`supabase/README.md:5-6` publica `demo@turnea.app` / `demo1234`, y aparecen como literal en `tests/e2e/dashboard.spec.ts:67-68` y como fallback en `tests/e2e/dashboard-authenticated-diagnostics.spec.ts:22-23`, que se autentica contra un Supabase real y ejecuta CRUD. Si la cuenta vive en un proyecto accesible, es una credencial válida publicada. **Esf.: S**

### M-10 · `local-dev-proxy` escucha en todas las interfaces y enruta por `Referer`
`scripts/local-dev-proxy.mjs:185` hace `.listen(PROXY_PORT, ...)` sin host (⇒ `0.0.0.0`/`::`), reenvía todas las cabeceras del cliente (`:60`, `:112`) y decide el ruteo con una cabecera controlable (`:51`, `:97`). En una red compartida, cualquiera alcanza el puerto 3000 y obtiene respuestas del dev server autenticado; cualquier web visitada puede llamar a `http://localhost:3000`. **Esf.: S**

### M-11 · Precio hardcodeado en el template y gateway de booking duplicado
- `apps/dashboard/src/app/features/billing/pages/billing-subscription.page.html:22` → `<p class="billing-subscription__price">$25.000/mes</p>`
- `apps/dashboard/src/app/core/api/supabase-booking.gateway.ts` (876 líneas) **no lo usa producción**: solo lo importan specs (`supabase-booking.gateway.contract.spec.ts:2`, `supabase-booking.mvp-phase1-red.contract.spec.ts:2` y otros que lo leen por `readFileSync`), mientras la app usa `RealSupabaseBookingGateway` de `@orvel/booking` (`features/booking/booking.providers.ts:34-37`). Dos implementaciones del mismo gateway, una muerta, sostenida por tests

**Impacto:** el precio se desincroniza de la DB; el gateway muerto confunde y duplica el costo de mantenimiento. **Esf.: M**

### M-12 · Capas: una página escribe en la base directamente; archivos god
`apps/dashboard/src/app/features/onboarding/pages/signup-business-types-step.page.ts:133,150,170` escribe en `businesses`, `business_settings` y llama un RPC de provisioning desde la página (el resto del acceso a datos sí está en `data-access` — 41 llamadas en 6 archivos). Archivos más grandes, todos por encima de 1.000 líneas: `features/booking/pages/public/public-booking.page.ts` (1.216), `supabase/functions/cancel-subscription/index.ts` (1.173), `features/settings/pages/configuracion.page.ts` (1.112), `features/servicios/data-access/servicio.service.ts` (1.057), `supabase/functions/create-subscription/index.ts` (1.000), `features/booking/pages/turnos-list.page.ts` (1.013). `apps/dashboard/src/app/services/auth.service.ts:119` usa `this.isAuthenticated.set(null as any)` en un `signal<boolean>`. **Esf.: L**

### M-13 · Workflow dormido con camino de despliegue a producción
`apps/dashboard/.github/workflows/deploy.yml` (inerte: GitHub solo lee `.github/workflows/` en la raíz) contiene `branches: [dev]`, `supabase/setup-cli@v1` con `version: latest`, `SUPABASE_ACCESS_TOKEN` y `supabase functions deploy create-subscription` contra un project ref de producción. Si la app se extrae a su repo, se activa tal cual. Borrarlo o archivarlo. **Esf.: S**

### M-14 · `apps/ops` no corre ninguna prueba en CI y `@orvel/shared` apunta a un lugar inesperado
- `apps/ops` tiene 11 specs vitest y 2 e2e (`apps/ops/e2e/*.spec.ts`, `apps/ops/playwright.config.ts`) pero `package.json` no expone `test:e2e` y el config raíz apunta a `./tests/e2e`; nada de ops corre nunca
- `apps/shared/email-templates/package.json:2` se llama `@orvel/shared` mientras `packages/shared` es la carpeta reservada (`AGENTS.md`), y las Edge Functions lo importan por ruta relativa profunda (`supabase/functions/process-email-outbox/index.ts:2`, `_shared/process-email-outbox-helpers.ts:1`), sin dependencia declarada
- `apps/landing` importa `packages/booking` por ruta relativa (`apps/landing/src/lib/booking-share-head.ts:4`, `booking-share-match.ts:1`), fuera del `exports` map, y `packages/booking` arrastra `@angular/core` y `zone.js` (`packages/booking/package.json:27-32`) en un paquete que la landing compila

**Esf.: M**

### M-15 · `services` y `branches` enumerables por `anon` sin conocer ningún slug — **CONFIRMADO**
`supabase/migrations/20260629190000_harden_public_services_rls.sql:7-11` (`CREATE POLICY "Public view active services" … TO anon, authenticated USING (COALESCE(is_active, true) = true)`) y `20260524_branch_scoped_bookings.sql:37-39` (`"Public view active branches" … USING (is_active = true)`). Verificado con la anon key: `services` activos → **166 filas en pre-release y 180 en producción**; `branches` activos → **15 y 19**. Es decir, cualquiera puede volcar el catálogo completo de **todos** los negocios (nombres, precios y duración de servicios; nombre, slug y timezone de cada sucursal) sin conocer ningún slug: enumeración cross-tenant de datos comerciales. El catálogo público ya está cubierto por `resolve_business_by_slug` / `query_public_slot_availability`. **Esf.: M**

### M-16 · El esquema del repo no reproduce el esquema remoto y `seed.sql` rompe en un reset limpio
`supabase/migrations/20260420121000_booking_core_schema.sql:6-14` crea `businesses` **sin** `phone`/`email`/`address`; `20260729000000_create_businesses.sql:5-17` las declara con `create table if not exists` (no-op, la tabla ya existe) y ningún `ALTER TABLE public.businesses` del repo las añade; pero `supabase/seed.sql:20` inserta en esas columnas. La divergencia está reconocida en el propio repo (`20260828200000_enable_rls_on_20260729_public_tables.sql:3` → "Skip missing tables so remotes without the parallel schema still apply this migration"). Con `supabase/config.toml:62,65` el seed corre automáticamente en `db reset`: una base reconstruida solo desde migraciones falla. Conviven dos linajes de esquema (baseline `20260420…` y serie re-fechada `20260729…`), así que el repo no es la fuente de verdad del esquema efectivo. **Esf.: L**

### M-17 · `public.users` legacy con `password_hash` dentro del esquema publicado por la API
`supabase/migrations/20260729003000_create_users_and_professional_hours.sql:1-16` crea `public.users` con `email`, `password_hash` y `role ('admin'|'professional')`; RLS se activa sin políticas en `20260828200000_enable_rls_on_20260729_public_tables.sql:17-19`. Hoy es fail-closed, pero es una tabla de identidad paralela con hashes de contraseña en el esquema que PostgREST publica: un único error futuro (una política permisiva o un `GRANT`) la convierte en brecha de credenciales. El seed inserta además un admin (`supabase/seed.sql:125-135`). Ninguna app la usa. **Esf.: M**

### M-18 · La política del outbox contradice al cliente del dashboard
`supabase/migrations/20260501_consolidated_schema.sql:172` es la única política de `notification_email_outbox`: `FOR ALL USING (auth.role() = 'service_role')`. El dashboard intenta escribir como `authenticated` (`apps/dashboard/src/app/core/notifications/notification-sender.ts:27` → `supabase.from('notification_email_outbox').insert({…})`). No es explotable, pero el envío desde el dashboard falla en silencio por RLS (o el cliente es código muerto si el camino real va por Edge Function con service role). Si el camino es legítimo, falta la política de INSERT; si no, sobra el cliente. **Esf.: S**

### M-19 · Cuatro `SECURITY DEFINER` sin `SET search_path`, una de ellas dentro de políticas RLS
`supabase/migrations/20260501_consolidated_schema.sql:141-144` define `is_business_owner(uuid)` como `SECURITY DEFINER` **sin** `search_path` (el modificador va después del `$$`, por eso no aparece en greps de la definición) y se usa en RLS (`:162,164,165,167,170,171`, `20260524_branch_scoped_bookings.sql:34-35`). También `20260506_consolidated_billing.sql:165-166` y `20260707150000_mvp_free_premium_pricing_catalog.sql:185` (`get_active_plans`, `get_plan_by_code`). Los cuerpos están calificados con `public.`, así que no es explotable hoy, pero incumple el lint `function_search_path_mutable` y deja abierta la vía clásica de hijacking en funciones que corren dentro del planner de RLS. **Esf.: S**

### M-20 · `purge_elapsed_bookings` borra sin lotes y arrastra la evidencia de señas
`supabase/migrations/20260906211000_purge_elapsed_bookings.sql:20-21` → `DELETE FROM public.bookings WHERE ends_at <= now();` en una sola sentencia, de todos los tenants, mientras `booking_deposit_evidence` y `booking_deposit_strikes` cuelgan con `ON DELETE CASCADE` (`20260904120000_manual_booking_deposits.sql:40,52`). Bloqueos largos y WAL alto en un job periódico, y destrucción silenciosa de la evidencia de señas justo cuando se están agregando columnas de retención (`20260913120000_operator_lifecycle_retention.sql:6-8`). **Esf.: M**

### M-21 · 24 tablas en default-deny sin documentar, más tablas legacy duplicadas
Del cruce de `ENABLE ROW LEVEL SECURITY` contra `CREATE/DROP POLICY` sobre las 142 migraciones, 24 tablas quedan con RLS activo y **cero** políticas (`appointments`, `business_subscriptions`, `subscription_events`, `session_handoffs`, `users`, `payments`, `clients`, `notifications`, `email_outbox`, `mp_plan_catalog`, …), sin `COMMENT ON TABLE` que declare que el bloqueo es deliberado. Varias son duplicados muertos del baseline: `clients`/`appointments`/`notifications`/`email_outbox` conviven con `customers`/`bookings`/`dashboard_notifications`/`notification_email_outbox`. El default-deny es fail-closed, así que no hay exposición, pero es indistinguible de un olvido para el próximo que agregue una política. **Esf.: M**

### M-22 · Accesibilidad: 15 modales sin foco, sin trampa de foco y sin Escape; calendario sin nombres accesibles
- 15 `role="dialog"` en 6 templates (`configuracion`, `servicios`, `clientes`, `turnos-list`, `turno-form`, `signup-business-types-step`) con ARIA correcto pero sin foco inicial, sin `cdkTrapFocus`/`tabindex="-1"` y sin scroll-lock: `rg 'tabindex="-1"|cdkTrapFocus|autofocus'` en los HTML de `src/app` → 0 resultados; `keydown.escape` aparece **una** vez en todo `src/app` (`features/settings/pages/components/configuracion-time-picker-modal.component.ts:67-73`)
- `apps/dashboard/src/app/shared/components/calendar-picker/calendar-picker.component.html:14-25` son botones icon-only sin `aria-label` ni `aria-hidden` en el `<i>`, y los días no exponen `aria-pressed`/`aria-selected`

**Impacto:** con teclado o lector de pantalla no se pueden cerrar los modales, el foco queda detrás del overlay y el día elegido no se anuncia; en móvil el fondo sigue scrolleando. Bloquea operar la agenda sin mouse. **Esf.: M**

### M-23 · 691 líneas de persistencia de settings muertas y duplicadas
`apps/dashboard/src/app/features/settings/data-access/business-settings.facade.ts:150` (`BusinessSettingsFacade`) **no tiene ningún consumidor en producción** (solo lo instancia un spec RED, `kb010-configuracion-persistence-guard.red.contract.spec.ts:13-72`): la página viva inyecta `BusinessService`. Dentro quedan `STORAGE_KEY = 'atelier_business_settings'` (marca legacy), degradación silenciosa a `localStorage` (`source: 'local-fallback' | 'remote-fallback-local-storage'`) que el link público no lee, y 11 `console.log`. Es una segunda implementación de la misma persistencia esperando a que alguien la cablee. El camino vivo (`business.service.ts:324-407`) sí falla con error y no persiste localmente. **Esf.: M**

### M-24 · Catálogo de servicios hardcodeado y duraciones adivinadas por substring
`apps/dashboard/src/app/models/servicio.model.ts:18-118` define `SERVICIOS_POR_CATEGORIA` y `CATEGORIAS_SERVICIOS` en código; `features/servicios/data-access/servicio.service.ts:947-952` las mezcla en el camino productivo de Supabase (`syncStateFromRead`) y `:1050-1056` (`estimateCatalogDuration`) decide la duración con `normalized.includes('extensiones') ? 90 : 45`. Las categorías del operador se siembran como `categoria-seed-N` en vez de venir del catálogo, y las duraciones sugeridas entran a la agenda por coincidencia de texto en español. Contradice `infra/context/product.md:57`. **Esf.: M**

### M-25 · Inversión de capas: `core/` importa `features/` (incluida la guarda de auth)
`apps/dashboard/src/app/core/auth/route-protection.ts:6` importa `isAllowedOnboardingBusinessType` desde `features/onboarding/data-access/business-type-defaults`; también `core/dashboard/dashboard.service.ts:4-6` (servicios de tres features), `core/storage/browser-storage-keys.ts:1-3`, `core/auth/mock-login-business-types.ts:5,10`, `core/billing/landing-plans-source.api.ts:2`. Y al revés entre features: `features/billing/pages/billing-subscription.page.ts:9` importa `ONBOARDING_PLAN_STORAGE_KEY` desde la *page* de onboarding, lo que arrastra esa página al chunk de billing. La capa que autoriza depende de un feature: no se puede testear el gate sin él y cualquier refactor de onboarding cambia autorización en producción. **Esf.: M**

### M-26 · Defaults de política divergentes entre configuración y link público
`apps/dashboard/src/app/features/booking/pages/public/public-booking.page.ts:80,362` fija `maxAdvanceDays = 30` mientras `features/settings/pages/configuracion.page.ts:126` valida `maxAdvanceDays: [90, [Validators.min(1)]]`: si falta la fila de settings, el operador ve 90 días y el link público solo permite 30 (se publican turnos a más plazo del que el operador cree tener). Los porcentajes de seña válidos están triplicados como literal: `configuracion.page.ts:638` y `public-booking-deposit-hold.ts:39,55` (`[25, 50, 100].includes(...)`); la duración del hold (`DEPOSIT_HOLD_DURATION_MS = 30 * 60 * 1000`, `public-booking-deposit-hold.ts:111`) también es un literal local. **Esf.: S**

---

## 5. Hallazgos bajos y limpieza

- **Documentación desactualizada:** `infra/context/architecture.md:26` dice "14 Edge Functions" (hay 16) y afirma que no existe `sync-mp-plans` mientras `config.toml:430-431` tiene su bloque; `docs/adr/0010-hexagonal-architecture.md` declara borrado el shim `types.ts` que sigue existiendo y exportado (`packages/booking/src/types.ts`, `packages/booking/src/index.ts`), y el propio ADR admite leftovers de WU6
- **Comentarios que mienten:** `apps/dashboard/src/styles.scss:1` ("Remixicon se carga desde CDN en index.html": hoy es self-hosted vía `remixicon-used.css` + `angular.json:73`); `apps/dashboard/src/app/services/auth.service.ts:3` ("tokens are encrypted before storing"). `apps/dashboard/src/index.html:21-26` carga Google Fonts por CDN con handler inline (`onload="this.media='all'"`), mientras la landing self-hostea `@fontsource-variable/onest`: inconsistente y bloquea una CSP estricta
- **Servicio de push:** `apps/dashboard/src/orvel-push-sw.js:52-60` navega a `event.notification.data.url` sin validar que sea del propio origen (`clients.openWindow(targetUrl)`)
- **Ruido de calidad:** 96 `TODO/FIXME/HACK`, 20 `console.log` fuera de tests (concentrados en `apps/dashboard/src/app/features/settings/data-access/business-settings.facade.ts`, que loguea PII de negocio y usuario en consola), 49 `: any` en código de producción, 0 `@ts-ignore`; `const legacySingleDashboardCheck = ...; void legacySingleDashboardCheck;` (`shared/dashboard-shell/dashboard-shell.component.ts:175-176`) es código muerto con `void` para silenciar el linter
- **Workflow:** `booking-regression.yml:12` mantiene la rama `fix/public-booking-regressions-dev` en el trigger de `push`; `release-expired-booking-holds.yml:5` corre cada 5 minutos (288 ejecuciones/día) desde la rama por defecto; los `run: |` salvo uno no usan `set -euo pipefail` y el paso que resuelve el project ref no valida que el secret esté definido (`deploy-promotion.yml:26-28` produce `supabase_ref=` vacío en verde)
- **Node divergente:** `ci.yml:25` usa Node 22 y `booking-regression.yml`/`deploy-promotion.yml` Node 24, sin `engines` en el `package.json` raíz (las apps sí lo declaran)
- **`check-focused-tests.mjs:22-28`** solo bloquea `.only`; no cubre `skip`/`xit`/`todo`, así que una suite crítica se puede desactivar sin que salte nada
- **Higiene local (no del repo):** en el working tree hay `.env.local` (correctamente ignorado, pero con `SUPABASE_ACCESS_TOKEN_PROD` y `SUPABASE_SERVICE_ROLE_KEY` y permisos `644`) y directorios vacíos/ignorados `backend/`, `dashboard/`, `landing/`, `shared/` de la estructura previa al monorepo. Recomendado: `chmod 600 .env.local` y limpiar los directorios muertos
- **`manageToken` persistido en `localStorage` en la ruta pública:** `features/booking/pages/public/public-booking-deposit-hold.ts:103-106,112,149-159` serializa el hold completo, incluido el token que permite cancelar/reprogramar, en `orvel.public-deposit-hold:<slug>`. El cliente suele reservar desde el navegador del local (dispositivo compartido) y el token sobrevive hasta 30 minutos; un XSS o una extensión lo exfiltra. Mantenerlo en memoria o en `sessionStorage` con limpieza explícita
- **Escritura anónima sin cuota:** `record_public_booking_failure(...)` está granted a `anon` (`20260627235500_public_booking_failure_telemetry.sql:59`) y su tabla no tiene retención ni límite (`:6-14`): se puede inflar el almacenamiento y envenenar la telemetría. Los valores sí están saneados (`:37-51`)
- **Realtime con `REPLICA IDENTITY FULL` sobre PII de clientes:** `20260829220000_publish_dashboard_notifications_realtime.sql:6,17` publica `dashboard_notifications` (cuyo `body` incluye el nombre del cliente, `20260501_consolidated_schema.sql:229-230`) con todas las columnas del registro anterior en cada UPDATE/DELETE. Hoy la política es owner-scoped, así que no es explotable; un pulso sin datos (`notification_pulses(business_id, created_at)`) elimina el riesgo futuro
- **Extensiones sin esquema explícito:** `CREATE EXTENSION IF NOT EXISTS pgcrypto/pg_net` sin `WITH SCHEMA` en `20260501_consolidated_schema.sql:5-6`, `20260420121000_booking_core_schema.sql:5`, `20260529010000_approved_booking_billing_contract.sql:8`, `20260609030000_core_slice3_booking_canonical_contract.sql:7`, mientras la convención correcta existe en `20260609140000_fix_supabase_lint_blockers.sql:7` (`WITH SCHEMA extensions`). Con `public` expuesto en `config.toml:11`, el fallback publica funciones de extensión en la API
- **Cadena de prueba con credenciales fijas:** `supabase/seed.sql:8-10` documenta `test@orvel.dev` / `orvel1234!` y `:95-96` crea el usuario de auth con esa contraseña y `email_confirmed_at = now()`; la cabecera del archivo explica cómo aplicarlo a cualquier base (`db execute --file … OR via dashboard SQL editor`). El seed corre automáticamente en `db reset` (`config.toml:62,65`). Sacarlo de la config fuera de local y parametrizar la contraseña
- **`/billing/subscription` sin `canActivate`:** `apps/dashboard/src/app/app.routes.ts:42-45` (su ruta hermana `billing/subscription/cancel` sí lo tiene en `:46-50`). Hoy acotado porque `cancel-subscription` valida ownership server-side, pero el `businessId` que se envía sale de `localStorage` (`billing-subscription.page.ts:196-200`): añadir el guard y resolver el negocio desde la sesión
- **Hooks de test exportados en una page de producción:** `features/onboarding/pages/signup-business-types-step.page.ts:43,205-213,245-251` (`TEST_STORAGE_KEY`, `getTestStorage`, `setTestStorage`) sin llamadores; ya hay un contrato RED pendiente (`tests/unit/m8-hardcoded-test-hooks-cleanup.red.contract.spec.ts`). Eliminarlos e inyectar storage por DI
- **Presupuesto de bundle irrelevante:** `apps/dashboard/angular.json:98-107` permite `initial` de 2 MB de warning y 3 MB de error (un bundle Angular típico ronda cientos de kB), así que ninguna regresión de tamaño —como el arrastre de una page completa al chunk de billing (M-25)— dispara aviso. Medir el build actual y fijar umbrales reales (p. ej. 700 kB / 1 MB)
- **Copy de negocio dentro del bundle:** `apps/dashboard/src/app/core/billing/premium-alias-receipt.ts:1-5` (`PREMIUM_TRANSFER_ALIAS = 'orvel.pagos'`, `PREMIUM_PRICE_COPY = '$25.000'`, `PREMIUM_WHATSAPP_NUMBER`, mensaje con el importe). Cambiar el alias o el precio exige release y puede dejar clientes pagando a un destino o importe viejo; moverlo a la fila de catálogo/settings con las constantes como fallback

---

## 6. Lo que está bien (verificado, no hace falta tocar)

1. **RLS habilitado en el 100% de las tablas y sin `GRANT` de tabla declarado en migraciones:** las 53 tablas creadas tienen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` y el acceso público está diseñado para pasar por RPCs `SECURITY DEFINER`. Las políticas permisivas legacy de `bookings` (`USING (true)`) fueron eliminadas y el acceso directo revocado (`supabase/migrations/20260615174014_harden_public_bookings_direct_access.sql:6-13`); el endurecimiento de `web_push_outbox` va en la misma línea (`20260824231000_create_web_push_outbox.sql:21-31`). **Verificado en runtime con la anon key:** `bookings` responde `401 42501` (grant revocado) y `customers`, `notification_email_outbox` y `business_subscriptions` responden `200 []` (default-deny de RLS funcionando). Lo que falta es la misma limpieza en `businesses`/`business_settings`/`services`/`branches` (C-2, M-15).
2. **Outbox de email atómico y auditable:** claim con timeout (`20260620120000_atomic_notification_email_outbox_claim.sql:19-61`), finalización condicionada a `processing_claim_id` (`process-email-outbox/index.ts:236-251`), `DIRECT_SEND` deshabilitado con 403 (`:322`).
3. **Handoff de sesión bien construido:** handoff opaco de 256 bits + AES-GCM, clave obligatoria de 32 bytes, redeem atómico single-use (`_shared/session-handoff.ts:76-115,211-233`), cookies `HttpOnly; SameSite=Lax` con `Secure` y prefijo `__Host-` en HTTPS (`apps/landing/src/lib/server/pending-signup-handoff.ts:157-163`) y binding verificado server-side (`:350-352`).
4. **Antídoto de open redirect en las dos puntas:** `apps/landing/src/lib/auth-return-to.ts:103-146` y `apps/dashboard/src/app/core/auth/route-protection.ts:51-83` (rechaza `//`, esquemas, parámetros de token/pago y orígenes ajenos). El guard del dashboard es real y no acepta el `localStorage` legacy como autorización (`route-protection.ts:366-382`).
5. **CORS sin comodines:** allowlist exacta con `Vary: Origin` y sin `Access-Control-Allow-Credentials` en todo el repo (`_shared/billing-security.ts:51-69`, `_shared/session-handoff-cors.ts:20-48`).
6. **Operación de producción seria en `scripts/trial-reminder-production.sh`:** `set -euo pipefail`, `ulimit -c 0`, capability por fd 3 con token de 64 hex, bloqueo de overrides peligrosos (`NODE_OPTIONS`, `BASH_ENV`), exigencia de modo `0600` del fichero de secretos y **verificación del project ref contra `supabase/production-project-ref.sha256`** (`:64-76`) — patrón que `deploy-promotion.yml` debería copiar.
7. **Política de instalación endurecida:** `.npmrc` con `save-exact`, `ignore-scripts`, `minimum-release-age=4320`, `strict-peer-dependencies`; `allowBuilds` explícito para los 5 nativos en `pnpm-workspace.yaml:17-22`; cero `postinstall`/`prepare` en todo el repo.
8. **Dominio de booking testeado en serio:** `packages/booking/src/domain/*` con política UTC canónica documentada (`availability-core.ts:118-123`) y goldens (`availability.golden.spec.ts`); el service worker de Angular no cachea respuestas de API (`ngsw-config.json:4-51`, solo `assetGroups`).
9. **`apps/ops` respeta su contrato hexagonal:** nada de Vue/DOM/`localStorage` en `domain` y `application`; la UI habla solo con `OpsFacade`.
10. **Operaciones destructivas con red de seguridad en la base:** el `DROP TABLE` de ledgers legacy aborta si la tabla tiene filas (`supabase/migrations/20260708100000_prune_legacy_billing_ledgers.sql:74-95`), y la normalización de ACL de las funciones de recordatorio se auto-verifica con `aclexplode`/`has_function_privilege('anon', …)` (`20260712190000_normalize_legacy_reminder_function_acl.sql:104-141`); los `EXECUTE format(...)` solo reciben `pg_roles.rolname`, nunca input de usuario.
11. **Sin superficie clásica de XSS en el dashboard:** `innerHTML`, `outerHTML`, `bypassSecurityTrust*`, `DomSanitizer`, `eval`, `new Function`, `document.write` e `insertAdjacentHTML` no aparecen en `apps/dashboard/src/app` fuera de specs; no hay scripts de terceros en `index.html`; y el servicio de push solo se alimenta hoy con una ruta constante (`_shared/process-web-push-outbox.ts:98`).
12. **La hora del cliente ya no autoriza nada:** el `now_iso` que la PWA sigue enviando es un parámetro muerto; la ventana de cancelación y el vencimiento del `manageToken` se evalúan con `now()` del servidor (`20260628143000_enforce_reschedule_canonical_availability.sql:56-63,138-148`). El modo `mock` de los servicios de datos es opt-in solo para tests.
13. **Sin vistas ni Storage en el esquema:** `rg "create (or replace )?(materialized )?view"` sobre las migraciones → 0 resultados (no hay hueco de `security_invoker`), y no hay definiciones de buckets ni políticas de `storage.objects`.

---

## 7. Plan de acción sugerido

**Ola 0 — esta semana (≤ 1 día en total):**
1. Escapar el `<title>` del share + test de contrato (C-1).
2. Verificar y cerrar la exposición de `business_settings`/`businesses` (C-2): `DROP POLICY` + `REVOKE SELECT` y check estático contra políticas `USING (true)` en tablas con PII o datos de cobro.
3. `DROP FUNCTION public.get_business_entitlements_snapshot(text, text)` y `REVOKE EXECUTE ... FROM anon, authenticated` en `release_expired_booking_hold` (A-14, A-13).
4. Quitar el fallback por claim JWT en los dos outboxes (A-1).
5. Fijar `version: 2.98.2` en `setup-cli`, `--frozen-lockfile` en `vercel.json`, `permissions: contents: read` en los 5 workflows, y borrar `apps/dashboard/.github/workflows/deploy.yml` (A-8, A-11, M-13).
6. Ejecutar el guard de drift desde el base ref y añadir `CODEOWNERS` (A-3).
7. Cablear `test:supply-chain` en `check` y arreglar `deploy-promotion-workflow.test.mjs` (A-9, parcial).
8. Quitar credenciales de prueba del README, del seed y de los specs; `ORVEL_E2E_*` obligatorios (M-9).
9. `ALTER FUNCTION public.is_business_owner(uuid) SET search_path = public, pg_temp;` y las otras tres (M-19).

**Ola 1 — 1 a 2 semanas:**
10. Suite completa de dashboard y landing en `ci.yml` + job e2e con Playwright (moviendo `auth-flow.spec.ts` a `tests/e2e/`), y `ci.yml` como check requerido; decidir qué hacer con los 77 `.red.contract.spec.ts` (A-9).
11. `db push --dry-run` + build bloqueante previo + verificación de project ref en `deploy-promotion.yml` (A-2).
12. Helper `civilToUtcIso` + `timeZone` explícita en el render de booking, con tests bajo `TZ=UTC` (A-15).
13. `process.env`/`astro:env` para los secretos de las rutas SSR de landing (A-5).
14. Rate limit + `Content-Type`/`Origin` en `protect`, `finalize` y `waitlist`; RPC de existencia por `email_hmac` en lugar de `listUsers` (A-6).
15. CSP (`default-src 'self'`, hashes para JSON-LD/analytics) + HSTS + `Permissions-Policy` en `scripts/vercel-output-config.mjs` (M-6).
16. Decisión de producto sobre `email_confirm` y política de contraseñas (A-7).
17. Sembrar el catálogo de referencia en `app.config.ts` y mover el gating de plan a la DB (A-16).

**Ola 2 — mes:**
18. Un secreto por función cron; separar el destructivo (`account-closure`) (A-4); arreglar `appointment-reminders-24h` (A-13).
19. Fuente única de planes/precios/rubros desde el catálogo (A-12), empezando por quitar el precio del template (M-11).
20. Desplegar todas las Edge Functions por CI y comparar `verify_jwt` remoto vs `config.toml` (M-2).
21. Limpieza de la superficie Mercado Pago siguiendo los follow-ups de ADR 0009 (M-4).
22. Claim atómico en `web_push_outbox` + reintentos con alerta (M-1).
23. Eliminar el gateway de booking muerto, el facade de settings y `encrypted-token-storage` (M-5, M-11, M-23).
24. Migración puente que haga reproducible el esquema y archivar la serie `20260729…` en `_legacy/` (M-16).
25. Primitivo de diálogo accesible (foco, Escape, trap, scroll-lock) y ARIA del calendario (M-22).

---

## 8. Límites de este informe

- **Confirmado en runtime el 2026-09-28** (solo `GET`/`POST` de lectura, sin volcar valores, con la anon key pública): C-2, A-14 y M-15, tanto en el proyecto de pre-release (`orvel-qa-dev`, vía `.env.local`) como en **producción** (anon key servida públicamente en `https://orvel.pro/dashboard/runtime-env.js`, proyecto verificado contra el digest de `supabase/production-project-ref.sha256`). C-1 no se probó contra el sitio desplegado: su explotabilidad depende del commit desplegado y de que exista un negocio con el payload inyectado (no lo inyecté).
- **No verificado y no verificable desde el repo:** estado remoto de `verify_jwt` por función; existencia remota de `sync-mp-plans`/`mercadopago-webhook` (ADR 0009 deja el undeploy pendiente); configuración de los rulesets (`pr-reviews`, `ci-gate`, `promotion-drift-guard`) y required reviewers del environment `orvel-prod`; `default_workflow_permissions` del repo/org; si `SUPABASE_PROJECT_REF_QA` y `_PROD` están definidos y son distintos; si la cuenta demo sigue viva; qué variables hay en el entorno de build de Vercel y qué contiene el bundle desplegado.
- **No ejecutado:** `pnpm audit --prod` / `scripts/supply-chain-hardening.test.mjs` (bloqueados por el sandbox de solo lectura del store de pnpm: `ERR_PNPM_LOCKFILE_WRITE_FILE`); ninguna suite de tests (no sé cuántos de los 77 `.red.contract.spec.ts` siguen realmente en rojo: el rótulo es una afirmación del propio archivo); ningún build; ningún comando de Supabase contra remoto. **Recomendado correr `pnpm run check` y `pnpm run security:audit:prod` en un entorno con escritura.**
- **No auditado en profundidad:** cada política RLS una por una (se validó cobertura por tabla, superficie de grants, políticas `USING (true)` y funciones `SECURITY DEFINER` por firma), las 142 migraciones históricas una por una, las plantillas de email, accesibilidad más allá de los modales y el calendario, performance/bundle size medido y la corrección funcional de los flujos de negocio.
- **Sospechas no confirmadas** (no incluidas como hallazgos): `process-email-outbox/index.ts:148-164` acepta cualquier esquema en `links.*` vía `new URL(value, base)` — un `javascript:` quedaría como `href` en un email; quién puede escribir esos links no se verificó.

---

## 9. Anexo — métricas y reproducción

| Métrica | Valor |
|---|---|
| Archivos trackeados / líneas | 1.309 / ~150k |
| Specs y tests | 449 (dashboard 298, landing 67, supabase 43, packages 16, scripts 11, ops 11) |
| Specs del dashboard que corren en CI | 14 de 298 (4,7%) |
| Archivos `.red.contract.spec.ts` (dashboard) | 77, ninguno en ninguna puerta |
| Tablas con RLS habilitado | 53 de 53 |
| Tablas en default-deny sin política ni comentario | 24 |
| Grants de tabla a `anon` declarados en migraciones | 0 (los relevantes vienen de los privilegios por defecto de Supabase y de las políticas `USING (true)` de C-2) |
| Migraciones / Edge Functions | 142 / 16 |
| `TODO/FIXME/HACK` · `console.log` · `: any` | 96 · 20 · 49 |
| Archivos > 1.000 líneas | 6 |
| Lockfiles versionados | 7 |

Comandos usados para reproducir los puntos principales:

```bash
# C-1: reproducción del XSS del <title>
node -e "import('./apps/landing/src/lib/booking-share-rewriter.ts').then(m=>console.log(m.rewriteBookingShareHead('<head><title>x</title></head>',{title:'Uñas </title><script>alert(1)</script>',description:'d',canonicalUrl:'u',robots:'noindex',imageUrl:'i'})))"

# A-3 / A-2: workflows
sed -n '20,30p' .github/workflows/promotion-drift-guard.yml
sed -n '44,60p;99,105p' .github/workflows/deploy-promotion.yml

# A-9: gates y tests huérfanos
grep -n '"check"\|test:dashboard:contracts\|test:landing' package.json
node --test scripts/deploy-promotion-workflow.test.mjs   # falla hoy

# M-4: superficie MP
grep -n "sync-mp-plans" supabase/config.toml
grep -rn "mp_preapproval" supabase/functions | head

# A-10: lockfiles y gestores
git ls-files | grep -E "lock"; grep -rn packageManager --include=package.json .

# C-2: políticas abiertas y ausencia de revocación (revisión de archivos)
rg -n 'USING \(true\)|Public view settings|Public view businesses' supabase/migrations
rg -n -i "revoke[^;]*on (table )?(public\.)?(business_settings|businesses)" supabase/migrations   # sin resultados

# C-2 / M-15 / A-14: verificación runtime ejecutada el 2026-09-28 (solo lectura, anon key)
#   Pre-release: las claves salen de .env.local
#   Producción : la anon key es la que el sitio sirve públicamente en runtime-env.js
set -a; . ./.env.local; set +a
curl -s "$PUBLIC_SUPABASE_URL/rest/v1/businesses?select=id,slug,name,owner_id&limit=3" \
  -H "apikey: $PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $PUBLIC_SUPABASE_ANON_KEY"
curl -s "$PUBLIC_SUPABASE_URL/rest/v1/business_settings?select=business_id,deposit_alias,deposit_cbu,whatsapp,support_phone&limit=3" \
  -H "apikey: $PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $PUBLIC_SUPABASE_ANON_KEY"
# controles: bookings -> 401 42501 ; customers / notification_email_outbox -> 200 []

# A-14: prueba diferencial entre overloads (el primero responde 200, el segundo 401 42501)
curl -s -X POST "$PUBLIC_SUPABASE_URL/rest/v1/rpc/get_business_entitlements_snapshot" \
  -H "apikey: $PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $PUBLIC_SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' -d "{\"business_id\":\"<uuid>\",\"tenant_id\":\"<owner uuid>\"}"
curl -s -X POST "$PUBLIC_SUPABASE_URL/rest/v1/rpc/get_business_entitlements_snapshot" \
  -H "apikey: $PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $PUBLIC_SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' -d "{\"p_business_id\":\"<uuid>\",\"p_tenant_id\":\"<owner uuid>\"}"

# Mismo chequeo contra producción, tomando la anon key pública del propio sitio:
curl -s https://orvel.pro/dashboard/runtime-env.js     # window.__ORVEL_DASHBOARD_ENV__ = { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, ... }

# A-14: overload sin revocar
rg -n "get_business_entitlements_snapshot" supabase/migrations

# A-15: fechas dependientes del TZ (probar con TZ=UTC vs America/Argentina/Buenos_Aires)
TZ=UTC node -e "console.log(new Date('2026-09-28T09:00:00').toISOString())"          # 09:00Z
TZ=America/Argentina/Buenos_Aires node -e "console.log(new Date('2026-09-28T09:00:00').toISOString())"  # 12:00Z
```
