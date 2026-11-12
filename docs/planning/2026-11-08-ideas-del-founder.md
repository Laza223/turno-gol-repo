# Ideas del founder: juicio, crítica y plan de acción

**Fecha:** 2026-11-08. Lazar escribió una lista de 10 ideas antes de usar Claude. Acá cada una quedó cruzada con lo decidido en el repo y con el código real. Las respuestas a los selects son del founder. Las decisiones que salieron de acá están en [`docs/decisions/2026-11-08-entrada-por-audiencia-y-volante.md`](../decisions/2026-11-08-entrada-por-audiencia-y-volante.md).

## Datos medidos que condicionan todo (2026-11-08)

- **Pagan 0 complejos.** El piloto está en prueba hasta el 6/12. El único dato de uso real es del día que publicó su link: entraron 10 jugadores y hubo 9 reservas online (`docs/gtm/ejecucion/10-aprendizajes.md`).
- **La web no tiene analítica.** No hay `@vercel/analytics` ni ninguna otra en `package.json`.
- **El alta propia** pide 13 campos obligatorios en 6 pantallas:
  - registro, con 6 campos (`src/app/(auth)/register/RegisterCard.tsx:134-186`);
  - confirmar el mail;
  - complejo, con 4 campos;
  - horarios, con valores por defecto;
  - canchas, con 2 campos por cancha;
  - primera reserva, con 1 campo (`src/modules/onboarding/onboarding.steps.ts:15-24`).

  No se puede saltear nada, y cierra en `/onboarding/listo`.
- **La app instalada** abre siempre en la home del jugador. Hay un solo manifest, `src/app/manifest.ts`, con `start_url: '/'`.
- **El motivo de cancelación es texto libre.** Para el jugador es opcional (`CancelBookingButton.tsx:158-161`). Para el encargado es obligatorio, con mínimo 3 letras (`reservas/actions.ts:510`). Se guarda como `"<etiqueta>: <motivo>"` en `bookings.canceled_reason` (`booking.cancellation.ts:637-641`).

## Criterio de orden (founder, 2026-11-08)

**Mitad y mitad:** la mitad del tiempo va a vender ya, según el plan de noviembre (10 altas usando al 30/11). La otra mitad va a construir distribución.

## Veredicto de la estrategia

**La tesis "competir por distribución, no solo por producto" está bien y tiene precedente.** Playtomic ganó el pádel siendo la app del jugador. En gestión, las funciones se copian; tener a los jugadores, no.

Con la IA, el código y el contenido ya no son el cuello de botella. Los que quedan son tres:
- la densidad de jugadores en una zona;
- la atención del founder, que es uno;
- lo físico: cámaras e instalación.

### Las 4 correcciones

1. **La pantalla "Soy complejo / Soy jugador" en `/` rompe el SEO que se busca.**
   - Google indexa la versión mobile y entra sin cookies, así que vería siempre la elección.
   - Lo que está solo en la versión desktop no cuenta para el índice.
   - Una pantalla completa al llegar desde el buscador es un intersticial intrusivo.
   - Los bots de las IAs tampoco guardan cookies.

   La salida es que la elección viva en una URL `noindex`, la de la bio y los anuncios, con memoria por cookie. El SEO para dueños se juega en `/para-complejos`, `/precios`, `/funciones/*` y las comparativas, no en la home.
2. **El volante arranca en una zona.** "La app de moda" se es en un lugar o no se es en ninguno.
   - La plata (el SaaS) se vende en cualquier lado.
   - La distribución (jugadores, RIVAL) se concentra en Luján hasta pasar la puerta de densidad de RIVAL.
3. **El contenido masivo va para los jugadores, no para los dueños.**
   - Dueños hay unos miles y jugadores, millones.
   - El contenido generado en volumen a partir de partidos reales de RIVAL es masivo y signature a la vez. Junta la idea de volumen de Hormozi con la de perspectiva propia de Cubría.
   - Masivo con IA pero sin dato propio es commodity.
4. **Torneos y cámaras se ordenan por dependencia, no por costo.** Las dos cosas se les venden a complejos que ya están adentro. Las cámaras son el mejor motor de contenido de la visión, pero son instalación física.

**Matiz:** la distribución consigue al complejo y el producto lo retiene. El complejo piloto dijo las dos cosas: que con el panel gestionan todo, y que RIVAL le trae turnos. El onboarding es parte de la distribución, porque es donde hoy se cae el que llega.

### El board (`billion-dollar-board`)

