# Orvel Ops (Prospecta)

Internal Vue 3 backoffice for salon prospecting. Hexagonal layout lives in this app; it is not extracted to `packages/` yet.

```text
src/domain          pure TS
src/application     use cases + ports
src/infrastructure  localStorage + wa.me
src/ui              Vue
```

```bash
pnpm --dir apps/ops test
pnpm --dir apps/ops dev
```

Persistence key: `orvel-ops.v1` in `localStorage`.
