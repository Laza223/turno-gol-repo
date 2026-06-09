# 🏆 Protocolo de Lanzamiento TurnoGol — Parte 3

## FASE 4: Pulido de Interfaz, Error Handling y UX

---

### Paso 4.1 — Auditoría de Error Boundaries

**Prompt para Claude:**

```
Revisá el manejo de errores de React en la app.

1. Revisá src/app/error.tsx (el Error Boundary global):
   ACTUALMENTE contiene solo:
   ```
   <div>
     <button onClick={reset}>Reintentar</button>
   </div>
   ```
   Esto es INACEPTABLE para producción. Si ocurre un error, el usuario ve
   un div vacío con un botón "Reintentar" sin ningún contexto.

   REQUERIDO — Rediseñá error.tsx para que:
   - Muestre un mensaje amigable: "Algo salió mal"
   - Muestre un subtexto: "Estamos trabajando para solucionarlo"
   - Tenga el botón "Reintentar" con el estilo del design system
   - Tenga un botón "Volver al inicio" que navegue a /
   - Reporte el error a Sentry: Sentry.captureException(error)
   - Use el design system de TurnoGol (colores, tipografía del design-system/MASTER.md)
   - Sea responsive (funcione en mobile)

2. Verificá si existen Error Boundaries específicos por ruta:
   - src/app/(admin)/error.tsx → ¿existe? Si no, creá uno que diga "Error en el panel"
   - src/app/(player)/error.tsx → ¿existe? Si no, creá uno
   - src/app/(public)/error.tsx → ¿existe? Si no, creá uno

3. Verificá src/app/not-found.tsx:
   ACTUALMENTE tiene solo 66 bytes — probablemente está vacío o minimal.
   Rediseñá para mostrar un 404 amigable con:
   - Mensaje: "Página no encontrada"
   - Botón: "Volver al inicio"
   - Estilo consistente con el design system

4. Verificá que los errores de negocio NO llegan al Error Boundary:
   - BusinessError, SlotUnavailableError, PlanLimitError → deben mostrarse como toast/alert, NO como pantalla de error
   - Solo SystemError y errores inesperados deben triggerear el Error Boundary

Reportá: archivos creados/modificados, screenshots del antes y después.
```

**Criterio de aceptación**: Error boundary muestra UI amigable + reporta a Sentry. 404 es amigable.

---

### Paso 4.2 — Auditoría de UI/UX del Dashboard Admin

**Prompt para Claude:**

```
Usando capturas de Playwright a 1280x720 (desktop) y 375x812 (mobile),
analizá las siguientes vistas del admin:

1. DASHBOARD (/dashboard):
   - ¿Muestra métricas clave? (reservas del día, ingresos, próximos turnos)
   - ¿El checklist de onboarding aparece si el tenant está en trial?
   - ¿Contraste de texto suficiente? (WCAG AA mínimo: 4.5:1)
   - ¿Espaciados consistentes? (usa el spacing scale del design system)

2. GRILLA DE RESERVAS (/grilla):
   - ¿Los slots libres se diferencian visualmente de los ocupados?
   - ¿Los colores de status son consistentes? (confirmed=verde, pending=amarillo, etc.)
   - ¿El click en slot libre abre el modal de nueva reserva?
   - ¿El click en slot ocupado muestra detalle de la reserva?
   - ¿Funciona la navegación entre días/semanas?

3. MODAL DE NUEVA RESERVA:
   - ¿El formulario es claro y completo?
   - ¿Los campos pre-cargados se muestran correctamente?
   - ¿El botón de submit tiene loading state?
   - ¿Los errores se muestran inline (no solo en console)?

4. SECCIÓN DE CAJA (/caja):
   - ¿Muestra movimientos del día con tipo (income/expense)?
   - ¿El cierre de caja funciona?

5. CONFIGURACIÓN (/configuracion o /settings):
   - ¿Se pueden editar horarios de apertura?
   - ¿Se pueden editar precios por cancha?
   - ¿Se puede configurar la política de cancelación?

Para cada issue encontrado, clasificá como:
- 🔴 CRÍTICO: funcionalidad rota, datos incorrectos
- 🟡 IMPORTANTE: UX confusa, diseño inconsistente
- 🟢 MENOR: estético, nice-to-have

Corregí los 🔴 y 🟡. Los 🟢 documentalos para post-launch.
```

