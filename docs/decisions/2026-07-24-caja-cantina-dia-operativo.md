# Día operativo en cash_flows / caja / cantina

**Fecha:** 2026-07-24
**Estado:** Decidida (dueño: Lazar) — implementación en curso
**Migraciones:** ninguna (función pura nueva + cambio de queries; sin cambios de schema)
**Revisor:** `architecture-decision-reviewer` — ACOMPAÑO CON CONDICIONES (incorporadas abajo)
**Origen:** REQUIERE INPUT #2, `docs/audit/reports/fase-d4-flujos-integridad-report.md` §9 ("¿alinear `cash_flows` al día operativo de bookings... o aceptar calendario ART documentándolo?"). Dueño eligió alinear ya.

## Problema

`cash_flows`, `daily_cash_opens`, `daily_cash_closes` y las lecturas de cantina (`canteen-report.service.ts`) agrupan movimientos por CALENDARIO ART puro (medianoche fija UTC-3, vía `artDateOf`/`artDayRangeUtc` en `src/shared/time/art-date.ts`). Para tenants con `closes_next_day = true`, un booking a la 01:00 se guarda con `bookings.date` = el día operativo ANTERIOR (`src/shared/time/operating-day.ts`), pero el cash_flow de esa misma venta cae en el día calendario SIGUIENTE. El cierre de "la noche D" no incluye esas ventas tardías.

## Precedente propio

`src/shared/time/operating-day.ts` ya resuelve esto para bookings, pero opera en minutos-de-día atados a `opening_hours` POR DÍA DE SEMANA (`effectiveCloseMins(openHhmm, closeHhmm, closesNextDay)`). No es un corte fijo global, y no es directamente enchufable a caja: los `cash_flows` no siempre están atados a una franja/booking (gastos, fiados, compras).

## Decisión

**A) Semántica del corte — cutoff único por tenant.** Un solo valor `nightCutoffMins(openingHours, closesNextDay)` por tenant = el mayor "cuánto se extiende a la madrugada" entre los días que **realmente operan** (excluye `closed: true` — condición del revisor, ver más abajo):

```ts
function nightCutoffMins(openingHours: OpeningHours, closesNextDay: boolean): number {
  if (!closesNextDay) return 0
  const extensions = Object.values(openingHours)
    .filter(d => !d.closed)
    .map(d => effectiveCloseMins(d.open, d.close, true) - END_OF_DAY_MINS)
    .filter(mins => mins > 0)
  return extensions.length > 0 ? Math.max(...extensions) : 0
}
```

Con eso, dos funciones nuevas en `src/shared/time/operating-day.ts` (reexportando/reusando `artDateOf`/`artDayRangeUtc` de `art-date.ts`):

```ts
function operatingDateOf(instant: Date, cutoffMins: number): string {
  if (cutoffMins === 0) return artDateOf(instant) // fast path, idéntico a hoy
  return artDateOf(new Date(instant.getTime() - cutoffMins * 60_000))
}

function operatingDayRangeUtc(date: string, cutoffMins: number): { fromUtc: Date; toUtc: Date } {
  const base = artDayRangeUtc(date)
  if (cutoffMins === 0) return base
  const shiftMs = cutoffMins * 60_000
  return { fromUtc: new Date(base.fromUtc.getTime() + shiftMs), toUtc: new Date(base.toUtc.getTime() + shiftMs) }
}
```

Para `cutoffMins = 0` (la inmensa mayoría de tenants, `closesNextDay = false`) el comportamiento es **idéntico byte-a-byte** al actual — cero riesgo de regresión fuera de los tenants nocturnos.

Trade-off aceptado conscientemente: en un tenant con horario muy dispar entre días (cierra 02:00 vie/sáb, 23:00 el resto), un movimiento de madrugada de un martes se agrupa igual con el lunes aunque ese día cerró temprano — el corte usa el máximo semanal, no el cierre específico del día anterior. El monto nunca se pierde ni se duplica, solo cambia el bucket. Aceptado porque un cash_flow no siempre tiene una franja/booking al cual atarse (a diferencia de bookings.date, que sí).

