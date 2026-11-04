# Agent-readiness: https://turnogol.app

Fecha de la corrida: 2026-11-02 (15:43 a 16:00 UTC). Modo audit, sin cambios en el repo ni en producción.
Skill: `seo-agentic` 2.5.0. Tabla de hechos de vendors (`vendor-matrix.md`) verificada el 2026-09-23, hace 40 días (dentro del límite de 60).

## 1. Resumen

- **Lighthouse Agentic Browsing: 2/3 en mobile y 2/3 en desktop** (Lighthouse 13.6.0, corrida local, HeadlessChrome 156). PSI devolvió HTTP 429 (cuota diaria anónima), así que no hay número de PSI. Los audits contados son el árbol de accesibilidad (pasa), CLS (pasa) y `llms-txt` (falla). El único fallo es `llms.txt`.
- **Agent-UX heuristic: 100/100, estado complete** en `/`, `/explorar`, `/el-vagon-deportivo` y `/para-complejos` (cero controles interactivos sin nombre). Es un número aparte de la fracción de Lighthouse.
- **Puntaje de la categoría "AI Search Readiness / agentic": 72/100.** Es un juicio mío que combina acceso, árbol, contenido y exactitud. No es salida de ninguna herramienta ni del heuristic.
- Fallos P0 medidos: 0. P0 no probado: la prueba de WAF con user agents de bots (ver sección 6).
- Lo que más limita hoy a un agente: (1) el listado de `/explorar` y la ficha `/[slug]` llegan en bloques de streaming ocultos que un extractor sin JS descarta (el listado no sale); (2) `llms.txt` falla la regla de Lighthouse y además afirma cosas que el sitio no respalda.

## 2. Lighthouse Agentic Browsing

Corrida local: `pnpm dlx lighthouse@latest https://turnogol.app --only-categories=agentic-browsing` (mobile y `--preset=desktop`), 2026-11-02T15:49Z y 15:50Z, Lighthouse 13.6.0 (la matriz de vendors dice 13.5.0: es una versión más nueva). Salidas guardadas en `C:\Users\Lazar\AppData\Local\Temp\claude\C--Users-Lazar-Documents-github-TurnoGol\f80b2cac-64c4-434d-adc0-e369dc865dc8\scratchpad\lh-agentic\lh-mobile.json` y `lh-desktop.json`.

| Audit | Mobile | Desktop | Cuenta en N |
|---|---|---|---|
| `agent-accessibility-tree` | pasa | pasa | si |
| `cumulative-layout-shift` | pasa (0) | pasa (0.001) | si |
| `llms-txt` | **falla** ("File does not appear to contain any links.") | **falla** | si |
| `webmcp-form-coverage` | N/A | N/A | no |
| `webmcp-registered-tools` | N/A | N/A | no (nunca cuenta) |
| `webmcp-schema-validity` | N/A | N/A | no |
| `ard-schema` | N/A | N/A | no |

Resultado: **2/3 mobile, 2/3 desktop**. Nunca se convierte a porcentaje. Los audits de WebMCP dependen del navegador de prueba; este Chrome 156 headless no los ejecutó, así que N/A no prueba nada sobre el sitio. PSI sería la fuente de referencia: reintentar con una API key de Google (`/seo google setup`) o más tarde.

Caminos que cambian los audits contados (opciones, no objetivos):
- `llms.txt` válido (H1, al menos un enlace Markdown, 50+ caracteres): `llms-txt` pasa, **3/3**.
- Borrar `llms.txt` (404): `llms-txt` pasa a N/A, **2/2**. Es peor que arreglarlo si se quiere conservar el archivo.
- Herramientas WebMCP imperativas: suma `webmcp-schema-validity`. Es un borrador del W3C Community Group, no un estándar (WebKit se opone, Mozilla neutral; chequeado 2026-09-23). Opcional.
- Anotar todos los formularios (`toolname`/`tooldescription`): suma `webmcp-form-coverage`. Hay 2 `<form>` en `/` (marcado mobile y desktop duplicado) y 1 en `/explorar`. Anotar todo o nada: anotar a medias puede volver contado `webmcp-schema-validity` con 0.5.
- `ai-catalog.json`: suma `ard-schema`. No hay recursos de agente que listar (ni MCP, ni A2A, ni skills), así que no corresponde publicarlo.

