# Anexo de research — Competidores AR/LATAM (informe crudo)

> Producido por agente de investigación (Sonnet) el 2026-07-18, por encargo del red team ([TURNOGOL_MARKETING_RED_TEAM.md](../TURNOGOL_MARKETING_RED_TEAM.md) §5). Se conserva íntegro como evidencia; la síntesis con implicancias vive en el red team doc. Etiquetas del informe: [NO VERIFICADO] / [INFERENCIA] / [AUTOREPORTADO].
>
> **⚠️ FE DE ERRATAS (2026-07-18, posterior al informe) — SECCIÓN 1 (PRICING DE ATC) REFUTADA.** Este informe reporta el pricing de ATC "verificado por fetch directo" EN USD (50/80/100). **El founder lo refutó el mismo día con captura de pantalla de la página de precios de ATC vista desde Argentina: la lista para el comprador argentino está EN PESOS — Base (1-2-3 canchas) $66.000/mes, Estándar (4-5-6) $104.000/mes, Full (7+) $136.000/mes; anual -20% ($53.000/$83.000/$109.000).** Causa más probable: pricing localizado por geografía — el fetch del agente salió de un datacenter no argentino y vio la versión USD (que existe: el propio informe cita "Digitaliza su club desde 40 USD por mes"), pero la lista relevante para vender en Argentina es la ARS de la captura. El resto del informe (estructura de planes 1-3/4-6/7+, trial 30 días, prueba social, quejas, redes) coincide con la captura y sigue vigente. **Regla de método derivada: ningún precio de competidor se considera verificado sin captura tomada desde Argentina** — aplica también a los demás precios de este informe reportados en USD por sitios multi-país (ej. ReservaSimple), que quedan degradados a [NO VERIFICADO DESDE AR]. Corrección completa y consecuencias comerciales: red team doc §5.1, §10, §21.11.

---

**Fecha de investigación/acceso:** 2026-07-18. Metodología: WebSearch + WebFetch directo a sitios oficiales, app stores y prensa. Cada afirmación material lleva fuente y fecha de acceso. Lo no verificable se marca **[NO VERIFICADO]**, **[INFERENCIA]** o **[AUTOREPORTADO]** (dato solo del propio sitio del competidor, sin respaldo externo).

Nota de tipo de cambio usada para conversiones aproximadas: dólar oficial venta $1.500 ARS, Banco Nación (fuente: ambito.com, consultado 2026-07-18). Cualquier conversión USD→ARS en este informe es aproximada y sujeta a volatilidad — está marcada como cálculo propio, no como precio publicado.

## 1. AlquilaTuCancha / ATC Sports — el líder declarado

**Segmento objetivo:** dueños/encargados de complejos multideporte (fútbol, pádel, tenis, básquet, hockey) en 9 países de LATAM, más el jugador amateur que busca cancha.

**Categoría mental que intenta ocupar:** líder de categoría regional, autoproclamado. Cita textual: *"El software de gestión de complejos deportivos Nº 1 en LATAM"* y *"La aplicación de turnos deportivos Nº 1 en LATAM"* (fuente: atcsports.io, consultado 2026-07-18). Son afirmaciones de marketing sin métrica pública que las sostenga en el propio sitio.

**Promesa central (cita textual):** *"⚡ Tu próximo partido, a un link de distancia"*; también *"Automatiza la toma de reservas"* y *"Digitaliza su club desde 40 USD por mes"* (fuente: atcsports.io/ y atcsports.io/sistema-de-gestion-de-clubes, consultado 2026-07-18).

**Modelo de negocio:** dual — marketplace para jugadores (*"Únete a partidos o abre el tuyo, conoce gente y diviértete"*) + SaaS de gestión para complejos. Según Forbes Argentina (26-jun-2023): app gratis para el jugador, cobro al club vía suscripción mensual, más comisión de 2-8% por transacción (fuente: forbesargentina.com/negocios/..., consultado 2026-07-18) — **este dato de comisión es de 2023, no confirmado para 2026**; el propio sitio 2026 dice *"Los precios son fijos y sin comisiones"* (atcsports.io/software-para-clubes-gratis), lo que sugiere que el modelo de comisión pudo discontinuarse — contradicción entre fuente de 2023 y copy actual, señalada explícitamente.

**Precios (VERIFICADO, fetch directo atcsports.io/software-gestion-deportiva, 2026-07-18) — en USD, no en ARS:**

