# Ajustes (/settings): diagnóstico, variantes y textos

> Refinamiento del panel (permitido desde el 2026-09-23), mismo método que Grilla, Hoy y Caja. Es sobre
> organización y textos, no sobre estilo. No cambian Server Actions, queries ni schema.
> Estado: **implementado** (2026-09-26). El dueño eligió **C · Portada**, aprobó la tabla de textos entera,
> los redirects de MercadoPago y los cambios de texto en Server Actions y mails (2026-09-25). Ver §9.
>
> Story temporal: `Temporal/Ajustes — variantes` (`src/app/(admin)/settings/AjustesVariantes.stories.tsx`).
> Capturas: `docs/rediseno-panel/capturas/2026-09-25-ajustes/` (1280×650 y 390, claro y oscuro).

## 1. Qué hay hoy y qué hace de verdad

"Mueve plata" quiere decir que cambiar la opción cambia cuánto o cuándo entra o sale plata. Todo lo
verificado contra el código, no contra los comentarios.

| Pestaña hoy | Opción | Qué hace de verdad | A quién afecta | ¿Mueve plata? |
|---|---|---|---|---|
| Perfil | Portada y logo | Imagen de arriba de la página pública y de la tarjeta en el buscador. No se valida un tamaño mínimo: se recorta y se sube (`shared/images/resize-image.ts`). | Jugador | No |
| Perfil | Teléfono y WhatsApp | En la cabecera de la página pública. WhatsApp vacío → el botón usa el teléfono (`whatsapp.ts`, `TenantHeader.tsx:96-125`). | Jugador | No |
| Perfil | Email del complejo | No está en la página pública. Va en el mail de cancelación y en el aviso de devolución de `/mis-reservas` (`booking.cancellation.ts:160-183`, `RefundContactPanel.tsx:65-70`). | Jugador con seña | No |
| Perfil | Dirección y punto en el mapa | Sin el punto no aparece en el mapa del buscador ni se calcula la distancia (`tenants/search.service.ts:164`). | Jugador | No |
| Perfil (plegado) | Resumen diario | A las 08:00, lo cobrado y la ocupación de AYER. Push a todo dispositivo del complejo con notificaciones prendidas; el email, si se elige, a hasta 5 del equipo, **encargado incluido** (`daily-summary.worker.ts:98-151`, `notification.service.ts:83-111`). | El equipo | No (informa) |
| Perfil (plegado) | Correo con el que entrás | Email de login, con confirmación por mail; hasta confirmar sigue el viejo. Si no hay otro email de pago cargado, **la cuota se cobra a este** (`perfil/actions.ts:335-390`). | Tu cuenta | Indirecto |
| Reservas | Reservas online | Apagado: la página pública muestra "Contactar" y `/reservar` se bloquea. Dueño **y encargado** siguen cargando desde la Grilla (`[slug]/reservar/page.tsx:54`, `(admin)/reservas/actions.ts:90`). | Jugador | No |
| Reservas | Seña sí/no y % (10 a 100) | Cuánto se cobra al reservar por internet. Sin MercadoPago conectado no se puede prender (form y action). | Jugador | **Sí** |
| Reservas | Anticipación para reservar (1 a 60 días) | Hasta qué día ve turnos el jugador. La carga manual no tiene tope (`availability-search.service.ts:363`). | Jugador | No |
| Reservas | Anticipación mínima para cancelar (0 a 72 h) | **No limita cuándo se cancela**: el jugador cancela hasta que termina el turno. Decide si la seña se devuelve (la devuelve el complejo; queda anotada en Caja › Cuentas) o queda para el complejo (`booking.cancellation.ts:225,243-265`). | Jugador y complejo | **Sí** |
| Reservas (plegado) | ¿Y si el jugador falta? | Informativo. Ausente con seña → la seña queda para el complejo; 2ª ausencia en 90 días → 14 días sin reservar online (`constants.ts:25,31`). | Jugador | **Sí** |
| Horarios | Horario general y excepciones | Página pública, Grilla y día operativo. Al guardar, completa precios vacíos de las canchas con la hora de al lado del mismo día (`horarios/actions.ts:52-111`). | Jugador y complejo | **Sí** (precios) |
| Horarios | Días cerrados | Ese día no se ofrecen turnos por internet. No cancela los ya cargados; la carga manual sigue abierta (`booking.service.ts:1081-1082`). | Jugador | No |
| Equipo | Invitar, rol, desactivar | Quién entra al panel y a qué. | Complejo | No |
| Facturación | Tu cuota | Canchas facturadas y ciclo. En prueba se aplica ya y sin cobro; activa, desde el próximo cobro; nunca cobra en el medio (`billing.service.ts:775-846`). | Tu cuenta con TurnoGol | **Sí** |
| Facturación | MercadoPago para cobrar señas | Conecta por OAuth la cuenta del complejo (Checkout Pro). **Es la plata de las señas, no la cuota.** | Cobrarle al jugador | **Sí** |
| Facturación (plegado) | Pagos de tu cuota | Historial leído en vivo de MercadoPago. | Tu cuenta | No |
| Facturación (plegado) | Cuenta con la que pagás TurnoGol | Email de MercadoPago al que se cobra la cuota (app de Suscripciones). | Tu cuenta | **Sí** |
| Facturación (plegado) | Cancelar suscripción | Cancela el cobro en MercadoPago, acceso hasta el fin de lo pagado, después bloqueo; datos 60 días. **No aparece en la prueba** (`cancelable-statuses.ts`). | Tu cuenta | **Sí** |
| Facturación (plegado) | Desconectar MercadoPago | Borra la conexión y **apaga la seña**; al reconectar la seña no se prende sola (`tenant.service.ts:418-446`, `callback/route.ts:288-289`). | Cobrarle al jugador | **Sí** |

