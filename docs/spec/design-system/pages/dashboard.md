# Inicio (dashboard admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/dashboard`
> (label de nav: **Inicio**). Hermana de `pages/grilla.md` (2026-07-02): mismos tokens, misma
> paleta de estados §2.6, mismo vocabulario §8.5.

## §0 Objetivo y principio de lectura

**El admin sabe TODO en 3 segundos**: plata, turnos, pendientes y quién viene. Es la primera
pantalla al entrar cada día — se diseña para el barrido en F de Marcelo (55 años, celular en la
barra):

1. **Fila de KPIs** → ¿cuánta plata hay? ¿cuántos turnos vendí? ¿qué me deben?
2. **Próximos turnos** → ¿quién viene ahora / en la próxima hora?
3. Lo pendiente **accionable** salta (Von Restorff §9): "Esperando seña" en warning es lo único
   que Rodrigo debe perseguir.

Anti-objetivo: NO es Reportes. Nada de gráficos, tendencias mensuales ni comparativas largas acá —
eso vive en `/reportes` y `/metricas`. Inicio responde HOY.

## §1 Anatomía

```
┌──────────────────────────────────────────────────────────────┐
│ [icon] Inicio                              [Ir a la grilla]  │  PageHeader (banda premium)
│        mié 2 de julio                                        │  fecha §8.3 formato medio
├──────────────────────────────────────────────────────────────┤
│ ⚙ Configuración · 5 de 7  ▓▓▓▓▓░░  · pendientes accionables  │  solo si falta setup (§4)
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ Caja de hoy  │ Turnos hoy   │ Esperando    │ Jugadores       │  4 KPIs (§2)
│ $ 45.000     │ 8 de 24      │ seña: 2      │ bloqueados: 2   │  2×2 mobile / 4 cols lg
│ Ingresos …   │ 33% ocupación│ $ 24.000 …   │ con softban     │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│ Próximos turnos                                 Ver grilla → │  (§3)
│ 18:00  Tomás García      · Cancha 1   [Señada]      $ 25.000 │
│ en 40′                                                       │
│ 19:00  Rodrigo Paz       · Cancha 2   [Esperando…]  $ 25.000 │
│ …                                                            │
└──────────────────────────────────────────────────────────────┘
```

Root: `space-y-6` dentro del `<main>` del shell (que ya da `max-w-7xl px-4 py-8`). Sin `<main>`
propio (el shell ya lo es).

- **PageHeader**: título "Inicio", subtitle = fecha de hoy formato **medio** §8.3
  (`"mié 2 de julio"` — nunca "miércoles, 1 de julio" con coma ni ISO). Action: link
  **"Ir a la grilla"** — `bg-primary text-primary-foreground hover:bg-primary/90` (token AA dual,
  NO el primitive `Button` que sigue hardcodeado — P0.1). Es el paso siguiente natural de la vista
  (Fitts: el CTA del día, grande y arriba).
- Se elimina el `<h2>Hoy</h2>`: la fecha ya está en el header y cada KPI dice "hoy" en su label.
  Título de sección redundante = una línea menos antes del dato.

## §2 KPIs — mapa canónico

Cuatro cards, ni una más (Miller §9: plata / turnos / pendiente / bloqueos). Primitiva: `StatCard`
vía `MetricCard` (que ahora acepta `accent`, `sub`, `href`). **Cada card entera es un link**
(Fitts): envuelta en `<Link>` con `aria-label` descriptivo; `card-premium-interactive` ya da el
hover-lift.

Orden fijo (serial position §9: la plata primero):

| # | Card | Valor (`font-display tabular-nums`) | Sub | Accent/Ícono | Link | Semántica §2.5 |
|---|---|---|---|---|---|---|
| 1 | **Caja de hoy** | saldo neto del día, `formatArs`. Negativo: `−$ 1.500` en `text-red-700 dark:text-red-400` (signo + color, nunca color solo) | `Ingresos $ X · Egresos $ Y` | `emerald` / `Banknote` | `/caja` | success = entra |
| 2 | **Turnos hoy** | `8 de 24` (horas reservadas de horas disponibles). Día cerrado: `Cerrado` | `33% de ocupación` (+ ` · 2 bloqueados` si hay) | `slate` (neutro, NUEVO) / `CalendarCheck` | `/grilla` | neutro — no gasta un hue del semáforo |
| 3 | **Esperando seña** | cantidad de reservas `pending_payment` de hoy | `$ X en señas por acreditar` · si 0: `Sin pendientes` | `amber` / `Clock` | `/reservas?status=pending_payment` | warning = pendiente |
| 4 | **Jugadores bloqueados** | `COUNT` de bans vigentes en `tenant_player_bans` (softban por no-show + bans manuales) | `2 con bloqueo activo` · si 0: `Nadie bloqueado` | `red` (NUEVO) / `UserX` | `/jugadores` | destructive = bloqueo |

