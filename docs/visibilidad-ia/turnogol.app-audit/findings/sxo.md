# SXO — turnogol.app (análisis SERP hacia atrás)

Fecha de observación (SERP, competidores y prod): 2026-11-02. Auditor: agente SXO. Solo lectura del repo.

Convenciones:
- Toda cita `archivo:línea` es del **árbol local**, que está 34 commits atrás de origin/main. Puede no coincidir con prod. Lo que se afirma de prod salió de `curl`/`render_page.py` contra https://turnogol.app el 2026-11-02 y se marca "prod".
- Las SERPs se observaron con la herramienta WebSearch (no es Google directo; ver Limitaciones). No se pudo observar PAA, ads, AI Overview, featured snippets ni local pack.
- El puntaje es el **SXO Gap Score** (0-100, más alto = menos brechas). No es el SEO Health Score.

---

## 1. Hallazgo principal (lidera): el desajuste NO es de tipo de página en el B2B, es de vocabulario; y sí hay desajuste de tipo en el B2C y en los artículos

| Página | Keyword objetivo | Tipo observado en la SERP (consenso) | Tipo de la página | Severidad |
|---|---|---|---|---|
| `/para-complejos` | "sistema de reservas / software / gestión para canchas de fútbol" | Landing SaaS, 6 de 10 (60%) | Landing | Tipo ALIGNED. Vocabulario: **HIGH** |
| `/precios` | "precio software canchas", "cuánto cuesta un sistema para canchas" | Páginas de planes/precios de proveedores (ATC `/software-gestion-deportiva`, Don Potrero Amateur/Pro) | Pricing/Landing | Tipo ALIGNED. Vocabulario: MEDIUM |
| `/` | "reservar cancha de fútbol online" | Marketplaces + páginas de complejos, ~80% | Landing con buscador (27 palabras, 0 H2) | **HIGH** |
| `/explorar` | "canchas de fútbol 5 en Luján" | Directorios locales, redes y avisos, ~6 de 9 | Listado único, una sola URL para todas las ciudades | **HIGH** |
| `/vs/alquila-tu-cancha`, `/alternativas-alquila-tu-cancha` | "alternativas a alquila tu cancha" | Comparación/listicle de proveedor con tabla | Comparación en prosa, sin tabla | **HIGH** (Blog sin comparación estructurada, per taxonomía) |
| `/blog/mejores-sistemas-...-2026` | "mejores sistemas de gestión canchas fútbol Argentina 2026" | Listicle de proveedor con tabla, byline, fecha | Blog listicle sin tabla ni byline | **HIGH** |

Consenso por keyword (SERP observada 2026-11-02):

- **K1 "sistema de gestión y reservas para complejos de fútbol 5 Argentina software dueños de canchas"** (modo extendido). 10 resultados: Canchero, CanchaFija (home), Reservalo.ar, AROL Reservas, Don Potrero, Tiki Taka (landing SaaS = 6/10, 60%); Dónde Juego (híbrido); CanchaFija `/canchas-de-futbol` y una ficha de complejo (listado/local = 2); un repo de GitHub (1). La versión corta "sistema de reservas para canchas de fútbol" (modo estándar) devolvió sobre todo tesis universitarias (~11 de 14) más Anolla y CanchaYa: el head term está contaminado y los proveedores ganan con calificadores ("Argentina", "complejos", "gestión").
- **K2 "canchas de fútbol 5 reservar online Buenos Aires turnos libres hoy"** (extendido). Sitios propios de complejos (Fútbol Retiro, Distrito Fútbol, SB5 Sports, Fútbol Point = 4); marketplaces/listados (Golero con página `/canchas/buenos-aires/colegiales/futbol-5`, tucanchaya.com, Dónde Juego x2 = 4); un blog de precios (TuCancha, "Cuánto cuesta alquilar cancha de fútbol 5 en 2026"); un resultado ruido. Dominante: Local + marketplace, ~80%.
- **K3 "canchas de fútbol 5 en Luján alquilar reservar"** (extendido). argentino.com.ar (2 directorios), una página de Facebook (Canchas El Trébol), avisos de MercadoLibre y Negozona, Dónde Juego, alquilacancha.com, Spot Cinco. **Ningún resultado de Luján con reserva online propia.** Competencia débil. No apareció ninguna URL de turnogol.app (ni `/el-vagon-deportivo` ni `/complejo-evardss`) en esos resultados.
- **K4 "alternativas a alquila tu cancha"** (estándar). Solo prensa sobre ATC (Forbes Argentina, Infonegocios, iProUP, descubre.vc). **Cero páginas de alternativas dedicadas.** SERP abierta. La variante extendida "mejores sistemas para administrar canchas de fútbol comparativa alternativas Alquila Tu Cancha" sí devolvió: Turnito (`turnito.app/blog/las-mejores-apps-de-reservas-para-clubes-en-argentina-2026/`, comparación con tabla), Agendit (PY), Ubitec, ATC `/sistema-de-gestion-de-clubes`, YouTube.

