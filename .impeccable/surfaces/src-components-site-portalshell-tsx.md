---
version: 1
slug: "src-components-site-portalshell-tsx"
primary_target: "src/components/site/PortalShell.tsx"
related_targets: ["src/components/site/PortalHeader.tsx","src/components/site/SiteFooter.tsx","src/components/site/PlayerBottomNav.tsx","src/components/site/AccountMenu.tsx","src/components/site/PortalFrame.tsx"]
---

# Cromo del portal (cabecera, pie y barra de abajo)

Modo: Operate. Visitante: el jugador en cualquier página del portal, casi siempre en el celular. Muchas veces llegó por el link de su complejo y no conoce TurnoGol. Trabajo: saber dónde está, entrar sin perder lo que estaba haciendo y moverse entre Explorar, sus reservas y su cuenta.

Mundo: portal de vidrio (DESIGN.md, Colors › Portal de vidrio y Components › Portal de vidrio: piezas y movimiento), decisión del 2026-11-13 ([`docs/decisions/2026-11-13-portal-vidrio.md`](../../docs/decisions/2026-11-13-portal-vidrio.md)). Reemplaza al cromo de La Previa (R1 de 2026-10-20: pastilla `.overlay-nav` y barra de abajo `bg-card`). Se conserva la barra de abajo visible también sin sesión.

## Decisiones

- **`PortalShell` / `PortalFrame`:** el cascarón del portal. `PortalFrame` pone el marcador `data-portal-glass` (sin él no hay tokens `--portal-*` ni `--glass-*`), monta `PortalMotionProvider` (el `motion` del portal, nunca en `(admin)`), reserva el alto de la barra de abajo (`--portal-tabbar-space`: 12 px de aire + 66 px + área segura) y el de una barra fija abajo (`data-fixed-cta`, 78 px). Pone la luz de fondo (`portal-ambient`) en todo el marco; una pantalla que también la pone no suma otra. El mismo marcador lo ponen la home, `(business)/layout.tsx` y `PortalAuthFrame`.
- **Cabecera** (`PortalHeader`, `.portal-top*`; `SiteNav` es su re-export): en el celu, el logo y el botón de tema sin fondo; desde 768 px, una píldora de vidrio de 60 px con los links al centro y el chip de la cuenta a la derecha. Pasados 8 px de scroll se condensa una sola vez a 54 px (solo `transform` y `opacity`). Variante `overlay` sobre el hero de la home. Entre 768 y 1023 px, con sesión y un nombre largo, el chip muestra solo el avatar.
  - Destinos: sin sesión, Explorar, "Para complejos" desde `sm` e "Ingresar"; con sesión de jugador, Explorar, Rival (con el flag), "Mis reservas" y el menú de cuenta; con sesión de complejo, Explorar, "Para complejos" e "Ir a mi panel". Todos de 44 px como mínimo. En `/ingresar`, `/verify` y `/aceptar-terminos` la cabecera no muestra "Ingresar" (se apuntaba a sí misma).
  - **Botón de tema** (`ThemeButton`): el tema nuevo se abre en círculo desde el botón (`document.startViewTransition` con `clip-path`, 420 ms); sin soporte, cambia directo. Queda arriba a la derecha.
- **Menú de cuenta** (`AccountMenu`): disparador de 44 px con avatar; el menú es vidrio (`glass-pop`) y va en portal de Radix, fuera de la cabecera (un `backdrop-filter` encierra a un `fixed`). Adentro: Mis reservas, Cuenta, el tema y Salir.
- **"Ingresar" con `next`.** El link de la cabecera y el del pie llevan a `/ingresar?next=<página actual con su query>`, codificado (`IngresarLink`); `sanitizeNext` lo valida en el destino. En el HTML estático va solo el pathname; la query se suma al hidratar.
- **Pie** (`SiteFooter`): logo, "© año · Argentina", Explorar, Ingresar (con `next`), Privacidad, Términos y los canales de contacto.
- **Barra de abajo** (`PlayerBottomNav`, `.portal-tabbar`, debajo de `md`, **con y sin sesión**): píldora flotante de vidrio real de 66 px con Explorar, Rival (solo con el flag `rival`), Reservas y Cuenta. Una sola píldora (`[data-tabbar-pill]`) se traslada de una pestaña a otra con `--spring-pildora`; entre pantallas la lleva `<ViewTransition name="portal-tabbar-pill">`. El activo va semibold además del color. El ícono de la pestaña nueva hace su toque (0,86 → 1) solo si la pestaña cambió. Sin sesión, Reservas y Cuenta redirigen a `/ingresar?next=…` por el guard de cada página (y Cuenta marca activa en `/ingresar`). Baja y sale cuando sube una hoja (`[data-glass-sheet]`), cuando sube la barra de "Reservar" (`[data-reserve-bar]`) y cuando hay un campo con foco. No aparece en `/suspended`, `/reactivar` ni con sesión de complejo (`useBottomNavVisible`). Decidido en F9: se compacta al bajar y vuelve al subir.
- **Presupuesto de vidrio:** en el celu, tres capas de vidrio real a la vez como máximo; la barra de abajo y la de "Reservar" no conviven.
- **Avisos** (`toast`): bajan desde arriba con el resorte hoja, en vidrio.

## Estados y rangos

- Claro y oscuro, a 320, 375, 390, 768 y 1280 px. Tres sesiones: sin sesión, jugador y complejo. A 320 px la cabecera no desborda y ningún rótulo se parte en dos líneas.
- Con "reducir transparencia", "más contraste" o sin `backdrop-filter`, el vidrio pasa a casi opaco (listas de respaldo en `globals.css`: toda pieza nueva de vidrio entra ahí).
- Contratos que se conservan: `headers-staff-cta.test.tsx`, `legal-pages.test.ts`, `navigation-aria.test.tsx`, las stories del cromo y `tests/e2e/landing.spec.ts`.

## Fuera

- Cambiar destinos o textos de la navegación.
- La cabecera de las páginas para complejos (`BusinessHeader`): ver `src-app-business-para-complejos.md`.
