---
version: 1
slug: "src-components-site-portalshell-tsx"
primary_target: "src/components/site/PortalShell.tsx"
related_targets: ["src/components/site/PortalHeader.tsx","src/components/site/SiteFooter.tsx","src/components/site/PlayerBottomNav.tsx","src/components/site/AccountMenu.tsx"]
---

# Cromo del portal (barra, pie y barra inferior)

Modo: Operate. Visitante: el jugador en cualquier página del portal, casi siempre en el celular. Muchas veces llegó por el link de su complejo y no conoce TurnoGol. Trabajo: saber dónde está, entrar sin perder lo que estaba haciendo y moverse entre Explorar, sus reservas y su cuenta.

Mundo: La Reserva, el del brief de `src/app/(public)/[slug]` (OWN-WORLD), sin cambios. La barra es la del boceto aprobado (`.impeccable/mocks/decision/canon.html`): logo a la izquierda, "Ingresar" en verde a la derecha, fondo blanco y una línea de 1 px abajo.

## Decisiones

- **Solo cambia el cromo.** `PortalWorld` no se monta en el cascarón. Los tokens del mundo cuelgan de `<html>`, así que montarlo ahí cambiaría de golpe todas las páginas que todavía son de La Previa, y DESIGN.md dice que se migra página por página. El fondo del cascarón (`player-shell-bg`) es parte de cada página y se va con ella. Por eso el cromo usa solo tokens semánticos y tiene que verse bien con dos juegos de tokens: los del panel, en las páginas sin migrar, y los del mundo, en las que migren desde el 2.3.
- **Barra** (`PortalHeader`, variante `solid`):
  - Va a todo el ancho, mide 56 px, queda pegada arriba y lleva un borde inferior `border` de 1 px.
  - El fondo es `bg-card` en claro y `bg-background` en oscuro. En el mundo los dos dan el color de la página. Sobre La Previa no deja una franja gris, porque en claro el `background` del panel es slate frío.
  - Sin pastilla, vidrio, desenfoque, sombra ni bordes redondeados.
  - El contenido va en el ancho de la página (`max-w-7xl`), con 16 px de margen en el celular.
  - A la izquierda, el logo horizontal: link a la home con 44 px de blanco táctil.
  - Los destinos son los de hoy, sin agregar ni sacar ninguno:
    - sin sesión: Explorar, "Para complejos" desde `sm` e "Ingresar";
    - con sesión de jugador: Explorar, "Mis reservas" desde `sm` y el menú de cuenta;
    - con sesión de complejo: Explorar, "Para complejos" desde `sm` e "Ir a mi panel".
  - "Ingresar" e "Ir a mi panel" son links de texto verde (`text-emerald-700 dark:text-emerald-400`), de 15 px semibold y 44 px de blanco táctil, sin borde ni relleno, como en el boceto.
  - Explorar, Para complejos y Mis reservas llevan ícono y texto en `muted-foreground`, pasan a `foreground` al hover y tienen 44 px de blanco táctil.
  - Foco: anillo de 2 px `primary`, separado 2 px con el color de la barra. No `ring`: con los tokens del panel, en claro, es emerald-500 y da 2,59:1 sobre blanco; `primary` da 5,56:1 con los dos juegos de tokens, y en el mundo es el mismo color (`--ring: var(--primary)`).
- **Menú de cuenta** (`AccountMenu`):
  - El disparador queda plano: avatar de 32 px (iniciales sobre `bg-muted`, para no sumar otro verde relleno) y nombre, sin sombra ni vidrio. Debajo de `sm` muestra solo el avatar y el chevron: el nombre queda en el `aria-label`, y Mis reservas y Cuenta están en la barra inferior.
  - En el panel desplegado se van el degradé y la sombra del avatar, la tarjeta translúcida del encabezado y el corrimiento de los ítems al hover. Cada ítem tiene 44 px.
  - Los destinos son los mismos: Mis reservas, Cuenta, el tema y Salir.
- **"Ingresar" con `next`.** El link de la barra y el del pie llevan a `/ingresar?next=<página actual con su query>`, codificado, para que el jugador vuelva adonde estaba. `sanitizeNext` ya valida ese valor en `/ingresar`, en las actions y en el callback. En el HTML estático va solo el pathname; la query se suma al hidratar, sin romper el render estático.
- **Pie** (`SiteFooter`):
  - Es plano, con borde superior `border` de 1 px y el mismo fondo que la barra.
  - El contenido no cambia: logo, "© año · Argentina", Explorar, Ingresar (con `next`), Privacidad, Términos y los canales de contacto.
  - Texto de 14 px en `muted-foreground`. Los links tienen 44 px de blanco táctil en todos los anchos.
- **Barra inferior** (`PlayerBottomNav`; aparece con sesión de jugador, debajo de `md`):
  - Los destinos son los mismos: Explorar, Reservas y Cuenta.
  - Mismo fondo que la barra, borde superior de 1 px e ítems de al menos 56 px.
  - El ítem activo no se marca solo con color: va en verde, semibold y con una marca `primary` de 2 px arriba del ícono.
  - RIVAL se suma cuando exista (Fase 3, flag `rival`), no antes.
- **Home:** la variante `overlay` de la barra (el vidrio sobre el hero) queda como está hasta el 2.5. Lo único que cambia ahí es que su "Ingresar" suma `next`. El pie nuevo sí aparece en la home.

## Estados y rangos

- Claro y oscuro, a 320, 375, 390, 768 y 1280 px. Tres sesiones: sin sesión, jugador y complejo. La barra inferior se prueba con cada una de sus tres rutas activas. A 320 px la barra no desborda y ningún rótulo se parte en dos líneas.
- Contratos que se conservan, o se cambian a propósito en el mismo PR: `headers-staff-cta.test.tsx`, `legal-pages.test.ts`, `navigation-aria.test.tsx`, las stories del cromo y `tests/e2e/landing.spec.ts`.
- Antes del merge se regeneran con `visual-baseline.yml` las baselines visuales que muestran el cromo: `landing.png`, `perfil-publico.png` y `perfil-publico-mobile.png`.

## Fuera

- Montar `PortalWorld` en el cascarón y el fondo `player-shell-bg`: van con las páginas, del 2.3 en adelante.
- La barra `overlay` de la home: va en el 2.5.
- RIVAL en la navegación: Fase 3.
- Cambiar destinos o textos de la navegación.
