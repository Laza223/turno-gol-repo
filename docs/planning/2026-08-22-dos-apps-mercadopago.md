# Dos aplicaciones de MercadoPago para TurnoGol

**Fecha:** 2026-08-22 · **Estado:** investigación cerrada, decisión pendiente · **Alcance:** investigación y plan, sin cambios de código

Este documento responde si conviene separar la integración de MercadoPago en dos aplicaciones —una para la suscripción SaaS, otra para el cobro de señas por OAuth— y con qué plan. **No se tocó código, ni variables de entorno, ni la cuenta de MercadoPago.**

Convención del documento: cada afirmación viene etiquetada como **[MEDIDO]** (evidencia propia contra producción o contra el repo), **[DOC]** (documentación oficial de MercadoPago), **[INFERIDO]** (razonamiento sobre el modelo, no verificado) o **[NO CONFIRMADO]** (no lo pude establecer, y digo cómo se verifica).

---

## 1. El problema

El reembolso automático de señas no funciona para ningún complejo. Cuando un jugador cancela dentro del plazo, TurnoGol marca la reserva como reembolsada y MercadoPago rechaza la devolución:

```
mp_status=403  mp_msg=At least one policy returned UNAUTHORIZED.
```

**[MEDIDO]** Probado dos veces en producción con plata real (21 y 22 de agosto de 2026), como reembolso parcial y como total. Control decisivo: la misma devolución sale sin problema desde el panel de MercadoPago del propio complejo. El pago es devolvible y la cuenta puede devolverlo.

**[MEDIDO]** Causa raíz. El intercambio OAuth devuelve el `scope` que MercadoPago efectivamente otorga. Se logueó (`src/app/api/mp/callback/route.ts:160-167`, commit `aff984d5` / PR #192, ya en `origin/main`) y dio, entre otros:

```
urn:mp:online:preference/read-write            ← por eso PUEDE cobrar
urn:mp:online:payments/read-only
urn:mp:online:payments:cancel/read-only
urn:mp:online:payments:refunds/read-only       ← por eso NO puede devolver
urn:mp:online:payments:chargebacks/read-write
urn:mp:online:subs-recurring:*/read-write
```

**[MEDIDO]** La aplicación de MercadoPago que emite esos tokens (nº 1654083475779552, cuenta 381048203) está dada de alta con producto **Suscripciones**. En su pantalla de permisos hay 25 casillas y ninguna de Pagos ni de Reembolsos: no está destildada, MercadoPago no la ofrece para ese producto.

**[MEDIDO]** MercadoPago guarda el consentimiento por par (usuario, aplicación), no por complejo. Desvincular desde TurnoGol y volver a vincular no vuelve a pedir autorización ni amplía permisos: reemite un token con el alcance del consentimiento original, en silencio. Está documentado en el código, `callback/route.ts:169-186`, tras el incidente del 2026-07-31.

---

## 2. Parte 1 — MercadoPago

### 2.1 ¿Una app de Checkout Pro otorga `payments:refunds/read-write`?

**[NO CONFIRMADO].** Los scopes con formato `urn:mp:online:*` no están publicados en ninguna parte de la documentación de MercadoPago. Lo único que expone la documentación son tres permisos gruesos —Lectura, Acceso offline, Escritura— que se ven en la pantalla de "Detalles de la aplicación" **[DOC]**; los URN finos los deriva MercadoPago del producto elegido, sin decir cómo. Busqué en la documentación oficial de AR/CL/CO/MX/BR, en la referencia de la API de reembolsos y en repositorios y foros públicos: nadie publica la tabla producto → scopes.

Lo que sostiene la hipótesis, sin probarla:

- El scope actual **sí** trae `preference/read-write` y las cinco de `subs-recurring`, o sea que el conjunto otorgado claramente **depende del producto**: la app de Suscripciones recibió todo lo de suscripciones en escritura y lo de pagos en lectura.
- El producto "Checkout Pro" es, por definición de MercadoPago, el que integra cobros online; sería raro que no incluyera la operación inversa del cobro.

**Cómo verificarlo barato, sin tocar producción ni gastar un peso:**

1. Crear la App B con producto Checkout Pro.
2. Registrar `http://localhost:3000/api/mp/callback` como redirect URI.
3. Correr `pnpm dev` con `MP_CLIENT_ID`/`MP_CLIENT_SECRET` de App B y hacer el OAuth **autorizando con la cuenta de MercadoPago del propio dueño** (nunca autorizó App B, así que MercadoPago va a mostrar la pantalla de permisos y va a emitir un token nuevo).
4. Leer el log `mp oauth: token emitido`, que ya escupe el scope.

Eso responde la pregunta con evidencia propia, en minutos, sin deploy y sin mover plata.

### 2.2 ¿Puede una sola aplicación cubrir suscripciones y pagos con reembolso?

**[DOC] Prácticamente no, y MercadoPago dice explícitamente lo contrario:** "deberás crear una aplicación por cada solución de Mercado Pago que integres" (documentación de creación de aplicación, AR). Dos aplicaciones para dos productos no es un rodeo nuestro: es el camino que la plataforma indica.

**[DOC]** Existe una variante que hay que mencionar para descartarla con fundamento: el producto de una aplicación **se puede editar** después de creada, vía "Editar datos" → "Solución de pago a integrar". O sea, técnicamente se podría cambiarle el producto a la App A en vez de crear una segunda.

**No lo recomiendo**, por tres razones:

1. **[INFERIDO]** Cambiar el producto no amplía los consentimientos ya otorgados. El consentimiento quedó grabado con el alcance del momento de la autorización **[MEDIDO]**, así que los complejos tendrían que revocar desde su propia cuenta de MercadoPago y volver a autorizar — que es justamente el trámite incómodo que la App B evita (§2.4b y Fase 3).
2. **[INFERIDO]** Pone en riesgo `MP_TURNOGOL_ACCESS_TOKEN`, que es la credencial con la que se cobra el plan mensual. Ese circuito recién empezó a funcionar bien; moverlo para arreglar otro no vale.
3. Deja una sola aplicación sirviendo dos productos, en contra de la guía explícita de MercadoPago.

### 2.3 ¿Puede una cuenta tener dos aplicaciones con productos distintos, en paralelo?

**[DOC] Sí.** Es el escenario que la documentación describe como normal. No encontré ningún límite de cantidad de aplicaciones por cuenta ni ningún proceso de aprobación previo para crear una: la creación pide verificación de identidad o reautenticación del titular, y un nombre de hasta 50 caracteres alfanuméricos **[DOC]**. Cada aplicación tiene sus propias credenciales de producción, sus propias URLs de redirect y su propia configuración de webhooks.

### 2.4 Migración: el caso delicado

**a) ¿Un token de App B puede reembolsar un pago cobrado con un token de App A?**

