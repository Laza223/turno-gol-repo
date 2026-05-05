# Reportes Financieros — Diseño

**Fecha**: 2026-05-05  
**User story**: US-CAJ-005  
**Prioridad**: P1

---

## Contexto

Marcelo (dueño) necesita ver ingresos, ajustes y métricas clave del mes sin necesidad de un contador. El reporte cubre el período seleccionado y permite comparar con el mes anterior.

---

## Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Fetch de datos | Server Component → service directamente | CLAUDE.md: Route Handlers solo para webhooks/public/auth |
| CSV export | Route Handler `/api/reports/revenue` | Necesita stream de archivo; único caso justificado |
| Modelo de egresos | Sin tipo expense (no existe en schema) | `cashflow_type` solo tiene `income` y `adjustment` |
| Balance | `income + adjustment` | Adjustment puede representar correcciones; amounts siempre > 0 |
| Gráficos | No | Doc8 US-CAJ-005 out-of-scope: "NO incluye gráficos interactivos avanzados" |
| Navegación de mes | `<form>` submit sin JS | Consistente con Server Component puro |

---

## Arquitectura

```
searchParams.month (YYYY-MM)
       │
       ▼
src/app/(admin)/reportes/page.tsx   ← Server Component
  ├── extractAuthUser() + getStaffTenant()
  ├── getRevenueReport(tenantId, from, to, prevFrom?, prevTo?)
  └── render: KPI cards + tablas + link CSV

src/modules/reports/report.service.ts
  ├── getRevenueReport()   ← agrega via DB queries Drizzle
  └── getCashFlowsForExport()  ← filas raw para CSV

src/app/api/reports/revenue/route.ts   ← Route Handler (CSV only)
  └── GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
```

---

## Tipo de retorno del service

```ts
export type RevenueReport = {
  period: { from: Date; to: Date }
  income: number          // centavos ARS, SUM type='income'
  adjustment: number      // centavos ARS, SUM type='adjustment'
  balance: number         // income + adjustment
  bookingCount: number    // status IN ('confirmed','completed','no_show')
  byCourt: {
    courtId: string
    courtName: string
    income: number
    bookingCount: number
    occupancyPct: number  // booked_minutes / available_minutes × 100
  }[]
  byMethod: {
    method: 'cash' | 'transfer' | 'mercadopago' | 'other'
    total: number
  }[]
  prevPeriod: {
    income: number
    adjustment: number
    balance: number
  } | null  // null si el complejo tiene menos de 1 mes de historia
}
```

---

## Queries DB (Drizzle + withTenantContext)

Todas corren dentro de `withTenantContext(tenantId, ...)` para RLS.

**Q1 — Totales por tipo y por método:**
```sql
SELECT type, method, SUM(amount) as total
FROM cash_flows
WHERE occurred_at >= :from AND occurred_at < :to
GROUP BY type, method
```

**Q2 — Por cancha (vía bookings JOIN courts):**
```sql
SELECT c.id, c.name,
       SUM(cf.amount) as income,
       COUNT(DISTINCT cf.booking_id) as booking_count,
       SUM(EXTRACT(EPOCH FROM (b.time_end::time - b.time_start::time))/60) as booked_minutes
FROM cash_flows cf
JOIN bookings b ON cf.booking_id = b.id
JOIN courts c ON b.court_id = c.id
WHERE cf.occurred_at >= :from AND cf.occurred_at < :to
  AND cf.booking_id IS NOT NULL
GROUP BY c.id, c.name
```

**Q3 — Conteo total de reservas (incluyendo no_show):**
```sql
SELECT COUNT(*) as booking_count
FROM bookings
WHERE date >= :from_date AND date <= :to_date
  AND status IN ('confirmed', 'completed', 'no_show')
```

