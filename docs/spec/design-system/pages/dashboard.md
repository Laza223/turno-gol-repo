# Hoy (dashboard admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general) y a `gramatica-interaccion.md` (Fase 0). Acá viven
> las decisiones específicas de `/dashboard` (label de nav: **Hoy**, renombrado en Fase 2 desde
> "Inicio"). Contrato de ejecución original: `docs/planning/2026-08-01-decisiones-de-fase-v2.md`
> §3 Fase 2; taxonomía de alertas: `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md`.
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

1. **"Próximos turnos"** → cancha por cancha, lo que falta jugar hoy: hora, quién, estado, y
   "ahora" / "en N min" cuando arranca dentro de la hora. La ocupación del día es el subtítulo
   del bloque, no una tarjeta aparte.
2. **"Necesita tu atención"** → SOLO las 4 anomalías de la taxonomía cerrada, cada una con su
   acción al lado. Vacío = el premio: "Nada pendiente. Todo cobrado y cerrado."
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
┌──────────────────────────────────────────────────────────────┐
│ [icon] Hoy                                                    │  PageHeader (banda premium)
│        mié 2 de julio                                        │  fecha §8.3 formato medio, sin acciones
├──────────────────────────────────────────────────────────────┤
│ ⚙ Configuración · 5 de 7  ▓▓▓▓▓░░  · pendientes accionables  │  solo si falta setup (§4)
├──────────────────────────────────────────────────────────────┤
│ Próximos turnos            9 de 12 · 75% de ocupación         │  (§2) una fila por cancha
│ Cancha 1                                          3 turnos    │
│ ▌20:00-21:00  Tomás García        en 25 min       Señada      │
│ ▌21:00-22:00  Los Pibes                    Esperando seña     │
│ Cancha 2                                                      │
│ Libre el resto del día.                                       │
├──────────────────────────────────────────────────────────────┤
│ Necesita tu atención                                          │  (§3) — o el vacío-premio
│ ⚠ Tomás García · Cancha 1 20:00-21:00 · $16.000    [Cobrar]   │
│ ↩ 2 devoluciones pendientes · $ 24.000 a devolver [Gestionar] │
│ ✕ Seña rechazada · Ana López · Cancha 2            [Ver res.] │
│ ⚠ La caja de ayer sigue sin cerrar          [Cerrar caja]     │
├────────────────────────────────────────────────────────────────┤
│ Mientras no estabas                                            │  (§4)
│ 📅 Reserva online — Cancha 1 20:00-21:00      21:30  T.García │
│ 💰 Seña acreditada — $ 7.500                  20:10  R.Paz    │
│ ✕ Cancelación — Cancha 1 22:00-23:00          18:00  A.López  │
└──────────────────────────────────────────────────────────────┘
```

Root: `space-y-6` dentro del `<main>` del shell (que ya da `max-w-7xl px-4 py-8`). Sin `<main>`
propio (el shell ya lo es).

- **PageHeader**: título "Hoy" (renombrado de "Inicio" en Fase 2 — el nombre del concepto de
  producto y el label de nav ya coinciden, sin esperar el "test de vocabulario" del pase crítico
  §4.9 porque el contrato lo pidió así para la demo comercial), subtitle = fecha de hoy formato
  **medio** §8.3 (`"mié 2 de julio"`). **Sin acciones en el header** (cambio respecto a la v1):
  Hoy "no es una pantalla de hacer" (contrato §4.1) — reservar y vender cantina se sacaron de acá,
  siguen existiendo en Grilla/Caja tal cual.

## §2 "Próximos turnos" — una fila por cancha

Componente: `src/components/dashboard/ProximosTurnos.tsx`. Datos: `HoyData.upcoming`
(`getDayBoard` en `home.service.ts`, la misma query de bookings que calcula la ocupación).

- **Una fila por cancha `online`**, en el orden en que la grilla dibuja sus columnas
  (`courts.created_at`): las dos pantallas nombran las canchas en la misma secuencia. Las
  canchas pausadas no aparecen aunque tengan turnos encima — en una cancha pausada no se juega.
- **Qué entra**: lo que falta jugar o está en curso hoy — `confirmed` y `pending_payment`, sin
  bloqueos, con fin posterior a ahora (`upcomingForDay`, `day-bookings.ts`). Orden cronológico
  operativo: la madrugada de la noche va al final, como en la grilla.
- **Cada turno** es un link a `/reservas/[id]`: tira de acento del estado (3 px, `TONE_ACCENT`),
  rango horario `HH:MM-HH:MM` en `tabular-nums`, nombre (`rowDisplayName`: invitado > jugador >
  "Sin nombre"), etiqueta relativa (`relativeStartLabel`: "ahora" en curso, "en N min" si arranca
  dentro de la hora, nada si falta más) y **el badge de `bookingBadgeVisual`** — la misma tabla
  que pinta la grilla y el listado, así acá no puede aparecer un nombre nuevo para un estado.
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
enmienda que sumó las devoluciones. Exactamente 4 eventos, en este orden de prioridad (P1→P4,
`ATTENTION_PRIORITY` en `home.lib.ts`), y dentro de cada prioridad por antigüedad ascendente:

1. **Turno terminado sin cobrar** — inmediato (sin ventana de gracia). "Cobrar $X" → `/reservas/[id]`.
2. **Devoluciones pendientes** — UN ítem agregado ("N devoluciones pendientes — $X a devolver"),
   tenant-wide y sin filtro de fecha: una devolución que se debe hace una semana se sigue
   debiendo hoy. "Gestionar" → `/caja/devoluciones`.
3. **Seña que falló** — inmediato. "Ver reserva" → `/reservas/[id]`.
4. **Caja de ayer sin cerrar** — solo T-1, binario. "Cerrar caja de ayer" → `/caja`.

Componente: `src/components/dashboard/NeedsAttention.tsx`. Cada fila: ícono ámbar + descripción +
botón de acción (`buttonVariants` default — jerarquía única de Fase 0, nunca un botón custom).

**Vacío = el premio** (contrato, verbatim, nunca parafraseado): _"Nada pendiente. Todo cobrado y
cerrado."_ — vía `EmptyState` con ícono `CheckCircle2`. Una quinta alerta NO se agrega sin pasar
primero por el documento de taxonomía (evita degenerar en bandeja de notificaciones, el objetivo
explícito de la Fase 2).

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

## §5 Checklist de configuración — sin cambios de Fase 2

Se mantiene tal cual (Zeigarnik: pendientes visibles, completados plegados) — ver historial
pre-Fase 2 de este documento en git. Fase 2 no lo tocó.

## §6 Copy (§8 de MASTER.md es normativa)

- "Inicio" → **"Hoy"** (nav y `PageHeader`, Fase 2).
- Plata SIEMPRE `formatArs`. Fecha del header formato medio §8.3; ISO prohibido cara al usuario.
- El vacío de "Necesita tu atención" es TEXTO EXACTO del contrato — no parafrasear ni "mejorar".
- Voseo verbo-primero en acciones ("Cobrar $X", "Cerrar caja de ayer", "Ver reserva").

## §7 Layout y responsive

- Los tres bloques apilan a ancho completo (`space-y-6`), en este orden: Próximos turnos,
  Necesita tu atención, Mientras no estabas.
- "Próximos turnos" en 375px: hora y nombre bajan a dos renglones dentro de la misma fila
  (`flex-col sm:flex-row`), el rango horario en `whitespace-nowrap` para que "18:00-19:00" no se
  parta al medio; la etiqueta relativa y el badge se quedan a la derecha.
- "Necesita tu atención"/"Mientras no estabas": filas de una línea con `min-h-11` táctil; en
  mobile el botón de acción baja a una segunda línea (`flex-col sm:flex-row`).
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
