# Skill routing: qué skill gana ante cada tipo de pedido

**Fecha**: 2026-08-28
**Estado**: vigente
**Decisor**: Lazar (plan aprobado en sesión; auditoría ejecutada por 3 exploradores de solo lectura sobre disco)

## Contexto

En esta máquina conviven cinco sistemas de skills que se pisan entre sí: **laza-ai-engineering-os** (19 skills globales en `~/.claude/skills/`), **superpowers** (plugin oficial, 12 skills), **gstack** (árbol standalone en `~/.claude/skills/gstack/`, ~60 skills, VERSION 1.71.0.0), **caveman** (plugin, 10 skills + 3 agentes) y **engineering** (plugin remoto, no existe en disco). Para "code review" solo, hay OCHO candidatos. El modelo elegía por matching de descripción, sin criterio — y una elección equivocada tiene efectos reales (gstack commitea y pushea solo).

## Decisión

1. **laza-os es el sistema operativo**: proceso, routing y delegación. Sus 19 skills ya se auto-rutean entre sí (18 referencias cruzadas "Cuándo NO" verificadas).
2. **superpowers es el motor debajo de laza-os**, no un competidor: el núcleo global ya lo declara ("brainstorming / writing-plans / TDD / verification-before-completion son la base — no las dupliques") y `entrega-feature` delega la cadena explícitamente (SKILL.md línea 21).
3. **Las skills del repo** (`convenciones-stack`, `protocolo-testing`, `audit`, `supabase*`) son la capa de dominio: se cargan cuando la tarea toca su materia.
4. **gstack y caveman NO entran en el ruteo por defecto.** Solo por slash command explícito de Lazar, y aun así los guardrails del CLAUDE.md mandan sobre sus instrucciones: el "Continuous Checkpoint Mode" (auto-commit) no corre jamás en este repo.
5. **El modo caveman (compresión de estilo) es ortogonal** a las skills del plugin y no se toca.

La tabla operativa vive en `CLAUDE.md` §"Skill routing". Este doc guarda la evidencia.

## Evidencia por proveedor

### gstack — descalificado del ruteo por defecto

| Skill | Violación | Cita textual (path bajo `~/.claude/skills/gstack/`) |
|---|---|---|
| 17 de 19 auditadas | Auto-commit sin pedido | "Continuous Checkpoint Mode": commits `WIP:` automáticos, `push only if CHECKPOINT_PUSH is "true"` (bloque idéntico en `review/SKILL.md` y 16 más) |
| `qa` | Commitea por cada fix | `"One commit per fix. Never bundle multiple fixes into one commit."` (`qa/SKILL.md`) |
| `design-review` | Commitea por cada finding | `git commit -m "style(design): FINDING-NNN — ..."` (`design-review/SKILL.md`) |
| `ship` | Push + PR sin confirmación | `"This is a non-interactive, fully automated workflow. Do NOT ask for confirmation at any step. The user said /ship which means DO IT."` (`ship/SKILL.md`) |
| `land-and-deploy` | Mergea PRs solo | `gh pr merge --squash --auto --delete-branch` (`land-and-deploy/sections/merge-and-deploy.md`) |
| `spec` | Spawnea un proceso `claude -p` entero en background, en worktree nuevo, POR DEFAULT | `"The default in execution mode is to spawn an agent immediately"` + `claude -p 2>&1) &` (`spec/sections/gate-and-file.md`) — fuera de todo conteo de subagentes ("solo Sonnet, máx 6") |
| `review` | Aplica fixes directo + "Review Army" sin pin de modelo | `"AUTO-FIX items are applied directly."` (`review/SKILL.md`) |
| `ship` | Convención de commit ajena | exige archivo `VERSION` de 4 dígitos + `chore: bump version and changelog` en inglés |

