# Pase crítico sobre la visión TurnoGol v2

**Fecha:** 2026-08-01
**Sobre:** `docs/planning/2026-08-01-vision-producto-turnogol-v2.md`
**Método:** crítica adversarial contra el propio documento — buscar dónde la visión se rompe en la práctica, no confirmarla. Se mantiene intocada la lógica central (tiempo vs plata; Hoy/Grilla/Caja/Clientes; jugador reserva antes de identificarse; una verdad, muchas vistas): la crítica es sobre las **fronteras** de esa lógica, no sobre su núcleo.

---

## 1. Lo que está sólido (y por qué)

Criterio de solidez — un concepto de la visión se considera sólido cuando cumple al menos dos de tres: **(a)** mapea a comportamiento observado (auditoría en vivo, no persona sintética), **(b)** los datos ya existen en el sistema (es una vista nueva sobre verdad existente, no un modelo nuevo), **(c)** es barato de revertir.

| Concepto | Por qué aguanta |
|---|---|
| **Tiempo vs plata como eje** | No es una metáfora: el sistema ya está modelado así (todo lo que ocupa cancha es una reserva; todo peso es un movimiento de caja). La visión reorganiza la superficie para que cuente la historia que los datos ya cuentan. Cumple (a)+(b). |
| **"Plata en la calle"** | Los tres tipos de deuda existen hoy como datos (turnos impagos, fiados, cuotas de torneo); solo falta la vista que los suma. Riesgo casi nulo, impacto directo en bolsillo. El concepto más ejecutable de todo el documento. (a)+(b)+(c). |
| **Color de slot = estado de cobro** | Re-mapeo visual de estados que ya existen. La auditoría confirmó en vivo que la pregunta del mostrador es "¿me deben?" — el dato está, el mapeo es barato. (a)+(b)+(c). |
| **Sistema de interacción (§6): matriz deshacer/confirmar, input de plata, plantillas de error/vacío** | Transversal, sin reorganización de nada, disuelve la mayoría de los 🔴 de la auditoría de una sola vez. Se puede aplicar al producto actual sin esperar ninguna pantalla nueva. (a)+(c). |
| **"Hoy" como concepto** | La pregunta emocional del dueño ("¿está todo bien?") es real y hoy no tiene pantalla. Aditivo: no rompe ningún hábito existente. (a)+(c). El riesgo no está en el concepto sino en su versión por rol (ver §2.5). |
| **Cierre de caja como ritual con esperado pre-calculado** | El esperado ya se calcula (el cierre actual lo snapshotea); falta la coreografía. Peak-end bien aplicado. (b)+(c). |
| **Identidad al final en el flujo jugador** | Principio de conversión con 15 años de evidencia acumulada en e-commerce; la auditoría verificó el costo del gate actual en vivo. La parte de *sacar la verificación del medio* es sólida — la parte del *hold* no (ver §2.2, son cosas distintas y el documento las fusionó). |
| **Anti-visión (§10)** | Decir que NO es marketplace, ERP ni red social es la sección que más plata ahorra del documento. Sin ambigüedad. |

---

## 2. Donde la visión se rompe en la práctica

Ordenado por gravedad: primero lo que puede hacer fracasar una fase entera, después lo que solo encarece.

### 2.1 La meta-falla: cero usuarios reales — la visión es spec sobre spec 🔴

*(Corregido 2026-08-01: no existe ningún cliente real todavía — todo lo que hay en producción son pruebas del propio dueño del proyecto. Eso agrava esta sección, no la suaviza.)*

La visión entera está construida sobre personas de spec (Marcelo, Rodrigo, Tomás) más los hallazgos de la auditoría — y **ningún Marcelo, Rodrigo ni Tomás existe todavía**. Cada asunción de jornada ("decenas de llamadas", "8 horas de pie", "el encargado cierra la caja") es plausible y tiene **cero contacto con un mostrador real**. El riesgo #1 del proyecto entero no es ninguna pantalla: es invertir meses puliendo una visión coherente que ningún dueño de complejo pidió. La coherencia interna de un documento no es evidencia — es el sesgo más peligroso del diseño en el vacío, porque se siente como evidencia.

La consecuencia práctica: **la validación no puede ser observación (no hay a quién observar) — tiene que ser venta.** El prototipo de las pantallas madre se valida poniéndolo adelante de dueños de complejos reales en reuniones comerciales; conseguir 1-2 complejos como *design partners* (descuento/gratis a cambio de acceso a su operación) convierte el primer cliente en el laboratorio que hoy no existe. Hasta entonces, toda prioridad de este documento es hipótesis — incluidas las de este pase crítico.

