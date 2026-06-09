# Auditoría Cross-Layer de Verificación Final

---

## Eje 1: Consistencia de la máquina de estados del tenant

### [BLOQUEANTE] — `tenant_status` usa `'trial'` en vez de `'trialing'` (ENUM inválido)
- **Docs involucrados**: Doc 4 §2 vs Doc 13 §2.1 (línea 197); también Doc 7 Flujo 1 (línea 72), Doc 8 US-ONB-002 (línea 118) y US-SAS-001 (línea 1431), Doc 12 §9.2 y §9.5 (líneas 384, 736, 835).
- **Inconsistencia**: Doc 4 §2 declara autoritativamente que el primer estado es `trialing`. Doc 13 define el ENUM correctamente con `trialing`, pero acto seguido declara la columna con `DEFAULT 'trial'` (que NO es un valor del ENUM). El mismo comentario en doc13 línea 198 dice "Solo si status = 'trial'". Flujo 1 paso 3 indica `crear Tenant con status='trial'`. Doc 8 dos stories repiten el literal `'trial'`. Doc 12 tiene tres queries (`INSERT`, `WHERE`, otra `WHERE`) con `'trial'`.
- **Impacto**: La migración falla al correr (PostgreSQL rechaza el DEFAULT porque `'trial'` no es un valor del ENUM `tenant_status`). Cualquier query hardcodeada con `'trial'` va a fallar o devolver 0 filas en runtime. Todo el onboarding y el cron de expiración de trials está roto.
- **Corrección sugerida**: 
  - Doc 13 línea 197 → `DEFAULT 'trialing'`.
  - Doc 13 línea 198 → "Solo si status = 'trialing'".
  - Doc 7 Flujo 1 paso 3 → `status='trialing'`.
  - Doc 8 líneas 118 y 1431 → `status='trialing'`.
  - Doc 12 líneas 384, 736, 835 → `'trialing'`.
  - Doc 12 §9.2 ejemplo de INSERT (línea 736): reemplazar también el DEFAULT mental del bloque.

### [BLOQUEANTE] — `booking_status` usa `cancelled_*` (doble L) en flujos y stories
- **Docs involucrados**: Doc 13 §1 (ENUM) vs Doc 7 Flujo 4 (líneas 502, 549, 594, 598) y Doc 8 US-CAN-001/002/003 (líneas 568, 605, 639, 640).
- **Inconsistencia**: El ENUM `booking_status` en doc13 tiene `canceled_refunded` y `canceled_no_refund` (una L). Pero en doc7 Flujo 4 (las 4 variantes de cancelación) se usa `'cancelled_refunded'` y `'cancelled_no_refund'` (doble L). Doc 8 US-CAN-001 a 004 repiten los literales con doble L.
- **Impacto**: El dev que implemente la transición de estado al cancelar, copiando los literales de doc7/doc8, generará un error de runtime de PostgreSQL (`invalid input value for enum booking_status`). El flujo de cancelación queda 100% roto.
- **Corrección sugerida**: Buscar y reemplazar en doc7 líneas 502, 549, 594, 598 y doc8 líneas 568, 605, 639, 640: `cancelled_refunded` → `canceled_refunded` y `cancelled_no_refund` → `canceled_no_refund`. Esto fue explícitamente marcado como "Resuelto" en el walkthrough (sesión 2, sección "ENUMs unificados a canceled"), pero la corrección NO se aplicó a doc7/doc8; solo a doc13.