`TenantContactForm` y `TenantLocationForm` ya no se muestran en ninguna pantalla: los reemplazó
`TenantProfileForm` y solo quedan sus stories. No se tocan en este refinamiento (borrarlos es otra decisión).

## 2. Confusiones, con evidencia

1. **Dos nombres para el mismo lugar.** El riel dice "Ajustes" (`admin-sidebar.tsx:137,503`), el cajón
   del celular dice "Configuración" (`:641`) y el nombre accesible del ítem del riel también es
   "Configuración" (`:495`): el rótulo que se ve no es el que lee un lector de pantalla (WCAG 2.5.3).
   Siete textos mandan a "Configuración → …", y dos de esos destinos ya no existen:
   "Configuración → Canchas" (`ReservasPolicyForm.tsx:161`) y "Configuración → Avisos" en el mail del
   resumen diario (`daily-summary.ts:28`).
2. **Se entra por la segunda pestaña.** El riel lleva a `/settings/reservas` (`admin-sidebar.tsx:122`)
   pero la primera pestaña es Perfil (`SettingsTabs.tsx:14`).
3. **Facturación mezcla dos circuitos de plata.** La cuota que se le paga a TurnoGol y el MercadoPago
   del complejo para cobrar señas están en la misma pantalla, y "Dar de baja" junta cancelar la
   suscripción con desconectar MercadoPago (`facturacion/page.tsx:386-403`). La pantalla llega a decir
   "Conectá MercadoPago para empezar a cobrar señas y activar tu cuota" (`:222`), y activar la cuota no
   necesita esa conexión (`subscribe`, `billing.service.ts:537`). La seña se prende en Reservas, pero lo que la
   habilita está en Facturación. En la prueba, ningún subagente esperaba MercadoPago para señas dentro
   de Facturación, y los dos fueron a buscar "Desconectar" a la tarjeta de MercadoPago cuando el botón
   está plegado adentro de "Dar de baja".
4. **Perfil mezcla lo público con lo privado.** El resumen diario y el email de login viven en Perfil,
   al lado de lo que ve el jugador (`perfil/page.tsx:102-149`). Hay tres emails distintos en dos
   pestañas: el de contacto, el de login y el de pago. En la prueba, "dejar de recibir el resumen" y
   "cambiar el email con el que entrás" quedaron en duda las dos veces.
5. **Textos que dicen algo que el sistema no hace** (detalle en la tabla del punto 6):
   "conserva la seña" (la devolución la hace el complejo), "Horas previas al turno permitidas para
   cancelar" (no limita), "solo vos podés cargar reservas" (también el encargado), "la perdés a favor
   del complejo" (la pierde el jugador), "cambios de plan con pago adicional" (no existen), "activar tu
   plan" (no hay planes), "Push al admin con PWA instalada" (le llega a todo el que tenga las
   notificaciones prendidas, y solo en iPhone hace falta instalar), "mínimo 1200 px" (no se valida).
6. **En la prueba gratis, "Dar de baja" se abre vacío.** Cancelar no existe en `trialing` y, sin
   MercadoPago conectado, tampoco hay "Desconectar"; el plegable igual se dibuja
   (`facturacion/page.tsx:186`).
7. **En el celular las pestañas no entran.** A 390 px se ven una pestaña y media; el resto queda a la
   derecha (captura `hoy-celular-claro.png`). El dueño usa el celular.

## 3. Todo lo que apunta a /settings

Inventario completo hecho por un subagente de solo lectura (`archivo:línea` de cada uno). Lo que importa
para mover cosas:

- **Entrada:** `CONFIG_ITEM.href = '/settings/reservas'` (riel y cajón). `/settings` es un redirect a
  Reservas; `/settings/avisos` redirige a Perfil; `/settings/canchas` a `/canchas`; `/staff` a Equipo.
- **MercadoPago del complejo:** `api/mp/oauth-start` (2 redirects) y `api/mp/callback` (12 redirects,
  el de éxito incluido) vuelven a `/settings/facturacion`, con `?error=` en los fallos; los mensajes
  de esos errores los arma `facturacion/page.tsx`. También apuntan ahí el checklist del Inicio
  ("Conectar MercadoPago") y el link de `ReservasPolicyForm`.
- **Cuota:** el ítem de prueba del riel ("Elegir plan"), 6 mails (pago fallido, suspendida, bloqueada,
  aviso de borrado, fin de prueba, prueba vencida) y el `returnUrl` de la suscripción van a
  `/settings/facturacion`. **Esa URL tiene que seguir siendo la de la cuota**: hay mails ya mandados.
- **Textos que nombran un lugar:** `roles.ts:37` (toast del encargado), `perfil/actions.ts:311,333`,
  `reservas/actions.ts:78`, `ReservasPolicyForm.tsx:161`, `daily-summary.ts:28`, `trial-welcome.ts:28`.
