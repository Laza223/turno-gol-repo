# Grilla — spec de vista (page doc)

> Override de `design-system/MASTER.md` v2 para `/grilla`. Lo que este doc define, manda acá;
> para todo lo demás rige el MASTER. La grilla es la vista donde el admin vive 8 h/día:
> **cualquier decisión que enlentezca leer o cargar una reserva es un bug de diseño** (MASTER §1, principio 1).

**Versión:** 2.1 — 2026-09-14 (el alta rápida se elimina: tocar un casillero abre el modal único por
tipo, §3bis. Decisión `docs/decisions/2026-09-14-alta-grilla-modal-unico-y-reservas-por-cancha.md`).
2.0 — 2026-09-11 (rediseño: los controles suben a la barra superior del panel, la misma
matriz sirve para escritorio y teléfono, y el selector de densidad se elimina. La v1.0 — 2026-07-02 —
describe una pantalla que ya no existe)
**Código:** `src/app/(admin)/grilla/page.tsx` · `GrillaTabs.tsx` · `src/components/booking/BookingGrid.tsx` ·
`grid/GridHeaderBar.tsx` · `grid/GridScroller.tsx` · `grid/GridLegend.tsx` · `BookingCard.tsx` ·
`WeekStrip.tsx` · `BookingSlotPanel.tsx` · `BookingFormModal.tsx` · `src/lib/booking/grid-cells.ts` ·
`src/hooks/use-grid-layout.ts`
**Personalidad:** Admin ("El Mostrador") — densidad alta, motion ≤ 200 ms, cero decoración.

---

## 1. Anatomía — la vista no tiene encabezado propio

La regla que manda esta sección: **la Grilla no abre ni una fila sobre la matriz.** Todo lo que era
encabezado vive en la barra superior del panel (MASTER §6.8, hueco `AdminHeaderSlot`). La v1 tenía
cuatro filas propias —título "Grilla", la fecha, el segmento de pestañas y la tira semanal— que se
llevaban unos 180 px de alto en la única pantalla donde lo que importa es ver más horas de una.

**Escritorio (`lg`+)** — todo arriba, en la barra de 60 px:

```
╔═ Barra superior del panel (60px, fija) ════════════════════════════════════╗
║ COMPLEJO │ [Grilla|Reservas]  ‹ L M M J V S D ›  [Hoy]   [Por cobrar…] [···]║
╚════════════════════════════════════════════════════════════════════════════╝
┌─ Hint primera vez (solo si el día no tiene reservas, descartable) ─────────┐
├─ Matriz (GridScroller, ocupa todo el alto restante) ───────────────────────┤
│  esquina │ Cancha 1  F5    │ Cancha 2 (pausada)   ← headers sticky top     │
│  08:00–15:00 · Sin actividad · Mostrar            ← banda colapsada (§5)   │
│  15:00 │ [celda]           │ [celda]              ← eje horario sticky izq │
│  ──●───────────────────────────────────           ← línea de "ahora"       │
│  16:00 │ …                 │ …                                             │
```

**Teléfono** — la barra superior ya la ocupan el logo y el segmento, así que la navegación del día
baja a una fila sobre la matriz, que es donde llega el pulgar:

```
╔═ Barra superior ═══════════════════════════════════════════════════════════╗
║ [logo]  [Grilla|Reservas]                                          [tema]  ║
╚════════════════════════════════════════════════════════════════════════════╝
│  ‹        vie 12 de junio  [hoy]        ›          ← 44px cada chevron     │
│              [Por cobrar hoy $ X · N]              ← solo si hay pendiente │
├─ Matriz, misma que escritorio, columnas de 48px ───────────────────────────┤
```

