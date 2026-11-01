# 05 — Autoridad externa (fuera del sitio)

**Fecha:** 2026-10-31.

**Restricción de esta etapa:** presupuesto $0 (D8). Todo lo de acá es gratis o se marca **[a futuro]**.

**Responsable:** Lázaro, salvo que se indique otra cosa. Claude Code prepara textos y checklists.

## Por qué esto pesa tanto

Las cifras son de la investigación citada en el prompt. No las re-verifiqué y son **correlacionales**:

- **Las menciones de marca en la web** son lo que más se asocia con aparecer en respuestas de IA: ρ = 0,664, contra 0,218 de los backlinks (Ahrefs, 75.000 marcas). **Fuerza media.**
- **Los buscadores con IA favorecen lo que dicen terceros** por sobre lo que dice la propia marca (Chen y otros, 2025). **Fuerza media.**
- **ChatGPT busca primero fuentes donde aparezcan candidatos** y recién después lee el sitio de cada candidato (Peec, agosto de 2026). Si nadie nombra a TurnoGol, nunca llega a leer `/precios`. **Fuerza media.**
- **Hoy ningún tercero nombra a TurnoGol.** Revisé Turnito, Clubbi, Clubin, ComparaSoftware y Capterra el 30/10/2026.

## 1. Perfiles con la misma frase (Etapa 1, semanas 2-4)

En todos va el nombre **TurnoGol**, la frase corta "Sistema de gestión para complejos de fútbol", la frase larga como descripción, la URL `https://turnogol.app` y el mismo logo. Cada perfil que se cree se suma a `sameAs` del JSON-LD (VIS-015).

| Plataforma | Costo | Qué cargar | Prioridad | Nota |
|---|---|---|---|---|
| **G2** (cubre también Capterra, GetApp y Software Advice) | Gratis | Producto, categoría, descripción, precio en ARS, capturas, "Argentina", Mercado Pago | 1 | El alta de Capterra pasa por el formulario de G2 desde la compra de febrero de 2026 (fuente secundaria). Elegí la categoría más cercana a "reservas de canchas" o "gestión de instalaciones deportivas", **no** "gimnasios". Hay reportes de que el perfil gratis no tiene link al sitio: igual sirve como mención con datos estructurados. La ficha de Vibe tiene 0 reseñas y aparece igual. |
| **LinkedIn**, página de empresa | Gratis | Nombre, frase, sitio, logo, "Luján, Buenos Aires", tamaño 2-10 | 1 | Sin perfil personal ligado en público (D4). Un posteo por semana desde la página (ver §4). |
| **YouTube**, canal "TurnoGol" | Gratis | Descripción con la frase, enlace al sitio, playlists por función | 1 | Ver §3. |
| **Instagram** (ya existe) | Gratis | Bio con la frase (ver `02-estrategia.md` §1), link al sitio, destacados por función | 1 | Los textos describen qué es TurnoGol. Instagram profesional se indexa en Google desde el 10/07/2025. |
| **Crunchbase** | Gratis | Organización, descripción, sitio, ubicación, fundación 2026 | 2 | Mención estructurada. |
| **Apple Business Connect** | Gratis | Negocio online (se aceptan desde octubre de 2024) | 2 | Alimenta Siri y Apple Maps. |
| **ComparaSoftware** | Alta gratis, cobran por contacto | Ficha en "Reservas" o "Gestión de clubes" | 3 | Tiene foco en México. Ver primero si el alta es gratis de verdad. |
| AlternativeTo, SaaSworthy, Product Hunt | Gratis | Ficha mínima | 4 | Valen poco en este nicho. Solo para `sameAs`, si sobra tiempo. |
| TikTok | Gratis | Mismo nombre y bio | 3 | Para reutilizar los verticales de La Fábrica. |

**Lo que NO se hace:**
- **Ficha de Google Business de TurnoGol.** Google excluye a los negocios solo online, y una dirección inventada viola sus políticas. La presencia en Maps viene por las fichas de los complejos (§5).
- **Mencionar Axxen en cualquier perfil de TurnoGol** (D6).

## 2. Reseñas (Etapa 2)

Reglas por plataforma. Salen del prompt y hay que **releerlas en cada plataforma antes de pedir**:

| Plataforma | Incentivos | Regla |
|---|---|---|
| G2 | Se permiten hasta USD 100 si no dependen de la opinión y quedan etiquetados | No hay plata, así que no aplica |
| Capterra | Solo dentro de su programa oficial, iguales para todos | No guiar el contenido; no se aceptan reseñas escritas con IA |
| Google y Trustpilot | **Ninguno** | Prohibida la invitación selectiva |

**Regla operativa:**
- **Mismo mensaje a todos los complejos activos**, sin filtrar por satisfacción.
- **No redactarle la reseña al cliente.**
- **Declarar el vínculo** cuando el cliente es un conocido.

