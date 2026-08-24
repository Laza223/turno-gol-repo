# Plan de ensayos obligatorios en producción real

> **Qué es esto**: la lista cerrada de cosas que *no se pueden dar por buenas sin ejecutarlas en producción*, con plata real, credenciales productivas y los crons corriendo solos. No es una suite de tests ni una recorrida de UI: eso ya está cubierto por `docs/qa/PROD_QA_2026-08-17.md` (23 hallazgos) y por el gate de CI. Esto es lo otro: **el circuito de dinero y el paso del tiempo**, que son las dos cosas que ningún test puede simular de verdad.
>
> **Regla de cierre**: un ensayo se cierra con evidencia — id de operación de MercadoPago, `SELECT` pegado, captura o log. "Debería andar" no cierra nada.
>
> **Precondición de todos**: los 6 🔴 de `PROD_QA_2026-08-17.md` arreglados y desplegados. En particular **F-002 (pool de Postgres agotado)**, porque un cron que no consigue conexión procesa 0 filas *en silencio* — con F-002 vivo, cualquier ensayo de los crons mide el pool, no la lógica.

---

## 0. Reparto de cuentas de MercadoPago

Hay **tres roles distintos** y solo dos cuentas disponibles. Alcanza, pero hay que respetar el reparto o los ensayos rebotan por auto-pago:

| Rol | Qué hace | Cuenta |
|---|---|---|
| **Master de TurnoGol** | Recibe tus suscripciones SaaS | Lazar |
| **Complejo** (OAuth de `complejo-elite-padel`) | Recibe las señas de los jugadores | Lazar |
| **Pagador** | Paga la suscripción (P-01) y las señas como jugador (P-03) | **Pareja** |

La regla es una sola: **la cuenta de la pareja paga siempre, la tuya cobra siempre.** Así ningún ensayo cae en el caso "pagarte a vos mismo", que MercadoPago rechaza.

**Verificar antes de empezar**: con qué cuenta quedó conectado el OAuth de `complejo-elite-padel`. Si por algún motivo quedó con la cuenta de tu pareja, P-03 se invierte (pagás vos) y todo lo demás sigue igual.

### ⚠️ El preapproval de P-01 debita todos los meses

La suscripción que abrís en P-01 queda atada a **la tarjeta de tu pareja** y le va a debitar $55.000 **cada mes, solo, hasta que la canceles**. No es un pago único.

Consecuencia práctica: en cuanto cierres **P-02** (el débito del mes 2, día 31), **dá de baja la suscripción**. Y eso no es limpieza: es el ensayo **P-13**, que va abajo.

---

## 1. Lo que ya se probó, y por qué no alcanza

El **Ensayo General del 2026-07-14** (`docs/qa/ENSAYO_GENERAL.md`) cubrió bastante más de lo que parece. Conviene tenerlo presente para no re-hacer trabajo:

| Ensayo | Resultado 2026-07-14 |
|---|---|
| K1 · Trial → suscripción paga | ✅ preapproval real, $55.000 approved, `trialing→active`, email `subscription_activated` |
| K2 · Cobro de suscripción rechazado | ✅ tarjeta OTHE, webhook firmado, `active→past_due`, dunning arrancado, email al dueño |
| K3/K4 · Dunning día 7 y día 14 | ✅ `past_due→suspended→blocked→churned` + `scheduled_deletion_at` exacto |
| K5 · Cancelación voluntaria | ✅ preapproval verificado `cancelled` en la API de MP |
| C1 · Seña de reserva pagada | ✅ tarjeta APRO, $4.500 (30% de $15.000), webhook, `confirmed`+`paid`, QR |
| D3 · Webhook duplicado | ✅ idempotencia perfecta, 1 sola fila en `processed_webhooks` |

**Corrección a lo que dije antes**: no es cierto que "el cobro nunca se probó". Se probó. Lo que pasa es que ese ensayo tiene cuatro diferencias con producción, y las cuatro son del tipo que rompe:

