# Reportes (admin) — spec de vista [ARCHIVADO 2026-08-27]

> ⚠️ **`/reportes` ya no existe como pantalla propia.** Hace redirect permanente a `/analiticas`, que
> fusionó `/metricas` + `/reportes` en una sola página (título "Métricas", el KPI que antes se llamaba
> "Balance" ahora es "Saldo"). Este doc queda como referencia histórica del diseño previo a la fusión —
> las decisiones de UX de abajo (semáforo financiero, formato contable, empty states) pueden seguir
> siendo válidas para `/analiticas`, pero no describen la pantalla real tal cual está hoy. No reescrito
> a `/analiticas` — si hace falta un spec vivo de esa pantalla, es tarea aparte.

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/reportes`.
> Hermana de `pages/dashboard.md` y `pages/caja.md` (2026-07-03): mismos tokens, mismo semáforo
> financiero §2.5, mismo vocabulario §8.5, misma `PageHeader`/`StatCard`.

## §0 Objetivo y anti-objetivo

Reportes responde **"¿cómo viene el mes?"** — la única vista con tendencias y comparativas largas
(dashboard.md §0 y caja.md §0 ya la señalan explícitamente como el destino de eso). Tres preguntas:

1. **¿Cuánta plata entró?** — ingresos, ajustes, balance del mes, comparado contra el mes anterior.
2. **¿Cómo se usaron las canchas?** — ocupación por cancha, ingresos por cancha.
3. **¿Por dónde entró la plata?** — desglose por método de pago.

Anti-objetivo: NO es Caja (sin diario de movimientos, sin cierre) y NO es AFIP (ADR-011). No inventa
series diarias — con una sola query de mes actual + mes anterior, la "tendencia" es la comparativa
de 2 puntos, no un gráfico de 30 días (eso requeriría una query nueva, fuera de este alcance — §9).

## §1 Problemas del diseño anterior

| # | Problema | Regla violada |
|---|---|---|
| 1 | KPIs con `<div>` ad-hoc, no `StatCard` | §6.4 (KPI = StatCard único; el propio MASTER cita "Reportes hoy viola esto") |
| 2 | `formatARS` local sin decimales para valores de reporte | §8.2 (reportes = formato contable `$ X,00`) |
| 3 | `border-slate-50` hardcodeado en filas de "Por cancha" / "Por método" | §6.1 (invisible en dark) |
| 4 | Método de pago mostrado crudo capitalizado (`Cash`, `Mercadopago`) | §8.1 (cero anglicismos en UI) |
| 5 | Delta color inline (`text-emerald-600 dark:text-emerald-400` a mano) | duplica lo que `StatCard.delta` ya resuelve |
| 6 | Empty state genérico (ícono + texto), no el patrón documentado para esta vista | §7.2 (fila "Primera-vez espectral" del propio MASTER nombra a Reportes) |
| 7 | Ocupación solo como columna de tabla; ninguna comparativa visual | pedido: "ocupación, ingresos, tendencias" |
| 8 | Balance negativo sin signo/color distintivo | §2.5 (negativos con signo + color, nunca color solo) |

## §2 Anatomía

```
┌────────────────────────────────────────────────────────────────────┐
│ [icon] Reportes                     [← Junio 2026 →]                │ PageHeader
├──────────────┬──────────────┬──────────────┬─────────────────────────┤
│ Ingresos     │ Ajustes      │ Balance      │ Reservas               │ 4 StatCard (§3)
│ $ 85.000,00  │ $ 0,00       │ $ 85.000,00  │ 32                     │
│ ↑ 12% vs ant.│              │ ↑ 12% vs ant.│                        │
├──────────────┴──────────────┴──────────────┴─────────────────────────┤
│ Tendencia mensual            ● Este mes  ● Mes anterior              │ chart (§4, si hay mes ant.)
│ [Ingresos ▮▮▮▮▮▮ ▯▯▯]  [Balance ▮▮▮▮▮ ▯▯▯]                          │
├────────────────────────────────────────────────────────────────────┤
│ Ocupación de canchas                                                 │ chart (§4)
│ Cancha 1  ▓▓▓▓▓▓▓▓░░ 62%                                             │
│ Cancha 2  ▓▓▓▓░░░░░░ 38%                                             │
├────────────────────────────────────────────────────────────────────┤
│ Por cancha                                    (tabla, §5)           │
│ Cancha 1   $ 55.000,00   20 reservas   62%                          │
├────────────────────────────────────────────────────────────────────┤
│ Por método de pago                            (tabla, §5)           │
│ Efectivo   $ 40.000,00                                               │
├────────────────────────────────────────────────────────────────────┤
│                                                  [Exportar CSV]      │
└────────────────────────────────────────────────────────────────────┘
```

Root sin cambios: `space-y-6` dentro del `<main>` del shell. `PageHeader` y nav de mes intactos
(ya usan tokens; el ←/→ ya está bien).

## §3 KPIs — StatCard, formato contable

Cuatro `StatCard` (único formato de KPI, §6.4), orden aritmético **Ingresos → Ajustes → Balance →
Reservas** (A + B = C, después el conteo — mismo criterio que caja.md §3):

| Card | Accent/Ícono | Valor | Delta | Notas |
|---|---|---|---|---|
| Ingresos | `emerald` / `TrendingUp` | `formatArsContable(income)` | `computeDelta` vs mes ant. (% , omite si no hay mes ant.) | — |
| Ajustes | `slate` / `SlidersHorizontal` | `formatArsContable` con signo (negativo → `−$…` `text-destructive`) | sin delta (base chica, % ruidoso — decisión ya existente, se mantiene) | — |
| Balance | `emerald` si ≥ 0, `red` si < 0 / `Wallet` | `formatArsContable` con signo | `computeDelta` vs mes ant. | ring emerald sutil (`ring-1 ring-emerald-600/20`) solo si ≥ 0 — mismo lenguaje que el saldo de Caja (§2.3, un protagonista) |
| Reservas | `slate` / `CalendarCheck` | `bookingCount.toLocaleString('es-AR')` | sin delta (el service no trae `bookingCount` del mes anterior) | neutro — no gasta un hue del semáforo (mismo criterio que "Turnos hoy" del dashboard) |

`computeDelta(current, prev)` (nuevo, `report.utils.ts`, pure/testeable) reemplaza el `pctBadge`
local: mismo cálculo (% de cambio, `null` si `prev === 0`), devuelve `{direction, label}` — encaja
directo en `StatCard.delta` sin adaptador.

## §4 Charts — ocupación y tendencia (nuevo)

Client component `ReportCharts.tsx` (recharts + `useChartTheme`, mismo patrón que
`metricas/MetricsDashboard.tsx`: colores resueltos en JS porque recharts no responde a `.dark`).
Ambos usan datos **ya existentes** en `RevenueReport` — cero queries nuevas.

- **Ocupación de canchas**: `BarChart` horizontal (`layout="vertical"`), un bar por cancha
  (`occupancyPct`, dominio 0–100, fill `chart.primary`). Alto dinámico
  (`Math.max(120, byCourt.length * 44)`). Se omite si `byCourt` está vacío (ya cubierto por el
  guard de empty state general). Título deliberadamente distinto de "Por cancha" (la tabla, §5):
  el e2e #1 matchea heading con `/Por cancha/i` y "Ocupación por cancha" hubiese colisionado
  (strict mode).
- **Tendencia mensual**: `BarChart` agrupado, categorías `Ingresos`/`Balance`, dos series
  (`chart.series[0]` = este mes, `chart.series[1]` = mes anterior). Eje Y con `formatArs` (entero,
  §8.2 — es comparativa, no asiento). Leyenda propia (dos chips de color, no `Legend` de recharts —
  evita re-implementar theming de texto). **Se omite entero si `prevPeriod` es `null`** (tenant sin
  actividad el mes pasado — no se fabrica una comparativa contra cero).
- Tooltip/grid/ejes: mismas props que `useChartTheme` ya expone (sin tokens nuevos).

## §5 Tablas — por cancha / por método de pago

Sin cambios de estructura ni de query. Fixes de forma:

- Filas: `divide-y divide-border` en vez de `border-b border-slate-50` hardcodeado (§6.1, dark-safe).
- Método de pago: nuevo `formatMethodLabel` (`report.utils.ts`) — `cash → Efectivo`,
  `transfer → Transferencia`, `mercadopago → MercadoPago`, `other → Otro` (mismo mapeo que
  `caja-lib.ts`, copia local: son módulos de página distintos, no vale la pena acoplarlos).
- Ambas tablas se muestran solo si su arreglo no está vacío (comportamiento existente, intacto).

## §6 "Primera-vez espectral" — empty state (reemplaza el genérico)

Implementa literalmente la fila de MASTER §7.2 que ya nombra esta vista ("Reportes sin datos: KPIs
de ejemplo grisados + 'Así se verá tu mes cuando cargues reservas'"):

- 4 `StatCard` de ejemplo (mismos labels/íconos que §3, valores ficticios plausibles: Ingresos
  `$ 85.000,00`, Ajustes `$ 0,00`, Balance `$ 85.000,00`, Reservas `32`), envueltas en
  `opacity-50 pointer-events-none select-none` (no interactivas — no mentir affordance).
- Label arriba de las cards: `"✦ Así se verá tu mes cuando cargues reservas"` (`text-sm
  font-medium text-muted-foreground`).
- Debajo: línea muted `"Todavía no hay movimientos en este período."` + CTA
  `"Cargá tu primera reserva desde la grilla"` → `/grilla` (mismo verbo-primero que el CTA
  homólogo del dashboard, §7.1 regla 4).
- Se elimina `EmptyReportIllustration` (el SVG de barras) — las StatCard fantasma cumplen mejor
  el rol de "mostrar, no decir".
- CSV export sigue oculto en este estado (comportamiento existente, intacto).

## §7 Formato (§8.2/§8.4 normativa)

- `formatArsContable` (de `@/lib/format`) para los 4 valores de KPI — reemplaza el `formatARS`
  local sin decimales.
- Negativos con `formatSignedArsContable` (nuevo, local a la page o `report.utils.ts`): signo
  `−` (U+2212) + `text-destructive`, nunca color solo.
- Reservas: `Intl`/`toLocaleString('es-AR')`, no `String()` plano (miles con punto, §8.4).
- Charts: `formatArs` (entero, "compacto solo en charts" es opcional — con valores de un mes no
  hace falta el sufijo "mil").

## §8 Contratos de test

- `tests/e2e/reportes.spec.ts` #1/#3/#4 casi intactos: StatCard sigue renderizando el label en un
  `<p>`, heading "Por cancha" sin cambios, nav de mes sin cambios, CSV sin cambios. Único ajuste:
  #1 pasa de `getByText('Cancha E2E 1')` a `getByRole('cell', { name: 'Cancha E2E 1' })` — el
  chart de ocupación repite el nombre de cancha como tick del eje Y (SVG `<text>`), y el
  `getByText` plano matcheaba las dos apariciones (violación de modo estricto).
- `tests/e2e/reportes.spec.ts` #2 y `tests/e2e/reportes-empty-state.spec.ts` **se actualizan**: la
  copy vieja ("Sin movimientos en este período" / "vas a ver los ingresos del mes") desaparece con
  el empty state genérico; se reemplaza por el texto nuevo de §6 (`"Así se verá tu mes cuando
  cargues reservas"` + `"Todavía no hay movimientos en este período."`). CSV sigue con `toHaveCount(0)`.
- Unit nuevos: `report.utils.test.ts` para `computeDelta` (casos up/down/prev=0) y
  `formatMethodLabel` (4 casos).

## §9 Deuda declarada / fuera de scope

1. La "tendencia mensual" son 2 puntos (mes actual vs anterior), no una serie de N meses. Una serie
   diaria/semanal real requiere una query nueva (`GROUP BY DATE_TRUNC('day', occurred_at)`) —
   **REQUIERE INPUT** si se quiere ese nivel de detalle a futuro.
2. `EmptyState` (el primitive genérico) sigue sin usarse acá a propósito — no se toca su deuda de
   tokens light-hardcodeados (P0.1 §13), es un barrido aparte.
3. Sin Realtime (v1: server-render por request, igual que dashboard/caja — coherente).
