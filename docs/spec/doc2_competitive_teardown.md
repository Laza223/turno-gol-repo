# DOC 2 — Competitive Teardown
## TurnoGol: Análisis Profundo de la Competencia

> **Propósito**: Entender dónde somos mejor que la competencia, dónde somos iguales (suficiente), y dónde ellos son mejores (riesgo a mitigar).
> Este análisis define exactamente en qué tenemos que invertir para ganar mercado.

> **🔄 ACTUALIZACIÓN 2026-07-19** — Pricing de ATC corregido con verificación DESDE Argentina (captura del founder + navegación real a atcsports.io desde IP argentina): la lista argentina está **en pesos** — la versión en USD que circula corresponde a otros mercados (el sitio localiza por país; selector de 14 países al pie). Se agregó la sección "Competidores argentinos verticales" (7 jugadores que este doc no cubría) y los hallazgos del flujo de alta de ATC. **Regla de método permanente: ningún precio de competidor se considera verificado sin captura tomada desde Argentina, fechada** — un fetch remoto puede devolver pricing de otro país. Research completo con fuentes: [docs/gtm/research/2026-07-18-competidores.md](../gtm/research/2026-07-18-competidores.md) (con fe de erratas) y [TURNOGOL_MARKETING_RED_TEAM.md](../gtm/TURNOGOL_MARKETING_RED_TEAM.md) §5.

---

## ATC Sports — Análisis en Profundidad

> ATC Sports es el competidor principal y el referente del mercado. No subestimarlo.
> Su existencia validó el mercado; sus debilidades definen nuestra oportunidad.

### Lo que hacen bien (no subestimar)

| Fortaleza | Impacto para nosotros |
|---|---|
| **Marca reconocida** en Argentina y LATAM (9 países) | Alto switching cost psicológico. Muchos dueños "ya conocen ATC". |
| **Marketplace de jugadores** con comunidad formada | Red establecida de jugadores que buscan canchas en su app. |
| **Historial de datos** de miles de complejos | Pueden entrenar mejores recomendaciones de ocupación. |
| **Integraciones** (filmación Beelup, control de acceso) | Ecosistema que nosotros no tenemos en v1. |
| **Presencia LATAM** (ARG, Chile, Perú, MX, etc.) | Economías de escala que les permiten invertir más en producto. |
| **Trial gratuito de 30 días** | Ya educaron al mercado en el modelo. |
| **Multi-deporte** | Cubre pádel, tenis, básquet — mayor pool de clientes potenciales para ellos. |

**Conclusión**: ATC Sports tiene una ventaja real. No podemos competirles de igual a igual en todo. Tenemos que elegir bien dónde ganar.

---

### Sus debilidades reales (basado en fuentes directas y reviews)

#### Debilidad 1 — UI/UX del panel admin: anticuada y no mobile-first
- El panel administrativo fue diseñado para desktop.
- En el mostrador de un complejo, el dueño o encargado usa el celu.
- Una UI que no es mobile-first genera fricción en el uso diario.
- **Oportunidad**: Panel admin diseñado mobile-first desde el día 0.

#### Debilidad 2 — Cobro de abonados: 100% manual
- ATC permite gestionar abonados (turnos fijos recurrentes) pero el cobro sigue siendo manual.
- El dueño tiene que recordar, cobrar por transferencia o efectivo, registrarlo.
- **Oportunidad**: Gestión de abonados (automatización en v1.5 con MercadoPago Suscripciones). En v1 el cobro es manual pero integrado al perfil del cliente.

#### Debilidad 3 — Multi-deporte = sin profundidad en fútbol
- ATC cubre pádel, fútbol, tenis, básquet, etc.
- Al querer servir a todos, no tienen features específicos de fútbol: partidos abiertos con quórum avanzado, tipos de cancha (5/7/11), gestión de equipos habituales.
- **Oportunidad**: TurnoGol es el software que "entiende fútbol". Puede tener flujos y terminología exacta del mundo del fútbol amateur.