1. **Era MercadoPago sandbox.** Producción usa otro `MP_WEBHOOK_SECRET`, otro access token master y otros tokens OAuth por complejo. La firma HMAC del webhook se calcula con la clave productiva: si esa clave está mal seteada en Vercel, **todos los webhooks se rechazan y no se entera nadie** — el pago queda hecho en MP y la reserva colgada. Es exactamente la clase de error que ya te pasó con `ENCRYPTION_KEY` y con `WORKER_DATABASE_URL`.
2. **El código cambió.** Desde entonces entraron las migraciones 048–074: rediseño completo de Caja y Cantina, torneos, etiquetas de cliente, día operativo en caja. El ensayo validó una versión de hace un mes.
3. **El dunning se disparó a mano.** El ensayo llamó `runDunningSweep()` directo. En producción lo dispara pg-boss desde Railway a las 13:00 ART. Que la función funcione y que el cron la ejecute son dos afirmaciones distintas, y solo la primera está probada.
4. **El tiempo se falsificó.** Se backdatearon fechas. Eso prueba la máquina de estados local; **no prueba que MercadoPago debite solo a los 30 días**, que es de lo que depende que cobres.

---

## 1.b · P-00 · Limpiar la base y arrancar de cero

Decisión de Lazar (2026-08-17): hoy **todo lo que hay en producción son cuentas de prueba tuyas**, así que se limpia y se ensaya desde cero. Es la decisión correcta y además resuelve **F-004** (el marketplace público listando complejos basura) sin escribir una línea de código.

Pero "eliminar toda la DB" no es lo que querés hacer, y la diferencia importa:

| Lo que suena | Lo que pasa |
|---|---|
| "Borrar la base" | Te llevás el schema, las 74 migraciones aplicadas, los roles `turnogol_app`/`turnogol_worker`, las policies RLS y el schema `pgboss`. Es re-provisionar de cero, medio día de trabajo y varias formas de romperlo |
| **Lo que querés** | Cero tenants, cero jugadores, cero reservas. **Schema, roles, policies y catálogo intactos** |

### Lo que NO se toca

| Tabla | Por qué |
|---|---|
| `plans` + `price_versions` | Es el catálogo SaaS. Sin esto no podés suscribir a nadie, ni a vos en P-01 |
| `system_admins` | Te quedás sin panel de super-admin y sin forma de volver a entrar |
| `feature_flags` con `tenant_id IS NULL` | Son los defaults globales (entre ellos `tournaments` en `false`) |
| schema `pgboss` | Las colas y los schedules de los 15 workers |

### La oportunidad que se cierra el día que tengas un cliente

Vas a borrar datos igual. **Entonces tomá el backup antes, borrá, y restaurá ese backup en staging.** El peor caso es que pierdas datos que ibas a tirar. Eso cierra **P-11 (RESTORE-001)** — el drill que está documentado desde julio y nunca se ejecutó — con riesgo cero. **Esta ventana no vuelve a existir**: con un cliente real adentro, un restore drill pasa a ser una operación delicada.

### Secuencia

1. **Backup de producción**, con timestamp anotado. Es la red y a la vez el insumo de P-11.
2. **Borrar un tenant con el mecanismo del producto, no a mano.** Elegí uno, ponelo en `churned` con `scheduled_deletion_at` en el pasado, y dejá que corra el cron de retención (domingos 07:00 ART, o disparalo). Eso ejercita `purgeTenant` ([data-retention-cleanup.worker.ts:361-441](../../src/shared/jobs/workers/data-retention-cleanup.worker.ts)) en producción: 30 `DELETE` en orden de FK más la anonimización de la fila `tenants`. **Es obligación de la Ley 25.326 y nunca se ejecutó en producción.** Verificá que no quede ni una fila huérfana.
3. **El resto, por SQL directo.** Ya con el mecanismo validado en el paso 2, para los demás usá el mismo orden de borrado del worker (hijos antes que padres) y después **borrá la fila de `tenants`**, no la anonimices — el worker la deja como `[deleted]` por diseño de auditoría, pero vos querés cero filas.
4. **Los jugadores**: `player_favorites` → `reviews` → `player_tenant_relationships` → `players`.
5. **Supabase Auth, que es otra capa.** Borrar `players` y `staff_users` **no** borra los usuarios de Supabase Auth. Si no los borrás también (dashboard de Supabase → Authentication → Users), al registrarte de nuevo con el mismo mail Auth dice "ya existe" y la app no encuentra la fila — quedás trabado con tus propias casillas, que son justo las que vas a usar para ensayar.
6. **Restaurar el backup del paso 1 en staging** y contar filas. Cierra P-11.

