# Caja: densidad, espacio y listas con techo

**Fecha:** 2026-09-17 · **Estado:** Implementada
**Migraciones:** ninguna
**Origen:** recorrida del dueño por las tres vistas (fricción registrada en
`docs/gtm/ejecucion/10-aprendizajes.md`, entrada del 2026-09-17). Es la Fase 4 ("Cantina") de
`docs/planning/2026-09-17-plan-diseno-sacar-lo-generico.md`, adelantada a las Fases 0-2.
**Spec resultante:** `docs/spec/design-system/pages/caja.md` v3.0
**Parte de:** `2026-09-12-rediseno-caja-tres-destinos.md` — los tres destinos no cambian.

## Problema

El rediseño del 2026-09-12 ordenó QUÉ va en cada destino; este atiende CÓMO se ve. Tres síntomas,
contados sobre la app corriendo:

1. **Espacio.** Cada bloque era una card con borde y sombra dentro de un contenedor de 1280 px. En
   un monitor de 1920 quedaban ~320 px muertos de cada lado, y adentro el contenido volvía a
   perder margen contra el borde de la card.
2. **Tarjetas donde había comparaciones.** La venta se hacía tocando cuadros de ~200×90 px aunque
   el complejo tuviera tres productos (la grilla estaba pensada para 13 o más, y el buscador
   aparecía recién ahí). Cada deuda era una tarjeta de ~150 px: con 14 turnos sin cobrar,
   "Movimientos del día" quedaba fuera de la vista.
3. **Listas sin techo.** Deudas, diario del día y ledger de stock no paginaban. El ledger además
   mostraba los últimos 20 y lo anterior no se podía ver desde ningún lado.

## Decisión

1. **Superficies planas.** Sin card alrededor de las secciones: un `SectionHeader` (título, el dato
   que contesta la pregunta, acciones) y una línea de 1 px. `ResponsiveList` gana `flat`. La sombra
   queda para lo que flota (diálogos, menús).
2. **`/caja/*` a 1600 px.** Tercer modo del contenedor en `admin-layout-shell.tsx`, junto al de
   Grilla/Reservas. No es full-bleed: pasado ese ancho una fila de deuda se estira de punta a punta
   y el ojo pierde el renglón.
3. **Vender es una lista con buscador, no una grilla de botones.** Buscador siempre visible, con
   foco automático solo con mouse (en el teléfono abriría el teclado encima del catálogo); `Enter`
   agrega el primer resultado. Filtro Todos / Productos / Servicios derivado de `stock IS NULL`. El
   catálogo scrollea solo en `lg`.
4. **Fiados fuera de Vender.** Se cobran donde se cobra toda deuda (Cuentas). En Vender queda una
   línea con cuántos hay y cuánto suman, que linkea a Cuentas, y en su lugar entran los últimos
   tres movimientos como acuse de recibo del cobro recién hecho, a lo ancho debajo del catálogo
   (el dueño lo prefirió sobre ponerlos bajo el Ticket). Tres y no cinco: con cinco la pantalla
   scrolleaba 114 px a 1440×900.
5. **Cuentas: tabla de deudas a la izquierda, diario del día a la derecha**, las dos visibles sin
   scroll en escritorio. La fila de un turno entera abre el turno. Mueren las dos tarjetas de KPI
   ("Deudas", "Tenés que devolver"): el total va como texto en el encabezado de su lista.
6. **"Tenés que devolver" existe solo si hay algo que devolver.** Sin filas no se dibuja nada.
7. **"Cobrado hoy", la fecha y el alta de movimiento bajan al encabezado del diario.** El botón pasa
   a decir "Registrar movimiento".
8. **Paginación donde no había techo.** Deudas de a 25 en el cliente (ya se cargan enteras y se
   filtran por nombre y origen sobre la lista entera), diario de a 25 y ledger de a 20 por URL.
   `getCashFlows` y `getLedger` aceptan `offset` (y `getCashFlows`, `limit`), con `id` como
   desempate del orden.
