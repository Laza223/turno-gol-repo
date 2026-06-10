# Inventario de Vistas — TurnoGol
> Testeo de front: estados, funciones, flujos y edge cases.
> **Total: 36 vistas** · Fecha: 2026-06-07

---

## Leyenda de prioridad

| Prioridad | Criterio |
|-----------|----------|
| 🔴 **P0 — Crítico** | Genera dinero, bloquea acceso o corrompe datos. Falla = producto roto. |
| 🟠 **P1 — Alto** | Flujo principal de uso diario. Falla = experiencia degradada severa. |
| 🟡 **P2 — Medio** | Funcionalidad importante pero no bloquea el negocio inmediatamente. |
| 🟢 **P3 — Bajo** | Contenido estático, rutas de salida rara o páginas informacionales. |

---

## 🔴 P0 — Crítico (8 vistas)

### 1. Grilla de canchas
- **URL:** `/grilla`
- **Archivo:** `src/app/(admin)/grilla/page.tsx`
- **Por qué P0:** Es la herramienta de trabajo diaria del admin. Sin ella no pueden operar.
- **Qué testear:**
  - [ ] Renderiza correctamente los slots por cancha y hora
  - [ ] Slots ocupados vs disponibles se distinguen visualmente
  - [ ] Crear reserva desde un slot vacío (modal/drawer)
  - [ ] Reserva creada aparece en la grilla sin recargar (Realtime Supabase)
  - [ ] Navegar entre fechas (botones anterior/siguiente)
  - [ ] Slot bloqueado por horario cerrado no es clickeable
  - [ ] Estado vacío si no hay canchas configuradas
  - [ ] Comportamiento con muchas reservas simultáneas (>10 en una hora)
  - [ ] Responsive en tablet/mobile

---

### 2. Confirmación de reserva (checkout jugador)
- **URL:** `/{slug}/reservar?court=...&date=...&time=...&dur=...`
- **Archivo:** `src/app/(public)/[slug]/reservar/page.tsx`
- **Por qué P0:** Es el momento del pago. Errores aquí = pérdida de conversión o cobro incorrecto.
- **Qué testear:**
  - [ ] Muestra resumen correcto: cancha, fecha, hora, duración, precio
  - [ ] Cálculo de seña: `precio × depositPct / 100` es correcto
  - [ ] LoginGate aparece si el jugador no está autenticado
  - [ ] Botón "Confirmar y pagar" redirige a checkout MercadoPago
  - [ ] Error `slot_taken` (slot tomado entre que vio y confirmó) → mensaje claro + botón volver
  - [ ] Error `banned` (jugador baneado en ese complejo) → mensaje informativo
  - [ ] URL con parámetros inválidos (court inexistente, fecha pasada, duración inválida) → 404 o error
  - [ ] Seña desactivada: botón dice "Reservar gratis" o similar, no muestra monto
  - [ ] Duración de 60 vs 120 minutos se refleja en precio

---

### 3. Reserva exitosa (post-pago)
- **URL:** `/reserva/[bookingId]/exito`
- **Archivo:** `src/app/reserva/[bookingId]/exito/page.tsx`
- **Por qué P0:** Estado final del flujo de pago. Errores aquí = jugador no sabe si pagó o no.
- **Qué testear:**
  - [ ] Si status es `confirmed`: muestra resumen completo de la reserva
  - [ ] Si status aún es `pending_payment`: renderiza `PaymentStatusWatcher` (polling)
  - [ ] `PaymentStatusWatcher` hace polling y actualiza la UI cuando el webhook llega
  - [ ] Si booking no existe o no pertenece al jugador → 404
  - [ ] Botón "Volver a mis reservas" funciona
  - [ ] Datos mostrados: cancha, complejo, fecha/hora, monto pagado

---

