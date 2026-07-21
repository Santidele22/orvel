# Landing de rubros honestos

## Propósito

Especifica que la landing pública solo exhibe y promete rubros y funcionalidades con cobertura real de producto, eliminando afirmaciones falsas sobre señas, cobros online, WhatsApp y rubros no soportados.

## Requisitos

### Requisito: Features restringidas a rubros soportados

La sección Features DEBE exhibir únicamente tarjetas para Uñas y Barbería. Toda referencia a peluquería, spa, tattoo, pestañas/cejas, masajes, estética, maquillaje y wellness DEBE ser eliminada.

#### Escenario: Solo dos tarjetas visibles en Features

- DADO que un visitante carga la landing
- CUANDO la sección Features se renderiza
- ENTONCES solo se muestran 2 tarjetas: Uñas y Barbería
- Y no aparecen tarjetas de peluquería, spa, tattoo, pestañas, cejas, masajes, estética, maquillaje ni wellness

### Requisito: FAQ sin rubros no soportados ni wellness

La sección FAQ DEBE eliminar toda referencia a rubros no soportados y a wellness.

#### Escenario: FAQ #1 sin mención de rubros inexistentes

- DADO que un visitante lee la FAQ
- CUANDO se renderiza la respuesta sobre qué rubros soporta Orvel
- ENTONCES la respuesta menciona únicamente uñas y barbería como rubros con cobertura activa
- Y no menciona peluquería, pestañas, spas, masajes, wellness ni estética

### Requisito: Problem sin afirmación de WhatsApp

La sección Problem DEBE eliminar la afirmación "recordatorios por WhatsApp" de la tarjeta de recordatorios inteligentes.

#### Escenario: Tarjeta de recordatorios sin WhatsApp

- DADO que un visitante lee la sección Problem
- CUANDO se renderiza la tarjeta de recordatorios
- ENTONCES el texto no contiene "WhatsApp" ni implica envío por ese canal

### Requisito: HowItWorks sin cobro de seña

La sección HowItWorks DEBE eliminar el paso "Cobro de seña online".

#### Escenario: Pasos sin mención de señas

- DADO que un visitante lee HowItWorks
- CUANDO se renderizan los pasos
- ENTONCES ningún paso menciona "seña", "cobro de seña" ni "cobro online"

### Requisito: CTA sin cobros por seña

La sección CTA DEBE eliminar la frase "cobrar pagos por seña".

#### Escenario: CTA sin promesa de cobros

- DADO que un visitante lee la sección CTA
- CUANDO se renderiza el texto principal del CTA
- ENTONCES el texto no contiene "cobrar pagos por seña" ni similar

### Requisito: Audience sin cobros online

La sección Audience DEBE eliminar "cobros online" de la tarjeta de match.

#### Escenario: Tarjeta de match sin cobros

- DADO que un visitante lee la sección Audience
- CUANDO se renderiza la tarjeta "Hecho para vos si..."
- ENTONCES ninguna tarjeta menciona "cobros online" ni delegación de cobros

### Requisito: SEO description con rubros reales

El meta description del Layout DEBE reflejar únicamente los rubros con cobertura real de producto.

#### Escenario: Meta description coherente

- DADO que un motor de búsqueda indexa la landing
- CUANDO lee el meta description
- ENTONCES el description menciona uñas y barbería como rubros soportados
- Y no menciona peluquería, señas, cobros online ni WhatsApp

### Requisito: Selectores de signup acotados

Los formularios de onboarding y account DEBE reducir los selectores de rubro a: Uñas, Barbería, Peluquería y "Otro".

#### Escenario: Onboarding con 4 opciones

- DADO que un usuario está en el paso de onboarding del signup
- CUANDO se renderiza el selector de rubro
- ENTONCES las opciones son exactamente: Uñas, Barbería, Peluquería, Otro
- Y no aparecen Spa, Pestañas, Cejas, Masajes ni Estética

#### Escenario: Account con 4 opciones

