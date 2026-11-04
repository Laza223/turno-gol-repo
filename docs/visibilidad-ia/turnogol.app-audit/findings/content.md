# Content Quality, E-E-A-T y On-Page — turnogol.app

Fecha: 2026-11-02. Alcance: las 13 URLs del sitemap en vivo. Solo lectura del repo.
Estado: COMPLETO.

## 0. Puntajes

| Métrica | Puntaje | Comentario corto |
|---|---|---|
| **Content Quality (0-100)** | **52** | Copy B2B de `/precios` y `/para-complejos` es claro y concreto; el resto es delgado, sin fuentes, con promesas que ya no son ciertas y con páginas ilegibles o huérfanas. |
| **On-Page SEO (0-100)** | **62** | H1 único y metadata única en todo; pero 6/13 sin canonical, 5/13 con la marca duplicada en el title, 3 huérfanas y `lastmod` falso en 8 URLs. |
| E-E-A-T (modelo interno) | 41 | Experiencia 45 · Expertise 40 · Autoridad 20 · Confianza 55. Ponderado 20/25/25/30 (modelo de este skill, no de Google). |
| AI citation readiness | 45 | `/precios` (FAQPage + cifras) y `/para-complejos` (pasos con números) se pueden citar; la home, las comparativas y las fichas no. |
| Metadata templated (script) | `site_risk: low`, `templated_ratio: 0.0` | Sin CTA compartido. Ver §5. |

El puntaje de Content Quality es un juicio ponderado (profundidad 50, exactitud de claims 40, E-E-A-T 41, frescura 40, legibilidad 80, unicidad 85, marcadores de IA 55). `content_quality.py` está calibrado para inglés (filler/AI-pattern dan 0 en todo): lo usé solo como señal direccional (rango 64-92 por página, el piso es la home por texto repetido).

## 1. Método y salvedades

- Fetch en vivo con `curl` de las 13 URLs (todas 200, 2026-11-02 ~15:00 UTC), parseo con un extractor propio (stdlib), más `robots.txt`, `sitemap.xml`, `llms.txt`. Capturé una pantalla del artículo del blog para verificar legibilidad.
- Contrasté contra `content/` y `src/app/**`. **El working tree (`feat/panel-mobile-denso`) está atrasado respecto de lo desplegado**: `src/app/sitemap.ts` no emite `/rival` y `robots.ts:42` trae `'/rival$'`, pero el sitemap y el robots en vivo sí tienen `/rival` y solo `Disallow: /rival/`. Para `/rival` valen los datos en vivo, no el árbol local.
- Este informe re-verifica en vivo lo que ya listaba `docs/visibilidad-ia/01-auditoria.md` (31/10) y agrega lo que ese informe no tiene. Marco cada hallazgo como **[YA EN PLAN: id]** o **[NUEVO]**. Ninguno de los hotfix de VIS-006 está desplegado al 2026-11-02.
- Legibilidad: Szigriszti-Pazos (INFLESZ) con conteo silábico heurístico propio; es una aproximación, sirve para comparar páginas, no para citar el número.
- Límite: no verifiqué datos de competidores contra sus sitios; clasifico sus claims como "sin fuente en la página", no como falsos (salvo donde un doc interno ya los desmiente).
- Las restricciones del dueño se respetan: voz de empresa, sin nombre propio en la web y sin datos de clientes (plan de visibilidad, D6). Las recomendaciones de E-E-A-T van por entidad y fuentes, no por biografías personales.

## 2. Inventario por página

Palabras = contenido principal sin navegación ni pie. Mínimos del skill = pisos de cobertura temática, no factor de ranking.

| URL | Tipo | Palabras | Mínimo | Title (car.) | Desc (car.) | Canonical | H1 / H2 | JSON-LD | Inbound (páginas) | INFLESZ |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Home | 66 (99 con chrome; hero repetido) | 500 | 50 | 87 | sí | 1 / 0 | Organization, WebSite | 12 (footer) | 68 |
| `/explorar` | Listado | 165 | n/a | 49 | 139 | sí | 1 / 0 (H3 saltea H2) | BreadcrumbList | 6 | n/a (UI) |
| `/para-complejos` | Servicio | 497 | 800 | 68 | **170** | sí | 1 / 4 | ninguno | 12 | 82 |
| `/precios` | Precios | 772 | n/a | 54 (marca x2) | 112 | sí | 1 / 6 | FAQPage | 5 | 86 |
| `/blog` | Índice | 33 | n/a | 51 (marca x2) | 73 | **no** | 1 / 1 | ninguno | 5 | n/a |
| `/blog/mejores-sistemas-...-2026` | Post | 421 | 1.500 | **96** (marca x2) | 119 | **no** | 1 / 5 (+1 H3) | Article | **1** | 71 |
| `/vs/alquila-tu-cancha` | Comparativa | 549 | 1.500 | **81** (marca x2) | 144 | **no** | 1 / 6 | Article (sin fecha) | **0** | 68 |
| `/alternativas-alquila-tu-cancha` | Comparativa | 431 | 1.500 | **75** (marca x2) | 143 | **no** | 1 / 6 | Article (sin fecha) | **0** | 67 |
| `/rival` | Producto B2C | 2.071 | n/a | 37 | **176** | sí | 1 / 9 (+H3) | ninguno | **0** | 80 |
| `/privacidad` | Legal | 1.214 | n/a | 33 | 73 | **no** | 1 / 9 | ninguno | 12 | 55 |
| `/terminos` | Legal | 1.523 | n/a | 33 | **42** | **no** | 1 / 11 | ninguno | 12 | 58 |
| `/el-vagon-deportivo` | Ficha | 64 | 500-600 | 30 (doble espacio) | **63** | sí | 1 / 1 | SportsActivityLocation, Breadcrumb | 1 | n/a |
| `/complejo-evardss` | Ficha | 59 | 500-600 | 27 | **46** | sí | 1 / 1 | SportsActivityLocation, Breadcrumb | 1 | n/a |