**Criterio de aceptación**: Cero issues 🔴. Issues 🟡 corregidos.

---

## FASE 5: Simulacro de Producción y Observabilidad

---

### Paso 5.1 — Verificación de Emails y Notificaciones

**Prompt para Claude:**

```
Auditoría del sistema de notificaciones por email.

1. TEMPLATES — Revisá src/modules/notifications/templates/:
   Hay 15 templates implementados:
   - admin-new-booking.ts → notifica al admin cuando llega reserva online
   - booking-canceled.ts → al jugador cuando se cancela su reserva
   - booking-confirmed.ts → al jugador cuando se confirma su reserva
   - booking-reminder.ts → recordatorio 24h/2h antes del turno
   - deposit-expired.ts → al jugador cuando expira el plazo de pago
   - dunning-payment-failed.ts → al admin cuando falla cobro de suscripción
   - subscription-activated.ts → al admin cuando se activa suscripción
   - subscription-blocked.ts → al admin cuando se bloquea por impago
   - subscription-canceled.ts → confirmación de cancelación
   - subscription-renewed.ts → renovación exitosa
   - subscription-suspended.ts → aviso de suspensión
   - tenant-deletion-warning.ts → aviso de eliminación próxima
   - trial-ending.ts → aviso de fin de trial
   - trial-welcome.ts → bienvenida al registrarse

   Para CADA template, verificá:
   - ¿El subject es claro y descriptivo?
   - ¿El HTML se renderiza correctamente? (no tiene tags rotos)
   - ¿Las variables ({{playerName}}, {{courtName}}, etc.) se reemplazan correctamente?
   - ¿Tiene fallback si una variable es undefined?

2. PROVIDER — Revisá src/modules/notifications/email.provider.ts:
   - ¿Usa Resend como provider?
   - ¿El from address es correcto? (ej: noreply@turnogol.com.ar)
   - ¿Maneja errores de Resend gracefully? (retry con backoff)

3. WORKER — Revisá src/shared/jobs/workers/send-email.worker.ts:
   - ¿Resuelve el email del destinatario? (resolveRecipientEmail)
   - ¿Marca notification como 'sent' o 'failed'?
   - ¿Tiene retry configurado en pg-boss?
   - ¿Usa updateNotificationLastError para tracking de intentos?

4. TEST — Revisá tests/unit/notification-templates.test.ts:
   - ¿Cubre todos los 15 templates?
   - ¿Valida que el subject y body se generan sin errores?
   - ¿Valida que variables faltantes no rompen el template?

5. VARIABLES DE ENTORNO para email:
   - RESEND_API_KEY → ¿está en .env.example?
   - FROM_EMAIL → ¿está configurado?

Ejecutá los tests de notificaciones y reportá.
```

**Criterio de aceptación**: 15 templates válidos. Worker funcional. Variables de entorno documentadas.

---

### Paso 5.2 — Auditoría de Sentry y Error Tracking

**Prompt para Claude:**