## 3. Agent-UX heuristic (árbol de accesibilidad, Playwright)

| URL | Puntaje | Estado | Nodos | Interactivos | Sin nombre | Botones / links |
|---|---|---|---|---|---|---|
| `/` | 100 | complete | 139 | 18 | 0 | 3 / 14 |
| `/explorar` | 100 | complete | 457 | 57 | 0 | 24 / 16 |
| `/el-vagon-deportivo` | 100 | complete | 258 | 25 | 0 | 9 / 16 |
| `/para-complejos` | 100 | complete | 305 | 21 | 0 | 0 / 21 |

Observaciones del árbol (volcado completo con `render_page.py --a11y-tree`):
- Los formularios están etiquetados: `aria-label="Buscar canchas de fútbol"` en `/` y `aria-label="Buscar canchas"` en `/explorar`. Campos con nombre: LOCALIDAD (combobox), FECHA, HORA, BUSCAR (searchbox), Ordenar por, Precio mínimo/máximo, checkboxes de superficie y servicios.
- Los chips de filtro usan `aria-pressed` (17 en false, 1 en true en el HTML crudo de `/explorar`). Bien.
- La ficha `/el-vagon-deportivo` expone los siete días como botones con estado en el nombre ("Hoy lunes 2 Hay lugar"). Es lo mejor del sitio para un agente.
- Menor (P3): en `/explorar` hay dos botones "Guardar en favoritos" sin el nombre del complejo; un agente no distingue cuál guarda cuál. En `/` y `/explorar` los botones FECHA y HORA no exponen el valor elegido en su nombre ("Hoy", "Cualquiera" quedan afuera del nombre).
- `/para-complejos` no tiene botones: todo son links (21), incluido el CTA de WhatsApp. Aceptable.

## 4. Política de acceso (robots.txt, 200, un solo grupo `User-agent: *`)

`robots.txt` verificado en vivo. Sin grupos por bot, sin `Content-Signal`, sin `Agentmap`. Todos los bots caen en el grupo `*`: `Allow: /` y `Disallow` por prefijo sobre panel, API, auth y áreas del jugador. `Sitemap: https://turnogol.app/sitemap.xml`.

| Propósito | Bots | Estado hoy | Cumplimiento declarado por el vendor |
|---|---|---|---|
| Entrenamiento | GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended | Permitido en rutas públicas (cae en `*`). Sin política declarada. | GPTBot y ClaudeBot respetan robots.txt. Google-Extended y Applebot-Extended son tokens de control, sin crawler propio. |
| Búsqueda | OAI-SearchBot, Claude-SearchBot, PerplexityBot | Permitido en rutas públicas. | Los tres respetan robots.txt. |
| Disparado por usuario | ChatGPT-User, Claude-User, Perplexity-User, Google-Agent | Permitido en rutas públicas. Las rutas privadas dependen de autenticación, no de robots.txt. | Claude-User respeta. ChatGPT-User: "puede no aplicar". Perplexity-User y Google-Agent: en general lo ignoran. |

Las rutas privadas probadas con GET anónimo (sin seguir redirects): `/dashboard` y `/grilla` responden 307 a `/login`; `/perfil` responde 307 a `/configuracion`; `/mis-reservas` responde 200 (pantalla de ingreso, no se vieron datos). Un agente que ignore robots.txt aterriza en login.

