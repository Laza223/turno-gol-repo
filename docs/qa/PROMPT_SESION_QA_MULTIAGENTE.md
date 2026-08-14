# Prompt para la sesión de QA exploratorio multi-agente — TurnoGol

> Pegá el bloque de abajo (desde "CONTEXTO" hasta el final) como primer mensaje de la nueva
> sesión de Claude Code. Este archivo es la referencia — no hace falta pegar este preámbulo,
> solo el bloque.

---

## Cuándo usar este prompt

Cuando quieras una pasada de QA exploratorio real (navegador de verdad, no Playwright
determinístico) sobre el panel admin de TurnoGol, con criterio de un QA/diseñador humano además
del checklist. Producto de la sesión: **solo hallazgos registrados**, cero fixes aplicados.

Prerrequisito: `docs/qa/vistas_qa_exhaustivo.md` tiene que estar al día contra el código real.
Si volviste a rediseñar algo grande del panel admin desde la última actualización de ese
documento, actualizalo primero (fue generado el 2026-08-13 contra ~137 commits de rediseño;
mismo método: leer el código real vista por vista, no confiar en el doc viejo).

---

## El bloque para pegar

```text
CONTEXTO
Sos el orquestador de una sesión de QA exploratorio real sobre TurnoGol (SaaS B2B de gestión
para complejos de fútbol, Next.js 16/TypeScript/Supabase/Drizzle/MercadoPago). El panel admin
completo se rediseñó recientemente. Tu trabajo: correr la app DE VERDAD en un navegador real
(no Playwright con asserts fijos) y encontrar todo lo que esté roto, se comporte distinto de lo
documentado, o simplemente se vea/sienta mal — como lo haría un QA humano senior que nunca vio
la app, con buen ojo de diseño.

REGLA DE ORO — LEÉ ESTO DOS VECES
NO ARREGLES NADA. Ningún subagente edita código en esta sesión. El único entregable es
`docs/qa/AUDIT_APP_FINDINGS.md` con los hallazgos registrados. Si un subagente encuentra algo
"fácil de arreglar", igual lo REGISTRA, nunca lo toca. Esta sesión es pura detección.

FUENTES DE VERDAD (leelas antes de armar el plan)
1. CLAUDE.md (raíz) — convenciones críticas del producto: montos en centavos, ART vs UTC,
   roles admin/manager, multi-tenancy, enums sin doble-L, etc.
2. docs/qa/vistas_qa_exhaustivo.md — el checklist exhaustivo de qué DEBE pasar en cada vista
   (46 vistas, P0-P3). Es tu PISO, no tu techo — ver "criterio propio" abajo.
3. docs/spec/design-system/MASTER.md (doc20) — cómo debe VERSE y SENTIRSE cada personalidad
   (admin denso pero obvio, jugador cero fricción — la regla del dueño es "tan simple que un
   niño lo entienda"). Es tu ancla de gusto/criterio visual, no una opinión libre.
4. docs/qa/RECORRIDA_BROWSER_2026-07-15.md — gotchas ya documentados del entorno de testing
   (ver sección abajo, para no perder tiempo redescubriéndolos).

CRITERIO PROPIO — CÓMO USARLO SIN QUE SEA ARBITRARIO
Cada subagente prueba dos capas distintas y las reporta en categorías DISTINTAS:

  (a) BUG — contradice el checklist o el código hace algo distinto de lo que dice hacer.
      Objetivo, verificable, no admite debate.
  (b) MEJORA/UX — nada escrito lo prohíbe explícitamente, pero el propio criterio del agente
      (mirando con ojos de usuario real, primera vez) dice que algo está mal o podría ser
      mejor: un padding que rompe la consistencia con el resto del panel, un modal que se
      siente lento, un mensaje de error que confunde, un estado de carga sin feedback, un
      botón que no se ve clickeable. Para que esto no sea "no me gusta" sin sustento, cada
      hallazgo (b) tiene que citar al menos UNO de estos anclajes:
        - Un heurístico de Nielsen (visibilidad de estado, consistencia con el resto del
          sistema, prevención de errores, reconocer antes que recordar, diseño minimalista,
          ayudar a reconocer/diagnosticar/recuperarse de errores).
        - Una regla concreta de MASTER.md (doc20) que el componente no sigue.
        - Un criterio de accesibilidad básico (contraste, tamaño de tap target ≥44px,
          focus visible, texto alternativo).
        - La regla explícita del dueño: "tan simple que un niño lo entienda" — si algo
          requiere pensar dos veces para entender qué hacer, es un hallazgo válido.
      Un hallazgo (b) sin ancla citada no se registra — es ruido, no criterio.

ENTORNO
- `pnpm supabase:start` (Postgres+Auth local, :54322) si no está corriendo.
- Dev server con la config `turnogol-mock` de `.claude/launch.json` (`MP_MOCK_MODE=1`,
  `NEXT_PUBLIC_E2E=1`) — permite pagar señas sin MercadoPago real.
- Seed de datos: revisar `scripts/seed-e2e.ts` o el seed más reciente que use el repo (grepear
  antes de asumir el nombre del script). Necesitás al menos: un tenant con staff admin Y
  manager, canchas online y offline, abonados activos y pausados, jugadores con y sin
  vínculo, algún turno con seña pendiente y otro ya jugado, y — si vas a cubrir Torneos — el
  feature flag `tournaments` prendido para ese tenant (`feature_flags`, override por
  `tenant_id`; está apagado global por default).
- Multi-tenancy a tu favor: si vas a correr agentes en paralelo sobre vistas de ALTA
  (grilla/caja), considerá que cada uno opere sobre SU PROPIO tenant seedeado para no generar
  falsos positivos por choques entre agentes — salvo que quieras un grupo aparte probando
  concurrencia real a propósito (interesa, pero es otro tipo de hallazgo).

MECANISMO DE EJECUCIÓN
Cargá la skill `agent-browser` (está pensada para esto: exploratory testing con navegador real
por agente, no un pane compartido — necesitás paralelismo real de browsers, no tabs de uno
solo). Fan-out por vista o grupo de vistas chico (mismo agrupamiento que usa
`docs/qa/vistas_qa_exhaustivo.md`: torneos agrupado en 4, caja en sus 4 sub-vistas por
separado, etc. — no dividas tan fino que cada agente pierda contexto de la vista completa).

Cada agente recibe:
  - La sección completa de SU vista en vistas_qa_exhaustivo.md (categorías Render/Happy
    path/Validación/Vacío/Carga/Error/Auth — usalas como piso, no como límite).
  - Instrucción explícita de ir más allá: probar combinaciones no listadas, mirar en mobile
    Y desktop, abrir cada modal/dropdown/tooltip que encuentre aunque el checklist no lo
    mencione, intentar romperlo (submits vacíos, textos larguísimos, doble-click, back button
    a mitad de flujo).
  - El framework de criterio propio de arriba.
  - Instrucción de verificar contra la DB/API cualquier reclamo tipo "esto no se guardó" o
    "esto no llegó a X" — no confiar solo en lo visual para ese tipo de bug.
  - Prohibición explícita de tocar código.

Empezá por P0 (10 vistas) con el checklist completo — no solo happy path como hizo la
recorrida de julio. Segui con P1. Si el presupuesto de la sesión no da para P2/P3, decilo
explícitamente al cierre, no lo omitas en silencio.

GOTCHAS YA CONOCIDOS DEL ENTORNO (de RECORRIDA_BROWSER_2026-07-15.md)
- El árbol de accesibilidad (read_page) puede llegar stale — no confiar ciegamente, releer si
  algo no matchea lo que se ve.
- Clicks por coordenada a veces caen en SVGs decorativos — preferir click por selector/texto.
- Hay duplicados responsive ocultos con `display:none` (mismo DOM para mobile y desktop) —
  filtrar por `offsetParent !== null` antes de decidir qué está "visible" de verdad.
- Screenshots pueden colgar en renders pesados — tener un timeout/retry.
- El PIN NO EXISTE en el producto (eliminado migr. 029) — si alguna instrucción vieja lo
  menciona, ignorala.

FORMATO DE REGISTRO
Todo hallazgo va en `docs/qa/AUDIT_APP_FINDINGS.md` (plantilla ya creada — seguí su formato
exacto, no inventes uno nuevo). Un hallazgo por entrada, con vista/URL, categoría (BUG o
MEJORA/UX), severidad, evidencia (qué viste vs qué esperabas, screenshot si corresponde), y —
para MEJORA/UX — el ancla citada (heurístico/regla/doc). Al cierre de la sesión, actualizá el
resumen de arriba del archivo (cuántas vistas se cubrieron, cuántos hallazgos por severidad,
qué quedó sin cubrir).

CIERRE ESPERADO
Al final: qué vistas se cubrieron (y cuáles no, explícitamente), cuántos BUG vs MEJORA/UX se
encontraron, y el archivo AUDIT_APP_FINDINGS.md actualizado con todo. Nada de código tocado.
Nada de fixes aplicados, ni "ya que estaba lo arreglé".
```
