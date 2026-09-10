# Brief — auditoría de coherencia UX (panel admin + encargado)

**Fecha:** 2026-09-09 · **Diseño del método:** [`docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md`](../superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md)
**Estado:** este es el documento que lee primero cualquier agente de la auditoría. Si algo acá contradice al diseño, manda este archivo (se escribió después, midiendo el código).

---

## 0. Qué estás por hacer

Sos uno de varios evaluadores **independientes**. No vas a hablar con los otros: la independencia es
lo que hace que el conjunto encuentre más problemas que cualquiera solo. Trabajás con una **lente**
asignada (L1, L2, L3 o L4) sobre un pedazo del panel, y devolvés hallazgos estructurados.

Lo que buscamos no es "esta pantalla está fea". Es **incoherencia**: que la misma cosa se llame de
dos formas, que la misma acción se haga de dos maneras distintas según dónde estés, que una tarea se
corte a la mitad sin salida, o que la pantalla te muestre cinco cosas cuando necesitás una.

La frase del dueño que originó todo esto, después de una demo fallida a un lead (DEMO-3, 2026-09-08):
la app es *"incoherente, incómoda"*, *"parece improvisada"*, y tiene *"TANTO"* que le saca jugo.

**Regla dura de este trabajo: sin evidencia no hay hallazgo.** Cada uno lleva el texto exacto que
aparece en pantalla, o `archivo:línea`, o el nombre del screenshot. Un hallazgo sin eso se descarta
sin discutirlo.

---

## 1. Alcance de esta corrida

**Adentro:** las 29 pantallas reales del panel (route group `(admin)`), en los dos roles que las
usan — `admin` (Marcelo, el dueño) y `manager` (Rodrigo, el encargado) — en desktop y en teléfono.

**Afuera, decidido por el dueño el 2026-09-09** (§6 del diseño): el portal público y la app del
jugador. Tienen otra personalidad de diseño y van en una tercera corrida con su propia rúbrica. Si
encontrás algo del portal mientras mirás el panel, **anotalo igual** con `route` del portal: se
guarda para esa corrida, no se tira.

**Afuera también:** el tema oscuro. El corpus se generó solo en tema claro.

---

## 2. Las personas

### Las personas (doc3)

**Marcelo — Dueño del Complejo**
- Rol técnico en la app: `admin` (acceso total, incluida Configuración y gestión de Equipo) — `staff_role` solo tiene `admin`/`manager` (CLAUDE.md:67; doc3_personas_jtbd.md:34 lo describe como "Admin Principal (buyer)").
- Nivel de tecnología: 2.5/5 — usa WhatsApp e Instagram con fluidez, "nunca va a leer un manual", se frustra rápido si algo no es intuitivo, "tiene miedo a 'tocar algo y romper todo'" (doc3:46-52).
- Contexto físico real: en el complejo desde las 9hs, atiende el mostrador, a veces cocina para la cantina y supervisa al encargado; pico de consultas a las 11hs; cierra el mediodía a las 14hs y vuelve a las 17hs para el pico de la noche ("viernes=caos"); "los viernes a la noche tiene 6-8 turnos corridos. No puede parar"; termina el día a las 23-24hs (doc3:38-44).
- JTBD numerados (textuales, doc3:55-61):
  1. Organización: "Cuando estoy en el complejo un viernes a la noche con 3 personas esperando y el teléfono sonando, quiero confirmar y cobrar un turno en menos de 20 segundos desde el celu, para no hacer esperar a nadie y no cometer errores que después me cuesten plata."
  2. Protección económica: "Cuando un grupo reserva un turno de las 21hs y a las 20:30 me cancelan por WhatsApp, quiero que ya hayan pagado la seña online para no perder esa plata, porque ese horario ya no lo alquilo más."
- Frases textuales para escenarios (doc3:55-61,75):
  - "quiero confirmar y cobrar un turno en menos de 20 segundos desde el celu" (doc3:56)
  - "quiero que ya hayan pagado la seña online para no perder esa plata" (doc3:60)
  - "Voy a perder datos si el sistema falla" (doc3:75, miedo)

**Rodrigo — Encargado / Recepcionista**
- Rol técnico en la app: `manager` — acceso a grilla, reservas, caja y jugadores; **sin** Configuración ni gestión de Equipo; ve `/metricas` pero sin las métricas de sistema (CLAUDE.md:67). Doc3 lo describe como "Recepcionista / Staff User" (doc3:118).
- Nivel de tecnología: 4/5 — "digital nativo", aprende interfaces rápido, prefiere shortcuts y gestos a menús largos, le aburre lo repetitivo (doc3:128-132).
- Contexto físico real: llega a las 15hs o 17hs, "a veces está solo" (doc3:119); tiene el mostrador, el teléfono y el WhatsApp del complejo con personas esperando al mismo tiempo; horas pico —viernes especialmente— "muy estresante"; en horas tranquilas carga reservas del día siguiente y "anota en papel 'por las dudas'"; si tiene dudas y el dueño no atiende, improvisa (doc3:122-126).
- JTBD (doc3:135-137) — único primario, sin numerar en el doc:
  - "Cuando hay alguien en el mostrador esperando confirmar su turno y el teléfono suena al mismo tiempo, quiero ver de un vistazo si hay disponibilidad y confirmar en 15 segundos, para no hacer esperar a nadie y no equivocarme doblando una cancha."
- Frases textuales para escenarios (doc3:135-137,151-152):
  - "quiero ver de un vistazo si hay disponibilidad y confirmar en 15 segundos" (doc3:136)
  - "La pantalla se congela justo cuando estoy en el pico" (doc3:151, miedo)
  - "Le cargo mal el turno a alguien y hay quilombo" (doc3:152, miedo)

**Tomás — Jugador** (no entra en esta corrida de admin/encargado): jugador espontáneo, tech literacy 4/5, JTBD "encontrar una cancha libre en mi zona en ese horario y reservarla en 2 minutos desde el celu" (doc3:218-220); no usa el panel admin, solo la app B2C (doc3 mapa de personas, línea 261-269).

Escenario tipo que todo hallazgo tiene que poder completar: "Marcelo, viernes 23:15, fila en el mostrador, abre X y ..." / "Rodrigo, viernes 21:40, solo en el mostrador con el teléfono sonando, abre X y ...".


---

## 3. Las tareas, con su frecuencia

Salen de la **Recorrida del dueño** (artifact del 2026-09-08, 24 ítems). Son las tareas reales de un
complejo, en el orden en que se hacen, con la frecuencia con la que se hacen. La prioridad de un
hallazgo depende de en qué bloque cae: **un problema chico en el bloque A vale más que uno grande en
el bloque C.**

### Bloque A — el día a día (muchas veces por día)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| A1 | `/grilla` | Crear una reserva tocando una celda libre | Un toque abre un formulario corto (nombre y teléfono) con el precio ya resuelto por la franja. Se confirma y la celda pasa a ocupada al instante. El camino rápido tiene que alcanzar para el 90 % de las veces. |
| A2 | `/grilla` | Cobrarle a esa reserva | La celda ocupada abre un panel con tres números: precio, cobrado, pendiente. Un botón cobra. Si el turno ya terminó, el mismo botón cobra **y lo da por jugado**, en un paso. |
| A3 | `/grilla` | Cancelar esa reserva | Pide motivo y quién cancela, porque de eso depende la devolución de la seña. Si hay seña paga, avisa **antes** de confirmar. |
| A4 | `/grilla` | Bloquear una cancha por lluvia y después liberarla | Se libera desde el mismo lugar donde se bloqueó. (Era el peor hallazgo de DEMO-3; **ya arreglado** — verificá que siga arreglado, marcá REGRESIÓN si no.) |
| A5 | `/caja/cantina` | Vender dos gaseosas y un alfajor | Se arma el ticket, se cobra, **el stock baja solo** y la venta aparece en la caja del día. Se puede anotar como fiado. |
| A5b | `/caja` | Intentar vender lo mismo desde "Caja del día" | No debería existir un segundo camino que registre la venta sin tocar el stock. |
| A6 | `/caja` | Abrir la caja con fondo y cerrarla al final del día | Al cerrar muestra lo que **debería** haber, se cuenta, se registra la diferencia. Cerrado no se toca más. |

### Bloque B — la semana (una o dos veces por semana)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| B1 | `/abonados/nuevo` | Cargar un turno fijo de los martes 21 hs | Genera todos los martes hacia adelante y avisa **antes** si alguno choca con una reserva existente. |
| B2 | `/abonados` | Cancelar solo el martes que viene, sin romper la serie | Cancelar una fecha y cancelar la serie son dos acciones que no se pueden confundir. |
| B3 | `/caja/deudas` | Ver quién debe plata y cobrarle a uno | Lista con quién, cuánto, **de cuándo** ("hace 32 días") y de qué (turno, fiado, inscripción). Un botón cobra ahí mismo. |
| B4 | `/grilla` | Marcar a alguien como ausente y después cobrarle igual | Si debe plata, la celda lo dice **y deja cobrar desde ahí**. Un estado que alarma sin dejar actuar es un callejón. |
| B5 | `/caja/devoluciones` | Devolverle la seña a alguien que canceló | Lista de a quién se le debe y cuánto, con el contacto. Se devuelve por fuera y se marca "ya devolví". **TurnoGol no reembolsa por API** (MercadoPago da 403 con la cuenta del complejo): el sistema solo registra. |

### Bloque C — el mes y el arranque (una vez por mes o menos)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| C1 | `/caja/productos` | Cargar un producto nuevo y reponer stock | Lo primero que se ve es **el catálogo con sus botones**. El ranking y el historial van abajo o en otra pestaña. |
| C2 | `/settings/canchas` | Cambiarle el precio a una cancha para el turno noche | Franjas horarias con un precio por franja, en un solo lugar. Cambiar un precio no toca las reservas ya hechas. |
| C3 | `/settings/horarios` | Cambiar el horario de cierre, probando cierre pasada la medianoche | Si cierra a las 2 AM, el turno de la 1 AM del sábado aparece **dentro del sábado**. |
| C4 | `/settings/perfil` | Subir la portada y el logo, y ver dónde aparecen | Si se piden dos imágenes, las dos tienen que hacer algo visible que se pueda señalar. |
| C5 | `/settings/equipo` | Dar acceso a un encargado y ver qué ve él | Tiene que ser obvio qué permisos se están dando **antes** de invitar. |

### Bloque E — ocasional (cuando hace falta)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| E1 | `/analiticas` | Ver cómo viene el mes | Acá **sí** van los KPIs, gráficos y ranking: es la vista ocasional, la que se abre a propósito. |
| E2 | `/torneos` | Crear un torneo, asignarle horarios de cancha y después liberar uno | Al tocar esa hora en la grilla, tiene que decir **qué torneo la ocupa y cómo salir de ahí**, con link a la pantalla del torneo. Es lo que rompió la demo. |
| E3 | `/grilla` | Abrir la grilla en el celular y cargar una reserva | Tiene que servir para lo mismo que en la compu, con el pulgar. El dueño ya la marcó como *"ilegible e inmanejable"*. |
| E4 | `/reservas` | Filtrar las reservas de la cancha 3 | Se puede filtrar por cancha y ver de un saque qué tiene cada una hacia adelante. |

### Bloque D — fuera de esta corrida

D1, D2 y D3 son del portal del jugador. Van en la tercera corrida. Se listan acá solo para que
nadie los reporte creyendo que faltan.

---

## 4. Las 29 pantallas y su spec

### Las 29 pantallas del panel

Fuentes de nombre de menú: sidebar top-level en `src/components/layout/admin-sidebar.tsx` (`NAV_ITEMS` líneas 62-80, `CONFIG_ITEM` líneas 91-97) y las 5 tab bars por espacio — `GrillaTabs.tsx`, `caja/components/CajaTabs.tsx`, `jugadores/ClientesTabs.tsx`, `settings/SettingsTabs.tsx`, `torneos/[id]/TorneoTabs.tsx`. Fuente de rol: `src/modules/staff/guards.ts` (`requireAdminStaff` = solo admin, redirige; `requireOperatorStaff` = admin+manager) y cada `page.tsx` citado.

