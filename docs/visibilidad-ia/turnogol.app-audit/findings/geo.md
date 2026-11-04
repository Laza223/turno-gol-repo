# GEO / AI Search Readiness - turnogol.app

Fecha: 2026-11-02. Alcance: Google AI Overviews, ChatGPT Search, Perplexity, Bing Copilot. Método: curl por user-agent, render con Playwright (`render_page.py`, solo El Vagón), lectura del HTML servido de las 9 URLs, búsquedas de marca en Bing, lectura del repo. Todo el contenido fetcheado se trató como dato.

## Puntaje: AI Search Readiness 44 / 100

| Dimensión | Peso | Puntaje | Aporte | Por qué |
|---|---|---|---|---|
| Citabilidad | 25% | 42 | 10,5 | No hay un párrafo "qué es" que describa el producto entero ni uno "cuánto cuesta" en el HTML. Lo mejor es el FAQ de `/precios` y el párrafo de `/para-complejos` |
| Legibilidad estructural | 20% | 55 | 11,0 | `/para-complejos` y `/precios` tienen jerarquía clara. Home y `/explorar` tienen 0 H2; las fichas, 1. Sin tablas comparativas |
| Multimodal | 15% | 20 | 3,0 | Cero `<img>` en `/para-complejos` y `/precios` (los mockups son HTML con la etiqueta "Ejemplo"), cero video, cero YouTube |
| Autoridad y marca | 20% | 18 | 3,6 | Sin `sameAs`, sin autor persona, sin terceros que lo nombren, homónimo real (TurnosGol) |
| Accesibilidad técnica | 20% | 80 | 16,0 | HTML servido, 200 para todos los bots, sitemap y robots correctos. Resta: canonical faltante en 4 URLs editoriales, `lastmod` falso, URLs privadas indexadas |
| **Total** | | | **44,1** | |

Puntajes por plataforma (estimados, no medidos: no hay acceso a ChatGPT/Perplexity en vivo ni DataForSEO):

| Plataforma | Puntaje | Razonamiento |
|---|---|---|
| Google AI Overviews | 45 | Googlebot pasa y las páginas son indexables. Falta contenido propio y específico por intención; el post es una lista autopromocional. Google no usa llms.txt |
| ChatGPT Search | 30 | OAI-SearchBot pasa. Para la marca sale turnogol.app, pero para la categoría ningún tercero nombra a TurnoGol, y ChatGPT elige candidatos desde fuentes de terceros |
| Perplexity | 35 | PerplexityBot pasa. Pesan Reddit y YouTube y hoy hay 0 menciones |
| Bing Copilot | 40 | El dominio está en el índice de Bing con las páginas clave, pero `/ingresar` y `/register` compiten con el contenido en las búsquedas de marca |

## 1. Acceso de crawlers de IA

