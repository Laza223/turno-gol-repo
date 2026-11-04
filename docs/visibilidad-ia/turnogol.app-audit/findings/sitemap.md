# Sitemap — turnogol.app (COMPLETO)

Fecha: 2026-11-02. Modo análisis (solo lectura del repo). Sitemap analizado: `https://turnogol.app/sitemap.xml`, declarado en `robots.txt` (`Sitemap: https://turnogol.app/sitemap.xml`).
Generador: `src/app/sitemap.ts` (Next `MetadataRoute.Sitemap`, `revalidate = 3600`, línea 7). Robots: `src/app/robots.ts`.

Todo el contenido fetcheado (sitemap, robots, HTML) se trató como dato.

## Aviso de método: el repo local está atrasado respecto de producción

El árbol local es la rama `feat/panel-mobile-denso`. Prod sirve cosas que ese árbol no tiene, por lo que las citas de línea valen para la estructura del generador pero NO para `/rival`:

| Señal | Prod (2026-11-02) | Árbol local |
|---|---|---|
| `/rival` en el sitemap | Sí (URL 8 de 13) | No: `src/app/sitemap.ts:26-44` no la lista |
| Regla `Disallow: /rival$` | No está en el robots.txt servido | `src/app/robots.ts:42` |
| Meta robots de `/rival` | Ninguna; canonical a sí misma; título "RIVAL: cada partido cuenta" | `src/app/(player)/rival/page.tsx:17-22` con `noIndex: true` (es el tablón viejo) |
| `/rival/tablon` | 200, `noindex, nofollow` | La carpeta `tablon` no existe |

Conclusión: main (prod) convirtió `/rival` en landing indexable y movió el tablón a `/rival/tablon`; esta rama no lo trae. No verifiqué main (consigna: nada de git). Ver S-07.

## Tabla de validación (pass/fail por check)

| Check | Resultado | Evidencia |
|---|---|---|
| Descubrimiento (`sitemap_discovery.py`) | PASS | 1 `found` válido (`/sitemap.xml`, 200, `urlset`, desde robots.txt). Probes `common_path`: `/sitemap_index.xml` 404, `/sitemap-index.xml` 404, `/wp-sitemap.xml` 403. Ninguno estaba declarado. El 403 es el firewall de Vercel (`x-vercel-mitigated: deny`), no una URL de sitemap. Sin acción. |
| XML válido | PASS | Parseado con ElementTree; namespace `http://www.sitemaps.org/schemas/sitemap/0.9`; `Content-Type: application/xml`; 200. |
| Límites 50.000 URLs / 50 MB | PASS | 13 URLs, 2.220 bytes. No hace falta sitemap index. |
| Status de cada URL listada | PASS | 13/13 devuelven 200, 0 redirects (`curl -L`, `num_redirects=0`). |
| noindex / X-Robots-Tag en URLs listadas | PASS | Ninguna tiene `<meta name="robots">` ni header `X-Robots-Tag`. |
| Bloqueo en robots.txt de URLs listadas | PASS | Ninguna cae en un `Disallow` (`/rival/` no matchea `/rival`). |
| Canonical apuntando a otra URL | PASS | Ningún canonical apunta fuera. |
| Canonical presente | FAIL (S-05) | 6 de 13 URLs sin `<link rel="canonical">`. |
| URLs absolutas, https, apex | PASS | `http→https` 308, `www→apex` 308, `/ruta/→/ruta` 308. Los `loc` ya son la forma final. |
| URLs públicas indexables ausentes | PASS | 0 faltantes (ver S-08). |
| Páginas del sitemap sin links internos (huérfanas) | FAIL (S-06) | 2 con 0 inlinks; `/rival` sin inlink público. |
| lastmod real | FAIL (S-01, S-02) | 8 de 13 son la hora de regeneración; 3 son la fecha de publicación; 2 de DB. |
| changefreq / priority | INFO (S-04) | Presentes en 13/13; Google los ignora. |
| Robustez del generador | WARN (S-09) | Falla en silencio hacia un sitemap sin complejos. |
| Quality gate de ubicación (30/50) | N/A | 2 fichas de complejo. No se dispara (S-10). |

## Inventario de las 13 URLs