| # | Ruta | Nombre en el menú / pestaña | Spec | Rol que la ve |
|---|---|---|---|---|
| 1 | `/dashboard` | Hoy (`admin-sidebar.tsx:63`) | pages/dashboard.md §1 | admin — `dashboard/page.tsx:59` bloquea manager (`redirect('/grilla')`); no hay versión manager |
| 2 | `/grilla` | Grilla → Calendario (`GrillaTabs.tsx:4`) | pages/grilla.md §1 | admin+manager |
| 3 | `/reservas` | Grilla → Lista (`GrillaTabs.tsx:5`) | pages/reservas.md §3 | admin+manager |
| 4 | `/reservas/[id]` | "Detalle de la reserva" (h1 fijo, `reservas/[id]/page.tsx:55`; no tiene tab, se abre desde la fila de Lista) | pages/reservas.md §7 (ítem 2, nombra `[id]/page.tsx` explícitamente) | admin+manager |
| 5 | `/caja` | Caja → Caja del día (`CajaTabs.tsx:4`) | pages/caja.md §2 (Anatomía; §0-§9 completo describe solo esta pestaña, según §2.5) | admin+manager |
| 6 | `/caja/deudas` | Caja → Deudas (`CajaTabs.tsx:5`) | pages/caja.md §2.5 (resumen mínimo, no detalle línea a línea) | admin+manager |
| 7 | `/caja/devoluciones` | Caja → Devoluciones (`CajaTabs.tsx:9`) | pages/caja.md §2.5 | admin+manager |
| 8 | "El manager NO accede a Configuración" (CLAUDE.md) | La afirmación es **correcta**, pero por una razón distinta a la que parece: `settings/layout.tsx:10` llama `requireAdminStaff()` y cubre las 7 pestañas. El `requireOperatorStaff` de `settings/canchas/page.tsx:18` **nunca llega a correr**. Medido en el corpus: el manager pidiendo `/settings/canchas` termina en `/grilla` | El guard de la página es código muerto que promete un permiso que el layout niega. Es hallazgo por derecho propio: un lector del código concluye lo contrario de lo que hace la app |
| 9 | `/caja/productos` | Caja → Productos y stock (`CajaTabs.tsx:11`) | pages/caja.md §2.5 | admin+manager — alta/edición de catálogo restringida a admin vía `canEditCatalog={role==='admin'}` (`caja/productos/page.tsx:66`), la pantalla en sí no |
| 10 | `/jugadores` | Clientes → Personas (`ClientesTabs.tsx:4`) | **SIN SPEC** | admin+manager |
| 11 | `/jugadores/[playerId]` | Nombre del jugador (h1 dinámico, `jugadores/[playerId]/JugadorProfileView.tsx:100`; sin tab, se abre desde una fila de Personas) | **SIN SPEC** | admin+manager |
| 12 | `/abonados` | Clientes → Turnos fijos (`ClientesTabs.tsx:5`) | pages/abonados.md §0 | admin+manager |
| 13 | `/abonados/nuevo` | "Nuevo turno fijo" (h1 fijo, `abonados/nuevo/page.tsx:27`) | **SIN SPEC** — excluido a propósito: abonados.md §7 ítem 5 dice literal "`/abonados/nuevo` (wizard de alta) no se tocó" | admin+manager |
| 14 | `/torneos` | Torneos (`admin-sidebar.tsx:78`) | **SIN SPEC** | admin+manager — CTA "Nuevo torneo" oculto a manager (`torneos/page.tsx:37`), la lista no |
| 15 | `/torneos/nuevo` | "Nuevo torneo" (PageHeader, `torneos/nuevo/page.tsx:35`) | **SIN SPEC** | admin — `torneos/nuevo/page.tsx:22` bloquea manager (`redirect('/torneos')`) |
| 16 | `/torneos/[id]` | Torneo → Equipos y horarios (`TorneoTabs.tsx`) | **SIN SPEC** | admin+manager — publicar/borrar restringido a admin (`torneos/[id]/page.tsx:139,147`), la pantalla no |
| 17 | `/torneos/[id]/fixture` | Torneo → Fixture (`TorneoTabs.tsx`) | **SIN SPEC** | admin+manager |
| 18 | `/torneos/[id]/posiciones` | Torneo → Posiciones (`TorneoTabs.tsx`) | **SIN SPEC** | admin+manager — sembrar playoffs restringido a admin (`canSeed={role==='admin'}`, `torneos/[id]/posiciones/page.tsx:101`) |
| 19 | `/torneos/[id]/inscripciones` | Torneo → Inscripciones (`TorneoTabs.tsx`) | **SIN SPEC** | admin+manager |
| 20 | `/torneos/[id]/partidos/[matchId]` | Nombre de los dos equipos (PageHeader dinámico, `torneos/[id]/partidos/[matchId]/page.tsx:88`; sin tab, se abre desde Fixture) | **SIN SPEC** | admin+manager |
| 21 | `/analiticas` | Métricas (`admin-sidebar.tsx:79`) | **SIN SPEC** — pages/reportes.md está `[ARCHIVADO 2026-08-27]` y dice explícitamente "no describe la pantalla real tal cual está hoy... si hace falta un spec vivo de /analiticas, es tarea aparte" (reportes.md líneas 1-7) | admin+manager — panel "Estado del sistema" gateado aparte por `resolveSystemAdmin()` (super-admin de plataforma, no staffRole), `analiticas/page.tsx:80-81` |
| 22 | `/settings` | Configuración (raíz, sin pestaña propia) | **SIN SPEC** — ver nota | admin — es un redirect puro a `/settings/reservas` (`settings/page.tsx`), sin guard propio; hereda el admin-only del destino |
| 23 | `/settings/perfil` | Configuración → Perfil (`SettingsTabs.tsx:4`) | **SIN SPEC** | admin — `requireAdminStaff` (`settings/perfil/page.tsx:16`) |
| 24 | `/settings/reservas` | Configuración → Reservas (`SettingsTabs.tsx:5`) | **SIN SPEC** | admin — `requireAdminStaff` (`settings/reservas/page.tsx:7`) |
| 25 | `/settings/horarios` | Configuración → Horarios (`SettingsTabs.tsx:6`) | pages/horarios-precios.md §2 | admin — `requireAdminStaff` (`settings/horarios/page.tsx:11`) |
| 26 | `/settings/canchas` | Configuración → Canchas (`SettingsTabs.tsx:7`) | pages/canchas.md §0 (listado) + pages/horarios-precios.md §3 (form de precios, misma ruta) | admin+manager — ver nota, es la única pestaña de Configuración con `requireOperatorStaff` en vez de `requireAdminStaff` (`settings/canchas/page.tsx:18`) |
| 27 | `/settings/equipo` | Configuración → Equipo (`SettingsTabs.tsx:8`) | pages/staff.md §0 | admin — `requireAdminStaff` (`settings/equipo/page.tsx:13`) |
| 28 | `/settings/facturacion` | Configuración → Facturación (`SettingsTabs.tsx:9`) | **SIN SPEC** | admin — `requireAdminStaff` (`settings/facturacion/page.tsx:56`) |
| 29 | `/settings/avisos` | Configuración → Avisos (`SettingsTabs.tsx:10`) | **SIN SPEC** | admin — `requireAdminStaff` (`settings/avisos/page.tsx:7`) |

**Conteo: 13 con spec, 16 SIN SPEC (29 total).**


---

## 5. El Encargado (rol `manager`)

### El Encargado (rol manager)

`src/modules/staff/roles.ts:1-8` fija 2 roles cerrados: `admin` y `manager` ("Encargado: grilla, reservas y caja. Sin acceso a configuración", roles.ts:17). El guard que efectivamente se usa página por página es uno de tres (`src/modules/staff/guards.ts`):
- `requireOperatorStaff()` (guards.ts:103-105) — deja pasar `admin` + `manager`.
- `requireAdminStaff()` (guards.ts:133-151) — solo `admin`; al manager lo redirige a `/dashboard` (guards.ts:141).
- `requireAdminStaffAction()` (guards.ts:111-113) — versión Server Action del anterior; no redirige, devuelve `{ok:false, error}`.

#### 1. Las 29 pantallas reales (35 rutas del admin − 6 redirects de compat, `docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md:44`)

| Ruta | El manager |
|---|---|
| `/dashboard` ("Hoy") | **rebota** a `/grilla` — pasa el guard operator y lo bounce un `if (role !== 'admin')` explícito (`dashboard/page.tsx:49-59`) |
| `/grilla` | entra — `grilla/page.tsx:3,40` |
| `/reservas` (lista) | entra — `reservas/(list)/page.tsx:6,128` |
| `/reservas/[id]` | entra — `reservas/[id]/page.tsx:4,27` |
| `/caja` | entra — vía `requireCajaContext()` → `requireOperatorStaff()` (`(admin)/caja/queries.ts:20`) |
| `/caja/cantina` | entra — mismo `requireCajaContext` (`caja/cantina/page.tsx:16`) |
| `/caja/deudas` | entra — mismo `requireCajaContext` (`caja/deudas/page.tsx:23`) |
| `/caja/devoluciones` | entra — mismo `requireCajaContext` (`caja/devoluciones/page.tsx:24`) |
| `/caja/productos` | **entra con menos** — mismo guard, pero `canEditCatalog={role === 'admin'}` (`caja/productos/page.tsx:36,66`) |
| `/abonados` | entra — `abonados/page.tsx:5,24` |
| `/abonados/nuevo` | entra — `abonados/nuevo/page.tsx:4,11` |
| `/jugadores` | entra — `jugadores/page.tsx:2,19` |
| `/jugadores/[playerId]` | entra — `jugadores/[playerId]/page.tsx:2,23` |
| `/analiticas` | **entra con menos** — el panel "Estado del sistema" no depende de `role` sino de `resolveSystemAdmin()` (`analiticas/page.tsx:74,78-79,122`) — ver nota abajo |
| `/torneos` | **entra con menos** — sin botón "Nuevo torneo"; si está vacío, candado explicado (`torneos/page.tsx:18,37,55,70-77`) |
| `/torneos/nuevo` | **rebota** a `/torneos` (no a `/dashboard`, a propósito — `torneos/nuevo/page.tsx:12-22`) |
| `/torneos/[id]` (detalle) | **entra con menos** — `canPublish={role==='admin'}`, botón Borrar solo admin (`torneos/[id]/page.tsx:44,139,147`) |
| `/torneos/[id]/fixture` | entra — `torneos/[id]/fixture/page.tsx:5,22` |
| `/torneos/[id]/inscripciones` | entra — `torneos/[id]/inscripciones/page.tsx:5,20` |
| `/torneos/[id]/partidos/[matchId]` | entra — `torneos/[id]/partidos/[matchId]/page.tsx:5,30` |
| `/torneos/[id]/posiciones` | **entra con menos** — `canSeed={role==='admin'}` (`torneos/[id]/posiciones/page.tsx:35,101`) |
| `/settings` (índice) | **rebota** — `redirect('/settings/reservas')` sin ningún chequeo de auth propio (`settings/page.tsx:1-4`), y esa ruta a su vez lo rebota (ver fila siguiente) |
| `/settings/reservas` | **rebota** a `/dashboard` — `requireAdminStaff` (`settings/reservas/page.tsx:1,7`) |
| `/settings/avisos` | **rebota** a `/dashboard` — `settings/avisos/page.tsx:1,7` |
| `/settings/canchas` | **entra con menos** — `requireOperatorStaff`, no `requireAdminStaff` (`settings/canchas/page.tsx:2,18`); `isAdmin={role==='admin'}` (línea 35) |
| `/settings/equipo` | **rebota** a `/dashboard` — `settings/equipo/page.tsx:1,13` |
| `/settings/facturacion` | **rebota** a `/dashboard` — `settings/facturacion/page.tsx:2,56` |
| `/settings/horarios` | **rebota** a `/dashboard` — `settings/horarios/page.tsx:1,11` |
| `/settings/perfil` | **rebota** a `/dashboard` — `settings/perfil/page.tsx:1,16` |

29 filas. Quedan afuera (son los 6 redirects de compat que la spec resta): `/canchas`, `/deudas`, `/jugadores/deudas`, `/metricas`, `/reportes`, `/staff` — los seis son un `redirect()` sin lógica, sin guard propio.

#### 2. Qué pasa exactamente al chocar con una prohibida

**Server-side (URL directa o bookmark viejo)**: `requireAdminStaff()` no tiene mensaje — hace `redirect('/dashboard')` (`guards.ts:141`). Pero `/dashboard` a su vez es `requireOperatorStaff` + `if (role !== 'admin') redirect('/grilla')` (`dashboard/page.tsx:49-59`). Resultado: las 6 pantallas solo-admin de Configuración (`avisos`, `equipo`, `facturacion`, `horarios`, `perfil`, `reservas`) le hacen **doble rebote** al manager — page → `/dashboard` → `/grilla` — en dos requests/renders separados, no uno. `/settings` (el índice) le agrega un tercer hop porque su propio redirect no chequea nada (`settings/page.tsx:1-4`) antes de caer en `/settings/reservas`.

`/torneos/nuevo` es la única excepción documentada al patrón: en vez de `requireAdminStaff` usa `requireOperatorStaff` + rebote manual a `/torneos` (no a `/dashboard`) "para mantener el contexto del módulo" (`torneos/nuevo/page.tsx:12-22`) — un solo hop, no dos.

**En el menú lateral** (`src/components/layout/admin-sidebar.tsx`): dos tratamientos distintos, ambos deliberados:
- **"Hoy"** directamente **desaparece** del nav — `NAV_ITEMS` lo marca `requiresAdmin: true` (línea 63) y `visibleNavItems()` lo filtra (líneas 105-114). Es la única excepción escrita a la regla de abajo — MASTER §6.8 lo dice explícito: *"Excepción: Hoy sí se oculta para el manager, porque por D5 esa pantalla no existe para él; no es un permiso denegado sino una vista que no le corresponde"* (`docs/spec/design-system/MASTER.md:419`). El e2e lo prueba de punta a punta: `tests/e2e/hoy-screen.spec.ts:85-100` — login manager, `goto('/dashboard')`, `expect(page).toHaveURL(/\/grilla/)` + el link "Hoy" tiene `toHaveCount(0)`.
- **"Configuración"** en cambio se **muestra bloqueada**: un `<button aria-disabled>` con ícono `Lock` + `Tooltip` "Solo el dueño" (`admin-sidebar.tsx:256-277`), con el comentario in-line citando la misma regla: *"MASTER §6.8: al manager el ítem se le BLOQUEA, no se le esconde"* (línea 257).

El layout `(admin)/layout.tsx:89-111` resuelve `getStaffRole()` solo para pintar este chrome (`staffRole={staffRole ?? 'manager'}`, línea 111) — **no** es un punto de corte de acceso; el comentario de `analiticas/page.tsx:60-66` lo aclara explícitamente porque una versión vieja del comentario decía lo contrario ("iba detrás de un PinGate" que nunca existió).

#### 3. Server Actions negadas dentro de pantallas a las que el manager SÍ entra

| Pantalla (entra) | Action bloqueada | Guard | Cita |
|---|---|---|---|
| `/caja/productos` | `createProductAction`, `updateProductAction`, `deactivateProductAction` | `requireAdminStaffAction` | `caja/productos/actions.ts:70,88,111` |
| `/caja/productos` | `registerPurchaseAction`, `registerStockExitAction`, `adjustStockAction` — **estas SÍ las tiene** | `requireOperatorStaff` (comentario: "Stock (admin + manager — operativo día a día)") | `caja/productos/actions.ts:130,135,168,203` |
| `/torneos`, `/torneos/[id]` | `createTournamentAction`, `updateTournamentAction`, `deleteTournamentAction` | `requireAdminStaffAction` | `torneos/actions.ts:298,330,366` |
| `/torneos/[id]/posiciones` | `seedPlayoffsAction` (cerrar zonas y sortear cruces) | `requireAdminStaffAction` | `torneos/actions.ts:953` |
| `/torneos/[id]/*` — equipos, cupos, fixture, resultados, walkover, eventos, cobro de inscripción — **estas SÍ las tiene** | — | `requireOperatorStaff` (14 funciones, `torneos/actions.ts:400-989`, con comentario explícito en `saveMatchResultAction`: "El encargado carga resultados: requireOperatorStaff, no requireAdminStaff", línea 777) | |
| `/dashboard` | `markChecklistDismissedAction` | `requireAdminStaffAction` (`dashboard/actions.ts:91-95`) — pero es **moot**: el manager nunca llega a `/dashboard`, lo rebota el guard de la página antes | |

