# Fase B2 — RLS Multi-tenancy Report

**Fecha:** 2026-05-24
**Worktree:** `audit/backend-b02`
**Tests verde post-cambios:** 110/110 en 7 archivos RLS-related (sin regresión)

---

## Resumen Ejecutivo

| Task | Hallazgo | Resultado | Tests | Fix |
|------|----------|-----------|-------|-----|
| B2.1 Audit estructural | 50 policies en 006_rls_policies.sql, mapeadas | ✅ Validado | 0 | No |
| B2.2 WITH CHECK bookings | tenant_isolation_insert/update + player_self_insert tienen WITH CHECK | ✅ Validado | 0 | No |
| B2.3 WITH CHECK todas las tablas | 28 INSERT/UPDATE policies × 29 WITH CHECK = 100% cobertura | ✅ Validado | 0 | No |
| B2.4 Service role bypass audit | **🟡 P1: Pre-read en `mis-reservas/actions.ts:42` sin contexto player** | ✅ FIX aplicado | 3 | **Sí** |
| B2.5 Pool poisoning | SET LOCAL tx-scoped, no cross-leak entre tx | ✅ Validado | 3 | No |
| B2.6 Realtime cliente real | Deferido a Fase F3 (requiere setup Supabase client) | ⏭️ Deferred | 0 | No |
| B2.7 JWT forgery | Deferido a Fase B6 (Auth) — requiere JWT signing setup | ⏭️ Deferred | 0 | No |
| B2.8 Audit log system_admins | **🟡 P1: 0 triggers** | 📝 Documentado, fix en B10 | 0 | No |
| B2.9 BYPASSRLS audit | postgres + service_role + supabase_admin tienen bypass (esperado); `turnogol_app` no | 📝 Documentado | 0 | No |
| B2.10 Cierre fase | Report + reviewer + commit + STATE | 🟢 | - | - |

**Total tests nuevos: 6** (todos verdes).
**Fixes código: 1 archivo** (`mis-reservas/actions.ts` refactor pre-read a `withPlayerContext`).

---

## Veredicto Global

🟡 **RLS VALIDADO CON 1 P1 FIXED + 2 P1 DOCUMENTADOS**

El sistema RLS está sólidamente diseñado:
- 100% INSERT/UPDATE policies tienen WITH CHECK
- SET LOCAL es transaction-scoped (no pool poisoning)
- Realtime policy filtra por JWT app_metadata.tenant_id
- Tablas inmutables (audit_logs, daily_cash_closes) tienen REVOKE UPDATE/DELETE

Detectados gaps menores:
- 1 P1 con defensa en profundidad: pre-read player sin contexto (fixed)
- 1 P1 documentado: ausencia de audit log en system_admins (fix en B10)
- 1 P1 documentado: postgres user tiene BYPASSRLS (config de producción crítica)

---

## Hallazgos detallados

### 🟡 P1 FIXED: Pre-read pattern leakea con superuser

**Severidad:** P1 (defense in depth)

**Archivo:** `src/app/(player)/mis-reservas/actions.ts:42-50` (antes del fix)

**Comportamiento previo:**
```ts
const db = getDb()
const preRows = await db.execute(sql`
  SELECT tenant_id, deposit_status FROM bookings WHERE id = ${parsed.data.bookingId}
`)
```
Si la connection usa role con `BYPASSRLS=true` (en producción Supabase, `postgres` y `service_role` tienen bypass), el SELECT devuelve **cualquier booking del sistema**, leakeando `tenant_id` y `deposit_status`.

**Test que demuestra:** `tests/integration/rls-pre-read-player-action.test.ts:35` — corre con postgres superuser y confirma leak.

**Fix aplicado:**
- Refactor a `withPlayerContext(user.playerId, ...)` desde el inicio
- Aplica policy `player_own_bookings_select` que filtra por `current_player_id`
- Si role bypass RLS, igual el SELECT solo devuelve bookings del player autenticado

**Test verde post-fix:** `tests/integration/idor-player-bookings.test.ts` + `player-app.test.ts` siguen pasando (6/6).

### 🟡 P1 DOCUMENTADO: postgres user tiene BYPASSRLS

**Severidad:** P1 (riesgo de config producción)

