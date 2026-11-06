# Notificaciones del complejo

Implementación y gates: [ledger del esfuerzo](../planning/2026-11-06-notificaciones-confiables.md).

## Despliegue

1. Lazar aplica la nueva migración 107 y su espejo. No desplegar el worker nuevo sobre schema anterior: los sweeps requieren las columnas nuevas, incluso con el flag apagado.
2. Configurar `PUSH_RECEIPT_SECRET` aleatorio, mínimo 32 caracteres, en el runtime web y el worker con el mismo valor. Mantener las mismas claves VAPID en ambos. No rotar VAPID durante este despliegue: invalidaría suscripciones existentes.
3. Desplegar web y worker. Confirmar monitor Sentry `staff-notification-dispatch` (cron cada minuto, margen de dos minutos) y sonda `staff-notifications` en health-ping.
4. Mantener `staff_notifications_v2` global en false. Completar pruebas con override por tenant piloto antes de ampliar. Los emisores legacy quedan activos para el resto.
5. El piloto debe comprobar la PWA instalada y habilitada en iPhone y Android: app abierta, segundo plano, cerrada y pantalla bloqueada. No usar una inyección BroadcastChannel como evidencia de entrega remota.

No está habilitado ningún complejo por este cambio. No se enviaron pruebas a clientes reales.

## Matriz de avisos

| Disparador | Destinatario | Canal v2 | Destino |
|---|---|---|---|
| Reserva online confirmada sin seña, MP, confirmación manual de seña o reconciliación | Staff activo | Push con fallback por persona | Grilla, fecha y reserva |
| Jugador/invitado cancela | Staff activo | Push con fallback por persona | Grilla de esa fecha |
| Agenda diaria desde las 08:00, inclusive vacía | Staff activo | Sólo push | Hoy |
| Primera reserva cambia antes de comenzar la jornada | Staff activo | Sólo push; fusionado con reserva/cancelación si aplica | Hoy o aviso principal |
| Transferencia vencida, pago tardío/duplicado, devolución aún pendiente | Staff habilitado para Caja | Push con fallback por persona | Grilla o Caja |
| Reembolso externo detectado | Sólo dueños | Push con fallback por persona | Caja |
| MP desconectado | Sólo dueños | Push con fallback por persona | Hoy |
| Prueba por vencer/vencida, cobro del plan fallido, suspensión/bloqueo/eliminación próxima | Sólo dueños | Mail y push | Facturación |
| Bienvenida, activación/renovación/cancelación del plan, abandono de alta | Destinatarios actuales | Mail actual | Destino de su template |
| Resumen semanal opt-in | Sólo dueños | Mail | Métricas |
| Resumen de ayer | Legacy únicamente con flag apagado | Push y opt-in histórico de mail; retirado en v2 | Hoy |
| Handoff de WhatsApp existente | Destinatarios existentes | Push existente | Conversación |
| Confirmación/cancelación/reprogramación/vencimiento/devolución al jugador y RIVAL | Destinatarios actuales | Mail actual, fuera de esta migración | Destino de su template |
| Prueba manual de dispositivo | Sólo usuario y suscripción elegidos | Sólo push inmediato | Notificaciones |

## Diagnóstico

En `/notificaciones`, comprobar permiso, instalación y registro de ESTE dispositivo. La prueba devuelve una intención correlacionada: otro aviso recibido mientras tanto no acredita esa prueba. Encolar no acredita llegada.

- `notifications`: intención por evento/persona/canal, horario, expiración y error final. `event_key` evita duplicar el mismo evento.
- `push_send_log`: intentos, lease, aceptación del proveedor, procesado y apertura por dispositivo. Las filas históricas quedan `legacy_unknown`: su antiguo claim no prueba entrega.
- El fallback email se crea una sola vez cuando no hay suscripciones o todas fallan definitivamente. Nunca por falta de recibo, espera de horario silencioso o expiración. Un proveedor que aceptó el push inhibe el fallback.
- El monitor externo detecta que el barrido no corre. Health-ping informa mensajes vigentes atrasados más de cinco minutos y fallos terminales recientes. Logs estructurados incluyen complejo/tipo/intención, sin endpoints ni claves.

La recepción técnica no acredita que el usuario haya visto la pantalla: Focus, permisos del sistema, conectividad y configuración del teléfono pueden silenciar la presentación. El diagnóstico específico del iPhone de el complejo piloto sigue requiriendo acceso de lectura vigente y prueba física.

## Pruebas locales aisladas

No ejecutar integración sobre una base con datos a conservar: `cleanupAll()` usa TRUNCATE CASCADE. Para este esfuerzo se usa el contenedor descartable `codex-turnogol-notifications-test`, puerto 54328 y el archivo ignorado `.env.notifications-test`.

```powershell
$env:TURNOGOL_TEST_ENV_FILE='.env.notifications-test'
$env:npm_config_manage_package_manager_versions='false'
pnpm exec vitest run tests/integration/staff-notifications.test.ts tests/integration/staff-agenda.test.ts
```

El segundo ajuste evita la descarga automática de otra versión de pnpm en este equipo; no cambia scripts ni lockfile. La DB habitual 54322 no recibe la migración nueva desde estas pruebas.
