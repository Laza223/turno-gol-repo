# Fase D2 — RLS Performance (wave 2 datos) — Report

**Fecha:** 2026-07-23 | **Rama:** `audit/data-d2a` | **Estado:** ✅ código + gate verde local; ⏸ aplicación a prod bloqueada por hallazgo 🔴 D2-H2 (ver abajo)

## Contexto

Primera fase de la wave 2 de datos. Objetivo: eliminar la re-evaluación por fila de `current_setting()`/`auth.jwt()` en las policies RLS sin cambiar semántica de aislamiento. Precedida por checkpoint D8 (PR #50 caja/cantina mergeado; pack RLS de las 4 tablas nuevas ya existía → ex-D2b absorbida acá).

## Hallazgos

### D2-H1 🟡 — 73 policies re-evaluaban current_setting()/auth.jwt() POR FILA → FIXED (migr. 052)

**Evidencia (código):** todas las policies usaban el patrón desnudo `(NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid` (origen: `006_rls_policies.sql` y todas las tablas posteriores, incluidas las 4 del rediseño de caja). Confirmado en vivo: 72/74 policies de `pg_policies` con `current_setting` desnudo + `realtime_tenant_select` con `auth.jwt()` desnudo; 0 wrapped.

**Confirmación independiente:** advisor `auth_rls_initplan` de Supabase contra PROD: **WARN ×62** (62 = las 73 menos las 11 de las tablas 048/049 que prod aún no tiene — ver D2-H2).

**Evidencia (plan de ejecución), como `turnogol_app` + `SET LOCAL` (nunca superusuario — postgres local tiene BYPASSRLS y enmascara):**

ANTES (052 sin aplicar):
```
Index Scan using idx_bookings_date_status on public.bookings
  Index Cond: (bookings.date = '2026-07-23'::date)
  Filter: ((bookings.tenant_id = (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)
        OR (bookings.player_id = (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid))
```
→ 2 llamadas a función **por cada fila** que pasa el Index Cond.

DESPUÉS (052 aplicada):
```
Index Scan using idx_bookings_date_status on public.bookings
  Index Cond: (bookings.date = '2026-07-23'::date)
  Filter: ((bookings.tenant_id = $0) OR (bookings.player_id = $1))
  InitPlan 1 (returns $0)
    ->  Result: (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid
  InitPlan 2 (returns $1)
    ->  Result: (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid
```
→ 1 evaluación **por query**. Mismo Query Identifier (3124191793186052805): misma query, plan mejor.

**Fix:** `src/shared/db/migrations/052_rls_initplan_wrap.sql` (+ espejo `supabase/migrations/20260424000052_rls_initplan_wrap.sql`): 73 `ALTER POLICY ... USING/WITH CHECK` con el patrón envuelto en `(SELECT ...)`. Generado desde `pg_policies` del schema migrado a 051 (no desde archivos históricos — 018 open_matches está dropeada desde 028) y revisado a mano. `ALTER POLICY` preserva roles y cmd. Gotcha de generación: el deparse de `pg_policies` muestra `jwt()` sin calificar — el statement de `realtime_tenant_select` se escribió a mano con `auth.jwt()` explícito.

**Post-fix en vivo:** 0 policies desnudas / 73 wrapped / 74 total (la restante es `reviews_public_select` = `true`, sin funciones).

### D2-H2 🔴 — PROD desincronizada: migraciones 048–051 SIN aplicar con el código ya deployado — REQUIERE INPUT

**Evidencia (queries read-only contra prod `dpzicetvrgqlwfrqlaek`):**
- `canteen_products` / `canteen_tabs` / `stock_movements` / `daily_cash_opens` en prod: **0 de 4**.
- Markers: 046 aplicada (products dropeada ✅), 047 aplicada (`bookings.completed_by_staff` ✅), 050 NO (`cashflow_category` sin `merchandise`), policies_prod = 63 (local = 74). **Prod está exactamente en 047.**
- `supabase_migrations.schema_migrations` vacía → las migraciones a prod se aplican A MANO y SIN tracking.

**Impacto:** PR #50 mergeado 2026-07-23 04:50Z + deploy automático Vercel tras CI verde → el código de Caja y Cantina corre en prod contra una DB sin sus tablas. `/caja`, `/caja/cantina` y `/caja/productos` deben estar tirando 500 ahora mismo para cualquier tenant.

**Causa sistémica (alimenta D7):** el pipeline aplica migraciones solo al Postgres efímero de CI; NO existe paso de migración a prod en el deploy. El "reset de 47 migraciones" previo fue manual y no dejó registro.

**Fix propuesto (REQUIERE INPUT — toca prod):** aplicar 048→049→050→051 en orden (el backfill de 048 lee el JSONB que 051 borra — el orden importa), verificar con los mismos markers, y opcionalmente 052 en el mismo acto. Después: D7 diseña el paso permanente de migración a prod.

**✅ RESUELTO (2026-07-23, aprobado por el dueño):** 048→049→050→051→052 aplicadas a prod vía Supabase MCP `apply_migration`. Verificación post-apply: 4/4 tablas, 5/5 enum values, JSONB limpio, `daily_cash_closes.opening_cash/expected_cash` presentes, 74 policies / 0 desnudas (idéntico a local), y `supabase_migrations.schema_migrations` ahora registra las 5 (tracking inaugurado — antes vacío). La causa sistémica (sin paso de migración a prod en el pipeline) queda ABIERTA → D7.

### D2-H3 — Advisors de prod (material para fases siguientes, NO fixeado acá)

**Security (13 WARN, 0 críticos):**
- `function_search_path_mutable` ×5 (`trigger_set_updated_at`, `prevent_duplicate_active_ban`, `validate_notification_recipient`, `audit_system_admins_change`, `enforce_booking_invariants_fn`) — search_path mutable en funciones de trigger. 🟡 → candidata a migración de hardening (fase D5 o fix suelto).
- `anon/authenticated_security_definer_function_executable` ×6 (3 funciones × 2 roles): `recalc_tenant_from_price(uuid)` es la real — SECURITY DEFINER invocable por `anon` vía PostgREST RPC (las otras 2 devuelven trigger, no invocables en la práctica). 🟡 → `REVOKE EXECUTE` en fix suelto.
- `extension_in_public` ×2 (`pg_trgm`, `btree_gist`) — 🟢 cosmético.

**Performance (176 lints):**
- `auth_rls_initplan` WARN ×62 → es D2-H1; queda en 0 cuando 052 llegue a prod.
- `unindexed_foreign_keys` INFO ×11 (bookings×2, cash_flows×2, +7) → **pre-cargado a D1**.
- `duplicate_index` WARN ×4 (pares idénticos email/mp_event_id en players, staff_users, system_admins, processed_webhooks) → **pre-cargado a D1** (quick win: drop de 4 índices).
- `unused_index` INFO ×56 → D1/D3 con caveat: prod casi sin tráfico, `idx_scan=0` todavía no es señal.
- `multiple_permissive_policies` WARN ×42 → by-design (RLS dual admin/jugador); con InitPlan el costo marginal es mínimo. 🟢 documentado, no accionar.
- `no_primary_key` en `pgboss.archive` → **pre-cargado a D5** (housekeeping pg-boss).

## Verificación (gate)

| Check | Resultado |
|---|---|
| `pnpm test:isolation` (BLOQUEANTE) | ✅ 123/123 |
| `pnpm test:integration` | ✅ 95 archivos / 677/677 |
| `pnpm typecheck` | ✅ limpio |
| `pnpm lint` | ✅ 0 errors (34 warnings pre-existentes react-hooks, sin relación) |
| EXPLAIN como `turnogol_app` | ✅ InitPlan (evidencia arriba) |
| Policies desnudas post-052 | ✅ 0/74 |

## Gaps remanentes

1. 🔴 D2-H2: prod sin 048–051 (y sin 052) — decisión del dueño pendiente.
2. La mejora InitPlan no está MEDIDA con volumen (será visible en D3/D6 con el seed sintético; acá la evidencia es de forma de plan, que es lo que garantiza O(1) evaluaciones).
3. Hardening de funciones (search_path + REVOKE de `recalc_tenant_from_price`) — anotado, no ejecutado (auditar ≠ fixear fuera de scope de fase).
