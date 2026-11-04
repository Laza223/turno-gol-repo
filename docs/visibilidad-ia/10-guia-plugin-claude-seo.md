# 10 — Guía del plugin claude-seo para TurnoGol

**Fecha:** 2026-11-02. Complementa el plan `00`–`09`: el plan dice QUÉ cambiar en el sitio; el plugin **mide y diagnostica** el sitio en vivo para confirmar el plan y comprobar que cada cambio funcionó.

## 0. Lo que tenés que saber antes de empezar

1. **El plugin analiza el sitio en vivo (`https://turnogol.app`), no el código.** Un cambio que todavía no está desplegado en producción no se ve. Por eso el orden importa: se mide ANTES de cada V del plan y DESPUÉS de que se despliega.
2. **El plugin no arregla nada.** Da reportes y recomendaciones. Los arreglos los hacen las sesiones V1–V8 del plan (`08-prompts-de-implementacion.md`). Sus recomendaciones son insumo, no veredicto: lo que choque con `07-riesgos-y-lineas-rojas.md` o con los vetos del `CLAUDE.md` pierde.
3. **Una sesión por fase, no una sola gigante.** Cada skill carga instrucciones y deja resultados largos en el contexto. En una sola sesión se acumulan y el modelo empieza a mezclar hallazgos de una skill con los de otra. Regla simple: cada sesión termina con los resultados guardados en un archivo, y la siguiente arranca leyendo ese archivo, no el chat.
4. **Dónde caen los resultados.** Las skills escriben en la carpeta desde donde abrís la sesión (por ejemplo `turnogol.app-audit/`). Por eso cada sesión de abajo empieza con un prefijo que les ordena guardar todo en `docs/visibilidad-ia/seo-plugin/`. Ahí no van capturas ni JSON gigantes al repo (el repo es público): si salen, quedan sin commitear.
5. **Costo: $0.** Todo lo que está marcado USAR es gratis. Lo que pide pagar (DataForSEO, Ahrefs, SE Ranking, Profound) NO se usa: el plan es presupuesto $0 (D8).
6. **Una advertencia sobre tu regla "subagentes solo Sonnet, máximo 6".** `/seo-audit` lanza unos 10 agentes a la vez y 4 de los agentes del plugin son Opus (`seo-geo`, `seo-sxo`, `seo-content`, `seo-cluster`/`seo-drift`). Las skills sueltas lanzan 1 o 2. Por eso esta guía usa las skills sueltas casi siempre y deja `/seo-audit` para una sola corrida al final (sesión G). Si no querés ni esa, salteala: no se pierde nada importante.

**Cómo se escribe cada comando.** Las dos formas hacen lo mismo:
- Corta: `/seo-page https://turnogol.app`
- Larga, con la skill principal: `/seo page https://turnogol.app` (el menú la muestra como `claude-seo:seo`)

---

## 1. Qué hace cada skill y si te sirve

26 skills. Veredicto: **USAR** (ahora), **DESPUÉS** (más adelante, con condición) o **NO** (no aplica a TurnoGol, con motivo).

### Auditorías

| Skill | Qué hace, en criollo | Veredicto |
|---|---|---|
| `/seo-page <url>` | Revisa UNA página a fondo: título, descripción, encabezados, contenido, imágenes, schema, velocidad | **USAR**. Es la más rápida para probar que todo anda |
| `/seo-technical <url>` | Revisa lo técnico: si Google puede rastrear e indexar, robots, canonicals, seguridad, móvil, renderizado | **USAR** |
| `/seo-audit <url>` | Auditoría de todo el sitio con ~10 agentes en paralelo. Da un puntaje 0–100 y un plan por prioridad. Tarda 10–15 min | **DESPUÉS** (sesión G). Pesada y con agentes Opus |
| `/seo-drift baseline\|compare\|history <url>` | "Git del SEO": saca una foto de lo que importa de una página (título, canonical, schema, etc.) y después compara contra esa foto | **USAR**. Es la forma de comprobar que cada V mejoró y no rompió nada |

