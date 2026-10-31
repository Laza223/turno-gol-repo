# 01 — Auditoría de visibilidad (repo + sitio en vivo)

**Fecha:** 2026-10-31.

**Base:**
- El código se leyó de `origin/main`. Producción corre ese mismo commit: deploy de Vercel `cfe96be3`, verificado con la API de Vercel y comparando `llms.txt` y `robots.txt` byte a byte.
- Los números de línea son de `origin/main`. La rama local `feat/panel-mobile-denso` está atrasada y tiene cambios sin commitear.

**Qué se hizo:** cuatro relevamientos de solo lectura (código técnico, copy y docs, competencia, inventario de producto). Además, prod se trajo sin JavaScript con `curl` y siete user-agents.

Etiquetas de esfuerzo: **[S]** hasta 2 h · **[M]** hasta 1 día · **[L]** más de 1 día.

---

## 0. Premisas del prompt que no coinciden con la realidad

| Premisa | Realidad verificada | Evidencia |
|---|---|---|
| Next.js 14 | Next.js 16 (App Router, Turbopack) | `CLAUDE.md`, `package.json` |
| Imágenes en Supabase Storage | Cloudflare R2 | `src/shared/storage/r2.ts` |
| Existe el informe "Visibilidad en buscadores e IA TurnoGol.md" en esta carpeta | No existe ni en el repo ni en Descargas, Escritorio o Documentos. Las cifras de la investigación se citan con la fuente que nombra el prompt y se marcan como no re-verificadas, salvo las que re-verifiqué (§6) | `Test-Path` |
| Existe `.harness/` | No existe, así que no hay puntero que dejar | `Test-Path` |
| Planes Predio, Complejo y Estadio | Están obsoletos. Vigente: **$30.000 por cancha incluida la primera**, anual con 10% off ($27.000 por cancha como equivalente mensual, $324.000 por cancha por año). Extra: TurnoGol Plus a $20.000 por cancha | `docs/decisions/2026-10-20-precio-uniforme-por-cancha.md`, `docs/decisions/2026-10-22-cobro-turnogol-plus.md`, `src/app/(business)/precios/plans-data.ts:8-12`, `pricing.ts:26-27` |
| Hosting probablemente Vercel, quizás detrás de Cloudflare | Vercel, región `gru1`, **sin Cloudflare como proxy**: ninguna respuesta trae `cf-ray` y todas dicen `Server: Vercel` | `curl -sI https://turnogol.app/` |
| Clubo es "el más fuerte" | No aparece ni dominio ni producto en tres búsquedas | Ver `02-estrategia.md` §6 |
| Docs de estrategia de contenido en `docs/marketing/` | La carpeta no existe, aunque la citan `docs/gtm/09-contenido.md:39` y `docs/gtm/10-playbook-ia.md` | `git ls-files` |
| En /explorar, la tarjeta de Evardss usa el alt y el link de El Vagón | No se reproduce en el HTML crudo, en el DOM hidratado ni con un clic real. El alt, el link y el título salen del mismo objeto `tenant` (`TenantCard.tsx:45-54`). Probablemente sea un artefacto del snapshot de accesibilidad o del streaming oculto (§1, fila T-02) | Relevamiento técnico |

---

## 1. Técnico