**Meta realista:** hoy hay un solo complejo con uso real (El Vagón). La meta de 90 días es 1 o 2 reseñas reales en G2 o Capterra. La de 10 a 20 queda para cuando haya 15 complejos o más.

**Cuándo pedir:** después de que El Vagón active el plan. Es una relación comercial en curso.

## 3. YouTube, Instagram y TikTok (desde la Etapa 1, en paralelo)

**Por qué:**
- Las menciones en YouTube son la señal más correlacionada (ρ ≈ 0,737), y cuentan cuando la marca está **en el título** (Ahrefs, diciembre de 2025, citado en el prompt). **Fuerza media.**
- YouTube es el dominio más citado por AI Overviews desde que usa Gemini 3 (Ahrefs, citado en el prompt). **Fuerza media.**

**Producción:** con La Fábrica (Remotion), que ya genera verticales de TurnoGol de forma programática. Costo $0. Hacen falta capturas reales del panel.

**Primeros cuatro tutoriales:** títulos en `04-contenidos.md` B-12. Cada uno sale en dos formatos:
- **Horizontal o largo** (2 a 5 min) para YouTube, con capítulos, subtítulos revisados y la descripción con la frase y el link.
- **Vertical** (30 a 60 s) para Instagram, TikTok y YouTube Shorts, con el mismo título de marca.

**Cadencia sostenible:** un video largo cada dos semanas y dos verticales por semana. Si no se llega, se prioriza el video largo con "TurnoGol" en el título.

**Lo que más corrobora** son terceros que nombran a TurnoGol en *sus* videos: dueños, organizadores de torneos, creadores futboleros. No se paga. Se le ofrece al complejo cliente que muestre su grilla o su placa de turnos libres en sus propias historias, y la placa ya dice TurnoGol.

## 4. LinkedIn (página de empresa, sin nombre propio)

LinkedIn es el dominio más citado en consultas B2B y de software, en seis plataformas (Profound, citado en el prompt). **Fuerza media.**

Un posteo por semana, en voz de empresa, sobre el negocio del fútbol 5:
- Qué pasa en un complejo un viernes a las 23.
- Cómo se cobra por equipo.
- Qué es un faltazo y cuánto cuesta.
- Qué trae cada mejora nueva, sacado de `/cambios` cuando exista.

**Sin números de clientes sin permiso.**

## 5. Efecto red con los complejos clientes (Etapa 1, el más rendidor gratis)

Cada complejo cliente puede ser una mención y un enlace hacia TurnoGol en un lugar que Google y las IAs ya leen: su perfil de Google, su Instagram, su WhatsApp. Un competidor que vive de cobrarle al jugador no tiene ese incentivo alineado.

1. **En el perfil de Google del complejo**, "Sitio web" o "Enlace para reservar" → `https://turnogol.app/{su-slug}`. Si ya tiene web, usar el campo de reservas.
2. **En la bio de Instagram del complejo** → el mismo link.
3. **En la respuesta automática y el catálogo de WhatsApp Business del complejo** → el link para reservar.
4. **En la ficha** (la hace Claude Code, VIS-026): pie "Reservas con TurnoGol" con enlace a `/para-complejos`. Si algún día hay un widget embebible, el crédito dice solo "Reservas con TurnoGol", con `rel="nofollow"` y **sin** keywords repetidas: Google considera spam los enlaces masivos en pies o widgets cargados de keywords.
5. **Kit**:
   - La **placa de turnos libres** (ya existe en el producto).
   - Un **QR para el mostrador** con el link: Claude Code puede generar un PDF imprimible desde la ficha [Etapa 2].
6. **Reseñas del complejo en su propio perfil de Google**: si el producto algún día ayuda a pedirlas, el pedido sale para **todos** los jugadores, neutral, sin filtrar.

**Primero El Vagón** (único cliente con uso real) y Evardss si es cliente activo: ver `09`.

## 6. Listas y directorios de terceros (Etapa 2)

Son competidores o directorios, así que pueden negarse. Cuesta un mensaje.

