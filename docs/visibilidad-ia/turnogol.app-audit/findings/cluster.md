# Clustering semántico y arquitectura hub-and-spoke — lado dueño de complejo

**Fecha:** 2026-11-02. **Estado:** completo. **Alcance:** planificación. No se escribió contenido ni se tocó el repo (solo lectura).
**Semillas:** "sistema de reservas para canchas de fútbol", "software para complejos de fútbol", "sistema de gestión de canchas" (mercado Argentina, español).

## 0. Resumen

- **Hub (pilar): `/para-complejos`.** Keyword primaria propuesta: "sistema de gestión para complejos de fútbol". Absorbe las 3 semillas y 8 variantes de cabeza.
- **5 clusters, 17 páginas** (pilar + 16 spokes): 4 reutilizan o reemplazan URLs que ya existen, 12 son nuevas.
  1. **La noche del complejo** (4): turnos fijos, cobro por equipo, caja y buffet, faltazos.
  2. **Reservas, seña y canales** (4): reservas online, seña con Mercado Pago, asistente de WhatsApp (Plus), RIVAL.
  3. **Alternativas a ATC** (2): alternativas/atc-sports, vs ATC.
  4. **Gratis o barato, ¿conviene?** (3): vs Vibe, vs CanchaFija, vs Clubin.
  5. **Elegir y cuánto cuesta** (3): guía de cómo elegir, `/precios`, calculadora de faltazos (Etapa 3).
- **Evidencia SERP débil.** Con WebSearch (US, no es Google) solo un agrupamiento queda respaldado por la SERP: alternativas a ATC ~ ATC vs otros (5 URLs compartidas). El resto se decide por intención, JTBD y el relevamiento del 30/10. Detalle en §2.
- **Hallazgos fuertes sobre lo que ya existe:** `/vs/alquila-tu-cancha` y `/alternativas-alquila-tu-cancha` son huérfanas (solo en `sitemap.ts:19-20`); los slugs nuevos no están en `RESERVED_SLUGS`; hay riesgo de canibalización entre `/funciones/sena-opcional` y `/integraciones/mercado-pago`.
- **Sin páginas por ciudad ni doorways.** Lista de exclusiones en §8.

## 1. Fuentes y verificación en el repo

- Plan previo, que este análisis reutiliza y ajusta: `docs/visibilidad-ia/02-estrategia.md` §4 y §8, `04-contenidos.md` B-02 a B-11, `07-riesgos-y-lineas-rojas.md`, `01-auditoria.md`.
- Rutas existentes verificadas en el árbol local (rama `feat/panel-mobile-denso`, que puede estar atrasada respecto de `origin/main`):
  - `src/app/(business)/para-complejos/page.tsx`, `precios/page.tsx`, `blog/page.tsx`, `blog/[slug]/page.tsx`, `vs/alquila-tu-cancha/page.tsx`, `alternativas-alquila-tu-cancha/page.tsx`.
  - Contenido: `content/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026.mdx`, `content/pages/vs-alquila-tu-cancha.mdx`, `content/pages/alternativas-alquila-tu-cancha.mdx`.
- Enlaces internos hoy (grep en `src/app/(business)`, `src/components/site`, `content/`):
  - `BusinessHeader.tsx:66,72,78` → `/para-complejos#features`, `/precios`, `/blog`. `BusinessFooter.tsx:41` → `/precios`. `PortalHeader.tsx:68,153` y `SiteFooter.tsx:47` → `/para-complejos`.
  - `para-complejos/page.tsx:262` → `/precios`. `precios/page.tsx:424` → `/para-complejos`.
  - **Ningún enlace entrante** a `/vs/alquila-tu-cancha` ni a `/alternativas-alquila-tu-cancha`, salvo el sitemap. Los `.mdx` no tienen enlaces internos (el único enlace es el `wa.me/5491100000000` placeholder, `vs-alquila-tu-cancha.mdx:40`).
  - El post del blog solo lo enlaza el índice `/blog`.
- `RESERVED_SLUGS` (`src/modules/tenants/tenant.utils.ts:39-99`) trae `blog`, `para-complejos`, `precios`, `vs`, `alternativas-alquila-tu-cancha`, `rival`, `explorar`. **Faltan** `funciones`, `comparar`, `alternativas`, `guias`, `integraciones`, `herramientas`, `nosotros`. Hay que sumarlos antes de crear cada ruta (T-10 de `01-auditoria.md`).

## 2. Método y límites de la evidencia

