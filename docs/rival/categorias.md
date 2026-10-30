# Las categorías del jugador

**Estado:** visión, sin construir. Decidido por el founder el 2026-10-30 (punto 5 de [la decisión de RIVAL](../decisions/2026-10-29-rival-cultura-de-turnogol.md)). Contexto: [`README.md`](README.md), mundo YO. Clubes: [`clubes.md`](clubes.md). Catálogo: [`ideas.md`](ideas.md).

**Decidido por el founder:** la escala, el techo del arranque en Quinta, el "?" hasta 10 partidos oficiales, la visibilidad y el descenso blando. **Propuesta**, a ajustar al diseñar la ola: los 11 lugares de la Selección, los plazos y el resto de los números.

## En una pantalla

**"¿De qué categoría sos?"** es la pregunta que todo futbolero quiere contestar, y muchos creen que la respuesta es "de Primera". RIVAL la contesta con partidos.

| Categoría | |
|---|---|
| **Selección de la zona** | Los 11 de cada zona, por temporada |
| **Primera** | |
| **Reserva** | |
| **Cuarta** | |
| **Quinta** | Techo del arranque declarado |
| **Sexta** | |
| **Séptima** | |
| **Octava** | |
| **Novena** | |

- Es la escala de las categorías del fútbol argentino. Igual que en el pádel (de Octava a Primera), pero en idioma fútbol: subir es literalmente "llegar a Primera".
- **Sin club no hay categoría oficial.** La categoría la mueven solo los partidos entre clubes y, a futuro, los torneos. El sistema de torneos para organizadores es otra parte de TurnoGol, no de RIVAL: RIVAL solo lee sus resultados certificados. El picado de los amigos cuenta como partido jugado, nada más. Esa es la palanca para que los grupos armen clubes serios ([`clubes.md`](clubes.md)).
- **Es tuya:** la ves vos, y es pública solo si querés.

## Cómo se calcula

- **"La media" es el número oculto** detrás de la categoría, tipo Elo, con un grado de confianza como el de Playtomic o el de Glicko. Nadie ve el número: se ve la categoría y una barra de progreso hacia la siguiente.
- **Qué la mueve:**
  - los partidos oficiales entre dos clubes: turno en la grilla de un complejo TurnoGol y resultado confirmado por los dos capitanes o por el encargado;
  - a futuro, los partidos de torneos de TurnoGol (el sistema para organizadores), con más peso, porque los carga el organizador.
- **Qué no la mueve:** el picado del grupo, los goles, los votos ni la figura. Así nadie la arregla entre amigos.
- **Cómo se mueve:**
  - según el resultado de tu club y la media del club rival (el promedio de las medias de sus jugadores en ese partido): ganarle a uno más fuerte suma más;
  - es de suma cero: lo que gana uno lo pierde el otro, así no se infla;
  - repetir el mismo rival seguido rinde menos.
- **Se explica siempre:** "Subiste porque le ganaron a un club de media más alta".

## El arranque: declarás y la cancha valida

### Cómo lo hacen otras plataformas

| Plataforma | Arranque | Cuándo se vuelve confiable |
|---|---|---|
| Playtomic (pádel) | Cuestionario inicial, que ellos llaman una estimación | Lleva una "fiabilidad": con fiabilidad baja, el nivel se mueve mucho. Solo lo mueven los partidos competitivos. Una nivelación en un club certificado la sube al 50%. Te podés bajar el nivel a mano; la fiabilidad no la toca nadie. |
| Lichess (ajedrez) | Todos en 1500 con "?" | El "?" se va cuando el sistema tiene confianza (según el foro, hacen falta unas cuantas decenas de partidas) y vuelve si dejás de jugar meses |
| Valorant (videojuego) | Unas 5 partidas de ubicación con nivel oculto | Recién después se muestra el rango, nunca arriba de todo de entrada |
| Pádel amateur en Argentina | Categorías por puntos en torneos homologados | Los requisitos para ubicarse no son claros y es un tema polémico `[NO VERIFICADO]` |

Playtomic, Valorant y el pádel argentino salen de resúmenes del buscador del 2026-10-30, porque las páginas no se pudieron abrir: `[NO VERIFICADO]` en el detalle (fiabilidad del 50%, bajarse el nivel, 5 partidas). Lo básico de Playtomic (cuestionario, fiabilidad y que solo cuentan los partidos competitivos) también está en el [benchmark de RIVAL](../planning/2026-10-rival-benchmark.md). Lo de Lichess se verificó en su página.

### Cómo es en TurnoGol

1. **Declarás**, con 3 preguntas cerradas, la primera vez que entrás a categorías:
   - ¿Cuánto jugás? 1 vez por semana · 2 o 3 · 4 o más.
   - ¿Dónde jugaste? Picados · liga amateur · inferiores de un club · federado.
   - ¿Tu puesto? Arquero · defensor · mediocampista · delantero.