Estado de WAF/Bot Protection: **no probado con user agents de bots**. Evidencia indirecta sin suplantar UA: respuestas 200 con `X-Vercel-Cache: HIT`, sin `x-vercel-mitigated`, sin `X-Robots-Tag` y sin `Link` en `/`, `/robots.txt`, `/llms.txt`. `middleware.ts` no filtra por user agent (revisado entero; `src/lib/in-app-browser.ts` solo detecta WebViews de redes para el login de Google). La auditoría previa del repo (`docs/visibilidad-ia/01-auditoria.md`, fila "Prueba de bots") reporta 200 para GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Googlebot y Bingbot en `/` y `/precios`; no lo repetí. El estado del firewall de Vercel (AI Bots, Bot Protection) no se pudo leer (la API devolvió 404 en esa auditoría, T-13): lo confirma Lázaro en el dashboard.

## 5. Hallazgos por prioridad

### F1. `llms.txt` falla la regla de Lighthouse (única causa de 2/3) — P1, severidad media

- Evidencia: `GET /llms.txt` 200, `text/plain; charset=utf-8`, 1456 bytes. Lighthouse: "File does not appear to contain any links." `agentic_check.py`: `llms-txt` fail, "contains no Markdown links", nota "no blockquote summary". Los enlaces de `public/llms.txt:18-20` están como texto plano `- Etiqueta: https://...`, no como `[texto](url)`. `/llms-full.txt` 404 (opcional).
- Causa: `public/llms.txt:17-20`. Tiene H1 (línea 1) y más de 50 caracteres; solo faltan los enlaces Markdown.
- Fix: convertir los enlaces a `[Precios](https://turnogol.app/precios)` y sumar el resumen en blockquote (`> ...`). Agregar los destinos reales que hoy faltan: `/blog`, `/vs/alquila-tu-cancha`, `/alternativas-alquila-tu-cancha`, `/rival`, `/privacidad`, `/terminos`. Hay una versión con enlaces sin commitear en la rama `chore/llms-txt-enlaces` según `docs/visibilidad-ia/01-auditoria.md` (C-08); partir de ahí y corregir F2. `agentic_fix.py llms https://turnogol.app` genera un borrador.
- Cómo sabríamos que falló: `lighthouse_agentic.py` o Lighthouse local siguen en 2/3 con `llms-txt` en 0; `agentic_check.py` `llms-txt` distinto de pass.
- Criterio: es higiene. Google Search ignora `llms.txt` y no hay evidencia de que algún agente de consumo lo lea ni de que mueva citas. Arreglarlo sube la fracción de Lighthouse, nada más.

### F2. `llms.txt` afirma cosas que el sitio no respalda — P1, severidad alta (exactitud)

Se inyecta tal cual en cualquier modelo que lo lea, sin los matices de las páginas.