- 24 SERPs con WebSearch (modo estándar) + 7 sondeos con `allowed_domains` (vibe.com.ar, canchafija.com.ar, clubinarg.com, atcsports.io, turnogol.app). Las otras 24 keywords se asignan por regla de salto (misma cabeza + misma intención), sin SERP.
- **WebSearch es US-only y no es Google.** Devuelve 10-18 links y mezcla tesis, prensa de 2020 y repos. Para ninguna keyword de cabeza apareció un dominio comercial argentino (vibe, canchafija, clubin, atcsports, turnogol). Solo salen con `allowed_domains`. Conclusión: **señal débil**, no un SERP argentino.
- Normalización: sin protocolo, sin query string, variantes AMP / `handle` / `locale` colapsadas a una URL. Se excluyó `gust.com/companies/canchaya` por ubicua (9 de 24 top-10) y se colapsó el artículo de Infonegocios sobre AlquiláTuCancha (aparece con 3 URLs: `enfoque`, `amp/enfoque`, `nota-principal`). Sin esos ajustes el máximo bruto es 5 en dos pares; con ellos, solo un par llega a 5.
- Sin fuente de volumen: **volumen = n/d** en todo el documento. "Mayor volumen" para elegir el pilar no se pudo aplicar; ver §10, pregunta 4.
- Resumen de un sondeo, no verificado: el resumen de la herramienta dio USD 40 para el plan base de ATC (1 a 3 canchas); `02-estrategia.md` §6 dice USD 50 (relevado el 30/10). **No publicar ninguno hasta leer la fuente** (`atcsports.io/software-gestion-deportiva`) con fecha.

### Lo que dice la SERP sobre turnogol.app

Con `allowed_domains=turnogol.app`, dos consultas distintas devolvieron **solo la home**, descrita como plataforma de reservas para jugadores con la seña de Mercado Pago como gancho. `/para-complejos`, `/precios`, `/blog/...`, `/vs/...` y `/alternativas-...` no salieron. Es consistente con C-01, C-02 y C-10 de `01-auditoria.md`. Es lectura de una herramienta de búsqueda, no de Search Console.

### Arquitectura de contenido observada en competidores (herramienta, 02/11/2026)

| Competidor | Páginas de captación observadas | Patrón a NO copiar |
|---|---|---|
| ATC (atcsports.io) | `/software-gestion-deportiva`, `/sistema-de-gestion-de-clubes`, `/software-administracion-gestion-deportiva`, `/software-para-clubes-gratis`, `/como-funciona-software-deportivo-alquila-tu-cancha` | `/venues/<complejo>` (directorio) |
| CanchaFija | `/software-para-clubes-deportivos`, `/canchas-de-futbol` | `/canchas-de-futbol-en-<ciudad>` y `/t/<complejo>`: páginas por ciudad y por complejo, exactamente el patrón doorway que está vetado |
| Clubin | `/comparativa-software-clubes-argentina`, `/complejos-deportivos` | — |
| Vibe | Solo home (`vibe.com.ar`, `app.vibe.com.ar`) apareció en el sondeo | — |

Los competidores apuntan a "software / sistema de gestión" más "clubes / complejos". Ninguno de los resultados observados trata cobro por equipo, caja y buffet, faltazos o turnos fijos como página propia con ese nombre. Es una lectura de pocos sondeos; confirmar con la herramienta de SEO real cuando exista.

## 3. Expansión de keywords e intención (48)

Intención: **C** comercial, **I** informacional, **T** transaccional, **N** navegacional/marca. "SERP" = se trajo la SERP (K01-K24, mismo número en la matriz); "Der." = derivada, asignada por regla de salto.

