# DECISIONES DEL SISTEMA — TurnoGol

## Archivo maestro de decisiones de negocio y sistema

> **Propósito**: Centralizar TODAS las decisiones de negocio y sistema del proyecto.
> Antes de codear cualquier cosa, este archivo se consulta primero.
> Si una decisión no está acá, no está tomada.

> [!IMPORTANT]
> **Cómo responder**:
>
> - ✅ = Confirmo, está bien así
> - ❌ = No quiero eso, lo cambio (explicá cómo)
> - 🔄 = Lo cambio por: [tu respuesta]
> - NS = No sé, necesito ayuda para decidir
>
> **Después de responder**, yo (la IA) ajusto toda la documentación técnica en base a tus decisiones.

---

## 1. IDENTIDAD DEL PRODUCTO

### P1.1 — ¿TurnoGol es SOLO para fútbol?

**Estado actual**: Sí, exclusivamente fútbol (5, 7, 11). Es el diferenciador vs ATC que es multi-deporte.
**Contexto**: ATC cubre pádel, tenis, básquet, etc. Vos te posicionás como "el que entiende fútbol". Si en el futuro querés expandir a pádel, hay que pensarlo distinto desde ahora (ej: el campo `capacity` cambiaría).

**Tu respuesta**: Si, pero abarcamos todas las canchas de futbol. Desde futbol 4 hasta futbol 11.

---

### P1.2 — ¿Argentina solamente en v1?

**Estado actual**: Sí. Moneda ARS, timezone ART, MercadoPago AR, Ley 25.326.
**Contexto**: Si en el futuro querés expandir a Chile o Uruguay, necesitamos multi-moneda y multi-timezone desde el diseño. Ahora todo está hardcodeado para Argentina.

**Tu respuesta**: Argentina. El tema de otras monedas, otros paises, lo vemos en el futuro.

---

### P1.3 — ¿El nombre "TurnoGol" está definido o puede cambiar?

**Contexto**: El slug del dominio (turnogol.com.ar), los emails transaccionales, el branding, todo depende de esto. Si puede cambiar, conviene parametrizarlo.

**Tu respuesta**: Esta definido, es Turnogol (.com)

> **🔄 ACTUALIZACIÓN 2026-06-18:** El dominio definitivo es **turnogol.app** (NO .com.ar ni .com). Estructura de subdominios definida:
> - `turnogol.app` → landing principal.
> - `turnogol.app/[slug]` → página pública de cada complejo (reserva del jugador).
> - `app.turnogol.app` → panel de administración de los complejos (staff).
>
> ✅ **Propagado 2026-06-18:** `.app` + esta estructura aplicada a docs, emails (`soporte@`, `privacidad@`, `notificaciones@`, `no-reply@`), templates, código y tests. Apex `turnogol.app` para público/landing/reserva; `app.turnogol.app` para panel staff (settings/billing/grilla). Las direcciones de test siguen usando el TLD reservado `.test` (RFC 6761).

---

## 2. USUARIOS Y ROLES

### P2.1 — ¿Cuántos roles tiene el sistema?

**Estado actual**: 3 roles de staff + 1 jugador:
| Rol | Qué puede hacer |
|---|---|
| `admin` | Todo: config, canchas, precios, staff, reportes, abonados, caja |
| `receptionist` | Reservas, caja del día, ver abonados, bloquear horarios |
| `readonly` | Solo ver la grilla y datos (sin crear ni editar nada) |
| `player` (jugador) | Reservar online, ver sus turnos, cancelar sus reservas |

**Pregunta**: ¿Está bien así? ¿El `readonly` te sirve o lo sacamos? ¿Necesitás algún rol más, tipo un "super admin" tuyo para gestionar todos los complejos desde atrás?

**Tu respuesta**: De que sirve el readonly? Me parece que no es necesario. Lo mismo con el receptionist. Creo que bastaria con que haya un solo rol que sea admin y en las secciones sensibles de la app usar un pin o clave para acceder. De esta forma, el empleado del complejo no puede tocar los precios, ni los horarios, ni nada. Solo puede hacer lo que deberia hacer un receptionista y si necesita alguna otra funcionalidad sensible, lo habla con el dueño. Es necesario que pensemos que serían esas "Zonas sensibles", pero creo que bastaría con que haya un solo rol y el rol mío "Super Admin".

> **🔄 ACTUALIZACIÓN 2026-06-18:** Decisión final = **2 roles de staff**: `admin` (Dueño, acceso total) y `manager` (Encargado: grilla/reservas/caja, sin precios ni config). El rol `manager` es **opcional** por complejo. Se **elimina `read_only`** (no aporta). El código ya tiene `admin`/`manager`/`read_only` (migración 026) → pendiente quitar `read_only`. Más el "Super Admin" del sistema (`system_admins`).

---

### P2.2 — ¿Existe un "Super Admin" de TurnoGol (vos/tu equipo)?

**Estado actual**: NO existe. No hay panel interno para que vos como dueño de TurnoGol veas todos los complejos, métricas globales, o hagas soporte.
**Contexto**: ATC tiene un backoffice interno donde ven todos sus clientes, métricas, etc. Sin esto, para hacer soporte tendrías que entrar directo a Supabase con SQL.
**Ejemplo**: Imaginá que un cliente te escribe "no puedo entrar a mi cuenta". Sin un super admin, tenés que ir a la DB manualmente a ver qué pasa.

**Pregunta**: ¿Querés un panel de super admin para v1, o lo dejamos para después y usás Supabase Dashboard directamente?

