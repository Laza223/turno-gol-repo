# Fase B0 — Baseline + Smoke (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establecer baseline objetivo del estado actual del proyecto TurnoGol corriendo TODOS los gates de calidad existentes (typecheck, lint, tests unit/integration/isolation/e2e, stress, launch-check) y documentando resultados en `docs/audit/reports/fase-b00-baseline-report.md` para que las fases siguientes prioricen sobre datos reales, no hipótesis.

**Architecture:** Plan secuencial de diagnóstico (NO modifica código). Cada tarea ejecuta un comando, captura output completo, lo clasifica (✅ pass / ❌ fail / ⚠️ warning / 🟡 flaky) y lo registra en el report. Si una tarea falla, NO se intenta fix en esta fase — se documenta como issue prioritario para fase siguiente. Worktree dedicado `audit/backend-b00` para no contaminar main. Al final, commit del report a main vía PR.

**Tech Stack:** pnpm 8.15, Node 20, Vitest, Playwright, Supabase CLI, tsx, ESLint, TypeScript 5.

---

## File Structure

**Crear:**
- `docs/audit/reports/fase-b00-baseline-report.md` — report con todos los outputs y clasificación
- `docs/audit/reports/fase-b00-raw/typecheck.txt` — output crudo typecheck
- `docs/audit/reports/fase-b00-raw/lint.txt` — output crudo lint
- `docs/audit/reports/fase-b00-raw/test-unit.txt`
- `docs/audit/reports/fase-b00-raw/test-integration.txt`
- `docs/audit/reports/fase-b00-raw/test-isolation.txt`
- `docs/audit/reports/fase-b00-raw/test-e2e.txt`
- `docs/audit/reports/fase-b00-raw/stress-bookings.txt`
- `docs/audit/reports/fase-b00-raw/launch-check.txt`

**Modificar:**
- `docs/audit/STATE.md` — actualizar fase actual + agregar Fase B0 a completadas al final

**NO modificar (esta fase es solo diagnóstico):**
- Cualquier archivo en `src/`
- Cualquier archivo en `tests/`
- `package.json`, configuración

---

## Task 0: Setup Worktree

**Files:**
- Crear worktree: `audit/backend-b00`

- [ ] **Step 1: Verificar branch limpio en main**

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol"
git status
```
Expected: `nothing to commit, working tree clean` en branch `main`.

- [ ] **Step 2: Crear worktree para Fase B0**

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol"
git worktree add ../TurnoGol-audit-b00 -b audit/backend-b00
```
Expected: `Preparing worktree (new branch 'audit/backend-b00')` + worktree creado en path adyacente.

- [ ] **Step 3: Verificar worktree**

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol" && git worktree list
```
Expected: 2 worktrees listados: main + audit/backend-b00.

- [ ] **Step 4: Crear directorios para outputs**

```bash
cd "../TurnoGol-audit-b00" && mkdir -p docs/audit/reports/fase-b00-raw
```
Expected: directorios creados sin error.

---

## Task 1: Typecheck Baseline

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/typecheck.txt`

- [ ] **Step 1: Ejecutar typecheck y capturar output**

```bash
cd "../TurnoGol-audit-b00" && pnpm typecheck > docs/audit/reports/fase-b00-raw/typecheck.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/typecheck.txt
```
Expected: archivo `typecheck.txt` generado. Si exit code 0 → ✅, si != 0 → ❌.

- [ ] **Step 2: Contar errores y warnings**

```bash
cd "../TurnoGol-audit-b00" && grep -c "error TS" docs/audit/reports/fase-b00-raw/typecheck.txt || echo 0
```
Expected: número entero (0 = clean, >0 = errores).

- [ ] **Step 3: Si hay errores, listar top 10 archivos afectados**

```bash
cd "../TurnoGol-audit-b00" && grep "error TS" docs/audit/reports/fase-b00-raw/typecheck.txt | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -10
```
Expected: lista con conteo por archivo. Skip si 0 errores.

---

