---
paths:
  - "src/modules/payments/**"
  - "src/modules/billing/**"
  - "src/lib/mercadopago.ts"
  - "src/app/api/webhooks/mercadopago/**"
  - "src/app/api/mp/**"
  - "src/app/api/billing/**"
  - "scripts/*mp*"
  - "scripts/billing/**"
---

# MercadoPago (única pasarela: no hay Stripe)

- **`canceled` vs `cancelled`**: los enums y columnas propios usan `canceled` (una L). Los strings que manda o recibe la **API de MercadoPago** son `cancelled` (dos L): `mp-gateway.implementation.ts`, `payment.types.ts`, `subscription-reconcile.service.ts`, `billing.service.ts` y el webhook. **No "corregirlos"**: con una L, MP no los reconoce.
- Dev/E2E: `MP_MOCK_MODE=1` en `.env.local` activa `LocalMockGateway` (`src/modules/payments/mock-mp.ts`) → checkout local en `/mock-mp/checkout`, webhook procesado inline sin pg-boss. Hard-gated a no-producción: no intentar "arreglar" ese gate.
- NUNCA llamar la API real de MP desde tests ni dev. Replay manual de webhooks: `pnpm webhook:replay`.
- Webhooks entrantes verifican firma HMAC en `src/modules/payments/webhook-auth.ts` (gotcha: `data.id` va en minúsculas al construir el manifest).
- **El manifiesto tiene ventana de antigüedad, así que ningún fixture puede firmar con un `ts` congelado.** Cada archivo que firma un webhook tiene que usar el instante actual. Los encontrás todos con `grep -rln ';ts:' tests/ scripts/`. (pasó: 2026-09-07, hardening de la auditoría integral — al agregar la ventana, cinco archivos de test que firmaban con un `ts` fijo de 2021/2023 pasaron a dar 401; dos aparecieron recién al correr la suite completa, porque correr "los tests de webhook" no alcanza para encontrarlos.)
- **El `ts` del manifiesto se normaliza a milisegundos antes de compararlo.** MercadoPago lo documenta en milisegundos, pero `scripts/replay-mp-webhook.ts` y `scripts/probe-mp-webhook-signature.ts` firman con `Math.floor(Date.now()/1000)` — segundos. Restar sin normalizar daría una antigüedad de décadas y rechazaría TODOS los avisos a la vez, incluida la sonda con la que se diagnostica producción. Toda comparación de antigüedad sobre un `ts` externo asume unidad: normalizala.
- **La ventana falla ABIERTA a propósito**: `ts` ilegible o futuro pasa; sólo rechaza con certeza de vejez, y cuando rechaza loguea `error` (no `warn`) para que llegue a Sentry. Rechazar un aviso legítimo cuesta un pago no registrado; repetir uno cuyas ramas ya son idempotentes no cuesta nada. Si ese log aparece en producción, la ventana quedó corta: ensancharla, no investigar al emisor. Racional: `docs/decisions/2026-09-07-lote3-auditoria-integral.md` D3.
- **El preapproval se crea en el momento en que el complejo toca "Activar plan", y sin `auto_recurring.start_date` MercadoPago puede cobrar YA** — aunque al complejo le queden meses de prueba. `subscribe()` manda `tenants.trial_ends_at` como `start_date`, y lo omite si esa fecha ya pasó o es nula (ahí no hay nada que diferir). Se usa `start_date` y no `free_trial` porque este último se define por duración fija y no puede alinearse con un trial que soporte extendió a una fecha arbitraria; además el SDK sólo tipa `free_trial` en las respuestas, no en el body de creación. La fecha correcta es SIEMPRE `tenants.trial_ends_at`, nunca `tenant_subscriptions.current_period_end`: esa segunda columna no se mueve cuando soporte extiende el trial. (pasó: 2026-09-07 — un complejo con 90 días de prueba quedó con una suscripción viva que podía cobrarle antes; ver `docs/decisions/2026-09-07-vagon-deportivo-horarios-y-cobro.md` D1.)

- **`PreApproval.update` REEMPLAZA el objeto `auto_recurring` entero: mandar sólo `transaction_amount` borra `start_date`.** O sea que ajustarle el monto a un complejo en prueba le adelanta el primer cobro a HOY, en medio de la prueba gratis, y nada tira error — MP devuelve 200 y el próximo cobro sale. Por eso `updatePreapprovalAmount` hace GET antes del PUT y reenvía `frequency`, `frequency_type`, `currency_id`, `start_date` y `end_date` tal como vinieron; si el GET no trae `frequency`, aborta en vez de adivinar (mandar una frecuencia inventada cambia cada cuánto se le cobra). El SDK no tipa `start_date`/`end_date` en `AutoRecurringResponse` aunque la API REST los devuelve: se leen con un cast acotado, como en `getSubscriptionState`. La misma trampa vale para cualquier PUT parcial sobre un objeto anidado de MP. (pasó: 2026-09-17, al pasar a precio por cancha — cada complejo que suma o saca una cancha pasa por esta llamada, así que dejó de ser un caso raro.)

- Llamadas salientes pasan por `withCircuitBreaker` (`src/modules/payments/mp-breaker.gateway.ts`) — no bypassearlo con un fetch directo.
- Tokens OAuth por tenant (`mp_access_token`/`mp_refresh_token`) están cifrados at-rest y el cifrado es la ÚNICA barrera (tabla `tenants` es global, sin RLS). Jamás loguearlos ni devolverlos en payloads.

## Comportamientos de la API de MP medidos en prod

- Un `payment` puede ser de la cuenta master o de la del complejo y el tipo de evento no alcanza para distinguirlos: el discriminador es `source=saas`.
- Los eventos de suscripción traen en `data.id` un hash de 32 hex, no un número.
- En un pago de suscripción, el id del preapproval viene en `point_of_interaction.transaction_data.subscription_id`, que el SDK no tipa.
- El `init_point` de un preapproval trae `&activation=true` y esa URL da 404: se le saca el parámetro.
- MP completa `auto_recurring.start_date` con la fecha de creación aunque no se mande: un fixture con `null` no representa la realidad.
- Cancelar un preapproval, aunque esté `pending` y nunca se haya pagado, manda mail al pagador y al cobrador.
- La seña se libera según el plazo configurado en la **cuenta** del complejo (0 a 70 días), no según la app.
