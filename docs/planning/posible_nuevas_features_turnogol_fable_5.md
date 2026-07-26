# Posibles nuevas features — TurnoGol

> Análisis de psicología de producto: dueño de complejo + jugador amateur → features que muevan reservas, retención, viralidad, monetización o diferenciación. Todo lo que no mueva una de esas cinco, afuera.
>
> **Disciplina de claims** (misma que `docs/gtm/`): lo marcado ⚠️ HIPÓTESIS se valida hablando con dueños/jugadores reales antes de construir. Lo no marcado es mecánica de producto o comportamiento ya conocido del rubro.
>
> Fecha: 2026-07-06 · Modelo: Fable 5 · Contexto: producto actual = grilla + reservas + señas MP + caja + abonados + jugadores + push admin. Sin marketplace, sin WhatsApp saliente, sin cobro automático de fijos (no prometer nada de eso, ver `gtm/03-posicionamiento.md`).

---

## 1. Diagnóstico psicológico del dueño del complejo

Marcelo (doc3): 40-60 años, el complejo es su negocio principal o su "jubilación con pasto sintético". Está físicamente en el complejo. El celular es su oficina.

### Qué desea realmente

- **Ingresos previsibles, no "vender más".** Su sueldo son los fijos. El sueño no es duplicar facturación: es que la semana esté vendida el lunes a la mañana. La previsibilidad le compra tranquilidad; la facturación variable le compra ansiedad.
- **No perder lo que ya casi vendió.** El clavo duele el doble que el hueco nunca vendido (aversión a la pérdida: un turno clavado era plata *asignada* mentalmente). Por eso el pitch GTM arranca por el clavo y funciona.
- **Dejar de ser el cuello de botella.** Quiere poder ir a un cumpleaños un sábado sin que el complejo se incendie. "Que el teléfono deje de manejarme el día" es deseo de libertad, no de eficiencia.
- **Estatus de comerciante que la tiene clara.** Mostrarle la grilla llena a otro dueño en el celular es un momento de orgullo. Esto importa para el boca a boca de zona (ICP: los dueños se conocen entre sí).

### Qué teme

- **Que la plataforma se meta entre él y SUS clientes.** Trauma PedidosYa/Rappi: primero te ayudan, después te cobran comisión por tu propio cliente. Cualquier feature que huela a "TurnoGol es dueño de la demanda" activa esta alarma. Regla de diseño: la demanda nueva se presenta como regalo, nunca como peaje.
- **Pagar por algo que no usa.** En inflación, cada suscripción se re-evalúa todos los meses. El SaaS tiene que re-venderse solo cada mes con evidencia en pesos.
- **Que la tecnología lo deje en ridículo.** Un doble-booking delante del cliente = confianza rota para siempre. El cuaderno nunca se cae. La confiabilidad percibida vale más que cualquier feature.
- **Que sus clientes viejos no se adapten** y le rompan las bolas a él ("no me anda el link").

### Qué le molesta todos los días

- Contestar "¿tenés cancha?" 40 veces, incluso a las 23:47.
- El "che, me bajo" dos horas antes, y no tener a quién venderle ese hueco.
- Perseguir señas y deudas cara a cara: **cobrar es socialmente incómodo** cuando el deudor es "el flaco de los martes" que conoce hace 5 años.
- La caja que no cierra y la sospecha silenciosa sobre el encargado.
- Los lunes a las 15h: canchas vacías que no sabe cómo llenar sin regalar el viernes.

### Qué lo haría pagar (y seguir pagando)

- **Prueba en pesos, no features**: "este mes TurnoGol te cobró $X en señas de clavos, te re-vendió Y turnos cancelados, te recuperó Z clientes que no venían". Le pagás a la app con plata que la app te hizo ganar.
- Que **sus clientes le pidan el link**: cuando el jugador prefiere reservar por TurnoGol, dejar la app tiene costo social para el dueño.
- Que el encargado lo use sin que Marcelo lo empuje.

### Qué lo haría abandonar la app

- Primer mes sin uso visible (activación fallida > cualquier churn posterior).
- Un doble-booking o una seña que "se perdió". Una sola vez.
- Fricción nueva para sus fijos de siempre.
- Sentir que la app trabaja para el jugador y no para él (ej.: cancelaciones demasiado fáciles, reembolsos automáticos que él no controla).
- Aumento de precio en pesos sin valor nuevo visible ese mismo mes.

### Qué métricas le importan aunque no las diga

1. **Plata en caja HOY** (no "revenue mensual": la caja del día).
2. % de ocupación viernes a domingo (el finde ES el negocio).
3. Cuántos fijos tiene y cuántos se le cayeron (estabilidad = sueldo).
4. Quién le debe y cuánto.
5. Silenciosa pero real: **cómo le va comparado con el complejo de la vuelta**. No la va a pedir; si se la mostrás con cuidado (benchmarks anónimos de zona), es adictiva. ⚠️ HIPÓTESIS.

---