Dato de contexto que cambia el encuadre de las páginas "vs ATC" (observado 2026-11-02): **ATC migró de `alquilatucancha.com` a `atcsports.io`** (301 en la home, `/club` y `/zones/...`; `/club` sigue a `clubes.atcsports.io`). La marca pública pasó a "ATC / ATC Sports / ATC Manager". Las páginas de TurnoGol usan solo "Alquila Tu Cancha".

---

## 2. Hallazgos priorizados

Cada uno: severidad, evidencia (con fecha), fix, cómo sabríamos que falló.

### H1. Las páginas de dinero B2B no hablan el idioma de la SERP — HIGH

- **Evidencia (prod, 2026-11-02).** `/para-complejos` y `/precios` tienen **0 ocurrencias** de "sistema de reservas", "software", "gestión", "turnero", "programa", "sistema de turnos", "alquiler de canchas". `/para-complejos` usa "sistema de señas" (2 veces), una categoría que ningún competidor usa. Title: "TurnoGol para complejos — El sistema de señas para canchas de fútbol" (68 caracteres); H1: "Chau, reserva de palabra." (`src/app/(business)/para-complejos/page.tsx:14-19`, árbol local). `/precios`: H1 "Lo que te deja un turno, una vez al mes." (slogan, sin keyword).
- **SERP observada (K1, 2026-11-02).** Don Potrero, H1 "Sistema de gestión de turnos y reservas para Canchas y Clubes"; Reservalo.ar, URL `/sistema-de-reservas/canchas` y título "Sistema de reservas para canchas de fútbol, pádel y tenis"; Anolla, H1 "Software de reservas de campos de fútbol"; AROL, "sistema de gestión de canchas"; Canchero, "Software de gestión para clubes deportivos". El tipo de página coincide (Landing), pero el lenguaje de la consulta no está en title, H1, H2 ni en el body.
- **Fix.** (a) Title: "Sistema de reservas para complejos de fútbol | TurnoGol" (~52 caracteres). (b) Mantener el hook "Chau, reserva de palabra." como línea de marca, pero con un H1 o eyebrow descriptivo visible y rastreable: "Sistema de reservas y gestión de turnos para complejos de fútbol". (c) Un H2 que nombre lo que hace en el vocabulario del mercado ("Software de gestión: grilla, caja, cantina, abonados") y entradas "software", "turnos", "gestión" en el cuerpo. (d) Mismo tratamiento en `/precios` (title "Precio del sistema de reservas para canchas | TurnoGol"). Ver REQUIERE INPUT 1.
- **Cómo sabríamos que falló.** A las 8 semanas del deploy, en Search Console, `/para-complejos` con impresiones nulas o posición media peor que 30 para consultas que contengan ("sistema" o "software" o "gestión") + "canchas"; o CTR menor a 1% con impresiones. Segundo control: repetir K1 a las 4 y 8 semanas y registrar si la URL aparece (umbral propuesto: top 20 a las 8 semanas).

### H2. Las 3 páginas editoriales están huérfanas, sin canonical y con título duplicado — HIGH

- **Evidencia (prod, 2026-11-02).** Crawl de 9 páginas clave: `/vs/alquila-tu-cancha` y `/alternativas-alquila-tu-cancha` **no tienen ningún enlace interno entrante** (solo el sitemap). `/blog` lista únicamente el post de "mejores sistemas"; el post no enlaza a `/vs`, a `/alternativas` ni a `/para-complejos`. Las páginas de artículo tampoco enlazan a `/para-complejos` (solo `/precios`, `/blog`, `/login`, `/register` y WhatsApp). La home solo enlaza a `/explorar` y `/para-complejos`.
- **Sin canonical (prod).** `curl` sobre `/vs/...`, `/alternativas-...`, `/blog/...` y `/blog` no devuelve `<link rel="canonical">` (sí lo devuelven home, `/para-complejos`, `/precios`, `/explorar`). Causa en el árbol local: las 3 rutas arman metadata a mano en vez de `buildMetadata` (`src/app/(business)/vs/alquila-tu-cancha/page.tsx:7-15`, `src/app/(business)/alternativas-alquila-tu-cancha/page.tsx:7-15`, `src/app/(business)/blog/[slug]/page.tsx:14-24`), y `buildMetadata` es la que pone `alternates.canonical` (`src/lib/seo/metadata.ts:68`).
- **Título con la marca duplicada (prod).** "… | TurnoGol — TurnoGol": el page agrega `| TurnoGol` (`vs/.../page.tsx:12`, `blog/[slug]/page.tsx:22`) y el template del layout vuelve a agregar el sufijo. Largos de título: vs 81, alternativas 75, blog 96 caracteres (se truncan en la SERP); `/precios` también duplica ("Precios — TurnoGol para complejos de fútbol — TurnoGol", `precios/page.tsx:12`).
- **Fix.** Pasar las 3 rutas a `buildMetadata({ ..., titleAbsolute: true })` con títulos de ≤60 caracteres (p. ej. "TurnoGol vs ATC (Alquila Tu Cancha): cuál elegir | TurnoGol"). Enlazar: post de "mejores sistemas" → `/vs/...` y `/alternativas-...`; `/vs` y `/alternativas` → `/precios` y `/para-complejos`; footer o nav "Comparativas" desde `/para-complejos` y `/precios`; `/blog` como índice con los tres artículos.
- **Cómo sabríamos que falló.** `curl` a las 4 URLs sin `rel=canonical`; Search Console → Páginas: "Descubierta, actualmente sin indexar" o "Duplicada, Google eligió otra canónica" para esas URLs; conteo de enlaces internos entrantes (Screaming Frog/crawl propio) igual a 0 para `/vs` y `/alternativas`.

