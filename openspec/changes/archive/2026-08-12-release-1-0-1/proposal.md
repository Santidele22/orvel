# Propuesta: Release 1.0.1 — Landing honesta + Emails a la mitad

## Intención

Orvel 1.0.0 publica afirmaciones falsas sobre rubros no soportados, funcionalidades no implementadas (señas, cobros online, recordatorios WhatsApp) y una política de notificaciones que protege el canal incorrecto (email al dueño como obligatorio, email al cliente como best-effort). Este change alinea la landing y el flujo de notificaciones con la doctrina de producto documentada en `orvel-1.0.1`, elimina deuda de honestidad comercial y establece la base operativa para el crecimiento por cohortes.

## Alcance

### Incluido

**A. Landing honesta** (apps/landing)
- Features: conservar solo Uñas y Barbería; eliminar peluquería, spa, tattoo, pestañas/cejas, masajes, estética, maquillaje, wellness
- FAQ: eliminar referencias a rubros no soportados y wellness
- Problem: eliminar afirmación "recordatorios por WhatsApp"
- HowItWorks: eliminar "cobro de seña online"
- CTA: eliminar "cobrar pagos por seña"
- Audience: eliminar "cobros online" de la tarjeta de match
- SEO description: ajustar a rubros reales (Layout.astro)
- Signup/onboarding (onboarding.astro, account.astro): reducir selectores de rubro a uñas, barbería, peluquería, "Otro"

**B. Emails a la mitad** (supabase, apps/dashboard)
- Eliminar envío de email ordinario al dueño en creación, reprogramación y cancelación
- Conservar email de confirmación al cliente en los tres eventos (incluyendo cancelación al cliente, brecha detectada en exploración)
- Notificación durable de dashboard: volverla obligatoria con inversión atómica (turno + intent email cliente + notificación dashboard persisten juntos; si falla la notificación, falla la operación)
- Relajar `BUSINESS_EMAIL_OUTBOX_REQUIRED`: el outbox del dueño deja de ser contrato obligatorio
- Preparar paginación/límites en consultas de `dashboard_notifications`
- Orden de migración seguro: primero hacer obligatoria la notificación durable, después relajar el outbox del dueño

### Fuera de alcance
- Señas, cobros online, caja, facturación
- WhatsApp como canal de notificación
- Digest diario
- Capa multi-profesional, recursos, perfiles por rubro (releases posteriores)
- Peluquería en landing (se retira hasta su release 1.0.6)

## Capacidades

### Capacidades nuevas
- `notificaciones-durables-dashboard`: notificación durable obligatoria con atomicidad en creación/reprogramación/cancelación de turnos
- `landing-rubros-honestos`: landing que solo exhibe y promete rubros con cobertura real de producto

### Capacidades modificadas
- `envio-email-outbox`: el contrato `BUSINESS_EMAIL_OUTBOX_REQUIRED` se relaja; el outbox del dueño pasa a best-effort
- `confirmacion-email-cliente`: se extiende para cubrir también cancelación al cliente (brecha actual)

## Enfoque

**Stream A (Landing)**: edición quirúrgica de componentes Astro — eliminar tarjetas de Features, ajustar textos en FAQ/Problem/CTA/Audience/HowItWorks, acotar SEO y selectores de signup. Sin cambios de arquitectura ni nuevas dependencias.

**Stream B (Emails)**: migración de migraciones Supabase existentes + nuevas migraciones. El orden es crítico: (1) nueva migración que hace obligatoria `dashboard_notifications`, (2) nueva migración que relaja `BUSINESS_EMAIL_OUTBOX_REQUIRED`. En Supabase Edge Functions, ajustar `process-email-outbox` para no enviar email al dueño en eventos ordinarios. En dashboard, agregar límite/paginación a queries de notificaciones.

## Áreas afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `apps/landing/src/components/organisms/Features.astro` | Modificado | Reducir de 6 a 2 tarjetas (Uñas, Barbería) |
| `apps/landing/src/components/organisms/FAQ.astro` | Modificado | Eliminar wellness y rubros no soportados de FAQ #1 |
| `apps/landing/src/components/organisms/Problem.astro` | Modificado | Eliminar WhatsApp de tarjeta "Recordatorios inteligentes" |
| `apps/landing/src/components/organisms/HowItWorks.astro` | Modificado | Eliminar "cobro de seña online" |
| `apps/landing/src/components/organisms/CTA.astro` | Modificado | Eliminar "cobrar pagos por seña" |
| `apps/landing/src/components/organisms/Audience.astro` | Modificado | Eliminar "cobros online" de match card |
| `apps/landing/src/layouts/Layout.astro` | Modificado | Ajustar SEO description |
| `apps/landing/src/pages/auth/signup/onboarding.astro` | Modificado | Reducir selectores de rubro (8→4) |
| `apps/landing/src/pages/auth/signup/account.astro` | Modificado | Reducir selectores de rubro (7→4) |
| `supabase/migrations/` | Nuevo | 2 migraciones: notificación durable obligatoria, outbox dueño relajado |
| `supabase/functions/process-email-outbox/` | Modificado | Suprimir envío a dueño en eventos ordinarios |
| `apps/dashboard/src/app/core/notifications/` | Modificado | Agregar límite/paginación a queries |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Inversión atómica rompe creación de turnos si `dashboard_notifications` falla | Baja | La tabla ya existe; se prueba en entorno local antes de deploy |
| Inversión de orden de migración (relajar outbox antes de hacer durable la notificación) | Media | El orden está documentado explícitamente en la propuesta; revisión de PR lo verifica |
| El change combinado excede el presupuesto de revisión de 400 líneas | Alta | Se sugiere split natural: PR #1 landing, PR #2 emails |
| Clientes existentes con datos en `dashboard_notifications` | Baja | La migración es aditiva (nuevas constraints), no destructiva |

## Plan de rollback

- **Landing**: revertir commits de componentes Astro; deploy inmediato desde Vercel
- **Emails**: revertir migraciones en orden inverso (primero restaurar `BUSINESS_EMAIL_OUTBOX_REQUIRED`, luego relajar constraint de `dashboard_notifications`); redeploy de Edge Functions

## Dependencias

- Ninguna externa. Todo el trabajo es sobre código existente en el monorepo.

## Criterios de éxito

- [ ] Landing muestra solo Uñas y Barbería en Features; FAQ no menciona wellness ni rubros no soportados
- [ ] Problem/CTA/HowItWorks/Audience no contienen afirmaciones sobre señas, cobros online ni WhatsApp
- [ ] SEO description y signup selectors reflejan solo rubros con cobertura real
- [ ] La creación de un turno persiste atómicamente turno + intent email cliente + notificación dashboard durable
- [ ] Si falla la inserción de notificación durable, la creación del turno falla
- [ ] El dueño no recibe email ordinario en creación, reprogramación ni cancelación
- [ ] El cliente recibe email de confirmación en creación, reprogramación y cancelación
- [ ] Las queries de notificaciones del dashboard tienen límite explícito y paginación