**[NO CONFIRMADO].** Es la pregunta más importante del expediente y no la pude cerrar con documentación. La referencia de la API de reembolsos solo dice "Access Token obtenido a través del panel de desarrolladores" y no menciona scopes, aplicaciones ni restricciones **[DOC]**.

**[INFERIDO]** El modelo de MercadoPago sugiere que **sí** funciona: el pago pertenece a la **cuenta** del vendedor (es su `collector_id`), no a la aplicación; un token OAuth es una autorización *del vendedor* a *una aplicación* para operar en nombre de esa cuenta. Nada en el modelo ata una devolución a la aplicación que originó el cobro. Pero es razonamiento, no medición, y hay que tratarlo como tal.

**Cómo se responde sin construir nada:** la deuda que ya existe es el experimento. **[MEDIDO contra la base de producción, 2026-08-22 17:00 UTC]** hay **exactamente UNA** fila de reembolso en `pending`: `4a8a7ca8-4b5d-4520-8e7c-186fd8df202c`, de `complejo titi`, $100, creada el 22-08 15:07 UTC, contra el pago de MercadoPago `174177392859` que sigue en `approved` — o sea, la plata **no** volvió. (Los otros dos reembolsos del 21-08 figuran `approved`; no confundir "el 403 pasó dos veces" con "quedaron dos filas colgadas".)

El cron `retry-refunds` (horario, `src/shared/jobs/workers/retry-refunds.worker.ts`) sólo toma refunds con más de 1 h de antigüedad, así que esa fila entró recién en la corrida de las 17:00 UTC. Apenas el complejo reconecte con App B, ese cron va a disparar un reembolso con token de App B contra un pago cobrado con App A:

- Si sale aprobada → pregunta respondida **y** la plata devuelta, sin escribir una línea.
- Si vuelve 403 → pregunta respondida igual, y el complejo devuelve desde su panel como viene haciendo.

No hay nada que perder: hoy esa devolución ya falla.

**b) ¿Qué pasa con los tokens viejos y sus refresh? ¿Conviven?**

**[INFERIDO, alta confianza]** Un `refresh_token` está atado al par (aplicación, vendedor). Apenas `MP_CLIENT_ID`/`MP_CLIENT_SECRET` apunten a App B, el cron `refresh-mp-tokens` (cada 4 h) va a intentar refrescar tokens emitidos por App A usando credenciales de App B, y MercadoPago lo va a rechazar. El código no se rompe: `refreshMpAccessToken` tira, y el worker lo loguea y sigue con el siguiente complejo (`refresh-mp-tokens.worker.ts:75-81`). Pero el complejo queda con **un token que ya no se puede renovar**.

Conclusión operativa: **la reconexión de cada complejo ya conectado es obligatoria, no opcional.** Conviven en el sentido de que el access token viejo sigue cobrando hasta que expire, pero no en el sentido de que el sistema pueda mantenerlo vivo.

**Cuánto dura un access token: RESUELTO. [MEDIDO]** El log `mp oauth: token emitido` de producción del 2026-08-22 15:46 UTC trae **`expiresInDays: 180`**. O sea: la documentación de MercadoPago tenía razón y **el comentario "~6h" de `refresh-mp-tokens.worker.ts:16` está mal** (se corrige en la Fase 4). Consecuencia para el plan: los complejos siguen cobrando con su token viejo durante meses, así que **la reconexión no es urgente por vencimiento** — el apuro es sólo destrabar el reembolso.

**Hallazgo lateral del mismo barrido [MEDIDO]:** `complejo titi` está hoy en `status='canceled'`, y `runRefreshMpTokens` filtra `status IN ('active','trialing','past_due','suspended')` — o sea que a ese complejo **ya no se le renueva el token**, con App A o con App B. Con 180 días de vigencia no es un incendio, pero es una bomba de tiempo silenciosa para cualquier complejo que vuelva de `canceled` a operar. Fuera del alcance de esta migración; queda anotado.

**c) ¿El webhook de un pago viejo sigue llegando, y con qué firma?**

Sigue llegando: la `notification_url` viaja grabada en la preferencia (`payment.service.ts:157`), con el `?tenant=` incluido, así que el ruteo por complejo no cambia.

Con qué clave lo firma MercadoPago —la de la aplicación que creó la preferencia, o la de la aplicación configurada— **[NO CONFIRMADO]**. Lo que sí está documentado es que **cada aplicación genera su propia clave secreta de webhook** **[DOC]**: "Webhooks notifications can be configured for each application... this will generate a unique secret signature for your application".

**No hace falta resolver la ambigüedad.** Si el verificador acepta las dos claves, el diseño es correcto bajo cualquiera de las dos respuestas. Por eso ese es el primer cambio de código del plan, y va antes de tocar cualquier variable.

### 2.5 `MP_TURNOGOL_ACCESS_TOKEN`: ¿de la aplicación o de la cuenta?

**[DOC + INFERIDO]** De las dos cosas, en el sentido que importa: es una **credencial de producción de una aplicación** (cada aplicación tiene su pestaña de credenciales, con access token y public key propios), que **autentica contra la cuenta** del titular. Por eso puede crear preapprovals que cobran a la cuenta maestra.

Consecuencia práctica: **crear App B no la afecta.** Las aplicaciones son objetos independientes; la App A queda intacta, con su producto, sus credenciales y su clave de webhook. La facturación del SaaS no se toca.

Consecuencia inversa, y es el argumento de peso de §2.2: **cambiarle el producto a la App A sí es un riesgo sobre esa credencial.** No hay razón para correrlo.

### 2.6 ¿Qué bloquean hoy los scopes de solo lectura?

