# Ledger: RIVAL v1

Es el esfuerzo de [`docs/decisions/2026-10-22-rival-v1.md`](../decisions/2026-10-22-rival-v1.md), con la spec en [`docs/superpowers/specs/2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md). Arrancó el 2026-10-21. Opus orquesta y los subagentes Sonnet ejecutan.

## Fases

| Fase | Qué | PR | Estado |
|---|---|---|---|
| 0 | Documentos: spec, decisiones (RIVAL v1 y freeze), ideas, este ledger, `CLAUDE.md` y `PRODUCT.md` | #467 | PR abierto |
| 1 | DB + esqueleto del módulo + retención, ARCO y export | — | PR abierto |
| 2 | Shell, `/rival`, `/rival/nuevo`, vista del partido, entradas desde reservas, OG | — | Pendiente |
| 3 | "Voy" con cuenta, bienvenida, banco, me bajo, avisar al grupo, repetir | — | Pendiente |
| 4 | Tablón: publicar, pedir, decidir, contacto, bans, denuncias | — | Pendiente |
| 5 | Foto de perfil (R2) | — | Pendiente |
| 6 | Emails y alertas | — | Pendiente |
| 7 | `/super-admin/rival` | — | Pendiente |
| Cierre | `sonnet-release-verifier` sobre main integrado; el flag lo prende el dueño | — | Pendiente |

## Delegaciones

| Fase | Delegado | Para qué | Costo aprox. | Resultado |
|---|---|---|---|---|
| 0 | 3 agentes de relevamiento (solo lectura) | Relevar el código: flags y perfil del jugador; avisos, legales, bans e instrumentación; la historia de Falta Uno | Bajo | Mapa de los archivos que toca RIVAL. La spec cita los paths verificados |
| 0 | 3 agentes de investigación web | Relevar ideas: convocatoria, tablón y crecimiento | El más grande: ~146 k tokens y ~8 min | [`2026-10-rival-ideas.md`](2026-10-rival-ideas.md) |
| 0 | `sonnet-adversarial-reviewer` (contexto fresco) | Revisar los documentos del PR0 | ~139 k tokens y ~6 min | "Arreglar antes": 8 🟡 y varios 🟢, sin 🔴. Se arreglaron todos: teléfono del aceptado, visibilidad del clickwrap, foto en R2 con clave aleatoria y cache corto, borrar el contacto al empezar, ⚖ que faltaban en el roadmap, cupo de "Busca rival" y sello derivado de la reserva. Quedan tres preguntas para el dueño |
| 0 | 1 agente de diseño (solo lectura) | Diseño técnico | Medio | §12 de la spec. Corrigió cuatro supuestos: el WhatsApp va en una tabla aparte, el tablón expone `id` y no el código, "Voy" no se autoenvía la primera vez, y los mails en horario silencioso no se resuelven con `startAfter` en `dispatchEmail` |
| 1 | `sonnet-implementer` (A) | Migración 099 y sus tests de DB bajo LOGIN real de `turnogol_app` | Alto | 099 con 6 tablas, triggers y funciones; 48 tests de DB |
| 1 | `sonnet-implementer` (B) | Módulo `rival`, retención, ARCO y export | Alto | Service, errores, schema Zod y 23 tests de service; `rival_my_matches()` agregado a la 099 |
| 1 | `sonnet-adversarial-reviewer` (contexto fresco) | Revisar el PR1 sin commitear | ~246 k tokens y ~25 min | "Arreglar antes": 1 🔴, que es la FK de la reserva y bloqueaba cancelar abonados; 3 🟡: bypass por `pg_trigger_depth` con tabla temporal, deadlock y `invite_code` legible por un participante; varios 🟢 |
| 1 | `sonnet-implementer` (C) | Arreglar los hallazgos de la revisión | ~231 k tokens y ~21 min | Todo arreglado y cada uno con su test, visto rojo antes del arreglo. La escritura interna se reconoce por `current_user` igual al dueño dentro de un trigger. Se lockea primero el partido. La FK queda `ON DELETE SET NULL` y la cancha se exige al crear. `rol-real`: 280 tests en verde |
| 1 | `sonnet-adversarial-reviewer` (contexto fresco) | Verificar los arreglos | ~200 k tokens y ~29 min | "Listo para PR". Cerró los 5 arreglos y comprobó con mutación que sus tests detectan la regresión; no encontró ninguna escritura interna que se pueda fabricar. Encontró un 🟡 nuevo: deadlock con 3 denuncias simultáneas, que se arregló lockeando el partido en el BEFORE |
| 1 | `sonnet-implementer` (C, segunda vuelta) | Deadlock de denuncias, orden de locks de la anonimización y docs desactualizados | ~241 k tokens y ~7 min | Lock del partido en el BEFORE de denuncias. El test 17.1 lo vio rojo antes del arreglo; después no se vio flaky |

## Pendientes que no son de una fase

- Borrar `players.preferred_area` (texto libre) con una migración propia, después de PR3, cuando la zona de lista cerrada ya esté en uso (spec §7).
