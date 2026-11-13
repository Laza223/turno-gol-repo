# DeporTurnos: qué hacen, qué nos llevamos y qué no

**Fecha:** 2026-11-08. **Insumo:** recorrido de deporturnos.com en mobile (375 px) y desktop: home, `/buscar`, la ficha de un complejo de fútbol, la pantalla de confirmar reserva (sin reservar) y `/complejos` con precios y preguntas frecuentes. **No se vio:** su alta ni su panel, porque piden cuenta. El founder hizo el alta mobile por su lado.

## Quiénes son

- SaaS argentino multideporte: pádel, tenis y fútbol 5, 6, 7, 8 y 11. Web y app en iOS y Android.
- Dicen tener 11 complejos, más de 25 canchas y 6.567 jugadores registrados. **Todos sus complejos están en Tandil**, y en el buscador todos aparecen a 1 km.
- Next.js. Tipografía Poppins y violeta (`#B725E8`) con botones píldora. Tema claro, plano y con mucho aire.

**Lo que confirma de nuestra tesis:** concentraron todo en una ciudad, y con eso llegaron a miles de jugadores. Es exactamente la decisión de arrancar la distribución en Luján ([`2026-11-08-entrada-por-audiencia-y-volante.md`](../decisions/2026-11-08-entrada-por-audiencia-y-volante.md), punto 2). Además le venden al dueño "el contenido de tus redes lo armamos nosotros", que es la parte de RIVAL que ya está diseñada (la tapa y los resultados).

## Precio (público, 2026-11-08)

Un abono por tramo de canchas, con todo incluido y sin comisión por turno. Primer mes gratis y sin tarjeta. Anual con 25% off.

| Canchas | DeporTurnos mensual | TurnoGol mensual ($30.000 por cancha) |
|---|---|---|
| 1 | $29.999 | $30.000 |
| 2 | $29.999 | $60.000 |
| 3 | $29.999 | $90.000 |
| 4 | $59.999 | $120.000 |
| 6 | $59.999 | $180.000 |
| 8 | $89.999 | $240.000 |

Anual: $22.499, $44.999 y $67.499 por mes. TurnoGol da 10% off.

**Lectura:** desde la segunda cancha, TurnoGol cuesta entre 2 y 3 veces más. El precio lineal por cancha y sin techo castiga justo al complejo de varias canchas, que es el que más compara. El freemium decidido hoy ([`2026-11-08-freemium.md`](../decisions/2026-11-08-freemium.md)) gana la entrada ("gratis" contra "$29.999"). Pero el paso de gratis a pago se va a comparar con esta tabla. Cambiar el precio necesita una decisión escrita (REQUIERE INPUT 1).

## Lo que nos llevamos: patrones, no textos ni marca

Copiar sus frases o su look tal cual tiene tres problemas:
- es trabajo de ellos;
- el dueño que vea los dos sitios va a pensar que el copiado es TurnoGol;
- Google y las IAs ven contenido duplicado.

Nos llevamos el **patrón**, con voz y marca propias.

