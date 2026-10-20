-- Precio SaaS uniforme: $30.000 por cancha, anual 10% off.
-- Decisión: docs/decisions/2026-10-20-precio-uniforme-por-cancha.md
-- Solo cambia el catálogo. No modifica suscripciones, pruebas, períodos,
-- pendientes, pagos previos ni preapprovals de MP: un débito ya autorizado
-- sigue cobrando su monto actual (nadie paga más que hoy) hasta que se lo
-- baje con scripts/billing/reprice-subscriptions.ts; el reconciliador lo
-- marca como subscription.amount_drift mientras tanto. Un preapproval
-- pending (El Vagón) no cobra nada: su alta nueva nace al precio nuevo.
-- El guard de preapprovals vivos se sacó por decisión del dueño (2026-10-20).
BEGIN;
LOCK TABLE plans IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  catalog plans%ROWTYPE;
  effective_date date := (statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF (SELECT COUNT(*) FROM plans WHERE is_active) <> 1 THEN
    RAISE EXCEPTION 'ABORT 095: debe existir exactamente un plan activo';
  END IF;
  SELECT * INTO catalog FROM plans WHERE is_active;
  IF catalog.slug <> 'turnogol' OR catalog.max_courts IS NOT NULL
     OR catalog.price_extra_court_cents IS DISTINCT FROM 3000000
     OR catalog.annual_discount_bps IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'ABORT 095: catalogo inesperado; revisar sin sobrescribir';
  END IF;
  IF catalog.price_first_court_cents = 3000000
     AND catalog.price_monthly = 3000000 AND catalog.price_annual = 2700000 THEN
    IF NOT EXISTS (
      SELECT 1 FROM price_versions WHERE plan_id = catalog.id AND valid_until IS NULL
      AND price_first_court_cents = 3000000 AND price_extra_court_cents = 3000000
      AND annual_discount_bps = 1000 AND price_monthly = 3000000 AND price_annual = 2700000
    ) THEN RAISE EXCEPTION 'ABORT 095: historial uniforme faltante'; END IF;
    RETURN;
  END IF;
  IF catalog.price_first_court_cents IS DISTINCT FROM 4700000
     OR catalog.price_monthly <> 4700000 OR catalog.price_annual <> 4230000 THEN
    RAISE EXCEPTION 'ABORT 095: precio anterior inesperado';
  END IF;
  IF (SELECT COUNT(*) FROM price_versions WHERE plan_id = catalog.id AND valid_until IS NULL) <> 1
     OR EXISTS (SELECT 1 FROM price_versions WHERE plan_id = catalog.id AND valid_from >= effective_date) THEN
    RAISE EXCEPTION 'ABORT 095: vigencia historica inesperada';
  END IF;
  UPDATE price_versions SET valid_until = effective_date
  WHERE plan_id = catalog.id AND valid_until IS NULL;
  UPDATE plans SET price_first_court_cents = 3000000, price_extra_court_cents = 3000000,
    price_monthly = 3000000, price_annual = 2700000 WHERE id = catalog.id;
  INSERT INTO price_versions (
    plan_id, price_monthly, price_annual, price_first_court_cents,
    price_extra_court_cents, annual_discount_bps, valid_from, reason
  ) VALUES (
    catalog.id, 3000000, 2700000, 3000000, 3000000, 1000, effective_date,
    'Precio uniforme: $30.000 por cancha, anual 10% off. Decision del dueno: docs/decisions/2026-10-20-precio-uniforme-por-cancha.md'
  );
END $$;
COMMIT;
