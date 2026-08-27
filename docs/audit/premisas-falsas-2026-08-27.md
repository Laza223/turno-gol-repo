# Auditoría de errores recurrentes del agente — TurnoGol

**Fecha:** 2026-08-27 · **Corpus:** 160 sesiones de Claude Code sobre TurnoGol (2026-07-14 → 08-26),
640 MB de transcripts + 904 transcripts de subagente.

---

## 1. Método (y sus límites)

Tres fuentes, de menor a mayor precisión:

| Fuente | Qué da | Precisión |
|---|---|---|
| Marcadores regex sobre mensajes de Lazar ("ya existe", "asumiste"…) | 32 pares | **Baja** — sus prompts de tarea son largos y contienen esas palabras sin ser correcciones |
| Output de error pegado por Lazar en el chat | 32 ocurrencias | **Alta** — un comando que no corre es un hecho, no una opinión |
| Sección *"Errors and fixes"* de los resúmenes de compactación | 35 secciones únicas / 18 sesiones | **Alta** — el agente cataloga sus propios fallos al compactar |

**Límite honesto:** la tercera fuente solo existe en sesiones que compactaron (52 de 160). Las
sesiones cortas no dejan este rastro, así que las frecuencias de abajo son un **piso**, no un total.
La segunda fuente solo captura lo que Lazar se molestó en pegar.

---

## 2. Taxonomía, ordenada por frecuencia

### Clase A — El agente confunde la descripción con la realidad
**19 secciones / 12 sesiones. La clase dominante, por lejos.**

El agente lee un documento (memoria, matriz de auditoría, `PROGRESS.md`, un comentario en el código)
y lo trata como el **estado actual del sistema**. El doc está viejo; el agente afirma con confianza.

| Sub-clase | Frecuencia | Caso real |
|---|---|---|
| A2 · Afirmación propia refutada después por evidencia | 11 secciones / 8 sesiones | *"I claimed the settings failure was a stale tab. User corrected: **Es verdad, es un bug**."* — era `getStaffTenant` bajo `React.cache` + `revalidatePath` en el mismo request |
| A1 · Memoria o doc stale citado como estado vigente | 6 / 5 | *"Cited a stale memory as an active 🔴 (twice)… **Esta línea estuvo desactualizada 9 días y la repetí como 🔴 activo**"* |
| A3 · Leyó un comentario o una tabla en vez del sistema | 2 / 2 | *"I told the user to enable 2FA on Cloudflare **when it was already enabled**… I had read the audit matrix row instead of the platform"* |

Otros dos casos textuales de la misma clase:

- *"**False premise: real client in production** (from stale memory 'go-live primer cliente')… User
  corrected: **No hay ningún cliente serio HOY, son todas pruebas mías**."* — el análisis entero de un
  pase crítico se construyó sobre eso; costó 7 ediciones quirúrgicas revertirlo.
- *"**Grep matched a comment, not code (×3)**"* — el grep pegó en un comentario que describía el
  estado **viejo** del código.
- *"**Stale working tree.** The main tree hadn't pulled #144, so my first read of `getAbonados` was of
  old files (line 413 vs 429)."*
- *"**Misread CI as green.** `gh run list --branch main --limit 3` returned three `success` rows that
  were `security`/`React Doctor`/`Semgrep`. Filtering `--workflow CI` showed the last **5** runs are
  `failure`."*

