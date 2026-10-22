# Export de datos del complejo — diseño

Feature #9 de la ola 2 (2026-10-22). Estado: **decisiones de §6 respondidas por Lazar el 2026-10-22**.

## 1. Por qué

La web comercial promete algo que el código no tiene. Verificado el 2026-10-22 en `src/app/(business)/precios/page.tsx`:

| Línea | Texto                                                                              |
| ----- | ---------------------------------------------------------------------------------- |
| 35    | "Tus datos exportables cuando quieras" (lista "Todo incluido")                     |
| 53    | "Mes a mes, sin permanencia. Si lo dejás, exportás tus datos y no pagás nada más." |
| 80    | FAQ: "Tus datos son tuyos y los exportás cuando quieras. […]"                      |
| 431   | "Sin tarjeta · Sin permanencia · Tus datos son tuyos"                              |

Los docs de GTM ya registran el hueco: `10-aprendizajes.md` (entrada del 2026-09-01, FACT, "no prometer export del complejo en pilotos"), `06-scripts.md:185` (kill list: "la función no existe") y `business-map-2026-09-01.md` §hallazgo 10. Hoy existen dos exports y ninguno cubre esto: el CSV de caja de `/analiticas` (`/api/reports/revenue`, mes a mes) y el export ARCO del jugador.

## 2. Qué

El dueño entra a **Ajustes → Tus datos** (`/settings/datos`) y descarga tres archivos CSV que abren en Excel y en Google Sheets:

1. **Reservas**: todas, de punta a punta del historial, incluidas las próximas.
2. **Turnos fijos**: todos los abonados, en cualquier estado.
3. **Clientes**: la misma lista de personas que `/jugadores`, con y sin cuenta.

La página además apunta a Métricas para los movimientos de caja, que ya se descargan ahí mes por mes. No hay selector de período: "nada de configurabilidad por las dudas" (CLAUDE.md §UX). Si alguien quiere solo un mes, filtra en la planilla.

### Columnas

**Reservas** (orden cronológico por `starts_at`):
N.° de reserva (`bookingCode`: los 8 primeros caracteres del id en mayúscula, el mismo código del comprobante del jugador, que la búsqueda de `/reservas` encuentra) · Fecha (día operativo) · Desde · Hasta · Cancha · Tipo (Online / WhatsApp / Panel / Turno fijo / Torneo / Bloqueo) · Estado · Cliente · Teléfono · Precio · Seña · Cobrado.

- Estado: el mismo badge del listado de `/reservas` (`bookingBadgeVisual`, de `slot-visual.ts`), así que distingue Señada y Abonado igual que el panel. Las dos cancelaciones salen "Cancelada"; si la seña volvió, se ve en Cobrado.
- Cliente: nombre del jugador, o `guest_name`, o el `contact_name` del fijo.
- Teléfono: `guest_phone`, o el del jugador, o el del fijo. Es el mismo `COALESCE` que la Agenda.
- Cobrado: `summarizeBookingCharges(...).totalPaid`, alimentado con `sumBookingChargesByBooking`. Son los mismos helpers que `/reservas`, así que el número coincide con la pantalla.
- **No va "Saldo"**. En una cancelada o un ausente, `precio − cobrado` se lee como deuda, y eso choca con el veto "No-show NO es deuda". Cobrado es un hecho, Saldo sería una interpretación.
- No van `notes_internal`, `notes_player` ni `canceled_reason`: son texto libre y pueden hablar de una persona (veto Ley 25.326).

**Turnos fijos**: Cliente · Teléfono · Día · Desde · Hasta · Cancha · Precio por turno · Forma de pago · Estado · Empieza · Termina.

**Clientes**: Nombre · Teléfono · Email (según la decisión 2) · Cuenta en TurnoGol (Sí/No) · Reservas · Ausencias · Última reserva · Turnos fijos · Etiquetas.

### Formato (es-AR)