**B) Datos históricos — corte hacia adelante, sin re-bucketing.** Desde el deploy, todo movimiento nuevo se lee con el criterio operativo. Los `cash_flows`/cierres previos NO se re-etiquetan ni se recalculan. Mismo principio que el sistema ya aplica a arqueos legacy (`expected_cash NULL` nunca se reinterpreta, migr. 049). Un cierre de caja ya hecho es un documento contable — recalcular retroactivamente a qué día pertenece cada movimiento podría cambiar el `expected_cash` de un arqueo ya comunicado, sin forma de deshacer esa comunicación.

## Alternativas descartadas

- **Réplica exacta día-por-día** (usar `effectiveCloseMins` del día de semana específico anterior, igual que bookings): más precisa, pero cash_flows no siempre tienen una franja a la cual atarse ("día de semana del día anterior" no tiene sentido claro para un gasto a las 3am), y construir un rango de lectura NO uniforme por día de semana dentro de cada query SQL de caja agrega complejidad real sin beneficio proporcional. (Descartada inicialmente con el argumento equivocado de "no hay acceso a `opening_hours` en los services" — el revisor confirmó que el tenant completo SÍ está en scope en los 4 call sites de página; el motivo real de descarte es la complejidad del rango no-uniforme, no la disponibilidad del dato.)
- **Corte fijo universal** (ej. siempre 6am ART para todo tenant nocturno): más simple aún, pero ignora la configuración real — un complejo que cierra a la 1am tendría el mismo corte que uno que cierra a las 4am.
- **Cutoff denormalizado en `tenants`** (columna mantenida vía trigger, patrón ya usado para `fromPriceCents`/`courtSurfaces` en `src/shared/db/schema/tenants.ts:82-96`): no aporta nada aquí — `openingHours` ya está en memoria en todos los call sites relevantes y el cálculo es barato (7 iteraciones), así que el trigger solo agregaría superficie de mantenimiento sin beneficio.

## Condiciones del revisor (incorporadas al diseño, no opcionales)

1. `nightCutoffMins` filtra `!closed` antes de tomar el máximo (bug de la primera versión de la fórmula, encontrado en review — sin esto, un día marcado "cerrado" con un `close` viejo de cuando operaba de madrugada infla el corte igual).
2. **La migración es atómica sobre TODA la superficie, no solo lectura.** Por la política de no-re-bucketing (B), cualquier inconsistencia escritura/lectura que llegue a producción queda protegida — y por lo tanto nunca corregida — por la misma regla que protege los cierres legítimos. Ver alcance completo abajo: incluye guards de escritura (`assertDayOpen`, fecha-futura de `openDay`/`closeDailyRegister`), no solo agregaciones de lectura.
3. `getCanteenDailyTotals` necesita una decisión explícita para su `GROUP BY` (hoy expresión SQL cruda de calendario ART) — se agrega en JS post-fetch sobre el resultado ya filtrado por el rango sargable, evitando reintroducir el riesgo de expresión no-leakproof bajo RLS (clase D3-H1, migr. 054).
4. Test de integración nuevo que cruce `closesNextDay=true` + un movimiento en la ventana de madrugada contra el guard de escritura Y las lecturas migradas (hoy 0 tests lo hacen).
5. Verificar impacto real en prod (tenants con `closesNextDay=true` hoy) antes de fijar urgencia — intentado en esta sesión contra el único proyecto Supabase `ACTIVE_HEALTHY` (`dpzicetvrgqlwfrqlaek`), `SELECT count(*) FROM tenants` devolvió 0 (esa instancia no tiene los datos reales). No bloquea el diseño: con corte hacia adelante, el conteo histórico no cambia qué se implementa, solo la urgencia — no se persiguió más allá para no arriesgar tocar la base equivocada.
6. Este documento re-justifica el descarte de "réplica exacta" con el argumento correcto (ver arriba).

## Alcance de implementación