- Tocar un casillero libre abre **directo** el modal de alta (§3bis), con "Turno" ya elegido y el foco en el nombre: el caso común sigue siendo tap → nombre → Enter. No hay superficie intermedia (el popover de alta rápida se eliminó el 2026-09-14): el admin abre la grilla para cargar lo que no entró online, y ahí manda que el alta sea completa y se entienda.
- El slot **completo** es el blanco de click/tap (Fitts). Prohibido reducir la acción a un botoncito interno.
- **El título de la vista es el segmento** `Grilla | Reservas` (`GrillaTabs.tsx`, portalizado). Por eso el rótulo de la matriz pasó de "Calendario" a "Grilla": el `<h1>` desapareció y este segmento quedó como el único lugar donde la pantalla se nombra. **No reponer un `<h1>`**: sería volver a poner la fila que se sacó.
- **"Por cobrar hoy"** (`GridHeaderBar.tsx`, prop `pendingSummary`, sumado en `BookingGrid.tsx` con `sumPendingCents` de `src/lib/booking/grid-cells.ts`): suma de lo pendiente entre las reservas **del día visible**, no de todo el complejo. Sólo aparece con `count > 0`. El "hoy" del rótulo lo distingue explícitamente de "Deudas" en Caja, que sí suma toda la deuda del complejo (H040): misma palabra, alcance distinto, y ahora cada uno dice el suyo.
  - Dejó de ser texto plano: **es un botón que resalta** (`aria-pressed`). Encendido, los turnos que deben plata reciben un anillo (`ring-2 ring-inset ring-destructive/70`, prop `spotlighted` de `BookingCard`) — el resto queda igual. **Resaltar lo que importa, nunca apagar lo demás**: bajarle la opacidad a las otras celdas hunde el contraste del texto por debajo de AA, porque los tokens de color están calibrados justo arriba del mínimo y cualquier `/N` los diluye (MASTER §2.4). Ese fue el primer intento y lo volteó axe.
  - Alto 44 px en touch, 36 en `lg` para entrar en la barra de 60 (MASTER §10).
- **"···"** (`Ellipsis`, 44×44): abre un `Popover` con la leyenda (§11). La leyenda dejó de ser una fila fija al pie — la lee alguien nuevo durante su primera semana y después nadie, y ahí abajo le sacaba una línea entera de alto a la matriz en 1366×768.
- El total del día **no existe en esta vista**. Vivía arriba a la izquierda y se eliminó entero (componente, endpoint, bus de eventos): lo pendiente ya está en el chip y lo cobrado es de Caja. Decisión del dueño, 2026-09-11. No reponerlo.

## 2. Estados de slot — mapa canónico

Implementa MASTER §2.6 con una regla de lectura fija:
**el COLOR comunica el estado de la plata; el ÍCONO + label comunican qué es.**
Semáforo financiero (§2.5): amber = te deben la seña, azul (`info`) = cobrás al llegar,
verde = plata asegurada/cobrada, rojo = no-show/ausente. El origen de la reserva ya no tiene hue propio
(el violeta "abonado" y el azul "reservado" de la v1 quedan **obsoletos**): el abonado se
reconoce por `Repeat` + "Abonado", no por un color que competía con el semáforo.

Identificador primario: **borde izquierdo de 3 px** (posición constante, legible para daltónicos);
el tinte de fondo es refuerzo. Siempre color + ícono + texto (§1.4). Tintes vía alpha del token
(`bg-warning/10`), nunca hex nuevos. El texto del label usa escala AA verificada (§2.4):
`*-800` en light, `*-300` en dark; el nombre va en `text-foreground` (es el dato primario).

