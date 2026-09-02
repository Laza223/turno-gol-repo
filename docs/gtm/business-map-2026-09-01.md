# Business Map — TurnoGol (2026-09-01, v2 con respuestas del founder)

Construido sobre docs (`docs/spec/doc1-4,10`, `docs/gtm/*`, `docs/planning/*`, `docs/launch/*`), código (6 reconocimientos de `src/`) y las 16 respuestas del founder del 2026-09-01. Sin auditoría, sin recomendaciones. Secciones: marco de capas / sé / infiero / respuestas del founder clasificadas / founder vision / reporte de cierre.

**Leyenda de clasificación** (aplica a §3 y a las notas `[v2]` del resto del documento):

| Etiqueta | Significa |
|---|---|
| `FACT` | Verificado en repo/prod, o declarado por el founder como estado de hoy |
| `FOUNDER DECISION` | Decisión firme del dueño. El Board puede cuestionarla, no la reemplaza |
| `PROVISIONAL DECISION` | Decisión tomada para poder avanzar, explícitamente abierta a que el Board la revise |
| `HYPOTHESIS` | Creencia sin validación de campo suficiente |
| `UNKNOWN` | Dato que nadie tiene hoy. Se obtiene, no se inventa |

---

## 0. Marco de lectura: cuatro capas (regla del founder, 2026-09-01)

Todo análisis de TurnoGol separa estas capas y **la ambición de la 4 nunca justifica una mala decisión en la 1 o la 2**:

| Capa | Qué es | Qué del mapa cae acá |
|---|---|---|
| **1. CURRENT REALITY** | Lo que existe y está validado hoy | §1 entero: SaaS de gestión, 2 tenants en prod (ambos internos), 4 circuitos de plata probados con $100, **0 clientes pagos, 0 validados**, cero prueba social |
| **2. WEDGE** | La propuesta que consigue los primeros clientes y genera actividad real | `HYPOTHESIS` abierta entre A/B/C/D (§3.8); canal founder-led 1:1 en Luján; piloto acompañado; densidad zonal |
| **3. EXPANSION** | Capas que tienen sentido recién con densidad | Lo que el repo ya exploró y difirió: grupo del organizador, carrera automática del jugador, goles 1-tap, tarjetas compartibles, wrapped, waitlist, torneos (construido tras flag), reseñas (existe) |
| **4. NORTH STAR** | Infraestructura digital del fútbol amateur; distribución / traer jugadores | §4. Visión del founder, no validada, **no promesa de venta** |

---

## 1. LO QUE SÉ (respaldado por el proyecto)

### 1.1 Qué es
SaaS B2B2C de gestión para **complejos de fútbol amateur en Argentina** (fútbol-only, deliberado). Dos productos sobre un monolito Next.js multi-tenant: panel admin del complejo + portal web del jugador (sin app nativa). Un jugador reserva por link `turnogol.app/[slug]`, deja seña por MercadoPago **a la cuenta MP del complejo**, y el dueño lo ve en una grilla en tiempo real desde el celu.

### 1.2 Usuarios (doc3)
| Persona | Rol técnico | Job principal | Paga |
|---|---|---|---|
| **Marcelo**, dueño, 43, 3-8 canchas, GBA/interior, tech 2.5/5 | `admin` | "Que no me cuelguen más turnos" + ver la plata del día | **Sí** |
| **Rodrigo**, encargado, 24, tech 4/5 | `manager` (sin Config ni Equipo) | Confirmar un turno en 15 s con gente esperando | No |
| **Tomás** (espontáneo) / **Agustín** (fijo), jugadores | `player`, cross-tenant, magic link | Encontrar cancha y reservar en 2 min sin llamar | No |
| **Lazar** | super-admin (`/super-admin`, impersonación) | Operar el SaaS | — |

Doc3 declara que Rodrigo es "la causa #1 de fracaso de adopción" si no adopta.

### 1.3 Quién paga y modelo de negocio
- **Solo paga el complejo**: suscripción mensual o anual por cantidad de canchas, cobrada por MercadoPago Suscripciones con el token master (`MP_TURNOGOL_ACCESS_TOKEN`).
- **TurnoGol no toca ninguna otra plata**: la seña va 100% a la cuenta MP del complejo vía OAuth Checkout Pro (`payment.service.ts` sin `application_fee`; grep de `fee/commission/marketplace_fee` = 0). Cantina, deudas, inscripción a torneos: 100% del complejo. Jugador no paga nada a TurnoGol.
- Justificación del modelo (doc4 §1): "validado por ATC Sports, MRR predecible, comisión por reserva descartada por volatilidad e incentivo desalineado".
- Planes vigentes (migr. 071, 2026-08-07, sync con `plans-data.ts`). **`[v2]` Estado: `HYPOTHESIS` comercial, no precio validado (§3.5)**:

| Plan | Canchas | Mensual | Anual (por mes, -20%) | ATC ref. 2026-08-07 |
|---|---|---|---|---|
| Predio | 1-3 | $63.000 | $50.400 | $71.000 |
| Complejo | 4-6 | $99.000 | $79.200 | $111.000 |
| Estadio | 7+ | $129.000 | $103.200 | $145.000 |

