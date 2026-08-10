-- 073 — Retención de 90 días: corregir las fechas de borrado ya materializadas
--
-- CONTEXTO. `/terminos` y `/privacidad` le prometen al titular que "los datos
-- del complejo se conservan 90 días tras la baja (estado churned)". El código
-- borraba a los 7 (`CHURNED_DELETION_DAYS`), o sea 83 días antes de lo
-- garantizado. La constante ya se movió a 90 en `billing/lifecycle.service.ts`,
-- pero eso SOLO afecta a las transiciones futuras: `scheduled_deletion_at` se
-- materializa en la fila en el momento de la transición
-- (`NOW() + interval`), así que las filas que ya pasaron por
-- `transitionBlockedToChurned` / `transitionCanceledToBlocked` siguen con la
-- fecha vieja y `data-retention-cleanup.worker.ts` las borraría igual.
--
-- DOS DELTAS DISTINTOS, no uno. Los dos caminos escribían plazos distintos:
--
--   churned  (transitionBlockedToChurned)   NOW() + 7d   → falta +83d  (=90)
--   blocked  (transitionCanceledToBlocked)  NOW() + 67d  → falta +30d  (=97)
--
-- Aplicar un solo +83 a las dos poblaciones dejaría a los `blocked` en 150 días,
-- mucho más de lo que corresponde.
--
-- POR QUÉ EL FILTRO POR STATUS ES SUFICIENTE. `suspended → blocked` (dunning
-- día 14) NO toca `scheduled_deletion_at` — se puede verificar en
-- lifecycle.service.ts: los únicos cuatro UPDATE que lo escriben son los dos de
-- churned y los dos de canceled→blocked, y `transitionToActiveFromAny` lo
-- vuelve a NULL. Entonces una fila `blocked` con `scheduled_deletion_at` no
-- nulo salió sí o sí del camino de cancelación.
--
-- GUARDA DE IDEMPOTENCIA. La cota superior (`<= NOW() + 7d` / `<= NOW() + 67d`)
-- describe exactamente lo que pudo escribir la constante vieja: una fecha
-- fijada en el pasado como "ese momento + N días" nunca puede estar más
-- adelante que "ahora + N días". Después de correr esto las filas quedan fuera
-- de su propia guarda, así que una segunda pasada no las vuelve a mover.
--
-- ADITIVO Y REVERSIBLE: solo empuja fechas hacia adelante, o sea que solo puede
-- conservar datos de más. Para revertir, restar los mismos intervalos.

BEGIN;

-- ── churned: 7d → 90d ────────────────────────────────────────────────────
UPDATE tenant_subscriptions
SET scheduled_deletion_at = scheduled_deletion_at + INTERVAL '83 days'
WHERE status = 'churned'
  AND scheduled_deletion_at IS NOT NULL
  AND scheduled_deletion_at <= NOW() + INTERVAL '7 days';

UPDATE tenants
SET scheduled_deletion_at = scheduled_deletion_at + INTERVAL '83 days'
WHERE status = 'churned'
  AND scheduled_deletion_at IS NOT NULL
  AND scheduled_deletion_at <= NOW() + INTERVAL '7 days';

-- ── blocked por cancelación: 67d → 97d ───────────────────────────────────
UPDATE tenant_subscriptions
SET scheduled_deletion_at = scheduled_deletion_at + INTERVAL '30 days'
WHERE status = 'blocked'
  AND scheduled_deletion_at IS NOT NULL
  AND scheduled_deletion_at <= NOW() + INTERVAL '67 days';

UPDATE tenants
SET scheduled_deletion_at = scheduled_deletion_at + INTERVAL '30 days'
WHERE status = 'blocked'
  AND scheduled_deletion_at IS NOT NULL
  AND scheduled_deletion_at <= NOW() + INTERVAL '67 days';

COMMIT;
