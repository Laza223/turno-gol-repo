# La landing de RIVAL

**Estado:** diseño para aprobar. No hay código de producción. **Fecha:** 2026-10-30. **Decide:** Lazar.

**Entregables:**
- este documento;
- el prototipo [`landing-prototipo/index.html`](landing-prototipo/index.html), que se abre en el navegador a 390 y a 1440 px y tampoco es código de producción.

**Visión que cuenta:** [`README.md`](README.md), [`categorias.md`](categorias.md), [`clubes.md`](clubes.md), [`ideas.md`](ideas.md) y [la decisión del 29/10](../decisions/2026-10-29-rival-cultura-de-turnogol.md). **Lo construido:** la [spec de v1](../superpowers/specs/2026-10-22-rival-v1-design.md). **Autoridad visual:** [`DESIGN.md`](../../DESIGN.md), mundo La Previa.

> `categorias.md` y `clubes.md` todavía viven en la rama `claude/rival-strategy-features-327f6e` y no en main. Esos dos links andan cuando esa rama se mergea.

## Lo que decidió Lazar para esta landing (2026-10-30)

1. **Cuenta todo RIVAL**, lo que existe y lo que viene. Cada sección que todavía no existe lleva "Próximamente".
2. **Vive en `/rival`.** El tablón se muda a `/rival/tablon`.
3. **Se aprueba viendo:** este doc más un prototipo HTML.
4. **Se mueve con el scroll** (pedido del mismo día): escenas que se fijan en pantalla y se arman mientras bajás, con motion graphics limpios. Busca un efecto "wow" muy coreografiado, pero sin que la web se ponga lenta.
5. **Las respuestas a los REQUIERE INPUT** están en "Lo que decidió Lazar sobre los REQUIERE INPUT", al final. Las que más cambian el diseño: GSAP con medición, "gratis" se dice, la marca Fundador va y el Crack del Día sale de RIVAL.

## En una pantalla

- **Qué es:** la página que explica RIVAL, el lado jugador de TurnoGol, con el lema **"Cada partido cuenta."**
- **Qué tiene que pasar:**
  - en 5 segundos, el futbolero entiende que RIVAL es su fútbol contado como fútbol de verdad;
  - le cree, porque ve lo que ya anda;
  - toca **"Armá tu partido"**, el único botón verde.
- **Cómo se ve: la pizarra del DT.** Es la estructura que eligió Lazar. Va dentro de La Previa: losa nocturna, pizarra verde oscura, líneas de tiza, Archivo negra itálica y resplandor esmeralda.
  - Cada parte de RIVAL es una jugada dibujada con tiza.
  - La línea de mitad de cancha parte la página en dos: de un lado lo que ya se juega, del otro lo que viene.
  - **Firma:** la tiza dibuja la cancha, los jugadores caen en sus puestos y queda un hueco: "Falta 1".
  - **Se pueden tocar dos cosas:** la demo de "Voy" en la pizarra (es v1 real: tocás y llenás el hueco) y el quiz "¿De qué categoría sos?".
- **Movimiento:** la página se mueve con el scroll. Ocho escenas se fijan en pantalla y se arman mientras bajás: el partido que se llena, la escalera de categorías, el picado que se ordena en club, el escudo, la Corona, el mazo de figuritas de costado, el zoom a la cancha y la pizarra que se borra. Todo es reversible y nada se mueve solo, salvo la tiza del hero.
- **Honestidad:** cada bloque dice su estado, "Ya disponible" o "Próximamente". No hay números inventados, cupos falsos ni nombres de clubes reales, y nunca se promete "te traemos jugadores".

## Qué está construido y qué es Próximamente

La landing no puede prometer lo que no existe. Esta tabla manda: cada pieza de la página sale de acá con su estado. En el código va a ser un solo mapa (ver "Implementación prevista"), así la landing cambia de "Próximamente" a "Ya disponible" cuando sale cada ola.

| Pieza | Estado hoy | Fuente |
|---|---|---|
| El partido del grupo: armarlo en un complejo TurnoGol, link por WhatsApp, "Voy" → "Estoy adentro", contador "Faltan N" | **Ya disponible** | Spec v1 §1 a §5 |
| Cupo duro, el banco con promoción automática, "Me bajo" sin penalidad, "Repetir el partido" | **Ya disponible** | Spec v1 §1 |
| Sello "Reservada en TurnoGol" | **Ya disponible** | Spec v1 §3 |
| Nivel del partido: Tranqui, Parejo o Picante | **Ya disponible** | Spec v1 §3 |
| El tablón: "Faltan 3" / "Falta 1", "Se busca arquero", "Busca rival"; aceptar y contacto por WhatsApp | **Ya disponible** | Spec v1 §5.6 y §5.7 |
| Aviso por mail cuando buscan gente en tu complejo (opt-in) | **Ya disponible** | Spec v1 §9 |
| Que los partidos de RIVAL sumen a tus partidos jugados | Próximamente | Hoy el contador de la cuenta (`src/modules/players/activity.service.ts`) cuenta solo reservas propias completadas: quien entra con "Voy" no suma. La visión está en `categorias.md` y en el README |
| La formación y Pan y queso | Próximamente | README, mundo NOSOTROS |
| La categoría (de Novena a Primera), el "?" y la Selección de la zona | Próximamente | `categorias.md` |
| El club: nombre, escudo, plantel, dorsales, mercado de pases, palmarés, hinchada, historia | Próximamente | `clubes.md` |
| El partido oficial, la cartelera, la tabla, divisiones y temporadas, clásicos, la Corona, desafío y revancha, "¿Volverían a jugar?", rival ideal, álbum de la zona | Próximamente | README, mundo ELLOS |
| La figura, la tapa, la figurita, las tarjetas 9:16, Tu Temporada, logros, Versus, racha, trayectoria | Próximamente | README, mundos YO y EL RELATO |
| Desafío de la semana, el Diario de la Zona | Próximamente | README, mundo EL RITUAL |
| El estadio, Leyenda de la cancha, Complejo de la zona, el sticker, Hora RIVAL, Pedí tu cancha | Próximamente | README, mundo LA CANCHA |
| Temporada Cero y la marca Fundador (sin "para siempre") | Próximamente | README, Marketing |

**Lo que no entra, ni como Próximamente:**
- copas y torneos, porque quedaron fuera de RIVAL el 2026-10-30;
- la Gala con trofeos y las marcas, porque son etapa 4 y necesitan una decisión aparte;
- todo lo vetado: chat, feed, apuestas, plata entre jugadores, notas sobre personas y geolocalización.

**Vocabulario que no se usa:** "Falta Uno" y "Nos Falta Uno" son marcas de la competencia (spec v1 §2). Se dice "Falta 1" o "Faltan 3".

## Quién llega y qué tiene que pasar

**Modo:** Persuade.

**Quién llega,** casi siempre desde el celular y a veces en el navegador interno de Instagram:
- el que usa TurnoGol y toca "RIVAL" en la barra inferior;
- el que vio una tarjeta en una historia de Instagram;
- el que escaneó el sticker en la puerta del complejo;
- el que vino de la home de TurnoGol o de Google.

| Quién (de `categorias.md`) | Qué lo engancha en la landing |
|---|---|
| El competitivo del barrio | "¿De qué categoría sos?" y el quiz |
| El capitán | "Fundá tu club" y la Corona |
| El ex de inferiores o de liga | La escala de Novena a Primera |
| El arquero | "Se busca arquero", que ya anda |
| El espontáneo | Las tarjetas y el quiz |
| El dueño de complejo | "Tu cancha" y el link a `/para-complejos` |

**Éxito:**
- toca "Armá tu partido" o "Mirá el tablón";
- se va sabiendo qué viene y por qué conviene jugar en un complejo TurnoGol.

**Lo que no se puede medir y no se inventa:** cuántos usan RIVAL, cuántos clubes hay, testimonios.

## El argumento

Cada sección existe porque sostiene una afirmación. Si una sección no tiene afirmación, no entra.

| # | Afirmación | Prueba en la página |
|---|---|---|
| 0 | RIVAL es tu fútbol contado como fútbol: cada partido cuenta | El lema, la cancha de noche y el botón a lo que ya anda |
| 1 | Hoy ya armás el partido sin la encuesta del grupo | La demo de "Voy" con el contador, que es v1 real |
| 2 | Vas a saber de qué categoría sos, y la cancha lo confirma | La escala y el quiz |
| 3 | El fijo es para jugar; el club, para competir | Las dos columnas, grupo y club |
| 4 | Tu club va a vivir en TurnoGol como uno de verdad | El escudo que se arma, los dorsales y el mercado de pases |
| 5 | Entre clubes se juega por algo | La Corona, la cartelera y la tabla |
| 6 | Lo que pasa en la cancha se cuenta y se comparte | La tapa, la figurita y "Que se sepa" |
| 7 | (Sacada: el Crack del Día es de la home de TurnoGol, no de RIVAL) | — |
| 8 | Tu cancha también juega | El estadio del complejo y "Pedí tu cancha" |
| 9 | Se compite sin escrache | Las reglas, en voz alta |
| 10 | Empezar ahora tiene algo que después no se repite | La Temporada Cero, más el botón |

## La estructura: la pizarra del DT

### Cómo se eligió

El mundo ya estaba fijo (La Previa). Lo que se eligió es cómo se arma la página.

1. Escribí 6 estructuras, ordenadas de más a menos resonancia:
   1. la noche del partido;
   2. la escala;
   3. la tapa del lunes;
   4. el álbum;
   5. la pizarra del DT;
   6. la temporada.
2. `impeccable concept-seed --scope surface --mode persuade` repartió 3 de esas 6 (`seed:276230160747fa56`): **la pizarra del DT**, que encabezó, la temporada y el álbum. La noche del partido, mi favorita, entró como cuarta carta.
3. Las 4 se mostraron en la página de elección de impeccable, cada una con su boceto del primer pantallazo a 390 px.
4. **Lazar eligió la pizarra del DT.**

Las otras tres quedan descartadas y no se mezclan con esta.

| Estructura | Idea | Por qué no |
|---|---|---|
| La noche del partido | La página recorre la noche: previa, partido, tercer tiempo y la tapa del lunes | La más parecida a la home de TurnoGol. Su firma, "se prenden las luces", queda como idea suelta |
| La temporada | Un fixture: cada sección es una fecha | Lineal y larga en el celular |
| El álbum | Lo que existe está pegado y lo que viene es el hueco | Puede leerse como un juego de colección |

### La idea

> En esta página, **la pizarra del vestuario y la cancha dibujada con cal** se vuelve **el único motivo de todo el sistema**: la tiza dibuja la cancha, los puestos, las flechas de cada jugada y la línea que separa lo que ya se juega de lo que viene.

**La prueba del competidor:** con ATC o Playtomic la frase no funciona. Son de pádel y de reservas; la pizarra es de un equipo de fútbol con puestos, y RIVAL es de equipos.

### El motivo (la skill de taste, dirección "One motif", `seed 1194785378`)

Una sola forma, la línea de tiza, a cuatro escalas:

