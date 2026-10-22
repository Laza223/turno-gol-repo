# RIVAL v1: spec

**Fecha:** 2026-10-22 · **Estado:** aprobada por el dueño. La implementación va por fases (§13).

**Decisiones de origen:** F4 de [`2026-10-14-foco-jugador-rival.md`](../../decisions/2026-10-14-foco-jugador-rival.md), [`2026-10-22-rival-v1.md`](../../decisions/2026-10-22-rival-v1.md) y [`2026-10-22-se-levanta-el-freeze.md`](../../decisions/2026-10-22-se-levanta-el-freeze.md).

**Insumos:**
- [`2026-10-rival-benchmark.md`](../../planning/2026-10-rival-benchmark.md): la mecánica.
- [`2026-10-rival-ideas.md`](../../planning/2026-10-rival-ideas.md): las ideas y el roadmap.

**Autoridad visual:** `DESIGN.md`, en La Previa.

## 1. Qué es

RIVAL es la sección de comunidad del portal del jugador: "RIVAL powered by TurnoGol". Tiene dos caras sobre **un solo modelo de partido**:

- **El partido del grupo.** El organizador arma el partido y pasa un link al WhatsApp del grupo. Cada uno confirma en un toque y todos ven cuántos faltan.
- **El tablón.** El organizador publica ese mismo partido para que se sumen desconocidos. Hay tres tipos: "Faltan N" (o "Falta 1"), "Se busca arquero" y "Busca rival".

**Objetivo de v1:** que un grupo complete su partido más rápido que con la encuesta de WhatsApp, y que cada link compartido traiga jugadores nuevos a TurnoGol. No hay umbral de reversión; las métricas (§11) eligen la próxima ola.

**Lo que WhatsApp no tiene y RIVAL sí:** cupo duro, banco con promoción automática, "Me bajo" que libera el lugar, cancha real en un complejo y "Repetir el partido".

## 2. Vocabulario de pantalla

| Concepto | En pantalla |
|---|---|
| La sección | RIVAL |
| El partido del grupo | el partido |
| El link | "el link del partido" |
| Confirmar | "Voy" → "Estoy adentro" |
| Lista de espera | El banco |
| Partido lleno | "¡Estamos los N!" / "Se juega" |
| Partido cancelado | "Se cayó" |
| Tablón | El tablón |
| Faltan jugadores | "Faltan 3" / "Falta 1" |
| Falta arquero | "Se busca arquero" |
| Busca equipo rival | "Busca rival" |
| Posición comodín | "Donde me pongan" |

No se usan "Falta Uno" ni "Nos Falta Uno" como nombres: son marcas de la competencia (benchmark S1 y S2).

## 3. El partido: campos

Ningún campo es texto libre y ninguno es un precio.

| Campo | Valores | Regla |
|---|---|---|
| Complejo | Lista de complejos activos de TurnoGol, con el mismo filtro de visibilidad que `searchPublicTenants` | Obligatorio. Desde una reserva viene precargado y bloqueado |
| Día y hora de inicio | De hoy a 7 días adelante, en punto o y media | Se elige en hora argentina y se guarda como `starts_at` (instante UTC) |
| Formato | Fútbol 4 a Fútbol 11 (`FORMAT_OPTIONS`, `src/components/public/courtFacets.ts`) | Desde una reserva sale de la cancha |
| Cuántos juegan | Por defecto, el formato × 2. Se puede bajar a partir de 2 y subir hasta 22 | Incluye al organizador. En "Busca rival" es el formato: tu equipo, sin contar al rival |
| Nivel | Tranqui · Parejo · Picante | Obligatorio. Lo declara el organizador para el partido |
| Cancha | Sello "Reservada en TurnoGol" o la casilla "Ya tengo la cancha" | Al crear, se vincula `booking_id` si el organizador tiene una reserva `confirmed` en ese complejo cuyo `starts_at` coincide. El sello **no se guarda**: se deriva en cada lectura del estado actual de esa reserva (sigue `confirmed` y con el mismo `starts_at`). Si la reserva se cancela o se reprograma, el sello baja solo y al organizador le llega el mail "Tu reserva se cayó: confirmá que tenés cancha o cancelá el partido". Sin reserva, la casilla es obligatoria. No hay partidos sin cancha |
| Tablón | Apagado (solo el grupo) · "Buscamos jugadores" · "Buscamos rival" | Con "Buscamos jugadores" se elige posición: "Donde me pongan" o "Arquero". "Arquero" se publica como "Se busca arquero" |
| WhatsApp del organizador | Teléfono argentino | Solo si va al tablón. Se precarga de `players.phone` y se normaliza con `toWhatsappDigits` (`src/lib/whatsapp.ts`). Lleva consentimiento explícito: "Lo ve solo a quien aceptes en este partido" |

