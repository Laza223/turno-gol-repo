---
paths:
  - "src/modules/tournaments/**"
  - "src/app/**/torneos/**"
---

# Torneos

Nace detrás del feature flag `tournaments` (global en `false`) y **el flag se chequea en las páginas Y en cada Server Action**, no solo en el menú. Todo lo que ocupa cancha es una fila en `bookings` — no inventar tablas de slots paralelas. La Server Action genérica de Caja NO ofrece el ingreso `tournament` (la plata ligada a algo tiene un solo camino de entrada); un cobro de inscripción no se deshace (el que se baja es `withdrawn`). Portal público: **no se publica DNI, contacto, `player_id` ni plantel completo**. Reglas del motor (walkover, marcador, eventos): motor puro en `src/modules/tournaments/standings/` + `tests/unit/tournament-standings.test.ts` + `docs/decisions/2026-07-24-torneos.md`