#### Debilidad 4 — Onboarding con humano en el medio (CONFIRMADA Y REFORZADA 2026-07-19)
- Verificado navegando el flujo real: el botón "Probar gratis" NO da de alta nada — lleva a un **formulario largo** (nombre, teléfono, email, relación con el club, club, ubicación completa, deportes) que termina en: *"Una vez que completes tus datos, nos pondremos en contacto para coordinar una reunión donde te mostraremos en detalle más sobre el sistema"*, con campo "¿Quieres que te contacte un comercial de ATC?". "Hablar con ventas" = Calendly de demo.
- O sea: entre el dueño y su trial de ATC hay un formulario, un comercial y una reunión a coordinar.
- **Oportunidad**: Onboarding self-service en <20 minutos, sin hablar con nadie — o con el founder configurándolo en 48hs si el dueño prefiere que se lo hagan. Ambos caminos le ganan al flujo de ATC en fricción.
- Bonus detectado en su propio formulario: el placeholder de deportes dice "Padel, Fútbol, Básquet" — **pádel primero**. El sesgo multi-deporte les llega hasta el placeholder.
- Segundo bonus: su campo "¿Cómo llegaron a nosotros?" lista **"Por un proveedor: ¿Cuál?"** y "Referido de un club" como orígenes — el propio líder trackea el canal proveedor y el referido como fuentes de adquisición. Validación externa directa del canal proveedor (E6) y del motor de referidos del plan comercial de TurnoGol.

#### Debilidad 5 — Reportes básicos
- El módulo de reportes de ATC cubre ocupación y caja básica.
- No tienen analytics visual moderno (gráficos de tendencia, comparativas mensuales, heatmaps de ocupación).
- **Oportunidad**: Dashboard con analytics visual que el dueño entienda de un vistazo.

#### Debilidad 6 — Sin gestión de gastos
- ATC tiene caja (ingresos) y stock (productos).
- No tienen gestión de gastos del complejo (luz, gas, mantenimiento, empleados).
- **Oportunidad**: Si incorporamos gastos, el dueño puede ver el resultado neto real de su negocio.

#### Debilidad 7 — Pricing: ya no es "alto" — es una guerra de franjas (REESCRITA 2026-07-19)
- La versión vieja de esta debilidad ("precio alto, $60.500") quedó obsoleta: hoy ATC Base cuesta $66.000 (1-3 canchas) y el mapa por franja está repartido (ver tabla de pricing arriba).
- La debilidad real que queda: para el complejo de 1-2 canchas, TurnoGol Predio ($55.000) sigue ganando; y la presión de abajo la ponen los free tiers de los locales (Korus hasta 2 canchas, Don Potrero Amateur), no ATC.
- El flanco propio a vigilar: **con 3 canchas ATC es 22% más barato que TurnoGol** ($66k vs $85k) y con 6, 10% más barato — franjas dentro del ICP-1. Mitigación de corto plazo: precio fundador (-20/30%) ≈ empata la franja de 3. Decisión estructural: red team §21.11.

---

### Modelo de pricing de ATC Sports (verificado desde AR, 2026-07-19)

| Plan | Canchas | Precio mensual | Precio anual (por mes, -20%) |
|---|---|---|---|
| Base | 1-2-3 | $66.000 ARS | $53.000 ARS ($636.000/año) |
| Estándar | 4-5-6 | $104.000 ARS | $83.000 ARS ($996.000/año) |
| Full | 7+ | $136.000 ARS | $109.000 ARS ($1.308.000/año) |

