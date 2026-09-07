# Aislamiento entre complejos (RLS) — auditoría del 2026-09-05

Fase 1 del [plan de auditorías](plans/2026-09-03-proximas-auditorias.md). Todo lo que
sigue está **medido**, no leído: cada celda tiene el comando que la produce y el arnés
que la genera quedó en el repo, corriendo en integración continua como check bloqueante.

## Veredicto

**La capa de base aguanta; la capa de aplicación tiene un agujero.**

147 celdas medidas con el rol restringido real entrando por login: las 135 de la grilla
principal dan cero filas o rechazo, y las 12 restantes cubren los caminos de jugador, la
herencia de contexto y las tablas globales. No hay ninguna vía por la que un complejo
lea, modifique o borre datos de otro **atacando la base de frente**.

Pero un complejo **podía fabricarse el permiso**. La carga manual de una reserva aceptaba
el identificador de jugador que le mandaran sin verificar que esa persona fuera cliente
del complejo, y marcar esa reserva como ausente creaba la relación que las policies usan
como condición para dejar leer los datos personales. Es 🔴 H-1, y **ya está arreglado**,
junto con el otro camino de la misma clase que apareció al barrer (el alta de abonado).
RLS hacía exactamente lo que promete: el problema era que el código le daba la llave.

Aparte quedan tres superficies donde la base no es la barrera y todo depende de que el
código no se distraiga. Ninguna es una fuga hoy.

## Cómo se midió, y por qué eso importa más que el resultado

### La trampa estaba viva

El archivo de entorno de los tests apunta la base a `postgres`, que en este esquema tiene
el atributo de bypass. Con ese rol las policies no se aplican. Medido:

```bash
docker exec supabase_db_TurnoGol psql -U postgres -d postgres -Atc \
  "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('postgres','turnogol_app','turnogol_worker')"
```

```
postgres|f|t|t          ← el rol al que apunta el entorno de tests
turnogol_app|f|f|t      ← el rol de la aplicación en producción
turnogol_worker|f|t|t
```

Y esto es lo que devuelve el **mismo camino de producción** —poner el contexto del
complejo A y leer una fila del complejo B— según con qué rol se corra:

| Rol de la conexión | Filas del complejo B que devuelve |
|---|---|
| `postgres` (el del entorno de tests) | **1** |
| `turnogol_app` (el de producción) | **0** |

```bash
docker exec -i supabase_db_TurnoGol psql -U postgres -d postgres <<'SQL'
BEGIN;
SELECT set_config('app.current_tenant_id','<complejo A>',true);
SELECT current_user, count(*) FROM courts WHERE id='<cancha del complejo B>';
COMMIT;
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id','<complejo A>',true);
SELECT current_user, count(*) FROM courts WHERE id='<cancha del complejo B>';
COMMIT;
SQL
```

La suite de aislamiento que ya existía esquiva la trampa a mano: se conecta como
`postgres` y adentro de cada transacción asume otro rol. Sirve para las policies, pero
mide un camino que en producción no existe, y en la mayoría de sus bloques asume el rol
de Supabase, no el de la aplicación. **Ningún test pasaba por `withTenantContext`**, que
es el envoltorio real. Esa es la brecha que cierra el archivo nuevo.

### Los cinco controles

Corren antes que la grilla y son bloqueantes.

| # | Control | Resultado |
|---|---|---|
| 0.1 | Identidad de la conexión | `turnogol_app`, sin superusuario, sin bypass, dueño de 0 tablas, seguridad de fila activa |
| 0.2 | Matriz de permisos igual a la de las migraciones | las 8 revocaciones vigentes, más el registro de envíos de push sin ningún permiso |
| 0.3 | **Control negativo**: cada fila sembrada se ve desde su propio contexto | 27 de 27 |
| 0.4 | **Control positivo**: con contexto de A, la fila de B da cero | 0 filas |
| 0.5 | La forma de las policies de lectura es la declarada | 1 abierta, 27 por complejo, 7 por jugador |

El control 0.3 encontró algo apenas se escribió: `player_favorites` daba cero desde
contexto de personal. No era un fallo de siembra ni de aislamiento — esa tabla sólo tiene
policies por jugador. Sin ese control, esa celda habría contado como "aislada" cuando en
realidad no se estaba mirando nada.

### La prueba que decide si el arnés mide algo

Se abrió a mano la policy de lectura de `payments` y se corrió la suite.