`robots.txt` (https://turnogol.app/robots.txt, 200): un solo grupo `User-agent: *` con `Allow: /` y bloqueos solo de rutas privadas. Ningún bot de IA está nombrado, así que todos heredan `*`. Fuente: `src/app/robots.ts:4-69`.

Prueba por user-agent (UA spoofeado desde una IP común; confirma que el origen no filtra por UA, **no** prueba que el WAF de Vercel deje pasar las IPs reales de cada bot): `/`, `/llms.txt` y `/robots.txt` devolvieron 200 con el mismo tamaño (63909 / 1456 / 814 bytes) para los 18 UA probados. Sin `X-Robots-Tag` ni `<meta name="robots">` en ninguna de las 9 URLs. `http://` y `www.` responden 308 a `https://turnogol.app/`.

| Bot | Capacidad que gobierna | Estado |
|---|---|---|
| OAI-SearchBot | Búsqueda de ChatGPT | Permitido |
| ChatGPT-User | Fetch a pedido del usuario en ChatGPT | Permitido |
| GPTBot | Entrenamiento de OpenAI (no es ChatGPT Search) | Permitido (opcional bloquear; no afecta citabilidad) |
| Claude-SearchBot | Búsqueda de Claude | Permitido |
| Claude-User | Fetch a pedido del usuario en Claude | Permitido |
| ClaudeBot | Entrenamiento de Anthropic (no es búsqueda) | Permitido (opcional) |
| PerplexityBot / Perplexity-User | Índice de Perplexity / fetch a pedido | Permitido |
| Googlebot | Google Search y AI Overviews | Permitido |
| Google-Extended | Entrenamiento y grounding de Gemini/Vertex (no afecta Search ni AIO) | Permitido (opcional) |
| Bingbot | Bing y Copilot | Permitido |
| Applebot | Siri/Spotlight/Safari | Permitido |
| Applebot-Extended | Entrenamiento de Apple Intelligence (no afecta Applebot) | Permitido (opcional) |
| CCBot, cohere-ai | Entrenamiento (opcional) | Permitidos |

Veredicto: **sin bloqueos a corregir**. Dejar todo abierto coincide con la línea roja 6 de `docs/visibilidad-ia/07-riesgos-y-lineas-rojas.md`.

Hallazgos de acceso:

### G-01 (Media) `/register` e `/ingresar` están bloqueados por robots pero indexados en Bing
- Evidencia: en búsquedas de marca ("TurnoGol", "turnogol github", "turnogol opiniones") Bing lista `turnogol.app/ingresar?next=%2Findex` en el puesto 2 y `/register` en el 8 (lectura por WebFetch, resumida por un modelo pequeño: confirmar a mano en Bing). `robots.ts:49-51` los bloquea y no tienen `noindex` (HTML sin `<meta name="robots">`).
- Por qué importa: `Disallow` impide rastrear, no indexar. Copilot arma la respuesta de marca con el snippet de esas URLs ("Cobros automáticos con MercadoPago" en `/register`), que contradice "sin tarjeta" y "la plata no pasa por nosotros".
- Fix: sacar `/ingresar` y `/register` del `Disallow` y agregar `robots: noindex,follow` en esas dos páginas (hoy usan el `buildMetadata` sin `noIndex`). Esfuerzo: S.
- Cómo sabremos que falló: en Bing Webmaster Tools, `site:turnogol.app` sigue mostrando `/ingresar` o `/register` 4 semanas después; o la búsqueda "TurnoGol" los muestra antes que `/para-complejos`.

### G-02 (Media) El `lastmod` del sitemap es la hora del request en 8 de 13 URLs
- Evidencia: la respuesta de `/sitemap.xml` trae `2026-11-02T14:44:58.160Z` idéntico para `/`, `/explorar`, `/para-complejos`, `/precios`, `/blog`, `/privacidad`, `/terminos` y `/rival`. Código: `src/app/sitemap.ts:24-43` (`lastModified: now`).
- Por qué importa: Google y Bing aprenden a ignorar `lastmod` de sitios que lo inventan, y Bing/Copilot lo usa para decidir cuándo re-rastrear. El plan ya lo tiene (`00-resumen-ejecutivo.md`, acción 4) y sigue sin aplicar.
- Fix: fecha real por página (fecha del último commit del archivo o `dateModified` del frontmatter); en las estáticas, una constante que se toca al editar. Esfuerzo: S.
- Cómo sabremos que falló: dos fetch de `/sitemap.xml` con horas distintas devuelven distinto `lastmod` para `/precios` sin que nadie lo haya editado.

### G-03 (Baja) Divergencia repo/prod en robots y sitemap: revisar antes de mergear
- Evidencia: prod publica `Disallow: /rival/` y lista `/rival` en el sitemap; el árbol de trabajo (rama `feat/panel-mobile-denso`) tiene `'/rival$'` en `src/app/robots.ts:42` y su `sitemap.ts` no lista `/rival`. Tampoco hay una página de landing en `src/app/(player)/rival` en esta rama. Es decir, la rama está atrasada respecto de prod.
- Riesgo: si un merge mal resuelto reintroduce `/rival$`, la landing pública `/rival` (2040 palabras) queda bloqueada y fuera del sitemap sin que nadie lo note. No verifiqué `origin/main` (consigna: sin git).
- Fix: test que falle si `/rival` está en el `Disallow` mientras la landing exista. Esfuerzo: S.
- Cómo sabremos que falló: `curl -s https://turnogol.app/robots.txt | grep -c 'rival\$'` devuelve 1.

## 2. llms.txt (higiene opcional, no palanca)

- Estado: **presente y bien formado** (200, 1456 bytes, `text/plain`, markdown con H1/H2). Fuente: `public/llms.txt`. No hay `llms-full.txt` (404).
- Google no lo usa y no hay evidencia de que mueva citaciones; no lo trato como prioridad. Un rastreador de ChatGPT, Claude o Perplexity puede leerlo, pero no lo necesita para entender el sitio si las páginas lo dicen bien.
- Observaciones de higiene (Baja): (a) es la **mejor definición de TurnoGol que existe en todo el sitio** ("sistema de reservas y gestión ... en Argentina", `llms.txt:4`) y no está en ninguna página HTML; (b) sin precio; (c) nombra competidores ("ATC Sports, Turnito", `llms.txt:12`) y afirma "sin comisiones ocultas ni retenciones temporales" (`llms.txt:14`), una comparación sin fuente; (d) no enlaza `/blog`, `/vs/alquila-tu-cancha` ni `/rival`; (e) sin fecha.
- Fix: cuando se corrija la entidad (G-04), alinear este archivo a la misma frase y agregar el precio. Esfuerzo: S. Cómo sabremos que falló: el texto de `llms.txt:4` difiere de la definición canónica de la home.

## 3. Citabilidad a nivel de pasaje

Respuesta a las tres preguntas que pidieron:

| Pregunta | ¿Hay un pasaje citable en el HTML? | Mejor candidato | Problema |
|---|---|---|---|
| ¿Qué es TurnoGol? | **Parcial** | `/para-complejos`, primer párrafo (46 palabras): "TurnoGol es el sistema de señas para canchas de fútbol. El jugador reserva desde la página de tu complejo y paga la seña por MercadoPago: la plata entra directo a tu cuenta..." | Define una parte (señas) y no el producto (grilla, fijos, caja, cantina, métricas, equipo). No dice "Argentina". La home no tiene ninguna frase de este tipo |
| ¿Cuánto cuesta? | **No** | `/precios`: "desde $ 30.000 /mes" (en el bloque de la calculadora) y la tarjeta por defecto "3 canchas $ 90.000/mes" | La frase "$30.000 por cancha por mes, 10% menos en anual" solo existe en la `<meta description>`. El HTML renderizado muestra $90.000 (el valor por defecto del selector) |
| ¿En qué se diferencia? | **Parcial** | `/vs/alquila-tu-cancha`, sección 1 y "Resumen"; `/precios` "Todo esto, para todas tus canchas" | Solo contra ATC; sin tabla; con afirmaciones sin fuente (ver G-06) |

Lo que está bien: el FAQ de `/precios` (7 preguntas, respuestas de 30 a 60 palabras, directas desde la primera línea, con `FAQPage` JSON-LD). Es el mejor material citable del sitio. Sobre la longitud de bloque: es una heurística de terceros y Google dice que no hace falta trocear; no la usé como criterio.

### G-04 (Alta) La entidad se describe de 6 maneras y la palabra "gestión" no aparece en las páginas principales
- Evidencia (todas leídas hoy en prod):
  1. Home: "Reservá tu cancha de fútbol al instante" (B2C, para el jugador). Title y H1.
  2. `/para-complejos`: "el sistema de señas para canchas de fútbol" (`src/app/(business)/para-complejos/page.tsx:14-19`).
  3. `/register`, `/ingresar` y default del sitio: "Sistema de reservas online y gestión para complejos de fútbol en Argentina" (`src/app/layout.tsx:34`).
  4. `llms.txt:4`: "sistema de reservas y gestión diseñado específicamente para complejos ... 5, 7 y 11".
  5. `/vs/...`: "una herramienta de gestión para tus clientes actuales, no te 'trae' jugadores desconocidos" (contradice la home y `/explorar`, que sí ofrecen un buscador para jugadores).
  6. `/rival`: "La plataforma de los futboleros", "El lado jugador de TurnoGol". Instagram: "Plataforma N°1 para Complejos de fútbol".
  - `grep` de "gestión" en el HTML servido de home, `/para-complejos`, `/precios`, `/explorar` y `/rival`: 0 coincidencias.
  - JSON-LD `Organization` de la home sin `description` ni `sameAs` (`src/lib/seo/structured-data.ts:98-106`).
- Por qué importa: un modelo que sintetiza varias páginas obtiene una mezcla ("app de reservas para jugadores" / "sistema de señas") y puede describir a TurnoGol como una app de consumo o como un cobrador de señas. La búsqueda de categoría "sistema/software de gestión para canchas" no encuentra la palabra en ninguna página.
- Fix: elegir una frase canónica (el plan propone una en `02-estrategia.md` §1: "sistema de gestión hecho solo para complejos de fútbol ... sin comisión por reserva y sin cargo al jugador"), ponerla en las primeras 60 palabras de `/para-complejos`, en un bloque "Qué es TurnoGol" en la home (hoy tiene 88 palabras y 0 H2), en `Organization.description`, en `layout.tsx:34` y en `llms.txt`. No cambiar la promesa comercial; unificar el lenguaje. Esfuerzo: M (V3 del plan; sigue sin aplicar al 2026-11-02).
- Cómo sabremos que falló: preguntarle a ChatGPT, Perplexity, Gemini y Copilot "¿qué es TurnoGol?" y "¿qué sistema de gestión hay para complejos de fútbol en Argentina?". Falla si la respuesta lo describe solo como app de reservas para jugadores, como "sistema de señas", o si no aparece "gestión" ni "complejos". Repetir cada 2 semanas con las mismas preguntas.

### G-05 (Alta) El precio no está escrito en una frase citable
- Evidencia: `/precios` SSR. Cuerpo: tarjeta "TurnoGol 3 canchas $ 90.000 /mes" (el estado por defecto del selector), "TurnoGol sale desde $ 30.000 /mes" y el toggle "Anual −10%" sin importe. "$30.000 por cancha" aparece en la `<meta description>` y en ninguna frase del cuerpo. Las comparativas dicen "cuota fija mensual" y "Muy accesible" sin cifra (`content/pages/vs-alquila-tu-cancha.mdx:27`, `content/pages/alternativas-alquila-tu-cancha.mdx:17`). No hay `Offer` en ningún JSON-LD.
- Competencia en la misma consulta: TurnosGol publica precios en USD en su home (plan único USD 500 o USD 50/mes).
- Por qué importa: "¿cuánto cuesta X?" es la intención de compra más citada por los asistentes. Si no encuentran la cifra, la inventan, la toman de otro sitio o repiten $90.000 como si fuera el precio.
- Fix: (1) párrafo estático arriba de la calculadora: "TurnoGol cuesta $30.000 por cancha por mes, con 10% de descuento en el plan anual. Sin comisión por reserva ni permanencia. 30 días gratis, sin tarjeta."; (2) tabla HTML de 1, 2, 3, 5 y 8 canchas (mensual/anual); (3) misma cifra en `/vs`, alternativas, home B2B y llms.txt; (4) JSON-LD `SoftwareApplication` con `Offer` y `UnitPriceSpecification` (ARS, por cancha por mes). El precio no se toca; solo se vuelve citable. Esfuerzo: S.
- Cómo sabremos que falló: en ChatGPT/Perplexity/Copilot, "¿cuánto cuesta TurnoGol?" devuelve "no publica precio", "$90.000" sin decir que son 3 canchas, o una cifra en dólares (la de TurnosGol).

## 4. Consistencia y riesgo de claims entre páginas

### G-06 (Alta) Claims comparativos sin fuente siguen publicados, y el post se pone primero a sí mismo
- Evidencia (prod hoy y fuente): "el 60% de las canchas hoy sigue usando esto" (`content/blog/mejores-sistemas-...-2026.mdx:39`); ATC "líder indiscutido" (`:22`); EasyCancha "suele ser el más caro de la lista" (`content/pages/alternativas-alquila-tu-cancha.mdx:38`); Don Potrero "interfaz ... desactualizada" (`:24`); ATC "el complejo suele quedar atrapado en el sistema de pagos" (`content/pages/vs-alquila-tu-cancha.mdx:21`); "Muy accesible" (`alternativas...mdx:17`). El post "Los Mejores Sistemas..." pone a TurnoGol en el puesto 1 y firma como `Organization: TurnoGol`.
- Por qué importa: los motores de IA descuentan listas autopromocionales y cifras sin fuente; cuando las citan, las repiten, y un competidor puede usar el texto en contra. El plan ya lo clasifica "Alta (ya pasa)" y pide el hotfix VIS-006; **no está aplicado**.
- Fix: despublicar o fuentear cada afirmación (competidor + fecha + URL de su web); reemplazar el ranking por una guía "cómo elegir" con criterios y una tabla de hechos; mantener la sección "Cuándo NO elegir TurnoGol", que es lo mejor de esas páginas. Esfuerzo: S (despublicar) a M (rehacer).
- Cómo sabremos que falló: `curl -s https://turnogol.app/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026 | grep -c "60%"` devuelve 1; o una IA repite "el 60% de las canchas usa cuaderno" atribuyéndolo a TurnoGol.

### G-07 (Media) Promesas que difieren entre páginas
- "Configuración en menos de 2 minutos" y "Cobros automáticos con MercadoPago" en `/register` frente a "unos 20 minutos" y "La plata nunca pasa por nosotros" en `/precios`. "Sin tarjeta" (`/para-complejos`, `/precios`) frente al snippet de Bing de `/register`: "pagos automáticos". "60 días" de datos y "cierre diario" en `/precios` ya están marcados como falsos en el plan (`07`, fila "Lo prometido obliga").
- Fix: una fuente de verdad (`TRIAL_DAYS` ya existe en `src/shared/constants.ts`) y revisar `/register`. Esfuerzo: S. Falla si dos páginas dan tiempos o condiciones distintas al hacer `grep` de "minutos" y "tarjeta".

### G-08 (Media) `/rival` mezcla lo disponible con la hoja de ruta
- Evidencia: 2040 palabras, 9 H2; la `<meta description>` incluye "Próximamente: jugá con tu club por la tabla, la Corona y tu categoría". Sin JSON-LD. El marcado "Ya disponible"/"Próximamente" existe, pero un extractor de pasajes toma el párrafo sin la etiqueta.
- Riesgo: una IA describe RIVAL como una liga con tabla, categorías y clubes que todavía no existe (línea roja 9 del plan).
- Fix: sacar "Próximamente" de la meta description y del H1/primer bloque; separar en una sección única "Qué viene" con un encabezado que lo diga, y una frase al inicio de cada pasaje futuro. Esfuerzo: S. Falla si una IA responde "RIVAL tiene tabla de clubes".

## 5. Señales de autoridad, marca y menciones de terceros

Búsquedas hechas en Bing (WebFetch; los resultados vienen resumidos por un modelo pequeño). Las consultas de categoría ("mejor sistema para canchas de fútbol argentina", "alternativas a alquila tu cancha") devolvieron resultados genéricos sin relación, así que **no pude medir visibilidad de categoría**; las de marca sí fueron consistentes.

| Señal | Hallazgo |
|---|---|
| Resultados para "TurnoGol" | 1.º turnogol.app; luego `/ingresar`, Instagram `@turnogol`, TurnosGol, post de Instagram, tirogol.com, `/explorar`, `/register`, `/para-complejos`, `/precios`. Ningún resultado de GitHub en los 10 visibles en Bing (el plan dice que en Google el repo sale primero: no lo pude reproducir) |
| Wikipedia / Wikidata | No hay entidad |
| Reddit | Cero menciones |
| YouTube | Cero videos ni canal (`site:youtube.com turnogol` no devuelve nada de YouTube). Es la señal con mayor correlación con citas en IA y hoy es 0 |
| LinkedIn | Sin página de empresa visible |
| G2 / Capterra | No verificable (403 al consultar). La memoria del proyecto dice que la ficha se envió y fue aprobada el 30/10; falta confirmar que esté pública |
| Instagram | `@turnogol` con unos cientos de seguidores (la cifra varió entre lecturas: 542 y 842). Bio: "Plataforma N°1 para Complejos de fútbol" |
| Homónimos | TurnosGol, turnosgol.com.ar (misma categoría, una letra de diferencia; "Reservas y Gestión para Canchas de Fútbol"). tirogol.com (noticias deportivas, no relacionado) |

### G-09 (Alta) Homónimo directo (TurnosGol) y cero corroboración de terceros
- Evidencia: turnosgol.com.ar aparece en el puesto 4 de "TurnoGol" en Bing. Dice "no cobra comisiones" y "el dinero va directo a la cuenta de Mercado Pago del cliente" (el mismo diferencial de TurnoGol), vende "Reservas y Gestión para Canchas de Fútbol" y cobra en dólares (USD 500 inicial o USD 50/mes). Lo desarrolla Zeus Agencia, no TurnoGol. TurnoGol tiene `Organization` sin `sameAs` ni `description` (`structured-data.ts:98-106`) y ninguna página de empresa (sin `/nosotros`, sin contacto, sin razón social visible).
- Por qué importa: sin menciones de terceros, el modelo no puede confirmar quién es "TurnoGol" y rellena con el vecino más parecido; la diferencia de precio (ARS por cancha frente a USD) hace que el error sea visible.
- Fix (respeta la decisión del plan de no nombrar a TurnosGol en el sitio): (1) `Organization` completa con `description` canónica, `sameAs` (Instagram ya; LinkedIn, YouTube y G2 cuando existan), `alternateName` y `areaServed: AR`; (2) página `/nosotros` con quién está detrás, contacto y qué hace; (3) los 4 perfiles gratis del plan con la misma frase (G2/Capterra, LinkedIn, YouTube, Crunchbase); (4) el link de TurnoGol en el perfil/Instagram/WhatsApp de El Vagón. Esfuerzo: M, repartido en semanas.
- Cómo sabremos que falló: preguntar "¿cuánto cuesta TurnoGol?" y "¿quién desarrolla TurnoGol?" en 3 motores: falla si la respuesta trae USD, "Zeus Agencia" o mezcla ambas marcas. Punto de control del plan: 01/02/2027.

### G-10 (Media) Editoriales sin las señales mínimas de autoría y frescura
- Evidencia: `/blog/<slug>`, `/vs/...` y `/alternativas-...` no tienen `<link rel="canonical">` (`src/app/(business)/blog/[slug]/page.tsx:21-24` solo devuelve `title` y `description`; lo mismo en `vs/alquila-tu-cancha/page.tsx:11-14`). Title duplicado: "... | TurnoGol · TurnoGol" (la página agrega `| TurnoGol` y el template de `layout.tsx:33` agrega ` · TurnoGol`). `og:type` es `website`. JSON-LD `Article` con `author` = Organización, sin `dateModified`, sin `publisher`, sin `image` (`src/components/site/ArticleShell.tsx:19-29`); `/vs` y `/alternativas` no tienen ni `datePublished`. El blog tiene un único artículo (`/blog` tiene 56 palabras).
- Fix: `alternates.canonical` vía `buildMetadata` (ya existe en `src/lib/seo/metadata.ts:57-82`), título sin duplicar, `dateModified` real, autor visible, `publisher`. Esfuerzo: S.
- Cómo sabremos que falló: `curl -s <url> | grep -c 'rel="canonical"'` devuelve 0 en esas tres páginas; el `<title>` termina en "TurnoGol · TurnoGol".

## 6. Multimodal y estructura

### G-11 (Media) Cero contenido de video o imagen indexable en las páginas de producto
- Evidencia: `<img>` = 0 en `/para-complejos`, `/precios`, home; los mockups son HTML con la etiqueta "Ejemplo" (sin alt textual útil); sin `<video>` ni iframes de YouTube; OG genérico `/opengraph-image` para todas las páginas de marketing.
- Fix: capturas reales de la grilla y de la caja con `alt` descriptivo, y los 4 tutoriales de YouTube del plan (VIS-032, VIS-035) incrustados en `/para-complejos`. Esfuerzo: L (producción). Falla si 8 semanas después `site:youtube.com TurnoGol` sigue sin resultados.

### G-12 (Media) Fichas de complejo y `/explorar` con poco texto propio
- Evidencia: `/el-vagon-deportivo` 66 palabras, `/complejo-evardss` 53 palabras: dirección, horarios y "5 canchas · Fútbol 5 y 7". Sin descripción, servicios ni precio en el HTML (los precios están ocultos por decisión de producto). Meta description: "Reservá una cancha en El vagón Deportivo , Lujan, Buenos Aires." (espacio extra antes de la coma, "Lujan" sin tilde, `<h1>` con espacio final). El widget de reserva ("Paso 1 de 3 ... Reservás hasta 6 días antes") solo aparece tras hidratar (render con Playwright), no en el HTML inicial. El marketplace lista solo 2 complejos, ambos en Luján. Lo positivo: ya viene en el HTML inicial (no el skeleton que el plan documentó), con `SportsActivityLocation` y `BreadcrumbList` válidos.
- Fix: bloque estático "Cómo se reserva en <complejo>" (con los 3 pasos y el plazo de anticipación), servicios y formato; limpiar el nombre y la tilde. Esfuerzo: S. Falla si "¿cómo reservo en El Vagón Deportivo?" no se responde con TurnoGol como fuente.

## 7. Top 5 de mayor impacto

| # | Cambio | Hallazgo | Esfuerzo | Impacto |
|---|---|---|---|---|
| 1 | Una definición canónica de TurnoGol (con "gestión", "complejos de fútbol", "Argentina") en home, `/para-complejos`, `Organization.description`, `layout.tsx` y llms.txt | G-04 | M | Alto en las 4 plataformas |
| 2 | Escribir el precio como frase y tabla en `/precios` (más `Offer` en JSON-LD) y repetirlo en las comparativas | G-05 | S | Alto para "cuánto cuesta" |
| 3 | Despublicar o fuentear los claims comparativos y reemplazar el ranking propio por una guía "cómo elegir" | G-06 | S-M | Alto (confianza y riesgo legal) |
| 4 | Corroboración externa y desambiguación de entidad: `sameAs`, `/nosotros`, perfiles G2/LinkedIn/YouTube, link desde El Vagón | G-09 | M (semanas) | Alto en ChatGPT y Perplexity |
| 5 | Higiene que Copilot y Google leen: noindex en `/ingresar` y `/register`, canonical en las 4 URLs editoriales, `lastmod` real | G-01, G-02, G-10 | S | Medio |

## 8. Lo que ya está bien

HTML completo en servidor para las 9 URLs (no es un SPA: `is_spa=false`), 200 para todos los bots probados, sitemap y robots correctos, canonical en las páginas de marketing, `http` y `www` redirigen a la raíz con 308, HSTS. `FAQPage` en `/precios` con respuestas autocontenidas. `SportsActivityLocation` + `BreadcrumbList` en las fichas. La sección "Cuándo NO elegir TurnoGol" de `/vs` es el tipo de honestidad que los asistentes citan. El análisis de schema en detalle está en `findings/schema.md`.

## 9. Límites de esta auditoría

- No consulté ChatGPT, Perplexity, Gemini ni Copilot en vivo (sin sesión ni DataForSEO disponible): los puntajes por plataforma son estimaciones a partir del acceso y del contenido, no mediciones.
- Las búsquedas de Bing pasaron por WebFetch con un resumen de modelo pequeño; las consultas de categoría no devolvieron resultados útiles. No se mide la visibilidad de categoría.
- La prueba por user-agent usa UA falsificados desde una IP común: no verifica reglas del WAF/Bot Management de Vercel por IP del bot (el plan ya tiene VIS-004/005 para eso).
- Las referencias a archivos son de la rama `feat/panel-mobile-denso`, que está atrasada respecto de prod (robots, sitemap y la landing de `/rival` difieren). El comportamiento descripto es el de prod; los `archivo:línea` aplican cuando el código coincide (contenido MDX, `ArticleShell`, `structured-data.ts`, `layout.tsx`, `metadata.ts`).
- G2/Capterra devolvieron 403; el estado de la ficha no se pudo confirmar.