| ID | Keyword | Int. | Fuente | Destino |
|---|---|---|---|---|
| K01 | sistema de reservas para canchas de fútbol (semilla) | C | SERP | Pilar |
| K02 | software para complejos de fútbol (semilla) | C | SERP | Pilar |
| K03 | sistema de gestión de canchas (semilla) | C | SERP | Pilar |
| K04 | programa para administrar canchas de fútbol | C | SERP | Pilar |
| K05 | software para canchas de fútbol 5 | C | SERP | Pilar |
| K06 | sistema de turnos para canchas de fútbol | C | SERP | Pilar |
| K07 | app para gestionar complejo de fútbol | C | SERP | Pilar |
| K08 | software de gestión para complejos deportivos Argentina | C | SERP | Pilar |
| K09 | mejores sistemas de gestión para complejos de fútbol 5 Argentina | C | SERP | D1 guía |
| K10 | alternativas a ATC Sports | C | SERP | A1 |
| K11 | Alquila Tu Cancha precios | C | SERP | A2 |
| K12 | sistema de reservas de canchas gratis para dueños de complejos | C | SERP | B1 |
| K13 | turnos fijos canchas de fútbol sistema abonados | C | SERP | F1 |
| K14 | cobrar señas online canchas Mercado Pago complejo | C | SERP | G2 |
| K15 | control de caja y stock buffet complejo de canchas software | C | SERP | F3 |
| K16 | cómo evitar que falten a los turnos de la cancha de fútbol | I | SERP | F4 |
| K17 | dividir el pago de la cancha entre jugadores app | I | SERP | F2 |
| K18 | bot de WhatsApp para reservas de canchas | C | SERP | G3 |
| K19 | cómo administrar un complejo de canchas de fútbol 5 | I | SERP | fuera (backlog) |
| K20 | sistema de reservas online para canchas sin descargar app | C | SERP | G1 |
| K21 | planilla excel para reservas de canchas de fútbol | I | SERP | fuera (Etapa 3, herramienta) |
| K22 | app para reservar canchas de fútbol Argentina | T (jugador) | SERP | fuera: `/explorar` |
| K23 | software de reservas para canchas deportivas pádel fútbol | C | SERP | fuera (multideporte) |
| K24 | Vibe vs ATC Sports diferencias sistema de gestión | C | SERP | B1 |
| K25 | sistema de gestión para complejos de fútbol | C | Der. | Pilar (primaria) |
| K26 | software para canchas de fútbol | C | Der. | Pilar |
| K27 | sistema de abonos / fijos para canchas | C | Der. | F1 |
| K28 | cómo cobrar la seña de una cancha | I | Der. | G2 |
| K29 | conectar Mercado Pago a un sistema de reservas | C | Der. | G2 |
| K30 | comisión de Mercado Pago por reserva | I | Der. | G2 (sección) |
| K31 | sistema de canchas sin comisión por reserva | C | Der. | D2 |
| K32 | cuánto cuesta un sistema para complejos de canchas | C | Der. | D2 |
| K33 | TurnoGol precios | N | Der. | `/precios` (marca, fuera del clustering) |
| K34 | qué es TurnoGol / TurnoGol opiniones | N | Der. | `/` y `/nosotros` (marca, fuera) |
| K35 | TurnoGol vs ATC Sports | C | Der. | A2 |
| K36 | TurnoGol vs Vibe | C | Der. | B1 |
| K37 | CanchaFija precios / TurnoGol vs CanchaFija | C | Der. | B2 |
| K38 | Clubin precios / TurnoGol vs Clubin | C | Der. | B3 |
| K39 | stock de cantina / buffet de un complejo | I | Der. | F3 |
| K40 | caja diaria de un complejo de canchas | I | Der. | F3 |
| K41 | qué hacer con el que no se presenta al turno | I | Der. | F4 |
| K42 | calculadora de turnos perdidos por faltazos | I | Der. | D3 |
| K43 | cobrar la cancha de a partes entre equipos | I | Der. | F2 |
| K44 | app para armar partidos de fútbol (ángulo dueño) | T/I | Der. | G4; el ángulo jugador va a `/rival` |
| K45 | sistema para canchas de fútbol 7 y 11 | C | Der. | Pilar (sección, sin página propia) |
| K46 | atc sports login, vibe.com.ar, clubinarg, canchafija, turnosgol | N | Der. | fuera: navegacionales; TurnosGol no se nombra en la web (`02-estrategia.md` §7) |
| K47 | recordatorios de turnos por WhatsApp a jugadores | C | Der. | fuera: la función no existe (sin recordatorio al jugador en v1) |
| K48 | software de torneos de fútbol, facturación AFIP, canchas de pádel | C | Der. | fuera: torneos con flag apagado, AFIP fuera de scope v1, TurnoGol es solo fútbol |

**Distribución:** 32 comerciales, 11 informacionales, 2 transaccionales (lado jugador), 3 navegacionales. **39 asignadas** a las 17 páginas; **9 fuera** (K19, K21, K22, K23, K33, K34, K46, K47, K48).

## 4. Matriz de solapamiento de SERP

24 keywords, 276 pares. Puntaje = URLs compartidas en el top-10, con la normalización de §2. Diagonal = 10 por definición.

- **Pares con puntaje 1 o más: 31 de 276.** Los otros 245 valen 0.
- Distribución: 1 par en 5, 2 pares en 3, 6 pares en 2, 22 pares en 1. **Ningún par llega a 7**, así que no hay fusión por SERP.

| Par | Puntaje | URLs compartidas | Decisión |
|---|---|---|---|
| K10 ~ K24 | **5** | cancilleria.gob.ar (ATC) + 4 fichas de CB Insights | **Mismo cluster, posts separados** (A1 y A2 / B1) |
| K01 ~ K20 | 3 | 2 tesis (UNAD) + FootBooking UTN | 3-4: misma intención de dueño, misma cabeza → mismo cluster (pilar) |
| K09 ~ K19 | 3 | 2 notas de elsol.com.ar + baenegocios.com | 3-4: intenciones distintas (comercial vs informacional) → separados; K19 queda en backlog |
| K12~K20, K20~K23, K01~K21, K20~K21, K21~K23, K06~K13 | 2 | tesis, FootBooking, Infonegocios, anolla.com, prensa | Interlink. Ruido académico y de prensa, no páginas comerciales |
| 22 pares restantes (ejemplos: K01~K06, K02~K05, K04~K07, K12~K14, K20~K22) | 1 | FootBooking, Anolla, Azure Marketplace, Infonegocios | Separados |
| Todo par con K08, K11, K15, K16, K17, K18 | 0 | — | Separados: son huecos |

Lectura SERP por tipo de feature (anti-patrón 4 de la metodología): K15 trajo software de restaurantes y hoteles; K16, prensa deportiva y manuales de entrenamiento; K17, Playtomic y calculadoras de gastos; K18, bots genéricos de WhatsApp. **Ningún resultado trata del caso canchas de fútbol.** Esto no prueba demanda, pero respalda una página por función en lugar de fusionarlas.

