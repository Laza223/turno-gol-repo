# 02 — Estrategia de visibilidad

**Fecha:** 2026-10-31. **Insumos:**
- `01-auditoria.md`.
- Inventario de producto: código y `docs/decisions/` hasta el 30/10/2026.
- Relevamiento de competencia del 30/10/2026.
- Decisiones de Lázaro del 30 y 31/10/2026 (§2).

## 1. La frase canónica

Es la frase que queremos que una IA repita cuando describe a TurnoGol. Va igual en el title, la meta description, el primer párrafo, el schema, los perfiles externos y las fichas de terceros.

**Larga** (primer párrafo de `/para-complejos`, `/nosotros`, `llms.txt`, descripción de Capterra y G2):

> TurnoGol es el sistema de gestión hecho solo para complejos de fútbol: tus jugadores reservan online las 24 horas sin bajarse una app, cobrás la seña (si querés) por Mercado Pago directo a tu cuenta, y manejás los turnos fijos, los cobros por equipo, la caja y el buffet desde el celular. Sin comisión por reserva y sin cargo al jugador.

**Media**, para la meta description, hasta 155 caracteres:

> Sistema de gestión para complejos de fútbol: reservas online 24/7, seña opcional por Mercado Pago, turnos fijos, caja y buffet. Sin comisión por reserva.

**Corta** (categoría en perfiles, `sameAs`, firma, bio):

> Sistema de gestión para complejos de fútbol

**Bio de Instagram** (hasta 150 caracteres):

> Sistema de gestión para complejos de fútbol ⚽ Reservas 24/7, seña por Mercado Pago, fijos, caja y buffet. Probalo 30 días gratis 👇

**Por qué esta frase** (evidencia, con su fuerza):
- **Usa las palabras de la pregunta que perdimos.** "Gestión" y "complejo de fútbol" son las mismas palabras de "la mejor app para la gestión de mi complejo de fútbol". Lo que más pesa para que una IA cite una página es que la pregunta y el contenido digan lo mismo (β +0,37; Discovered Labs, 2 millones de citas; observacional, de proveedor). **Fuerza media.**
- **Nombra rasgos que se pueden buscar.** "Solo fútbol", "sin comisión por reserva", "seña opcional", "turnos fijos" y "cobro por equipo" son rasgos concretos. Una marca que no aparece en la pregunta genérica puede aparecer cuando la pregunta trae un rasgo que esa marca tiene (Malthouse y otros, septiembre de 2026, citado en el prompt; no re-verificado). **Fuerza media.**
- **Calca el formato que ganó.** La tarjeta "Conocer Vibe" repitió el title y la descripción de vibe.com.ar (observación propia del 30/10). **Fuerza media.**
- **No apila keywords.** Nombra la categoría una sola vez. Los títulos cargados de keywords se asociaron con menos citas (SE Ranking, 129.000 dominios; citado en el prompt). **Fuerza baja.**

**Lo que no dice, a propósito:**
- No dice "el mejor" ni "número 1": ninguna IA lo toma como dato.
- No usa "plataforma", "solución", "integral" ni "SaaS": están vetados en `docs/gtm/03-posicionamiento.md:44`.
- No dice "te traemos jugadores", que es un veto de producto.
- No pone a la seña de titular: va como opcional (`PRODUCT.md:58`).

## 2. Decisiones tomadas en esta sesión

