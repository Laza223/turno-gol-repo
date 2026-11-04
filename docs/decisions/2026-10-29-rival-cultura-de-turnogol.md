# Decisión: RIVAL es la cultura del jugador de TurnoGol

**Fecha:** 2026-10-29. **Decide:** Lazar (founder), en la sesión de visión de RIVAL, con cuatro preguntas cerradas. **Insumos:** la visión [`docs/rival/README.md`](../rival/README.md) y el catálogo [`docs/rival/ideas.md`](../rival/ideas.md).

**Enmienda:**
- F4 de [`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md), en el perfil mínimo;
- "Fuera de v1" de [`2026-10-22-rival-v1.md`](2026-10-22-rival-v1.md);
- §6, §8 y §10 de la spec [`2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md);
- las marcas `[veto]` y ⚖ de [`2026-10-rival-ideas.md`](../planning/2026-10-rival-ideas.md).

RIVAL v1 sigue como está construido. Lo que cambia es qué se puede proponer y diseñar para las próximas olas.

## Por qué

En palabras del founder, RIVAL "era pensado tipo una especie de plataforma o parte de Turnogol aparte en donde iban a convivir los egos de los futbolistas, rankings, equipos, comunidades y mucho más". Esa visión la dio el 2026-09-01 y la repitió el 2026-09-27, pero nunca entró entera al repo. Lo que entró fue el recorte de v1 (el partido del grupo y el tablón) con sus vetos, y desde ahí cada lectura reducía RIVAL a "buscar rival".

## Decisiones

1. **Qué es RIVAL.** Es el lado jugador de TurnoGol: misma cuenta y misma web. No es una app ni una marca aparte. Todo lo que se comparte lleva TurnoGol y el complejo, así cada tarjeta le vende a otro complejo. El nombre de presentación sigue siendo el de la spec v1 ("RIVAL powered by TurnoGol"); cambiarlo es una decisión de naming aparte.
2. **Qué partido cuenta.** Para tablas, media, figura y logros de competencia cuenta solo el **partido oficial**:
   - el turno está en la grilla de un complejo TurnoGol, reservado online o cargado por el encargado;
   - el resultado lo confirman los dos capitanes, o el encargado desde la grilla.

   Propuesta para cuando no coinciden: el partido queda en revisión y no cuenta. Los partidos en canchas sin TurnoGol no cuentan: esa es la palanca de "Pedí tu cancha". La ficha de v1 (partidos jugados, que sale de las reservas) no cambia.
3. **Compiten los clubes y también cada jugador.** Hay un nivel individual, "la media", y una figura del partido. La media sale solo de resultados de partidos oficiales. La mecánica de la figura es una propuesta que se ajusta al diseñar su ola: la votan los del otro equipo y se publica solo quién ganó.
4. **Se levantan todos los vetos que la visión toca**, cada uno con su condición:

| Veto hasta hoy (dónde) | Desde esta decisión | Condición que queda |
|---|---|---|
| Sin rankings (F4, v1, `CLAUDE.md`, `PRODUCT.md`, ideas) | Tablas de clubes e individuales, "Los fijos de El Vagón" | Solo partidos verificados; aparecer es opt-in; las individuales muestran solo la parte de arriba |
| Nivel numérico y Elo (ideas) | La media de cada jugador | La mueven solo resultados verificados; es privada por defecto |
| Ganados y perdidos entre equipos (ideas) | G/E/P del partido oficial | Un partido en disputa no cuenta |
| Comparar personas, "top X%" (ideas) | Versus y tablas individuales | Versus solo entre quienes aceptan; nadie ve a otro abajo |
| Puntajes entre personas y jugador del partido (F4, v1, ideas) | La figura del partido | Solo voto positivo (la mecánica exacta es propuesta). Una nota de una persona a otra sigue vetada |
| Evaluar al rival (ideas) | "¿Volverían a jugar?" | Lista cerrada; lo negativo nunca se muestra |
| Perfil no navegable (spec §6) | Perfil y figurita públicos | Opt-in; privado por defecto |
| Push al jugador (v1, `PRODUCT.md`, ideas) | Push de RIVAL | Opt-in y horario silencioso |
| Recordatorio al jugador (`CLAUDE.md`, ideas) | "El Día del Partido" en partidos de RIVAL | Opt-in; los recordatorios de reservas no cambian |
| Un solo texto, tu nombre (spec §8); nombre del equipo (ideas) | El nombre del club | Moderado por IA, con denuncia y lista negra. Es el único texto libre público y es de un club, no de una persona |
| Feed agregado del complejo (F4, ideas) | Contador de partidos del complejo y el Diario semanal | Sin personas en el contador; un feed de publicaciones sigue vetado |
| Canal de WhatsApp (ideas) | Canal del complejo y de TurnoGol por zona | Canal que la gente elige seguir, manejado a mano; el sistema nunca manda mensajes masivos |
| Partido de la casa (F5, ideas) | El complejo publica desde su panel | Las cuentas siguen separadas: publica el complejo, no un jugador |