### 4. Reserva pendiente (ventana de 15 min)
- **URL:** `/reserva/[bookingId]/pendiente`
- **Archivo:** `src/app/reserva/[bookingId]/pendiente/page.tsx`
- **Por qué P0:** Ventana crítica donde el jugador espera confirmación de pago.
- **Qué testear:**
  - [ ] Muestra estado de espera con feedback visual (spinner/progress)
  - [ ] `PaymentStatusWatcher` inicia polling automáticamente
  - [ ] Cuando el estado cambia a `confirmed`, redirige a `/reserva/[id]/exito`
  - [ ] Cuando el estado cambia a `canceled_*`, redirige a `/reserva/[id]/error`
  - [ ] Manejo si booking no pertenece al player actual
  - [ ] Qué muestra si el polling supera los 15 minutos sin respuesta

---

### 5. Reserva con error de pago
- **URL:** `/reserva/[bookingId]/error`
- **Archivo:** `src/app/reserva/[bookingId]/error/page.tsx`
- **Por qué P0:** Comunicar fallo de pago claramente evita soporte innecesario.
- **Qué testear:**
  - [ ] Muestra mensaje de error claro (no técnico)
  - [ ] Si la ventana de reserva sigue activa: botón "Reintentar" visible y funcional
  - [ ] Si la ventana expiró: botón "Reintentar" oculto, solo opción de volver
  - [ ] Reintentar redirige al checkout de MP con el mismo booking
  - [ ] Booking inexistente o de otro player → 404

---

### 6. Login (magic link)
- **URL:** `/login`
- **Archivo:** `src/app/(auth)/login/page.tsx`
- **Por qué P0:** Sin login no existe ningún flujo autenticado.
- **Qué testear:**
  - [ ] Submit con email válido → transición a estado "enviado" (SentState)
  - [ ] Submit con email inválido → error de validación HTML5 y/o server
  - [ ] Estado de loading durante el envío (`useFormStatus`)
  - [ ] Botón deshabilitado mientras carga
  - [ ] Estado "enviado" muestra instrucción clara de revisar email
  - [ ] Opción de reenviar link desde SentState
  - [ ] Redirect si ya está autenticado (no mostrar login a usuarios logueados)
  - [ ] Responsive (dos columnas → una columna en mobile)

---

### 7. Verificación de magic link
- **URL:** `/verify`
- **Archivo:** `src/app/(auth)/verify/page.tsx`
- **Por qué P0:** Es donde el login se completa. Falla = usuario no puede entrar.
- **Qué testear:**
  - [ ] Con token válido: spinner de carga y luego redirect al destino
  - [ ] Error `expired`: mensaje "el link expiró" + botón para solicitar uno nuevo
  - [ ] Error `used`: mensaje "link ya utilizado"
  - [ ] Error `invalid`: mensaje genérico
  - [ ] Error `exchange_failed`: mensaje de error técnico y fallback
  - [ ] Sin token en URL: comportamiento defensivo

---

### 8. Caja diaria
- **URL:** `/caja`
- **Archivo:** `src/app/(admin)/caja/page.tsx`
- **Por qué P0:** Gestión financiera diaria. Datos incorrectos = pérdida de confianza del admin.
- **Qué testear:**
  - [ ] Carga correctamente el resumen del día (total, por método de pago)
  - [ ] Navegación entre fechas (anterior/siguiente) recarga datos
  - [ ] Desglose: efectivo, MercadoPago, transferencia — sumas son correctas
  - [ ] Tabla de movimientos muestra entradas y salidas
  - [ ] Botón "Cerrar caja" (CajaActions): estado antes de cerrar vs después
  - [ ] Caja ya cerrada: botón deshabilitado o cambia a "Ver cierre"
  - [ ] Estado vacío: día sin movimientos muestra $0 y tabla vacía (no error)
  - [ ] Montos en centavos se muestran en ARS con 2 decimales

---

## 🟠 P1 — Alto (12 vistas)

