# RIVAL: la cultura futbolera de TurnoGol

**Estado:** visión, sin construir más allá de v1. **Decisión que la habilita:** [`2026-10-29-rival-cultura-de-turnogol.md`](../decisions/2026-10-29-rival-cultura-de-turnogol.md). **Catálogo de ideas:** [`ideas.md`](ideas.md). **Minijuego diario:** [`crack-del-dia.md`](crack-del-dia.md). **Lo construido (v1):** spec [`2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md), decisión [`2026-10-22-rival-v1.md`](../decisions/2026-10-22-rival-v1.md).

Este documento es la visión. No es una spec: cada ola tiene la suya, con asesoría legal si toca la ley y el OK del dueño.

## RIVAL en una pantalla

**"Tu picado, tratado como un club."** Cada grupo de amigos tiene lo mismo que un club profesional: escudo, camiseta, dorsales, plantel, tabla, clásicos, estrellas arriba del escudo, tapa de diario y figuritas. Cada jugador tiene su media, su carrera y sus figuras.

- **Lema:** "Cada partido cuenta". Cuenta para la tabla y se cuenta en la tapa.
- **Botón de compartir:** "Que se sepa".
- **Qué es:** el lado jugador de TurnoGol, con la misma cuenta y la misma web. El nombre de presentación sigue siendo el de la spec v1, "RIVAL powered by TurnoGol".
- **Qué cuenta:** solo el partido oficial, con turno en la grilla de un complejo TurnoGol y resultado confirmado por los dos capitanes o por el encargado.
- **Para qué, en el negocio:** que el futbolero quiera volver, competir y mostrarse, y que sus jugadores sean un motivo más para que un complejo elija TurnoGol.

## El círculo que trae complejos

1. Los equipos juegan en complejos TurnoGol y sus partidos **cuentan**: tabla, media, carrera, estrellas.
2. Comparten lo que ganan (tapa, figurita, ascenso, figura) en WhatsApp e Instagram, y otros futboleros se enteran.
3. El que juega en un complejo sin TurnoGol quiere que sus partidos también cuenten. Toca **"Pedí tu cancha"** y a ventas le llega un pedido con demanda real, por ejemplo "12 jugadores de tu complejo lo pidieron" (el número es el real de cada caso).
4. El complejo entra y hay más sedes donde los partidos cuentan.
5. Los complejos compiten por **"Complejo de la zona"** y empujan RIVAL con sus propios jugadores.

Playtomic hace algo parecido con el nivel, que solo lo mueven los partidos competitivos. Pero también deja cargar resultados de canchas que no usan Playtomic `[NO VERIFICADO]`. Acá hacemos lo contrario a propósito: la palanca es traer complejos.

## Principios: competir sin escrache

1. **Se compite en equipo y también solo.** Hay tablas de clubes y una media por jugador, siempre sobre partidos verificados. Brillar es público y quedar abajo no: las tablas individuales muestran solo la parte de arriba, y tu posición la ves vos.
2. **Solo cuenta lo verificado.** Respeta la regla del doc fable_5: nunca rankings sobre datos auto-reportados.
3. **Muchas tablas chicas:** por zona, complejo, formato y categoría. Así hay muchos primeros (pez grande en estanque chico).
4. **Lo positivo es público; lo negativo es privado o no existe.** El escrache sigue vetado.
5. **Idioma fútbol, no idioma app:** tabla, fecha, clásico, ascenso, promedios, estrellas, tapa, figurita, la media, la figura. Nunca "XP" ni medallitas infantiles.
6. **Privado por defecto; público solo si el jugador lo elige.** Datos de lista cerrada y cero texto libre sobre personas (Ley 25.326).
7. **Números reales o nada.** Sí a "La tabla de Luján se abre con 8 clubes. Van 3." (encuadre); nunca un número inflado.
8. **Integrarse a WhatsApp, no competirle.** Todo termina en algo lindo para pegar en el grupo.
9. **Lo que se cuenta nunca cambia precio, acceso ni reputación ante el complejo.**

## Los 6 mundos

El detalle de cada idea (etapa, puerta, tamaño, qué reusa) está en [`ideas.md`](ideas.md). Acá va la forma del todo. **Todos los números de las mecánicas** (50 y 100 partidos, 3 partidos para un clásico, 90 días, top 10, 6 intentos) **son propuestas** que se ajustan al diseñar cada ola.

### 1. YO: tu carrera

- **La ficha.** Es automática y sale de las reservas (ya existe en v1). Suma G/E/P con tu club, clásicos, títulos y figuras.
- **La media.** Es tu nivel, como en el pádel pero dicho en idioma fútbol:
  - sube y baja con los partidos oficiales, según el resultado de tu equipo y la media del rival;
  - los votos y los goles no la mueven, así nadie la arregla entre amigos;
  - es provisoria hasta que haya partidos suficientes para que sea justa;
  - la ves siempre, y los demás solo si la hacés pública.
- **La figura del partido.** La votan los del otro equipo: es el reconocimiento del rival y no se arregla entre amigos.
  - Solo puede salir quien aceptó participar.
  - Se publica solo quién ganó, nunca cuántos votos sacó cada uno.
  - En el picado del grupo la vota todo el grupo y queda adentro.
- **La figurita.** Tu carta coleccionable, con diseño propio: foto, dorsal, club, zona, tu media (si es pública) y 4 números verdaderos.
  - Ediciones que se ganan: Debut, Plata (50 partidos), Oro (100), Campeón, Figura, Leyenda, Fundador.
  - El álbum del Mundial 2026 la hace entendible para todos.
- **La trayectoria**, el "Transfermarkt del barrio", y **"Es oficial"**: la tarjeta de fichaje cuando te sumás a un club.
- **Logros con tono de crónica:** Centenario, Hombre de la casa, Trotamundos, Inoxidable, Ídolo, Matador de clásicos. Hay ocultos: Día del Amigo, Feriado, Trasnoche.
- **Versus** con un amigo que acepta: cara a cara de carreras y medias, más "cuando se enfrentaron". Hay duelo del mes.
- **Racha semanal con perdón** (una "lesión" por temporada) y **goles en un toque a la mañana siguiente**, privados por defecto.

### 2. NOSOTROS: tu club

- **Fundá tu club.** El nombre lo tira la IA (5 opciones con humor de potrero) y lo modera. Además: escudo armado de piezas, camiseta, año de fundación y complejo de local.
- **Dorsales** (el 10 se pelea), **estrellas arriba del escudo** (una por título) y parche de campeón vigente.
- **La historia del club**, escrita por la IA con datos reales y sin nombrar jugadores: mayor goleada, rachas, clásicos.
- **El vestuario**, privado:
  - la convocatoria, que reusa el partido del grupo de v1;
  - **"Pan y queso"**, que arma equipos parejos para el picado interno con la media y el historial;
  - la tabla del grupo, que ve solo el grupo.
- **Del turno fijo al club.** Los abonados ya son equipos: el complejo los invita desde el panel a fundar su club, y se arranca sin juntar gente de cero.
- **Hinchada.** Cualquiera sigue a un club, y la cantidad de hinchas se ve en su página.

### 3. ELLOS: la competencia

- **El partido oficial.** Al terminar, cada capitán confirma el resultado en un toque, o lo confirma el encargado desde la grilla. Si no coinciden, queda "en revisión" y no cuenta.
- **La tabla de la zona:** abierta, sin fixture, 3/1/0, por formato y categoría. Cada club elige si aparece.
- **Tablas individuales:** la media más alta, las figuras y los goleadores de cada tabla chica.
  - Los goles los carga cada capitán para su equipo y tienen que sumar el resultado confirmado. Es una excepción decidida (2026-10-30) a "nunca rankings sobre datos auto-reportados": el resultado está verificado y la atribución de cada gol no.
  - Muestran solo los de arriba (por ejemplo, los 10 primeros) y solo a quien eligió ser público.
- **Divisiones.** El nivel del club va oculto (tipo Elo) y se ve como una división: la D → la C → la B → el Nacional → Primera. Los nombres se eligen al diseñar la ola.
- **Temporadas** Verano, Apertura y Clausura, con ascensos y descenso blando (promedio de 2 temporadas). Cada una deja su tarjeta: "¡ASCENDIMOS!", "¡Zafamos!".
- **Clásicos automáticos.** Con 3 partidos entre los mismos clubes ya hay clásico, con historial y "semana de clásico".
- **La Corona del complejo.** Un club la tiene, cualquiera lo desafía y, si le gana, se la lleva ("Defensas: 4"). Genera partidos repetidos en esa cancha.
- **Desafío directo y revancha en un toque.** El desafío viaja por WhatsApp, y para aceptarlo el rival funda su club: así entran equipos nuevos.
- **El álbum de la zona.** Cada club que enfrentás pega su figurita ("te faltan 3 de Luján"). Empuja a jugar contra rivales nuevos.
- **"¿Volverían a jugar?"**
  - Después del partido oficial, cada equipo contesta sí o no sobre el rival.
  - Puede marcar etiquetas de una lista cerrada: puntuales, buena onda, juego limpio.
  - Lo positivo se ve en el club rival. Lo negativo solo lo usa el sistema, para no volver a emparejarlos y para moderar.
- **Rival ideal.** Emparejamiento por división, formato, días y zona. En el tablón de v1, "falta uno" de media parecida.
- **Copas: fuera de RIVAL** (decisión del 2026-10-30). Un organizador de torneos sería otra parte de TurnoGol, más adelante.

### 4. LA CANCHA: los complejos

- **El estadio:** la página RIVAL del complejo. Tiene la Corona, las Leyendas, los clásicos que se juegan ahí, los desafíos abiertos, la comunidad de WhatsApp, los logros, el contador de partidos del mes y un salón de campeones.
- **Leyenda de la cancha**, como las Local Legends de Strava `[NO VERIFICADO]`: gana quien más partidos jugó ahí en 90 días. Premia la constancia, no el talento, así que cualquiera puede llegar.
- **Logros del complejo:** primera reserva online, Sede oficial RIVAL, 100/500/1.000 reservas online, Casa de campeones, Corona en juego, Cancha llena, Bot en la cancha.
- **Complejo de la zona**, cada mes, con criterios públicos y medidos:
  - partidos RIVAL;
  - clubes que juegan de local;
  - una nota de los jugadores sobre la cancha (estado de la cancha y luz), de lista cerrada y sin texto libre.
- **El sticker de la puerta.** Placa física "Sede oficial RIVAL" o "Complejo de la zona, nov 2026", con QR. El complejo presume y el jugador escanea.
- **Hora RIVAL y partido de la casa.** El complejo publica desde su panel, con su sello, partidos en sus horas muertas, con logros especiales y la Corona en juego. La apuesta es que eso ayude a llenar huecos; no se promete.
- **Panel "Tu complejo en RIVAL"**, con frases como "te faltan 4 partidos para Complejo de la zona" e invitar a los turnos fijos. Los dueños de la zona se conocen, y eso los hace competir entre ellos.
- **Pedí tu cancha.** La demanda real se convierte en pedidos para ventas. Cuando el complejo entra, los que lo pidieron reciben "Fundador de la sede". Nunca se promete "te traemos jugadores".
- **Comunidad del complejo.**
  - El grupo, la comunidad o el canal de WhatsApp lo maneja el complejo desde su teléfono.
  - TurnoGol muestra el link y le da "lo de la semana" listo para pegar.
  - La API de Grupos de WhatsApp no sirve: pide cuenta oficial y, según un proveedor, tiene un tope de 8 personas por grupo `[NO VERIFICADO]`.

### 5. EL RITUAL: todos los días

- **El Crack del Día**, en la home: adiviná el futbolista con letras en verde, amarillo y gris. **Desde el 2026-10-30 no es parte de RIVAL:** es un jueguito de TurnoGol. No necesita gente en la zona, así que anda desde el día 1. Detalle: [`crack-del-dia.md`](crack-del-dia.md).
- **Prode TurnoGol** (Liga y Selección), con ligas por club, complejo y amigos, sin plata.
- **Desafío de la semana** para clubes y jugadores. A futuro, patrocinado por una marca.
- **El Diario de la Zona**, los lunes. Es una edición, no un feed: resultados, tabla, clásico, goleada, equipo de la fecha y el complejo destacado, con titulares de la IA que no nombran jugadores.

### 6. EL RELATO: lo que se cuenta

- **La tapa.** La IA (Haiku) escribe una crónica por cada partido oficial, con titular y bajada de diario deportivo y datos reales. La IA no nombra jugadores (decisión del 2026-10-30, "mucha exposición"): la tapa habla de clubes y resultados.
- **Tarjetas 9:16 para todo:** resultado, tapa, figura, fichaje, ascenso, campeón, clásico, Corona, Leyenda, figurita, logro, Versus, Crack del Día.
  - Reusan `src/lib/story-image/` y la Placa (`src/app/(admin)/grilla/_components/StoryShareDialog.tsx`).
  - Llevan el complejo chiquito: publicidad gratis para el dueño.
- **El Día del Partido**, a la mañana: "Clásico #4, la Corona en juego". **Tercer tiempo**, después: confirmar el resultado, votar la figura, ver la tapa, pedir revancha.
- **Tu Temporada** (estilo Spotify Wrapped), por temporada y por año, y **el informe del DT**, mensual y de la IA.
- **Contenido para las redes de TurnoGol**, con permiso de cada club y de cada persona que aparece: equipo y figura de la fecha, goleada, clásico, complejo de la zona. Los complejos lo repostean.
- **Reacciones de tribuna:** frases fijas, sin texto libre.

### Premiaciones: la Gala

Al cierre de cada temporada, la Gala de la zona premia:
- al campeón de cada división y a los ascensos;
- a la revelación y a la figura de la temporada;
- al goleador, si es público;
- a la Leyenda;
- al Juego limpio;
- al complejo de la temporada.

El trofeo físico se entrega en la cancha del campeón, y eso da foto y contenido. Los complejos o las marcas pueden poner premios. Siempre hay estrellas y figurita de campeón. La plata para trofeos y los acuerdos con marcas necesitan decisión aparte.

## Una semana de Tomás

Tomás tiene 26 y es el jugador espontáneo de [doc3](../spec/doc3_personas_jtbd.md).

- **Lunes.** Abre TurnoGol por el Crack del Día, lo saca en 4 y pega la grilla en el grupo. Su club promedia 3,8 intentos.
- **Martes.** Le llega el desafío de Los del Fondo, que ganaron la Corona de El Vagón el sábado.
- **Jueves.** Juegan, y en el Tercer tiempo los dos capitanes confirman 5 a 3. Los del Fondo lo votan figura. La tapa dice "Se terminó el reinado".
- **Viernes.** Comparte la figurita edición Figura en su historia, con El Vagón chiquito abajo. Un amigo que juega en otro complejo toca "Pedí tu cancha".
- **Domingo.** Pide revancha en un toque y defiende la Corona.

## Un mes de Marcelo

Marcelo tiene 43 y es dueño de 4 a 6 canchas.

- **Semana 1.** Desde el panel invita a sus turnos fijos a fundar su club. Agustín (32, abonado de los miércoles a las 20:00) funda Los del Miércoles con su grupo de siempre: se arranca con plantel, sin juntar gente.
- **Semana 2.** Publica dos partidos de la casa en sus horas muertas del martes con la Corona en juego, y se juegan.
- **Semana 3.** El panel le dice "te faltan 4 partidos para Complejo de la zona". Pega en su comunidad de WhatsApp "lo de la semana" que le arma TurnoGol.
- **Semana 4.** Gana Complejo de la zona, pega el sticker en la puerta y otro dueño de la zona le pregunta qué es eso.

Los números de estas historias son ilustrativos. No son datos medidos y no se usan en ventas.

## Por qué engancha

| Resorte | Qué lo activa |
|---|---|
| Pertenencia a la tribu (Tajfel) | club, escudo, dorsal, clásico, hinchada, barrio |
| Progreso y competencia (autodeterminación, "falta poco") | divisiones, la media, "te faltan 2 para ascender", ediciones de la figurita |
| Compararse con los cercanos (Festinger) | tablas chicas por zona, complejo y formato; Versus |
| Estatus que se muestra | tapa, figurita, la media, la figura, sticker, "Que se sepa" |
| Premio variable (Eyal) | la tapa de la IA, la figura, logros ocultos, Crack del Día |
| Miedo a perder, con perdón | defender la Corona, la racha, los promedios |
| Lo armé yo y mi carrera vive acá (efecto IKEA y dotación) | fundar el club, la historia, el costo de irse |
| Colección | el álbum de la zona, las ediciones de la figurita |
| Pico y final | Tercer tiempo con tapa y figura, Tu Temporada |
| Compromiso público y reciprocidad | un club con nombre falta menos; "¿volverían a jugar?" |

## Marketing

- **Ocho círculos que se retroalimentan:**
  1. la convocatoria (v1);
  2. el desafío;
  3. el fichaje;
  4. las tarjetas;
  5. la grilla del Crack;
  6. Pedí tu cancha;
  7. Complejo de la zona;
  8. el sticker con QR.
- **Lanzamiento: "Temporada Cero"** en El Vagón y Luján.
  - Clubes fundadores (los primeros de verdad).
  - Los turnos fijos pasan a ser clubes.
  - Noche RIVAL en el complejo.
  - La Corona de El Vagón es la primera competencia visible.
  - El Crack del Día arranca desde el día 1.
- **Tono:** voseo, humor de potrero, autoironía, nunca culpa ni plata, voz de empresa ("Te ayudamos", no un nombre propio).
- **Frente a ATC** (solo para este doc interno; en ventas no se compara):
  - Según una publicación en LinkedIn, ATC tiene comunidades por zona y por club `[NO VERIFICADO]`.
  - Según el benchmark, tiene "Falta 1" con nivel tipo Elo, sobre todo de pádel.
  - RIVAL es 100% fútbol y de equipos: clásicos, ascensos, tapa y figuritas, cosas que en un deporte de 4 no existen.
- **Lo que vende ya** (la urgencia de octubre sigue):
  - Pedí tu cancha, que da pedidos para ventas;
  - logros y sticker del complejo, que son argumento de venta;
  - turnos fijos → clubes, que da valor para El Vagón;
  - Crack del Día, que da tráfico y SEO.
- **Nunca:** prometer "te traemos jugadores", inventar cupos o inflar números.

## Etapas: cada idea entra con su puerta de densidad

1. **Hoy:** v1 prendido (2026-10-29) y un complejo.
2. **La punta de entrada.** Anda con un complejo y sin densidad:
   - Crack del Día;
   - club, y del turno fijo al club;
   - Pan y queso con figura del picado;
   - tapa, figurita y carrera;
   - logros y Leyenda;
   - Corona (anda con 2 o 3 clubes);
   - logros del complejo y sticker;
   - Pedí tu cancha.

   La media se empieza a calcular desde el primer partido oficial.
3. **Expansión.** Propuesta: se abre con 8 clubes activos en una zona o con 3 complejos.
   - tabla de la zona y tablas individuales;
   - divisiones y temporadas;
   - rival ideal;
   - Diario;
   - Complejo de la zona;
   - ligas de prode;
   - canal de la zona.
4. **El norte.**
   - Gala y trofeos;
   - varias ciudades;
   - marcas y desafíos patrocinados;
   - relator con IA;
   - TurnoGol Cam.

   La meta es que RIVAL sea el motivo número 1 por el que un complejo elige TurnoGol.

Los umbrales son propuesta: los fija el dueño al abrir cada ola, con datos reales de uso.

## Reglas que no se negocian

- **Ley 25.326:**
  - consentimiento por cada finalidad nueva (tabla pública, media pública, figura, Versus);
  - perfil público solo si el jugador lo elige;
  - acceso, rectificación, supresión y exportación de datos;
  - solo mayores de 18 (ADR-012).
- **Retención.** La promesa de la spec §10 ("hasta 12 meses después de jugado") vale para lo ya guardado. La carrera necesita una política nueva, con su consentimiento y asesoría.
- **Votos y media.**
  - Propuesta: quién votó a quién se usa solo para contar y se borra al cerrar la votación; queda el resultado. Se confirma con asesoría.
  - La media se explica ("subiste porque le ganaron a un equipo de media más alta") y se puede ocultar.
- **Imagen.**
  - Fotos de plantel solo con la aceptación de cada uno, o visibles solo para el plantel.
  - Nada de fotos de profesionales, escudos reales ni voces reales.
- **Premios y prode.** Un concurso con premio necesita asesoría (Lealtad Comercial). Nunca apuestas ni "partido por plata".
- **Trampas.** Las frenan:
  - la doble confirmación más el turno en la grilla;
  - menos puntos si repetís rival seguido;
  - un Elo de suma cero;
  - goles que tienen que sumar el resultado;
  - la figura votada por el rival.
- **WhatsApp:** nada masivo desde nuestro sistema.
- **Sigue vetado:**
  - texto libre sobre personas;
  - notas o estrellas de una persona a otra;
  - escrache y ausencias visibles;
  - karma canjeable;
  - plata entre jugadores, apuestas y billetera;
  - precio en la tarjeta;
  - feed de publicaciones y chat;
  - geolocalización.

  Lista completa y condiciones: [la decisión del 29/10](../decisions/2026-10-29-rival-cultura-de-turnogol.md).

Lo marcado `[NO VERIFICADO]` salió de búsquedas en la sesión del 2026-10-29 y no tiene fuente guardada en el repo: confirmarlo antes de usarlo afuera.

## Glosario de pantalla

Son nombres de trabajo; los definitivos se eligen viendo pantallas.

| Término | Qué es |
|---|---|
| Partido oficial | Turno en la grilla de un complejo TurnoGol con resultado confirmado por los dos capitanes o el encargado |
| La media | El nivel de cada jugador, que mueven solo resultados oficiales |
| La figura | El jugador del partido, votado por el rival |
| La figurita | La carta coleccionable de cada jugador, con ediciones |
| El club | El equipo con nombre, escudo y plantel |
| La Corona | El título de un complejo que se gana desafiando a quien lo tiene |
| Leyenda de la cancha | Quien más partidos jugó en un complejo en 90 días |
| La tapa | La crónica de la IA de cada partido oficial |
| Tercer tiempo | El momento después del partido: confirmar, votar, ver la tapa |
| Pedí tu cancha | El pedido de un jugador para que su complejo entre a TurnoGol |

## Fuentes

- La visión del founder del 2026-09-01 y del 2026-09-27, y las respuestas del 2026-10-29 (en la decisión).
- [`docs/planning/posible_nuevas_features_turnogol_fable_5.md`](../planning/posible_nuevas_features_turnogol_fable_5.md), §4 y §5, y [`docs/planning/2026-10-rival-ideas.md`](../planning/2026-10-rival-ideas.md).
- Personas: [`docs/spec/doc3_personas_jtbd.md`](../spec/doc3_personas_jtbd.md).
- Playtomic (nivel por partidos competitivos, [`2026-10-rival-benchmark.md`](../planning/2026-10-rival-benchmark.md)), Strava (Local Legends) `[NO VERIFICADO]`, Wordle (el género del Crack del Día), Spotify Wrapped (Tu Temporada).
- ATC: comunidades por zona y club según una publicación en LinkedIn `[NO VERIFICADO]`; "Falta 1" con nivel tipo Elo según el benchmark. Que ATC tenga un ranking no está verificado.

## Qué tenés que hacer vos

- Leer [la decisión del 29/10](../decisions/2026-10-29-rival-cultura-de-turnogol.md) y confirmar que dice lo que decidiste.
- Leer este documento y marcar lo que te encanta y lo que no.
- Elegir la primera ola de la punta de entrada. Recomendación: Crack del Día y del turno fijo al club, porque no necesitan densidad y le dan algo a El Vagón ya.
- Antes de construir cada ola: asesoría legal para lo que es ley (consentimientos, retención, concursos).
