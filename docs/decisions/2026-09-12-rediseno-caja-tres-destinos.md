# Rediseño de Caja — tres destinos por audiencia (Vender · Cuentas · Productos)

**Fecha:** 2026-09-12 · **Estado:** Implementada
**Migraciones:** ninguna
**Origen:** propuesta de Claude Design (proyecto `1bdbc2fe-b6d5-46d3-ac1a-7c53038ae9e9`), bajada al
repo con el código como autoridad. Encuadre del dueño: fricción de adopción observada, permitida
por el feature freeze D4 (`2026-09-02-experimento-30-dias.md`).
**Spec resultante:** `docs/spec/design-system/pages/caja.md` v2.0

## Problema

Caja es dos cosas con dos dueños: una caja registradora que el encargado usa de pie, con una mano
y con gente esperando, y un libro de cuentas que el dueño mira una o dos veces por día. Convivían
en la misma pantalla con el mismo peso, y el costo lo pagaba siempre quien vende: al entrar a
`/caja` había 120 px de `PageHeader`, tres totales del dueño, una barra de cuatro pestañas y recién
abajo los productos. En el teléfono el botón de cobro quedaba debajo del catálogo, con scroll propio.

## Decisión

1. **Tres destinos por audiencia y frecuencia, no cuatro por tabla de la base.** `/caja` es Vender,
   `/caja/cuentas` es el libro y `/caja/productos` es lo semanal. La jerarquía la fija la URL, no un
   modo ni un selector: el encargado nunca necesita entrar a Cuentas para trabajar, y el dueño llega
   con un toque.
2. **Vender no muestra ningún número agregado.** Carga dos cosas (catálogo y fiados abiertos) en vez
   de ocho. Sin `PageHeader` y sin `card-entrance`: una animación de entrada de 400 ms en la pantalla
   que se abre decenas de veces por noche es exactamente lo que este rediseño viene a sacar, y su
   `transform` final además envolvería a la barra de cobro `sticky`.
3. **Deudas y Devolvés viven juntas en Cuentas, como dos listas con dos totales.** Son las dos
   direcciones opuestas de la plata pendiente. Nunca se netean: restarlas rompería el invariante de
   fuente única del total de "Deudas" que `street-money-total.test.ts` compara por dos caminos.
4. **Las rutas viejas quedan como `redirect`, y sus componentes y Server Actions se quedan donde
   están.** `/caja/deudas` y `/caja/devoluciones` redirigen a `/caja/cuentas`, que importa
   `StreetMoneyList`, `PendingRefundsList`, `chargeDebtAction` y `markRefundSettledAction` desde sus
   carpetas originales. Mismo patrón que ya usaba `caja/cantina/`.
5. **`getDaySummary` devuelve además `collectedByMethod`.** Ver "Alternativas descartadas".
6. **El fiado deja de pedir una nota libre** y `note` sale del schema de la Server Action: no es que
   la UI lo esconda, es que ya no hay camino para escribirlo. La columna `canteen_tabs.note` queda
   intacta con lo cargado antes, y la lista dejó de publicarlo.
7. **Marcar una seña devuelta baja de Clase C a Clase B** (decisión del dueño): se retira la frase
   tipeada `DEVOLVER` y en su lugar el diálogo muestra las consecuencias enteras, con chips de
   método y el monto dentro del botón.

## Alternativas descartadas

