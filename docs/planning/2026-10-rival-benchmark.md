# RIVAL powered by TurnoGol — benchmark de "me falta uno / busco rival / busco arquero"

Relevamiento del 2026-10-14. Es insumo de diseño, no una decisión de producto. Objetivo: ver cómo otras plataformas completan un partido de fútbol amateur, para diseñar RIVAL (sección de comunidad del portal del jugador, piloto en Luján con un complejo).

Es el relevamiento que pide F4 de [`docs/decisions/2026-10-14-foco-jugador-rival.md`](../decisions/2026-10-14-foco-jugador-rival.md) antes de escribir la spec de RIVAL v1 [S21]. Esa decisión ya fijó varias cosas (publicaciones independientes de la reserva, contacto por WhatsApp recién cuando el organizador acepta, sin chat propio, sin precios, sin puntajes entre personas); el benchmark las toma como dadas y apunta a lo que falta decidir (sección 4.3).

**Método y límites**

- 40 consultas web (búsquedas y lecturas de páginas) el 2026-10-14. Solo lectura: no se crearon cuentas, no se instaló ninguna app y no se probó ningún flujo desde adentro.
- Lo que hay de cada plataforma sale de notas de prensa de lanzamiento, fichas de tiendas de apps (incluidas las etiquetas de privacidad, que las declara el propio desarrollador), centros de ayuda y sitios oficiales. Ninguna fuente publica cuántos partidos se completan.
- Los artículos del centro de ayuda de Playtomic devolvieron 403 al abrirlos; leí los mismos artículos por la versión JSON pública de ese centro de ayuda.
- Sin contenido legible desde acá: `faltauno.com.ar` (solo el título), `nosfalta1.com.ar` (certificado TLS que no corresponde al dominio), `atcsports.io/matches` (solo un titular) y `canchafija.com.ar` (solo el menú).
- Cobertura: el relevamiento mira sobre todo el tablón de publicaciones abiertas. El "partido del grupo" (confirmaciones dentro de un grupo cerrado) casi no está cubierto: solo aparecen los grupos de Timpik [S6] y los equipos de Mejenga [S18].
- `[NO VERIFICADO]` = no lo pude confirmar en una fuente abierta. Las etiquetas `[S#]` remiten a la sección 6. Dato "interno" = documento previo del repo (`docs/gtm/research/`, `docs/planning/`, `docs/decisions/`), que no re-verifiqué.

## 1. Resumen en 5 líneas

1. **Patrón común**: alguien que ya tiene la cancha reservada publica cuántos faltan (a veces posición, nivel y género), la plataforma lo muestra o avisa, el que se suma confirma y el resto se arregla por WhatsApp (Falta Uno [S1], Juol [S4]). Playtomic hace lo mismo en pádel pero con pago online y nivel numérico [S8][S9].
2. **"Le llega quien está" está documentado en una sola plataforma**: Falta Uno avisa a jugadores cercanos a la cancha [S1]. Por día, posición o nivel no encontré ninguna que lo documente; el resto es de tipo "el jugador mira" (Mejenga: el jugador publica su disponibilidad [S18]) o manual (Don Potrero: el complejo contacta a sus seguidores [S15]).
3. **Nadie publica una regla clara para el que se baja o no va**: Playtomic cobra por adelantado y devuelve la plata [S9], Dónde Juego deja que el complejo sancione [S14], Falta Uno y FútbolYa hablan de reputación sin reglas visibles [S2][S12], Juol y Timpik 2.0 no dicen nada [S4][S6].
4. **Nadie publica tasa de partidos completados ni densidad**; arrancan con medios propios: partidos organizados por la plataforma (Wannaplay [S13], FútbolYa [S12]), seguidores del complejo (Don Potrero [S15]) o redes (Arqueros Ya: unos 600 arqueros anotados en dos días por Instagram [S11]). Ya figuraba como pregunta abierta en `docs/gtm/research/2026-09-01-competidores-v2.md` (línea 211).
5. **Lo que nadie resuelve bien para TurnoGol**: datos personales (la ficha de Falta Uno declara seguimiento entre apps con ubicación y contacto [S2]; Timpik, Don Potrero y Mejenga tienen foros, muro o chat de texto libre [S6][S7][S15][S18]), edad (clasificación 4+ en Timpik, 13+ en Mejenga [S5][S18]) y "busco rival" entre equipos (no encontré ninguna mecánica clara).

## 2. Tabla comparativa

Dos tablas con las mismas filas para que entren las diez dimensiones. País entre paréntesis.

### 2.1 Mecánica del partido

