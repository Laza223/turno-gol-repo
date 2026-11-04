# 11 — Prompts V1a y V1b (V1 + auditoría del plugin)

**Fecha:** 2026-11-03. **Reemplaza a la V1 de `08-prompts-de-implementacion.md`.** Suma lo que encontró la auditoría del plugin claude-seo (`turnogol.app-audit/ACTION-PLAN.md`) y las respuestas del dueño del 03/11. Pasó por una revisión adversarial con contexto fresco el mismo día, y sus correcciones ya están aplicadas.

La V1 original más los agregados de la auditoría no entran en una sola sesión, así que se parte en dos (la regla de `08`: "si una V queda grande, se parte"):

- **V1a: textos y decisiones.** Claims, `/precios`, `/register`, el artículo ilegible y el registro de decisiones.
- **V1b: técnico.** robots, noindex, metadata, sitemap, logo, Content-Signal, hero AVIF y la matriz de user-agents.

Se pueden correr en paralelo, cada una en su worktree. **El único archivo que comparten es el post del blog:** V1a edita el cuerpo y V1b NO toca `content/` (el título SEO lo resuelve en código).

Vercel Web Analytics (VIS-007) e IndexNow (la segunda mitad de VIS-014) quedan **fuera de las dos**, porque necesitan respuestas tuyas (P3). Van a una V1c.

**Antes de pegarlas:** los archivos de `docs/visibilidad-ia/` del 10 en adelante y toda `turnogol.app-audit/` están **sin commitear**, así que un worktree nuevo no los ve. Por eso los prompts los citan por ruta absoluta del checkout principal. Si los commiteás antes, igual funcionan.