- **Hormozi, los cuatro canales:**
  - contenido para jugadores y salida en frío para dueños es el reparto correcto;
  - el contenido es el canal que más se acumula y el más lento en devolver, y el 1 a 1 es el más rápido;
  - el 1 a 1 trae la plata de diciembre y el contenido trae la distribución.
- **Hormozi, ecuación de valor:**
  - "La app de moda que te llena el complejo" baja la probabilidad percibida si el dueño ve que no se le llenó.
  - Un encuadre verificable: "tus jugadores juegan por la tabla de RIVAL, y solo cuenta el partido jugado en un complejo TurnoGol". Se usa cuando la tabla exista.
- **Dunford:** la alternativa real del dueño es el cuaderno con WhatsApp, o ATC y Vibe "gratis". Contra lo gratis gana la distribución propia, no una lista de funciones.
- **Cialdini:** la objeción que mata la venta es "¿quién más lo usa?". D15 levantada en redes, con permiso, la destraba.
- **Métricas de embudo (AARRR):** sin analítica no se sabe dónde se cae nadie. El único escalón con rotura medida es la activación (13 campos).
- **Para qué contrata el dueño (JTBD):** "que la noche ande sin cuaderno" es lo que lo retiene, y "que me entren turnos" es lo que lo hace entrar.

## Las 10 ideas

