# Ledger — Alta desde la grilla (modal único) + Reservas por cancha

Esfuerzo iniciado 2026-09-14. Decisión: `docs/decisions/2026-09-14-alta-grilla-modal-unico-y-reservas-por-cancha.md`. Fricción: `docs/gtm/ejecucion/10-aprendizajes.md` (2026-09-14).

## Contrato

- **Objetivo:** (A) el staff puede agendar un evento de N horas enteras con precio total o "No se cobra", y un `block` nunca carga plata; (B) tocar un casillero libre abre un modal único con 4 tipos (Turno, Turno fijo, Evento, Bloquear) y el popover de alta rápida desaparece; (C) `/reservas` sin hero, ancho completo, filtros en popover y canchas en columnas en Hoy/Próximas.
- **No se toca:** reserva online (60 min estricto), reprogramación (60 min), schema/migraciones, flujos de Cobrar/Ausente/Cancelar (solo su layout).
- **Juez (inmutable):** `pnpm format:check` · `pnpm lint` · `pnpm typecheck` · `pnpm knip` + tests unit tocados + integración de duración/cobro.

## Delegaciones

| # | Agente | Finalidad | Costo aprox. | Resultado |
|---|---|---|---|---|
| 1 | Explore ×3 | Mapear alta desde grilla, vista Reservas y modelo de tipos | ~590k tokens | Mapas completos; detectados 3 bugs de plata en `block` |
| 2 | Plan (sonnet) | Diseño de implementación y radio de impacto del evento multi-hora | — | Online/availability/grilla/reportes ya son agnósticos a la duración; reprogramar hay que ocultarlo |
| 3 | sonnet-implementer (A) | Servidor: evento N horas, `priceForRange`, blindaje de `block`, gate de reprogramar, "Sin costo" | ~283k tokens | 7 src + 6 tests, 113 tests verdes. Escaló: `rescheduleBooking` recortaba un evento a 60 min si se llamaba directo → el orquestador agregó `multi_hour_event` server-side + test de integración (24/24) |
| 6 | sonnet-adversarial-reviewer | Revisión fresca del servidor (A) | ~143k tokens | GO. 🟡 guard block/torneo de `completeAndChargeBookingAction` sin test → agregado (throw adentro de la tx, 6/6). 🟡 `multi_hour_event` alcanza abonados > 1 h → documentado en la decisión (antes se recortaban con precio completo) |
| 7 | sonnet-adversarial-reviewer | Revisión fresca de UI (modal + Reservas) | ~204k tokens | Con reservas: 🔴 seña > precio si se edita el precio tras "Todo"; 🟡 paginación global corta columnas en Próximas; 🟢 telemetría perdió campos |
| 8 | sonnet-ux-verifier | App real: 4 tipos desde grilla, Reservas 2/8 canchas, 375/1024/1920, e2e de contrato | ~337k tokens | 17/18 PASS, e2e 9/9 verdes. 🔴 en teléfono una columna cargada queda recortada sin scroll (grid stretch + overflow-hidden) |
| 9 | sonnet-implementer (fixes) | Arreglar hallazgos de 7 y 8 + recortar duplicación del modal | ~336k tokens | Los 5 arreglados con rojo→verde (guard server-side seña ≤ precio, columna mobile, tope por cancha con total real, telemetría, `styles.ts`); unit 4074 verdes. `create-modal/` sigue en 1879 líneas. Orquestador compactó la card del tablero (3 renglones) |
| 10 | sonnet-release-verifier | Gate final GO/NO-GO + probar si los rojos de integración son preexistentes | cortado (límite de sesión) | Sin veredicto. El orquestador corrió el gate: format/lint/typecheck/knip limpios, unit 4074 verdes; integración 1017/1018 con `DATABASE_URL` de superusuario (los "~20 rojos" anteriores eran el `.env.local` copiado con rol `turnogol_app`); el único rojo, `session-cookie-chunking` "renovar", es `AuthRetryableFetchError` de Auth local y el diff no toca auth |
| 11 | sonnet-ux-verifier | Re-chequeo: scroll mobile, cards compactas, tope 50 por cancha, seña ≤ precio | cortado (límite de sesión) | Sin resultados; dejó `next dev` en :3100 (matado) |
| 12 | sonnet-ux-verifier | Re-chequeo (relanzado, secuencial para no compartir la DB) | ~179k tokens | Scroll mobile, tope por cancha y seña ≤ precio PASS (DB `deposit_amount == price_snapshot`). 🟡 con 3 canchas a 1920 px el nombre quedaba en ancho 0: el corte a una fila era `@sm` (24rem) → el orquestador lo subió a `@3xl` (48rem); no re-verificado en navegador. "Una parte" > precio se topea solo, sin mensaje |

## Pendiente conocido

- `create-modal/` quedó en 1879 líneas contra ~1100 pactadas: el precio y el selector de fin se repiten entre formularios con diferencias chicas. Candidato a `deuda-tecnica`.
- El corte `@3xl` de la card no se volvió a mirar en navegador.
| 4 | sonnet-implementer (C) | Vista `/reservas`: sin hero, ancho completo, filtros en popover, columnas por cancha | ~454k tokens | ~19 archivos, 53 tests verdes; Storybook interactivo y e2e no corridos; se sacó la fecha del subtítulo |
| 5 | sonnet-implementer (B) | Modal único de alta con 4 tipos; borrar alta rápida | ~560k tokens | 9 archivos borrados, `create-modal/` 1853 líneas (presupuesto ~1100: excedido, escalado); chips a 36 px en touch → el orquestador los subió a 44 px. Gate integrado verde: format/lint/typecheck/knip limpios, unit 388 archivos / 4068 tests |
