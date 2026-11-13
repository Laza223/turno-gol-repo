# Decisión: entrada por audiencia, el volante de dos audiencias y el motivo de cancelación

**Fecha:** 2026-11-08 · **Decide:** Lazar (founder). Aprobó el plan en el chat después de revisar con selects una lista de ideas que había escrito antes de usar Claude. · **Juicio completo de cada idea:** [`docs/planning/2026-11-08-ideas-del-founder.md`](../planning/2026-11-08-ideas-del-founder.md).

## Por qué

La tesis del founder es que TurnoGol tiene que competir por **distribución**, no solo por producto. Los sistemas de gestión para complejos se multiplican: CanchaFija, Dondejuego, Cheyovoy, Appcancheria, ATC, Clubo. Las funciones se copian en semanas; tener a los jugadores, no.

Se busca que el dueño de complejo sienta dos cosas:
1. sin un sistema se queda atrás;
2. sin TurnoGol pierde turnos, porque ahí están los jugadores.

El complejo piloto lo dijo con sus palabras: RIVAL le sirve como marketing y como un canal más para que le entren turnos. El precedente del rubro es Playtomic en pádel. Ganó siendo la app del jugador, y los clubes entraron porque sus jugadores ya estaban ahí.

## Decisiones

1. **Mitad y mitad.** La mitad del tiempo va a vender el SaaS, según el plan de noviembre: 10 altas usando al 30/11. La otra mitad va a construir distribución del lado del jugador.
2. **La distribución arranca en una zona: Luján.** Un jugador que abre TurnoGol y no ve complejos cerca no vuelve, y RIVAL sin rivales cerca está vacío. El contenido para jugadores, RIVAL y la cultura se concentran en Luján hasta pasar la puerta de densidad de [`docs/rival/README.md`](../rival/README.md), "Etapas": 8 clubes activos en una zona o 3 complejos. El SaaS se sigue vendiendo en cualquier lado.
3. **Entrada por audiencia, sin pantalla de elección en `/`.**
   - **`/` no muestra "Soy complejo / Soy jugador".** Hay tres motivos técnicos:
     - Google indexa la versión mobile, entrando como celular y sin cookies, así que vería siempre la pantalla de elección. Lo que esté solo en la versión desktop no cuenta para el índice.
     - Una pantalla completa que tapa el contenido al llegar desde el buscador es un intersticial intrusivo y baja el ranking mobile.
     - Los bots de las IAs tampoco guardan cookies.
   - **La elección vive en una URL propia con `noindex`** (nombre provisorio `/empezar`). Es el link de la bio y de los anuncios genéricos. Elegir guarda una cookie en ese dispositivo.
   - **`middleware.ts` redirige `/` hacia lo suyo solo si hay cookie.** Sin cookie, que es el caso de todo bot, `/` responde la home completa.
   - **Con una sesión de staff en el dispositivo, `/` lleva al panel.** El panel tiene su propio manifest de PWA con `start_url` en Hoy. Hoy hay uno solo, `src/app/manifest.ts`, con `start_url: '/'`.
   - **La home sigue D1** de [`docs/visibilidad-ia/02-estrategia.md`](../visibilidad-ia/02-estrategia.md): el jugador primero ("Buscar canchas") y abajo una banda para dueños. En desktop, la misma página puede darle más peso visual a la banda. Es el mismo HTML con otro layout, así que el contenido indexado es igual en los dos.
   - **Los anuncios para dueños van directo a `/para-complejos`**, sin pasar por la elección.
   - El SEO y la visibilidad en IAs para dueños se juegan en `/para-complejos`, `/precios`, `/funciones/*` y las comparativas, no en la home.
4. **El contenido masivo va para los jugadores, a partir de datos reales.**
   - Formatos fijos que salen de partidos verificados de RIVAL y de complejos con permiso, producidos en volumen con IA. Eso es lo que un competidor no puede copiar.
   - Sigue vigente que la IA no nombra jugadores ([`2026-10-29-rival-cultura-de-turnogol.md`](2026-10-29-rival-cultura-de-turnogol.md), cierre del 30/10).
   - Para dueños, el contenido es prueba para el que ya está evaluando, no el motor de volumen.
5. **D15 se modifica solo para redes.** En las redes de TurnoGol se puede mostrar un complejo cliente (nombre, escenas, testimonio) **con permiso por escrito de ese complejo**. En la web, D15 sigue igual: de los clientes no se publica nada.
6. **Motivo de cancelación: lista cerrada.**
   - Es de un toque y obligatoria para el jugador y para el encargado.
   - El dueño la ve en Métricas para saber por qué se le caen los turnos.
   - Reemplaza al texto libre de hoy (`bookings.canceled_reason`, `text`), que no se puede contar y choca con el veto de texto libre sobre personas (Ley 25.326).
   - La lista exacta y sacar los textareas se confirman al implementar. La propuesta está en el doc de triage.

## Lo que modifica

- **D15** de `docs/visibilidad-ia/02-estrategia.md`: queda acotada a la web (punto 5).
- **El banco de contenido para dueños** (`docs/gtm/data/captacion/01-contenido.md`, privado) pasa a ser vidriera para el dueño que evalúa, no el contenido masivo.
- D1 no cambia: esta decisión la complementa.

## Backlog anotado

Va sin fecha. Cada punto necesita su propia decisión escrita para reabrirse.

- **Recordatorio por WhatsApp al jugador** (por ejemplo, 1 h antes del turno). Sigue fuera: lo dice el CLAUDE.md, y [`2026-10-20-bot-whatsapp.md`](2026-10-20-bot-whatsapp.md) en "Lo que NO habilita". Además, Kapso Free admite un solo número. "El Día del Partido" de RIVAL ya cubre el caso opt-in.
- **Organizador de torneos** tipo "copa fácil". Es otra parte de TurnoGol y no va sobre el módulo de torneos de RIVAL.
- **Cámaras**, para competir con Beelup.

Torneos y cámaras se les venden a complejos que ya están adentro, así que van después de la puerta de densidad.

## Resuelto el mismo día

- **Analítica web: sí, Vercel Web Analytics.** Lo aprobó el founder. Se implementa aparte, verificando antes el límite de eventos del plan Pro.
- **Onboarding** (detalle en [`docs/planning/2026-11-08-onboarding-referencia-cancheria.md`](../planning/2026-11-08-onboarding-referencia-cancheria.md)):
  - el mail no bloquea el alta;
  - el alta termina en compartir el link (sale el paso obligatorio de primera reserva);
  - se oculta lo que el complejo dice que no usa;
  - la prueba sigue contando desde el alta.
- **"Entrar con Google" en el alta: sí, junto al mail.** Lo eligió el founder por select después del video ("Google recomendado y mail"). El mail queda siempre, porque Google bloquea su login dentro del navegador de Instagram, que es por donde llega el tráfico de la bio y los anuncios.

## REQUIERE INPUT

1. **El nombre de la URL de elección**, que hoy es `/empezar` de forma provisoria.
2. **Aparecer en TurnoGol gratis.** Lo propone el panel `billionaire-mindset` (Brunson + Thompson): la página del complejo y sus turnos visibles para los jugadores, sin pagar, y se cobra la gestión. Es la carnada clásica de un mercado de dos lados para llenar el mapa. Godin y Hormozi disienten (lo gratis atrae al que no paga). Toca precio y lifecycle. **Resuelto el mismo día: freemium con prueba al revés, en [`2026-11-08-freemium.md`](2026-11-08-freemium.md).**
