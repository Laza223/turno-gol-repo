# Ledger: el portal vuelve a La Previa

Esfuerzo de [`docs/decisions/2026-10-20-vuelve-la-previa.md`](../decisions/2026-10-20-vuelve-la-previa.md). Va del 2026-10-20 al 2026-10-21. Orquesta Opus y ejecutan subagentes Sonnet.

## Fases

| Fase | Qué | PR | Estado |
|---|---|---|---|
| R1 | Home (solo el hero de agosto), cromo y barra inferior sin sesión | #454 | Mergeado |
| R2 | Ingreso: `/ingresar`, `/aceptar-terminos`, `/verify` | #455 | Mergeado |
| R3 | Ficha del complejo `/[slug]` | #456 | **Cerrado sin mergear**: el dueño decidió que la ficha se queda como estaba (2026-10-21) |
| R4 | Confirmar y la vuelta de la reserva, más los cambios de flujo de [`2026-10-21-confirmar-sin-casilla-y-modal.md`](../decisions/2026-10-21-confirmar-sin-casilla-y-modal.md) | #457 | Mergeado |
| R5 | Mis reservas, Mi cuenta y Eliminar la cuenta | #459 | Mergeado |
| R6 | Docs (`DESIGN.md`, `PRODUCT.md`, superficies), contraste de `PlayerHeroBand` y este ledger | (este PR) | En curso |

## Delegaciones

En cada fase hubo un implementador y un revisor adversarial, en invocaciones distintas y con contexto fresco.

| Fase | Delegado | Para qué | Resultado |
|---|---|---|---|
| R1 | `sonnet-implementer` y `sonnet-adversarial-reviewer` | Re-skin de la home y el cromo | Verde. La baseline visual se regeneró con el workflow. |
| R2 | `sonnet-implementer` y `sonnet-adversarial-reviewer` | Re-skin del ingreso | Verde. Los campos sobre el vidrio quedaron a 3:1 con `[--input:…]` en `PortalAuthFrame`. |
| R3 | `sonnet-implementer` y `sonnet-adversarial-reviewer` | Re-skin de la ficha | Arreglados los overrides de hover que perdían por especificidad. El PR se descartó por decisión del dueño. |
| R4 | `sonnet-implementer` y `sonnet-adversarial-reviewer` | Re-skin de confirmar y de la vuelta, con los cambios de flujo | Tres hallazgos corregidos: el borde del modal a 2,6:1, una cuenta regresiva que revertía #437 y una carrera de las stories con el fade-in del diálogo. |
| R5 | `sonnet-implementer`, que se cortó por un apagón y se retomó | Re-skin del grupo del jugador | Verde en local. |
| R5 | `sonnet-adversarial-reviewer` | Revisión | 🔴: sin `PortalWorld` el borde de campo quedaba en 1,6:1 (claro) y 1,2:1 (oscuro). Se corrigió con `data-portal-fields`. 🟡: los esqueletos no coincidían en el celular. |
| R5 | `sonnet-implementer` | Recalibrar los esqueletos `loading.tsx` | Desvío por bloque de 0 px en casi todos los anchos (como mucho ~5 px en un bloque) entre 320 y 1280 px. |
| R6 | `sonnet-implementer` | Docs y contraste de `PlayerHeroBand` | En curso |

## Incidentes

- **#454, #455 y #457 se mergearon como squash.** Cada rama siguiente quedaba en conflicto con sus propios commits viejos. Se resolvió mergeando main en la rama siguiente. En los conflictos se quedó la versión de la rama, salvo las baselines visuales, que se tomaron de main cuando ya estaban regeneradas ahí.
- **Lint & Types reventaba por memoria en la CI (#459).** ESLint con reglas tipadas ronda los 2 GB de heap; main también revienta en local con ese límite. Se le dio `NODE_OPTIONS=--max-old-space-size=4096` al step de Lint en `ci.yml`.
- **Apagón de la máquina a mitad de R5.** El trabajo sin commitear del worktree quedó entero y el implementador se retomó desde su transcript.

## Queda abierto

- `PortalWorld`, `portal-world.css` y sus tests quedan, acotados a la ficha `/[slug]`. Solo se borran si el dueño decide pasar también la ficha a La Previa.
- Los worktrees viejos (`TurnoGol-wt-previa-r3`, `TurnoGol-wt-portal`, `TurnoGol-wt-explorar-bugs`) y la rama `design/portal-explorar` se borran con OK del dueño.
