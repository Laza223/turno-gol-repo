# Pantalla de éxito post magic-link

**Fecha:** 2026-06-24
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Autor:** Sesión de pairing (debugging magic link → feature)

## Contexto

El callback de auth (`src/app/api/auth/callback/route.ts`) verifica el magic
link server-side (`token_hash` + `verifyOtp`) y, en éxito, hace `redirect`
directo al destino: el jugador vuelve a `next` (página de reserva o
`/mis-reservas`), el staff recién dado de alta cae en
`/dashboard|/onboarding|/select-tenant`.

No hay confirmación visual. El usuario abre el mail, "algo pasa" y aparece en
otra pantalla. En el escenario **cross-device** (empieza la reserva en la compu,
abre el mail en el celu) la sesión se setea en el celu y el redirect lo deja ahí,
sin señal de qué hacer con la pestaña original que quedó colgada.

Pedido: que tras hacer click en el botón del mail aparezca una pantalla de
**éxito** que confirme la acción y le diga cómo seguir con lo que estaba haciendo
(reserva, login, alta).

### Antecedente (mismo turno)

El bug "el magic link da error / no entra" se resolvió antes de esta feature: el
contenedor Supabase local estaba stale y servía el template default (link
implícito con tokens en el fragment `#`, ilegible para el callback `token_hash`-only).
Fix operativo: `npx supabase stop && npx supabase start`. No es parte de esta
spec, pero la feature se construye sobre el flujo ya funcionando. Ver memoria
`magic-link-pkce-token-hash`.

## Objetivos

- Pantalla de éxito tras verificar el magic link, con copy según la intención
  (reserva / login / alta de staff).
- Botón **Continuar** explícito hacia el destino original.
- **Auto-redirect a los 5 segundos** al destino, con cuenta regresiva visible.
- Mensaje cross-device: indicar que si abrió el enlace en otro dispositivo,
  vuelva a la pantalla donde empezó.

## No-objetivos (YAGNI)

- **Auto-resume de la pestaña original** (polling para despertar la pestaña de la
  compu cuando confirma en el celu). Descartado explícitamente: más complejidad
  (polling + estado compartido) sin pedido real.
- Cambios de DB, ruta nueva, o tabla de estado.
- Tocar el flujo de **recovery** (reset de contraseña): su intención es "fijá tu
  contraseña", no "éxito, continuá". Sigue redirigiendo directo a
  `/reset-password`.

## Arquitectura

La sesión queda seteada en el callback (cookies). La pantalla de éxito se
renderiza **autenticada** reusando la página existente `/verify` (el layout
`(auth)` es passthrough, no rebota usuarios logueados). No se agrega ruta nueva.

El callback, en sus ramas de éxito, en vez de `redirect(dest)` redirige a:

```
/verify?status=success&next=<dest>&intent=<booking|login|signup>
```

### Componentes

1. **`src/app/api/auth/callback/route.ts`** — ramas de éxito redirigen a
   `/verify?status=success`:
   - **Jugador** (`isPlayer`): `next` = destino ya sanitizado (`sanitizeNext`).
     `intent = 'booking'` si `next` matchea una ruta de reserva
     (`/<slug>/reservar`), si no `intent = 'login'`.
   - **Staff alta** (`type=signup`): `next` = `path` que devuelve
     `provisionAndRouteStaff` (`/dashboard|/onboarding|/select-tenant`),
     `intent = 'signup'`.
   - **Recovery** (`type=recovery`): **sin cambios**, sigue directo a
     `/reset-password`.

   El `dest` se pasa URL-encodeado en `next`. El `intent` es un enum acotado.

