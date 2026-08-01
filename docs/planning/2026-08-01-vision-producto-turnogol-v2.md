# TurnoGol v2 — Visión de producto

**Fecha:** 2026-08-01
**Autor:** Sesión de diseño de producto (rol: Principal Product Designer) sobre la base de la auditoría UX/UI del 2026-08-01 (`docs/audit/reports/2026-08-01-auditoria-ux-ui-plataforma.md`).
**Qué es este documento:** una visión de cómo debería sentirse y funcionar TurnoGol si se diseñara hoy desde cero, sin deuda con la implementación actual.
**Qué NO es:** un roadmap, una spec técnica, una lista de bugs. No menciona componentes, clases ni frameworks salvo donde una decisión de producto lo exija.

---

## 0. Resumen ejecutivo

### La tesis

TurnoGol no compite contra ATC Sports. Compite contra **el cuaderno de espiral y el grupo de WhatsApp**. El cuaderno nunca se cae, nunca pide login, nunca miente sobre cuánta plata hay, y Marcelo confía en él hace 15 años. Toda decisión de diseño de v2 se evalúa contra esa vara: *¿esto es más rápido, más confiable y más tranquilizador que el cuaderno?* Si no, el diseño está mal.

La segunda mitad de la tesis: en un complejo de fútbol **todo lo que pasa es una de dos cosas: tiempo de cancha o plata**. La plataforma actual está organizada por sustantivos de base de datos (una tabla → una página del menú). La v2 se organiza por esas dos corrientes:

- **El tiempo** → la Grilla. Todo lo que ocupa una cancha (reserva suelta, fijo, torneo, mantenimiento) se ve y se opera ahí.
- **La plata** → la Caja. Todo peso que entra o sale (turno, cantina, torneo, gasto, fiado) es un movimiento de la misma corriente, con un único número siempre visible.

Todo lo demás — jugadores, abonados, métricas — son **vistas derivadas** de esas dos corrientes, no mundos paralelos.

### Los cinco cambios grandes

1. **Nace "Hoy"**, un home de estado para el dueño: la plata del día, la ocupación, lo que pasó mientras no miraba y las alertas que requieren acción. Cinco segundos, cero clicks, mobile primero. Hoy la app aterriza en una herramienta operativa (la grilla) y nunca responde la pregunta emocional con la que el dueño abre: *"¿está todo bien?"*.
2. **La Grilla se convierte en el sistema operativo del turno.** El encargado hace el 90% de su jornada sin salir de ella: reservar, cobrar, vender cantina al turno, marcar ausencias, ver quién es el jugador. El color de los slots deja de codificar "estado de la reserva" y pasa a codificar **estado del cobro**, porque eso es lo que el mostrador necesita leer de un vistazo.
3. **La Caja se unifica y aparece "Plata en la calle".** Caja, cantina, fiados, cuotas de torneo y turnos jugados sin cobrar dejan de vivir en compartimentos: una sola corriente de movimientos, un solo número de "hoy", y una lista única de deudas con cobro a un tap. El cierre de caja pasa de "un formulario más" a un ritual guiado de 90 segundos.
4. **El jugador reserva antes de identificarse.** El flujo online se diseña para ganarle a la llamada telefónica (~60 segundos): elegir horario sin login, poner nombre y contacto, confirmar. La verificación por email ocurre *después* de asegurar la cancha, nunca en el medio del checkout. La confirmación se vuelve un objeto compartible pensado para el grupo de WhatsApp del equipo.
5. **Abonados y Torneos dejan de ser módulos y pasan a ser capas de la Grilla.** Un abonado es "los lunes 21, cancha 3, de Diego": un patrón de reserva con contrato de cobro. Un torneo es un bloque de horas con un fixture adentro. Ambos nacen desde la grilla y se ven en la grilla; sus páginas propias quedan como vistas de gestión (contratos, fixture, tabla), no como mundos con listas duplicadas de personas.

### El meta-tema: confianza

Un SaaS que maneja la plata de un negocio familiar no se juzga por lindo: se juzga por si **los números cuadran y el sistema nunca se hace el distraído**. La confianza en v2 es un feature con requisitos concretos: el mismo número en todas las pantallas, ninguna acción de plata sin rastro de quién y cuándo, ningún error de cobro silencioso, ninguna acción irreversible a un tap, y feedback inmediato de que el sistema vio lo que hiciste. El día que la grilla diga 12 turnos cobrados y la caja diga otra cosa, Marcelo vuelve al cuaderno — y tiene razón.

---

## 1. Las personas, releídas desde su jornada real

La v2 no diseña para "usuarios": diseña para cuatro jornadas laborales concretas. Nota de vocabulario: en TurnoGol el "dueño" y el "administrador" son la misma persona con el mismo rol (Marcelo); el "empleado/encargado" es el manager (Rodrigo). Se responden las diez preguntas del brief para cada uno.

### 1.1 Marcelo — dueño (rol admin)

Tiene ~50 años, atiende el complejo algunas noches y delega el resto. Mira la plataforma desde el teléfono, en el sillón, a la noche. No es tech-savvy: es **planilla-savvy** — entiende números, no interfaces.

- **Objetivo real al abrir:** confirmar que el negocio está bien y que nadie (ni el sistema, ni un empleado, ni un cliente) le está haciendo perder plata.
- **Qué necesita ver en 5 segundos:** la plata de hoy, la ocupación de hoy, y si hay algo que requiera su intervención. Nada más.
- **Qué información sobra:** todo lo operativo (formularios de reserva, catálogo de cantina) y todo gráfico que no cambie una decisión. Un dashboard con ejes y leyendas es ruido para él; un número grande con una comparación ("$184.500 · +12% vs el lunes pasado") es información.
- **Qué información falta hoy:** el estado del día de un vistazo; cuánta plata está "en la calle" (jugada y no cobrada); qué pasó mientras no miraba (reservas online, cancelaciones); alertas de cosas rotas (una seña que falló, la caja de ayer sin cerrar).
- **Decisiones que intenta tomar:** ¿ajusto precios? ¿abro/cierro un horario? ¿este cliente merece que lo banee o lo perdone? ¿la cantina da plata o es un hobby? ¿renuevo la suscripción del sistema?
- **Tareas que repite:** mirar el día (varias veces), revisar el cierre de caja de anoche, cada tanto tocar un precio o un horario.
- **Con menos clics:** ver el estado del negocio (hoy requiere navegar y componer mentalmente desde 3 páginas; debe ser cero clicks); aprobar o deshacer algo puntual desde el teléfono.
- **Qué automatizar:** el resumen diario (que le llegue, no que lo busque); los avisos de anomalías; la conciliación entre lo esperado y lo contado.
- **Qué le genera ansiedad:** no saber si la seña de MercadoPago realmente entró; las diferencias de caja sin explicación; sospechar que "el sistema anda mal" cuando ve dos números distintos para lo mismo.
- **Qué le genera confianza:** números que cuadran entre sí y con el banco; el rastro de quién hizo cada cosa; que el sistema le avise los problemas antes de que los descubra solo.