Dos advertencias de desambiguación que salen de la SERP:
- K10 se contamina con control de tráfico aéreo y simuladores ("ATC"). K11 devolvió tarifas municipales de alquiler en Perú y Chile. **Los títulos y H1 de A1 y A2 deben llevar "sistema de gestión" o "software" junto a "ATC Sports (Alquila Tu Cancha)"**, como ya propone `04-contenidos.md` B-08.
- K22 (jugador) lo domina la nota de Infonegocios sobre AlquiláTuCancha: en prensa ATC es "la app del jugador". Eso refuerza que el lado dueño necesita páginas propias y no mezclarse con `/explorar`.

## 5. Arquitectura de clusters

Volumen n/d en todas las filas. Plantillas según `hub-spoke-architecture.md`; donde se repite plantilla dentro de un cluster, la justifica la intención (informacional-how contra comercial-landing, o misma comparación contra otro competidor). "Existe" = ya hay ruta en el repo.

### Pilar

| ID | URL | Keyword primaria | Secundarias | Plantilla | Largo objetivo | Estado |
|---|---|---|---|---|---|---|
| P | `/para-complejos` | sistema de gestión para complejos de fútbol (K25) | K01-K08, K26, K45 | ultimate-guide | 2.500 | Existe: reescribir (B-02) |

Por qué esta primaria y no "sistema de reservas para canchas de fútbol": (a) la titular de producto es la operación de la noche más las reservas 24/7 (D10), no solo reservas; (b) la SERP de K01 trae tesis y nada comercial, así que su intención es ambigua; (c) los competidores observados titulan por "sistema/software de gestión". "Sistema de reservas" entra una vez en el H1 o el primer párrafo, sin apilar keywords. El volumen no está medido (§10, pregunta 4).

### Spokes

| ID | Cluster | URL | Keyword primaria (únicas) | Plantilla | Largo | Estado |
|---|---|---|---|---|---|---|
| F1 | 1 La noche del complejo | `/funciones/turnos-fijos` | sistema de turnos fijos para canchas (K13, K27) | landing-page | 1.000-1.200 | Nueva |
| F2 | 1 | `/funciones/cobro-por-equipo` | cobrar la cancha por equipo y de a partes (K17, K43) | how-to | 1.000-1.200 | Nueva |
| F3 | 1 | `/funciones/caja-y-buffet` | control de caja y stock del buffet en un complejo (K15, K39, K40) | landing-page | 1.000-1.200 | Nueva |
| F4 | 1 | `/funciones/faltazos` | cómo evitar que falten a los turnos de la cancha (K16, K41) | how-to | 1.000-1.200 | Nueva |
| G1 | 2 Reservas, seña y canales | `/funciones/reservas-online` | sistema de reservas online para canchas sin app (K20) | landing-page | 1.000-1.200 | Nueva |
| G2 | 2 | `/funciones/sena-opcional` (absorbe `/integraciones/mercado-pago`, ver §7) | cobrar señas con Mercado Pago en un complejo de fútbol (K14, K28, K29, K30) | how-to | 1.200 | Nueva; va última (D9) |
| G3 | 2 | `/funciones/asistente-whatsapp` | bot de WhatsApp para reservas de canchas (K18) | landing-page | 1.000-1.200 | Nueva; estado B, Plus (extra) |
| G4 | 2 | `/funciones/rival` | armar partidos en tu cancha, ángulo dueño (K44) | landing-page | 1.000 | Nueva; estado B |
| A1 | 3 Alternativas a ATC | `/alternativas/atc-sports` | alternativas a ATC Sports (K10) | best-of | 1.500 | Nueva; reemplaza `/alternativas-alquila-tu-cancha` (301) |
| A2 | 3 | `/comparar/turnogol-vs-atc-sports` | TurnoGol vs ATC Sports (K11, K35) | comparison | 1.500 | Nueva; reemplaza `/vs/alquila-tu-cancha` (301) |
| B1 | 4 Gratis o barato | `/comparar/turnogol-vs-vibe` | TurnoGol vs Vibe (K12, K24, K36) | comparison | 1.500 | Nueva |
| B2 | 4 | `/comparar/turnogol-vs-canchafija` | TurnoGol vs CanchaFija (K37) | comparison | 1.500 | Nueva |
| B3 | 4 | `/comparar/turnogol-vs-clubin` | TurnoGol vs Clubin (K38) | comparison | 1.500 | Nueva |
| D1 | 5 Elegir y precio | `/guias/como-elegir-sistema-para-complejo-de-futbol` | cómo elegir un sistema para tu complejo de fútbol (K09) | best-of (criterios) | 1.800 | Nueva; reemplaza el post del blog (301) |
| D2 | 5 | `/precios` | TurnoGol precios / cuánto cuesta (K31, K32) | landing-page | existente | Existe: correcciones B-03 |
| D3 | 5 | `/herramientas/calculadora-de-faltazos` | calculadora de turnos perdidos por faltazos (K42) | landing-page (herramienta) | n/a | Nueva; Etapa 3 |

