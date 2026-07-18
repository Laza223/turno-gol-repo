# TURNOGOL — MARKETING RED TEAM

> Auditoría adversarial del plan de marketing (en particular [11-contenido-viral-ig.md](./11-contenido-viral-ig.md)) y reconstrucción completa de la estrategia de adquisición. Fecha: 2026-07-18/19. Mandato del founder: desarmar premisas, rescatar solo lo comercialmente real, sin moralismo y sin inventos.
>
> **Convención de etiquetas usada en todo el doc:**
> - `HECHO` — verificado en código, docs del repo, o fuente externa citada con URL+fecha.
> - `INFERENCIA` — deducción razonable de hechos; puede estar mal, se dice de qué hechos sale.
> - `HIPÓTESIS` — creencia a validar con dueños reales o con un experimento definido acá.
> - `NO PUBLICABLE` — no se puede decir en marketing hasta obtener la evidencia indicada.

---

## 1. Veredicto ejecutivo

**El plan de llenar Instagram con reels IA no va a vender TurnoGol en su estado actual, y la razón no es la calidad de los guiones: es que ataca el eslabón equivocado de la cadena.** Hoy (2026-07-18):

- `HECHO` — **turnogol.app no resuelve DNS** (`ENOTFOUND`, verificado 2026-07-18). El link que TODOS los guiones, scripts de venta y la oferta piloto prometen (`turnogol.app/[slug]`) no existe públicamente.
- `HECHO` — El deploy de producción (2026-07-18, primer deploy verde) está **detrás de Vercel Authentication**: un dueño con el link en la mano ve una pantalla de login de Vercel.
- `HECHO` — Credenciales productivas de MercadoPago pendientes de rotar (registro interno del ensayo general). Nadie puede pagar una seña real hoy.
- `HECHO` — Cero complejos activos, cero reservas reales, cero prospectos registrados (`docs/gtm/data/` no existe), cero casos.
- `HECHO` — El propio diagnóstico del repo ([01-diagnostico.md](./01-diagnostico.md)) puntúa **Distribución 1/10** y lista "esconderse detrás del contenido/ads" como error mortal #3. El doc 11 es, estructuralmente, ese error con mejores guiones.

**Lo que SÍ sobrevive del doc 11:** ~la mitad de las piezas — pero con otro rol. No son un motor de demanda ("publicar → viralizar → dueños comentan YO"); son (a) **munición reenviable 1:1** dentro del outbound que los docs 01-08 ya diseñaron, (b) **sala de exhibición**: el perfil de IG que el dueño stalkea DESPUÉS de que lo contactaste y ANTES de responderte, y (c) futuros **creativos de ads geo-segmentados**, el único mecanismo por el cual un video puede llegar con certeza a un dueño de Luján (la segmentación orgánica de IG no existe; la paga sí).

**La estrategia reconstruida en una frase:** outbound presencial + WhatsApp sobre una lista scoreada de 100 complejos del corredor Luján-oeste, con la oferta piloto de doc4, un perfil de IG de 12 piezas evergreen como respaldo de legitimidad, $0 en ads y $0 en herramientas de avatares hasta tener **una reserva online real de un desconocido en un complejo real** — el único hito que convierte todo el marketing posterior de humo en prueba.

---

## 2. Qué estaba mal en el planteo original

Cinco errores estructurales, en orden de gravedad. Ninguno se arregla con mejores hooks.

### 2.1 Error de distribución: confundir "publicar" con "alcanzar"
El doc 11 asume: reels → el algoritmo los reparte → dueños de complejos los ven → comentan YO. La cadena se rompe en el paso 2:
- `HECHO` — Instagram no permite segmentar geográficamente el alcance orgánico; el algoritmo reparte por afinidad de contenido e historial de la cuenta (ver §5.6, fuentes).
- `INFERENCIA` (de tamaño de mercado, doc1 + scraper pendiente) — la audiencia total "dueños/encargados de complejos de fútbol en Argentina con IG activo" es del orden de miles de personas en todo el país; en el corredor Luján-oeste, decenas. Un reel de una cuenta con 0 seguidores que "pega" va a acumular vistas de jugadores y curiosos de cualquier provincia — métrica de vanidad, cero pipeline.
- La consecuencia perversa: el contenido genera *sensación* de progreso (vistas, likes de jugadores) mientras el pipeline real sigue en cero. Es exactamente el patrón que doc1 llama error mortal #3.
- `HECHO` (research §5.B.5) — el precedente del propio nicho lo confirma: el fundador de ATC —el líder que TurnoGol quiere destronar— creció al principio con **llamado en frío puerta a puerta**, no con redes (Forbes AR 2023); AgendaPro, con referidos y boca a boca (Bloomberg Línea 2022). Ningún SaaS vertical hispanohablante investigado (~30) tiene evidencia de haber crecido con contenido en etapa temprana.

**Quién SÍ va a mirar ese perfil:** el dueño al que le escribiste por WhatsApp esa mañana. `HIPÓTESIS` (a medir en E4, §17): la mayoría de los dueños contactados revisan el IG de TurnoGol antes de responder. Para ESE visitante, 12 piezas buenas y fijadas valen igual que 180 piezas diarias — y cuestan 15 veces menos.

### 2.2 Error de secuencia: marketing de un producto al que no se puede entrar
Publicar "reservá por el link" cuando el dominio no resuelve DNS y prod tiene muro de login es invitar gente a un local sin puerta. Cualquier peso/hora invertido en contenido antes de cerrar los 4 prerequisitos técnicos (§18, Semana 0) tiene retorno cero o negativo (el dueño curioso que googlea TurnoGol hoy y no encuentra nada, queda inoculado: "otro humo").

### 2.3 Error de canal en el CTA: "comentá YO" + ManyChat
- El dueño argentino de 40-60 vive en WhatsApp; el DM de IG es territorio de sus hijos. El propio doc6 §2 ya lo sabía: *"Objetivo del DM: sacar la conversación a WhatsApp. IG entierra los DMs de cuentas que no te siguen."* El doc 11 contradijo la doctrina propia.
- ManyChat + respuesta automática + "comentá YO" es la estética de infoproducto/dropshipping — el patrón exacto contra el que el dueño escéptico ya tiene anticuerpos. Para 3 consultas por semana (escenario realista de arranque), un humano respondiendo en 10 minutos convierte más que cualquier automatización, y no huele a bot.
- Comparación formal de CTAs en §16.0.

### 2.4 Error de prioridad de gasto: HeyGen/Higgsfield antes que validación
`HECHO` (input del founder, 2026-07-18) — presupuesto real ~$150.000 ARS/mes, con intención declarada de gastar parte en herramientas de avatares. HeyGen Creator + Higgsfield consumen ~40-60% de ese presupuesto en producir *variantes de un mensaje que todavía nadie validó*. Las 3 piezas que la fase actual necesita (§15) se graban con un celular y screen-records en una tarde, con $0. El presupuesto entero se reserva para el primer experimento que compra certeza: ads click-to-WhatsApp geo-segmentados, DESPUÉS de calibrar el pitch en 20 conversaciones reales (§17, E3).

### 2.5 Error de tono: hype de lanzamiento sin una sola prueba
"La app del momento", "llegó a Argentina", "entran de a 10 por mes" — con cero clientes, cero reviews y un dominio que no carga, ese tono no genera FOMO: genera el pattern-match con el vendedor de humo que a cada dueño ya le tocó la puerta. La marca correcta para esta fase no es "la app de moda": es **"el pibe de Luján que te deja el sistema andando él mismo"** — que además es literalmente el diferencial de la oferta (doc4) y es imposible de copiar para ATC. El hype se gana con el primer caso real; se compra con densidad local, no con épica generada por IA.

> Nota de crédito: el doc 11 hizo bien tres cosas que esta reconstrucción conserva — la disciplina de claims (tabla VERDE/ROJO, ninguna métrica inventada), la voz rioplatense de mostrador, y varios guiones de demostración genuinamente buenos (ver §8). El problema nunca fue la ética ni la artesanía: fue la estrategia de distribución y la secuencia.

---

## 3. Inventario de evidencia

Todo lo que existe como evidencia comercial al 2026-07-18. La honestidad de esta tabla es la base de todo lo demás.

| Evidencia | Estado | Detalle | Etiqueta |
|---|---|---|---|
| Complejos entrevistados formalmente | **0** | No hay registro de charlas de dolor estructuradas (doc6 §4 nunca ejecutado) | HECHO |
| Charlas informales | **≥1-3** (N impreciso) | Founder relata (2026-07-18): reacción "es una locura, gestiona todo el complejo"; "no entienden mucho la app porque tiene muchas cosas"; lo que más interesó: control de reservas del día/semana, reserva automática, y "si se hace famosa les va a traer clientes" | HECHO (que lo dijeron) / señal débil: N chico, sin registro, sesgo de cortesía |
| Prospectos en CRM | **0** | `docs/gtm/data/` no existe; Google Sheet no armado | HECHO |
| Capacidad de armar lista | **Alta** | Founder tiene scraper de Google Maps (teléfonos/WhatsApp de complejos) — lista de 100+ scoreable en días | HECHO (declarado) |
| Usuarios de prueba / pilotos | **0** | — | HECHO |
| Reservas procesadas reales | **0** | Solo tests E2E y staging con MP mock (que además escribe montos de $0,01 — gotcha conocido) | HECHO |
| Pagos reales de señas | **0** | Credenciales MP productivas sin rotar | HECHO |
| Métricas de uso | **0** | — | HECHO |
| Screenshots utilizables | **Sí, de demo** | El producto real con datos de demo — utilizables SIEMPRE etiquetados como demo, nunca como "cliente" | HECHO |
| Feedback estructurado | **0** | — | HECHO |
| Conversaciones comerciales activas | **0** | — | HECHO |
| Pricing definido | **Sí** | $55.000 / $85.000 / $115.000 ARS/mes + IVA, anual -20% (`plans-data.ts`, migr. 043) | HECHO |
| Precio fundador | **Sin decidir** | REQUIERE INPUT abierto desde doc4 | HECHO |
| Zona | **Decidida** | Luján (BA) + corredor oeste: Rodríguez, Moreno, Pilar, Mercedes (founder, 2026-07-18) | HECHO |
| Presupuesto | **~$150.000 ARS/mes** | Declarado por founder, de ingresos personales | HECHO |

**Lectura de las charlas informales (lo poco que hay, exprimido con cuidado):**
1. *"No entienden mucho la app porque tiene muchas cosas"* — la señal más valiosa del lote. Confirma que la venta NO puede ser self-service ni "mirá todo lo que hace": la demo debe ser guiada, de UN dolor, con SUS canchas (exactamente lo que doc6 §5 ya prescribe: "Solo UNO. No hacer el tour completo"). También degrada cualquier contenido que liste features.
2. *Lo que más interesó: control de reservas + "se reserva solo"* — tensiona la hipótesis seña-first de doc3. Con N=1-3 y sesgo de cortesía NO alcanza para reordenar los pilares; alcanza para exigir el test A/B de gancho en las primeras 20 conversaciones discovery (E1, §17) en vez de asumir.
3. *"Si se hace famosa les va a traer clientes"* — los dueños compran solos la fantasía del marketplace. Es la promesa PROHIBIDA #1 (doc10) y la trampa de churn más peligrosa (compran por tráfico que no va a llegar, se van a los 60 días). La versión honesta y potente de esa pulsión: **"tu complejo con página propia que aparece en Google"** (portal público + SEO local — feature real). Se canaliza, no se alimenta.

---

## 4. Estado real del producto

Fuente: verificación de julio 2026 registrada en [10-playbook-ia.md](./10-playbook-ia.md) (lista "SE PUEDE PROMETER", contrastada contra código), docs internos y memoria de sesiones. No se re-audita el código acá; se audita qué puede sostener el marketing.

### 4.1 Terminado y verificado (`HECHO` — se puede vender y demostrar en vivo)
- Reserva online por link web (`turnogol.app/[slug]`) sin app para el jugador.
- Seña por MercadoPago **a la cuenta MP del complejo** (OAuth), % configurable, apagable; turno se libera solo si no se paga en minutos.
- Ausencia: seña queda capturada + 2da ausencia en 90 días → bloqueo automático de reservas online 14 días (sin deuda de dinero — modelo revertido 2026-07-11).
- Grilla tiempo real mobile-first; push al admin por reserva (silencio 00-08, avisa 8am); email de confirmación al jugador.
- Turnos fijos (abonados) con generación semanal automática y control de pago por sesión (registro manual).
- Caja completa: ingresos, gastos, cantina con stock, cierre diario; día operativo para cierres de madrugada.
- Módulo Jugadores (ficha, historial, indicador de bloqueo); métricas de ocupación/caja.
- Onboarding self-service ~20 min; trial 30 días sin tarjeta; exportación de datos; staff ilimitado.

### 4.2 Parcial / con asteriscos
- MFA de super-admin: columnas en schema, **no enforced** en guards (irrelevante para venta, relevante para seguridad interna).
- E2E: suites verdes en CI reciente, pero con historial de flakiness local; el "ensayo general" quedó verde SIN los pasos de credenciales productivas.
- Portal público: existe y funciona; **capacidad SEO local real todavía no demostrada** (ningún portal indexado aún — no hay tenants).

### 4.3 Simulado (solo en test/staging)
- Todo el flujo de pagos fuera de prod usa MP mock (`MP_MOCK_MODE`), que escribe montos de $0,01 — las capturas de staging NO son utilizables como "pagos".

### 4.4 Planeado / fuera de alcance v1 (PROHIBIDO en marketing — lista doc10)
- Avisos por WhatsApp al jugador (v1 = email + push al admin).
- Cobro automático/débito de abonados.
- Marketplace / "te traemos jugadores" (la búsqueda cross-complejo existe como feature, pero sin masa de jugadores no genera demanda — no venderla).
- Importador automático de datos de ATC (la migración la hace el founder a mano — se vende como servicio, no como feature).
- Facturación AFIP, torneos, partidos abiertos, app nativa, recordatorio 24h al jugador.

### 4.5 Gaps operativos que bloquean TODO el marketing (`HECHO`, verificado 2026-07-18)
| # | Gap | Evidencia | Sin esto… |
|---|---|---|---|
| G1 | **DNS de turnogol.app no resuelve** | `ENOTFOUND` en fetch directo, 2026-07-18 | ningún link de ningún mensaje/bio/QR funciona |
| G2 | **Prod detrás de Vercel Authentication** | deploy 2026-07-18 protegido | ni la landing ni el portal son visibles |
| G3 | **Credenciales MP productivas sin rotar/cargar** | registro interno ensayo general | ninguna seña real puede cobrarse |
| G4 | **Smoke test de dinero real nunca corrido** | consecuencia de G3 | la primera seña real de un cliente sería también el primer test — inaceptable |

**Estos 4 gaps son la Semana 0 del plan (§18). Ningún contenido, ad ni visita comercial antes de cerrarlos.** (Una visita comercial se puede hacer con la demo local/staging — pero no se puede DEJAR el piloto andando, que es la oferta.)

---

## 5. Mercado y competidores

> Síntesis del research fechado 2026-07-18. **Informe crudo completo con todas las fuentes y URLs: [research/2026-07-18-competidores.md](./research/2026-07-18-competidores.md).** Hallazgo previo importante: el doc2 interno (teardown ATC) tenía el pricing de ATC en ARS ($60.500 Base) — **desactualizado y en la moneda equivocada**: hoy ATC cobra EN DÓLARES. doc2 necesita actualización (propuesta en §21).

### 5.1 El mapa real (más poblado de lo que los docs internos creían)

