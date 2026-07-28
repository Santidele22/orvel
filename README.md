# Orvel

> El negocio de tu salón en el bolsillo.

Orvel es un sistema de gestión de turnos pensado para salones de belleza — uñas, barbería, peluquería, masajes, estética. Reemplaza el cuaderno, el Excel y el grupo de WhatsApp por una agenda digital que funciona desde el celular.

---

## El problema que conocemos

Si tenés un salón, seguro te pasa alguna de estas:

- Anotás turnos en un cuaderno que se pierde o se borra con la lluvia.
- Manejás todo por WhatsApp y nadie sabe qué horarios están libres.
- El cliente llama, no atendés, y se va a la competencia.
- Tenés una app pero nadie la usa porque es fea o complicada.
- Querés ver cuánto facturás este mes y no sabés ni por dónde empezar.

Orvel existe para sacarte eso de encima.

---

## Qué hace Orvel

### Para vos, dueña o recepcionista

- **Agenda mobile-first**: el día se ve claro, scroll horizontal para mover entre días, tap para ver detalle, botón flotante para crear un walk-in en 3 segundos.
- **Reservas en vivo**: cuando alguien reserva desde tu página, aparece al instante. Si cancela, también.
- **Clientes y servicios**: alta de clientes, catálogo de servicios con duración y precio, profesionales con sus horarios.
- **Notificaciones**: nuevos turnos, cancelaciones, señas pendientes — lo importante, sin ruido.
- **Reportes simples**: turnos del día, facturación, próximos huecos. Lo que necesitás ver en 10 segundos.

### Para tu cliente final

- **Reserva sin login**: cada salón tiene una página pública (`tusalon.com/orvel`) donde el cliente elige servicio, día y horario en menos de 1 minuto.
- **Confirmación por email**: el cliente recibe un mail con el detalle y un link para cancelar o reprogramar si necesita.
- **No necesitás instalar nada**: la página funciona en cualquier celular con browser.

### Para tu equipo (cuando lo necesites)

- **Multi-profesional**: si tenés manicuristas que atienden distintos servicios, cada una ve solo su agenda.
- **Roles diferenciados**: vos como admin ves todo; tus manicuristas solo ven sus turnos y los clientes que les tocan.

---

## Cómo se usa (3 pasos)

### 1. Creás tu salón

```
1. Te registrás en orvel.app
2. Elegís tu rubro (uñas, barbería, etc.)
3. Cargás tus servicios (con duración y precio)
4. Configurás tus horarios de atención
```

Tiempo: 10 minutos.

### 2. Compartís tu página

```
- orvel.app/tu-salon
- o un subdominio: salon-bella.orvel.app
- o tu propio dominio: reserva.tusalon.com
```

Pegás el link en tu Instagram, tu Google Maps, tu vidriera. Los clientes reservan solos.

### 3. Operás desde el celular

```
Mañana: abrís Orvel en el celu, ves el día
Walk-in: tap en "+", elegís cliente y servicio, listo
Cliente cancela: llega la notificación, lo marcás en 1 tap
Fin del día: ves la facturación del día
```

---

## Qué incluye cada plan

| | **Gratis** | **Premium** ($25.000 ARS/mes) |
|---|---|---|
| Turnos por mes | Hasta 30 | Ilimitados |
| Local principal | ✅ | ✅ |
| Landing pública | ✅ | ✅ |
| Notificaciones | ✅ | ✅ |
| Multi-profesional | — | Próximamente |
| Soporte prioritario | — | ✅ |

---

## Por qué Orvel y no otra cosa

- **Mobile-first desde el día 1**: otras apps son "web responsive" que se rompen en el celu. Orvel está pensada para celular primero.
- **PWA instalable**: la podés instalar en la pantalla de inicio como una app nativa. No necesitás ir a Play Store.
- **Sin entrenamiento**: la mayoría de las dueñas operaron sin ver un manual. La interfaz es directa.
- **Hecho por gente que operó salones**: conocemos el dolor porque lo vivimos.

---

## Roadmap

Ya está:
- Agenda mobile-first con day strip, cards, FAB
- Walk-in en 3 pasos (cliente → servicio → horario)
- Página pública de reservas con email de confirmación
- Integración Mercado Pago (suscripción recurrente)

Próximamente:
- Multi-profesional (release 1.0.5)
- Push notifications reales
- Reportes avanzados
- App nativa para iOS/Android (cuando PWA no alcance)

---

## Stack técnico (resumido)

| Capa | Tecnología |
|------|------------|
| Frontend dashboard | Angular 21, Tailwind CSS, PWA |
| Frontend landing | Astro 6 |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) |
| Edge Functions | Deno |
| Hosting | Vercel |
| Tests | Vitest + Playwright |

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