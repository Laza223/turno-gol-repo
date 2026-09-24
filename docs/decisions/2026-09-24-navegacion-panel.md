# Navegación del panel: una pregunta por pantalla, y Hoy no se toca

**Fecha**: 2026-09-24 · **Estado**: aprobada por el dueño; paso 1 mergeado (#363), paso 2 mergeado (#364), paso 3 implementado · **Decide**: el dueño
(qué) + esta sesión (cómo) · **Marco**: refinamiento del panel sobre el estilo actual (`DESIGN.md`),
sin tocar lógica, Server Actions, consultas ni schema.

## Origen

- La mirada del founder (`docs/rediseno-panel/insumos.md` §1, punto 2): "Hoy, Grilla, Reservas y
  Caja se pisan: no queda claro dónde se hace cada cosa".
- La crítica del 2026-09-23 (`.impeccable/critique/2026-09-23T21-25-51Z__src-app-admin.md`, P1):
  el mismo trabajo vive en cuatro lugares.

Contado en el código al 2026-09-24:

- un turno se cobra en 4 lugares: el modal de Hoy, el panel lateral de la Grilla, el botón
  "Cobrar" de cada fila de Reservas (`CompleteBookingDialog`) y la página del turno;
- se vende en 2 pantallas: la columna o el botón de Hoy, y Caja › Vender (el mismo `TicketPanel`);
- el día por cancha aparece en 3 vistas: el tablero de Hoy, la matriz de la Grilla y el tablero
  por cancha de Reservas (Hoy y Próximas).

## Qué se decide

1. **Cada pantalla contesta una sola pregunta.**

   | Pantalla          | Contesta                           | Qué se hace ahí                                        |
   | ----------------- | ---------------------------------- | ------------------------------------------------------ |
   | Hoy               | ¿Qué plata falta esta noche?       | cobrar lo que terminó, vender, ver qué se juega        |
   | Grilla            | ¿Hay lugar?                        | cualquier día: ver, cargar, mover, cancelar            |
   | Grilla › Reservas | ¿Dónde está el turno de Pérez?     | buscar por nombre o teléfono, próximas, historial      |
   | Caja              | ¿Cuánto entró y qué quedó colgado? | Cuentas (deudas, devolvés, diario del día) y Productos |

2. **Hoy no se toca.** El dueño lo quiere como está; el resto se ordena alrededor.
3. **Reservas es una lista.** Las tres pestañas (Hoy · Próximas · Historial) muestran la misma
   lista paginada, en dos columnas desde `lg`. Hoy se agrupa por cancha, que es el orden que ya trae
   la consulta; Próximas e Historial, por fecha, con la cancha en cada fila. Sale el tablero por cancha (`CourtBoard`
   y su consulta `listTenantBookingsForBoard`): repetía Hoy y la Grilla, y con 7 o 10 canchas dejaba
   media pantalla afuera (roce registrado en `docs/gtm/ejecucion/10-aprendizajes.md`).
4. **El "Volver" de la página de un turno vuelve a donde estabas** (Hoy, Cuentas, la ficha de un
   cliente o Reservas). Sin historial (pestaña nueva, push) cae en `/reservas`. Límite asumido: si
   alguien llega al detalle desde un link externo en la misma pestaña, "Volver" lo devuelve a ese
   sitio; el navegador no deja saber si la entrada anterior era del panel.
5. **Vender vive solo en Hoy.** Sale la pestaña Vender de Caja; `/caja/cantina` pasa a llevar a Hoy.
   No se agrega un botón Vender en la Grilla (el dueño lo descartó).
6. **Caja queda en Cuentas · Productos** y abre en Cuentas tal como está hoy.
7. **Tocar un turno en la Grilla abre el modal de Hoy.** Se borra el panel lateral de la Grilla. Al
   modal le falta "Liberar bloqueo" (Hoy no muestra bloqueos): se le agrega solo para bloqueos, así
   que en Hoy no cambia nada de lo que se ve.

## Qué se reabre

- **`2026-09-19-hoy-cobrar-y-vender.md`, decisión 3** ("el modal es solo de Hoy: el panel de la
  grilla queda como está"): deja de valer con el punto 7.
- **`2026-09-12-rediseno-caja-tres-destinos.md`**: Caja pasa de tres destinos a dos (punto 5).

## Botones de cada fila de Reservas (decidido el 2026-09-24)

El plan sacaba los botones de cada fila de Reservas (Cobrar, Ausente, Cancelar, Confirmar pago)
porque "la fila abre el turno y ahí están". Eso era falso para "Confirmar pago": confirmar a mano
una seña pendiente (`confirmDepositPaymentAction`) solo se podía desde esos botones
(`QuickActions.tsx`). Ni la página del turno ni el modal de Hoy lo ofrecían.

**Decisión del dueño (opción c, dentro del paso 3):** la seña se cobra desde el modal y desde la
página del turno, con un botón **"Cobrar seña $X"** en la parte de cobro. Recién entonces se sacan
los botones de las filas de Reservas.

## Orden de trabajo

Un PR por paso, de menos a más riesgo:

1. Reservas es una lista y el "Volver" vuelve a donde estabas (puntos 3 y 4).
2. Caja sin Vender (puntos 5 y 6). En ese PR se actualizan `.claude/rules/caja.md` y `CLAUDE.md`
   ("Caja son 3 destinos").
3. La Grilla abre el modal de Hoy (punto 7). Además, "Cobrar seña $X" en el modal y en la página
   del turno, y se sacan los botones de las filas de Reservas (ver arriba). Hay que revisar ahí cómo
   se lee en el modal un turno de otro día, porque el modal se hizo pensando en esta noche.

## Lo que no se toca

Hoy; el riel y la barra del celular (mismos ítems y mismo orden); Clientes, Canchas y Ajustes. Tampoco
el anillo rojo del turno sin cobrar ni el rojo de "deuda" en Cuentas: son trabajos aparte.