- Separador `;`. Excel en es-AR toma `;` como separador de lista (la coma es el decimal), y con `,` abre todo en la columna A. Google Sheets detecta el `;` solo.
- UTF-8 **con BOM**: sin él, Excel rompe ñ y tildes.
- Montos en pesos, con coma decimal y sin separador de miles: 1.500.000 centavos salen `15000`, y 1.500.050 salen `15000,50`. Excel es-AR lo toma como número.
- Fechas ISO `AAAA-MM-DD`. Excel y Sheets las reconocen como fecha en cualquier configuración regional y las muestran en el formato local. Con `DD/MM/AAAA`, un Excel en inglés convierte el 05/10 en 10 de mayo sin avisar.
- Horas `HH:MM`. El `24:00` de los complejos que cierran pasada la medianoche sale `00:00`.
- Defensa anti fórmulas (`=`, `+`, `-`, `@`, tab o CR al inicio, la lista de OWASP): se reusa la de `toCsv`, extraída a una función compartida (`csvCell`) para no tener dos implementaciones. Efecto lateral en el CSV de caja: un valor con `\r` ahora va entre comillas, igual que uno con `\n`.

Lo que se ve raro en Excel y queda así a propósito:

- Un teléfono que arranca con `+` (`+54 9 11…`) sale con un `'` adelante: es la misma defensa anti fórmulas, y sacarla para teléfonos abriría la puerta que cierra.
- Un teléfono de solo dígitos largo (`5491123456789`) Excel lo muestra en notación científica; el dato está entero y Sheets lo muestra bien. Forzarlo a texto con `="…"` rompe Sheets y no es CSV.
- Excel deforma cerca del 4 % de los N.° de reserva: los que son todo dígitos (`00123456` pierde los ceros de adelante) y los que tienen forma de notación científica (`12E45678`). Es el mismo caso del teléfono y se resuelve igual: el formato no se toca, y Sheets los muestra tal cual.

## 3. Mecanismo: Server Action (decidido)

**Tres Server Actions** en `src/app/(admin)/settings/datos/actions.ts`, invocadas desde un botón cliente que arma el archivo con `Blob` (el patrón de `ExportCsvButton`).

Por qué Server Action:

- **Es una mutación**: cada descarga escribe una fila en `audit_logs` en la misma transacción que lee. Next 16 diseña las Server Functions para esto (`07-mutating-data.md`). Un GET con efecto lateral, en cambio, lo puede disparar un prefetch o un preview de link.
- Trae CSRF (chequeo de Origin) y el guard de rol del repo (`requireAdminStaffAction`), lo mismo que cualquier otra acción del panel.
- El guardrail del repo deja los Route Handlers para webhooks, `/api/public/*` y auth callbacks.

Descartado:

- **Extender `/api/reports/revenue`**: es un Route Handler de caja. Meterle reservas y clientes con un `?dataset=` mezcla dominios en una URL que se llama "revenue", y además es un GET.
- **Route Handler nuevo con streaming**: no tendría techo de tamaño, pero va contra el guardrail. No hace falta, por §4.

## 4. Volumen

- **Reservas: paginación keyset del lado del cliente.** Cada llamada trae hasta 2.000 reservas (unos 400 KB), ordenadas por `(starts_at, id)`, y devuelve el cursor de la siguiente. El botón llama en loop y muestra "Bajando… 4.000 reservas".
  - Cada respuesta queda muy lejos del techo de 4,5 MB de una función de Vercel, y cada query es acotada. Un complejo de 6 canchas lleno todo el año son unas 35.000 reservas: 18 llamadas.
  - Keyset y no OFFSET: el export no puede repetir ni saltear filas si entra una reserva a mitad de camino.
  - `sumBookingChargesByBooking` arma un `VALUES` con 2 parámetros por reserva. A 2.000 por página son 4.000 parámetros, lejos del techo de 65.535 de postgres-js.
  - El cursor es `(starts_at, id)` en ISO UTC con microsegundos: un cursor solo por instante pierde la segunda de dos reservas que empiezan a la misma hora en canchas distintas cuando el borde de página cae entre ellas (el test de integración lo arma a propósito).
  - Vuelve del cliente, así que se valida con zod (`datos.schema.ts`), que además descarta un día inexistente: `2026-02-31` pasa en JS y Postgres lo rechaza con una excepción.
  - No hay índice `(tenant_id, starts_at)`: el planner usa el de estado y ordena el top-N. Para un complejo son milisegundos; si algún día pesa, el índice es aditivo.