### [ALTO] — Timeline de dunning inconsistente dentro de doc4 y vs doc7
- **Docs involucrados**: Doc 4 §2 (diagrama ASCII) vs Doc 4 §4 (Timeline Visual) vs Doc 7 Flujo 8 (línea 1443-1444).
- **Inconsistencia**: El diagrama ASCII de doc4 §2 etiqueta `SUSPENDED ─[14 días sin pago]→ BLOCKED` y `BLOCKED ─[90 días sin pago]→ CHURNED`. La interpretación natural es "14 días en SUSPENDED" y "90 días en BLOCKED". Pero el Timeline de doc4 §4 (y el flujo 8 de doc7) dicen: PAST_DUE día 0-6, SUSPENDED día 7, BLOCKED día 14, CHURNED día 90, DELETED día 97 → eso significa **7 días en SUSPENDED y 76 días en BLOCKED**, no 14 y 90. Adicionalmente, doc7 §"Jobs automáticos" línea 1443 dice "Tenants suspended > 14 días → blocked" (debería ser > 7 días) y línea 1444 "blocked > 90 días → churned" (debería ser > 76 días, o bien "sin pagar desde día 0 > 90 días").
- **Impacto**: El dev que implemente los crons de dunning leyendo doc7 §"Jobs automáticos" programará los jobs con umbrales incorrectos (14 y 90 días de permanencia en el estado), lo que mueve el timeline real a día 21 (BLOCKED) y día 104 (CHURNED) — 14 días extra de tolerancia. Pierde revenue de recupero y rompe la correspondencia con los emails de dunning (que sí están programados contra los días 7, 14, 90, 97).
- **Corrección sugerida**: 
  - Doc 4 §2 diagrama ASCII: cambiar etiquetas a `[7 días más sin pago]` entre SUSPENDED→BLOCKED y `[76 días más sin pago]` entre BLOCKED→CHURNED, o reformular como "día 14 del dunning" y "día 90 del dunning".
  - Doc 7 línea 1443 → "Tenants en suspended > 7 días (día 14 del dunning) → blocked".
  - Doc 7 línea 1444 → "Tenants en blocked > 76 días (día 90 del dunning) → churned + eliminación día 97".

### [MEDIO] — doc4 §13 omite `blocked` y `deleted` en el schema textual de `TenantSubscription.status`
- **Docs involucrados**: Doc 4 §13 vs Doc 13 §1 (`subscription_status` ENUM).
- **Inconsistencia**: Doc 4 §13 lista `status: trialing | active | past_due | suspended | canceled | churned` (6 valores). Pero el ENUM `subscription_status` en doc13 tiene 7 valores (incluye `blocked`). El walkthrough sesión 2 dice explícitamente que se agregó `blocked` a `subscription_status`, pero doc4 §13 quedó sin actualizar.
- **Impacto**: Un dev leyendo doc4 §13 como "entidades de referencia" puede asumir que no existe el estado `blocked` en la suscripción y manejar el dunning solo con los 6 valores, lo que rompe el flujo 8 día 14.
- **Corrección sugerida**: Doc 4 §13 → agregar `blocked` al listado de status.

### [BAJO] — Tabla `tenant_status` de doc4 §2 color "Rojo" para `suspended` pero el semáforo declarado en CLAUDE.md para la UI no está especificado
- Cosmético. No bloquea implementación.

---

## Eje 2: Consistencia del modelo financiero (señas + suscripciones)

### [BLOQUEANTE] — Columnas `cancelled_*` en `bookings` con doble L contradicen la regla de ortografía canónica
- **Docs involucrados**: Doc 13 §3.2 (líneas 492-494, 570) vs CLAUDE.md "Convenciones críticas de schema" y Doc 4 §13 nota final.
- **Inconsistencia**: La regla canónica es `canceled` (una L). Doc 13 §3.2 declara las columnas `cancelled_reason`, `cancelled_by`, `cancelled_at` (doble L). El comentario final de la tabla (línea 570) también usa `cancelled_*` para describir la transición.
- **Impacto**: Los ORM generados a partir del schema (Drizzle) expondrán los campos como `cancelledReason`, `cancelledBy`, `cancelledAt`. Cuando el dev implemente los casos de cancelación siguiendo doc7/doc8 (que ya tienen `cancelled_by = 'player'` como doble L), va a haber coincidencia accidental pero violación de la regla. Y si un dev prolijo corrige los valores de ENUM a `canceled_*` (una L) pero no las columnas → inconsistencia grave dentro del mismo `UPDATE bookings SET status = 'canceled_refunded', cancelled_by = 'player'`.
- **Corrección sugerida**: 
  - Doc 13 §3.2: renombrar columnas a `canceled_reason`, `canceled_by`, `canceled_at`. Actualizar también el trigger `enforce_booking_immutability` si referencia estos campos.
  - Doc 13 §3.2 línea 570: `cancelled_*` → `canceled_*`.
  - CLAUDE.md ampliar la regla explícitamente: "la regla `canceled` (una L) aplica también a NOMBRES DE COLUMNAS, no solo a valores de ENUM".