- Cortes alineados a propósito con los de ATC para comparar franja contra franja (~11% abajo en las tres). Todos los planes tienen todas las funciones; el único diferenciador es `max_courts`.
- **IVA no implementado en código**: el checkout cobra el precio pelado. `[v2]` La situación fiscal del founder está sin definir (§3.5): **no asumir ni +21% ni que el precio publicado es fiscalmente correcto**.
- Unit economics declarados (doc4 §11, con precios viejos): infra ~$150-300k ARS/mes, break-even 10-20 clientes.

### 1.4 Propuesta de valor (según docs, con fecha)
- Doc1 §5: "único software exclusivo para fútbol que centraliza el cobro de abonados, elimina no-shows con señas y da visibilidad total, configurable en <20 min".
- GTM 03 (jul-2026), frase central: *"El que reserva deja una seña por MercadoPago. Si te cuelgan el turno, la seña queda para vos, y al que se ausenta seguido el sistema le corta solo las reservas online por dos semanas."*
- Red team §11.2: posicionamiento PRINCIPAL = **"el sistema de señas para canchas de fútbol"**; SECUNDARIO = "tu complejo con página propia"; ENEMIGO = la reserva de palabra.
- Inversión de pilares 2026-08-07 (`analisis-rubro` §2): pilar 1 pasa a **control de la plata**. `[v2]` **Degradada por el founder a `HYPOTHESIS`**: "se cambió sin suficiente evidencia de campo" (§3.8). Hoy ninguna de las dos tesis está validada.

### 1.5 Funcionalidades principales (código)
Grilla realtime · reserva online con seña (% configurable 10-100, **default 30**, apagable) · hold de 6 min · política de cancelación (default 12 h) con `canceled_refunded`/`canceled_no_refund` · no-show con softban 14 días a la 2.ª ausencia en 90 días · abonados (`price_per_session`, cobro registrado a mano) · caja (apertura/cierre, día operativo con cutoff) · cantina con stock y fiados · "Plata en la calle" (deudas) · devoluciones (registro manual, **sin reembolso por API**) · clientes con 5 etiquetas cerradas · métricas (ausencias, ingresos, top horarios, reporte mensual, CSV) · torneos detrás de flag (global `false`) · equipo sin límite de usuarios · push al dueño con horario silencioso · resumen diario · portal público con fotos R2, reseñas, grilla · `/explorar` con filtros y mapa · export ARCO del jugador.

### 1.6 Superficie comercial pública
- **Home `/`**: le habla al **jugador**. H1 "Reservá tu cancha al instante." Buscador. StatsBar "24/7 · 0 apps · 3 min · 100% seña por MP". Único punto para dueños: `OwnerBanner` "Llevá tu complejo al siguiente nivel… Tu complejo, vendiendo canchas 24/7" → `/para-complejos`.
- **`/para-complejos`**: H1 **"Tu complejo, siempre lleno. Reservas que no paran."** Sub: "El que reserva deja una seña por MercadoPago: si te clavan, la seña queda para vos…". 6 features, 4 pasos, StatsBar "100% seña a tu MP · 24/7 · 20 min · 30 días gratis". Final: "Probá 30 días sin costo. Sin tarjeta, sin compromiso. Si no ves resultados, lo dejás."
- **`/precios`**: H1 **"Lo que te deja un turno, una vez al mes."** Chips: 30 días gratis sin tarjeta · mes a mes · sin comisión. Selector por canchas (diff sin commitear: **default anual**, ver §3.14). **Calculadora del Clavo**. "Todo incluido" (12 ítems, incluye "exportación de datos"). FAQ de 7 con JSON-LD FAQPage.
- **Editorial**: `/vs/alquila-tu-cancha`, `/alternativas-alquila-tu-cancha`, 1 post de blog (jul-2026). Comparan contra ATC, Don Potrero, Turnito, EasyCancha. **No mencionan Clubo ni Dónde Juego como competidores actuales** (§3.15).
- **Nav**: Funciones · Precios · Blog · Ingresar · **Empezar gratis** → `/register`. Footer: `hola@turnogol.app`. Sin redes sociales. Soporte: WhatsApp oficial (constante en `src/lib/contact.ts`) en artículos, `/suspended`, `/reactivar`.
- Sin tarjeta en ningún punto del registro. Tema dark forzado en `(business)`.

### 1.7 CTAs (texto → destino)
"Empezar gratis" / "Empezar 30 días gratis" → `/register` (header, footer, 3 cards de plan, ambos FinalCta) · "Registrá tu complejo" (home) → `/para-complejos` · "Ver planes y precios" → `/precios` · "Ver cómo funciona" → `/para-complejos` · "Contactanos por WhatsApp" (artículos) · "Elegir plan" (banner trial) → `/settings/facturacion` · "Actualizar pago" / "Reactivar" → `/reactivar`.