**ATC Sports / AlquilaTuCancha — el líder, con grietas:**
- > **⚠️ CORRECCIÓN (2026-07-18, horas después del research) — el red team también se equivoca, y este era el dato más citado del doc.** El agente de research fetcheó atcsports.io desde un datacenter no argentino y reportó pricing EN USD (50/80/100) como "verificado". **El founder lo refutó con captura de pantalla real de la página de precios de ATC vista desde Argentina**: la lista para el comprador argentino está EN PESOS. Causa más probable (`INFERENCIA`): pricing localizado por geografía — la cita "Digitaliza su club desde 40 USD por mes" que el agente trajo sugiere que la versión USD existe para otros mercados, pero **la única lista que importa para vender en Luján es la que ve el dueño argentino, y es esta ↓**. Todas las conclusiones derivadas del "ATC dolarizado" fueron corregidas en este doc (huecos §5.3.4, claim §10, §11.2, riesgos, §22) con marca visible. **Regla de método nueva (vinculante): ningún precio de competidor se considera verificado sin captura tomada DESDE Argentina, fechada — un fetch remoto no alcanza.** El screenshot del founder es la fuente primaria de la fila siguiente.
- `HECHO` (captura del founder + navegación real desde su máquina/IP argentina, 2026-07-19) — Pricing ATC EN PESOS: **Base (1-2-3 canchas) $66.000/mes · Estándar (4-5-6) $104.000/mes · Full (7+) $136.000/mes; anual -20% ($53.000/$83.000/$109.000). "Probar 1 mes gratis."** Ancla de su página: "Automatizá tu complejo desde $53.000 por mes" (usa el anual como "desde"). **IVA: verificado que el sitio NO lo aclara en ninguna parte** — ni en precios, ni en el FAQ (que dice textual *"El único costo de ATC es el abono mensual"*), ni en el formulario de alta. Queda indeterminable sin factura: **cerrar el dato preguntando a un cliente/ex-cliente de ATC en las charlas (segmento S6) qué paga por mes según factura, o consultando al comercial.** Hasta entonces: cero claims de precio.
- `HECHO` (flujo navegado 2026-07-19) — **El "Probar gratis" de ATC NO es self-service**: formulario largo (nombre, teléfono, email, relación con el club, ubicación completa, deportes) que remata en *"nos pondremos en contacto para coordinar una reunión"* + campo "¿Quieres que te contacte un comercial?". "Hablar con ventas" = Calendly de demo. Entre el dueño y su trial hay un comercial y una reunión. **El onboarding self-service de TurnoGol (<20 min, o 48hs hecho por el founder) es un diferencial de fricción REAL y verificado** — sube al pitch. Bonus 1: el placeholder de deportes de su form dice "Padel, Fútbol, Básquet" — pádel primero, el sesgo multi-deporte hasta en el placeholder. Bonus 2: su campo "¿Cómo llegaron a nosotros?" lista **"Por un proveedor: ¿Cuál?"** y "Referido de un club" — el líder trackea el canal proveedor y los referidos como fuentes: validación externa directa de E6 y del motor de referidos.
- `HECHO` (aritmética sobre la captura) — **la comparación real es POR FRANJA, no global, porque los rangos difieren** (ATC corta en 1-3/4-6/7+; TurnoGol en 1-2/3-5/6+): con 1-2 canchas TurnoGol gana ($55k vs $66k, -17%); con **3 canchas ATC gana** ($66k vs $85k — TurnoGol +29% más caro); con 4-5 TurnoGol gana ($85k vs $104k, -18%); con **6 canchas ATC gana** ($104k vs $115k); con 7+ TurnoGol gana ($115k vs $136k, -15%). **Las dos franjas donde TurnoGol pierde (3 y 6 canchas) caen ADENTRO del ICP-1 (3-6 canchas).** Mitigación ya disponible: el precio fundador de doc4 (20-30% off) deja Complejo en $59.500-68.000 — tapa la brecha de la franja de 3 casi exacto. Decisión de boundaries en §21.11.
- `HECHO` — Se autoproclama "el software de gestión de complejos deportivos Nº 1 en LATAM" sin publicar ninguna métrica vigente en el sitio. Los últimos números públicos son de Forbes jun-2023 (350+ clubes, 200k usuarios); **no hay comunicado de crecimiento en 3 años** (buscado explícitamente, no encontrado).
- `HECHO` — App Store AR: 4,7★ con solo 75 reseñas. `INFERENCIA` del informe: la mayoría de los jugadores reservan por el link del club, no descubren la app — o sea, el "marketplace" pesa menos de lo que su marca sugiere.
- Quejas recurrentes [parcialmente verificado]: filtro de ubicación roto, soporte por bot sin humano. Mecanismo de no-show DISTINTO al de TurnoGol: "tarjeta en garantía" (cobro diferido a tarjeta guardada), no seña anticipada a la cuenta del club.
- **Implicancia (corregida):** ATC es real y fuerte, y **la pelea de precio contra ATC NO es la cancha donde jugar**: los precios son parecidos, cada uno gana franjas, y la asimetría de IVA está sin verificar. El flanco real de ATC es de PRODUCTO y TRATO: multi-deporte sin profundidad de fútbol, panel pensado para desktop, soporte percibido como bot, y mecanismo de no-show distinto (tarjeta en garantía ≠ seña anticipada a TU MP). La táctica de doc7 objeción #12 (retirarse si dependen del marketplace de ATC) sigue correcta.

**Los locales que doc2 NO conocía (el hallazgo más importante del research):**
- **JuegaFácil** (juegafacil.com.ar): fútbol, Starter $80.000/mes hasta 2 canchas, Pro $120.000 hasta 8 ("$" sin moneda explícita, contexto ARS). **Más caro que TurnoGol en cada tramo.** Trial 14 días. Diferenciador declarado: chatbot de WhatsApp.
- **Korus** (korus.com.ar): "Tu complejo deportivo siempre lleno. Sin WhatsApp. Sin cuadernos." Plan gratis hasta 2 canchas (⚠️ free tier = presión de precio en el segmento chico), sin precios públicos del Pro. Autoreporta "reduce ausencias 40%" sin caso nombrado.
- **Don Potrero** (donpotrero.com): gestión + capa social ("seguidores" del complejo para llenar cancelaciones — el único que puentea social→gestión). Plan Amateur GRATIS.
- **Dónde Juego, Canchero, CanchaFija, MisCanchas, Tiki Taka**: propuestas similares, prueba social autoreportada sin verificación (MisCanchas: "500+ establecimientos" sin un solo caso nombrado ni rastro de prensa/fundadores), varios sin precios públicos.
- **Genéricas** (Turnito $24.500-42.000 ARS/mes, ReservaSimple USD 13,99, SimplyBook): mucho más baratas, sin caja/abonados/grilla multi-cancha — compiten por el complejo chico S2, no por el ICP-1.
- **Playtomic:** confirmado FUERA de fútbol (pádel/tenis). No es competidor directo.
- **Apps de jugadores** (Falta Uno, Nos Falta Uno, Matchat†): ninguna cruzó a gestión B2B.

**Implicancia estratégica dura:** el espacio "software argentino para canchas" NO está vacío — hay al menos 7 jugadores locales vivos más ATC. La ventana de "producto local nuevo" no es única; la diferenciación tiene que ser REAL y específica (ver 5.3). La buena noticia: casi todos exhiben el mismo patrón — multi-deporte, % de mejora autoreportados sin nombres, marketing de features. Nadie está ejecutando founder-led hiperlocal presencial con casos auditables — el playbook de docs 01-08 sigue sin dueño.

### 5.2 Mensajes comoditizados (PROHIBIDOS por gastados — con evidencia)
Frases que ya usan 3+ competidores y que TurnoGol debe evitar aunque sean ciertas:
1. **"Tu cancha, siempre llena"** — Korus Y Dónde Juego lo usan LITERAL; JuegaFácil parafraseado. **Nota incómoda: "la app que te llena de reservas" (el eslogan que pedía el encargo original del doc 11) es exactamente este cliché — el mercado ya lo quemó.**
2. "Sin WhatsApp, sin cuadernos" — 5 competidores. R7/P10 (cuaderno) siguen viables SOLO porque rematan en el mecanismo propio (seña a TU MP), no en el enemigo genérico.
3. "Reservas 24/7", "todo en una plataforma", "estadísticas en tiempo real", "integración Mercado Pago", "% menos ausencias" autoreportado — universales, invisibles por repetición.

### 5.3 Huecos verificados (nadie los ocupa — confirman el posicionamiento de §11)
1. **Fútbol-only explícito** — todos los relevados son multi-deporte. TurnoGol sería el único mono-vertical declarado (junto a JuegaFácil, que sí es de fútbol pero no lo usa como bandera de posicionamiento — compite por chatbot).
2. **"La seña va directo a TU MercadoPago"** — NADIE explica públicamente el destino del dinero. Es EL claim de confianza y está libre.
3. **Política de no-show pública y concreta** — todos venden "menos ausencias" en abstracto; nadie publica la regla (seña capturada + bloqueo automático al reincidente). TurnoGol puede ser el único que la muestra funcionando en video.
4. ~~Precio fijo EN PESOS vs ATC dolarizado~~ **RETIRADO (corrección 2026-07-18, ver §5.1):** ATC lista en PESOS para el comprador argentino (captura del founder) — el hueco cambiario no existe desde la silla del dueño. Lo que queda en pie de esta línea: **nadie del rubro comunica su pricing con la claridad "por cantidad de canchas, todo incluido, +IVA dicho de frente"** — la transparencia sigue siendo diferenciable; el contraste con el dólar, no.
5. **Precio por jugador al reservar** — feature recién shippeada en TurnoGol; ningún competidor lo comunica.
6. **Hablarle al encargado** — todos le hablan solo al dueño (coincide con §6.3).
7. **Prueba social auditable** — el rubro entero publica porcentajes truchos-o-inauditables; el PRIMER caso real con nombre, zona y números verificables va a sonar distinto a todo. La disciplina de claims de este doc es, literalmente, una ventaja competitiva de mensaje.