### 9. Onboarding (wizard 4 pasos)
- **URL:** `/onboarding`
- **Archivo:** `src/app/onboarding/page.tsx`
- **Qué testear:**
  - [ ] Paso 1 (Identidad): nombre del complejo, dirección, teléfono → validaciones
  - [ ] Paso 2 (Canchas): agregar al menos 1 cancha, tipo de superficie, precio
  - [ ] Paso 3 (Horarios): configurar días/horarios de apertura
  - [ ] Paso 4 (Pagos): conectar MercadoPago (opcional) o saltar
  - [ ] Barra de progreso refleja el paso actual
  - [ ] Navegar hacia atrás no pierde datos del paso anterior
  - [ ] Si onboarding ya completado → redirect a `/dashboard`
  - [ ] Si no autenticado → redirect a `/login`
  - [ ] Al completar → redirect a `/dashboard` con checklist

---

### 10. Dashboard del admin
- **URL:** `/dashboard`
- **Archivo:** `src/app/(admin)/dashboard/page.tsx`
- **Qué testear:**
  - [ ] KPIs del día (reservas, ingresos, abonados activos) se cargan
  - [ ] Checklist de onboarding aparece si no está completado
  - [ ] Todos los ítems del checklist se marcan correctamente
  - [ ] Si onboarding_completed y public_link_shared: checklist no aparece
  - [ ] Clic en KPI navega a la sección correspondiente
  - [ ] Estado vacío (complejo nuevo, sin reservas hoy)

---

### 11. Detalle de reserva
- **URL:** `/reservas/[id]`
- **Archivo:** `src/app/(admin)/reservas/[id]/page.tsx`
- **Qué testear:**
  - [ ] Muestra todos los datos: jugador, cancha, fecha/hora, monto, estado
  - [ ] `BookingActions`: botones disponibles según estado de la reserva
  - [ ] Acción "Confirmar" (reserva manual pendiente) → cambia estado
  - [ ] Acción "Cancelar con reembolso" → dialog de confirmación → actualiza
  - [ ] Acción "No-show" → aplica penalidad si configurada
  - [ ] Reserva ya cancelada: acciones no disponibles
  - [ ] Motivo de cancelación y nota del jugador se muestran si existen
  - [ ] Booking de otro tenant → 404

---

### 12. Perfil público del complejo
- **URL:** `/{slug}`
- **Archivo:** `src/app/(public)/[slug]/page.tsx`
- **Qué testear:**
  - [ ] Datos del complejo: nombre, dirección, teléfono, fotos
  - [ ] Lista de canchas con disponibilidad resumida
  - [ ] `AvailabilityGrid` carga en Suspense (skeleton mientras carga)
  - [ ] Reviews: promedio, cantidad, listado con paginación
  - [ ] Botón "Reservar" en cada cancha lleva a disponibilidad
  - [ ] Complejo `suspended`/`blocked`/`canceled` → página UNAVAILABLE
  - [ ] Slug inexistente → 404
  - [ ] SEO: `<title>`, `<meta description>`, structured data LocalBusiness

---

### 13. Disponibilidad semanal
- **URL:** `/{slug}/disponibilidad`
- **Archivo:** `src/app/(public)/[slug]/disponibilidad/page.tsx`
- **Qué testear:**
  - [ ] Grilla semanal con slots disponibles/ocupados
  - [ ] Slot disponible clickeable → lleva a `/[slug]/reservar?...`
  - [ ] Slot ocupado no es clickeable (o muestra "no disponible")
  - [ ] Navegar semana anterior/siguiente
  - [ ] Slots fuera de horario de apertura no aparecen
  - [ ] Fechas cerradas (holidays) están bloqueadas

---