## Task 2: Lint Baseline

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/lint.txt`

- [ ] **Step 1: Ejecutar lint y capturar output**

```bash
cd "../TurnoGol-audit-b00" && pnpm lint > docs/audit/reports/fase-b00-raw/lint.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/lint.txt
```
Expected: archivo generado, clasificar por exit code.

- [ ] **Step 2: Contar errors vs warnings**

```bash
cd "../TurnoGol-audit-b00" && grep -c "error" docs/audit/reports/fase-b00-raw/lint.txt || echo 0
cd "../TurnoGol-audit-b00" && grep -c "warning" docs/audit/reports/fase-b00-raw/lint.txt || echo 0
```
Expected: dos números (errors, warnings).

---

## Task 3: Unit Tests Baseline

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/test-unit.txt`

- [ ] **Step 1: Ejecutar tests unit y capturar output**

```bash
cd "../TurnoGol-audit-b00" && pnpm test > docs/audit/reports/fase-b00-raw/test-unit.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/test-unit.txt
```
Expected: archivo generado.

- [ ] **Step 2: Extraer summary (passed/failed/skipped)**

```bash
cd "../TurnoGol-audit-b00" && grep -E "Test (Files|Suites)|Tests" docs/audit/reports/fase-b00-raw/test-unit.txt | tail -10
```
Expected: líneas con conteos vitest.

---

## Task 4: Levantar Supabase Local

**Files:** (ninguno modificado)

- [ ] **Step 1: Verificar Supabase CLI instalado**

```bash
cd "../TurnoGol-audit-b00" && pnpm exec supabase --version
```
Expected: versión visible (ej: `1.226.4`). Si no, BLOCKED → reportar al humano.

- [ ] **Step 2: Iniciar Supabase local**

```bash
cd "../TurnoGol-audit-b00" && pnpm supabase:start 2>&1 | tail -30
```
Expected: Salida con `API URL`, `DB URL`, `Studio URL`, etc. Si falla por Docker no corriendo → BLOCKED.

- [ ] **Step 3: Aplicar schema**

```bash
cd "../TurnoGol-audit-b00" && pnpm db:push 2>&1 | tail -20
```
Expected: `Changes applied` o similar. Si error de conexión → revisar `.env.local` presente.

- [ ] **Step 4: Validar conexión a DB**

```bash
cd "../TurnoGol-audit-b00" && pnpm exec supabase status 2>&1
```
Expected: servicios `RUNNING`.

---

## Task 5: Integration Tests Baseline

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/test-integration.txt`

- [ ] **Step 1: Ejecutar integration tests (puede tardar minutos)**

```bash
cd "../TurnoGol-audit-b00" && pnpm test:integration > docs/audit/reports/fase-b00-raw/test-integration.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/test-integration.txt
```
Expected: archivo generado. Si exit code != 0, NO arreglar — solo documentar.

- [ ] **Step 2: Extraer summary y lista de tests fallidos**

```bash
cd "../TurnoGol-audit-b00" && grep -E "✓|✗|FAIL|PASS|Tests" docs/audit/reports/fase-b00-raw/test-integration.txt | tail -50
```
Expected: outputs con detalle.

- [ ] **Step 3: Contar fallidos por archivo**

```bash
cd "../TurnoGol-audit-b00" && grep -E "FAIL " docs/audit/reports/fase-b00-raw/test-integration.txt | awk '{print $2}' | sort | uniq -c
```
Expected: lista archivos con fallas.

---

## Task 6: Isolation Tests Baseline (BLOQUEANTE según doc16)

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/test-isolation.txt`

- [ ] **Step 1: Ejecutar isolation tests específicamente**

```bash
cd "../TurnoGol-audit-b00" && pnpm test:isolation > docs/audit/reports/fase-b00-raw/test-isolation.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/test-isolation.txt
```
Expected: archivo generado. Exit 0 = ✅ BLOQUEANTE pasado. Exit != 0 = 🚨 BLOQUEANTE FALLIDO → marcar como issue P0 en report.

- [ ] **Step 2: Si fallaron, extraer detalle de falla**

```bash
cd "../TurnoGol-audit-b00" && cat docs/audit/reports/fase-b00-raw/test-isolation.txt | tail -100
```
Expected: stack traces visibles. Skip si pasó.

---