### Dos consecuencias que conviene tener presentes

- **Perdés el OAuth de MercadoPago de `complejo-elite-padel`.** Hay que reconectarlo. No es pérdida: reconectarlo desde cero **es** el primer paso que va a dar tu cliente real, y así lo probás vos antes que él.
- **Las imágenes quedan en Cloudflare R2.** Logos y portadas de los complejos borrados siguen ocupando el bucket. No rompen nada; limpieza aparte cuando quieras.

**Después de P-00, el marketplace queda vacío.** Eso es lo correcto: mejor vacío que mostrando "Complejo random" de Neuquén. El primer complejo que aparezca ahí va a ser el de tu primer cliente.

---

## 2. Los ensayos

Doce, agrupados por lo que hace falta para ejecutarlos. El orden importa: el Grupo 0 hay que arrancarlo primero aunque los resultados lleguen último, porque el reloj no se puede apurar.

---

### Grupo 0 — Arranca hoy: el reloj tarda 30 días

#### P-01 · Tu propia suscripción, con plata real y cuenta productiva

**Qué prueba.** El único circuito por el que entra tu facturación: `/settings/facturacion` → "Activar plan" → preapproval real contra la cuenta master productiva de TurnoGol → pago → webhook firmado con la clave productiva → `trialing→active`.

**Precondición que puede frenar todo.** MercadoPago no siempre deja pagarle a tu propia cuenta con tu propia tarjeta. Hace falta que **el que paga sea una cuenta/tarjeta distinta de la cuenta master**. Si eso rebota, es hallazgo en sí mismo: un dueño de complejo también puede tener ese problema.

**Cómo se dispara.** Sobre un complejo de prueba en `trialing`, entrar como dueño → `/settings/facturacion` → elegir Predio mensual → pagar.

**Qué tiene que pasar, exacto.**
- `tenants.status`: `trialing → active`
- `tenant_subscriptions`: `status='active'`, `mp_subscription_id` seteado, `current_period_start`/`current_period_end` a 30 días, `last_payment_at` con fecha
- Email `subscription_activated` al dueño (llega de verdad a la casilla, no "queued")
- `audit_logs` con la transición

**Cómo se verifica.** `SELECT` sobre `tenants` + `tenant_subscriptions` + el id de operación de MP.

**Costo.** $55.000 que van de tu cuenta a tu cuenta master, menos la comisión de MercadoPago (el costo real del ensayo). Podés bajarlo creando un `price_version` temporal de monto chico, pero **no lo recomiendo**: MP trata distinto los montos chicos y querés probar exactamente lo que va a vivir el cliente.

**Tiempo.** 20 minutos. **Bloquea a P-02, que tarda 30 días.**

---

#### P-02 · El débito automático del mes 2

**Qué prueba.** Lo que P-01 *no* prueba: que a los 30 días MercadoPago **debite solo**, mande el `subscription_authorized_payment` recurrente, y el sistema renueve el período sin que nadie toque nada. Es la diferencia entre "cobré una vez" y "tengo un SaaS".

**Por qué no se puede acelerar.** El preapproval de MP tiene su propio calendario, del lado de MP. No hay time-travel posible: o esperás los 30 días, o no lo sabés.

**Qué tiene que pasar.**
- Débito automático en la cuenta master, sin intervención
- `tenant_subscriptions.current_period_end` corrido +30 días, `last_payment_at` actualizado
- El tenant sigue `active` (no cae a `past_due` por un webhook mal interpretado)

**Riesgo si falla y nadie mira.** Silencioso y caro: el cliente cree que paga, vos no cobrás, y la máquina de dunning puede empezar a escalarle el estado a alguien que está al día. **Poné un recordatorio en el calendario a 30 y a 31 días de P-01.**

**Tiempo.** 30 días de espera, 10 minutos de verificación.

---

### Grupo 1 — El circuito de plata del jugador (una tarde, coordinado)