### 14. Mis reservas (jugador)
- **URL:** `/mis-reservas`
- **Archivo:** `src/app/(player)/mis-reservas/page.tsx`
- **Qué testear:**
  - [ ] Tab "Próximas": muestra reservas futuras confirmadas
  - [ ] Tab "Historial": muestra reservas pasadas y canceladas
  - [ ] Cambiar entre tabs no recarga la página completa
  - [ ] `CancelBookingButton`: disponible solo si la reserva permite cancelación (horario)
  - [ ] Cancelar → dialog de confirmación → reserva aparece como cancelada en la lista
  - [ ] `LeaveReviewButton`: disponible solo en reservas pasadas sin review
  - [ ] Estado vacío (sin reservas) muestra CTA para explorar complejos
  - [ ] Badge de estado (confirmada, pendiente, cancelada) es correcto

---

### 15. Configuración: Políticas de reserva
- **URL:** `/settings/reservas`
- **Archivo:** `src/app/(admin)/settings/reservas/page.tsx`
- **Qué testear:**
  - [ ] Toggle "Requiere seña" activa/desactiva el campo de porcentaje
  - [ ] Campo porcentaje: solo acepta valores entre 1 y 100
  - [ ] Cancelación anticipada: horas mínimas antes (número entero positivo)
  - [ ] Penalidad por no-show: tipo (ban, balance) + threshold + días de ban
  - [ ] Guardar cambios → feedback visual (toast/mensaje)
  - [ ] Recargar la página → configuración persistida correctamente
  - [ ] PinGate bloquea acceso si hay PIN configurado
  - [ ] Validación: no se puede guardar porcentaje vacío si seña activa

---

### 16. Configuración: Horarios
- **URL:** `/settings/horarios`
- **Archivo:** `src/app/(admin)/settings/horarios/page.tsx`
- **Qué testear:**
  - [ ] Grid de 7 días: cada día tiene hora de apertura y cierre
  - [ ] Toggle "cerrado" por día desactiva los inputs de hora
  - [ ] Guardar horarios → feedback + persistencia
  - [ ] Agregar fecha cerrada: date picker → aparece en lista
  - [ ] Eliminar fecha cerrada → desaparece de lista
  - [ ] PinGate bloquea si hay PIN
  - [ ] Hora cierre anterior a hora apertura → error de validación
  - [ ] Fechas cerradas en el pasado: se muestran o se filtran

---

### 17. Configuración: Facturación (SaaS + MP)
- **URL:** `/settings/facturacion`
- **Archivo:** `src/app/(admin)/settings/facturacion/page.tsx`
- **Qué testear:**
  - [ ] Muestra plan actual, estado y próxima fecha de cobro
  - [ ] Estado `trialing`: muestra días restantes y CTA para activar
  - [ ] Estado `past_due`: alerta visible con CTA para pagar
  - [ ] Estado `suspended`: banner prominente
  - [ ] Botón "Conectar MercadoPago": inicia flujo OAuth
  - [ ] MercadoPago ya conectado: muestra cuenta vinculada + opción desconectar
  - [ ] PinGate bloquea acceso
  - [ ] Error al cargar estado de suscripción: manejo graceful (try-catch)

---

### 18. Nuevo abonado
- **URL:** `/abonados/nuevo`
- **Archivo:** `src/app/(admin)/abonados/nuevo/page.tsx`
- **Qué testear:**
  - [ ] Select de canchas se carga con las canchas del complejo
  - [ ] `AbonadoForm`: campos nombre, teléfono, cancha, día/hora recurrente, precio
  - [ ] Validación: todos los campos requeridos
  - [ ] Submit exitoso → redirect a `/abonados` con mensaje de éxito
  - [ ] Error de slot ya ocupado → mensaje claro
  - [ ] Sin canchas configuradas: mensaje informativo y CTA a canchas
  - [ ] Cancelar → vuelve a `/abonados`

---

### 19. Listado de reservas (admin)
- **URL:** `/reservas`
- **Archivo:** `src/app/(admin)/reservas/page.tsx`
- **Qué testear:**
  - [ ] Lista todas las reservas del tenant
  - [ ] Filtros por estado (confirmada, pendiente, cancelada, no-show) funcionan
  - [ ] Clic en reserva → navega a `/reservas/[id]`
  - [ ] Badge de status con colores correctos por estado
  - [ ] Estado vacío (sin reservas con ese filtro)
  - [ ] Carga de 200 reservas sin degradar performance visual