**Tu respuesta**: Si obvio, agradezco haberlo mencionado porque es realmente muy importante este rol. MUY importante. La respuesta es si, se necesita un panel super admin para TurnoGol.

---

### P2.3 — ¿El jugador NECESITA registrarse para reservar online?

**Estado actual**: Sí. El jugador se registra con magic link (email), acepta TyC, y recién ahí puede reservar.
**Contexto en ATC**: ATC también requiere registro para reservar online. Pero hay complejos donde el admin simplemente carga la reserva manual y pone el nombre del jugador a mano (sin que el jugador tenga cuenta).
**Pregunta**: ¿Un jugador SIN cuenta puede reservar online? ¿O solo el admin puede cargar reservas de gente sin cuenta?

**Tu respuesta**: No. Tiene que registrarse y que sea simple el registro. Pero tiene que registrarse. Se puede hacer con Google (No sé que tan dificil es configurar el OAuth en Supabase, pero calculo que no tanto, contame vos) o con el mail. En dos click y listo. No le pedimos ni dni, ni nada. Y obvio tiene que aceptar losTyC. En sí el login tiene que ser lo más simple posible, porque si no la gente no se registra. Pero el login es clave para que le pueda notificar mediante mail.

---

### P2.4 — ¿Un staff puede pertenecer a múltiples complejos?

**Estado actual**: Sí. Un mismo email puede ser `admin` en Complejo A y `receptionist` en Complejo B.
**Contexto**: Esto pasa cuando un dueño tiene 2 complejos, o cuando un empleado trabaja en dos lugares.

**Tu respuesta**: No, no va a existir mas el rol "Recepcionist". Solo va a existir el rol "Admin" de cada complejo.

> **🔄 ACTUALIZACIÓN 2026-06-18:** Ver P2.1 — además de `admin` existe `manager` (Encargado, opcional). Un mismo staff puede pertenecer a varios complejos vía `tenant_staff_members` con su rol por complejo.

---

### P2.5 — ¿El dueño del complejo y el admin son la misma persona?

**Estado actual**: Sí. El que registra el complejo se convierte automáticamente en `admin`. No hay distinción "dueño" vs "admin".
**Pregunta**: ¿Querés que el dueño tenga un rol especial que no se pueda quitar (tipo "owner"), o está bien que sea admin normal y otro admin podría sacarlo?

**Tu respuesta**: Si, el admin es lo mismo que el dueño del complejo, en sí el "admin" de por sí no debería llamarse "admin". Sería el dueño de la cuenta que maneja el complejo, el tema es que ya hay muchas tablas con "admin" en el nombre y sería mucho quilombo cambiarlo ahora. Pero si, es lo mismo y sería el dueño de la cuenta que maneja el complejo y la misma cuenta que debería estar en la computadora o celular del que esté trabajando en el complejo para gestionar todo.

---

## 3. RESERVAS (EL CORE)

### P3.1 — ¿Cuánto dura un turno?

**Estado actual**: Configurable por complejo: 60, 90, o 120 minutos (campo `booking_duration_minutes` en settings).
**Contexto en ATC**: ATC permite duraciones fijas de 60 o 90 minutos por cancha.
**Pregunta**: ¿El admin puede poner cualquier duración custom (ej: 45 min, 75 min) o solo esas 3 opciones?

**Tu respuesta**: No, solo las mismas decisiones que ATC.

> **🔄 ACTUALIZACIÓN 2026-06-22:** La duración de los turnos será fija en **60 minutos** para simplificar la grilla (Decisión de negocio).

---

### P3.2 — ¿Cuántos días de anticipación puede reservar un jugador?

**Estado actual**: Configurable, default 14 días. Si el complejo pone 7, el jugador solo puede reservar hasta 7 días adelante.
**Pregunta**: ¿Está bien 14 como default? ¿Los abonados deberían poder ver sus turnos más allá de ese límite?

**Tu respuesta**: Hacer lo mismo que ATC. Anticipación: Las reservas se limitan a 6 días de antelación dice ATC.

---

### P3.3 — ¿El jugador puede elegir la cancha o solo el horario?

**Contexto**: Hay dos modelos:

- **Modelo A** (como ATC): El jugador elige cancha + horario. "Quiero la Cancha 3 a las 21hs".
- **Modelo B**: El jugador elige horario y el sistema le asigna la cancha disponible. "Quiero jugar a las 21hs" → el sistema le da la primera libre.

**Estado actual**: Modelo A (elige cancha + horario).

**Tu respuesta**: Claramente la A. El jugador elige la cancha y el horario.

---

### P3.4 — ¿Qué pasa si un jugador reserva y no paga la seña en 6 minutos?

**Estado actual**: La reserva expira automáticamente y el slot se libera.
**Pregunta**: ¿6 minutos está bien? ¿Querés que sea configurable por complejo?

**Tu respuesta**: 15 minutos está bien.

> **🔄 ACTUALIZACIÓN 2026-06-22:** El timer de expiración se redujo a **6 minutos fijos** (antes 15). Se eliminó la extensión a 48hs por pagos en proceso. Todo expira a los 6 minutos exactos.

---

### P3.5 — ¿El admin puede crear reservas retroactivas (de días pasados)?

**Estado actual**: No. Solo se puede crear reservas para hoy o futuro.
**Contexto**: A veces el admin quiere "cargar" una reserva que ya pasó para que quede registrada en la caja.
**Pregunta**: ¿Permitís cargar reservas de ayer, o solo hoy + futuro?

