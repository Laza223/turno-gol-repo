# Hoy (dashboard admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general) y a `gramatica-interaccion.md` (Fase 0). Acá viven
> las decisiones específicas de `/dashboard` (label de nav: **Hoy**, renombrado en Fase 2 desde
> "Inicio"). Contrato de ejecución original: `docs/planning/2026-08-01-decisiones-de-fase-v2.md`
> §3 Fase 2; taxonomía de alertas: `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md`.
>
> **Versión 5 — 2026-09-19 (Hoy pasa a ser la pantalla del mostrador).** Decisión del dueño, a
> partir de lo que vio en un cliente real: `docs/decisions/2026-09-19-hoy-cobrar-y-vender.md`.
> Cambia el principio de la pantalla: **Hoy ya "es una pantalla de hacer"**. (a) "Próximos
> turnos" pasa a **"Turnos de hoy"**: cada fila es un botón que abre un **modal de cobro** en la
> misma pantalla (todo junto, por equipo, por jugador, cantina, ausente, editar, reprogramar,
> cancelar), sin navegar a `/reservas/[id]`; (b) el turno terminado sin cobrar deja de ser una
> alerta y pasa a ser una fila del tablero (una cosa, un lugar); (c) Hoy se refresca solo cada
> minuto; (d) el Encargado también la ve (checklist y tour siguen siendo del dueño); (e) **"Vender"**:
> la venta de cantina de Caja (el mismo ticket, stock y fiado) queda a mano en una columna fija a
> la derecha desde 1280 px, y en un diálogo abierto por un botón "Vender" debajo (§2b).
>
> **Versión 4 — 2026-09-12 (bajada del handoff de Claude Design).** Cuatro cambios de forma,
> ninguno de dato: (a) la banda `PageHeader` se fue y la fecha cuelga del hueco de la barra
> superior, como ya hacían Grilla y Configuración (MASTER §6.8); (b) "Necesita tu atención" sube
> al primer lugar y su vacío pasa de una tarjeta de 200 px a una línea de 44 px; (c) "Próximos
> turnos" pasa de lista apilada a una columna por cancha en escritorio, con pliegue a 4 turnos;
> (d) "Mientras no estabas" llega plegado detrás de un resumen contado. La propuesta y su
> razonamiento están en el proyecto de Claude Design "Tablero Hoy con propuesta de rediseño".
>
> **Versión 3 — 2026-09-10 (H010, auditoría de coherencia).** Las tarjetas "Cobrado hoy" y
> "Deudas" salieron: eran el mismo componente con el mismo dato que Caja muestra un click más
> allá. Entró "Próximos turnos" por cancha, y la ocupación pasó a ser su subtítulo. La decisión
> del dueño está en `docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md` §10.

## §0 Objetivo y principio de lectura

**El mostrador responde "¿qué falta cobrar y qué viene?" y lo resuelve sin salir de la pantalla.**
Es la primera pantalla al entrar cada día, la ven el dueño y el Encargado, y a las 17:00, con el
cliente parado enfrente, se lee en 8 segundos y se cobra en dos toques. Tres bloques, ni uno más:

1. **"Necesita tu atención"** → SOLO las anomalías de la taxonomía cerrada (seña rechazada,
   devoluciones pendientes), cada una con su acción al lado. Vacío = el premio: "Nada pendiente.
   Sin señas rechazadas ni devoluciones por resolver.", en una línea.
2. **"Turnos de hoy"** → cancha por cancha: lo que **falta cobrar** (arriba, siempre visible), lo
   que se está jugando y lo que viene. Cada fila abre el modal de cobro. La ocupación del día es
   el subtítulo del bloque, no una tarjeta aparte.
3. **"Mientras no estabas"** → el feed de lo que pasó sin el dueño (reservas online,
   cancelaciones, señas acreditadas).

