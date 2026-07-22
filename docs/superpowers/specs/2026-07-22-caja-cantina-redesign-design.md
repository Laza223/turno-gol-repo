# Rediseño "Caja y Cantina" — Design Doc

**Fecha:** 2026-07-22
**Estado:** Aprobado por el dueño (sesión de brainstorming con decisiones explícitas)
**Rama:** `feat/caja-cantina-redesign`

## Problema

La vista `/caja` es funcional pero demasiado simple para lo que un complejo de fútbol argentino maneja fuera de las reservas:

- Una sola columna sin estructura: venta rápida, movimientos y cierre mezclados.
- Gastos con UNA categoría genérica (`operating_expense`) — se "intuye" que el sistema maneja egresos pero está mal organizado.
- Stock que solo descuenta al vender: sin reposición, sin mermas, sin mínimo por producto (umbral hardcodeado 3), sin costo/margen.
- Sin fiado ("anotáselo al capitán") — la fuga de plata más típica del rubro.
- Sin fondo inicial de caja: el arqueo de efectivo nunca puede dar exacto.
- `cash_flows` no referencia al producto vendido → ranking de ventas imposible.

Objetivo: módulo profesional, organizado y entendible — usable por una persona de 60 años — sin perder la venta en 2 taps y sin volverse un ERP.

## Decisiones de producto (cerradas con el dueño, no re-litigar)

1. **Nombre**: ítem de sidebar "Caja y Cantina". La ruta `/caja` se mantiene (deep links).
2. **Estructura**: un ítem con tabs por sub-rutas (patrón `SettingsTabs`):
   - `/caja` — "Caja del día": movimientos, gastos, apertura/cierre.
   - `/caja/cantina` — "Cantina": venta por ticket + fiados.
   - `/caja/productos` — "Productos y stock": catálogo, reposición, mermas, reporte.
3. **Venta = ticket multi-ítem**: tap suma producto, un solo "Cobrar". Venta de 1 ítem sigue siendo 2 taps.
4. **Fiado versión mínima**: nombre libre (no exige jugador registrado), stock descuenta al entregar, cash_flow recién al saldar. Lista de fiados abiertos visible.
5. **Apertura de caja simple**: fondo inicial en efectivo por día. Cierre: `esperado = fondo + neto cash del día` vs contado → diferencia real.
6. **Stock simple pero serio**: reposición con multiplicador de bulto (packs × unidades), `min_stock` por producto con alerta, costo actual opcional (margen visible), SIN historial de costos.
7. **Salidas no comerciales**: merma / rotura / cortesía / consumo interno con motivo. Mueven stock, NO tocan caja.
8. **Gastos categorizados**: `merchandise`, `salaries`, `utilities`, `maintenance`, `other_expense`.
9. **Reporte de cantina**: ranking de vendidos + totales por día/método, en la tab Productos y stock.
10. **FUERA de scope (evaluado y descartado con el dueño)**: recetas/BOM, combos con desglose, activos operativos/préstamo con caución, historial de precios de costo, arqueo físico de stock teórico-vs-contado (v1.5 — el ledger deja la base sin tocar schema).

## Modelo de datos

### JSONB → tablas reales

`tenants.settings.canteen_products` no alcanza: el ledger necesita FK a producto, el fiado necesita líneas con snapshot de precio, el ranking necesita agregación SQL. Además el `SELECT settings FOR UPDATE` sobre `tenants` serializa TODAS las ventas del tenant; con tablas reales el lock baja a fila de producto.

Nota histórica: la tabla `products` se dropeó en migr. 046 por dead code (la cantina siempre vivió en JSONB). Se revive distinto — como `canteen_products` con feature real atrás. No contradice la decisión del 2026-07-17: aquella tabla nunca tuvo escritores.

### Tablas nuevas (migr. 048)

- **`canteen_products`**: `name`, `price` (centavos), `cost?` (centavos, margen — sin historial), `stock?` (NULL = sin control), `min_stock?` (NULL = sin alerta), `is_active` (soft delete; nunca DELETE — el ledger la referencia), `sort_order`. CHECKs de no-negatividad.
- **`canteen_tabs`** (fiados): `debtor_name` texto libre, `status` enum `open|paid|canceled`, `total_amount` snapshot, `note?`, `settled_at/by/cash_flow_id`, `canceled_at/by/reason`, `client_idempotency_key` (único parcial — crear fiado no genera cash_flow, necesita idempotencia propia). CHECK: `paid` exige `settled_at` + `settled_cash_flow_id`.
- **`stock_movements`** (ledger append-only): `product_id`, `kind` enum `purchase|sale|waste|courtesy|internal_use|adjustment`, `qty` con signo (CHECK por kind: purchase > 0; sale/waste/courtesy/internal_use < 0; adjustment ≠ 0), `unit_cost?`, `unit_price` (snapshot, obligatorio en sale), `note` (motivo, obligatorio en salidas no comerciales — a nivel service), agrupadores `cash_flow_id` (ticket cobrado) / `tab_id` (fiado), `client_idempotency_key` único parcial. CHECK: sale exige `unit_price` y (`cash_flow_id` O `tab_id`).

**Regla clave**: TODA venta escribe líneas en `stock_movements`, incluso de productos sin control de stock — el ledger es auditoría Y fuente del ranking. Solo el UPDATE de la columna denormalizada `stock` se saltea cuando es NULL.

RLS: ENABLE + FORCE, policies por `app.current_tenant_id` (patrón migr. 006/036). `stock_movements`: solo SELECT/INSERT + `REVOKE UPDATE, DELETE` (correcciones = movimiento `adjustment` compensatorio, patrón audit_logs). `REVOKE DELETE` en `canteen_products` y `canteen_tabs`.

