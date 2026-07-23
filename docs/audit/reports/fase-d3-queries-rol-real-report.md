# Fase D3 — Queries reales bajo rol real (wave 2 datos) — Report

**Fecha:** 2026-07-23 | **Rama:** `audit/data-d3` | **Estado:** gate verde local

## Método

T0: seed sintético reproducible (`scripts/audit/seed-d3-volume.sql`, setseed fijo, idempotente, compartido con D6): 1 tenant "d3-heavy" con ~1 año de operación (15.695 bookings, 22.431 cash_flows, 11.714 stock_movements, 25.000 audit_logs, 8.000 notifications) + 200 tenants de fondo con geo AMBA (709 courts, 659 reviews) para las superficies cross-tenant. Sobre ese volumen, EXPLAIN (ANALYZE, BUFFERS) de 13 hot paths (`scripts/audit/explain-d3-hotpaths.sql`) **bajo el rol de ejecución real**: `SET LOCAL ROLE turnogol_app` + `set_config` de contexto para staff/público/jugador, `turnogol_worker` (BYPASSRLS) para crons — nunca superusuario. En paralelo, 3 recon de código (N+1/over-fetch, paginación H3 + estilo temporal H1, matriz de invalidación de caché).

## 🔴 D3-H1 (cazado y FIXEADO): los índices de expresión ART de la 053 eran inusables bajo RLS

**Evidencia.** Bajo `turnogol_app` + RLS, toda la clase "día ART" (caja del día, cierre, resumen dashboard, reportes cantina) hacía **Seq Scan de la tabla completa** pese a `idx_cash_flows_tenant_day_art`/`idx_stock_movements_tenant_day_art` (053):

```
-- getDaySummary bajo turnogol_app (ANTES): Seq Scan, 22.364 filas descartadas
Seq Scan on cash_flows (actual time=3.498..6.970 rows=69) Buffers: shared hit=388
  Filter: tenant_id=… AND ((occurred_at AT TIME ZONE 'America/…')::date = CURRENT_DATE-1)
Execution Time: 7.041 ms

-- misma query como superusuario: Index Cond COMPLETO sobre idx_cash_flows_tenant_day_art
-- misma query bajo turnogol_app con enable_seqscan=off: el índice de expresión NI APARECE
```