| Estado (derivación)                              | Borde-l                | Tinte                                                                   | Label (color light/dark)                           | Ícono                                     |
| ------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| Libre (`kind=free`, futuro, cancha online)       | —                      | `bg-card`, borde `border-border/60`                                     | — (aria: "Reservar turno HH:MM en X")              | `Plus` centrado, 40 % → 100 % hover/focus |
| Esperando seña (`pending_payment`)               | `border-l-warning`     | `bg-warning/10` (dark `/15`)                                            | "Esperando seña" `text-amber-800`/`text-amber-300` | `Clock`                                   |
| Confirmada (`confirmed`, sin seña paga)          | `border-l-info`        | `bg-info/10` (dark `/15`)                                               | "Confirmada" `text-blue-800`/`text-blue-300`       | `HandCoins`                               |
| Señada (`confirmed` + deposit `paid`/`captured`) | `border-l-success`     | `bg-success/10` (dark `/15`)                                            | "Señada" `text-emerald-800`/`text-emerald-300`     | `CheckCircle2`                            |
| Jugada (`completed`)                             | `border-l-success`     | `bg-success/15` (dark `/20`) — fill más fuerte                          | "Jugada" `text-emerald-800`/`text-emerald-300`     | `CheckCheck`                              |
| **Sin cobrar (`unpaid_alarm`)**                  | `border-l-destructive` | `bg-destructive/10` (dark `/15`) + `.slot-alarm-ring` (anillo pulsante) | "Sin cobrar" `text-red-700`/`text-red-300`         | `CheckCheck`                              |
| Ausente (`no_show`)                              | `border-l-destructive` | `bg-destructive/10` (dark `/15`)                                        | "Ausente" `text-red-700`/`text-red-300`            | `UserX`                                   |
| Abonado (`type=fixed`, confirmada)               | `border-l-info`        | `bg-info/10` (dark `/15`)                                               | "Abonado" `text-blue-800`/`text-blue-300`          | `Repeat`                                  |
| **Torneo (`type=tournament`)**                   | `border-l-warning`     | `.slot-blocked-stripes` + `bg-warning/10` (dark `/15`)                  | "Torneo" `text-amber-800`/`text-amber-300`         | `Trophy`                                  |
| Bloqueado (`type=block`)                         | `border-l-slate-400`   | `.slot-blocked-stripes` (rayado diagonal `--muted`)                     | "Bloqueado" `text-muted-foreground`                | `Ban`                                     |
| Pasado (modificador)                             | —                      | `opacity-60 saturate-50` sobre el estado base                           | —                                                  | —                                         |
| Libre pasado / cancha pausada                    | —                      | transparente / `bg-muted/40`, no interactivo                            | —                                                  | —                                         |

Prioridad cuando compiten (Fase 3, `src/lib/booking/slot-visual.ts` — fuente única, reemplazó 3
copias que ya habían divergido): torneo > bloqueo > **alarma (sin cobrar)** > ausente > jugada >
pagando ahora > señada > abonado > cancelada/expirada > confirmada. La alarma existe para el turno
que ya se prestó (`completed` con saldo pendiente, o `no_show` sin un peso cobrado) y antes se
pintaba igual que uno cobrado; un `no_show` que sí capturó la seña NO alarma (ya se cobró lo único
cobrable). Un abonado ausente es "Ausente" (la ausencia importa más que el origen).

**Desvío deliberado de §2.6:** el `Plus` del slot libre es **siempre visible** (40 % de opacidad),
no solo en hover — en touch no existe hover y el admin de 55 años necesita ver la affordance,
no adivinarla. Hover/focus lo llevan a 100 % + borde emerald.

## 3. Contenido de la celda — la hora no se repite

