# SEO local - fichas de complejos de turnogol.app

Fecha: 2026-11-02 · Alcance: `/el-vagon-deportivo`, `/complejo-evardss` y `/explorar` como hub · Solo lectura (repo + fetch HTTP a producción). No se tocó nada y no se corrigió ningún dato.

TurnoGol no es un negocio local: no se audita GBP propio. Cada ficha `/[slug]` se audita como la página local del complejo y como activo de TurnoGol.

## 1. Puntaje final: 38 / 100 (El Vagón ~39, Evardss ~36)

Casi todo lo que resta es de plantilla (una corrección en el código mejora todas las fichas futuras) o de datos cargados.

| Dimensión | Peso | Puntos | Resumen |
|---|---|---|---|
| Señales GBP (ficha lista para ser el link del perfil) | 25 | 9 | URL canónica limpia, 200, sitemap, "Cómo llegar" con lat/lng. Faltan place_id/link de Maps, sameAs, UTM/atribución, NAP prolijo |
| Reseñas y reputación | 20 | 4 | 0 reseñas en ambas, sin aggregateRating; la infraestructura de reseñas verificadas existe pero no llega al schema |
| On-page local | 20 | 9 | NAP y horarios en el HTML inicial (dentro de `hidden`); title/H1 sin ciudad ni "canchas de fútbol"; contenido casi todo plantilla |
| NAP y citaciones | 15 | 6 | Fuentes consistentes entre sí pero con defectos de dato; teléfono no visible como texto; citaciones no evaluadas |
| Schema local | 10 | 7 | `SportsActivityLocation` correcto, geo con 7 decimales, horarios, url, teléfono. Faltan postalCode, description, sameAs, rating; locality contaminada |
| Enlaces y autoridad local | 10 | 4 | `/explorar` enlaza a las fichas con `<a>` real; la home no; sin páginas de ciudad ni enlaces entre fichas |

Proximidad (~55% de la varianza del local pack según Search Atlas): fuera de control de la ficha, no se mide acá.

## 2. Tipo de negocio y vertical

- Tipo: **brick-and-mortar** (dirección de calle visible, "Cómo llegar", lat/lng). Sin iframe de Maps (la CSP solo permite `frame-src *.mercadopago.com`).
- Vertical: instalación deportiva (fuera de las 6 verticales de la guía). Subtipo usado: `SportsActivityLocation` (correcto).
- Plataforma: Next.js con ISR (`revalidate = 300`, `src/app/(public)/[slug]/(perfil)/page.tsx:29`), `x-nextjs-prerender: 1`, `x-vercel-cache: HIT`, `<html lang="es">`.

## 3. Auditoría de NAP (fuentes cruzadas)

### El Vagón Deportivo

| Campo | Visible | JSON-LD | Meta / OG | Otro |
|---|---|---|---|---|
| Nombre | H1 `El vagón Deportivo␠` (espacio final) | `"El vagón Deportivo "` | title `El vagón Deportivo␠␠· TurnoGol` (doble espacio); og:title con espacio final | alt de portada y texto precargado de WhatsApp ("...en El vagón Deportivo .") |
| Dirección | `almafuerte 2156, Lujan, Buenos Aires` | street `almafuerte 2156`; locality `Lujan, Buenos Aires`; region `Buenos Aires` | description `...El vagón Deportivo , Lujan, Buenos Aires.` | `/explorar` muestra `Lujan, Buenos Aires, Buenos Aires` (provincia duplicada) |
| Teléfono | NO aparece como texto | `<teléfono del complejo>` | - | botón WhatsApp `wa.me/<mismo número con el 9>` (consistente, agrega el 9) |
| Geo | - | -34.5588617, -59.0924725 (7 decimales) | - | "Cómo llegar" usa las mismas coordenadas |
| Horarios | L-V 08:00-01:00, Sáb 08:00-22:00, Dom 17:00-22:00 | iguales (cierre 01:00 con closes < opens, válido según la doc de Google) | - | - |

