# Sesión: fragmentos de cookie huérfanos y renovación perdida

**Fecha:** 2026-09-04
**Estado:** implementado
**Disparador:** un complejo no pudo entrar a producción desde su Chrome habitual.

## El síntoma

El login autenticaba y el navegador volvía a un `/login` en blanco, sin ningún mensaje. En incógnito entraba. Evidencia:

- `auth.users.last_sign_in_at` grabó el login **exitoso** en el mismo segundo del intento.
- Los logs de Vercel muestran `POST /login 200` seguido de `GET /login 200`.
- DevTools mostró **4 cookies** con el prefijo `sb-<ref>-`, **dos** de ellas empezando con `access_token` (3156 y 3215 bytes): dos sesiones fragmentadas conviviendo.
- Sentry no registró nada, y es coherente: un rebote no lanza excepción.

En paralelo, el dueño reportaba tener que loguearse casi todos los días.

## Causa 1 — fragmentos huérfanos

La credencial no entra en una sola cookie: `@supabase/ssr` la parte en `sb-<ref>-auth-token.0`, `.1`, …

`src/lib/supabase/server.ts` usaba la interfaz `get`/`set`/`remove` de la versión **0.3.0**, donde la librería nunca ve el estado completo de las cookies. Consecuencias medidas en el código de esa versión:

- `setItem` escribe cada fragmento por separado, sin todo-o-nada.
- `deleteChunks` corta en el primer fragmento ausente: si la sesión nueva ocupa **menos** fragmentos que la anterior, queda un `.N` huérfano.
- `combineChunks` concatena hasta que falta uno, así que ese huérfano se pega al final y produce JSON corrupto.
- `removeItem` llama a `deleteChunks` **sin esperar** el resultado (el cliente del navegador, en la misma versión, sí lo espera): el cierre de sesión podía resolver con la cookie todavía en vuelo.

`package.json` declaraba `"@supabase/ssr": "^0.3"`. En semver 0.x el caret **congela la minor**, así que el paquete quedó nueve minors atrás sin que nadie lo notara, mientras `supabase-js` flotaba libre.

## Causa 2 — la renovación del token se descartaba en silencio

`supabase/config.toml`: `jwt_expiry = 3600` y `enable_refresh_token_rotation = true`.

El `set` del adaptador estaba envuelto en un `try/catch` **vacío**, porque los Server Components de Next no pueden escribir cookies. Y `extractRealAuthUser` (`src/modules/auth/auth.middleware.ts`) es la puerta única de todos los layouts.

Entonces: pasada la hora, la primera lectura de sesión disparaba la rotación, GoTrue invalidaba el token viejo en ese mismo acto, y la cookie nueva se perdía en el catch. El navegador se quedaba con una credencial ya muerta. Con la rotación activada, **una sola renovación perdida mata la sesión para siempre**.

El middleware raíz no tocaba auth y su matcher no cubría ninguna ruta de interfaz, así que no había ninguna red de contención.

## Decisiones

### Actualizar a `@supabase/ssr` 0.12.6, con pin exacto

| Versión | Peer `supabase-js` | Poda huérfanos | Tolera corruptos |
|---|---|---|---|
| 0.3.0 | `^2.43.4` | no | no |
| 0.7.0 | `^2.43.4` | sí | no |
| 0.10.0 | `^2.100.1` | sí | no |
| **0.12.6** | `^2.114.0` | sí | **sí** |

Se eligió 0.12.6 porque es la única que además trata los fragmentos incombinables como **ausentes** en vez de romper, con un aviso explícito. Esa es la propiedad que hace que los usuarios ya rotos se recuperen solos en el siguiente intento, sin pedirles que borren cookies.

Costo asumido: obliga a subir `supabase-js` a `^2.115`, lo que arrastra `realtime-js` y toca la grilla en vivo, que no tiene cobertura automatizada. Se compensa con verificación manual antes de mergear.

**Salida de menor riesgo si la grilla en vivo falla**: bajar a 0.10.0, que poda huérfanos y no mueve `supabase-js`. Se pierde solo la tolerancia a corrupción.

**Pin exacto y no `^0.12.6`**: el caret en 0.x es exactamente la trampa que originó el bug. Un pin convierte el congelamiento en una decisión visible: para subir hay que editar la línea a mano.

### El `try` envuelve el lote entero

En `cookieAdapter` (`src/lib/supabase/server.ts`) el `try` rodea el bucle completo, no cada cookie. Si la primera escritura falla, no se escribe ninguna y la sesión anterior queda intacta. La interfaz vieja, con un `try` por cookie, permitía persistir el `.0` de la credencial nueva y perder el `.1`: media credencial, que parsea como cookie válida pero no como token.

### El refresco vive en el middleware

`src/lib/supabase/middleware.ts` es el único contexto que puede escribir cookies para una ruta de interfaz. Tres reglas de diseño que acotan el riesgo:

