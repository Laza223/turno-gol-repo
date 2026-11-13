# Portal de vidrio: dirección de diseño y de movimiento

**Fecha:** 2026-11-13. Acompaña a la decisión [`2026-11-13-portal-vidrio.md`](../decisions/2026-11-13-portal-vidrio.md) y al [plan por fases](2026-11-13-portal-vidrio-plan.md). La referencia visual es el [mockup](mockups/2026-11-13-portal-vidrio/README.md).

Este documento dice cómo se tiene que ver y cómo se tiene que mover el portal. Donde el mockup y este documento no coinciden, manda este documento en movimiento y en los detalles de la sección 5, y manda el mockup en todo lo demás (medidas, colores, composición).

## 1. La idea

**Vidrio de noche.** Atrás está la cancha iluminada. Adelante, la app es una lámina de vidrio que responde al dedo.

Tres palabras para decidir cualquier duda: **calmo, preciso, físico**.

- *Calmo:* nada se mueve si nadie tocó nada. Sin bucles, sin brillos que laten.
- *Preciso:* cada movimiento dura lo justo y termina exactamente donde tiene que terminar.
- *Físico:* lo que el dedo empuja tiene peso. Sube, frena y se asienta como un objeto, no como una diapositiva.

## 2. En qué inspirarse y de qué alejarse

**Inspirarse en:**

- **iOS 26 (Liquid Glass).** La barra de pestañas flotante en píldora, las hojas que suben desde abajo con peso y los materiales que dejan ver lo que pasa por detrás.
- **Apple Wallet.** El pase. De ahí sale el ticket de la reserva confirmada: una tarjeta que se imprime, con su corte punteado y su código.
- **Apple Sports.** Oscuro, tipografía grande, números tabulares y cero adorno.
- **Playtomic.** Solo el patrón: la fila de días, la grilla de horas y el botón que sube al elegir. Su look no.
- **Airbnb.** La foto de la tarjeta que se convierte en la portada de la ficha al entrar.
- **La imagen que mandó Lazar el 2026-11-12:** hero oscuro en el celu, vidrio y resplandor verde.

**Alejarse de:**

- El glassmorphism de 2021: neón, arcoíris, manchas de colores flotando.
- Rebotes de dibujito. Un resorte se pasa de largo un 6 % como mucho.
- Parallax que marea, confeti, texto en degradé y partículas.
- Cualquier animación que haga esperar para poder tocar.

## 3. Sistema visual

Los valores salen del mockup. `glass.css` tiene los tokens y la receta. `glass-app.css` tiene las pantallas de la app. No se inventan valores nuevos: si hace falta uno, se deriva de un token.

### 3.1 Tokens principales

| Token | Oscuro | Claro | Uso |
| --- | --- | --- | --- |
| `--bg` | `#020617` | `#f3f6f3` | Fondo de página |
| `--ink` | `#f8fafc` | `#0b1220` | Texto principal |
| `--muted` | `#d5dce6` | `#2c3848` | Texto secundario |
| `--soft` | `#b6c0cf` | `#4d5868` | Texto terciario |
| `--green` | `#34d399` | `#04775b` | Marca, acento |
| `--btn-a` → `--btn-b` | `#43e0a3` → `#10b981` | `#058467` → `#046b52` | Botón principal (degradé vertical) |
| `--on-green` | `#022c22` | `#ffffff` | Texto sobre el botón |
| `--slot-bg`, `--slot-line`, `--slot-ink` | verde al 14 %, borde verde, `#6ee7b7` | `#e4f3ed`, `#a3d3c1`, `#04674f` | Horario libre, etiqueta positiva |
| `--glass-a` → `--glass-b` | blanco 14 % → 5 % | blanco 82 % → 58 % | Relleno del vidrio |
| `--glass-line`, `--glass-hi` | blanco 17 %, blanco 26 % | ver `glass.css` | Borde y brillo interior |
| `--inner`, `--inner-line` | blanco 7 %, blanco 11 % | blanco 74 %, tinta 9 % | Piezas dentro de un vidrio |
| `--warn`, `--bad` | `#fcd34d`, `#fda4af` | `#7c4a03`, `#a3122d` | Aviso y error |