| Plan | Canchas | Mensual | Anual (equiv./mes, -20%) |
|---|---|---|---|
| Base | 1-3 | USD 50 | USD 40 (USD 480/año) |
| Estándar | 4-6 | USD 80 | USD 64 (USD 768/año) |
| Full | 7+ | USD 100 | USD 80 (USD 960/año) |

Convertido aproximadamente a ARS de hoy (cálculo propio, no publicado por ATC): ~$75.000 / $120.000 / $150.000 ARS mensual, o ~$60.000 / $96.000 / $120.000 ARS si se paga anual. Prueba gratis de 30 días, sin tarjeta de crédito.

**Prueba social:** el sitio actual **no publica números** (ni clubes ni usuarios). Los únicos números públicos que encontré son de Forbes Argentina, jun-2023: 200.000+ usuarios registrados, 350+ clubes, 40.000+ reservas en un mes, presencia en 7 países / 70+ ciudades, fundada en 2014 por Sebastián Vekselman, facturación proyectada 2023 "$100+ millones" (moneda no especificada en la fuente), inversores Pico Mónaco (extenista), 500 LatAm, gobierno de Chile/Start-Up Chile (fuente: forbesargentina.com, cronista.com/infotechnology/it-business/881371, consultado 2026-07-18). **Busqué explícitamente rondas de inversión o facturación 2024-2026 y no encontré nada más reciente que jun-2023** — es un dato relevante en sí mismo: no hay comunicado de prensa de crecimiento en 3 años. La cobertura geográfica sí creció: el sitio actual declara 9 países (sumó Colombia y Costa Rica respecto a los 7 de 2023).

**App stores:** Apple App Store Argentina: 4,7/5 sobre 75 reseñas (fuente: apps.apple.com/ar/app/atc-sports-alquila-tu-cancha/id1229433516, consultado 2026-07-18) — **75 reseñas es un número bajo para una base declarada de 200k+ usuarios (2023)**, posible indicio de que la mayoría reserva vía link web compartido por el club, no descubriendo la app en la store [INFERENCIA]. Google Play: intenté acceder dos veces y **no pude obtener el contenido real** (bloqueo de contenido dinámico) — dato de "no encontré" válido en sí mismo.

**Quejas recurrentes [parcialmente verificado — hallado vía agregación de búsqueda, no confirmado por fetch directo a la reseña individual]:** filtro de ubicación roto ("no te deja cambiar de zona/ciudad, si querés pasar de zona sur a CABA no funciona"), soporte solo por bot sin humano disponible, pedido recurrente de poder invitar compañeros/compartir el link de la reserva. No encontré hilos de Reddit específicos sobre ATC pese a buscarlo directamente.

