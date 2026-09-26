# Caja › Productos pone primero lo que hay que reponer

**Fecha**: 2026-09-26 · **Estado**: implementada en `refactor/caja-productos`, sin mergear · **Decide**: el
dueño (variante, qué pasa con los movimientos de stock y con el informe) + esta sesión (cómo)

## Origen

La misma fricción que rehízo Cuentas (`docs/decisions/2026-09-25-caja-libro-de-la-noche.md`): Caja "es un
quilombo, demasiado ruido visual". Registrada en `docs/gtm/ejecucion/10-aprendizajes.md` el 2026-09-24 y,
para Productos, el 2026-09-26.

Medido en producción (solo lectura, 11 noches del piloto):

- 31 productos: 30 activos, 21 con control de stock, 17 con mínimo cargado y ninguno con categoría.
- 0 reposiciones, 0 mermas y 0 cortesías: de 324 movimientos de stock, 322 son ventas, que ya cuenta Cuentas.
- Hoy nada está bajo el mínimo porque cargaron stocks iniciales grandes, pero la Imperial (76, mínimo 60,
  unas 7 por noche) va a pedir la primera reposición en dos o tres noches.
- La venta está concentrada: Amstel, Imperial y empanadas hacen 228 de 456 unidades, y 7 productos no se
  vendieron nunca.
- La pantalla ponía lado a lado un catálogo en tabla y un informe de tres tablas (ranking, cobrado por
  método —que repite Cuentas— y cobrado por día), con el ledger de stock plegado abajo.

Es refinamiento del panel (permitido desde el 2026-09-23): no cambia Server Actions, queries de plata ni
schema.

## Qué se decide

1. **Arriba, "Para reponer"** (variante "Reponer primero", elegida por el dueño entre tres). Una tarjeta
   con los productos activos en su mínimo o por debajo, o agotados (el mismo corte que el punto ámbar de la
   pestaña, `productsToRestock`), del que se acaba primero al último, cada uno con "quedan 55 (mínimo 60) ·
   al ritmo de esta semana alcanza 8 noches" y un botón "Reponer" que abre la reposición de siempre. Sin
   nada para reponer, la tarjeta no aparece. Descartadas: una sola lista con filtros y columna de ventas
   (mezcla lo que se mira todas las semanas con lo que se mira una vez) y pestañas "Catálogo / Ventas"
   (esconde las ventas detrás de un clic).
2. **El ritmo es el de los últimos 7 días**: lo vendido en la semana repartido en siete noches
   (`nightsOfStockLeft`). Sale del ranking de ventas de la semana (`getSalesRanking`, una lectura que ya
   existía); si el informe muestra 30 días, la página lee además el de 7. Sin ventas en la semana no se
   inventa un número: dice "no se vendió esta semana".
3. **El catálogo es una tarjeta con una fila por producto**: nombre, precio y stock en palabras ("Stock 252
   · mín 100", "Quedan 55 · mín 60" en ámbar, "Agotado" en rojo, "No lleva stock" o "Pausado"), y Reponer,
   Editar y "⋯" a la derecha. En el teléfono Reponer y Editar pasan arriba del menú "⋯" para que el nombre
   no se corte. "Agregar producto" va en el encabezado de la tarjeta. De a 40 por página: el catálogo del
   piloto entra entero.
4. **Al lado, "Lo que más salió"**: los 8 productos que más plata hicieron, con una barra, las unidades y
   la plata, el total arriba y los chips "7 días / 30 días" (`?range=30`). El resto queda detrás de "Ver
   los otros N". Cuenta lo entregado, fiados sin cobrar incluidos.
5. **"Cobrado por método" y "Por día" se van** (decisión del dueño): el primero repetía Cuentas y el
   segundo no lo miraba nadie. `getCanteenTotalsByMethod` y `getCanteenDailyTotals` quedan en
   `canteen-report.service.ts` con sus tests de integración y sin ninguna pantalla que las lea; borrarlas es
   aparte.
6. **Las listas largas scrollean adentro** (pedido del dueño al ver la primera versión: "un scroll general
   muy largo es muy malo"). El catálogo, el resto de "Lo que más salió" y los movimientos de stock tienen
   tope de alto (`ScrollRegion`); lo mismo se aplicó a las otras listas largas del panel (movimientos de
   Cuentas, Personas, Turnos fijos e historial de un jugador). Un agotado va siempre primero en "Para
   reponer", aunque no se haya vendido en la semana (lo marcó la revisión con contexto fresco).
7. **"Movimientos de stock" se queda plegado abajo** (decisión del dueño), ahora como tarjeta, con el
   mismo resumen del último movimiento y la misma paginación de a 20.

## Qué no cambia

- Ninguna Server Action, query de plata ni tabla. Los diálogos de alta, edición, reposición y salida de
  stock son los mismos, con las mismas actions por prop.
- Los permisos: el encargado no agrega, no edita ni pausa (ve el candado en "Agregar producto"); repone y
  da salida.
- Los pausados siguen al final del catálogo y se reactivan desde el menú.
