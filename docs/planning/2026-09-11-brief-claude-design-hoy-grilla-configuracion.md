# Brief para Claude Design — rediseño de Hoy, Grilla y Configuración

**Fecha:** 2026-09-11 · **Dueño:** Lazar · **Estado:** listo para usar
**Antecedente:** auditoría de coherencia 2026-09-09/10 (130 hallazgos cerrados en #298, #299 y #300).
Ahora que el panel es coherente, el dueño quiere que Claude Design lo devuelva **mejor, más lindo y
más moderno** sin volver a desordenarlo.

Este documento tiene dos partes. La §A es el procedimiento para Lazar. Las §B a §F son texto para
pegar en claude.ai/design, tal cual está.

---

## A. Procedimiento (Lazar)

**Por qué así.** Claude Design trabaja mejor dentro de un proyecto de _design system_: construye
con los componentes reales y lee las guías que le subimos. Ese proyecto ya existe (`turnogol`, id
en `.design-sync/config.json`) y hasta el 2026-09-11 estaba detenido en junio: 14 primitivas de las
31 que hay en `src/components/ui/`, MASTER como única guía y ninguna spec de pantalla. Pedirle la
Grilla con eso era pedirle que inventara el panel lateral, las pestañas y la píldora de estado —
justo la incoherencia que la auditoría acaba de cerrar.

**Lo que ya está hecho** (commit de este mismo esfuerzo, verificado con el render check del
pipeline: 30/30 tarjetas renderizan limpio):

- **El design system pasó de 14 a 30 componentes.** Entraron las 14 primitivas que estas tres
  pantallas usan de verdad, medidas con un grep de sus imports: `StatusBadge`, `Sheet`,
  `ScrollTabs`, `SegmentedControl`, `RadioChip`, `Collapsible`, `Tooltip`, `Popover`,
  `MoneyInput`, `PhoneInput`, `ImageUploader`, `Coachmark`, `ResponsiveList` y `TgBallSpinner`;
  más `PageHeader` y `StatCard`, que llevan todas las pantallas del panel. Quedaron afuera a
  propósito `DatePicker`, `Stepper` y `Progress`: ninguna de las tres pantallas los usa.
- **Las guías del proyecto ya no son solo MASTER**: ahora van también la gramática de interacción
  y las specs de Hoy, Grilla, horarios-precios y Equipo.
- **Cada componente nuevo tiene su preview con el vocabulario real**, y se corrigió el de `Badge`,
  que enseñaba "Pendiente", "Cancelada" y "Nueva" — tres términos que la auditoría eliminó.

**Lo que falta para poder subirlo:**

1. **Autorización de diseño.** La herramienta que escribe en el proyecto sigue sin permiso en esta
   sesión. Hay que correr `/design-login` una vez desde una sesión **interactiva** de Claude Code
   en esta máquina (la pestaña Code de la app de escritorio no alcanza: el comando necesita el
   diálogo de la terminal). Después de eso, la subida es un paso.
2. **Regenerar las capturas de Hoy.** Las de `.design-sync/handoff/2026-09-11/capturas/` son de
   antes del rediseño de #300, así que muestran las tarjetas de plata que ya no existen. Hace
   falta Docker Desktop arriba, `pnpm supabase:start`, el dev server, y
   `MSYS_NO_PATHCONV=1 pnpm audit:corpus --solo=/dashboard`.

**Después, el trabajo de diseño:**

3. **En claude.ai/design**, proyecto `turnogol`: **una conversación por pantalla**, en este orden:
   Hoy → Grilla → Configuración. La primera vez pegás §B entera y después el bloque de la pantalla
   (§C, §D o §E). Adjuntás las cuatro capturas de esa pantalla (desktop/mobile × dueño/encargado).
   Cerrás cada pantalla antes de abrir la siguiente: la Grilla hereda lo que decidas en Hoy, y
   Configuración hereda las dos.
4. **Evaluar lo que vuelve** con §F. Si un elemento no se puede nombrar con el vocabulario de §B.3,
   o aparece un color que no está en §B.4, se rechaza, por lindo que sea.
5. **Volver al repo.** Claude Design puede mandar el diseño a Claude Code ("Send to Claude Code"),
   que lo deja en el workspace. De ahí se implementa contra la spec de la pantalla
   (`docs/spec/design-system/pages/*.md`), que se actualiza en el mismo PR, y contra los tests que
   ya custodian el vocabulario (`tests/unit/slot-visual.test.ts`).

**Plan B** si claude.ai/design no rinde: Claude Code tiene `/design`, un lienzo de artboards que se
edita a mano. Sirve para bocetar, pero no construye con los componentes reales.

**Freeze.** Esto es rediseño visual y estructural de tres pantallas por fricción observada en un
lead real (DEMO-3, registrado en `docs/gtm/ejecucion/10-aprendizajes.md`). No entra ninguna
funcionalidad nueva.

---

## B. Contexto para el agente (pegar una sola vez)

### B.1 Qué es esto

TurnoGol es un SaaS para complejos de fútbol de Argentina. Este brief es sobre el **panel del
complejo**, no sobre la app del jugador. Lo usan dos personas, 8 horas por día, en el mostrador,
con gente esperando:

- **Marcelo, el dueño** (rol `admin`). 35–60 años, nivel de tecnología 2,5/5, nunca va a leer un
  manual, tiene miedo de "tocar algo y romper todo". Está en el complejo desde las 9, atiende el
  mostrador, vuelve a las 17 para el pico de la noche. Su frase: _"quiero confirmar y cobrar un
  turno en menos de 20 segundos desde el celu"_.
- **Rodrigo, el encargado** (rol `manager`). 4/5 en tecnología, prefiere atajos a menús, se
  aburre con lo repetitivo. A veces está solo con el teléfono sonando. Su frase: _"quiero ver de
  un vistazo si hay disponibilidad y confirmar en 15 segundos"_. **No ve Hoy ni Configuración.**

El sistema de diseño tiene dos personalidades. El panel es **"El Mostrador"**: herramienta de
trabajo, caja registradora más agenda. Densidad alta, datos primero, decoración después, motion
de hasta 200 ms y solo funcional. La referencia mental es PedidosYa del lado del restaurante, o
Toast POS. **La belleza del panel es su eficiencia.** Un degradé animado en la Caja es ruido.

### B.2 Qué te pido

Rediseñá tres pantallas —Hoy, Grilla y Configuración— para que se vean **más modernas, más
lindas y más claras**, construyendo con los componentes del design system de este proyecto y
respetando las guías que tiene cargadas (MASTER, gramática de interacción y las specs de cada
pantalla). Tenés libertad total en **layout, jerarquía, agrupación, espaciado, composición,
estados vacíos, iconografía (Lucide) y microinteracciones dentro del presupuesto de motion**.
Podés proponer cambios al shell (barra lateral, topbar) si mejoran las tres.

No tenés libertad en lo de abajo. La app acaba de pasar una auditoría de coherencia de 130
hallazgos y el objetivo es que **cada cosa se llame igual en todas las pantallas**.

### B.3 Vocabulario cerrado (un término por estado, en toda la app)

| Cosa                             | Se dice                                                                                                     | Nunca                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Navegación                       | Hoy · Grilla · Caja · Clientes · Canchas · Torneos · Métricas · Configuración                               | Inicio, Dashboard, Agenda, Analíticas        |
| Estados de un turno              | Esperando seña · Confirmada · Señada · Jugada · Sin cobrar · Ausente · Abonado · Torneo · Bloqueado         | Pagando ahora, Pendiente, Reservado, No-show |
| Plata que te deben, en Caja      | **Deudas** ("Pendiente de cobro")                                                                           | Plata en la calle, Saldo                     |
| Plata que te deben, en la Grilla | **Por cobrar hoy** (solo el día visible)                                                                    | Deudas, Pendientes                           |
| Plata que debés devolver         | **Devolvés**                                                                                                | Reembolsos                                   |
| La seña                          | seña                                                                                                        | anticipo, depósito                           |
| Persona que reserva              | jugador (tiene cuenta) o invitado (no tiene); el espacio del menú se llama Clientes y su pantalla, Personas | usuario                                      |
| Turno fijo semanal               | abonado / turno fijo                                                                                        | suscripción                                  |
| Acciones                         | verbo primero y en voseo: "Cobrar $ 16.000", "Cerrar caja de ayer", "Ver reserva"                           | "Click aquí", "Ir a"                         |

Plata siempre `$ 16.000` (espacio y punto de miles). Fechas en castellano, formato medio:
"mié 2 de julio". Nada de ISO ni de anglicismos de dashboard.

### B.4 Color: el semáforo de la plata

El color comunica **el estado de la plata**; el ícono y el texto comunican **qué es**. Nada se
comunica solo con color (8 % de los varones es daltónico y la base es casi toda masculina).

| Estado               | Tono                    | Significado                                   |
| -------------------- | ----------------------- | --------------------------------------------- |
| Esperando seña       | ámbar (`warning`)       | te deben la seña                              |
| Confirmada · Abonado | azul (`info`)           | cobrás al llegar                              |
| Señada · Jugada      | verde (`success`)       | plata asegurada o cobrada                     |
| Sin cobrar · Ausente | rojo (`destructive`)    | se prestó el servicio y falta plata / no vino |
| Torneo               | ámbar rayado            | ocupa cancha, no es un jugador                |
| Bloqueado            | gris rayado (`neutral`) | ocupa cancha, no es un jugador                |

Tokens semánticos siempre (`bg-card`, `text-foreground`, `bg-primary`), nunca hex nuevos. Marca:
esmeralda para acciones sobre superficies slate. **Light y dark son iguales de importantes**:
light se expresa con elevación (sombras en capas), dark con vidrio (white-alpha + blur). Nunca
vidrio en light. Contraste AA en los dos.

### B.5 Reglas que no se negocian

1. **La grilla es el producto.** Cualquier cosa que enlentezca leer o cargar una reserva es un
   bug de diseño, por linda que sea. Reservar = 2 interacciones: tocar un lugar libre, guardar.
2. **Ningún dato se repite entre pantallas.** Lo cobrado y las deudas viven en Caja. Hoy no
   las muestra. Métricas es la única pantalla con gráficos.
3. **Nada de "venta rápida" ni accesos rápidos en Hoy.** Se decidió que no. Reservar vive en
   la Grilla y vender en Caja.
4. **Sin texto libre sobre personas** (ley de datos personales): etiquetas cerradas, nunca un
   campo de notas.
5. **Targets táctiles de 44 px**, sin hover como única affordance (el mostrador usa tablet).
6. **La misma píldora de estado** en Hoy, Grilla y Reservas. Sale de una sola tabla en el
   código; si diseñás una píldora nueva, tiene que reemplazar a esa, no convivir.
7. **Jerarquía única de botones**: una acción primaria por superficie; lo destructivo pide
   confirmación; lo reversible ofrece deshacer.

### B.6 Entregables por pantalla

Desktop a 1280 y mobile a 375, cada uno en light y en dark. Para cada pantalla, el estado
**lleno** (un viernes con 4 canchas y turnos en todos los estados) y el **vacío** que se indica
en su bloque. Donde el encargado ve algo distinto del dueño, las dos versiones.

---

## C. Pantalla 1 — Hoy (`/dashboard`)

**Para quién y cuándo.** Solo el dueño. Es la primera pantalla al entrar. Marcelo la abre al
volver al mostrador a las 17 y quiere responder en 5 segundos: **¿qué falta jugar y qué tengo
que resolver?** El encargado no la ve: rebota a la Grilla.

**Lo que tiene hoy, en este orden, y que tiene que seguir teniendo.**

1. **Próximos turnos.** Una fila por cancha en servicio, en el mismo orden que las columnas de
   la Grilla. Cada turno: hora `20:00-21:00`, quién, "ahora" o "en 25 min" cuando arranca
   dentro de la hora, y la píldora de estado. Una cancha sin turnos dice "Libre el resto del
   día." — eso es un dato, no un vacío. El subtítulo del bloque es la ocupación: "9 de 12 ·
   75% de ocupación".
2. **Necesita tu atención.** Cuatro alertas posibles, cada una con su botón al lado: turno
   terminado sin cobrar ("Cobrar $ 16.000"), devoluciones pendientes ("Gestionar"), seña
   rechazada ("Ver reserva"), caja de ayer sin cerrar ("Cerrar caja de ayer"). Vacío, copy
   exacto y no negociable: **"Nada pendiente. Todo cobrado y cerrado."** Ese vacío es el premio
   del día.
3. **Mientras no estabas.** Feed de lo que pasó sin él: reserva online, cancelación, seña
   acreditada. Más reciente primero. Es el momento en que el sistema "vendió por vos".

Arriba de todo, mientras falte configurar algo, una lista de pasos de configuración que se
puede descartar.

**Lo que NO puede aparecer:** cifras de plata (viven en Caja), gráficos (viven en Métricas),
botones de reservar o vender.

**Vacíos a diseñar:** día cerrado ("Hoy el complejo está cerrado."), ninguna cancha en
servicio, y "No queda nada por jugar hoy."

**Qué está mal ahora.** Se ve como tres tarjetas apiladas iguales; no hay jerarquía entre "lo
que viene" y "lo que tengo que resolver"; en mobile la lista de configuración inicial se come
la primera pantalla.

---

## D. Pantalla 2 — Grilla (`/grilla`)

**Para quién y cuándo.** Los dos roles, 8 horas por día. Es donde se vive. Rodrigo, viernes
21:40, solo, con alguien en el mostrador y el teléfono sonando: _"¿tenés cancha a las 22?"_, y
la carga en 15 segundos sin doblar una cancha.

**Anatomía actual.**

- Header fijo: título, fecha, "Por cobrar hoy: $ X (N turnos)" solo cuando hay algo, botón
  "Hoy", selector de densidad (cómodo / compacto) y una tira de días de la semana.
- **Escritorio (≥ 1024 px): la matriz.** Columnas = canchas, filas = horas. El eje horario a la
  izquierda es la **única** fuente de la hora: la celda no la repite. La celda muestra el nombre
  y el estado (ícono + label), con un borde izquierdo de 3 px del color del estado. El slot
  libre muestra un "+" siempre visible. Hay una línea de "ahora", y las horas de la mañana sin
  actividad se pliegan en una banda "08:00–14:00 · Sin actividad · Mostrar".
- **Mobile (< 1024 px): la matriz no existe.** Es un carrusel de páginas con swipe: la primera
  es "Todas" (una fila por hora con todas las canchas como chips: responde "¿tenés cancha a las
  21?"); las siguientes son una por cancha, lista vertical de sus horas. Las píldoras de arriba
  son selector e indicador a la vez.
- Tocar un slot libre abre un **formulario corto** ahí mismo: nombre, teléfono opcional, precio
  ya resuelto por la franja. Guardar, y la celda pasa a ocupada.
- Tocar un turno abre un **panel lateral** con quién, horario, precio, cobrado, pendiente, y las
  acciones: cobrar, cargar consumo de cantina, marcar ausente (pide confirmación, porque le hace
  perder la seña), reprogramar, cancelar (pide motivo y quién cancela), y para un bloqueo,
  liberarlo. Un turno de torneo dice qué torneo lo ocupa y linkea al torneo.
- Leyenda de estados al pie (solo escritorio; en mobile las filas escriben el label).

**Lo que no se negocia:** reservar en 2 interacciones; el slot entero es el blanco; los 9
estados con sus colores de §B.4; la hora no se repite en la celda; 44 px mínimo; sin hover como
única affordance; la banda de madrugada plegada.

**Qué está mal ahora.** El dueño la describió en mobile como _"ilegible e inmanejable"_. En
escritorio funciona pero se ve como una tabla de sistema: sin aire, sin jerarquía entre el
turno de dentro de 10 minutos y el de dentro de 6 horas, y el panel lateral es una lista de
campos. Queremos que un viernes a las 21 con 4 canchas se lea de un vistazo qué está libre, qué
está por empezar y a quién hay que cobrarle.

**Vacíos a diseñar:** día sin ninguna reserva (con la pista de primera vez "tocá un lugar libre
para reservar"), día cerrado, y todas las canchas pausadas.

---

## E. Pantalla 3 — Configuración (`/settings/*`)

**Para quién y cuándo.** Solo el dueño, una vez por mes o menos. Marcelo, en un rato tranquilo
de la mañana, viene a cambiar el horario de cierre, subir el logo, dar acceso a un encargado. El
encargado que entra por error ve un aviso claro de que no tiene acceso, y nada más.

**Anatomía actual.** Cinco pestañas: **Perfil · Reservas · Horarios · Equipo · Facturación**.
(Canchas ya no está acá: es un espacio propio del menú. Avisos ya no es pestaña: vive dentro de
Perfil.)

- **Perfil.** Datos del complejo, logo y portada con un link "Ver mi perfil público" para ver
  dónde aparecen, y abajo el bloque "Avisos" con la única preferencia de notificación.
- **Reservas.** La política: si se pide seña y qué porcentaje (presets 30/50/100), si se
  aceptan reservas online, con cuántos días de anticipación, y hasta cuántas horas antes se
  puede cancelar.
- **Horarios.** Un horario general ("abre 08:00, cierra 23:00, vale para todos los días") y
  excepciones por día plegadas detrás de "Personalizar", incluido "cerrado" y el cierre pasada
  la medianoche. El caso común se resuelve en 2 campos; el raro sigue siendo posible.
- **Equipo.** Lista de miembros con rol (Administrador / Encargado) y estado; invitar por email,
  cambiar rol, desactivar, reenviar invitación. Antes de invitar tiene que ser obvio qué va a
  poder ver el encargado.
- **Facturación.** Plan actual, estado de la suscripción, conexión con MercadoPago para las
  señas.

**Lo que no se negocia:** cinco pestañas y solo esas; el caso común de horarios en 2 campos;
dos roles fijos sin permisos granulares; todo guardado con un botón y un "Guardado" visible;
lo destructivo (desactivar a alguien) pide confirmación.

**Qué está mal ahora.** Cada pestaña es un formulario largo con la misma cara; no se distingue
lo que se toca una vez en la vida (facturación) de lo que se toca cada tanto (horarios); los
bloques de Perfil no dicen para qué sirve cada imagen; Equipo no muestra qué implica cada rol
antes de invitar.

**Vacíos a diseñar:** Equipo sin nadie más que el dueño, y Facturación con MercadoPago sin
conectar.

---

## F. Cómo se evalúa lo que vuelve

Un diseño se acepta si pasa todo esto. Si falla uno, se pide corrección, no se adapta el código.

1. **Cada elemento se puede nombrar con §B.3.** Si hay que inventar una palabra para
   describirlo, está mal.
2. **Ningún color fuera de §B.4.** Ninguna píldora nueva que conviva con la existente.
3. **Reservar sigue siendo 2 interacciones** y cobrar es 1 desde el panel del turno.
4. **Hoy no muestra plata** y no tiene botones de hacer.
5. **Light y dark entregados los dos**, con contraste AA. Mobile a 375 se usa con el pulgar.
6. **Nada nuevo funcionalmente.** Si el diseño necesita un dato que la app no tiene, se marca
   como "REQUIERE INPUT" y se decide aparte; no se dibuja como si existiera.
7. **Se ve como la misma app** en las tres pantallas y en las que no se tocaron (Caja,
   Clientes, Reservas).

---

## Adjuntos

`.design-sync/handoff/2026-09-11/` (no se versiona, es regenerable):

- `capturas/` — 28 PNG, `{desktop|mobile}_{admin|manager}_{dashboard|grilla|settings_*}.png`.
  Las de `dashboard` son previas a #300; regenerar antes de usarlas (ver §A, punto 2).
- `specs/` — copias de `MASTER.md`, `gramatica-interaccion.md`, `pages/dashboard.md` (v3, ya
  refleja #300), `pages/grilla.md`, `pages/horarios-precios.md`, `pages/staff.md`. Son las mismas
  seis que el proyecto ya lleva como guías; se copian acá por si hace falta adjuntarlas a mano.
