# Fase B11 — Operativo / Backups / Runbook — Report

**Fecha:** 2026-05-25
**Branch:** `audit/backend-b11`
**Veredicto:** 🟡 **1 P0 FIXED + 5 P1 FIXED + 1 P1 docs + 3 P1 deferred-legal** (0 P0 abiertos)

**Objetivo (MASTER_PLAN):** Cuando rompa, sabés QUÉ HACER. Recuperás de incidentes. Cerrar arrastres P1 documentados en STATE.md (BYPASSRLS, refresh-mp-tokens FOR UPDATE, magic link runbook, JWT rotation, ENCRYPTION_KEY rotation, /privacy /terms, NEXT_PUBLIC_E2E stress, launch-check env vars).

---

## Done-criteria (MASTER_PLAN B11) con evidencia

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| Backup restaurado exitosamente al menos 1 vez | 🟡 **Procedure documentado, ejecución pendiente** | `docs/doc19_runbook.md` §10.6 nueva sección "Backup Restore Drill" con procedure paso-a-paso + evidencia template `docs/audit/backup-drills/YYYY-MM-DD.md`. Ejecución real requiere acceso a Supabase Pro + horas de operaciones (deferred a pre-launch operacional, no audit code). |
| Runbook con 5+ incidentes paso a paso | ✅ | `docs/doc19_runbook.md` §3.1-§3.12 → **12 procedures** (>5). B11 agregó 3.10 Magic Link, 3.11 JWT, 3.12 ENCRYPTION_KEY. |
| Staging environment espejo de prod | ✅ **decisión documentada** | `docs/LAUNCH.md` "Staging strategy (v1)": Vercel Preview Deployments como staging v1; trigger v1.5 (Supabase staging dedicado) cuando se alcancen criterios (10+ clientes, feature flags, requisito contractual). |
| CI gate (tests + lint + typecheck obligatorios) | ✅ | `.github/workflows/ci.yml` ya activo: Lint+typecheck (L29-33), unit (L54-55), integration+isolation BLOQUEANTE (L123-127), E2E sobre PRs (L130-201). Deploy.yml gateado por CI success. **B11 fix crítico (P0):** las migrations que CI aplica ahora coinciden con prod (Task 1). |

---

## Hallazgo P0 descubierto durante el audit

**CI aplicaba schema divergente del entorno local/prod.**

`src/shared/db/migrations/` (que CI aplica vía `ci.yml:118-121,192-195`) **no contenía** las migrations B4 `billing_columns`, B10 `notification_sending_enum` ni B10 `system_admins_audit`. Esos cambios sólo existían en `supabase/migrations/`. Resultado: tests integration B10 verdes localmente pasarían pero fallarían en CI sobre `main` cuando intentaran usar el valor `sending` del enum (`type "notification_status" does not have value "sending"`) o el trigger `trg_system_admins_audit`.

**Fix (Task 1):** porteadas 3 migrations a `src/shared/db/migrations/` (010-012) + convención de "dos trees" documentada en `docs/MIGRATIONS.md` + `docs/doc19_runbook.md` §4.5. Back-port adicional: `009_relax_payment_consistency.sql` faltaba en supabase tree → portado como `20260525000003_relax_payment_consistency.sql`.

Commits: `19ec11f` + `0a1b924`.

---

## P1 arrastres cerrados (5)

