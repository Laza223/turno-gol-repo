# Auditoría de coherencia UX con agentes — diseño

**Fecha:** 2026-09-09 · **Estado:** scope decidido por el dueño (§6) · arranca con el brief (§5.2).

## 0. Qué se pide

Después de DEMO-3 (`docs/gtm/ejecucion/10-aprendizajes.md`, 2026-09-08) el dueño quiere detectar
_todas_ las violaciones de coherencia y simplicidad de TurnoGol de forma sistemática, no de a una
recorrida por vez. Sus palabras: la app es "incoherente, incómoda", "parece improvisada", y tiene
"TANTO" que le saca jugo. Pide que Opus orqueste, que Sonnet ejecute en un workflow, y que todos los
hallazgos se validen después.

Este documento responde tres preguntas: **por qué** la app se siente así (con evidencia medida hoy),
**qué método** sirve para encontrarlo con agentes y cuál no, y **cómo se arranca**.

## 1. Diagnóstico — por qué "parece improvisada"

### 1.1 Las reglas existen. La app se alejó de ellas.

TurnoGol ya tiene escrita su constitución de coherencia:

- `docs/spec/design-system/MASTER.md` v2.0 — §1 principios (la grilla es el producto; es-AR en
  serio), §8.5 vocabulario canónico (**un término por estado en toda la app**), §9 leyes de
  psicología como reglas duras (Hick: máximo 5–7 opciones; Von Restorff: UNO distinto por vista;
  Miller: grupos de 3–4), §11 anti-patterns, §12 checklist pre-delivery ("tarea principal
  completable en ≤ 3 interacciones").
- `docs/spec/design-system/gramatica-interaccion.md` — una sola forma de hacer cada tipo de cosa
  (jerarquía de acciones de plata, deshacer vs. confirmar, plantillas de vacío y error).
- `docs/spec/design-system/pages/*.md` — 12 specs de página.

Drift medido hoy con `grep` sobre `src/app` y `src/components` (conteos indicativos: incluyen
comentarios y tests, no solo strings visibles):

| Regla                                                | Qué dice el código                                                                                                                             | Dónde                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| §8.5: `completed` → "Jugada"                         | "Completada" aparece en 14 strings de UI                                                                                                       | `reservas/(list)/page.tsx:53` (filtro "Completadas"), `CompleteBookingDialog.tsx:188`, `JugadorProfileView.tsx:15` |
| Nielsen #4 consistencia                              | El mismo lugar se llama de tres formas en un solo camino de navegación: sidebar **"Clientes"** → pestaña **"Personas"** → URL **`/jugadores`** | `admin-sidebar.tsx:75`, `ClientesTabs.tsx:4`, `JugadoresView.tsx:82`                                               |
| §8.5 espíritu: un término por concepto               | "Reserva/Reservas" ×103 y "Turno/Turnos" ×44 para la misma cosa; "Cobrar" ×54, "Cobro" ×19, "Pago" ×29, "Pagar" ×6                             | toda la app                                                                                                        |
| MASTER §13 P0.2 (formato de plata único, 2026-07-02) | Seguía abierto el 2026-09-08 ("La plata se escribe de dos formas distintas", hallazgo de la recorrida); se unificó recién ayer con `formatArs` | `src/lib/format.ts`                                                                                                |

### 1.2 La mitad del admin se construyó sin spec de página

El admin tiene 35 rutas; 6 son redirects de compatibilidad (`/metricas`, `/reportes`, `/deudas`,
`/jugadores/deudas`, `/staff`, `/canchas`). De las **29 pantallas reales, 17 no tienen spec propia**:
torneos ×6, jugadores ×2, settings ×5 (índice, perfil, reservas, facturación, avisos) y las 4
pestañas de Caja que no son "Caja del día" — `pages/caja.md` §2.5 lo dice textual: "las otras 4 no
tenían spec — resumen mínimo". Son exactamente las pantallas que el dueño nombró en DEMO-3 (Caja,
deudas, cantina, productos, torneos). **No es casualidad: no había nada con qué ser coherentes.**