El resto (velos, barra, hoja, ventana, sombras) está en `glass.css` y en las dos primeras líneas de `glass-app.css`.

### 3.2 La receta

```css
background: linear-gradient(180deg, var(--glass-a), var(--glass-b));
border: 1px solid var(--glass-line);
box-shadow: inset 0 1px 0 var(--glass-hi), var(--glass-shadow);
backdrop-filter: blur(26px) saturate(180%);
```

Radios: píldora para botones, chips y barras. 20 a 24 px para piezas internas. 28 a 36 px para tarjetas y hojas.

### 3.3 Dos niveles de vidrio

El desenfoque es caro. No todo lo que parece vidrio tiene que desenfocar.

- **Vidrio real** (con `backdrop-filter`): la barra de abajo, la cabecera en píldora, las hojas, la barra de "Reservar", las tarjetas del hero y la cabecera de la ficha. Son piezas que tienen foto o contenido pasando por detrás.
- **Vidrio pintado** (la misma receta sin `backdrop-filter`): todo lo que se repite en una lista. Tarjetas de complejo, reservas, partidos, planes, preguntas. Detrás tienen el fondo liso con el resplandor, así que no hay nada que desenfocar y a la vista queda igual.

**Presupuesto:** en el celu, tres capas de vidrio real visibles a la vez como máximo. La barra de abajo y la de "Reservar" nunca conviven: una reemplaza a la otra.

### 3.4 Fondo y foto

- Cada página lleva la luz de fondo (`.ambient`): tres resplandores radiales verdes, fijos, muy suaves.
- El hero apila cuatro capas: foto, desenfoque que se apaga hacia abajo (máscara en degradé), velo del color del tema y resplandores. La foto queda nítida abajo, donde están los jugadores.
- En el tema claro la foto es de día. Nunca una foto de noche aclarada.

### 3.5 Tipografía

Archivo en todo. Titulares en 700 con `font-stretch: 104%` y `letter-spacing` de -0,035 a -0,04 em. El cuerpo en 400 a 16 px como mínimo. Etiquetas chicas en 13 px como piso. Horas, precios y contadores con `font-variant-numeric: tabular-nums`. El logo no cambia.

El eje de ancho de Archivo tiene que estar cargado para que el 104 % se vea. Hoy `layout.tsx` carga Inter, Archivo y Sora: al terminar la migración del portal se revisa qué queda en uso.

### 3.6 Color

El verde significa dos cosas: **acción** (el botón principal) y **lugar disponible** (un horario libre, "Hay lugar"). No se usa verde para adornar texto ni bordes sin significado. El resplandor de fondo es la única decoración verde.

## 4. Movimiento

### 4.1 Principios

1. **El movimiento explica.** Muestra de dónde vino algo y a dónde fue. Si no explica nada, no va.
2. **Lo que toca el dedo responde en el mismo cuadro.** El estado apretado aparece al instante. La animación viene después y nunca bloquea el siguiente toque.
3. **Resortes para lo que se arrastra o se elige. Curvas para lo que entra solo.**
4. **Una cosa importante por vez.** Si sube la hoja, el resto se queda quieto.
5. **Corto.** Casi todo dura entre 120 y 320 ms. Solo la hoja, la entrada del hero y la reserva confirmada pasan de 400 ms.
6. **La plata nunca muestra un número que no existe.** Un precio cambia por reemplazo, nunca contando de un valor al otro.
7. **Con "reducir movimiento" todo sigue funcionando.** Lo que se desplazaba pasa a un fundido corto o aparece directo.

### 4.2 Con qué se hace cada cosa

No se instala nada nuevo. Alcanza con lo que ya está.

