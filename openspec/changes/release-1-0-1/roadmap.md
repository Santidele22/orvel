# Orvel Release Roadmap

> Última actualización: 2026-07-24

## Releases

| Release | Estado | Descripción |
|---------|--------|-------------|
| **1.0.1** | ✅ Cerrado | Landing + emails: landing público, signup flow, email outbox, dashboard notifications, customer cancellation/reschedule |
| **1.0.2** | 🔄 En curso | Limpieza de deuda arquitectónica: tema único, shared email templates, booking config knobs, roadmap cleanup |
| **1.0.3** | 📋 Planeado | Multi-profesional: profesionales por negocio, asignación a turnos, auto-assign, agenda por profesional |
| **1.0.4+** | ❓ Por definir | Post-1.0.3: funcionalidades a definir según feedback de clientes y métricas de uso |

## Cambio de estrategia

A partir de 1.0.2, se abandona el modelo de releases por rubro/vertical (releases independientes para Uñas, Masajes, Peluquería, etc.) en favor de **releases transversales por capacidad**.

### Antes (per-rubro)

Cada release apuntaba a un rubro específico, con features pensadas para esa vertical. Esto generaba:
- Releases dependientes del roadmap comercial, no técnico
- Duplicación de funcionalidad entre releases de distintos rubros
- Diferimiento de deuda arquitectónica

### Ahora (cleanup → features)

Los releases entregan capacidades que aplican a **todos los rubros** simultáneamente:
- La diferenciación por rubro se logra vía configuración en `business_settings` (ADR-014)
- No hay branches de release por rubro
- La deuda arquitectónica se paga antes de agregar features complejas

| Release | Antes (per-rubro) | Ahora (cleanup → features) |
|---------|-------------------|---------------------------|
| 1.0.1 | Landing + emails | (ya entregado) |
| **1.0.2** | Uñas independiente | **Limpieza de deuda arquitectónica** |
| 1.0.3 | Masajes independiente | Multi-profesional |
| 1.0.4+ | Per-rubro | Por definir post-1.0.3 |

## Referencias

- [ADR-014: Diferenciación por config, no por código](../../docs/adr/adr-014.md)
- [Propuesta 1.0.2](../release-1-0-2-cleanup/proposal.md)
- [Tasks 1.0.2](../release-1-0-2-cleanup/tasks.md)