### 1.2 Rodrigo — encargado (rol manager)

Trabaja el turno de la tarde-noche, 6-8 horas de pie en el mostrador. Atiende el teléfono, cobra, vende Gatorade, resuelve conflictos de horarios. Usa la plataforma **mientras hace otra cosa**: con el teléfono en la oreja, con una fila de tres personas, con el partido de las 21 pidiendo la pelota.

- **Objetivo real al abrir:** ver la noche de hoy y no cometer errores caros: no pisar una reserva, no olvidarse un cobro, no dar mal un vuelto.
- **Qué necesita ver en 5 segundos:** la grilla de HOY, posicionada en la hora actual, con lo que está por empezar y lo que está sin cobrar saltando a la vista.
- **Qué información sobra:** métricas, configuración, todo lo que no sea la operación de las próximas 4 horas. También sobran los formularios largos: cada campo que se le pide con el teléfono en la oreja es un riesgo.
- **Qué información falta hoy:** el estado de cobro de cada turno de un vistazo (¿señó? ¿cuánto falta?); la ficha rápida del que llama ("Juan de los lunes" vs un desconocido con historial de ausencias); qué turnos de la noche terminaron sin que nadie los cobre.
- **Decisiones que intenta tomar:** ¿le doy el turno a este que llama o lo tiene señado otro? ¿le fío la gaseosa? ¿lo marco ausente o le espero 10 minutos más? ¿acepto el cambio de horario?
- **Tareas que repite todos los días:** anotar reservas telefónicas (decenas), cobrar turnos, vender cantina, marcar jugados/ausentes, abrir y cerrar la caja.
- **Con menos clics:** crear una reserva (hoy: navegar, modal, varios campos; debe ser: click en el slot, un nombre, Enter); cobrar turno + cantina en una sola transacción; vender tres productos en cuatro toques.
- **Qué automatizar:** el precio (lo sabe el sistema, nunca tipearlo); la detección de turnos terminados sin cobrar ("¿pasó algo con la 3 de las 20?"); el cálculo del cierre.
- **Qué le genera ansiedad:** la fila creciendo mientras la pantalla carga; pisar una reserva; que la caja no cierre y parezca que faltó plata en su turno; tocar algo sin querer y no poder deshacerlo.
- **Qué le genera confianza:** que cada acción responda al instante y deje rastro visible; poder deshacer; que el sistema le marque lo que se le pasó en vez de dejarlo quedar mal con el dueño.

### 1.3 Tomás — jugador

28 años, organiza el fútbol de los jueves de su grupo. Todo pasa en WhatsApp: armar el equipo, dividir la plata, avisar el que falta. Reserva desde el teléfono, en el bondi, en dos minutos muertos.

- **Objetivo real al abrir:** conseguir cancha para el día y hora que su grupo puede, al precio que ve, y tener **prueba** de que la cancha es suya.
- **Qué necesita ver en 5 segundos:** horarios libres de HOY y los próximos días con el precio al lado. Sin login, sin registro, sin pasos previos.
- **Qué información sobra:** cualquier pedido de datos antes de mostrar disponibilidad; formularios con campos que el complejo no necesita; textos institucionales.
- **Qué información falta hoy:** cuánto sale ahora vs cuánto se paga allá (cuando hay seña); la dirección y el cómo llegar en la confirmación; una pieza compartible para el grupo; hasta cuándo puede cancelar sin costo.
- **Decisiones que intenta tomar:** ¿este horario a este precio, o busco otro? ¿pago la seña o pierdo el turno? ¿cancelo o consigo un reemplazo?
- **Tareas que repite:** reservar el mismo complejo, mismo día, misma hora, casi todas las semanas. La plataforma debería reconocerlo y ofrecerle su hábito ("¿Jueves 21, como siempre?").
- **Con menos clics:** repetir su reserva habitual (un toque desde el link que ya tiene); cancelar (hoy implica encontrar el mail, loguearse, navegar).
- **Qué automatizar:** el recordatorio del partido; el aviso al complejo si cancela; la re-oferta del horario que liberó a otros jugadores frecuentes.
- **Qué le genera ansiedad:** la duda de si la reserva existe ("¿me la guardaron o cuando llegue está ocupada?"); pagar una seña y no ver reflejo inmediato; los procesos de login en el medio de un pago.
- **Qué le genera confianza:** confirmación instantánea con comprobante compartible; ver el estado de su seña; poder cancelar solo, sin llamar; que el complejo "lo conozca" cuando vuelve.

### 1.4 Lazar — super-admin (el negocio SaaS)

Fundador-operador. Su plataforma interna no es un producto: es su tablero de control de churn y soporte.

- **Objetivo real al abrir:** saber si el negocio crece o sangra, y detectar el tenant que necesita ayuda **antes** de que se vaya.
- **Qué necesita ver en 5 segundos:** MRR, tenants activos/en riesgo, y errores de producción que estén afectando usuarios.
- **Qué información sobra:** listados planos de tenants sin señal de vida; métricas vanidosas sin acción asociada.
- **Qué información falta:** los signos vitales por tenant (última actividad del staff, reservas de los últimos 7 días, estado de pago) compuestos en un semáforo de riesgo; el "dejó de cargar reservas hace 10 días" que anticipa el churn 60 días antes que el impago.
- **Decisiones:** ¿a quién llamo hoy? ¿a quién le doy descuento? ¿qué bug priorizo?
- **Con menos clics:** impersonar para soporte (con salida inequívoca); ver la historia de facturación de un tenant.
- **Qué automatizar:** el score de riesgo; las alertas de inactividad; el aviso de pago fallido de suscripción.
- **Ansiedad:** enterarse de un problema por el cliente y no por el sistema.
- **Confianza:** que el panel cuente la verdad operativa, no la verdad contable.

---

## 2. Los principios de diseño de v2

Siete principios. Cada decisión de las secciones siguientes se deriva de acá; si una pantalla los contradice, la pantalla está mal.

**P1 — La pregunta antes que el dato.** Cada pantalla existe para responder UNA pregunta de una persona concreta ("¿está todo bien?", "¿qué pasa ahora en las canchas?", "¿cuánta plata hay?"). Lo que no ayuda a responderla se va de la pantalla, aunque el dato exista en la base. Fundamento: la memoria de trabajo humana sostiene ~4 unidades; cada elemento extra compite por ese presupuesto y sube el tiempo de decisión (ley de Hick). En un producto de 8 horas diarias, el costo se paga cientos de veces por día.

**P2 — La plata siempre visible, siempre cuadrada.** El número del día vive en un lugar fijo y persistente de la superficie de trabajo. El mismo hecho económico muestra el mismo número en todas las vistas, sin excepción — es el invariante #1 del producto. Fundamento: visibilidad del estado del sistema (Nielsen H1) aplicada al objeto de mayor ansiedad del usuario; la inconsistencia numérica no es un bug visual, es la destrucción del contrato de confianza.