| Para | Se usa | Por qué |
| --- | --- | --- |
| Estados de toque, entradas, fundidos, píldoras que se deslizan | CSS: `transition`, `@keyframes`, `@starting-style`, `linear()` | Corre fuera del hilo principal y no pesa |
| Aparición al bajar y efectos atados al scroll | CSS: `animation-timeline: view()` y `scroll()`, con `Reveal` (`src/components/site/Reveal.tsx`) como respaldo | Sin JavaScript donde hay soporte |
| Navegar entre pantallas y elementos compartidos (foto de la tarjeta a portada) | `<ViewTransition>` de React 19.3 y `transitionTypes` de `<Link>` | Ya viene con Next 16, sin configurar. Leer `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` antes de usarlo |
| Hojas que se arrastran, piezas que entran y salen de una lista con su alto | `motion` (`motion/react`) con `LazyMotion` | Es lo único que necesita física y gestos de verdad |

Reglas para `motion`:

- Un proveedor propio del portal, hermano de `src/app/onboarding/motion-provider.tsx`, con `MotionConfig reducedMotion="user"`. Nunca dentro de `(admin)`.
- Componentes `m.*` con `LazyMotion strict`. El arrastre y las animaciones de layout piden un paquete de funciones más grande que el del alta: verificar cuál en la documentación de Motion (context7) y cargarlo en diferido, solo donde se monta una hoja.
- Si algo se puede hacer con CSS, se hace con CSS.

### 4.3 Tokens de movimiento

```css
--dur-1: 120ms;  /* toque, color */
--dur-2: 200ms;  /* fundidos, chips */
--dur-3: 320ms;  /* entradas de bloque */
--dur-4: 700ms;  /* entrada del hero */
--ease-out: cubic-bezier(.2, .8, .2, 1);   /* lo que entra */
--ease-in: cubic-bezier(.4, 0, 1, 1);      /* lo que se va */

/* Resortes en CSS. La duración va junto: el resorte ya está medido en el tiempo. */
--spring-hoja: 380ms linear(0, 0.042, 0.134, 0.253, 0.373, 0.49, 0.592, 0.682, 0.756, 0.817, 0.864, 0.902, 0.931, 0.952, 0.968, 0.979, 0.987, 0.993, 0.997, 0.999, 1, 1.001, 1);
--spring-pildora: 440ms linear(0, 0.069, 0.216, 0.385, 0.545, 0.68, 0.787, 0.866, 0.923, 0.96, 0.984, 0.998, 1.005, 1.008, 1.009, 1.008, 1.007, 1.005, 1.004, 1.003, 1.002, 1.001, 1);
--spring-toque: 480ms linear(0, 0.103, 0.313, 0.548, 0.751, 0.897, 0.993, 1.043, 1.062, 1.06, 1.049, 1.034, 1.02, 1.01, 1.002, 0.998, 0.996, 0.996, 0.997, 0.997, 0.998, 0.999, 1);
```

Los mismos resortes en `motion` (masa 1):

| Nombre | Rigidez | Amortiguación | Se pasa de largo | Para |
| --- | --- | --- | --- | --- |
| hoja | 320 | 32 | 0,2 % | Hojas y la barra de "Reservar" |
| píldora | 420 | 34 | 0,9 % | Indicadores que se deslizan |
| toque | 520 | 30 | 6,3 % | Piezas chicas al elegirlas |

Son valores de partida. Se ajustan mirando un celular de verdad, no un monitor.

### 4.4 Piezas

Cada pantalla se arma combinando estas piezas. No se inventan otras sin escribirlas acá.