### Complejo Evardss

| Campo | Visible | JSON-LD | Meta / OG | Otro |
|---|---|---|---|---|
| Nombre | `Complejo Evardss` | igual | title `Complejo Evardss · TurnoGol` | - |
| Dirección | `Mitre 2064, Lujan` | `Mitre 2064` / `Lujan` / `Buenos Aires` | description `...Complejo Evardss, Lujan.` (sin provincia) | `/explorar`: `Lujan, Buenos Aires` |
| Teléfono | no visible | `<teléfono del complejo>` (sin el 9 de móvil) | - | `wa.me/<mismo número con el 9>` (con el 9) |
| Geo | - | -34.5729662, -59.1000483 | - | - |
| Horarios | todos los días 08:00-00:00 | `closes: 23:59` (`src/lib/seo/structured-data.ts:30` convierte 00:00 en 23:59; lo visible dice 00:00) | - | - |

Contaminación de NAP: el pie de TODAS las fichas lleva el WhatsApp de TurnoGol (`wa.me/5492323346976`, en `aria-label`/`title`), o sea un segundo teléfono en el HTML de cada ficha.

## 4. Datos que parecen de prueba o mal cargados (solo reportados)

El Vagón Deportivo (cliente real):
- Nombre con **espacio final** y "vagón" en minúscula inicial (el resto del nombre en mayúscula).
- Dirección toda en minúscula: `almafuerte 2156`.
- `city = "Lujan, Buenos Aires"`: la provincia está pegada a la ciudad y además existe `province = "Buenos Aires"` (de ahí "Lujan, Buenos Aires, Buenos Aires" en `/explorar`).
- "Lujan" sin tilde (la localidad es Luján). Igual en Evardss.
- Sin `description`, sin amenities, sin fotos de cancha (solo portada). 5 canchas, F5 y F7.

Complejo Evardss (prueba o real: no se puede saber desde afuera):
- Nombre "Complejo Evardss" (palabra sin significado evidente, parece typo o apellido).
- 1 cancha F5, `$ 60.000 el turno` / `$ 6.000 por jugador` en `/explorar`.
- Horario 08:00-00:00 los 7 días (parece el default del onboarding).
- Teléfono con prefijo 11 (AMBA) pero ciudad Luján (2323).
- Sin portada ni descripción: la imagen OG y la `image` del JSON-LD son la genérica de TurnoGol.
- `lastmod` en el sitemap 2026-10-31 (tocada hace 2 días). Indexable, prioridad 0.9 en el sitemap, listada en `/explorar` (pasó `onboarding_completed` + `marketplace_visible`, `src/modules/tenants/sitemap.service.ts`).

## 5. Checklist de señales GBP en la ficha

| Señal | Estado |
|---|---|
| Canónica limpia, 200, indexable (sin meta robots), en sitemap | Detectado |
| `www` -> apex 308; slug inexistente -> 404 real | Detectado (`[slug]/layout.tsx`) |
| "Cómo llegar" a Google Maps | Detectado, pero por coordenadas (`ComplexHero.tsx:58-61,117`): abre un pin sin la tarjeta del negocio |
| Link al perfil de Google / place_id / `sameAs` / `hasMap` | Falta (no hay columna en `tenants`, `public.service.ts:376-396`) |
| Embed de Maps | Falta (la CSP lo bloquearía) |
| Reseñas visibles / aggregateRating | Falta (0 reseñas) |
| Fotos | Solo portada en El Vagón; Evardss ninguna. Las canchas sin foto no se muestran |
| Atribución GBP -> ficha | Falta: `track.funnel('profile.viewed', { tenantId, withDate })` (`(perfil)/actions.ts`) no guarda origen ni UTM |
| Confirmar que el complejo tiene GBP | No evaluable sin herramientas pagas ni acceso |