**Topes:**
- hasta 3 partidos activos por organizador, contando los que no empezaron y no se cancelaron;
- hasta 5 pedidos pendientes por jugador en el tablón;
- rate limit en crear, pedir y denunciar.

**Vencimiento.** Un partido vence solo cuando llega `starts_at`. Desde ese momento no admite altas, bajas ni pedidos, y sale del tablón. Nunca se reabre.

**Edición.** En v1 no se edita nada. Para cambiar algo se cancela y se arma otro; "Repetir" precarga los mismos datos.

## 4. Estados

**Partido (`rival_matches.status`):**
- `open` → `canceled`. Lo cancela el organizador, o pasa por ARCO del organizador.
- "Vencido" no es un estado: se deriva de `starts_at <= now()`.
- "Lleno" tampoco: se deriva de `confirmed_count = capacity`. `filled_at` guarda la primera vez que se llenó.
- `hidden_at` marca un partido oculto por moderación, que no se ve en el tablón ni por link.

**Participante (`rival_participants.status`):**

| De → a | Quién | Cuándo |
|---|---|---|
| — → `confirmed` | El jugador, por invitación (link) | Con cupo |
| — → `bench` | El jugador, por invitación | Sin cupo |
| — → `requested` | El jugador, desde el tablón | Partido publicado, menos de 5 pedidos pendientes suyos |
| `requested` → `confirmed` | El organizador | Con cupo (si no hay, el botón Aceptar no aparece) |
| `requested` → `declined` | El organizador | — |
| `bench` → `confirmed` | El sistema | Cuando se libera un lugar entra el primero del banco, en orden de llegada y en la misma transacción que la baja |
| `confirmed` / `bench` / `requested` → `left` | El jugador | Antes de `starts_at` |
| `confirmed` / `bench` → `removed` | El organizador | Antes de `starts_at` |

- El organizador entra como fila `confirmed` automáticamente y no puede bajarse: para irse, cancela el partido.
- Nadie se promueve a sí mismo.
- Un pedido del tablón nunca llega a `confirmed` sin el organizador.
- `confirmed_at` no se pisa al bajarse, para medir "personas que se sumaron".
- **"Busca rival":** el pedido es del capitán del otro equipo y va en `rival_participants` con `role = 'rival_captain'` (el resto es `role = 'player'`). Esa fila **no cuenta para el cupo**: `confirmed_count` y `filled_at` cuentan solo `role = 'player'`. Al aceptar al capitán se cierra la búsqueda (`seeking` pasa a NULL) y el partido sale del tablón, aunque a tu equipo le sigan faltando jugadores: esos se suman por el link del grupo. Hay un solo capitán rival `confirmed` por partido (índice único parcial). Si el capitán se baja o lo sacan, el organizador puede volver a publicar. El capitán aparece como "Equipo rival: [nombre corto]".

## 5. Flujos

### 5.1 Armar (`/rival/nuevo`)

- **Entradas:**
  - "Armar un partido" en `/rival`;
  - "Armar el partido" como acción secundaria en la próxima reserva de Mis reservas y en la pantalla de reserva confirmada (`?reserva=<id>`; "Avisarle al grupo" sigue como está);
  - "Repetir" (`?desde=<id>`).
- **Formulario:** de una sola pantalla y pensado primero para 390 px. Orden: complejo, día, hora, formato, cuántos, nivel, cancha y tablón. Si el tablón va encendido, se suma el WhatsApp.
- **La primera vez:** pasa antes por la bienvenida RIVAL (§7).
- **Al crear:** vuelve a la vista del organizador (§5.3) con el aviso "Listo. Ahora pasale el link al grupo."

### 5.2 Voy, por link (`/rival/p/[code]`)

- **Sin sesión, el jugador ve:**
  - complejo, día y hora, formato y nivel;
  - el sello, si lo tiene;
  - la grilla de camisetas con "Faltan N";
  - el botón "Voy".

  No ve personas.