| Archivo o URL | Problema | Solución propuesta |
|---|---|---|
| `src/app/robots.ts:28-51` | **T-01.** Los `Disallow` son por prefijo (`/canchas`, `/torneos`, `/staff`, `/perfil`, `/login`, `/caja`, `/reservas`, `/settings`, `/dashboard`, `/verify`…). Bloquean cualquier ficha cuyo slug empiece igual (por ejemplo "Canchas El Potrero" → `/canchas-el-potrero`). Los slugs reservados que se sufijan `-futbol` (`caja-futbol`, `dashboard-futbol`) caen siempre en un prefijo bloqueado. Hoy no afecta a los 2 complejos. | Cerrar cada regla con barra final o con `$` (`Disallow: /caja/` y `Disallow: /caja$`) y cubrirlo con un test que genere slugs de prueba contra `robots()`. **[S]** |
| `src/app/(public)/explorar/loading.tsx`, `src/app/(public)/[slug]/(perfil)/loading.tsx` | **T-02.** En el HTML crudo de `/explorar` y de las fichas, el `<h1>` y el contenido real llegan dentro de `<div hidden id="S:n">` (streaming), y lo visible es el skeleton (25 a 49 elementos `.skeleton`). Googlebot lo resuelve al renderizar. GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot y los fetchers de usuario no ejecutan JS: reciben un skeleton. | Sacar el `loading.tsx` de la ficha o mover el Suspense para que el H1, la dirección, los horarios y los servicios salgan en el HTML inicial, y dejar el streaming solo para la disponibilidad. Ojo con el gotcha conocido: `loading.tsx` convierte `notFound()` en soft-404 (ver memoria "loading.tsx y notFound"). El gate de existencia vive en `[slug]/layout.tsx:29-37` y se conserva. **[M]** |
| `/explorar` (`page.tsx:58-68`) | **T-03.** Es dinámica, con `Cache-Control: private, no-cache, no-store` (por `searchParams` + `extractAuthUser`). Cada visita de un bot pega en el servidor y no hay caché en el CDN. | Separar la sesión del render (que la sesión hidrate en el cliente) para que la página sin filtros sea ISR. **[M]** |
| `src/app/layout.tsx:65` | **T-04.** `<html lang="es">`, mientras el manifest dice `es-AR` y `og:locale` es `es_AR`. | `lang="es-AR"`. **[S]** |
| `src/app/(business)/blog/page.tsx:4-7`, `blog/[slug]/page.tsx:22`, `vs/alquila-tu-cancha/page.tsx:12`, `privacidad`, `terminos` | **T-05.** No tienen canonical ni `og:url`, porque usan metadata plana en vez de `buildMetadata` (`src/lib/seo/metadata.ts`). El título queda "… \| TurnoGol · TurnoGol": la página pone la marca a mano y el template del layout (`layout.tsx:33`) la agrega de nuevo. `/precios` también la duplica. Los títulos del blog llegan a unos 95 caracteres. | Pasar todo por `buildMetadata`, usar `title.absolute` donde corresponda y dejar los títulos en 60 caracteres o menos. **[S]** |
| `src/lib/seo/structured-data.ts:104` | **T-06.** El `logo` de Organization apunta a `absoluteUrl('/icon')`, que en prod devuelve **404** (los que existen son `/icon.png`, `/apple-icon.png` y `/favicon.ico`). | Apuntar a un PNG cuadrado de 112 px o más que exista. Validar con el Rich Results Test. **[S]** |
| `src/app/sitemap.ts:25-43` | **T-07.** Las 8 URLs estáticas usan `lastModified: new Date()`, así que todas muestran la hora del último build (`2026-10-31T01:26:35Z`). El contenido sí usa fechas reales. | Una fecha real por página: constante en el archivo de la página o `git log -1 --format=%cI` en el build. Nunca `now`. **[S]** |
| `/login`, `/register`, `/ingresar`, `/forgot-password`, `/mis-reservas`, `/reserva/*/exito`, `/index` | **T-08.** Devuelven 200 sin `noindex` ni `X-Robots-Tag`, solo con `Disallow`, y se enlazan desde todo el sitio. Riesgo: "Indexada, aunque bloqueada por robots.txt". `/index` es un duplicado de la home con 200. | Agregar `robots: { index: false }` en la metadata de `(auth)` y `(player)` y en `reserva/*`. Redirigir `/index` → `/` con 308. Sacar esas rutas del `Disallow` para que el bot pueda leer el noindex. **[S]** |
| Sin IndexNow | **T-09.** Bing, Yandex y Copilot se enteran de los cambios recién cuando recrawlean. | Agregar el archivo de clave en `public/` y un POST a `api.indexnow.org` en el deploy de producción (script en `scripts/` disparado por el workflow de deploy, o por un route handler con un secreto). Gratis. **[S]** |
| `src/modules/tenants/tenant.utils.ts:39-99` (`RESERVED_SLUGS`) | **T-10.** Faltan las rutas de marketing futuras (`nosotros`, `funciones`, `comparar`, `alternativas`, `guias`, `integraciones`, `herramientas`, `ayuda`, `cambios`, `para`, `contacto`, `faq`), las técnicas (`monitoring`, `icon`, `apple-icon`, `opengraph-image`) y los redirects (`privacy`, `terms`). | Sumarlas **antes** de crear cualquier ruta nueva. Antes de reservar, chequear con un SELECT de solo lectura (vía Lázaro) que ningún tenant use ya ese slug. El test de sincronía con `src/app` ya existe. **[S]** |
| `[slug]/(perfil)/page.tsx:121-139` | **T-11.** `generateMetadata` no hace `trim` del nombre. Por eso el title queda "El vagón Deportivo  · TurnoGol" y la description "…Deportivo , Lujan…". | Hacer `trim()` y normalizar espacios en el nombre, en metadata y en el JSON-LD. Hacer `trim` también al guardarlo en la configuración del complejo. **[S]** |
| `src/app/(public)/[slug]/(perfil)/page.tsx:94` (`ReserveSection`) | **T-12.** La disponibilidad se carga 100% en el cliente (`/api/public/availability`). Está bien para turnos en vivo, pero la ficha no dice en HTML qué días y horarios abre el complejo, salvo el bloque de horarios. | Mantenerlo así. Sumar en el HTML una línea estática de "Turnos de 60 min · reservá online las 24 h" junto a los horarios. **[S]** |
| Vercel Firewall | **T-13.** La API devolvió 404 en `get_firewall_config` (sin configuración personalizada), así que no se pudo leer el estado de los rulesets **AI Bots** y **Bot Protection**. Según la documentación de Vercel, AI Bots viene inactivo ("Allow") por defecto. | Lázaro entra al dashboard: Firewall → Bot Management. Deja **AI Bots = Allow** y **Bot Protection = Off**, y saca una captura. **[S]** |
| Prueba de bots | **Bien.** GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Googlebot, Bingbot y curl reciben 200 en `/` y en `/precios`, con el mismo tamaño y `X-Vercel-Cache: HIT`. `middleware.ts` no filtra por user-agent y su `matcher` excluye `/`, `/explorar` y `/[slug]`. Esto solo descarta bloqueos por UA, no por IP. | Ver tarea VIS-005 (pedirle a cada asistente que abra una URL). |
| Redirecciones | **Bien.** `http` → `https`, `www` → apex y la barra final responden 308. Los slugs inexistentes dan 404 real con `noindex`. | Ninguna. |
| Render | **Bien.** `/para-complejos`, `/precios`, el blog, `/vs` y `/alternativas` son estáticas (PRERENDER). `/` y `/[slug]` son ISR 300. El precio y la FAQ de `/precios` están en el HTML crudo, aunque `PlanSelector` sea `'use client'`. | Ninguna. |
| Rendimiento | **Bien.** Usa `next/font` (3 familias, preload), `next/image` y ningún script de terceros. Leaflet carga lazy y solo en la vista de mapa, y Sentry también es lazy. Hay Lighthouse CI con SEO 1.0 como mínimo (`lighthouserc.public.json`). Lo único pesado: `/precios` (118 KB) y `/rival` (146 KB) de HTML, y la home dispara `/api/player/session` en cada visita. | No medí LCP ni INP reales porque no hay RUM: ver A-01. |

