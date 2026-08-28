# Caja (admin) — spec de vista

> **Nota de alcance (2026-08-27):** este doc cubre la pestaña `/caja` (raíz) en detalle — su
> contenido seguía vigente contra el código real, no estaba "desactualizado" como tal. Lo que
> faltaba era que `/caja` es hoy 1 de 5 pestañas (rediseño "Caja y Cantina", 2026-07-22); las otras
> 4 (`/caja/deudas`, `/caja/devoluciones`, `/caja/cantina`, `/caja/productos`) se agregaron como
> resumen en el §2.5 nuevo de abajo, sin el mismo nivel de detalle que el resto de este doc.

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/caja`.
> Hermana de `pages/grilla.md`, `pages/dashboard.md` y `pages/horarios-precios.md` (2026-07-02):
> mismos tokens, mismo semáforo financiero §2.5, mismo vocabulario §8.5, misma `PageHeader`/`StatCard`.

## §0 Objetivo y anti-objetivo

La Caja responde tres preguntas, en este orden de lectura (barrido en F):

1. **¿Cuánto quedó?** — saldo neto del día, el número protagonista.
2. **¿Cómo se compone?** — ingresos / egresos / por qué método entró.
3. **¿Qué pasó?** — el diario de movimientos.

Y tiene un **ritual de cierre** (Peak-End §9): el último gesto del día del admin termina en un
resumen verde e inmutable — "listo, todo bien" — no en un form mudo ni en un badge gris.

Anti-objetivo: NO es Reportes (sin tendencias mensuales ni gráficos) y NO es contabilidad AFIP
(ADR-011). Es la caja registradora del mostrador: plata del día, arqueo y cierre.

## §1 Problemas del diseño anterior

| # | Problema | Regla violada |
|---|---|---|
| 1 | Título `Caja — 2026-07-01` (ISO cara al usuario) | §8.3 (ISO prohibido) |
| 2 | KPIs con formato propio (cards ad-hoc, no `StatCard`) | §6.4 (KPI = StatCard único) |
| 3 | 3 `formatARS` locales duplicados (page, CloseDayButton, Canteen) | §8.2 / P0.2 (helper único) |
| 4 | Dos CTAs sólidos compitiendo (verde "Agregar" + negro "Cerrar caja") | §6.2 (un primario por vista) |
| 5 | Cierre con `variant="destructive"` (botón rojo) y resumen post-cierre gris `bg-muted` | §9 Peak-End (cierre = resumen verde) |
| 6 | `divide-slate-100` / `border-slate-100` hardcodeados en la tabla (invisible en dark) | §6.1 (tokens) |
| 7 | Hover de productos de cantina solo light (`hover:bg-emerald-50/50` sin par dark) | §2.2 |
| 8 | `categoryLabel` no conocía `abonado_payment` → mostraba el enum crudo en la UI | §8.1 (cero anglicismos) |
| 9 | Empty state mudo ("No hay movimientos registrados para este día.") | §7.2 (vacío didáctico) |
| 10 | `p-6` propio sobre el `main` del shell (que ya da `px-4 py-8`) → doble padding | layout hermanos |
| 11 | Modal de movimiento con 3 `<select>` (tipo/categoría/método): lento con guantes/celular | Hick + Fitts |

## §2 Anatomía

```
┌────────────────────────────────────────────────────────────────────┐
│ [icon] Caja                    [← Anterior | Hoy | Siguiente →]    │ PageHeader
│        Hoy — mié 2 de julio    [+ Agregar movimiento] [Cerrar caja]│ (primary + outline)
├────────────────────────────────────────────────────────────────────┤
│ ✦ Al final del día, cerrá la caja: guarda el resumen… [Entendido]  │ hint 1ª vez (§6)
├────────────────────────────────────────────────────────────────────┤
│ (si cerrada) ✔ Caja cerrada — el efectivo cuadró · 23:40           │ CierreCard verde (§5)
├──────────────────────┬──────────────────────┬──────────────────────┤
│ Saldo neto del día   │ Ingresos             │ Egresos              │ 3 StatCard (§3)
│ $ 45.000,00          │ $ 52.000,00          │ $ 7.000,00           │
│ ↑ +$ 5.000 vs ayer   │ ↑ +$ 4.000 vs ayer   │ ↑ +$ 1.000 vs ayer   │ (egresos: ↑ rojo)
├──────────────────────┴──────────────────────┴──────────────────────┤
│ Cantina/Bar (venta con un toque)                       [Configurar]│ solo día abierto
├────────────────────────────────────────────────────────────────────┤
│ Desglose por método   Efectivo $ X · Transf. $ Y · MP $ Z          │ strip (§4)
├────────────────────────────────────────────────────────────────────┤
│ Movimientos del día                                                │ tabla densa (§4)
│ 21:30  Cancha 2 — Tomás   [Reserva]    Efectivo      +$ 25.000,00  │
│ 20:15  Gatorade x2        [Cantina/Bar] MP           +$ 5.000,00   │
│ 18:00  Hielo              [Gasto oper.] Efectivo     −$ 3.000,00   │
└────────────────────────────────────────────────────────────────────┘
```

- Root: `<div className="space-y-6">` — el `main` del shell ya da `max-w-7xl px-4 py-8`
  (mismo contrato que `dashboard`). Muere el `p-6` propio.
- **PageHeader**: título "Caja", ícono `Banknote`, subtitle humano §8.3 con prefijo relativo:
  `"Hoy — mié 2 de julio"` / `"Ayer — mar 1 de julio"` / `"mié 25 de junio"` (`cajaDateLabel`,
  armado por partes como el dashboard — el string completo del locale varía entre ICUs).
- **Nav de día**: segmented control de texto (`← Anterior · Hoy · Siguiente →`) — texto
  auto-explicativo, cero deuda de tooltip (§7.4 aplica a icon-only). "Hoy" en emerald cuando
  se está mirando hoy (`aria-current="date"`).
- **Jerarquía de acciones** (fix #4): "+ Agregar movimiento" = **primario** (`bg-primary`, tokens
  AA §2.4 — es la acción frecuente durante el día). "Cerrar caja" = **outline** (es una vez por
  día; su peso lo pone el ritual, no el botón). Con caja cerrada ambos desaparecen (guard
  existente intacto).

## §2.5 Tab bar y pantallas hermanas (agregado 2026-08-27 — el resto de este doc solo cubría la pestaña raíz `/caja`)

Desde el rediseño "Caja y Cantina" (2026-07-22, migrs. 048-051), `/caja` es una de **5 pestañas**
(`CajaTabs`, `src/app/(admin)/caja/components/CajaTabs.tsx`, mismo patrón que `SettingsTabs`),
todas bajo el mismo item de sidebar "Caja y Cantina". Este doc (§0-§9 de abajo) solo describe la
primera; las otras 4 no tenían spec — resumen mínimo, no el detalle línea a línea de las demás
secciones:

| Ruta | Label del tab | Qué muestra |
|---|---|---|
| `/caja` | Caja del día | Lo que describe el resto de este doc (KPIs, movimientos, cierre) |
| `/caja/deudas` | Plata en la calle | Turnos jugados sin cobrar + fiados de cantina abiertos + cuotas de torneo impagas, en una lista con "Cobrar" por fila. Tenant-wide (no depende del día seleccionado en `/caja`) — misma fuente (`getStreetMoney`) que alimenta el número del encabezado perpetuo de `/caja`. Ventana por defecto: últimos 12 meses (`?todas=1` trae todo, B11). |
| `/caja/devoluciones` | Devoluciones | Señas que el complejo TODAVÍA debe devolver — vive separada de "Plata en la calle" a propósito (son opuestos: lo que le deben al complejo vs. lo que el complejo debe; mezclarlos rompería el invariante que compara el total por dos caminos). El reembolso automático por API de MP se eliminó (403 siempre — ver CLAUDE.md), esta pantalla es donde el admin marca que ya devolvió una seña a mano. |
| `/caja/cantina` | Cantina | Venta por ticket multi-ítem (un toque por producto) + fiados (`canteen_tabs`). |
| `/caja/productos` | Productos y stock | Catálogo de productos, ledger de stock (`stock_movements`, reposición/mermas/consumo interno), y un reporte de ventas con rango 7/30 días. |

Las 5 comparten guard (`requireCajaContext`, en `../queries`) y renderizan `<CajaTabs active="...">`
como segunda card bajo el `PageHeader` de cada una.

## §3 KPIs — StatCard, semáforo §2.5

Tres `StatCard` (formato único §6.4). Orden desktop: **Ingresos · Egresos · Saldo** (orden
aritmético: A − B = C; el resultado cierra la fila — serial position §9). En mobile el saldo
va primero y a lo ancho (`order-first col-span-2`): la pregunta №1 arriba del fold.

| Card | Accent/Ícono | Valor | Delta (coloreado) | Sub (muted) |
|---|---|---|---|---|
| Ingresos | `emerald` / `ArrowDownToLine` | income+adjustments, contable | vs ayer | vs prom. semanal |
| Egresos | `red` / `ArrowUpFromLine` | expense, contable | vs ayer **invertido** | vs prom. semanal |
| Saldo neto del día | `emerald` / `Wallet` + ring emerald sutil | balance; negativo = `−$…` rojo con signo | vs ayer | vs prom. semanal |

- **`StatCard.delta` gana `tone` opcional** (`positive|negative|neutral`): el glifo ↑/↓ dice qué
  hizo el número, el color dice si es bueno o malo. Sin esto, "subieron los egresos" salía verde
  (up=emerald hardcodeado). Backward-compatible: sin `tone`, deriva del direction como siempre.
- El saldo es **el que grita** (§2.3): único con ring emerald (`ring-1 ring-emerald-600/20`) y
  el único que puede ponerse rojo. Misma primitiva, énfasis por clase — el formato no se bifurca.
- Delta se omite cuando `current === 0 && reference === 0` (tenant nuevo: "→ $ 0 vs ayer" ×3 es
  ruido puro).
- Deltas y subs **sin decimales** (`formatArs`): son comparativas, no asientos. Los valores sí
  van contables (§7).

## §4 Desglose por método + movimientos

**Strip de método** (card plana §6.4 — info de trabajo, no panel): grid de hasta 4 celdas en
orden fijo Efectivo → Transferencia → MercadoPago → Otro (solo los presentes), cada una
ícono + label + neto contable. Caption: "Neto del día: ingresos menos gastos por método."
Es la referencia del arqueo — el número de "Efectivo" es el que se compara contra el cajón.
Solo se renderiza si hubo movimientos.

**Movimientos** (tabla desktop / cards mobile):

- Columnas: **Hora · Descripción · Categoría · Método · Monto** (diario cronológico; monto
  right-align tabular). Densidad §6.6: `py-2.5`, `divide-border` (fix #6).
- **Montos con signo y color SIEMPRE** (§2.5): egresos `−$ …` rojo; ingresos y ajustes `+$ …`
  emerald (700 light / 400 dark). En una tabla mayormente verde, el gasto es el distinto que
  salta (Von Restorff al servicio del control de costos).
- Badges de categoría: Reserva (emerald) · Cantina/Bar (sky) · Gasto operativo (red) ·
  Corrección por ausencia (amber) · Otro/Ajuste (muted).
- Empty didáctico (fix #9), según estado del día:
  - Día abierto: "Sin movimientos por ahora" + "Los cobros de reservas se registran solos.
    Las ventas de cantina y los gastos se cargan desde los botones de arriba."
  - Día cerrado: "Este día no tuvo movimientos."

## §5 Cierre de caja — el peak-end

### Diálogo (ritual, no amenaza)

- `ConfirmDialog` pasa de `variant="destructive"` a **`default`** (fix #5): cerrar el día no es
  destruir — el guard de inmutabilidad ya lo pone el type-to-confirm `CERRAR` (que se mantiene,
  contrato e2e `#confirm-phrase`).
