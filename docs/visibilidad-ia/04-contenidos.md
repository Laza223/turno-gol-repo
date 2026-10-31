# 04 — Briefs de contenido y calendario de 90 días

**Fecha:** 2026-10-31.

**Base:**
- La frase canónica, la arquitectura y el mapa de intenciones de `02-estrategia.md`.
- Los estados de cada función: A = en producción, B = detrás de flag, C/D = no se promete. Salen del inventario de `02-estrategia.md` §3.

**Reglas que valen para todos los briefs:**
1. **H1 y primer párrafo.** El H1 responde la pregunta del dueño. El primer párrafo contiene la frase canónica o su versión media. Las citas salen mayormente del primer tercio de la página (Discovered Labs, profundidad mediana 0,36; fuerza media).
2. **Datos verificables.** Cifras propias en ARS con fecha, tablas HTML reales y FAQ visible. Nada cargado con `useEffect` ni con fetch del cliente: todo en el HTML inicial.
3. **Competidores con fuente y fecha.** Se nombran con nombre y apellido, y cada dato va con fuente y fecha ("según su web al DD/MM/AAAA"). Ningún número inventado (D3).
4. **Escritura.** Siempre "TurnoGol". Voseo y voz de empresa ("Escribinos", "Te ayudamos"). Ningún nombre propio (D4). Vocabulario de `02-estrategia.md` §9.
5. **Fechas.** La fecha de actualización se muestra **solo** cuando hubo un cambio real, y `dateModified` en el JSON-LD es la misma que la visible.
6. **Mobile.** Es la prioridad fuera del panel: primero se diseña a 390 px y después en compu. La autoridad visual es `DESIGN.md`. El hero de la home no se toca (D1).
7. **Firma de las guías:** "Equipo TurnoGol".

---

## Etapa 1 — reenfocar el sitio

### B-01 · Home `/` (banda para dueños + metadatos) — VIS-016

- **Objetivo:** que la home le diga a un buscador y a una IA qué es TurnoGol para el dueño, sin quitarle el CTA al jugador.
- **Prompts y keywords:**
  - Marca: "¿Qué es TurnoGol?".
  - Descubrimiento B2B: la tarjeta "Conocer TurnoGol" se arma con el title y la description.
- **Metadatos:**
  - **Title**: "TurnoGol — Reservá tu cancha de fútbol online" (46 caracteres; aprobado el 30/10). Se arma con `title.absolute` para que no se duplique la marca.
  - **Description** (aprobada en el preview del 30/10; hasta 155 caracteres): "Reservá sin llamar. ¿Tenés un complejo? TurnoGol es el sistema de gestión: reservas 24/7, seña opcional por Mercado Pago, turnos fijos y caja. Sin comisión."
- **Estructura:**
  - El hero y el buscador quedan **exactamente igual**.
  - Banda nueva, justo abajo del buscador:
    - `H2`: "¿Tenés un complejo de fútbol?"
    - Párrafo de unas 40 palabras: "TurnoGol es el sistema de gestión hecho solo para complejos de fútbol: reservas online las 24 h, seña opcional por Mercado Pago directo a tu cuenta, turnos fijos, cobros por equipo, caja y buffet. Sin comisión por reserva."
    - 3 o 4 chips de rasgos.
    - CTA primario "Probalo 30 días gratis" → `/register`.
    - Link secundario "Ver precios" → `/precios`.
    - Link "Cómo funciona" → `/para-complejos`.
  - En el pie, sumar `/precios` y `/blog` (después `/guias`).
- **Datos que hacen falta:** ninguno nuevo. Precio y trial salen de `plans-data.ts` y `TRIAL_DAYS`.
- **Enlaces internos:** `/para-complejos`, `/precios`, `/register`.
- **Schema:**
  - Organization + WebSite, que ya existen. Corregir el logo (T-06) y sumar `sameAs`.
  - Sumar SoftwareApplication con Offer en ARS (`02-estrategia.md` §5).
- **Cadencia:** solo cuando cambie el precio o el producto.
- **Responsable:** Claude Code, con `impeccable` y `DESIGN.md`. Lázaro elige la variante viendo la página.

