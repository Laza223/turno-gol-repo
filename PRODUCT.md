# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primario: el encargado en el mostrador** (Rodrigo en `docs/spec/doc3_personas_jtbd.md`, rol `manager`). Trabaja solo de 17 a 01, en una PC fija con mouse. Hace todo a la vez: contesta el WhatsApp del complejo, que es por donde entran las reservas; carga turnos para el mismo día; cobra los turnos que terminan y vende en la cantina. Aprende rápido y no tolera pasos de más. Su trabajo es que nadie espere en el mostrador y que no se pierda plata.

**Secundario: el dueño** (Marcelo en doc3, rol `admin`). Paga TurnoGol. De noche no está en el complejo: mira desde el celular cómo va la noche y alguna vez carga un turno desde ahí. Configura canchas, precios y horarios en el alta y después solo cuando algo cambia. No entra a Métricas. Acá la evidencia contradice a doc3, que lo pone atendiendo el mostrador. Manda la evidencia.

**Tercero: el jugador**, que reserva desde el portal público. Es otra superficie con su propio contexto: en el Vagón hubo 0 reservas online.

La base de evidencia es un solo complejo en uso real, El Vagón: 5 canchas, uso real desde el 2026-09-14. Se lo toma como representante del ICP (4 a 6 canchas, turnos fijos, un encargado), no como un cliente a medida.

## Product Purpose

TurnoGol es el sistema con el que un complejo de fútbol en Argentina lleva su día: la grilla de canchas, los turnos (sueltos, fijos y eventos), el cobro de cada turno, la cantina y la caja. Reemplaza al cuaderno y al WhatsApp como registro. Es solo para fútbol.

El panel tiene éxito si:

- de 20 a 22 el encargado registra cada cobro y cada venta en el momento, sin irse de la pantalla en la que está y sin errores de plata;
- el dueño, desde el celular, sabe cómo va la noche sin llamar a nadie.

## Positioning

Está hecho para la forma en que se cobra una cancha de fútbol: después del partido y de a partes. Cada jugador paga lo suyo o paga un equipo por vez, en efectivo o con MercadoPago cargado a mano, y la cantina se atiende en el mismo mostrador.

La promesa general es que el complejo funciona bajo control aunque el dueño no esté encima. Los turnos fijos son la puerta de entrada comercial. La seña online es opcional y nunca va de titular. Esto es provisional: es el wedge D→C→B→A de `docs/decisions/2026-09-02-experimento-30-dias.md` D2, con confianza baja.

## Operating Context

Todo lo que sigue sale de 8 días de producción (14 al 22 de septiembre de 2026). El detalle y las fuentes están en `docs/rediseno-panel/insumos.md`.