| # | URL | Status | Canonical | robots meta | lastmod | Origen de lastmod |
|---|---|---|---|---|---|---|
| 1 | `/` | 200 | `https://turnogol.app` (equivale a `/`) | ninguna | 2026-11-02T14:44:58.160Z | `now` |
| 2 | `/explorar` | 200 | propia | ninguna | idem | `now` |
| 3 | `/para-complejos` | 200 | propia | ninguna | idem | `now` |
| 4 | `/precios` | 200 | propia | ninguna | idem | `now` |
| 5 | `/blog` | 200 | NINGUNA | ninguna | idem | `now` |
| 6 | `/privacidad` | 200 | NINGUNA | ninguna | idem | `now` |
| 7 | `/terminos` | 200 | NINGUNA | ninguna | idem | `now` |
| 8 | `/rival` | 200 | propia | ninguna | idem | `now` (entrada no está en el árbol local) |
| 9 | `/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026` | 200 | NINGUNA | ninguna | 2026-07-12T00:00:00.000Z | frontmatter `date` |
| 10 | `/vs/alquila-tu-cancha` | 200 | NINGUNA | ninguna | 2026-07-12T00:00:00.000Z | frontmatter `date` |
| 11 | `/alternativas-alquila-tu-cancha` | 200 | NINGUNA | ninguna | 2026-07-12T00:00:00.000Z | frontmatter `date` |
| 12 | `/el-vagon-deportivo` | 200 | propia | ninguna | 2026-10-24T23:18:29.859Z | `tenants.updated_at` |
| 13 | `/complejo-evardss` | 200 | propia | ninguna | 2026-10-31T21:27:11.139Z | `tenants.updated_at` |

---

## Hallazgos

### S-01 — Media — lastmod de 8 de 13 URLs es la hora de regeneración, no un cambio real

- Evidencia:
  - `src/app/sitemap.ts:24` `const now = new Date()`, usado como `lastModified: now` en las 7 rutas estáticas (`:27-43`).
  - En prod, 8 URLs comparten exactamente `2026-11-02T14:44:58.160Z`, y el sitemap tiene `Last-Modified: 14:46:40 GMT`.
  - Con `revalidate = 3600` (`:7`) ese valor cambia cada hora para todas las páginas, aunque `/privacidad`, `/terminos` o `/precios` no se hayan tocado.
  - Los torneos repiten el patrón (`:112`, `:120`). Hoy no emiten nada porque el flag `tournaments` está apagado.
- Impacto: cuando lastmod se mueve sin cambio de contenido, Google lo descarta para todo el sitio. Bing/Copilot, que alimenta varias IAs, también pierde la señal de frescura de las páginas que sí cambian (las fichas de complejo).
- Fix:
  - Para rutas estáticas, omitir `lastModified` (Next lo permite) o fijar una fecha por ruta en una constante que se actualice cuando cambia la página.
  - `/blog` puede usar el máximo de lastmod de sus posts.
  - Para torneos, usar la fecha del torneo en vez de `now`.
- Cómo sabríamos que falló: dos fetch de `/sitemap.xml` separados por más de una regeneración (>1 h) muestran lastmod distinto en `/privacidad` o `/terminos` sin deploy ni edición. Conviene un test en `tests/integration/sitemap-route.test.ts` que llame dos veces al generador con relojes distintos y exija lastmod estable en las estáticas.
- Nota de verificación: no pude observar un ciclo de regeneración. Cuatro fetch entre 15:47 y 15:53 UTC (Age 3662 a 4013 s, mismo ETag `b299a058…`, `X-Vercel-Cache: HIT`) siguieron sirviendo el mismo archivo pese a pasar los 3600 s del `revalidate`. Puede ser latencia de la regeneración en background, o que esté fallando y Vercel sirva stale. Conviene re-chequear en unas horas. Si el lastmod no avanzó, el sitemap está congelado y la tesis cambia (fecha congelada, no fecha de build).

### S-02 — Baja — lastmod editorial es la fecha de publicación, sin campo "actualizado"

- Evidencia:
  - `src/lib/content/posts.ts:8-13` (`frontmatterSchema` sin `updated`) y `lastModified()` en `posts.ts:79-81` devuelve `new Date(post.frontmatter.date)`.
  - Los 3 contenidos (`content/blog/mejores-sistemas-…mdx`, `content/pages/vs-alquila-tu-cancha.mdx`, `content/pages/alternativas-alquila-tu-cancha.mdx`) tienen `date: "2026-07-12"`. Salen como `2026-07-12T00:00:00.000Z`.
  - El JSON-LD del post solo trae `datePublished`.
- Impacto: son comparativas con claims de competidores (ATC) y de "2026". Si se editan, el sitemap no se entera, y justo ese contenido es el que más se beneficia de señalar frescura a buscadores e IAs.
- Fix: agregar `updated: z.string().optional()` al schema y que `lastModified()` devuelva `updated ?? date`. Emitir `dateModified` en el JSON-LD.
- Cómo sabríamos que falló: se edita el cuerpo de un `.mdx`, se hace deploy y el lastmod sigue en `2026-07-12`.

