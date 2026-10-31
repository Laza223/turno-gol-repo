---
paths:
  - "src/modules/billing/**"
  - "src/app/(business)/precios/**"
---

# Precio del SaaS

**$30.000 por cancha por mes, incluida la primera**, sin techo ni bandas. Anual: 10% de descuento, $27.000 por cancha como equivalente mensual y $324.000 por cancha por cobro anual. Decisión escrita: `docs/decisions/2026-10-20-precio-uniforme-por-cancha.md`; supera P1/P5/P6 del 17/09 para esta baja.

`plans` conserva una sola fila activa (`slug='turnogol'`, `max_courts` NULL), con primera y extra en 3.000.000 centavos y `annual_discount_bps=1000`; las tres filas viejas siguen inactivas. El importe lo calcula `src/modules/billing/pricing.ts` sobre `tenant_subscriptions.billed_courts`, nunca sobre el conteo actual de canchas online. Los cambios de cantidad son desde el próximo período, sin prorrateo. `/precios` publica la misma lista y descuento; el test `pricing-sync.test.ts` verifica sus parámetros contra DB.

Nuevas y existentes usan la baja desde el próximo cobro, respetando trial y períodos pagados. La migración 095 cambia solo el catálogo y no toca preapprovals: un débito ya autorizado sigue con su monto hasta bajarlo con `scripts/billing/reprice-subscriptions.ts` (el reconciliador lo marca como `subscription.amount_drift`). Detalle: `docs/operations/2026-10-20-baja-precio-saas.md`.

TurnoGol Plus (asistente de WhatsApp) es un extra de **$15.000 por cancha por mes** de lista (`PLUS_LIST_PER_COURT_CENTS`, decisión del 2026-10-31), en el mismo débito; un precio especial por complejo pisa la lista y cambiar la constante no toca preapprovals existentes. Detalle: `docs/decisions/2026-10-22-cobro-turnogol-plus.md`.

Otros cambios de precio necesitan decisión escrita del dueño: devolver "REQUIERE INPUT".