**Primera versión: 140 casos en verde con la policy rota.** El arnés derivaba del catálogo
qué tablas tenían lectura abierta, así que la tabla mutada se reclasificaba sola como
"excepción de diseño" y el caso pasaba a esperar que la fila ajena **sí** se viera. Un
arnés que se adapta a la rotura no mide nada.

Corregido —la clasificación pasó a ser declarada y contrastada contra la leída— el mismo
mutante se pone rojo en los tres lugares correctos:

```
FAIL  0. controles > 0.5 la forma de las policies de lectura sigue siendo la declarada
FAIL  1.1 lectura ajena → 0 filas > payments
FAIL  1.5 sin ningún contexto → 0 filas > payments
Tests  3 failed | 138 passed (141)
```

## La grilla

27 tablas con columna de complejo. Contexto del complejo A, operando contra filas del
complejo B. Todo dentro de transacciones que se deshacen.

```bash
pnpm test:isolation:rol-real
```

| Tabla | Lectura | Modificación | Borrado | Alta ajena | Sin contexto |
|---|---|---|---|---|---|
| `abonados` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `analytics_events` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `audit_logs` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `bookings` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `canteen_products` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `canteen_tabs` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `cash_flows` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `courts` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `daily_cash_closes` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `daily_cash_opens` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `feature_flags` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `notifications` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `payments` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `player_favorites` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `player_tenant_relationships` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `push_subscriptions` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `reviews` | ⚠️ **1 fila** | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ⚠️ **1 fila** |
| `stock_movements` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tenant_player_bans` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tenant_staff_members` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tenant_subscriptions` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tournament_match_events` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tournament_matches` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tournament_stages` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tournament_team_players` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tournament_teams` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |
| `tournaments` | ✅ 0 filas | ✅ 0 filas | ✅ 0 filas | ✅ rechazada | ✅ 0 filas |

La columna **sin contexto** es la que más vale: es el modo de falla realista en
producción, una consulta que se olvidó del envoltorio. Con el contexto vacío la
comparación de la policy da nulo y no devuelve nada.

Las 27 altas ajenas fueron rechazadas con el error de seguridad de fila **nombrando esa
misma tabla**. Eso no es decorativo: si el alta muriera antes por una clave foránea, la
policy nunca se ejercitaría y la celda pasaría por la razón equivocada. Para lograrlo, el
alta copia la fila real del otro complejo cambiándole sólo el identificador, así llega con
todas sus dependencias satisfechas. Hubo que ajustar dos cosas para que eso funcionara y
las dos son gotchas del repo: el parámetro necesita un doble casteo porque el pool tiene
serializador de jsonb y si no se serializa dos veces, y `notifications` tiene un disparador
que valida el destinatario antes de que corra la comprobación de seguridad.

### No todos los ceros son el mismo cero

Ocho tablas dan cero en modificación o borrado porque **el privilegio está revocado**, no
porque la policy filtre. Las dos cosas aíslan, pero describen sistemas distintos:

| Tabla | Operación sin privilegio |
|---|---|
| `audit_logs` | modificación y borrado |
| `daily_cash_closes` | modificación y borrado |
| `stock_movements` | modificación y borrado |
| `analytics_events` | modificación |
| `tournament_match_events` | modificación |
| `canteen_products` | borrado |
| `canteen_tabs` | borrado |
| `daily_cash_opens` | borrado |

## Los caminos de jugador

Las híbridas tienen policies duales. Probar sólo el camino del personal deja la mitad sin
medir.

| Caso | Resultado |
|---|---|
| El jugador de B lee la relación del complejo A | 0 filas |
| El jugador A se da de alta a nombre del jugador B | rechazada, nombrando la tabla |
| Un jugador lee el favorito de otro | 0 filas |
| Un jugador crea un favorito a nombre de otro | rechazada, nombrando la tabla |
| Desde contexto de personal, los favoritos | 0 filas: no hay policy por complejo |

## El contexto no sobrevive entre pedidos

Con el pool reducido a una sola conexión, dos transacciones consecutivas caen sí o sí en
la misma conexión física. Si la segunda heredara el contexto de la primera, en producción
un pedido leería los datos del pedido anterior.

| Caso | Resultado |
|---|---|
| Después de un contexto de complejo, transacción sin contexto | 0 filas |
| Después de un contexto de jugador, transacción sin contexto | 0 filas |
| Un complejo seguido de otro complejo | 0 filas del primero |

