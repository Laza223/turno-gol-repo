---
target: Grilla y Reservas (10 canchas)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Lazar\\Documents\\github\\TurnoGol-grilla\\src\\app\\(admin)\\grilla"
timestamp: 2026-09-25T16-45-12Z
slug: src-app-admin-grilla
---
Method: dual-agent (A: revisor de diseño, Sonnet · B: detector, Sonnet)

Caso: complejo de 10 canchas, 133 turnos, hoy 20:10, notebook 1280×650 y teléfono 390×844, claro y oscuro (app local :3100, seed `scripts/seed-grilla-demo.ts`).

## Design Health Score

| # | Heurística | Score | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 2 | Con 10 canchas, las 9 y 10 quedan fuera de pantalla sin ninguna señal |
| 2 | Lenguaje del mundo real | 3 | Buen vocabulario ("Jugada", "No cobrado", "Sin seña"); el orden "Cancha 1, Cancha 10, Cancha 2" no es humano |
| 3 | Control y libertad | 3 | Esc, X y "Cancelar" en todos lados |
| 4 | Consistencia | 2 | "No cobrado" significa tres cosas distintas según la pantalla (ver Priority Issues) |
| 5 | Prevención de errores | 3 | MoneyInput, selects de hora y confirmaciones |
| 6 | Reconocer antes que recordar | 2 | Nombres cortados a "Pablo…", "Club…"; en el teléfono la plata es "$…" |
| 7 | Flexibilidad y eficiencia | 2 | Teclado en la grilla, pero la búsqueda no encuentra por teléfono y el atajo V solo existe en Hoy |
| 8 | Estética y minimalismo | 2 | Reservas repite "No cobrado · Sin seña · Confirmada" en cada fila, aunque sean turnos de pasado mañana |
| 9 | Recuperación de errores | 3 | ErrorState con acción; no se disparó ningún error |
| 10 | Ayuda | 2 | Tooltips en íconos, nada más |
| **Total** | | **24/40** | **Aceptable** |

## Design Specificity Verdict

**LLM:** la Grilla es específica del producto: matriz cancha×hora, borde de 3 px por estado, rayado de bloqueo, línea de ahora, plata tabular y un vocabulario cerrado. El modal de alta ("¿Qué vas a agendar?") resuelve un problema propio del dominio. Reservas es la pieza intercambiable: una lista de backoffice con badges y un popover de filtros.

**Detector:** en el código, 16 avisos de una sola regla: tamaños de letra fuera de la escala de DESIGN.md (13, 11, 10, 9 y 15 px) en `BookingCard` (238, 244, 254), `GridScroller` (164, 190), `GridHeaderBar` (71, 167), `WeekStrip` (141, 144), `GrillaTabs:39` y `ReservasHeaderBar` (121, 153, 180). En el navegador: /grilla, 26 hallazgos en 1280 y 117 en 390 (85 de texto chico y 25 de texto tapado); /reservas, 7. Falsos positivos: el rayado de bloqueo, la sombra de la tarjeta oscura, Inter, el h1 `sr-only`, el punto de la línea de ahora y el degradé del marco. Queda abierto un posible contraste de 1,9:1 en /reservas Próximas. Sin overlay visible para el usuario: se inyectó por Playwright porque la CSP bloquea el origen del live-server.

## Priority Issues

**[P1] "No cobrado" significa tres cosas distintas.** En la Grilla, el chip "No cobrados hoy" suma todo lo confirmado del día, incluido lo que todavía no se jugó (`grid-cells.ts:238-245`): a las 20:10 marca **37 · $ 1.855.000** en rojo, cuando jugados y sin cobrar hay unos 11. Las celdas, en cambio, recién pasan a rojo cuando el turno está `completed`, 30 min después de terminar (`slot-visual.ts:185`). Hoy lo pone en rojo apenas termina, por `ends_at` (`today-board.ts:146-148`). Resultado: a las 20:10 el turno de las 19 dice "Cobrar $ 50.000" en rojo en Hoy y "Confirmada" en azul en la Grilla, justo en la media hora crítica. Reservas, por su parte, escribe "No cobrado" en gris a turnos de mañana (`money-line.ts`, rama `pending >= price`). Contradice el punto 2 de la decisión del 25/9 ("rojo para lo jugado y no cobrado"). Fix: un solo predicado de "jugado y no cobrado" (el de Hoy) para el chip, las celdas y Reservas, y sin "No cobrado" en lo que no se jugó. → `$impeccable clarify`