| Plataforma | Qué publica el organizador | Cómo se suma | Contacto | Alertas a disponibles | Nivel |
|---|---|---|---|---|---|
| **Falta Uno** (AR) | Cuántos faltan, posiciones, género y cancha; tiene que tener la cancha reservada [S1] | [NO VERIFICADO]: ni la nota ni la ficha lo dicen [S1][S2] | [NO VERIFICADO]; las notas de versión mencionan arreglos del contacto entre participantes, sin detalle [S2] | Sí: aviso a jugadores cercanos a la cancha [S1]. Por día, posición o nivel: [NO VERIFICADO] | Del jugador: posición + nivel de principiante a avanzado [S1] |
| **Juol** (PY) | Ubicación de la cancha, día y hora [S4] | Se registra (edad y género) y confirma asistencia; aprobación o lista de espera no figuran [S4] | WhatsApp directo con el organizador, después de confirmar [S4] | No figuran [S4] | Nada [S4] |
| **Timpik** (ES) | Hoy: crea el partido e invita [S5][S6]. En 2012: evento público con lugar, hora y costo de cancha [S7] | 2012: pedido para participar + lista de espera si está lleno [S7]. Hoy: [NO VERIFICADO] | 2012: mensajes privados y foro por evento [S7]. 2025: foro en los grupos [S6] | Notificaciones automáticas al organizador [S5]. Alarma al jugador por ciudad, deporte y fecha: [NO VERIFICADO] | Del jugador: 3 escalones + ranking [S6] |
| **Playtomic Open Matches** (pádel y tenis; no hay fútbol) | Partido competitivo o amistoso y género; el rango de nivel lo fija el primer jugador que entra [S8][S9] | Dentro del rango de nivel, el artículo no aclara si hace falta aprobación; fuera del rango, pide lugar y tienen que aceptar todos los presentes. El lugar se confirma al pagar online [S8][S9] | No figura en lo leído [NO VERIFICADO] | No figuran en lo leído [NO VERIFICADO] | Numérico, del jugador, con rango en el partido; solo los competitivos lo mueven [S8][S10] |
| **CanchaFija** (AR) | "Falta Uno" es una sección del sitio con partidos que necesitan jugadores [S16]; el detalle [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] |
| **Dónde Juego** (AR) | El sitio no explica la convocatoria [S14]; el relevamiento interno la registra como convocatoria abierta [S19]; detalle [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] |
| **ATC Sports** (AR/LatAm) | Se puede abrir un partido propio o sumarse a uno existente [S17]; detalle [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | Interno: "Falta 1" con nivel tipo ELO [S19]; sin confirmación pública [NO VERIFICADO] |
| **Don Potrero** (AR/UY/CR) | Los partidos los crea el complejo o sus administradores [S15] | Pasos no descritos [S15] | El complejo contacta a los jugadores que lo siguen; mensajería entre jugadores no figura [S15] | Los seguidores ayudan a llenar huecos; cómo se les avisa no figura [S15] | Nada [S15] |
| **Wannaplay** (2023; vigencia [NO VERIFICADO]) | Partidos organizados por la plataforma: fútbol 5 u 11, 60 minutos [S13] | Se une a partidos publicados; directo o aprobación no figura [S13] | No figura [S13] | Muestra partidos de la zona; avisos no figuran [S13] | Sin sistema; posición habitual en el perfil [S13] |
| **FútbolYa** (AR, CABA) | La app publica los partidos en complejos asociados [S12] | Elige por zona, día y horario y reserva su lugar [S12] | Sin chat propio; busca reemplazar los grupos de WhatsApp [S12] | No figuran [S12] | No figura [S12] |
| **Mejenga** (iOS; país [NO VERIFICADO]) | El jugador publica su disponibilidad; también se buscan jugadores para completar un equipo [S18] | [NO VERIFICADO] | Chat y comentarios [S18] | Notificaciones de comentarios y torneos; de faltantes no figuran [S18] | Rankings, estadísticas y votación de MVP [S18] |
| **Arqueros Ya** (AR) | El equipo pide un arquero para fútbol 5, 7, 8, 9 u 11 [S11] | [NO VERIFICADO]; hoy por Instagram, app propia en desarrollo [S11] | Instagram hoy; contacto directo en la app futura [S11] | No figuran [S11] | Perfil en video + reseñas [S11] |
| **Nos Falta Uno / hayPartido** (AR) | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] |

### 2.2 Compromiso, plata, reglas y arranque

| Plataforma | Si se baja o no va | Precio por jugador | Moderación y edad mínima | ¿Exige reserva de cancha? | Arranque con poca gente |
|---|---|---|---|---|---|
| **Falta Uno** | Las notas de versión hablan de calificar jugadores y de visibilidad para ausentes y usuarios con restricciones; reglas concretas [NO VERIFICADO] [S2] | App gratis; premium previsto; precio por jugador no figura [S1][S2] | 18+ [S1][S2]; verificación de teléfono [S2] | Sí, el organizador debe tenerla [S1] | Autofinanciado; meta de 300 mil jugadores; ciudades y estrategia no figuran [S1] |
| **Juol** | Sin sanciones ni reputación; el fundador dice que anotarse con más compromiso bajó las cancelaciones, sin datos [S4] | No figura cobro [S4] | Registro con edad y género; edad mínima y moderación no figuran [S4] | No figura [S4] | Un video en TikTok validó la idea; lanzamiento oficial a mediados de mayo de 2026; autofinanciado [S4] |
| **Timpik** | 2012: el organizador sanciona y queda en el perfil [S7]. 2025: no figura [S6] | App gratis [S5]; costo de cancha en el evento (2012) [S7]; monedero para reservas [S6] | Clasificación 4+ en la tienda [S5] | No figura como requisito; ofrece reservar cancha en un clic [S5] | Más de 100.000 descargas y unos 20.000 activos según la empresa [S6] |
| **Playtomic Open Matches** | Se paga online para confirmar; si el partido no se completa o te bajás, reembolso inmediato; qué pasa con la cancha no se dice [S9]. El sistema de nivel no habla de ausencias [S10] | Pago online con tarjeta o monedero; varía según la cancha que se asigne [S8][S9] | Cuenta obligatoria [S8]; edad no figura | No al crear: se confirma al cumplirse umbrales o plazos, o cuando un admin la asigna a mano [S9] | Lo impulsa el club: activa Open Matches por deporte y se generan en todos los horarios libres [S9] |
| **CanchaFija** | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] |
| **Dónde Juego** | El complejo sanciona al que no vino y recibe una alerta si reincide en ese complejo [S14] | [NO VERIFICADO] | Teléfono verificado [S14]; edad [NO VERIFICADO] | [NO VERIFICADO] | Interno: 100K+ instalaciones en Android [S19] |
| **ATC Sports** | Por faltar a una reserva: cargo al medio de pago o, sin medio de pago, bloqueo para reservar la semana siguiente; no aclara si vale para partidos abiertos [S17] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | Escala general de la plataforma: más de 2 millones de usuarios activos y más de 1.000 clubes, según el sitio [S17] |
| **Don Potrero** | Sin reputación ni sanciones; el complejo fija tiempos mínimos para reservar y cancelar [S15] | No figura | Listas bajo reglas de privacidad y comunidad de la plataforma; muro de comentarios en el perfil público [S15] | Los crea el complejo, así que siempre con su cancha [S15] | Depende de los seguidores del complejo [S15] |
| **Wannaplay** | Solo normas de conducta [S13] | Se muestra el costo por partido, sin montos en la nota [S13] | Mayores de 18, salvo partidos femeninos [S13] | La pone la plataforma [S13] | La plataforma organiza: cancha, pecheras, pelotas y árbitro [S13] |
| **FútbolYa** | Reputación que premia la asistencia regular; presencia confirmada con geolocalización al llegar; sanciones no figuran [S12] | Pago por partido (monto no publicado); suscripción con créditos en desarrollo [S12] | Edad no figura | La app reserva en complejos asociados [S12] | CABA con complejos asociados; menos de 500 dólares de inversión inicial, casi todo en difusión [S12] |
| **Mejenga** | No describe bajas; hay votación de MVP y estadísticas [S18] | Gratis + Premium dentro de la app (entre 4,99 y 14,99 dólares aprox.) [S18] | 13+ [S18] | No figura | No figura |
| **Arqueros Ya** | No figura política de ausencias [S11] | Los arqueros cobran; monto no publicado [S11] | Arqueros mayores de 18; perfil en video; reseñas [S11] | No figura | Instagram: unos 600 arqueros en dos días y más de 1.700 después; primer caso fuera de Buenos Aires en Rosario (15/04/2026), luego Córdoba y San Luis [S11] |
| **Nos Falta Uno / hayPartido** | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | [NO VERIFICADO] | hayPartido: cero lugares en Luján, Mercedes y Pilar según el relevamiento interno [S19] |