## 2. Diagnóstico psicológico del jugador amateur

Tomás (doc3): 20-40 años. El fútbol semanal no es un servicio que consume: **es el evento social de su semana**. Ritual fijo: mismo día, misma hora, casi la misma gente.

### Qué desea realmente

- **Que el partido OCURRA.** El enemigo no es el precio: es que se caiga el partido (no hay cancha, faltan dos, el organizador se cansó). Todo lo que aumente la probabilidad de que el partido exista, gana.
- **Pertenecer.** El grupo de los jueves es identidad. Perder tu lugar en el grupo es una micro-tragedia social.
- **Sentirse crack 90 minutos.** El ego amateur no necesita ser verdad; necesita ser *plausible y celebrado por los suyos*.
- Descargar la semana. El partido es terapia barata.

### Qué lo motiva a volver

- **El ritual** (hábito > motivación: el jueves 21h no se decide, se ejecuta).
- **La revancha**: "la semana que viene te rompo" es el motor de recompra más viejo del fútbol.
- **No cortar la racha** (aversión a la pérdida aplicada al hábito: "hace 11 semanas que no falto").
- Que conseguir cancha sea más fácil que no conseguirla.

### Qué alimenta su ego

- Goles, la atajada del partido, que el gol se comente en el grupo de WhatsApp.
- Ser "el que nunca falta", "el goleador del grupo", "el que consigue la cancha" (el organizador tiene *poder social*, no solo carga).
- **Números que confirmen su autoimagen**: partidos jugados, racha, goles. Redondos y celebrados ("partido n° 50") > precisos y comparativos ("sos el 47° de tu zona").
- Declarar su posición. A la gente le ENCANTA decir de qué juega. Es dato de ego, no de fricción.

### Qué le da paja

- Pagar por adelantado a un desconocido (la seña duele menos si compra algo: "tu jueves queda protegido").
- Registrarse, formularios, bajar apps. Todo lo que no sea un link que abre y funciona.
- **Cargar datos después del partido**, cuando está fundido, duchándose o en el tercer tiempo. El post-partido inmediato es el PEOR momento para pedirle input.
- Perseguir a los otros 9 (dolor exclusivo del organizador — y es enorme).
- Transferirle al organizador "cuando pueda".

### Qué compartiría con amigos

Compartir es **asimétrico: solo se comparte lo que da estatus.**

- El resultado cuando ganó. Nada cuando perdió.
- Su gol, su racha, su hito ("50 partidos este año").
- La convocatoria del partido ("confirmá para el jueves") — compartir por necesidad logística, el más confiable de todos.
- La cargada al que erró el penal (el contenido social real del fútbol amateur es la cargada, no el highlight).

### Qué lo haría reservar más seguido

- No perder su horario fijo (formalizar el turno recurrente).
- Ofertas en horarios que le sirven, no spam genérico.
- Motivos narrativos para jugar "uno más": racha, hito próximo, revancha pendiente. ⚠️ HIPÓTESIS (cadena causal larga; ver §4).

### Qué lo haría invitar a otros

- Cuando invitar = necesidad del partido (falta uno para completar: la invitación más natural del mundo, cero fricción social).
- Cuando el artefacto que comparte es lindo y le da estatus (una tarjeta de resultado bien diseñada vs. un texto).
- Cuando sumar al amigo le baja fricción a él (el amigo confirma solo, paga su parte solo).

---

## 3. Tensiones entre dueño y jugador

| Tensión | El dueño quiere | El jugador quiere | Cómo alinea TurnoGol |
|---|---|---|---|
| **Seña** | Plata anticipada, castigo al clavo | No pagar por adelantado | Re-encuadrar la seña como *protección del horario* ("tu jueves 21h queda asegurado"). Con lista de espera visible, la seña se vuelve racional: si no señás, hay otros esperando tu cancha. |
| **Prime time** | Derramar demanda a horas muertas | Todos quieren 21-23h | Precio por franja visible (ya existe) + lista de espera del prime que ofrece alternativa concreta ("jueves 21 lleno — jueves 19 con descuento"). |
| **Cancelación** | Quedarse la seña | Cancelar gratis a última hora | **La app como malo neutral**: la política es automática y despersonalizada. "Lo cobra el sistema" salva la relación personal dueño-cliente. Este es un valor emocional enorme y poco obvio: TurnoGol absorbe la incomodidad social de cobrar. |
| **Ownership del cliente** | Que la plataforma no se meta | Le da igual | El perfil público y el link son DEL complejo (marca del complejo primero). La demanda cross-tenant, si algún día existe, se presenta como regalo sin comisión v1. |
| **Datos del jugador** | Saber quién clava, quién debe | Privacidad | Per-tenant sí (ya existe: deuda, historial). Score de confiabilidad cross-tenant NO (Ley 25.326 + es un "veraz deportivo": tóxico y riesgoso legalmente). |

