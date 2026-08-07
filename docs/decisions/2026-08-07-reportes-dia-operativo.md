# Reportes en día operativo — cerrando el hilo de julio

**Fecha:** 2026-08-07
**Estado:** implementado
**Cierra:** el punto "Fuera de alcance" de `2026-07-24-caja-cantina-dia-operativo.md:90`, que dejó explícito que `report.utils.ts` y `api/reports/revenue` seguían en UTC calendario puro y quedaban "como hallazgo aparte para una sesión futura".

## El problema

Desde la alineación del 2026-07-24, caja, cantina, cierres, dashboard, home y bookings agrupan por **día operativo** del complejo. Los reportes NO: eran la última superficie de plata en UTC calendario.

En ART (UTC-3) eso significa que **el mes arrancaba a las 21:00 del último día del mes anterior**. Consecuencias medidas, no teóricas:

| Dónde | Qué pasaba |
|---|---|
| `getMonthBounds` | Tres horas de cobros (21:00–23:59 del último día) contadas en el mes equivocado |
| CSV de export (`fecha`) | Un cobro de las 22:00 ART del día 5 se exportaba con fecha **6** — el mismo movimiento que `/caja` muestra en el 5 |
| `/api/reports/revenue` | El rango se armaba con `T00:00:00.000Z`/`T23:59:59.999Z`: incluía la noche anterior y perdía la última |

Dos papeles con fechas distintas para el mismo hecho económico es exactamente lo que prohíbe el invariante P2 ("el mismo número en toda superficie que lo muestre").

## Dos bugs más, de la misma clase, encontrados al arreglar

Ninguno estaba en el hallazgo original:

1. **`calcAvailableMinutes` daba 0 minutos disponibles** a cualquier complejo con `closes_next_day`. Su cálculo local trataba `'00:00'` como 1440 pero dejaba cualquier otro cierre de madrugada tal cual, así que un día 08:00→02:00 resolvía `Math.max(0, 120 - 480) = 0`. Con el denominador en cero, `calcOccupancyPct` devolvía **0% de ocupación todos los días**: un complejo lleno se reportaba vacío.

2. **`currentMonthStr()` usaba `getUTCMonth()`.** A las 22:00 ART del último día del mes, `/analiticas` se abría mostrando el mes **siguiente**, vacío — justo en el horario en que el dueño mira el teléfono.

## Qué se hizo

- `getMonthBounds(month, cutoffMins)` devuelve el período en sus **dos formas**: días operativos (`fromDate`/`toDate`, para `bookings.date`) e instantes (`fromUtc`/`toUtc`, para `cash_flows.occurred_at`). Derivar una de la otra con `toISOString().split('T')[0]` —que es lo que hacía el servicio— reintroduce el corrimiento.
- `calcAvailableMinutes` recibe fechas `'YYYY-MM-DD'` y `closesNextDay`, y resuelve el cierre con `effectiveCloseMins`, el mismo helper que usan los generadores de slots de la grilla.
- **`getRevenueReport` cambió de firma**: recibe el `month` y resuelve el período adentro. Antes pedía cuatro `Date` sueltos (`from`/`to`/`prevFrom`/`prevTo`) que armaba el caller; bastaba con que uno estuviera mal para que el reporte contara otro mes sin que nada fallara. La firma nueva hace ese error imposible de escribir.
- `getCashFlowsForExport` exige `cutoffMins` y usa `operatingDateOf` para la columna `fecha`.
- `resolveCutoffMins` se movió de `metrics.service.ts` (donde era privada) a `@/modules/tenants/tenant-operating-day.ts`, compartida. Vive en `modules/` y no en `shared/` porque necesita el tipo `OpeningHours`, que es de dominio.

## Consecuencia aceptada: los reportes históricos cambian de valor

Mismo criterio que el 2026-07-24: **corte hacia adelante, sin re-bucketing**. Los datos no se tocan — cambia cómo se agrupan al leerlos. Un mes ya consultado puede devolver un número distinto (correcto) que el que el dueño vio antes.

Se acepta explícitamente porque la alternativa es peor: dejar que `/analiticas` y `/caja` sigan contando el mismo peso en meses distintos.

Los complejos con `closes_next_day` van a ver el cambio más grande — y en su caso incluye pasar de 0% de ocupación a la ocupación real.

## Verificación

- `tests/unit/reports.test.ts` — 31 casos, con regresión explícita del bug de los 0 minutos (con flag: 1080 min; sin flag: 0, que es el criterio correcto y compartido con los generadores de slots).
- `tests/integration/reports-operating-day.test.ts` (nuevo) — el cobro de las 22:00 del último día no se va al mes siguiente; la madrugada de un `closes_next_day` factura en el mes anterior; la ocupación de un complejo nocturno es > 0; la columna `fecha` del CSV es el día operativo.
- `pnpm typecheck` ✅ · `pnpm lint` 0 errores / 44 warnings (baseline) ✅
