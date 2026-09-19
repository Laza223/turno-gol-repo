---
paths:
  - "src/app/(admin)/caja/**"
  - "src/modules/cashflow/**"
  - "src/modules/canteen/**"
  - "src/modules/reports/**"
---

# Caja y cantina

- **Día operativo en caja/cantina/métricas**: criterio DISTINTO al de bookings — cutoff ÚNICO por tenant (`nightCutoffMins`), no por día de semana, usado por las lecturas (`getCashFlows`/`getDaySummary`). `src/modules/reports/` sigue en UTC calendario puro (fuera de alcance, documentado). Decisión original: `docs/decisions/2026-07-24-caja-cantina-dia-operativo.md`. **"Caja del día" (apertura/cierre/arqueo) se eliminó** — `daily_cash_opens`/`daily_cash_closes` quedan con datos históricos sin UI ni escritura desde código de aplicación, nunca reinterpretar esas filas. Ningún movimiento de plata se bloquea por "caja cerrada". Decisión: `docs/decisions/2026-09-11-eliminar-caja-del-dia.md`
- **Caja son 3 destinos colgados del `AdminHeaderSlot`, no 4 pestañas en el cuerpo**: `/caja` es **Vender** (catálogo como lista con buscador, ticket, los últimos 3 movimientos y una línea de aviso de fiados — nada agregado: ni totales ni lista de fiados; los fiados se cobran en Cuentas), `/caja/cuentas` es el libro del dueño (Deudas y Devolvés como dos listas que NUNCA se netean — Devolvés solo existe con filas —, y el diario del día con lo cobrado hoy) y `/caja/productos` es lo semanal (catálogo + informe desplegado al lado, ledger de stock plegado y paginado). Superficies planas sin card, a 1600 px. `/caja/deudas`, `/caja/devoluciones` y `/caja/cantina` son redirects de compat; sus componentes y Server Actions siguen viviendo en esas carpetas. Spec: `docs/spec/design-system/pages/caja.md` v3.0 · Decisiones: `docs/decisions/2026-09-12-rediseno-caja-tres-destinos.md`, `docs/decisions/2026-09-17-caja-densidad-y-espacio.md`
- **`DaySummary` trae DOS desgloses por método y el equivocado no rompe nada**: `byMethod` es neto (sus partes suman `balance`) y `collectedByMethod` excluye egresos (suman `collected`). Adentro de una card que dice "Cobrado hoy" va el segundo; el primero contesta "cuánto quedó", no "cuánto entró y por dónde".
- **Catálogo en tablas reales** — no volver a guardar productos en `tenants.settings` (el JSONB se eliminó, migr. 051). Cierres legacy con `expected_cash NULL`: **nunca reinterpretarlos**. Detalle: `docs/decisions/2026-07-22-caja-cantina-redesign.md`
