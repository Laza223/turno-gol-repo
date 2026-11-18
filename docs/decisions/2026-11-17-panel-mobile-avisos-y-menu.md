# Panel mobile: avisos de iPhone, campana y menú Más

Fecha: 2026-11-17. Decisor: Lazar, en el chat.

1. **Cartel de avisos: solo en Hoy, con X, vuelve a los 7 días.** No sale nunca si el dispositivo ya recibe avisos. El modal sigue apareciendo una vez por dispositivo. Supera el punto 4 de [`2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md`](2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md). Vale también para el portal del jugador (componente compartido).
2. **Menú Más sin Hoy, Grilla ni Caja** (ya están en la barra inferior) y con pie compacto. No se suma "Notificaciones" al Más. Se saca "Ayuda" (WhatsApp o mail) de todo el panel: la ayuda queda en el footer del portal público y en las redes.
3. **Se elimina la campana del header** en todas las pantallas. El acceso a `/notificaciones` es Ajustes → Notificaciones y el cartel o modal de Hoy (el encargado, sin Ajustes, activa desde el cartel). En mobile el header muestra el isotipo en vez del wordmark.

También: en touch no se dibuja barra de scroll.

## Por qué en iPhone hay que instalar TurnoGol

WebKit solo da Web Push a las web apps agregadas al inicio (iOS 16.4 o posterior); en una pestaña no existe la API de permiso, así que no se puede ofrecer "permitir". Vale tanto para Safari como para Chrome en iPhone. Por eso el cartel explica los pasos (Compartir, Agregar a inicio, abrir desde el ícono y tocar Activar) en vez de nombrar solo Safari.