- **Al tocar "Voy" sin sesión** aparece la variante RIVAL de `LoginGate` (`src/app/(public)/[slug]/reservar/components/`). Se entra con Google o con el email, y el clickwrap de +18 queda debajo de los botones. El intento viaja firmado en `rival-intent` (§12) y el regreso es al mismo partido.
- **La primera vez** aparece la tarjeta de bienvenida (§7). Su botón "Estoy adentro" acepta y suma en un solo toque. No hay autoenvío: el consentimiento pide ese toque explícito.
- **Las veces siguientes**, "Voy" suma directo.
- **Resultado:**
  - con cupo: "Listo, estás adentro. Nos vemos en la cancha.";
  - sin cupo: "Quedaste en el banco. Si alguien se baja, entrás vos y te avisamos por mail."
- **Con sesión** se ven los nombres cortos (nombre e inicial) y las fotos o iniciales de los confirmados.

### 5.3 Vista del organizador

- **Arriba:** los datos del partido, el contador y la grilla.
- **El único botón verde: "Avisar al grupo".** Es un `<a href>` que arma el servidor con `buildWhatsappUrl` y abre `wa.me` con un texto que cambia según el estado:
  - faltan varios: "Jueves 21:00 en El Vagón. Nos faltan 3. ¿Venís? Confirmá en un toque: <link>"
  - falta uno: "¡Falta 1! Jueves 21:00 en El Vagón: <link>"
  - lleno: "¡Estamos los 10! Se juega el jueves 21:00 en El Vagón."
- **Más abajo:**
  - la lista de confirmados, banco y pedidos (§6);
  - "Publicar en el tablón" o "Sacar del tablón";
  - "Copiar link";
  - "Cancelar el partido", con confirmación.
- **Al llenarse:** "¡Estamos los N! Se juega." pulsa una sola vez, 600 ms, y se congela con `prefers-reduced-motion`.

### 5.4 Me bajo

- Disponible hasta `starts_at`, para confirmados, banco y pedidos.
- Copy sin culpa: "Si no podés ir, bajate a tiempo: alguien del banco ocupa tu lugar."
- No tiene penalidad en v1.
- Si había banco, entra el primero y le llega el mail "Entraste al partido".
- Al organizador le llega "Se bajó alguien", con el botón "Avisar al grupo".

### 5.5 Repetir

En un partido vencido, el organizador ve "Armar el del jueves que viene". El link abre `/rival/nuevo?desde=<id>` con todo precargado y la fecha a +7 días. Cada repetición genera un partido nuevo, con su link. La serie automática es de la ola 1.1.

### 5.6 El tablón (`/rival`)

- **Visible sin cuenta.** Lleva `noindex` y `disallow` en `robots.ts`.
- **Selector de complejo:** solo los complejos con publicaciones, más un "Todos".
- **Agrupado** en Hoy, Mañana y Esta semana, ordenado por hora.
- **Cada tarjeta muestra:**
  - el tipo ("Faltan 3", "Falta 1", "Se busca arquero" o "Busca rival");
  - complejo, día y hora;
  - formato, nivel y sello.

  No muestra personas.
- **Estado vacío:** "Hoy el tablón está tranquilo. Armá el primero y que se sume quien pueda." Tiene dos acciones: "Armar un partido" y "Avisame cuando haya" (alerta, §9).
- **Pestaña "Mis partidos":** lo que organizo y lo que juego, los próximos arriba.

### 5.7 Pedir sumarse, aceptar y contacto

1. **El jugador pide.** Toca "Pedir sumarme", con cuenta y bienvenida hechas, y ve "Pedido enviado. Te avisamos por mail si te aceptan." Al organizador le llega el mail "Alguien quiere sumarse".
2. **El organizador decide.** Ve la ficha del que pidió (§6) y elige "Aceptar" o "Esta vez no".
3. **Si acepta:** al aceptado le llega un mail y ve "Escribile por WhatsApp", un `<a href>` armado en el servidor con este texto: "Hola, soy [nombre] de RIVAL. Me aceptaste para el partido del jueves 21:00 en El Vagón."
4. **Si rechaza:** el jugador lee "Esta vez no hubo lugar." No recibe mail, para no generar ruido.
5. **El contacto:** TurnoGol no le pasa al organizador el teléfono de nadie. Escribe el aceptado, desde su WhatsApp, así que el organizador ve ese número recién cuando le llega el mensaje. Arriba del botón, el aceptado lee: "Al escribirle, va a ver tu número."

### 5.8 Cancelar

- Lo cancela el organizador, con confirmación.
- Les llega el mail "Se cayó el partido" a los confirmados y al banco.
- Se borra el WhatsApp guardado (`rival_match_contacts`). También se borra solo al llegar `starts_at`: nadie lo necesita después.
- El link muestra "Este partido se cayó." y la acción "Armar otro".