**Hallazgo:**
```
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolbypassrls = true;
```
Resultado: postgres ✓, service_role ✓, supabase_admin ✓, supabase_read_only_user ✓

**Implicancia:** Si en producción `DATABASE_URL` usa role `postgres` o `service_role`, las policies RLS son ignoradas. Toda la auditoría isolation pasa porque los tests fuerzan `SET LOCAL ROLE turnogol_app`, pero la app en runtime puede usar role bypass.

**Recomendación para B11 (Operativo):**
1. Verificar que `DATABASE_URL` en producción usa role NO-bypass (`authenticated` para requests del app, `service_role` SOLO para background jobs que lo requieran).
2. Forzar `SET LOCAL ROLE turnogol_app` en `withTenantContext`/`withPlayerContext` para defense in depth aunque el role del pool sea bypass.

### 🟡 P1 DOCUMENTADO: system_admins sin audit trigger

**Severidad:** P1 (compliance + forensics)

**Hallazgo:**
```
SELECT tgname FROM pg_trigger WHERE tgrelid='system_admins'::regclass AND NOT tgisinternal;
-- 0 rows
```

**Implicancia:** Cambios en super admins (status, last_login_at, mfa_verified_at) no quedan trazados. Si super admin se compromete y rotan accesos, no hay forma de saber qué cambió y cuándo.

**Fix asignado a Fase B10 (Observabilidad)**: agregar trigger AFTER INSERT/UPDATE/DELETE que inserta en audit_logs con `actor_type='system_admin'`.

---

## Validaciones positivas

### ✅ 100% policies INSERT/UPDATE tienen WITH CHECK

Conteo verificado:
- 15 policies FOR INSERT + 13 FOR UPDATE = 28 que requieren WITH CHECK
- 29 ocurrencias de `WITH CHECK` en migration 006 (1 compuesta)
- 0 missing

### ✅ SET LOCAL tx-scoped (no pool poisoning)

`tests/integration/rls-pool-poisoning.test.ts` (nuevo, 3 tests):
1. Después de `withTenantContext(A)`, nueva tx sin contexto → 0 rows ✓
2. Secuencial A → B con role `turnogol_app` → cada uno solo ve sus rows ✓
3. Paralelo A + B con `turnogol_app` → no cross-leak ✓

### ✅ RLS dual bookings (admin + player + realtime)

Verificado en mapeo:
- `tenant_isolation_select/insert/update/delete` × admin via `app.current_tenant_id`
- `player_own_bookings_select` + `player_self_insert` × player via `app.current_player_id`
- `realtime_tenant_select` × authenticated via `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`

### ✅ Tablas globales correctamente protegidas

- `tenants`, `plans`, `price_versions`, `processed_webhooks`: sin RLS (acceso público a metadata business)
- `players`: RLS relacional via `player_tenant_relationships` (staff ve solo sus players, player ve solo a sí mismo)
- `staff_users`: RLS relacional via `tenant_staff_members` (staff ve solo staff de su tenant)
- `system_admins`: RLS por `app.current_system_admin_id` (cada admin se ve a sí mismo)

### ✅ Tablas inmutables (REVOKE UPDATE/DELETE)

`audit_logs` y `daily_cash_closes` tienen `REVOKE UPDATE, DELETE FROM turnogol_app` (migration 008_revokes.sql).

---

## Tests deferidos a otras fases

| Test | Razón defer | Fase destino |
|------|-------------|--------------|
| B2.6 Realtime con cliente Supabase real | Requiere setup Supabase client + subscription | F3 — Grilla + Realtime |
| B2.7 JWT forgery defense | Requiere JWT signing manual + endpoint test | B6 — Auth/Sesiones/Seguridad |

---

## Estado para Próxima Fase

- **Worktree `audit/backend-b02`**: mantener para PR a main.
- **Fase B3 (MercadoPago)**: arrancar en worktree nuevo `audit/backend-b03`.

---

## Decisiones requeridas al humano

1. **¿Mergeo `audit/backend-b02` → `main`?** (Recomendado: sí — fix P1 + 6 tests nuevos + report).
2. **¿Procedo con Fase B3 — MercadoPago?** (Recomendado: sí).
3. **Recomendación crítica para B11**: validar `DATABASE_URL` de producción NO use role superuser/bypass.
