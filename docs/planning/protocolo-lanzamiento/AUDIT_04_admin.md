# AUDIT 04 — Panel de administración

Testeado autenticado como **admin** `e2e-admin@turnogol.test` (tenant `E2E Complejo Demo`, login real vía magic link de Inbucket). Layout `(admin)`: sidebar con nav (Inicio, Grilla, Reservas, Abonados, Canchas*, Caja, Reportes*, Equipo*, Configuración* — los marcados "Requiere PIN"), header con email + "Cerrar sesión".

---

## ⚙️ Incidente de entorno (recuperado): build `.next` corrupto

Al entrar al panel admin por primera vez, **todas las páginas admin perdían la hidratación client-side**: chunks `_next/static/chunks/{main-app.js, app-pages-internals.js, app/error.js, (public)/layout.js, global-error.js}` y `layout.css` devolvían **404** (servidos como `text/html`), y `/icon` `/apple-icon` devolvían **500**. Log del dev server:
```
⨯ Error: ENOENT: no such file or directory, open '...\.next\server\edge-chunks\wasm_77d9...wasm'
```
**Causa:** caché `.next` del dev server corrupta (faltaban chunks + el WASM del runtime Edge del route `/icon`). **NO es bug del código fuente.** Se recuperó **deteniendo el server, borrando `.next` y reiniciando** → todos los chunks 200. Documentado en `AUDIT_06`. (Probable disparador: muchas recompilaciones/navegaciones + interrupciones durante la sesión.)

---

## 🔴 Manifestaciones del leak cross-tenant en el admin (ver AUDIT_01)

El bypass de RLS (rol `postgres`, RLS no forzado) también afecta al panel admin. El admin del tenant `…001` ve canchas de **otros** complejos:
- **Grilla** y **Canchas**: muestran `Handmade Soft Salad` (tenant faker) y `Cancha Seña 1` (tenant `…030`) además de las propias. La DB confirma que el tenant `…001` solo tiene 2 canchas (`Cancha E2E 1` + la `Cancha Audit Test` que creé); las otras 2 son ajenas.
- **Peor aún en Canchas**: cada cancha ajena tiene botones **"Editar"/"Desactivar"** → el admin podría modificar/desactivar canchas de otros complejos (no ejecutado: destructivo + cross-tenant). 🔴
- **NO leakean** (sí filtran por tenant explícito): el listado `/reservas` (mostró solo las 2 reservas del tenant) y `/api/player/data-export`. Inconsistencia de estrategia de aislamiento en el codebase.

---

# Inicio (Dashboard) — `/dashboard`

## Archivo fuente
- `src/app/(admin)/dashboard/page.tsx`, layout `src/app/(admin)/layout.tsx`, `src/components/layout/admin-*`

## Comportamiento esperado
- Progreso de configuración (checklist de onboarding), métricas del día (turnos, revenue, abonados), accesos rápidos.

## Resultado del test
- ✅ Renderiza: "Progreso de configuración 5/7 (71%)" con ítems (Cuenta creada, Datos completados, cancha, horarios, MercadoPago→"Configurar"→`/settings/facturacion`, Link público→"Copiar link", Primera reserva online). Sección "Hoy": Turnos hoy 0, Revenue $0, Abonados activos 0.
- ✅ Sidebar nav completa con badges "Requiere PIN".
- ⚠️ (Tras recuperar el build) hidrata OK. Antes: 404 de chunks (ver incidente arriba).

## Screenshots
`screenshots/10-admin-dashboard.png`

## Severidad
🟢 Funcional (post-recuperación del build).

---

# Grilla — `/grilla`

## Archivo fuente
- `src/app/(admin)/grilla/page.tsx` + componentes de grilla/realtime; API `src/app/api/bookings`

## Comportamiento esperado
- Grilla de canchas × horas del día; click en slot libre → dialog "Nueva reserva"; realtime Supabase para updates en vivo; navegación de días; push notifications.