### H3. Afirmaciones sin verificar o contradichas por la fuente, y sin el formato que gana (tabla, precios, byline) — HIGH

- **Evidencia (árbol local + prod, 2026-11-02).**
  - `content/pages/vs-alquila-tu-cancha.mdx:26` dice que en ATC "hay comisiones de procesamiento si usás su pasarela". La página de ATC (`clubes.atcsports.io`, 2026-11-02) afirma "Los precios son fijos y sin comisiones" y el FAQ de `atcsports.io/software-gestion-deportiva` dice que el único costo es la suscripción (acepta tarjeta, transferencia y MercadoPago). No pudimos verificar comisiones de la pasarela de tarjetas; la afirmación queda sin fuente.
  - `content/pages/alternativas-alquila-tu-cancha.mdx:19` describe a Don Potrero como "plataforma histórica… con muchos años en el mercado" y "interfaz desactualizada, enfocada en PC". La página de Don Potrero (`donpotrero.com/gestion-de-turnos-y-reservas-canchas-y-clubes-de-futbol`, 2026-11-02) no declara años de mercado, dice "desde cualquier dispositivo y sin necesidad de Apps" y ofrece plan Amateur gratis + Pro, con la comisión de pago online a cargo de quien reserva. Es un competidor real (no inventado) y ese plan gratis nunca se menciona.
  - `content/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026.mdx:39`: "el 60% de las canchas hoy sigue usando esto" sin fuente. Choca con la regla de persuasión del proyecto (encuadre, nunca número inflado).
  - `content/pages/alternativas-alquila-tu-cancha.mdx:38`: EasyCancha "suele ser el más caro… las comisiones por pago integrado" sin fuente.
  - Precios de ATC, públicos y citables: Plan Base USD 50/mes (1 a 3 canchas; USD 40/mes con pago anual), Estándar USD 80 (64 anual), Full USD 100 (80 anual), `atcsports.io/software-gestion-deportiva`, 2026-11-02. Ninguna página de TurnoGol los compara con los $30.000 ARS por cancha.
- **Formato que gana (SERP K5, 2026-11-02).** Turnito publicó el 2026-02-23 "Las mejores Apps de Reservas para Clubes en Argentina [2026]": ~1.800 palabras, 5 herramientas, tabla comparativa de 6 filas, byline con nombre. Los 3 artículos de TurnoGol tienen 542, 439 y 432 palabras, 0 tablas, sin byline (autor = Organization), y repiten el mismo trío TurnoGol/ATC/Don Potrero (riesgo de canibalización entre los tres).
- **Fix.** (1) Tabla comparativa con criterios que usa la SERP: nº de canchas, comisión por reserva, cobro de seña (MercadoPago), plan gratis, prueba, app de jugadores/visibilidad, soporte, precio en moneda original con fecha de consulta. (2) Quitar o citar cada afirmación sobre terceros; reemplazar "60%" por un dato con fuente o por encuadre cualitativo. (3) Una página ancla por intención: `/vs` (frente a frente), `/alternativas` (lista), blog (guía de criterios) con enlaces cruzados y sin repetir textos. (4) Agregar "ATC" y "atcsports" en el cuerpo y en un FAQ ("¿ATC es lo mismo que Alquila Tu Cancha?"). (5) Byline humano + fecha de actualización visible.
- **Cómo sabríamos que falló.** Revisión trimestral de afirmaciones contra la fuente (checklist con URL y fecha); consultas en Search Console con "alternativas", "vs", "mejores" + ATC sin impresiones a las 8 semanas; una queja o pedido de rectificación del competidor.

### H4. B2C: la home y `/explorar` no tienen la página que la SERP premia (hub de ciudad + deporte) — HIGH (impacto acotado por el inventario)