Además, la spec ya quedó atrás de los fixes de ayer: `caja.md` §2.5 todavía llama "Plata en la
calle" a la pestaña que hoy se llama "Deudas". Para la auditoría, la spec es un insumo que también
se corrige, no una verdad revelada.

### 1.3 Tres auditorías previas, ~128 hallazgos, y el callejón sin salida seguía ahí

| Auditoría                                 | Método                                                               | Hallazgos | Problema                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-28 `AUDITORIA_UI_COMPLETA`        | ~54 agentes por vista y rol, browser real                            | 46        | Cero screenshots (el pane no componía frames), cobertura efectiva 52 %, 9 tabs para 54 agentes, DB reseteada en paralelo                                                                                                                                                                                                                                         |
| 2026-08-14 `AUDIT_APP_FINDINGS`           | 23 agentes por vista contra `vistas_qa_exhaustivo.md`, BUG vs MEJORA | 60        | **Se cerraron los 60** en 4 tandas (ledger en `docs/audit/archive/sin-fecha.md`, en main desde #244 el 2026-08-27: 41 BUG = 39 aplicados + 2 borrados con OK; 19 MEJORA = 18 aplicados + 1 no reproduce; spot-check en código: el fix de `DeleteAccountForm.tsx:33` está). Y DEMO-3 pasó igual. El handoff del 2026-08-25 todavía dice "sin triage": quedó viejo |
| 2026-09-08 recorrida del dueño (artifact) | 1 evaluador (Opus) caminando 23 tareas como dueño, app corriendo     | 17 + 4    | Un solo evaluador; horario 02–05 AM impidió ver filas pasadas                                                                                                                                                                                                                                                                                                    |

Lectura: las dos auditorías grandes fueron **por vista** ("¿esta pantalla hace lo que dice el
checklist?"). La coherencia es una propiedad **entre** pantallas y **a lo largo** de una tarea. Por
eso una hora caminando tareas encontró un bloqueo que no se podía liberar desde ninguna vista, que
ninguna auditoría por vista había visto.

### 1.4 Nadie hizo nunca una auditoría de resta

Las tres auditorías suman ("falta X", "agregar Y"). Ninguna preguntó, elemento por elemento, "¿quién
usa esto, cada cuánto, y qué pasa si lo sacamos?". La sensación de "TANTO" no tiene todavía un
inventario que la respalde ni la refute. Hick ya es regla del sistema (MASTER §9); falta aplicarla
hacia atrás.

## 2. Qué puede hacer un agente y qué no

Los métodos de evaluación de usabilidad se dividen en dos familias:

**De inspección** (un experto revisa la interfaz contra reglas; no hace falta usuario). Estos sí los
pueden hacer agentes:

- **Evaluación heurística** (Nielsen & Molich 1990; Nielsen 1994): 3–5 evaluadores revisan cada
  pantalla contra 10 heurísticas, **de forma independiente**, y después se agregan los hallazgos.
  El dato que justifica el multi-agente: un evaluador solo encuentra del orden de un tercio de los
  problemas; cinco independientes, alrededor de tres cuartos. La independencia es la clave — si
  hablan entre sí antes de terminar, convergen y pierden cobertura.
- **Recorrido cognitivo** (Wharton, Rieman, Lewis & Polson 1994): se toma una tarea concreta y en
  cada paso se contestan cuatro preguntas: ¿el usuario va a intentar el efecto correcto? ¿va a ver
  que el control existe? ¿va a asociar el control con el efecto? ¿va a ver que avanzó? Necesita
  **escenarios de tarea** — es el único de los cuatro que los necesita.
- **Inspección de consistencia** (Nielsen 1994): mismo concepto, misma palabra, mismo lugar, mismo
  gesto, en todas las pantallas. Es una comparación cruzada, cara para un humano y barata para un
  agente con `grep`.
- **Inventario y resta** (Krug, _Don't Make Me Think_; Hick): cada elemento visible clasificado por
  frecuencia de uso y costo de sacarlo.

**Empíricos** (se observa a un usuario real). Estos **no** los puede hacer un agente:

- **Think-aloud con 5 usuarios** (Nielsen 2000): cinco dueños reales, cinco tareas, sin ayudarlos,
  pidiéndoles que piensen en voz alta. Es lo único que mide si _entienden las palabras_.

Límite conocido de los métodos de inspección, que hay que diseñar alrededor: el **efecto evaluador**
(Hertzum & Jacobsen 2001 — evaluadores distintos coinciden poco entre sí) y la tasa de falsos
positivos (Jeffries et al. 1991 — una parte grande de lo que encuentra una inspección no molesta a
un usuario real). Ayer, en la propia recorrida: 1 falso positivo en 4 hallazgos nuevos. Por eso el
diseño tiene tres filtros después del hallazgo: verificación adversarial con contexto fresco, voto
del dueño, y al final usuarios reales.

## 3. Opciones

**A. Corrida completa de una.** Cuatro lentes, todas las superficies (admin, encargado, portal,
jugador), ~30 buscadores + ~100 verificadores. Pro: todo junto. Contra: la rúbrica y los prompts
salen mal calibrados la primera vez (siempre pasa) y el resultado son 100–150 hallazgos con mitad de
ruido, que el dueño tiene que votar uno por uno. El cuello de botella es su tiempo, no los tokens.

**B. Piloto en Caja, después corrida completa — recomendada.** Se corren las cuatro lentes solo
sobre Caja (5 pestañas, la zona que el dueño llamó "un desastre"): ~10 buscadores, ~30
verificadores, 20–30 hallazgos, 15 minutos de voto. Con lo que se aprende se corrigen prompts y
rúbrica, y recién ahí se corre el resto. Pro: calibra barato donde más duele, entrega valor en una
sesión, y el segundo run sale limpio. Contra: dos sesiones en vez de una. Es lo que recomienda
cualquier manual de estudios de usabilidad: piloto antes del estudio.

**C. Sin agentes: cinco dueños reales.** Pro: mide comprensión, que los agentes no miden. Contra:
hay que reclutarlos (hoy hay dos leads), es lento, y no escala a 29 pantallas. **No reemplaza a B:
va después de B, sobre la versión ya arreglada**, y es la validación final.

## 4. Diseño de la opción B

### 4.1 Insumos (todos existen; no hay que escribir un doc de happy paths)

| Insumo                | Dónde está                                                                                                                                     | Para qué lente                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Reglas propias        | MASTER §1, §8.5, §9, §11, §12 · gramática §2–§5 · `pages/*.md`                                                                                 | L1                                              |
| Tareas con frecuencia | Las 23 tareas del artifact "Recorrida del dueño" (2026-09-08) · `docs/testing/HAPPY_PATHS_MASTER.md` (64 casos) de referencia · doc7 flujos    | L2                                              |
| Personas              | doc3: Marcelo (dueño, tech 2.5/5, "confirmar y cobrar en menos de 20 segundos con 3 personas esperando"), Rodrigo (encargado), Tomás (jugador) | L2, L3                                          |
| Hallazgos conocidos   | `AUDITORIA_UI_COMPLETA_2026-07-28.md` · `AUDIT_APP_FINDINGS.md` · artifact 2026-09-08                                                          | todas (marcar RECURRENTE en vez de re-reportar) |
| Corpus de screenshots | Se genera una vez (§4.5)                                                                                                                       | L3, L4                                          |
| Brief de la auditoría | **Único documento nuevo** (~2 páginas): personas, tareas, rúbrica, esquema de hallazgo, lista de conocidos                                     | todas                                           |

### 4.2 Las cuatro lentes

**Decidido 2026-09-09: corrida completa del admin + encargado de una sola vez, sin piloto previo
en Caja** (el dueño prefirió no calibrar en una zona chica primero). Consecuencia asumida: la
primera tanda de hallazgos va a salir mas ruidosa que si hubieramos calibrado los prompts contra
un caso chico antes, asi que el voto de la primera vuelta va a llevar mas tiempo — se compensa con
la verificacion adversarial de W2, que filtra antes de llegar al voto.

| Lente                                | Metodo                                         | Entrada                                           | Agentes (admin + encargado completo)              | Tipo de hallazgo                     |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| **L1 Contra sus propias reglas**     | inspeccion de consistencia + spec vs. realidad | codigo + corpus + MASTER/gramatica/pages          | 4                                                 | COHERENCIA (objetivo, cita la regla) |
| **L2 Recorrido cognitivo por tarea** | cognitive walkthrough                          | app corriendo (Playwright MCP) + tareas           | 8                                                 | CALLEJON, FEEDBACK, PASOS DE MAS     |
| **L3 Heuristica por pantalla**       | evaluacion heuristica                          | corpus de fotos (desktop + mobile, 2 roles)       | 2 evaluadores independientes x 5 grupos del admin | HEURISTICA (Nielsen #1-#10)          |
| **L4 Inventario y resta**            | feature inventory                              | codigo + corpus + hipotesis del dueno (ver abajo) | 2                                                 | RESTA (mantener / plegar / sacar)    |

**Item ya cargado en L4, a pedido del dueno:** revisar `/dashboard` ("Hoy") — hipotesis del dueno
es que no aporta valor real. L4 lo evalua como cualquier otro: quien lo usa, cada cuanto, que se
rompe si se saca o se pliega dentro de Grilla. El veredicto de sacarlo o no queda para el voto del
dueno (RESTA), no lo decide el agente.

### 4.3 Esquema de hallazgo y barra de evidencia

Sin esto un hallazgo no vale (misma barra que `caza-bugs-turnogol.js`, adaptada a UX):

- `route`, `role` (admin | manager | player | public), `viewport` (desktop | mobile)
- `element`: **el texto exacto** del control o copy, o `archivo:línea`, o nombre del screenshot
- `kind`: BUG | COHERENCIA | HEURISTICA | CALLEJON | RESTA
- `rule`: qué regla se viola, citada (`MASTER §8.5`, `gramática §3 clase B`, `pages/caja.md §5`,
  `Nielsen #3 control y libertad`, `doc3 JTBD 1`)
- `scenario`: en palabras de la persona ("Marcelo, viernes 23:15, fila en el mostrador, abre X y…")
- `severity` 0–4 (escala de Nielsen: 0 no es problema · 1 cosmético · 2 menor · 3 mayor · 4
  catastrófico) — la asignan **dos agentes independientes** después del hallazgo, no quien lo
  encontró, y se promedia
- `frequency`: diario | semanal | mensual | única-vez (de la tarea en la que aparece)
- `fix`: el cambio mínimo, o `requiresInput: true` si es decisión de negocio
- Para RESTA: `keep | fold | remove` + "qué se rompe si se saca"

Prioridad = severidad × frecuencia. Callejones sin salida y circuitos de plata van primero siempre:
un 2 en la grilla diaria vale más que un 3 en una configuración anual.

### 4.4 Pipeline — tres workflows, con el dueño en el medio

```
W1 BUSCAR  (Sonnet)   L1 ‖ L3 ‖ L4 estáticas  +  L2 en vivo        → hallazgos crudos (JSON)
   dedup en script    clave route+element (primitiva, no referencia — memoria workflow-parallel-serializa)
W2 JUZGAR  (Sonnet)   severidad ×2 independientes → verificación adversarial con contexto fresco:
                      sev ≥ 3: 3 lentes ("¿es real?", "¿viola la regla citada?", "¿Marcelo lo notaría?")
                      sev 2:   1 lente · sev ≤ 1: sin verificar (los filtra el voto)
   artifact           lista votable (mismo mecanismo que "Recorrida del dueño", capability db)
DUEÑO                 vota: arreglar ahora · decisión mía · post-freeze · no
W3 ARREGLAR (Sonnet)  lotes por prioridad, implementador ≠ verificador, juez completo del repo
                      → re-recorrida L2 + re-captura del corpus (antes/después)
```

Opus orquesta, escribe el brief, hace el dedup y la lectura final. Sonnet ejecuta todo lo demás.
Regla del núcleo: máximo 6 subagentes simultáneos fuera de workflow; dentro del workflow el tope lo
pone la herramienta.

### 4.5 Infraestructura: el corpus de screenshots

Ya existe el generador: `tests/e2e/capture-screenshots.spec.ts` ("UX Audit Screenshot Capturer",
~25 rutas × 2 viewports, seed propio, limpieza) y un corpus de 100 fotos en `docs/audit/screenshots/`
del 2026-07-01 — anterior al rediseño del admin, hoy inútil. El trabajo es **extender, no construir**:

- Rutas nuevas: torneos ×6, caja ×4, jugadores ×2, settings/{perfil,avisos,facturacion,reservas}.
- Dos roles: admin y manager (el manager ve menos y distinto; nadie lo fotografió nunca).
- Viewports: 1440×900 y 393×851 (los dos proyectos `visual` de `playwright.config.ts`, con
  `es-AR`, zona horaria ART y `colorScheme: light`). Dark queda para una segunda pasada.
- Datos "sucios" a propósito: deudas de 30 días, un hold vivo, un bloqueo, un torneo con horarios,
  cantina con fiados, un día cerrado. Sin esto, la mitad de los estados no aparece en la foto.
- Salida: `docs/audit/screenshots/2026-09/{desktop,mobile}/{admin,manager,player,public}/`, con
  un `INDICE.md`. El mismo corpus sirve después como línea base del antes/después.

Gotchas ya pagados que el brief hereda: un solo `next dev` por directorio (memoria
`next16-dev-single-instance-e2e`), `supabase db reset` deja roles NOLOGIN, leer `<failures>` del
Workflow antes de creerle al resultado, retomar con `scriptPath + resumeFromRunId` en vez de
relanzar, y un agente que muere reportando puede haber implementado igual (verificar el diff, no el
mensaje).

### 4.6 Costo estimado

| Fase                               | Buscadores | Jueces + verificadores | Fixes (W3)              | Tiempo del dueno  |
| ---------------------------------- | ---------- | ---------------------- | ----------------------- | ----------------- |
| Corrida completa (admin+encargado) | ~24        | ~100                   | por lotes, 2-3 sesiones | 40-50 min de voto |

Portal publico y app del jugador quedan para una tercera corrida, con su propia rubrica (otra
personalidad, doc3 Tomas) — no entran en esta.

Referencia real: ayer fueron 31 subagentes en 3 workflows para 17 hallazgos con fixes y
verificacion, en una sesion.

### 4.7 Freeze (D4, hasta 2026-11-01)

La auditoría en sí es observación e instrumentación: permitida. Los fixes se clasifican al votar:

- **Arreglar ahora**: BUG, CALLEJÓN, circuitos de plata, y COHERENCIA contra reglas propias (es un
  bug contra la spec). Entra en "bugs · fricción de adopción observada" — DEMO-3 ya está registrado.
- **Decisión del dueño**: RESTA (sacar o plegar algo) y cualquier hallazgo con `requiresInput`.
- **Post-freeze**: rediseños que no salgan de una observación.

## 5. Cómo se arranca (orden, y quién hace cada cosa)

1. ~~Commitear el trabajo de ayer~~ — **hecho 2026-09-09**: 9 commits temáticos en
   `fix/coherencia-recorrida-dueno` (ver sección 8 más abajo). Falta decidir PR.
2. **Brief** (Opus, esta sesión o la siguiente): `docs/qa/BRIEF_AUDITORIA_COHERENCIA.md`,
   ~2 páginas — personas, 23 tareas con frecuencia, rúbrica, esquema, lista de hallazgos ya
   cerrados (para marcar REGRESIÓN si algo reaparece), reglas del dueño ya decididas (sin precios
   en "Reservar", jugador ve solo Libre/Ocupado, KPIs son ocasionales), más el item "Hoy" cargado
   en L4. Es el archivo que la sesión nueva lee primero.
3. **Corpus** (Opus + 1 implementador Sonnet): extender `capture-screenshots.spec.ts` para las 29
   pantallas del admin+encargado, seed sucio, generar `docs/audit/screenshots/2026-09/` (solo tema
   claro — ver sección 6).
4. **Sesión nueva**: `/donde-estoy` → leer el brief → W1 sobre las 4 lentes, admin+encargado
   completo → W2 → artifact votable.
5. **Dueño vota** (40–50 min, una sola tanda porque no hay piloto previo).
6. **W3** fixes por lote + re-recorrida + re-captura del corpus (antes/después).
7. **Después de todo**: 3–5 dueños reales, 5 tareas, sin ayudarlos. Es el test que ningún agente
   reemplaza. Portal público y app del jugador: tercera corrida, con su propia rúbrica.

## 6. Decisiones del dueño (2026-09-09)

1. **Commit del trabajo de ayer** → sí, hecho (9 commits, ver sección 8). PR: pendiente de la
   respuesta de esta sesión (ver mensaje de cierre).
2. **Piloto vs. corrida completa** → corrida completa del admin+encargado de una, sin piloto en
   Caja. Ver la nota de riesgo en §4.2 (primera tanda más ruidosa, sin prompts calibrados).
3. **Alcance** → admin + encargado. Portal público y app del jugador quedan para una tercera
   corrida aparte.
4. **Corpus en dark** → no. Ver definición de "corpus" en §4.5: es la carpeta de fotos de cada
   pantalla (no un concepto propio de este documento) que alimenta L3 y sirve de base para el
   antes/después. Se genera solo en tema claro por ahora.

## 7. Riesgos y límites

- **Falsos positivos**: esperar 25–40 % antes del voto. Es el motivo de W2 y del voto; no se
  elimina, se filtra.
- **Vocabulario**: los agentes detectan _inconsistencia_ ("Clientes"/"Personas"/"Jugadores"); cuál
  es la palabra correcta lo saben los dueños de complejo, no los agentes. Ese dato sale de las
  demos y del paso 7.
- **Lo que una foto no muestra**: toasts, loading, feedback tras la acción. Lo cubre L2, solo en
  las tareas de la lista. Todo lo que no esté en una tarea queda sin recorrer.
- **Specs desactualizadas**: L1 va a marcar cosas donde la spec está mal y el código bien (ya pasa
  con "Plata en la calle"). El hallazgo se resuelve corrigiendo la spec; el brief lo dice explícito.
- **Los 60 hallazgos de 2026-08-14 ya cerrados**: el brief los lista como cerrados-conocidos para que
  un buscador marque REGRESIÓN si algo reaparece, en vez de reportarlo como nuevo.

## 8. Commit del 2026-09-09

El trabajo del día anterior (17 hallazgos de la recorrida del dueño + 4 de la segunda pasada) se
dividió en 9 commits temáticos sobre `fix/coherencia-recorrida-dueno`, cada uno con su propio
mensaje explicando el "antes" (citando DEMO-3) y el "después":

1. `fix(dinero)` — formato de plata único + sidebar "HOY" que se actualiza solo
2. `fix(portal)` — el jugador ya no ve bloqueos ni el precio total
3. `fix(grilla)` — plata pendiente por celda + header "Por cobrar"
4. `feat(booking)` — liberar un bloqueo manual (el hallazgo más grave)
5. `fix(booking)` — "cobrar todo en efectivo" cobra de verdad + separar reservar de bloquear
6. `fix(reservas)` — lista y detalle muestran cuánto falta cobrar
7. `fix(caja)` — "Deudas" en vez de "Plata en la calle" + sin categoría fantasma en cantina
8. `docs(gtm)` — DEMO-3 en aprendizajes + seed de demo con formato real
9. `docs` — este diseño

DoD verificado antes de commitear: `format:check`, `typecheck`, `lint`, `knip` verdes (único
resto: el warning preexistente de `scripts/ig-follow/accounts.json`, ajeno a este esfuerzo). El
juez completo con los 4108 tests ya había corrido en verde más temprano en la misma sesión, sin
cambios de código de aplicación desde entonces.

**Quedaron afuera del commit, sin tocar** (preexistentes, de otros esfuerzos): `docs/BITACORA.md`,
`scripts/demo/record.ts`, `scripts/ig-follow/accounts.json`, `AGENTS.md`, `.agents/skills/*`,
`docs/audits/2026-09-06-auditoria-integral-fase-diagnostico.md`, `scripts/demo/flows/*-dark.json`.