El eje horario sticky de la izquierda es la **única** fuente de la hora (fix del bug "hora
duplicada" de MASTER §13.5). Las celdas no renderizan `HH:MM`; el rango completo vive en el
`aria-label` (`"Cancha 1 16:00–17:00: Tomás García, Señada"`) y en el panel de detalle.

**DOS renglones, nunca tres, en los dos tamaños.** Lo que cambia con el ancho es QUÉ va en el
segundo. Tres renglones se recortaban en la fila, y un dato recortado es peor que ausente.

| Ancho    | Renglón 1                                                                                          | Renglón 2                                                    |
| -------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `lg`+    | nombre (`text-[13px] font-semibold`) · **saldo** a la derecha, en el color del estado y en negrita | ícono 12 px + label de estado (`text-[11px]`)                |
| Teléfono | nombre (`text-[11px]`)                                                                             | ícono + **saldo** (`text-[10px]`); el label textual se omite |

- **El saldo entró a la celda** y ya no vive sólo en el panel: es lo que se busca de lejos en una matriz de 7 canchas. En el teléfono no entra al lado del nombre, así que baja al segundo renglón y desplaza al label — que el color y el ícono ya comunican (§2, regla de lectura).
- La diferencia por ancho se resuelve **por CSS** (`hidden lg:inline` / `lg:hidden` sobre nodos duplicados), no por un hook de viewport: un hook responde recién después del primer pintado y se ve el salto. El `aria-label` lleva el dato una sola vez, así que el lector de pantalla no lo escucha duplicado.
- El nombre se trunca a 24 chars **en el límite de palabra**, con "…" que marca el corte (H058).
- Sin `font-display` (esto es tabla, §3 del MASTER).

**Panel lateral del turno** (`BookingSlotPanel.tsx`, Sheet — click/tap, ya no hover): quién,
horario, precio, pago, seña y las acciones, sin salir de la grilla. Reemplaza al popover de
sólo-lectura que abría con hover intent 300 ms — el hover se sacó a propósito: es una affordance que
no existe en touch (el admin del mostrador usa tablet), y un panel que solo mira obliga a irse a
`/reservas` justo cuando hay alguien esperando para pagar (Fase 3, criterio de salida #2).
Superficies con tokens (`bg-card`, `border-border`).

- **Cobrar, en dos toques** (`SlotChargeSection.tsx`): chips de método (Efectivo · Transferencia · MercadoPago, con Efectivo ya elegido) y **un botón que dice el monto adentro** — "Cobrar $ 15.000 y dar por jugado" / "…por adelantado" / "Cobrar $ 15.000" cuando se cobra el pendiente completo (`chargeCta` en `charge-copy.ts`). El monto va EN el botón porque es lo que evita tener que leer una tabla para saber qué se está por cobrar. El verbo es **siempre "cobrar"** (H017): "cerrar" está reservado y el título y el botón del mismo panel no pueden decir cosas distintas.
- **El monto queda A LA VISTA, en los tres modos** (D3, 2026-09-15): el campo (`SplitPaymentFields`, siempre montado) arranca precargado con el pendiente completo — se corrige para abajo, no se escribe de cero — y admite hasta 5 líneas con "Agregar pago dividido", también en `advance` (el backend ya acepta N líneas ahí). Si se tipea menos que el pendiente, el botón cambia a "Cobrar $ 20.000 · quedan $ 64.000" (en `finish`, "… y dar por jugado · quedan $ X de deuda": el turno se da igual por jugado, el saldo pasa a ser deuda). Enfocar el campo selecciona todo el texto: la primera tecla reemplaza el monto precargado en vez de editarlo en el sitio (evita el bug de agrupamiento de miles de `money.ts` al corregir un valor ya formateado).
- **Cobrar de a partes** (2026-09-16): debajo del botón grande, **"Dividir pago por equipo"** y **"Pagó uno — $Y"** (este con el monto ADENTRO del rótulo). "Dividir pago por equipo" parte el cobro en dos filas rotuladas **Equipo 1 / Equipo 2** —monto, método y un "Cobrar" propio cada una—, igual que el pago dividido: se cobra a cada equipo cuando paga, o a los dos juntos con el botón grande. Los complejos casi nunca cobran el turno entero de una: o juntan por equipo, o cada jugador paga lo suyo cuando llega, que es lo más frecuente. Por eso son botones, además del monto editable de arriba. "Dividir pago por equipo" desaparece con el primer cobro (ahí el botón grande ya dice lo que falta); **"Pagó uno" se queda**, porque es el que se toca una vez por jugador. El resumen de plata rotula **"Pagaron 4 de 10"** ("Equipo 1 pagó · falta Equipo 2" en la mitad justa), sin repetir el monto — ya está arriba, en grande. Nada de esto se guarda: no hay cliente por equipo ni por jugador, y la seña **no** cuenta como gente que pagó. La parte sale de `courts.capacity`; sin ese dato el botón no se ofrece y el rótulo vuelve a hablar de equipos. Decisión: `docs/decisions/2026-09-15-cobro-por-equipo.md`
- **Acciones plegadas** (`SlotActionButtons.tsx`): cargar cantina queda a la vista; **reprogramar, marcar ausente y cancelar** se pliegan detrás de **"Más"**. Eran cinco botones compitiendo por la misma atención, tres de ellos rojos, para tareas de una vez por semana. Un toque de más en lo semanal a cambio de que lo diario no tenga que elegir entre cinco (Hick, MASTER §9).
- **Liberar el bloqueo** y **deshacer la ausencia** NO se pliegan: en esos estados son la única acción que existe, y esconder la única acción no es resta.

## 3bis. Alta — un modal, cuatro tipos

`BookingFormModal.tsx` (+ `create-modal/`). Reemplaza al alta rápida (popover/sheet) y al modal viejo
de chips + "Opciones avanzadas". Arranca preguntando **"¿Qué vas a agendar?"**; cada tipo muestra
solo sus campos, sin colapsables ni avisos en ámbar.

| Tipo                | Explicación (una línea)                     | Guarda                          | Campos                                                                                                                             |
| ------------------- | ------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Turno** (default) | Una hora de cancha para alguien             | `spontaneous`, 60 min           | a nombre de quién (jugador o nombre), teléfono, horario, precio de la grilla (editable), ¿cobraste algo ahora?, nota               |
| **Turno fijo**      | Todas las semanas, mismo día y hora         | abonado (`createAbonadoAction`) | nombre y teléfono, día y horario del casillero, precio por turno, desde/hasta, cómo paga                                           |
| **Evento**          | Varias horas: escuelita, torneo, cumpleaños | `spontaneous`, N horas enteras  | qué es (chips que precargan el nombre), responsable, teléfono, hasta, precio total sugerido o "No se cobra", ¿cobraste algo ahora? |
| **Bloquear cancha** | Nadie puede usarla: mantenimiento, cierre   | `block`                         | motivo, hasta. **Nunca plata ni contacto**                                                                                         |

- **Escritorio:** grande (`max-w-6xl`): tipos a la izquierda, campos al centro, **resumen fijo** a la derecha (cancha, fecha, horario y duración, total, cobrado ahora, queda por cobrar) con el botón que dice verbo + monto ("Reservar · $ 24.000", "Agendar evento · $ 72.000", "Bloquear cancha").
- **Teléfono:** pantalla completa; tipos como chips arriba, footer fijo con total + botón.
- Los horarios salen de la grilla ya cargada (horas reales del día y reservas de esa cancha): el fin se topea en la próxima reserva o el cierre (máx. 24:00). El servidor sigue siendo la barrera (solapamiento).
- El precio de un evento lo recalcula el servidor salvo que el admin lo cambie o elija "No se cobra".

## 4. Medidas — una sola densidad, resuelta por CSS

**El selector Cómodo/Compacto se eliminó** (con su `localStorage['tg-grilla-density']` y su hook).
Nadie en el mostrador lo tocaba más de una vez, y la densidad real la decide la cantidad de canchas,
no una preferencia. Menos un control, menos un estado que persistir. No reponerlo.

|                                 | Teléfono       | `lg`+    |
| ------------------------------- | -------------- | -------- |
| Alto de fila                    | `4rem` (64 px) | `4rem`   |
| Ancho de columna (`--tg-col`)   | `3rem` (48 px) | `8.5rem` |
| Columna de horas (`--tg-hours`) | `2.75rem`      | `3.5rem` |

- **64 px de fila** es lo que necesitan los dos renglones de §3: con 52 el saldo se recortaba.
- Las medidas son **variables CSS con override en `lg:`**, no un hook de media query — un hook resuelve después del primer pintado y se ve el salto de anchos. El ancho mínimo de la matriz es `calc(var(--tg-hours) + N × var(--tg-col))`.
- **48 px de columna no es arbitrario**: la celda lleva `m-0.5` (2 px por lado), así que el blanco táctil queda en **44 px exactos** (MASTER §10). Bajar `--tg-col` por debajo de `3rem` rompe el mínimo.
- El header de cancha apila nombre + formato (`F5`) en el teléfono y los pone en fila en `lg`. La columna de horas muestra dos dígitos en el teléfono.

## 4bis. Teléfono: la misma matriz, angosta

**Una sola vista para los dos tamaños.** La grilla-lista de la Fase 4 (`GridDayList`, carrusel de
páginas por cancha) **se eliminó**: eran dos componentes con dos modelos mentales, dos juegos de
nombres accesibles y dos lugares donde arreglar el mismo bug. Con columnas de 48 px la matriz entra
en un viewport de 375 px —siete canchas y media— y el scroll horizontal con snap resuelve el resto,
que es el gesto que el carrusel imitaba a mano.

- Lo que se gana: la lectura aprendida en escritorio (posición, color, ícono, saldo) es **literalmente la misma**, no una traducción. Un solo nombre accesible por celda, así que los tests dejan de necesitar dos matchers para el mismo hecho.
- Lo que se pierde y se asume: en 375 px hay que **scrollear en dos ejes**. Se compensa con headers de cancha sticky arriba, eje de horas sticky a la izquierda y `snap-start` por columna. El scroll 2D era el argumento de la v1 contra la matriz; con 48 px en vez de 150 el costo bajó lo suficiente.
- **Regla de corte: medidas por CSS, superficies por hook.** La matriz entera (anchos, altos, qué renglón lleva qué) se resuelve con variables y `lg:`, porque un hook responde después del primer pintado y se ve el salto. `useIsDesktop` (`src/hooks/use-is-desktop.ts`) **sigue vivo** y se usa sólo para elegir la SUPERFICIE del panel del turno, que no es algo que CSS pueda decidir: entra por la derecha en `lg`+ y por abajo en el teléfono. El modal de alta (§3bis) resuelve escritorio/teléfono por CSS.
- Lo que no viaja al teléfono: la tira semanal (la reemplaza `‹ fecha ›`, §1) y la navegación 2D por flechas.

## 5. Madrugada muerta colapsada

Las horas de la mañana **ya pasadas y sin ninguna reserva** no ocupan pantalla (§13.5: "los
horarios vacíos de la mañana obligan a scrollear"):

- Regla (`countCollapsibleLeading` en `grid-cells.ts`, pura y testeada): se colapsa la corrida
  **inicial** de slots donde `isPast && todas las canchas libres`. El slot en curso (empezado
  pero no terminado) nunca se colapsa. Mínimo 2 filas para colapsar; nunca se colapsa el día entero.
- UI: banda de `2.75rem` (44 px, touch §10) a lo ancho de todas las columnas — `"08:00–15:00 · Sin actividad"` +
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
  todo icon-only — el "···" de la barra, los chevrons de semana y los del día en el teléfono.
  El tooltip NO reemplaza `aria-label`.
- Máximo un elemento de guía visible a la vez (§7.1): si hay hint, no hay coachmarks.

## 9. Copy (§8 extendido para esta vista)

Vocabulario canónico §8.5 + extensiones de grilla:

| Código                     | UI                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending_payment`          | **Esperando seña** (MASTER §8.5; decisión del dueño 2026-09-10, deja sin efecto la "Decisión v2 D1" que había desviado solo la grilla — la urgencia la comunica el contador, no el rótulo) |
| `confirmed` sin seña       | **Confirmada**                                                                                                                                                                             |
| `confirmed` + seña paga    | **Señada**                                                                                                                                                                                 |
| `completed`                | **Jugada**                                                                                                                                                                                 |
| `unpaid_alarm` (Fase 3)    | **Sin cobrar**                                                                                                                                                                             |
| `no_show`                  | **Ausente**                                                                                                                                                                                |
| `type=fixed`               | **Abonado**                                                                                                                                                                                |
| `type=tournament` (Fase 3) | **Torneo**                                                                                                                                                                                 |
| `type=block`               | **Bloqueado**                                                                                                                                                                              |
| court `offline`            | **(pausada)** — nunca "(offline)"                                                                                                                                                          |

Fechas: formato medio §8.3 ("mié 1 de julio") — en el teléfono es el rótulo entre los dos chevrons;
en escritorio lo dice la tira semanal. Horas 24 h `HH:MM`, rango con en-dash sin espacios
("16:00–17:00"). Plata en formato §8.2 sin decimales, y desde el rediseño **también en la celda**
(el saldo pendiente, §3) — no sólo en el panel.

## 10. Teclado y accesibilidad

- Flechas mueven el foco entre slots (roving por `data-col`/`data-row`, saltando filas cubiertas por spans y celdas no interactivas). Los índices son sobre las filas **visibles** (colapso incluido).
- Escape cierra el modal de alta y devuelve el foco a la celda. Contenedor scrolleable con `tabIndex=0` + `role="region"` + label con la fecha.
- Todo estado cumple §1.4 (color + ícono + texto/aria) y §2.4 (labels en escala AA verificada).
- Touch ≥ 44 px en todo: celda (columna de 48 px menos los 2 px de margen por lado), chevrons del día, "···", chip "Por cobrar hoy" y chips de método del panel — estos últimos bajan a 36 px recién en `md`/`lg`, donde el puntero es un mouse.

## 11. Leyenda

Swatch + **ícono** + label por cada estado de §2, en el mismo orden que esa tabla (la leyenda enseña
el mapeo ícono↔estado — es parte del sistema que se explica solo, §7).

**Vive dentro del "···" de la barra**, bajo el rótulo "¿Qué significa cada color?", y no como fila
fija al pie de la matriz: se lee durante la primera semana y después nunca, y al pie le costaba una
línea entera de alto a la grilla en 1366×768. Se mantiene idéntica en los dos tamaños.

## 12. Motion budget de la vista

| Interacción                             | Techo                                   |
| --------------------------------------- | --------------------------------------- |
| Hover/focus de celdas, botones          | 150 ms color-only                       |
| Navegación de día (transición atenuada) | 150 ms opacity                          |
| Panel lateral del turno (Sheet)         | 300 ms slide al abrir, 200 ms al cerrar |
| Modal de reserva                        | 300 ms                                  |
| Pulso Realtime                          | 600 ms, una vez (excepción §5.3)        |

Nada flota, nada respira, cero loops fuera del skeleton.

## 13. Skeleton de carga

`loading.tsx` replica la silueta real (§5.3 "Espera"): **la matriz y nada más** — eje horario, 3
columnas de canchas, filas de 4rem con las mismas variables de ancho de §4. Sin encabezado, porque la
vista no tiene (§1): la barra superior ya está pintada cuando el skeleton aparece, y dibujar ahí un
título, una fecha y siete píldoras hacía saltar la grilla hacia arriba al terminar de cargar.
Abajo de `lg` sí lleva la fila `‹ fecha ›`, que en ese ancho es contenido de la página.

## 14. Deuda conocida de esta vista

- Coachmark de primera visita a la grilla (patrón §7.2) — pendiente, coordinar con el hint para no violar §7.1 (uno a la vez).
- `formatMoney` unificado (P0.3 del MASTER): el panel usa un `formatArs` local hasta la barrida global.
- Línea de "ahora" en madrugada operativa (`closes_next_day`): hoy no se dibuja.
- Realtime también debería pulsar cambios de estado (UPDATE), no solo altas — evaluar si es señal o ruido tras uso real.
- **Scroll en dos ejes en el teléfono** (§4bis): asumido a cambio de tener una sola vista. Medir con uso real antes de agregarle nada encima.