Lectura:
- **Duplicados de cuerpo: bajos.** Jaccard de shingles de 5 palabras entre pares de las páginas editoriales y comerciales: máximo 0,025 (blog vs `/vs` vs `/alternativas`). Lo repetido es el bloque de CTA del shell, no el texto.
- **Legibilidad: buena donde importa.** `/precios` (86) y `/para-complejos` (82) están en "muy fácil"; editoriales 67-71 ("normal"); legales 55-58 ("algo difícil", esperable). Voseo consistente, frases de 10-13 palabras.
- **Largo:** ninguna página editorial ni ficha llega a su piso temático. El problema no es el conteo sino que lo que falta es sustancia (tabla, precios con fuente, fecha, ejemplos), ver CQ-07 y CQ-12.

## 3. E-E-A-T (qué se ve en el HTML)

| Factor | Peso | Puntaje | Evidencia a favor | Evidencia en contra |
|---|---|---|---|---|
| Experiencia | 20% | 45 | Detalles operativos que solo conoce quien vive el negocio: hold de 6 minutos, "segunda ausencia en 90 días, 14 días de bloqueo", "el que te escribe a las 11 de la noche", cuándo llega el aviso (8 h). Mock-ups marcados "Ejemplo" (honesto). Dos fichas reales de Luján. | Cero capturas reales del producto, cero caso, cero cita de cliente (veto del dueño a publicar clientes: esto hay que suplir con datos propios medidos, no con testimonios). |
| Expertise | 25% | 40 | Dominio visible en `/para-complejos`, `/precios` (FAQ de AFIP, "¿y si TurnoGol cierra?") y en los legales (ARCO, AAIP, Disp. 11/2006). | Ninguna página editorial dice quién la escribió (JSON-LD `author: Organization`, invisible para el lector); cero enlaces salientes a fuentes en las 3 páginas editoriales; sin credenciales ni método ("cómo comparamos"). |
| Autoridad | 25% | 20 | `Organization` + `WebSite` en la home. | Sin `sameAs` (hay Instagram), logo roto (`/icon` 404), sin `/nosotros`, sin perfiles G2/Capterra/LinkedIn, sin menciones de terceros; los PRs del repo público salen antes que el sitio para "TurnoGol" (`01-auditoria.md` E-01); confusión de marca con TurnosGol (E-04). |
| Confianza | 30% | 55 | HTTPS, política y términos con fecha ("Última actualización"), emails de contacto (hola@, privacidad@), WhatsApp, precio público, la sección "Cuándo NO elegir TurnoGol", "no hacemos facturación AFIP", sub-encargados nombrados, aviso de que el asistente de WhatsApp es un programa. | Titular sin identificar (CQ-04), CTA a número inexistente (CQ-01), promesas desactualizadas (CQ-06), claims de competidores sin fuente (CQ-03), jerga interna en legales. |
| **Ponderado** | | **41** | | |

## 4. Preparación para citas de IA (por página)

| Página | Score | Qué ayuda | Qué falta |
|---|---|---|---|
| `/precios` | 70 | FAQPage con 7 respuestas autónomas; cifras (30 días, $30.000, 10% anual, 14 días de bloqueo); H2 en forma de pregunta. | La frase "$30.000 por cancha por mes" solo vive en la meta description; el HTML muestra "3 canchas $90.000/mes" (estado por defecto del selector) y "desde $30.000/mes". Sin ARS, sin vigencia, sin IVA, sin `Offer`/`SoftwareApplication` (CQ-10). |
| `/para-complejos` | 60 | Pasos numerados con datos concretos; tabla mental de "si no paga / si no viene". | H1 es un slogan ("Chau, reserva de palabra."); no hay frase de definición de la categoría; sin JSON-LD (C-02). |
| `/privacidad`, `/terminos` | 50 | Secciones numeradas, fechas, plazos. | Jerga interna y titular ausente (CQ-04). |
| `/rival` | 45 | FAQ clara con "Ya disponible / Próximamente". | Mucho "Próximamente" que un modelo puede citar como existente; sin schema; 3 repeticiones de la escalera de categorías en el HTML (CQ-14). |
| Fichas | 40 | JSON-LD `SportsActivityLocation` completo (dirección, horarios, geo). | 60-80 palabras visibles, sin descripción, sin servicios ni precios en texto. |
| Editoriales | 35 | Estructura H2 por opción; "Cuándo NO elegir". | Sin tabla, sin precios, sin fuentes, sin fecha visible en 2 de 3, TurnoGol se pone primero sin declararlo. |
| Home | 15 | Organization + WebSite + SearchAction. | ~50 palabras únicas, no dice qué es TurnoGol para un dueño (CQ-05). |

## 5. Plantillado de metadata (heurístico, `metadata_template.py`)

- `pages_checked: 13`, `templated_count: 0`, `templated_ratio: 0.0`, `shared_cta_phrases: {}`, `site_risk: low`.
- Único flag: `/rival` `brand_suffix_in_description` (severidad low). Es un falso positivo razonable: la descripción termina con "El lado jugador de TurnoGol." como frase escrita, no como sufijo concatenado. Info.
- Riesgo de escala (no detectado hoy, solo 2 fichas): `src/app/(public)/[slug]/(perfil)/page.tsx:128` genera `Reservá una cancha en ${tenant.name}, ${tenant.city}.` para todos los complejos. Con 50 fichas serán 50 descripciones con la misma forma y ~45 caracteres. Ver CQ-12.
- Sí hay un problema de metadata distinto al plantillado: marca duplicada y títulos largos (CQ-09).

## 6. Hallazgos

Severidades: Critical / High / Medium / Low / Info. No hay Critical: nada bloquea la indexación ni expone datos.

