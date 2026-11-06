# Notificaciones del complejo: push preferido y agenda de hoy

Fecha: 2026-11-06. Decisor: Lazar, plan aprobado en el chat.

el complejo piloto informa que no recibe notificaciones en iPhone; el founder sí las recibe en su complejo de prueba. El cliente pide enterarse de cada reserva y conocer la primera reserva de hoy para organizar la apertura. El resumen de ayer no resuelve esa necesidad.

Se adopta el catálogo y contrato del [ledger](../planning/2026-11-06-notificaciones-confiables.md). El mail de reserva se reemplaza por push con backup por persona; no se avisa por intentos pendientes de pago. La agenda de hoy y cambios de primera reserva son sólo push, incluso sin reservas. Se conserva el mail de cuenta/plan y el semanal opt-in. No se agregan canales para jugadores.

El SW mostrará siempre la notificación del sistema. Una pestaña abierta no puede sustituirla por un toast: incumple el requisito userVisibleOnly de Apple. Una respuesta del proveedor acredita aceptación, no que el usuario la vio. Instalación, permiso, registro en servidor y prueba del dispositivo se muestran por separado.

Outbox transaccional sobre notifications y estados recuperables sobre push_send_log. Se descartan: (1) depender sólo de callbacks post-commit, que pierden eventos ante caídas; (2) mandar email y push siempre, que duplica cada aviso; (3) asumir éxito por getSubscription local, que no prueba que exista en servidor. Se agrega estado mínimo de agenda tenant-scoped para distinguir un cambio de horario del avance natural del reloj.

Despliegue aditivo con flag staff_notifications_v2 apagado globalmente. La migración de producción y las pruebas físicas quedan como gates explícitos; no se declara entrega universal con tests simulados.
