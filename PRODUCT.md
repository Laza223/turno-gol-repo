# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

TurnoGol tiene dos superficies y cada una tiene su usuario: el portal (la web pública y la cuenta del jugador) y el panel del complejo. Desde el 2026-10-14 el foco está en el portal (`docs/decisions/2026-10-14-foco-jugador-rival.md`, F3). El mantenimiento del panel (F2) cayó con el freeze el 2026-10-22 (`docs/decisions/2026-10-22-se-levanta-el-freeze.md`): el panel vuelve a recibir mejoras.

### Portal: el jugador

**Primario: el jugador amateur que quiere jugar.** Reserva una cancha y, con RIVAL, busca a los que le faltan para el partido o se suma al de otro. No es técnico. En un grupo de amigos casi siempre reserva uno solo, pero depende del grupo (el founder, 2026-10-15). Cuántos juegan depende del formato de la cancha, de Fútbol 4 a Fútbol 11: "los 10" es solo el fútbol 5.

Llega por dos caminos que pesan lo mismo (el founder, 2026-10-15):

- **el link de su complejo** (`turnogol.app/<slug>`), que el complejo comparte en sus redes y por WhatsApp. Quien llega así viene a reservar en ese complejo y puede no saber qué es TurnoGol;
- **TurnoGol mismo**: la home y `/explorar`, para buscar dónde jugar.

Como el link llega por WhatsApp o por redes, se abre en el celular.

### Panel: el encargado y el dueño

Estuvo en mantenimiento del 2026-10-14 al 2026-10-22 (F2). Desde que se levantó el freeze vuelve a recibir mejoras (`docs/decisions/2026-10-22-se-levanta-el-freeze.md`).

**Primario: el encargado en el mostrador** (Rodrigo en `docs/spec/doc3_personas_jtbd.md`, rol `manager`). Trabaja solo de 17 a 01, en una PC fija con mouse. Hace todo a la vez: contesta el WhatsApp del complejo, que es por donde entran las reservas; carga turnos para el mismo día; cobra los turnos que terminan y vende en la cantina. Aprende rápido y no tolera pasos de más. Su trabajo es que nadie espere en el mostrador y que no se pierda plata.

**Secundario: el dueño** (Marcelo en doc3, rol `admin`). Paga TurnoGol. De noche no está en el complejo: mira desde el celular cómo va la noche y alguna vez carga un turno desde ahí. Configura canchas, precios y horarios en el alta y después solo cuando algo cambia. No entra a Métricas. Acá la evidencia contradice a doc3, que lo pone atendiendo el mostrador. Manda la evidencia.

La base de evidencia del panel es un solo complejo en uso real, El Vagón: 5 canchas, uso real desde el 2026-09-14. Se lo toma como representante del ICP (4 a 6 canchas, turnos fijos, un encargado), no como un cliente a medida.

## Product Purpose

TurnoGol es el sistema con el que un complejo de fútbol en Argentina lleva su día: la grilla de canchas, los turnos (sueltos, fijos y eventos), el cobro de cada turno, la cantina y la caja. Reemplaza al cuaderno y al WhatsApp como registro. Es solo para fútbol.

Del lado del jugador, el portal sirve para reservar una cancha sin escribirle al complejo y, con RIVAL, para juntar a los que faltan y que el partido se juegue.

El portal tiene éxito si (el founder, 2026-10-15):

- entran reservas que no pasaron por el WhatsApp del complejo;
- el jugador reserva solo y rápido, sin que nadie lo ayude;
- los jugadores usan RIVAL;
- el que reservó una vez vuelve a reservar.

La vara medible del rediseño (F3): un jugador nuevo reserva en su complejo desde el link que le pasó el complejo con menos toques que hoy, medido contra `docs/planning/2026-10-14-portal-jugador-linea-base.md`, y cada error dice qué pasó y qué hacer.

El panel tiene éxito si:

- de 20 a 22 el encargado registra cada cobro y cada venta en el momento, sin irse de la pantalla en la que está y sin errores de plata;
- el dueño, desde el celular, sabe cómo va la noche sin llamar a nadie.

## Positioning

**Panel.** Está hecho para la forma en que se cobra una cancha de fútbol: después del partido y de a partes. Cada jugador paga lo suyo o paga un equipo por vez, en efectivo o con MercadoPago cargado a mano, y la cantina se atiende en el mismo mostrador.

La promesa general es que el complejo funciona bajo control aunque el dueño no esté encima. Los turnos fijos son la puerta de entrada comercial. La seña online es opcional y nunca va de titular. Esto es provisional: es el wedge D→C→B→A de `docs/decisions/2026-09-02-experimento-30-dias.md` D2, con confianza baja.

