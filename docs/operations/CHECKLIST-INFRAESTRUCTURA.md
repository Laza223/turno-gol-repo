# Checklist de infraestructura — qué pagar y cómo dejarlo andando

> **Para quién es esto:** para vos, dueño de TurnoGol, sin conocimiento de infraestructura.
> Cada paso dice **dónde hacer clic**, no solo qué hacer.
>
> Complementa a [`MANUAL-DUENO.md`](./MANUAL-DUENO.md), que explica *qué es* cada servicio.
> Este archivo es la versión **accionable**: lo abrís, hacés los pasos, tachás.
>
> Verificado el **2026-07-27** contra los dashboards y contra producción.

---

## Resumen: qué vas a pagar y para qué

| # | Servicio | Plan | US$/mes | En una línea: qué comprás |
|---|---|---|---|---|
| 1 | **Supabase** | Pro | **25** | Que si se rompe la base, exista una copia para recuperarla |
| 2 | **Vercel** | Pro | **20** | El derecho legal a cobrarle a clientes con tu web |
| 3 | **Railway** | Hobby | **5** + uso | Que los pagos se confirmen solos las 24 horas |
| | | | **≈ US$50** | |

**Gratis y ya andando** (no toques nada): MercadoPago, Resend, Cloudflare R2, Upstash, Sentry.

Con **un solo complejo** en el plan Predio ($55.000 ARS/mes) pagás toda la infraestructura de un año.

---

## Estado real (verificado 2026-07-27, 12:53 ART)

| Servicio | Cómo está | Nota |
|---|---|---|
| Supabase | ✅ plan **`pro`**, org *"turnogol production"* | Backups diarios activos. Confirmado contra la API |
| Secrets de GitHub | ✅ **los 3 cargados** | `ACCESS_TOKEN`, `DB_PASSWORD`, `PROJECT_ID`. Pipeline **sin correr todavía** |
| Usuario de la base | ✅ **`turnogol_app` en web y cola de trabajos** | Ver abajo — era peor de lo reportado |
| Vercel | ❓ sin verificar | La API no expone el plan; confirmalo en el dashboard |
| Railway | ❓ sin verificar | Sin acceso por API. El worker está sano: 59 trabajos / 15 min, 0 fallados |

---

## ⚠️ Corrección importante — el usuario de la base era peor de lo reportado

La versión original de este checklist decía que solo el **worker de Railway** entraba a la base
como `postgres`. **Falso.** `.env.production` probó que **Vercel también lo hacía desde siempre**.
No era una pieza, era toda la plataforma.

`postgres` tiene el atributo `rolbypassrls`: **saltea las 97 reglas de aislamiento entre
complejos**, y ni el modo estricto (`FORCE ROW LEVEL SECURITY`, activo en las 30 tablas) lo
frena. Sin daño real porque la base estaba vacía, pero era un lanzamiento sin la última barrera.

**Resuelto el 2026-07-27.** Se le puso contraseña a `turnogol_app` (nunca había tenido en
producción) y se cambió `DATABASE_URL` en Vercel y en Railway. Verificado en `pg_stat_activity`:
la web y la cola de trabajos entran como `turnogol_app` (`rolbypassrls = false`), y los workers
de negocio siguen como `turnogol_worker`, que **es lo correcto** — barren datos de todos los
complejos por diseño. Efecto colateral medido: la base pasó de 779 ms a **117 ms**.

### El gotcha que costó un deploy

Después de un `ALTER ROLE ... PASSWORD`, el pooler de Supabase (Supavisor) **sigue sirviendo la
credencial vieja unos minutos**. Todo falla con `28P01 password authentication failed` aunque la
contraseña esté perfecta:

```
15:23:35 UTC   ALTER ROLE turnogol_app WITH PASSWORD '...'
15:28:25 UTC   build de Vercel MUERTO: 28P01
15:35:42 UTC   mismo commit, mismo valor, redeploy → VERDE
```