Todo lo demás que el manager puede pisar (`/abonados*`, `/jugadores*`, `/reservas*`, `/grilla`, `/caja` en sus 4 pestañas restantes, `/caja/devoluciones`) corre 100% en `requireOperatorStaff` — cero `requireAdminStaffAction` adentro (`abonados/actions.ts:35,76,102,139`; `jugadores/actions.ts:40,94,142,189,219,273`; `reservas/actions.ts` × 13 call-sites; `caja/devoluciones/actions.ts:41`).

`src/app/(admin)/settings/equipo/actions.ts` es un caso aparte: **no** pasa por ninguno de los dos guards centrales — tiene su propio `requireStaffTenant()` (solo sesión) + `assertActorIsAdmin()` dentro de la transacción (líneas 87-97, 141-157). Es defensa en profundidad redundante con el bloqueo de página (`requireAdminStaff` en `settings/equipo/page.tsx:1,13` ya le impide al manager llegar), no un camino real de exposición.

#### 4. Puntos calientes para la auditoría

1. **`/settings/canchas` contradice "el manager NO accede a Configuración"** — es la única de las 8 rutas de `/settings/*` en `requireOperatorStaff` en vez de `requireAdminStaff` (`settings/canchas/page.tsx:18`). El manager entra a una pantalla de Configuración de verdad, con `SettingsTabs` y todo, y ahí puede activar/desactivar una cancha (`toggleCourtStatusAction`, operator-level: `settings/canchas/actions.ts:183`) — una acción con impacto en la disponibilidad pública — mientras que crear/editar/subir fotos sigue admin-only (`createCourtAction`/`updateCourtAction`/`uploadCourtPhotoAction`/etc, `settings/canchas/actions.ts:37,116,274,333,376`). El ítem del sidebar que lleva ahí, sin embargo, está bloqueado con candado para el manager (`admin-sidebar.tsx:256-277`) — el mismo destino es "candado" desde el menú y "entra con menos" por URL directa.

2. **Dos tratamientos distintos para lo mismo, en el mismo repo, el mismo día**: `torneos/page.tsx` tiene el botón "Nuevo torneo" del header **oculto sin explicación** para el manager (`role === 'admin' ? <Link>... : undefined`, líneas 37-45) pero el mismo botón en el estado vacío ("Crear el primero") fue parchado para mostrarse **bloqueado con candado y `title`** en vez de desaparecer — el comentario lo dice textual: *"MEJORA-UX QA: para el manager, 'Crear el primero' quedaba habilitado y llevaba a un rebote silencioso server-side (el botón del header de arriba SÍ estaba bien condicionado)"* (`torneos/page.tsx:63-77`). O sea: ya encontraron y arreglaron este patrón una vez, en un solo botón de una sola pantalla, y lo dejaron sin arreglar en el botón hermano de la misma pantalla — y en `caja/productos/ProductsTable.tsx:115,133,295`, donde "Agregar producto"/"Cargar el primero"/"Editar" (`canEditCatalog && (...)`) desaparecen sin candado ni `title`, mismo patrón que el bug que ya repararon en Torneos. El propio checklist pre-delivery del design system lo prohíbe explícito: *"Ítems bloqueados por rol: candado + tooltip, no desaparición"* (`docs/spec/design-system/MASTER.md:613`).

3. **`/settings` (índice) no chequea nada** — `settings/page.tsx` es un `redirect()` sin `async`, sin `extractAuthUser`, sin nada (líneas 1-4); confía en que `/settings/reservas` lo va a filtrar después. Cualquier manager que entra por acá hace 3 saltos de red antes de aterrizar en `/grilla` (`/settings` → `/settings/reservas` → `/dashboard` → `/grilla`), contra 1 solo salto si entra por `/settings/canchas` (que sí lo deja pasar) o 2 si entra por cualquier otra subpágina de settings.

4. **"Estado del sistema" en `/analiticas` no es un candado de rol** — el comentario de la página lo llama "zona sensible" y el `canSeeSystem` que gatea el panel sale de `resolveSystemAdmin()` (JWT + fila en `system_admins` + allowlist), no de `role` (`analiticas/page.tsx:78-79,122`). Un `admin` de un complejo normal (no SuperAdmin de la plataforma) tampoco lo ve — así que "el manager ve /metricas pero sin las métricas de sistema" (CLAUDE.md) describe un efecto real pero la causa no es el rol de staff: es ortogonal. Vale la pena que la auditoría no lo registre como "candado de manager" — es otro sistema de permisos completamente distinto pisando la misma pantalla.


---

## 6. Las reglas propias — lo que la app se prometió a sí misma

Un hallazgo de tipo COHERENCIA **cita una de estas reglas**. Si no podés citar ninguna, tu hallazgo
es HEURISTICA (Nielsen) o no es un hallazgo.

### Reglas propias — MASTER.md

> Fuente única: `docs/spec/design-system/MASTER.md` (v2.1, 2026-07-03 — línea 19). Todas las citas de abajo son `MASTER.md:línea`. Precedencia: si existe `design-system/pages/[page].md` para la pantalla auditada, ese doc override-ea a MASTER en lo que defina (MASTER.md:3-5); para comportamiento (cómo se pide plata, confirma/deshace) manda `gramatica-interaccion.md`, no MASTER (MASTER.md:7-9).

#### §1 — Principios del sistema (no negociables)

| Regla (id corto) | Qué dice, condensado pero fiel | Cita |
| --- | --- | --- |
| P1-regla-oro | Ante una decisión de diseño: "¿de qué lado estoy?" (admin vs. jugador). Densidad ≠ ruido de un lado, frialdad ≠ eficiencia del otro. | MASTER.md:45-47 |
| P1-grilla-es-producto | Cualquier decisión que enlentezca leer/cargar una reserva es un bug de diseño, por linda que sea. | MASTER.md:51 |
| P1-tokens-antes-que-clases | Los primitives consumen tokens semánticos (`bg-card`, `text-foreground`), nunca colores crudos (`bg-white`, `text-slate-900`). Un primitive con `bg-white` hardcodeado nace roto en dark mode — es bug, no estilo. | MASTER.md:52 |
| P1-dark-light-first-class | Ninguna vista se diseña "para un tema y ya se verá". Light = elevación (sombras en capas); dark = glass (white-alpha + blur + glow). Glass en light está prohibido (lee barroso). | MASTER.md:53 |
| P1-color-mas-icono-texto | Nada comunica solo con color. Todo estado lleva color + ícono y/o texto (daltonismo ~8% de varones, base mayormente masculina). | MASTER.md:54 |
| P1-guided-ux-en-contexto | Cero manuales: estados vacíos didácticos, coachmarks de primera vez, tooltips en iconografía. El sistema enseña jugando, no con un tutorial aparte. | MASTER.md:55 |
| P1-es-ar-en-serio | Voseo, plata con puntos de miles, fechas en castellano, cero anglicismos de dashboard. Un "Revenue hoy" rompe más confianza que un bug. | MASTER.md:56 |

#### §8.5 — Vocabulario canónico de estados (transcripción completa: estado → palabra única)

| Regla (id corto) | Qué dice, condensado pero fiel | Cita |
| --- | --- | --- |
| VOC-pending_payment | `pending_payment` se dice **"Esperando seña"** en toda la UI (admin y player), un solo término. | MASTER.md:511-516 |
| VOC-confirmed | `confirmed` se dice **"Confirmada"**. | MASTER.md:511-516 |
| VOC-completed | `completed` se dice **"Jugada"** (no "Completada", no "Pagada"). | MASTER.md:511-516 |
| VOC-no_show | `no_show` se dice **"Ausente"** en UI (el término técnico `no_show` vive solo en código/docs, nunca en pantalla). | MASTER.md:511-516; anglicismo también vetado en MASTER.md:474 |
| VOC-canceled_* | Cualquier `canceled_*` (`canceled_refunded`, `canceled_no_refund`) se dice **"Cancelada"** sin distinguir el sufijo en UI. | MASTER.md:511-516 |
| VOC-court-offline | El estado de cancha `offline` se dice **"Pausada"**. | MASTER.md:511-516 |
| VOC-un-termino-por-estado | Regla marco: un término por estado en TODA la app — admin y player tienen que decir lo mismo para que se entiendan por teléfono. | MASTER.md:515-516 |

Nota: en el doc esta tabla está escrita como texto corrido (no como tabla markdown); la transcribí a filas individuales para que cada hallazgo pueda citar el par estado→palabra exacto.

#### §9 — Leyes de psicología como reglas duras

| Regla (id corto) | Qué dice, condensado pero fiel | Cita |
| --- | --- | --- |
| LEY-hick | Máx. 5-7 opciones simultáneas de igual jerarquía; el resto se pliega. Ej: day-picker de 7 días no un mes; Caja usa 1 botón "Agregar movimiento" que abre tipo/categoría, no 6 botones sueltos. | MASTER.md:526 |
| LEY-fitts | Blanco grande y cerca = rápido. Acción primaria mobile full-width en zona del pulgar; en listas, la fila entera es el blanco clickeable, no un botoncito interno. | MASTER.md:527 |
| LEY-von-restorff | Un (1) elemento distinto por vista; el estado que exige acción es el distinto. En la grilla, "Esperando seña" (warning) es lo único que debe saltar. | MASTER.md:528 |
| LEY-miller-chunking | Memoria de trabajo ≈ 4±: info en grupos de 3-4. Detalle de reserva: QUIÉN/CUÁNDO/PLATA en 3 bloques; onboarding 4 pasos, no 12 campos sueltos. | MASTER.md:529 |
| LEY-jakob | La gente vive en otras apps: patrones ecommerce conocidos en el player (checkout = resumen + método + CTA único), patrones de agenda/caja conocidos en admin. | MASTER.md:530 |
| LEY-goal-gradient | Todo proceso multi-paso muestra progreso con arranque regalado (nunca 0%). Checklist de setup arranca en 57%, onboarding "Paso 1 de 4 · 25%". | MASTER.md:531 |
| LEY-zeigarnik | Lo pendiente deja marca visible y clickeable: badge numérico de pendientes de seña en el sidebar, checklist visible hasta 7/7. | MASTER.md:532 |
| LEY-peak-end | Se recuerda el pico y el final: invertir diseño/motion ahí. Pico jugador = "¡Reserva confirmada!" con celebración; cierre admin = "Cerrar caja" termina en resumen verde, no en form mudo. | MASTER.md:533 |
| LEY-aversion-perdida | Mostrar lo que se pierde con máxima crudeza, dato real de DB. "Quedan 2 horarios esta noche"; cancelación: "Perdés la seña de $ 5.000" antes de confirmar. | MASTER.md:534 |
| LEY-prueba-social | Protagonista y repetida; todo número tiene que aguantar verificación. Rating + "+120 reservas este mes" (calculado), badge "Popular" con >60% ocupación real. | MASTER.md:535 |
| LEY-fomo-escasez | El inventario limitado se muestra a fondo, siempre calculado de datos reales (nunca inventado). "Últimos 2" con tinte warning, "Agotado" visible nunca escondido. | MASTER.md:536 |
| LEY-anclaje-precio | Referencia mayor real para que el precio actual se sienta oportunidad. "Desde $ 8.000" (precio real más bajo); seña como fracción visible "Señá solo $ 3.000 (de $ 12.000)". | MASTER.md:537 |
| LEY-compromiso-progresivo | Cada paso invertido sube el costo de abandonar. Login llega DESPUÉS de elegir turno (LoginGate); el precio se muestra siempre desde la grilla, el compromiso se construye con pasos, nunca ocultando costo. | MASTER.md:538 |
| LEY-serial-position | Primero y último se recuerdan: nav ordenada por frecuencia, lo crítico primero o al final, nunca en el medio. Sidebar: Grilla arriba, Configuración al final; en modales, CTA primario siempre abajo-derecha. | MASTER.md:539 |
| LEY-clausula-agresividad-comercial | Reemplaza la cláusula ética v2.0. En el jugador todo vale (urgencia, FOMO, anclas, defaults pro-conversión) salvo UNA restricción dura: **ningún claim verificable puede ser falso** (contador que no baja, "+10.000 reservas" desmentible) — es publicidad engañosa bajo Ley 24.240/Decreto 274/2019. Puffery no verificable es libre. | MASTER.md:541-552 |

#### §11 — Anti-patterns (lista completa)