---

### 20. Registro de nuevo admin
- **URL:** `/register`
- **Archivo:** `src/app/(auth)/register/page.tsx`
- **Qué testear:**
  - [ ] Campos: firstName, lastName, email, phone — todos required
  - [ ] Validación por campo: errors inline
  - [ ] Submit → estado "enviado" igual que en login
  - [ ] Email ya registrado → error específico
  - [ ] Loading state durante submit
  - [ ] Teléfono: acepta formato argentino (011-XXXX-XXXX, +54...)
  - [ ] Link a `/login` para usuarios ya registrados

---

## 🟡 P2 — Medio (11 vistas)

### 21. Gestión de canchas
- **URL:** `/canchas`
- **Archivo:** `src/app/(admin)/canchas/page.tsx`
- **Qué testear:**
  - [ ] `CourtList`: lista canchas del complejo con nombre, tipo, estado
  - [ ] Crear cancha: nombre, superficie, duración (60/120 min), precios por horario
  - [ ] Editar cancha: cambios persisten
  - [ ] Activar/desactivar cancha (`online`/`offline`)
  - [ ] Eliminar cancha: solo si no tiene reservas futuras
  - [ ] PinGate si hay PIN configurado
  - [ ] Precios JSONB: puntos de corte horarios flexibles (ej: 9-17 = $5000, 17-23 = $8000)
  - [ ] Estado vacío: CTA para crear primera cancha

---

### 22. Abonados (listado)
- **URL:** `/abonados`
- **Archivo:** `src/app/(admin)/abonados/page.tsx`
- **Qué testear:**
  - [ ] Lista abonados con nombre, cancha, horario, estado
  - [ ] `AbonadosList`: estados `active`, `canceled`, `paused`
  - [ ] Filtrar por estado
  - [ ] Acciones por abonado: pausar, cancelar, reactivar
  - [ ] Botón "+ Nuevo Abonado" lleva a `/abonados/nuevo`
  - [ ] Estado vacío sin abonados

---

### 23. Reportes mensuales
- **URL:** `/reportes`
- **Archivo:** `src/app/(admin)/reportes/page.tsx`
- **Qué testear:**
  - [ ] KPIs con % de cambio vs mes anterior: ingresos, ocupación
  - [ ] Tabla por cancha: ingresos y horas ocupadas
  - [ ] Tabla por método de pago
  - [ ] Navegar entre meses (searchParams)
  - [ ] Mes sin datos: muestra $0 sin errores
  - [ ] Botón "Exportar CSV" descarga archivo con datos correctos
  - [ ] PinGate si hay PIN

---

### 24. Staff
- **URL:** `/staff`
- **Archivo:** `src/app/(admin)/staff/page.tsx`
- **Qué testear:**
  - [ ] Lista miembros del equipo con nombre, email, estado
  - [ ] `InviteStaffButton`: envía invitación por email
  - [ ] Email ya invitado → error o "ya existe"
  - [ ] Desactivar miembro: solo el dueño puede hacerlo
  - [ ] Miembro desactivado no puede ingresar al panel
  - [ ] PinGate si hay PIN

---

### 25. Configuración: PIN
- **URL:** `/settings/pin`
- **Archivo:** `src/app/(admin)/settings/pin/page.tsx`
- **Qué testear:**
  - [ ] Sin PIN configurado: formulario para crear uno
  - [ ] Con PIN configurado: requiere el PIN actual antes de cambiarlo
  - [ ] PIN numérico de 4 a 8 dígitos (pattern `[0-9]{4,8}`)
  - [ ] PINs no coinciden → error de validación
  - [ ] PIN guardado correctamente (PinGate funciona en otras páginas)
  - [ ] PIN incorrecto al intentar cambiar → error

---

