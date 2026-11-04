# Auditoría SEO técnica — https://turnogol.app

Fecha: 2026-11-02. Alcance: las 13 URLs del sitemap + rutas auxiliares (robots, redirects, 404, assets). Solo lectura.

## Puntaje de Technical SEO: 64 / 100

| Categoría | Puntos | Estado |
|---|---|---|
| Crawlability (robots, sitemap, enlazado interno) | 9 / 15 | Parcial |
| Indexability (canonicals, títulos, contenido fino) | 8 / 15 | Falla |
| Seguridad (HTTPS, headers) | 9 / 10 | Pasa |
| Estructura de URL y redirects | 8 / 10 | Pasa con observaciones |
| Mobile (viewport, touch targets) | 8 / 10 | Pasa |
| Core Web Vitals (inferido del código y la red, sin lab ni CrUX) | 11 / 15 | Pasa con observaciones |
| Datos estructurados | 6 / 10 | Parcial |
| Render JS (CSR vs SSR) | 7 / 10 | Parcial |
| Ajuste por hallazgo F-01 (texto casi invisible en 4 URLs de contenido) | -5 | |
| IndexNow | No evaluado | Existe `/BingSiteAuth.xml` (200); no probé envío |

Suma de categorías 66 sobre 95 = 69; menos 5 por F-01 = 64.

## Cómo leer las citas de código

- El árbol local está en la rama `feat/panel-mobile-denso`, que va ATRÁS de `main` (producción). Comparé con `main` leyéndolo por la API de GitHub (repo `Laza223/turno-gol-repo`, sin usar git local). Los archivos citados son idénticos entre local y `main`, salvo los marcados `main:`.
- Diferencias que importan: `src/app/robots.ts` local tiene `'/rival$'` en la línea 42 (bloquearía `/rival` exacto); producción NO lo tiene. `src/app/sitemap.ts` local no emite `/rival`; producción sí. `src/app/(player)/rival/page.tsx` local es el tablón con `noIndex`; producción es la landing indexable.

## Verificación pedida: robots y `/rival`

Robots en vivo (`curl https://turnogol.app/robots.txt`, 200): un solo grupo `User-agent: *`, `Disallow: /rival/` con barra final, sin `/rival$`. Evalué las reglas con un matcher estilo Google (longest-match, Allow gana empates; script en el scratchpad):

- `/rival` pelado: ALLOW (la regla más larga que matchea es `/`). No está bloqueada.
- `/rival/tablon`, `/rival/p/ABC`: BLOCK (`/rival/`).
- `/rival/opengraph-image-1711i9?...` y `/rival/twitter-image-1711i9?...`: BLOCK (`/rival/`). Ver F-05.
- `/r/ABC123`: BLOCK (`/r/`), `/rival-futbol` y `/reservado`: ALLOW.

Las 13 URLs del sitemap dan ALLOW. Ninguna está bloqueada hoy.

---

## Hallazgos priorizados

### F-01 — CRÍTICO — Blog, post, `/vs/...` y `/alternativas-...`: texto casi invisible (gris oscuro sobre fondo casi negro)