**Tu respuesta**: No. Solo hoy y futuro.

---

### P3.6 — ¿El jugador puede tener múltiples reservas activas al mismo tiempo?

**Estado actual**: Sí, sin límite. Un jugador puede tener 5 reservas en la misma semana.
**Pregunta**: ¿Querés limitar esto? ¿Máx 1 reserva activa por complejo, o sin límite?

**Tu respuesta**: No, sin límite. Puede tener todas las reservas que quiera. Mientras pague supongo que no hay mucho problema para el complejo...

---

### P3.7 — ¿Qué es un "bloqueo" de cancha?

**Estado actual**: Un booking de tipo `block` que ocupa el horario sin jugador. Se usa para: feriados, eventos privados, mantenimiento.
**Pregunta**: ¿El recepcionista puede crear bloqueos o solo el admin?

**Tu respuesta**: Voy a ignorar sobre lo de los roles que mencionaste. ATC dice esto: "Bloqueo administrativo (No. Dur): Cierre de franjas horarias sin asociar jugadores. Se usa para mantenimiento, feriados o clases fijas, eliminando la disponibilidad en la app." Y yo estoy de acuerdo, hagamos eso.

---

### P3.8 — Auto-complete: ¿Las reservas se marcan solas como "completadas"?

**Estado actual**: Sí. 30 minutos después de que termina el horario del turno, si nadie la marcó, se marca automáticamente como `completed`.
**Pregunta**: ¿Querés ese auto-complete o preferís que el admin tenga que marcarla manualmente?

**Tu respuesta**: Auto-complete (Finalización): Cambio de estado automático basado en el reloj. Al expirar el tiempo, el turno pasa a "jugado", pero la liquidación financiera requiere confirmación manual si existe un saldo pendiente de cobro en el complejo. También ATC maneja las deudas así: "Gestión de No-Show/Deuda: El administrador marca la inasistencia manualmente para generar un saldo deudor en el perfil del jugador, permitiendo el bloqueo automático de futuras reservas hasta que la deuda sea saldada en el complejo."

---

## 4. SEÑA Y PAGOS

### P4.1 — ¿La seña es obligatoria?

**Estado actual**: Configurable por complejo. Puede ser 0% (sin seña) o cualquier porcentaje (default 30%).
**Contexto en ATC**: ATC también lo hace configurable. Algunos complejos no cobran seña, otros sí.

**Tu respuesta**: Esto me gustaría manejarlo como en ATC: "Seña parametrizada: Es una regla opcional configurada por el complejo. Puede ser obligatoria (pago inmediato), garantía (cobro solo ante inasistencia) o inexistente, dependiendo de la política de cada club en el panel de administración."

> **🔄 ACTUALIZACIÓN 2026-06-18:** Para **v1** la seña es solo **obligatoria (on, %) o inexistente (off)**. El **modo "garantía" NO se implementa en v1** (se evalúa más adelante). Config en `tenants.settings` (`requires_deposit` + `deposit_percentage`).

---

### P4.2 — ¿El porcentaje de seña es igual para todos los horarios?

**Estado actual**: Sí. Un solo `deposit_percentage` para todo el complejo.
**Pregunta**: ¿Debería poder ser distinto por franja? Ej: 50% viernes noche, 20% martes mañana.

**Tu respuesta**: Seña por cancha: El porcentaje (o monto fijo) es único por cada cancha. Si se usa "Porcentaje", el valor de la seña variará según el precio del horario (Pico/Valle), pero la tasa aplicada es siempre la misma.

> **🔄 ACTUALIZACIÓN 2026-06-18:** Para **v1** el `deposit_percentage` es **global por complejo** (un solo % en `tenants.settings`), NO por cancha. Seña por-cancha queda fuera de v1.

---

### P4.3 — ¿TurnoGol cobra comisión sobre las señas?

**Estado actual**: NO. El dinero de las señas va 100% directo del jugador al complejo vía MercadoPago OAuth. TurnoGol no toca ese dinero.
**Contexto**: Tu ingreso viene solo de la suscripción mensual, no de comisiones por transacción.

**Tu respuesta**: No, no se cobra comisión por las señas por ahora. El dinero va directo del jugador al complejo. Pero si en un futuro se quiere cobrar comisión, se puede hacer.

---

### P4.4 — ¿Qué métodos de pago acepta el sistema?

**Estado actual**: Para señas online: MercadoPago. Para pagos manuales: efectivo, transferencia.
**Pregunta**: ¿Necesitás algún otro método? ¿Débito directo? ¿Otro gateway?

**Tu respuesta**: Por ahora solo MercadoPago porque es lo más usado en Argentina. Pero si en un futuro se quiere agregar otro método de pago, se puede hacer.

---

### P4.5 — ¿Cómo funciona el reembolso de seña?

**Estado actual**: Si el jugador cancela DENTRO del plazo (default 12hs antes), se hace refund automático por MP. Si cancela FUERA del plazo, pierde la seña.
**Pregunta**: ¿12 horas de default está bien? ¿Querés que el admin pueda hacer refunds manuales en cualquier momento?

**Tu respuesta**: Reembolso de seña: Proceso condicionado a la "Ventana de Cancelación" del club. Se ejecuta automáticamente como saldo en la Billetera Virtual del usuario si se cancela a tiempo, o queda para el club si se excede el plazo configurado.