### 1.8 Registro → onboarding → activación (código)
1. `/register`: nombre, apellido, email, **teléfono**, password. Sin nombre de complejo, sin canchas, sin tarjeta. Confirmación por email obligatoria.
2. Wizard de 4 pasos: complejo → horarios (+`closes_next_day`) → canchas (un precio uniforme por cancha, tope por plan) → **primera reserva manual** (opcional). Cierre `/onboarding/listo` + compartir por WhatsApp.
3. Al crear el tenant: `trialing`, 30 días, plan `predio`, `requires_deposit=false`, email `trial_welcome`. **MercadoPago NO está en el wizard**.
4. Post-wizard: checklist en `/dashboard`, tour, worker de abandono a las 24 h, avisos de trial **solo día 7 y día 1**.
5. **Día 31: `trialing → blocked` directo, sin acceso** (código actual). `[v2]` Contradice la `PROVISIONAL DECISION` de read-only (§3.9).
6. Aha moment: `activation.first_online_booking` (`created_by_staff IS NULL`). `[v2]` **`FACT`: nunca ocurrió con un jugador desconocido en un complejo de terceros** (§3.4).

### 1.9 Flujo de reserva del jugador (código)
`/explorar` o link → `/[slug]` (ISR 5 min) → `/[slug]/reservar` → LoginGate (email + nombre + apellido + términos; magic link o Google) → confirmar → sin seña: `confirmed`; con seña y MP: `pending_payment` → Checkout Pro → webhook → `/reserva/[id]/exito` con QR. Emails: confirmación, cancelación, hold vencido. **Sin recordatorio 24 h, sin WhatsApp**. Portal: mis reservas (cancelar con política, reclamar devolución al complejo, reseña), favoritos, perfil, export, borrar cuenta. **El jugador no ve ni gestiona sus abonos**.

### 1.10 Experiencia del dueño (código)
7 espacios: Hoy (solo admin) · Grilla · Caja (cantina, deudas, devoluciones, productos) · Clientes (jugadores, abonados) · Torneos (flag) · Métricas · Configuración (solo admin). Facturación: activar/cambiar/cancelar plan (cancelar = texto libre, sin oferta de retención), historial en vivo de MP, conectar MP, aviso del plazo de acreditación de 18 días. **Dentro del panel no hay link a soporte, manual ni WhatsApp**.

### 1.11 Objeciones que el proyecto intenta resolver
GTM 07 (15 objeciones) y FAQ de `/precios`: "no van a usar una app" · "la seña espanta" · "mis fijos" · "¿cuánto sale?" · "no tengo tiempo" · "¿y si se cae?" · "AFIP" (no) · "¿y mis datos?" · "¿quién lo usa?" (honesto) · "¿me traés jugadores?" (**no**) · "¿avisa por WhatsApp?" (no). `[v2]` Las 3 que surgieron espontáneamente en demos reales: **fijos, cancelaciones, precio** (§3.10).

### 1.12 Señales de confianza en la superficie
"Sin tarjeta" · "30 días gratis" · "sin permanencia" · "sin comisión" · "la seña va directo a tu MP" · "tus datos son tuyos" · "hecho para fútbol en Argentina" · "20 minutos" · "soporte dedicado" · política de no-show publicada. **No hay** testimonios, logos, casos, números de clientes ni prueba social. `[v2]` Sigue siendo `FACT`: 0 clientes.

### 1.13 Adquisición
- **Código**: SEO (sitemap por complejo, JSON-LD, `llms.txt`, robots), `/explorar`, 3 piezas editoriales. **Sin** analytics de terceros, **sin** UTM/referrer. Solo `track.*` → `analytics_events`.
- **Docs**: founder-led, presencial, hiperlocal (Luján), 20 contactos/semana, demo con las canchas del prospecto, piloto acompañado (setup 48 h, QR, 5 pilotos máx). Ads e IG viral descartados hasta 4 luces verdes. `@turnogol`: 9 seguidores al 30/7. `[v2]` **`FACT`: ~90% del esfuerzo fue producto, ~10% ventas; el plan GTM no se ejecutó sistemáticamente** (§3.3).

### 1.14 Retención
- **Código**: 24 templates, push, workers de trial/dunning, `/reactivar`, resumen diario opt-in, "Plata en la calle". `past_due` 7 d → `suspended` 7 d → `blocked` → 90 d `churned` → borrado. **Sin** NPS, encuesta, changelog ni oferta de retención.
- **Docs**: doc3 lista qué haría abandonar a Marcelo (falla un viernes a la noche, el empleado no adopta, quilombo con señas, onboarding >1 h).

### 1.15 Referidos y efectos de red
- **Referidos**: no existe programa en código. Script manual (GTM 06 §8), columna `referido_por` en CRM. `[v2]` Incentivo: `HYPOTHESIS` preferida del founder (§3.7).
- **Red**: `players` cross-tenant; reseñas públicas; favoritos privados; `/explorar`; torneos tras flag. **Sin** perfil/ranking de jugador, sin "otros complejos cerca", sin compartir reserva al grupo. Veto: no vender "te traemos jugadores".

### 1.16 Estado real de lanzamiento
`PRODUCTION-READY.md` (30/8): 4 circuitos de plata probados con $100 reales; trial vencido verificado end-to-end. `[v2]` **`FACT` (founder, 2026-09-01)**: **0 complejos pagando, 0 clientes validados; los 2 tenants en prod (Elite, titi) son internos**; `titi` = testing, no tracción. **Primer piloto real arranca 2026-09-02** (§3.1). 2 demos reales hechas (§3.2).

