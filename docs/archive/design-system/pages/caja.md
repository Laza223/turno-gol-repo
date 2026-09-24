# Caja (admin) — spec de vista

> Complementa a `MASTER.md` (ley general). Acá viven las decisiones específicas de `/caja`.
> Hermana de `pages/dashboard.md`, `pages/abonados.md` y `pages/staff.md`: misma convención `§N`,
> mismos tokens, mismo semáforo financiero §2.5, mismo vocabulario §8.5.
> Para INTERACCIÓN (cómo se confirma o se deshace algo) manda `gramatica-interaccion.md`.

**Versión:** 3.0 — 2026-09-17 (densidad y espacio: superficies planas sin card, `/caja/*` a
1600 px, Vender como lista con buscador, Cuentas con la tabla de deudas y el diario lado a lado,
paginación donde no había techo. Decisión: `docs/decisions/2026-09-17-caja-densidad-y-espacio.md`)
**Anterior:** 2.1 — 2026-09-14 (Cuentas pierde la banda de KPIs: "Deudas" y "Devolvés" quedaban
repetidos con la card que ya trae su propia lista, y "Cobrado hoy" pasa a texto en la barra
superior). 2.0 — 2026-09-12 (rediseño: tres destinos por audiencia — Vender · Cuentas · Productos;
la pantalla de venta se queda solo con la venta, y todo lo agregado se muda a Cuentas). 1.0 —
2026-07-02, con parche de alcance el 2026-08-27 (describía "Caja del día": navegación por fecha,
arqueo y ritual de cierre, un subsistema que se eliminó entero el 2026-09-11)
**Código:** `src/app/(admin)/caja/page.tsx` · `cuentas/page.tsx` · `productos/page.tsx` ·
`components/{CajaTabs,Disclosure}.tsx` · `cantina/*` · `deudas/*` · `devoluciones/*` ·
`caja-lib.ts` · `queries.ts` · compartidos: `components/admin/SectionHeader.tsx`,
`components/ui/pager.tsx`, `components/ui/responsive-list.tsx` (`flat`)
**Personalidad:** Admin ("El Mostrador") — densidad alta, motion ≤ 200 ms, cero decoración.

---

## §0 Objetivo y anti-objetivo

Caja es **dos cosas con dos dueños**, y ese es el eje de todo este documento:

- Una **caja registradora**. La usa Rodrigo (encargado), de pie, con una mano y con gente
  esperando. Cada venta es un puñado de toques y se repite decenas de veces por noche.
- Un **libro de cuentas**. Lo mira Marcelo (dueño), sentado, una o dos veces por día: cuánto entró,
  quién le debe, qué tiene que devolver, qué pasó hoy.

Hasta la v1.0 convivían en la misma pantalla con el mismo peso, y el costo lo pagaba siempre el
mismo: quien vende. La jerarquía ahora la fija la URL, no un modo ni un selector.

**Anti-objetivo:** no es Reportes (sin tendencias mensuales) y no es contabilidad AFIP (ADR-011).
Y **no vuelve a ser un ritual**: no hay apertura, cierre ni arqueo, y ningún movimiento de plata se
bloquea nunca por el estado de la caja (ver `docs/decisions/2026-09-11-eliminar-caja-del-dia.md`).

## §1 Qué cambió en la v2.0, y por qué

