# Auditoría SEO completa — turnogol.app

**Fecha:** 2026-11-02 · **Herramienta:** claude-seo 2.5.0 (`/seo audit`) · **Alcance:** las 13 URLs del sitemap, más el rastreo de enlaces internos

Este reporte consolida los informes de 12 especialistas. El detalle está en `findings/*.md`, y las 29 capturas en `screenshots/`. El plan para ejecutar está en `ACTION-PLAN.md`.

---

## Resumen ejecutivo

### SEO Health Score: **60 / 100**

| Categoría | Peso | Puntaje | Fuente |
|---|---|---|---|
| Technical SEO | 22% | 64 | `findings/technical.md` |
| Content Quality | 23% | 52 | `findings/content.md` |
| On-Page SEO | 20% | 62 | `findings/content.md` |
| Schema / Structured Data | 10% | 48 | `findings/schema.md` |
| Performance (CWV) | 10% | 80 (lab) | `findings/performance.md` |
| AI Search Readiness | 10% | 53 | `findings/geo.md` (44) + `findings/agentic.md` (72) |
| Images | 5% | 60 | consolidación (sin agente propio) |

El cálculo da 0,22·64 + 0,23·52 + 0,20·62 + 0,10·48 + 0,10·80 + 0,10·53 + 0,05·60 = **59,5**.

Hay puntajes complementarios que no entran en el promedio:
- Fichas locales: 38/100.
- Visual y mobile: 76/100.
- Lighthouse Agentic Browsing: 2/3.
- Backlinks: sin puntaje, porque hay **datos insuficientes**. El dominio tiene 105 días, no figura en Common Crawl y no hay Moz.

**Tipo de negocio detectado:** SaaS B2B, un sistema para complejos de fútbol en Argentina. Tiene un portal B2C donde el jugador reserva y una ficha local por cada complejo. La home le habla al jugador. `/para-complejos` y `/precios` le venden al dueño.

### Los 5 problemas más graves

1. **🔴 Las tres páginas editoriales son un riesgo publicado.** Se trata del post del blog, `/vs/alquila-tu-cancha` y `/alternativas-alquila-tu-cancha`.
   - Hay claims sobre competidores sin fuente, algunos contradichos por la propia fuente. ATC dice "sin comisiones" y el texto dice que te deja "atrapado".
   - El CTA lleva al WhatsApp placeholder `wa.me/5491100000000`, confirmado en vivo dos veces.
   - El texto es gris oscuro sobre el fondo `#020617` y casi no se lee.

   Ninguna de las tres cosas frena la indexación. Las clasifico como críticas porque son riesgo legal y de reputación ya publicado, y se arreglan en horas.
2. **La entidad se describe de 6 maneras distintas.** Ninguna página pública clave dice "sistema de gestión para complejos de fútbol": `/para-complejos` se vende como "el sistema de señas". La definición buena está solo en `llms.txt`.
3. **Las fichas y `/explorar` entregan su contenido dentro de `<div hidden>`** por el streaming de `loading.tsx`. Un bot sin JavaScript ve el skeleton: `/explorar` rinde 21 palabras y ningún nombre de complejo.
4. **No hay medición de indexación.** Sin Search Console ni Bing Webmaster no se sabe qué está indexado. Bing ya indexa `/ingresar` y `/register`, que salen 2.º y 8.º para "TurnoGol".
5. **La entidad está rota en los datos estructurados.**
   - `Organization.logo` apunta a `/icon`, que da 404.
   - No hay `@id`, `sameAs`, SoftwareApplication ni Offer.
   - El precio no aparece en ninguna frase que una IA pueda citar.

### Las 5 mejoras rápidas

1. El número real en `content/pages/vs-alquila-tu-cancha.mdx:40`.
2. `logo` → `/icon-512` en `src/lib/seo/structured-data.ts:104`.
3. `ArticleShell.tsx:40,51` con los tokens del layout oscuro y `prose-invert`.
4. `buildMetadata` en las 6 páginas sin canonical, con títulos de 60 caracteres o menos y sin "TurnoGol · TurnoGol".
5. Usar en el hero los AVIF que ya existen (`HeroMobile.tsx:21`, `HeroDesktop.tsx:22`): la home mobile baja unos 700 KB.

---

## Antes de leer: supuestos y límites

