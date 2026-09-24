# Rediseño del panel: plan

**Fecha:** 2026-09-23 · **Estado:** aprobado por el dueño el 2026-09-23 · **Decide:** el dueño (qué) y esta sesión (cómo) · **Base:** [`PRODUCT.md`](../../PRODUCT.md), [`insumos.md`](insumos.md) y la crítica del 2026-09-23 (`.impeccable/critique/2026-09-23T21-25-51Z__src-app-admin.md`, 21/40).

Hasta que exista `DESIGN.md` (Fase 9), la autoridad del rediseño es este plan más el contrato de dirección (§6). `docs/spec/design-system/` (MASTER, páginas y gramática) describe lo que hay: es evidencia, no regla.

## 1. Lo que ya está decidido

| # | Decisión | Consecuencia |
|---|---|---|
| 1 | **Es un cambio de presentación.** La lógica, las Server Actions, las queries y el schema no cambian. | Si una mejora los necesita, se frena y se pregunta (§11). |
| 2 | **Lo de la "deuda" se arregla solo en pantalla.** | Lo que terminó esta noche y falta cobrar dice "por cobrar", en ámbar, nunca en rojo. Caja separa "esta noche" de "días anteriores". El texto que la acción escribe en el diario ("Cobro de deuda atrasada") no se toca. |
| 3 | **El freeze no aplica a este rediseño** (el dueño, 2026-09-23). | La Fase 1 agrega esta excepción en `CLAUDE.md` y `AGENTS.md`. |
| 4 | **Herramienta primero.** | La marca queda en el logo, las cifras y un solo acento. Los degradados y el brillo salen del panel. La energía deportiva queda para la web y el portal. |
| 5 | **Una sola pantalla para el mostrador: Hoy.** | Se juntan en ella Hoy, Grilla y el Vender de Caja. |
| 6 | **Primero el panel, sobre una base compartida.** | Las primitivas de `src/components/ui` se rehacen para todo el producto. El portal del jugador y la web conservan su aspecto con un tema propio; su rediseño es otro trabajo. |
| 7 | **10 canchas es un caso de primera clase, y hasta 16 no se rompe.** | Ver §7. |
| 8 | **Dirección visual: Tablero de partidas.** | Ver §6. |

## 2. Para qué es

- **El encargado**, de 17 a 01, en una notebook de 1366×768 con mouse (unos 1280×650 útiles). Cobra turnos de a partes, vende en la cantina, contesta el WhatsApp y carga turnos para el mismo día. De 20 a 22 hace unos 29 movimientos con 5 canchas; con 10 canchas, el doble.
- **El dueño**, desde el celular. Quiere saber cómo va la noche sin llamar a nadie.
- **Cómo se mide el éxito:** de 20 a 22, cada cobro y cada venta se registran en el momento, sin salir de Hoy y sin errores de plata. El dueño entiende la noche sin tocar nada.

**Máximo de clics por tarea.** Se mide en la Fase 4, con 5 y con 10 canchas:

| Tarea | Clics |
|---|---|
| Abrir un turno por cobrar, desde la lista o desde el tablero | 1 |
| Registrar un pago del turno abierto | 1, más 1 si hay que cambiar el método |
| Vender un producto | 3 o menos |
| Ver si hay lugar hoy a una hora | 0, porque está a la vista |
| Ver si hay lugar otro día | 2 o menos |
| Cargar un turno | 1 en el casillero, lo que se tipea y Guardar |
| Cancelar un turno | 4 o menos |
| Ver cómo va la noche (el dueño) | 0 |

## 3. Mapa de navegación

### El menú

Arriba de todas las páginas va una franja de 56 px como máximo, con:
- el isotipo;
- **Hoy · Caja · Clientes**;
- **Complejo · Métricas**, solo para el dueño;
- a la derecha, el reloj, **Ayuda** y **Cuenta**.

En Hoy, la franja suma los tres números de la noche y **Novedades**.

- **Por qué arriba y no al costado.** Con 10 canchas lo que falta es ancho. Con el menú arriba, el tablero recupera los 72 px del riel actual, y el menú comparte la altura con el reloj, que igual iba arriba.
- **En el celular**, una barra abajo con **Hoy · Caja · Clientes · Más**. Más abre Complejo, Métricas, Ayuda y Cuenta.
- **Torneos**, cuando se prenda el flag, entra después de Clientes.
- **Roles.** Al encargado que tiene usuario propio se le **ocultan** Complejo y Métricas, sin candados. Con la cuenta compartida el encargado ve todo, y por eso lo del dueño va al final, donde no estorba.