- **Tests que dependen de nombres o rutas:** `admin-routes-reachable.test.ts:131-152` (lista exacta del
  menú), `navigation-aria.test.tsx:116-148` (link "Configuración"), `settings-tabs-profile-gaps.test.tsx`
  (nombres de pestaña), `mp-oauth-state-csrf.test.ts:151`, `TG-HP-222` y `visual/screens.spec.ts`
  (título "Políticas de Reserva" y `nav` "Secciones de configuración"), `TG-HP-226` y `staff-crud`
  ("Agregar miembro del equipo", que no cambia).

## 4. Prueba "¿dónde lo buscarías?"

16 tareas reales del dueño (la 16 es de control: el precio del turno está en Canchas, fuera de Ajustes).
La corre un subagente Sonnet de contexto fresco por estructura, a ciegas: solo ve el menú y los nombres
de las pestañas (o de la portada), sin el contenido, y dice qué toca primero y si duda. Dos corridas
por estructura. Además dice qué espera encontrar en cada pestaña antes de abrirla.

1 porcentaje de seña · 2 dejar de cobrar seña · 3 desconectar MercadoPago · 4 cuánto pago por mes ·
5 teléfono que ve el jugador · 6 subir fotos · 7 sumar un encargado · 8 horario de un día · 9 darme de
baja · 10 cerrar un feriado · 11 que no reserven solos · 12 dejar de recibir el resumen · 13 cambiar el
email de entrada · 14 pagar con otra cuenta · 15 horas para cancelar · 16 precio del turno (control).

| Estructura | Primer clic correcto | Dudas | Dónde dudan (sin contar la de control) |
|---|---|---|---|
| **Hoy** (Perfil · Reservas · Horarios · Equipo · Facturación) | 30/32 | 13 | desconectar MP, darme de baja, feriado, que no reserven solos, resumen, email de entrada |
| A v1 (… · Equipo · **Tu cuenta**) | 31/32 | 14 | "Tu cuenta" esconde lo que se paga: cuota, baja, cuenta de pago |
| B v1 (seña aparte, … · **Tu cuenta**) | 31/32 | 16 | ídem |
| **A** (Reservas y seña · Horarios · Página pública · Vos y tu equipo · Suscripción) | **32/32** | 9 | desconectar MP, baja, feriado, resumen |
| **B** (Reservas · Seña · Horarios · Página pública · Vos y tu equipo · Suscripción) | **32/32** | 8 | desconectar MP, feriado, que no reserven solos, resumen |
| **C** (portada con cuatro grupos, sin pestañas) | **32/32** | **6** | desconectar MP, feriado, horas para cancelar |
| **Final, implementado** (C con los textos aprobados y dos líneas afinadas, ver §9) | **32/32** | **4** | feriado, horas para cancelar |

Con el contenido de cada pestaña a la vista, la estructura de hoy también da 16/16 en las pestañas: el
problema no es encontrar la pestaña sino lo que hay adentro (MercadoPago de señas dentro de Facturación,
el botón de desconectar escondido en "Dar de baja", lo privado en Perfil). Eso lo resuelven las tres
variantes por igual, porque las tres usan los mismos bloques.

"Cerrar un feriado" duda en todas: el nombre "Horarios" no dice "días cerrados"; adentro, el bloque sí.
No hace falta buscador: ninguna tarea quedó sin encontrar.

## 5. Variantes

Las tres usan **los mismos bloques y los mismos textos** (tabla del punto 6). Cambia dónde vive cada uno
y cómo se llega. Los bloques, agrupados por consecuencia:

- **Reservas por internet** (lo que el jugador puede hacer solo): reservar desde tu página, hasta
  cuántos días adelante, devolución de la seña si cancela, si el jugador falta.
- **Seña** (cobrarle al jugador) y **MercadoPago para cobrar la seña**: cuenta conectada, cuándo llega
  la plata, desconectar. Sale de Facturación y queda al lado de la seña que habilita.
- **Horario de la semana** y **Días cerrados**.
- **Fotos** y **Contacto y ubicación** (lo que ve el jugador).
- **Equipo** y **Tu usuario** (email para entrar y resumen diario): sale de Perfil.
- **Tu cuota**, **Cuenta de MercadoPago con la que pagás** y **Dar de baja TurnoGol** (lo que pagás a
  TurnoGol). Desconectar MercadoPago ya no está acá.

### A · Cinco pestañas

`Reservas y seña · Horarios · Página pública · Vos y tu equipo · Suscripción`. Se entra por la
primera. Mismas cinco URLs de hoy (`reservas`, `horarios`, `perfil`, `equipo`, `facturacion`).
Capturas: `a-cinco-pestanas-*.png`.

### B · La seña aparte

Igual que A, pero la seña y MercadoPago tienen pestaña propia: `Reservas · Seña · Horarios · …`. Necesita
una ruta nueva (`/settings/sena`) y deja Reservas con un solo bloque. Capturas: `b-sena-aparte-*.png`.

### C · Portada

`/settings` deja de ser un redirect y pasa a ser una portada con cuatro grupos: **Lo que ve el
jugador**, **Cobrarle al jugador**, **Lo que pagás a TurnoGol**, **Vos y tu equipo**. Cada renglón dice
qué hay y el valor de hoy ("Sí · 6 días", "30 %", "Conectado") y lleva a la misma página de A, que
arriba muestra "‹ Ajustes · Reservas y seña" en lugar de pestañas. El riel lleva a la portada. En el
celular es la única que muestra todo sin deslizar. Cuesta un toque más para llegar a cada cosa.
Capturas: `c-portada-*.png` y `c-portada-adentro-*.png`.

### Qué cambia en rutas y links, por variante

