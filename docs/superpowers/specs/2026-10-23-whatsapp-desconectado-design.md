# WhatsApp desconectado y errores de conexión legibles

**Fecha:** 2026-10-23 · **Estado:** aprobado por Lazar el 2026-10-23 (A, B1 y C; B2 queda para después) · **Sobre:** #468 y #491 (conexión del número desde Ajustes)

## Problema

1. **Número caído sin aviso.** Si el número del complejo se desconecta de Kapso, el bot queda mudo y nadie se entera. La alerta de backlog no salta porque no entra nada. Causas documentadas: desconexiones ocasionales de la coexistencia, el dueño que desvincula la app y Meta que restringe la cuenta. Con `partner_managed` hay una más: **si el saldo de Kapso para Meta llega a cero, Kapso frena todos los envíos** (decisión W2).
2. **Fallo de conexión genérico.** El callback recibe `error_code` de Kapso y hoy todo termina en "No se terminó de conectar". El dueño no sabe qué hacer distinto la segunda vez.

## Qué dice Kapso (leído el 2026-10-23)

- **Health:** `GET /platform/v1/whatsapp/phone_numbers/{phone_number_id}/health` devuelve `status` (`healthy` | `degraded` | `unhealthy` | `error`), `timestamp`, `retry_after` (solo en backoff por error de acceso o token), `error` y `checks`. Los que importan:
  - `phone_number_connection.details.status`: `CONNECTED` | `DISCONNECTED` | `UNKNOWN`. Con `DISCONNECTED`, el `status` general es `unhealthy` aunque el resto pase.
  - `messaging_health.overall_status`: `AVAILABLE` | `LIMITED` | `BLOCKED`. El ejemplo de `BLOCKED` es un error de medio de pago de Meta.
  - `phone_number_access.passed = false`: Kapso no puede leer el número en Meta. El ejemplo es un token OAuth inválido, y ahí aparece `retry_after`.
  - Cachea 3 min por número. Límite propio: **5 por segundo y 60 por minuto por proyecto**. Un 429 llega antes de llamar a Meta y trae `Retry-After`.
- **`degraded`** en los ejemplos es `messaging_health = LIMITED` (por ejemplo, el nombre visible sin aprobar o un problema de pago que frena solo los mensajes que inicia el negocio) o `webhook_verified` en falso. Dentro de la ventana de 24 h el bot sigue contestando.
- **Errores del setup link** (`failure_redirect_url?setup_link_id&error_code`): `facebook_auth_failed`, `phone_verification_failed`, `waba_limit_reached`, `token_exchange_failed`, `link_expired` (a los 30 días) y `already_used`.
- **`reconnect_phone_number`** en el setup link fuerza a refrescar credenciales del MISMO número y WABA. Si no hay config que coincida devuelve 422. Bloquea `allowed_connection_types` al tipo existente.
- **Webhooks de proyecto:** `whatsapp.phone_number.disconnected` / `offboarded` / `deleted` / `reconnected` y `whatsapp.account.restricted` / `disabled` / `reinstated`. Se configuran en el dashboard (payload v2) y van a un endpoint del proyecto entero.

## Diseño

### Parte A — Aviso por mail cuando el número cae (incluida)

**Dónde.** `runWhatsappOpsAlerts` (`src/modules/super-admin/whatsapp-ops-alerts.service.ts`), que ya corre cada 5 min en el cron `whatsapp-ops-alerts`. Se suma un paso después de las alertas de conteo. No se toca el worker, ni `workers/index.ts`, ni `definitions.ts`, ni se registra un cron nuevo.

**Cliente.** `getKapsoPhoneNumberHealth(phoneNumberId)` en `src/lib/kapso/platform.ts`, con el patrón zod + `kapsoRequest` del archivo. 404 → `null` (Kapso ya no tiene el número). El schema valida solo lo que se usa (`status`, `retry_after`, `checks.phone_number_connection`, `checks.messaging_health`, `checks.phone_number_access`) y deja pasar el resto (`.loose()`).

**Qué números.** Las filas de `whatsapp_connections` de los complejos con el flag `whatsapp_bot` prendido: sin Plus no interesa. Se incluyen las que tienen el asistente apagado, porque un número caído es un bot mudo el día que lo prendan; el mail dice si está prendido.