## 6. Qué ve cada uno

| Quién | Ve |
|---|---|
| Sin sesión, en el tablón o con el link | Datos del partido, contador y grilla. **Ninguna persona** |
| Con sesión y con el link (no participa) | Además, nombre corto y foto o iniciales de los confirmados |
| Confirmado o en el banco | Lo mismo, su propio estado y "Me bajo" |
| Aceptado desde el tablón | Lo mismo y "Escribile por WhatsApp" |
| Organizador | Confirmados, banco y pedidos. De cada uno: foto, nombre corto, posición, zona, partidos jugados y "En TurnoGol desde [mes y año]" |
| Super-admin | Métricas agregadas y denuncias; nombre corto de denunciante y denunciado |

- **Nunca, por TurnoGol:** teléfono ni email de otra persona. La única excepción la provoca el propio jugador: el aceptado que escribe por WhatsApp le muestra su número al organizador (§5.7).
- **El WhatsApp del organizador** solo lo ve el aceptado de esa publicación, y solo hasta `starts_at` o hasta que se cancela.
- **"Partidos jugados"** sale de reservas completadas, con la regla de `getPlayerActivity` (`src/modules/players/activity.service.ts`), más los partidos RIVAL vencidos en los que estuvo confirmado.
- **No hay perfil público navegable** de una persona: la ficha existe solo dentro del partido.

## 7. Perfil RIVAL y bienvenida

La bienvenida aparece la primera vez que el jugador organiza, toca "Voy" o pide sumarse. Es una sola tarjeta.

- **Nombre:** se precarga con el actual, que hoy puede salir del email. Es obligatorio y solo se muestra el nombre corto.
- **Posición:** Arquero · Defensor · Mediocampista · Delantero · Donde me pongan.
- **Zona:** de una lista cerrada (`src/modules/rival/rival-zones.ts`). La lista inicial es el corredor del piloto: Luján, Jáuregui, Open Door, Torres, Pueblo Nuevo, Olivera, Carlos Keen, General Rodríguez, Mercedes, Pilar, Moreno, Exaltación de la Cruz y Otra zona. Se amplía cuando se suman complejos.
- **Foto:** opcional, con recorte cuadrado. Si no hay foto, se muestran las iniciales.
- **Código de conducta:**
  1. Llegá a horario.
  2. Si no podés ir, bajate a tiempo.
  3. Cero violencia e insultos.
  4. Lo demás se arregla entre ustedes por WhatsApp: TurnoGol no organiza ni cobra.
- **Clickwrap**, debajo del botón: "Al tocar, aceptás las reglas de RIVAL y los Términos. Quien tenga el link de un partido en el que estés y haya iniciado sesión ve tu nombre corto y tu foto. El organizador ve además tu posición y tu zona." Se guarda en `players.rival_accepted_at` + `rival_terms_version`.

Después de la bienvenida, el perfil se edita en `/configuracion`, en la tarjeta "Tu perfil en RIVAL". Ahí también se borra la foto y se apagan las alertas. El `preferred_area` de texto libre deja de editarse y se borra en una migración posterior a PR3, anotada como pendiente en el ledger de RIVAL (`docs/planning/2026-10-rival-v1-ledger.md`).

## 8. Moderación y bans

- **El único texto es tu propio nombre.** No hay descripciones, comentarios, chat ni reseñas.
- **Denunciar.** Se puede denunciar un partido, o a alguien dentro de un partido, con motivos cerrados:
  - "El partido no existe"
  - "Es spam o publicidad"
  - "Nombre o foto ofensivos"
  - "Parece menor de 18"

  Hay una denuncia por denunciante, partido y denunciado: se puede denunciar el partido y, además, a dos personas distintas de ese partido. Con **3 denuncias del partido de personas distintas** el partido se oculta solo (`hidden_at`) hasta que el super-admin lo revisa. **Para que una denuncia cuente para el auto-ocultar** (contra el griefing), el denunciante tiene que tener la cuenta hace 7 días o más y al menos una reserva completada o un partido RIVAL jugado. Las demás denuncias igual llegan al super-admin. Lo decidió el dueño el 2026-10-22 (decisión 9).