Anti-objetivo explícito: **cero gráficos**. Un gráfico es una herramienta de análisis; Hoy es un
parte de situación que además permite actuar. El análisis vive en `/analiticas` (solo del dueño).
La plata acumulada y lo que te deben viven en Caja; acá se cobra el turno concreto, con el mismo
flujo de siempre (misma Server Action, mismo saldo).

**Se reabrió una decisión.** Hasta la v4 Hoy "no era una pantalla de hacer" y la venta rápida se
había descartado (`docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md` §10). Un
cliente real mostró que el mostrador cobra desde acá; la condición de aquella vez se respeta: nada
de una segunda caja, todo entra por el flujo real (mismo saldo, mismo stock, mismo fiado).

## §1 Anatomía

```
 COMPLEJO EL POTRERO │ vie 12 de septiembre                       ← barra de 60px (AdminHeaderSlot)
┌──────────────────────────────────────────────────────────────┐
│ Necesita tu atención                          2 pendientes   │  (§3) primero SIEMPRE
│ ▌(x) Lucas Benítez · Cancha 3          [Ver reserva]        │  ámbar = plata trabada
│ ▌ ↩  2 devoluciones pendientes · $ 24.000  [Ver devoluciones]│
│      La más vieja, hace 6 días                               │
├──────────────────────────────────────────────────────────────┤
│ ⚙ Configuración · 4 de 7  ▓▓▓▓▓░░  · pendientes accionables  │  solo si falta setup (§5)
├──────────────────────────────────────────────────────────────┤
│ Turnos de hoy              15 de 36 · 42% de ocupación        │  (§2) una COLUMNA por cancha
│ Cancha 1          │ Cancha 2        │ Cancha 3    │ Cancha 4   │
│▌19:00 Falta $48.0 │▌20:00 Falta $60.│ 19:00       │ Libre el   │  rojo = terminó y falta plata
│ P. Ruiz  [Cobrar] │ A. López [Cobrar]│ J. Molina   │ resto del  │
│ Terminó hace 5 min│ Terminó hace 12 │             │ día.       │
│ 21:00      Ahora  │ 21:00      Ahora│             │            │  la única fila teñida
│ D. Sosa   Pagado  │ T. García Falta │             │            │
│ 22:00  en 55 min  │                 │             │            │
│ M. Gil   Señada   │                 │             │            │
├──────────────────────────────────────────────────────────────┤
│ Mientras no estabas  2 reservas online · 1 seña · 1 cancel. ⌄│  (§4) plegado
└──────────────────────────────────────────────────────────────┘
```

Root: `space-y-4` dentro del `<main>` del shell (que ya da `max-w-[1600px] px-4 py-8`). Sin `<main>`
propio (el shell ya lo es).

- **Sin banda de encabezado.** La `PageHeader` que esta vista tenía salió en la v4: costaba
  ~110 px de la primera pantalla en 375 px para decir lo que el riel ya dice. El título "Hoy" se
  lee en el riel; lo que cuelga del hueco (`AdminHeaderSlot`, `HoyHeaderSlot.tsx`) es **la fecha
  del día operativo**, que sí es dato de la vista — el equivalente de la tira de semana en la
  Grilla. Al hueco NO va un `<h1>`: MASTER §6.8 lo prohíbe explícitamente y es la fila que el
  rediseño del armazón vino a eliminar. El `<h1>Hoy</h1>` sobrevive `sr-only` en el contenido,
  para el esquema de encabezados y los lectores de pantalla.
- **Una sola acción en el header, debajo de `xl`**: el botón "Vender" (§2b). Desde `xl` la venta es
  una columna y el botón se oculta. Reservar sigue viviendo en la Grilla.

## §2 "Turnos de hoy" — una columna por cancha

Componentes: `src/components/dashboard/TodayBoard.tsx` (presentacional), con la lógica de qué fila
cae en cada bloque en `src/lib/dashboard/today-board.ts` (`buildTodayBoard`, función pura con test),
montado por `dashboard/_components/HoyShell.tsx`. Datos: el **mismo loader que la Grilla**
(`listDayGridBookings`, `reservas/queries.ts`): el "falta cobrar" de cada fila sale de
`summarizeBookingCharges`, el número de la Grilla, del detalle y de Deudas. La ocupación sigue
saliendo de `getHoyData`.

