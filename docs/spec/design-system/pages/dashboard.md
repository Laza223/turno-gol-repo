# Hoy (dashboard admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general) y a `gramatica-interaccion.md` (Fase 0). Acá viven
> las decisiones específicas de `/dashboard` (label de nav: **Hoy**, renombrado en Fase 2 desde
> "Inicio"). Contrato de ejecución original: `docs/planning/2026-08-01-decisiones-de-fase-v2.md`
> §3 Fase 2; taxonomía de alertas: `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md`.
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

**El admin responde "¿qué falta jugar y qué tengo que resolver?" en 5 segundos.** Es la
primera pantalla al entrar cada día — se diseña para que Marcelo la abra a las 17:00 al volver al
mostrador, la lea en 8 segundos y sepa qué viene, sin repetirle la plata que Caja ya le muestra
(visión v2 §4.1; H010). Tres bloques, ni uno más:

1. **"Necesita tu atención"** → SOLO las anomalías de la taxonomía cerrada, cada una con su
   acción al lado. Vacío = el premio: "Nada pendiente. Todo cobrado y cerrado.", en una línea.
2. **"Próximos turnos"** → cancha por cancha, lo que falta jugar hoy: hora, quién, estado, y
   "ahora" / "en N min" cuando arranca dentro de la hora. La ocupación del día es el subtítulo
   del bloque, no una tarjeta aparte.
3. **"Mientras no estabas"** → el feed de lo que pasó sin él (reservas online, cancelaciones,
   señas acreditadas).

Anti-objetivo explícito (contrato): **cero gráficos** y **cero plata repetida**. Un gráfico es una
herramienta de análisis; Hoy es un parte de situación. El análisis vive en `/analiticas`; lo
cobrado y lo que te deben viven en Caja, que es donde se cobra. Tampoco es una pantalla de
hacer — no hay accesos rápidos de reservar/vender cantina acá (esos viven en Grilla/Caja; la
venta rápida se descartó a propósito, ver §10 de la spec de la auditoría); la única acción
visible es la que cada alerta de "Necesita tu atención" pide, más el link de cada turno a su
detalle.

## §1 Anatomía

```
 COMPLEJO EL POTRERO │ vie 12 de septiembre                       ← barra de 60px (AdminHeaderSlot)
┌──────────────────────────────────────────────────────────────┐
│ Necesita tu atención                          2 pendientes   │  (§3) primero SIEMPRE
│ ▌(!) Lucas Benítez · Cancha 3 · 16:00-17:00     [Cobrar $X]  │  rojo = plata que falta
│ ▌ ↩  2 devoluciones pendientes · $ 24.000  [Ver devoluciones]│  ámbar = plata trabada
│      La más vieja, hace 6 días                               │
├──────────────────────────────────────────────────────────────┤
│ ⚙ Configuración · 4 de 7  ▓▓▓▓▓░░  · pendientes accionables  │  solo si falta setup (§5)
├──────────────────────────────────────────────────────────────┤
│ Próximos turnos            15 de 36 · 42% de ocupación        │  (§2) una COLUMNA por cancha
│ Cancha 1        │ Cancha 2       │ Cancha 3    │ Cancha 4     │
│ 18:00  en 55min │ 17:00   Ahora  │ 19:00       │ Libre el     │
│ T.García  Señada│ F.Álvarez ▒▒▒▒ │ J.Molina    │ resto del    │
│ 19:00           │ 18:00  en 55min│ 21:00       │ día.         │
│ Los Pibes  Conf.│ A.López  Señada│ S.Torres    │              │
│ [Ver 1 más]     │                │             │              │
├──────────────────────────────────────────────────────────────┤
│ Mientras no estabas  2 reservas online · 1 seña · 1 cancel. ⌄│  (§4) plegado
└──────────────────────────────────────────────────────────────┘
```

Root: `space-y-4` dentro del `<main>` del shell (que ya da `max-w-7xl px-4 py-8`). Sin `<main>`
propio (el shell ya lo es).