> **🔄 ACTUALIZACIÓN 2026-06-18:** **NO hay billetera virtual del jugador en v1.** El reembolso es **directo por MercadoPago** (refund) si cancela dentro de la ventana; si cancela fuera, la seña queda para el complejo. No hay sistema de créditos/saldo a favor del jugador en v1.

---

## 5. ABONADOS (TURNOS FIJOS)

### P5.1 — ¿Cómo se cobra al abonado?

**Estado actual**: 100% manual. El admin registra en el sistema que le cobraron (efectivo o transferencia). TurnoGol NO cobra automáticamente al abonado.
**Contexto en ATC**: ATC funciona exactamente igual — cobro manual con sistema de "saldo a favor". El admin pone el monto que le dieron.
**Pregunta**: ¿Está bien manual para v1? ¿Querés cobro automático por MP para v1.5?

**Tu respuesta**: Esto es muy dificil de saber exactamente, hay que averiguar como lo maneja ATC al detalle para hacerlo igual, si su metodo no falla haremos lo mismo.

---

### P5.2 — ¿El abonado tiene precio fijo o puede variar?

**Estado actual**: El campo `price_per_session` se define al crear el abono y puede ser diferente al precio de lista. El `monthly_price` se pre-llena como `price_per_session × 4.33` pero el admin puede editarlo (ej: redondeo, descuento).
**Contexto en ATC**: ATC deja que el admin ponga el monto que quiera manualmente.
**Pregunta**: ¿Así está bien?

**Tu respuesta**: En el sistema ATC, el precio del abonado (o la reserva de turnos) puede variar y no siempre es un valor fijo automático. La plataforma permite configurar tarifas, pero el precio final depende de la gestión del complejo deportivo.

---

### P5.3 — ¿El abonado tiene fecha de fin o es indefinido?

**Estado actual**: Puede ser indefinido (`ends_on = null`) o tener fecha de fin.
**Pregunta**: ¿Está bien así? ¿O siempre debería tener un vencimiento (ej: renovación mensual)?

**Tu respuesta**: Temporalidad del abonado: El cupo en la grilla (turno fijo) suele ser indefinido y recurrente, mientras que el pago (abono/créditos) generalmente posee una fecha de vencimiento configurada para obligar a la renovación mensual.

---

### P5.4 — ¿Qué pasa si el abonado no viene una semana?

**Estado actual**: La instancia de booking queda como `no_show` si el admin la marca. No hay penalidad automática.
**Pregunta**: ¿Querés penalidad por no-show en abonados? ¿O solo para reservas espontáneas?

**Tu respuesta**: Cancelación parcial de turno fijo: El administrador libera la fecha específica en la grilla sin eliminar la recurrencia; el sistema permite reasignar el crédito al jugador o darlo por perdido según la política de aviso previo del club.

---

### P5.5 — ¿El jugador (abonado) puede cancelar su propia instancia semanal?

**Estado actual**: Sí, si tiene cuenta en TurnoGol y su `player_id` está en el abono. Aplica la política de cancelación del complejo.
**Pregunta**: ¿O preferís que solo el admin pueda cancelar instancias de abonados?

**Tu respuesta**: La mejor configuración en ATC es la transferencia de crédito con vencimiento corto. Es decir: "No venís, te guardo el crédito, pero tenés que usarlo en los próximos 7 días". Así, el club no pierde el dinero y el jugador no siente que lo "estafaron".
En conclusión: Política de Cancelación (Abonados): Decisión estratégica óptima para asegurar la rentabilidad. Combina la liberación automática de la cancha para re-venta con la gestión de créditos basada en el cumplimiento de plazos, automatizando la penalización por inasistencia.

---

### P5.6 — ¿Cuántas semanas adelante se generan los turnos fijos?

**Estado actual**: 8 semanas al crear, y un job diario genera más cuando quedan menos de 4 semanas.
**Pregunta**: ¿8 semanas está bien o querés más/menos?

**Tu respuesta**: Proyección de Turnos Fijos: Indefinida. El sistema bloquea el horario en la grilla del administrador de forma perpetua y automática, mientras que la visibilidad para el público general depende de los "Días de Anticipación" configurados por el complejo.

---

## 6. CANCHAS

### P6.1 — ¿Cuántos estados tiene una cancha?

**Estado actual**: 3 estados: `active`, `maintenance`, `inactive`.
**Pregunta**: ¿Necesitás `maintenance`? ¿O con `active` e `inactive` alcanza?

**Tu respuesta**: Sinceramente es complejo, me gustaría igualar al de ATC. Por lo que veo en ATC, tiene esto: estados de cancha/turno: La cancha puede estar Online u Offline; sus turnos varían entre Disponible, Pendiente (pago en proceso), Confirmada, Bloqueada (mantenimiento/clases) y Finalizada (tiempo cumplido).

---

### P6.2 — ¿Los precios son por cancha o por complejo?

**Estado actual**: Por cancha. Cada cancha tiene su propio JSONB de pricing con franjas horarias.
**Pregunta**: ¿Está bien? ¿O preferís un pricing global del complejo que aplique a todas las canchas?

**Tu respuesta**: Claramente por cancha, todas las canchas tienen distintos precios. O por lo menos la mayoria que yo fui.

---

### P6.3 — ¿Cuántas franjas de precios hay?

**Estado actual**: 5 franjas fijas: weekday_morning, weekday_afternoon, weekday_night, weekend_morning, weekend_night.
**Pregunta**: ¿Están bien esas 5? ¿Necesitás más flexibilidad (ej: un precio distinto por cada hora)?