Checklist tabla tenant-aislada: DELETE manual en `data-retention-cleanup.worker.ts` + caso en `isolation.test.ts` (BLOQUEANTE) para las 3 tablas.

Backfill idempotente JSONB → filas en la misma migración (`jsonb_array_elements ... WITH ORDINALITY`); la key JSONB queda muerta una release y se borra en migr. 051.

### Apertura de caja (migr. 049)

- Tabla **`daily_cash_opens`**: `date`, `opening_cash`, `note?`, `opened_by/at`, `updated_at`, UNIQUE(tenant, date). Editable mientras el día está abierto (typo del fondo — usuario de 60 años); el guard corre bajo el advisory lock `daily_close:${tenantId}` existente y rechaza si ya hay cierre.
- `daily_cash_closes` suma columnas **nullable** `opening_cash` / `expected_cash` (snapshot al cerrar; el close es inmutable por REVOKE migr. 008). `NULL` = cierre legacy → la UI muestra el formato viejo. Nueva semántica solo para closes nuevos: `diff_amount = declared_cash − expected_cash`.
- Abrir caja NO es obligatorio: sin apertura, `opening_cash = 0` con copy "sin fondo inicial declarado".

### Sin tablas de venta/ticket

Ticket cobrado = 1 fila `cash_flows` (income/`product_sale`, amount = total, description "Cantina: Agua x2, …") + N `stock_movements` con `cash_flow_id`. Fiado = 1 `canteen_tabs` + N líneas con `tab_id`; al saldar se crea el cash_flow y se linkea. Reconstruir un ticket = GROUP BY agrupador. `cash_flows` sigue siendo la ÚNICA fuente de dinero: cierre, analíticas, dashboard y flujos de reservas/señas/deudas no se enteran.

**Asimetría deliberada fiado**: el stock sale el día de la ENTREGA (líneas del ledger); la plata entra el día del COBRO (`occurred_at = ahora` del settle). El ranking cuenta por entrega; la caja por cobro.

### Gastos (migr. 050)

`ALTER TYPE cashflow_category ADD VALUE` × 5 + recrear `chk_cashflow_type_category` comparando `::text` (workaround 55P04, precedente migr. 025). `operating_expense` QUEDA en el CHECK (valida filas viejas y sigue mostrándose "Gasto operativo"); la UI nueva solo ofrece las 5 categorías nuevas.

## Arquitectura de código

- **Módulo nuevo `src/modules/canteen/`**: `canteen.service.ts` (catálogo), `canteen-sale.service.ts` (`sellTicket`: dup-check idempotencia PRIMERO → `FOR UPDATE` de productos ORDER BY product_id → precios recalculados desde DB → `createCashFlow` existente → líneas + descuento stock, una sola tx), `canteen-tab.service.ts` (create/settle/cancel), `stock.service.ts` (purchase con packs×unidades y toggle gasto de caja, exits con motivo, adjust, ledger, ranking), + types/schema/errors.
- **`src/modules/cashflow/`**: nuevo `cash-open.service.ts`; `closeDailyRegister` extendido (snapshot opening/expected). **`createCashFlow` no cambia de firma.**
- **Actions**: `caja/actions.ts` (movimiento genérico con categorías nuevas, open, close), `caja/cantina/actions.ts` (ticket + fiados, `requireOperatorStaff`), `caja/productos/actions.ts` (CRUD producto `requireAdminStaffAction`; reposición/salidas/ajuste `requireOperatorStaff`).
- **Roles**: manager opera todo el día a día (vender, fiar, reponer, mermar, abrir/cerrar caja); solo admin toca el catálogo (alta/edición/desactivación, precios, costos). Ocultamiento en UI Y guard server-side.
- **UI**: `caja/layout.tsx` + `CajaTabs` (clon de `SettingsTabs`, badge de stock bajo en tab Productos). Tab Cantina: `TicketPanel` + `FiadosList`. Tab Productos: `ProductsTable`, `ProductFormDialog`, `StockEntryDialog`, `StockExitDialog`, `CanteenReport`, `StockLedgerList`. Tab Caja: `OpenDayCard` + `CierreCard` v2 (branch legacy por `expected_cash IS NULL`).
- **Cambio de comportamiento**: la venta de cantina es siempre "ahora" (muere la venta retro-fechada vía `?date=`); una venta vieja se registra como movimiento genérico. Caja de hoy cerrada: vender y saldar deshabilitados con banner; crear fiado permitido (no toca caja).
- **Deep links**: dashboard "Cantina hoy" → `/caja/cantina`; `DashboardCanteenButton` → `/caja/productos`; redirect server-side de `?configureCanteen=true`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Deadlock entre tickets multi-ítem con productos cruzados | Lock SIEMPRE `ORDER BY product_id` + test de integración dedicado |
| Doble-tap / reintentos | Idempotency key por flujo: ticket → cash_flows (dup-check ANTES de validar stock); fiado y movimientos sin cash_flow → keys propias; settle → transición `WHERE status='open'` |
| Ventana de deploy migr. 048 (código viejo vende contra JSONB) | Segundos/minutos; desvío corregible con `adjustment`; deploy en valle |
| Reinterpretar cierres legacy con fórmula nueva | Columnas nullable + branch explícito; jamás recalcular filas viejas |
| Romper flujos de dinero existentes (seña MP, cobros, deudas) | `createCashFlow` intacto; `payment-service-deposit-cashflow` y `caja-booking-id-rejected` deben quedar verdes SIN cambios |

## Plan de fases

8 fases commiteables (tabs → tablas+catálogo → ticket → fiados → apertura → gastos → reporte → cleanup), cada una con typecheck + lint + tests verdes antes de commit. Detalle operativo en el plan de sesión (`~/.claude/plans/hola-buenas-como-va-nested-beaver.md`).
