# Competitive Teardown — mercado argentino de reservas y gestión de canchas (2026-09-01/02)

**Método.** 6 investigadores (Sonnet) sobre sitios oficiales, tiendas de apps, Instagram/LinkedIn, Meta Ad Library, prensa y blogs de competidores, más verificación propia **desde IP argentina con navegador real** (Playwright local) de las páginas de precios de ATC, Clubo, CanchaFija y Dónde Juego. Baseline: `docs/gtm/research/2026-07-18-competidores.md` y `doc2`.
**Etiquetas.** `FACT` = evidencia pública actual con fuente · `INFERENCE` = interpretación estratégica · `UNKNOWN` = no verificable.
**Límites.** Google Play bloqueó la extracción en datacenter para casi todos (solo Dónde Juego se pudo leer con navegador real). Meta Ad Library se pudo leer para Clubo y Dónde Juego, no para el resto. Precios `FACT-AR` = verificados desde Argentina; `FACT` a secas = fetch remoto de sitio `.ar` con ARS explícito (riesgo geo bajo).

---

## 1. Mapa competitivo

### 1.1 Las seis categorías (un jugador puede estar en dos)

| Categoría | Quiénes | Qué cree comprar el dueño |
|---|---|---|
| **1. SaaS de gestión puro** (posee solo al complejo) | **Clubo**, **Korus**, **JuegaFácil**, **MisCanchas**, **CanchaLibre**, Clubin, Clubify, AgendaPro, **Turnito** (genéricos) | "Un sistema que me ordene la agenda y la caja y me saque el WhatsApp de encima" |
| **2. Marketplace / discovery** (posee al jugador, el complejo es oferta) | **EasyCancha**, **Canchero**, **hayPartido**, Reva, Turno Libre (buscador), apps de armar partido | "Que me traigan jugadores" |
| **3. Híbridos SaaS + marketplace** (intentan poseer ambos) | **ATC**, **Dónde Juego**, **CanchaFija**, **Don Potrero**, CanchaYa, Turno Libre Business | "El software y la vidriera en uno" |
| **4. Low-cost / free tier** | **CanchaFija** ($10k-$60k), **Turnito** ($0-$42k), **Korus** (gratis ≤2 canchas), **Don Potrero** (Amateur gratis), CanchaLibre ($35k), CanchaYa ($40k), Clubin (gratis ≤80 socios) | "Algo que me cueste menos que un turno" |
| **5. Multi-deporte** | ATC, EasyCancha, Dónde Juego, Korus, Clubo, CanchaFija, CanchaYa, CanchaLibre, MisCanchas, Canchero, **JuegaFácil** (pese al branding futbolero, lista 9 deportes) | "Me sirve para el fútbol y para las de pádel que puse" |
| **6. Football-first** | **Don Potrero** (único fútbol-only declarado, ejecución débil), Tiki Taka (San Juan, lanzamiento), TurnoGol | "Uno que entienda de fútbol" |

`FACT`: en todo el barrido, **el único competidor con evidencia de operar que es fútbol-only declarado es Don Potrero** (604 seguidores IG, login solo Facebook, contradicción interna sobre si el pago online funciona). Todos los demás con tracción son multi-deporte.

### 1.2 Quién posee a quién (lectura estratégica)

| | Posee al complejo | Posee al jugador | Evidencia de densidad |
|---|---|---|---|
| **ATC** | Sí (SaaS, "+900 clubes con sistema de gestión") | Sí (app, "+2.000.000 usuarios", 1,9M usuarios en 2025, 600K reservas online 2025, módulo de partidos +50% mensual) | La mayor del país. `FACT` clubes.atcsports.io y Emprelatam 25-jun-2026 |
| **Dónde Juego** | Sí (agenda, caja+stock, colaboradores, sanciones) | Sí (100K+ instalaciones Android, 4,9★/3,27K reseñas; convocatoria abierta; "Profesores") | Segunda; equipo 2-10 personas en Santa Fe, sin funding, prueba social congelada desde julio |
| **CanchaFija** | Sí (SaaS completo, $10k-$60k) | Intenta (directorio SEO, app Android, Falta Uno, reseñas) | 842 seguidores IG; 7 complejos nombrados (CABA, Lanús, Zárate, Resistencia); tamaño real `UNKNOWN` |
| **Clubo** | Sí, agresivo (~30 ads activos, campaña por 16 provincias desde 19-ago) | No (sin app, sin perfil, reserva sin login) | 2.169 seguidores IG; clientes `UNKNOWN` |
| **EasyCancha** | Parcial (torneos, "pagos con club cerrado") | Sí (700+ clubes LATAM, 4,8★/192 iOS, PRIME membership de jugador) | Regional; en GBA solo confirmado Pilar (Backyard, fútbol 11/7) |
| **Don Potrero** | Sí (Pro sin precio) | Intenta (seguidores, historial, goles) | Mínima |
| **Korus / JuegaFácil / MisCanchas / CanchaLibre / CanchaYa / Turno Libre** | Sí | No o marginal | Mínima o `UNKNOWN` |
| **TurnoGol hoy** | Sí (SaaS) | Esqueleto (`players` cross-tenant, `/explorar`, reseñas) sin masa | 0 clientes |

### 1.3 Fichas resumen (lo nuevo desde julio)

