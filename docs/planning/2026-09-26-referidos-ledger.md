# Referidos — ledger del esfuerzo

Decisión que lo rige: [`docs/decisions/2026-09-26-referidos.md`](../decisions/2026-09-26-referidos.md). Guiones de venta: [`docs/gtm/06-scripts.md`](../gtm/06-scripts.md) §1c, §8, §8b y §10.

Cada PR declara su efecto sobre El Vagón y espera el OK del dueño antes de mergear.

## Estado

| Paso | Qué | Estado |
|---|---|---|
| A4 | Decisión, guiones, nota en el freeze de `CLAUDE.md`, H3 y aprendizajes | mergeado (#395) |
| B1 | Migración + módulo `referrals` + landing `/r/[code]` + "Generar link" en el super-admin | mergeado (#398) |
| B2 | Atribución en el alta + "Asignar referidor" en el super-admin. Va en el mismo PR que el aviso de Hoy y el §7 de `/terminos` (rama `feat/referidos-aviso-hoy`) | implementado y verificado (revisión adversarial); falta el e2e de onboarding |
| Aviso | Franja "Obtené hasta 6 meses gratis" en Hoy (solo admin, descartable) + reglamento en `/terminos#referidos` + tope bajado a 6 (2026-09-28) | implementado, sale con B2 |
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
  Reglas: el código tiene que existir, el alta tiene que ser hasta el 2026-10-31 23:59 ART, y el complejo nuevo no puede ser el mismo referidor. Que el que se registra sea staff del referidor NO invalida el referido (decisión del dueño 2026-09-28: un segundo complejo del mismo titular cuenta si paga su suscripción). Un código inválido nunca frena un alta. El staff no se registra con Google.
- **Premio ganado:**
  - Se marca con un `UPDATE … WHERE referral_reward_status IS NULL`, idempotente, en los dos caminos de plata real: `onPaymentApproved` (`src/modules/billing/dunning.service.ts:266`) y `reconcile-subscriptions.worker.ts:426,432`.
  - Nunca va en `lifecycle.service.ts`: soporte (`support.service.ts:267,269,316`) usa esas mismas funciones sin que haya un pago.
  - La aplicación la hace un sweep después del commit, así un bug de referidos no puede frenar un cobro.
- **Aplicar el mes:**
  - Siempre lo aprueba el founder.
  - Es automático solo si el referidor está en `trialing` con `mp_subscription_id IS NULL`, y en ese caso suma 30 días de prueba.
  - Cualquier otro caso queda "pendiente manual" con aviso. El gateway no puede pausar ni reprogramar un cobro, cancelar es terminal, y `resolveFirstChargeAt` (`billing.service.ts:276-283`) ya fijó la fecha en MP.

## Verificación sin tocar la base compartida

La base local compartida (`:54322`) iba atrasada de migraciones y la usan otras sesiones. La integración de B1 se corrió en un Postgres descartable (`postgres:15-alpine` en `:54329`, con las 94 migraciones aplicadas desde cero y la 094 re-ejecutada), pasando `DATABASE_URL` explícito en el comando. Receta: memoria `validacion-aislada-postgres-descartable`.

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
| 2026-09-26 | sonnet-implementer | B1: migración, módulo, landing, super-admin | ~331k tok | Implementado; juez verde. No corrió integración: la base local compartida estaba en la migración 089. |
| 2026-09-26 | sonnet-adversarial-reviewer | Verificación fresca de B1 | ~178k tok | Aprobado con reservas: la landing usaba el parser de teléfonos de complejos en vez de `contactWhatsappUrl` 🟡, y la migración no era re-ejecutable 🟢. Los dos se arreglaron. |
| 2026-09-26 | sonnet-ux-verifier | Landing `/r/[code]` corriendo la app + stories | ~212k tok | La landing pasa todo: redirects 307, no filtra UUID ni estado, 375 px sin scroll. La story `GenerarYCopiar` no mockeaba el portapapeles y habría roto "Stories (BLOCKING)": arreglada. |
| 2026-09-28 | sonnet-implementer | Aviso de referidos en Hoy | ~200k tok | Implementado; juez verde. En 375 px el texto quedaba de una palabra por renglón: lo arregló la sesión principal. El popover de condiciones se cambió después por un link a `/terminos#referidos`. |
| 2026-09-28 | sonnet-implementer | B2: atribución en el alta + "Asignar referidor" | ~361k tok | Implementado; juez verde, `pnpm test` 443 archivos, integración B1+B2 12/12 en Postgres descartable (:54330). No existe camino de anonimización de `staff_users`, así que `signup_referral_code` no se limpia en ningún lado. |
| 2026-09-28 | sonnet-adversarial-reviewer | Verificación fresca de B2 + aviso + términos | ~157k tok | Aprobado con reservas. Única reserva 🟡: la bajada del aviso dice "que empiece a usarlo" y el premio es recién con el primer pago. Es copy que eligió el dueño el 2026-09-28, con la condición detrás de "Ver condiciones" → `/terminos#referidos`: queda así. Verificó sin hallazgos: el alta sin código no cambia, grants, fecha en UTC, aviso solo admin, validación server-side del código y el UPDATE atómico de "Asignar referidor". |