| Regla (id corto) | Qué dice, condensado pero fiel | Cita |
| --- | --- | --- |
| AP-01-emoji-icono | ❌ Emoji como ícono estructural → ✅ Lucide. | MASTER.md:574 |
| AP-02-hex-en-primitives | ❌ Hex/clases de color crudas en primitives (`bg-white`, `border-slate-200`) → ✅ tokens semánticos (§6.1). | MASTER.md:575 |
| AP-03-emerald600-texto | ❌ `text-emerald-600` para texto normal sobre claro (3,8:1, falla AA) → ✅ `text-emerald-700` en cards / `-800` en fondo de página (§2.4). | MASTER.md:576 |
| AP-04-cta-emerald600-blanco | ❌ CTA `bg-emerald-600` + blanco 14px → ✅ light `bg-emerald-700`+blanco · dark `bg-emerald-500`+slate-950. | MASTER.md:577 |
| AP-05-emerald500-texto | ❌ `emerald-500` como texto (2,5:1) → ✅ solo acentos no-textuales (glows, bordes). | MASTER.md:578 |
| AP-06-placeholder-como-label | ❌ Placeholder como label / placeholder que trunca → ✅ label visible + ejemplo que cabe. | MASTER.md:579 |
| AP-07-icon-only-sin-tooltip | ❌ Icon-only sin tooltip ni `aria-label` → ✅ ver §7.4. | MASTER.md:580 |
| AP-08-iso-dates-revenue | ❌ ISO dates / "Revenue" / 3 formatos de plata en el mismo flujo → ✅ §8 completo. | MASTER.md:581 |
| AP-09-glass-en-light | ❌ Glass/translucidez en light → ✅ light = elevación; glass solo dark (§4.3). | MASTER.md:582 |
| AP-10-neutralizar-color-dark | ❌ Neutralizar color semántico en dark (finanzas, estados) → ✅ preservar hue con par `dark:` o token dual. | MASTER.md:583 |
| AP-11-hex-en-charts | ❌ Hex inline en charts (no flipan con `.dark`) → ✅ `useChartTheme` / CSS vars. | MASTER.md:584 |
| AP-12-tour-modal-bienvenida | ❌ Tour modal de bienvenida multi-paso → ✅ Guided UX en contexto (§7). | MASTER.md:585 |
| AP-13-toast-mudo | ❌ Toast "1 error" / errores mudos → ✅ qué falló + qué hacer (§6.7). | MASTER.md:586 |
| AP-14-claims-falsos | ❌ Claims verificables falsos (contadores truchos, urgencia que se resetea) → ✅ agresividad total sí, mentira comprobable no (cláusula §9). | MASTER.md:587 |
| AP-15-animacion-decorativa-tarea | ❌ Animación decorativa en vistas de tarea → ✅ presupuesto §5.2. | MASTER.md:588 |
| AP-16-bg-white-pagina | ❌ `bg-white` como fondo de página → ✅ `bg-background` (el fondo NO es blanco en ningún tema). | MASTER.md:589 |
| AP-17-text-black-bg-black | ❌ `text-black` / `bg-black` → ✅ tokens (`foreground`, `slate-950` vía token). | MASTER.md:590 |
| AP-18-kpi-formato-propio | ❌ KPIs con formato propio por vista → ✅ `StatCard` único (§6.4). | MASTER.md:591 |

#### §12 — Checklist pre-delivery

| Regla (id corto) | Qué dice, condensado pero fiel | Cita |
| --- | --- | --- |
| CHK-ambos-lados | Colores solo vía tokens (cero hex en JSX) · probado en light Y dark con toggle real · contraste verificado contra §2.4 (no "a ojo") · `tabular-nums` en todo número, plata/fechas por helpers §8 · labels visibles, errores debajo del campo, `isLoading` en async · focus ring visible, touch 44px, sin scroll horizontal a 375px · estados loading/empty/error completos (skeleton con silueta, empty didáctico, error accionable) · `prefers-reduced-motion` no rompe nada · copy en voseo, vocabulario §8.5, cero anglicismos §8.1. | MASTER.md:599-607 |
| CHK-admin | Tarea principal de la vista completable en ≤3 interacciones desde el load · densidad respetada (sin aire decorativo en tablas/grilla) · ítems bloqueados por rol muestran candado+tooltip, nunca desaparecen · KPI = `StatCard`, cabecera = `PageHeader` · motion ≤200ms. | MASTER.md:611-615 |
| CHK-jugador | Una idea por pantalla, CTA primario único full-width en mobile · precio y estado de seña visibles ANTES del CTA de pago (cero sorpresas) · microcopy de confianza en pasos de plata · continuidad post-acción (nunca pantalla huérfana) · peak-end: confirmaciones con momento de celebración, una vez. | MASTER.md:619-623 |

#### §13 — Estado del sistema: deuda conocida (no son "reglas", son ítems ya registrados — ver nota)

| Regla (id corto) | Qué dice, condensado pero fiel | Cita |
| --- | --- | --- |
| DEUDA-P0-2-formato-inconsistente | [ABIERTO, parcial] Formato de plata/fecha inconsistente en el mismo flujo (histórico: `$ 100`/`$50,00`/`$ 100,00`, `Caja — 2026-07-01` en ISO). El dashboard ya migró a `formatArs`/`lib/format` (2026-07-02) y "Revenue hoy" murió; el ítem sigue listado como P0 sin marca de cierre explícita — verificar cobertura restante antes de reportarlo como hallazgo nuevo. | MASTER.md:634 |
| DEUDA-P1-3-reportes-statcard | [ABIERTO] Reportes usa KPIs con formato propio (no `StatCard`) y vacío gigante sin empty state didáctico ni ejemplo espectral. No reportar esto como hallazgo nuevo: ya está en el ledger. | MASTER.md:638 |
| DEUDA-P1-4-tema-journey | [CERRADO] Coherencia de journey de tema quedó RESUELTA (2026-07-03): público+landing+checkout theme-adaptive; siempre-dark queda confirmado solo para `para-complejos` (marketing B2B). No re-flaguear. | MASTER.md:639 |
| DEUDA-P2-7-landing-numeros | [ABIERTO] Números de prueba social de la landing ("+10.000 reservas", "+1.200 turnos libres hoy", "50+ complejos") son claims verificables sin respaldo bajo la cláusula §9 v2.1 — pendiente calcularlos de datos reales o reformular como puffery no cuantificado. | MASTER.md:643-645 |
| DEUDA-P2-8-telefonos-sin-formato | [ABIERTO] Teléfonos sin formato (`+541100000000`) en página de complejo, viola §8.4. | MASTER.md:646 |
| DEUDA-P2-9-foto-stock-trademark | [ABIERTO] Foto stock del login staff con marca visible (pelotas Nike) — pendiente reemplazo. | MASTER.md:647 |
| DEUDA-P2-10-docs-desactualizadas | [ABIERTO] `doc20`/`pages/*` con referencias cruzadas desactualizadas a esta v2. | MASTER.md:648 |
| DEUDA-P0-1-primitives-CERRADO | [CERRADO, verificado 2026-08-15] Primitives sin tokens: `grep -E "(bg|text|border)-(white|black|gray|slate|zinc|neutral|stone)-" src/components/ui/*.tsx` ya no devuelve hits sin par `dark:` salvo 2 deliberados (`image-uploader.tsx`, `stepper.tsx` tone on-dark). No re-flaguear como P0 genérico. | MASTER.md:650-656 |

**Nota sobre §13:** no es un set de reglas prescriptivas como §1/§9/§11 — es un ledger vivo de deuda ya conocida por severidad (P0/P1/P2), con ítems que se tachan cuando se cierran (instrucción del propio doc: "Al cerrar un ítem, borrarlo de acá", MASTER.md:630-631). Su valor para el agente buscador es negativo: sirve para NO reportar como hallazgo nuevo algo que el propio design system ya tiene anotado como deuda conocida o ya cerrado — no para citarlo como norma que algo "debe" cumplir.

#### Bonus — otras reglas explícitamente marcadas "regla dura" fuera del mínimo pedido (alto valor para el barrido admin)