**El insight transversal:** casi todas las tensiones se resuelven con el mismo movimiento — TurnoGol como **tercero neutral que ejecuta reglas claras**. En Argentina la relación dueño-cliente es personal; el sistema que cobra, castiga y ordena *sin cara* le saca el conflicto de encima a los dos.

---

## 4. Análisis profundo: estadísticas personales del jugador

La idea original: el jugador registra sus goles post-partido ("¿cuántos goles hiciste ayer en Complejo X?"; al arquero, "¿cuántos recibiste?"). Sin verificación seria. Objetivo: ego amateur, carrera personal, ganas de volver.

### Veredicto corto

**Sí, tiene valor real — pero la versión valiosa es más chica y más automática que la imaginada.** El self-report de goles es el condimento, no el plato. El plato es la carrera que se construye sola con datos que TurnoGol ya tiene.

### Potencial psicológico

Mecanismos concretos que activa:

- **Progreso** (progress principle): ver el contador subir es recompensa en sí misma. El historial convierte partidos sueltos en *una carrera*.
- **Identidad**: "soy el goleador del grupo / el que nunca falta" — las stats confirman la autoimagen, y la gente vuelve a las apps que le devuelven una buena imagen de sí misma.
- **Racha + aversión a la pérdida**: "11 semanas seguidas" es un activo que no se quiere romper. (Duolingo construyó un imperio sobre esto; también generó ansiedad — ver anti-toxicidad.)
- **Efecto dotación / switching cost emocional**: tus 120 partidos viven acá. Irse a otra app = abandonar tu carrera. Es el moat de retención más barato que existe.
- **Peak-end**: el partido es el pico emocional de la semana; la pregunta de goles bien timeada *revive el pico* (regalo), mal timeada es una tarea (spam).

### Potencial de retención

- **Directo**: motivo para re-abrir la app entre partidos (hoy el jugador no tiene ninguno). Wrapped mensual/hitos = toques recurrentes con contenido propio.
- **Indirecto** ⚠️ HIPÓTESIS: la cadena "tengo carrera acá → empujo a mi grupo a reservar donde la app la registra" es larga. No prometerse reservas incrementales por stats; prometerse re-apertura y switching cost. Las reservas las mueven la waitlist y el turno fijo, no los goles.

### Riesgo de mentira o abuso

**El framing correcto: el riesgo NO es que mientan. Es que no carguen nada.**

- Mentir en privado no tiene sentido (¿a quién le mentís, a tu propio diario?).
- Mentir en el grupo es imposible: los otros 9 estaban. La verificación social es gratis si la audiencia es el grupo que jugó.
- La mentira solo destruye valor si hay **ranking global entre desconocidos** — entonces la solución no es verificar: es no construir rankings globales sobre datos auto-reportados. Nunca.
- El riesgo real es el silencio: 70-90% no va a cargar nada por más liviano que sea. ⚠️ HIPÓTESIS a medir. Por eso la capa base debe funcionar con carga cero.

### Diseño liviano: tres capas

**Capa 0 — La carrera automática (carga cero).** Derivada 100% de bookings existentes: partidos jugados, complejos visitados, horario típico, racha semanal, antigüedad ("jugás en Complejo X desde marzo 2026"). Funciona aunque NADIE cargue un solo dato. Resuelve el cold start del perfil. Es la base de todo.

**Capa 1 — El dato de ego (1 tap, opcional).** A la mañana siguiente del partido (NO al terminar: está fundido; a las 10-11am está aburrido en el laburo y revivir el partido es un regalo): push/email "¿Cuántos goles hiciste ayer en Complejo X?" → `[0] [1] [2] [3+]`. Un tap, sin abrir formulario. Arquero (si declaró posición): **"¿Mantuviste la valla invicta?"** `[Sí] [No]` — framing positivo; "¿cuántos te comiste?" es pedirle que registre su fracaso, nadie vuelve por eso. Posición se pregunta UNA vez en el perfil. Si ignora la pregunta 2 veces seguidas, bajar frecuencia automáticamente: el respeto al silencio es retención.

**Capa 2 — El grupo (social cerrado, futuro).** Resultado del partido (UN dato por partido, lo carga el organizador), tabla interna del grupo, MVP del partido votado por los que jugaron. Verificación social incluida: todos vieron el partido. Requiere que exista la entidad "grupo" (ver C1 en §5).

### Qué NO hacer

- ❌ Ranking global o por zona de goles auto-reportados (no creíble → muerto al mes).
- ❌ Badges infantiles ("¡Medalla de bronce! 🥉"). El jugador de 30 años quiere crónica deportiva, no jueguito. Tono: diario deportivo de su carrera, no kindergarten.
- ❌ Pedir minutos, asistencias, posiciones por partido, autoevaluación 1-5. Todo dato que requiera más de un tap, muere.
- ❌ Que las stats afecten precio, acceso o reputación ante los complejos. El día que el número tiene consecuencias, aparece la mentira instrumental y el juego se pudre.
- ❌ Preguntar en el momento equivocado (al terminar el partido) o insistir.
- ❌ Bloquear nada detrás de la carga ("completá tus stats para ver X").