**Por qué estos cortes:**
- **C1 contra C2.** Las 8 funciones del plan previo no entran en un cluster (máximo 4). Se parten por momento del JTBD: lo que pasa durante la noche (fijos, cobro, caja, faltazos) y lo que pasa antes, cuando el jugador llega y paga (reservas, seña, canal de WhatsApp, RIVAL).
- **C3 aparte de C4.** La SERP respalda juntar "alternativas a ATC" y "vs ATC" (5 URLs). C4 agrupa a los que compiten por precio: Vibe $0 más $1.000 al jugador, CanchaFija y Clubin (relevamiento del 30/10, `02-estrategia.md` §3). Es el mismo prompt "¿hay algo gratis o más barato?".
- **C5.** Reúne las páginas de decisión: la única "lista" del sitio, el precio y la herramienta de ancla.
- **Totales:** 5 clusters (máximo), 2-4 posts por cluster, 17 páginas incluido el pilar (rango 5-21).

## 6. Matriz de enlaces internos

IDs de la §5. Tipos: **M** obligatorio (spoke <-> pilar), **R** recomendado (dentro del cluster, y entre los clusters 3-4-5, que son un solo embudo de decisión), **O** opcional (puente entre clusters de funciones).

### Lista de adyacencia (saliente)

```
P  -> F1 F2 F3 F4 G1 G2 G3 G4 A1 A2 B1 B2 B3 D1 D2 D3                (M x16)
F1 -> P(M) F2 F3 F4 (R)
F2 -> P(M) F1 F3 F4 (R)  G2 (O)
F3 -> P(M) F1 F2 F4 (R)
F4 -> P(M) F1 F2 F3 (R)  D3 (O)
G1 -> P(M) G2 G3 G4 (R)  F1 (O)
G2 -> P(M) G1 G3 (R)     F4 (O)
G3 -> P(M) G1 G2 G4 (R)
G4 -> P(M) G1 G3 (R)     /rival (externo a la matriz)
A1 -> P(M) A2 (R)        B1 B2 B3 D1 D2 (R, embudo de decisión)
A2 -> P(M) A1 (R)        D1 D2 (R)   F1 F2 (O, solo si el relevamiento confirma el diferencial)
B1 -> P(M) B2 B3 (R)     A1 D1 D2 (R) F1 F2 (O, ídem)
B2 -> P(M) B1 B3 (R)     A1 D1 D2 (R) F1 F2 (O, ídem)
B3 -> P(M) B1 B2 (R)     A1 D1 D2 (R) F1 F2 (O, ídem)
D1 -> P(M) D2 D3 (R)     A1 A2 B1 B2 B3 (R)
D2 -> P(M) D1 D3 (R)
D3 -> P(M) D2 D1 (R)     F4 (O)
```

**Conteo:** 102 enlaces en la matriz = 32 obligatorios + 36 recomendados dentro del cluster + 34 de puente (embudo de decisión y puentes de funciones). Densidad: 6,0 enlaces por página.

### Entrantes por spoke (mínimo exigido: 3)

| F1 | F2 | F3 | F4 | G1 | G2 | G3 | G4 | A1 | A2 | B1 | B2 | B3 | D1 | D2 | D3 | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9 | 8 | 4 | 6 | 4 | 4 | 4 | **3** | 6 | **3** | 5 | 5 | 5 | 8 | 8 | 4 | 16 |

Mínimo 3 (G4 y A2). Huérfanos en la matriz: 0. Todo está a 1 clic del pilar.

### Enlaces de entrada desde fuera de la matriz (sitio global)

- Home (banda para dueños, B-01) -> P y D2. Header: P (hoy `#features`), D2, y en lugar de "Blog" un enlace a la guía D1 o a "Comparar". Footer: D2, `/nosotros`, D1.
- `/nosotros` -> P. Fichas `/{slug}` (pie "Reservas con TurnoGol", B-05) -> P. `llms.txt`: P, D2, `/nosotros`, funciones, comparativas.
- Sitemap: sumar las 16 URLs nuevas, sacar las 3 viejas en el mismo PR y dar fechas `lastmod` reales (T-07).

### Reglas de anchor y de enlace

- Ningún anchor repetido en más del 40% de los enlaces a una misma página: P recibe 16 enlaces, así que varían entre "sistema de gestión para complejos de fútbol", "TurnoGol" y la función concreta.
- Enlaces dentro del cuerpo, no solo en "relacionados". Los puentes A2/B* -> F1/F2 **solo se escriben si el relevamiento V5 confirma que ese es un diferencial real contra ese competidor**; no se afirma nada del competidor sin fuente y fecha.
- Desvío declarado: la spec pide 0-1 enlaces entre clusters por post. Los clusters 3, 4 y 5 son un solo embudo (el que compara termina en la guía y en `/precios`), así que ahí los enlaces se tratan como recomendados. Si se prefiere cumplir la spec al pie de la letra, quitar los puentes A2/B* -> F1/F2 (8 enlaces) y A1 -> B* (3 enlaces).

## 7. Reutilización de URLs existentes y redirecciones