### Destinos

| Destino | Ruta | Quién | Qué tiene |
|---|---|---|---|
| **Hoy** | `/dashboard`, que no cambia (el login ya lleva ahí) | los dos | El tablero del día, con las canchas en columnas, las horas en filas y la fila de ahora resaltada. A la derecha, una columna con **Por cobrar**, el **cobro** del turno elegido y **Vender**. Con ‹ › y un calendario se ven otros días. |
| **Caja** | `/caja` | los dos | Tres pestañas. **Movimientos**: el diario del día, agregar movimiento y el cierre. **Cuentas**: lo que quedó de días anteriores, los fiados y las devoluciones (lo de esta noche es una línea que lleva a Hoy). **Productos**: catálogo, stock e informe; el encargado solo mira. |
| **Clientes** | `/jugadores` | los dos | Pestañas **Personas** y **Turnos fijos**, y la ficha de cada uno. |
| **Complejo** | `/canchas` y `/settings/*` | el dueño | Pestañas **Canchas y precios**, **Horarios**, **Reservas online**, **Perfil público**, **Equipo** y **Facturación**, más el checklist de arranque. |
| **Métricas** | `/analiticas` | el dueño | Lo mismo que hoy, con el estilo nuevo. |
| Turnos (fuera del menú) | `/reservas` | los dos | Buscar un turno por nombre o teléfono, y ver los próximos y el historial. Se llega desde la lupa de Hoy y desde la ficha de un cliente. |
| Un turno | `/reservas/[id]` | los dos | Una página con URL propia que tiene el mismo cobro que Hoy, y además editar, reprogramar, cancelar y ausente. |

### Qué se junta

- **Hoy, Grilla y el Vender de Caja pasan a ser Hoy.**
- **Los cuatro cobros pasan a ser uno.** Hoy hay cuatro formas distintas de cobrar: el modal de Hoy (`HoyChargeSection`), el panel de la Grilla (`SlotChargeSection`), `CompleteBookingDialog` y el formulario para agregar un cobro de `BookingCharges`. Quedan en un solo componente, que es la columna en Hoy y una sección en la página de un turno.
- **"Necesita tu atención" y "Mientras no estabas" pasan a ser Novedades**: un aviso con número en la franja de Hoy.
- **Canchas y Configuración pasan a ser Complejo.**
- **El diario de Cuentas pasa a Caja › Movimientos.**

### Qué desaparece

- **Grilla** como destino del menú.
- La pestaña **Vender** de Caja.
- El **tablero por cancha de `/reservas`**, el que con 7 o 10 canchas deja media pantalla afuera.
- El **modal de cobro de Hoy** y el **panel lateral de la Grilla**: su lugar pasa a ser la columna.
- El **aviso para activar las notificaciones push** que aparece en Hoy. Pasa a Cuenta y se pide una sola vez.
- El **checklist de arranque** en Hoy. Pasa a Complejo, y en Hoy solo aparece la primera vez, cuando el complejo todavía no tiene canchas.
- El **tour de Hoy** (decisión del dueño, §11).

### Pantalla de inicio

| Quién | Qué ve al entrar |
|---|---|
| El encargado, con usuario propio o con la cuenta compartida | Hoy en la notebook |
| El dueño en el celular | Hoy armado para el celular: la noche, qué pasa ahora en cada cancha, lo que falta cobrar y lo que viene |
| El dueño en una computadora | El mismo Hoy del mostrador |
| Un complejo nuevo, sin canchas | Hoy muestra el alta (el checklist) en lugar del tablero vacío |

La versión de Hoy la decide el ancho de la pantalla, no el rol: con la cuenta compartida, el rol no dice quién está mirando.

### Direcciones viejas que siguen andando

- `/grilla?date=…&highlight=…` lleva a `/dashboard` con los mismos parámetros. Los push de reserva online apuntan ahí (`src/modules/notifications/push.service.ts:178`).
- `/caja/cantina` lleva a Hoy con Vender abierto.
- `/settings` lleva a la primera pestaña de Complejo.
- Siguen igual:
  - `/deudas`, `/caja/deudas`, `/jugadores/deudas` y `/caja/devoluciones` → `/caja/cuentas`;
  - `/staff` → `/settings/equipo`;
  - `/metricas` y `/reportes` → `/analiticas`;
  - `/settings/avisos` → `/settings/perfil`;
  - `/settings/canchas` → `/canchas`.

## 4. Los cinco flujos más frecuentes

Ordenados por la frecuencia medida en `insumos.md`.