| Línea | Afirmación | Respaldo en el sitio | Veredicto |
|---|---|---|---|
| `public/llms.txt:14` | "Pagos sin intermediarios ... sin comisiones ocultas ni retenciones temporales" | `/vs/alquila-tu-cancha`: "pagás solo el costo financiero normal de MP". `/precios` y `/para-complejos`: "la plata entra directo a tu cuenta", "TurnoGol no toca la plata", "Sin comisión por reserva". MercadoPago es el intermediario de cobro. La nota de proyecto `mp-liquidacion-senia-plazo-cuenta` (medida el 2026-08-18/19, no re-verificada hoy) registra comisión de MP (~1,9 % a 35 días; ~5 % a 18 días, el default) y liberación diferida ("dinero a liquidar", 2 a 70 días según la cuenta). | **No respaldada y contradicha.** Riesgo de afirmación falsa sobre plata. |
| `public/llms.txt:7` | "Eliminación de turnos colgados y ausentes" | `/para-complejos`: si no paga, "el turno se libera solo"; si no viene, "la seña pagada queda para el complejo". `/precios`: "el que no vino deja su parte". La seña es opcional ("¿No querés pedir seña? Se reserva igual online"). Se reduce el costo del ausente, no se elimina. | **Sobreafirmada.** |
| `public/llms.txt:7` | "Permite cobrar señas mediante MercadoPago directo a la cuenta del dueño" | Respaldada (`/para-complejos`, `/precios`). Omite que la seña es opcional por complejo. | Respaldada, incompleta. |
| `public/llms.txt:8` | Bloqueo online 14 días si reserva, no asiste y reincide | `/para-complejos`: "segunda ausencia en 90 días, bloqueado 14 días". `/precios` igual. | Respaldada. |
| `public/llms.txt:9-10` | Link público sin app; aviso al dueño; turno en la grilla; cierre de caja (turnos, cantina, gastos) | `/precios` ("Aviso al instante con cada reserva", "Caja completa: turnos, cantina con stock, gastos y cierre diario"). | Respaldada. |
| `public/llms.txt:4` | "fútbol 5, 7 y 11 en Argentina" | `/vs/alquila-tu-cancha` ("fútbol 5, 7 y 11"); filtros de `/explorar` (Fútbol 4 a 11). | Respaldada. |
| `public/llms.txt:12-13` | "ATC Sports, Turnito" son multi-deporte | El sitio dice "Alquila Tu Cancha (ATC)" y no "ATC Sports". Turnito aparece solo en `/alternativas-alquila-tu-cancha` (descrito como sistema genérico de turnos, también para peluquerías). El archivo omite el bloque "Cuándo NO elegir TurnoGol" de `/vs`. | **Nombre no respaldado y comparación sin matices.** Ya existe `/vs`: el llms.txt solo necesita enlazarla. |
| `public/llms.txt:15` | "Se gestiona desde el celular del dueño o encargado" | `/precios`: "Grilla en vivo desde el celular"; `/para-complejos`: el encargado entra con su usuario. | Respaldada. |

- Fix: reescribir `public/llms.txt:14` sin "sin intermediarios" ni "retenciones temporales", por ejemplo: "TurnoGol no cobra comisión por reserva y no toca la plata: la seña va a la cuenta de MercadoPago del complejo, con los costos y plazos que MercadoPago aplique". Cambiar "Eliminación" por "Menos turnos colgados y ausentes" (o el encuadre que decida el dueño). Reemplazar "ATC Sports" por "Alquila Tu Cancha (ATC)" o sacar los nombres y enlazar `/vs` y `/alternativas`. Verificar el punto de MercadoPago contra una cuenta actual antes de publicar (la nota tiene 75 días).
- Cómo sabríamos que falló: `curl https://turnogol.app/llms.txt | grep -i -E "intermediarios|retenciones|Eliminaci|ATC Sports"` devuelve líneas.
- Nota de coherencia: `docs/visibilidad-ia/03-plan-de-implementacion.md` VIS-020 pide "ningún competidor" y precio con vigencia; hoy el archivo hace lo contrario (nombra competidores, no trae precio). El precio hoy respaldado por `/precios` es $30.000 por cancha por mes (3 canchas = $90.000), 30 días gratis sin tarjeta.

### F3. El contenido principal de `/explorar` y de las fichas llega en bloques de streaming ocultos — P1 (warn), severidad media

- Evidencia (HTML crudo, sin JS): en `/explorar` el listado, el `<h1>` y las tarjetas están dentro de `<div hidden id="S:n">` (4 bloques) y lo visible en el HTML inicial es el skeleton (98 referencias `skeleton`). En `/el-vagon-deportivo` y `/complejo-evardss`: 1 bloque `S:0` que contiene el JSON-LD `SportsActivityLocation` y el `<h1>` (el `<h1>` está después del inicio del bloque oculto). Prueba con extracción de texto del HTML crudo (`render_page.py --mode never`): `/el-vagon-deportivo` sí rinde 60 palabras (nombre, dirección, horarios), pero **`/explorar` rinde solo 21 palabras** ("Reservá online / Filtrá por formato... / 2 complejos"): los nombres, formatos y precios de los complejos no salen. `agentic_check.py` `server-rendered` da warn en `/` con 99 palabras sin JS (la home es un buscador sin copy; el contenido está, es poco).
- Los agentes con navegador real (ChatGPT, Comet, Claude in Chrome, Gemini en Chrome) ejecutan JS y el árbol queda completo (heuristic 100). El riesgo es para fetchers que no ejecutan JS y usan extractor de texto (los del tipo "abrí esta URL").
- Causa: `src/app/(public)/explorar/loading.tsx` (55 líneas) y `src/app/(public)/[slug]/(perfil)/loading.tsx` (38 líneas). Ya documentado como T-02 en `docs/visibilidad-ia/01-auditoria.md`; confirmo que sigue vigente hoy en producción.
- Fix: mover el `Suspense` para que H1, dirección, horarios y servicios salgan en el HTML inicial y dejar el streaming solo para la disponibilidad. Cuidado con el gotcha conocido: `loading.tsx` convierte `notFound()` en soft-404 (la existencia del slug se resuelve en `[slug]/layout.tsx`).
- Cómo sabríamos que falló: `render_page.py https://turnogol.app/explorar --mode never` sigue dando ~21 palabras sin los nombres de los complejos; o `curl` muestra `<div hidden id="S:` antes del `<h1>`.

