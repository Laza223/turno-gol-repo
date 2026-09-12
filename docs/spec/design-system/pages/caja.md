# Caja (admin) — spec de vista

> Complementa a `MASTER.md` (ley general). Acá viven las decisiones específicas de `/caja`.
> Hermana de `pages/dashboard.md`, `pages/abonados.md` y `pages/staff.md`: misma convención `§N`,
> mismos tokens, mismo semáforo financiero §2.5, mismo vocabulario §8.5.
> Para INTERACCIÓN (cómo se confirma o se deshace algo) manda `gramatica-interaccion.md`.

**Versión:** 2.0 — 2026-09-12 (rediseño: tres destinos por audiencia — Vender · Cuentas · Productos;
la pantalla de venta se queda solo con la venta, y todo lo agregado se muda a Cuentas)
**Anterior:** 1.0 — 2026-07-02, con parche de alcance el 2026-08-27 (describía "Caja del día":
navegación por fecha, arqueo y ritual de cierre, un subsistema que se eliminó entero el 2026-09-11)
**Código:** `src/app/(admin)/caja/page.tsx` · `cuentas/page.tsx` · `productos/page.tsx` ·
`components/{CajaTabs,CajaHeaderStats,Disclosure}.tsx` · `cantina/*` · `deudas/*` · `devoluciones/*` ·
`caja-lib.ts` · `queries.ts`
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