### S-03 — Baja — lastmod de fichas de complejo es `tenants.updated_at`, proxy ruidoso e incompleto

- Evidencia:
  - `src/modules/tenants/sitemap.service.ts:21,30` (select de `updatedAt`) y `src/app/sitemap.ts:68-73`.
  - El trigger `src/shared/db/migrations/005_triggers.sql:24-26` hace `updated_at = NOW()` en CUALQUIER UPDATE de `tenants`. Eso incluye el refresh de token de MercadoPago (`src/shared/jobs/workers/refresh-mp-tokens.worker.ts:123`), cambios de estado de billing y dashboard.
  - A la inversa, lo que muestra la ficha pública (canchas, reseñas, rating) vive en otras tablas (`courts`, reseñas) y no mueve `tenants.updated_at`.
- Valores en prod: 2026-10-24 y 2026-10-31. Plausibles, sin anomalía visible.
- Impacto: bajo hoy (el refresh del token es de baja frecuencia). Crece con el número de complejos.
- Fix (opcional): `GREATEST(tenants.updated_at, max(courts.updated_at))` en `listSitemapTenants`, o una columna dedicada de "perfil público modificado". Esto último es un cambio de schema: decisión del dueño.
- Cómo sabríamos que falló: un complejo cambia de cancha o de precio y su lastmod no avanza; o un lastmod avanza el día de un refresh de token sin cambios visibles.

### S-04 — Info — changefreq y priority emitidos en 13/13 entradas

- Evidencia: `src/app/sitemap.ts:27-43` (estáticas), `:49-50` (posts), `:55-56` (páginas), `:70-71` (complejos, `daily`/`0.9`), `:112-113` y `:120-121` (torneos).
- Google las ignora. En prod, `changefreq=daily` en las fichas contradice un lastmod de 9 días atrás (el de El Vagón), y los `priority` son valores arbitrarios.
- Fix: eliminarlos de `sitemap.ts`. Ojo: `tests/integration/sitemap-route.test.ts:74-80` afirma `priority === 0.9` y `changeFrequency === 'daily'` en los complejos; hay que ajustar ese test en el mismo cambio.
- Cómo sabríamos que falló: `grep -c "<changefreq>" ` sobre el sitemap servido sigue distinto de 0 después del deploy.

### S-05 — Media — 6 de 13 URLs listadas no tienen canonical

- URLs: `/blog`, `/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026`, `/vs/alquila-tu-cancha`, `/alternativas-alquila-tu-cancha`, `/privacidad`, `/terminos`.
- Causa: usan `metadata` o `generateMetadata` a mano en vez de `buildMetadata` (`src/lib/seo/metadata.ts`, que sí agrega `alternates.canonical`, OG y Twitter):
  - `src/app/(business)/blog/page.tsx:4-7`
  - `src/app/(business)/blog/[slug]/page.tsx:20-24`
  - `src/app/(business)/vs/alquila-tu-cancha/page.tsx:10-15`
  - `src/app/(business)/alternativas-alquila-tu-cancha/page.tsx:10-15`
  - `src/app/(public)/privacidad/page.tsx:4-7`
  - `src/app/(public)/terminos/page.tsx:5-8`
- Consecuencia: sin canonical ni OG/Twitter, las variantes con `?utm_*` o `?ref=` compiten con la URL limpia. Las comparativas son los activos más valiosos para el plan de visibilidad en IA y son las que menos metadata tienen.
- Fix: pasar las 6 por `buildMetadata({ title, description, path })`.
- Cómo sabríamos que falló: `curl -s <url> | grep -c 'rel="canonical"'` da 0 en alguna de las 6. Un test de unidad que renderice `generateMetadata` de cada ruta del sitemap y exija `alternates.canonical`.

### S-06 — Media — páginas del sitemap sin links internos entrantes

- `/vs/alquila-tu-cancha` y `/alternativas-alquila-tu-cancha`:
  - Ninguna de las 13 páginas rastreadas las enlaza (ni header, footer, `/blog` ni el post).
  - En el repo, `grep` solo las encuentra en sus propios `page.tsx` y en `RESERVED_SLUGS` (`src/modules/tenants/tenant.utils.ts:76`).
  - `llms.txt` tampoco las lista (solo `/para-complejos`, `/precios`, `/explorar`).
  - Hoy solo el sitemap las descubre.