**Q4 — Ocupación**: Se calcula en JS post-query. Para cada día del período, se lee el día de semana, se busca en `tenant.openingHours[day]` el `open`/`close` y se suman los minutos disponibles. `available_minutes = Σ(days in period: (close - open) × court_count)`. Si un día no tiene horario configurado, se omite (complejo cerrado ese día).

**Q5 — Período anterior** (si `tenant.createdAt < period.from`): mismas queries Q1+Q2 para el mes anterior.

Todas las queries se ejecutan en `Promise.all` para minimizar latencia.

---

## Página (`reportes/page.tsx`)

**URL**: `/reportes?month=2026-05` (default: mes actual)

**Navegación**: dos `<form>` con buttons submit que setean `month` al mes anterior/siguiente. Full server, sin JS.

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│ Reportes          [← Mayo 2026 →]                    │
├──────────┬──────────┬──────────┬────────────────────┤
│ Ingresos │ Ajustes  │ Balance  │ Reservas           │
│ $1.2M    │ $50K     │ $1.25M   │ 48                 │
│ ↑12% vs ant                                         │
├──────────┴──────────┴──────────┴────────────────────┤
│ Por cancha: tabla (cancha / ingresos / reservas / %) │
├─────────────────────────────────────────────────────┤
│ Por método: tabla (método / total)                   │
├─────────────────────────────────────────────────────┤
│                         [Exportar CSV ↓]             │
└─────────────────────────────────────────────────────┘
```

**Comparativa**: badge `↑ X%` / `↓ X%` solo si `prevPeriod !== null`.

**Empty state**: `income === 0 && bookingCount === 0` → "Sin movimientos en este período." No error.

---

## CSV Export Route Handler

**Endpoint**: `GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv`

**Auth**: `extractAuthUser()` → 401 si falla. Solo `format=csv`; otros → 400.

**Columns**:
```
fecha,tipo,categoría,monto_ars,método,descripción,cancha
```

**Response**:
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="reporte-{from}-{to}.csv"
```

**Link en página**: `<a href="/api/reports/revenue?from=...&to=...&format=csv">` — sin JS.

---

## Error handling

| Caso | Comportamiento |
|---|---|
| Sin datos en período | Ceros en UI; CSV con solo header |
| < 1 mes de historia | `prevPeriod: null` → no se muestra comparativa |
| `month` inválido en searchParams | Redirect silencioso a mes actual |
| DB error en service | `throw` → Next.js `error.tsx` boundary |
| `from`/`to` inválidos en Route Handler | `400 Bad Request` |
| Usuario no autenticado | `401` en Route Handler; redirect en page |

---

## Testing

**Unit** (`src/modules/reports/__tests__/`):
- `toCsv(rows)` — formato correcto, escaping de comas/comillas
- `calcOccupancy(bookedMinutes, openingHours, days)` — casos: 0%, 100%, parcial
- `formatMoneyARS(centavos)` — sin decimales, separador de miles

**Integration** (`src/modules/reports/__tests__/report.service.integration.ts`):
- `getRevenueReport()` con fixtures: tenant + courts + cash_flows + bookings
- Caso: período sin datos → todos ceros
- Caso: prevPeriod null si tenant.createdAt está dentro del período
- Caso: multi-court breakdown correcto

**E2E** (Playwright):
- Admin navega a `/reportes`, ve KPIs del mes actual
- Navega al mes anterior con botón prev
- Click "Exportar CSV" → descarga con nombre correcto

---

## Archivos a crear

```
src/modules/reports/report.service.ts
src/modules/reports/report.types.ts
src/modules/reports/__tests__/report.service.test.ts          (unit)
src/modules/reports/__tests__/report.service.integration.ts   (integration)
src/app/(admin)/reportes/page.tsx
src/app/(admin)/reportes/error.tsx
src/app/api/reports/revenue/route.ts
```

---

## Fuera de scope

- Gráficos interactivos (doc8 out-of-scope)
- Predicciones o proyecciones
- Export PDF
- Informe por horario
- Tipo expense (no existe en schema v1)
