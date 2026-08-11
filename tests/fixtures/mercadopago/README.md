# Fixtures MP-WEBHOOK-001

Payloads sintéticos (NO son webhooks reales capturados de MercadoPago — no tenemos
acceso a tráfico real de producción) con el shape exacto de
`webhookPayloadSchema` (`src/modules/payments/payment.schema.ts`). Sirven de
input a `scripts/replay-mp-webhook.ts`.

## Por qué `data.id` es un placeholder

El body del webhook de MP **no** trae el estado del pago — solo `id` (evento,
idempotencia) y `data.id` (id de pago). El estado real (`approved` /
`pending` / `refunded` / ...) lo resuelve el handler llamando
`gateway.getPaymentStatus(data.id)` contra la API real de MP
(`src/modules/payments/mp-webhook.handler.ts:113`). El nombre del fixture
(`payment-approved.json`, etc.) documenta la intención del escenario, no un
valor que el JSON pueda forzar por sí solo.

Para que el escenario se cumpla de verdad, sobreescribí `data.id` al correr
el harness (`--data-id <id>`) con uno de estos dos caminos:

- **Staging con `MP_MOCK_MODE=1`**: usá un id con el formato del gateway mock
  (`src/modules/payments/mock-mp.ts:30`), p. ej.
  `MOCK-APPROVED-<bookingId>` / `MOCK-REJECTED-<bookingId>`, con un
  `bookingId` real de una reserva `pending_payment` en el tenant target. No
  pega contra MP real. **OJO**: con `MP_MOCK_MODE=1`,
  `verifyWebhookSignature` devuelve `true` sin chequear nada
  (`webhook-auth.ts:22`) — este modo NO ejercita la verificación de firma ni
  el bypass secret, solo la lógica de negocio (idempotencia, tenant
  cross-check, efectos del booking).
- **Staging con `MP_MOCK_MODE=0`** (para ejercitar la firma real +
  `MP_WEBHOOK_TEST_BYPASS_SECRET` de punta a punta): necesitás un id de pago
  real en el ambiente sandbox/test de MP asociado al `MP_CLIENT_ID` de
  staging. No lo tenemos documentado en este repo — coordinar con quien
  administre la cuenta MP de test antes de correr este modo.

## Archivos

| Fixture                          | Escenario pensado                       | Uso típico                                                                                                 |
| -------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `payment-approved.json`          | pago aprobado → confirma seña / booking | smoke test feliz                                                                                           |
| `payment-pending.json`           | pago pendiente → sin efectos, no-op     | confirma que no hay side effects prematuros                                                                |
| `payment-refunded.json`          | pago devuelto                           | ruta de reembolso/dunning                                                                                  |
| `payment-invalid-signature.json` | mismo shape que "approved"              | el harness lo firma A PROPÓSITO con un secret incorrecto (`--scenario invalid-signature`) para asertar 401 |

## Idempotencia / tenant cruzado

No son fixtures separados — son _modos_ del harness sobre estos mismos
archivos:

- `--repeat N` reenvía el mismo `id` de evento N veces (idempotencia).
- `--tenant <claimedId> --cross-tenant-owner <ownerId>` reclama un tenant
  distinto del dueño real de la reserva/pago (tenant cruzado).

Ver `scripts/replay-mp-webhook.ts --help`.