- **Todo se observó en producción, el 2026-11-02.** Las citas `archivo:línea` del código se verificaron contra `origin/main`. La rama local `feat/panel-mobile-denso` está 34 commits atrás, y por eso algunos especialistas vieron `'/rival$'` en `robots.ts`. Esa rama no tocó `robots.ts`, así que mergearla no reintroduce el bloqueo.
- **No hay datos de campo.** La performance es de laboratorio (Lighthouse con Lantern), porque PageSpeed Insights dio 429 y no hay CrUX ni Search Console. Las SERP se observaron con WebSearch y Bing, no con Google en Argentina.
- **Esta auditoría repite en gran parte la del 30/10** (`docs/visibilidad-ia/01-auditoria.md`). Cada hallazgo de abajo dice si es **nuevo** o si **sigue vigente**. Ninguno de los hotfix de VIS-006 está desplegado todavía.
- **Una recomendación de SXO se descartó.** Proponía un hub por ciudad (`/canchas/lujan`), y el plan vigente veta las páginas por ciudad sin datos propios (`00-resumen-ejecutivo.md`, "Lo que NO hay que hacer"). Queda anotada en `findings/sxo.md`, fuera del plan.

---

## Technical SEO — 64/100

**Lo que funciona:**
- HTML servido, no SPA. Las páginas de marketing salen prerenderizadas, y la home y las fichas con ISR.
- Los redirects responden 308 y el 404 es real, con `noindex`.
- Están HSTS preload, CSP y X-Frame-Options.
- 18 user-agents de bots de IA y de buscadores reciben 200 con el mismo contenido.
- El sitemap es válido, con 13 URLs, todas 200 e indexables.

| Sev. | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| Alta | Contenido de fichas y `/explorar` dentro de `<div hidden id="S:n">` | `explorar/loading.tsx`, `[slug]/(perfil)/loading.tsx`. Sin JS, `/explorar` rinde 21 palabras | Sigue vigente (T-02) |
| Alta | `Disallow` por prefijo sin ancla: tapa fichas futuras como `/canchas-del-sur` | `origin/main:src/app/robots.ts:24-50`. `RESERVED_SLUGS` solo evita el match exacto | Sigue vigente (T-01) |
| Media | Sin canonical ni `og:url` en 6 URLs, con títulos "… · TurnoGol · TurnoGol" de 75 a 96 caracteres | Plantilla en `layout.tsx:33` más el literal en cada page | Sigue vigente (T-05) |
| Media | `lastmod` falso en 8 URLs. El de las fichas lo mueve hasta el refresh del token de MP | `sitemap.ts:25` (`new Date()`), trigger de `updated_at` | Sigue vigente (T-07). Lo de las fichas es **nuevo** |
| Media | `/ingresar` y `/register` **ya indexadas en Bing**, por estar en Disallow sin noindex | SERP de marca en Bing | **Nuevo**: el riesgo T-08 se materializó |
| Baja | `sitemap.ts:78` hace `.catch(() => [])`: si la DB falla, el sitemap queda sin complejos y nadie se entera | Código | **Nuevo** |
| Baja | Las imágenes OG y Twitter de `/rival` cuelgan de `/rival/`, que está bloqueado | robots.txt en vivo | **Nuevo** |
| Baja | `<html lang="es">` mientras `og:locale` es `es_AR` | `layout.tsx:65` | Sigue vigente (T-04) |

## Content Quality — 52/100

E-E-A-T 41: experiencia 45, expertise 40, autoridad 20, confianza 55.

| Sev. | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| Crítica | Claims de competidores sin fuente o contradichos: "60% de las canchas", ATC "líder indiscutido" y "atrapado", EasyCancha "el más caro", TurnoGol "muy accesible" | `content/**/*.mdx`. Los contradice `docs/gtm/12-guiones-validados-competencia.md:18`, y ATC publica "sin comisiones" | Sigue vigente (C-04/C-05) |
| Crítica | WhatsApp placeholder en el CTA de `/vs` | `vs-alquila-tu-cancha.mdx:40`. El test de `contact.ts` no escanea `.mdx` | Sigue vigente (C-05). El hueco del test es **nuevo** |
| Crítica | Artículos ilegibles | `ArticleShell.tsx:40,51`, `text-gray-900` sobre `#020617` | Sigue vigente (C-06) |
| Alta | Promesas viejas o contradictorias: "cierre diario", retención de 14, 60 o 90 días, "completas a tu MercadoPago", recordatorios en privacidad | `precios/page.tsx:84` y legales | Parte sigue vigente (C-03). Lo de privacidad es **nuevo** |
| Alta | Legales sin titular (razón social, CUIT, domicilio) y con jerga interna (ADR-011, doc5, past_due). `/nosotros` y `/contacto` dan 404 | `/privacidad`, `/terminos` | **Nuevo** lo de los legales. `/nosotros` sigue vigente (E-07) |
| Media | Home de unas 66 palabras, sin definir qué es para el dueño | `src/app/page.tsx`, `home/Hero*.tsx` | Sigue vigente (C-01) |
| Media | Fichas de 60 a 70 palabras, con `description` vacía en ambas | `ProfileRest.tsx` | Sigue vigente (C-09) |

