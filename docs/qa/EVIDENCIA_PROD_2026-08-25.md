# Qué flujos de plata ya corrieron en producción — evidencia, 2026-08-25

> **Por qué existe este documento.** El plan de ensayos (`PLAN_PRODUCCION_2026-08-17.md`) tenía casi todo sin tildar, y eso era falso: entre el 18 y el 24 de agosto se ejecutaron a mano, contra producción y con plata real, buena parte de los circuitos. Lo que faltaba no era la ejecución sino el **registro**.
>
> **Cómo se midió.** Consultas directas a la base de producción sobre `payments`, `bookings`, `cash_flows`, `notifications`, `processed_webhooks` y `audit_logs`. Todo lo que sigue sale de filas reales; nada sale de memoria ni de un resumen.
>
> **El error que originó esto.** El 2026-08-24 medí "¿hay alguna suscripción `active`?", vi cero y concluí que P-01 nunca se había hecho. Se había hecho el 20/8 y se canceló 8 minutos después. **Medir el estado presente no dice nada sobre lo que pasó**: para eso están `audit_logs` y `notifications`, que son append-only.

---

## 1. Resumen

| Ensayo | Antes decía | Evidencia real |
|---|---|---|
| **P-01** · Suscripción propia | sin hacer | ✅ **hecho el 20/8**, con el plan interno de $100 |
| **P-03** · Seña real punta a punta | sin hacer | ✅ **6 señas cobradas** con `mp_payment_id` real |
| **P-04** · Webhook duplicado | sin hacer | sigue sin evidencia |
| **P-05** · Pago sobre el filo del hold | sin hacer | 🟡 el caso exacto no; **los dos peores sí, y los dos salieron bien** |
| **P-06** · Devolución de la seña | sin hacer | 🟡 el camino principal sí; **tres sub-casos no** |
| **P-13** · Baja de suscripción | sin hacer | ✅ ejecutada el 20/8 (sobre la suscripción de $100) |

---

## 2. P-01 — la suscripción propia ya corrió, y salió $100

El 2026-08-20, sobre `complejo-titi`, con el plan `Prueba interna — NO OFRECER` ($100/mes):

| Ítem del checklist | Evidencia |
|---|---|
| Preapproval real contra la cuenta master | `5c6294a93fe04f309344f654479e633b` (4 intentos previos en `audit_logs`) |
| Webhook firmado con la clave **productiva** | `tenant.activated`, 21:48:47 UTC |
| `trialing` a `active` | ídem |
| `current_period_end` = fin de trial + 1 mes | `2026-10-18` (el trial vencía 2026-09-18) ✅ |
| Email `subscription_activated` | `status='sent'`, 21:49:06 UTC |
| Baja voluntaria (**P-13**) | `tenant.canceled` 21:56:30 + `subscription.mp_preapproval_cleared` + email `subscription_canceled` |

**Conclusión.** El circuito de facturación SaaS está probado de punta a punta con plata real. El monto no toca ninguna línea de código: `planAmount` lee `plans.price_monthly` y se lo pasa a MercadoPago igual sean $100 o $63.000.

**Lo que sigue sin probarse es P-02** — que a los 30 días MercadoPago debite **solo**. Esa suscripción se canceló a los 8 minutos, así que el reloj nunca arrancó. Es lo único que falta y lo único que no se puede acelerar.

---

## 3. P-03 — la seña real está probada

**6 depósitos aprobados** con `mp_payment_id` real, entre el 18 y el 23 de agosto, repartidos entre los dos complejos:

`174510158896` · `173668584263` · `173702428897` · `174177392859` · `174269620415` · `174271786893`

Y el resto de la cadena:

- **9 filas en `cash_flows`** `income`/`booking` de $100 cada una — el fix W3 de ENS-21, que nunca se había visto en producción, funciona
- **6 emails `booking_confirmed`** y **9 `admin_new_booking`**, todos `sent`
- **`bookings`** en `confirmed`/`completed` con `deposit_status='paid'`
- La firma se validó con la clave productiva en todos los casos (hay fila en `processed_webhooks`)

**Sin evidencia en base, porque es visual**: que el jugador vea el QR y que `/reserva/[id]/verificar` lo valide, y el push al admin. Se cierran mirando, no consultando.

---

## 4. 🟡 Hallazgo — 2 de 6 señas no llegaron por webhook

