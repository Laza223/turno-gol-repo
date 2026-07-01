# Índice de Capturas de Pantalla (UI Audit)

Este archivo contiene el índice de todas las capturas de pantalla de la interfaz de usuario de **TurnoGol** generadas para la auditoría de UX/UI. 

Se han capturado un total de **100 capturas de pantalla** distribuidas de forma idéntica en 2 viewports:
* **Desktop**: `docs/audit/screenshots/desktop/` (1440x900)
* **Mobile**: `docs/audit/screenshots/mobile/` (393x851 - Pixel 5)

---

## Estructura y Categorías

### 1. Vistas Públicas (`public/`)
Capturas de las interfaces accesibles para usuarios no autenticados (jugadores explorando y reservando).

| Archivo | Descripción / Estado de la UI |
| :--- | :--- |
| `landing.png` | Página de bienvenida principal del sitio. |
| `explorar_con_resultados.png` | Buscador de complejos con resultados y filtros activos. |
| `explorar_vacio.png` | Buscador de complejos cuando no se encuentran resultados. |
| `pagina_complejo.png` | Perfil público de un complejo (información, mapa, canchas). |
| `disponibilidad_semanal.png` | Widget de la grilla de disponibilidad semanal de una cancha. |
| `reserva_formulario_sin_sena.png` | Formulario de reserva para un turno que no requiere seña. |
| `reserva_formulario_con_sena.png` | Formulario de reserva para un turno con seña requerida. |
| `reserva_checkout_mp.png` | Pantalla del checkout mockeado de MercadoPago. |
| `reserva_exito.png` | Pantalla de confirmación de reserva exitosa. |
| `reserva_expirada.png` | Pantalla de error cuando expira el tiempo límite de checkout. |

---

### 2. Autenticación y Onboarding (`auth_onboarding/`)
Capturas de flujos de inicio de sesión y el asistente de configuración para nuevos complejos.

| Archivo | Descripción / Estado de la UI |
| :--- | :--- |
| `login_staff_inicial.png` | Pantalla de inicio de sesión para el personal/administradores. |
| `login_jugador_inicial.png` | Pantalla inicial de acceso para jugadores (magic link). |
| `login_jugador_revisa_email.png` | Pantalla de confirmación tras enviar el enlace mágico al email. |
| `onboarding_paso_1.png` | Paso 1 del Asistente: Información básica del complejo. |
| `onboarding_paso_2.png` | Paso 2 del Asistente: Configuración y creación de canchas. |
| `onboarding_paso_3.png` | Paso 3 del Asistente: Horarios de atención y duración de turnos. |
| `onboarding_paso_4.png` | Paso 4 del Asistente: Políticas de reserva, señas y revisión final. |

---

### 3. Panel de Administración (`admin/`)
Capturas de la plataforma de gestión interna del complejo.

| Archivo | Descripción / Estado de la UI |
| :--- | :--- |
| `dashboard.png` | Tablero de control principal (Inicio) con métricas clave. |
| `grilla.png` | Grilla interactiva diaria de turnos y ocupación. |
| `reservas_creacion_modal.png` | Diálogo modal para registrar una reserva manualmente. |
| `reservas_listado.png` | Tabla con el registro histórico e información detallada de reservas. |
| `reservas_detalle.png` | Vista detallada de una reserva específica. |
| `reservas_cancelacion_modal.png` | Diálogo modal para confirmar la cancelación de una reserva. |
| `caja.png` | Panel de flujo de caja diaria (ingresos, egresos y cierres). |
| `caja_registrar_movimiento_modal.png` | Diálogo modal para agregar un movimiento manual de caja. |
| `canchas_listado.png` | Listado y administración de las canchas del complejo. |
| `canchas_formulario_modal.png` | Vista/formulario para agregar o editar los datos de una cancha. |
| `abonados_listado.png` | Registro y tabla de clientes abonados. |
| `abonados_detalle_con_saldo.png` | Ficha detallada de un abonado mostrando saldo actual de cuenta corriente. |
| `abonados_modal_de_cobro.png` | Diálogo modal para cargar/cobrar saldo al abonado. |
| `settings_general.png` | Configuración de información general y datos de contacto. |
| `settings_horarios.png` | Configuración avanzada de horarios y días de apertura. |
| `settings_politicas_pin.png` | Configuración de políticas de cancelación y seguridad por PIN. |
| `staff_listado.png` | Listado del personal y asignación de roles. |
| `staff_invitacion_modal.png` | Diálogo modal para invitar a un nuevo miembro del equipo. |
| `reportes.png` | Reportes estadísticos y gráficos de rendimiento financiero y ocupación. |

---

### 4. Vistas del Jugador (`player/`)
Capturas del perfil y área de autogestión de turnos para los clientes finales (jugadores).

| Archivo | Descripción / Estado de la UI |
| :--- | :--- |
| `mis_reservas.png` | Listado de turnos activos e históricos reservados por el jugador. |
| `perfil.png` | Formulario de edición de datos personales del jugador. |
| `configuracion.png` | Ajustes de cuenta y preferencias visuales (modo oscuro/claro). |
| `eliminar_cuenta_confirmacion.png` | Diálogo modal de confirmación crítica para eliminar la cuenta. |

---

### 5. Estados Especiales y Cargas (`special_states/`)
Capturas de layouts de carga (skeletons), vistas vacías (empty states) y manejo de errores.

| Archivo | Descripción / Estado de la UI |
| :--- | :--- |
| `grilla_loading.png` | Skeleton de carga en streaming para la grilla de turnos. |
| `caja_loading.png` | Skeleton de carga en streaming para el registro de caja. |
| `dashboard_loading.png` | Skeleton de carga en streaming para los reportes de inicio. |
| `grilla_error.png` | UI de la frontera de error (`error.tsx`) mostrada al fallar la carga. |
| `grilla_vacio.png` | Estado vacío de la grilla de turnos (ej. día sin canchas o inactivo). |
| `caja_vacio.png` | Estado vacío del panel de caja (ej. día sin movimientos registrados). |
| `dashboard_vacio.png` | Estado vacío del tablero de control (ej. sin métricas para el periodo). |
| `canchas_vacio.png` | Pantalla de listado de canchas cuando no hay ninguna creada. |
| `abonados_vacio.png` | Pantalla de abonados cuando el listado de clientes está vacío. |
| `reportes_vacio.png` | Pantalla de estadísticas cuando no hay datos suficientes para graficar. |
| `reservas_vacio.png` | Pantalla del log de reservas cuando no hay registros creados. |
