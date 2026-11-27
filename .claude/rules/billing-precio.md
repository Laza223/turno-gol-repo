---
paths:
  - "src/modules/billing/**"
  - "src/app/(business)/precios/**"
---

# Precio del SaaS

**Desde la activación de la migración 117:** una lista por cantidad exacta de 1 a 7 canchas, 20% anual prepago y cotización para 8+. El importe sale del catálogo asignado a cada suscripción y de las canchas facturadas. La web y los nuevos checkouts cambian al activar la fila del catálogo. Las suscripciones anteriores se actualizan individualmente desde Superadmin. El cobro de Plus queda limitado al complejo piloto hasta completar el circuito de Kapso. [Decisión y activación](../../docs/decisions/2026-11-23-precio-por-cantidad.md).

**Modelo vigente (2026-11-27, [decisión](../../docs/decisions/2026-11-27-prueba-30-dias-y-precios.md)):** sin freemium, prueba de 30 días; bot de WhatsApp a $50.000 por mes fijo por complejo (provisorio). El código todavía tiene plan gratis, `TRIAL_DAYS = 14` y la escala del bot por cantidad de canchas de `pricing.ts`: cambiarlo es una tarea propia, no se hace de paso.

## Catálogo anterior y mandatos que lo conservan

`pricing.ts` sigue calculando el catálogo lineal (`slug='turnogol'`) para los mandatos que lo tienen asignado: precio por cancha sobre `tenant_subscriptions.billed_courts`, nunca sobre el conteo actual de canchas online, con 10% anual ([decisión del 20/10](../../docs/decisions/2026-10-20-precio-uniforme-por-cancha.md)). Los cambios de cantidad rigen desde el próximo período, sin prorrateo. `pricing-sync.test.ts` verifica los parámetros contra la DB. Cambiar el catálogo no toca preapprovals: un débito ya autorizado sigue con su monto hasta reprocesarlo con `scripts/billing/reprice-subscriptions.ts` (el reconciliador lo marca como `subscription.amount_drift`). Detalle: `docs/operations/2026-10-20-baja-precio-saas.md`.

En ese catálogo, TurnoGol Plus es $15.000 por cancha por mes de lista (`PLUS_LIST_PER_COURT_CENTS`), en el mismo débito; un precio especial por complejo pisa la lista. Detalle: `docs/decisions/2026-10-22-cobro-turnogol-plus.md`.

Otros cambios de precio necesitan decisión escrita del dueño: devolver "REQUIERE INPUT".