9. **El alta de producto controla stock por defecto**, y el modal se agranda en dos bloques ("El
   producto" / "Stock") con una línea de ayuda por campo —qué es el costo, el stock inicial y el
   mínimo— y la ganancia por unidad dicha en palabras. El stock inicial pasa a ser obligatorio en
   el caso normal.
10. **Aviso de stock bajo: un punto ámbar en la pestaña "Productos"**, visible desde los tres
    destinos, y "N para reponer" en el encabezado del catálogo. Sin banner ni toast.

## Alternativas descartadas

**Reponer "Recientes".** El dueño pidió productos recientes. Se eliminó el 2026-09-12 porque
duplicaba el catálogo y en mobile empujaba la venta bajo el pliegue, y esas dos razones siguen
en pie. Lo que buscaba —llegar rápido al producto de siempre— lo resuelve el buscador con foco:
dos letras y `Enter`.

**Columna `category` en `canteen_products`.** Una cantina de complejo vende entre 3 y 15 cosas.
Mantener una taxonomía (una migración, un campo más en cada alta) cuesta más que buscar, y la
única división que importa en el mostrador —se cuenta o no se cuenta— ya está en la base.

**Cuadros más chicos en vez de filas.** Es el estándar de un POS táctil (Square, Toast), pensado
para cientos de artículos y dedo. Con pocos artículos y teclado a mano, la fila con buscador es
más rápida, y es lo que el dueño esperaba ver.

**Un modal "ver todos los movimientos".** El diario completo ya es una pantalla con URL propia
(Cuentas): el "Ver todos" de Vender lleva ahí. Un modal habría sido una tercera forma de ver lo
mismo.

**Esconder devoluciones según la configuración de seña.** Mirar `requires_deposit` y
`mpConnectedAt` no alcanza: un complejo que cobró señas y después las apagó todavía puede deber.
"Sin filas, no hay sección" cubre los dos casos sin leer la configuración.

**Paginar las deudas en el servidor.** `getStreetMoney` une tres orígenes en memoria y la lista se
filtra por nombre y por origen: paginar en SQL filtraría solo la página visible.

## Consecuencias aceptadas

- **Cobrar un fiado desde Vender pasa a ser un clic más** (la línea de aviso lleva a Cuentas).
- **Se revierten dos puntos de `caja.md` v2.1:** el techo de alto del catálogo vuelve, solo en
  `lg` (en el teléfono sigue sin techo y manda la barra de cobro pegada), y "Cobrado hoy" deja la
  barra superior.
- **`/caja` queda más plana que el resto del panel** hasta que la Fase 1 del plan de diseño barra
  el `PageHeader` con banda, el `StatCard` con ícono y los botones con sombra. Lo que se repite
  (`SectionHeader`, `Pager`, `ResponsiveList flat`) nació en `components/` para que esa fase lo
  adopte.
- **Los verdes pasan de `emerald-700` a `emerald-800`** donde el texto dejó de apoyar sobre una
  card blanca: sobre el fondo de la página `emerald-700` da 4,41:1 y no llega a AA (lo midió el
  gate de Storybook).
- **`Pager` reemplaza los dos paginadores copiados** de `/jugadores` y `/reservas`, con los mismos
  textos y la misma forma.
- **`lowStockCount` cuenta también un agotado sin mínimo cargado.** Antes lo dejaba afuera, y
  nunca se había usado: el aviso tiene que coincidir con el badge "Agotado" de la fila.
- **"Cobrar" en cada fila de deuda y "Registrar movimiento" pasan a botón con borde.** Dieciséis
  botones verdes sólidos eran una pared de verde, contra la regla del plan de diseño (un primario
  por vista, el resto outline).
- **Las grillas de Cuentas y Productos declaran `grid-cols-1` en el teléfono.** Sin columna
  explícita, la columna implícita crece hasta el texto más largo que no se parte (una descripción
  con un nombre de producto largo) y empujaba el monto y "Cobrar" fuera de la pantalla. Se midió
  con datos reales a 393 px antes y después.
