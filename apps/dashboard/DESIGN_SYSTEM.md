# Orvel Design System

Orvel usa una estética premium, oscura y enfocada en claridad operativa para negocios de belleza. No reutilizar lenguaje visual ni nombres de Turnea; Turnea solo puede aparecer como compatibilidad técnica legacy si una migración lo requiere.

## Identidad visual

- **Marca:** Orvel.
- **Personalidad:** calma, precisión, intención y control. La interfaz debe sentirse elegante, confiable y simple.
- **Producto:** agenda/turnos para salones, barberías, uñas, estética, spas y profesionales de belleza.
- **Promesa visual:** menos ruido, más foco; cada pantalla debe ayudar a completar un turno o entender el estado del negocio.

## Paleta

- Fondo principal: `#0A0A0A` / negro suave.
- Superficie: `#121212` con glass sutil.
- Texto principal: `#F1F5F9`.
- Texto secundario: `#94A3B8`.
- Acento principal: violeta Orvel `#7C3AED`.
- Acento hover: `#6D28D9`.
- Acento claro/glow: `#A78BFA`.
- Éxito: `#10B981`.
- Advertencia premium/pro: `#F59E0B` / dorado suave.
- Bordes: `#334155` con opacidad baja.

## Tipografía

- Headlines: grandes, compactos, peso `800–900`, tracking levemente negativo.
- Énfasis editorial: usar violeta e itálica en frases cortas, por ejemplo `con intención`.
- Labels: uppercase, `10–12px`, bold, tracking amplio.
- Body: gris slate, line-height generoso.

## Landing actual

Hero canónico:

- Pill: `VERSIÓN 1.0 PRÓXIMAMENTE`.
- Título: `Gestioná tu salón con intención.`
- Subcopy: Orvel como plataforma para excelencia en cada turno y fidelidad en cada cliente.
- Visual: screenshot/mock del dashboard en card glass con glow violeta y floating card de turno confirmado.

## Pricing

Planes base:

- `STARTER` — `$12.900/mes`.
- `GROWTH` — `$24.900/mes`.
- `PRO` — `desde $44.900/mes`.
- Todos los planes base incluyen **1 local**.

Regla de monetización:

- Multi-sucursal NO se comunica como incluido en planes base.
- Multi-sucursal es add-on separado: `+$20.000/mes por local adicional`.
- CTA recomendado: `Consultar multi-sucursal`, no `Comprar ahora` ni `Checkout`.

Diseño del add-on:

- Ubicación: debajo de las 3 cards de pricing.
- Forma: banda horizontal glass en desktop; card vertical en mobile.
- Fondo: gradiente violeta sutil sobre superficie oscura.
- Borde: violeta con opacidad baja.
- Copy:
  - Pill: `ADD-ON`.
  - Título: `Multi-sucursal`.
  - Precio: `+$20.000/mes por local adicional`.
  - Nota: `Los planes base incluyen 1 local.`

## Componentes

- Cards: fondo oscuro, borde fino, radius grande, hover con borde violeta y elevación mínima.
- Buttons: pills redondeadas, sin exceso de gradientes; usar violeta para acciones principales.
- Badges: uppercase, tracking amplio, border/glass.
- Estados: loading, error, empty y success deben ser explícitos y accesibles.

## Reglas

- No usar marca Turnea en UI ni documentación visual actual.
- No prometer checkout si el flujo real es MercadoPago subscriptions/preapproval.
- Mantener contraste AA como mínimo.
- Mantener mobile-first: cards stacked y CTA full-width en mobile.