### 1.17 Contradicciones internas — estado tras las respuestas
| # | Contradicción | Estado v2 |
|---|---|---|
| 1 | H1 de `/para-complejos` "Tu complejo, siempre lleno" = eslogan que el red team y `analisis-rubro` prohíben por comoditizado | **PERMANECE**. Se agrava: "Reservas que no paran" / "vendiendo canchas 24/7" (home) rozan la promesa de distribución que el founder declara North Star y "no vender hasta que ocurra" |
| 2 | Pilar 1 "plata" (ago) vs web que abre por seña | **SE TRANSFORMA**: ya no es choque entre dos decisiones; las dos son `HYPOTHESIS`. Lo que queda: **toda la superficie pública (hero, StatsBar "100% seña", calculadora, `llms.txt`) afirma la tesis A como propuesta central** mientras el founder la degrada a hipótesis con un insight de rechazo cultural (§3.8) |
| 3 | `vs-alquila-tu-cancha.mdx:40` → `wa.me/5491100000000` | **PERMANECE** (bug de contenido) |
| 4 | GTM 03/07 citan $55/85/115k; vigentes $63/99/129k | **PERMANECE** (drift docs; irrelevante mientras el precio sea hipótesis) |
| 5 | GTM 09 apunta a `docs/marketing/` inexistente | **CERRADA**: declarada no canónica, no se reconstruye (§3.12) |
| 6 | Doc4: 10 emails de trial (hay 2); dunning 60 d (código 90) | **PERMANECE** (drift docs↔código) |
| 7 | MRR super-admin suma `price_monthly` a anuales | **PERMANECE** (código); pasa a importar si el anual se empuja (§3.14) |
| 8 | `PlanSelector` default anual vs `pricing_y_oferta` §14 | **CERRADA como decisión**: es `FOUNDER DECISION` intencional (§3.14). Queda como drift: el doc de julio quedó viejo |
| 9 `[nuevo]` | Código día 31 = `blocked` sin acceso vs `PROVISIONAL DECISION` read-only | **NUEVA** (código↔decisión, pendiente de diseño) |
| 10 `[nuevo]` | `/precios` FAQ y "Todo incluido" prometen "exportás tus datos" / "exportación de datos"; en código solo existe CSV de métricas (`analiticas/ExportCsvButton.tsx`) y export ARCO del jugador; doc2/doc3 (27/8) dicen "sin exportación del complejo" | **NUEVA** (web promete más que el código) |
| 11 `[nuevo]` | Oferta pública y GTM 04: "30 días gratis"; primer piloto real: **3 meses gratis** a cambio de uso, feedback y exposición | **NUEVA**: los términos del caso cero difieren de la oferta publicada (founder lo encuadra como piloto de aprendizaje, no descuento) |
| 12 `[nuevo]` | Precio fundador propuesto por GTM 04, `pricing_y_oferta` y red team §21.1 | **CERRADA**: `FOUNDER DECISION` = no existe precio fundador (§3.6). Tres docs quedan desactualizados |

---

## 2. LO QUE INFIERO — estado tras las respuestas

1. **Producto por delante de la distribución** → `FACT` confirmado (90/10). Ya no es inferencia.
2. **La venta real es 1:1 y la web es sala de exhibición** → sigue siendo inferencia; el founder confirma que los primeros clientes son founder-led (§3.9).
3. **Dos posicionamientos conviviendo** → transformado: hay **cuatro candidatos** y ninguno validado (§3.8).
4. **"Sale menos que ATC" en limbo** → sigue, y se amplía: el benchmark ATC-only queda invalidado por mandato del founder (§3.15) y el precio es hipótesis (§3.5).
5. **El aha moment depende de un tercero** → `FACT`: nunca ocurrió (§3.4). El piloto de mañana es la primera oportunidad de observarlo.
6. **Sin palanca de monetización secundaria** → sigue; las ideas viven en §4.4 como North Star, no como plan.
7. **Efecto de red = promesa futura** → sigue; el founder lo declara explícitamente (capa 4).
8. **titi como primer complejo real** → **REFUTADA**: testing interno.
9. **Sin soporte en panel, coherente con "mi celular directo"** → sigue; ahora con la restricción de horario laboral (§3.11) la escalabilidad del soporte presencial es más acotada aún.

---

## 3. RESPUESTAS DEL FOUNDER (2026-09-01), CLASIFICADAS

### 3.1 Estado comercial
- `FACT` — 0 complejos pagando. 0 clientes comerciales validados. `titi` fue testing interno: **no es cliente ni tracción**.
- `FACT` — El primer piloto real arranca **2026-09-02**. Términos: **3 meses gratis** a cambio de uso real, feedback directo y cierta exposición/promoción en redes.
- `FOUNDER DECISION` — Los 3 meses se tratan como **experimento, no como evidencia de PMF**. El piloto debe medir: activación, adopción del dueño y empleados, uso real, reservas, problemas encontrados, valor percibido y willingness-to-pay.

### 3.2 Conversaciones y demos
- `FACT` — 2 demos reales con dueños. Reacción "extremadamente positiva" en ambas; el piloto 1 "viene esperando hace tiempo" y mostró entusiasmo.
- `FOUNDER DECISION` (de clasificación) — Se registra como **SEÑAL CUALITATIVA POSITIVA**, no como validación de willingness-to-pay ni de retención.
- `FACT` — Volumen de entrevistas insuficiente para validar posicionamiento.

