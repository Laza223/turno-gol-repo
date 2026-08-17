---
description: Auditoría de drift entre la documentación de TurnoGol y el código que efectivamente corre
---

Vas a auditar el DRIFT entre la documentación de TurnoGol y el código real.

## Qué cambió respecto de la versión original de este comando

Este comando nació cuando los specs eran el plano y el código todavía no existía: auditaba los docs entre sí y dictaminaba "¿está listo para codear?". Esa pregunta ya está contestada — el producto está en producción con clientes reales. Hoy el modo de falla es el inverso y es el único que importa:

**El código evolucionó y el doc se quedó viejo.** Un spec desactualizado no es papel muerto: es una trampa activa, porque la IA (y vos) lo lee como fuente de verdad y toma decisiones sobre una premisa falsa. Ese es el bug que esta auditoría caza.

**Regla de oro: cuando el doc y el código se contradicen, el CÓDIGO tiene razón** — salvo que el código esté violando una decisión de negocio explícita (ahí es un bug del código y se reporta como tal, con esa etiqueta). Nunca "arregles" el código para que coincida con un doc viejo.

## Fase 0 — Orientación (antes de leer nada más)

1. `docs/README.md` — el mapa: qué hay en `spec/`, `decisions/`, `operations/`, `qa/`, `audit/`, `planning/`, `business/`.
2. `CLAUDE.md` en la raíz — es el resumen curado y ACTIVO del proyecto: cuando contradice a un doc numerado, gana CLAUDE.md.
3. `git log --oneline -40` — qué se movió último. El drift se acumula donde hubo actividad reciente.

## Fase 1 — Lectura (todavía no escribas nada)

Leé los 19 docs de `docs/spec/` (numerados 1–20, sin doc9: el lifecycle SaaS se unificó en doc4 §2). No opines hasta haber leído todo: una auditoría parcial inventa contradicciones que se resuelven tres docs más adelante.

Desfases YA conocidos — confirmalos y medí su alcance real, no los redescubras como hallazgos nuevos:
- doc6 / doc12 / doc13 dicen "19 tablas / 12 con RLS". El schema creció bastante desde entonces.
- doc14 (tech stack) quedó viejo: el stack real es Next.js 16 / React 19 / Tailwind 4 / Zod 4.
- doc11 ADR-002 dice "Magic Link" para staff; el staff ya migró a email+password (el jugador sigue passwordless).

## Fase 2 — Verificación contra el código (el corazón del comando)

Para cada afirmación verificable de un spec, **comprobala contra el código antes de darla por vigente**. Un doc que dice "existe X" no prueba que X exista.

| Qué afirma el doc | Contra qué se verifica |
|---|---|
| Tablas, columnas, ENUMs, RLS | `src/shared/db/migrations/*.sql` (las migraciones mandan) + `src/shared/db/schema.ts` |
| Reglas de negocio, state machines | el service del módulo en `src/modules/<slice>/` |
| Endpoints, payloads | `src/app/api/**` y las Server Actions (`src/app/**/actions.ts`) |
| Comandos, scripts, entorno | `package.json` + `docs/operations/` |
| Decisiones (ADRs) | `docs/decisions/` — una decisión revertida y no marcada como tal es de lo más peligroso que hay acá |

Herramientas: Grep/Glob sobre el repo. Si el codebase está indexado, `search_graph`/`get_code_snippet` son más rápidos que grepear a ciegas.

## Fase 3 — Reporte

Un solo archivo nuevo, fechado: `docs/audit/DOC_DRIFT_<YYYY-MM-DD>.md`. **No pises reportes anteriores** — el histórico es lo que permite ver si el drift crece o baja.

Secciones:

### 1. DRIFT DOC↔CÓDIGO
Lo más importante. Por hallazgo: doc + sección, cita textual, qué dice el código (archivo:línea), y el veredicto: `DOC VIEJO` (actualizar el doc) · `CÓDIGO EN CONTRA DE UNA DECISIÓN` (bug real, escalar) · `AMBOS VIEJOS` (la realidad cambió y nadie la escribió).

### 2. CONTRADICCIONES ENTRE DOCS
Solo las que sobreviven al chequeo contra el código. `[DOC-X vs DOC-Y]` con cita textual de cada uno.

### 3. DECISIONES HUÉRFANAS
Cosas decididas en `docs/decisions/` o en un ADR que ningún spec refleja, y al revés: specs que describen algo que una decisión posterior revirtió (pasó de verdad: abonados con saldo a favor, no-show como deuda).

### 4. GAPS
Comportamiento que el código tiene y ningún doc explica. Priorizá lo que un dev nuevo (o una IA) necesitaría para no romperlo: invariantes de plata, aislamiento de tenant, día operativo.

### 5. TABLA MAESTRA
| ID | Doc(s) | Qué dice el doc | Qué hace el código | Veredicto | Acción (1 línea) |

### 6. VEREDICTO
- Los 5 drifts más peligrosos, ordenados por "qué tan probable es que alguien tome una decisión equivocada leyendo esto".
- ¿Algún hallazgo es un bug de código y no de documentación? Listalos aparte y bien visibles.

## Reglas

- Citá textualmente, con `archivo:línea`. No parafrasees.
- No elogies. El trabajo es encontrar drift, no validar.
- **No edites ningún doc ni código en esta corrida.** Este comando produce un reporte; la corrección se decide después, con el reporte a la vista.
- Si algo es una decisión de negocio (no un error), marcalo `REQUIERE INPUT` y no lo resuelvas solo.
- Falso positivo > falso negativo, pero **solo después** de haber chequeado el código: reportar un drift que no existe porque no verificaste es ruido, no prudencia.

$ARGUMENTS
