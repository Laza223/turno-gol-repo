# Checklist iPhone — 8 pasos, ~10 minutos

Es el único gate que prueba de verdad lo que arreglamos. Ningún navegador headless levanta un teclado ni hace el zoom de iOS: eso solo pasa en un iPhone real.

**Antes de empezar:** abrí la preview de la rama `feat/mobile-ux-hardening` en tu iPhone. Hacelo en **Chrome**, que es donde encontraste el problema — y de paso demuestra que en iOS Chrome es WebKit igual que Safari.

Si algo falla: número de paso + captura + qué esperabas. Con eso alcanza para reproducir.

---

### 1. El bug que reportaste

Andá a `/explorar` y tocá el campo **"Nombre del complejo…"**. Escribí "demo".

**Mirá:** el texto de la página **no cambia de tamaño** al tocar el campo. El logo del header queda exactamente igual de grande que antes de tocarlo.

**Falla si:** la pantalla "salta" o se agranda. *Este es el bug original — si falla, pará acá y avisame.*

### 2. Deslizar a los costados, en todas las pantallas

Recorré: `/explorar` → un complejo → su disponibilidad → volvé al inicio. En **cada una**, intentá arrastrar la página hacia izquierda y derecha con un dedo.

**Mirá:** la página no se mueve horizontalmente en ninguna. La **tabla de horarios sí** se desliza — eso es correcto y esperado: se mueve la tabla, no la página.

**Falla si:** la página entera se corre y aparece una franja vacía al costado.

### 3. Los tres campos del formulario de reserva

Entrá a reservar un turno. En el formulario, tocá **nombre**, después **teléfono**, después **email**, uno por uno.

**Mirá:** ninguno hace zoom. En teléfono aparece el teclado **numérico**, no el de letras.

**Falla si:** alguno agranda la pantalla, o el de teléfono abre teclado alfabético.

### 4. El teclado no tapa el botón

En ese mismo formulario, con el teclado abierto tras tocar el último campo y **sin cerrarlo**, mirá abajo.

**Mirá:** el botón de confirmar es visible, o llegás a él deslizando **dentro** del formulario.

**Falla si:** el botón queda detrás del teclado y no hay forma de alcanzarlo sin cerrarlo primero.

### 5. La grilla llega hasta el final del día

Entrá como admin y abrí **Grilla**. Deslizá hasta el fondo de la lista de turnos.

**Mirá:** llegás al último turno del día y **lo podés tocar**.

**Falla si:** el scroll frena antes y quedan turnos cortados o que no responden al toque.

### 6. El modal de la grilla

Tocá un turno vacío para que se abra el formulario. Tocá el campo de nombre.

**Mirá:** el formulario entra completo en pantalla y el botón de guardar sigue alcanzable con el teclado abierto.

**Falla si:** el formulario se sale de la pantalla, o el botón queda debajo del teclado.

### 7. Cantina — el caso de uso más "de pie"

Andá a **Caja y Cantina → Cantina**. Cargá 2 productos y cobrá.

**Mirá:** le acertás a todos los botones al primer toque, sin apuntar.

**Falla si:** tenés que apuntar, o tocás el botón de al lado.

### 8. Instalar en el inicio y volver de MercadoPago

En **Safari** (Chrome iOS no puede instalar): Compartir → "Añadir a inicio". Abrí la app **desde el ícono**, no desde el navegador. Hacé una reserva con seña hasta el pago.

**Mirá:** después de pagar volvés **a la app instalada** y ves la confirmación. Nada tapado arriba por la hora/batería ni abajo por la barra de gestos.

**Falla si:** quedás varado en MercadoPago, o volvés a Safari en vez de a la app, o la reserva queda "pendiente" para siempre.

> Este es el punto de mayor riesgo y el único que no pudimos probar de ninguna forma automatizada: en iOS, una app instalada abre los pagos en una vista de navegador embebida y el retorno puede no encontrar el camino de vuelta. Si falla, se desactiva el modo instalado y listo — no bloquea nada más.

---

## Qué ya está verificado y no necesitás probar

Medido con navegador real sobre 16 rutas en 4 anchos de pantalla (360, 375, 390 y 430 px):

- Ningún campo de la app quedó por debajo de 16px — que es el umbral exacto que dispara el zoom de iOS.
- Cero scroll horizontal en las 16 rutas, con y sin modales abiertos.
- Los modales entran completos: el de caja mide 358×658 en una pantalla de 390.
- ~30 botones y links subidos a 44px, el mínimo para acertarle con el pulgar.