- **Evidencia.** SERP K2/K3 (2026-11-02): Golero usa `/canchas/buenos-aires/colegiales/futbol-5`; ATC usó `/zones/capital-federal/sport/2/futbol-5` hasta la migración de dominio (hoy redirige); en K3 ganan directorios por ciudad. TurnoGol (prod): la home tiene **27 palabras y 0 H2** (title "TurnoGol — Reservá tu cancha de fútbol al instante", `src/app/page.tsx:13-19`, árbol local); `/explorar` es una sola URL con canonical `/explorar` (`src/app/(public)/explorar/page.tsx:44-48`), 21 palabras estáticas y **2 complejos, ambos en Luján** (`el-vagon-deportivo`, `complejo-evardss`). No existe URL por ciudad en el sitemap.
- **Oportunidad concreta.** K3 (Luján) está dominada por directorios, Facebook y avisos clasificados, sin reserva online propia. Las dos fichas de TurnoGol ya traen `SportsActivityLocation` con dirección, teléfono y horarios (prod). Sus títulos son "El vagón Deportivo — TurnoGol" y la descripción "Reservá una cancha en El vagón Deportivo , Lujan, Buenos Aires." (espacio antes de la coma, "Lujan" sin tilde, y en `/explorar` aparece "Lujan, Buenos Aires , Buenos Aires" duplicado). H1 solo con el nombre; texto de la ficha = H1 + un H2 "Horarios".
- **Fix.** (1) Hub indexable `/canchas/lujan` (o `/explorar/lujan`) con intro, las 2 fichas, `ItemList`, mini FAQ (precios, horarios, cómo reservar, seña) y canonical propio; enlazado desde la home, `/explorar` y ambas fichas. (2) Títulos de ficha con intención: "Cancha de fútbol 5 y 7 en Luján — El Vagón Deportivo | Reservá online". (3) Corregir "Luján" y la duplicación de región en datos. (4) Home: dar contenido rastreable (ciudades con complejos, 3 pasos de reserva, FAQ corto). Ver REQUIERE INPUT 4 (escala).
- **Cómo sabríamos que falló.** A las 8 semanas: el hub sin impresiones para "canchas de fútbol 5 Luján"; las fichas sin aparecer en K3; o aparece pero con CTR <2% (señal de título/descripción débil).

### H5. Enlace de WhatsApp placeholder vivo en `/vs/alquila-tu-cancha` — HIGH (fix de una línea)

- **Evidencia (prod, 2026-11-02).** `curl` a `/vs/alquila-tu-cancha`: 2 ocurrencias de `wa.me/5491100000000` (número inexistente) y 4 del número real `5492323346976`. Fuente: `content/pages/vs-alquila-tu-cancha.mdx:40`, el CTA inline "Empezá tu prueba gratis de 30 días acá", el de mayor intención de la página. `src/lib/contact.ts:9` documenta que este placeholder ya se arregló una vez (2026-08-09) y que un test lo cuida, pero ese candado solo escanea `.ts/.tsx`, no `.mdx` (verificado por lectura del comentario; no se corrió el test).
- **Fix.** Reemplazar el enlace del `.mdx` por `/register` y/o `contactWhatsappUrl(...)` (el ArticleShell ya trae un CTA correcto abajo). Extender el test de `contact.ts` a `content/**/*.mdx`.
- **Cómo sabríamos que falló.** `grep -rn "wa.me/[0-9]" content/` devuelve algo distinto del número de `contact.ts`; o el test ampliado falla en CI.

### H6. Schema y frescura: casi todo el potencial está sin usar — MEDIUM

- **Evidencia (prod, 2026-11-02).** `/para-complejos`: 0 bloques JSON-LD. `/precios`: solo `FAQPage` (`precios/page.tsx:88`); sin `SoftwareApplication`/`Offer` aunque el precio es público ($30.000 por cancha). Nota: desde 2023 Google solo muestra el rich result de FAQ a sitios de gobierno y salud; el beneficio acá es para extracción por LLMs, no para la SERP. Artículos: `Article` sin `datePublished` en `/vs` y `/alternativas` (el `date` solo se pasa en el blog, `ArticleShell.tsx:24`), `author` = Organization (`ArticleShell.tsx:25`), sin `dateModified`; la prop `addFaqSchema` es un no-op (`ArticleShell.tsx:17`, `_addFaqSchema`), así que `/vs` y `/alternativas` la pasan en vano. El blog muestra la fecha en crudo ("2026-07-12"). Sitemap: **8 URLs con el mismo `lastmod` 2026-11-02T14:44:58Z** (fecha de build, no de cambio). La detección de fecha de `render_page.py` leyó 2011-07-05 para `/alternativas` y 2026-01-01 para otras (señal ruidosa por falta de fecha en el HTML).
- **Fix.** `SoftwareApplication` + `Offer` (`priceCurrency: ARS`, 30000, `unitText: por cancha/mes`) en `/precios` y `/para-complejos`; `Article` con `datePublished`, `dateModified`, `author` Person y `publisher`; fecha visible "Actualizado: dd/mm/aaaa" en formato local; `lastmod` real por contenido; `ItemList` en el hub de ciudad. Recomendado: `/seo schema`.
- **Cómo sabríamos que falló.** Rich Results Test / validador de schema.org con errores o sin tipo detectado en esas URLs; `lastmod` idéntico en 2 o más URLs sin cambio real (diff del sitemap entre builds).