### 5.4 Por qué un complejo NO cambia (fricciones reales de adopción, síntesis)
1. El statu quo funciona "bastante": WhatsApp+cuaderno tiene costo cero visible y hábito de años (doc1: urgencia 4/10).
2. Miedo a que la seña espante clientes (objeción #3) — el rubro entero lo esquiva; TurnoGol lo enfrenta con configurabilidad.
3. Desconfianza de dónde va la plata — hueco 5.3.2, nadie lo resolvió en mensaje.
4. "Otro sistema que mi encargado no va a usar" — switching humano (§6.3).
5. Fatiga de promesas: entre ATC, 7 locales y las genéricas, a varios dueños YA les tocaron la puerta con "% menos ausencias". El diferencial de TurnoGol acá no es el pitch: es el founder presente, el setup hecho por otro, y (pronto) el caso del complejo de la vuelta.

### 5.B Canales y benchmarks (research fechado 2026-07-18)

> **Informe crudo completo con URLs: [research/2026-07-18-canales-benchmarks.md](./research/2026-07-18-canales-benchmarks.md).** Lo más citable abajo; advertencia del research: los benchmarks cuantitativos de ads son de confianza MEDIA (una fuente de "benchmarks" resultó ser contenido sintético y fue descartada); los hallazgos regulatorios y de SERP son fuente primaria fetchada directo.

**B.1 — Meta Ads con $150k/mes: por debajo del piso.** `HECHO` (Meta Business Help Center, 2026-07-18): mínimo recomendado para campañas de mensajes/clics = USD 5/día ≈ **$225.000 ARS/mes por UN SOLO conjunto de anuncios** — más que todo el presupuesto del founder. CPM Argentina: USD 2,30-4,80 según fuente (rangos no reconciliados; Reels el formato más barato, USD 2-5). Costo por conversación click-to-WhatsApp LATAM: ~€0,20-0,60 ≈ $340-1.030 ARS (confianza media, sin desglose AR). **Consecuencia operativa para E3: ráfagas de 8-10 días a USD 5-8/día, jamás goteo de 30 días** — y expectativas en orden de magnitud, no proyección de ROI. La conversación CRUDA puede costar ~$500-1.500; la CALIFICADA (dueño real del corredor con canchas+zona) va a costar un múltiplo — el umbral de E3 se fija sobre la calificada.

**B.2 — WhatsApp frío: legal en principio, pero con reglas duras.** `HECHO` (fuentes primarias): (a) Ley 25.326 art. 27 habilita el contacto comercial sobre datos de fuentes accesibles al público (la ficha de Google Business encuadra razonablemente — `INFERENCIA`), con opt-out honrado al instante; (b) **Ley 26.951 (Registro No Llame) cubre expresamente WhatsApp publicitario** (FAQ oficial AAIP): hay que **consultar el registro cada 30 días** y excluir inscriptos — se incorpora al flujo del scraper (§18 semana 1); (c) los ToS de WhatsApp prohíben mensajería masiva, el enforcement es por score opaco (reportes/bloqueos), y el patrón que MÁS dispara bans es exactamente el nuestro: escribir a números que nunca te guardaron. Volumen seguro estimado (comunidad, sin cifra oficial): 20-40 números nuevos/día con warm-up. Nuestro plan (20/SEMANA) está 10x debajo del techo — colchón sano. **Regla nueva que sale de esto: el outbound se hace desde un número WhatsApp Business DEDICADO (chip nuevo, warm-up 7-10 días), NO desde el celular personal del founder** — el personal es la promesa de soporte de la oferta O1 y no se arriesga.

**B.3 — Etiqueta IA de Meta: el costo es humano, no algorítmico.** `HECHO`: labels vigentes desde may-2024 (orgánico fotorrealista) y extendidos a TODOS los ads con IA generativa (2025, vía metadata C2PA — HeyGen/Veo la inyectan solos). Sin evidencia dura de penalización algorítmica por el label. Lo que SÍ está medido (2 estudios peer-reviewed, 2024 y 2026): **la divulgación de IA reduce confianza y engagement del espectador humano**. Y Mosseri anunció (dic-2025) que IG priorizará contenido humano en 2026. Traducción: el label no te esconde — te DESCUBRE, ante la audiencia que más desconfía. Refuerza el veredicto de §12 con datos.

**B.4 — SEO local Luján: el hallazgo más accionable del research.** `HECHO` (SERP real navegada 2026-07-18): ~16 complejos de fútbol con ficha activa en Maps en Luján (13-155 reseñas); en el Local Pack y hasta en el AI Overview de Google, **ningún complejo tiene sitio propio — Google linkea sus Instagram por no tener nada mejor**. Y **ATC no aparece en ninguna de las 6 búsquedas locales** (solo indexa Luján de Cuyo, Mendoza). Doble consecuencia: (1) argumento de venta demostrable en la visita: *"buscá tu complejo en Google — te cita el Instagram porque no tenés página; con TurnoGol, esa página existe mañana"*; (2) el corredor es terreno virgen del líder: nadie está sembrando SEO local de canchas en la zona.

**B.5 — El precedente del nicho juega EN CONTRA del plan viral.** `HECHO` (entrevistas primarias): el fundador de AlquilaTuCancha/ATC describió su crecimiento temprano como **llamado en frío puerta a puerta** (Forbes AR, jun-2023 — la nota no menciona redes; su cuenta legacy tiene ~2.215 seguidores); el CEO de AgendaPro atribuyó el crecimiento temprano a **referidos y boca a boca, no a redes** (Bloomberg Línea, ago-2022). De ~30 SaaS verticales hispanohablantes investigados, **ninguno** tiene evidencia verificable de haber crecido con contenido de IG/TikTok en etapa temprana. El competidor que TurnoGol más respeta construyó su imperio exactamente con el playbook de los docs 01-08. "Crecer con contenido" en este nicho no es replicar un canal probado: es apostar sin precedente.

**B.6 — IG orgánico: confirmado, sin geografía.** `HECHO` (Meta Transparency Center, jun-2026): la ubicación NO es señal de ranking orgánico; la segmentación por radio existe solo en Ads Manager (pago). Reels sí distribuye a no-seguidores desde 0 followers — pero por afinidad temática, no por cercanía. La premisa central del doc 11 ("publicar → dueños de la zona lo ven") queda refutada con fuente primaria: para llegarle a Luján orgánicamente no hay botón; para llegarle pagando, sí (E3).

---

## 6. Segmentación e ICP

El ICP-1 de [02-icp.md](./02-icp.md) (3-6 canchas, dueño presente, WhatsApp+cuaderno, IG activo, MP, cierra tarde, <40 min) **sobrevive el red team casi intacto** — es específico, observable desde afuera y scoreable. Lo que sigue lo profundiza con los 9 segmentos pedidos y sus jobs.

### 6.1 Matriz de segmentos (corredor Luján-oeste)

| # | Segmento | Dolor urgente | Dolor tolerado | Solución actual | Decide | Opera | Puede sabotear | Trigger de compra | Voluntad de pago | Mensaje que abre conversación | Prioridad |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | **3-6 canchas, dueño encima, WA+cuaderno, finde lleno** (ICP-1) | Turnos colgados en horario pico; teléfono 16hs | Caja "más o menos"; huecos de la tarde | WA + cuaderno + memoria | Dueño | Dueño + 1-2 encargados | Encargado (ver 6.3) | Un viernes de 2+ colgados; ver al competidor con link | Alta ($85k = 2-4 turnos) | "¿Cuántos turnos te colgaron este mes?" | **P1 — beachhead** |
| S2 | 1-2 canchas, negocio secundario, dueño ausente | Pocos; el negocio "camina solo" | Todo | Encargado + WA | Dueño (lejos) | Encargado | Encargado (total) | Casi ninguno | Baja ($55k pesa) | — | Evitar (doc2 ya lo dice) |
| S3 | Alta ocupación + administración caótica (subset de S1) | La caja no cierra; discusiones por dobles reservas | El caos mismo ("siempre fue así") | Cuaderno sagrado | Dueño | Encargados rotativos | Encargados (el orden los expone) | Un faltante de caja gordo; una pelea por doble reserva | Alta | "¿La caja del sábado te cerró al peso?" | P1-bis (gancho caja) |
| S4 | Horas valle vacías, pico lleno | "Pierdo plata de 14 a 18" (si lo verbalizó) | Lo mismo (mayoría lo asume como ley natural) | Nada / promos sueltas en IG | Dueño | — | — | Ver que el precio por franja existe | Media-alta | "¿La de las 15 la cobrás igual que la de las 21?" | P2 (gancho secundario, feature real) |
| S5 | Todo por WhatsApp, responde rápido, IG activo | El teléfono como segundo trabajo | Ausentes (los naturalizó) | WA Business a pulso | Dueño | Dueño | Nadie | Vacaciones arruinadas; hartazgo | Alta | "¿A qué hora contestaste el último '¿hay cancha?' anoche?" | P1 (mismo ICP-1, gancho teléfono) |
| S6 | **Ya usa ATC u otro sistema** | Depende: precio, UX desktop, soporte | — | ATC | Dueño | Encargado (entrenado en ATC) | Encargado (switching cost humano) | Renovación anual; suba de precio de ATC; feature faltante | Media | "¿Qué te funciona y qué no de lo que usás?" | P3 — año 2 salvo quemados (doc2 tipo B), y SOLO si no dependen del marketplace de ATC |
| S7 | **Complejo nuevo por abrir** | TODO: no tiene sistema, ni clientela, ni procesos | — | Nada aún | Dueño (invirtiendo) | A definir | — | La apertura misma | Alta (está gastando en todo) | "Abrís con reservas online desde el día 1, sin cuaderno que migrar" | **P2 — oro escaso**: cero switching cost, cero hábito que romper. 1-3 por año en la zona (INFERENCIA) |
| S8 | Problemas de señas/cancelaciones ya reconocidos (pide seña por WA a mano) | Perseguir comprobantes de transferencia; discusiones por devoluciones | — | Alias/CBU por WA + captura | Dueño | Dueño/encargado | — | El quilombo administrativo de las señas manuales | Alta | "¿Seguís revisando comprobantes de transferencia a las 11 de la noche?" | **P1-plus: el más caliente de todos** — ya cree en la seña, solo odia la logística |
| S9 | No quiere que sus clientes "bajen una app" (objeción identitaria) | Los mismos de S1 | — | WA + cuaderno | Dueño | — | Él mismo (anticuerpo anti-tecnología) | Ver que es UN LINK (no app) en la demo de 60s | Media | "No es una app. Es un link, como un menú por QR" | P2 — objeción #2 de doc7, se derrite con la demo del link |

**Beachhead confirmado: S1 ∪ S5 ∪ S8 en Luján ciudad primero, corredor después (Rodríguez, Moreno, Pilar, Mercedes).** Justificación:
- `HECHO` — el founder vive ahí: visita presencial mismo día, "soy de acá" (la frase de apertura de doc6 §3 es literal), soporte cara a cara — el único diferencial que ATC no puede replicar a nivel zonal.
- `INFERENCIA` (a confirmar con el scraper en Semana 1) — el corredor oeste tiene decenas de complejos F5/F7-8 en un radio de 40 min; la lista de 100 scoreados de doc8 es alcanzable sin salir del corredor.
- Densidad = boca a boca: los dueños de una zona se conocen (doc2 §zona); cada piloto activado es un argumento en el asado de otro dueño. El moat de doc1 ("densidad local", hoy 2/10) SOLO se construye así.
- **Sobre "todo el país digital desde el día 1"** (aspiración del founder): se ATIENDE, no se PERSIGUE. Si un complejo de Córdoba cae solo (inbound), el onboarding self-service existe y se lo atiende con gusto — pero ni un peso ni una hora de adquisición se gasta fuera del corredor hasta saturarlo. La dispersión nacional temprana es el error clásico: 15 clientes en 15 ciudades = 15 mercados con densidad cero, cero referidos cruzados, soporte imposible.

### 6.2 Jobs to be Done del comprador (S1/S5/S8)

| Tipo de job | El job real | Implicancia de mensaje |
|---|---|---|
| **Funcional 1** | "Que el turno reservado se juegue o se cobre igual" | El mecanismo seña+bloqueo ES el producto. Mensaje: mecánica, no adjetivos. |
| **Funcional 2** | "Sacarme el teléfono de encima sin perder reservas" | El link atiende 24/7 — pero decir "no te cambio el WhatsApp" (doc3): el job es DESCARGAR el canal, no reemplazarlo. |
| **Funcional 3** | "Saber cuánto entró hoy sin contar a mano" | Caja/cierre — segundo gancho para S3. |
| **Emocional 1** | "Dejar de sentirme estafado por gente que no aparece" | La ausencia duele como FALTA DE RESPETO, no solo como plata. El bloqueo automático al reincidente es JUSTICIA — véndase como tal ("las reglas las cobra el sistema, vos no discutís con nadie"). |
| **Emocional 2** | "Volver a ser dueño, no telefonista" | Identidad. R8/R21 del doc 11 le hablaban a esto — correcto. |
| **Social 1** | "Que mi complejo se vea serio/profesional en la zona" | La página propia (`/[slug]`) como símbolo de estatus zonal. Canaliza la fantasía "me trae clientes" en forma honesta. |
| **Social 2** | "No ser el último dinosaurio del corredor" | Solo activable cuando existan pilotos en la zona (el "ya lo usa [complejo conocido]" de doc6 §re-contacto). Hasta entonces, NO PUBLICABLE. |

### 6.3 La persona que sabotea: el encargado
Nadie del plan original lo consideró. El encargado (rol `manager` del producto):
- **Gana** con TurnoGol: menos teléfono, menos discusiones por dobles reservas, cierre de caja en 30s en vez de contar a mano.
- **Pierde** con TurnoGol: la caja transparente lo expone si "redondeaba"; el sistema registra quién anotó qué; su conocimiento-monopolio del cuaderno (que lo hacía imprescindible) se evapora.
- `INFERENCIA` — en complejos donde el dueño no está encima (S2, parte de S3), el encargado puede matar la adopción con dos semanas de "a mí no me anda" / "los clientes se quejan".
- **Contramedidas** (van a la oferta y al onboarding): entrenamiento del encargado COMO PROTAGONISTA (doc4 ya incluye los 20 min — reencuadrarlos: "te enseño para que el sistema trabaje para vos"), y el argumento directo al encargado: "el teléfono deja de sonar para VOS también". En la visita, si el que atiende es el encargado, venderle a ÉL el alivio antes de pedir por el dueño.

---

## 7. Jobs to be Done — síntesis operativa

(Los jobs por segmento están en 6.2; esta sección los convierte en reglas de mensaje.)

1. **El gancho de apertura es una PREGUNTA sobre su operación, nunca una afirmación sobre el producto.** "¿Cuántos turnos te colgaron este mes?" > "TurnoGol elimina los turnos colgados". Las 5 preguntas de doc6 §4 son el activo de venta más subestimado del repo.
2. **Un dolor por conversación.** El feedback "tiene muchas cosas" (§3) es una advertencia: cada mensaje/pieza/demo empuja UN job. El tour completo mata la venta.
3. **La justicia vende más que la plata** (`HIPÓTESIS` a validar en E1): "que la ausencia la pague el que faltó" tiene carga emocional que "recuperá $80.000/mes" no tiene. Probar ambos ganchos.
4. **El estatus zonal es el premio silencioso**: la página propia con el nombre del complejo es lo que el dueño le muestra al amigo. Aparece en toda demo aunque no se pida.
5. **Nunca prometer el job que el producto no hace**: traer clientes nuevos. Respuesta canónica ya escrita en doc7 objeción #13 — es la mejor respuesta del doc: honesta Y reposiciona ("te ordena la demanda que YA tenés").

---

## 8. Auditoría completa del archivo original (doc 11)

### 8.0 Método
Cada pieza puntuada 1-10 en 14 dimensiones. Leyenda de columnas: **RC** relevancia para el comprador (dueño, no jugador) · **HK** poder del hook · **CL** claridad · **DF** diferenciación · **CR** credibilidad en boca de una cuenta sin historia · **DM** demostrabilidad (¿se puede MOSTRAR, no afirmar?) · **CQ** capacidad de generar consultas calificadas · **AP** ajuste al estado real del producto · **FP** facilidad de producción · **IA** resistencia a parecer contenido genérico de IA (10 = parece hecho por una persona real del rubro) · **OR** potencial orgánico · **AD** potencial como anuncio pago geo-segmentado · **CV** compatibilidad con la llamada/visita de ventas (¿sirve reenviado 1:1?) · **RU** reutilización. **Σ** = promedio a un decimal.

Sesgo declarado: estas piezas las escribí yo (sesión 2026-07-18). La auditoría se hizo contra los criterios del mandato, no contra el cariño por el material; donde una pieza falla, se dice por qué falla.

### 8.1 Tabla de puntuación (30 piezas)

| Pieza | RC | HK | CL | DF | CR | DM | CQ | AP | FP | IA | OR | AD | CV | RU | Σ | Veredicto |
|---|--|--|--|--|--|--|--|--|--|--|--|--|--|--|---|---|
| R1 Viernes 22:00 | 9 | 8 | 9 | 7 | 8 | 8 | 7 | 9 | 7 | 6 | 4 | 8 | 9 | 9 | 7.7 | **Mantener** (b-roll real, no IA) |
| R2 La cuenta que duele | 9 | 7 | 8 | 8 | 9 | 6 | 8 | 9 | 8 | 8 | 4 | 7 | 10 | 10 | 7.9 | **Modificar** → calculadora + follow-up |
| R3 WhatsApp 23:47 | 9 | 8 | 9 | 6 | 9 | 8 | 7 | 9 | 8 | 8 | 5 | 8 | 8 | 8 | 7.9 | **Mantener** |
| R4 Doble reserva | 7 | 7 | 8 | 6 | 7 | 7 | 5 | 9 | 4 | 4 | 5 | 5 | 7 | 6 | 6.2 | **Modificar** → screen-record, sin skit |
| R5 "¿Me guardás?" | 8 | 7 | 9 | 6 | 8 | 7 | 6 | 9 | 7 | 7 | 4 | 6 | 8 | 7 | 7.1 | **Modificar** → fusionar con R1 (canibaliza) |
| R6 Llamadas perdidas | 7 | 6 | 8 | 5 | 8 | 6 | 5 | 9 | 6 | 6 | 3 | 5 | 6 | 5 | 6.1 | **Eliminar** (R3 cubre el mismo dolor mejor) |
| R7 Cuaderno jubilado | 8 | 8 | 9 | 7 | 8 | 6 | 6 | 9 | 8 | 7 | 6 | 6 | 7 | 7 | 7.3 | **Modificar** (cuaderno REAL filmado; tono en el filo) |
| R8 Jefe teléfono | 7 | 7 | 8 | 6 | 7 | 5 | 5 | 9 | 4 | 4 | 5 | 5 | 6 | 5 | 5.9 | **Postergar** (skit caro, mensaje cubierto por R3) |
| R9 "Confirmame porfa" | 8 | 7 | 9 | 6 | 9 | 7 | 6 | 9 | 9 | 8 | 4 | 7 | 8 | 7 | 7.4 | **Mantener** |
| R10 Excel sin mostrador | 5 | 7 | 8 | 6 | 8 | 7 | 5 | 9 | 8 | 8 | 3 | 4 | 7 | 6 | 6.5 | **Probar** bajo (segmento minoritario del ICP) |
| R11 El sonido de la plata | 9 | 9 | 9 | 9 | 10 | 10 | 8 | 10 | 9 | 10 | 6 | 9 | 10 | 10 | **9.1** | **Mantener — TOP 1** |
| R12 Semana en 20s | 8 | 7 | 8 | 7 | 7 | 9 | 6 | 9 | 7 | 9 | 5 | 7 | 9 | 9 | 7.6 | **Mantener** (etiqueta "cuenta demo" SIEMPRE visible) |
| R13 Reservó a las 2am | 9 | 8 | 9 | 8 | 9 | 10 | 8 | 10 | 8 | 9 | 6 | 9 | 10 | 10 | **8.8** | **Mantener — TOP 2** |
| R14 Caja en 30s | 8 | 7 | 9 | 8 | 9 | 9 | 6 | 10 | 8 | 9 | 4 | 6 | 9 | 9 | 7.9 | **Mantener** (gastos = diferencial real vs ATC) |
| R15 Ausencia → seña queda | 9 | 8 | 9 | 9 | 9 | 10 | 7 | 10 | 8 | 9 | 4 | 8 | 10 | 10 | **8.6** | **Mantener — TOP 3** |
| R16 Llegó a Argentina | 5 | 7 | 7 | 4 | 3 | 2 | 4 | 6 | 5 | 2 | 6 | 6 | 4 | 4 | 4.6 | **Modificar radical** o postergar (ver 8.2) |
| R17 Dos tipos de complejos | 8 | 8 | 8 | 7 | 7 | 6 | 6 | 8 | 7 | 7 | 5 | 7 | 8 | 7 | 7.1 | **Mantener** |
| R18 Cupos de a 10 | 7 | 8 | 8 | 6 | 4 | 3 | 7 | 5 | 8 | 7 | 5 | 7 | 6 | 6 | 6.2 | **Modificar** (el límite real es 5 pilotos — ver 8.2) |
| R19 Everest | 2 | 8 | 7 | 5 | 2 | 1 | 2 | 4 | 3 | 1 | 7 | 3 | 2 | 3 | 3.6 | **Eliminar** del calendario comercial (ver 8.2) |
| R20 NO pongas TurnoGol | 8 | 9 | 8 | 7 | 8 | 5 | 7 | 9 | 9 | 8 | 6 | 8 | 7 | 7 | 7.6 | **Mantener** |
| R21 Dos lunes | 8 | 7 | 8 | 7 | 7 | 6 | 6 | 9 | 5 | 5 | 5 | 7 | 8 | 7 | 6.8 | **Probar** versión barata (voz + b-roll real) |
| R22 Señar es laburar en serio | 9 | 8 | 9 | 8 | 9 | 6 | 6 | 10 | 9 | 8 | 4 | 6 | 10 | 9 | 7.9 | **Mantener** (munición 1:1 más que reel) |
| R23 Tu página propia | 9 | 8 | 9 | 8 | 9 | 9 | 8 | 10 | 8 | 9 | 5 | 9 | 9 | 9 | **8.5** | **Mantener + SUBIR prioridad** (ver 8.2) |
| R24 Los 3 números | 7 | 7 | 8 | 6 | 8 | 8 | 4 | 9 | 7 | 8 | 4 | 4 | 7 | 7 | 6.7 | **Probar** frecuencia baja (nutre, no convierte) |
| R25 La de las 15 vacía | 8 | 8 | 8 | 8 | 8 | 8 | 6 | 10 | 7 | 8 | 4 | 6 | 8 | 8 | 7.5 | **Mantener** |
| R26 El detalle de las 2am | 7 | 7 | 8 | 10 | 9 | 8 | 6 | 10 | 7 | 8 | 3 | 6 | 9 | 8 | 7.6 | **Mantener** (joya de nicho: filtra ICP solo) |
| R27 ¿Y si no paga? | 8 | 8 | 9 | 7 | 9 | 10 | 6 | 10 | 8 | 9 | 4 | 6 | 9 | 9 | 8.0 | **Mantener** |
| R28 Etiquetá al dueño | 3 | 7 | 8 | 6 | 5 | 6 | 3 | 5 | 7 | 7 | 7 | 3 | 3 | 5 | 5.4 | **Postergar** (≥3 complejos activos en zona) |
| R29 POV 2am asado | 3 | 7 | 8 | 6 | 4 | 6 | 3 | **3** | 6 | 6 | 7 | 3 | 3 | 5 | 5.0 | **Postergar + CORREGIR** (ver 8.2 — claim falso) |
| R30 El que señó juega | 4 | 8 | 9 | 7 | 7 | 5 | 3 | 8 | 7 | 7 | 8 | 4 | 4 | 6 | 6.2 | **Postergar** (el mejor del pilar G para el futuro) |

### 8.2 Fallas específicas que la tabla no muestra sola

**R29 contiene un claim FALSO detectado en esta auditoría** — el guion dice *"cae la seña entre todos"*: **el producto NO tiene pago dividido**; la seña la paga UNA persona (el que reserva). `HECHO` (schema de payments: un pagador por pago). Si esa pieza se publicaba, la primera demo con un grupo real la desmentía. Lección: hasta los claims "verdes" necesitan verificación contra el producto pieza por pieza. El doc 11 no debe usarse como fuente de claims sin esta auditoría al lado.

**R19 (Everest) — por qué se elimina sin apelación:** es la pieza favorita del encargo original ("avatares hiperrealistas indetectables") y es la peor del archivo para ESTE negocio. (a) El dueño de 45-60 de Luján no tiene ningún puente cultural con el Everest — el pattern interrupt funciona cuando interrumpe DENTRO del mundo del espectador. (b) Es la pieza con mayor probabilidad de disparar el pattern-match "cuenta de dropshipping/infoproducto" (IA=1), la PEOR asociación posible para un SaaS que pide $85.000/mes de confianza. (c) Su valor depende de que el espectador se asombre por la producción — asombro que en 2026 ya no existe: todos vieron mil videos IA. (d) Costo real (iteraciones de generación hasta que salga bien) vs pipeline esperado ≈ 0 dueños. Si el founder quiere hacerlo por diversión o para aprender las herramientas: es un hobby legítimo — fuera del calendario comercial y sin cargarlo al presupuesto de adquisición. Queda como experimento E7 (§17) con umbral de kill explícito por si se insiste.

**R16 (Llegó a Argentina) — el hype invertido:** una cuenta de 0 seguidores anunciando con épica cinematográfica IA que "llegó a Argentina" produce el efecto contrario al buscado: nadie llegó a ningún lado y se nota. La versión que SÍ funciona es más chica y más fuerte: **"Llegó a Luján"** — cuando haya 2-3 pilotos activos, con imágenes REALES de esos complejos (con permiso), nombrando la zona. La épica nacional se gana; la zonal se construye en 60 días. Hasta entonces: postergada.

**R18 (Cupos de a 10) — escasez inflada que era innecesaria:** el límite real y documentado es **5 pilotos simultáneos** (doc4, límite de horas del founder). "Entran de a 10 por mes" es una proyección disfrazada de regla; un dueño que pregunte "¿y quiénes son los otros 9?" la pincha. La versión honesta es MÁS fuerte: *"Llevo los pilotos de a 5 porque los configuro y acompaño yo — cuando se llenan los 5, la lista espera al mes siguiente."* Verificable, coherente con la oferta, y la espera real sube el valor percibido (doc4 ya lo decía).

**El pilar G completo (R28-R30) — bien pensado, mal fechado:** el mecanismo (jugador como repartidor vía tag) es correcto EN UNA ZONA CON COMPLEJOS ACTIVOS. Hoy, "hay complejos donde entrás a un link…" es técnicamente cierto (el producto existe) y comercialmente falso (ninguno operando). Un jugador que etiqueta al dueño hoy manda tráfico a un perfil que no puede demostrar nada en su zona. Se archiva con condición de activación: **≥3 complejos activos en un radio de 20 min** → se relanza geo-dirigido a jugadores de ESA zona (ahí sí con ads, porque el tag orgánico no segmenta).

**El banco de 15 hooks (§3 del doc 11):** sobrevive casi entero — es el activo más portable del doc. Se recicla como: primeras líneas de mensajes de WhatsApp (mejor uso), aperturas de los guiones de §16, copys de ads. Excepción: hook 14 ("entran 10 por mes"), corregido a la versión 5-pilotos.

**El funnel "comentá YO" + ManyChat (§5 del doc 11):** reemplazado (§2.3 y §16.0). Los 3 DMs escritos se rescatan casi textuales — pero como **respuestas rápidas de WhatsApp Business** (donde ya vive doc6 §9), no como automatización de IG.

**El calendario diario (§6 del doc 11):** eliminado. 6 reels/semana para una audiencia orgánica que no contiene compradores es trabajo-que-se-siente-trabajo. Reemplazo en §15: 12 piezas evergreen primero (el escaparate), luego mantenimiento 2/semana (la doctrina de doc9 tenía razón) + toda hora ahorrada va a prospección.

**La sección de producción (§7 del doc 11):** el workflow (guion → screen-record real → subtítulos → PING de marca como firma sonora) se conserva. La prioridad de herramientas se invierte: celular + OBS + CapCut gratis = $0 y alcanza para TODO el contenido de fase 1. Avatares pasan a fase 2 condicionada (§12).

**La sección 8 del doc 11 (social proof real en 30 días):** la mejor sección del documento original. Se mantiene INTACTA y se promueve: es la columna vertebral del plan de §18. El primer caso real con números y permiso vale más que las 30 piezas juntas.

**La tabla de claims VERDE/ROJO (§9 del doc 11):** se mantiene y se endurece con dos altas al ROJO: "cae la seña entre todos" (split inexistente) y "entran de a 10 por mes" (escasez no respaldada). Versión consolidada en §10.

---

## 9. Tabla resumen: mantener / modificar / probar / postergar / eliminar

| Veredicto | Piezas | Nuevo rol |
|---|---|---|
| **Mantener (15)** | R1, R3, R9, R11, R12, R13, R14, R15, R17, R20, R22, R23, R25, R26, R27 | Munición 1:1 + escaparate del perfil + creativos de ads futuros. Prioridad de producción: R13 → R11 → R23 → R15 → R2(calc) → resto |
| **Modificar (6)** | R2 (→ calculadora + follow-up), R4 (→ screen-record puro), R5 (→ fusionar con R1), R7 (→ producción 100% real), R16 (→ "Llegó a Luján" post-pilotos), R18 (→ tope 5 real) | Correcciones aplicadas en §16 |
| **Probar bajo costo (3)** | R10, R21 (versión barata), R24 | 1 publicación c/u, medir consultas de dueños, kill sin duelo |
| **Postergar (4)** | R8, R28, R29 (corregida), R30 | R8: cuando haya presupuesto de producción. Pilar G: ≥3 complejos activos en radio de 20 min |
| **Eliminar (2)** | R6, R19 | R6 canibalizada por R3. R19: fuera del presupuesto comercial (hobby permitido, KPI cero) |

**Balance honesto: del doc 11 sobrevive ~50% de las piezas pero ~15% de la ESTRATEGIA.** Las piezas eran mayormente buenas; el sistema alrededor (distribución orgánica masiva + CTA a DM + cadencia diaria + hype + avatares como formato central) se reemplaza entero.

---

## 10. Evaluación de claims (consolidada y ampliada)

| Claim | Evidencia hoy | Confianza | Riesgo de exageración | Forma segura Y persuasiva | Evidencia a obtener |
|---|---|---|---|---|---|
| "La app que te llena de reservas" | Ninguna (0 reservas reales) | **NO PUBLICABLE** | Máximo: promete demanda (el job del marketplace que NO existe) | "Tus huecos, publicados y reservables las 24hs" — vende disponibilidad, no demanda | 1er piloto con N reservas online reales |
| "Si te cuelgan el turno, la seña queda para vos" | Código verificado | HECHO | Nulo | Usar tal cual — es EL claim | Ya está |
| "La plata va directo a TU MercadoPago, nosotros no la tocamos" | OAuth MP por complejo, verificado | HECHO | Nulo | Tal cual — mata la desconfianza #1 | Ya está |
| "Al que falta seguido, el sistema le corta solo las reservas online 2 semanas" | Código verificado (2da ausencia/90d → 14 días) | HECHO | Bajo (aclarar: solo online, solo ese complejo) | "Las reglas las cobra el sistema — vos no discutís con nadie" | Ya está |
| "Reserva desde un link, sin bajar ninguna app" | Portal web verificado | HECHO | Nulo | Tal cual + demo de 15s | Ya está |
| "Configurado en 20 min / te lo dejo andando en 48h" | Onboarding + oferta doc4 | HECHO | Bajo | "Me mandás la foto del cuaderno; en 48hs está andando" | Cronometrar los primeros 3 setups reales |
| "30 días gratis, sin tarjeta, sin permanencia" | Trial en producto | HECHO | Nulo | Tal cual | Ya está |
| "Tu complejo con su propia página" | Portal `/[slug]` verificado | HECHO | Nulo | Tal cual | Ya está |
| "…que aparece en Google" | Indexación NO demostrada (0 portales vivos) | HIPÓTESIS | Medio | Hoy: "tu página propia para bio, estado y QR". Post-indexación: "buscá [complejo] en Google" | Indexar portal del piloto 1 y verificar SERP (E8, §17) |
| "Reducís las ausencias un X%" | Ninguna | **NO PUBLICABLE** | Máximo | Sustituto mecánico: "el turno colgado deja de ser gratis para el que falta" | ≥3 meses de datos de ≥5 complejos; aun así, publicar rangos con contexto |
| "Sale menos que ATC" | **CORREGIDO 2026-07-18/19 (captura del founder + navegación desde AR)**: ATC lista EN PESOS $66k/$104k/$136k. Por franja: TurnoGol gana con 1-2, 4-5 y 7+ canchas; **PIERDE con 3 ($85k vs $66k) y con 6 ($115k vs $104k)**. IVA de ATC indeterminable desde su sitio (verificado: cero menciones; su FAQ dice "el único costo es el abono mensual") | FALSO como claim general | Alto: un dueño de 3 canchas que compare lo desmiente en 2 minutos | **NO usar "sale menos que ATC" como claim.** En charla, solo con los números de la franja de ESE complejo y del día. El terreno correcto no es precio: mecanismo (seña anticipada a TU MP vs tarjeta en garantía), fútbol-only, **y alta sin comercial: su "probar gratis" es un formulario + reunión coordinada (verificado); el de TurnoGol arranca solo** | Factura real de un cliente ATC (preguntar en charlas S6) o consulta al comercial + re-captura mensual desde AR |
| "Hecho solo para fútbol" | Producto verificado | HECHO | Bajo | "Hecho solo para fútbol — no es un sistema de pádel adaptado" | Evitar "el ÚNICO de Argentina" hasta barrer §5 |
| "Millones usan TurnoGol" / "la app del momento" / "tu competencia ya lo usa" | — | **NO PUBLICABLE** (falso) | Máximo + legal (art. 8, Ley 24.240: lo publicitado obliga) | El hype honesto es zonal y futuro: "los primeros complejos de Luján se están sumando" (cuando sea cierto) | Pilotos firmados |
| "Entran de a 10 complejos por mes" | Capacidad real: 5 pilotos simultáneos (doc4) | FALSO como estaba | Alto | "Llevo los pilotos de a 5, porque los armo y acompaño yo" | — |
| "Cae la seña entre todos" (R29) | **No existe pago dividido** | FALSO | Alto | "Uno reserva y seña por el grupo, como siempre — pero online y en 2 minutos" | (split payment = backlog de producto, no de marketing) |
| "Complejo X: N reservas online y $Y en señas en su primer mes" | — | Futuro | — | LA pieza reina — solo con permiso escrito y números reales | Piloto 1 activado + permiso (§18, semana 4) |

---

## 11. Posicionamiento recomendado

### 11.1 Las 8+1 posiciones, evaluadas

| # | Posición | Urgencia | Diferenciación | Explicable | Evidencia requerida | Riesgo de sobre-promesa | Veredicto |
|---|---|---|---|---|---|---|---|
| 1 | "Sistema operativo del complejo" | Baja | Media | Difícil (abstracto) | Alta | **Alto** — el feedback real ("tiene muchas cosas") muestra que la amplitud ABRUMA, no seduce | Visión interna; NO mensaje de entrada |
| 2 | "Automatiza reservas y señas" | Media | **Baja** (commodity wording) | Fácil | Baja | Bajo | Genérico: pierde contra el statu quo por aburrido |
| 3 | Red/marketplace de fútbol | Alta (fantasía del dueño) | Alta | Fácil | **Inexistente** (0 jugadores) | **Letal** — churn a 60 días + lista PROHIBIDA doc10 | Descartado (es la posición de ATC, con red real) |
| 4 | **Canal digital propio del complejo** ("tu página, tu link, tu QR") | Media | Alta (nadie lo dice así) | Muy fácil | Baja (el portal existe) | Bajo | **SECUNDARIO** |
| 5 | "Elimina el caos de WhatsApp" | Media-alta | Baja-media (lo dicen las turneras genéricas) | Fácil | Baja | Medio (el WA no se elimina — doc3) | Gancho de conversación (S5), no posición |
| 6 | "Infraestructura de crecimiento y gestión" | — | — | Jerga B2B vacía | — | Alto | Descartado: viola el vocabulario de doc3 |
| 7 | "Experiencia moderna para el jugador" | Baja (el jugador no paga) | Media | Fácil | Media | Medio | Sub-argumento de demo, no posición |
| 8 | "Plataforma argentina especializada en fútbol" | **Baja** (la especialización no duele) | Alta vs ATC | Fácil | Baja | Bajo | Modificador de credibilidad, no posición |
| 9 | **"El sistema de señas para canchas de fútbol — que el turno colgado lo pague el que faltó"** (construida acá) | **Alta** (plata perdida CON culpable) | **Muy alta** (mecanismo único demostrable; nadie ocupa esa palabra) | Muy fácil (una frase; doc3 ya la tiene) | Baja (demo de 60s) | Bajo | **PRINCIPAL** |

### 11.2 La decisión

- **Posicionamiento PRINCIPAL:** el anti-turno-colgado. Categoría mental: **"el sistema de señas para canchas de fútbol"** — subcategoría NUEVA, no "software de gestión" (categoría que ATC posee hace años) ni "app de reservas" (que evoca marketplace y promete demanda ajena). En la cabeza del dueño: *"TurnoGol = que no me cuelguen más turnos"*.
- **SECUNDARIO:** tu complejo con página propia — canaliza honestamente la fantasía "me trae clientes" detectada en las charlas (§3): no te traigo gente, te doy la vidriera. Segundo golpe de la demo y creativo de ads (R23).
- **Enemigo:** **la reserva de palabra** ("guardar de palabra es regalar tu mejor horario"). NO el cuaderno (objeto querido — doc3 lo prohíbe), NO ATC (pelear contra el que tiene marketplace regala el frame), NO WhatsApp (no se elimina, se descarga).
- **Promesa central:** la frase de doc3 §central, INTACTA — sobrevivió el red team palabra por palabra porque es 100% mecánica verificable.
- **Mecanismo (por qué funciona, en 15 segundos):** el que reserva pone plata ANTES por MercadoPago directo a tu cuenta → el que no viene ya pagó su parte → el reincidente queda 14 días sin reservar online, automático. Sin mecanismo la promesa es humo; con él, es ingeniería.
- **Razones para creer (hoy, sin casos):** (1) demo en vivo con SUS canchas en 15 min; (2) "la plata no pasa por nosotros" — verificable en su propia pantalla de MP; (3) "te lo dejo andando yo en 48hs y tenés mi celular" — el fundador-de-acá como garantía humana; (4) 30 días gratis sin tarjeta: el riesgo lo asume TurnoGol.
- **Claims autorizados HOY:** columna "forma segura" de §10. **Desbloqueables:** "aparece en Google" (post-indexación), "N reservas y $X en señas el primer mes — [Complejo], Luján" (post-permiso), "los complejos de [zona] se están pasando" (post-3 pilotos). **Retirado de los desbloqueables:** "sale menos que ATC" — falso por franja (§10, corrección 2026-07-18); la comparación de precio se hace solo en charla, con los números del complejo puntual.
- **Cláusula anti-enamoramiento:** el gancho seña-first es `HIPÓTESIS` reforzada por doc3 pero tensionada por las charlas informales (interés espontáneo en grilla/control). E1 (§17) lo somete a 20 conversaciones discovery ANTES de fijarlo. Si el dolor dominante resulta ser control/caja, el MECANISMO no cambia — cambia la puerta de entrada (y doc3 se actualiza, como su §final ya prevé).
- **Validación externa (research 2026-07-18, §5.3):** la posición elegida cae EXACTAMENTE sobre los huecos verificados del mercado — nadie dice "la seña va directo a TU MP" (hueco 2), nadie publica su política de no-show (hueco 3), nadie es fútbol-only declarado (hueco 1). ~~El ladrillo "precio fijo en pesos vs ATC en dólares"~~ **retirado por la corrección de §5.1** (ATC lista en pesos desde Argentina): el posicionamiento NO pelea por precio — pelea por mecanismo, y la corrección lo dejó más claro todavía. En cambio, "la app que te llena de reservas" — el eslogan del encargo original — resultó ser el cliché MÁS comoditizado de la categoría (tres competidores lo usan literal, §5.2): el mercado mismo lo vetó.

---

## 12. Evaluación de avatares IA

### 12.1 Contra los criterios pedidos

| Criterio | Evaluación para ESTE negocio |
|---|---|
| Credibilidad ante dueños 40-60 de Luján | **Negativa neta como presentador.** El activo de confianza de esta fase es "el pibe de acá que vino al complejo" — un humano sintético es su opuesto exacto (`INFERENCIA` de §6: decisor desconfiado, venta presencial). |
| Uncanny valley | Riesgo medio-alto en es-AR: prosodia y lip-sync rioplatense todavía delatan. El dueño no va a decir "es un avatar"; va a decir "esto es trucho" — peor. |
| Riesgo estético dropshipping/infoproducto | **El riesgo #1.** Avatar + subtítulos + hype ES la estética del humo. TurnoGol necesita distancia máxima de ese patrón para pedir $85k/mes de confianza. |
| Diferenciación | Nula en 2026: los feeds están saturados de avatares. Lo diferenciante hoy es lo REAL: un mostrador de verdad, un push sonando de verdad. |
| Consistencia / velocidad / costo de producción | Ventaja real — pero solo importa en VOLUMEN, y la fase 1 necesita 12 piezas, no 120. |
| Fatiga creativa | Alta: 30 variantes del mismo busto parlante fatigan a la semana 3. |
| Etiquetas IA de Meta | Vigentes desde 2024 (orgánico) y en TODOS los ads con IA generativa desde 2025, automáticas vía metadata C2PA que las herramientas inyectan solas (§5.B.3 — no existe "pasar desapercibido"). Sin evidencia de penalización algorítmica; lo medido (2 estudios peer-reviewed) es que la divulgación de IA **reduce la confianza del espectador humano**: el label no te esconde, te descubre. Mosseri además anunció prioridad 2026 a contenido humano. |
| Adecuación para ads | **Sí, condicionado a fase 2:** iterar 10 variantes de hook sobre un creativo GANADOR ya validado con material real. Los avatares optimizan; no descubren. |
| Adecuación orgánico | Marginal (§2.1 — el orgánico masivo no es el canal). |
| Construir marca reconocible | La marca reconocible disponible y gratis es LA CARA DEL FOUNDER. Un avatar la diluye. |
| Explicar producto / mostrar evidencia | Lo hace mejor el screen-record con voz en off: más barato, más creíble, y la UI es la estrella. |
| Dependencia de "indetectabilidad" | **Descalificante por diseño**: una estrategia cuyo éxito requiere que el público NO detecte el truco es frágil (la detección mejora, la etiqueta de Meta lo declara, el descubrimiento retroactivo quema toda la confianza acumulada). Ninguna pieza del sistema reconstruido depende de eso. |

### 12.2 Contra las alternativas

| Formato | Costo | Confianza generada | Veredicto fase 1 |
|---|---|---|---|
| **Screen-record del producto real + voz en off** | $0 | Alta (la UI es la prueba) | **Formato rey — ~50% del contenido** |
| **Founder a cámara** (celular, complejo o cancha de fondo) | $0 | **Máxima** (es el mismo que después toca el timbre) | **~30% — refuerza la venta presencial** |
| Cuaderno / mostrador / cancha REALES filmados | $0 | Alta (mundo del espectador) | B-roll por defecto |
| Skits con humor argentino | Medio | Media-alta si el tono acierta | Fase 2, con actores reales o founder |
| Testimonios / casos reales | $0 (post-piloto) | **La más alta posible** | La pieza reina desde que exista |
| UGC con actores declarados | Medio | Media | Fase 3 (escala de ads) |
| Motion graphics | Medio | Media (no huele a humo, no prueba nada) | Explicadores puntuales |
| **Avatar IA fotorrealista** | Bajo-medio + suscripciones | Baja-negativa en este ICP | **Fase 1: 0%. Fase 2: ≤20%, solo variantes de ads y ficción declarada** |

### 12.3 Veredicto operativo
- **Uso principal (fase 2+):** multiplicar variantes de hooks sobre creativos de ads YA validados; b-roll imposible de filmar.
- **Uso secundario:** personajes de skits abiertamente ficcionales. **Nunca:** avatar como cara de la marca, avatar-testimonio, avatar cuya gracia sea "parecer real", clonar cara/voz de terceros.
- **% del calendario:** fase 1 (hoy → primer caso real): **0%**. Fase 2 (caso + ads activos): hasta 20%. Revisión trimestral.
- **Condición mínima de calidad si se usan:** es-AR validado por un tercero argentino sin priming ("¿esto qué te parece?"), etiqueta IA proactiva, CERO claims de resultados en boca del avatar.
- **Presupuesto:** suscripciones de avatares CONGELADAS hasta fase 2 (`INFERENCIA` de precios públicos ~USD 30-60/mes ≈ $45-90k ARS — confirmación en §5). En fase 1 ese dinero no tiene tarea: el contenido necesario sale con celular + OBS + CapCut gratis.

---

## 13. Arquitectura de adquisición

Principio rector: **Instagram no puede hacer todo, y no debe intentarlo.** Cada canal tiene UN rol; el sistema funciona porque se encadenan, no porque uno reemplace al resto.

### 13.A Adquisición de complejos

| Canal | Rol exacto | Volumen fase 1 | Costo | Regla |
|---|---|---|---|---|
| **Outbound WhatsApp 1:1** (lista del scraper, scoreada con 02-icp) | **Motor principal.** Abre conversaciones con los scripts de doc6 §1 | 20 contactos/semana (doc5) — 10x debajo del techo estimado de 20-40/día (§5.B.2) | $0 | El scraper arma la LISTA; el contacto es MANUAL, personalizado, de a uno. Reglas duras de §5.B.2: (a) **número WhatsApp Business DEDICADO con warm-up de 7-10 días** — el celular personal del founder queda para clientes y pilotos, jamás para frío; (b) **filtrar la lista contra el Registro No Llame cada 30 días** (Ley 26.951 cubre WhatsApp publicitario — trámite gratuito AAIP); (c) opt-out honrado al instante y registrado en el CRM; (d) nada de blast: 20 buenas > 200 quemadas — la zona es finita y la lista NO es renovable |
| **Visita en frío presencial** (14:00-17:00, doc6 §3) | **Motor de cierre.** La conversión por hora más alta esperada (`HIPÓTESIS` — E2 la mide) | 2-4/semana | Nafta | Con QR de demo impreso y cuenta de prueba genérica cargada |
| **Perfil de IG de TurnoGol** | **Sala de exhibición, NO motor.** Convierte al dueño que te stalkea post-contacto; legitimidad ante referidos | 12 piezas evergreen + 2/semana | $0 | El perfil se juzga por lo que le muestra a UN dueño de Luján que llega escéptico — no por alcance |
| **Meta Ads click-to-WhatsApp geo** (Luján + corredor, radio ~25km, intereses fútbol/negocio) | **Amplificador pago — FASE 2** (post-pitch calibrado, ~día 30-45) | Micro-test | ~$100-150k/mes (el presupuesto entero) | El ÚNICO mecanismo que garantiza que un video llegue a dueños de la zona. Criterios go/no-go en E3 (§17). Ads es donde los creativos del doc 11 finalmente sirven |
| **Referidos** | El multiplicador — cada pago DEBE producir un pedido (doc6 §8) | Desde el 1er pago | Incentivo (REQUIERE INPUT doc6) | Se pide SIEMPRE, con nombre habilitado ("vengo de parte de…") |
| **Alianzas con proveedores del rubro** | Canal dormido que la competencia SÍ usa: el vendedor de césped sintético, el distribuidor de bebidas, el organizador de torneos CONOCEN a todos los dueños de la zona | 1 alianza test en 30 días (E6) | Comisión o reciprocidad | `HIPÓTESIS` con validación externa fuerte: **el formulario de alta de ATC lista "Por un proveedor: ¿Cuál?" como origen de clientes** (verificado 2026-07-19) — el líder ya cosecha este canal; en el corredor está virgen |
| **SEO local (portales de pilotos)** | Cola larga: cada piloto activo = una página "canchas en [zona]" indexable | Pasivo desde piloto 1 | $0 | Verificar indexación real (E8) antes de usar el claim "aparece en Google" |

### 13.B Adquisición de jugadores
**Regla brutal: en fase 1, los jugadores NO se adquieren — se heredan del complejo.** Todo intento de captarlos a escala antes de tener oferta (complejos activos) es gasto sin destino.
- **Dentro de cada piloto** (esto ES la activación, doc4): QR en el mostrador, link en la bio del COMPLEJO, respuesta guardada en el WA del complejo, historias del complejo anunciando "ahora reservás online".
- **El primer jugador de cada complejo llega por el canal del complejo**, no por el de TurnoGol. El IG de TurnoGol no le habla al jugador en fase 1.
- **Post-3 complejos activos en una zona:** se enciende el pilar jugador zonal (§16 P14, ads geo a jugadores de ESA zona, grupos locales de fútbol 5).

### 13.C Demand pull (sin red nacional inexistente)
La versión honesta del "que los jugadores lo pidan":
1. **El QR físico en el mostrador del piloto** es demand pull puro: el jugador que reservó online una vez le reclama al OTRO complejo donde todavía atienden por teléfono. Efecto derrame zonal, gratis, real.
2. **El grupo de WhatsApp del equipo**: la confirmación de reserva se comparte al grupo (comportamiento natural — el que reservó avisa "listo, señé"). Cada reserva expone TurnoGol a 10-15 jugadores de la zona. (Refuerzo de producto sugerido, NO prometer hasta que exista: botón "compartir al grupo" en la pantalla de confirmación — decisión de producto para el founder.)
3. **Post-densidad (≥3 complejos):** contenido zonal a jugadores ("en Luján ya reservás así") + tag al dueño rezagado — el pilar G del doc 11, por fin con piso real.

### 13.D Conversión (del click al pago)
Cadena completa con dueños de cada eslabón:
1. **Landing** — existe (`/para-complejos`, claims verificados §4) pero es INALCANZABLE (G1/G2). Prerequisito Semana 0. Ajuste post-research §5: agregar arriba de todo el mecanismo y la oferta piloto (hoy es genérica-descriptiva).
2. **Lead magnet / diagnóstico** — la **Calculadora del Turno Colgado** (P5, §16): 3 preguntas → SU número mensual perdido → CTA a demo. Versión mínima: planilla/imagen (pieza 3 de doc9, ya diseñada); versión buena: página en el sitio (decisión founder, ~1 día de dev).
3. **Demo** — presencial, 15 min, con SUS canchas cargadas (doc6 §5). La regla de oro sale del feedback real: UN dolor, no el tour (el "tiene muchas cosas" mata ventas).
4. **Piloto** — oferta doc4 con los 4 compromisos del dueño como filtro.
5. **Activación** — primera reserva online real ≤7 días (kit + grilla viva de doc5).
6. **Seguimiento** — toques día 3/7/14/21 (doc4).
7. **Cierre** — día 21, anclado en $ de señas cobradas durante el piloto.

---

## 14. Ofertas

### O1 — Piloto Fundador Acompañado (la oferta central; doc4 endurecida)
- **Segmento:** S1/S5/S8 del corredor.
- **Promesa:** "En 48 horas tu complejo cobra señas por MercadoPago y tus clientes reservan solos por un link. Yo lo dejo andando; vos me das una foto del cuaderno."
- **Entregables:** carga completa (canchas/horarios/precios/fijos), conexión MP presencial, QR + kit de lanzamiento, entrenamiento del encargado (20 min, encuadre §6.3), celular directo del founder, 30 días gratis sin tarjeta.
- **Mecanismo:** el founder absorbe TODA la fricción de arranque (la causa #1 de no-adopción declarada en doc1).
- **Riesgo TurnoGol:** 2-4 hs/piloto + tope 5 simultáneos. **Riesgo cliente:** ~1 hora total y cambiar 2 hábitos (link en bio, responder con el link).
- **Objeciones esperadas:** #3 (seña espanta), #5 (no tengo tiempo) — respuestas en doc7.
- **CTA:** "¿Me pasás la foto del cuaderno hoy y el lunes lo tenés andando?"
- **Evidencia necesaria para la oferta:** ninguna (mecánica + regalo de trabajo). **Métrica:** demo→piloto ≥40%; piloto→activación ≥50%.
- **Razón real para actuar ahora:** los 5 lugares de piloto acompañado del mes (capacidad real, doc4) + "estás entrando primero" con trato fundador.
- **Garantía defendible (nueva):** "Si en 48hs no está andando, el mes gratis arranca cuando ande." Costo cero (el trial ya es gratis), señaliza compromiso, es 100% cumplible.

### O2 — La Calculadora del Turno Colgado (oferta de entrada / diagnóstico)
- **Segmento:** S1/S8 fríos que no aceptan demo de una.
- **Promesa:** "En 2 minutos sabés cuánta plata te llevaron los que no vinieron este año."
- **Entregables:** cálculo con SUS números (precio de turno × colgados/mes × 12) + comparación con el costo del plan + el video P4 (qué pasa con la seña cuando no vienen).
- **Mecanismo:** auto-persuasión (§1 del doc 11 — la idea correcta, ahora con formato de conversión): el número lo produce él, no el vendedor.
- **Riesgo TurnoGol:** ninguno. **Riesgo cliente:** ninguno — por eso abre puertas.
- **Objeciones:** "yo no pierdo tantos" → "dale, hacé la cuenta con TU número, capaz tenés razón" (la duda ya está sembrada).
- **CTA:** "Pasame a cuánto está tu turno y cuántos te colgaron este mes, te devuelvo la cuenta hecha" (en WA, personalizada — versión página web después).
- **Evidencia:** aritmética con inputs del prospecto — inatacable. **Métrica:** % de contactados que responden con sus números (proxy de dolor reconocido).
- **Razón para actuar ahora:** ninguna artificial — es diagnóstico; el "ahora" lo aporta O1 después.

### O3 — Cohorte Fundadora de Luján (los primeros 5-10 de la zona)
- **Segmento:** los mejores scoreados del corredor (10-12 en la lista).
- **Promesa:** "Los primeros complejos de Luján entran con condiciones que después no existen más."
- **Entregables:** O1 + precio fundador (**REQUIERE INPUT** — doc4 opción A: 20-30% off por 6 meses, decisión abierta desde doc4, hay que cerrarla ANTES de la primera demo) + caso de estudio conjunto (números publicados con permiso = descuento ganado) + línea directa al roadmap ("lo que pidas, lo escucho primero").
- **Mecanismo:** estatus de pionero + trato irrepetible verificable (cuando haya 20 clientes, el trato fundador desaparece de verdad — y eso lo hace creíble hoy).
- **Riesgo TurnoGol:** margen menor 6 meses. **Riesgo cliente:** ser el primero (se mitiga con O1: acompañamiento total).
- **Objeciones:** #11 ("¿quién lo usa?") → respuesta honesta de doc7: "estás entrando primero, por eso este trato".
- **CTA:** "Quedan [N real] lugares de la cohorte de Luján. ¿Entrás?"
- **Evidencia necesaria:** el contador de lugares tiene que ser REAL y auditable (si un dueño conoce al otro y comparan, tiene que cerrar).
- **Métrica:** 5 pilotos cohorte en 45 días; ≥2 convertidos a pago al día 60.
- **Razón para actuar ahora:** la única escasez legítima disponible: capacidad de onboarding del founder + condiciones fundador con fecha de caducidad real.

---

## 15. Sistema de contenido (reconstruido)

### 15.1 Reglas del sistema
1. **El contenido sirve a la venta 1:1 o no se produce** (el filtro de doc9, restaurado como ley).
2. **Fase escaparate primero:** 12 piezas evergreen publicadas en 2 semanas → después mantenimiento 2/semana. NUNCA cadencia diaria.
3. **Todo screen-record es del producto real; toda cifra tiene dueño; toda cuenta demo se etiqueta "demo".**
4. **La hora de contenido no compite con la hora de prospección** — se produce en bloque (una tarde cada 2 semanas).

### 15.2 Pilares conectados al funnel

| Pilar | Objetivo | Audiencia | Etapa funnel | Formato | Frecuencia | Métrica | Riesgo principal |
|---|---|---|---|---|---|---|---|
| **A. Demostración** (P1, P2, P4, y R12/R27 del doc 11) | Que el dueño VEA el mecanismo andando | S1/S5/S8 contactados que stalkean | Consideración → demo | Screen-record + voz | 5 piezas evergreen, refresh mensual | % de contactados que mencionan haber visto los videos; reenvíos en follow-up | Mostrar UI vieja tras updates (refresh) |
| **B. Dolor con número** (P5, P6, P7) | Nombrar la plata perdida y el hartazgo | S1/S8 fríos | Apertura → conversación | Founder a cámara + b-roll real | 3 evergreen | Respuestas al mensaje de WA que los usa | Sonar a reproche (el tono pega a la situación, no al dueño) |
| **C. Identidad y objeciones** (P8, P9, R26) | Derretir la objeción antes de que la digan | Prospectos en charla/demo | Consideración → cierre | Founder a cámara | 3 evergreen | Objeción #3 apareciendo menos en demos (CRM) | Polarizar de más (la seña es opcional y configurable — decirlo) |
| **D. Founder / build-in-Luján** (P11) | Ser "el pibe de acá" con cara y nombre | Toda la zona | Confianza transversal | Celular, crudo, real | 1 evergreen + 1/mes | Reconocimiento en visitas ("vos sos el de los videos") | Sobre-narrar el detrás de escena y sub-vender el producto |
| **E. Prueba social real** (P13 cuando exista) | El claim reina: números de un complejo de acá | TODA la lista + re-contactos | Cierre | Video con el dueño real o sus números en pantalla | 1 por piloto exitoso | Tasa de respuesta del re-contacto de 30 días (doc6 §6) | Publicar sin permiso escrito o inflar — mata la zona entera |
| **F. Educación de gestión** (R24, R25) | Autoridad silenciosa | Dueños que siguen sin comprar | Nutrición | Screen-record + voz | 1/mes máx | Saves/reenvíos (proxy débil) | Convertirse en canal educativo que nunca vende |
| **G. Jugador zonal** (P14) | Demand pull local | Jugadores de zonas CON pilotos | Post-activación | Reel + ads geo | CONDICIONADO: ≥3 complejos activos | Reservas online/complejo/semana | Encenderlo antes de tiempo (§8.2) |

### 15.3 Distribución (dónde vive cada pieza)
- **WhatsApp** (canal #1): cada pieza existe primero como video reenviable de <60s, nombrado y a mano en el celular del founder (doc6 los referencia por momento del funnel — mapa en §4 del doc 11, que sigue válido).
- **Perfil IG**: fijadas P1 (qué es), P2 (el sonido), P13 (caso, cuando exista); el resto en grilla. Bio: frase de 10s de doc3 + link + WhatsApp.
- **Ads (fase 2)**: P3, P4, P6 como creativos iniciales del micro-test E3.
- **YouTube (costo cero marginal):** subir las mismas piezas como Shorts + la demo completa de 3-4 min sin cortar (los dueños que evalúan en serio buscan "cómo funciona X" — y el video largo responde de noche lo que el founder respondería de día). `HIPÓTESIS` de bajo costo: 1 hora de trabajo total.

---

## 16. Quince piezas reconstruidas

### 16.0 La decisión de CTA (aplica a todas)
Comparación pedida, resuelta:

| CTA | Fricción | Calificación | Riesgo | Veredicto |
|---|---|---|---|---|
| "Comentá YO" (+ManyChat) | Baja | **Nula** (comenta cualquiera; el dueño 45-60 casi nunca comenta) | Estética bot/infoproducto; conversación atrapada en DM de IG | **Descartado como default** |
| "Mandanos WhatsApp" (link directo wa.me con mensaje precargado) | Baja-media | **Alta** (el que abre WA está en modo conversación; el mensaje precargado ya trae datos) | Ninguno — es el hábitat del dueño | **DEFAULT ORGÁNICO Y ADS** |
| Mensaje precargado calificador: *"Hola! Tengo un complejo de [N] canchas en [zona] y quiero ver TurnoGol"* | Media | **Máxima** (canchas + zona en el primer mensaje) | Un % abandona por tener que editar | **El precargado estándar** |
| "Calculá cuánto perdés" (P5) | Media | Alta (el que calcula, sangra) | Necesita la calculadora hecha | CTA de la pieza diagnóstico |
| "Mirá la demo" (YouTube largo) | Baja | Media | Pasivo | CTA secundario en bio |
| "Reservá una llamada" (Calendly) | **Alta** | Alta | Cultura: el dueño no agenda llamadas, chatea | Descartado fase 1 |
| "Comentá y te escribimos" | Baja | Baja | Depende del DM igual | Solo como red de captura secundaria (se responde a mano) |

**Regla resultante:** todo CTA termina en WhatsApp con mensaje precargado calificador. En orgánico: "link en bio → WhatsApp". En ads: click-to-WhatsApp nativo. El perfil de IG es un pasillo hacia WhatsApp, nunca una sala de espera.

---

**Formato de cada pieza:** Audiencia · Objetivo comercial · Formato/Duración · Primer fotograma · Hook hablado · Texto en pantalla · Guion por segundos · Visuales · Demostración/Evidencia · CTA · Variante orgánica vs ad · Hipótesis psicológica · Métrica de éxito · Condición de descarte.

### P1 — "Te vendieron una cancha mientras dormías" (base R13)
- **Audiencia:** dueño S1/S5 contactado que entra al perfil; luego ad geo.
- **Objetivo:** demo del mecanismo completo en 40s → conversación WA.
- **Formato/Duración:** screen-record real + voz founder · 35-40s · 9:16.
- **Primer fotograma:** reloj del celular marcando 02:14 sobre el flujo de reserva ya abierto.
- **Hook hablado:** "Dos de la mañana. Y tu complejo está vendiendo."
- **Texto en pantalla:** «Te vendieron una cancha mientras dormías.»
- **Guion:** [0-2s] hook. [2-10s] "Terminó el asado y armaron partido para el sábado. Nadie llama a las 2am — pero tu link está despierto." [10-25s] screen-record continuo: link → cancha → horario → pago de seña MP → confirmación. "Eligió, pagó la seña por MercadoPago — directo a TU cuenta — y le llegó la confirmación." [25-33s] "¿Vos? Nada. El sistema no te despierta: te avisa a las 8, con la reserva y la seña adentro." [33-40s] CTA.
- **Visuales:** 100% producto real (cuenta demo etiquetada); cero b-roll IA.
- **Demostración:** el flujo entero sin cortes es la evidencia.
- **CTA:** "Mandanos WhatsApp — link acá abajo — y te lo dejamos andando en tu complejo esta semana."
- **Variante ad:** mismos primeros 25s + cierre "30 días gratis, lo configuramos nosotros" + click-to-WA.
- **Hipótesis psicológica:** beneficio-sin-esfuerzo (la venta dormido) + demostración > afirmación.
- **Métrica:** conversaciones WA/1000 alcanzados (ad); menciones en charlas (orgánico).
- **Descartar si:** en ads, costo por conversación calificada >3x el promedio de otros creativos tras $40k invertidos.

### P2 — "El sonido de la plata" (base R11)
- **Audiencia:** transversal; la firma de la marca.
- **Objetivo:** ancla sensorial (PING = reserva señada) + pieza de apertura del perfil.
- **Formato/Duración:** celular real filmado + screen-record · 20-25s.
- **Primer fotograma:** celular boca arriba en un mostrador real, pantalla apagada.
- **Hook hablado:** (silencio 1s) — PING — "¿Escuchaste? Entró plata."
- **Texto en pantalla:** «Este sonido = una reserva señada.»
- **Guion:** [0-3s] el push suena y enciende la pantalla. [3-12s] "Eso fue una reserva. Sola. Con la seña ya en tu MercadoPago. Nadie atendió ningún teléfono." [12-20s] zoom a la notificación + la grilla pintándose. [20-25s] "Que te suene seguido." + CTA.
- **Visuales:** mostrador REAL (pedir permiso en un kiosco/club amigo si no hay complejo aún — o la mesa del founder: honesto y da igual).
- **Demostración:** push real del sistema.
- **CTA:** "WhatsApp en la bio y lo escuchás en tu complejo."
- **Variante ad:** 15s (hook + push + CTA), formato bumper.
- **Hipótesis:** ancla sensorial repetible — cada video futuro termina con el PING; el dueño lo reconoce en la demo presencial ("¡el sonidito!").
- **Métrica:** reconocimiento espontáneo en demos (anotar en CRM).
- **Descartar si:** nunca — es de costo cero y construye activo de marca. Revisar a 90 días.

### P3 — "Tu complejo merece más que un 11-5..." (base R23 — creativo principal de ads)
- **Audiencia:** S1/S5 con bio de IG "reservas al 11-..." (¡el scraper los identifica!); ad geo.
- **Objetivo:** el segundo posicionamiento (página propia) → WA.
- **Formato/Duración:** screen-record del portal + voz · 30s.
- **Primer fotograma:** una bio de IG genérica (recreada, sin nombre real) que dice "RESERVAS POR WSP 11-5555-...".
- **Hook hablado:** "Tu complejo vale más que un número de teléfono en la bio."
- **Texto en pantalla:** «De 'reservas por wsp' → a tu página propia.»
- **Guion:** [0-3s] hook sobre la bio genérica. [3-8s] "Así atiende hoy la mitad de los complejos: un teléfono y paciencia." [8-22s] transición al portal real: "Esto es TurnoGol: turnogol punto app, barra, TU complejo. Tus canchas, tus fotos, tus precios, tus huecos de verdad — y el botón de reservar con seña." [22-30s] "El link va en la bio, en el estado, en un QR en el mostrador. Tus clientes reservan solos." + CTA.
- **Visuales:** portal demo real navegado despacio.
- **Demostración:** la página existiendo y funcionando.
- **CTA:** precargado calificador (§16.0).
- **Variante orgánica:** cierre "¿Querés ver cómo quedaría el tuyo? WhatsApp en la bio" — invita a la demo personalizada con SUS canchas (doc5), que es la máquina de cerrar.
- **Munición extra para la venta 1:1 (research §5.B.4):** en Luján hay ~16 complejos en Google Maps y casi ninguno tiene página propia — Google linkea sus Instagram hasta en el AI Overview. En la visita, buscarlo EN VIVO con el dueño: *"mirá lo que aparece cuando te buscan"*. Demostración local irrefutable del hueco que esta pieza vende.
- **Hipótesis:** estatus + canalización honesta de la fantasía "me trae clientes" (§3): vidriera, no tráfico.
- **Métrica:** en ads, la métrica reina del micro-test E3; en frío 1:1, tasa de respuesta cuando acompaña al primer mensaje.
- **Descartar si:** costo por conversación >$8-10k ARS sostenido (umbral provisorio a recalibrar con benchmarks §5).

### P4 — "Hoy no vinieron. Mirá lo que pasa." (base R15)
- **Audiencia:** S1/S8; la pieza anti-objeción central.
- **Objetivo:** mostrar la consecuencia mecánica de la ausencia → demo.
- **Formato/Duración:** screen-record + voz · 30s.
- **Primer fotograma:** la grilla con una reserva de las 21:00 y el dedo por tocarla.
- **Hook hablado:** "Reserva de las nueve. No aparecieron. Mirá lo que pasa ahora."
- **Texto en pantalla:** «El turno colgado ya no es gratis.»
- **Guion:** [0-3s] hook. [3-12s] marcar ausencia en vivo: "Un toque. La seña queda cobrada — el que faltó ya pagó su parte." [12-22s] ficha del jugador: "¿Es de los que faltan seguido? A la segunda en 90 días, el sistema le corta las reservas online acá por dos semanas. Solo." [22-30s] "Vos no discutís con nadie. Las reglas las cobra el sistema." + CTA.
- **Visuales:** producto real.
- **Demostración:** el flujo de ausencia completo.
- **CTA:** WA precargado.
- **Variante ad:** sí, segunda del pool E3.
- **Hipótesis:** justicia > plata (§6.2 job emocional 1). El corte automático es el momento de mayor carga emocional del producto.
- **Métrica:** cuál de P1/P3/P4 genera más conversaciones — define el gancho ganador junto con E1.
- **Descartar si:** dueños en demos reaccionan mal al bloqueo ("muy duro con mis clientes") — señal de recalibrar el énfasis (el bloqueo es configurable por diseño del mensaje, no del producto: se cuenta distinto).

### P5 — La Calculadora del Turno Colgado (base R2, reformateada)
- **Audiencia:** S1/S8 fríos; pieza de follow-up +5d (reemplaza al mensaje de doc6 §6 con algo interactivo).
- **Objetivo:** que el dueño produzca SU número → responder con él en WA.
- **Formato/Duración:** founder a cámara + gráficos simples · 30s + imagen fija de apoyo (pieza 3 de doc9).
- **Primer fotograma:** founder con un papel y lapicera: "3 números y te digo cuánto perdiste."
- **Hook hablado:** "¿A cuánto está tu turno? Acordate el número."
- **Texto en pantalla:** «La cuenta que ningún dueño quiere hacer.»
- **Guion:** [0-4s] hook. [4-15s] "Segundo número: ¿cuántos turnos te colgaron este mes? ¿Dos? ¿Cuatro? Tercero: multiplicá por doce. [pausa] Ese número que te quedó en la cabeza es lo que te llevaron el último año los que no vinieron." [15-25s] "No te lo digo yo — lo acabás de calcular vos, con tus números." [25-30s] CTA.
- **Visuales:** founder real, papel real, los números apareciendo escritos a mano.
- **Demostración:** aritmética del espectador (inatacable por diseño).
- **CTA:** "Pasame tus dos números por WhatsApp y te devuelvo la cuenta completa — y cómo hacer que el próximo colgado lo pague el que faltó."
- **Variante ad:** funciona como lead-gen directo (el que responde con números es un lead calificadísimo).
- **Hipótesis:** auto-persuasión + efecto Zeigarnik (la cuenta empezada pide terminarse).
- **Métrica:** % de destinatarios del follow-up que responden con sus números.
- **Descartar si:** <5% responde tras 30 envíos (probar entonces la versión imagen estática simple).

### P6 — "Viernes, 22:00" (fusión R1+R5)
- **Audiencia:** S1; el relato de la herida.
- **Objetivo:** apertura emocional del problema en frío.
- **Formato/Duración:** b-roll REAL (cancha de noche — cualquier cancha iluminada de la zona, pedir permiso) + voz grave · 35s.
- **Primer fotograma:** cancha vacía iluminada de noche, quieta.
- **Hook hablado:** "Viernes. Diez de la noche. La cancha más cara de tu semana está vacía."
- **Texto en pantalla:** «Reservaron el lunes. Hoy no vinieron.»
- **Guion:** [0-4s] hook. [4-14s] "Reservaron el lunes. Les guardaste el mejor horario. Le dijiste que no a otros dos grupos. Y ahora son diez y cuarto y no atienden el teléfono." [14-24s] "¿La seña? No había seña. Había una promesa en el cuaderno. Guardar de palabra es regalar tu mejor horario." [24-35s] "Con TurnoGol, guardar es señar: plata por MercadoPago en TU cuenta al reservar. Si no vienen, la seña queda. Y si les gusta colgar turnos, el sistema los corta solo." + CTA.
- **Visuales:** cancha real de noche; NADA generado.
- **Demostración:** remata con 3s del screen-record de P4 (la seña quedando).
- **CTA:** WA precargado.
- **Variante ad:** sí — tercera del pool E3.
- **Hipótesis:** aversión a la pérdida narrada en segunda persona + "guardar es señar" como eslogan de la categoría nueva (§11).
- **Métrica:** ads: conversaciones; orgánico: reenvíos.
- **Descartar si:** pierde contra P1/P3/P4 en el pool de ads por 3x tras presupuesto justo.

### P7 — "23:47" (base R3, producción mínima)
- **Audiencia:** S5 (el rehén del teléfono).
- **Objetivo:** humor de identificación → apertura de conversación.
- **Formato/Duración:** captura de pantalla de un chat recreado scrolleando + voz · 25s.
- **Primer fotograma:** hora del celu 23:47 y una catarata de mensajes "¿tenés a las 9?".
- **Hook hablado:** "¿A qué hora contestaste el último '¿hay cancha?' anoche?"
- **Texto en pantalla:** «Tu segundo trabajo: recepcionista nocturno.»
- **Guion:** [0-3s] hook. [3-15s] lectura actuada del ida y vuelta: "'¿Tenés a las 9?' No, a las 10. '¿Y a las 11?' … '¿Me guardás?' … '¿Al final me guardaste?'" [15-25s] "Mandá UN link. El que quiere, entra, ve los huecos posta, paga la seña y listo. Tu WhatsApp vuelve a ser tuyo." + CTA.
- **Visuales:** chat recreado (sin datos reales), tipografía de WA reconocible.
- **Demostración:** corte de 3s al link mostrando huecos.
- **CTA:** WA precargado (la ironía de pedir WhatsApp para arreglar WhatsApp es intencional y se puede decir: "sí, por WhatsApp — el último que vas a necesitar para turnos").
- **Hipótesis:** identificación por costumbre (availability heuristic: TODOS vivieron ese chat anoche).
- **Métrica:** respuestas cuando acompaña al primer mensaje de WA frío en S5.
- **Descartar si:** los dueños responden al video pero defendiendo su sistema actual (señal de tono reproche — regrabar más cómplice).

### P8 — "Señar no es desconfiar" (base R22)
- **Audiencia:** prospectos post-demo con la objeción #3 viva; y contenido de perfil.
- **Objetivo:** derretir la objeción central ANTES o DESPUÉS de que aparezca.
- **Formato/Duración:** founder a cámara · 30s.
- **Primer fotograma:** founder frente a cámara, fondo cancha, gesto de "hablemos en serio".
- **Hook hablado:** "El cine no te guarda la butaca de palabra. ¿Por qué vos sí?"
- **Texto en pantalla:** «Pedir seña = laburar en serio.»
- **Guion:** [0-4s] hook. [4-14s] "El hotel no te guarda la pieza de palabra. El cine no. La cancha del viernes a las 22 es lo más caro que vendés en la semana… y se reserva con un 'dale, quedate tranquilo'." [14-24s] "Pedir seña no es desconfiar de tus clientes: es respetar tu negocio. Y con TurnoGol ni la pedís vos — la cobra el sistema, por MercadoPago, cuando reservan. Y si un cliente de años prefiere sin seña: la apagás para quien quieras, la manejás vos." [24-30s] CTA suave.
- **Visuales:** founder real.
- **Demostración:** afirmación de mecánica (la config de seña existe: % configurable, apagable — doc10).
- **CTA:** "¿Vos cobrás seña? Contame por qué sí o por qué no — WhatsApp abajo." (CTA-conversación: abre charla de dolor directa).
- **Hipótesis:** polarización controlada + prueba por analogía de categorías que el dueño YA acepta (cine/hotel).
- **Métrica:** conversaciones iniciadas con opinión (las mejores: llegan calientes).
- **Descartar si:** genera debates hostiles de JUGADORES en comentarios (audiencia equivocada dominando la pieza) — pasarla de perfil a uso 1:1 exclusivo.

### P9 — "NO pongas TurnoGol" (base R20)
- **Audiencia:** S1/S5; pieza de perfil con mejor hook del lote.
- **Objetivo:** pattern interrupt legítimo (dentro del mundo del dueño) → perfil → WA.
- **Formato/Duración:** founder a cámara, ritmo rápido · 30s.
- **Primer fotograma:** founder con la palma a la cámara ("pará").
- **Hook hablado:** "No pongas TurnoGol en tu complejo. En serio."
- **Texto en pantalla:** «NO pongas TurnoGol si…»
- **Guion:** [0-3s] hook. [3-22s] "No lo pongas si te gusta atender el celu a las 23:45. Si disfrutás perseguir al que 'después te confirma'. Si el tachón del cuaderno te da paz. Si preferís que el turno colgado lo pague tu bolsillo y no la seña del que faltó." [22-30s] "¿Nada de eso te divierte? Entonces sí: WhatsApp acá abajo, 30 días gratis, lo dejamos andando nosotros." 
- **Visuales:** founder + cortes de 1s a cada escena (todas filmables con un celu en 20 min).
- **Demostración:** ninguna (pieza de hook puro — por eso va rodeada de P1/P4 en el perfil).
- **CTA:** WA precargado.
- **Hipótesis:** reactancia psicológica (el "no" desafía) + auto-selección del calificado.
- **Métrica:** CTR al perfil y de ahí a WA (medible en ads; proxy orgánico: visitas al perfil esa semana).
- **Descartar si:** atrae respuestas de curiosos no-dueños en volumen (señal de hook demasiado ancho).

### P10 — "El cuaderno se jubila" (base R7, producción 100% real)
- **Audiencia:** S1 nostálgico; humor cómplice.
- **Objetivo:** enemigo común sin faltar el respeto → recordación.
- **Formato/Duración:** cuaderno REAL filmado con cariño (luz cálida, primeros planos de tachones) + voz · 30s.
- **Primer fotograma:** cuaderno de espiral gastado, cerrado, sobre el mostrador. Título encima.
- **Hook hablado:** "Este cuaderno laburó más que todos nosotros."
- **Texto en pantalla:** «20 años de servicio. Se jubila con honores.»
- **Guion:** [0-4s] hook. [4-15s] "Veinte años anotando turnos. Sobrevivió lluvias, mudanzas y a tu encargado. Pero nunca cobró una seña, nunca te avisó quién te colgó tres turnos, y si se moja… fuiste." [15-25s] "No lo tires: enmarcalo. TurnoGol hace todo lo que él hacía — y cobra la seña, avisa al celu y cierra la caja." [25-30s] "Jubilalo con honores." + CTA.
- **Visuales:** cuaderno real (comprarlo usado o pedirlo en la primera visita — un cuaderno REAL de un complejo real, con permiso, sería oro).
- **Demostración:** corte de 3s a la grilla.
- **CTA:** WA precargado.
- **Hipótesis:** humor de duelo (se despide con cariño lo que se reemplaza) — la única forma segura de tocar el cuaderno (doc3).
- **Métrica:** reenvíos y comentarios de dueños (es la más compartible del lote para la audiencia correcta).
- **Descartar si:** lecturas de burla en comentarios de dueños (no de jugadores) — retirar y usar solo 1:1 con dueños ya en confianza.

### P11 — "Por qué estoy armando esto acá" (NUEVA — founder story)
- **Audiencia:** toda la zona; la pieza de confianza.
- **Objetivo:** ponerle cara, nombre y código postal a TurnoGol — el activo que ningún competidor puede copiar.
- **Formato/Duración:** celular en mano, caminando por Luján (la plaza, una cancha), crudo, sin música épica · 45-60s.
- **Primer fotograma:** founder caminando, cámara frontal, luz de día.
- **Hook hablado:** "Soy de Luján y estoy armando un sistema para los complejos de acá. Te cuento por qué."
- **Texto en pantalla:** «El sistema de señas para canchas — hecho acá.»
- **Guion:** [0-5s] hook. [5-25s] "Jugué toda la vida en canchas de acá y de la zona. Y siempre lo mismo: para reservar, rogá que atiendan; para el dueño, teléfono todo el día y grupos que no aparecen. Armé TurnoGol para eso: el que reserva deja seña por MercadoPago, el dueño lo ve en el celu, y la caja cierra sola." [25-45s] "Estoy arrancando con los primeros complejos de Luján y la zona. Los configuro yo, uno por uno, y el primer mes es gratis. Si tenés un complejo — o conocés al dueño de tu cancha — escribime. Soy [nombre], y esto recién empieza." 
- **Visuales:** Luján REAL reconocible (la basílica de fondo vale oro local).
- **Demostración:** honestidad como evidencia ("estoy arrancando" dicho de frente desarma la objeción #11 antes de que exista).
- **CTA:** WA personal + "etiquetá al dueño de tu cancha" (acá el tag SÍ tiene sentido: pieza LOCAL para audiencia LOCAL).
- **Variante ad:** geo-radio 15km — probablemente el mejor ad de confianza para frío local (E3 lo testea contra P3).
- **Hipótesis:** similaridad/unidad (Cialdini): "es de acá" es el atributo más persuasivo disponible; y build-in-public local convierte la debilidad (nuevo, sin clientes) en historia ("estás entrando primero").
- **Métrica:** menciones espontáneas en visitas ("vos sos el pibe del video"); tags de jugadores locales.
- **Descartar si:** nunca por métricas — solo si el founder no se siente cómodo a cámara (entonces: versión voz en off caminando, sin hablar a cámara).

### P12 — "Busco 5 complejos en Luján" (NUEVA — la oferta como contenido)
- **Audiencia:** dueños del corredor; pieza de conversión directa.
- **Objetivo:** pilotos de la cohorte fundadora (O3).
- **Formato/Duración:** founder a cámara, formato anuncio-honesto · 40s.
- **Primer fotograma:** founder, papel en mano con "5" escrito.
- **Hook hablado:** "Busco cinco complejos de Luján y la zona. Cinco, no más."
- **Texto en pantalla:** «Busco 5 complejos (Luján, Rodríguez, Moreno, Pilar, Mercedes).»
- **Guion:** [0-4s] hook. [4-18s] "Estoy lanzando TurnoGol: reservas online con seña por MercadoPago directo a tu cuenta. A los primeros cinco los dejo andando yo — cargo tus canchas, tus precios, tus fijos, te conecto MercadoPago y te traigo el QR impreso. Vos me das una foto del cuaderno." [18-30s] "¿Por qué cinco? Porque los acompaño personalmente y no me da el cuero para más. 30 días gratis, sin tarjeta. Si no te sirvió, me lo decís en la cara y listo." [30-40s] "Si tenés un complejo en la zona, WhatsApp acá abajo con cuántas canchas tenés. Cuando se llenan los cinco, se llenaron."
- **Visuales:** founder real; el "5" tachándose a medida que se llenen (actualizable — y ESO es prueba de escasez real).
- **Demostración:** la oferta misma, verificable en cada término.
- **CTA:** WA precargado calificador.
- **Variante ad:** idéntica con presupuesto chico geo — es EL ad de lanzamiento zonal.
- **Hipótesis:** escasez real + riesgo invertido (todo el riesgo lo toma TurnoGol) + especificidad geográfica como filtro y como señal de seriedad.
- **Métrica:** consultas calificadas (canchas + zona) por semana; pilotos firmados.
- **Descartar si:** los 5 cupos tardan >6 semanas en llenarse → el problema no es la pieza, es el pitch o el ICP: volver a E1.

### P13 — Plantilla del caso real (se llena con el piloto 1)
- **Audiencia:** TODA la lista fría + re-contactos + perfil fijado.
- **Objetivo:** el claim reina — desbloquea el re-contacto de 30 días de doc6.
- **Formato/Duración:** dueño real a cámara en SU complejo (o sus números en pantalla con foto del complejo si no quiere cámara) · 40s.
- **Estructura fija:** [0-5s] "Soy [nombre], de [complejo], acá en [zona]." [5-15s] el ANTES: cómo manejaba los turnos y qué le dolía (SUS palabras, sin guionar de más). [15-30s] los números REALES del primer mes: reservas online, $ en señas cobradas, [dato que él elija destacar]. [30-40s] su frase + "si tenés un complejo, preguntale a [founder]".
- **Reglas duras (de doc9 pieza 5):** permiso escrito, números reales, cero inflado — un caso desmentido en un asado mata la zona entera.
- **CTA:** WA.
- **Hipótesis:** prueba social LOCAL (el único tipo que mueve a este ICP: "lo usa el de acá a 10 cuadras").
- **Métrica:** tasa de respuesta del re-contacto que la usa vs el mensaje sin caso.
- **Condición:** NO EXISTE hasta que exista. Ninguna versión "recreada", "proyectada" ni "ilustrativa".

### P14 — "El que señó, juega" (base R30 corregida — jugador, CONDICIONADA)
- **Audiencia:** jugadores de zonas con ≥3 complejos activos (ads geo o orgánico local).
- **Objetivo:** demand pull zonal + normalizar la seña del lado jugador.
- **Formato/Duración:** chat de grupo recreado + voz · 25s.
- **Primer fotograma:** chat "FÚTBOL JUEVES ⚽" con el clásico "¿al final somos?".
- **Hook hablado:** "'¿Seguro que vamos?' murió."
- **Texto en pantalla:** «Reserva señada = partido que se juega.»
- **Guion:** [0-3s] hook. [3-15s] "'¿Confirmaron?' '¿Somos diez?' 'Uy, se bajó Lucas.' Todo eso muere cuando la reserva tiene seña: **uno reserva y seña por el grupo — como siempre pagó uno y después arreglan — pero online y en dos minutos.** El que puso plata, va." [15-25s] "En [zona] ya se reserva así. Mandáselo al que se baja siempre — él ya sabe quién es." (con lista de complejos activos en pantalla, con permiso).
- **Corrección aplicada:** desaparece "cae la seña entre todos" (split inexistente) → "uno seña por el grupo, como siempre".
- **CTA:** "Reservá en [complejos activos] — link en bio."
- **Hipótesis:** humor de tribu + norma social nueva ("señar = seriedad") que de paso PROTEGE al complejo cliente.
- **Métrica:** reservas online en complejos de la zona la semana de pauta vs anterior.
- **Condición de activación:** ≥3 complejos activos en radio 20 min. **Descartar si:** tras 2 semanas de pauta zonal no mueve reservas medibles.

### P15 — "El Veedor" (avatar IA declarado — FASE 2, esqueleto)
- **Audiencia:** dueños ya conscientes de TurnoGol (retargeting/perfil).
- **Objetivo:** variedad creativa en fase 2 SIN gastar la cara del founder; demostrar que el avatar tiene un lugar — como FICCIÓN declarada.
- **Concepto:** "El Veedor de Complejos" — personaje IA obviamente estilizado (traje de árbitro de los 80, bigote imposible, voz engolada) que "inspecciona" complejos y cobra infracciones: *"Reserva de palabra… TARJETA AMARILLA. Cuaderno mojado ilegible… ROJA DIRECTA."* Cierra: "Este complejo necesita TurnoGol."
- **Por qué funciona donde el avatar-presentador falla:** nadie tiene que creer que es real — el chiste ES que no lo es. Cero uncanny valley (se busca caricatura), cero riesgo de "trucho" (es ficción declarada), etiqueta IA de Meta puesta sin costo narrativo.
- **Duración:** 20-30s por "inspección"; serializable (fatiga baja: cambia la infracción, no el personaje).
- **CTA:** WA precargado.
- **Hipótesis:** humor recurrente serializado construye recordación de marca a costo marginal bajo — el rol correcto de la IA generativa acá.
- **Métrica:** retención de video (>50% a mitad) + conversaciones atribuibles.
- **Condición de activación:** fase 2 (≥1 caso real publicado + ads activos). **Descartar si:** dos episodios con retención <30% — el personaje no prendió, no insistir.

---

## 17. Backlog de experimentos (ICE adaptado)

Score = Impacto × Confianza × Facilidad (1-10 c/u; máx 1000). "Confianza" = probabilidad de que el experimento produzca una LECCIÓN clara, no de que "salga bien". Ordenado por score; los 4 primeros entran en los 30 días.

| # | Experimento | Hipótesis | Canal / Mensaje | Costo | Métrica primaria | Éxito / Fracaso | Duración | Riesgo de interpretación | Next step según resultado | I×C×E |
|---|---|---|---|---|---|---|---|---|---|---|
| **E1** | **Gancho ganador en 20 conversaciones discovery** | El dolor que más abre conversación es el turno colgado (doc3); challenger: control/grilla (señal de las charlas informales §3) | WA frío modo discovery (doc6 §1a), rotando la pregunta de apertura: A) "¿cuántos te colgaron este mes?" B) "¿cómo controlás las reservas del día?" C) "¿tu página propia para reservas?" | $0 (horas) | Tasa apertura→charla de dolor por variante + QUÉ dolor nombran ELLOS primero | Éxito: un gancho gana por ≥1.5x y 10+ charlas hechas. Fracaso: <10% de respuesta total (problema de mensaje o lista, no de gancho) | 2 semanas | N chico por variante (~7); leer DIRECCIÓN, no significancia; el dolor nombrado espontáneamente pesa más que la tasa | Gancho ganador → doc3 se reordena (o ratifica) y TODO el contenido/ads hereda | 10×8×9=**720** |
| **E2** | **Visita fría vs WA frío** | La visita presencial convierte a demo ≥3x por hora invertida (doc5 lo asume; nadie lo midió) | 10 visitas 14-17h vs 20 WA fríos, misma semana, misma zona | Nafta | Demos agendadas por hora invertida por canal | Éxito: un canal gana claro → se vuelca la agenda. Ambos <5% → problema de pitch, volver a E1 | 2 semanas | Sesgo de selección (se visita lo cercano/lindo); registrar score ICP de cada uno | Ganador se lleva 70% de las horas de prospección | 9×8×8=**576** |
| **E3** | **Micro-test Meta click-to-WhatsApp geo** (FASE 2 — gate: pitch calibrado por E1 + prerequisitos técnicos cerrados) | Con una ráfaga bien concentrada se compran ≥10 conversaciones de dueños reales del corredor | **Ráfaga de 8-10 días a USD 5-8/día** (§5.B.1: goteo de 30 días queda debajo del piso de aprendizaje de Meta), UN adset, radio ~25km Luján+corredor, formato Reels (el CPM más barato), creativos P3 vs P12, click-to-WA con precargado calificador | ~$100-150k por ráfaga (el presupuesto de un mes entero, gastado en 10 días) | **Costo por conversación CALIFICADA** (respondió canchas+zona) | Referencia §5.B: conversación cruda LATAM ~$340-1.030 (confianza media); umbral para la CALIFICADA: éxito ≤$10.000; fracaso >$25.000 sostenido agotada la ráfaga | 10 días de pauta + 1 semana de lectura | Atribución de WA débil: contar A MANO en CRM con origen `ads`; los leads de jugadores NO cuentan (descarte manual); una sola ráfaga = una lectura direccional, no un benchmark propio | Éxito → segunda ráfaga mes 3 con el creativo ganador (si hay capacidad de pilotos). Fracaso → 100% outbound y reintentar post-caso-real | 9×7×7=**441** |
| **E4** | **El perfil-escaparate funciona** | La mayoría de los dueños contactados stalkean el IG antes de responder | Preguntar al final de cada charla: "¿llegaste a ver algo de lo que subimos?" + registrar visitas al perfil en semanas de outbound vs sin | $0 | % de charlas que vieron el perfil; correlación respuesta/visita | Éxito: ≥40% lo vio → el escaparate paga su mantenimiento. <15% → recortar aún más la inversión en perfil | Continuo (pregunta fija del CRM) | Autoreporte impreciso; las visitas al perfil no distinguen dueños de jugadores | Si funciona: mantener 12 piezas frescas. Si no: perfil mínimo y toda hora a outbound | 6×7×10=**420** |
| **E5** | **Calculadora vs mensaje plano en follow-up +5d** | El follow-up que pide SUS números responde más que el que da un número genérico | WA follow-up: A) mensaje actual doc6 §6 B) P5/calculadora ("pasame tus 2 números") | $0 | Tasa de respuesta al follow-up por variante | Éxito: B ≥1.5x A con 15+ envíos por rama | 3 semanas | El follow-up hereda la calidad del primer contacto; comparar solo dentro de la misma cohorte | Ganador se vuelve el follow-up estándar de doc6 | 7×7×8=**392** |
| **E6** | **Canal proveedor** | El vendedor de césped/bebidas/torneos de la zona puede abrir 3+ puertas calientes | 3 conversaciones con proveedores locales; oferta: comisión por cliente convertido o reciprocidad (REQUIERE INPUT incentivo) | $0-bajo | Intros efectivas a dueños en 30 días | Éxito: ≥1 proveedor produce ≥2 intros que llegan a charla | 4 semanas | Una intro tibia no es una recomendación — registrar la calidad ("de parte de" vs presentación real) | Éxito → formalizar el canal con 1 pager para proveedores | 7×6×8=**336** |
| **E8** | **SEO local del portal del piloto 1** | El portal del complejo indexa y aparece para "[complejo] + [zona]" en <30 días (y desbloquea el claim "aparece en Google") | Publicar portal piloto 1 + Search Console + pedir al dueño linkearlo en bio/Maps | $0 | Indexación (sí/no) + posición para el nombre del complejo; bonus: aparición en "cancha futbol 5 luján" | Éxito: indexado y 1ra página para su nombre en 30 días | 30 días desde piloto 1 | Rankear por NOMBRE propio es lo esperable; NO extrapolar a "canchas en luján" (competitivo) sin datos | Éxito → claim desbloqueado + argumento de venta B (página propia) se refuerza | 6×7×8=**336** |
| **E9** | **YouTube pasivo** | La demo larga (3-4 min) responde de noche lo que el founder respondería de día | Subir demo completa + Shorts de P1/P4; link en bio y en follow-ups "mandame info" | $0 (1 hora) | Menciones en charlas ("vi el video largo") + watch time | Éxito: ≥3 prospectos/mes lo mencionan | 60 días | Vistas ≠ prospectos; solo cuentan menciones en el CRM | Si funciona: la demo larga entra al mensaje +2d de doc6 | 5×6×9=**270** |
| **E7** | **El Everest (vanity check — solo si el founder insiste)** | H0 del red team: 0 conversaciones de dueños calificados | 1 video Everest publicado orgánico, sin presupuesto | Horas de generación IA | Conversaciones de DUEÑOS atribuibles (no vistas, no likes, no jugadores) | Éxito: ≥2 dueños del corredor inician conversación citándolo. Esperado: 0 | 2 semanas | Las vistas van a parecer éxito — la métrica es SOLO dueños en WA; acordar el umbral ANTES de publicarlo | Confirmada H0 → se cierra la discusión de avatares-hype con datos propios y $0 de pauta | 2×9×6=**108** |