- **ATC** (`FACT-AR` 2026-09-02): Base 1-3 canchas **$71.000** (anual $57.000/mes = $684.000/año), Estándar 4-6 **$111.000** ($89.000), Full 7+ **$145.000** ($116.000). Ancla la página con el precio anual: *"Automatizá tu complejo desde $57.000 por mes"*. Trial 1 mes, pero sigue con formulario + comercial. **Ahora publica números**: "+8 años", "+1.000 complejos", "+4.000 canchas", "+2.000.000 usuarios", "+900 clubes ya confían". Nuevo: *sistema de reputación de usuarios*, "Falta 1" con nivel de habilidad tipo ELO, Beelup activo (clips de 1 min), *"Ventas 24/7"*, control de acceso, banners con QR. H1 de home hoy: **"Reserva tu cancha al instante"**. Inconsistencia propia: 20% vs 33% de descuento anual en la misma página. Trayectoria de precio: $48.500 (feb-2026, blog Turnito) → $66.000 (jul) → $71.000 (ago-sep): +46% en 7 meses. IVA sigue sin aclararse.
- **Dónde Juego** (`FACT-AR`): H1 **"Tu cancha, siempre llena."**, eyebrow "LA PLATAFORMA #1 DE RESERVAS EN ARGENTINA", "+2.000 canchas activas / +900K turnos / +250K jugadores" (idéntico a julio). **Sin precio público**, venta por formulario/WhatsApp (código de área de Santa Fe). Features: sanción de jugadores con alerta al reincidir, verificación telefónica, caja+productos+stock, pago anticipado online o efectivo, recordatorios, colaboradores con permisos, registro de operaciones, **convocatoria abierta** (Falta Uno) y **programa "Profesores"** (instructores publican clases). Primera pauta paga detectada el 12-ago-2026 (1 anuncio, CTA WhatsApp). `center.dondejuegoapp.com` (el B2B de julio) da 404. MercadoPago no se nombra. Abonados y torneos: `UNKNOWN`. iOS 4,3★/103; Android 4,9★/3,27K, 100K+, v3.13.0 (18-ago). **No coincide con "desarrollando con fuerza ambos lados"**: es una app con tracción real de jugadores y un equipo chico que recién empieza a pautar.
- **Clubo** (`FACT-AR`): H1 **"LLEVA LA GESTIÓN DE TU CLUB DEPORTIVO AL SIGUIENTE NIVEL"**. **$25.000 ARS/mes por cancha de fútbol** ($19.000 pádel/tenis/pickleball), "Precio para Argentina", anual -20%, primer mes gratis. Claims: "Reducí un 80% el esfuerzo", "Disminuí un 90% las cancelaciones" (seña MP), bot de WhatsApp, "NO hay que descargar app/verificar nro/loguearse", cantina con "arqueo de caja" y cobros QR, *"Somos la primera plataforma en integrar la gestión de cantina"*. Ads: **≥23 creatividades activas** (de "14+" en julio), testimonial con nombre de pila, y campaña **"Si tenés un predio en [PROVINCIA]"** en 16 provincias incluida Buenos Aires desde el 19/21-ago; todos los CTA a WhatsApp. Mensajes nuevos: *"La opción nro 1 para ser ordenado, sin complicarse de más"*, *"Tu predio en orden. Nosotros te ayudamos."* Sin app, sin lado jugador, sin torneos/abonados/roles visibles. Clubo S.A.S., código de área de Córdoba. Equipo/clientes `UNKNOWN`.
- **CanchaFija** (`FACT-AR`, el sitio da 403 a datacenters pero abre desde Argentina): planes **Lite $10.000 (1 cancha) · Inicial $18.000 (3) · Pro $25.000 (6) · Club $50.000 (10) · Premium $60.000 (15)**, primer mes gratis, sin alta, sin permanencia, "Pagá con Mercado Pago". **Programa de referidos construido en producto**: código/link desde el panel, meses bonificados "cuando el complejo invitado ya muestra onboarding y uso real del sistema". **Calculadora de ROI** ("Calculá cuánto podrías ganar": canchas, precio por turno, horario, ocupación). Módulos: reservas sin cuenta (verificación por email), cobro MP, **Falta Uno**, Competiciones, Escuelitas, Cumpleaños, Cantina/Bar con compras a proveedores y caja por turno, Tienda online, Socios, Tarjetas digitales gratis, **Para Profesores**, app Android, reseñas de complejos, notificaciones push, "Publicación automática en redes sociales". SEO programático por deporte/ciudad. QR de AFIP en el footer (contribuyente registrado). Teléfonos con código de área de CABA. 842 seguidores IG. Tamaño de cartera `UNKNOWN`.
- **EasyCancha**: sin precio público para clubes; "700+ clubs"; nuevo H1 beta *"Turn your club into a business that works 24/7"*; torneos con cuadros y resultados en vivo; PRIME (membresía paga del jugador); ~30 empleados, rentable, 17,8K IG.
- **Don Potrero**: Amateur gratis / Pro sin precio; tres H1 distintos ("Jugá al fútbol con amigos…", "Sistema de gestión de turnos…", "Jugá fútbol, escribí tu historia"); nuevos eslóganes *"Tu club, digital y creciendo"* y *"¡Que no se caiga el turno!"*; login solo Facebook; FAQ dice que el pago online "está en desarrollo" mientras la página de gestión lo vende; eventos corporativos como ángulo nuevo.
- **Korus**: H1 **"Tu complejo deportivo siempre lleno."** Gratis ≤2 canchas / Pro sin precio / Enterprise; nuevo: trial 30 días sin tarjeta para Pro, *"Configurá tu cancha en 20 minutos"*, lista de espera automática, QR imprimible, Excel, PCI, "abonados/turnos recurrentes"; 10 deportes; **sin redes ni prensa rastreables**.
- **JuegaFácil**: Starter **$80.000** (≤2 canchas) / Pro **$120.000** (≤8), trial 14 días, sin cambios; bot de WhatsApp + OCR de comprobantes (probablemente transferencia, MP no se menciona); multi-deporte; sin redes; código de área patagónico.
- **MisCanchas**: sin precio; mismas cifras autoreportadas que julio (15K reservas/mes, 98%, +35%); sin fundadores ni redes localizables.
- **Canchero**: "Donde nace el partido."; 15 ciudades declaradas; **Instagram oficial: 16 seguidores y bio "Próximamente"**; `canchero.ar` no resuelve. Pre-tracción.
- **Turnito**: $0 / $24.500 / $42.000 (genérica, ARS); 8.116 seguidores IG verificada (la mayor del relevamiento); su blog comparativo "mejores apps de reservas para clubes 2026" (23-feb-2026) está vivo y **rankea**, nombra ATC ($48.500 en feb), EasyCancha, OnDepor, Dónde Juego, no a TurnoGol.
- **Nuevos con evidencia**: **Turno Libre** (turnolibre.ar, híbrido, trial 14 días, sin precio, "Encuentra tu cancha en segundos"), **CanchaYa** (canchaya.ar, **$40.000/mes**, -20% anual, "Reservá tu cancha en segundos", presencia declarada en Saladillo, Tapalqué, Carmen de Areco, Salta, Rawson, Reconquista, Río Gallegos: **el único que apunta a ciudades chicas**), **CanchaLibre** (canchalibre.site, **$35.000/mes** tras mes gratis, CABA, "Tu club digital, sin complicaciones"), **hayPartido** (haypartido.com.ar, marketplace de doble cara, CABA + GBA), **Reva** (marketplace con torneos, AR/CL/BO/PE), **Clubin** (clubinarg.com, clubes con socios; gratis ≤80 socios, $50k/$80k/$120k por socios; sirve "para complejos de canchas sin socios"). Evidencia débil: Dispo (pádel), Cluby Smart, CanchaZone, Clubify (socios), TurnosEnLinea, TuCancha. **Sin rastro**: fintechs verticales, cadenas con software propio, Boofi, PlayWith.

---

## 2. Tabla comparativa

### 2.1 Precio mensual por tamaño de complejo (ARS, sept-2026)