- Trial: "1 mes gratis", sin tarjeta — pero **NO self-service** (ver Debilidad 4 actualizada).
- FAQ oficial: *"El único costo de ATC es el abono mensual"* — sin costos de instalación/capacitación/soporte. **IVA: el sitio NO lo aclara en ninguna parte** (precios, FAQ ni formulario de alta) — falta determinar si $66.000 es final o +IVA. Cómo cerrarlo: factura real de un cliente ATC (preguntar en charlas con ex/actuales usuarios) o consulta al comercial.
- Pago: mensual adelantado (días 1-10), medios: tarjeta, transferencia, Mercado Pago. Ancla de la página: "Automatizá tu complejo desde $53.000 por mes" (usa el precio ANUAL como "desde").

**Comparación por franja con TurnoGol ($55k/$85k/$115k + IVA) — los rangos cortan distinto y eso reparte el mapa:**

| Canchas | TurnoGol | ATC | Más barato |
|---|---|---|---|
| 1-2 | $55.000 | $66.000 | TurnoGol (-17%) |
| **3** | $85.000 | $66.000 | **ATC (-22%)** |
| 4-5 | $85.000 | $104.000 | TurnoGol (-18%) |
| **6** | $115.000 | $104.000 | **ATC (-10%)** |
| 7+ | $115.000 | $136.000 | TurnoGol (-15%) |

**Implicancia para TurnoGol (actualizada)**: el modelo de pricing sigue validado por el mercado, pero **la pelea de precio contra ATC no es terreno ganador**: precios comparables, dos franjas perdedoras (3 y 6 canchas — dentro del ICP-1 de 3-6) y la asimetría de IVA sin verificar. NO usar "sale menos que ATC" como claim general; comparar solo por franja, en charla, con números del día. El diferencial real está en producto y trato (mobile-first, fútbol-only, caja con gastos, onboarding self-service vs formulario+reunión, setup hecho por el founder). Decisión pendiente sobre boundaries de planes: red team §21.11.

---

### Estrategia de captación de clientes de ATC

#### Tipo A — Dueño que nunca usó software (WhatsApp + papel)
- **Cómo captarlos**: Marketing digital local (Instagram, Google Maps). Boca a boca entre dueños de complejos.
- **Argumento**: "Más simple que ATC, diseñado para fútbol, lo configurás solo en 20 minutos."
- **Riesgo**: Ya conocen ATC. Tenemos que aparecer antes que ellos en la búsqueda.

#### Tipo B — Usuario de ATC que usa el sistema a medias
- **Cómo captarlos**: Outreach directo. Preguntar qué les frustra de ATC.
- **Argumento**: "Automatizá el cobro de tus abonados. Mirá tu complejo desde el celu. Todo en 20 min."
- **Riesgo**: Switching cost. Tienen datos en ATC. → Solución: importador de datos de ATC.

#### Tipo C — Usuario de ATC satisfecho
- **No es nuestro mercado inicial.** No podemos competirles en features donde ATC es bueno.
- **Estrategia a largo plazo**: cuando tengamos marketplace más grande y features más avanzados.

---

## Competidores Secundarios

### Competidores argentinos verticales (AGREGADO 2026-07-19 — este doc no los cubría)

Relevamiento fechado 2026-07-18 (fuentes y citas completas en [research/2026-07-18-competidores.md](../gtm/research/2026-07-18-competidores.md)):