### Versión MVP

1. Perfil privado del jugador con capa 0 (partidos, racha, complejos, antigüedad) — solo lectura de datos existentes.
2. Pregunta de goles 1-tap a la mañana siguiente (email v1; push si algún día el jugador tiene push).
3. Hitos redondos celebrados (10/25/50 partidos, racha 5/10 semanas) con **tarjeta compartible** para WhatsApp (imagen linda, marca del complejo + TurnoGol chiquito).

Costo técnico bajo: los datos ya están en `bookings`; falta agregación + una tabla de stats por jugador + el flujo de pregunta.

### Versión futura

- Grupos persistentes + resultado por partido + tabla interna + MVP votado (capa 2).
- Wrapped anual "Tu año en el fútbol" (diciembre: partidos, goles, complejo más visitado, compañeros más frecuentes) — el artefacto viral por excelencia, estilo Spotify Wrapped. Solo tiene sentido con 6+ meses de datos.
- Comparativas *dentro del grupo* únicamente.

### ¿Privado, social, compartible o validado?

**Privado por default. Compartible a voluntad (asimetría del estatus: él elige qué mostrar). Social solo intra-grupo. Validación implícita por visibilidad grupal — jamás votos de "¿es verdad?"** (eso es poner policías en un asado: mata el juego). Global: solo agregados no competitivos ("se jugaron 1.240 partidos en TurnoGol este mes").

### Cómo evitar la competencia tóxica / poco creíble

- Sin tablas globales (regla dura, ya dicha).
- Celebrar volumen y constancia (partidos, racha) por encima de goles: son inventables-cero porque salen de bookings, y premian al defensor y al arquero igual que al 9.
- Lenguaje de crónica, no de ranking: "tu temporada", "tu carrera", nunca "estás 4° ".
- Racha con perdón: una falta no rompe la racha si reservás la semana siguiente (evita la ansiedad Duolingo y el resentimiento).
- Números del arquero siempre en positivo (vallas invictas, atajadas de penal si algún día se auto-reporta).

---

## 5. Nuevas features posibles

Cada feature: qué es, qué resorte psicológico usa, qué mueve. Las débiles ya fueron eliminadas en la revisión final (lista de descartadas al final de esta sección).

### 5a. Para venderle al dueño

**D1 — Lista de espera automática** ⭐
Turno lleno → el jugador deja su contacto en un tap → si se libera (cancelación), aviso automático al primero de la fila con link de reserva + seña; si no toma en X minutos, pasa al siguiente.
*Psicología dueño:* convierte su peor dolor (el clavo) en su mejor momento (re-venta automática mientras duerme). *Psicología jugador:* escasez real + conseguir lo imposible.
*Evidencia de demanda:* los dueños YA lo hacen a mano — el post de IG "se liberó cancha hoy 22hs" (señal 🎯🎯 del ICP). Es sistematizar un comportamiento existente, la categoría de feature más segura.
*Mueve:* reservas directas + argumento de venta demoledor ("el turno que te clavan se re-vende solo").

**D2 — Clientes dormidos**
Lista automática: "estos 8 jugadores venían 2+ veces/mes y hace 45 días no aparecen" + acción en un click (email con oferta; el dueño también puede llamarlos, es SU cliente).
*Psicología dueño:* el cuaderno no avisa quién dejó de venir — el churn de sus clientes es invisible y es plata que ya tenía. Recuperar > adquirir, y él lo sabe intuitivamente.
*Mueve:* reservas + retención del SaaS (evidencia mensual de valor).

**D3 — Radar de horas muertas + promo en un click**
"Tus lunes 15-18h llevan 4 semanas vacíos" → botón: crear precio promocional para esa franja (usa las pricing rules por franja que YA existen) → se publica en su link.
*Psicología dueño:* quiere llenar huecos pero le da miedo/pereza tocar precios; una sugerencia concreta con acción de un click le da control sin trabajo. NO es dynamic pricing automático (eso le saca control → rechazo).
*Mueve:* reservas en capacidad ociosa, diferenciación vs cuaderno.

**D4 — El Reporte del Lunes (ROI semanal)** ⭐
Email automático al dueño cada lunes: "La semana pasada: $X en señas cobradas, Y turnos re-vendidos por lista de espera, Z reservas entraron solas por tu link (N fuera de tu horario de atención), W clientes recuperados".
*Psicología dueño:* en inflación, cada suscripción se re-decide todos los meses. Este mail re-vende TurnoGol cada semana con plata, no con features. Es la feature anti-churn del SaaS más barata posible.
*Mueve:* retención del SaaS + boca a boca (es el screenshot que le manda al otro dueño).

### 5b. Para enganchar al jugador

**J1 — La carrera automática (capa 0)** ⭐ — ver §4. Partidos, racha, complejos, antigüedad. Carga cero.
*Resorte:* progreso + identidad + switching cost emocional.