Todo este grupo va sobre `complejo-elite-padel`, que ya tiene el OAuth de MercadoPago hecho, con una cancha a **$1** y seña al 100% para que cada ensayo cueste un peso.

#### P-03 · Seña real, de punta a punta

**Qué prueba.** El producto. Jugador reserva → paga la seña con MP productivo → webhook firmado con la clave productiva → reserva confirmada.

**Qué tiene que pasar.**
- `bookings.status`: `pending_payment → confirmed`; `deposit_status`: `pending → paid`
- Fila en `payments` con el `mp_payment_id` real y monto en centavos
- **Fila en `cash_flows`** `income`/`booking`/`mercadopago` (esto se agregó en el fix W3 de ENS-21 y nunca se vio en producción)
- La plata aparece en la caja del día del complejo
- El jugador ve el comprobante con QR; `/reserva/[id]/verificar` valida ese QR
- Push al admin del complejo (con el navegador con permiso concedido — nunca se verificó visualmente, quedó pendiente del ensayo anterior)

**El detalle que más importa.** Que el webhook **valide la firma con la clave productiva**. Si `MP_WEBHOOK_SECRET` en Vercel no es el de la app productiva de MP, el webhook se rechaza y la reserva queda en `pending_payment` hasta expirar, con la plata cobrada. Silencioso.

---

#### P-04 · El mismo webhook dos veces

**Qué prueba.** Idempotencia con la firma productiva. Se reenvía el mismo `mp_event_id` desde el panel de MercadoPago ("reenviar notificación").

**Qué tiene que pasar.** Una sola fila en `processed_webhooks`, un solo efecto, una sola línea en `cash_flows`. Cero doble cobro.

---

#### P-05 · Reserva pagada que estaba por expirar

**Qué prueba.** La carrera más peligrosa del sistema: el hold de 15 minutos venciendo mientras el jugador está pagando. En el ensayo anterior esto destapó **ENS-16** (se expiró una reserva ya pagada) y se arregló con un pre-check contra MP antes de expirar. **El fix nunca se ejecutó en producción.**

**Cómo se dispara.** Reservar, esperar ~14 minutos, pagar sobre el filo.

**Qué tiene que pasar.** La reserva termina `confirmed`, no `expired`. Si termina `expired` con el pago hecho, es 🔴 inmediato y frena la venta.

---

#### P-06 · Cancelación con reembolso real

**Qué prueba.** El camino de vuelta de la plata. Cancelar dentro de la política una reserva con seña pagada.

**Qué tiene que pasar.**
- `booking_status`: `canceled_refunded`; `deposit_status`: `refunded`
- **Reembolso visible en la cuenta de MercadoPago del complejo** (no solo la fila local)
- Contraasiento en `cash_flows`, y la caja del día cuadra
- Email al jugador

**Y el complemento**: cancelar fuera de política → `canceled_no_refund` + `captured`, sin reembolso, con la seña quedando en la caja del complejo.

---

#### P-07 · Un día operativo completo, cerrado

**Qué prueba.** Que la contabilidad de un día real cierre. No es un ensayo de MP: es el que te dice si el dueño puede confiar en el número.

**Cómo se dispara.** Sobre un solo complejo, en un solo día: abrir caja con fondo inicial → 1 reserva pagada con seña por MP (la de P-03) → 1 reserva cobrada en efectivo → 1 venta de cantina multi-ítem → 1 fiado entregado y cobrado → 1 gasto → cerrar el día contando la plata.

**Qué tiene que pasar.** `expected_cash` = fondo inicial + efectivo real, `diff_amount` = 0 si contaste bien, la seña de MP **no** contada como efectivo, y el ledger de `stock_movements` con una línea por ítem atada al mismo `cash_flow_id`.


**EJECUTADO 2026-08-24 — PASA.** En `complejo-titi`: esperado $9.100 = contado $9.100, `diff_amount = 0`. La reserva no-efectivo se hizo por transferencia en vez de MercadoPago (misma invariante, sin gastar plata otra vez). Detalle e invariantes verificadas: [P07-dia-operativo-guion.md](P07-dia-operativo-guion.md).

