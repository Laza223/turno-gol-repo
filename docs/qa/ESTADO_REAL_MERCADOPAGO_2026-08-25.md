# Estado real de MercadoPago, medido — 2026-08-25

> **Para qué sirve este documento.** Reconstruir, con evidencia y no de memoria, qué
> pasó con MercadoPago entre el 19 y el 25 de agosto, qué quedó funcionando, qué
> quedó roto y qué no se puede saber sin correr una sonda. Todo lo que dice
> "medido" salió de consultar la base de producción o el repositorio hoy.

---

## 1. La historia en criollo, para arrancar

Hasta el 19 de agosto TurnoGol usaba **una sola aplicación** de MercadoPago para
dos cosas distintas: cobrar la suscripción mensual del SaaS, y darle a cada
complejo la posibilidad de cobrar señas.

Apareció un bug: **las devoluciones de seña fallaban siempre** con `403 At least
one policy returned UNAUTHORIZED`. Investigando salió la causa: MercadoPago
**deriva los permisos del producto de la aplicación**, y la aplicación estaba
dada de alta como producto "Suscripciones". Con ese producto, MercadoPago otorga
`payments:refunds/**read-only**` — o sea, permiso para *mirar* devoluciones, no
para hacerlas. No era una casilla destildada: MercadoPago directamente no la
ofrece para ese producto.

De ahí salieron **dos decisiones separadas**, y conviene no confundirlas:

1. **Crear una segunda aplicación** con producto "Checkout Pro" para el OAuth de
   los complejos. MercadoPago mismo dice que hay que crear una aplicación por
   solución que integres, así que esto es lo correcto arquitectónicamente
   **independientemente del bug**.
2. **Descartar el reembolso automático por API.** La segunda app tampoco
   destrabó el permiso, así que se eliminó ese camino y se construyó en su lugar
   un flujo donde **el complejo hace la devolución** desde su panel de
   MercadoPago y TurnoGol solo la registra, la lista en `/caja/devoluciones` y se
   la recuerda.

Hoy quedan las dos aplicaciones. **Eso está bien y no hay que volver atrás** —
pero hay que verificar que quedó prolijo, que es de lo que trata el resto.

---

## 2. Las dos aplicaciones, y qué cobra cada una

| | **App A · Suscripciones** | **App B · Checkout Pro** |
|---|---|---|
| Qué cobra | El plan mensual de TurnoGol | La seña del jugador |
| La plata va a | **Tu** cuenta (`381048203`) | La cuenta **del complejo** |
| Credencial | `MP_TURNOGOL_ACCESS_TOKEN` (token fijo) | `MP_CLIENT_ID` + `MP_CLIENT_SECRET` (OAuth por complejo) |
| Clave de webhook | `MP_WEBHOOK_SECRET` | `MP_WEBHOOK_SECRET_CHECKOUT` |

Las dos notifican al **mismo buzón** (`/api/webhooks/mercadopago`) y
`webhook-auth.ts` acepta cualquiera de las dos firmas. La consecuencia que más se
olvida: **que los webhooks de una app funcionen no dice nada de la otra.**

---

## 3. Lo que está CONFIRMADO funcionando

### 3.1 Las credenciales OAuth de producción son de App B y son válidas

**Evidencia medida, y es indirecta pero sólida.** `Complejo Elite Futbol` tiene
`mp_connected_at = 2026-08-25 16:00:29 UTC`. Esa columna la escribe el cron
`refresh-mp-tokens` (`refresh-mp-tokens.worker.ts:79`), que corre cada 4 horas
—16:00 UTC es exactamente una de sus corridas— y **solo la escribe si el refresh
salió bien** (el `refreshMpAccessToken` de la línea 71 tira si falla, y el update
nunca se ejecuta).

Un `refresh_token` de OAuth **solo lo puede canjear la aplicación que lo emitió**.
Entonces: si las credenciales actuales de producción pudieron refrescar el token
de Elite, ese token y esas credenciales son de la **misma** aplicación. Como las
credenciales se repuntaron a App B durante la migración, **el token de Elite es de
App B y las credenciales de App B están bien cargadas**.

### 3.2 El buzón de webhooks acepta las dos firmas

`webhook-auth.ts:46` junta las dos claves en una lista y prueba cada una:

```ts
const secrets = [process.env.MP_WEBHOOK_SECRET, process.env.MP_WEBHOOK_SECRET_CHECKOUT]
  .filter((value): value is string => Boolean(value))
if (secrets.length === 0) return process.env.NODE_ENV !== 'production'
...
if (secrets.some((secret) => matchesHmac(secret, manifest, v1))) return true
```

