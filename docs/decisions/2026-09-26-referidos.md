# Decisión: programa de referidos entre complejos, con sistema en código

**Fecha:** 2026-09-26 · **Decide:** Lazar (founder) · **Insumos:** [D8 del experimento de 30 días](2026-09-02-experimento-30-dias.md), [Billion Dollar Board](../gtm/board/2026-09-02-billion-dollar-board.md) §4.2, [H3](../gtm/ejecucion/07-tablero-hipotesis.md), medición del piloto en producción ([`10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md), 2026-09-17 a 2026-09-26).

**Supera a D8** de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md) ("1 referido pago → 1 mes bonificado, manual, no se construye"). **Acota D4**: el feature freeze sigue vigente para todo lo demás. Lo único que se libera es el programa de referidos: el link, la atribución en el alta, el premio y el panel. De la web comercial solo se suma la página `/r/<código>`; `/para-complejos` y `/precios` no cambian.

Se decide **a sabiendas** de dos cosas:
- H3 ("los dueños se refieren entre sí") todavía no tiene evidencia.
- El formato "código con meses bonificados" ya lo tiene CanchaFija (`10-aprendizajes.md`, 2026-09-01), o sea que cae en "copiado de un competidor sin evidencia".

El founder lo prioriza igual por urgencia comercial: octubre es un mes crítico para el proyecto.

Plan de ejecución y estado: [`docs/planning/2026-09-26-referidos-ledger.md`](../planning/2026-09-26-referidos-ledger.md).

---

## R1 — El premio: un mes por cada complejo que traés y paga

- **Decisión:** por cada complejo referido que **paga su primer mes**, el que lo trajo gana **1 mes bonificado** de su suscripción. El tope es **6 meses** por complejo (el dueño lo bajó de 12 a 6 el 2026-09-28). A partir del séptimo referido, el que llega arranca igual con sus 30 días de siempre, pero el referidor ya no suma meses (`referral_reward_status = over_cap`).
- **Cómo se anuncia (2026-09-28):** "Obtené hasta 6 meses gratis de TurnoGol". Las condiciones (que el mes se acredita cuando el referido paga su primera mensualidad, el tope y la fecha) van detrás de "Ver condiciones", que lleva a `/terminos#referidos` (punto 7 de los Términos y Condiciones, donde está el reglamento completo), no en el texto principal.
- **El referido** arranca con los 30 días de prueba de siempre, más la configuración hecha por el founder. **No recibe nada extra**, y los 30 días **no se anuncian como regalo por venir referido**: los tiene cualquiera que se registra.
- **Por qué el premio va atado al pago y no al alta:**
  - El mes se regala recién después de cobrar al menos un mes del referido, así que el programa siempre deja plata.
  - Pagar es activación real; un alta no lo es.
- **Confianza:** baja (0 clientes pagos, H3 sin evidencia).

- **Reglamento público (2026-09-28):** el punto 7 de `/terminos` (`#referidos`) tiene el reglamento completo. El dueño confirmó tres cláusulas: (1) los meses bonificados no tienen valor en dinero, no se transfieren y solo se aplican mientras la cuenta del referidor esté vigente; (2) TurnoGol puede modificar o terminar el programa, respetando los meses ya ganados; (3) un segundo complejo del mismo titular **sí** cuenta como referido si paga su propia suscripción; lo único que no vale es referirse a sí mismo.

## R2 — La promo tiene fecha real: altas hasta el 31/10

- **Decisión:** cuenta como referido el complejo que **se registra hasta el 2026-10-31 a las 23:59 (hora argentina)**. El premio se gana cuando pague, aunque sea en noviembre o después.
- **Después del 31/10** no se estira en silencio: se decide con datos si sigue, y eso queda en un decision doc nuevo. Una fecha que se corre quema la credibilidad en el grupo de dueños.
- **Sin cupos:** no hay un límite real de cuántos complejos se pueden configurar por semana, así que no se usa escasez por cupos.

## R3 — Qué es "pagó su primer mes"

- **Decisión:** es el primer cobro **real** aprobado de la suscripción del referido: llega por el webhook de MercadoPago o por el reconcile, que lo rescata si el aviso se perdió.
- **No cuenta:**
  - Una activación forzada por soporte (`forceTenantStatus`, `reactivateTenant`).
  - Una prueba extendida.
  - Un piloto que no pagó.

## R4 — Cada premio lo aprueba el founder

- **Decisión:** el sistema detecta el premio ganado y el founder lo aprueba con un click en el super-admin antes de aplicarlo.
- **Por qué:** un complejo trucho de 1 cancha paga $47.000 y genera un mes que puede valer $167.000 o más. A esta escala, mirar cada premio cierra ese agujero sin inventar reglas antifraude.

## R5 — Cómo se aplica el mes

- **Automático, solo en un caso:** el que trae está en prueba y **todavía no tiene suscripción creada en MercadoPago**. Ahí la prueba se extiende 30 días.
- **En cualquier otro caso, manual.** Esto incluye tener un preapproval creado aunque siga en prueba, estar activo o estar en mora. El código no puede saltear un cobro de una suscripción de MP: no hay pausa ni cambio de fecha, y cancelar es terminal. Además, extender la prueba en la base no mueve la fecha que MP ya tiene agendada.
- **El método manual** se define antes del primer premio aprobado, con una prueba en el sandbox de MP. Hay tres opciones:
  - mover la fecha del próximo cobro;
  - bajar el monto por un ciclo y restituirlo;
  - devolver ese cobro a mano desde el panel de MP de la cuenta master.
- **Nunca cancelar la suscripción para regalar un mes:** MP le manda al cliente un mail de cancelación.
- **Caso concreto:** El Vagón tiene un preapproval creado con primer cobro el 2026-12-06 ([`2026-09-17-precio-por-cancha.md`](2026-09-17-precio-por-cancha.md) P5), así que su premio va por el camino manual.

## R6 — Honestidad del mensaje: se potencia el encuadre, nunca el número

- **Decisión:** en mensajes, demos y en la página `/r/<código>` solo se dice lo que se puede mostrar en pantalla.
- **Se puede usar:**
  - Los números de un cliente, **con su permiso** y en sus palabras. Esos números nunca van a git (`docs/gtm/data/`, fuera de git).
  - Anclas que salen de cuentas reales: precio por cancha por día, turnos al mes, horas de un encargado.
  - Una fecha límite real.
- **No se usa:**
  - "Perdías un millón": no sabemos si la plata marcada sin cobrar se perdió.
  - Nada que insinúe que un encargado se queda con plata.
  - Cantidad de clientes, testimonios inventados, cupos falsos o comparaciones con ATC. Con 4-6 canchas TurnoGol es más caro.
  - Funciones que no existen: exportar los datos del complejo, cobro automático, WhatsApp automático.
- **El nombre del que recomienda** aparece en `/r/<código>` solo porque el código es opaco y lo emite él (desde su panel) o el super-admin con su OK. El slug público no sirve de código, porque cualquiera podría armar el link y hacer parecer que un complejo recomienda algo que no recomendó.
- **Por qué:** en un grupo donde todos los dueños se conocen, una exageración descubierta corre tan rápido como un referido y mata el único canal. Además, es publicidad engañosa.

## R7 — Qué se mide y cuándo se revisa

- **Se mide:**
  - si el primer referidor reenvió el mensaje;
  - los contactos que llegan "de parte de";
  - demos, altas y primeros pagos de referidos.

  Se registra en el CRM (`grupo_wa`, `reenvio`, `referido_por`) y en `10-aprendizajes.md`.
- **Revisiones:**
  - **2026-10-02:** H3, con el umbral ya escrito.
  - **2026-11-01:** si la promo sigue, se estira o termina, y si el sistema recibe más inversión.
- **Trigger de reversión:** si al 2026-10-31 no llegó **ningún** contacto "de parte de", la promo no se renueva y el sistema queda como está, sin más trabajo encima.