- Evidencia: capturas con `capture_screenshot.py` de `/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026` (mobile), `/vs/alquila-tu-cancha` (desktop) y `/blog` (mobile). El H1 de las tres es apenas distinguible del fondo; los párrafos y los links del cuerpo están en gris azulado oscuro sobre `#020617`. En `/blog`, el H1 "Blog" es invisible (las tarjetas blancas sí se leen). En las páginas de artículo el header flotante además tapa la primera línea del H1.
- Causa: `src/app/(business)/layout.tsx:14` envuelve todo en `dark` con `background: '#020617'` y `text-slate-300`. Pero `src/components/site/ArticleShell.tsx:40,43,49,51` usa `text-gray-900`, `text-gray-500` y `prose prose-lg prose-blue` (sin `prose-invert`), pensados para fondo claro. `src/app/(business)/blog/page.tsx:14` también usa `text-gray-900`. El comentario de `ArticleShell.tsx:44-46` habla de un `bg-gray-50` que ya no existe: el layout se oscureció y los artículos quedaron atrás.
- Impacto: son las páginas de captación B2B y de comparativas (las que se quieren posicionar y citar). Un humano no las lee, rebota; Google puede evaluar texto de contraste ~1:1 como texto oculto o de baja calidad. Los crawlers de IA sí leen el texto del HTML, así que el daño directo es humano y de calidad percibida.
- Fix: en `ArticleShell.tsx` pasar a tokens claros sobre el fondo oscuro (`text-white` en H1, `text-slate-300` en descripción y fecha, `prose-invert` en `ArticleShell.tsx:49`, headings `text-white`), y `blog/page.tsx:14` a `text-white`. Agregar `pt-28` (o la altura real del header) al `<article>` de `ArticleShell.tsx:34` y al contenedor de `blog/page.tsx:13`. Revisar `src/components/site/Mdx.tsx` por links y tablas.
- Cómo sabríamos que falló: captura de las 4 URLs a 390 px y 1440 px con contraste H1/cuerpo/links medido por axe (ratio < 4.5:1 = falla). Agregar al e2e una aserción de contraste sobre `h1` y `.prose p` en `/blog/*` y `/vs/*`.

### F-02 — ALTO — `Disallow` por prefijo sin ancla puede bloquear fichas de complejos futuros

- Evidencia: matcher sobre el robots en vivo. Con el slug generado a partir del nombre, estos caen en BLOCK: `/canchas-del-sur` (`/canchas`), `/caja-norte` (`/caja`), `/reservas-futbol` (`/reservas`), `/staff-futbol` (`/staff`), `/jugadores-fc` (`/jugadores`), `/torneos-del-sur` (`/torneos`), `/perfil-gol`, `/settings-fc`, `/grilla-gol`, `/dashboard-fc`, `/verify-fc`, `/login-fc`, `/ingresar-fc`, `/register-fc`, `/metricas-fc`, `/reportes-fc`, `/deudas-fc`, `/abonados-fc`, `/analiticas-fc`, `/configuracion-fc`, `/mis-reservas-x`, `/onboarding-x`, `/monitoring-fc`, `/mock-mp-x`, `/select-tenant-x`, `/sin-acceso-x`. Hoy no afecta a `/el-vagon-deportivo` ni `/complejo-evardss`.
- Causa: `src/app/robots.ts:24-62` (por ejemplo `'/canchas'` línea 32, `'/caja'` línea 25, `'/staff'` línea 33, `'/reservas'` línea 24, `'/torneos'` línea 28, `'/login'` línea 50, `'/verify'` línea 54). `generateUniqueSlug` (`src/modules/tenants/tenant.service.ts:20-36`) solo evita el match EXACTO con `RESERVED_SLUGS` (`src/modules/tenants/tenant.utils.ts:39`), no el prefijo. "Canchas X" es un patrón de nombre muy común en complejos de fútbol. El propio repo ya detectó la clase con `/rival` (comentario `robots.ts:40-41`) y la resolvió solo para esa ruta.
- Impacto: la ficha queda sin rastrear aunque esté en el sitemap (`sitemap.ts` emite todos los tenants) y entra en "Indexada, aunque bloqueada por robots.txt" o directamente no se indexa. Falla silenciosa para un cliente pago.
- Fix: en `robots.ts` emitir para cada segmento del panel la pareja `'/<seg>$'` y `'/<seg>/'` (misma forma que `/rival$` + `/rival/`), o generar el array con un `flatMap`. Alternativa más simple: sufijar a `-futbol` en `generateUniqueSlug` cualquier slug que EMPIECE con un segmento reservado.
- Cómo sabríamos que falló: ampliar `tests/unit/robots-route.test.ts` con un matcher Google-style que recorra `RESERVED_SLUGS` y exija ALLOW para `/${seg}-futbol` y BLOCK para `/${seg}` y `/${seg}/x`. Rojo = el fix no cubre algún segmento. En producción: Search Console > Inspección de URL de la primera ficha nueva con prefijo reservado.