**Portal.** La reserva del jugador cae en la misma grilla con la que el complejo trabaja todo el día: si el complejo carga ahí sus turnos, lo que el portal muestra libre está libre. RIVAL sale con el partido del grupo y el tablón juntos, sobre un solo modelo de partido. El partido del grupo sirve aunque no haya nadie más en la zona y se comparte en el WhatsApp del grupo. Es la respuesta al arranque en frío que hizo eliminar Falta Uno en junio. El tablón suma desconocidos cuando hay densidad. Confianza baja: el pedido es de un solo cliente. Aun así, el dueño va con todo y sin umbral de reversión (`docs/decisions/2026-10-22-rival-v1.md`).

## Operating Context

### Portal

Hay poco uso real que medir. El 2026-10-14 en El Vagón no había entrado ninguna reserva online. El 2026-10-16 publicó su link y ese día entraron 10 jugadores nuevos y 9 reservas online (`10-aprendizajes.md`). Lo que sigue sale del código, de las decisiones y del demo del 2026-10-14.

- **Llegada por el link.** `turnogol.app/<slug>` abre la página del complejo sin día, hora ni cancha. El complejo lo comparte desde el cierre del alta, con un mensaje de WhatsApp ya escrito, o lo copia del panel. La home y `/explorar` no están en el recorrido de reserva: hoy solo aparecen como salidas después de reservar.
- **El navegador interno.** El link que se toca en Instagram, y quizá en WhatsApp, puede abrirse en el navegador de esa app, y Google no deja iniciar sesión desde navegadores embebidos (`disallowed_useragent`). Verificado el 2026-10-22 con la documentación de Google y reportes de otros sitios, todavía **sin probar en un teléfono**: Instagram y Facebook abren el link en su navegador interno y ahí Google falla; WhatsApp abre el link de un chat en el navegador del teléfono y Google anda (su navegador interno solo abre botones de plantillas de empresas grandes, y el de iPhone para todos los links está en desarrollo). Desde entonces, en un navegador interno el ingreso pone primero el email y, en lugar de Google, un aviso para abrir la página en el navegador o copiar el enlace.
- **Cuánto cuesta reservar hoy** (contado en el código de `ece4ef34`; turno de hoy, sin seña, celular de 390 px): un jugador nuevo con Google pasa por 6 pantallas y hace 5 toques; con email, 7 pantallas, 6 toques y 3 campos; uno que vuelve con la sesión abierta, 3 pantallas y 2 toques. Si vuelve sin sesión, el código lo trata como nuevo. De 70 textos de error y de estado, 40 no dicen qué pasó o qué hacer.
- **Entrar.** Sin contraseña: Google o un enlace por mail. Nadie pide teléfono ni completar el perfil para reservar. La primera vez, el jugador declara que es mayor de 18 y acepta los términos (ADR-012).
- **Formatos.** Cada cancha tiene su formato, de Fútbol 4 a Fútbol 11 (`FORMAT_OPTIONS` en `src/components/public/courtFacets.ts`), y un complejo puede mezclarlos.
- **Precios.** Cada complejo decide si el jugador ve sus precios (`settings.hide_public_prices`; por defecto se ven). El Vagón pidió ocultarlos (#416). Ocultos, el jugador no ve montos en el portal, en los mails ni en las APIs públicas, salvo su propia plata (la devolución de una seña y el export de sus datos). Si el complejo cobra seña, MercadoPago muestra el monto en su propia página.
- **El demo del 2026-10-14**, en producción y con el dueño de El Vagón: fallaron el login con Google y cancelar una reserva. Los dos están arreglados (#418 y #419) y anotados en `docs/gtm/ejecucion/10-aprendizajes.md`.

### Panel

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

### Para todo el producto

- Montos en centavos de ARS. Horas en UTC en la base, que se muestran en hora argentina. Día operativo: el turno de las 23 y los de la madrugada pertenecen al día en que arrancó la jornada.
- Ley 25.326: nunca texto libre sobre personas. Las etiquetas son un enum cerrado de 5.
- Vetos de producto que están en `CLAUDE.md`: sin billetera, sin saldo a favor de abonados, el no-show no es deuda, sin recordatorio de 24 h (salvo "El Día del Partido" de RIVAL, opt-in, decisión del 2026-10-29), el jugador no tiene Realtime y no hay AFIP. Falta Uno vuelve como RIVAL v1, diseñado de cero (`docs/decisions/2026-10-14-foco-jugador-rival.md`).
- Sin feature freeze desde el 2026-10-22 (`docs/decisions/2026-10-22-se-levanta-el-freeze.md`, supera D4 y F2): las features nuevas se proponen y se diseñan, y el panel vuelve a recibir mejoras. Cambiar precio, seña por defecto o lifecycle sigue necesitando decisión escrita del dueño.

### Portal: lo que existe

- home y `/explorar`, para buscar complejos;
- página del complejo: datos, fotos, servicios, reseñas y disponibilidad por día y por cancha;
- reserva de turnos de 60 minutos, con seña por MercadoPago si el complejo la pide (`requires_deposit`, 30% por defecto) o con pago en el complejo, hasta 6 días antes por defecto (`booking_advance_days`);
- pantallas de reserva confirmada, pago pendiente y error;
- Mis reservas: ver y cancelar hasta que el turno termina. Las horas de la política del complejo (12 por defecto) solo deciden si se devuelve una seña pagada, y la devolución la hace el complejo: TurnoGol no reembolsa por API;
- perfil, cuenta (`/configuracion`) y eliminar la cuenta;
- favoritos y compartir.

### RIVAL v1: construido y prendido el 2026-10-29

> La visión completa de RIVAL (clubes, categorías del jugador, tablas, la figura, el relato y los complejos) está en `docs/rival/README.md`, habilitada por `docs/decisions/2026-10-29-rival-cultura-de-turnogol.md`. Lo de abajo es lo que v1 tiene hoy.

Spec: `docs/superpowers/specs/2026-10-22-rival-v1-design.md`. Decisiones: F4 y `docs/decisions/2026-10-22-rival-v1.md`. Lo esencial:

- **El partido del grupo:** el organizador arma el partido en un complejo de TurnoGol y pasa el link al grupo de WhatsApp. Cada uno toca "Voy", con cuenta de jugador, y todos ven cuántos faltan. Hay cupo duro y un banco con promoción automática; "Me bajo" no tiene penalidad.
- **El tablón:** el mismo partido, publicado como "Faltan N", "Se busca arquero" o "Busca rival". El organizador acepta a cada uno, y el aceptado ve el WhatsApp del organizador (`wa.me`). Sin chat propio.
- **Sin dependencia de la reserva.** El partido lleva el sello "Reservada en TurnoGol" si el organizador tiene la reserva; si no, declara que tiene la cancha.
- **Perfil:** nombre corto, foto opcional, posición, zona de una lista cerrada y la carrera. Posición, zona y carrera las ve solo el organizador, dentro del partido. Nombre corto y foto los ve además quien tenga el link y sesión.
- **Niveles:** Tranqui · Parejo · Picante.
- **Bans:** frenan RIVAL el ban global y el manual del complejo. Los softbans automáticos no.
- **Moderación:** denuncias con motivos cerrados y ocultamiento automático con 3.
- **Alertas:** por mail, con opt-in por complejo.
- Va detrás del flag `rival`, que el dueño prendió el 2026-10-29. **Sin umbral de reversión:** la revisión a 30 días elige la próxima ola. Roadmap: `docs/planning/2026-10-rival-ideas.md` §5.

### Portal: restricciones

- Alcance del rediseño (F3): home, `/explorar`, página del complejo, reservar, reserva confirmada, pago pendiente y error, `/ingresar`, `/verify`, `/aceptar-terminos`, `/mis-reservas`, `/perfil` y `/configuracion`. No cambian el panel, el login y el alta del staff (`/login`, `/register`, recuperación de contraseña), `/para-complejos`, `/precios` ni la lógica de reserva, seña y MercadoPago.
- Todo funciona con los precios ocultos.
- Cuentas separadas (F5): una cuenta de complejo o de super admin no puede ser jugador con el mismo mail. El mensaje lo dice así y ofrece entrar con otra cuenta de Google o con el email.
- Sin puntajes ni reseñas entre personas y sin texto libre sobre personas (Ley 25.326). RIVAL v1 sale sin rankings y sin feed, por su spec; desde el 2026-10-29 las tablas de RIVAL se pueden diseñar con sus condiciones (decisión del 29/10), y un feed de publicaciones sigue vetado. Sin billetera ni pagos entre jugadores (veto de `CLAUDE.md`). Una app nativa entra solo con decisión escrita del dueño.
- El jugador no recibe push: existe solo para el dueño del complejo. RIVAL puede sumar push opt-in, con horario silencioso, en su ola (decisión del 2026-10-29).
- La reserva no lleva QR: no sirve para nada (el founder, 2026-10-15). Se sacó de la pantalla de reserva confirmada y del comprobante en #423.
- Vocabulario de pantalla hoy: Explorar, Reservas (Mis reservas), Cuenta, Ingresar, complejo, cancha, turno, reserva, seña, "Fútbol 5". RIVAL: "Voy", "Estoy adentro", "Faltan 3" / "Falta 1", "Se busca arquero", "Busca rival", "El banco", "Se juega", "Se cayó", "Donde me pongan".

### Portal: sin decidir

- Los textos legales de RIVAL: la spec trae borradores (§10) y el dueño los valida con asesoría antes de prender el flag.
- Si un complejo puede impedir que se cancele tarde: es una regla nueva y no es urgente.
- Si "Continuar con Google" anda desde los navegadores internos de Instagram y WhatsApp.

### Panel: lo que existe

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
- Vocabulario de pantalla: Hoy, Grilla, Agenda (la vista de turnos; la URL sigue siendo `/reservas`), Caja, Cantina, Cuentas, Jugadores, Turnos fijos, turno, evento, bloqueo, seña, fiado, cancha (F5/F7).

**Sin decidir:**

- Cierre de caja: el arqueo manual no lo usaba nadie y se eliminó. Desde el 2026-09-25 el cierre es automático: el resumen de arriba de Caja › Cuentas (cuánto entró, por dónde y de qué), sin contar billetes.
- Cuentas separadas para el encargado: por ahora no se empujan. Se diseña para la cuenta compartida.

## Brand Commitments

- El nombre es TurnoGol. El logo es el wordmark "TURNO" + "GOL" (verde, cursiva pesada) y el isotipo "TG", en `public/brand-assets/`. El refinamiento sobre el estilo actual del panel no toca el logo.
- El portal es La Previa: oscuro premium, con vidrio, resplandores esmeralda, fotos de fondo y titulares en Archivo negra itálica, hecho con terminación de primera y cero fricción, tipo ecommerce (el founder, 2026-10-20: "prefiero mil veces el diseño que tenía antes"; [`docs/decisions/2026-10-20-vuelve-la-previa.md`](docs/decisions/2026-10-20-vuelve-la-previa.md)). Reemplaza al compromiso del 2026-10-15 de un portal plano "estándar ATC" y sin mundo temático. **Excepción del 2026-10-21: la ficha del complejo (`/[slug]`) se queda en el estilo plano de "La Reserva"**; el resto del portal es La Previa. Es distinto del panel y conserva el nombre, el logo y el verde de marca. Claro y oscuro son de primera, con el tema del sistema por defecto (el ingreso y el modal de confirmar son siempre oscuros). La accesibilidad AA no se negocia: el look vuelve, el contraste y el foco visible se quedan. La autoridad visual es `DESIGN.md`.
- La página que abre el link del complejo es de TurnoGol: lleva su marca y su marco. A los complejos se les vende que tienen su propio link (`turnogol.app/<slug>`), así que, adentro de ese marco, la página es del complejo (el founder, 2026-10-15).
- La sección de comunidad del portal se llama RIVAL: "RIVAL powered by TurnoGol" (F4).
- La voz es español rioplatense, directo y sin tecnicismos: "tan simple que un niño lo entienda" (regla del dueño). El panel admin es "denso pero obvio"; el portal, "cero fricción, tipo ecommerce" (`CLAUDE.md`).
- TurnoGol habla como empresa, en primera del plural ("Escribinos", "Te ayudamos"), nunca en nombre de una persona (el founder, 2026-09-28).
- Se persuade con el encuadre, nunca con el número: sin cupos, contadores ni testimonios inventados (`docs/decisions/2026-09-26-referidos.md`, R6).
- El manual visual y el marketing brain de `public/brand-assets/` son marketing anterior. Hablan de multideporte y ponen la seña automática de titular, así que contradicen decisiones vigentes (solo fútbol, D2) y no son autoridad para el panel.

## Evidence on Hand

**Portal**

- `docs/decisions/2026-10-14-foco-jugador-rival.md`: el foco en el jugador, F1 a F5.
- `docs/planning/2026-10-14-portal-jugador-linea-base.md`: cuánto cuesta reservar hoy, contado en el código (pantallas, toques, campos, saltos y 70 textos de error y de estado). Es el "antes" del rediseño.
- `docs/planning/2026-10-rival-benchmark.md`: cómo completan un partido 12 plataformas (Falta Uno, Juol, Timpik, CanchaFija, ATC, Arqueros Ya y otras), con 23 fuentes leídas desde afuera.
- `docs/planning/2026-10-rival-ideas.md`: ideas de convocatoria, tablón y crecimiento de otras plataformas, y el roadmap de RIVAL por olas.
- `docs/gtm/ejecucion/10-aprendizajes.md`, 2026-10-14: lo que pidió el dueño de El Vagón (un perfil, "me falta 1", "busco rival" y "busco arquero"), el pedido de ocultar precios y los dos fallos del demo. Y 2026-10-16: las primeras 9 reservas online.
- Lo que no hay y no se inventa: volumen sostenido de reservas online, jugadores entrevistados, cuántos llegan por el link y cuántos por la búsqueda, desde qué navegador, y nadie usando RIVAL. Tampoco testimonios de jugadores, ni cupos, confirmados o publicaciones de ejemplo que pasen por reales.

**Panel**

- `docs/rediseno-panel/insumos.md`: 8 días de producción (conteos, solo lectura) y las respuestas del founder del 2026-09-23.
- `docs/gtm/ejecucion/10-aprendizajes.md`: roces observados, con fecha y tipo.
- Decisiones vigentes del mostrador: `docs/decisions/2026-09-14-alta-grilla-modal-unico-y-reservas-por-cancha.md`, `2026-09-15-cobro-por-equipo.md`, `2026-09-15-evento-repetible-edicion-y-cobro-parcial.md`, `2026-09-19-hoy-cobrar-y-vender.md` y `2026-09-25-hoy-cobrar-ahora.md`.
- Lo que no hay y no se inventa: testimonios, frases textuales del complejo, métricas de satisfacción, un segundo complejo en uso, y cuánto se mira la grilla.

## Product Principles

### Portal

1. **Reservar sin escribirle a nadie.** Cada duda que obliga a preguntarle al complejo devuelve la reserva al WhatsApp. Antes de confirmar se lee todo: cuándo, qué cancha, si hay seña y qué pasa si se cancela.
2. **El que llega por el link no conoce TurnoGol.** Viene a reservar en su complejo, desde el celular, y lo hace solo y rápido. Entrar con una cuenta es parte de reservar, no un trámite aparte.
3. **Volver cuesta menos que la primera vez.** El que ya reservó encuentra su complejo y su próximo turno sin buscarlos.
4. **Cada complejo manda en su página.** El formato de cada cancha, los precios a la vista u ocultos, la seña y la política de cancelación salen del complejo. Nada se diseña dando por hecho el fútbol 5, los 10 jugadores o los precios visibles.
5. **RIVAL junta gente de verdad.** Primero le sirve al grupo propio, aunque no haya nadie más en la zona; después, a desconocidos. Los cupos, los confirmados y las publicaciones son reales o no se muestran.

### Panel

1. **Lo de cada minuto le gana el lugar a lo de cada mes.** Vender, cobrar y ver si hay lugar van primero. Cerrar la caja, el stock, el equipo, las métricas y la configuración van donde no estorben.
2. **Se cobra sin irse de donde uno está.** Un cobro o una venta se registran sobre la pantalla actual, en el momento en que aparece la plata.
3. **Jugado y sin cobrar es urgente.** Se muestra en rojo: "No cobrado" en la Grilla, "Cobrar $X" en la cancha que lo tiene y "Turnos no cobrados" en Hoy y en Caja. Nunca como deuda: es plata que no entró, y hasta que se cobra no está en la caja ni en las métricas. Si nadie anota el cobro, a las 24 h de terminado se da por cobrado en efectivo (decisión del dueño, 2026-09-26). Un turno que se está jugando y todavía debe se cobra a tiempo y va sin color; uno pagado entero va en verde.
4. **El panel muestra el estado, no pide memoria.** Quién pagó y cuánto falta se lee sin abrir nada.
5. **Cuando la persona imaginada y el mostrador no coinciden, gana el mostrador.** Las decisiones se apoyan en lo medido en uso real, no en doc3.

## Accessibility & Inclusion

- WCAG 2.1 AA en tema claro y oscuro, en las dos superficies. Es la práctica actual: el a11y de Storybook corre en los dos temas.
- El estado nunca se comunica solo con color.
- Portal: el caso principal es el celular. Los objetivos táctiles miden 44 px o más y nada depende del hover. El jugador no es técnico: los textos usan sus palabras, sin jerga ni códigos, y cada error dice qué pasó y qué hacer.
- Panel: el caso principal es mouse en una PC. En el celular, los objetivos táctiles miden 44 px o más. Tiene que poder leerse bajo presión: montos, horas y estados se leen de un vistazo.
