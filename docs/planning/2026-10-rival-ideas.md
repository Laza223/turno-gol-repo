# RIVAL: ideas de otras plataformas y roadmap por olas

**Fecha:** 2026-10-21. Lo pidió el founder: "que veas plataformas que se dedican a esto orientado a RIVAL y saquemos ideas, formas en la que hacen las cosas, creatividades, etc. TODO".

**Método:** tres relevamientos en paralelo sobre fuentes abiertas: convocatoria en grupos cerrados, tablón y pickup, y creatividades y crecimiento. Complementa [`2026-10-rival-benchmark.md`](2026-10-rival-benchmark.md) (la mecánica) y no lo repite. La spec que sale de acá es [`2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md).

**Cómo leerlo.** Las marcas `[NO VERIFICADO]` son datos que no se pudieron confirmar en la fuente primaria: muchos centros de ayuda devolvieron 403 o tenían anti-bot, y varios datos salen de resúmenes de buscador o de marketing de los propios vendedores. Cada idea lleva una de estas etiquetas:

- **[v1]**: entró en la spec;
- **[ola]**: va al roadmap;
- **[veto]**: choca con un veto vigente.

> **Enmendado el 2026-10-29** por [`2026-10-29-rival-cultura-de-turnogol.md`](../decisions/2026-10-29-rival-cultura-de-turnogol.md). Se levantan, con su condición: nivel numérico (como "la media"), G/E/P entre equipos, evaluar al rival (como "¿volverían a jugar?"), push, jugador del partido (como la figura), rankings y comparaciones (tablas con opt-in que muestran solo la parte de arriba), recordatorio ("El Día del Partido"), nombre del equipo (moderado), partido de la casa, canal de WhatsApp, torneos, "Los fijos de El Vagón" y feed agregado (contador y Diario semanal). Siguen vetados: escrache, karma canjeable, dividir la cancha y lo de "No se propone". La visión y el catálogo nuevos están en [`docs/rival/`](../rival/README.md).

## 1. Convocatoria del grupo (RSVP)

**El hallazgo estratégico es que WhatsApp ya compite desde adentro del grupo.** Desde agosto de 2026 está desplegando encuestas con cierre programado y votantes ocultos ([WABetaInfo](https://wabetainfo.com/whatsapp-announces-three-new-features-for-group-chats/)). También tiene Eventos con Voy, Quizás y No voy, según prensa de 2024 que no se pudo verificar ([Lowyat](https://lowyat.net/2024/328466/whatsapp-events-group-chats)). Lo que no tiene es cupo duro, lista de espera, recordatorio a quien no votó y "repetir el de la semana pasada": ese es el lugar de RIVAL.

- **Link con vista previa estable.** Luma pone el estado en el título ("Sold Out – Waitlist Only", [luma.com](https://luma.com/zyxmk5mj)) y Partiful usa una portada vertical. En RIVAL el título es estable y el contador va en la página, porque WhatsApp cachea la vista previa `[NO VERIFICADO]`. **[v1]**
- **Primero se vota, después se identifica uno.** Partiful pide nombre, celular y código SMS después del "Voy" ([ayuda](https://help.partiful.com/hc/en-us/articles/34230743189787-How-do-I-RSVP-to-an-event-on-Partiful)), y Doodle deja votar antes de dar email. En RIVAL se ve el partido sin cuenta y la cuenta se pide al tocar "Voy". **[v1]**
- **Lista visible antes de responder.** Partiful la oculta y un crítico lo marca como fricción ([Substack](https://worldspiritsockpuppet.substack.com/p/things-i-hate-about-partiful)). En RIVAL se muestran nombres cortos y avatares, con sesión. **[v1]**
- **Grilla de camisetas con "faltan 3".** Idea propia; Luma solo dice "3 Going". **[v1]**
- **Lista de espera con promoción automática.** Spond avisa al primero, Partiful lo agrega solo ([ayuda](https://help.partiful.com/en-us/articles/15525379-how-can-i-limit-group-size)) y Capo da una ventana de 15 minutos ([Capo](https://caposport.com/how-it-works/payments-and-rsvps)). En RIVAL es "El banco", con promoción por mail. **[v1]** La ventana con vencimiento queda como **[ola]**.
- **+1 con tope.** Partiful da uno por defecto. **[ola]** ⚖ Un +1 sin cuenta es un invitado como los de `guest_name`, que en Personas quedaron fuera por producto: necesita decisión.
- **Recordatorios y .ics.** Heja manda mensajes distintos a quien respondió y a quien no ([ayuda](http://help.heja.io/en/articles/2455312-when-teams-receive-activity-reminders-notifications)), y Sale y Termina avisa 24 h y 2 h antes. El recordatorio a los "Voy" con .ics es **[ola]** ⚖ (choca con el veto "NO hay recordatorio 24hs al jugador en v1"). El recordatorio a quien no respondió exige un grupo guardado: **[ola]**.
- **"Avisar al grupo" con un texto según el estado.** Mecánica propia sobre `wa.me`, inspirada en el "Remind now" de Heja y el "last call" de Capo. **[v1]**
- **Fecha límite para confirmar** (Partiful; TeamSnap sugiere "mediodía del día anterior"). **[ola]**
- **"Me bajo" en un toque.** Fubles permitía bajarse hasta 4 h antes y después pedía suplente ([Il Post 2015](https://www.ilpost.it/2015/04/21/calcetto-fubles/)). **[v1]**
- **Un privado que pasa solo al tablón si faltan jugadores** (Fubles). **[ola]**
- **Motivo de baja cerrado, que ve solo el organizador.** **[ola]** La nota libre de Heja es **[veto]**.
- **Co-organizador** (Partiful). **[ola]**
- **Portadas y temas con humor.** Es lo que se le atribuye al éxito de Partiful ([CNBC](https://www.cnbc.com/2025/04/19/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple.html), 403 al abrirla). En RIVAL serían 6 temas fijos. **[ola]**
- **Copy sin culpa.** La carita llorando de Partiful al rechazar se critica como manipuladora. **[v1]** como regla de tono.
- **Plantillas de aviso** ("cambió la hora", "se suspende por lluvia"). **[ola]** Los mensajes libres a todos son **[veto]**.
- **"Repetir el del jueves".** Spond arma series ([ayuda](https://help.spond.com/app/en/articles/140738-recurring-event)) y KIBI configura el partido una vez ([kibisports.com](https://www.kibisports.com/matchday)). Repetir a mano es **[v1]**. La serie automática es **[ola]**.

## 2. Tablón y pickup football

- **El cupo en palabras, agrupado por "Hoy".** Footy Addicts usa "Last spot!", "2 spots open" y "Waiting list" ([footyaddicts.com](https://footyaddicts.com/football-games)). **[v1]** El precio en la tarjeta es **[veto]**.
- **Formato y cancha en la tarjeta** (GoodRec). **[v1]**
- **El complejo siembra el tablón.** Fubles fue gratis en zonas poco activas ([EconomyUp](https://www.economyup.it/startup/lanno-doro-di-fubles-come-e-cresciuta-la-startup-del-calcetto-grazie-a-centri-sportivi-e-brand/)), y Plei y GoodRec dependen de complejos asociados. **[ola 1.3]**
- **Estado vacío con "Avisame" y "Armá el primero".** No se encontró el copy de ninguna app `[NO VERIFICADO]`. **[v1]**
- **Ficha del solicitante solo para el organizador.** Meetup le muestra el historial de asistencia, y solo dentro de su grupo ([ayuda](https://help.meetup.com/hc/en-us/articles/42877005264397-How-to-view-a-member-s-attendance-history-in-your-group)). En RIVAL se muestran partidos jugados y antigüedad. **[v1]** El conteo de ausencias **no se propone** (ver "No se propone"): mostrárselo a un desconocido es escrache.
- **Asistencia que marca el complejo, no los otros jugadores.** GoodRec la toma con QR y en Meetup la marca el organizador. **[ola]**
- **Escrache.** El "Bidone" de Fubles, las calificaciones de Footy Addicts y el "Reliability" público. **[veto]**
- **Nivel en 3 etiquetas verbales.** GoodRec las usa y recibe quejas cuando el nivel lo asigna otro. El nivel numérico de Playtomic y los ELO son **[veto]**. **[v1]**
- **El pedido de arquero lleva fecha, lugar y tipo de cancha** (Goleiro de Aluguel, [Baguete](https://www.baguete.com.br/noticias/app-ajuda-a-encontrar-goleiros)). **[v1]**
- **Lista privada de arqueros con los que ya jugaste** (favoritos de Goleiro de Aluguel). **[ola]**
- **Rotación justa de arqueros, sin ranking.** El "sub desk" de [Madison Gay Hockey](https://madisongayhockey.org/teams-schedule/sub-desk-logic) los ordena por quién subió menos. **[ola]**
- **Perfil de equipo guardado para "Busco rival".** CoachingArea filtra por formato, fuerza y superficie `[NO VERIFICADO]`. **[ola 1.2]**
- **Un solo formulario para "falta gente" y "falta rival"** (Equipo Completo, Chile). **[v1]**
- **Evaluar al rival** (Joga+, Jalcha) y **llevar la cuenta de ganados y perdidos** (Jogueiros). **[veto]** Lo que sí se puede es "ya jugaron N veces": **[ola]**
- **Alertas con opt-in, por mail en vez de push** (Meetup). La alerta simple por complejo es **[v1]**; la segmentada, **[ola 2]**. El push estilo Playtomic es **[veto]** hoy: el jugador no recibe push.
- **Cuidado con la frecuencia.** Las reseñas de GoodRec se quejan de notificaciones promocionales ([JustUseApp](https://justuseapp.com/en/app/1510554246/just-play-sports/reviews)). Eso justifica el tope de un mail por día.
- **Resumen de temporada, racha e insignias de hitos propios.** Pitch: Match Diary, la racha del Year in Sport de Strava `[NO VERIFICADO]` y Nike Run Club. **[ola 1.2]**
- **Jugador del partido, rankings y karma canjeable.** **[veto]**
- **Código de conducta en cada ficha.** Footy Addicts pide puntualidad y no tolera la conducta agresiva. **[v1]**
- **Bloquear y denunciar.** GoodRec lo tiene. En Playtomic el no-show se le reporta a soporte, no en público `[NO VERIFICADO]`. Ninguna app deportiva tiene motivos cerrados: en RIVAL es diseño propio. **[v1]**

## 3. Creatividades y crecimiento

- **Vista previa dinámica de 1200×630, sin contador.** La guía no oficial dice que WhatsApp no muestra imágenes de más de ~300 KB `[NO VERIFICADO]`. **[v1]**
- **El cuello es el organizador.** Duolingo dice que lo más difícil fue lograr la primera invitación ([blog](https://blog.duolingo.com/product-lessons-friend-streak/)). Por eso "Avisar al grupo" es el único verde del organizador. **[v1]**
- **`?ref` por convocatoria** para medir cuentas nuevas. **[v1]**
- **Racha del grupo.** Duolingo reporta un 22% más de lecciones completadas con al menos una racha con amigos (mismo post). Con copy sin culpa cuando se corta. **[ola 1.2]**
- **Tarjeta 9:16 "Estamos los 10" o "Nos faltan N"** con las camisetas y sin nombres, por Web Share con archivo. Reusa la Placa (`StoryShareDialog.tsx`). Meta pide 9:16 y como mínimo 720×1280, y su API para compartir en historias es solo para apps nativas ([developers.facebook.com](https://developers.facebook.com/docs/instagram-platform/sharing-to-stories)). La zona segura recomendada es 250 px arriba y ~340 abajo `[NO VERIFICADO]`. **[ola 1.1]**
- **Cartel "Se busca arquero."** Arqueros Ya juntó ~600 arqueros en dos días (benchmark S11). **[ola 1.1]**
- **Recap "Se jugó"** con complejo, fecha y "10 en cancha", sin resultado ni goleadores. **[ola 1.2]**
- **"Tu temporada" a principios de enero**, como el resumen anual de Letterboxd y el umbral mínimo de actividad de Strava ([soporte](https://support.strava.com/hc/en-us/articles/22067973274509)). Serían de 5 a 9 tarjetas compartibles, por mail. Compararse con otros, "top fan" y "top X%" son **[veto]**. **[ola 1.2]**
- **Tono:**
  - adidas "You Got This", positivo y colectivo;
  - Uber "Allá vamos. Subite.", filmada en canchas de barrio ([uber.com](https://uber.com/es-AR/newsroom/uber-lanza-su-campana-publicitaria-de-futbol));
  - Quilmes "Benditos" y Fernet Branca "Somos Insoportables", con autoironía;
  - PedidosYa, con lo que se grita desde la tribuna.

  La fórmula: voseo, humor cariñoso de autorreconocimiento y el chiste sobre el que no viene, nunca sobre plata. "El que no viene paga la cancha" es **[veto]**; queda "El que no viene se pierde el tercer tiempo".
- **Nombres:** El banco, Se juega, Se cayó, Se busca arquero, Donde me pongan y Tercer tiempo (el recap).
- **Kit del complejo:**
  - el "partido de la casa" (Playtomic recomienda algo parecido para Open Play `[NO VERIFICADO]`);
  - un cartel con QR y `?ref=cartel`;
  - el Canal de WhatsApp del complejo, donde los seguidores no ven el número de los demás. ⚖ Es difusión masiva, y el stack de WhatsApp de TurnoGol excluye los mensajes masivos.

  Es **[ola 1.3]**.

## 4. Copy que entró en la spec

- "Armá el partido y pasale el link al grupo."
- "Estoy adentro." / "Listo, estás adentro. Nos vemos en la cancha."
- "Hoy el tablón está tranquilo. Armá el primero y que se sume quien pueda."
- "¡Estamos los 10! Se juega."
- "Se busca arquero. El arco no se ataja solo."
- "Jueves 21:00 en El Vagón. Nos faltan 3. ¿Venís? Confirmá en un toque."
- "Quedaste en el banco. Si alguien se baja, entrás vos y te avisamos por mail."
- "Si no podés ir, bajate a tiempo: alguien del banco ocupa tu lugar."
- "Todavía no jugaste ninguno por acá. El primero se arma en dos toques."

## 5. Roadmap por olas (sin freeze, decidido ola por ola)

Cada ola la elige el dueño con las métricas de v1 (spec §11). Lo marcado con ⚖ toca un veto vigente o una regla de F4 y necesita una decisión escrita aparte.

**Ola 1.1: que se juegue todas las semanas**
- Grupo guardado ("Los del jueves"), con link fijo y serie semanal automática.
- ⚖ Recordatorio por mail 24 h antes, con .ics y "Me bajo" en un clic. Aunque sea solo para RIVAL, choca con el veto de `CLAUDE.md` "NO hay recordatorio 24hs al jugador en v1": necesita decisión escrita.
- Fecha límite para confirmar, ventana para el primero del banco, co-organizador y plantillas de aviso.
- ⚖ +1 invitado: si es sin cuenta, es un invitado de `guest_name`, fuera por producto en Personas.
- Tarjeta 9:16 "Nos faltan N", "Estamos los 10" y "Se busca arquero", y 6 temas de convocatoria.
- ⚖ **Push al jugador con Web Push/PWA.** Hoy el jugador no recibe push. Es la palanca más fuerte para avisarles a los disponibles.

**Ola 1.2: identidad y orgullo**
- Equipos con color de camiseta y escudo de un set cerrado. ⚖ El nombre del equipo sería el primer texto libre público de RIVAL: o sale de una lista, o necesita moderación y una decisión. Autocompletan "Busco rival" y muestran "ya jugaron N veces".
- Insignias de hitos propios: primer partido, 10, 50, "10 partidos al arco" (por cantidad, sin adjetivos que suenen a puntaje) y "organizador habitual".
- Racha semanal personal y del grupo, recap "Tercer tiempo" y "Tu temporada 2026" en enero.
- Compañeros frecuentes, en privado.

**Ola 1.3: que el complejo empuje** (posible porque F2 cayó)
- "Partido de la casa" publicado desde el panel, con sello del complejo. Toca F5: hoy un complejo no puede ser jugador.
- Turnos libres al tablón ("hay cancha a las 22, armá partido").
- Cartel QR con `?ref` y métricas de RIVAL por complejo en el panel.
- ⚖ Canal de WhatsApp del complejo: es difusión masiva, excluida del stack de WhatsApp.
- Moderación del complejo en su sede.
- El bot de IA de WhatsApp (TurnoGol Plus) contesta "¿falta uno?" y deriva al tablón.

**Ola 2: la liga del barrio**
- ⚖ Torneos relámpago entre equipos de RIVAL, sobre el módulo de torneos, que está detrás del flag `tournaments` (global en `false`).
- Resultados entre equipos cargados por los dos capitanes.
- Alertas por día, franja y zona, y bolsa de arqueros del complejo.
- ⚖ Ranking objetivo y opt-in, "Los fijos de El Vagón", por partidos jugados. F4 excluía los rankings.
- ⚖ Feed agregado del complejo ("34 partidos esta semana"), sin personas. F4 excluía el feed.
- ⚖ Dividir la cancha entre jugadores con MercadoPago. Está vetado: sin billetera ni pagos entre jugadores, y sería un circuito de plata nuevo.

**No se propone, aunque no haya freeze** (Ley 25.326 y riesgo de escrache):
- chat propio;
- comentarios o reseñas de personas;
- puntajes entre jugadores;
- ausencias visibles para otros;
- geolocalización del jugador.