| #   | Qué se hizo                                                                                                     | Por qué                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cuatro pestañas → **tres destinos**: Vender (`/caja`), Cuentas (`/caja/cuentas`), Productos (`/caja/productos`) | Deudas y Devoluciones eran dos URLs para la misma pregunta —"¿qué plata está pendiente?"— mirada desde los dos lados                                            |
| 2   | `PageHeader` fuera de las tres pantallas; los destinos cuelgan del `AdminHeaderSlot`                            | 120 px que no decían nada: el riel ya dice "Caja" y la pestaña activa dice cuál de los tres. Mismo movimiento que hicieron Grilla y Configuración (MASTER §6.8) |
| 3   | Los tres totales, el desglose por método y el diario del día se mudan de `/caja` a Cuentas                      | Quien vende no los mira, y ocupaban la mitad de la pantalla donde trabaja                                                                                       |
| 4   | Barra de cobro pegada abajo en el teléfono, visible solo con ticket cargado                                     | El botón de cobro quedaba debajo del catálogo, con scroll propio. Ahora no hay scroll para llegar a él                                                          |
| 5   | Se elimina "Recientes / accesos rápidos"                                                                        | Repetía el catálogo entero y, en mobile, empujaba la venta bajo el pliegue                                                                                      |
| 6   | El buscador de productos aparece recién con 13 productos o más (`SEARCH_MIN_PRODUCTS`)                          | Con un catálogo chico buscar es más lento que tocar, y el campo solo empuja las tarjetas hacia abajo                                                            |
| 7   | El desglose por método deja de estar plegado y entra dentro de la card "Cobrado hoy"                            | La pregunta y la respuesta juntas. Además pasó de **neto** a **cobrado**, ver §3                                                                                |
| 8   | El monto viaja dentro del botón: "Cobrar $ 7.000"                                                               | El primer toque no debería obligar a leer la fila para saber cuánto se está por cobrar                                                                          |
| 9   | Se retira el campo de nota libre del fiado                                                                      | Texto libre sobre una persona. Ley 25.326: lo que un cliente puede leer ejerciendo derecho de acceso se controla en origen, igual que con `abonados.notes`      |
| 10  | Marcar una seña devuelta deja de pedir la frase tipeada `DEVOLVER`                                              | Pasa de Clase C a Clase B. Decisión del dueño: el método explícito y un botón que dice el monto ya son dos decisiones conscientes                               |
| 11  | En Productos, el informe se despliega y Reponer/Editar salen del menú "…"                                       | La pregunta semanal del dueño es "qué se vende"; esconderla detrás de un click la dejaba sin respuesta. Ver §2.3                                                |

### §1.1 Qué cambió en la v3.0, y por qué

La v2.0 decidió QUÉ va en cada destino; la v3.0, CÓMO se ve. Decisión completa:
`docs/decisions/2026-09-17-caja-densidad-y-espacio.md`.

| #   | Qué se hizo                                                                                                                                                                | Por qué                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Superficies planas: `SectionHeader` + línea de 1 px en vez de card con borde y sombra                                                                                      | "Cajas dentro de cajas" comían ancho y se leían como plantilla (plan de diseño 2026-09-17 §2)                                           |
| 13  | `/caja/*` a `max-w-[1600px]` (hoy, el tope de todo el panel)                                                                                                               | Con `max-w-7xl` un monitor de 1920 dejaba ~320 px muertos de cada lado                                                                  |
| 14  | Vender: filas en vez de cuadros, buscador SIEMPRE (con foco solo con mouse), `Enter` agrega el primero, filtro Productos/Servicios. **Revierte #6**                        | Con 3-15 artículos, una lista con buscador es más rápida que una grilla de botones, y es lo que el dueño espera de una caja             |
| 15  | Fiados fuera de Vender: una línea de aviso que lleva a Cuentas; en su lugar, los últimos 3 movimientos                                                                     | Un fiado se cobra donde se cobra toda deuda; en Vender lo que sirve es el acuse de recibo del cobro recién hecho                        |
| 16  | Cuentas: deudas como tabla a la izquierda y diario del día a la derecha; la fila de un turno abre el turno                                                                 | Cada tarjeta de deuda medía ~150 px: con 14 deudas el diario quedaba fuera de la vista                                                  |
| 17  | Mueren las tarjetas "Deudas" y "Tenés que devolver": el total va en el encabezado de su lista                                                                              | Mismo número dos veces, pagando el alto de cinco filas                                                                                  |
| 18  | "Tenés que devolver" solo existe con filas, y entonces va primero                                                                                                          | Vacía era permanente para casi todos, e imposible de llenar sin seña por MercadoPago                                                    |
| 19  | "Cobrado hoy", la fecha y "Registrar movimiento" bajan al encabezado del diario. **Revierte §3**                                                                           | Arriba, pegado a la fecha, el botón "no se percibe y no se entiende qué hace" (dueño)                                                   |
| 20  | Paginación con total y páginas numeradas (MASTER §6.6): deudas 25, catálogo 25 y devoluciones 5 en el cliente; diario 25 y ledger de stock 20 por URL (`?mov=`, `?stock=`) | Ninguna tenía techo; del ledger solo se veían los últimos 20. Los productos pausados no se borran nunca, así que el catálogo solo crece |
| 21  | El alta de producto controla stock por defecto; el stock inicial es obligatorio                                                                                            | Casi todo lo que vende una cantina se cuenta                                                                                            |
| 22  | Punto ámbar en la pestaña "Productos" con productos para reponer; "N para reponer" en el catálogo                                                                          | El aviso existía solo por fila, adentro de Productos: el dueño no se enteraba sin entrar                                                |

