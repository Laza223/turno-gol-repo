# Referidos — ledger del esfuerzo

Decisión que lo rige: [`docs/decisions/2026-09-26-referidos.md`](../decisions/2026-09-26-referidos.md). Guiones de venta: [`docs/gtm/06-scripts.md`](../gtm/06-scripts.md) §1c, §8, §8b y §10.

Cada PR declara su efecto sobre El Vagón y espera el OK del dueño antes de mergear.

## Estado

| Paso | Qué | Estado |
|---|---|---|
| A4 | Decisión, guiones, nota en el freeze de `CLAUDE.md`, H3 y aprendizajes | PR abierto |
| B1 | Migración + módulo `referrals` + landing `/r/[code]` + "Generar link" en el super-admin | pendiente |
| B2 | Atribución en el alta + "Asignar referidor" en el super-admin | pendiente |
| B3 | Premio ganado en el primer pago real + sweep + aprobación y aplicación en el super-admin | pendiente |
| B4 | Panel del dueño `/settings/invitar` | pendiente |
| Spike | Sandbox de MP: cómo saltear un cobro de una suscripción activa (necesario antes del primer premio manual; El Vagón cobra el 2026-12-06) | pendiente |

## Diseño (verificado contra el código el 2026-09-26)

- **Código opaco por complejo**, no el slug. Lo emite el dueño desde su panel o el super-admin con su OK.
- **Datos:**
  - En `tenants`: `referral_code` (único), `referred_by_tenant_id`, `referral_reward_status` y `referral_reward_at`, los dos últimos en la fila del referido.
  - En `staff_users`: `signup_referral_code`.
  - Una sola migración en B1; el número se recalcula contra `origin/main`.
  - `data-retention-cleanup.worker.ts` anonimiza también estas columnas.
  - Toda query sobre `tenants`, que no tiene RLS, proyecta columnas explícitas.
- **Atribución**, que sobrevive a confirmar el mail en otro dispositivo:
  1. `/register?ref=`, más localStorage por si navegó el sitio.
  2. `signUpStaff` lo guarda en `options.data`, o sea en `user_metadata`.
  3. `provisionAndRouteStaff` lo copia a `staff_users`, solo cuando crea la fila.
  4. `createTenantAction` lo lee igual que el teléfono (`getStaffContact`, `src/app/onboarding/actions.ts:85`).

  `extractAuthUser` solo lee `app_metadata`, así que `createTenantAction` no ve `user_metadata`.
  Reglas: el código tiene que existir, el alta tiene que ser hasta el 2026-10-31 23:59 ART, y el que se registra no puede ser staff del referidor. Un código inválido nunca frena un alta. El staff no se registra con Google.
- **Premio ganado:**
  - Se marca con un `UPDATE … WHERE referral_reward_status IS NULL`, idempotente, en los dos caminos de plata real: `onPaymentApproved` (`src/modules/billing/dunning.service.ts:266`) y `reconcile-subscriptions.worker.ts:426,432`.
  - Nunca va en `lifecycle.service.ts`: soporte (`support.service.ts:267,269,316`) usa esas mismas funciones sin que haya un pago.
  - La aplicación la hace un sweep después del commit, así un bug de referidos no puede frenar un cobro.
- **Aplicar el mes:**
  - Siempre lo aprueba el founder.
  - Es automático solo si el referidor está en `trialing` con `mp_subscription_id IS NULL`, y en ese caso suma 30 días de prueba.
  - Cualquier otro caso queda "pendiente manual" con aviso. El gateway no puede pausar ni reprogramar un cobro, cancelar es terminal, y `resolveFirstChargeAt` (`billing.service.ts:276-283`) ya fijó la fecha en MP.

## Tests que no pueden faltar

- Si soporte fuerza `active`, no hay premio.
- Webhook y reconcile sobre el mismo pago dan un solo premio.
- Un referidor con suscripción en MP nunca se extiende solo.
- El tope es de 12 por año.
- Un código vencido o propio no atribuye.
- Un alta con código inválido termina igual.
- Un complejo sin referidor no cambia nada en el cobro.
- Un error en referidos no frena el cobro.

## Delegaciones

| Fecha | Agente | Finalidad | Costo | Resultado |
|---|---|---|---|---|
| 2026-09-26 | Explore (sonnet) | Mapa del alta hasta la creación del complejo | ~158k tok | No existe atribución. `user_metadata` sobrevive a la confirmación. `extendTrial` solo funciona en `trialing`. |
| 2026-09-26 | Explore (sonnet) | Mapa del cobro del SaaS con MP | ~202k tok | El gateway no puede saltear un cobro. No hay descuentos ni créditos. |
| 2026-09-26 | Explore (sonnet) | Panel admin y convenciones de DB | ~141k tok | Ajustes por carpetas, última migración 093, `tenants` global sin RLS. |
| 2026-09-26 | Plan (sonnet) | Revisar y completar el diseño | s/d | 8 correcciones incorporadas. Una refutada: `dunning.service.ts` no lee `last_payment_at` antes de activar, así que la señal pasó a ser el UPDATE idempotente. |
