---
version: 1
slug: "src-components-site-portalshell-tsx"
primary_target: "src/components/site/PortalShell.tsx"
related_targets: ["src/components/site/PortalHeader.tsx","src/components/site/SiteFooter.tsx","src/components/site/PlayerBottomNav.tsx","src/components/site/AccountMenu.tsx","src/components/site/PortalFrame.tsx"]
---

# Cromo del portal (barra, pie y barra inferior)

Modo: Operate. Visitante: el jugador en cualquier página del portal, casi siempre en el celular. Muchas veces llegó por el link de su complejo y no conoce TurnoGol. Trabajo: saber dónde está, entrar sin perder lo que estaba haciendo y moverse entre Explorar, sus reservas y su cuenta.

Mundo: La Previa (DESIGN.md, sección del portal), re-aplicada en la R1 de [`docs/decisions/2026-10-20-vuelve-la-previa.md`](../../docs/decisions/2026-10-20-vuelve-la-previa.md) (PR #454). Reemplaza al brief de La Reserva (barra plana de 56 px, sin pastilla ni vidrio). Se conserva la barra inferior visible también sin sesión, que es lo único nuevo que se queda de La Reserva.

## Decisiones

- **`PortalShell` / `PortalFrame`:** el cascarón del portal. `PortalFrame` pinta `.player-shell-bg` (la cancha vectorial: emerald-50 en claro, slate-950 con resplandor en oscuro) y reserva el alto de la barra inferior y del botón fijo (`data-fixed-cta`). **No monta `PortalWorld`**: la excepción de la ficha lo monta en su propio layout (ver `src-app-public-slug.md`).
- **Barra** (`PortalHeader`):
  - `solid` (todo el portal salvo la home): pastilla `rounded-full` de 56 px, pegada arriba, con borde `border`, fondo `bg-card/80` y `backdrop-blur-md`, dentro de `max-w-7xl`.
  - `overlay` (la home): la pastilla flotante `.overlay-nav` sobre el hero. `SiteNav` es un re-export de `PortalHeader`.
  - Destinos: sin sesión, Explorar, "Para complejos" desde `sm` e "Ingresar"; con sesión de jugador, Explorar, "Mis reservas" desde `sm` y el menú de cuenta; con sesión de complejo, Explorar, "Para complejos" e "Ir a mi panel". Todos de 44 px de alto como mínimo.
  - "Ingresar" e "Ir a mi panel" son una pastilla de 44 px con borde (`panelLinkClass`).
- **Menú de cuenta** (`AccountMenu`, variantes `solid` y `overlay`): disparador de 44 px con avatar y nombre; foco `ring-primary`. Adentro, Mis reservas, Cuenta, el tema (`ThemeToggle variant="portal"`) y Salir.
- **"Ingresar" con `next`.** El link de la barra y el del pie llevan a `/ingresar?next=<página actual con su query>`, codificado (`IngresarLink`); `sanitizeNext` lo valida en el destino. En el HTML estático va solo el pathname; la query se suma al hidratar.
- **Pie** (`SiteFooter`): `border-t border-border`, fondo `bg-card/60` (`dark:bg-slate-950`); logo, "© año · Argentina", Explorar, Ingresar (con `next`), Privacidad, Términos y los canales de contacto.
- **Barra inferior** (`PlayerBottomNav`, debajo de `md`, **con y sin sesión**): Explorar, Reservas y Cuenta; `bg-card`, borde superior de 1 px e ítems de al menos 56 px. El activo no se marca solo con color: va en verde, semibold y con una marca `primary` de 2 px arriba del ícono. Sin sesión, Reservas y Cuenta redirigen a `/ingresar?next=…` por el guard de cada página. No aparece en `/suspended`, `/reactivar` ni con sesión de complejo. Su alto (56 px + 1 px + safe-area) está reservado en `PortalFrame`, el `scroll-padding-bottom` de `globals.css` y `ConfirmBookingButton`; si cambia uno, cambian los tres.
- RIVAL se suma a la navegación cuando exista (Fase 3, flag `rival`), no antes.

## Estados y rangos

- Claro y oscuro, a 320, 375, 390, 768 y 1280 px. Tres sesiones: sin sesión, jugador y complejo. A 320 px la barra no desborda y ningún rótulo se parte en dos líneas.
- Contratos que se conservan: `headers-staff-cta.test.tsx`, `legal-pages.test.ts`, `navigation-aria.test.tsx`, las stories del cromo y `tests/e2e/landing.spec.ts`.

## Fuera

- RIVAL en la navegación: Fase 3.
- Cambiar destinos o textos de la navegación.