## Resultado del test
- ✅ Renderiza grilla (columnas por cancha, filas por hora 08–22), navegación ← Anterior / Hoy / Siguiente →.
- ✅ **Crear reserva manual**: click en "Reservar turno 20:00" (Cancha E2E 1) → dialog **"Nueva reserva"** (Duración 60/120, Nombre invitado opcional, Teléfono requerido-si-nombre, Notas internas, Cancelar/Confirmar). "Confirmar" → reserva creada, la celda pasa a ocupada (20:00–21:00). Verificado.
- 🟡 **Realtime caído en dev**: banner **"Sin conexión. Los datos pueden no estar actualizados."** El WebSocket de Supabase Realtime (`ws://127.0.0.1:54331/realtime/v1/websocket`) es **bloqueado por CSP** (`connect-src 'self' *.supabase.co *.mercadopago.com` — no incluye Supabase local). En prod (`*.supabase.co`) debería conectar. La app degrada con **polling** a `/api/bookings?date=...` (se observaron ~7 GETs seguidos tras una acción — algo redundante).
- 🔴 Leak cross-tenant (columnas de canchas ajenas).
- 🟡 404 de `/sounds/notification.mp3` (preload del sonido de notificación push — archivo inexistente; ver AUDIT_06).
- ⚠️ Screenshot del MCP hace **timeout** en esta vista (página ocupada por el loop de reintento del WS bloqueado).
- 🟢 Prompt "¿Habilitar notificaciones?" (Web Push) presente.

## Severidad
🔴 leak. 🟡 realtime/CSP (dev) + sonido 404. Funcionalidad core (crear reserva) ✅.

---

# Reservas (listado) — `/reservas`

## Archivo fuente
- `src/app/(admin)/reservas/page.tsx` + `actions.ts`

## Comportamiento esperado
- Tabla de reservas con filtros por estado (Todas/Confirmadas/Pago pendiente/Completadas/Ausentes); click → detalle.

## Resultado del test
- ✅ Tabs de filtro (links con `?status=`), tabla FECHA|CANCHA|CLIENTE|ESTADO|PRECIO.
- ✅ Muestra las 2 reservas del tenant (player cancelada + walk-in confirmada). **Tenant-scopeado correctamente** (no aparece la reserva ajena de Jaskolski).
- ✅ Filas linkean a `/reservas/[id]`.

## Severidad
🟢 Funciona y respeta el aislamiento (filtro explícito por tenant).

---

# Detalle de reserva — `/reservas/[id]`

## Archivo fuente
- `src/app/(admin)/reservas/[id]/page.tsx`, `src/app/(admin)/reservas/actions.ts`, `src/modules/bookings/booking.service.ts`

## Comportamiento esperado
- Detalle (fecha, cancha, cliente, teléfono, estado, precio, seña, método de pago) + acciones "Marcar completada", "Marcar ausente", "Cancelar".

## Resultado del test
- ✅ Renderiza todos los campos. Acciones presentes.
- 🟡 **"Marcar completada" sobre una reserva cuyo turno aún no terminó → CRASHEA la página.** El service rechaza correctamente (`booking.service.ts:306`: `Booking ... cannot be completed: time_end has not yet passed`), PERO el server action (`reservas/actions.ts:138 completeBookingAction`) **no captura el error de dominio** → propaga **500** → el error boundary reemplaza toda la vista con *"No pudimos cargar las reservas — Ocurrió un error al obtener las reservas… Código de referencia: …"* (mensaje engañoso; no fue un error de "obtener" sino de completar). Debería mostrar un toast/inline. La reserva queda intacta. Probablemente "Marcar ausente" comparte el patrón.
- 🟢 "3 De Junio" mal capitalizado (formateador compartido con `text-transform: capitalize`; aparece en varias vistas).

## Severidad
🟡 Manejo de error de dominio rompe la página (UX). La validación en sí es correcta.

---

# Canchas — `/canchas` (Requiere PIN)

## Archivo fuente
- `src/app/(admin)/canchas/page.tsx` + `components/{CourtList,CourtForm}.tsx` + `actions.ts`

## Comportamiento esperado
- Lista de canchas (Editar/Desactivar), "+ Nueva cancha" → form (Nombre, Superficie, Capacidad, Precios por franja horaria con días/horas/precios 60-120min). Crear/editar/desactivar.