```
Verificá que Sentry está correctamente configurado.

1. CONFIGS — Revisá los 3 archivos de configuración:
   - sentry.client.config.ts (frontend):
     ✓ DSN de NEXT_PUBLIC_SENTRY_DSN
     ✓ tracesSampleRate: 0.1 (10%)
     ✓ replaysOnErrorSampleRate: 0.5 (graba sesión del 50% de errores)
     ✓ ignoreErrors incluye: AbortError, Network errors, browser extensions
     ✓ beforeSend filtra en dev (retorna null)
     ✓ beforeBreadcrumb filtra ui.click

   - sentry.server.config.ts (backend):
     ✓ DSN de SENTRY_DSN
     ✓ environment: NODE_ENV
     ✓ release: VERCEL_GIT_COMMIT_SHA
     ✓ tracesSampler dinámico:
       - /api/health y /api/status → 0% (nunca)
       - /api/webhooks → 50%
       - /api/bookings → 30%
       - resto → 10%
     ✓ beforeSend filtra en dev

   - sentry.edge.config.ts (middleware):
     Verificá que existe y tiene DSN configurado.

2. NEXT.JS INTEGRATION — Revisá next.config.js:
   ✓ Envuelto con withSentryConfig()
   ✓ org, project, authToken de env vars
   ✓ hideSourceMaps: true (no exponer sourcemaps)
   ✓ tunnelRoute: '/monitoring' (bypass ad-blockers)
   ✓ silent: true, disableLogger: true

3. ERROR BOUNDARIES — Verificá que error.tsx importa y llama:
   import * as Sentry from '@sentry/nextjs'
   Sentry.captureException(error)

4. VARIABLES DE ENTORNO necesarias:
   - NEXT_PUBLIC_SENTRY_DSN
   - SENTRY_DSN
   - SENTRY_ORG
   - SENTRY_PROJECT
   - SENTRY_AUTH_TOKEN
   ¿Están todas en .env.example? ¿Están documentadas?

5. SECURITY HEADERS — Revisá next.config.js:
   ✓ Content-Security-Policy (restrictivo pero funcional)
   ✓ X-Frame-Options: DENY
   ✓ X-Content-Type-Options: nosniff
   ✓ Referrer-Policy: strict-origin-when-cross-origin
   ✓ Permissions-Policy: camera=(), microphone=()

   Verificá que el CSP permite:
   - connect-src: *.supabase.co, *.mercadopago.com (para API calls)
   - frame-src: *.mercadopago.com (para checkout embed)
   - ¿Permite la conexión a Sentry? (*.sentry.io o via tunnel /monitoring)

Reportá: configuración correcta ✅ o issues encontrados con su fix.
```

**Criterio de aceptación**: Sentry captura errores en frontend y backend. Headers de seguridad correctos.

---

### Paso 5.3 — Auditoría de Background Jobs

**Prompt para Claude:**

```
Verificá que todos los workers de pg-boss están correctamente implementados.

WORKERS (src/shared/jobs/workers/):

1. send-email.worker.ts → Envía emails encolados
   - ¿Resuelve destinatario? ¿Renderiza template? ¿Llama a Resend?
   - ¿Marca como sent/failed? ¿Retry configurado?

2. auto-complete-bookings.worker.ts → Auto-completa bookings pasados
   - ¿Usa autoCompleteOverdueBookings() con grace de 30 min?
   - ¿Se ejecuta como cron (cada cuánto)?

3. booking-reminder.worker.ts → Envía recordatorios antes del turno
   - ¿24h y 2h antes? ¿Solo si player_id NOT NULL?

4. expire-trials.worker.ts → Expira trials vencidos
   - ¿Busca tenants con status trialing y trial_ends_at < NOW()?
   - ¿Los transiciona a churned?

5. dunning-retry.worker.ts → Reintenta cobros fallidos
   - ¿Sigue la secuencia: 3 reintentos → past_due → 7 días → suspended?
   - ¿Envía notificaciones de cobro fallido?

6. generate-abonado-slots.worker.ts → Genera slots rolling de abonados
   - ¿Genera 4 semanas adicionales cuando quedan < 4?
   - ¿Respeta closed_dates y conflictos?

7. data-retention-cleanup.worker.ts → Limpieza de datos (GDPR/Ley 25.326)
   - ¿Anonimiza datos de jugadores que lo solicitaron?
   - ¿Purga datos según política de retención?

8. process-mp-webhook.worker.ts → Procesa webhooks de MP
   - ¿Delegación correcta al handler?

REGISTRADOR:
- src/shared/jobs/workers/index.ts → ¿Registra TODOS los workers?
- src/shared/jobs/definitions.ts → ¿Define queues y opciones para cada job?
- src/shared/jobs/run-workers.ts → ¿Entrypoint para `pnpm jobs:start`?

Verificá que `pnpm jobs:start` no crashea al arrancar.
```