| Regla (id corto) | Qué dice, condensado pero fiel | Cita |
| --- | --- | --- |
| BONUS-24-arquitectura-color | 3 capas obligatorias: primitivas Tailwind → tokens semánticos → recetas de componente. Prohibido hex inline en JSX; prohibido `dark:` suelto "para arreglar" un primitive (se arregla el token). | MASTER.md:62-74 |
| BONUS-24-contraste-reglas-duras | Reglas duras de contraste (§2.4): texto/link emerald light = `text-emerald-700` en cards / `text-emerald-800` en fondo de página, dark = `text-emerald-400`. CTA primario sólido: light `bg-emerald-700 hover:bg-emerald-600 text-white`; dark `bg-emerald-500 hover:bg-emerald-400 text-slate-950`. Warning con fondo sólido: texto `amber-950`, nunca blanco. | MASTER.md:136-141 |
| BONUS-31-campos-input-16px | Regla dura: todo `input`/`textarea`/`select`/`[contenteditable]` (y el input interno de `Combobox`/`PhoneInput`) renderiza ≥16px hasta `md` (768px). Receta canónica `text-base md:text-sm`. Prohibido `text-sm`/`text-xs`/`text-[15px]` sin cascada `md:` que lo suba. Sin escape hatch hacia abajo. | MASTER.md:209-217 |
| BONUS-61-primitives-p0 | "P0 del sistema": todo componente de `src/components/ui/` usa exclusivamente tokens semánticos. Migración progresiva obligatoria cada vez que se toca un primitive (tabla de mapeo hardcodeado→token). | MASTER.md:329-345 |
| BONUS-81-anglicismos-prohibidos | Anglicismos prohibidos en UI: Revenue→Ingresos, Dashboard→Inicio, Booking→Reserva, Balance→Saldo, No-show→Ausente (en UI; término técnico solo en código/docs). Excepciones de marca: MercadoPago, email, link, online. | MASTER.md:474 |
| BONUS-82-formato-plata | Helper único `formatArs`. Formato único en toda la app: `$ 12.500` sin decimales, miles con punto, espacio fino tras `# Brief — auditoría de coherencia UX (panel admin + encargado)

**Fecha:** 2026-09-09 · **Diseño del método:** [`docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md`](../superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md)
**Estado:** este es el documento que lee primero cualquier agente de la auditoría. Si algo acá contradice al diseño, manda este archivo (se escribió después, midiendo el código).

---

## 0. Qué estás por hacer

Sos uno de varios evaluadores **independientes**. No vas a hablar con los otros: la independencia es
lo que hace que el conjunto encuentre más problemas que cualquiera solo. Trabajás con una **lente**
asignada (L1, L2, L3 o L4) sobre un pedazo del panel, y devolvés hallazgos estructurados.

Lo que buscamos no es "esta pantalla está fea". Es **incoherencia**: que la misma cosa se llame de
dos formas, que la misma acción se haga de dos maneras distintas según dónde estés, que una tarea se
corte a la mitad sin salida, o que la pantalla te muestre cinco cosas cuando necesitás una.

La frase del dueño que originó todo esto, después de una demo fallida a un lead (DEMO-3, 2026-09-08):
la app es *"incoherente, incómoda"*, *"parece improvisada"*, y tiene *"TANTO"* que le saca jugo.

**Regla dura de este trabajo: sin evidencia no hay hallazgo.** Cada uno lleva el texto exacto que
aparece en pantalla, o `archivo:línea`, o el nombre del screenshot. Un hallazgo sin eso se descarta
sin discutirlo.

---

## 1. Alcance de esta corrida

**Adentro:** las 29 pantallas reales del panel (route group `(admin)`), en los dos roles que las
usan — `admin` (Marcelo, el dueño) y `manager` (Rodrigo, el encargado) — en desktop y en teléfono.

**Afuera, decidido por el dueño el 2026-09-09** (§6 del diseño): el portal público y la app del
jugador. Tienen otra personalidad de diseño y van en una tercera corrida con su propia rúbrica. Si
encontrás algo del portal mientras mirás el panel, **anotalo igual** con `route` del portal: se
guarda para esa corrida, no se tira.

**Afuera también:** el tema oscuro. El corpus se generó solo en tema claro.

---

## 2. Las personas

<!-- RECON:personas -->

---

## 3. Las tareas, con su frecuencia

Salen de la **Recorrida del dueño** (artifact del 2026-09-08, 24 ítems). Son las tareas reales de un
complejo, en el orden en que se hacen, con la frecuencia con la que se hacen. La prioridad de un
hallazgo depende de en qué bloque cae: **un problema chico en el bloque A vale más que uno grande en
el bloque C.**

### Bloque A — el día a día (muchas veces por día)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| A1 | `/grilla` | Crear una reserva tocando una celda libre | Un toque abre un formulario corto (nombre y teléfono) con el precio ya resuelto por la franja. Se confirma y la celda pasa a ocupada al instante. El camino rápido tiene que alcanzar para el 90 % de las veces. |
| A2 | `/grilla` | Cobrarle a esa reserva | La celda ocupada abre un panel con tres números: precio, cobrado, pendiente. Un botón cobra. Si el turno ya terminó, el mismo botón cobra **y lo da por jugado**, en un paso. |
| A3 | `/grilla` | Cancelar esa reserva | Pide motivo y quién cancela, porque de eso depende la devolución de la seña. Si hay seña paga, avisa **antes** de confirmar. |
| A4 | `/grilla` | Bloquear una cancha por lluvia y después liberarla | Se libera desde el mismo lugar donde se bloqueó. (Era el peor hallazgo de DEMO-3; **ya arreglado** — verificá que siga arreglado, marcá REGRESIÓN si no.) |
| A5 | `/caja/cantina` | Vender dos gaseosas y un alfajor | Se arma el ticket, se cobra, **el stock baja solo** y la venta aparece en la caja del día. Se puede anotar como fiado. |
| A5b | `/caja` | Intentar vender lo mismo desde "Caja del día" | No debería existir un segundo camino que registre la venta sin tocar el stock. |
| A6 | `/caja` | Abrir la caja con fondo y cerrarla al final del día | Al cerrar muestra lo que **debería** haber, se cuenta, se registra la diferencia. Cerrado no se toca más. |

### Bloque B — la semana (una o dos veces por semana)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| B1 | `/abonados/nuevo` | Cargar un turno fijo de los martes 21 hs | Genera todos los martes hacia adelante y avisa **antes** si alguno choca con una reserva existente. |
| B2 | `/abonados` | Cancelar solo el martes que viene, sin romper la serie | Cancelar una fecha y cancelar la serie son dos acciones que no se pueden confundir. |
| B3 | `/caja/deudas` | Ver quién debe plata y cobrarle a uno | Lista con quién, cuánto, **de cuándo** ("hace 32 días") y de qué (turno, fiado, inscripción). Un botón cobra ahí mismo. |
| B4 | `/grilla` | Marcar a alguien como ausente y después cobrarle igual | Si debe plata, la celda lo dice **y deja cobrar desde ahí**. Un estado que alarma sin dejar actuar es un callejón. |
| B5 | `/caja/devoluciones` | Devolverle la seña a alguien que canceló | Lista de a quién se le debe y cuánto, con el contacto. Se devuelve por fuera y se marca "ya devolví". **TurnoGol no reembolsa por API** (MercadoPago da 403 con la cuenta del complejo): el sistema solo registra. |

### Bloque C — el mes y el arranque (una vez por mes o menos)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| C1 | `/caja/productos` | Cargar un producto nuevo y reponer stock | Lo primero que se ve es **el catálogo con sus botones**. El ranking y el historial van abajo o en otra pestaña. |
| C2 | `/settings/canchas` | Cambiarle el precio a una cancha para el turno noche | Franjas horarias con un precio por franja, en un solo lugar. Cambiar un precio no toca las reservas ya hechas. |
| C3 | `/settings/horarios` | Cambiar el horario de cierre, probando cierre pasada la medianoche | Si cierra a las 2 AM, el turno de la 1 AM del sábado aparece **dentro del sábado**. |
| C4 | `/settings/perfil` | Subir la portada y el logo, y ver dónde aparecen | Si se piden dos imágenes, las dos tienen que hacer algo visible que se pueda señalar. |
| C5 | `/settings/equipo` | Dar acceso a un encargado y ver qué ve él | Tiene que ser obvio qué permisos se están dando **antes** de invitar. |

### Bloque E — ocasional (cuando hace falta)

| ID | Ruta | Tarea | Qué debería pasar |
| --- | --- | --- | --- |
| E1 | `/analiticas` | Ver cómo viene el mes | Acá **sí** van los KPIs, gráficos y ranking: es la vista ocasional, la que se abre a propósito. |
| E2 | `/torneos` | Crear un torneo, asignarle horarios de cancha y después liberar uno | Al tocar esa hora en la grilla, tiene que decir **qué torneo la ocupa y cómo salir de ahí**, con link a la pantalla del torneo. Es lo que rompió la demo. |
| E3 | `/grilla` | Abrir la grilla en el celular y cargar una reserva | Tiene que servir para lo mismo que en la compu, con el pulgar. El dueño ya la marcó como *"ilegible e inmanejable"*. |
| E4 | `/reservas` | Filtrar las reservas de la cancha 3 | Se puede filtrar por cancha y ver de un saque qué tiene cada una hacia adelante. |

### Bloque D — fuera de esta corrida

D1, D2 y D3 son del portal del jugador. Van en la tercera corrida. Se listan acá solo para que
nadie los reporte creyendo que faltan.

---

## 4. Las 29 pantallas y su spec

<!-- RECON:mapa-specs -->

---

## 5. El Encargado (rol `manager`)

<!-- RECON:manager -->

---

## 6. Las reglas propias — lo que la app se prometió a sí misma

Un hallazgo de tipo COHERENCIA **cita una de estas reglas**. Si no podés citar ninguna, tu hallazgo
es HEURISTICA (Nielsen) o no es un hallazgo.

. Negativos `−$ 1.500` con `text-destructive` + signo. Nunca "ARS", nunca "$100" pegado, nunca decimales (salvo compacto solo en ejes de charts: "$ 12,5 mil"). | MASTER.md:478-489 |
| BONUS-83-formato-fecha | Hora siempre 24h `HH:mm`. ISO (`2026-07-03`) prohibido cara al usuario — solo en URLs/APIs/e2e. Formatos por contexto: relativo ("Hoy 18:00"), corto (`eee d MMM`), medio (`eee d 'de' MMMM`), largo (`eeee d 'de' MMMM`), rango con en-dash sin espacios ("17:00–18:00"). | MASTER.md:491-503 |
| BONUS-62-un-primario-por-vista | Un botón primario por vista; si hay dos acciones "importantes", una va en `outline` (Ley de Hick: decidir entre 2 CTAs iguales es no decidir). Icon-only siempre con `aria-label` Y `Tooltip`. | MASTER.md:358-362 |
| BONUS-68-nav-admin | Sidebar admin: 6 espacios en orden de frecuencia real (Hoy·Grilla·Caja·Clientes·Torneos·Métricas) con Configuración separada al pie. Ítems bloqueados por rol muestran candado+tooltip, no desaparecen — excepto "Hoy", que se oculta directamente para el manager (D5: esa pantalla no le corresponde, no es permiso denegado). | MASTER.md:418-419 |


### Reglas propias — gramática de interacción

| Regla | Qué exige | Cita |
|---|---|---|
| CTA de plata: un solo componente | Toda acción que mueve o cobra plata usa `<Button>` (`src/components/ui/button.tsx`) o, si el layout no admite el componente, `bg-primary text-primary-foreground` — **nunca** un color Tailwind crudo (`bg-emerald-600`, `bg-emerald-700`) con `text-white` | `docs/spec/design-system/gramatica-interaccion.md:31-34` |
| Por qué el color crudo está prohibido (no solo desaconsejado) | `--primary` en dark da 7.9:1 (AA); `bg-emerald-600 text-white` da ~3.6:1 en dark — falla AA. El bug no se ve en light, así que sobrevive code review hasta que alguien prueba en dark | `docs/spec/design-system/gramatica-interaccion.md:36-40` |
| Guardado por ESLint | Regla `no-restricted-syntax` en `eslint.config.mjs`: cualquier literal o template string con `bg-emerald-600` es error de lint. El guard solo mira el string exacto `bg-emerald-600` (otras familias de la escala, ej. `emerald-50`, quedan permitidas para íconos/bordes/tintes) | `docs/spec/design-system/gramatica-interaccion.md:42-46` |
| Checklist de botón de plata nuevo | (1) ¿Es `<Button>` o `bg-primary text-primary-foreground`? (2) ¿Tiene `isLoading`/estado pendiente visible? (3) ¿El label describe el efecto y, si aplica, el monto? (ej. "Cobrar $12.500", no solo "Confirmar") | `docs/spec/design-system/gramatica-interaccion.md:48-53` |
| Cero diálogos nativos | Prohibido `window.confirm()`/`alert()` nativos para cualquier acción destructiva o costosa — inconsistentes entre navegadores, no estilables ni testeables igual que el resto del sistema | `docs/spec/design-system/gramatica-interaccion.md:58-60` |
| Clase A — reversible y barato | Se ejecuta al click, SIN diálogo previo. Toast queda 10 s (vs. 4 s de un toast normal) y ofrece "Deshacer" que re-invoca la acción inversa. Solo aplica si existe una inversa de dominio REAL — no se inventa una acción de reversión que el negocio no tiene | `docs/spec/design-system/gramatica-interaccion.md:62-66` |
| Clase A — ejemplos con su inversa | Marcar ausente → `revertNoShowAction` (ventana 24 h); Quitar día cerrado → re-invoca `addClosedDateAction`; Sacar jugador del plantel (torneos) → re-invoca `addTeamPlayerAction`; Borrar evento de acta (gol/tarjeta) → re-invoca `addEventAction`; Activar/Desactivar cancha → toggle simétrico | `docs/spec/design-system/gramatica-interaccion.md:68-74` |
| Clase B — costoso pero explicable | `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) con prop `consequences?: string[]` que lista consecuencias reales verificadas contra el código del service (nunca inventadas). SIN type-to-confirm. `variant="destructive"` si además de costoso es difícil de deshacer del todo | `docs/spec/design-system/gramatica-interaccion.md:76-80` |
| Clase B — ejemplos con consecuencia mostrada | Ban manual de jugador → motivo + días de bloqueo (default 7, "Permanente" disponible sin ser default); Pausar abonado → borra reservas futuras generadas por ese abonado; Liberar horas de torneo → conteo real de horas que vuelven a estar libres; Borrar fixture de torneo → se pierden resultados cargados; Walkover/borrar resultado → recalcula tabla de posiciones; Impersonar tenant (super-admin) → qué puede ver/hacer mientras dura; Cambiar plan/extender trial/resetear contraseña (super-admin) → plan destino + precio, días, email afectado | `docs/spec/design-system/gramatica-interaccion.md:82-91` |
| Clase C — irreversible con plata real | `ConfirmDialog` con `confirmationPhrase`: el usuario tipea una palabra exacta antes de poder confirmar. Reservado para lo que de verdad no tiene vuelta atrás | `docs/spec/design-system/gramatica-interaccion.md:93-96` |
| Clase C — ejemplos con frase a tipear | Cancelar abonado → `CANCELAR`; Cerrar caja del día (inmutable) → `CERRAR`; Quitar staff → el email del staff; Super-admin forzar estado/cancelar tenant → el nombre del tenant | `docs/spec/design-system/gramatica-interaccion.md:98-103` |
| Árbol de decisión A/B/C | ¿Hay inversa de dominio real y barata? SÍ → Clase A. NO → ¿es económica/operativamente grave o imposible de deshacer del todo? SÍ → Clase C. NO → Clase B | `docs/spec/design-system/gramatica-interaccion.md:107-113` |
| No inventar Clase A sin inversa real | No existe "revertir cancelación de reserva" ni "reabrir un cierre de caja" — si no existe la acción inversa real, no es Clase A aunque parezca barato deshacerlo | `docs/spec/design-system/gramatica-interaccion.md:115-117` |
| Input de monto: componente único | Todo input que edita un monto en pesos ARS usa `<MoneyInput>` (`src/components/ui/money-input.tsx`). Prohibido `type="number"` o un `<input>` de texto con parseo manual (`Number(x)`, `parseFloat(x)`) para plata | `docs/spec/design-system/gramatica-interaccion.md:123-125` |
| Por qué: bug real de auditoría | `type="number" step="0.01"` interpreta el punto como decimal — el hábito argentino de tipear el punto de miles (`"25.000"`) da `Number("25.000") === 25`: $25.000 se guarda como $25 sin error visible. Hallazgo real de auditoría, no hipotético | `docs/spec/design-system/gramatica-interaccion.md:129-132` |
| Contrato de `MoneyInput` | Siempre centavos (integer) en toda la cadena hasta el server action, nunca pesos ni string sin parsear. Modo controlado: `valueCents`/`onValueChange` (estado `number \| null`). Modo no controlado: `defaultValueCents` + `name`, renderiza `<input type="hidden">` — `fd.get('campo')` YA es el string de centavos, **no volver a multiplicar por 100** | `docs/spec/design-system/gramatica-interaccion.md:136-147` |
| Formato es-AR y umbral en palabras | Formatea con separador de miles es-AR mientras se tipea; relee el monto en palabras arriba de `MONEY_WORDS_THRESHOLD_CENTS` ($10.000) para hacer imposible confundir $25 con $25.000 sin notarlo. Para mostrar (no editar), usar `formatArs(cents)` de `src/lib/format.ts` — nunca un `Intl.NumberFormat` nuevo armado a mano | `docs/spec/design-system/gramatica-interaccion.md:148-151` |
| Regla dura: el parser dual muere en el mismo diff | Cuando un campo migra a `MoneyInput`, TODO `Number(x)`/`parseFloat(x)`/`Math.round(x*100)` que tocaba ese mismo valor se elimina en el mismo cambio. Ningún test existente detecta esto solo — hay que leer la cadena de datos hasta el server action | `docs/spec/design-system/gramatica-interaccion.md:153-159` |
| Qué NO es plata (excepción explícita) | Queda con `type="number"` normal: goles, tarjetas, cantidad de equipos, stock/unidades, días, porcentajes, minutos. `MoneyInput` es específicamente para pesos ARS | `docs/spec/design-system/gramatica-interaccion.md:161-162` |
| Fuente única de etiqueta de método de pago | `MethodKey`/`METHOD_LABELS`/`PAYMENT_METHOD_OPTIONS` viven en `src/lib/payment-method.ts` (no en `caja-lib.ts`, porque componentes reusables fuera de `@/app` no pueden importar de la capa de rutas); `caja-lib.ts` re-exporta | `docs/spec/design-system/gramatica-interaccion.md:166-169` |
| Fuente única de formato de moneda de solo lectura | `formatArs`/`formatArsContable` de `src/lib/format.ts` son los únicos formatters ARS del repo. Un `new Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS', ...})` armado localmente es señal de que hay que importar el de `lib/format.ts` | `docs/spec/design-system/gramatica-interaccion.md:170-173` |
| Plantilla de error (fórmula de 3 partes) | Cero "Algo salió mal" a secas. Todo estado de error sigue: **[qué pasó] + [qué podés hacer] + [qué hace el sistema mientras tanto, si aplica]**. Ejemplo real citado (`BookingErrorCard.tsx`): *"El pago no se procesó. El pago fue rechazado o cancelado. Podés intentar de nuevo con otro medio."* — no *"Hubo un error"* | `docs/spec/design-system/gramatica-interaccion.md:179-183` |
| Plantilla de estado vacío | Todo estado vacío (lista/tabla sin datos) usa `EmptyState` (`src/components/ui/empty-state.tsx` o el que corresponda a la superficie) en vez de un `<p>` armado a mano. Un vacío nunca contradice la UI que lo rodea — si hay un botón "Crear" visible en otra parte de la pantalla, el copy del vacío invita a usarlo, no dice "Próximamente" al lado | `docs/spec/design-system/gramatica-interaccion.md:185-188` |
| Errores de validación Zod: dónde va la defensa real | `installZodLocale()` NO alcanza los schemas de la app en runtime (`instrumentation.ts` se bundlea en un layer aparte, su copia de Zod no es la que usan los schemas del grafo de la app — medido en runtime 2026-08-01). La defensa real es **mensaje explícito en cada `.max()`/`.min()` cuyo error pueda llegar a pantalla** (ver `boundedText` en `primitives.ts`); un mensaje en inglés en producción es bug de ESE schema puntual, no de infraestructura | `docs/spec/design-system/gramatica-interaccion.md:190-198` |
| `not-found`/`error` dentro del shell de cada route group | Un `notFound()` que expulsa al 404 raíz de Next.js (sin sidebar, sin logo) hace pensar que la app entera se rompió. Implementado en `(admin)` (`src/app/(admin)/not-found.tsx` + `error.tsx`) y en `(super-admin)` (`src/app/(super-admin)/super-admin/not-found.tsx` + `error.tsx`, un nivel más adentro porque ese grupo tiene un solo segmento de ruta real) | `docs/spec/design-system/gramatica-interaccion.md:200-206` |
| Checklist final antes de mergear (resumen operativo) | (1) CTA de plata usa `<Button>`/`bg-primary`, si no el lint para; (2) clasificar la acción en A/B/C según el árbol de decisión; (3) monto en pesos → `MoneyInput`, grep de `Number(x)`/`parseFloat(x)`/`Math.round(x*100)` residual en el mismo archivo; (4) vacío/error → `EmptyState`/fórmula de 3 partes; (5) no duplicar `METHOD_LABELS`/`formatArs`/`formatArsContable` con un `Record<string,string>` nuevo | `docs/spec/design-system/gramatica-interaccion.md:212-227` |


