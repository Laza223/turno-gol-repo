# Mockup: portal de vidrio (2026-11-13)

Todas las pantallas del jugador y las públicas en el lenguaje de vidrio que aprobó Lazar. Es la referencia visual de la decisión [`2026-11-13-portal-vidrio.md`](../../../decisions/2026-11-13-portal-vidrio.md). El plan para llevarlo al código está en [`2026-11-13-portal-vidrio-plan.md`](../../2026-11-13-portal-vidrio-plan.md).

Es HTML y CSS a mano, sin framework. No es código de producción: sirve para mirar, medir y copiar valores.

## Cómo abrirlo

Abrí cualquier `.html` en el navegador, directo desde el disco. Arrancan en oscuro y traen arriba a la derecha el botón para pasar a claro. `?theme=light` lo fuerza.

Las pantallas con más de un estado tienen abajo un recuadro punteado que dice "Solo en el mockup". Sirve para cambiar de estado y no es parte del diseño.

| Archivo | Pantalla | Estados |
| --- | --- | --- |
| `home.html` | Home | |
| `buscador.html` | `/explorar` | select de cancha (`?sheet=cancha`), hoja de localidad (`?sheet=localidad`) |
| `complejo.html` | Ficha del complejo | al tocar una hora sube "Reservar" con la cancha y el precio (`?s=bar:on`) |
| `reservar.html` | Confirmar el turno | sin cuenta, enlace enviado, con seña, sin seña, turno ocupado |
| `reserva.html` | Reserva lista | confirmada, falta la seña, pago rechazado |
| `mis-reservas.html` | Mis reservas | próximos, historial, sin turnos, cancelar |
| `ingresar.html` | Ingresar | formulario, enlace enviado, enlace vencido, cuenta nueva |
| `cuenta.html` | Mi cuenta | cuenta, eliminar la cuenta |
| `rival.html` | Tablón y Mis partidos | con partidos, sin partidos |
| `rival-nuevo.html` | Armar un partido | |
| `rival-partido.html` | Un partido | desde el tablón, pedido enviado, ya adentro, quien organiza |
| `para-complejos.html` | Página para complejos | |
| `precios.html` | Planes | mensual y anual |
| `blog.html` y `articulo.html` | Blog y plantilla de nota, comparativa o legal | |
| `estados.html` | Errores | página no encontrada, complejo no encontrado, error, complejo en pausa |

Los estados de una pantalla se abren con `?view=<estado>`.

## Qué hay en la carpeta

- `*.src.html`: el fuente de cada pantalla.
- `glass.css`: tokens, receta de vidrio, home y buscador.
- `glass-app.css`: el resto de las pantallas.
- `glass.js`: tema, hojas y cambio de estados. Es andamiaje del mockup.
- `build.mjs`: arma los `.html` desde los fuentes. La cabecera, la barra de abajo, el pie y los íconos salen de ahí. `node build.mjs` deja los HTML enlazando sus archivos. `node build.mjs --single` mete todo adentro de cada HTML para compartirlo suelto.
- `assets/img/`: las fotos. `credits.html` y `credits.json` tienen los créditos.

## Qué es de ejemplo

- Los nombres de complejos y de jugadores, los precios, los horarios y los partidos.
- Los motivos de cancelación. En el código se usan los reales.
- La nota del blog y el titular de `precios.html` ("Un precio por cancha. Sin comisión.").
- Cuatro fotos son reemplazos con licencia CC0 de Wikimedia Commons. No van a producción. Las demás son fotos de TurnoGol que ya están en `public/`.

Los títulos, botones y avisos se tomaron de las pantallas actuales donde existen.

## Qué se midió

En 390, 768, 1024 y 1440 px, en los dos temas y en cada estado: sin desborde horizontal, objetivos táctiles de 44 px y contraste AA de todo el texto contra el fondo real ya renderizado.

## Qué no tiene

- Animaciones más allá de la entrada del hero, la aparición al bajar y la barra de "Reservar". La dirección de movimiento está en [`2026-11-13-portal-vidrio-direccion.md`](../../2026-11-13-portal-vidrio-direccion.md).
- Estados de carga.
- Pantallas que quedaron afuera: torneos, referidos, reactivar cuenta, la baja de avisos de Rival y el ingreso del complejo.
- El respaldo para navegadores sin `backdrop-filter` está escrito y no se probó.
- En la compu, la barra de "Reservar" de la ficha muestra la cancha sin su tamaño.