### Técnico

| Skill | Qué hace | Veredicto |
|---|---|---|
| `/seo-sitemap <url>` | Valida el `sitemap.xml` (formato, URLs, fechas). `generate` crea uno nuevo | **USAR** solo para validar. No generar: TurnoGol ya genera el suyo en `src/app/sitemap.ts` |
| `/seo-schema <url>` | Detecta y valida el marcado Schema.org (JSON-LD). Puede generar uno nuevo | **USAR**. El plan ya sabe que el logo de Organization da 404 y faltan WebSite/SoftwareApplication/Offer |
| `/seo-images <url>` | Revisa texto alternativo, peso, formatos (WebP/AVIF), carga diferida, que no salte el layout | **USAR** una vez, sobre home y `/explorar` |
| `/seo-hreflang <url>` | Revisa versiones por idioma o país | **NO**. El plan prohíbe versiones por país (no hay tracción fuera de Luján) |
| `/seo-programmatic` | Planifica páginas generadas en masa desde datos | **NO**. Son "doorway pages" (páginas por ciudad sin datos): línea roja del plan |
| `/seo-google <comando>` | Datos reales de Google: PageSpeed, velocidad medida con usuarios reales (CrUX), Search Console, indexación | **USAR** (con clave gratis). Ver sesión D |

### IA y agentes

| Skill | Qué hace | Veredicto |
|---|---|---|
| `/seo-geo <url>` | Mide qué tan "citable" es el sitio para ChatGPT, Perplexity, Gemini y los AI Overviews: acceso de los bots, estructura de párrafos, señales de marca | **USAR**. Es el corazón del plan de visibilidad IA |
| `/seo-agentic <url>` | Revisa si agentes de IA pueden leer y usar el sitio: `robots.txt`, Content-Signal, `llms.txt`, Markdown, WebMCP. Modo `fix` redacta arreglos | **USAR**. Recordá: `llms.txt` es higiene, no mueve resultados (plan §"qué NO hacer") |
| `/seo-sxo <url> [palabra clave]` | Compara tu página con lo que Google muestra para esa búsqueda y detecta si es el tipo de página equivocado. Puntúa desde la mirada de cada tipo de usuario | **USAR**. Explica por qué `/para-complejos` no rankea (hoy vende "señas" y la gente busca "gestión") |

### Contenido y estrategia

| Skill | Qué hace | Veredicto |
|---|---|---|
| `/seo-content <url>` | Evalúa utilidad, E-E-A-T (experiencia, autoridad, confianza), legibilidad, contenido pobre y frases típicas de texto de IA | **USAR** sobre home, `/para-complejos`, `/precios` y un artículo del blog |
| `/seo-content-brief <tema o url> [tipo]` | Genera un brief para escribir una página: palabras por sección, competidores, dónde ubicar cada palabra clave | **USAR** antes de V4/V5. Ya hay briefs en `04-contenidos.md`: sirve para contrastar |
| `/seo-cluster <palabra clave>` | Agrupa búsquedas por parecido de resultados y diseña la estructura "página madre + páginas hijas" | **USAR** una vez, con "sistema de gestión para complejos de fútbol" |
| `/seo-plan saas` | Plan estratégico por tipo de negocio | **USAR** como contraste. El plan real ya existe (`00`–`09`): no lo reemplaza |
| `/seo-flow [etapa] [url]` | Biblioteca de 41 prompts por etapa (Encontrar, Aprovechar, Optimizar, Ganar). Muestra los más útiles para tu caso | **DESPUÉS**. Opcional: etapas `find` y `win` |
| `/seo-competitor-pages [url\|generate] [competidor]` | Arma páginas "X vs Y" y "alternativas a X": estructura, matriz de funciones, schema | **DESPUÉS**, en V5. Solo con datos que tengan fuente y fecha (decisión D3) |
| `/seo-backlinks <url>` | Perfil de enlaces que apuntan al sitio. Gratis: Common Crawl; opcional: claves gratis de Moz y Bing | **USAR** una vez para confirmar el diagnóstico "nadie nos nombra" |

