# Decisión: cobro automático de TurnoGol Plus (Asistente de WhatsApp)

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder), que respondió P1-P11 el 2026-10-22 · **Estado:** APROBADA.

**Insumos:**
- [`2026-10-20-bot-whatsapp.md`](2026-10-20-bot-whatsapp.md), sección "Qué queda abierto";
- [board del 2026-10-21](../gtm/board/2026-10-21-recepcionista-whatsapp.md), §5-§7;
- [`2026-10-20-precio-uniforme-por-cancha.md`](2026-10-20-precio-uniforme-por-cancha.md);
- el código del cobro del plan (abajo, con archivo y línea);
- el PR #468, que trae el interruptor "TurnoGol Plus" en super-admin.

**Supera** el precio de Plus del 2026-10-21 ("piloto $20.000; cuando haya más complejos, $15.000"). Ahora la lista es de **$20.000 por cancha por mes para todos**, con un precio especial de **$15.000 para El Vagón** (P3).

**Ya decidido:** Plus es el override por complejo del flag `whatsapp_bot`, y lo prende TurnoGol desde super-admin (#468). Hasta que entre este cobro, el extra se cobra a mano.

---

## Cómo se cobra hoy el plan (medido en el código)

- **Un preapproval de MP por complejo.** Lo crea el token master con `external_reference = tenantId` (`mp-gateway.implementation.ts:279`). `tenant_subscriptions` tiene un solo `mp_subscription_id`, y `tenant_id` es UNIQUE.
- **El monto** es una función pura de `billed_courts` y del ciclo (`pricing.ts:87`, `computeSubscriptionAmount`).
- **El monto de un débito ya autorizado se cambia en el lugar** con `updatePreapprovalAmount`. Lo usa en prod el barrido de cambio de canchas (`dunning-retry.worker.ts:321`).
- **Conciliación:** cada hora, `subscription.amount_drift` compara el monto del preapproval con el monto esperado, que recalcula desde `billed_courts` (`reconcile-subscriptions.worker.ts:276`).
- **La mora es por complejo, no por preapproval.** Un cobro rechazado con `external_reference = tenantId` pasa el complejo entero a `past_due` (`dunning.service.ts:171`).
- **Trampa:** si se aprueba un cobro de un preapproval que no es el `mp_subscription_id` vigente, se **cancela** (`dunning.service.ts:318-341`). Hoy "un preapproval por complejo" es un invariante del sistema.
- **El bot respeta la mora solo a medias.**
  - Las herramientas de reserva se cierran con `isPublicPortalOpen` (`whatsapp-bot.tools.ts:95`).
  - Las respuestas no: el corte de `whatsapp-bot.turn.ts:321-324` es `enabled && connected && flag`.
  - Hoy un complejo `suspended`, `blocked` o `churned` sigue recibiendo respuestas pagas por TurnoGol. Lo corrige P8.

## P1 — Mismo débito → **APROBADO**

Plus se suma al monto del preapproval del plan: **un solo cobro por mes**, o por año si el plan es anual.

| | Mismo preapproval (elegido) | Preapproval aparte (descartado) |
|---|---|---|
| El dueño | Autoriza **un** débito. | Dos checkouts y dos cobros. |
| Conciliación | La misma: el esperado suma Plus y `amount_drift` avisa. | Hace falta un segundo barrido, otro estado y otro período. |
| Webhook | No cambia para el débito. | Necesita otra `external_reference`: con la misma, el primer cobro **se cancela solo** (`dunning.service.ts:318`). El prefijo rompe 6 comparaciones contra `tenantId` (webhook :183 y :243, conciliación :123, checkout :450, :497 y :522). |
| Mora | La de siempre: rebota todo junto. | Plus tendría su propia mora. |
| Código | Columnas en `tenant_subscriptions` y el monto en 4 lugares. | Una tabla nueva, una rama de webhook, una conciliación y una mora. |

**Lo que se asume:**
- No se puede pagar el plan sin pagar Plus.
- Prender, bajar o cambiar el precio de Plus cambia el monto del débito del plan, con `updatePreapprovalAmount` (a validar en el sandbox).

## P2 — Alta → **APROBADO: la prende TurnoGol, sin cargo de alta**

- **TurnoGol la prende** con el interruptor de super-admin. En el ciclo **mensual**, en un solo paso:
  1. marca Plus en la suscripción;
  2. sube el monto del débito, si hay uno autorizado, con "MP último y rollback";
  3. prende el bot.

  Si MP falla, no se prende nada y el interruptor muestra el error.
- **Se cobra desde el próximo débito.** Los días hasta ahí son la puesta en marcha, sin prorrateo.
- **En la prueba** no se cobra nada hasta el primer débito, que sale con Plus incluido.
- **Sin cargo de alta por sistema.** Si algún día se cobra uno, va a mano.
- En el **anual** el alta es distinta (P7).

## P3 — Precio → **APROBADO: lista de $20.000 y precio especial para El Vagón**

- **Lista:** $20.000 por cancha por mes para todos, sobre `billed_courts`, igual que el plan.
- **Precio especial por complejo:** se carga en super-admin al prender Plus.
  - El Vagón: **$15.000 por cancha, fijo**.
  - No sigue a la lista: si la lista cambia, el precio especial se revisa a mano.
  - Sirve para otro trato igual.

## P4 — Moneda y ajuste → **APROBADO: pesos, con ajuste a mano**

- Se cobra en pesos. El débito de MP en Argentina cobra en ARS (a confirmar en el sandbox).
- **El ajuste lo decide el dueño.** Se avisa 30 días antes y se aplica al débito siguiente con `scripts/billing/reprice-subscriptions.ts`, extendido para sumar Plus.
- **El aviso no va por mail en este PR:** los templates de notificaciones están congelados por RIVAL. Va como aviso en Facturación, más el mensaje directo del dueño. El mail queda para después de RIVAL.

## P5 — Permanencia → **APROBADO: sin permanencia, hasta el fin del período pago**

- La baja la pide el dueño desde Facturación o la hace TurnoGol desde super-admin.
- El débito siguiente ya no incluye Plus. El bot sigue hasta `current_period_end`, que es fin de mes o fin de año según el ciclo.
- Lo apaga el barrido diario que ya existe (`dunning-retry`).
- **Si se da de baja el plan, Plus se va con él.**

## P6 — Plan anual → **APROBADO: sí, ×12 con el 10% off**

- **El monto anual es `(plan + Plus) × 0,9 × 12`.** El descuento del anual se aplica a la suma.
- Con precio especial: `(plan + Plus especial) × 0,9 × 12`.

## P7 — Alta de Plus en un anual ya pago → **APROBADO: se cotizan los meses que faltan**

- El sistema cobra los **meses completos** que faltan hasta `current_period_end`, **redondeando para abajo**: con 5 meses y 12 días se cobran 5, y los días sueltos son la puesta en marcha.
- **Monto:** meses × precio de Plus por cancha × `billed_courts` × 0,9.
  - Ejemplo: El Vagón con 5 meses = $15.000 × 5 × 5 × 0,9 = **$337.500**.
- **La cotización se congela** cuando TurnoGol prende Plus. El dueño ve en Facturación "Pagá los N meses de Plus que faltan de tu año: $X" y paga con un link de MercadoPago (pago único, token master).
- **El bot se prende cuando MP acredita el pago:**
  - el débito anual pasa a incluir Plus desde la renovación;
  - si no paga, no cambia nada.
- **Si faltan cero meses completos**, no hay pago: Plus se prende como en el mensual y se cobra en la renovación.

## P8 — El bot en mora → **APROBADO: se calla del todo en `suspended`, `blocked` y `churned`**

- En esos estados el bot no contesta nada y los mensajes le llegan al dueño a su celular: con la coexistencia no pierde el WhatsApp.
- En `past_due` sigue igual que hoy.
- Cambia el corte de `whatsapp-bot.turn.ts`, que hoy solo mira el flag y la conexión.

## P9 — Alta en mora → **APROBADO: no**

- El interruptor solo prende Plus en `trialing` o `active`.
- En `past_due`, `suspended`, `blocked`, `canceled` y `churned` se niega con "Primero tiene que regularizar el pago".

## P10 — Precio especial $0 → **APROBADO: es un error**

El precio especial tiene que ser mayor a cero. Regalar Plus se decide aparte.

## P11 — Devolución o contracargo del pago único → **APROBADO: aviso por mail al dueño de TurnoGol**

- El sistema no apaga nada solo. Le manda un mail a los superadmins activos, que decide si apaga Plus desde super-admin.
- No alcanza con Sentry: el dueño pidió explícitamente que estas alertas le lleguen por mail.
- Reusa el mecanismo de `whatsapp-ops-alerts.service.ts`: mail con el render en el mismo service (no toca los templates congelados por RIVAL) y dedupe en `ops_alerts`.
- Por el mismo canal se avisan:
  - un pago del prorrateo con monto distinto a la cotización;
  - un débito de Plus que no refleja el monto (`amount_drift`).
- Las devoluciones las sigue haciendo TurnoGol a mano: no hay reembolso por API.

---

## Qué ve el dueño en `/settings/facturacion`

- **En el desglose de la cuota**, debajo de las canchas, una línea "TurnoGol Plus · Asistente de WhatsApp — 5 canchas × $15.000 = $75.000".
  - El total del débito suma las dos.
  - En el anual se muestra el equivalente mensual con el 10% off.
  - Sale de `buildPriceBreakdown`, la misma función que calcula el monto de MP, así que pantalla y cobro no pueden divergir.
- **Anual con pago pendiente:** "Pagá los N meses de Plus que faltan de tu año: $X", con botón a MercadoPago.
- **Con baja agendada:** "Plus activo hasta el DD/MM. El próximo débito ya no lo incluye."
- **Botón "Dar de baja Plus"**, con confirmación.
- **Historial de cobros:** un solo cobro con el total. El pago del prorrateo anual aparece como pago aparte.

## Efecto sobre El Vagón

- **Hoy:**
  - Está en prueba hasta el **2026-12-06**, sin débito cargado: su preapproval es un checkout `pending` de $99.000 que nunca pagó.
  - **Está en el piloto del bot** ([`2026-10-20-bot-whatsapp.md`](2026-10-20-bot-whatsapp.md): "El dueño del Vagón ayuda a montarlo"). El bot se le cobra **a mano**.
  - Con esta decisión su precio pasa a ser **$15.000 por cancha = $75.000 por mes** (antes $100.000).
- **Al mergear no cambia nada.** Las columnas nacen en `false`/NULL. Nada se cobra hasta que el superadmin prenda Plus con el precio especial **y** su dueño active el plan pagando el checkout.
- **Cuando active el plan** (mensual):
  - El checkout le va a mostrar **$225.000 por mes**: $150.000 del plan por 5 canchas y $75.000 de Plus.
  - El primer débito es el 2026-12-06.
  - `subscribe()` no reusa el pending de $99.000, porque el monto es distinto, y crea uno nuevo.
- **Riesgo de doble cobro:** desde el primer débito automático **hay que dejar de cobrarle el bot a mano**.
- **Si el débito rebota,** pasa a `past_due` todo junto. El bot sigue en `past_due` y se apaga en `suspended`, a los 7 días.
- **A verificar (no se puede leer prod desde acá):** si El Vagón ya tiene el override de `whatsapp_bot` prendido por SQL.
  - Ese override no marca Plus en la suscripción: el bot anda, pero el débito no lo cobra.
  - Antes del 2026-12-06 hay que pasarlo por el interruptor nuevo, con el precio de $15.000.

## Qué se implementa

- **Migración nueva** sobre `tenant_subscriptions` (número fijado contra `origin/main` al abrir el PR):
  - `plus_enabled boolean NOT NULL DEFAULT false`: Plus va en el débito.
  - `plus_price_per_court_cents integer NULL`: precio especial; NULL = lista.
  - `plus_access_until timestamptz NULL`: baja agendada.
  - `plus_prorate_cents integer NULL` y `plus_prorate_months smallint NULL`: cotización anual pendiente de pago.
- **`pricing.ts`:**
  - precio de lista de Plus;
  - monto del débito = (plan + Plus) con el descuento del ciclo;
  - cotización del prorrateo anual.

  Lo usan los 4 lugares que hoy calculan el monto: alta y reactivación (`subscriptionAmount`), conciliación, barrido de canchas y script de repricing.
- **`billing.service`:**
  - `setPlus`, que prende o baja, sube o baja el monto en MP con rollback y toca el override del flag;
  - el pago único del prorrateo anual, con `external_reference = saas-plus:<tenantId>`, que no choca con el débito;
  - la acreditación de ese pago, idempotente por id de pago.
- **Webhook:** una rama para `saas-plus:`.
  - Si está aprobado y el monto coincide con la cotización, prende Plus.
  - Si el monto no coincide, o es una devolución o un contracargo, manda el mail de P11.
  - Nunca pasa por `onPaymentApproved`, para no caer en la cancelación de `dunning.service.ts:318`.
- **Bot:** el corte de respuestas de `whatsapp-bot.turn.ts` (y el de `ingest`) exige que el complejo no esté en `suspended`, `blocked` ni `churned` (P8).
- **Interruptor:** se niega fuera de `trialing`/`active` (P9) y con un precio especial menor o igual a 0 (P10).
- **Orden de escritura:** el override del flag se escribe **después** de que MP confirme. En #468 hoy va por `getWorkerDb()`, fuera de la transacción: si MP falla, el bot no puede quedar prendido sin cobro.
- **Los 7 lugares que calculan el monto** (no 4) pasan por la misma función: `billing.service.ts:603`, `:833` y `:1017`, `dunning-retry.worker.ts:321`, `support.service.ts:383`, `reconcile-subscriptions.worker.ts:276` y `scripts/billing/reprice-subscriptions.ts:70`.
- **`dunning-retry`:** apaga el override cuando vence `plus_access_until`.
- **La baja del plan** apaga Plus.
- **Super-admin:** el interruptor de #468 llama a `setPlus`, con un campo de precio especial.
- **Facturación:**
  - la línea del desglose;
  - el pago pendiente del anual;
  - la baja agendada;
  - "Dar de baja Plus".
- **Tests:**
  - idempotencia del interruptor y del pago del prorrateo;
  - ajuste de precio: repricing y precio especial;
  - baja de Plus: el monto baja ya y el bot sigue hasta el fin del período;
  - mora: el rechazo pasa todo a `past_due` y `suspended` apaga el bot;
  - drift con Plus;
  - anual: ×12 con 10%, cotización por meses completos y prende al acreditarse.

## Pendiente para el ensayo contra el sandbox (al final de todo)

- **Débito autorizado:**
  - Que `PUT /preapproval/{id}` acepte **subir** `transaction_amount` en un débito `authorized`, y si MP pide reconfirmación al pagador o le avisa por mail.
  - Que no haya un tope de aumento.
  - Que el cobro siguiente salga con el monto nuevo.
  - Que bajar el monto no cancele ni pause el preapproval.
- **Moneda:** que el débito solo acepte `currency_id: 'ARS'`.
- **Pago único del prorrateo:**
  - Que llegue con `external_reference = saas-plus:<tenantId>` y por la URL de notificación con `source=saas`.
  - Que no lo confunda la resolución de tenant de la ruta.

## Lo que NO habilita

Cobro de alta por MP, precio en dólares, indexación automática, uso justo ni excedente por bloque de chats (board §5), y mail de aviso de precio **al complejo**, que espera a que se liberen los templates. Los avisos al dueño de TurnoGol sí van por mail (P11).