### H7. Prueba social y medios: el B2B no muestra nada verificable — MEDIUM

- **Evidencia (prod, 2026-11-02).** `/para-complejos`: 0 testimonios, 0 nombres de clientes, 0 métricas, 0 `<img>` (la UI de ejemplo es un mock en DOM con la etiqueta "Ejemplo"), sin video. `/precios`: 0 imágenes. Competidores: ATC "+1000 clubes argentinos, +2.000.000 usuarios" (`clubes.atcsports.io`); Dónde Juego "+2.000 canchas activas" (no verificable); Anolla con capturas y 4,8/5. TurnoGol no puede igualar números y no debe inflarlos.
- **Fix (honesto).** Capturas reales de la grilla y de la caja con alt descriptivo; un GIF/video corto de 30 s del flujo seña→grilla; enlazar `/el-vagon-deportivo` como "así se ve la página de un complejo real" (ya existe y es pública); garantías ya ciertas en el producto (30 días sin tarjeta, datos exportables, plata directo a MercadoPago). Caso con nombre solo con consentimiento: REQUIERE INPUT 2.
- **Cómo sabríamos que falló.** Tasa de clic en CTA ("Probalo 30 días") de `/para-complejos` sin mejora tras agregar medios; scroll depth <40% en mobile; 0 solicitudes que mencionen haber visto el demo.

### H8. Mensajes contradictorios entre páginas — MEDIUM (decisión de negocio)

- **Evidencia (prod, 2026-11-02 + árbol local).** `/vs` (`vs-alquila-tu-cancha.mdx` sección "Cuándo NO elegir") y `/alternativas` dicen que TurnoGol "no te trae jugadores nuevos", mientras la home y `/explorar` son un portal de descubrimiento con 2 complejos y sitemap con prioridad 0,8 a `/explorar`. Además, el índice de memoria del proyecto registra (31/10) que la seña es opcional y que MercadoPago no va de titular; la página `/para-complejos` en prod todavía abre con "sistema de señas" y "paga la seña por MercadoPago" en título, meta y primer párrafo. No releí el archivo de memoria; se cita el índice.
- **Fix.** Alinear: o el portal es un diferencial ("tu complejo aparece en TurnoGol Explorar") con la salvedad honesta de escala, o se deja de promocionar el portal. Y decidir si el título/H1 de `/para-complejos` sigue anclado en la seña. REQUIERE INPUT 1 y 3.
- **Cómo sabríamos que falló.** Lectura cruzada de las 4 páginas sin contradicciones; consultas de prospectos que pregunten "¿me trae jugadores?" (señal de mensaje confuso).

### H9. Menores (LOW)

- Los 3 artículos se solapan (mismo trío y mismas afirmaciones): riesgo de canibalización entre sí; diferenciar la intención (frente a frente / lista / criterios).
- La home enlaza a `/ingresar?next=%2Findex`. `/index` respondió 200 en `curl`; no verifiqué si es un soft-404 (hay antecedente en memoria con `loading.tsx`). Revisar.
- La home y las fichas enlazan a rutas bloqueadas por robots (`/configuracion`, `/mis-reservas`): inocuo, pero ruido de crawl.
- Mojibake del renderer (ver Limitaciones): no es un problema del sitio.

---

## 3. REQUIERE INPUT (decisiones de negocio, no aplicadas)

1. ¿Se cambia el title/H1 de `/para-complejos` y `/precios` para incluir "sistema de reservas / software / gestión", en línea con la decisión del 31/10 de que la seña no es el titular? Opciones: (a) mantener el hook y sumar descriptor; (b) reemplazar el H1.
2. ¿Se puede nombrar a El Vagón Deportivo como caso (testimonio, captura de su grilla)? Requiere consentimiento del dueño.
3. Posicionamiento del portal frente al "no te trae jugadores": ¿el portal es un diferencial del producto o queda fuera del mensaje B2B?
4. ¿Se publica el hub `/canchas/lujan` (feature nuevo, dos complejos hoy) antes de tener más oferta? Costo bajo, escala baja.
5. ¿Se publican precios de ATC en USD en `/vs` con fecha de consulta? Es dato público (2026-11-02), pero cambia y se auditaría contra su página.

---

## 4. Historias de usuario (derivadas de señales de SERP observadas)

