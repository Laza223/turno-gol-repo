# 00 — Resumen ejecutivo: que la IA nombre a TurnoGol

**Fecha:** 2026-10-31. **Plan activo de visibilidad en buscadores y asistentes de IA.** Presupuesto $0. Lo ejecuta Lázaro con sesiones de Claude Code (prompts en `08`).

## Diagnóstico en 5 líneas

1. **Nadie nombra a TurnoGol.** Cuando ChatGPT busca candidatos no encuentra a TurnoGol en ningún lado: ningún tercero lo nombra (ni listas, ni Capterra/G2, ni videos). No aparece en ninguna de las 8 búsquedas de dueño que relevamos. Buscando "TurnoGol", lo primero que sale es **nuestro repo público de GitHub**, con precios internos.
2. **El sitio le habla al jugador y no dice qué es TurnoGol para el dueño.** La home no dice "gestión", `/para-complejos` vende solo "señas" (1 de unas 35 funciones en producción) y `/precios` promete cosas que no son ciertas ("60 días", "cierre diario").
3. **Lo técnico está casi bien**: HTML servido, los bots de IA pasan, sin Cloudflare. Tiene tres agujeros: las fichas y `/explorar` les muestran un skeleton a los bots sin JS, `robots.txt` bloquea slugs por prefijo y hay **cero analítica**.
4. **Ganaron Vibe, CanchaFija y Clubin por el formato, no por el tamaño.** Tienen un title con la pregunta exacta, el precio con gancho, comparativas con nombre, fichas en directorios y datos de octubre de 2026. ATC, el líder, ni apareció.
5. **TurnoGol es el más caro de los que cobran en pesos** ($90.000 contra $18.000 a $45.000 para 3 canchas). El precio no se toca: se defiende mostrando lo que ningún multideporte hace (cobro por equipo, fijos que se repiten solos, la noche de la 1 AM, caja y buffet) y que no le cobra nada al jugador.

## Las 10 acciones de mayor impacto, en orden

| # | Acción | Quién | Cuándo | Tarea |
|---|---|---|---|---|
| 1 | Prender secret scanning y push protection en GitHub. Desde hoy, PRs sin nombres de clientes ni precios especiales | Lázaro | Ya | VIS-000 |
| 2 | **Medir la línea base** (32 respuestas semanales y unas 87 mensuales) antes de tocar el sitio | Claude Code (V0) + Lázaro | Semana 1 | VIS-001 |
| 3 | Search Console por DNS, confirmar Bing y el firewall de Vercel (AI Bots = Allow), y pedirles a 3 IAs que abran `/precios` | Lázaro | Semana 1 | VIS-002 a 005 |
| 4 | Técnico rápido: robots, noindex de lo privado, `es-AR`, canonicals, `lastmod` real, IndexNow, hotfix de claims, Vercel Analytics | Claude Code (V1) | Semanas 1-2 | VIS-006 a 014 |
| 5 | Fichas y `/explorar` con el contenido en el HTML inicial, más "Cómo se reserva acá" y el pie "Reservas con TurnoGol" | Claude Code (V2) | Semanas 2-3 | VIS-011, 026 |
| 6 | **Reenfoque:** home híbrida, `/para-complejos` como "sistema de gestión para complejos de fútbol", `/precios` corregida, `/nosotros`, grafo JSON-LD | Claude Code (V3) | Semanas 3-5 | VIS-015 a 020 |
| 7 | Perfiles gratis con la misma frase: G2/Capterra, LinkedIn de empresa, YouTube, Crunchbase, Apple Business Connect | Lázaro | Semanas 2-4 | VIS-021 |
| 8 | El Vagón pone su link de TurnoGol en su perfil de Google, su Instagram y su WhatsApp | Lázaro + cliente | Semana 4 | VIS-025 |
| 9 | **Comparativas agresivas** con datos que llevan fuente y fecha (Vibe, CanchaFija, Clubin, ATC), `/alternativas/atc-sports` y la guía de cómo elegir | Claude Code (V5) | Semanas 6-7 | VIS-030, 031, 034 |
| 10 | 4 tutoriales en YouTube con "TurnoGol" en el título, hechos con La Fábrica e incrustados en `/funciones/*` | Lázaro + Claude Code (V6) | Semanas 6-10 | VIS-032, 035 |

**La frase que tiene que repetir la IA** (`02-estrategia.md` §1):