### Lo que NO se repuso, y no se repone

- **Apertura, cierre y arqueo.** Agregaban un paso diario que nadie hacía bien y, peor, bloqueaban
  cobros con la caja "cerrada". `daily_cash_opens` / `daily_cash_closes` siguen en el schema con
  datos históricos, **sin UI y sin escritura desde código de aplicación**. Los cierres viejos con
  `expected_cash NULL` no se reinterpretan nunca.
- **Navegación por fecha y diario de un día pasado.** Se perdieron con "Caja del día". El dato está
  en la base; la pantalla, no. Reponerlo es una feature nueva, no una reactivación.
- **Devolución automática por API.** TurnoGol no puede devolver plata: el permiso de reembolso de
  MercadoPago solo funciona con la cuenta dueña de la aplicación. La devolución la hace el complejo
  por fuera y el sistema solo registra que ya se hizo. Un botón que parezca ejecutarla es mentira.
- **Catálogo de productos en `tenants.settings`.** Vive en tablas reales desde la migración 051.
- **El efectivo esperado en el cajón.** Se calcula, no se muestra: es el arqueo con otro nombre.

## §2 Anatomía — tres destinos

La navegación interna es `CajaTabs`: `ScrollTabs` colgado del `AdminHeaderSlot`, igual que
`SettingsTabs` y `GrillaTabs` (MASTER §6.8 — cada espacio resuelve su estructura con pestañas, y
esas pestañas viven en la barra superior, no en el cuerpo). Su prop `actions` cuelga a la derecha
del mismo hueco. Las tres comparten guard: `requireCajaContext()` en `../queries`, que envuelve
`requireOperatorStaff` — **Caja también la usa el encargado**.

```
┌─riel 72─┬─ barra 60 px ─────────────────────────────────────────┐
│   Hoy   │ Complejo   Vender│Cuentas│Productos•                     │
│  Grilla │            └──── CajaTabs ────┘ (• = hay stock para reponer)│
│ ▸ Caja  ├───────────────────────────────────────────────────────┤
│Clientes │                                                        │
│ Canchas │  (contenido del destino, sin encabezado propio)         │
│Métricas │                                                        │
│  ⚙︎      │                                                        │
└─────────┴────────────────────────────────────────────────────────┘
```

### §2.1 Vender — `/caja`

Lo único que hay es vender. Carga tres cosas: el catálogo (`listProducts`), los fiados abiertos
(`listOpenTabs`, solo para la línea de aviso) y los últimos tres movimientos del día
(`getCashFlows` con `limit: 5` — `LIMIT` en SQL, no un `slice`). No hay encabezado propio ni
totales.

- **Escritorio**: catálogo a la izquierda, **Ticket pegado a la derecha** (`lg:sticky`). Debajo, la
  línea de fiados (si hay) y "Últimos movimientos".
- **El catálogo es una lista, no una grilla de botones.** Cada fila es un `<button>` cuyo nombre
  accesible arranca con el nombre del producto (contrato e2e): `nombre · stock · precio · ×N`,
  `min-h-11 md:min-h-10`, separadas por `divide-y`.
- **Buscador siempre visible**, sin el umbral de 13 productos. Filtra la lista visible (no abre un
  combobox), sin acentos ni mayúsculas (`normalizeForSearch`). `Enter` agrega el primer resultado
  disponible y limpia el campo. **Foco automático solo con `(pointer: fine)`**: en el teléfono un
  `autoFocus` abriría el teclado encima del catálogo.
- **Filtro Todos · Productos · Servicios**, derivado de `stock IS NULL`. No hay columna de
  categoría y no se agrega (ver la decisión de la v3.0). Se oculta si hay un solo grupo.
- **Techo de alto del catálogo solo en `lg`** (`lg:max-h-[max(12rem,calc(100dvh-35rem))]`, scroll propio, que descuenta lo que va debajo): ahí
  el Ticket es una columna `sticky` aparte y acotar el catálogo deja la página sin scroll. En el
  teléfono no hay techo — el `max-h-[45vh]` de antes empujaba el botón de cobro fuera de pantalla,
  y por eso manda la barra de cobro pegada abajo.