- **Una COLUMNA por cancha `online`**, en el orden de la Grilla (`courts.created_at`), con
  `auto-fill minmax(232px, 1fr)` (con siete canchas un reparto fijo daría columnas de 160 px) y el
  separador de 1 px **por borde, no por fondo** (`-ml-px -mt-px` + `border-l border-t`; en tema
  oscuro `card-premium` es translúcido y unas columnas `bg-card` sólidas se ven como parches).
  Una cancha **pausada** entra solo si le quedó un turno **sin cobrar** hoy, y se muestran solo
  esos, con el rótulo "Pausada": en una cancha pausada no se juega, pero la plata de un turno que
  ya se jugó sigue siendo plata.
- **Tres tipos de fila**, en este orden dentro de cada cancha:
  1. **Sin cobrar** — terminó y falta plata (`confirmed` que terminó, o `completed`, con saldo;
     nunca un bloqueo ni una hora de torneo). Borde rojo, "Falta $X" en rojo, el aviso "Cobrar" y
     "Terminó hace N min" (más "Pagaron 4 de 10" si ya entró algo). **Van fijas arriba y nunca
     quedan detrás de "Ver N más"**: esconder plata que falta es lo que el tablero vino a evitar.
  2. **En juego** — la **única fila teñida** (Von Restorff, MASTER §9; teñir todas dejaría la
     pantalla sin foco y apagar las otras rompe AA §2.4). Dice "Falta $X", "Pagado" o el avance.
  3. **Próximos** — hora, "en N min" si arranca dentro de la hora, nombre y el badge de siempre
     (`bookingBadgeVisual`, ícono + texto + tono: el color nunca comunica solo).
  Salen del tablero: los terminados y pagados, los ausentes, los bloqueos y los cancelados.
- **"Ya terminó" sale de `bookings.ends_at`**, el instante físico que también valida el servidor,
  y no de la hora de pared: `time_end='24:00'` y los slots de madrugada de un complejo
  `closes_next_day` hacen que comparar strings de hora dé la respuesta equivocada
  (`slotHasPassed`, `operating-day.ts`). Orden por `starts_at`: 00:00–01:00 va después de 23:00.
- **Cada fila es UN botón** (`aria-haspopup="dialog"`, 44 px) que abre el modal — nunca un link a
  otra pantalla. El reloj (`nowMs`) lo lleva `HoyShell`: se recalcula cada 30 s sin volver al
  servidor, y `max(reloj del cliente, hora del servidor)` no retrocede tras una revalidación.
- **Máximo 4 filas visibles por cancha** sin contar las sin cobrar; el resto detrás de "Ver N más".
- **Cancha sin turnos**: "Libre el resto del día." — se dice, no se deja en blanco.
- **Subtítulo del bloque = la ocupación**: `9 de 12 · 75% de ocupación` (+ ` · N bloqueados`).
- **Vacíos**, en orden de precedencia: (con filas se muestra el tablero aunque el día figure
  cerrado: hay plata) → día cerrado → ninguna cancha en servicio (con link a `/canchas` **solo
  para el dueño**; al Encargado, "Pedile al dueño que active una") → "No queda nada por jugar ni
  por cobrar hoy.".

### El modal de cobro

Componentes: `dashboard/_components/HoyChargeModal.tsx` y `HoyChargeSection.tsx`. Un solo `Dialog`
(no un panel lateral ni una hoja desde abajo: `ui/dialog` va anclado arriba en el teléfono porque
en iOS el teclado tapa un formulario anclado abajo). El panel de la Grilla **no cambia**.