### F-03 — ALTO — Tres URLs del sitemap no reciben ningún enlace interno rastreable

- Evidencia: extraje todos los `href` de las 13 páginas (HTML crudo). Inlinks desde las otras 12: `/vs/alquila-tu-cancha` = 0, `/alternativas-alquila-tu-cancha` = 0, `/rival` = 0. El post del blog tiene 1 (solo desde `/blog`); `/blog` solo desde las páginas del sitio B2B (header/CTAs), nunca desde `/`. `/` enlaza únicamente a `/explorar` y `/para-complejos`; las fichas solo las enlaza `/explorar`.
- Causa: `src/components/site/BusinessFooter.tsx:41-55` lista Precios, Ingresar, Empezar gratis, Privacidad, Términos (sin Blog, comparativas ni RIVAL). El post (MDX en `content/`) no enlaza a `/vs` ni `/alternativas`. El link a RIVAL vive en `src/components/site/PlayerBottomNav.tsx:9,63`, que lo agrega recién al hidratar (`rivalEnabled` sale de `usePortalSession`): el HTML inicial de `/` no trae "Rival".
- Impacto: dependen solo del sitemap; sin PageRank interno y sin contexto de anclas. Son justo las páginas comerciales de comparación.
- Fix: (1) `BusinessFooter.tsx` y `SiteFooter.tsx`: sumar Blog, "Alternativas a Alquila Tu Cancha", "TurnoGol vs Alquila Tu Cancha" y RIVAL (este último con el flag). (2) Enlazarse entre sí en el MDX de `/vs`, `/alternativas` y el post. (3) Desde `/` sumar un bloque SSR con los complejos y links a `/precios` y `/blog`.
- Cómo sabríamos que falló: re-correr el mismo conteo de inlinks (o Screaming Frog) y exigir >= 2 inlinks por URL del sitemap; en Search Console, que ninguna figure como "Descubierta: actualmente sin indexar" por falta de enlaces.

### F-04 — MEDIO — Sin `<link rel="canonical">` (ni `og:url`) en 6 de las 13 URLs

- Evidencia: `/blog`, `/blog/mejores-sistemas-...`, `/vs/alquila-tu-cancha`, `/alternativas-alquila-tu-cancha`, `/privacidad`, `/terminos`: sin canonical y sin `og:url`. Con y sin canonical: `/`, `/explorar`, `/para-complejos`, `/precios`, `/rival` y las 2 fichas lo traen. Confirmado que las variantes con parámetros se sirven 200 (`/precios?utm_source=x` -> 200), por eso el canonical importa. Además `og:type` es `website` también en los artículos.
- Causa: esas páginas exportan `metadata` o `generateMetadata` a mano sin `alternates`: `src/app/(business)/blog/page.tsx:4-7`, `blog/[slug]/page.tsx:21-24`, `vs/alquila-tu-cancha/page.tsx:11-14`, `alternativas-alquila-tu-cancha/page.tsx:11-14`, `src/app/(public)/privacidad/page.tsx:4-7`, `terminos/page.tsx:5-8`. Las otras usan `buildMetadata` (`src/lib/seo/metadata.ts:57-87`, canonical en la línea 68).
- Fix: usar `buildMetadata({ title, description, path })` en las seis (con `titleAbsolute: true` donde corresponda, ver F-06) o agregar `alternates: { canonical: absoluteUrl(path) }`. Para los artículos, `openGraph.type: 'article'`.
- Cómo sabríamos que falló: `curl -s <url> | grep -c 'rel="canonical"'` debe dar 1 en las 13 URLs del sitemap, y el valor debe ser igual a la URL del sitemap. Un test unitario que recorra el sitemap lo deja fijo.