### [CRÍTICO] — Webhooks de MP listados en doc4 §7 no coinciden 1:1 con los nombres usados en doc7 y el estado `expired` no tiene webhook asociado
- **Docs involucrados**: Doc 4 §7 (tabla "Webhooks de señas") vs Doc 7 Flujo 2 PASO 5.
- **Inconsistencia**: Doc 4 §7 lista `payment.approved`, `payment.rejected`, `payment.pending` (in_process), `payment.refunded`. Doc 7 Flujo 2 PASO 5 menciona adicionalmente que "si payment.status = 'rejected' o 'cancelled'" el booking permanece pending_payment — pero `payment.cancelled` no está en la lista de webhooks de doc4 §7. Además, el evento `payment.pending` de doc4 §7 dice "extender timer a 48hs", pero el Timer de expiración de doc7 Flujo 2 (línea 289-299) menciona SOLO 15 minutos sin caso especial para `in_process`/CBU.
- **Impacto**: El handler de webhooks queda incompleto (no maneja `payment.cancelled`). El timer de pending_payment no tiene la lógica de extensión a 48hs para transferencias CBU mencionada en doc4. Bookings legítimos con transferencia bancaria van a expirar a los 15 minutos y perder el slot, generando disputa con el jugador (que SÍ pagó pero llegó tarde).
- **Corrección sugerida**: 
  - Doc 7 Flujo 2 PASO 5: si se usa `'cancelled'` como valor de MP (que es el nombre del evento externo, no de nuestro ENUM), mantenerlo entre comillas pero documentar que es el literal de MP.
  - Doc 7 Flujo 2 §"Timer de expiración": agregar branch "si Payment.status = `pending` con `in_process` (CBU) → extender timer a 48hs" como dice doc4 §7.

### [MEDIO] — `deposit_percentage` vive en JSONB `tenant.settings`, pero doc4 §7 lo trata como campo de primer nivel
- **Docs involucrados**: Doc 4 §7 ("Configuración del complejo") y §10 ("Política de cancelación configurable — campos `cancellation_policy_hours` y `deposit_percentage` en tenant settings") vs Doc 13 §2.1 (JSONB `settings`).
- **Inconsistencia**: Doc 4 §7 lista cuatro campos (`deposit_percentage`, `cancellation_policy_hours`, `cancellation_refund_percentage`, `requires_deposit`). Doc 13 los modela dentro del JSONB `tenants.settings` con los nombres `deposit_percentage`, `requires_deposit`, `cancellation_policy.hours_before`, `cancellation_policy.penalty_type`, `cancellation_policy.penalty_amount`. El campo `cancellation_refund_percentage` mencionado en doc4 §7 NO existe en el JSONB de doc13. El campo `hours_before` del JSONB sí existe pero bajo otro path que el sugerido por doc4 (`cancellation_policy_hours` plano vs `cancellation_policy.hours_before` anidado).
- **Impacto**: El dev que lea doc4 §7 esperará `settings.cancellation_refund_percentage`; al consultar doc13 no lo encuentra. Tampoco tiene claro si el acceso es `settings->'cancellation_policy_hours'` o `settings->'cancellation_policy'->'hours_before'`. Inconsistencia de paths rompe cualquier query preparada.
- **Corrección sugerida**: 
  - Doc 13 §2.1 default del JSONB: agregar `"cancellation_refund_percentage": 100` dentro de `cancellation_policy`.
  - Doc 4 §7 y §10: usar exactamente los paths JSONB de doc13 (`settings.cancellation_policy.hours_before`, etc.) o documentar explícitamente que son campos anidados.

### [MEDIO] — Flujo de seña en doc4 §7 menciona "créditos MP + 5-7% que absorbe el complejo" pero doc13 no tiene campos de comisión
- **Docs involucrados**: Doc 4 §7 ("Comisión MP: la absorbe el complejo") vs Doc 13 §3.4 (`payments`).
- **Inconsistencia**: Doc 4 dice explícitamente "No se modela fee explícitamente en v1". Consistente. Pero el flujo de reembolso (cancelación 4A) dice "Crear refund en MercadoPago" y "crear Payment con type='refund', amount=deposit_amount". Si la comisión MP no es reembolsable por el procesador (política estándar de MP), el complejo termina perdiendo ~5-7% en cada cancelación gratuita, sin registro.
- **Impacto**: Bajo para runtime (el código no falla), pero alto para modelo de negocio. Decisión de producto que conviene hacer explícita.
- **Corrección sugerida**: Bajo. Agregar nota en doc4 §7 o en doc7 Flujo 4A: "La comisión MP retenida en reembolso es absorbida por el complejo y no se registra en `payments`. Se considera riesgo aceptado."

