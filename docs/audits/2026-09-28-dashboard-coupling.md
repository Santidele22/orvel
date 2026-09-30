# Acoplamiento de `apps/dashboard` — medición y lote 1

- **Fecha:** 2026-09-28
- **Alcance:** `apps/dashboard` (Angular 21 PWA). Referencias cruzadas a `packages/*` y `supabase/` solo como destino de dependencia.
- **Base medida:** `origin/dev` = `a454a04`. El working tree local tenía además `core/accounts/account-plan-policy.ts` modificado (ajeno a esta medición) y `docs/audits/2026-09-28-dev-code-audit.md` sin commitear (auditoría de seguridad de otra sesión).
- **Método:** grafo de imports estático (185 archivos `.ts` de producción + 297 specs, 375 aristas relativas resueltas) + verificación de referencias por ruta, basename y símbolo exportado sobre todo el repo. Sin ejecución de red ni cambios remotos.
- **Estado:** documento de trabajo, sin commitear (mismo criterio que la auditoría vecina).

## Handoff — estado al 2026-09-28 (round 12, último del objetivo)

**13 commits en 2 ramas, todos verificados, sin pushear.** Ambas salen de `origin/dev` (`a454a04`, que no se movió), se mergean sin conflicto y juntas pasan `tsc` + `ng build` + suite.

| Rama | Tip | Diff |
|---|---|---|
| `refactor/dashboard-dead-code` | `63f9c51` | 14 archivos, **977 líneas borradas** |
| `refactor/dashboard-layer-inversions` | `31d0c7b` | 83 archivos, +370 / −220 |

### Objetivos

| # | Objetivo | Estado |
|---|---|---|
| 1 | Eliminar código muerto | **Parcial**: 977 líneas borradas (14 de 22 huérfanos). Quedan 9 (2 shims que deben quedarse, 6 contratos RED, 1 solo-docs) y el gateway de 876 líneas del lote 3 |
| 2 | Cortar inversiones `core`/`shared` → `features` | **Cerrado salvo 2**, ambas pinneadas por contrato/specs: `shared/components/status-badge` (muerto, 3 specs) y `core/auth/mock-login-business-types` → `onboarding-rubros` (split D3). 13 → 2 |
| 3 | `AuthService` a `core/auth` y borrar el resto de `services/*` | ✅ **Cerrado**: `services/` ya no existe |
| 4 | Reducir el fan-in de `features/settings` | **No ejecutado a propósito**: medido (8 sitios de import, 5 features), la salida honesta es extraer el read-model a `core/business`, no esconderlo tras un token (ver sección 8) |

### Receipt de verificación

| Puerta | Resultado |
|---|---|
| `tsc -p tsconfig.app.json --noEmit` | 0 errores |
| `tsc -p tsconfig.spec.json --noEmit` | 769 errores = baseline preexistente (0 aportados) |
| `ng build` (con `strictTemplates`) | rc=0 |
| `vitest run` | 2054 tests, **274 fallos** = baseline de `dev` (0 nuevos; 4 arreglados por el lote 6) |
| Integración de las 2 ramas | 0 conflictos, `tsc` 0, build rc=0, 2054/274 |
| CI requerido `Dashboard booking regressions` (parte vitest) | rc=0 en `dev` y en las 2 ramas |
| Bundle | dead-code 0 B; layers +3 158 B (+0,19 %) |
| QA scripts del dashboard | 3 de 4 (el 4º, `check:servicios:compile`, ya está roto en `dev`) |

### Decisiones de Santi (2026-09-28) y estado

Las cuatro decisiones se respondieron: **pushear** ✓, **portar el mapeo del turnero** ✓, **borrar los contratos RED** ✓ y **hacer la extracción de settings** (pendiente de ejecución).