Correcto. Si falta `MP_WEBHOOK_SECRET_CHECKOUT` no se rompe nada de App A: solo
se rechazan sistemáticamente los webhooks de seña, con 401.

### 3.3 Los webhooks de las señas de `complejo-titi` llegan todos

**6 de 6**, incluida la del 23/8 00:33 UTC, que es posterior a la migración.

### 3.4 El código del reembolso automático se eliminó limpio

`PaymentGateway` no tiene ningún método de refund. `prepareRefund` solo inserta
la fila `pending` y lo dice explícitamente en el código. El cron
`retry-pending-refunds` ya no llama a MercadoPago: solo le recuerda al complejo.
Único resto: un `COMMENT ON COLUMN` de la migración 079 que todavía menciona un
`settleRefund` que ya no existe. Es texto descriptivo en la base, no afecta
comportamiento, y como no se pueden editar migraciones viejas se corrige con una
nueva cuando toque.

---

## 4. 🔴 El hallazgo que cambia cómo hay que probar

### Los webhooks no llegan cuando te pagás a vos mismo

Cruzando cada pago con `processed_webhooks`, el patrón es perfecto:

| Quién cobra | Cuenta MP | Webhooks recibidos |
|---|---|---|
| `complejo-titi` (señas) | `1059888348` (Tiziana) | **6 de 6** ✅ |
| `Complejo Elite Futbol` (señas) | `381048203` (**la tuya**) | **0 de 2** ❌ |
| Cuenta master (suscripción de titi) | `381048203` (**la tuya**) | llegaron ✅ |

La correlación **no** es la aplicación ni la fecha: el webhook llega cuando **el
que paga y el que cobra son cuentas distintas**, y no llega cuando sos vos
pagándote a vos mismo. Las dos señas de Elite las rescató la reconciliación
(entradas `reconcile-174510158896` y `safety-polling` en `processed_webhooks`),
por eso igual figuran aprobadas.

**Esto corrige el diagnóstico anterior.** El handoff atribuía esas dos señas sin
webhook a "la ventana de la migración"; la primera es del **18/8**, cuatro días
antes de que App B existiera. No es un bug de TurnoGol: es el artefacto de probar
con auto-pago.

### La consecuencia práctica, y es la regla del día

**`Complejo Elite Futbol` no sirve para probar plata de ningún tipo**, porque está
conectado con tu propia cuenta:

- **No puede pagar la suscripción**: le estaría pagando a la cuenta master, que es
  la misma cuenta. MercadoPago rechaza el auto-pago.
- **No puede cobrar señas de forma realista**: si pagás vos, es auto-pago otra vez
  y el webhook no llega — vas a ver "bugs" que no existen.

**Todo el ensayo de plata va por `complejo-titi`**, que tiene la cuenta de Tiziana:

| Circuito | Quién paga | Quién cobra | ¿Sirve? |
|---|---|---|---|
| Suscripción SaaS | Tiziana | vos (master) | ✅ cuentas distintas |
| Seña | vos (jugador) | Tiziana (complejo) | ✅ cuentas distintas |

Elite queda para lo que no toca plata: los relojes de trial y dunning simulados.

---

## 4-bis. 🔴 El reembolso automático SÍ funcionó una vez — y por qué igual estuvo bien eliminarlo