**Si ves `28P01` justo después de cambiar una contraseña: no busques el error, esperá 10 minutos
y reintentá.** Para distinguir: si el mensaje **nombra el usuario nuevo**, la variable llegó bien
y solo se rechazó la credencial; si nombrara el viejo, el redeploy no tomó la variable.

---

# Los 5 pasos

## ✅ Paso 1 — Los 3 secrets de GitHub — HECHO 2026-07-27

**Gratis. 5 minutos. Hacelo primero.**

**Para qué sirve:** cuando cambiás la estructura de la base (agregar una tabla, una columna),
eso se escribe en un archivo llamado *migración*. Hasta ahora esas migraciones **había que
aplicarlas a mano a producción** y ya se olvidaron tres veces — una dejó la Caja rota 10 horas.
Ahora hay un robot que las aplica solo al mergear, pero necesita estas 3 llaves para entrar.

### Pasos

1. Abrí `https://github.com/Laza223/turno-gol-repo/settings/secrets/actions`
2. Botón verde **New repository secret**. Vas a hacer esto **3 veces**.

**Secreto 1 — `SUPABASE_PROJECT_ID`**
- Name: `SUPABASE_PROJECT_ID`
- Secret: `dpzicetvrgqlwfrqlaek`
- *Add secret*

**Secreto 2 — `SUPABASE_ACCESS_TOKEN`**
- En otra pestaña: `https://supabase.com/dashboard/account/tokens`
- *Generate new token* → nombre: `github-actions-turnogol` → *Generate*
- **Copialo apenas aparece. Solo se muestra una vez.**
- Volvé a GitHub → Name: `SUPABASE_ACCESS_TOKEN` → pegá → *Add secret*

**Secreto 3 — `SUPABASE_DB_PASSWORD`**
- Es la contraseña de tu base. Si la tenés guardada, usala.
- Si no: Supabase → Project Settings → Database → *Reset database password*
- ⚠️ **Resetearla rompe las conexiones de Vercel y Railway** — habría que actualizarles la
  `DATABASE_URL` después. Si podés encontrarla sin resetear, mejor.
- Name: `SUPABASE_DB_PASSWORD` → pegá → *Add secret*

### Cómo saber que salió bien
GitHub → pestaña **Actions** → *DB Migrate (producción)* → **Run workflow**.
Como producción ya está al día, tiene que terminar en verde diciendo que no hay nada pendiente.
**No toca la base** — es una prueba sin riesgo de que las 3 llaves funcionan.

---

## ✅ Paso 2 — Supabase Pro (US$25/mes) — HECHO 2026-07-27

**Para qué pagás esto:** Supabase es **la base de datos**. Ahí vive absolutamente todo:
complejos, canchas, reservas, pagos, caja, jugadores, contraseñas. Si Supabase muere,
TurnoGol muere entero.

Estabas en el plan gratis, que tiene **dos problemas serios**:
- **No hace backups.** Un borrado accidental o una corrupción = perdiste todo, sin vuelta.
- **Pausa el proyecto por inactividad.** Ya te pasó una vez: la web dejó de andar sola.

Los US$25 compran: **backup automático todos los días** (se guardan 7), que no se pause nunca,
8 GB de base y soporte por email.

### Pasos

1. Abrí `https://supabase.com/dashboard/org/xedcnyvqdtnaggcibhsj/billing`
2. Verificá arriba que la organización diga **"turnogol production"**.
   ⚠️ Tenés **4 organizaciones** con proyectos viejos pausados. Supabase cobra **por
   organización**, no por proyecto: si pagás en la equivocada, pagaste por nada.
3. *Upgrade to Pro* → cargá la tarjeta → confirmá.

### Cómo saber que salió bien
✅ **Verificado 2026-07-27**: la org *"turnogol production"* (`xedcnyvqdtnaggcibhsj`) devuelve
`plan: "pro"`. Pendiente menor: a las 24 h, Supabase → Database → Backups → que aparezca el
primero.

---

## ❓ Paso 3 — Vercel Pro (US$20/mes) — sin verificar