- **Teléfono**: el panel del Ticket **no se renderiza** (`hidden md:flex`). Lo reemplaza una barra
  pegada abajo que aparece recién cuando hay algo en el ticket, con resumen, Vaciar, los tres
  métodos, "Cobrar $ X" y "Fiado". Va a `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]`, o sea
  justo encima de `AdminBottomNav`. **Nada se mueve de lugar** al tocar el primer producto.
- Lo que ya está en el ticket se marca con **fondo tenue además del contador ×N**: el contador solo
  no se ve de reojo mientras se toca rápido (§1.4, nada comunica solo con color).
- Agotado: la fila queda deshabilitada **y lo dice con texto** ("Agotado"), no solo con opacidad.
- **Fiados**: una línea "N fiados abiertos · $ X — Cobrar en Cuentas", solo si hay. Se cobran en
  Cuentas, donde se cobra toda deuda.
- **Últimos movimientos**: los tres más nuevos del día, a lo ancho debajo del catálogo (elegido por el dueño sobre ponerlos bajo el Ticket), con "Ver todos los del día" en el encabezado
  cuando hay más. Tres y no cinco: con cinco la pantalla scrolleaba 114 px a 1440×900. Es el acuse de recibo del cobro ("¿entró?", "¿lo cargué dos veces?"), no un
  informe: sin totales y sin alta de movimiento.

### §2.2 Cuentas — `/caja/cuentas`

El libro. La barra superior queda solo con los tres destinos.

- **"Tenés que devolver" arriba, a lo ancho, solo si hay filas** (§4).
- Debajo, **Deudas a la izquierda y el diario del día a la derecha**
  (`xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`; abajo de `xl`, apilados). Las dos visibles sin
  scroll en escritorio: son las dos preguntas con las que el dueño entra.
- **Deudas es una tabla** (`Quién · Detalle · Desde · Debe · acciones`, `min-w-[620px]`), no una
  pila de tarjetas. El total va como texto en su encabezado ("$ 140.300 · 14 pendientes"). Buscador
  por nombre y chips de origen arriba; **25 filas por página, paginadas en el cliente** (la lista
  ya llega entera y se filtra sobre toda, no sobre la página).
- **La fila de un turno entera abre el turno** (`/reservas/:id`): el link del detalle se estira
  sobre la fila con `::after`, y el nombre (a la ficha del cliente), WhatsApp, Anular y Cobrar van
  `relative z-10` por encima. La fecha va en formato medio (§8.3), nunca ISO.
- **El diario del día** lleva en su encabezado el día de trabajo, lo cobrado hoy y "Registrar
  movimiento" (§3). Tres columnas (`Hora · Movimiento · Monto`; categoría y método en la segunda
  línea) para entrar en la columna angosta sin scroll horizontal. **25 por página, por URL**
  (`?mov=`, 1-based, `getCashFlows` con `limit + 1` / `offset`).

### §2.3 Productos — `/caja/productos`

Catálogo a la izquierda y "qué se vende" a la derecha, con la misma proporción que Cuentas
(`lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`). El ledger de stock queda plegado abajo.

- **El informe deja de estar plegado.** La pregunta que trae al dueño acá una vez por semana es
  "¿qué sale y qué no?", y tenerla detrás de un click la dejaba sin respuesta visible. Es el único
  lugar de toda la sección donde un gráfico se justifica.
- **El ledger de stock sí sigue plegado**, porque es trazabilidad: se consulta cuando un número no
  cierra. Su encabezado muestra el último movimiento (`lastMovementSummary`) para saber, sin
  abrirlo, si pasó algo desde la última vez. **Pagina de a 20 por URL** (`?stock=`, `getLedger` con
  `offset`); con `?stock=` el bloque arranca abierto para que "Siguientes" no devuelva a un bloque
  cerrado.
- **El alta de producto controla stock por defecto** y el stock inicial es obligatorio: sin él el
  producto nacería "Agotado". "No controlar" queda para servicios y alquileres.