| Scope actual | Qué bloquea | ¿Duele hoy? |
|---|---|---|
| `payments:refunds/read-only` | Devolver una seña por API | **Sí. Es el bug activo.** |
| `payments:cancel/read-only` | Anular o cancelar un pago por API | No: los `pending` se dejan expirar (`expire-pending-booking`). Cierra esa puerta si algún día se quisiera cancelar activamente. |
| `payments/read-only` | **Crear** pagos por la API de Payments | No hoy. Cierra Checkout API y Bricks: un futuro "pagá con tarjeta sin salir de TurnoGol" no sería posible con esta aplicación. |
| `preference/read-write` (otorgado) | — | Es lo único que sostiene el cobro actual, y es justamente lo que Checkout Pro necesita. |
| `chargebacks/read-write` (otorgado) | — | Gestión de contracargos disponible; no se usa. |
| `payout/read-write` (otorgado) | — | Retiros; no se usa ni conviene usarlo. |

---

## 3. Parte 2 — El código

Verificado archivo por archivo en el repo, no asumido.

### 3.1 Los dos circuitos ya están separados

**Señas (OAuth por complejo).** Solo tres archivos leen las credenciales de la aplicación:

- `src/app/api/mp/oauth-start/route.ts:28,34` — `MP_CLIENT_ID` para armar la URL de autorización, `MP_CLIENT_SECRET` para firmar el `state` (HMAC + TTL de 10 min).
- `src/app/api/mp/callback/route.ts:82,136` — verifica el `state`, revalida que quien completa sea admin autenticado de ese mismo complejo, intercambia el `code` por tokens, loguea el scope, chequea que la cuenta de MP no esté ya usada por otro complejo (migr. 069) y guarda todo cifrado vía `connectMercadoPago`.
- `src/modules/payments/mp-oauth.ts:37-38` — `refreshMpAccessToken` (grant `refresh_token`), `refreshTenantMpToken` (persiste) y `resolveTenantGateway` (arma el gateway con el hook de refresh-on-401 y el circuit breaker).

**Suscripción SaaS.** Un solo archivo: `src/modules/billing/billing.gateway.ts:20` lee `MP_TURNOGOL_ACCESS_TOKEN` y construye el gateway con `plaintextToken: true` (el token del env viene en claro, no cifrado como los de complejo — ENS-22).

**Las llamadas al SDK** viven todas en `src/modules/payments/mp-gateway.implementation.ts` y **no distinguen aplicación**: reciben un token y operan. `createPreference` y `createRefund` corren con el token del complejo; `createPreapproval`, `cancelPreapproval`, `updatePreapprovalAmount`, `getSubscriptionState`, `resolveSubscriptionTenant` y `createSaasUpgradePreference` corren con el master. Ninguna necesita cambiar.

**Los workers** (`refresh-mp-tokens.worker.ts`, `retry-refunds.worker.ts`) no leen las variables directamente: las consumen a través de `mp-oauth.ts`. Ninguna línea cambia, pero **el proceso de Railway necesita las credenciales nuevas** o el refresh y el retry de reembolsos quedan sin poder autenticar.

### 3.2 El único cruce: la firma del webhook