---

## 7. Drift de vocabulario ya medido

Esto ya está contado. **No lo vuelvas a reportar tal cual**: usalo como punto de partida para
encontrar el caso concreto donde el drift le pega a una tarea (qué pantalla, qué camino, qué persona
se pierde). Un conteo de grep no es un hallazgo; "el mismo lugar se llama de tres formas en un solo
camino de navegación" sí lo es.

### Drift de vocabulario medido (2026-09-09)

| Concepto | Palabras que compiten (con conteo) | Ejemplos con archivo:línea | Qué dice la regla |
|---|---|---|---|
| Reserva/Reservas vs Turno/Turnos | `reserva*` 131 menciones visibles · `turno*` 82 | `src/app/(admin)/abonados/AbonadoDialogs.tsx:144-149` (un mismo instructivo manda a "**Grilla**" o "**Reservas**" para encontrar "el **turno**" y click en "**Cancelar reserva**") · `src/components/booking/BookingSlotPanel.tsx:270` `aria-label="Acciones del turno"` vs `:376/379` `title/confirmLabel="Cancelar reserva"` (mismo panel) | No hay regla escrita. Patrón no documentado en el código: "reserva" = el registro completo (crear/cancelar/comprobante), "turno" = el bloque horario/precio (precio del turno, duración). Conviven en el mismo componente. |
| Cobrar/Cobro vs Pago/Pagar | `cobr*` 34 · `pag*` 47 | `src/components/booking/slot-panel/SlotPriceSummary.tsx:22` "Cobrado" y `:40` "Pago" (filas contiguas del mismo resumen) · `src/app/(admin)/reservas/[id]/BookingCharges.tsx:232` h2 "Cobros de turno" / `:264` "Pagado" / `:319` "Pago dividido (2 medios)" (mismo archivo, tres raíces) · `src/app/(admin)/reservas/QuickActions.tsx:405` diálogo "Confirmar pago" (confirma la seña) | No hay regla escrita. El patrón real (no documentado en MASTER ni docs/spec): "Pago/Pagar" para la seña online vía MP y para el método de pago; "Cobrar/Cobro" para la plata que entra en caja del complejo. Distinción real pero no está escrita en ningún lado — vale confirmarla con el dueño. |
| Clientes vs Personas vs Jugadores | "Clientes" 6 · "Personas" 7 · `jugador*` 36 (en el mismo módulo) | `src/components/layout/admin-sidebar.tsx:75` `label: 'Clientes'` (href `/jugadores`) · `src/app/(admin)/jugadores/ClientesTabs.tsx:4` `label: 'Personas'` (mismo href) · `src/app/(admin)/jugadores/JugadoresView.tsx:82` `PageHeader title="Personas"` vs `:127` `EmptyState title="Todavía no tenés clientes"` | No hay vocabulario canónico escrito para esta entidad (MASTER §8.5 solo cubre estados, no entidades). El mismo destino tiene 4 nombres en un solo click: sidebar "Clientes" → tab activa y header "Personas" → vacío "clientes" → ruta y todo el código interno "jugadores" (`JugadoresView.tsx`, `JugadorProfileView.tsx`, `playerId`). |
| Completada vs Jugada | "Jugada" (fuente única del badge) · "Completada/Completadas" (filtro+botón+diálogo, 3+ lugares) · "jugado/jugados" (copy descriptivo, 2+ lugares) | `src/lib/booking/slot-visual.ts:106` `label: 'Jugada'` (fuente única del badge) · `src/app/(admin)/reservas/(list)/page.tsx:53` `{ value: 'completed', label: 'Completadas' }` (filtro de la MISMA lista que pinta ese badge) · `src/app/(admin)/reservas/[id]/BookingActions.tsx:378` botón "Marcar completada" → abre `CompleteBookingDialog.tsx:212` título "Completar turno" | `docs/spec/design-system/MASTER.md:513-515` — §8.5 "Vocabulario canónico de estados": `completed` → **"Jugada"**, "Un término por estado en TODA la app". El badge cumple; el filtro, el botón y el diálogo de la MISMA pantalla no. |
| Cancelada vs Anulada vs Eliminada | `cancel*` 59 · `anul*` 1 raíz pero repetida en 5 lugares del mismo componente · `elimin*` 14 (dominio distinto: cuentas) | `src/app/(admin)/caja/cantina/FiadosList.tsx:112` botón "Anular" / `:337` `DialogTitle` "Anular fiado — {name}" / `:320` toast "Fiado anulado" (los nombres internos son `cancelTabAction`/`CancelTabDialog`/`cancelingTab`, en inglés "cancel") · `src/app/(admin)/abonados/AbonadosList.tsx:278` toast "Abonado cancelado." (misma acción de dar de baja algo recurrente, pero acá se usa "cancelar") | No hay regla escrita para "cancelar" vs "anular". Fiados es la única familia que rompe: código interno en inglés ("cancel"), UI en "Anular"; reservas y abonados —la misma acción semántica— usan "Cancelar" en la UI. "Eliminada" no compite: es dominio de cuentas (`DeleteAccountForm.tsx:41`, `tenant_status`/`player_status` = deleted). |
| Bloqueo vs Bloqueado vs Bloquear vs Cerrado | `bloque*` 14 · `cerrad*`/`cerrar` 31 (dos conceptos distintos: día cerrado en horarios y caja cerrada) | `src/components/booking/BookingFormModal.tsx:476` "Bloquear la cancha" / `:819` "Motivo / Tipo de Bloqueo" / `:1031` "Bloquear cancha" (consistente, son formas gramaticales del mismo verbo) · `src/app/(admin)/settings/canchas/components/status-visual.tsx:9,21` `label: 'Offline'` con comentario que invoca "Vocabulario §8.5" para justificarlo · `docs/spec/design-system/MASTER.md:514-515` "court `offline` → **'Pausada'**" | **Contradicción directa doc↔código**: MASTER §8.5 exige "Pausada" para court offline; el código muestra "Offline" y su propio comentario cita el MISMO §8.5 para defenderlo. Aparte de este caso, "Bloqueo/Bloqueado/Bloquear" (mantenimiento de cancha) y "Cerrado" (día cerrado, caja cerrada) son conceptos distintos y cada uno es internamente consistente — no compiten entre sí pese a estar en la lista de pares a medir. |
| Abonado vs Fijo vs Turno fijo | `abonad*` 15 · `fijo`/turno(s) fijo(s) 14 | `src/app/(admin)/abonados/AbonadoDialogs.tsx:59` `title="Pausar turno fijo"` → toast resultante en `src/app/(admin)/abonados/AbonadosList.tsx:223` "Abonado pausado correctamente." · `AbonadoDialogs.tsx:95,108` "Cancelar turno fijo" → toast `AbonadosList.tsx:278` "Abonado cancelado." · `src/app/(admin)/jugadores/ClientesTabs.tsx:5` tab "Turnos fijos" vs `src/app/(admin)/abonados/AbonadosList.tsx:111` botón real "Nuevo turno fijo" (el "+ Nuevo abonado" que aparece en grep es solo de un `.stories.tsx`, no de código real) | No hay regla escrita. Navegación/headers/tabs dicen siempre "Turno(s) fijo(s)"; los toasts de confirmación tras la MISMA acción (pausar/cancelar) dicen "Abonado". Mismo click, dos sustantivos. |
| Deuda vs Plata en la calle vs Fiado vs Pendiente | "Deudas" 5 (visible) · "Plata en la calle" 8 apariciones, **todas en comentarios, 0 en JSX** · `fiad*` 8 · `pendient*` 11 | `src/app/(admin)/caja/deudas/page.tsx:34` `PageHeader title="Deudas"` (lo único que ve el usuario) · comentarios en `StreetMoneyList.tsx:21`, `PendingRefundsList.tsx:76`, `ClientesTabs.tsx:10`, `caja/devoluciones/page.tsx:18` que llaman al mismo feature "Plata en la calle" entre comillas · `src/app/(admin)/caja/deudas/StreetMoneyList.tsx:30` `ORIGIN_TAG.canteen_tab = 'Fiado'` (consistente con `caja/cantina/FiadosList.tsx:78` "Fiados pendientes") | Acá no hay drift real que el usuario vea — "Deudas" es consistente en toda pantalla. Lo que sí hay es un nombre de producto interno ("Plata en la calle", `getStreetMoney`, `street-money.service.ts`, 8 archivos) que el equipo usa para hablar del feature y que NUNCA llega a la UI — puede confundir a quien audite leyendo comentarios y crea que así se llama en pantalla. |
| Complejo vs Club vs Predio | `complej*` 81 · "Club" 2 · "Predio" 1 | `src/components/site/HeroSearch.tsx:140` `<label>Complejo</label>` seguido de `:152` `placeholder="¿Qué club buscás?"` — MISMO campo del buscador público, repetido en la variante desktop `:299`/`:311` · `src/app/(public)/terminos/page.tsx:126` "Predio: 1 o 2 canchas" contradice `src/app/(business)/precios/plans-data.ts:29-31` (`name: 'Predio', maxCourts: 3, rangeLabel: '1 a 3 canchas'`) y CLAUDE.md ("Predio 1-3 canchas") | No hay regla de nomenclatura escrita para "complejo" vs "club". "Complejo" gana ampliamente (81 vs 2) salvo en el placeholder del buscador público, que dice "club" en el MISMO campo cuyo label dice "Complejo". Aparte: el dato de "Predio" en `/terminos` está desactualizado — no es drift de vocabulario sino un dato roto, pero comparte pantalla y síntoma con Complejo/Club. |
| Seña vs Anticipo vs Depósito | `seña*` 35 · "anticipo" 0 · "depósito" 0 | `src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx:104-142` ("Seña", "Requerir seña", "% de seña") · `src/app/(public)/[slug]/reservar/components/BookingSummary.tsx:52` "Seña a pagar ahora" · `src/components/booking/BookingReceipt.tsx:68` "Seña pagada" | No aplica — no hay drift. "Seña" es el 100% del término; "anticipo" y "depósito" no aparecen en ningún string visible de `src/app` ni `src/components`. Único par limpio de los diez medidos. |
| Bonus — Anglicismos prohibidos en UI (§8.1) | "Offline" (cancha) · "Walkover" (torneos) | `src/app/(admin)/settings/canchas/components/status-visual.tsx:15,21` `label: 'Online'/'Offline'` · `src/app/(admin)/torneos/[id]/partidos/[matchId]/ActaPanel.tsx:103,430,439` "Walkover cargado" / "Cargar walkover" | `docs/spec/design-system/MASTER.md:474` — §8.1: "Anglicismos PROHIBIDOS en UI... Excepciones de marca: MercadoPago, email, link, **online**." "Offline" no está en la lista de excepciones (solo "online" lo está) y "Walkover" tampoco — ninguno de los dos tiene excepción documentada. |

**Los peores 5** — mismo objeto, nombre distinto dentro de un mismo camino de navegación:

1. **`/jugadores`**: sidebar dice "Clientes" (`admin-sidebar.tsx:75`) → aterrizás en la tab activa y el header dicen "Personas" (`ClientesTabs.tsx:4`, `JugadoresView.tsx:82`) → el estado vacío dice "clientes" (`JugadoresView.tsx:127`) → la URL y todo el código interno dicen "jugadores". Cuatro nombres, un solo click.
2. **Buscador público** (`HeroSearch.tsx`): el MISMO campo de búsqueda tiene `<label>Complejo</label>` y `placeholder="¿Qué club buscás?"` — duplicado en las dos variantes responsive (líneas 140/152 y 299/311).
3. **`/abonados`**: el diálogo de confirmación dice "Pausar turno fijo" / "Cancelar turno fijo" (`AbonadoDialogs.tsx:59,95,108`) y el toast que aparece tras el MISMO click dice "Abonado pausado" / "Abonado cancelado" (`AbonadosList.tsx:223,278`).
4. **`/reservas` (lista)**: la fila muestra el badge "Jugada" (fuente única, `slot-visual.ts:106`, cumple MASTER §8.5) pero el chip de filtro para ver esas mismas filas dice "Completadas" (`reservas/(list)/page.tsx:53`) — viola el "un término por estado" que el propio MASTER exige dos líneas más arriba.
5. El instructivo de `AbonadoDialogs.tsx:144-149` le dice al usuario que vaya a "Grilla" o a "Reservas" para encontrar "el turno" y hacer click en "Cancelar reserva" — tres sustantivos distintos (Grilla / turno / reserva) para describir un trayecto de tres pasos.


---

## 8. Reglas del dueño ya decididas — no re-litigar

Estas ya se discutieron y se cerraron. Un hallazgo que las contradiga se descarta.

1. **"Los rankings, KPIs y estadísticas son OCASIONALES. El que convive con la app quiere registrar
   y cobrar."** (regla textual del dueño, 2026-09-08). Consecuencia operativa: en una pantalla del
   día a día, un bloque informativo que ocupa más lugar que el operativo es un hallazgo, no una
   opinión. `/analiticas` es la excepción: ahí los KPIs son el producto.
2. **El botón público "Reservar" no muestra precio.** Ya se arregló; solo se verifica que siga así.
3. **El jugador ve dos estados: libre u ocupado.** Por qué está ocupado es asunto del complejo.
4. **La app tiene que mostrar el estado de la PLATA, no el estado del sistema.** "Confirmada" es un
   estado del sistema; "me deben $ 40.000" es lo que el dueño necesita. Este es el patrón de fondo
   que explica cinco de los hallazgos de DEMO-3 y es el criterio con el que se juzga cualquier
   pantalla que muestre turnos.