### CQ-01 · HIGH · CTA de `/vs/alquila-tu-cancha` apunta a un número placeholder [YA EN PLAN: C-05 (parcial); NUEVO: causa raíz y candado]
- **Evidencia:** `content/pages/vs-alquila-tu-cancha.mdx:40` → `[👉 Empezá tu prueba gratis de 30 días acá](https://wa.me/5491100000000)`. En vivo, el HTML de `/vs/alquila-tu-cancha` contiene `wa.me/5491100000000` (el único con ese número; los demás usan `5492323346976`). `src/lib/contact.ts:9-15` cuenta que este mismo placeholder ya se publicó y se "arregló" el 2026-08-09 solo en `ArticleShell`. El test `tests/unit/contact-whatsapp.test.ts` recorre solo `src/` y solo `.ts/.tsx` (`walk(join(root,'src'))`, regex `\.(ts|tsx)$`), por eso un `.mdx` en `content/` pasa.
- **Impacto:** el único CTA contextual de la página lleva a un número inexistente; reincidencia de un bug ya conocido.
- **Fix:** (1) cambiar el link por `contactWhatsappUrl(...)` o, en MDX, por el número de `CONTACT_WHATSAPP_DIGITS`; mejor: sacar el link y dejar solo el CTA del shell. (2) Extender el candado: `walk` también sobre `content/` y la extensión `.mdx`.
- **Cómo sabríamos que falló:** `curl -s https://turnogol.app/vs/alquila-tu-cancha | grep -c 5491100000000` debe dar 0; `grep -rn "wa.me/[0-9]" content/` sin resultados; el test ampliado falla si se reintroduce.

### CQ-02 · HIGH · Las 3 páginas editoriales son ilegibles para una persona (contraste) y el H1 queda bajo el header [YA EN PLAN: C-06 (parcial); NUEVO: verificado con captura]
- **Evidencia:** `src/components/site/ArticleShell.tsx:40,51` pone H1/H2 en `text-gray-900`, la descripción en `text-gray-500` (:43,:47) y el cuerpo usa `prose` sin tokens (:49), dentro de `src/app/(business)/layout.tsx:14` (`bg #020617`, siempre oscuro). Captura de `/blog/mejores-sistemas-...-2026` en desktop: H1, H2 y las negritas ("Por qué destaca:", "Sistema Anti-Ausencias:") casi no se ven (texto gris oscuro sobre casi negro); el H1 además queda parcialmente tapado por el header fijo. La fecha se muestra como ISO crudo (`2026-07-12`).
- **Impacto:** un humano que llega desde una cita de IA no puede leer el artículo; los bots sí (HTML intacto). Mata conversión y señal de calidad por rebote.
- **Fix:** pasar el shell y `Mdx` a los tokens del layout oscuro (`text-foreground`, `prose-invert`), agregar `pt` para el header fijo, formatear la fecha ("12 de julio de 2026").
- **Cómo sabríamos que falló:** axe/Lighthouse contraste AA sin errores en las 3 URLs; captura 1440 y 390 px con H1 completo visible; contraste calculado de H1 y cuerpo ≥ 4,5:1.

### CQ-03 · HIGH · Claims de competidores sin fuente ni fecha, y uno contradicho por docs internos [YA EN PLAN: C-04/C-05, VIS-006 (alcance parcial); NUEVO: contradicción con evidencia interna y desajuste del set de competidores]
Tabla de claims verificables vs sin fuente:

| Claim (archivo:línea) | Tipo | Estado |
|---|---|---|
| "el 60% de las canchas hoy sigue usando esto" (blog `.mdx:39`) | Estadística de mercado | Sin fuente. |
| ATC "líder indiscutido en tamaño y cantidad de complejos" (blog `:22`) | Superlativo | Sin fuente. |
| "perdiste $30.000 pesos irrecuperables" (blog `:44`) | Cifra ilustrativa presentada como hecho | Sin fuente; además coincide con el precio por cancha y el copy "se pague solo con un turno por mes" (`:50`). |
| Don Potrero: "clásico del interior" (blog `:31`) vs "presencia en muchas provincias, app muy conocida" (alternativas `:23`) y "interfaz desactualizada, enfocada en PC" (`:24`) | Hechos y juicio sobre un tercero | Sin fuente, distinto entre páginas. |
| Turnito: "muy barato, incluso versiones gratuitas limitadas" (alternativas `:30`) | Precio de un tercero | Sin fuente ni fecha. |
| EasyCancha: "muy fuerte en Chile y creciendo en Argentina", "suele ser el más caro de la lista", "comisiones por pago integrado" (alternativas `:35,:38`) | Posición y precio | Sin fuente ni fecha. |
| ATC: "el complejo suele quedar atrapado en el sistema de pagos", "comisiones de procesamiento si usás su pasarela" (vs `:21,:26`) | Condiciones comerciales | Sin fuente. |
| Alternativas `:7,:15-17`: ATC "caro" frente a TurnoGol "más económico... Muy accesible" | Comparación de precio | **Contradicha por `docs/gtm/12-guiones-validados-competencia.md:18`: "No decir 'más barato que ATC' — verificado FALSO en 3 y 6 canchas (red team 2026-07-18)"**; y `docs/visibilidad-ia/02-estrategia.md:98` lo repite. ATC: USD 50 (1-3 canchas), 80 (4-6), 100 (7+) (`02-estrategia.md:193`). |
| TurnoGol: "bloquea por 14 días" a quien "reserva y no asiste" (alternativas `:15`) | Regla propia | Incompleta: `/para-complejos` dice "segunda ausencia en 90 días"; blog y vs dicen "reincide". Alternativas lo presenta como castigo a la primera falta. |