| Dónde | Qué es | Pedido |
|---|---|---|
| Turnito, [lista 2026](https://turnito.app/blog/las-mejores-apps-de-reservas-para-clubes-en-argentina-2026/) | Lista de 5, escrita por un competidor | Inclusión con datos verificables |
| Clubbi, [lista de 14](https://www.clubbi.io/recursos/mejores-software-clubes-deportivos-argentina) | Lista de software de clubes, revisada el 30/10/2026 | Inclusión en una sección de complejos de fútbol |
| Clubin, [comparativa de 13](https://clubinarg.com/comparativa-software-clubes-argentina) | Dice que la publica uno de los listados | Inclusión |
| ComparaSoftware | Directorio | Alta (§1) |
| Capterra, categoría | Directorio | Que la ficha quede en una categoría de reservas o canchas |

## 7. Ecosistema y alianzas (Etapa 2-3)

- **Proveedores del rubro** (césped sintético, iluminación LED, constructoras de canchas, distribuidoras de bebidas para buffets): que figure TurnoGol como "sistema recomendado" en su sitio o en sus redes, a cambio de mencionarlos en `/ayuda` o en una guía. Si hay contraprestación, el enlace va con `rel="sponsored"`.
- **Ligas y organizadores de torneos de la zona** (Luján y zona oeste): una mención en su web o sus redes.
- **Cámara de Complejos Argentinos de Fútbol 5**: no encontré actividad posterior a 2020 ([Ámbito, 2020](https://www.ambito.com/informacion-general/futbol/pese-no-estar-habilitadas-reabriran-mil-canchas-5-n5137434)). **Radar**: si reaparece, pedir figurar como socio tecnológico.
- **Programa de partners de Mercado Pago** ([developers](https://www.mercadopago.com/partners/developers/en)): hay certificación con Integrator ID y niveles. No confirmé que exista un directorio público argentino. **[a futuro]**: averiguar si la certificación básica es gratis y si da un listado.

## 8. Índice TurnoGol y prensa (Etapa 3, recién con datos)

**Expectativa correcta:** la prensa genera pocas citas directas. ATC tiene notas en Forbes y no apareció en la respuesta de ChatGPT. Lo que aporta son menciones de marca, enlaces para el SEO clásico y las referencias independientes que después pide Wikidata.

**Requisito:** tener el Índice con metodología publicada y datos propios. Sale de llamados y encuestas a dueños y de precios públicos, **nunca** raspando competidores. Sin eso, no hay nota.

**A quién:**
- **Medios de Luján y zona oeste**, con el dato local.
- **Regionales** (Los Andes, La Gaceta, La Capital, LM Neuquén), con el dato de su ciudad.
- **De negocios** (iProfesional, El Cronista, Ámbito, InfoNegocios), con el dato nacional.

## 9. Reserve with Google (consulta única, Etapa 2)

**Lo que verifiqué** en la [política](https://developers.google.com/actions-center/verticals/appointments/redirect/policies/platform-policies), leída el 30/10/2026:
- Argentina está soportada.
- La tabla de categorías **no incluye canchas ni deportes**; sí Gym y Fitness Center.
- Dice que es "no exhaustiva".

**Costo:** un mail. **Probabilidad:** baja. **Impacto si sale:** enorme, porque sería un botón "Reservar" en la ficha de Maps de cada complejo. Plantilla 7.

**Requisitos si avanza:**
- El comercio tiene que coincidir con su ficha de Maps.
- Precio final visible.
- Cancelación clara.
- Soporte que resuelva lo urgente en 1 día hábil.

## 10. Comunidades

- **Reddit** pesa poco en español. Participar está bien, aclarando que sos del equipo de TurnoGol, pero no es la apuesta principal.
- **Grupos de Facebook y de WhatsApp de dueños:** valen para ventas, pilotos y referidos, y **nada** para la IA, porque son cerrados. Siguen siendo el canal de corto plazo para las 30 pruebas.

---

## Plantillas

Están escritas como habla Lázaro con un dueño o con alguien del rubro. Firman como TurnoGol; si querés, poné tu nombre en los mensajes 1 a 1, porque no es la web. Los corchetes se completan; si no hay dato, se borra la línea.

### P1 · Mensaje al complejo para que ponga su link de TurnoGol

> Che [nombre], una cosa que te suma reservas y no te lleva 5 minutos: en tu perfil de Google (lo que aparece cuando te buscan en Maps) hay un lugar para poner el link para reservar. Poné este: turnogol.app/[slug]. Así el que te encuentra en Google reserva directo sin escribirte.
>
> Si querés lo mismo en la bio de Instagram y en la respuesta automática del WhatsApp. Si no sabés dónde está, mandame captura y te digo dónde tocar.

### P2 · Pedido de reseña, mismo mensaje para todos los complejos activos

> Hola [nombre], te escribo a vos y a todos los complejos que usan TurnoGol. Estamos juntando opiniones en G2 (es como el TripAdvisor de los sistemas). Si tenés 3 minutos, contá cómo te va, lo bueno y lo malo, lo que vos quieras: [link de G2]. No es obligatorio y no cambia nada de tu cuenta. Gracias igual.

Si el dueño es conocido tuyo, agregá: "Ojo, poné que me conocés, así queda claro."

### P3 · Pedido de inclusión en una lista de terceros

> Hola, ¿qué tal? Somos TurnoGol (turnogol.app), un sistema de gestión hecho solo para complejos de fútbol: reservas online 24/7, seña opcional por Mercado Pago directo a la cuenta del complejo, turnos fijos, cobro por equipo, caja y buffet. Sin comisión por reserva ni cargo al jugador. $30.000 por cancha por mes, 30 días de prueba sin tarjeta.
>
> Vimos su lista de [nombre de la lista] y creemos que le sirve a quien tiene un complejo de fútbol. Si les sirve, les pasamos capturas y una cuenta de prueba para que lo vean. Si no encaja, todo bien.

### P4 · Propuesta a un proveedor del rubro (césped, iluminación, constructora)

> Hola [nombre], ¿cómo va? Somos TurnoGol, un sistema para complejos de fútbol (turnos fijos, cobro por equipo, caja, buffet y reservas online). Muchos de sus clientes son nuestros clientes posibles y al revés.
>
> Les proponemos algo simple: cuando un cliente suyo termina la obra y pregunta cómo manejar las reservas, le cuentan que existe TurnoGol, y nosotros, cuando un complejo nos pregunta por césped o luces, les pasamos su contacto. Es una recomendación de boca a boca entre gente del rubro, no un canje de links. ¿Lo charlamos 10 minutos?

### P5 · Mail a periodista (Etapa 3, recién con el Índice publicado)

> Asunto: Cuánto sale jugar al fútbol 5 en [ciudad]: datos de [N] complejos
>
> Hola [nombre]. Relevamos el precio del turno de fútbol 5 en [N] complejos de [ciudad/zona] entre [fecha] y [fecha]: el turno en horario pico está en $[X] (un [Y]% más que en [período]) y [dato local llamativo y verificable].
>
> Somos TurnoGol, un sistema de gestión para complejos de fútbol hecho en Luján. Los datos y la metodología están abiertos en turnogol.app/datos/[slug]. Si te sirve para una nota, te paso el desglose por barrio y te pongo en contacto con dueños que quieran hablar.

### P6 · Guion de tutorial (YouTube, 2 a 4 min)

> **Título:** Cómo cobrar la cancha por equipo en tu complejo de fútbol | TurnoGol
>
> **0:00 Gancho (5 s):** "Terminó el partido, el equipo 1 pagó y el 2 dice que paga después. Así se anota en TurnoGol para que no se te pierda."
>
> **0:05 Qué es (10 s):** "TurnoGol es el sistema de gestión para complejos de fútbol. Esto es la pantalla Hoy."
>
> **0:15 Paso a paso (90 s):** abrir el turno → "Cobrar" → "Equipo 1 pagó" → método → queda "Falta Equipo 2" → cobrar el resto con otro método. Mostrar cómo queda en rojo si no se cobra y cómo aparece en la caja de la noche.
>
> **1:45 Casos (30 s):** "¿Y si pagó uno solo? 'Pagó uno'. ¿Y si mezclan efectivo y Mercado Pago? Se puede."
>
> **2:15 Cierre (10 s):** "Probalo 30 días gratis en turnogol.app. Sin tarjeta."
>
> **Descripción:** frase canónica corta + link a turnogol.app/funciones/cobro-por-equipo + capítulos.

### P7 · Consulta a Google Actions Center

> Subject: Eligibility question: sports court booking (football/soccer) in Argentina, Appointments Redirect
>
> Hi, we run TurnoGol (turnogol.app), a booking and management system used by football (soccer) court venues in Argentina. Players book a court slot online and the venue may take a deposit via Mercado Pago. Your Appointments Redirect policy lists Argentina as supported and says the category list is not exhaustive. Would sports court rental venues (football 5/7/11) be eligible? Each venue has its own Google Maps listing, a public booking page with final prices, and a clear cancellation policy. Thank you.

(Va en inglés porque es el idioma del formulario de partners. Traducción para Lázaro: preguntamos si los complejos de canchas de fútbol en Argentina pueden entrar, explicando que cada complejo tiene su ficha en Maps, precios finales y política de cancelación.)

### P8 · Descripción para G2, Capterra y Crunchbase

> TurnoGol es el sistema de gestión hecho solo para complejos de fútbol (5, 7 y 11) en Argentina. Los jugadores reservan online las 24 horas sin bajarse una app; el complejo cobra la seña, si quiere, por Mercado Pago directo a su cuenta. Incluye turnos fijos que se repiten solos, cobro por equipo y de a partes, caja de la noche por método de pago, buffet con stock y fiado, bloqueo automático a quien falta dos veces en 90 días, usuario para el encargado y métricas. Sin comisión por reserva ni cargo al jugador. $30.000 ARS por cancha por mes; 30 días de prueba sin tarjeta. Opcional: asistente de WhatsApp con IA (TurnoGol Plus).