- **`/super-admin/rival`.** Muestra métricas (§11) y denuncias abiertas. Permite ocultar o restaurar un partido y quitar una foto. El ban global sigue por SQL en v1.
- **Bans** (decisión 7):
  - el ban global (`players.status = 'banned'`) y el ban **manual** del complejo (`tenant_player_bans` con `banned_by IS NOT NULL`, vigente) impiden organizar, sumarse y pedir en ese complejo;
  - los softbans automáticos, por ausencias o por cancelación tardía, no frenan. Se reconocen por `banned_by IS NULL` (lo escriben `applyNoShowStrike` y `extendSoftban`, `src/modules/relationships/ptr.service.ts`).

  El mensaje al jugador no dice por qué: "No podés sumarte a partidos en este complejo."
- **Menores.** El +18 es el de ADR-012, y la denuncia "Parece menor de 18" va a revisión.

## 9. Emails y alertas

En v1, el email es el único canal hacia el jugador: no hay push al jugador.

**Transaccionales** (sin baja; doc18 §8):

| Evento | A quién |
|---|---|
| "Alguien quiere sumarse" | Organizador |
| "Se bajó alguien" | Organizador |
| "Te aceptaron" | Jugador |
| "Entraste al partido" (promoción del banco) | Jugador |
| "Se cayó el partido" | Confirmados y banco |
| "Tu reserva se cayó" (el sello bajó, §3) | Organizador |

**Alertas** (opt-in y con baja de un toque):
- **Suscripción:** "Avisame cuando busquen gente en [complejo]", desde el tablón o desde la vista de un partido, con la opción "solo cuando busquen arquero".
- **Cuándo se manda:** un mail cuando un partido de ese complejo se publica en el tablón y todavía le faltan jugadores, o busca arquero si el filtro está puesto. Hay como mucho un mail por publicación y uno por día por jugador. No le llega al organizador ni a quien ya está en el partido.
- **Baja:** cada mail lleva un link, con un token firmado, a una página que da de baja sin iniciar sesión. La baja se hace con un botón (POST), no al abrir el link: los escáneres de correo abren los links solos.

**Horario silencioso, para todos los mails de RIVAL:**
- nada sale entre las 00 y las 08 ART;
- el job que inserta la notificación se agenda para las 08 con `quietHoursReleaseAt` (`src/modules/notifications/push-quiet-hours.ts`);
- al despertar se revalida: si el partido se canceló, se llenó o venció, no se manda.

Ojo: agregarle `startAfter` a `dispatchEmail` no alcanza, porque `send-email.worker.ts` es un barrido que ignora la data del job.

## 10. Textos legales (borradores, los valida el dueño con asesoría antes de prender el flag)

**Términos, sección nueva "RIVAL":**
> RIVAL es un espacio para que jugadores mayores de 18 años armen partidos y se sumen a partidos de otros en complejos que usan TurnoGol. TurnoGol pone la herramienta: no organiza los partidos, no garantiza que la cancha esté reservada ni que el partido se juegue, y no interviene en lo que los jugadores acuerden entre ellos, por WhatsApp o por cualquier otro medio. Cada jugador es responsable por su nombre y su foto, por cumplir las reglas de RIVAL y por lo que pase en el partido. TurnoGol puede ocultar publicaciones, quitar fotos y suspender el acceso a RIVAL cuando se incumplan estas reglas o los Términos. En RIVAL no se cobran ni se procesan pagos entre jugadores.

**Privacidad, finalidad nueva "RIVAL":**
> Si usás RIVAL, otros jugadores ven tu nombre corto (nombre e inicial del apellido) y tu foto. Los ve quien tenga el link de un partido en el que estás confirmado, con sesión iniciada. El organizador de un partido al que te sumás o al que pedís sumarte ve además tu posición, tu zona, cuántos partidos jugaste y desde cuándo estás en TurnoGol. TurnoGol no le muestra a nadie tu email ni tu teléfono. Si organizás un partido y lo publicás en el tablón, tu WhatsApp lo ve solo la persona que aceptes en ese partido, hasta que empieza o se cancela, y después lo borramos. Si te aceptan en un partido y le escribís al organizador por WhatsApp, él ve tu número, como en cualquier chat. Las alertas por mail son opcionales y se dan de baja con un toque. Guardamos los datos de cada partido hasta 12 meses después de jugado, y después los borramos. Podés pedir acceso, rectificación o supresión (Ley 25.326), y la exportación de tus datos incluye lo de RIVAL.

**Consentimiento:** el clickwrap de la bienvenida (§7), versionado en `rival_terms_version`, más el consentimiento del WhatsApp, que se da en cada publicación.

