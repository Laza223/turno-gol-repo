# Credenciales de MercadoPago: qué son, cómo verificarlas, cómo rotarlas

**Escrito el 2026-08-25.** Desde la migración del 2026-08-22 TurnoGol usa **dos aplicaciones** de MercadoPago, y todo lo que se probó antes de esa fecha se probó con una sola. Este documento es el inventario completo, el procedimiento de verificación y el de rotación.

Convención de honestidad, la misma del informe de las dos apps: **[MEDIDO]** = evidencia propia; **[DOC]** = documentación de MercadoPago; **[INFERIDO]** = razonamiento sobre el modelo; **[NO CONFIRMADO]** = no lo pude establecer, y digo cómo se verifica.

---

## 1. Por qué hay dos aplicaciones

MercadoPago **deriva los permisos del producto de la aplicación**, y dice explícitamente que hay que crear una aplicación por cada solución que integres **[DOC]**. TurnoGol integra dos:

| | Qué cobra | Con qué credencial |
|---|---|---|
| **App A · Suscripciones** | El plan mensual de TurnoGol ($63.000), que va a **tu** cuenta | Un token master fijo, del env |
| **App B · Checkout Pro** | La seña del jugador, que va a la cuenta **del complejo** | OAuth: cada complejo autoriza y TurnoGol guarda su token |

**La consecuencia que más se olvida**: MercadoPago genera **una clave de firma de webhook por aplicación**, y las dos notifican al mismo buzón (`/api/webhooks/mercadopago`). Por eso `webhook-auth.ts` valida contra las dos claves y le alcanza con que **una** dé match. Si falta la de App B, los avisos de las señas se rechazan con 401 — y eso es silencioso desde adentro de TurnoGol: se ve en el panel de MercadoPago, no en la app.

---

## 2. Inventario: cada credencial y dónde vive

| Variable | Qué hace si falta o está mal | App | Vercel | Railway |
|---|---|---|---|---|
| `MP_TURNOGOL_ACCESS_TOKEN` | **No cobrás el plan.** Ningún complejo puede activar la suscripción | A | ✅ | ✅ — lo usa `reconcile-subscriptions.worker` |
| `MP_WEBHOOK_SECRET` | Los avisos de suscripción se rechazan con 401. Un pago queda hecho en MP y el complejo no se activa | A | ✅ | ❌ (la firma se valida en el route handler, que corre en Vercel) |
| `MP_CLIENT_ID` + `MP_CLIENT_SECRET` | Ningún complejo puede conectar su MercadoPago, y el cron de renovación de tokens falla para todos | B | ✅ | ✅ — lo usa `refresh-mp-tokens.worker` cada 4 h |
| `MP_WEBHOOK_SECRET_CHECKOUT` | Los avisos de **señas** se rechazan con 401. La reserva queda `pending_payment` con la plata cobrada, hasta que la reconciliación la rescate | B | ✅ | ❌ |
| `ENCRYPTION_KEY` | No se pueden desencriptar los tokens de los complejos: **ningún cobro de seña funciona**. Ya pasó una vez, y los tres síntomas parecían tres bugs distintos | — | ✅ | ✅ |

**No es una variable de entorno pero se rota igual**: el token OAuth de cada complejo, en `tenants.mp_access_token` / `mp_refresh_token`, encriptado con `ENCRYPTION_KEY`. Se "rota" reconectando desde `/settings` del complejo, y dura **180 días** **[MEDIDO]**.

---

## 3. Verificar, sin mover un peso

Los cuatro chequeos cubren las dos aplicaciones. Ninguno cobra ni devuelve nada.

### 3.1 Las credenciales OAuth y el token master

```bash
LAUNCH_CHECK_ENV_FILE=.env.production pnpm launch:check --probe-only
```

Dos sondas relevantes:

- **`mp credentials probe (Checkout Pro)`** — hace un intercambio OAuth deliberadamente inválido. Un **400** significa que `MP_CLIENT_ID`/`MP_CLIENT_SECRET` autenticaron bien; un 401/403 significa que están mal copiados.
- **`mp master token probe (Suscripciones)`** — `GET /users/me` con `MP_TURNOGOL_ACCESS_TOKEN`. Imprime el **id de cuenta**, y ese es el chequeo que importa de verdad: un token de la cuenta de un complejo autentica igual de bien y cobraría a la cuenta equivocada. Comparalo contra el id de la cuenta master.