## Task 7: E2E Tests Baseline

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/test-e2e.txt`

- [ ] **Step 1: Seed E2E**

```bash
cd "../TurnoGol-audit-b00" && pnpm e2e:seed > docs/audit/reports/fase-b00-raw/test-e2e-seed.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/test-e2e-seed.txt
```
Expected: seed completo sin error.

- [ ] **Step 2: Ejecutar tests E2E Playwright**

```bash
cd "../TurnoGol-audit-b00" && pnpm test:e2e > docs/audit/reports/fase-b00-raw/test-e2e.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/test-e2e.txt
```
Expected: archivo generado. Si exit != 0, capturar fallos.

- [ ] **Step 3: Extraer summary Playwright**

```bash
cd "../TurnoGol-audit-b00" && grep -E "passed|failed|skipped|flaky" docs/audit/reports/fase-b00-raw/test-e2e.txt | tail -20
```
Expected: conteos del reporte.

---

## Task 8: Stress Test Bookings

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/stress-bookings.txt`

- [ ] **Step 1: Ejecutar stress test**

```bash
cd "../TurnoGol-audit-b00" && pnpm stress:bookings > docs/audit/reports/fase-b00-raw/stress-bookings.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/stress-bookings.txt
```
Expected: archivo con métricas de throughput, errores, winners/losers en race.

- [ ] **Step 2: Extraer métricas clave**

```bash
cd "../TurnoGol-audit-b00" && tail -50 docs/audit/reports/fase-b00-raw/stress-bookings.txt
```
Expected: salida final con resumen.

---

## Task 9: Launch Check

**Files:**
- Create: `docs/audit/reports/fase-b00-raw/launch-check.txt`

- [ ] **Step 1: Ejecutar launch-check script**

```bash
cd "../TurnoGol-audit-b00" && pnpm launch:check > docs/audit/reports/fase-b00-raw/launch-check.txt 2>&1
echo "EXIT_CODE=$?" >> docs/audit/reports/fase-b00-raw/launch-check.txt
```
Expected: archivo generado. Exit 0 = OK para launch. != 0 = problemas pre-prod.

- [ ] **Step 2: Resumen**

```bash
cd "../TurnoGol-audit-b00" && cat docs/audit/reports/fase-b00-raw/launch-check.txt
```
Expected: ver todos los checks y resultado.

---

## Task 10: Generar Report Consolidado

**Files:**
- Create: `docs/audit/reports/fase-b00-baseline-report.md`

- [ ] **Step 1: Crear archivo report con estructura fija**

Contenido inicial del archivo:

```markdown
# Fase B0 — Baseline Report

**Fecha:** YYYY-MM-DD
**Worktree:** audit/backend-b00
**Ejecutor:** [agent name]
**Duración total:** [duración real]

## Resumen Ejecutivo

| Gate | Resultado | Exit Code | Tiempo |
|------|-----------|-----------|--------|
| Typecheck | ✅/❌ | N | N s |
| Lint | ✅/⚠️/❌ | N | N s |
| Unit tests | ✅/❌ (N/M) | N | N s |
| Integration tests | ✅/❌ (N/M) | N | N s |
| Isolation tests (BLOQUEANTE) | ✅/🚨 | N | N s |
| E2E tests | ✅/❌ (N/M) | N | N s |
| Stress bookings | ✅/⚠️/❌ | N | N s |
| Launch-check | ✅/❌ | N | N s |

## Veredicto Global

[uno de:]
- 🟢 BASELINE LIMPIO: todos los gates pasan, listo para Fase B1.
- 🟡 BASELINE CON ISSUES MENORES: gates principales pasan, hay warnings/flakies documentados.
- 🔴 BASELINE ROTO: gates críticos fallan, debe arreglarse antes de continuar.

## Issues Encontrados (priorizados)

### P0 (bloquean continuar)
1. [issue específico con archivo:línea + comando reproducir]

### P1 (alto, fase siguiente debería tratar primero)
1. ...

### P2 (medio, agregar a backlog)
1. ...

## Outputs Crudos

- typecheck: `docs/audit/reports/fase-b00-raw/typecheck.txt`
- lint: `docs/audit/reports/fase-b00-raw/lint.txt`
- test-unit: `docs/audit/reports/fase-b00-raw/test-unit.txt`
- test-integration: `docs/audit/reports/fase-b00-raw/test-integration.txt`
- test-isolation: `docs/audit/reports/fase-b00-raw/test-isolation.txt`
- test-e2e: `docs/audit/reports/fase-b00-raw/test-e2e.txt`
- stress-bookings: `docs/audit/reports/fase-b00-raw/stress-bookings.txt`
- launch-check: `docs/audit/reports/fase-b00-raw/launch-check.txt`

## Recomendaciones para Fase B1

[basado en hallazgos B0, qué priorizar en B1 motor bookings]

## Estado para próxima fase

- Worktree audit/backend-b00: [borrar / mantener para fase siguiente]
- Branch: pushear / mergear / dejar local
```