---

## 2. Contenido y copy

| Archivo o URL | Problema | Solución propuesta |
|---|---|---|
| `/` (`src/app/page.tsx:14-16`, `HeroDesktop.tsx:74-89`) | **C-01.** Title "TurnoGol — Reservá tu cancha de fútbol al instante", H1 "Tu partido empieza en TurnoGol", unas 90 palabras, sin H2. No dice qué es TurnoGol para un dueño: no aparece "gestión", "sistema" ni "complejo". En desktop, la home no enlaza a `/para-complejos` desde el cuerpo (solo en mobile, `HeroMobile.tsx:113`), y en ningún caso a `/precios`. | Home **híbrida** (decisión de Lázaro, 30/10): el hero del jugador queda igual; la description y una banda corta para dueños abajo del buscador dicen "sistema de gestión para complejos de fútbol". Ver brief en `04-contenidos.md`. **[M]** |
| `/para-complejos` (`page.tsx:15,70-81`) | **C-02.** Title "TurnoGol para complejos — El sistema de señas para canchas de fútbol" (68 caracteres, se trunca). H1 "Chau, reserva de palabra." Unas 500 palabras. No aparecen "gestión", "software", "24/7", "buffet", "sin comisión" ni "fútbol 5/7/11". Choca con `PRODUCT.md:58`: la seña es opcional y nunca va de titular. Vende 1 de las ~35 funciones. | Pasa a ser **la** página del sistema de gestión: H1 y primer párrafo con la frase canónica, secciones por operación (reservas, fijos, cobro por equipo, caja y buffet, faltazos, Plus, RIVAL) y unas 1.500-2.500 palabras. **[M]** |
| `/precios` (`page.tsx:12-13`, `PlanSelector.tsx`, `plans-data.ts:38`) | **C-03.** Los montos son correctos ($30.000, anual con 10% off, muestra el anual). Problemas: (a) "$" sin "ARS"; (b) sin fecha de vigencia; (c) "sin límite de cantidad" junto a un selector de 1 a 8 más un input libre, que confunde a primera vista; (d) "Todas las funciones incluidas" y "Todas las canchas tienen todo", aunque Plus es un extra que no aparece en ninguna página; (e) promete "tus datos quedan disponibles 60 días" (`:84`), mientras la decisión `2026-10-22-solo-lectura-al-vencer-la-prueba.md` dice 14 días de solo lectura y deja la retención como REQUIERE INPUT; (f) dice "cierre diario", y el arqueo y el cierre manual se eliminaron (`.claude/rules/caja.md`); (g) "20 minutos" (`:43`, `:409`) sin medir: L2 lo sacó de `/para-complejos` por eso mismo; (h) "exportás cuando quieras", cuando un complejo bloqueado no exporta. | Agregar "Precios en pesos argentinos (ARS), vigentes desde el DD/MM/2026". Explicar "1 a 8 o escribí cuántas tenés". Plus como línea aparte ("Asistente de WhatsApp con IA: $20.000 por cancha por mes, opcional"). "Todo el sistema incluido" en vez de "todas las funciones". Sacar "60 días", "cierre diario" y "20 minutos". **[S]** |
| `content/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026.mdx` | **C-04.** 419 palabras. Se pone primera ("1. TurnoGol"), sin autor y con la fecha como ISO crudo (`ArticleShell.tsx:47`). Claims sin fuente: "el 60% de las canchas hoy sigue usando esto" (`:39`), ATC "líder indiscutido" (`:22`), "un sistema que se pague solo" (`:50`, prohibido en `06-scripts.md:183`). | Primero despublicar los claims inventados **[S]**. Después reemplazar el post por la guía "Cómo elegir un sistema para tu complejo de fútbol" con 301 (ver `04-contenidos.md`) **[M]**. |
| `content/pages/vs-alquila-tu-cancha.mdx`, `content/pages/alternativas-alquila-tu-cancha.mdx` | **C-05.** 426 y 538 palabras, sin tabla ni precio propio ("cuota fija mensual…", "Muy accesible"), sin fecha visible y huérfanas: nada las enlaza, solo están en el sitemap. Claims riesgosos: EasyCancha "el más caro" (`alternativas:38`), ATC te deja "atrapado" (`vs:21,26`), TurnoGol "muy accesible" (falso con 4-6 canchas, según `docs/gtm/12-guiones-validados-competencia.md:18`). `vs:40` enlaza a **`wa.me/5491100000000`**, un placeholder; el número real es `5492323346976` (`src/lib/contact.ts:18`). | Ya: sacar los claims sin dato y arreglar el wa.me **[S]**. Etapa 2: reemplazar por `/comparar/turnogol-vs-atc-sports` y `/alternativas/atc-sports` con tabla, precios con fuente y fecha y 301 desde las URLs viejas **[L]**. |
| `src/components/site/ArticleShell.tsx:17,24-28,40-49` | **C-06.** `addFaqSchema` llega pero se descarta (`_addFaqSchema`). El Article no tiene `image`, `publisher`, `mainEntityOfPage` ni `dateModified`, y en `/vs` y `/alternativas` falta hasta `datePublished`. Usa `text-gray-900` sobre el layout `#020617`: el blog **es ilegible** (se vio en una captura). | Pasar el shell a los tokens del layout oscuro y completar el Article. FAQPage solo donde la FAQ es visible (no da rich result desde el 07/05/2026, pero ayuda a Bing y desambigua). **[S]** |
| `src/app/(auth)/register/page.tsx:56-74` | **C-07.** El panel lateral promete "Cobros automáticos con MercadoPago" (el cobro automático de fijos **no existe**: `docs/gtm/10-playbook-ia.md`), "Configuración en menos de 2 minutos" (contradice los "20 minutos" de `/precios`; ninguno está medido) y "Tu primera reserva online puede llegar esta semana". | Corregir con OK de Lázaro (L3 dice "no se toca sin OK"): "Cobrás la seña por Mercado Pago, directo a tu cuenta" y sacar los tiempos. **[S]** |
| `public/llms.txt` | **C-08.** Igual a main. No tiene precio, prueba de 30 días, resumen en blockquote ni enlaces a `/precios` o `/blog`. Nombra competidores ("ATC Sports, Turnito"). Hay una versión con enlaces markdown sin commitear en la rama `chore/llms-txt-enlaces` (worktree `bing-wt`). | Reescribirlo con la frase canónica, el precio en ARS con vigencia, las funciones (A) y los enlaces. Es higiene: no está demostrado que mueva citas. **[S]** |
| Fichas `/[slug]` (`ComplexHero.tsx`, `ComplexDetails.tsx`, `ProfileRest.tsx`) | **C-09.** Muestran dirección, link a Maps, canchas y formatos, fotos, horarios, servicios, WhatsApp y reseñas. Faltan: (a) la política de seña y cancelación, que solo aparece en `/[slug]/reservar`, que es noindex; (b) un pie "Reservas con TurnoGol"; (c) la palabra "buffet" o "cantina" (el servicio se llama "bar"). Unas 70 palabras visibles. Un trial abandonado responde indexable por URL directa (`getPublicTenant` filtra solo por slug, `public.service.ts:365-401`). | Sumar el bloque "Cómo se reserva acá" (seña sí/no y %, cuándo se libera, cancelación) y el pie con enlace a `/para-complejos`. Poner `noindex` si no completó el onboarding o si `marketplace_visible=false`. **[M]** |
| Consistencia del descriptor | **C-10.** La categoría se nombra distinto según la superficie: "La plataforma de reservas para el fútbol argentino" (`opengraph-image.tsx:7,65`; "plataforma" está vetado en `docs/gtm/03-posicionamiento.md:44`), "Sistema de reservas online y gestión para complejos de fútbol" (`layout.tsx:34`), "El sistema de señas…" (`/para-complejos`), "sistema de reservas y gestión" (`llms.txt:4`). | Una sola frase en todas las superficies: "Sistema de gestión para complejos de fútbol" (ver `02-estrategia.md` §1). **[S]** |
| Marca | **Bien.** "Turno Gol" y "Turnogol" no aparecen en `src/` ni en `content/`. `turnogol.com` solo aparece en dos comentarios. | Mantenerlo. Grep de `turnogol\.com` antes de cada commit con URLs. |