### Local y comercio

| Skill | Qué hace | Veredicto |
|---|---|---|
| `/seo-local <url>` | Revisa SEO local: ficha de Google, direcciones, reseñas, schema local | **NO** para turnogol.app (es un SaaS sin local físico). Útil más adelante para ayudar a un cliente, por ejemplo la ficha de Google de El Vagón (VIS-025) |
| `/seo-maps` | Seguimiento de posición en el mapa por cuadrícula, reseñas de Google | **NO**. Pide DataForSEO (pago) para lo mejor |
| `/seo-ecommerce` | Fichas de producto, Shopping, Amazon | **NO**. TurnoGol no es tienda |

### Extensiones

| Skill | Qué hace | Veredicto |
|---|---|---|
| `/seo-dataforseo` | Datos en vivo de buscadores: volumen, SERP, enlaces | **NO**. Es paga |
| `/seo-image-gen` | Genera imágenes con Gemini (OG, portadas) | **NO**. Pide extensión y clave de Gemini, y TurnoGol ya genera su imagen social en `src/app/opengraph-image.tsx` |
| `/seo` (la principal) | Reparte hacia todas las anteriores y suma `/seo setup` y `/seo doctor` | Solo para `setup` y `doctor` |

---

## 2. El camino completo, sesión por sesión

Mapa de cómo se cruza con el plan:

| Sesión | Qué es | Cuándo | Relación con el plan |
|---|---|---|---|
| **A** Setup | Dejar el plugin andando | Hoy, 10 min | Ninguna |
| **B** Diagnóstico técnico | Foto técnica y detección de lo que el plan no vio | **Después de V0 y antes de V1** | Contrasta `01-auditoria.md`. Termina con la foto "antes" (drift) |
| **C** Diagnóstico de IA | Qué tan citable y legible es el sitio para las IAs | Junto con B | Contrasta `02-estrategia.md` |
| **D** Datos de Google | Velocidad real, Search Console, enlaces | Clave de PageSpeed: ya. Search Console: después de VIS-002 | Alimenta `06-medicion.md` |
| **E** Contenido y estrategia | Brief, clústeres, comparativas | Antes de V3 (reenfoque) y V5 (comparativas) | Contrasta `04` y `02 §6` |
| **F** Control | `drift compare` | **Al final de cada V**, después de desplegar | Verifica V1, V2, V3… |
| **G** Auditoría completa | Puntaje del sitio entero | Tras V3 (aprox. 12/12/2026) | Cierra la Etapa 1 |

**Orden recomendado:** A → (V0 del plan) → B + C → D → V1 → F → V2 → F → E → V3 → F → G → … → E de nuevo antes de V5.

### Sesión A — Setup (una vez)

Abrí una sesión nueva en la raíz del repo y escribí:

```text
/seo setup
```

Esperá a que termine (instala un entorno de Python y un Chromium solo para el plugin, sin tocar el resto de tu sistema). Después:

```text
/seo doctor
```

**Qué tiene que decir:** que el runtime y Chromium están listos. Si dice que falta algo, pegame el mensaje. Requiere Python entre 3.11 y 3.14.

---

### Sesión B — Diagnóstico técnico (solo lectura)

**Pegá este prefijo primero**, así queda todo ordenado:

```text
Reglas de esta sesión: solo lectura sobre producción (https://turnogol.app). No toques src/ ni ningún archivo del repo. Guardá cada resultado en docs/visibilidad-ia/seo-plugin/ con el nombre AAAA-MM-DD-<skill>.md. No pegues claves ni leas .env. Al final, listame los hallazgos que NO estén ya en docs/visibilidad-ia/01-auditoria.md.
```

Después, de a una, en este orden (esperá a que cada una termine):