```
Juan Pérez                                   ⋯   ✕
Cancha 2 · 20:00–21:00 · Terminó hace 4 min
────────────────────────────────────────────────
Falta cobrar  $ 48.000
Precio $60.000 · Cobrado $12.000     Pagaron 4 de 10
────────────────────────────────────────────────
¿Cómo pagan?  [Todo junto] [Por equipo] [Por jugador]
  Todo junto  → monto precargado + medio + "+ pago dividido"
  Por equipo  → Equipo 1 $24.000 [medio] [Cobrar] / Equipo 2 …   (Equipo 1 ✓ cuando pagó)
  Por jugador → [medio] [ Pagó uno — $6.000 ]
[        Cobrar $48.000 y dar por jugado        ]   (solo en "Todo junto")
────────────────────────────────────────────────
[Cantina]  [Marcar ausente]        (⋯: Editar · Reprogramar · Cancelar reserva)
```

- **Cobra por el mismo hook que la Grilla** (`useSlotCharges`): misma Server Action por modo
  (`settle`/`finish`/`advance`), misma clave de idempotencia. Las tres formas cambian cómo se arma
  el cobro, no el cobro.
- **Se queda abierto después de cobrar.** Cobrarle a diez jugadores es tocar "Pagó uno" diez veces,
  no abrir y cerrar diez paneles. Cuando no falta nada aparece "Cobrado ✓" y "Listo".
- **Nada se toca hasta que llegan los datos nuevos.** Mientras hay un cobro en curso o la pantalla
  se refresca (`isPending || isRefreshing`), los controles de cobro están apagados: el segundo
  cobro nunca sale con el saldo viejo, y tras "dar por jugado" el modo pasa de `finish` a `settle`
  con la clave rotada. Tampoco se puede cerrar a mitad de un cobro.
- **Qué pestaña abre** (`chargeTabs`): si ya pagó un equipo, "Por equipo"; si ya pagó parte de la
  gente, "Por jugador"; si no, "Todo junto". "Por jugador" solo si se sabe la capacidad de la
  cancha; "Por equipo" solo mientras lo cobrado no pase de la mitad.
- **"Equipo 1 ✓" es una deducción, no un registro** (`teamDues`): la mitad se calcula sobre lo que
  se cobra en el mostrador (precio menos seña) y lo ya cobrado se le cuenta a Equipo 1 hasta
  completar su mitad. El sistema no guarda quién pagó cada peso (veto de texto libre / Ley 25.326).
- **El modal lee el turno de la lista completa del día**, no del tablero filtrado: un turno que se
  termina de pagar sale del tablero pero el modal sigue abierto mostrando "Cobrado ✓". Si el turno
  desaparece de la lista (se canceló, se pasó a otro día), el modal se cierra solo.
- **Acciones**: las decide `slotGates` (compartido con el panel de la Grilla, así las dos
  pantallas no discrepan) y el cancelar usa `SlotCancelDialog` con sus avisos de reembolso. Marcar
  ausente cierra el modal (el "Deshacer" queda en el aviso).
- **La cantina no se suma a la cuenta del turno**: se cobra aparte, como siempre.

### 2b. Vender: la venta de Caja, a mano

Componentes: `dashboard/_components/VenderProvider.tsx` (estado + diálogo), `VenderRail.tsx` (la
columna) y el botón en `HoyHeaderSlot.tsx`. Reusan `TicketPanel` de `/caja/cantina` tal cual —
mismo stock, mismo ledger, mismo fiado, mismas Server Actions (`sellTicketAction`,
`createTabAction`) —: **no es una segunda caja**, que era la condición con la que en 2026-09-09 se
había descartado la venta rápida. El catálogo sale de `listProducts`, en la misma transacción.

- **Desde `xl` (1280 px)**: Hoy pasa a dos columnas, `xl:grid-cols-[minmax(0,1fr)_380px]`. A la
  derecha, `VenderRail`: `TicketPanel layout="rail"` — UNA columna (catálogo arriba, con techo
  propio, y el ticket siempre a la vista debajo), **sin foco automático** (el buscador no le
  roba el foco a quien está cobrando un turno al lado) y sin la barra de cobro pegada abajo del
  teléfono. Va `sticky`, sin card alrededor (el catálogo y el ticket ya traen filete propio).