1. **El mensaje de los dos lados.** Su idea: el jugador se autogestiona y el club también. Es el insight correcto, porque nombra lo que de verdad pasa. Versión propia, para trabajar con `turnogol-copy` (modo landing): "Tus jugadores reservan solos. Tu noche se ordena sola."
2. **"Las redes del complejo vienen incluidas".** Se puede decir con verdad con lo que ya existe:
   - la imagen de horarios libres con la marca del complejo y de TurnoGol (#446, #579);
   - los resultados de los partidos oficiales de RIVAL, club contra club. Respeta las condiciones de RIVAL: sin nombres de personas y nada negativo público ([`2026-10-29-rival-cultura-de-turnogol.md`](../decisions/2026-10-29-rival-cultura-de-turnogol.md)). Los turnos sin RIVAL no tienen resultado y no hace falta inventarlo.
3. **La grilla.** Venden cuatro cosas: vista por día, semana o cancha; mover un turno arrastrándolo; turnos fijos; y canchas divisibles (una grande se reserva entera o partida).
   - **Arrastrar para mover lo pidió El Vagón.** Hoy la grilla no tiene arrastre (no hay `draggable` ni librería de drag en `src/app/(admin)/grilla`).
   - Turnos fijos ya existen.
   - Semana, cancha y divisibles: REQUIERE INPUT 4.
4. **El buscador: localidad y formato.** Es lo que pidió el founder: la fecha y la hora se ven en la tarjeta de cada complejo, y el filtro que sirve es dónde y qué cancha.
   - El back ya filtra por `city` y por `formats` (`src/modules/tenants/search.service.ts:64-69`, `:155`, `:174`).
   - La tarjeta ya muestra los horarios libres (`src/app/(public)/explorar/components/TenantCard.tsx`, `slotPills`).
   - Lo que cambia es la barra (`SearchBar.tsx` hoy pide nombre, ciudad, fecha y hora) y la localidad por defecto. **Recomendación:** sacar la localidad de la IP con los headers de Vercel, sin pedirle permiso de ubicación al jugador, y que pueda cambiarla.
5. **La ficha y la reserva.** Su flujo:
   1. formato (Fútbol 7 / Fútbol 11);
   2. día en chips;
   3. hora en chips;
   4. tarjetas de cancha con "costo final" y "seña";
   5. confirmar, con el ingreso recién al final.

   Las reglas de reembolso se muestran antes de pagar. **La nuestra ya tiene la misma estructura:** `ChipGroups`, `DayList`, `HourGrid`, `CourtCard`, `StepBar` y `LoginGate` en `src/app/(public)/[slug]/`. El cambio es visual y de orden, no de lógica.
6. **La landing.** Se toma la estructura:
   - foto de fondo con el buscador en una tarjeta que se monta sobre el corte;
   - tira de logos de clubes;
   - videos cortos de dueños;
   - banda final para complejos;
   - barra inferior en mobile (Reservar · Actividad · Más).

   **Choca con una decisión vigente:** el portal es La Previa, oscuro y premium. El 20/10 el founder rechazó un portal plano ("prefiero mil veces el diseño que tenía antes", [`2026-10-20-vuelve-la-previa.md`](../decisions/2026-10-20-vuelve-la-previa.md)). DeporTurnos es justamente claro y plano (REQUIERE INPUT 2).
7. **Las preguntas frecuentes de `/complejos`.** Son buenas porque contestan miedos, no funciones: "¿lo puede usar el del mostrador?", "¿se quedan con parte de mis reservas?", "si me atraso con el pago, ¿pierdo los turnos?". Con el freemium, la última tiene una respuesta mejor que la de ellos: el que no paga baja a gratis y sigue en el mapa.

## Lo que no

- **Torneos:** es más de pádel; el founder lo descarta.
- **Multideporte:** TurnoGol es solo fútbol, y eso le permite hablar el idioma del dueño de fútbol: turnos fijos, cobro por equipo y RIVAL.
- **Su violeta, su Poppins y sus textos:** el look se toma como nivel de prolijidad, no como identidad.

## Onboarding

El founder hizo su alta mobile y le pareció mejor que la de Canchería. Para tomarla como referencia hace falta la grabación, como con Canchería: no se puede crear una cuenta desde acá. Las cuatro decisiones del alta del 2026-11-08 no dependen de la referencia ([`2026-11-08-onboarding-referencia-cancheria.md`](2026-11-08-onboarding-referencia-cancheria.md), "Decisiones del founder"):
- el mail no bloquea;
- el alta termina en compartir el link;
- se oculta lo que el complejo no usa;
- la prueba cuenta desde el alta.

Lo que cambia son las pantallas (REQUIERE INPUT 3).

## Decisiones del founder (2026-11-08, por select)

1. **Precio: tres planes, el del medio sigue a $30.000 por cancha.** Se aplica la escalera bueno / mejor / premium (efecto ancla):
   - **Gratis:** el plan "bueno", al que le falta lo importante (la noche). Es el del freemium.
   - **Completo:** el que se vende. Sigue a $30.000 por cancha, sin techo.
   - **Completo + WhatsApp:** el ancla. Suma el Asistente de WhatsApp (hoy Plus, $15.000 por cancha).

   Los nombres van por lo que hace cada plan, no "Básico, Pro, Ultra". Se descartaron bajar el precio por cancha con techo (era la recomendación) y los tramos. **Riesgo asumido:** el complejo de 4 o más canchas que compare con DeporTurnos ve el doble o el triple. Registrado en [`2026-11-08-freemium.md`](../decisions/2026-11-08-freemium.md), "Ampliado el mismo día".
2. **Portal: los dos temas, planos y limpios.**
   - Cada jugador ve el tema de su celular.
   - Los dos van planos, al nivel de prolijidad de DeporTurnos y con el verde de TurnoGol.
   - Salen el vidrio, los resplandores y el texto en degradé de La Previa.
   - El oscuro se queda porque es la esencia de la marca: el fútbol 5 se juega de noche.
   - **Primero un mockup** de la home y el buscador, y el founder decide mirándolo.
   - Si lo aprueba, se reescribe DESIGN.md y se supera [`2026-10-20-vuelve-la-previa.md`](../decisions/2026-10-20-vuelve-la-previa.md) con una decisión escrita.
3. **Buscador: localidad y formato.** Fecha y hora salen de la barra porque ya están en la tarjeta. La localidad viene por defecto según dónde está el jugador y se puede cambiar.
4. **Onboarding:** la sesión sigue con la lógica y frena las pantallas hasta que llegue la grabación del alta de DeporTurnos.
5. **Grilla:** entran mover arrastrando (pedido de El Vagón), la vista por semana y por cancha, y las canchas divisibles. Las divisibles tocan el modelo de canchas y de choques de reservas, así que van por `decision-arquitectura`.
