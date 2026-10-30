# RIVAL: catálogo de ideas

El banco de donde salen las olas. La visión y el porqué están en [`README.md`](README.md); los vetos levantados y sus condiciones, en [la decisión del 29/10](../decisions/2026-10-29-rival-cultura-de-turnogol.md). Las ideas viejas y su historia siguen en [`2026-10-rival-ideas.md`](../planning/2026-10-rival-ideas.md).

**Cómo leer cada fila:**
- **Etapa:** 1 hoy (v1), 2 punta de entrada, 3 expansión, 4 el norte (ver "Etapas" en el README).
- **Puerta:** qué densidad necesita para tener sentido. "Ninguna" anda con un complejo.
- **⚖:** necesita asesoría legal o decisión escrita aparte antes de construir.
- **Tamaño:** S (días), M (una o dos semanas), L (más). Es una estimación gruesa, no un compromiso.
- **Resorte:** el de la tabla "Por qué engancha" del README.
- **Reusa:** qué del código ya existe. `story-image` = `src/lib/story-image/`; la Placa = `StoryShareDialog.tsx` de la grilla.

Ninguna fila es un compromiso de construir. Levantar el veto no es construir ya.

## 1. YO: tu carrera

| Idea | Etapa | Puerta | ⚖ | Tamaño | Resorte | Reusa |
|---|---|---|---|---|---|---|
| Ficha con G/E/P, clásicos, títulos y figuras | 2 | Ninguna | Consentimiento | S | Progreso | Ficha de v1 (`src/modules/rival`) |
| La media | 2 | Ninguna (provisoria hasta N partidos) | Consentimiento por finalidad; dato personal | M | Progreso, estatus | Partido oficial |
| Figura del partido, votada por el rival | 2 | Ninguna | Se guarda el resultado, no quién votó | M | Premio variable, estatus | Partido oficial |
| La figurita con ediciones | 2 | Ninguna | Imagen propia (art. 53) | M | Colección, estatus | `story-image` |
| Trayectoria y "Es oficial" (fichaje) | 2 | Ninguna | Retención (carrera) | S | Dotación | `story-image` |
| Logros con tono de crónica y logros ocultos | 2 | Ninguna | — | M | Premio variable, progreso | Reservas |
| Versus con un amigo que acepta | 3 | Dos jugadores con partidos oficiales | Consentimiento de los dos | S | Compararse con los cercanos | La media |
| Racha semanal con perdón | 2 | Ninguna | — | S | Miedo a perder | Reservas |
| Goles en un toque a la mañana siguiente | 2 | Ninguna | — | S | Progreso | Partido oficial |

## 2. NOSOTROS: tu club

| Idea | Etapa | Puerta | ⚖ | Tamaño | Resorte | Reusa |
|---|---|---|---|---|---|---|
| Fundá tu club: nombre moderado por IA, escudo de piezas, camiseta, año, local | 2 | Ninguna | Nombre: moderación, denuncia y lista negra | M | Pertenencia, efecto IKEA | Partido del grupo de v1 |
| Dorsales, estrellas arriba del escudo, parche de campeón | 2 | Ninguna | — | S | Pertenencia, estatus | — |
| Historia del club escrita por la IA | 3 | Un club con temporada jugada | — | S | Dotación | Haiku (bot de WhatsApp) |
| Vestuario: convocatoria, Pan y queso, tabla del grupo | 2 | Ninguna | — | M | Pertenencia | Partido del grupo de v1 |
| La formación: dos medias canchas con puestos; cada uno toca su lugar, los huecos van al tablón | 2 | Ninguna | Visibilidad nueva (enmienda la spec §6) y texto de privacidad | M | Pertenencia, compromiso público | Partido del grupo, "repetir", `rival_participants`, `players.position`, `seeking_position`, `story-image` |
| Del turno fijo al club (invitación desde el panel) | 2 | Ninguna | — | S | Pertenencia | `src/modules/abonados` |
| Hinchada: seguir a un club | 3 | Clubes públicos | Consentimiento del club | S | Pertenencia | — |

## 3. ELLOS: la competencia

| Idea | Etapa | Puerta | ⚖ | Tamaño | Resorte | Reusa |
|---|---|---|---|---|---|---|
| Partido oficial con doble confirmación | 2 | Ninguna | — | M | Base de todo | Grilla y reservas |
| Tabla de la zona 3/1/0, por formato y categoría | 3 | 8 clubes activos en la zona (propuesta) | Consentimiento por aparecer | M | Compararse con los cercanos | Zonas de la spec v1 §7 |
| Tablas individuales (top 10): media, figuras y goleadores | 3 | Igual que la tabla | Consentimiento; solo la parte de arriba. Goleadores con goles del capitán: excepción decidida el 2026-10-30 | M | Estatus | La media, la figura |
| Divisiones (Elo oculto del club) | 3 | Igual que la tabla | — | M | Progreso | — |
| Temporadas con ascenso y descenso blando | 3 | Divisiones | — | M | Progreso, pico y final | — |
| Clásicos automáticos desde 3 partidos | 2 | Dos clubes que se repiten | — | S | Pertenencia | Partido oficial |
| La Corona del complejo | 2 | 2 o 3 clubes en un complejo | — | M | Miedo a perder, estatus | Partido oficial |
| Desafío directo y revancha en un toque | 2 | Ninguna | — | S | Compromiso público | Link `wa.me` de v1 |
| El álbum de la zona | 3 | Varios clubes en la zona | — | M | Colección | La figurita |
| "¿Volverían a jugar?" con lista cerrada | 2 | Ninguna | Lo negativo nunca se muestra, pero es un registro sobre personas: asesoría (derecho de acceso) | S | Reciprocidad | Etiquetas cerradas (patrón de `player-tags.ts`) |
| Rival ideal (emparejamiento) | 3 | Varios clubes por división | — | M | Compararse con los cercanos | Tablón de v1 |