5. **Ítem ya cargado para L4:** revisar `/dashboard` ("Hoy"). Hipótesis del dueño: no aporta valor
   real. L4 lo evalúa como a cualquier otro elemento (quién lo usa, cada cuánto, qué se rompe si se
   saca o se pliega dentro de Grilla). **El agente no decide sacarlo**: emite el hallazgo RESTA y el
   veredicto queda para el voto.
6. **Freeze de features hasta 2026-11-01.** La auditoría es observación: permitida. Un hallazgo que
   proponga un feature nuevo, un rediseño no observado, o cambiar pricing/lifecycle, se marca
   `requiresInput: true` y no se implementa.

---

## 9. Esquema de hallazgo y barra de evidencia

Un hallazgo que no traiga todos los campos obligatorios se descarta antes del voto.

| Campo | Obligatorio | Qué lleva |
| --- | --- | --- |
| `route` | sí | La ruta real (`/caja/deudas`, no "la pantalla de deudas") |
| `role` | sí | `admin` \| `manager` |
| `viewport` | sí | `desktop` \| `mobile` |
| `element` | sí | **El texto exacto** del control o del copy, entre comillas · o `archivo:línea` · o el nombre del screenshot |
| `kind` | sí | `BUG` \| `COHERENCIA` \| `HEURISTICA` \| `CALLEJON` \| `RESTA` |
| `rule` | sí salvo BUG | La regla violada, citada: `MASTER §8.5`, `gramática §3 clase B`, `pages/caja.md §5`, `Nielsen #3`, `doc3 JTBD 1` |
| `scenario` | sí | En palabras de la persona: *"Marcelo, viernes 23:15, fila en el mostrador, abre X y…"* |
| `frequency` | sí | `diario` \| `semanal` \| `mensual` \| `unica-vez` — sale del bloque de la tarea (§3) |
| `fix` | sí | El cambio mínimo. Si es decisión de negocio: `requiresInput: true` y la pregunta numerada |
| `task` | si aplica | El ID de la tarea de §3 donde apareció (`A2`, `B4`, …) |
| `regression` | si aplica | El ID del hallazgo ya cerrado que volvió (§11) |
| Solo RESTA | | `verdict`: `keep` \| `fold` \| `remove` + **"qué se rompe si se saca"** |

**No traigas severidad.** La asignan después dos agentes independientes que no encontraron el
hallazgo, y se promedia. Vos describís el problema; otro lo pesa.

---

## 10. Cómo se pesa después (para que sepas qué información hace falta)

Severidad, escala de Nielsen: `0` no es problema · `1` cosmético · `2` menor · `3` mayor · `4`
catastrófico.

**Prioridad = severidad × frecuencia**, con dos reglas que pisan el producto:

- **Los callejones sin salida van primero siempre.** Una tarea que no se puede terminar desde
  ninguna vista es peor que cualquier cosa fea.
- **Los circuitos de plata van segundos.** Cobrar, deber, devolver, stock. Un 2 en la grilla diaria
  vale más que un 3 en una configuración anual.

---

## 11. Ya cerrado — marcá REGRESIÓN, no lo reportes de nuevo

Tres auditorías previas cerraron ~128 hallazgos. Si encontrás uno de estos otra vez, **no es un
hallazgo nuevo**: es `regression` con el ID de origen, y vale más que uno nuevo porque significa que
un fix no aguantó.

### Ya cerrado — marcar REGRESIÓN, no reportar de nuevo

Verificación: `AUDIT_APP_FINDINGS.md` (60, 2026-08-14) está **formalmente cerrado en 4 tandas**, ledger en `docs/audit/archive/sin-fecha.md` (S1/S2/S3 + Críticos F1-F8 + "Aplicados" + Tanda 3 + Tanda 4) — citado ahí. `AUDITORIA_UI_COMPLETA_2026-07-28.md` (46) **no tiene ledger de cierre formal**: cada fila de esa fuente abajo la verifiqué leyendo el código actual el 2026-09-09 (cito archivo:línea vigente).

| Ruta | Hallazgo cerrado (1 frase) | Fuente |
|---|---|---|
| Sidebar admin (transversal) | Manager veía "Configuración" sin filtro de rol — ahora `requiresAdmin:true` lo oculta | AUDITORIA_UI_COMPLETA §Manager · `src/components/layout/admin-sidebar.tsx:63,90-95,109` |
| /dashboard | Manager veía 3/7 pasos del checklist que no podía completar — ahora `role!=='admin'` redirige a `/grilla`, manager no ve `/dashboard` | AUDITORIA_UI_COMPLETA §Manager · `src/app/(admin)/dashboard/page.tsx:59` |
| /dashboard | Checklist "Descartar" tenant-wide accesible al manager — cerrado por el mismo redirect (manager ya no entra a `/dashboard`) | AUDITORIA_UI_COMPLETA §Manager · `dashboard/page.tsx:59` |
| /dashboard | "Turnos de hoy: N de 0" con la única cancha offline (denominador engañoso) | AUDITORIA_UI_COMPLETA §Fixtures · `dashboard/page.tsx:87-105` (comentario cita el bug explícito) |
| /dashboard | "Próximos turnos" vacío con cancha offline mientras "Turnos de hoy" seguía contando — widget eliminado del rediseño (ahora `NeedsAttention`/`WhileYouWereAway`) | AUDITORIA_UI_COMPLETA §Fixtures · `dashboard/page.tsx` (widget "Próximos turnos" ya no existe en `src/`) |
| /dashboard | Tap target "Ver grilla →" ~20px de alto — el widget se eliminó del rediseño del dashboard | AUDITORIA_UI_COMPLETA §Tema/Responsive · `dashboard/page.tsx` (texto "Ver grilla" ya no existe en `src/`) |
| /dashboard | "Venta rápida" no avisaba de caja cerrada antes de armar el ticket — el botón/`DashboardCanteenButton.tsx` se eliminó del dashboard | AUDITORIA_UI_COMPLETA §Diff sin commitear · `dashboard/page.tsx` (sin `DashboardCanteenButton` en `src/`) |
| /dashboard (Reserva rápida) | Permitía crear reserva en cancha Offline sin aviso — ahora `isCourtOffline` muestra warning y deshabilita "Confirmar" | AUDITORIA_UI_COMPLETA §Fixtures · `src/components/booking/BookingFormModal.tsx:196,342,992,1028` |
| Onboarding (staff wizard) | Doble click en "Continuar" del Paso 3 creaba canchas duplicadas | AUDIT_APP_FINDINGS §P1 (F4) · sin-fecha.md "Críticos puntuales" |
| Registro nuevo admin + Onboarding | Teléfono de 5-6 dígitos aceptado sin validar formato AR | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Aplicados" (primitiva `phone` en `primitives.ts`) |
| Registro nuevo admin + Onboarding | Mensaje de validación en inglés al superar el largo máx. de Nombre | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Patrones sistémicos" S1 |
| /login (staff) | Foco no se movía al error tras un login fallido | AUDIT_APP_FINDINGS §P0 (MEJORA) · sin-fecha.md Tanda 4 §P0 |
| /login (staff) | JWT con `staff_user_id` inexistente en `staff_users` mostraba error genérico — ahora `OrphanedStaffSessionError` dedicado | AUDITORIA_UI_COMPLETA §Admin · `src/modules/auth/auth.service.ts:15-20,312`, `login/actions.ts:106`, `api/auth/callback/route.ts:242` |
| /grilla, /reservas (mobile) | Banner de push tapaba "Reservar turno" en grilla y el CTA de `/reservas` — pasó a estar EN FLUJO, ya no `fixed` | AUDITORIA_UI_COMPLETA §Tema/Responsive + AUDIT_APP_FINDINGS §P0/§P2 (F8) · `src/components/admin/PushNotificationManager.tsx:323-338` |
| /grilla (panel lateral) | "Cancelar" no vivía en el panel de la Grilla, solo en Reservas | AUDIT_APP_FINDINGS §P0 (MEJORA) · sin-fecha.md Tanda 4 §P0 (`BookingSlotPanel.tsx`) |
| /reservas | Header mostraba el total sin filtrar al aplicar `?status=` | AUDITORIA_UI_COMPLETA §Manager · `src/app/(admin)/reservas/(list)/page.tsx:188` |
| /reservas (detalle) | `completeAndChargeBookingAction` crasheaba toda la vista al completar con nota de deuda | AUDIT_APP_FINDINGS §P1 (F5) · sin-fecha.md "Críticos puntuales" |
| /reservas/[id] | Deep link con id no-UUID crasheaba la página (misma clase que bookingId en checkout) | AUDIT_APP_FINDINGS §P0/§P1 (F3, `isUuid` en `primitives.ts`) · sin-fecha.md "Críticos puntuales" |
| /reservas (QuickActions) | Cancelación rápida sin guard de plazo horario — ahora recibe `startsAt`+`cancellationPolicyHours` y calcula `inPolicy` | AUDITORIA_UI_COMPLETA §Admin · `src/app/(admin)/reservas/QuickActions.tsx:271-276` |
| /reservas (detalle) | Bloque de deuda mostraba ícono de teléfono sin número/link | AUDIT_APP_FINDINGS §P1 · sin-fecha.md Tanda 3 (`CompleteBookingDialog.tsx`) |
| /reservas (detalle) | Gate "el turno no terminó" no se anticipaba en 2 de 3 botones de acción | AUDIT_APP_FINDINGS §P1 (MEJORA) · sin-fecha.md Tanda 4 §P1 (`BookingActions.tsx`) |
| BookingFormModal (usado en /grilla) | Sin campo de precio — `priceOverride` era código muerto, ahora wireado como `priceOverridePesos` | AUDITORIA_UI_COMPLETA §Admin · `src/components/booking/BookingFormModal.tsx:353-359,914-922` |
| BookingFormModal | Sin buscador de jugador registrado ni selector de método de seña | AUDITORIA_UI_COMPLETA §Manager · `BookingFormModal.tsx:172` (playerId), `:937` (depositMethod) |
| BookingFormModal | No usaba el primitivo `dialogContentClass` compartido (riesgo teclado iOS) | AUDITORIA_UI_COMPLETA §Diff sin commitear · `BookingFormModal.tsx:31,468` |
| /caja/cantina | TabDialog "Anotar fiado" no hacía nada — `tabIdempotencyKey` se inicializaba en `onOpenChange`, que nunca disparaba desde el trigger externo | AUDITORIA_UI_COMPLETA §Diff sin commitear · `src/app/(admin)/caja/cantina/TabDialog.tsx:34-47` |
| /caja/productos | Mensaje de validación en inglés al superar el largo máx. de Nota | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Patrones sistémicos" S1 |
| /deudas (o ficha de jugador) | Diálogo de ban manual hardcodeaba `bg-white`/`zinc-900` — unificado en `BanPlayerDialog` (única superficie, usa `ConfirmDialog`) | AUDITORIA_UI_COMPLETA §Diff sin commitear · `src/components/admin/BanPlayerDialog.tsx:22-29` |
| Ficha de jugador | `BanPlayerDialog` no reseteaba motivo/duración al reabrirse tras cancelar | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Aplicados" |
| /abonados/nuevo | Pluralización rota "Luness"/"Miércoless" del día seleccionado | AUDITORIA_UI_COMPLETA §Manager · `src/app/(admin)/abonados/nuevo/AbonadoForm.tsx:70-71` |
| /abonados | Horario mostrado con segundos crudos ("19:00:00") | AUDITORIA_UI_COMPLETA §Manager · `src/app/(admin)/abonados/AbonadosList.tsx:339,423` + `formatTime` en `src/lib/format.ts:106-108` |
| /abonados/nuevo | Aceptaba fecha de inicio pasada, generaba reservas fantasma "jugadas" | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Aplicados" (bloqueado, `min={todayART()}` + `.refine`) |
| /abonados/nuevo | El campo Teléfono se vaciaba al volver del preview tras un error | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Aplicados" |
| /jugadores (Personas) | "Todavía no tenés clientes" era falso positivo con página fuera de rango | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Aplicados" (EmptyState distingue "sin nada" de "esta página no tiene nada") |
| /jugadores (Personas) | Nombre de contacto sin cuenta se truncaba ilegible en mobile por el badge | AUDIT_APP_FINDINGS §P1 (MEJORA) · sin-fecha.md Tanda 4 §P1 (`JugadoresView.tsx`, `flex-wrap`) |
| /settings/equipo | Invitar a un miembro lo marcaba `is_active=true` antes de aceptar — cartel corregido (decisión del dueño: se mantiene `is_active=true` desde el alta) | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Aplicados" |
| /settings/canchas, /settings/equipo | Mensaje de validación en inglés al superar el largo máximo | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Patrones sistémicos" S1 |
| /settings/perfil (perfil público) | Subir el logo del complejo crasheaba el perfil público — NO REPRODUCE (ya en `remotePatterns`), blindado preventivo vía `R2_PUBLIC_BASE_URL` | AUDIT_APP_FINDINGS §P1 (F6) · sin-fecha.md "Críticos puntuales" |
| /settings/reservas | `depositPercentage` se precargaba en 0 (inválido) al activar seña por primera vez | AUDITORIA_UI_COMPLETA §Admin · `src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx:75-82` |
| /settings/reservas | `booking_advance_days` solo editable desde Super Admin, sin autoservicio | AUDITORIA_UI_COMPLETA §Admin · `ReservasPolicyForm.tsx:225-241` |
| /settings/reservas | Input "Otro" del % de seña no se sincronizaba con el chip preset activo | AUDIT_APP_FINDINGS §P1 (MEJORA) · sin-fecha.md Tanda 4 §P1 (con candado de regresión, `ReservasPolicyForm.stories.tsx`) |
| /settings/avisos | Banner de push tapaba el botón "Guardar" en viewports bajos, click perdido sin feedback | AUDIT_APP_FINDINGS §P0/§P2 (F8) · mismo fix S2 de `PushNotificationManager.tsx` |
| /settings/avisos | Toggles "Recibir por email"/"Solo push" no exponían su estado a tecnología asistiva | AUDIT_APP_FINDINGS §P2 (MEJORA) · sin-fecha.md Tanda 4 §P2 (`AvisosForm.tsx`, `RadioGroupPrimitive`) |
| /settings (tira de tabs) | No hacía scroll automático al tab activo en mobile | AUDIT_APP_FINDINGS §P2 (MEJORA) · sin-fecha.md Tanda 4 §P2 (`scroll-tabs.tsx`) |
| /settings/facturacion | `ActivatePlanSection.tsx` con paleta oscura hardcodeada sin variantes `dark:` | AUDITORIA_UI_COMPLETA §Admin · `src/app/(admin)/settings/facturacion/ActivatePlanSection.tsx:222-223` (y resto del archivo) |
| /analiticas | El guard de rol solo estaba en un comentario, no en el código — NO REPRODUCE: el guard ya se llamaba en `page.tsx:78`, se corrigió el comentario | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "No reproducen" |
| /torneos | "Nuevo torneo" visible para manager sin gate visual (rebotaba sin explicación) | AUDITORIA_UI_COMPLETA §Manager · `src/app/(admin)/torneos/page.tsx:37,55` |
| /torneos | Banner "Próximamente" se mostraba siempre, incluso con torneos activos | AUDITORIA_UI_COMPLETA §Manager+Fixtures (dedup) · `torneos/page.tsx:49` |
| /torneos | "Crear el primero" visible para manager, dead-end silencioso | AUDIT_APP_FINDINGS §P1 (MEJORA) · sin-fecha.md Tanda 4 §P1 (patrón "candado, no desaparición") |
| /torneos/[id] | Un torneo publicado nunca salía de "Borrador" — faltaba la acción "abrir inscripción" | AUDITORIA_UI_COMPLETA §Fixtures · `src/app/(admin)/torneos/[id]/PortalPanel.tsx:22,55-58,93` |
| /torneos/[id] | Capitán de equipo sin autocomplete de Player pese a que el backend lo soportaba | AUDITORIA_UI_COMPLETA §Fixtures · `src/app/(admin)/torneos/[id]/TeamsPanel.tsx:151-158` (`CaptainAutocomplete`) |
| /torneos/[id]/partidos/[matchId] | Imposible cargar tarjetas — faltaba UI de plantel, `addTeamPlayerAction` sin caller | AUDITORIA_UI_COMPLETA §Fixtures · `TeamsPanel.tsx:711-808` |
| /torneos/[id]/posiciones | Tabla de Goleadores ocultaba el aviso de "goles sin autor" sin ningún goleador cargado | AUDIT_APP_FINDINGS §P1 · sin-fecha.md "Aplicados" |
| /torneos: detalle+fixture | El cron auto-complete rompía "Horarios tomados", el candado de borrado y el fixture | AUDIT_APP_FINDINGS §P1 (F7) · sin-fecha.md "Críticos puntuales" (`AND b.tournament_id IS NULL`) |
| /suspended (staff bloqueado) | Título duplicado en la pestaña del navegador | AUDIT_APP_FINDINGS §P2 · sin-fecha.md "Aplicados" |
| /suspended | Links secundarios ("Contactar a soporte"/"Volver al inicio") bajo el tap target mínimo | AUDIT_APP_FINDINGS §P2/P3 (MEJORA) · sin-fecha.md Tanda 4 §P3 |
| Caja · Plata en la calle (widget "Cobrado hoy") | Tardaba 15-60s en reflejar un cobro — investigado: NO REPRODUCE la asimetría cantina/deudas alegada, staleness es trade-off ya documentado y aceptado, decisión del dueño: dejarlo como está | AUDIT_APP_FINDINGS §P0 (MEJORA) · sin-fecha.md "Decisión del dueño (post-cierre tanda 4)" |
| Portal público de Torneos (routing público, dispara desde /torneos admin) | `tr.status = ANY(${PUBLIC_STATUSES}::tournament_status[])` interpolaba mal el array — ahora `sql.join(...)` con `ARRAY[...]` | AUDITORIA_UI_COMPLETA §Público · `src/modules/tournaments/tournament-public.service.ts:87-89,159-162` |
| **Portal público + Auth + Jugador (AUDITORIA_UI_COMPLETA_2026-07-28.md)** | **~17 hallazgos** (Público 4, Auth 7, Jugador 5, Fixtures/portal-público 1) — esta corrida no cubre esas rutas, no verificados individualmente acá | AUDITORIA_UI_COMPLETA_2026-07-28.md |
| **Portal público + Jugador (AUDIT_APP_FINDINGS.md)** | **~28 hallazgos** cerrados (formalmente, vía las 4 tandas) que tocan Confirmación de reserva, Perfil público, Disponibilidad, Explorar, Home pública, Mis reservas, Perfil/Configuración/Eliminar cuenta del jugador, Mock MercadoPago, marketing (Para complejos) — esta corrida no cubre esas rutas, no listados fila por fila | AUDIT_APP_FINDINGS.md |


