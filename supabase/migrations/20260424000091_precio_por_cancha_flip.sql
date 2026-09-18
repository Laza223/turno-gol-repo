-- ============================================================
-- 091_precio_por_cancha_flip.sql
--
-- Precio LINEAL POR CANCHA, parte 2 de 2: EL FLIP.
-- Decisión: docs/decisions/2026-09-17-precio-por-cancha.md
--
-- Corre en el MISMO PR y el MISMO deploy que el código que sabe calcular el
-- precio lineal (src/modules/billing/pricing.ts + billing.service.ts). NUNCA
-- sola: ver el comentario de la 090 sobre la ventana de cobro incorrecto.
--
-- A partir de acá:
--   * plans.slug='turnogol' es la ÚNICA fila is_active = true.
--   * las 3 bandas viejas quedan inactivas (no borradas).
--   * toda suscripción existente apunta a la fila única.
--
-- SALVAGUARDA DE PLATA (decisión P5: ninguna suscripción con cobro activo
-- cambia de monto). Si al ejecutarse existiera una suscripción que MercadoPago
-- ya cobra cuyo monto recalculado difiera del que tiene hoy, la migración
-- ABORTA y no cambia nada. Esta migración puede ejecutarse más tarde que hoy, y
-- el guard no depende de que alguien se acuerde de re-verificar.
--
-- Quedan FUERA del guard, a propósito:
--   * trialing: todavía no se cobró un peso. El dueño decidió que el complejo
--     en prueba (El Vagón) pase al precio nuevo sin tocarle la prueba (P5); su
--     preapproval se ajusta a mano después del merge. Sin esta exclusión el
--     guard abortaba en producción justamente por él, y como el código nuevo
--     se deploya igual, el cobro quedaba roto (loadActivePlan agarraba una
--     banda vieja sin parámetros lineales).
--   * canceled / churned: no hay cobro que proteger. Un preapproval que haya
--     quedado vivo en MP no lo toca esta migración, que no habla con MP.
-- ============================================================

DO $$
DECLARE
  desajustadas integer;
BEGIN
  SELECT COUNT(*) INTO desajustadas
  FROM tenant_subscriptions ts
  JOIN plans viejo ON viejo.id = ts.plan_id AND viejo.slug <> 'turnogol'
  WHERE ts.mp_subscription_id IS NOT NULL
    AND ts.status NOT IN ('trialing', 'canceled', 'churned')
    AND (
      -- equivalente mensual que se le está cobrando hoy
      CASE WHEN ts.billing_cycle = 'annual' THEN viejo.price_annual ELSE viejo.price_monthly END
      <>
      -- equivalente mensual con la regla lineal, sobre billed_courts (090)
      CASE
        WHEN ts.billing_cycle = 'annual'
          THEN ROUND((4700000 + GREATEST(0, ts.billed_courts - 1) * 3000000) * 0.90)
        ELSE (4700000 + GREATEST(0, ts.billed_courts - 1) * 3000000)
      END
    );

  IF desajustadas > 0 THEN
    RAISE EXCEPTION
      'ABORT 091: % suscripcion(es) con cobro activo cambiarian de monto con el precio lineal. Resolver a mano (grandfathering explicito) antes de reintentar.',
      desajustadas;
  END IF;
END $$;

-- Apagar las 3 bandas. NO se borran: hay price_versions con FK a su id y
-- audit_logs.metadata que las referencian por id como texto. Borrarlas
-- rompería la trazabilidad histórica sin ganar nada.
UPDATE plans SET is_active = false WHERE slug IN ('predio', 'complejo', 'estadio');

-- Cerrar la vigencia de sus price_versions (mismo patrón que la migr. 071).
UPDATE price_versions pv
SET valid_until = DATE '2026-09-17'
FROM plans p
WHERE pv.plan_id = p.id
  AND p.slug IN ('predio', 'complejo', 'estadio')
  AND pv.valid_until IS NULL;

-- Prender la fila lineal.
UPDATE plans SET is_active = true WHERE slug = 'turnogol';

-- Repuntar las suscripciones existentes a la fila única. Con el guard de
-- arriba en verde, esto es un cambio de puntero sin cambio de monto.
UPDATE tenant_subscriptions ts
SET plan_id = (SELECT id FROM plans WHERE slug = 'turnogol'),
    updated_at = NOW()
WHERE ts.plan_id <> (SELECT id FROM plans WHERE slug = 'turnogol');