| URL existente | Qué pasa | Detalle |
|---|---|---|
| `/para-complejos` | Se queda como pilar (P) | Reescritura B-02: de "sistema de señas" a "sistema de gestión". Hoy ~520 palabras (`01-auditoria.md` §7) |
| `/precios` | Se queda como D2 | Correcciones B-03. Enlaza a la calculadora D3 en lugar de embeberla (hoy `CalculadoraClavo.tsx`) |
| `/vs/alquila-tu-cancha` | 301 a `/comparar/turnogol-vs-atc-sports` | Huérfana hoy; claims sin dato (`01-auditoria.md` C-05) |
| `/alternativas-alquila-tu-cancha` | 301 a `/alternativas/atc-sports` | Ídem. Sacar su entrada de `RESERVED_SLUGS` solo si se decide liberar el slug; mantenerla es inocuo |
| `/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026` | 301 a `/guias/como-elegir-sistema-para-complejo-de-futbol` | Con el único post redirigido, `/blog` queda vacío |
| `/blog` | 301 a la guía D1 mientras haya una sola guía | `/guias` como índice recién con 2 o más guías (si no, el breadcrumb apuntaría a una página casi vacía). Reemplazar el enlace "Blog" de `BusinessHeader.tsx:78` y `:117` |

**Antes de crear cualquier ruta:** sumar a `RESERVED_SLUGS` `funciones`, `comparar`, `alternativas`, `guias`, `herramientas`, `nosotros` (e `integraciones` solo si se mantiene esa ruta). Lázaro confirma con un SELECT de solo lectura que ningún complejo use ya esos slugs.

**Fusión propuesta (canibalización alta):** `/funciones/sena-opcional` y `/integraciones/mercado-pago` apuntan a la misma consulta ("cobrar señas con Mercado Pago"). Se propone **una sola página (G2)** con secciones: cómo se conecta, adónde va la plata, comisión de Mercado Pago con fuente y fecha, acreditación, qué pasa si se desconecta y devoluciones (las hace el complejo; no hay reembolso automático). Esto saca una página y deja C2 en 4. Ver §10, pregunta 1.

## 8. Chequeo de canibalización

Una keyword primaria por página (tabla de §5): no hay dos páginas con la misma. Riesgos entre pares:

| # | Par | Riesgo | Por qué | Mitigación |
|---|---|---|---|---|
| R1 | G2 y `/integraciones/mercado-pago` | **Alto** | Misma consulta K14 y mismo contenido | Fusionar (§7) |
| R2 | A1 y A2 | Medio | SERP 5 (mismo cluster) | Intención y plantilla distintas: A1 es lista de opciones (best-of) con "alternativas a ATC" como primaria; A2 es 1 contra 1 (comparison) con "TurnoGol vs ATC Sports" |
| R3 | P y G1 | Medio | K01 ~ K20 = 3 | P cubre "gestión" completa y resume la parte de reservas; G1 profundiza "reservas online sin app" en lenguaje de dueño. H1 distintos |
| R4 | G4 y `/rival` (jugador) | Medio | Los dos hablan de RIVAL | G4 se escribe para el dueño (qué le aporta a su complejo); `/rival` sigue siendo la landing del jugador. Sin "te traemos jugadores" (veto de producto) |
| R5 | G1 y `/` / `/explorar` | Bajo | "Reservar cancha online" es intención de jugador | G1 usa vocabulario de dueño ("que reserven online sin que se bajen una app"); `/explorar` queda del lado jugador |
| R6 | D2 y P | Bajo | Ambas muestran precio | P cita el precio desde `plans-data.ts` y enlaza a D2; D2 es la única que lo desarrolla |
| R7 | D1 y el post viejo del blog | Resuelto | Mismo tema | 301 |
| R8 | F4 y D3 | Bajo | Mismo tema | F4 explica; D3 es la herramienta, y se enlazan |

## 9. Exclusiones (restricciones del negocio)

- **Sin páginas por ciudad ni por país, sin "software para canchas en [ciudad]".** Solo se evalúan con 3 o más complejos activos en esa ciudad y datos agregados reales (`02-estrategia.md` §4, `07` §1). Hoy no hay datos publicables: D15 prohíbe publicar nada de clientes.
- **Sin `/para/{futbol-5-barrio, predio-futbol-7-11, complejo-con-buffet}`.** K45 (7 y 11) es una sección del pilar. Se reabre solo con caso, números y configuración propios.
- **Sin directorio de fichas con fines de SEO** al estilo `/t/<complejo>` de CanchaFija. Las fichas `/{slug}` de TurnoGol existen por producto, no por SEO.
- **Sin funciones en estado C o D** (cobro automático de fijos, recordatorios al jugador, torneos, rankings de RIVAL, reembolso automático, facturación AFIP, multideporte).
- **Sin números ni afirmaciones sobre competidores sin fuente y fecha.** Precios y funciones de ATC, Vibe, CanchaFija y Clubin salen de su web pública, con "según su web al DD/MM/AAAA". Lo visto con la herramienta es solo pista: ATC USD 40 contra USD 50, CanchaFija con `/software-para-clubes-deportivos` (el plan previo cita `/software-para-canchas-de-futbol`). Releer cada fuente antes de publicar.
- **No nombrar a TurnosGol** ni compararse con ellos.

## 10. Checklist previo a la entrega y preguntas abiertas

