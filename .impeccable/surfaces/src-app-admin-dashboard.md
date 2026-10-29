---
version: 1
slug: "src-app-admin-dashboard"
primary_target: "src/app/(admin)/dashboard"
related_targets: []
---

# Tablero de Hoy (src/app/(admin)/dashboard)

Spec visual vigente de la pantalla. Vivía en DESIGN.md › Components y se movió acá el 2026-10-29 sin cambios de contenido, para que DESIGN.md quede con lo que comparten todas las pantallas (tokens, reglas y componentes compartidos), que sigue mandando sobre esto. Esta pantalla todavía no tiene brief de `shape`.

## Tablero de Hoy

La otra pieza del mostrador (`CourtBoard` + el modal `VenderDialog`), rehecha el 2026-09-25 para que Hoy sea una pantalla de acción (`docs/decisions/2026-09-25-hoy-cobrar-ahora.md`). El dueño eligió el diseño de las filas y el del modal de Vender entre variantes ese mismo día.

- **Turnos de hoy:** UNA tarjeta con una fila por cancha en servicio (en el orden de la Grilla; una pausada aparece solo si debe plata), 1 columna en el teléfono y 2 desde 40 rem de ancho. Cada fila es UN botón con UN turno: la cancha, el nombre en 15 px con "cuándo · detalle" debajo (`MetaLine`, que nunca deja un "·" colgando), la plata a la derecha y abajo el reloj del turno: hora de inicio, una barra de 4 px y hora de fin. Con menos de 25 rem de fila el nombre de la cancha sube arriba del turno para que "Cobrar $X" no aplaste el nombre. El tablero va a todo el ancho: doce canchas miden 662 px de alto en la notebook (806 px con 682 px de ancho).
- **Qué turno muestra:** el que terminó sin cobrarse (el más reciente; los otros de esa cancha se cuentan: "+1 más por cobrar"); si no, el que se juega ("Termina en 25 min", lo que falta y la barra llenándose en verde); si no, el próximo ("Empieza en 25 min" o "Empieza a las 23:00", barra vacía); si no, "Sin más turnos hoy" con borde punteado.
- **Cobrar ahora:** la fila del turno jugado y no cobrado va en rojo (borde al 40 %, fondo al 5 % en claro y 10 % en oscuro), con "Terminó hace N min" en rojo, la barra llena en rojo y el botón rojo "Cobrar $X" con un punto que late (`animate-ping`, congelado con `prefers-reduced-motion`). El encabezado del tablero dice "N sin cobrar · $X" en rojo, o "Todo cobrado" en verde.
- **Pagado:** la fila de un turno pagado entero se tiñe de verde igual que la roja (borde al 40 %, fondo al 5 % y 10 %), con "Pagado" a la derecha (pedido del dueño, 2026-09-25). Un torneo no se cobra por turno y va sin color.
- **Turnos no cobrados de días anteriores:** UN renglón debajo del tablero, con la cantidad y el total en rojo y "Ver y cobrar", que abre la lista en un diálogo; cada turno se cobra con el mismo modal. Nunca una lista en la pantalla.
- **Vender (modal):** lo abre el botón "Vender" de la barra superior, a todos los anchos, o la tecla V (salvo escribiendo en un campo o con otro diálogo abierto). Mide hasta 1120×640 px y tiene tres columnas desde `lg`: los rubros ("Más vendidos" con estrella, cada categoría, "Otros" para lo que no tiene y "Todos"; sin categorías quedan solo "Más vendidos" y "Todos"), la lista del rubro y la venta a la derecha. Debajo de `lg` los rubros pasan a una tira de chips y, en el teléfono, la venta baja al pie. El catálogo son renglones con nombre y precio, no tarjetas (el stock solo cuando avisa: "Quedan 3" en ámbar o "Agotado" en rojo); lo que ya está en la venta muestra la cantidad en una pastilla `primary`. El buscador busca en todo el catálogo, ↑↓ eligen, Enter suma y F2 cobra; la ayuda de teclas va al pie. La venta: renglones con − cantidad +, el total en `font-display` de 28 px, el método de pago, "Cobrar $X" y "Anotar como fiado" sin borde. Después de cobrar el modal se cierra solo; con una venta sin confirmar no se cierra.