> TurnoGol es el sistema de gestión hecho solo para complejos de fútbol: manejás la noche entera desde el celular (turnos fijos que se repiten solos, cobro por equipo, caja y buffet) mientras tus jugadores reservan online las 24 horas, sin bajarse una app. Sin comisión por reserva y sin cargo al jugador.

## Lo que NO hay que hacer ahora (y por qué)

- **Páginas por ciudad, versiones por país o hreflang.** Son doorways sin datos y no hay tracción fuera de Luján.
- **Pagar herramientas, ChatGPT Ads o prensa sin datos propios.** No hay presupuesto, y pagar no hace que ChatGPT te recomiende.
- **App de ChatGPT, MCP o conector.** Son canales de producto para el jugador, no de visibilidad del SaaS.
- **Inflar números o decir "el mejor".** Las IAs no lo citan y es lo único que un competidor te puede usar en contra.
- **Compararse con TurnosGol o nombrarlo.** Refuerza la confusión.
- **Cambiar el nombre antes del punto de control del 01/02/2027.**
- **Esperar que `llms.txt` o el schema de FAQ muevan algo.** Son higiene.

## Metas por etapa

Son hipótesis: se recalibran con la línea base.

| Etapa | Fechas | Meta |
|---|---|---|
| 0 · medir y destrabar | 01-14/11/2026 | Línea base medida. Search Console y Bing procesando. Bots confirmados. Cero claims inventados publicados |
| 1 · reenfocar | 08/11-12/12/2026 | turnogol.app arriba del repo para "TurnoGol". La IA describe bien a TurnoGol en la mitad o más de las preguntas de marca, en 2 de 4 motores. 5 perfiles externos |
| 2 · corroborar | 13/12/2026-20/02/2027 | TurnoGol nombrado en el 10% o más de las respuestas núcleo en algún motor. 3 o más sitios de terceros que lo nombren. 4 videos. 1-2 reseñas |
| 3 · escalar | desde marzo de 2027 | 25% o más en 2 motores. Pruebas que llegan desde una IA |

**Advertencia honesta:** este plan **no trae las 30 pruebas en semanas**. Lo que está en Internet tarda días o semanas en aparecer en las respuestas con búsqueda, y años en la memoria de los modelos. El canal de corto plazo sigue siendo el founder-led (`docs/gtm/`). Este plan empieza a sumar desde la Etapa 1, y la ventana para entrar es ahora: las marcas que ocupan la categoría tienden a quedarse.

## Riesgos principales

Detalle en `07`.

1. **Repo público** que sale primero y expone precios de clientes (ya pasa). Mitigación: VIS-000 + la regla de PRs.
2. **Confusión con TurnosGol.** Mitigación: consistencia de entidad y punto de control el 01/02/2027.
3. **Prometer funciones que no existen** (cobro automático, recordatorios, RIVAL v2). Mitigación: los estados A/B/C/D en cada brief y grep en cada verificación.
4. **Sostener la medición.** La corre Claude en cada sesión (D14); el riesgo es que un motor pida login o CAPTCHA. Mitigación: se anota "no medible sin sesión" y se mide en los que dejan.
5. **Depender de un solo cliente** (El Vagón). Mitigación: pedirle primero lo que le suma a él, el link en Google, y la reseña recién después de que active el plan.

## Mapa de los documentos

| Doc | Para qué |
|---|---|
| `01-auditoria.md` | Qué está mal y dónde (archivo y línea), con el esfuerzo y los hechos re-verificados con fuente |
| `02-estrategia.md` | La frase, las decisiones D1-D8, la propuesta de valor, la arquitectura, el schema, la competencia, la entidad y el mapa de intenciones |
| `03-plan-de-implementacion.md` | Backlog VIS-000 a VIS-058 con evidencia, responsable, puntaje, dependencias y criterio de aceptación, más el diagrama |
| `04-contenidos.md` | Un brief por página y el calendario de 90 días |
| `05-autoridad-externa.md` | Perfiles, reseñas, YouTube, efecto red, listas, alianzas y plantillas listas para mandar |
| `06-medicion.md` | Las preguntas, el protocolo manual, la planilla, las metas, Search Console, Bing, IndexNow, la analítica y el medidor a futuro |
| `07-riesgos-y-lineas-rojas.md` | Riesgos con su mitigación, líneas rojas y plan B |
| `08-prompts-de-implementacion.md` | V0 a V8, para pegar en sesiones nuevas |
| `09-preguntas-abiertas.md` | Lo que falta que respondas, con el supuesto que se usa mientras tanto |