- **Sin banda de encabezado.** La `PageHeader` que esta vista tenía salió en la v4: costaba
  ~110 px de la primera pantalla en 375 px para decir lo que el riel ya dice. El título "Hoy" se
  lee en el riel; lo que cuelga del hueco (`AdminHeaderSlot`, `HoyHeaderSlot.tsx`) es **la fecha
  del día operativo**, que sí es dato de la vista — el equivalente de la tira de semana en la
  Grilla. Al hueco NO va un `<h1>`: MASTER §6.8 lo prohíbe explícitamente y es la fila que el
  rediseño del armazón vino a eliminar. El `<h1>Hoy</h1>` sobrevive `sr-only` en el contenido,
  para el esquema de encabezados y los lectores de pantalla.
- **Sin acciones en el header** (desde la v2): Hoy "no es una pantalla de hacer" (contrato §4.1) —
  reservar y vender cantina se sacaron de acá, siguen existiendo en Grilla/Caja tal cual.

## §2 "Próximos turnos" — una columna por cancha

Componente: `src/components/dashboard/ProximosTurnos.tsx`. Datos: `HoyData.upcoming`
(`getDayBoard` en `home.service.ts`, la misma query de bookings que calcula la ocupación).

- **Una COLUMNA por cancha `online`** en escritorio (apilada en teléfono), en el orden en que la
  grilla dibuja las suyas (`courts.created_at`): las dos pantallas nombran las canchas en la misma
  secuencia y con la misma disposición, así el ojo no recorre cuatro canchas verticalmente para
  saber qué pasa a las 20:00. Las canchas pausadas no aparecen aunque tengan turnos encima — en
  una cancha pausada no se juega.
- **El grid es `auto-fill` con `minmax(232px, 1fr)`**, no un `repeat(N)` fijo: con siete canchas un
  reparto fijo daría columnas de 160 px donde no entra ni "Esperando seña"; con `auto-fill` las que
  sobran envuelven a una segunda fila.
- **El separador de 1 px va por BORDE, no por fondo.** Cada columna lleva `border-l border-t
  border-border` y el grid se corre `-ml-px -mt-px`, de modo que el `overflow-hidden` de la sección
  recorta la primera fila y la primera columna de bordes — con `auto-fill` no se puede saber en CSS
  qué celda empieza cada fila, y así no hace falta. El camino tentador (`gap-px` sobre `bg-border`
  con las columnas en `bg-card`) **no sirve acá**: en tema oscuro `card-premium` es translúcido
  (`rgba(255,255,255,0.03)` + `backdrop-filter`) sobre el shell, así que columnas con `bg-card`
  sólido se ven como parches opacos dentro de la tarjeta.
- **Qué entra**: lo que falta jugar o está en curso hoy — `confirmed` y `pending_payment`, sin
  bloqueos, con fin posterior a ahora (`upcomingForDay`, `day-bookings.ts`). Orden cronológico
  operativo: la madrugada de la noche va al final, como en la grilla.
- **Cada turno** es un link a `/reservas/[id]` de **dos renglones**, porque en una columna de
  232 px no entra todo en una línea: arriba el rango horario `HH:MM-HH:MM` en `tabular-nums` y la
  etiqueta relativa a la derecha (`relativeStartLabel`: "Ahora" en curso, "en N min" si arranca
  dentro de la hora, nada si falta más); abajo el nombre (`rowDisplayName`: invitado > jugador >
  "Sin nombre") y **el badge de `bookingBadgeVisual`** — la misma tabla que pinta la grilla y el
  listado, así acá no puede aparecer un nombre nuevo para un estado. El badge se dibuja con
  `StatusBadge` (ícono + texto + tono) y no con un pill de texto pelado: MASTER §6.5, el color
  nunca comunica solo. La fila lleva borde izquierdo de 3 px con el color del estado
  (`TONE_BORDER`).
- **El turno EN CURSO es la única fila teñida** del tablero (`TONE_TINT` de su propio estado): es
  el "uno distinto por vista" de Von Restorff (MASTER §9). Teñir también los que vienen dejaría la
  pantalla sin foco, y apagar los otros para destacarlo rompe AA (MASTER §2.4, ya pasó en la
  Grilla).
- **Máximo 4 turnos visibles por cancha**; el resto detrás de "Ver N más" (botón de 44 px con
  `aria-expanded`). Un viernes son 5 o 6 por cancha y el tablero deja de entrar en una pantalla;
  lo que importa a las 17:00 es la próxima hora, no las 23:00.