---

## 3. Entidad

| Archivo o URL | Problema | Solución propuesta |
|---|---|---|
| `github.com/Laza223/turno-gol-repo` | **E-01 🔴.** El repo es **público** (`gh repo view` → `"visibility":"PUBLIC"`, creado el 2026-04-18) y tiene el **secret scanning apagado** (`gh api …/secret-scanning/alerts` → 404 "disabled"). En la búsqueda "TurnoGol", **5 de los 8 primeros resultados son PRs del repo** y turnogol.app sale 6.º. Los PRs indexados exponen el precio de Plus, el **precio especial de un cliente, con su nombre** y el board de adquisición B2B. | Decisión de Lázaro (31/10): **queda público** por el CI (1.000+ runs y 2.195 min de reloj en 30 días contra el tope de 2.000 min de GitHub Free en privado), así que: (1) prender secret scanning y push protection; (2) regla de no poner nombres de clientes ni precios especiales en títulos o descripciones de PRs y commits; (3) privado + recorte de CI queda en el radar. Ver VIS-000. **[S]** |
| `src/lib/seo/structured-data.ts` (Organization) | **E-02.** Organization sin `@id`, `sameAs`, `contactPoint` ni `areaServed`, y con el logo roto (T-06). No hay WebSite con `inLanguage`, ni SoftwareApplication u Offer en ninguna página. Vibe, CanchaFija y TurnosGol tienen SoftwareApplication, Organization y FAQPage (relevado el 30/10/2026). | Grafo completo (ver `02-estrategia.md` §5): Organization `https://turnogol.app/#org`, WebSite, SoftwareApplication con Offer en ARS y Offer de prueba en 0. Sin `aggregateRating` hasta que haya reseñas reales visibles. **[M]** |
| Perfiles externos | **E-03.** TurnoGol no tiene ficha en Capterra, G2, GetApp, LinkedIn de empresa, Crunchbase, YouTube ni Apple Business Connect. Ninguna lista de terceros lo nombra (Turnito, Clubbi, Clubin, ComparaSoftware: relevado el 30/10/2026). | Alta gratis con la misma frase en todos (ver `05-autoridad-externa.md`). **[S] cada uno** |
| TurnosGol (turnosgol.com.ar) | **E-04.** Casi homónimo, mismo nicho, de Zeus Agencia. Tiene JSON-LD completo. Para la búsqueda "TurnosGol" sale primero, y en "sistema de turnos para canchas de fútbol" aparece 9.º; TurnoGol no aparece. | Estrategia de entidad con punto de control el 01/02/2027 (`02-estrategia.md` §7). No compararse con ellos ni nombrarlos en la web (art. 15 del DNU 274/2019 y riesgo de reforzar la confusión). **[S]** |
| turnogol.com.ar | **E-05.** NXDOMAIN: probablemente libre (relevado el 30/10/2026). | Registrarlo en NIC.ar cuando haya plata (cuesta poco) y redirigirlo con 301. Hoy queda en el radar por presupuesto $0. **[S]** |
| axxensystems.com | **E-06.** Dice "También desarrollamos TurnoGol, una plataforma SaaS en producción", con un testimonio del Complejo La Huella. Es la agencia de Lázaro (confirmado el 31/10). | **No** se menciona Axxen en TurnoGol ni en `sameAs`. En Axxen, alinear el texto a "TurnoGol, sistema de gestión para complejos de fútbol" (cuenta como mención de un tercero). **[S]** |
| `/nosotros` | **E-07.** No existe. Nada en el sitio dice quién está detrás, desde dónde ni desde cuándo. | `/nosotros` como empresa, sin nombre propio (decisión del 30/10): Luján, julio de 2026, por qué solo fútbol, contacto. **[S]** |