- **Turnos fijos**: `getAbonados(tenantId, {}, tx)` sin `limit`. Son decenas o pocos cientos.
- **Clientes**: se recorre `listTenantClients` página por página (50 por página) adentro de una sola transacción, hasta llegar al `total`. Se reusa sin modificarla. Copiar sus cinco CTEs sería drift seguro, y la sesión de clientes dormidos está tocando ese módulo. El costo es una query pesada por cada 50 personas: con 1.000 clientes, 20 queries en una sola acción.
  - Su paginación es OFFSET y cada página es una lectura aparte: si un cliente reserva a mitad del recorrido, sube a una página ya leída y esa vuelta no lo ve. El `total` de cada página lo delata, y se recorre de nuevo desde cero (hasta 3 vueltas; si no cierra, falla en vez de entregar un archivo con un cliente de menos o de más). Desde cero y no sumando: la clave de un contacto sin cuenta es su teléfono, y si se edita entre vueltas la clave vieja lo sacaría dos veces. Lo que no se detecta: que en el mismo recorrido se borre un cliente, que tapa la cuenta de uno salteado. Pasa solo con una anonimización justo en ese segundo.
- Rate limit: `adminRateLimited` (100 por minuto por tenant) en cada llamada. Un export grande consume 18.

## 5. Seguridad y auditoría

- Todo pasa por `withTenantContext` (RLS de `turnogol_app`), con `tenant_id` explícito en cada WHERE. No hay pool BYPASSRLS.
- `audit_logs`: action `tenant.data_exported`, resource `tenant/<id>` y metadata `{ dataset, rows }`, más el `cursor` del que salió cada página de reservas (`null` en la primera). Va una fila por llamada, en la misma tx que la lectura: si el audit falla, no sale el dato. `insertAuditLog` ya reatribuye la fila al super admin cuando hay impersonación.
- Lifecycle: el guard bloquea `suspended`, `blocked`, `churned` y `deleted`, igual que el layout del panel. Un `canceled` conserva el acceso hasta el fin del período pagado, así que "si lo dejás, exportás tus datos" se cumple: el dueño descarga antes de que venza. La decisión 3 cubre a los bloqueados.

## 6. Decisiones de Lazar (2026-10-22)

1. **Quién descarga: solo el dueño.** La página vive en Ajustes, que es solo admin por `settings/layout.tsx`, y cada acción usa además `requireAdminStaffAction`. El encargado no la ve.
2. **Qué datos del cliente salen: nombre, teléfono, email y etiquetas.** La política de privacidad (`/privacidad`) ya dice que el complejo "accede a tu nombre, email, teléfono e historial de reservas en ese complejo", y TurnoGol opera como encargado del tratamiento por cuenta del complejo. En reservas va nombre y teléfono. El email va en clientes, una sola vez por persona.
3. **Complejo bloqueado** (trial vencido sin pagar o mora): **por ahora no exporta.** Sin cambio de lifecycle. Si un piloto lo pide, se reabre como follow-up.

## 7. Fuera de alcance

- El CSV de caja de `/analiticas` tiene dos defectos que el diff no toca. Separa con `,`, así que en Excel es-AR abre todo en una columna. Y `monto_ars` sale en centavos (`report.service.ts:281`). Va como follow-up.
- Export de cantina, torneos y cierres de caja.
- Un export programado o por email.
- El costo del export de clientes (§4) crece con la cantidad: con ~5.000 clientes son 100 queries pesadas en una sola acción. Si un complejo se acerca a ese número, va como follow-up una lectura de una sola pasada sobre la misma definición de cliente.

## 8. Criterio de listo

- Spec aprobado y decisiones de §6 respondidas.
- Unit: formato es-AR, mapeo de filas, escape con `;` y anti fórmulas.
- Integración contra un Postgres descartable:
  - el keyset cubre todo sin duplicados;
  - otro tenant nunca aparece;
  - "Cobrado" coincide con `/reservas`;
  - el jugador con cuenta sale con su nombre y teléfono, y el anonimizado sin nada;
  - el `audit_logs` se escribe;
  - clientes recorre todas las páginas.
- Juez de cuatro pasos en verde.
- `verificacion-ux` en un puerto propio: descargar los tres archivos como dueño, y que el encargado no llegue.