- **Debajo de `xl`**: la columna se oculta por CSS (`hidden xl:block`) y en la barra superior
  aparece "Vender" (`xl:hidden`), que abre el mismo ticket en un `Dialog` (`layout="dialog"`). Por
  CSS y no con `useIsDesktop`: ese hook responde `true` en el servidor y durante la hidratación, y
  haría nacer la columna en el teléfono.
- **En el teléfono no cambia el orden de lo demás**: la venta nunca se apila arriba ni abajo del
  tablero.
- **El diálogo se monta al abrirse** (ticket limpio en cada apertura) y **mientras está abierto la
  columna no se renderiza**: dos `TicketPanel` a la vez repetirían los ids del buscador y del
  método de pago. Por eso el estado vive en un proveedor: lo comparten el botón (que cuelga de la
  barra por un portal), el diálogo y la columna.
- La venta es para el dueño y el Encargado: Caja es de los dos.
- **Qué NO hace**: no suma la cantina a la cuenta de un turno (eso sigue siendo "Cantina" adentro
  del modal del turno, que carga el consumo al turno); la venta suelta es una venta suelta.

### Refresco automático

`HoyShell` llama a `router.refresh()` cada 60 s, solo si la pestaña está a la vista y **nunca con
un modal abierto** (revalidar por debajo de alguien que tipea un monto le cambia el saldo). Al volver
a la pestaña refresca enseguida. Sin esto "Terminó hace N min" queda viejo y no aparecen las
reservas online nuevas en una pantalla que se deja prendida todo el día. Ninguna acción de cobro
revalida `/dashboard`: el patrón del repo es `router.refresh()` explícito.

Lo que **no** está acá, a propósito (H010): "Cobrado hoy" y "Deudas" viven en el encabezado de
Caja con la misma fuente única de siempre (`summary.collected`, `getStreetMoney`).

## §3 "Necesita tu atención" — taxonomía cerrada

Fuente de verdad: `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md` (3 eventos v1) más las
enmiendas. **Dos** eventos vivos, en este orden de prioridad (`ATTENTION_PRIORITY` en
`home.lib.ts`), y dentro de cada prioridad por antigüedad ascendente:

1. **Devoluciones pendientes** — UN ítem agregado ("N devoluciones pendientes · $X"), tenant-wide
   y sin filtro de fecha: una devolución que se debe hace una semana se sigue debiendo hoy.
   "Ver devoluciones" → `/caja/cuentas`.
2. **Seña que falló** — inmediato. "Ver reserva" → `/reservas/[id]`.

**El turno terminado sin cobrar YA NO es una alerta** (2026-09-19): vive en el tablero "Turnos de
hoy" (§2), que es donde se cobra. Una cosa, un lugar.

**"Caja de ayer sin cerrar" tampoco existe.** Cayó con la eliminación de "Caja del día"
(`docs/decisions/2026-09-11-eliminar-caja-del-dia.md`): ningún movimiento de plata se bloquea por
caja cerrada, así que no hay nada que avisar. `AttentionItem` tiene dos kinds y el servicio emite
dos. La lista sigue siendo cerrada: un evento nuevo pasa primero por el documento de taxonomía.

Componente: `src/components/dashboard/NeedsAttention.tsx`. Cada fila lleva **el color del estado
de la plata**: `warning` cuando la plata está trabada — la que hay que devolver y la seña que el
jugador no llegó a pagar (el rojo de "falta cobrar" pasó al tablero). El tinte y el borde izquierdo de 3 px salen de
`TONE_TINT`/`TONE_BORDER`, el ícono en halo de `TONE_BADGE`, y el botón de acción mide 44 px
(ancho completo en 375 px, a la derecha de `sm` para arriba).