```text
/seo-page https://turnogol.app
```
```text
/seo-page https://turnogol.app/para-complejos
```
```text
/seo-page https://turnogol.app/precios
```
```text
/seo-technical https://turnogol.app
```
```text
/seo-sitemap https://turnogol.app/sitemap.xml
```
```text
/seo-schema https://turnogol.app
```
```text
/seo-images https://turnogol.app
```

**Qué buscar:** el plan ya conoce estos problemas (están en `01-auditoria.md`): `robots.txt` que bloquea por prefijo (T-01), contenido de fichas dentro de `<div hidden>` (T-02), `lang="es"` en vez de `es-AR` (T-04), falta de canonical y títulos duplicados "TurnoGol · TurnoGol" (T-05), logo de Organization con 404 (T-06). **Si el plugin los encuentra, es una confirmación independiente.** Lo valioso son los hallazgos que NO estén ahí.

**Cierre de la sesión B: la foto "antes".** Esto es lo que después permite comprobar que V1–V3 mejoraron algo:

```text
/seo-drift baseline https://turnogol.app
```

Repetilo para estas URLs (una por comando): `/para-complejos`, `/precios`, `/explorar`, `/el-vagon-deportivo`, `/blog`.

**Qué hacer con el resultado:** pasalo a la sesión V1 como "el plugin además detectó X". No arregles nada en esta sesión.

---

### Sesión C — Diagnóstico de IA (solo lectura)

Prefijo igual que en B, y después:

```text
/seo-geo https://turnogol.app
```
```text
/seo-geo https://turnogol.app/para-complejos
```
```text
/seo-agentic https://turnogol.app
```
```text
/seo-sxo https://turnogol.app/para-complejos sistema de gestión para complejos de fútbol
```
```text
/seo-sxo https://turnogol.app/precios precio sistema gestión complejo de fútbol
```

**Qué buscar:**
- `/seo-geo`: si los bots de IA pueden entrar (el plan dice que sí, pero verificá), y qué párrafos del sitio son citables. Si dice "no hay texto citable que describa qué es TurnoGol", confirma el diagnóstico del plan (la frase de `02-estrategia.md §1` no está en el sitio).
- `/seo-agentic`: el puntaje X/N de Lighthouse Agentic Browsing y qué falta. **No te dejes llevar por `llms.txt` ni WebMCP**: son higiene o experimentales.
- `/seo-sxo`: si dice "tipo de página equivocado" para `/para-complejos`, eso respalda a V3.

**Prohibido hacer acá:** `/seo-agentic fix` (redacta cambios en `robots.txt` y `llms.txt`). Si querés ver los arreglos, corrélo después, dentro de la sesión V1, que ya trabaja con el plan.

---

### Sesión D — Datos de Google

Los comandos de **Nivel 0** (PageSpeed y velocidad real de usuarios) solo necesitan una clave gratis de Google. Search Console necesita que el dominio esté verificado, que es la tarea VIS-002 del plan: **hacela antes**.

```text
/seo-google setup
```

Seguí los pasos que te da (crear una clave de API en Google Cloud). **La clave nunca se pega en el chat**: el comando te dice dónde guardarla. Después:

```text
/seo-google pagespeed https://turnogol.app
```
```text
/seo-google crux https://turnogol.app
```

Si `crux` dice que no hay datos suficientes, es normal: el sitio tiene poco tráfico. Anotalo y seguí.

**Después de VIS-002 (Search Console verificado):**

```text
/seo-google gsc sc-domain:turnogol.app
```
```text
/seo-google inspect https://turnogol.app/para-complejos
```
```text
/seo-google sitemaps sc-domain:turnogol.app
```

(El formato de la propiedad es el que te muestre Search Console; `sc-domain:` es para verificación por DNS.)

**Y una vez, para confirmar el diagnóstico "nadie nos nombra":**

```text
/seo-backlinks https://turnogol.app
```

Gratis, con Common Crawl. Espero un resultado casi vacío: eso es lo que hay que cambiar con los perfiles externos (`05-autoridad-externa.md`). **No** configures GA4 ni Matomo: no los usás, medís con Vercel Analytics (VIS-007).