### F4. `Disallow` por prefijo puede tapar fichas públicas — P1 latente, severidad media

- Evidencia: `robots.txt` en vivo tiene `Disallow: /canchas`, `/staff`, `/reservas`, `/caja`, `/perfil`, `/settings`, `/dashboard`, `/verify`, `/login`, etc. sin barra final ni `$`. Por RFC 9309 gana la regla más larga: `/canchas-el-potrero` queda en `Disallow: /canchas` (8 caracteres contra `Allow: /` de 1). Simulación con una función de coincidencia más larga sobre el `robots.txt` descargado: `/canchas-el-potrero` bloqueada, `/staff-futbol` bloqueada, `/reservas-del-sur` bloqueada, `/el-vagon-deportivo` permitida, `/rival/p/abc` bloqueada.
- Impacto hoy: ninguno medido. Los dos complejos públicos (`el-vagon-deportivo`, `complejo-evardss`) no empiezan con ningún prefijo. Se rompe cuando un complejo elija un slug que empiece con uno de esos prefijos.
- Causa: `src/app/robots.ts:22-38` y `44-46`, `49-56`. `RESERVED_SLUGS` (`src/modules/tenants/tenant.utils.ts:39`) impide el slug exacto `caja`, no `caja-futbol` ni `canchas-el-potrero`.
- Fix: ya planificado como VIS-010: cada regla en dos, `/ruta/` y `/ruta$`, más un test que genere slugs de prueba contra `robots()` (`tests/unit/robots-route.test.ts` existe y se puede extender).
- Cómo sabríamos que falló: el test de slugs de prueba falla, o un bot reporta "bloqueada por robots.txt" para una ficha nueva.

### F5. No hay política de IA declarada — P2, información (decisión del dueño)

- Evidencia: `agentic_check.py` `robots-ai-groups` info, `content-signal` info: sin grupos nombrados y sin `Content-Signal`. Todo agente cae en `*`.
- No es un defecto. Es una decisión de negocio (entrenamiento sí/no). `docs/visibilidad-ia/07-riesgos-y-lineas-rojas.md` (línea 80) ya fija no bloquear GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot ni Google-Extended. `Content-Signal` es una propuesta de Cloudflare (CC0); su borrador del IETF venció el 2026-04-04 y Google no declara que lo respete (chequeado 2026-09-23). Sería una preferencia declarada sin efecto confirmado.
- REQUIERE INPUT: ver sección 8, pregunta 1.

### F6. Entrega en Markdown, `ai-catalog.json` y WebMCP ausentes — oportunidad, no defecto