- **El modal de alta/edición** (`max-w-4xl`) va en dos bloques con título —"El producto" (nombre,
  precio, costo) y "Stock"— separados por una línea, y **cada campo lleva una línea de ayuda**
  colgada por `aria-describedby`: quien carga su primer producto no tiene por qué saber qué es un
  costo o un stock mínimo. Con precio y costo se muestra la ganancia en palabras ("Ganás $ 800 por
  unidad (40 % del precio)"); por debajo del costo, como pérdida. Antes decía "Margen: …".
- **Stock bajo: luz amarilla, no sirena.** El encabezado del catálogo dice "N para reponer" en
  ámbar, y la pestaña "Productos" lleva un punto ámbar (con el conteo en `sr-only`) visible desde
  los tres destinos. Sin banner ni toast. El predicado es uno solo: `countLowStock` (en memoria,
  Vender y Productos) y `lowStockCount` (SQL, Cuentas) cuentan lo mismo que el badge de la fila
  ("Quedan N" o "Agotado") — lo vigila `canteen-catalog.test.ts`.
- **Reponer y Editar están en la fila**, fuera del menú de tres puntos: son las dos acciones de la
  visita semanal y esconderlas obliga a recordar dónde estaban. El menú queda con lo ocasional —
  "Salida de stock" y "Pausar/Reactivar".
- **Lo que exige acción es lo único que salta**: con stock bajo o agotado, "Reponer" pasa a botón
  resaltado, y la fila agotada toma un fondo rojo tenue. El resto no se atenúa (atenuar para
  destacar rompe AA, §9).
- **Costo y margen salieron de la tabla** y viven en la hoja de edición, al lado de los dos números
  que los forman: son un dato de decisión de precio, no de repaso de stock. La columna "Estado"
  también se fue; los pausados se ordenan al final, en gris y con el rótulo "(pausado)".
- El encargado entra a esta pantalla; lo que no puede es editar el catálogo
  (`canEditCatalog={role === 'admin'}`, enforced de verdad en las tres actions con
  `requireAdminStaffAction`). Reponer stock sí puede, y por eso "Editar" no le aparece en la fila.

## §3 Cobrado hoy — texto, no card

Hasta la v2.0, Cuentas abría con `CajaHeaderStats`: tres `MetricCard` ("Cobrado hoy", "Deudas",
"Devolvés") en una banda de ancho completo. Se eliminó (feedback directo del dueño, 2026-09-14):
"Deudas" y "Devolvés" eran el MISMO número que ya muestran, como su propia card, `StreetMoneyList`
y `PendingRefundsList` más abajo (§4) — dos maquetas para un solo dato, pagando espacio de pantalla
por cero información nueva. Para una pantalla que el dueño mira a diario, ese costo no se justificaba.

`getDaySummary` sigue devolviendo `collectedByMethod` y el servicio no cambió — lo que se sacó es
la vidriera. El detalle por método (antes en el `footer` de la card) se sacó entero: en una pantalla
de valor bajo por visita, mostrarlo exigía la misma o más superficie que el número solo, y nadie lo
pidió junto con el reclamo de espacio.

- **"Cobrado hoy" es texto en el encabezado del diario del día** (v3.0), junto al rótulo del día:
  "jue 17 de septiembre · Cobrado $ 45.000". Sin card, sin ícono, sin accent: `summary.collected`
  con `formatArs`. En la v2.1 colgaba de la barra superior pegado a la fecha y al botón de alta, y
  el dueño no lo percibía ni entendía qué hacía el botón: al lado de la lista que lo explica, el
  número tiene contexto y "Registrar movimiento" queda junto a lo que alimenta.
- **Ninguna lista tiene una tarjeta de KPI arriba** (v3.0): el total de Deudas y el de Devolvés van
  como texto en el encabezado de su propia lista. En $0, Deudas lo dice con su `EmptyState` ("Sin
  deudas") y Devolvés directamente no se dibuja (§4).

## §4 Deudas y Devolvés — dos listas, nunca un neto

Son las **dos direcciones opuestas** de la plata pendiente: lo que te deben y lo que debés. Se
muestran juntas porque son la misma pregunta, y separadas porque restarlas rompería el invariante
más protegido de esta sección.

- El total de Deudas tiene **una sola fuente**: `src/modules/cashflow/street-money.service.ts`. Lo
  leen la pantalla "Hoy" y `StreetMoneyList`, que suma las filas de `getStreetMoney` DENTRO del
  propio componente para su encabezado — un solo cálculo, no dos números que puedan divergir. El
  `sumStreetMoney` que corre en `cuentas/page.tsx` alimenta únicamente el breadcrumb
  `street_money.viewed` (§11); nada visible depende de él desde que se sacó la banda de KPIs (§3).
- Devolvés sale de `listPendingRefunds`, que deliberadamente **no** entra en `getStreetMoney`.
- **Devolvés solo existe con filas** (v3.0): `PendingRefundsList` devuelve `null` sin devoluciones.
  Una devolución pendiente es rara y, en un complejo que no cobra seña por MercadoPago, imposible;
  el bloque vacío ocupaba el lugar de honor para casi todos. No se mira la configuración de seña:
  un complejo que cobró señas y después las apagó todavía puede deber, y "sin filas, no hay
  sección" cubre los dos casos. Cuando hay algo, va primero, a lo ancho: es plata que sale.
- La ventana por defecto son los últimos 12 meses (`STREET_MONEY_DEFAULT_MONTHS`) y el rótulo lo
  dice **siempre**, no solo cuando hay algo escondido: una pantalla de plata que muestra una
  ventana sin decirlo se lee como "esto es todo lo que me deben". `?todas=1` trae la deuda entera.
- Los links de WhatsApp y "ver el turno" de una deuda viven en su fila y en su diálogo de cobro. En
  Devolvés, WhatsApp se queda en la fila: avisarle al jugador **es** la acción.

## §5 El día de trabajo

El día de Caja **no es el de las reservas**: usa un cutoff único por complejo (`nightCutoffMins`),
no uno por día de la semana. Sale de `requireCajaContext()`, que ya calcula `cutoffMins` y `today`
con `operatingDateOf`. Nunca se deriva con `new Date().toISOString().slice(0,10)` — entre las 21:00
y la medianoche eso devuelve el día siguiente, y hay una regla de ESLint que lo bloquea.

**Decisión: el rótulo del día se muestra, y solo cuando dice algo.** `operatingDayLabel` devuelve
"jue 2 de julio" con cutoff 0 —la inmensa mayoría de los complejos— y "jue 2 de julio · desde las
06:00" cuando el complejo cierra pasada la medianoche. Ese criterio no se veía en ningún lado y es
lo que hace que los totales "no cierren" a ojo en un complejo que trabaja de madrugada. Con cutoff
0, agregar "desde las 00:00" sería ruido en una pantalla que vive de leerse rápido.

Ninguna pantalla de Caja navega por fecha: siempre es hoy.

## §6 Diálogos y confirmaciones

Clases según `gramatica-interaccion.md`. Ningún `window.confirm()`.

| Acción               | Clase | Cómo                                                                                                                         |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| Anotar fiado         | —     | `Dialog` con **un** campo: a nombre de quién. Botón "Anotar fiado — $ X"                                                     |
| Cobrar un fiado      | B     | `SplitPaymentFields`, con "Cobrar todo en efectivo" como atajo                                                               |
| Anular un fiado      | B     | Motivo obligatorio. Devuelve el stock; la plata nunca se tocó                                                                |
| Marcar seña devuelta | **B** | `ConfirmDialog` con `consequences`, chips de método (`RadioChipGroup`), botón "Marcar devuelta · $ X". **Sin frase tipeada** |
| Registrar movimiento | —     | `RegisterMovementModal`, chips de tipo y categoría                                                                           |

**Decisión: "marcar devuelta" bajó de Clase C a Clase B.** Era el mismo trato que "Cerrar caja del
día", un ancla que ya no existe. Sigue siendo irreversible, y por eso las consecuencias se muestran
enteras —incluido que no mueve plata en MercadoPago y que se anota como gasto del día cuando el
medio es efectivo o transferencia—, pero tipear una palabra en el mostrador es lo más caro que se
le puede pedir a alguien. Las consecuencias salen del código de la action, no de memoria.

**Decisión: el fiado pide una sola cosa.** El campo de nota se retiró y `note` salió del schema de
la Server Action: no es que la UI lo esconda, es que ya no hay camino para escribirlo. La columna
`canteen_tabs.note` sigue en la base con lo cargado antes y **la lista dejó de publicarlo**.

## §7 Guided UX

El hint `tg-hint-caja-cierre` murió con el cierre de caja. No se reemplaza por otro: el vacío de
Vender ("Cargá tus productos… y registrá cada venta con un toque") y el de Movimientos ya enseñan
en el momento de la necesidad, que es la regla de MASTER §7.

## §8 Formato

`formatArs` de `@/lib/format` para todo monto (centavos enteros, sin decimales). El separador entre
`$` y el número es un **espacio duro**: en tests hay que buscar por nodo, porque testing-library
normaliza el texto del DOM pero no el matcher. Fechas en formato medio §8.3, nunca ISO. Horas en
24h con `formatTimeArt`.

## §9 Accesibilidad y táctil

- **44 px de blanco táctil** en todo lo que se toca (`h-11 md:h-10`). Acá pesa más que en ninguna
  otra pantalla: la venta se ejecuta de pie y con una mano.
- Campos con `text-base md:text-sm` (§3.1): abajo de 16 px iOS hace zoom al enfocar.
- Verde y rojo con los números de §2.4, no de memoria: `text-emerald-700` sobre cards y
  `text-emerald-800` sobre el fondo de página en claro, `text-emerald-400` en oscuro; ámbar sobre
  card `text-amber-800` / `dark:text-amber-300`. Nada de modificadores de opacidad sobre
  `--muted-foreground`, que ya está calibrado al límite. **Desde la v3.0 casi todo apoya sobre el
  fondo de página**, así que el verde de texto por defecto en Caja es `emerald-800`: con
  `emerald-700` el monto de un ingreso da 4,41:1 y el gate de Storybook lo rechaza.
- El estado de stock viaja con texto ("Agotado", "Quedan 3"), nunca solo con color.

## §10 Contratos de test

- `tests/unit/caja-tabs.test.tsx` — tres destinos, sus hrefs, `aria-current` y el aviso de stock
  en el nombre accesible de "Productos".
- `tests/unit/caja-lib.test.ts` — `operatingDayLabel`, `methodBreakdown`, badges de stock,
  `countLowStock` (caso por caso igual que el badge), formato.
- `tests/unit/admin-routes-reachable.test.ts` — lee `CajaTabs.tsx` como fuente de rutas.
- `tests/unit/app-page-guard-chain.test.ts` — `deudas/` y `devoluciones/` están exentas por ser
  redirects de compat, igual que `cantina/`.
- Stories: `TicketPanel` (incluye buscar + `Enter` y el filtro por grupo), `FiadosList` (incluye
  que la nota del fiado **no** se publica), `ProductsTable`, `ProductFormDialog` (alta con stock por
  defecto, servicio sin stock, error sin stock inicial), `PendingRefundsList` (sin filas no dibuja
  nada), `CanteenReport`, `StockLedgerList`; compartidos `SectionHeader` y `Pager`.
  `CajaHeaderStats.stories.tsx` se borró junto con el componente. **Sin story**: `StreetMoneyList`
  y `MovementsList` (sus diálogos importan Server Actions por valor); el e2e las cubre.
- Integración: `street-money-window.test.ts`, `street-money-consistency.test.ts`, `cashflow.test.ts`
  (incluye que `limit`/`offset` recorren el día sin repetir ni saltear), `canteen-stock.test.ts`
  (lo mismo para `getLedger`), `canteen-catalog.test.ts` (`lowStockCount` ≡ `countLowStock`),
  `refund-lifecycle.test.ts`.
- e2e: `tests/e2e/caja-redesign.spec.ts` — el fiado se anota en Vender y se cobra desde la tabla
  de Deudas de Cuentas.

## §11 Deuda declarada / fuera de scope

1. **Los fiados abiertos no muestran qué se llevó.** Las líneas existen en `stock_movements` con
   `tab_id`, pero `listOpenTabs` no las trae y sumarlas es una query nueva por fila.
2. **Cobrar dos fiados de la misma persona de una vez**, o sumar a un fiado abierto: hoy cada fiado
   es un ticket separado. Unificarlos requiere una acción nueva.
3. **MASTER §7.2 y §9 todavía usan "Cerrar caja"** como ejemplo canónico de coachmark y de
   Peak-End. Son dos líneas que quedaron mintiendo desde el 2026-09-11; no se tocan acá porque
   están fuera del alcance de este rediseño.
4. **`/caja` no tiene foto de regresión visual.** Ningún canario de layout cubre esta sección.
