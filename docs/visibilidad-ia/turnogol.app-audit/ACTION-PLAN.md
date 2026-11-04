# Plan de acción SEO — turnogol.app (2026-11-02)

Viene de `FULL-AUDIT-REPORT.md`. No es un plan nuevo: **se engancha en las tareas VIS de `docs/visibilidad-ia/03-plan-de-implementacion.md`**. Cuando una acción ya tiene tarea, se cita (VIS-xxx).

Formato de cada acción:
- **Por qué:** el principio en el que se apoya.
- **Depende de / desbloquea:** cómo se conecta con las otras acciones.
- **Falla si:** la prueba que demostraría que la acción no funcionó.
- **Indicador:** la señal adelantada que conviene vigilar.

---

## Fase 1 — Críticos (semana 1: 3 al 9/11)

### 1.1 Hotfix editorial (VIS-006, ampliado) — Crítico · S

**Qué:**
- Despublicar los claims sin fuente en el post del blog, `/vs` y `/alternativas`: "60%", "líder indiscutido", "atrapado", "el más caro", "muy accesible".
- Poner el número real en `content/pages/vs-alquila-tu-cancha.mdx:40`. Tiene que salir de `src/lib/contact.ts`.
- En `ArticleShell.tsx:40,51`, pasar a los tokens del layout oscuro y sumar `prose-invert`.
- Extender el test de `contact.ts` a `content/**/*.mdx`.

**Por qué:** son claims sobre competidores sin fuente, publicados (riesgo de publicidad comparativa), y un CTA que no lleva a ningún lado.

**Depende de:** nada. **Desbloquea:** 3.2.

**Falla si:** `curl -s https://turnogol.app/vs/alquila-tu-cancha | grep -c 5491100000000` es mayor que 0, o si en `screenshots/` el H1 del artículo sigue sin contraste AA.

**Indicador:** ninguno de los textos vetados en un grep sobre `content/`.

### 1.2 Search Console y Bing Webmaster (VIS-002/003) — Crítico para medir · S (Lázaro)

**Qué:** verificar el dominio en los dos por DNS, enviar el sitemap y capturar el baseline con `/seo drift baseline https://turnogol.app`.

**Por qué:** sin esto, nada de lo que sigue se puede falsar.

**Depende de:** nada. **Desbloquea:** la Fase 4 y la elección de la keyword principal del hub (cluster, REQUIERE INPUT 4).

**Falla si:** a los 7 días Search Console no muestra cobertura del sitemap.

**Indicador:** cantidad de URLs indexadas sobre las 13.

### 1.3 Logo de Organization — Alto · S

**Qué:** en `src/lib/seo/structured-data.ts:104`, cambiar `/icon` por `/icon-512` y sumar un test HEAD sobre `logo.url`.

**Por qué:** `/icon` da 404 y la entidad queda sin logo.

**Depende de:** nada.

**Falla si:** el Rich Results Test sigue marcando el logo como inválido.

### 1.4 noindex en las rutas privadas (VIS-012) — Alto · S

**Qué:** poner `robots: { index: false }` en `(auth)`, `(player)` y `reserva/*`, sacarlas del `Disallow` y redirigir `/index` a `/` con un 308.

**Por qué:** Bing ya indexa `/ingresar` (2.º) y `/register` (8.º) para "TurnoGol". El bot no puede leer un noindex en una URL que tiene prohibido rastrear.

**Depende de:** 1.2, para pedir la baja en Bing.

**Falla si:** a las 4 semanas siguen apareciendo en `site:turnogol.app` en Bing.

---

## Fase 2 — Alto impacto (semanas 2 y 3)

### 2.1 Fichas y `/explorar` con el contenido en el HTML inicial (VIS-011) — Alto · M

**Qué:** sacar o mover el `loading.tsx` de `[slug]/(perfil)` y de `explorar`, y dejar en streaming solo la disponibilidad.

**Ojo:** `loading.tsx` convierte `notFound()` en un soft-404. Hay que conservar el gate de `[slug]/layout.tsx`.

**Falla si:** `curl -s https://turnogol.app/el-vagon-deportivo` muestra el H1 dentro de `<div hidden`, o si un slug inexistente deja de dar 404.

**Indicador:** las palabras que extrae `/explorar` sin JS. Hoy son 21; el objetivo es que aparezcan los nombres de los complejos.

### 2.2 robots.ts con reglas ancladas (VIS-010) — Alto · S

