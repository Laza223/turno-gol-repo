# Rediseño "Caja y Cantina" — stock real, fiados, apertura de caja y gastos categorizados

**Fecha:** 2026-07-22
**Estado:** Decidida (dueño: Lazar) — implementada en `feat/caja-cantina-redesign`
**Migraciones:** `048_canteen_tables.sql`, `049_daily_cash_opens.sql`, `050_cashflow_expense_categories.sql`, `051_drop_canteen_jsonb.sql`
**Spec:** `docs/superpowers/specs/2026-07-22-caja-cantina-redesign-design.md`

## Problema

La vista `/caja` era funcional pero demasiado simple para lo que un complejo de
fútbol argentino maneja fuera de las reservas: gastos con una sola categoría
genérica, stock que solo descontaba al vender (sin reposición, mermas ni mínimo
por producto), sin fiado ("anotáselo al capitán" — la fuga de plata más típica
del rubro), sin fondo inicial de caja (el arqueo nunca podía dar exacto) y sin
posibilidad de ranking de ventas (`cash_flows` no referenciaba al producto).

## Decisión

Rediseño completo en 8 fases sobre una sola rama, manteniendo la regla de oro:
venta de 1 ítem en 2 taps, usable por una persona de 60 años, sin volverse ERP.

1. **"Caja y Cantina"** — un ítem de sidebar, tabs por sub-ruta: `/caja` (caja
   del día), `/caja/cantina` (venta por ticket + fiados), `/caja/productos`
   (catálogo, stock, reporte).
2. **Cantina sobre tablas reales** (migr. 048): `canteen_products` (precio,
   costo opcional, stock opcional, mínimo por producto, soft delete),
   `stock_movements` (ledger append-only: TODA venta escribe líneas; REVOKE
   UPDATE/DELETE — correcciones = `adjustment` compensatorio) y `canteen_tabs`
   (fiados). El JSONB `tenants.settings.canteen_products` se backfilleó en 048
   y se borra en 051. Revive el concepto de la tabla `products` (dropeada en
   046 por dead code) pero con otro shape y con feature real atrás.
3. **Ticket multi-ítem**: 1 `cash_flows` por ticket + N líneas en el ledger.
   Sin tabla de ventas: reconstruir un ticket = GROUP BY `cash_flow_id`/`tab_id`.
4. **Fiados (versión mínima)**: nombre libre, el stock sale al ENTREGAR
   (líneas con `tab_id`, sin cash_flow), la plata entra al COBRAR
   (`settleTab` → cash_flow con `occurred_at = ahora`). Asimetría deliberada:
   el ranking cuenta por entrega, la caja por cobro. Crear fiado permitido con
   caja cerrada; vender/cobrar no.
5. **Apertura de caja** (migr. 049): fondo inicial por día (UPSERT editable
   mientras el día está abierto, auditado), cierre snapshotea
   `opening_cash`/`expected_cash` y la diferencia pasa a ser
   `contado − esperado` (esperado = fondo + neto cash). Cierres legacy quedan
   con `expected_cash NULL` y la UI nunca los reinterpreta.
6. **Gastos categorizados** (migr. 050): `merchandise`, `salaries`,
   `utilities`, `maintenance`, `other_expense`. `operating_expense` queda como
   legacy válido (filas históricas) pero la UI no lo ofrece más. La reposición
   puede "pagarse de la caja" (gasto `merchandise` en la misma transacción,
   atómico con la entrada de stock).
7. **Reporte de cantina**: ranking desde el ledger (por día de entrega,
   incluye fiados sin cobrar) + plata por método/día desde `cash_flows` (solo
   cobrado), con la asimetría explicada en la UI.

## Fuera de scope (evaluado y descartado con el dueño)

Recetas/BOM, combos con desglose, activos operativos/préstamo con caución,
historial de precios de costo, arqueo físico de stock teórico-vs-contado (v1.5
— el ledger deja la base sin tocar schema).

## Consecuencias

- Toda tabla tenant-aislada nueva entró al checklist: RLS ENABLE+FORCE,
  filtro explícito por tenant_id, DELETE manual en data-retention, caso en
  `isolation.test.ts`.
- La concurrencia de stock pasa del lock grueso sobre `tenants` (JSONB) a
  `FOR UPDATE` por fila de producto, siempre `ORDER BY id` (anti-deadlock),
  con `lockProducts` compartido entre venta y fiado.
- Idempotencia por flujo: ticket → key en `cash_flows` (dup-check ANTES de
  validar stock + re-check bajo lock); fiados y movimientos sin cash_flow →
  keys propias con índice único parcial.
- `createCashFlow` no cambió de firma: señas MP, cobros de reservas y deudas
  no se enteraron del rediseño.