| Competidor | 1 cancha | 3 canchas | 4 canchas | 6 canchas | 8 canchas | Trial | Verificación |
|---|---|---|---|---|---|---|---|
| **CanchaFija** | $10.000 | **$18.000** | $25.000 | **$25.000** | $50.000 | 1 mes | `FACT-AR` |
| **Korus** | gratis | Pro s/precio | Pro s/precio | Pro s/precio | Pro s/precio | 30 d Pro | `FACT` |
| **Turnito** (genérica) | $0-$42.000 | ídem | ídem | ídem | ídem | free tier | `FACT` |
| **CanchaLibre** | $35.000 | $35.000 | $35.000 | $35.000 | $35.000 | 1 mes | `FACT` |
| **CanchaYa** | $40.000 | $40.000 | $40.000 | $40.000 | $40.000 | s/d | `FACT` |
| **TurnoGol** (hipótesis) | $63.000 | **$63.000** | $99.000 | **$99.000** | $129.000 | 30 d | — |
| **ATC** | $71.000 | **$71.000** | $111.000 | **$111.000** | $145.000 | 1 mes + comercial | `FACT-AR` |
| **Clubo** | $25.000 | **$75.000** | $100.000 | **$150.000** | $200.000 | 1 mes | `FACT-AR` |
| **JuegaFácil** | $80.000 | $120.000 | $120.000 | $120.000 | $120.000 | 14 d | `FACT` |
| Dónde Juego · EasyCancha · Don Potrero Pro · MisCanchas · Canchero · Turno Libre · hayPartido | sin precio público | | | | | | `UNKNOWN` |

`INFERENCE`: TurnoGol queda **11% debajo de ATC y de Clubo a partir de 3 canchas**, pero **2,5× a 3,5× arriba del clúster local low-cost** (CanchaFija, CanchaLibre, CanchaYa) y contra **tres free tiers** (Korus ≤2 canchas, Don Potrero, Clubin). El piso Predio (1 cancha = $63.000) es el punto más expuesto: ahí CanchaFija cobra $10.000, Korus $0 y Clubo $25.000.

### 2.2 Features (✅ tiene · ⚠️ parcial/claim · ❌ no · ? desconocido)

| | ATC | Dónde Juego | Clubo | CanchaFija | Korus | JuegaFácil | Don Potrero | EasyCancha | TurnoGol |
|---|---|---|---|---|---|---|---|---|---|
| Reserva por link sin app | ✅ | ⚠️ (app-first, web también) | ✅ sin login | ✅ sin cuenta | ✅ | ✅ WhatsApp | ✅ | ⚠️ | ✅ magic link |
| Seña MP | ✅ tarjeta en garantía | ⚠️ "pago anticipado", MP no nombrado | ✅ | ✅ | ✅ Pro | ⚠️ OCR transferencia | ⚠️ contradicción | ✅ | ✅ directo al MP del complejo |
| Política no-show publicada | ❌ (reputación) | ⚠️ sanción manual + alerta | ❌ (claim 90%) | ❌ | ❌ (claim 40%) | ❌ | ❌ | ❌ | ✅ regla pública (2ª/90 d → 14 d) |
| Caja | ✅ caja+stock | ✅ caja+stock | ✅ cantina+arqueo+QR | ✅ cantina+compras+caja por turno | ⚠️ historial pagos | ✅ caja | ⚠️ ingresos | ⚠️ reportes | ✅ caja+cantina+gastos+deudas |
| Gastos | ❌ | ? | ? | ⚠️ compras a proveedores | ❌ | ? | ❌ | ❌ | ✅ |
| Fijos/abonados | ✅ manual | ? | ? | ? | ✅ | ? | ❌ | ❌ | ✅ manual |
| Roles empleados | ✅ multi-admin | ✅ colaboradores+permisos+audit | ? | ? | ? | ? | ✅ admins ilimitados | ? | ✅ admin/manager+audit |
| Torneos | ✅ | ? | ? | ✅ + ranking | ❌ | ❌ | ❌ | ✅ en vivo | ⚠️ flag off |
| Lado jugador (app/perfil) | ✅ app, reputación, ELO, partidos | ✅ app, convocatoria | ❌ | ⚠️ app Android, historial | ⚠️ historial, goles | ❌ | ❌ | ✅ app, PRIME | ⚠️ portal, favoritos, reseñas |
| Falta Uno / convocatoria | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ seguidores | ⚠️ | ❌ vetado |
| Directorio/marketplace | ✅ | ✅ | ❌ | ✅ SEO | ❌ | ❌ | ✅ | ✅ | ⚠️ `/explorar` |
| Profesores/escuelitas | ⚠️ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ |
| Referidos en producto | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (hipótesis) |
| Calculadora ROI | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (del clavo) |
| Día operativo (cierre post-medianoche) | ? | ? | ? | ? | ? | ? | ? | ? | ✅ (nadie lo menciona) |
| Video | ✅ Beelup | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (Cam = idea) |
| Self-service real | ❌ comercial | ❌ ventas | ❌ WhatsApp | ✅ /registro | ✅ | ? | ✅ | ? | ✅ |
| Fútbol-only | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |

---

## 3. Patrones comunes

1. **Una sola promesa domina el mercado: ocupación.** "Tu cancha, siempre llena" (Dónde Juego, Korus, JuegaFácil, **y el H1 de `/para-complejos` de TurnoGol**), "Reservá tu cancha en segundos/al instante" (ATC H1, CanchaYa, Turno Libre, **y el H1 de la home de TurnoGol es letra por letra el de ATC**). `FACT`.
2. **"#1 en Argentina/LATAM" lo dicen cuatro**: ATC, Dónde Juego, Turnito, AgendaPro. El claim está quemado.
3. **Trial universal**: 1 mes / 30 días sin tarjeta (ATC, Clubo, CanchaFija, Korus, CanchaLibre, TurnoGol) o 14 días (JuegaFácil, Turno Libre). Ya no es oferta, es requisito.
4. **Anual -20% universal** (ATC, Clubo, CanchaYa, TurnoGol). ATC ancla con el precio anual como "desde".
5. **Value metric universal: la cancha** (tiers por rango o precio por cancha). Nadie cobra por reserva excepto Turnito en su free tier (5%).
6. **Porcentajes autoreportados sin caso nombrado**: Clubo 80%/90%, Korus 40%, JuegaFácil +37%, MisCanchas 35%/98%, ReservaSimple 80%. Solo Clubo tiene un testimonial con nombre de pila y solo CanchaLibre nombra encargados.
7. **CTA a WhatsApp, no a registro**: ATC, Dónde Juego, Clubo, Korus, MisCanchas, Turno Libre. La venta 1:1 por WhatsApp es la norma, no la excepción de TurnoGol.
8. **Multi-deporte por defecto** porque el pádel explotó: hasta JuegaFácil, con branding de fútbol, lista pádel. El fútbol-only es una elección que **nadie más con tracción tomó**.
9. **Falta Uno / convocatoria abierta es table stakes en los híbridos** (ATC, Dónde Juego, CanchaFija, hayPartido, Don Potrero). TurnoGol lo eliminó del schema (migr. 028).
10. **Segmento "profesores/escuelitas" emergente** (Dónde Juego y CanchaFija lo lanzaron en paralelo): un segundo cliente pagador o un vector de demanda que TurnoGol no tiene ni en visión.
11. **Cantina/caja dejó de ser diferencial**: Dónde Juego, Clubo, CanchaFija, ATC, JuegaFácil la tienen; Clubo pauta *"primera plataforma en integrar cantina"*.
12. **Nadie le habla al encargado**, nadie publica su política de no-show como regla, nadie dice "la plata va directo a tu MP" salvo un snippet de CanchaFija ("se acredita en tu cuenta") y ATC ("sin comisiones"). Los tres huecos de julio siguen, más angostos.
13. **Inflación como fricción**: ATC subió 46% en 7 meses; Clubo y CanchaFija ponen "Precio para Argentina"/"precios en pesos argentinos" como argumento.