**Causa raíz.** `timezone(text, timestamptz)` no es `LEAKPROOF` (`pg_proc.proleakproof = f`). Postgres se niega a evaluar quals no-leakproof debajo de la barrera de seguridad de las policies RLS → la expresión jamás baja como Index Cond. Los operadores de comparación sobre la columna cruda (`timestamptz_ge/lt`) sí son leakproof. D1 verificó el matching **como superusuario y con `enable_seqscan=off` sobre tablas vacías** — RLS bypasseada, la trampa "local enmascara" (PR #30) ahora a nivel planner.

**Fix aplicado (esta fase).**
- Helper `artDayRangeUtc(from, to?)` en `src/shared/time/art-date.ts`: día operativo ART como rango UTC `[date 03:00Z, date+1 03:00Z)` (mismo corrimiento fijo −3 que metrics.service; sin DST).
- 8 call sites migrados de expresión a rango sargable (solo el WHERE; el GROUP BY que etiqueta el día conserva la expresión, post-filtro): `cashflow.service.ts` (getCashFlows, getDayComparisons, getDaySummary), `daily-close.service.ts` (aggregateTotals), `canteen-report.service.ts` (getSalesRanking, getCanteenTotalsByMethod, getCanteenDailyTotals), `dashboard/queries.ts` (agregado cantina).
- Migración `054_drop_art_expression_indexes.sql` (+ espejo timestamped): DROP de los 2 índices de expresión — quedaban como costo de escritura puro.
- Test regresión `tests/unit/art-day-range-utc.test.ts` (bordes de día ART + venta de madrugada).

**Resultado medido (mismo rol, mismo volumen):**

| Query | Antes | Después |
|---|---|---|
| getDaySummary | Seq Scan, 7,0 ms, 393 buffers | Index Scan `idx_cash_flows_tenant_date`, 0,25 ms, 38 buffers |
| getCashFlows (día) | Seq Scan + Sort, 7,7 ms, 391 buffers | Index Scan Backward (Sort gratis), 0,13 ms, 40 buffers |
| getSalesRanking (7d) | Seq Scan stock_movements | Bitmap `idx_stock_movements_tenant_day`, 0,6 ms, 15 buffers |

## Hot paths — planes bajo rol real (post-fix)

| # | Path (rol) | Plan | Veredicto |
|---|---|---|---|
| Q1 | Grilla del día (`turnogol_app`+tenant) | `idx_bookings_date_status` + InitPlan RLS; JOIN players re-chequea policy por fila vía `uq_player_tenant` Index Only | ✅ 0,4 ms |
| Q2-Q5 | Caja/dashboard día ART | ver D3-H1 — post-fix todos por índice crudo | ✅ fixeado |
| Q6a/c | /explorar search (+Haversine) | Seq scan `tenants` 207 filas + Hash Left Join agregado reviews; Haversine en Sort top-N | ✅ 0,5-0,7 ms (ver H2/H4) |
| Q7 | Disponibilidad cross-tenant (`turnogol_worker`) | Hash Anti Join; bookings por BitmapAnd (GiST exclusión ∧ `idx_bookings_date_status`) | ✅ 1,4 ms |
| Q8 | Auto-complete cron | `idx_bookings_confirmed_ends` (parcial 053) | ✅ validado con volumen (D1 lo dejó pendiente) |
| Q9 | Expiry sweep | `idx_bookings_pending_created` (parcial 053) | ✅ 0,03 ms |
| Q10 | /deudas getDebts | `idx_bookings_status` + `idx_cash_flows_booking`; **10.922 bookings agrupados para devolver 0 filas; 55 ms, 71k buffers** | 🟡 H3 (sin techo) |
| Q11 | Mis-reservas jugador (player ctx) | `idx_bookings_player` | ✅ 0,1 ms |
| Q12a/b | Métricas 30d | `idx_bookings_date_status` / `idx_cash_flows_tenant_date` (rango UTC ya sargable de fábrica) | ✅ <0,6 ms |

**Seq scans restantes: todos justificados** (tenants 207 filas, courts 709, canteen_products/tabs por tenant — tablas chicas donde el seq scan gana legítimamente).

## Hallazgos (recon + medición)

### 🔴 D3-H2 — agregado de reviews de /explorar: escaneo completo por request público
`search.service.ts:140-148`: `GROUP BY reviews.tenant_id` sobre TODA la tabla en cada carga de `/`, `/explorar`, `/api/public/search` (superficie pública sin auth, sin caché propio — a diferencia de availability que tiene Upstash 30s). Hoy: 0,15 ms con 659 reviews; crece linealmente sin techo. **Fix propuesto:** caché del agregado (Upstash con invalidación en `createReview`, o materialización denormalizada en tenants como ya se hace con `from_price_cents`). No aplicado — rediseño con decisión de invalidación.

### 🔴 D3-H3 — export de caja sin tope de rango
`api/reports/revenue/route.ts:10-14` + `report.service.ts:195-227`: el Zod solo valida formato de fecha; `?from=2020-01-01&to=2030-01-01&format=csv` baja el histórico completo sin LIMIT ni chunking. **Fix propuesto:** tope server-side de rango (p. ej. 366 días) en el schema.

### 🟡 D3-H4 — Haversine: medido y DIFERIDO con evidencia
`search.service.ts:129`: 6371*acos(…) por fila. Con 207 tenants: el sort Haversine cuesta ~0,1 ms del total 0,5 ms — **el costo real es marginal a cualquier escala alcanzable de año 1-2** (el seq scan de tenants domina y es legítimo). El fix por etapas del MASTER_PLAN (bounding box) además **cambia semántica** (hoy ordena por distancia sin excluir; un bounding box excluye lejanos). Diferido con trigger: re-evaluar al superar ~2.000 tenants o si se agrega filtro por radio (ahí sí bounding box + índice lat/long, y es decisión de producto).

### 🟡 D3-H5 — N+1 reales (recon, con evidencia por archivo:línea)
Concentrados en workers cross-tenant y venta de cantina; los peores:
1. `generate-abonado-slots.worker.ts:36-133` — scan de TODOS los abonados activos de la plataforma sin LIMIT + ~10 queries por abonado (conflict-check + INSERT por fecha), diario. Fix: batch `date = ANY(...)` (patrón ya existente en `getAbonadoSlotConflicts`) + bulk INSERT.
2. `refresh-mp-tokens.worker.ts:29-79` — re-lee `mp_refresh_token` dentro de cada tx cuando ya vino en el SELECT inicial (la llamada HTTP por tenant es inherente).
3. `canteen-sale.service.ts:163-177` (+ `canteen-tab.service.ts:142-156, 259-279`) — 1 INSERT stock_movements + 1 UPDATE canteen_products por línea de ticket (N≤10, hot path de venta). Fix: multi-row INSERT + `UPDATE … FROM (VALUES …)`.
4. `abonado.service.ts:104-114` — loop de `checkBookingOverlap` con el patrón batch correcto a 30 líneas de distancia.
5. `dunning-retry.worker.ts:36-60` — loop secuencial que el propio comentario admite ("Mejora futura: una sola query con ANY").
6. `send-email.worker.ts:71-88` — trae ids y refetchea fila completa por id (N≤50, cada 1 min).
Sin over-fetch de columnas material. No aplicados (auditar ≠ fixear; ninguno es P0 — escala hoy chica y acotada por LIMIT o por tamaño de ticket).

### 🟡 D3-H6 — queries sin LIMIT sobre tablas sin techo (H3 de D1, lista completa)
- `deudas/queries.ts:32-80` getDebts — histórico completo de completed del tenant (medido: 55 ms/71k buffers con 1 año y CERO deudas). Fix: piso de fecha (12 meses) + LIMIT — **REQUIERE INPUT** (¿una deuda de hace >1 año deja de mostrarse?).
- `reservas/queries.ts:110-129` countTenantBookingsByStatus scope historial — agregado sobre todo el pasado en cada carga de la pestaña.
- `canteen-tab.service.ts:307-314` listOpenTabs — sin LIMIT (fiados abiertos crecen si no se cobran).
- `api/player/data-export` — acotado por jugador y ventana de retención, OK documentado.

### D3-H7 — H1 de D1 CERRADO: la divergencia de estilo temporal era el bug, no una convención
El inventario completo (recon B) confirmó que los 8 callers estilo expresión eran exactamente los del fix D3-H1 y los de rango UTC (metrics, reports) ya estaban sargables. Post-fix, **todo el repo filtra `occurred_at` por rango sargable**; la expresión ART sobrevive solo como etiqueta de GROUP BY/SELECT. Clase cerrada con grep.

### Matriz de invalidación de caché (recon C — completa en el output del recon, resumen acá)
- Modelo real: **0 `revalidateTag`**, 63 `revalidatePath` efectivos; todo el árbol admin/player/super-admin es dynamic por `cookies()` en los layouts → sin Full Route Cache que romper. Superficies cacheadas reales: `/` (ISR 300s), `/[slug]` (ISR 300s), 2 fragmentos `unstable_cache` de `/explorar` (sin tags = invalidación imposible, solo TTL).
- **Gaps tipo (a)** (mutación → página ISR stale hasta 5 min): 🔴 `createCourtAction`/`updateCourtAction`/`toggleCourtStatusAction` (`canchas/actions.ts:89,147,170`) no revalidan `/${tenant.slug}` — inconsistente con las actions de fotos del mismo archivo que sí lo hacen; 🟡 `updateReservasPolicyAction` (`allow_online_booking`) y las 3 de horarios ídem. **Mitigante verificado:** el checkout (`[slug]/reservar`, force-dynamic) re-consulta fresco — es card fantasma/UX, nunca reserva o cobro inválido.
- **Gap tipo (b)**: `revalidatePath('/deudas')` apunta al stub redirect; la ruta viva es `/jugadores/deudas` (cosmético, la viva es dynamic).
- Fixes no aplicados (van con el chip/backlog de fixes D3, son de 1 línea cada uno).

## Ledger de delegaciones

| Agente | Finalidad | Costo | Resultado |
|---|---|---|---|
| sonnet-reconnaissance A | N+1 + over-fetch | ~249k tok | 10 hallazgos (2🔴 workers, 5🟡, 3🟢); 0 over-fetch material |
| sonnet-reconnaissance B | H3 sin-LIMIT + H1 estilo temporal | ~247k tok | 2🔴+3🟡+1🟢; inventario H1 completo (insumo del fix D3-H1) |
| sonnet-reconnaissance C | Matriz de caché | ~170k tok | 63 usos verificados 1:1 contra rutas; 2🔴+2🟡 gaps ISR + 1 path muerto |
| sonnet-adversarial-reviewer | Verificación fresca del fix | ~171k tok | **APROBADO CON OBSERVACIONES** — reprodujo empíricamente: equivalencia expresión↔rango con 0 discrepancias sobre los 22.431 cash_flows + bordes (microsegundos, año nuevo, bisiesto), bind real del driver (postgres.js infiere timestamptz del ISO string), Index Scan confirmado por el path real de la app, gate completo re-corrido independiente. 2 observaciones abajo |

## Verificación (gate)

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ limpio |
| `pnpm lint` | ✅ 0 errors (34 warnings pre-existentes) |
| `pnpm test` (unit) | ✅ 260 archivos / 2003 tests |
| `pnpm test:integration` | ✅ 95 archivos / 676/676 (677→676: se retiró el test de `getDayComparisons`, dead code borrado — ver observación 2) |
| `pnpm test:isolation` (BLOQUEANTE) | ✅ 123/123 |
| EXPLAIN post-fix bajo `turnogol_app`+RLS | ✅ Index Cond en las 3 clases (evidencia arriba) |

Gotcha operativo local: `psql -U postgres` no puede `SET ROLE turnogol_worker` (falta GRANT); one-off local `GRANT turnogol_worker TO postgres` vía `supabase_admin`. No afecta prod (el worker conecta directo con su DSN).

## Observaciones del verificador (aceptadas)

1. 🟡 **Sin canario de plan en CI**: si alguien revierte un caller a la expresión `AT TIME ZONE`, toda la suite queda verde y el Seq Scan bajo RLS vuelve en silencio — el harness `explain-d3-hotpaths.sql` no corre en CI. → Insumo directo de D5 (junto al drift test): un check que aserte Index Cond/ausencia de Seq Scan en 2-3 queries canario bajo `SET LOCAL ROLE turnogol_app`.
2. **Coordinación de merges — RESUELTA**: la rama `chore/drop-get-day-comparisons` (PR #54, dead code de D1) borra `getDayComparisons` — misma función que D3 había migrado en `cashflow.service.ts`. Se aplicó el mismo diff de borrado (función + `DayComparisons`/`DayTotals` en `cashflow.types.ts` + fixtures + test de integración) directo en `audit/data-d3`, sin esperar el merge del otro PR: el fix de artDayRangeUtc sobre esa función quedó sin efecto (nunca tuvo caller), sin pérdida. `audit/data-d3` ya no colisiona con PR #54 — cualquiera de los dos que mergee primero, el otro entra sin conflicto en esos archivos.

## Para fases siguientes

- **D6**: reutilizar `scripts/audit/seed-d3-volume.sql` tal cual (los conteos del resumen post-seed quedan impresos al correrlo).
- **D5**: la lección leakproof aplica a cualquier índice de expresión futuro sobre tablas RLS — candidata a check del drift test. `pg_stat_user_indexes` local no es representativo (una corrida); medir uso real con `pg_stat_statements` en prod.
- **D7**: la 054 es un DROP INDEX puro (sin lock relevante); recordar la convención CONCURRENTLY para CREATE futuros (H4 de D1).
- Backlog fixes D3 (no aplicados, con evidencia): H2 caché ratings, H3 tope export, H5 N+1 (6 sitios), H6 LIMIT deudas/historial/fiados (uno con REQUIERE INPUT), gaps de revalidación (5 líneas).
