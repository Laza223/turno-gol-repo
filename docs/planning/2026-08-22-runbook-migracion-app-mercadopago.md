# Runbook: migrar el OAuth de señas a una segunda aplicación de MercadoPago

**Fecha:** 2026-08-22 · **Decisión:** `docs/planning/2026-08-22-dos-apps-mercadopago.md` · **Código:** PR #194

Este es el procedimiento operativo. El "por qué" y la evidencia están en el informe; acá está el **qué hacer, en qué orden, y qué mirar para saber que salió bien**. Los pasos marcados 🧑 los hace el dueño a mano en el panel de MercadoPago o en Vercel/Railway.

**Vocabulario del documento:**

- **App A** = la aplicación actual, nº 1654083475779552, producto **Suscripciones**. Cobra el plan mensual del SaaS con `MP_TURNOGOL_ACCESS_TOKEN`. **No se toca.**
- **App B** = la aplicación nueva, producto **Checkout Pro**. Va a servir el OAuth con el que cada complejo cobra sus señas (`MP_CLIENT_ID` / `MP_CLIENT_SECRET`).

---

## Resumen en una pantalla

| Fase | Quién | Qué | Reversible |
|---|---|---|---|
| 1 | código | El buzón de webhooks acepta las dos claves (PR #194) | ✅ **HECHO y en producción** |
| 0 | 🧑 | Crear App B | ✅ **HECHA** — se borra la app si hace falta |
| 2 | 🧑 | Webhooks de App B + variables en Vercel y Railway | Sí — se revierten las variables |
| 0.4 | 🧑 | **GATE**: reconectar **tu** complejo y leer el scope | Sí — dos variables y un clic |
| 3 | 🧑 | Titi reconecta + prueba de la plata | Sí — reconecta de nuevo |
| 4 | código | ADR y memoria | — |

El orden quedó así —Fase 1 primero, y el gate metido adentro de la Fase 2— porque la prueba local resultó imposible: MercadoPago no acepta `localhost` como URL de redireccionamiento (§0.3).

**Regla de oro del orden:** la Fase 1 va **antes** que la Fase 2, y la carga de `MP_WEBHOOK_SECRET_CHECKOUT` va **antes** que el cambio de `MP_CLIENT_ID`/`MP_CLIENT_SECRET`. Invertirlo deja una ventana donde los avisos de pago se rechazan con 401 y las reservas quedan colgadas con la plata cobrada.

---

## FASE 0 — Crear App B y probar el scope (GATE del plan entero)

**Si el paso 0.4 no muestra `refunds/read-write`, el plan se frena acá** y hay que decidir el REQUIERE INPUT #4 del informe.

> **Cambio de plan sobre la marcha, 2026-08-22.** Esta fase estaba pensada para correr en local sin tocar nada. No se puede: MercadoPago **rechaza `http://localhost` como URL de redireccionamiento** (§0.3), así que el OAuth de prueba exige un dominio público. Las opciones eran montar un túnel HTTPS o hacer el gate en producción sobre el complejo de prueba del propio dueño; se eligió lo segundo, que sale más barato y es reversible en dos minutos (§0.4).

### 0.1 ✅ Cuánto dura un token — YA MEDIDO: 180 días

El log `mp oauth: token emitido` de producción (2026-08-22 15:46 UTC) trae **`expiresInDays: 180`**.

**Consecuencia:** los complejos siguen cobrando con su token actual durante meses, así que la Fase 3 **no es urgente por vencimiento**. Lo único que apura es destrabar el reembolso.

> Este dato desmiente el comentario "~6h" de `refresh-mp-tokens.worker.ts`, que se corrige en la Fase 4.

### 0.2 🧑 Crear la App B

1. Entrar con la cuenta maestra (381048203) a **https://www.mercadopago.com.ar/developers/panel/app** → **"Tus integraciones"**.
2. **"Crear aplicación"**.
3. **Nombre**: `TurnoGol Cobros` (máximo 50 caracteres alfanuméricos — sin "ñ" ni símbolos raros).
4. **"¿Qué tipo de solución de pago vas a integrar?"** → **"Pagos online"**.
5. **"¿Estás usando una plataforma de e-commerce?"** → **No**.
6. **"¿Qué producto estás integrando?"** → **"Checkout Pro"**. ← **este es el paso que arregla el bug**.
7. Confirmar. MercadoPago puede pedir **reautenticación o verificación de identidad** del titular: es normal, no es un error.

> Los textos exactos de las pantallas de MercadoPago cambian cada tanto. Lo invariante y lo único que importa es la elección **Pagos online → Checkout Pro**.

### 0.3 🧑 Registrar la URL de redireccionamiento

En App B → **"Detalles de aplicación"** → **"Editar datos"** → sección **"URLs de redireccionamiento"**:

- `https://turnogol.app/api/mp/callback`

La URL tiene que ser **estática y exacta** (sin query string): MercadoPago compara carácter por carácter y si no coincide devuelve error antes de mostrar la pantalla de permisos.

> **[MEDIDO 2026-08-22] MercadoPago RECHAZA `http://localhost:3000/api/mp/callback`.** Sólo acepta el dominio público. Era la incógnita que hacía posible la prueba local, y quedó cerrada por la negativa: **no hay prueba local sin un túnel HTTPS**. Por eso el gate se corrió a producción (paso 0.4), que además resultó ser más barato que montar el túnel.

### 0.4 🧑 El gate, en producción y sobre TU complejo

La prueba local es imposible sin túnel (ver arriba), así que el gate se hace en producción. **No es un atajo riesgoso, y por un motivo concreto:** `Complejo Elite Futbol` está conectado con **tu propia cuenta maestra de MercadoPago**, así que la primera reconexión la hacés vos, con tu cuenta, sobre tu complejo de prueba. Titi no se entera de nada hasta que el gate esté verde.

Esto **fusiona la Fase 0 con la Fase 2**: los pasos son los de la Fase 2 (webhooks + variables), y recién al final viene la lectura del scope que decide si se sigue.

1. Hacer la **Fase 2 completa** (§2.1, §2.2, §2.3 de este documento): webhooks de App B, `MP_WEBHOOK_SECRET_CHECKOUT` en Vercel, y después `MP_CLIENT_ID`/`MP_CLIENT_SECRET` en Vercel y Railway.
2. En **producción**, entrar como admin de **Complejo Elite Futbol** → **Configuración → Facturación** → **"Conectar MercadoPago"**.
3. Autorizar con **tu cuenta maestra**. Como App B es una aplicación nueva, MercadoPago **va a mostrar la pantalla de permisos** — que aparezca ya es buena señal: confirma que la reconexión de Titi va a ser una vinculación limpia.
4. Leer el `scope` del log `mp oauth: token emitido` en los logs de Vercel.

**GATE:**

- ✅ Aparece `urn:mp:online:payments:refunds/read-write` → seguir a la **Fase 3** y avisarle a Titi.
- ❌ No aparece → **PARAR** y revertir, que cuesta dos minutos: volver `MP_CLIENT_ID`/`MP_CLIENT_SECRET` a los de App A en Vercel y Railway, y reconectar Elite (un clic, **sin** pantalla de autorización, porque el consentimiento de App A sigue vigente). Después, decidir el REQUIERE INPUT #4 del informe.

**Qué se arriesga realmente en la ventana del gate**, para tenerlo dimensionado:

- Titi **sigue cobrando normal**: su token está guardado en la base y vale 180 días; el cambio de `MP_CLIENT_ID`/`MP_CLIENT_SECRET` no lo toca.
- Los webhooks de los pagos de Titi los sigue firmando App A, cuya clave sigue cargada y sigue siendo aceptada (eso es el PR #194).
- Lo único que se rompe en esa ventana es la **renovación** del token de Titi, que ya estaba rota por otro motivo (está en `status='canceled'`, que el cron excluye).

---

## FASE 1 — Código (PR #194, ya listo)

El buzón `/api/webhooks/mercadopago` acepta la firma de las dos aplicaciones. Detalle completo en el PR.

**Mergear es seguro en cualquier momento, incluso antes de crear App B:** con una sola clave configurada el comportamiento es idéntico al de hoy.

---

## FASE 2 — Producción: webhooks de App B y cambio de credenciales

### 2.1 🧑 Configurar los webhooks de App B

1. **"Tus integraciones"** → **App B** → menú izquierdo **"Webhooks"** → **"Configurar notificaciones"**.
2. **"URL modo producción"**: `https://turnogol.app/api/webhooks/mercadopago`
   **Sin query string.** El `?tenant=<uuid>` lo agrega TurnoGol por operación, en la `notification_url` que graba en cada preferencia de pago.
3. **Eventos**: tildar únicamente **"Pagos"** (tópico `payment`).
   No tildar los de suscripciones: esos son de App A y ya funcionan.
4. **Guardar**. MercadoPago genera ahí mismo la **clave secreta** de la aplicación.
5. Revelarla (ícono de ojo) y copiarla. Si alguna vez hace falta rotarla, el botón es **"Restablecer"** — pero ojo: al restablecer, la clave vieja deja de servir en el acto.

### 2.2 🧑 Cargar la clave en Vercel — **sin tocar todavía las credenciales OAuth**

En Vercel → proyecto → **Settings → Environment Variables**, agregar en **Production** y **Preview**:

```
MP_WEBHOOK_SECRET_CHECKOUT = <la clave secreta de App B>
```

**Verificar leyendo, no asumiendo** (`vercel env ls` o el dashboard). Ya nos pasó una vez que un `exit 0` mintiera y la variable no estuviera.

Redeploy para que la tome (si el PR #194 ya está mergeado, alcanza con un redeploy del último build).

**Checkpoint de regresión — hacerlo antes de seguir:** panel de MercadoPago → **App A** → **Webhooks** → historial de notificaciones. Las entregas de las últimas horas tienen que seguir en **200**. Si aparecen 401, algo se rompió y hay que parar acá.

### 2.3 🧑 El cambio de credenciales: Vercel **y** Railway, la misma sentada

1. **Vercel** (Production + Preview): `MP_CLIENT_ID` y `MP_CLIENT_SECRET` → los de **App B**. Redeploy.
2. **Railway** → servicio de workers → **Variables**: las **mismas dos**, también las de App B.
   **No saltear Railway.** El worker las usa para renovar los tokens de cada complejo y para reintentar los reembolsos, y Railway no valida variables al arrancar: el olvido sería completamente silencioso.
   (`MP_WEBHOOK_SECRET*` **no** hace falta en Railway: la firma se valida en Vercel, en el route handler.)
3. Con el entorno de producción cargado, correr:

```bash
pnpm launch:check --probe-only
```

Tiene que dar verde. La sonda de MercadoPago hace un intercambio OAuth deliberadamente inválido: un **400** significa "las credenciales autenticaron bien"; un 401/403 significa que el Client ID o el Secret están mal copiados.

### Efectos conocidos de la ventana entre la Fase 2 y la Fase 3

Ninguno es un bug; están previstos:

- Un OAuth que estuviera a mitad de camino justo en el momento del cambio falla con `mp_invalid_state` (el `state` estaba firmado con el secret viejo, y vive 10 minutos). Se reintenta y listo.
- El cron de renovación de tokens (cada 4 h) va a **fallar para los complejos que todavía tengan token de App A**, con un log de error por complejo y ruido en Sentry, hasta que reconecten. Es esperable: un `refresh_token` sólo lo puede canjear la aplicación que lo emitió.
- Los complejos **siguen cobrando señas normalmente** con su token viejo hasta que expire (ver `expiresInDays` de la Fase 0.1). Lo que sigue roto hasta la Fase 3 es el reembolso.

---

## FASE 3 — Reconectar Titi y probar la plata

> Sólo se entra acá con el **gate del §0.4 en verde**. Si el scope de tu propio complejo no trajo `refunds/read-write`, no hay nada que ganar molestando al complejo real.

### 3.1 Saber a quiénes hay que avisar

Desde el panel SuperAdmin, o directo en la base:

```sql
SELECT name, slug, status, mp_nickname, mp_connected_at
FROM tenants
WHERE mp_access_token IS NOT NULL;
```

**[MEDIDO 2026-08-22]** Hoy son **dos**, no uno:

| Complejo | `status` | Cuenta de MP |
|---|---|---|
| `complejo titi` | `canceled` | la del complejo (la que tiene la seña sin devolver) |
| `Complejo Elite Futbol` | `trialing` | **la cuenta maestra del dueño** (381048203), la misma que factura el SaaS |

Dos consecuencias prácticas:

- **Son dos reconexiones, no una.** La de Elite la hacés vos mismo, así que sirve de ensayo antes de llamar al complejo real.
- **A `complejo titi` ya no se le renueva el token**: el cron filtra por `status IN ('active','trialing','past_due','suspended')` y `canceled` queda afuera. Con 180 días de vigencia no es urgente, pero significa que ese complejo depende del token que tenga guardado hasta que su estado vuelva a ser operativo.

### 3.2 🧑 Cada complejo reconecta (2 minutos)

El dueño del complejo entra a **Configuración → Facturación** y aprieta **"Conectar MercadoPago"**.

**MercadoPago va a mostrar la pantalla de autorización**, porque el consentimiento se guarda por (usuario, aplicación) y nadie autorizó App B todavía. **No hay que revocar nada en ningún lado** — ese trámite incómodo es el que aparecería si en vez de crear App B le hubiésemos cambiado el producto a la App A, y es una de las razones por las que no lo hicimos.

Reconectar la misma cuenta al mismo complejo no choca con el índice único de "una cuenta de MP por complejo": el chequeo excluye al propio complejo.

### 3.3 Verificar la reconexión

En los logs de Vercel, el `mp oauth: token emitido` de ese complejo tiene que traer:

- `scope` con **`urn:mp:online:payments:refunds/read-write`**
- el `mpUserId` de la cuenta correcta

### 3.4 Prueba de fuego 1 — la seña vieja (gratis, se hace sola)

**[MEDIDO 2026-08-22 17:00 UTC]** Hay **una sola** fila de reembolso colgada, no dos:

```sql
SELECT p.id, t.name, p.amount, p.status, p.created_at, op.mp_payment_id, op.status AS original_status
FROM payments p
JOIN tenants t ON t.id = p.tenant_id
LEFT JOIN payments op ON p.description = 'Refund of ' || op.id::text
WHERE p.type = 'refund' AND p.status = 'pending';
```

→ `4a8a7ca8-4b5d-4520-8e7c-186fd8df202c`, `complejo titi`, $100, del 22-08 15:07 UTC, contra el pago de MercadoPago `174177392859` que sigue `approved` (la plata no volvió). Los otros dos reembolsos del 21-08 figuran `approved`: **que el 403 haya pasado dos veces no significa que hayan quedado dos filas colgadas.**

El cron `retry-refunds` corre **cada hora** y sólo toma refunds con más de 1 h de antigüedad, así que la va a reintentar solo, ahora con token de App B contra un pago cobrado con App A.

Mirar en la hora siguiente el log `retry-refunds run summary` (o Sentry):

- **Aprobada** → queda confirmado que una aplicación puede devolver lo que cobró la otra, **y la plata volvió**. Es la única pregunta que quedaba abierta del informe.
- **403 de nuevo** → también queda respondida: hay que devolverla a mano desde el panel del complejo, y decidir el REQUIERE INPUT #1 del informe.

> **Desactualizado desde el 2026-08-24**: el reembolso automático se eliminó, y con él la alerta `admin_refund_failed` de las 24 h. Hoy la fila queda `pending` a la vista del complejo en `/caja/devoluciones` desde el momento cero, y a los 7 días sin saldar sale `admin_refund_pending_reminder`.

### 3.5 Prueba de fuego 2 — el bug original, con plata mínima

1. Reserva real con la seña más chica posible.
2. Pagarla.
3. Cancelarla dentro del plazo de reembolso.
4. **Esperado:** el reembolso sale `approved` automáticamente — exactamente el experimento que falló el 21 y el 22.
5. Verificar además que el aviso del pago llegó con **200** (o sea que la firma de App B fue aceptada): panel de App B → Webhooks → historial.

---

## FASE 4 — Cerrar

- ADR en `docs/decisions/` con la decisión y sus consecuencias (dos claves de webhook; reconectar es obligatorio al cambiar de aplicación; qué destraba a futuro: con `payments/read-write` se abre la puerta a Checkout API / Bricks).
- Nota en `doc11` apuntando desde ADR-004 al ADR nuevo.
- ~~Corregir el comentario de `refresh-mp-tokens.worker.ts` sobre la vigencia del token.~~ **HECHO** (decía ~6 h, son 180 días).
- Evaluar aparte —no es de esta migración— que un complejo en `canceled` queda fuera del barrido de renovación de tokens.

---

## Si hay que volver atrás

- **Falla la Fase 0**: no se tocó nada. Borrar App B y restaurar `.env.local`.
- **Después de la Fase 2**: volver `MP_CLIENT_ID` / `MP_CLIENT_SECRET` a los de App A en **Vercel y Railway**. Los tokens de App A que sigan guardados vuelven a renovarse solos. Los complejos que ya hubieran reconectado con App B tienen que reconectar otra vez, y esa vez **no** verán pantalla de autorización (el consentimiento de App A sigue vigente): es un clic.
- `MP_WEBHOOK_SECRET_CHECKOUT` puede quedar cargada sin efecto, y el cambio de código de la Fase 1 **se queda**: es correcto con una aplicación o con dos.