**Anti-métricas (no deciden NADA en ningún experimento):** reproducciones, likes, seguidores, comentarios de no-dueños, CPL sin calificación. **Proxies temporales mientras no haya volumen** (con su limitación explícita): dolor nombrado espontáneamente en charlas (proxy de mensaje; sesgo de cortesía), visitas al perfil (proxy de interés; no distingue audiencia), respuestas con número de canchas (proxy de calificación; el único confiable de la lista).

---

## 18. Plan de validación de 30 días

Recursos reales: 1 founder con trabajo full-time aparte, ~$150k ARS/mes, corredor Luján-oeste. Presupuesto del mes 1: **~$20-40k total** (QR impresos, nafta, dominio si falta) — **$0 en ads, $0 en herramientas de video, $0 en ManyChat.** El resto se ahorra para E3 (mes 2).

### Semana 0 (días 1-3) — DESTAPAR LA PUERTA [IMPRESCINDIBLE — sin esto, nada de lo demás existe]
| # | Tarea | Resultado verificable |
|---|---|---|
| 0.1 | Configurar DNS de turnogol.app → Vercel | `turnogol.app` carga desde un celular cualquiera |
| 0.2 | Sacar Vercel Authentication de producción | La landing y `/precios` son públicas |
| 0.3 | Rotar/cargar credenciales MP productivas | OAuth de un complejo de prueba conecta |
| 0.4 | **Smoke test de dinero REAL**: crear tenant propio, reserva real, seña REAL con plata propia ($1000 de seña alcanza), verificar acreditación en MP y push | Captura del flujo completo — que además es la primera munición de contenido |
| 0.5 | Cuenta demo pulida ("Complejo La Vía, Luján" ficticio, ETIQUETADO demo) con grilla realista | Lista para demos y screen-records |

