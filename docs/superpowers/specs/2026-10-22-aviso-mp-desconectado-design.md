# Aviso de MercadoPago desconectado (feature #3, ola 2)

**Fecha:** 2026-10-22 · **Estado:** aprobado por Lazar el 2026-10-22 (las 4 decisiones, abajo) · **Cierra:** ítem "`application.deauthorized` se descarta con 400" de `docs/tech-debt.md`

## Problema

Si el dueño de un complejo desautoriza la app de TurnoGol en su cuenta de MercadoPago, o el token OAuth de Checkout Pro deja de servir, la reserva online con seña se rompe y nadie se entera:

- `mp_connected_at` sigue con fecha y Configuración dice "Conectado".
- El portal sigue pidiendo seña. `createDepositPayment` falla, el jugador ve una página de error y el turno queda en `pending_payment` hasta que vence el hold.
- El que descubre la desconexión es el cliente del cliente.

## Qué dice MercadoPago (verificado)

- **El evento existe.** El tópico se llama "Vinculación de aplicaciones" y llega con `type: "mp-connect"`. El campo `action` vale `application.authorized` o `application.deauthorized`. `user_id` es la cuenta del vendedor e `id` sirve para la idempotencia. La firma es la misma `x-signature` de siempre ([doc oficial de notificaciones de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-settings/optional-notifications)).
- **`data.id` es la cuenta.** El único caso real (panel de la app de Suscripciones, 22/08 13:44) muestra "Recurso 381048203", que es la cuenta que desautorizó. La firma cubre `data.id` y NO cubre el body, así que el complejo se resuelve por `data.id`.
- **El refresh tiene errores con nombre.** El token de refresh responde 400 con `invalid_grant` cuando el refresh es inválido, venció, fue revocado o es de otra app. Con `unauthorized_client`, la app no tiene grant con ese usuario. Con `invalid_client`, las credenciales de TurnoGol están mal.
- **Lo que la doc no dice:** si desautorizar invalida al instante el access token vigente, que dura 180 días. Por eso el diseño no depende de eso.

## Diseño

### 1. Un solo veredicto: renovar el token

El evento NO se toma como verdad. Funciona como disparador de una comprobación: TurnoGol intenta renovar el token del complejo.

- Si renueva, el permiso está vivo y no se marca nada.
- Si MP contesta `invalid_grant` o `unauthorized_client`, se marca desconectado.

Esto resuelve tres casos sin código especial:

- **Desvinculó y volvió a vincular, y el evento llegó tarde:** MP reintenta cada 15 minutos. El refresh anda, así que no se marca nada.
- **Desvinculó OTRA app de TurnoGol con la misma cuenta.** Pasó el 22/08 con la cuenta master y la app vieja. El permiso de Checkout Pro sigue vivo, así que no se marca nada.
- **Eventos repetidos:** se cortan por `processed_webhooks`, igual que hoy. El payload crudo queda guardado ahí para replay.

### 2. Tres vías de detección, el mismo marcador

| Vía                                                    | Dónde                                                                                                                                                                                                                                 | Cuándo se entera                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Evento `mp-connect` / `application.deauthorized`       | `route.ts` resuelve el complejo por `mp_user_id = data.id`, después de validar la firma. La validación queda como está: no se toca `webhook-auth.ts`. El evento se encola en `process-mp-webhook`, que ya existe; la cola no se toca. | Al instante, si el tópico está tildado en la app de Checkout Pro (paso operativo, más abajo) |
| Refresh al vuelo ante un 401 (`refreshTenantMpToken`)  | Lo usan la seña del portal, el bot de WhatsApp, el webhook de pago y los workers de conciliación                                                                                                                                      | En el primer cobro que falle                                                                 |
| Cron de refresh (`refresh-mp-tokens.worker`, cada 4 h) | Ya existe                                                                                                                                                                                                                             | ≤ 4 h                                                                                        |

Reglas del marcador:

