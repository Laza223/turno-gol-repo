# Ledger: RIVAL v1

Es el esfuerzo de [`docs/decisions/2026-10-22-rival-v1.md`](../decisions/2026-10-22-rival-v1.md), con la spec en [`docs/superpowers/specs/2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md). Arrancó el 2026-10-21. Opus orquesta y los subagentes Sonnet ejecutan.

## Fases

| Fase | Qué | PR | Estado |
|---|---|---|---|
| 0 | Documentos: spec, decisiones (RIVAL v1 y freeze), ideas, este ledger, `CLAUDE.md` y `PRODUCT.md` | — | Escrito, sin commitear |
| 1 | DB + esqueleto del módulo + retención, ARCO y export | — | Pendiente |
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

## Pendientes que no son de una fase

- Borrar `players.preferred_area` (texto libre) con una migración propia, después de PR3, cuando la zona de lista cerrada ya esté en uso (spec §7).
