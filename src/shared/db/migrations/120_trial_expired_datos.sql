-- ============================================================
-- 120_trial_expired_datos.sql
-- Fin del freemium, paso de datos (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md §4).
--
-- 1. Los complejos que quedaron en `free` pasan a `trial_expired`, sin mail
--    (decisión 4.2). El código desde el PR de trial_expired ya trata `free`
--    igual que `trial_expired`, así que el cambio no se ve: solo deja a las
--    filas en el estado definitivo. Se limpia `scheduled_deletion_at`: el
--    borrado por inactividad del gratis ya no existe y un vencido nunca se borra
--    (4.4). `transitionToExpired` lo limpia al transicionar, pero un UPDATE
--    masivo no pasa por ahí.
-- 2. Las pruebas en curso se extienden a 30 días desde el alta (4.3). Solo las
--    que hoy terminan antes: una prueba extendida a mano por soporte no se acorta.
--    Se reinicia el aviso de 7 y 1 día y se corre `current_period_end` de la
--    suscripción en prueba, que nace igual a `trial_ends_at`.
--
-- Va DESPUÉS de que el código de trial_expired esté desplegado. Idempotente.
-- Rollback: no hay vuelta a `free`; el valor del enum queda sin uso.
-- ============================================================

UPDATE tenant_subscriptions
SET status = 'trial_expired', scheduled_deletion_at = NULL, updated_at = NOW()
WHERE status = 'free';

UPDATE tenants
SET status = 'trial_expired', scheduled_deletion_at = NULL, updated_at = NOW()
WHERE status = 'free';

UPDATE tenants
SET trial_ends_at = created_at + INTERVAL '30 days',
    trial_warning_days_sent = NULL,
    updated_at = NOW()
WHERE status = 'trialing'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at < created_at + INTERVAL '30 days';

UPDATE tenant_subscriptions s
SET current_period_end = t.trial_ends_at, updated_at = NOW()
FROM tenants t
WHERE s.tenant_id = t.id
  AND s.status = 'trialing'
  AND t.status = 'trialing'
  AND t.trial_ends_at IS NOT NULL
  AND (s.current_period_end IS NULL OR s.current_period_end < t.trial_ends_at);
