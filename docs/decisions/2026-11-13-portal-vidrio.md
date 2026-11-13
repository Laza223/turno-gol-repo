# Decisión: el portal pasa a vidrio, en claro y oscuro

**Fecha:** 2026-11-13. **Decide:** Lazar (founder), con el mockup a la vista. Aprobó el hero el 2026-11-12, después la home y el buscador, y el 2026-11-13 las 16 pantallas ("lo apruebo totalmente"). **Insumo:** el mockup de [`docs/planning/mockups/2026-11-13-portal-vidrio/`](../planning/mockups/2026-11-13-portal-vidrio/README.md).

## Qué se decide

- **El portal usa vidrio.** Superficies translúcidas con desenfoque de lo que tienen detrás, borde claro de 1 px, brillo interior arriba y radios grandes. El fondo de cada página lleva un resplandor verde suave para que el vidrio tenga algo que refractar. La referencia es el estilo de Apple, con la marca de TurnoGol.
- **Dos temas completos**, oscuro y claro. Por defecto se ve el tema del celu. El botón para cambiarlo queda arriba a la derecha.
- **El hero lleva foto de fondo**, desenfocada detrás del titular, el subtítulo y el buscador, y nítida abajo. En oscuro es una foto de noche y en claro una de día.
- **Titular nuevo de la home:** "Tu cancha, a un toque.", con "a un toque." en verde. Sale la pastilla de arriba del titular.
- **Alcance: todo lo que no es el panel del complejo.** Home, `/explorar`, ficha del complejo, confirmar el turno, vuelta de la reserva, Mis reservas, Cuenta, Ingresar, Rival, la página para complejos, planes, blog y legales, y las pantallas de error.
- **La ficha del complejo deja los tres pasos.** Todo pasa en una pantalla: los días van arriba en una fila, las horas en cuadrados y, al tocar una hora, sube desde abajo una barra con la cancha, el precio y el botón "Reservar".
- **La ficha muestra "Partidos abiertos"** del complejo, detrás del flag `rival`. Si el complejo no tiene partidos publicados, la sección no aparece.
- **Barra de abajo:** Explorar, Rival, Reservas y Cuenta. Rival aparece solo con el flag `rival` prendido.
- **Buscador:** la cancha se elige de Fútbol 4 a Fútbol 11, de a varias, en un select. En el celu van dos tarjetas de complejo por fila.
- **Movimiento.** El portal puede usar `motion` (ya instalada) y las transiciones de vista de React. La dirección y los límites están en [`2026-11-13-portal-vidrio-direccion.md`](../planning/2026-11-13-portal-vidrio-direccion.md).

Los valores concretos (colores, tamaños, radios, desenfoques) son los del mockup (`glass.css` y `glass-app.css`). Pasan a `DESIGN.md` en la última fase.

## Qué reemplaza

- **El look de [`2026-11-08-portal-plano-dos-temas.md`](2026-11-08-portal-plano-dos-temas.md).** Dejan de valer "superficies planas", "sale el vidrio decorativo y los resplandores" y "la barra de abajo es el único vidrio". También sus fases P1 a P4: las reemplaza el [plan de vidrio](../planning/2026-11-13-portal-vidrio-plan.md). El titular "Tu partido empieza en TurnoGol" sale.
- **La ficha en tres pasos de [`2026-10-29-ficha-reserva-en-pasos.md`](2026-10-29-ficha-reserva-en-pasos.md)**, en su forma. Lo que esa decisión resolvió por debajo sigue: el día, la hora y el tamaño viven en la URL, y los estados sin lugar, cerrado y con error se conservan.
- **La regla de `DESIGN.md` "no agregar librerías de animación (la única excepción es `/onboarding`)".** Se suma el portal como segunda excepción. El panel sigue sin librería.

## Qué sigue vigente

- De la decisión del 2026-11-08: los dos temas, el buscador que pide solo Localidad y Cancha, la localidad por IP con la hoja para cambiarla, la tipografía Archivo, los precios ocultos por complejo y la regla de no inventar datos. La tira de logos y los videos de dueños se publican solo con material real.
- Contraste AA en claro y en oscuro, foco visible y objetivos táctiles de 44 px.
- El panel (El Mostrador) no cambia. El alta del complejo (`/onboarding` y `/register`) tampoco.
- Los vetos de producto de `CLAUDE.md`. Rival sigue detrás del flag `rival`, con contacto por WhatsApp solo después de aceptar.
- Los textos visibles pasan por la skill `turnogol-copy`. Por defecto se conserva el texto de producción. Cambian solo los que nombra esta decisión.

## Riesgos y pendientes

- **Rendimiento del desenfoque.** `backdrop-filter` cuesta en celulares modestos. El plan define dos niveles de vidrio y un presupuesto de capas. Se mide en la primera fase.
- **La ficha cambia para los jugadores de complejos que ya están en producción.** Cada fase necesita el OK de Lazar antes de mergear.
- **Fotos propias.** El hero necesita una foto de noche y otra de día o de atardecer. Los reemplazos de Wikimedia del mockup no van a producción.
- **Navegadores sin `backdrop-filter`.** El vidrio pasa a casi opaco y se sigue leyendo. Hay que probarlo.
- **Pantallas sin mockup:** torneos, referidos, reactivar cuenta, la baja de avisos de Rival y el ingreso del complejo. El plan dice qué se hace con cada una.
- **La localidad por IP y la ISR de la home**, heredado del 2026-11-08: se resuelve al migrar la home.

## Fases

Están en el [plan](../planning/2026-11-13-portal-vidrio-plan.md). Un PR por fase. Hasta la última, `DESIGN.md` y `PRODUCT.md` llevan solo un puntero a esta decisión.
