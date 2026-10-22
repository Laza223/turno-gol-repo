# Referidos: cómo se aplica el mes cuando no es automático

**Estado: APROBADA por el dueño el 2026-10-22** — método A (devolver el cobro) y extensión automática para el checkout sin pagar. Queda condicionada a la medición S2 del sandbox, que se corre antes de aprobar el primer premio. Completa R5 de [`2026-09-26-referidos.md`](2026-09-26-referidos.md), que dejó el método manual para definir "antes del primer premio aprobado, con una prueba en el sandbox de MP".

El primer premio posible llega a fines de noviembre: el referido más temprano se da de alta en octubre, tiene 30 días de prueba y recién ahí paga su primer mes (R3).

---

## Dos premisas de R5 que no se sostienen

1. **"MP no tiene pausa ni cambio de fecha."** La API de MP sí los tiene. `PUT /preapproval/{id}` acepta `status: paused` y vuelta a `authorized`, y acepta `auto_recurring.billing_day` (solo en suscripciones mensuales). Está en la guía oficial "Gestión de suscripciones". Lo que no los tiene es **nuestro gateway** (`src/modules/payments/mp-gateway.ts`): solo crea, cancela, consulta y cambia el monto. Las opciones de R5 siguen siendo las mismas, pero pausar o mover la fecha no son imposibles: son caras, por lo que dice la sección de abajo.
2. **"El Vagón tiene un preapproval creado con primer cobro el 2026-12-06."** No es así. Se midió en producción el 2026-09-27. Su `mp_subscription_id` es un checkout `pending` de $99.000 que el dueño nunca pagó: no tiene tarjeta cargada. El 2026-12-06 es su `trial_ends_at`, y MP no tiene nada agendado para esa fecha. Cobra solo si toca "Activar plan" y paga. Ver [`../operations/2026-10-20-baja-precio-saas.md`](../operations/2026-10-20-baja-precio-saas.md).

## Las opciones para el referidor que ya tiene débito

Este es el caso de R5 que no es automático: el referidor está activo, en mora o en prueba con la tarjeta ya cargada.

### A. Devolver el cobro desde el panel de MP de la cuenta master — ELEGIDA

- **Cómo:** MP cobra el mes como siempre. Lazar entra al panel de la cuenta master, busca ese pago y lo devuelve. Después aprieta "Ya lo apliqué" en el super-admin.
- **Por qué no rompe nada:**
  - El preapproval no se toca: no hay mail de cancelación, ni de cambio de monto, ni de pausa.
  - El sistema ignora la devolución. Un pago de suscripción que vuelve como `refunded` no entra en ninguna rama del webhook. Las ramas solo actúan sobre `approved` y sobre `rejected`/`cancelled` (`mp-webhook.handler.ts:189-217` y `:249-270`). El período que ese cobro pagó queda pagado.
  - El reconcile tampoco lo mira: activa solo cuando MP muestra un cobro **más nuevo** que el último aplicado (`subscription-reconcile.service.ts:162`).
  - No hace falta código nuevo contra MP.
- **En contra:**
  - El cliente ve el cobro y, días después, la devolución en su tarjeta. Hay que avisarle antes, por WhatsApp, con la voz de la empresa.
  - Falta confirmar qué pasa con la comisión de MP en una devolución total. Se mide en el sandbox (S2) y con el primer caso real.
  - Es un paso a mano por premio. Con un tope de 6 por complejo y el volumen de hoy, alcanza.

### B. Pausar el preapproval un ciclo

- **Cómo:** `PUT status=paused` antes del cobro y `authorized` después.
- **Por qué no:**
  - El reconcile alerta cada hora con "MP dice paused y la DB no" (`subscription-reconcile.service.ts:137-139`).
  - El período local vence sin pago, así que dunning y el expire lo tratan como impago: el complejo pasa a `past_due` por el premio.
  - Para evitarlo hace falta un estado local nuevo ("bonificado") que atraviese dunning, el reconcile y el gate de acceso. Es el cambio más grande de los cuatro.
  - Falta medir en el sandbox si al reactivar MP cobra el ciclo salteado (S3).

### C. Mover la fecha del próximo cobro

- **Cómo:** `PUT auto_recurring.billing_day` o `start_date`.
- **Por qué no:**
  - `billing_day` solo existe en suscripciones mensuales: el plan anual queda afuera.
  - El período local tiene que correrse en la misma operación. Si no, choca con dunning igual que B.
  - El `PUT` reemplaza `auto_recurring` entero. Es el mismo gotcha que obliga a `updatePreapprovalAmount` a hacer un GET antes, y un error ahí cambia el monto del cliente.
  - Falta medir en el sandbox cuánto se mueve el cobro de verdad (S3).

### D. Bajar el monto un ciclo y restituirlo