| ID | Hallazgo | Fix | Task / Commit |
|----|----------|-----|---------------|
| B2 | postgres user con BYPASSRLS — validar producción NO use role bypass | `pnpm launch-check` ahora consulta `pg_roles WHERE rolname = current_user` y falla si `rolbypassrls = true`. | T3 / `c77238b` |
| B5 | `refresh-mp-tokens` sin SELECT FOR UPDATE — last-writer-wins entre workers concurrentes | `pg_try_advisory_xact_lock(hashtext('mp_refresh:' || tenant_id))` dentro de tx. La función de fetch+update queda inlineada en la misma tx; otros workers reportan `skipped_locked`. Test: 5 workers concurrentes → 1 fetch real, 4 skipped (50 iters). | T2 / `fbfb321` |
| B6 | Magic link TTL/single-use → runbook | `docs/doc19_runbook.md` §3.10 "Debugging de Magic Link": síntomas, 4 escenarios, procedure manual via Supabase Dashboard, disclaimer de TTL 10min Supabase-managed. | T5 / `86ae482` |
| B6 | JWT secret rotation → runbook | `docs/doc19_runbook.md` §3.11 "Rotación de JWT Secret": disclaimer Supabase-managed, procedure de rotación de keys, efecto (sesiones invalidadas), comunicación proactiva. | T5 / `86ae482` |
| Audit | ENCRYPTION_KEY rotation strategy no documentada | `docs/doc19_runbook.md` §3.12 + validation en `pnpm launch-check` (length 64 hex, no placeholder `.env.example`, hex-only). v1 strategy: single-key + forced MP reconnection. v1.5: key versioning (deferred). | T3+T5 / `c77238b` + `86ae482` |
| B9 | Páginas legales (`/privacy`, `/terms`) ausentes | `src/app/(public)/privacy/page.tsx` (962 palabras, 9 secciones Ley 25.326) + `src/app/(public)/terms/page.tsx` (641 palabras, 10 secciones). Footer reutilizable `LegalFooter` integrado en `(public)/layout.tsx`. Tests smoke: 9 tests. | T4 / `2e0ada2` |
| Audit | Pre-prod launch-check requiere env vars reales (MP credentials probe) | `pnpm launch-check` ahora prueba credenciales MP con POST `/oauth/token` esperando HTTP 400 (creds válidas, grant rechazado). 401/403 → fail (non-fatal por si MP unreachable). | T3 / `c77238b` |
| Audit | Stress test requiere `NEXT_PUBLIC_E2E=1` env | `docs/doc19_runbook.md` §4.4 "Stress test pre-launch" — ritual completo con dos terminales, expectativa `Accepted=1`, doc para evidencia. | T5 / `86ae482` |

---

## P1 deferidos (legal/admin, fuera de scope code)

| ID | Hallazgo | Disposición |
|----|----------|-------------|
| B9 | DPA templates ausentes | Requiere counsel legal. `docs/LAUNCH.md` lo marca como checkbox pre-launch. |
| B9 | Inscripción AAIP pendiente | Trámite administrativo. `docs/LAUNCH.md` referencia `docs/legal/aaip-status.md` (a crear cuando inicie tracking). |
| MASTER | Backup restore drill real con evidencia | Requiere acceso a Supabase Pro + ejecución operacional. Procedure 100% documentado en doc19 §10.6 + LAUNCH.md checkbox; ejecución es post-audit (1 vez antes de launch, después trimestral). |

---

## P2 deferidos (v1.5)

| Hallazgo | Disposición |
|----------|-------------|
| ENCRYPTION_KEY key versioning (`encryption_keys` table + `*_key_id` columns) | v1.5 — v1 usa single-key + forced reconnection en rotación. Documentado en doc19 §3.12. |
| Supabase staging project dedicado | v1.5 — trigger documentado en LAUNCH.md (10+ clientes, feature flags, contractual). |
| CI stress test job (manual_dispatch o tag release-*) | Nice-to-have, no bloquea launch. Ritual local cubre el caso. |
| MP webhook HMAC secret annual rotation procedure | Documentado parcialmente en LAUNCH.md checkbox; full procedure → v1.5. |

---

## Cambios por archivo