2. **Arrancás con "?"**, por ejemplo "Sexta?".
   - El techo del arranque es Quinta: nadie empieza en Cuarta, Reserva ni Primera.
   - Te podés declarar más abajo, nunca arriba del techo.
3. **La cancha valida.**
   - Los primeros partidos oficiales mueven mucho tu categoría.
   - A los 10 se va el "?" y queda oficial.
   - Si pasás meses sin jugar partidos oficiales, el "?" vuelve, pero no te baja.
4. **Los torneos certifican, a futuro.** Un partido de torneo cargado por su organizador pesa más, como la nivelación en club certificado de Playtomic.

## Subir y bajar

- **Se sube en el momento.** Cuando la media cruza el umbral, subís, y sale la tarjeta "¡Subí a Quinta!".
- **Se baja despacio.** Solo al cierre de la temporada, por el promedio de la temporada y como mucho una categoría. Una mala noche no te manda abajo.
- **Por qué así:** subir ya da el pico de alegría para compartir. Bajar despacio protege el ego y convierte el cierre de temporada en una razón para jugar: defender la categoría.

## La Selección de la zona: "Los 11 de Luján"

- **Once lugares por zona y por temporada**, uno por puesto de una formación, para los de media más alta de cada puesto.
- **Solo entran quienes eligieron que su categoría sea pública.**
- Se anuncian al cierre de la temporada, en la Gala y en el Diario de la Zona, con tarjeta y figurita edición Selección.
- **Es escasez real:** son 11, no un número inventado.
- Necesita densidad: se abre con la tabla de la zona (etapa 3).

## Quién ve qué

- **Tu categoría la ves vos.** Es privada por defecto.
- **Pública si querés**, en tu tarjeta de jugador y en los partidos. La podés volver a ocultar cuando quieras.
- **El tablón puede pedir "de Sexta para arriba"** sin mostrar la categoría de nadie: solo te deja o no te deja sumarte. Sumarte a un partido con piso deja ver que lo cumplís, y eso se avisa antes de sumarte ⚖.
- **Nadie ve a otro abajo.** Las tablas individuales muestran solo la parte de arriba, y solo a los públicos.

## Las estadísticas, en tres niveles de verdad

| Nivel | Qué suma | Quién lo valida |
|---|---|---|
| Partidos jugados | Todos: el fijo con amigos, los del tablón, los del club, los de torneo | La reserva en TurnoGol |
| Oficial ✓ | Goles, figura, resultados y categoría con tu club | Los dos capitanes o el encargado. Los goles los carga cada capitán y tienen que sumar el resultado |
| Certificado ✓✓ | Goles y títulos en torneos | El organizador del torneo (a futuro) |

El picado de los amigos es para jugar y despejarse: suma a "partidos jugados en el año" y nada más. Sin goles, sin figura, sin tabla.

## Psicología del futbolero

| Resorte | Cómo lo activa la categoría |
|---|---|
| "Soy mejor que el promedio": muchos se creen arriba | El "?" pide que la cancha lo confirme. La única forma de sacarlo es jugar partidos oficiales |
| Meta cercana: se acelera cuando falta poco | "Estás a un paso de Quinta", con la barra casi llena |
| Progreso dado: cuesta abandonar algo empezado | La declaración te pone con la barra empezada, no en cero |
| Miedo a perder, blando | Defender la categoría al cierre de la temporada |
| Compararse con los cercanos | Categorías y Selección por zona: competís con tu barrio, no con el país |
| Estatus que se muestra | Tarjeta "¡Subí a Quinta!", la figurita con la categoría, "Los 11 de Luján" |
| Identidad | El que jugó en inferiores se reconoce en la escala; "llegar a Primera" es el sueño de todo pibe que pateó |
| Tribu | La categoría se gana con tu club: subís con los tuyos |

### Egos encontrados

- **Matagigantes:** logro por ganarle a un club de media mucho más alta.
- **"La cancha no miente":** el que dice que es de Primera tiene una sola forma de demostrarlo.
- **Revancha y clásicos:** perder contra un club de media más baja duele, y la revancha está a un toque.
- **Versus entre amigos que aceptan**, con la categoría de cada uno si es pública.
- **Límite:** nunca se muestra quién te hizo bajar ni se nombra a nadie por perder.

## Los usuarios ideales