**Tu respuesta**: En ATC lo manejan así: "Estructura de Tarifas: Las franjas son ilimitadas y se definen mediante "puntos de corte" horarios; el administrador configura manualmente el precio para cada combinación de franja y duración (60/90/120 min) de forma independiente.", sinceramente no sé bien que decidir acá.

---

### P6.4 — ¿Tipos de superficie?

**Estado actual**: `synthetic_grass` | `natural_grass` | `cement` | `indoor`.
**Pregunta**: ¿Estos 4 cubren todos los casos de canchas de fútbol que conocés?

**Tu respuesta**: Clavemos esa pero también podriamos hacer que sea un campo de texto libre para que el admin ponga lo que quiera.

---

## 7. POLÍTICA DE NO-SHOW

### P7.1 — ¿Qué pasa cuando un jugador no viene?

**Estado actual**: El admin marca la reserva como `no_show`. Si hay seña pagada, se retiene. Si el jugador acumula 3 no-shows en 30 días en el mismo complejo, se le banea automáticamente por 7 días en ESE complejo.
**Pregunta**: ¿El ban automático por 3 no-shows está bien? ¿Querés que sea configurable?

**Tu respuesta**: El proceso en ATC es así: "Política de No-show: El administrador marca la falta manualmente para ejecutar la retención de la seña, generar una deuda en la ficha del jugador y activar bloqueos automáticos que impiden nuevas reservas online hasta que se regularice la situación.", haremos lo mismo.

> **🔄 ACTUALIZACIÓN 2026-06-22:** Se implementó explícitamente el **Modelo de Deuda (ATC)**. El ban temporal por acumulación se eliminó. Ahora cada no-show genera una deuda en el jugador equivalente a `precio - seña`. Cualquier deuda `balance > 0` bloquea automáticamente las reservas online hasta que sea saldada en el mostrador.

---

### P7.2 — ¿El ban por no-show es por complejo o global?

**Estado actual**: Por complejo. Si te banean en Complejo A, podés seguir reservando en Complejo B.
**Pregunta**: ¿Así está bien o querés ban global?

**Tu respuesta**: Ban por No-show: Restricción por complejo. Cada club gestiona su propia "Lista Negra" y base de datos de deudores; un bloqueo en un predio no afecta la capacidad del jugador para reservar en otros complejos.

---

## 8. PLANES Y PRICING SaaS

### P8.1 — ¿Los 3 planes están bien?

**Estado actual**:
| Plan | Canchas | Precio mensual | Staff |
|---|---|---|---|
| Básico | 1-3 | $55.000 | 2 |
| Estándar | 4-6 | $88.000 | 5 |
| Full | 7+ | $120.000 | Ilimitado |

**Pregunta**: ¿Estos precios, límites de canchas y staff están bien? ¿Cambiarías algo?

**Tu respuesta**: Los nombres serian:

- Plan Predio (1-3 canchas) $47.000
- Plan Complejo (4-6 canchas) $74.000
- Plan Estadio / Multi-Sede (7+ canchas) $101.000

---

### P8.2 — ¿Trial de 30 días sin tarjeta?

**Estado actual**: Sí. 30 días gratis con acceso completo (features del plan Full), sin pedir tarjeta.
**Pregunta**: ¿Está bien 30 días? ¿Querés que pida tarjeta al registrarse (para mejorar conversión)?

**Tu respuesta**: Está bien 30 días con acceso completo sin pedir tarjeta al inicio.

---

### P8.3 — ¿Descuento por pago anual?

**Estado actual**: 33% de descuento en plan anual.
**Pregunta**: ¿33% está bien? ¿O preferís 20% como ATC?

**Tu respuesta**: 20% de descuento en plan anual, prefiero que la gente pague mes a mes.

---

### P8.4 — ¿IVA incluido o excluido en los precios?

**Estado actual**: Excluido. Se suma 21% en el checkout.
**Pregunta**: ¿Está bien así?

**Tu respuesta**: Está bien así.

---

## 9. NOTIFICACIONES

### P9.1 — ¿Qué canal de notificaciones usa TurnoGol?

**Estado actual**: Solo email (Resend). WhatsApp descartado para v1 por costos.
**Pregunta**: ¿Estás de acuerdo con solo email? ¿O querés push notifications en la PWA?

**Tu respuesta**: Solo email. Es muy caro el tema del whatsapp. También me gustaría usar notificaciones push en la PWA.

---

### P9.2 — ¿Qué notificaciones se envían?

**Estado actual**: Estas son las notificaciones automáticas definidas:
| Evento | Destinatario | Canal |
|---|---|---|
| Reserva confirmada | Jugador | Email |
| Recordatorio 24hs antes | Jugador | Email |
| Cancelación de reserva | Jugador | Email |
| Nuevo registro (bienvenida) | Admin | Email |
| Trial por vencer (día 21, 28, último día) | Admin | Email |
| Cobro fallido (dunning) | Admin | Email |
| Suspensión por falta de pago | Admin | Email |

**Pregunta**: ¿Falta alguna? ¿Sobrá alguna?

**Tu respuesta**: Recordatorio 24hs antes no, es mucho y por ahora no estoy para afrontar el gasto de notificaciones masivas. En el futuro si. Aparte el jugador puede entrar a la web para ver sus reservas.

---

### P9.3 — ¿El admin recibe notificación cuando alguien reserva online?