### 3.3 Ejecución GTM
- `FACT` — ~90% del esfuerzo fue producto/programación, ~10% ventas/distribución. La mayor parte del plan GTM (docs 01-08) no se ejecutó de manera sistemática.
- `PREGUNTA AL BOARD` — Evaluar explícitamente un **feature freeze parcial**: solo bugs, blockers de adopción y aprendizajes derivados de clientes; el founder cambia radicalmente el foco a distribución y ventas.

### 3.4 Reserva real de un desconocido
- `FACT` — **No ocurrió**. `activation.first_online_booking` no está validado como comportamiento de mercado.

### 3.5 Situación fiscal / IVA
- `FACT` — Pendiente externo: resolver régimen fiscal con contador antes del primer cobro. El piloto no paga durante 3 meses: no habrá ingreso de ese complejo.
- `FOUNDER DECISION` — Antes del primer cliente pago se resuelve con un contador, dentro del régimen legal que corresponda.
- `RESTRICCIÓN AL BOARD` — No sugerir evasión ni estructuras societarias artificiales para evitar obligaciones.
- `HYPOTHESIS` — **El pricing actual ($63k/$99k/$129k) es hipótesis comercial, no precio validado.** No asumir +21% ni asumir que los precios publicados son fiscalmente correctos.

### 3.6 Precio fundador
- `FOUNDER DECISION` — **No hay precio fundador reducido.** TurnoGol sale con su oferta comercial normal. Los 3 meses del piloto son piloto de aprendizaje, no descuento comercial.
- `PREGUNTA AL BOARD` — Cuestionar si esta decisión perjudica o beneficia la adquisición inicial. **No asumir que existe founder pricing.**

### 3.7 Referidos
- `HYPOTHESIS` (prioridad alta para el founder) — Referrals es una de las hipótesis de crecimiento más importantes.
- `HYPOTHESIS` (insight de mercado, sin registro formal) — Los dueños se conocen, tienen grupos de WhatsApp entre ellos y en algunas zonas coordinan precios. Potencial de adquisición B2B por recomendación entre pares.
- `HYPOTHESIS` (incentivo preferido) — *"Cada 2 complejos que invites y se conviertan en clientes pagos, te bonificamos 1 mes de tu plan."* Reglas: no premiar registros; el evento válido exige **activación real + conversión a pago**.
- `PROVISIONAL DECISION` — Operarlo manualmente, sin construir feature.
- `PREGUNTA AL BOARD` — Incentivo óptimo · 1 vs 2 referidos · crédito vs mes gratis · unilateral vs double-sided · momento exacto de acreditación · riesgo de abuso · potencial viral en grupos de dueños.

### 3.8 Pilar principal / posicionamiento — **ABIERTO, EL MÁS IMPORTANTE**
- `HYPOTHESIS` — Wedge no validado entre: **A** señas/no-shows · **B** control de la plata · **C** control operativo del complejo · **D** otra propuesta aún no descubierta.
- `FACT` (founder) — El cambio de agosto (A → B) se hizo **sin suficiente evidencia de campo**. Queda degradado de decisión a hipótesis.
- `FACT` (insight de campo, N=1) — Un dueño mostró **rechazo cultural a exigir pago anticipado vía MercadoPago**: lo asocia a una experiencia negativa; obligar a pagar antes de disfrutar puede sentirse avaro o desconfiado. **No asumir que "pagar por MP" es automáticamente un beneficio** para el dueño ni para sus jugadores.
- `HYPOTHESIS` — La seña puede aceptarse mejor si: es opcional · el complejo decide cuándo usarla · monto bajo · ≈ la parte de **un** jugador del equipo · encuadrada como **compromiso anti-ausencia**, no como cobro anticipado de toda la cancha.
- `PREGUNTA AL BOARD` — Cuestionar el **default actual del 30%** (`tenant.service.ts:45`); evaluar si ~10% tiene mejor encaje psicológico.
- `HYPOTHESIS` (insight a auditar) — Muchos complejos **pagan empleados** para hacer manualmente buena parte de lo que TurnoGol automatiza/ordena, y aun así el dueño sigue con errores, descontrol y dolores de cabeza.
- `HYPOTHESIS` (tercera tesis, **no aprobada**) — *"El complejo funciona bajo control aunque el dueño no esté encima."* Engloba reservas, empleados, caja, fijos, cancelaciones, deudas y operación.
- `PREGUNTA AL BOARD` — Identificar qué dolor tiene mayor: frecuencia · intensidad · costo económico · willingness-to-pay · diferenciación · capacidad de demostrarse rápido.
- `FOUNDER DECISION` — Distribución / traer jugadores sigue siendo **NORTH STAR, no promesa actual**. No vender "TurnoGol te trae reservas" hasta que ocurra.

