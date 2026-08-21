# Diseño — worker `reconcile-subscriptions`

Estado: **IMPLEMENTADO** (v3). D2 y D3 aprobados por el dueño y adentro.
Fecha: 2026-08-20 · Rama: `claude/stoic-wozniak-5c6716` · Base: `b1a11d35` (PR #180)

> **Qué quedó afuera a propósito**: los $100 de la operación 173833098759 (§8 D1
> punto *a*) siguen sin resolver — es plata ya cobrada, se decide aparte. El
> worker de acá en adelante alerta ese caso en vez de arrastrarlo en silencio.

> **Diferencias entre lo diseñado y lo implementado** (lo que cambió al escribir
> el código, no al planearlo):
> - `buildSubscriptionChargeKey` se centralizó en `subscription-reconcile.service.ts`
>   en vez de repetir el formato en cada caller: dos formas de armar la misma
>   clave serían un cobro duplicado silencioso.
> - `searchPaymentsByReference` ahora propaga `preapprovalId`, para poder
>   distinguir cuál de los pagos del complejo es del preapproval vigente.
> - El worker calcula la decisión **dos veces**: una preliminar sobre la fila del
>   barrido (sólo para saber si hace falta el segundo viaje a MP) y la definitiva
>   sobre la fila ya lockeada, que es la que manda.

> **v2 (rebase sobre main).** La v1 se escribió sobre `f6f633b1` (#176) y quedó
> vieja en 4 commits. Cambios de fondo respecto de la v1:
> **(a)** el 🔴 R1 —`getPaymentStatus` con el id de la factura— era real, está
> **confirmado con evidencia de producción** y **ya cerrado** por #179/#180;
> **(b)** el canal real de MP no es `subscription_authorized_payment` sino
> `payment`; **(c)** el R2 ("`summarized` sin verificar") quedó **cerrado**
> midiendo la cuenta viva; **(d)** el residual de idempotencia del §6 ahora se
> cierra **sin endpoints nuevos**, con `searchPaymentsByReference` que ya existe.

---

## 0. En criollo, antes del detalle

Cuando un complejo paga la suscripción de TurnoGol, MercadoPago nos avisa con un
webhook. Ese aviso es el único camino por el que la suscripción pasa de "en
prueba" a "activa". Si el aviso se pierde —MP agota reintentos, el deploy estaba
caído, o un bug lo rechazaba— el complejo paga todos los meses y para TurnoGol
sigue en prueba. Peor: a los pocos días `expire-trials` le vence la prueba y lo
apaga.

Este worker es la **red de rescate**: cada hora le pregunta a MercadoPago "¿este
complejo te está pagando de verdad?" y, si la respuesta es sí, arregla la fila
sin esperar ningún webhook. Existe el equivalente para las señas de reserva
(`reconcile-pending-payments.worker.ts`); para las suscripciones no había nada.

La técnica se llama **reconciliación por convergencia**: en vez de "re-actuar el
evento perdido" (replay), el worker calcula el estado que la fila *debería*
tener según MP y lo escribe en absoluto. Correrlo dos veces da el mismo
resultado que correrlo una — que es lo que hace seguro a un reconciliador.

**Y no es hipotético.** El 2026-08-20, con dinero real, pasó exactamente esto
(§2). Los detalles están abajo; el resumen es: MP cobró $200 en dos cobros y
TurnoGol acreditó $100.

---

## 1. Premisas verificadas (código leído sobre `b1a11d35`, no supuesto)

| # | Premisa | Evidencia |
|---|---|---|
| 1 | El escritor de `trialing → active` es uno solo | `onPaymentApproved` → [lifecycle.service.ts:53](src/modules/billing/lifecycle.service.ts:53) `transitionTrialingToActive`. Desde #180 se llega por **dos** ramas del handler (`subscription_authorized_payment` y `payment` ligado a preapproval), pero la función que escribe sigue siendo una |
| 2 | No hay reconciliador de suscripciones | 16 workers en `src/shared/jobs/workers/`; ninguno toca `tenant_subscriptions` salvo `dunning-retry` (escala hacia abajo) y `expire-trials` (apaga) |
| 3 | El gateway ya tiene helper REST con el token master | [mp-gateway.implementation.ts:322](src/modules/payments/mp-gateway.implementation.ts:322) `private async mpGet(path)` — **ya existe** (lo introdujo #179; la v1 proponía extraerlo) |
| 4 | El trial vencido apaga al que pagó | [expire-trials.worker.ts:149](src/shared/jobs/workers/expire-trials.worker.ts:149) `trial_ends_at < NOW()` → `blocked` ([:162](src/shared/jobs/workers/expire-trials.worker.ts:162)), sin mirar MP |
| 5 | El webhook serializa con `FOR UPDATE OF ts` | [dunning.service.ts:82](src/modules/billing/dunning.service.ts:82) — el worker tiene que tomar **el mismo lock** o la carrera vuelve |
| 6 | `mp_event_id` del webhook = id de **notificación** de MP, no del cobro | [route.ts:154](src/app/api/webhooks/mercadopago/route.ts:154) `mpEventId: payload.id` |
| 7 | MP propaga `external_reference` del preapproval al pago | Panel de MP, detalle de la operación 173833098759: `Referencia externa: fbeda410-39eb-4ed0-b248-2f732ad14d26` (= el tenantId). Habilita el §6 |
| 8 | El canal real de MP para el cobro del SaaS es `payment` | Historial de notificaciones de producción del 2026-08-20 (citado en el mensaje de #180): las dos únicas entregas del día fueron `payment.created` con el id del pago. Ningún evento de tipo suscripción, con "Planes y suscripciones" tildado igual |

**La premisa 6 es la que decide todo el diseño**: el worker no puede compartir
clave de idempotencia con el webhook, porque la clave del webhook es un id de
notificación que el worker nunca va a ver. De ahí que **no** replique el evento.

### Correcciones al pedido original

1. El pedido decía registrar en `index.ts` + `definitions.ts` + `queue-names.ts`.
   `queue-names.ts` **no** es el registro de colas: tiene una sola cola legacy
   (`QUEUE_PROCESS_MP_WEBHOOK`) y sus `SendOptions`; las 15 restantes viven en
   `definitions.ts`. Agregarla ahí crearía una segunda fuente de verdad.
   **Va solo en `definitions.ts` + `workers/index.ts`.**
2. El pedido nombraba `subscription_authorized_payment` como el webhook que se
   pierde. Sigue siendo cierto que ese evento existe, pero por la premisa 8 el
   que MP realmente manda es `payment`. **No cambia el diseño** (el worker no
   escucha webhooks, le pregunta a MP), pero sí cambia dónde mirar cuando algo
   falla.

---

## 2. El caso real que motiva esto (2026-08-20, plata de verdad)

No es un ejercicio. Reconstrucción completa, con evidencia de las tres fuentes
(pg-boss de producción, `audit_logs`, panel y API de MercadoPago):

**Lo que pasó**

1. El complejo `fbeda410-…` ("complejo titi") disparó **5 `subscription.subscribe_initiated`**
   en un día — cinco preapprovals. El orphan guard de `subscribe()` funcionó:
   cada uno canceló al anterior (los `last_modified` de MP calzan al segundo con
   la creación del siguiente). **Los 5 están hoy `cancelled`; no quedó ningún
   cobro recurrente huérfano.**
2. Dos de ellos alcanzaron a cobrar antes de ser cancelados:

   | preapproval | `summarized.charged_quantity` | `last_charged_date` | operación MP | ¿aplicado en TurnoGol? |
   |---|---|---|---|---|
   | `275616150bef48aa85d502d9b490a359` | 1 · $100 | 2026-08-20T10:49:04-04:00 | 173833098759 | **NO** |
   | `5c6294a93fe04f309344f654479e633b` | 1 · $100 | 2026-08-20T11:33:09-04:00 | 173841538187 | sí |

3. `audit_logs` de ese complejo tiene **un solo** `tenant.activated`
   (21:48:47 UTC, `periodEnd 2026-10-18`). Cobrado $200 (neto $184,02),
   acreditado $100.
4. El webhook del cobro perdido (`mp_event_id` 136481525617) **ya figura en
   `processed_webhooks`**: llegó, se marcó procesado y no aplicó nada. La clave
   de idempotencia está quemada — ningún reintento de MP ni de pg-boss lo
   recupera.

**Por qué esto define el diseño.** El punto 4 es la refutación empírica del
enfoque replay: un reconciliador que re-actúe el evento con la clave del webhook
**no puede** rescatar este caso, porque la clave ya está usada. Un reconciliador
que converja sí, porque no le pregunta a `processed_webhooks` sino a MP.

**Nota de honestidad**: era una prueba interna de $100 (`reason` = "TurnoGol —
Prueba interna — NO OFRECER"), no un cliente. El daño fue nulo; el mecanismo es
el mismo con un plan de $85.000.

---

## 3. Decisión de diseño: convergencia, no replay

| | Replay (evento sintético → `onPaymentApproved`) | Convergencia (esta propuesta) |
|---|---|---|
| Período | `current_period_end += 1 ciclo` (relativo) | `current_period_end = next_payment_date` de MP (absoluto) |
| Correrlo 2 veces | Extiende 2 meses | Mismo resultado |
| Rescata el caso del §2 | **No** — la clave ya está en `processed_webhooks` | Sí |
| Varios ciclos perdidos | Subcuenta (extiende 1 solo) | Correcto: MP dice cuál es el próximo cobro |

El precedente del repo (`reconcile-pending-payments`) usa replay con clave
`reconcile-<mpPaymentId>` porque para una reserva el destino es un booleano
(`confirmed` o no) y repetirlo es inocuo. Para una suscripción el destino es una
**fecha acumulativa**, y repetir suma plata. Por eso acá el patrón cambia.

---

## 4. Tabla de decisión

Insumo: `GET /preapproval/{mp_subscription_id}` con el token master.

**Los campos están verificados contra la cuenta viva** (sonda read-only sobre
los 5 preapprovals reales del §2, 2026-08-20): `status`, `external_reference`,
`reason`, `date_created`, `last_modified`, `next_payment_date`,
`auto_recurring.transaction_amount`, y `summarized.{charged_quantity,
charged_amount, last_charged_date, last_charged_amount}`.

**Dato clave medido**: en los 3 preapprovals que nunca cobraron, `summarized`
viene **ausente entero** (no `charged_quantity: 0`). El parser tiene que
tratarlo como "sin cobros", que es lo que hace `getSubscriptionState` abajo.

| `preapproval.status` | `summarized.charged_quantity` | Acción | Por qué |
|---|---|---|---|
| `authorized` | `≥ 1` y `last_charged_date > last_payment_at` local | **activar** | Está pagando y la DB no se enteró. El caso del pedido. |
| `authorized` | `≥ 1` y `last_charged_date ≤ last_payment_at` local | noop | Ese cobro ya está aplicado (ganó el webhook) |
| `authorized` | `0` o `summarized` ausente | noop | Autorizó el débito pero MP todavía no cobró. El trial corre legítimamente. |
| `pending` | — | noop | Nunca terminó el checkout |
| `paused` | — | **alertar** | MP pausó; la DB no lo sabe. Reanudar es decisión del dueño. |
| `cancelled` | — | **alertar** | §7 D1. **Este es el caso real del §2**: `275616150b…` está `cancelled` **con un cobro de $100 sin aplicar**. No reactivamos sobre un preapproval muerto: eso no arregla nada y da de alta algo que el dueño ya no autoriza. |
| 404 / no reconocido | — | **alertar** | `mp_subscription_id` apunta a un preapproval que MP no tiene |

"Alertar" = `captureMessage` warning + fila en `audit_logs`
(`subscription.mp_desync`), **con dedup de 20 h** copiado de
[reconcile-accounting-drift.worker.ts:34](src/shared/jobs/workers/reconcile-accounting-drift.worker.ts:34) —
misma clase de alert fatigue, mismo remedio. Sin cambio de estado.

Período al activar:

- `periodStart = summarized.last_charged_date`
- `periodEnd = next_payment_date` si es `> periodStart`; si no,
  `last_charged_date + 1 ciclo`. El fallback no es teórico: los 3 preapprovals
  sin cobros de la sonda devolvieron un `next_payment_date` **anterior** a su
  propia fecha de creación.

---

## 5. Alcance del barrido

Núcleo, tal como se pidió:

```sql
WHERE ts.mp_subscription_id IS NOT NULL
  AND ts.status IN ('trialing', 'past_due')
```

**Segundo paso, separable — decisión de Lazar (§8 D2).** El pedido acota a
`trialing`/`past_due`, pero el propio pedido describe el desenlace:
`expire-trials` lo pasa a `blocked` (no a `suspended` —
[expire-trials.worker.ts:162](src/shared/jobs/workers/expire-trials.worker.ts:162)),
y `dunning-retry` escala `past_due → suspended → blocked`. Un complejo que ya
cayó por ese tobogán **queda fuera de la red** con el núcleo solo. Precedente
exacto: el rescate post-terminal ENS-16 de
[reconcile-pending-payments.worker.ts:133](src/shared/jobs/workers/reconcile-pending-payments.worker.ts:133),
que existe por el mismo motivo.

```sql
-- segundo paso (rescate post-terminal), ventana acotada
WHERE ts.mp_subscription_id IS NOT NULL
  AND ts.status IN ('suspended', 'blocked')
  AND ts.updated_at > NOW() - INTERVAL '30 days'
```

Va con `transitionToActiveFromAny`
([lifecycle.service.ts:344](src/modules/billing/lifecycle.service.ts:344)), que
ya acepta esos dos orígenes. Está aislado en `rescuePostTerminalSubscriptions`
para que borrarlo sea borrar una llamada. **Recomiendo dejarlo**: sin él la red
tiene el agujero por el que se cae exactamente el caso que motiva el worker.

---

## 6. Los archivos

### 6.1 `src/modules/payments/payment.types.ts` — tipo nuevo

```ts
/**
 * Estado de una suscripción leído de MercadoPago (`GET /preapproval/{id}`).
 * Montos en centavos ARS, como todo el resto del sistema.
 *
 * `status` sale tal cual de MP; `'unknown'` es para un valor que MP agregue
 * después y que este código no conozca — se trata como "no tocar y alertar",
 * nunca como "está pagando".
 */
export type GatewaySubscriptionState = {
  preapprovalId: string
  status: 'pending' | 'authorized' | 'paused' | 'cancelled' | 'unknown'
  /** `createPreapproval` lo setea al tenantId. Se usa como cross-check. */
  externalReference: string | null
  nextPaymentDate: Date | null
  chargedQuantity: number
  lastChargedDate: Date | null
  lastChargedAmountCents: number | null
}
```

### 6.2 `src/modules/payments/mp-gateway.ts` — método nuevo en la interfaz

```ts
  /**
   * Estado real de una suscripción en MercadoPago.
   *
   * Existe para `reconcile-subscriptions.worker.ts`: `trialing → active` solo
   * ocurre cuando llega el aviso del cobro, y si ese aviso se pierde el complejo
   * paga y queda en prueba (después `expire-trials` lo apaga). Este método
   * permite preguntarle a MP directamente, sin depender de la notificación.
   *
   * Devuelve null si MP no reconoce el preapproval (404): reintentar no lo va
   * a cambiar, y el caller lo reporta como desincronización en vez de fallar.
   */
  getSubscriptionState(preapprovalId: string): Promise<GatewaySubscriptionState | null>
```

### 6.3 `src/modules/payments/mp-gateway.implementation.ts`

`mpGet` **ya existe** ([:322](src/modules/payments/mp-gateway.implementation.ts:322));
la v1 proponía extraerlo y #179 ya lo hizo. Solo se agrega el método:

```ts
  async getSubscriptionState(preapprovalId: string): Promise<GatewaySubscriptionState | null> {
    try {
      const raw = await this.mpGet(`/preapproval/${encodeURIComponent(preapprovalId)}`)
      if (!raw) return null

      // `summarized` viene AUSENTE ENTERO en un preapproval que nunca cobró
      // — medido contra la cuenta viva el 2026-08-20 sobre 3 preapprovals
      // reales sin cobros. No es `{charged_quantity: 0}`: no está el objeto.
      const sum = (raw.summarized ?? {}) as Record<string, unknown>
      const KNOWN: readonly string[] = ['pending', 'authorized', 'paused', 'cancelled']

      return {
        preapprovalId,
        status: KNOWN.includes(String(raw.status))
          ? (raw.status as GatewaySubscriptionState['status'])
          : 'unknown',
        externalReference:
          typeof raw.external_reference === 'string' && raw.external_reference !== ''
            ? raw.external_reference
            : null,
        nextPaymentDate: parseMpDate(raw.next_payment_date),
        chargedQuantity: typeof sum.charged_quantity === 'number' ? sum.charged_quantity : 0,
        lastChargedDate: parseMpDate(sum.last_charged_date),
        lastChargedAmountCents:
          typeof sum.last_charged_amount === 'number'
            ? pesosToCents(sum.last_charged_amount)
            : null,
      }
    } catch (err) {
      if (err instanceof MpGatewayError) throw err
      throw new MpGatewayError(`Failed to fetch MP preapproval state ${preapprovalId}`, err)
    }
  }
```

```ts
/**
 * MP manda ISO-8601 con offset (`2026-08-20T10:49:04.486-04:00`). Un valor
 * ausente o no parseable es `null`, nunca Invalid Date — un Invalid Date se
 * propagaría hasta un `current_period_end` corrupto.
 */
function parseMpDate(v: unknown): Date | null {
  if (typeof v !== 'string' || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
```

Espejos obligatorios de la interfaz (si no, no compila):

- `mp-breaker.gateway.ts`: `getSubscriptionState: (id) => breaker.execute(key, () => inner.getSubscriptionState(id))`
- `mock-mp.ts` (`LocalMockGateway`): devuelve `null` — modo mock nunca reconcilia.
- `mp-gateway.mock.ts` (tests): campo `subscriptionStateResult` + array `getSubscriptionStateCalls`, igual que `resolveSubscriptionTenantResult`.

### 6.4 `src/modules/billing/subscription-reconcile.service.ts` — **motor puro, archivo nuevo**

Toda la decisión, sin DB ni red. Es lo que se testea de verdad.

```ts
import type { BillingCycle, SubscriptionStatus } from './billing.types'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'

export type LocalSubSnapshot = {
  status: SubscriptionStatus
  billingCycle: BillingCycle
  mpSubscriptionId: string | null
  lastPaymentAt: Date | null
}

export type ReconcileDecision =
  | { action: 'noop'; reason: string }
  | { action: 'alert'; reason: string }
  | { action: 'activate'; paidAt: Date; periodStart: Date; periodEnd: Date }

function addCycle(from: Date, cycle: BillingCycle): Date {
  const d = new Date(from)
  if (cycle === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

/**
 * Qué hacer con una suscripción dado lo que dice MercadoPago.
 *
 * Función PURA a propósito: es la única parte con reglas de plata, y así se
 * puede probar la tabla entera con vitest sin Postgres ni MP.
 *
 * Nunca devuelve `activate` sin un `last_charged_date` real: la fecha del cobro
 * ancla el período Y el guard de idempotencia, y fabricarla con `new Date()`
 * rompería las dos cosas a la vez.
 */
export function decideSubscriptionReconcile(
  local: LocalSubSnapshot,
  remote: GatewaySubscriptionState,
  expectedTenantId: string,
): ReconcileDecision {
  // Cross-check: `createPreapproval` setea external_reference = tenantId. Si no
  // matchea, este preapproval es de otro complejo y activar sería aplicarle a
  // uno la plata de otro. Mismo criterio que mp-webhook.handler.ts.
  if (remote.externalReference !== null && remote.externalReference !== expectedTenantId) {
    return {
      action: 'alert',
      reason: `external_reference mismatch: esperado ${expectedTenantId}, MP dice ${remote.externalReference}`,
    }
  }

  if (remote.status === 'cancelled') {
    // Caso REAL del §2 (`275616150b…`: cancelled con $100 cobrados y sin
    // aplicar). No se reactiva: el preapproval está muerto, reactivar no cobra
    // nada nuevo y da de alta algo que el dueño ya no autoriza. La plata se
    // resuelve a mano — ver §8 D1.
    return { action: 'alert', reason: 'MP dice cancelled y la DB no' }
  }
  if (remote.status === 'paused') {
    return { action: 'alert', reason: 'MP dice paused y la DB no' }
  }
  if (remote.status === 'unknown') {
    return { action: 'alert', reason: 'status de preapproval no reconocido' }
  }
  if (remote.status === 'pending') {
    return { action: 'noop', reason: 'preapproval sin autorizar (checkout sin terminar)' }
  }

  // authorized de acá para abajo.
  if (remote.chargedQuantity < 1) {
    return { action: 'noop', reason: 'autorizado pero todavía sin cobros' }
  }
  const lastCharged = remote.lastChargedDate
  if (lastCharged === null) {
    return { action: 'alert', reason: 'charged_quantity > 0 sin last_charged_date' }
  }

  // Guard de marca de agua: si el último pago registrado localmente es igual o
  // posterior al último cobro que MP conoce, ese cobro YA está aplicado (ganó
  // el webhook). Es lo que hace idempotente correr el worker N veces, y lo que
  // reemplaza a la clave de `processed_webhooks` que este camino no puede
  // compartir (premisa 6).
  if (local.lastPaymentAt !== null && local.lastPaymentAt >= lastCharged) {
    return { action: 'noop', reason: 'el último cobro de MP ya está aplicado' }
  }

  // `next_payment_date` es la verdad de MP sobre cuándo vence el período. El
  // fallback no es teórico: los preapprovals sin cobros devuelven un
  // `next_payment_date` ANTERIOR a su propia creación (medido 2026-08-20).
  const periodEnd =
    remote.nextPaymentDate !== null && remote.nextPaymentDate > lastCharged
      ? remote.nextPaymentDate
      : addCycle(lastCharged, local.billingCycle)

  return { action: 'activate', paidAt: lastCharged, periodStart: lastCharged, periodEnd }
}
```

### 6.5 `src/shared/jobs/definitions.ts` — dos constantes

```ts
export const QUEUE_RECONCILE_SUBSCRIPTIONS = 'reconcile-subscriptions'
```

```ts
// ─── Reconciliación de suscripciones SaaS ────────────────────────────────────
// OJO (CLAUDE.md): `boss.schedule(name, cron, data)` sin 4to argumento corre con
// retryLimit=0 — el "retry" es el próximo tick del cron, una hora después.
// Acá sí se pasan SendOptions: el barrido es idempotente por construcción
// (escrituras convergentes + guard de marca de agua), así que reintentar ante un
// 5xx de MP es seguro y evita que un complejo que ya pagó espere una hora más.
// `expireInHours: 2` deja lugar a los 2 reintentos sin que dos corridas del cron
// se solapen.
export const RECONCILE_SUBSCRIPTIONS_SEND_OPTIONS = {
  retryLimit: 2,
  retryDelay: 120,
  retryBackoff: true,
  expireInHours: 2,
} as const
```

### 6.6 `src/shared/jobs/workers/reconcile-subscriptions.worker.ts` — **archivo nuevo**

```ts
import type PgBoss from 'pg-boss'
import { sql } from 'drizzle-orm'
import type { Sql } from 'postgres'
import { getWorkerSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { MP_MOCK_ENABLED } from '@/modules/payments/mock-mp'
import {
  transitionTrialingToActive,
  transitionPastDueToActive,
  transitionToActiveFromAny,
} from '@/modules/billing/lifecycle.service'
import {
  decideSubscriptionReconcile,
  type LocalSubSnapshot,
} from '@/modules/billing/subscription-reconcile.service'
import type { BillingCycle, SubscriptionStatus } from '@/modules/billing/billing.types'
import {
  CRON_WORK_OPTIONS,
  QUEUE_RECONCILE_SUBSCRIPTIONS,
  RECONCILE_SUBSCRIPTIONS_SEND_OPTIONS,
} from '../definitions'
import { track } from '@/shared/observability'
import { captureMessage } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'

/**
 * Red de rescate de las suscripciones SaaS.
 *
 * `trialing → active` solo ocurre cuando llega el aviso del cobro de MP
 * (`onPaymentApproved` → `transitionTrialingToActive`). Si ese aviso se pierde
 * —MP agota reintentos, deploy caído, o un bug lo rechaza— el complejo paga
 * todos los meses y para nosotros sigue en prueba; después `expire-trials` le
 * vence el trial y lo apaga. Para las señas de reserva ese seguro existe hace
 * rato (`reconcile-pending-payments.worker.ts`); para las suscripciones no
 * había nada, y el 2026-08-20 se cobraron $200 acreditando $100 (§2 del
 * diseño).
 *
 * DIFERENCIA CLAVE con el reconciliador de señas: ése RE-ACTÚA el evento
 * perdido con una clave sintética `reconcile-<mpPaymentId>`. Acá no alcanza:
 * el `mp_event_id` del webhook es el id de NOTIFICACIÓN de MP (route.ts:154,
 * `payload.id`), y en el caso real del §2 ese id YA ESTABA en
 * `processed_webhooks` — el evento llegó, se marcó procesado y no aplicó nada.
 * Un replay habría hecho no-op sobre el único caso que había que rescatar.
 *
 * Por eso este worker CONVERGE: lee de MP el estado real y escribe el período
 * en ABSOLUTO (`next_payment_date` de MP), no en relativo. Correrlo N veces
 * deja la misma fila que correrlo una, y no le pregunta nada a
 * `processed_webhooks`.
 */

type Candidate = {
  tenantId: string
  status: SubscriptionStatus
  billingCycle: BillingCycle
  mpSubscriptionId: string
  lastPaymentAt: Date | string | null
}

/** Núcleo del pedido. */
const CORE_STATUSES = ['trialing', 'past_due'] as const
/** Rescate post-terminal (§5 del diseño). Ver `rescuePostTerminalSubscriptions`. */
const POST_TERMINAL_STATUSES = ['suspended', 'blocked'] as const

/**
 * Lectura cross-tenant ⇒ pool de servicio (BYPASSRLS). Una sola query no se
 * puede acotar a un `app.current_tenant_id` — mismo motivo que en
 * dunning-retry.worker.ts. Cada escritura de abajo abre su propia transacción
 * correctamente scopeada.
 */
async function loadCandidates(
  sql_: Sql,
  statuses: readonly SubscriptionStatus[],
  windowDays: number | null,
): Promise<Candidate[]> {
  return sql_<Candidate[]>`
    SELECT ts.tenant_id          AS "tenantId",
           ts.status             AS "status",
           ts.billing_cycle      AS "billingCycle",
           ts.mp_subscription_id AS "mpSubscriptionId",
           ts.last_payment_at    AS "lastPaymentAt"
    FROM tenant_subscriptions ts
    WHERE ts.mp_subscription_id IS NOT NULL
      AND ts.status = ANY(${statuses as unknown as string[]}::subscription_status[])
      ${
        windowDays === null
          ? sql_``
          : sql_`AND ts.updated_at > NOW() - (${windowDays} || ' days')::interval`
      }
    ORDER BY ts.updated_at ASC
    LIMIT 200
  `
}

/**
 * Dedup de alertas, 20 h — calcado de reconcile-accounting-drift.worker.ts:34.
 * Un desfasaje que nadie resuelve (el dueño canceló en el panel de MP y no nos
 * avisó) escribiría una fila de audit_logs y un evento de Sentry POR CORRIDA,
 * para siempre. 20 h y no 24 para que un cron levemente corrido no quede
 * siempre por debajo del umbral y nunca vuelva a alertar.
 */
async function recentlyAlerted(sql_: Sql): Promise<Set<string>> {
  const rows = await sql_<{ resourceId: string }[]>`
    SELECT resource_id AS "resourceId"
    FROM audit_logs
    WHERE action = 'subscription.mp_desync'
      AND created_at > NOW() - INTERVAL '20 hours'
  `
  return new Set(rows.map((r) => r.resourceId))
}

/**
 * Relee la fila DENTRO de la transacción y con `FOR UPDATE`.
 *
 * No es paranoia: `dunning.service.ts:82` (`loadSub`) lockea con
 * `FOR UPDATE OF ts`, y `billing.service.ts` (`loadSubForUpdate`) también. Si
 * este worker decidiera sobre la fila que leyó el barrido —minutos antes, sin
 * lock, y con un round trip a MP en el medio— un `reactivate()`/`cancel()`
 * concurrente podría cambiar `mp_subscription_id` o el `status` justo entre
 * medio. El caso del §2 muestra que 5 `subscribe()` en un día no es una
 * hipótesis. Tomando el MISMO lock, los dos caminos se serializan.
 *
 * `FOR UPDATE` pelado y no `OF ts` porque acá no hay JOIN con `plans`: no hay
 * ninguna fila global que se pueda lockear de más.
 */
async function lockSub(tx: DbTx, tenantId: string): Promise<Candidate | null> {
  const rows = (await tx.execute(sql`
    SELECT tenant_id          AS "tenantId",
           status             AS "status",
           billing_cycle      AS "billingCycle",
           mp_subscription_id AS "mpSubscriptionId",
           last_payment_at    AS "lastPaymentAt"
    FROM tenant_subscriptions
    WHERE tenant_id = ${tenantId}
    LIMIT 1
    FOR UPDATE
  `)) as unknown as Candidate[]
  return rows[0] ?? null
}

/** `tx.execute(sql)` crudo devuelve timestamps como string, no Date. */
function toDate(v: Date | string | null): Date | null {
  if (v === null) return null
  return v instanceof Date ? v : new Date(v)
}

async function alertDesync(tenantId: string, preapprovalId: string, reason: string): Promise<void> {
  await withTenantContext(tenantId, (tx) =>
    insertSystemAuditLog(tx, {
      tenantId,
      action: 'subscription.mp_desync',
      resourceType: 'tenant_subscription',
      resourceId: tenantId,
      metadata: { preapprovalId, reason },
    }),
  )
  captureMessage(`subscription desync with MercadoPago: ${reason}`, {
    level: 'warning',
    extra: { tenantId, preapprovalId, reason },
  })
  track.payment('payment.subscription.mp_desync', { tenantId, preapprovalId })
}

/**
 * Una suscripción. Devuelve true si la levantó.
 *
 * Fase SEARCH / fase PROCESS, igual que mp-webhook.handler.ts: el fetch a MP
 * ocurre FUERA de toda transacción. Meterlo adentro dejaría una conexión del
 * pool idle-in-transaction durante el round trip HTTP — el hallazgo D4-A1 que
 * ya se corrigió una vez en el camino del webhook; no se reintroduce acá.
 */
async function reconcileOne(cand: Candidate, alerted: Set<string>): Promise<boolean> {
  // ── Fase SEARCH: MP, sin transacción abierta ──────────────────────────────
  const remote = await getBillingGateway().getSubscriptionState(cand.mpSubscriptionId)

  if (remote === null) {
    if (!alerted.has(cand.tenantId)) {
      await alertDesync(cand.tenantId, cand.mpSubscriptionId, 'MP no reconoce el preapproval (404)')
      alerted.add(cand.tenantId)
    }
    return false
  }

  // ── Fase PROCESS: solo DB, con la fila lockeada ───────────────────────────
  const outcome = await withTenantContext(cand.tenantId, async (tx) => {
    const fresh = await lockSub(tx, cand.tenantId)
    if (!fresh) return { activated: false, alert: null as string | null }

    // Cambió el preapproval entre el barrido y ahora (reactivate/cancel
    // concurrente): la respuesta de MP que tenemos en mano es sobre OTRO
    // preapproval. Mismo criterio que `preapprovalIdMatches` en dunning.
    if (fresh.mpSubscriptionId !== cand.mpSubscriptionId) {
      return { activated: false, alert: null }
    }

    const snapshot: LocalSubSnapshot = {
      status: fresh.status,
      billingCycle: fresh.billingCycle,
      mpSubscriptionId: fresh.mpSubscriptionId,
      lastPaymentAt: toDate(fresh.lastPaymentAt),
    }
    const decision = decideSubscriptionReconcile(snapshot, remote, cand.tenantId)

    // La alerta se devuelve y se emite DESPUÉS del commit: escribe su propia
    // tx de audit y toca Sentry, y que una alerta falle no debe revertir nada.
    if (decision.action === 'alert') return { activated: false, alert: decision.reason }
    if (decision.action === 'noop') return { activated: false, alert: null }

    // ── activate ────────────────────────────────────────────────────────────
    // Se reusan las transiciones del FSM (lifecycle.service.ts) en vez de un
    // UPDATE propio: son las dueñas del espejo a `tenants.status` + audit log,
    // y respetan el Orden A de locks (tenant_subscriptions antes que tenants).
    // La idempotencia no la da la transición sino el guard de marca de agua de
    // `decideSubscriptionReconcile`, evaluado recién ahora sobre la fila
    // lockeada.
    let template: 'subscription_activated' | 'subscription_renewed'
    if (fresh.status === 'trialing') {
      await transitionTrialingToActive(cand.tenantId, decision.periodStart, decision.periodEnd, tx)
      template = 'subscription_activated'
    } else if (fresh.status === 'past_due') {
      await transitionPastDueToActive(cand.tenantId, decision.paidAt, decision.periodEnd, tx)
      template = 'subscription_renewed'
    } else if (fresh.status === 'suspended' || fresh.status === 'blocked') {
      await transitionToActiveFromAny(cand.tenantId, decision.periodStart, decision.periodEnd, tx)
      template = 'subscription_renewed'
    } else {
      return { activated: false, alert: null }
    }

    // `transitionTrialingToActive` y `transitionToActiveFromAny` escriben
    // `last_payment_at = NOW()` (no la fecha de MP). No se toca el FSM por eso:
    // NOW() > last_charged_date siempre, así que el guard de marca de agua sigue
    // siendo correcto — solo más conservador. La fecha real de MP igual queda en
    // el audit log de abajo, para que la conciliación humana la tenga.
    await insertSystemAuditLog(tx, {
      tenantId: cand.tenantId,
      action: 'subscription.reconciled',
      resourceType: 'tenant_subscription',
      resourceId: cand.tenantId,
      metadata: {
        from: fresh.status,
        preapprovalId: cand.mpSubscriptionId,
        mpLastChargedAt: decision.paidAt.toISOString(),
        mpChargedQuantity: remote.chargedQuantity,
        periodEnd: decision.periodEnd.toISOString(),
        reason: 'el aviso del cobro nunca aplicó',
      },
    })

    const info = (await tx.execute(sql`
      SELECT t.name AS "tenantName",
             (
               SELECT su.first_name FROM tenant_staff_members tsm
               JOIN staff_users su ON su.id = tsm.staff_user_id
               WHERE tsm.tenant_id = t.id AND tsm.is_active = true LIMIT 1
             ) AS "ownerName",
             (
               SELECT p.name FROM plans p
               JOIN tenant_subscriptions ts2 ON ts2.plan_id = p.id
               WHERE ts2.tenant_id = t.id
             ) AS "planName"
      FROM tenants t WHERE t.id = ${cand.tenantId} LIMIT 1
    `)) as unknown as Array<{ tenantName: string; ownerName: string | null; planName: string }>

    const t = info[0]
    if (t) {
      await enqueueTenantOwnerNotification(
        {
          tenantId: cand.tenantId,
          templateName: template,
          triggerEvent: 'sweep.subscription_reconciled',
          content: {
            ownerName: t.ownerName ?? 'Hola',
            tenantName: t.tenantName,
            planName: t.planName,
            periodEnd: decision.periodEnd.toISOString().slice(0, 10),
          },
        },
        tx,
      )
    }

    return { activated: true, alert: null }
  })

  if (outcome.alert !== null && !alerted.has(cand.tenantId)) {
    await alertDesync(cand.tenantId, cand.mpSubscriptionId, outcome.alert)
    alerted.add(cand.tenantId)
  }
  if (outcome.activated) {
    track.payment('payment.subscription.reconciled', {
      tenantId: cand.tenantId,
      preapprovalId: cand.mpSubscriptionId,
    })
  }
  return outcome.activated
}

/** Núcleo: `trialing` / `past_due`, sin ventana. */
export async function reconcileSubscriptions(): Promise<number> {
  // Modo mock (E2E): `getBillingGateway()` NO honra MP_MOCK_ENABLED —solo
  // `resolveTenantGateway` lo hace (mp-oauth.ts:122)— así que acá pegaría contra
  // MP con el token vacío. Hoy los workers no corren en la suite e2e; el guard
  // es para que siga siendo verdad si algún día corren.
  if (MP_MOCK_ENABLED) return 0

  const sql_ = getWorkerSql()
  const alerted = await recentlyAlerted(sql_)
  const candidates = await loadCandidates(sql_, CORE_STATUSES, null)

  let fixed = 0
  for (const cand of candidates) {
    try {
      // secuencial: `getWorkerSql()` es una conexión postgres-js compartida y no
      // corre queries en paralelo (ver dunning-retry.worker.ts:40).
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (await reconcileOne(cand, alerted)) fixed += 1
    } catch (err) {
      logger.error('failed subscription reconcile', {
        module: 'reconcile-subscriptions',
        tenantId: cand.tenantId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (fixed > 0) {
    logger.info('activated subscriptions via reconcile', {
      module: 'reconcile-subscriptions',
      count: fixed,
    })
  }
  return fixed + (await rescuePostTerminalSubscriptions(alerted))
}

/**
 * Rescate post-terminal (§5 del diseño; equivalente de ENS-16 en
 * reconcile-pending-payments). El barrido de arriba solo mira `trialing` y
 * `past_due` — pero el desenlace del aviso perdido es justamente que
 * `expire-trials` lo pase a `blocked`, o que `dunning-retry` lo escale a
 * `suspended`. Sin este segundo paso, el complejo que ya cayó por ese tobogán
 * queda fuera de la red para siempre.
 *
 * Ventana de 30 días sobre `updated_at`: acota el barrido a lo que se apagó hace
 * poco. Un `blocked` de hace un año no es un aviso perdido, es un complejo que
 * se fue.
 *
 * SEPARABLE: borrar esta función y su llamada deja el núcleo exactamente como se
 * pidió, sin tocar nada más.
 */
async function rescuePostTerminalSubscriptions(alerted: Set<string>): Promise<number> {
  const candidates = await loadCandidates(getWorkerSql(), POST_TERMINAL_STATUSES, 30)

  let rescued = 0
  for (const cand of candidates) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (await reconcileOne(cand, alerted)) rescued += 1
    } catch (err) {
      logger.error('failed post-terminal subscription reconcile', {
        module: 'reconcile-subscriptions',
        tenantId: cand.tenantId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (rescued > 0) {
    logger.info('rescued post-terminal subscriptions', {
      module: 'reconcile-subscriptions',
      count: rescued,
    })
  }
  return rescued
}

export async function registerReconcileSubscriptionsWorker(boss: PgBoss): Promise<void> {
  // :20 y no :00 — reconcile-accounting-drift, retry-refunds y
  // onboarding-abandonment ya corren todos en punto; separarlos es gratis.
  //
  // El 4to argumento son los SendOptions: sin él, pg-boss registra el cron con
  // retryLimit=0 y un 5xx de MP significa esperar hasta la hora siguiente
  // (CLAUDE.md, "los crons registrados sin SendOptions corren con retryLimit=0
  // real"). Este barrido es idempotente por construcción, así que reintentar es
  // seguro.
  await boss.schedule(
    QUEUE_RECONCILE_SUBSCRIPTIONS,
    '20 * * * *',
    {},
    RECONCILE_SUBSCRIPTIONS_SEND_OPTIONS,
  )
  await boss.work(QUEUE_RECONCILE_SUBSCRIPTIONS, CRON_WORK_OPTIONS, async () => {
    await reconcileSubscriptions()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RECONCILE_SUBSCRIPTIONS })
}
```

### 6.7 `src/shared/jobs/workers/index.ts`

```diff
 import { registerReconcileAccountingDriftWorker } from './reconcile-accounting-drift.worker'
+import { registerReconcileSubscriptionsWorker } from './reconcile-subscriptions.worker'
@@
   await registerReconcileAccountingDriftWorker(boss)
+  await registerReconcileSubscriptionsWorker(boss)
```

(Antes de `attachFailureHandlers(boss)`, que tiene que quedar último.)

### 6.8 `src/shared/observability/breadcrumbs.ts`

```diff
 type PaymentEvent =
   | 'payment.reconcile.drift_detected'
+  | 'payment.subscription.reconciled'
+  | 'payment.subscription.mp_desync'

 type PaymentCtx = {
   mpPaymentId?: string
+  /** id del preapproval de la suscripción SaaS. No es dato de persona. */
+  preapprovalId?: string
   amountCents?: number
 }
```

`PII_KEYS` no necesita cambio: `tenantId` y `preapprovalId` identifican a un
complejo (una empresa), no a una persona.

---

## 7. Idempotencia — qué queda cubierto y qué no

| Escenario | Resultado |
|---|---|
| El worker corre 2 veces sobre el mismo cobro | **noop** la segunda: `last_payment_at >= last_charged_date` |
| El worker corre y después no llega ningún aviso | Correcto y estable |
| Llega el aviso y **después** corre el worker | **noop**: `last_payment_at` (puesto por el webhook, `= NOW()`) > `last_charged_date` |
| El aviso llegó pero **no aplicó** (caso real §2) | **Rescatado.** El worker no mira `processed_webhooks` |
| Dos réplicas del worker en paralelo (Railway) | La segunda espera el `FOR UPDATE`, relee y hace noop |
| `reactivate()` concurrente cambia el preapproval | Aborta por `fresh.mpSubscriptionId !== cand.mpSubscriptionId` |
| **Corre el worker y después llega el aviso tardío** | 🟡 **RESIDUAL — abajo** |

### El residual, y cómo cerrarlo sin endpoints nuevos

Si el worker activa y el aviso llega después, `onPaymentApproved` encuentra la
suscripción en `active` y cae en la rama `else`
([dunning.service.ts:314](src/modules/billing/dunning.service.ts:314)), que
extiende `current_period_end` **+1 ciclo**. El complejo se lleva un mes gratis y
recibe dos mails.

**La v1 dejaba esto abierto** porque la clave compartida parecía exigir
`GET /authorized_payments/search?preapproval_id=…`, un endpoint sin verificar.
Ya no hace falta: la **premisa 7** (MP propaga `external_reference` del
preapproval al pago — visto en el panel sobre la operación real 173833098759)
habilita usar `searchPaymentsByReference`, que **ya existe en el gateway y está
probado** ([mp-gateway.implementation.ts:217](src/modules/payments/mp-gateway.implementation.ts:217)).

Patch acompañante, tres piezas chicas:

1. `dunning.service.ts` — parámetro opcional `chargeKey` en `onPaymentApproved`;
   si viene, se lockea ANTES que nada con el mismo `lockWebhook`:
   ```ts
   if (chargeKey && !(await lockWebhook(chargeKey, `${eventType}:charge`, { chargeKey }, tx))) {
     return { alreadyProcessed: true }
   }
   ```
2. `mp-webhook.handler.ts` — las dos ramas que llaman `onPaymentApproved` pasan
   ``chargeKey: `sub-charge:${info.mpPaymentId}` ``. Sirve `info.mpPaymentId` y
   no `job.mpPaymentId`: en la rama `subscription_authorized_payment` el
   `job.mpPaymentId` es la FACTURA y `getSubscriptionChargeInfo` ya devuelve el
   id del PAGO adentro — que es el mismo número que ve la rama `payment`. Los
   dos canales convergen en la misma clave, que era el punto.
3. El worker, al activar: `searchPaymentsByReference(tenantId)` contra el
   gateway master, se queda con el `approved` más reciente y lockea
   `sub-charge:<mpPaymentId>` antes de escribir.
   Cuidado al filtrar: el proraeo de upgrade usa `saas-upgrade:<tenantId>:<planId>`
   como referencia, así que una búsqueda por `tenantId` pelado devuelve solo
   cobros de suscripción — pero conviene igual chequear el `preapprovalId` del
   pago contra el vigente antes de aceptarlo.

Costo: una llamada más a MP **solo en el camino de activación** (que es raro por
definición), sin endpoints nuevos. **Recomiendo incluirlo** — a diferencia de la
v1, ya no hay nada sin verificar.

---

## 8. Riesgos y REQUIERE INPUT

**✅ R1 (era 🔴 en la v1) — CERRADO.** `getPaymentStatus` recibía el id de la
factura y pegaba a `/v1/payments/{id}`. Confirmado con evidencia de producción:
3 jobs `process-mp-webhook` de tipo `subscription_authorized_payment` quedaron
`state: failed`, `retrycount: 5`, con
`MpGatewayError: Failed to fetch MP payment 7031112147` / `404 Payment not found`.
Arreglado por #179 (`getSubscriptionChargeInfo`, lee `/authorized_payments/{id}`)
y #180 (el canal real es `payment`). Los dos en `origin/main`.

**✅ R2 (era 🟡 en la v1) — CERRADO.** Los nombres de `summarized.*` ya no salen
del SDK de Go: se midieron contra la cuenta viva sobre los 5 preapprovals reales
del §2. Único ajuste que salió de esa medición: cuando no hubo cobros,
`summarized` viene **ausente entero**, no en cero.

**🟡 R3 — dos mails al dueño** en la carrera del §7, si el patch acompañante se
difiere.

**🟡 R4 — el worktree no tiene `node_modules`.** `pnpm install` antes de
implementar, o `pnpm typecheck` falla por el motivo equivocado.

### Decisiones

1. **D1 — cobro sobre un preapproval `cancelled`.**
   - *(b) qué hace el sistema*: **RESUELTO** — alerta (`subscription.mp_desync`
     en `audit_logs` + warning en Sentry) y no toca el estado. Implementado y
     cubierto por test.
   - *(a) los $100 de la operación 173833098759*: **ABIERTO**, se decide aparte.
     Opciones: devolución desde el panel de MP (el detalle de la operación ofrece
     "Devolver dinero") o crédito manual al complejo.
2. **D2 — rescate post-terminal (`suspended`/`blocked`, ventana 30 d): SÍ.**
   Aprobado e implementado (`rescuePostTerminalSubscriptions`).
3. **D3 — patch de clave compartida por cobro: SÍ.** Aprobado e implementado
   (`buildSubscriptionChargeKey` + el parámetro `chargeKey` de
   `onPaymentApproved`).

---

## 9. Tests

**Unit** — `tests/unit/subscription-reconcile-decision.test.ts`
La tabla del §4 entera contra `decideSubscriptionReconcile`, sin DB ni MP: los 7
casos de `preapproval.status`, el guard de marca de agua en sus dos direcciones,
el mismatch de `external_reference`, `next_payment_date` en el pasado ⇒ fallback
a `addCycle`, y `billingCycle: 'annual'`.

**Usar los payloads REALES del §2**, no ids inventados. Es la lección explícita
de #177 (memoria `mp-id-suscripcion-es-hash-no-numero`): la suite no vio ese bug
porque los tests usaban ids numéricos plausibles. Casos que ya tenemos medidos:
- `275616150bef48aa85d502d9b490a359` — `cancelled` + `charged_quantity: 1` ⇒ `alert`
- `88f6dc4ca8834ac4a54732ad41032e36` — `cancelled` + **`summarized` ausente** ⇒ `alert`
- un `authorized` con `charged_quantity: 1` ⇒ `activate`

**Unit** — `tests/unit/reconcile-subscriptions-worker.test.ts`
Con `MockGateway` (`setBillingGateway`), espejo de
`reconcile-pending-payments-worker.test.ts`: que `getSubscriptionState` se llame
con el `mp_subscription_id` correcto, que `null` (404) alerte sin escribir, y que
`MP_MOCK_ENABLED` corte en 0 sin llamar a MP.

**Integración** — `tests/integration/reconcile-subscriptions-idempotency.test.ts`
(DB real, espejo de `reconcile-pending-payments-idempotency.test.ts`). Los cinco
que importan:

1. `trialing` + preapproval `authorized` con 1 cobro ⇒ queda `active`, `tenants.status='active'`, hay `audit_logs` `subscription.reconciled`.
2. **Correr dos veces seguidas ⇒ `current_period_end` idéntico.** Es la prueba de la convergencia; sin este test el diseño no está verificado.
3. Webhook primero (`onPaymentApproved`), worker después ⇒ noop, `updated_at` de `tenant_subscriptions` sin cambio.
4. **El caso del §2**: el `mp_event_id` ya está en `processed_webhooks` y la suscripción sigue en `trialing` ⇒ el worker **igual** la activa. Es la diferencia con el enfoque replay, y merece su propio test.
5. `mp_subscription_id` cambiado entre el barrido y la escritura ⇒ no activa.

**Ojo con las fechas** (memoria `current-date-utc-ventana-muerta-art`): los
fixtures usan instantes explícitos, nunca `CURRENT_DATE`.

Verificación previa a cualquier commit: `pnpm install` (ver R4), después
`pnpm typecheck && pnpm lint`, y
`pnpm test:integration tests/integration/reconcile-subscriptions-idempotency.test.ts`
con Postgres local en 54322.

---

## 10. Presupuesto de cambio

| Archivo | Estado | ~Líneas |
|---|---|---|
| `src/modules/payments/payment.types.ts` | edita | +12 |
| `src/modules/payments/mp-gateway.ts` | edita | +12 |
| `src/modules/payments/mp-gateway.implementation.ts` | edita (solo el método; `mpGet` ya existe) | +40 |
| `src/modules/payments/mp-breaker.gateway.ts` | edita | +2 |
| `src/modules/payments/mock-mp.ts` | edita | +4 |
| `src/modules/payments/mp-gateway.mock.ts` | edita | +10 |
| `src/modules/billing/subscription-reconcile.service.ts` | **nuevo** | ~95 |
| `src/shared/jobs/definitions.ts` | edita | +12 |
| `src/shared/jobs/workers/reconcile-subscriptions.worker.ts` | **nuevo** | ~310 |
| `src/shared/jobs/workers/index.ts` | edita | +2 |
| `src/shared/observability/breadcrumbs.ts` | edita | +3 |
| tests (3 archivos) | **nuevos** | ~280 |
| *(§7, opcional)* `dunning.service.ts` + `mp-webhook.handler.ts` | edita | +15 |

Sin migración de schema. Sin tabla nueva. Sin columna nueva.
`queue-names.ts`: **no se toca** (ver §1).

---

## 11. Apéndice — la sonda

La verificación de la cuenta viva se hizo con un script read-only de un solo
uso: `scratchpad/check-preapprovals.mjs` (Node puro, sin dependencias; carga
`.env.production`/`.env.local` con `process.loadEnvFile` y solo hace
`GET /preapproval/{id}`). No se commiteó. Si conviene tenerlo, el lugar es
`scripts/` al lado de `sentry-issues.ts`.

**Gotcha encontrado al correrla**: en `.env.local` el `MP_TURNOGOL_ACCESS_TOKEN`
devuelve **HTTP 400** contra la API viva; el que funciona es
`MP_TURNOGOL_ACCESS_TOKEN_REAL_BACKUP`. Cualquier script local que apunte a la
cuenta master real necesita ese, no el primero.