- **Por qué no:**
  - MP tiene un monto mínimo distinto de cero, así que "gratis" no existe: queda un cobro chico.
  - Dispara la alerta `subscription.amount_drift` (`reconcile-subscriptions.worker.ts:226`).
  - `dunning-retry.worker.ts:319` pisa el monto cuando aplica un cambio de canchas programado. Si cae en el mismo ciclo, la restitución sale mal en silencio.
  - Son dos cambios de monto, y el cliente recibe dos mails de MP.

## Sub-reglas, si se elige A

1. **Qué cobro se devuelve:** el **próximo** cobro aprobado del referidor después de que el founder aprueba el premio. Un premio, un cobro. Si tiene tres premios aprobados, se devuelven los tres próximos cobros, uno por mes.
2. **Plan anual:** se devuelve **1/12** del cobro anual, como devolución parcial. Se verifica en S2 que MP permita la devolución parcial de un pago de suscripción.
3. **Si el referidor se da de baja antes de ese cobro**, el premio no se paga. Así lo dice la cláusula (1) de `/terminos` §7: los meses se aplican "solo mientras la cuenta del referidor esté vigente".
   - **Qué es "vigente" (decisión del dueño, 2026-10-22):** solo la baja hace perder el premio: `canceled`, `churned` o `deleted`. Un referidor en `suspended` o `blocked` sigue vigente: el premio queda `manual_pending` y espera su próximo cobro aprobado; si paga y vuelve, se le devuelve ese cobro. Lo fijan los tests 10 y 10b de `tests/integration/referrals-b3.test.ts`.
4. **`/terminos` §7** dice "se bonifica una mensualidad sobre los próximos cobros". Con A, eso sigue siendo cierto, así que el texto no cambia. Si se elige otra opción, se revisa.
5. **Qué cuenta como "primer cobro" en el código:** el primer cobro aprobado desde que el complejo tiene referidor. Si soporte le asigna referidor a un complejo que ya pagaba, el premio se marca en su próxima renovación y pasa igual por la aprobación del founder (R4). No se usa `last_payment_at` como señal porque soporte lo escribe al forzar `active` sin que haya pago.

## Referidor en prueba con un checkout que nunca cobró (El Vagón hoy)

- **R5 hoy dice:** manual, porque tiene preapproval creado.
- **Decisión (2026-10-22):** tratarlo como el caso automático.
  - Al aprobar, el sistema pregunta a MP si ese preapproval sigue `pending` sin cobros o está `cancelled`. La función `isTrialCheckoutUnpaid` ya existe en `billing.service.ts:516`. Si es así, la prueba se extiende 30 días, igual que sin preapproval.
- **Por qué es seguro:**
  - Un checkout `pending` no tiene tarjeta: MP no tiene ningún cobro agendado que mover.
  - Cuando el complejo toca "Activar plan", `subscribe()` no reusa un link cuyo `start_date` difiere de la prueba actual (`billing.service.ts:462-466`). Crea uno nuevo que arranca a cobrar al final de la prueba ya extendida.
- **Lo que no resuelve:** si alguien paga el link viejo, cobra en el acto. Ese riesgo ya existe hoy y no depende de esto: el link no se le manda nunca.

## Evidencia del sandbox

**PENDIENTE: el worktree no tiene credenciales de sandbox.** Mediciones a correr (script fuera del repo, sin imprimir tokens, `external_reference = spike-referidos-*`, coordinado con la sesión `ensayo-cobro-mp`):

| #   | Qué                                                                                 | Qué decide                                                                    |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| S1  | Preapproval mensual autorizado con la tarjeta de prueba APRO; primer cobro aprobado | Base: `next_payment_date`                                                     |
| S2  | Devolución total y parcial de ese cobro (`POST /v1/payments/{id}/refunds`)          | A: ¿el preapproval sigue `authorized` con la misma fecha? ¿acepta la parcial? |
| S3  | `paused` → `authorized`; `billing_day` corrido                                      | B y C: ¿cobra el ciclo salteado? ¿cuánto se mueve?                            |
| S4  | Monto al mínimo y restituido                                                        | D: ¿cuál es el mínimo? ¿sobrevive `start_date`?                               |
| S5  | Cancelar todo lo creado                                                             | Limpieza                                                                      |

**Lo que el sandbox no muestra:**

- el cobro del mes siguiente de verdad;
- los mails a un pagador real;
- la comisión de MP en la devolución.

Esos tres puntos se confirman con el primer premio real.

**Lo que depende de S2:** la recomendación A. El código no depende de ella. Lo único que cambia según el método es el texto que ve el founder en el super-admin y el que ve el dueño en su panel. Por eso se puede programar con el OK condicional: si S2 contradice a A, se vuelve a esta decisión antes de aprobar el primer premio.

## Efecto sobre El Vagón

- **Hoy:** nada. No es referido de nadie y no tiene débito.
- **Si un complejo que trajo paga:**
  - Lazar aprueba el premio.
  - Con la propuesta de arriba, si El Vagón sigue sin activar el plan, su prueba se corre 30 días de forma automática.
  - Si ya activó, el premio se aplica con A: le cobran el mes y se lo devuelven. Hay que avisarle antes.