## Las tablas globales

Cuatro tablas no tienen seguridad de fila, por diseño: complejos, planes, versiones de
precio y webhooks procesados. La pregunta ahí no es si están aisladas —no lo están— sino
hasta dónde llega el rol de la aplicación. Medido:

| Caso | Resultado |
|---|---|
| Con contexto del complejo A, leer la fila del complejo B | **1 fila**: nombre, contacto, todo |
| Leer las credenciales de MercadoPago del complejo B | **legibles**, sin permiso por columna |
| Modificar la fila del complejo B | **1 fila pisada** |
| Modificar el catálogo de planes | **filas modificadas** |
| Leer el registro de envíos de push | denegado, sin permisos |

Los permisos amplios salen de la migración 037, que otorga las cuatro operaciones sobre
todas las tablas del esquema. No es un artefacto del entorno de pruebas.

## Producción

El esquema de producción calca al local, así que la grilla lo describe:

| | Local | Producción |
|---|---|---|
| Tablas del esquema público | 35 | 35 |
| Con seguridad de fila | 31 | 31 |
| Con seguridad de fila pero sin forzarla | 0 | 0 |
| Con columna de complejo | 27 | 27 |
| Con columna de complejo y **sin** seguridad de fila | 0 | 0 |
| Policies | 101 | 101 |
| Rol de la aplicación con bypass | no | no |

**El cifrado de las credenciales de MercadoPago aguanta en producción.** Sonda de sólo
lectura, sin descifrar y sin traer ningún valor:

| Complejos | Con credencial | Con forma de sobre cifrado | En claro detectadas |
|---|---|---|---|
| 2 | 2 | 2 | **0** |

## Hallazgos

### 🔴 H-1 · Un complejo se fabricaba la relación con un jugador ajeno y le leía los datos personales — CERRADO

Es el único hallazgo donde un complejo termina viendo datos de una persona que nunca fue
su cliente. RLS no falla: el código le entrega la condición que la policy pide.

**La cadena, verificada línea por línea:**

1. La carga manual de una reserva escribe el identificador de jugador que llega del
   cliente **sin verificar que esa persona tenga relación con el complejo**. Lo único que
   valida contra el complejo es la cancha.
   [booking.service.ts:255](../../src/modules/bookings/booking.service.ts:255) inserta
   `playerId: input.playerId ?? null`; el esquema lo acepta como campo opcional y su única
   regla cruzada es no mezclar jugador registrado con datos de invitado.
2. La policy de alta sobre reservas sólo mira el complejo, no el jugador, así que la fila
   entra sin problema.
3. Marcar esa reserva como ausente crea la relación **incondicionalmente**:
   [ptr.service.ts:109](../../src/modules/relationships/ptr.service.ts:109) hace un alta
   con `ON CONFLICT DO NOTHING` sin ninguna precondición. El comentario de arriba lo dice
   con todas las letras: *"crea la relación si la reserva era manual y el jugador todavía
   no tenía relación (la carga manual no la crea)"*.
4. Esa fila es exactamente la condición de la policy de lectura sobre jugadores:
   `EXISTS (SELECT 1 FROM player_tenant_relationships ptr WHERE ptr.player_id = players.id AND ptr.tenant_id = <contexto>)`.
5. Desde ahí la lista de personas del panel muestra nombre completo, correo y teléfono
   ([jugadores/queries.ts:124](<../../src/app/(admin)/jugadores/queries.ts:124>)).

**El repo ya tiene el guard correcto, en el camino de al lado.**
[contact-link.service.ts:35](../../src/modules/relationships/contact-link.service.ts:35)
define `playerBelongsToTenant` y su comentario describe este mismo ataque:
*"Vincular contra un identificador arbitrario sería escribirle una relación a alguien de
otro complejo, y encima revelaría su nombre en la lista."* La carga manual no lo llama.

**Daño colateral que no necesita ninguna precondición:** el complejo le escribe a esa
persona una ausencia y, en la segunda, un bloqueo temporal. La persona lo ve, porque la
policy de bloqueos propios se lo muestra, a nombre de un complejo que nunca visitó.

**Qué tan explotable es, medido y no supuesto.** Para leer los datos hace falta conocer el
identificador de un jugador ajeno. La vía obvia —leer identificadores desde la interfaz
pública de datos, aprovechando que la lectura de reseñas es abierta— **está cerrada**: en
producción los roles anónimo y autenticado no tienen ningún permiso de tabla.