¿Lista para ser el link del perfil de Google? **Técnicamente casi sí** (URL estable: `generateSlug` no cambia en edición, canónica limpia). Antes de pegarla en el GBP conviene resolver H1, H2 y H9 (title con ciudad, nombre/NAP prolijos, UTM para medir). Link sugerido: `https://turnogol.app/<slug>?utm_source=google&utm_medium=organic&utm_campaign=gbp` (la canónica es limpia y la página no lee searchParams, así que no rompe el ISR).

## 6. Snapshot de reseñas

- El Vagón: 0 reseñas en la ficha (la sección no se monta con `total = 0`, `ProfileRest.tsx:110`; el rating del hero tampoco, `ComplexHero.tsx:109`). Evardss: igual.
- No hay rating, conteo, velocidad ni tasa de respuesta que informar; no se inventó nada. Las reseñas de Google del complejo (donde está el peso local) no son visibles desde acá.
- Infraestructura: reseñas verificadas (atadas a un turno jugado) y anónimas (Ley 25.326). "Dejar una reseña" apunta a `/mis-reservas?tab=historial` (`ReviewsSection.tsx:100-106`); el único disparador es que el jugador abra su historial, sin pedido proactivo (coherente con el veto de recordatorios por WhatsApp).
- Cuando haya reseñas, `aggregateRating` no sale en el schema (H7).

## 7. Citaciones (Tier 1)

No evaluadas: Yelp/BBB no aplican a Argentina y no hubo `site:` ni DataForSEO en esta corrida. Fuentes relevantes para complejos de fútbol en AR: Google Maps/GBP, Facebook e Instagram del complejo, Páginas Amarillas AR, Apple Business Connect, Foursquare y marketplaces de la competencia (Alquila Tu Cancha, ATC Sports, Turnito). Estado: **sin verificar**.

## 8. Calidad de la ficha como página local

- Texto total del body, con todo el chrome (nav, pie, horarios): **73 palabras** (El Vagón) y **68** (Evardss).
- Contenido propio: nombre, dirección, conteo de canchas/formatos y 7 líneas de horarios. `description` es `null` en ambas, así que no hay ni párrafo (`ComplexDetails.tsx:21-23`).
- Test de swap (cambiar nombre, dirección y horarios): las dos fichas son prácticamente intercambiables.
- Las canchas sin foto no se listan (`ProfileRest.tsx:45-49,56`): El Vagón dice "5 canchas · Fútbol 5 y 7" pero el HTML no trae nombre, superficie ni techado de ninguna. Disponibilidad y precios cargan por JS (`ReserveSection`; en el HTML queda un `<template>` de bailout).
- Enlaces: `/explorar` -> ficha con `<h3><a href="/slug">` rastreable; ambas en el sitemap; la **home no enlaza a ninguna ficha** (0 apariciones de los slugs en su HTML); ficha -> `/explorar` solo por la navegación global y un BreadcrumbList sin breadcrumb visible; sin enlaces entre fichas hermanas (las dos son de Luján). Profundidad: home -> /explorar -> ficha = 2 clics.
- `/explorar` canoniza todo (filtros y `?city=`) a `/explorar`: no existe una página indexable "canchas de fútbol en Luján". Con 2 complejos no conviene crear páginas de ciudad todavía (serían delgadas); hoy la ficha es la única página con ciudad.

## 9. Validación de schema (SportsActivityLocation)

Fuente: `src/lib/seo/structured-data.ts:34-65`, montado en `page.tsx:73-82`.

| Propiedad | Estado |
|---|---|
| `@type` SportsActivityLocation | OK |
| `name`, `address` (street, locality, region, country) | Presentes, con datos sucios; **sin `postalCode`** |
| `geo` | OK, 7 decimales (mínimo 5) |
| `openingHoursSpecification` | OK; cierre pasada la medianoche en una sola entrada, como documenta Google |
| `telephone` | Presente; Evardss, teléfono sin el 9 de móvil (el wa.me sí lo lleva): verificar |
| `url`, `@id`, `image` | OK; en Evardss `image` cae a la OG genérica de TurnoGol (`structured-data.ts:36`) |
| `description` | Ausente (null en ambas) |
| `aggregateRating` / `review` | Ausentes. Google lo recomienda "solo para sitios que capturan reseñas sobre otros negocios locales": TurnoGol califica. Hoy hay 0 reseñas, no hay nada que emitir |
| `priceRange`, `sameAs`, `hasMap`, `amenityFeature`, `potentialAction` | Ausentes |
| BreadcrumbList | Presente, sin breadcrumb visible |

