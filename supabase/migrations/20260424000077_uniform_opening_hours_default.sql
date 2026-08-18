-- 077 — Horario default parejo para los 7 días (F-026, QA de producción 2026-08-17)
--
-- El DEFAULT de `tenants.opening_hours` (migr. 003) traía tres días distintos del
-- resto sin que nadie los hubiera elegido: viernes cerraba 01:00, sábado abría
-- 09:00 y cerraba 01:00, y domingo cerraba 23:00. En el wizard eso se traduce en
-- un complejo que publica un horario que no es el suyo — y con jugadores viendo
-- disponibilidad online, un turno que no aparece cuando debería.
--
-- `sanitizeWizardHours` (src/app/onboarding/wizard-hours.ts) ya corregía el bug
-- TÉCNICO de ese default —vie/sáb cerraban 01:00 con closes_next_day=false, un
-- estado inválido que dejaba el día sin precio en silencio— pero no la diferencia
-- de horario en sí, que es el bug de PRODUCTO. Se corrige en el origen.
--
-- Alcance: SET DEFAULT no toca ninguna fila existente, así que ningún complejo ya
-- creado cambia de horario. Aplica solo a tenants nuevos. Las excepciones por día
-- siguen siendo del dueño, vía el toggle que ScheduleFields ya tiene.

ALTER TABLE tenants
  ALTER COLUMN opening_hours SET DEFAULT '{
    "mon": {"open": "08:00", "close": "00:00"},
    "tue": {"open": "08:00", "close": "00:00"},
    "wed": {"open": "08:00", "close": "00:00"},
    "thu": {"open": "08:00", "close": "00:00"},
    "fri": {"open": "08:00", "close": "00:00"},
    "sat": {"open": "08:00", "close": "00:00"},
    "sun": {"open": "08:00", "close": "00:00"}
  }'::JSONB;

-- ---------------------------------------------------------------------------
-- 🔴 F-003, misma migración: el DEFAULT de `settings` nacía con
-- `requires_deposit: true`, o sea que cualquier tenant insertado SIN settings
-- explícitos arrancaba exigiendo seña con MercadoPago sin conectar — el estado
-- exacto que deja al jugador colgado en un `pending_payment` que expira solo.
--
-- El camino normal de alta ya estaba bien (`createTenantWithTrial` pasa
-- `DEFAULT_SETTINGS` con `requires_deposit: false`), así que esto cierra los
-- caminos que NO pasan por ahí: seeds, scripts, soporte y cualquier INSERT
-- futuro. El resto del objeto queda idéntico al DEFAULT vigente (migr. 034).
--
-- Como el de arriba: SET DEFAULT no toca ninguna fila existente.
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ALTER COLUMN settings SET DEFAULT '{
    "requires_deposit": false,
    "deposit_percentage": 30,
    "cancellation_policy": {"hours_before": 12, "penalty_type": "deposit", "penalty_amount": null},
    "accepts_cash": true,
    "accepts_transfer": true,
    "accepts_mercadopago": true,
    "allow_online_booking": true,
    "booking_advance_days": 6,
    "auto_complete_minutes": 30
  }'::jsonb;