---

## 4. Analítica

| Archivo o URL | Problema | Solución propuesta |
|---|---|---|
| Todo el sitio | **A-01.** **No hay ninguna analítica**: ni `@vercel/analytics`, ni Speed Insights, ni GA4, GTM, Pixel, Clarity o PostHog. Solo `WebVitalsReporter` (25% a Sentry) y logs internos (`track.search`, `track.funnel`). La CSP (`next.config.ts:10-25`, `script-src 'self'`) bloquearía un tag de terceros. | **Vercel Web Analytics**: sin cookies y sin banner, el script sale del mismo origen (`/_vercel/insights`) y es compatible con la CSP. Muestra referrers (chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com). Antes de prenderlo hay que confirmar el tope gratis del plan de Vercel. GA4 queda para cuando haga falta un grupo de canales. **[S]** |
| `src/app/(auth)/register/*`, onboarding | **A-02.** No pregunta "¿Cómo nos conociste?" ni guarda UTM o referrer: solo `referralCode`. | Una pregunta opcional en el onboarding (no en `/register`, que tiene restricción L3) con opciones cerradas, incluida "ChatGPT u otra IA". Guardar también el `document.referrer` y los `utm_*` del primer aterrizaje. **[M]** (puede necesitar migración: ver `08-prompts`, V4) |
| Enlaces `wa.me` | **A-03.** Son `<a>` planos y no hay evento de conversión. | Evento `contact_whatsapp` en Vercel Analytics (custom events: confirmar que el plan los incluya) o un contador propio. **[S]** |
| Search Console | **A-04.** No hay meta de verificación de Google en el HTML. No sabemos si está verificado por DNS. | Lázaro: propiedad de dominio por DNS, enviar el sitemap e inspeccionar 5 URLs. **Nunca** activar la exclusión de IA. **[S]** |
| Bing Webmaster Tools | **Bien.** `public/BingSiteAuth.xml` está en main (#545); el sitio quedó verificado y el sitemap enviado el 31/10/2026 (estado de la sesión anterior). | Lázaro: chequear en 1-2 días que diga URLs descubiertas y 0 errores, y mirar AI Performance cada semana. |

---

## 5. Lo que dice el producto y el copy no cuenta

El inventario (31/10/2026, sobre código y decisiones) encontró unas 35 funciones **en producción** (estado A, con El Vagón como único uso real). Las páginas públicas mencionan menos de 10. Las más fuertes y ausentes del sitio:

- Cobro **por equipo** y de a partes, mezclando métodos (`docs/decisions/2026-09-15-cobro-por-equipo.md`).
- **Precio por jugador** en la web (`2026-09-15-precio-por-jugador-denormalizado.md`).
- **Fijos que se repiten solos** e importación desde planilla (`generate-abonado-slots.worker.ts`, `abonados/importar`).
- **Hoy**: cobrar y vender sin irte de la pantalla, con lo no cobrado en rojo, que se acredita en efectivo a las 24 h (`booking.auto-credit.ts:22`).
- **Caja de la noche** por método y **cantina** con "Para reponer", mermas y **fiado**.
- **Clientes que dejaron de venir**, con WhatsApp precargado (`relationships/dormant.ts`).
- **Placa de turnos libres** para historias (`api/public/story`).
- El turno de la 1 AM cuenta en la noche correcta (`shared/time/operating-day.ts`).
- Eventos de varias horas: escuelita gratis repetible, cumpleaños.
- Push con horario silencioso y resumen diario y semanal (opt-in).
- **TurnoGol Plus** (B, en vivo en un complejo) y **RIVAL** (B, flag global prendido el 29/10/2026).

Detalle y estado de cada una: `02-estrategia.md` §3.

---

## 6. Hechos volátiles re-verificados

Verificados el 30 y 31/10/2026, con búsquedas desde EE.UU.

| # | Hecho | Estado | Fuente | Fuerza |
|---|---|---|---|---|
| a | ChatGPT Ads en Argentina | Llegó el 21/10/2026. No hay mínimo de inversión publicado para AR; en EE.UU. el self-serve no tendría mínimo desde mayo de 2026, aunque las fuentes se contradicen | [Forbes Argentina](https://www.forbesargentina.com/today/chatgpt-empieza-mostrar-publicidad-argentina-como-funciona-nuevo-negocio-openai-cuanto-cuesta-anunciar-n100809) | Alta (lanzamiento) / baja (mínimos) |
| b | Reserve with Google (Actions Center, Appointments Redirect) | Argentina está soportada. La tabla de categorías **no tiene canchas ni deportes** (sí Gym, Fitness Center, Gymnastics Center) y se declara "no exhaustiva". Pide coincidir con la ficha de Maps, precio final, cancelación clara y soporte en 1 día hábil. Actualizada el 01/04/2026 | [Política de Google](https://developers.google.com/actions-center/verticals/appointments/redirect/policies/platform-policies) (leída) | Alta |
| c | Capterra y G2 | G2 compró Capterra, GetApp y Software Advice (feb 2026). El alta de Capterra lleva al formulario de G2. Hay reportes de que el perfil gratis no tiene link al sitio. Capterra le devolvió 403 al relevamiento | [toolradar](https://toolradar.com/compare/capterra-vs-saashub) (secundaria) | Media |
| d | Precios de herramientas de medición | Otterly Lite USD 29 (15 prompts; AI Mode y Gemini +USD 9 cada uno); LLMrefs desde USD 79; Peec reestructuró el 14/08/2026 (EUR, anual, ~USD 95-105); Semrush AI Toolkit ~USD 95-99 (contradictorio) | [Otterly help](https://help.otterly.ai/pricing-of-otterlyai), comparativas secundarias | Media |
| e | Cloudflare y Vercel con bots de IA | Vercel: el ruleset AI Bots está inactivo ("Allow") por defecto. Cloudflare cambió su plan de julio: ahora existe "Disallow AI Training", que conserva Googlebot, y "Block AI Bots" y "Managed robots.txt" se deprecan. **No aplica**: TurnoGol no está detrás de Cloudflare | [Vercel docs](https://vercel.com/docs/vercel-waf/managed-rulesets), [The Decoder](https://the-decoder.com/cloudflare-replaces-its-blanket-ai-bot-block-with-granular-controls-for-search-training-and-agent-crawlers/) | Alta / media |
| f | Rich results | El de FAQ desapareció para todos el 07/05/2026; el markup sigue siendo válido para otros motores. Software App exige rating o reseña para el rich result | [TechWyse](https://www.techwyse.com/news/ai-search/google-faq-rich-results-deprecated-2026) | Alta |
| g | APIs de búsqueda con ubicación | OpenAI `web_search` acepta `user_location.country` ISO de 2 letras e `include: ["web_search_call.action.sources"]`. Anthropic cobra USD 10 cada 1.000 búsquedas, acepta `user_location.country` en ISO 3166-1 alfa-2 y responde **400 si el código no está soportado**: hay que probar "AR". Gemini 3 grounding: 5.000 por mes y después USD 14 cada 1.000 (secundaria; el free tier es contradictorio) | [OpenAI](https://developers.openai.com/docs/guides/tools-web-search), [Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) | Alta (OpenAI, Anthropic) / media (Gemini) |
| h | Novedades de octubre de 2026 | (1) Search Console: el control para excluirse de AI Overviews y AI Mode está disponible globalmente desde el 31/08/2026, por defecto "Include", junto con el reporte de IA generativa. (2) Las políticas de spam cubren respuestas de IA desde el **15/05/2026**; el update del 18/08 fue uno "normal". (3) ChatGPT prueba un índice propio ("Labrador") contra SERPs scrapeadas: el experimento "prefer-index-over-serp-v3" tocó el 8% de los chats a mediados de agosto. (4) No hay confirmación de GPT-6 en ChatGPT el 7-8/10 | [Search Engine Land](https://searchengineland.com/google-search-console-ai-performance-reports-and-search-generative-ai-control-rolling-out-globally-462214), [PPC Land](https://ppc.land/google-spam-policies-now-officially-cover-ai-overviews-and-ai-mode-in-search), [Peec](https://docs.peec.ai/research/chatgpt-shopping-index-experiments) | Media |

**Consecuencia de (h3):** si ChatGPT depende cada vez más de su índice propio, el acceso de **OAI-SearchBot** al HTML (T-02) pesa más que posicionar en Bing.

---

## 7. Verificación en vivo (30/10/2026, sin JavaScript)

| URL | Cache | Title | Canonical | H1 | H2 | Palabras | JSON-LD |
|---|---|---|---|---|---|---|---|
| `/` | HIT | TurnoGol — Reservá tu cancha de fútbol al instante | sí | Tu partido empieza en TurnoGol | 0 | 90 | Organization, WebSite |
| `/para-complejos` | PRERENDER | TurnoGol para complejos — El sistema de señas… | sí | Chau, reserva de palabra. | 4 | 520 | — |
| `/precios` | PRERENDER | Precios — … · TurnoGol (duplicado) | sí | Lo que te deja un turno, una vez al mes. | 6 | 795 | FAQPage |
| `/explorar` | MISS (`no-store`) | Complejos de fútbol con reserva online · TurnoGol | sí | Encontrá tu cancha ideal (dentro de `hidden`) | 0 | 174 | BreadcrumbList |
| `/el-vagon-deportivo` | PRERENDER | El vagón Deportivo  · TurnoGol | sí | (dentro de `hidden`) | Horarios | 73 | SportsActivityLocation, Breadcrumb |
| `/complejo-evardss` | STALE | Complejo Evardss · TurnoGol | sí | (dentro de `hidden`) | Horarios | 68 | ídem |
| `/blog` | PRERENDER | …\| TurnoGol · TurnoGol | **no** | Blog | 1 | 56 | — |
| `/blog/mejores-…-2026` | PRERENDER | …\| TurnoGol · TurnoGol | **no** | (título) | 5 | 444 | Article |
| `/alternativas-alquila-tu-cancha` | PRERENDER | …\| TurnoGol · TurnoGol | **no** | (título) | 6 | 454 | Article |
| `/vs/alquila-tu-cancha` | PRERENDER | …\| TurnoGol · TurnoGol | **no** | (título) | 6 | 572 | Article |

Sitemap: 13 URLs. Las del blog, `/vs` y `/alternativas` tienen `lastmod` 2026-07-12; El Vagón 2026-10-24 y Evardss 2026-10-29; las 8 estáticas, la fecha del build.