2. **`src/app/(auth)/verify/page.tsx`** — agrega `SuccessState`, manteniendo
   `ErrorState` y `LoadingState` actuales. Renderiza `SuccessState` cuando
   `searchParams.status === 'success'`.

   Copy por `intent`:

   | intent  | Headline                  | Subcopy                              | Botón                      |
   |---------|---------------------------|--------------------------------------|----------------------------|
   | booking | ¡Cuenta confirmada!       | Volvé para terminar tu reserva.      | Continuar con mi reserva   |
   | login   | ¡Listo!                   | Iniciaste sesión correctamente.      | Ir a mis reservas          |
   | signup  | ¡Bienvenido a TurnoGol!   | Tu cuenta quedó activada.            | Ir al panel                |

   Un `intent` desconocido o ausente cae a `login` (copy más genérico).

   Línea cross-device fija debajo del botón:
   > ¿Abriste el enlace en otro dispositivo? Volvé a la pantalla donde empezaste
   > para seguir.

3. **`SuccessRedirect` (client island)** — componente `'use client'` chico que
   recibe el `next` **ya sanitizado** (`page.tsx` calcula `safeNext =
   sanitizeNext(next)` una sola vez y lo pasa al `<a>` del botón y a este island)
   y maneja el auto-redirect:
   - `useEffect` con `setTimeout(5000)` → `window.location.assign(next)`.
   - Cuenta regresiva visible: "Te llevamos en {n}s…" (decrementa con
     `setInterval` 1s).
   - Cleanup de timers en unmount.
   - El botón Continuar (`<a href={safeNext}>`) está siempre presente como
     fallback inmediato y no-JS.

   Se aísla en su propio componente para que `verify/page.tsx` siga siendo server
   component (solo el island es cliente).

## Seguridad — open redirect

`next` viene en la URL → manipulable. Antes de usarlo (href del botón **y**
target del auto-redirect) se re-valida con `sanitizeNext` (mismo guard del
callback: solo paths same-origin que arrancan con un único `/`). El `dest` de
staff viene del server y pasa el guard igual. Fallback de `sanitizeNext` =
`/mis-reservas`.

El `intent` se valida contra el set `{booking, login, signup}`; cualquier otro
valor → `login`.

## Casos borde

- **Sin `status=success`** (entrar a `/verify` pelado): se mantiene el
  `LoadingState` actual (no se toca). Con `?error=` → `ErrorState` actual.
- **`next` ausente en success:** `sanitizeNext(null)` → `/mis-reservas`, copy
  `login`.
- **JS deshabilitado:** sin auto-redirect; el botón Continuar funciona igual.
- **Sesión ya activa** (usuario re-abre un link viejo ya consumido): no aplica a
  esta pantalla — un link consumido falla en `verifyOtp` y cae en `ErrorState`,
  no en success.

## Archivos

- `src/app/api/auth/callback/route.ts` — redirigir ramas de éxito a `/verify?status=success&next=&intent=`.
- `src/app/(auth)/verify/page.tsx` — `SuccessState` + ruteo por `status`/`intent`.
- `src/app/(auth)/verify/SuccessRedirect.tsx` — client island del auto-redirect + countdown.
- Tests (ver abajo).

## Testing

- **Unit `verify/page.tsx`** (render server): para cada `intent` (`booking`,
  `login`, `signup`) → headline/subcopy/label de botón correctos y `href` =
  `next` sanitizado. `next` malicioso (`//evil.com`, `/\evil`) → href cae al
  fallback `/mis-reservas`. `intent` inválido → copy `login`.
- **Unit `SuccessRedirect`** (client, fake timers): a los 5s llama
  `window.location.assign(next)`; el countdown decrementa; cleanup de timers en
  unmount. (Mockear `window.location` y usar `vi.useFakeTimers()`.)
- **e2e (opcional, no bloqueante):** extender el spec de magic link para hacer el
  click-through real vía Inbucket y assertar que cae en `/verify` success con el
  botón Continuar. Sigue el patrón de la memoria `local-browser-auth-inbucket`.

## Rollout / prod

Solo código (no config). No requiere tocar el dashboard de Supabase. El bug de
templates en prod (R6, templates a cargar a mano) es independiente y queda
documentado aparte.