- `/rival` (landing en prod): ninguna página pública la enlaza. Solo ella enlaza a `/rival/tablon`.
- El post del blog solo se alcanza desde `/blog`.
- El blog (`BusinessHeader.tsx:78,117`) está a un click, pero las comparativas quedan a profundidad 3 o más, o inalcanzables.
- Fix:
  - Link a ambas comparativas desde el footer/header de negocio (`src/components/site/BusinessHeader.tsx`), desde `/blog` y desde el cuerpo del post.
  - Sumarlas a `public/llms.txt`.
  - Sobre `/rival`: es decisión de producto si se enlaza desde la home o `/explorar` (REQUIERE INPUT del dueño; no lo resuelvo).
- Cómo sabríamos que falló: un crawl desde `/` con profundidad 3 no alcanza esas URLs. Search Console las muestra como "Descubierta, actualmente sin indexar" o con "Sitemap" como única fuente de descubrimiento.

### S-07 — Media (a verificar) — deriva entre la rama local y prod en `/rival`

- Evidencia: tabla del inicio. En prod `/rival` está en el sitemap y es indexable. En el árbol local `robots.ts:42` la bloquea con `'/rival$'`, `rival/page.tsx:21` pone `noIndex: true`, y `tests/unit/robots-route.test.ts:34-46` afirma que `/rival` está bloqueada.
- Riesgo: si se mergea `feat/panel-mobile-denso` con un conflicto resuelto del lado equivocado, o se rebasa mal, `/rival` quedaría listada en el sitemap y bloqueada en robots (contradicción), o desaparecería del sitemap. Hoy no hay ningún fallo en prod.
- Fix: antes de abrir el PR, traer main y confirmar que `sitemap.ts`, `robots.ts` y `robots-route.test.ts` coinciden con lo que sirve prod (`/rival` listada y no bloqueada, `/rival/tablon` bloqueada y noindex).
- Cómo sabríamos que falló: `curl https://turnogol.app/robots.txt | grep 'rival\$'` aparece post-deploy mientras `/rival` sigue en `/sitemap.xml`.

### S-08 — Info (OK) — cobertura: no faltan URLs indexables

Método: se rastrearon los links internos de las 13 páginas del sitemap más las rutas del árbol `src/app`. Contraste:

- `/explorar` enlaza exactamente a los 2 complejos del sitemap (`/el-vagon-deportivo`, `/complejo-evardss`).
- El filtro de complejos (`src/modules/tenants/sitemap.service.ts:21-29`: `active`/`trialing`, `marketplaceVisible`, `onboarding_completed`) es un subconjunto estricto de `isPublicPortalIndexable` (`tenant.lifecycle.ts:131`), así que no puede listar un perfil que a la vez se marque noindex (`(perfil)/page.tsx:121-131`).
- Excluidas correctamente:
  - `/<slug>/reservar`: 200 con `noindex, nofollow`.
  - `/rival/tablon`: 200 con `noindex, nofollow`, además bloqueada en robots.
  - `/suspended`: noindex.
  - `/<slug>/torneos` y `/<slug>/torneos/*`: 404 (flag `tournaments` apagado).
  - `/r/<code>`: 307 a `/para-complejos`, bloqueada en robots.
  - `/reactivar`, `/aceptar-terminos`: 307 a login.
- `/index` devuelve 200 con el mismo HTML que `/` (63.909 bytes) y canonical a la raíz. No va al sitemap, pero existe como URL duplicada (ver S-11).
- Alcance: el rastreo no ve complejos no visibles en marketplace (por diseño). No se consultó la DB.

### S-09 — Baja — el generador falla en silencio hacia un sitemap sin complejos

- Evidencia: `src/app/sitemap.ts:67` `await listSitemapTenants().catch(() => [] as SitemapTenant[])`, y `:104` lo mismo para torneos.
- Si la DB falla durante la regeneración ISR, Next cachea un sitemap válido sin las fichas de complejo (11 URLs en vez de 13), por una hora o hasta la próxima regeneración. Nadie se entera: no hay log, ni Sentry, ni alerta.
- Fix: loguear el catch (`logger.error` / `captureMessage`) y, si falla `listSitemapTenants`, dejar que la regeneración falle para que Vercel conserve la versión anterior.
- Cómo sabríamos que falló: caída del conteo de `<loc>` de 13 a 11 sin baja de ningún complejo. Un check de `launch:check` que compare `count(<loc> en /sitemap.xml)` con `count(tenants indexables en DB)`.

### S-10 — Info — quality gate de páginas de ubicación