**[P1] Con 10 canchas, la Grilla esconde 2 sin avisar.** La columna mide como mínimo 136 px en escritorio (`GridScroller.tsx:107`), y a 1280 entran 8 canchas. La 8 termina justo en el borde, sin columna asomada, sin degradé y sin contador. No es que "se angosta": se corta, y parece que el complejo tiene 8 canchas. Los nombres se cortan igual a "Pablo…". Fix: que 10 a 12 canchas entren sin scroll en la notebook, con una celda más compacta (nombre sobre monto en dos renglones y estado solo con ícono y borde), y una señal de "hay más" desde 13. → `$impeccable adapt` + `layout`

**[P1] Reservas ordena mal.** `queries.ts:198` usa `ORDER BY c.name ASC, b.time_start ASC`, así que sale "Cancha 1, Cancha 10, Cancha 2…" y, en un complejo que cierra pasada la medianoche, el turno de las 00:00 aparece ARRIBA del de las 17:00 en la misma cancha. La Grilla ordena por `created_at` y por el día operativo. Son dos bugs de orden en la query (no es diseño). → arreglo aparte (toca una query)

**[P2] Reservas es ruido por fila.** Cada fila de Próximas repite "$ 50.000 · No cobrado · Confirmada · Sin seña" (4 datos, 3 que no informan nada), en columnas por día o por cancha con scroll interno y paginación de a 50. El popover de Filtros junta 6 estados + 11 canchas en una sola lista de radios. Las funciones que tiene y ninguna otra pantalla: buscar en todos los días, filtrar por estado y ver lo que viene y lo que pasó. Tiene razón de existir; su forma, no. → `$impeccable distill`

**[P2] La búsqueda no encuentra por teléfono** (`queries.ts:117-128`: solo nombre e id), aunque la decisión de navegación del 24/9 lo promete y el WhatsApp entrega justamente el número. → toca una query

**[P3] La tira de fechas.** Siete píldoras con el día elegido en el 3er lugar (`WeekStrip.tsx:30`, `DAYS_BEFORE = 2`, a propósito), el calendario aparte y el chip rojo pegado: la barra superior junta cinco grupos de controles. Usa 10 y 15 px, fuera de la escala. → `$impeccable layout`

## Persona Red Flags

**Rodrigo (mostrador, 20 h, 10 canchas):** no ve las canchas 9 y 10; en la Grilla ve "Confirmada" donde Hoy le pide cobrar; con el cliente en el WhatsApp no lo encuentra por teléfono; en Reservas, la Cancha 10 aparece segunda.
**Marcelo (dueño, teléfono, carga a mano):** 7 columnas de 48 px con "Mar…", "$…"; en el teléfono, la Grilla le sirve peor que Reservas para ver cómo va la noche.
**Alex (power user):** el atajo V solo existe en Hoy, no hay acciones en lote en Reservas y los Filtros no se recorren con teclado.
**Sam (accesibilidad):** el estado nunca va solo por color (bien) y el aria-label lleva el nombre completo; con zoom, los nombres cortados no tienen salida. Hay un contraste de 1,9:1 sin verificar en Próximas.

## Minor Observations

- "Filtros" no dice cuántos hay activos.
- `shortCourtName` convierte "Cancha 3" en "C3", pero un nombre libre ("Techada Sur") en 48 px queda cortado feo.
- El ícono del monitor arriba a la derecha no tiene rótulo visible; hay que confirmar que tenga tooltip.
- Cinco tamaños de letra fuera de la escala en la grilla y la barra superior.

## Questions to Consider

- Si 12 canchas entraran sin scroll en 1280, ¿hace falta algún aviso de scroll?
- ¿Reservas es una pantalla o es un buscador? Si su valor es "encontrar un turno en cualquier día", ¿no es una lista cronológica simple con buscador y chips de estado, sin columnas por cancha?
- ¿El chip "No cobrados hoy" de la Grilla sobra ahora que Hoy es la pantalla de cobro?
