# Schema / Datos estructurados — turnogol.app

Fecha: 2026-11-02 · Alcance: las 13 URLs del sitemap (verificado en vivo: `https://turnogol.app/sitemap.xml` lista exactamente esas 13) · Solo lectura del repo.

**Puntaje Schema: 48 / 100**

| Dimensión | Puntos |
|---|---|
| Cobertura (8 de 13 páginas con algún JSON-LD; 5 sin nada) | 10 / 20 |
| Validez y corrección de lo que existe | 13 / 20 |
| Consistencia de entidad (`@id`, Organization única, enlaces entre nodos) | 4 / 20 |
| Completitud de fichas de complejo (el bloque más fuerte del sitio) | 12 / 15 |
| Completitud de Article (fechas, publisher, image) | 6 / 15 |
| Oportunidades de producto/precio (SoftwareApplication, Offer) | 3 / 10 |

Método: `render_page.py --mode never --json --json-ld-output` sobre las 13 URLs. Todo el JSON-LD sale en el HTML crudo (server components; no hay React Helmet ni inyección client-side), así que el crudo equivale al renderizado. No hay Microdata ni RDFa en ninguna página (0 `itemscope`, 0 `typeof=`). No pude correr el Rich Results Test de Google (sin acceso): la validación es contra schema.org + la documentación de Google, y lo marco donde importa.

---

## 1. Dónde se genera el JSON-LD (repo)

| Origen | Archivo:línea | Emite |
|---|---|---|
| Builders y escape | `src/lib/seo/structured-data.ts:34-64` `buildLocalBusiness`, `:68-79` `buildBreadcrumbList`, `:81-96` `buildWebSite`, `:98-106` `buildOrganization`, `:136-138` `renderStructuredData` (escapa `<`, `>`, `/`, U+2028/9) | — |
| Componente | `src/components/seo/JsonLd.tsx:3-10` | `<script type="application/ld+json">` con el escape |
| Home | `src/app/page.tsx:41` | `[Organization, WebSite]` |
| Explorar | `src/app/(public)/explorar/page.tsx:213-218` | BreadcrumbList |
| Ficha | `src/app/(public)/[slug]/(perfil)/page.tsx:73-83` | `[SportsActivityLocation, BreadcrumbList]` |
| Torneos (flag `tournaments` apagado, fuera del sitemap) | `src/app/(public)/[slug]/torneos/page.tsx:33`, `.../[torneoSlug]/page.tsx:39` | BreadcrumbList |
| Artículos (blog, `/vs`, `/alternativas`) | `src/components/site/ArticleShell.tsx:19-29` (objeto), `:35-38` (script **sin** `renderStructuredData`) | Article |
| Precios | `src/app/(business)/precios/page.tsx:88-96` (objeto), `:101-104` (script **sin** `renderStructuredData`) | FAQPage |

Tests existentes que hay que mantener/extender: `tests/unit/seo-structured-data.test.ts`, `tests/e2e/public-seo.spec.ts:41`.

---

## 2. Detección y validez por URL

| URL | Schema detectado | Validez | Observación |
|---|---|---|---|
| `/` | Organization + WebSite(SearchAction), array de 2 nodos con `@context` repetido | Sintaxis OK. **`logo` roto (404)** | Sin `@id`, sin `publisher` en WebSite, sin `sameAs`/`contactPoint` |
| `/explorar` | BreadcrumbList (Inicio > Explorar) | OK | Sin ItemList de complejos (opcional) |
| `/para-complejos` | **ninguno** | — | Página comercial principal sin entidad de producto |
| `/precios` | FAQPage (7 Q&A, coinciden con el texto visible en `<details>`) | OK sintaxis | Info (ver S-09). **Sin SoftwareApplication/Offer** aunque el precio ($ 30.000/mes) está visible |
| `/blog` | **ninguno** | — | Sin BreadcrumbList ni Blog/CollectionPage |
| `/blog/mejores-sistemas-...-2026` | Article: headline, description, datePublished `2026-07-12`, author Organization "TurnoGol" | Válido; faltan recomendadas | Sin `image`, `dateModified`, `publisher`, `mainEntityOfPage`; author sin `@id`/`url` |
| `/vs/alquila-tu-cancha` | Article: headline, description, author | Válido; **sin `datePublished`** | El frontmatter tiene `date: 2026-07-12` pero la page no lo pasa |
| `/alternativas-alquila-tu-cancha` | Ídem `/vs/...` | Ídem | Ídem |
| `/rival` | **ninguno** | — | Además `robots.txt` la bloquea (S-11) |
| `/privacidad`, `/terminos` | **ninguno** | — | No se necesita nada más que, opcional, BreadcrumbList |
| `/el-vagon-deportivo` | SportsActivityLocation (`@id`, name, url, image, telephone, address, openingHoursSpecification x7, geo) + BreadcrumbList (3 niveles) | Válido; calidad de datos mediocre (S-05) | `@id` = URL de la página |
| `/complejo-evardss` | Ídem | Ídem | `image` = OG genérico de TurnoGol |