- **Set de competidores:** las 3 páginas comparan contra ATC, Don Potrero, Turnito y EasyCancha. El relevamiento propio (30/10) encontró que ChatGPT recomienda Vibe, CanchaFija y Clubin (`02-estrategia.md:190-196`). Las páginas actuales no compiten por las consultas donde se decide la recomendación. Ya lo cubre la Etapa 2 (`/comparar/...`).
- **Fix inmediato (VIS-006, ampliar):** borrar o respaldar con fuente y fecha cada fila de la tabla anterior; sacar "más económico / muy accesible / caro" mientras no haya tabla de precios; igualar la regla del bloqueo a "segunda ausencia en 90 días". Mantener la sección "Cuándo NO elegir TurnoGol" (es lo mejor de la página). Tabla con "según su web al DD/MM/AAAA" y enlace a la fuente. Esto es compatible con D3 (comparativas agresivas con datos con fuente y fecha: lo inventado es lo único que pierde).
- **Cómo sabríamos que falló:** `grep -iE "60%|indiscutido|más caro|muy accesible|atrapado" content/` sin resultados; cada fila de competidor con enlace de fuente y fecha; revisión trimestral con fecha visible.

### CQ-04 · HIGH · Páginas legales sin titular identificado, con jerga interna y con una frase que ya no es cierta [NUEVO]
- **Titular ausente:** `/privacidad` §1 dice que TurnoGol "actúa como responsable del tratamiento" sin razón social, CUIT, domicilio ni forma jurídica; `/terminos` tampoco. Solo hay `privacidad@turnogol.app`. Ni en estas dos páginas ni en el pie hay nombre de empresa, dirección ni CUIT (`grep` de "CUIT", "razón social", "domicilio", "S.A.S", "S.R.L" sobre el texto de las 13 páginas: 0 resultados). No existe `/nosotros` ni `/contacto` (todas devuelven 404). Es la mayor brecha de Confianza del sitio.
- **Jerga interna publicada:** `terminos/page.tsx:57-58` ("Conforme al ADR-011… versión v1"), `:79` ("ADR-012"), `:150-154` (estados `past_due`, `suspended`, `churned`), `:234` (`banned`), `:272` ("requisitos no funcionales (doc5)"); `privacidad/page.tsx:62` ("ADR-012"), `:103` y `:230` ("En v1"), `:191` ("tenants churned"), y menciona el endpoint `/api/player/data-export`. Un ADR o un doc5 no le dicen nada al lector, y "SLA del 0,5% mensual previsto en doc5" es un compromiso que nadie puede verificar.
- **Frase desfasada:** `privacidad/page.tsx` §8: la inscripción en el Registro Nacional de Bases de Datos "se encuentra en trámite previo al lanzamiento comercial", con el servicio ya vendiendo (30 días gratis, cliente real). Hay que actualizarla o dejarla verdadera.
- **RIVAL fuera de los legales:** `/rival` ofrece "Entrás con Google o con tu email", avisos por mail del tablón y compartir el WhatsApp tras aceptar; `/privacidad` y `/terminos` no mencionan RIVAL (0 ocurrencias), Google solo aparece en "Google Analytics", y el texto dice "En v1 no enviamos comunicaciones de marketing" (el aviso del tablón es opt-in, pero conviene decirlo).
- **Fix:** (a) bloque "Titular del servicio" con los datos de la persona jurídica o fiscal que corresponda (ver REQUIERE INPUT 1); (b) reemplazar ADR/doc5/estados internos por lenguaje llano ("cuenta suspendida", "datos del complejo: 90 días tras la baja"); (c) agregar RIVAL (datos, Google como proveedor de acceso, aviso por mail, WhatsApp tras aceptación); (d) revisar con abogado: yo no verifiqué normativa.
- **Cómo sabríamos que falló:** `grep -E "ADR-|doc5|past_due|churned|\bv1\b" ` sobre el HTML de ambas páginas sin resultados; `grep -i "CUIT"` con match; búsqueda de "RIVAL" y "Google" en `/privacidad` con match.

### CQ-05 · HIGH · La home no dice qué es TurnoGol para un dueño y casi no tiene texto [YA EN PLAN: C-01]
- **Evidencia:** 66 palabras de contenido (99 con chrome), H1 "Tu partido empieza en TurnoGol", 0 H2; `Tu partido empieza en` aparece 4 veces en el HTML (hero de escritorio + móvil), lo que baja la unicidad a ~50 palabras. Descripción de 87 caracteres. Enlaces: solo `/explorar`, `/para-complejos` y legales; ninguno a `/precios`, `/blog`, `/rival`. `src/app/page.tsx:13-19`.
- **Impacto:** es la página que una IA abre para "¿qué es TurnoGol?" y no encuentra la categoría ni el público (dueños de complejos de fútbol), ni el precio.
- **Fix:** D1 (home híbrida) ya decidida: banda para dueños con la frase canónica de categoría, enlaces a `/precios` y `/para-complejos` y resumen de 3-4 hechos citables. Evitar que el hero duplicado cuente dos veces en el HTML (renderizar una sola versión o `aria-hidden`/`hidden` coherente).
- **Cómo sabríamos que falló:** home con ≥ 300 palabras únicas, ≥ 1 H2, `grep -c "sistema de gestión para complejos de fútbol"` ≥ 1 en el HTML crudo, enlaces a `/precios` y `/para-complejos` en `<main>`.

