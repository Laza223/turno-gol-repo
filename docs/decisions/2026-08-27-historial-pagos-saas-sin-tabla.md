# Historial de pagos SaaS: sin tabla nueva, leído en vivo de MercadoPago

**Fecha:** 2026-08-27
**Decide:** implementación (gap de doc-drift, `docs/audit/DOC_DRIFT_2026-08-27.md` ítem #16)
**Estado:** implementada

## El caso

`docs/spec/doc15_api_contracts.md` §5.8 documenta `GET /api/billing/invoices` (historial de
cobros de la suscripción SaaS del complejo). No existía ningún código: ni tabla, ni service, ni
route handler, ni UI.

## Qué NO había para construirlo

- `tenant_subscriptions` solo guarda el ÚLTIMO estado (`last_payment_at`, `last_payment_failed_at`)
  — no historial.
- `processed_webhooks` (`003_global_tables.sql`) es una tabla de idempotencia técnica: sin
  `tenant_id`, sin RLS, `payload` es el JSON crudo del webhook. Filtrar por tenant ahí exigiría
  parsear jsonb sin índice, y exponer una tabla global no aislada por un endpoint de tenant es un
  riesgo de por sí.
- `dunning.service.ts:onPaymentApproved/onPaymentRejected` no insertan `audit_logs` por cada
  cobro — solo actualizan `tenant_subscriptions` y encolan la notificación.

## La decisión

**Sin tabla nueva.** `listInvoices()` (`billing.service.ts`) llama
`gateway.searchPaymentsByReference(tenantId)` — ya existe, ya está probado (lo usa
`reconcile-subscriptions.worker.ts`) — y funciona porque `createPreapproval` setea
`external_reference: tenantId`, y MP propaga ese `external_reference` del preapproval a **cada**
pago recurrente que cuelga de él. Confirmado contra producción, no es una suposición: ver
`docs/superpowers/specs/2026-08-20-reconcile-subscriptions-design.md` §"El residual, y cómo
cerrarlo sin endpoints nuevos" (evento real 173833098759).

Como el ancla es el `tenantId` (estable) y no un `preapproval_id` puntual, el historial sale
completo aunque el tenant haya tenido varios preapprovals a lo largo del tiempo (cada
`cancel()`/`reactivate()` en `billing.service.ts` crea uno nuevo) — no hace falta reconstruir esa
cadena leyendo `audit_logs`.

### Descartadas

- **Tabla `subscription_payments`/`invoices` nueva.** Una tabla tenant-aislada nueva arrastra un
  costo fijo en este repo (RLS ENABLE+FORCE, filtro en `data-retention-cleanup.worker.ts`, caso en
  `isolation.test.ts` — ver CLAUDE.md, sección Migraciones). Además duplicaría un estado que MP ya
  tiene como fuente de verdad, con el riesgo de desincronizarse (el mismo problema de fondo que
  motivó `reconcile-subscriptions.worker.ts`).
- **`GET /authorized_payments/search?preapproval_id=…`.** Es el endpoint "obvio" para esto, pero
  quedó marcado como **sin verificar** en el diseño de reconcile-subscriptions (2026-08-20) — nadie
  lo probó contra la API real. Y aunque funcionara, solo cubriría el preapproval VIGENTE: un tenant
  que canceló y reactivó perdería el historial de los preapprovals anteriores.

### Alcance aceptado, no un bug

El historial deja afuera los pagos de **upgrade/proraeo**: esos usan la referencia
`saas-upgrade:<tenantId>:<planId>` (`buildSaasUpgradeRef`), no el `tenantId` pelado, así que
`searchPaymentsByReference(tenantId)` no los trae. Es exactamente lo que documenta doc15 §5.8
("historial de pagos SaaS" en el contexto de la suscripción recurrente) — si en algún momento se
quiere el historial de upgrades también ahí, hace falta una segunda búsqueda por esa referencia (y
conocer qué `planId`s se pidieron, hoy solo reconstruible desde `audit_logs`).

## Dónde queda

`billing.service.ts:listInvoices` → `src/app/api/billing/invoices/route.ts` (route handler,
`withTenant({roles:['admin']})`, mismo patrón que `/api/billing/subscription`) y
`InvoiceHistorySection.tsx` en `/settings/facturacion` (Server Component, carga directa sin pasar
por el route handler — mismo patrón que el resto de esa página).

Sin `tx`: `listInvoices` no toca la DB, solo el gateway master de billing (`getBillingGateway()`).
Si MP falla, la página degrada a `[]` en vez de romperse (mismo criterio que `getSubscriptionState`
en `page.tsx`).