---

## 4. Whitespace potencial (`INFERENCE`, con la evidencia que lo sostiene)

| Hueco | Evidencia | Qué tan defendible |
|---|---|---|
| **Luján / Mercedes / Pilar sin cobertura de marketplace** | ATC (buscador propio): Luján cargada como ubicación, **0 resultados**. hayPartido: "0 LUGARES · LUJAN", "0 · MERCEDES", "0 · PILAR". Moreno: 7 complejos en hayPartido. Gral. Rodríguez: 2 | Geográfico, temporal. CanchaYa ya apunta a pueblos (Saladillo, Carmen de Areco) y Clubo pauta en toda la provincia desde el 19/8 |
| **"El complejo funciona sin que estés encima" (control/ausencia del dueño)** | Nadie lo dice como promesa central. **Clubo se está acercando** desde el 9-ago: "ser ordenado", "Tu predio en orden" | Medio: Clubo tiene más pauta; la palabra "orden" ya tiene dueño en ads |
| **Regla de no-show pública y mecánica** ("2ª ausencia en 90 días = 14 días sin reservar", seña como compromiso, no como cobro total) | Todos prometen "menos ausencias" con %; nadie publica la regla; Dónde Juego sanciona a mano | Alto en mensaje, pero **el insight de campo del founder (rechazo cultural a exigir pago por MP) lo tensiona** |
| **Seña como "la parte de un jugador"** (monto bajo, opcional, encuadre de compromiso) | Nadie lo comunica así; el mercado vende "cobro anticipado" (Dónde Juego), "seña" (Clubo, Korus), "tarjeta en garantía" (ATC) | Alto y barato de probar |
| **Día operativo para complejos que cierran a las 2 am** | Ningún sitio lo menciona | Real pero invisible: diferencial de demo, no de landing |
| **Hablarle al encargado** (Rodrigo) | Cero competidores | Alto; vacío total |
| **Caso real auditable con números y nombre** | Cero en toda la categoría (Clubo tiene un testimonial, CanchaLibre nombres sin verificar) | El más valioso y el único que TurnoGol puede fabricar solo con el piloto |
| **Gastos + "Plata en la calle" (deudas) + cierre con día operativo** | Solo CanchaFija roza gastos ("compras a proveedores"); nadie tiene vista de deudas | Medio: es la tesis B (plata) y hay poco competidor ahí |
| **Fútbol-only** | Solo Don Potrero, sin ejecución | Defendible en categoría, **no validado que el dueño lo valore** y excluye complejos mixtos |

---

## 5. Amenazas para TurnoGol

1. **Clubo en tu provincia, ahora.** Campaña geo por 16 provincias (Buenos Aires incluida) desde el 19-ago, ~30 creatividades, mismo comprador, mismo canal (Meta → WhatsApp), precio simple ($25k/cancha), bot de WhatsApp que TurnoGol descartó (ADR-003), y mensaje migrando a "orden". `FACT` + `INFERENCE`: es el competidor de back-office más activo del trimestre.
2. **CanchaFija como ancla de precio y de features.** $18.000 por 3 canchas con referidos en producto, calculadora, Falta Uno, torneos, cantina, escuelitas, app, SEO. Si un dueño de Luján googlea "software canchas de fútbol", lo encuentra antes que a TurnoGol. Tamaño real `UNKNOWN`, pero el AFIP en el footer y los 7 complejos nombrados indican operación real.
3. **ATC ya construye la capa de identidad del jugador** (reputación, ELO, partidos +50%/mes, Beelup para video, 2M usuarios). El North Star de TurnoGol §4 es, en su lado jugador, el roadmap que ATC está ejecutando con 8 años de ventaja.
4. **Dónde Juego posee jugadores reales** (100K+ instalaciones, 3,27K reseñas) y suma vectores de demanda (convocatoria, profesores). Equipo chico y sitio con roturas: amenaza de distribución a mediano plazo, no de producto hoy.
5. **Free tiers abajo** (Korus ≤2 canchas, Don Potrero, Clubin, Turnito) comprimen el Predio de 1-2 canchas.
6. **Copy propio comoditizado**: los dos H1 de TurnoGol coinciden con los de Dónde Juego/Korus y ATC. En una comparación lado a lado, TurnoGol no se distingue por lo que dice.
7. **Inflación del precio de referencia**: ATC subió 46% en 7 meses; cualquier tabla de comparación envejece en un trimestre.
8. **Profesores/escuelitas** como segmento adyacente que dos competidores abrieron y TurnoGol no contempla.

## 6. Oportunidades

1. **El corredor Luján-Mercedes-Pilar está vacío en las dos plataformas de descubrimiento más grandes** (`FACT` verificado contra buscadores propios). La tesis de "densidad zonal" del red team no tiene competencia instalada hoy; la tiene pautando (Clubo) y apuntando a pueblos (CanchaYa).
2. **Nadie tiene un caso con nombre y números.** El piloto 1 puede producir el único activo de prueba social auditable de la categoría.
3. **El mercado vende ocupación; el dueño que rechaza la seña y pregunta por fijos y cancelaciones (feedback de tus demos) está pidiendo control, no ocupación.** Ese hueco lo está empezando a ocupar Clubo con "orden", pero sin lado jugador ni fijos ni roles visibles.
4. **Self-service real**: ATC, Dónde Juego y Clubo obligan a hablar con ventas. Un dueño que quiere probar solo a las 23:00 tiene a CanchaFija, Korus y TurnoGol.
5. **Mecánica publicada del no-show** y **seña como compromiso chico**: hueco de mensaje sin ocupar, compatible con el insight cultural si el monto es "la parte de uno".
6. **Encargado como audiencia**: cero competencia.
7. **"Plata en la calle" + gastos**: casi nadie mira la plata que falta cobrar.