| | A | B | C |
|---|---|---|---|
| URLs de hoy | se quedan | se quedan | se quedan |
| Ruta nueva | — | `/settings/sena` | `/settings` pasa a ser la portada |
| Entrada del riel | igual | igual | `/settings` (cambia 1 test) |
| OAuth de MercadoPago (14 redirects en `api/mp/*`) | → `/settings/reservas` | → `/settings/sena` | → `/settings/reservas` |
| Checklist del Inicio y link de la seña | → `#mercado-pago` | → `/settings/sena` | → `#mercado-pago` |
| `/settings/avisos` (redirect viejo) | → `/settings/equipo` | → `/settings/equipo` | → `/settings/equipo` |
| Mails de cobro (`/settings/facturacion`) | siguen andando | siguen andando | siguen andando |

**Recomendación: C.** Es la única que muestra los cuatro grupos por consecuencia, que es lo que pediste,
la que mejor salió en la prueba (6 dudas contra 13 de hoy) y la única que en el celular no esconde
pestañas. Si el toque de más te molesta, A es la misma organización con pestañas.

## 6. Textos: actual → propuesto → qué lo respalda

⚠ = cambia el significado (lo que hoy dice no es lo que hace el código). El resto son cambios de nombre
o de orden. Los mensajes de error que viven en archivos de Server Actions o de mails cambian **solo el
texto**.

### Nombre del lugar y pestañas

| Dónde | Actual | Propuesto | Respaldo |
|---|---|---|---|
| Riel | "Ajustes" | "Ajustes" | Entra en 60 px (`admin-sidebar.tsx:132-137`). |
| Cajón del celular y nombre accesible del riel | "Configuración" | "Ajustes" | Un solo nombre; el accesible tiene que contener el visible (WCAG 2.5.3). |
| Candado del encargado | "Configuración: solo el dueño" · tooltip "Solo el dueño" | "Ajustes: solo el dueño" · igual | `settings/layout.tsx` (`requireAdminStaff`). |
| Toast del encargado que intenta entrar | "No tenés acceso a Configuración" / "Es solo del dueño del complejo." | "No tenés acceso a Ajustes" / igual | `roles.ts:37-38`. |
| Nombre accesible de las pestañas | "Secciones de configuración" | "Secciones de ajustes" | `SettingsTabs.tsx:57`. |
| Pestaña | Perfil | Página pública | Todo lo que queda adentro lo ve el jugador. |
| Pestaña | Reservas | Reservas y seña | Suma MercadoPago para cobrar la seña. |
| Pestaña | Equipo | Vos y tu equipo | Suma email para entrar y resumen diario. |
| Pestaña | Facturación | Suscripción | Queda solo lo que pagás a TurnoGol. "Facturación" hace pensar en facturas, que no hay (ADR-011). |
| Orden de pestañas | Perfil · Reservas · Horarios · Equipo · Facturación | Reservas y seña · Horarios · Página pública · Vos y tu equipo · Suscripción | La primera es por la que se entra. |

### Reservas y seña (`ReservasPolicyForm` + MercadoPago que viene de Facturación)