| # | Decisión | Quién y cuándo | Alternativas descartadas y por qué |
|---|---|---|---|
| D1 | **Home híbrida.** El hero y el buscador del jugador quedan iguales. El title y la description muestran las dos caras. Justo abajo del buscador va una banda corta para dueños (H2 "¿Tenés un complejo de fútbol?", 3 o 4 rasgos y el CTA "Probalo 30 días gratis"). La home pasa a enlazar a `/para-complejos` y a `/precios`. | Lázaro, 30/10/2026 | **Home 100% para dueños**: le quita al jugador el CTA que hoy les vende a los complejos clientes. **Home como está**: tiene unas 90 palabras y ninguna le dice a un buscador qué es TurnoGol para un dueño. Como la home es tan corta, la banda termina siendo casi todo el texto que lee un bot, así que entra en el primer tercio de la página. Modifica `docs/decisions/2026-10-20-vuelve-la-previa.md` (solo hero) y L3 de `2026-09-27-landing-para-complejos.md`: hay que registrarlo (VIS-009). |
| D2 | **`/para-complejos` pasa de "sistema de señas" a "sistema de gestión para complejos de fútbol"**, con todas las operaciones. | Derivada de la respuesta de Lázaro del 30/10 ("la gestión completísima… solo fútbol") y de `PRODUCT.md:58` | **Mantener "sistema de señas"**: vende 1 de unas 35 funciones, contradice "la seña nunca de titular" y no coincide con ninguna pregunta de gestión. |
| D3 | **Comparativas agresivas, estilo Vibe**: nombre y apellido del competidor, tabla, precios. Fuera solo lo inventado. **R6 no aplica a la web.** | Lázaro, 30/10/2026 | **Guía genérica sin nombres**: es menos citable. En un sitio medido con el reporte de Bing, una comparativa herramienta por herramienta con precios se llevó el 69% de las citas de Copilot (citado en el prompt; observacional). **Dejar las actuales**: tienen datos inventados que ninguna IA va a citar. |
| D4 | **El nombre de Lázaro no aparece en ningún lado.** `/nosotros` es de empresa, las guías las firma "Equipo TurnoGol" y la Organization va sin `founder`. | Lázaro, 30/10/2026 | La biografía del autor casi no mueve citas (Discovered Labs; observacional), así que el costo es bajo. |
| D5 | **El precio no se toca.** Se defiende con lo que tiene el producto. | Lázaro, 30/10/2026 | Ver §3: el plan no depende de bajar el precio. |
| D6 | **Axxen no se menciona en TurnoGol.** Lo de Axxen sobre TurnoGol cuenta como mención de un tercero. | Lázaro, 30/10/2026 | — |
| D7 | **El repo queda público** y se prende el secret scanning. Pasarlo a privado más un recorte del CI queda en el radar. | Lázaro, 31/10/2026 | **Privado ya**: corta el CI a mitad de mes, porque se usaron 2.195 min de reloj en 30 días contra un tope de 2.000. |
| D8 | **Presupuesto $0.** Todo lo pago se especifica "a futuro" y no se activa. | Lázaro, 30/10/2026 | — |

## 3. Propuesta de valor con la camiseta puesta

### La tesis

TurnoGol no es un sistema de reservas con extras. Es **el sistema de la noche de un complejo de fútbol**: desde que el jugador reserva hasta que el equipo 2 paga lo que faltaba, el buffet vende la última Imperial y la caja cierra sola. Los multideporte no piensan en el cobro por equipo, en el turno de la 1 de la mañana que es de la noche anterior ni en el fijo de los miércoles. Lo dice el inventario: unas 35 funciones en producción, la mayoría específicas de fútbol.

### Lo que se puede decir hoy, en presente