### B-02 · `/para-complejos` (la página del sistema de gestión) — VIS-017

- **Objetivo:** que sea la página que ChatGPT lee cuando hace `site:turnogol.app` para describir el producto: funciones completas en HTML y en lenguaje de dueño.
- **Prompts y keywords:**
  - Todo el grupo de descubrimiento B2B.
  - "software para canchas de fútbol 5", "sistema de turnos para canchas", "programa para administrar canchas".
- **Metadatos:**
  - **Title**: "Sistema de gestión para complejos de fútbol | TurnoGol" (54 caracteres).
  - **Description**: la frase media.
- **Estructura** (ordenada por momento de la noche, según el JTBD de `02-estrategia.md` §3):
  - `H1`: que contenga "complejo(s) de fútbol" y "sistema de gestión". Propuesta: "El sistema de gestión hecho solo para complejos de fútbol." Variantes a elegir con Lázaro, por ejemplo: "Todo tu complejo de fútbol, en el celular."
  - Primer párrafo: la **frase canónica larga**.
  - `H2` Reservas las 24 h sin que el jugador se baje nada. Cubre: tres toques, tu página con tu link, la placa de turnos libres para historias y precio por jugador.
  - `H2` La seña, si la querés. Cubre: directo a tu Mercado Pago, liberación a los 6 minutos y qué pasa si Mercado Pago se desconecta.
  - `H2` El que te cuelga el turno. Cubre: 2 faltazos en 90 días son 14 días sin reservar online, y la cancelación tardía opcional.
  - `H2` Los fijos, solos. Cubre: se repiten cada semana, control de pago por sesión e importación de la planilla.
  - `H2` Cobrás como se cobra en el fútbol. Cubre: por equipo, de a partes y mezclando métodos. Lo jugado y no cobrado queda en rojo.
  - `H2` Caja y buffet en la misma pantalla. Cubre: Hoy, la caja de la noche por método, stock con "Para reponer", fiado y vender desde cualquier vista.
  - `H2` Tus clientes. Cubre: la ficha, las etiquetas, "clientes que dejaron de venir" con WhatsApp precargado y RIVAL (B, "Ya disponible").
  - `H2` Tu equipo. Cubre: encargado con su usuario, push con horario silencioso y resúmenes.
  - `H2` TurnoGol Plus: el asistente de WhatsApp con IA. Es extra ($20.000 por cancha) y "ya lo usa un complejo". No decir "incluido" ni "24/7 solo".
  - `H2` Lo que no hacemos. Va ahí para que la IA no invente: solo fútbol (sin pádel ni básquet) y no cobramos comisión ni le cobramos al jugador.
  - `H2` Probalo 30 días. Cubre: sin tarjeta, sin permanencia y el CTA.
  - FAQ visible de 6 a 8 preguntas con FAQPage, por ejemplo: "¿Le cobran algo al jugador?", "¿Sirve para fútbol 7 y 11?", "¿Puedo cargar mis fijos de una planilla?" y "¿Qué pasa si no uso seña?".
  - Extensión: 1.500 a 2.500 palabras. Las páginas de más de 2.900 palabras recibieron más citas (SE Ranking), pero acá prima no rellenar. Fuerza baja.
- **Datos que hacen falta:**
  - Constantes del código: hold de 6 min, 2/90/14, `TRIAL_DAYS`, precio y Plus.
  - Capturas reales del panel, rotuladas como ejemplo (L2).
- **Enlaces internos:**
  - A cada `/funciones/*`, cuando existan.
  - A `/precios`, `/integraciones/mercado-pago` y `/comparar/*`.
- **Schema:** SoftwareApplication + Offer, BreadcrumbList y FAQPage.
- **Cadencia:** con cada función nueva en estado A.
- **Responsable:** Claude Code (copy y código) con `impeccable`. Lázaro aprueba el copy.

### B-03 · `/precios` (correcciones) — VIS-018