El segundo renglón dice **desde cuándo** (`relativeTimeEs` sobre `since`, el mismo helper de
`/caja/deudas` y `/caja/devoluciones`): "Seña rechazada · hace 2 h". Es lo que separa lo que
recién pasó de lo que se está yendo hace seis horas.

**Vacío = el premio** (verbatim, nunca parafraseado): _"Nada pendiente. Sin señas rechazadas ni
devoluciones por resolver."_ (Decía "Todo cobrado y cerrado" hasta el 2026-09-19: con el turno sin
cobrar fuera de este bloque, esa frase habría mentido.) Desde la v4 es **una línea de 44 px** con tono `success` y `role="status"`, no un
`EmptyState` de 200 px: es el estado en que el dueño encuentra la pantalla casi siempre, y con ese
alto empujaba el tablero fuera de la primera pantalla del teléfono. Sin ítems no se dibuja ni el
título del bloque — el copy se explica solo. Una cuarta alerta NO se agrega sin pasar primero por
el documento de taxonomía (evita degenerar en bandeja de notificaciones, el objetivo explícito de
la Fase 2).

## §4 "Mientras no estabas"

Feed de lo que pasó sin el admin — momento-magia del producto ("el sistema vendió por vos"):

- **Reserva online entrante**: `bookings` creadas sin staff (`created_by_staff IS NULL`) hoy.
- **Cancelación**: `canceled_by IN ('player','system')` hoy (excluye lo que el propio staff
  canceló — no hace falta avisarle de su propia acción).
- **Seña acreditada**: `payments` tipo `deposit`, `status='approved'`, `processed_at` hoy.

Orden: más reciente primero (es un feed de lectura, no una cola a resolver — a diferencia de
"Necesita tu atención", que ordena por prioridad). Componente:
`src/components/dashboard/WhileYouWereAway.tsx`. Vacío: "Nada nuevo desde la última vez." (copy
liviano, sin la carga simbólica del vacío-premio de §3 — acá no haber pasado nada no es un logro,
es solo información).

**Plegado desde la v4.** El encabezado es el botón y ya contesta sin desplegar nada: "2 reservas
online · 1 seña acreditada · 1 cancelación", contado sobre los propios ítems (sin query nueva).
Arranca abierto en escritorio, donde sobra lugar, y cerrado en teléfono, donde es el bloque que
menos urge y el que más alto ocupa. Sin eventos el botón queda `disabled` y no se monta lista, así
que el `aria-controls` se omite en vez de apuntar a un id inexistente.

**Mientras el usuario no tocó el botón, el default lo decide CSS** (`hidden lg:block`), no el
estado de React: `useIsDesktop` responde `true` durante el render del servidor y toda la
hidratación, así que derivar de él el `display` haría que en el teléfono la lista naciera abierta y
se plegara sola un frame después. El estado sólo entra en juego a partir del primer toque.

## §5 Checklist de configuración — sin cambios de Fase 2

Se mantiene tal cual (Zeigarnik: pendientes visibles, completados plegados) — ver historial
pre-Fase 2 de este documento en git. Fase 2 no lo tocó.

## §6 Copy (§8 de MASTER.md es normativa)

- "Inicio" → **"Hoy"** (nav y `PageHeader`, Fase 2).
- Plata SIEMPRE `formatArs`. Fecha del header formato medio §8.3; ISO prohibido cara al usuario.
- El vacío de "Necesita tu atención" es TEXTO EXACTO — no parafrasear ni "mejorar".
- Voseo verbo-primero en acciones ("Cobrar $X", "Pagó uno", "Ver reserva").

## §7 Layout y responsive

- Los bloques apilan a ancho completo (`space-y-4`), en este orden: **Necesita tu atención**,
  checklist de configuración (solo dueño, si corresponde), Turnos de hoy, Mientras no estabas.
- **Por qué las alertas van primero** (cambio de la v4): son el único bloque que exige hacer algo
  y estaban en el medio de dos bloques de lectura, justo lo que MASTER §9 (serial position) dice
  que no — lo crítico va primero o último, nunca en el medio. A las 17:00, con el cliente parado
  en el mostrador, el botón de cobrar aparecía recién después de scrollear el tablero entero.
  Vacío el bloque mide una línea de 44 px, así que no le roba lugar al tablero en los dos momentos
  del día en que no hay nada pendiente.
