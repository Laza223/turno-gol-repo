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

---

## 72 warnings sin triagear en dependency-cruiser (scan inicial)

**Qué es**: [.dependency-cruiser.mjs](.dependency-cruiser.mjs) traduce las 6 zonas de `turnogol/capas-*` (`eslint.config.mjs`) al grafo real de imports (alias `@/*` y relativos, incluye `import()` dinámico) más detección de ciclos, corriendo en CI ([dependency-cruiser.yml](.github/workflows/dependency-cruiser.yml)) en `severity: 'warn'` — advisory, no bloquea. El primer scan real (2026-08-28, 1257 módulos, 5543 dependencias) dio 72 violaciones sin triagear: 31 `no-components-to-modules-app-server`, 32 `no-circular`, 8 `no-lib-to-modules`, 1 `no-shared-to-domain-server-app`.

**Por qué existe**: dependency-cruiser ve el grafo de módulos resuelto, no la anotación TS — así que un `import type` legítimo cruzando capas (permitido por ESLint vía `allowTypeImports: true`) también aparece acá como violación. Sin triage previo no se puede saber cuánto de los 72 es ruido de ese tipo vs. gap real. Ya se verificó UNO a mano: `no-shared-to-domain-server-app` en [audit.ts:41](src/shared/db/audit.ts:41) es `await import('@/modules/auth/auth.middleware')` — dinámico, invisible para el `no-restricted-imports` de ESLint (solo mira `ImportDeclaration` estático), pero intencional (comentario F16: evita acoplar el bundle del worker). Los 32 `no-circular` son mayormente el patrón barrel `index.ts` re-exportando sus propios archivos (`notifications/templates/*`), un idiom común, no necesariamente un bug. Los 31+8 restantes (`components→modules`, `lib→modules`) no se leyeron todavía.

**Costo de no resolverla ahora**: ninguno — `severity: 'warn'` no falla CI, el ruido queda en el log del job. El riesgo es que se acumule sin que nadie lo mire y la herramienta se vuelva ruido ignorado (mismo patrón que ya pasó y se resolvió con `doctor.config.mjs`).

**Costo estimado de resolverla**: medio, ~3-4h. Mismo proceso que el triage de `react-doctor` (2026-07-04): leer cada violación, clasificar falso-positivo-verificado (documentar en `ignore.overrides` si dependency-cruiser lo soporta, o dejar como excepción explícita) vs. gap real (arreglar el import). Cuando una de las 6 zonas quede 100% triageada y limpia, subirla de `'warn'` a `'error'` en `.dependency-cruiser.mjs` — mismo patrón de "trinquete" que ya usa `eslint.config.mjs`.

**Disparador de resolución**: sin fecha fija — es el mismo ciclo de vida que tuvo `doctor.config.mjs`. Buen candidato para la próxima sesión de auditoría de código o cuando el ruido en el job de CI moleste lo suficiente como para justificar la hora.