## Resultado del test
- 🟡 **Gate "Requiere PIN" NO se activó**: navegué directo a `/canchas` y cargó sin pedir PIN. Probablemente el tenant seedeado no tiene PIN configurado → el gate se omite. La etiqueta "Requiere PIN" es engañosa si no exige PIN. (A verificar configurando un PIN en `/settings/pin`.)
- ✅ **Crear cancha**: "+ Nueva cancha" → form lazy-loaded completo (superficie sintético/natural/cemento/indoor; capacidad 5/7/8/9/11; multi-franja de precios con toggles de días L–D, Desde/Hasta, 60/120 min ARS, Agregar/Eliminar franja). Completé Nombre + defaults → "Crear cancha" → `POST /canchas 200`, aparece en la lista. **Persistido en DB**.
- 🟡 **Bug de capacidad**: `CourtForm.tsx:64` inicializa `capacity` en **10**, pero `CAPACITY_OPTIONS=[5,7,8,9,11]` **no incluye 10** → el `<select>` muestra "5 jugadores" (1ra opción) mientras el state es 10. La cancha creada quedó con **capacity=5 en DB** pero la lista la muestra como "**10 jugadores**" (inconsistencia UI↔DB). Relacionado con el "Fútbol 10" del perfil público.
- 🔴 Leak cross-tenant: lista 4 canchas (2 ajenas con Editar/Desactivar).
- ℹ️ Dato de prueba creado: cancha "Cancha Audit Test" en el tenant demo (re-seedeable con `pnpm e2e:seed`).

## Severidad
🔴 leak + edición de canchas ajenas. 🟡 PIN gate no exigido + bug de capacidad. CRUD core ✅.

---

# Abonados — `/abonados` y `/abonados/nuevo`

## Resultado del test
- ✅ `/abonados`: empty-state "Sin abonados registrados" + "+ Nuevo Abonado" (×2) → `/abonados/nuevo`.
- ✅ `/abonados/nuevo`: form completo (Cancha, Día de la semana, Hora inicio/fin, Nombre contacto*, Teléfono*, Precio por turno, Precio mensual, Desde, Método de pago Efectivo/Transferencia, Notas, **"Vista previa de slots"**). No creé un abonado (form complejo; verificado que renderiza).
- 🔴 El `<select>` "Cancha" **leakea las 4 canchas** (incluidas 2 ajenas) — mismo bug RLS.

## Severidad
🔴 leak en el selector de canchas. Form ✅ renderiza.

---

# Caja — `/caja`

## Archivo fuente
- `src/app/(admin)/caja/page.tsx`; API `src/app/api/cash-flows/**`

## Resultado del test
- ✅ Renderiza: navegación por día, totales (Ingresos/Ajustes/Balance), "Movimientos del día" (empty-state), "+ Agregar movimiento", "Cerrar caja".
- ✅ **Agregar movimiento**: dialog (Tipo Ingreso/Ajuste, Categoría Reserva/Otro, Método Efectivo/Transferencia/MercadoPago/Otro, Monto, Descripción). Cargué Monto 5000 + descripción → `POST /caja 200`, aparece en la tabla, Total ingresos $5.000,00, "Desglose por método". Verificado.
- 🟡 **i18n: enums crudos en inglés** en la tabla de movimientos: TIPO **"Income"**, CATEGORÍA **"booking"**, MÉTODO **"Cash"** (en "Desglose por método" también "Cash") — en vez de las etiquetas español que usa el form (Ingreso/Reserva/Efectivo). Falta mapear los valores de ENUM a labels.
- ⏸️ "Cerrar caja" no testeado a fondo (cambia estado del día).
- ℹ️ Dato de prueba creado: movimiento de caja $5.000 (re-seedeable).

## Severidad
🟡 i18n (enums en inglés). Core (agregar movimiento) ✅.

---

# Reportes — `/reportes` ("Requiere PIN" — pero NO lo exige)

## Archivo fuente
- `src/app/(admin)/reportes/page.tsx`; API `src/app/api/reports/revenue/route.ts`