| Escala | Dónde |
|---|---|
| Gigante | La cancha dibujada del hero, recortada por los bordes de la pantalla |
| Banda | **La línea de mitad de cancha** con el círculo central, a todo el ancho, entre "Hoy ya se juega" y lo que viene |
| Figura | Las jugadas de cada sección: flechas punteadas, el escudo dibujado antes de pintarse, la escalera de categorías a lo largo de la cancha |
| Viñeta | El círculo de tiza (el "O" de la pizarra, que es un jugador) como viñeta de cada lista, a tamaño de texto |

**Cómo se adaptó la ficha de la skill.** Se tomó la composición de cada sección y nada más. Tipografía y color salen de DESIGN.md (`--keep palette,type`).

Las reglas de la casa de la skill que chocan con DESIGN.md no se aplican. DESIGN.md es la única autoridad visual:

| Regla de la skill | Qué pide DESIGN.md en su lugar |
|---|---|
| Sin degradés | El tramo del titular en `.hero-accent-text` |
| Sin vidrio | Las superficies de La Previa |
| Sin resplandores | `.hero-glow-blob` |
| Sin eyebrow | El microrrótulo de `PlayerHeroBand` |

Sí se respetan sus otras reglas: titulares de 2 líneas como máximo, nada de numeración 01/02/03, nada de tarjetas con ícono en fila y márgenes iguales.

**Cada plano de la ficha y su reemplazo:**

| Plano | Para qué se usa acá |
|---|---|
| Hero: una forma gigante recortada | La cancha de tiza, en lugar del círculo de la ficha |
| how-it-works: acordeón de paneles teñidos | "La jugada" de la sección 1. Con movimiento, los 4 pasos se arman con el scroll sobre la pizarra; sin movimiento, son los paneles teñidos, de esmeralda oscuro a claro |
| showcase: placa cuadrada con texto escaso | El tablón: sus 3 tipos (Faltan 3, Se busca arquero, Busca rival) como pestañas de texto, y dos acciones abajo |
| features: un párrafo con palabras-imagen | "Fundá tu club": un párrafo con el escudo, la camiseta y la estrella dentro del texto |
| list: un menú de dos columnas con viñetas de foto | Los rasgos del partido oficial, con el círculo de tiza como viñeta |
| proof: marcas grandes en baldosas | **Reemplazado:** no hay logos ni prueba que mostrar, y no se inventan. Su lugar lo toma la escalera de categorías a lo largo de la cancha |
| faq: acordeón de baldosas llenas | "Las reglas del vestuario": preguntas y respuestas honestas |
| cta: una palabra es el botón | La banda verde "ARMALO" |
| footer: la marca, construida grande | "RIVAL" en tiza a todo el ancho, arriba del `SiteFooter` |

### El mapa de la página

```
0  Hero ─ la cancha de tiza, "Cada partido cuenta.", demo de Voy      [hoy]
1  Hoy ya se juega ─ la jugada se arma con el scroll + el tablón      [Ya disponible]
━━━━━━━━━━━━━━━━━ ( ◯ ) MITAD DE CANCHA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   "Hasta acá, lo que ya se juega. De acá para allá, lo que viene."
2  ¿De qué categoría sos? ─ la escalera sube con el scroll + quiz     [Próximamente]
3  Grupo no es club ─ el picado se ordena en club                     [mixto]
4  Fundá tu club ─ el escudo se pinta y el párrafo se lee             [Próximamente]
5  El partido oficial ─ la Corona viaja + los rasgos                  [Próximamente]
6  Tercer tiempo ─ la tapa y las figuritas, de costado                [Próximamente]
   (7 Todos los días: sacada; sus rasgos pasan a la 6)
8  Tu cancha ─ zoom al estadio + Pedí tu cancha                        [Próximamente]
9  Las reglas del vestuario ─ preguntas y respuestas                   [vigente]
10 Temporada Cero ─ la pizarra limpia + la banda ARMALO                [Próximamente]
   Pie ─ RIVAL en tiza + SiteFooter
```

La banda de mitad de cancha es la manera honesta de contar todo: el visitante sabe en cada momento de qué lado está.

## Sistema visual (dentro de DESIGN.md)

### Mundo

**La Previa**, la de DESIGN.md: losa nocturna `#020617`, vidrio (`AUTH_CARD_STYLE`, `.reserva-receipt-card`) y resplandores esmeralda (`.hero-glow-blob`). La pizarra es una superficie de ese mundo, no un mundo nuevo.

- **Siempre oscura (REQUIERE INPUT 2).** El contenido va dentro de `dark dark-surface`, como `/para-complejos`, `PortalAuthFrame` y el modal de confirmar. La tiza blanca solo se lee sobre una pizarra oscura: en claro, la pizarra sería un pizarrón blanco con fibrón, que es otro objeto. El cromo del portal (barra, pie y barra inferior) sigue el tema del sistema, como en el resto del portal.
- **Fondo:** `night-slab`. La pizarra es un degradé radial de esmeralda muy oscuro (`#0b2a22`) a la losa (`#020617`), la misma familia que `.player-hero-band` en oscuro (`#07131d → #020617`). Arriba van las líneas de tiza.
- **La tiza:** `#f8fafc` (`foreground` en oscuro), al 55 % para las líneas de la cancha y al 100 % para el texto. Las jugadas activas (la flecha que se está dibujando, el hueco) van en `#6ee7b7` (`brand-label-dark`). Medido sobre `#0b2a22`, la tiza al 100 % da 17:1 y `#6ee7b7` da 12:1. Las líneas al 55 % son decoración y no llevan información.

### Tipografía

| Rol | Letra | Dónde |
|---|---|---|
| Titular de sección | Archivo 900 itálica, con un tramo en `.hero-accent-text` (The Slanted Title Rule) | Cada `h1` y `h2` |
| Cifras | Archivo 700 tabular | "Faltan 3", "Defensas: 4", dorsales |
| Texto | Inter 400 de 16 px (`portal-body`) | Todo el resto |
| Rótulos | Inter 500 y 600 | Botones, estados y chips |
| Microrrótulo | Sora 600 en mayúsculas (`font-logo`), como el eyebrow de `PlayerHeroBand` | "RIVAL powered by TurnoGol" |

- **Tamaños a 390 px:**
  - h1: 52 px, en 2 líneas;
  - h2: 40 px, 2 líneas como objetivo y 3 como máximo; en celulares bajos (hasta 740 px de alto), 32 px dentro de las escenas fijadas;
  - texto: 16 px; metadatos, leyendas y notas, 13 px; chips y microrrótulos, 12 px, como `StatusBadge`.
- **Tamaños desde `lg`:** h1 de `clamp(64px, 5.6vw, 88px)`, en 2 líneas, y h2 de `clamp(40px, 6.2vw, 88px)` a todo el ancho. En las columnas de las escenas partidas el h2 baja (entre 56 y 64 px) para no pasar de 3 líneas.
- **Propuesta (REQUIERE INPUT 3): el eje de ancho de Archivo.** Archivo es variable en peso y en ancho, de `wdth` 62 (extra condensada) a 125 (expandida), y está verificado en la API de Google Fonts.
  - Prenderlo en `next/font` (`axes: ['wdth']`) da una **Archivo Extra Condensed Black Italic** para la tapa de diario y los dorsales de la figurita, la voz de un diario deportivo argentino.
  - Es la misma familia y no suma dependencias ni licencias.
  - Sin el OK, la tapa usa Archivo 900 itálica normal.

### Color

- **Un solo verde que grita:** el botón "Armá tu partido" (The One Voice Rule). El resto susurra con texto o borde esmeralda. Las pecheras, los paneles de la jugada y los casilleros "Coincide" van en esmeralda 700 o más oscuro, nunca en el `primary` (`#10b981`), que queda solo para el botón y la banda ARMALO.
- **Estados con color, ícono y texto**, desde `src/lib/status-tone.ts`:

  | Rótulo | Tono | Ícono (Lucide) |
  |---|---|---|
  | "Ya disponible" | `success` | `CircleCheck` |
  | "Próximamente" | `neutral` | `Clock` |

  "Próximamente" no va en ámbar, porque el ámbar es solo de "Queda 1" (The Scarcity Amber Rule).
- **Oro de trofeo (propuesta, REQUIERE INPUT 4):** un token para las estrellas arriba del escudo, la Corona y la edición Oro de la figurita, nada más. Sería amber-300 `#fcd34d` sobre oscuro (11,8:1 sobre `#020617`), con su luz `#fef3c7` solo para el degradé de la figurita Oro, que lleva texto `#020617`. Ningún otro ámbar. Necesita su par documentado en DESIGN.md. Sin el OK, esas piezas van en blanco con borde esmeralda.
- **Colores de los clubes de ejemplo:** el escudo y la camiseta de un club inventado llevan sus propios colores, como una foto lleva los suyos. Son contenido, no tokens, y van con el rótulo "Ejemplo".

### Superficies y formas

Todo sale de recetas que ya están en `globals.css`; lo nuevo se agrega ahí con su par (The Recipe Rule):

| Pieza | Receta | ¿Existe? |
|---|---|---|
| Bloque de sección con vidrio | `.reserva-receipt-card` en oscuro | Sí |
| Chip de estado | `StatusBadge` + `TONE_BADGE` | Sí |
| La cancha en líneas de cal | `PitchLines` (hoy de `/explorar`): se generaliza a la cancha de tiza, vertical u horizontal, con trazo animable | Sí, a extender |
| La pizarra | Degradé radial `#0b2a22 → #020617`, con la cancha de tiza encima | **Nueva:** `.rival-pizarra` |
| El jugador en la pizarra | Círculo de 44 px: lleno de esmeralda 700 (pecheras), contorno de tiza (sin pechera) o punteado (el hueco) | **Nueva**, en componente |
| La tapa de diario | Papel claro sobre la pizarra, sostenido por un imán, sin sombra de color | **Nueva:** `.rival-tapa` |
| La figurita | Marco del club, foto, dorsal y franja de edición | **Nueva:** `.rival-figurita` |
| El escudo de piezas | SVG en capas (forma, banda, iniciales, estrellas) | **Nueva**, en componente |

Las esquinas son de 12 px (el `lg` del portal), de 16 px en tarjetas grandes y `full` en chips.

### Imágenes