### CQ-06 · HIGH · Promesas publicadas que describen funciones eliminadas, números sin medir o datos que se contradicen entre páginas [YA EN PLAN: VIS-006 (parcial); NUEVO: marcado lo que VIS-006 no cubre]
Cada una obliga como oferta (Ley 24.240 art. 8, según `07-riesgos`; sin verificar con abogado).
- "**cierre diario**": `precios/page.tsx:30` y blog `.mdx:18` ("todo en un solo cierre diario"); VIS-006 solo greppea `precios/` y `register/`: no cubre el del blog ni `para-complejos/page.tsx:207` ("en un solo cierre"). `.claude/rules/caja.md:11`: "Caja del día (apertura/cierre/arqueo) se eliminó"; hoy existe el libro de la noche con resumen automático.
- "**datos disponibles 60 días**" (`precios/page.tsx:84`) vs **90 días** tras la baja (`terminos/page.tsx:154`, `privacidad/page.tsx:191`) vs decisión de 14 días de solo lectura (`docs/decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md`, citada en `01-auditoria.md` C-03e). Tres plazos distintos en tres superficies.
- "**20 minutos**" (`precios/page.tsx:43,409`) sin medir.
- "**Cada reserva y cada seña van completas a tu MercadoPago**" (`precios/page.tsx:72`) vs `/vs` (`.mdx:27`): "pagás solo el costo financiero normal de MP". "Completas" se lee como sin descuento; MercadoPago cobra su comisión. Nuevo.
- "**recordatorios**" entre las notificaciones operativas al jugador (`privacidad/page.tsx:88`): no existe plantilla ni worker de recordatorio al jugador (`src/modules/notifications/templates/` y `src/shared/jobs/workers/` no lo tienen; `CLAUDE.md` lo declara eliminado en v1). Nuevo.
- "**alquiler de pelotas**" como algo que se carga en la caja (blog `.mdx:18`): no hay función con ese nombre; solo catálogo de cantina. Nuevo, verificar.
- Terminos §6 (`terminos/page.tsx:127`): "un importe por la primera cancha, más un importe fijo por cada cancha adicional" cuando `/precios` y el catálogo son $30.000 por cancha, primera incluida. No es falso (ambos valen lo mismo) pero se lee como dos precios.
- **Fix:** una sola tabla de hechos (`docs/decisions/`) con plazo de retención, cierre, tiempos y comisión de MP; todas las superficies la leen. Ampliar el grep de VIS-006 a `blog`, `para-complejos`, `privacidad` y `terminos`.
- **Cómo sabríamos que falló:** `grep -rniE "cierre diario|un solo cierre|60 días|20 minutos|completas|recordatorios" content/ src/app/(business) src/app/(public)` sin resultados salvo los que la tabla de hechos confirme.

### CQ-07 · MEDIUM · Páginas editoriales: lista autopromocional sin declarar, sin autor visible, sin fechas de actualización y con marcadores de contenido genérico [YA EN PLAN: C-04, C-06; NUEVO: marcadores de calidad]
- **Evidencia:** el post "Los Mejores Sistemas…" pone "1. TurnoGol" primero sin decir que lo escribe TurnoGol (el JSON-LD sí dice `author: Organization TurnoGol`, la página no muestra byline). `vs` y `alternativas` no muestran fecha (la fecha `2026-07-12` está en el frontmatter, `vs-...mdx:4`) y su Article no tiene `datePublished`. El post dice "Análisis actualizado" con una única fecha de julio, 4 meses antes. Títulos con "(2026)" y sin fecha de revisión. Cero enlaces salientes a fuentes. Cero tablas.
- **Marcadores de contenido genérico (QRG sept. 2025):** viñetas sin especificidad ("Entiende la idiosincrasia del jugador de fútbol argentino", "Tiene módulos específicos para gestión de campeonatos largos" para Don Potrero), expresiones de relleno ("sin transpirar", "sin vueltas"), la misma plantilla Pro/Contra/Por qué destaca en las tres páginas, mismo H2 de CTA (`ArticleShell.tsx:51`) repetido, sin evidencia de uso de los productos comparados ni método. No afirmo que sea generado por IA; son los marcadores que el QRG señala como baja calidad aunque sea humano.
- **Fix:** el plan ya lo resuelve con una guía única "Cómo elegir" y comparativas con tabla (VIS-030/031, B-07/B-08). Mientras tanto: byline visible "Equipo TurnoGol", párrafo de declaración ("TurnoGol escribe esta guía y es uno de los sistemas comparados"), fecha de publicación y de revisión visibles, y `dateModified` en JSON-LD.
- **Cómo sabríamos que falló:** byline y fecha visibles en las 3 URLs; `dateModified` presente; tabla de comparación con ≥ 4 filas fechadas; ≥ 3 enlaces salientes a fuentes de competidores.

### CQ-08 · MEDIUM · Enlazado interno: 3 huérfanas y cuerpos sin enlaces [YA EN PLAN: C-05 (parcial); NUEVO: `/rival` y matriz]
Entrantes por página (de las 13, sin contar CTA): `/vs/alquila-tu-cancha` **0**, `/alternativas-alquila-tu-cancha` **0**, `/rival` **0**, el post **1** (solo `/blog`), las dos fichas **1** cada una (solo `/explorar`), `/precios` 5 (solo páginas de marketing: la home, `/explorar`, los legales y las fichas no la enlazan), `/blog` 5. Ninguno de los cuerpos MDX tiene un enlace interno (ni `/precios` ni `/para-complejos`); solo el header y el CTA del shell.
- **Impacto:** Google y los rastreadores de IA llegan a `/vs`, `/alternativas` y `/rival` solo por el sitemap; sin enlaces no heredan señales de la home.
- **Fix:** enlazar `/vs` y `/alternativas` desde `/blog` y `/precios`; enlazar `/rival` desde la home (banda "jugadores") y `/explorar`; en cada artículo, enlazar `TurnoGol` → `/para-complejos` y "precio" → `/precios` en la primera mención.
- **Cómo sabríamos que falló:** el rastreo de enlaces internos muestra ≥ 2 entrantes para cada URL del sitemap (Screaming Frog o el script del §1) y ninguna URL a profundidad ≥ 3.