**Para qué pagás esto:** Vercel es **la web**. Cuando alguien entra a `turnogol.app`, Vercel
arma la página y se la manda.

El motivo de pagar acá **no es técnico, es legal**: el plan Hobby es para proyectos personales
y sus términos **prohíben el uso comercial**. TurnoGol le cobra suscripciones a complejos.
Vercel puede dar de baja una cuenta Hobby con actividad comercial, y **tu web se apaga sin aviso**.

Los US$20 compran: el derecho a facturar, más ancho de banda, y analytics de visitas.

### Pasos

1. Abrí `https://vercel.com/lazaros-projects-345d2270/~/settings/billing`
2. *Upgrade to Pro* → tarjeta → confirmá.

### Cómo saber que salió bien
El cartel de "Hobby" al lado del nombre de tu cuenta cambia a "Pro".

---

## ❓ Paso 4 — Railway (US$5/mes + uso) — sin verificar

**Para qué pagás esto** — este es el que más cuesta entender, así que va largo:

Vercel **se apaga entre visita y visita**. Se prende cuando alguien entra, arma la página, y se
apaga. No puede hacer nada por su cuenta.

Pero TurnoGol necesita cosas que pasan **sin que nadie esté mirando**:

| Tarea | Qué pasa si no corre |
|---|---|
| Escuchar el aviso de pago de MercadoPago | **El jugador paga y su reserva nunca se confirma** |
| Liberar reservas sin pagar a los 6 minutos | Canchas trabadas por gente que nunca pagó |
| Refrescar el permiso de cobro de MercadoPago | A las ~6 horas el complejo no puede cobrar más señas |
| Mandar los mails | No sale ninguna confirmación ni ningún magic link |
| Generar los turnos de los abonados | El abonado no tiene su turno fijo |
| Cobrarte a vos la suscripción del complejo | Se rompe tu propia facturación |

Railway es una computadora chica **prendida 24/7** haciendo esas 14 tareas.

**Es la pieza más crítica y la más invisible.** Si Railway se cae, la web sigue andando y
*parece* que está todo bien — pero por atrás no se confirma un solo pago. Ese es exactamente
el escenario donde perdés clientes sin enterarte.

### Pasos

1. Abrí `https://railway.app/` → entrá a tu proyecto del worker.
2. Arriba a la derecha, tu avatar → **Account Settings** → **Usage** o **Billing**.
3. Si dice **Trial** o **Limited**, pasá a **Hobby (US$5/mes)**.
   Si ya dice Hobby o Pro, **no pagues nada** — ya está.

Los US$5 incluyen US$5 de consumo. Con un worker chico como el tuyo, no lo llenás.

### Cómo saber que salió bien
El servicio dice **Active** (no "Crashed" ni "Sleeping"), y el plan no dice "Trial".

---

## ✅ Paso 5 — Arreglar el usuario de la base — HECHO 2026-07-27

**Qué pasaba:** la web **y** la cola de trabajos entraban a la base como `postgres`, el dueño de
todo — con el atributo `rolbypassrls`, que **saltea las 97 reglas de aislamiento entre
complejos**. Ni el modo estricto (`FORCE ROW LEVEL SECURITY`) lo frena. Ver la corrección al
principio de este archivo: el diagnóstico original decía "solo el worker" y era falso.

**Qué se hizo** (2026-07-27):

1. `ALTER ROLE turnogol_app WITH PASSWORD '...'` desde el SQL Editor de Supabase — el rol
   **nunca había tenido contraseña en producción** (la migración 037 lo deja anotado:
   *"se hace A MANO fuera de"*).
2. `DATABASE_URL` en Vercel y en Railway: usuario `postgres.<ref>` → `turnogol_app.<ref>`,
   dejando host y puerto **sin tocar**. El sufijo `.<project-ref>` después del usuario es lo que
   le dice al pooler a qué proyecto entrar; sin él no conecta.
3. Redeploy en Vercel y restart del servicio en Railway (editar la variable **no alcanza**: el
   proceso lee el valor al arrancar).