**Nuevo helper** — `src/shared/time/operating-day.ts`: `nightCutoffMins`, `operatingDateOf`, `operatingDayRangeUtc` (reusan `artDateOf`/`artDayRangeUtc` de `art-date.ts`).

**Escritura/guards** (`src/modules/cashflow/`):
- `cashflow.service.ts`: `assertDayOpen` (día del `occurredAt` vs. `daily_cash_closes` ya cerrado).
- `daily-close.service.ts`: `closeDailyRegister` (guard fecha futura, hoy `date > todayART()`).
- `cash-open.service.ts`: `openDay`/`getDayOpen` (mismo guard).

**Lectura**:
- `cashflow.service.ts`: `getCashFlows`, `getDaySummary`.
- `daily-close.service.ts`: `aggregateTotals`.
- `canteen-report.service.ts`: `getSalesRanking`, `getCanteenTotalsByMethod` (rango sargable), `getCanteenDailyTotals` (agregación por día pasa a JS, condición 3).
- `src/modules/metrics/metrics.service.ts`: `getTenantMetrics` reemplaza `artTodayStr()` + la expresión SQL inline `(occurred_at at time zone 'UTC') - interval '3 hours'` por el helper nuevo (mismo bug de fondo, incluido explícitamente en el pedido original). Verificar volumen de filas antes de decidir JS-side vs. shift SQL parametrizado (bind param, nunca interpolado).

**UI / "hoy" por defecto** (los 4 ya tienen el `TenantRow` completo en scope, incluye `openingHours`):
- `src/app/(admin)/caja/page.tsx`, `caja/cantina/page.tsx`, `caja/productos/page.tsx`.
- `src/app/(admin)/dashboard/queries.ts`: además del default de "hoy", corrige el bug preexistente de la línea ~106 (`bookings.date` —ya operativo— comparado contra `date = todayART()` calendario) — misma clase de bug, misma función, se arregla en el mismo pase.
- `src/app/(admin)/caja/components/occurred-at.ts`: recibe `cutoffMins: number` como prop nueva encadenada desde `page.tsx` → `CajaActions` → `RegisterMovementModal` (no todo el tenant — un número alcanza y no filtra lógica de negocio al cliente). Deja de reimplementar el offset ART a mano.

**Fuera de alcance (documentado, no silencioso):**
- `src/modules/reports/report.utils.ts` (`getMonthBounds`) y `src/app/api/reports/revenue/route.ts`: usan UTC calendario puro, ni siquiera ART — es un problema DISTINTO (UTC vs. ART), preexistente, no relacionado a `closes_next_day`. No se toca en este esfuerzo; queda como hallazgo aparte para una sesión futura.
- Re-bucketing histórico (decisión B).
- `src/app/(admin)/abonados/AbonadosList.tsx` (`todayART` duplicado client-side, sin relación con `closes_next_day`, no toca dinero de caja): deuda técnica de la misma "clase de duplicación del offset ART" detectada en recon, pero no bloquea ni forma parte de este RI — candidato a `captura-conocimiento`/spawn_task aparte.

## Reversibilidad

Barata para la fórmula en sí: `operating-day.ts` queda como JS puro sin persistencia (a diferencia de `bookings.date`, no se agrega ninguna columna a `cash_flows`) — cambiar de "máximo semanal" a otro criterio el día de mañana es una función y sus tests, sin migración. Cara para la ventana de despliegue: por la decisión B, un bug que llegue a producción en la superficie de escritura quedaría protegido para siempre por la misma regla que protege los cierres legítimos — de ahí la condición 2 (atomicidad) y 4 (test de integración obligatorio) antes de mergear.

## Consecuencias aceptadas

- Tenants con horario muy dispar entre días de semana: posible mala clasificación de movimientos de madrugada en un día que cerró temprano (trade-off de la sección A).
- Cash_flows y cierres históricos previos al deploy quedan con criterio calendario ART, sin re-bucketing (decisión B).
- `src/modules/reports/` y `metrics` de exportación mensual siguen en UTC puro — no se resuelve acá.