## Resultado del test
- 🟡 **Cargó sin pedir PIN** (gate no enforced; ver §PIN abajo).
- ✅ Renderiza: navegación por mes, tarjetas (Ingresos/Ajustes/Balance/Reservas), "Por cancha", "Por método de pago", "Exportar CSV" → `/api/reports/revenue?...&format=csv`.
- 🔴 **Leak financiero cross-tenant**: "Por cancha" muestra **"Handmade Soft Salad" $5.000 / 1 reserva** (court del tenant faker) e Ingresos totales **$10.000** (mi $5.000 + $5.000 ajeno). El admin ve **revenue de otro complejo**. Grave.
- 🟢 "Junio **De** 2026" mal capitalizado.

## Severidad
🔴 leak de datos financieros cross-tenant + 🟡 PIN no exigido.

---

# 🔴 PIN de zonas sensibles — enforcement inconsistente + LOCKOUT

## Mecanismo (código)
- PIN guardado como `tenants.settings->>'staff_pin_hash'` (scrypt). Cookie de sesión PIN `tg_pin_session` (TTL 30 min).
- `src/shared/middleware/with-pin.ts` protege **API routes**: sin cookie/header → 403; sin hash → 403 `PIN_NOT_CONFIGURED`.
- Gate de UI: `src/components/pin-gate.tsx`.

## Hallazgos
1. 🔴 **Enforcement inconsistente entre páginas**: con el mismo usuario y sin PIN ingresado:
   - **`/staff` y `/settings` (+ sub-páginas) SÍ** muestran el gate "Zona protegida — Ingresá el PIN".
   - **`/canchas` y `/reportes` NO** lo muestran: cargan el contenido directo (pese al badge "Requiere PIN").
   - Además, la **creación de cancha** (`POST /canchas`, server action) funcionó **sin PIN** → las mutaciones sensibles de /canchas no están protegidas. Zonas sensibles reales (gestión de canchas, reportes financieros) quedan **desprotegidas**.
2. 🔴 **LOCKOUT (catch-22)**: el tenant demo tiene `onboarding_completed=true` pero **sin `staff_pin_hash`**. Al entrar a `/settings/pin` (donde se configura el PIN) aparece el gate; al ingresar cualquier PIN devuelve **"PIN no configurado. Configuralo en Ajustes → Seguridad"** — pero Ajustes→Seguridad ES `/settings/pin`, que está detrás del mismo gate. **El admin queda permanentemente bloqueado** de /staff y /settings, y el mensaje lo deriva a un lugar inaccesible.
   - *A confirmar:* si el wizard de onboarding **obliga** a setear un PIN, este estado no sería alcanzable en prod (sería artefacto del seed). Si el PIN es opcional en onboarding, es un lockout real. Ver `AUDIT_03`.

## Severidad
🔴 (desprotección de zonas sensibles + lockout potencial).

---

# Equipo — `/staff` y Configuración — `/settings/{facturacion,horarios,pin,reservas}` (Requiere PIN)

## Estado
⏸️ **No testeado — bloqueado por el gate de PIN (lockout, ver arriba).** El tenant seedeado no tiene `staff_pin_hash`, por lo que no se puede pasar el gate. Intenté configurar un PIN de prueba directo en DB pero la acción fue bloqueada por política de seguridad (modificación de estado compartido). Se documenta el comportamiento esperado desde el código:

- **`/staff` (Equipo):** lista del equipo/staff. v1 usa un único rol admin con PIN (CLAUDE.md), por lo que probablemente liste al admin y permita gestionar accesos. *Sin verificar.*
- **`/settings/reservas`:** configuración de reservas — `deposit_mode` (on/off + %), política de cancelación (horas antes), días de anticipación, duraciones (60/120). Server Action que actualiza `tenants.settings`. *Sin verificar.*
- **`/settings/horarios`:** `opening_hours` por día (open/close/closed) + fechas cerradas. *Sin verificar.*
- **`/settings/facturacion`:** conexión OAuth de MercadoPago (cobro de señas) + suscripción SaaS/plan (`/api/billing/**`). *Sin verificar.*
- **`/settings/pin`:** alta/cambio del PIN de administrador (`hashPin` → `tenants.settings.staff_pin_hash`). *Sin verificar (paradójicamente inaccesible sin PIN previo).*

## Severidad
⏸️ No verificable por el lockout. El lockout en sí es 🔴 (ver §PIN).
