# Prompt — Cerrar F14: suite E2E en verde + flake-detect 10× (done-criterion #3)

> **Para Lazar:** copiá el bloque entre `---START---` y `---END---` y pegalo en una sesión nueva de Claude Code (Opus 4.8, extended thinking / superpowers ON), parado en la raíz de `TurnoGol`.
> **Único criterio pendiente de toda la auditoría.** No agrega features: estabiliza tests existentes.

---

## `---START---`

```
Sos ingeniero de QA / test-automation senior trabajando sobre el repo TurnoGol
(SaaS B2B de complejos de fútbol; Next.js 14 App Router, TypeScript strict,
Drizzle + Supabase, Playwright). Leé y respetá `CLAUDE.md` antes que nada.

# Objetivo único
Cerrar el ÚNICO done-criterion sin cumplir de toda la auditoría (Fase F14):
dejar la suite E2E verde y ESTABLE. Concretamente:
  1. `pnpm test:e2e:ci` (projects chromium + mobile-chrome + axe-audit) → 0 fallos
     de regresión.
  2. `pnpm test:e2e:flake-detect` (subset `@critical`, 10× rerun, `--retries=0`)
     → 10/10 corridas verdes, 0 flaky.
Los otros 2 criterios de F14 (≥10 flujos `@critical` + CI gate) YA están. No estás
auditando ni agregando nada: estás estabilizando tests.

# Estado actual — VERIFICÁ, NO ASUMAS
- Branch de trabajo: `fix/e2e-discovery-findings-f14`.
  ANTES DE TOCAR NADA corré:
    git fetch
    git status
    git log --oneline -8
    git log --oneline origin/main..HEAD
  Puede haber OTRA sesión activa sobre esta branch. Si ves trabajo concurrente o
  divergencia inesperada, PARÁ y reevaluá (coordiná, o creá branch nueva desde `main`).
- La taxonomía de fallas vieja está en el report F14, sección "Deferred" →
  `docs/audit/reports/fase-f14-e2e-coverage-final-report.md` (buscá
  "discovery findings backlog"). ESE REPORT ES DE UNA CORRIDA VIEJA: desde entonces
  se commitearon ~14 fixes, incluido el bug arquitectural de magic-link
  (commit `de3ad6d`, pre-generación serial de storage states). Usá esa lista como
  MAPA INICIAL, nunca como verdad actual. Primero re-corré y medí el estado real.
- Estado global: `docs/audit/STATE.md` (fila F14). Plan detallado:
  `docs/audit/plans/2026-05-29-fase-f14-e2e-coverage-final.md`.
  Setup E2E: `tests/e2e/README.md` (leelo, es preciso).

# Arquitectura de tests (orientación)
- Auth: fixtures worker-scoped en `tests/e2e/fixtures.ts`; storage states
  pre-generados SERIALMENTE en `tests/e2e/global-setup.ts` vía
  `tests/e2e/_helpers/auth-state.ts` (admin.generateLink → verifyOtp → cookies SSR).
  El race de magic-link YA está resuelto por la pre-generación serial — NO lo
  "re-arregles" sin evidencia concreta de que volvió.
- `playwright.config.ts` arranca el dev server solo (`pnpm dev`,
  `reuseExistingServer` fuera de CI) e inyecta `NEXT_PUBLIC_E2E=1`, `MP_MOCK_MODE=1`,
  Upstash vacío (rate-limit off), Resend placeholder. global-setup corre
  `pnpm e2e:seed` y espera `/api/status`.
- `@critical` se taggea como SUFIJO del nombre del test; `--grep @critical` matchea
  ese sufijo.

# Pre-requisitos para correr
1. `pnpm supabase:start` (Supabase local arriba).
2. Si `push.spec.ts` falla por tabla `push_subscriptions` ausente: `pnpm db:push`
   (aplica migration 014).
3. No hace falta `pnpm dev` manual: Playwright levanta el server.

# Metodología (obligatoria)
1. Usá la skill `superpowers:systematic-debugging` por cada categoría de fallo.
   Nada de parches a ciegas.
2. MEDÍ PRIMERO: corré `pnpm test:e2e:ci` una vez, capturá la lista EXACTA de tests
   que fallan + el mensaje real de cada uno, y agrupá por causa raíz.
3. Por cada fallo decidí explícitamente: ¿bug del TEST (selector frágil, timing,
   fixture) o bug de PRODUCCIÓN (la app está mal)?
     - Bug de test → arreglá el test (selectores por rol/heading, waits event-based).
     - Bug de prod → ARREGLÁ LA APP, no el test, y documentá el bug. (En F7 el E2E
       cazó bugs reales de prod: es esperable, no lo escondas.)
4. Una causa raíz a la vez. Commits atómicos: `fix(e2e): ...` (o `fix(<área>): ...`
   si tocás producción).
5. Flakiness/timing: reemplazá `waitForTimeout` por waits event-based
   (`toBeVisible` / `not.toBeVisible({ timeout })`). NUNCA subas timeouts a lo bruto
   para tapar un race.

# Done-criterion (no declares "listo" sin esto)
Usá la skill `superpowers:verification-before-completion`. Evidencia antes que afirmaciones.
- `pnpm test:e2e:ci` → 0 rojos de regresión.
- `pnpm test:e2e:flake-detect` → 10/10 verdes, 0 flaky. Pegá el output real.
  (Presupuestá ~30-60 min de runtime para esta corrida.)
- 0 tests deshabilitados / `.skip` / `test.fixme` / aserciones debilitadas para
  "forzar" el verde.

# Prohibido (guardrails)
- ❌ Debilitar/borrar aserciones, agregar `.skip`/`fixme`, o inflar timeouts para pasar.
- ❌ Cambiar comportamiento de producción solo para que pase un test (salvo bug real
  cazado → ahí sí, y se documenta en el report).
- ❌ Violar `CLAUDE.md`: TS strict, nunca `any`; enums `canceled` (una sola L);
  montos en centavos; `SET LOCAL` para tenant context; queries solo desde Server
  Components/Actions.
- ❌ Re-hacer trabajo ya commiteado (magic-link race, strict-mode selectors ya tocados).
  Mirá `git log` antes.
- ❌ Mergear a `main` o pushear sin done-criterion cumplido. Corré `pnpm typecheck`
  antes de cada commit.

# Entregables
1. Suite E2E verde + flake-detect 10× verde (output pegado como prueba).
2. `docs/audit/STATE.md`: fila F14 → done-criterion #3 cumplido (🟡 → 🟢) y mover
   los discovery findings resueltos de "Deferred" a hechos.
3. Report F14 (`docs/audit/reports/fase-f14-e2e-coverage-final-report.md`) §Deferred:
   actualizar lo resuelto; si algo queda, justificá por qué (p.ej. integration territory).
4. Commits atómicos con prefijo correcto. Bug de prod cazado → documentado.
5. Resumen final: qué fallaba, causa raíz por categoría, qué arreglaste (test vs prod),
   y el output de flake-detect.

# Primer paso
Leé `CLAUDE.md`, `docs/audit/STATE.md` (fila F14), `tests/e2e/README.md` y el §Deferred
del report F14. Corré `pnpm test:e2e:ci` para medir el estado REAL. Planificá por causa
raíz. Recién después, tocá código.
```

## `---END---`

---

## Notas de uso

- **Dónde:** Claude Code (terminal), raíz de `TurnoGol`, con Supabase local arriba (`pnpm supabase:start`).
- **Modelo:** Opus 4.8 + extended thinking (superpowers activado).
- **Cuidado de colisión:** la branch `fix/e2e-discovery-findings-f14` la está usando otra sesión. Si esa sesión sigue activa, o la dejás terminar primero, o esta sesión nueva arranca con `git fetch` + branch nueva desde `main` para no pisarse.
- **Tiempo:** el `flake-detect` 10× corre ~30-60 min. El resto depende de cuántos rojos queden tras los fixes ya commiteados (probablemente bastante menos que los ~50 del report viejo).
- **Si el output se corta:** pedile "Continuá desde donde cortaste".
