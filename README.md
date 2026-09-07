# Orvel

> Turnos para tu salón, sin cuaderno ni WhatsApp.

Orvel es un sistema de turnos para negocios de belleza — uñas, barbería, estética. Reemplaza el cuaderno, el Excel y el grupo de WhatsApp por una agenda digital y una página pública de reservas.

No cobra online. No hay Mercado Pago por ahora. Las señas se piden por alias o CBU.

---

## El problema que conocemos

Si tenés un salón, seguro te pasa alguna de estas:

- Anotás turnos en un cuaderno que se pierde o se borra con la lluvia.
- Manejás todo por WhatsApp y nadie sabe qué horarios están libres.
- El cliente llama, no atendés, y se va a la competencia.
- Tenés una app pero nadie la usa porque es fea o complicada.

Orvel existe para sacarte eso de encima.

---

## Qué hace Orvel

### Para vos, dueña o recepcionista

- **Agenda de turnos**: ves el día, creás walk-ins, cancelás y reprogramás, bloqueás horarios. El dashboard de operación es desktop.
- **Reservas en vivo**: cuando alguien reserva desde tu página, aparece. Si cancela, también.
- **Clientes, servicios y equipo**: alta de clientes, catálogo con duración y precio, varios profesionales.
- **Señas**: configurás monto o porcentaje y alias/CBU. El cliente ve cómo señalar; no hay checkout de Mercado Pago.
- **Notificaciones**: turnos nuevos y cancelaciones.

### Para tu cliente final

- **Reserva sin login**: cada salón tiene una URL pública. Elige servicio, profesional (si aplica), día y horario.
- **Cancelar o reprogramar** desde el flujo de reserva.
- **Sin instalar nada**: funciona en el celular con el browser. También se puede instalar como PWA.

### Para tu equipo

- **Multi-profesional**: cada profesional con sus servicios y horarios. El cliente puede o no elegir a quién, según tu regla de reserva.

---

## Cómo se usa (3 pasos)

### 1. Creás tu salón

```
1. Te registrás
2. Cargás tus servicios (con duración y precio)
3. Configurás horarios y, si hace falta, profesionales y seña
```

### 2. Compartís tu página

Pegás el link público en Instagram, Google Maps o la vidriera. Los clientes reservan solos.

### 3. Operás la agenda

```
Walk-in: creás el turno a mano
Alguien reserva: aparece en la agenda
Cancelación: lo ves y reacomodás el día
```

---

## Qué incluye cada plan

| | **Gratis** | **Premium** |
|---|---|---|
| Turnos | Cupo del plan | Ilimitados |
| Local | ✅ | ✅ |
| Página pública de reservas | ✅ | ✅ |
| Clientes y servicios | ✅ | ✅ |
| Multi-profesional | ✅ | ✅ |
| Señas (alias/CBU) | ✅ | ✅ |
| Notificaciones | ✅ | ✅ |
| Soporte prioritario | — | ✅ |

Precios de plan no se documentan acá: viven en el producto. Mercado Pago / cobro online no forman parte del plan.

---

## Por qué Orvel y no otra cosa

- **El cliente reserva en el celular**: PWA, sin app store.
- **El operador corre la agenda en desktop**: corte explícito, no “responsive que se rompe”.
- **Seña operativa, no PSP**: alias/CBU, sin Mercado Pago por ahora.
- **Sin entrenamiento**: interfaz directa.

---

## Qué no es (por ahora)

- Cobro online / Mercado Pago / suscripción recurrente por MP.
- Reportes avanzados ni facturación.
- CRM, inventario, sucursales, waitlist, turnos recurrentes, marketplace.
- App nativa iOS/Android.

---

## Stack técnico (resumido)

| Capa | Tecnología |
|------|------------|
| Dashboard | Angular 21, Tailwind CSS, PWA |
| Landing | Astro 6 + Svelte 5 |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) |
| Edge Functions | Deno |
| Hosting | Vercel |
| Tests | Vitest + Playwright |

Contexto de producto y arquitectura: `infra/context/`.

---

## Licencia

[MIT](LICENSE) — podés usar el código para lo que quieras, atribución appreciated.

---

## Contacto

- **Web**: [orvel.app](https://orvel.app)
- **Issues / feedback**: [github.com/Santidele22/orvel/issues](https://github.com/Santidele22/orvel/issues)
- **Email**: hola@orvel.app (placeholder)

---

Hecho en Argentina 🇦🇷, pensado para salones de Latinoamérica.
