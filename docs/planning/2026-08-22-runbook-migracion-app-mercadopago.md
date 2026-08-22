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
| 0 | 🧑 | Crear App B y **probar en local que su scope trae `refunds/read-write`** | Sí — se borra la app |
| 1 | código | El buzón de webhooks acepta las dos claves (PR #194) | Sí — y conviene que quede igual |
| 2 | 🧑 | Webhooks de App B + variables en Vercel y Railway | Sí — se revierten las variables |
| 3 | 🧑 | Cada complejo reconecta MercadoPago + prueba de la plata | Sí — reconectan de nuevo |
| 4 | código | ADR y memoria | — |

**Regla de oro del orden:** la Fase 1 va **antes** que la Fase 2, y la carga de `MP_WEBHOOK_SECRET_CHECKOUT` va **antes** que el cambio de `MP_CLIENT_ID`/`MP_CLIENT_SECRET`. Invertirlo deja una ventana donde los avisos de pago se rechazan con 401 y las reservas quedan colgadas con la plata cobrada.

---

## FASE 0 — Crear App B y probar el scope (GATE del plan entero)

Nada de esta fase toca producción ni mueve un peso. **Si el paso 0.4 no muestra `refunds/read-write`, el plan se frena acá** y hay que decidir el REQUIERE INPUT #4 del informe.

### 0.1 🧑 Leer cuánto dura un token (logs de Vercel)

En el dashboard de Vercel → proyecto → **Logs** (o **Observability → Logs**), filtrar por el texto `mp oauth: token emitido`. La entrada más reciente trae un campo **`expiresInDays`**.

- Si dice ~180 → hay meses de aire; la reconexión de la Fase 3 no es urgente.
- Si dice 0 o 1 → el token vive horas y la Fase 3 hay que hacerla el mismo día que la Fase 2.

> Por qué importa: hoy tenemos dos fuentes que se contradicen (un comentario del worker dice ~6 h, la documentación de MercadoPago dice 180 días). Este log lo zanja con un dato propio.

### 0.2 🧑 Crear la App B

1. Entrar con la cuenta maestra (381048203) a **https://www.mercadopago.com.ar/developers/panel/app** → **"Tus integraciones"**.
2. **"Crear aplicación"**.
3. **Nombre**: `TurnoGol Cobros` (máximo 50 caracteres alfanuméricos — sin "ñ" ni símbolos raros).
4. **"¿Qué tipo de solución de pago vas a integrar?"** → **"Pagos online"**.
5. **"¿Estás usando una plataforma de e-commerce?"** → **No**.
6. **"¿Qué producto estás integrando?"** → **"Checkout Pro"**. ← **este es el paso que arregla el bug**.
7. Confirmar. MercadoPago puede pedir **reautenticación o verificación de identidad** del titular: es normal, no es un error.

> Los textos exactos de las pantallas de MercadoPago cambian cada tanto. Lo invariante y lo único que importa es la elección **Pagos online → Checkout Pro**.

### 0.3 🧑 Registrar las URLs de redireccionamiento

En App B → **"Detalles de aplicación"** → **"Editar datos"** → sección **"URLs de redireccionamiento"**. Cargar las dos:

- `https://turnogol.app/api/mp/callback` — producción
- `http://localhost:3000/api/mp/callback` — para la prueba del paso siguiente

La URL tiene que ser **estática y exacta** (sin query string): MercadoPago compara carácter por carácter y si no coincide devuelve error antes de mostrar la pantalla de permisos.

> **Si el panel rechaza `http://localhost`** (no está confirmado que lo acepte): levantar un túnel HTTPS gratis con `cloudflared tunnel --url http://localhost:3000`, registrar la URL que imprime, y usar esa misma URL como `NEXT_PUBLIC_APP_URL` en el paso 0.4.

### 0.4 🧑 La prueba decisiva: OAuth en local y leer el scope

1. En App B → **"Credenciales de producción"**, copiar **Client ID** y **Client Secret**.
2. En `.env.local`: **comentar** (no borrar) los `MP_CLIENT_ID` / `MP_CLIENT_SECRET` actuales y poner los de App B. Dejar `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
3. `pnpm supabase:start` y `pnpm dev`.
4. Entrar como admin de un complejo local → **Configuración → Facturación** → **"Conectar MercadoPago"**.
5. Autorizar con **tu propia cuenta de MercadoPago**. Como App B es una aplicación nueva, MercadoPago **va a mostrar la pantalla de permisos** — que aparezca ya es en sí una buena señal: confirma que la Fase 3 va a ser una vinculación limpia.
6. En la consola de `pnpm dev`, buscar el log **`mp oauth: token emitido`** y leer el campo **`scope`**.

**GATE:**

- ✅ Aparece `urn:mp:online:payments:refunds/read-write` → **seguir a la Fase 2** (la Fase 1 ya está en el PR #194).
- ❌ No aparece → **PARAR**. Borrar App B, restaurar `.env.local`, y decidir el REQUIERE INPUT #4 del informe (ticket a soporte de MercadoPago, o aceptar que el reembolso sea manual).

7. Pase lo que pase: restaurar `.env.local` con las credenciales viejas. Opcional y prolijo: revocar "TurnoGol Cobros" desde tu cuenta personal (**Tu perfil → Seguridad → Aplicaciones conectadas**) para que el consentimiento de prueba no quede colgado.

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

## FASE 3 — Reconectar los complejos y probar la plata

### 3.1 Saber a quiénes hay que avisar

Desde el panel SuperAdmin, o directo en la base:

```sql
SELECT name, slug, mp_nickname, mp_connected_at
FROM tenants
WHERE mp_access_token IS NOT NULL;
```

### 3.2 🧑 Cada complejo reconecta (2 minutos)

El dueño del complejo entra a **Configuración → Facturación** y aprieta **"Conectar MercadoPago"**.

**MercadoPago va a mostrar la pantalla de autorización**, porque el consentimiento se guarda por (usuario, aplicación) y nadie autorizó App B todavía. **No hay que revocar nada en ningún lado** — ese trámite incómodo es el que aparecería si en vez de crear App B le hubiésemos cambiado el producto a la App A, y es una de las razones por las que no lo hicimos.

Reconectar la misma cuenta al mismo complejo no choca con el índice único de "una cuenta de MP por complejo": el chequeo excluye al propio complejo.

### 3.3 Verificar la reconexión

En los logs de Vercel, el `mp oauth: token emitido` de ese complejo tiene que traer:

- `scope` con **`urn:mp:online:payments:refunds/read-write`**
- el `mpUserId` de la cuenta correcta

### 3.4 Prueba de fuego 1 — las señas viejas (gratis, se hace sola)

Las dos señas del 21 y 22 de agosto que no se pudieron devolver siguen con su fila de pago en estado `pending`. El cron `retry-refunds` corre **cada hora** y las va a reintentar solo, ahora con el token de App B contra pagos que se cobraron con App A.

Mirar en la hora siguiente el log `retry-refunds run summary` (o Sentry):

- **Aprobadas** → queda confirmado que una aplicación puede devolver lo que cobró la otra, **y la plata volvió**. Es la única pregunta que quedaba abierta del informe.
- **403 de nuevo** → también queda respondida: hay que devolver esas dos a mano desde el panel del complejo, y decidir el REQUIERE INPUT #1 del informe.

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
- Corregir el comentario de `refresh-mp-tokens.worker.ts` sobre la vigencia del token si el `expiresInDays` medido lo desmiente.

---

## Si hay que volver atrás

- **Falla la Fase 0**: no se tocó nada. Borrar App B y restaurar `.env.local`.
- **Después de la Fase 2**: volver `MP_CLIENT_ID` / `MP_CLIENT_SECRET` a los de App A en **Vercel y Railway**. Los tokens de App A que sigan guardados vuelven a renovarse solos. Los complejos que ya hubieran reconectado con App B tienen que reconectar otra vez, y esa vez **no** verán pantalla de autorización (el consentimiento de App A sigue vigente): es un clic.
- `MP_WEBHOOK_SECRET_CHECKOUT` puede quedar cargada sin efecto, y el cambio de código de la Fase 1 **se queda**: es correcto con una aplicación o con dos.