### 3.2 Las dos claves de firma de webhook

Una corrida por clave, apuntando al mismo endpoint. La sonda manda un `type` que el handler no maneja, así que valida la firma y responde sin encolar nada:

```bash
MP_WEBHOOK_SECRET="<clave de App A>" pnpm tsx scripts/probe-mp-webhook-signature.ts <tenantId>
```

```bash
MP_WEBHOOK_SECRET="<clave de App B>" pnpm tsx scripts/probe-mp-webhook-signature.ts <tenantId>
```

**200** = la clave coincide con la que tiene Vercel. **401** = no coincide, o falta la variable en el entorno del deploy.

> En PowerShell `VAR=valor comando` no funciona: usá `$env:MP_WEBHOOK_SECRET="<clave>"; pnpm tsx ...`.

Las dos tienen que dar 200. Que una dé 200 no dice nada de la otra — es el error que hace que "probamos los webhooks" signifique "probamos los de una app".

### 3.3 Los permisos del token de cada complejo

```bash
pnpm tsx scripts/probe-mp-permissions.ts <slug-del-complejo>
```

Le pregunta a MercadoPago qué puede hacer ese token, con POSTs contra ids inexistentes: **403** = no tiene el permiso, **404** = sí lo tiene (pasó la policy y no encontró el recurso). Se cree la respuesta de la API, no el string de `scope`, que resultó mala evidencia.

> A diferencia de la sonda de firma (§3.2), esta toma el **slug** del complejo (ej. `complejo-elite-futbol`), no el `tenantId` — busca `tenants WHERE slug = ...` (`scripts/probe-mp-permissions.ts`).

### 3.4 El historial del lado de MercadoPago

Lo único que no se ve desde TurnoGol, y es donde aparecen los rechazos: panel de MP → **Tus integraciones** → cada app → **Webhooks** → historial de notificaciones. Tienen que ser **200**. Un 401 ahí significa clave desalineada; un reintento repetido significa que la entrega falló.

**Hay que mirarlo en las dos aplicaciones.**

---

## 4. Verificar con plata (mínima)

Lo anterior prueba que las credenciales autentican. No prueba que la plata llegue. Eso son dos ensayos, uno por app:

| App | Ensayo | Costo |
|---|---|---|
| **B · Checkout Pro** | Una seña real de $100 en un complejo reconectado → la reserva queda `confirmed`, hay fila en `cash_flows`, y el historial de webhooks de App B muestra **200** | $100 |
| **A · Suscripciones** | Activar el plan interno de $100 sobre un complejo en `trialing` → `trialing`→`active`, email `subscription_activated`. Es P-01, y ya se hizo el 20/8 | $100/mes hasta darla de baja |

El detalle que hace que valga la pena: **la seña tiene que ser posterior a la reconexión del complejo a App B.** Una seña cobrada con el token viejo de App A no prueba nada sobre App B.

---

## 5. Rotar las credenciales

### 5.1 Antes de tocar nada

1. **Anotá el valor viejo** en tu gestor de contraseñas antes de reemplazarlo. Varias de estas rotaciones son de ida: MercadoPago no te muestra la clave anterior después de restablecerla **[DOC]**.
2. **Elegí un horario tranquilo.** Toda rotación tiene una ventana entre "MercadoPago invalidó lo viejo" y "el deploy nuevo está sirviendo". Lo que pase en esa ventana se rechaza.
3. **Verificá leyendo, no asumiendo.** `vercel env ls` o el dashboard. Un `exit 0` de `vercel env add` ya mintió una vez **[MEDIDO]**; y Vercel no devuelve el valor de las variables marcadas como Sensitive, así que la única confirmación real es la sonda.

### 5.2 Clave de firma de webhook (`MP_WEBHOOK_SECRET` o `MP_WEBHOOK_SECRET_CHECKOUT`)

