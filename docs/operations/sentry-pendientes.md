# Pendientes del triage de Sentry

Lo que el triage diario encontró y **no** ameritaba arreglarse en el momento: performance, ruido en los logs, cosas cosméticas, y errores graves que no supo arreglar bien por su cuenta.

Append-only, lo más nuevo abajo. Formato: `AAAA-MM-DD · severidad · qué · dónde · link a Sentry`.

Cuando algo de acá se arregla, se borra la línea en el mismo PR que trae el arreglo. Una lista de pendientes que solo crece deja de leerse.

## 2026-09

- 2026-09-08 · 🟢 · ignorar el pedido de permiso de notificaciones del navegador entra a Sentry con nivel error; es comportamiento esperado de una persona, no una falla · `src/components/admin/PushNotificationManager.tsx:201` · https://turnogol.sentry.io/issues/SENTRY-COQUELICOT-SCHOOL-T