| Dónde | Actual | Propuesto | Respaldo |
|---|---|---|---|
| Título | "Políticas de Reserva" | Dos bloques: "Reservas por internet" y "Seña" | Agrupar por consecuencia. |
| Rótulo | "Reservas online" | "Reservar desde tu página" | |
| Opciones | "Habilitadas" / "Deshabilitadas" | "Sí" / "No" | |
| ⚠ Ayuda | "Permite que los jugadores reserven solos desde la página pública de tu complejo. Si las deshabilitás, solo vos podés cargar reservas desde el panel." | "Si decís que no, los turnos los cargan vos o el encargado desde la Grilla." | `createBookingAction` admite dueño y encargado (`(admin)/reservas/actions.ts:90`, `guards.ts:103-105`). |
| Opciones | "Requerir seña" / "Sin seña" | "Cobrar seña" / "Sin seña" | |
| Sin MercadoPago | "Para cobrar seña necesitás conectar MercadoPago. Conectar MercadoPago." (link a Facturación) | "Para cobrar seña, primero conectá MercadoPago acá abajo." (link a `#mercado-pago`) | La conexión pasa a esta pantalla. |
| Rótulo | "Porcentaje de seña (%)" | "Cuánto paga al reservar" | |
| Ayuda | "Entre 10% y 100%" · "En un turno de $X, el jugador paga $Y ahora y el resto en el complejo." | igual | `reservas/actions.ts` (rango 10-100). |
| Rótulo | "Anticipación para reservar" | "Hasta cuántos días adelante" | |
| Ayuda | "Cuántos días a futuro pueden ver y reservar los jugadores desde la página pública." + "El jugador ve turnos hasta el {fecha}. Vos podés cargar reservas más adelante desde la Grilla." | Solo la segunda. | `availability-search.service.ts:363`. |
| ⚠ Rótulo | "Anticipación mínima para cancelar" | "Devolución de la seña si cancela" | El plazo no limita cancelar: decide si se devuelve la seña (`booking.cancellation.ts:225,243-265`). |
| ⚠ Ayuda | "Horas previas al turno permitidas para cancelar" | (se saca) | Ídem. |
| Opción | "Sin límite" (0 h) | "Hasta que empieza" | Con 0 h, se devuelve si cancela antes del inicio (`:245`). |
| ⚠ Con seña | "Si cancela con más de X horas de anticipación, conserva la seña. Con menos, la seña queda para el complejo." | "Si cancela con más de X h, le devolvés la seña vos (te queda anotada en Caja › Cuentas). Con menos, queda para el complejo." | TurnoGol no reembolsa por API: se anota la devolución (`registerRefundDue`, `booking.cancellation.ts:97,260`) y se lista en Cuentas. |
| ⚠ Sin seña | "Puede cancelar hasta X horas antes del turno. Como no hay seña, no hay nada que retener." | "Sin seña no hay nada que devolver: este plazo no cambia nada." | El jugador cancela hasta que termina el turno (`booking.cancellation.ts:225`). |
| Título plegable | "¿Y si el jugador falta?" | "Si el jugador falta" | |
| ⚠ Texto | "Cuando marcás a un jugador como ausente, si había pagado seña la perdés a favor del complejo. La primera ausencia solo queda registrada. Si vuelve a faltar dentro de los 90 días, queda bloqueado para reservar online en tu complejo por 14 días. No requiere configuración." | "Si lo marcás como ausente y había pagado seña, la seña queda para el complejo. La primera vez solo queda anotado; si vuelve a faltar dentro de los 90 días, no puede reservar por internet en tu complejo por 14 días. No hay nada que configurar." | "La perdés" era el dueño; la pierde el jugador (`booking.service.ts:864-876`, `constants.ts:25,31`). |
| ⚠ Vista previa sin precios | "Cargá el precio de tus canchas en Configuración → Canchas para ver acá una vista previa con plata real." | "Cargá el precio de tus canchas en Canchas para ver acá un ejemplo con plata real." | Canchas salió de Configuración al menú el 2026-09-10 (`admin-sidebar.tsx:103-106`). |
| Vista previa | "Cancelación gratis hasta X h antes" | "Si cancela hasta X h antes, se le devuelve la seña" (sin seña: se saca) | Ídem fila de devolución. |
| Link nuevo | — | "Los precios de los turnos están en Canchas" | En la prueba, el precio del turno se buscó en Reservas en 3 de 12 corridas y dudaron en 9. |
| Guardado | "Políticas guardadas." | "Cambios guardados." | |
| Error de la action | "Para cobrar seña primero tenés que conectar MercadoPago en Configuración → Facturación. Hasta entonces, dejá la reserva en "Sin seña"." | "Para cobrar seña primero conectá MercadoPago, abajo en esta misma pantalla. Hasta entonces, dejá "Sin seña"." | Solo texto (`reservas/actions.ts:78`). |
| Título | "MercadoPago para cobrar señas" | "MercadoPago para cobrar la seña" | |
| Bajada nueva | — | "Donde te entra la plata de las señas. No es la cuenta con la que le pagás a TurnoGol." | Son dos apps distintas (CLAUDE.md, MercadoPago). |
| Conectado | "Cobrando en la cuenta {cuenta}. Si no es la del complejo, desconectala y conectá la correcta." | igual | `facturacion/page.tsx:287-300`. |
| Plazo | "Por defecto, Mercado Pago tarda 18 días en acreditarte la seña. Mirá cómo cambiarlo a al instante (2 min)." | "Por defecto, MercadoPago tarda 18 días en acreditarte cada seña. Mirá cómo cobrarla al instante (2 min)." | Medido en producción el 2026-08-19 (`facturacion/page.tsx:299-315`). Corrige "a al". |
| Sin conectar | "Conectá tu cuenta de MercadoPago para cobrar las señas de las reservas online directamente." | "Conectá la cuenta de MercadoPago del complejo para cobrar la seña de las reservas por internet." | |
| Botón | "Desconectar MercadoPago" (plegado adentro de "Dar de baja", en Facturación) | igual, dentro de este bloque, como botón secundario rojo | Sigue pasando por el diálogo de confirmación. |
| Consecuencia 1 | "Las reservas online dejan de cobrar por MercadoPago." | "Las reservas por internet dejan de cobrar seña." | |
| ⚠ Consecuencia 2 | "La seña se desactiva: las reservas pasan a ser sin seña hasta que vuelvas a conectar." | "La seña se apaga. Si después reconectás, la tenés que volver a prender acá." | Reconectar no toca `requires_deposit` (`callback/route.ts:288-289`). |
| Consecuencia 3 | "Las reservas ya cobradas y la plata que MercadoPago te tiene que liquidar no se tocan." | igual | `tenant.service.ts:418-446`. |

### Horarios

| Dónde | Actual | Propuesto | Respaldo |
|---|---|---|---|
| Título | "Horarios de apertura" | "Horario de la semana" | |
| Bajada nueva | — | "Lo que ve el jugador y las horas que muestra la Grilla." | |
| Rótulo | "Horario general" | "Todos los días" | `ScheduleFields` también es del alta: cambia ahí igual. |
| Rótulo | "Excepciones por día" | "Días con otro horario" | Ídem. |
| Días cerrados, bajada | "Bloqueá una fecha puntual (feriados, mantenimiento) sin tocar el horario semanal." | "Un feriado o un arreglo: ese día nadie reserva por internet. Los turnos ya cargados no se cancelan." | `booking.service.ts:1081-1082`; no cancela lo cargado. |
| Resto (guardar, precios completados, día agregado, quitado) | — | igual | `horarios/actions.ts:52-111`. |

### Página pública (hoy Perfil)