```sql
SELECT grantee, table_name FROM information_schema.table_privileges
WHERE table_schema='public' AND grantee IN ('anon','authenticated')
  AND table_name IN ('reviews','players','bookings','tenants','player_tenant_relationships');
-- 0 filas
```

El endpoint público de reseñas tampoco publica el identificador de la persona. O sea: el
escalón de escritura está abierto para cualquier miembro del personal, y el de lectura
requiere conseguir el identificador por otro lado. Sigue siendo 🔴 porque el invariante
que se rompe —"un complejo sólo ve a sus clientes"— es el que sostiene el producto, y
porque el arreglo es una línea que el repo ya escribió en otro archivo.

**Qué lo cerraría**: llamar a `playerBelongsToTenant` desde la carga manual antes de
aceptar el identificador, y rechazar si no hay relación previa. Con un test que lo
demuestre en rojo antes del arreglo.

### 🟡 H-2 · La lectura de reseñas es abierta y expone identificadores de persona — CERRADO

Es la única policy `USING (true)` del esquema, y es deliberada: el portal público muestra
reseñas. Lo que la auditoría midió es el **alcance** de esa excepción. Sin ningún
contexto, y con el rol restringido, se leen las reseñas de todos los complejos incluyendo
el identificador del jugador y el de la reserva. Con eso se reconstruye quién jugó en qué
complejo.

La barrera real es la proyección que hace el código, que sí recorta esas columnas y lo
tiene comentado citando la ley de datos personales. Pero es una capa de arriba: cualquier
consulta futura que traiga la fila entera queda expuesta y ningún test lo detendría.

**Qué lo cerraría**: restringir el permiso de lectura por columna sobre esa tabla, o
partir la lectura pública en una vista sin los dos identificadores.

### 🟡 H-3 · El rol web puede escribir tablas que sólo debería leer — CERRADO

El rol de la aplicación tiene las cuatro operaciones sobre `tenants`, `plans`,
`price_versions`, `processed_webhooks`, `players` y `staff_users`. Ninguna tiene seguridad
de fila salvo las dos últimas, y ninguna necesita borrado desde el runtime web. Medido:
desde el contexto de un complejo se pisó el nombre de otro y se modificó el catálogo de
planes.

No es una fuga: hoy ningún camino de código lo hace. Es alcance de más, y convierte
cualquier consulta con el filtro equivocado en un incidente de datos de otro complejo.

**Qué lo cerraría**: una migración que revoque borrado sobre esas seis y modificación
sobre el catálogo de planes y versiones de precio. El caso 0.2 del arnés nuevo ya está
listo para fijar la matriz corregida.

### 🟡 H-4 · El chequeo de despliegue de staging no verifica la identidad del rol — CERRADO

Producción falla el despliegue si la base no entra como el rol restringido. Staging sólo
mira el atributo de bypass, que no alcanza: un DSN apuntando al dueño de las tablas pasa
ese chequeo. Hoy no muerde porque todas las tablas fuerzan la seguridad de fila, pero es
la misma clase de agujero que el chequeo de producción existe para tapar.

**Qué lo cerraría**: copiar a staging la verificación de identidad que ya tiene
producción.

### 🟢 H-5 · La documentación de multi-inquilino tiene dos errores medidos — CERRADO

`CLAUDE.md` lista jugadores y personal entre las tablas globales sin seguridad de fila, y
las dos la tienen. Y la tabla del registro de envíos de push no aparece en ninguna de las
cuatro líneas de esa sección, siendo la única del esquema que queda sin clasificar.

### 🟢 H-6 · La lista de revocaciones del arnés viejo es un espejo mantenido a mano — CERRADO

El ayudante de tests vuelve a otorgar todo sobre todas las tablas y después re-aplica las
nueve revocaciones una por una. Hoy la lista está completa, pero cualquier revocación
futura que no se copie ahí deja al rol con permisos que producción no le da, y los tests
de esa tabla pasarían midiendo otra cosa.

Ya está mitigado: el caso 0.2 del arnés nuevo afirma la matriz de permisos vigente contra
la esperada y se pone rojo ante cualquier deriva, en las dos direcciones.


### 🟡 H-7 · Una consulta fallida manda las credenciales cifradas al reporte de errores — CERRADO