- **Cancha sin turnos**: "Libre el resto del día." — se dice, no se deja en blanco: una fila
  vacía se lee como "no cargó", y acá lo vacío es justamente el dato que el dueño usa para
  ofrecerle el horario a alguien.
- **Subtítulo del bloque = la ocupación**: `9 de 12 · 75% de ocupación` (+ ` · N bloqueados`).
  Día cerrado: "Sin horarios para hoy". Cero disponibles con turnos reales: solo el numerador
  (`N turnos · sin horarios disponibles`), para no escribir "N de 0" ni un "0%" que engaña.
- **Vacíos**, en este orden de precedencia: día cerrado ("Hoy el complejo está cerrado.") →
  ninguna cancha online ("No hay ninguna cancha en servicio.", con link a `/canchas`) → nada
  por jugar ("No queda nada por jugar hoy.").

Lo que **no** está acá, a propósito (H010): "Cobrado hoy" y "Deudas" viven en el encabezado de
Caja con la misma fuente única de siempre (`summary.collected`, `getStreetMoney`); la comparación
"vs. semana pasada" se eliminó con la tarjeta (el negocio es semanal, pero ese número es de
Métricas, no de un parte de situación — mismo criterio que H174).

## §3 "Necesita tu atención" — taxonomía cerrada

Fuente de verdad: `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md` (3 eventos v1) más la
enmienda que sumó las devoluciones. **Tres** eventos vivos, en este orden de prioridad
(`ATTENTION_PRIORITY` en `home.lib.ts`), y dentro de cada prioridad por antigüedad ascendente:

1. **Turno terminado sin cobrar** — inmediato (sin ventana de gracia). "Cobrar $X" → `/reservas/[id]`.
2. **Devoluciones pendientes** — UN ítem agregado ("N devoluciones pendientes · $X"), tenant-wide
   y sin filtro de fecha: una devolución que se debe hace una semana se sigue debiendo hoy.
   "Ver devoluciones" → `/caja/devoluciones`. El botón decía "Gestionar" hasta la v4 y era el
   único de la pantalla que no nombraba su destino.
3. **Seña que falló** — inmediato. "Ver reserva" → `/reservas/[id]`.

**El cuarto evento de la taxonomía, "Caja de ayer sin cerrar", ya no existe.** Cayó con la
eliminación de "Caja del día" (`docs/decisions/2026-09-11-eliminar-caja-del-dia.md`): ningún
movimiento de plata se bloquea por caja cerrada, así que no hay nada que avisar. `AttentionItem`
tiene tres kinds y el servicio emite tres. La lista sigue siendo cerrada: un evento nuevo pasa
primero por el documento de taxonomía.

Componente: `src/components/dashboard/NeedsAttention.tsx`. Cada fila lleva **el color del estado
de la plata**, no un ámbar genérico igual para todas: `destructive` cuando falta cobrar (plata que
el complejo tendría que tener y no tiene), `warning` cuando la plata está trabada — la que hay que
devolver y la seña que el jugador no llegó a pagar. El tinte y el borde izquierdo de 3 px salen de
`TONE_TINT`/`TONE_BORDER`, el ícono en halo de `TONE_BADGE`, y el botón de acción mide 44 px
(ancho completo en 375 px, a la derecha de `sm` para arriba).

El segundo renglón dice **desde cuándo** (`relativeTimeEs` sobre `since`, el mismo helper de
`/caja/deudas` y `/caja/devoluciones`): "Jugada y sin cobrar · hace 5 min". El dato ya llegaba en
los tres kinds y sólo se usaba para ordenar; es lo que separa lo que recién pasó de lo que se está
yendo hace seis horas.

**Vacío = el premio** (contrato, verbatim, nunca parafraseado): _"Nada pendiente. Todo cobrado y
cerrado."_ Desde la v4 es **una línea de 44 px** con tono `success` y `role="status"`, no un
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
- El vacío de "Necesita tu atención" es TEXTO EXACTO del contrato — no parafrasear ni "mejorar".
- Voseo verbo-primero en acciones ("Cobrar $X", "Cerrar caja de ayer", "Ver reserva").