| Dónde | Actual | Propuesto | Respaldo |
|---|---|---|---|
| Aviso | "Tu perfil público está incompleto" | "A tu página pública le falta algo" | Mismo nombre que la pestaña. |
| Faltantes | "Tu perfil público arranca sin imagen." · "…sale sin tu logo." | "Tu página arranca sin imagen." · "Tu página sale sin tu logo." | `setup-gaps.ts:20-49`. |
| Título | "Perfil público" | "Fotos" | |
| Link | "Ver mi perfil público" | "Ver mi página" | |
| ⚠ Ayuda portada | "Foto ancha (JPG o PNG, mínimo 1200 px de ancho)" | "Foto ancha, va arriba de tu página. Se ve mejor con 1200 px de ancho o más." | No se valida un mínimo (`shared/images/resize-image.ts`). |
| ⚠ Ayuda logo | "Cuadrado (mínimo 200 × 200 px)" | "Cuadrado, va al lado del nombre del complejo." | Ídem. |
| Estado logo | "Cargada" | "Cargado" | |
| Título | "Datos del complejo" · "Contacto y ubicación que ven los jugadores en tu página pública." | "Contacto y ubicación" · "Cómo te encuentra y te escribe el jugador." | |
| Rótulo | "Email" | "Email de contacto" | Tres emails distintos en Ajustes: cada uno dice cuál es. |
| Ayuda nueva | — | "Se lo damos al jugador si cancela y le tenés que devolver la seña." | `booking.cancellation.ts:160-183`, `RefundContactPanel.tsx:65-70`. |
| Resto (teléfono, WhatsApp, dirección, mapa, guardar) | — | igual | |

### Vos y tu equipo (hoy Equipo, más lo privado que sale de Perfil)

| Dónde | Actual | Propuesto | Respaldo |
|---|---|---|---|
| Qué ve cada uno: dueño | "Todo el panel, incluida esta Configuración." | "Entra a todo, también a Ajustes." | |
| ⚠ Qué ve cada uno: encargado | "Opera el día a día. No toca precios ni configuración." | "Opera el día a día. No entra a Ajustes, Canchas ni Métricas." | El encargado sí pone precio a un evento; lo que no puede es entrar (`admin-sidebar.tsx:80-110`). |
| Lista de espacios | "Configuración" | "Ajustes" | `roles.ts:65`. |
| Descripción del rol (invitar) | "Acceso total, incluida la configuración del complejo." · "Hoy, grilla, reservas, caja, clientes y torneos. Sin acceso a configuración ni métricas." | "Entra a todo, también a Ajustes." · "Hoy, Grilla, Agenda, Caja, Clientes y Torneos. No entra a Ajustes, Canchas ni Métricas." | `roles.ts:22-24`; "Reservas" en pantalla es Agenda. |
| Bloque nuevo | — | "Tu usuario" · "Esto no lo ve el jugador." | |
| Título | "Correo con el que entrás" | "Email para entrar" | |
| Ayuda nueva | — | "Si no cargaste otra cuenta para pagar, la cuota se cobra a este email." | El default de pago es el email de login (`perfil/actions.ts:335-390`). |
| Resto (email actual, nuevo, "Actualizar email", mail de confirmación) | — | igual | |
| Error | "…cargalo en Configuración → Facturación, en "Cuenta de MercadoPago para pagar"." | "…cargalo en Ajustes → Suscripción, en "Cuenta de MercadoPago con la que pagás"." | Solo texto (`perfil/actions.ts:311`). |
| Error | "…lo tiene que cambiar el dueño desde su propia cuenta, en Configuración → Perfil." | "…en Ajustes → Vos y tu equipo." | Solo texto (`perfil/actions.ts:333`). |
| Título | "Resumen diario por email" (plegado) | "Resumen diario" | |
| ⚠ Ayuda | "Push al admin con PWA instalada, siempre activo. El email es opcional (opt-in)." | "A las 8, lo que entró ayer y cuánto se ocupó. Llega como notificación a quien las tenga prendidas; por email, a todo el equipo." | `daily-summary.worker.ts:98-151`; push a todas las suscripciones del complejo; email a hasta 5 del equipo. |
| Opciones | "Recibir por email" / "Solo push" | "También por email" / "Solo notificación" | |
| Guardado | "Avisos guardados." | "Guardado." | |
| ⚠ Mail del resumen | "Activaste este resumen en Configuración → Avisos. Podés desactivarlo cuando quieras." | "Lo activaste en Ajustes → Vos y tu equipo. Lo podés apagar cuando quieras." | Solo texto (`daily-summary.ts:28,32`). |

### Suscripción (hoy Facturación)