**1. Vender en la cantina.** Son unas 25 ventas por noche con 5 canchas. La venta típica es de $6.000, con 1,2 productos, y el 99% no está atada a un turno. El pico es a las 20 y a las 21, cuando también se cobran los turnos.
- **Cómo se hace:** pestaña **Vender** de la columna → producto → **Cobrar** → método. La columna queda lista para la próxima venta.
- Si en el medio hay que cobrar un turno, se pasa a la pestaña **Por cobrar**. Al volver, la venta a medio armar sigue ahí.
- Un fiado se anota con "Anotar como fiado", igual que hoy.
- Usa el mismo `TicketPanel` y las mismas acciones. Vender no es una segunda caja (decisión del 2026-09-19).

**2. Cobrar un turno de a partes.** Entre las 20 y las 22 entran unos 13 pagos de turnos con 5 canchas. 7 de cada 10 turnos se pagan en 2 o más veces, y el primer pago llega, en la mediana, 29 minutos después del final.
- **Cómo se hace:** cuando el turno termina, aparece en **Por cobrar** como una partida más: `21:00 · Cancha 3 · Pérez · POR COBRAR · $42.000`.
- Con un clic, la columna muestra el cobro de ese turno:
  - **Falta $42.000**, grande;
  - los botones **Pagó uno $4.200**, **Un equipo $21.000**, **Todo** y **Otro monto**;
  - el método a la vista, que arranca en Efectivo como hoy.
- Cada clic registra un pago. La columna sigue en ese turno hasta que no falte nada. Ahí la palabra pasa a **COBRADO**, el turno sale de la lista y la columna vuelve a Por cobrar.

**3. Ver si hay lugar.** Pasa con cada WhatsApp. No se puede medir, pero es lo más frecuente.
- **Cómo se hace:** el tablero de hoy ya está a la vista. En la fila de cada hora se ve qué canchas están libres.
- El encabezado de cada cancha muestra su formato, porque la pregunta suele ser "¿tenés una de 5 a las 22?".
- Para otro día: ‹ › o el calendario.
- En el celular: se elige la hora y aparecen las canchas libres.

**4. Cargar un turno.** Se cargan 6 a 8 por día, entre las 17 y las 20, casi siempre para el mismo día (el 89%, menos de 6 horas antes). Entran por WhatsApp.
- **Cómo se hace:** clic en un casillero libre → modal **Cargar**, con la cancha y la hora ya puestas → nombre → **Guardar**. El turno aparece en el casillero en el momento.
- Es el mismo modal único de alta que existe hoy, con sus cuatro tipos.

**5. Cancelar.** Hay unas 2 cancelaciones por día.
- **Cómo se hace:** clic en el turno → la columna lo muestra → **⋯ › Cancelar** → modal con el motivo, y la seña si la hay → **Confirmar**. El casillero queda libre.

**Además, el del dueño: ¿cómo va la noche?** No es un flujo frecuente, pero es el criterio de éxito.
- **Cómo se hace:** el dueño abre Hoy en el celular y ve arriba **Cobrado · Por cobrar · Ocupación**, y abajo qué pasa en cada cancha.
- Los tres números salen de datos que Hoy ya tiene, sin queries nuevas:
  - Cobrado es `collectedTodayCents` de `getHoyData`;
  - Ocupación es `occupancy` de `getHoyData`;
  - Por cobrar es la suma de `pending` de los turnos que ya terminaron.

## 5. Página, columna, modal, sheet y pestaña

| Qué | Cuándo se usa | Ejemplos | Nunca |
|---|---|---|---|
| **Página** | Un lugar con URL propia, al que se vuelve o en el que uno se queda más de un minuto. | Hoy, Caja, Clientes, Complejo, Métricas, un turno, la ficha de un cliente. | Para una decisión de un solo paso. |
| **Columna** | Lo que se hace con el tablero a la vista: cobrar, vender, ver un turno. Está dentro de Hoy y no tapa nada. El turno elegido va en la URL (`?turno=`), así que al recargar o al volver atrás no se pierde. | Por cobrar, el cobro, Vender. | Fuera de Hoy. |
| **Modal** | Una decisión corta que cambia datos y pide completar campos. Bloquea hasta terminar, se cierra al guardar y el resultado se ve en su lugar. | Cargar, editar, reprogramar, cancelar con motivo, anotar un fiado, crear un producto, agregar un movimiento. | Un modal encima de otro, o un modal solo para leer. |
| **Sheet** | Solo como versión angosta de la columna: desde la derecha entre 768 y 1279 px, desde abajo en el celular. | La columna de Hoy en tablet y en celular. | Como lugar propio en la computadora. |
| **Pestañas** | Vistas hermanas de un mismo lugar, cada una con su URL. | Caja, Clientes, Complejo, la columna (Por cobrar · Vender). | Para esconder los pasos de una sola tarea. |
| **Popover** | Mirar algo rápido o elegir de un menú. | Novedades, las acciones ⋯ de un turno, el calendario, los filtros. | Para formularios. |
| **Toast** | Confirmar algo secundario. | "Producto guardado". | Como única confirmación de plata. Cada pago y cada venta dejan una marca en su lugar: el "Falta" que baja, la palabra COBRADO, el movimiento en la lista. |
| **Confirmación** | Solo lo que no se puede deshacer. | Cancelar un turno. | Para cobrar o vender. |