- **Actualizado (migr. 049, apertura de caja):** el diálogo pasó a 3 pasos numerados ("1. Esperado
  — ya calculado" / "2. Contá e ingresá lo real" / "3. Confirmar"). El bloque "Esperado" suma, además
  de Ingresos/Egresos/Saldo neto/"En efectivo según los movimientos" (`byMethod.cash`), **Fondo
  inicial** (`daily_cash_opens.opening_cash`, si el día se abrió) y **Efectivo esperado**
  (`openingCash + byMethod.cash`) — es contra ESTE número, no contra `byMethod.cash` a secas, que
  compara `#declared`.
- `#declared` opcional, diferencia ≠ 0 → warning amber **"Diferencia de $X con el efectivo
  esperado: falta/sobra plata. La nota es obligatoria."** (texto actualizado; el test e2e ancla por
  regex `/Diferencia/i`, no por el string exacto — contrato caja-crud #4 sigue intacto)
  + `#close-note` obligatoria.

### CierreCard (el artefacto)

Al cerrar (`router.refresh()`), la vista abre con la **CierreCard**: card verde
(`border-emerald-600/30 bg-emerald-600/5`, dark `bg-emerald-500/10`) primera bajo el header,
`CheckCircle2` + título según resultado:

**Actualizado (migr. 049):** `closeView()` (`caja-lib.ts`) bifurca por `expectedCash`. `NULL` (cierre
legacy, pre-049) reproduce el comportamiento histórico exacto de la tabla original:

| Caso (legacy, `expectedCash IS NULL`) | Título | Extra |
|---|---|---|
| Contó efectivo y cuadró (`diff === 0`, declaró) | "Caja cerrada — el efectivo cuadró" | — |
| No declaró efectivo (`declaredCash === 0 && diff === balance`) | "Caja cerrada" | se ocultan las filas Efectivo/Diferencia (heurística: el server guarda 0 cuando no se declara — indistinguible de "declaró 0"; mostrar "dif. $ saldo" sería una alarma falsa) |
| Diferencia anotada (`diff !== 0`) | "Caja cerrada — con diferencia anotada" | fila "Diferencia" amber + nota visible |

Cierres NUEVOS (`expectedCash` no NULL — el día tuvo apertura de caja) usan mensajes distintos, y
el `<dl>` suma las filas Fondo inicial/Efectivo esperado/Diferencia:

| Caso (v2, `expectedCash` no NULL) | Título |
|---|---|
| `diff === 0 && declaredCash > 0` | "Caja cerrada — el efectivo cuadró" |
| `declaredCash === 0` (sin arqueo) | "Caja cerrada — sin arqueo declarado" |
| `diff > 0` (sobró plata) | "Caja cerrada — sobraron $X" |
| `diff < 0` (faltó plata) | "Caja cerrada — faltaron $X" |

Cuerpo: hora de cierre + `dl` Ingresos / Egresos / Saldo neto / Efectivo contado (+ diferencia)
/ Nota. Subtítulo: "El día quedó bloqueado: los movimientos ya no se pueden tocar." La card ES
la celebración del admin — resumen verde, sin confetti (presupuesto motion §5.2; la celebración
animada es del jugador).

Los KPIs siguen debajo (la card es el recibo inmutable; los KPIs traen la comparativa vs
ayer/promedio). El pill "Caja cerrada" del header muere: lo dice la card, más grande y mejor.

## §6 Guided UX

- **Hint de primera visita** (cierra MASTER §13 P2.8): banda inline `role="note"` emerald suave
  (mismo patrón/receta que la grilla), solo con la caja abierta:
  _"Al final del día, cerrá la caja: guarda el resumen y bloquea los movimientos."_ + "Entendido".
  `localStorage` key **`tg-hint-caja-cierre`**; arranca oculto y aparece post-mount (sin flash).
- Un solo elemento de guía por pantalla (§7.1): el hint no convive con coachmarks nuevos.

## §7 Modal "Agregar movimiento" — de selects a chips

Tipo, categoría y método pasan de `<select>` a **chips botón** (`aria-pressed`, mismo patrón que
el método de pago de la venta rápida de cantina): 1 tap por decisión, opciones visibles sin
desplegar (Hick: son 3/≤3/4 opciones — caben todas), touch 44px (h-11).

- **Tipo**: Ingreso · Gasto · Ajuste. Cambiar tipo re-selecciona la primera categoría válida
  (contrato `VALID_COMBOS` del service).
- **Categoría**: dinámica por tipo. Gasto tiene una sola ("Gasto operativo"): queda un único chip
  auto-presionado — se lee como tag, no como decisión.
- **Método**: Efectivo · Transferencia · MercadoPago · Otro (grid 2×2 en mobile).
- Monto (`#cf-amount`, label "Monto (pesos)") y Descripción (`#cf-desc`) intactos, ids incluidos.
- Receta chip (única en la app, compartida con cantina): activo
  `border-emerald-600 bg-emerald-600/10 text-emerald-800 dark:border-emerald-500
  dark:bg-emerald-500/15 dark:text-emerald-300`; inactivo `border-border bg-card
  text-muted-foreground hover:bg-accent`. La venta rápida de cantina migra a esta misma receta.

## §8 Formato (§8.2 normativa)

- **Contable** (`formatArsContable`, nuevo en `lib/format` — fuente única): movimientos, totales
  KPI, strip de método, diálogo y card de cierre → `$ 12.500,00`.
- **Entero** (`formatArs`): precios de productos de cantina (son lista de precios, no asientos),
  botón "Registrar venta", deltas/subs de KPI.
- Mueren los 3 `formatARS` locales (P0.2 avanza).
- Negativos SIEMPRE con signo `−` (U+2212) + color; los helpers reciben montos positivos y el
  caller pone el signo (convención existente).

## §9 Contratos de test

- e2e `caja-crud`: #2/#3/#4 pasan sin cambios (nombres de botón, `#confirm-phrase`, `#declared`,
  `#close-note`, textos "Diferencia"/"nota es obligatoria", "Caja cerrada" — ahora lo aporta la
  CierreCard). #1 se actualiza a chips (click "Otro ingreso" en vez de `selectOption`).