1. **Refresca cookies y nada más.** No lee roles, no autoriza, no redirige. Los layouts siguen siendo la única puerta. El peor caso de un bug ahí es volver al comportamiento anterior, no dejar a nadie afuera.
2. **Fail-open duro.** GoTrue caído no puede tirar abajo el panel. El fallo se reporta a Sentry con enfriamiento, mismo patrón que el alerting del limitador de tasa: un refresco que falla siempre y en silencio es el bug que vinimos a cerrar.
3. **Muta el request, no solo la respuesta.** Sin eso, el componente de servidor de abajo lee la cookie vieja y la identidad sale nula pese al refresco exitoso. Los valores vacíos se **borran** del request: un fragmento vacío se concatena igual y reproduce el bug movido de lugar.

### Lista explícita de rutas, no una expresión de exclusión

La documentación de Supabase propone un lookahead negativo sobre todo el sitio. Acá no sirve: las fichas públicas de complejo son `/[slug]` con slug **arbitrario** y revalidación, así que ninguna exclusión las deja afuera, y meterlas agregaría un viaje a GoTrue en la página más importante para posicionamiento.

Se usa una lista explícita en el `matcher`, más un predicado `needsSessionRefresh` como segunda barrera. Ese predicado está testeado y es el candado que impide que alguien meta la portada al refresco sin darse cuenta.

Regla de mantenimiento: **toda ruta de interfaz que llame a `extractAuthUser` va en esa lista.**

Los dos formularios de acceso (`/login`, `/ingresar`) entran a propósito, para que una sesión vencida se renueve ahí en vez de morir.

**Ojo con una expectativa que NO se cumple**: visitar esas páginas no poda por sí solo los fragmentos huérfanos. Medido en la app corriendo el 2026-09-04: con un `.4` inyectado a mano, un `GET /login` lo deja intacto. La poda ocurre cuando se **escribe** la sesión — login exitoso, renovación o cierre — porque recién ahí la librería emite el lote con los sobrantes en `maxAge: 0`. Verificado también en la app real: después de un login exitoso, el `.4` inyectado desaparece.

Eso alcanza para el caso que importa: el usuario roto vuelve a loguearse igual, y ese login lo deja limpio.

### `httpOnly: false` es intencional

Es el default de `@supabase/ssr` y tiene que serlo: el cliente del navegador lee esa cookie de `document.cookie` para autorizar el canal en vivo de la grilla (`src/hooks/use-booking-realtime.ts`). Por eso `tests/integration/cookie-flags.test.ts` exime a este archivo de su verificación de flags, y el contrato real se cubre en `tests/unit/supabase-cookie-adapter.test.ts`.

## La misma clase de bug en el circuito de plata

El barrido pedido por el dueño encontró el mismo patrón en `refreshTenantMpToken` (`src/modules/payments/mp-oauth.ts`): el refresh token de MercadoPago es de un solo uso y rota, así que en cuanto la llamada devuelve OK el token viejo ya está muerto. El guardado venía después, sin protección contra concurrencia y sin verificar que la fila se hubiera actualizado.

Ese camino corre **dentro del webhook de pagos**, donde dos respuestas 401 simultáneas disparaban dos renovaciones con el mismo token: las dos escribían, y la última dejaba persistido un par que MercadoPago ya había invalidado. El complejo quedaba desconectado en silencio, sin poder cobrar señas.

**Solución: compare-and-set.** El UPDATE solo pisa la fila si el refresh token sigue siendo el que se usó para pedir el par nuevo. Resuelve la concurrencia sin candado y **sin meter la llamada externa adentro de una transacción**, que es lo que prohíbe la convención del repo. Cero filas afectadas ahora falla explícito, con registro y evento en Sentry, en vez de pasar por éxito.

El trabajo periódico (`refresh-mp-tokens.worker.ts`) usa transacción con candado y sí hace la llamada adentro. Queda como está por ahora, pero es una contradicción con la convención que conviene revisar aparte.

## Acceso "Ir a mi panel"

Un complejo con la sesión abierta que llegaba a la portada o a las páginas comerciales veía "Ingresar", entraba, y el login lo devolvía al mismo lugar.

Se agrega `staffPanelPath` al payload de `/api/player/session`, que la portada ya consulta en cada carga. Es **solo una ruta**: no viaja correo, ni nombre, ni identificador de complejo, ni cuántos tiene. No hay superficie para filtrar datos personales ni cruzados entre complejos porque no hay datos.

Se resuelve sin una consulta nueva, solo con lo que el JWT ya trae, porque `/select-tenant` ya es el router: corta a `/login` si no es staff y manda a `/onboarding` con cero complejos.

**Botón y no redirección automática** (decisión del dueño): una redirección impediría que un dueño logueado vea `/precios` o `/para-complejos`, que es justo lo que hace cuando quiere subir de plan o pasarle el link a un colega.

## Cómo reconocer este bug si vuelve

`POST /login 200` seguido de `GET /login 200` en los logs de Vercel, con `auth.users.last_sign_in_at` actualizado, es la firma exacta: autenticó y rebotó. El diagnóstico rápido es pedir la captura de DevTools y contar cuántas cookies `sb-` hay y si aparece más de un `access_token`.