| Quién | Por qué es ideal | El gancho | Por dónde llega |
|---|---|---|---|
| **El competitivo del barrio** (20 a 32, juega en varios lados, sube historias) | Es el primero que quiere saber su categoría y mostrarla | "¿De qué categoría sos?" y la tarjeta de ascenso | Historias de Instagram de otros, desafío de un rival |
| **El capitán** | Arma el club y trae un plantel entero de cuentas | "Sin club no hay categoría oficial"; el escudo, el plantel, la cartelera | El complejo, el desafío, los partidos de la casa |
| **El ex de inferiores o de liga** | Ya vivió el fútbol en serio y la escala habla su idioma | "Volvé a Primera" | Su club, el desafío |
| **El arquero** | Es escaso y todos lo buscan | Su categoría vale oro en el tablón ("busco arquero de Quinta para arriba") | El tablón, "Se busca arquero" |
| **El dueño de complejo** | Las categorías le dan noches de categoría en horas muertas (partidos de la casa "Noche de Quinta"; no son torneos) | Llenar huecos con un formato que entiende del pádel | El panel "Tu complejo en RIVAL" |
| **El espontáneo** (Tomás) | Consume: mira categorías, juega el Crack del Día, se suma a un club | La tarjeta de un amigo que subió | WhatsApp, el Crack del Día |

## FOMO real y marketing agresivo

- **Ganchos:**
  - "¿De qué categoría sos?"
  - "Todos dicen que son de Primera. La cancha lo dice."
  - "La cancha no miente."
  - "Del barrio a Primera."
  - "Sin club no hay categoría."
- **FOMO real, nunca inventado:**
  - **Temporada Cero:** quienes jueguen la primera temporada tienen la marca "Fundador" en su categoría para siempre. Es real porque la primera temporada pasa una sola vez.
  - **"Los 11 de Luján"** se cierran en una fecha real, al terminar la temporada.
  - **El cierre de la temporada** tiene fecha: "Faltan 12 días para el cierre" con el número real.
  - **La barra:** "Estás a un paso de Quinta" cuando de verdad lo estás. Nunca un número de victorias, porque depende de contra quién se juega.
- **Nunca:** números inflados, cupos falsos, cuentas regresivas que se reinician, culpa ("no jugás hace…") ni escrache.

## Riesgos y trampas

| Riesgo | El freno |
|---|---|
| Cuentas nuevas para jugar abajo y ganar fácil | Arranque con "?" que se mueve rápido y lo sube enseguida; una cuenta por persona, que hoy no se puede hacer cumplir porque el ingreso es por mail (se resuelve en la spec); el club frena a los "refuerzos" con el plantel congelado ([`clubes.md`](clubes.md)) |
| Perder a propósito para bajar | Se baja solo al cierre de la temporada y como mucho una categoría |
| Arreglos entre clubes amigos | Suma cero, menos puntos al repetir rival, doble confirmación y turno en la grilla |
| El ego herido que abandona | Privada por defecto, bajar despacio, nadie ve a otro abajo, la explicación del porqué |
| Categorías que se inflan con el tiempo | Suma cero y el promedio de temporada |
| Grupos de clubes que solo juegan entre sí y no se comparan con el resto | La confianza baja hasta que juegan con clubes de afuera; rival ideal, desafíos y Corona mezclan |
| La escala nombra inferiores, que en la realidad son de chicos | La plataforma es solo para mayores de 18 (ADR-012); la escala es una metáfora y el copy nunca habla de edades |

## Ley ⚖

La categoría es un perfil de la persona (Ley 25.326). Necesita asesoría antes de construirla:
- consentimiento por finalidad: calcularla, mostrarla en público y entrar a la Selección son tres finalidades distintas;
- explicación de por qué subiste o bajaste;
- derecho a pedir que se revise un partido que la movió, y acceso, rectificación y supresión;
- retención: la carrera necesita una política nueva (ver la decisión, "porque es ley").

## Etapas

- **Etapa 2 (punta de entrada):** con los primeros clubes, la categoría privada, la declaración y el "?".
- **Etapa 3 (expansión):** la categoría pública en tablas, la Selección de la zona y el filtro del tablón.
- **A futuro:** los partidos de torneos certificados, cuando exista el sistema para organizadores.

## Fuentes

- Playtomic: [cómo funciona el nivel](https://playerhelp.playtomic.com/hc/en-gb/articles/43310980754193-How-the-Playtomic-level-system-works) y [subas y bajas](https://help.playtomic.com/en/articles/3112292-the-playtomic-levels-algorithm-ups-downs).
- Lichess: [el "?" y la desviación](https://lichess.org/forum/general-chess-discussion/what-does-a-question-mark-after-a-rating-mean) (foro que cita el FAQ) y [sistemas de rating](https://lichess.org/page/rating-systems).
- Valorant: [partidas de ubicación](https://primagames.com/tips/how-many-placement-games-to-get-ranked-valorant).
- Pádel en Argentina: [calculadora de ranking](https://hacecuentas.com/calculadora-padel-ranking-puntos-apt-aap-subir) (no oficial) y [ponencia de la UNLP](https://congresos.fahce.unlp.edu.ar/jornadassociologia/xii-jornadas/actas/ponencia-240620110047434733/@@display-file/file/IbarrolaPONmesa41.pdf).
- Consultadas el 2026-10-30.
