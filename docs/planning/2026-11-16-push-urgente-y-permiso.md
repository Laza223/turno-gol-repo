# Push que suena y permiso que se entiende

Fecha: 2026-11-16. Estado: propuesta, sin implementar. Pedido del dueño en el chat.

## Qué pidió el dueño

1. Que suene el celular, como aviso urgente, cuando entra o se cancela una reserva.
2. Aviso de la primera reserva del día ("Tu primera reserva es a las X").
3. Sacar el resumen diario: ni push ni mail.
4. Un modal propio que explique para qué sirven los avisos, con un botón "Habilitar notificaciones" que recién ahí abra el permiso del dispositivo. Nunca el permiso del navegador apenas entra la persona.
5. El modal aparece solo la primera vez que el staff llega al panel después del onboarding. Lo mismo para el jugador después de registrarse.
6. Si no los activó, los bloqueó o el dispositivo los perdió: un cartel chico, que no moleste, con un botón que vuelve a abrir el modal.
7. Que el permiso quede para siempre en el dispositivo.

## Cómo funciona de verdad (fuentes oficiales)

**Entrega.** El servidor le manda cada aviso al servicio de push del navegador (Google para Chrome y Samsung Internet, Microsoft para Edge, Apple para Safari) y ese servicio lo lleva al dispositivo. El protocolo es [RFC 8030](https://www.iankduncan.com/projects/rfc-browser/8030). El encabezado `Urgency` vale `very-low`, `low`, `normal` (default) o `high`.

**Android.** Google dice que con prioridad normal, si el teléfono está en reposo (Doze), "la entrega puede demorarse" hasta que salga de ese estado. Con prioridad alta intenta entregar al instante y puede despertar el teléfono. Si un sitio manda prioridad alta y no muestra notificaciones, Google lo baja a normal ([Firebase, prioridad de mensajes](https://firebase.google.com/docs/cloud-messaging/android/message-priority)). Hoy TurnoGol manda todo con `normal` (`src/lib/web-push.ts`, sin `urgency`).

**Sonido.** En Android el sonido, la vibración y si pasa por encima de "No molestar" se configuran en el canal de notificaciones de cada sitio, que maneja el usuario desde Ajustes. La página no los puede elegir por notificación ([Chromium, Notification Channels](https://chromium.googlesource.com/chromium/src/+/66.0.3359.158/chrome/android/java/src/org/chromium/chrome/browser/notifications/channels/README.md); [W3C](https://lists.w3.org/Archives/Public/public-web-notification/2012Sep/0004.html)). Lo que sí se puede pedir por notificación: que quede fija hasta que la toquen (`requireInteraction`), un patrón de vibración (`vibrate`) y que vuelva a sonar si se reemplaza (`renotify`) ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)). Cada navegador y sistema decide cómo lo muestra.

**iPhone.** El push web funciona solo si TurnoGol está agregado a la pantalla de inicio (iOS 16.4 o posterior) y el permiso se pide "en respuesta a una interacción directa", por ejemplo tocar un botón ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). En una pestaña de Safari ni siquiera existe el permiso. Desde iOS 26, todo sitio agregado a inicio abre como app por defecto ([iDownloadBlog](https://www.idownloadblog.com/?p=1042117)). Las notificaciones se comportan como las de cualquier app: pantalla bloqueada, Centro de notificaciones y modos de Concentración. Apple no documenta que un sitio pueda marcar un aviso como "urgente" (Time Sensitive). Si el service worker no muestra una notificación por cada push, Apple anula la suscripción ([WebKit, Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)). Desde iOS 18.4 existe Declarative Web Push: Apple arma la notificación desde el JSON aunque el service worker falle y no aplica esa penalidad. El mismo JSON sirve para los otros navegadores, que lo leen desde el service worker.

**Windows (Edge).** Edge entrega notificaciones con el navegador cerrado desde Edge 85 en Windows 10 20H1 o posterior, sin cambios en el sitio ([Microsoft Edge Blog](https://blogs.windows.com/msedgedev/2020/11/16/improving-notifications-badging-microsoft-edge/)). Necesita que esté prendido "Seguir ejecutando extensiones y aplicaciones en segundo plano" ([3CX](https://www.3cx.com/blog/docs/pwa-push-notifications/), fuente secundaria).

**Samsung.** La gestión de batería de Samsung pone apps a dormir ("Aplicaciones en suspensión" / "en suspensión profunda") y eso demora avisos. No encontré documentación oficial para Samsung Internet en particular; las guías dicen sacar la app de esas listas ([Guiding Tech](https://www.guidingtech.com/fix-delayed-notifications-on-samsung-galaxy-phones/)).

**Cuándo pedir el permiso.** Pedirlo al cargar la página casi siempre termina en rechazo. La recomendación oficial es exactamente lo que pidió el dueño: primero una explicación propia y, solo si la persona dice que sí, el diálogo del navegador ([web.dev](https://web.dev/articles/permissions-best-practices)).

**Después de un "Bloquear".** El navegador respeta el bloqueo y el sitio no puede volver a abrir el diálogo nativo. Lo único que se puede hacer es detectarlo y mostrar cómo desbloquearlo desde los ajustes del sitio ([web.dev](https://web.dev/articles/permissions-best-practices)). Por eso el cartel no puede "volver a pedir el permiso": tiene que abrir el modal con los pasos para desbloquear.

**"Para siempre".** El permiso queda guardado por sitio y por dispositivo hasta que la persona lo saca, con dos excepciones documentadas:

- Chrome, en Android y en computadora, lo quita solo en sitios con muy poca interacción y muchos avisos. A las apps instaladas no se lo quita nunca ([Google, octubre 2025](https://blog.google/chromium/automatic-notification-permission/)).
- Apple anula la suscripción si un push no muestra notificación (ver iPhone).

Conclusión práctica: pedir que instalen TurnoGol como app y volver a sincronizar la suscripción cada vez que se abre el panel (eso ya existe).

## Qué hay hoy (medido)

- Los proveedores aceptaron el 100% de los push de los últimos 10 días (`201`). El servidor no pierde avisos.
- "La primera reserva es a las X" ya está programado (`staff-agenda.ts`: "Hoy empezás a las X", y aviso si cambia), pero vive en el sistema v2, detrás del flag `staff_notifications_v2`, que está apagado. Nadie lo recibe.
- El v2 no se puede prender todavía: falta `PUSH_RECEIPT_SECRET` en Vercel y en Railway.
- En un iPhone que no instaló la app, el cartel de permiso del panel no se muestra (`PushNotificationManager.tsx`: el estado `install_required` no renderiza nada). Las instrucciones solo están en `/notificaciones`. Por eso el iPhone del complejo piloto nunca quedó suscripto.
- Si la persona bloqueó, o cerró el cartel en los últimos 7 días, tampoco se muestra nada.
- El jugador no tiene push: no hay tabla de suscripciones de jugadores ni service worker para él.

## Propuesta

**Servidor**

1. Reservas, cancelaciones y primera reserva del día salen con `Urgency: high` y `requireInteraction` (fijas hasta que las toquen), con un patrón de vibración. El resto, con prioridad normal.
2. Prender el v2 para el complejo piloto (trae la primera reserva del día y los recibos de entrega). Requiere que el dueño cargue `PUSH_RECEIPT_SECRET` en Vercel y en Railway.
3. Sacar el resumen diario: el push, el mail opcional y su ajuste. El resumen semanal por mail queda.
4. Más adelante: pasar el formato del push a Declarative Web Push, para que en iPhone no dependa del service worker.

**Panel (staff)**

5. Modal propio la primera vez que llega al panel después del onboarding. También a las cuentas existentes, una vez, en su próxima visita.
   - Texto: "Activá las notificaciones para enterarte al instante cuando te reservan o te cancelan un turno."
   - Botón "Habilitar notificaciones" → diálogo del dispositivo. "Ahora no" lo cierra.
6. El modal se adapta al dispositivo:
   - iPhone sin instalar: pasos para agregarlo a inicio, y abrirlo desde el ícono.
   - Bloqueado: pasos para desbloquear según el navegador.
   - Normal: el botón.
7. Cartel chico y fijo (sin "Cerrar" de 7 días) mientras ESTE dispositivo no reciba avisos, con el botón "Activar" que abre el modal.
8. **Si este dispositivo ya recibe avisos, no aparece nada**: ni modal ni cartel. "Ya recibe" = permiso concedido en el dispositivo y suscripción registrada en el servidor. Se revisa en cada entrada; si la suscripción se perdió en el camino, se vuelve a registrar sola, sin mostrar nada. Solo si eso falla aparece el cartel.

**Jugador**

9. Decidido el 2026-11-16 (veto levantado): push con recordatorio 24 horas y 2 horas antes del turno. Hace falta infraestructura nueva: tabla de suscripciones de jugador con RLS, migración, emisor del recordatorio y su modal. Mismas reglas que el staff, incluida la 8.

**Lo que no depende de código** (dispositivos del complejo piloto)

- iPhone: agregar a inicio desde Safari, abrir desde el ícono y activar.
- Samsung: sacar Samsung Internet de "Aplicaciones en suspensión".
- Edge en Windows: dejar prendido el segundo plano.
- La tercera persona del equipo: activar en su celular.