Tipo elegido para fichas: `SportsActivityLocation` es subtipo válido de `LocalBusiness`; se mantiene.

### Consistencia de entidad (Organization en todo el sitio)

- Nombre: `TurnoGol` en Organization, WebSite y `Article.author.name` — consistente.
- **`@id`: ninguno** en Organization ni WebSite. `Article.author` es un objeto Organization inline sin `@id` ni `url` ni `logo`: para un consumidor de grafos son dos entidades distintas.
- Organization existe **solo en la home** (`src/app/page.tsx:41`); en las otras 12 URLs la entidad "TurnoGol" no se declara y los Article no la referencian.
- URL: Organization/WebSite usan `https://turnogol.app` (sin barra), el breadcrumb "Inicio" usa `https://turnogol.app/` (`absoluteUrl('/')`), el canonical de home es `https://turnogol.app`. Google las trata igual, pero conviene fijar una sola forma.
- `logo`: `https://turnogol.app/icon` -> **404** (S-01).
- Las fichas (`@id` = `https://turnogol.app/{slug}`) no apuntan a nada del sitio (ni `WebPage`, ni `isPartOf` -> WebSite). Es correcto que el complejo NO sea `parentOrganization` de TurnoGol, pero el `WebPage` de la ficha sí debería colgar del `WebSite`.

---

## 3. Hallazgos

### S-01 · CRÍTICO · `Organization.logo` apunta a una URL que da 404
- Evidencia: `src/lib/seo/structured-data.ts:104` `logo: absoluteUrl('/icon')`. En vivo: `curl -sI https://turnogol.app/icon` -> `HTTP/1.1 404 Not Found`, `Content-Type: text/html`. El `src/app/icon.png` estático se sirve en `/icon.png` (32x32 px, 1.724 bytes), no en `/icon`. Los candidatos reales: `/icon-512` (200, `image/png`, 512x512, logo TG sobre fondo oscuro, verificado visualmente) y `/icon-192` (192x192).
- Impacto: Google ignora el logo (mínimo 112x112 px, debe ser crawleable); el panel de marca/Knowledge Graph y los LLM que leen el JSON-LD no obtienen imagen de marca. Es el único bloque de entidad del sitio y es el que está roto.
- Fix (un cambio): usar `/icon-512` y modelarlo como ImageObject enlazable (ver S-02 para el bloque completo):
```json
"logo": { "@type": "ImageObject", "@id": "https://turnogol.app/#logo", "url": "https://turnogol.app/icon-512", "width": 512, "height": 512 }
```
- Cómo sabríamos que falló: `curl -sI https://turnogol.app/icon-512` != 200 o `Content-Type` != `image/*`; Search Console > Mejoras > Logotipos (aparece cuando Google lo procesa); agregar al test unitario `tests/unit/seo-structured-data.test.ts` una aserción de que `logo.url` no es `/icon` y que el path existe en `src/app` (hoy no hay candado: el bug pasó los tests); y en `tests/e2e/public-seo.spec.ts` un `request.head(logo.url)` -> 200.