## §7 Layout y responsive

- Los bloques apilan a ancho completo (`space-y-4`), en este orden: **Necesita tu atención**,
  checklist de configuración (si corresponde), Próximos turnos, Mientras no estabas.
- **Por qué las alertas van primero** (cambio de la v4): son el único bloque que exige hacer algo
  y estaban en el medio de dos bloques de lectura, justo lo que MASTER §9 (serial position) dice
  que no — lo crítico va primero o último, nunca en el medio. A las 17:00, con el cliente parado
  en el mostrador, el botón de cobrar aparecía recién después de scrollear el tablero entero.
  Vacío el bloque mide una línea de 44 px, así que no le roba lugar al tablero en los dos momentos
  del día en que no hay nada pendiente.
- "Próximos turnos" en 375px: las columnas apilan a una sola; el rango horario en
  `whitespace-nowrap` para que "18:00-19:00" no se parta al medio.
- "Necesita tu atención" en 375px: el botón de acción toma el ancho completo en su propio renglón
  (vía el `flex-wrap` de la fila) y mantiene los 44 px.
- "Mientras no estabas": el encabezado-botón mide 48 px y cada fila del feed, 44.
- Sin scroll horizontal en ningún viewport.

## §8 Motion

- Hover-lift heredado de `card-premium-interactive`/`card-entrance` (≤200ms), igual que el resto
  del admin. Nada de pulsos ni Realtime (v1: Realtime es solo de la grilla) — Hoy es
  server-render por request, refrescar = volver a entrar.

## §9 Accesibilidad

- Cada turno de "Próximos turnos" es un link con el texto completo (hora, nombre, estado)
  como nombre accesible; la tira de acento es `aria-hidden`.
- `tabular-nums` en todo número.
- Color nunca solo: las alertas llevan ícono + texto, no solo un tinte ámbar.
- Focus visible en todas las filas/links (ring token, heredado).

## §10 Datos (server, sin client fetch)

- **Fuente única de agregación**: `getHoyData(tenantId, tx, opts)`
  (`src/modules/home/home.service.ts`) — un solo `withTenantContext`, agrega en paralelo:
  `getDaySummary` (hoy; lo consume el resumen diario D8, la pantalla ya no lo pinta),
  `getStreetMoney` (Fase 1, una sola vez — alimenta la alerta P1), `getDayBoard` (una query de
  bookings + una de courts que dan la ocupación **y** "Próximos turnos"; reusa `daySlotsFor`,
  `occupancyForDay`, `upcomingForDay`, `relativeStartLabel` y `rowDisplayName` de
  `day-bookings.ts`), `getDailyClose`/`getDayOpen` de ayer (alerta P4), `countPendingRefunds`
  (alerta P2), y las queries del feed (seña fallida hoy, reservas/cancelaciones/señas).
- `upcoming` viene vacío para el worker D8 (pide AYER): a un día terminado no le queda nada por
  delante.
- `date` = día operativo (`operatingDateOf`/`nightCutoffMins`, mismo criterio que el resto del
  admin — nunca UTC calendario puro).
- `getChecklistState` se mantiene tal cual (sin cambios de Fase 2).
- Nada de Realtime/polling: server-render por request. Refrescar = volver a entrar (patrón v1).

## §11 Deuda conocida / fuera de scope

1. **Madrugada operativa**: a las 00:30 la pantalla muestra el día operativo en curso, no un
   corte de medianoche calendario — comportamiento correcto, mencionado acá para que no se lea
   como bug (mismo criterio que `grilla.md`).
2. Sin auto-refresh (sin Realtime en Hoy v1).
3. **Resumen diario (D8)**: push/email fuera de esta pantalla — ver worker
   `src/shared/jobs/workers/daily-summary.worker.ts` y `/settings/avisos` (opt-in de email).
4. `StatCard` ya no se usa en esta pantalla (se fue con las tarjetas de H010); su deuda de
   tokens sigue viva en Caja.
5. **La hora de "ahora" se calcula por request** (`nowHhmmArt`), así que "en 25 min" envejece
   hasta que el dueño vuelve a entrar — consistente con "sin Realtime en Hoy" (punto 2).
