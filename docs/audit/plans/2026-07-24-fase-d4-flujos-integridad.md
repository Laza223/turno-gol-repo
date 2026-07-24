# Fase D4 — Flujos de integridad dinámica (plan/contrato)

**Fecha:** 2026-07-24 · **Rama:** `audit/data-d4` (worktree `TurnoGol-d4`, base main `f19f700`)
**Criticidad:** 🔴🔴🔴 Crítica · **Fuente:** MASTER_PLAN §D4 + pre-cargas D5/D8

## Objetivo verificable

Ningún flujo de plata pierde/duplica bajo concurrencia, retry o fallo a mitad de camino. Concretamente:

1. Clase tx-catch (catch dentro de `withTenantContext` que traga → commit a medias) CERRADA en main — incluye rescatar los 4 fixes varados en `claude/wizardly-gates-df7198` (nunca mergeada; bug activo confirmado en `completeAndChargeBookingAction`).
2. Carreras de la clase nueva canteen/caja (stock concurrente, fiado doble-click, cierre concurrente con ventas, apertura doble) auditadas; las reales cerradas con patrón FOR UPDATE/constraint + race test verde (patrón B1: iteraciones concurrentes).
3. Idempotencia de los 12 workers pg-boss bajo retry: matriz completa; rojos fixeados o documentados con severidad.
4. Clase Saga (llamada MP/red dentro de tx abierta): instancias confirmadas (`mp-webhook.handler.ts:84-196`, `billing.service.ts:422-424` pre-cargadas) fixeadas o justificadas.
5. Matriz de transiciones del state machine booking completa (trigger vs código vs doc6); `completed→no_show` 24h resuelto con código (claims contradictorios entre memoria y MASTER_PLAN).
6. Día operativo en ventas de cantina de madrugada: veredicto con evidencia (¿venta 01:30 cae en la caja de la noche?).
7. Reconciliación MP↔payments↔cash_flows: DISEÑO escrito (invariantes + queries); implementación difierible con REQUIERE INPUT de prioridad.

## Alcance — qué NO se toca

- No se re-audita lo confirmado vigente por MASTER_PLAN (exclusion constraints, UNIQUE webhook, expiry worker, `prepare:false`).
- No migraciones que cambien semántica de negocio sin REQUIERE INPUT.
- No fixes en specs/docs de wave 1.
- No se modifica ninguna migración existente (solo se crean nuevas si hace falta).

## Juez (inmutable durante la fase)

```
pnpm typecheck && pnpm lint
pnpm test                       # unit
pnpm test:integration           # DB real 54322 (incluye race tests nuevos)
pnpm test:isolation             # BLOQUEANTE
```

## Etapas

1. Recon 6 subagentes Sonnet (Saga, workers, multi-tabla+tx-catch, canteen races, state machine, reconciliación) — read-only sobre main.
2. Síntesis: clasificar 🔴/🟡/🟢, decidir fix-en-fase vs backlog vs REQUIERE INPUT.
3. Implementación en `audit/data-d4`: fixes quirúrgicos + race tests. Juez verde entre cambios.
4. Verificación adversarial con contexto fresco (lee diff antes que resumen).
5. Cierre: report `fase-d4-flujos-integridad-report.md`, STATE.md, PROGRESS.md, PR.

## Ledger de delegaciones

| # | Agente | Finalidad | Resultado |
|---|--------|-----------|-----------|
| R1 | sonnet-recon | Clase Saga MP-en-tx | pendiente |
| R2 | sonnet-recon | Idempotencia 12 workers | pendiente |
| R3 | sonnet-recon | Multi-tabla sin tx + tx-catch main HOY | pendiente |
| R4 | sonnet-recon | Carreras canteen/caja + día operativo | pendiente |
| R5 | sonnet-recon | Matriz state machine booking/abonado | pendiente |
| R6 | sonnet-recon | Reconciliación MP↔payments↔cash_flows | pendiente |

## Pre-cargas (no re-derivar)

- Saga: `mp-webhook.handler.ts:84-196` + `billing.service.ts:422-424` (verificador D5).
- tx-catch: 4 archivos rotos esperados en main (`reservas/actions.ts`, `abonados/actions.ts`, `mis-reservas/actions.ts`, `deudas/actions.ts`); caja limpia post-PR#50. Diff rescatable en worktree `wizardly-gates-df7198` (sin commitear, base vieja a99dd94).
- Reconciliación: `reconcile-pending-payments` existe (`definitions.ts:17`); falta cruce completo. Bug mock amount=1 = caso testigo.
- `completed→no_show`: memoria dice implementado, MASTER_PLAN dice no — el código manda.