Cuando una consulta de Drizzle falla, el mensaje de la excepción **incluye los parámetros
enlazados**. Verificado en la versión instalada, 0.45.2:

```js
// node_modules/drizzle-orm/errors.js
class DrizzleQueryError extends Error {
  constructor(query, params, cause) {
    super(`Failed query: ${query}\nparams: ${params}`)
```

El cron que renueva las credenciales de MercadoPago pasa los dos textos cifrados como
parámetros de su modificación, y su bloque de captura loguea `err.message` crudo bajo la
clave `error`
([refresh-mp-tokens.worker.ts:91](../../src/shared/jobs/workers/refresh-mp-tokens.worker.ts:91)).
La red que tapa datos sensibles antes de mandar al reporte de errores **compara nombres de
clave, nunca contenido** ([sentry-pii-scrub.ts:31](../../src/lib/sentry-pii-scrub.ts:31)),
y la clave acá es `error`, así que el texto pasa entero.

Alcance real, sin inflarlo: lo que sale es texto cifrado con clave simétrica y vector de
inicialización aleatorio, y la clave de cifrado nunca entra al mensaje. No es una
credencial usable ni un cruce entre complejos. Es material de credencial de un complejo
saliendo hacia un tercero, en un sistema cuyo modelo declarado es que el cifrado es la
única barrera.

Y no es una línea: es un patrón. El mismo `error: err.message` aparece al menos en los dos
bloques de captura del webhook de MercadoPago.

**Qué lo cerraría**: sacar la parte de parámetros del mensaje antes de loguear, o hacer que
el tapado también mire contenido y no sólo nombres de clave.

### 🟡 H-8 · El filtro previo al envío no limpia las migas ni la excepción — CERRADO

El filtro de salida hacia el reporte de errores toca sólo tres campos del evento: los
extras, los contextos y el usuario. Las migas de navegación —que incluyen lo que se
escribió por consola— y el propio objeto de excepción quedan sin pasar por el tapado.
Combinado con H-7, un mismo texto con credenciales cifradas puede viajar por más de un
campo del mismo evento, y arreglar sólo los extras no alcanza.

### 🟢 H-9 · Dos superficies confirman existencia de cuenta sin autenticar

El alta de complejo responde distinto según el correo ya exista o no, y la invitación de
personal deja inferir si una cuenta ya inició sesión alguna vez. Las dos están comentadas
en el código como deliberadas y tienen límite de frecuencia. Se listan para que estén
contadas, no como algo a cambiar durante el congelamiento.


## Qué se arregló, y con qué evidencia

**H-1 está cerrado, y con él su clase.** El arreglo se hizo con el test demostrado en rojo
antes de tocar el código, que es lo único que prueba que el test mide algo.

### El rojo antes del arreglo

```
× carga manual: el complejo A no puede cargar una reserva a nombre de un jugador de B
  → promise resolved "{ …(27) }" instead of rejecting
× no queda ninguna reserva ni relación escrita a nombre del jugador ajeno
  → expected 1 to be +0
Tests  2 failed | 2 passed (4)
```

La reserva con jugador ajeno se creaba sin chistar, y quedaba la fila escrita.

### El arreglo

El guard que ya existía suelto en el camino de vinculación de contactos pasó a vivir en
`ptr.service.ts`, al lado de la función que crea la relación, y ahora lo llaman los dos
caminos. Una sola copia a propósito: tener el guard duplicado en cada llamador es
exactamente cómo nació este hallazgo.

| Camino | Antes | Ahora |
|---|---|---|
| Carga manual de reserva | aceptaba cualquier jugador | exige relación previa |
| Alta de abonado | aceptaba cualquier jugador | exige relación previa |
| Vinculación de contacto | ya lo exigía | usa el guard canónico |

Los tres casos legítimos siguen funcionando y están cubiertos: jugador propio, contacto
sin cuenta (el campo es opcional a propósito, el mostrador carga gente sin cuenta todo el
tiempo) y la relación que se crea sola al marcar una ausencia de un jugador propio.

### El barrido de clase

La pregunta era dónde más entra un identificador de jugador desde el cliente y termina
creando la relación que destraba leer datos personales.