**Redes sociales:** Instagram @alquilatucancha_ (cuenta activa) y una cuenta secundaria/antigua @sportech_atc con ~2.215 seguidores, 2.585 seguidos, solo 3 posts (fuente: búsqueda indexada, consultado 2026-07-18 — **cifra posiblemente desactualizada**, no pude verificarla en vivo por el muro de login de Instagram). TikTok activo en @atcsports.io con hashtags genéricos deportivos (#deporte #futbol #padel #tennis #basketball). No verifiqué volumen de vistas ni cadencia de posteo — solo confirmé existencia de la cuenta.

**Fortalezas:** cobertura geográfica más amplia del rubro (9 países), doble cara marketplace+SaaS le da distribución orgánica de jugadores hacia los clubes, feature de "tarjeta en garantía" para no-shows (cobro a tarjeta guardada, distinto del modelo de seña anticipada).

**Debilidades observables:** pricing dolarizado en un país con control de cambios e inflación (riesgo/fricción para el dueño argentino), sin prueba social cuantitativa vigente en el sitio (2026), sin datos de crecimiento reciente públicos, soporte percibido como despersonalizado (bot).

## 2. Playtomic — no es competidor directo en fútbol

**Segmento objetivo:** jugadores de pádel/tenis (y pickleball) que buscan cancha y rival; clubes de pádel/tenis para gestión de reservas.

**Categoría mental:** comunidad global de pádel — "el Tinder del pádel", posicionado como fenómeno importado de Europa. La Nación (2023) lo cubre explícitamente como *"la app... que es furor en Europa"* (fuente: lanacion.com.ar/revista-lugares/playtomic-..., consultado 2026-07-18), es decir la prensa argentina lo enmarca como novedad extranjera, no como líder local.

**Promesa central (cita textual):** *"Únete a la comunidad y reserva canchas online en una sola app"* (fuente: playtomic.com/es, consultado 2026-07-18).

**Prueba social [AUTOREPORTADO, vía síntesis de búsqueda de sus propias páginas]:** 4 millones de jugadores, 5.500 clubes socios, presencia en 50+ países.

**Fútbol y Argentina:** **no encontré ninguna mención de fútbol como deporte reservable en Playtomic** — toda la documentación de ayuda y producto que hallé gira en torno a pádel/tenis (y pickleball a nivel global). Tampoco encontré cobertura de prensa 2025-2026 específica de Argentina ni cifras de clubes/canchas locales. Conclusión: Playtomic **no es hoy un competidor directo de TurnoGol en fútbol**; es relevante solo como referencia de UX/comunidad en el pádel, deporte con el que muchos complejos de fútbol comparten predio.

**Modelo de precios para clubes:** no encontré página de pricing pública en esta investigación — **marcar explícitamente como no verificado / no encontrado**.

## 3. MisCanchas.com — perfil de bajo perfil público

**Segmento objetivo:** dueños de canchas de fútbol 5, pádel, tenis "y más" en Argentina.

**Categoría mental:** sistema todo-en-uno de gestión deportiva, genérico.

**Promesa central (cita textual):** *"Sistema completo de gestión para canchas deportivas. Reservas online, caja digital, estadísticas en tiempo real y mucho más. Todo en una sola plataforma."* (fuente: miscanchas.com/establecimientos, consultado 2026-07-18).

**País:** Argentina explícitamente — *"La plataforma más completa de Argentina"*, *"🇦🇷 Hecho en Argentina"*, integración Mercado Pago, soporte en español (fuente: miscanchas.com/, consultado 2026-07-18).

**Prueba social [AUTOREPORTADO, sin fuente independiente]:** 500+ establecimientos, 15.000+ reservas mensuales, 98% satisfacción, 40% ahorro de tiempo/costos, 85% menos tiempo de gestión administrativa, +35% aumento de ingresos, 95% tasa de confirmación. Al analizar el propio contenido del sitio, aparecen señales típicas de landing genérica de SaaS (estructura problema/solución estándar, comparativa binaria "sin/con", múltiples CTA idénticos, cifras redondas sin caso de cliente nombrado) — **no encontré ningún artículo de prensa, perfil de fundadores, ni mención en redes que corrobore estas cifras**. Traté de buscar específicamente "quiénes somos"/fundadores y no apareció nada.

**Precios:** no encontrados en el sitio (solo "sin tarjeta de crédito", "sin permanencia obligatoria").

**Conclusión:** posible operación pequeña o muy nueva sin trayectoria de prensa — dato en sí mismo relevante para evaluar qué tan "real"/activo es este competidor.

## 4. EasyCancha — jugador chileno con ambición regional, foco en Argentina no confirmado

**Segmento objetivo:** multideporte (pádel, tenis, fútbol, básquet, squash, racquetball) en 8 países de América.

**Categoría mental:** marketplace deportivo regional; apodado en prensa colombiana como *"el Tinder deportivo"* (fuente: forbes.com.ec/negocios/la-startup-chilena-creo-tinder-deportivo-abre-cancha-ecuador, hallado vía búsqueda, consultado 2026-07-18).

**Promesa central (cita textual):** *"la plataforma de administración deportiva más importante de Latinoamérica"* (fuente: easycancha.com/es-AR/clubes, consultado 2026-07-18).

**Datos más recientes y confiables (fetch directo, artículo del 13-05-2026):** 750 clubes en Latinoamérica, operación en 8 países, 1,6 millones de "atletas activos", 18 millones de partidos jugados, 33 empleados, USD 1,4 millones de capital total levantado, rentable y sin buscar más capital según la co-fundadora Daniela Baytelman (fuente: diarioconcepcion.cl/economia/2026/05/13/easycancha-..., consultado 2026-07-18). **Discrepancia de dato:** este artículo dice fundada en 2017 e incubada por la Universidad de Concepción; otras fuentes indexadas dicen 2016 — no reconciliado.

**Dato clave — este artículo de 2026 no menciona a Argentina ni una sola vez explícitamente**, solo habla en términos regionales/genéricos ("baby fútbol", "futbolito"). El sitio propio (easycancha.com/es-AR) sí lista Argentina entre 11 países y tiene páginas de clubes destacados en Buenos Aires (fútbol 11, pádel, squash) — pero **no encontré ninguna cifra de clubes o usuarios desagregada específicamente para Argentina**; cualquier número de "presencia en Argentina" que aparezca en resúmenes de búsqueda agregados debe tratarse con cautela, ya que mezclan datos globales con búsquedas locales.

**Cifras financieras históricas [NO VERIFICADO / desactualizado, agregado de notas de prensa 2022-2024, no reconciliado con el dato 2026]:** "400 mil reservas mensuales" (cita textual de Baytelman, nota del 22-11-2022, fuente: vitalcomunicaciones.cl/post/easycancha-seis-paises-..., consultado 2026-07-18); en otras notas de ese período se mencionan $2M USD/mes en ventas, $2,5M USD/día movidos, 4,4M de reservas históricas, USD 75M anuales — cifras de distintos años, no presentar como estado actual.

**Precios:** no encontrados públicamente. Modelo: comisión por reserva o monto fijo mensual al club, según síntesis de búsqueda — sin cifra concreta verificada.

## 5. Competidores argentinos "hecho en casa" — el grupo más directamente comparable a TurnoGol

### 5.1 JuegaFácil (juegafacil.com.ar)

**Promesa central:** *"Tu cancha, siempre llena"*. Diferenciador declarado: chatbot de WhatsApp para reservas 24/7 y "validación de pagos por OCR" (fuente: juegafacil.com.ar, consultado 2026-07-18).

**Precios (fetch directo, verbatim de la página):** Starter $80.000/mes (hasta 2 canchas), Pro $120.000/mes (hasta 8 canchas, marcado como "más popular"), Club a medida (multi-complejo). Prueba gratis 14 días, sin tarjeta. **La página usa solo el símbolo "$" sin aclarar ARS/USD explícitamente**, pero el dominio .com.ar, el idioma y el contexto hacen que sea razonable asumir pesos argentinos [INFERENCIA razonable, no confirmación literal].

**Prueba social [AUTOREPORTADO]:** "+37% reservas/mes", sin caso de cliente nombrado ni fuente externa.

**Comparación directa con TurnoGol:** su Starter ($80k/hasta 2 canchas) es más caro que el Predio de TurnoGol ($55k/1-2 canchas); su Pro ($120k/hasta 8 canchas) es más caro que el Estadio de TurnoGol ($115k/6+ canchas) pero cubre menos canchas en el tope. Es el competidor con la propuesta de precio más parecida en orden de magnitud.

### 5.2 Korus (korus.com.ar)

**Promesa central:** *"Tu complejo deportivo siempre lleno. Sin WhatsApp. Sin cuadernos. Sin turnos perdidos."* (fuente: korus.com.ar, consultado 2026-07-18).

**Precios:** Gratis (1 complejo, hasta 2 canchas), Pro (1 complejo, hasta 10 canchas), Enterprise (multi-complejo, a medida) — **sin montos numéricos públicos**, todos los CTA llevan a "hablar con ventas/el equipo".

**Prueba social [AUTOREPORTADO, sin moneda explícita pero contexto 100% argentino]:** "reduce ausencias 40%", "recupera 3 horas/mes de atención", "$600k+ recuperados por mes", pérdida promedio declarada de "$1.500.000/mes" por turnos vacíos (5 turnos/semana perdidos × $40.000-$65.000 cada uno). Explicita cumplimiento de Ley 25.326 (protección de datos argentina) y "Hecho en Argentina, para Argentina" — es el único competidor relevado que menciona la ley de datos, aunque de forma marginal.

### 5.3 Don Potrero (donpotrero.com)

**Promesa central:** gestión de turnos + capa social — *"Desde cualquier lugar, sin apps"*, con "lista de seguidores" que permite a jugadores seguir un complejo para enterarse de turnos libres y ayudar a llenar cancelaciones (fuente: donpotrero.com/gestion-de-turnos-y-reservas-canchas-y-clubes-de-futbol, consultado 2026-07-18).

**Precios:** plan Amateur gratis; Pro pago (mensual/anual, sin monto público).

**Presencia:** Argentina, Uruguay, Costa Rica; anuncia expansión a Brasil, Chile, Colombia, Paraguay, Perú. Sin cifras de usuarios encontradas.

**Diferenciador real:** es el único de todo el relevamiento con una capa social explícita conectando la demanda de "armar partido" con la gestión del complejo — un puente que ningún otro competidor tiende.

### 5.4 Canchero (canchero.ar / canchero.com.ar — mismo producto)

**Promesa central:** *"La libertad de elegir dónde y cuándo jugar"* — marketplace de fútbol 5/7/11 y pádel + software de gestión para dueños, con sección "Tercer Tiempo" de competiciones (fuente: canchero.com.ar, consultado 2026-07-18; canchero.ar mismo dominio no resolvió por DNS al momento de la consulta).

**Presencia:** múltiples ciudades argentinas (Buenos Aires, Córdoba, Rosario, Mendoza). Sin precios ni cifras cuantitativas de usuarios ("la comunidad de jugadores más grande", sin número).

### 5.5 CanchaFija (canchafija.com.ar)

El fetch directo devolvió **403 Forbidden** — toda la información viene de snippets de búsqueda, no de verificación directa de página. Ofrece gestión de reservas, cobro vía Mercado Pago, torneos, escuelitas de fútbol y cumpleaños, más una "Tarjeta Digital" gratuita de presencia online (fuente: resultados de búsqueda sobre canchafija.com.ar, consultado 2026-07-18). Sin precios ni prueba social verificados.

### 5.6 Dónde Juego (dondejuegoapp.com)

**Promesa central:** *"Tu cancha, siempre llena"* — **el mismo eslogan casi textual que usa Korus** — y *"La forma más simple de reservar canchas y de gestionar tu complejo deportivo"* (fuente: dondejuegoapp.com, consultado 2026-07-18). Doble público: jugadores (fútbol 5 y pádel) y dueños.

**Prueba social [AUTOREPORTADO, sin verificación externa]:** +2.000 canchas activas, +900.000 turnos concretados, +250.000 usuarios activos.

**Modelo de negocio:** no explicitado con claridad en el sitio.

### 5.7 Tiki Taka (tikitakasport.app)

En etapa de lanzamiento, primeros complejos en San Juan (fuente: tikitakasport.app, consultado 2026-07-18). Feature diferenciador: grabación automática de partidos vinculada a la reserva. Sin cifras ni precios — el propio sitio lo admite ("estamos en etapa de lanzamiento").

## 6. Herramientas de turnos genéricas

### 6.1 Turnito (turnito.app)
Agenda genérica (no vertical de canchas). **Precios (ARS explícito):** Free $0/mes (hasta 3 calendarios, 100 reservas/mes, 5% comisión en pagos), Advance **$24.500 ARS/mes** (reservas ilimitadas, 100 recordatorios WhatsApp/mes, 1% comisión), Pro **$42.000 ARS/mes** (0% comisión) (fuente: turnito.app, consultado 2026-07-18). Autoreporta 4,8★/126 reseñas Google y "#1 en reservas en Argentina" (autoproclamado). Publica contenido SEO comparándose contra el nicho (post "mejores software de reservas para clubes en Argentina 2026" — 404 al refetchear, queda como snippet). Sin caja diaria, sin abonados, sin grilla multi-cancha nativa.

### 6.2 ReservaSimple (reservasimple.com)
Genérico LatAm (17+ países). Free hasta 30 reservas/mes; Premium **USD 13,99/mes** (fuente: reservasimple.com/app-reservas-canchas-latinoamerica, consultado 2026-07-18). Autoreporta 4.800+ negocios, 4,9★, recordatorios WhatsApp "reducen ausencias 80%".

### 6.3 Reservo (softwarereservo.com)
Chileno, 11 países, foco gimnasios/centros más que canchas. Autoreporta 500+ clientes, USD 30M ventas gestionadas, 1M turnos online (fuente: softwarereservo.com/deporte/, consultado 2026-07-18). Sin precio público (la página /precios no devolvió contenido).

### 6.4 AgendaPro
Multi-vertical con línea "centro deportivo". Evidencia de uso por complejos chilenos de fútbol 7; **ninguna evidencia de adopción en Argentina para fútbol** (fuente: búsqueda sobre agendapro.com, consultado 2026-07-18).

### 6.5 SimplyBook.me
Motor genérico internacional; adopción argentina marginal vía subdominios de clubes chicos (ej. clubdelosballeneros.simplybook.me, consultado 2026-07-18).

### 6.6 Boofi
**No encontrado** (dos búsquedas dirigidas; solo una radio online homónima). Hallazgo negativo explícito.

## 7. Apps de armar partido — sin cruce hacia gestión B2B

- **Falta Uno** (faltauno.com.ar, App Store id6738060775): organizar/encontrar partidos; sin módulo de gestión para complejos (consultado 2026-07-18).
- **Nos Falta Uno** (nosfalta1.com.ar): completar equipos; ~5.000 descargas / 1.600 activos según snippet sin fecha [NO VERIFICADO].
- **Matchat:** cobertura Ámbito 28-03-2019 ("Uber del deporte", Bahía Blanca); **sin señal de actividad posterior a 2019** — probable inactivo.
- **Bafa:** guatemalteco (2008), USD 160/partido; sin foco argentino.

Ninguna pivoteó a gestión B2B. El único puente parcial: Don Potrero (§5.3).

## Tabla comparativa de precios (todo lo verificado)

| Jugador | Precio | Moneda confirmada | Fútbol-only | Fecha |
|---|---|---|---|---|
| ATC (Base/Estándar/Full) | USD 50 / 80 / 100 mensual (USD 40/64/80 anual) | USD explícito | No (multideporte) | 2026-07-18 |
| JuegaFácil (Starter/Pro) | $80.000 / $120.000 por mes | Contexto ARS [INFERENCIA] | Sí | 2026-07-18 |
| Korus | Sin monto público (Free/Pro/Enterprise) | — | No | 2026-07-18 |
| Turnito (Free/Advance/Pro) | $0 / $24.500 / $42.000 | ARS explícito | No (genérica) | 2026-07-18 |
| ReservaSimple (Free/Premium) | $0 / USD 13,99 | USD explícito | No (genérica) | 2026-07-18 |
| Resto (MisCanchas, Don Potrero, Canchero, CanchaFija, Dónde Juego, Tiki Taka, EasyCancha, Playtomic, Reservo, AgendaPro) | Sin precio público | — | Variable | 2026-07-18 |
| **TurnoGol (referencia interna)** | $55.000 / $85.000 / $115.000 + IVA | ARS | Sí, exclusivo | — |

## Mensajes comoditizados de la categoría

1. **"Tu cancha, siempre llena"** — literal en Korus y Dónde Juego, parafraseado por JuegaFácil. El caso más flagrante.
2. **"Sin WhatsApp, sin cuadernos/planillas"** — Korus, JuegaFácil, Don Potrero, ATC, Canchero.
3. **"Reservas 24/7" / "tiempo real"** — universal.
4. **Integración Mercado Pago** — checkbox de todos.
5. **Recordatorios WhatsApp + % de mejora autoreportado** (Korus 40%, ReservaSimple 80%, JuegaFácil +37%, MisCanchas 95%) — ninguno con caso nombrado.
6. **"Probalo gratis sin tarjeta"** — ATC, MisCanchas, JuegaFácil, Korus.
7. **"Hecho en Argentina"** — Korus, MisCanchas.
8. **"Todo en una sola plataforma"** — universal.
9. **Multideporte por defecto** — ATC, EasyCancha, MisCanchas, Korus, Canchero, Dónde Juego.
10. **Dashboards "en tiempo real"** — universal.

## Huecos de posicionamiento observados

1. **Exclusividad de fútbol** — nadie relevado es mono-vertical fútbol explícito; TurnoGol sería el único.
2. **Riesgo cambiario** — ATC cobra en USD; nadie (ni los locales en ARS) explota "precio fijo en pesos, no atado al dólar".
3. **Transparencia del destino de la seña** — nadie explica si la plata va directo al MP del complejo o queda pooleada por la plataforma.
4. **Política de no-show pública** — todos dicen "reducí ausencias" en abstracto; nadie publica la regla real (seña capturada, bloqueo, etc.).
5. **Precio por jugador al reservar** — nadie lo comunica (TurnoGol lo acaba de shippear).
6. **Mensaje al encargado/manager** — todos le hablan solo al dueño.
7. **Ley 25.326 como argumento** — solo Korus, marginal.
8. **Puente social→gestión** — solo Don Potrero lo insinúa.
9. **Prueba social auditable** — el campo entero publica % autoreportados sin nombre; el caso real con nombre y captura es terreno sin ocupar.

## Notas metodológicas y límites

- **Sin resultados:** Boofi; pricing Playtomic clubes; fundadores/prensa MisCanchas; inversión/facturación ATC post jun-2023; hilos Reddit de estas plataformas; reviews Google Play de ATC (bloqueo técnico; se usó App Store como proxy).
- **Fetches bloqueados:** canchafija.com.ar (403), agendatucancha.com (SSL), post comparativo de turnito.app (404 al refetchear).
- **Autoreportado sin auditoría:** la mayoría de los % de mejora del rubro.
- **Discrepancias señaladas sin reconciliar:** fundación EasyCancha (2016/2017); comisión ATC (2-8% Forbes 2023 vs "sin comisiones" copy 2026); cifras EasyCancha 2022-2024 vs 2026.
