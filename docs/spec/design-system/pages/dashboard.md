# Hoy (dashboard admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general) y a `gramatica-interaccion.md` (Fase 0). Acá viven
> las decisiones específicas de `/dashboard` (label de nav: **Hoy**, renombrado en Fase 2 desde
> "Inicio"). Reemplaza la versión anterior de este documento (pre-Fase 2, 4 KPIs + "Próximos
> turnos") — contrato de ejecución: `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3 Fase 2,
> taxonomía de alertas: `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md`.

## §0 Objetivo y principio de lectura

**El admin responde "¿está todo bien?" en 5 segundos.** Es la primera pantalla al entrar cada
día — se diseña para que Marcelo la abra a las 23:40 desde el sillón, la lea en 8 segundos y baje
la ansiedad en vez de subirla (visión v2 §4.1). Tres bloques, ni uno más:

1. **Los 3 números** → cobrado hoy (con comparación honesta vs. mismo día de la semana pasada,
   nunca "ayer"), turnos de hoy, plata en la calle.
2. **"Necesita tu atención"** → SOLO las 3 anomalías v1 de la taxonomía cerrada, cada una con su
   acción al lado. Vacío = el premio: "Nada pendiente. Todo cobrado y cerrado."
3. **"Mientras no estabas"** → el feed de lo que pasó sin él (reservas online, cancelaciones,
   señas acreditadas).

Anti-objetivo explícito (contrato): **cero gráficos**. Un gráfico es una herramienta de análisis;
Hoy es un parte de situación. El análisis vive en `/analiticas`. Tampoco es una pantalla de
hacer — no hay accesos rápidos de reservar/vender cantina acá (esos viven en Grilla/Caja); la
única acción visible es la que cada alerta de "Necesita tu atención" pide.

## §1 Anatomía

```
┌──────────────────────────────────────────────────────────────┐
│ [icon] Hoy                                                    │  PageHeader (banda premium)
│        mié 2 de julio                                        │  fecha §8.3 formato medio, sin acciones
├──────────────────────────────────────────────────────────────┤
│ ⚙ Configuración · 5 de 7  ▓▓▓▓▓░░  · pendientes accionables  │  solo si falta setup (§4)
├──────────────┬──────────────┬─────────────────────────────────┤
│ Cobrado hoy  │ Turnos hoy   │ Plata en la calle              │  3 números (§2)
│ $ 184.500    │ 9 de 12      │ $ 42.000                       │  2 col mobile / 3 cols lg
│ ↑ 12% vs sem.│ 75% ocupación│ Pendiente de cobro              │
├──────────────┴──────────────┴─────────────────────────────────┤
│ Necesita tu atención                                          │  (§3) — o el vacío-premio
│ ⚠ Tomás García · Cancha 1 20:00-21:00 · $16.000    [Cobrar]   │
│ ⚠ Seña rechazada · Ana López · Cancha 2            [Ver res.] │
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

## §2 Los 3 números — mapa canónico

Tres cards, ni una más (el contrato es explícito: "tres cifras, tipografía enorme, cero
decoración"). Primitiva: `StatCard` vía `MetricCard`. Cada card entera es un link (Fitts).

| # | Card | Valor | Sub | Accent/Ícono | Link |
|---|---|---|---|---|---|
| 1 | **Cobrado hoy** | `formatArs(numbers.collectedTodayCents)` | comparación honesta: `↑/↓ N% vs. semana pasada` o "Igual que la semana pasada" o "Sin dato de la semana pasada" (primera semana del tenant) | `emerald` / `Banknote` | `/caja` |
| 2 | **Turnos de hoy** | `9 de 12` (ocupadas de disponibles). Día cerrado: `Cerrado`. 0 disponibles con oferta real: solo el numerador (evita "N de 0" / "0%" engañoso) | `75% de ocupación` (+ ` · N bloqueados` si hay) | `slate` (neutro) / `Clock` | `/grilla` |
| 3 | **Plata en la calle** | `formatArs(numbers.streetMoneyCents)` — MISMA fuente que `/caja` y `/caja/deudas` (`getStreetMoney`, Fase 1); nunca se recalcula acá | "Pendiente de cobro" o "Nada pendiente" | `amber` si > 0, si no `emerald` / `Banknote` | `/caja/deudas` |

Reglas:

- **Comparación semanal, no diaria**: el negocio es semanal (mismo día de la semana pasada, nunca
  "ayer" — comparar un miércoles contra un martes es ruido). `compareToLastWeek`
  (`src/modules/home/home.lib.ts`) es la función pura que decide dirección/porcentaje; sin dato de
  la semana pasada (`sameWeekdayLastWeekCents === 0`) no se inventa un porcentaje.
- **Fuente única**: "Plata en la calle" viene de `getStreetMoney`/`sumStreetMoney` (Fase 1) — el
  mismo número en Hoy, en el encabezado de Caja y en `/caja/deudas`, garantizado por diseño
  (`getHoyData` la llama una sola vez y deriva todo lo demás de ese mismo array).
- Sin delta "vs ayer" en ninguna de las 3 — el negocio es semanal, no diario (ver arriba).

## §3 "Necesita tu atención" — taxonomía cerrada

Fuente de verdad: `docs/decisions/2026-08-02-taxonomia-alertas-hoy.md`. Exactamente 3 eventos v1,
en este orden de prioridad (P1→P3), y dentro de cada prioridad por antigüedad ascendente:

1. **Turno terminado sin cobrar** — inmediato (sin ventana de gracia). "Cobrar $X" → `/reservas/[id]`.
2. **Seña que falló** — inmediato. "Ver reserva" → `/reservas/[id]`.
3. **Caja de ayer sin cerrar** — solo T-1, binario. "Cerrar caja de ayer" → `/caja`.

Componente: `src/components/dashboard/NeedsAttention.tsx`. Cada fila: ícono ámbar + descripción +
botón de acción (`buttonVariants` default — jerarquía única de Fase 0, nunca un botón custom).

**Vacío = el premio** (contrato, verbatim, nunca parafraseado): *"Nada pendiente. Todo cobrado y
cerrado."* — vía `EmptyState` con ícono `CheckCircle2`. Una cuarta alerta NO se agrega sin pasar
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

- Los 3 números: `grid grid-cols-2 gap-3 lg:grid-cols-3`. En 375px, "Cobrado hoy" ocupa las 2
  columnas (es el número que domina — serial position, la plata primero); los otros dos van 1 y 1
  debajo.
- "Necesita tu atención"/"Mientras no estabas": filas de una línea con `min-h-11` táctil; en
  mobile el botón de acción baja a una segunda línea (`flex-col sm:flex-row`).
- Sin scroll horizontal en ningún viewport.

## §8 Motion

- Hover-lift heredado de `card-premium-interactive`/`card-entrance` (≤200ms), igual que el resto
  del admin. Nada de pulsos ni Realtime (v1: Realtime es solo de la grilla) — Hoy es
  server-render por request, refrescar = volver a entrar.

## §9 Accesibilidad

- Cards-link con `aria-label` (heredado de `MetricCard`).
- `tabular-nums` en todo número.
- Color nunca solo: las alertas llevan ícono + texto, no solo un tinte ámbar.
- Focus visible en todas las filas/links (ring token, heredado).

## §10 Datos (server, sin client fetch)

- **Fuente única de agregación**: `getHoyData(tenantId, tx, opts)`
  (`src/modules/home/home.service.ts`) — un solo `withTenantContext`, agrega en paralelo:
  `getDaySummary` ×2 (hoy y hace 7 días, para la comparación semanal), `getStreetMoney` (Fase 1,
  una sola vez), ocupación (reusa `daySlotsFor`/`occupancyForDay` de `day-bookings.ts`),
  `getDailyClose`/`getDayOpen` de ayer (alerta #3), y 2 queries nuevas (seña fallida hoy,
  reservas/cancelaciones/señas del feed).
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
4. `StatCard` sigue con clases raw de paleta (no tokens semánticos) — deuda heredada de F1,
   sin cambios acá.
