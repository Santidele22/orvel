# Business types promoted

## Propósito

Agrega la columna `is_promoted` a `business_types` para que la landing y el signup filtren el catálogo de rubros desde la base de datos en vez de hardcodear la lista en componentes Astro. Marca 4 rubros como promovidos (Uñas, Masajes, Barbería, Peluquería) y deja los otros 4 como no-promovidos (Pestañas, Cejas, Spa, Otro). Los promovidos aparecen en la landing; promovidos más "Otro" aparecen en signup.

## Requisitos

### Requisito: Columna is_promoted agregada

La tabla `business_types` DEBE ganar la columna `is_promoted BOOLEAN NOT NULL DEFAULT false`. La migración DEBE ser idempotente y no romper las 8 filas existentes en la tabla.

#### Escenario: Migración agrega la columna

- DADO que la tabla `business_types` tiene 8 filas y ninguna columna `is_promoted`
- CUANDO se ejecuta la migración que agrega la columna
- ENTONCES la columna existe con tipo `BOOLEAN NOT NULL DEFAULT false`
- Y las 8 filas existentes tienen `is_promoted = false` por el default

### Requisito: Marcado de rubros promovidos

La migración DEBE marcar exactamente 4 filas con `is_promoted = true`: Uñas, Masajes, Barbería, Peluquería. Las otras 4 filas (Pestañas, Cejas, Spa, Otro) DEBEN quedar con `is_promoted = false`.

#### Escenario: Migración marca 4 promovidos correctos

- DADO que la columna `is_promoted` existe con default false
- CUANDO se ejecuta el UPDATE de la migración
- ENTONCES las filas con slug/nombre `unas`, `masajes`, `barberia`, `peluqueria` quedan con `is_promoted = true`
- Y las filas con slug/nombre `pestanas`, `cejas`, `spa`, `otro` quedan con `is_promoted = false`
- Y exactamente 4 filas tienen `is_promoted = true` (verificable con `SELECT COUNT(*) WHERE is_promoted = true`)

### Requisito: Landing muestra solo promovidos

El componente `apps/landing/src/components/organisms/Features.astro` DEBE renderizar únicamente las tarjetas de los rubros con `is_promoted = true`. Si los rubros se cargan desde una API, la query DEBE filtrar por `is_promoted = true`. Si se carga desde un catálogo estático, el catálogo DEBE contener solo los 4 promovidos.

#### Escenario: Landing renderiza exactamente 4 cards

- DADO que la migración marcó 4 promovidos
- CUANDO el usuario navega a la landing principal
- ENTONCES el componente `Features.astro` renderiza exactamente 4 tarjetas
- Y las tarjetas corresponden a Uñas, Masajes, Barbería y Peluquería (en ese orden o el definido por el seed)

#### Escenario: Non-promoted no aparecen en landing

- DADO que los rubros Pestañas, Cejas, Spa, Otro están en la base con `is_promoted = false`
- CUANDO el usuario navega a la landing principal
- ENTONCES ninguno de esos 4 rubros aparece como tarjeta en `Features.astro`

### Requisito: Signup muestra promovidos más Otro

Los componentes `apps/landing/src/pages/auth/signup/onboarding.astro` y `apps/landing/src/pages/auth/signup/account.astro` DEBEN renderizar exactamente 5 opciones en el selector de rubro: los 4 promovidos más "Otro". Ningún otro rubro promovido o no-promovido DEBE aparecer en estos selectores.

#### Escenario: Onboarding muestra 5 opciones

- DADO que la migración está aplicada
- CUANDO el usuario llega al paso de selección de rubro en `onboarding.astro`
- ENTONCES el selector contiene exactamente 5 opciones: Uñas, Masajes, Barbería, Peluquería y Otro

#### Escenario: Account signup muestra 5 opciones

- DADO que la migración está aplicada
- CUANDO el usuario llega al paso de selección de rubro en `account.astro`
- ENTONCES el selector contiene exactamente 5 opciones: Uñas, Masajes, Barbería, Peluquería y Otro

### Requisito: Non-promoted preservados en DB pero ausentes de UI

Los 4 rubros no-promovidos (Pestañas, Cejas, Spa, Otro) DEBEN existir en la tabla `business_types` con `is_promoted = false`. "Otro" DEBE estar disponible para selección en signup aunque no esté promovido. Los otros 3 (Pestañas, Cejas, Spa) NO DEBEN aparecer en ninguna UI pública.

#### Escenario: Non-promoted existen en DB pero ausentes en landing

- DADO que las 8 filas están en la tabla con sus flags correctos
- CUANDO se hace un SELECT sobre `business_types` con `is_promoted = false`
- ENTONCES se devuelven 4 filas (Pestañas, Cejas, Spa, Otro)
- Y ninguna de esas filas excepto Otro aparece en la landing

#### Escenario: Otro seleccionable en signup pero no promovido

- DADO que "Otro" tiene `is_promoted = false`
- CUANDO el usuario revisa el selector de signup
- ENTONCES "Otro" aparece como opción seleccionable
- Y no aparece en la landing (no es promovido)