- **Objetivo:** que el formato de precio sea el más citable posible y que no contradiga al producto. En el estudio de Discovered Labs, el formato de precios fue el que más se asoció con ser citado (β +0,39; observacional; fuerza media).
- **Prompts:** "¿Cuánto cuesta TurnoGol?", "app gratis o barata para canchas" y "sin comisión por reserva".
- **Cambios** (el resto queda como está):
  - Línea visible: "Precios en pesos argentinos (ARS), vigentes desde el DD/MM/2026". La fecha sale de la decisión del 20/10/2026 o del día en que se aplicó la migración 095.
  - Tabla HTML real de mensual contra anual para 1, 3, 5 y 10 canchas. Los montos se calculan con `monthlyListAmount` y `annualMonthlyEquivalent`; nunca se escriben a mano.
  - "Pagás por cada cancha, sin límite de cantidad", con la ayuda "elegí de 1 a 8 o escribí cuántas tenés".
  - "Todo el sistema incluido" reemplaza a "Todas las funciones incluidas", y suma la línea "Opcional: TurnoGol Plus, asistente de WhatsApp con IA, $20.000 por cancha por mes".
  - Bloque "Sin comisión por reserva y sin cargo al jugador: la seña va directo a tu Mercado Pago".
  - **Sacar:**
    - "60 días", y poner lo que diga la decisión vigente sobre el vencimiento de la prueba (REQUIERE INPUT, ver `09`).
    - "Cierre diario".
    - "20 minutos".
    - "Exportás cuando quieras", o bien aclarar "mientras tu cuenta esté activa".
  - La FAQ se mantiene y se suma "¿TurnoGol le cobra algo al jugador?".
- **Schema:** SoftwareApplication + Offer en ARS con `priceValidUntil`, más FAQPage (que ya existe).
- **Cadencia:** con cada cambio de precio. Con la inflación, se revisa al menos una vez por mes, y la fecha visible se cambia solo si cambió algo.
- **Responsable:** Claude Code. Lázaro confirma la fecha de vigencia.

### B-04 · `/nosotros` — VIS-019

- **Objetivo:** que la entidad tenga dónde apoyarse, quién está detrás, desde dónde y desde cuándo, sin nombres propios (D4).
- **Prompts:** "¿Qué es TurnoGol?" y "¿Quién está detrás de TurnoGol?".
- **Metadatos:**
  - **Title**: "Nosotros — TurnoGol, sistema de gestión para complejos de fútbol".
  - **Description**: "TurnoGol es un sistema de gestión hecho solo para complejos de fútbol, desde Luján (Buenos Aires), en producción desde julio de 2026."
- **Estructura:**
  - `H1`: "Hacemos TurnoGol, el sistema de gestión para complejos de fútbol."
  - Párrafo con la frase canónica.
  - `H2` Por qué solo fútbol: un párrafo sobre la operación de un complejo de fútbol y por qué un multideporte no la cubre.
  - `H2` Desde dónde: Luján, Buenos Aires, desde julio de 2026.
  - `H2` Cómo trabajamos: soporte por WhatsApp, te ayudamos a cargar todo y tus datos son tuyos (exportación en CSV).
  - `H2` Contacto: WhatsApp, email y redes. Son los mismos enlaces de `sameAs`.
- **Schema:** Organization (el nodo `#org` completo) + BreadcrumbList.
- **Slug:** `nosotros` entra en `RESERVED_SLUGS` **antes** de crear la ruta.
- **Responsable:** Claude Code.

### B-05 · Fichas de complejo `/{slug}` — VIS-026

- **Objetivo:**
  - Que cada ficha sea única y que se lea sin JS.
  - Que cada complejo cliente sea una mención y un enlace hacia TurnoGol (efecto red).