### 2.2 El hold de 10 minutos no es UX: es política de inventario 🔴

La visión lo despacha en una línea ("te guardamos la cancha por 10:00") como si fuera un detalle de copy. Es la decisión de producto más conflictiva del lado jugador:

- Un hold congela inventario en hora pico por alguien que **quizás abandona**. Diez minutos de la cancha de las 21 un jueves es el activo más caro del negocio.
- ¿Rodrigo ve el hold en la grilla? Si lo ve y no puede pisarlo, el sistema le impide venderle al cliente que tiene **en el teléfono ahora** por uno que quizás no existe. Si puede pisarlo, ¿qué le pasa al jugador que estaba pagando la seña? Las dos respuestas son malas de formas distintas; hay que elegir cuál mal se acepta.
- El conflicto mostrador-vs-online es EL conflicto estructural del negocio (dos canales vendiendo el mismo inventario perecedero) y el hold lo **agrava** antes de mejorarlo.

Alternativas a evaluar antes de comprometerse: hold corto (3 min) / hold solo cuando el pago de seña ya se inició / hold pisable por el admin con re-oferta automática al jugador desplazado. Nota: el sistema ya tiene expiración de reservas pendientes — la discusión es de política y visibilidad, no de mecánica. **Decisión de negocio, bloquea la fase del flujo jugador.**

### 2.3 "Cobrar turno + cantina en UNA transacción" ignora cómo se paga en un mostrador real 🟡

El modelo "un turno = una cuenta" es limpio en el papel. El mostrador real: pagan entre varios, mitad MP y mitad efectivo, el que pidió la gaseosa la paga al toque y se va antes, uno señó y otro completa. La visión no modela **pagos parciales ni métodos mixtos** — que no son edge case: son la norma de un grupo de 10 tipos dividiendo $16.000. Dos salidas dignas: **(a)** declarar explícitamente que v2 no soporta pago dividido (una cuenta, un pagador, quien paga cobra después a sus amigos — simplicidad defendible y es lo que hace el cuaderno), o **(b)** diseñar pago parcial de verdad. Lo indefendible es lo actual del documento: prometer "una transacción" sin decidir qué pasa cuando la realidad no es una. La salida (a) es la recomendada — pero hay que escribirla, porque el encargado va a pedir la (b) la primera semana.

### 2.4 La barra de comando es una solución de dev-tool para un usuario de mostrador 🟡

"juan 21 c2" es la fantasía Linear del documento — y Linear la construyó para desarrolladores que viven en el teclado. Rodrigo no es ese usuario. Los command palettes tienen adopción bajísima fuera de herramientas técnicas, y esta versión además exige un parser de lenguaje de mostrador con ambigüedad real (¿"21" es hora o cancha? ¿cuál de los seis Juanes?). Una herramienta de velocidad que falla una vez de cada diez se abandona para siempre. Lo honesto: **el popover de 3 campos con autocompletado ya cumple solo el presupuesto de ≤10 s**; la barra es un multiplicador para un hipotético power user, no una pieza fundacional — y la visión la vendió como central en el pitch de la Grilla. Degradarla a experimento tardío. Si sobrevive como buscador global (encontrar personas y turnos), ya justifica su existencia sin el parser.

### 2.5 "Hoy" por rol = dos pantallas con el mismo nombre 🟡

La visión resolvió con una frase ("versión del manager: misma pantalla, otra pregunta") lo que en la práctica son **dos pantallas distintas que se llaman igual**: doble mantenimiento, soporte confuso ("tocá Hoy" — ¿cuál?), y divergencia inevitable. Alternativa más barata y probablemente mejor: "Hoy" es solo del admin; el manager aterriza directo en la Grilla y las alertas operativas (turno sin cobrar, caja sin abrir) viven **en la grilla**, donde ya está mirando. Decisión de diseño abierta que el documento pintó como resuelta.

### 2.6 "Una verdad, muchas vistas" es una promesa de arquitectura disfrazada de principio de diseño 🟡

