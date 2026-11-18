---
version: 1
slug: "src-app-auth-ingresar"
primary_target: "src/app/(auth)/ingresar"
related_targets: ["src/app/(auth)/verify","src/app/(auth)/aceptar-terminos","src/app/(public)/[slug]/reservar"]
---

# Ingreso del jugador (src/app/(auth)/ingresar, verify, aceptar-terminos)

Modo: Operate. Visitante: el jugador que toca "Ingresar" en el portal, el que vuelve del enlace del mail o de Google, y el jugador nuevo al que le falta aceptar los términos. Trabajo: entrar sin trabarse y volver a donde estaba.

Mundo: portal de vidrio (DESIGN.md, Colors › Portal de vidrio), F6 y F7 de la decisión del 2026-11-13 ([`docs/decisions/2026-11-13-portal-vidrio.md`](../../docs/decisions/2026-11-13-portal-vidrio.md)). La Previa (R2 de 2026-10-20: marco siempre oscuro, `AUTH_CARD_STYLE`, `AUTH_TITLE`) se reemplazó por el vidrio el 2026-11-13: el ingreso sigue el tema del visitante, claro u oscuro. Las pantallas del staff (`/login`, `/register`, recuperación y los estados de `/verify` del staff) no cambian.

## Decisiones

- **Marco (`PortalAuthFrame`, `src/components/world/`):** monta el cromo del portal (`PortalSessionProvider`, `PortalHeader` y `PlayerBottomNav`) dentro del `<main>` del layout de `(auth)`, la foto del hero (`HeroBackdrop`, con la misma entrada y sin el reflejo) y una columna centrada. No usa `PortalFrame` (pondría otro `<main>`). `signOutAction` entra por prop desde la page. En `/ingresar`, `/verify` y `/aceptar-terminos` la barra de abajo marca Cuenta y la cabecera no muestra "Ingresar".
- **`/ingresar`:** título "Accedé a tu cuenta" (`.pa-auth__title`), tarjeta de vidrio con el relleno de la ventana (`--portal-win-*`, como el buscador de la home) para que la foto no se transparente. "Continuar con Google" y el email ("Mandame el enlace") a la vista sin scroll, de 52 px (`pill` y `pill-glass`). En los navegadores internos (Instagram, Facebook, TikTok) va primero el email, con la aclaración de que Google puede no abrir ahí. El campo es `GLASS_INPUT` (52 px, 16 px en el celu, borde a 3:1). Enlace enviado (`MagicLinkSent`): a qué dirección, "Reenviar" con espera de 60 s y "Usar otro email"; el sobre hace su toque. El texto no promete el envío: la action contesta igual cuando el email no tiene cuenta. `next` se respeta.
- **`/aceptar-terminos`:** el mismo marco. La casilla del +18 y los términos (ADR-012) y "Continuar". Si falta la casilla, se marca el error en la casilla; nada queda deshabilitado sin explicación. (La casilla se eliminó solo en confirmar la reserva, donde el +18 es clickwrap.)
- **`/verify`, solo los estados del jugador** (`audience: 'player'`): el mismo marco, con el título y la acción de cada código. `VerifyView` recibe `signOutAction` por prop (importado ahí, mete `node:crypto` en el bundle de Storybook).
- **Contraste sobre la foto:** los links van en el verde de lugar (`--portal-slot-ink`) y las dos tarjetas usan el relleno de la ventana. Peor caso medido: 4,79:1 en claro y 6,24:1 en oscuro, sobre el píxel. "Reenviar en N s" deshabilitado lleva `disabled:opacity-100`.
- **Botones:** píldoras del portal (`Button` `variant="pill"`); `PORTAL_BUTTON_OUTLINE` y `PORTAL_LINK` (`portal-auth-styles.ts`, un módulo sin imports) para lo que no es píldora. No cambian las Server Actions, el callback, los códigos ni los tiempos.

## Estados y rangos