- **Prompts:** "¿Dónde reservo una cancha de fútbol 5 en Luján?" y el nombre del complejo más "reservar".
- **Cambios:**
  - Que el H1 y los datos salgan en el HTML inicial (T-02).
  - Bloque visible "Cómo se reserva acá": seña sí o no y su porcentaje, en cuánto se libera el turno sin pago y la política de cancelación. Sale de los mismos datos que muestra `/reservar`.
  - En servicios, "Buffet" en vez de "bar", si el producto lo permite sin romper datos.
  - Pie "Reservas con TurnoGol · ¿Tenés un complejo? Conocé el sistema" → `/para-complejos`. Es un enlace interno normal, sin keywords repetidas.
  - `noindex` si no completó el onboarding o si `marketplace_visible = false`.
  - `aggregateRating` solo si las reseñas se ven en la ficha.
- **Restricciones:**
  - Respetar `hide_public_prices`: sin `priceRange` ni "desde $" si el complejo ocultó sus precios.
  - No rediseñar la ficha (`docs/decisions/2026-10-20-vuelve-la-previa.md`). Son bloques nuevos dentro del sistema visual actual.
- **Responsable:** Claude Code.

### B-06 · `llms.txt` — VIS-020

Va con la frase canónica en un blockquote abajo del H1. Incluye el precio en ARS con su vigencia, la prueba de 30 días, las funciones en estado A con una línea cada una y los enlaces markdown a `/para-complejos`, `/precios`, `/nosotros`, `/explorar` y, cuando existan, `/funciones/*` y `/comparar/*`. **No nombra competidores.**

Arrancar desde la versión de la rama `chore/llms-txt-enlaces` (worktree `bing-wt`). Es higiene, no palanca: en mayo de 2026 el 97% de los `llms.txt` no recibió ni un pedido (Ahrefs, citado en el prompt).

---

## Etapa 2 — contenido de decisión

### B-07 · Comparativas `/comparar/turnogol-vs-{vibe, canchafija, clubin, atc-sports}` — VIS-030

- **Objetivo:** ganar las preguntas de comparación y que TurnoGol aparezca como candidato cuando la IA busque fuentes.
- **Prompts:** "¿Vibe, CanchaFija o Clubin?", "¿TurnoGol o Vibe?", "TurnoGol vs ATC Sports" y "ATC Sports precios".
- **Estructura** (igual para las cuatro; el contenido es único por competidor):
  - `H1`: "TurnoGol vs {Competidor}: ¿cuál conviene para tu complejo de fútbol?"
  - Primer párrafo con la respuesta directa, por ejemplo: "Si tenés un complejo **solo de fútbol** y querés cobrar por equipo, manejar los fijos y el buffet sin que tu jugador pague un peso extra, TurnoGol. Si además tenés pádel o querés {X}, {Competidor}."
  - **Tabla HTML** (filas): precio para 1, 3 y 5 canchas con fuente y fecha; cargo al jugador; comisión por reserva; deportes; seña y a dónde va la plata; turnos fijos automáticos; cobro por equipo; caja y buffet con stock; castigo a faltazos; asistente de WhatsApp; prueba gratis; permanencia.
  - Cada celda del competidor lleva la fuente: "según {url}, visto el DD/MM/AAAA". Si no se encontró, va "No publicado".
  - `H2` Dónde gana TurnoGol: rasgos con hechos.
  - `H2` Cuándo conviene {Competidor}, con honestidad agresiva. Ejemplo: "Si tenés pádel, ATC cubre más deportes. Si lo único que querés es no pagar abono, Vibe es $0 para vos, aunque tu jugador paga $1.000 por cada pago online". La sección honesta es la que hace citable a la página: las IAs favorecen lo verificable (fuerza media).
  - `H2` Cuánto cuesta cada uno para tu complejo, con un ejemplo con números de 3 canchas.
  - `H2` Cómo pasarte: la planilla de fijos se importa y te ayudamos a cargar todo.
  - FAQ de 4 a 6 preguntas.
  - Aclaración al pie: "{Competidor} es una marca de sus dueños. TurnoGol no está afiliado. Datos relevados de su web pública en la fecha indicada".
  - Unas 1.500 palabras cada una.
- **Lo que no va:**
  - Logos ajenos, superlativos sin prueba, números sin fuente, "más barato que ATC" (es falso).
  - Compararse con TurnosGol (`02-estrategia.md` §7).