### F-05 — MEDIO — Las imágenes OG/Twitter de `/rival` están bajo `Disallow: /rival/`

- Evidencia: `<meta property="og:image" content="https://turnogol.app/rival/opengraph-image-1711i9?37302806478fa7ee">` y `twitter:image` en `/rival/twitter-image-1711i9?...`. Ambas dan 200 `image/png` (54 KB) pero el matcher las marca BLOCK por `/rival/`. Los crawlers que respetan robots (Googlebot-Image, Twitterbot; Facebook documenta respetarlo) pueden no traer la vista previa. No verifiqué en vivo cada validador de redes.
- Causa: `src/app/robots.ts:43` (`'/rival/'`) más `main:src/app/(player)/rival/page.tsx:11-13`, que delega la imagen a `opengraph-image.tsx` y `twitter-image.tsx` de la carpeta `rival/` (URL con hash).
- Fix: sumar en `robots.ts` (línea 11) al `allow`: `'/rival/opengraph-image'` y `'/rival/twitter-image'`. Gana por longitud sobre `/rival/`. No tocar `/rival/p/` ni `/rival/tablon`, que siguen bloqueados a propósito.
- Cómo sabríamas que falló: Facebook Sharing Debugger y Twitter/X Card Validator sobre `https://turnogol.app/rival` deben mostrar la imagen; el matcher debe dar ALLOW para las dos URLs y BLOCK para `/rival/tablon`.

### F-06 — MEDIO — Marca duplicada y títulos largos en 5 páginas ("... | TurnoGol · TurnoGol")

- Evidencia (largo del `<title>` en vivo): post del blog 96 caracteres, `/vs` 81, `/alternativas` 75, `/blog` 51 con marca doble, `/precios` 54 ("Precios — TurnoGol para complejos de fútbol · TurnoGol"). Ficha de El Vagón: "El vagón Deportivo  · TurnoGol" (doble espacio por nombre con espacio final).
- Causa: plantilla `%s · TurnoGol` en `src/app/layout.tsx:33` más sufijo literal `| TurnoGol` en `blog/page.tsx:5`, `blog/[slug]/page.tsx:22`, `vs/alquila-tu-cancha/page.tsx:12`, `alternativas-alquila-tu-cancha/page.tsx:12`; `precios/page.tsx:12` mete "TurnoGol" dentro del título y la plantilla lo repite.
- Fix: sacar el `| TurnoGol` literal de las cuatro; `precios` a `title: 'Precios para complejos de fútbol'`; acortar el post a <= 60 caracteres sin marca. `.trim()` del nombre en `buildMetadata` (`metadata.ts:66`).
- Cómo sabríamos que falló: `grep -c "TurnoGol.*TurnoGol"` sobre los `<title>` = 0 y ningún título > 60 caracteres (salvo decisión explícita).

### F-07 — MEDIO — Ficha del complejo: HTML inicial muy fino y widget de reserva solo en cliente

- Evidencia: `/el-vagon-deportivo` ~70 palabras visibles; `/complejo-evardss` ~68. El HTML trae nombre, dirección, "5 canchas · Fútbol 5 y 7", horarios y el widget como esqueleto `aria-busy="true" data-state="loading"`, dentro de un Suspense en bailout (`<!--$!--><template data-dgst="">`). No hay sección "Canchas" ni descripción real: la `description` de Evardss es la plantilla "Reservá una cancha en Complejo Evardss, Lujan." (46 caracteres).
- Causa: es diseño documentado: `src/app/(public)/[slug]/(perfil)/page.tsx:25-31` y `:92-96` (disponibilidad 100% cliente por `useSearchParams`). Pero `ProfileRest.tsx:45-56` solo pinta "Canchas" si la cancha tiene foto, y `(perfil)/page.tsx:140` cae a la plantilla cuando `tenant.description` es null.
- Impacto: Googlebot renderiza JS y verá la disponibilidad; los crawlers de IA (sin JS) ven una ficha con casi nada.
- Fix: renderizar la lista de canchas (nombre, formato, superficie) aunque no haya foto, y un párrafo por defecto con ciudad, formatos y cantidad de canchas; si el complejo no oculta precios, "desde $X". Pedir `description` al dueño en el onboarding.
- Cómo sabríamos que falló: `curl -s <ficha> | python txt.py | wc -w` debe superar ~200 palabras y listar cada cancha sin ejecutar JS.