| Rasgo (en palabras del dueño) | Estado | Evidencia | ¿Lo tiene un multideporte genérico? |
|---|---|---|---|
| Tus jugadores reservan desde el celu en tres toques, sin app, las 24 h | A | `docs/decisions/2026-10-29-ficha-reserva-en-pasos.md` | Sí, es común |
| **Sin comisión por reserva y sin cargo al jugador** | A | No hay fees en `src/modules` ni en `src/lib`; `createPreference` arma un solo ítem igual a la seña | **No todos.** Según su propia web (30/10/2026), Vibe le cobra $1.000 al jugador por cada pago online |
| Seña opcional por Mercado Pago, directo a tu cuenta; si no paga en 6 minutos, el turno se libera solo | A | `src/shared/jobs/definitions.ts:103`, `hold.ts` | Común |
| El que falta dos veces en 90 días queda 14 días sin reservar online en tu complejo | A | `src/shared/constants.ts:42-48` | Poco común |
| **Cobrás por equipo y de a partes**, mezclando efectivo, Mercado Pago y transferencia | A | `docs/decisions/2026-09-15-cobro-por-equipo.md` | **No** (específico de fútbol) |
| **Precio por jugador** en tu página ("$4.300 por jugador") | A | `2026-09-15-precio-por-jugador-denormalizado.md` | **No** |
| **Los fijos se repiten solos** cada semana, con control de pago por sesión, y los importás pegando tu planilla | A | `generate-abonado-slots.worker.ts`, `src/app/(admin)/abonados/importar` | Parcial |
| **Hoy**: cobrás y vendés sin irte de la pantalla; lo jugado y no cobrado queda en rojo | A | `2026-09-19-hoy-cobrar-y-vender.md`, `booking.auto-credit.ts:22` | No |
| **Caja de la noche** por método y **buffet** con stock, "Para reponer" y fiado | A | `2026-09-25-caja-libro-de-la-noche.md`, `src/modules/canteen` | Raro en sistemas de reservas |
| El turno de la 1 AM cuenta en la noche que arrancó | A | `src/shared/time/operating-day.ts` | **No** |
| Eventos de varias horas (escuelita gratis repetible, cumpleaños) y bloqueos | A | `2026-09-15-evento-repetible…` | Parcial |
| Clientes que dejaron de venir, con WhatsApp precargado para recuperarlos | A | `src/modules/relationships/dormant.ts` | Raro |
| Placa de turnos libres lista para historias y estados | A | `src/app/api/public/story` | Raro |
| Encargado con su usuario, sin acceso a Ajustes ni Métricas; usuarios sin límite | A | `src/modules/staff/roles.ts` | Común |
| Push con cada reserva; de 00 a 08 espera a las 8 | A | `push-quiet-hours.ts` | Poco común |
| **TurnoGol Plus**: asistente con IA que contesta el WhatsApp del complejo con tus horarios, muestra turnos libres y reserva en el chat. Extra de $20.000 por cancha | B (en vivo en un complejo) | `2026-10-20-bot-whatsapp.md`, `pricing.ts:27` | Raro en el rubro |
| **RIVAL**: tus jugadores arman el partido en tu cancha y lo cierran por WhatsApp; ven cuántos faltan y se bajan sin drama | B (flag global prendido el 29/10/2026) | `docs/decisions/2026-10-29-rival-cultura-de-turnogol.md`, `docs/rival/README.md` | **No** |

**Lo que NO se dice**, porque es estado C o D, está vetado o es falso:
- Cobro automático o débito de los fijos.
- Avisos o recordatorios por WhatsApp al jugador.
- Recordatorio 24 h antes.
- Reembolso automático de la seña.
- "Te traemos jugadores", "tu complejo siempre lleno".
- Torneos (flag apagado).
- Rankings, media, clubes o figuritas de RIVAL (es la etapa D).
- Plus "incluido" o "atiende solo 24/7" (pasa a una persona y se calla 6 h si contestás vos).
- "Más barato que ATC" (falso con 3 y 6 canchas).
- Cualquier porcentaje de mejora sin datos.
- Números de El Vagón sin su permiso.
- "Falta Uno" (marca de un competidor; se dice "Falta 1").

### ¿Por qué pagar $90.000 si hay opciones de $0 o de $18.000?

Precios al 30/10/2026 para 3 canchas por mes (fuentes en §6):

| | TurnoGol | Clubin | CanchaFija | Vibe | ATC |
|---|---|---|---|---|---|
| Precio | $90.000 | $45.000 | $18.000 | $0 + $1.000 al jugador por pago | USD 50 |

TurnoGol es el más caro de los que cobran en pesos. El precio no se toca (D5), así que la respuesta tiene que estar en la página:

1. **Sin cargo al jugador.** "Gratis para vos" muchas veces significa "lo paga tu cliente". Se dice con nombre, fuente y fecha: "Vibe no le cobra al complejo; le cobra $1.000 al jugador en cada pago online (según vibe.com.ar, 30/10/2026)".
2. **Hecho solo para fútbol.** Cobro por equipo, fijos, la noche de la 1 AM, el buffet. Se demuestra con la tabla de funciones de cada comparativa, no con adjetivos.
3. **El ancla que ya existe.** "Lo que te deja un turno, una vez al mes" (H1 de `/precios`) y la calculadora de faltazos con los números del propio dueño. Hay que confirmar con el precio real del turno en Luján que $30.000 por cancha sea igual o menor que un turno (hipótesis; lo valida Lázaro).
4. **Sin riesgo.** 30 días sin tarjeta y sin permanencia.

### Pasada del board (`billion-dollar-board`)