### [BAJO] — `processed_webhooks` usa `mp_event_id` en doc13 pero doc4 §7 habla de `mp_payment_id` para idempotencia
- **Docs involucrados**: Doc 4 §7 nota IMPORTANT ("tabla `processed_webhooks` con `mp_payment_id` como check") vs Doc 13 §2.6 (tabla con `mp_event_id`).
- **Inconsistencia**: Doc 4 dice que el check de idempotencia es por `mp_payment_id`. Doc 13 implementa la idempotencia por `mp_event_id` (ID del evento del webhook, que NO es lo mismo que el ID del pago — un mismo pago puede generar múltiples eventos `payment.approved` + `payment.updated`).
- **Impacto**: Ambigüedad en qué significa "procesar un webhook". Si el dev usa `mp_event_id` (como dice doc13) y MP envía dos eventos diferentes para el mismo pago, ambos se procesan → doble ejecución de la lógica de confirmación. Si usa `mp_payment_id` (como dice doc4), múltiples webhooks legítimos sobre el mismo payment (rejected → approved en un reintento) se rechazan.
- **Corrección sugerida**: Alinear. Lo más seguro es idempotencia por `mp_event_id` (que identifica el envío único del webhook). Actualizar doc4 §7 nota IMPORTANT: `mp_event_id` en vez de `mp_payment_id`.

### Eje 2 — Señas: confirmaciones positivas
- ✓ Campos OAuth del complejo (`mp_access_token`, `mp_refresh_token`, `mp_user_id`, `mp_public_key`, `mp_connected_at`) presentes en doc13 §2.1 (confirma la corrección C03 del walkthrough).
- ✓ Tabla `payments` existe con `mp_payment_id UNIQUE` para idempotencia transaccional.
- ✓ `booking_status` tiene `pending_payment`, `confirmed`, `expired` que cubren todas las transiciones de doc7 Flujo 2.
- ✓ `deposit_status` tiene `paid`, `refunded`, `captured`, `not_required`, `pending` — todos usados en doc7 Flujo 2 y 4.

---

## Eje 3: Aislamiento y RLS

### [BLOQUEANTE] — Doc 12 §2 dice 11 tablas aisladas y 6 globales; CLAUDE.md y doc13 §7 dicen 12 y 7
- **Docs involucrados**: Doc 12 §2 (tablas 11 + 6 = 17 totales) vs CLAUDE.md y Doc 13 §7 (12 + 7 = 19 totales).
- **Inconsistencia**: 
  - Doc 12 §2 tabla de aisladas lista 11 tablas: courts, bookings, abonados, payments, cash_flows, products, tenant_staff_members, notifications, audit_logs, tenant_subscriptions, tenant_player_bans. **Falta `daily_cash_closes`**.
  - Doc 12 §2 tabla de globales lista 6 tablas: tenants, players, staff_users, plans, price_versions, processed_webhooks. **Falta `player_tenant_relationships`**.
  - Doc 12 §3.1 repite el listado de 11 tablas en los `ALTER TABLE ... ADD COLUMN tenant_id` — no incluye `daily_cash_closes`.
  - Doc 12 §3.2 lista 11 índices — falta `idx_daily_cash_closes_tenant`.
  - Doc 12 §10.2 declara `const ISOLATED_TABLES = [...]` con 11 tablas para el test suite.
- **Impacto**: La corrección documentada en el walkthrough (tablas agregadas `player_tenant_relationships` y `daily_cash_closes`) SÍ se aplicó a doc13 pero NO se propagó a doc12. El dev que implemente el test suite de aislamiento según doc12 §10.2 NO va a testear `daily_cash_closes` — la tabla más sensible financieramente (cierre de caja inmutable). Si RLS falla ahí por un typo, no lo detectamos en CI. Es un data leak silencioso.
- **Corrección sugerida**: 
  - Doc 12 §2: agregar `daily_cash_closes` a la tabla de aisladas (total: 12) y `player_tenant_relationships` a la tabla de globales (total: 7). Nota: `player_tenant_relationships` es técnicamente "global con RLS dual" — no encaja en la dicotomía actual; conviene agregar una tercera categoría "global con acceso restringido por RLS" o moverla a aisladas y aceptar que "aisladas" no implica "no cross-tenant".
  - Doc 12 §3.1: agregar el `ALTER TABLE daily_cash_closes ADD COLUMN tenant_id`.
  - Doc 12 §3.2: agregar el índice `idx_daily_closes_tenant_date`.
  - Doc 12 §10.2: agregar `daily_cash_closes` y `player_tenant_relationships` al array `ISOLATED_TABLES`.