**Estado actual**: No está explícitamente definido.
**Contexto**: En ATC, el admin ve la reserva aparecer en la grilla en tiempo real. Pero no le llega un email.
**Pregunta**: ¿Querés que le llegue un email al admin cada vez que un jugador reserva online? ¿O solo lo ve en la grilla?

**Tu respuesta**: Si bien está bueno que aparezca en tiempo real, también está bueno. También estaría bueno que le lleguen notificaciones push y un sonido de alerta para avisarle que hay una nueva reserva.

---

## 10. CAJA Y FINANZAS

### P10.1 — ¿El sistema maneja gastos (egresos)?

**Estado actual**: Sí. El campo `type` de CashFlow tiene `income`, `expense` y `adjustment`.
**Contexto en ATC**: ATC tiene caja (ingresos) y stock pero NO gestión de gastos.
**Pregunta**: ¿Querés gestión de gastos (luz, agua, sueldos) o solo ingresos?

**Tu respuesta**: No, no quiero gestión de gastos. Solo ingresos y sin stock. No me gusta tocar lo que no sé. Para eso ya tengo otros sistemas. Este es solo para reservas.

> **🔄 ACTUALIZACIÓN 2026-06-18:** Cambio de opinión → **SÍ se manejan gastos**. `cashflow_type` incluye `expense` con categoría `operating_expense` (migración 025, "rediseño de Caja"). Manejo de caja completo (ingresos + gastos + cierre diario).

---

### P10.2 — ¿Cierre de caja diario?

**Estado actual**: Sí. El admin puede cerrar la caja del día, declarar cuánto efectivo tiene, y el sistema calcula la diferencia.
**Pregunta**: ¿Esto te parece útil o es overkill para v1?

**Tu respuesta**: Si, tiene que tener cierre de caja diario. Es FUNDAMENTAL para llevar control del dinero.

---

### P10.3 — ¿Productos de cantina (stock)?

**Estado actual**: Sí. Entidad `Product` con stock, categorías, alerta de stock bajo.
**Pregunta**: ¿Querés gestión de stock en v1 o lo dejás para después?

**Tu respuesta**: No, no quiero gestión de stock. Solo ingresos y sin stock. No me gusta tocar lo que no sé. Para eso ya tengo otros sistemas. Este es solo para reservas.

> **🔄 ACTUALIZACIÓN 2026-06-18:** Cambio de opinión → **SÍ hay stock/cantina en v1**. Tabla `products` (precio, stock, alerta de stock bajo, categoría). Las ventas generan CashFlow categoría `product_sale`.

---

## 11. EXPERIENCIA DEL JUGADOR (B2C)

### P11.1 — ¿El jugador tiene una "app" o es web?

**Estado actual**: Es una PWA (Progressive Web App). No hay app nativa en las stores.
**Pregunta**: ¿Está bien PWA para v1? ¿O querés app nativa desde el inicio?

**Tu respuesta**: Está bien PWA para v1. No quiero app nativa desde el inicio. En el futuro lo veremos.

---

### P11.2 — ¿El jugador puede ver canchas de varios complejos?

**Estado actual**: Sí. La página pública de cada complejo (`turnogol.app/complejo-san-martin`) muestra disponibilidad. El jugador puede buscar en varios complejos.
**Pregunta**: ¿Querés un "buscador/marketplace" donde el jugador ponga su zona y vea todos los complejos cerca? ¿O cada complejo tiene su link independiente?

**Tu respuesta**: Si, también estaría bueno un buscador/marketplace donde el jugador ponga su zona y vea todos los complejos cerca. Pienso implementar el portal de ese estilo y todo eso ahora.

---

### P11.3 — ¿El jugador ve los precios antes de reservar?

**Estado actual**: Sí. En la página pública se muestra el precio del slot.
**Pregunta**: ¿Está bien? ¿Algunos complejos prefieren ocultar precios?

**Tu respuesta**: Si, ve los precios antes de reservar.

---

### P11.4 — ¿Login con Google/Apple además de magic link?

**Estado actual**: Sí. Magic link + Google OAuth para jugadores. Solo magic link para staff.
**Pregunta**: ¿Querés Apple login también? ¿O solo Google + magic link?

**Tu respuesta**: Magic Link y GOOGLE seria genial. No hace falta Apple. Staff no existe.

### P12.1 — ¿4 pasos en el wizard está bien?

**Estado actual**: Paso 1 (datos complejo) → Paso 2 (canchas) → Paso 3 (horarios) → Paso 4 (seña/MP).
**Pregunta**: ¿Cambiarías algo de los pasos?

**Tu respuesta**: Excelente! Me gusta.

---

### P12.2 — ¿Precios pre-cargados en el wizard?

**Estado actual**: Sí. Se pre-cargan precios razonables ($8k-$15k ARS según franja) para que el admin solo edite lo que difiere.
**Pregunta**: ¿Te parece bien? ¿Preferís que el admin tenga que poner sus precios a mano?

**Tu respuesta**: Mmmm no, me parece raro que pongamos precios pre-cargados. Cada complejo maneja todos precios distintos. Lo mejor es que lo ponga a mano el admin de como ya cobra en su complejo.

---

## 13. REPORTES

### P13.1 — ¿Qué reportes necesita el admin?

**Estado actual**: Ocupación por cancha, ingresos por período, top jugadores, tasa de no-show, exportación CSV/Excel.
**Pregunta**: ¿Falta algún reporte que consideres importante?

**Tu respuesta**: Para mí deberían tener:

- Ingresos por cancha
- Ingresos por día
- Ingresos por mes
- Total de reservas por cancha
- Total de reservas por día
- Total de reservas por mes

---

### P13.2 — ¿Reportes avanzados solo para plan Estándar y Full?

**Estado actual**: Sí. El plan Básico tiene reportes limitados.
**Pregunta**: ¿Qué reportes son "avanzados" vs "básicos" para vos?

**Tu respuesta**: Para todos los planes los reportes son los mismos.

---

## 14. FUNCIONALIDADES DESCARTADAS (¿SEGURO?)

### P14.1 — Partidos abiertos (marketplace social)

**Estado actual**: Fuera de scope v1. Deferido a v1.5.
**Contexto**: Esto es tipo "necesito 2 más para completar el equipo" y que jugadores se sumen.
**Pregunta**: ¿Confirmás que queda fuera de v1?

**Tu respuesta**: Queda afuera para v1.

> **🔄 ACTUALIZACIÓN 2026-06-18:** Sigue **fuera de v1** y además hay que **eliminar del código** todo rastro de esta feature: tablas `open_matches` + `open_match_players`, enum `open_match_status`, triggers/RLS y cualquier servicio/ruta. Se rediseñará desde cero más adelante.

---

### P14.2 — Canchas transformables

**Estado actual**: Fuera de scope v1. Una cancha de fútbol 11 que se divide en 2 de fútbol 5.
**Pregunta**: ¿Confirmás que queda fuera?

**Tu respuesta**: Queda afuera para v1.

---

### P14.3 — Torneos y ligas

**Estado actual**: Fuera de scope (v2).
**Pregunta**: ¿Confirmás?

**Tu respuesta**: Queda afuera para v1.

---

### P14.4 — Facturación AFIP

**Estado actual**: Fuera de scope v1. El complejo maneja su facturación aparte.
**Pregunta**: ¿Confirmás?

**Tu respuesta**: Queda afuera para v1.

---

### P14.5 — WhatsApp como canal de notificaciones

**Estado actual**: Descartado para v1 por costos (~$0.05-0.09 USD por mensaje via BSP).
**Pregunta**: ¿Confirmás que v1 es solo email?

**Tu respuesta**: Queda afuera para v1.

---

### P14.6 — App nativa (iOS/Android)

**Estado actual**: PWA para v1. App nativa evaluada para v2.
**Pregunta**: ¿Confirmás?

**Tu respuesta**: Si, PWA para v1. App nativa evaluada para v2.

---

## 15. DECISIONES YA TOMADAS (CONFIRMACIÓN RÁPIDA)

Marcá ✅ si confirmás, ❌ si querés cambiar:

| #   | Decisión                                                                    | Estado   | Tu ✅/❌ |
| --- | --------------------------------------------------------------------------- | -------- | -------- |
| D1  | Montos en centavos de ARS (nunca decimales)                                 | Definido |    ✅      |
| D2  | Timestamps en UTC, conversión a ART en frontend                             | Definido |    ✅      |
| D3  | UUIDs como primary keys (nunca autoincremental)                             | Definido |    ✅      |
| D4  | Magic link para login (sin contraseñas)                                     | Definido |    ✅ . Si pero también es necesario que quede iniciada la sesión en su dispositivo, si tenemos que usar cookies o algo por el estilo, usamos.      |
| D5  | Ortografía `canceled` (no `cancelled`)                                      | Definido |    ✅      |
| D6  | RLS en PostgreSQL para aislamiento de datos                                 | Definido |    ✅      |
| D7  | Un tenant = un complejo (no multi-sede)                                     | Definido |    ✅      |
| D8  | Jugador es cross-tenant (reserva en N complejos)                            | Definido |    ✅      |
| D9  | Señas van directo al complejo (TurnoGol no intermedia)                      | Definido |    ✅      |
| D10 | El auto-complete de booking es 30 min post-horario                          | Definido |    ✅      |
| D11 | No-show inmutable (no se puede volver a completed)                          | Definido |    ✅      |
| D12 | Audit logs INSERT-only (nunca se borran ni editan)                          | Definido |    ✅      |
| D13 | Declaración jurada +18 obligatoria para jugadores                           | Definido |    ✅      |
| D14 | Server Actions para mutaciones UI, Route Handlers solo webhooks/API pública | Definido |    ✅      |
| D15 | Booking de tipo `event` eliminado (solo spontaneous/fixed/block)            | Definido |    ✅      |
| D16 | `guest_name`/`guest_phone` en bookings para jugadores sin cuenta            | Definido |    ✅      |

---

## 16. PREGUNTAS ABIERTAS DE NEGOCIO

### P16.1 — ¿Cómo se manejan los feriados?

**Estado actual**: El admin puede agregar `closed_dates` (fechas cerradas) y crear bloqueos de tipo `block`.
**Pregunta**: ¿Los feriados nacionales se cargan automáticamente o el admin los pone a mano?

**Tu respuesta**: Ni idea, hay que averiguar como lo maneja ATC. Creo que lo maneja así "Gestión de Feriados: Se maneja manualmente desde el calendario administrativo bajo dos estados: Feriado (aplica tarifas especiales pre-configuradas) o Cerrado (bloquea la reserva online y requiere la cancelación manual de los turnos fijos de ese día).", sino averigualo.

---

### P16.2 — ¿Hay promociones o descuentos por horario?

**Contexto**: Algunos complejos hacen "2x1 los martes de 10 a 14hs" para llenar horarios bajos.
**Estado actual**: NO hay sistema de promociones. Solo precios fijos por franja.
**Pregunta**: ¿Querés promociones en v1 o lo dejás para después?

