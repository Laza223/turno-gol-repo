---
paths:
  - "src/modules/billing/**"
  - "src/app/(business)/precios/**"
---

# Precio del SaaS

**Lineal por cancha** (decisión 2026-09-17). $47.000 la primera cancha + $30.000 por cada extra, por mes, **sin techo**; anual = 10% off. `plans` tiene **una sola fila activa** (`slug='turnogol'`, `max_courts` NULL) con `price_first_court_cents`/`price_extra_court_cents`/`annual_discount_bps`; las 3 filas viejas quedan `is_active=false`. El monto NO sale de una columna: lo calcula `src/modules/billing/pricing.ts` sobre `tenant_subscriptions.billed_courts`, que es la cantidad de canchas cargada en el preapproval de MP (no "las canchas que tiene hoy"). No hay techo de canchas: sumar una cancha se confirma y se cobra **desde el próximo mes**, nunca prorrateado. La página pública `/precios` sigue **congelada** con los 3 planes viejos a propósito (`plans-data.ts` es un snapshot de marketing, NO se sincroniza con la tabla).

Cualquier cambio de precio no cubierto por `docs/decisions/2026-09-17-precio-por-cancha.md` necesita decisión escrita del dueño: devolver "REQUIERE INPUT".