**El armazón que la propuesta asumía.** El diseño cuelga el selector de destinos de una "barra de
60 px" con un hueco llamado `AdminHeaderSlot`, junto a un riel vertical de 72 px, y afirma que la
Grilla ya funciona así. Nada de eso existe en este repo: el shell es `AdminSidebar` de 240 px más
`AdminHeader` de 64 px sin slot de página, y `AdminHeaderSlot` no aparece ni en `src/` ni en
`docs/`. MASTER §6.8 manda lo contrario de forma explícita ("cada espacio resuelve su estructura
interna con pestañas, nunca con submenús"). Construir ese armazón era rediseñar el panel entero y
mover las seis fotos de regresión visual. Se descartó: la ganancia real de la propuesta —recuperar
el encabezado y sacar los totales de la pantalla de venta— no depende de él, y `ScrollTabs` ya
resuelve la navegación con 44 px de target y contraste calibrado.

**Reusar `byMethod` para el desglose de "Cobrado hoy".** Era lo barato y es una trampa: `byMethod`
es NETO —un egreso resta de su propio método, porque servía al arqueo— así que sus partes suman
`balance`, no `collected`. Metido dentro de una card titulada "Cobrado hoy", los números de adentro
no darían el número de arriba, y nada lo avisaría: no hay error, no hay test que lo mire, solo una
card que se contradice a sí misma. Por eso se agregó `collectedByMethod` (ingresos + ajustes, sin
egresos) en la misma pasada de la query que ya existía. `byMethod` se conserva: contesta otra
pregunta y tiene su propio test de integración.

**Mover los componentes y las actions a `cuentas/`.** Habría movido unas mil líneas de lógica de
plata ya testeada para no ganar nada funcional, y habría roto los imports de `grilla/page.tsx` y los
paths de dos tests unitarios. Lo que cambió es dónde se muestran, no qué hacen.

**Cuatro destinos (Deudas y Devolvés separadas).** Es la topología vieja con otro nombre: la regla
de no netear se cumple mostrándolas como dos listas con dos totales, no como dos URLs.

**Ordenar el catálogo de venta por lo más vendido.** El ranking existe (30 días) pero usarlo para
ordenar la venta es una lectura nueva del mismo dato con costo por render, sin evidencia de uso que
lo pida. Queda el orden actual; lo que sí se eliminó es la sección "Recientes", que duplicaba el
catálogo entero y en mobile empujaba la venta bajo el pliegue.

**Reponer lo que se eliminó el 2026-09-11.** El diseño pedía ver el diario de un día pasado y
navegar por fecha. Su propio decision doc dice que volver a tenerlo es una feature nueva a diseñar
desde cero. Y el "efectivo esperado en el cajón" es el arqueo con otro nombre: se calcula, no se
muestra.

## Consecuencias aceptadas

- **`getStreetMoneyTotal` se eliminó** (decisión del dueño, 2026-09-12). Existía para que `/caja`
  mostrara el total sin materializar la lista; Cuentas necesita la lista igual, así que usa
  `sumStreetMoney` sobre esas mismas filas y ya no hay dos cuentas que puedan divergir. Con la
  función se fue la duplicación de los predicados de los tres orígenes y el test que la vigilaba
  (`street-money-total.test.ts`). Los cuatro casos de la ventana de 12 meses que vivían en ese
  archivo se conservaron en `street-money-window.test.ts`: miden `getStreetMoney`, que sigue vivo.
- **En el teléfono no hay controles +/− de cantidad**: el panel del Ticket no se renderiza
  (`hidden md:flex`) y la cantidad se sube tocando la tarjeta de nuevo. El e2e móvil mide los
  controles de la barra de cobro en su lugar.
- **`/caja` sigue sin foto de regresión visual**, así que ningún canario de layout cubre esta
  sección. El riesgo se mitiga con las play functions de Storybook, que corren en Chromium real y en
  los dos temas.
- **El catálogo perdió dos columnas** (costo·margen y estado) y bajó su `min-w` de 720 a 460 px,
  que es lo que le permite convivir con el informe en la misma fila. El margen no se perdió: se
  calcula en la hoja de edición, al lado de los dos números que lo forman.
- **El menú "…" de cada producto queda con dos ítems** (salida de stock y pausar). Se evaluó
  eliminarlo del todo, como pedía la propuesta, pero entonces esas dos acciones ocasionales no
  tenían dónde vivir salvo ocupando lugar en la fila.

## Deja sin efecto

- `docs/spec/design-system/pages/caja.md` v1.0 entera: describía la "Caja del día" con su apertura,
  su arqueo y su ritual de cierre.
- La fila "Cerrar caja del día → `CERRAR`" de la tabla de Clase C en
  `docs/spec/design-system/gramatica-interaccion.md` (muerta desde el 2026-09-11), y la
  clasificación de "marcar seña devuelta" como Clase C.