## 7. Cosas que TurnoGol creía diferenciales y ya no lo son

| Creencia (docs/landing) | Estado real |
|---|---|
| Calculadora del turno colgado (`/precios`, red team O2) | CanchaFija tiene "Calculá cuánto podrías ganar" con más inputs |
| Programa de referidos "2 → 1 mes" (hipótesis del founder) | CanchaFija lo tiene en producto con la misma regla de "uso real validado" |
| Caja + cantina + stock | Dónde Juego, Clubo, CanchaFija, ATC, JuegaFácil. Clubo pauta ser "la primera" |
| Bloqueo al reincidente / sanción | Dónde Juego (manual con alerta), ATC (reputación). Lo único propio es que sea **automático y con regla pública** |
| "Sin app, por link" | Clubo, Korus, CanchaFija, Don Potrero, ATC lo dicen |
| "Precio en pesos / hecho en Argentina" | ATC ya lista en ARS desde Argentina; Clubo, CanchaFija, Korus, MisCanchas, Turno Libre lo dicen |
| "Configurado en 20 minutos" | Korus: "Configurá tu cancha en 20 minutos"; Clubo: 34 min en 4 pasos |
| Usuarios ilimitados | ATC, Don Potrero, Dónde Juego |
| Torneos | ATC, EasyCancha, CanchaFija (+ranking), Reva. En TurnoGol está detrás de un flag apagado |
| "Sale menos que ATC" | Cierto (-11%), pero TurnoGol es de los 4 más caros del mercado local a 3 canchas |
| "Tu complejo, siempre lleno" / "Reservá tu cancha al instante" | Son los H1 de Dónde Juego/Korus/JuegaFácil y de ATC |
| Reseñas públicas del complejo | CanchaFija, ATC, Dónde Juego, EasyCancha |
| SEO local como terreno virgen | Sigue virgen en Luján, pero CanchaFija y Turnito ya rankean en la categoría nacional |

## 8. Cosas que sí parecen diferencial real (con su asterisco)

1. **Fútbol-only declarado con producto vivo** (solo Don Potrero lo comparte, sin ejecución). *Asterisco: no validado que el dueño lo pague; excluye complejos con pádel.*
2. **Día operativo** (23:00→00:00 como `time_end='24:00'`, caja con cutoff): nadie lo menciona. *Asterisco: invisible hasta la demo.*
3. **Regla de no-show automática y publicada** (2ª ausencia/90 días → 14 días) vs sanciones manuales o % vagos. *Asterisco: el rechazo cultural a la seña afecta la puerta de entrada, no el mecanismo.*
4. **Gastos + deudas ("Plata en la calle") + cierre diario con día operativo**: la vista de "cuánto falta cobrar" no aparece en ningún competidor. *Asterisco: CanchaFija tiene compras a proveedores.*
5. **Self-service completo sin hablar con nadie** (registro → wizard → link público): solo CanchaFija y Korus lo igualan; los tres grandes no.
6. **Seña 100% al MP del complejo, sin pool ni comisión, con OAuth propio**: ATC dice "sin comisiones", CanchaFija "se acredita en tu cuenta"; nadie explica el mecanismo. *Asterisco: hueco de comunicación, no de producto.*
7. **Roles con permisos acotados + auditoría + impersonación de soporte**: Dónde Juego tiene colaboradores y registro de operaciones. *Asterisco: paridad con DJ, ventaja sobre el resto.*
8. **Founder a 15 minutos de los primeros 50 clientes** en una zona que ATC y hayPartido devuelven vacía. No es producto: es geografía y tiempo.
9. **Aislamiento multi-tenant verificado (RLS) y 4 circuitos de plata probados**: invisible al comprador; relevante solo como riesgo evitado.

## 9. Implicancias para Dunford (posicionamiento)

1. **La alternativa competitiva real sigue siendo WhatsApp + cuaderno**, pero la "alternativa que el dueño googlea" cambió: en Buenos Aires provincia hoy le aparecen **Clubo (ads desde el 19/8), ATC (marca), CanchaFija (SEO) y el blog de Turnito** (que no lista a TurnoGol). Posicionarse solo contra ATC deja tres flancos abiertos.
2. **Categorías ocupadas**: "software de gestión de complejos" → ATC. "App/plataforma #1 de reservas" → Dónde Juego y ATC. "Orden" → Clubo (en pauta). "Todo en uno barato" → CanchaFija. "Tu cancha siempre llena" → quemada por tres.
3. **Categorías libres**: "sistema de señas" (red team §11) sigue libre pero el insight cultural la pone en duda como puerta de entrada; "el complejo bajo control aunque no estés" (tesis C) está libre en palabras, aunque Clubo la roza; "el sistema del encargado" está totalmente libre; "hecho solo para fútbol" está libre y es la única que ningún competidor con tracción puede copiar sin renunciar al pádel.
4. **La comparación por precio es terreno perdedor en dos direcciones**: contra ATC/Clubo TurnoGol gana 11%, contra el clúster local pierde 2,5-3,5×. Dunford diría: no competir en la tabla, competir en la alternativa (WhatsApp) y en el segmento (fútbol, cierra tarde, 3-6 canchas, Luján).
5. **El lado jugador no puede ser argumento de venta** (ATC 2M usuarios, Dónde Juego 100K+ instalaciones); sí puede serlo el **link propio + página propia** (posición secundaria del red team), que ningún low-cost comunica bien.
6. **Segmento**: el ICP-1 (3-6 canchas, fútbol, cierra tarde, GBA oeste) sigue sin dueño; CanchaYa va a pueblos más chicos, Clubo a "predios" genéricos, CanchaFija a CABA/todo.

## 10. Implicancias para Hormozi / Pricing