### 26. Perfil del jugador
- **URL:** `/perfil`
- **Archivo:** `src/app/(player)/perfil/page.tsx`
- **Qué testear:**
  - [ ] Muestra nombre, email, teléfono, avatar
  - [ ] `ProfileForm`: editar nombre y teléfono
  - [ ] Guardar → feedback + datos actualizados
  - [ ] Avatar: muestra iniciales si no hay foto
  - [ ] Fecha de aceptación de términos y versión
  - [ ] Email no es editable (viene de Supabase Auth)

---

### 27. Explorar complejos
- **URL:** `/explorar`
- **Archivo:** `src/app/(public)/explorar/page.tsx`
- **Qué testear:**
  - [ ] Resultados iniciales se cargan
  - [ ] Filtro por ciudad funciona
  - [ ] Filtro por superficie (grass, synthetic, etc.)
  - [ ] Filtro por formato (5v5, 7v7, etc.)
  - [ ] Filtro por amenities (estacionamiento, vestuarios, etc.)
  - [ ] Filtro por precio min/max
  - [ ] Ordenamiento (relevancia, precio, rating)
  - [ ] Toggle vista lista vs mapa
  - [ ] Paginación (offset) carga más resultados
  - [ ] Sin resultados: estado vacío con sugerencia de limpiar filtros
  - [ ] SearchBar con texto libre

---

### 28. Configuración del jugador
- **URL:** `/configuracion`
- **Archivo:** `src/app/(player)/configuracion/page.tsx`
- **Qué testear:**
  - [ ] `DataExportButton`: descarga o envía por email los datos del jugador
  - [ ] Link a `/eliminar-cuenta` es visible
  - [ ] Página no indexada (noIndex: true)

---

### 29. Eliminar cuenta (jugador)
- **URL:** `/eliminar-cuenta`
- **Archivo:** `src/app/(player)/eliminar-cuenta/page.tsx`
- **Qué testear:**
  - [ ] `DeleteAccountForm`: requiere confirmación explícita (escribir texto / checkbox)
  - [ ] Submit → dialog de doble confirmación
  - [ ] Anonimización exitosa → logout + redirect
  - [ ] Jugador con reservas futuras: advertencia o bloqueo
  - [ ] Datos financieros: mensaje de que se conservan 5 años (Ley 25.326)
  - [ ] Página no indexada

---

### 30. Home landing pública
- **URL:** `/`
- **Archivo:** `src/app/page.tsx`
- **Qué testear:**
  - [ ] Hero con buscador: submit con ciudad/texto → redirect a `/explorar?q=...`
  - [ ] `FeaturedComplexes`: se cargan complejos destacados
  - [ ] `StatsBar`: métricas (x complejos, x jugadores, etc.)
  - [ ] `HowItWorks`: sección funciona visualmente
  - [ ] `OwnerBanner`: CTA para complejos → link a `/para-complejos`
  - [ ] Resilencia: si falla una query, las otras secciones igual se muestran
  - [ ] ISR: no muestra datos stale obvios

---

### 31. Complejo suspendido
- **URL:** `/suspended`
- **Archivo:** `src/app/(public)/suspended/page.tsx`
- **Qué testear:**
  - [ ] Icono y mensaje de suspensión claros
  - [ ] Botón/link de contacto funciona
  - [ ] No indexada (noIndex: true, robots no-follow)

---

## 🟢 P3 — Bajo (5 vistas)

### 32. Para complejos (marketing)
- **URL:** `/para-complejos`
- **Archivo:** `src/app/(public)/para-complejos/page.tsx`
- **Qué testear:**
  - [ ] CTA principal ("Registrá tu complejo") lleva a `/register`
  - [ ] Secciones: Features, Testimonios, Precios, Final CTA se renderizan
  - [ ] Imágenes y íconos cargan sin broken links
  - [ ] Responsive en mobile
  - [ ] Links internos y anclas funcionan

---