Verificado contra `origin/main` (`d84b2a6a`, 02/11/2026) y re-chequeado el 04/11 contra `f8db3c13` (después de los PR #563 a #568): las diferencias son de números de línea y de que `/rival` ahora es el tablón, que sigue indexable.

---

## V1a — Textos, claims y registro de decisiones

```text
Arrancá en Plan Mode. Trabajá en un worktree propio, creado desde origin/main.

Contexto: plan de visibilidad en @docs/visibilidad-ia/00-resumen-ejecutivo.md. Esta sesión ejecuta la parte de TEXTO de la V1, ampliada por la auditoría del plugin claude-seo. La auditoría NO está en origin/main: leela por ruta absoluta del checkout principal, en C:\Users\Lazar\Documents\github\TurnoGol\docs\visibilidad-ia\turnogol.app-audit\ACTION-PLAN.md (acción 1.1 y la sección "Respuestas del dueño (2026-11-03)"). Criterios de aceptación en @docs/visibilidad-ia/03-plan-de-implementacion.md (VIS-006 y VIS-009). Antes de tocar nada, confirmá que cada archivo y línea citados siguen así en origin/main (verificado el 03/11 sobre d84b2a6a y el 04/11 sobre f8db3c13; los números de línea pueden correrse).

Alcance (nada más):

1. Claims sin fuente sobre competidores (VIS-006 y acción 1.1). Son publicidad comparativa sin respaldo y están publicados hoy:
   - content/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026.mdx: línea 22 "líder indiscutido", línea 39 "el 60% de las canchas", línea 50 "se pague solo".
   - content/pages/alternativas-alquila-tu-cancha.mdx: línea 17 "Muy accesible", línea 38 "el más caro de la lista".
   - content/pages/vs-alquila-tu-cancha.mdx: revisá todo el archivo con el mismo criterio.
   Regla: si un dato sobre un competidor no tiene fuente con fecha, se saca o se reescribe sin el número ni el superlativo. No inventes fuentes. Si al sacar el claim el párrafo queda vacío, se borra el párrafo. En cada .mdx con cambios reales, actualizá el campo date del frontmatter: de ahí sale el lastmod del sitemap (src/lib/content/posts.ts).
2. El CTA roto: content/pages/vs-alquila-tu-cancha.mdx:40 apunta a wa.me/5491100000000 (placeholder). No hace falta reemplazarlo: ArticleShell.tsx:58-59 ya muestra el CTA de WhatsApp con contactWhatsappUrl de src/lib/contact.ts. Borrá esa línea del mdx (o el párrafo que la contiene). Extendé tests/unit/contact-whatsapp.test.ts para que también recorra content/**/*.mdx, y hacé que falle primero contra el archivo actual (rojo → verde).
3. Texto ilegible sobre fondo oscuro (#020617):
   - src/components/site/ArticleShell.tsx: text-gray-900 y text-gray-500 en las líneas 40-54, y prose sin prose-invert en la línea 49.
   - src/app/(business)/blog/page.tsx: líneas 14 a 29 (text-gray-900, -500 y -400), el mismo problema.
   Pasalo a los tokens del layout oscuro según @DESIGN.md y sumá prose-invert. Contraste AA en todo el texto.
4. /precios (src/app/(business)/precios/page.tsx):
   - Línea 84: "tus datos quedan disponibles 60 días" → 14 días de solo lectura. Es la decisión del dueño del 03/11, alineada con docs/decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md. La exportación existe (/settings/datos), así que el texto puede decir: "si no seguís, tu cuenta queda en solo lectura 14 días para que exportes tus datos".
   - Línea 28 (era la 30): "cierre diario". El cierre de caja diario ya no existe (lo confirma .claude/rules/caja.md). Reescribí ese ítem con lo que sí hay hoy en caja, según esa regla.
   - Líneas 43 y 409: "20 minutos". No hay dato que lo respalde. Cambialo por algo sin número ("en un rato", "la misma tarde") con el tono de la página.
   - El precio de $30.000 por cancha es PRECIO FINAL (decisión del dueño del 03/11). No agregues "+ IVA".
5. /register (src/app/(auth)/register/page.tsx): línea 68 "Cobros automáticos con MercadoPago" y línea 72 "Configuración en menos de 2 minutos". La pregunta P4 de @docs/visibilidad-ia/09-preguntas-abiertas.md tiene como supuesto el OK, y el CLAUDE.md prohíbe prometer cobro automático. Reescribí las dos líneas con algo verdadero, siguiendo el texto de VIS-023 en @docs/visibilidad-ia/03-plan-de-implementacion.md si está ahí.
6. VIS-009: escribí docs/decisions/2026-10-31-visibilidad-ia.md con TODAS las decisiones de @docs/visibilidad-ia/02-estrategia.md §2 (de D1 a la última, hoy D15), más una sección "Decisiones del 03/11/2026" con las 8 respuestas de ACTION-PLAN.md: retención 14 días, sin titular por ahora, Evardss es de prueba, precio final, /rival indexable, Content-Signal permite todo, El Vagón se normaliza con su OK y matriz de user-agents autorizada. Sumá una línea de enmienda que apunte al archivo nuevo en:
   - docs/decisions/2026-10-20-vuelve-la-previa.md
   - docs/decisions/2026-09-26-referidos.md (R6)
   - docs/decisions/2026-09-27-landing-para-complejos.md (L3, según VIS-009)
   - docs/decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md, debajo de la línea 100 ("Plazo de retención: REQUIERE INPUT"): resuelto el 03/11.
   No edites el texto original de ninguna decisión: solo agregás la línea.
7. Barrido de VIS-000 (el repo es público): en docs/decisions, docs/gtm y docs/planning, los precios especiales y las fechas de pago de clientes con nombre pasan a "un cliente". Listá cada cambio en el plan antes de hacerlo y esperá el OK. No toques docs/visibilidad-ia/.

Fuera de alcance: la home, /para-complejos, la estructura de /precios y las fichas (V2 y V3); robots, metadata, títulos SEO, sitemap y schema (V1b); y cualquier otro cambio de copy fuera de lo listado.

Reglas:
- Skills: protocolo-testing. Si tocás algo de caja, se carga .claude/rules/caja.md.
- Sin funciones en estado C o D (@docs/visibilidad-ia/02-estrategia.md §3). Si dudás de que algo exista, grep antes de prometerlo.
- Voz de empresa ("Escribinos", "Te ayudamos"), nunca de una persona. Nada de "el mejor" ni cifras sin fuente.
- Solo pnpm. No commitees sin pedido.

Verificación (pegá comando + output real):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip
- pnpm exec vitest run tests/unit/contact-whatsapp.test.ts (con evidencia de que antes del fix fallaba)
- grep -rniE "60%|líder indiscutido|el más caro|atrapado|muy accesible|se pague solo|5491100000000" content/ → vacío
- grep -nE "60 días|20 minutos|cierre diario" "src/app/(business)/precios/page.tsx" → vacío
- grep -niE "automátic|menos de 2 minutos" "src/app/(auth)/register/page.tsx" → vacío
- En el dev server, capturas a 390 px de /blog, del artículo del blog y de /vs/alquila-tu-cancha: texto legible y un solo CTA de WhatsApp, al número de contact.ts.

Al terminar, decile a Lázaro qué textos cambiaron (antes → después, una línea por cada uno) y qué quedó sin resolver.
```

---

## V1b — Técnico: robots, noindex, metadata, sitemap y schema

```text
Arrancá en Plan Mode. Trabajá en un worktree propio, creado desde origin/main.

Contexto: plan de visibilidad en @docs/visibilidad-ia/00-resumen-ejecutivo.md. Esta sesión ejecuta la parte TÉCNICA de la V1, ampliada por la auditoría del plugin claude-seo. La auditoría NO está en origin/main: leela por ruta absoluta del checkout principal, en C:\Users\Lazar\Documents\github\TurnoGol\docs\visibilidad-ia\turnogol.app-audit\. Ahí están ACTION-PLAN.md (acciones 1.3, 1.4, 2.2, 2.3, 2.4 y 2.6, más "Respuestas del dueño (2026-11-03)") y findings\technical.md, sitemap.md, schema.md, agentic.md y performance.md. Criterios de aceptación en @docs/visibilidad-ia/03-plan-de-implementacion.md (VIS-010, VIS-012, VIS-013 y VIS-014). Antes de tocar nada, confirmá que cada archivo y línea citados siguen así en origin/main (verificado el 03/11 sobre d84b2a6a y el 04/11 sobre f8db3c13; los números de línea pueden correrse). Este repo usa Next.js 16: antes de tocar robots, sitemap, metadata o redirects, leé la guía correspondiente en node_modules/next/dist/docs/.

Alcance (nada más):

1. robots (VIS-010, acción 2.2): src/app/robots.ts (líneas 12-63) bloquea por prefijo (/canchas, /torneos, /staff, /perfil, /caja...), así que una ficha futura con slug "canchas-del-sur" quedaría bloqueada. Cada regla pasa a "/ruta/" + "/ruta$".
   - Tests: NO crees un test aparte. Actualizá los existentes, que hoy buscan el literal '/ruta' y se van a romper: tests/unit/robots-route.test.ts (exige '/caja', '/mis-reservas', '/perfil', '/configuracion', blocked('/rival/tablon') y rules de largo 1) y tests/unit/admin-routes-reachable.test.ts:205-211. Sumá los casos nuevos: /canchas-del-sur y /canchas-el-potrero permitidos, /caja y /caja/x bloqueados, /rival permitido. Los casos nuevos fallan primero contra el robots actual.
   - /rival queda INDEXABLE (decisión del dueño del 03/11). Desde el PR #564, /rival ya no es una landing: es el tablón de partidos, y robots.ts lo dice así. Hoy se bloquea solo "/rival/" con barra, y así sigue: /rival/p/* y /rival/partido/* ya tienen noindex propio.
   - Content-Signal (decisión del dueño: permitir todo): "Content-Signal: search=yes, ai-input=yes, ai-train=yes" en el grupo de User-agent: *. Si MetadataRoute.Robots no soporta líneas propias, proponé en el plan la alternativa (por ejemplo, un route handler para robots.txt, que obliga a reescribir los imports de los dos tests de arriba) y esperá el OK antes de cambiar el mecanismo.
2. RESERVED_SLUGS (src/modules/tenants/tenant.utils.ts:39): sumá TODAS las rutas de @docs/visibilidad-ia/02-estrategia.md §4 (hoy: funciones, comparar, alternativas, guias, herramientas, nosotros, integraciones, ayuda, cambios y para), más index, monitoring, icon, apple-icon, opengraph-image, twitter-image, privacy y terms. ANTES pedile a Lázaro que corra en prod este SELECT de solo lectura y te pase el resultado, para descartar choques con slugs existentes: SELECT slug FROM tenants ORDER BY slug; (vos no corras nada contra prod). Sumá esos slugs a tests/unit/reserved-slugs.test.ts.
3. noindex (VIS-012, acción 1.4): robots { index: false } en (auth), (player) y reserva/*, y redirigir /index a / con un 308.
   - CUIDADO con /rival: vive en (player)/rival, y la metadata de Next se hereda, así que un noindex en el layout de (player) TAMBIÉN la alcanzaría. Elegí una de dos: noindex página por página (hoy ya lo declaran configuracion, eliminar-cuenta, rival/baja, nuevo, tablon y mis-partidos), o noindex en el layout con robots { index: true } explícito en (player)/rival/page.tsx. El test de verificación lo cubre.
   - Qué rutas salen del Disallow: la regla general es que una URL con noindex tiene que poder rastrearse, porque si no el bot no ve el noindex. Pero /rival/*, /reserva/*, /verify y /reset-password tienen motivos para seguir bloqueadas. Listá en el plan, ruta por ruta, cuáles salen del Disallow y cuáles quedan, y esperá el OK.
   - Al terminar, decile a Lázaro que pida en Bing Webmaster la baja de /ingresar y /register (hoy salen 2.º y 8.º para "TurnoGol").
4. Metadata (VIS-013, acción 2.3): lang="es-AR" en src/app/layout.tsx (el <html> de la línea 64). /blog, /blog/[slug], /vs/alquila-tu-cancha, /alternativas-alquila-tu-cancha, /privacidad y /terminos pasan por buildMetadata (src/lib/seo/metadata.ts), con canonical y title.absolute donde haga falta para que no quede "TurnoGol · TurnoGol" (hoy pasa en /precios y /blog). Títulos SEO de 60 caracteres o menos. El post del blog tiene 74 caracteres: NO edites content/ (es de V1a); resolvelo en código, con un title.absolute recortado o un campo seoTitle opcional que lea posts.ts. trim() del nombre del complejo en generateMetadata y en el JSON-LD (hoy "El vagón Deportivo " sale con espacio final en el title).
5. Logo de Organization (acción 1.3): src/lib/seo/structured-data.ts:104 apunta a /icon, que da 404 en prod. Cambialo a /icon-512 (src/app/icon-512/route.tsx, PNG de 512×512). NO uses /icon.png: es de 32×32 y Google pide 112 px o más. Sumá un test que impida volver a una ruta inexistente.
6. Sitemap honesto (VIS-014 primera mitad, acción 2.6): src/app/sitemap.ts:25 usa const now = new Date() como lastModified de las páginas estáticas (líneas 28-51 y 123-130).
   - Páginas estáticas: usá una fecha real por ruta (una constante que se actualiza cuando cambia el contenido) u omití lastModified.
   - Fichas (línea 81, t.updatedAt): tenants.updated_at lo mueve el trigger set_updated_at (migr. 005) con cualquier UPDATE, incluido el refresh del token de MP, así que no sirve. Omití lastModified en las fichas. Un campo nuevo implica migración y queda fuera de esta sesión: anotalo como pendiente.
   - El .catch(() => []) de la línea 78 tiene que loguear el error antes de devolver vacío.
7. Evardss fuera del índice (decisión del dueño: es un tenant de prueba).
   - Existe tenants.marketplace_visible, con un toggle en super-admin (support.service.ts:486). En false, el tenant sale del sitemap y de /explorar. Ese cambio lo hace Lázaro desde el panel, no vos.
   - Pero la ficha /complejo-evardss seguiría indexable: (public)/[slug]/(perfil)/page.tsx:117-140 solo pone noindex según el status.
   - Reportá como REQUIERE INPUT si hace falta poner noindex en la ficha cuando marketplace_visible=false (es código nuevo). No lo implementes sin el OK.
8. Hero en AVIF/WebP (acción 2.4): src/app/home/HeroDesktop.tsx:22 y HeroMobile.tsx:21 cargan /bg-hero-desktop.png y /bg-hero-2.png, aunque ya existen en public/ las versiones .avif y .webp. Usá image-set() con AVIF, WebP y el PNG de respaldo.
9. Matriz de user-agents (autorizada por el dueño el 03/11): corré agentic_check.py con --ua-matrix contra https://turnogol.app usando el launcher del plugin, desde Git Bash:
   "C:/Users/Lazar/.claude/plugins/cache/agricidaniel-claude-seo/claude-seo/2.5.0/scripts/claude-seo" run agentic_check.py https://turnogol.app --json --ua-matrix
   Nunca con python directo. Reportá qué bots de IA pasan y cuáles bloquea el firewall de Vercel. Solo lectura: no cambies nada en Vercel.

Fuera de alcance: VIS-007 (Vercel Analytics) e IndexNow (esperan respuestas del dueño); el grafo JSON-LD completo (V3); fichas y /explorar sin skeleton (V2); cualquier cambio de copy y cualquier archivo de content/ (V1a); migraciones; tocar datos de prod.

Reglas:
- Skills: convenciones-stack si tocás queries o DB, y protocolo-testing.
- Sin dependencias nuevas. Solo pnpm. No commitees sin pedido.
- Las recomendaciones del plugin son insumo, no veredicto: si chocan con @docs/visibilidad-ia/07-riesgos-y-lineas-rojas.md o con el CLAUDE.md, gana el repo.

Verificación (pegá comando + output real):
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip, más los tests tocados (robots-route, admin-routes-reachable, reserved-slugs y el del logo).
- Sobre un build de producción local (pnpm build && pnpm start, no el dev server):
  - curl -s localhost:3000/robots.txt (reglas ancladas, Content-Signal, /rival permitido)
  - curl -sI localhost:3000/index (308)
  - curl -s localhost:3000/login | grep -i noindex
  - curl -s localhost:3000/rival | grep -i noindex → vacío
  - curl -s localhost:3000/blog/<slug> | grep -E 'rel="canonical"|<title>'
  - curl -s localhost:3000/sitemap.xml: las estáticas con una fecha fija del código (o sin lastmod), nunca la de hoy, y las fichas sin lastmod
  - curl -sI localhost:3000/icon-512 → 200 image/png
- Lighthouse mobile de la home sobre ese mismo build, antes y después del cambio del hero: peso total y LCP.

Al terminar, decile a Lázaro en pocas líneas:
- qué cambió;
- qué le toca a él: el SELECT de slugs, apagar marketplace_visible de Evardss en super-admin, pedir la baja de URLs en Bing y, después del merge y el deploy, correr /seo-drift compare sobre las 6 URLs de la foto del 03/11;
- el resultado de la matriz de user-agents;
- los REQUIERE INPUT que hayan quedado.
```