- [ ] **Step 2: Llenar tabla resumen con datos reales de cada Task previa**

Para cada gate, completar fila con:
- Resultado clasificado (✅/⚠️/❌/🚨)
- Exit code real
- Conteo pass/fail si aplica

- [ ] **Step 3: Determinar veredicto global**

Reglas:
- 🔴 BASELINE ROTO si: isolation test falla OR (typecheck falla AND es > 50 errores) OR launch-check falla con razón bloqueante
- 🟡 BASELINE CON ISSUES si: algunos tests fallan pero los críticos pasan, lint warnings, flaky tests
- 🟢 BASELINE LIMPIO si: todos exit 0, 0 errores, 0 warnings críticos

- [ ] **Step 4: Listar issues encontrados con prioridad**

Para cada falla, escribir:
- Archivo:línea
- Mensaje de error exacto
- Comando para reproducir
- Prioridad (P0/P1/P2)

- [ ] **Step 5: Recomendar foco para Fase B1**

Basado en lo encontrado: ¿hay race conditions que fallan? ¿exclusion constraint? ¿state machine? Priorizar dentro del scope B1.

---

## Task 11: Actualizar STATE.md y Commit

**Files:**
- Modify: `docs/audit/STATE.md`

- [ ] **Step 1: Actualizar STATE.md**

Cambios:
- "Fase actual" → "B1 — Motor de Reservas (próxima)"
- "Fases completadas" → agregar "B0 — Baseline (link a report)"
- "Hallazgos críticos acumulados" → resumir P0/P1 del report
- "Próximas decisiones para el humano" → "Revisar report B0, aprobar arranque B1"

- [ ] **Step 2: Stage y commit**

```bash
cd "../TurnoGol-audit-b00"
git add docs/audit/
git commit -m "$(cat <<'EOF'
audit(b00): baseline report

Gates ejecutados:
- typecheck, lint, test (unit, integration, isolation, e2e), stress, launch-check

Ver docs/audit/reports/fase-b00-baseline-report.md para detalle.
EOF
)"
```
Expected: commit exitoso, no pre-commit hook bloqueando (si bloquea, fix hook issue, NO --no-verify).

- [ ] **Step 3: Verificar commit**

```bash
cd "../TurnoGol-audit-b00" && git log -1 --stat
```
Expected: commit con archivos del audit visibles.

---

## Task 12: Decisión Worktree

**Files:** ninguno

- [ ] **Step 1: Reportar al humano**

Mensaje al humano (controller del subagent debe entregar este reporte):

```
Fase B0 completada.
- Veredicto: [🟢/🟡/🔴 del report]
- Issues P0: N
- Issues P1: N
- Issues P2: N
- Report completo: docs/audit/reports/fase-b00-baseline-report.md
- Branch: audit/backend-b00 (worktree en ../TurnoGol-audit-b00)

Decisiones requeridas:
1. ¿Mergeo audit/backend-b00 a main vía PR ahora? (recomendado para tener el report en main)
2. ¿Procedo con Fase B1 — Motor de Reservas?
```

- [ ] **Step 2: Esperar instrucción humano**

NO hacer merge automático. NO arrancar B1 sin aprobación.

---

## Self-Review (post-plan, pre-ejecución)

**Spec coverage check:**
- ✅ Typecheck: Task 1
- ✅ Lint: Task 2
- ✅ Tests unit: Task 3
- ✅ Tests integration: Task 5
- ✅ Tests isolation BLOQUEANTE: Task 6
- ✅ Tests E2E: Task 7
- ✅ Stress: Task 8
- ✅ Launch-check: Task 9
- ✅ Setup Supabase: Task 4
- ✅ Report consolidado: Task 10
- ✅ State update: Task 11
- ✅ Decisión humano: Task 12
- ✅ Worktree isolation: Task 0

**Placeholder scan:** ningún "TBD", "implementar después", "similar a Task N". Todos los comandos y contenidos están escritos.

**Type consistency:** N/A (esta fase no escribe código TypeScript, solo ejecuta y reporta).

**Cobertura del Goal:** establece baseline ✅, documenta en reports ✅, no modifica src ✅, prioriza P0/P1/P2 ✅.

Plan listo.
