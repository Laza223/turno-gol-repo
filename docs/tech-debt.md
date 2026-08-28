# Deuda técnica — TurnoGol

Ledger de deuda registrada (`código anda pero el costo de mantenerlo crece`), no backlog de features.
Formato por entrada: qué / por qué existe / costo de no resolver / costo de resolver / disparador.
Revisar en cada retrospectiva del esfuerzo relacionado — ver skill `deuda-tecnica`.

---

## `searchPaymentsByReference` sin paginación

**Qué es**: [mp-gateway.implementation.ts:204-214](src/modules/payments/mp-gateway.implementation.ts:204-214) llama `new Payment(this.config).search(...)` sin `limit`/`offset`. `PaymentSearchOptions` (SDK `mercadopago@2.13.0`, `search/types.d.ts:174`) soporta paginación y la respuesta trae `paging: {total, limit, offset}` — hoy no se lee.

**Por qué existe**: los dos consumidores reales de hoy no la necesitan — [reconcile-subscriptions.worker.ts:200](src/shared/jobs/workers/reconcile-subscriptions.worker.ts:200) solo quiere el `approved` más reciente (`sort: date_created, criteria: desc`, toma `[0]`), y [reconcile-pending-payments.worker.ts:72](src/shared/jobs/workers/reconcile-pending-payments.worker.ts:72) / [mp-reconcile.service.ts:71](src/modules/payments/mp-reconcile.service.ts:71) buscan por booking individual (resultado chico). No es descuido: nunca hizo falta.

**Costo de no resolverla ahora**: ninguno hoy. Crece con la antigüedad de cada tenant — un historial de facturación SaaS completo (`GET /api/billing/invoices`, spec'd en doc15 §5.8, **sin implementar todavía**: no existe route handler ni Server Action) se vería incompleto sin aviso una vez que un tenant acumule más cobros mensuales que el límite de página default de MP.

**Costo estimado de resolverla**: bajo, ~1-2h. Loop interno sobre `paging.total` en `searchPaymentsByReference`, sin cambiar la firma (los 2 consumidores actuales no necesitan enterarse). No agregar parámetro de paginación explícito salvo que un consumidor futuro sí necesite control de página.

**Disparador de resolución**: cuando se implemente `GET /api/billing/invoices` / `listInvoices` (doc15 §5.8) — recién ahí hay un consumidor real que necesita el historial completo, no solo el último pago.

