-- ============================================================
-- 007_seed_data.sql
-- Datos semilla: 3 planes SaaS + price_versions inicial (doc13 §5).
-- Precios en centavos ARS.
-- ============================================================

INSERT INTO plans (slug, name, max_courts, price_monthly, price_annual, sort_order, features) VALUES
  (
    'predio',
    'Predio',
    3,
    4700000,   -- $47.000 ARS / mes
    3760000,   -- $37.600 ARS / mes (annual = 20% off)
    1,
    '{
      "history_months": 6,
      "export_formats": ["csv"],
      "api_access": false,
      "support_channels": ["email"]
    }'::JSONB
  ),
  (
    'complejo',
    'Complejo',
    6,
    7400000,   -- $74.000 ARS / mes
    5920000,   -- $59.200 ARS / mes
    2,
    '{
      "history_months": 12,
      "export_formats": ["csv", "xlsx"],
      "api_access": false,
      "support_channels": ["email", "whatsapp"]
    }'::JSONB
  ),
  (
    'estadio',
    'Estadio',
    NULL,      -- ilimitado
    10100000,  -- $101.000 ARS / mes
    8080000,   -- $80.800 ARS / mes
    3,
    '{
      "history_months": 24,
      "export_formats": ["csv", "xlsx", "pdf"],
      "api_access": true,
      "support_channels": ["email", "whatsapp", "phone"]
    }'::JSONB
  );

-- Versión inicial de precios (auditoría / Fix #4 doc).
INSERT INTO price_versions (plan_id, price_monthly, price_annual, valid_from, reason)
SELECT
  id,
  price_monthly,
  price_annual,
  '2026-04-01'::DATE,
  'Precio de lanzamiento'
FROM plans;

-- \echo '007_seed_data.sql aplicado: 3 planes + 3 price_versions'