- **Columna nueva:** `tenants.mp_disconnected_at TIMESTAMPTZ NULL`, en la migración **100** (número a fijar contra `origin/main` al abrir el PR; nunca la 099). Es nullable y sin default: en Postgres es solo metadata, sin reescribir la tabla. Va en columna y no en `settings` jsonb, para que un guardado de Configuración no la pise.
- **Se marca con compare-and-set:** `UPDATE … WHERE mp_refresh_token = <el que se usó> AND mp_disconnected_at IS NULL`. Así un `invalid_grant` de un refresh que perdió una carrera no marca nada, porque el otro ya rotó el token. Y la segunda detección no vuelve a avisar.
- **Espera de 1 s antes del CAS** (revisión adversarial): con dos refresh del mismo token, el que gana ya lo consumió en MP pero puede no haber commiteado el nuevo, y el que pierde vería todavía el token viejo y marcaría. Este camino corre solo cuando un refresh ya falló, así que el segundo no le cuesta a nadie.
- **Freno ante una revocación masiva (cron):** si en un barrido fallan con `invalid_grant` 3 complejos o más y son más de la mitad, no se marca a ninguno: `logger.error` + Sentry. Un refresh token está atado al par (aplicación, vendedor). Si `MP_CLIENT_ID` pasa a apuntar a otra aplicación, todos los refresh fallan aunque ningún dueño haya revocado nada y los access tokens sigan cobrando. Avisarles a todos "reconectá" sería mentirles. Con uno o dos complejos conectados el freno no actúa. Los que ya estaban marcados siguen en el barrido (un refresh bueno los cura) pero no cuentan para el freno ni se vuelven a marcar: si contaran, tres marcados sin reconectar lo dispararían en cada tick.
- **Se limpia** en cada refresh exitoso, al reconectar (callback de OAuth) y al desvincular desde TurnoGol. Un falso positivo se cura solo en el próximo refresh bueno.
- **Los tokens NO se borran.** Marcar es reversible; borrar no.
- **Es la primera migración de tres cifras que arranca en 1.** CI (`ci.yml`) y el stack de e2e aplicaban `0*.sql` y la salteaban en silencio; el glob pasó a `[0-9]*.sql` en el mismo cambio. Prod no se ve afectado: `db-migrate.yml` empuja el espejo `supabase/migrations/20260424000100_…`, que ordena después de la 099.
- **Auditoría:** cada transición deja una fila en `audit_logs` (`tenant.mp_disconnected_detected`, actor `system`), con qué la detectó y el código de error de MP. Nunca tokens.
- **Otros errores no marcan:** `invalid_client`, 5xx, timeout, red. Esos errores son de TurnoGol o de MP, no del complejo, y avisarle "reconectá" sería mentirle. Siguen como hoy: `logger.error` y reintento. El mensaje del error lleva el código de MP solo si tiene forma de código OAuth (`^[a-z_]{1,40}$`): un `message` libre de MP no llega a logs ni a Sentry.

### 3. Lo que ve el complejo

**Hoy → "Necesita tu atención"**, con un tercer evento (requiere enmendar la taxonomía, ver la decisión 2):

| Rol       | Renglón 1                 | Renglón 2                                         | Acción                                                                                              |
| --------- | ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Dueño     | MercadoPago se desconectó | Las reservas online entran sin seña · hace 2 h    | **Reconectar** → `/api/mp/oauth-start` → vuelve a `/settings/reservas#mercado-pago` con "Conectado" |
| Encargado | MercadoPago se desconectó | Avisale al dueño para que lo reconecte · hace 2 h | Sin botón: `oauth-start` es solo del admin                                                          |

El texto del renglón 2 sale de la decisión 1 (reservar sin seña).

- **Prioridad P1**, arriba de devoluciones: mientras dure, cada reserva online con seña se pierde. El tono es `destructive` (el rojo de `StatusTone`): esto no es plata trabada, es el canal de cobro cortado.
- **Configuración:**
  - **`/settings/reservas`:** la tarjeta de MercadoPago pasa a "Desconectado" (ámbar), con una línea de qué pasó y un botón "Reconectar MercadoPago". Se mantiene "Desconectar". Deja de decir "Cobrando en la cuenta X" (pasa a "Estaba conectada la cuenta X") y no muestra el aviso de los 18 días de acreditación, porque mientras dura la marca no se cobra.
  - **Portada `/settings`:** dice "Desconectado" en vez de "Conectado".

  Sin esto, Hoy diría "desconectado" y Configuración "Conectado".

- **Push al dueño** (decisión 3): una sola vez, al pasar de conectado a desconectado, por `notifyAdminPush`. Respeta el horario silencioso: entre las 00 y las 08 se agenda para las 08:00. Título: "MercadoPago se desconectó". Toca → Hoy. Lleva dedupeKey para que un reintento del worker no lo duplique. `notifyAdminPush` le llega a toda suscripción del staff del complejo, encargados incluidos. Por eso el texto es neutro: "Las reservas online entran sin seña hasta que se reconecte."
- **Sin mails:** los templates son superficie de RIVAL.

### 4. Lo que NO cambia

- `webhook-auth.ts` y las dos claves.
- Las colas y sus definiciones. Nada de la superficie de RIVAL.
- Las reglas de seña: default, porcentaje y `requires_deposit`.
- Qué pasa con la reserva online: se rige por la decisión 1 → se confirma sin seña mientras dure la marca (`depositUnpayable` en `reservar/actions.ts` y `booking.whatsapp.ts`; `getPublicTenant.requiresDeposit` da `false` para que el portal y el bot no anuncien una seña que no se va a cobrar).
- El aviso sale aunque el complejo tenga la seña apagada: el canal está cortado igual, y hay que reconectar antes de volver a pedirla.

## Decisiones de Lazar (resueltas el 2026-10-22)