| Dónde | Actual | Propuesto | Respaldo |
|---|---|---|---|
| Tu cuota, stepper, desglose, mensajes | — | igual | Montos de `buildPriceBreakdown` (`pricing.ts`); frases verificadas (`billing.service.ts:775-846`). |
| ⚠ Sin suscripción | "Todavía no tenés una suscripción activa. Conectá MercadoPago para empezar a cobrar señas y activar tu cuota." | "No pudimos leer tu suscripción. Probá de nuevo en un rato o escribinos a {email de soporte}." | Solo pasa si falla la lectura de la suscripción (`facturacion/page.tsx:126-133`); la cuota no necesita MercadoPago del complejo. |
| ⚠ Historial | "Cobros mensuales o anuales del plan. Los cambios de plan con pago adicional se ven en el movimiento de esa fecha, no acá." | "Los cobros de tu cuota. Sumar o sacar canchas nunca genera un cobro aparte." | Precio por cancha: nunca prorratea (`api/billing/canchas/route.ts:32-34`). |
| Plegable | "Cuenta con la que pagás TurnoGol" | "Cuenta de MercadoPago con la que pagás" | Mismo nombre que el título de adentro. |
| Título de adentro | "Cuenta de MercadoPago para pagar" | "Cuenta de MercadoPago con la que pagás" | También en `/reactivar`. |
| ⚠ Guardado | "Guardado. Ya podés activar tu plan con esta cuenta." | "Guardado. Ya podés activar tu cuota con esta cuenta." | No hay planes desde el 2026-09-17. |
| Plegable | "Dar de baja" · "Cancelar tu suscripción o desconectar MercadoPago." | "Dar de baja TurnoGol" · "Qué pasa y hasta cuándo seguís." | Desconectar se va a Reservas y seña. |
| Título | "Cancelar suscripción" | "Dar de baja TurnoGol" | También en `/reactivar`. |
| Ayuda | "Podés cancelar cuando quieras. Vas a seguir operando con acceso completo hasta el fin del período que ya pagaste." | "Seguís usando todo hasta el {fecha}, cuando termina lo que ya pagaste. Después se cortan el panel y la reserva por internet, y guardamos tus datos 60 días por si volvés." | `billing.service.ts:889-900` cancela el cobro en MercadoPago. Hasta el fin del período el panel y la página siguen (`(admin)/layout.tsx:89-96`, `tenant.lifecycle.ts:48-53`); después el barrido diario pasa a `blocked` (`dunning-retry.worker.ts:101-106`): panel a `/suspended` y página cerrada. "60 días" es un piso a propósito: el borrado real es a los 97 y los términos prometen 90 (`CancelSubscriptionSection.tsx:51-58`). |
| Botón y confirmar | "Cancelar suscripción" | "Dar de baja" | |
| Diálogo | "¿Cancelar tu suscripción?" · "Vas a mantener el acceso hasta el X. Después tu cuenta se bloquea y tus datos se conservan 60 días para reactivar." | "¿Dar de baja TurnoGol?" · consecuencias en lista: "Dejamos de cobrarte la cuota." · "Seguís usando todo hasta el X, y tu página sigue tomando reservas." · "Después se cortan el panel y la reserva por internet." · "Guardamos tus datos 60 días por si volvés." | Mismo patrón que Desconectar (`ConfirmDialog` con `consequences`). El motivo sigue siendo obligatorio. |
| Toast | "Suscripción cancelada" · "Tenés acceso hasta el X." | "Te diste de baja" · "Seguís usando todo hasta el X." | |
| ⚠ En la prueba, sin cuota activada | (plegable vacío) | "Estás en la prueba gratis hasta el {fecha}. Si no activás la cuota, no se te cobra nada: ese día se cortan el panel y la reserva por internet." | `expire-trials.worker.ts:132-186` pasa a `blocked` sin cobro; `blocked` = panel a `/suspended` y página cerrada. |
| ⚠ En la prueba, con cuota activada | (plegable vacío) | "Para darte de baja antes del primer cobro, escribinos a {email de soporte}." | En `trialing` no se puede cancelar desde la app (`cancelable-statuses.ts`), y MercadoPago cobra el día que termina la prueba (`billing.service.ts:584`). |
| Trial del riel y mails | "Elegir plan" · "…en Configuración → Facturación." (`trial-welcome.ts:28`) | igual · "…en Ajustes → Suscripción." | El link sigue siendo `/settings/facturacion`. |

## 7. Encontrado de paso (fuera de este refinamiento)

- 🟡 **Desconectar MercadoPago con una seña en vuelo.** Si un jugador está pagando la seña y el dueño
  desconecta, el aviso de MercadoPago llega sin conexión y el handler tira `TenantMpNotConnectedError`
  (`mp-webhook.handler.ts:108-110`): el jugador pagó y la reserva puede no confirmarse. Es lógica, no texto.
- 🟡 **En la prueba con la cuota ya activada no hay forma de darse de baja desde la app** antes del primer
  cobro (`trialing` fuera de `CANCELABLE`). La tabla propone decirlo y mandar a soporte; arreglarlo es otra cosa.
- 🟡 **El resumen diario por email le llega también al encargado** (hasta 5 del equipo, sin filtro de rol)
  con la plata del día, mientras que Métricas es solo del dueño "porque es sensible" (2026-09-19).

## 8. Registro de delegaciones

| Para qué | Agente | Costo aprox. | Resultado |
|---|---|---|---|
| Inventario de todo lo que apunta a `/settings` | Sonnet, solo lectura | 189 k tokens | Punto 3 |
| Chequear 19 frases contra el código | Sonnet, solo lectura | 246 k tokens | 7 frases falsas o imprecisas; verificadas a mano las 4 de plata y baja |
| Qué pasa después de darse de baja o al terminar la prueba | Sonnet, solo lectura | 116 k tokens | Textos de baja y de prueba; "60 días" confirmado como piso a propósito |
| Prueba sobre lo implementado | 4 corridas Sonnet sin herramientas | ~93 k tokens c/u | §9: 32/32, 5 y 4 dudas |
| Prueba "¿dónde lo buscarías?" | 14 corridas Sonnet sin herramientas | ~90 k tokens c/u | Punto 4 |
| Actualizar tests, stories y e2e a la estructura nueva | Sonnet, implementa | 304 k tokens | 23 archivos; unit y stories en verde, knip con 2 restos |
| Revisión de contexto fresco: textos contra código, rutas, guard | Sonnet, solo lectura | 239 k tokens | Aprobado con reservas: 1 🟡 (resumen por email "a todo el equipo" cuando son hasta 5), corregido |

