---
version: 1
slug: "src-app-auth-ingresar"
primary_target: "src/app/(auth)/ingresar"
related_targets: ["src/app/(auth)/verify","src/app/(auth)/aceptar-terminos","src/app/(public)/[slug]/reservar"]
---

# Ingreso del jugador (src/app/(auth)/ingresar, verify, aceptar-terminos)

Modo: Operate. Visitante: el jugador que toca "Ingresar" en el portal, el que vuelve del enlace del mail o de Google, y el jugador nuevo al que le falta aceptar los términos. Trabajo: entrar sin trabarse y volver a donde estaba.

Mundo: La Previa (DESIGN.md, sección del portal), re-aplicada en la R2 de [`docs/decisions/2026-10-20-vuelve-la-previa.md`](../../docs/decisions/2026-10-20-vuelve-la-previa.md) (PR #455). Reemplaza al brief de La Reserva de estas pantallas. Las pantallas del staff (`/login`, `/register`, recuperación y los estados de `/verify` del staff) no cambian.

## Decisiones

- **Marco (`PortalAuthFrame`):** siempre oscuro, también con el tema claro (`dark dark-surface`, fondo #020617). Dos resplandores esmeralda, el logo arriba y el contenido en una card de vidrio (`AUTH_CARD_STYLE`). `/ingresar` suma la foto a la izquierda (`ImagePane`, solo desde `lg`, decorativa, con velo y resplandor); las demás pantallas van sin foto.
- **`/ingresar`:** título en negra itálica con un tramo en degradé esmeralda (`AUTH_TITLE`, `AUTH_ACCENT_STYLE`). "Continuar con Google" y el email ("Mandame el enlace") a la vista sin scroll, los dos de 48 px a todo el ancho. En los navegadores internos (Instagram, Facebook, TikTok) va primero el email, con la aclaración de que Google puede no abrir ahí. El campo (`AUTH_INPUT`) usa `border-input` (3:1) y mide 16 px en el celular. Enlace enviado: a qué dirección, "Reenviar" con espera de 60 s y "Usar otro email". El texto no promete el envío: la action contesta igual cuando el email no tiene cuenta, para no revelar qué emails están registrados. `next` se respeta.
- **`/aceptar-terminos`:** el mismo marco. La casilla del +18 y los términos (ADR-012) y "Continuar". Si falta la casilla, se marca el error en la casilla; nada queda deshabilitado sin explicación. (La casilla se eliminó solo en confirmar la reserva, donde el +18 es clickwrap: `docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md`; este camino se mantiene para quien llega por otro lado.)
- **`/verify`, solo los estados del jugador** (`audience: 'player'`): el mismo marco, con el título y la acción de cada código. Los estados del staff siguen como estaban.
- `PortalAuthFrame` no monta `PortalWorld`: los tokens son los del panel. El borde de campo llega a 3:1 con `[--input:215.4_16.3%_50%]` en el propio marco.
- Botones planos (`PORTAL_BUTTON`): sin sombra ni elevación al hover; el foco se separa con el color del fondo. Mismo comportamiento: no cambian las Server Actions, el callback, los códigos ni los tiempos.

## Estados y rangos

- Claro y oscuro, a 375, 390, 768 y 1280 px. Email largo: se corta sin romper el layout. Errores de la action: email inválido, demasiados intentos, sin conexión. Sin conexión, el error queda en el formulario con el email escrito, y la página no cae en el error del grupo. Botón enviando: "Enviando…", sin doble envío.
- Contratos: los encabezados que fijan las e2e y las stories (TG-HP-010, `VerifyPage.stories`, `IngresarForm.stories`) se conservan o se cambian a propósito en el mismo PR.

## Fuera

La barra y el pie del portal, y "Ingresar" con `next` en la barra (ver `src-components-site-portalshell-tsx.md`). El ingreso dentro de la reserva (`LoginGate`, un modal con el mismo vidrio) y la vuelta directa sin `/verify` (ver `src-app-public-slug.md`).

## Spec visual (movida de DESIGN.md el 2026-10-29)

Vivía en DESIGN.md › Components › Portal (La Previa) y se movió sin cambios de contenido. Lo que comparte todo el portal (cromo, `PORTAL_BUTTON`, The Quiet Ghost Rule) sigue en DESIGN.md.

### Confirmar la reserva y el ingreso del jugador

`/[slug]/reservar`, en `src/app/(public)/[slug]/reservar/`. Decisión de flujo: [`docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md`](../../docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md). La columna, el ritmo y el botón fijo están en Layout.

- **Arriba:** "Volver" es un link de 44 px en 16 px semibold `text-emerald-700 dark:text-emerald-400` subrayado, con flecha de 16 px, a la ficha con `?date=&hora=` (y `&formato=` si había uno); después "Confirmá tu **reserva**" en Archivo negra itálica de `text-3xl`, con el tramo en `.hero-accent-text`.
- **Qué elegiste va en la URL:** `formato` y un `pay` heredado de un link viejo viajan en la query; los arma un solo helper (`buildReservarHref` en `src/lib/booking/reserve-url.ts`). Ninguna pantalla ofrece elegir `pay`.
- **Resumen (`BookingSummary`):** una tarjeta-comprobante (`.reserva-receipt-card`, esquina de 16 px, `p-5`): el complejo en Archivo, la dirección con la ciudad en 14 px `muted-foreground` con pin y, tras un divisor, tres filas con ícono (día, hora tabular, "Cancha 2 · Fútbol 5"). El precio solo si se ve: "Precio del turno", "Seña a pagar ahora" (la cifra en Archivo tabular, esmeralda) y "Resto en el complejo". Con `hidePrices` no hay ningún monto en el DOM ni en un `aria-label`.
- **Un solo botón de acción (`CheckoutFlow`):** "Pagar seña · $ X" con seña (sin el monto si el complejo oculta precios: "Pagar seña") y "Reservar" sin ella. Ya no se elige cómo se paga en el complejo: no existen la sección "Cómo pagás" ni `PaymentMethodSelector`. Debajo, la regla de cancelación del complejo en 14 px `muted-foreground` (con seña: "Si cancelás con más de 12 horas de anticipación, el complejo te devuelve la seña. Después, la seña queda en el complejo."; sin seña: "Podés cancelar desde Mis reservas."); con seña y precios ocultos, antes: "Pagás una seña online con MercadoPago; el resto, en el complejo."
- **Con sesión (`ConfirmBookingButton`):** envía la reserva. Debajo de `md` va en la barra fija de Layout (`FixedCta`, `data-fixed-cta`); desde `md`, en el flujo. Pendiente, "Procesando…" deshabilitado y a contraste pleno. **Confirmación sola (`AutoConfirm`):** si el jugador vuelve del enlace del email con una intención válida y el complejo no cobra seña, el form se envía solo, una vez.
- **Sin sesión (`LoginGate`):** el mismo botón abre un diálogo de ingreso (hoja que sube desde abajo en el celular, tarjeta centrada desde `md`), siempre oscuro y con el vidrio de La Previa: "Entrá para **reservar**" (`AUTH_TITLE`), "Continuar con Google" (`outline`), un divisor "o" y el email (`AUTH_INPUT`) con "Continuar con mi email" (`primary`). **Sin casilla ni campo Nombre:** el +18 es clickwrap, con la frase "Al continuar declarás que sos mayor de 18 años y aceptás los Términos y condiciones" (el link abre `/terminos` en otra pestaña, 44 px de alto) debajo de los botones; el servidor sigue exigiendo `terms` y registrándolo (ADR-012). El nombre se deriva del email en el servidor. En el navegador interno de Instagram, Facebook o TikTok va primero el email y, en lugar de Google (ahí termina en su error `disallowed_useragent`), el aviso `InAppBrowserNotice` (`src/components/world/`, compartido con `/ingresar`): `bg-muted` con borde y 12 px de esquina, "¿Querés entrar con Google?" en 16 px semibold, cómo abrir la página en el navegador con el menú ⋯ de la app y "Copiar enlace" (`outline`, 48 px), que avisa en un `role="status"`.
- **Enviado:** el mismo diálogo pasa a "Revisá tu **email**", con lo que pasa al tocar el enlace, "Reenviar enlace" (con su espera de 60 s) y "Usar otro email". Lo compartido con `/ingresar` está en `src/components/world/MagicLinkSent.tsx`.
- **Vuelta del ingreso:** con `next` en `/[slug]/reservar`, el callback y `/aceptar-terminos` llevan directo a esa pantalla, sin pasar por `/verify`. La intención viaja firmada (`src/shared/security/booking-intent.ts`): 60 min en el enlace del mail; por Google, una cookie HttpOnly de 10 min.
- **Avisos (`CheckoutErrorBanner`):** un aviso arriba del resumen con `role="alert"`, ícono de alerta y una salida en link ("Elegir otro turno"; "Buscar otro complejo" para un baneo). Todo lo que avisa acá frena la reserva: es un error, no una advertencia.
- **Estados inválidos (`CheckoutInvalidState`, en `CheckoutStates.tsx`):** "Este complejo no toma reservas online por ahora", "No pudimos abrir este turno", "No encontramos ese turno", "Ese turno ya no está disponible" y "Ese turno se ocupó mientras entrabas", sobre `ReservaDarkShell`, con título, qué pasó y la salida.
- **Carga (`loading.tsx`):** la silueta de la pantalla sobre `ReservaDarkShell`, en la misma columna.