El motivo que quedó escrito para eliminar el reembolso automático (PR #212) fue
*"ninguna aplicación concede `payments:refunds`"*. **Eso está sobregeneralizado y
hay una fila que lo desmiente**: `payments` tiene un refund `901d06d6…` de
`complejo-elite-futbol`, con `mp_payment_id = 3199064441` —un id de refund real de
MercadoPago, no de pago— en `approved`, creado el 2026-08-23 00:58 UTC, ocho
minutos después de la seña que devuelve, y sin rastro de haberse saldado a mano.
Es decir: **la API de reembolso respondió OK al menos una vez.**

### La pieza que faltaba: no es la aplicación, es de quién es la cuenta

| Complejo | Cuenta MP | ¿Devolvió por API? |
|---|---|---|
| `complejo-elite-futbol` | `381048203` — **la master, dueña de las dos apps** | ✅ sí |
| `complejo-titi` | `1059888348` — un tercero | ❌ 403 siempre |

La diferencia no es la aplicación ni la fecha: es que **el único caso que
funcionó es el de la cuenta que es dueña de la aplicación**. Es coherente con
cómo funciona OAuth —el titular de la app operando sobre su propia cuenta no
atraviesa las mismas policies que un tercero que te delega permisos— y explica el
403 sistemático de titi sin necesidad de suponer que "la app está mal".

### Por qué la decisión de producto NO cambia

**Ningún cliente real de TurnoGol va a ser la cuenta master.** Todos son terceros,
como titi. Un automatismo que funciona para el dueño y falla para el 100% de los
clientes es peor que no tenerlo: promete algo que no cumple. **PR #203/#212
estuvieron bien**, y no hay nada que revertir.

Lo que sí había que corregir era el motivo escrito, porque "el permiso no existe"
mandaba a no volver a intentarlo nunca, y lo correcto es "el permiso depende de
quién sea el titular de la cuenta". Ya está corregido en `CLAUDE.md`.

**Se confirma o se refuta gratis**, corriendo la sonda sobre los dos complejos:

```bash
pnpm tsx scripts/probe-mp-permissions.ts 9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6   # Elite (master)
pnpm tsx scripts/probe-mp-permissions.ts fbeda410-39eb-4ed0-b248-2f732ad14d26   # titi (tercero)
```

Si Elite da 404 en refunds (= tiene el permiso) y titi da 403 (= no lo tiene), la
explicación queda confirmada. **No es urgente para hoy** y no bloquea vender.

---

## 4-ter. Las variables de entorno, verificadas a ojo en Vercel y Railway

**Leído el 2026-08-25 en los paneles, solo los NOMBRES y las fechas — ningún
valor.** Esto responde la duda de si la rotación del 22/8 pisó algo.

### Vercel — las de MercadoPago

| Variable | Entorno | Última actualización | Lectura |
|---|---|---|---|
| `MP_TURNOGOL_ACCESS_TOKEN` | Production | **18/7** | ✅ **nunca se rotó** — sigue siendo el de App A, que es lo correcto |
| `MP_WEBHOOK_SECRET` | Production | **18/8** | ✅ **no se pisó** — la clave de App A quedó intacta |
| `MP_WEBHOOK_SECRET_CHECKOUT` | Production **y** Preview | 22/8 | ✅ **se agregó como variable nueva**, no reemplazó a la anterior |
| `MP_CLIENT_ID` | Production | 22/8 | ✅ rotada a App B, como mandaba el runbook |
| `MP_CLIENT_SECRET` | Production | 22/8 | ✅ rotada a App B |
| `MP_CLIENT_SECRET` | Preview | 22/8 | ⚠️ ver abajo |
| `MP_CLIENT_ID` | **Preview** | **18/7** | 🟡 **quedó sin rotar** |

**Conclusión: la migración se hizo prolija.** Se rotó lo que había que rotar
(`MP_CLIENT_ID`/`MP_CLIENT_SECRET` de Production), se agregó lo nuevo
(`MP_WEBHOOK_SECRET_CHECKOUT`) y **no se pisó nada** — ni el token master de
suscripciones ni la clave de webhook de App A.

### 🟡 El único hallazgo: Preview quedó con las credenciales cruzadas

En **Preview**, `MP_CLIENT_ID` es del 18/7 (App A) y `MP_CLIENT_SECRET` del 22/8
(App B). **Esa combinación no autentica contra ninguna de las dos aplicaciones**:
es el id de una con el secreto de la otra.

- **No afecta producción.** Production tiene las dos rotadas y coherentes.
- **Sí afecta**: cualquier prueba de OAuth de MercadoPago en un deploy de Preview
  va a fallar con credenciales rechazadas, y el síntoma no dice "están cruzadas".
- **Arreglo**: poner en `MP_CLIENT_ID` de Preview el mismo valor que ya tiene
  Production. Un campo.

### Railway — el servicio de workers

17 variables, todas presentes y con valor oculto. Las que importan para
MercadoPago están las cuatro: `MP_TURNOGOL_ACCESS_TOKEN`, `MP_CLIENT_ID`,
`MP_CLIENT_SECRET` y `ENCRYPTION_KEY`, más `WORKER_DATABASE_URL` y `APP_URL`.
`MP_WEBHOOK_SECRET*` **no** están, y **está bien**: la firma se valida en el route
handler, que corre en Vercel.

Railway no muestra fechas de modificación, así que no se puede leer ahí si sus
credenciales se rotaron a App B. **Pero hay prueba indirecta**: el cron
`refresh-mp-tokens` corre en Railway, usa esas credenciales, y refrescó con éxito
el token de Elite hoy a las 16:00 (§3.1). Un refresh token solo lo canjea la
aplicación que lo emitió, así que **Railway y Vercel están apuntando a la misma
aplicación**. El paso que el runbook advertía no saltear, no se salteó.

---

## 5. Lo que NO se puede saber sin correr una sonda

### 5.1 De qué aplicación es el token de `complejo-titi`

Es la incógnita importante que queda. `complejo-titi` está en `status='canceled'`,
y el cron de refresh filtra `status IN ('active','trialing','past_due','suspended')`
— o sea que **a titi nunca se le refresca el token**, y por eso no tenemos la
prueba indirecta que sí tenemos para Elite (§3.1).

Se reconectó el 22/8 a las 17:00 UTC, dos minutos después del merge del PR #194.
Si en ese momento las credenciales ya eran de App B, su token es de App B.
**No se puede determinar desde la base.** Lo responde:

```bash
pnpm tsx scripts/probe-mp-permissions.ts <tenantId-de-titi>
```

Esa sonda le pregunta a MercadoPago qué puede hacer el token, con POSTs contra
ids inexistentes: **403** = no tiene el permiso, **404** = sí lo tiene (pasó la
policy y no encontró el recurso). Se le cree a la respuesta de la API, no al
string de `scope`.

### 5.2 Si `MP_WEBHOOK_SECRET_CHECKOUT` está cargada en Vercel

Los webhooks de titi llegan, pero no se puede saber desde la base si los firmó
App A o App B, así que no prueba que la clave de App B esté. Lo responde la sonda
de firma, una corrida por clave, y **las dos tienen que dar 200**.

---

## 6. ⚠️ Riesgos anticipados — para que no sean sorpresa

Ordenados por probabilidad de morder hoy.

### 6.1 Cuatro variables que fallan en silencio

`src/shared/env.ts` valida el entorno al arrancar y corta el boot si falta algo
obligatorio. **Estas cuatro no están en ese schema**, así que la app arranca
igual y el fallo aparece recién cuando se usa:

| Variable | Qué pasa si falta | Cuándo te enterás |
|---|---|---|
| `MP_TURNOGOL_ACCESS_TOKEN` | `billing.gateway.ts:20` cae a `''` y cobra con token vacío | Al activar un plan |
| `APP_URL` | `billing.service.ts:222` cae a `http://localhost:3000` → el `notification_url` del preapproval queda inválido | El webhook de la suscripción **nunca llega** |
| `MP_WEBHOOK_SECRET_CHECKOUT` | Es **opcional incluso en producción, a propósito** | Todo webhook de seña se rechaza con 401 |
| `WORKER_DATABASE_URL` | (no es de MP, mismo patrón) | Ya mordió una vez |

Las cuatro las cubre `pnpm launch:check --probe-only`, que es exactamente por qué
ese comando es el primer paso del día.

### 6.2 `/api/status` puede decir "ok" con MercadoPago roto

El check `mercadopago` de `status/route.ts:213` **solo mira que estén
`MP_CLIENT_ID` y `MP_CLIENT_SECRET`**. No verifica el token master ni la clave de
webhook de App B. Es una decisión documentada, pero significa que el monitor de
uptime puede estar verde con el cobro roto. **No uses `/api/status` como prueba
de que MercadoPago anda.**

### 6.3 A `complejo-titi` no se le renueva el token

Está en `canceled` y el cron excluye ese estado. Su token vale 180 días desde el
22/8, así que no es urgente — pero **si lo reactivás hoy** (bloque B del plan),
vuelve a entrar al barrido, y ahí se sabrá si su refresh token es canjeable con
las credenciales actuales. Si no lo es, el log va a mostrar `tenant token refresh
failed` y **la solución es reconectar MercadoPago desde su panel**: dos minutos,
sin drama.

### 6.4 El plan de prueba de $100 está visible

Lo activé hoy (`plans.is_active = true`) para poder elegirlo. Aparece en la
pantalla de activación de **cualquier** complejo — hoy no importa porque los dos
complejos son tuyos, pero **hay que apagarlo al terminar** (es el paso H1 del
plan del día).

### 6.5 La analítica web sigue caída, y ahora se entiende mejor

`analytics_events` tiene 98 filas y **todas** son de categorías que emite el
worker (`booking`, `payment`, `webhook`). Las que emite el lado web —`auth`,
`search`, `onboarding`, `cashflow`— tienen **cero filas desde siempre**, incluida
la ventana que parecía sana. `track.auth('staff.login')` corre en cada login y
nunca escribió una fila. No es la regresión del 22-23/8 que decía el handoff: el
lado web nunca funcionó. El corte del 23/8 es simplemente que el worker se quedó
sin webhooks que procesar.

---

## 7. Qué hacer, en qué orden

1. **`pnpm launch:check --probe-only`** — cubre §6.1 entero y confirma §3.1.
2. **Las dos sondas de firma de webhook** — cierra §5.2.
3. **`probe-mp-permissions.ts` sobre titi** — cierra §5.1.
4. **Recién ahí, plata**, y toda por `complejo-titi` (§4).

Los tres primeros no gastan un peso.