| Pieza | Qué hace | Cómo | Con movimiento reducido |
| --- | --- | --- | --- |
| **Subir** | Un bloque entra desde 14 px abajo con fundido | `--dur-4`, `--ease-out`, escalonado de 70 ms. Es el `.rise` del mockup | Aparece directo |
| **Aparecer al bajar** | Una sección entra al llegar al viewport | 26 px y fundido, atado al scroll (`view()`, rango `entry 0% entry 34%`). Una sola vez | Aparece directo |
| **Apretar** | Botón o tarjeta responde al dedo | `scale(.985)` en botones y `.96` en piezas chicas, en `--dur-1`. Al soltar vuelve con `--spring-toque` | Solo cambia el color |
| **Píldora** | El indicador activo se desliza de una opción a otra | Un solo elemento que se traslada con `--spring-pildora`. En la barra de abajo, entre pantallas, con `view-transition-name` | Cambia sin deslizar |
| **Hoja** | Sube desde abajo, se arrastra y se suelta | `motion`, resorte hoja. Se cierra si se arrastra más de un tercio de su alto o se suelta con velocidad hacia abajo. El fondo se oscurece en `--dur-2` | Fundido de 150 ms, sin arrastre |
| **Reemplazo** | Un texto o un precio cambia | El viejo sube 60 % y se apaga, el nuevo entra desde abajo. 180 ms. Nunca se cuentan los números | Cambia directo |
| **Escalonado** | Varias piezas iguales entran en orden | 24 a 40 ms entre una y otra, tope de 10. Las demás entran con la décima | Todas juntas |
| **Trazo** | Se dibuja una línea: el tilde, el tachado | `stroke-dashoffset` o `scaleX` desde la izquierda, 320 ms, `--ease-out` | Ya dibujado |
| **Brillo de carga** | El esqueleto mientras llegan los datos | Una banda de luz que cruza la pieza de vidrio cada 1,4 s. Es el único bucle permitido en la app | Pieza quieta, más opaca |
| **Transformación** | Un elemento de una pantalla se convierte en otro de la siguiente | `<ViewTransition name share>`. Solo foto de tarjeta a portada y nombre del complejo | Fundido |
| **Floración** | El resplandor verde crece una vez detrás de algo importante | Opacidad de 0 a 0,5 y baja a su valor de reposo en 900 ms | Resplandor fijo |
| **Reflejo** | Una banda de luz cruza un vidrio una sola vez | Degradé diagonal que se traslada en 900 ms, opacidad máxima 0,18 | No va |

### 4.5 Coreografía por pantalla

Los tiempos son desde que la pantalla ya tiene sus datos.

**Cromo (todas las pantallas)**

- *Barra de abajo.* La píldora activa se desliza de una pestaña a otra (pieza Píldora). El ícono de la pestaña nueva hace un toque de escala de 0,86 a 1. Cuando sube una hoja o la barra de "Reservar", la barra de abajo baja y sale en 200 ms con `--ease-in`, y vuelve al cerrarse.
- *Cabecera en la compu.* Al pasar los 8 px de scroll se condensa una sola vez: baja de 60 a 54 px de alto, suma sombra y sube la opacidad del vidrio. No va atada cuadro a cuadro al scroll.
- *Botón de tema.* El tema nuevo se abre en círculo desde el botón (`document.startViewTransition` con `clip-path` en `::view-transition-new(root)`), en 420 ms. Sin soporte, cambia directo.
- *Navegación.* Fundido cruzado de 200 ms entre pantallas. Entrar a un detalle (ficha, partido, confirmar) entra desde la derecha 24 px. Volver, desde la izquierda. Se marca con `transitionTypes` en los `<Link>`.

**Home**

1. La foto está visible desde el primer cuadro (es el elemento más grande de la pantalla, no se la esconde) y se asienta de escala 1,06 a 1 en 1400 ms.
2. El titular entra por línea: cada línea sube dentro de su renglón, que la recorta. 700 ms, 90 ms entre líneas. El titular no arranca con opacidad cero.
3. Cuando termina "a un toque.", su resplandor verde florece una vez.
4. Subtítulo, buscador y ventana de complejos suben escalonados.
5. A los 900 ms un reflejo cruza la tarjeta del buscador. Una vez por visita.
6. Al bajar, la foto se mueve un 6 % más lento que la página y el velo se cierra (atado al scroll, sin JavaScript).
7. Las secciones aparecen al bajar. En "Reservás en una pantalla", las horas de la ventana entran escalonadas y la hora elegida hace su toque al final. En Rival, las barras de avance crecen.

