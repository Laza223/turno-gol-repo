# 08 — Prompts de implementación (V0 a V8)

**Fecha:** 2026-10-31.

## Cómo usarlos

- Cada prompt se pega en una **sesión nueva** de Claude Code, abierta en el repo TurnoGol.
- Son autocontenidos: no hace falta contexto previo.
- Van en orden. **V0 siempre primero**: la línea base se mide antes de tocar el sitio.
- Una V por sesión. Si una V queda grande, se parte, pero no se juntan dos.
- Todas arrancan en **Plan Mode**. Lázaro aprueba el plan antes de que se toque código.
- Ninguna commitea ni pushea sin pedido explícito, tal como manda `CLAUDE.md`.

---

## V0 — Línea base de medición (sin tocar el sitio)

```text
Arrancá en Plan Mode.

Contexto: TurnoGol no aparece cuando un dueño le pregunta a ChatGPT por la mejor app para gestionar su complejo de fútbol. Hay un plan de visibilidad en @docs/visibilidad-ia/00-resumen-ejecutivo.md. La medición está especificada en @docs/visibilidad-ia/06-medicion.md. Esta sesión es la V0: dejar lista la línea base ANTES de cambiar nada del sitio.

Alcance (solo archivos nuevos dentro de docs/visibilidad-ia/medicion/; no se toca código, configuración ni otras carpetas):
1. docs/visibilidad-ia/medicion/protocolo.md: el protocolo manual de @docs/visibilidad-ia/06-medicion.md §3 en una sola página, como checklist para el celular. Incluye el set v1 de 25 preguntas con su ID (§2), cuáles son las 8 del núcleo semanal, los motores por frecuencia y qué anotar.
2. docs/visibilidad-ia/medicion/plantilla-v1.csv: el encabezado exacto de §4, más una fila de ejemplo marcada como ejemplo.
3. docs/visibilidad-ia/medicion/tablero.md: el tablero semanal de §11.
4. docs/visibilidad-ia/medicion/linea-base-tecnica-AAAA-MM-DD.md: una foto técnica del sitio en vivo hoy, sin JavaScript. Con curl (Bash), para /, /para-complejos, /precios, /explorar, /el-vagon-deportivo, /complejo-evardss, /blog y las URLs del sitemap, registrá: status, title, meta description, canonical, <html lang>, H1, H2, palabras visibles aproximadas, tipos de JSON-LD, si el H1 está dentro de un <div hidden> y X-Vercel-Cache. Sumá robots.txt, el sitemap con sus lastmod y llms.txt. Sirve para comparar el antes y el después de cada V.

Reglas:
- Solo lectura sobre prod. No hagas requests a APIs pagas (presupuesto $0).
- No leas .env ni imprimas secretos.
- Español rioplatense, voseo.
- No commitees.

Criterios de aceptación:
- Los 4 archivos existen.
- El CSV abre bien en Google Sheets: separador coma, UTF-8 sin BOM.
- La foto técnica tiene una fila por URL, con evidencia (comando + output recortado).

5. Corré VOS la primera medición (D14): el núcleo semanal (8 preguntas × ChatGPT, Gemini, Perplexity y Copilot) en el navegador integrado, sin iniciar sesión, y cargá las filas en la planilla. Si un motor pide login o CAPTCHA, no lo resuelvas: anotalo como "no medible sin sesión" y seguí.

Al terminar, decile a Lázaro en 5 líneas qué dio la línea base y qué clics de cuenta le quedan (Search Console, Vercel, GitHub).
```

---

## V1 — Técnico rápido, hotfix de claims, analítica y registro de decisiones

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: plan de visibilidad en @docs/visibilidad-ia/00-resumen-ejecutivo.md. Leé @docs/visibilidad-ia/01-auditoria.md (§1 técnico, §2 contenido), @docs/visibilidad-ia/02-estrategia.md (§2 decisiones D1-D8) y @docs/visibilidad-ia/03-plan-de-implementacion.md (tareas VIS-006, 007, 009, 010, 012, 013 y 014, con criterios de aceptación). La línea base (V0) ya está medida. Antes de tocar nada, verificá que los archivos y las líneas citadas siguen así en origin/main: la auditoría es del 30/10/2026.