| Camino | Veredicto |
|---|---|
| Carga manual de reserva | era vulnerable · **arreglado** |
| Alta de abonado | era vulnerable · **arreglado** |
| Reserva desde el portal | limpio: el identificador sale de la sesión, no del pedido |
| Vinculación de contacto | limpio: ya tenía el guard |
| Jugadores de un torneo | limpio: no crea la relación, así que no destraba nada |
| Baneo manual | era vulnerable (sin exponer datos) · **arreglado**, ver H-10 |

### La verificación

Con H-1, su clase y H-10 ya arreglados:

```
pnpm test:integration     147 archivos · 1023 casos · 0 fallos
pnpm test:isolation       170 casos
pnpm test:isolation:rol-real  155 casos
pnpm test                 3922 casos
lint · typecheck · knip   sin hallazgos
format:check              solo scripts/ig-follow/accounts.json, sin relación con esto
```

Los archivos nuevos son `tests/integration/manual-booking-foreign-player.test.ts`,
`tests/integration/abonado-foreign-player.test.ts` y
`tests/integration/manual-ban-foreign-player.test.ts`.

### 🟡 H-10 · El baneo manual acepta un jugador que no es cliente — CERRADO

Salió del barrido de clase de H-1. `banPlayerManually` recibía el identificador de jugador
del pedido y escribía el bloqueo sin verificar relación previa. **No exponía datos
personales** —a diferencia de los otros dos, este camino no crea la fila de relación, así
que la policy de lectura sobre jugadores seguía cerrada— pero un complejo podía escribirle
un bloqueo a una persona que nunca lo visitó, y esa persona lo ve, porque la policy de
bloqueos propios se lo muestra.

El rojo antes del arreglo, midiendo lo que quedaba escrito:

```
× el complejo A no puede banear a un jugador de B
  → expected undefined to be false
× no queda ningún bloqueo escrito a nombre del jugador ajeno
  → expected 1 to be +0
Tests  3 failed (3)
```

El guard es el mismo `playerBelongsToTenant` que cerró H-1, y vive en el service y no en la
Server Action justamente porque H-1 nació de un guard que existía en un solo llamador. El
service pasó a devolver un booleano, igual que `liftPlayerBan` al lado; la acción traduce
el `false` a un mensaje y no escribe registro de auditoría, sin necesidad de un `try`/`catch`
que hoy no tenía.

Ningún camino legítimo de la interfaz se rompe: la ficha de la persona ya devuelve 404 sin
relación previa, porque su consulta arranca el `FROM` en la tabla de relaciones. La única
forma de llegar con un identificador ajeno era invocar la Server Action a mano.

**Tres tests existentes baneaban jugadores sin relación previa y por eso se pusieron
rojos.** Uno de ellos era el de aislamiento entre complejos, que sin el vínculo habría
pasado a aprobar por vacío: el bloqueo no se escribía en ninguno de los dos lados. Se les
agregó el vínculo, que es el estado que la aplicación produce de verdad.

## La segunda pasada de arreglos

Cerrados en el mismo día, en el orden que pide el protocolo: primero el rojo, después los
amarillos. Cada uno con su test, y el arnés re-corrido entero después de cada uno.

### H-7 y H-8 · El material de credencial que salía hacia el reporte de errores

Son un solo problema con dos mitades. El arreglo va **en el logger**, no en los 49 lugares
que escriben el mensaje de una excepción: es el único punto por el que pasan todos, y de
paso cubre la salida estándar además del reporte de errores.

```
× los recorta del texto que va bajo `error`
  → expected 'Failed query: update "tenants" set "m…' to contain 'params: [REDACTED]'
× lo que llega al reporte de errores ya viene recortado
  → expected '{"timestamp":…}' not to contain 'v1:9c4f2a'
```

Se conserva la consulta, que está parametrizada y es lo único de ese mensaje que sirve para
depurar, y se tira la lista de parámetros.

La segunda mitad: los **cuatro** entrypoints del reporte de errores —navegador, web,
workers y edge— tenían cada uno su copia del tapado, y se habían ido separando; el de edge
directamente no tapaba nada. Ninguno tocaba las migas de navegación ni la excepción. Ahora
hay una sola función, y el tapado mira también el CONTENIDO y no sólo los nombres de clave,
que era el agujero por el que pasaba un mensaje sensible bajo una clave inocente. El test
de paridad, que antes miraba sólo el navegador, ahora exige que los cuatro usen la función
compartida y que ninguno vuelva a forkearla.