`src/modules/payments/webhook-auth.ts:30` valida contra **un solo** `MP_WEBHOOK_SECRET`, y las dos aplicaciones entran por el mismo buzón `POST /api/webhooks/mercadopago` (`src/app/api/webhooks/mercadopago/route.ts:85`). Con dos aplicaciones, cada una firma con su propia clave **[DOC]** y los avisos de una de las dos se rechazarían con 401. El rechazo deja rastro (`rechazar('invalid signature', …)`, agregado tras #176/#177), pero el efecto es el peor conocido de este sistema: **el pago se hace en MercadoPago y la reserva queda colgada**.

Es el único trabajo de código real de todo el cambio, y tiene que ir primero.

### 3.3 Validación de entorno y chequeos de arranque

- `src/shared/env.ts:30-34` — `MP_CLIENT_ID` y `MP_CLIENT_SECRET` requeridas siempre; `MP_WEBHOOK_SECRET` requerida (≥16) solo en producción. Se valida en `instrumentation.ts`, o sea en el runtime web (Vercel); **el worker de Railway no corre esta validación**.
- `scripts/launch-check.helpers.ts:50-89` — `REQUIRED_ENV` incluye `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET` y `MP_TURNOGOL_ACCESS_TOKEN` (esta última justamente porque el boot no la valida y falla en silencio).
- `scripts/launch-check.ts:282-309` y `scripts/staging-check.ts:170-199` — la misma sonda: un `grant_type=refresh_token` con un refresh inválido a propósito. Un 400 significa que el `client_id`/`client_secret` autenticaron bien; 401/403 significa credenciales rechazadas. **Sirve tal cual para verificar App B después del cambio, sin modificarla.**
- `src/app/api/status/route.ts:134` — el check `mercadopago` solo mira presencia de `MP_CLIENT_ID`/`MP_CLIENT_SECRET`. Correcto como está.

---

## 4. Parte 3 — El plan

### Fase 0 — Verificar antes de tocar producción (gratis, sin riesgo)

1. ~~Leer `expiresInDays` en los logs de Vercel.~~ **HECHO: 180 días** (§2.4b). La reconexión no es urgente por vencimiento.
2. **Crear la App B** en la misma cuenta (381048203), producto **Checkout Pro**. Registrar dos redirect URIs: la de producción y `http://localhost:3000/api/mp/callback`.
3. **Correr el OAuth en local** con las credenciales de App B, autorizando con la cuenta de MercadoPago del dueño (que nunca autorizó App B). Leer el `scope` del log.
   - Trae `urn:mp:online:payments:refunds/read-write` → seguir.
   - No lo trae → **parar acá**. El plan entero no sirve; ver §6.

### Fase 1 — El buzón acepta dos claves (código, antes que todo lo demás)

- `src/modules/payments/webhook-auth.ts` — juntar `MP_WEBHOOK_SECRET` y un nuevo `MP_WEBHOOK_SECRET_CHECKOUT` en una lista y probar cada una con el `matchesHmac` que ya existe. Mantener idénticas las dos semánticas actuales: sin ninguna clave configurada → devuelve `NODE_ENV !== 'production'`; el fallback de `MP_WEBHOOK_TEST_BYPASS_SECRET` sigue igual y sigue duro-gateado a no-producción.
- `src/shared/env.ts` — agregar `MP_WEBHOOK_SECRET_CHECKOUT` con la misma forma que `MP_WEBHOOK_SECRET` (requerida en prod, opcional fuera, mínimo 16).
- `scripts/launch-check.helpers.ts` — sumarla a `REQUIRED_ENV`. Es la red contra la clase de fallo que ya mordió dos veces (`ENCRYPTION_KEY`, `WORKER_DATABASE_URL`): una variable del camino de la plata que falta en el deploy y falla callada.
- Tests nuevos en `tests/unit/webhook-auth.test.ts` (firma válida con la clave A, válida con la clave B, inválida con las dos) y en `tests/unit/env-validation.test.ts`. Ningún test existente cambia de forma.

**Decisión de diseño deliberada:** `verifyWebhookSignature` sigue devolviendo `boolean`. Evalué devolver cuál aplicación firmó —útil para observabilidad durante la migración— y lo descarto: obliga a reescribir los asserts de todos los tests existentes, y el 401 ya deja rastro suficiente en `rechazar('invalid signature', …)`.

### Fase 2 — Lo que hace el dueño a mano, en este orden

1. **MercadoPago**: en App B, configurar Webhooks, copiar la clave secreta, tildar los eventos de pagos y registrar la redirect URI de producción.
2. **Vercel** (production y preview): agregar `MP_WEBHOOK_SECRET_CHECKOUT`. **Todavía no tocar `MP_CLIENT_ID`/`MP_CLIENT_SECRET`.**
3. **Deploy de la Fase 1.** Confirmar que la suscripción SaaS sigue notificando sin 401 (la clave de App A sigue configurada y sigue siendo aceptada).
4. **Vercel + Railway**: recién ahora repuntar `MP_CLIENT_ID`/`MP_CLIENT_SECRET` a App B. **Railway también** — el worker las necesita para refrescar tokens y para el retry de reembolsos, y ahí no corre la validación de entorno que atajaría el olvido.
5. `pnpm launch:check --probe-only` para confirmar que las credenciales nuevas autentican contra MercadoPago.

### Fase 3 — Migrar los complejos conectados

1. El dueño de cada complejo entra a Configuración → Facturación y aprieta "Conectar MercadoPago". **[INFERIDO]** Como App B es una aplicación nueva, MercadoPago **sí** va a mostrar la pantalla de autorización: el consentimiento es por (usuario, aplicación) **[MEDIDO]** y nadie autorizó App B todavía. O sea que el trámite incómodo de "revocar la aplicación desde tu propia cuenta de MercadoPago" **no aplica**. Es una vinculación limpia de dos minutos.
2. Reconectar la misma cuenta al mismo complejo no choca con el índice único de migr. 069: `findTenantUsingMpAccount` excluye al propio complejo.
3. **La prueba del reembolso cruzado se hace sola**, vía la seña pendiente de `complejo titi` y el cron horario (§2.4a).

### Fase 4 — Documentar

- ADR nuevo en `docs/decisions/` cuando la decisión esté tomada: dos aplicaciones, una por circuito.
- Actualizar la mención de ADR-004 en `docs/spec/doc11_adrs.md`, la tabla de variables de `docs/planning/deploy-playbook.md` y la del `README.md`.

---

## 5. Lo que NO hay que tocar

Esta lista es la mitad del valor del plan. Nada de esto cambia:

- `src/modules/payments/mp-oauth.ts`, `oauth-start/route.ts`, `callback/route.ts` — leen los mismos nombres de variable. Cero líneas.
- `src/modules/payments/mp-gateway.implementation.ts` — ninguna llamada al SDK cambia.
- `src/modules/billing/` completo, incluido `billing.gateway.ts` — el circuito SaaS queda intacto.
- `src/shared/jobs/workers/refresh-mp-tokens.worker.ts` y `retry-refunds.worker.ts` — ninguna línea; solo necesitan las variables nuevas en Railway.
- `src/lib/mercadopago.ts`, `src/modules/payments/payment.service.ts`, el schema de `tenants`. **No hace falta guardar en la base qué aplicación emitió cada token**: el `scope` ya se loguea al conectar, y el estado que de verdad importa —¿puede devolver?— se prueba intentando devolver.
- `src/app/api/status/route.ts` y las sondas de `launch-check` / `staging-check` — sirven tal cual para App B.

---

## 6. Vuelta atrás

Barata en las dos direcciones, porque todo el estado vive en variables de entorno y en filas de `tenants`.

- **Si App B no otorga los permisos (falla la Fase 0):** no se llegó a tocar nada. Se borra App B. El reembolso sigue siendo manual desde el panel del complejo, y queda la decisión de si sacar el automatismo para no prometer lo que no hace (REQUIERE INPUT #4).
- **Si algo sale mal después del cambio de variables:** volver `MP_CLIENT_ID`/`MP_CLIENT_SECRET` a App A en Vercel y Railway; los tokens de App A que sigan en `tenants` vuelven a ser refrescables en cuanto las credenciales vuelvan a ser las suyas, y los complejos que ya hubieran reconectado tienen que reconectar de nuevo. El cambio de la Fase 1 (dos claves de webhook) **se queda**: es correcto con una aplicación o con dos.

---

## 7. REQUIERE INPUT

1. **Si el reembolso cruzado no funciona** (un token de App B no puede devolver un pago cobrado con App A): ¿qué hacemos con las señas ya cobradas bajo App A? **(a)** el complejo devuelve a mano desde su panel y bancamos que la fila quede `pending` con la alerta de `retry-refunds` repitiéndose; **(b)** agregamos una acción "marcar reembolso hecho por fuera" —hoy **no existe** ningún camino para cerrar esa fila a mano—; **(c)** las dejamos así y listo.
2. ~~**Ventana de convivencia.**~~ **RESUELTO por medición**: con 180 días de vigencia, la ventana no tiene costo real más allá del ruido en los logs. Se hace cuando se pueda coordinar con cada complejo.
3. **¿App B en la misma cuenta de MercadoPago (381048203)?** Mi recomendación es sí. Lo pregunto solo por si hay una razón contable o fiscal para separarlas.
4. **Si App B tampoco otorga `refunds/read-write`:** ¿abrimos ticket con soporte de MercadoPago, o aceptamos que el reembolso sea manual desde el panel del complejo y ajustamos el producto para no prometerlo?

---

## 8. Recomendación

Ir por las dos aplicaciones, con una condición: **la Fase 0 primero**. Es la que puede invalidar todo, cuesta minutos, no toca producción y no mueve un peso. El resto del trabajo de código es un solo archivo de verdad (`webhook-auth.ts`) más dos declaraciones de variable, porque los dos circuitos de plata ya estaban separados por diseño desde ADR-004.

Lo que queda sin resolver y hay que asumir como riesgo consciente es el reembolso cruzado (§2.4a): si no funciona, las señas ya cobradas bajo App A no se van a poder devolver automáticamente nunca, y hay que decidir el punto 1 de §7. Todo lo demás tiene vuelta atrás.

---

## 9. Contraste con una segunda opinión (respuesta de otra IA, 2026-08-22)

Se contrastó este informe con una respuesta de Gemini aportada por el dueño. Veredicto: **coincide en la conclusión (las dos aplicaciones conviven) pero dos de sus afirmaciones centrales están refutadas por nuestra evidencia de producción**, así que ninguna pregunta pendiente se da por confirmada en base a ella.

**Refutado por lo medido:**

1. *"Mercado Pago no utiliza la nomenclatura granular `payments:refunds/read-write`; usa scopes globales (read, write, offline_access)".* **Falso [MEDIDO]:** el intercambio OAuth de producción devolvió las DOS cosas — el scope grueso `offline_access payments read write` **y** la lista completa de URN granulares (`aff984d5`). Los URN existen y son los que están mandando.
2. *"Para reembolsar alcanza con que la URL de autorización incluya el scope `write`".* **Falso en los hechos [MEDIDO]:** el token del complejo YA tiene `write` en el scope grueso (nuestra URL de autorización ni siquiera manda parámetro `scope`, y el token igual vino con `write`) y el reembolso devolvió 403 dos veces. El scope grueso no gobierna el reembolso; gobiernan los URN derivados del producto de la aplicación. **Consecuencia: el atajo "agregale `scope=write` a la URL y no hace falta App B" no existe.**
3. Su "Sí" al reembolso cruzado (§2.4a) se apoya en "si `user_id` del token == `collector_id` del pago, la API lo procesa". **Ese argumento ya está refutado como suficiente [MEDIDO]:** nuestro 403 ocurrió justamente con un token cuyo `user_id` ES el `collector_id` (el token del propio complejo). La coincidencia de identidad es necesaria, no suficiente. Su respuesta queda como hipótesis alineada con la nuestra [INFERIDO], no como confirmación — el experimento gratis de la Fase 3 sigue siendo la única prueba.

**Coincide y suma (sin cambiar el plan):**

- Access token OAuth ≈ 180 días, refresh rotativo de un solo uso. Refuerza que el comentario "~6h" de `refresh-mp-tokens.worker.ts:16` probablemente esté mal, y que leer `expiresInDays` (Fase 0.1) va a dar margen holgado para la reconexión. La race condition del refresh de un solo uso que advierte ya está cubierta en el repo: advisory lock por tenant (B11/T2, `refresh-mp-tokens.worker.ts:44-49`) [MEDIDO en repo].
- El webhook de un pago viejo se firma **en tiempo real con la clave vigente de la aplicación de ORIGEN**, y llega a la `notification_url` grabada en la preferencia (nuestro `?tenant=`). Si es cierto, la Fase 1 (dos claves) es exactamente lo necesario; y como el verificador se diseñó correcto bajo cualquiera de las dos hipótesis de firma, ni siquiera hace falta que sea cierto.
- `MP_TURNOGOL_ACCESS_TOKEN` es credencial de aplicación, solo muere si se regenera a mano en el panel. Crear App B no la toca. Coincide con §2.5.

**Conclusión del contraste:** la arquitectura de dos aplicaciones queda igual de recomendada; la secuencia del plan no cambia en nada; y el episodio ilustra por qué este informe separa [MEDIDO] de [INFERIDO] — una respuesta fluida y segura de sí misma contenía dos afirmaciones desmentibles con nuestros propios logs.

---

## Fuentes

- [Crear aplicación — Checkout Pro (MercadoPago AR)](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/create-application)
- [Detalles de la aplicación (MercadoPago AR)](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/application-details)
- [Crear reembolso — API Reference (MercadoPago AR)](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-api-payments/create-refund/post)
- [Webhooks Notifications Simulator and Secret Signature (MercadoPago)](https://www.mercadopago.com.br/developers/en/news/2024/01/11/Webhooks-Notifications-Simulator-and-Secret-Signature)
- [Crear y refrescar token — OAuth (MercadoPago)](https://www.mercadopago.com.ar/developers/es/reference/oauth/_oauth_token/post)
- [OAuth — Seguridad, Checkout Pro (MercadoPago AR)](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/security/oauth/introduction)