Elegidas las cuatro recomendadas: **1 → (b) reservar sin seña** · **2 → enmienda aprobada, P1** · **3 → push sí, una vez por transición** · **4 → el encargado ve la alerta, sin botón**. Detalle de la 1 en `docs/decisions/2026-10-22-reservar-sin-sena-con-mp-desconectado.md`; la 2 en la enmienda de `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md`.

Lo que se preguntó:

1. **Mientras MP está desconectado, ¿qué hace la reserva online que pide seña?**
   - (a) **Solo avisar** (default del contrato): el jugador sigue chocando con el error al pagar y el turno vuelve a quedar libre cuando vence el hold.
   - (b) **Reservar sin seña mientras tanto**: es el mismo criterio que fijaste para F-003 el 2026-08-18 ("el complejo se queda con el turno y cobra en el mostrador, que es estrictamente mejor que perder al cliente en silencio"). Hoy ya pasa así cuando no hay token (`depositUnpayable`). Esta opción lo extiende a "hay token pero está marcado". Toca `reservar/actions.ts` y `booking.whatsapp.ts`.
2. **Enmienda a la taxonomía de Hoy:** sumar "MercadoPago desconectado" como tercer evento, P1. En 2026-08-02 "conexión de MP caída" quedó explícitamente afuera de v1.
3. **Push al dueño:** ¿sí o no?
4. **Encargado:** ¿ve la alerta (sin botón, "Avisale al dueño") o solo el dueño?

## Efecto sobre El Vagón (prod)

- **Migración:** solo agrega una columna nullable. No toca filas. Se aplica sola al mergear.
- **Si El Vagón no tiene MP de señas conectado** (todo indica que no: cobra sin seña), el efecto es nulo. Ningún camino nuevo lo toca.
- **Si lo tiene y el refresh de las 4 h anda**, el efecto también es nulo.
- **Si lo tiene y su refresh ya falla con `invalid_grant`** (por ejemplo, tokens de la app vieja), dentro de las 4 h del deploy le aparece la alerta y, si va el push, le llega uno. Es un aviso verdadero: TurnoGol no puede renovarle el token.

Para saberlo antes de mergear, una lectura que corrés vos (el auto mode no me deja leer prod):

```sql
SELECT name, mp_user_id IS NOT NULL AS mp_conectado, mp_connected_at,
       settings->>'requires_deposit' AS pide_sena
FROM tenants WHERE name ILIKE '%vag%';
```

`mp_connected_at` se actualiza en cada refresh exitoso. Si tiene menos de ~4 h, su refresh anda y no le cambia nada.

## Pasos operativos (no son código)

1. Panel de MP → app **TurnoGol Cobros** (Checkout Pro) → Webhooks → Configurar notificaciones → tildar **"Vinculación de aplicaciones"**. Sin esto, la vía 1 no existe y quedan solo el cron de 4 h y el primer cobro.
2. **Ensayo en sandbox** (puede hacerlo la sesión de ensayo de cobro): desvincular la cuenta vendedora de prueba y confirmar dos cosas:
   - que llega `mp-connect` firmado con la clave de Checkout Pro y con `data.id == user_id`;
   - que el refresh da `invalid_grant` o `unauthorized_client`.

   Si `data.id ≠ user_id`, el código lo registra como `error` (llega a Sentry) y no actúa.

## Alternativas descartadas

- **Borrar los tokens al detectar**, como el "Desconectar" de la UI. Es irreversible ante un falso positivo y, por `depositUnpayable`, cambia en silencio la seña de las reservas. Esa decisión es la 1, no un efecto colateral.
- **Tomar el evento como verdad sin comprobar:** daría falso positivo en los casos de reconexión tardía y de otra app.
- **Guardar el estado en `settings` jsonb:** lo puede pisar un guardado de Configuración, y ya hay historia de jsonb pisado en este repo.
- **Cola nueva:** está vedada en esta ola, y `process-mp-webhook` alcanza.

## Tests

- **Unit, refresh:**
  - `invalid_grant` y `unauthorized_client` → `MpGrantRevokedError`.
  - `invalid_client`, 5xx o un body no-JSON → `MpGatewayError`, sin marcar.
- **Unit, route:**
  - deauthorized → encola con el complejo de `data.id`;
  - authorized → `ignored`;
  - `user_id ≠ data.id` → `ignored` y `logger.error`;
  - cuenta desconocida → 200 `ignored`;
  - firma inválida → 401, sin leer el complejo.
- **Unit, handler `mp-connect`:**
  - refresh OK → no marca;
  - revocado → marca;
  - transitorio → throw (reintenta pg-boss);
  - duplicado → corta.
- **Integración (Postgres descartable):**
  - el CAS marca y no re-marca;
  - con el refresh token rotado no marca;
  - se limpia al refrescar, conectar y desconectar;
  - deja la fila de auditoría.
- **Hoy:** el orden P1, y la vista del dueño (CTA) vs la del encargado (sin CTA). Hay stories de `NeedsAttention` y de la tarjeta de Configuración.
- **`verificacion-ux`:** Hoy con el complejo marcado, a 390 px y en desktop, en un puerto propio.