---

### Grupo 2 — Los crons corriendo solos (48 horas de observación, cero trabajo manual)

Este grupo no se "ejecuta": se **mira**. Son 15 workers, y hoy no hay evidencia de que ninguno haya corrido en producción por su cuenta.

#### P-08 · Que los crons hayan corrido de verdad

**Qué prueba.** Que pg-boss en Railway esté disparando los schedules. Los que importan y su horario:

| Worker | Cuándo | Qué pasa si no corre |
|---|---|---|
| `expire-pending-booking` (sweep) | cada 5 min | Slots ocupados para siempre por reservas que nadie pagó |
| `reconcile-pending-payments` | cada 5 min | Pagos huérfanos: cobrados en MP, sin reserva confirmada |
| `health-ping` | cada 5 min | Te quedás sin señal de vida del worker |
| `reconcile-accounting-drift` | cada hora | Diferencias entre MP y tu caja que nadie detecta |
| `refresh-mp-tokens` | cada 4 h | **Los tokens OAuth de los complejos vencen y dejan de poder cobrar** |
| `generate-abonado-slots` | 06:00 ART | Los turnos fijos dejan de generarse |
| `expire-trials` | 08:00 ART | Los trials vencidos no se bloquean: regalás el producto |
| `daily-summary` | 08:00 ART | El dueño no recibe su resumen |
| `dunning-retry` | 13:00 ART | **Nadie escala a los que no pagan** |
| `data-retention-cleanup` | domingos 07:00 ART | Incumplimiento de retención (Ley 25.326) |

**Cómo se verifica.** `SELECT name, MAX(created_on) FROM pgboss.job GROUP BY name` en producción, después de 48 h corridas. Cualquier cola cuyo último job sea más viejo que su período es un 🔴.

**Ojo con esto.** Los crons registrados sin `SendOptions` corren con `retryLimit=0` real: si uno falla, no reintenta — espera al próximo tick. Un cron diario que falla es un día perdido, no un reintento.

---

#### P-09 · Un trial que vence solo

**Qué prueba.** Que `expire-trials` bloquee de verdad a las 08:00 ART, sin que nadie lo llame.

**Cómo se dispara.** Sobre un complejo de prueba, poner `trial_ends_at` en el pasado (por SQL, un solo `UPDATE`) y **esperar al cron**. No llamar la función a mano — eso es lo que ya se probó.

**Qué tiene que pasar.** `trialing → blocked`, `tenant_subscriptions` sincronizada, `audit_logs` con la transición, y el dueño rebotado a la pantalla de reactivación (no a un 500 ni a un panel a medias).

---

#### P-10 · Dunning completo, con un rechazo real

**Qué prueba.** Lo que te protege de regalar el producto. Encadena con P-01: sobre esa suscripción activa, forzar un cobro rechazado real (tarjeta sin fondos) y **dejar correr el calendario**.

**Qué tiene que pasar, día por día.**
- Día 0: `active → past_due`, email `dunning_payment_failed`, y el dueño **sigue operando** con el banner "Tu pago falló"
- Día 7: `past_due → suspended` por el cron de las 13:00 (no a mano)
- Día 14: `suspended → blocked`, panel bloqueado, página pública del complejo mostrando "no está disponible temporalmente"
- En cualquier punto: pagar debe devolverlo a `active` sin quedar trabado

**El riesgo que hay que mirar con más cuidado** es el inverso al obvio: que el sistema bloquee a alguien que **sí** pagó. Un falso positivo acá te cuesta el cliente entero.

---

### Grupo 3 — Lo que pasa cuando algo se rompe

#### P-11 · Restore de backup, ejecutado

**Qué prueba.** Que puedas recuperar la base. `RESTORE-001` está documentado y **nunca se ejecutó** ([LAUNCH_BACKLOG.md:21](../launch/LAUNCH_BACKLOG.md:21)), bloqueado por `STAGING-001`. Con complejos de prueba es un papel; con la caja de un cliente real es la diferencia entre "perdimos una tarde" y "perdimos el cliente".

**Cómo se dispara.** Provisionar el proyecto Supabase de staging (`STAGING-001`), restaurar ahí el backup de producción de anoche, y **contar filas**: tenants, bookings, cash_flows, payments.