**Qué:** cerrar cada `Disallow` con `/` final o con `$`, con un test que genere slugs de prueba con prefijos reservados contra `robots()`.

**Por qué:** hoy las fichas futuras con esos prefijos quedarían bloqueadas sin que nadie se entere.

**Falla si:** `/canchas-del-sur` da BLOCK en el test.

### 2.3 Metadata uniforme (VIS-013) — Medio · S

**Qué:** usar `buildMetadata` en `/blog`, el post, `/vs`, `/alternativas`, `/privacidad` y `/terminos`, con `title.absolute` donde corresponda y títulos de 60 caracteres o menos. Además, `lang="es-AR"` en `layout.tsx:65`.

**Falla si:** queda alguna URL del sitemap sin `<link rel="canonical">`, o algún title con "TurnoGol · TurnoGol".

### 2.4 Hero en AVIF/WebP — Alto · S

**Qué:** `image-set()` con los `public/bg-hero-*.avif`/`.webp` que ya existen, dejando el PNG de respaldo.

**Por qué:** la home mobile baja unos 700 KB.

**Falla si:** el peso de la home mobile en Lighthouse no baja al menos 600 KB.

**Indicador:** la mediana del LCP mobile de laboratorio de la home.

### 2.5 Grafo JSON-LD (VIS-015) — Alto · M

**Qué:** Organization con `@id`, `description` (la frase canónica) y `sameAs` con perfiles reales; WebSite con `inLanguage es-AR`; SoftwareApplication con Offer en ARS derivado de `UNIFORM_PRICING`. Article completo: `datePublished` en `/vs` y `/alternativas`, `dateModified`, `publisher`, `image`. Todo el JSON-LD ya está escrito en `findings/schema.md`.

**Depende de:** 3.1, porque la `description` tiene que coincidir con la frase que diga el sitio. Se puede subir antes con la frase del plan.

**Falla si:** el Rich Results Test o el Schema Validator dan errores, o la `description` no coincide con el H1 y el primer párrafo de `/para-complejos`.

### 2.6 Sitemap honesto (VIS-014) — Medio · S

**Qué:**
- Fecha real por ruta, u omitir `lastmod` en las estáticas.
- Que las fichas dejen de usar un `updated_at` que se mueve con el refresh del token de MP.
- Loguear el `.catch` de `sitemap.ts:78`.

**Falla si:** dos requests separados por más de una hora devuelven `lastmod` distintos en las páginas estáticas.

---

## Fase 3 — Contenido y autoridad (mes 2)

### 3.1 La definición de la entidad (VIS-016/017/018) — Alto · M · **es el desbloqueador**

**Qué:**
- `/para-complejos` pasa a ser el hub "sistema de gestión para complejos de fútbol": title, H1 y primer párrafo con la frase canónica de `02-estrategia.md` §1, una sección por operación y entre 1.500 y 2.500 palabras.
- Home híbrida.
- En `/precios`, una frase citable: "ARS 30.000 por cancha por mes, vigente desde …".

**Por qué:** GEO, SXO, cluster y schema dependen de esta frase.

**Falla si:** a las 8 semanas Search Console da posición mayor a 30, o no da impresiones, para "sistema de reservas canchas de fútbol" / "sistema de gestión complejo de fútbol".

**Indicador:** cuántas respuestas de marca describen bien a TurnoGol (protocolo de `06-medicion.md`).

### 3.2 Comparativas con fuente (VIS-030/031/034) — Alto · L

**Qué:** `/comparar/turnogol-vs-atc-sports` y `/alternativas/atc-sports`, con tabla, precios con fuente y fecha, y 301 desde las URLs viejas. Antes de crear cualquier ruta, sumar `funciones`, `comparar`, `alternativas`, `guias`, `herramientas` y `nosotros` a `RESERVED_SLUGS`. La matriz de enlaces sale de `findings/cluster.md`.

**Depende de:** 1.1 y 3.1.

**Falla si:** alguna afirmación sobre un competidor queda sin fuente con fecha.

### 3.3 Corroboración externa (VIS-021/025) — Alto · S cada una (Lázaro)

**Qué:**
- Perfiles con la misma frase en G2/Capterra, LinkedIn y YouTube.
- Pedir la inclusión en las listas de Turnito, Clubbi y Clubin, con la plantilla P3 de `05-autoridad-externa.md`.
- El Vagón pone su link en su perfil de Google, con UTM: `?utm_source=google&utm_medium=organic&utm_campaign=gbp`.

