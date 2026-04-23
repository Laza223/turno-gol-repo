# DOC 1 — Problem Brief

## TurnoGol: El Problema que Resolvemos

> **Propósito**: Definir con precisión clínica el problema antes de hablar de soluciones.
> Si no sabemos exactamente qué problema resolvemos, no podemos definir qué es un bug y qué es un feature.

---

## 1. ¿Quién tiene el problema?

### Perfil primario: El Dueño del Complejo de Fútbol

No "dueños de complejos deportivos". Sino:

**Marcelo, 43 años. Dueño de un complejo de fútbol 5 en GBA o interior de Argentina.**

- Tiene entre 3 y 8 canchas de fútbol (sintético, fútbol 5 o 7).
- Factura entre $500.000 y $3.000.000 ARS/mes en turnos.
- Tiene 1-2 empleados (recepcionista, encargado de turno).
- El teléfono del complejo es su WhatsApp personal o del negocio.
- Trabaja 10-14 horas por día.
- Lleva la agenda en papel, Google Calendar, o nada.
- Puede tener ATC Sports pero no lo usa al 100%, o lo abandonó por fricción.
- No tiene contador propio: usa una liquidación mensual básica o lo hace "a ojo".
- Su miedo más grande: que alguien le "robe un turno" o que le fallen cuando el complejo está lleno.

**Volumen del segmento en Argentina (estimación)**:

- Complejos de fútbol activos: ~8.000
- Con 3+ canchas y facturación suficiente para pagar un SaaS: ~3.000-4.000
- Con algún nivel de digitalización: ~1.500
- Mercado inmediato objetivo (GBA + ciudades +100k hab): ~2.000 complejos

---

## 2. ¿Cuál es el dolor concreto?

### Dolor A — Gestión caótica de reservas por WhatsApp

**Qué pasa hoy**:

- Marcelo recibe entre 20 y 50 mensajes por día consultando disponibilidad.
- Responde "sí hay" o "no hay" de memoria, sin sistema.
- Muchas veces responde tarde → el cliente no confirma → el turno queda libre pero "reservado mentalmente" → nadie más lo toma → el horario se pierde.
- Cuando trabaja un empleado, la agenda queda "en la cabeza de quien esté en el mostrador".

**Cuantificado**:

- Tiempo estimado en coordinación manual: **2-3 horas por día**
- A $1.500/hora de costo de oportunidad = **$90.000-$135.000 ARS/mes perdido en tiempo**

---

### Dolor B — No-shows sin penalidad (el de mayor impacto económico)

**Qué pasa hoy**:

- El jugador reserva un turno por WhatsApp o de palabra, sin compromiso económico.
- El día del partido, no aparece → la cancha queda vacía → es demasiado tarde para conseguir otro grupo.

**Cuantificado** (complejo de 4 canchas, turno promedio $8.000 ARS):

- Tasa de no-show sin sistema: 15-25% de los turnos
- Turnos perdidos/semana: 2-4 turnos → **$64.000-$128.000 ARS/mes en ingresos perdidos**
- Conclusión: **el no-show es el dolor de mayor impacto económico directo**

---

### Dolor C — Abonados que pagan "cuando pueden"

**Qué pasa hoy**:

- Los abonados son el ingreso más estable del complejo: mismo grupo, mismo día, misma cancha, todas las semanas.
- Pero el cobro es manual: Marcelo recuerda quién debe, manda WA, espera la transferencia.
- Algunos abonados acumulan 2-3 semanas de deuda.
- No hay registro centralizado de quién debe qué.

**Cuantificado**:

- Complejo con 15 abonados x $28.000 ARS/mes = $420.000/mes en abonos
- Mora estimada: **~$125.000 ARS "flotando" sin cobrar en un momento dado**
- Tiempo en gestión de cobro de abonados: **30-60 minutos/día** de recordatorios manuales

---

### Dolor D — Cero visibilidad financiera

**Qué pasa hoy**:

- Marcelo no sabe qué cancha le rinde más ni en qué horario.
- No puede proyectar el mes con datos reales.
- No detecta que los jueves a las 15hs tiene 40% de ocupación y podría hacer promociones.

**Consecuencias**:

- Precios desactualizados por falta de datos.
- Decisions de inversión tomadas "a ojo" (¿agrego una cancha? ¿techado o abierto?).

---