- Claro y oscuro, a 375, 390, 768 y 1280 px. Email largo: se corta sin romper el layout. Errores de la action: email inválido, demasiados intentos, sin conexión. Sin conexión, el error queda en el formulario con el email escrito, y la página no cae en el error del grupo. Botón enviando: "Enviando…", sin doble envío.
- Contratos: los encabezados que fijan las e2e y las stories (TG-HP-010, `VerifyPage.stories`, `IngresarForm.stories`) se conservan o se cambian a propósito en el mismo PR.

## Fuera

La cabecera y el pie del portal (ver `src-components-site-portalshell-tsx.md`). El ingreso dentro de la reserva (`LoginPanel`) y el de Rival (`LoginGate`, hoja de vidrio) están en `src-app-public-slug.md`. El ingreso del complejo no cambia.

## Spec visual

### Confirmar la reserva y el ingreso del jugador

`/[slug]/reservar`, en `src/app/(public)/[slug]/reservar/`. Decisión de flujo: [`docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md`](../../docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md) (el flujo, no la piel: el ingreso ya no es un modal, ver abajo). Una columna de 480 px (`.rv-col`) sobre `ReservaDarkShell`.

- **Arriba:** "Volver" (un link de 44 px) a la ficha con `?date=&hora=` (y `&formato=` si había uno); después el título de la pantalla.
- **Qué elegiste va en la URL:** `formato` y un `pay` heredado de un link viejo viajan en la query; los arma un solo helper (`buildReservarHref` en `src/lib/booking/reserve-url.ts`).
- **Resumen (`BookingSummary`):** el complejo, la dirección con la ciudad y tres filas con ícono (día, hora tabular, "Cancha 2 · Fútbol 5"), en vidrio pintado. El precio solo si se ve: "Precio del turno", "Seña a pagar ahora" y "Resto en el complejo". Con `hidePrices` no hay ningún monto en el DOM ni en un `aria-label`.
- **Un solo botón de acción (`CheckoutFlow`):** "Pagar seña · $ X" con seña (sin el monto si el complejo oculta precios: "Pagar seña") y "Reservar" sin ella. Debajo, la regla de cancelación del complejo. Con sesión (`ConfirmBookingButton`): debajo de `md` va en la barra fija de vidrio (78 px, `data-fixed-cta`, `glass-pop`) y desde `md`, en el flujo. Pendiente, "Procesando…" con el brillo de carga dentro del botón. Confirmación sola (`AutoConfirm`): si el jugador vuelve del enlace con una intención válida y el complejo no cobra seña, el form se envía solo, una vez.
- **Sin sesión (`LoginPanel`):** el ingreso es una región de la misma pantalla con su h2 "Entrá para reservar", no un modal; los e2e y tests buscan `region`, no `dialog`. Comparte `GateBody` con `LoginGate` (la hoja de Rival). "Continuar con Google", un divisor "o" y el email con "Continuar con mi email". Sin casilla ni campo Nombre: el +18 es clickwrap debajo de los botones; el servidor sigue exigiendo `terms` (ADR-012). En el navegador interno va primero el email y el aviso `InAppBrowserNotice` en lugar de Google. El monto de la seña sin sesión queda solo en el resumen: "Pagar seña · $X" aparece con sesión.
- **Enviado:** el formulario se va y entra "Revisá tu email" por reemplazo, con lo que pasa al tocar el enlace, "Reenviar enlace" (60 s) y "Usar otro email" (`MagicLinkSent`).
- **Vuelta del ingreso:** con `next` en `/[slug]/reservar`, el callback y `/aceptar-terminos` llevan directo a esa pantalla, sin pasar por `/verify`. La intención viaja firmada (`src/shared/security/booking-intent.ts`): 60 min en el enlace del mail; por Google, una cookie HttpOnly de 10 min.
- **Avisos (`CheckoutErrorBanner`):** un aviso arriba del resumen con `role="alert"` y una salida en link. Todo lo que avisa acá frena la reserva.
- **Estados inválidos (`CheckoutInvalidState`, en `CheckoutStates.tsx`):** "Este complejo no toma reservas online por ahora", "No pudimos abrir este turno", "No encontramos ese turno", "Ese turno ya no está disponible" y "Ese turno se ocupó mientras entrabas", con `PortalResult`.
- **Carga (`loading.tsx`):** la silueta de la pantalla sobre `ReservaDarkShell`, en la misma columna.