Reglas:

- **"Revenue" muere** (§8.1). Y no se reemplaza 1:1: "ingresos proyectados" (Σ price_snapshot de
  reservas del día) era un número mentiroso — mezclaba plata cobrada con plata prometida. El KPI
  de plata es **la caja real** (`getDaySummary`, la misma fuente que `/caja`): si el dashboard y
  la caja dicen números distintos, el admin deja de confiar en los dos.
- **"Abonados activos" sale del dashboard**: no cambia día a día ni exige acción hoy. Vive en
  `/abonados`. Un KPI que siempre dice lo mismo es ruido que compite con los que sí importan.
- Los bloqueos son **acumulados** (no "hoy") — el label no dice "hoy" a propósito.
- Accents de `StatCard`: se agregan `red` y `slate` al mapa existente (mismo patrón alpha
  `bg-*-500/10 text-*-600 ring-*-500/20` + variantes dark). Los 4 hues del semáforo §2.5 solo se
  usan con su significado; por eso Turnos usa `slate` y no un verde decorativo.
- Sin delta "vs ayer" en Caja: a las 10:00 el día en curso siempre pierde contra un día terminado
  — flecha roja mentirosa toda la mañana. La comparativa vive en `/caja` (donde hay contexto).

## §3 Próximos turnos

Card `card-premium rounded-2xl`. Header: `h2` "Próximos turnos" (`text-base font-semibold`) +
link "Ver grilla →" (`text-sm font-semibold text-emerald-700 dark:text-emerald-400`).

**Qué lista**: reservas de HOY (día ART) con `type ≠ 'block'`, estado `confirmed` o
`pending_payment`, cuyo fin normalizado al día operativo es posterior a ahora (incluye la que está
**en curso**). Orden por comienzo normalizado (madrugada operativa al final, igual que la grilla).
Máximo **6 filas** + footer "N turnos más — ver grilla →" si desborda.

Fila (entera clickeable → `/reservas/[id]`, `divide-y divide-border`):

| Zona | Contenido | Clases |
|---|---|---|
| Hora | `18:00` + debajo relativo §8.3: `ahora` (en curso) / `en 40 min` (≤ 60 min) / nada | hora `font-display text-lg font-bold tabular-nums`; relativo `text-xs font-medium text-emerald-700 dark:text-emerald-400` |
| Quién | nombre (guest o jugador; fallback "Sin nombre") + `Cancha 1 · 18:00–19:00` | nombre `text-sm font-medium text-foreground truncate`; detalle `text-xs text-muted-foreground tabular-nums` |
| Estado | badge §2.6/§8.5 (mismo mapa que la grilla): Esperando seña (`Clock`, warning) / Señada (`CheckCircle2`, success) / Abonado (`Repeat`, info) / Confirmada (`HandCoins`, info) | pill `text-xs font-medium` con tinte alpha del token + texto en escala AA (amber-800/emerald-800/blue-800 light · *-300 dark) |
| Monto | `formatArs(priceSnapshot)` | `text-sm font-semibold tabular-nums text-foreground` |

El relativo responde "quién viene en la próxima hora" sin que el admin calcule: la primera fila
casi siempre lleva `ahora` o `en X min`. No se agrega ring ni highlight extra — el distinto de la
vista sigue siendo "Esperando seña" (Von Restorff, uno solo).

**Estados vacíos** (§7.2, didácticos):

| Caso | Copy | Extra |
|---|---|---|
| Hoy sin reservas | "Todavía no hay reservas para hoy." | CTA link "Cargar la primera desde la grilla" |
| Hubo, pero no quedan | "No quedan turnos por jugar hoy — se jugaron N." | link "Ver el día en la grilla" |
| Día cerrado (closed_dates o sin horario) | "Hoy el complejo está cerrado." | — |

## §4 Checklist de configuración — compacta

Problema v1: la lista completa de 7 pasos (~340px) empujaba los KPIs bajo el fold aun con 4 tildados.
Rediseño **Zeigarnik puro**: lo pendiente visible y accionable, lo hecho plegado.

- Header (una fila): "Configuración del complejo" + `5 de 7` + barra de progreso (existente).
- Cuerpo: **solo los pasos pendientes**, cada uno con su CTA actual (Configurar → href,
  Copiar link, hint de primera reserva).