---

## 12. Lo que NO es un hallazgo

Esto existe porque la corrida arranca **sin piloto de calibración** (decisión del dueño, §6 del
diseño): se esperan entre 25 % y 40 % de falsos positivos, y esta lista es el primer filtro.

1. **Preferencia estética sin regla detrás.** "Yo lo pondría más grande" no entra. Citá la regla o
   la tarea que se rompe.
2. **Un conteo de grep.** "Aparece 44 veces" no es un hallazgo: el hallazgo es el camino concreto
   donde eso confunde a una persona haciendo una tarea.
3. **Cosas que la spec pide y el código ya no hace, cuando el código tiene razón.** Pasa: la spec
   quedó atrás. Ejemplo real: `pages/caja.md §2.5` todavía llama "Plata en la calle" a la pestaña
   que hoy se llama "Deudas" — el código está bien, el hallazgo es *"corregir la spec"*, con
   `kind: COHERENCIA` y `fix` sobre el archivo `.md`.
4. **Lo que la foto no puede mostrar, afirmado como si se hubiera visto.** Un screenshot no prueba
   qué pasa después de apretar, cuánto tarda, ni qué dice el toast. Si tu lente es L1/L3/L4, no
   afirmes comportamiento: describí lo que se ve y marcalo como "a verificar en vivo".
5. **Un veto de producto ya tomado.** Están en `CLAUDE.md` §"Vetos de producto". Partidos abiertos,
   billetera del jugador, recordatorio 24 hs, texto libre sobre personas, Realtime para el jugador,
   AFIP. Proponer cualquiera de esos es ruido.
6. **Accesibilidad medida por color sobre gradiente o sobre estados que la story no renderiza.**
   Hay dos gotchas conocidos que producen falsos positivos de contraste.

---

## 13. El corpus de fotos

Las fotos viven en `docs/audit/screenshots/2026-09/`. Son **112 capturas**: las 28 pantallas
del panel × 2 roles (`admin`, `manager`) × 2 viewports (desktop 1440×900, mobile 393×851), en tema
claro, locale `es-AR`, zona horaria de Argentina, con animaciones desactivadas.

```
docs/audit/screenshots/2026-09/
  {desktop,mobile}/{admin,manager}/<pantalla>.png
  {desktop,mobile}/{admin,manager}/<pantalla>.txt   <- texto visible + arbol de accesibilidad
  capturas.json                                     <- manifiesto
  INDICE.md                                         <- indice legible
```

**Leé el `.txt` antes que el `.png`.** Cada foto tiene su gemelo en texto, con la URL final, el
titulo de la pantalla y el arbol de accesibilidad completo. Ahi estan los strings **exactos** de cada
boton, encabezado y mensaje, que es lo que el esquema de hallazgo (§9) te exige citar entre comillas.
De la imagen sacás la composicion y el peso visual; del texto, la evidencia.

El manifiesto `capturas.json` trae, por captura: `ruta`, `rutaResuelta`, `urlFinal`,
`redirigidoA`, `rol`, `viewport`, `png`, `txt`, `tituloEnPantalla`. **`redirigidoA` es un
campo de hallazgo, no de error**: hay 18 redirecciones registradas, todas del rol `manager`, y son
exactamente el comportamiento que la auditoria vino a mirar.

### Datos con los que se fotografio

El corpus se saca contra el complejo de demo "La Redonda" (4 canchas), sembrado a proposito con
estados sucios: una deuda de 30 dias, un hold vivo, un bloqueo manual de cancha, un jugador con ban,
un no-show, una reserva con seña paga y saldo pendiente, un fiado de cantina abierto, un dia de caja
cerrado (ayer), y un torneo con dos equipos, planteles, un partido jugado y sus goles y tarjetas.

### Pantallas que salen flacas, y por que — no las reportes como bug de datos

Medido contra la base el 2026-09-09. Si una de estas te sale vacia, **es el estado vacio lo que
estas auditando**, y ese estado tiene sus propias reglas (la plantilla de vacio de la gramatica de
interaccion). Lo que NO podes hacer es sacar conclusiones sobre la version poblada de esa pantalla:

| Pantalla | Que le falta | Consecuencia para vos |
| --- | --- | --- |
| `/settings/facturacion` | El mock de MercadoPago no devuelve historial de facturas | Audita el estado vacio, no la tabla |
| `/settings/horarios` | No hay fechas cerradas cargadas | La lista de "Dias cerrados" sale vacia a proposito |
| `/torneos/[id]/posiciones` | Un solo partido jugado | La tabla existe pero con una fila |
| `/analiticas` | Poca historia: la tasa de ausencias da 100 % sobre 1 turno terminado | **No leas los numeros como si fueran reales.** Audita la forma, el vocabulario y la agrupacion |

### Lo que una foto no puede mostrar

Un screenshot no prueba que pasa despues de apretar, cuanto tarda, ni que dice el aviso de exito o de
error. Eso lo cubre L2 con la app corriendo, y **solo dentro de las tareas del §3**. Si tu lente es
L1, L3 o L4 y tu hallazgo depende de eso, describi lo que se ve y marcalo como "a verificar en vivo"
en el campo `fix`. Afirmar comportamiento desde una foto es el falso positivo mas comun de este
metodo.

---

## 14. Correcciones al plan, medidas contra el código

El diseño se escribió antes de mirar todo. Esto es lo que no cerró:

El diseño se escribió antes de medir todo contra el código. Esto es lo que no cerró. **Donde esta
sección contradice al diseño, manda esta sección.**

| # | Lo que dice el plan | Lo que dice el código | Consecuencia |
| --- | --- | --- | --- |
| 1 | "29 pantallas reales" (§1.2), restando 6 redirects | Son **7** redirects: falta `settings/page.tsx`, que hace `redirect('/settings/reservas')` sin cuerpo ni guard propio | **28 pantallas reales.** Tres agentes lo encontraron por separado. El inventario de §4 igual la lista, marcada como redirect |
| 2 | Las tareas de la recorrida del dueño son 23 | El artifact tiene **24** ítems (A1-A6 + A5b, B1-B5, C1-C5, D1-D3, E1-E4) | 21 en alcance para esta corrida; los 3 del bloque D son del jugador |
| 3 | L2 corre "app corriendo (Playwright MCP)" (§4.2) | Los servidores MCP de Playwright y de chrome-devtools **no conectan** en esta sesión | L2 corre sobre el capturador propio de flujos paso a paso, no sobre MCP. Ver §13 |
| 4 | "el manager… nadie lo fotografió nunca" (§4.5) | El fixture `managerStorageState` **ya existe** (`tests/e2e/fixtures.ts:52`) y `scripts/seed-e2e.ts:311` ya crea el rol | Solo faltan las fotos, no la infraestructura de sesión |
| 5 | "extender `capture-screenshots.spec.ts`" (§4.5) | Ese spec renombra la tabla `bookings` en caliente (línea 558), muta la fixture compartida del admin nuevo, y corre en dos projects a la vez | **No se extiende.** El corpus va en un capturador propio, aislado. Ver §13 |
| 6 | MASTER §13 es una lista de reglas duras (P0.x) | §13 es un **ledger de deuda ya conocida**, con instrucción de borrar el ítem al cerrarlo (MASTER.md:630) | No se cita §13 como regla. Se usa al revés: para NO reportar como nuevo lo que ya está trackeado |
| 7 | MASTER §8.5 es una tabla de vocabulario | En el archivo es **prosa** con flechas inline (MASTER.md:511-516) | Un agente que grepee buscando una tabla no la encuentra. La transcripción a tabla está en §6 de este brief |
| 8 | "El manager NO accede a Configuración" (CLAUDE.md) | `settings/canchas/page.tsx:18` usa `requireOperatorStaff`, no `requireAdminStaff`: el manager **entra por URL directa** y puede activar/desactivar canchas (`actions.ts:183`). Las otras 6 pestañas sí son admin-only | Excepción real y no documentada al candado del sidebar. Es material de hallazgo, no solo de brief |
| 9 | "el manager ve /metricas sin las métricas de sistema" (CLAUDE.md) | El filtro de esa sección es por **SuperAdmin** (`resolveSystemAdmin()`), no por `staff_role` | El efecto observable es correcto, la causa que sugiere la frase no. Un admin de complejo común tampoco la ve |
| 10 | "Plata en la calle" es el nombre de la pestaña (§1.2, y `pages/caja.md` §2.5) | En pantalla dice **"Deudas"** (`CajaTabs.tsx:5`). "Plata en la calle" vive en 8 comentarios de código y jamás llega al usuario | El hallazgo es "la spec quedó vieja", no "el usuario ve dos nombres" |
| 11 | Las tres auditorías previas cerraron ~128 hallazgos (§1.3) | Los 60 del 2026-08-14 sí tienen ledger de cierre. Los **46 del 2026-07-28 no tienen ninguna afirmación de cierre** en ningún doc del repo | §11 los verificó uno por uno contra el código vigente, citando `archivo:línea` en vez de un ledger inexistente |

**Contradicción abierta que la auditoría tiene que resolver, no el brief:** MASTER §8.5 (línea 514)
exige decir **"Pausada"** para una cancha `offline`; el código dice **"Offline"/"Online"**
(`status-visual.tsx:15,21`) y **cita el mismo §8.5 en su comentario** para justificarse. O la spec
quedó vieja o el código nunca se corrigió. Es un hallazgo L1 de manual.
