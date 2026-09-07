# Auditoría TurnoGol — Progreso

## Estado: ABANDONADA sin completar

**Arrancó:** 2026-06-29 · **Última actividad real:** 2026-07-21 (`docs/audit_report.md`)
**Verificado el 2026-08-27** contra el sistema vivo, no contra este archivo.

El objetivo original era *"veredicto go/no-go para lanzamiento en ~2 semanas"*. TurnoGol
lanzó y está en producción cobrando: ese veredicto ya no está pendiente, lo dio la realidad.
Las capas 2 a 5 se completaron y sus hallazgos se aplicaron (ver historia). **La Capa 6
nunca se ejecutó**: existe el anuncio *"arrancando Capa 6"* y nada más — ningún artefacto
de auditoría de seguridad/RLS en `docs/audit/` ni en `docs/qa/`.

Si hace falta cerrar la Capa 6, es una auditoría nueva, no la continuación de esta.
**Se cerró así el 2026-09-05**, como Fase 1 del plan de auditorías vigente.

## Qué pasó con cada capa

- [/] **Capa 1** — Schema vs Código: parcial, nunca se retomó.
- [x] **Capa 2** — Documentación vs Código: 19/19 docs, 82 hallazgos, 3 bloqueantes.
- [x] **Capa 3** — Reglas de negocio y permisos: 22 hallazgos, 6 bloqueantes, fixes aplicados.
- [x] **Capa 4** — Dead code: 140 candidatos, grupos 1-3 aplicados.
- [x] **Capa 5** — Consistencia de patrones: 57 candidatos, "Shadow API" y C5-G3 aplicados.
- [x] **Capa 6** — Seguridad (RLS/Auth): **cerrada el 2026-09-05** como auditoría nueva,
  no como continuación de ésta → [`2026-09-05-aislamiento-rls.md`](2026-09-05-aislamiento-rls.md).
  147 celdas medidas con el rol restringido real. El 🔴 (un complejo se fabricaba la
  relación con un jugador ajeno y le leía los datos personales) se **arregló el mismo
  día**, junto con los otros dos caminos de su clase (alta de abonado y baneo manual, este
  último anotado como H-10), con los tests demostrados en rojo antes.
  Los 5 🟡 restantes y un 🟢 se cerraron el 2026-09-06 en dos pasadas más (migraciones 083 y
  084, tapado único del reporte de errores, identidad del rol en staging). Queda 1 🟢: los
  oráculos de existencia de cuenta, que son decisión de producto y no arreglo técnico. El arnés vive en
  `tests/integration/isolation-app-role.test.ts`, bloqueante en CI.

## Los "REQUIERE INPUT" que vivían acá ya no requieren input

Verificados uno por uno contra el código el 2026-08-27 — ninguno seguía abierto:

| Item | Estado real hoy |
|---|---|
| `PremiumCard` | no existe en `src/`, 0 referencias — se borró |
| `table.tsx` (shadcn sin adoptar) | el archivo ya no existe |
| `getAvailableSlotsCached` | borrado el 2026-08-09; queda solo un comentario en `booking.service.ts:1040` |
| `processSingleNotification` | **en uso** (`send-email.worker.ts`), no era dead code |
| `runRequestObservability` | **en uso**, 8 referencias — no era dead code |
| Backlog Capa 5 (SA-08/09/10, C5-G1/G2, L5-LABELS…) | esos IDs **no aparecen** en `docs/audit_report.md`: la referencia estaba rota |

Lección, y es la razón por la que este archivo se partió: **un pendiente escrito a mano
envejece sin avisar.** Lo que está abierto se consulta, no se transcribe — `gh pr list`,
`gh run list --workflow CI`, `gh issue list`, `pnpm sentry:issues`.

## Historia

Las 140 entradas de esta auditoría se archivaron intactas, agrupadas por mes. Pesaban
~129.000 tokens juntas: el 64% de una ventana de contexto, que es la razón por la que
casi nadie las leía y quien las leía agarraba un pedazo suelto.

- [`archive/2026-06.md`](archive/2026-06.md) — 3 entradas, 8 KB
- [`archive/2026-07.md`](archive/2026-07.md) — 38 entradas, 93 KB
- [`archive/2026-08.md`](archive/2026-08.md) — 60 entradas, 314 KB
- [`archive/sin-fecha.md`](archive/sin-fecha.md) — 39 entradas, 76 KB — entradas sin fecha en el texto (tickets B8/B10, barridos por ticket); quedaron aparte a propósito en vez de adivinarles un mes

Lo que se hizo después de esta auditoría no vive acá: está en `docs/BITACORA.md`, que
escribe solo el hook de cierre, una línea por sesión.