El principio promete "el mismo número en todas las pantallas". Eso no se garantiza con diseño: se garantiza con **una fuente única de agregados** (cobrado hoy, pendiente, ocupación) que todas las superficies consumen. Si cada pantalla suma por su cuenta, la promesa se rompe por bugs de agregación — y ya se rompió una vez en el producto actual (la caja y las métricas agregando distinto es exactamente la clase de bug que la auditoría encontró). El principio es correcto; lo que falta es reconocer que su cumplimiento es una decisión temprana de plan técnico, no un hábito de diseño. Consecuencia adicional que el documento omite: el principio choca con los permisos — si toda ficha se abre desde cualquier lado, cada dato de la ficha necesita una respuesta rol por rol (¿el manager ve el total histórico gastado por el cliente?). Falta la **matriz rol × dato** (ver §4).

### 2.7 La fusión "Clientes" tiene un pantano abajo: identidad 🟡

"Una persona = una ficha" suena obvio hasta que se mira quiénes son las personas: jugadores registrados (globales, cross-complejo) y nombres anotados a mano (el "Diego" del fijo de los lunes, que quizás no tiene cuenta — o peor, quizás ES el "Diego R." que reserva online). La fusión obliga a resolver merge de identidades: dedupe, vinculación manual, qué pasa con el historial al vincular. Es un problema clásico, pantanoso y sin final elegante. No invalida la fusión, pero es SU costo real y la visión no lo presupuestó. Respuesta probable: ficha ligera para no-registrados + acción explícita "vincular a cuenta" hecha por el staff, nunca merge automático. Hay que decidirlo antes de diseñar la pantalla.

### 2.8 Dos automatizaciones estrella dependen de un canal que no existe 🟡

La re-oferta de horas liberadas (§9.4) y el recordatorio al jugador (§9.7) son teatro sin WhatsApp: por email llegan tarde (una cancelación de último minuto se re-vende en la hora, no en el día) o no se leen. WhatsApp API tiene costo por conversación, opt-in y aprobación de templates — y está explícitamente descartado para v1. La visión las presenta como parte del "sistema que trabaja de noche" sin decir que su canal es una decisión de plata pendiente. Honestidad: van a la lista "cuando haya WhatsApp", no al plan. El resumen diario a Marcelo (§9.6) sobrevive por push/email porque su timing es laxo — pero el push del dueño depende de tener la PWA instalada; también hay que decirlo.

### 2.9 El editor visual de precios es un proyecto disfrazado de detalle 🟢

"Calendario semanal de precios, editar arrastrando" — eso es un editor visual de reglas horarias: semanas de trabajo. El valor de la sección Métricas ("los martes vienen vacíos → ajustá el precio") no depende del editor: depende de que el link a la edición exista. El editor drag & drop es versión 3, no 2.

### 2.10 La ventana sin clientes: un recurso que expira 🔴 (de ejecución, no de diseño)

*(Corregido 2026-08-01: sin clientes reales, el riesgo cambia de signo.)*

Con cero clientes, **no hay hábitos que romper**: la restricción clásica contra los rediseños estructurales (desorientar usuarios existentes) hoy no existe. Eso convierte el presente en la ventana ideal — y única — para lo más caro de cambiar después: la navegación, la fusión de módulos, la máquina de estados de la grilla. Cada una de esas cirugías cuesta el doble con el primer cliente adentro y el décuple con veinte. **La ventana se cierra con el primer contrato firmado**, y no avisa.

El riesgo real ya no es el big bang: es su gemelo opuesto — **el túnel**. Meses de rediseño sin contacto externo, financiados por la comodidad de que nadie se queja porque nadie usa. La protección contra el túnel: cada fase debe terminar en un artefacto mostrable en una reunión de venta, y las reuniones de venta tienen que estar pasando *durante* el rediseño, no después. El diseño avanza con la libertad de la ventana; la venta le pone el reloj y la evidencia que le faltan.

Sigue en pie la advertencia de convivencia: la ejecución por fases deja pantallas viejas y nuevas coexistiendo; si el sistema de interacción (§6) no se aplica también a lo viejo desde el día uno, la transición tiene dos gramáticas — peor que no haber empezado.

### 2.11 Los presupuestos de tiempo no tienen protocolo de medición 🟢

"≤10 s la reserva telefónica" exige instrumentación que no existe (¿desde cuándo hasta cuándo? ¿medido cómo?) y usuarios de test que hoy son **n=0**. Como norte sirven; como "requisito medible" son humo hasta definir el proxy instrumentable (apertura de popover → confirmación) y tener a quién medir. La consecuencia práctica: instrumentar los proxies AHORA, para que el primer cliente real genere baseline desde su primer día — sin baseline, ninguna meta de §11 probará nada jamás.