1. **Anclas que un dueño puede tener en la cabeza hoy**: ATC $71.000 (la que conoce), **Clubo $25.000 por cancha** (la que ve en Instagram), **CanchaFija $18.000 por 3 canchas** (la que encuentra en Google), Korus gratis (≤2 canchas). TurnoGol $63.000 se percibe **barato vs ATC y caro vs todo lo demás** según qué ancla llegue primero.
2. **El value metric "cancha" es el estándar del mercado** (ATC, Clubo, CanchaFija, Korus, JuegaFácil): no genera fricción por sí mismo. Lo que sí genera fricción es **el piso**: a 1 cancha TurnoGol cobra $63.000 donde el mercado cobra $0-$25.000.
3. **"Lo que te deja un turno, una vez al mes"** (H1 de `/precios`): con turno a $55.000 el Predio es 1,15 turnos; CanchaFija Inicial es 0,33 turnos. El ancla del turno funciona contra ATC y se da vuelta contra CanchaFija.
4. **Trial y garantía**: el mes gratis sin tarjeta es requisito, no oferta (7 competidores). Nadie ofrece garantía posterior al trial ni "si en 48 h no anda, el mes arranca cuando ande" (O1 del red team) — sigue libre. Los 3 meses del piloto están 3× por encima del estándar del mercado.
5. **Anual por defecto**: ATC lo hace ("desde $57.000", mismo truco que el diff de `PlanSelector`), Clubo y CanchaYa lo ofrecen sin destacarlo. ATC además muestra el total anual ($684.000) al lado: la transparencia del total es práctica del líder, no un riesgo.
6. **Precio fundador**: nadie lo usa; CanchaFija usa **referidos como descuento** ("bajá el costo recomendando"). La decisión de no tener founder pricing no te deja fuera de mercado, pero el referido-como-descuento ya existe abajo tuyo.
7. **Inflación**: ATC repricea cada 2-3 meses (+46% feb→sep). Cualquier precio de TurnoGol publicado sin fecha va a quedar viejo; el IVA sigue sin aclararse en ningún competidor, así que la asimetría no es solo de TurnoGol.
8. **Ninguna palanca de monetización secundaria está probada en el mercado local**: solo EasyCancha (PRIME al jugador) y Turnito (comisión en free tier) cobran algo distinto de la cuota. El modelo "cuota fija y nada más" es el estándar.

---

## Anexo: preguntas que quedaron abiertas (agregadas de los 6 investigadores)

- Precio real que Dónde Juego, EasyCancha, Don Potrero, MisCanchas, Korus Pro y Turno Libre le cobran al complejo.
- Cartera real de Clubo y CanchaFija (ciudades, cantidad); si Clubo cobra algo sobre la seña.
- Instalaciones de Google Play de todos salvo Dónde Juego (bloqueo técnico persistente).
- Qué sistema usan hoy los complejos reales de Pilar (Distrito Fútbol, Pilar Fútbol, APM) y de Luján.
- Si "Falta Uno"/convocatoria genera reservas reales en alguno (nadie publica el dato).
- IVA de ATC (dos verificaciones, ninguna lo aclara).

---

# AJUSTES FINALES (2026-09-02, pedidos por el founder antes del Board)

## 11. Pricing normalizado por cantidad de canchas

### 11.1 Precio nominal mensual (ARS) por tamaño de complejo

| Canchas | TurnoGol | ATC | Clubo ($25k×n) | CanchaFija | JuegaFácil | CanchaYa | CanchaLibre | Korus | Turnito |
|---|---|---|---|---|---|---|---|---|---|
| 1 | $63.000 | $71.000 | **$25.000** | **$10.000** | $80.000 | $40.000 | $35.000 | **$0*** | $0-$42.000* |
| 2 | $63.000 | $71.000 | **$50.000** | **$18.000** | $80.000 | $40.000 | $35.000 | **$0*** | ídem |
| 3 | **$63.000** | $71.000 | $75.000 | **$18.000** | $120.000 | $40.000 | $35.000 | Pro s/precio | ídem |
| 4 | **$99.000** | $111.000 | $100.000 | **$25.000** | $120.000 | $40.000 | $35.000 | Pro s/precio | ídem |
| 5 | **$99.000** | $111.000 | $125.000 | **$25.000** | $120.000 | $40.000 | $35.000 | Pro s/precio | ídem |
| 6 | **$99.000** | $111.000 | $150.000 | **$25.000** | $120.000 | $40.000 | $35.000 | Pro s/precio | ídem |
| 7 | $129.000 | $145.000 | $175.000 | **$50.000** | **$120.000** | $40.000 | $35.000 | Pro s/precio | ídem |
| 8 | $129.000 | $145.000 | $200.000 | **$50.000** | **$120.000** | $40.000 | $35.000 | Pro s/precio | ídem |
| 10 | $129.000 | $145.000 | $250.000 | $50.000 | Club a medida | $40.000 | $35.000 | Pro (tope 10) | ídem |

`*` free tiers con límites, ver 11.4. CanchaYa y CanchaLibre: precio plano publicado sin tope de canchas visible (`UNKNOWN` si existe tope). Precios de TurnoGol = hipótesis comercial (§3.5 del Business Map).

### 11.2 Precio por cancha (nominal ÷ canchas)

| Canchas | TurnoGol | ATC | Clubo | CanchaFija | JuegaFácil |
|---|---|---|---|---|---|
| 1 | $63.000 | $71.000 | $25.000 | $10.000 | $80.000 |
| 2 | $31.500 | $35.500 | $25.000 | $9.000 | $40.000 |
| 3 | $21.000 | $23.700 | $25.000 | $6.000 | $40.000 |
| 4 | $24.750 | $27.750 | $25.000 | $6.250 | $30.000 |
| 5 | $19.800 | $22.200 | $25.000 | $5.000 | $24.000 |
| 6 | **$16.500** | $18.500 | $25.000 | $4.200 | $20.000 |
| 7 | $18.400 | $20.700 | $25.000 | $7.100 | $17.100 |
| 8 | $16.100 | $18.100 | $25.000 | $6.250 | $15.000 |
| 10 | **$12.900** | $14.500 | $25.000 | $5.000 | — |

### 11.3 Quién gana en cada tamaño (`FACT` aritmético sobre precios publicados)