| # | Qué se hizo | Por qué |
|---|---|---|
| 1 | Cuatro pestañas → **tres destinos**: Vender (`/caja`), Cuentas (`/caja/cuentas`), Productos (`/caja/productos`) | Deudas y Devoluciones eran dos URLs para la misma pregunta —"¿qué plata está pendiente?"— mirada desde los dos lados |
| 2 | `PageHeader` fuera de las tres pantallas; los destinos cuelgan del `AdminHeaderSlot` | 120 px que no decían nada: el riel ya dice "Caja" y la pestaña activa dice cuál de los tres. Mismo movimiento que hicieron Grilla y Configuración (MASTER §6.8) |
| 3 | Los tres totales, el desglose por método y el diario del día se mudan de `/caja` a Cuentas | Quien vende no los mira, y ocupaban la mitad de la pantalla donde trabaja |
| 4 | Barra de cobro pegada abajo en el teléfono, visible solo con ticket cargado | El botón de cobro quedaba debajo del catálogo, con scroll propio. Ahora no hay scroll para llegar a él |
| 5 | Se elimina "Recientes / accesos rápidos" | Repetía el catálogo entero y, en mobile, empujaba la venta bajo el pliegue |
| 6 | El buscador de productos aparece recién con 13 productos o más (`SEARCH_MIN_PRODUCTS`) | Con un catálogo chico buscar es más lento que tocar, y el campo solo empuja las tarjetas hacia abajo |
| 7 | El desglose por método deja de estar plegado y entra dentro de la card "Cobrado hoy" | La pregunta y la respuesta juntas. Además pasó de **neto** a **cobrado**, ver §3 |
| 8 | El monto viaja dentro del botón: "Cobrar $ 7.000" | El primer toque no debería obligar a leer la fila para saber cuánto se está por cobrar |
| 9 | Se retira el campo de nota libre del fiado | Texto libre sobre una persona. Ley 25.326: lo que un cliente puede leer ejerciendo derecho de acceso se controla en origen, igual que con `abonados.notes` |
| 10 | Marcar una seña devuelta deja de pedir la frase tipeada `DEVOLVER` | Pasa de Clase C a Clase B. Decisión del dueño: el método explícito y un botón que dice el monto ya son dos decisiones conscientes |
| 11 | En Productos, el informe se despliega y Reponer/Editar salen del menú "…" | La pregunta semanal del dueño es "qué se vende"; esconderla detrás de un click la dejaba sin respuesta. Ver §2.3 |

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
│   Hoy   │ Complejo   Vender│Cuentas│Productos   vie 12  [Movim.]│
│  Grilla │            └──── CajaTabs ────┘       └── actions ───┘│
│ ▸ Caja  ├───────────────────────────────────────────────────────┤
│Clientes │                                                        │
│ Canchas │  (contenido del destino, sin encabezado propio)         │
│Métricas │                                                        │
│  ⚙︎      │                                                        │
└─────────┴────────────────────────────────────────────────────────┘
```

### §2.1 Vender — `/caja`

Lo único que hay es vender y cobrar un fiado. Carga dos cosas: el catálogo (`listProducts`) y los
fiados abiertos (`listOpenTabs`). No hay encabezado propio, no hay totales, no hay diario.

- **Escritorio**: catálogo a la izquierda, **Ticket pegado a la derecha** (`lg:sticky`), fiados
  abiertos debajo del catálogo.
- **Teléfono**: el panel del Ticket **no se renderiza** (`hidden md:flex`). Lo reemplaza una barra
  pegada abajo que aparece recién cuando hay algo en el ticket, con resumen, Vaciar, los tres
  métodos, "Cobrar $ X" y "Fiado". Va a `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]`, o sea
  justo encima de `AdminBottomNav`.
- **Nada se mueve de lugar** al tocar el primer producto: la barra entra en un espacio que antes no
  ocupaba nadie.
- El catálogo ya **no tiene scroll propio** (antes `max-h-[45vh]`). Competía con el scroll de la
  página, y el botón de cobro se iba de pantalla al crecer el catálogo. Con la barra pegada abajo
  ese recorte dejó de tener función.
- Lo que ya está en el ticket se marca con **borde y fondo emerald además del contador ×N**: el
  contador solo no se ve de reojo mientras se toca rápido (§1.4, nada comunica solo con color).
- Agotado: la tarjeta queda deshabilitada **y lo dice con texto** ("Agotado"), no solo con opacidad.

### §2.2 Cuentas — `/caja/cuentas`

El libro. En el hueco de la barra superior, al lado de los tres destinos, cuelgan el rótulo del
día de trabajo (oculto abajo de `sm`, donde la barra apenas entra con las pestañas) y el botón
"Movimiento". Debajo: los tres números, después Deudas y Devolvés lado a lado
(`lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` — Deudas manda en ancho: tiene más filas y más
acción), y al final el diario del día a ancho completo.

### §2.3 Productos — `/caja/productos`

Catálogo a la izquierda y "qué se vende" a la derecha, con la misma proporción que Cuentas
(`lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`). El ledger de stock queda plegado abajo.

- **El informe deja de estar plegado.** La pregunta que trae al dueño acá una vez por semana es
  "¿qué sale y qué no?", y tenerla detrás de un click la dejaba sin respuesta visible. Es el único
  lugar de toda la sección donde un gráfico se justifica.
- **El ledger de stock sí sigue plegado**, porque es trazabilidad: se consulta cuando un número no
  cierra. Su encabezado muestra el último movimiento (`lastMovementSummary`) para saber, sin
  abrirlo, si pasó algo desde la última vez.
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

## §3 Los tres números — `CajaHeaderStats`

Tres `MetricCard` en Cuentas, y **solo** en Cuentas. Perdieron su `href`: antes llevaban a la
pestaña con el detalle, y ahora el detalle está en esa misma pantalla, más abajo.

| Card | Fuente | Accent | Sub |
|---|---|---|---|
| Cobrado hoy | `summary.collected` | `emerald` siempre | desglose por método en el `footer` |
| Deudas | `sumStreetMoney(rows)` | `amber` si > 0, `emerald` si 0 | "N pendientes de cobro" / "Nadie te debe nada" |
| Devolvés | suma de `listPendingRefunds` | `red` si > 0, `emerald` si 0 | "N señas sin devolver" / "No debés ninguna seña" |

**Decisión: el desglose muestra lo COBRADO por método, no el neto.** `summary.byMethod` resta los
egresos de su propio método porque servía al arqueo; sus partes suman `balance`. Metido dentro de
una card cuyo título dice "Cobrado hoy" eso sería una contradicción aritmética a la vista: los
números de adentro no darían el número de arriba. Por eso `getDaySummary` devuelve además
`collectedByMethod` (ingresos + ajustes, sin egresos), cuyas partes suman exactamente `collected`.
`byMethod` se conserva: contesta otra pregunta y tiene su propio test de integración.

**Decisión: cero en verde, con texto.** Cuando no hay deuda ni devoluciones pendientes las cards
pasan a `emerald` y el sub lo dice en palabras. Es un premio, no un vacío — y el color nunca viaja
solo (§1.4).

**Decisión: el sub cuenta filas, no antigüedad.** "La más vieja hace 20 días" exigía un helper de
humanización nuevo; la antigüedad ya está en cada fila de la lista, que está ordenada por eso
mismo. El count es el dato accionable y sale de las filas que se listan abajo.

## §4 Deudas y Devolvés — dos listas, nunca un neto

Son las **dos direcciones opuestas** de la plata pendiente: lo que te deben y lo que debés. Se
muestran juntas porque son la misma pregunta, y separadas porque restarlas rompería el invariante
más protegido de esta sección.

- El total de Deudas tiene **una sola fuente**: `src/modules/cashflow/street-money.service.ts`. Lo
  leen esta pantalla, la lista de abajo y la pantalla "Hoy". Cuentas usa `sumStreetMoney` sobre las
  MISMAS filas que lista, así que la card y la lista no pueden divergir: no hay dos cuentas, hay una.
- Devolvés sale de `listPendingRefunds`, que deliberadamente **no** entra en `getStreetMoney`.
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

| Acción | Clase | Cómo |
|---|---|---|
| Anotar fiado | — | `Dialog` con **un** campo: a nombre de quién. Botón "Anotar fiado — $ X" |
| Cobrar un fiado | B | `SplitPaymentFields`, con "Cobrar todo en efectivo" como atajo |
| Anular un fiado | B | Motivo obligatorio. Devuelve el stock; la plata nunca se tocó |
| Marcar seña devuelta | **B** | `ConfirmDialog` con `consequences`, chips de método (`RadioChipGroup`), botón "Marcar devuelta · $ X". **Sin frase tipeada** |
| Registrar movimiento | — | `RegisterMovementModal`, chips de tipo y categoría |

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
  `--muted-foreground`, que ya está calibrado al límite.
- El estado de stock viaja con texto ("Agotado", "Quedan 3"), nunca solo con color.

## §10 Contratos de test

- `tests/unit/caja-tabs.test.tsx` — tres destinos, sus hrefs y `aria-current`.
- `tests/unit/caja-lib.test.ts` — `operatingDayLabel`, `methodBreakdown`, badges de stock, formato.
- `tests/unit/admin-routes-reachable.test.ts` — lee `CajaTabs.tsx` como fuente de rutas.
- `tests/unit/app-page-guard-chain.test.ts` — `deudas/` y `devoluciones/` están exentas por ser
  redirects de compat, igual que `cantina/`.
- Stories: `CajaHeaderStats` (el desglose y los tres estados de color), `TicketPanel`, `FiadosList`
  (incluye que la nota del fiado **no** se publica), `ProductsTable`, `CanteenReport`.
- Integración: `street-money-window.test.ts`, `street-money-consistency.test.ts`, `cashflow.test.ts`,
  `canteen-*.test.ts`, `refund-lifecycle.test.ts`.
- e2e: `tests/e2e/caja-redesign.spec.ts`.

## §11 Deuda declarada / fuera de scope

1. **Los fiados abiertos no muestran qué se llevó.** Las líneas existen en `stock_movements` con
   `tab_id`, pero `listOpenTabs` no las trae y sumarlas es una query nueva por fila.
2. **Cobrar dos fiados de la misma persona de una vez**, o sumar a un fiado abierto: hoy cada fiado
   es un ticket separado. Unificarlos requiere una acción nueva.
3. **MASTER §7.2 y §9 todavía usan "Cerrar caja"** como ejemplo canónico de coachmark y de
   Peak-End. Son dos líneas que quedaron mintiendo desde el 2026-09-11; no se tocan acá porque
   están fuera del alcance de este rediseño.
4. **`/caja` no tiene foto de regresión visual.** Ningún canario de layout cubre esta sección.
