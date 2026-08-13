# Roadmap cleanup

## Propósito

Crea el archivo `openspec/changes/release-1-0-1/roadmap.md` como source of truth único del roadmap de releases de Orvel, cerrando la inconsistencia de `tasks.md:5` que actualmente referencia un archivo inexistente. El documento refleja el estado actual: 1.0.1 cerrado, 1.0.2 cleanup (este release), 1.0.3 multi-profesional, 1.0.4+ por definir. Documenta también el abandono del modelo per-rubro en favor de releases transversales por capacidad.

## Requisitos

### Requisito: Archivo roadmap.md existe en path esperado

El archivo `openspec/changes/release-1-0-1/roadmap.md` DEBE existir en el repositorio con el contenido del roadmap consolidado de Orvel. La referencia en `tasks.md:5` DEBE quedar resuelta (sin enlace roto).

#### Escenario: Archivo existe en disco

- DADO que el archivo `openspec/changes/release-1-0-1/roadmap.md` está creado
- CUANDO se inspecciona el sistema de archivos del repositorio
- ENTONCES el archivo existe y es legible
- Y su tamaño es mayor que cero

#### Escenario: Referencia de tasks.md:5 resuelve al archivo

- DADO que `tasks.md:5` contiene una referencia al roadmap
- CUANDO se sigue esa referencia desde la raíz del repositorio
- ENTONCES la ruta `openspec/changes/release-1-0-1/roadmap.md` resuelve correctamente
- Y no hay enlace roto

### Requisito: Tabla de releases con estado actual

El archivo DEBE contener una tabla o lista que cubra explícitamente las siguientes releases: 1.0.1 con status cerrado (delivered/merged), 1.0.2 con status en curso (este release, cleanup), 1.0.3 con status planeado (multi-profesional), 1.0.4+ con status TBD (por definir post-1.0.3).

#### Escenario: Tabla incluye las cuatro releases

- DADO que `roadmap.md` está creado
- CUANDO se inspecciona su contenido
- ENTONCES existe una sección que lista explícitamente 1.0.1, 1.0.2, 1.0.3 y 1.0.4+
- Y cada release tiene su status: 1.0.1 closed, 1.0.2 cleanup, 1.0.3 multi-prof, 1.0.4+ TBD

#### Escenario: 1.0.2 marcado como este release

- DADO que `roadmap.md` está creado
- CUANDO se inspecciona la entrada de 1.0.2
- ENTONCES el contenido describe el release como "limpieza de deuda arquitectónica" o equivalente
- Y se referencia explícitamente que corresponde a este PR/release (release-1-0-2-cleanup)

### Requisito: Documentación del abandono del modelo per-rubro

El archivo DEBE contener una sección que explique que el modelo per-rubro (releases independientes por vertical como Uñas, Masajes, etc.) fue abandonado en favor de releases transversales por capacidad. La diferenciación por rubro se logra vía `business_settings` JSON (ADR-014), no vía branches de release.

#### Escenario: Sección explica el abandono del modelo per-rubro

- DADO que `roadmap.md` está creado
- CUANDO se inspecciona su contenido
- ENTONCES existe una sección que describe el cambio de estrategia de per-rubro a transversal
- Y se referencia la decisión arquitectónica (ADR-014 o equivalente) que justifica la diferenciación por config

#### Escenario: Tabla comparativa antes/después presente

- DADO que `roadmap.md` está creado
- CUANDO se inspecciona su contenido
- ENTONCES existe una tabla o lista que muestra cómo era el roadmap antes (per-rubro) y cómo es ahora (transversal)
- Y la transformación queda explícita: 1.0.2 dejó de ser "Uñas independiente" para ser "Limpieza arquitectónica"

### Requisito: Cero cambios de código

La spec E NO DEBE requerir cambios en código de producto. La única entrega es el archivo markdown `roadmap.md` y la verificación de que la referencia rota en `tasks.md:5` queda resuelta. Si la referencia estaba en otro formato (link, markdown), DEBE actualizarse al path real del nuevo archivo.

#### Escenario: Único diff es el archivo markdown nuevo

- DADO que el release 1.0.2 cleanup se aplica completo
- CUANDO se inspecciona el diff acumulado de este release en lo que toca la spec E
- ENTONCES los únicos cambios son la creación de `roadmap.md` y, si aplica, la actualización de la referencia en `tasks.md`
- Y no hay cambios en código de runtime, migraciones, RPCs o componentes