**J2 — Goles 1-tap (capa 1)** — ver §4. La pregunta de la mañana siguiente.
*Resorte:* ego plausible + peak-end (revivir el partido).

**J3 — Hitos con tarjeta compartible** ⭐ — partido 25/50/100, racha 10 semanas → imagen linda lista para el grupo de WhatsApp, con la marca del complejo visible.
*Resorte:* estatus compartible (solo se comparte lo que da estatus — dárselo hecho). El complejo sale gratis en cada tarjeta → al dueño también le sirve (publicidad orgánica de SU complejo).
*Mueve:* viralidad de marca de bajo costo.

**J4 — Wrapped futbolero** (mensual liviano / anual fuerte) — resumen de temporada. Solo con 6+ meses de datos. El anual es el pico viral del año.

### 5c. Conectan dueño + jugador

**C1 — El grupo del organizador** ⭐⭐ (la feature más importante del roadmap, NO la primera)
Hoy TurnoGol ve al que reserva; el partido son 10. El organizador es el usuario clave: tiene el poder social y TODA la carga (juntar 10, perseguir confirmaciones, poner la seña de su bolsillo, cobrar de a uno).
Feature: el organizador arma su grupo una vez → al reservar, la app genera la convocatoria (link para el grupo de WhatsApp) → cada jugador confirma en un tap (magic link, sin registro pesado) → el organizador ve "7/10 confirmados" sin perseguir a nadie.
*Psicología:* le sacás la carga al organizador y le dejás el poder (él sigue siendo "el que consigue la cancha"). Cada partido = hasta 9 contactos nuevos tocando TurnoGol con contexto y motivo — **el caballo de Troya de adquisición de jugadores**. Y para el dueño: los 10 identificados en vez de 1 (más jugadores en su módulo Jugadores, más candidatos a dormidos/waitlist).
*Por qué no primero:* es la más pesada (entidad grupo, invitaciones, estados de confirmación) y conviene validarla con el test manual de §8 antes.
*V2 del grupo:* registro liviano de "quién pagó su parte" (SIN mover plata — solo tracking; mover plata = split payments MP = complejidad y comisiones que no queremos todavía).

**C2 — Turno fijo self-service**
El jugador/organizador pide desde el link: "quiero todos los jueves 21h" → al dueño le llega la solicitud → acepta en un click → se crea el abonado (módulo que ya existe).
*Psicología:* el jugador protege su ritual (el fijo es la formalización del hábito); el dueño consigue lo que más quiere (ingresos previsibles) sin gestionar nada. Formaliza el core del negocio real de un complejo.

**C3 — Re-reserva en un tap ("revancha")**
Al confirmar goles o ver el resumen: "¿Repetís el jueves que viene, 21h en Complejo X?" → un tap → reservado (misma cancha, mismo horario).
*Psicología:* captura la revancha en el pico emocional post-partido, cuando la intención de volver está más alta. Convierte hábito informal en reserva concreta. Barato: es un shortcut sobre el flujo existente.

### 5d. Retención (resumen — ya descriptas)

- Jugador: racha con perdón (J1), pregunta de goles (J2), wrapped (J4), turno fijo (C2), revancha 1-tap (C3).
- Dueño: Reporte del Lunes (D4), dormidos (D2). El dueño se retiene con evidencia; el jugador, con identidad y hábito.

### 5e. Viralidad

- Tarjetas de hito/resultado para WhatsApp (J3) — el artefacto entra al grupo, 9 lo ven.
- Convocatoria del grupo (C1) — viralidad estructural: el producto se usa invitando.
- Wrapped anual (J4) — pico estacional.
- El screenshot del Reporte del Lunes entre dueños (D4) — viralidad B2B de zona (los dueños se conocen; el GTM ya lo explota).
- **Principio:** en Argentina la viralidad no es un feed propio: es fabricar artefactos con estatus para el grupo de WhatsApp que ya existe.

### 5f. Monetización

