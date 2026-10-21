---
version: 1
slug: "src-app-auth-ingresar"
primary_target: "src/app/(auth)/ingresar"
related_targets: ["src/app/(auth)/verify","src/app/(auth)/aceptar-terminos"]
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