- **Horario.** Se opera de 17 a 01. La hora pico es a las 19 y a las 20: ahí empezaron 51 de los 75 turnos jugados. De mañana no opera nadie.
- **El momento crítico, de 20:00 a 22:00.** Son unos 29 movimientos en dos horas (alrededor de 13 pagos de turnos y 15 ventas), amontonados en la media hora que sigue al final de cada turno. Mientras tanto, el encargado atiende a los que llegan y contesta el WhatsApp.
- **Cobro.** Se cobra después del partido: en la mediana, el primer pago llega 29 minutos después de que termina el turno, y solo 3 de 65 turnos pagaron algo antes de empezar. 7 de cada 10 turnos se pagan en 2 o más veces (hasta 7) y casi la mitad mezcla métodos. Entre el primer pago y el último pasan 7 minutos en la mediana. El 65% es en efectivo, el 33% por MercadoPago cargado a mano y el 3% por transferencia.
- **Un turno terminado y sin cobrar es plata que todavía no entró.** Lo normal es cobrarlo en la media hora que sigue al partido, pero si nadie lo cobra se pierde de vista: en 14 días el piloto juntó cientos de miles de pesos en turnos jugados y no cobrados (2026-09-25, `10-aprendizajes.md`). No es deuda: es un turno no cobrado.
- **Cantina.** Es la tarea más frecuente: 197 ventas en 8 días, unas 25 por noche. La venta típica es de $6.000 y tiene 1,2 productos. El 99% son ventas sueltas, no atadas a un turno. El pico es a las 20 y a las 21, justo cuando se cobran los turnos.
- **Carga de turnos.** Se cargan 6 a 8 por día, entre las 17 y las 20, siempre para el mismo día: el 89% menos de 6 h antes y el 38% menos de 1 h antes. Entran por WhatsApp.
- **Ver si hay lugar** pasa con cada WhatsApp. No se puede medir, pero tiene que ser lo más frecuente.
- **Cada tanto:** unas 2 cancelaciones por día, 7 fiados en 8 días, 2 eventos sin cargo (escuelitas) por semana y 2 turnos fijos activos.
- **Nunca, en los 8 días:** cierre de caja, reposición de stock, equipo, métricas, fotos, logo o perfil público.
- **Dispositivo.** El mostrador usa una notebook chica con mouse. El piso de diseño es 1366×768, que con el navegador deja unos 1280×650 px útiles. El dueño usa el celular.
- **Cantidad de canchas.** El Vagón tiene 5 y el ICP comercial es de 4 a 6, pero hay complejos de 10 y quizá más (el founder, 2026-09-23). Con el precio por cancha, uno de 10 paga casi el doble que uno de 5. El panel trata 10 canchas como un caso de primera clase en la notebook, con la grilla y el cobro a la vista y Vender a un toque (botón o tecla V), y no se rompe hasta 16. Más de 16 queda sin diseñar. Ya hay un roce registrado: con 7 o 10 canchas, el tablero de `/reservas` deja la mitad fuera de pantalla (`10-aprendizajes.md`).
- **Cuenta compartida.** El encargado entra con el usuario del dueño y el panel no sabe quién cobra. El refinamiento sobre el estilo actual tiene que andar bien así: ni la pantalla de inicio ni la navegación pueden depender de que el encargado tenga usuario propio.

## Capabilities and Constraints

**Lo que existe y el refinamiento sobre el estilo actual conserva:**

- grilla por cancha y por día;
- turnos sueltos de 60 minutos;
- eventos de N horas enteras, con precio editable o sin cargo y repetibles;
- bloqueos;
- turnos fijos (abonados, con precio por sesión);
- cobros parciales con métodos mezclados, "Pagó uno" (un contador visual) y cobro por equipo (cada cobro guarda de qué equipo es);
- fiados;
- cantina con catálogo y stock;
- caja: día operativo con corte propio, cuentas pendientes y cierre;
- jugadores y personas, con etiquetas de un conjunto cerrado;
- no-show con softban;
- reservas online con seña opcional por MercadoPago;
- push al dueño cuando entra una reserva online;
- configuración: canchas, precios por franja, horarios que cierran pasada la medianoche, reservas, avisos, equipo, facturación y perfil público;
- torneos, detrás de un feature flag apagado.

**Restricciones:**

- Este refinamiento sobre el estilo actual es de presentación. La lógica de negocio, las Server Actions, las queries y el schema no cambian. Si una mejora de UX los necesita, se frena y se decide aparte. Así se decidió el 2026-09-25 guardar el equipo de cada cobro (`docs/decisions/2026-09-25-hoy-cobrar-ahora.md`).
- Roles: `admin` (todo) y `manager` (Hoy, grilla, reservas, caja y jugadores; sin Configuración, Equipo ni Métricas).
- Montos en centavos de ARS. Horas en UTC en la base, que se muestran en hora argentina. Día operativo: el turno de las 23 y los de la madrugada pertenecen al día en que arrancó la jornada.
- Ley 25.326: nunca texto libre sobre personas. Las etiquetas son un enum cerrado de 5.
- Vetos de producto que están en `CLAUDE.md`: sin Falta Uno, sin billetera, sin saldo a favor de abonados, el no-show no es deuda, sin recordatorio de 24 h, el jugador no tiene Realtime y no hay AFIP.
- Feature freeze hasta el 2026-11-01 (D4). El refinamiento sobre el estilo actual del panel queda afuera del freeze por decisión del dueño (2026-09-23).
- Vocabulario de pantalla: Hoy, Grilla, Reservas, Caja, Cantina, Cuentas, Jugadores, Turnos fijos, turno, evento, bloqueo, seña, fiado, cancha (F5/F7).

