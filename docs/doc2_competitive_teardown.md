# DOC 2 — Competitive Teardown
## TurnoGol: Análisis Profundo de la Competencia

> **Propósito**: Entender dónde somos mejor que la competencia, dónde somos iguales (suficiente), y dónde ellos son mejores (riesgo a mitigar).
> Este análisis define exactamente en qué tenemos que invertir para ganar mercado.

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
- **Oportunidad**: Cobro automático mensual vía MercadoPago Suscripciones. El dueño No toca el tema.

#### Debilidad 3 — Multi-deporte = sin profundidad en fútbol
- ATC cubre pádel, fútbol, tenis, básquet, etc.
- Al querer servir a todos, no tienen features específicos de fútbol: partidos abiertos con quórum avanzado, tipos de cancha (5/7/11), gestión de equipos habituales.
- **Oportunidad**: TurnoGol es el software que "entiende fútbol". Puede tener flujos y terminología exacta del mundo del fútbol amateur.

#### Debilidad 4 — Onboarding largo (1-7 días según ellos mismos)
- Ellos mismos dicen en su web que el onboarding toma entre 1 y 7 días.
- Eso implica dependencia de su equipo de soporte para configurar el complejo.
- Para el dueño de una cancha chica, eso es una barrera enorme.
- **Oportunidad**: Onboarding self-service en menos de 20 minutos. Sin esperar a nadie.

#### Debilidad 5 — Reportes básicos
- El módulo de reportes de ATC cubre ocupación y caja básica.
- No tienen analytics visual moderno (gráficos de tendencia, comparativas mensuales, heatmaps de ocupación).
- **Oportunidad**: Dashboard con analytics visual que el dueño entienda de un vistazo.

#### Debilidad 6 — Sin gestión de gastos
- ATC tiene caja (ingresos) y stock (productos).
- No tienen gestión de gastos del complejo (luz, gas, mantenimiento, empleados).
- **Oportunidad**: Si incorporamos gastos, el dueño puede ver el resultado neto real de su negocio.

#### Debilidad 7 — Precio alto para complejos chicos
- Plan Base (1-3 canchas): $60.500/mes ARS (~$60 USD a TC blue).
- Para un complejo de 2 canchas con facturación de $500.000/mes, es el 12% de sus ingresos.
- **Oportunidad de pricing**: Plan más accesible para el segmento de 1-3 canchas, o freemium limitado para captarlos primero.

---

### Modelo de pricing de ATC Sports

| Plan | Canchas | Precio mensual | Precio anual (por mes) |
|---|---|---|---|
| Base | 1-3 | $60.500 ARS | $48.500 ARS (-20%) |
| Estándar | 4-6 | $95.000 ARS | $76.000 ARS (-20%) |
| Full | 7+ | $125.000 ARS | $100.000 ARS (-20%) |

- Trial: 30 días gratis
- Sin costo de instalación, capacitación ni mantenimiento
- Descuento ~33% por pago anual

**Implicancia para TurnoGol**: Este pricing ya fue validado por el mercado. No necesitamos inventar otro modelo. Podemos posicionarnos en el mismo rango o ligeramente debajo para el segmento de complejos chicos.

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

### Turnito
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
| Abonados / turnos fijos | ✅ (manual) | ✅ (**automático**) | ⚠️ | ❌ |
| Cobro automático abonados | ❌ | ✅ | ❌ | ❌ |
| Señas con MercadoPago | ✅ | ✅ | ⚠️ | ✅ |
| Notificaciones automáticas | ✅ (WA) | ✅ (**email**) | ⚠️ | ❌ |
| Partidos abiertos | ⚠️ básico | ❌ (post-v1) | ❌ | ❌ |
| Analytics visual | ⚠️ básico | ✅ | ❌ | ❌ |
| Gestión de gastos | ❌ | ✅ | ❌ | ❌ |
| Foco exclusivo fútbol | ❌ (multi) | ✅ | ❌ (multi) | ❌ (multi) |
| Onboarding self-service | ❌ (1-7 días) | ✅ (< 20 min) | ✅ | ✅ |
| Marketplace de jugadores | ✅ establecido | 🔄 a construir | ❌ | ✅ establecido |
| Precio para 1-3 canchas | Alto ($60.500) | Accesible | Bajo | Por comisión |

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
2. **Cobro automático de abonados** — feature exclusivo en v1 vs. sus clientes
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