- **Datos que hacen falta:** relevar las funciones de cada competidor desde su web pública con fecha. Es la tarea del prompt V5 y **no se raspan** sus plataformas.
- **Redirecciones:** `/vs/alquila-tu-cancha` → `/comparar/turnogol-vs-atc-sports` con 301.
- **Schema:** Article (author `#org`, fechas reales), FAQPage y BreadcrumbList.
- **Enlaces internos:** desde `/para-complejos` (sección "¿Estás comparando?") y desde la guía. Ninguna comparativa queda huérfana.
- **Cadencia:** se revisa cada trimestre o apenas un competidor cambie su precio, y `dateModified` se actualiza solo si cambió algo.
- **Responsable:** Claude Code redacta y releva. Lázaro revisa los datos antes de publicar. La revisión legal es opcional y queda a criterio de Lázaro (ver `07`).

### B-08 · `/alternativas/atc-sports` — VIS-031

- **Prompts:** "alternativas a ATC Sports para un complejo de fútbol" y "alternativas a Alquila Tu Cancha". Es un hueco libre: no hay ningún producto argentino rankeando (30/10/2026).
- **Estructura:**
  - `H1`: "Alternativas a ATC Sports (Alquila Tu Cancha) para complejos de fútbol."
  - Primer párrafo con la respuesta y los criterios.
  - Tabla de 5 o 6 opciones: TurnoGol, Vibe, CanchaFija, Clubin, CanchaYa y ReservaSimple, cada una con su precio, fuente y fecha y con "para quién conviene".
  - `H2` por opción.
  - `H2` Cómo migrar desde ATC. Sin prometer un importador: se importa la planilla de fijos y "te ayudamos a cargar el resto".
  - FAQ.
- **Redirección:** `/alternativas-alquila-tu-cancha` → acá, con 301.
- **Responsable:** Claude Code.

### B-09 · `/guias/como-elegir-sistema-para-complejo-de-futbol` — VIS-034

- **Objetivo:** la única "lista" del sitio. Va con criterios explícitos, sin autoproclamarse primera, y explica para qué uso conviene cada opción (guía de Google para rankings, citada en el prompt).
- **Prompts:** "mejores sistemas de gestión para complejos de fútbol 5 en Argentina" y "¿cuál es la mejor app para la gestión de mi complejo?".
- **Estructura:**
  - `H1`: "Cómo elegir un sistema para tu complejo de fútbol (2026)".
  - Respuesta corta arriba.
  - `H2` Los 8 criterios que importan en un complejo de fútbol: cargo al jugador, comisión, seña y a dónde va la plata, fijos, cobro por equipo, buffet, faltazos, soporte.
  - Tabla de opciones por criterio.
  - `H2` Qué conviene según tu caso: barrio de F5 con 2 o 3 canchas, predio de 7 y 11, complejo con buffet fuerte, complejo con pádel.
  - `H2` Preguntas para hacerle a cualquier vendedor.
  - FAQ.
  - Autor: "Equipo TurnoGol". Declaración visible: "Esta guía la escribe TurnoGol, que es una de las opciones".
- **Redirección:** el post `/blog/mejores-sistemas-…-2026` redirige acá con 301.
- **Cadencia:** trimestral o semestral.
- **Responsable:** Claude Code.

### B-10 · `/funciones/*`, 8 páginas — VIS-032

Una plantilla y contenido único por página. Cada una tiene:
- `H1` = la tarea del dueño.
- Primer párrafo que responde.
- Cómo funciona en 3 a 5 pasos, con captura real rotulada como ejemplo.
- Qué pasa en los casos borde: "¿y si…?".
- Video incrustado, cuando exista, con VideoObject.
- FAQ de 3 a 5 preguntas.
- CTA "Probalo 30 días".
- Enlaces a 2 funciones relacionadas y a `/precios`.
- Largo: de 700 a 1.200 palabras.