### Semana 1 (días 4-10) — Lista + primeras conversaciones + escaparate mínimo
- **Scraper → lista de 100 complejos del corredor**, scoreados con 02-icp (0-12). `docs/gtm/data/` nace acá (git-ignoreado si tiene teléfonos — Ley 25.326, regla de doc10). [IMPRESCINDIBLE]
- **E1 arranca: 10 primeros contactos discovery** (doc6 §1a, rotando ganchos A/B/C) + 2 visitas frías (E2). [IMPRESCINDIBLE]
- **Producción bloque 1 (una tarde):** P2 (el sonido — sale del smoke test 0.4), P1 (2am), P5 (calculadora). Celular + OBS + CapCut. [IMPRESCINDIBLE — son la munición de los follow-ups +2d]
- Perfil IG: bio nueva (frase 10s de doc3 + WA) + 6 piezas fijadas/publicadas (P1, P2, P5 + 3 fotos/placas simples). [RECOMENDADO]
- Google Business Profile de TurnoGol (gratis, 20 min, apoya "es de acá"). [RECOMENDADO]

### Semana 2 (días 11-17) — Volumen + primeras demos
- 10 contactos nuevos + follow-ups +2/+5 programados (con P1/P5 como munición). [IMPRESCINDIBLE]
- 2-3 visitas frías más (E2 completa su muestra). [IMPRESCINDIBLE]
- **Meta: 2+ demos hechas** (presenciales, con SUS canchas cargadas — doc5). Cierre con oferta O1/O3. [IMPRESCINDIBLE]
- Producción bloque 2: P11 (founder Luján) + P12 (busco 5 complejos) — se publican y se fijan. [RECOMENDADO]
- Gate del día 14 (adelantado de doc8): ¿el dolor que nombran coincide con el gancho? → ajustar doc3 si hace falta ANTES de quemar el resto de la lista.

