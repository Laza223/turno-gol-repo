# Fase D1 — Schema físico e índices (wave 2 datos) — Report

**Fecha:** 2026-07-23 | **Rama:** `audit/data-d1` | **Estado:** ✅ gate verde local; aplicación a prod pendiente de decisión del dueño

## Método

Estado físico derivado del catálogo (`pg_constraint`/`pg_index`/`pg_indexes`) sobre DB local reseteada a migr. 052 + mapa de patrones de acceso reales (WHERE/ORDER BY/JOIN con archivo:línea) levantado por reconocimiento del código (`src/modules/**`, workers, app queries). Regla: ningún índice nuevo sin lector identificado; ningún drop sin reemplazo idéntico o superset.

## Fix aplicado — migración `053_index_hygiene.sql` (124 → 109 índices)

### Drops (21)
- **8 duplicados exactos**: pares `idx_*` manual vs índice de UNIQUE constraint (`tenants.slug`, `players.email`, `staff_users.email`, `system_admins.email`, `processed_webhooks.mp_event_id`, `tenant_subscriptions.tenant_id`, `daily_cash_opens(tenant_id,date)`, `daily_cash_closes(tenant_id,date)` — este último con matiz `date DESC`: con igualdad en tenant_id el UNIQUE se lee backward y sirve el mismo ORDER BY). Confirmados por advisor `duplicate_index`.
- **13 prefijos estrictos**: índice btree no-parcial cuyas columnas son prefijo exacto de otro índice de la misma tabla (detección por `pg_index.indkey`; gotcha: int2vector es 0-based, comparar vía `unnest WITH ORDINALITY`). El más pesado: `bookings` pagaba 11 índices, entre ellos `idx_bookings_tenant` (⊂ 3 compuestos) e `idx_bookings_tenant_date` (⊂ `idx_bookings_date_status`).

### Creates (6, cada uno con lector citado)
| Índice | Lector (evidencia) |
|---|---|
| `idx_cash_flows_booking` parcial `WHERE booking_id IS NOT NULL` | `deudas/queries.ts:32-80` (getDebts), `reservas/queries.ts:215-221` (getBookingCharges) — FK sin índice |
| `idx_bookings_pending_created` parcial `WHERE status='pending_payment'` | Sweep de expiry cron (`booking.expiry.ts:295-302`) + reconcile pasada 1 (`reconcile-pending-payments.worker.ts:41-56`) — **cross-tenant vía worker BYPASSRLS: los compuestos que arrancan en tenant_id NO sirven** |
| `idx_bookings_confirmed_ends` parcial `WHERE status='confirmed'` | Auto-complete cron (`booking.service.ts:593-599`) — misma clase cross-tenant |
| `idx_reviews_tenant_rating` | Ranking `/explorar` (`search.service.ts:140-148`): AVG/COUNT GROUP BY tenant_id escaneaba TODA la tabla reviews en cada búsqueda pública → ahora Index Only Scan (verificado) |
| `idx_cash_flows_tenant_day_art` (expression) | Clase "día ART": `/caja` resumen+movimientos+cierre (`cashflow.service.ts:245/155`, `daily-close.service.ts:32`) filtran `(occurred_at AT TIME ZONE 'America/…')::date` — no sargable para `(tenant_id, occurred_at)` crudo |
| `idx_stock_movements_tenant_day_art` (expression) | Reporte de cantina (`canteen-report.service.ts:48-63`), misma clase |

**Evidencia de matching (EXPLAIN, `enable_seqscan=off` por tablas vacías — D3 re-mide con volumen):**
```
Index Scan using idx_bookings_pending_created  Index Cond: (created_at < now()-'00:10:00')
Index Scan using idx_cash_flows_booking        Index Cond: (booking_id = '...')
Index Only Scan using idx_reviews_tenant_rating
Index Scan using idx_cash_flows_tenant_day_art
  Index Cond: (tenant_id='...' AND ((occurred_at AT TIME ZONE 'America/...'))::date = '2026-07-23')
```
(`idx_bookings_confirmed_ends`: matchea por construcción — predicado y clave calzan con la query del cron; en tabla vacía el planner empató con el GiST de exclusión. Re-verificar en D3.)