| Competidor | Propuesta | Pricing | Nota clave |
|---|---|---|---|
| **JuegaFácil** (juegafacil.com.ar) | Fútbol, chatbot de WhatsApp para reservas | Starter $80.000 (hasta 2 canchas) / Pro $120.000 (hasta 8) — más caro que TurnoGol en cada tramo | El más comparable en propuesta y precio; trial 14 días |
| **Korus** (korus.com.ar) | Multi-deporte, "Tu complejo deportivo siempre lleno. Sin WhatsApp. Sin cuadernos." | **Free hasta 2 canchas**; Pro sin precio público | Free tier = presión en el segmento chico; único que menciona Ley 25.326 |
| **Don Potrero** (donpotrero.com) | Gestión + capa social ("seguidores" del complejo llenan cancelaciones) | Amateur GRATIS; Pro sin precio público | El único que puentea social→gestión; AR/UY/CR |
| **Dónde Juego** (dondejuegoapp.com) | Doble cara jugadores+dueños, fútbol 5 y pádel | Sin precio público | Mismo eslogan literal que Korus ("tu cancha, siempre llena") |
| **MisCanchas** (miscanchas.com) | Todo-en-uno genérico, "hecho en Argentina" | Sin precio público | Prueba social autoreportada sin un solo caso nombrado ni rastro de prensa |
| **Canchero** (canchero.com.ar) | Marketplace F5/7/11 + pádel + gestión | Sin precio público | BA/Córdoba/Rosario/Mendoza |
| **CanchaFija / Tiki Taka** | Gestión + torneos / grabación de partidos | Sin precio público | Tiki Taka recién lanzando (San Juan) |

**Lectura estratégica**: el espacio "software argentino para canchas" NO está vacío — pero todos son multi-deporte (o sin bandera de fútbol), todos publican % de mejora autoreportados sin casos nombrados, y ninguno ejecuta founder-led hiperlocal con casos auditables. Los eslóganes "tu cancha siempre llena" y "sin WhatsApp, sin cuadernos" están comoditizados (3+ jugadores cada uno) — prohibidos para TurnoGol por gastados. Playtomic: confirmado FUERA de fútbol (pádel/tenis) — no es competidor directo.

### Turnito

> ⚠️ NOTA 2026-07-19: el research encontró en turnito.app una **agenda genérica multi-rubro** (peluquerías, consultorios; $0/$24.500/$42.000 ARS por mes, sin caja diaria ni grilla multi-cancha) que no coincide del todo con la descripción original de esta ficha — posible confusión de nombre o pivote del producto. Compite por el complejo chico sensible al precio, no por el ICP-1.

| | |
|---|---|
| **Propuesta** | Sistema de gestión simple, precio bajo, foco en reducir ausentismo |
| **Fortalezas** | Precio accesible, UX simple, buena relación costo-beneficio |
| **Debilidades** | Sin marketplace de jugadores, sin app para jugadores, funcionalidades básicas |
| **Amenaza para TurnoGol** | Baja. Compiten en precio, no en valor. |
| **Oportunidad** | Sus usuarios están limitados y listos para "subir" a algo más completo. |

### EasyCancha
| | |
|---|---|
| **Propuesta** | Marketplace masivo ("Airbnb de las canchas"), no software de gestión |
| **Fortalezas** | Gran base de jugadores que buscan canchas, visibilidad para el complejo |
| **Debilidades** | No es un sistema de gestión profundo. El dueño sigue gestionando reservas por fuera. |
| **Amenaza para TurnoGol** | Media. Si crecen como marketplace, pueden erosionar nuestra ventaja de visibilidad. |
| **Oportunidad** | Complementario, no competitivo directamente. Un dueño puede estar en EasyCancha Y usar TurnoGol para la gestión interna. |

### DondeJuego
| | |
|---|---|
| **Propuesta** | Gestión de canchas con foco en agilidad y pagos anticipados |
| **Fortalezas** | Simple, pagos anticipados para evitar cancelaciones |
| **Debilidades** | Funcionalidades limitadas, sin marketplace fuerte, sin analytics |
| **Amenaza para TurnoGol** | Baja. |

### PlayWith
| | |
|---|---|
| **Propuesta** | Gestión integral: reservas + cobros automáticos + torneos + clases + seguimiento de socios |
| **Fortalezas** | Más completo en gestión de clubes institucionales. Torneos y academias. |
| **Debilidades** | Más complejo de usar. No foco en fútbol social/amateur. Curva de aprendizaje. |
| **Amenaza para TurnoGol** | Media-baja. Compiten en segmento diferente (clubes más institutcionales). |

---

## Tabla de Posicionamiento Estratégico