### CQ-09 · MEDIUM · Canonical, títulos y `lastmod` [YA EN PLAN: T-05, T-07; confirmado en vivo]
- **Canonical ausente (y `og:url`) en 6 de 13:** `/blog`, el post, `/vs`, `/alternativas`, `/privacidad`, `/terminos`. Usan metadata plana en vez de `buildMetadata` (`blog/page.tsx:4-7`, `blog/[slug]/page.tsx:22`, `vs/.../page.tsx:12`, `alternativas/.../page.tsx:12`).
- **Marca duplicada en 5 títulos:** `layout.tsx:33` pone `%s · TurnoGol`, y las páginas ya agregan `| TurnoGol` (o "— TurnoGol para…") → "… | TurnoGol · TurnoGol" en `/blog`, el post, `/vs`, `/alternativas` y `/precios`. Largos 96, 81, 75 caracteres (4 títulos > 60 contando `/para-complejos` con 68).
- **Descripciones:** > 160 car.: `/para-complejos` (170), `/rival` (176) → se truncan. < 70 car.: `/terminos` (42), fichas (46 y 63).
- **`lastmod` falso:** las 8 URLs estáticas del sitemap muestran `2026-11-02T14:44:58Z` (hora del build) cuando su contenido no cambió; el contenido editorial sí usa `2026-07-12`.
- **Otros:** `<html lang="es">` frente a `es_AR` (T-04); `og:type: website` en artículos; la home canonicaliza sin barra final (`https://turnogol.app`) mientras el sitemap usa `/` (inocuo).
- **Fix:** pasar todo por `buildMetadata` con `titleAbsolute`, títulos ≤ 60, descripciones 110-155, fecha real por página en el sitemap.
- **Cómo sabríamos que falló:** crawler: 0 páginas indexables sin canonical, 0 títulos con la marca repetida, 0 títulos > 60 salvo excepciones; `lastmod` distintos entre páginas y anteriores a "hoy" para lo estático.

### CQ-10 · MEDIUM · El precio de `/precios` no es una oración citable, y la ficha de precios tiene huecos [YA EN PLAN: C-03 (parcial); NUEVO: estado por defecto y IVA]
- **Evidencia:** en el HTML crudo, "$30.000 por cancha al mes" aparece solo en la meta description (`precios/page.tsx:13`). El cuerpo muestra el selector en su estado por defecto: "Para 3 canchas… 3 canchas $90.000 /mes" y "TurnoGol sale desde $30.000 /mes"; el texto "por cancha" no figura en el cuerpo con monto. Un modelo puede citar "$90.000/mes" o "desde $30.000" sin la unidad. Tampoco figura el precio anual (el toggle "Anual −10%" no muestra monto en el HTML estático), ni "ARS", ni vigencia, ni si incluye IVA (0 ocurrencias de "IVA" o "impuestos" en las 13 páginas).
- **Fix:** una oración fija arriba: "TurnoGol cuesta $30.000 por cancha por mes (ARS), la primera incluida; pagando por año, $27.000 por cancha por mes. Vigente desde el 20/10/2026". Más `Offer`/`SoftwareApplication` en JSON-LD (el plan ya lo prevé, E-02). La línea de IVA solo después de la respuesta de REQUIERE INPUT 3.
- **Cómo sabríamos que falló:** `curl https://turnogol.app/precios | grep -c "por cancha"` con la cifra al lado ≥ 1 en el cuerpo; Rich Results Test sin errores en `SoftwareApplication`.

### CQ-11 · MEDIUM · Entidad y autoridad: sin página de empresa, sin corroboración externa, esquema incompleto [YA EN PLAN: E-02, E-03, E-07, T-06; confirmado en vivo]
- `/nosotros`, `/contacto`, `/ayuda`, `/faq`, `/funciones` → 404. `https://turnogol.app/icon` (el `logo` del Organization) → 404, mientras `/icon.png` → 200. Organization sin `sameAs` (Instagram existe en el pie), `contactPoint`, `areaServed`, `@id`. Cero enlaces salientes desde páginas editoriales o comerciales a una fuente externa; los únicos externos son `wa.me`, Instagram y, en la privacidad, la AAIP.
- **Fix dentro de las decisiones del dueño:** `/nosotros` en voz de empresa (Luján, julio de 2026, solo fútbol, qué hace, cómo contactar, política editorial y de datos), sin nombre propio ni Axxen; `sameAs` con las cuentas reales; logo válido. Las citas externas (G2/Capterra) ya están en curso (`05-autoridad-externa.md`).
- **Cómo sabríamos que falló:** `/nosotros` responde 200 con canonical; `https://turnogol.app/<logo>` 200 con ≥ 112 px; Rich Results Test: Organization sin advertencias; búsquedas de marca (punto de control 01/02/2027).

### CQ-12 · MEDIUM · Fichas de complejo: delgadas, con datos sucios y sin diferenciación [YA EN PLAN: C-09, T-11 (parcial); NUEVO: detalles de datos]
- **Evidencia:** 59-64 palabras; sin descripción del complejo, sin servicios ni precio en texto (en `/explorar` sí aparece "desde $6.000 por jugador · $60.000 el turno" para Evardss); 0 imágenes en Evardss (OG genérico `/opengraph-image`), 1 en El Vagón. Nombre con espacio final ("El vagón Deportivo ") → title con doble espacio, descripción "Deportivo , Lujan", `og:title` con espacio, JSON-LD `name` con espacio. `addressLocality: "Lujan, Buenos Aires"` (debería ser "Luján") y `/explorar` pinta "Lujan, Buenos Aires , Buenos Aires". Horarios visibles `08:00 – 00:00` frente a `closes: 23:59` en el JSON-LD de Evardss. La descripción es la misma plantilla con el nombre y la ciudad (`(perfil)/page.tsx:128`).
- **Fix:** `trim()` y normalización al guardar el nombre y al generar metadata; "Luján" con tilde; descripción con 2-3 datos reales (formatos, superficie, servicios, "turnos de 60 min", política de seña); no inventar contenido por complejo (línea roja 3 de `07-riesgos`).
- **Cómo sabríamos que falló:** title, description y JSON-LD sin doble espacio ni coma suelta; ≥ 120 palabras visibles por ficha con datos del propio complejo; Rich Results Test sin advertencias.