### Semana 3 (días 18-24) — Pilotos y activación
- **Meta: 1-2 pilotos firmados y CARGADOS en 48h** (doc4: foto del cuaderno → sistema andando; MP conectado EN la visita). [IMPRESCINDIBLE]
- Kit de lanzamiento puesto: QR en mostrador, link en bio del complejo, respuesta guardada en SU WhatsApp. Grilla viva (doc5). [IMPRESCINDIBLE]
- Perseguir el Aha: **primera reserva online real de un desconocido ≤7 días del piloto** — si al día 5 no llegó, sentarse con el dueño a publicar el link en sus historias (la demanda del complejo YA existe; hay que enchufarla). [IMPRESCINDIBLE]
- 10 contactos nuevos + follow-ups (la máquina no para por los pilotos). [IMPRESCINDIBLE]
- E6: 3 charlas con proveedores. [RECOMENDADO]

### Semana 4 (días 25-30) — Evidencia + decisiones
- Capturar TODO del piloto: primera reserva (screenshot con permiso), señas cobradas, cita del dueño. Si los números acompañan → P13 (caso) versión 1, aunque sea una placa con capturas. [IMPRESCINDIBLE]
- E8: portal del piloto a Search Console. [RECOMENDADO]
- **Retro del día 30 con la tabla de doc8** y decisiones: (a) gancho ganador (E1) → congela doc3; (b) canal ganador (E2) → asigna horas; (c) go/no-go E3 (ads mes 2) — SOLO si: prerequisitos ✓, pitch calibrado ✓, ≥1 piloto activo ✓; (d) ¿el precio fundador cerró demos o dio igual? [IMPRESCINDIBLE]