- Hoy: 2 fichas de complejo en el sitemap (`/el-vagon-deportivo`, `/complejo-evardss`). Umbral de WARNING: 30. HARD STOP: 50. No se dispara ninguno.
- Observación a futuro: las fichas son plantilla más 5 datos (nombre, dirección, nº de canchas y formato, horarios, teléfono).
  - Texto visible: unas ~70 palabras por ficha, incluyendo el chrome de nav y footer.
  - Entre las dos fichas, el 73 % de las palabras de la secuencia coincide (`difflib.SequenceMatcher`, incluye nav/footer). Es una medida gruesa, pero sugiere que sin más contenido propio se quedarían por debajo del 60 % de contenido único que exige el gate.
  - La meta description de El Vagón es el fallback de plantilla (`Reservá una cancha en <nombre>, <ciudad>.`, `(public)/[slug]/(perfil)/page.tsx:135`). Nadie cargó `description`.
  - Lo que sí aporta valor único: JSON-LD `SportsActivityLocation`, horarios y fotos de portada.
- Recomendación antes de llegar a 30 complejos: pedir `description` en el onboarding, mostrar detalle de canchas y reseñas, y definir un mínimo de contenido para entrar al sitemap.
- REQUIERE INPUT del dueño: ¿qué contenido mínimo (descripción cargada, reseñas, fotos) debe tener una ficha para ser listada? Hoy basta con `onboarding_completed`. No es una decisión técnica.
- Cómo sabríamos que falló: al pasar de 30 fichas, medir la similitud del texto del `<main>` entre pares (excluyendo nav y footer). Si el 40 % o más del texto es idéntico, es riesgo de doorway.

### S-11 — Baja — higiene detectada fuera del alcance del sitemap

- Títulos con marca duplicada en las 4 páginas editoriales: `"… | TurnoGol · TurnoGol"`. Cada página agrega ` | TurnoGol` a mano (`blog/page.tsx:5`, `blog/[slug]/page.tsx:22`, `vs/alquila-tu-cancha/page.tsx:12`, `alternativas-alquila-tu-cancha/page.tsx:12`) y el template raíz (`src/app/layout.tsx:33`: `%s · TurnoGol`) la agrega otra vez. Fix: quitar el sufijo manual. Se resuelve junto con S-05.
- El nombre del complejo de El Vagón tiene un espacio al final (`"El vagón Deportivo "`), que se propaga al `<title>` (doble espacio), a la description (`"El vagón Deportivo , Lujan"`), al `og:title` y al JSON-LD. Fix: trim al guardar el perfil (`settings/perfil/actions.ts`).
- El header de la home emite el link de login como `/ingresar?next=%2Findex`. Es un path interno de reescritura que se filtra, y `/index` sirve un 200 duplicado de la home (con canonical a la raíz, así que sin daño). Fix: derivar `next` del pathname público.

## Lo que está bien

- Un solo sitemap, declarado en robots.txt, XML limpio, 13 URLs absolutas con la forma final (https, apex, sin barra final).
- Ninguna URL listada redirige, devuelve error o tiene noindex.
- El sitemap excluye correctamente tableros, reservas, torneos con flag apagado y landings de referido.
- El filtro de complejos está alineado con la lógica de noindex del perfil.
- El slug reservado (`RESERVED_SLUGS`, `tenant.utils.ts:39-100`) cubre las rutas de negocio, incluyendo `vs`, `blog` y `rival`, así que un complejo no puede pisar una URL del sitemap.

## Prioridad sugerida

1. S-05 y S-06 juntos (canonical + enlazado de las comparativas): mejoran directo la visibilidad del contenido que más importa para IA.
2. S-01 y S-02 (lastmod honesto): quitar `now`, agregar `updated`.
3. S-09 (alerta cuando el sitemap pierde complejos).
4. S-07 al hacer rebase/PR de esta rama.
5. S-04, S-03 y S-11 como limpieza.
6. S-10 antes de llegar a 30 complejos.

## Archivos de referencia

- Generador: `C:\Users\Lazar\Documents\github\TurnoGol\src\app\sitemap.ts`
- Robots: `C:\Users\Lazar\Documents\github\TurnoGol\src\app\robots.ts`
- Complejos del sitemap: `C:\Users\Lazar\Documents\github\TurnoGol\src\modules\tenants\sitemap.service.ts`
- lastmod editorial: `C:\Users\Lazar\Documents\github\TurnoGol\src\lib\content\posts.ts`
- Helper de metadata: `C:\Users\Lazar\Documents\github\TurnoGol\src\lib\seo\metadata.ts`
- Tests existentes: `tests/integration/sitemap-route.test.ts`, `tests/unit/robots-route.test.ts`, `tests/e2e/public-seo.spec.ts`
