# Decisión: foco en el jugador — portal con mundo visual nuevo y RIVAL v1

**Fecha:** 2026-10-14 · **Decide:** Lazar (founder) · **Insumos:** charla con el dueño del piloto (El Vagón) del 2026-10-14; demo en vivo del mismo día en producción ([`10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md), 2026-10-14); [`posible_nuevas_features_turnogol_fable_5.md`](../planning/posible_nuevas_features_turnogol_fable_5.md) l.298 (por qué se eliminó Falta Uno) y §5c (C1, el grupo del organizador).

**Acota D4** de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md): el feature freeze sigue vigente para todo lo demás. Se liberan dos cosas: el rediseño del portal público y del jugador con un mundo visual nuevo (F3) y RIVAL v1 (F4). **Supera** el veto "Partidos abiertos (Falta Uno): fuera de scope v1" de `CLAUDE.md` y `PRODUCT.md`, y saca de la kill list de D4 y del congelamiento de [`09-gates.md`](../gtm/ejecucion/09-gates.md) solo lo que estas dos cosas usan: Falta Uno, un perfil mínimo del jugador y los cambios a la home y a `/explorar` que pida el rediseño.

Se decide **a sabiendas** de tres cosas:
- Salta un gate. D5 ordena Operations → Distribution → Identity con evidencia, y Distribution no se cumple: hay un complejo y en él no hubo reservas online.
- Falta Uno se eliminó en junio (migración 028) por el arranque en frío —sin jugadores en la zona, la sección se ve vacía— y porque el fútbol 5 se juega con el grupo de amigos, no con desconocidos intercambiables. Por eso RIVAL v1 arranca por el partido del grupo, que sirve aunque no haya nadie más, y cada publicación se comparte por WhatsApp.
- La evidencia es el pedido explícito de un solo cliente. Es una señal, no una validación.

El founder lo prioriza igual por dos razones: es lo que el dueño del piloto dijo que más le serviría, y atraer jugadores es la tesis de distribución del producto (A3).

---

## F1 — Torneos para organizadores: postergado sin fecha

- **Decisión:** no se construye el sistema para organizadores de torneos. El módulo de torneos del complejo sigue detrás del flag `tournaments` (global en `false`) y no se borra nada.
- **Contexto:** el piloto cubrió los horarios de su torneo con lo que ya existe.

## F2 — Panel admin en mantenimiento

> **SUPERADA el 2026-10-22** por [`2026-10-22-se-levanta-el-freeze.md`](2026-10-22-se-levanta-el-freeze.md): el panel vuelve a recibir mejoras.

- **Decisión:** el panel deja de recibir refinamientos de diseño. Entran solo las excepciones de D4: bugs, seguridad, circuitos de plata y fricción observada en clientes reales. El refinamiento habilitado el 2026-09-23 se da por cerrado.
- **Evidencia:** el dueño del piloto dijo que con el panel pudieron gestionar todo el complejo sin problemas.

## F3 — Portal público y del jugador: rediseño con mundo visual nuevo

- **Alcance:** home, `/explorar`, página del complejo, flujo de reserva (reservar, éxito, pendiente, error), `/ingresar`, `/verify`, `/aceptar-terminos`, `/mis-reservas`, `/perfil` y `/configuracion`.
- **Método:** la skill impeccable de punta a punta: contexto, crítica de lo actual, forma del flujo, dirección visual **renderizada** que el dueño elige viéndola, construcción, revisión fresca y documentación en `DESIGN.md`.
- **Mundo:** reemplaza a "La Previa" del lado jugador. Se conservan el nombre, el logo y el verde de marca. Claro y oscuro siguen siendo de primera, con el tema del sistema por defecto.
- **No cambian:** el panel admin ("El Mostrador"), el login y el alta del staff (`/login`, `/register`, recuperación de contraseña), `/para-complejos`, `/precios` y el resto de la web para complejos, y la lógica de reserva, seña y MercadoPago.
- **Restricción:** todo tiene que funcionar con los precios ocultos (opción por complejo del 2026-10-14).
- **Criterio de éxito:** un jugador nuevo reserva en su complejo desde el link que le pasó el complejo con menos toques que hoy (medido antes y después), y cada error dice qué pasó y qué hacer.

## F4 — RIVAL v1 ("RIVAL powered by TurnoGol")

> **Enmendada el 2026-10-22** por [`2026-10-22-rival-v1.md`](2026-10-22-rival-v1.md): RIVAL no tiene umbral de reversión. La revisión a 30 días sirve para elegir la próxima ola, no para decidir si se corta. La spec está en [`docs/superpowers/specs/2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md).

- **Qué es:** la sección de comunidad del portal del jugador. Trae las dos cosas:
  - **El partido del grupo:** una convocatoria con link para el grupo de WhatsApp, donde cada uno confirma en un toque y el organizador ve "7/10 confirmados".
  - **El tablón:** "Me falta 1" (o los que falten), "Busco arquero" y "Busco rival".
- **Independiente de la reserva:** una publicación no depende de la reserva entre el jugador y el complejo. Cualquier jugador publica que le falta gente y le llegan los que están disponibles. Si el partido sale de una reserva hecha en TurnoGol, se marca con un sello. Por eso se diseña de cero: las tablas de partidos abiertos de junio (migración 018, borradas en la 028) colgaban de una reserva (`booking_id NOT NULL`) y no se resucitan.
- **Contacto:** por WhatsApp, recién cuando el organizador acepta al que se suma: un link `wa.me` que abre el jugador, no mensajes que mande TurnoGol (la WhatsApp Business API sigue en la kill list de D4). Sin chat propio en v1.
- **Perfil mínimo:** foto, posición, zona y la carrera que ya sale de las reservas jugadas. Sin puntajes entre personas, sin rankings y sin texto libre sobre otras personas (Ley 25.326). Sin precios (F3).
- **Lanzamiento:** detrás del flag `rival`, global en `false` hasta que el dueño lo prenda.
- **Antes de programar:** relevamiento de plataformas parecidas (`docs/planning/2026-10-rival-benchmark.md`) y spec con el dueño: campos de una publicación, moderación, alertas, qué se muestra del organizador y textos legales.
- **Confianza:** baja.
- **Revisión:** a los 30 días del lanzamiento, con publicaciones creadas, personas sumadas y partidos completados. El umbral de reversión se fija en la spec, antes de lanzar.

## F5 — Cuentas de complejo y de jugador: siguen separadas

- **Decisión:** una cuenta de complejo o de super admin no puede ser también jugador con el mismo mail. Reafirma lo decidido el 2026-08-19 (migración 078) y el 2026-10-13.
- **Lo que se arregla es cómo se dice:** el mensaje explica que esa cuenta de Google ya la usa un complejo y ofrece entrar con otra cuenta o con el email.
- **Dueños y encargados que juegan** usan otra cuenta. Si RIVAL necesitara que participen con la misma, se decide aparte, con revisión de seguridad.

## Lo que sigue congelado

> **Sin efecto desde el 2026-10-22** ([`2026-10-22-se-levanta-el-freeze.md`](2026-10-22-se-levanta-el-freeze.md)): esta lista ya no está congelada por el freeze, y cada punto entra con una decisión escrita del dueño. Siguen vigentes los vetos de producto de `CLAUDE.md` (entre ellos, sin billetera) y la regla de que un cambio de precio, seña o lifecycle necesita decisión escrita. RIVAL v1 sale sin rankings y sin feed por su propia spec.

Rankings · red social o feed · Cam · marketplace como promesa · app nativa · profesores · billetera o pagos entre jugadores · cualquier cambio de precio, seña o lifecycle sin decisión escrita.
