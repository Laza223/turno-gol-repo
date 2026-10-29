---
version: 1
slug: "src-app-admin-caja"
primary_target: "src/app/(admin)/caja"
related_targets: ["src/app/(admin)/caja/cuentas","src/app/(admin)/caja/productos"]
---

# Caja: Cuentas y Productos (src/app/(admin)/caja)

Spec visual vigente de la pantalla. Vivía en DESIGN.md › Components y se movió acá el 2026-10-29 sin cambios de contenido, para que DESIGN.md quede con lo que comparten todas las pantallas (tokens, reglas y componentes compartidos), que sigue mandando sobre esto. Esta pantalla todavía no tiene brief de `shape`.

## Caja › Cuentas (libro de la noche)

La pantalla donde el dueño mira la noche, casi siempre desde el celular (`/caja/cuentas`), rehecha el 2026-09-25 porque los movimientos quedaban escondidos detrás de la tabla de lo sin cobrar (`docs/decisions/2026-09-25-caja-libro-de-la-noche.md`). El dueño eligió la variante entre tres ese día. De arriba a abajo:

- **Día:** flechas ‹ › con "Hoy · jue 24 sep", "Ayer · …" o la fecha corta; desde `lg` cuelgan del hueco de la barra y en el teléfono bajan arriba del contenido. En hoy la flecha de adelante se apaga. El resumen y los movimientos son de ese día operativo (`?dia=`); lo sin cobrar no depende del día.
- **Resumen (el cierre automático):** una tarjeta con "Entró hoy" y el total en `font-display` de 30 px; al lado, efectivo, MercadoPago y transferencia siempre (aunque den cero) y, separados por una línea, turnos, cantina, otros y los gastos en rojo con "−". No se cuentan billetes.
- **Lo sin cobrar:** una tarjeta clickeable por tipo, "N fiados sin cobrar · $X" y "N turnos no cobrados · $X" (el monto de los turnos en rojo), con "Ver y cobrar ›". Cada una abre su diálogo con la lista: nombre, "jue 17 sep · Cancha 2 · 19:00–20:00" (el día primero, para que en el teléfono se corte la hora y no cuándo se jugó) o "Anotado hace 2 días", el monto, WhatsApp si hay teléfono, "Anular" en los fiados y "Cobrar". El cobro se abre encima con el modal de siempre y la lista queda abierta para el siguiente. Nunca una tabla en la pantalla.
- **Movimientos:** UNA tarjeta a todo el ancho, del más nuevo al más viejo y agrupada por hora, con una fila "21 h · 6 movimientos" y el neto de esa hora. Los chips "Todo / Turnos / Cantina" (y "Gastos" si hay alguno) filtran en el lugar. Cada fila: hora, ícono del tipo con nombre accesible, quién pagó o qué se vendió, el método y el monto. El ticket de cantina pierde el "Cantina: " y el turno se nombra por quién pagó, nunca por la descripción guardada (que puede decir "deuda"). Desde `lg` es una tabla; debajo, una lista. "Registrar movimiento" es un botón sin borde en el encabezado y solo aparece en hoy (en el Vagón se usó cero veces en diez noches).

## Caja › Productos (reponer primero)

Lo semanal de la cantina (`/caja/productos`), rehecho el 2026-09-26 con el mismo estilo que Cuentas (`docs/decisions/2026-09-26-caja-productos-reponer-primero.md`). El dueño eligió la variante entre tres. Todo va en tarjetas. De arriba a abajo:

- **Para reponer:** solo si hay algo en su mínimo, por debajo o agotado. El título en ámbar con la cantidad y una fila por producto, del que se acaba primero al último: "Imperial quedan 55 (mínimo 60) · al ritmo de esta semana alcanza 8 noches" (o "agotado" en rojo) y "Reponer" con borde.
- **Catálogo y lo que más salió:** desde `lg`, lado a lado (3 a 2). El catálogo es una fila por producto con el precio y el stock en palabras ("Stock 252 · mín 100", "Quedan 55" en ámbar, "Agotado" en rojo, "No lleva stock", "Pausado") y Reponer, Editar y "⋯" sin borde; en el teléfono esos dos pasan al menú. "Lo que más salió" son los 8 que más plata hicieron, con una barra `primary` sobre `muted`, "48 u · $336.000", el total arriba y los chips de 7 y 30 días; el resto, detrás de "Ver los otros N".
- **Movimientos de stock:** plegado, una tarjeta más al pie.