### F-08 — MEDIO — `lastmod` del sitemap no refleja cambios de contenido

- Evidencia: las 8 URLs estáticas (`/`, `/explorar`, `/para-complejos`, `/precios`, `/blog`, `/privacidad`, `/terminos`, `/rival`) comparten `2026-11-02T14:44:58.160Z`, con `Age: 3467` y `X-Vercel-Cache: HIT`. Es coherente con regeneración ISR, no con un deploy: no verifiqué que cambie cada hora (una sola muestra). El post, `/vs` y `/alternativas` fijan `2026-07-12T00:00:00.000Z`; los tenants usan `updatedAt` real.
- Causa: `src/app/sitemap.ts:24` (`const now = new Date()`), usado en `:27-40`, más `export const revalidate = 3600` (`:7`).
- Fix: fechas fijas por página (constante que se actualiza al editar, o `mtime` del MDX/commit) o directamente omitir `lastModified` en lo estático. `changefreq` y `priority` los ignora Google.
- Cómo sabríamos que falló: dos descargas del sitemap separadas por > 1 h no deben cambiar el `lastmod` de páginas sin edición.

### F-09 — MEDIO — `Organization.logo` apunta a una URL que da 404

- Evidencia: JSON-LD de `/`: `"logo": "https://turnogol.app/icon"`; `curl -I https://turnogol.app/icon` -> 404. `/icon.png` -> 200 (1.7 KB).
- Causa: `src/lib/seo/structured-data.ts:104` (`absoluteUrl('/icon')`).
- Fix: apuntar a un PNG real y grande (>= 112x112, ideal 512x512), por ejemplo `/icon.png` o un asset estático dedicado.
- Cómo sabríamas que falló: `curl -sI <logo>` = 200 `image/png` y el logo se valida en la prueba de resultados enriquecidos.

### F-10 — MEDIO — Article JSON-LD pobre; el `addFaqSchema` no hace nada

- Evidencia: Article de `/vs` y `/alternativas`: solo `headline`, `description`, `author` (sin `datePublished`, `dateModified`, `image`, `publisher`, `mainEntityOfPage`). El post tiene `datePublished: 2026-07-12` y nada más. `/blog` y la home no tienen JSON-LD de lista/Blog. `/precios` sí trae FAQPage.
- Causa: `src/components/site/ArticleShell.tsx:19-29` arma el objeto; `:17` renombra `addFaqSchema` a `_addFaqSchema` (descartado) y `:31` deja el FAQ como comentario, aunque `vs/...:28` y `alternativas...:28` lo pasan en `true`.
- Fix: agregar `dateModified`, `image` (`/opengraph-image`), `publisher` (Organization con logo del F-09), `mainEntityOfPage` con la URL canónica; pasar `date` en `/vs` y `/alternativas`; o borrar la prop muerta. Para `/blog`, `CollectionPage` o `Blog` con `blogPost`.
- Cómo sabríamos que falló: Rich Results Test sin advertencias de campos recomendados y `grep -c addFaqSchema` consistente con lo que emite.

### F-11 — BAJO — Datos de ficha sucios que llegan a título, JSON-LD y tarjetas