**Ritmo.** De a uno, con 250 ms entre llamadas (menos de 5 por segundo). Con 429 se corta el tick y sigue en el próximo. También se corta después de 3 errores de red seguidos (timeout de 10 s o sin conexión): es Kapso caído o la red del worker, y seguir solo estira el tick. Una respuesta cualquiera en el medio reinicia la cuenta. En los dos cortes queda en el log cuántos números quedaron sin revisar (ajuste a partir de la revisión de #493). A este ritmo entran unos 50 números por tick sin tocar el límite de 60 por minuto. Con más que eso hay que pasar a los webhooks de proyecto.

**Cuándo hay mail** (un número está **caído**):

| Lo que devuelve Kapso                      | Causa (para el mail)                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| 404                                        | Kapso ya no tiene el número (lo sacaron del proyecto o Meta lo dio de baja)      |
| `phone_number_connection` = `DISCONNECTED` | Se desconectó de WhatsApp                                                        |
| `phone_number_access.passed = false`       | Kapso perdió el acceso (token vencido o revocado)                                |
| `messaging_health` = `BLOCKED`             | Meta frenó los envíos (saldo de Kapso, medio de pago o restricción de la cuenta) |
| `status` = `unhealthy` por otra cosa       | El número tiene un problema (el detalle está en Kapso)                           |

Las tres condiciones del pedido (`unhealthy`, `DISCONNECTED`, `BLOCKED`) se miran por separado: no se confía en que Kapso las refleje siempre en el `status` general.

**Caído se confirma con dos lecturas seguidas** (ajuste a partir de la revisión de #493). Con una sola lectura caída no hay mail ni cambio de estado: puede ser un corte de segundos de Meta, y con `disconnected` la ingesta tira los mensajes. La primera deja una sospecha en `ops_alerts` (clave `wa-sospecha:{tenantId}:{phoneNumberId}`, sin migración) y la confirma la siguiente lectura caída si llega dentro de 15 minutos: así uno o dos ticks en el medio que no pudieron mirar (error de Kapso o de red) no la pierden. Una lectura sana o `degraded` borra la sospecha; también se borra al marcar `disconnected`, para que si el dueño reconecta enseguida, una lectura vieja del cache de Kapso tenga que volver a confirmarse. Una fila que ya está `disconnected` no necesita confirmación: su mail del día sale con la primera lectura caída. Costo: la alerta llega unos 5 minutos más tarde.

**El 404 se confirma** (ajuste de implementación, a partir de la revisión). Antes de tratarlo como "Kapso ya no tiene el número" se pide el número (`GET /whatsapp/phone_numbers/{id}`). Si también da 404, el número no está. Si aparece, lo que cambió es la API del health: se trata como monitor ciego y nadie queda desconectado. Sin la confirmación, un cambio de ruta en Kapso dejaría `disconnected` a todos los complejos, y la ingesta tiraría sus mensajes. Cuesta un pedido más, y solo cuando hay un 404.

**Decisión: `degraded` no manda mail.** El bot sigue contestando dentro de la ventana de 24 h, y `LIMITED` es normal en un número nuevo con el nombre visible sin aprobar: un mail diario por eso entrena a ignorar la casilla. Queda un `logger.info` con los nombres de los checks que fallan, una vez por día y por número (clave `wa-degradado:` en `ops_alerts`): un `degraded` dura días y por tick eran 288 líneas diarias.

**Decisión: un error de Kapso no es un número caído.** `status: error`, 5xx, timeout o 429 → sin mail, `logger.warn`, y el próximo tick reintenta (con 429 se corta el tick). **Excepción: el monitor ciego.** Tres casos dejan sin revisar a todos los números a la vez: 401/403 (Kapso rechazó la clave, y el bot tampoco puede mandar), una respuesta 2xx que no entendemos (Kapso cambió el formato) y la falta de `KAPSO_API_KEY` en el worker. Se corta el tick y sale **un mail por día**, "No pudimos revisar los números de WhatsApp", con el motivo. Sin esto, el monitor queda ciego en silencio. (Ajuste de implementación: la spec aprobada mandaba la respuesta ilegible al log; un cambio de formato de Kapso dejaría el monitor ciego para siempre sin que nadie se entere.)

**Dedupe.** `wa-numero-caido:{tenantId}:{día ART}`: un mail por complejo y por día mientras siga caído. El monitor ciego usa `kapso-health:{día ART}`, uno por día sea cual sea el motivo. El canal es `sendOpsAlerts`, que ya reclama la clave antes de mandar y la libera si no le llegó a nadie.

**El mail** (sin datos de jugadores; el nombre del complejo sí):

- Asunto: `WhatsApp de {complejo}: {causa corta}`, por ejemplo "WhatsApp de El Vagón: el número se desconectó".
- Línea 1: qué pasó (la causa de la tabla).
- Línea 2: "El asistente está prendido: sus clientes no reciben respuesta." o "El asistente está apagado, así que hoy no se nota."
- Línea 3: qué hacer. Desconectado, sin acceso o 404: "Hay que volver a conectar el número desde Ajustes > Asistente de WhatsApp." Bloqueado: "Revisá el saldo de Kapso y la cuenta en Meta."
- Link: "Abrir el monitor del bot" (`/super-admin/whatsapp`), el mismo de las otras alertas.

### Parte B — El dueño ve el número caído y lo reconecta (B1 aprobada)

Hoy Ajustes > WhatsApp ya muestra "Tu número se desconectó. Volvé a conectarlo…" con el botón "Volver a conectar", y el monitor de super-admin ya pinta "Desconectado". Pero **nada escribe nunca `status = 'disconnected'`**. Sin la Parte B, el mail le avisa a Lazar algo que el dueño no puede arreglar desde el panel: su pantalla sigue diciendo que todo anda.

**B1 (aprobada):** el mismo paso del cron escribe el estado.

- Caído por desconexión, por acceso perdido o por 404 → `status = 'disconnected'` con CAS (`WHERE status = 'connected' AND phone_number_id = …`), más el audit `whatsapp.disconnected` (actor `system`). Bloqueado NO cambia el estado: no se arregla reconectando, y el bot puede seguir contestando dentro de las 24 h si el bloqueo es parcial.
- Vuelve solo: si una fila `disconnected` da sano otra vez (Meta la reconectó), vuelve a `connected` con su audit. Sin esto, una desconexión de 5 minutos callaría al bot hasta que el dueño entre a Ajustes.
- Reconectar desde Ajustes ya funciona: `registerWhatsappConnection` hace upsert a `connected` y vuelve a suscribir el webhook.
- Efecto: mientras está `disconnected`, la ingesta y el turno ya lo tratan como apagado. El número igual no recibe nada.
- Si falla la escritura del estado (un error de la base), se registra y el tick sigue: el mail de ese complejo y el de los demás salen igual.

**B2 (queda para después):** el link de "Volver a conectar" con `reconnect_phone_number`. Ata el flujo de Meta al mismo número y WABA, pero si Kapso no tiene la config (el caso 404, o un número que Meta dio de baja) devuelve 422 y hay que caer al link normal. Ese camino solo se prueba contra la API real. El link normal ya reconecta. Conviene sumarlo cuando haya una desconexión real para probarlo.

### Parte C — Errores de conexión legibles y checklist (incluida)

**Enum cerrado.** `WhatsappConnectError` suma seis valores; el mapa vive en `whatsapp-bot.connection.ts`:

| `error_code` de Kapso                  | Nuestro código (`?error=`)        | Lo que ve el dueño                                                                                             |
| -------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `facebook_auth_failed`                 | `facebook_cancelado`              | Se cerró Facebook antes de terminar. Volvé a intentarlo y entrá con la cuenta que maneja tu negocio.           |
| `phone_verification_failed`            | `numero_no_verificado`            | No se pudo verificar tu número. Tené a mano el celular con WhatsApp Business actualizada y volvé a intentarlo. |
| `waba_limit_reached`                   | `limite_de_cuentas`               | Tu cuenta de Facebook ya tiene demasiadas cuentas de WhatsApp. Escribinos y lo resolvemos.                     |
| `token_exchange_failed`                | `meta_fallo`                      | Meta no terminó la conexión. Esperá unos minutos y volvé a intentarlo.                                         |
| `link_expired`                         | `link_vencido`                    | El link venció. Volvé a intentarlo y te armamos uno nuevo.                                                     |
| `already_used`                         | `link_usado`                      | Ese link ya se usó. Si terminaste de conectar, tocá «Ya lo conecté». Si no, volvé a intentarlo.                |
| cualquier otro, o `fallo=1` sin código | `conexion_incompleta` (ya existe) | No se terminó de conectar. Volvé a intentarlo.                                                                 |

El query string nunca llega a la pantalla: el callback traduce a nuestro código, y la página ya filtra `?error=` contra las claves del mapa de mensajes. Se loguea el código de Kapso solo si coincide con `^[a-z_]{1,40}$`, para que Lazar vea cuál fue sin que un texto armado termine en el log.

**Checklist antes del botón.** Sale siempre que estén los botones de conectar, sea la primera vez o la reconexión:

> **Antes de conectar (tarda 1 minuto):**
>
> 1. Usá la app WhatsApp Business actualizada, no el WhatsApp común.
> 2. Entrá con la cuenta de Facebook que maneja tu negocio.
> 3. Si en WhatsApp Business tenés prendidas las etiquetas automáticas o el agente de IA de Meta, apagalos.
> 4. Cuando Meta te pregunte, elegí tu número. No elijas «usar un nombre visible con número virtual».

Reemplaza los tres párrafos que hoy salen antes de la primera conexión: los ítems 1, 2 y 4 ya decían eso. El consejo de los 14 días sale de ahí y queda solo debajo del asistente conectado, donde ya está: antes de conectar es una línea más para leer y todavía no sirve. Es una lista numerada nativa (`<ol>`), 14 px en `muted-foreground` y el título en `foreground`. Sin componente nuevo.

## Alternativa descartada para v1: webhooks de proyecto

|                      | Polling del health (elegido)                          | Webhooks de proyecto                                                                                    |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Latencia             | hasta ~8 min (5 de cron + 3 de cache)                 | al instante                                                                                             |
| Código nuevo         | un cliente y un paso en un cron que ya existe         | route handler nuevo, su secret y su firma, la idempotencia, y la configuración en el dashboard de Kapso |
| Qué detecta          | desconexión, token, bloqueo de envíos, número borrado | desconexión, baja, borrado y restricciones de la cuenta. El bloqueo por saldo no es un evento.          |
| Si se cae la entrega | el próximo tick vuelve a mirar                        | se pierde el evento hasta el reintento de Kapso                                                         |
| Escala               | ~50 números por tick                                  | sin límite                                                                                              |

El polling detecta más (incluido el saldo en cero, que es plata de TurnoGol), no suma superficie de ataque y alcanza de sobra para el piloto. Conviene pasar a webhooks al acercarse a 50 números, o si 8 minutos de latencia dejan de alcanzar.

## Fuera de alcance

- Avisarle al dueño fuera de Ajustes (en Hoy o con un push). Con la Parte B lo ve en Ajustes, y Lazar lo llama.
- B2 (`reconnect_phone_number`).
- Un mail de "el número volvió".
- Pintar el health en el monitor de super-admin.
- `KAPSO_PLAN_MONTHLY_MESSAGES` (lo confirma Lazar).

## Consumo de Kapso

N números × 288 ticks por día. Con el piloto (1 a 3 números) son menos de 900 llamadas por día. El límite general de 100 por minuto del plan Free sobra: el pico es N llamadas en unos segundos cada 5 minutos. Las llamadas de health no cuentan como mensajes.

## Efecto sobre El Vagón

Hoy ninguno: su número no está conectado. Cuando se conecte, el cron empieza a consultar su health cada 5 minutos. Con la Parte B, una desconexión real lo marca como desconectado: el bot ya estaba mudo, y el dueño ve el aviso y el botón en Ajustes.

## Archivos

- `src/lib/kapso/platform.ts`: `getKapsoPhoneNumberHealth`.
- `src/modules/super-admin/whatsapp-ops-alerts.service.ts`: clasificación pura, armado del mail y el paso del cron, con el cambio de estado de B1.
- `src/modules/whatsapp-bot/whatsapp-bot.connection.ts`: los valores nuevos de `WhatsappConnectError` y el mapa de Kapso. Otra sesión (cobro-plus) toca el principio de este archivo; esto va más abajo.
- `src/app/api/whatsapp/connect/callback/route.ts`: traduce `error_code`.
- `src/app/(admin)/settings/whatsapp/connect-messages.ts` y `page.tsx`: mensajes y checklist.
- Tests: `tests/unit/kapso-platform.test.ts`, `tests/unit/whatsapp-connect-callback.test.ts`, la clasificación nueva en `tests/unit/` y `tests/integration/whatsapp-ops-alerts.test.ts` con fetch mockeado.
- Sin migración.

## Criterio de éxito

- Con fetch mockeado: cada caso de la tabla manda exactamente un mail por complejo y por día. `degraded`, `error`, 5xx y timeout no mandan. 401 manda un solo mail por día. Un fallo de Kapso no frena las alertas de conteo. Sin el flag no se consulta.
- Cada `error_code` documentado termina en su mensaje, y uno inventado en el genérico.
- La checklist se ve en claro, en oscuro y a 390 px, antes de la primera conexión y en la reconexión.
- Juez: `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm knip` en verde.
