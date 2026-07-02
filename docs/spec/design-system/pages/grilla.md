# Grilla — spec de vista (page doc)

> Override de `design-system/MASTER.md` v2 para `/grilla`. Lo que este doc define, manda acá;
> para todo lo demás rige el MASTER. La grilla es la vista donde el admin vive 8 h/día:
> **cualquier decisión que enlentezca leer o cargar una reserva es un bug de diseño** (MASTER §1, principio 1).

**Versión:** 1.0 — 2026-07-02
**Código:** `src/app/(admin)/grilla/page.tsx` · `src/components/booking/BookingGrid.tsx` ·
`BookingCard.tsx` · `WeekStrip.tsx` · `BookingPopover.tsx` · `src/lib/booking/grid-cells.ts`
**Personalidad:** Admin ("El Mostrador") — densidad alta, motion ≤ 200 ms, cero decoración.

---

## 1. Anatomía

```
┌─ Header sticky (bg-background/95 + blur, bajo el topbar de 4rem) ──────────┐
│  h1 "Grilla" + fecha (§8.3)        [densidad] [Hoy]                        │
│  WeekStrip: ‹  Lun Mar Mié Jue Vie Sáb Dom  ›                              │
├─ Hint primera vez (solo si el día no tiene reservas, descartable) ─────────┤
├─ Grid card (overflow-auto, max-h 70dvh) ───────────────────────────────────┤
│  esquina │ Cancha 1        │ Cancha 2 (pausada)   ← headers sticky top     │
│  08:00–14:00 · Sin actividad · Mostrar            ← banda colapsada (§5)   │
│  15:00 │ [celda]           │ [celda]              ← eje horario sticky izq │
│  ──●───────────────────────────────────           ← línea de "ahora"       │
│  16:00 │ …                 │ …                                             │
├─ Leyenda (swatch + ícono + label por estado) ──────────────────────────────┤
```

- La tarea principal (cargar una reserva) se completa en 2 interacciones: tap en slot → guardar en el modal. Nunca agregar pasos intermedios.
- El slot **completo** es el blanco de click/tap (Fitts). Prohibido reducir la acción a un botoncito interno.

## 2. Estados de slot — mapa canónico

Implementa MASTER §2.6 con una regla de lectura fija:
**el COLOR comunica el estado de la plata; el ÍCONO + label comunican qué es.**
Semáforo financiero (§2.5): amber = te deben la seña, azul (`info`) = cobrás al llegar,
verde = plata asegurada/cobrada, rojo = deuda. El origen de la reserva ya no tiene hue propio
(el violeta "abonado" y el azul "reservado" de la v1 quedan **obsoletos**): el abonado se
reconoce por `Repeat` + "Abonado", no por un color que competía con el semáforo.

Identificador primario: **borde izquierdo de 3 px** (posición constante, legible para daltónicos);
el tinte de fondo es refuerzo. Siempre color + ícono + texto (§1.4). Tintes vía alpha del token
(`bg-warning/10`), nunca hex nuevos. El texto del label usa escala AA verificada (§2.4):
`*-800` en light, `*-300` en dark; el nombre va en `text-foreground` (es el dato primario).

| Estado (derivación) | Borde-l | Tinte | Label (color light/dark) | Ícono |
|---|---|---|---|---|
| Libre (`kind=free`, futuro, cancha online) | — | `bg-card`, borde `border-border/60` | — (aria: "Reservar turno HH:MM en X") | `Plus` centrado, 40 % → 100 % hover/focus |
| Esperando seña (`pending_payment`) | `border-l-warning` | `bg-warning/10` (dark `/15`) | "Esperando seña" `text-amber-800`/`text-amber-300` | `Clock` |
| Confirmada (`confirmed`, sin seña paga) | `border-l-info` | `bg-info/10` (dark `/15`) | "Confirmada" `text-blue-800`/`text-blue-300` | `HandCoins` |
| Señada (`confirmed` + deposit `paid`/`captured`) | `border-l-success` | `bg-success/10` (dark `/15`) | "Señada" `text-emerald-800`/`text-emerald-300` | `CheckCircle2` |
| Jugada (`completed`) | `border-l-success` | `bg-success/15` (dark `/20`) — fill más fuerte | "Jugada" `text-emerald-800`/`text-emerald-300` | `CheckCheck` |
| Ausente (`no_show`) | `border-l-destructive` | `bg-destructive/10` (dark `/15`) | "Ausente" `text-red-700`/`text-red-300` | `UserX` |
| Abonado (`type=fixed`, confirmada) | `border-l-info` | `bg-info/10` (dark `/15`) | "Abonado" `text-blue-800`/`text-blue-300` | `Repeat` |
| Bloqueado (`type=block`) | `border-l-slate-400` | `.slot-blocked-stripes` (rayado diagonal `--muted`) | "Bloqueado" `text-muted-foreground` | `Ban` |
| Pasado (modificador) | — | `opacity-60 saturate-50` sobre el estado base | — | — |
| Libre pasado / cancha pausada | — | transparente / `bg-muted/40`, no interactivo | — | — |