- Evidencia: nombre `"El vagón Deportivo "` con espacio final (título con doble espacio, JSON-LD `name`, breadcrumb); `addressLocality: "Lujan, Buenos Aires"` con región adentro y sin tilde (Luján); `streetAddress: "almafuerte 2156"` en minúscula; `/explorar` muestra "Lujan, Buenos Aires , Buenos Aires".
- Causa: `src/lib/seo/structured-data.ts:42-51` pasa los campos crudos; los datos vienen de la carga del tenant.
- Fix: `.trim()` en `buildLocalBusiness` y `buildMetadata`; validar `city` sin región en el alta; corregir los dos registros (acción del dueño, no la hice).
- Cómo sabríamos que falló: JSON-LD con `addressLocality` = "Luján" y ningún string con espacios al borde.

### F-12 — BAJO — Home: contenido mínimo y duplicado de hero en el DOM

- Evidencia: ~90 palabras visibles; un H1 y un formulario; el hero se emite dos veces en el HTML ("Tu partido empieza en TurnoGol" aparece 2 veces: variante mobile y desktop, una oculta por CSS). No lista complejos ni enlaza a fichas, `/precios` o `/blog`.
- Causa: `src/app/home/HeroMobile.tsx` y `HeroDesktop.tsx` (ambos renderizados) y `src/app/page.tsx:8-9`.
- Fix: un solo hero responsive o `hidden` con CSS sin duplicar texto; sumar bloque SSR de complejos y ciudades (`listPublicCities` ya se carga en `page.tsx:20-26`).
- Cómo sabríamas que falló: el texto del H1 aparece una vez en el HTML y la home tiene >= 3 links a fichas.

### F-13 — BAJO — Cadena de redirects y mayúsculas

- Evidencia: `http://www.turnogol.app/` -> 308 -> `https://www.turnogol.app/` -> 308 -> `https://turnogol.app/` (2 saltos). `https://www.turnogol.app/precios` -> 308 directo al apex (OK). `/precios/` -> 308 `/precios` (OK). `http://turnogol.app/` -> 308 https (OK). `/PRECIOS` y `/EL-VAGON-DEPORTIVO` -> 404 (el catch-all `[slug]` busca por slug exacto) en vez de redirigir a minúsculas. `/privacy` y `/terms` -> 308 a las páginas en español (OK, `next.config.ts` redirects).
- Fix: el doble salto de `http://www` es típico de Vercel con apex como primario; aceptable. Para mayúsculas, `redirects()` en `next.config.ts` con `has`/regex que baje a minúsculas, o `middleware.ts`.
- Cómo sabríamos que falló: `curl -sI https://turnogol.app/PRECIOS` debe dar 308 a `/precios`.

### F-14 — BAJO — Rutas de acceso públicas sin metadata ni `noindex`, protegidas solo por robots

- Evidencia: `/ingresar`, `/login`, `/register`, `/mis-reservas` devuelven 200, `<title>TurnoGol</title>`, sin `description`, sin `noindex`, y están bajo `Disallow` (el crawler no puede leer un `noindex`). Cada página enlaza a `/ingresar?next=...`. En `/` el link sale como `/ingresar?next=%2Findex` (ruta `/index` inexistente); no probé qué hace `sanitizeNext` con ese valor.
- Causa: `src/components/site/IngresarLink.tsx:15,38` toma `usePathname()` durante el prerender (devuelve `/index` para la home).
- Fix: normalizar `/index` a `/` en `hrefFor`; agregar `robots: { index: false }` en los layouts `(auth)`; el `Disallow` puede quedar.
- Cómo sabríamas que falló: `curl -s /` no contiene `next=%2Findex`; `curl -s /login | grep noindex` da 1 resultado.

### F-15 — BAJO — Descripciones fuera de rango

- Evidencia: `/para-complejos` 170 y `/rival` 176 caracteres (se truncan a ~155-160); fichas 46 y 63 (cortas, plantilla); `/terminos` 42.
- Fix: 120-155 caracteres; en fichas usar la descripción real (F-07).