### [BLOQUEANTE] — Middleware de doc12 §4.1 NO setea `app.current_player_id`
- **Docs involucrados**: Doc 12 §4.1 (código del middleware) vs Doc 13 §3.2 policy `player_own_bookings_select` y §3.12 policy `player_own_relationships_select` vs CLAUDE.md ("middleware setea `app.current_player_id` para jugadores").
- **Inconsistencia**: El bloque de código del middleware en doc12 §4.1 tiene la rama `else if (user.type === 'player')` y solo hace `req.playerId = user.player_id; next();`. No ejecuta `SET LOCAL app.current_player_id = $1`. Pero las policies `player_own_bookings_select` (doc13 §3.2) y `player_own_relationships_select` (doc13 §3.12) DEPENDEN de esa variable. Sin ese SET LOCAL, el jugador matchea 0 filas → no ve ninguna de sus reservas.
- **Impacto**: La corrección B06 del walkthrough (RLS dual para jugadores) queda rota en runtime. El jugador autenticado va a "Mis reservas" y ve una lista vacía porque la policy no matchea. Regresión directa del bloqueante B06 que se supone estaba resuelto.
- **Corrección sugerida**: Doc 12 §4.1 — en la rama `user.type === 'player'`, agregar:
  ```typescript
  await db.query("SET LOCAL app.current_player_id = $1", [user.player_id]);
  req.playerId = user.player_id;
  next();
  ```
  Y agregar nota en §4.2 aclarando que ambas variables (`app.current_tenant_id` para staff, `app.current_player_id` para player) se setean con `SET LOCAL` en contextos mutuamente excluyentes.

### [ALTO] — Doc 12 §3.3 muestra la plantilla de RLS sin las 3 policies dual/realtime de `bookings`
- **Docs involucrados**: Doc 12 §3.3 (patrón de policies) vs Doc 13 §3.2 (implementación real de `bookings`).
- **Inconsistencia**: Doc 12 §3.3 muestra solo las 4 policies clásicas (select, insert, update, delete) con `current_setting('app.current_tenant_id')`. Pero doc13 §3.2 implementa bookings con 3 policies adicionales de SELECT (`tenant_isolation_select` + `player_own_bookings_select` + `realtime_tenant_select`) que se evalúan con OR. Doc 12 menciona esto recién en §7.3 como nota, no en la sección donde se describe el "patrón estándar".
- **Impacto**: El dev que lea doc12 §3.3 como la plantilla para aplicar RLS a cualquier tabla puede replicar solo la policy simple y olvidar las duales. Si la aplica ciegamente a `bookings`, sobrescribe la policy dual → jugadores no ven nada (mismo efecto que el hallazgo anterior).
- **Corrección sugerida**: Doc 12 §3.3: al final del bloque, agregar una subsección "Excepciones con RLS dual" con referencia a doc13 §3.2 y §3.12, mostrando el patrón de múltiples policies de SELECT evaluadas con OR. Clarificar que bookings y player_tenant_relationships son las dos tablas con RLS dual.

### [ALTO] — Doc 12 §4.3 omite el middleware "Player Context" en el stack para requests de jugador
- **Docs involucrados**: Doc 12 §4.3 (stack de middleware).
- **Inconsistencia**: El stack mostrado (Rate Limiter → Auth → Tenant Context → Subscription Guard → Feature Gate → Route Handler → Audit Logger) asume flujo staff. Para jugadores, el paso 3 "Tenant Context" no setea tenant (ver §4.1 — el jugador es cross-tenant), pero debería setear `app.current_player_id` (ver hallazgo anterior). El paso 4 "Subscription Guard" tampoco aplica al jugador. Nada en el stack describe el camino del jugador.
- **Impacto**: Onboarding de devs confuso. Invariantes descritas ("Ningún Route Handler se ejecuta sin que `app.current_tenant_id` esté seteado") son incorrectas — hay rutas de jugador donde intencionalmente no se setea.
- **Corrección sugerida**: Doc 12 §4.3: agregar el stack paralelo para requests de jugador y aclarar la invariante: "Para requests de staff: `app.current_tenant_id` seteado. Para requests de jugador: `app.current_player_id` seteado. Nunca ambos."