### Dolor E — Dependencia del empleado presente

**Qué pasa hoy**:

- La información vive en la cabeza del empleado de turno.
- Marcelo no puede monitorear su complejo desde el celu cuando no está físicamente.
- Si se va el encargado, se va el "sistema".

---

## 3. ¿Cómo lo resuelven hoy?

| Solución actual                 | Quiénes la usan                    | Por qué falla                                                            |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| **WhatsApp + papel**            | ~60% del mercado                   | No escala, caótico, sin datos, sin automatización                        |
| **Google Calendar / Excel**     | Los más organizados sin software   | Sin automatización, cobros ni app para jugadores                         |
| **ATC Sports**                  | ~15-20% del mercado digitalizado   | Onboarding largo, UI anticuada, multi-deporte, cobro de abonados manual  |
| **Otros (Turnito, DondeJuego)** | Segmento pequeño                   | Funciones básicas, sin marketplace real                                  |
| **Nada**                        | Complejos muy chicos/tradicionales | Alto dolor pero baja disposición a pagar (no es nuestro mercado inicial) |

**El perfil que más nos interesa:**

- Los que usan WhatsApp + papel y están listos para dar el salto digital.
- Los que probaron ATC Sports pero no se adaptaron o lo usan a medias.
- Los que tienen ATC Sports pero están inconformes con el cobro de abonados o la UX.

---

## 4. ¿Por qué ahora?

### Razón 1 — MercadoPago es mainstream

- +18 millones de usuarios activos en Argentina (2024).
- El pago digital pasó de ser fricción a ser expectativa cotidiana.
- **Habilita el Dolor B**: sin MP, no hay seña digital; sin seña digital, no hay penalidad real al no-show.

### Razón 2 — Email transaccional es confiable y accesible

- Servicios como Resend permiten enviar emails transaccionales de alta calidad con setup mínimo.
- Confirmaciones, recordatorios y notificaciones automáticas por email a costo predecible.
- **Habilita la automatización** sin depender de APIs de terceros con costos variables por mensaje.

### Razón 3 — ATC Sports validó el mercado pero dejó gaps

- ATC Sports prueba que: los dueños pagan una suscripción mensual, el mercado entiende el modelo SaaS, los jugadores reservan online.
- Pero dejó sin resolver: UX anticuada, cobro de abonados manual, falta de foco en fútbol.
- **TurnoGol no tiene que educar al mercado. Solo tiene que ser mejor en lo que ATC falla.**

### Razón 4 — Post-pandemia: digitalización acelerada

- Los 2 años de pandemia forzaron a complejos a adoptar reservas online.
- La predisposición al cambio digital es mucho mayor que en 2019.

---

## 5. Hipótesis de Valor

**Para el dueño del complejo (B2B)**:

> TurnoGol es el único software diseñado exclusivamente para fútbol que automatiza el cobro de abonados, elimina los no-shows con señas digitales, y le da al dueño visibilidad total de su negocio — configurable en menos de 20 minutos.

**Para el jugador (B2C)**:

> TurnoGol es la app donde encontrás cancha libre en tu zona, reservás en 30 segundos, pagás con MercadoPago, y te olvidás hasta que te llegue el recordatorio por email.

---

## 6. Out of Scope del Problema (Lo que TurnoGol NO resuelve)

- Gestión de clubes institucionales (socios, cuotas, múltiples disciplinas) → Clubify
- Marketplace masivo como objetivo principal → EasyCancha
- Torneos y ligas → módulo futuro (v2)
- Escuelas de fútbol (seguimiento de alumnos, pedagogía) → fuera de scope
- Operación fuera de Argentina → hasta validar el modelo localmente

---

## 7. Métricas que validan que resolvimos el problema

| Métrica                           | Baseline sin TurnoGol        | Target con TurnoGol            |
| --------------------------------- | ---------------------------- | ------------------------------ |
| Tiempo en gestión de reservas/día | 2-3 horas                    | < 20 minutos                   |
| Tasa de no-show                   | 15-25%                       | < 5%                           |
| Mora en cobro de abonados         | 25-35% de abonados con deuda | < 5% (cobro automático)        |
| Visibilidad de ingresos           | "A ojo"                      | Dashboard en tiempo real       |
| Tiempo de onboarding al sistema   | N/A                          | < 20 minutos para estar "live" |