## 10. Hallazgos

### H1 - ALTA - Title, meta y H1 sin ciudad ni "canchas de fútbol"
- Evidencia: `<title>El vagón Deportivo  · TurnoGol</title>`; description `Reservá una cancha en El vagón Deportivo , Lujan, Buenos Aires.` (Evardss: `...Complejo Evardss, Lujan.`, sin provincia). H1 = solo el nombre. `og:title` = solo el nombre. Ninguna señal para "canchas de fútbol en Luján".
- Causa: `src/app/(public)/[slug]/(perfil)/page.tsx:133-138` (`title: tenant.name`, descripción genérica o `tenant.description`); el template `%s · TurnoGol` está en `src/app/layout.tsx:33`; H1 en `ComplexHero.tsx:88-96` y línea de datos en `:63-68`.
- Fix: en `generateMetadata` (`page.tsx:121-139`) componer `"{Nombre}: canchas de fútbol 5 y 7 en {Ciudad}"` (los formatos salen de `getPublicCourtCards(tenant)`, que la page ya usa; el ISR absorbe el costo) y una description con formato, ciudad, rango de horarios y "Reservá online". Mantener H1 = nombre y sumar la palabra clave en la línea de datos (`ComplexHero.tsx:100`, p. ej. "Canchas de fútbol 5 y 7 · 5 canchas"). Poner el armado del texto en un helper de `src/lib/seo`, no en `src/app`.
- Cómo sabríamos que falló: `curl -s https://turnogol.app/<slug> | grep -o '<title>[^<]*'` sin "fútbol" ni ciudad; en Search Console, consultas "canchas de fútbol <ciudad>" sin impresiones a la URL de la ficha.

### H2 - ALTA - Dato sin normalizar se propaga a title, schema, WhatsApp, `/explorar` y al filtro de ciudades
- Evidencia: sección 4. `city` incluye la provincia, nombre con espacio final, dirección en minúscula, "Lujan" sin tilde. En `/explorar`: tarjeta "Lujan, Buenos Aires, Buenos Aires" y selector de localidad con valores distintos para la misma ciudad ("Lujan" de Evardss vs "Lujan, Buenos Aires" de El Vagón), porque `listPublicCities` agrupa por `city, province` (`src/modules/tenants/search.service.ts:336-355`) y el filtro es por igualdad exacta (comentario en `tenant.schema.ts:110`).
- Causa: `src/modules/tenants/tenant.schema.ts:5-8`: `name`, `address`, `city`, `province` sin `.trim()`, sin colapso de espacios y sin validar que `city` no lleve coma. Además el nombre no se edita desde `/settings/perfil` (`tenantLocationSchema` lo excluye por el slug, `tenant.schema.ts:106-120`), así que el dueño no puede corregirlo solo.
- Fix: (a) `.trim()` + normalización de espacios y rechazo de coma en `city` en el schema; (b) corregir los datos por vía dueño/super-admin (esta auditoría no los toca); (c) de-duplicar provincia al renderizar (`ComplexHero.tsx:97-99` y TenantCard de `/explorar`).
- Cómo sabríamos que falló: consulta de lectura sobre `tenants` con `name <> btrim(name)` o `city LIKE '%,%'`; en `/explorar`, dos entradas para la misma ciudad en el selector.

