# Single theme cleanup

## Propósito

Elimina los tokens de tema por-rubro del schema y runtime para que Orvel tenga un único tema (`zen`) compartido por todos los negocios, alineado con la decisión arquitectónica de tema único. Esta spec remueve la columna `business_types.theme_key`, elimina el lookup map `THEME_BY_BUSINESS_TYPE` y conserva únicamente la palette `zen` en el dashboard.

## Requisitos

### Requisito: Eliminación de la columna theme_key

La columna `theme_key` en `business_types` DEBE ser removida del schema. La migración DEBE ejecutarse sin error sobre las filas existentes (8 business_types) sin perder datos de los demás campos. Si existen vistas o constraints dependientes, DEBEN recrearse o ajustarse antes del drop.

#### Escenario: Migración corre sobre filas existentes

- DADO que la tabla `business_types` contiene 8 filas con valores en `theme_key` (no necesariamente válidos)
- CUANDO se ejecuta la migración que dropea la columna `theme_key`
- ENTONCES la migración completa sin error
- Y las 8 filas siguen presentes con sus demás columnas intactas

#### Escenario: Vistas dependientes se recrean correctamente

- DADO que existe una vista SQL que referencia `business_types.theme_key`
- CUANDO se ejecuta la migración que dropea la columna
- ENTONCES la vista se recrea o ajusta antes del drop
- Y la vista sigue funcionando post-migración

### Requisito: Resolver de tema hardcodeado

`apps/dashboard/src/app/core/theming/dashboard-business-rules.ts` DEBE retornar `'zen'` como tema sin realizar lookup sobre `business_type` o `theme_key`. El mapa `THEME_BY_BUSINESS_TYPE` DEBE ser removido del archivo.

#### Escenario: Dashboard carga con tema zen independientemente del rubro

- DADO que un negocio tiene `business_type = 'peluqueria'` (o cualquier otro rubro)
- CUANDO el dashboard se carga
- ENTONCES el resolver retorna `'zen'` directamente sin map lookup
- Y los tokens aplicados al render son los de la palette `zen`

#### Escenario: Mapa THEME_BY_BUSINESS_TYPE eliminado

- DADO que el archivo `dashboard-business-rules.ts` ya está actualizado
- CUANDO se inspecciona su contenido
- ENTONCES no existe ninguna referencia al identificador `THEME_BY_BUSINESS_TYPE`
- Y no existe ninguna lookup table ni mapping por business_type

### Requisito: Palette zen única

El archivo `dashboard-theme-palettes.tokens.ts` DEBE contener únicamente la palette `zen` exportada. Cualquier alias, palette duplicada o palette alternativa DEBE ser removido. Las únicas claves exportadas son las correspondientes a `zen`.

#### Escenario: Solo la palette zen queda en tokens

- DADO que el archivo `dashboard-theme-palettes.tokens.ts` está actualizado
- CUANDO se listan las claves exportadas
- ENTONCES la única clave presente corresponde a la palette `zen`
- Y no existen palettes alias o duplicadas en el archivo

#### Escenario: Búsqueda global no encuentra referencias activas a theme_key

- DADO que el cambio está aplicado en todo el repositorio
- CUANDO se ejecuta `grep -r theme_key apps/ supabase/` (excluyendo archivos de migración historiales)
- ENTONCES no se encuentran referencias activas en código fuente vivo
- Y solo aparecen referencias en migraciones SQL ya aplicadas o documentación histórica