## 9. Implementación

**Estructura.** `/settings` es la portada (`SettingsIndex`, cuatro grupos con el valor de hoy de cada
renglón) y el riel entra ahí. Las cinco URLs de siempre son las páginas, cada una con "‹ Ajustes" y su
nombre en la barra (`SettingsHeader`); las pestañas (`SettingsTabs`) se borraron.

| Página | URL | Qué tiene ahora |
|---|---|---|
| Reservas y seña | `/settings/reservas` | Reservas por internet · Seña (`#sena`) · MercadoPago para cobrar la seña (`#mercado-pago`, vino de Facturación, con "Desconectar") |
| Horarios | `/settings/horarios` | Horario de la semana · Días cerrados |
| Página pública | `/settings/perfil` | Fotos · Contacto y ubicación |
| Vos y tu equipo | `/settings/equipo` | Qué ve cada persona · el equipo · Tu usuario (`#tu-usuario`: email para entrar y resumen diario, vinieron de Perfil) |
| Suscripción | `/settings/facturacion` | Tu cuota · Tu suscripción · Pagos · Cuenta de MercadoPago con la que pagás (`#cuenta-mp`) · Dar de baja TurnoGol (`#baja`) |

**Links.** `/api/mp/oauth-start` y `/api/mp/callback` vuelven a `/settings/reservas#mercado-pago` (con
`?error=` si falló; solo cambió la URL). El checklist del Inicio va a `#mercado-pago`. `/settings/avisos`
redirige a Equipo. `/settings/facturacion` sigue siendo la cuota: los mails ya mandados andan igual. El
Encargado rebota a la Grilla desde las seis rutas (probado en la app real: `/settings`, `reservas`,
`equipo`, `avisos` → `/grilla`, con el aviso "No tenés acceso a Ajustes" y el candado "Ajustes: solo el dueño").

**Diferencias con la tabla aprobada** (todas para no decir algo falso o por el celular):

- "Si no cargaste otra cuenta para pagar, la cuota se cobra a este email" sale **solo** cuando quien mira
  es el dueño y no hay otra cuenta cargada, y dice "Como no cargaste…": la cuota se cobra al email del
  dueño (`getBillingPayerEmail`), y otro administrador leería algo falso.
- "Desconectar MercadoPago" quedó al lado de la cuenta, pero **plegado**, con las consecuencias antes del
  botón y el diálogo de siempre: mismos pasos que antes, para que no quede más fácil de tocar sin querer.
- Con 0 horas ("Hasta que empieza") la consecuencia dice "Si cancela antes de que empiece el turno, le
  devolvés la seña vos (…). Si ya empezó, queda para el complejo." — misma regla, sin "más de 0 h".
- Ya dado de baja: "Te diste de baja: seguís usando todo hasta el X." (era "Suscripción cancelada —
  acceso hasta el X."). Mismo significado, mismas palabras que el aviso.
- Bajadas nuevas cortas bajo "Reservas por internet" y "Seña"; "Todos los días" lleva "Salvo los días con
  otro horario, abajo." (era "Vale para todos los días, salvo…", redundante con el título nuevo).
- Resumen diario: "por email, a hasta 5 personas del equipo" (la tabla decía "a todo el equipo"; el
  mail sale con `LIMIT 5`, como decía la columna de respaldo). Lo encontró la revisión final.
- "Configuración" → "Ajustes" también en el alta ("Todo se puede cambiar después desde Ajustes").
- En el teléfono, "Agregar miembro del equipo" baja al principio del contenido: en la barra tapaba el
  nombre de la página y el botón de tema. El nombre de la página ocupa hasta dos líneas.

**Prueba sobre lo implementado.** Cuatro corridas nuevas, a ciegas, con la portada tal como quedó (nombres y
línea de efecto de cada renglón). Las dos primeras: 32/32 y 5 dudas, casi todas en "cerrar un feriado" y
"horas para cancelar". Se afinaron esas dos líneas —Horarios: "A qué hora abrís cada día y los días que
cerrás."; Seña: "Cuánto paga al reservar y cuándo se le devuelve."— y las dos siguientes dieron 32/32 y
4 dudas, las mismas dos tareas: el feriado sigue dudando entre Horarios y la Grilla, y "horas para
cancelar" ahora cae en Seña, la sección donde está. Nadie terminó en un lugar equivocado.

**Capturas de la app real:** `capturas/2026-09-26-ajustes-final/` (1280×650 y 390×844, claro y oscuro;
también el aterrizaje de un error de OAuth y el rebote del encargado).
Suscripción no se pudo ver entera en local: la base local no tiene las migraciones 090 a 093 (`billed_courts`
no existe) y la página cae al error del panel — igual que en `main`: la lectura del email de pago no tolera
esa base vieja. Las piezas de la cuota se ven en sus stories.

**Stories nuevas.** `SettingsIndex` (portada completa y con la página pública incompleta) y
`MercadoPagoSenaSection` (conectado, desconectar abierto con y sin seña, sin conectar, cuenta de otro
complejo). Para poder escribir la segunda, `DisconnectMpSection` recibe la action por prop en vez de
importarla —mismo patrón que `MpPayerEmailSection`—; la story comprueba que abrir el diálogo no
desconecta nada.