## 11. Métricas (para elegir la próxima ola)

Se cuentan sobre tablas propias, porque `track.*` descarta `playerId`. Se muestran en `/super-admin/rival`, por semana y por complejo:

- partidos creados y publicados en el tablón;
- personas distintas sumadas (`confirmed_at` no nulo, sin contar al organizador);
- partidos completos (`filled_at`) y la mediana de minutos hasta completarse;
- bajas y entradas desde el banco;
- pedidos del tablón aceptados, rechazados y sin respuesta;
- cuentas nuevas que entraron por RIVAL (`players.signup_source = 'rival'`) y de qué `?ref=` vinieron (`grupo`, `tablon` o `cartel`);
- alertas enviadas, suscripciones activas y bajas;
- denuncias y partidos ocultos.

## 12. Diseño técnico

**Migración** `src/shared/db/migrations/099_rival_v1.sql`, con espejo en `supabase/migrations/`. El número se recalcula contra origin/main antes de crearla. Es aditiva y siembra el flag `rival` global en `false`.

**Tablas.** Todas son híbridas, como `player_favorites`: llevan `tenant_id` y RLS por `app.current_player_id`, con ENABLE y FORCE. Se suman al inventario de `.claude/rules/tablas-y-rls.md`.

| Tabla | Claves |
|---|---|
| `rival_matches` | `tenant_id`, `organizer_player_id`, `booking_id` NULL, `court_declared`, `starts_at`, `format` (4..11), `capacity`, `level`, `invite_code` UNIQUE, `on_board`, `seeking`, `seeking_position`, `status`, `hidden_at`, `confirmed_count`, `filled_at`. CHECK `booking_id IS NOT NULL OR court_declared` |
| `rival_match_contacts` | `match_id` PK, `whatsapp_digits`. Va aparte porque una columna no puede tener RLS propio. Se borra al cancelar, al llegar `starts_at` (barrido del worker de retención) y con ARCO |
| `rival_participants` | `tenant_id`, `match_id`, `player_id`, `role` (player / rival_captain), `status`, `origin` (invite / board), `confirmed_at`, `decided_at`. UNIQUE (`match_id`, `player_id`); índice único parcial: un `rival_captain` `confirmed` por partido |
| `rival_reports` | `match_id`, `reporter_player_id`, `reported_player_id` NULL, `reason`, `counts_for_autohide`. UNIQUE NULLS NOT DISTINCT (`match_id`, `reporter_player_id`, `reported_player_id`) |
| `rival_alert_subscriptions` | `player_id`, `tenant_id`, `only_goalkeeper`. UNIQUE (`player_id`, `tenant_id`) |
| `rival_alert_sends` | Dedupe de alertas. Deny-all, como `ops_alerts` (097) |

**Columnas nuevas en `players`:** `rival_accepted_at`, `rival_terms_version`, `position`, `zone` y `signup_source`. La foto reusa `players.avatar_url`, que ya existe, hoy no la escribe nadie, la muestra el header (`AccountMenu`) y ARCO ya la anula.

**Triggers.** Son SECURITY DEFINER con `SET search_path = public, pg_temp`. Salen de las lecciones de `018_open_matches.sql` y `020_public_backend_review_fixes.sql`.
- Insertar al organizador como fila `confirmed`.
- `FOR UPDATE` sobre el partido para el cupo, el banco y la promoción.
- Transiciones por actor (§4), leyendo `app.current_player_id`.
- Inmutabilidad de tenant, organizador, booking, código y `starts_at`. Un partido vencido no se reabre.
- Tope de 3 activos con `pg_advisory_xact_lock` por organizador.
- `confirmed_count` se recuenta (no ±1), y `filled_at` se escribe solo la primera vez.
- Errores con código estable (`rival_full`, `rival_expired`…), mapeados a errores de dominio vía `src/shared/db/pg-errors.ts`.

**Lecturas.** Van por funciones definer con columnas explícitas:
- `rival_public_match(code)`
- `rival_board(tenant, cursor)`: expone `id`, nunca `invite_code`, porque con el código cualquiera se saltaría la aceptación;
- `rival_roster(match_id)`: autoriza adentro según §6;
- `rival_join_by_invite(code)`
- los helpers `rival_is_organizer` y `rival_is_participant`, que evitan la recursión de policies.

Todas llevan REVOKE de PUBLIC, anon y authenticated, y GRANT a `turnogol_app` y `turnogol_worker` (patrón `056` / `080`).