| Chequeo | Resultado |
|---|---|
| Ningún par de posts comparte keyword primaria | Cumple (con R1 resuelto por fusión) |
| Cada spoke con 3 o más enlaces entrantes | Cumple: mínimo 3 (G4, A2) |
| Cada spoke enlaza al pilar | Cumple (16 de 16) |
| El pilar enlaza a cada spoke | Cumple (16 de 16) |
| Sin páginas huérfanas en la matriz | Cumple. Hoy hay 2 huérfanas reales (`/vs/...`, `/alternativas-...`), que pasan a 301 |
| Plantilla coincide con la intención | Cumple (§5) |
| Largo dentro de spec (pilar 2.500-4.000; spoke 1.200-1.800) | **Parcial.** Pilar 2.500 cumple. Comparativas, alternativas y guía cumplen. **Las funciones (F1-F4, G1, G3, G4) quedan en 1.000-1.200, bajo el piso de 1.200**; `04-contenidos.md` B-10 las fija en 700-1.200. Desvío deliberado para no rellenar. `/precios` y la calculadora son páginas existentes o herramientas |
| 2-5 clusters, 2-4 posts por cluster | Cumple: 5 clusters; 4/4/2/3/3; 17 en total |
| Solapamiento de SERP respalda los grupos (ningún spoke con menos de 4 contra sus pares) | **No verificable con esta herramienta.** Solo C3 lo cumple (5). Los demás grupos se sostienen por intención y por el relevamiento del 30/10. Re-correr con Search Console tras la indexación o con una API de SERP con ubicación Argentina |

### REQUIERE INPUT

1. ¿Se fusiona `/integraciones/mercado-pago` dentro de `/funciones/sena-opcional`? Recomendación: sí (R1). Si no se fusionan, hay que separar de forma estricta: G2 = cómo funciona la seña opcional para el complejo; la integración = pasos técnicos de conexión, comisión y devoluciones, sin repetir.
2. ¿Largo de las páginas `/funciones/*`: 700-1.200 (plan previo) o 1.200 como mínimo (spec de spoke)? Recomendación: 1.000-1.200 con contenido único, sin relleno. La SERP no muestra competidores con página propia para estas funciones.
3. ¿`/blog` pasa a 301 hacia la guía mientras haya una sola guía, y el header cambia "Blog" por "Comparar" o la guía? Recomendación: sí. Evita un índice casi vacío.
4. Keyword primaria del pilar. No hay volumen medido. Recomendación: "sistema de gestión para complejos de fútbol" (D2/D10 y lo que usan los competidores). Cuando Search Console tenga datos, o con el planificador de palabras clave de Google, comparar contra "sistema de reservas para canchas de fútbol" antes de fijar el H1 definitivo.

## 11. Orden de ejecución sugerido (coherente con el calendario de `04-contenidos.md`)

1. Pilar P y `/precios` (ya en V3): son lo que hoy está desalineado y lo único de la matriz que ya existe.
2. Sumar slugs reservados, y luego C3 (A1 + A2) y C4: huecos con competidor nombrado y la única señal de SERP sólida. Requiere el relevamiento V5 con fuente y fecha.
3. D1 (guía) con los 301 del blog.
4. C1 y luego C2 (G2 última, D9; G3 y G4 solo con su estado "Ya disponible" confirmado).
5. D3 (Etapa 3).

## 12. JSON (formato `cluster-plan.json` + hallazgos de Content Architecture)