**Qué tiene que salir.** El RTO real (cuánto tardaste) y el RPO real (cuánta plata/reservas se perderían). Los dos números van al `RISK_REGISTER.md` como hechos, no como estimaciones.

**Beneficio colateral.** Cerrar `STAGING-001` significa que el próximo fix se prueba fuera de la base de tu cliente. Hoy no existe ese lugar.

**EJECUTADO 2026-08-24 — PASA, y por un camino más barato que el previsto.** No hizo falta provisionar STAGING-001: el dashboard de Supabase tiene "Restore to new project", que restaura un backup a un proyecto nuevo sin tocar producción. Se restauró el backup del 24/08 03:45 UTC a un proyecto efímero, se verificaron los conteos (predichos antes de mirar, los seis exactos), 101 policies RLS, 2 roles, 7 extensiones y 5 `auth.users`, y se borró el proyecto. **RTO de la base: < 5 min. RPO real: hasta 24 h.** Hallazgo del ensayo: **PITR no está habilitado** — es un add-on sin contratar, contra lo que afirmaba el `RISK_REGISTER.md`. Detalle: [2026-08-24-drill.md](../audit/backup-drills/2026-08-24-drill.md).

---

#### P-12 · El worker caído

**Qué prueba.** Que te enteres. Hoy la CSP venía reportando violaciones desde el primer deploy a `/api/csp-report` y **nadie miraba el buzón** — eso no es un bug de la CSP, es la señal de que hay canales de alerta montados que no llegan a una persona.

**Cómo se dispara.** Parar el worker de Railway 20 minutos.

**Qué tiene que pasar.** Que algo te avise (Sentry, el health-ping, un mail). Si en 20 minutos no te llegó nada, el hallazgo es que **no tenés monitoreo**, y eso importa más que cualquiera de los 23 hallazgos del QA: significa que el primer cliente se entera antes que vos.

**Y de paso**: con el worker parado, verificar que la web siga funcionando (reservar, cobrar, cerrar caja). Si la web se cae porque el worker no está, tenés un acoplamiento que no debería existir.

**EJECUTADO 2026-08-24 — el ensayo PASA y el resultado es el peor posible: no llegó ningún aviso.** Se removió el deployment de Railway y el worker estuvo 26 minutos caído (14:11–14:37 ART). Ni Sentry, ni el health-ping, ni un mail. Cuatro causas verificadas: la sonda de salud corre DENTRO del worker (muere con él), no hay cron monitors de Sentry, no hay monitor externo (`/api/status` recibió 2 requests en 45 min y los dos eran de la prueba), y `/api/status` **responde `ok` con el worker muerto** porque mide la conexión a pg-boss desde la web, no si hay consumidor. Lo bueno: la web siguió operando (se creó una reserva) y al volver el worker drenó los 26 jobs encolados en menos de 2 minutos, 0 fallidos — una caída retrasa trabajo, no lo pierde. Detalle y recomendación: [P12-worker-caido-2026-08-24.md](P12-worker-caido-2026-08-24.md).

---

#### P-13 · Dar de baja tu propia suscripción

**Qué prueba.** Dos cosas a la vez: que **le cortes el débito recurrente a la tarjeta de tu pareja**, y que el camino de baja funcione en producción. No es opcional ni es solo limpieza — la Res. 424/2020 exige que la baja sea tan fácil como el alta, y un cliente que no puede darse de baja es un reclamo.

**Cuándo.** Apenas cierres P-02 (día 31). Ni antes — necesitás el débito del mes 2 para P-02 — ni después, porque cada mes que pase es otro débito.

**Cómo se dispara.** `/settings/facturacion` → "Cancelar suscripción" → motivo → confirmar. (El botón existe desde el fix W8; en el ensayo anterior el endpoint funcionaba pero **no lo llamaba nadie desde la UI** — eso fue el hallazgo ENS-25.)