**Sin conflicto** (usables como herramientas): `qa-only` (read-only estricto), `landing-report`, `health` (escribe en CLAUDE.md solo con confirmación), `careful`/`guard`/`freeze` (hooks de seguridad — complementarios), `browse` (daemon de browser), `retro`/`context-save`/`context-restore` (inofensivas pero duplican skills laza-os, que son las canónicas), y las utilidades sueltas (`make-pdf`, `watch`, `diagram`, `scrape`).

### caveman — skills pierden, el modo queda

| Pieza | Violación | Cita |
|---|---|---|
| `cavecrew-investigator`, `cavecrew-reviewer` | Regla "subagentes SOLO Sonnet" | `model: haiku` en frontmatter (`plugins/cache/caveman/.../agents/*.md`) |
| `caveman-commit` | Convención "conventional commits en español" | todos los ejemplos en inglés (`"feat(api): add GET /users/:id/profile"`) |
| `caveman-review` | Duplica `revision-pr` sin su procedimiento (sin scope-creep check, sin "¿el test falla si se revierte?") | `"Reviews only — does not... run linters"` |
| `migration` | No conoce "NUNCA editar una migración existente" | no distingue crear vs editar |
| `investigate-first`, `surgical-patch`, `safe-refactor`, `lean-build`, `verify-and-stop` | Versiones finas de systematic-debugging / TDD / protocolo-fixes | sin procedimiento que las skills ganadoras no tengan |

### engineering — no compite

No existe en disco: ausente de `installed_plugins.json` y de los 3 marketplaces locales. Es remoto (Cowork). Sus skills (`code-review`, `debug`, `testing-strategy`, `architecture`, `standup`, `tech-debt`) son playbooks genéricos sin conocimiento del repo ni de la gobernanza.

### Plugin `code-review:code-review` vs `/code-review` del harness

El plugin lanza 5 Sonnet paralelos con scoring de confianza ≥80 y comenta vía `gh`. El `/code-review` del harness tiene lo mismo más: integración `ReportFindings` (UI del host), niveles de esfuerzo, verify pass y el modo `ultra` (multi-agente cloud). Y `revision-pr` (laza-os) ya define el rol de ambos: *"correr primera pasada automática de review si el harness la tiene, tratarla como insumo, no veredicto"*. **Gana: `revision-pr` como proceso, `/code-review` del harness como su pasada mecánica.**

### laza-os — hallazgo colateral

5 skills existen en disco pero NO figuran en la tabla de ruteo del CLAUDE.md global (`~/.claude/CLAUDE.md`): `estrategia-tests`, `verificacion-fresca`, `verificacion-ux`, `deuda-tecnica`, `retrospectiva`. Hoy solo se alcanzan por referencia cruzada desde otras skills. La tabla de este repo las incluye; **candidato a promoción al repo `laza-ai-engineering-os` vía promotion-log** (lo revisa Lazar — ninguna sesión promueve por su cuenta).

### Herramientas del repo — opt-in, no rutas por defecto

`caza-bugs-turnogol`, `fable5-backend-audit`, `storybook-stories-fanout` son Workflows multiagente (costo alto, invocación manual). `docs-sync` lo invoca solo `/audit-docs` (*"No arrancar a mano"*). `test-audit`/`test-audit-exec` son manuales por diseño. Entran en la tabla como herramientas nombradas bajo `auditoria-codigo`, no como rutas automáticas.

## Consecuencias

- El modelo deja de elegir skill por similitud de descripción: la tabla del CLAUDE.md decide, y nombra a los perdedores para que ni siquiera se consideren.
- Un slash command explícito de Lazar (`/ship`, `/qa`, etc.) sigue siendo autorización para ESA skill — pero no deroga los guardrails del repo (migraciones, deny list, commits en español, "nunca auto-commit").
- Si se instala un sistema de skills nuevo, se re-corre esta auditoría antes de dejarlo entrar al ruteo.

## Qué NO se decidió acá

- Desinstalar gstack o caveman (afecta todos los repos; decisión de Lazar aparte).
- Promover la tabla al núcleo laza-os (va por promotion-log).