**Módulo `src/modules/rival/`:**
- `rival.flags.ts`: `isFeatureEnabled('rival')` **solo global**. Es una decisión de esta spec: `tournament.flags.ts` acepta override por tenant, pero RIVAL es cross-tenant y un partido no puede estar prendido para un complejo y apagado para otro jugador;
- `rival.schema.ts`: Zod con enums cerrados; el código usa el alfabeto de `referral.schema.ts`;
- `rival.errors.ts` y `rival.types.ts`;
- `rival.service.ts`: crear, publicar, cancelar, unirse por invitación, pedir, bajarse, decidir, sacar, roster, contacto, denunciar y bienvenida, todo en `withPlayerContext`;
- `rival-alerts.service.ts`
- `rival-zones.ts`

Fuera del módulo:
- `src/shared/security/rival-intent.ts`, hermano de `booking-intent.ts`, con dominio `rival-intent-v1`;
- `src/modules/super-admin/rival-monitor.service.ts`, con el patrón de `whatsapp-monitor.service.ts` y `withDisposableWorkerDb`.

**Server Actions** en `src/app/(player)/rival/**/actions.ts`, con sufijo `Action`. El orden es: flag → `withPlayer` → `enforce` (políticas nuevas en `src/shared/rate-limit/policies.ts`) → Zod → service.

**Flag en el cliente.**
- `rivalEnabled` viaja en `/api/player/session` (no-store) y en `PortalSessionProvider`. El layout no se vuelve dinámico.
- Cada página, acción y route handler chequea el flag por su cuenta.
- La barra inferior pasa a Explorar · Rival · Reservas · Cuenta solo con el flag prendido.

**Auth.** `isRivalPath` va junto a `isBookingPath` en `src/lib/auth-success.ts`, en `src/app/api/auth/callback/route.ts` y en `aceptar-terminos`. El callback marca `signup_source = 'rival'` cuando la cuenta nace con `next` en `/rival/`.

**Notificaciones.**
- La RLS de `notifications` exige tenant, así que el INSERT sale del worker con el tenant del partido.
- El trigger `enforce_notification_recipient` (`validate_notification_recipient()`, `005_triggers.sql:123-135`) solo exige que el jugador exista en `players`, sin relación con el complejo: no hace falta migración.

**Foto.**
- Se sube por el pipeline de R2 (`src/shared/storage/r2.ts`) que usan las canchas: tipo y tamaño validados, recorte cuadrado y redimensionado.
- La URL pública se guarda en `players.avatar_url`, y la clave del objeto se deriva de ella.
- **Clave no adivinable y cache corto:** cada subida genera una clave nueva con un UUID aleatorio (`rival/avatars/<uuid>.webp`), nunca derivada del `player_id`, y el objeto se sube con `Cache-Control: public, max-age=3600`. El `immutable` de un año que hoy usa `r2.ts:70` para las canchas **no sirve acá**: haría que una foto borrada siguiera en caches. Hace falta un parámetro de cache en el helper de subida.
- El objeto se borra con ARCO, al reemplazar la foto y cuando el super-admin la quita.

**OG.** `ImageResponse` de 1200×630 por partido, con complejo, día y hora y **sin contador** (WhatsApp cachea la vista previa). Pesa menos de 300 KB.

**Infra.**
- `/rival` va en el `matcher` y en `SESSION_REFRESH_PREFIXES` de `middleware.ts` y en `robots.ts`. En `tests/unit/player-pages-guard.test.ts` entran solo `/rival/nuevo` y Mis partidos: `/rival` y `/rival/p/[code]` se ven sin sesión.
- Retención (`data-retention-cleanup.worker.ts`, borra las tablas rival antes que `bookings`), ARCO (`player.anonymization.ts`) y export (`/api/player/data-export`) cubren RIVAL.

**Diseño (La Previa, sin look nuevo):**
- **Encabezado de `/rival`:** `PlayerHeroBand` con el eyebrow "RIVAL powered by TurnoGol" y el titular "Armá el **partido**", con la parte en `.hero-accent-text`.
- **Debajo:** `PORTAL_BUTTON` "Armar un partido" y la píldora segmentada Tablón · Mis partidos.
- **Tarjetas:** `rounded-2xl`, como en Mis reservas.
- **Partido:**
  - los datos van en `.reserva-receipt-card`;
  - la grilla de camisetas muestra las confirmadas en esmeralda y las vacías con trazo punteado;
  - el contador va en Archivo tabular;
  - un solo verde por vista;
  - el resto sigue la Quiet Ghost Rule.