| Slug | H1 propuesto | Estado | Datos o constantes | Prompt objetivo |
|---|---|---|---|---|
| `reservas-online` | Reservas online las 24 h, sin que el jugador se baje una app | A | Ficha en pasos (`2026-10-29`), placa de historias, precio por jugador | "sistema para que reserven online sin app" |
| `sena-mercado-pago` | Cobrá la seña por Mercado Pago, directo a tu cuenta | A | `deposit_percentage` 10-100, hold de 6 min, Mercado Pago desconectado → reserva sin seña | "cobrar señas online con Mercado Pago" |
| `turnos-fijos` | Tus fijos se repiten solos cada semana | A | Generador a las 03:00, control de pago por sesión, importar planilla | "app para turnos fijos" |
| `cobro-por-equipo` | Cobrá la cancha por equipo y de a partes | A | `2026-09-15-cobro-por-equipo`, métodos mezclados, "No cobrado" en rojo, acreditación a las 24 h | "dividir el pago del turno" |
| `caja-y-buffet` | La caja de la noche y el buffet, en la misma pantalla | A | Caja por método, stock mínimo, "Para reponer", fiado, vender desde cualquier vista | "caja del buffet de un complejo" |
| `faltazos` | Qué hacer con el que te cuelga el turno | A | 2/90/14 por complejo, cancelación tardía opcional, seña | "cómo evito que falten" |
| `asistente-whatsapp` | Un asistente con IA que contesta el WhatsApp de tu complejo | B (Plus, extra) | Qué hace y qué no, se calla 6 h si contestás vos, $20.000 por cancha | "bot de WhatsApp para reservas de canchas" |
| `rival` | RIVAL: tus jugadores arman el partido en tu cancha | B | Solo lo que dice "Ya disponible" en `docs/rival/landing.md`. Nada de la etapa D | "app para armar partidos de fútbol" |

### B-11 · `/integraciones/mercado-pago` — VIS-033

- **Objetivo:** ganar "cobrar señas con Mercado Pago en canchas", un hueco libre.
- **Estructura:**
  - Cómo se conecta (OAuth, desde el checklist).
  - A dónde va la plata (a la cuenta del complejo).
  - Qué comisión cobra Mercado Pago y en cuánto acredita: sale de la web de Mercado Pago, con fuente y fecha. Doc4 dice "~5% de Checkout Pro" sin verificar en vivo, así que hay que verificarlo antes de publicar.
  - Qué pasa si se desconecta.
  - Devoluciones: las hace el complejo y TurnoGol las registra. **No hay reembolso automático.**
  - FAQ.
- **Responsable:** Claude Code. Lázaro valida con su cuenta.

### B-12 · Videos (YouTube + incrustados) — VIS-035

**Primeros cuatro**, generados con La Fábrica (Remotion), con capturas reales del panel:

| # | Título (marca + intención) | Dónde se incrusta |
|---|---|---|
| 1 | "Cómo cobrar la cancha por equipo en tu complejo de fútbol \| TurnoGol" | `/funciones/cobro-por-equipo` |
| 2 | "Cómo cargar tus turnos fijos desde una planilla \| TurnoGol" | `/funciones/turnos-fijos` |
| 3 | "Seña por Mercado Pago para canchas de fútbol: cómo funciona \| TurnoGol" | `/funciones/sena-mercado-pago` |
| 4 | "La caja de la noche y el buffet de tu complejo, en el celu \| TurnoGol" | `/funciones/caja-y-buffet` |

**Requisitos:**
- Subtítulos en español (no los automáticos sin revisar).
- Capítulos.
- Descripción que arranque con la frase canónica corta y el enlace a la página.
- Versión vertical de 30 a 60 segundos para Instagram y TikTok.

**Por qué:**
- Las menciones en YouTube son la señal más correlacionada con aparecer en respuestas de IA (ρ ≈ 0,737; Ahrefs, diciembre de 2025, citado en el prompt; correlacional).
- YouTube es el dominio más citado por AI Overviews (citado en el prompt).
- **Fuerza media.**

---

## Etapa 3 — escala

