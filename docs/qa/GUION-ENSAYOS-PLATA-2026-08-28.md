# Guion de la sesion de ensayos de plata — bloques A y B

> Para arrancar una sesion nueva sin releer nada. El plan completo es
> [PLAN_HOY_2026-08-25.md](PLAN_HOY_2026-08-25.md); este documento es solo la
> puesta en marcha de sus dos primeros bloques, con las precondiciones ya
> verificadas el 2026-08-28 y los pasos en el orden en que hay que hacerlos.

## Que se esta probando, en criollo

TurnoGol cobra por dos caminos distintos y cada uno usa una aplicacion de
MercadoPago diferente:

- **La suscripcion**: el complejo le paga el plan mensual a TurnoGol. Cobra la
  cuenta de Lazar, con el token que vive en el entorno.
- **La sena**: el jugador le paga una parte del turno al complejo. Cobra la
  cuenta del complejo, conectada por OAuth.

Hasta el 2026-08-22 habia una sola aplicacion, asi que **todo lo que se probo
antes de esa fecha se probo con una sola**. Que los avisos de una funcionen no
dice nada de la otra, y desde adentro de TurnoGol un aviso rechazado se ve igual
que uno que nunca llego.

El bloque A comprueba que las credenciales de las dos aplicaciones funcionan, sin
gastar un peso. El bloque B arranca la suscripcion real y **la deja viva**: es lo
unico que necesita 30 dias de calendario y no tiene atajo, asi que cada dia que
no arranca es un dia mas lejos de saber si la renovacion automatica anda.

## Precondiciones — verificadas el 2026-08-28, no hace falta rehacerlas

