# Ancho del panel admin: un tope de 1600 px y un fondo sin caja

**Fecha:** 2026-09-19 · **Estado:** Implementada
**Migraciones:** ninguna
**Origen:** recorrida del dueño sobre una captura de `/canchas` (1920×1080 al 125 %, ~1535 px CSS): franjas
laterales de otro tono a cada lado y filas estiradas de punta a punta. Fricción registrada en
`docs/gtm/ejecucion/10-aprendizajes.md` (2026-09-19).
**Parte de:** `2026-09-17-caja-densidad-y-espacio.md` — lo que allí se resolvió para `/caja/*` se extiende
al resto del panel. Las superficies planas NO se extienden acá: son la Fase 1-2 de
`docs/planning/2026-09-17-plan-diseno-sacar-lo-generico.md`.

## Problema

`/caja/*`, `/grilla` y `/reservas` ya usaban el ancho del monitor; el resto del panel seguía en
`max-w-7xl` (1280 px). Dos causas, medidas en código:

1. **Un tope de 1280 px.** A 1535 px de ancho útil sobraban ~91 px por lado; en un monitor de 1920 sin
   escalar, ~200.
2. **El fondo dibujaba una caja.** `.content-area-gradient` estaba en el `<main>` con tope, así que solo
   pintaba esa caja y a los costados se veía `.shell-bg` (grilla, glows). Subir el tope no lo arregla: pasado
   1672 px de ventana la caja reaparece. Hay que sacar el fondo del elemento con tope.

Adentro se perdía más: `p-6` duplicado sobre el `px-8` del shell (Jugadores, Abonados, Torneos), `max-w-*`
propios (ficha de jugador 768 px, alta de turno fijo 1152 px, detalle de reserva 1152 px) y listas de una
fila por elemento (Canchas, Torneos, inscripciones) con el dato a un extremo y la acción al otro.

## Decisión

1. **Un solo tope: 1600 px para todo lo que no es full-bleed.** Se borra el modo `isWide` de `/caja`:
   ahora es el modo normal. No es full-bleed porque pasado ese ancho una fila se estira de punta a punta y el
   ojo pierde el renglón (mismo argumento de la decisión de Caja).
2. **El fondo va en el contenedor sin tope** (`div lg:pl-[72px]` en el shell admin, `lg:pl-60` en el de
   super-admin), no en el `<main>`. Sin caja a ningún ancho.
3. **La página no agrega margen propio.** Fuera `p-6` en Jugadores, Abonados y Torneos, y fuera los
   `max-w-*` de la ficha de jugador, del alta de turno fijo y del detalle de reserva con cobros. Quedan
   angostos a propósito: `reservas/[id]` sin cobros (`max-w-3xl`), `torneos/nuevo` (`max-w-2xl`) y los
   formularios de `settings/perfil` (`max-w-xl/lg/md`).
4. **Lo que quedaba en una columna estirada pasa a dos en `lg`:** lista de Canchas, lista de Torneos,
   ficha de jugador, gráficos del reporte mensual de Analíticas y el acta del partido (Resultado a la
   izquierda, Acta a la derecha, sin partir la card). Tres excepciones donde el contenido arma sus
   columnas por viewport y a media columna no entra: las tablas "Por cancha" / "Por método" de Analíticas
   (`min-w-[520px]`) y Perfil de Configuración van desde `xl`; Horarios de Configuración y el detalle de
   torneo desde 1440 px (`TeamsPanel` con el nombre del jugador en 24–130 px a 1024–1280, medido). Toda
   grilla con `grid-cols-1` explícito (una columna implícita crece con el texto más largo). La ficha de
   jugador dibuja una pista de grilla menos cuando no hay turnos fijos, porque una pista vacía igual paga
   sus dos `gap`, y su `dl` de email/teléfono lleva `min-w-0` + `break-words`.
5. **Super-admin** recibe el mismo cambio en su shell.
6. **Skeleton de Canchas** alineado con la página: era un `<main max-w-4xl mx-auto>` (un `<main>` dentro
   del `<main>` del shell, 896 px contra 1216) y producía un salto de layout al cargar.

## Fuera de alcance

- **Aplanar cards, `PageHeader` con banda, `card-premium`:** Fase 1-2 del plan de diseño.
- **`(player)`, `(public)`, `(business)`, `(auth)`, onboarding y `select-tenant`:** cara al jugador, marketing
  o formularios de una columna; angostos a propósito.
- **Dashboard (Hoy) a dos columnas.** Se probó poner "Necesita tu atención" y "Mientras no estabas" lado a
  lado y se revirtió: exigía mover "Mientras no estabas" en el DOM, y en el teléfono empujaba "Próximos
  turnos" hacia abajo, contra el orden decidido el 2026-09-12 (lo que exige acción primero, lo que falta
  jugar después, el feed al final). Hoy queda en una columna a 1600 px. Si se quiere reacomodar, es una
  decisión de producto sobre ese orden.
- **Inscripciones de torneo como tabla.** Queda la fila estirada. `ResponsiveList` renderiza tabla y cards
  a la vez en el DOM y obligaría a duplicar el formulario de cobro (ids repetidos, seis stories que cuentan
  botones "Cobrar"): es un circuito de plata y no se toca por ancho. Si se retoma, va con su propio plan.
- **`loading.tsx` que dibujan contenido que ya no existe** (Configuración, Equipo, Torneos heredado): es un
  desajuste de contenido, no de ancho.

## Alternativas descartadas

**Sin tope (full-bleed en todo el panel).** Resuelve las franjas, pero una fila de lista o de deuda se
estira 1800 px y no se lee. Full-bleed queda para las dos pantallas que resuelven el scroll adentro.

**Subir el tope sin mover el fondo.** Deja la caja con franjas en cualquier monitor de más de 1672 px.

**Container queries en vez de `lg:` para las dos columnas.** Más correcto en teoría, pero el resto del repo
usa breakpoints de viewport y el ancho del contenedor solo cambia por el riel de 72 px fijo.

## Consecuencias aceptadas

- **Las baselines de regresión visual cambian** (`admin-canchas`, `admin-settings-reservas`, y por el fondo
  movido `admin-grilla` y `admin-grilla-mobile`). Corren solo en Linux/CI y no en PRs: se regeneran con
  `visual-baseline.yml` y se corre `ci.yml` sobre la rama antes de mergear.
- **En super-admin el header y el sidebar son translúcidos** y ahora dejan pasar el gradiente en vez de
  `.shell-bg`: cambio de tono casi imperceptible.
- **A 1440 px de ventana el contenido crece de 1216 a ~1304 px.** Es lo que se busca, pero las pantallas
  con tablas de `min-w-*` ya no scrollean horizontal y las de dos columnas quedan más apretadas que antes.
