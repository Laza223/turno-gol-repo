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

---

## No hay forma de ofrecerle un plan a un solo complejo

**Qué es**: la tabla `plans` ([plans.ts](src/shared/db/schema/plans.ts)) tiene `is_active` y nada más para controlar visibilidad: un plan está prendido para todos o apagado para todos. Las dos consultas que arman el catálogo — `listActivePlans` ([billing.service.ts:92](src/modules/billing/billing.service.ts:92), pantalla del complejo) y su gemela del panel ([super-admin/tenants.service.ts:168](src/modules/super-admin/tenants.service.ts:168)) — filtran solo por `is_active = true`.

**Por qué existe**: hasta ahora los planes eran tres y públicos (Predio, Complejo, Estadio), así que un flag booleano alcanzaba. El primer caso que no entra apareció el 2026-08-28: el plan "Prueba interna — NO OFRECER" de $100/mes tiene que estar visible para que un complejo puntual se suscriba y arranque el ensayo P-02, pero no debería existir para nadie más.

**Costo de no resolverla ahora**: bajo mientras los complejos en producción sean los dos propios. El workaround es prender el plan, suscribir y apagarlo — verificado seguro para la suscripción que queda viva, porque los tres lugares que leen el plan de una suscripción en curso (`reconcile-subscriptions.worker.ts:346`, `billing.service.ts:816`, `dunning.service.ts:87`) hacen `JOIN plans` sin filtrar `is_active`. Dos agujeros conocidos: durante la ventana cualquier complejo en `trialing`/`active` que abra `/settings/facturacion` ve el plan, y **reactivar** una suscripción de un plan apagado falla con `PlanNotFoundError` porque ese camino sí pasa por `loadPlan` ([:283](src/modules/billing/billing.service.ts:283) y [:698](src/modules/billing/billing.service.ts:698)). El costo crece con el primer cliente pago real, y se vuelve bloqueante en el primer precio especial, plan heredado o piloto.

**Costo estimado de resolverla**: bajo-medio, ~2-3h. Migración nueva con una columna nullable en `plans` que apunte al tenant dueño del plan (NULL = público), las dos consultas del catálogo respetándola, y `loadPlan` aceptando el plan privado cuando el tenant coincide — eso último es lo que además arregla el caso de reactivación. Tests: catálogo de un tenant ajeno no lo lista, el dueño sí, y reactivación sobre plan privado no rompe.

**Disparador de resolución**: antes de que se suscriba el primer complejo que no sea de Lazar. Mientras tanto el workaround alcanza, y el procedimiento está escrito en [docs/qa/GUION-ENSAYOS-PLATA-2026-08-28.md](qa/GUION-ENSAYOS-PLATA-2026-08-28.md).

---

## `application.deauthorized` se descarta con 400: TurnoGol no se entera de una desvinculación

**Qué es**: MercadoPago emite `application.deauthorized` cuando un complejo revoca el permiso que le dio a TurnoGol para cobrar en su cuenta. TurnoGol no maneja ese evento — `grep` sobre [payment.schema.ts](src/modules/payments/payment.schema.ts), [mp-webhook.handler.ts](src/modules/payments/mp-webhook.handler.ts) y [el route handler](src/app/api/webhooks/mercadopago/route.ts) no devuelve una sola referencia. Además llega por el canal global del panel, sin `?tenant=` en la URL, así que el route corta con `missing tenant` (400) antes incluso de mirar la firma. Visto en el historial de webhooks de la app de Suscripciones el 2026-08-28: `400 - Fallida · application.deauthorized · 381048203 · 22/08 13:44 UTC`.

**Por qué existe**: el diseño asumió que la desvinculación se hace desde TurnoGol, donde sí hay una acción que limpia las columnas (`tenant.service.ts:367` pone `mp_connected_at = NULL`). El camino inverso —desvincular desde el panel de MercadoPago— no se contempló. El caso del 22/8 es de la cuenta del propio dueño durante la migración a dos aplicaciones, así que hoy no hay daño.