1. **Dueño evaluando software (consideración).** Quiero saber en 10 segundos si el sistema maneja reservas, caja y fijos para mis canchas y cuánto cuesta, porque el cuaderno y el WhatsApp me hacen perder turnos, pero me bloquea el miedo a comisiones y a que mi encargado no lo use. *Señal:* H1 de competidores ("Sistema de gestión de turnos y reservas…", Don Potrero), declaraciones de "sin comisiones" (ATC) y "Sin períodos de prueba" / plan Amateur gratis (Don Potrero), criterios de la tabla de Turnito (comisión, plan gratis, pagos). Etapa: consideración.
2. **Dueño que ya paga ATC y compara (decisión).** Quiero una comparación lado a lado con precio y comisión en pesos, porque el costo en USD me pesa, pero me bloquea la fatiga de comparación y no confío en listas escritas por el propio proveedor. *Señal:* K4 sin ninguna página de alternativas, la lista de Turnito (proveedor que se ubica primero), precios de ATC en USD 50/80/100 (2026-11-02). Etapa: decisión.
3. **Encargado nocturno (inferido).** Quiero cargar y mover turnos desde el celular a la 1 de la mañana sin que me rete el dueño, porque soy quien atiende, pero me bloquea la confusión técnica. *Señal (débil, por inferencia):* "desde cualquier dispositivo y sin apps" (Don Potrero), "permisos de staff" y "multiusuario" (Dónde Juego, ATC). Etapa: consideración. Confianza baja: la SERP no lo expone directo.
4. **Jugador organizador (decisión).** Quiero ver turnos libres de hoy cerca de mi casa y reservar pagando la seña, porque armé el partido y me falta cancha, pero me bloquea que no haya oferta. *Señal:* snippets de Golero/TuCancha/Dónde Juego ("reservá online 24/7, pagá con MercadoPago, buscá por fecha, hora y precio"). Etapa: decisión.
5. **Jugador de Luján (conciencia).** Quiero un lugar con precio, horario, teléfono y cómo reservar, porque hoy solo encuentro directorios y Facebook, pero me bloquean los listados viejos. *Señal:* K3 (argentino.com.ar, Facebook, avisos), que el propio buscador advierte "los listados pueden estar desactualizados". Etapa: conciencia.

---

## 5. SXO Gap Score por página (0-100; más alto = menos brechas)

| Página | Tipo (15) | Profundidad (15) | UX (15) | Schema (15) | Medios (15) | Autoridad (15) | Frescura (10) | **Total** |
|---|---|---|---|---|---|---|---|---|
| `/para-complejos` | 11 | 8 | 12 | 3 | 5 | 3 | 5 | **47** |
| `/precios` | 13 | 12 | 12 | 8 | 4 | 4 | 5 | **58** |
| `/` | 8 | 2 | 11 | 7 | 4 | 3 | 6 | **41** |
| `/explorar` | 9 | 4 | 12 | 5 | 8 | 4 | 8 | **50** |
| `/vs/alquila-tu-cancha` | 11 | 7 | 6 | 5 | 1 | 5 | 4 | **39** |
| `/alternativas-alquila-tu-cancha` | 10 | 7 | 6 | 5 | 1 | 3 | 4 | **36** |
| `/blog/mejores-sistemas-...-2026` | 9 | 6 | 7 | 7 | 1 | 3 | 6 | **39** |

Evidencia clave: palabras extraídas (`render_page.py`): home 27, `/explorar` 21, `/para-complejos` 348, `/precios` 554, `/vs` 542, `/alternativas` 439, blog 432. 0 tablas en las 7 páginas. 0 `<img>` salvo 1 en `/explorar`. Schema: home Organization+WebSite; `/explorar` BreadcrumbList; `/precios` FAQPage; artículos Article+Organization; `/para-complejos` ninguno. Puntajes: juicio del analista sobre esa evidencia, no una métrica medida.

---

## 6. Puntaje por persona (Relevancia / Claridad / Confianza / Acción, 25 c/u)

Personas: P1 dueño evaluador, P2 dueño que compara/migra, P3 encargado (inferido), P4 jugador organizador, P5 jugador de Luján.

| Página | Persona | Rel | Cla | Conf | Acc | Total | Rating |
|---|---|---|---|---|---|---|---|
| `/para-complejos` | P1 | 17 | 19 | 9 | 21 | 66 | Bueno |
| `/para-complejos` | P2 | 8 | 6 | 6 | 10 | 30 | Desajuste crítico |
| `/para-complejos` | P3 | 15 | 13 | 8 | 9 | 45 | Necesita trabajo |
| `/precios` | P1 | 20 | 20 | 11 | 22 | 73 | Bueno |
| `/precios` | P2 | 14 | 15 | 9 | 18 | 56 | Necesita trabajo |
| `/` | P4 | 13 | 18 | 7 | 15 | 53 | Necesita trabajo |
| `/` | P1 (llega desde la home) | 8 | 15 | 5 | 14 | 42 | Necesita trabajo |
| `/explorar` | P4 | 15 | 16 | 8 | 16 | 55 | Necesita trabajo |
| `/explorar` | P5 | 17 | 15 | 8 | 17 | 57 | Necesita trabajo |
| `/vs/alquila-tu-cancha` | P2 | 19 | 13 | 9 | 9 | 50 | Necesita trabajo |
| `/vs/alquila-tu-cancha` | P1 | 14 | 12 | 8 | 9 | 43 | Necesita trabajo |
| `/alternativas-alquila-tu-cancha` | P2 | 17 | 11 | 6 | 11 | 45 | Necesita trabajo |
| `/blog/mejores-sistemas-...-2026` | P1 | 14 | 11 | 6 | 11 | 42 | Necesita trabajo |
| `/blog/mejores-sistemas-...-2026` | P2 | 12 | 10 | 5 | 10 | 37 | Desajuste crítico |

