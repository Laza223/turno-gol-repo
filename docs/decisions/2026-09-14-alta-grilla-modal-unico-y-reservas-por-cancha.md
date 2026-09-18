# Alta desde la grilla: modal único por tipo · Reservas por cancha

**Fecha:** 2026-09-14 · **Decide:** dueño · **Estado:** vigente
**Origen:** FRICCIÓN del founder en `docs/gtm/ejecucion/10-aprendizajes.md` (2026-09-14)
**Ledger:** `docs/planning/2026-09-14-alta-grilla-y-reservas-ledger.md`

## Problema

1. Un torneo nocturno de 3 h o una escuelita con precio arreglado **no se podían cobrar**: el modal convertía todo lo que pasaba de 1 hora en `type='block'` ("Bloquea la cancha (no se cobra)"). Una cancha ocupada y con precio quedaba sin forma de cobrarse. El mismo modal además dejaba cargar una seña sobre un bloqueo ("Otro" > 1 h) y un precio sobre un bloqueo interno, que después sumaba en "Por cobrar hoy" sin botón para cobrarlo.
2. La grilla abría un **popover de alta rápida** y escondía el modal completo detrás de "Más opciones", con chips mezclados, "Opciones avanzadas" y avisos en ámbar. El jugador reserva online; el admin abre la grilla para cargar lo que NO entró online, así que la velocidad no es el cuello: lo es que el alta sea completa y se entienda.
3. `/reservas` repetía "Reservas" en un hero bajo `[Grilla|Reservas]`, desperdiciaba los costados (`max-w-7xl`), tenía dos filas de chips y **apilaba las canchas**: la Cancha 1 cargada empujaba a la 2 fuera de la vista, y con 8 canchas había que scrollear hasta el fondo.

## Decisiones

- **D1 — Evento de N horas, cobrable.** El staff puede agendar una reserva `type='spontaneous'` de N horas enteras (≥ 60, múltiplo de 60) con **precio total**: sugerido = suma de la tarifa de cada hora (`priceForRange`), editable, o **"No se cobra"** (precio 0). Se cobra con el Cobrar/seña que ya existen. Sin migración: el nombre del evento va en `guest_name`, como antes.
  - La reserva **online** y la **reprogramación** siguen estrictas en 60 min (`assertSlotDuration` intacto). Un evento de más de 1 h no ofrece "Reprogramar" y el servidor lo rechaza (`multi_hour_event`). Alcanza también a una sesión de abonado de más de 1 h: antes se "movía" recortándola a 60 min y conservando el precio de las N horas, un error de plata silencioso; ahora se cancela y se vuelve a cargar.
  - Límite asumido: una fila no cruza las 24:00 (`chk_time_valid`).
  - No es el módulo "profesores/escuelitas" de la kill list del freeze (no hay alumnos, profes ni cuotas): es un circuito de plata roto.
- **D2 — Un `block` nunca carga plata.** El schema rechaza precio y seña en un bloqueo, las acciones de cobro rechazan `block`/`tournament`, y "Por cobrar hoy" ignora bloqueos.
- **D3 — Modal único con 4 tipos.** Tocar un casillero libre abre directo el modal (se elimina el alta rápida). Primero "¿Qué vas a agendar?": **Turno** (1 h), **Turno fijo** (abonado semanal, reusa `createAbonadoAction` precargado con cancha/día/hora), **Evento** (varias horas) y **Bloquear cancha** (sin plata ni contacto). Regla de lectura: alguien usa la cancha → Turno/Fijo/Evento; nadie puede usarla → Bloqueo. Grande en escritorio con resumen fijo y botón que dice verbo + monto; pantalla completa en el teléfono. Reemplaza la regla "2 interacciones" de `pages/grilla.md` v2.0: el caso común (Turno) sigue siendo click → nombre → Enter.
- **D4 — Reservas por cancha.** `/reservas` sin hero y a ancho completo; los controles (Hoy/Próximas/Historial, búsqueda, Filtros) suben a la barra superior; Estado y Cancha pasan a un popover "Filtros". Hoy y Próximas se ven en **columnas por cancha**, cada una con su scroll; con muchas canchas se desliza horizontal. Historial sigue como lista. Se elimina el toggle de densidad. *Nota 2026-09-17 (dueño): en escritorio, desde la sexta cancha el tablero baja a dos filas parejas en vez de deslizarse; el deslizamiento queda para el teléfono y para 11+ canchas. Ver `docs/spec/design-system/pages/reservas.md` §4.*

## Descartado

- **Turnos de 1 h encadenados** para un evento: respeta la regla de 60 min, pero obliga a cobrar 3 veces una escuelita.
- **Bloqueo con precio**: mezcla "la cancha no se puede usar" con "alguien la paga", y el bloqueo se libera con DELETE físico, que choca con la FK de `cash_flows`.
- **Tipo nuevo `event` en el enum**: migración + visuales + filtros de reportes para lo mismo que ya resuelve `spontaneous`.