| Tamaño | Más barato → más caro | Lectura |
|---|---|---|
| **1 cancha** | Korus $0 · CanchaFija $10k · Clubo $25k · CanchaLibre $35k · CanchaYa $40k · **TurnoGol $63k** · ATC $71k · JuegaFácil $80k | TurnoGol es el **3.º más caro de 8**. Es el tamaño donde peor para. |
| **2 canchas** | Korus $0 · CanchaFija $18k · CanchaLibre · CanchaYa · Clubo $50k · **TurnoGol $63k** · ATC · JuegaFácil | Clubo todavía le gana a TurnoGol. |
| **3 canchas** | CanchaFija $18k · CanchaLibre · CanchaYa · **TurnoGol $63k** · ATC $71k · Clubo $75k · JuegaFácil $120k | **Primer tamaño donde TurnoGol le gana a Clubo** (por $12k) y a ATC (por $8k). |
| **4 canchas** | CanchaFija $25k · CanchaLibre · CanchaYa · **TurnoGol $99k** · Clubo $100k · ATC $111k · JuegaFácil $120k | TurnoGol y Clubo **empatan** ($1k de diferencia). El salto de banda (3→4 = +$36k) casi anula la ventaja. |
| **5 canchas** | CanchaFija · CanchaLibre · CanchaYa · **TurnoGol $99k** · ATC $111k · JuegaFácil $120k · Clubo $125k | TurnoGol claramente por debajo de los tres "caros". |
| **6 canchas** | CanchaFija $25k · … · **TurnoGol $99k** · ATC $111k · JuegaFácil $120k · Clubo $150k | **Mejor posición relativa de TurnoGol**: $16.500/cancha, 34% abajo de Clubo, 11% abajo de ATC. |
| **7-8 canchas** | CanchaFija $50k · … · **JuegaFácil $120k** · **TurnoGol $129k** · ATC $145k · Clubo $175-200k | JuegaFácil Pro (hasta 8) le gana a Estadio por $9k. |
| **10+** | CanchaFija $50k · … · TurnoGol $129k · ATC $145k · Clubo $250k | Clubo se vuelve el más caro del mercado por lejos. |

Conclusiones: (1) **Clubo es barato para 1-2 canchas y caro desde 5**: el cruce está entre 3 y 4. (2) **TurnoGol es 11% más barato que ATC en todos los tamaños** por construcción (mismas bandas). (3) **CanchaFija es de 2,6× a 6,3× más barata que TurnoGol en todos los tamaños**; el clúster CanchaYa/CanchaLibre, 1,6-2,5×. (4) El **piso de $63.000 para 1-2 canchas** es el punto más débil: ahí TurnoGol pierde contra 5 de 7 competidores con precio público y contra dos free tiers. (5) Los **saltos de banda** (3→4: +57%; 6→7: +30%) hacen que el complejo de 4 canchas pague casi lo mismo que en Clubo y que el de 7 pierda contra JuegaFácil. (6) El **mejor precio por cancha de TurnoGol está en 6 y en 10 canchas**; el ICP-1 declarado (3-6) coincide con la zona de mejor economics **solo desde 5**.

### 11.4 Free tiers: qué dan de verdad antes de usar "gratis" como ancla

| Free tier | Límite real | Qué NO incluye | Ancla legítima para |
|---|---|---|---|
| **Korus Gratis** | 1 complejo, ≤2 canchas | Cobro de seña/MP (solo desde Pro), branding, Excel, lista de espera Pro | Complejo de 1-2 canchas que solo quiere agenda. **No** es alternativa para el ICP-1 (3-6). |
| **Don Potrero Amateur** | Sin monto; features Pro (pagos online, admins ilimitados) excluidas | Pago online (la FAQ dice "en desarrollo"), sin caja, sin fijos | Complejo que quiere presencia + comunidad, no gestión. |
| **Turnito Free** | 3 agendas, 100 reservas/mes, **5% de comisión** en pagos | Grilla multi-cancha, caja, abonados, día operativo | Un complejo de 3 canchas con 400 turnos/mes lo supera en la primera semana. |
| **Clubin gratis** | ≤80 socios activos | Es software de cuotas de socios; reservas como módulo secundario | Clubes con padrón, no complejos de alquiler. |
| **Trials** (ATC, Clubo, CanchaFija, Korus Pro, TurnoGol: 1 mes · JuegaFácil, Turno Libre: 14 d) | Tiempo | — | No son "gratis": son la norma. |

`INFERENCE`: para un complejo de 3-6 canchas que quiere cobrar seña y cerrar caja, **ningún free tier del mercado sirve**. El "gratis" real solo compite en 1-2 canchas sin cobro online. El competidor barato relevante para el ICP-1 no es un free tier: es **CanchaFija a $18.000-$25.000 con seña MP incluida**.

### 11.5 Cuatro lentes sobre el mismo precio

| Lente | Qué mide | Dónde está TurnoGol |
|---|---|---|
| **Precio nominal** | El número que el dueño ve | 3.º más caro a 1 cancha; 4.º de 8 a 3-6 canchas; medio de tabla a 7+ |
| **Precio por cancha** | Lo que un dueño de 6 canchas calcula solo | $16.500: mejor que ATC, Clubo y JuegaFácil; 4× CanchaFija |
| **Valor / features incluidas** | Qué hace por ese precio | Paridad con ATC/Dónde Juego/CanchaFija en tabla-stakes (reservas, seña MP, caja, roles, fijos). Superávit: gastos, deudas, día operativo, regla de no-show, self-service. Déficit: sin bot WhatsApp (Clubo, JuegaFácil), sin Falta Uno/directorio con tráfico (ATC, DJ, CanchaFija), sin torneos activos, sin escuelitas/profesores, sin app nativa |
| **Costo de la alternativa** | Contra qué se compara realmente | Ver §12: el status quo no cuesta $0; cuesta tiempo del dueño, mora de fijos, huecos y errores del encargado. **Ningún competidor publica esta cuenta** salvo la calculadora de CanchaFija y la del clavo de TurnoGol, y las dos la hacen solo sobre ocupación |

## 12. El status quo como competidor principal

**WhatsApp + cuaderno/Excel + encargado + hábitos de años.** El 60% del mercado (doc1 §3). El dueño no elige entre TurnoGol, ATC y Clubo: elige entre pagar $63.000-$99.000 por mes **o seguir haciendo lo que hace**. `FACT` de las dos demos: el dueño que rechazó la seña no comparaba con ATC; comparaba con su forma de cobrar.

### 12.1 Cuánto cuesta el status quo (modelo, con la calidad de cada número)