**Tu respuesta**: Ni idea, hay que ver como lo maneja ATC y ver si se puede implementar. Encontré algo así en ATC: "Promociones en ATC: No utiliza cupones, sino que basa los descuentos en tarifas diferenciadas por franjas horarias y precios especiales para socios, permitiendo además ajustes manuales de último momento para llenar la grilla."

---

### P16.3 — ¿El complejo puede tener múltiples sedes?

**Estado actual**: NO. Un tenant = una sede. Si el dueño tiene 2 complejos, crea 2 cuentas.
**Pregunta**: ¿Está bien así?

**Tu respuesta**: No, los complejos si pueden tener múltiples complejos, pero que creen una cuenta por complejo.

---

### P16.4 — ¿Hay importador de datos de ATC?

**Estado actual**: Mencionado en doc2 como "switching cost solution" pero no hay nada diseñado.
**Pregunta**: ¿Querés importador CSV en v1 para captar clientes de ATC?

**Tu respuesta**: Mmm no tengo la menor idea, pero parece una buena idea. Habría que ver como lo maneja ATC y ver si se puede implementar. No tengo idea de lo que hablas sinceramente.

---

### P16.5 — ¿El complejo puede personalizar su página pública?

**Estado actual**: Logo, cover photo, descripción, dirección. No hay personalización de colores o diseño.
**Pregunta**: ¿Suficiente para v1?

**Tu respuesta**: La verdad que sí pero con matices. En ATC por lo que veo solamente es una sola foto que aparecería como una cancha de referencia o logos, después abajo te aparecen las canchas que tienen... No hay una foto por cancha, sino ordenadas tipo "Cancha 1 F5, Cancha 2 F5, Cancha 1 F8, etc" y abajo en chiquito las especificaciones de cada una, "Cesped sintetico, con iluminacion, etc".
Después es una grilla bastante linda en donde se ve bastante interactiva para darte cuenta que horarios están disponible, apretas un horario que quieras disponible y te sale un mini modal con el precio que supongo que le asignan a esa cancha, pones continuar y te lleva al detalle. En el detalle se ve el Nombre, Numero de telefono y mail que se autocompleta con los datos que tenga en la cuenta de jugador, en este caso me logueé con google y quedó mi mail (No editable se ve) pero si el numero de telefono y nombre. A la izquierda se ve el detalle de la reserva con Fecha 21/11/2026, Turno 19:00 - 20:00, Descripción de la cancha "Cancha 3 F5 - Fútbol 5
Césped sintético, Con iluminación, Descubierta" y el precio así: "Precio
$ 60000
Tasa de servicio
$ 600
$ 0
Anticipo / Adelanto: *
(50% del valor del turno)

$ 30000", un cartel de advertencia que dice "Sobre el pago
Sólo se debitará el importe del anticipo/adelanto
Abonarás luego el saldo restante de la reserva (si lo hubiera). En caso de que canceles con 48 hs de anticipación, se te reintegrará el importe automáticamente.


". Despues un boton que dicen "Continuar" y te manda a esto:

"Icono de deporte Fútbol 5
Fútbol 5
Distrito Fútbol - Constitucion
Salta 1727 , Capital Federal
Fecha
jue. 23/04/2026
Turno
19:00 - 20:00
Cancha 3 F5 -
Césped sintético, Con iluminación, Descubierta
Precio
$ 60000
Anticipo / Adelanto: *
$ 30000
Tenes 05:24 segundos para pagar

Ir a Pagar
Cancelar", pongo "Ir a pagar" y me manda a un checkout de mercado pago. Asi que es sencillo como pensabamos. Para el flujo de reserva quiero que hagamos lo mismo. También tengo que aclarar que antes de presionar para reservar me apareció un modal que debo registrarme o logearme con google, claramente todos hacen con Google  asi que esa debe ser la funcionalidad main fija.
También es importante aclarar que yo pensaba que yo dije que no se cargaban los logos pero cuando te muestra el resumen que te dice "Ir a pagar" o "Cancelar" te aparece el logo del lugar, asi que si tambien necesitamos poner que cargue su logo o si no tienen una foto por defecto linda y generica.

---

### P16.6 — ¿Soporte al cliente: cómo se maneja?

**Estado actual**: Email (soporte@turnogol.app). No hay chat, no hay ticket system.
**Pregunta**: ¿Email alcanza para v1?

**Tu respuesta**: El soporte voy a poner el mail por ahora, en la v1.5 voy a agregar un soporte mas complejo. Pero con el mail alcanza por ahora.

---

### P16.7 — ¿Cómo se actualiza el precio del plan con la inflación?

**Estado actual**: Notificación 30 días antes al cliente mensual. Cliente anual mantiene precio hasta renovación. Tabla `price_versions` para historial.
**Pregunta**: ¿Así está bien?

**Tu respuesta**: Mmmm vayamos viendolo, no queda muy profesional eso de avisar 30 días antes pero si no queda otra habrá que hacerlo asi.

---

> [!TIP]
> **Después de responder todo esto**, yo actualizo automáticamente:
>
> - CLAUDE.md (reglas del proyecto)
> - doc6 (entidades y state machines)
> - doc13 (schema SQL)
> - doc14 (tech stack)
> - doc15 (API contracts)
> - Y cualquier otro doc afectado
>
> Tus respuestas se convierten en la fuente de verdad definitiva del sistema.