### 3.9 Trial y lifecycle
- `PROVISIONAL DECISION` — **Sin tarjeta al alta** por ahora (founder-led, minimizar fricción). Reevaluar cuando exista adquisición self-service y data de conversión.
- `PROVISIONAL DECISION` — **Día 31: no borrar ni bloquear destructivamente.** Pasar a experiencia limitada/read-only: sin nuevas reservas online · información visible · facturación/reactivación accesibles · exportación disponible · pagar/reactivar restaura rápido. (Código hoy: `blocked` sin acceso, ver §1.8.) `PREGUNTA AL BOARD` (Retention/Pricing): diseño exacto.
- `FOUNDER DECISION` — **Pausa de temporada baja: no construir ahora.** `HYPOTHESIS` futura; reconsiderar solo si clientes pagos muestran churn estacional repetido.

### 3.10 Feedback espontáneo (N=2)
- `FACT` — Temas que los dueños mencionaron/preguntaron sin inducir: cómo manejar jugadores/turnos **fijos** · qué pasa si **cancelan** · **cuánto cuesta**.
- `FACT` — MercadoPago/seña **no fue percibido automáticamente como ventaja** por uno de los dueños.
- `FOUNDER DECISION` (método) — No sobreponderar la seña porque técnicamente funcione bien. Observar qué dolores nombran sin inducir respuestas.

### 3.11 Restricciones del founder
- `FACT` — Empleo de lunes a viernes ~09:00-17:00. Dedica muchas horas fuera de ese horario (ha llegado a 6+ h adicionales de programación por día). Intención: dejar el empleo al alcanzar ingresos para vivir.
- `FACT` — Sin resistencia a vender; dispuesto a vender todos los días si el negocio lo justifica. Conoce automatización, agentes de IA, outbound y marketing digital.
- `FACT` — La restricción principal para venta presencial es el **horario laboral** (las 14-17 h que GTM 05 recomienda para visitas caen dentro del empleo).
- `UNKNOWN` — Presupuesto mensual. **No asumir los $150k ARS** del red team.
- `PREGUNTA AL BOARD` — Estrategia founder-led compatible con esa restricción.

### 3.12 `docs/marketing/`
- `UNKNOWN` — Por qué no existe (posible limpieza/reorganización).
- `FOUNDER DECISION` — Toda referencia a esa carpeta es **NO CANÓNICA**. No reconstruir salvo información realmente necesaria.

### 3.13 Geografía
- `FOUNDER DECISION` (preferencia) — Empezar por **Luján** (donde vive el founder).
- `UNKNOWN` — Conteo confiable y actualizado de complejos scoreados. Obtenible por scraping/investigación.
- `HYPOTHESIS` (estratégica, preferida) — **Densidad local antes que cobertura nacional.** No expandir solo porque técnicamente se puede llamar a todo el país.
- `FACT` (ambición) — Eventualmente expandirse por Argentina, incluido outbound remoto.
- `PREGUNTA AL BOARD` — Cuál es el **gate para salir de Luján**.

### 3.14 Pricing anual
- `FOUNDER DECISION` (marketing, intencional) — Destacar el anual mostrando el equivalente mensual con descuento (precio percibido menor; técnica común en SaaS). Explica el diff sin commitear de `PlanSelector`.
- `HYPOTHESIS` — No validado con clientes de TurnoGol. No asumir que copiar la presentación de otros SaaS funciona con dueños de complejos argentinos.
- `PREGUNTA AL BOARD` (Pricing/Hormozi) — Mensual vs anual por defecto · mostrar anual como equivalente mensual · cuándo ofrecer el anual · cuánto descuento · impacto en conversión · impacto en cash · transparencia del total cobrado.

### 3.15 Competencia
- `FACT` (observación del founder) — Hay movimiento competitivo nuevo. En particular **Clubo** y **Dónde Juego**; este último parece estar desarrollando con fuerza tanto el lado complejos como el lado jugador/distribución.
- `FOUNDER DECISION` — **Antes de recomendar posicionamiento o pricing definitivo: competitive teardown ACTUAL**, no depender de los docs de julio/agosto. Revisar el mercado completo, no ATC como único benchmark. Separar: SaaS · marketplaces · híbridos · productos baratos · multi-deporte · football-first.
- `FACT` (repo) — Los docs comparan contra ATC, Don Potrero, Turnito, EasyCancha, Korus, JuegaFácil, MisCanchas, Canchero, CanchaFija/Tiki Taka, PlayWith. **Clubo** aparece solo en GTM 12 (corpus de ads: "Clubo 14+ activos"). **Dónde Juego** figura en doc2 con "sin precio público" y "mismo eslogan que Korus". Ninguno tiene teardown de producto.

### 3.16 Primer piloto — CASO CERO
- `FACT` — Arranca 2026-09-02. Probablemente >4 canchas.
- `UNKNOWN` (11 datos, se capturan en el onboarding/entrevista, **no se inventan**): cantidad exacta de canchas · reservas semanales · dueño/encargados/empleados · proceso actual · herramientas actuales · señas actuales · métodos de cobro · cantidad de fijos · principales dolores · motivo exacto por el que quiere TurnoGol · relación previa con el founder.
- `FOUNDER DECISION` — Capturar **baseline antes de que TurnoGol modifique su operación**.

---

## 4. FOUNDER VISION / NORTH STAR — ⚠️ VISIÓN NO VALIDADA