Dos de los seis pagos aprobados **no fueron notificados por MercadoPago**. Los levantó el job de reconciliación, y se nota porque su `mp_event_id` no es un id de MP sino uno sintético (`reconcile-...`).

| Caso | Qué pasó | Desenlace |
|---|---|---|
| `174510158896` (18/8) | El webhook nunca llegó. Para cuando la reconciliación lo vio (19/8 14:40), el hold ya había vencido y la reserva estaba `expired` | `booking.late_payment_attempt` + email `admin_late_payment` al dueño + devolución registrada. **La plata no se perdió, pero el turno sí** |
| `174271786893` (23/8) | El webhook nunca llegó. La reconciliación lo levantó **5 minutos después**, todavía dentro del hold | Reserva `confirmed` normalmente. El jugador no se enteró de nada |

**Por qué importa.** Es un tercio de los pagos. Si la reconciliación no existiera, serían dos reservas pagadas y colgadas. Que la red de seguridad haya atrapado las dos es la buena noticia; que haga falta tan seguido es lo que hay que mirar.

**Los dos son del mismo complejo, y eso apunta a algo.** Las 4 señas de `complejo-titi` llegaron por webhook; las 2 que no llegaron son las 2 de `complejo-elite-futbol`. No es aleatorio: es por conexión.

Y la segunda cae **dentro de la ventana de la migración a dos aplicaciones**:

| Momento (UTC) | Qué pasó |
|---|---|
| 22/8 16:58 | Deploy de PR #194 — el buzón empieza a aceptar la firma de las dos apps |
| 22/8 17:00 | `complejo-titi` reconecta |
| 22/8 23:06 | `complejo-elite-futbol` se desconecta |
| 23/8 00:33 | Seña de titi — **webhook OK** |
| 23/8 00:50 | Seña de elite — **webhook ausente**, la levanta la reconciliación |
| 25/8 16:00 | `complejo-elite-futbol` reconecta de nuevo |

**Hipótesis principal**: elite quedó cobrando por la aplicación de Checkout Pro cuando esa aplicación todavía no tenía sus webhooks configurados en el panel de MercadoPago, o cuando `MP_WEBHOOK_SECRET_CHECKOUT` todavía no estaba en Vercel. Cualquiera de las dos da el mismo resultado —la notificación no llega o vuelve 401— y desde adentro de TurnoGol se ve igual: no llega y listo.

**Cómo se confirma, en 2 minutos y sin gastar nada.** Panel de MercadoPago → **Tus integraciones** → App B (Checkout Pro) → **Webhooks** → historial de notificaciones. Si hay 401 alrededor del 23/8 00:50, la clave estaba desalineada; si no hay ninguna entrega, la app no tenía configurada la URL. El procedimiento completo de verificación está en [`docs/operations/credenciales-mercadopago.md`](../operations/credenciales-mercadopago.md).

**Qué NO explica la hipótesis**: la señal del 18/8, que es anterior a toda la migración. Esa queda sin causa conocida, y por eso el chequeo de las dos aplicaciones hay que hacerlo igual antes de dar por buena la explicación fácil.

---

## 5. P-05 — el caso exacto no se probó; los dos peores sí

El ensayo pedía reservar, esperar unos 14 minutos y pagar sobre el filo, para ver que la reserva termine `confirmed` y no `expired`. **Eso no se hizo.**

Pero los dos casos de la sección anterior son el mismo riesgo en su forma más cruda —pago aprobado sin notificación— y los dos terminaron bien: uno confirmó dentro del hold, el otro expiró pero avisó y registró la devolución en vez de quedarse con la plata en silencio. El agujero de ENS-16 (expirar una reserva pagada **sin que nadie se entere**) no se reprodujo.

---

## 6. P-06 — el camino principal está probado, tres sub-casos no

**Probado** (4 cancelaciones dentro de política, con seña paga):

- `bookings.status='canceled_refunded'` + `deposit_status='refunded'` ✅
- Fila `payments` `type='refund'` por cada una ✅
- Email `booking_canceled` al jugador, 4 de 4 `sent` ✅
- **Complemento del no-show**: `eac7a427` quedó `no_show` + `deposit_status='captured'`, con `player.no_show_recorded` y `noshowCount=1`. La seña quedó en la caja del complejo ✅

**No probado:**