**P3 — Velocidad de mostrador.** Las acciones de alta frecuencia (reservar, cobrar, vender) se diseñan para ejecutarse con el teléfono en la oreja: máximo dos interacciones desde la grilla, defaults completos, Enter confirma, blancos táctiles grandes y cerca del pulgar (ley de Fitts). Los expertos reciben aceleradores (una barra de comando que entiende "juan 21 c3") sin que los novatos los necesiten (Nielsen H7: flexibilidad y eficiencia).

**P4 — Fricción proporcional al daño.** Nada irreversible a un tap; nada trivial con confirmación. Tres niveles: acciones reversibles baratas ejecutan al instante con **Deshacer** de 10 segundos (patrón Gmail: el undo es mejor que la confirmación porque no interrumpe al 99% que no se equivocó); acciones costosas pero reversibles piden una confirmación con contexto real ("se le captura la seña de $8.000 y queda bloqueado 14 días — ¿seguro?"); acciones irreversibles con plata piden confirmación explícita reforzada. Las confirmaciones genéricas ("¿Está seguro?") quedan prohibidas: entrenan el click automático y no protegen nada.

**P5 — Una verdad, muchas vistas.** Abonados, torneos, deudas y métricas no son mundos: son lentes sobre las dos corrientes (tiempo y plata). Ninguna entidad se gestiona en dos lugares con dos listas; toda ficha (jugador, turno, movimiento) se abre desde cualquier superficie como panel, sin navegar. Fundamento: el cambio de contexto destruye la memoria de trabajo del operador; mantener la grilla visible mientras se opera sobre un turno elimina la re-orientación al volver.

**P6 — El sistema trabaja de noche.** Todo lo que una computadora puede hacer sola, lo hace sola — y le muestra al humano el resultado para confirmar, no el trabajo para hacer. El sistema calcula el cierre, detecta el turno sin cobrar, sugiere el no-show, recuerda el partido, re-ofrece la hora liberada. El humano decide; el sistema prepara. Fundamento: ley de Tesler — la complejidad del dominio no desaparece, solo se decide quién la absorbe. En v1 la absorbe Rodrigo; en v2 la absorbe el software.

**P7 — Confianza > densidad > estética.** Ante cualquier trade-off, gana en ese orden. Un dato menos pero verificable le gana a dos datos con dudas; una tabla densa y legible le gana a una tarjeta linda que esconde; y nada — ningún gradiente, ningún dark mode, ninguna animación — se aprueba si le cuesta un punto de legibilidad a un señor de 50 años bajo la luz cruda del mostrador.

---

## 3. La arquitectura de información, repensada

### 3.1 El diagnóstico

La navegación actual del admin es un espejo del schema: Grilla, Caja y Cantina, Jugadores, Abonados, Torneos, Métricas, Configuración, Equipo… Una tabla, una página. Eso produce tres enfermedades:

1. **Entidades solapadas compiten por el mismo concepto.** Un abonado es un jugador con un contrato; hoy son dos módulos con dos listas de personas. La deuda de un fiado vive en Cantina, la de un turno en la grilla, la de un torneo en Torneos: la pregunta "¿quién me debe plata?" no tiene página.
2. **No hay un lugar que responda "¿cómo estamos?".** El home es una herramienta (la grilla); el estado del negocio hay que armarlo mentalmente visitando tres módulos.
3. **La jerarquía es plana**: ocho ítems del mismo peso, cuando la realidad de uso es 80% grilla+caja, 15% clientes, 5% el resto.

### 3.2 El mapa de v2

Seis espacios para el staff, ordenados por frecuencia real de uso:

| Espacio | Pregunta que responde | Quién vive ahí |
|---|---|---|
| **Hoy** | ¿Está todo bien? ¿Qué necesita mi atención? | Marcelo (home por defecto del admin) |
| **Grilla** | ¿Qué pasa con las canchas, ahora y esta semana? | Rodrigo (home por defecto del manager) |
| **Caja** | ¿Cuánta plata entró, salió y falta cobrar? | Rodrigo opera, Marcelo controla |
| **Clientes** | ¿Quién es esta persona y qué relación tenemos? | Ambos, siempre vía ficha-panel |
| **Torneos** | ¿Cómo va la competencia? (solo si el complejo los usa) | Marcelo crea, Rodrigo opera |
| **Métricas** | ¿Qué decisión de negocio tengo que tomar? | Marcelo |

Más **Configuración** (fuera del flujo diario, abajo, agrupada por intención: *Tu complejo* — canchas, horarios, precios, foto/portal; *Tu plata* — MercadoPago, señas; *Tu equipo*; *Avisos*).

**Qué se fusiona:** Jugadores + Abonados → Clientes (los fijos son una pestaña de Clientes y una capa de la Grilla, no un módulo). Caja + Cantina + fiados + deudas de turnos → Caja. Reportes/exports → dentro de Métricas.

**Qué desaparece como concepto de navegación:** "Abonados" como ítem; "Cantina" como sub-mundo con identidad propia (queda como *modo de venta* dentro de Caja y como acción dentro del turno); la campana de notificaciones como bandeja separada (la actividad vive en Hoy).