### H3 - ALTA (latente) - robots.txt por prefijo bloquea fichas cuyo slug empieza como una ruta del panel
- Evidencia: `src/app/robots.ts:12-60` usa `Disallow` sin anclaje para `/canchas`, `/caja`, `/staff`, `/torneos`, `/reservas`, `/settings`, `/perfil`, `/dashboard`, `/grilla`, `/jugadores`, `/metricas`, `/deudas`, `/reportes`, `/analiticas`, `/abonados`, `/verify`, `/login`, `/register`, `/onboarding`, `/ingresar`, `/mock-mp`. Simulando la regla de coincidencia más larga de Google sobre el `robots.txt` de producción: `/canchas-los-pinos`, `/torneos-del-sur`, `/reservas-san-justo`, `/jugadores-unidos`, `/caja-negra-futbol`, `/grilla-fc` quedan **bloqueados** (`Allow: /` mide 1 carácter y pierde). Las dos fichas actuales no se ven afectadas.
- Causa: `RESERVED_SLUGS` (`src/modules/tenants/tenant.utils.ts:39-79`) solo impide la igualdad exacta; `generateSlug` (`:101-112`) arma el slug desde el nombre y "Canchas ..." es un nombre muy probable para un complejo. El equipo ya vio el problema en un caso: `'/rival$'` (`robots.ts:42`), pero el `robots.txt` de producción todavía muestra `/rival/` (la rama local está adelantada).
- Fix: anclar con `$` las reglas desnudas que son rutas exactas y dejar `/ruta/` para los hijos (`/canchas$` + `/canchas/`), igual que `/rival$`; agregar un test que, por cada `RESERVED_SLUGS` + sufijo `-x`, verifique que NO se bloquea (`tests/unit/robots-route.test.ts` hoy solo cubre el caso rival).
- Cómo sabríamos que falló: Search Console -> Indexación de páginas -> "Bloqueada por robots.txt" para una ficha nueva con ese prefijo; el test propuesto en rojo.

### H4 - ALTA - Ficha casi toda plantilla: sin descripción y sin contenido por cancha en el HTML
- Evidencia: 73/68 palabras de body (con chrome). `description` null en ambas. El Vagón: "5 canchas · Fútbol 5 y 7" sin lista de canchas porque ninguna tiene foto.
- Causa: `ProfileRest.tsx:45-49` solo arma `tiles` con canchas que tienen `photos[0]`; `ComplexDetails.tsx:21-23` solo pinta la descripción si existe.
- Fix: listar todas las canchas como texto (nombre, formato, superficie, techada/descubierta), con o sin foto: es contenido único que ya está en la base y se parece a las "páginas de servicio" que Whitespark 2026 ubica como factor #1 orgánico local. Si no hay `description`, un párrafo generado solo con datos reales (ciudad, formatos, superficie, servicios). Sin texto de marketing inventado ni cifras.
- Cómo sabríamos que falló: body < ~150 palabras tras el cambio; la prueba de swap (cambiar nombre y dirección) sigue dando una página equivalente.

### H5 - MEDIA - El contenido principal llega dentro de `<div hidden id="S:0">`
- Evidencia: en el HTML crudo el `<main>` trae solo un skeleton `aria-busy` y un `<template id="B:0">`; el `<h1>`, la dirección y los horarios están en `<div hidden id="S:0">`, que un script inline reubica. Verificado sin JS en ambas fichas y en `/explorar` (tarjetas en `S:1`).
- Causa: `src/app/(public)/[slug]/(perfil)/loading.tsx` mete un `<Suspense>` sobre la page. El motivo está documentado (evitar soft-404 en rutas hermanas, `loading.tsx:4-9` y `[slug]/layout.tsx:5-28`), pero `[slug]/layout.tsx` ya hace el gate de existencia fuera del boundary, así que ese `loading.tsx` quizá ya no es necesario para el 404 de la ficha.
- Impacto: Googlebot renderiza JS y lo ve. Los rastreadores de IA que no ejecutan JS, o las herramientas que descartan nodos `hidden`, pueden quedarse con el skeleton. `<title>` y JSON-LD sí están fuera de `hidden` y hoy son la señal más robusta.
- Fix (a validar, no asegurado): probar una build sin `(perfil)/loading.tsx` y comprobar que (1) `/slug-inexistente` sigue devolviendo 404 y (2) el HTML crudo trae el `<h1>` fuera de `hidden`. Si no, aceptar la dependencia de JSON-LD + title.
- Cómo sabríamos que falló: `curl -s <ficha> | grep -c 'id="S:'` > 0 y el `<h1>` aparece solo después de `hidden`.