## On-Page SEO — 62/100

| Sev. | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| Alta | Vocabulario B2B distinto al que usa la SERP | `/para-complejos` y `/precios` tienen 0 apariciones de "sistema de reservas", "software" y "gestión". El title es "El sistema de señas…" (`para-complejos/page.tsx:15`) | Sigue vigente (C-02). Lo **nuevo** es la evidencia de SERP |
| Alta | `/vs`, `/alternativas` y `/rival` huérfanas, con 0 enlaces internos en el HTML inicial. La home no enlaza a `/precios`, `/blog` ni a las fichas | Rastreo | Sigue vigente (C-05). `/rival` es **nuevo** |
| Media | En mobile, el H1 visible es un `<p role="heading">` y el `<h1>` real mide 0×0 | `screenshots/home-mobile-fold.png` | **Nuevo** |
| Media | "$30.000 por cancha" solo está en la meta description. El cuerpo muestra el valor por defecto de la calculadora | `/precios` | Sigue vigente (C-03). La parte de "frase citable" es **nueva** |

## Schema y datos estructurados — 48/100

| Sev. | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| Alta | `Organization.logo` → `/icon` da 404, mientras `/icon-512` da 200 | `structured-data.ts:104`, verificado en vivo | Sigue vigente (T-06) |
| Alta | Sin grafo `@id` ni `sameAs`. Organization solo aparece en la home | `findings/schema.md` S-02 | Sigue vigente (E-02) |
| Alta | Sin SoftwareApplication ni Offer, aunque el precio está en el HTML | `/precios`, `/para-complejos` | Sigue vigente (E-02) |
| Media | Article incompleto: `/vs` y `/alternativas` sin `datePublished`, y `addFaqSchema` descartado | `ArticleShell.tsx:17` | Sigue vigente (C-06) |
| Media | Datos sucios en las fichas: "Lujan, Buenos Aires", espacio final, teléfonos no E.164 y `closes` antes que `opens` | `tenant.schema.ts` sin trim | Parte sigue vigente (T-11). E.164 y horario son **nuevos** |
| Info | FAQPage en `/precios`: coincide con lo visible. Desde el 07/05/2026 no da rich result. No hay que sacarlo ni sumar más | — | — |

`findings/schema.md` trae el JSON-LD propuesto, listo para usar.

## Performance — 80/100 (laboratorio)

| Sev. | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| Alta | Hero en PNG de 813 KB en mobile y 1,9 MB en desktop: es el 52% del peso de la home mobile. Los AVIF de 96 y 64 KB existen desde el 18/8 | `HeroMobile.tsx:21`, `HeroDesktop.tsx:22`, `public/bg-hero-*` | **Nuevo**: la auditoría anterior daba performance "Bien" |
| Media | LCP mobile de laboratorio mayor a 2,5 s en home (1,1 a 7,1 s), `/explorar` (4,3 s) y la ficha (4,2 s). Sin throttling da 1,3 a 1,7 s | Lighthouse 13.6 Lantern | **Nuevo** |
| Media | Entre 400 y 485 KB de JS hasta en páginas estáticas. El chunk de Sentry pesa 142 KB | `next.config.ts` configura solo `webpack.treeshake`, que no aplica a Turbopack | **Nuevo** |
| Baja | Unos 20 prefetch `_rsc` al hidratar la home, también de rutas de sesión | Red | **Nuevo**, causa no verificada |

Lo que está bien: TTFB de 130 a 150 ms con HIT en gru1, CLS cerca de 0 y las páginas B2B con LCP de 1,1 a 1,2 s.

## Imágenes — 60/100

- Las 10 páginas no tienen ninguna `<img>` sin `alt`. Las fotos de fichas y `/rival` están en WebP. Hay OG de 1200×630 en todas.
- **Alta:** el fondo del hero, ver Performance.
- **Media:** las páginas B2B (`/para-complejos`, `/precios`, blog y comparativas) no muestran ninguna imagen del producto, así que no hay nada que indexar ni que mostrar en respuestas multimodales.
- **Baja:** Evardss no tiene portada y cae a la imagen genérica.

## AI Search Readiness — 53/100

GEO pesa 44 y agentic 72. Lighthouse Agentic Browsing da 2/3.

| Sev. | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| Alta | Entidad descrita de 6 maneras, sin "gestión" en las páginas clave | `findings/geo.md` G-04 | Sigue vigente (C-10) |
| Alta | Homónimo turnosgol.com.ar, 4.º para "TurnoGol" en Bing, y ningún tercero que nombre a TurnoGol | Listas de Turnito, Clubbi y Clubin verificadas: no lo nombran | Sigue vigente (E-03/E-04) |
| Media | `llms.txt` afirma "sin comisiones ocultas ni retenciones" (:14) y "Eliminación de turnos colgados" (:7). Los enlaces no son Markdown, y esa es la única causa del 2/3 de Lighthouse | `public/llms.txt` | Sigue vigente (C-08). El 2/3 es **nuevo** |
| Baja | La meta description de `/rival` incluye funciones "Próximamente" | `/rival` | **Nuevo** |