- **El hero no lleva foto:** su imagen es la pizarra.
- **Una sola foto en la página:** `public/bg-hero-2.avif`, la cancha techada de noche con reflectores. Va en "Tu cancha", recortada por el círculo central de tiza, porque el motivo también recorta las fotos.
- **REQUIERE INPUT 10:** una sesión de fotos real de El Vagón de noche, sin personas reconocibles o con su permiso. Sería la foto del círculo y, más adelante, la del estadio de cada complejo.
- **Encontradas en Wikimedia Commons el 2026-10-30**, como candidatas que no se usan en el prototipo:
  - "Vista usual en los potreros de la ciudad de General Roca": una pelota y un cono sobre tierra, sin personas. Lucasmg10, CC BY-SA 4.0. [Ficha](https://commons.wikimedia.org/wiki/File:Vista_usual_en_los_potreros_de_la_ciudad_de_General_Roca.jpg).
  - "Potrero (1)" y "Potrero (2)": fútbol de potrero en Buenos Aires, 2008. Roblespepe, CC BY-SA 4.0. [Ficha](https://commons.wikimedia.org/wiki/File:Potrero_(1).jpg).

  Las tres son de día y chocan con la noche de La Previa. Las de potrero muestran personas reconocibles: en una pieza comercial, eso pide el permiso de cada uno (CCyC art. 53), y CC BY-SA obliga a compartir con la misma licencia cualquier versión editada. **Recomendación:** la sesión propia en El Vagón.
- **No se usa `bg-how-it-works`,** porque tiene logos de Nike (ver Follow-ups).
- **Se dibuja en código:** la pizarra, escudos, figuritas y la tapa. No hay fotos de profesionales, escudos reales ni camisetas reales (README, "Imagen").
- **Íconos:** Lucide, la única librería. Nada de emojis estructurales.

## Las secciones

Medidas a 390 px. Los wireframes tienen unos 40 caracteres de ancho, que es el ancho del celular. Cada sección arranca con su `h2`, su chip de estado y una bajada de 25 palabras como máximo.

### 0. Hero: "Cada partido cuenta."

**Estado:** sin chip, porque es la tesis. **Objetivo:** qué es, por qué importa y qué hacer, todo en el primer pantallazo, con la demo de lo que ya existe.

**Copy:**
- Microrrótulo: RIVAL powered by TurnoGol
- h1: Cada partido **cuenta.**
- Bajada: Armá el partido, cada uno toca Voy y, si falta 1, sale al tablón. Muy pronto, con tu club: la tabla, la Corona y tu categoría.
- Botón verde: **Armá tu partido** → `/rival/nuevo`
- Secundario (`outline`): **Mirá el tablón** → `/rival/tablon`
- En la pizarra:
  - "Ejemplo · Miércoles 21:00 · Fútbol 5";
  - el contador "Falta 1";
  - el botón "Voy", dentro del hueco.
- Leyenda de la pizarra: Ejemplo. Hoy tocás Voy y entrás. Muy pronto, además, elegís tu puesto en la cancha.
- Nota: Con tu cuenta de TurnoGol. Solo mayores de 18.

**La pizarra (lo que se puede tocar, v1 real):**
- Una cancha de Fútbol 5 dibujada con tiza, vista desde arriba.
- Nueve jugadores ya confirmados: 5 de pecheras, en círculos llenos de esmeralda 700, y 4 sin pechera, en círculos de contorno blanco. Cada círculo lleva la inicial de un nombre corto de ejemplo.
- Un hueco punteado en esmeralda, que es el botón "Voy". El contador de arriba dice "Falta 1".

Al tocar "Voy":
1. el hueco se llena (escala de .6 a 1 en 200 ms);
2. el contador pasa a "¡Estamos los 10!" con el chip "Se juega" (tono success, con tilde) y el pulso de 600 ms que ya existe (`animate-slot-pulse`). Va en una línea: así la pizarra no crece y no empuja los botones;
3. aparece "Reiniciar".

**Lo que es v1 y lo que es Próximamente:**
- **v1:** el contador, "Voy", el cupo y "¡Estamos los N!" (spec v1 §2).
- **La formación (Próximamente):** que el jugador tenga un puesto en la cancha.

La leyenda lo dice con todas las letras. La demo no guarda nada ni toca la base. Sin JavaScript se ve la pizarra quieta, con "Falta 1".

**390 px** (es el boceto que eligió Lazar, `pizarra.html` de la ronda):

```
┌──────────────────────────────────────┐
│ (TG TURNOGOL)          [Ingresar]    │ ← PortalHeader, pastilla overlay
│ RIVAL POWERED BY TURNOGOL            │
│ Cada partido                         │ ← 52 px, negra itálica
│ cuenta.                              │ ← .hero-accent-text
│ Armá el partido, cada uno toca Voy…  │ ← 16 px
│ ╭────────── pizarra ─────────────╮   │
│ │ Ejemplo · Mié 21:00 · F5       │   │
│ │ Falta 1                        │   │ ← contador
│ │  ┌──────┬───────┬──────┐       │   │
│ │  │   ○     ○      ○    │       │   │ ← sin pechera (contorno)
│ │  │      ○  ┄FALTA 1┄   │       │   │ ← el hueco + "Voy"
│ │  ├──────── ( ) ────────┤       │   │ ← mitad de cancha en tiza
│ │  │   ●     ●      ●    │       │   │ ← pecheras (llenos)
│ │  │      ●     ●        │       │   │
│ │  └──────┴───────┴──────┘       │   │
│ │ Ejemplo. Hoy tocás Voy y…      │   │
│ ╰────────────────────────────────╯   │
│ [ Armá tu partido ] [Mirá el tablón] │ ← 48 px: verde + outline
│ Con tu cuenta de TurnoGol. +18.      │
├──────────────────────────────────────┤
│ Explorar   RIVAL   Reservas   Cuenta │ ← PlayerBottomNav
└──────────────────────────────────────┘
```

A 844 px de alto, el h1, la bajada, la pizarra y los dos botones entran en el primer pantallazo, arriba de la barra inferior. Si no entran, la pizarra se achica (`max-height: 52svh`) antes de empujar los botones afuera.

**Escritorio (desde `lg`):**
- La pizarra es la forma gigante recortada de la ficha: una cancha horizontal que entra desde la derecha, ocupa más o menos desde la columna 6 hasta pasar el borde y queda recortada arriba, a la derecha y abajo.
- A la izquierda, sobre la losa, van el h1 en `clamp(64px, 6.4vw, 100px)`, la bajada y los dos botones.
- El hueco "Falta 1" queda en la mitad visible de la cancha, cerca del texto.

**Animación, la firma: "la tiza"** (una sola vez al cargar):

| Tiempo | Qué pasa |
|---|---|
| 0 a 900 ms | Las líneas de la cancha se dibujan: `stroke-dashoffset` de largo a 0, primero el contorno, después la mitad y el círculo central |
| 500 a 1.000 ms | Los nueve jugadores caen en su lugar desde 12 px más arriba, con opacidad, cada 50 ms |
| 1.050 ms | El hueco "Falta 1" late una vez (600 ms, `slot-pulse`) |
| 150 ms en adelante | El h1 sube 24 px línea por línea, cada 80 ms; después entran la bajada y los botones. El texto nunca espera a la tiza |

`stroke-dashoffset` pinta pero no mueve el layout. Sobre una sola SVG chica es barato, aunque no es transform ni opacidad. Con `prefers-reduced-motion`, la cancha aparece dibujada y los jugadores quietos.

**La salida, con el scroll:** al bajar, el texto sube 70 px y se apaga, mientras la pizarra sube 24 px y crece un 5 %. Las dos capas a distinta velocidad dan profundidad sin mover nada más.

### 1. Hoy ya se juega

**Estado:** Ya disponible. **Objetivo:** probar que RIVAL existe y anda antes de contar lo que viene, y explicar cómo se usa hoy.

**Copy:**
- h2: Chau, encuesta del **grupo.**
- Bajada: Así se juega hoy en RIVAL, en cuatro movimientos.
- **La jugada**, en cuatro pasos. Con movimiento se arman con el scroll sobre la pizarra (ver "La escena"); sin movimiento son paneles teñidos, de esmeralda oscuro a claro, sin números.
  - **Armás el partido.** Complejo, día, hora, formato y nivel: Tranqui, Parejo o Picante. Si la cancha ya está reservada en TurnoGol, el partido lo dice.
  - **Pasás el link al grupo.** Por WhatsApp, como siempre. El link muestra el partido y cuántos faltan.
  - **Cada uno toca Voy.** El cupo es de verdad: cuando se llena, se llena. El que llega tarde va al banco y entra solo si alguien se baja. Bajarse es un toque, sin drama. Y el fijo de la semana se repite sin armarlo de cero.
  - **¿Falta 1? Al tablón.** Publicás el mismo partido y se suma gente de afuera. Vos aceptás a cada uno, y recién ahí ve tu WhatsApp.
- **El tablón** (la placa cuadrada de la ficha):
  - h3: El tablón
  - Pestañas de texto: **Faltan 3** · **Se busca arquero** · **Busca rival**.
  - Cada pestaña cambia la tarjeta de ejemplo de la placa y su texto:
    - Faltan 3: Al partido le faltan jugadores. Te sumás con un pedido, y el organizador te acepta.
    - Se busca arquero: El puesto que nadie quiere y todos necesitan. Si atajás, acá te buscan.
    - Busca rival: Un equipo completo busca a otro equipo para jugar.
  - Una línea sobre el aviso por mail, que ya existe y se activa por complejo desde el tablón: "Y si querés, te avisamos por mail cuando busquen gente en tu complejo."
  - La acción, abajo de la placa: **Mirá el tablón** (`outline`). No va un botón "Avisame" en la landing: el aviso se pide por complejo, y el complejo se elige en el tablón.

En esta sección no hay botón verde: la acción principal ya está arriba, y las de la placa son `outline`.

**390 px, sin movimiento** (con movimiento, ver "La escena" más abajo):

```
│ [✓ Ya disponible]                    │
│ Chau, encuesta                       │
│ del grupo.                           │
│ Así se juega hoy en RIVAL…           │
│ ┌──────────────────────────────────┐ │ ← esmeralda 950
│ │ 1 Armás el partido               │ │
│ │ Complejo, día, hora, formato…    │ │
│ ├──────────────────────────────────┤ │ ← esmeralda 900
│ │ 2 Pasás el link al grupo         │ │
│ │ Lo mandás por WhatsApp…          │ │
│ ├──────────────────────────────────┤ │ ← esmeralda 800
│ │ 3 Cada uno toca Voy              │ │
│ │ El que llega tarde va al banco…  │ │
│ ├──────────────────────────────────┤ │ ← esmeralda 700, texto claro
│ │ 4 ¿Falta 1? Al tablón.           │ │
│ │ Lo publicás y lo ve el complejo… │ │
│ └──────────────────────────────────┘ │
│ El tablón                            │
│ ┌──────── placa cuadrada ──────────┐ │
│ │   ( círculo de tiza con la       │ │
│ │     tarjeta de ejemplo adentro ) │ │
│ └──────────────────────────────────┘ │
│ Faltan 3 · Se busca arquero · Busca… │ ← pestañas de texto
│ Al partido le faltan jugadores…      │
│ [ Mirá el tablón ]                   │ ← outline, 48 px
│ Y si querés, te avisamos por mail…   │
```

**La escena (fijada, unas 4 pantallas de scroll):** el titular, el paso actual y la pizarra quedan quietos mientras el scroll arma el partido en cuatro tiempos. Abajo del paso, cuatro rayitas marcan el avance.
1. **Armás el partido:** la tiza dibuja la cancha al ritmo del scroll y aparece la tarjeta "Miércoles 21:00 · Fútbol 5 · Nivel Parejo · Reservada en TurnoGol".
2. **Pasás el link al grupo:** entra la burbuja del link ("Faltan 9 · Tocá Voy"); el primero ya está adentro.
3. **Cada uno toca Voy:** los jugadores caen uno por uno y el contador baja de "Faltan 9" a "Falta 1".
4. **¿Falta 1? Al tablón:** sale la tarjeta "En el tablón: Falta 1", entra el "+1" en el hueco y el contador pasa a "¡Estamos los 10!" con el chip "Se juega" y su pulso.

Las tarjetas se turnan: hay una sola arriba de la cancha por paso. La del tablón va abajo a la derecha en el celular y arriba a la derecha en escritorio, para no tapar el hueco. El paso cambia con un fundido y una subida de 14 px (350 ms).

**Escritorio:** las dos columnas de la ficha: el titular y el paso a la izquierda (5 columnas), la pizarra a la derecha (7).

**Sin movimiento o sin JavaScript:** la escena no se fija. Los cuatro pasos se ven como paneles teñidos y la pizarra muestra el partido completo.

**El tablón** va después de la escena, en la página normal: la placa cuadrada a la izquierda; pestañas, texto y acciones a la derecha. Al cambiar de pestaña, la tarjeta de la placa se cruza con un fundido de 200 ms.

### Mitad de cancha

**Estado:** es la frontera.

**Copy:**
- **Hasta acá, lo que ya se juega.**
- De acá para allá, lo que viene. Todo lo que sigue dice "Próximamente" hasta que esté en la cancha.

**Composición:** la banda del motivo. Es la línea de mitad de cancha en tiza a todo el ancho, con el círculo central en el medio (unos 200 px a 390 px) y las dos frases a cada lado de la línea: una arriba y otra abajo en el celular, a izquierda y derecha en escritorio.

**Animación, atada al scroll (de paso, sin fijar la página):**
- La línea crece del centro a los bordes a medida que la banda sube (`scaleX`).
- El círculo central se cierra cuando la banda llega a la mitad de la pantalla (`stroke-dashoffset`).
- Las dos frases entran desde lados opuestos: la de arriba desde la izquierda y la de abajo desde la derecha.
- Si se scrollea para arriba, todo se desarma.

### 2. ¿De qué categoría sos?

**Estado:** Próximamente. **Objetivo:** el gancho de ego. Es lo más compartible de RIVAL y lo que todo futbolero quiere saber.

**Copy:**
- h2: ¿De qué **categoría** sos?
- Gancho: Todos dicen que son de Primera. La cancha lo dice.
- La escala, de abajo hacia arriba: Novena · Octava · Séptima · Sexta · Quinta · Cuarta · Reserva · Primera, y arriba de todo, **Selección de la zona**.
- Cómo funciona (3 líneas):
  - **Declarás y la cancha confirma.** Arrancás con tres preguntas y un "?" al lado. A los 10 partidos oficiales con tu club, se va el "?".
  - **Subís en el momento. Bajás despacio.** Solo al cierre de la temporada, y como mucho una categoría. Una mala noche no te manda abajo.
  - **Es tuya.** La ves vos. Pública, solo si querés.
- Selección: Arriba de Primera está la Selección de la zona: los mejores de cada temporada, entre los que eligieron mostrarse.
- Puente a la sección 3: Sin club no hay categoría oficial.

Fuente de cada línea: `categorias.md`. El founder decidió la escala, el techo en Quinta, el "?" hasta 10 partidos, la visibilidad y el descenso blando. **No van al copy** los 11 lugares de la Selección: son propuesta (REQUIERE INPUT 8).

**El quiz** (lo que se puede tocar; REQUIERE INPUT 7):
- "Probá: ¿de qué categoría arrancarías?";
- las 3 preguntas cerradas de `categorias.md`, en chips de 44 px:
  - ¿Cuánto jugás? 1 vez por semana · 2 o 3 · 4 o más.
  - ¿Dónde jugaste? Picados · Liga amateur · Inferiores de un club · Federado.
  - ¿Tu puesto? Arquero · Defensor · Mediocampista · Delantero.
- el resultado: "Arrancarías en **Sexta?**". Debajo, "Nadie arranca más arriba de Quinta. El '?' se va con 10 partidos oficiales: la cancha no miente.";
- botones: "Probar de nuevo" y, cuando exista, "Compartir" (Próximamente);
- la nota: "No guardamos tus respuestas."

Tabla propuesta para el quiz. Es una propuesta: no la definió el founder y necesita su OK.

| ¿Dónde jugaste? | 1 vez por semana | 2 o 3 | 4 o más |
|---|---|---|---|
| Picados | Novena | Octava | Séptima |
| Liga amateur | Octava | Séptima | Sexta |
| Inferiores de un club | Séptima | Sexta | Quinta |
| Federado | Sexta | Quinta | Quinta (techo) |

El puesto no cambia la categoría: queda para la figurita y la Selección.

**La escena (fijada, unas 3 pantallas):** la escalera se sube con el scroll.
- En el centro, la categoría en Archivo negra itálica gigante (15vw en el celular, hasta 210 px en escritorio). Cambia de Novena a Primera y a la Selección como un marcador: cada cambio sube la palabra en 550 ms.
- Abajo, el riel de tu arco al arco rival, con las 9 marcas. La pelota avanza atada al scroll y la tiza la sigue.
- En el celular, arriba, la escalera completa en microrrótulos: la actual se ilumina y se corre 10 px.
- En Quinta aparece "Techo del arranque: nadie empieza más arriba." En la Selección, "Selección de la zona: los mejores de cada temporada."

**390 px:**

```
│ [◷ Próximamente]                     │
│ ¿De qué                              │
│ categoría sos?                       │
│ Todos dicen que son de Primera…      │
│ SELECCIÓN DE LA ZONA                 │ ← la escalera en microrrótulos
│ PRIMERA                              │
│ …                                    │
│   QUINTA   ← la actual, iluminada    │
│ …                                    │
│ Quinta                               │ ← gigante, cambia con el scroll
│ Techo del arranque: nadie empieza…   │
│ |──|──|──|──●──|──|──|──|            │ ← el riel; la pelota avanza
│ Tu arco                Arco rival    │
```

**Escritorio:** el riel lleva el nombre de cada categoría debajo de su marca, y la escalera en microrrótulos no hace falta.

**Después de la escena:** las tres reglas a la izquierda y el quiz a la derecha (en el celular, una abajo de la otra). Al terminar el quiz, el resultado reemplaza a las preguntas con una View Transition (`view-transition-name: rival-quiz`, 300 ms), y el "?" late una vez (600 ms, la receta de `slot-pulse`).

**Sin movimiento:** la escalera es una lista de las 9 categorías con Quinta marcada como techo, y la pelota queda en Quinta.

### 3. Grupo no es club

**Estado:** mixto. El chip va en cada columna y en cada ítem.

**Objetivo:** explicar el modelo de RIVAL, que es la decisión del 30/10, y por qué conviene armar un club.

**Copy:**
- h2: El fijo es para **jugar.** El club, para competir.
- Columna "El grupo":
  - el texto: El fijo de los miércoles, pecheras contra sin pechera. Muy pronto, cada picado va a sumar a tus partidos jugados, y nada más: sin tabla, sin goles, sin figura. (Hoy el contador de la cuenta solo cuenta reservas propias; ver la tabla de estado.)
  - **La convocatoria** [Ya disponible]: el partido del grupo, con su link.
  - **La formación** [Próximamente]: una cancha dibujada, cada uno toca su puesto y los huecos salen al tablón: "Faltan 2: un defensor y un delantero".
  - **Pan y queso** [Próximamente]: equipos parejos para el picado, sin mostrar el nivel de nadie.
- Columna "El club" [Próximamente]: Un equipo serio que vive en TurnoGol: nombre, escudo, plantel, títulos y antigüedad. Juega contra otros clubes, y esos partidos sí cuentan.
- Cierre: ¿Tu grupo juega en serio? Que tus partidos cuenten: **armá tu club.**

**La escena (fijada, unas 3 pantallas): el picado se ordena en club.**
- Arranca con diez círculos sueltos por toda la cancha, pecheras y sin pechera mezclados: el fijo.
- Con el scroll, cada uno viaja a su lugar (transform, con un escalonado corto): cinco titulares en formación en una mitad y cinco suplentes en la línea de afuera. Los de contorno se pintan del color del club.
- A mitad de camino aparece el escudo de ejemplo en el círculo central y, del otro lado, un escudo punteado: otro club.
- El titular cambia de peso: "El fijo es para jugar." se apaga y "El club, para competir." se prende. Abajo, el texto del grupo se cruza con el del club.

**390 px:**

```
│ El fijo es para jugar.               │
│ El club, para competir.              │ ← se prende con el scroll
│ ╭──────── pizarra ──────────╮        │
│ │  ●  ○    ●     ○    ●     │        │ ← arranca: el picado suelto
│ │     ○  ●    ○     ●  ○    │        │
│ │      ↓ con el scroll ↓    │        │
│ │ ●  ●       (⛉)    ┆⛉┆     │        │ ← termina: formación, escudo
│ │   ●  ●                    │        │   y otro club, punteado
│ ╰───────────────────────────╯        │
│  ●●●●● Suplentes                     │
│ El grupo ⇄ El club                   │ ← los textos se cruzan
```

**Escritorio:** el texto a la izquierda (5 columnas) y la pizarra a la derecha (7).

**Después de la escena:** "El grupo, hoy y lo que viene", con la convocatoria (Ya disponible), la formación y Pan y queso (Próximamente), y el cierre "¿Tu grupo juega en serio? Que tus partidos cuenten: armá tu club." En el celular la lista no entra en la escena fijada, por eso va afuera.

**Sin movimiento:** el club ya está en formación y los dos textos se ven uno abajo del otro.

### 4. Fundá tu club

**Estado:** Próximamente. **Objetivo:** que el capitán quiera fundar el suyo.

**Copy:**
- h2: Fundá tu **club.**
- Bajada: Nombre, escudo, camiseta y cancha de local. Desde el día que lo fundás, corre su historia.
- Los rasgos (lista de 8, cada uno una línea):
  - **El nombre.** La IA te propone nombres con humor de potrero, y vos elegís.
  - **El escudo y la camiseta.** El escudo se arma de piezas.
  - **El plantel.** Entra quien acepta la invitación. Un club por jugador.
  - **Los dorsales.** El 10 se pelea.
  - **El mercado de pases.** Se cambia de club solo en las ventanas de cada temporada. Cada fichaje sale con su tarjeta: "Es oficial".
  - **El palmarés.** Una estrella arriba del escudo por cada título.
  - **La hinchada.** Cualquiera puede seguir a tu club.
  - **La historia.** La escribe la IA con los datos reales, sin nombrar a nadie.
- Nombres de ejemplo, en una lista de 5 rotulada "Ejemplo" (REQUIERE INPUT 9):
  - Los Mismos de Siempre
  - Deportivo Rejunte
  - Deportivo Después Te Transfiero
  - La Banda del Rulo
  - Villa Resaca

**El párrafo con palabras-imagen** (el plano de la ficha, en lugar de una grilla de rasgos). Va en Archivo 700, de 24 px en el celular y 36 px como máximo en escritorio:

> Fundá tu club con nombre y escudo [escudo], camiseta con tu número [camiseta 10] y un plantel que acepta la invitación [tres círculos de tiza]. Cada título suma una estrella arriba del escudo [estrella].

Cada [ ] es una ventanita de 1em de alto dentro del texto, con la pieza dibujada en SVG. Las piezas son de "Los Mismos de Siempre", un club de ejemplo. Debajo del párrafo van los ocho rasgos, en lista con viñetas de tiza.

**La demo del escudo:** el escudo grande de "Los Mismos de Siempre" primero se dibuja con tiza, solo el contorno, y después se pinta pieza por pieza: la forma, la banda, las iniciales y la estrella. Lleva el rótulo "Ejemplo".

**390 px:**

```
│ [◷ Próximamente]                     │
│ Fundá tu club.                       │
│ Nombre, escudo, camiseta y cancha    │
│ de local. Desde el día que lo…       │
│ Fundá tu club con nombre y escudo    │ ← el párrafo, 24 px,
│ [⛉], camiseta con tu número [10] y   │   con las piezas adentro
│ un plantel que acepta [◯◯◯]. Cada    │
│ título suma una estrella [★]…        │
│          ╭─────────╮                 │
│          │  ESCUDO │ ← tiza, después │
│          ╰─────────╯   se pinta      │
│   EJEMPLO · Los Mismos de Siempre       │
│ ◯ El nombre. La IA te propone…       │ ← viñetas de tiza
│ ◯ El escudo y la camiseta…           │
│ ◯ El plantel…                        │
│ ◯ Los dorsales. El 10 se pelea.      │
│ ◯ El mercado de pases… "Es oficial"  │
│ ◯ El palmarés…                       │
│ ◯ La hinchada…                       │
│ ◯ La historia…                       │
```

**Escritorio:** el párrafo va a lo ancho de las columnas 1 a 11. Debajo, el escudo grande a la izquierda (unos 360 px) y los rasgos en dos columnas a la derecha.

**La escena (fijada, unas 2,6 pantallas):** el escudo y el párrafo se arman juntos con el scroll.
- Primero la tiza dibuja el contorno del escudo; después se pintan la forma, la banda, las iniciales y la estrella, una detrás de otra (opacidad y escala).
- Al mismo tiempo, el párrafo se lee palabra por palabra: cada palabra pasa de 18 % a 100 % de opacidad cuando el scroll llega a ella, y las piezas dentro del texto se prenden con su palabra.
- Los rasgos y los nombres de ejemplo van después de la escena.
- Sin movimiento: el escudo pintado y el párrafo entero.

### 5. El partido oficial

**Estado:** Próximamente. **Objetivo:** que se entienda que entre clubes se juega por algo, y qué es "oficial".

**Copy:**
- h2: Club contra club. Esto **cuenta.**
- Bajada: El partido oficial es entre dos clubes, con turno en un complejo TurnoGol. Al final, los dos capitanes confirman el resultado en un toque, o lo confirma el encargado. Si no coinciden, no cuenta.
- Los rasgos:
  - **La cartelera de la zona.** Los partidos que se vienen, con los dos escudos.
  - **La tabla.** Por zona, formato y división. Aparece el club que quiere.
  - **Divisiones y temporadas.** Ascensos, descensos y "¡Zafamos!".
  - **Clásicos.** Cuando dos clubes se cruzan seguido, nace el clásico, con su historial.
  - **La Corona del complejo.** Un club la tiene y cualquiera lo desafía. Si le ganás, te la llevás.
  - **Desafío y revancha.** En un toque, por WhatsApp.
  - **¿Volverían a jugar?** Después del partido, cada equipo dice sí o no del rival. Lo bueno se ve; lo malo no se le muestra a otros jugadores. (El sistema sí lo usa, para no volver a emparejarlos y para moderar: README. Va a asesoría con el resto de la sección 9.)
  - **El álbum de la zona.** Cada club que enfrentás, a tu álbum.

**La demo de la Corona:** dos escudos de ejemplo, "Los Mismos de Siempre" contra "Deportivo Rejunte", con un marcador "Ejemplo". La Corona arranca sobre el primero, y con el scroll salta al segundo. "Defensas" vuelve a 0 y aparece "Nuevo campeón".

**390 px:**

```
│ [◷ Próximamente]                     │
│ Club contra club.                    │
│ Esto cuenta.                         │
│ El partido oficial es entre dos…     │
│ ┌──────────── EJEMPLO ─────────────┐ │
│ │      ♛                           │ │ ← la Corona viaja
│ │ [ESCUDO A]  3 – 4  [ESCUDO B]    │ │   de A a B
│ │ Los Mismos de S. · Dep. Rejunte  │ │
│ │ Nuevo campeón de la Corona       │ │
│ └──────────────────────────────────┘ │
│ ◯ La cartelera…                      │ ← viñetas de tiza,
│ ◯ La tabla…                          │   una columna
│ ◯ Divisiones y temporadas…           │
│ ◯ Clásicos…                          │
│ ◯ La Corona del complejo…            │
│ ◯ Desafío y revancha…                │
│ ◯ ¿Volverían a jugar?…               │
│ ◯ El álbum de la zona…               │
```

**Escritorio:**
- El marcador va sobre la pizarra, a todo el ancho, con un escudo en cada arco.
- Debajo van los rasgos, en el plano de menú de dos columnas: el círculo de tiza de 52 px como viñeta, el nombre en negrita de 18 px y el texto debajo, de 16 px.
- No hay cajas ni íconos en cuadrados tintados.

**La escena (fijada, unas 2,8 pantallas):**
- Primero el marcador rueda de 3–3 a 3–4: los dígitos suben, en 300 ms.
- Después la Corona viaja de A a B por un arco de tiza, atada al scroll: la flecha se dibuja y la Corona se traslada.
- Al llegar, "La Corona del complejo · Defensas: 2" pasa a "Nuevo campeón de la Corona · Defensas: 0". Si se scrollea para arriba, la Corona vuelve.
- Los rasgos van después de la escena.
- Sin movimiento: la Corona sobre B y el marcador final.

### 6. Tercer tiempo

**Estado:** Próximamente. **Objetivo:** el pico emocional. Lo que se gana se cuenta y se comparte.

**Copy:**
- h2: Que se **sepa.**
- Bajada: Después del partido viene lo mejor: el resultado, la figura y la tapa. Todo listo para pegar en el grupo y en tu historia.
- Los rasgos:
  - **La figura.** La vota el rival, así no se arregla entre amigos.
  - **La tapa.** La IA escribe la crónica de cada partido oficial, con titular de diario deportivo. Habla de clubes y resultados: no nombra a nadie.
  - **La figurita.** Tu carta: foto, dorsal, club y números verdaderos. Con ediciones que se ganan jugando: Debut, Plata, Oro, Campeón, Figura y Fundador.
  - **Tarjetas para todo.** Resultado, fichaje, ascenso, "¡Subí a Quinta!", la Corona. Con un botón: "Que se sepa".
  - **Tu carrera.** Ganados, empatados y perdidos, clásicos, títulos y logros con nombre de crónica, como Centenario o Matador de clásicos. Algunos están ocultos.
  - **Versus.** Tu carrera contra la de un amigo, si los dos aceptan.
  - **Tu Temporada.** El resumen de tu año, para compartir.
- Y toda la semana (antes, sección 7):
  - **El desafío de la semana.** Un reto nuevo para clubes y jugadores.
  - **El Diario de la Zona.** Los lunes, la edición de tu zona: resultados, la tabla, el clásico y la goleada.

**La tapa de ejemplo** (`.rival-tapa`, con el rótulo "Ejemplo") va pegada a la pizarra con un imán, como el recorte que el DT pega en el vestuario:
- titular: **SE TERMINÓ EL REINADO** (sale del README);
- bajada: "Deportivo Rejunte le sacó la Corona a Los Mismos de Siempre en la noche del jueves.";
- sin nombres de personas, como manda la decisión del 30/10.

**El mazo de figuritas de ejemplo:** cinco figuritas (Debut, Plata, Oro, Figura y Fundador) en un carrusel horizontal con `scroll-snap`. Cada una tiene una silueta en lugar de foto, el dorsal en Archivo condensada si se aprueba la 3, el club inventado y "Ejemplo".

**390 px:**

```
│ [◷ Próximamente]                     │
│ Que se sepa.                         │
│ Después del partido viene lo mejor…  │
│ ┌──────────── EJEMPLO ─────────────┐ │
│ │ ● EL DIARIO DE LA ZONA           │ │ ← la tapa se pega (● el imán)
│ │ SE TERMINÓ                       │ │
│ │ EL REINADO                       │ │
│ │ Deportivo Rejunte le sacó la…     │ │
│ └──────────────────────────────────┘ │
│ ◯ La figura…  ◯ La tapa…             │
│ ┌────┐┌────┐┌────┐  →  (deslizá)    │ ← mazo con scroll-snap
│ │ 10 ││ 7  ││ 1  │                   │
│ │Oro ││Deb.││Fig.│                   │
│ └────┘└────┘└────┘                   │
│ ◯ Tarjetas… [Que se sepa]            │
│ ◯ Tu carrera… ◯ Versus… ◯ Tu Tempor. │
```

**La escena: scroll horizontal fijado.** La sección se fija y el scroll vertical corre el mazo de costado: la tapa, las cinco figuritas y una tarjeta 9:16 de ejemplo ("¡Subí a Quinta!", con "Que se sepa").
- Cada pieza se inclina según lo lejos que está del centro (hasta 7°) y baja un poco; la del centro queda derecha.
- La Oro tiene un brillo que la cruza al pasar por el centro: una capa con degradé que se traslada (`translateX`).
- La tapa lleva el imán arriba, como recorte pegado en la pizarra.
- Los rasgos van después de la escena.

**Escritorio:** la misma escena, con piezas más grandes y el mazo arrancando en el borde de la grilla.

**Sin movimiento:** el mazo es un carrusel con scroll horizontal nativo y `scroll-snap`, sin inclinación ni brillo.

### 7. Todos los días (sacada)

Decisión de Lazar (2026-10-30): **el Crack del Día no es parte de RIVAL.** Es un jueguito de TurnoGol que vive en la home, al lado del buscador de canchas (un acceso al costado o un botón flotante: "Adiviná el crack del día"). Se juega con las letras del apellido, como los Wordle de fútbol. Detalle: [`crack-del-dia.md`](crack-del-dia.md).

Sin el Crack, a la sección le faltaba su demo y su razón de ser. Los otros rasgos pasan a la lista de la sección 6 ("Y toda la semana"):
- **El desafío de la semana.** Un reto nuevo para clubes y jugadores.
- **El Diario de la Zona.** Los lunes, la edición de tu zona: resultados, la tabla, el clásico y la goleada.

Los números de sección no se corren, para no romper las referencias del resto del doc.

### 8. Tu cancha

**Estado:** Próximamente. **Objetivo:**
- que el jugador quiera que su cancha esté en TurnoGol (es el círculo de "Pedí tu cancha");
- que el dueño que pasa vea por qué le conviene.

**Copy:**
- h2: Tu cancha, tu **estadio.**
- Bajada: Cada complejo TurnoGol tiene su página RIVAL: la Corona en juego, los clásicos que se juegan ahí y sus leyendas.
- Rasgos:
  - **Leyenda de la cancha.** La gana el que más juega ahí. Premia la constancia, no el talento.
  - **Complejo de la zona.** Cada mes, el complejo con más vida RIVAL.
  - **Sede oficial RIVAL.** El sticker en la puerta, con QR.
  - **Hora RIVAL.** El complejo publica partidos de la casa con la Corona en juego.
- Bloque **Pedí tu cancha** [Próximamente]: ¿Jugás en un complejo sin TurnoGol? Pedilo, y le llevamos tu pedido. (El README suma "Fundador de la sede" para los que lo pidieron; no va al copy hasta decidir la marca: REQUIERE INPUT 15.)
- Para dueños: ¿Tenés un complejo? **Conocé TurnoGol para complejos** → `/para-complejos`. Es un link, no un botón verde.

Nunca se dice "te traemos jugadores" ni "llenamos tu cancha".

**Composición:**
- El complejo visto desde arriba, en tiza: cinco canchas como rectángulos, cada una con su círculo central.
- El círculo central de la cancha del medio es una ventana: adentro va la foto `bg-hero-2` (la cancha de noche), la única foto de la página.
- El sticker "Sede oficial RIVAL" va pegado en una esquina de la pizarra.
- Los rasgos van con viñetas de tiza, y "Pedí tu cancha" va en un bloque de vidrio aparte, con su chip.

**La escena (fijada, unas 2,6 pantallas): el zoom al estadio.**
- La pizarra lleva el rótulo "Ejemplo", y el `alt` de la foto también lo dice: "Foto de ejemplo: una cancha de fútbol 5 iluminada de noche". El sticker es de ejemplo, no un complejo certificado. Antes de publicar, confirmar de dónde sale `bg-hero-2`, que hoy usa la home.
- El círculo central de la cancha del medio es una ventana con la foto.
- Con el scroll, la ventana crece de 28 % a casi toda la pizarra, mientras la foto se acomoda (escala 1,3 a 1) y las otras canchas se apagan. Es transform y opacidad, sin `clip-path`.
- Al final se pega el sticker "Sede oficial RIVAL": escala de 1,15 a 1 con un giro de 3°, en 300 ms.
- Los rasgos y "Pedí tu cancha" van después de la escena.
- Sin movimiento: la foto abierta y el sticker pegado.

### 9. Las reglas del vestuario

**Estado:** sin chip. Son reglas que valen hoy en v1 y para todo lo que venga. **Objetivo:** confianza. Competir sin miedo al escrache es un diferencial, y la ley lo exige. Además, responde las preguntas que quedan.

**Copy:**
- h2: Competir sin **escrache.**
- Bajada: Las reglas del vestuario valen para todo RIVAL: lo que ya se juega y lo que viene.
- **Las preguntas**, con el plano de acordeón de baldosas de la ficha. Se abre una por vez (`<details name="rival-reglas">`), y la abierta pasa a esmeralda oscuro:

| Pregunta | Respuesta |
|---|---|
| ¿Qué puedo usar hoy? | El partido del grupo y el tablón. Lo que dice "Próximamente" está en camino. |
| ¿Cuándo llega lo que dice "Próximamente"? | Por partes y sin fecha. Cada parte sale cuando está lista, y acá pasa de "Próximamente" a "Ya disponible". |
| ¿Quién va a ver mi categoría? | La categoría llega muy pronto, y la vas a ver vos. Mostrarla, aparecer en una tabla o mostrar tu figurita lo vas a elegir vos, y lo vas a poder volver a ocultar. |
| ¿Se va a ver cuando me va mal? | No se le va a mostrar a otros jugadores. Cuando lleguen las tablas, lo bueno se ve y lo malo no: nadie ve a otro abajo de una tabla. |
| ¿Qué partidos van a contar? | Para la tabla y la categoría, que llegan muy pronto, solo lo verificado: partidos entre clubes, con turno en un complejo TurnoGol y el resultado confirmado. |
| ¿Alguien puede escribir algo sobre mí? | No. En RIVAL no hay comentarios ni notas de una persona a otra. Y la tapa, cuando llegue, va a hablar de clubes y resultados. |
| ¿Cuánto sale? | Nada. RIVAL es gratis para el jugador. |

Lo que todavía no existe se responde en futuro: la sección no lleva chip, pero no promete en presente nada que sea "Próximamente".
| ¿Hay plata en juego? | No. Ni apuestas ni plata entre jugadores. |
| ¿Desde qué edad? | Solo mayores de 18. |
| ¿Qué pasa con mis datos? | Son tuyos: los podés ver, corregir, descargar o borrar (Ley 25.326). |

- Link: Términos y privacidad.

Cada respuesta es un compromiso público y tiene que coincidir con los textos legales (REQUIERE INPUT 13).

**Composición:**
- En escritorio, el h2 queda fijo a la izquierda mientras se scrollea (columnas 1 a 4), y las baldosas van a la derecha.
- En el celular, el h2 va arriba y las baldosas a todo el ancho, con 64 px de alto como mínimo cuando están cerradas.
- Es la pausa calma de la página: sin demo, y sin más animación que la entrada (`Reveal`) y el abrir de cada baldosa (200 ms).

### 10. Temporada Cero

**Estado:** Próximamente. **Objetivo:** el cierre, con FOMO real y una acción que existe hoy.

**Copy:**
- h2: Temporada **Cero.**
- Texto: Los primeros clubes se fundan en la Temporada Cero, y los que la jueguen quedan como Fundadores. La primera temporada pasa una sola vez.
- Puente: Mientras tanto, armá el partido de esta semana.
- **La banda ARMALO**, con el plano "una palabra es el botón":
  - una banda esmeralda (`primary`) a todo el ancho, de 46svh en el celular y 60svh en escritorio, que es un solo link a `/rival/nuevo`;
  - adentro, "ARMALO" en Archivo 900 itálica, tan grande que ocupa el ancho (unos 22vw), en el color de la losa;
  - arriba a la izquierda, "Armá el partido de esta semana", y arriba a la derecha, una flecha;
  - el nombre accesible del link es "Armá el partido de esta semana";
  - es el único verde de esa pantalla.
- Debajo, como link: Mirá el tablón.

Ese FOMO es real (`categorias.md`): la primera temporada ocurre una sola vez. No hay fecha ni cupo hasta que existan de verdad.

**Composición:** la pizarra recién borrada, con los rastros de la tiza vieja, y en el centro "Temporada Cero". La primera temporada se escribe en una pizarra en blanco.

**La escena (fijada, unas 2,2 pantallas):**
- El borrador cruza la pizarra atado al scroll, y la jugada vieja baja de 55 % a 12 % de opacidad a su paso.
- Aparece "Temporada Cero." y cae el sello "FUNDADOR": escala de 1,3 a 1 y opacidad en 300 ms, en blanco tiza y en Archivo condensada si se aprueba la 3, para no competir con el verde de la banda.

**La banda ARMALO, atada al scroll (de paso):** las seis letras suben desde abajo, una detrás de otra, mientras la banda entra en pantalla. Con hover y foco, fondo y texto se invierten al instante.

**Sin movimiento:** la pizarra limpia, el sello puesto y la palabra entera.

### Pie

Es el `SiteFooter` del portal, sin cambios. Arriba del pie va "RIVAL" en Archivo negra itálica a todo el ancho, con trazo de tiza (contorno, sin relleno), como el nombre del equipo escrito en la pizarra. El trazo se dibuja con el scroll.

## Movimiento

Pedido de Lazar (2026-10-30): **la página se mueve con el scroll**, con motion graphics limpios y un efecto "wow" muy coreografiado, pero sin que la web se ponga lenta. El prototipo lo prueba sin librerías; en producción va GSAP si pasa la medición (ver "Con GSAP").

### Gramática

- **Una sola firma al cargar: la tiza.** Se dibuja la cancha, caen los jugadores y queda el hueco. Es lo único que se mueve sin que el usuario haga nada.
- **Después, todo lo mueve el scroll.** Hay dos tipos de escena:
  - **Fijadas** (`position: sticky`): la sección se queda en pantalla de 2 a 4 pantallas de scroll mientras su jugada se arma. Son la jugada de hoy, la escalera, el picado que se ordena en club, el escudo, la Corona, el mazo de costado, el zoom a la cancha y la Temporada Cero.
  - **De paso:** se arman mientras cruzan la pantalla, sin fijarse. Son la mitad de cancha, la banda ARMALO y el "RIVAL" del pie.
- **Todo es reversible.** Scrollear para arriba desarma la jugada.
- **El scroll es nativo.** No hay scroll suavizado ni secuestrado (nada del tipo Lenis): el dedo manda. Lo que se suaviza es la escena, que sigue al scroll con un retraso corto (un 22 % del camino por cuadro). Así se siente fluida sin frenar el dedo.
- **Una idea por escena.** Cada escena mueve una sola cosa grande; el resto entra con `Reveal` (16 px y opacidad, 700 ms, una vez).
- **Solo transform y opacidad**, más el trazo de tiza (`stroke-dashoffset`) en SVG chicos (REQUIERE INPUT 14). Nunca ancho, alto ni posición.
- **Sin rebotes ni resortes.** Una sola curva, `cubic-bezier(.2, .8, .2, 1)`; donde manda el scroll, la curva es un smoothstep sobre el avance.
- **Los controles** (botones, chips del quiz, pestañas del tablón, baldosas) respetan los 200 ms del sistema.
- **Sin loops infinitos** (DESIGN.md).
- **Con `prefers-reduced-motion`, ninguna escena se fija.** La página se lee como una página normal y cada pieza está en su estado final:
  - la cancha dibujada y los cuatro pasos como lista;
  - la escalera como lista, con Quinta marcada;
  - el club en formación y el escudo pintado;
  - la Corona en B;
  - el mazo como carrusel nativo;
  - la grilla dada vuelta y la foto abierta;
  - la pizarra borrada y la palabra ARMALO entera.

  Sin JavaScript pasa lo mismo.
- **Con `prefers-reduced-motion` tampoco hay demoras.** Las entradas escalonadas usan `animation-delay` y `transition-delay`; si el bloque de movimiento reducido solo acorta la duración, el contenido igual aparece tarde y de a uno. El bloque las lleva a 0.

### Las escenas, una por una

| Sección | Tipo | Largo | Qué arma el scroll | Sin movimiento |
|---|---|---|---|---|
| Hero | Al cargar + salida | — | Al cargar, la tiza. Al salir, el texto sube 70 px y la pizarra 24 px, y la pizarra crece un 5 % | Quieto |
| 1. Hoy | Fijada | 4,2 pantallas | Cancha → tarjeta del partido → link → los nueve "Voy" → tablón → "+1" y "¡Estamos los 10!" | Lista de 4 pasos y partido completo |
| Mitad de cancha | De paso | — | La línea crece del centro, el círculo se cierra y las frases entran de lados opuestos | Dibujada |
| 2. Categoría | Fijada | 3,2 pantallas | La categoría gigante cambia de Novena a la Selección; la pelota avanza por el riel | Lista con Quinta marcada |
| 3. Grupo no es club | Fijada | 3 pantallas | Diez círculos sueltos se ordenan en formación y suplentes; aparece el escudo | En formación |
| 4. Fundá tu club | Fijada | 2,6 pantallas | El escudo se dibuja y se pinta; el párrafo se lee palabra por palabra | Pintado y entero |
| 5. Partido oficial | Fijada | 2,8 pantallas | El marcador rueda y la Corona viaja de A a B por el arco | Corona en B |
| 6. Tercer tiempo | Fijada, horizontal | Lo que mide el mazo | El mazo corre de costado; cada pieza se inclina según su distancia al centro; brilla la Oro | Carrusel nativo con `scroll-snap` |
| 8. Tu cancha | Fijada | 2,6 pantallas | La ventana del círculo central crece hasta casi toda la pizarra; se pega el sticker | Abierta |
| 9. Reglas | — | — | Solo `Reveal` y el abrir de cada baldosa (200 ms) | — |
| 10. Temporada Cero | Fijada | 2,2 pantallas | El borrador cruza la pizarra, aparece el título y cae el sello | Borrada |
| ARMALO | De paso | — | Las seis letras suben una detrás de otra | Entera |
| Pie | De paso | — | "RIVAL" se dibuja con trazo de tiza | Dibujado |

Los largos son los del prototipo y se ajustan con un número por escena. Si las mediciones muestran que la gente se va antes de la mitad, se acortan.

### Cómo se hace, sin librerías

En el prototipo es un motor de unas 60 líneas:
- Cada escena lleva `data-scene` con su tipo: fijada, horizontal, de paso o salida.
- Un solo `requestAnimationFrame` mide, en cada escena visible (IntersectionObserver), cuánto se recorrió de 0 a 1 y lo escribe como `--p` en la sección. El listener de scroll es pasivo.
- El CSS hace la coreografía con `calc()` sobre `--p`: cada pieza toma su tramo con `clamp()` y la suavidad con un smoothstep (`t·t·(3−2t)`). Los tramos viven en el CSS, al lado de la pieza que mueven.
- JavaScript solo para lo que el CSS no puede: los textos que cambian (el contador, la categoría), las clases de los momentos (la tarjeta del tablón, el sello) y el mazo horizontal.

En producción hay dos caminos, que se pueden combinar:
1. **CSS scroll-driven animations** (`animation-timeline: view()` o `scroll()`, con `view-timeline` y `timeline-scope` para las fijadas). Corren fuera del hilo principal, pero no son Baseline: Firefox estable no las tiene.
2. **El mismo motor `--p`**, como respaldo o como único camino. Es chico, no depende de nada y en el prototipo anda igual en todos los navegadores.

**Recomendación:** el motor `--p` como base, porque es una sola implementación y ya está probado. Las escenas de paso pueden pasar a `animation-timeline` cuando Firefox lo tenga estable.

### Técnica y soporte

| Técnica | Soporte | Uso acá |
|---|---|---|
| `position: sticky` | Universal | Fijar las escenas |
| `requestAnimationFrame` + IntersectionObserver | Universal | El motor `--p` y las entradas (`Reveal`) |
| Keyframes / `@starting-style` | Baseline 2024 | La tiza del hero |
| View Transitions del mismo documento | Baseline desde octubre de 2025 (Chrome 125, Safari 18, Firefox 144) | El resultado del quiz |
| Scroll-driven animations (`animation-timeline`) | No es Baseline. Chrome y Edge desde la 115; Safari 26 según fuentes secundarias `[VERIFICAR]`; Firefox estable sin soporte | Camino opcional en producción, siempre dentro de `@supports` |
| `<details name>` | Chrome 120, Safari 17.2, Firefox 130 | Las baldosas de las reglas: se abre una por vez |

### Con GSAP (decisión de Lazar, condicionada a la medición)

**Qué suma.** GSAP es gratis desde que lo compró Webflow, plugins incluidos, también para uso comercial. Lo que da y el motor `--p` no:
- el morph real de una forma en otra (MorphSVG): los diez puntos que se ordenan en formación y el escudo que se arma;
- texto que se arma por letra o por palabra (SplitText), en la sección 4 y en ARMALO;
- timelines largas, con varias piezas encadenadas en una sola escena;
- el pin de ScrollTrigger, que se banca el cambio de alto de la barra del navegador en el celular;
- DrawSVG para la tiza, que anima lo mismo que `stroke-dashoffset`.

**Por qué no tiene que hacer lenta la web.**
- Pesa unos 35 a 40 KB gzip entre el núcleo, ScrollTrigger y los plugins que se usen `[VERIFICAR con el build]`.
- Se carga solo en `/rival` y después de la foto del hero, que es el LCP.
- La lentitud no viene de la librería sino de qué se anima: sigue la regla de solo transform y opacidad, más los trazos de la excepción.
- Sin smooth scroll que secuestre la rueda o el dedo (Lenis y similares): el scroll sigue siendo el nativo.

**La medición antes de adoptarla:**
1. Se rehacen con GSAP las dos escenas más pesadas: 1 (Hoy) y 3 (Grupo no es club).
2. Se comparan con el prototipo actual a 390 px, con la CPU frenada ×4: frames largos durante el scroll, INP, LCP y peso de JavaScript.
3. Entra si no empeora ninguna. Si empeora, se queda el motor `--p`.

**Lo que hay que hacer si entra:**
- es una dependencia nueva: `pnpm add -E gsap`;
- DESIGN.md limita las librerías de animación a `/onboarding`, así que hay que sumar la excepción para `/rival`;
- antes de instalar, leer la licencia estándar de GSAP (prohíbe usarla en productos que compitan con el editor visual de Webflow; TurnoGol no es eso, pero se deja por escrito);
- con `prefers-reduced-motion` no se crea ningún ScrollTrigger, y la página es la misma lista estática de hoy.

## Rendimiento en el celular

- **LCP:** el h1 o la pizarra, que es un SVG en línea de unos pocos KB. El hero no tiene foto. El texto nunca arranca invisible esperando JavaScript: la entrada de `@starting-style` arranca con el primer pintado.
- **La única foto** (`bg-hero-2`, avif de unos 96 KB) va en la sección 8, con `loading="lazy"` y su `sizes`, dentro del círculo.
- **JavaScript:** el motor de escenas (uno solo para toda la página) y tres islas chicas: la demo de "Voy", el quiz y las pestañas del tablón. Todo lo demás es Server Component con CSS. La pizarra, el escudo, la tapa y las figuritas son marcado y SVG.
- **Escenas:** solo se calculan las visibles; cada cuadro escribe una variable por escena y nada más. `will-change` va solo en el mazo horizontal. El scroll no se secuestra.
- **Vidrio:** como mucho 2 superficies con `backdrop-filter` a la vez en pantalla. El desenfoque es lo más caro en un Android de gama baja.
- **Abajo del pliegue:** `content-visibility: auto` con `contain-intrinsic-size` en cada sección.
- **Página estática** (ISR o estática). No depende de la sesión: el cromo ya resuelve "Ingresar" o el avatar en el cliente.
- **Interacciones:** las animaciones del toque duran 250 ms como mucho y no bloquean el hilo.
- **Anclaje del scroll apagado** (`overflow-anchor: none`). En el prototipo, el anclaje de Chrome peleaba con las escenas y corría la página sola al cargar.
- **Alto de la página:** las escenas suman unas 27 pantallas de scroll en el celular (medido a 390×844 en el prototipo), y la página entera unas 34 con las listas, las reglas y el pie. Es largo a propósito, pero el botón verde está en el primer pantallazo y la banda ARMALO cierra la página.

## Accesibilidad

- AA en contraste. El texto va sobre la losa o sobre la pizarra, nunca sobre la foto, y el degradé del titular es el medido de `.hero-accent-text` en oscuro. La tiza al 55 % es solo dibujo: ningún texto va con esa opacidad.
- La pizarra del hero tiene un texto para lectores de pantalla: "Ejemplo de partido de Fútbol 5: 9 confirmados, falta 1." Los círculos son decorativos (`aria-hidden`).
- Un solo `h1`. Cada sección tiene su `h2` y su `id`, y los chips del índice son links a esos `id`.
- El estado de cada bloque se dice con texto, no solo con el chip de color.
- **La demo de "Voy":** el contador va en `aria-live="polite"` y el botón es un `<button>` real. La demo dice "Ejemplo" en el texto, no solo en un rótulo visual.
- **El quiz:** cada pregunta es un `radiogroup` con chips de 44 px. El resultado se anuncia con `aria-live`.
- **El mazo de figuritas:** se puede recorrer con el teclado, y hay un texto con las ediciones para lectores de pantalla.

## SEO y metadatos

- **`/rival` se indexa** (REQUIERE INPUT 1). Hoy el tablón tiene `noindex`, y lo sigue teniendo en `/rival/tablon`.
- **Title:** "RIVAL: cada partido cuenta | TurnoGol".
- **Description:** "Armá el partido con tu grupo, encontrá al que falta y, muy pronto, jugá con tu club por la tabla, la Corona y tu categoría. El lado jugador de TurnoGol."
- **Imagen OG:** con `opengraph-image.tsx`, como ya hacen los partidos (`/rival/p/[code]`). Es la pizarra con la cancha de tiza, el hueco "Falta 1", "Cada partido cuenta." y el logo.
- Sale de `buildMetadata` (`src/lib/seo/metadata.ts`).

## Qué medir

Son para decidir, no para vender. Mientras no estén medidas, no se usan en copy ni en ventas.

- Visitas a `/rival` y de dónde llegan: la barra inferior, la home, Instagram o el QR.
- Cuántos tocan "Armá tu partido" y cuántos terminan armando el partido.
- Cuántos tocan "Mirá el tablón".
- Cuántos terminan el quiz.
- Hasta dónde scrollean, por sección.

No hay analítica de producto instalada hoy. Cómo se mide se decide aparte.

## Implementación prevista (para después de la aprobación)

No se escribe ahora; queda como guía para la spec de implementación.

### Rutas

| Ruta | Qué cambia |
|---|---|
| `/rival` | Pasa a ser la landing, siempre visible con el flag `rival` prendido. Sin el flag, `notFound()`, como hoy. |
| `/rival/tablon` | El tablón de hoy, sin cambios. Lo de `/rival?complejo=…&despues=…` redirige con 308 a `/rival/tablon?…`. |
| Barra inferior y `PortalHeader` | "RIVAL" lleva a `/rival/tablon` para quien ya aceptó la bienvenida de RIVAL y a `/rival` para el resto (REQUIERE INPUT 1). |
| Links internos a `/rival` | Se revisan todos (tablón vacío, mails de alerta, "Armar otro") para que apunten a donde corresponde. |

### El mapa de estados

Un archivo `src/modules/rival/rival-landing-status.ts` exporta, por pieza, `'available' | 'soon'`. La página lee de ahí el chip y el texto. Cuando sale una ola, se cambia una línea y la landing dice la verdad.

### Componentes

- **Se reusa:**
  - `PortalShell` y la barra `overlay`;
  - `Reveal`, sumándole el escalonado por hijo;
  - `StatusBadge` con `TONE_BADGE` de `status-tone.ts`;
  - `PitchLines`, que se extiende con las áreas, el círculo central y el trazo de tiza animable;
  - `.hero-accent-text` y `.hero-glow-blob`;
  - `buildMetadata`;
  - el texto del contador de `ShirtGrid` ("Faltan N", "¡Estamos los N!"), para que la demo diga lo mismo que el partido real. La grilla de camisetas no va en la landing: la reemplaza la pizarra.
- **Se agrega:**
  - el componente de la pizarra (`RivalBoard`): la cancha en SVG con sus jugadores y huecos. Sirve para la demo del hero, la sección 3 y, más adelante, la formación de verdad;
  - las recetas `.rival-pizarra`, `.rival-tapa` y `.rival-figurita` en `globals.css`, documentadas en DESIGN.md;
  - las islas de cliente (la demo de "Voy" y el quiz);
  - el SVG del escudo de piezas.
- **Se ajusta:** el bloque `prefers-reduced-motion` de `src/app/globals.css` suma `animation-delay: 0ms !important` y `transition-delay: 0ms !important`. Hoy acorta la duración pero deja las demoras, y con el escalonado de la landing el contenido aparecería tarde. Toca todo el sitio, así que va con su propia verificación.
- **Sin dependencias nuevas.**

### Tests y verificación

- Stories de las piezas nuevas con a11y en claro y en oscuro: la página es oscura, pero el cromo no.
- Un test unitario del mapa de estados: toda pieza "available" tiene que tener su ruta viva.
- Un test de la tabla del quiz: el techo en Quinta nunca se pasa.
- Un e2e de la redirección del tablón.
- Un e2e con movimiento reducido: ninguna escena se fija y todo el contenido se ve.
- Un e2e que recorre la página a 390 px y verifica que no haya scroll horizontal.
- `verificacion-ux` a 390 y a 1440 px, también con movimiento reducido.

## Recursos

### Referencias

| Referencia | Qué se toma | Link |
|---|---|---|
| `/para-complejos` (propio) | Siempre oscura, un celular de ejemplo como prueba, un solo resplandor | `src/app/(business)/para-complejos` |
| Kings League | Fútbol contado con códigos de gaming; cada equipo con su identidad | [Summa, caso Kings League](https://en.summa.es/work/kings-league/) |
| Copa90 | La cultura del hincha como marca, "hecho por hinchas" | [Transform, identidad de Copa90](https://www.transformmagazine.net/articles/2017/copa90-solidifies-international-focus-with-updated-visual-identity/) |
| Playtomic | Un nivel que solo mueven los partidos competitivos, con una fiabilidad que crece | [Cómo funciona el nivel](https://playerhelp.playtomic.com/hc/en-gb/articles/43310980754193-How-the-Playtomic-level-system-works) |
| Strava, Local Legends | La corona para el que más va, no para el más rápido | [DC Rainmaker](https://dcrainmaker.com/2020/06/strava-legends-feature.html) |
| Sorare | Figuritas digitales con ediciones y escasez, y la foto como centro de la carta | [SportBusiness](https://www.sportbusiness.com/news/sorare-launches-3d-digital-cards-for-2023-24-premier-league-season/) |
| Spotify Wrapped | El formato de Tu Temporada: vertical, para historias | (cultura general) |
| El álbum del Mundial 2026, Olé y El Gráfico | Figuritas, ediciones y tapas de diario deportivo. **Solo como cultura:** no se copian marcas, logos ni diseños | (cultura general) |

Lo que no se encontró: un ganador reciente de Awwwards que sea un club o una comunidad de fútbol amateur. La búsqueda del 2026-10-30 trajo plantillas y sitios de clubes de otros deportes.

### Tipografías y licencias

| Letra | Licencia | Estado en TurnoGol | Link |
|---|---|---|---|
| Archivo (Omnibus-Type), ejes `wght` 100–900 y `wdth` 62–125, con itálicas | SIL OFL 1.1 | En uso (DESIGN.md). El eje de ancho es la propuesta 3 | [Omnibus-Type](https://www.omnibus-type.com/?p=1992) · [Google Fonts](https://fonts.google.com/specimen/Archivo) |
| Inter | SIL OFL 1.1 | En uso | [Google Fonts](https://fonts.google.com/specimen/Inter) |
| Sora | SIL OFL 1.1 | En uso (microrrótulos) | [Google Fonts](https://fonts.google.com/specimen/Sora) |
| Big Shoulders Display | SIL OFL 1.1 | Solo referencia; no se propone | [Google Fonts](https://fonts.google.com/specimen/Big+Shoulders+Display) |
| Barlow Condensed | SIL OFL 1.1 | Solo referencia; no se propone | [Google Fonts](https://fonts.google.com/specimen/Barlow+Condensed) |
| Anton | SIL OFL 1.1 | Solo referencia; no se propone | [Google Fonts](https://fonts.google.com/specimen/Anton) |

Las tres de referencia sirven si un día se quiere una voz de tapa distinta de Archivo. Hoy no hace falta: el eje de ancho de Archivo da la condensada sin sumar una cuarta familia.

### Animación

- [web.dev: las View Transitions del mismo documento son Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available).
- [`@starting-style` en web-features](https://web-platform-dx.github.io/web-features-explorer/features/starting-style/).
- [MDN: `animation-timeline`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline). Todavía no es Baseline.
- [Chrome: scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations) y [scroll-driven-animations.style](https://scroll-driven-animations.style/), con demos y patrones.
- [motion: reducir el tamaño con LazyMotion](https://motion.dev/docs/react-reduce-bundle-size).
- [GSAP: licencia estándar](https://gsap.com/community/standard-license/) y [README de GSAP 3.15](https://cdn.jsdelivr.net/npm/gsap@3.15.0/README.md), donde dice que los plugins pasaron a ser gratis.
- En el repo: `src/components/site/Reveal.tsx`, con el porqué de su red de seguridad para el scroll rápido en iPhone, `animate-slot-pulse` y el bloque `prefers-reduced-motion` de `src/app/globals.css`.

## Lo que decidió Lazar sobre los REQUIERE INPUT (2026-10-30)

| # | Tema | Decisión |
|---|---|---|
| 1 | Barra inferior | "RIVAL" lleva al tablón a quien ya aceptó la bienvenida y a la landing al resto. `/rival` se indexa. |
| 2 | Tema | La landing es siempre oscura. |
| 3 | Archivo | Se prende el eje de ancho para la tapa y los dorsales. Va a DESIGN.md. |
| 4 | Oro de trofeo | Sí: `#fcd34d` y su luz `#fef3c7`, solo para las estrellas, la Corona y la figurita Oro. Va a DESIGN.md. |
| 5 | Librería | **GSAP con ScrollTrigger, con medición.** Antes de adoptarla se rehacen las dos escenas más pesadas con GSAP y se miden contra el motor `--p` del prototipo, con la CPU frenada ×4 (un Android medio). Entra si no empeora la fluidez (frames largos, INP) ni la carga (LCP, peso). Ver "Con GSAP" en Movimiento. |
| 6 | "Avisame" de la Temporada Cero | Todavía no. El opt-in se diseña con la ola de clubes. |
| 7 | Quiz | Va, con "Próximamente" bien visible y sin guardar nada. |
| 8 | Números que son propuesta | Afuera hasta su ola. |
| 9 | Clubes de ejemplo | Los que eligió Lazar: Los Mismos de Siempre, Deportivo Rejunte, Deportivo Después Te Transfiero, La Banda del Rulo y Villa Resaca. Antes de publicar, buscarlos en Google para descartar un club real con el mismo nombre. |
| 10 | Fotos y El Vagón | Sin sesión de fotos: sigue `bg-hero-2` como foto de ejemplo, y la landing no nombra complejos. La Temporada Cero queda como cierre. |
| 11 | Rótulos | "Ya disponible" y "Próximamente". |
| 12 | "Gratis" | **RIVAL es gratis para el jugador, y se dice.** Está en la sección 9 ("¿Cuánto sale?"). Es una promesa pública: cobrarle después al jugador sería volver atrás. |
| 13 | Reglas de la sección 9 | Se publican ya, tal cual. Lo que queda pendiente: que los términos y la privacidad digan lo mismo, incluido que el "no" de "¿Volverían a jugar?" se guarda y lo ve moderación. |
| 14 | Trazo de tiza | Se acepta la excepción, solo para la pizarra, el escudo y el "RIVAL" del pie. Con GSAP sale con DrawSVG, que anima lo mismo. |
| 15 | Fundador | Va la marca, sin "para siempre": el sello y la edición Fundador de la figurita. Las reglas (quién la gana y dónde se ve) se escriben con la ola de clubes. "Fundador de la sede" se decide con "Pedí tu cancha" y no va en la landing. |
| Crack del Día | Fuera de RIVAL | Es un jueguito de TurnoGol en la home, junto al buscador, y se juega con letras. Sale de la landing (sección 7). |
| 16 | Prode | Sale de la landing. El README ("Premios y prode") ya avisa que un concurso con premio necesita asesoría por Lealtad Comercial, y "Prode" puede ser marca de la Lotería `[VERIFICAR]`: se retoma con su ola, no en la landing. |

## REQUIERE INPUT (lo que queda)

Ninguno.

## Follow-ups encontrados (fuera de esta tarea)

- **`public/bg-how-it-works.*` muestra logos de Nike** en los botines y la pelota. Es una marca de terceros en un asset propio. Ver dónde se usa y reemplazarlo.
- **`docs/rival/README.md` usa "Sacachispas FC vs. Chacarita FC"** como ejemplo de partido oficial. Son clubes reales: conviene cambiarlo por nombres inventados para que ninguna pantalla ni pieza de marketing lo copie.

## Fuentes

- Visión y decisiones: [`README.md`](README.md), [`categorias.md`](categorias.md), [`clubes.md`](clubes.md), [`ideas.md`](ideas.md), [`crack-del-dia.md`](crack-del-dia.md), [`2026-10-29-rival-cultura-de-turnogol.md`](../decisions/2026-10-29-rival-cultura-de-turnogol.md), `.claude/rules/rival.md`.
- Lo construido: [spec v1](../superpowers/specs/2026-10-22-rival-v1-design.md), `src/app/(player)/rival/`, `src/modules/rival/`.
- Producto y diseño: [`PRODUCT.md`](../../PRODUCT.md), [`DESIGN.md`](../../DESIGN.md), `.impeccable/surfaces/src-app-business-para-complejos.md` y `src-app-player.md`.
- Recursos externos: los links de "Recursos", consultados el 2026-10-30.