### H6 - MEDIA - Teléfono del complejo no visible como texto; segundo teléfono (TurnoGol) en cada ficha
- Evidencia: el número solo está en el JSON-LD y en el `href` de `wa.me` (el botón dice "WhatsApp" o "Llamar"). El pie global lleva `+54 9 2323 34-6976` (TurnoGol).
- Causa: `ComplexHero.tsx:125-137` muestra WhatsApp o Llamar, nunca el número; `ComplexDetails.tsx` no tiene bloque de contacto.
- Fix: bloque "Contacto" con dirección y teléfono en texto (`tel:`), para que el NAP visible coincida con el del GBP y el JSON-LD. Normalizar el teléfono al guardar (E.164 con el 9 de móvil).
- Cómo sabríamos que falló: el teléfono del complejo no está en el texto extraído de la ficha; un extractor de entidades devuelve el número de TurnoGol.

### H7 - MEDIA - Schema: faltantes y un valor engañoso
- Evidencia/causa en `src/lib/seo/structured-data.ts`: `image` cae a la OG genérica de TurnoGol (`:36`, visto en Evardss); no hay `aggregateRating` y `page.tsx:75` llama `buildLocalBusiness(tenant)` sin el `summary` que ya calculó en `:60-61`; no hay `postalCode` (la columna no existe); `closes` 00:00 -> `23:59` (`:30`) no coincide con lo visible.
- Fix: omitir `image` si no hay portada (mejor nada que la marca equivocada); con `summary.count > 0` emitir `aggregateRating` con `ratingValue` y `reviewCount` reales y nunca antes; hacer coherente el cierre 00:00; `description` y `sameAs` cuando haya dato (ver REQUIERE INPUT 1 y 4).
- Cómo sabríamos que falló: Rich Results Test / validador schema.org sobre la ficha; con una reseña real cargada, el JSON-LD sigue sin `aggregateRating`.

### H8 - MEDIA - Evardss parece cuenta de prueba pero es indexable y está en el sitemap
- Evidencia: sección 4; prioridad 0.9 en el sitemap y listada en `/explorar`.
- Riesgo: una ficha delgada o falsa bajo el mismo dominio resta calidad y se ofrece a jugadores reales; si es un cliente real, igual perjudican el typo en el nombre y el horario default.
- Acción: ver REQUIERE INPUT 2. No se modificó nada.
- Cómo sabríamos que falló: la URL aparece en Google o en `/explorar` sin un complejo operando.

### H9 - MEDIA - Sin atribución y link de Maps sin identidad del negocio
- Evidencia: `profile.viewed` guarda solo `tenantId` y `withDate` (`(perfil)/actions.ts`). "Cómo llegar" usa `query=lat,lng` (`ComplexHero.tsx:58-61,117`).
- Fix: registrar `utm_source`/referrer en el evento (cliente, sin romper el ISR); usar `query=<nombre + dirección>` o `query_place_id` cuando exista (REQUIERE INPUT 1).
- Cómo sabríamos que falló: no se pueden separar las visitas desde GBP en el embudo; "Cómo llegar" abre un pin sin ficha de negocio.