⚠️ `WORKER_DATABASE_URL` **no se tocó**. Usa `turnogol_worker`, que sí saltea el aislamiento —
y **es correcto**: esos workers barren datos de todos los complejos por diseño.

### Estado verificado en `pg_stat_activity`

| Quién | Usuario | ¿Saltea el aislamiento? |
|---|---|---|
| La web (Vercel) | `turnogol_app` | **No** ✅ |
| La cola de trabajos (Railway) | `turnogol_app` | **No** ✅ |
| Los workers de negocio | `turnogol_worker` | Sí — correcto por diseño |

Worker sano tras el cambio: 59 trabajos completados en 15 minutos, 0 fallados. La base pasó de
responder en 779 ms a **117 ms**.

**Nunca pegues una cadena de conexión en un chat** — lleva la contraseña adentro.
---

# Lo que NO tenés que pagar todavía

## PITR — US$100/mes extra. **No lo compres hoy.**

**Qué es:** con el backup normal de Pro, si algo explota volvés **a la copia de anoche**. Todo
lo que pasó durante el día se pierde.

PITR (*Point In Time Recovery*) guarda un registro continuo de todo lo que cambia. Con PITR
volvés **a cualquier minuto** — por ejemplo, a las 22:58, justo antes del desastre de las 23:00.

**La diferencia concreta:** un desastre a las 23:00 de un sábado.
- Con backup diario: perdés **todas las reservas y cobros del sábado**.
- Con PITR: perdés **2 minutos**.

**Por qué no ahora:** tu base está **vacía**. 0 complejos, 0 reservas, 0 pagos. Hoy un desastre
no te hace perder nada, porque no hay nada. Pagar US$1.200 al año para proteger una base vacía
es tirar plata.

**Cuándo sí:** **a los 5 complejos activos.** Ahí un sábado perdido ya es plata de verdad y
clientes enojados. Anotalo como recordatorio.

## Proyecto de staging — US$25/mes extra. Tampoco.

Una copia de producción para probar sin miedo. Útil, no urgente con 0 clientes. Hoy probás
contra tu máquina y alcanza.

---

# Resumen para tachar

```
✅ 1. Los 3 secrets de GitHub          gratis      HECHO 2026-07-27
✅ 2. Supabase Pro                     US$25/mes   HECHO — org en plan `pro`
❓ 3. Vercel Pro                       US$20/mes   sin verificar
❓ 4. Railway plan Hobby               US$5/mes    sin verificar
✅ 5. Usuario de la base               gratis      HECHO — web Y cola de trabajos

☐ Probar el pipeline de migraciones end-to-end (Actions → DB Migrate → Run workflow)
☐ (a los 5 complejos) PITR            US$100/mes
```

**Lo único que queda con acción pendiente**: confirmar los planes de Vercel y Railway (no se
pueden ver por API), y correr el pipeline de migraciones una vez a mano para probarlo de punta a
punta. Producción ya está al día, así que esa corrida no aplica nada: solo valida las llaves.

---

# Preguntas que te vas a hacer

**¿Puedo arrancar sin pagar nada?**
Técnicamente sí, y de hecho la web ya está viva. Pero estarías operando un negocio real sin
backups y contra los términos de servicio de Vercel. El primer cliente que confíe su agenda a
TurnoGol merece que exista una copia de sus datos.

**¿Y si un mes no me alcanza?**
El orden de importancia es: **Supabase > Railway > Vercel**. Sin Supabase no hay nada. Sin
Railway los pagos no se confirman. Vercel es el único donde el riesgo es legal y no técnico.

**¿Esto sube cuando tenga clientes?**
Poco. Los US$50 aguantan tranquilos hasta unos 20-30 complejos. Lo primero en subir sería el
consumo de Railway, y de a centavos.

**¿Tengo que hacer algo cada mes?**
La rutina está en [`MANUAL-DUENO.md`](./MANUAL-DUENO.md) §4. Corta: 2 minutos por día (¿carga la
web? ¿hay errores en Sentry?), 10 por semana, 30 por mes.