### F-16 — INFO — Robots sin reglas para crawlers de IA; `Allow` redundantes

- Evidencia: un solo grupo `User-agent: *`; no hay reglas para GPTBot, ClaudeBot, PerplexityBot, Google-Extended. Todos entran salvo los `Disallow`. `llms.txt` existe (200, 1456 bytes); no existe `llms-full.txt` (404). `Allow: /explorar`, `/privacidad`, `/terminos` (`robots.ts:11`) son redundantes con `Allow: /`.
- Nota: coherente con el plan de visibilidad en IA; no hace falta cambio.

### F-17 — INFO — Lo que pasa

- Sitemap: `sitemap_discovery.py` valida `https://turnogol.app/sitemap.xml` (urlset, 200, 13 URLs, todas 200 y con URL igual a la canónica cuando existe). Las rutas comunes alternativas dan 404; esperable.
- 404: `/foo-bar-xyz` -> 404 con `<meta name="robots" content="noindex">`; `/blog/no-existe`, `/vs/otro` -> 404.
- Fichas: `generateMetadata` marca `noindex` si el estado del tenant no es indexable (`(perfil)/page.tsx:129-135`); `/{slug}/reservar` es `noindex,nofollow` y NO está bloqueada en robots (correcto: así el crawler puede leer el noindex). `/{slug}/torneos` -> 404 (flag apagado, sin entrada en el sitemap).
- Seguridad: HSTS `max-age=63072000; includeSubDomains; preload`, CSP, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy presentes (`next.config.ts:9-79`). Observación: `script-src 'self' 'unsafe-inline'` (`next.config.ts:9-12`) debilita el CSP; hay una decisión previa documentada de no usar nonce por la hidratación. No hay COOP/CORP.
- `lang="es"` (`src/app/layout.tsx:66`); `og:locale=es_AR`. Un solo idioma: no hace falta hreflang. `lang="es-AR"` es opcional.
- Mobile: viewport `width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover` (zoom permitido); controles con `min-h-11`; la ficha mobile (captura) se ve bien.
- Core Web Vitals (inferido; NO corrí Lighthouse ni tengo CrUX): TTFB 135-240 ms en 3-5 muestras por URL (un MISS frío de `/rival` midió 1,4 s una vez). JS transferido 267-320 KB en 18-25 archivos por página, CSS 43-54 KB, HTML 48-149 KB (`/rival` 149 KB, con 85 KB de script inline). Fuentes woff2 con preload (3; 5 en `/rival`). La ficha reserva alto para el esqueleto del widget (`min-h-[calc(100dvh-5rem)]`), riesgo de CLS bajo. Sin hallazgos de scripts bloqueantes (solo el `noModule`).
- `/explorar`: tarjetas de complejos en el HTML inicial (SSR), canonical fijo a `/explorar` para todas las variantes de query (`explorar/page.tsx:44-49`). Vale mientras haya pocas páginas; con muchos complejos, la paginación `?offset=` consolida todo en la página 1.

---

## Lo que NO verifiqué

- Lighthouse, CrUX y PageSpeed (sin datos de campo). Los CWV son inferencia.
- Search Console (indexación real, cobertura, "bloqueada por robots").
- El comportamiento de `sanitizeNext` ante `/index`, ni las reglas de robots para otros user-agents.
- Si el `lastmod` del sitemap cambia cada hora (una sola muestra).
- El diff de `terminos/page.tsx` entre local y `main` (16 líneas, no lo revisé).

## Evidencia reproducible

Scripts y descargas en el scratchpad de la sesión: `C:\Users\Lazar\AppData\Local\Temp\claude\C--Users-Lazar-Documents-github-TurnoGol\f80b2cac-64c4-434d-adc0-e369dc865dc8\scratchpad` (`rb.py` matcher de robots, `parse.py` y `txt.py` extractores, `pages\` HTML y headers de las 13 URLs, `shots\` capturas).