| # | Decisión | Estado |
|---|---|---|
| 1 | Pushear y abrir PRs | ✅ **3 PRs abiertos**: [#1061](https://github.com/Santidele22/orvel/pull/1061) (código muerto), [#1062](https://github.com/Santidele22/orvel/pull/1062) (inversiones + migraciones) y [#1063](https://github.com/Santidele22/orvel/pull/1063) (fix del turnero) |
| 2 | Portar `PUBLIC_TURNERO_DISABLED` al camino vivo | ✅ `47f3213` en `fix/public-turnero-disabled-mapping`: el mapper lo mapea y el gateway devuelve **422** en availability y create. Paquete booking **82 → 86 tests** |
| 3 | Borrar los 6 contratos RED | ✅ `34a276e` en `refactor/dashboard-dead-code`: 6 archivos muertos + 2 specs borrados + 6 aserciones quitadas quirúrgicamente de specs que además cubrían código vivo. Fallos **278 → 275**, 0 nuevos, `tsc` 0, `ng build` rc=0 |
| 4 | Reducir el fan-in de `features/settings` | ✅ [`#1064`](https://github.com/Santidele22/orvel/pull/1064): el read-model vive en `core/business/business-directory.ports.ts` (5 contratos + tokens) y el composition root lo cablea. **Importadores de `features/settings/data-access/business.service`: 9 → 2**, y **cero features**. Fallos 278 → 277, 0 nuevos, `tsc` 0, `ng build` rc=0 |

**Por qué no moví el servicio físico a `core`:** lo medí antes de tocar nada y `BusinessService` importa `features/onboarding/data-access/onboarding-plan-storage`; moverlo tal cual habría **creado** aristas `core → features` nuevas, cambiando una deuda por otra. El paso que lo habilita es mover antes el lector de plan de onboarding (helper puro de storage) a `core/storage`, en su propio lote.

### Hallazgo que bloquea el lote 3 (gateway muerto, 876 líneas)

Al portar sus specs al camino vivo el sondeo mostró **6 divergencias de contrato** entre el duplicado del dashboard y `RealSupabaseBookingGateway`:

| Caso | Duplicado | Camino vivo |
|---|---|---|
| `INVALID_TOKEN` en manage | 401 | **400** |
| `TOKEN_EXPIRED`, `POLICY_WINDOW_CLOSED`, auto-confirm de reserva, 2 shapes de admin | 401/410/403 y shapes propios | 400 / shapes distintos |

Es decir: el «código muerto» no era equivalente, sino una implementación con **otro contrato de status**. Borrarlo sin decidir cuáles son correctos dejaría esos 6 casos sin cobertura y sin criterio. Necesita decisión: (a) alinear el camino vivo al duplicado y recién entonces borrar, o (b) aceptar el contrato vivo y borrar los specs del duplicado.

Además hay que repuntar 2 specs que usan el muerto sin importarlo: `supabase-api-layer-red.contract.spec.ts` (lo usa como **doble de test** vía import dinámico; 16 tests) y `orvel-capacity-booking.red.contract.spec.ts` (3 lecturas por ruta; 2 son repuntables al paquete y 1 aserta `ALLOWED_BOOKING_STATUSES`, que no existe en el vivo).

**Lección de método:** el análisis de huérfanos detectaba importadores estáticos y dinámicos, pero subestimó los specs que **leen por ruta** o usan el archivo como doble. Antes de borrar un archivo «muerto» hay que correr los specs que lo mencionan, no solo los que lo importan.

## 0. Hallazgo que condiciona todo: `dev` está rojo

`pnpm --dir apps/dashboard run test` **no corre** en este entorno (pnpm intenta escribir su lockfile global en `~/.local/share/pnpm`, que está fuera del sandbox y es de solo lectura). Se usó el binario local:

```bash
apps/dashboard/node_modules/.bin/vitest run
```

Resultado en **`origin/dev` limpio** (worktree aislado en `.worktrees/`, symlinks de `node_modules`, caminos verificados como propios del worktree):

| Métrica | Valor |
|---|---|
| Archivos de test fallando | **87** de 298 |
| Tests fallando | **278** de 2049 |
| Archivos pasando | 210 |
| Skipped | 1 archivo / 25 tests |

Es idéntico en el working tree con el cambio local, así que **no lo causa ningún cambio sin commitear**. `dev` está rojo en el suite completo del dashboard. El check requerido `Dashboard booking regressions` corre un subconjunto, por eso el rojo pasa desapercibido.

Con los lotes 1-6 de la rama `refactor/dashboard-layer-inversions` aplicados, el suite baja de **278 a 274 fallos** (los 4 tests de KB-007 que el shim de `services/cliente.service.ts` enmascaraba, ver 6-sexies). No hay fallos nuevos en ningún lote.

**Consecuencia práctica:** ningún refactor puede usar "suite verde" como puerta. La puerta usada en el lote 1 es **paridad de fallos** (mismo conjunto exacto de tests fallando antes y después) más `tsc --noEmit`.

## 1. Acoplamiento entre capas

| Arista | n | % |
|---|---|---|
| `features → core` | 111 | 29,6% |
| `features → features` | 95 | 25,3% |
| `core → core` | 56 | 14,9% |
| `features → models` | 19 | 5,1% |
| `features → services/*` (legado) | 15 | 4,0% |
| `shared → core` | 12 | 3,2% |
| **`core → features`** (inversión) | **9 → 1** (lotes 2, 4, 5 y 7) | 2,4% → 0,3% |
| `features → shared` | 8 | 2,1% |
| **`shared → features`** (inversión) | **4 → 1** (lote 8) | 1,1% → 0,3% |
| `core → services/*` | 1 | 0,3% |

**Ciclos de import: 0.** No hay ninguna componente fuertemente conexa a nivel archivo: el grafo es un DAG y el orden de refactor es libre.

Inversiones de capa concretas:
- `core/auth/route-protection.ts`, `core/auth/mock-login-business-types.ts`, `core/dashboard/dashboard.service.ts`, `core/storage/browser-storage-keys.ts` importan features.
- `shared/dashboard-shell/dashboard-shell.component.ts` y `shared/components/status-badge/status-badge.component.ts` importan features.

## 2. Features entre sí

| Feature | importa (out) | lo importan (in) |
|---|---|---|
| `settings` | 6 | **7** |
| `booking` | **8** | 0 |
| `onboarding` | 1 | 6 |
| `servicios` | 3 | 4 |
| `operator-web-push` | 1 | 4 |
| `dashboard-home` | 4 | 0 |
| `clientes` | 0 | 2 |
| `billing` | 1 | 2 |
| `perfil` | 2 | 0 |
| `pwa-install` | 0 | 1 |

`settings` es el shared kernel de facto (7 features lo importan) y `booking` la hoja consumidora (8 salidas, 0 entradas). Cortar el fan-in de `settings` es el refactor de mayor impacto estructural.

## 3. Legado `services/*`: cerrado (lotes 5 y 6)

`src/app/services/` **ya no existe**. Recorrido completo:

| Archivo | Destino |
|---|---|
| `services/auth.service.ts` (214 líneas) | Migrado a `core/auth/auth.service.ts` (lote 5, `57e2cc4`) |
| `services/business.service.ts` (2 líneas) | Borrado (lote 5, `84d1e87`) |
| `services/encrypted-token-storage.ts` (88 líneas) | Borrado (lote 5); el copy de `apps/landing` es el que usa landing |
| `services/cliente.service.ts` (2 líneas, shim) | Borrado; 15 archivos ahora importan `features/clientes/data-access/cliente.service` (lote 6, `1e15a3c`) |
| `services/servicio.service.ts` (2 líneas, shim) | Borrado; importan `features/servicios/data-access/servicio.service` |
| `services/notification.service.ts` (64 líneas, doble de test) | Movido a `tests/helpers/mock-notification.service.ts` (lote 6, `db4ce4e`) |
| `services/turno.manual-booking-payload.contract.spec.ts` | Movido a `tests/unit/` (contrato de `@orvel/booking`, no un servicio) |

Hallazgo del lote 6: los dos shims llevaban su propio TODO (`remove after consumers import from features/... directly`) y **enmascaraban 4 tests de contrato** de KB-007 que leían el shim de 2 líneas con `readFileSync` y no podían pasar nunca. Repuntados al archivo real, pasan sin cambios.

## 4. Acceso directo a supabase-js

26 archivos tocan `createSupabaseClient()` / `.from(` / `.rpc(` / `.functions.invoke`. Concentración:

| Archivo | usos |
|---|---|
| `features/settings/data-access/business.service.ts` | 15 |
| `features/settings/data-access/business-settings.facade.ts` | 12 |
| `core/notifications/internal-dashboard-notifications.api.ts` | 11 |
| `features/servicios/data-access/servicio.service.ts` | 8 |
| `features/operator-web-push/operator-web-push.service.ts` | 8 |
| `features/clientes/data-access/cliente.service.ts` | 4 |

Solo `booking` pasa por puertos (`@orvel/booking/application` + `infrastructure`, cableado en `app.config.ts` con el token `SUPABASE_CLIENT`).

## 5. Tests y código muerto: el impuesto real

| Dato | Valor |
|---|---|
| Specs totales | 297 |
| `.contract.spec.ts` | 260 |
| Bajo `src/app/tests/` | 227 |
| **Specs que leen archivos fuente** (`readFileSync`/`__dirname`/`existsSync`) | **215 (72%)** |
| Archivos sin importador de producción | 44 |
| Archivos sin **ninguna** referencia (ni specs) | 13 |

Los specs source-locking son el freno real: 3 de cada 4 tests se rompen al mover un archivo aunque el comportamiento no cambie, y varios **pinnean código muerto a propósito**.

Archivos-dios (>1.000 líneas): `public-booking.page.ts` 1.216 · `configuracion.page.ts` 1.112 · `servicio.service.ts` 1.057 · `turnos-list.page.ts` 1.013 · `core/api/supabase-booking.gateway.ts` 876 (muerto en producción, sostenido por 4 specs).

## 6. Lote 1 — ejecutado

Rama: `refactor/dashboard-dead-code` (desde `origin/dev`), commit `615b347`. **12 archivos, 916 líneas.** Trabajo hecho en un worktree aislado (`.worktrees/dead-code`) para no tocar el árbol compartido con la otra sesión.

```
services/business.service.ts
shared/ui/stat-card/stat-card.component.ts
shared/ui/date-item/date-item.component.ts
features/booking/ui/turno-form-standard/turno-form-standard.component.ts
features/dashboard-home/pages/components/agenda-header/agenda-header.component.ts
features/dashboard-home/pages/components/agenda-timeline/agenda-timeline.component.ts
features/dashboard-home/pages/components/appointment-card/appointment-card.component.ts
features/dashboard-home/pages/components/next-client/next-client.component.ts
features/dashboard-home/pages/components/recent-feedback/recent-feedback.component.ts
features/onboarding/pages/signup-business-types-step.component.ts
features/billing/data-access/payments/fake-money-subscription-simulator.ts
features/billing/data-access/payments/webhooks/payment-confirmed-business-sync.service.ts
```

Verificación (worktree limpio sobre `a454a04`):

| Puerta | Antes | Después |
|---|---|---|
| `tsc -p tsconfig.app.json --noEmit` | 0 errores | **0 errores** |
| `vitest run` fallos | 278 (87 archivos) | **278 (87 archivos)** |
| Diferencia de conjuntos de tests fallando | — | **0 nuevos, 0 quitados** |

El lote es más chico que el conjunto "sin importador" porque un cierre de dependencias no alcanza: hay que verificar también referencias textuales.

**Lote 9** (mismo branch, commit `63f9c51`, tras el round 8): +2 archivos, 61 líneas — `core/dashboard/dashboard-metrics.models.ts` (su única mención es un regex sobre el fuente de **otro** archivo) y `features/onboarding/data-access/onboarding-flow.guard.ts` (exporta 4 guards que un contrato afirma que **no** deben estar en la ruta de onboarding). Puertas: `tsc` 0 errores, `ng build` rc=0, suite 278 = 278 con conjunto idéntico. Total del branch: **14 archivos, 977 líneas**.

## 6-bis. Lote 2 — inversión de capas, ejecutado

Rama: `refactor/dashboard-layer-inversions` (desde `origin/dev`), commit `ef12c7e`. Worktree aislado `.worktrees/layers`.

`core/storage/browser-storage-keys.ts` importaba tres claves de storage desde `features/onboarding/data-access/*`: cualquiera que consumiera el mapa de claves de `core` dependía de una feature (3 de las 9 aristas `core → features`).

**Cambio:** los valores canónicos pasan a `core/storage/browser-storage-keys.ts`; los tres módulos de onboarding los re-exportan (`import` + `export`), así que su superficie pública y todos sus consumidores quedan iguales. Los valores de clave son idénticos byte a byte, así que no hay migración de datos persistidos.

| Medición | Antes | Después |
|---|---|---|
| Aristas `core → features` | 9 | **6** |
| `tsc -p tsconfig.app.json --noEmit` | 0 errores | **0 errores** |
| `vitest run` fallos | 278 | **278** |
| Diferencia de conjuntos de tests fallando | — | **0 nuevos, 0 quitados** |

### Candidatos siguientes de la misma familia (no ejecutados)

| Arista | Qué requiere | Riesgo |
|---|---|---|
| `core/auth/route-protection.ts` → `isAllowedOnboardingBusinessType` | Extraer el predicado a `core/catalog` y re-exportarlo | Medio: `onboarding-business-type-defaults-catalog.red.contract.spec.ts` lee el fuente de `business-type-defaults.ts` con regex (`resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG`) |
| `core/auth/mock-login-business-types.ts` → `onboarding-rubros`, `onboarding-templates` | Mover `REQUIRED_RUBROS`, `sanitizeSelectedRubros`, `mergeTemplateCatalogs` a core | Alto: varios specs leen esos dos módulos por ruta |
| `core/dashboard/dashboard.service.ts` → `cliente/servicio/business.service` (3 aristas) | Mover esos servicios a core o inyectarlos por token; es el mismo nudo que el fan-in de `settings` | Alto: muchos specs leen esas rutas |
| `shared/dashboard-shell` → `onboarding-storage`, `operator-tour` (3 aristas) | Mover el lector de estado a core; los componentes de tour son composición legítima de la app | Medio-alto |

## 6-ter. Alcance medido de la migración de `AuthService` (insumo del lote 5)

Medido sobre `services/auth.service.ts` (214 líneas):

| Dato | Valor |
|---|---|
| Superficie pública | señales `user`, `authenticated`, `authToken`; métodos `login`, `register`, `logout`, `getUser`, `getToken`, `isLogged`, `getNegocioTemplate` |
| Archivos de app que lo importan | 17 |
| Specs que lo importan | 17 |
| Specs que lo leen por ruta (`src/app/services/auth.service.ts`) | **2** |
| Otros archivos `services/*` vivos | ninguno (`cliente`/`servicio` solo por el helper de test; `business`/`encrypted-token-storage`/`notification` sin uso) |
| `models/user.model.ts` | su único importador era `auth.service`, pero **no se mueve**: es shim a `@orvel/types` y un contrato de paquete exige que exista (corrección respecto al pronóstico inicial) |

Es más barato de lo que parece: mover a `core/auth/auth.service.ts` y actualizar 17 imports de app + 17 specs + 2 lecturas por ruta. No hay contrato que exija la ubicación actual (`auth-unification.red.contract.spec.ts` fija rutas y guards, no la clase). Resultó exacto, con una excepción: `models/user.model.ts` se queda (shim de paquete).

## 6-quater. Lote 5 — migración de `AuthService`, ejecutado

Rama `refactor/dashboard-layer-inversions`, commits `57e2cc4` (mudanza) y `84d1e87` (borrados).

| Commit | Cambio |
|---|---|
| `57e2cc4` | `services/auth.service.ts` → `core/auth/auth.service.ts`. 43 archivos: 36 especificadores de import (estáticos y dinámicos), 2 lecturas source-locking y 1 regex de ruta. La clase, su superficie y su comportamiento no cambian (mismo `providedIn: 'root'`, mismas señales y métodos). `models/user.model.ts` se queda: es shim re-export a `@orvel/types` y `packages-types-shape.red.contract.spec.ts` exige que exista |
| `84d1e87` | Borrados `services/business.service.ts` (2 líneas) y `services/encrypted-token-storage.ts` (88 líneas), sin ningún importador. El copy de `apps/landing/src/lib/encrypted-token-storage.ts` es el que usa landing y no se toca |

**Puertas (worktree desde `origin/dev` a454a04):**

| | Resultado |
|---|---|
| `tsc -p tsconfig.app.json --noEmit` | **0 errores** |
| Referencias residuales a `services/auth.service` | **0** |
| `vitest run` fallos | 278 = baseline, **0 nuevos / 0 quitados**, conjunto idéntico |
| Ciclos de import | **0** antes y después (185 archivos de producción, 375 → 380 aristas) |

Las 5 aristas extra del grafo son los dos módulos core nuevos del lote 4 más los re-exports de las claves; las **inversiones** bajaron de 13 a 9.

**Lo que costó la mudanza (para futuras mudanzas):** tres specs fijaban la ruta vieja de formas que un `rg` de `services/auth.service` no ve —una regex con barras escapadas (`services\/auth\.service`) y un `readApp('services/auth.service.ts')`—. Se corrigieron preservando la intención de cada aserción. Lección: al mover un archivo, buscar también `services\/` (escapado), `new URL(`, `readApp(`, `readSource(` y `readIfExists(`.

## 6-quinquies. Lote 7 — puertos de `core`, ejecutado

Rama `refactor/dashboard-layer-inversions`, commits `51ce934` y `a2e33a5`.

`core/dashboard/dashboard.service.ts` inyectaba tres servicios de features (`ClienteService`, `ServicioService`, `BusinessService`): eran las 3 aristas `core → features` que quedaban fuera de auth. Ahora `core` es dueño de los puertos de lectura que realmente usa (`core/dashboard/dashboard-data.ports.ts`: `DashboardBusinessSource`, `DashboardClienteSource`, `DashboardServicioSource` + sus tokens) y el **composition root** (`dashboard-shell.routes.ts`) los cablea con `useExisting`. Los servicios de features no se movieron: ningún import de feature cambió de ruta.

Superficie usada, idéntica: `settings`, `items`, `getAll`. Solo 2 specs proveían las clases concretas (se pasaron a tokens); los otros 6 usos de `DashboardService` no cambian.

| Medición | origin/dev | Rama |
|---|---|---|
| Aristas `core → features` | 9 | **1** |
| `tsc -p tsconfig.app.json` | 0 errores | **0 errores** |
| `tsc -p tsconfig.spec.json` | 769 errores | **769** (paridad: ese config ya está rojo en `dev`) |
| Specs afectadas (`core/dashboard` + `dashboard-live-agenda-clock`) | — | **34/34 pasan** |
| `vitest run` (suite completa) | 278 fallos | **278**, conjunto idéntico (0 nuevos / 0 quitados) |

### La última inversión de `core` está bloqueada por una decisión, no por accidente

`core/auth/mock-login-business-types.ts` → `onboarding-rubros` no se puede cortar moviendo código: `packages-domain-shape.red.contract.spec.ts:146-157` **exige** que `onboarding-rubros.ts` conserve el runtime (`export function sanitizeSelectedRubros`, `export function normalizeRubro`) y que `packages/domain/src/required-rubro.ts` sea solo tipos (split D3). La mitad de plantillas de ese mismo archivo sí se arregló importando `@orvel/domain` directo (commit `51ce934`), porque el shim solo re-exporta el paquete.

Opciones reales para esa última arista, si Santi quiere cerrarla: (a) subir el runtime de rubros a `@orvel/domain` y actualizar el contrato D3, o (b) mover `mock-login-business-types.ts` a features y aceptar que `core/theming` lo consuma por token.

## 6-sexies. Lote 6 — fin de `services/*`, ejecutado

Rama `refactor/dashboard-layer-inversions`, commits `1e15a3c` y `db4ce4e`.

| Commit | Cambio | Alcance |
|---|---|---|
| `1e15a3c` | Repuntar 15 archivos a las rutas de feature y borrar los shims `cliente.service.ts` / `servicio.service.ts` | 4 de esos 15 eran lectores source-locking que resolvían la ruta del shim |
| `db4ce4e` | `MockNotificationService` (doble de test) → `tests/helpers/mock-notification.service.ts`; el contrato de booking mal ubicado → `tests/unit/` | 3 specs repuntadas; `src/app/services/` desaparece |

| Puerta | Lote 6a | Lote 6b |
|---|---|---|
| `tsc -p tsconfig.app.json` | 0 errores | 0 errores |
| `vitest run` | **274** fallos (278 − 4 arreglados), 0 nuevos | 274, conjunto idéntico (0 nuevos / 0 quitados) |

`vitest.config.ts` incluye `src/**/*.spec.ts`, así que el spec reubicado se sigue ejecutando.

## 6-septies. Lote 8 — chrome del shell por puertos, ejecutado

Rama `refactor/dashboard-layer-inversions`, commit `7e1d43f`.

`shared/dashboard-shell` importaba tres símbolos de features (`readOnboardingState`, `OperatorTourService`, `OperatorTourHelpButtonComponent`). Ahora inyecta contratos que posee `core/shell/dashboard-chrome.ports.ts`:

| Token | Reemplaza a | Cómo |
|---|---|---|
| `DASHBOARD_TOUR` (`canAutoStart`, `run`) | `OperatorTourService` inyectado | `useExisting` en el composition root |
| `DASHBOARD_TOUR_HELP_COMPONENT` | `OperatorTourHelpButtonComponent` en `imports` | `NgComponentOutlet` en la plantilla |
| `DASHBOARD_ONBOARDING_PAYLOAD` (lector de los 3 campos que el shell usa) | `readOnboardingState` | `useValue` en el composition root |

Cada token tiene default inerte, así que el shell sigue renderizando sin el tour cuando no hay provider. `dashboard-shell.routes.ts` es el composition root (ya proveía los servicios del shell) y es el único lugar que monta el shell.

| Medición | origin/dev | Rama |
|---|---|---|
| Inversiones `shared → features` | 4 | **1** |
| Inversiones totales | 13 | **2** |
| `tsc -p tsconfig.app.json` | 0 errores | 0 errores |
| Specs de shell/tour (`operator-tour` + `mobile-shell` + `dashboard-session-wiring`) | — | **37/37 pasan** |
| `vitest run` (suite completa) | 274 fallos | **274**, conjunto idéntico |

**Las 2 inversiones que quedan no son deuda accidental, son decisiones:**

| Inversión | Por qué queda |
|---|---|
| `shared/components/status-badge` → `features/booking/models/turno.model` | El componente está **muerto** (0 importadores) pero 3 specs leen su fuente por ruta. Borrarlo quita cobertura: necesita OK |
| `core/auth/mock-login-business-types` → `onboarding-rubros` | El contrato de `@orvel/domain` **exige** que el runtime de rubros viva en la feature (split D3) |

## 6-octies. Lote 3 — el gateway «muerto» no es inocuo: sondeo hecho, borrado NO ejecutado

Antes de borrar `core/api/supabase-booking.gateway.ts` (876 líneas) probé portar sus specs a la implementación viva. **El port no es 1:1: 12 de 28 tests pasan, 16 fallan.** El sondeo se hizo con un wrapper temporal (`new RealSupabaseBookingGateway(client)` bajo el nombre de la factory muerta) y se borró después; no quedó en la rama.

Clasificación de los 16 fallos:

| Tipo | Ejemplo | Lectura |
|---|---|---|
| El contrato vivo es un **superconjunto** | `mapResolvedBusinessToPublicView` devuelve además `allowClientCancel`, `allowClientReschedule`, `maxAdvanceDays`… | El spec muerto es una foto vieja del mismo contrato; portarlo 1:1 sería incorrecto |
| **Hueco real de comportamiento** | `PUBLIC_TURNERO_DISABLED` | Ver abajo |

### El hueco: `PUBLIC_TURNERO_DISABLED`

| Evidencia | Detalle |
|---|---|
| El backend **sigue levantando** el código | `supabase/migrations/20260824201000_public_turnero_unconfirmed_gate.sql:33` → `PERFORM public._raise_rpc('PUBLIC_TURNERO_DISABLED')`, con test de regresión en `supabase/functions/_shared/public-booking-reliability-regression.test.ts:228` |
| El tipo lo declara | `packages/booking/src/types.ts:20` (`ApiErrorCode`) |
| El mapper vivo **no lo mapea** | `packages/booking/src/infrastructure/supabase/mappers.ts` es el único archivo del paquete que no lo menciona: cae al fallback `apiError('VALIDATION_ERROR', message, error)` |
| El camino vivo devuelve 400 genérico | `real-gateway.ts:193-196` (availability) y `216-219` |
| La única implementación de la conducta prevista está en el **archivo muerto** | `core/api/supabase-booking/mappers.ts:7-21`: `mapPublicTurneroDisabledError` → **422 `PUBLIC_TURNERO_DISABLED`** + mensaje `"Public booking is temporarily unavailable."` |

**Conclusión:** cuando el turnero público de un negocio está deshabilitado, el camino vivo muestra un error de validación genérico con el mensaje crudo de la RPC, no el mensaje previsto. Borrar el archivo de 876 líneas sin decidir esto **regresaría en silencio** un estado de producto real.

**Corrección de un dato que reporté antes:** de los 5 specs de `core/api`, no todos pinnean el código muerto.

| Spec | Líneas | Atado a | Destino |
|---|---|---|---|
| `supabase-booking.gateway.contract.spec.ts` | 528 | factory muerta | Solo se puede borrar o reescribir tras decidir el hueco |
| `supabase-booking.mvp-phase1-red.contract.spec.ts` | 105 | factory muerta | ídem |
| `supabase-booking/mappers.contract.spec.ts` | 16 | mapper muerto | ídem (es el test del hueco) |
| `core-slice3-runtime-lockdown.red.contract.spec.ts` | 366 | **clase viva** | **Se queda**: cubre la implementación viva y lee fuentes del paquete |
| `real-gateway.professional.contract.spec.ts` | 75 | **clase viva** | **Se queda** |

### Lote 3 propuesto (necesita decisión de producto)

1. Portar `mapPublicTurneroDisabledError` al mapper vivo (`packages/booking`) y su caso al gateway, con el spec del hueco (16 líneas) movido al paquete.
2. Recién entonces borrar `core/api/supabase-booking.gateway.ts` (876), `core/api/supabase-booking/mappers.ts` (21), los 2 specs atados a la factory muerta (633 líneas) y el shim `pages/booking/public-booking.validation.ts`.
3. Alternativa si se acepta el error genérico: borrar todo, asumiendo explícitamente que el estado «turnero deshabilitado» pierde su mensaje.

## 6-nonies. Triaje de los archivos muertos pinneados por specs (round 8)

Método: grafo de imports (huérfanos de producción) + quién los referencia + **correr cada spec que los pinnea, uno por uno**. Vale la corrección: mi primer triaje, hecho cruzando el JSON del suite completo, **atribuyó mal los estados** (decía «0 fallan» en todos); la tabla de abajo sale de ejecutar cada archivo individualmente.

| Archivo muerto | Líneas | Spec que lo pinnea | Estado real | Veredicto |
|---|---|---|---|---|
| `models/branch.model.ts` | 8 | `packages-types-shape.red.contract.spec.ts` | **PASA** (4/4) | **Se queda**: shim de extracción exigido por contrato |
| `core/payments/manual/index.ts` | 15 | `packages-billing-shape.red.contract.spec.ts` | **PASA** (9/9) | **Se queda**: shim de extracción exigido por contrato |
| `shared/components/ui-state-message.component.ts` | 42 | `ui-state-message-accessibility` (pasa) + `ux-hardening-accessibility` y `-global-states` (**fallan**) | mixto | Decisión: borrarlo rompe 1 spec verde |
| `shared/components/status-badge.component.ts` | 75 | `dashboard-template-normalization.design.contract.spec.ts` | **FALLA** (1) | Decisión: el spec es un **requisito pendiente** sobre un componente que nadie renderiza |
| `features/clientes/.../clientes-standard.component.ts` | 129 | `dashboard-section-skeletons.contract.spec.ts` | **FALLA** (1) | Decisión: ídem (skeleton hooks de una UX no cableada) |
| `features/servicios/.../servicios-standard.component.ts` | 114 | `dashboard-section-skeletons.contract.spec.ts` | **FALLA** (1) | Decisión: ídem |
| `features/onboarding/pages/signup-plan-step.component.ts` | 32 | `landing-orvel-pricing.red.contract.spec.ts` | **FALLA** (3) | Decisión: el spec lo lee y exige `SignupPlanStepPageComponent` |
| `features/billing/data-access/upgrade-screen-server-truth.ts` | 69 | `upgrade-screen-server-truth.contract.spec.ts` | **FALLA** (1) | **No es borrable ni movible tal cual**: el spec espera el archivo en `core/billing/` con el catálogo viejo (`FREE/BASIC/MEDIUM/PRO`); el huérfano usa el canónico (`STARTER/GROWTH/PRO`). Moverlo lo haría fallar distinto |
| `features/billing/.../payment-webhook-idempotency.ts` | 8 | `packages-billing-shape` (pasa) + README del paquete | **PASA** | Decisión menor: solo lo mencionan docs |

**Conclusión del triaje:** de los 22 huérfanos de producción detectados en esta corrida, **13 ya se borraron** (11 en el lote 1 y 2 en el lote 9) y **quedan 9**:

| Grupo | Archivos | Veredicto |
|---|---|---|
| Shims exigidos por contratos **verdes** | `models/branch.model.ts`, `core/payments/manual/index.ts` | Se quedan: borrarlos rompe 13 tests que hoy pasan |
| Contratos **RED** que documentan requisitos de UX no implementados sobre componentes que nadie renderiza | `shared/components/status-badge`, `shared/components/ui-state-message`, `features/clientes/.../clientes-standard`, `features/servicios/.../servicios-standard`, `features/onboarding/pages/signup-plan-step.component`, `features/billing/.../upgrade-screen-server-truth` | Decisión: borrarlos no rompe ningún test verde (siguen rojos, con ENOENT en vez de aserción) pero **borra el registro del requisito** |
| Solo mencionado por docs + contrato verde del paquete | `features/billing/.../payment-webhook-idempotency.ts` | Decisión menor de documentación |

**Ninguno esconde un hueco de comportamiento del camino vivo** como el del turnero (sección 6-octies).

Advertencia de método que esto deja: mi puerta de paridad es a nivel de **nombre de test**, así que un test puede pasar de «falla por aserción» a «falla por archivo faltante» y seguir contando como paridad. Para los lotes 1 y 9 eso no aplica (los archivos no tenían referencias reales), pero refuerza que la paridad **no** reemplaza leer el motivo del fallo.

## 7. Excluidos del lote 1 y por qué

| Archivo | Motivo |
|---|---|
| `models/branch.model.ts` | `packages-types-shape.red.contract.spec.ts` exige que exista como shim del paquete |
| `core/payments/manual/index.ts` | `packages-billing-shape.red.contract.spec.ts` exige los 3 shims de `core/payments` |
| `shared/components/status-badge/*`, `shared/components/ui-state-message/*` | 3 y 4 specs los leen por ruta (`readSource('src/app/...')`) |
| `features/servicios/.../servicios-standard.component.ts`, `features/clientes/.../clientes-standard.component.ts` | `dashboard-section-skeletons.contract.spec.ts` los lee por ruta |
| `features/onboarding/pages/signup-plan-step.component.ts` | `landing-orvel-pricing.red.contract.spec.ts` lo lee por ruta |
| `core/dashboard/dashboard-metrics.models.ts`, `features/onboarding/data-access/onboarding-flow.guard.ts`, `features/billing/.../upgrade-screen-server-truth.ts` | referencias por símbolo en specs; requiere decidir si el spec sobrevive |
| `services/encrypted-token-storage.ts`, `features/billing/.../payment-webhook-idempotency.ts` | solo referenciados por documentación (`packages/billing/README.md`, auditoría vecina); borrables actualizando esa doc |
| `core/api/supabase-booking.gateway.ts` (876 líneas) + `mappers.ts` + shim `pages/booking/public-booking.validation.ts` | muertos en producción pero sostenidos por 6 specs. Es el mismo hallazgo M-11 de la auditoría vecina |

**Decisión pendiente de Santi:** borrar esos 8-9 archivos implica tocar sus specs (quitar o reescribir el contrato). No lo hice por mi cuenta porque cambia cobertura.

## 8. Próximos pasos sugeridos

Hecho: **lote 1** + **lote 9** (código muerto: 14 archivos, 977 líneas, sección 6), **lote 2** (claves de storage a core, 6-bis), **lote 4** (validación a `core/catalog`, 6-bis), **lote 5** (`AuthService` + 2 borrados, 6-quater), **lote 6** (fin de `services/*`, 6-sexies), **lote 7** (puertos de `core`, 6-quinquies) y **lote 8** (chrome del shell, 6-septies). Objetivos «borrar el resto de `services/*` legado» y «cortar inversiones de capa» **cerrados** en todo lo que no dependa de una decisión de cobertura o de contrato.

1. **Lote 3 — gateway muerto: sondeado, bloqueado por decisión de producto (ver 6-octies).** El port a la clase viva no es 1:1 (12/28 pasan) y apareció un hueco real: `PUBLIC_TURNERO_DISABLED` lo levanta el backend y solo lo mapea el archivo muerto. Antes de borrar hay que decidir si se porta ese mapeo al camino vivo o se acepta el error genérico.
2. **Inversiones restantes (2):** bloqueadas por decisiones, no por técnica (ver 6-septies). La de `status-badge` se cierra borrando el componente muerto y sus 3 aserciones; la de rubros requiere subir el runtime a `@orvel/domain` y actualizar el contrato D3.
3. **Archivos muertos restantes (9 de 22):** triaje completo en 6-nonies. Dos son shims exigidos por contratos verdes (se quedan, romperían 13 tests), seis son contratos RED que documentan requisitos de UX no implementados y uno solo lo mencionan docs.
4. **Bajar el fan-in de `settings`** (7 features) extrayendo el contrato a `core` o `packages/`. Es el mismo nudo que `core/dashboard/dashboard.service.ts`.
5. **Specs source-locking:** convertir 215 specs a comportamiento. Es el habilitador de todo lo demás.

## 8-bis. Puerta de verificación: `ng build`, no solo `tsc`

`tsc -p tsconfig.app.json --noEmit` **no ejecuta el chequeo de plantillas del compilador de Angular**. Un cambio de plantilla (por ejemplo `NgComponentOutlet` en el lote 8) puede pasar `tsc` y romper el build real.

Se agregó como puerta obligatoria de la rama:

```bash
node scripts/generate-dashboard-env.mjs --production && node_modules/.bin/ng build
```

Estado: **rc=0** sobre los 9 commits de `refactor/dashboard-layer-inversions`, con `strictTemplates: true`, y un único warning preexistente y ajeno (`NG8113: RouterLink is not used within the template of MobileTurnoDetailComponent`). `pnpm run check` de la raíz no se puede usar en este entorno (pnpm intenta escribir su lockfile global fuera del sandbox); `ng build` directo sí.

## 8-ter. Verificación de integración de las dos ramas (round 9)

Las dos ramas salen de `origin/dev` (`a454a04`) y **se mergean sin un solo conflicto** (el primer merge es fast-forward; el segundo crea un merge commit). Verificado en un worktree de scratch (`integration/scratch-check`, ya borrado) con los 11 commits juntos:

| Puerta | Resultado |
|---|---|
| `git merge` de `refactor/dashboard-dead-code` + `refactor/dashboard-layer-inversions` | **0 conflictos** |
| `tsc -p tsconfig.app.json --noEmit` | **0 errores** |
| `ng build` | **rc=0** (1 warning preexistente NG8113) |
| `vitest run` | **274 fallos**, conjunto **idéntico** al de la rama layers (0 nuevos, 0 quitados) |
| QA scripts del dashboard | 3 de 4 pasan |

Los QA scripts del propio dashboard (no los corre el gate raíz):

| Script | Resultado |
|---|---|
| `check-no-direct-bookings-reads.mjs` | rc=0 (relevante: confirma que el refactor no introdujo lecturas directas a `public.bookings`) |
| `check-remixicon-assets.mjs` | rc=0 |
| `check-calendar-picker-scss-red.mjs` | rc=0 |
| `check-servicios-compile-red.mjs` | **rc=1, pero preexistente**: lee `src/app/pages/dashboard/servicios/servicios.page.html`, un layout que ya no existe. Idéntico error y rc en el árbol `dev` sin tocar → el script `check:servicios:compile` está roto en `dev`, no por este trabajo |

Conclusión: los dos PRs se pueden mergear en cualquier orden.

**Re-verificado en los rounds 10 y 11**, cada vez que una punta se movió. Última corrida sobre `63f9c51` + `31d0c7b`: merges sin conflicto (rc=0, 0 CONFLICT), `tsc` 0 errores, `ng build` rc=0 y **2054 tests / 274 fallos** — exactamente lo esperado.

### El check requerido de CI, replicado localmente

`booking-regression.yml` define el check **`Dashboard booking regressions`** (requerido en `dev` y `main`). Su parte de vitest son 3 comandos; los repliqué en las tres ramas:

| Comando | `dev` (a454a04) | `refactor/dashboard-dead-code` | `refactor/dashboard-layer-inversions` |
|---|---|---|---|
| Contratos de regresión de booking (43 tests) | **rc=0** | **rc=0** | **rc=0** |
| Resiliencia de booking por sucursal | **rc=0** | **rc=0** | **rc=0** |
| Contratos de acciones correctivas (7 tests) | **rc=0** | **rc=0** | **rc=0** |

La otra mitad del gate son 4 pasos de **Deno** (funciones y migraciones de Supabase) y no se pueden replicar acá: `deno` no está instalado en esta máquina. No hacen falta para este trabajo: **los dos diffs están 100% dentro de `apps/dashboard/`** (0 archivos fuera), así que ningún paso de `supabase/` cambia.

### Alcance de los diffs

| Rama | Archivos fuera de `apps/dashboard/` |
|---|---|
| `refactor/dashboard-dead-code` | **0** |
| `refactor/dashboard-layer-inversions` | **0** |

## 8-quater. Delta de bundle y auto-revisión (round 10)

El ADR 0010 deja anotado que el delta de bundle «was not measured». Medido ahora, con `ng build` sobre un worktree limpio de `origin/dev` y sobre cada rama:

| Árbol | JS total (bytes) | Archivos JS | Delta |
|---|---|---|---|
| `origin/dev` (a454a04, limpio) | 1 690 037 | 74 | — |
| `refactor/dashboard-dead-code` | 1 690 037 | 74 | **0 bytes (0,00 %)** |
| `refactor/dashboard-layer-inversions` | 1 693 195 | 76 | **+3 158 bytes (+0,19 %)** |

Lectura: borrar 977 líneas de código muerto no mueve el bundle ni un byte (nunca estuvo en él) ✓. La rama de refactor suma 3,2 KB y 2 archivos por los módulos de puertos nuevos y el cableado de tokens: 0,19 % es el precio de las 11 inversiones cortadas.

### Auto-revisión del propio diff (commit `e16d68f`)

Revisando mis propios cambios aparecieron tres cosas menores, todas en archivos que la rama ya había tocado:

| Hallazgo | Arreglo |
|---|---|
| `core/auth/auth.service.ts` decía «SECURE: Tokens are encrypted before storing in localStorage», un helper que **este mismo trabajo borró** (lote 5). Afirmación falsa y doblemente obsoleta | Cabecera reescrita: supabase-js persiste la sesión en `orvel.supabase.auth` |
| `logout()` hacía `isAuthenticated.set(null as any)` y acto seguido `set(false)`: empujaba un `null` por un `signal<boolean>` y necesitaba un cast para compilar | Línea redundante eliminada |
| El default de `DASHBOARD_ONBOARDING_PAYLOAD` devolvía **un** objeto a nivel módulo: singleton mutable compartido entre consumidores | Devuelve un payload nuevo por lectura |

Puertas del hardening: `tsc` 0 errores · `ng build` rc=0 · `auth.service.spec.ts` 18/18 (estaba verde y sigue verde) · suite completa 274 = 274 con conjunto idéntico.

## 8-quinquies. Contrato de cableado del shell (round 11)

Los tokens que consume el shell tienen **default inerte**: si alguien borra un binding en `dashboard-shell.routes.ts`, no se rompe el build ni ningún otro test — el shell simplemente renderiza sin el tour y sin el payload de onboarding. Es una degradación silenciosa, así que quedó pinneada.

`tests/integration/dashboard-shell-wiring.contract.spec.ts` (5 tests) asserta sobre el **array exportado real** (`dashboardShellRoutes[0].providers`), no sobre el texto del archivo: sobrevive a reformateos y falla en cuanto desaparece un binding.

| Assertion | Qué protege |
|---|---|
| `DASHBOARD_TOUR` → `useExisting: OperatorTourService` | Auto-arranque del tour |
| `DASHBOARD_TOUR_HELP_COMPONENT` → `useValue: OperatorTourHelpButtonComponent` | Botón de ayuda (vía `NgComponentOutlet`) |
| `DASHBOARD_ONBOARDING_PAYLOAD` → `useValue: readOnboardingState` | Payload de onboarding del shell |
| `DASHBOARD_{CLIENTE,SERVICIO,BUSINESS}_SOURCE` → `useExisting` de los 3 servicios | Puertos de `core/dashboard` |
| `dashboard-shell.component.ts` no debe importar `features/*` | La inversión cortada en el lote 8 no puede volver |

**Prueba del test (mutation check):** al quitar el binding de `DASHBOARD_TOUR` el contrato falla (1 test); al restaurarlo pasa (5/5). Sin ese chequeo, un contrato nuevo es solo una suposición.

`src/types/raw-modules.d.ts` declara los imports `?raw` de Vite (3 líneas) para que el spec lea el fuente del shell sin depender de tipados de Node, que `tsconfig.spec.json` no habilita: con eso ese config queda en sus **769 errores preexistentes**, sin sumar ninguno.

## 8-septies. Rama consolidada verificada (round 14)

Los 4 PRs se solapan en 3 archivos (imports que dos ramas tocan en la misma zona), así que preparé una rama con todo resuelto y verificada de punta a punta, **sin tocar `dev`**:

`refactor/dashboard-cleanup-consolidated` (pusheada, sin PR) = merge de `refactor/dashboard-dead-code` + `fix/public-turnero-disabled-mapping` + `refactor/dashboard-layer-inversions` + `refactor/business-read-model-to-core`.

Conflictos resueltos (quedándose con **ambos** cambios): `turno-form.page.ts`, `dashboard-home.page.ts` y `turno-form-walk-in.behavior.spec.ts` — la rama de capas mueve `AuthService` a `core/auth` y la de settings reemplaza `BusinessService` por los contratos de core; las dos cosas conviven.

| Puerta | `dev` limpio | Consolidada |
|---|---|---|
| Tests | 2049 | 2046 |
| Fallos | **278** | **270** (0 nuevos, 8 resueltos) |
| `tsc -p tsconfig.app.json` | 0 | **0** |
| `tsc -p tsconfig.spec.json` | 769 | **767** |
| `ng build` | rc=0 | **rc=0** |
| CI requerido (booking regressions) | rc=0 | **rc=0** |
| Bundle JS | 1 690 037 B / 74 archivos | **1 693 353 B / 77 archivos (+3 316 B = +0,20 %)** |

Los 8 fallos resueltos se explican solos: 4 de KB-007 que el shim de `services/cliente.service.ts` enmascaraba, 1 de `turno-form-walk-in`, y 3 de contratos RED que desaparecieron con su código muerto.

**Si preferís un solo PR en vez de cuatro, esta rama está lista**: `gh pr create --base dev --head refactor/dashboard-cleanup-consolidated`.

### Hallazgo (round 14): el check requerido tiene pasos que no ejecutan nada

`booking-regression.yml` define el check requerido **`Dashboard booking regressions`**. Dos de sus pasos de vitest corren archivos que están desactivados:

| Paso del gate | Archivo | Estado |
|---|---|---|
| líneas 44-45 | `tests/integration/dashboard-branch-booking-resilience.contract.spec.ts` (378 líneas) | **`describe.skip`** desde `d54ebc9` (2026-07-28, PR #182): **12 tests de resiliencia de booking nunca corren**, y el paso pasa en verde |
| líneas 41-42 | `tests/integration/booking-email-lifecycle.contract.spec.ts` | `it.skip` en 1 caso ("documents deployment order… outbox purged in release-2.0") |

No es de este trabajo: es preexistente en `dev` y sobrevive porque un test skipeado cuenta como verde. Decisión pendiente: reactivarlos (probablemente fallen y haya que arreglar el código) o sacarlos del gate para que el check diga la verdad.

### Lote de repunte de rutas: ejecutado (round 16, PR [#1065](https://github.com/Santidele22/orvel/pull/1065))

Rama `fix/dashboard-spec-stale-paths`, 2 commits. Se repuntaron 16 specs y un helper:

| Antes | Ahora |
|---|---|
| `pages/dashboard/home/dashboard-home.page.{ts,html}` | `features/dashboard-home/pages/...` |
| `pages/dashboard/servicios/servicios.page.{ts,html}` | `features/servicios/pages/...` |
| `pages/dashboard/clientes/clientes.page.html` | `features/clientes/pages/...` |
| `pages/landing/onboarding-business-step.page.{ts,html}` | `features/onboarding/pages/...` |
| scope zen `src/app/pages/dashboard` | `src/app/features` |
| `orvel-capacity-booking` resolvía `supabase/migrations/**` desde `apps/dashboard` | `resolve(process.cwd(), '../../supabase/...')`, la convención que ya usaba el resto del repo |

| Puerta | `dev` limpio | Rama |
|---|---|---|
| `vitest run` | 278 fallos | **260 (–18, 0 nuevos)** |
| `orvel-capacity-booking` solo | 9 fallos | **1** |
| `tsc app` / `ng build` | 0 / rc=0 | **0 / rc=0** |

**Lo que esto enseña (y por qué el rojo no era «rutas rotas»):** repuntar eliminó los errores de archivo faltante, pero la mayoría de esos tests **sigue roja por aserciones** contra los archivos actuales. Quedan 12 ENOENT (2 de ellos —`configuracion-industrial-theme.component.html` y `DESIGN_SYSTEM.md`— necesitan decisión de producto, no un repunte) y, sobre todo, ~158 fallos por aserción de valor (89) o regex source-locking (69). Eso ya no es un lote mecánico: cada uno exige decidir si el contrato se actualiza o el código se arregla.

### Anatomía del rojo: los 260 fallos, clasificados (round 17, PR [#1065](https://github.com/Santidele22/orvel/pull/1065))

Clasificación por el mensaje real de cada test fallido (rama `fix/dashboard-spec-stale-paths`):

| Grupo | Fallos | Qué significa |
|---|---|---|
| Regex **source-locking** | 70 | El spec lee un fuente y espera un patrón que ya no está: contrato viejo o requisito |
| Aserción **booleana/identidad** (`toBe`) | 64 | Espera `true`/definido y recibe `false`/`undefined` |
| **Excepción del código** bajo test | 50 | El código lanza (`BUSINESS_CONTEXT_MISSING`, "Categoría duplicada"…): divergencia real o precondición del test |
| **Requisito pendiente declarado** (`TODO(`/`Missing`) | 22 | El propio test dice que falta implementar algo |
| Otro | 15 | |
| Valor esperado ≠ real (`toEqual`) | 13 | |
| **Cleanup zen-only** (`industrial`/`chic`/`ink`) | 12 | Esperan temas que el cleanup eliminó |
| **ENOENT** | 6 | 2 necesitan decisión de producto (`configuracion-industrial-theme.component.html`, `DESIGN_SYSTEM.md`) |
| **Inyección (DI)** | 5 | El TestBed no provee `DashboardService` → **arreglados**: 260 → 255 |
| Catálogo de planes viejo (`FREE/BASIC/MEDIUM`) | 3 | Migración de planes en curso |

Lectura para decidir:

- **~37 fallos son requisitos o consecuencias de decisiones** (22 `TODO`/`Missing` + 12 zen-only + 3 de planes): no se arreglan con código de test, se deciden.
- **134 son aserciones contra el código actual** (70 regex + 64 booleanas): cada una exige elegir entre actualizar el contrato o arreglar el código. Ahí está el trabajo real.
- **50 son excepciones del código bajo test**: pueden ser bugs reales (los más valiosos) o tests que no montan bien sus precondiciones.
- **5 eran DI puro y ya están arreglados** (commit `6aa829d`): fallaban en el montaje, no en el comportamiento.

Estado de la rama: **278 → 255 fallos (23 resueltos, 0 nuevos)**, `tsc app` 0, `ng build` rc=0.

### ¿Hay bugs de producción escondidos en el rojo? (round 18)

Auditamos el grupo de **54 excepciones lanzadas por el código bajo test** (el candidato más probable a contener bugs, como pasó con el turnero). Resultado: **no apareció ningún bug de producción**. Los 54 se reparten así:

| Excepción | Fallos | Qué es en realidad |
|---|---|---|
| `promise resolved … instead of rejecting` (kb004 + kb005) | 23 | **Contratos RED de validación**: el test exige que el servicio rechace payloads inválidos y el servicio los acepta. Requisito no implementado, no bug |
| `BUSINESS_CONTEXT_MISSING` | 8 | El spec no siembra el negocio activo (`ACTIVE_BUSINESS_STORAGE_KEY`) que `resolveBusinessId()` necesita |
| `CLIENTE_NOT_FOUND` / `TURNO_NOT_FOUND` | 8 | Ídem: el spec espera entidades que su propio doble no devuelve |
| `AUTH_REQUIRED` (2) + `subscription-state-machine` (2) + `kb001` (1) + otros (10) | 15 | Specs de integración viejos y migración de planes |

### El rojo es, sobre todo, deuda de specs de generaciones anteriores

Crucé cada spec con fallos contra su fuente:

| Generación del spec | Fallos | % |
|---|---|---|
| Importa los **shims legacy** `services/*` (cliente, servicio, auth, notification) | **62** | 24 % |
| Menciona **modo mock** (`setProvider('mock')`, mock fixtures) | **40** | 16 % |
| Otros (source-locking, booleanas, planes, ENOENT) | 153 | 60 % |

Es decir: **~102 de los 255 fallos (40 %) son specs que prueban el modo mock y los shims que el producto retiró** — el mismo patrón que `cliente.service.spec.ts` (392 líneas, comentarios "Spanish comments for clarity"), que instancia `new ClienteService()` desde `services/cliente.service` y espera listas mock, cuando el servicio real va a Supabase.

**Conclusión para decidir:** el rojo de `dev` no son bugs de producción; es deuda de tests de generaciones anteriores del código. La decisión no es «arreglar el código» sino **qué se hace con ~100-150 specs obsoletos**: borrarlos (el modo mock se retiró a propósito), reescribirlos contra el comportamiento actual, o dejarlos rojos y seguir usando paridad como puerta.

### Estado de los PRs y cierre del análisis del rojo (round 19)

**Los 5 PRs tienen CI verde** (verificado con `gh pr checks`):

| PR | `Dashboard booking regressions` | `Full repo checks` | Vercel |
|---|---|---|---|
| [#1061](https://github.com/Santidele22/orvel/pull/1061) código muerto | pass | pass | pass |
| [#1062](https://github.com/Santidele22/orvel/pull/1062) inversiones de capa | pass | pass | pass |
| [#1063](https://github.com/Santidele22/orvel/pull/1063) fix del turnero | pass | pass | pass |
| [#1064](https://github.com/Santidele22/orvel/pull/1064) fan-in de settings | pass | pass | pass |
| [#1065](https://github.com/Santidele22/orvel/pull/1065) repunte de specs | pass | pass | pass |

Es decir: por las reglas del repo («do not ask Santi to merge until CI is green») los cinco están listos. Y pasan **aunque `dev` esté rojo**, porque el CI corre 92 de 2049 tests (sección 10).

### El grupo de regex source-locking no es repuntable en bloque

Sobre los 70 fallos por `to match`: extraje los **73 patrones únicos** y busqué cada uno en los 256 archivos del dashboard y los paquetes.

| Resultado | Patrones | Lectura |
|---|---|---|
| El patrón **no existe en ningún archivo** del repo | **43** | Requisito nunca implementado, o comportamiento que se perdió: decisión |
| El patrón existe, pero en un archivo **no relacionado** | ~13 | Describen el diseño de otra época (p. ej. `aria-live=` vive hoy en `pwa-in-app-update`, y el spec lo exige en `turnos-list` y `clientes`) |
| El patrón existe en un archivo del mismo spec | 2 | Único grupo con repunte legítimo posible, ganancia de 1-2 fallos |

### Conclusión del rojo (rounds 15-19)

`dev` tiene 278 fallos, de los cuales el trabajo de esta sesión ya bajó 23. El resto **no es un problema de código ni de rutas**:

- **~102 (40 %)** son specs que prueban el **modo mock y los shims retirados**.
- **43 patrones** de source-locking no existen en ningún archivo: contratos de otra generación.
- **22 fallos** declaran literalmente que falta implementar algo (`TODO(`/`Missing`).
- **12** esperan los temas del cleanup zen-only.
- **Ninguno de los 54 fallos por excepción del código es un bug de producción** (auditado en el round 18).

La decisión ya no es técnica: **qué se hace con ~150 specs obsoletos** (borrarlos, reescribirlos contra el comportamiento actual, o dejarlos rojos y seguir con paridad como puerta).

### Rama consolidada actualizada con las 5 ramas (round 20)

`refactor/dashboard-cleanup-consolidated` (`8480b9f`, pusheada, sin PR) ya incluye **las cinco ramas**: código muerto, fix del turnero, inversiones de capa, fan-in de settings y el repunte de specs.

Un conflicto más, en `db-fix-dashboard-suite.red.contract.spec.ts`: la rama de capas había repuntado `servicioServiceTs` a la feature y la de specs había repuntado `serviciosTs` a `features/servicios/pages/`; cada lado tenía una ruta vieja y una nueva. Resuelto quedándose con **las dos nuevas**.

| Puerta | `dev` limpio | Consolidada (5 ramas) |
|---|---|---|
| Tests | 2049 | 2046 |
| Fallos | **278** | **252** (26 resueltos, **0 nuevos**) |
| `tsc app` / `tsc spec` | 0 / 769 | **0 / 767** |
| `ng build` | rc=0 | **rc=0** |
| CI requerido (los 3 pasos de vitest) | rc=0 | **43 + 7 en verde** |
| Bundle JS | 1 690 037 B / 74 | **1 693 353 B / 77 (+3 316 B = +0,20 %)** |

Si preferís un solo PR con todo: `gh pr create --base dev --head refactor/dashboard-cleanup-consolidated`.

### El grupo booleano no esconde montajes rotos (round 21)

Auditamos los **69 fallos por aserción booleana/identidad** (la hipótesis era encontrar más casos como los 5 de DI, que fallaban en el montaje y se arreglaron con un provider). Resultado: **ninguno es un caso de montaje**. Todos asertan comportamiento:

| Mensaje | Fallos | Naturaleza |
|---|---|---|
| `expected 0 to be greater than 0` (`clientes-ui-facade`, "mock mode") | 14 | Modo mock retirado |
| `expected false to be true` (`db-fix`: soft delete) | 10 | Contrato RED: exige soft-delete que el código no hace |
| `expected undefined to be defined` (`kb001` "Success Criteria") | 5 | Requisito RED |
| `vi.fn() to be called with arguments` (persistencia de onboarding) | 5 | Requisito RED |
| `Missing dedicated ink/industrial conditional block` | 4 | Cleanup zen-only |
| `expected 'PREMIUM' to be '{PRO,STARTER,GROWTH}'` | 4 | **Migración de planes** (ver abajo) |
| `kb003` (IDs/real vs mock) | 7 | Modo mock retirado |
| Otros (integración vieja, `clientes.spec`, `c3`) | 20 | Generaciones anteriores |

### Hallazgo: los specs de planes esperan la nomenclatura anterior

El catálogo canónico actual es:

```ts
export type CanonicalPlanCode = 'FREE' | 'PREMIUM';   // core/plans/plan-entitlements.ts:8
```

con `planAliases` para los códigos legacy y `normalizePlanCode()` resolviéndolos. Cuatro tests fallan porque esperan la nomenclatura **previa a la normalización**:

- `kb012-onboarding-flow-guard`: `expect(result.selectedPlan).toBe('PRO')` → recibe `PREMIUM`
- `onboarding-landing-dashboard-wiring-sb03`: espera `'STARTER'` y `'GROWTH'` en el payload → recibe `PREMIUM`

Que el valor observado sea `PREMIUM` y no `FREE` demuestra que el alias legacy existe y está resolviendo bien. **No es un bug de producción**: es la migración de planes ya hecha en el código con specs sin actualizar. La decisión es de diseño: si `selectedPlan` debe persistir el **canónico** (`PREMIUM`), los tests se actualizan; si debe preservar el **elegido en la landing** (`STARTER`/`GROWTH`), entonces el flujo pierde información y hay que arreglar el código.

Nota: `core/accounts/account-plan-policy.ts` tiene una modificación local de Santi que **no toqué**; revisada, es solo formateo (comas finales y saltos en la firma), sin cambio de comportamiento.

### Extracción física del servicio a `core` (round 22)

`refactor/dashboard-cleanup-consolidated` (`5c31a25`) ya no solo tiene los contratos: **la implementación vive en `core`**.

| Antes | Ahora |
|---|---|
| `features/settings/data-access/business.service.ts` (673 líneas) | `core/business/business.service.ts` |
| `features/settings/data-access/map-nullable-settings-to-form-defaults.ts` | `core/business/...` |
| `features/onboarding/data-access/onboarding-plan-storage.ts` | `core/storage/...` |

Los dos helpers se movieron **primero** porque `BusinessService` importaba el lector de plan desde `features/onboarding`: mover el servicio tal cual habría creado una arista `core → features` nueva (era el motivo por el que el round 13 no lo hizo). El lector de plan es storage puro + normalización (ya importaba todo de `core`) y el mapper solo importa `@orvel/types`.

30 archivos con referencias reescritas, incluidas las que los specs usan para bloquear fuentes por ruta (`readSource`, `new URL(..., import.meta.url)`, `import()` dinámico).

| Puerta | Consolidada antes | Con el move |
|---|---|---|
| `tsc app` / `tsc spec` | 0 / 767 | **0 / 767** |
| `ng build` | rc=0 | **rc=0** |
| `vitest run` | 2046 / 252 fallos | **2046 / 252 fallos (0 nuevos, 0 resueltos)** |
| Inversiones `core/shared → features` | 2 | **2 (el move no creó ninguna)** |

La paridad exacta de la suite es la evidencia de que es un move puro: no cambia comportamiento.

**Corrección de un dato previo:** al medir con cuidado las inversiones restantes aparecen **dos**, no una:

1. `core/auth/mock-login-business-types.ts` → `features/onboarding/data-access/onboarding-rubros` (pinneada por `packages-domain-shape.red.contract.spec.ts`, D3).
2. `core/billing/landing-plans-source.api.ts` → `features/billing/data-access/landing-plans-source.api` — **no estaba en mi conteo anterior**. Es cortable con el mismo patrón de puertos/tokens que ya usé en `core/dashboard` y `core/shell`.

### Última inversión cortable: `core/billing` (round 23, PR [#1066](https://github.com/Santidele22/orvel/pull/1066))

`core/billing/landing-plans-source.api.ts` era un shim de una línea (`export *`) hacia `features/billing/data-access/`, con su propio TODO autorizando el borrado:

```ts
// TODO(migration): remove after consumers import from features/billing/data-access directly.
```

Su único consumidor era un `import()` dinámico en `landing-orvel-pricing.red.contract.spec.ts`. Repuntado el consumidor y borrado el shim.

`packages-billing-shape.red.contract.spec.ts` lo pinneaba **a propósito**, con la razón escrita al lado:

```ts
// KEPT at apply: dynamic-import consumer surfaced in
// tests/integration/landing-orvel-pricing.red.contract.spec.ts (deletion deferred)
```

La postergación existía por el consumidor que este lote migra, así que el contrato pasa a exigir los **3** shims ausentes (REQ-BILLING-DEL-1), con su cabecera actualizada.

| Puerta | `dev` limpio | Rama |
|---|---|---|
| `tsc app` / `tsc spec` | 0 / 769 | **0 / 769** |
| `ng build` | rc=0 | **rc=0** |
| `vitest run` | 278 fallos | **278 fallos (0 nuevos, 0 resueltos)** |

**Resultado acumulado en la consolidada: 16 → 1 inversión `core/shared → features`.** La única que queda es `core/auth/mock-login-business-types.ts` → `features/onboarding/data-access/onboarding-rubros`, y esa **la exige un contrato** (`packages-domain-shape.red.contract.spec.ts`, split D3). Todo lo cortable está cortado.

## 9. Caveats y gotchas

- El análisis es **estático** (imports TS + plantillas HTML), no runtime. Un archivo "muerto" podría colgar de wiring dinámico fuera del árbol; por eso el lote 1 se validó con paridad de tests y `tsc`, no solo con el grafo.
- **Gotcha de entorno:** `ripgrep` invocado desde un subproceso de Python devolvió falsos negativos según los flags `-g` usados (mismo patrón: encontrado con `-g '!node_modules' -g '!.git'`, no encontrado sin ellos, y viceversa en otra corrida). La verificación final del lote se hizo en **Python puro** (lectura directa de archivos), que además es independiente de `.gitignore`.
- Las cifras de features/capas excluyen `*.spec.ts` en el rol de producción, pero los specs sí cuentan como importadores al decidir borrados.
- El conteo de líneas y el baseline rojo se midieron el 2026-09-28 sobre `a454a04`; `dev` se mueve.

## 10. Cobertura real del CI y mapa del rojo de `dev` (round 15)

### El CI ejecuta el 4,5 % del suite del dashboard

Medido leyendo los dos workflows y corriendo cada paso en un worktree limpio de `dev` (**298 archivos / 2049 tests** en total):

| Gate | Pasos sobre el dashboard | Tests que ejecuta |
|---|---|---|
| `Dashboard booking regressions` (requerido en `dev`/`main`) | 3 pasos de vitest + `tsc -p tsconfig.app.json` + 5 pasos Deno | **50** (43 + **0** + 7) |
| `Full repo checks` (`ci.yml` → `pnpm run check` + `test:dashboard:account-cancellation`) | `check:dashboard` (time-picker + 4 contracts + build) + 3 specs de cancelación | **42** (20 + 22) |
| **Total** | 14 archivos distintos de 298 | **92 de 2049 = 4,5 %** |

El resto del suite **nunca corre en CI**. Eso explica cómo `dev` acumula 278 fallos sin que nada se ponga rojo. Y el paso "branch booking resilience" del gate requerido aporta **0 tests** (12 skipeados, sección 8-septies).

### Los 278 fallos, por causa raíz

Clasificados por el mensaje real de cada test (`failureMessages`):

| Causa | Fallos | % |
|---|---|---|
| Aserción de valor (contrato desactualizado) | 89 | 32 % |
| Regex / source-locking que no matchea | 69 | 25 % |
| Error lanzado por el código bajo test | 50 | 18 % |
| **Lee un archivo que no existe** | **42** | **15 %** |
| Otras aserciones | 19 | 7 % |
| Error de inyección (DI) | 5 | 2 % |
| TypeError en runtime de test | 4 | 1 % |

Top de archivos: `cliente.service.spec` (19), `kb004-turnos-create-guard` (17), `kb005-turnos-update-cancel-guard` (15), `servicios-crud-d03` (13).

### El grupo de 42 es el más rentable: rutas obsoletas

13 rutas distintas, y las que más pesan son el layout viejo `src/app/pages/**` (borrado en su día):

| Ruta que el spec busca | Fallos | Ruta actual |
|---|---|---|
| `src/app/pages/dashboard/home/dashboard-home.page.ts` | 10 | `features/dashboard-home/pages/dashboard-home.page.ts` |
| `src/app/pages/dashboard/servicios/servicios.page.html` | 8 | `features/servicios/pages/servicios.page.html` |
| `src/app/pages/dashboard` (directorio) | 4 | — |
| `src/app/pages/dashboard/home/dashboard-home.page.html` | 3 | `features/dashboard-home/pages/dashboard-home.page.html` |
| `src/app/pages/landing/onboarding-business-step.page.{ts,html}` | 4 | `features/onboarding/pages/onboarding-business-step.page.*` |
| `src/app/pages/dashboard/servicios/servicios.page.ts` | 1 | `features/servicios/pages/servicios.page.ts` |
| `supabase/migrations/2026042012{1000,2000}_*.sql`, `20260426*` | 8 | migraciones retimestampeadas |
| `configuracion-industrial-theme.component.html` | 1 | eliminado por el cleanup zen-only → **requiere decisión** |
| `DESIGN_SYSTEM.md` | 1 | documento que no existe → **requiere decisión** |

**≈38 de los 278 fallos se pueden repuntar sin tocar una línea de producción** (mismo patrón que ya arregló 4 tests de KB-007). Es el siguiente lote: bajar el rojo de `dev` es el desbloqueo real del criterio «tests en verde» del objetivo.