**Buscador (`/explorar`)**

- Las tarjetas entran escalonadas (hasta 8). Al cambiar un filtro, la lista hace un fundido cruzado de 180 ms: no se vuelve a escalonar.
- Tocar una tarjeta: se aprieta, y su foto se transforma en la portada de la ficha.
- Hoja de cancha: cada tamaño marca su tilde con un toque. El número del botón ("Ver 6 complejos") cambia por reemplazo.
- Mientras carga: tarjetas esqueleto con brillo de carga, con la misma forma que las reales.

**Ficha del complejo**

- La portada se asienta de 1,08 a 1 y la tarjeta del nombre sube.
- *Elegir día:* la píldora del día se llena con un fundido de 150 ms y hace su toque. Las horas viejas se apagan en 90 ms y las nuevas entran escalonadas a 24 ms. Si la disponibilidad tarda más de 150 ms, aparece el esqueleto.
- *Elegir hora:* el cuadrado hace su toque y se llena de verde. En Android, una vibración de 8 ms.
- *Sube la barra de "Reservar":* resorte hoja. En el mismo gesto baja la barra de abajo. Se puede arrastrar hacia abajo para cerrarla.
- *Cambiar de cancha:* el punto del radio hace su toque y el precio del botón cambia por reemplazo.
- *Si el horario se ocupó mientras tanto:* la barra sacude 6 px en horizontal una vez y muestra el aviso. No se cierra sola.

**Confirmar el turno**

- El resumen sube. El bloque de ingreso sube después.
- Al mandar el enlace, el formulario se va y entra "Revisá tu email" por reemplazo, con el sobre haciendo su toque.
- El botón de pagar o reservar, al tocarlo, pasa a "Procesando…" con el brillo de carga dentro del botón.

**Reserva confirmada.** Es el momento de la app. Línea de tiempo en milisegundos:

| Momento | Qué pasa |
| --- | --- |
| 0 | La insignia verde entra con el resorte toque (escala de 0,6 a 1) y su resplandor florece |
| 120 | Se traza el tilde |
| 200 | Sube el título |
| 320 | Sube la bajada |
| 420 | El ticket se imprime: se descubre de arriba hacia abajo en 520 ms y baja 8 px |
| 760 | El código aparece letra por letra, 30 ms cada una |
| 900 | Suben los botones |

En Android, una vibración corta doble al llegar. Sin confeti. "Falta la seña" y "Pago rechazado" usan solo la insignia y el título: no celebran.

**Mis reservas**

- El control Próximos e Historial desliza su píldora. La lista cambia con fundido y escalonado corto.
- Cancelar: hoja. Al confirmar, la tarjeta se cierra sobre su alto en 260 ms y baja desde arriba un aviso de vidrio.

**Ingresar y Cuenta**

- Ingresar usa la foto del hero con la misma entrada, sin el reflejo.
- En Cuenta, las secciones aparecen al bajar. "Guardar cambios" confirma trazando un tilde dentro del botón durante 1,2 s.

**Rival**

- Las barras de avance crecen al entrar en pantalla. Las camisetas se llenan en orden, 40 ms entre una y otra, cada una con su toque.
- "Pedir sumarme": el botón pasa a enviado con el tilde trazado.
- Quien organiza acepta un pedido: la fila se cierra, una camiseta libre pasa a tener nombre con su toque y el contador cambia por reemplazo.
- Armar un partido: los chips eligen con toque. El contador de "¿Cuántos te faltan?" cambia por reemplazo.

**Páginas para complejos**

