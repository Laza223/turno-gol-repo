-- ============================================================
-- 090_precio_por_cancha_aditiva.sql
--
-- Precio LINEAL POR CANCHA, parte 1 de 2 (aditiva e INERTE).
-- Decisión: docs/decisions/2026-09-17-precio-por-cancha.md (supera a D3 de
-- 2026-09-02-experimento-30-dias.md).
--
--   $47.000 la primera cancha + $30.000 por cada extra, por mes. Sin techo.
--   Anual: 10% off (antes 20%).
--
-- NADA de lo que agrega esta migración cambia un monto cobrado hoy. La fila
-- nueva de `plans` nace con is_active = false, así que ningún código existente
-- la ve (loadPlan/listActivePlans filtran is_active = true). El "flip" que la
-- activa y apaga las 3 viejas va en la 091, en el MISMO PR que el código que
-- sabe leer las columnas nuevas (src/modules/billing/pricing.ts).
--
-- Por qué partida en dos: si is_active se activara acá, cualquier instante en
-- que corra el código VIEJO — que calcula el monto con price_monthly plano —
-- mientras esta fila ya es la activa, le cobraría $47.000 a un complejo de 8
-- canchas. Separarlas ACHICA esa ventana, pero no la cierra: las dos van en el
-- mismo merge, y la migración a producción suele terminar antes que el build
-- de Vercel. Quedan unos minutos en que el código viejo ve una sola fila
-- activa ($47.000 fijos). Solo cobra mal si alguien activa su cuota justo en
-- esos minutos; se acepta porque al mergear no hay nadie en ese paso, y se
-- verifica después del merge en audit_logs (subscription.subscribe_initiated o
-- subscription.reactivate_initiated en la
-- ventana del deploy). El orden inverso (código nuevo, schema viejo) falla
-- cerrado: loadActivePlan tira PlanNotFoundError, no cobra.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + INSERT con guard NOT EXISTS +
-- backfill condicionado a IS NULL.
--
-- Corre como `postgres`: la migr. 085 le revocó INSERT/UPDATE/DELETE sobre
-- plans y price_versions al rol de la app (turnogol_app).
-- ============================================================

-- ── plans: parámetros del precio lineal ─────────────────────────────────────
-- Nullable a propósito: solo la fila 'turnogol' los usa. Las 3 filas legacy
-- quedan con NULL y is_active = false.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_first_court_cents integer;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_extra_court_cents integer;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS annual_discount_bps integer;

COMMENT ON COLUMN plans.price_first_court_cents IS
  'Centavos ARS/mes de la primera cancha. Solo tiene sentido en la fila slug=turnogol; NULL en las 3 filas legacy (predio/complejo/estadio), que quedan is_active=false desde la 091.';
COMMENT ON COLUMN plans.price_extra_court_cents IS
  'Centavos ARS/mes por cada cancha además de la primera. El monto total NO está en ninguna columna: lo calcula src/modules/billing/pricing.ts sobre tenant_subscriptions.billed_courts.';
COMMENT ON COLUMN plans.annual_discount_bps IS
  'Descuento del ciclo anual en basis points (1000 = 10 por ciento). Reemplaza el 20 por ciento que antes era convención a mano en las migraciones y texto hardcodeado en la UI.';

-- ── price_versions: mismas columnas (histórico insert-only) ─────────────────
ALTER TABLE price_versions ADD COLUMN IF NOT EXISTS price_first_court_cents integer;
ALTER TABLE price_versions ADD COLUMN IF NOT EXISTS price_extra_court_cents integer;
ALTER TABLE price_versions ADD COLUMN IF NOT EXISTS annual_discount_bps integer;

-- ── tenant_subscriptions.billed_courts ─────────────────────────────────────
-- La pieza central del modelo nuevo. Expand-contract en una sola migración
-- (nullable -> backfill -> NOT NULL) porque la tabla tiene una fila por
-- tenant: no hay volumen que proteger con un ALTER separado.
ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS billed_courts integer;