> **Esta es la clase que Lazar describió** ("pensaba que el sistema se manejaba de una forma y en
> verdad no"). No es que falte el dato: es que el agente lee la **versión escrita** del dato en vez
> del sistema vivo.

### Clase B — Entorno y tooling: fricción mecánica, 100% predecible

| Sub-clase | Frecuencia | Hecho que lo evita |
|---|---|---|
| B2 · Prefijo de variable estilo bash en PowerShell | **11 `ParserError` + 4 `CommandNotFoundException` + 2 "no se reconoce"** (pegados por Lazar) | En PowerShell no existe `VAR=x cmd`. Va `$env:VAR = 'x'; cmd` |
| B1 · Heredoc con comillas en el Bash tool | 7 secciones / 5 sesiones | Escribir el archivo con la tool `Write` y después invocarlo |
| B6 · Exit code enmascarado / CI mal leído | 4 / 4 | `cmd \| tail` devuelve el status de `tail`. Capturar `$?` por paso. `gh run list` sin `--workflow CI` mezcla workflows |
| B5 · `form_input` no registra en inputs controlados por React | 3 / 3 | `left_click` + `type`, o native value setter + `dispatchEvent(new Event('input',{bubbles:true}))` |
| B3 · Módulo no resuelve en scripts fuera del repo | 2 / 2 (+6 `Cannot find module`) | El scratchpad no tiene `node_modules`: script al root del repo, o `createRequire` anclado a su `package.json` |
| B4 · Binario ausente en el host | 2 / 2 (+6 `command not found`) | No hay `psql` ni `jq` en esta máquina. Postgres va por `docker exec supabase_db_TurnoGol psql` |

### Clase C — Entorno de datos desincronizado
**5 secciones / 5 sesiones.**

*"All 26 admin routes rendered error boundary… `PostgresError: column tenants.mp_nickname does not
exist` → **local DB was behind code**: applied missing migrations 067 and 069."* Y la nota de
honestidad del propio agente: *"initially looked like a product bug ('login crash'), was environment
— explicitly discarded as product finding."*

---

## 3. El hallazgo que decide el plan

**Para cada uno de estos errores, la regla que lo evita YA ESTÁ ESCRITA.** No falta contenido:

| Error | Dónde ya está escrito | ¿Se siguió? |
|---|---|---|
| Clase A entera | Núcleo global: *"Verificá CÓDIGO, no mensajes: un commit, report o memoria que dice 'cerrado' no prueba nada. Grep/Read antes de afirmar vigencia."* | **No** — 19 veces |
| B2 (PowerShell) | Descripción de la tool PowerShell: *"VAR=x cmd → `$env:VAR = 'x'; cmd`"* | **No** — 17 veces |
| `getDb()` vs `getWorkerDb()` | `.claude/skills/convenciones-stack/SKILL.md` | **No** — pasó igual en `b0e232ca` |

Y la medición de carga lo confirma:

| | |
|---|---|
| Sesiones que escribieron código (Edit/Write) | **110** |
| Tenían `convenciones-stack` visible en el listado de skills | 103 |
| **La cargaron de verdad** | **10** — cobertura **9%** |

> **Conclusión:** el cuello de botella no es el conocimiento, es la **recuperación en el momento de
> actuar**. Agregar reglas nuevas a archivos que no se leen no mueve la aguja. Lo que falta es que el
> hecho correcto aparezca **cuando el agente está por hacer la acción**, sin depender de que decida
> ir a buscarlo.

Lazar ya había llegado a esto solo, el 2026-08-17 (sesión `2cdfce30`):

> *"tampoco te confíes en las cosas existentes porque por más que existan no quiere decir que
> funcionen como deberían o estén actualizadas."*

---

## 4. Qué es hookeable y qué no

| Clase | ¿Detectable determinísticamente? | Intervención |
|---|---|---|
| B2, B1, B4 | **Sí** — se ve en el comando antes de correrlo | Hook `PreToolUse` sobre `Bash`: detecta `^VAR=… cmd`, heredoc con comillas, `psql`/`jq` pelados → corrige o avisa |
| B3, B5, B6 | **Sí** — patrón en el input de la tool | Mismo hook, más reglas |
| A1, A3 | **Sí, parcialmente** — se ve el path que se está leyendo | Hook `PreToolUse` sobre `Read`: si el path cae en `docs/audit/`, `docs/qa/`, `PROGRESS.md`, `MEMORY.md` → inyectar *"este doc describe el estado en su fecha, no el de hoy: verificá contra el sistema vivo antes de afirmar vigencia"* |
| A2 | **No** — no hay señal previa a la afirmación | Solo mitigable: la inyección de A1/A3 ataca la causa más común (la fuente stale) |
| Convenciones por zona | **Sí** — se ve el `file_path` del Edit | Hook `PreToolUse` sobre `Write\|Edit`, según el plan aprobado |

---

## 5. Corolario sobre sobre-ingeniería

"ya existe / ya está hecho / no hacía falta" aparece **52 veces** en los mensajes de Lazar, pero el
minado por regex tiene baja precisión ahí y no se puede afirmar cuántas son sobre-ingeniería real.
Lo que **sí** está confirmado en los resúmenes es el patrón inverso, y es más interesante:

> *"**Nearly deleted `with-auth.ts` as dead code.** Checking the 5 'manual guard' handlers first
> revealed `system-status` duplicating it verbatim while missing request-context. Fixed by wiring,
> not deleting."*

El agente casi borra código vivo creyéndolo muerto — la misma raíz que la Clase A: decidió sobre una
lectura parcial en vez de verificar. **La sobre-ingeniería y la premisa falsa son el mismo error**,
no dos: actuar sobre una creencia sin contrastarla contra el sistema.

---

## 6. Fuera de alcance de este documento

- Métricas A/B entre cohortes (pre/post contrato de salida) — Fase 2.
- Lectura profunda de las sesiones peor rankeadas — Fase 3.
- **No hay baseline pre-OS**: la primera sesión de TurnoGol es del 2026-07-14 y el OS aterrizó el
  07-11. No se puede medir "¿sirve el OS?" contra nada en este repo.