### H10 - BAJA - Enlazado y detalles
- La home no enlaza a las fichas; no hay enlaces entre fichas hermanas; BreadcrumbList sin breadcrumb visible; alt de portada genérico (`Portada de {nombre}`, `ComplexHero.tsx:76`); `lang="es"` en vez de `es-AR` (`src/app/layout.tsx:65`; `og:locale` sí es `es_AR`); `llms.txt` no lista las fichas.
- Cómo sabríamos que falló: 0 enlaces a fichas en el HTML de la home; fichas huérfanas fuera de `/explorar` y el sitemap.

## 11. Top 10 acciones (Crítica > Alta > Media > Baja)

1. (Alta) Title/description/línea de datos con ciudad + "canchas de fútbol" + formatos (H1). `page.tsx:121-139`, `ComplexHero.tsx:100`.
2. (Alta) Normalizar nombre/dirección/ciudad al guardar y de-duplicar provincia al mostrar (`tenant.schema.ts:5-8`); corregir los datos de El Vagón por vía dueño/super-admin (H2).
3. (Alta) Anclar con `$` las reglas desnudas de `robots.ts` y testear contra `RESERVED_SLUGS` + sufijo (H3).
4. (Alta) Listar todas las canchas como texto y generar un párrafo con datos reales (H4, `ProfileRest.tsx:45-56`).
5. (Media) Probar quitar `(perfil)/loading.tsx` para sacar el contenido de `hidden`, verificando el 404 antes y después (H5).
6. (Media) Mostrar el teléfono del complejo como texto y normalizarlo a E.164 con el 9 (H6).
7. (Media) Schema: `aggregateRating` con datos reales cuando existan, omitir `image` genérica, `postalCode`/`sameAs` cuando haya dato (H7).
8. (Media) Decidir qué hacer con Evardss y ocultarla del sitemap y de `/explorar` si es de prueba (H8).
9. (Media) UTM/referrer en `profile.viewed` y link del GBP como "Reservar" con `utm_campaign=gbp` (H9).
10. (Baja) Enlazar fichas desde la home o por ciudad cuando haya 3+ complejos en una ciudad; `lang="es-AR"`; listar fichas en `llms.txt` (H10).

## 12. REQUIERE INPUT (decisiones de negocio, no aplicadas)

1. ¿Agregamos un campo opcional "Link de Google Maps de tu complejo" en `/settings/perfil`? Alimentaría "Cómo llegar" (place_id), `sameAs` y `hasMap`. Choca con "nada de configurabilidad por las dudas": hay que decidirlo.
2. Evardss: ¿es una cuenta de prueba? Si sí, ¿la sacamos de `marketplace_visible` y del sitemap, o la dejamos?
3. El nombre no se edita desde `/settings/perfil` (arrastra el slug): ¿quién corrige el espacio final y la mayúscula de "El vagón Deportivo"? ¿Se cambia el slug o solo el `name`?
4. La `description` la escribe el dueño: ¿se pide en el onboarding (obligatoria u opcional) o se genera un texto base con datos de las canchas?

## 13. Limitaciones

- No se evaluó el GBP real de ningún complejo, ni reseñas de Google, proximidad o local pack: requieren DataForSEO u otro dato de pago, o acceso a los perfiles.
- Citaciones sin verificar (sin `site:` ni APIs).
- Se auditó el HTML de producción servido sin JS (curl); el render con JS no se midió. Disponibilidad y precios cargan por JS y no se vieron.
- La simulación de robots.txt reimplementa a mano la regla de coincidencia más larga de Google; confirmar con la herramienta de robots.txt de Search Console. (El parser `urllib.robotparser` de Python aplica la primera regla del archivo y da todo permitido: no es representativo de Google.)
- El repo local (`feat/panel-mobile-denso`) puede estar más adelantado que producción (p. ej. `/rival$` en `robots.ts`): el archivo local se cita como causa probable, no como lo desplegado.
- `RESERVED_SLUGS` y `generateSlug` se verificaron leyendo el código; no se creó ningún complejo de prueba.
- El scratchpad de la sesión es compartido con otras auditorías: archivos HTML de trabajo fueron borrados por otro proceso durante la corrida; los datos citados salen de las capturas hechas antes.