- "¿Te suena?": al entrar cada fila, el tachado se traza sobre el problema y después aparece la solución. Ya existe en `globals.css` (`.tg-noche-strike`, `.tg-noche-solution`): se reutiliza.
- "Así se ve tu noche": las celdas de la grilla se encienden por fila. La celda "Sin cobrar" late una vez en rojo y queda.
- Planes: la píldora de Mensual y Anual se desliza y los precios cambian por reemplazo.

### 4.6 Accesibilidad

- `prefers-reduced-motion`: se cumple la última columna de la tabla de piezas. Nada queda escondido esperando una animación.
- `prefers-reduced-transparency` y navegadores sin `backdrop-filter`: el vidrio pasa a un relleno casi opaco del color del tema. Se prueba en las dos condiciones.
- `prefers-contrast: more`: bordes más fuertes y vidrio opaco.
- El foco siempre se ve, con el anillo verde de 2 px. Al abrir una hoja el foco entra en ella y al cerrarla vuelve al botón que la abrió.
- El contraste se mide sobre el fondo real ya renderizado, no sobre el color del token. La foto del hero cambia el resultado.

### 4.7 Rendimiento

- Solo se animan `transform` y `opacity`. Nunca el radio del desenfoque, ni sombras grandes, ni anchos y altos (para cerrar una fila se usa `motion` o `grid-template-rows`).
- `will-change` solo mientras dura la animación.
- El elemento más grande de la primera pantalla (la foto o el titular) nunca arranca escondido.
- Lo que `motion` suma al portal no pasa de unos 25 KB comprimidos, y en `(admin)` suma cero. Se mira en la salida de `next build`.
- Objetivos en un celular modesto simulado (CPU 4 veces más lenta): abrir la barra de "Reservar" sin cuadros de más de 50 ms, INP por debajo de 200 ms y LCP de la home por debajo de 2,5 s.

### 4.8 Qué no se hace

- Bucles infinitos fuera del brillo de carga.
- Animar el desenfoque.
- Contar números de plata.
- Entradas que se repiten cada vez que se vuelve a una pantalla ya vista.
- Resortes que se pasan de largo más de un 6 %.
- Movimiento en el panel del complejo.

## 5. Detalles que el mockup no tiene y hay que sumar

1. **Estados de carga.** Esqueletos de vidrio con brillo de carga para la lista de complejos, las horas de la ficha, Mis reservas y el tablón. Con la forma exacta de lo que reemplazan, para que nada salte al llegar.
2. **Grano en el vidrio.** Un ruido muy fino (2 a 3 % de opacidad, un SVG en línea) sobre el vidrio real. Le saca el aspecto de plástico. Con un interruptor para apagarlo si en la medición cuesta.
3. **Brillo que sigue al puntero.** Solo en la compu y solo en la tarjeta del buscador de la home y en las tarjetas de planes: un punto de luz tenue en el borde, donde está el cursor.
4. **Fotos que llegan bien.** Vista previa desenfocada mientras carga y un fundido de 200 ms al llegar, con `next/image`.
5. **Avisos de vidrio.** Los avisos (`toast`) bajan desde arriba con el resorte hoja y usan el vidrio real.
6. **Vibración.** Corta al elegir una hora y doble al confirmar. Solo donde el navegador la soporta, nunca en la compu.
7. **Teclado abierto.** La barra de abajo se esconde mientras hay un campo con foco en el celu.
8. **Áreas seguras.** La barra de abajo, la de "Reservar" y las hojas respetan `env(safe-area-inset-bottom)`.
9. **Color de la barra del navegador.** `theme-color` acompaña al tema: `#020617` en oscuro y `#f3f6f3` en claro.
10. **La barra de "Reservar" en la compu** muestra el tamaño de la cancha junto al nombre.
11. **La barra de abajo se compacta al bajar** y vuelve al subir. Va en la última fase y solo si no molesta en la prueba con un celular.
12. **Nombres largos.** Un complejo con nombre de 40 caracteres no rompe la tarjeta, la ficha ni el ticket.