- Los completados se pliegan a una fila-toggle: `"5 pasos completados"` + chevron
  (`aria-expanded`); expandir muestra la lista tachada actual.
- 7/7 → banner verde "¡Tu complejo está 100% listo!" (existente). Cuando además
  `onboarding_completed && public_link_shared` → **no se renderiza nada** (regla existente de la
  page, se mantiene).
- Posición: entre el header y los KPIs. Con el pliegue, el peor caso realista (3 pendientes)
  mide ~180px y no entierra la plata.

Contratos de test: el botón "Copiar link" sigue visible sin expandir mientras
`publicLinkShared=false` (es un pendiente). El ítem completado "Primera reserva online recibida"
queda bajo el toggle — el e2e del Aha Moment expande "N pasos completados" antes de asertar.

## §5 Copy (§8 es normativa)

- "Revenue hoy" → **"Caja de hoy"**. "Dashboard" → **"Inicio"** (ya en nav).
- Plata SIEMPRE `formatArs` de `src/lib/format.ts` (fuente única §8.2 — el dashboard deja de
  tener su propio `formatARS` local; P0.2 del MASTER avanza vista por vista).
- Fecha del header formato medio §8.3; ISO prohibido cara al usuario.
- Estados con vocabulario §8.5 exacto: "Esperando seña", "Confirmada", "Señada", "Abonado".
- Voseo verbo-primero en vacíos y CTAs ("Cargar la primera desde la grilla").

## §6 Layout y responsive

- KPIs: `grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4`. En 375px quedan 2×2 arriba del fold
  junto al header — el barrido de 3 segundos sobrevive en mobile.
- Próximos turnos: filas de una línea con `min-h-[44px]` táctil; el monto se oculta en `<sm`
  si no entra (`hidden xs:block` no existe — usar `hidden sm:block` en el monto y dejarlo en el
  detalle de la fila si hace falta). Nombre con `truncate` + `min-w-0`.
- Sin scroll horizontal en ningún viewport.

## §7 Motion

- **Se elimina `Reveal`** (entrada escalonada 0/80/160ms): el objetivo es leer el dato en 3
  segundos, no verlo aparecer. Presupuesto admin §5.2: el dato primero. El único motion es el
  hover-lift heredado de `card-premium-interactive` (≤200ms) y la barra de progreso del checklist.
- Nada de pulsos ni Realtime acá (v1: Realtime es solo de la grilla).

## §8 Accesibilidad

- Cards-link con `aria-label` completo: `"Caja de hoy: $ 45.000 — ver caja"`.
- `tabular-nums` en todo número (§3 tipografía).
- Color nunca solo: deudas/negativos llevan signo y texto; badges llevan ícono + label.
- El toggle de completados del checklist: `<button aria-expanded>`.
- Focus visible en todas las filas/links (ring token, heredado).

## §9 Datos (server, sin client fetch)

- Fuente única de "hoy": `todayART()` (`shared/time/art-date`). El día de caja y el de reservas
  usan la MISMA fecha (coherencia entre KPI 1 y `/caja`).
- `getDashboardData(tenantId)` — un `withTenantContext`, en paralelo:
  - `getDaySummary` + reservas de hoy (join court name + player) + `COUNT` de bans vigentes en
    `tenant_player_bans` + canchas (para nombre/online).
  - Ocupación derivada con helpers puros (`dashboard-lib.ts`, unit-testeados):
    horas reservadas (no-block, estados activos) / (slots del día × canchas online − horas
    bloqueadas). Slots del día = `generateTimeSlots(open, close, closesNextDay)` del día ART
    (`DAY_KEYS`), respetando `closed_dates`.
  - Próximos: normalización al día operativo (minutos < apertura → +1440 con `closesNextDay`),
    así la madrugada ordena al final y `'24:00'` compara bien.
- `getChecklistState` se mantiene tal cual.
- Nada de Realtime/polling: server-render por request. Refrescar = volver a entrar (patrón v1).

## §10 Deuda conocida / fuera de scope

1. **Madrugada operativa**: a las 00:30 el dashboard muestra el día calendario nuevo, no la noche
   operativa en curso (mismo edge documentado en `grilla.md` §14 — se resuelven juntos).
2. Los KPIs no se auto-refrescan (sin Realtime en dashboard v1). Si algún día duele, el push de
   reserva online ya avisa.
3. Gráfico de barras semanal / tendencias: pertenece a Reportes (§0 anti-objetivo).
4. `StatCard` sigue con clases raw de paleta (no tokens semánticos) — coherente con su estado
   actual; se tokeniza cuando toque el barrido P0.1/P0.2.