| Archivo | Tipo | Commit |
|---------|------|--------|
| `src/shared/db/migrations/010_billing_columns.sql` | nuevo | `19ec11f` |
| `src/shared/db/migrations/011_notification_sending_enum.sql` | nuevo | `19ec11f` |
| `src/shared/db/migrations/012_system_admins_audit.sql` | nuevo | `19ec11f` |
| `supabase/migrations/20260525000003_relax_payment_consistency.sql` | nuevo | `0a1b924` |
| `docs/MIGRATIONS.md` | nuevo | `19ec11f` |
| `src/shared/jobs/workers/refresh-mp-tokens.worker.ts` | modificado | `fbfb321` |
| `tests/integration/refresh-mp-tokens-advisory-lock.test.ts` | nuevo (4 tests) | `fbfb321` |
| `tests/integration/refresh-mp-tokens-concurrency.test.ts` | modificado (single-winner semantics) | `fbfb321` |
| `scripts/launch-check.ts` | modificado (3 nuevos steps) | `c77238b` |
| `scripts/launch-check.helpers.ts` | nuevo (encryptionKeyStrengthCheck) | `c77238b` |
| `tests/unit/launch-check-helpers.test.ts` | nuevo (7 tests) | `c77238b` |
| `src/app/(public)/privacy/page.tsx` | nuevo | `2e0ada2` |
| `src/app/(public)/terms/page.tsx` | nuevo | `2e0ada2` |
| `src/components/site/legal-footer.tsx` | nuevo | `2e0ada2` |
| `src/app/(public)/layout.tsx` | modificado (integra footer) | `2e0ada2` |
| `tests/unit/legal-pages.test.ts` | nuevo (9 tests) | `2e0ada2` |
| `vitest.config.ts` | modificado (`jsx: 'automatic'`) | `2e0ada2` |
| `docs/doc19_runbook.md` | extendido (6 nuevas subsecciones) | `86ae482` |
| `docs/LAUNCH.md` | extendido (staging + drill + B11 checks) | `86ae482` |

---

## Tests

- **Unit:** 411/411 verde (incremento +16 vs B10: 7 launch-check-helpers + 9 legal-pages).
- **Integration:** 324/325 verde. La única falla es `race-abonado-vs-individual.test.ts`, **flaky pre-existente** (marcado en STATE.md desde B9). Pasa 2/2 en aislamiento; falla sólo cuando corre tras tests que crean estado residual sobre la misma cancha+franja. **No es regresión de B11** — B11 no toca lógica de bookings/abonados/conflict.
- **Typecheck:** verde.
- **Lint:** 0 errores. 4 warnings preexistentes (`<img>` en src/app/page.tsx + register/page.tsx) — deferred F12 Performance.

---

## Gaps remanentes

| Gap | Disposición |
|-----|-------------|
| Ejecución real del backup restore drill (no sólo documentación) | Pre-launch operacional (humano + Supabase Pro). Cuándo: antes de cutover a primer cliente real. |
| DPA template firmado | Legal team draft + counsel. Cuándo: antes de primer contrato B2B firmado. |
| AAIP inscripción submitted | Trámite administrativo. Cuándo: antes de launch público. |
| Flaky `race-abonado-vs-individual` (data bleed cross-test) | Fix de hermeticidad de fixtures (cleanup por-test o cancha+slot únicos por test). Backlog P2 (no bloquea launch). |
| ENCRYPTION_KEY versioning (rotación sin reconexión) | v1.5. Trigger: primera rotación real disparada por incidente; si la fricción operativa de v1 (forced reconnect) resulta demasiada, priorizar v1.5. |
| Supabase staging project dedicado | v1.5. Trigger: 10+ clientes o requisito contractual. |

---

## Stats acumulados (post B11)

- Fases completadas: 11/26.
- Tests nuevos B11: 20 (7 unit launch-check-helpers + 9 unit legal-pages + 4 integration refresh-mp-tokens-advisory-lock). 1 integration test reescrito (refresh-mp-tokens-concurrency single-winner).
- Bugs fixed B11: 1 P0 (CI migration divergence) + 5 P1 + 2 P1-docs.
- Acumulados: 16 bugs (2 P0 + 16 P1 + 3 P2 — corregir post-merge).

---

## Próxima fase

`F0 — Baseline + Build Health`. Backend done. El bloque frontend arranca con baseline build (bundle size, Lighthouse, `'use client'` audit).