## 6. Dirección visual: Tablero de partidas

La eligió el dueño el 2026-09-23 en la página de direcciones (seed `19476095`, la carta IMPECCABLE'S PICK). Se construye directamente en código, sin imágenes de referencia.

**Tesis.** El mostrador vive por el reloj. Cada turno es una fila que arranca, termina y se cobra, y la fila de ahora es lo que más se ve. Lo que rechaza es el panel SaaS de tarjetas con números grandes y gráficos.

**El mundo.** Los tableros de partidas de Retiro y de las estaciones:
- filas fijas por hora;
- palabras de estado que cambian en su lugar;
- la fila de ahora iluminada;
- líneas finas en vez de cajas;
- números condensados y alineados.

De ese mundo se toma la gramática, no el disfraz: nada de letras de paletas, de LED ni de cartel negro con ámbar.

**Primera vista de Hoy, a 1366×650:**
- **Arriba, la franja** (56 px como máximo): el menú, el reloj grande en cifras condensadas, la fecha del día operativo y los tres números de la noche, **Cobrado · Por cobrar · Ocupación**. A la derecha, Novedades y Cuenta.
- **Debajo, el tablero:** las canchas en columnas, con nombre y formato, y las horas en filas.
  - Las horas que ya pasaron van en gris, salvo lo que falta cobrar.
  - La fila de ahora tiene el único fondo de color de la pantalla.
  - Lo que viene va en tinta.
- **A la derecha, la columna** (unos 340 px): Por cobrar, listado como un tablero de partidas (hora · cancha · quién · cuánto falta), el cobro del turno elegido y Vender.
- **La acción principal** es el botón de cobro de la columna, el único botón verde lleno de la pantalla.

**El celular del dueño.** Todo va en una sola columna:
- arriba, los tres números de la noche;
- después, una fila por cancha con lo que pasa ahora: la palabra de estado, quién y cuánto falta;
- al final, lo que falta cobrar y lo que viene.

Al tocar un turno, su cobro sube desde abajo.

**Paleta de la carta**, en tema claro:

| Uso | Color |
|---|---|
| Papel (fondo) | `#F5F5F1` |
| Tinta (texto) | `#101114` |
| Líneas | `#D8D9D4` |
| Fila de ahora | `#FFF1CC` |
| Por cobrar | ámbar `#A86200` |
| Cobrado y botón de cobrar | verde `#1B7F4B` |

Falta un rojo para errores y acciones destructivas; se define en la Fase 1. Además, el contrato tiene que resolver dos contrastes:
- **El ámbar no llega a AA para texto chico:** da 4,3:1 sobre el papel y 4,2:1 sobre la fila de ahora. Hay dos salidas: oscurecerlo, o usar el ámbar como marca (una barra o un fondo) y escribir la cifra en tinta.
- **El verde pasa justo:** da 4,6:1 sobre el papel. El texto blanco sobre el botón verde da 5:1.

**El color es para la plata.** El ámbar marca lo que falta cobrar y el verde lo cobrado y la acción de cobrar. Todo lo demás va en tinta y grises.

**Tipografía:**
- Las horas, los montos y las palabras de estado van en una letra condensada con cifras tabulares, y el texto en una sans neutra.
- La candidata para la condensada, sin sumar dependencias, es Archivo en su ancho condensado. Ya se carga, pero sin el eje de ancho, así que hay que agregar el eje `wdth` en `next/font`.
- Inter sigue para el texto y Sora queda solo para el logo.

**Materiales:**
- líneas de 1 px en vez de tarjetas;
- sin sombras, degradados ni brillo;
- palabras de estado en mayúsculas, con un poco de aire entre letras;
- cifras siempre tabulares.

**Palabras de estado.** El estado lo sigue decidiendo `src/lib/booking/slot-visual.ts`. Cambian solo la palabra y el color: todas concuerdan con "turno", que es como le dice la pantalla.

| Clave | Hoy dice | Pasa a decir | Color |
|---|---|---|---|
| `pending_payment` | Esperando seña | ESPERANDO SEÑA (no cambia: el jugador ve la misma palabra) | tinta, con el contador de la ventana |
| `confirmed` | Confirmada | CONFIRMADO | tinta |
| `deposit_paid` | Señada | SEÑADO | tinta |
| `fixed` | Abonado | FIJO | tinta |
| — (entre `starts_at` y `ends_at`) | — | JUGANDO | tinta, en la fila de ahora |
| `unpaid_alarm` | Sin cobrar (rojo, alarma) | POR COBRAR | ámbar |
| `completed` | Jugada | COBRADO, o SIN CARGO si no se cobra | verde, o gris |
| `no_show` | Ausente (rojo) | AUSENTE | gris: el no-show no es deuda |
| `tournament` | Torneo | TORNEO | tinta, con rayado |
| `block` | Bloqueado | BLOQUEADO | gris, con rayado |
| `canceled`, `expired` | Cancelada, Expirada | CANCELADO, VENCIDO (solo en listas) | gris |

"Terminó" se decide con la hora, como ya hace Hoy (`endsAtMs`), sin esperar a que el worker `auto-complete-bookings` pase el turno a `completed`.

**Interacción propia.** Cuando un turno cambia de estado, cambia solo la palabra, en su lugar, con un giro vertical corto de 150 ms como máximo, como una paleta del tablero. Nada se mueve ni cambia de tamaño. Con "reducir movimiento" activado, el cambio es directo.

**Tema oscuro.** Fondo en tinta y texto en papel. El ámbar sigue siendo solo lo que falta cobrar. Nada de negro con ámbar de cartel viejo ni brillo neón. El tema claro se diseña primero, porque el mostrador está iluminado.

**Lo que sale:** los degradados y el brillo del marco, `card-premium`, las tarjetas dentro de tarjetas, las etiquetas de 10 px y los íconos de adorno.

**Riesgos:**
- El tablero de partidas es un recurso conocido. Disfrazado, termina siendo un cartel retro.
- El reloj le quita alto al tablero. Por eso comparte la franja con el menú.
- Las mayúsculas se leen bien solo en palabras cortas. La más larga es ESPERANDO SEÑA.

**Contrato.** Antes de la primera línea de código, la Fase 1 escribe el contrato de dirección en el surface brief de `src/app/(admin)` (`impeccable surface-brief write`), con sus seis bloques:
- THESIS;
- OWN-WORLD;
- STORY;
- FIRST VIEWPORT;
- FORM, con el seed `19476095`;
- FINISH.

## 7. Muchas canchas

Cuentas a 1366 de ancho (unos 1350 útiles), con el menú arriba, la columna de 340 px y 44 px para las horas:

| Canchas | Ancho de cada cancha | Qué pasa |
|---|---|---|
| 1 a 8 | 120 px o más | Todo a la vista, con aire. |
| 9 y 10 | unos 95 px | Todo a la vista. La celda muestra quién (cortado), la palabra de estado y el monto. El detalle está en la columna. |
| 11 a 16 | de 60 a 88 px, con la columna abierta | La columna se pliega a una tira de unos 56 px que muestra "Por cobrar (6)" y Vender. Con 16 canchas, cada una queda en unos 78 px. La columna se abre al tocar un turno o Vender, y si tapa el turno elegido, el tablero se corre para mostrarlo. |
| más de 16 | — | El tablero se desplaza de costado, con las horas y los nombres de las canchas fijos, y avisa "4 canchas más →". No se diseña más que eso. |

Reglas:
- **Por cobrar trae todas las canchas**, se vean o no en el tablero. Ninguna plata queda escondida.
- **A las 21:00 pueden terminar 10 turnos juntos.** Por eso la lista tiene filas densas, de unos 40 px, ordenadas por hora de fin y cancha.
- **El encabezado de cada cancha** lleva el nombre y el formato. Si el nombre es largo se corta, y el completo aparece al pasar el mouse.
- **En el celular no hay tablero.** La noche es una lista por cancha, y para cargar un turno se elige la hora.
- **Storybook y las verificaciones** usan noches de 2, 5, 10 y 16 canchas.
- **Con 10 canchas, probablemente cobren dos personas a la vez.** Ver §11, punto 3.

## 8. Estados y rangos

- **Canchas:** de 1 a 16 (§7).
- **Horario:** de 6 a 18 horas abiertas por día. Si el complejo cierra pasada la medianoche, el tablero sigue el día operativo: el turno de las 23 termina a las 24:00 y los de la madrugada son del mismo día. Se usan los helpers de `src/shared/time/operating-day.ts`, sin reimplementarlos.
- **Turnos por cobrar a la vez:** de 0 a uno por cancha. Cuando no hay ninguno, la lista muestra lo próximo que termina.
- **Pagos por turno:** se midieron de 1 a 7. El diálogo actual admite hasta 10 líneas.
- **Montos:** de $1.000 a varios millones (un evento largo, o el total del mes en Métricas). Siempre con separador de miles y cifras tabulares.
- **Estados de la pantalla:**
  - la primera vez, sin canchas (el alta);
  - un día sin turnos;
  - cargando: el esqueleto del tablero, no un spinner;
  - error al cobrar o al vender: el reintento conserva la clave (decisión del 2026-09-19);
  - sin conexión;
  - un cobro hecho desde otro puesto: aparece con el refresco de 60 s o por Realtime;
  - un día pasado: se mira, pero no se carga;
  - un día que no es hoy: la franja lo dice y ofrece "Volver a hoy";
  - cuenta compartida, o encargado con usuario propio.

## 9. Límites

**No se toca:**
- la lógica de negocio, las Server Actions, las queries ni el schema;
- los textos que escriben las acciones;
- el logo;
- el aspecto del portal del jugador y de la web.

**No tiene que parecerse a:**
- un dashboard SaaS de tarjetas con números y gráficos;
- un cartel retro de estación;
- nada que pinte de rojo lo normal.

**Tampoco agrega:** texto libre sobre personas, configuración "por las dudas" ni animaciones de adorno.

**Se arreglan aparte, en otra sesión**, las dos roturas que encontró la crítica: el listado de Reservas a 1366 y la grilla del celular. Igual las Fases 4 y 6 reemplazan esas pantallas.

## 10. Fases

Son 9 PRs, en este orden. Cada uno tiene que dejar el panel andando en producción, porque El Vagón lo usa todas las noches.

**Fase 0 (esta sesión, sin código):** `PRODUCT.md`, `insumos.md`, este plan y la crítica guardada en `.impeccable/`. Van juntos en un PR de docs.

### Reglas para todas las fases

- **Antes de decir "listo"** se corren `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm knip`, con el output pegado, más los tests que toque la fase.
- **Storybook se prueba en claro y en oscuro** (`test:storybook` y `test:storybook:dark`).
- **Los e2e y la regresión visual no corren en los PRs.** En las fases que cambian pantallas se disparan a mano (`gh workflow run ci.yml --ref <rama>`) y se comparan contra main.
- **Quien implementa no verifica:**
  - `sonnet-adversarial-reviewer` revisa con contexto limpio y lee el diff antes que el resumen;
  - en las fases de pantalla, además, `sonnet-ux-verifier` corre la app con una noche cargada de 5 y de 10 canchas.
- **Si una fase necesita tocar lógica, acciones, queries o schema,** se frena y se pregunta.
- **Cada delegación a un agente se anota en el ledger** (§12).
- **Commits y push, solo con el OK del dueño.**

### Fase 1 · La base: tokens, primitivas y Storybook

- **Paso 0, antes del código:**
  - agregar en `CLAUDE.md` y `AGENTS.md` la excepción del freeze para este rediseño;
  - poner al principio de `doc20` y de `MASTER.md` el aviso "en rediseño: esto es evidencia, no autoridad; ver `docs/rediseno-panel/plan.md`";
  - escribir el contrato de dirección en el surface brief (§6).
- **Tokens:** se agregan en `globals.css` los tokens nuevos del panel, en claro y en oscuro, bajo un alcance propio del panel. El portal y la web siguen con sus valores. En esta fase el alcance no se aplica a ninguna pantalla de producción, solo a Storybook.
- **Primitivas:**
  - `src/components/ui` se rehace sobre tokens semánticos;
  - se agregan las que faltan: tabla densa con cifras tabulares, pestañas con URL, palabra de estado, monto y el casillero del tablero;
  - se suma el eje `wdth` de Archivo.
- **La pantalla guía:** una historia de Storybook fija, "Hoy · 10 canchas · 21:15", a 1366×650 y sin datos reales. Prueba la densidad, la paleta y las palabras de estado antes de conectar nada.
- **Está lista cuando:**
  - las primitivas pasan la prueba de a11y en claro y en oscuro;
  - la regresión visual muestra el portal, la web y el panel actual sin cambios;
  - el dueño aprueba la pantalla guía.

### Fase 2 · El marco

- **La franja de arriba** con el menú nuevo y el reloj, y **la barra del celular** (Hoy · Caja · Clientes · Más).
- **Los tokens nuevos se aplican a todo `(admin)`.** Las pantallas viejas toman los colores nuevos sin cambiar su estructura. Es un aspecto de transición y se acepta.
- **Grilla sigue en el menú hasta la Fase 4.** Complejo lleva a la configuración actual, con Canchas como una pestaña más.
- **Roles:** lo que un rol no ve se oculta, sin candados. Los guards no cambian.
- **Novedades** reemplaza a los dos bloques de avisos de Hoy, con los mismos datos de `getHoyData`. El aviso de las notificaciones push pasa a Cuenta.
- **Está lista cuando:**
  - cada rol llega a todas sus rutas, en 1366 y en 375;
  - la regresión visual solo muestra cambios en el panel.

### Fase 3 · Un solo cobro

- **El componente se arma sobre lo que ya existe:** `useSlotCharges`, `slotGates`, las mismas Server Actions y `SlotCancelDialog`. Tiene Falta, Pagó uno, Un equipo, Todo, Otro monto, los métodos, los pagos hechos y Cantina al turno.
- **Reemplaza a** `HoyChargeSection`, `SlotChargeSection`, `CompleteBookingDialog` y el formulario para agregar un cobro de `BookingCharges`.
  - Hasta la Fase 4 vive dentro del modal de Hoy y del panel de la Grilla.
  - En `/reservas/[id]` queda para siempre, y esa página suma Pagó uno, editar y reprogramar.
- **Se frena si** los cuatro caminos llaman a acciones con efectos distintos, por ejemplo completar el turno o registrar un pago. En ese caso se decide con el dueño antes de unificar.
- **Está lista cuando:**
  - hay tests de las cuentas que se ven en pantalla: lo que falta, Pagó uno (precio dividido por la capacidad) y Un equipo;
  - el e2e @critical de cobro pasa;
  - el ux-verifier cobró de a partes en Hoy, en la Grilla y en la página de un turno.

### Fase 4 · Hoy, el tablero de partidas

- **El tablero:**
  - la fila de ahora y las palabras de estado;
  - la estrategia de canchas de §7;
  - ‹ › y el calendario;
  - cargar un turno con un clic en un casillero libre, con el modal único de siempre.
- **La columna:** Por cobrar, el cobro de la Fase 3 y Vender. Vender es el `TicketPanel` con estilo nuevo, las mismas acciones y un solo ticket a la vez.
- **La franja** muestra los números de la noche, y el turno elegido va en la URL.
- **Actualización:**
  - sigue el refresco cada 60 s, en pausa mientras se cobra;
  - usa el Realtime de `bookings` que hoy tiene la grilla (`use-booking-realtime.ts`).
- **Celular y pantallas angostas:** la versión para el celular del dueño (§6), y la columna como sheet en pantallas angostas.
- **`/grilla`** lleva a Hoy con sus parámetros.
- **Se borran** `HoyChargeModal`, `BookingSlotPanel`, `TodayBoard`, `VenderRail` y el tablero viejo de la grilla.
- **Datos de prueba:** una semilla de desarrollo con noches de 5, 10 y 16 canchas.
- **Es la fase más grande.** Se entrega en commits por parte (tablero, columna, celular) y se verifica al final.
- **Está lista cuando:**
  - el ux-verifier corre los cinco flujos y el del dueño, con 5 y con 10 canchas, a 1366×650 y a 375, sin pasarse del máximo de clics (§2);
  - el e2e @critical pasa.

### Fase 5 · Caja

- **Las pestañas son Movimientos, Cuentas y Productos.** Vender se va de Caja: `/caja` pasa a ser Movimientos y `/caja/cantina` lleva a Hoy con Vender abierto.
- **Cuentas separa "esta noche" de "días anteriores".** Lo de esta noche es una línea que lleva a Hoy. Lo pendiente va en ámbar, no en rojo.
- **El cierre de caja** queda donde está y no se rediseña en esta etapa.
- Se actualiza `.claude/rules/caja.md`.
- **Está lista cuando:**
  - "Cobrado" da el mismo número en la franja de Hoy y en Caja (`DaySummary.collected`);
  - los e2e de caja pasan.

### Fase 6 · Clientes y turnos

- **Personas y Turnos fijos** pasan a ser tablas densas, y se rehace la ficha del cliente.
- **`/reservas`** pasa a ser búsqueda y lista, con los próximos y el historial.
- **`/reservas/[id]`** se rehace con el cobro de la Fase 3.
- **Está lista cuando:**
  - se puede buscar un turno y cobrarlo desde su página;
  - los e2e de jugadores y abonados pasan.

### Fase 7 · Complejo y Métricas

- **Complejo** tiene sus seis pestañas y el checklist de arranque. El alta de un complejo nuevo sigue andando.
- **Métricas** toma el estilo nuevo.
- **Torneos** toma el estilo nuevo solo si es barato, porque está detrás de un flag apagado.
- **Está lista cuando:**
  - el e2e de onboarding pasa;
  - un encargado con usuario propio no ve Complejo ni Métricas.

### Fase 8 · Limpieza y revisión final

- **Se borra el código muerto:**
  - `card-premium` y los degradados del marco viejo;
  - los cuatro `status-visual.tsx` duplicados;
  - `ScrollTabs`, si ya nadie lo usa;
  - los tokens viejos que no usan ni el portal ni la web.
- `knip` tiene que quedar limpio.
- Se revisan los comentarios que citan "MASTER §" en el código rehecho.
- **Revisión:**
  - una crítica nueva de las cuatro pantallas, para comparar con el 21/40 de hoy;
  - una revisión final contra el contrato de dirección;
  - la suite completa de e2e y la regresión visual.

### Fase 9 · DESIGN.md, archivo y referencias

- **`DESIGN.md`** se escribe a partir de lo construido (`impeccable document`) e incluye el aspecto actual del portal y de la web. Desde acá es la única fuente de diseño.
- **`docs/spec/design-system/`** (MASTER, la gramática y las 13 páginas) pasa a `docs/archive/`.
- **Referencias que se actualizan:**
  - `CLAUDE.md` y `AGENTS.md`: la línea de UX que nombra el design system de doc20;
  - `doc20`, que pasa a apuntar a `DESIGN.md`;
  - `.claude/rules/mapa-docs.md` y `.claude/rules/caja.md`;
  - `docs/README.md`;
  - `.storybook/preview.tsx`;
  - `src/components/ui/Tokens.mdx`;
  - `.design-sync/config.json`, que lee seis de esos archivos. Si no se actualiza, se rompe la sincronización con claude.ai/design.
- **Los docs históricos que citan MASTER** (decisiones, auditorías, planes) quedan como están, porque son historia.
- **El trabajo se cierra** con `cierre-release` (`sonnet-release-verifier`).

## 11. Decisiones que estaban abiertas (resueltas por el dueño, 2026-09-23)

1. **El tour de Hoy** (`src/components/dashboard/dashboard-tour.tsx`): **se saca** en la Fase 4. La pantalla nueva se tiene que entender sola.
2. **Cantina como cuarto número de la noche:** **no** en este rediseño. Habría que tocar `getHoyData`, que ya calcula `byCategory` pero no lo devuelve.
3. **Dos puestos cobrando a la vez:** el Realtime de hoy solo escucha `bookings`. Se verifica en la Fase 3; si hace falta publicar otra tabla, es un cambio de datos y **se frena y se pregunta**.
4. **Unificar los cobros:** si los caminos llaman a acciones con efectos distintos, **se frena y se decide con el dueño** (Fase 3).

## 12. Ledger de delegación

| # | Agente | Para qué | Costo aproximado | Resultado |
|---|---|---|---|---|
| 1 | Sonnet, reconocimiento | Mapa funcional del panel: rutas, solapamientos y sistema de UI | ~266k tokens, 94 llamadas a herramientas | Un mapa en el scratchpad de la sesión |
| 2 | Sonnet, implementador | Cargar una noche realista en el Supabase local, fuera del repo | ~309k, 83 | Un script que se puede correr varias veces, en el scratchpad; la noche queda en la base local |
| 3 | Sonnet, crítica A | Revisión de diseño de Hoy, Grilla, la página de un turno con su cobro, y Caja | ~401k, 169 | 21 capturas y un informe. Sus dos P0 se bajaron a P1, y se descartó un hallazgo: 14 jugadores en F7 es correcto (7 contra 7) |
| 4 | Sonnet, crítica B | Detector de patrones y evidencia del navegador | ~241k, 72 | `detect.json` y 7 capturas marcadas |
| | | **Total** | **~1,2M tokens** | |