- **Dunford (posicionamiento):** hoy la alternativa real del dueño es el cuaderno, WhatsApp, o Vibe porque es gratis. La categoría tiene que ser "sistema de gestión para complejos de fútbol", no "sistema de señas". **Cambio:** D2.
- **Schwartz (consciencia):** el dueño ya conoce soluciones (hay más de 15 marcas "Turno*" y "Cancha*"), así que es un mercado sofisticado. Gana el mecanismo distintivo, no la promesa genérica. **Cambio:** cada página abre con un rasgo concreto ("cobrás por equipo"), no con "gestioná tu complejo".
- **Hormozi (ecuación de valor):** el resultado soñado es "la noche cierra sola, sin perseguir a nadie". Para la probabilidad percibida falta prueba: no hay un solo caso publicable. **Pregunta para Lázaro:** ¿El Vagón acepta que se cuente su caso? (`09-preguntas-abiertas.md`).
- **JTBD:** el trabajo es "que no se me pierda plata ni turnos entre las 19 y la 1". **Cambio:** las páginas de funciones se ordenan por momento de la noche, no por módulo.
- **Pricing:** el value metric "por cancha" es entendible. El riesgo es que contra Vibe y CanchaFija se vea caro sin un ancla. **Cambio:** la calculadora sale de `/precios` a `/herramientas/calculadora-de-faltazos` (Etapa 3) y se enlaza desde cada comparativa.

## 4. Arquitectura de información

```
/                         Home híbrida (D1): hero del jugador + banda para dueños
├─ /explorar              Jugador: buscar canchas (ISR al sacar la sesión del render)
├─ /{complejo}            Ficha pública de cada complejo (con pie "Reservas con TurnoGol")
├─ /rival                 Jugador: RIVAL (flag on; landing con "Ya disponible" y "Próximamente")
│
├─ /para-complejos        HUB B2B: "Sistema de gestión para complejos de fútbol" (D2)
├─ /precios               Precio en ARS con vigencia, Plus como extra, FAQ
├─ /nosotros              Empresa: Luján, julio 2026, solo fútbol, contacto (sin nombres)
│
├─ /funciones/            Etapa 2: una página por operación (las 8 de abajo)
│   ├─ reservas-online      ├─ cobro-por-equipo     ├─ faltazos
│   ├─ sena-mercado-pago    ├─ turnos-fijos         ├─ asistente-whatsapp (Plus)
│   └─ caja-y-buffet        └─ rival
├─ /integraciones/mercado-pago   Etapa 2: conexión, comisión de MP, acreditación, devoluciones
├─ /comparar/             Etapa 2: turnogol-vs-vibe, -canchafija, -clubin, -atc-sports
├─ /alternativas/atc-sports      Etapa 2 (menciona también "Alquila Tu Cancha")
├─ /guias/como-elegir-sistema-para-complejo-de-futbol   Etapa 2 (reemplaza al post "mejores")
├─ /herramientas/         Etapa 3: calculadora-de-faltazos, precio-por-jugador, planilla-de-fijos
├─ /ayuda                 Etapa 3: tutoriales en video
└─ /cambios               Etapa 3: historial fechado de mejoras
```

**Redirecciones 301** (en `next.config.ts` → `redirects()`):

| Desde | Hacia |
|---|---|
| `/vs/alquila-tu-cancha` | `/comparar/turnogol-vs-atc-sports` |
| `/alternativas-alquila-tu-cancha` | `/alternativas/atc-sports` |
| `/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026` | `/guias/como-elegir-sistema-para-complejo-de-futbol` |

El blog queda como índice de `/guias`, o redirige ahí si queda vacío.

**Reglas:**
- **Slugs reservados primero.** Toda ruta nueva entra en `RESERVED_SLUGS` antes de crearse (T-10), porque las fichas viven en la raíz.
- **Sin doorways.** Nada de "software para canchas en [ciudad]". Las páginas por ciudad aparecen recién con 3 o más complejos activos en esa ciudad y con datos agregados reales (política de spam de Google, doorways).
- **`/para/*` queda para la Etapa 3.** Son páginas por tipo de complejo (barrio de F5, predio de 7 y 11, complejo con buffet), y solo valen si cada una tiene contenido propio. Hasta entonces sería contenido casi duplicado de `/funciones`.
- **Sin páginas por país ni hreflang** hasta tener tracción en Argentina.

## 5. Grafo de datos estructurados

Se renderiza en el servidor con `src/components/seo/JsonLd.tsx` y `src/lib/seo/structured-data.ts`, que ya existen.