### CQ-13 · MEDIUM · Posicionamiento contradictorio entre páginas [NUEVO]
- `/alternativas` y `/vs` dicen que TurnoGol "no tiene app de jugadores que te traiga jugadores nuevos" y "es una herramienta de gestión para tus clientes actuales" (alternativas `:16`, vs `:33`). Pero la home, `/explorar` ("Descubrí complejos de fútbol en tu ciudad") y `/rival` ("el lado jugador de TurnoGol", "la plataforma de los futboleros") presentan a TurnoGol como marketplace y red de jugadores. Una IA que lea ambas no puede resumir qué es.
- Además: llms.txt dice "ATC Sports" y las páginas "Alquila Tu Cancha (ATC)".
- **Fix:** una frase canónica de categoría para todas las superficies (C-10) y una explicación honesta: "TurnoGol no capta jugadores nuevos para tu complejo; el buscador y RIVAL sirven a jugadores que ya buscan cancha". Unificar "ATC Sports (Alquila Tu Cancha)".
- **Cómo sabríamos que falló:** el mismo descriptor en title de home, `llms.txt`, Organization, og:description y `/para-complejos`; test manual en 3 motores con "¿Qué es TurnoGol?".

### CQ-14 · MEDIUM · `/rival`: mucho "Próximamente" citable como existente, texto repetido y sin esquema [NUEVO]
- 2.071 palabras, la mayor parte de lo descripto es "Próximamente" (club, categoría, Corona, tabla, Temporada Cero). La meta description (176 car.) lista esas funciones futuras. La escalera de categorías (Novena…Selección) se repite en el HTML (11 ocurrencias de "Novena") por los selectores de la demo, y las letras "M J L F N T R G S" y "A R M A L O" ensucian el texto extraído. Sin JSON-LD, huérfana (CQ-08).
- **Impacto:** un modelo puede responder "RIVAL tiene clubes y tablas". El propio sitio dice que no (D: "cada parte se publica cuando ande").
- **Fix:** describir en la description solo lo "Ya disponible"; dejar "Próximamente" en una sección propia con `aria` de "en desarrollo"; marcar los elementos decorativos de la demo `aria-hidden` para que no entren al texto; agregar `WebApplication`/`FAQPage` solo para lo disponible.
- **Cómo sabríamos que falló:** la description ≤ 155 car. y sin "Corona/club/tabla"; el texto extraído sin secuencias de iniciales sueltas.

### CQ-15 · LOW · Jerarquía de encabezados [NUEVO salvo la home]
- Post: `###` "¿Cuál elegir?" cuelga del H2 "4. El Cuaderno + Excel" (debería ser H2); además el shell agrega otro H2 de CTA idéntico en las tres páginas. `/explorar`: H3 en las tarjetas sin H2. Home: 0 H2. Fichas: solo "Horarios". `/precios`: el H1 se compone con `<br>` y el texto lee "turno,una vez al mes" (sin espacio), y el primer H2 es "TurnoGol" (nombre de plan, sin contenido). `/para-complejos`: H1 es slogan sin palabra clave.
- **Fix:** H2 para la conclusión; H2 descriptivo en `/precios` ("Precio de TurnoGol por cancha"); `{' '}` antes del `<br>`.
- **Cómo sabríamos que falló:** el outline de cada página sin saltos de nivel (lint de headings) y H1 sin concatenaciones.

### CQ-16 · LOW · JSON-LD de los artículos y de las páginas de producto [YA EN PLAN: C-06, E-02]
- `ArticleShell.tsx:17,31`: `addFaqSchema` llega y se descarta (`_addFaqSchema`) y las páginas lo pasan `true` sin que haya FAQ: prop muerta. Article sin `image`, `publisher`, `mainEntityOfPage`, `dateModified`; `/vs` y `/alternativas` sin `datePublished`. `/para-complejos` y `/rival` sin JSON-LD; ninguna página con `SoftwareApplication`/`Offer`.
- **Cómo sabríamos que falló:** Rich Results Test/validator de schema.org sin campos faltantes recomendados.

### CQ-17 · LOW · `llms.txt` [YA EN PLAN: C-08]
- Sin precio, sin prueba de 30 días, sin enlaces a `/blog`, `/vs`, `/alternativas`, `/rival`, `/privacidad`, `/terminos`; nombra "ATC Sports" y "Turnito" sin enlace. Es higiene: no está probado que mueva citas.

### CQ-18 · INFO · Lo que funciona
- H1 único en las 13 páginas; metadata única (ningún título ni descripción repetido); `robots.txt`/`sitemap.xml` correctos y sin bloqueo a bots de IA; `/precios` con FAQPage legible, incluyendo "¿Y si TurnoGol cierra?" y "¿Me hace la factura?" (honestidad que construye confianza); `/para-complejos` con datos concretos y reglas exactas (seña, 6 minutos, 90 días, 14 días); mock-ups marcados "Ejemplo"; la sección "Cuándo NO elegir TurnoGol" en `/vs`; legales con fecha visible; legibilidad alta en el copy comercial; sin duplicados de cuerpo.

## 7. REQUIERE INPUT (decisiones de negocio, no las apliqué)

1. **Titular de los legales (CQ-04):** ¿hay una persona jurídica o una inscripción fiscal que pueda figurar como "titular del servicio" (razón social, CUIT, domicilio) sin exponer un nombre propio? Si el titular es una persona física, figurar implica su nombre y choca con la decisión de "sin nombre propio" (D6). Qué dato va y cuál no lo decide el dueño con su contador/abogado.
2. **Retención de datos del complejo (CQ-06):** ¿60, 90 o 14 días de solo lectura? Las tres cifras están publicadas. La decisión `2026-10-22-solo-lectura-al-vencer-la-prueba.md` dejó la retención como REQUIERE INPUT.
3. **IVA (CQ-10):** ¿el precio publicado es "final" o "+ IVA"? una nota interna indica "precio final" sin decision doc; no está escrito en ninguna página.
4. **Declaración de autoría (CQ-07):** ¿la guía "Cómo elegir" lleva "Escrito por Equipo TurnoGol, que es uno de los sistemas comparados"? Es mi recomendación; es una decisión de tono.
5. **Registro AAIP (CQ-04):** ¿se actualiza la frase "en trámite previo al lanzamiento comercial"? Depende del estado real del trámite.