**Sin decidir:**

- Cierre de caja: el arqueo manual no lo usaba nadie y se eliminó. Desde el 2026-09-25 el cierre es automático: el resumen de arriba de Caja › Cuentas (cuánto entró, por dónde y de qué), sin contar billetes.
- Cuentas separadas para el encargado: por ahora no se empujan. Se diseña para la cuenta compartida.

## Brand Commitments

- El nombre es TurnoGol. El logo es el wordmark "TURNO" + "GOL" (verde, cursiva pesada) y el isotipo "TG", en `public/brand-assets/`. El refinamiento sobre el estilo actual del panel no toca el logo.
- La voz es español rioplatense, directo y sin tecnicismos: "tan simple que un niño lo entienda" (regla del dueño). El panel admin es "denso pero obvio".
- El manual visual y el marketing brain de `public/brand-assets/` son marketing anterior. Hablan de multideporte y ponen la seña automática de titular, así que contradicen decisiones vigentes (solo fútbol, D2) y no son autoridad para el panel.

## Evidence on Hand

- `docs/rediseno-panel/insumos.md`: 8 días de producción (conteos, solo lectura) y las respuestas del founder del 2026-09-23.
- `docs/gtm/ejecucion/10-aprendizajes.md`: roces observados, con fecha y tipo.
- Decisiones vigentes del mostrador: `docs/decisions/2026-09-14-alta-grilla-modal-unico-y-reservas-por-cancha.md`, `2026-09-15-cobro-por-equipo.md`, `2026-09-15-evento-repetible-edicion-y-cobro-parcial.md`, `2026-09-19-hoy-cobrar-y-vender.md` y `2026-09-25-hoy-cobrar-ahora.md`.
- Lo que no hay y no se inventa: testimonios, frases textuales del complejo, métricas de satisfacción, un segundo complejo en uso, y cuánto se mira la grilla.

## Product Principles

1. **Lo de cada minuto le gana el lugar a lo de cada mes.** Vender, cobrar y ver si hay lugar van primero. Cerrar la caja, el stock, el equipo, las métricas y la configuración van donde no estorben.
2. **Se cobra sin irse de donde uno está.** Un cobro o una venta se registran sobre la pantalla actual, en el momento en que aparece la plata.
3. **Jugado y sin cobrar es urgente.** Se muestra en rojo: "No cobrado" en la Grilla, "Cobrar $X" en la cancha que lo tiene y "Turnos no cobrados" en Hoy y en Caja. Nunca como deuda: es plata que no entró, y hasta que se cobra no está en la caja ni en las métricas. Un turno que se está jugando y todavía debe se cobra a tiempo y va sin color; uno pagado entero va en verde.
4. **El panel muestra el estado, no pide memoria.** Quién pagó y cuánto falta se lee sin abrir nada.
5. **Cuando la persona imaginada y el mostrador no coinciden, gana el mostrador.** Las decisiones se apoyan en lo medido en uso real, no en doc3.

## Accessibility & Inclusion

- WCAG 2.1 AA en tema claro y oscuro. Es la práctica actual: el a11y de Storybook corre en los dos temas.
- El caso principal es mouse en una PC. En el celular, los objetivos táctiles miden 44 px o más.
- Tiene que poder leerse bajo presión: montos, horas y estados se leen de un vistazo, y el estado nunca se comunica solo con color.