### [MEDIO] — JWT del staff de doc12 §5.1 tiene `tenant_id` en el root Y en `app_metadata`
- **Docs involucrados**: Doc 12 §5.1 vs Doc 13 §3.2 policy `realtime_tenant_select`.
- **Inconsistencia**: La policy de Realtime en doc13 lee `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`. Funciona mientras se setee en ambos lados. Duplicación no es un error per se, pero es una fuente potencial de desync (si el backend actualiza uno pero no el otro).
- **Impacto**: Bajo, más bien un code smell. Si alguien "limpia" el JWT quitando la duplicación, puede romper la policy de Realtime.
- **Corrección sugerida**: Doc 12 §5.1: agregar nota explicando por qué el campo está duplicado (compatibilidad con Supabase Realtime que lee SOLO de `app_metadata`) y marcar `app_metadata.tenant_id` como la fuente canónica para policies basadas en JWT.

### [MEDIO] — JWT del jugador (doc12 §5.2) no incluye un flag para distinguirlo en las policies basadas en JWT
- **Docs involucrados**: Doc 12 §5.2 vs Doc 13 §3.2.
- **Inconsistencia**: El JWT del jugador tiene `app_metadata.player_id` pero NO tiene `app_metadata.tenant_id`. La policy `realtime_tenant_select` en doc13 §3.2 hace `tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID`. Para jugadores, ese casting a UUID de un NULL va a fallar silenciosamente (la policy no matchea, OK) — PERO si el jugador se suscribe por Realtime a bookings, no va a recibir eventos porque ninguna de las 3 policies matchea con JWT de jugador (la de staff requiere `app.current_tenant_id` que no está seteado en Realtime, la de player también usa `current_setting` que no aplica en Realtime, y la de realtime requiere `tenant_id` en JWT).
- **Impacto**: Jugadores no reciben actualizaciones en tiempo real de sus reservas. "Mis reservas" muestra datos stale hasta refresh manual.
- **Corrección sugerida**: Doc 13 §3.2: agregar una cuarta policy de SELECT para Realtime del jugador: `realtime_player_select ON bookings FOR SELECT USING (player_id = (auth.jwt() -> 'app_metadata' ->> 'player_id')::UUID)`. Actualizar doc12 §7.3 para documentarla.

### Eje 3 — Confirmaciones positivas
- ✓ `bookings` tiene las 3 policies de SELECT (staff, player, realtime) implementadas correctamente en doc13 §3.2.
- ✓ `player_tenant_relationships` tiene RLS dual (staff + player) en doc13 §3.12.
- ✓ Todas las 12 tablas aisladas listadas en doc13 §7 tienen RLS habilitado con sus 4 policies estándar en doc13 §3.

---

## Eje 4: Ortografía de ENUMs

### [BLOQUEANTE] — (ya cubierto en Eje 2) Valores `cancelled_*` en doc7 y doc8
Recapitulación: 8 ocurrencias totales de `cancelled_refunded` / `cancelled_no_refund` en doc7 (4) + doc8 (4) que deben corregirse a `canceled_*`.

### [MEDIO] — Columnas `cancelled_*` de doc13 inconsistentes con la regla
Recapitulación: 3 columnas en `bookings` (`cancelled_reason`, `cancelled_by`, `cancelled_at`) deben renombrarse a `canceled_*` para ser consistentes con la regla declarada en CLAUDE.md. Ver Eje 2.

### Eje 4 — Confirmaciones positivas
- ✓ ENUM `tenant_status` en doc13 §1 usa `canceled` (una L) correctamente.
- ✓ ENUM `abonado_status` en doc13 §1 usa `canceled` correctamente.
- ✓ ENUM `payment_status` en doc13 §1 usa `canceled` correctamente.
- ✓ ENUM `booking_status` en doc13 §1 usa `canceled_refunded`, `canceled_no_refund` correctamente (problema es solo en doc7/doc8 que no usan estos literales).
- ✓ ENUM `subscription_status` en doc13 §1 tiene los 7 valores esperados incluyendo `blocked`.

---

## Eje 5: Entidades vs Schema