**Falla si:** a las 6 semanas no hay ningún tercero indexado que nombre a TurnoGol.

### 3.4 `/nosotros` y legales con titular (VIS-019) — Alto · S · **requiere input**

**Qué:** razón social, CUIT y domicilio en `/privacidad` y `/terminos`, sin jerga interna. `/nosotros` como empresa, sin nombre propio.

### 3.5 Arreglos menores de UX

- La hamburguesa B2B a 320 px.
- La geolocalización, solo cuando el usuario toca algo.
- Un único H1 visible en la home mobile.
- El precio arriba en `/precios` mobile.
- Detalle en `findings/visual.md`.

---

## Fase 4 — Monitoreo (continuo)

- **Semanal:** impresiones y posición en Search Console para "TurnoGol", "sistema de reservas canchas de fútbol" y "software complejo de fútbol".
- **Semanal:** las respuestas de IA según `06-medicion.md`.
- **Mensual:** `/seo drift compare https://turnogol.app`.
- **Trimestral:** volver a correr `/seo audit https://turnogol.app`, que es la cadencia que corresponde a un SaaS B2B.

---

## REQUIERE INPUT (decisiones del dueño)

1. **Plazo de retención** que se publica: 14, 60 o 90 días. Hoy `/precios`, los mails y la decisión del 22/10 no coinciden.
2. **Titular en los legales**: quién figura sin exponer un nombre propio.
3. **Complejo Evardss**: ¿es un tenant de prueba que sale de `/explorar`, del sitemap y del índice?
4. **Precio**: ¿es final o más IVA? Hay que saberlo antes de la frase citable de 3.1.
5. **`/rival`**: ¿landing pública indexable? Hoy lo es en prod.
6. **Content-Signal** en robots.txt para el entrenamiento de IA: ¿se declara o se deja sin declarar?
7. **El Vagón**: ¿se normalizan en origen el nombre, la dirección y la ciudad? Tocar la ciudad cambia el filtro de `/explorar`, que compara por igualdad exacta.
8. **Matriz de user-agents** (`agentic_check.py --ua-matrix`): ¿autorizás correrla contra turnogol.app?

### Respuestas del dueño (2026-11-03)

1. Retención: **14 días de solo lectura** (decisión del 22/10). `/precios` y los mails se alinean a eso.
2. Titular en los legales: **por ahora nada**. La acción 3.4 queda bloqueada.
3. Evardss: **tenant de prueba**. Sale de `/explorar`, del sitemap y del índice.
4. Precio: **precio final** (sin "+ IVA").
5. `/rival`: **indexable**.
6. Content-Signal: **permitir todo** (`search=yes, ai-input=yes, ai-train=yes`).
7. El Vagón: **se normaliza con su OK**: primero se le pregunta cómo quiere figurar.
8. Matriz de user-agents: **autorizada**.

### Estado verificado el 2026-11-03

- **1.2 ya estaba hecha.** Search Console tiene la propiedad de dominio `sc-domain:turnogol.app`, verificada por DNS: hay dos TXT `google-site-verification` en Cloudflare. El sitemap se envió el 22/09/2026, Google lo leyó por última vez el 02/11, está correcto y descubrió 13 páginas. Bing Webmaster tiene el sitio y el sitemap (enviado el 31/10, correcto, 13 URLs). Esto también responde la P2 de `09-preguntas-abiertas.md`.
- **Línea base de Search Console (90 días, del 13/08 al 01/11):** 29 clics, 308 impresiones, CTR 9,4 %, posición media 5,5. Las consultas son solo de marca o de El Vagón ("tu gol", "el vagon lujan", "turnol", "tu gol app"). Cero impresiones para búsquedas de categoría.
- **Bing:** 0 clics y 1 impresión. Un solo backlink.
- **Foto drift "antes":** baselines 1 a 6 en `~/.cache/claude-seo/drift/baselines.db`, sin CWV porque no hay clave de PageSpeed. Cubre `/`, `/para-complejos`, `/precios`, `/explorar`, `/el-vagon-deportivo` y `/blog`. Ya muestra `/blog` sin canonical y el título duplicado en `/precios` y `/blog`.

## Orden de dependencias

```
1.1 ─────────────────────────┐
1.2 ─► 1.4                   ├─► 3.2
1.3                          │
3.1 (desbloqueador) ─► 2.5 ──┤
                    └► 3.3 ──┘
2.1, 2.2, 2.3, 2.4, 2.6  → paralelizables entre sí
```