- e2e `caja-redesign`: cantina intacto; #2 usa chips ("Gasto" → chip "Gasto operativo"
  `aria-pressed=true`).
- mobile smoke: trigger `/movimiento/i` y touch targets de cantina intactos.
- Unit nuevos: `caja-lib.test.ts` (fecha humana, breakdown, labels, deltas) y
  `caja-render.test.tsx` (chips → payload correcto de la action; variantes de CierreCard).

## §10 Deuda declarada / fuera de scope

1. **RESUELTO (migr. 049, `daily_cash_opens` — apertura de caja):** este punto quedó saldado.
   `diff_amount` de un cierre nuevo ya compara `declaredCash` contra `expectedCash` (=
   `openingCash + byMethod.cash`, `daily-close.service.ts`), no contra el saldo total mezclando
   métodos. Los cierres anteriores a la migración (`expected_cash IS NULL`) mantienen la semántica
   vieja (`balance − declared`) — `closeView()` los bifurca, nunca se reinterpretan (ver §5).
2. `EmptyState` y `ConfirmDialog` siguen con clases light hardcodeadas (P0.1 §13 — se tokenizan
   en su propio barrido de primitives, no acá).
3. El nombre de quién cerró (`closedBy`) no se muestra (solo hora): requiere join a
   `staff_users`; con 2 roles y 1-2 personas por complejo, el valor es bajo. Post-v1 si duele.
4. `occurredAtForDate` registra a mediodía ART en días pasados (existente, sin cambio).
5. Realtime en caja: no (v1 — patrón dashboard: server-render por request).