- DADO que un usuario está en el formulario de account del signup
- CUANDO se renderiza el selector de rubros
- ENTONCES las opciones son exactamente: Peluquería, Barbería, Uñas, Otro
- Y no aparecen Estética, Spa ni Maquillaje

#### Escenario: Selección de "Otro"

- DADO que un usuario selecciona "Otro" en el selector de rubro
- CUANDO envía el formulario
- ENTONCES el sistema acepta la selección
- Y el rubro principal queda registrado como "otro"

### Requisito: Peluquería retenida en selectores pero no en landing pública

Peluquería DEBE permanecer en los selectores de signup como opción de próximo ingreso (release 1.0.5), pero NO debe aparecer en Features, FAQ, SEO ni en las secciones públicas de la landing.

#### Escenario: Peluquería ausente de Features pero presente en signup

- DADO que la landing está desplegada
- CUANDO un visitante revisa Features
- ENTONCES peluquería no aparece
- PERO cuando el mismo visitante llega al signup, peluquería sí aparece como opción

### Requisito: Ruta de reincorporación documentada

El código DEBE incluir un comentario o referencia que documente la reincorporación de peluquería a la landing pública en el release 1.0.5.

#### Escenario: Referencia a reincorporación existente

- DADO que un desarrollador revisa los componentes de la landing
- CUANDO busca referencias a peluquería
- ENTONCES encuentra documentación que indica la reincorporación planificada para release 1.0.5

### Requisito: Link "Plan" visible en el navbar

La navbar DEBE exhibir un link con la etiqueta "Plan" que apunte a la sección pública "Próximos pasos" (`#proximos-pasos`), tanto en desktop como en mobile. "Plan" se interpreta como hoja de ruta pública, NO como plan de suscripción — el flujo de signup vive en el botón "Crear cuenta" de la navbar, que sigue apuntando a `/auth/signup/plan`.

#### Escenario: Link "Plan" en navbar desktop

- DADO que un visitante carga la landing en desktop
- CUANDO se renderiza la navbar
- ENTONCES existe un link visible con el texto "Plan"
- Y su href es `#proximos-pasos` (anchor a la sección "Próximos pasos")

#### Escenario: Link "Plan" en navbar mobile

- DADO que un visitante carga la landing en mobile y abre el menú hamburguesa
- CUANDO se renderiza el dropdown
- ENTONCES existe un link visible con el texto "Plan"
- Y su href es `#proximos-pasos`

#### Escenario: Click en "Plan" hace scroll a la sección

- DADO que un visitante está en cualquier parte de la landing
- CUANDO hace click en el link "Plan" del navbar
- ENTONCES la página scrollea suave hasta la sección "Próximos pasos"

#### Escenario: "Crear cuenta" sigue siendo el CTA de signup

- DADO que un visitante quiere suscribirse
- CUANDO ve la navbar
- ENTONCES el botón "Crear cuenta" sigue apuntando a `/auth/signup/plan`
- Y ese flujo es independiente del link "Plan" (hoja de ruta)

### Requisito: Sección pública "Próximos pasos"

La landing DEBE exhibir una sección llamada "Próximos pasos" que muestre el orden público de releases por rubro y mencione Mercado Pago como próximo hito, sin afirmar plazos ni fechas concretas.

#### Escenario: Timeline de releases visible

- DADO que un visitante carga la landing
- CUANDO se renderiza la sección "Próximos pasos"
- ENTONCES se exhibe una lista ordenada de rubros a habilitar (Masajes primero, después Uñas, Barbería, y luego el resto)
- Y no se mencionan plazos, fechas ni versiones internas (P0/P1, 1.0.X)

#### Escenario: Mención de Mercado Pago con tono de marketing

- DADO que un visitante lee "Próximos pasos"
- CUANDO aparece la mención de Mercado Pago
- ENTONCES el copy usa tono aspiracional (ej.: "Próximamente: cobros automatizados con Mercado Pago")
- Y NO usa tono de disculpa ni afirma que vuelve "cuando haya clientes" ni plazos de retorno
- Y debe mencionar que mientras tanto se acepta transferencia directa