| Pieza | Brief corto | Tarea |
|---|---|---|
| `/herramientas/calculadora-de-faltazos` | Sale de `CalculadoraClavo.tsx` (`src/app/(business)/precios/`): un form en HTML real y SSR que muestra el resultado con los números del dueño. `/precios` la enlaza en vez de embeberla | VIS-050 |
| `/herramientas/precio-por-jugador` | Precio de la cancha ÷ jugadores por formato (5, 7, 11) | VIS-050 |
| `/herramientas/planilla-de-fijos` | Planilla descargable (CSV) con el formato que acepta el importador | VIS-050 |
| `/ayuda` | Índice de tutoriales en video con su transcripción | VIS-051 |
| `/cambios` | Historial fechado de mejoras, en lenguaje de dueño y solo con funciones en estado A. Es la señal de frescura más honesta | VIS-051 |
| `/para/{futbol-5-barrio, predio-futbol-7-11, complejo-con-buffet}` | Solo si cada una tiene un caso, números y una configuración propia. Si no, no se hace (riesgo de contenido casi duplicado) | VIS-055 |
| Páginas de ciudad | Solo con 3 o más complejos activos en esa ciudad y datos agregados reales | VIS-054 |
| Índice TurnoGol del Fútbol 5 | Precio del turno en pico y valle por ciudad, seña promedio, etc. Se releva con llamados y encuestas, **nunca** raspando competidores. Metodología publicada | VIS-053 |

---

## Calendario de 90 días (01/11/2026 → 29/01/2027)

Supone unas 3 horas por semana de Lázaro fuera del código y sesiones de Claude Code a demanda. No hay presupuesto.

| Semana | Claude Code | Lázaro (fuera del código) |
|---|---|---|
| 1 (01-07/11) | V0: planilla y protocolo de medición. V1: técnico rápido + hotfix de claims + Vercel Analytics | VIS-000 secret scanning. Primera corrida de la línea base. Search Console. Firewall de Vercel. Verificar Bing |
| 2 (08-14/11) | V2: fichas y `/explorar` sin streaming oculto | VIS-005 prueba de acceso de las IAs. Búsqueda en el INPI. Alta en G2/Capterra, LinkedIn empresa y YouTube |
| 3 (15-21/11) | V3: home híbrida, `/para-complejos`, `/precios`, `/nosotros`, grafo JSON-LD | Corrida semanal. Elegir variantes de copy viendo la página |
| 4 (22-28/11) | V3 (cierre) + llms.txt | Pedirle a El Vagón el link en su perfil de Google y en su Instagram (plantilla en `05`). Crunchbase y Apple Business Connect |
| 5 (29/11-05/12) | V4: "¿Cómo nos conociste?" + claims de `/register` (con OK) | Corrida mensual completa. |
| 6 (06-12/12) | V5: relevamiento de competidores + `/comparar/turnogol-vs-vibe` y `-atc-sports` | Revisar los datos de las comparativas. Video 1 |
| 7 (13-19/12) | V5: `-canchafija`, `-clubin`, `/alternativas/atc-sports`, guía de cómo elegir + 301 | Video 2. Pedido de reseña a los complejos activos (mismo mensaje a todos) |
| 8 (20-26/12) | V6: `/funciones/*` (primeras 4) | Corrida semanal (temporada baja, fiestas) |
| 9 (27/12-02/01) | V6: `/funciones/*` (restantes 4) + `/integraciones/mercado-pago` | Corrida mensual |
| 10 (03-09/01) | Incrustar los videos + VideoObject | Videos 3 y 4. Pedidos de inclusión en listas (Turnito, Clubbi, Clubin, ComparaSoftware) |
| 11 (10-16/01) | Revisión de `dateModified` solo donde cambió algo. `/cambios` (si da el tiempo) | Consulta a Google Actions Center (una sola, gratis) |
| 12-13 (17-29/01) | V7: calculadora de faltazos como herramienta | Corrida mensual + informe de 90 días contra la línea base. **Preparar el punto de control del 01/02/2027** (entidad) |

**Instagram, en paralelo** (cuenta nueva): 2 reels por semana desde La Fábrica, con texto que **describa** qué es TurnoGol, no solo que venda. Instagram profesional se indexa en Google desde el 10/07/2025 (citado en el prompt).
