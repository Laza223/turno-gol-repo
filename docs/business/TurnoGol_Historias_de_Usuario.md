# ⚽ TurnoGol — Especificación Funcional v3.0 (Copia ATC para Fútbol)

> **Filosofía:** Copiar el sistema de ATC al 100% pero exclusivamente para fútbol argentino.
> Cada módulo replica lo que hace ATC según fuentes verificadas (intercom.help, atcsports.io).
> Los conceptos complejos incluyen sección **💡 EXPLICACIÓN** para que se entienda bien.
> Los items marcados con **🟡 EVALUAR** son candidatos a simplificar para MVP si el founder lo decide.

---

## Tabla de Contenidos

1. [M1 — Registro, Onboarding y Suscripción](#m1--registro-onboarding-y-suscripción)
2. [M2 — Gestión de Canchas](#m2--gestión-de-canchas)
3. [M3 — Reglas de Reserva por Cancha](#m3--reglas-de-reserva-por-cancha)
4. [M4 — Configuración de Precios](#m4--configuración-de-precios)
5. [M5 — Grilla de Reservas (Panel Admin)](#m5--grilla-de-reservas-panel-admin)
6. [M6 — Turnos: Tipos y Creación](#m6--turnos-tipos-y-creación)
7. [M7 — Cobros y Pagos](#m7--cobros-y-pagos)
8. [M8 — Seña, Tarjeta en Garantía e Integración MP](#m8--seña-tarjeta-en-garantía-e-integración-mp)
9. [M9 — Cancelaciones y Penalizaciones](#m9--cancelaciones-y-penalizaciones)
10. [M10 — Caja y Reportes Financieros](#m10--caja-y-reportes-financieros)
11. [M12 — Usuarios Administrativos y Roles](#m12--usuarios-administrativos-y-roles)
13. [M13 — Web Pública del Complejo (Slug)](#m13--web-pública-del-complejo-slug)
14. [M14 — Portal de Búsqueda (Jugador)](#m14--portal-de-búsqueda-jugador)
15. [M15 — Reserva Online (Jugador)](#m15--reserva-online-jugador)
16. [M16 — Autenticación y Cuentas](#m16--autenticación-y-cuentas)
17. [M17 — WhatsApp](#m17--whatsapp)
18. [M18 — Estadísticas y Dashboard](#m18--estadísticas-y-dashboard)
19. [M19 — Configuración General del Complejo](#m19--configuración-general-del-complejo)
20. [M20 — Notificaciones](#m20--notificaciones)

---

## M1 — Registro, Onboarding y Suscripción

### HU-1.1: Registro del complejo
**Como** dueño, **quiero** registrar mi complejo, **para** comenzar a usar TurnoGol.

**CA:**
- [ ] Formulario: nombre del complejo, dirección, teléfono, WhatsApp, email, contraseña
- [ ] Email de verificación
- [ ] Al verificar → onboarding guiado
- [ ] Sin tarjeta de crédito para el trial

### HU-1.2: Onboarding guiado
**Como** dueño, **quiero** un asistente de configuración, **para** tener el complejo operativo rápido.

**CA:**
- [ ] Paso 1 — Datos: nombre, dirección, teléfono, WhatsApp, logo, fotos del complejo (hasta 10)
- [ ] Paso 2 — Horarios: días de apertura/cierre, horario por día
- [ ] Paso 3 — Servicios: checkboxes (vestuarios, duchas, estacionamiento, bar/buffet, parrilla/quincho, WiFi, iluminación nocturna)
- [ ] Paso 4 — Canchas: crear cada cancha (nombre, tipo F5-F11, superficie, techada, fotos)
- [ ] Paso 5 — Reglas de reserva: configurar intervalos y duraciones por cancha
- [ ] Paso 6 — Precios: tabla de precios por cancha (duración × franja × día)
- [ ] Paso 7 — Seña/MP: configurar seña + vincular Mercado Pago (opcional)
- [ ] Paso 8 — Política de cancelación
- [ ] Se puede omitir pasos y volver después
- [ ] Cada paso guarda progreso

### HU-1.3: Trial de 30 días
**CA:**
- [ ] Trial comienza al verificar email
- [ ] Acceso completo sin restricciones
- [ ] Banner con días restantes
- [ ] Email recordatorio al día 25
- [ ] Al vencer: 3 días de gracia con aviso
- [ ] Post gracia: bloqueo (ve datos, no crea/edita). Web pública: "Reservas deshabilitadas temporalmente"
- [ ] Paga → reactiva inmediatamente
- [ ] 60 días bloqueado → marcado para eliminación

### HU-1.4: Planes y suscripción
**CA:**
- [ ] **Plan CANCHA** (1-3 canchas): precio en ARS
- [ ] **Plan COMPLEJO** (4+ canchas): precio en ARS
- [ ] **Descuento 33% por pago anual** (como ATC)
- [ ] Cobro vía MercadoPago Suscripciones (ARS)
- [ ] Fallback: transferencia bancaria
- [ ] Sin cobro de setup
- [ ] Soporte incluido sin costo
- [ ] Actualizaciones automáticas y gratuitas

---

## M2 — Gestión de Canchas

### HU-2.1: Crear cancha
**CA:**
- [ ] Nombre (texto libre), tipo de fútbol (**F5, F6, F7, F8, F9, F10, F11**)
- [ ] Superficie (Sintético / Natural / Cemento / Caucho), techada (Sí / No / Parcial), iluminación (Sí / No)
- [ ] Fotos: hasta 5 por cancha
- [ ] Estado: Activa / En mantenimiento
- [ ] Al guardar → nueva columna en la grilla

### HU-2.2: Editar cancha
**CA:**
- [ ] Todos los campos editables
- [ ] Si cambia tipo de fútbol → advertencia: "Las reservas activas no serán afectadas"
- [ ] Cambios reflejados en grilla y web pública

### HU-2.3: Desactivar / Mantenimiento
**CA:**
- [ ] "En mantenimiento" → grilla muestra slots bloqueados (gris), no aparece en web pública
- [ ] Reservas existentes NO se cancelan automáticamente
- [ ] Se puede reactivar

### HU-2.4: Eliminar cancha
**CA:**
- [ ] Solo rol Dueño
- [ ] Advertencia si tiene reservas futuras
- [ ] Confirmación doble
- [ ] Datos históricos se mantienen

### HU-2.5: Canchas transformables (madre-hija)

> 💡 **EXPLICACIÓN:** Un complejo tiene 2 canchas de F5 ("Cancha 1" y "Cancha 2"). Físicamente, si sacan la red del medio, se forma 1 cancha de F7 ("Cancha Grande"). En el sistema: Cancha Grande es la "madre", Cancha 1 y 2 son las "hijas". Si alguien reserva la Cancha Grande → las 2 chicas se bloquean automáticamente (y viceversa). Si alguien reserva Cancha 1 → la Cancha Grande se bloquea porque ya no puede usarse completa.

**CA:**
- [ ] Se crean todas las canchas (hijas e madre) individualmente
- [ ] En la cancha madre: sección "Transformable" → activar → seleccionar canchas hijas
- [ ] **Bloqueo cruzado automático:**
  - Reservar madre → bloquear hijas
  - Reservar cualquier hija → bloquear madre
- [ ] Aplica a reservas manuales y online
- [ ] En la grilla, slots bloqueados por transformación tienen indicador visual distinto (candado/color diferente)
- [ ] **Profundidad máx: 1 nivel** (una cancha es madre O hija, nunca ambas)

### HU-2.6: Ordenar canchas
**CA:**
- [ ] Drag & drop para reordenar
- [ ] Se refleja en grilla y web pública

---

## M3 — Reglas de Reserva por Cancha

> 💡 **EXPLICACIÓN:** En ATC, cada cancha tiene "reglas de reserva" que controlan cómo se dividen los horarios. Ejemplo: la cancha de F5 tiene turnos de 60 min cada 60 min. La cancha de F7 tiene turnos de 90 min cada 90 min. Podés tener una regla para días de semana y otra para fines de semana. Hay una regla por defecto (30 min) que se sobreescribe con las tuyas.

### HU-3.1: Configurar reglas de reserva por cancha
**Como** dueño/encargado, **quiero** definir cómo se dividen los horarios de cada cancha, **para** ofrecer turnos de diferentes duraciones.

**CA:**
- [ ] Acceso: Administrar Complejo → Canchas → [cancha] → Reservas → Configurar reservas
- [ ] Botón "+ Agregar regla"
- [ ] Campos por regla:
  - **Desde / Hasta:** rango horario (ej: 08:00 a 23:00)
  - **Días:** checkboxes de lunes a domingo
  - **Intervalos:** cada cuántos minutos se crean slots (ej: 60, 90, 120)
  - **Duraciones permitidas:** qué duraciones puede elegir el jugador (ej: 60 y 90 min)
- [ ] Regla por defecto del sistema: turnos cada 30 min. Se sobreescribe con las reglas del complejo.
- [ ] Si hay reglas superpuestas, prioriza la última ingresada
- [ ] Opción "No duración" para bloquear un rango horario (clases, torneos, mantenimiento)
- [ ] Ejemplo real: Cancha F5 → Regla 1: L-V 08:00-23:00, intervalo 60, dur. 60. Regla 2: S-D 08:00-23:00, intervalo 60, dur. 60/90.

---

## M4 — Configuración de Precios

> 💡 **EXPLICACIÓN – TABLA DE PRECIOS:** ATC tiene una calculadora/tabla donde las **columnas** son las duraciones (60, 90, 120 min) y las **filas** son las franjas horarias. Ejemplo: una cancha con corte a las 18hs tiene 2 franjas. Si además tiene 2 duraciones (60 y 90 min), la tabla tiene 2×2 = 4 precios. Hay un precio "genérico" (aplica toda la semana) y podés "personalizar" sábado y domingo con precios diferentes.

### HU-4.1: Habilitar duraciones por cancha
**CA:**
- [ ] En la sección de precios de cada cancha, marcar casillas: 60 min, 90 min, 120 min
- [ ] El precio de cada duración es independiente (no se calcula automáticamente)

### HU-4.2: Configurar franjas horarias (puntos de corte)
**CA:**
- [ ] Se agregan "puntos de corte" que dividen el día en franjas
- [ ] Ejemplo: corte a las 18:00 → Franja 1: "Antes de 18hs" / Franja 2: "Después de 18hs"
- [ ] Múltiples cortes posibles (ej: 14:00 y 18:00 → 3 franjas: mañana, tarde, noche)
- [ ] Los cortes aplican a la cancha específica

### HU-4.3: Cargar precios (tabla/calculadora)
**CA:**
- [ ] Se presenta una **tabla de precios:**
  - **Columnas** = duraciones habilitadas (60, 90, 120 min)
  - **Filas** = franjas horarias definidas
- [ ] **Precio genérico:** aplica a todos los días por defecto
- [ ] **Personalizar por día:** checkbox por cada día → al activar, se desbloquean campos para ese día (sobreescribe el genérico)
- [ ] Uso típico: precio genérico L-V + personalización S-D
- [ ] Los precios se muestran en ARS
- [ ] **Cambios aplican a reservas futuras.** Reservas ya confirmadas mantienen su precio original.

**Ejemplo de tabla para una cancha:**

| Franja | 60 min | 90 min |
|---|---|---|
| Antes de 18:00 (L-V) | $35.000 | $50.000 |
| Después de 18:00 (L-V) | $55.000 | $80.000 |
| Antes de 18:00 (S-D) | $45.000 | $65.000 |
| Después de 18:00 (S-D) | $65.000 | $95.000 |

---

## M5 — Grilla de Reservas (Panel Admin)

### HU-5.1: Grilla diaria
**CA:**
- [ ] Pantalla principal del panel
- [ ] Columnas = canchas, filas = horarios (intervalos según reglas de la cancha)
- [ ] Fecha actual por defecto, navegación con flechas + datepicker
- [ ] **Colores por tipo de turno:**
  - 🟢 Libre
  - 🔵 Reserva online
  - 🟣 Turno fijo
  - 🟠 Reserva manual
  - ⚫ Bloqueado
  - 🟡 Cumpleaños/Evento
  - 🔴 Profesor/Escuela
  - 🟤 Abonado
- [ ] Indicador de pago (seña pagada, deuda)
- [ ] Responsive (celular, tablet, PC)
- [ ] Tiempo real (múltiples usuarios simultáneos)

### HU-5.2: Vista semanal
**CA:**
- [ ] 7 días con resumen de ocupación
- [ ] Click día → vista diaria

### HU-5.3: Crear reserva manual
**CA:**
- [ ] Click en celda vacía → panel lateral con formulario
- [ ] Se puede ajustar duración arrastrando hacia abajo (drag)
- [ ] Campos: tipo de reserva (único/fijo), precio (autocompleta, editable), duración, fecha fin (si fijo), tipo de turno (Normal/Profesor/Torneo/Escuela/Cumpleaños/Abonado), nombre (con autocomplete), teléfono, email, notas
- [ ] Si jugador existe → autocompleta + muestra historial (deudas, faltas)
- [ ] El tipo de turno determina el color en la grilla

### HU-5.4: Ver detalle de reserva
**CA:**
- [ ] Click en bloque → panel con: datos del jugador, tipo, cancha, fecha/hora, duración, precio, estado de pago, consumos del bar, historial
- [ ] Acciones: Agregar cobro, Agregar consumo, Cancelar, Finalizar

### HU-5.5: Mover reserva (drag & drop)
**CA:**
- [ ] Drag & drop a otro slot libre
- [ ] Confirmación + aviso si cambia el precio

### HU-5.6: Bloquear slot
**CA:**
- [ ] Click celda vacía → "Bloquear"
- [ ] Motivo opcional
- [ ] Gris oscuro en grilla
- [ ] No disponible para reservas online
- [ ] Desbloqueable manualmente

---

## M6 — Turnos: Tipos y Creación

### HU-6.1: Turno único
**CA:**
- [ ] Reserva para una sola fecha. Se completa o cancela.

### HU-6.2: Turno fijo (recurrente semanal)
**CA:**
- [ ] Se repite automáticamente cada semana (mismo día, hora, cancha)
- [ ] Fecha de fin opcional o indefinido
- [ ] Color morado/violeta + badge "FIJO"
- [ ] Se puede cancelar una ocurrencia individual, cancelar todo, o pausar
- [ ] El sistema genera reservas automáticamente (cron semanal)

### HU-6.3: Turno abonado

> 💡 **EXPLICACIÓN:** El abonado es un jugador que paga varias semanas por adelantado. Ejemplo: Juan juega todos los martes. El turno vale $55.000 por semana. Juan paga 4 semanas juntas = $220.000 el primer día. Las próximas 3 semanas, el complejo abre su turno y ve "Saldo a favor: $165.000". Puede destildar "Mantener saldo" para descontar los $55.000 de esa semana automáticamente. El saldo baja a $110.000. Y así cada semana. Si Juan tiene OTRO turno fijo (ej: jueves), ese saldo es independiente, no se comparte.

**CA:**
- [ ] Se selecciona tipo "Abonado" al crear turno fijo
- [ ] Se registra cobro total (ej: 4 × $55.000 = $220.000)
- [ ] El sistema guarda el saldo a favor asociado a ESE bloque de turno
- [ ] Semanas siguientes: en la sección "Cobros de turno" aparece checkbox **"Mantener saldo"**
  - Tildado (default) → el saldo queda intacto, se puede agregar cobro manual
  - Destildado → el sistema descuenta automáticamente el valor del turno del saldo
- [ ] Cuando el saldo se agota → aviso "Sin saldo, se requiere nuevo pago"
- [ ] El abono se registra en caja del día del pago (no se duplica en semanas siguientes)
- [ ] El saldo es por bloque, no por jugador (2 turnos = 2 saldos independientes)
- [ ] Color marrón en la grilla

### HU-6.4: Turno profesor / escuela
**CA:**
- [ ] Tipo de turno para clases o entrenamiento
- [ ] Color rojo en la grilla
- [ ] Puede ser fijo (semanal) o único
- [ ] Bloquea el slot para reservas online

### HU-6.5: Turno torneo
**CA:**
- [ ] Tipo de turno para torneos
- [ ] Puede ocupar múltiples slots consecutivos o varias canchas
- [ ] Color diferenciado en la grilla

### HU-6.6: Turno cumpleaños / evento
**CA:**
- [ ] Tipo de turno para cumpleaños/eventos
- [ ] Color amarillo en la grilla
- [ ] Datos adicionales opcionales (nombre del cumpleañero, cantidad de personas)

---

## M7 — Cobros y Pagos

### HU-7.1: Agregar cobro a una reserva
**CA:**
- [ ] Botón "Agregar cobro" en el detalle
- [ ] Monto + método de pago (Efectivo / MP / Transferencia / Tarjeta crédito / Tarjeta débito / Cheque)
- [ ] Monto sugerido = pendiente (editable)
- [ ] Múltiples cobros parciales con diferentes medios
- [ ] Cada cobro registra: monto, método, fecha/hora, usuario

### HU-7.2: Cobro con seña online
**CA:**
- [ ] Muestra "Seña pagada: $X vía MP"
- [ ] Saldo pendiente = precio - seña

### HU-7.3: Finalizar turno
**CA:**
- [ ] Botón "Finalizar"
- [ ] Si hay saldo pendiente → "El jugador debe $X. ¿Confirmar?" → queda como deuda
- [ ] Turno finalizado no se modifica
- [ ] Impacta en estadísticas y caja

### HU-7.4: Gestión de deudas
**CA:**
- [ ] Al crear reserva con jugador existente → muestra saldo de deuda
- [ ] Se puede cancelar la deuda (con o sin cobro)

---

## M8 — Seña, Tarjeta en Garantía e Integración MP

### HU-8.1: Vincular Mercado Pago (OAuth)
**CA:**
- [ ] Solo rol Dueño
- [ ] OAuth estándar. Dinero directo al complejo. TurnoGol no toca la plata.
- [ ] Comisión de MP la asume el complejo
- [ ] Tokens encriptados con refresh automático
- [ ] Se puede desconectar

### HU-8.2: Configurar seña por cancha
**CA:**
- [ ] La configuración de seña es **por cancha** (cada cancha puede tener diferente seña)
- [ ] Opciones: monto fijo (ARS) o porcentaje del turno
- [ ] Se puede desactivar la seña para una cancha individual
- [ ] Sin MP conectado → sin seña online

### HU-8.3: Tarjeta en garantía

> 💡 **EXPLICACIÓN:** En vez de cobrar seña (sacarle plata al jugador al reservar), la "tarjeta en garantía" le pide que deje una tarjeta de crédito como respaldo. NO se le cobra nada. Si viene y juega → no se cobra nada de la tarjeta (paga todo en el complejo presencialmente). Si NO viene o cancela fuera de plazo → le cobran el monto de la seña a la tarjeta. Es como dejar una tarjeta en el hotel: no te cobran salvo que rompas algo.
>
> **¿Por qué es útil?** Reduce la fricción. El jugador no tiene que pagar nada por adelantado, lo que aumenta la conversión de reservas. Pero tiene una garantía de que si no viene, pierde plata.
>
> **Problema con tarjetas prepaga (MP, Ualá, Lemon):** Estas tarjetas retienen el monto automáticamente (como si te cobraran), y puede tardar hasta 20 días en liberarse si todo sale bien. Esto genera reclamos. Por eso ATC lo advierte.

**CA:**
- [ ] El complejo puede elegir entre seña (cobro real) o tarjeta en garantía (preautorización sin cobro)
- [ ] Si tarjeta de crédito: preautorización sin impacto en resumen salvo incumplimiento
- [ ] Si tarjeta de débito/prepaga: retención que se libera post-turno (posible demora hasta 20 días)
- [ ] Se informa al jugador antes de reservar
- [ ] Si "tarjeta en riesgo" → sugerencia de usar otra tarjeta

### HU-8.4: Política de cancelación
**CA:**
- [ ] Configurable: "La seña se pierde" (default) / "Se devuelve si cancela con más de X horas"
- [ ] Se muestra al jugador antes de confirmar reserva

### HU-8.5: Devolución automática de seña
**CA:**
- [ ] Si el jugador cancela **dentro del plazo** → devolución automática vía MP
- [ ] Si el jugador cancela **fuera del plazo** o no se presenta → la seña se cobra
- [ ] El sistema informa al jugador que la devolución por tarjeta de crédito puede tardar 1-2 ciclos de facturación (30-60 días)

### HU-8.6: Cargar seña manualmente
**CA:**
- [ ] Desde detalle de reserva → "+Agregar cobro" tipo seña
- [ ] Selecciona método y monto

---

## M9 — Cancelaciones y Penalizaciones

### HU-9.1: Cancelar reserva (admin)
**CA:**
- [ ] Confirmación
- [ ] Si tenía seña online → opción "¿Devolver la seña?" (Sí/No)
- [ ] Slot se libera

### HU-9.2: Cancelar turno fijo completo
**CA:**
- [ ] Cancela todas las ocurrencias futuras

### HU-9.3: Reportar no-show
**CA:**
- [ ] Botón "Reportar"
- [ ] Si tenía seña/garantía → se ejecuta el cobro
- [ ] Se aplica penalización al jugador

### HU-9.4: Penalizaciones cross-complejo
**CA (idéntico a ATC):**
- [ ] **1ra infracción (Tarjeta amarilla):** 1 semana sin reservar en ningún complejo
- [ ] **2da infracción (Tarjeta roja):** 3 semanas
- [ ] **3ra infracción (Penalización anual):** 1 año
- [ ] Automática al reportar no-show
- [ ] Se puede pedir a soporte que aplique penalización manual

### HU-9.5: Lista negra local
**CA:**
- [ ] Bloquear cliente por teléfono + motivo
- [ ] Reserva manual → aviso (puede continuar)
- [ ] Reserva online → bloqueo duro

---

## M10 — Caja y Reportes Financieros

### HU-10.1: Reporte de caja

> 💡 **EXPLICACIÓN:** El reporte de caja muestra el dinero REAL que entró/salió. Cada fila es un movimiento de dinero. Si un turno se pagó $30K efectivo + $25K transferencia, son 2 filas. Es diferente del reporte de ventas/compras.

**CA:**
- [ ] Fila por movimiento
- [ ] Columnas: concepto (Turnos/Consumos, Ventas, Compras), usuario, jugador, fecha/hora turno, cancha, notas, fecha/hora movimiento, método de pago, ingreso (verde), egreso (rojo)
- [ ] Resumen inferior: totales por método de pago + total ingresos + total egresos + saldo neto
- [ ] Filtrable por rango de fechas
- [ ] Exportar a Excel y PDF
- [ ] Solo Dueño y Encargado

### HU-10.2: Reporte de ventas y compras

> 💡 **EXPLICACIÓN:** El reporte de ventas/compras es TEÓRICO. Muestra QUÉ se vendió (3 Coca-Colas, 12 turnos de F5), no cuánto dinero entró en la caja. Es diferente: caja = dinero real; ventas = servicios/productos prestados.

**CA:**
- [ ] Desglosa artículos vendidos/comprados: nombre, cantidad, precio unitario, total
- [ ] Filtrable por fechas
- [ ] Exportable

### HU-10.3: Registrar retiro/ingreso manual
**CA:**
- [ ] Tipo (ingreso/egreso), monto, método, concepto/nota
- [ ] Aparece en reporte de caja

### HU-10.4: Retirar cobro de una reserva
**CA:**
- [ ] Desde detalle → lista de cobros → "Retirar"
- [ ] Genera movimiento negativo en caja

---

## M12 — Usuarios Administrativos y Roles

### HU-12.1: Crear usuario
**CA:**
- [ ] Email → busca o crea usuario → asigna rol
- [ ] **Roles con permisos diferenciados** (como ATC):
  - **Dueño:** acceso total (MP, suscripción, eliminar)
  - **Encargado/Admin:** acceso operativo (grilla, cobros, reportes)
  - Permisos granulares configurables
- [ ] Sin límite de usuarios por complejo (incluido en el plan)

### HU-12.2: Eliminar usuario
**CA:**
- [ ] Acceso revocado inmediatamente
- [ ] Historial de operaciones se mantiene

### HU-12.3: Código de usuario
**CA:**
- [ ] Código de 4-6 dígitos por usuario
- [ ] **Sesión autenticada** → código solo para operaciones destructivas (cancelar, devolver, eliminar, cambiar precios)
- [ ] Operaciones normales (crear reserva, cobrar) → sin código
- [ ] Queda en log de auditoría

---

## M13 — Web Pública del Complejo (Slug)

### HU-13.1: Web autogenerada
**CA:**
- [ ] URL: `turnogol.app/[slug]`
- [ ] Contenido: nombre, logo, fotos, canchas (tipo, superficie, techado), precios, servicios, horarios, mapa (Google Maps), teléfono, WhatsApp
- [ ] Botón "Reservar" prominente
- [ ] Responsive
- [ ] SEO optimizada ("cancha de fútbol 5 en [zona]")
- [ ] Compartible por WhatsApp e Instagram
- [ ] Footer: "Gestionado con TurnoGol ⚽"

### HU-13.2: Grilla de disponibilidad pública
**CA:**
- [ ] Calendario con próximos N días (pills scrolleables)
- [ ] Canchas con horarios disponibles y precios
- [ ] Click en slot → opciones de duración con precio → flujo de reserva

### HU-13.3: Personalización visual
**CA:**
- [ ] Logo, color primario
- [ ] Datos auto-actualizados del perfil

---

## M14 — Portal de Búsqueda (Jugador)

### HU-14.1: Buscador
**CA:**
- [ ] Ubicación (autocompletado + geolocalización), tipo de fútbol (F5-F11), fecha, hora
- [ ] "Buscar canchas"

### HU-14.2: Resultados
**CA:**
- [ ] Tarjetas: foto, nombre, dirección, precio desde, horarios disponibles como pills
- [ ] "X clubes encontrados"
- [ ] Click → web del complejo (slug)

### HU-14.3: Filtros
**CA:**
- [ ] Ordenar (precio, cercanía), superficie, techada, servicios

### HU-14.4: Mapa
**CA:**
- [ ] Mapa interactivo con pines
- [ ] Click pin → popup con nombre, precio, "Ver disponibilidad"

---

## M15 — Reserva Online (Jugador)

### HU-15.1: Seleccionar cancha, horario y duración
**CA:**
- [ ] Click en slot → popup con cancha, horario, opciones de duración con precio
- [ ] "Continuar — ARS [precio]"

### HU-15.2: Resumen pre-pago
**CA:**
- [ ] Complejo, cancha, fecha, hora, duración, precio total, seña, tipo de garantía, política de cancelación
- [ ] Si no logueado → login primero

### HU-15.3: Pago
**CA:**
- [ ] Mercado Pago: crédito, débito, saldo MP, prepaga
- [ ] Seña → cobro inmediato
- [ ] Tarjeta en garantía → preautorización (sin cobro)
- [ ] Sin seña → confirma directo

### HU-15.4: Confirmación
**CA:**
- [ ] "¡Reserva confirmada! ⚽"
- [ ] Email de confirmación
- [ ] Aparece en "Mis Reservas"
- [ ] Aparece en grilla del complejo en tiempo real

### HU-15.5: Mis Reservas
**CA:**
- [ ] Activas (futuras) + historial (pasadas)
- [ ] Detalle por reserva

### HU-15.6: Cancelar reserva (jugador)
**CA:**
- [ ] Política de cancelación visible antes de confirmar
- [ ] Dentro del plazo → devolución automática vía MP (si está habilitado)
- [ ] Fuera del plazo → seña se cobra
- [ ] Slot se libera

---

## M16 — Autenticación y Cuentas

### HU-16.1: Magic link (jugador)
**CA (igual a ATC):**
- [ ] Email → link de acceso → logueado
- [ ] Expira en 15 min, un solo uso

### HU-16.2: Google OAuth (jugador — extra vs ATC)
**CA:**
- [ ] Botón "Continuar con Google"
- [ ] Primera vez → crea cuenta automáticamente

### HU-16.3: Login admin (email + contraseña)
**CA:**
- [ ] Login tradicional con recuperación por email
- [ ] Sesión persistente

---

## M17 — WhatsApp

### HU-17.1: MVP — Links wa.me con mensajes pre-armados
**CA:**
- [ ] Botones en cada reserva: "📱 Enviar confirmación", "📱 Recordar turno", "📱 Avisar cancelación"
- [ ] Abre `wa.me/[tel]?text=[mensaje]`
- [ ] Templates editables con variables: `{nombre}`, `{fecha}`, `{hora}`, `{cancha}`, `{precio}`, `{seña}`, `{complejo}`
- [ ] Templates default incluidos

### HU-17.2: V1 — API Oficial de WhatsApp Business

> ⚠️ **NOTA:** ATC usa conexión vía QR (tipo WhatsApp Web) para sus automatizaciones. Esto tiene riesgo de ban del número por Meta. TurnoGol decide ir por la API oficial de Meta (Cloud API, gratuita hasta 1000 conv/mes). Si el costo o complejidad es mucho, se mantiene wa.me.

**CA (si se implementa):**
- [ ] Confirmación automática al jugador al reservar
- [ ] Notificación al complejo de nueva reserva
- [ ] Recordatorio antes del turno (configurable: 30 min, 1h, 3h)
- [ ] Vendedor automático: al día siguiente de jugar, ofrecerle el mismo horario la próxima semana
- [ ] Templates con variables dinámicas

---

## M18 — Estadísticas y Dashboard

### HU-18.1: Dashboard
**CA:**
- [ ] Ocupación de hoy (%), ingresos del día, reservas nuevas, cancelaciones
- [ ] Links rápidos a grilla y reportes

### HU-18.2: Estadísticas de ocupación
**CA:**
- [ ] Ocupación por cancha, por día de la semana, por franja horaria
- [ ] Evolución mes a mes
- [ ] Filtrable por fechas y tipo de turno

### HU-18.3: Estadísticas de ingresos
**CA:**
- [ ] Ingresos totales, desglose por fuente (turnos, bar), por método de pago
- [ ] Comparativa periodo actual vs anterior
- [ ] Gráficos

---

## M19 — Configuración General del Complejo

### HU-19.1: Datos del complejo
**CA:**
- [ ] Nombre, dirección, teléfono, WhatsApp, email, logo, fotos (hasta 10)

### HU-19.2: Horarios de apertura
**CA:**
- [ ] Hora apertura + cierre por día de la semana
- [ ] Días como "Cerrado"
- [ ] Soporte para cruce de medianoche

### HU-19.3: Servicios disponibles
**CA:**
- [ ] Checkboxes: vestuarios, duchas, estacionamiento, bar/buffet, parrilla/quincho, WiFi, iluminación nocturna
- [ ] Se muestra en web pública y portal

### HU-19.4: Días feriados/cerrados
**CA:**
- [ ] Marcar fecha como "Cerrado" o "Feriado" (horario/precios especiales)

### HU-19.5: Horarios para reservas online
**CA:**
- [ ] Subconjunto del horario de apertura (puede ser más restrictivo)
- [ ] Anticipación máxima (ej: hasta 7 días)

---

## M20 — Notificaciones

### HU-20.1: Email confirmación de reserva
### HU-20.2: Email de cancelación
### HU-20.3: Email recordatorio de turno
### HU-20.4: Notificación al complejo de nueva reserva online

**CA de todas:** mismas que la v2.0 (email con datos de la reserva, link de cancelación, configurable).

---

## Resumen: Alineación con ATC

| Feature de ATC | TurnoGol v3.0 |
|---|---|
| Duraciones 60/90/120 | ✅ Configurable por cancha |
| Reglas de reserva (intervalos, días, franjas) | ✅ Idéntico |
| Tabla de precios (duración × franja × día) | ✅ Idéntico |
| Canchas transformables | ✅ Madre-hija, 1 nivel |
| Todos los tipos de turno | ✅ Único, fijo, abonado, profesor, escuela, torneo, cumpleaños |
| Turno abonado (saldo a favor) | ✅ Idéntico |
| Seña por cancha | ✅ Por cancha |
| Tarjeta en garantía | ✅ Implementar |
| Devolución automática | ✅ Implementar |
| Stock / Bar | ❌ No (decisión tomada) |
| Multi-deporte | ❌ Solo fútbol (intencional) |
| App nativa iOS/Android | ❌ Web responsive / PWA |
| "Falta 1" / Partidos abiertos | ❌ No aplica (es SaaS de gestión) |
| WhatsApp QR scraping | ❌ Usamos wa.me (MVP) + API oficial (V1) |
| 13 países | ❌ Solo Argentina (intencional) |
| Descuento 33% anual | ✅ Lo implementamos |

---

> **Total: 20 módulos, ~65 HU.**
> Los items marcados 🟡 EVALUAR quedan para decisión del founder.

---

*Versión 3.0 — 16 de abril de 2026*
*Réplica completa de ATC adaptada exclusivamente para fútbol argentino.*