| Que                                                                | Estado                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Los dos fixes de plata del QA (#251 y #252) estan en produccion    | Deploy `b39c982c` y `3282b709`, los dos `READY` / production en Vercel                                                        |
| El bug que guardaba 100x de mas dejo datos corruptos en produccion | **No.** Los dos complejos publican `$ 100/turno` en `/explorar`; el fix no incluyo migracion ni backfill porque no hizo falta |
| Los scripts de sonda existen                                       | `scripts/probe-mp-webhook-signature.ts` y `pnpm launch:check` (sondas `mp master token probe` y `mp credentials probe`)       |
| El plan de prueba de $100 se puede elegir desde la pantalla        | **No.** Ver el paso B0                                                                                                        |

## Bloque A — credenciales · ~30 min · $0

Condicionan todo lo demas: si el token master no es el de la cuenta correcta, los
$100 del bloque B se tiran. Los corre Lazar porque piden secretos de produccion.

**A1.** Las sondas de credenciales:

```bash
LAUNCH_CHECK_ENV_FILE=.env.production pnpm launch:check --probe-only
```

Las dos lineas que importan: `mp credentials probe (Checkout Pro)` espera un
**400**, y `mp master token probe (Suscripciones)` espera **200** e imprime el id
de cuenta. **Ese id tiene que ser el tuyo** — es el chequeo que de verdad importa,
porque un token valido de la cuenta equivocada da 200 igual.

### Resultado de A1 — 2026-08-28, CERRADO

```
mp credentials probe (Checkout Pro)...   credenciales aceptadas          OK
mp master token probe (Suscripciones)... cuenta <id> (FEIJOOLAZARO)      OK
```

Las dos aplicaciones responden y **el id de cuenta del token master es el del
dueno**, que es lo que decide si los $100 del bloque B se cobran a la cuenta
correcta. (El numero de cuenta no se transcribe aca: este repo es publico.)

**Sobre el resto del output de ese comando**: `.env.production` local es del
2026-07-31 y le faltan variables que nacieron despues (las dos aplicaciones de MP
son del 22/8). Sus 7 fallas son del archivo, no de produccion — dos pruebas de eso
en la misma corrida: el error de `r2 public domain probe` es `media.turnogol.com`,
el dominio inexistente **ya corregido en produccion** (B-14, PR #246), y
`/api/status healthy` dio OK. La unica que queda sin explicar es
`resend probe (email) HTTP 400`, que con una `RESEND_API_KEY` de hace un mes no se
puede distinguir de una clave rotada. No bloquea el bloque B.

**A2 y A3.** La firma de los avisos, una vez por aplicacion. Las dos tienen que
dar 200:

> **La clave se saca del panel de MercadoPago, no de `.env.production`.** Esta
> sonda comprueba que la clave que tiene Vercel coincide con la que tiene
> MercadoPago; si se le pasa la del archivo local, un 200 solo prueba que Vercel
> guarda esa misma clave vieja. El test se vuelve circular.

```bash
$env:MP_WEBHOOK_SECRET="<clave de Suscripciones>"; pnpm tsx scripts/probe-mp-webhook-signature.ts 9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6
```

```bash
$env:MP_WEBHOOK_SECRET="<clave de Checkout Pro>"; pnpm tsx scripts/probe-mp-webhook-signature.ts 9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6
```

### Resultado de A2 y A3 — 2026-08-28

| Aplicacion       | Resultado                                                                          |
| ---------------- | ---------------------------------------------------------------------------------- |
| Suscripciones    | `HTTP 200 — {"ok":true,"ignored":"sonda_de_firma"}` — la clave del deploy coincide |
| **Checkout Pro** | 401 al primer intento; **200 despues de rotar la clave y redeployar**              |

Las claves se sacaron de "Credenciales de produccion" del panel de MercadoPago, asi
que el 401 no es el falso positivo circular de usar el archivo local.

#### El 401 de Checkout Pro — CERRADO el 2026-08-28

Se roto la clave de webhook de Checkout Pro en el panel de MercadoPago, se cargo en
el entorno Production de Vercel y se redeployo (`dpl_ChA5w5...`, `READY`). La sonda
volvio a correr contra ese deploy y dio **200**: los avisos de pago de las senas ya
se aceptan en produccion. Lo que sigue queda como registro de que era y por que
pudo pasar callado.

Checkout Pro es la aplicacion con la que **cada complejo cobra la sena del
jugador**. Que su firma se rechace quiere decir que, en produccion, el aviso de
pago de una sena entra y TurnoGol lo descarta.

El codigo esta bien: `verifyWebhookSignature`
([webhook-auth.ts](../../src/modules/payments/webhook-auth.ts)) arma `secrets` con
las dos claves y prueba las dos. El 401 sale de la configuracion — o
`MP_WEBHOOK_SECRET_CHECKOUT` no esta en el entorno Production de Vercel, o esta con
un valor distinto al del panel. Pudo pasar en silencio porque la variable esta
declarada `.optional()` en [env.ts:46](../../src/shared/env.ts:46): si falta, el
build no falla y nada avisa.

**La cadena de dano, verificada en codigo:**

1. El jugador paga la sena en MercadoPago.
2. MercadoPago avisa, firmado con la clave de Checkout Pro.
3. TurnoGol responde **401** y no procesa nada.
4. La reserva se queda en `pending_payment`.
5. La red de seguridad es el cron `reconcile-pending-payments`
   ([:252](../../src/shared/jobs/workers/reconcile-pending-payments.worker.ts:252)),
   que corre `*/5 * * * *` y filtra `b.created_at < NOW() - INTERVAL '5 minutes'`.
6. El hold vence a los **6 minutos** (`DEFAULT_EXPIRY_SECONDS`). **La ventana real
   de rescate es de ~1 minuto**, y solo si el tick del cron cae adentro.
7. Si no la agarra: la reserva expira con el jugador ya pagado, y el segundo pase
   la manda al camino de pago tardio — registra la devolucion pendiente y avisa al
   complejo y al jugador.

#### La hipotesis de las senas perdidas: REFUTADA, medida el 2026-08-28

Se planteo que el 401 explicaba los dos pendientes que el handoff del 25/8 habia
dejado sin causa. Consultada la base de produccion, no es asi:

| Lo que decia el handoff                                            | Lo que dicen los datos                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "2 de 6 senas no llegaron por webhook, las dos del mismo complejo" | Las dos son de **Elite**, no de titi. Y una es del 18/8 19:13, anterior al primer registro de `analytics_events` (18/8 17:48) y de `processed_webhooks` (19/8 11:40): su "no llego" es falta de datos, no evidencia. La otra (22/8 21:50) la levanto el cron de rescate                                   |
| "`complejo-titi` debe 2 devoluciones de $100 desde el 22/8"        | **Confirmado**: dos filas `payments` type `refund` en `pending`, $100 cada una, del 22/8 12:07 y 21:33                                                                                                                                                                                                    |
| El 401 causo esas devoluciones                                     | **No.** Las dos senas originales tienen `mp.webhook.processed` — llegaron por aviso — y las reservas quedaron `canceled_refunded` correctamente. Lo que esta pendiente es la **devolucion**, no el cobro, y eso es el diseno: TurnoGol no reembolsa por API, la hace el complejo y el sistema la registra |

**El 401 no alcanzo a hacer dano.** La ultima sena de produccion es del 2026-08-22
21:50; la clave se rompio con la migracion a dos aplicaciones y no hubo ni un cobro
de sena en la ventana rota. La sonda lo agarro antes que un jugador.

**Consecuencia para el plan**: el bloque C va a ser **el primer cobro de sena que
pase por la aplicacion de Checkout Pro**. Nunca se ejercio con plata real, asi que
no alcanza con que el pago salga bien — hay que ver la fila en `payments` con
`mp_payment_id` y el aviso procesado.

#### Como se arreglo, y el blindaje que quedo

1. Clave de webhook de Checkout Pro rotada en el panel de MercadoPago.
2. Cargada en Vercel → Settings → Environment Variables → entorno **Production**.
3. **Redeploy** — Vercel no aplica una variable nueva a un deploy que ya existe.
4. Sonda de A3 de nuevo: **200**.

**Blindaje** (sin commitear al momento de escribir esto): el 401 era mudo. `rechazar`
loguea `warn`, que no llega a Sentry, y no distinguia "falta la clave" de "la firma no
coincide" — por eso esto pudo estar roto sin que nadie se enterara. Ahora, cuando se
rechaza una firma **y** alguna de las dos claves no esta configurada, sale un
`logger.error` que si llega a Sentry y dice cual falta. Con las dos claves puestas
sigue siendo `warn`, para que golpear el endpoint no llene Sentry de ruido.

No se toco el `.optional()` de `env.ts`: esa decision esta documentada ahi y es
correcta — exigir la clave apagaria toda la app si un deploy le gana a la carga de la
variable. El blindaje avisa, no apaga.

Regresion cubierta en `tests/unit/mp-webhook-rechazo-observable.test.ts`.

**A4.** Del lado de MercadoPago: panel → Tus integraciones → **cada aplicacion** →
Webhooks → historial.

### Resultado de A4 — 2026-08-28, leido del panel

Cual es cual, confirmado en el propio panel (el sidebar de cada una lo dice):

| Aplicacion          | Numero           | Es la de                                           |
| ------------------- | ---------------- | -------------------------------------------------- |
| **TurnoGol Cobros** | 345699471468974  | "Integracion con CheckoutPro" — las **senas**      |
| **TurnoGol**        | 1654083475779552 | "Integracion con Suscripciones" — el **plan SaaS** |

**Suscripciones — ultimo mes, 6 notificaciones:**

| Estado            | Evento                     | Recurso      | Fecha (UTC) |
| ----------------- | -------------------------- | ------------ | ----------- |
| **400 - Fallida** | `application.deauthorized` | 381048203    | 22/08 13:44 |
| 200 - Entregada   | `payment.created`          | 174269620415 | 23/08 00:33 |
| 200 - Entregada   | `payment.created`          | 174177392859 | 22/08 15:07 |
| 200 - Entregada   | `payment.updated`          | 175029618908 | 21/08 23:01 |
| 200 - Entregada   | `payment.updated`          | 173833098759 | 20/08 14:47 |
| 200 - Entregada   | `payment.updated`          | 173841538187 | 20/08 15:31 |

**Checkout Pro — ultimo mes, 1 sola notificacion:**

| Estado            | Evento            | Recurso      | Fecha (UTC) |
| ----------------- | ----------------- | ------------ | ----------- |
| **401 - Fallida** | `payment.updated` | 174271786893 | 23/08 00:50 |

**Lecturas:**

1. **El 401 queda confirmado del lado de MercadoPago**, no solo por la sonda. Es la
   unica notificacion que la app de Checkout Pro emitio en su historia, y fallo. Ya
   esta arreglado (clave rotada + redeploy + sonda en 200).
2. **Las senas de titi cobraban por la app de Suscripciones**, no por Checkout Pro:
   sus `payment.created`/`payment.updated` figuran en el historial de esa app, todos
   en 200. Por eso llegaban por aviso y por eso el 401 no las afecto — la refutacion
   de la seccion anterior se sostiene.
3. **El bloque C sera el primer cobro real que pase por Checkout Pro.** Esa
   aplicacion tiene una sola notificacion en toda su historia y fallo.

#### 🟡 Hallazgo nuevo: `application.deauthorized` se descarta con 400

TurnoGol **no maneja ese evento** — `grep` sobre `payment.schema.ts`,
`mp-webhook.handler.ts` y el route handler no devuelve nada. MercadoPago lo emite
cuando un complejo **desvincula su cuenta de cobro**, y llega por el canal global
(sin `?tenant=`), asi que el route corta con 400 antes de mirar nada.

Consecuencia con clientes reales: un complejo que desconecta su MercadoPago **desde
el panel de MercadoPago** en vez de desde TurnoGol deja al sistema creyendo que el
token sigue vivo. El portal seguiria exigiendo sena y el jugador se comeria el error
al momento de pagar. Emparenta con F-003 de PROD_QA ("sena exigible sin MercadoPago
conectado"), que sigue sin re-verificar.

El 400 del 22/08 13:44 es de la cuenta del dueno y coincide con la migracion a dos
aplicaciones, asi que hoy no hay dano: es la desvinculacion de la app vieja.

**Si A1 no imprime tu id de cuenta, parar aca.** No sigas al bloque B.

## Bloque B — arrancar el reloj de 30 dias · ~30 min · $100

Necesita a Tiziana con su MercadoPago a mano.

**B0. Prender el plan de prueba, con Tiziana ya lista para pagar.** — paso que el plan del 25/8 no menciona y sin el
cual los demas no se pueden hacer. El plan "Prueba interna — NO OFRECER" ($100/mes)
esta en `is_active = false`, y las dos pantallas que lo listarian filtran por
`is_active = true` (`billing.service.ts:97` y `super-admin/tenants.service.ts:180`),
asi que hoy no aparece en ningun lado. Desde el editor SQL de Supabase, sobre la
base de produccion:

```sql
UPDATE plans SET is_active = true WHERE name ILIKE '%prueba interna%';
```

Confirmar que devolvio **exactamente 1 fila** antes de seguir.

**Quien puede ver el plan mientras esta prendido** — medido el 2026-08-28, no asumido:

| Superficie                             | Lo muestra?                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/precios`, la pagina publica          | **No.** Usa `plans-data.ts`, un archivo estatico; no lee la tabla `plans`                                            |
| `/settings/facturacion` de un complejo | Solo si ese complejo esta en `trialing` o `active` y abre la pantalla durante la ventana (`facturacion/page.tsx:86`) |
| Panel de super admin                   | Si, pero ese sos vos                                                                                                 |

Con dos complejos en produccion y los dos propios, la exposicion real de la ventana
es nula. Aun asi, prendelo recien cuando Tiziana este por pagar y apagalo apenas
termine: la ventana deberia durar minutos, no horas.

**B1.** Entrar como admin de `complejo-titi`.

**B2.** En `/settings/facturacion`, verificar que "Cuenta de MercadoPago para
pagar" tenga cargado el mail de Tiziana. **Elite no sirve para esto**: su cuenta de
MercadoPago es la misma que cobra las suscripciones, y MercadoPago rechaza que una
cuenta se pague a si misma.

El dato vive en `tenant_subscriptions.mp_payer_email` (no en `tenants`), asi que se
puede confirmar sin abrir la pantalla:

```sql
SELECT t.slug, ts.status, ts.mp_payer_email, ts.mp_subscription_id
FROM tenant_subscriptions ts JOIN tenants t ON t.id = ts.tenant_id
WHERE t.name ILIKE '%titi%';
```

**B3.** Elegir el plan de $100 mensual.

**B4.** Tiziana paga en el checkout de MercadoPago.

**B5. La evidencia que cierra el bloque** — las tres cosas, no una:

```sql
SELECT ts.status, ts.mp_subscription_id
FROM tenant_subscriptions ts JOIN tenants t ON t.id = ts.tenant_id
WHERE t.name ILIKE '%titi%';
```

`status = 'active'`, `mp_subscription_id` no nulo, y una fila nueva en `audit_logs`.
El id de suscripcion de MercadoPago es un **hash alfanumerico**, no un numero: si
ves letras, esta bien.

**B6. No cancelarla.** Dejarla viva es el ensayo. El proximo debito cae a los 30
dias y es lo unico que va a estar esperando al calendario.

## Al terminar

Apagar el plan de prueba para que no le aparezca a ningun complejo:

```sql
UPDATE plans SET is_active = false WHERE name ILIKE '%prueba interna%';
```

**Apagarlo no rompe la suscripcion que quedo viva.** Los tres lugares que leen el
plan de una suscripcion en curso hacen `JOIN plans p ON p.id = ts.plan_id` **sin
filtrar `is_active`**: el cron de reconciliacion
(`reconcile-subscriptions.worker.ts:346`), el estado de la suscripcion
(`billing.service.ts:816`) y el dunning (`dunning.service.ts:87`). El filtro por
`is_active` vive unicamente en `loadPlan`, que solo corre al dar de alta o cambiar
de plan.

**La excepcion, que importa para el ensayo de dunning (P-10)**: reactivar una
suscripcion cancelada, suspendida o bloqueada **si** pasa por `loadPlan`
(`billing.service.ts:283` y `:698`) y fallaria con `PlanNotFoundError` si el plan
esta apagado. Si en algun momento hay que reactivar la de Tiziana, hay que volver a
prender el plan primero.

Y anotar en `PLAN_HOY_2026-08-25.md` que A y B quedaron cerrados, con la fecha del
debito que hay que vigilar.

## Antes del bloque C: quien decide por que aplicacion sale cada cobro

**No se configura en TurnoGol.** Lo decide MercadoPago segun con que credencial se
creo la operacion:

| Cobro                     | Credencial que lo crea                                  | Aplicacion que notifica                                          |
| ------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Suscripcion del plan SaaS | `MP_TURNOGOL_ACCESS_TOKEN` (`billing.gateway.ts:20`)    | la duena de ese token                                            |
| Sena del jugador          | el token OAuth guardado del complejo (`mp-oauth.ts:37`) | **la duena del `MP_CLIENT_ID` con el que ese complejo autorizo** |

De ahi la consecuencia que no es obvia: **cambiar `MP_CLIENT_ID` en Vercel no migra
los tokens ya guardados**. Un complejo que autorizo cuando la variable apuntaba a la
aplicacion vieja sigue cobrando por la vieja hasta que **reconecte**.

**Estado medido el 2026-08-28:**

| Complejo              | Cuenta MP         | `mp_connected_at` | Cobra por                                                                         |
| --------------------- | ----------------- | ----------------- | --------------------------------------------------------------------------------- |
| complejo titi         | TIZIANALISANTI.TL | 22/08 14:00       | **Suscripciones** (la vieja) — sus `payment.*` figuran en el historial de esa app |
| Complejo Elite Futbol | FEIJOOLAZARO      | 28/08 17:00       | Checkout Pro — su `174271786893` figura en el historial de esa app                |

**Por eso el bloque C, tal como estaba escrito, no probaria Checkout Pro**: una sena
en titi volveria a salir por la aplicacion de Suscripciones.

### 🔴 CERRADO el 2026-08-28 18:30 — `MP_CLIENT_ID` apuntaba a una aplicacion vieja

**Resuelto.** Se cambio el par `MP_CLIENT_ID`/`MP_CLIENT_SECRET` por el de
**TurnoGol Cobros** (Checkout Pro), se redeployo y se reconectaron los dos
complejos. Medido en la base al terminar:

| Complejo              | Cuenta MP                      | `mp_connected_at` | token + refresh |
| --------------------- | ------------------------------ | ----------------- | --------------- |
| Complejo Elite Futbol | FEIJOOLAZARO (381048203)       | 28/08 18:30       | si              |
| complejo titi         | TIZIANALISANTI.TL (1059888348) | 28/08 18:12       | si              |

**Lo que eso prueba, ademas de arreglar el caso**: dos autorizaciones nuevas
completaron el flujo entero, asi que **un complejo nuevo ya puede conectar su
MercadoPago** — que era lo que bloqueaba vender.

Los dos tokens los emitio ahora la aplicacion de Checkout Pro, asi que sus senas
deberian notificar por ahi. La confirmacion definitiva es el bloque C: la proxima
sena tiene que aparecer en el historial de webhooks de **TurnoGol Cobros**.

Lo que sigue queda como registro de que era y como se diagnostico.

#### Como era el problema

El `client_id` que usa produccion se leyo **de la URL de autorizacion**, sin mirar
ninguna variable: entrar como admin a `/api/mp/oauth-start` redirige a
`auth.mercadopago.com.ar/authorization?client_id=...`.

```
client_id=6071527690767040
```

Contra los Client ID reales, leidos de "Credenciales de produccion" de cada
aplicacion (en MercadoPago el Client ID **es** el numero de aplicacion — se
verificaron los dos):

| Aplicacion                     | Client ID                                   |
| ------------------------------ | ------------------------------------------- |
| TurnoGol Cobros (Checkout Pro) | `345699471468974`                           |
| TurnoGol (Suscripciones)       | `1654083475779552`                          |
| **El que usa produccion**      | **`6071527690767040`** — ninguna de las dos |

Y MercadoPago, al pedirle la autorizacion, contesta:

> La aplicacion no esta preparada para conectarse a Mercado Pago

**Que significa.** Los complejos YA conectados siguen funcionando: sus tokens fueron
emitidos por esa aplicacion y se refrescan bien. Lo que no funciona es **autorizar a
un complejo nuevo**, que es exactamente lo que tiene que hacer cada cliente que se
venda. Tambien impide que titi reconecte para pasar a Checkout Pro, o sea que
bloquea el paso C0.

**Falso contraindicio que conviene no repetir**: `tenants.mp_connected_at` parece
decir que Elite se conecto hoy 17:00, despues del ultimo deploy. No prueba nada
sobre el OAuth: esa columna la escriben **dos** caminos — la conexion inicial
(`tenant.service.ts:327`) y el **refresh** del token (`mp-oauth.ts:105`). Un refresh
de un token viejo la actualiza igual.

**Lo que falta averiguar**: de donde sale `6071527690767040`. La aplicacion existe
—sus tokens se emiten y se refrescan— pero no figura en el panel de esta cuenta, ni
en "Tus aplicaciones" ni en "Aplicaciones de otras cuentas". La hipotesis mas
probable es que viva en **otra cuenta de MercadoPago**. Hasta saberlo no conviene
tocar `MP_CLIENT_ID`: cambiarlo dejaria a los complejos ya conectados sin poder
refrescar su token.

### No hacen falta dos client_id: cada aplicacion usa un mecanismo distinto

Duda que aparecio y conviene dejar zanjada: _"si son dos aplicaciones, no tienen que
convivir dos `MP_CLIENT_ID` en Vercel?"_. **No.**

- **Suscripciones cobra en la cuenta propia de TurnoGol.** No hay a quien pedirle
  permiso, asi que no hay OAuth: usa un token directo, `MP_TURNOGOL_ACCESS_TOKEN`
  (`billing.gateway.ts:20`, con `plaintextToken: true` porque vive en el env en
  claro, no cifrado en DB como los de tenant).
- **Checkout Pro cobra en la cuenta de un tercero** (el complejo). Ahi si hace falta
  que ese tercero autorice, y para eso —y solo para eso— existe el par
  `MP_CLIENT_ID`/`MP_CLIENT_SECRET`. El comentario de `billing.gateway.ts:8` lo dice
  explicito: las credenciales OAuth por complejo _"son para las senas (ADR-004)"_.

Por eso las cuatro variables ya conviven, una por funcion:

| Variable                            | Aplicacion       | Para que                                     |
| ----------------------------------- | ---------------- | -------------------------------------------- |
| `MP_TURNOGOL_ACCESS_TOKEN`          | Suscripciones    | cobrar el plan SaaS en la cuenta propia      |
| `MP_WEBHOOK_SECRET`                 | Suscripciones    | validar la firma de sus avisos               |
| `MP_CLIENT_ID` + `MP_CLIENT_SECRET` | **Checkout Pro** | que cada complejo autorice el cobro de senas |
| `MP_WEBHOOK_SECRET_CHECKOUT`        | Checkout Pro     | validar la firma de sus avisos               |

No hay nada que rediseniar: el esquema ya soporta las dos aplicaciones. Lo unico mal
es a que aplicacion apunta el par de OAuth.

### Como se arregla

**Que ID va**: el de **Checkout Pro**, `345699471468974`. No es una eleccion, ya
esta fijado en CLAUDE.md — _"Checkout Pro es el OAuth por complejo para senas
(`MP_CLIENT_ID`/`MP_CLIENT_SECRET`)"_ — y el codigo lo usa solo en el circuito de
senas: armar la URL de autorizacion (`oauth-start/route.ts:28`), canjear el codigo
por el token (`callback/route.ts:138`) y **refrescar** ese token
(`mp-oauth.ts:37`). El plan SaaS no lo toca: usa `MP_TURNOGOL_ACCESS_TOKEN`.

**El paso que es facil pasar por alto**: hay que cambiar **el par completo**.
`MP_CLIENT_ID` **y** `MP_CLIENT_SECRET` pertenecen a la misma aplicacion; si se
cambia uno solo, MercadoPago rechaza el OAuth por credenciales invalidas.

**Y la consecuencia que hay que aceptar antes de empezar**: los tokens que hoy
tienen los complejos fueron emitidos por la aplicacion vieja. Al cambiar el par
**dejan de poder refrescarse**, asi que **los dos complejos tienen que reconectar**.
El access token vigente sigue sirviendo hasta que expire, pero el refresh ya no.
Por eso reconectar no es opcional ni "cuando se pueda": va en la misma sesion.

1. En Vercel, entorno **Production**: `MP_CLIENT_ID` = `345699471468974` y
   `MP_CLIENT_SECRET` = el Client Secret de **TurnoGol Cobros** (panel → esa
   aplicacion → Credenciales de produccion).
2. **Redeploy.**
3. Confirmar que quedo bien **sin mirar ninguna variable**: entrar a
   `/api/mp/oauth-start` y leer la URL. Tiene que decir
   `client_id=345699471468974`, y la pantalla de MercadoPago tiene que ofrecer
   autorizar en vez de "La aplicacion no esta preparada".
4. **Reconectar los dos complejos**, y ojo que **son dos pasos, no uno**:
   **desvincular primero** y despues conectar. El callback tiene un guard (migr. 069) que rechaza con `mp_already_connected` si esa cuenta de MercadoPago ya
   figura en otro complejo — una cuenta cobra para UN solo complejo. Elite lo hace
   Lazar con su cuenta; titi lo hace Tiziana con la suya (son cuentas distintas,
   asi que entre ellos no chocan).
5. Verificar en la base que `mp_connected_at` de **ambos** quedo con la fecha de
   hoy.

### Como entrar como admin de Elite si tu mail es tambien el de SuperAdmin

`lazarofeijoo2004@gmail.com` figura en **las dos tablas**: `staff_users` (admin
activo de Complejo Elite Futbol) y `system_admins`. No son dos cuentas: es un solo
usuario con los dos papeles, y `login/actions.ts:94` manda a `/super-admin` cuando
el mail es system admin. Por eso el login nunca cae en el panel del complejo.

**La salida es impersonar, no tocar usuarios:**

1. Login normal con ese mail → caes en `/super-admin`.
2. Entrar al detalle de **Complejo Elite Futbol**.
3. Boton **"Entrar como este complejo"**: setea la cookie de impersonacion (TTL 1 h)
   y redirige a `/dashboard` (`impersonate-button.tsx:19-20`).
4. Desde ahi, `/settings/facturacion` → desvincular y volver a conectar.

La impersonacion **no recorta permisos**: `guards.ts:46-50` la usa para
**bypassear** los locks de tenant, a proposito, "para dar soporte". El rol efectivo
es `admin` y los FKs a `staff_users` se llenan con el admin real del complejo
(`proxyStaffUserId`), asi que la auditoria no queda huerfana.

**NO borrar el `staff_user` para reemplazarlo por otro mail.** Hay **14 claves
foraneas** apuntando a `staff_users` y todas menos una (`push_subscriptions`, que es
CASCADE) son `NO ACTION`: `bookings.created_by_staff`,
`bookings.completed_by_staff`, `cash_flows.registered_by`,
`daily_cash_opens.opened_by`, `daily_cash_closes.closed_by`, las tres de
`canteen_tabs`, `stock_movements.created_by`, `tenant_player_bans.banned_by`, las
dos de `tenant_staff_members`, `tournaments.created_by_staff` y
`tournament_match_events.created_by_staff`. El DELETE fallaria contra la primera
fila que exista, y forzarlo tiraria la trazabilidad de todo lo que hizo ese usuario.

**`canceled` no bloquea el panel.** titi figura Cancelado, pero los estados que
frenan al staff son `blocked`/`churned`/`deleted` (bloqueo) y `suspended`
(solo lectura) — `tenant.lifecycle.ts:20-23`. Tiziana puede entrar y conectar su
MercadoPago igual.

### Resultado de la verificacion — 2026-08-28 18:06, FUNCIONA

Cambiado el par y redeployado (`dpl_BAq2QRD...`, `READY`), se disparo el flujo
entrando a `/api/mp/oauth-start`. Ya **no** aparece "La aplicacion no esta preparada
para conectarse": el flujo va a MercadoPago, vuelve al callback y **canjea el codigo
por un token**, que es lo que prueba que las credenciales nuevas son validas — con
un `client_id`/`secret` invalido el canje falla ahi mismo, no mas adelante.

Termino en `error=mp_already_connected&complejo=Complejo%20Elite%20Futbol`, o sea el
guard de negocio de la migr. 069, **despues** de `logger.info('mp oauth: token
emitido')` (`callback/route.ts:188`). Es el resultado correcto para el caso: la
sesion era de titi y la cuenta de MercadoPago del navegador era la de Elite.

**No cambio nada en la base**: `mp_connected_at` siguio en 17:00 (Elite) y 22/08
14:00 (titi) despues del intento. El callback rechaza antes de escribir.

Recien ahi el bloque C mide lo que tiene que medir, y ademas queda resuelto que un
complejo nuevo pueda conectarse — que es lo que bloquea vender.

### C0 — pasos previos, en este orden

1. **Averiguar a que aplicacion apunta el `MP_CLIENT_ID` que usa produccion.**
   **No sirve mirarlo en Vercel**: si la variable esta marcada como Sensitive, el
   dashboard no muestra el valor ni a su dueno.

   Se lee de la URL, sin ver ninguna variable: entrar como admin a
   `/settings/facturacion`, tocar el boton de conectar MercadoPago
   (`/api/mp/oauth-start`) y mirar la barra de direcciones. La URL de autorizacion
   de MercadoPago lleva `client_id=...` a la vista, porque es el dato que
   identifica a la aplicacion que pide permiso. **Leerla no autoriza nada** — la
   autorizacion recien ocurre al confirmar en la pantalla de MercadoPago.

   | `client_id` en la URL | Significa                                                                                                                                                                                                                     |
   | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `345699471468974`     | apunta a **TurnoGol Cobros** (Checkout Pro). Correcto: seguir al paso 2                                                                                                                                                       |
   | `1654083475779552`    | apunta a **TurnoGol** (Suscripciones). **Parar**: hay que corregir `MP_CLIENT_ID`/`MP_CLIENT_SECRET` en Vercel y redeployar ANTES de que ningun complejo reconecte, o quedaria autorizado otra vez a la aplicacion equivocada |

2. **Tiziana reconecta**: entra como admin de titi a `/settings/facturacion` y usa
   el boton de conectar MercadoPago (`/api/mp/oauth-start`). Eso reemplaza el token
   guardado por uno de la aplicacion nueva.
3. **Confirmar que se reemplazo**: `mp_connected_at` de titi tiene que quedar con la
   fecha de hoy.

Recien despues tiene sentido cobrar la sena del bloque C: es el primer cobro real
que pasaria por Checkout Pro.

## Lo que NO entra en esta sesion

Los bloques C a H del plan del 25/8. Si sobra tiempo, el siguiente por valor es el
**E** (simular trial vencido y dunning adelantando fechas en Elite): cierra dos
ensayos, no cuesta plata y no depende de nadie.

---

## Resultados de la noche del 2026-08-28 — bloques B, C, D y F CERRADOS

Todo lo de abajo salio de produccion real, con plata real. Cada afirmacion tiene su
evidencia en `analytics_events`, `processed_webhooks`, `audit_logs` y `payments`.

### Precondiciones que hubo que arreglar antes de empezar

Dos cosas que el plan no habia previsto y que sin ellas la prueba no probaba nada:

1. **La senia estaba apagada en los dos complejos** (`settings.requires_deposit = false`).
   Una reserva online no cobraba un peso, asi que el circuito de Checkout Pro nunca se
   habria ejercitado. Se prendio en `complejo titi`, al 100%.
2. **Riesgo de plata al prenderla**: con el porcentaje en 100 y la Cancha 2 de titi a
   $70.000, un click en la cancha equivocada eran $70.000 reales. Se paso la Cancha 2 a
   `offline` mientras duraron los ensayos, dejando solo la de $100.

Ademas se verifico que **el portal publico de un tenant `canceled` sigue abierto** mientras
su periodo pago este vigente (`public.service.ts:338` lee `canceledPeriodEnd` solo en ese
estado). Por eso la reserva no dependia de la reactivacion: eran independientes.

### Bloque B — reactivacion de la suscripcion, con cobro real de $100

No fue un alta nueva: titi ya tenia `mp_subscription_id`, en estado `canceled` con periodo
vigente. El camino ejercitado fue `reactivate()`, no `subscribe()`.

```
22:36:35  audit  subscription.reactivate_initiated  (preapproval nuevo 0a01b114…)
22:36:45  MP crea el pago 175171843317 — user_id 381048203 (cuenta master), live_mode true
22:36:47.765071  webhook 'payment' procesado
22:36:47.765071  audit  tenant.reactivated  ← mismo microsegundo, misma transaccion
22:38:22 / 22:38:24  subscription_authorized_payment (created + updated), ambos aceptados
```

El timestamp identico es lo que prueba que al tenant lo movio **el pago acreditado** y no el
boton de soporte del panel: `transitionToActiveFromAny` tiene dos llamadores
(`dunning.service.ts:337` por pago, `support.service.ts:254` por soporte) y solo el primero
corre dentro del procesamiento del webhook.

**Sin preapproval huerfano**: el viejo (`34e84bd0…`) se cancelo antes de crear el nuevo — el
`cancelPreapproval` de `billing.service.ts:735` corrio de verdad, y a las 22:36:42 llego su
propio `subscription_preapproval` confirmandolo. Ese es justo el 🔴 de doble cobro que el
comentario del codigo dice cubrir; aca quedo verificado contra MP real, no contra el comentario.

Estado final: tenant `active`, periodo hasta **2026-11-18**.

### Bloque C — primera senia real que entra por Checkout Pro

El circuito que **nunca habia funcionado**: hasta la manana del 2026-08-28 esa aplicacion
devolvia 401 y sus avisos se descartaban.

```
22:43:28  MP crea el evento — user_id 1059888348  ← la cuenta del COMPLEJO, no la master
22:43:33  payment.deposit.approved      (mpPaymentId 176120451286)
22:43:34  booking.transition.confirmed
22:43:36  mp.webhook.processed  eventType=payment
```

El orden importa y es el discriminador: `booking.transition.confirmed` sale **dentro** del
procesamiento del webhook, y **no hay ningun `payment.reconcile.confirmed`**. O sea la reserva
la confirmo el aviso de MercadoPago, no el retorno del checkout ni el cron de rescate.

El `user_id` distinto (1059888348 vs 381048203) es lo que confirma que las dos aplicaciones
conviven bien: cada circuito notifica desde su propia cuenta al mismo buzon, y `webhook-auth.ts`
valida cada uno contra su clave.

Se repitio identico con la segunda reserva (`176122306154`, 22:50): dos entregas consecutivas.

### Bloque F — cancelacion FUERA de politica (nunca se habia ejercitado)

Politica de titi: `hours_before: 6`, `penalty_type: deposit`.

Reserva del 28/8 21:00, cancelada por el jugador a **1.15 h** del turno:

- `status = canceled_no_refund`, `canceled_by = player`
- La senia quedo `approved` y **no se genero ninguna fila de `refund`**
- El ingreso de $100 quedo en la caja del complejo (`cash_flows`: income / booking)

Correcto: fuera de plazo, el complejo se queda la senia.

### Bloque D — cancelacion DENTRO de politica, y las devoluciones pendientes

Reserva del 29/8 21:00, cancelada a **25 h** del turno:

- `status = canceled_refunded`
- Fila `refund` en `pending` de $100 creada en el mismo instante del cancel (22:52:14)

Y antes, a las 22:30, se saldaron a mano las dos devoluciones pendientes que venian del 22 y
23/8 (`payment.refund_settled_manually` x2). Al cierre de la noche el sistema quedo con **una
sola** devolucion pendiente: la recien generada, que sirve de material para el video que falta
(ver `docs/tech-debt.md`).

### Lo que quedo sin hacer

### P-04 idempotencia — CERRADO, y no hizo falta reenviar nada

La idea original era reenviar un aviso a mano desde el panel de MercadoPago. **Esa premisa era
falsa**: la pantalla de detalle del evento no ofrece reenviar (verificado el 2026-08-28 en el
panel de TurnoGol Cobros). El harness `scripts/replay-mp-webhook.ts` existe para esto pero
**rechaza produccion por diseno** — `assertNotProduction()` mas guardas por `VERCEL_ENV` y
hostname, y firma con `MP_WEBHOOK_TEST_BYPASS_SECRET`, que a su vez esta hard-gateado a
`NODE_ENV !== 'production'` en `webhook-auth.ts`. Correcto que sea asi: no se le inyectan
eventos falsos a produccion.

No hizo falta, porque **el experimento ya habia ocurrido solo**. MercadoPago mando avisos
repetidos del mismo recurso durante los ensayos:

| Recurso                                          | Avisos entregados | Tipo                            |
| ------------------------------------------------ | ----------------- | ------------------------------- |
| `0a01b114…` (preapproval nuevo)                  | **3**             | subscription_preapproval        |
| `34e84bd0…` (preapproval viejo)                  | **3**             | subscription_preapproval        |
| `7031353017` (pago de suscripcion)               | **2**             | subscription_authorized_payment |
| `175171843317` / `176120451286` / `176122306154` | 1 c/u             | payment                         |

Ocho avisos, tres recursos repetidos. Efecto: **`tenant.reactivated` figura UNA sola vez** en
`audit_logs`, un solo cambio de estado, un solo periodo extendido, cero audits duplicados. La
idempotencia quedo probada con trafico real de MP, que es mejor evidencia que un replay
sintetico.

- **Bloque E**: trial vencido (P-09) y dunning (P-10), simulados moviendo fechas en Elite.
- ~~**Bloque H**~~: **EJECUTADO el 2026-09-01** — ver abajo.

### Bloque H — limpieza de los ensayos · CERRADO 2026-09-01

Se midio el estado real de produccion antes de tocar nada, y **dos de los tres restos ya
estaban resueltos**. Vale registrarlo porque la suposicion contraria (que los tres seguian
vivos) era razonable y habria llevado a correr UPDATEs innecesarios:

| Resto | Estado medido el 1/9 | Accion |
| --- | --- | --- |
| Elite con el reloj de trial adelantado | Ya restaurado: `trialing` en tenant Y suscripcion, `trial_ends_at` exactamente en el valor de restauracion | Ninguna |
| Plan "Prueba interna — NO OFRECER" | Ya apagado (`is_active = false`) | Ninguna |
| `complejo titi` con senia al 100% y Cancha 2 en `offline` | **Vigente**: `requires_deposit = true`, Cancha 2 (`$70.000`) en `offline` | Corregido |

Lo que se corrigio en titi, **en este orden y no al reves**: primero
`requires_deposit = false`, despues Cancha 2 a `online`. Invertirlo abre una ventana con
una cancha de $70.000 reservable y la senia al 100% — el mismo riesgo que el ensayo
mitigo poniendola offline.

El `deposit_percentage` se dejo en 100. No es un resto del ensayo: es un valor de
configuracion inerte mientras `requires_deposit` este en `false`, igual que en Elite.

Verificacion posterior: los dos complejos con `requires_deposit = false`, cero canchas en
`offline`, Elite `trialing`/`trialing` y titi `active`/`active`.

**Leccion**: el Bloque H figuraba como pendiente en esta lista y nadie sabia que dos de
sus tres items ya se habian hecho. Una limpieza sin registro es indistinguible de una
limpieza que no ocurrio, y obliga a medir de nuevo cada vez que alguien pregunta.

---

## Bloque E — P-09 trial vencido · EN MARCHA desde el 2026-08-28 22:36 UTC

**No toca plata.** El MercadoPago conectado en Elite es el de cobrar senias de reservas
(Checkout Pro); esto de aca es el reloj de la suscripcion SaaS, y Elite nunca se suscribio
(`mp_subscription_id` y `mp_payer_email` en NULL). El bloqueo por trial vencido no intenta
cobrar nada: solo apaga el acceso.

Aplicado sobre `Complejo Elite Futbol` (`9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6`):

```sql
UPDATE tenants
SET trial_ends_at = NOW() + INTERVAL '20 hours', trial_warning_days_sent = NULL, updated_at = NOW()
WHERE id = '9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6' AND status = 'trialing';
```

`trial_ends_at` quedo en **2026-08-29 20:36:11 UTC**. Una sola preparacion cubre los dos
escalones porque `expire-trials` corre **todos los dias a las 11:00 UTC** (08:00 ART):

| Cuando             | Que tiene que pasar                                                                     | Por que                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **29/8 11:00 UTC** | Mail de "te queda 1 dia" al duenio, y `trial_warning_days_sent = 1`                     | Faltan 9.6 h, o sea `days_left = CEIL(9.6/24) = 1`, y el umbral mas chico de `TRIAL_ENDING_WARNING_DAYS = [1, 7]` que aplica es el 1 |
| **30/8 11:00 UTC** | Elite pasa a `blocked` (tenant Y suscripcion), audit con `reason: trial_ends_at_passed` | `trial_ends_at < NOW()` — segunda fase del mismo worker                                                                              |

Verificado por calculo antes de esperar: `entra_al_aviso = true`, `days_left = 1`,
`se_bloquea_el_30 = true`.

**Restaurar** (una linea, cuando se quiera cortar el ensayo):

```sql
UPDATE tenants
SET trial_ends_at = '2026-09-16 17:50:43.751+00', trial_warning_days_sent = NULL,
    status = 'trialing', updated_at = NOW()
WHERE id = '9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6';
```

Ojo: si Elite llega a `blocked`, restaurar tambien exige devolver la suscripcion a `trialing`
(`tenant_subscriptions.status`), no solo la fila de `tenants`.

**P-10 (dunning) queda pendiente**: necesita el mismo complejo en `past_due` con
`dunning_started_at` de hace 8 dias, y el cron `dunning-retry` (16:00 UTC / 13:00 ART) lo
escala a `suspended`. Se hace despues de restaurar Elite — no se encadenan dos cambios de
estado sobre el mismo complejo a la vez.