**No se ejecutó:** la matriz de user-agents de `agentic_check.py --ua-matrix`, porque exige la autorización explícita del dueño. GEO sí probó 18 UA con requests normales, todos 200.

---

## Complementarios

### Fichas locales — 38/100 (`findings/local.md`)

- NAP, horarios y `SportsActivityLocation` llegan en el HTML.
- Title y H1 no tienen ciudad ni "canchas de fútbol".
- El Vagón tiene datos sin normalizar: "El vagón Deportivo " con espacio final, "almafuerte" en minúscula y "Lujan, Buenos Aires". El dueño no puede editar el nombre desde `/settings/perfil`.
- **Evardss parece un tenant de prueba**: nombre sin sentido, 1 cancha, abierto de 08 a 00 los 7 días, sin portada. Aun así es indexable, está en el sitemap con prioridad 0,9 y aparece en `/explorar`.

### Visual y mobile — 76/100 (`findings/visual.md`)

- No hay overflow horizontal entre 320 y 1440 px, y los inputs miden 16 px.
- A 320 px la hamburguesa del header B2B queda fuera de pantalla (`precios-mobile320-fold.png`).
- La home pide la geolocalización dos veces sin que el usuario toque nada.
- En `/precios` mobile el precio aparece 1,3 pantallas más abajo, y el selector de 1 a 8 deja huérfanos el "7" y el "8".

### Backlinks — datos insuficientes (`findings/backlinks.md`)

- El dominio se registró el 2026-07-20 y no figura en Common Crawl.
- No hay dominios referentes verificados.
- La lista de Turnito enlaza a ATC, EasyCancha, OnDepor y DondeJuego, siempre con `nofollow`. Ahí el valor es la mención, no el PageRank.

### SXO (`findings/sxo.md`)

- En B2B el tipo de página coincide con la SERP (60% son landings), pero el vocabulario no.
- La persona más floja es el **dueño que compara**: 30/100 en `/para-complejos`.
- ATC migró a `atcsports.io`. Publica USD 50, 80 y 100 por mes (2026-11-02).

### Clusters (`findings/cluster.md`)

- Hub en `/para-complejos`, con 5 clusters y 17 páginas que reutilizan las URLs de `02-estrategia.md` §4.
- Solo un agrupamiento está respaldado por la SERP: "alternativas a ATC". El resto se sostiene por intención, porque WebSearch no es Google AR.

---

## Síntesis: qué conecta con qué

1. **Un mismo problema detrás de 5 hallazgos.** Los claims sin fuente, el WhatsApp placeholder, el texto ilegible, la falta de canonical, el título duplicado, el Article incompleto y las páginas huérfanas caen **en las mismas 3 URLs editoriales**. La salida no son 7 tareas sino 2: un hotfix ahora y el reemplazo por comparativas con fuente y 301 en la Etapa 2.
2. **La definición de la entidad es la restricción de mayor palanca.** De ella dependen GEO, SXO, cluster, content y schema. Mientras `/para-complejos` diga "sistema de señas", ni el schema, ni los perfiles externos, ni las comparativas pueden repetir una frase que el sitio no dice. **Es el desbloqueador del plan.**
3. **El streaming oculto** explica a la vez el contenido delgado de las fichas para las IAs (content), el skeleton (visual) y la baja extracción (agentic). Hay una sola causa: `loading.tsx`.
4. **Medir va antes que optimizar.** Sin Search Console, ninguna recomendación de la Fase 2 en adelante se puede falsar. Por eso va en la Fase 1, aunque no mueva nada por sí sola.

## Lo que esta auditoría no pudo medir

- La indexación real en Google, las impresiones y las consultas: falta Search Console.
- CWV de campo e INP real: faltan CrUX y RUM.
- Backlinks y menciones reales: falta Moz o Bing Webmaster.
- Visibilidad en ChatGPT, Perplexity y Copilot: hay un protocolo en `06-medicion.md`, sin correr.
- El estado del firewall de Vercel (AI Bots y Bot Protection): solo se ve desde el dashboard.

**La próxima auditoría tiene que mirar:**
- Si Search Console ya tiene `/para-complejos` con impresiones para "sistema de reservas canchas de fútbol".
- Si `/ingresar` y `/register` salieron del índice de Bing.
- Si las fichas sin JS ya muestran el H1 y la dirección.
- Comparar contra el baseline con `/seo drift compare https://turnogol.app`.