---

### Sesión E — Contenido y estrategia (antes de V3 y de V5)

Prefijo igual que en B, y después:

```text
/seo-content https://turnogol.app
```
```text
/seo-content https://turnogol.app/para-complejos
```
```text
/seo-cluster sistema de gestión para complejos de fútbol
```
```text
/seo-content-brief sistema de gestión para complejos de fútbol landing
```
```text
/seo-plan saas
```

**Qué hacer con los resultados:**
- Compará `/seo-cluster` y `/seo-content-brief` con `04-contenidos.md`. Si el plugin propone temas que el plan no tiene, anotalos como **candidatos**, no como tareas.
- `/seo-plan saas` sirve de segunda opinión. Si contradice una decisión D1–D8, **gana la decisión**.
- **Línea roja:** no copies números, rankings ni "el mejor". El plugin escribe genérico y puede inventar cifras. Cada dato lleva fuente y fecha (`07`).

**Solo antes de V5 (comparativas):**

```text
/seo-competitor-pages generate Vibe
```

Repetilo con CanchaFija, Clubin y ATC. El plugin arma la estructura (matriz de funciones, schema). **Los datos los ponés vos con fuente y fecha**; los que no tengan fuente no se publican.

**Opcional:** `/seo-flow find https://turnogol.app` y `/seo-flow win https://turnogol.app` dan prompts de análisis. No hace falta para avanzar.

---

### Sesión F — Control después de cada V (5 min)

Cuando una V se despliega en producción, en una sesión chica:

```text
/seo-drift compare https://turnogol.app
```

Repetilo con las mismas URLs de la sesión B. **Qué mirar:**
- Lo que cambió coincide con lo que la V prometía (por ejemplo, tras V1: `lang="es-AR"`, canonical, títulos de hasta 60 caracteres).
- No aparece nada rojo que no esperabas (un `noindex` donde no corresponde, un canonical roto, schema que desapareció).

`/seo-drift history <url>` te muestra todas las comparaciones de una URL. Si algo salió mal, ya tenés la foto exacta de cuándo.

---

### Sesión G — Auditoría completa (una sola vez, tras V3)

```text
/seo-audit https://turnogol.app
```

Tarda 10 a 15 minutos y reparte el trabajo entre varios agentes. Deja `turnogol.app-audit/FULL-AUDIT-REPORT.md` y `ACTION-PLAN.md`. Al final ofrece un PDF: aceptalo si querés tener el "después" para mostrar.

**Para qué sirve:** un puntaje global que se puede comparar con la sesión B. Ojo con el costo: es la única corrida que usa varios agentes Opus. Si preferís no gastarlo, hacé la sesión F y dejá esta afuera.

---

## 3. Qué NO hacer con este plugin

- No correr `/seo-audit` cada semana. El seguimiento semanal es la medición manual de `06-medicion.md`; el plugin se usa en las 7 sesiones de arriba.
- No usar `/seo-sitemap generate`, `/seo-schema` en modo generar ni `/seo-agentic fix` para escribir en producción. Los arreglos pasan por las sesiones V del plan, con Plan Mode y tests.
- No instalar las extensiones pagas (DataForSEO, Ahrefs, SE Ranking, Profound).
- No usar `/seo-programmatic` ni `/seo-hreflang`: el plan los descarta.
- No publicar ningún número del reporte del plugin sin verificar la fuente.

## 4. Si algo no anda

- El comando no aparece: reiniciá la sesión de Claude Code, el plugin se carga al arrancar.
- Pide "setup required": corré `/seo setup` y volvé a probar. No instales nada a mano con `pip`.
- `/seo doctor` te dice el estado del entorno sin cambiar nada.
- El plugin tiene un hook que valida el JSON-LD cada vez que se edita un archivo; no hace falta tocar nada, pero si ves mensajes de "validate-schema" al editar, son de él.