| Costo | Estimación | Calidad | Cómo se captura en el caso cero |
|---|---|---|---|
| **Tiempo del dueño** coordinando por WhatsApp | 2-3 h/día × ~$10.000/h ≈ **$600k-$900k/mes** | `HYPOTHESIS` (doc1 re-escalado; nadie lo midió) | Contar mensajes de "¿tenés cancha?" en una semana; preguntar "¿cuánto vale tu hora?" |
| **Encargado** que hace a mano lo que el sistema ordena | Sueldo **E** = `UNKNOWN`. El founder observó que **ya lo pagan y aun así hay errores** | `FACT` (existe) / `UNKNOWN` (monto) | Sueldo, horas, cuántas personas atienden el mostrador |
| **Turnos colgados** (no-show sin seña) | 2-4/semana × $55.000 ≈ **$440k-$880k/mes** | `HYPOTHESIS` (doc1); un dueño lo tolera como "parte del negocio" | Cuántos la última semana; qué hizo con el hueco |
| **Mora de fijos** | ~$860k "flotando" en un momento dado (15 fijos) | `HYPOTHESIS` (doc1) | Lista de fijos y quién debe cuánto hoy |
| **Errores del encargado** (turno doble, precio mal cobrado, reserva olvidada) | Sin cifra | `UNKNOWN` — el founder lo escuchó como dolor | "¿Cuándo fue la última vez que se pisó un turno?" |
| **Descontrol de caja** | Cierre "a ojo"; el dueño lo declaró FUNDAMENTAL (2026-07) | `FACT` (declaración) / `UNKNOWN` (pérdida) | ¿Cierra caja? ¿Cuadra? ¿Cuánto "falta" por mes? |
| **Pérdidas invisibles** | Huecos de martes 15:00 que nadie vende; precios desactualizados | `HYPOTHESIS` | Ocupación real por franja (lo mide el sistema solo) |
| **Dependencia del dueño** | 10-14 h/día; "si no estoy, no sé qué pasa" | `FACT` (doc3, feedback) | ¿Cuántas horas está en el complejo? ¿Puede irse un finde? |

Suma de lo cuantificable (todo hipótesis): **$1,9M-$2,6M/mes** de costo de oportunidad contra **$63k-$99k** de TurnoGol. Ratio 20-40×. Y sin embargo el dueño no compra: porque el costo del status quo es **invisible, difuso y tolerado**, y el precio de TurnoGol es **visible, mensual y nuevo**. Ese es el problema de venta, no el precio.

### 12.2 Lo que cuesta cambiar (fricciones, en orden de peso `INFERENCE`)

1. **Cambio de hábito propio**: responder con un link en vez de "sí, a las 9 hay". Cada mensaje es una decisión.
2. **Cambio de hábito ajeno**: pedirle al jugador que reserve solo, y quizás que deje seña. **El rechazo cultural a la seña (demo, N=1) es fricción de cambio, no de precio.**
3. **El encargado**: entrenarlo, y que no vuelva al papel cuando el dueño no mira (doc3: causa #1 de fracaso).
4. **Carga inicial**: fijos, precios, horarios. Sin importador. El founder la absorbe en 48 h (oferta piloto), pero el dueño tiene que darle el cuaderno.
5. **Miedo a "tocar algo y romper todo"** (doc3, tech 2,5/5) y a que falle un viernes a la noche.
6. **Miedo a la dependencia**: "¿y si cierran? ¿y mis datos?" (sin export del complejo hoy: §1.17 #10 del Business Map).
7. **Costo psicológico de admitir desorden** frente a alguien mucho más joven que le muestra su caja "a ojo".
8. **Pérdida de flexibilidad**: el cuaderno acepta "el de siempre, después te pago" sin quejarse.

### 12.3 Qué tendría que ser cierto para que pagar sea obvio

- Que el dueño **vea su propio número** (su turno, sus colgados, su mora de fijos) y no el nuestro. Hoy solo lo hace la calculadora, y solo sobre ocupación.
- Que el cambio de hábito sea **uno solo** en la primera semana (ej.: "cargá tus fijos y marcá quién pagó"), no cuatro (link en bio, QR, responder con link, avisar a fijos).
- Que **no dependa del jugador** para dar valor el día 1 (fijos, caja, grilla) y que la reserva online llegue después.
- Que el encargado lo prefiera al papel (más rápido en el pico del viernes), no que lo tolere.
- Que la seña sea **opcional, chica y encuadrada como compromiso** ("la parte de uno"), no como "pagar antes".
- Que haya **un caso con nombre** en la zona.
- Que el precio se lea como **menos que un turno** y que la cuenta la haga él.
- Que exista salida sin castigo: export de datos real y "cancelás cuando quieras".

## 13. Diferencia ≠ beneficio ≠ willingness-to-pay

Regla aplicada a cada supuesto diferencial del §8. Columna 3 y 4 son `HYPOTHESIS` hasta que el piloto diga otra cosa.

| Diferencia (`FACT`) | Beneficio para quién (hipótesis) | Evidencia de WTP | Veredicto pre-Board |
|---|---|---|---|
| **Self-service completo** (ATC, DJ, Clubo obligan a hablar con ventas) | Para el dueño que quiere probar solo a las 23:00; para el founder (escala) | **Ninguna**. Las dos demos fueron presenciales y el piloto entra por relación. GTM 04 y red team O1 dicen que **el concierge ("te lo dejo andando en 48 h") convierte más** en este ICP (tech 2,5/5, "no tengo tiempo") | Diferencia de producto, **no ventaja comercial hoy**. Vale como escalabilidad futura. El Board decide si el ICP lo valora |
| **Fútbol-only** | Para el dueño mono-fútbol (identidad, vocabulario); en contra para el mixto | Ninguna. El único competidor fútbol-only (Don Potrero) no tiene tracción | Es **segmentación**, no beneficio. Sirve para elegir a quién venderle, no como argumento de precio |
| **Día operativo** (cierre 2 am) | Para el dueño que cierra tarde (caja cuadra) y el encargado (no pelea con el sistema a las 00:30) | Ninguna directa; el ICP lo puntúa como criterio | Beneficio real pero **invisible hasta el día 2 de uso**; no vende, retiene |
| **Regla de no-show pública** | Para el dueño harto de colgados; en contra del que no quiere "castigar" clientes | Contradictoria: 1 de 2 demos rechazó el pago anticipado | Beneficio condicional a la tesis A |
| **Gastos + "Plata en la calle"** | Para el dueño que quiere saber cuánto le quedó y quién le debe | Declaración del dueño (caja FUNDAMENTAL) y preguntas espontáneas sobre fijos | Candidato a beneficio real; **WTP no medido** |
| **Seña 100% al MP del complejo** | Para el dueño desconfiado de intermediarios | Ninguna; competidores dicen lo mismo con otras palabras | Requisito de higiene, no diferencial |
| **Roles + auditoría** | Para el dueño que no confía en el encargado | El insight "pagan empleados y hay errores" lo sugiere | Beneficio plausible, paridad con Dónde Juego |
| **Founder a 15 min** | Para el dueño que quiere una cara | Las demos "extremadamente positivas" son la única señal | Es la ventaja más real y **la que no escala** |
| **RLS / 4 circuitos de plata probados** | Para nadie visible | — | Riesgo evitado, no argumento |
| **Calculadora del clavo** | Para el dueño que reconoce colgados | CanchaFija la tiene; nadie mide si convierte | Neutralizada |
| **Referidos (hipótesis)** | Para el dueño que ya está contento | CanchaFija lo tiene construido | Neutralizada como novedad; válida como loop si hay clientes contentos |