> Fuente: Lazar, 2026-09-01. **No es realidad actual, no es roadmap aprobado, no es evidencia de PMF.** Se registra para que el Board la cuestione, no para que la ejecute. `[v2]` Confirmado en §3.8: "distribución / traer jugadores sigue siendo NORTH STAR, no promesa actual".

### 4.1 La tesis
Millones de jugadores que no llegan al fútbol profesional siguen jugando años en turnos, torneos y ligas amateur, y esa actividad **desaparece después de cada partido**. No existe una "carrera amateur" digital. TurnoGol quiere ser **una de las principales infraestructuras digitales del fútbol amateur**.

### 4.2 Lado jugador: identidad futbolística
Partidos jugados, equipos, resultados, goles, estadísticas, historial, rankings, reconocimientos, videos, highlights, rivalidades, logros. Competencia social entre amigos y equipos; compartir en Instagram; orgullo de equipo; status social dentro del fútbol amateur. Explícito: **no gamificación vacía**, sino hacer visible el status, progreso y competencia que ya existen.

### 4.3 Lado complejo: distribución
Popularidad, rankings, reputación, reseñas, demanda, posición en la zona, descubrimiento. Objetivo: que el complejo esté en TurnoGol **porque los jugadores están ahí**. Moat imaginado: de software a infraestructura de distribución.

### 4.4 Monetización futura (ideas, ninguna definida)
Posiciones patrocinadas · featured complexes · planes superiores ligados a distribución · perfiles premium de jugadores · productos digitales · torneos · contenido · **TurnoGol Cam**.

### 4.5 Restricciones que el founder se impone
Nada de esto se construye ahora. Prioridad: el **wedge**. Evitar red social, rankings, perfiles o features de network effect antes de tener actividad y densidad. El Board debe cuestionar coherencia, moat, secuencia, distracciones, efectos de red reales, loops, riesgos y qué validar primero.

### 4.6 Lo que el repo YA dice sobre esta visión
| Fuente | Qué dice | Relación con el North Star |
|---|---|---|
| `doc1` §5, `doc2` cierre | "El marketplace lo construimos gradualmente a medida que sumamos complejos" | Compatible: mismo secuenciamiento |
| `docs/planning/posible_nuevas_features_turnogol_fable_5.md` §4-5 | Propone carrera automática (carga cero), goles 1-tap, tarjetas compartibles, wrapped, **grupo del organizador** como moat. **Veta**: rankings globales/por zona sobre datos auto-reportados, badges, stats que afecten precio/acceso, red social/feed ("el feed ya existe y se llama WhatsApp"), score cross-tenant (Ley 25.326), video/cámaras ("otro negocio"), Falta Uno | **Tensión directa** con rankings, status social y Cam. "Lenguaje de crónica, no de ranking" |
| `docs/planning/2026-08-01-vision-producto-turnogol-v2.md` §10, §4.8 | "No es un marketplace (v1-v2)… prometer demanda que no existe es la trampa clásica". "No es una red social". "El 95% del tráfico jugador llega por el link del complejo" | Compatible con el wedge; contrario al North Star para v1-v2 |
| Red team §7, §11.1 | "Densidad zonal como producto": el marketplace "empieza a ser verdad a escala barrio". Posición "red/marketplace": **descartada** como mensaje de venta | La secuencia ya está escrita, con la condición de **jamás ser promesa de venta** |
| CLAUDE.md vetos + memoria GTM | Partidos abiertos fuera de v1; no prometer marketplace/WhatsApp/cobro auto | Guardrails vigentes |

Semilla técnica existente (no validación): `players` cross-tenant · `reviews` públicas · `/explorar` con `marketplace_visible` · `player_favorites` · `ActivityStats` en `/perfil` · motor de torneos con eventos por jugador, standings y bracket · `activation.first_online_booking`.

### 4.7 Preguntas que el Board deberá hacerle a la visión (registradas, sin responder)
Coherencia · qué tendría que ser verdad · moat real (densidad, grupos, historial, distribución) · secuencia y gates · distracciones (rankings globales, Cam, red social) · dónde hay efectos de red reales y a qué escala · loops existentes (link por WhatsApp) vs a construir · riesgos (cold start, datos auto-reportados, Ley 25.326, capex de video, competir con ATC/Dónde Juego en su terreno) · qué validar primero y con qué test barato.

---

## 5. REPORTE DE CIERRE v2