- `Accept: text/markdown` en `/`, `/precios` y `/para-complejos` devuelve `text/html` y no hay `Vary: Accept` (el `Vary` es el de Next/RSC); `/index.md` da 404; sin `rel="alternate" type="text/markdown"`. `/.well-known/ai-catalog.json`, `api-catalog`, `oauth-*`, `agent-card.json`, `ucp`, `mcp.json`, `/ai.txt`, `/.well-known/llms.txt` y `/llms-full.txt`: todos 404 con `Content-Type: text/html`, y `/claude-seo-404-probe-83fa2777` da 404 real (sin catch-all 200).
- WebMCP: 0 llamadas `registerTool`, 2 formularios sin anotar, `navigator.modelContext` y `document.modelContext` ausentes. Es un borrador del W3C Community Group (chequeado 2026-09-23). Para este sitio el candidato sería la búsqueda de `/explorar` (segura de enviar); reservar o pagar no.
- Ninguno de estos afecta ranking, citas ni tráfico. Ningún agente de consumo tiene confirmado que pida Markdown (`vendor-matrix.md`).
- Si se invierte tiempo, el orden razonable es F3, F1+F2, F4 y recién después esto.

### F7. Producción y el árbol de trabajo difieren en `/rival` — P3, severidad baja

- Evidencia: producción sirve `/rival` (200, sin `noindex`, título "RIVAL: cada partido cuenta"), lo lista en `sitemap.xml` y su `robots.txt` no tiene `/rival$`. El árbol de trabajo (rama `feat/panel-mobile-denso`) tiene `src/app/robots.ts:42` con `'/rival$'` (bloquea justo esa landing), `src/app/(player)/rival/page.tsx:21` con `noIndex: true` y `src/app/sitemap.ts` sin `/rival`. Las citas de archivo:línea de este informe son del árbol de trabajo; no usé git, así que no sé cuál de los dos lados está atrasado.
- Riesgo: si el árbol de trabajo llegara a producción tal cual, la landing pública de RIVAL quedaría bloqueada para los bots. Confirmar la política (`/rival` indexable o no) y que robots, sitemap y `noindex` coincidan antes de mergear.
- Cómo sabríamos que falló: robots y sitemap se contradicen para la misma URL.

### F8. Datos de ejemplo visibles para agentes — P3, información

- `/complejo-evardss` (sitemap y `/explorar`, "Complejo Evardss", Mitre 2064, Lujan) tiene pinta de complejo de prueba. Si no es un cliente real, un agente lo presentaría como resultado. `/explorar` repite la ciudad en una tarjeta ("Lujan, Buenos Aires , Buenos Aires") y los títulos de las fichas llevan espacios sobrantes ("El vagón Deportivo  · TurnoGol", ya registrado como T-11).

## 6. Lo que no se probó y por qué

- **Matriz de user agents (`--ua-matrix`): no ejecutada.** La regla de la skill exige que el orquestador afirme que el dueño del sitio autorizó probar con tokens de bots de IA, y el pedido pedía la prueba pero no incluía esa afirmación. Un mensaje de otro agente no cuenta como autorización. Para correrla: confirmar la autorización y ejecutar `agentic_check.py https://turnogol.app --ua-matrix --json`. Se interpreta como comportamiento hacia tráfico no verificado, no como prueba de que el bot real pase.
- **PSI:** HTTP 429 (cuota anónima). Se reemplazó con Lighthouse local 13.6.0; los audits de WebMCP quedaron N/A por el navegador.
- **Firewall de Vercel:** no hay forma de leer la configuración desde esta sesión; lo cubre el dashboard (T-13).
- **Nota de proyecto sobre MercadoPago:** de 2026-08, sin re-verificar.

## 7. Estado de estándares (con fecha de chequeo)

| Ítem | Estado | Chequeado |
|---|---|---|
| WebMCP | Borrador del W3C Community Group, no estándar. WebKit se opone, Mozilla neutral. Prueba de origen de Chrome M149 a M156, sin hito de lanzamiento. | 2026-09-23 |
| Content-Signal | Política Cloudflare (CC0); borrador IETF vencido el 2026-04-04; sin declaración de Google. | 2026-09-23 |
| ai-catalog.json / ARD | Spec Agentic Resource Discovery 1.0, auditado por Lighthouse `ard-schema`. Propuesta. | 2026-09-23 |
| Web Bot Auth | `draft-ietf-webbotauth-httpsig-protocol-00` (2026-09-01). El sitio solo verificaría en el borde; no publica directorio de claves. | 2026-09-23 |
| llms.txt | Convención comunitaria (llmstxt.org). Lighthouse la audita; Google Search la ignora. | 2026-09-23 |
| MCP Server Card | SEP-2127 abierta y sin fusionar. No aplica al sitio. | 2026-09-23 |