---

## 3. Decisiones que necesitan al dueño

Numeradas; cada una con qué parte del plan bloquea. Ninguna se resuelve sola en diseño.

1. **Política del hold** (¿existe? ¿duración? ¿pisable por el mostrador?) — bloquea el flujo jugador rediseñado (§4.9 de la visión). La más cara de errar: congela inventario o quema jugadores.
2. **Pago dividido/mixto: ¿se soporta o se declara fuera de alcance?** — bloquea el diseño del cobro en el panel de turno y el modo venta. Recomendación en §2.3(a), pero es política comercial.
3. **"Hoy" del manager: ¿existe o el manager vive en la Grilla con alertas embebidas?** — bloquea la fase de Hoy; afecta el pitch de venta ("qué ve tu empleado").
4. **Notas de mostrador y Ley 25.326** — "no fiarle" escrito sobre una persona es dato personal alcanzado por derecho de acceso. Definir qué se puede anotar y si el staff es advertido de que el cliente puede leerlo. Legal, no UI.
5. **WhatsApp: ¿cuándo y a qué costo?** — sin esa decisión, §9.4 y §9.7 salen del plan (no se degradan a email: se caen).
6. **Onboarding invertido (MP después):** acelera el primer valor pero retrasa la activación de señas (= retrasa que el complejo cobre online). Sin funnels reales todavía, la decisión se toma como apuesta y se re-valida con los primeros onboardings de clientes de verdad — instrumentarlos desde el primero.
7. **Identidad visual (clara para trabajo / oscura para deseo)** — ya venía marcada en la visión; sigue sin veto ni bendición.
8. **Costo recurrente del resumen diario** (email por tenant×día vía Resend, o push con fricción de PWA) — plata chica pero recurrente; decidir canal.

---

## 4. Qué falta para bajar la visión a un plan real

En orden de dependencia, no de tamaño:

1. **Contacto con la realidad** (la respuesta a §2.1): no hay cliente que observar, así que el sustituto es doble — **(a)** validar el prototipo de las pantallas madre en reuniones de venta con dueños de complejos reales (la venta ES el test de usabilidad disponible), y **(b)** conseguir 1-2 design partners cuya operación se pueda mirar de cerca desde el día uno. El baseline de métricas (§4.8) recién existirá con ese primer cliente: instrumentar ANTES de que llegue, para que su primer mes sea la línea de base.
2. **Matriz rol × dato × superficie:** qué ve exactamente el manager en cada vista derivada (ficha, panel de turno, Hoy, métricas). Sin esto, "una verdad muchas vistas" se improvisa pantalla por pantalla.
3. **La máquina de estados visual del slot, completa:** los 6 estados propuestos contra TODAS las combinaciones reales de reserva+seña+cancelación (hay más combinaciones que colores; ej.: señado-cancelado-con-reintegro-pendiente). Es EL artefacto de especificación de la Grilla.
4. **El modelo del cobro decidido por escrito** (§2.3): qué es "una transacción", qué pasa con el parcial, cómo se registra el desglose turno+cantina en la corriente de caja.
5. **Taxonomía de alertas de "Hoy":** lista cerrada de eventos y alertas con prioridad y umbral (¿"turno sin cobrar" alarma al terminar o a los 30 min?). Sin taxonomía, Hoy degenera en bandeja de notificaciones — exactamente lo que vino a matar.
6. **Prototipo navegable de las 3 pantallas madre (Hoy, Grilla+panel, Caja) antes de una línea de código,** puesto adelante de dueños y encargados prospecto (§4.1) — es a la vez material de validación y material de venta. La visión es texto; el siguiente artefacto es dibujo, no plan técnico.
7. **Mapa "solo superficie" vs "toca modelo de datos":** separa lo que es re-organización visual (estados de slot, KPIs de caja, plantillas) de lo que exige modelo nuevo (hold, cobro unificado, vinculación de identidades). Ese mapa ES el esqueleto del plan de fases.
8. **Instrumentación mínima para §11:** definir el proxy medible de cada meta antes de rediseñar, para que el después tenga un antes.
9. **Test de vocabulario:** "Plata en la calle", "fijos", "Hoy" — validar que el naming del concepto nuevo se entiende en 5 segundos con 2-3 dueños/encargados reales. Trivial de hacer, caro de errar (es EL concepto nuevo del producto).