| # | Idea (texto del founder, resumido) | Veredicto | Qué se hace |
|---|---|---|---|
| 1 | Landing mobile con "Soy complejo / Soy jugador", recordada por dispositivo | **Se reformula** | Sí a la memoria por dispositivo, pero la elección va en una URL `noindex`, no en `/` (B3). |
| 2 | TurnoGol lo más mobile y "más app" (inspiración: chat de Gemini y Playtomic) | **Sí, en dos partes** | Panel: barra inferior y densidad ya hechas en `feat/panel-mobile-denso`, falta su PWA propia (B3). Portal del jugador: referencia Playtomic (C3). |
| 3 | Calendario de contenido automatizado y masivo, un funnel ideal para complejos | **Sí, con otro destino** | Masivo, para jugadores, con datos reales (C1). El banco de 37 piezas para dueños (`docs/gtm/data/captacion/01-contenido.md`) queda de vidriera. |
| 4 | "La calculadora de precios es lo que más convierte" | **Hipótesis sin dato** | Según el founder viene de la competencia, y ni CanchaFija la mide (`docs/gtm/research/2026-09-01-competidores-v2.md:342`). La nuestra (`src/app/(business)/precios/CalculadoraClavo.tsx`) tiene dos problemas: subestima la pérdida (presets de $20-40 mil contra $60-84 mil reales) y su argumento es la seña, que choca con D9. Se corrige y se mide (D2). |
| 5 | Obligar a elegir un motivo al cancelar | **Sí** | Lista cerrada, un toque, Métricas del dueño (D1). |
| 6 | Recordatorios por WhatsApp 1 h antes | **Backlog** | El founder lo anotó como feature futura. Ver el backlog en la decisión. |
| 7 | "Tu SaaS es tu mejor marketing" | **Sí, la más barata y alineada** | Pie en la página del complejo (B4, hecho en #579; la imagen de horarios ya tenía marca) y "Pedí tu cancha" (C2). Ya existen los referidos y "RIVAL powered by TurnoGol". |
| 8 | Funnel TOFU/MOFU/BOFU con contenido signature (Cubría: la perspectiva no se roba) | **Sí, como volante de dos audiencias** | Tabla abajo. |
| 9 | Investigar a Hormozi sobre contenido masivo | **Investigado, no es tarea** | No dice que el contenido gane a todo: gana el volumen en los cuatro canales. Ver corrección 3 y el board. |
| 10 | Re-pensar el onboarding (inspiración: el de Canchería en mobile) | **Sí, lo primero en producto** | B2, que espera el video. |

### El volante

| | Jugadores | Dueños |
|---|---|---|
| **TOFU** | Contenido masivo de partidos reales de RIVAL (tapa, figura, rivalidades, goles), Luján primero. | Jugadores que lo nombran ("Pedí tu cancha"), SEO e IAs, escenas de "la noche del complejo". |
| **MOFU** | `/rival` y el buscador de canchas. | `/para-complejos`, comparativas, calculadora corregida, complejos con permiso en redes. |
| **BOFU** | Reservar o publicar un partido. | Bio o anuncio → elección → landing → onboarding sin formularios → WhatsApp o demo → charla del día 21. |
| **La vuelta** | El partido oficial cuenta solo en complejos TurnoGol. | Imagen de horarios con marca, pie en su página, referidos. |

## Plan de acción

### A0 · Cerrar `feat/panel-mobile-denso`
Al 2026-11-08 tiene 99 archivos de push sin commitear y 1 commit sin pushear. Era el paso 1 del plan de noviembre. Nada nuevo arranca encima de esto.

### Carril B: vender ya (la entrada del dueño)

- **B1. Registrar las decisiones.** Hecho el 2026-11-08: esta nota y la decisión enlazada arriba.
- **B2. Onboarding nuevo** a partir del video de Canchería: análisis con la skill `watch`, después `entrega-feature` + `impeccable`, mobile primero.
  - **Dirección:** la landing es el paso 1 del alta y se pide solo lo necesario para que el dueño vea su grilla. El resto va a la checklist del panel.
  - **Ojo:** doc10 define el momento en que el dueño ve el valor (*Aha moment*) como la primera reserva online, y por eso el wizard tiene el paso "primera reserva". Recortarlo es redefinir eso: va como pregunta al founder.
  - Reusa `createTenantWithTrial` y `resolveWizardStep`.
- **B3. Entrada por audiencia:**
  - una URL de elección `noindex`, con cookie;
  - redirección en `middleware.ts` solo con cookie;
  - staff con sesión va al panel;
  - manifest propio del panel;
  - la banda D1 en la home.
- **B4. Que el producto haga marketing** (cambio chico). **Hecho:** el pie "Reservas con TurnoGol" en `/[slug]` (VIS-026) salió en el PR #579, ya mergeado. La imagen de horarios libres ya llevaba el logo y la URL de TurnoGol desde #446: el relevamiento inicial se equivocó en eso.

### Carril C: construir distribución (jugadores, Luján)

- **C1. Estrategia de contenido signature.** Es un doc en `docs/gtm/`: 2 o 3 formatos fijos alimentados por datos reales, producidos en volumen con IA y medidos.
- **C2. "Pedí tu cancha" + partido oficial** (RIVAL etapa 2). Es el motor de "todos los jugadores me nombran TurnoGol".
- **C3. Portal del jugador "más app".** Referencia Playtomic y el chat de Gemini del founder.

### Producto (retención)

- **D1. Motivo de cancelación.** Propuesta como sesión aparte.
  - **Lista propuesta para el jugador:** Llueve · No juntamos gente · El otro equipo no viene · Cambiamos de día u horario · Lesión o imprevisto · Otro motivo.
  - **Encargado:** conserva "quién cancela" y suma Cancha no disponible · Evento del complejo · Clima.
  - Lleva una migración nueva con un enum, sin tocar `canceled_reason`.
- **D2. Calculadora:** presets con precios reales y argumento de horarios vacíos en vez de la seña. Se mide si se aprueba la analítica.

## Pendiente del founder

1. El video del onboarding de Canchería.
2. El chat de Gemini con la inspiración mobile.
3. La analítica web, que figura como REQUIERE INPUT en la decisión.
4. Qué se hace con lo que está sin commitear en `feat/panel-mobile-denso`.

## Panel `billionaire-mindset` (2026-11-08)

La estrategia pasó por la skill que pidió el founder (`.claude/skills/billionaire-mindset`, instalada local, fuera de git). Tiene nueve marcos. Dos partes no pisan las reglas del repo:
- la escasez de Belfort: sigue "encuadre, nunca número";
- lo de impuestos e inversiones de Thompson: no se da como consejo.

**Diagnóstico.** La pregunta de fondo no es "¿landing de complejo o de jugador?". Es **quién es dueño del flujo de jugadores del fútbol amateur de una zona**. Todo lo demás es táctica.

**Thompson (el lente de siempre): rey o peón.**
- Un sistema de gestión que compite por funciones es trabajo de peón: hay diez iguales y cada función se copia.
- Ser dueño de la red de jugadores es la jugada de rey: las reservas pasan por TurnoGol, y el complejo quiere estar porque los jugadores están ahí.
- Pasa 5 de sus 6 filtros: es un activo, tiene apalancamiento de código y contenido, es dueño del flujo, es ofensiva y crece sola. El sexto, la estructura legal, no se evalúa acá. La tesis aprueba.
- **La alerta que suma:** si el contenido masivo vive en Instagram y TikTok, el flujo es de Meta. El activo es la cuenta del jugador en TurnoGol (su club, su tabla, su push), no los seguidores. **Toda pieza de contenido tiene que terminar en una cuenta TurnoGol.**

**Godin: la vaca púrpura y la audiencia mínima viable.**
- "Otro sistema de gestión" es una vaca marrón. La púrpura es RIVAL: la tabla, la figura y "solo cuenta si jugás en un complejo TurnoGol". La pregunta es qué hace que un jugador le diga a un amigo "tenés que ver esto". La respuesta es la tapa o la figurita de SU partido.
- La audiencia mínima no son los jugadores de Argentina: son **los equipos de turno fijo de los complejos de Luján**. Juegan todas las semanas, el mismo día y en la misma cancha, y ya están en la grilla.
- **Disiente con el contenido masivo:** lo que se comparte es lo que nombra a sus clubes, no lo genérico. Refuerza C1.

**Gary Vee: documentar, no crear.**
- El contenido de jugadores no se inventa: se documenta de partidos reales.
- La plataforma nativa del fútbol amateur argentino es **el grupo de WhatsApp del equipo**. La tarjeta que se manda a ese grupo vale más que un reel.
- Para los complejos, la imagen de horarios libres ya es un regalo de valor antes de pedir nada.

**Hormozi: ecuación de valor de la oferta a complejos.**
- "Te traemos jugadores" tiene un resultado soñado alto y una probabilidad percibida baja mientras no haya densidad. La probabilidad sube con prueba por zona. El tiempo y el esfuerzo bajan con un alta de 2 minutos (el estilo Canchería, ver [`2026-11-08-onboarding-referencia-cancheria.md`](2026-11-08-onboarding-referencia-cancheria.md)) y con "te lo dejo andando hoy".
- Sobre el precio, Hormozi coincide con D5: no se toca.

**Kennedy: mensaje, mercado y medio.**
- Son dos mercados con dos mensajes y dos medios que no se mezclan:
  - **dueños:** "la noche del complejo + los jugadores de tu zona juegan acá", por WhatsApp 1 a 1, Google, IAs y anuncios a `/para-complejos`;
  - **jugadores:** "tu partido cuenta", por Reels, TikTok y grupos de WhatsApp.
- La pantalla "Soy complejo / Soy jugador" en `/` es el síntoma de una URL tratando de hablarles a dos mercados. Kennedy respalda la corrección 1.
- También pide una respuesta medible, y eso es la analítica, que ya se está instalando.

**Brunson: escalera de valor para complejos.**
- Carnada → SaaS ($30.000 por cancha) → Plus (bot, $15.000 por cancha) → arriba, torneos y cámaras.
- La visión del ecosistema queda como **la parte alta de la escalera**, que se vende solo a los que ya subieron. Coincide con la corrección 4.
- **Con Thompson empujan una carnada que hoy no existe: aparecer en TurnoGol gratis** (página del complejo y turnos visibles para los jugadores) y cobrar la gestión. Es el movimiento clásico de mercado de dos lados para llenar el mapa de oferta.
- **Godin y Hormozi disienten:** lo gratis atrae al que no paga y diluye.
- Va como REQUIERE INPUT porque toca precio y lifecycle.

**Belfort: las tres certezas al cerrar.**
- Producto: el demo y el alta. Vos: la voz de empresa. Empresa: ¿es real?
- La que hoy falta es la tercera ("¿quién más lo usa?"). Se cubre con complejos con permiso en redes (D15) y `/nosotros`.

**Cardone: 10X.**
- El objetivo (todo el fútbol en un lugar) ya está en escala 10X.
- Donde aplica 10X es la acción: 15 mensajes por día es el techo de un número de WhatsApp, no el de Lazar. Visitas, llamadas y el link del complejo piloto suman volumen sin quemar el número.
- **Disiente con Godin:** Cardone diría volumen ya; Godin, primero algo para comentar. Las dos cosas se cumplen si el volumen es de RIVAL en Luján.

**Robbins: un plan RPM para no dispersarse.**
- Un solo resultado por trimestre, medible. Propuesta: "ser la app de fútbol de Luján" = N clubes RIVAL activos + M complejos al 2027-02-01 (los números los pone el founder).
- El propósito: la distribución como foso.
- El plan de acción: los dos carriles.

### Síntesis del panel, por impacto
1. **Thompson y Godin:** el activo es la cuenta del jugador en TurnoGol, no los seguidores. Todo contenido termina en un club o perfil TurnoGol.
2. **Godin:** la audiencia mínima son los equipos de turno fijo de Luján, y RIVAL arranca por los que ya están en la grilla.
3. **Kennedy:** un mensaje por mercado; la elección vive solo en la bio. Ya está decidido.
4. **Brunson y Thompson:** una carnada gratis para complejos (aparecer en TurnoGol sin pagar) llenaría el mapa. **REQUIERE INPUT:** es precio y lifecycle.
5. **Hormozi y Belfort:** la certeza que falta es la de empresa. Casos con permiso en redes y el alta de 2 minutos.