1. **Cancelar FUERA de política** → `canceled_no_refund` + `captured`. No existe ni un solo booking en ese estado. Es el caso que protege al complejo, y es el único de los dos que nunca se ejercitó.
2. **El botón "Ya devolví" con efectivo o transferencia** → no hay ninguna fila de egreso en `cash_flows` por una devolución. Las dos devoluciones saldadas se cerraron con scripts manuales, no con el botón.
3. **El webhook saldando solo** cuando el complejo devuelve desde el panel de MercadoPago. La devolución de `e03e2991` se hizo desde el panel, pero la fila local la cerró un script (`payment.refund_settled_manually`), no el webhook.

**Pendiente vivo**: `complejo-titi` tiene 2 devoluciones de $100 en `pending` desde el 22/8. Es tarea del complejo, no falla del sistema — pero también son la materia prima perfecta para cerrar los sub-casos 2 y 3.

---

## 7. 🔴 La premisa del reembolso automático parece haber sido demasiado amplia

`PR #203` y `PR #212` eliminaron el reembolso automático por API con esta justificación: *"MercadoPago deriva los permisos del PRODUCTO de la aplicación y ninguna concede `payments:refunds`, así que cada intento era un 403 garantizado"*.

**Hay una fila que dice lo contrario:**

```
id            901d06d6-079e-4c61-8a51-949003966a0c
tenant        complejo-elite-futbol
type          refund
status        approved
mp_payment_id 3199064441        <- id de devolución de MercadoPago
description   Refund of ffea2035-2fd0-4e21-b38f-694a58e74316
created_at    2026-08-23 00:58:25 UTC
```

Por qué esto sugiere que la devolución automática **sí se completó** esa vez:

- Es la **única** fila de devolución con `mp_payment_id`. Las otras dos que están `approved` lo tienen en `NULL` y además **dejaron rastro de que las cerró un script** (`payment.refund_settled_manually`, `payment.late_payment_refunded_manually`). Ésta no tiene ese rastro.
- No la pudo saldar el webhook: el último evento en `processed_webhooks` es de las 00:55:14, tres minutos **antes**.
- Se creó a las 00:58:25, y `PR #203` recién se mergeó a las 02:45 UTC del 24/8 — o sea que el camino automático **todavía estaba vivo** y corría sincrónico al cancelar.
- Los dos complejos están conectados a **cuentas de MercadoPago distintas** (`mpUserId` 381048203 vs 1059888348). Que una conceda el permiso y la otra no es posible, porque el permiso lo deriva el producto de la aplicación.

**Lectura honesta.** Los 403 eran reales, pero probablemente eran de **una** conexión, no de todas. La conclusión "ninguna aplicación concede el permiso" se generalizó desde ahí.

**Qué NO cambia esto.** La decisión de producto —*el complejo devuelve, TurnoGol facilita*— sigue en pie y no depende de esto. Un camino automático que funciona para algunos complejos y devuelve 403 para otros es **peor** que no tenerlo: promete algo que no puede cumplir de forma pareja, y deja al jugador esperando una plata que a veces vuelve sola y a veces no.

**Qué sí habría que corregir.** El *motivo* escrito en `CLAUDE.md`, en el plan y en los comentarios del código. Hoy dice "el permiso no existe" y lo correcto es "el permiso depende de la aplicación de cada complejo, así que no se puede prometer". Es la diferencia entre una imposibilidad técnica y una decisión de producto — y sólo la segunda es cierta.

**Cómo se confirma en 2 minutos**: consultar `GET /v1/payments/174271786893/refunds` con el token del complejo, o buscar la operación `3199064441` en el panel de MercadoPago de esa cuenta. Requiere el token productivo, así que lo corre Lazar.

---

## 8. Lo que queda, ordenado por lo que cuesta

| Falta | Costo |
|---|---|
| **P-02** — el débito del mes 2 | 30 días de espera. Hay que abrir una suscripción y **dejarla viva** |
| Cancelar fuera de política (`canceled_no_refund`) | 5 minutos |
| Botón "Ya devolví" en efectivo → egreso de caja | 5 minutos, usando una de las 2 devoluciones pendientes de titi |
| Webhook saldando una devolución hecha desde el panel de MP | 10 minutos, usando la otra |
| **P-04** — reenviar el mismo webhook desde el panel de MP | 5 minutos |
| QR + push al admin (lo visual de P-03) | 10 minutos |
| Confirmar el §7 contra la API de MercadoPago | 2 minutos |