## 4. LA CANCHA: los complejos

| Idea | Etapa | Puerta | ⚖ | Tamaño | Resorte | Reusa |
|---|---|---|---|---|---|---|
| El estadio: página RIVAL del complejo | 2 | Ninguna | — | M | Estatus (del complejo) | Ficha pública `/[slug]` |
| Leyenda de la cancha (90 días) | 2 | Ninguna | Consentimiento por aparecer | S | Progreso, estatus | Reservas |
| Logros del complejo | 2 | Ninguna | — | S | Estatus (del complejo) | Reservas |
| Complejo de la zona, mensual | 3 | 3 complejos (propuesta) | Si tiene premio en el precio del SaaS: decisión aparte | M | Competencia entre dueños | — |
| Sticker de la puerta con QR | 2 | Ninguna | Costo de imprimir | S | Estatus | — |
| Hora RIVAL y partido de la casa | 2 | Ninguna | — | M | Llena horas muertas | Grilla, publicación de v1 |
| Panel "Tu complejo en RIVAL" | 2 | Ninguna | — | M | Progreso (del dueño) | Panel admin |
| Pedí tu cancha | 2 | Ninguna | Nunca prometer jugadores | S | Lo que vende ya | `src/modules/referrals` |
| Comunidad de WhatsApp del complejo (link y "lo de la semana") | 2 | Ninguna | Nada masivo desde el sistema | S | Pertenencia | — |

## 5. EL RITUAL: todos los días

| Idea | Etapa | Puerta | ⚖ | Tamaño | Resorte | Reusa |
|---|---|---|---|---|---|---|
| El Crack del Día ([detalle](crack-del-dia.md)) | 2 | Ninguna | Nombres reales como dato; sin imágenes ni escudos | M | Premio variable, ritual | `story-image` |
| Prode TurnoGol sin plata | 3 | Ligas con gente | Si hay premio: Lealtad Comercial | M | Ritual, pertenencia | — |
| Desafío de la semana | 3 | Clubes activos | Patrocinio: decisión aparte | S | Ritual | Logros |
| El Diario de la Zona, los lunes | 3 | Tabla de la zona | Contenido con permiso | M | Ritual | Haiku, `story-image` |

## 6. EL RELATO: lo que se cuenta

| Idea | Etapa | Puerta | ⚖ | Tamaño | Resorte | Reusa |
|---|---|---|---|---|---|---|
| La tapa: crónica de la IA por partido oficial | 2 | Ninguna | La IA no nombra jugadores (decisión 2026-10-30) | M | Premio variable | Haiku, `story-image` |
| Tarjetas 9:16 para todo | 2 | Ninguna | Personas solo con permiso | M | Estatus | `story-image`, la Placa |
| El Día del Partido (push opt-in) | 2 | Ninguna | Opt-in y horario silencioso | S | Anticipación | `push-quiet-hours.ts` |
| Tercer tiempo | 2 | Ninguna | — | M | Pico y final | Partido oficial |
| Tu Temporada (Wrapped) | 3 | Una temporada jugada | — | M | Pico y final | `story-image` |
| Informe del DT, mensual | 3 | Partidos suficientes | — | S | Progreso | Haiku |
| Contenido para las redes de TurnoGol | 3 | Clubes públicos | Permiso de cada club y persona; imagen (art. 53) | S | Estatus | `story-image` |
| Reacciones de tribuna (frases fijas) | 2 | Ninguna | Sin texto libre | S | Pertenencia | — |

## Premiaciones

| Idea | Etapa | Puerta | ⚖ | Tamaño | Resorte | Reusa |
|---|---|---|---|---|---|---|
| La Gala de la zona, al cierre de temporada | 4 | Temporadas jugadas | Plata para trofeos y marcas: decisión aparte | L | Pico y final, estatus | Temporadas |

## El norte (etapa 4, sin fila propia todavía)

Las copas y la Copa de barrios salieron de RIVAL el 2026-10-30: un organizador de torneos sería otra parte de TurnoGol. Varias ciudades, marcas y desafíos patrocinados, relator con IA, TurnoGol Cam. Cada una necesita su propia decisión antes de pasar a una fila.