**Qué se divide:** de "Configuración → Canchas" se separa **Precios** como superficie propia con vista de calendario semanal (los precios son la palanca de negocio #1 del dueño; hoy están enterrados como reglas dentro del form de cada cancha). El **cierre de caja** deja de ser un botón dentro de Caja y se vuelve un flujo propio con pantalla completa.

**Roles:** el manager ve Hoy (versión operativa: sin plata acumulada del mes), Grilla, Caja, Clientes y Torneos. Solo el admin ve Métricas completas y Configuración. La regla de diseño: el manager ve toda la plata **del día que opera** (la necesita para cerrar caja) y nada de la plata **del negocio** (márgenes, tendencias, suscripción).

### 3.3 La navegación misma

- **Desktop (el puesto del mostrador):** barra lateral compacta con los 6 espacios + configuración abajo. Sin submenús desplegables: cada espacio resuelve su estructura interna con pestañas o filtros persistentes. El espacio activo es evidente; el número de "Hoy: $X" acompaña en la barra, visible desde cualquier espacio (P2).
- **Mobile (el bolsillo del dueño):** barra inferior de 4 accesos — Hoy, Grilla, Caja, Más. El pulgar llega a todo (Fitts); "Más" agrupa lo infrecuente. Nada de hamburguesa como acceso primario: los tres espacios diarios están siempre a un toque.
- **En todas partes:** una acción global de creación ("+") con las 3 altas reales (reserva, venta, gasto) y una búsqueda global que encuentra personas y turnos. Ambas alimentan la misma barra de comando (ver §4.2).

---

## 4. Pantalla por pantalla

Cada pantalla importante se responde con el mismo cuestionario: objetivo, qué domina visualmente, qué desaparece, qué se mueve, qué se fusiona o divide, qué acciones son primarias, qué distrae hoy.

### 4.1 Hoy (pantalla nueva — home del admin)

*Cómo se siente:* Marcelo abre la app a las 23:40 desde el sillón. En una pantalla, sin scroll, sabe que hoy entraron $184.500, que la noche está 9/12 ocupada, que entraron dos reservas online mientras cenaba, y que hay un turno de las 22 sin cobrar. Cierra la app. Duró ocho segundos y bajó la ansiedad en vez de subirla.

- **Objetivo:** responder "¿está todo bien?" en 5 segundos y encaminar lo único que requiera acción.
- **Qué domina visualmente:** un solo número — la plata cobrada hoy — con su comparación honesta (mismo día de la semana pasada, no "ayer": el negocio es semanal). Al lado, ocupación del día (9/12 turnos) y **plata en la calle** (pendiente de cobro). Tres cifras, tipografía enorme, cero decoración.
- **Debajo, dos bloques y nada más:**
  1. **"Mientras no estabas"** — el feed de lo que ocurrió sin él: reservas online entrantes (el momento-magia del producto: *el sistema vendió por vos*), cancelaciones, señas acreditadas. Cada ítem con hora y acceso a su ficha.
  2. **"Necesita tu atención"** — solo anomalías accionables: caja de ayer sin cerrar, turno jugado sin cobrar, seña que falló, cliente que llegó a su segundo no-show. Cada alerta con su acción al lado. Si no hay nada, lo dice con orgullo: "Nada pendiente. Todo cobrado y cerrado." — el estado vacío acá es el premio.
- **Qué desaparece:** gráficos. Ningún chart en Hoy: un gráfico es una herramienta de análisis, y Hoy es un parte de situación. El análisis vive en Métricas.
- **Qué se mueve acá:** las notificaciones (hoy una campana-bandeja aparte) se disuelven en "Mientras no estabas"; las tareas de onboarding pendientes (activar señas, subir foto) aparecen como misiones discretas hasta completarse.
- **Acciones primarias:** una sola — la que la alerta más grave pida. Hoy no es una pantalla de hacer: es de leer y decidir.
- **Qué distrae hoy:** el concepto entero falta; el admin aterriza en la grilla (una herramienta de encargado) y el estado del negocio no existe como pantalla. Este es el vacío #1 del producto actual.
- **Versión del manager:** misma pantalla, otra pregunta — "¿qué necesita mi atención en el turno?": el día de HOY solamente, sin acumulados de mes ni comparativas. Rodrigo la ve al abrir; su home sigue siendo la Grilla, a un toque.

### 4.2 La Grilla (el rediseño más importante)

*Cómo se siente:* suena el teléfono. "¿Tenés cancha hoy a las 21?" Rodrigo ya está mirando la grilla — vive abierta — y ve el hueco en la 2. Escribe "juan 21 c2", Enter. "Listo Juan, te espero a las 21." Siete segundos, sin colgar. El slot quedó con borde punteado: reservado, sin plata. A las 21:10 Juan llega, Rodrigo toca el slot, el panel lateral dice "Cobrar $16.000", toca, efectivo, listo: el slot se pinta lleno. La grilla nunca se fue de la pantalla.

- **Objetivo:** operar el tiempo de las canchas — hoy y la semana — sin salir nunca de la vista.
- **Qué domina visualmente:** la matriz hora × cancha del día, **posicionada en la hora actual** al abrir (nunca en las 8 AM de un complejo que abre a las 17), con una línea de "ahora" cruzando. El presente y las próximas 3 horas son el 80% de las miradas: el layout les da el centro.
- **El cambio conceptual — el color codifica plata, no reserva.** Estados de un slot: libre / reservado sin plata (borde) / señado (medio lleno) / pagado (lleno) / jugándose ahora (lleno + indicador vivo) / **terminado sin cobrar (ámbar insistente — la única alarma de la grilla, porque es plata en riesgo)**. El *tipo* de ocupación (online, fijo, torneo) se expresa con una marca secundaria (icono/etiqueta), no con el color. Fundamento: la pregunta operativa de Rodrigo ante cada slot es "¿me deben plata?", no "¿por qué canal entró?"; el canal es metadato, el cobro es acción.
- **El panel de turno (la pieza central).** Tocar un slot ocupado NO navega ni abre un modal que tape la grilla: abre un panel lateral con todo el turno: quién (con su ficha a un toque: historial, fijo, strikes), estado de plata (seña, saldo), y **la acción primaria contextual al estado** — si debe, el botón es "Cobrar $16.000"; si pagó y es la hora, "Marcar jugado"; si no vino, "Marcar ausente" (con su fricción, ver §6). Además: agregar consumo de cantina *a este turno* (la gaseosa del partido se cobra con el turno, una sola transacción), reprogramar, y las acciones destructivas al fondo, detrás de un menú. La grilla queda visible al costado: el contexto nunca se pierde (P5).
- **Crear reserva = un popover mínimo.** Click en slot libre: nombre (con autocompletado de clientes), precio ya calculado por el sistema (visible, editable solo a propósito), Enter. Tres elementos. Todo lo demás — email, seña manual, notas — plegado en "más opciones". Fundamento: el form actual pide por defecto lo que el 90% de las altas telefónicas no tiene ni necesita; cada campo visible es tiempo con el cliente esperando en la línea.
- **La barra de comando.** Arriba, siempre: "Reservá, cobrá o buscá…". Entiende el idioma del mostrador: "juan 21 c2" (reserva), "cobrar c3 20" (cobro), "juan" (ficha). En desktop, atajo de teclado; en mobile, es el botón flotante. Es el acelerador del experto (P3): opcional el primer mes, adictivo el segundo.
- **Abonados y torneos como capas.** El fijo de Diego aparece todas las semanas con su identidad ("Diego · fijo · lunes"); el bloque del torneo ocupa sus horas con la suya. Desde el propio slot se crea el contrato: "Hacer fijo este turno" convierte una reserva buena en un abonado en dos toques — el alta del abonado ocurre donde ocurre la realidad (en la grilla), no en un módulo aparte.
- **Realtime sin sobresaltos.** Una reserva online entra con una aparición sutil + un aviso no intrusivo con acción ("Ver"). Prohibido el layout shift: el mostrador clickea rápido, y un tablero que se mueve bajo el dedo produce el error que el diseño debe prevenir (prevención > mensaje de error, Nielsen H5).
- **Qué desaparece:** la navegación a páginas para operar un turno; los modales bloqueantes; el pedido de datos que el sistema ya sabe (precio, duración); el color por canal.
- **Qué se mueve acá:** el alta de abonado (desde el slot); la venta de cantina asociada al turno; la ficha del cliente (como panel).
- **Acciones primarias:** crear reserva (slot libre) y cobrar (slot con deuda). Todo lo demás es secundario.
- **Qué distrae hoy:** aterrizar en horas muertas; estados que mezclan reserva y pago; la ida y vuelta entre grilla, caja y jugadores para completar un solo hecho real (un turno que se juega y se cobra).
- **Mobile:** la grilla NO es la matriz apretada. Es la **lista de hoy por hora** de una cancha con swipe horizontal entre canchas y un selector de día que siempre muestra el día elegido. La matriz completa queda para tablet/desktop. Fundamento: una matriz de 6 columnas en 375px obliga a zoom o scroll bidimensional — los dos peores gestos bajo presión; la lista vertical de "las próximas horas" es la representación natural del teléfono.

### 4.3 Caja (unificada: movimientos + venta + deudas + cierres)

*Cómo se siente:* 23:55, se fue el último partido. Rodrigo toca "Cerrar el día". El sistema ya contó: "Esperado en efectivo: $91.500 (fondo $10.000 + cobros $86.500 − gastos $5.000)". Rodrigo cuenta los billetes: $91.500. Coincide, un toque, cerrado, con su nombre y la hora. 60 segundos. Marcelo lo ve en Hoy a la mañana: "Caja de ayer: cerrada, sin diferencia." Nadie hizo cuentas a mano.

- **Objetivo:** ver y operar toda la plata del día — entrada, salida, pendiente — como una sola corriente.
- **Qué domina visualmente:** el encabezado perpetuo del día: **cobrado hoy · pendiente de cobro · estado de la caja** (abierta 18:02 por Rodrigo / cerrada). Estos tres números son la pantalla; el resto es detalle.
- **Una corriente, no compartimentos.** Debajo, el flujo cronológico de movimientos del día: cada uno con su origen (turno, cantina, torneo, gasto, ajuste), quién lo registró y a qué hora. El origen se filtra con chips, no con pestañas que esconden: la cantina no es otro mundo, es una fuente más de la misma plata. La pregunta "¿cuánto hizo la cantina hoy?" es un chip, no una excursión.
- **Modo venta (el POS).** Vender cantina es una superficie de venta, no un formulario: grilla de productos grandes y tocables (ordenados por frecuencia de venta, no alfabético), ticket acumulándose al lado, cobro en efectivo/MP/fiado en un toque. Se entra desde Caja (venta de mostrador) o desde el turno en la Grilla (consumo del partido, que viaja al cobro del turno). Tres Gatorades y un agua: cuatro toques y cobrar.
- **Plata en la calle (concepto nuevo de primera clase).** Una vista única de TODO lo que se debe: turnos jugados sin cobrar, fiados de cantina, cuotas de inscripción de torneos — ordenado por antigüedad, con la persona, el origen y **"Cobrar" directo en cada fila**. Hoy esa plata está desperdigada en tres módulos y ninguna pantalla la suma; en v2 tiene número propio en el encabezado de Caja y en Hoy. Es, junto con "Hoy", el feature de mayor impacto directo en el bolsillo del cliente: la plata que no se ve no se cobra.
- **El cierre como ritual.** Pantalla propia, tres pasos: (1) el sistema muestra lo esperado, ya calculado y desglosado; (2) Rodrigo cuenta e ingresa lo contado — la diferencia, si hay, se muestra al instante y se anota el motivo en el momento (no al día siguiente, cuando nadie se acuerda); (3) confirmar, con nombre y hora. El cierre es el final de la jornada laboral: por efecto pico-final, es el momento que define cómo *se recuerda* el producto — merece ser el flujo más pulido de toda la plataforma, no un formulario.
- **Qué desaparece:** la separación Caja/Cantina como pestañas-mundo; el catálogo de productos como espacio prominente (la gestión de catálogo y stock queda como sub-vista de baja frecuencia); todo cálculo mental del cierre.
- **Qué se fusiona:** movimientos + venta + fiados + deudas de turnos + cuotas de torneo = una corriente y una lista de deudas.
- **Acciones primarias:** registrar venta, cobrar deuda, cerrar el día. Los gastos y ajustes son secundarios (frecuentes pero no urgentes).
- **Qué distrae hoy:** la ausencia del número del día (la pregunta #1 sin respuesta en la pantalla de la plata); la deuda repartida en tres lugares; el cierre sin el esperado calculado de forma protagónica.

### 4.4 Clientes (fusión de Jugadores + Abonados)

- **Objetivo:** responder "¿quién es esta persona y qué relación tenemos?" — en dos segundos, desde cualquier lugar.
- **La ficha es el producto; la lista es solo el índice.** La ficha de un cliente reúne TODO: historial de turnos, fijos activos, deudas (de cualquier origen), ausencias y estado de bloqueo, y **notas del mostrador** ("siempre viene 10 min tarde", "amigo de Marcelo — no cobrarle cantina"). Las notas son la función más humana del módulo: son lo que el cuaderno tenía y el software suele olvidar. La ficha se abre como panel desde la grilla, la caja o las deudas — nunca obliga a navegar (P5).
- **Qué domina visualmente en la ficha:** la relación en una línea — "Cliente desde marzo · 46 turnos · fijo los lunes · debe $4.500" — antes que cualquier tabla.
- **Qué se fusiona:** los abonados son la pestaña "Fijos" de Clientes: el contrato (día, hora, cancha, precio por sesión, estado de pago) por persona. Desaparece la segunda lista de personas.
- **Qué desaparece:** la tabla ancha de N columnas como vista principal; las columnas que no responden la pregunta del índice ("¿a quién busco?") se van a la ficha.
- **Acciones primarias:** buscar (el índice es un buscador con lista, no una tabla-sábana), y en la ficha: cobrar deuda / gestionar fijo.
- **Decisiones sensibles con contexto:** bloquear a un cliente muestra qué implica y por cuánto tiempo, sin defaults acusatorios pre-seleccionados — el sistema no opina que tu cliente es moroso; te deja decidirlo.

### 4.5 Torneos

- **Objetivo:** administrar la competencia (equipos, fixture, resultados, cobros) sabiendo que **el torneo es un productor de reservas y de plata** — no un juego aparte.
- **Qué domina:** el estado del torneo activo: próxima fecha, partidos de la semana, equipos con inscripción impaga (que también viven en Plata en la calle).
- **Nace en la grilla:** crear un torneo es primero reservarle sus horas (bloque visible en la grilla, con su identidad); el fixture y la tabla se montan sobre esas horas. La UI cuenta la misma historia que la realidad: primero la cancha, después el campeonato.
- **La carga de resultados es de mostrador:** anotar un 3-2 con goleadores debe poder hacerlo Rodrigo entre partido y partido, desde el teléfono, en 20 segundos. Todo lo derivado (tabla, goleadores, fair play) se calcula solo y se publica solo en el portal.
- **Qué desaparece:** cualquier gestión de horas del torneo por fuera de la grilla; las promesas vacías (un espacio de torneos sin torneos explica qué es y ofrece crearlo — no convive un "próximamente" con un botón de crear).
- **Acción primaria:** cargar resultado (durante la temporada); crear torneo (fuera de ella).

### 4.6 Métricas (de dashboard a respuestas)

- **Objetivo:** que Marcelo tome las 5 decisiones de dueño con datos, sin saber leer dashboards.
- **La pantalla se organiza por preguntas, tituladas como preguntas:**
  1. **"¿Cuándo se te llena y cuándo no?"** — mapa de calor semana × hora de ocupación. Es LA métrica del negocio: canchas vacías en horas operativas son costo fijo sin ingreso. Al lado de cada franja floja, la palanca: su precio actual.
  2. **"¿Cuánta plata entra y de dónde?"** — turnos vs cantina vs torneos vs fijos, mes contra mes.
  3. **"¿Quiénes te sostienen el negocio?"** — los clientes por plata y frecuencia; cuánto pesa el puñado de arriba; quién dejó de venir (la retención de un complejo se juega en 20 grupos de amigos).
  4. **"¿Cuánto te cuestan las ausencias?"** — no-shows del mes, plata perdida, y el contraste con/sin seña: la pantalla que le vende sola la activación de señas.
  5. **"¿Cómo venís?"** — mes actual vs anterior, mismo día contra mismo día.
- **Cada respuesta termina en una acción,** discreta: "los martes 18-20 vienen 30% vacíos → ajustá el precio / creá un torneo los martes". Un dato que no habilita decisión es decoración (P1); la métrica se diseña desde la decisión hacia atrás.
- **Qué desaparece:** los gráficos genéricos sin pregunta; los ejes con escalas absurdas; los KPIs de vanidad. **Qué se fusiona:** los reportes/exportaciones entran acá como "llevate los datos" (el contador de Marcelo existe y pide Excel — dárselo es parte de la confianza).
- **Versión manager:** ocupación y ausencias sí (las opera él); plata acumulada y tendencias no.

### 4.7 Configuración

- **Objetivo:** tocarse poco, entenderse siempre. Se agrupa por intención, no por entidad: **Tu complejo** (identidad, foto, horarios, canchas, portal público con vista previa en vivo), **Precios** (superficie propia: el calendario semanal de precios por cancha, visual — ver la semana pintada por franjas de precio, editar arrastrando/seleccionando; los precios son la palanca #1 y hoy están escondidos como reglas en un form), **Tu plata** (MercadoPago, señas, con el estado de conexión en lenguaje humano: "Conectado — los pagos entran a la cuenta de Marcelo"), **Tu equipo** (miembros y roles en lenguaje de responsabilidad: "puede operar" / "puede configurar y ver el negocio"), **Avisos**.
- **Cada ajuste muestra su consecuencia:** activar señas dice qué va a pasar con la próxima reserva online; cambiar un horario muestra qué días de la grilla afecta. Configurar a ciegas es la fuente #1 de desconfianza en usuarios no técnicos.

### 4.8 El portal público del complejo (la landing de Marcelo)

- **Reencuadre estratégico:** el 95% del tráfico jugador no llega buscando "canchas cerca mío": llega por **el link del complejo compartido por WhatsApp**. El portal del complejo es la pieza central del lado jugador — es la página web del negocio de Marcelo, la que reemplaza a la que nunca tuvo. El buscador cross-complejos es secundario (y el marketplace, anti-visión — §10).
- **Objetivo:** que un jugador nuevo reserve y uno recurrente repita, en menos tiempo del que tarda una llamada.
- **Qué domina:** la disponibilidad de HOY y los próximos días con precio visible, arriba, sin scroll y **sin pedir absolutamente nada antes** (la disponibilidad es el producto; mostrarla es el marketing). Después: foto real del complejo, ubicación con "cómo llegar", señales de confianza (reseñas, "responde rápido", servicios).
- **Para el que vuelve:** reconocimiento — "¿Jueves 21, como siempre?". La reserva habitual a un toque es el lazo de retención más barato del producto.
- **Qué desaparece:** todo texto institucional antes de la disponibilidad; cualquier login para *mirar*.

### 4.9 El flujo de reserva del jugador (rediseño completo)

*La vara: ganarle a "llamo y pregunto" (~60 segundos con respuesta humana).*

- **Tres pantallas, identidad al final:**
  1. **Cuándo** — día y hora sobre la disponibilidad real, precio siempre visible; si hay seña: "Señás $4.800 ahora · $11.200 en el complejo" antes de cualquier compromiso. Sin sorpresas de monto en toda la secuencia.
  2. **Quién** — nombre y un contacto. Nada más. Si el dispositivo ya lo conoce: "Hola Tomás — ¿confirmás con tu mail de siempre?".
  3. **Confirmación** — todo el resumen + el pago de la seña si aplica.
- **La verificación por email sale del medio del checkout.** Asegurar la cancha primero, verificar después: la reserva queda tomada ("Te guardamos la cancha por 10:00 minutos" — visible, con cuenta regresiva honesta) mientras se completa seña y/o verificación. Obligar a ir al mail a mitad del embudo es el equivalente exacto del "creá tu cuenta para ver el carrito" que el e-commerce enterró hace una década: cada minuto entre la intención y la confirmación multiplica el abandono, y el contexto real ("estoy en el bondi, la app del mail me deslogueó") es hostil. El acceso por link sirve para *volver* (Mis reservas), no para *comprar*.
- **La confirmación es un objeto compartible.** Una tarjeta con cancha, día, hora, dirección, mapa y estado de la seña, hecha para pegarse en el grupo de WhatsApp — porque el grupo ES el sistema de gestión del partido, y la tarjeta que circula es marketing gratuito del complejo dentro del canal correcto. Más: agregar al calendario, y el límite de cancelación sin costo dicho en la cara ("Cancelá gratis hasta el jueves 15:00").
- **La ansiedad a matar es una sola:** "¿me la guardaron?". Cada estado del proceso lo responde explícitamente: guardada por 10 minutos → seña acreditada → confirmada. Nunca un estado mudo entre que pagó y que aparece el comprobante.

### 4.10 Mis reservas (jugador)

- **Objetivo:** ver el próximo partido y actuar sobre él. **La próxima reserva es una tarjeta-héroe** con las tres acciones reales: cómo llegar, compartir al grupo, cancelar. El historial es una lista secundaria abajo. Cancelar es autoservicio con las consecuencias en la cara (qué pasa con la seña) y sin llamar a nadie.

### 4.11 Super-admin (la consola de churn)

- **Objetivo:** detectar el tenant en riesgo antes de que se vaya, y dar soporte rápido.
- **Qué domina:** MRR y su tendencia; luego la lista de complejos como **fichas de signos vitales**: última actividad del staff, reservas de los últimos 7 días, estado de suscripción, compuestos en un semáforo. La ordenación por defecto es por riesgo, no alfabética: la pantalla responde "¿a quién llamo hoy?". Un complejo que dejó de cargar reservas hace 10 días es churn en 60 — esa fila sube sola y se pinta.
- **Impersonar:** con marco visual inconfundible en toda la sesión y salida siempre visible; cada impersonación deja rastro. La confianza acá protege al negocio SaaS mismo.

### 4.12 Onboarding del complejo

- **Objetivo:** del registro al primer valor en menos de 10 minutos. El valor mínimo no es "configuré todo": es **ver tu propio complejo en la grilla y anotar tu primer turno**.
- **Re-secuenciar:** pedir solo lo indispensable para eso (canchas, horarios, precios base) y dejar TODO lo demás — MercadoPago, foto, portal — como **misiones post-setup visibles en Hoy** ("Activá señas online · 3 min"), cada una con su beneficio en una línea. El wizard actual cobra el peaje completo antes de mostrar el camino; v2 invierte: da la herramienta usable primero, y cada misión desbloquea un beneficio visible.
- **El Aha (primera reserva online) se persigue activamente:** la misión #1 tras el setup es "Compartí tu link" (con el mensaje de WhatsApp ya redactado). El sistema celebra la primera reserva online como lo que es: el momento en que TurnoGol pasó de anotador a vendedor.

---

## 5. Los flujos críticos, segundo a segundo

Presupuestos de tiempo como requisito de diseño, no como aspiración. Se miden con cronómetro en usabilidad real.

| Flujo | Presupuesto | Diseño |
|---|---|---|
| **Reserva telefónica** | ≤ 10 s | Grilla abierta → slot o comando → nombre → Enter. El precio lo pone el sistema. Cero navegación. |
| **Cobro de turno + cantina** | ≤ 15 s | Slot → panel → "+ consumos" si hay → "Cobrar $X" → método → listo. UNA transacción, un movimiento en Caja con desglose. |
| **Venta de mostrador (3 productos)** | ≤ 10 s | Modo venta → 3 toques en la grilla de productos → cobrar. |
| **Cierre de caja** | ≤ 90 s | Esperado ya calculado → contar → diferencia explicada en el momento → confirmar con nombre. |
| **Marcar ausente** | sin presupuesto — acá se FRENA | Confirmación con contexto completo: qué se captura, qué strike es, qué bloqueo dispara. Es la acción más agresiva del mostrador hacia un cliente: fricción proporcional (P4). |
| **Reserva online del jugador** | ≤ 60 s (le gana al teléfono) | 3 pantallas, identidad al final, cancha guardada mientras paga. |
| **Alta de fijo (abonado)** | ≤ 20 s | Desde el slot: "Hacer fijo" → confirmar patrón y precio → listo. El sistema proyecta las semanas y avisa conflictos futuros, sin abortar la serie. |
| **Cancelación con reintegro** | decisión informada | El panel muestra qué se devuelve y qué no ANTES del sí; la política la calculó el sistema, el humano la confirma. |

---

## 6. El sistema de interacción transversal

Reglas únicas para toda la plataforma. La consistencia acá vale más que cualquier pantalla individual: el operador de 8 horas construye automatismos, y cada excepción a estas reglas es un error futuro.

### 6.1 Jerarquía de acciones
- **Primaria (una por pantalla/panel):** la acción que mueve plata o crea una reserva. Prominente, siempre en el mismo lugar, con etiqueta que dice el efecto y el monto ("Cobrar $16.000", nunca "Aceptar").
- **Secundarias:** visibles, quietas, sin competirle a la primaria.
- **Destructivas:** nunca en la superficie de un tap directo; siempre detrás de un menú Y con la fricción del §6.2. Distancia física en pantalla respecto de las frecuentes (Fitts al revés: alejar lo peligroso).

### 6.2 Deshacer vs confirmar (la matriz)
- **Reversible y barato** (cancelar reserva sin seña, borrar un gasto recién cargado): ejecutar ya + **Deshacer 10 s**. La confirmación acá molestaría al 99% que no se equivocó.
- **Costoso pero explicable** (marcar ausente, cancelar con seña, liberar horas de torneo): confirmación con las consecuencias enumeradas y montos reales. Prohibido el "¿Estás seguro?" sin información: una confirmación que no informa entrena el click ciego y no protege.
- **Irreversible con plata** (borrar torneo con cobros, anular un cierre): confirmación reforzada (reescribir algo, o doble paso) — y preguntarse antes si la acción debe existir.

### 6.3 El input de plata (control especializado, obligatorio en toda la plataforma)
Pesos enteros, separador de miles dibujado mientras se tipea, teclado numérico en mobile, y el monto releído en palabras cuando supera un umbral ("$25.000 — veinticinco mil"). El error de magnitud ($25 por $25.000) debe ser **imposible de tipear sin verlo**, no detectable después. En un producto donde todo es plata, este control es infraestructura, no detalle.

### 6.4 Tablas → listas con propósito
Una tabla existe para responder UNA pregunta; las columnas que no la responden viven en la ficha. En mobile, ninguna tabla: tarjetas con el dato primario grande. Toda lista de más de ~7 ítems tiene búsqueda/filtro arriba (Hick: la selección visual degrada rápido).

### 6.5 Formularios
- **Nunca pedir lo que el sistema sabe** (precio de la franja, datos del cliente conocido, fecha del contexto).
- **Defaults con memoria:** el último método de pago, la cancha del contexto. El default correcto es la mitad de la velocidad.
- Una columna, guardar siempre visible, error al lado del campo en lenguaje de solución ("Poné un mail con @" y no "Formato inválido").

### 6.6 Estados vacíos (plantilla única)
[Qué es esto, en una frase] + [qué te da, en una frase] + [el primer paso, como botón]. El vacío es el mejor onboarding contextual del producto. Excepción: los vacíos que son **premio** ("Nada pendiente de cobro 🎉") se celebran, no se rellenan.

### 6.7 Estados de error (plantilla única)
[Qué pasó, en castellano] + [qué hacer ahora] + [qué está haciendo el sistema solo, si reintenta]. Nunca "Algo salió mal" a secas. Regla de oro: **la plata nunca falla en silencio** — un cobro o una seña que falla produce una alerta persistente en Hoy hasta resolverse; un toast que desaparece es, para efectos de confianza, un error que nunca existió.

### 6.8 Velocidad percibida
Respuesta < 400 ms o feedback de progreso (umbral de Doherty). Optimistic UI **solo** donde el deshacer es barato; jamás en plata: un cobro muestra su verdad, no su esperanza. Las esperas largas (conexión MP) narran qué pasa.

---

## 7. Mobile y desktop: dos puestos de trabajo, no dos tamaños

- **Desktop/tablet = la cabina del mostrador.** Densidad, teclado, la matriz completa, panel lateral, barra de comando. Optimiza el throughput de Rodrigo.
- **Mobile staff = el bolsillo del dueño (y el auxilio del encargado que se alejó del mostrador).** Optimiza lectura y decisiones puntuales: Hoy completo, grilla-lista, cobrar algo, contestar una alerta. Barra inferior de 4, pulgar, blancos grandes.
- **Mobile jugador = el único jugador.** No hay versión desktop del jugador que optimizar: se diseña mobile y el desktop es su adaptación holgada.
- La consecuencia de diseño: **no existe "la versión responsive" como proceso de achicar.** Cada superficie se diseña desde su puesto de trabajo; comparten sistema, no layout.

---

## 8. Identidad visual: una sola alma

**Estado actual: dos productos pegados** — un admin claro y utilitario, y superficies públicas oscuras "premium", sin ADN común. Eso rompe la continuidad de marca justo en el paso más delicado (el dueño que llega desde la página de venta al producto).

**Recomendación (decisión de negocio, marcada como tal):**
- **La herramienta de trabajo es clara.** Mostrador con luz de tubo, jornadas de 8 horas, usuarios de 50 años: fondo claro, contraste alto, cero ornamento que compita con los números. La estética de la herramienta es la **legibilidad** — como una planilla bien hecha, que es el estándar de belleza que Marcelo ya respeta.
- **La superficie de deseo puede ser oscura.** Marketing y portal del jugador venden fútbol de noche: ahí el dramatismo sirve a la conversión.
- **Pero una sola familia:** misma tipografía, mismo verde, misma voz, mismos radios y densidades. Dos climas, un ADN — no dos marcas.
- Regla de resolución de conflictos: P7. Si el clima le cuesta legibilidad a la herramienta, pierde el clima.

**La voz** es parte de la identidad y ya es un activo (el voseo consistente es de lo mejor del producto actual): directa, de mostrador, sin corporativismo ni infantilización. Los montos siempre con formato argentino completo. Las palabras del dominio son las del cliente: *fijo* antes que "abonado" donde el que lee es un jugador; *seña*, *turno*, *cancha* — nunca jerga de software.

---

## 9. Lo que el sistema hace solo (automatización con humano al mando)

Patrón único: **el sistema prepara, el humano confirma.** Nada de plata ni de reputación se ejecuta solo.

1. **Detección de turnos sin cobrar:** terminó el turno y nadie lo cobró/marcó → el slot alarma en la grilla y, si persiste, alerta en Hoy. (Hoy: se pierde en silencio.)
2. **Sugerencia de no-show:** pasó X del inicio sin registro → "¿Pasó algo con la 3 de las 20?" con las dos salidas (cobrar / ausente). La decisión es humana; la vigilancia, del sistema.
3. **Pre-cierre de caja permanente:** el esperado se calcula todo el día; cerrar es contar y confirmar.
4. **Re-oferta de horas liberadas:** cancelación de último minuto → avisar a los frecuentes de esa franja ("Se liberó el jueves 21 hs"). Convierte el peor evento del negocio (hora vacía por cancelación) en inventario re-vendible.
5. **Ciclo de los fijos:** proyección de semanas, aviso de conflictos futuros, recordatorio de renovación/cobro pendiente del contrato.
6. **Resumen diario a Marcelo** (push/mail a hora elegida): la línea de Hoy — "Hoy: $184.500 · 11/12 · caja cerrada sin diferencia". El sistema le lleva la tranquilidad, no lo obliga a buscarla.
7. **Recordatorio del partido al jugador** (canal a decidir — WhatsApp es el endgame): baja no-shows, el interés es compartido.
8. **Salud de pagos:** una seña que falla o una conexión de MP caída es alerta persistente en Hoy hasta resolverse (§6.7).

---

## 10. Anti-visión: lo que TurnoGol v2 NO es

- **No es un ERP.** No factura AFIP, no liquida sueldos, no maneja proveedores. Es turnos + plata del mostrador, hecho perfecto.
- **No es un marketplace** (en v1-v2). El lado jugador existe para servir al complejo (su portal, su link, su conversión), no para agregarle demanda cross-complejo. El buscador global es utilidad secundaria; prometer demanda que no existe es la trampa clásica de la categoría.
- **No es una red social de jugadores.** Los partidos se organizan en WhatsApp; TurnoGol se integra a esa realidad (objetos compartibles) en vez de competirle con chats y perfiles.
- **No es un dashboard de BI.** Marcelo no analiza datos: toma 5 decisiones. Las métricas se diseñan desde la decisión.
- **No copia ATC.** La referencia de diseño es el cuaderno (velocidad, confianza, tolerancia al caos del mostrador), no el incumbente. Donde ATC agrega opciones, v2 agrega defaults.

---

## 11. Cómo sabremos que el diseño funciona

Métricas de experiencia, medibles sin instrumentación exótica:

| Métrica | Meta | Por qué |
|---|---|---|
| Alta de reserva telefónica | ≤ 10 s | El loop más repetido del producto |
| Cierre de caja | ≤ 90 s y diferencia promedio → $0 | El ritual de confianza |
| Plata en la calle | tendencia ↓ por tenant | Impacto directo en el bolsillo |
| % de reservas online sobre total | ↑ sostenido | El Aha convertido en hábito; TurnoGol vendiendo solo |
| Conversión del embudo jugador (portal → confirmada) | ↑ tras quitar la verificación del medio | La apuesta #4 |
| Tiempo del registro al primer turno anotado | ≤ 10 min | Time-to-value del onboarding |
| "¿Extrañás el cuaderno?" (pregunta directa a encargados) | "no" sin dudar | La tesis entera, en una pregunta |

---

## Apéndice — De la auditoría a la visión

Los ejes críticos de la auditoría del 2026-08-01 no se "arreglan" en v2: se **disuelven** en conceptos que los hacen imposibles.

| Hallazgo estructural de la auditoría | Concepto v2 que lo disuelve |
|---|---|
| CTAs de plata con contraste fallado, cada pantalla inventa su jerarquía | §6.1: jerarquía de acciones única del sistema; la primaria es infraestructura, no decisión por pantalla |
| /caja sin los números del día | §4.3: el encabezado perpetuo ES la pantalla; imposible una Caja sin su número |
| Ausente a 1 tap / liberar torneo sin confirmar / confirmaciones genéricas | §6.2: matriz deshacer-vs-confirmar; fricción proporcional al daño |
| Abonado a $25 por input de número crudo | §6.3: input de plata especializado, obligatorio |
| Blog/comparativas ilegibles; identidad partida | §8: una familia visual; P7 (legibilidad primero) |
| Magic link en el medio del checkout | §4.9: identidad al final, cancha guardada primero |
| Grilla mobile = matriz apretada; day-strip que esconde el día | §4.2 mobile: la grilla-lista; mobile como puesto de trabajo propio (§7) |
| "Próximamente" + "Crear" conviviendo en torneos | §4.5: estados honestos; el vacío explica o invita, nunca ambos relatos a la vez |
| Deudas repartidas (fiados, turnos, cuotas) sin vista común | §4.3: Plata en la calle como concepto de primera clase |
| Métricas con ejes en centavos y gráficos sin decisión | §4.6: métricas organizadas por pregunta, cada una con su acción |

---

*Documento de visión — anterior a cualquier decisión de implementación. Las decisiones de negocio que este documento toma como recomendación (identidad visual §8, automatizaciones con costo de canal §9.7, re-secuenciación del onboarding §4.12) requieren validación del dueño antes de convertirse en plan.*