Faltaba una tercera pieza, que apareció al cruzar esto con la auditoría integral del día
siguiente: las migas llevaban el identificador de la persona en su `data`, y ninguna lista
de nombres de clave del tapado de Sentry lo reconocía. La lista que sí lo reconoce era la
del destino durable de métricas, en otro módulo. Se movió a un módulo propio sin
dependencias y ahora el filtro se aplica en el ORIGEN, una vez, para los dos destinos.
Sentry conserva `user.id`: lo que se fue es la copia, no la trazabilidad.

### H-3 · Mínimo privilegio sobre las seis tablas globales

Migración 083. Antes de revocar nada, el barrido sobre el código:

| Qué se revocó | Por qué no rompe nada |
|---|---|
| Borrado en las seis globales | ningún borrado del runtime web sobre ellas; el único de producción es el de webhooks procesados, en el worker de retención, con otro rol |
| Escritura del catálogo comercial | planes y versiones de precio sólo se escriben desde migraciones, que corren como dueño |

Los guiones de siembra se conectan con un DSN propio de superusuario, no con el del rol de
la app, así que tampoco los toca.

Lo que **no** se pudo cerrar y queda anotado como límite: la modificación de la tabla de
complejos. La aplicación edita su propia fila —ajustes, credenciales de MercadoPago— y esa
tabla no tiene seguridad de fila que distinga una fila de otra. El caso 4.4 del arnés lo
sigue midiendo y afirmando, ahora como límite conocido y no como hallazgo abierto.

Prueba de mutación del arnés: devolviendo a mano los dos permisos revocados, los casos
nuevos se ponen rojos.

```
× 4.6 el catálogo comercial es de sólo lectura para el rol de la app (migr. 083)
  → expected 'plans: ESCRITO' to contain '42501'
× 4.7 ninguna de las seis tablas globales se puede BORRAR desde el rol de la app
  → expected [ 'players' ] to deeply equal []
```

### H-2 · La reseña ya no ata a una persona

Migración 084. La lectura sigue abierta, porque el portal público muestra reseñas sin
sesión, pero la seguridad de fila es por FILA y no puede esconder una columna: la
herramienta es el permiso **por columna**.

Se esconde el identificador de la persona, que es el que ata la reseña a alguien. El de la
reserva se conserva porque el propio módulo filtra por él para detectar la reseña
duplicada, y por sí solo no resuelve a nadie, porque la tabla de reservas sí tiene
seguridad de fila.

```
id|t · tenant_id|t · player_id|f · booking_id|t · rating|t · comment|t · created_at|t
```

La respuesta de la interfaz de datos **no cambia**: el alta de reseña devolvía esos dos
identificadores leyéndolos de la fila recién escrita, y ahora los devuelve desde los
argumentos que ya recibió. Son los mismos valores y son del jugador que los está pidiendo.
El detalle que importa para el futuro: con permisos por columna, un `.returning()` pelado
rompe en runtime.

### H-4 · El chequeo de staging ahora verifica la identidad, no sólo el atributo

El chequeo de producción ya lo hacía. La consulta de staging ya leía el nombre del rol para
otra cosa, así que alcanzó con exigir que sea el esperado. El caso que discrimina es un DSN
apuntando al dueño de las tablas: la seguridad de fila sólo restringe a los que no son
dueños en tablas sin forzarla.

### H-5 · La documentación

La sección de multi-inquilino listaba jugadores y personal como globales sin seguridad de
fila, y las dos la tienen, con forzado. Se partió la línea en dos y se sumó el registro de
envíos de push, que era la única tabla del esquema sin clasificar.

### H-6 · El espejo de revocaciones se borró en vez de mantenerse

El ayudante de tests otorgaba las cuatro operaciones sobre TODAS las tablas y después
re-aplicaba a mano la lista acumulada de revocaciones de nueve migraciones. Mientras la
lista estuviera completa funcionaba; el problema era estructural, porque una revocación
nueva que llegara a una migración y no al ayudante dejaba al rol con permisos que
producción no le da, y los tests de esa tabla pasaban midiendo otra cosa. Esta misma
auditoría le agregó dos bloques más, o sea que el espejo crecía.

El arreglo no fue completar el espejo sino sacarlo: el ayudante ya no le otorga nada al rol
de la aplicación, así que sus permisos salen únicamente de las migraciones, que es donde
siempre estuvieron definidos. El otorgamiento masivo queda sólo para el rol de Supabase, que
ninguna migración toca.