### S-02 · ALTO · No hay grafo de entidad: sin `@id`, Organization solo en la home, autor desconectado
- Evidencia: `structured-data.ts:81-106` (WebSite y Organization sin `@id`; WebSite sin `publisher`); `ArticleShell.tsx:25-28` (author inline); `precios/page.tsx:88-96` (FAQPage sin `publisher`/`isPartOf`); fichas con `@id` propio pero sin `WebPage`.
- Impacto: cada página es una isla; los LLM y Google no pueden resolver "TurnoGol (Organization) -> publica -> WebSite -> artículos -> producto". Es la base para que las comparativas (`/vs`, `/alternativas`) atribuyan autoría a una entidad con logo, redes y contacto.
- Fix: IDs únicos en `structured-data.ts` (constantes `ORG_ID = SITE_URL + '/#organization'`, `WEBSITE_ID = SITE_URL + '/#website'`, `SOFTWARE_ID = SITE_URL + '/#software'`) y `@graph` en la home. Solo se usan datos que ya existen en el repo: Instagram (`CONTACT_INSTAGRAM_HANDLE`, `src/lib/contact.ts`, también renderizado en el footer), email `hola@turnogol.app` (`CONTACT_EMAIL`), WhatsApp comercial (`CONTACT_WHATSAPP_DIGITS` = 5492323346976).
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://turnogol.app/#organization",
      "name": "TurnoGol",
      "url": "https://turnogol.app/",
      "logo": { "@type": "ImageObject", "@id": "https://turnogol.app/#logo", "url": "https://turnogol.app/icon-512", "width": 512, "height": 512 },
      "sameAs": ["https://instagram.com/turnogol"],
      "contactPoint": [{
        "@type": "ContactPoint",
        "contactType": "sales",
        "email": "hola@turnogol.app",
        "telephone": "+5492323346976",
        "availableLanguage": "es",
        "areaServed": "AR"
      }]
    },
    {
      "@type": "WebSite",
      "@id": "https://turnogol.app/#website",
      "url": "https://turnogol.app/",
      "name": "TurnoGol",
      "inLanguage": "es-AR",
      "publisher": { "@id": "https://turnogol.app/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": { "@type": "EntryPoint", "urlTemplate": "https://turnogol.app/explorar?q={search_term_string}" },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```
  Y en cada página (artículos, fichas, precios) referenciar por `{"@id": ".../#organization"}` en lugar de repetir el objeto. Un Organization declarado solo en la home sigue siendo la fuente de verdad (Google lo recomienda en la home o página "acerca de"); lo que falta es que el resto lo cite por `@id`.
- No inventar: no hay LinkedIn, Facebook ni X en el repo (solo Instagram) -> no agregarlos a `sameAs`. `description`, `foundingDate`, `address` de TurnoGol no están en el sitio: no se proponen.
- Cómo sabríamos que falló: test que recorra las 13 URLs y verifique (a) exactamente un `@id` `.../#organization` definido (en home) y (b) toda referencia `{"@id": ...}` resuelve dentro del mismo documento o a una de las 3 constantes del sitio; Schema Markup Validator (validator.schema.org) sin errores de referencia.

### S-03 · ALTO · El producto B2B no existe como entidad: `/precios` y `/para-complejos` sin SoftwareApplication/Offer
- Evidencia: `/para-complejos` -> 0 bloques. `/precios` -> solo FAQPage (`precios/page.tsx:88-104`), aunque el HTML crudo muestra el precio: meta description "Un precio de $ 30.000 por cancha al mes" y, en el cuerpo, "TurnoGol sale desde $ 30.000 /mes". El importe sale de `UNIFORM_PRICING` (`precios/plans-data.ts:8-12`) y lo contrasta `pricing-sync.test.ts` contra la DB.
- Impacto: al preguntar "cuánto cuesta un sistema de reservas para canchas de fútbol en Argentina" no hay un nodo máquina-legible de producto/precio. Atención: Google solo da rich result de SoftwareApplication con `aggregateRating` o `review`, y **no existe ninguna reseña/rating de TurnoGol en el sitio -> no hay que inventarlos**. El beneficio acá es de entidad y de extracción por LLM, no de estrellas.
- Fix `/precios` (el importe debe derivarse de `monthlyListAmount(1, UNIFORM_PRICING) / 100`, no hardcodearse, para que el JSON-LD no se desfase de la página; cualquier cambio de precio sigue siendo decisión escrita del dueño — acá solo se refleja lo publicado):
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://turnogol.app/#software",
      "name": "TurnoGol",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "description": "Sistema de reservas con seña por MercadoPago, grilla, caja y abonados para complejos de fútbol en Argentina.",
      "url": "https://turnogol.app/para-complejos",
      "inLanguage": "es-AR",
      "publisher": { "@id": "https://turnogol.app/#organization" },
      "offers": {
        "@type": "Offer",
        "url": "https://turnogol.app/precios",
        "priceCurrency": "ARS",
        "price": "30000",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "30000",
          "priceCurrency": "ARS",
          "billingDuration": "P1M",
          "referenceQuantity": { "@type": "QuantitativeValue", "value": 1, "unitText": "cancha" }
        },
        "availability": "https://schema.org/InStock"
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://turnogol.app/" },
        { "@type": "ListItem", "position": 2, "name": "Precios" }
      ]
    }
  ]
}
```
  Notas: (1) los "30 días gratis" no se modelan como `price: 0` (sería mentir sobre el precio de lista); (2) el precio anual ($ 27.000/cancha/mes equivalente) solo aparece tras activar el toggle "Anual" en `PlanSelector.tsx` (estado client-side, no está en el HTML crudo) -> no incluirlo salvo que el dueño quiera un segundo Offer (REQUIERE INPUT #2).
- Fix `/para-complejos`: mismo nodo `SoftwareApplication` (mismo `@id`) **sin `offers`** (esa página no muestra precio; solo el CTA "Ver precios") + BreadcrumbList (Inicio > Para complejos).
- Cómo sabríamos que falló: test que compare `offers.price` del JSON-LD con `formatArs(PLANS[0].priceMonthly)` del texto de la página; Rich Results Test sobre `/precios` debe detectar "Software App" (advertirá que falta rating: esperado); si el precio de `plans`/`pricing.ts` cambia y el JSON-LD no, el test falla.

### S-04 · MEDIO · Article: sin `datePublished` en 2 de 3 páginas; faltan `image`, `dateModified`, `publisher`, `mainEntityOfPage`
- Evidencia: `src/app/(business)/vs/alquila-tu-cancha/page.tsx:25-31` y `src/app/(business)/alternativas-alquila-tu-cancha/page.tsx:25-29` no pasan `date` a `ArticleShell` (solo `addFaqSchema`), aunque ambos `.mdx` tienen `date: "2026-07-12"` (`content/pages/*.mdx`). `ArticleShell.tsx:24` solo emite `datePublished` si hay `date`. Resultado en vivo: esas dos páginas no tienen fecha ni en JSON-LD ni visible (`ArticleShell.tsx:47`). El blog post sí la tiene. Ninguna tiene `dateModified` (el frontmatter de `src/lib/content/posts.ts:6-11` no tiene campo de actualización). `author` es Organization inline (Google lo admite, pero sin `@id`/`url`).
- Impacto: las comparativas son las páginas con más intención comercial ("alternativas a Alquila Tu Cancha") y justo las dos sin señal de frescura; los LLM y Google usan `datePublished/dateModified` para decidir si citar.
- Fix: (a) pasar `date={post.frontmatter.date}` en las dos pages (1 línea c/u); (b) agregar `updated: z.string().optional()` al frontmatter y emitir `dateModified` solo si existe (no inventar una fecha); (c) pasar a `BlogPosting` para `/blog/*`; (d) `author`/`publisher` por `@id`; (e) `image` = OG por defecto (`/opengraph-image`, 1200x630, existe y devuelve 200) hasta tener imagen por artículo.
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "https://turnogol.app/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026#article",
      "mainEntityOfPage": { "@type": "WebPage", "@id": "https://turnogol.app/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026" },
      "headline": "Los Mejores Sistemas de Gestión para Canchas de Fútbol en Argentina (2026)",
      "description": "Análisis actualizado de las mejores aplicaciones y sistemas para administrar reservas de complejos de fútbol 5, 7 y 11.",
      "datePublished": "2026-07-12",
      "inLanguage": "es-AR",
      "image": "https://turnogol.app/opengraph-image",
      "author": { "@id": "https://turnogol.app/#organization" },
      "publisher": { "@id": "https://turnogol.app/#organization" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://turnogol.app/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://turnogol.app/blog" },
        { "@type": "ListItem", "position": 3, "name": "Los Mejores Sistemas de Gestión para Canchas de Fútbol en Argentina (2026)" }
      ]
    }
  ]
}
```
  Para `/vs/alquila-tu-cancha` y `/alternativas-alquila-tu-cancha` es el mismo patrón con `@type: Article`, su `headline`/`description` del frontmatter, `datePublished: "2026-07-12"` y breadcrumb Inicio > título (sin nivel "Blog": no cuelgan de `/blog`).
  REQUIERE INPUT #1: autor Person vs Organization. Una persona con nombre y página propia mejora la señal de autoría, pero el repo no tiene ese dato (el campo `author` del frontmatter existe, `posts.ts:10`, y nadie lo usa). No se propone un nombre.
- Cómo sabríamos que falló: `grep datePublished` sobre el HTML de las 3 URLs de contenido (hoy 1 de 3); test unitario de `ArticleShell` (`ArticleShell.stories.tsx:78` ya lee el script) extendido a `author["@id"]`/`publisher["@id"]`/`image`; Search Console > Mejoras (Artículo) sin advertencias de campos faltantes.

### S-05 · MEDIO · Datos de las fichas con defectos que el builder propaga tal cual
Evidencia (JSON-LD en vivo vs `structured-data.ts`):
1. `El vagón Deportivo`: `addressLocality: "Lujan, Buenos Aires"` (la ciudad cargada ya trae la provincia; también se ve en la página: "almafuerte 2156, Lujan, Buenos Aires"). `structured-data.ts:49` lo copia. Además `name` con espacio final (`"El vagón Deportivo "`, también en el breadcrumb y en el `<title>`).
2. `telephone`: el de Evardss y el de El Vagón: con espacio, y el de Evardss no trae el `9` de celular ni separa área; no es E.164 (`structured-data.ts:45`). El repo ya resolvió lo mismo para `tel:` (`telHref` en `src/lib/contact.ts`, F-013) pero el JSON-LD no lo usa. No puedo inferir el número correcto: REQUIERE INPUT #4.
3. `image` de Evardss = `https://turnogol.app/opengraph-image` (la imagen de marca de TurnoGol, no del complejo): `structured-data.ts:36` cae al OG por defecto si no hay `coverUrl`. Para el negocio "Complejo Evardss" es una imagen equivocada.
4. `openingHoursSpecification` de El Vagón: lunes a viernes `opens 08:00 / closes 01:00` (cierra pasada la medianoche, `closesNextDay`). schema.org no define explícitamente `closes < opens`; los consumidores lo interpretan distinto. El builder solo parchea `00:00 -> 23:59` (`:30`), que es el caso de Evardss (visible: "08:00 - 00:00", JSON-LD `23:59`; correcto).
5. `description` ausente en ambos (opcional; la ficha tampoco la muestra) — no se inventa.
- Fix (en el builder, sin tocar datos y sin migraciones): `name.trim()`; si `city` termina en `, ${province}`, quitarlo; `telephone` normalizado con la misma lógica de `telHref` y omitido si no pasa; `image` solo si hay `coverUrl` (si no, omitir `image`, o usar `logoUrl`); para cierre pasada la medianoche dividir en dos tramos (`D 08:00-23:59` + `D+1 00:00-01:00`). Complementario y recomendable: corregir los datos en origen desde `/settings/perfil` (`updateTenantLocationAction`); ojo: `city` se filtra por igualdad exacta en el buscador público (`tenant.schema.ts:110-113`), así que editar la ciudad cambia el catálogo de localidades; coordinar con el dueño del complejo.
  Resultado esperado de los tramos para El Vagón (lunes):
```json
[
  { "@type": "OpeningHoursSpecification", "dayOfWeek": "Monday",  "opens": "08:00", "closes": "23:59" },
  { "@type": "OpeningHoursSpecification", "dayOfWeek": "Tuesday", "opens": "00:00", "closes": "01:00" }
]
```
  Aviso: no pude confirmar contra el Rich Results Test si Google acepta `closes < opens`; el esquema dividido es el patrón que no depende de esa interpretación. Verificar en Search Console (informe de datos de negocio local, si hay) o en validator.schema.org.
- Cómo sabríamos que falló: test unitario del builder con fixtures (`"Lujan, Buenos Aires"`, nombre con espacios, teléfono con espacio, `coverUrl: null`, cierre `01:00`) sobre `tests/unit/seo-structured-data.test.ts`; revisión mensual con un script que cargue cada ficha del sitemap y marque `addressLocality` con coma, `name` con espacios al borde, `image` == `/opengraph-image`, `telephone` no `^\+\d{10,15}$`.

### S-06 · MEDIO · BreadcrumbList solo en explorar/fichas; faltan en 8 páginas
- Evidencia: breadcrumb presente en `/explorar` y las 2 fichas; ausente en `/precios`, `/para-complejos`, `/blog`, los 3 artículos, `/rival`, `/privacidad`, `/terminos`.
- Impacto: bajo en SERP (los breadcrumbs ya no son decisivos) pero útil para la jerarquía que leen los LLM, y el componente `buildBreadcrumbList` ya existe.
- Fix: reutilizar `buildBreadcrumbList` (`structured-data.ts:68`) en cada page con los ejemplos de S-03/S-04. `/blog` -> Inicio > Blog. Legales -> Inicio > Política de Privacidad / Términos y Condiciones (opcional).
- Cómo sabríamos que falló: conteo de `BreadcrumbList` por URL del sitemap (hoy 3 de 13); Search Console > Mejoras > Migas de pan.

### S-07 · BAJO/MEDIO · Fichas: faltan `logo`, `WebPage` enlazado, `hasMap`, `ReserveAction`; `aggregateRating` solo si hay reseñas reales
- Evidencia: `buildLocalBusiness` (`structured-data.ts:34-64`) no usa `tenant.logoUrl` (existe en `PublicTenant`, `public.service.ts:20`), no emite `WebPage`, ni `hasMap` (la ficha tiene el botón "Cómo llegar"), ni acción de reserva (el producto es reservar). La page calcula `summary.average/count` (`[slug]/(perfil)/page.tsx:60-62`) y las reseñas se renderizan (`ProfileRest`), pero el builder no las recibe. Hoy ninguna de las 2 fichas muestra rating (0 reseñas), así que **hoy no hay nada que emitir**: no inventar.
- Fix (resultado esperado para `/el-vagon-deportivo`, solo con campos que existen; `logo` solo si `logoUrl` no es null):
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SportsActivityLocation",
      "@id": "https://turnogol.app/el-vagon-deportivo#business",
      "name": "El vagón Deportivo",
      "url": "https://turnogol.app/el-vagon-deportivo",
      "image": "https://media.turnogol.app/ed346072-07a4-41d0-b5a4-2741853fe921/cover-b8413c42-4b78-44c3-8864-6f22404f13f1.webp",
      "address": { "@type": "PostalAddress", "streetAddress": "almafuerte 2156", "addressLocality": "Lujan", "addressRegion": "Buenos Aires", "addressCountry": "AR" },
      "geo": { "@type": "GeoCoordinates", "latitude": -34.5588617, "longitude": -59.0924725 },
      "hasMap": "https://www.google.com/maps?q=-34.5588617,-59.0924725",
      "openingHoursSpecification": [ "...tramos de S-05..." ],
      "potentialAction": {
        "@type": "ReserveAction",
        "target": { "@type": "EntryPoint", "urlTemplate": "https://turnogol.app/el-vagon-deportivo", "actionPlatform": ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] },
        "result": { "@type": "Reservation", "name": "Reserva de cancha de fútbol" }
      }
    },
    {
      "@type": "WebPage",
      "@id": "https://turnogol.app/el-vagon-deportivo",
      "url": "https://turnogol.app/el-vagon-deportivo",
      "name": "El vagón Deportivo",
      "isPartOf": { "@id": "https://turnogol.app/#website" },
      "mainEntity": { "@id": "https://turnogol.app/el-vagon-deportivo#business" },
      "breadcrumb": { "@id": "https://turnogol.app/el-vagon-deportivo#breadcrumb" }
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://turnogol.app/el-vagon-deportivo#breadcrumb",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://turnogol.app/" },
        { "@type": "ListItem", "position": 2, "name": "Explorar", "item": "https://turnogol.app/explorar" },
        { "@type": "ListItem", "position": 3, "name": "El vagón Deportivo" }
      ]
    }
  ]
}
```
  (Cambiar el `@id` del negocio de la URL pelada a `#business` evita que "la página" y "el negocio" compartan identificador; si se cambia, hacerlo en todas las fichas a la vez.) `priceRange` NO se agrega: los complejos pueden ocultar sus precios (`hidePrices`) y no hay dato público. `aggregateRating`/`review`: solo cuando `count > 0` y las reseñas estén visibles en la página; caveat: Google restringe las estrellas de reseñas "autorreferidas" en LocalBusiness/Organization; acá las reseñas las recolecta TurnoGol (tercero) sobre cada complejo, pero la elegibilidad no está garantizada: probar en el Rich Results Test antes de apostar a las estrellas. `specialOpeningHoursSpecification` para `closedDates` y `containsPlace` por cancha/formato (ej. "5 canchas - Fútbol 5 y 7") son extras de bajo valor.
- Cómo sabríamos que falló: `tests/e2e/public-seo.spec.ts:41` ya afirma el tipo; agregarle `WebPage.mainEntity` resolviendo al `@id` del negocio y `isPartOf` -> `#website`; Search Console > Datos de negocio local / Rich Results Test con `/el-vagon-deportivo`.

### S-08 · BAJO · Dos emisores de JSON-LD se saltean el escape anti-`</script>`
- Evidencia: `ArticleShell.tsx:35-38` y `precios/page.tsx:101-104` usan `JSON.stringify` directo en `dangerouslySetInnerHTML`; el resto usa `JsonLd` -> `renderStructuredData` (`structured-data.ts:119-138`, que justamente documenta el vector). Hoy el contenido sale de MDX/constantes del repo (no hay vector remoto), pero un `</script>` o `<!--` en un título de frontmatter rompería la página.
- Fix: reemplazar ambos por `<JsonLd data={...} />` (es el cambio mínimo y además deja un solo punto de emisión para los fixes S-02..S-04).
- Cómo sabríamos que falló: test de contrato "ningún archivo bajo `src/` contiene `application/ld+json` fuera de `components/seo/JsonLd.tsx`" (hoy `grep` da 3 archivos: `JsonLd.tsx`, `ArticleShell.tsx`, `precios/page.tsx`).

### S-09 · INFO · FAQPage en `/precios` (sin beneficio de SERP)
- Evidencia: `precios/page.tsx:88-104`: FAQPage con 7 Q&A que coinciden con el contenido visible. Google retiró el rich result de FAQ para todos los sitios el 2026-05-07.
- Estado: no es un error ni hay que quitarlo ni agregarlo por SERP; cualquier valor para búsqueda con IA no está confirmado. Prioridad Info. Nota de limpieza sin impacto externo: la prop `addFaqSchema` de `/vs` y `/alternativas` (`ArticleShell.tsx:9,17`, renombrada `_addFaqSchema`) se ignora y esas páginas no emiten FAQPage; no es defecto de schema. Si algún día `/vs` tiene Q&A de usuarios reales, el tipo correcto sería QAPage, no FAQPage.

### S-10 · INFO · SearchAction (sitelinks search box retirada por Google)
- Evidencia: `structured-data.ts:87-94`. Google retiró el cuadro de búsqueda de sitelinks (nov 2024): ya no genera ningún rich result. El target `/explorar?q=` sí funciona (`explorar/page.tsx:147,162`; `?q=Evardss` devuelve el complejo).
- Observación de producto que afecta a cualquier agente que use esa acción: la búsqueda no ignora acentos (`?q=vagon` devuelve 0 resultados para "El vagón Deportivo", verificado). No es un problema de schema; se deja como dato.
- No requiere acción de schema; mantenerlo no cuesta nada.

### S-11 · INFO / cruce con SEO técnico · `/rival` en el sitemap pero bloqueada en robots.txt; faltan canonicals en contenido
- Evidencia: `src/app/robots.ts:42-43` (`Disallow: /rival$` y `/rival/`) vs `sitemap.xml` en vivo que lista `https://turnogol.app/rival`. Un bot que respeta robots no puede leer la página ni su schema. Hasta decidir si RIVAL va a ser indexable (hay flag `rival`), no se recomienda schema para esa URL.
- Evidencia (afecta la consistencia de `url`/`@id`): el HTML crudo no trae `<link rel="canonical">` en `/blog`, los 3 artículos, `/privacidad` ni `/terminos` (sí en el resto). `blog/[slug]/page.tsx:16-23` y `vs/.../page.tsx:7-15` arman `metadata` a mano en vez de `buildMetadata` (sin canonical, con `og:type=website` en lugar de `article`, y título duplicado "... | TurnoGol · TurnoGol"). Si se agrega `url`/`mainEntityOfPage` al Article (S-04), el canonical debe coincidir. Se deriva al informe de SEO técnico.

---

## 4. Oportunidades adicionales (menor prioridad)

- `/explorar`: `CollectionPage` + `ItemList` con las fichas listadas (hoy 2: `https://turnogol.app/el-vagon-deportivo`, `https://turnogol.app/complejo-evardss`), solo para la vista sin filtros. Google no da carrusel de LocalBusiness; el valor es de descubrimiento por IA. Prioridad baja hasta que haya más complejos.
- `/blog`: `Blog` con `blogPost` (o `CollectionPage`) + BreadcrumbList.
- Torneos (`/[slug]/torneos/...`): hoy solo BreadcrumbList y el flag `tournaments` está apagado; cuando se encienda, evaluar `SportsEvent` con datos reales (fecha, lugar, estado); no antes.
- Prohibidos por regla (no recomendados): HowTo, SpecialAnnouncement, CourseInfo/EstimatedSalary/LearningVideo. Ningún bloque existente los usa.

---

## 5. Orden de implementación sugerido

1. S-01 (1 línea + candado en test): sin esto el único bloque de entidad está roto.
2. S-08 + S-02: un solo emisor (`JsonLd`), constantes `ORG_ID/WEBSITE_ID/SOFTWARE_ID` y home en `@graph`.
3. S-04 (2 líneas de `date` + `author/publisher` por `@id`) y S-03 (`/precios`, `/para-complejos`).
4. S-05 en el builder de fichas, luego S-07 y S-06.

Todos los fixes tocan `src/lib/seo/structured-data.ts`, `ArticleShell.tsx` y 4-6 pages: cambio de ~3 archivos de lógica más tests; el de S-05/S-07 requiere ampliar `tests/unit/seo-structured-data.test.ts` y el e2e `public-seo.spec.ts`.

## REQUIERE INPUT (decisiones del dueño)

1. ¿El autor de los artículos es la organización "TurnoGol" (hoy) o una persona con nombre y página propia? Sin ese dato no se agrega `Person`.
2. ¿Se publica también el Offer anual ($ 27.000 por cancha por mes pagando el año, hoy visible solo tras el toggle "Anual")? No cambia ningún precio; es solo si se refleja en el JSON-LD.
3. ¿Hay perfiles oficiales de TurnoGol además de Instagram (LinkedIn, Facebook, X, Google Business Profile) para `sameAs`? En el repo solo existe Instagram.
4. Teléfonos de las 2 fichas (Evardss y El Vagón) y ciudad/nombre de El Vagón ("Lujan, Buenos Aires", espacio final): ¿se corrigen con cada complejo desde `/settings/perfil` (afecta el filtro por ciudad del buscador) o solo se normalizan en el JSON-LD?

## No verificado en esta pasada

- Rich Results Test / Search Console (sin acceso): la interpretación de `closes < opens` y la elegibilidad de estrellas para reseñas son sin confirmar.
- Fichas de otros complejos: el sitemap solo tiene 2 (`/el-vagon-deportivo`, `/complejo-evardss`); el builder es genérico, así que cada alta nueva hereda los defectos de S-05 hasta que se corrijan.
- Contenido client-side: la home y el resto no inyectan JSON-LD en cliente (verificado por `grep` en `src/`), por lo que el fetch sin JS cubre todo.