**La vieja muere en el acto** al restablecer **[DOC]**, así que el orden importa y la ventana hay que hacerla corta.

1. Dejá abierta la pantalla de Vercel → **Settings → Environment Variables**, con la variable lista para editar.
2. Panel de MP → la app que corresponda → **Webhooks** → **Restablecer** la clave secreta. Revelarla y copiarla.
3. Pegarla en Vercel, en **Production** y **Preview**. Guardar.
4. **Redeploy** — la variable no la toma un deploy viejo.
5. Verificar con la sonda de §3.2. Tiene que dar **200**.

**Qué pasa en la ventana**: los avisos que MercadoPago entregue mientras tanto vuelven 401. MercadoPago reintenta **[DOC]**, y lo que igual se pierda lo levanta el job de reconciliación — que ya rescató dos pagos reales en producción. No se pierde plata; se pierde tiempo.

### 5.3 `MP_CLIENT_SECRET` (OAuth de los complejos)

**Se cambia en DOS lugares, la misma sentada.** Railway no valida variables al arrancar, así que olvidarlo es completamente silencioso.

1. Panel de MP → **App B** → **Credenciales de producción** → regenerar el *Client Secret*. Copiarlo.
2. **Vercel** (Production + Preview): `MP_CLIENT_SECRET`. Redeploy.
3. **Railway** → servicio de workers → **Variables**: el mismo valor.
4. Correr `pnpm launch:check --probe-only`. La sonda de Checkout Pro tiene que dar el **400** esperado.

**Efectos conocidos, ninguno es un bug:**

- Un OAuth a mitad de camino falla con `mp_invalid_state`: el `state` se firma con este secret y vive 10 minutos. Se reintenta y listo.
- **[INFERIDO]** Los tokens ya emitidos siguen sirviendo — pertenecen al consentimiento entre la cuenta y la aplicación, no al secret. Lo que necesita el secret nuevo es **renovarlos**, o sea el cron de cada 4 h. Si algún complejo empieza a fallar la renovación, reconecta y se arregla.

### 5.4 `MP_TURNOGOL_ACCESS_TOKEN` (el token master)

Es el único con el que cobrás **tu** plata, así que va solo, sin mezclarlo con otra rotación.

1. Panel de MP → **App A** → **Credenciales de producción** → regenerar el *Access Token*.
2. **Vercel** (Production + Preview) → redeploy.
3. **Railway** → servicio de workers. **No lo saltees**: `reconcile-subscriptions.worker` lo usa para consultar el estado de los preapprovals; sin él, una suscripción que MercadoPago cobró puede no reflejarse.
4. Correr `pnpm launch:check --probe-only` y leer el **id de cuenta** que imprime la sonda del master. Tiene que ser el de tu cuenta.

**[INFERIDO]** Las suscripciones ya creadas siguen debitando: el preapproval pertenece a la cuenta, no al token. Lo que deja de funcionar con el token viejo son las llamadas a la API.

### 5.5 `ENCRYPTION_KEY`

**No la rotes sin un plan de migración.** No es una credencial de MercadoPago: es la llave con la que están encriptados los tokens de todos los complejos, guardados en `tenants.mp_access_token`. Cambiarla **sin desencriptar y re-encriptar** deja esos tokens ilegibles, y el síntoma no dice eso: los cobros de seña fallan por tres caminos distintos que parecen tres bugs **[MEDIDO, 2026-08]**.

Si hay que rotarla, es un esfuerzo aparte: script que lee con la vieja, escribe con la nueva, y recién después se cambia la variable.

---

## 6. Checklist de rotación

Para pegar en el ledger cuando se haga:

- [ ] Valor viejo guardado en el gestor de contraseñas
- [ ] Variable actualizada en **Vercel** (Production **y** Preview)
- [ ] Variable actualizada en **Railway**, si la tabla del §2 dice que va
- [ ] **Redeploy** hecho, no solo guardado
- [ ] `pnpm launch:check --probe-only` en verde, con el id de cuenta correcto
- [ ] Sonda de firma en 200 para **las dos** claves de webhook
- [ ] Historial de webhooks en 200 en **las dos** aplicaciones
- [ ] Una operación real de $100 por el circuito que se tocó
