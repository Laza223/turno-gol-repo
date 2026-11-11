# Mockup: portal plano (home y buscador), 2026-11-08

Es un mockup para decidir la dirección. No es el rediseño final. No toca el repo, `DESIGN.md` ni producción.

- `index.html` es la home y `explorar.html` el buscador. Toman el tema del celular. `?theme=light|dark` lo fuerza y `?sheet=1` abre el selector de localidad.
- `capturas/`: las capturas (webp), en claro y oscuro, a 390 px y en desktop (1440).
- Los complejos, logos, videos, frases, precios y horarios son **de ejemplo**, y así lo dice el rótulo amarillo. Las fotos salen de `public/` del repo (rutas relativas): se abre directo con el navegador.

## Qué cambia respecto del portal actual (La Previa)

1. **Superficies.** Salen el vidrio, los resplandores, las partículas y el texto en degradé. Quedan fondo liso, tarjetas planas con borde de 1 px y una sola sombra, la de la tarjeta del buscador que monta sobre la foto.
2. **Tipografía.** Una sola familia, Archivo, para todo. Salen Inter y Sora. El titular pasa de negra itálica en degradé a Archivo 800 recta y blanca. El logo sigue como está.
3. **Los dos temas son planos.** El claro tiene fondo blanco y el verde `#04775B`. El oscuro tiene fondo losa nocturna `#020617` y el verde `#10B981`. En los dos, la foto de cancha de noche queda arriba.
4. **Buscador: Localidad y Cancha.** Salen Fecha y Hora, porque la tarjeta del complejo ya muestra los "Libres hoy". La cancha se elige con chips en píldora (Fútbol 5, 6, 7, 8 y 11, de a varios, como `formats` en el back).
5. **Localidad por defecto.** La propuesta es sacarla por IP (headers de Vercel), sin pedir permiso. Para cambiarla hay una hoja con buscador, "Usar mi ubicación exacta" (este sí pide permiso) y las localidades con su cantidad de complejos.
6. **La home crece.** Debajo del hero vuelven secciones que se habían sacado el 20/10: la tira de logos de complejos, "Los dueños lo cuentan" (videos verticales) y la banda verde para complejos ("Tus jugadores reservan solos. Tu noche se ordena sola." → `/para-complejos`).
7. **Tarjeta del complejo.** Es plana, con los formatos en píldora gris y los horarios libres en píldoras verdes suaves de 40 px. El precio se ve si el complejo lo muestra. Sale el borde superior verde y también el efecto de elevarse al pasar el mouse.
8. **Chips y botones en píldora** en todo el portal.
9. **Barra inferior flotante, estilo Liquid Glass de iOS 26** (pedido de Lazar del 2026-11-08). Es una píldora translúcida con desenfoque, despegada del borde, y el ítem activo va resaltado adentro. Las secciones siguen siendo Explorar, Reservas y Cuenta. Es el único vidrio del portal, y no es decoración: lo que se ve detrás es el contenido que pasa por debajo.

## Qué falta decidir o construir si se aprueba

- ~~Una decisión escrita~~: [`2026-11-08-portal-plano-dos-temas.md`](../../../decisions/2026-11-08-portal-plano-dos-temas.md). Después: reescribir `DESIGN.md` y el brief de la home (`.impeccable/surfaces/src-app-home.md`).
- Los logos y los videos reales de los dueños. Sin eso, esas dos secciones no se publican.
- Localidad por IP: `headers()` en la home rompe la ISR (`revalidate = 300`). Hay que resolverlo en el cliente o en el middleware.
- El mapa de `/explorar` no se mockeó: queda detrás del botón "Mapa".