Alcance de esta sesión (nada más):
- VIS-006: sacar de content/blog/*.mdx y content/pages/*.mdx los claims sin dato ("60%", "líder indiscutido", "el más caro", "atrapado", "accesible", "se pague solo"). Hotfix de texto en /precios ("60 días", "cierre diario", "20 minutos") y, con el OK de P4, en /register ("Cobros automáticos", "menos de 2 minutos"). Barrido de VIS-000: precios y fechas de clientes con nombre en docs/decisions, docs/gtm y docs/planning pasan a "un cliente". Corregir el wa.me placeholder 5491100000000 usando src/lib/contact.ts. Pasar src/components/site/ArticleShell.tsx a los tokens del layout oscuro (hoy text-gray-900 sobre #020617).
- VIS-007: Vercel Web Analytics. ANTES de instalar, preguntale a Lázaro: (1) el plan de Vercel y el tope gratis de eventos, (2) el OK para la dependencia nueva @vercel/analytics (pnpm add -E). Eventos trial_signup_start, trial_signup_done y contact_whatsapp, solo si el plan los incluye. Verificá que la CSP de next.config.ts no lo bloquee.
- VIS-009: escribir docs/decisions/2026-10-31-visibilidad-ia.md con D1-D8 (texto en @docs/visibilidad-ia/02-estrategia.md §2) y agregar una línea de enmienda en docs/decisions/2026-10-20-vuelve-la-previa.md y en docs/decisions/2026-09-26-referidos.md (R6) que apunte al archivo nuevo.
- VIS-010: src/app/robots.ts sin Disallow por prefijo ambiguo (cada regla pasa a "/ruta/" + "/ruta$"), con un test unitario de slugs (canchas-el-potrero permitido, /caja bloqueado). Sumar a RESERVED_SLUGS (src/modules/tenants/tenant.utils.ts) las rutas de @docs/visibilidad-ia/02-estrategia.md §4 más monitoring, icon, apple-icon, opengraph-image, privacy y terms. ANTES pedile a Lázaro que corra un SELECT de solo lectura de los slugs actuales para descartar choques.
- VIS-012: noindex en (auth), (player) y reserva/*. Redirigir /index → / con 308. Sacar del Disallow las rutas que pasan a tener noindex.
- VIS-013: lang="es-AR" en src/app/layout.tsx. Todas las páginas públicas por buildMetadata (src/lib/seo/metadata.ts), con canonical y title.absolute donde haga falta para que no quede "TurnoGol · TurnoGol". Títulos de 60 caracteres o menos. trim() del nombre del complejo en generateMetadata y en el JSON-LD.
- VIS-014: lastmod real en src/app/sitemap.ts (nunca new Date()) e IndexNow (archivo de clave en public/ y POST en el deploy de producción, ver @docs/visibilidad-ia/06-medicion.md §7). Si para disparar el POST hace falta tocar CI o deploy, proponelo en el plan y esperá el OK.

Fuera de alcance: la home, /para-complejos, /precios, las fichas (eso es V2 y V3) y cualquier cambio de copy fuera de lo listado.

Reglas:
- Skills: convenciones-stack (si tocás DB o Server Actions) y protocolo-testing.
- Solo pnpm. No commitees sin pedido.
- Sin funciones en estado C o D (lista en @docs/visibilidad-ia/02-estrategia.md §3).

Verificación (pegá comando + output real):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip, más los tests unitarios nuevos.
- En el preview: curl -s /robots.txt; curl -sI /index (308); curl -s /login | grep -i noindex; curl -s /blog/<slug> | grep -E 'rel="canonical"|<title>'; curl -s /sitemap.xml (lastmod sin la fecha de hoy en las estáticas que no cambiaron).
- grep -riE "60%|líder indiscutido|el más caro|atrapado|accesible|se pague solo|5491100000000" content/ → vacío.
- Captura a 390 px de un artículo del blog, legible.
- Comparación contra docs/visibilidad-ia/medicion/linea-base-tecnica-*.md: qué filas cambiaron.
```

---

## V2 — Fichas y `/explorar` legibles sin JavaScript

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: plan en @docs/visibilidad-ia/00-resumen-ejecutivo.md. Problema T-02 de @docs/visibilidad-ia/01-auditoria.md: en /explorar y en las fichas /[slug], el H1 y los datos llegan dentro de <div hidden id="S:n"> con un skeleton visible (por los loading.tsx), y los bots de IA no ejecutan JS. También T-03 (/explorar es no-store). Tareas VIS-011 y VIS-026 de @docs/visibilidad-ia/03-plan-de-implementacion.md. Brief de la ficha: B-05 de @docs/visibilidad-ia/04-contenidos.md.

Alcance:
- VIS-011: que el H1, la dirección, las canchas, los horarios y los servicios de la ficha salgan en el HTML inicial. Suspense solo alrededor de la disponibilidad (ReserveSection, que sigue en el cliente). Que /explorar sin filtros sea ISR, con la sesión hidratada en el cliente. CONSERVÁ el gate de 404 de src/app/(public)/[slug]/layout.tsx:29-37. Antes de tocar loading.tsx, leé las memorias "loading.tsx y notFound" y "loading de ancestro": hay un gotcha conocido de soft-404.
- VIS-026: en la ficha, el bloque visible "Cómo se reserva acá" (seña sí o no y %, liberación a los 6 min sin pago, política de cancelación; mismos datos que muestra /[slug]/reservar), el pie "Reservas con TurnoGol · ¿Tenés un complejo? Conocé el sistema" → /para-complejos, noindex si no completó el onboarding o si marketplace_visible=false, y aggregateRating solo si las reseñas se ven en la ficha. Respetá settings.hide_public_prices: sin priceRange ni "desde $".
- Opcional, si sobra: VIS-041, PDF con el QR del link de la ficha.

Restricciones:
- La ficha no se rediseña (docs/decisions/2026-10-20-vuelve-la-previa.md): son bloques nuevos dentro del sistema visual actual (DESIGN.md), primero a 390 px.
- Skills: entrega-feature, convenciones-stack, protocolo-testing y verificacion-ux (agente sonnet-ux-verifier).
- No commitees sin pedido.

Verificación (comando + output):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip, más los tests relevantes y el e2e de la ficha y de /explorar.
- curl -s <preview>/el-vagon-deportivo: el H1 está fuera de un div hidden; aparecen el bloque "Cómo se reserva acá" y el pie.
- curl -sI <preview>/slug-que-no-existe → 404 real.
- curl -sI <preview>/explorar dos veces: la segunda no es MISS con no-store.
- Captura a 390 px y a 1280 px de la ficha.
- Después del deploy (lo hace Lázaro): Search Console → "Probar URL publicada" sobre la ficha, y la prueba VIS-005 ("Abrí la URL y decime los horarios") en ChatGPT, Claude y Perplexity.
```

---

## V3 — Entidad y enfoque: home híbrida, `/para-complejos`, `/precios`, `/nosotros` y JSON-LD

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: esta es la sesión que reenfoca el sitio. Leé completo @docs/visibilidad-ia/02-estrategia.md (frase canónica §1, decisiones D1-D8 §2, propuesta de valor y estados de cada función §3, arquitectura §4, grafo JSON-LD §5, vocabulario §9) y los briefs B-01, B-02, B-03, B-04 y B-06 de @docs/visibilidad-ia/04-contenidos.md. Tareas VIS-015 a VIS-020 de @docs/visibilidad-ia/03-plan-de-implementacion.md. Las líneas rojas están en @docs/visibilidad-ia/07-riesgos-y-lineas-rojas.md §2.

Alcance:
- VIS-015: el grafo de §5 en src/lib/seo/structured-data.ts y src/components/seo/JsonLd.tsx. Logo PNG cuadrado que exista (hoy /icon da 404). sameAs solo con los perfiles que Lázaro te confirme que ya existen. Precio del Offer leído de src/app/(business)/precios/plans-data.ts, nunca escrito a mano. Organization sin founder ni Axxen.
- VIS-016: home híbrida (B-01). El hero y el buscador quedan IDÉNTICOS. Title y description aprobados (ver B-01). Banda corta para dueños justo abajo del buscador. Enlaces a /para-complejos y /precios. Pie con /precios y /blog.
- VIS-017: /para-complejos como "sistema de gestión para complejos de fútbol" (B-02). H1 y primer párrafo con la frase canónica, un H2 por operación ordenado por momento de la noche, FAQ visible con FAQPage, 1.500 a 2.500 palabras. Solo funciones en estado A o B, con su etiqueta. Plus como extra. RIVAL solo con lo "Ya disponible" de docs/rival/landing.md.
- VIS-018: /precios (B-03): ARS + "vigentes desde", tabla de 1, 3, 5 y 10 canchas calculada con pricing.ts, Plus como opcional. Sacar "60 días", "cierre diario", "20 minutos" y "exportás cuando quieras" sin aclarar. ANTES preguntale a Lázaro la fecha de vigencia, qué decir sobre la retención de datos y cómo mostrar Plus (ver @docs/visibilidad-ia/09-preguntas-abiertas.md P5, P9 y P11). Para RIVAL en /para-complejos preguntale P7: no lo asumas.
- VIS-019: /nosotros (B-04), sin nombres propios. Confirmá que "nosotros" ya está en RESERVED_SLUGS (V1).
- VIS-020: public/llms.txt (B-06). Partí de la rama chore/llms-txt-enlaces si todavía existe.

Proceso de copy:
- Usá la skill impeccable con DESIGN.md (mobile 390 px primero; el portal y lo público tienen prioridad mobile) y pasá el copy por la skill billion-dollar-board antes de mostrarlo.
- Mostrale a Lázaro 2 o 3 variantes del H1 de /para-complejos y de la banda de la home en el navegador, para que elija.
- Voz de empresa ("Escribinos", "Te ayudamos"), voseo. Vocabulario vetado: plataforma, solución, integral, SaaS, B2B, dashboard. Nada de "el mejor", porcentajes de mejora ni números de clientes.

Skills: entrega-feature, impeccable, billion-dollar-board, verificacion-ux y protocolo-testing. Sin commits sin pedido.

Verificación (comando + output):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip, más tests (pricing-sync.test.ts incluido) y e2e @critical.
- curl -s <preview>/ | grep -E '<title>|name="description"|¿Tenés un complejo'; curl -s <preview>/para-complejos | grep -c '<h2'; curl -s <preview>/precios | grep -E 'ARS|vigentes desde'.
- grep del HTML de las 4 páginas sin "cobro automático", "te traemos", "recordatorio", "ranking", "plataforma", "60 días", "20 minutos".
- JSON-LD válido: pegá el output de validator.schema.org o del Rich Results Test para /, /para-complejos, /precios y /nosotros. curl -sI de la URL del logo → 200.
- Capturas a 390 px y a 1280 px. Captura del hero antes y después: idéntico.
- Comparación contra la foto técnica de la V0.
```

---

## V4 — "¿Cómo nos conociste?" y claims de `/register`

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: hoy el alta no guarda de dónde llega un complejo, más allá del código de referido. Tareas VIS-008 y VIS-023 de @docs/visibilidad-ia/03-plan-de-implementacion.md. Especificación en @docs/visibilidad-ia/06-medicion.md §8.2. Problema C-07 de @docs/visibilidad-ia/01-auditoria.md.

Alcance:
- VIS-008: un paso opcional, de un toque, en el ONBOARDING (no en /register, por la restricción L3 de docs/decisions/2026-09-27-landing-para-complejos.md). Opciones cerradas: Google · ChatGPT u otra IA · Instagram · Me lo recomendó otro complejo · Me escribieron de TurnoGol · YouTube · Otro. Además, guardar document.referrer y los utm_* del primer aterrizaje (cookie first-party de sesión, leída en el alta). Decidí con la skill convenciones-stack si va una columna nueva en tenants (migración nueva en src/shared/db/migrations/ con su espejo en supabase/migrations/; la aplica Lázaro, db:push y db:migrate están denegados) o una clave en tenants.settings. Que super-admin lo pueda ver.
- VIS-023 (OK de Lázaro dado el 31/10): en src/app/(auth)/register/page.tsx, sacar "Cobros automáticos con MercadoPago" sin poner la seña en su lugar (D9: la seña es un opcional, nunca titular); el panel nombra la operación (fijos, cobro por equipo, caja y buffet, reservas 24/7). Sacar "menos de 2 minutos" y "Tu primera reserva online puede llegar esta semana".

Reglas: skills convenciones-stack, migracion-segura (si hay migración) y protocolo-testing. Ley 25.326: el campo no guarda texto libre sobre personas. Sin commits sin pedido.

Verificación (comando + output):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip.
- Test de integración del guardado (respuesta + referrer + utm) y e2e del onboarding.
- Alta de prueba en local con ?utm_source=chatgpt.com: la base guarda los tres datos.
- grep de /register sin "automáticos" ni "2 minutos".
```

---

## V5 — Comparativas, alternativas a ATC y guía de cómo elegir

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: Vibe ganó la recomendación de ChatGPT, entre otras cosas, con comparativas que nombran a sus competidores con nombre y apellido. Decisión D3 de @docs/visibilidad-ia/02-estrategia.md: comparativas agresivas con datos verdaderos, con fuente y fecha, sin nada inventado. R6 no aplica a la web. Briefs B-07, B-08 y B-09 de @docs/visibilidad-ia/04-contenidos.md. Tareas VIS-030, VIS-031 y VIS-034. Riesgos legales y su mitigación en @docs/visibilidad-ia/07-riesgos-y-lineas-rojas.md §1 (publicidad comparativa).

Paso 1, relevamiento (antes de escribir):
- Con WebFetch o curl sobre la web PÚBLICA de Vibe, CanchaFija, Clubin y ATC Sports (y CanchaYa y ReservaSimple para la página de alternativas), armá docs/visibilidad-ia/medicion/competidores-AAAA-MM-DD.md con precio para 1, 3 y 5 canchas, cargo al jugador, comisión, deportes, seña, fijos, cobro por equipo, caja y buffet, faltazos, WhatsApp, prueba y permanencia. Cada dato lleva URL y fecha. Si no está publicado: "No publicado". NO raspes sus plataformas, no crees cuentas y no esquives bloqueos.
- Mostrale la tabla a Lázaro para que la revise antes de escribir las páginas.

Paso 2, páginas:
- /comparar/turnogol-vs-vibe, -canchafija, -clubin y -atc-sports (B-07).
- /alternativas/atc-sports (B-08).
- /guias/como-elegir-sistema-para-complejo-de-futbol (B-09).
- 301 en next.config.ts: /vs/alquila-tu-cancha → /comparar/turnogol-vs-atc-sports; /alternativas-alquila-tu-cancha → /alternativas/atc-sports; /blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026 → la guía. Sacá las URLs viejas del sitemap.
- Slugs en RESERVED_SLUGS antes de crear las rutas.
- Enlaces internos: /para-complejos ("¿Estás comparando?") → comparativas y guía. Ninguna página huérfana.
- NO compares con TurnosGol ni lo nombres. Sin logos ajenos. Aclaración de no afiliación al pie. Sección "cuándo conviene el otro" en cada comparativa. Nada de "más barato que ATC" (es falso).

Reglas: skills entrega-feature, impeccable (DESIGN.md, 390 px primero) y billion-dollar-board para el copy. Firma "Equipo TurnoGol", sin nombres propios. Sin commits sin pedido.

Verificación (comando + output):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip, más tests.
- curl -sI de las 3 URLs viejas → 301 o 308 hacia las nuevas.
- curl de cada página nueva: H1, tabla <table>, "según" + fecha en las celdas del competidor, FAQ.
- Script que cuente las celdas de competidor sin fuente → 0.
- Article y FAQPage válidos (validator.schema.org).
- Capturas a 390 px.
```

---

## V6 — `/funciones/*`, integración con Mercado Pago y videos

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: las páginas de producto son lo que ChatGPT lee para describir una marca candidata, y una marca omitida puede aparecer cuando la pregunta trae un rasgo distintivo. Briefs B-10 (8 páginas /funciones/*), B-11 (/integraciones/mercado-pago) y B-12 (videos) de @docs/visibilidad-ia/04-contenidos.md. Tareas VIS-032, VIS-033 y VIS-035 de @docs/visibilidad-ia/03-plan-de-implementacion.md. Estados de cada función en @docs/visibilidad-ia/02-estrategia.md §3: solo A o B, con su etiqueta.

Alcance:
- Una plantilla compartida y 8 páginas con contenido único: turnos-fijos, cobro-por-equipo, caja-y-buffet, reservas-online, faltazos, asistente-whatsapp, sena-opcional (última, D9) (Plus: extra de $15.000 por cancha; no decir "incluido" ni "24/7 solo") y rival (D12: copy de todo RIVAL, pero publicá solo lo que ya anda en producción; verificalo en el código). Antes de escribir cada página, verificá cada constante en el código (hold de 6 min, 2/90/14, generador de fijos, etc.).
- /integraciones/mercado-pago: la comisión y la acreditación de Mercado Pago se verifican en su web, con URL y fecha. Sin reembolso automático: lo hace el complejo y TurnoGol lo registra.
- Videos: si Lázaro ya subió videos a YouTube, incrustalos (lite embed, sin cargar el iframe hasta el clic) con VideoObject y la transcripción visible.
- Slugs en RESERVED_SLUGS antes de crear las rutas. Enlaces cruzados: cada función → 2 relacionadas + /precios. /para-complejos → cada función.

Reglas: skills entrega-feature, impeccable (390 px primero) y verificacion-ux. Capturas reales del panel rotuladas como ejemplo. Voz de empresa. Sin commits sin pedido.

Verificación (comando + output):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip, más tests.
- curl de cada página: H1, más de 700 palabras visibles, FAQ, enlaces.
- grep sin frases prohibidas ("cobro automático", "recordatorio", "te traemos", "ranking", "Falta Uno").
- VideoObject válido donde haya video.
- Lighthouse de una página de funciones: SEO 1.0 y LCP del lab ≤ 2,5 s.
```

---

## V7 — Herramientas, `/ayuda` y `/cambios`

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: tabla de la Etapa 3 de @docs/visibilidad-ia/04-contenidos.md y tareas VIS-050 y VIS-051 de @docs/visibilidad-ia/03-plan-de-implementacion.md.

Alcance:
- /herramientas/calculadora-de-faltazos: sale de src/app/(business)/precios/CalculadoraClavo.tsx. Form HTML real con SSR del resultado (GET con parámetros) para que funcione sin JS. /precios pasa a enlazarla.
- /herramientas/precio-por-jugador: precio de la cancha ÷ jugadores según el formato (5, 7, 11).
- /herramientas/planilla-de-fijos: CSV descargable con el formato EXACTO que acepta el importador de fijos (leé src/app/(admin)/abonados/importar).
- /ayuda: índice de tutoriales con su transcripción.
- /cambios: historial fechado solo con funciones en estado A, en lenguaje de dueño. Fechas reales sacadas de los PRs o de docs/decisions/.
- Slugs reservados antes. Enlaces internos desde /precios, /para-complejos y las funciones relacionadas.

Reglas: skills entrega-feature, impeccable y verificacion-ux. Sin commits sin pedido.

Verificación: los 4 comandos del DoD; tests de los cálculos; curl de la calculadora con parámetros que devuelve el resultado en el HTML; el CSV de la planilla importado en local sin errores.
```

---

## V8 — Medidor automático (cuando haya presupuesto)

```text
Arrancá en Plan Mode. Trabajá en un worktree propio.

Contexto: hoy la medición es manual (@docs/visibilidad-ia/06-medicion.md §3). Esta sesión implementa el medidor automático de §9, que Lázaro aprobó con presupuesto. Antes de escribir código que llame a APIs de LLM, cargá la skill claude-api y leé la documentación vigente de OpenAI (tool web_search) y de Gemini (grounding): los modelos y los precios cambian.

Alcance:
- scripts/visibility/run.ts (tsx): corre el set v1 (o el núcleo, según el presupuesto que confirme Lázaro) contra OpenAI Responses + web_search (user_location AR, include web_search_call.action.sources), Anthropic Messages + web_search (user_location country AR) y Gemini + Google Search grounding.
- PRIMERO, un request de prueba por proveedor para confirmar que acepta "AR" (Anthropic responde 400 si el código no está soportado). Si no lo acepta, documentalo y seguí sin ubicación.
- Parser de menciones (TurnoGol | Turno Gol | turnogol.app | TurnosGol | competidores), orden, URLs citadas y consultadas.
- Persistencia en la tabla de sistema ai_visibility_runs (esquema en §9): migración nueva, RLS habilitado sin policies para turnogol_app, escribe el rol worker. La migración la aplica Lázaro.
- Workflow de GitHub Actions con cron semanal (el repo es público: los minutos son gratis) y las claves de LLM como secrets. NUNCA credenciales de la DB de producción en Actions de un repo público: el workflow escribe el resultado como artifact (JSON) y lo carga el worker de Railway, o se guarda en el repo como CSV sin datos personales. Proponé la opción en el plan.
- Reporte semanal en markdown con el formato del tablero (§11).
- Tope de gasto: max_uses en la búsqueda de Anthropic y un límite de corridas por ejecución.

Reglas: skills convenciones-stack, migracion-segura, integracion-externa y claude-api. Nunca hardcodear claves. Sin commits sin pedido.

Verificación: los 4 comandos del DoD; un test del parser con respuestas fijadas (fixtures); una corrida manual del workflow (workflow_dispatch) con 2 preguntas; filas en la tabla; costo real de esa corrida registrado.
```