| Nodo | Dónde | Campos clave |
|---|---|---|
| `Organization` `@id: https://turnogol.app/#org` | `/` y `/nosotros` | name "TurnoGol"; alternateName "Turno Gol"; url; logo PNG cuadrado ≥112 px **que exista**; description (frase media); `sameAs` con Instagram, YouTube, LinkedIn empresa, Capterra/G2 y Crunchbase, a medida que existan (**no** Axxen); `contactPoint` con WhatsApp y email; `areaServed: "AR"`; sin `founder` (D4) |
| `WebSite` | `/` | name, url, `inLanguage: "es-AR"`, publisher → `#org` |
| `SoftwareApplication` (+ `WebApplication`) | `/`, `/para-complejos`, `/precios` | `applicationCategory: "BusinessApplication"`, `operatingSystem: "Web"`, description (frase media), `offers`: Offer de 3.000.000 centavos → `price: "30000"`, `priceCurrency: "ARS"`, `unitText: "por cancha por mes"`, `priceValidUntil`, url `/precios`; más Offer de prueba en `price: "0"` ("Prueba de 30 días"). **Sin `aggregateRating`** hasta tener reseñas reales visibles en esa página |
| `FAQPage` | Donde la FAQ sea visible (`/precios`, comparativas) | No da rich result desde el 07/05/2026, pero ayuda a Bing y desambigua |
| `BreadcrumbList` | Páginas internas | — |
| `Article` | Guías y comparativas | `author: Organization #org` (D4), `datePublished` y `dateModified` reales e iguales a los visibles, `image`, `mainEntityOfPage` |
| `VideoObject` | Donde haya un video incrustado | name con "TurnoGol", `uploadDate`, `thumbnailUrl`, `contentUrl` o `embedUrl` |
| `SportsActivityLocation` | Solo en `/{complejo}`, nunca en la entidad TurnoGol | Ya existe; sumar `aggregateRating` cuando las reseñas sean visibles en la ficha; `priceRange` **solo** si el complejo no ocultó sus precios (`settings.hide_public_prices`) |

**Fuerza de la evidencia:**
- **Baja como palanca de citas.** El estudio controlado de Ahrefs (mayo de 2026, citado en el prompt) no encontró una mejora importante.
- **Alta como desambiguación y como precio legible por máquinas.** Los tres competidores que más aparecen la tienen.

## 6. Competencia (30/10/2026)