### 5.1 Preguntas críticas que siguen realmente sin respuesta
| # | Pregunta | Quién/cómo se responde | Bloquea al Board |
|---|---|---|---|
| 1 | Los 11 datos del caso cero (§3.16), en especial: **proceso y herramientas actuales, señas actuales, cantidad de fijos, dolor #1 y motivo exacto de querer TurnoGol** | Entrevista de onboarding, desde 2026-09-02 | Bloquea la **calibración** del wedge, no el análisis |
| 2 | **¿El piloto conoce el precio de lista?** Si no se pactó el precio de continuación el día 0, los 3 meses no miden willingness-to-pay (regla de `pricing_y_oferta` §2, hoy sin aplicar) | Founder, antes o durante el onboarding | Bloquea la medición de WTP del piloto |
| 3 | **Régimen fiscal final** → si el precio publicado es final o lleva IVA | Contador, antes del primer cobro | No bloquea: el Board trabaja con "precio = hipótesis" |
| 4 | **Teardown competitivo actual** (Clubo, Dónde Juego, resto del mapa, segmentado en 6 categorías) | Investigación web fechada desde Argentina; una sesión de trabajo | **Bloquea posicionamiento y pricing definitivos** por mandato del founder (§3.15). No bloquea oferta, funnel, lifecycle, referidos ni estrategia founder-led |
| 5 | Conteo scoreado de complejos en Luján | Scraping Maps + IG | Bloquea el **gate de salida de Luján**, no el resto |
| 6 | Presupuesto mensual real | Founder | Bloquea solo la fase "ads mes 2" (que ya está gateada) |
| 7 | Qué significa exactamente "exposición/promoción en redes" que el piloto da a cambio (¿caso publicable con números? ¿post? ¿testimonio?) | Founder / acuerdo con el piloto | Afecta la primera prueba social disponible |
| 8 | ¿El piloto va a usar seña? ¿Tiene cuenta MP de negocio? | Onboarding | Afecta si el caso cero puede validar A (seña) o solo B/C |

### 5.2 Contradicciones que desaparecieron
- **Precio fundador** (GTM 04, `pricing_y_oferta`, red team §21.1): cerrada por decisión, no existe.
- **Default anual en `PlanSelector`** vs `pricing_y_oferta` §14: cerrada, es decisión intencional de marketing.
- **`docs/marketing/` inexistente**: cerrada, no canónica.
- **titi como primer cliente real** (inferencia 8): refutada, testing interno.
- **Pilar 1 "plata" vs pilar 1 "seña"**: ya no es un choque entre decisiones; ambas son hipótesis abiertas junto con C y D.
- **Tarjeta al alta / día 31 / pausa estacional** (las 3 de la sesión anterior): pasaron de abiertas a provisionales (dos) y decidida (pausa: no).

### 5.3 Contradicciones que permanecen (o aparecieron)
1. **Toda la superficie pública afirma la tesis A (seña) como propuesta central** ("100% seña por MP" en dos StatsBar, hero, calculadora, `llms.txt`) mientras el founder la degrada a hipótesis con un insight de rechazo cultural. Es la más importante: la web hoy toma partido en la pregunta que el Board tiene que abrir.
2. **H1 "Tu complejo, siempre lleno" / "Reservas que no paran" / "vendiendo canchas 24/7"**: eslogan prohibido por el propio red team, y además promete distribución que el founder declara North Star, no promesa.
3. **Día 31**: código = `blocked` sin acceso; decisión provisional = read-only con datos, facturación y export visibles.
4. **"Exportás tus datos"** (FAQ y "Todo incluido" de `/precios`) vs código: solo CSV de métricas y export ARCO del jugador; doc2/doc3 ya retiraron el claim.
5. **Oferta publicada "30 días gratis" vs piloto real de 3 meses**: el caso cero no prueba la oferta que se va a vender.
6. **Default de seña 30%** en código vs hipótesis del founder (10%, "la parte de un jugador"): abierto, lo resuelve el Board con el piloto.
7. **Benchmark ATC-only** en toda la comparación de precio (doc2, doc4, migr. 071 alineó cortes con ATC) vs mandato de mapa completo con Clubo y Dónde Juego.
8. Drift de docs sin impacto en decisiones: GTM 03/07 precios viejos · doc4 10 emails vs 2 · dunning 60 vs 90 · MRR anual mal sumado · `wa.me` placeholder en el MDX de `/vs`.

### 5.4 ¿Hay contexto suficiente para ejecutar el Board?
**Sí para 7 de los 9 asesores, con una condición previa para los otros 2.**

- **Listos para correr ya** (no dependen del teardown ni del piloto): Hormozi Value Equation y Grand Slam (oferta, garantía, 3 meses del piloto, no-founder-pricing, feature freeze) · Hormozi Core Four (founder-led con empleo 9-17, referidos entre dueños) · Cialdini (objeciones reales de las 2 demos, rechazo a la seña, prueba social cero) · AARRR (funnel completo, trial sin tarjeta, día 31 read-only, referidos 2→1) · JTBD (los 4 wedges A/B/C/D contra los 6 criterios del founder, con las 3 preguntas espontáneas como dato) · Retention/Pricing sobre lifecycle (diseño del read-only, anual vs mensual).
- **Condicionados** (mandato explícito del founder §3.15): **Dunford (posicionamiento contra la alternativa real)** y **pricing definitivo (Van Westendorp/anclaje)** requieren el **teardown competitivo actual** primero. Sin él, el Board solo puede emitir hipótesis de posicionamiento y precio, no recomendación.
- **Lo que el piloto agrega** (desde 2026-09-02): el baseline del caso cero convierte varias `HYPOTHESIS` de §3.8 en observaciones. No hace falta esperarlo para correr el Board; sí para **cerrar** el wedge.

**Secuencia sugerida**: (1) teardown competitivo actual fechado → (2) Board completo en una sola pasada sobre los artefactos reales (`/para-complejos`, `/precios`, `PlanSelector`, GTM 04, oferta del piloto, hipótesis de referidos, §4 visión) → (3) recalibrar con el baseline del piloto cuando exista.
