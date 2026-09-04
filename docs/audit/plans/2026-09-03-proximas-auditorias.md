# Plan de auditorías de TurnoGol

Escrito el 2026-09-03, saliendo de la campaña de mutación de tests.
Orden pensado contra el contexto real: **feature freeze hasta el 1 de noviembre** y
**experimento comercial de 30 días corriendo**, buscando el primer cliente.

> **Estado al 2026-09-03.** La **Fase 0 está cerrada**: los 8 bugs de la lista (9 con
> el que apareció al sweepear la clase del #8) se arreglaron cada uno con su test
> demostrado en rojo antes del fix, y entraron a `main` en el PR #265. Lo que sigue es
> la **Fase 1**, y **3A** es lo único que conviene abrir en paralelo.
>
> Este archivo vivía sólo en el scratchpad temporal de la sesión que lo escribió; se
> copió al repo el 2026-09-03 para que deje de depender de un directorio que se borra.

---

## Las dos reglas que hacen que una auditoría sirva

**1. Medí, no leas.** "Leí el código y me parece que está bien" no es auditar, es
opinar. Cada auditoría de acá tiene un experimento que puede salir mal.

**2. Control positivo siempre, y primero.** Algo que DEBE fallar. Sin eso no podés
distinguir "está protegido" de "el harness no probó nada". En la campaña de tests
esto salvó la medición dos veces: una tanda entera parecía "todo sobrevive" y en
realidad no había corrido ningún test.

**Y la regla de secuencia, que es la que se viola siempre:** no arranques una
auditoría nueva con hallazgos de la anterior sin arreglar. Una lista de 400 hallazgos
que nadie ataca vale exactamente cero, y cuesta lo mismo que una que sí se ataca.

---

## FASE 0 — Arreglar lo que ya encontraste · ANTES de auditar nada más

**Por qué va primero:** ya tenés 8 bugs verificados contra el código, uno de ellos 🔴,
y están sin arreglar. Auditar más mientras esos siguen ahí es la trampa clásica: se
siente productivo y no cambia nada. Además **todos caen dentro de lo que el feature
freeze permite** (bugs, seguridad, circuitos de plata), así que no compiten con el
experimento comercial.

**Tiempo: 1-2 sesiones.** Es el mejor retorno de todo este documento.

Orden dentro de la fase, por daño:

1. 🔴 **El mail de baja miente el plazo de retención.** Dice 7 días cuando el contrato
   dice 90 (y 67 vs 97 en la otra transición). La migración que fijó los 90 arregló la
   constante y las filas, y se olvidó del texto que lee el cliente. Es una afirmación
   falsa a un cliente sobre sus datos, con `/terminos` prometiendo otra cosa.
   `dunning-retry.worker.ts:185` y `:218` — los literales `7` y `67` tienen que salir
   de `CHURNED_DELETION_DAYS` y `CANCELED_BLOCKED_DELETION_DAYS`.
2. **Cierre de caja concurrente tira error crudo de Postgres.** `isUniqueViolation` de
   `daily-close.service.ts` mira `code` en el nivel superior, pero Drizzle lo envuelve
   y viaja en `cause`. El repo ya resolvió esto en `tournaments/pg-errors.ts`: usar ese.
3. **Push que afirma de más.** `daily-summary.worker.ts:112` dice "caja cerrada sin
   diferencia" cuando el booleano solo prueba que hubo cierre.
4. **Pausar un abonado borra la sesión que ya se jugó hoy.** `abonado.service.ts:307`
   y `:425` filtran por `date >= hoy` en vez de `starts_at >= NOW()`.
5. **Firma anti-CSRF de MercadoPago con clave vacía.** `api/mp/callback/route.ts:84`
   usa `process.env.MP_CLIENT_SECRET ?? ''` salteando la validación de `env.ts`. Como
   el que firma usa el mismo `?? ''`, si falta la variable **el flujo sigue andando
   sin protección** en vez de romperse. Falla abierto.
6. **429 sin id de trazabilidad.** `rate-limit/route-guard.ts:16` no pasa el requestId,
   así que el único status donde el cliente reintenta es el único sin correlación.
7. **El scrub de datos personales tiene un agujero.** `sentry-pii-scrub.ts` redacta
   menos claves en la URL que las que declara sensibles: `dni`, `phone` y los tokens
   de MercadoPago quedan afuera.
8. **`SELECT` de fallback sin filtro de complejo** en `cashflow.service.ts:197`,
   contra la regla de defensa en profundidad del propio repo.

**Definición de terminado:** cada fix con su test, y el test demostrado en rojo antes
de darlo por bueno. Si el test pasa sin el fix, no probó nada.

---

## FASE 1 — Aislamiento entre complejos (RLS) · lo que bloquea vender

**Por qué acá:** es la única auditoría de la lista donde un hallazgo no significa
"arreglemos un bug" sino "no podemos vender esto todavía". Un complejo que ve la plata
de otro mata un SaaS B2B el mismo día. Y no es teórico: la campaña de mutación ya
demostró huecos en el núcleo de aislamiento (`shared/db/client.ts`,
`server/middleware/with-tenant.ts`, `with-role.ts`).

**Cuándo:** cuando termine la campaña de tests. Necesita **la base local libre**, y el
tier de integración la está usando.

**Tiempo: 1-2 sesiones.** Son ~25 tablas × 4 operaciones, pero es todo scriptable.

**No se puede paralelizar con nada que use la base local.**

```
Auditá el aislamiento entre complejos (RLS) de TurnoGol. No leas código para opinar:
armá un experimento que pueda salir mal.

LA TRAMPA QUE ARRUINA ESTA AUDITORÍA: en desarrollo la app conecta como superusuario,
así que las policies de RLS NO se aplican y todo pasa en verde sin haber probado nada.
El experimento entero tiene que correr con el rol restringido real (turnogol_app, vía
getDb()), nunca con el pool de worker ni como superusuario.

CONTROL POSITIVO, PRIMERO DE TODO: creá dos complejos con datos y, con el rol
restringido y el contexto del complejo A puesto, leé una fila del complejo B. Tiene que
devolver CERO filas. Si devuelve la fila, estás corriendo como superusuario y todo lo
que midas después es basura: pará y arreglá eso antes de seguir.

Después, tabla por tabla de las aisladas que lista CLAUDE.md, probá las cuatro
operaciones desde el complejo A contra filas del complejo B:
  SELECT devuelve 0 filas · UPDATE afecta 0 filas · DELETE afecta 0 filas ·
  INSERT con tenant_id ajeno es rechazado

Las tres híbridas (player_tenant_relationships, reviews, player_favorites) tienen
policy dual admin/jugador: probá los dos caminos, no solo el de admin.

Las globales sin RLS (tenants, players, staff_users, plans, price_versions,
processed_webhooks) tienen otra pregunta: ¿qué código puede leerlas y devolver datos de
otro complejo en un payload? Especial atención a tenants.mp_access_token y
mp_refresh_token, donde el cifrado es la ÚNICA barrera.

Entregable: una fila por tabla y por operación, con el resultado medido y el comando
que lo produce. Cualquier celda que no sea "0 filas" es 🔴.
```

---

## FASE 2 — La plata, contra datos reales · lo que ya pasó y no viste

Dos auditorías hermanas. Encuentran bugs que **ninguna revisión de código encuentra**,
porque los produjo la realidad: un webhook perdido, un reintento duplicado, una seña
cobrada con la caja cerrada.

**Cuándo:** cualquier momento. Consultan producción, que es otra base — **se pueden
correr en paralelo a todo lo demás**.

**Tiempo: 1 sesión cada una.**

### 2A — Integridad de los datos en producción

```
Auditá la integridad de los datos de TurnoGol en producción con barridos SQL de SOLO
LECTURA. Buscás filas que no deberían poder existir: cada una es un bug que ya ocurrió.

Una consulta por invariante, y reportá el conteo. Arrancá por estos:
  · reservas confirmadas sin pago asociado, y pagos aprobados sin reserva
  · cierres de caja cuyo total no coincide con la suma de sus movimientos
  · complejos en un estado que la máquina de estados no permite alcanzar
  · abonados activos cuyo complejo está dado de baja
  · reservas cuyo starts_at no concuerda con date + time_start bajo el día operativo
    del complejo (ojo con closes_next_day)
  · montos negativos o cero donde el dominio no los admite
  · filas huérfanas en las tablas que el borrado por retención NO cascadea

Reglas: SOLO SELECT. Montos en centavos, enteros. Los timestamps son UTC — no derives
el día con toISOString(), da el día siguiente entre las 21:00 y medianoche ART.

Entregable: por invariante, la consulta, el conteo y 3 ejemplos anonimizados si hay
filas. Ordenado por cuánta plata toca.
```

### 2B — Conciliación contra MercadoPago

```
Auditá si cada peso que entró a MercadoPago aparece en la caja de TurnoGol, y al revés.
Solo lectura, contra producción y contra la API de MercadoPago.

OJO, auditá primero al auditor: existe reconcile-accounting-drift.worker.ts que dice
medir esta deriva, pero la campaña de tests demostró que sus contadores se incrementan
aunque no haya pasado nada. No confíes en su salida sin verificar la lógica primero.

Recordá que son DOS aplicaciones de MercadoPago: Suscripciones (el plan SaaS, token
master del env) y Checkout Pro (OAuth por complejo, las señas). Son circuitos de plata
distintos y se concilian por separado.

Entregable: por complejo, pagos en MercadoPago sin contrapartida en cash_flows y
viceversa, con el monto de la diferencia.
```

---

## FASE 3 — ¿Me entero cuando falla? · lo que nunca sabrías

**Por qué después y no antes:** no encuentra bugs de hoy, encuentra bugs que vas a
tener y no vas a ver. Vale mucho, pero menos que la plata y el aislamiento.

**Cuándo:** la parte de leer código se puede **correr en paralelo desde ya** — es la
mejor candidata para abrir una segunda sesión. Provocar fallas reales en producción, no.

**Tiempo: 1 sesión la de catch mudo, 1-2 la de observabilidad.**

### 3A — Qué se rompe en silencio (catch mudo)

```
Auditá los modos de falla silenciosa de TurnoGol. La pregunta de cada hallazgo es:
"si esto falla en producción, ¿alguien se entera?".

Barré TODOS los bloques catch de src/ y clasificá cada uno:
  MUDO      — se traga el error sin log, sin alerta y sin propagarlo
  RUIDOSO   — loguea con logger.warn, que NO llega a Sentry (solo logger.error sí:
              verificalo con `grep -n "level !== 'error'" src/shared/lib/logger.ts`)
  CORRECTO  — alerta o propaga

Priorizá por lo que envuelve, no por cantidad: un catch mudo alrededor de una escritura
de plata vale más que veinte en código de presentación.

Buscá además estas tres clases, ya confirmadas en la campaña de tests:
  1. contadores que se incrementan aunque no haya pasado nada y después se loguean
     como métrica de negocio
  2. mensajes al usuario que afirman más de lo que el dato prueba
  3. literales viejos desincronizados de su constante

Entregable: tabla archivo:línea · clase · qué envuelve · severidad. Sin proponer fixes.
```

### 3B — Observabilidad: la alerta que nunca se disparó

```
Auditá si TurnoGol avisa cuando algo se rompe. Antecedentes reales, todos confirmados:
el worker se cayó 26 minutos y nadie avisó, Sentry del servidor estaba muerto en
producción porque register() no corre en Vercel, y logger.warn parece alertar pero es
mudo.

El experimento es incómodo y es el único que vale: PROVOCÁ la falla y medí si llega la
alerta. Una alerta que nunca se disparó no es una alerta, es un comentario.

Por cada falla crítica —worker caído, base inalcanzable, MercadoPago caído, Resend
caído, Upstash caído, cola de pg-boss agotando reintentos— respondé tres cosas:
  ¿existe la alerta? · ¿alguien la recibe? · ¿se disparó alguna vez de verdad?

Entregable: tabla falla × las tres respuestas. Todo lo que no tenga las tres en sí es
un punto ciego.
```

---

## FASE 4 — Los ~400 huecos de test · como regla, NO como proyecto

**Esto no es un bug, es refuerzo.** El código anda; lo que falta es la alarma. Atacarlos
como proyecto son semanas y compite con conseguir tu primer cliente.

**La forma correcta:** cada vez que toques un módulo, mirás qué huecos tiene en
`docs/qa/TEST_AUDIT.md` y escribís **esos**. El refuerzo llega junto con trabajo que ya
ibas a hacer.

**La excepción, que sí vale hacer ahora:** los 5 huecos del núcleo de seguridad —
complejo suspendido que vuelve a escribir, TTL de impersonación de 1 h a 24 h, rol de
empleado buscado contra el complejo equivocado. Son pocos y protegen lo mismo que la
Fase 1. **Media sesión.**

---

## EXTRAS · lo que no está en las fases y vale la pena

Ordenados por valor real, no por cuánto suenan.

**E1 — Ensayo de restauración del backup.** El más subestimado. Está documentado que
PITR no está contratado y que la pérdida máxima de datos es de 24 horas, pero **nunca se
restauró un backup de verdad**. Un backup sin ensayo de restauración es una creencia,
no un respaldo. Restaurá a un proyecto nuevo, medí cuánto tarda y verificá que los
datos estén completos. **1 sesión, y es de las que más tranquilo te dejan.**

**E2 — Agotamiento de recursos.** El pool de conexiones a la base es de **3**, y esa
cifra apareció como problema en tres hallazgos independientes de esta campaña: rutas
que retienen una conexión durante un viaje de red a Upstash o a MercadoPago sin tocar
la base en ningún momento. Con un complejo no se nota; con veinte, sí. Auditá qué
retiene conexiones y por cuánto. **1 sesión.**

**E3 — Los caminos críticos que ni coverage ni mutación alcanzan.** Playwright queda
afuera de todo lo que medimos: hay 102 specs y CI solo corre los marcados como
críticos, que son 23 en 14 archivos. Acá la lectura SÍ es la herramienta correcta,
porque no hay forma barata de medirlo. La pregunta: ¿los caminos por los que entra
plata están entre esos 23? **Media sesión.**

**E4 — Privacidad y derechos ARCO (Ley 25.326).** Ya apareció que la exportación de
datos del jugador omite el motivo y la fecha de un ban, que son justo los datos que un
usuario baneado necesita para entender su situación. Auditá que el export sea completo
y que el borrado por retención no deje filas huérfanas. Se cruza con 2A. **1 sesión.**

**E5 — Dependencias y cadena de suministro.** Lo menciono para que sepas que existe y
para decirte que **no lo hagas ahora**: ruido alto, valor bajo en esta etapa.

---

## Resumen: el orden, de una

| # | Qué | Cuándo | Tiempo | ¿Paralelo? |
|---|---|---|---|---|
| **0** | Arreglar los 8 bugs ya encontrados | **primero, ya** | 1-2 sesiones | — |
| **1** | Aislamiento entre complejos (RLS) | al cerrar la campaña de tests | 1-2 sesiones | **NO** (usa la base local) |
| **2A** | Integridad de datos en producción | cuando quieras | 1 sesión | sí |
| **2B** | Conciliación contra MercadoPago | cuando quieras | 1 sesión | sí |
| **3A** | Catch mudo | **ya, en paralelo** | 1 sesión | **sí — la mejor candidata** |
| **3B** | Observabilidad | después de 3A | 1-2 sesiones | parcial |
| **4** | Huecos de test del núcleo de seguridad | con la Fase 1 | ½ sesión | sí |
| **E1** | Ensayo de restauración | antes del primer cliente | 1 sesión | sí |
| **E2** | Agotamiento de recursos | antes del cliente 10 | 1 sesión | sí |
| **E3** | Caminos críticos en Playwright | con la Fase 0 | ½ sesión | sí |
| **E4** | Privacidad y ARCO | con 2A | 1 sesión | sí |

**Total: 10 a 14 sesiones.** No entran todas antes del 1 de noviembre si además querés
vender, y no hace falta que entren.

## Si tuvieras que elegir sólo tres

**Fase 0** (arreglar lo encontrado), **Fase 1** (aislamiento) y **E1** (ensayo de
restauración). Con esas tres podés mirar a un cliente a la cara: los bugs conocidos
están cerrados, nadie ve la plata de otro, y si algo explota sabés que podés volver.

Todo lo demás mejora el sistema. Esas tres son las que te dejan **vender**.

## El límite que manda sobre todo esto

No es técnico: es el **límite de sesión**, que hoy se agotó tres veces. Dos sesiones
pesadas en paralelo lo queman al doble y se frenan las dos. Abrí **una sola** en
paralelo, y que sea 3A.
