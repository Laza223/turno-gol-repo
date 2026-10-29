---
version: 1
slug: "src-app-admin-reservas"
primary_target: "src/app/(admin)/reservas"
related_targets: []
---

# Agenda (src/app/(admin)/reservas)

Spec visual vigente de la pantalla. Vivía en DESIGN.md › Components y se movió acá el 2026-10-29 sin cambios de contenido, para que DESIGN.md quede con lo que comparten todas las pantallas (tokens, reglas y componentes compartidos), que sigue mandando sobre esto. Esta pantalla todavía no tiene brief de `shape`.

## Agenda

`/reservas`, que en pantalla se llama Agenda desde el 2026-09-25 (la URL no cambió). Es un buscador con la lista de turnos, para contestar el WhatsApp ("¿a qué hora tenía?", "cancelá lo mío"); no se cobra desde acá, cobrar es de Hoy.

- **Barra superior:** "Grilla | Agenda", el buscador (nombre, teléfono o nº de reserva), "Próximos | Pasados" y la cancha. Próximos y pasados se cortan por el instante de fin: lo que se está jugando es próximo; lo que terminó hoy ya es pasado.
- **Chips:** Todos · Esperando seña · Ausentes · Cancelados. "Todos" no muestra cancelados ni expirados.
- **Lista:** una sola, a todo el ancho, agrupada por día con encabezado pegajoso ("Hoy · viernes 25 de septiembre"). Cada renglón es un link al detalle: hora (con "Se juega" en verde si está en juego), cancha, nombre y teléfono, un chip neutro de tipo (Fijo, Evento · N h) y una sola lectura de la plata a la derecha, con el mismo color que la Grilla. En el teléfono, dos renglones.