-- Backfill con las canchas ONLINE reales de cada complejo — mismo criterio que
-- countOnlineCourts() (billing.service.ts) y getCourtCountAndLimit()
-- (court.service.ts): una cancha apagada no genera reservas ni ingresos.
-- GREATEST(1, ...) porque el piso del modelo es una cancha: no existe el
-- complejo de cero canchas pagando cero.
UPDATE tenant_subscriptions ts
SET billed_courts = GREATEST(
  1,
  (SELECT COUNT(*)::int FROM courts c WHERE c.tenant_id = ts.tenant_id AND c.status = 'online')
)
WHERE billed_courts IS NULL;

ALTER TABLE tenant_subscriptions ALTER COLUMN billed_courts SET DEFAULT 1;
ALTER TABLE tenant_subscriptions ALTER COLUMN billed_courts SET NOT NULL;

COMMENT ON COLUMN tenant_subscriptions.billed_courts IS
  'Canchas sobre las que está calculado el cobro VIGENTE, o sea lo que está cargado en el preapproval de MercadoPago. NO es cuántas canchas tiene hoy (eso es courts WHERE status=online): solo se mueve cuando un cambio confirmado se aplica al cierre del período.';

-- ── tenant_subscriptions.pending_billed_courts ─────────────────────────────
-- Reemplaza la semántica de pending_plan_change, que no se puede reusar:
-- es uuid REFERENCES plans.id, tipo incompatible con integer. La vieja queda
-- deprecada y sin escritores desde la 091; se dropea en una migración de
-- contracción posterior, después de confirmar en prod que nada la lee.
ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS pending_billed_courts integer;

COMMENT ON COLUMN tenant_subscriptions.pending_billed_courts IS
  'Cambio agendado: a cuántas canchas pasa el cobro en pending_change_at. NULL = sin cambio pendiente. Sumar o sacar una cancha nunca se cobra prorrateado: se aplica en el próximo ciclo (decisión 2026-09-17, P4).';
COMMENT ON COLUMN tenant_subscriptions.pending_plan_change IS
  'DEPRECADA (090/091, precio por cancha): ya no se escribe. La reemplaza pending_billed_courts. Se mantiene hasta confirmar que ningún job ni reporte la lee; DROP en una migración de contracción posterior.';

-- ── La fila del precio lineal, INACTIVA hasta la 091 ───────────────────────
INSERT INTO plans (
  name, slug, max_courts, price_monthly, price_annual,
  price_first_court_cents, price_extra_court_cents, annual_discount_bps,
  is_active, sort_order
)
SELECT
  'TurnoGol', 'turnogol',
  NULL,      -- max_courts: sin techo. Agregar una cancha no se bloquea, cuesta más.
  4700000,   -- price_monthly: valor de REFERENCIA (una cancha). Columna NOT NULL
             -- heredada del modelo de bandas; NINGÚN código nuevo la usa para
             -- calcular un cobro. Se dropea en la migración de contracción.
  4230000,   -- price_annual: equivalente MENSUAL con 10% off ($42.300). Mismo
             -- criterio que las filas legacy: el cobro anual real es este
             -- número por 12. También solo referencia.
  4700000,   -- price_first_court_cents: $47.000
  3000000,   -- price_extra_court_cents: $30.000
  1000,      -- annual_discount_bps: 10%
  false,     -- is_active: la 091 la prende, junto con el código que sabe leerla.
  0
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'turnogol');

-- Versión histórica de la regla (mismo patrón que 007/043/071).
INSERT INTO price_versions (
  plan_id, price_monthly, price_annual,
  price_first_court_cents, price_extra_court_cents, annual_discount_bps,
  valid_from, reason
)
SELECT
  p.id, p.price_monthly, p.price_annual,
  p.price_first_court_cents, p.price_extra_court_cents, p.annual_discount_bps,
  DATE '2026-09-17',
  'Precio lineal por cancha: $47.000 la primera + $30.000 por cada extra, sin techo, anual 10% off. Reemplaza las 3 bandas de la migr. 071. Decisión del dueño: docs/decisions/2026-09-17-precio-por-cancha.md'
FROM plans p
WHERE p.slug = 'turnogol'
  AND NOT EXISTS (
    SELECT 1 FROM price_versions pv
    WHERE pv.plan_id = p.id AND pv.valid_from = DATE '2026-09-17'
  );