**Qué tiene que pasar, exacto.**
- El preapproval queda **`cancelled` en la API de MercadoPago**, no solo local. Verificalo del lado de MP: si queda vivo ahí, sigue debitando.
- `tenant_subscriptions`: `canceled` + `canceled_at` + motivo
- **Seguís entrando al panel hasta `current_period_end`** — pagaste el mes, lo usás. (Un lockout inmediato acá fue el bug ENS-26, arreglado y nunca verificado en producción.)
- Al vencer el período: el sweep de dunning lo pasa a `blocked`, los abonados quedan `canceled` y las reservas futuras se eliminan.

**Verificación de que el débito murió de verdad.** El día 61, mirar la tarjeta de tu pareja: **no tiene que haber un tercer débito**. Es el único cierre que vale.

---

## 3. Orden y calendario

| Cuándo | Qué |
|---|---|
| **Antes que nada** | Los 6 🔴 del QA arreglados y desplegados (sobre todo F-002) |
| **Día 0** | **P-00** — backup, limpiar la base, restaurar en staging (cierra P-11 de paso) |
| **Día 1, mañana** | **P-01** (tu suscripción real) — arranca el reloj de 30 días |
| **Día 1, tarde** | **P-03 → P-07** (el circuito del jugador, una tarde coordinada) |
| **Día 1, después de P-01** | **P-10** día 0 (forzar el rechazo) — arranca el reloj de 14 días |
| **Día 2, 3** | **P-08** (leer `pgboss.job` tras 48 h) · **P-09** (trial vencido) |
| **Día 3-5** | **P-11** (staging + restore) · **P-12** (worker caído) |
| **Día 8** | **P-10** día 7 → `suspended` |
| **Día 15** | **P-10** día 14 → `blocked` |
| **Día 31** | **P-02** — el débito automático del mes 2 |
| **Día 31, inmediatamente después** | **P-13** — dar de baja, para cortarle el débito a la tarjeta de tu pareja |
| **Día 61** | Confirmar que **no hubo** un tercer débito |

**Lectura honesta del calendario**: podés vender el día 5 asumiendo el riesgo de P-02 y del tramo largo de P-10, o esperar 31 días para saberlo todo. **Vender el día 5 es defendible** si arrancaste P-01 el día 1 y tenés el recordatorio puesto: el peor caso es que el mes 2 no cobre y lo arregles antes de que el cliente lo note. Vender sin P-01 arrancado no es defendible: no tenés forma de enterarte hasta que un cliente te reclame.

---

## 4. Criterio de vendible

Se puede vender cuando, con evidencia pegada:

- [ ] Los 6 🔴 del QA cerrados y verificados en producción
- [ ] **P-03**: una seña real entró, se acreditó y aparece en la caja del complejo
- [ ] **P-05**: una reserva pagada sobre el filo del hold terminó confirmada, no expirada
- [ ] **P-06**: un reembolso real salió y se ve en MercadoPago
- [x] **P-07**: un día operativo cerró con `diff_amount = 0` — 2026-08-24 en `complejo-titi`, esperado $9.100 = contado $9.100 ([registro](P07-dia-operativo-guion.md))
- [ ] **P-01**: tu suscripción está `active` y cobrada de verdad
- [x] **P-08**: los 15 workers con último job dentro de su período — 2026-08-24: 15/15, 48 h corridas, **0 fallados** ([registro](P08-crons-2026-08-24.md))
- [x] **P-12**: **CERRADO 2026-08-24**. El ensayo salió mal (26 min caído, cero avisos) y el hallazgo se arregló el mismo día: `/api/status` detecta el worker muerto y hay un monitor externo que avisa por mail, probado de punta a punta ([registro](P12-worker-caido-2026-08-24.md))
- [x] **P-11**: existe un backup restaurado, con RTO y RPO medidos — 2026-08-24: RTO < 5 min, RPO hasta 24 h (PITR NO contratado) ([drill](../audit/backup-drills/2026-08-24-drill.md))

Los tres que quedan (**P-02**, **P-09**, el tramo largo de **P-10**) son de reloj: se cierran solos si están arrancados. Lo que **no** es aceptable es venderlos sin arrancar — el primer cliente sería el experimento.

**P-13 no es de reloj: es una obligación con fecha.** Va el día 31 sí o sí, o le seguís debitando $55.000 por mes a la tarjeta de tu pareja.