- "Turnos de hoy" en 375px: las columnas apilan a una sola; el rango horario en
  `whitespace-nowrap` para que "18:00–19:00" no se parta al medio. El modal se ancla arriba y ocupa
  `calc(100% - 2rem)`.
- "Necesita tu atención" en 375px: el botón de acción toma el ancho completo en su propio renglón
  (vía el `flex-wrap` de la fila) y mantiene los 44 px.
- "Mientras no estabas": el encabezado-botón mide 48 px y cada fila del feed, 44.
- Sin scroll horizontal en ningún viewport.

## §8 Motion

- Hover-lift heredado de `card-premium-interactive`/`card-entrance` (≤200ms), igual que el resto
  del admin. Nada de pulsos ni Realtime (v1: Realtime es solo de la grilla): Hoy es server-render
  y se refresca con `router.refresh()` cada 60 s (§2).

## §9 Accesibilidad

- Cada turno de "Turnos de hoy" es un botón con el texto completo (hora, nombre, estado y, si
  falta plata, cuánto) como nombre accesible; abre un `dialog` con foco atrapado y Escape.
- `tabular-nums` en todo número.
- Color nunca solo: las alertas llevan ícono + texto, no solo un tinte ámbar.
- Focus visible en todas las filas/links (ring token, heredado).

## §10 Datos (server, sin client fetch)

- **Dos fuentes, una transacción**: `getHoyData(tenantId, tx, opts)`
  (`src/modules/home/home.service.ts`) agrega en paralelo `getDaySummary` (lo consume el resumen
  diario D8, la pantalla ya no lo pinta), la ocupación (una query de bookings + una de courts;
  reusa `daySlotsFor` y `occupancyForDay` de `day-bookings.ts`), `countPendingRefunds` y las
  queries de alertas y del feed. El **tablero de turnos** sale de `listDayGridBookings` (el loader
  de la Grilla, `reservas/queries.ts`) y `listCourts`, en la misma transacción. Ya no se llama a
  `getStreetMoney` desde Hoy (era la query más pesada y nadie leía su total).
- `HoyData` ya no trae `upcoming` ni `streetMoneyCents`. El worker D8 lee `collectedTodayCents` y
  `occupancy`.
- `date` = día operativo (`operatingDateOf`/`nightCutoffMins`, mismo criterio que el resto del
  admin — nunca UTC calendario puro).
- `getChecklistState` se mantiene tal cual (sin cambios de Fase 2).
- Nada de Realtime: server-render por request y `router.refresh()` cada 60 s (§2).

## §11 Deuda conocida / fuera de scope

1. **Madrugada operativa**: a las 00:30 la pantalla muestra el día operativo en curso, no un
   corte de medianoche calendario — comportamiento correcto, mencionado acá para que no se lea
   como bug (mismo criterio que `grilla.md`).
2. Sin Realtime en Hoy: el refresco es por intervalo (§2), no en vivo. Un turno cobrado desde otro
   puesto aparece a más tardar al minuto.
3. **Resumen diario (D8)**: push/email fuera de esta pantalla — ver worker
   `src/shared/jobs/workers/daily-summary.worker.ts` y `/settings/avisos` (opt-in de email).
4. `StatCard` ya no se usa en esta pantalla (se fue con las tarjetas de H010); su deuda de
   tokens sigue viva en Caja.
5. **El resumen diario (D8) llega solo al dueño** (`notifyAdminPush(..., { ownerOnly: true })`): trae
   el cobrado y la ocupación de ayer, el mismo tipo de dato que Métricas, que el Encargado no ve.
6. **Sigue pendiente**: `/reservas/[id]`, que quedó atrás del modal (su "+ Agregar cobro" no
   divide por equipo).
