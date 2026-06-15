# Supabase seed (demo auth)

Este proyecto incluye un seed idempotente para la cuenta demo usada por `landing`:

- Email: `demo@turnea.app`
- Password: `demo1234`
- Rubros en metadata: `peluqueria`, `barberia`, `unas`, `pestanas`, `spa`, `tattoo`, `cejas`

## Archivo

- `supabase/seeds/20260420_demo_user_all_rubros.sql`

## Cómo aplicarlo

En una DB Supabase local o remota con permisos sobre `auth.*`, ejecutar el SQL.

Ejemplo con CLI local:

```bash
supabase db query < supabase/seeds/20260420_demo_user_all_rubros.sql
```

Si no querés fijar contraseña por SQL, podés crear el usuario manualmente en el panel Auth con el mismo email y luego volver a ejecutar el seed para sincronizar metadata de rubros.