## 3. Ficha por plataforma

### 3.1 Falta Uno (Argentina)

- App argentina para completar partidos de fútbol, creada por dos fundadores (Córdoba y Buenos Aires), con ficha en la App Store, gratis y solo para mayores de edad ([S1](https://www.iproup.com/startups/57055-son-argentinos-y-crearon-un-tinder-para-sumar-jugadores-de-futbol), [S2](https://apps.apple.com/ar/app/falta-uno/id6738060775)). El desarrollador en la App Store es Pablo Barrea ([S2](https://apps.apple.com/ar/app/falta-uno/id6738060775)).
- Flujo documentado: el jugador carga posición preferida y nivel (de principiante a avanzado). Quien organiza tiene que tener la cancha reservada antes de crear el partido y publica cuántos faltan, posiciones, género y cancha. La app manda una alerta a los jugadores cercanos a esa cancha; el canal (push, email, dentro de la app) no se aclara ([S1](https://www.iproup.com/startups/57055-son-argentinos-y-crearon-un-tinder-para-sumar-jugadores-de-futbol)).
- Compromiso: las notas de versión mencionan verificación de teléfono, un flujo para calificar jugadores y visibilidad de ausentes y de usuarios con restricciones ([S2](https://apps.apple.com/ar/app/falta-uno/id6738060775)). No hay reglas publicadas, así que cómo funciona de verdad es [NO VERIFICADO].
- Plata: gratis hoy; prevén un plan premium para jugadores y otro para canchas y torneos ([S1](https://www.iproup.com/startups/57055-son-argentinos-y-crearon-un-tinder-para-sumar-jugadores-de-futbol)).
- Privacidad: la etiqueta que declara el desarrollador lista ubicación, datos de contacto e identificadores usados para seguimiento entre apps y sitios de terceros y para publicidad ([S2](https://apps.apple.com/ar/app/falta-uno/id6738060775)).
- Tracción: 4,1 sobre 15 valoraciones en la tienda iOS argentina ([S2](https://apps.apple.com/ar/app/falta-uno/id6738060775)); es una señal débil (valoraciones no son usuarios). Meta declarada: 300 mil jugadores activos; ciudades de arranque y estrategia no figuran ([S1](https://www.iproup.com/startups/57055-son-argentinos-y-crearon-un-tinder-para-sumar-jugadores-de-futbol)).
- Sin confirmar: cómo se suma un jugador (directo o con aprobación), cómo se contactan, precio por jugador y texto de términos y privacidad. Hay una nota gemela del mismo día que no nombra la app ([S3](https://ecosistemastartup.com/?p=36948)).

### 3.2 Juol (Paraguay)

- Idea nacida tras la respuesta a un video en TikTok (octubre de 2025 según el año de la nota); el desarrollo empezó en febrero y el lanzamiento oficial fue a mediados de mayo de 2026. Autofinanciada, sin inversores ([S4](https://infonegocios.com.py/conosur/se-termino-el-falta-uno-juol-la-app-paraguaya-que-conecta-jugadores-para-completar-partidos-de-futbol)).
- Los organizadores publican partidos abiertos con ubicación de la cancha, día y hora. El jugador se registra con datos básicos (edad y género), confirma asistencia y después coordina por WhatsApp directamente con el organizador ([S4](https://infonegocios.com.py/conosur/se-termino-el-falta-uno-juol-la-app-paraguaya-que-conecta-jugadores-para-completar-partidos-de-futbol)).
- Compromiso: sin sanciones ni reputación. El fundador afirma que anotarse con más compromiso (registro + confirmación) redujo las cancelaciones; es dicho suyo, sin datos ([S4](https://infonegocios.com.py/conosur/se-termino-el-falta-uno-juol-la-app-paraguaya-que-conecta-jugadores-para-completar-partidos-de-futbol)).
- Plata: no se menciona cobro; a futuro planean torneos y partidos temáticos o patrocinados. El fundador tiene experiencia previa administrando una cancha sintética ([S4](https://infonegocios.com.py/conosur/se-termino-el-falta-uno-juol-la-app-paraguaya-que-conecta-jugadores-para-completar-partidos-de-futbol)).
- No figuran: alertas, nivel, posiciones, edad mínima, moderación ni si exige cancha reservada. Una sola fuente (prensa).

### 3.3 Timpik (España; apunta también a Latinoamérica)

- App gratuita de pádel, fútbol y pickleball con partidos, reserva de cancha en un clic, rankings y torneos. En la tienda española: 3,9 sobre 767 valoraciones y clasificación de edad 4+ ([S5](https://apps.apple.com/es/app/timpik-jugar-padel-y-futbol/id433422542)).
- Versión 2025, según un comunicado de la empresa recogido por la prensa: más de 100.000 descargas y unos 20.000 usuarios activos recurrentes; si falta gente la app busca jugadores de nivel parecido; niveles principiante, intermedio y avanzado; monedero virtual para pagar reservas; grupos con calendario, disponibilidad y foro. No menciona ningún sistema de ausencias ([S6](https://elyex.com/asi-es-timpik-2-0-la-aplicacion-para-organizar-partidos-de-padel-futbol-y-mas-con-amigos/)).
- Versión 2012 (nota vieja, puede haber cambiado): evento público con lugar, hora y costo; los jugadores piden participar y hay lista de espera si está lleno; mensajes privados y foro por evento; el organizador puede sancionar a quien cancela a último momento o no va, y la sanción queda en el perfil; sin estrellas ni reseñas ([S7](https://www.xatakandroid.com/aplicaciones-android/aplicaciones-android-deportes-timpik)).
- [NO VERIFICADO]: una "alarma" de partidos según ciudad, deporte y fecha apareció solo en un resumen del buscador sobre artículos viejos; no la confirmé abriendo una fuente.

### 3.4 Playtomic — Open Matches (pádel y tenis; no hay fútbol)

- Se juega como individuo: elegís un partido abierto o creás uno y el sistema te empareja por nivel. Hace falta cuenta. Al crear se elige competitivo o amistoso y género; después no se puede cambiar el tipo ([S8](https://playerhelp.playtomic.com/hc/en-gb/articles/19832151055121-How-to-sign-up-for-an-Open-Match)).
- Entrada: se paga online (tarjeta o monedero) y el lugar queda confirmado recién al pagar; se puede pagar la parte de un compañero para asegurarle el lugar. Si tu nivel queda fuera del rango, pedís lugar y tienen que aceptar todos los que ya están ([S8](https://playerhelp.playtomic.com/hc/en-gb/articles/19832151055121-How-to-sign-up-for-an-Open-Match), [S9](https://helpmanager.playtomic.com/hc/en-gb/articles/20535035123473-How-to-configure-Open-Matches-at-your-Club)).
- Nivel: cuestionario inicial; solo los partidos competitivos lo mueven, según resultado, rivales y compañero, más un puntaje de fiabilidad que describe cuán asentado está tu nivel. El artículo no habla de cancelaciones ni ausencias ([S10](https://playerhelp.playtomic.com/hc/en-gb/articles/43310980754193-How-the-Playtomic-level-system-works)).
- Lado del club: se activa por deporte; el club define singles o dobles y el rango de nivel como desvíos respecto del primer jugador; los partidos se generan solos en todos los horarios libres. La cancha no se bloquea al crear: se confirma al cumplirse umbrales o plazos, o cuando un admin la asigna a mano. El precio por jugador puede variar según la cancha asignada. Si el partido no se completa, o te bajás, el reembolso es inmediato; qué pasa con la cancha, el artículo no lo dice. Los ajustes valen para los partidos que lanza el club, no para los que crean los jugadores ([S9](https://helpmanager.playtomic.com/hc/en-gb/articles/20535035123473-How-to-configure-Open-Matches-at-your-Club)).
- No figuran en lo leído: chat entre jugadores, alertas, edad mínima.

### 3.5 CanchaFija (Argentina)

- Software de gestión de complejos. "Falta Uno" aparece como sección del sitio (menú Comunidad) para encontrar partidos que necesitan jugadores ([S16](https://canchafija.com.ar)).
- Cómo publica el organizador, cómo se suma un jugador, alertas, contacto, nivel y plata: [NO VERIFICADO]; ni el sitio ni el buscador lo explican. La app Android se describe con notificaciones, ubicación, reserva rápida y pago, sin atarlos a Falta Uno ([S16](https://canchafija.com.ar)).
- El relevamiento interno lo lista como módulo de su suite y avisa que el sitio responde 403 a datacenters ([S19]). Conviene probarlo a mano desde Argentina.

### 3.6 Dónde Juego (Argentina)

- Plataforma de reservas para jugadores y dueños (fútbol 5 y pádel según el relevamiento interno de julio, [S20]). El sitio habla de reservar y armar partido, pero no explica la convocatoria abierta ([S14](https://dondejuegoapp.com)).
- Lo que sí dice: el complejo puede sancionar a un jugador que no se presentó y recibe una alerta cuando ese jugador vuelve a reservar en el mismo complejo; la plataforma verifica el teléfono de los jugadores ([S14](https://dondejuegoapp.com)).
- Interno, sin verificar en público: convocatoria abierta, programa de profesores y más de 100K instalaciones en Android con 4,9 sobre 3.270 reseñas ([S19]).
- Es la única fuente que muestra la sanción por no presentarse como decisión del complejo y no de otros jugadores.

### 3.7 ATC Sports (Argentina / LatAm)

- El sitio anuncia, para organizadores, que los jugadores pueden sumarse a partidos existentes o abrir el propio, con un enlace a partidos disponibles; no explica nivel, alertas, contacto ni precio ([S17](https://atcsports.io)).
- Reservas: si se falta, cargo al medio de pago o, sin medio de pago, bloqueo para reservar la semana siguiente; no aclara si aplica a partidos abiertos ([S17](https://atcsports.io)).
- Escala de la plataforma (no del módulo de partidos): más de 2 millones de usuarios activos, más de 1.000 clubes, unas 230.000 reservas por mes y 10 países ([S17](https://clubes.atcsports.io)).
- Interno (2026-09-01): sistema de reputación de usuarios, "Falta 1" con nivel tipo ELO y módulo de partidos creciendo 50% por mes ([S19]). No lo pude confirmar en una fuente pública: [NO VERIFICADO].

### 3.8 Don Potrero (Argentina, Uruguay, Costa Rica)

- Gestión de turnos con capa social: el complejo ve la lista de jugadores que lo siguen y la usa para contactar interesados cuando a un partido le falta gente; los seguidores ayudan a llenar turnos vacíos o a punto de caerse. Cómo se les avisa no está descrito ([S15](https://donpotrero.com/gestion-de-turnos-y-reservas-canchas-y-clubes-de-futbol)).
- Los partidos los crean el complejo o sus administradores para atraer jugadores. En el plan Pro hay además una lista de equipos que eligieron el complejo como sede; ambas listas quedan sujetas a las reglas de privacidad y comunidad de la plataforma ([S15](https://donpotrero.com/gestion-de-turnos-y-reservas-canchas-y-clubes-de-futbol)).
- El perfil público tiene muro de comentarios; no hay reputación ni sanciones por ausencia; el complejo define tiempos mínimos para reservar y cancelar ([S15](https://donpotrero.com/gestion-de-turnos-y-reservas-canchas-y-clubes-de-futbol)).
- Interno: plan Amateur gratis para el complejo y presencia declarada en AR, UY y CR ([S20]).

### 3.9 Wannaplay (nota de 2023; vigencia [NO VERIFICADO])

- Modelo "la plataforma organiza": partidos de fútbol 5 u 11 de 60 minutos con cancha, pecheras, pelotas y un organizador que además arbitra y asigna números para rotar el arco cada 4 o 5 minutos ([S13](https://culturageek.com.ar/aplicacion-wannaplay-para-organizar-y-sumarte-a-partidos-de-futbol-cerca-de-tu-zona/)).
- El jugador ve partidos de su zona y el costo de cada uno (la nota no da montos). Perfil con nombre, foto, localidad y posición habitual. Mayores de 18, salvo partidos femeninos ([S13](https://culturageek.com.ar/aplicacion-wannaplay-para-organizar-y-sumarte-a-partidos-de-futbol-cerca-de-tu-zona/)).
- Sin sistema de nivel: el organizador reordena equipos durante el partido. Solo hay normas de conducta (puntualidad, sin violencia, sin barridas, pasar la pelota) ([S13](https://culturageek.com.ar/aplicacion-wannaplay-para-organizar-y-sumarte-a-partidos-de-futbol-cerca-de-tu-zona/)).
- No figuran: cómo se suma, chat, alertas, país ni ciudades.

### 3.10 FútbolYa (Argentina, CABA, 2026)

- El jugador elige un partido por zona, día y horario y reserva su lugar; la app lo organiza, lo publica y coordina la cancha en complejos asociados ([S12](https://www.iproup.com/startups/68586-chau-grupos-de-whatsapp-crean-una-app-para-organizar-partidos-de-futbol)).
- Busca reemplazar los grupos de WhatsApp; no se menciona chat propio ([S12](https://www.iproup.com/startups/68586-chau-grupos-de-whatsapp-crean-una-app-para-organizar-partidos-de-futbol)).
- Compromiso: reputación que premia la asistencia regular, y el jugador confirma su presencia con geolocalización al llegar. Sanciones no figuran ([S12](https://www.iproup.com/startups/68586-chau-grupos-de-whatsapp-crean-una-app-para-organizar-partidos-de-futbol)).
- Plata: ingreso principal por pago por partido (monto no publicado); suscripción con créditos para jugar y acuerdos con marcas en desarrollo ([S12](https://www.iproup.com/startups/68586-chau-grupos-de-whatsapp-crean-una-app-para-organizar-partidos-de-futbol)).
- Arranque: CABA con complejos asociados y plan de ir al AMBA; menos de 500 dólares de inversión inicial, casi todo en difusión; sin cifras de usuarios ([S12](https://www.iproup.com/startups/68586-chau-grupos-de-whatsapp-crean-una-app-para-organizar-partidos-de-futbol)).

### 3.11 Mejenga (iOS)

- Permite publicar tu disponibilidad para que otros equipos te encuentren y buscar jugadores para completar el propio. Pestaña Explorar con mapa, chat y comentarios, notificaciones de comentarios nuevos, torneos y líderes de tabla, votación de MVP, estadísticas, rankings y logros ([S18](https://apps.apple.com/app/mejenga/id6757822337)).
- Gratis con suscripción Premium dentro de la app (entre 4,99 y 14,99 dólares aprox.), clasificación de edad 13+, sin valoraciones suficientes para mostrar puntaje ([S18](https://apps.apple.com/app/mejenga/id6757822337)).
- No figuran: país de foco, cómo se acepta un pedido y reglas de bajas. Es el único caso donde el jugador publica su disponibilidad (el jugador ofrece, en vez de que se publique un faltante).

### 3.12 Arqueros Ya (Buenos Aires, Rosario, Córdoba, San Luis)

- Plataforma para que equipos amateurs contraten un arquero para amistosos o torneos de fútbol 5, 7, 8, 9 u 11; los arqueros cobran por jugar ([S11](https://www.lacapital.com.ar/ovacion/arqueros-ya-la-plataforma-que-llego-rosario-salvar-los-equipos-amateurs-n10255205.html)).
- Arranque por Instagram: unos 600 arqueros anotados en dos días y más de 1.700 después; los primeros pedidos llegaron por Instagram; primer caso fuera de Buenos Aires el 15 de abril de 2026 en Rosario, luego Córdoba y San Luis ([S11](https://www.lacapital.com.ar/ovacion/arqueros-ya-la-plataforma-que-llego-rosario-salvar-los-equipos-amateurs-n10255205.html)).
- Confianza: los arqueros suben un perfil en video para que el equipo juzgue el nivel, hay reseñas y tienen que ser mayores de 18 ([S11](https://www.lacapital.com.ar/ovacion/arqueros-ya-la-plataforma-que-llego-rosario-salvar-los-equipos-amateurs-n10255205.html)).
- La app propia está en desarrollo (primero acceso para arqueros, después para clientes) para que se contacten directo ([S11](https://www.lacapital.com.ar/ovacion/arqueros-ya-la-plataforma-que-llego-rosario-salvar-los-equipos-amateurs-n10255205.html)). No figuran: precio por partido, forma de pago, política de ausencias ni cómo se confirma un pedido.
- Lectura: la demanda de arqueros existe y se juntó en días. Cobrarle al equipo y pagarle al arquero es justo lo que TurnoGol no hace (ver 4.2).

### 3.13 Sin información pública útil

- Nos Falta Uno (`nosfalta1.com.ar`): el sitio no se pudo abrir (certificado TLS que no corresponde al dominio). El relevamiento interno cita unas 5.000 descargas y 1.600 activos desde un fragmento sin fecha: [NO VERIFICADO] ([S20]).
- hayPartido (`haypartido.com.ar`): el buscador no devolvió nada. El relevamiento interno lo registra como marketplace de doble cara con cero lugares en Luján, Mercedes y Pilar ([S19]).
- Matchat (2019) y Bafa (Guatemala): según el relevamiento interno, probablemente inactiva y sin foco argentino ([S20]).
- Aparecieron en resultados de búsqueda y no los relevé: TuCancha (Tucumán, nota de 2018), deball, SLFutbol, Equipo completo (Chile), goTeam!.

## 4. Qué copiar y qué evitar en RIVAL

Ya decidido en F4 y tomado acá como dado [S21]: las publicaciones no dependen de la reserva (llevan un sello si salen de una reserva hecha en TurnoGol), el contacto es por WhatsApp recién cuando el organizador acepta al que se suma, no hay chat propio, no hay puntajes entre personas, rankings ni texto libre sobre otras personas (Ley 25.326), no hay precios y todo va detrás del flag `rival`. Restricciones del producto que se mantienen: densidad baja (un complejo, una ciudad), WhatsApp como canal natural, +18, sin billetera ni pagos entre jugadores. Lo marcado como "propuesta" es diseño propio: ninguna plataforma relevada lo documenta.

### 4.1 Patrones que conviene copiar

1. **Qué hacer con las publicaciones sin cancha confirmada.** Falta Uno exige que el organizador tenga la cancha reservada antes de publicar [S1]; Wannaplay y FútbolYa ponen ellos la cancha [S13][S12]; Playtomic crea el partido sin cancha y la confirma cuando se cumplen umbrales o plazos [S9]; en Juol no figura ningún requisito [S4]. F4 eligió publicaciones independientes de la reserva, con un sello cuando vienen de una reserva en TurnoGol [S21]. El benchmark no tiene evidencia sobre cuál enfoque funciona mejor, pero sí muestra que el riesgo (partidos sin cancha) es el que Falta Uno evitó exigiendo la reserva. Propuesta: que el sello cubra un campo cerrado (cancha confirmada / la estoy buscando) y que toda publicación venza sola a la hora del partido.
2. **Pedido estructurado y cerrado.** Cantidad que falta + posición (arquero, defensor, mediocampista, delantero, cualquiera) + nivel del partido + género si aplica: es lo que publica Falta Uno [S1]. Cero texto libre, igual que la regla vigente del repo para etiquetas de personas (enum cerrado).
3. **Audiencia de alertas = jugadores que ya conocen al complejo, no "jugadores cercanos".** Falta Uno avisa por cercanía a la cancha [S1], pero con un solo complejo en Luján la cercanía no segmenta. Don Potrero propone seguir al complejo [S15] y Mejenga que el jugador publique su disponibilidad [S18]. F4 prevé que la publicación le llegue a los jugadores disponibles [S21]; qué significa "disponible" lo tiene que definir la spec. Propuesta: opt-in explícito ("avisame cuando falte alguien en el complejo") con filtros que declara el jugador (posición, franja horaria, nivel), en vez de avisarle a todos. Sobre la hipótesis del dueño de que "se hace en otras plataformas": se confirma en Falta Uno por cercanía; por día, posición o nivel no encontré evidencia pública en ninguna.
4. **Pocos escalones de nivel, declarados.** Falta Uno (principiante a avanzado [S1]) y Timpik (3 escalones [S6]) usan niveles gruesos. El modelo de Playtomic (numérico, necesita cuestionario inicial, resultados cargados y puntaje de fiabilidad [S10]) está pensado para pádel con marcador; en fútbol amateur habría que pedirle a alguien que cargue el resultado de cada partido. Tres escalones que sirvan de aviso y no de bloqueo.
5. **Confirmar primero, WhatsApp después.** Juol: el jugador confirma asistencia y recién ahí coordina por WhatsApp con el organizador [S4]. F4 ya fijó una variante más cerrada: el contacto sale recién cuando el organizador acepta al que se suma, sin chat propio [S21]. Propuesta con Ley 25.326: el teléfono nunca se muestra; al ser aceptado, el jugador ve un botón "escribirle al organizador" que abre `wa.me`, y solo si el organizador aceptó compartir su contacto para ESA publicación (consentimiento por publicación, revocable). Coincide con la estrategia ya escrita de integrarse a WhatsApp con links `wa.me` y textos pre-armados en vez de competir [S22]. Evita un chat propio con moderación.
6. **Sanción objetiva, privada y decidida por el complejo.** Dónde Juego: el complejo sanciona y recibe una alerta cuando el jugador reincide en ese complejo [S14]. Es coherente con el mecanismo que ya tiene TurnoGol (softban por reincidencia vía `tenant_player_bans`, según el `CLAUDE.md` del repo). La lógica de no-show ya vive del lado del complejo (`handleNoShow`, según el mismo `CLAUDE.md`); no hace falta geolocalización ni calificaciones entre jugadores.
7. **Arranque en frío.** F4 arranca por el partido del grupo, que sirve aunque no haya nadie más [S21]; el benchmark no encontró evidencia pública sobre cuántos partidos entre desconocidos se completan. Para el tablón, las plataformas siembran con oferta propia: el complejo y sus administradores crean partidos (Don Potrero [S15]), la plataforma los organiza (Wannaplay [S13], FútbolYa [S12]) o se junta oferta por redes antes de abrir (Arqueros Ya, unos 600 arqueros en dos días [S11]). Propuesta para el piloto en Luján: el complejo puede publicar faltantes en turnos con huecos y los jugadores que ya reservaron son la primera audiencia. Mientras no haya masa, estado vacío honesto (ver 4.2.8).
8. **Arquero como atajo de primer nivel.** Arqueros Ya juntó unos 600 arqueros en dos días [S11]: la demanda latente es real. Propuesta: "arquero" como posición destacada y como filtro de alerta, sin cobro entre las partes.
9. **+18 declarado y registrado.** Falta Uno 18+ [S1][S2], Arqueros Ya mayores de 18 [S11], Wannaplay mayores de 18 [S13]. El `CLAUDE.md` del repo remite al ADR-012 para el +18.

### 4.2 Anti-patrones

1. **Seguimiento y publicidad con contacto y ubicación.** La ficha de Falta Uno declara seguimiento entre apps con ubicación, contacto e identificadores, y publicidad [S2]. Choca con el régimen de consentimiento de la Ley 25.326. En RIVAL: analítica sin identificadores de contacto y sin SDK de publicidad.
2. **Texto libre entre personas**: foro por evento y mensajes privados en Timpik [S6][S7], muro de comentarios en el perfil de Don Potrero [S15], chat y comentarios en Mejenga [S18]. Choca con la regla de no texto libre sobre personas (un foro o un muro permiten escribir sobre terceros), y además obliga a tener denuncias y moderación que un piloto con un complejo difícilmente pueda sostener.
3. **Reputación pública o sanciones visibles en el perfil.** Timpik (2012) deja la sanción del organizador en el perfil [S7]; Falta Uno menciona visibilidad de ausentes y restringidos sin aclarar para quién [S2]. Riesgo de escrache y de revancha entre organizador y jugador, y son datos de conducta de una persona. Mejor contadores privados, con efecto solo para el afectado y el complejo. F4 ya excluye los puntajes entre personas [S21], y el score de confiabilidad entre complejos ya se había descartado por riesgo de Ley 25.326 [S22].
4. **Aprobación de todos los presentes para entrar** (Playtomic, cuando el nivel queda fuera de rango [S8]). Funciona con 4 jugadores en pádel; con 10 en fútbol traba el partido. Inferencia mía: un solo decisor (el organizador) o aceptación automática dentro del nivel. F4 ya va con aceptación del organizador solamente [S21].
5. **Plata entre jugadores o billetera**: Playtomic cobra online y deja pagar la parte de otro [S8][S9], Timpik 2.0 tiene monedero [S6], FútbolYa cobra por partido y arma créditos [S12], Mejenga vende Premium [S18], Arqueros Ya intermedia el pago al arquero [S11]. TurnoGol no tiene billetera ni pagos entre jugadores y F4 va sin precios [S21]: RIVAL no mueve ni muestra plata.
6. **Geolocalización del jugador para validar asistencia** (FútbolYa [S12]). Ubicación precisa de personas para algo que el complejo ya resuelve con su propio registro de no-show.
7. **Edad débil**: clasificaciones 4+ (Timpik [S5]) y 13+ (Mejenga [S18]) no sirven para un +18; el alta tiene que pedir y registrar la confirmación de edad.
8. **Prometer densidad que no hay.** Falta Uno tiene 15 valoraciones en iOS Argentina [S2], el relevamiento interno encontró cero lugares de hayPartido en Luján [S19] y nadie publica la tasa de partidos completados. Mostrar "N jugadores disponibles" con un N chico o inventado es mentir; mejor un estado vacío honesto ("todavía no hay nadie anotado, te avisamos").

### 4.3 Insumos para la spec de F4

F4 deja para la spec cinco cosas: campos de una publicación, moderación, alertas, qué se muestra del organizador y textos legales [S21]. Qué aporta el benchmark a cada una:

- **Campos de una publicación.** Lo que publican las plataformas con evidencia: cantidad que falta, posiciones y género (Falta Uno [S1]); ubicación de la cancha, día y hora (Juol [S4]); lugar, hora y costo (Timpik en 2012 [S7]). Para el nivel, 3 escalones (Falta Uno [S1], Timpik [S6]). Para "busco arquero" y "busco rival" no hay un modelo de campos documentado.
- **Moderación.** Ninguna fuente describe cómo se denuncia o se retira una publicación [NO VERIFICADO]. Lo que sí documentan: mayoría de edad (Falta Uno [S1][S2], Wannaplay [S13], Arqueros Ya [S11]), verificación de teléfono (Falta Uno [S2], Dónde Juego [S14]) y sanción decidida por el complejo (Dónde Juego [S14]).
- **Alertas.** Solo Falta Uno documenta alertas, por cercanía a la cancha [S1]. Los demás son de tipo "el jugador mira" (Mejenga: el jugador publica su disponibilidad [S18]) o manuales (Don Potrero: el complejo contacta a sus seguidores [S15]). La segmentación por posición, franja y nivel (4.1.3) es propuesta propia.
- **Qué se muestra del organizador.** Wannaplay muestra nombre, foto, localidad y posición habitual [S13], parecido al perfil mínimo de F4 [S21]. Timpik en 2012 mostraba además participaciones y sanciones [S7]: evitarlo (4.2.3). Falta Uno suma teléfono verificado [S2].
- **Textos legales.** No encontré los términos ni la política de privacidad de ninguna plataforma. Lo único público es la etiqueta de privacidad de Falta Uno [S2], que sirve de anti-ejemplo (4.2.1).

## 5. Preguntas abiertas

Las marcadas REQUIERE INPUT son decisiones del dueño para la spec de F4 [S21]; las demás son huecos de información del benchmark.

1. **REQUIERE INPUT — ¿Qué mide el éxito del piloto en Luján y cuál es el umbral de reversión?** F4 fija la revisión a los 30 días con publicaciones creadas, personas sumadas y partidos completados, y deja el umbral para la spec [S21]. El benchmark no aporta línea de base: nadie publica la tasa de publicaciones completadas ni el tiempo hasta completarse (ya figuraba como dato faltante en el relevamiento interno [S19]). Propuesta: porcentaje de publicaciones completas antes del partido y minutos hasta completarse, instrumentado desde el día 1.
2. **¿Qué significa "disponible" para las alertas y qué segmentación convierte?** Solo Falta Uno documenta alertas (por cercanía [S1]). ¿Opt-in con filtros (posición, franja, nivel) o seguir al complejo y avisar a todos? ¿Cuántos avisos por semana antes de que molesten? ¿Horario silencioso también para jugadores (hoy rige para el admin)?
3. **¿Cómo se expone el contacto del organizador sin violar la Ley 25.326?** F4 ya fija que el contacto sale recién cuando el organizador acepta [S21]. Falta definir el consentimiento (propuesto: por publicación y revocable) y qué ve el organizador del que pide sumarse antes de aceptar (foto, posición y zona; nunca el teléfono). Ninguna fuente documenta cómo manejan el teléfono (los términos de Falta Uno: [NO VERIFICADO]). Pide criterio legal.
4. **REQUIERE INPUT — ¿Qué pasa cuando alguien se baja?** Ventana, consecuencia, y si el lugar se reabre y se vuelve a avisar. No hay regla pública en ninguna plataforma. ¿La baja de RIVAL cuenta para el softban existente o es otro contador?
5. **REQUIERE INPUT — ¿Qué pasa con las publicaciones sin cancha confirmada?** Falta Uno las evita exigiendo la reserva [S1]; F4 las permite, con sello cuando hay reserva en TurnoGol [S21]. Falta definir qué verifica el sello, si hay un campo cerrado de estado de la cancha y cuándo vence una publicación.
6. **¿Cómo se denuncia o se retira una publicación abusiva?** Ninguna fuente describe mecanismos de denuncia o moderación [NO VERIFICADO]. F4 lo deja para la spec.
7. **REQUIERE INPUT — ¿Nivel declarado (3 escalones) o inferido del historial de reservas?** No hay evidencia sobre cuál funciona.
8. **"Busco rival" (equipo contra equipo).** F4 lo incluye en el tablón, pero no encontré una mecánica de referencia. Lo más cercano es Mejenga (disponibilidad publicada [S18]); un resumen del buscador sobre una ficha de startup dice que ATC lo tiene como próximo foco, y esa fuente no la abrí [NO VERIFICADO] [S23]. Habrá que diseñarlo sin modelo: qué necesita saber un equipo para aceptar a un rival (formato de cancha, nivel, día y hora, zona).
9. **Arquero: ¿posición dentro del mismo flujo o servicio aparte?** El modelo de Arqueros Ya implica cobro e intermediación [S11], incompatible con lo que F4 deja afuera (sin precios, sin billetera ni pagos entre jugadores). Falta confirmar que "busco arquero" sea una publicación más del tablón.
10. **Cobertura del "partido del grupo".** El benchmark casi no cubre confirmaciones dentro de un grupo cerrado (solo los grupos de Timpik [S6] y los equipos de Mejenga [S18]). Si hace falta referencia para ese flujo (agendas de equipo, confirmar en un toque), es otro relevamiento.
11. **Prueba manual pendiente.** No pude abrir los flujos de Falta Uno, CanchaFija (Falta Uno), Dónde Juego (convocatoria) ni ATC (Falta 1). Una prueba de 30 a 60 minutos por Lazar desde Argentina (las cuentas las crea él) cerraría los `[NO VERIFICADO]` de las tablas.
12. **Dato local que falta.** Cuántos "me falta uno" pasan hoy por semana en el complejo piloto (por WhatsApp o en la puerta) y cuántos turnos se caen por eso. Es el único dato de densidad real disponible.

## 6. Fuentes

Todas consultadas el 2026-10-14. Las notas de prensa y las fichas de tienda son declaraciones de las propias empresas o de periodistas, no mediciones.

- **S1** — iProUP, nota sobre Falta Uno (15/06/2025): https://www.iproup.com/startups/57055-son-argentinos-y-crearon-un-tinder-para-sumar-jugadores-de-futbol
- **S2** — App Store Argentina, ficha de Falta Uno (v4.9.2, desarrollador Pablo Barrea): https://apps.apple.com/ar/app/falta-uno/id6738060775
- **S3** — Ecosistema Startup, nota del 15/06/2025 sobre una startup argentina de partidos (no nombra la app): https://ecosistemastartup.com/?p=36948
- **S4** — Infonegocios Paraguay, nota sobre Juol (30/07/2026): https://infonegocios.com.py/conosur/se-termino-el-falta-uno-juol-la-app-paraguaya-que-conecta-jugadores-para-completar-partidos-de-futbol
- **S5** — App Store España, ficha de Timpik: https://apps.apple.com/es/app/timpik-jugar-padel-y-futbol/id433422542
- **S6** — elyex, nota sobre Timpik 2.0 (21/03/2025, basada en comunicado de la empresa): https://elyex.com/asi-es-timpik-2-0-la-aplicacion-para-organizar-partidos-de-padel-futbol-y-mas-con-amigos/
- **S7** — Xataka Android, nota sobre Timpik (21/05/2012): https://www.xatakandroid.com/aplicaciones-android/aplicaciones-android-deportes-timpik
- **S8** — Playtomic, ayuda al jugador: cómo anotarse a un Open Match: https://playerhelp.playtomic.com/hc/en-gb/articles/19832151055121-How-to-sign-up-for-an-Open-Match (leído por la versión JSON del centro de ayuda)
- **S9** — Playtomic, ayuda al club: cómo configurar Open Matches: https://helpmanager.playtomic.com/hc/en-gb/articles/20535035123473-How-to-configure-Open-Matches-at-your-Club (leído por la versión JSON)
- **S10** — Playtomic, ayuda al jugador: cómo funciona el sistema de nivel: https://playerhelp.playtomic.com/hc/en-gb/articles/43310980754193-How-the-Playtomic-level-system-works (leído por la versión JSON)
- **S11** — La Capital (Rosario), nota sobre Arqueros Ya (20/04/2026): https://www.lacapital.com.ar/ovacion/arqueros-ya-la-plataforma-que-llego-rosario-salvar-los-equipos-amateurs-n10255205.html
- **S12** — iProUP, nota sobre FútbolYa (07/06/2026): https://www.iproup.com/startups/68586-chau-grupos-de-whatsapp-crean-una-app-para-organizar-partidos-de-futbol
- **S13** — Cultura Geek, nota sobre Wannaplay (22/08/2023): https://culturageek.com.ar/aplicacion-wannaplay-para-organizar-y-sumarte-a-partidos-de-futbol-cerca-de-tu-zona/
- **S14** — Dónde Juego, sitio oficial: https://dondejuegoapp.com
- **S15** — Don Potrero, página de gestión de turnos: https://donpotrero.com/gestion-de-turnos-y-reservas-canchas-y-clubes-de-futbol
- **S16** — CanchaFija, sitio oficial (menú y app Android): https://canchafija.com.ar ; resultados dentro del dominio: https://canchafija.com.ar/canchas-de-futbol y https://canchafija.com.ar/software-para-clubes-deportivos
- **S17** — ATC Sports, sitio oficial y sitio de clubes: https://atcsports.io y https://clubes.atcsports.io
- **S18** — App Store, ficha de Mejenga (v2.6.7, desarrollador Carlos Villalobos Salas): https://apps.apple.com/app/mejenga/id6757822337
- **S19** — Interno: `docs/gtm/research/2026-09-01-competidores-v2.md` (líneas 28 a 50, 108, 120 y 211)
- **S20** — Interno: `docs/gtm/research/2026-07-18-competidores.md` (líneas 111 a 133 y 163 a 170)
- **S21** — Interno: [`docs/decisions/2026-10-14-foco-jugador-rival.md`](../decisions/2026-10-14-foco-jugador-rival.md), F4 (RIVAL v1) y F3 (sin precios)
- **S22** — Interno: `docs/planning/posible_nuevas_features_turnogol_fable_5.md` (§5h: lo descartado, incluido el score de confiabilidad entre complejos; línea 292: integrarse a WhatsApp, no competir)
- **S23** — Resultado de búsqueda que no abrí: https://www.descubre.vc/alquila-tu-cancha (ficha de ATC como startup; el resumen del buscador menciona la búsqueda de contrincantes como próximo foco)