## FKs SIN índice — justificados (quedan así a propósito)

| FK | Justificación |
|---|---|
| 9× `*_by` → `staff_users` (bookings.created_by_staff, cash_flows.registered_by, canteen_tabs created/settled/canceled_by, stock_movements.created_by, daily_cash_opens.opened_by, daily_cash_closes.closed_by, tenant_staff_members.added_by, tenant_player_bans.banned_by) | Sin lector en todo el código; `staff_users` nunca se borra (retention worker soft-anonimiza, verificado: 0 `DELETE FROM staff_users`) → índice = costo de escritura puro en tablas calientes |
| `bookings.payment_id` | El join real va al revés (`payments.booking_id`, que SÍ tiene índice parcial) |
| `stock_movements.product_id` | Toda query va con tenant → cubierta por `idx_stock_movements_product(tenant_id, product_id)`; products solo soft-delete |
| `canteen_tabs.settled_cash_flow_id` | Sin lector inverso |
| `tenant_subscriptions.plan_id`/`pending_plan_change` | Tabla de 1 fila por tenant; plans nunca se borra |
| `push_subscriptions.staff_user_id` | Query real usa `idx_push_subscriptions_tenant_staff(tenant_id, staff_user_id)`; CASCADE solo dispararía al borrar staff (no pasa) |
| `feature_flags.tenant_id` | Tabla enana (flags); seq scan gratis |
| `bookings.court_id` | Cobertura parcial por el GiST de exclusión + toda query real va por `(tenant_id, court_id, date)`; courts solo soft-offline |

## Otros ítems D1

- **JSONB solo vía Zod**: ✅ — los 4 write-sites de `tenants.settings` (`settings/reservas/actions.ts:70`, `dashboard/actions.ts:35/66/95`) validan con Zod y usan el patrón `settings || ${patch}::jsonb` con el gotcha del double-stringify documentado en el propio código. Vestigial `no_show_penalty`: ya limpiado por migr. 034 (falsa alarma).
- **Tipos**: tablas 048/049 verificadas en D8 (centavos integer + CHECKs, timestamptz, enums una L). ✅
- **Barrido de columnas muertas**: muestreado (no exhaustivo — barridos recientes 044/046/051 ya pasaron). Hallazgo nuevo abajo (H2).

## Hallazgos para otras fases / REQUIERE INPUT

- **H1 🟡 (→ D3): divergencia de estilo de filtro temporal en cash_flows** — 3 callers usan la expresión `AT TIME ZONE ...::date =` (caja, cierre, cantina) y 2 usan rango UTC sargable (`metrics.service.ts`, `report.service.ts`). La 053 indexa la expresión; la unificación de estilo (ideal: todos a rango sargable) es rediseño de queries → D3.
- **H2 REQUIERE INPUT: `getDayComparisons` (`cashflow.service.ts:193-238`) no tiene ningún caller** en `src/app/**` ni en otros services — solo lo invoca un test de integración. ¿Feature pendiente de UI o dead code para borrar? No se indexó ni se borró (decisión de producto).
- **H3 🟡 (→ D3): queries sin LIMIT sobre tablas sin techo** — lista completa con archivo:línea en el mapa de reconocimiento; las 3 más relevantes: `getDebts` (deudas históricas), `getCashFlowsForExport` (rango arbitrario), ranking de `/explorar` (mitigado por índice; el fix real es cachear/materializar el agregado de ratings).
- **H4 🟢 (→ D5/D7)**: prod con tablas chicas toleró `CREATE INDEX` directo; con volumen real, índices nuevos van `CONCURRENTLY` (convención a formalizar en D7).

## Verificación (gate)

| Check | Resultado |
|---|---|
| `pnpm test:isolation` (BLOQUEANTE) | ✅ 123/123 |
| `pnpm test:integration` | ✅ 95 archivos / 677/677 |
| `pnpm typecheck` | ✅ limpio |
| `pnpm lint` | ✅ 0 errors (34 warnings pre-existentes) |
| Conteo índices | 124 → 103 (drops) → 109 (creates), verificado en `pg_indexes` |
| Matching de índices nuevos | 4/4 por EXPLAIN forzado + 1 por construcción (ver arriba) |