**Costo de no resolverla ahora**: ninguno mientras los complejos sean los dos propios. Con clientes reales, un complejo que revoque el permiso desde el panel de MercadoPago deja a TurnoGol creyendo que el token sigue vivo: `mp_connected_at` queda con fecha, el portal sigue exigiendo seña y el jugador se come el error recién al momento de pagar — o sea, el que descubre la desconexión es el cliente del cliente. Emparenta con F-003 de PROD_QA ("seña exigible sin MercadoPago conectado"), que sigue sin re-verificar.

**Costo estimado de resolverla**: bajo, ~2h. Aceptar el tipo en el schema del webhook y resolver el tenant por `mp_user_id` en vez de por `?tenant=` (el payload trae el user id de MercadoPago, que ya está en `tenants.mp_user_id`); al recibirlo, limpiar las columnas de MP igual que hace la desvinculación desde la UI y avisarle al dueño. Ojo con el orden del route handler: hoy el guard de tenant corre antes de validar la firma, así que hay que mover ese caso sin debilitar el guard para el resto.

**Disparador de resolución**: cuando se cierre el tema del par OAuth (`MP_CLIENT_ID` apuntando a la aplicación vieja) — decisión del dueño el 2026-08-28, para no tocar dos cosas del mismo circuito a la vez. Contexto completo en [docs/qa/GUION-ENSAYOS-PLATA-2026-08-28.md](qa/GUION-ENSAYOS-PLATA-2026-08-28.md).

---

## La devolución manual no está explicada, y la pantalla todavía promete el reembolso automático que se eliminó

**Qué es**: dos cosas del mismo tema. (a) El empty state de `/caja/devoluciones` ([PendingRefundsList.tsx:100](<src/app/(admin)/caja/devoluciones/PendingRefundsList.tsx:100>)) dice que las devoluciones pagadas por MercadoPago "aparecen una hora después: durante esa hora el sistema intenta devolverlas solo". Eso ya no es cierto: el reembolso automático por API se eliminó (PR #212) y la espera de una hora se sacó con él — el comentario de [refund.service.ts:141-150](src/modules/payments/refund.service.ts:141-150) lo dice explícitamente ("todas, desde el momento cero ... esperar una hora para mostrar una deuda que ya existe es solo esconderla"). O sea, el texto de la pantalla contradice al código que la alimenta. (b) No hay material que le explique al complejo cómo devolver de verdad: entrar a MercadoPago, ubicar el pago y usar "Devolver dinero". Es el gemelo del video que ya existe sobre los plazos de acreditación.

**Por qué existe**: el texto se escribió cuando el reembolso automático existía y era el camino principal; al eliminarlo se cambió el servicio y no la copia. El video nunca se grabó porque hasta el 2026-08-28 el circuito de Checkout Pro no había entregado un solo pago real, así que no había devolución real que mostrar.

**Costo de no resolverla ahora**: bajo con los dos complejos propios, real con clientes. El complejo lee "el sistema lo intenta solo" y espera una hora que no va a resolver nada; mientras tanto el jugador sigue sin su plata y el que queda mal es el complejo. Es la clase de detalle que erosiona la confianza justo en el flujo donde más importa.

**Costo estimado de resolverla**: (a) trivial, ~15 min — reescribir el empty state para que diga lo que el código hace. Ojo que el mismo archivo tiene más abajo ([:181-182](<src/app/(admin)/caja/devoluciones/PendingRefundsList.tsx:181-182>)) un texto que SÍ es correcto; el arreglo es alinear el de arriba con ese. (b) ~1h de grabación. **Verificar antes de grabar**: lo que TurnoGol manda a MercadoPago como `external_reference` es el UUID completo de la reserva ([mp-gateway.implementation.ts:129](src/modules/payments/mp-gateway.implementation.ts:129)), pero la pantalla de devoluciones le muestra al complejo el código corto — los primeros 8 caracteres en mayúscula ([booking-code.ts](src/lib/booking-code.ts)). Habría que confirmar en el panel real si buscar por ese código corto encuentra el pago; si no lo encuentra, el video tiene que enseñar a ubicarlo por monto y fecha, no por código.

**Disparador de resolución**: (a) en el próximo lote de fixes de UI de caja — es de 15 minutos y ya está localizado. (b) antes del primer complejo cliente, junto al resto del material de onboarding. Hay una devolución pendiente real de $100 en `complejo titi` (generada el 2026-08-28 en los ensayos) que sirve de material para grabarlo.