| Feature | ATC Sports | TurnoGol | Turnito | EasyCancha |
|---|---|---|---|---|
| Panel admin mobile-first | ❌ | ✅ | ⚠️ | N/A |
| Reservas online 24/7 | ✅ | ✅ | ✅ | ✅ |
| Abonados / turnos fijos | ✅ (manual) | ✅ (manual) | ⚠️ | ❌ |
| Cobro automático abonados | ❌ | ❌ (v1.5) | ❌ | ❌ |
| Señas con MercadoPago | ✅ | ✅ | ⚠️ | ✅ |
| Notificaciones automáticas | ✅ (WA) | ✅ (**email**) | ⚠️ | ❌ |
| Partidos abiertos | ⚠️ básico | ❌ (post-v1) | ❌ | ❌ |
| Analytics visual | ⚠️ básico | ✅ | ❌ | ❌ |
| Gestión de gastos | ❌ | ✅ | ❌ | ❌ |
| Foco exclusivo fútbol | ❌ (multi) | ✅ | ❌ (multi) | ❌ (multi) |
| Onboarding self-service | ❌ (formulario + reunión con comercial) | ✅ (< 20 min) | ✅ | ✅ |
| Marketplace de jugadores | ✅ establecido | 🔄 a construir | ❌ | ✅ establecido |
| Precio para 1-2 canchas | $66.000 (Base 1-3) | $55.000 (Predio 1-2) | Bajo | Por comisión |
| Precio para 3 canchas | **$66.000 (gana ATC)** | $85.000 (Complejo 3-5) | — | — |

**Leyenda**: ✅ Bien cubierto | ⚠️ Parcialmente | ❌ No tiene | 🔄 En construcción

---

## Análisis de Switching Cost (Problema Crítico)

El switching cost de ATC Sports es **real pero superable**:

| Barrera | Solución TurnoGol |
|---|---|
| "Mis datos están en ATC" | Importador de datos (clientes, abonados, canchas) desde CSV/Excel |
| "Mi equipo ya sabe usar ATC" | Onboarding interactivo en el sistema. Interfaz más intuitiva = menos capacitación |
| "Mis jugadores tienen la app de ATC" | Web pública del complejo (no requiere app). El jugador llega por link. |
| "¿Y si TurnoGol cierra?" | Exportación de datos en cualquier momento (CSV). Transparencia total. |
| "Ya pagué el año" | No podemos hacer nada aquí. El timing importa: captarlos cuando renuevan. |

---

## Decisión Estratégica: Dónde Ganamos vs. Dónde Igualamos

### Donde TENEMOS que ser mejores que ATC (battleground)
1. **UX/UI del panel admin** — mobile-first, moderno, 10x más placentero de usar
2. **Gestión integrada de abonados** — registro y control de deudas simple vs. ATC (cobro automático en v1.5)
3. **Onboarding** — <20 minutos self-service vs. 1-7 días con soporte
4. **Foco en fútbol** — terminología, flujos y features pensados para fútbol amateur
5. **Analytics visual** — dashboard que el dueño entiende sin ser contador

### Donde es suficiente con IGUALAR a ATC (tabla stakes)
- Grilla de disponibilidad en tiempo real
- Reservas online con seña via MercadoPago
- Email automático de confirmación y recordatorio
- Caja y stock básicos
- Multi-usuario con roles (admin / recepcionista)
- Web pública del complejo

### Donde ATC nos supera y lo asumimos (no battleground en v1)
- Marketplace de jugadores establecido (ellos tienen años de red)
- Integraciones (filmación, control de acceso)
- Presencia LATAM

> [!NOTE]
> Reconocer dónde nos supera en v1 no es debilidad. Es foco estratégico.
> El jugador que ya usa ATC para buscar canchas puede igualmente reservar en TurnoGol a través del link del complejo.
> El marketplace lo construimos gradualmente a medida que sumamos complejos.