### Clasificación de todo lo demás
- **PREMATURO** (mes 2+, con condiciones): HeyGen/avatares (fase 2, §12), pilar jugador (≥3 activos), "Llegó a Luján" (≥2 pilotos), ads (E3 gate), cadencia 2/semana de contenido (post-12 piezas).
- **DISTRACCIÓN** (no hacer, con fecha de re-evaluación 90 días): Everest fuera de E7, TikTok, seguidores, ManyChat, "todo el país", nuevos features de producto que pidan los NO-clientes, blog/SEO de contenido nacional (el SEO que importa ahora es el LOCAL de los portales).
- **Gate para escalar producción de video en serio (calendario 2/semana+, herramientas pagas):** E4 confirma que el escaparate influye + ≥1 caso real publicado + E3 con costo/conversación aceptable. Hasta que esas tres luces estén verdes, cada hora de video le roba a la única máquina que factura: la de conversaciones.

---

## 19. Métricas

### 19.1 El tablero (una fila semanal en el sheet — extiende la tabla de doc8 con lo de ads)

| Nivel | Métrica | Target 30d (`HIPÓTESIS` doc5/doc8) | Proxy si no hay volumen |
|---|---|---|---|
| Actividad | Contactos nuevos/sem | 20 | — (es input, no output) |
| Conversación | Tasa respuesta WA frío | ≥25% | Dirección por gancho (E1) |
| Conversación | **Costo por conversación de dueño calificada** (cuando haya ads) | ≤$10k provisorio [§5.B] | En orgánico: horas por conversación |
| Calificación | % conversaciones con canchas+zona | ≥60% | — |
| Conversión | Charlas → demos hechas | ≥40% | — |
| Conversión | Demos → pilotos | ≥40-50% | Si <40%: oferta u objeción sin respuesta (doc8 gates) |
| **Activación** | **Piloto → 1ra reserva online real ≤7d** | ≥60% | LA métrica del negocio entero (doc1 error #1) |
| Activación | Reservas online / complejo activo / semana | acordada con el dueño (doc4: él pone el número) | — |
| Revenue | Pilotos → pago (día 21-30) | ≥50% | — |
| Retención | m1→m2 de pagos | 100% temprano (N chico) | Señal cualitativa: ¿el encargado cierra caja 5+ días/sem? |
| Eficiencia | Horas founder / cliente pago | registrar desde día 1 | El "CAC" real de esta fase es en horas |

### 19.2 Payback (marco honesto, sin LTV inventado)
Con precio fundador ~$60-68k/mes efectivo (si se aplica -20/-30% sobre Complejo $85k): cada cliente pago cubre ~el presupuesto mensual entero de marketing. **Regla de oro de esta fase: UN cliente pago nuevo por mes ya paga toda la máquina.** El LTV no se proyecta hasta tener 3+ meses de retención real (cualquier número antes es ficción).

---

## 20. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | **Pilotos que no activan** (jugadores no usan el link) | Media | **Letal** (doc1: error #1; churn a 60 días) | Kit obligatorio + grilla viva + compromisos del dueño como filtro (doc4) + kill criteria día 14 |
| 2 | **Burnout del founder** (trabajo full-time + 20 contactos + 5 pilotos + producto + soporte) | **Alta** | Alto | El plan recorta TODO lo que no es outbound/pilotos (por eso el video diario murió); tope 5 pilotos es sagrado; si algo se cae, se cae el contenido, nunca el follow-up |
| 3 | Expectativa marketplace ("me va a traer gente") comprada en silencio | Alta | Alto (churn diferido) | Objeción #13 dicha PROACTIVAMENTE en la demo; el sí del piloto incluye entender qué NO hace |
| 4 | Free tiers locales (Korus ≤2 canchas, Don Potrero Amateur) presionan el segmento chico | Media | Medio | No pelear S2; el ICP-1 (3-6 canchas) necesita caja/abonados/grilla que los free no dan |
| 5 | ATC reacciona (ajusta su lista ARS o pauta fútbol en la zona) — y en las franjas de 3 y 6 canchas YA es más barato que TurnoGol (§5.1 corregido) | Media (la franja 3 es hoy, no un escenario) | Medio-alto (3-6 canchas ES el ICP-1) | No pelear por precio: mecanismo + setup + trato fundador; el precio fundador de doc4 tapa la brecha de la franja 3; decisión de boundaries en §21.11 |
| 6 | Ban del número de WhatsApp por outbound | Media si se hace mal | Alto (el canal principal) | Reglas §13.A: lista scoreada, 1:1 manual, personalización, volumen 20/sem; número secundario de respaldo; reglas duras finales en §5.B |
| 7 | Inflación vs precio ARS: cada ajuste de lista es una conversación de retención, y toda la categoría local está en pesos (no hay diferencial cambiario que explotar — §5.1 corregido) | Alta (estructural) | Medio | Revisión trimestral de pricing (doc4 §5), comunicada con anticipación a los clientes; nunca prometer precio "congelado" |
| 8 | Claims regulatorios (art. 8 Ley 24.240: lo publicitado integra el contrato) | Baja con este doc | Alto | La tabla §10 es vinculante para todo el marketing; nada fuera de la columna "forma segura" |
| 9 | El founder vuelve a la pulsión de videos virales cuando el outbound incomode (doc1 error #3 — es el riesgo psicológico central de este plan) | Media-alta | Alto | La regla de doc1 queda como KPI negativo: una semana con 10 posts y 0 conversaciones = semana fracasada; E7 disponible para cerrar la discusión con datos |
| 10 | Un caso temprano inflado o sin permiso quema la zona | Baja (con reglas) | **Letal zonal** | Regla doc9 pieza 5: permiso escrito + números reales o no existe |

---

## 21. Decisiones que el founder debe tomar (REQUIERE INPUT — nada de esto lo decide la IA)

1. **Precio fundador** (abierto desde doc4; bloquea la PRIMERA demo): recomendación del red team = opción A de doc4 (20-30% off por 6 meses, primeros N, con fin explícito). Decidir número exacto y N.
2. **Incentivo de referidos** (doc6 §8): sugerencia: 1 mes bonificado por referido convertido. Decidir.
3. **Go/no-go E3 (ads mes 2)** cuando el gate se cumpla — y monto exacto ($100k vs $150k).
4. **Timing de Semana 0**: ¿los 4 gaps técnicos (DNS, auth wall, MP, smoke test) se cierran esta semana? Es la única dependencia dura de todo el plan. (Si querés, la sesión de trabajo la hacemos juntos — es medio día.)
5. **Calculadora como página** (`turnogol.app/calculadora`): versión WhatsApp manual arranca YA sin dev; la página es ~1 día de laburo. ¿Cuándo?
6. **Botón "compartir al grupo" en la confirmación de reserva** (detectado en §13.C): decisión de PRODUCTO (chica, alto leverage de demand pull). ¿Entra al backlog?
7. **Split payment de la seña** (la corrección de R29): ¿backlog de producto para v1.5, o nunca? (No afecta marketing actual — ya corregido el claim.)
8. ~~Actualizar doc2~~ **✅ HECHO (2026-07-19, con OK del founder):** pricing ARS + comparación por franja + debilidad 4 reforzada (flujo de alta con comercial verificado) + los 7 locales + regla de método. Ver [doc2](../spec/doc2_competitive_teardown.md).
9. ~~Destino del doc 11~~ **✅ HECHO (2026-07-19, con OK del founder):** banner SUPERSEDED puesto al tope del doc 11 (incluye las advertencias de R29 y R18). Queda como biblioteca de guiones; los 15 de §16 son la versión operativa.
10. **La zona exacta del primer barrido**: Luján ciudad completo primero vs corredor entero de una (recomendación: Luján + Mercedes primero — densidad de relación > cobertura; Pilar/Moreno tienen más complejos pero también más ruido competitivo y más viaje).
11. **Boundaries de planes vs ATC (nuevo, sale de tu captura — §5.1):** ATC corta 1-3/4-6/7+; TurnoGol 1-2/3-5/6+. Resultado: con 3 canchas TurnoGol cuesta $85k contra $66k de ATC (+29%), y con 6, $115k contra $104k — las dos franjas caen dentro del ICP-1. Opciones: (a) no tocar nada y confiar en que el precio fundador (-20/30% × 6 meses ≈ $59.5-68k) tapa la brecha mientras se construyen casos — la más simple; (b) mover Predio a 1-3 canchas (canibaliza Complejo: decisión de revenue, no de marketing); (c) crear escalón intermedio. Decisión de negocio pura — REQUIERE INPUT. Dato para decidir: el scraper va a decir cuántos complejos de EXACTAMENTE 3 y 6 canchas hay en el corredor (si son pocos, la opción (a) alcanza).

---

## 22. Recomendación final

**Ejecutá los docs 01-08 que ya tenías — con las tres mejoras que este red team les agrega — y usá el contenido como los docs 01-08 siempre dijeron: de apoyo.** Las mejoras: (1) posicionamiento afilado y validado contra el mercado real (§11: anti-turno-colgado + página propia — y SIN pelea de precio contra ATC, que la corrección de §5.1 dejó como terreno perdedor), (2) una biblioteca de 15 piezas reconstruidas con CTA correcto (§16), (3) un sistema de experimentos con umbrales que convierte 30 días de laburo en decisiones (§17-18).

El plan original de este esfuerzo (doc 11) era una respuesta buena a la pregunta equivocada. La pregunta no era "¿cómo hago videos viralizables?" — era **"¿cómo consigo mis primeros 5 complejos activos en Luján?"**. Y la respuesta a ESA pregunta ya estaba escrita en tu propio repo hace semanas (docs 01-08); lo que faltaba era: destapar el producto (Semana 0), la lista (el scraper), y salir.

---

# LA VERDAD INCÓMODA

**1. ¿El enfoque de llenar Instagram con videos IA tiene probabilidades reales de vender TurnoGol?**
No. Como motor de ventas, las probabilidades son cercanas a cero en los próximos 90 días, por matemática de audiencia, no por calidad de contenido: Instagram no segmenta orgánico por geografía (confirmado con fuente primaria de Meta, §5.B.6), tu cuenta tiene 0 seguidores, y los dueños de complejos del corredor son unas decenas de personas que el algoritmo no tiene ninguna razón para elegir. Los reels van a juntar vistas de jugadores de todo el país — gente que no puede comprarte nada. Y el precedente del propio rubro remata el argumento: el fundador de ATC creció con puerta a puerta en frío, AgendaPro con boca a boca, y de ~30 SaaS verticales investigados ninguno tiene evidencia de haber crecido con contenido en etapa temprana (§5.B.5). El contenido SÍ vende en tres momentos concretos: cuando el dueño que contactaste te stalkea, cuando le reenviás la pieza justa en el follow-up, y cuando pagás para ponérselo enfrente (ads geo). Los tres momentos requieren ~12 piezas buenas, no 180 reels.

**2. ¿Qué parte podría funcionar?**
Las piezas de demostración (el sonido del push, la reserva de las 2am, la ausencia que deja la seña) — porque muestran un mecanismo que nadie más del mercado muestra (§5.3, verificado). La calculadora como follow-up. P11/P12 (founder local + busco 5 complejos) como ads geo-segmentados en el mes 2. Y la disciplina de claims del doc 11, que era su mejor parte y este doc endurece.

**3. ¿Qué parte probablemente sea una pérdida de tiempo?**
La cadencia diaria, el funnel "comentá YO"+ManyChat, el pilar jugador nacional, el hype "llegó a Argentina / la app del momento" (que además resultó ser el cliché más quemado del rubro — §5.2), y TODO el esfuerzo en avatares hiperrealistas en fase 1. El Everest es la versión cara de procrastinar prospección.

**4. ¿Cuál es el principal cuello de botella comercial actual?**
Ni el contenido ni la marca: **el producto no es alcanzable y no hay ni una conversación comercial registrada.** turnogol.app no resuelve DNS, producción tiene muro de login, MercadoPago productivo no está cargado, y `docs/gtm/data/` no existe. El cuello de botella es una puerta cerrada y cero puertas golpeadas. Medio día de trabajo técnico + 20 mensajes por semana lo destraban. Todo lo demás de este documento es secundario a eso.

**5. ¿Qué haría en los próximos 30 días si TurnoGol fuera mi empresa y mi dinero?**
Semana 0 entera un solo objetivo: que turnogol.app cargue, cobre una seña real de $1.000 con mi propia plata, y me suene el push. Después: lista de 100 con el scraper, 20 contactos por semana con el script discovery rotando ganchos, 2-3 visitas frías por semana a la siesta, 3 videos grabados con el celular en una tarde, y cerrar 2 pilotos gratis acompañados con la oferta de doc4. Meta única e innegociable del mes: **una reserva online real, de un desconocido, con seña acreditada en el MercadoPago de un complejo de Luján que no es mío.** $0 en ads, $0 en HeyGen. Los $150k del mes quedan en el bolsillo para el test de ads del mes 2 — que solo ocurre si el pitch ya cerró demos en persona.

**6. ¿Qué tendría que comprobarse antes de invertir fuerte en contenido, anuncios o avatares?**
Cuatro luces, en orden: (a) tasa de respuesta del outbound ≥15-25% — prueba que el mensaje abre puertas; (b) demo→piloto ≥40% — prueba que la oferta convierte; (c) piloto→primera reserva online ≤7 días en ≥60% — prueba que el producto activa (la luz más importante y la única que depende de jugadores reales); (d) UN caso con números reales y permiso. Con las cuatro verdes, cada peso de ads compra amplificación de algo que funciona. Antes, compra amplificación de una hipótesis — y los avatares ni siquiera entran a la conversación hasta que los ads existan (§12).

**7. ¿Cuál es la estrategia más fuerte que no estás viendo por estar obsesionado con los videos virales?**
**La densidad zonal como producto.** Tu ventaja imposible de copiar no es ningún feature ni ningún formato de video: es que vivís a 15 minutos de tus primeros 50 clientes y podés tomar mate con cada uno. Si en 6 meses 10-15 complejos del corredor usan TurnoGol: los dueños se lo cuentan entre ellos en los asados (referidos gratis), los jugadores de la zona aprenden que "acá se reserva con seña" (la norma social trabaja para vos), el SEO local de 15 portales te hace dueño de "cancha en Luján" en Google, el soporte presencial es un moat que ATC no puede pautar, y recién AHÍ la fantasía del marketplace — la que los dueños te piden y hoy no podés prometer — empieza a ser verdad A ESCALA BARRIO, que es la única escala en la que un marketplace arranca. Todos los videos del mundo no compran eso. Cien mates sí. Y de paso: el canal que nadie del rubro está usando no es ningún formato de IA — es el proveedor de césped sintético que ya conoce a todos tus prospectos por el nombre.