**Criterio de aceptación**: 8 workers implementados, registrados, y el entrypoint arranca sin error.

---

### Paso 5.4 — Verificación de Variables de Entorno

**Prompt para Claude:**

```
Auditoría completa de variables de entorno.

1. Leé .env.example y listá TODAS las variables definidas.

2. Para CADA variable, verificá:
   - ¿Está usada en el código? (grep en src/)
   - ¿Es obligatoria o tiene fallback?
   - ¿Está categorizada correctamente? (auth, db, external services, etc.)

3. Variables CRÍTICAS que DEBEN existir en producción:
   - DATABASE_URL (o SUPABASE equiv.)
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY (para jobs/webhooks — NUNCA exponer al frontend)
   - MERCADOPAGO_ACCESS_TOKEN (o por tenant via OAuth)
   - RESEND_API_KEY
   - SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN
   - SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT

4. Variables que NO deben estar en el frontend (NEXT_PUBLIC_):
   - SUPABASE_SERVICE_ROLE_KEY → ❌ NUNCA public
   - DATABASE_URL → ❌ NUNCA public
   - RESEND_API_KEY → ❌ NUNCA public
   - SENTRY_AUTH_TOKEN → ❌ NUNCA public

5. Verificá .gitignore incluye:
   - .env.local
   - .env.production
   - .env*.local

Reportá: variables faltantes, variables mal expuestas, variables sin uso.
```

**Criterio de aceptación**: Todas las vars críticas documentadas. Ningún secret expuesto como NEXT_PUBLIC_.

---

### Paso 5.5 — Checklist Final Pre-Deploy

**Prompt para Claude:**

```
Ejecutá esta checklist final de verificación:

BUILD & TYPES:
□ pnpm typecheck → 0 errores
□ pnpm lint → 0 errores
□ pnpm build → build exitoso sin warnings críticos

TESTS:
□ pnpm test → todos los unit tests pasan
□ pnpm test:isolation → 84/84 tests pasan (BLOQUEANTE)
□ pnpm test:integration → todos pasan

SEGURIDAD:
□ Todas las rutas API tienen middleware de auth/tenant correcto
□ RLS policies cubren las 12 tablas aisladas + tablas especiales
□ SET LOCAL (nunca SET sin LOCAL)
□ Exclusion constraint en bookings previene double-booking
□ Webhooks verifican firma e idempotencia
□ Security headers configurados en next.config.js
□ No hay secrets expuestos como NEXT_PUBLIC_

FUNCIONALIDAD:
□ Flujo de reserva manual (admin) funciona end-to-end
□ Flujo de reserva online (jugador) funciona end-to-end
□ Cancelaciones (4 variantes) funcionan
□ State machine de bookings bloquea transiciones inválidas
□ Billing lifecycle (trial → active → past_due → suspended) funciona

INFRAESTRUCTURA:
□ Sentry configurado (client + server + edge)
□ Error boundary muestra UI amigable (no div vacío)
□ 404 page es amigable
□ Background jobs arrancan sin error
□ Templates de email renderizan correctamente

RESPONSIVE:
□ Las vistas críticas funcionan en 375px sin overflow

Si TODOS los items están ✅, el sistema está listo para deploy.
Si algún item está ❌, reportá cuál y su status de corrección.
```

**Criterio de aceptación**: 100% de items checked. Sistema listo para producción.

---

> **FIN DE PARTE 3 — Protocolo completo.**
>
> Resumen de las 3 partes:
> - **Parte 1**: Fase 0 (pre-vuelo) + Fase 1 (sincronización docs↔código)
> - **Parte 2**: Fase 2 (testing de seguridad) + Fase 3 (E2E con Playwright)
> - **Parte 3**: Fase 4 (UI/UX y error handling) + Fase 5 (producción y observabilidad)