## Lo que sigue vetado

La visión no lo necesita:
- texto libre sobre personas (Ley 25.326, D3);
- notas o estrellas de una persona a otra;
- escrache y ausencias visibles;
- karma canjeable;
- plata entre jugadores, apuestas y billetera;
- precio en la tarjeta;
- feed de publicaciones y chat;
- geolocalización;
- menores de 18 (ADR-012).

## Lo que no se levanta por decisión, porque es ley

Necesita asesoría antes de construir cada ola:
- consentimiento por cada finalidad nueva: tabla pública, media pública, figura, Versus;
- **retención:** la promesa de la spec §10 ("hasta 12 meses después de jugado") vale para todo lo guardado con ese texto, y la carrera necesita una política nueva con su consentimiento;
- votos y media como datos personales (qué se guarda y por cuánto tiempo se define con asesoría; la propuesta de diseño es guardar el resultado, no quién votó a quién);
- "¿Volverían a jugar?": aunque lo negativo nunca se muestre, es un registro sobre personas alcanzado por el derecho de acceso;
- imagen de terceros (CCyC art. 53): fotos de plantel solo con la aceptación de cada uno;
- concursos con premio y prode (Lealtad Comercial).

## Lo que sigue necesitando una decisión escrita aparte

- Todo lo que toque el precio del SaaS: un premio para complejos, "Sede RIVAL Pro".
- Plata para trofeos o premios físicos.
- Acuerdos con marcas.

Los nombres de pantalla (las divisiones, la media, la figurita) se eligen al diseñar cada ola, viendo pantallas.

## Lo que se cerró después de la revisión (2026-10-30)

Tres preguntas que dejó abierta la revisión adversarial, contestadas por el founder:

1. **La IA no nombra jugadores.** La tapa, la historia del club, el Diario y el informe del DT hablan de clubes y resultados. Motivo: "mucha exposición".
2. **Sí hay tabla de goleadores**, con los goles que carga cada capitán para su equipo, que tienen que sumar el resultado confirmado. Es una excepción consciente a "nunca rankings sobre datos auto-reportados": el resultado está verificado y la atribución de cada gol no.
3. **Torneos no entra en RIVAL.** El flag `tournaments` no se prende para RIVAL y no hay copas sobre el módulo de torneos. Un organizador de torneos (tipo "copa fácil") sería otra parte de TurnoGol, más adelante: primero lo simple. El canal de WhatsApp por zona y el partido de la casa siguen en la tabla y se confirman al abrir su ola.

## Lo que no cambia

- RIVAL v1 construido, detrás del flag `rival`, que se prendió el 2026-10-29.
- La decisión 6 de v1: el nivel del partido (Tranqui, Parejo, Picante) lo declara el organizador. La media es otra cosa, un número por jugador que sale de resultados verificados.
- **Levantar un veto no es construir ya.** Cada idea entra con su ola y su puerta de densidad ([`docs/rival/README.md`](../rival/README.md), "Etapas"). Antes de cada ola: spec, asesoría si toca la ley y OK del dueño.

## Confianza

Media-baja. Es una apuesta de producto sin uso medido: RIVAL v1 se prendió el mismo día. La sostienen el pedido del dueño de El Vagón (un perfil, "me falta 1", "busco rival", "busco arquero"), mecánicas que ya funcionan en otras plataformas (el nivel de Playtomic, las Local Legends de Strava) y que todo entra por olas con puerta de densidad.