El precio es que la base local tiene que tener las migraciones aplicadas, cosa que la suite
de integración ya exigía. Y esa condición ahora tiene red: alterando un permiso a mano, el
control 0.2 lo dice con la diferencia exacta en vez de esconderla.

```
× 0.2 permisos: la matriz vigente coincide con la que definen las migraciones
  → expected 'audit_logs=DELETE,INSERT,SELECT' to be 'audit_logs=INSERT,SELECT'
```

### Lo que queda abierto

- 🟢 **H-9** · Las dos superficies que confirman existencia de cuenta. Están comentadas como
  deliberadas, tienen límite de frecuencia y cambiarlas es una decisión de producto sobre las
  respuestas del alta, no un arreglo técnico. Se dejan como están durante el congelamiento.
- Un **límite conocido**, no un pendiente: la aplicación puede modificar la fila de complejo
  de otro, porque edita la propia y esa tabla no tiene seguridad de fila que las distinga.
  Cerrarlo es un cambio de arquitectura, no un arreglo mínimo. El filtro explícito por
  complejo es la barrera, y el caso 4.4 del arnés lo mide y lo deja dicho.
- De los cuatro candidatos **sin medir** del barrido de código, la auditoría integral del día
  siguiente resolvió dos: el resguardo de la página principal del panel de sistema resultó
  correcto, y el de cómo se resuelve el complejo activo resultó ser un hallazgo rojo propio,
  que se trabaja aparte. Quedan dos sin medir: la herencia de causa en el reintento de pagos
  —que este mismo trabajo probablemente ya cierre, porque el recorte de parámetros ahora
  alcanza a la excepción entera— y la suplantación resolviendo un complejo distinto al
  elegido.

### La verificación de esta pasada

```
pnpm test                     3938 casos
pnpm test:integration         147 archivos · 1023 casos
pnpm test:isolation           170 casos
pnpm test:isolation:rol-real  157 casos
lint · typecheck · knip       sin hallazgos
format:check                  solo scripts/ig-follow/accounts.json, sin relación con esto
```

Las dos migraciones se aplicaron a la base local para poder medir contra ellas. **En
producción entran solas al mergear**, por el flujo de migraciones de integración continua.

## Límites de esta auditoría

Lo que sigue es lo que **no** quedó cubierto, para que nadie lea la grilla como una
promesa más amplia de lo que es.

- La grilla mide la base local. El esquema de producción es idéntico —35 tablas, 31 con
  seguridad de fila, cero sin forzarla, 101 policies, rol sin bypass— así que las
  conclusiones sobre policies y permisos trasladan. Lo que no traslada es el contenido:
  la grilla no dice nada sobre datos ya guardados en producción. Eso es la fase 2A.
- El barrido de código corrió con verificación adversarial de tres revisores por
  candidato. **Dieciséis de esas verificaciones murieron por límite de sesión**, así que
  cuatro candidatos quedaron sin ningún voto y no entraron ni como confirmados ni como
  descartados: la herencia de causa en el reintento de pagos, el resguardo propio de la
  página principal del panel de sistema, y dos sobre cómo se resuelve el complejo activo
  en la sesión y en la suplantación. **No están refutados: están sin medir.** Merecen una
  segunda pasada.
- Trece candidatos sí fueron refutados por mayoría y quedan fuera del informe a propósito,
  entre ellos que la lectura de la fila completa del complejo llegue al navegador (la
  sanea una lista blanca de campos) y que las reseñas expongan identificadores por la
  interfaz pública de datos (los roles anónimos no tienen permisos en producción).
- El congelamiento de funcionalidades permite estos arreglos: son seguridad. La medición se
  cerró primero y los arreglos vinieron después, en pasadas propias, para no mezclar medir
  con arreglar: el entregable de la auditoría es la grilla.

## Cómo re-correrlo

```bash
pnpm supabase:start
pnpm test:isolation:rol-real
```

El arnés vive en `tests/integration/isolation-app-role.test.ts` y corre en integración
continua como paso bloqueante, después del de aislamiento existente y nunca en paralelo:
reapunta la base al rol restringido y le habilita el ingreso mientras dura el archivo,
restaurando la credencial exacta al terminar.

Se agrega solo a la grilla lo que aparezca en la base: si una migración crea una tabla con
columna de complejo y nadie la agrega a la lista declarada, el caso 1.0 se pone rojo.