### [ALTO] — Header de doc13 dice "13 entidades de Doc 6" pero el schema implementa 19 tablas
- **Docs involucrados**: Doc 13 header (línea 4) vs Doc 13 §7 (19 tablas).
- **Inconsistencia**: El propósito declarado de doc13 es "Traducir las 13 entidades de Doc 6 en tablas SQL concretas". Pero la tabla de resumen §7 enumera 19 tablas. Discrepancia de 6 tablas entre lo declarado y lo implementado (nuevas: `processed_webhooks`, `price_versions`, `tenant_player_bans`, `tenant_staff_members`, `tenant_subscriptions`, `player_tenant_relationships`, `daily_cash_closes` — algunas son tablas de unión/sistema que pueden no estar en doc6 como entidades de primer nivel).
- **Impacto**: El dev asume que hay un mapeo 1:1 entidad↔tabla y busca 13 entidades en doc6 para entender el dominio. Al encontrar 19 tablas, no sabe cuáles son del dominio de negocio (doc6) y cuáles son "plomería" (idempotencia, precios históricos, unión N:M).
- **Corrección sugerida**: Doc 13 header: reformular a "Traducir el modelo de dominio (Doc 6) en tablas SQL concretas. El schema incluye tablas adicionales de soporte (idempotencia, unión N:M, versionado de precios) que no son entidades de dominio pero son necesarias para la implementación."

### [ALTO] — ERD de doc13 §6 muestra `player_tenant_relationships` bajo "TABLAS GLOBALES" pero tiene RLS aplicado
- **Docs involucrados**: Doc 13 §6 (ERD textual) vs Doc 13 §3.12 (tabla con RLS) vs Doc 13 §7 (clasificación "Global*" + "Dual†").
- **Inconsistencia**: El ERD de §6 pone `player_tenant_relationships` en el bloque "TABLAS GLOBALES" (sección "sin tenant_id, sin RLS"). Pero §3.12 declara que la tabla SÍ tiene `tenant_id UUID NOT NULL` y RLS habilitado con policies dual. §7 la marca como "Global*" con asterisco y nota al pie. Nomenclatura contradictoria dentro del mismo documento.
- **Impacto**: Confusión en auditoría. ¿Es global o aislada? Afecta decisiones de indexación, sharding futuro, tests de aislamiento.
- **Corrección sugerida**: Doc 13: adoptar una tercera categoría "tablas con RLS dual" o reclasificar como aislada. Personalmente reclasificaría como "aislada" (tiene `tenant_id NOT NULL`, tiene RLS) y documentar que la segunda policy de SELECT (para jugador) es la que la hace "cross-tenant accessible desde el lado del player".

### [CRÍTICO] — Feature flags de doc4 §8 no se reflejan en doc13 `plans.features`
- **Docs involucrados**: Doc 4 §8 (tabla de feature flags por plan) vs Doc 13 §5 (seed data de `plans`) y §2.4 (default del JSONB `features`).
- **Inconsistencia**: Doc 4 §8 lista 7 features por plan:
  - Cantidad máxima de canchas
  - Usuarios del sistema (staff)
  - Historial de reservas (6m/12m/∞)
  - Reportes avanzados (❌/✅/✅)
  - Exportación de datos (CSV básico/completo/CSV+Excel)
  - API access (❌/❌/✅)
  - Soporte (email/email/prioritario)
  
  Doc 13 §5 seed data implementa 5 keys: `history_months`, `advanced_reports`, `export_formats`, `api_access`, `support_channels`. **No hay key para "cantidad máxima de canchas"** dentro de features (está en la columna `max_courts`, OK). **No hay "Usuarios del sistema"** (tampoco crítico — está en `max_staff`, pero el default del Básico es 2 staff y doc4 §8 dice "Ilimitado" en los 3 planes, inconsistencia directa).
- **Impacto**: 
  - Doc 4 §8 promete "Staff ilimitado en todos los planes" y doc4 §1 diferenciadores lo repite. Pero doc13 §5 seed declara Básico con `max_staff=2` y Estándar con `max_staff=5`. El Feature Gate middleware va a rechazar al 3er staff en el plan Básico pese a la promesa. Regresión directa a una promesa comercial.
  - `auto_collect_abonados: true` aparece en el default del JSONB de doc13 §2.4 pero NO en el seed data §5 (keys distintas entre default y seed). Doc4 §8 no lo lista como feature por plan.