Prioridad cuando compiten: `block` > `no_show` > `completed` > `pending_payment` > señada > abonado > confirmada.
Un abonado ausente es "Ausente" (la deuda importa más que el origen).

**Desvío deliberado de §2.6:** el `Plus` del slot libre es **siempre visible** (40 % de opacidad),
no solo en hover — en touch no existe hover y el admin de 55 años necesita ver la affordance,
no adivinarla. Hover/focus lo llevan a 100 % + borde emerald.

## 3. Contenido de la celda — la hora no se repite

El eje horario sticky de la izquierda es la **única** fuente de la hora (fix del bug "hora
duplicada" de MASTER §13.5). Las celdas no renderizan `HH:MM`; el rango completo vive en el
`aria-label` (`"Cancha 1 16:00–17:00: Tomás García, Señada"`) y en el popover de detalle.

- **Densidad cómoda** (fila 3.25rem): línea 1 = nombre (`text-xs font-semibold text-foreground`, truncado a 24 chars); línea 2 = ícono 12 px + label de estado (`text-[11px]`).
- **Densidad compacta** (fila 2.75rem = 44 px, mínimo touch §10): una sola línea = ícono de estado + nombre. El label textual se omite (el ícono + borde siguen comunicando; aria completo).
- Sin precio en la celda (vive en el popover). Sin `font-display` (esto es tabla, §3).

Popover de detalle (hover con intent 300 ms / focus / tap): quién, horario, precio, pago, seña.
Sin cambios de comportamiento; superficies con tokens (`bg-popover`, `border-border`).

## 4. Densidad

- Toggle en el header: `Rows3` + label del modo actual ("Cómodo"/"Compacto") + tooltip (§7.4) — deja de ser un ícono mudo (§13.5).
- Preferencia persistida en `localStorage['tg-grilla-density']`; default cómodo.
- Alturas: cómodo `3.25rem`, compacto `2.75rem`. Nunca menos de 44 px: el slot es un target táctil.
- Columnas: eje `3.5rem` + `minmax(8.5rem, 1fr)` por cancha; scroll horizontal con `snap-x` (mobile).

## 5. Madrugada muerta colapsada

Las horas de la mañana **ya pasadas y sin ninguna reserva** no ocupan pantalla (§13.5: "los
horarios vacíos de la mañana obligan a scrollear"):

- Regla (`countCollapsibleLeading` en `grid-cells.ts`, pura y testeada): se colapsa la corrida
  **inicial** de slots donde `isPast && todas las canchas libres`. El slot en curso (empezado
  pero no terminado) nunca se colapsa. Mínimo 2 filas para colapsar; nunca se colapsa el día entero.
- UI: banda de 2rem a lo ancho de todas las columnas — `"08:00–15:00 · Sin actividad"` +
  botón "Mostrar" (`aria-expanded`). Expandir es por visita (se resetea al cambiar de día).
- Un slot pasado con reserva (Jugada/Ausente) **corta** el colapso: lo pendiente de revisión
  queda siempre visible (Zeigarnik §9).
- Días futuros: nada es pasado → sin banda. Días pasados: colapsa la mañana vacía igual.

## 6. Línea de "ahora" + scroll automático

- La línea roja (dot + rule) se posiciona con filas de **60 min**: `top = header + banda? + (minutosDesdePrimerSlotVisible / 60) × altoFila`. (Fix: la v1 dividía por 30 — bug que la dibujaba al doble de distancia.)
- **Scroll-to-now al cargar** (solo si la fecha es hoy): el contenedor scrollea para dejar la línea a ~30 % del alto visible. Una vez por carga de fecha; instantáneo (sin smooth: es paint inicial, no transición).
- En madrugada operativa (post-medianoche con `closes_next_day`) la línea no se dibuja (limitación conocida, heredada).

## 7. Realtime — atención sin ruido

- **Pulso** (§5.3 "Atención"): cuando aparece una reserva que no estaba (INSERT Realtime o
  refetch), la celda emite **un** pulso de ring emerald de 600 ms (`animate-slot-pulse`,
  keyframe `slot-pulse` en `tailwind.config.ts`, box-shadow → transparente; transform/opacity
  only, sin layout shift). Una sola vez, sin loop. `prefers-reduced-motion` lo congela (contrato
  global de `globals.css`). Nota: 600 ms > techo admin de 200 ms — excepción sancionada
  explícitamente por MASTER §5.3 para el patrón "algo cambió sin que lo toques" (Von Restorff).
- **aria-live**: región `sr-only` `aria-live="polite"` anuncia "Nueva reserva: HH:MM Cancha N" (§10).
- Estado degradado: banner amber "Sin conexión…" (existente, `role="status"`). No es error fatal → nunca rojo.

## 8. Guided UX (§7 del MASTER)

- **Hint primera vez**: si el día no tiene reservas, banda descartable sobre la grilla —
  "Tocá cualquier horario libre para cargar tu primera reserva." + "Entendido".
  Emerald suave (nunca warning), ≤ 90 chars, voseo, verbo primero. Persistencia
  `localStorage['tg-hint-grilla-primera-reserva']`; no vuelve tras descartarse (§7.1).
- **Tooltips** (Radix `ui/tooltip.tsx`, delay 300 ms hover / inmediato focus): obligatorios en
  todo icon-only — toggle de densidad, chevrons de semana. El tooltip NO reemplaza `aria-label`.
- Máximo un elemento de guía visible a la vez (§7.1): si hay hint, no hay coachmarks.

## 9. Copy (§8 extendido para esta vista)

Vocabulario canónico §8.5 + extensiones de grilla:

| Código | UI |
|---|---|
| `pending_payment` | **Esperando seña** |
| `confirmed` sin seña | **Confirmada** |
| `confirmed` + seña paga | **Señada** |
| `completed` | **Jugada** |
| `no_show` | **Ausente** |
| `type=fixed` | **Abonado** |
| `type=block` | **Bloqueado** |
| court `offline` | **(pausada)** — nunca "(offline)" |

Fechas: subtítulo del header en formato medio §8.3 ("mié 1 de julio"). Horas 24 h `HH:MM`,
rango con en-dash sin espacios ("16:00–17:00"). Plata solo en popover, formato §8.2 sin decimales.

## 10. Teclado y accesibilidad

- Flechas mueven el foco entre slots (roving por `data-col`/`data-row`, saltando filas cubiertas por spans y celdas no interactivas). Los índices son sobre las filas **visibles** (colapso incluido).
- Escape cierra el popover sin perder el foco. Contenedor scrolleable con `tabIndex=0` + `role="region"` + label con la fecha.
- Todo estado cumple §1.4 (color + ícono + texto/aria) y §2.4 (labels en escala AA verificada).
- Touch ≥ 44 px (fila compacta = 2.75rem exactos).

## 11. Leyenda

Lista al pie con swatch + **ícono** + label por cada estado de §2 (la leyenda enseña el mapeo
ícono↔estado — es parte del sistema que se explica solo, §7). Mismo orden que la tabla de §2.

## 12. Motion budget de la vista

| Interacción | Techo |
|---|---|
| Hover/focus de celdas, botones | 150 ms color-only |
| Navegación de día (transición atenuada) | 150 ms opacity |
| Popover detalle | 200 ms fade+zoom |
| Modal de reserva | 300 ms |
| Pulso Realtime | 600 ms, una vez (excepción §5.3) |

Nada flota, nada respira, cero loops fuera del skeleton.

## 13. Skeleton de carga

`loading.tsx` replica la silueta real (§5.3 "Espera"): banda de header + 7 píldoras de semana +
grid con eje horario y 3 columnas de filas — no una tabla genérica.

## 14. Deuda conocida de esta vista

- Coachmark de primera visita a la grilla (patrón §7.2) — pendiente, coordinar con el hint para no violar §7.1 (uno a la vez).
- `formatMoney` unificado (P0.3 del MASTER): el popover usa un `formatArs` local hasta la barrida global.
- Línea de "ahora" en madrugada operativa (`closes_next_day`): hoy no se dibuja.
- Realtime también debería pulsar cambios de estado (UPDATE), no solo altas — evaluar si es señal o ruido tras uso real.