- **Formulario:** `data-portal-fields`, con chips de opción única como `ChipGroups`.
- **Tonos:** de `src/lib/status-tone.ts`. Confirmado en success; pedido y banco en neutral; sin ámbar.

## 13. Fases (un PR cada una, todo detrás del flag)

En cada fase:
1. `sonnet-implementer` con contrato.
2. `sonnet-adversarial-reviewer` fresco.
3. `sonnet-ux-verifier` a 390 px y en escritorio, en claro y en oscuro, cuando hay UI.
4. La skill `pr`.

Las migraciones son aditivas y el flag está apagado, así que no le cambian nada a El Vagón.

| PR | Qué | Tests que fallan primero |
|---|---|---|
| 1 | DB, esqueleto del módulo, retención, ARCO y export | Isolation 1.0 y 0.2. Integración bajo LOGIN real de `turnogol_app`: carrera de cupo, banco y promoción, inmutabilidad, auto-sumarse, vencidos, transiciones por actor, que un anónimo no vea personas, tope de 3 |
| 2 | Shell (flag en sesión, barra, header), `/rival`, `/rival/nuevo`, vista de `/rival/p/[code]`, entradas desde reservas, OG | middleware, robots, session route, guard de páginas |
| 3 | "Voy" con cuenta (intent, `LoginGate`, bienvenida), banco, me bajo, avisar al grupo, repetir, `signup_source` | intent (tamper y expiración), `auth-success`, invitación → confirmado, que un pedido no se auto-confirme |
| 4 | Tablón: publicar, listado, pedir, aceptar, rechazar y sacar, contacto `wa.me`, bans, denuncias | contacto solo para el aceptado y borrado al cancelar; ban manual sí, automático no |
| 5 | Foto de perfil (R2) | tipo y tamaño, ARCO borra el objeto, el super-admin la quita |
| 6 | Emails y alertas | ventana 00–08, uno por publicación y por día, baja, revalidación al despertar |
| 7 | `/super-admin/rival` | guard de super-admin, umbral de 3 denuncias |

Después de mergear los PR 1 y 2, el 5, el 6 y el 7 tocan archivos distintos y pueden ir en paralelo. El cierre lo hace `sonnet-release-verifier` sobre main integrado, y el flag lo prende el dueño por SQL.

**Flujo real para el cierre** (local, con el flag prendido):
1. A arma el partido y lo comparte.
2. B, con una cuenta nueva por magic link en Inbucket, toca "Voy".
3. Se llena el cupo y C queda en el banco.
4. B se baja: entra C y le llega el mail.
5. A publica en el tablón y D pide sumarse.
6. A acepta a D y a D le aparece el `wa.me`.
7. D denuncia el partido y el super-admin lo oculta.

## 14. Respuestas a las preguntas del benchmark (§5)

1. **Éxito y reversión:** no hay reversión. Las métricas de §11 sirven para elegir la ola.
2. **Alertas:** opt-in por complejo con filtro de arquero, por mail, y nada entre 00 y 08. La segmentación por franja es de la ola 2.
3. **Contacto:** el WhatsApp del organizador lo ve solo el aceptado, con consentimiento en cada publicación, y se borra al cancelar o al empezar el partido. TurnoGol no le pasa al organizador ningún teléfono: lo ve solo si el aceptado le escribe, y el aceptado está avisado.
4. **Bajas:** se puede bajar hasta el inicio, sin penalidad en v1 y sin contar para los softbans. El lugar pasa al banco y se avisa por mail.
5. **Sin cancha:** no hay partidos sin cancha. El sello es automático si hay reserva y, si no, la declaración es obligatoria. El partido vence al empezar.
6. **Denuncias:** motivos cerrados, 3 denuncias de personas distintas ocultan el partido, y revisa el super-admin.
7. **Nivel:** lo declara el organizador para el partido, con 3 niveles verbales.
8. **Busca rival:** el cupo es tu equipo; el pedido es del capitán, que no ocupa cupo; al aceptarlo se cierra la búsqueda.
9. **Arquero:** es una publicación más del tablón ("Se busca arquero"), sin cobro ni intermediación.
10. **Partido del grupo:** se relevó aparte en `2026-10-rival-ideas.md` §1.
11. **Prueba manual de la competencia:** sigue pendiente, a cargo del dueño, y no bloquea.
12. **Densidad local:** sigue pendiente. La primera medición real la dan las métricas de §11.