- **Corrección sugerida**: 
  - Doc 13 §5: cambiar `max_staff` a NULL (ilimitado) en los 3 planes.
  - Doc 13 §2.4 default de `plans.features`: quitar `auto_collect_abonados` (v1 es cobro manual según ADR y doc7 Flujo 5).
  - Alternativamente, si el producto quiere limitar staff: actualizar doc4 §8 con los valores reales.

### [MEDIO] — `daily_cash_closes` no tiene entidad correspondiente en doc6 (según referencias de doc7)
- **Docs involucrados**: Doc 13 §3.13 (tabla `daily_cash_closes`) vs Doc 6 (no verificado — según walkthrough sesión 2 se agregó como tabla nueva pero no se menciona si se actualizó doc6).
- **Impacto**: Doc 6 es la referencia de "entidades y state machines del sistema". Si `daily_cash_closes` no está modelada en doc6, el dev no sabe que es inmutable post-cierre. Pero doc13 sí lo documenta (`REVOKE UPDATE, DELETE`). Sin una entidad documentada, la invariante "INMUTABLE post-cierre" queda como detalle de implementación.
- **Corrección sugerida**: Verificar que doc6 incluya `DailyCashClose` como entidad con su state machine (cerrado = estado final absorbente). Si no, agregarla.

### [MEDIO] — `player_tenant_relationships.status` usa CHECK constraint, no ENUM
- **Docs involucrados**: Doc 13 §3.12 (`status TEXT ... CHECK IN ('active', 'blocked')`) vs resto de tablas que usan ENUM.
- **Inconsistencia**: Todas las demás tablas del schema usan ENUMs para estados (`tenant_status`, `booking_status`, `abonado_status`, etc.). Pero `player_tenant_relationships` usa `TEXT + CHECK`. Divergencia de convención.
- **Impacto**: Bajo. Funciona igual pero rompe la consistencia de "todos los estados son ENUMs tipados".
- **Corrección sugerida**: Doc 13 §1: agregar `CREATE TYPE player_relationship_status AS ENUM ('active', 'blocked')` y usarlo en §3.12.

### [BAJO] — Comentario del COMMENT de bookings en doc13 línea 570 describe "state machine" con estados `cancelled_*` doble L
Recapitulación del problema: es solo un comentario SQL, no afecta ejecución, pero confunde al dev que lee el schema.

### Eje 5 — Confirmaciones positivas
- ✓ Campos OAuth MP (`mp_access_token`, `mp_refresh_token`, `mp_user_id`, `mp_public_key`, `mp_connected_at`) presentes en doc13 §2.1.
- ✓ Campos +18 (`agreed_to_terms_at`, `terms_version`) presentes en doc13 §2.2 (players).
- ✓ Relación N:M staff↔tenant modelada correctamente con `tenant_staff_members` en doc13 §3.7.
- ✓ FK `bookings.abonado_id` presente (doc13 §3.2 línea 471) para turnos generados desde abonados.
- ✓ Tabla `price_versions` con `valid_from` implementa el requisito de ARS volátil de doc4 §5.

---

## Resumen ejecutivo

| Severidad | Hallazgos |
|---|---|
| **BLOQUEANTE** | 4 |
| **CRÍTICO** | 2 |
| **ALTO** | 4 |
| **MEDIO** | 7 |
| **BAJO** | 3 |

**Los 4 bloqueantes impiden compilar o correr el sistema tal como está documentado:**
1. `DEFAULT 'trial'` de la columna `tenants.status` no es un valor del ENUM `tenant_status` — la migración no corre. Afecta doc13, doc7, doc8, doc12.
2. Valores `cancelled_refunded` / `cancelled_no_refund` usados en doc7 y doc8 no existen en el ENUM `booking_status` — el flujo de cancelación rompe en runtime.
3. Doc 12 no incluye `daily_cash_closes` y `player_tenant_relationships` en las listas de tablas, ni en el test suite de aislamiento — data leak silencioso en la tabla financiera más sensible no se detecta en CI.
4. Middleware de doc12 §4.1 no ejecuta `SET LOCAL app.current_player_id` para jugadores — regresión directa del bloqueante B06 que el walkthrough declara como "resuelto"; la policy RLS del jugador no matchea nunca.

El walkthrough indica que estos bloqueantes fueron resueltos, pero las correcciones solo se propagaron a doc13; doc7, doc8 y doc12 quedaron con la documentación pre-fix.