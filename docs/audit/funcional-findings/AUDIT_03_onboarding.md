# AUDIT 03 — Onboarding (wizard 4 pasos)

Testeado autenticado como **admin sin complejo** `e2e-admin-fresh@turnogol.test` (0 tenants → redirige a `/onboarding`). Login real vía magic link de Inbucket.

## Archivo fuente
- `src/app/onboarding/page.tsx` + componentes de pasos + actions
- `src/app/api/auth/callback/route.ts` (staff con 0 tenants → `/onboarding`)
- `src/modules/auth/auth.service.ts`

## Comportamiento esperado (según el código + doc10)
- Wizard de 4 pasos con barra de progreso. Aha Moment = primera reserva online. Al terminar, marca `onboarding_completed` y va a `/dashboard`.

## Resultado del test (flujo completo, 4 pasos)
- ✅ **Paso 1/4 (25%) — "Tu Complejo"**: Nombre*, Dirección*, Ciudad*, Provincia* (select con las 24 jurisdicciones AR), Teléfono*, Email*. Auto-genera el **slug** en vivo ("turnogol.com.ar/complejo-audit-onboarding"). "Continuar →" → "Creando..." → crea el tenant.
- ✅ **Paso 2/4 (50%) — "Tus Canchas"**: pantalla informativa ("Podés agregar tus canchas desde el panel… Necesitás al menos 1 cancha online para aparecer en búsquedas"). No crea cancha en el wizard. "Continuar →".
- ✅ **Paso 3/4 (75%) — "Horarios"**: tabla por día (Lun–Dom) con Apertura/Cierre/Estado (checkbox "Abierto"), pre-cargada (Lun–Jue cierre 00:00, Vie/Sáb 01:00, Dom 23:00). "Continuar →".
- ✅ **Paso 4/4 (100%) — "¿Cobrás seña?"**: "Conectar MercadoPago" (→ `/api/mp/oauth-start`) o "Terminar sin seña". Elegí "Terminar sin seña" → `/dashboard`.
- ✅ **Tenant creado + trial**: dashboard del nuevo complejo muestra "Período de prueba: 30 días restantes" + "Elegir plan". Progreso 3/7.
- ✅ Consola limpia (solo el ws de Console Ninja). Screenshot del MCP hizo timeout (página ocupada por el loop del ws bloqueado).

## 🔴 HALLAZGO CRÍTICO — Onboarding NO configura PIN → LOCKOUT de Configuración/Equipo (y de la conversión a plan pago)

El wizard tiene 4 pasos (Complejo, Canchas, Horarios, MercadoPago) y **nunca pide configurar un PIN de administrador**. Por lo tanto, **todo tenant que completa onboarding queda sin `staff_pin_hash`**.

Consecuencia (verificada en vivo con el tenant recién creado "Complejo Audit Onboarding"):
- Al ir a `/settings/facturacion` (y cualquier `/settings/*` o `/staff`) aparece el gate **"Zona protegida — Ingresá el PIN"**.
- Como no hay PIN, ingresar cualquier valor devuelve **"PIN no configurado. Configuralo en Ajustes → Seguridad"** — pero Ajustes→Seguridad (`/settings/pin`) está detrás del mismo gate. **Catch-22 / lockout permanente.**
- **Impacto de negocio:** el banner de trial **"Elegir plan"** y "MercadoPago: Configurar" del dashboard apuntan a `/settings/facturacion`, que está bloqueada. **Un complejo nuevo NO puede elegir/pagar un plan ni reconfigurar settings desde la UI** → bloquea la conversión de trial a suscripción paga (monetización) y la gestión posterior (horarios, seña, PIN).

(Ver detalle del mecanismo en `AUDIT_04` §PIN. La inconsistencia adicional: /canchas y /reportes NO están gateadas, pero /staff y /settings SÍ.)

## Severidad
🔴 Crítico. El wizard en sí funciona perfecto ✅, pero al no setear PIN deja a cada tenant nuevo **bloqueado de Configuración/Equipo y de la selección de plan**.

## Datos de prueba creados
- Tenant "Complejo Audit Onboarding" (slug `complejo-audit-onboarding`) asociado a `e2e-admin-fresh`. Re-seedeable con `pnpm e2e:seed` (el seed limpia los tenants de freshAdmin).