### 33. Privacidad
- **URL:** `/privacy`
- **Archivo:** `src/app/(public)/privacy/page.tsx`
- **Qué testear:**
  - [ ] 9 secciones renderizan sin corte de texto
  - [ ] Links externos (AAIP, Supabase, etc.) válidos
  - [ ] Responsive

---

### 34. Términos y condiciones
- **URL:** `/terms`
- **Archivo:** `src/app/(public)/terms/page.tsx`
- **Qué testear:**
  - [ ] 10 secciones renderizan
  - [ ] Responsive

---

### 35. Mock MercadoPago (solo testing)
- **URL:** `/mock-mp/checkout`
- **Archivo:** `src/app/mock-mp/checkout/page.tsx`
- **Qué testear:**
  - [ ] Solo accesible con `MP_MOCK_MODE=1` en env
  - [ ] En producción devuelve 404
  - [ ] Botón "Aprobar pago" → llama `mockPay` y redirige a `/reserva/[id]/exito`
  - [ ] Botón "Rechazar" → llama `mockReject` y redirige a `/reserva/[id]/error`
  - [ ] Botón "Cancelar" → llama `mockCancel` y redirige a `/reserva/[id]/error`
  - [ ] Muestra resumen correcto del booking

---

### 36. Settings (redirect)
- **URL:** `/settings`
- **Archivo:** `src/app/(admin)/settings/page.tsx`
- **Qué testear:**
  - [ ] Redirige a `/settings/reservas` automáticamente
  - [ ] No genera loop de redirect

---

## Resumen por prioridad

| Prioridad | Cantidad | Vistas |
|-----------|----------|--------|
| 🔴 P0 | 8 | grilla, `/[slug]/reservar`, reserva-exito, reserva-pendiente, reserva-error, login, verify, caja |
| 🟠 P1 | 12 | onboarding, dashboard, reservas/[id], /[slug], disponibilidad, mis-reservas, settings/reservas, settings/horarios, settings/facturacion, abonados/nuevo, reservas-listado, register |
| 🟡 P2 | 11 | canchas, abonados, reportes, staff, settings/pin, perfil, explorar, configuracion, eliminar-cuenta, home, suspended |
| 🟢 P3 | 5 | para-complejos, privacy, terms, mock-mp, settings-redirect |

---

## Orden de ejecución sugerido

```
Semana 1 (P0):
  1. login + verify
  2. /[slug]/reservar → reserva-pendiente → reserva-exito → reserva-error
  3. grilla
  4. caja

Semana 2 (P1 core):
  5. onboarding (bloquea todo lo demás)
  6. dashboard
  7. settings/horarios + settings/reservas + settings/facturacion
  8. reservas/[id]

Semana 2 (P1 jugador):
  9. mis-reservas
 10. /[slug] + disponibilidad

Semana 3 (P2):
 11. canchas + abonados + staff
 12. reportes
 13. explorar
 14. perfil + configuracion + eliminar-cuenta

Semana 4 (P3 + regresión):
 15. home, para-complejos, legal
 16. mock-mp (validación de ambiente)
```

---

## Notas transversales

- **PinGate**: verificar que las rutas protegidas con PIN (canchas, reportes, staff, settings/*, abonados) bloquean correctamente si hay PIN configurado y lo solicitan una sola vez por sesión.
- **Montos en centavos**: todas las vistas que muestran dinero deben formatear centavos correctamente (10000 → $100.00 ARS).
- **Timestamps UTC → ART**: fechas y horas se muestran en hora argentina, no UTC.
- **Estados de tenant**: complejo `suspended`, `blocked`, `canceled`, `churned` debe bloquear acceso al panel admin con redirect a `/suspended`.
- **RLS**: ninguna vista debe mostrar datos de otro tenant. Verificar con 2 cuentas.
- **Responsive**: priorizar mobile en vistas del jugador (público), desktop en vistas del admin.
- **ENUMs**: en listas y badges verificar que nunca aparece `cancelled` (doble L) — solo `canceled`.