```json
{
  "version": "2.2.5",
  "seed_keyword": ["sistema de reservas para canchas de fútbol", "software para complejos de fútbol", "sistema de gestión de canchas"],
  "created_at": "2026-11-02",
  "market": "AR/es-AR",
  "data_quality": "weak: WebSearch US, not Google; volumes n/d; only cluster 3 supported by SERP overlap",
  "pillar": { "title": "Sistema de gestión para complejos de fútbol", "keyword": "sistema de gestión para complejos de fútbol", "volume": null, "template": "ultimate-guide", "wordCount": 2500, "url": "/para-complejos", "status": "existing-rewrite" },
  "clusters": [
    { "name": "La noche del complejo", "posts": [
      { "id": "F1", "keyword": "sistema de turnos fijos para canchas", "template": "landing-page", "wordCount": 1100, "url": "/funciones/turnos-fijos", "status": "planned" },
      { "id": "F2", "keyword": "cobrar la cancha por equipo", "template": "how-to", "wordCount": 1100, "url": "/funciones/cobro-por-equipo", "status": "planned" },
      { "id": "F3", "keyword": "control de caja y stock del buffet en un complejo", "template": "landing-page", "wordCount": 1100, "url": "/funciones/caja-y-buffet", "status": "planned" },
      { "id": "F4", "keyword": "cómo evitar que falten a los turnos de la cancha", "template": "how-to", "wordCount": 1100, "url": "/funciones/faltazos", "status": "planned" } ] },
    { "name": "Reservas, seña y canales", "posts": [
      { "id": "G1", "keyword": "sistema de reservas online para canchas sin app", "template": "landing-page", "wordCount": 1100, "url": "/funciones/reservas-online", "status": "planned" },
      { "id": "G2", "keyword": "cobrar señas con Mercado Pago en un complejo de fútbol", "template": "how-to", "wordCount": 1200, "url": "/funciones/sena-opcional", "status": "planned", "note": "absorbe /integraciones/mercado-pago (pending decision)" },
      { "id": "G3", "keyword": "bot de WhatsApp para reservas de canchas", "template": "landing-page", "wordCount": 1100, "url": "/funciones/asistente-whatsapp", "status": "planned", "feature_state": "B (Plus)" },
      { "id": "G4", "keyword": "armar partidos en tu cancha (dueño)", "template": "landing-page", "wordCount": 1000, "url": "/funciones/rival", "status": "planned", "feature_state": "B" } ] },
    { "name": "Alternativas a ATC", "posts": [
      { "id": "A1", "keyword": "alternativas a ATC Sports", "template": "best-of", "wordCount": 1500, "url": "/alternativas/atc-sports", "status": "planned", "replaces": "/alternativas-alquila-tu-cancha" },
      { "id": "A2", "keyword": "TurnoGol vs ATC Sports", "template": "comparison", "wordCount": 1500, "url": "/comparar/turnogol-vs-atc-sports", "status": "planned", "replaces": "/vs/alquila-tu-cancha" } ] },
    { "name": "Gratis o barato, conviene", "posts": [
      { "id": "B1", "keyword": "TurnoGol vs Vibe", "template": "comparison", "wordCount": 1500, "url": "/comparar/turnogol-vs-vibe", "status": "planned" },
      { "id": "B2", "keyword": "TurnoGol vs CanchaFija", "template": "comparison", "wordCount": 1500, "url": "/comparar/turnogol-vs-canchafija", "status": "planned" },
      { "id": "B3", "keyword": "TurnoGol vs Clubin", "template": "comparison", "wordCount": 1500, "url": "/comparar/turnogol-vs-clubin", "status": "planned" } ] },
    { "name": "Elegir y cuánto cuesta", "posts": [
      { "id": "D1", "keyword": "cómo elegir un sistema para tu complejo de fútbol", "template": "best-of", "wordCount": 1800, "url": "/guias/como-elegir-sistema-para-complejo-de-futbol", "status": "planned", "replaces": "/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026" },
      { "id": "D2", "keyword": "TurnoGol precios", "template": "landing-page", "url": "/precios", "status": "existing-fixes" },
      { "id": "D3", "keyword": "calculadora de turnos perdidos por faltazos", "template": "landing-page", "url": "/herramientas/calculadora-de-faltazos", "status": "planned", "stage": 3 } ] }
  ],
  "serp_matrix": {
    "keywords": ["K01..K24 (ver §3)"],
    "encoding": "sparse; pares no listados = 0; diagonal = 10",
    "pairs": { "K10-K24": 5, "K01-K20": 3, "K09-K19": 3, "K12-K20": 2, "K20-K23": 2, "K01-K21": 2, "K20-K21": 2, "K21-K23": 2, "K06-K13": 2 },
    "pairs_with_score_1": 22, "pairs_with_score_0": 245, "pairs_total": 276
  },
  "links": {
    "mandatory": "P <-> cada spoke (32)",
    "recommended": 36, "optional_or_decision_funnel": 34,
    "adjacency": "ver §6"
  },
  "scorecard": { "coverage": 0.81, "linkDensity": 6.0, "orphanPages": 0, "cannibalization": 1, "contentGaps": 6 },
  "content_architecture_findings": [
    { "id": "CA-01", "severity": "alta", "summary": "/vs/alquila-tu-cancha y /alternativas-alquila-tu-cancha son huérfanas: solo están en src/app/sitemap.ts:19-20; sin enlaces entrantes en src/ ni en content/", "fix": "301 a las URLs nuevas y enlazar desde pilar, guía y header/footer" },
    { "id": "CA-02", "severity": "alta", "summary": "No hay página para las consultas por función del dueño (cobro por equipo, caja y buffet, faltazos, turnos fijos, seña con MP); /para-complejos concentra 1 de unas 35 funciones", "fix": "Cluster 1 y 2 (§5)" },
    { "id": "CA-03", "severity": "media", "summary": "Canibalización probable entre /funciones/sena-opcional y /integraciones/mercado-pago del plan previo (misma consulta K14)", "fix": "Fusionar en G2" },
    { "id": "CA-04", "severity": "media", "summary": "src/modules/tenants/tenant.utils.ts:39-99 no reserva funciones, comparar, alternativas, guias, herramientas, nosotros: un complejo podría ocupar esos slugs", "fix": "Reservar antes de crear rutas; SELECT de solo lectura de Lázaro" },
    { "id": "CA-05", "severity": "media", "summary": "El blog tiene un solo post que será redirigido; BusinessHeader.tsx:78,117 enlaza a /blog", "fix": "301 /blog -> guía y cambiar el enlace del header" },
    { "id": "CA-06", "severity": "baja", "summary": "El solapamiento de SERP solo respalda el cluster 3; el resto se sostiene por intención. WebSearch es US-only", "fix": "Re-correr con Search Console o una API de SERP con ubicación Argentina" }
  ]
}
```