- **Persona más débil:** P2 (dueño que compara) en `/para-complejos` (30) y en el blog (37). Problema: no hay comparación estructurada, ni precios de la competencia, ni enlace desde las páginas de dinero. Fix: tabla en `/vs` + enlaces de `/para-complejos` y `/precios` a `/vs` y `/alternativas`.
- **Problema sistémico:** Confianza es la dimensión más baja en las 14 filas (5 a 11 sobre 25). Claridad en artículos (10 a 13) por prosa sin tabla, TOC ni fecha legible.
- **Acciones por prioridad:** 1) tabla + precios + byline en `/vs` (P2); 2) vocabulario del mercado en title/H1/H2 de `/para-complejos` y `/precios` (P1); 3) hub de Luján y fichas con intención local (P4/P5); 4) medios y prueba verificable (P1/P3).

---

## 7. Derivaciones a otras skills

- Schema faltante (`SoftwareApplication`, `Offer`, `Article` completo, `ItemList`): `/seo schema`.
- E-E-A-T de las comparativas (afirmaciones sin fuente, autor, fechas): `/seo content`.
- Intención local en K3 (Luján): `/seo local`.
- Contenido delgado (home 27 palabras, artículos ≤542): `/seo page`.

## 8. Limitaciones

- **La SERP no es Google directo.** WebSearch no devuelve posiciones reales, PAA, ads, AI Overview, featured snippets ni local pack. Google y DuckDuckGo bloquean (captcha/error) y Bing devolvió la consulta mal. El "consenso" se calcula sobre 9 a 15 resultados por consulta, sin ranking. El modo estándar devolvió mucho ruido académico; las consultas extendidas con calificadores fueron las más útiles. Los resultados cambian entre ejecuciones (la primera búsqueda de "Don Potrero" no lo encontró; la extendida sí).
- **No se sabe si turnogol.app está indexada ni qué posición tiene.** Una búsqueda de "turnogol.app" no devolvió el sitio, pero esa herramienta no es prueba de indexación. Hace falta Search Console (indexación, consultas, posiciones) para validar todo lo que dice "a las 8 semanas".
- **Volumen de búsqueda desconocido.** Las keywords son plausibles, no medidas.
- **Renderer con mojibake.** `render_page.py` en Windows devolvió U+FFFD en vez de tildes y "—" (el HTML real por `curl` es UTF-8 correcto). La estructura (headings, JSON-LD, enlaces, conteos) no se afecta; los conteos de caracteres de título pueden variar ±1. Modo usado: `auto` → `raw` (`is_spa: false`); no se renderizó con JS. Por eso la parte dinámica de la home/`/explorar` (cards cargadas por cliente) puede subestimarse.
- **Competidores clasificados con resúmenes de WebFetch**, no con inspección del DOM. Fallaron: Golero (402), CanchaFija (403), Reservalo `/sistema-de-reservas/canchas` (404), TuCancha blog (conexión rechazada), argentino.com.ar (403); `canchaya.com` redirige a una página de venta de dominio (competidor inactivo). Sus tipos se infirieron de los snippets.
- **Persona P3 (encargado) es inferida**, sin señal directa de SERP.
- **Árbol local 34 commits atrás de origin/main:** las citas `archivo:línea` pueden no coincidir con prod. Lo afirmado sobre prod se verificó por `curl` el 2026-11-02; el comportamiento del test de `contact.ts` no se ejecutó.
- No se leyó el archivo de memoria `sena-es-opcional-no-el-producto.md`; se citó su línea del índice.
- No se convirtieron USD a ARS (tipo de cambio no verificado). No se generó wireframe (no se pidió).

¿Generar un informe en PDF? Usá `/seo google report`.

---

## 9. Hallazgos estructurados (para `audit-data.json`, categoría "Search Experience")