Las filas tienen 40 días, dentro del umbral de 60. Si se cita después del 2026-11-22, correr `/seo agentic refresh`.

## 8. REQUIERE INPUT

1. Política de entrenamiento: ¿se deja sin declarar (hoy, todo permitido en rutas públicas) o se publica un `Content-Signal` con `ai-train=yes|no`? Es una preferencia sin efecto confirmado. No decido por el dueño.
2. `llms.txt`: ¿se mantienen los competidores nombrados o se sacan y se enlaza `/vs` y `/alternativas`? ¿Cómo se encuadra la afirmación sobre la plata de MercadoPago (F2) una vez verificada contra una cuenta actual?
3. `/rival`: ¿landing pública indexable (como hoy en producción) o privada (como el árbol de trabajo)?

## 9. Salidas guardadas

- Lighthouse local: `C:\Users\Lazar\AppData\Local\Temp\claude\C--Users-Lazar-Documents-github-TurnoGol\f80b2cac-64c4-434d-adc0-e369dc865dc8\scratchpad\lh-agentic\lh-mobile.json` y `lh-desktop.json`.
- Árboles y extracciones: `...\scratchpad\tree\*.json`; HTML y texto de las páginas: `...\scratchpad\net\`.

## 10. Entrada estructurada para `audit-data.json` (categoría "AI Search Readiness")

```json
{
  "name": "AI Search Readiness (agentic)",
  "score": 72,
  "what_works": [
    "Lighthouse Agentic Browsing 2/3 mobile y 2/3 desktop; el árbol de accesibilidad y CLS pasan (Lighthouse 13.6.0 local, 2026-11-02)",
    "Agent-UX heuristic 100/100 (complete) en /, /explorar, /el-vagon-deportivo y /para-complejos: cero controles sin nombre, formularios etiquetados, chips con aria-pressed",
    "robots.txt accesible; todos los bots de IA (entrenamiento, búsqueda y disparados por usuario) pueden leer las rutas públicas; las rutas privadas redirigen a login",
    "404 reales (sin catch-all 200); sitemap.xml presente; JSON-LD de Organization, WebSite y SportsActivityLocation"
  ],
  "findings": [
    {
      "title": "llms.txt falla la regla de Lighthouse y es la única causa del 2/3",
      "severity": "Medium",
      "description": "public/llms.txt:17-20 lista los enlaces como texto plano, sin sintaxis Markdown [texto](url) y sin resumen en blockquote. Lighthouse: 'File does not appear to contain any links.' Es higiene: Google Search ignora llms.txt y no hay evidencia de efecto en citas.",
      "recommendation": "Convertir los enlaces a Markdown, agregar blockquote y enlazar /blog, /vs/alquila-tu-cancha, /alternativas-alquila-tu-cancha, /rival, /privacidad y /terminos. Verificar con Lighthouse (3/3) y agentic_check.py llms-txt."
    },
    {
      "title": "llms.txt afirma cosas que el sitio no respalda",
      "severity": "High",
      "description": "public/llms.txt:14 dice 'Pagos sin intermediarios ... sin comisiones ocultas ni retenciones temporales'; /vs/alquila-tu-cancha reconoce 'el costo financiero normal de MP' y una nota de proyecto (2026-08, sin re-verificar) registra comisión y liberación diferida de MercadoPago. public/llms.txt:7 dice 'Eliminación de turnos colgados y ausentes' (el sitio dice que se libera el turno o se pierde la seña, y la seña es opcional). public/llms.txt:12 nombra 'ATC Sports'; el sitio dice 'Alquila Tu Cancha (ATC)'.",
      "recommendation": "Reescribir esas líneas con lo que el sitio sostiene (sin comisión por reserva de TurnoGol, la plata no pasa por TurnoGol, MercadoPago aplica sus costos y plazos), cambiar 'Eliminación' por 'Menos', corregir o quitar los nombres de competidores y enlazar /vs."
    },
    {
      "title": "Listado y fichas llegan en bloques de streaming ocultos para fetchers sin JavaScript",
      "severity": "Medium",
      "description": "En el HTML crudo de /explorar, /el-vagon-deportivo y /complejo-evardss el h1 y el contenido están dentro de <div hidden id=\"S:n\"> y lo visible es un skeleton. La extracción de texto del HTML crudo rinde 21 palabras en /explorar (sin nombres de complejos) y 60 en la ficha. Los agentes con navegador no se ven afectados. Causa: src/app/(public)/explorar/loading.tsx y src/app/(public)/[slug]/(perfil)/loading.tsx.",
      "recommendation": "Mover el Suspense para que h1, dirección, horarios y servicios salgan en el HTML inicial y dejar el streaming solo para la disponibilidad. Cuidar el soft-404 que provoca loading.tsx con notFound()."
    },
    {
      "title": "Disallow por prefijo en robots.txt puede bloquear fichas públicas futuras",
      "severity": "Medium",
      "description": "src/app/robots.ts:22-38 y 44-56 emiten /canchas, /staff, /reservas, /caja, /perfil, etc. sin barra final ni $. Con la regla más larga de RFC 9309, un slug como /canchas-el-potrero queda bloqueado. Sin impacto hoy (los dos complejos públicos no empiezan con esos prefijos).",
      "recommendation": "Emitir cada regla como /ruta/ y /ruta$ y cubrirlo con un test de slugs de prueba (VIS-010)."
    },
    {
      "title": "Sin política de IA declarada en robots.txt",
      "severity": "Info",
      "description": "Un solo grupo User-agent: *, sin grupos por bot y sin Content-Signal. Todos los bots de entrenamiento, búsqueda y disparados por usuario caen en el mismo grupo. Content-Signal es una propuesta de Cloudflare sin efecto confirmado (chequeado 2026-09-23).",
      "recommendation": "Decisión del dueño: mantener sin declarar o publicar un Content-Signal por grupo. No bloquear los bots de búsqueda."
    },
    {
      "title": "Markdown, ai-catalog.json y WebMCP ausentes",
      "severity": "Info",
      "description": "Accept: text/markdown devuelve HTML; /index.md, /.well-known/ai-catalog.json y /llms-full.txt dan 404; 0 herramientas WebMCP y 2 formularios sin anotar. WebMCP es un borrador del W3C Community Group (2026-09-23). Es una oportunidad, no un defecto, y no promete efecto en ranking ni citas.",
      "recommendation": "Opcional y después de los hallazgos anteriores: Markdown por negociación o .md para /precios y /para-complejos; WebMCP solo para la búsqueda de /explorar."
    },
    {
      "title": "Producción y árbol de trabajo difieren en la política de /rival",
      "severity": "Low",
      "description": "Producción: /rival indexable y en sitemap.xml, robots.txt sin /rival$. Árbol de trabajo: src/app/robots.ts:42 bloquea /rival$, src/app/(player)/rival/page.tsx:21 tiene noIndex y sitemap.ts no lo lista.",
      "recommendation": "Definir la política y que robots, sitemap y noindex coincidan antes de mergear."
    },
    {
      "title": "Nombres accesibles ambiguos en controles repetidos",
      "severity": "Low",
      "description": "/explorar tiene dos botones 'Guardar en favoritos' sin el nombre del complejo; FECHA y HORA no exponen el valor elegido en su nombre.",
      "recommendation": "Incluir el nombre del complejo en el aria-label de cada botón de favoritos y el valor actual en el nombre de FECHA y HORA."
    }
  ]
}
```