---

## 5. Priorización sugerida (secuencia de producto, no roadmap técnico)

*(Re-secuenciada 2026-08-01 al confirmarse que no hay clientes reales: cae la restricción de compatibilidad con hábitos existentes y aparece la ventana del §2.10.)*

Tres reglas gobiernan la secuencia:

1. **Primero las apuestas seguras:** lo que la auditoría probó en vivo y no depende de ninguna validación externa (el sistema de interacción, la plata visible) va antes que lo que depende de hipótesis de jornada.
2. **Lo estructural, mientras la ventana esté abierta:** navegación, fusiones y máquina de estados de la grilla se hacen AHORA que no hay hábitos que romper — son las cirugías que se encarecen con cada cliente que entra (§2.10).
3. **Cada fase termina en demo:** el artefacto de cierre de cada fase es algo mostrable en una reunión de venta. La venta corre en paralelo al rediseño y es la única fuente de validación disponible (§2.1); una fase que no produce nada mostrable está mal cortada.

Y una consecuencia dura de la corrección: **el flujo jugador baja al final.** Sin tráfico online real, optimizar conversión es pulir una puerta por la que no pasa nadie; el lado que vende el producto hoy es el del dueño.

- **Fase 0 — El sistema de interacción, aplicado al producto ACTUAL.** Jerarquía de acciones única, matriz deshacer/confirmar, input de plata, plantillas de error/vacío — sobre las pantallas que ya existen. Disuelve la mayoría de los 🔴 de la auditoría, no necesita ninguna decisión del §3, y establece UNA gramática antes de construir encima. Además: es lo que hace que cualquier demo se vea seria — los detalles de fricción y contraste son lo primero que un comprador percibe sin saber nombrarlo.
- **Fase 1 — La plata visible.** Encabezado perpetuo de Caja, "Plata en la calle", cierre ritual. Vistas sobre datos existentes, riesgo bajo, y el argumento de venta más directo del producto: "te muestra la plata que se te está escapando" — una frase que un dueño de complejo entiende sin demo.
- **Fase 2 — "Hoy", versión admin solamente.** Aditiva, con taxonomía de alertas cerrada (§4.5). Es LA pantalla de la demo comercial: el dueño prospecto viéndose a sí mismo mirando su negocio desde el sillón. El dilema del manager (§2.5) se difiere sin costo.
- **Fase 3 — La Grilla: estados de cobro + panel lateral + popover de alta mínima.** El corazón del producto y de la demo operativa. El prototipo se valida con dueños/encargados prospecto y design partners (§4.1) — ya no hay encargado propio que observar, así que la validación es comercial. SIN barra de comando.
- **Fase 4 — La reorganización estructural: navegación de 6 espacios + Clientes (con la política de identidad del §2.7 decidida antes) + grilla-lista mobile.** Sube respecto de la versión anterior de este pase (era la última): es la cirugía más barata de hacer sin clientes y la más cara de hacer con ellos. Se hace cuando las pantallas madre ya existen (la nav nueva ordena realidades, no promesas) pero SIN esperar a tener tracción — la ventana expira con el primer contrato.
- **Fase 5 — El flujo jugador: identidad al final + confirmación compartible.** Espera dos cosas: la decisión del hold (§3.1) y que exista al menos un complejo real compartiendo su link — antes de eso no hay embudo que optimizar ni datos para validarlo.
- **Después / experimentos:** barra de comando (como buscador global primero), editor visual de precios, re-oferta y recordatorios (cuando WhatsApp exista), profundización de torneos-en-grilla.

**Qué NO hacer primero, explícito:** la barra de comando (§2.4), el hold (§2.2 sin decidir), cualquier automatización dependiente de WhatsApp (§2.8), y cualquier optimización del embudo jugador anterior al primer complejo con tráfico real.

---

*Este pase no modifica la visión: la acota. Los conceptos centrales sobreviven la crítica; lo que no sobrevive intacto es su secuencia narrativa como secuencia de ejecución, tres soluciones puntuales (command bar como pieza central, hold como detalle de copy, Hoy duplicado por rol) y — sobre todo — su relación con la realidad: con cero clientes, todo el documento es hipótesis en busca de su primera prueba (§2.1). El siguiente artefacto no es un roadmap: son las decisiones del §3 que desbloquean fases, y prospectos reales mirando un prototipo.*