- **Plan superior con "módulo vender más"** (D1+D2+D3+D4 como paquete premium sobre la gestión base). El upsell se justifica solo: el Reporte del Lunes muestra en pesos lo que el módulo generó. ⚠️ Decisión de pricing a validar: ¿incluirlo en todos los planes los primeros meses para generar los casos de éxito y gatear después?
- Cantina pre-order ("agregá 2 Gatorade a la reserva") — sube ticket promedio usando el módulo productos existente. V2: requiere flujo de pago/entrega; no ahora.
- Comisión por demanda nueva de red (estilo Playtomic): **solo futuro lejano**, solo sobre jugadores probadamente originados por TurnoGol, nunca sobre los clientes propios del complejo (miedo #1 del dueño). Hoy no existe red que lo justifique — no prometerlo (regla GTM).

### 5g. Diferenciales vs WhatsApp / Excel / cuaderno

El rival real es WhatsApp+cuaderno (GTM doc3). La diferencia conceptual: **WhatsApp no tiene memoria estructurada, no muestra escasez y no cobra sin vergüenza.**

- Memoria: quién vino, cuánto pagó, quién debe, quién dejó de venir (D2), la carrera del jugador (J1). El cuaderno guarda reservas; no responde preguntas.
- Escasez visible: la grilla pública convierte "¿tenés cancha?" en "quedan 2 huecos el jueves" — la escasez visible vende sola, el cuaderno la esconde.
- Cobro sin vergüenza: seña + deuda automática = el sistema es el malo (§3).
- Estrategia frente a WhatsApp: **integrarse, no competir**. Textos pre-armados, links wa.me, tarjetas pensadas para pegar en el grupo. TurnoGol no reemplaza el grupo de WhatsApp; le da artefactos mejores.

### 5h. Parecen buenas pero NO conviene hacerlas todavía

| Feature | Por qué seduce | Por qué no ahora |
|---|---|---|
| **"Falta Uno" / matchmaking de desconocidos** | Todos la piden en las encuestas | Ya se eliminó del scope v1 (migr. 028) con razón: cold start brutal (sin densidad de jugadores, la feature muestra vacío = producto muerto), y la sociología del fútbol 5 es tribal — grupos cerrados de amigos, no 4 intercambiables por nivel como el pádel de Playtomic. Reconsiderar solo con densidad real de jugadores por zona. |
| ~~**Torneos (módulo completo)**~~ → **REABIERTA 2026-07-24** | Los complejos viven de torneos; parece obvio | Era: "un producto entero disfrazado de feature (fixtures, tablas, fechas, cobros, reprogramaciones por lluvia)… validar demanda primero; si 8/10 dueños lo piden espontáneamente, planificarlo como v2 mayor". **La condición se cumplió**: llegó demanda espontánea, y el dolor concreto reportado fue el de ocupación de horarios (la grilla miente), no el fixture. Se reabre con las dos mitigaciones que este mismo doc pedía: feature flag apagado por defecto (piloto por complejo) y 4 fases cortables. El diagnóstico de tamaño sigue siendo válido: son 8 tablas. Ver `docs/decisions/2026-07-24-torneos.md`. |
| **Ranking global / por zona de goles** | "Gamificación" fácil | Datos auto-reportados + desconocidos = tabla no creíble → cinismo → mancha todo el sistema de stats (§4). |
| **Score de confiabilidad cross-tenant del jugador** | Los dueños lo amarían | Veraz deportivo: riesgo Ley 25.326, tóxico para el jugador, mata la adquisición B2C. Per-tenant (deuda, historial propio) ya existe y alcanza. |
| **Split payment real (mover plata entre jugadores)** | Dolor real del organizador | Marketplace de pagos MP = comisiones, disputas, regulación. Primero el tracking sin plata (C1 v2); mover plata solo si el tracking demuestra uso intenso. |
| **Dynamic pricing automático** | "Revenue management" | Le saca control al dueño = su miedo central. Sugerencias con acción manual (D3) sí; automático no. |
| **Red social / feed / seguir jugadores** | "Engagement" | Cementerio de features. El feed del fútbol amateur ya existe y es el grupo de WhatsApp. Imposible de ganar, carísimo de mantener. |
| **App nativa** | "Las apps retienen más" | El jugador argentino no baja apps para reservar cancha. PWA + link + email/push alcanza v1. |
| **Video highlights / cámaras** | Diferencial sexy (Veo) | Hardware, capex, instalación. Otro negocio. |

---

## 6. Scoring de features

Escala 1-10. En **Facilidad**: 10 = fácil. En **Riesgo op.** y **Abuso**: 10 = MUCHO riesgo (menos es mejor). **Prioridad** pondera impacto/esfuerzo/riesgo/secuencia.

| Feature | Deseo jugador | Valor dueño | Impacto reservas | Retención | Viralidad | Facilidad | Riesgo op. | Riesgo abuso | **Prioridad** |
|---|---|---|---|---|---|---|---|---|---|
| D1 Lista de espera | 8 | 9 | 9 | 6 | 4 | 7 | 3 | 2 | **9** |
| D4 Reporte del Lunes | 1 | 9 | 3 | 9 (SaaS) | 5 (B2B) | 8 | 1 | 1 | **9** |
| J1 Carrera automática | 7 | 4 | 5 | 9 | 5 | 9 | 1 | 1 | **9** |
| D2 Clientes dormidos | 4 | 9 | 8 | 8 | 2 | 7 | 2 | 1 | **8** |
| J2 Goles 1-tap | 8 | 3 | 4 | 8 | 5 | 8 | 2 | 3 | **8** |
| J3 Tarjetas de hito | 7 | 5 | 5 | 6 | 8 | 7 | 1 | 2 | **8** |
| C3 Revancha 1-tap | 8 | 7 | 8 | 8 | 2 | 8 | 2 | 1 | **8** |
| C1 Grupo del organizador | 9 | 7 | 8 | 9 | 10 | 4 | 5 | 3 | **8** (secuencia: post-validación) |
| C2 Turno fijo self-service | 7 | 8 | 7 | 9 | 3 | 7 | 3 | 2 | **7** |
| D3 Radar horas muertas | 5 | 8 | 7 | 7 | 2 | 6 | 3 | 1 | **7** |
| J4 Wrapped anual | 8 | 3 | 4 | 7 | 9 | 6 | 1 | 2 | **6** (estacional, requiere datos) |
| Cantina pre-order | 5 | 7 | 2 | 4 | 1 | 5 | 5 | 2 | **5** |
| Torneos completos | 8 | 7 | 7 | 8 | 7 | 2 | 8 | 4 | **4** (validar antes) |
| Falta Uno | 6* | 5 | 5 | 4 | 6 | 3 | 7 | 6 | **2** |

\* Los jugadores *dicen* 9 y *usan* 3: deseo declarado ≠ comportamiento. Clásica trampa de encuesta.

---

## 7. Roadmap recomendado

**MVP inmediato (con el producto actual, pre/durante primeros clientes)**
1. **J1 Carrera automática** — cero input, datos ya existen, activa el loop psicológico completo de la noche a la mañana.
2. **D1 Lista de espera** — el mejor argumento de venta nuevo del pitch ("el clavo se re-vende solo").
3. **D4 Reporte del Lunes** — versión 1 aunque sea con 3 números; empieza a re-vender el SaaS desde la semana 1.

**V1 (después de los primeros clientes pagando)**
4. **J2 Goles 1-tap** + perfil visible (sobre la base de J1).
5. **J3 Tarjetas de hito compartibles**.
6. **C3 Revancha 1-tap**.
7. **D2 Clientes dormidos** (necesita ~2-3 meses de datos para que la lista tenga sentido).

**Growth**
8. **C1 Grupo del organizador** — la apuesta grande, después de validarla (§8) y con base de jugadores activa.
9. **C2 Turno fijo self-service**.
10. **D3 Radar de horas muertas**.
11. **J4 Wrapped** (diciembre, con 6+ meses de datos).

**Futuras (condicionadas a señales)**
- Capa 2 social del grupo (resultado, tabla interna, MVP votado) — si C1 prende.
- Cantina pre-order — si los dueños con cantina activa lo piden.
- ~~Torneos — solo si la demanda espontánea es abrumadora, y como proyecto mayor.~~ → **en curso desde 2026-07-24**: la señal llegó. Se hace como proyecto mayor en 4 fases, detrás del flag `tournaments`, empezando por la ocupación de la grilla (que es el dolor reportado). `docs/decisions/2026-07-24-torneos.md`.
- Comisión por demanda de red — solo con red real; años, no meses.

**Evitar (ver §5h)**: Falta Uno ahora, ranking global, score cross-tenant, split payment real, dynamic pricing automático, red social/feed, app nativa, video.

---

## 8. Experimentos de validación

Regla: ninguna feature growth se construye sin su señal. Los tests manuales van ANTES que el código.

### Con dueños (en las charlas de venta que el GTM ya planifica — costo cero extra)

| Feature | Pregunta / test | Señal de construir | Señal de descartar |
|---|---|---|---|
| D1 Waitlist | "Contame la última vez que te cancelaron un turno del finde. ¿Qué hiciste con ese hueco?" | Cuenta la historia con bronca + hoy lo resuelve posteando en IG o llamando gente | "Ni me acuerdo, siempre se llena solo" en 8/10 |
| D2 Dormidos | "¿Sabés qué clientes de este año dejaron de venir?" | Silencio incómodo + "ni idea la verdad" + interés inmediato | "Los conozco a todos, me doy cuenta al toque" (complejos muy chicos) |
| D3 Horas muertas | "¿Cómo decidís el precio del lunes a la tarde vs el viernes a la noche?" | Ya hace promos a mano (posteos, precios de palabra) | Precio único inamovible por convicción |
| D4 Reporte | Mandarle a los primeros clientes el reporte ARMADO A MANO cada lunes durante un mes | Lo menciona él solo, lo reenvía, lo screenshotea | Nunca lo abre (medir apertura) |

### Con jugadores (post-partido en complejos, grupos de WhatsApp propios; n≥20)

| Feature | Test | Señal de construir | Señal de descartar |
|---|---|---|---|
| J2 Goles | **Test concierge:** conseguir 20-30 jugadores, mandarles a mano (WhatsApp/email) la mañana siguiente: "¿cuántos goles hiciste ayer?" | ≥40% responde, y varios contestan con detalle/cargadas (ego vivo) | ≤15% responde o contestan "?" — quedarse solo con capa 0 |
| J1 Carrera | Preguntar: "¿cuántos partidos jugaste este año?" | "Ni idea… un montón" + sonrisa (el dato no existe y lo querría) | Indiferencia total en 15/20 |
| J3 Tarjetas | Mockup de tarjeta "Jugaste tu partido n° 50" (Figma/Canva, 1 hora) → mostrarla: "¿la mandarías a tu grupo?" | La quieren YA para ellos, preguntan cómo conseguirla | "Qué me importa" mayoritario |
| C1 Grupo | A organizadores: "¿qué es lo peor de organizar el partido?" + test concierge: ofrecerse a gestionar las confirmaciones de UN grupo por 3 semanas vía link manual | "Perseguir a los que no confirman" top-2 espontáneo en 7/10 + el grupo del test lo adopta | Organizadores dicen que el grupo de WhatsApp les alcanza y el test se ignora |
| D1 Waitlist (lado jugador) | Fake door en el link público: turno lleno → botón "Avisarme si se libera" → pantalla "te avisamos" (manual detrás) | ≥25% de los que ven turnos llenos lo tocan; y al avisar, ≥30% reserva | Nadie lo toca en 2 semanas |

### Principios de lectura

- **Comportamiento > opinión**: "¿la usarías?" vale cero; el fake door y el concierge valen todo (Falta Uno es el ejemplo: deseo declarado altísimo, uso real bajo).
- Cada test manual es también contenido para el GTM (casos, screenshots, historias para IG del complejo).
- Presupuesto: todos los tests de arriba se hacen en 2-4 semanas sin escribir código de producto.

---

## 9. Recomendación brutal

**Las 5 que más conviene construir (en orden):**
1. **D1 Lista de espera** — ataca el dolor #1 del dueño (el clavo) por segunda vez y vende el SaaS solo.
2. **J1 Carrera automática** — retención B2C casi gratis: los datos ya existen, nadie tiene que cargar nada.
3. **D4 Reporte del Lunes** — la feature que hace que el dueño no dé de baja en el mes 3.
4. **J2+J3 Goles 1-tap + tarjetas de hito** (par inseparable: el dato alimenta el artefacto que se comparte).
5. **C3 Revancha 1-tap** — la conversión más barata de hábito a reserva.

**Las 5 que más conviene evitar (hoy):**
1. Falta Uno / matchmaking — cold start letal, sociología equivocada para fútbol.
2. Ranking global de goles — destruye la credibilidad de todo el sistema de stats.
3. Red social / feed propio — el feed ya existe y se llama WhatsApp.
4. Score de confiabilidad cross-tenant — riesgo legal + mata la confianza del jugador.
5. Torneos como módulo completo — un segundo producto disfrazado de feature.

**La feature que puede diferenciar a TurnoGol:** **C1 — El grupo del organizador.** ATC y las turneras gestionan canchas; nadie le resuelve al organizador el trabajo de juntar 10 tipos. Es la feature que convierte 1 usuario por reserva en 10, con motivo real para tocar la app. Combinada con J1 (la carrera de cada uno de esos 10 se construye sola), crea el moat: la competencia puede copiar la grilla en un trimestre; no puede copiar los grupos activos ni el historial emocional acumulado. Es apuesta grande → va después de la validación concierge, no antes.

**La feature que puede hacer perder más tiempo:** **Torneos.** Es la que más piden los dueños en frío y la que más meses come por punto de retención ganado. La segunda sirena es Falta Uno. Ambas comparten el patrón: deseo declarado enorme, complejidad enorme, uso real incierto.

**Qué construiría primero con recursos limitados:** **J1 + D1 + D4 en ese orden, en un solo ciclo corto.** Los tres usan datos e infraestructura que ya existen (bookings, cancelaciones, señas, email), ninguno agrega fricción al dueño ni le pide input al jugador, y cubren los tres frentes a la vez: retención del jugador (J1), reservas nuevas (D1) y retención del SaaS (D4). Con eso andando, correr los tests concierge de §8 (goles y grupo) mientras se venden los primeros complejos — y decidir C1 con datos, no con fe.

---

### Apéndice: qué es hipótesis y qué es firme

**Firme (mecánica de producto o comportamiento conocido del rubro):** el clavo como dolor #1 del pitch (ya asumido por GTM, validándose en las primeras 20 charlas), la seña como mecanismo anti-clavo, WhatsApp como canal social real, los fijos como núcleo de ingresos del complejo, waitlist manual ya practicada por dueños (posteos "se liberó").

**⚠️ HIPÓTESIS a validar (cada una tiene su experimento en §8):** tasa de respuesta a la pregunta de goles (≥40%), deseo real de la carrera automática, share rate de tarjetas, dolor del organizador como top-2 espontáneo, conversión de waitlist (≥30% del avisado reserva), stats → más reservas (cadena indirecta; prometerse solo re-apertura y switching cost), benchmarks de zona para dueños (ni testeado — idea para más adelante).

**Features eliminadas durante la revisión final por lindas-pero-débiles:** encuesta de satisfacción post-partido genérica (ya existe reviews; una encuesta más = fricción sin resorte), niveles/ligas de jugador por skill declarado (sin matchmaking no sirve para nada), chat in-app (WhatsApp gana siempre), recordatorio 24hs al jugador (ya descartado en P9.2 por costo; reconstruir solo con WhatsApp post-v1), programa de puntos/cashback (compra hábito que ya existe gratis: la revancha).