| Marca | Title del home | Precio publicado | Terceros | JSON-LD | Qué hace bien |
|---|---|---|---|---|---|
| **Vibe** (vibe.com.ar) | "Sistema de gestión gratis para complejos deportivos \| Vibe" | $0 para el complejo + $1.000 al jugador por pago online ([guía propia](https://vibe.com.ar/guias/vibe-o-atc-sports-en-que-se-diferencian)) | [Capterra](https://www.capterra.com/p/10045949/Vibe/), 0 reseñas | SoftwareApplication, FAQPage, Organization, WebSite | Title con la pregunta exacta, gancho de precio, 6 guías del 8 al 11/10 (3 comparativas con nombre) |
| **CanchaFija** (canchafija.com.ar) | "CanchaFija \| Reservá Canchas Online en Argentina" | $10.000 (1 cancha) a $60.000 (15 canchas); 3 canchas, $18.000 ([precios](https://canchafija.com.ar/precios)) | No encontré | Organization, WebSite, SoftwareApplication ×2, FAQPage | `/software-para-canchas-de-futbol` y un directorio de cientos de fichas `/t/<complejo>` |
| **Clubin** (clubinarg.com) | "Software de gestión de clubes deportivos \| Clubin Argentina" | $45.000 (1-3 canchas), $60.000 (4-6), $84.000 (7+), "actualizados a octubre de 2026" ([complejos](https://clubinarg.com/complejos-deportivos)) | No encontré | Solo WebSite | Precio con fecha, comparativa de 13 plataformas, 8 páginas `clubin-vs-X` |
| **ATC Sports** (atcsports.io) | "Tu próximo partido, a un link de distancia - ATC" | USD 50 (1-3), USD 80 (4-6), USD 100 (7+) ([software](https://atcsports.io/software-gestion-deportiva)) | Prensa (Forbes) | Ninguno | Tamaño y marca. **No apareció** en la respuesta de ChatGPT |
| **TurnosGol** (turnosgol.com.ar) | "TurnosGol \| Sistema de Reservas y Gestión para Canchas de Fútbol" | USD 500 inicial (1 cancha) o USD 50/mes + USD 10 por cancha extra ([home](https://www.turnosgol.com.ar/)) | No encontré | SoftwareApplication, Organization, FAQPage | Nombre a una letra del nuestro, mismo nicho |
| **Clubo** | — | — | — | — | **No existe** dominio ni producto |
| Otros que rankean | Canchero, CanchaYa (desde $40.000), ReservaSimple ($18.999), Reservalo, CanchaManager, Turnito, Turnopy | | | | |

**Huecos donde no hay un producto argentino de canchas bien posicionado** (relevamiento del 30/10/2026, búsquedas desde EE.UU.):
- "mejor app para gestionar complejo de fútbol": salen apps de equipos y ligas.
- "alternativas a ATC Sports".
- "cobrar señas con Mercado Pago canchas": salen guías de peluquerías.
- "sistema de turnos para canchas de fútbol" y "sistema de reservas para canchas de fútbol": hasta 6 de 10 resultados son repos de GitHub.

## 7. Entidad frente a TurnosGol

**Riesgo.** En un caso latinoamericano, el 75% de las citas sobre el nombre de una marca chica fue a páginas con nombres parecidos (CreceRank, citado en el prompt; no re-verificado). Hoy, buscando "TurnoGol", sale primero nuestro repo de GitHub, y buscando "TurnosGol" sale TurnosGol.

**Reglas de consistencia:**
1. **Un solo nombre.** Siempre "TurnoGol", en una palabra, con T y G mayúsculas, igual que el dominio, en el sitio, los perfiles, las facturas y los videos. "Turno Gol" va solo como `alternateName`.
2. **Una sola frase.** La frase corta de §1, idéntica en todos los perfiles.
3. **Un solo dominio.** turnogol.app. turnogol.com.ar se registra y se redirige cuando haya plata, y queda en el radar. Grep de `turnogol\.com` antes de cada commit.
4. **Sin compararnos con TurnosGol** ni nombrarlos en la web: nombrarlos refuerza la confusión de marca, que es el problema de fondo. (El art. 15 del DNU 274/2019 sobre publicidad comparativa lo cita el prompt, no está verificado y no es la razón.)
5. **Higiene del repo.** Lo que sale primero para "TurnoGol" es GitHub, así que los PRs y los commits no llevan nombres de clientes ni precios especiales. El repo queda público (D7).
6. **INPI.** Hacer una búsqueda gratis de "TurnoGol" y "TurnosGol" en el portal del INPI (clases 9, 35, 41 y 42). La consulta con un abogado de marcas queda para cuando haya plata.

**Punto de control: 01/02/2027.** Se corren las 4 preguntas de marca ("¿Qué es TurnoGol?", "TurnoGol opiniones", "¿Cuánto cuesta TurnoGol?", "TurnoGol vs ATC Sports") 3 veces cada una en ChatGPT, Gemini y Perplexity (36 corridas).
- **Si en el 50% o más de las corridas** la respuesta confunde o mezcla a TurnoGol con TurnosGol (precio en USD, Zeus Agencia, turnosgol.com.ar), se abre la decisión de cambiar el nombre, con los costos de cambiarlo ahora contra los de cambiarlo en un año.
- Es una inferencia y no una recomendación de la evidencia. **Decide Lázaro.**

## 8. Mapa de intenciones

Prompts y keywords → página que responde. La prioridad sale del impacto sobre las preguntas núcleo.

| Intención | Prompt o keyword (rioplatense) | Página que responde | Estado | Prioridad |
|---|---|---|---|---|
| Descubrimiento B2B | ¿Cuál es la mejor app para la gestión de mi complejo de fútbol? | `/para-complejos` + `/guias/como-elegir…` + comparativas | Reescribir / nueva | 1 |
| Descubrimiento B2B | ¿Qué sistema me recomendás para administrar las reservas de mis canchas de fútbol 5? | `/para-complejos`, `/funciones/reservas-online` | Reescribir / nueva | 1 |
| Descubrimiento B2B | Busco un software para manejar los turnos de mi predio de fútbol | `/para-complejos`, `/funciones/turnos-fijos` | Reescribir / nueva | 1 |
| Descubrimiento B2B | ¿Qué programa usan los complejos de fútbol en Argentina para reservas y caja? | `/para-complejos`, `/funciones/caja-y-buffet` | Reescribir / nueva | 1 |
| Descubrimiento B2B | Mejores sistemas de gestión para complejos de fútbol 5 en Argentina | `/guias/como-elegir…` | Nueva (reemplaza al post) | 1 |
| Descubrimiento B2B | Tengo tres canchas y un buffet y anoto todo en un cuaderno, ¿qué app me recomendás? | `/para-complejos` (sección buffet), `/funciones/caja-y-buffet` | Reescribir / nueva | 1 |
| Precio | ¿Hay alguna app gratis o barata para gestionar canchas de fútbol? | `/precios` (con "sin cargo al jugador"), `/comparar/turnogol-vs-vibe` | Corregir / nueva | 2 |
| Necesidad | Sistema de turnos para canchas de fútbol sin comisión por reserva | `/precios`, `/para-complejos` | Corregir | 1 |
| Necesidad | ¿Cómo cobro señas online en mi complejo con Mercado Pago? | `/funciones/sena-mercado-pago`, `/integraciones/mercado-pago` | Nueva | 2 |
| Necesidad | App para manejar turnos fijos en canchas de fútbol | `/funciones/turnos-fijos` | Nueva | 2 |
| Necesidad | ¿Cómo evito que los jugadores falten a los turnos? | `/funciones/faltazos`, `/herramientas/calculadora-de-faltazos` | Nueva | 2 |
| Necesidad | Software para controlar la caja del buffet de un complejo de fútbol | `/funciones/caja-y-buffet` | Nueva | 2 |
| Necesidad | Sistema para que reserven online sin descargar una app | `/funciones/reservas-online` | Nueva | 2 |
| Necesidad (nueva) | ¿Cómo cobro la cancha por equipo? / dividir el pago del turno | `/funciones/cobro-por-equipo` | Nueva | 2 |
| Necesidad (nueva) | Bot de WhatsApp para reservas de canchas | `/funciones/asistente-whatsapp` | Nueva | 2 |
| Comparación | Alternativas a ATC Sports para un complejo de fútbol | `/alternativas/atc-sports` | Reemplazar (301) | 1 |
| Comparación | ¿Vibe, CanchaFija o Clubin? / ¿TurnoGol o Vibe? | `/comparar/turnogol-vs-*` | Nueva | 2 |
| Comparación | ATC Sports precios / Alquila Tu Cancha | `/comparar/turnogol-vs-atc-sports` | Reemplazar (301) | 2 |
| Marca | ¿Qué es TurnoGol? / TurnoGol opiniones / ¿Cuánto cuesta TurnoGol? | `/`, `/nosotros`, `/precios`, perfiles en G2/Capterra | Corregir / nueva | 1 |
| Jugador | ¿Dónde reservo una cancha de fútbol 5 en Luján? | `/explorar` + fichas | Arreglar el streaming (T-02) | 2 |
| Jugador | App para reservar canchas de fútbol 5 en Buenos Aires | `/explorar` | Arreglar | 3 |
| Jugador | Armar un partido / me falta 1 para jugar | `/rival` | Existe (flag on) | 3 |
| Otros países | Software para canchas sintéticas (Colombia), fútbol rápido (México), arriendo de canchas (Chile), canchas sintéticas (Perú), instalaciones deportivas (España), fútbol 5 (Uruguay) | — | **Radar**: sin páginas por país hasta tener tracción en AR | — |

## 9. Vocabulario

**Sí:**
- sistema de gestión, software, complejo, predio, canchas, turno, los fijos, seña, buffet, cantina;
- fútbol 5, 7 y 11;
- cobrar por equipo, la noche, faltazo, "el que te cuelga el turno";
- reservas online las 24 h, sin bajarse una app, sin comisión por reserva.

**No:**
- plataforma, solución, integral, optimizá, digitalizá, dashboard, SaaS, B2B (`docs/gtm/03-posicionamiento.md:44`);
- "abonados" en el copy público (se dice "los fijos");
- "deuda por ausencia";
- "tiempo real" para el jugador;
- "Falta Uno";
- "el mejor" o "número 1" como eslogan.