## 8. Orden sugerido (de menor a mayor esfuerzo, impacto primero)

1. CQ-01 (1 línea + candado). 2. CQ-06 y CQ-03 (borrar lo falso, ampliar el grep de VIS-006). 3. CQ-02 (contraste, antes de promocionar las guías). 4. CQ-09 (canonical/títulos, `buildMetadata`). 5. CQ-04 (jerga y RIVAL en legales; titular tras la respuesta). 6. CQ-08 (enlaces internos). 7. CQ-05, CQ-10, CQ-13 (home/precio/categoría, con la Etapa 1 del plan). 8. CQ-11, CQ-12, CQ-14 y el resto con las etapas 2-3.

## 9. Datos estructurados para `audit-data.json` (Content Quality)

```json
{
  "category": "Content Quality",
  "date": "2026-11-02",
  "scores": { "content_quality": 52, "on_page_seo": 62, "eeat": 41, "eeat_breakdown": { "experience": 45, "expertise": 40, "authoritativeness": 20, "trustworthiness": 55 }, "ai_citation_readiness": 45 },
  "metadata_templating": { "site_risk": "low", "templated_ratio": 0.0, "shared_cta_phrases": [] },
  "findings": [
    { "id": "CQ-01", "severity": "High", "urls": ["/vs/alquila-tu-cancha"], "title": "CTA a wa.me/5491100000000 (placeholder)", "evidence": "content/pages/vs-alquila-tu-cancha.mdx:40; tests/unit/contact-whatsapp.test.ts solo escanea src/*.ts(x)", "status": "known-in-plan:C-05" },
    { "id": "CQ-02", "severity": "High", "urls": ["/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026", "/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha"], "title": "Artículos ilegibles: text-gray-900 sobre #020617; H1 tapado por header", "evidence": "src/components/site/ArticleShell.tsx:40,51; src/app/(business)/layout.tsx:14; captura", "status": "known-in-plan:C-06" },
    { "id": "CQ-03", "severity": "High", "urls": ["/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026", "/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha"], "title": "Claims de competidores sin fuente; 'más económico/muy accesible' contradicho por docs/gtm/12:18", "status": "known-in-plan:C-04,C-05 + new" },
    { "id": "CQ-04", "severity": "High", "urls": ["/privacidad", "/terminos"], "title": "Titular sin identificar; jerga interna (ADR-011/012, doc5, past_due, churned); RIVAL y Google fuera de los legales", "status": "new" },
    { "id": "CQ-05", "severity": "High", "urls": ["/"], "title": "Home de ~66 palabras sin definición de categoría ni enlaces a /precios, /blog, /rival", "status": "known-in-plan:C-01" },
    { "id": "CQ-06", "severity": "High", "urls": ["/precios", "/para-complejos", "/privacidad", "/terminos", "/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026"], "title": "Promesas desactualizadas o contradictorias: cierre diario, 60/90/14 días, 20 minutos, 'completas', recordatorios, pelotas", "status": "known-in-plan:VIS-006 (parcial) + new" },
    { "id": "CQ-07", "severity": "Medium", "urls": ["/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026", "/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha"], "title": "Lista autopromocional sin declarar, sin byline, sin fechas de revisión, marcadores de contenido genérico", "status": "known-in-plan:C-04 + new" },
    { "id": "CQ-08", "severity": "Medium", "urls": ["/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha", "/rival"], "title": "3 páginas huérfanas; cuerpos MDX sin enlaces internos", "status": "known-in-plan:C-05 + new" },
    { "id": "CQ-09", "severity": "Medium", "urls": ["/blog", "/blog/*", "/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha", "/privacidad", "/terminos"], "title": "Sin canonical (6/13), marca duplicada en 5 títulos, títulos >60, lastmod falso", "status": "known-in-plan:T-05,T-07" },
    { "id": "CQ-10", "severity": "Medium", "urls": ["/precios"], "title": "Precio por cancha no figura como oración en el cuerpo; sin ARS/vigencia/IVA/Offer", "status": "known-in-plan:C-03 + new" },
    { "id": "CQ-11", "severity": "Medium", "urls": ["/", "/nosotros"], "title": "Sin /nosotros, logo 404, Organization sin sameAs, sin corroboración externa", "status": "known-in-plan:E-02,E-03,E-07,T-06" },
    { "id": "CQ-12", "severity": "Medium", "urls": ["/el-vagon-deportivo", "/complejo-evardss"], "title": "Fichas delgadas con datos sucios (espacio final, Lujan, 23:59)", "status": "known-in-plan:C-09,T-11 + new" },
    { "id": "CQ-13", "severity": "Medium", "urls": ["/", "/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha", "/rival", "/explorar"], "title": "Posicionamiento contradictorio (marketplace vs 'no traemos jugadores')", "status": "new" },
    { "id": "CQ-14", "severity": "Medium", "urls": ["/rival"], "title": "Funciones 'Próximamente' en la description, texto repetido, sin schema", "status": "new" },
    { "id": "CQ-15", "severity": "Low", "urls": ["/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026", "/explorar", "/precios", "/"], "title": "Jerarquía de encabezados", "status": "new" },
    { "id": "CQ-16", "severity": "Low", "urls": ["/blog/*", "/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha", "/para-complejos", "/rival"], "title": "JSON-LD incompleto; addFaqSchema prop muerta", "status": "known-in-plan:C-06" },
    { "id": "CQ-17", "severity": "Low", "urls": ["/llms.txt"], "title": "llms.txt sin precio ni enlaces editoriales", "status": "known-in-plan:C-08" }
  ]
}
```
