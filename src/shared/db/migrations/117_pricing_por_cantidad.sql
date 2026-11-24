-- Catálogo por cantidad exacta. Se activa después de desplegar web y workers
-- compatibles. Los mandatos existentes conservan su plan_id y su importe.
INSERT INTO plans (
  slug, name, max_courts, features, price_monthly, price_annual,
  price_first_court_cents, price_extra_court_cents, annual_discount_bps,
  is_active, sort_order
)
SELECT
  'turnogol-por-cantidad', name, NULL, features, 4500000, 3600000,
  4500000, 0, 2000, false, sort_order
FROM plans
WHERE slug = 'turnogol'
ON CONFLICT (slug) DO NOTHING;
