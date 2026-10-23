# Decisión: la grilla en el celular es una lista por hora

> **REVERTIDA 2026-10-22** por pedido del dueño tras feedback de un cliente (el Zurdo): no se distinguían bien las horas con libres. Vuelve la matriz en el celular. No reproponer la lista por hora sin resolver eso. Lo que sigue es el registro de lo que se probó.

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder), entre tres variantes dibujadas a 375 px · **Insumo:** [`10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md) (2026-09-16 y 2026-09-23) y PRODUCT.md (el dueño mira la noche desde el teléfono y a veces carga un turno).

## Problema

En el teléfono la grilla era la misma matriz que en escritorio. Con 5 canchas, a 375×812 cada columna mide 56 px y el encabezado se corta a "C1…C5". Un dueño no encontró sus canchas. Antes de #303 había una lista con una tira de píldoras por cancha y el scroll oculto, y fallaba igual: tres canchas de siete a la vista, y las otras "no existían".

## Decisión

Variante **A · Por hora**, elegida contra B (una tarjeta por cancha) y C (hora con fichas en grilla).

1. **Debajo de `md` (768 px) la grilla es una lista que baja hora por hora.** Desde `md` sigue la matriz, así que la tablet vertical y el escritorio no cambian.
2. **Cada hora** tiene un encabezado pegajoso con la hora, "Ahora" en la hora actual y, si todavía no empezó, "N libres" o "Completo". Debajo va **una fila por turno**: cancha, nombre y plata enteros, con el mismo color de plata que la matriz (`gridMoneyVisual`) y "No cobrado" escrito en rojo. Abajo van las **canchas libres como botones** "+ Cancha N" de 44 px, que bajan de renglón. No hay ninguna tira horizontal.
3. **Un evento de N horas** aparece en su hora de inicio y, en las siguientes, como "… · sigue hasta HH:MM". Tocarlo abre el mismo turno.
4. **Una hora que ya empezó y no tiene turnos no se muestra.** Si las primeras horas del día están en ese caso, se resumen en una línea: "09:00–17:00 · Sin turnos". Es la misma idea que la banda de la matriz, pero sin "Mostrar", porque lo que mostraría son horas pasadas y vacías. Al abrir, la lista arranca en la hora de ahora.
5. **Las dos vistas quedan montadas y elige el CSS.** No hay un hook de viewport, porque resuelve después del primer pintado. Comparten `cells`, los callbacks, el alta (`BookingFormModal`) y el modal de cobro, con sus acciones "Dividir pago por equipo", "Pagó uno" y cancelar. No hay queries, Server Actions ni estado nuevos.

## Por qué no repite lo que sacó #303

#303 sacó la lista vieja por tres motivos:

- **"¿Tenés cancha a las 22?" era lento.** Había que recorrer fichas de a una. Ahora, en cada hora, las libres se ven juntas.
- **Dos modelos que se desincronizaban.** Ahora el dato es uno solo: el mismo `cells` y el mismo `gridMoneyVisual`.
- **La tira de píldoras con el scroll oculto.** Ya no hay nada horizontal.

## Consecuencias

- En Playwright, `getByText` también encuentra la vista oculta, y `getByRole` no. Para buscar un turno por su nombre en `/grilla` hay que usar `visibleGridView(page)` (`tests/e2e/_helpers/grid.ts`).
- Hay que regenerar el baseline visual `admin-grilla-mobile.png` (proyecto `visual-mobile`).