```json
{
  "category": "Search Experience",
  "observed_on": "2026-11-02",
  "findings": [
    {"id": "SXO-01", "severity": "high", "pages": ["/para-complejos", "/precios"], "title": "Vocabulario del mercado ausente en title/H1/body (0 ocurrencias de 'sistema de reservas', 'software', 'gestión')", "evidence": "SERP K1 (modo extendido): Don Potrero, Reservalo.ar, Anolla, AROL, Canchero usan esos términos en title/H1; prod curl 2026-11-02", "source": "src/app/(business)/para-complejos/page.tsx:14-19 (árbol local)", "fix": "Title y H1/H2 con vocabulario de la consulta; mantener el hook de marca como línea secundaria", "failure_signal": "Search Console: impresiones nulas o posición >30 para 'sistema|software|gestión' + canchas a las 8 semanas"},
    {"id": "SXO-02", "severity": "high", "pages": ["/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha", "/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026"], "title": "Páginas editoriales huérfanas, sin canonical y con marca duplicada en el título", "evidence": "curl 2026-11-02: 0 enlaces internos entrantes a /vs y /alternativas; sin rel=canonical; título '… | TurnoGol — TurnoGol'", "source": "src/app/(business)/vs/alquila-tu-cancha/page.tsx:7-15; src/lib/seo/metadata.ts:68 (árbol local)", "fix": "Usar buildMetadata con titleAbsolute, título ≤60 caracteres, enlaces internos cruzados", "failure_signal": "GSC 'Descubierta sin indexar' o canónica elegida por Google distinta; 0 enlaces entrantes en crawl"},
    {"id": "SXO-03", "severity": "high", "pages": ["/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha", "/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026"], "title": "Afirmaciones sobre competidores sin fuente o contradichas, sin tabla ni precios ni byline", "evidence": "ATC declara 'precios fijos y sin comisiones' (2026-11-02); Don Potrero sin claim de años y con plan Amateur gratis; Turnito 2026-02-23 con tabla de 6 filas y byline; ATC USD 50/80/100", "source": "content/pages/vs-alquila-tu-cancha.mdx:26; content/pages/alternativas-alquila-tu-cancha.mdx:19,38; content/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026.mdx:39 (árbol local)", "fix": "Tabla con criterios de la SERP, afirmaciones citadas o eliminadas, byline y fecha de actualización", "failure_signal": "Revisión trimestral contra fuente; sin impresiones para 'alternativas'/'vs' + ATC a las 8 semanas"},
    {"id": "SXO-04", "severity": "high", "pages": ["/", "/explorar", "/el-vagon-deportivo", "/complejo-evardss"], "title": "Sin hub indexable por ciudad+deporte; home de 27 palabras; fichas sin intención local", "evidence": "SERP K2/K3 2026-11-02: Golero con página por barrio+deporte, directorios en Luján sin reserva online propia; prod: 2 complejos, ambos en Luján", "source": "src/app/page.tsx:13-19; src/app/(public)/explorar/page.tsx:44-48 (árbol local)", "fix": "Hub /canchas/lujan con ItemList y FAQ; títulos de ficha con 'cancha de fútbol 5 en Luján'; corregir tilde y duplicación de región", "failure_signal": "Hub sin impresiones para 'canchas de fútbol 5 Luján' a las 8 semanas"},
    {"id": "SXO-05", "severity": "high", "pages": ["/vs/alquila-tu-cancha"], "title": "CTA inline con wa.me/5491100000000 (placeholder) vivo en prod", "evidence": "curl 2026-11-02: 2 ocurrencias del placeholder y 4 del número real", "source": "content/pages/vs-alquila-tu-cancha.mdx:40; src/lib/contact.ts:9 (árbol local)", "fix": "Reemplazar por /register o contactWhatsappUrl; extender el test de contact.ts a content/**/*.mdx", "failure_signal": "grep de wa.me/<dígitos> en content/ distinto del número de contact.ts"},
    {"id": "SXO-06", "severity": "medium", "pages": ["/para-complejos", "/precios", "/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha"], "title": "Schema y frescura sin usar (sin SoftwareApplication/Offer, Article sin dateModified, lastmod idéntico en 8 URLs)", "evidence": "prod 2026-11-02: /para-complejos sin JSON-LD; sitemap con lastmod 2026-11-02T14:44:58Z en 8 URLs", "source": "src/components/site/ArticleShell.tsx:17,24,25; src/app/(business)/precios/page.tsx:88 (árbol local)", "fix": "SoftwareApplication+Offer, Article completo, fecha visible, lastmod real", "failure_signal": "Rich Results Test sin tipos detectados; lastmod idéntico sin cambios reales"},
    {"id": "SXO-07", "severity": "medium", "pages": ["/para-complejos", "/precios"], "title": "Sin prueba social ni medios verificables", "evidence": "prod 2026-11-02: 0 testimonios, 0 imágenes, 0 métricas; competidores con conteos y capturas", "source": "prod", "fix": "Capturas reales, video corto, enlace a la ficha de un complejo real; caso con nombre solo con consentimiento", "failure_signal": "CTR del CTA y scroll depth sin mejora tras el cambio"},
    {"id": "SXO-08", "severity": "medium", "pages": ["/vs/alquila-tu-cancha", "/alternativas-alquila-tu-cancha", "/", "/explorar", "/para-complejos"], "title": "Mensajes contradictorios: 'no te trae jugadores' vs portal; seña como titular vs decisión del 31/10", "evidence": "prod 2026-11-02 e índice de memoria del proyecto", "source": "content/pages/vs-alquila-tu-cancha.mdx (sección 'Cuándo NO elegir'); src/app/(business)/para-complejos/page.tsx:14-19 (árbol local)", "fix": "REQUIERE INPUT 1 y 3 (decisión del dueño)", "failure_signal": "Prospectos que preguntan si el portal les trae jugadores"}
  ]
}
```
