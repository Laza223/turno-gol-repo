# Checklist de infraestructura — qué pagar y cómo dejarlo andando

> **Para quién es esto:** para vos, dueño de TurnoGol, sin conocimiento de infraestructura.
> Cada paso dice **dónde hacer clic**, no solo qué hacer.
>
> Complementa a [`MANUAL-DUENO.md`](./MANUAL-DUENO.md), que explica *qué es* cada servicio.
> Este archivo es la versión **accionable**: lo abrís, hacés los pasos, tachás.
>
> Verificado el **2026-07-26** contra los dashboards reales.

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

## Estado real hoy (verificado 2026-07-26)

| Servicio | Cómo está | Riesgo |
|---|---|---|
| Supabase | 🔴 plan `free`, org *"turnogol production"* | **Sin backups.** Si la base se corrompe, no hay vuelta atrás |
| Vercel | 🟡 Hobby | Los términos del plan **prohíben uso comercial** |
| Railway | 🟢 Corriendo | Verificar que el plan no sea el trial |
| Secrets de GitHub | 🔴 Sin cargar | Las migraciones no llegan solas a producción |
| Usuario del worker | 🔴 Conecta como dueño de la base | Sin barrera si un bug del worker borra de más |

---

# Los 5 pasos

## ☐ Paso 1 — Los 3 secrets de GitHub

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

## ☐ Paso 2 — Supabase Pro (US$25/mes)

**Para qué pagás esto:** Supabase es **la base de datos**. Ahí vive absolutamente todo:
complejos, canchas, reservas, pagos, caja, jugadores, contraseñas. Si Supabase muere,
TurnoGol muere entero.

Hoy estás en el plan gratis, que tiene **dos problemas serios**:
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
Pedime que lo verifique: consulto el plan de la organización y te confirmo que dice `pro`.
Después, a las 24 horas: Supabase → Database → Backups → tiene que aparecer el primero.

---

## ☐ Paso 3 — Vercel Pro (US$20/mes)

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

## ☐ Paso 4 — Railway (US$5/mes + uso)

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

## ☐ Paso 5 — Arreglar el usuario del worker (gratis, 10 minutos)

**Qué pasa hoy:** el programa de Railway entra a la base **como dueño de todo**. Puede borrar
cualquier tabla y ve los datos de todos los complejos sin ninguna restricción.

Está diseñado para entrar con un usuario limitado (`turnogol_app`), pero la configuración quedó
apuntando al dueño. Verificado: **6 conexiones activas así**.

**No rompe nada hoy.** Es un cinturón desabrochado: solo se nota el día del choque — un bug del
worker que borra de más, sin nada que lo frene.

### Pasos

1. Railway → tu servicio del worker → pestaña **Variables**.
2. Buscá la variable `DATABASE_URL`. Adentro dice `postgres:` como usuario.
3. Abrí Vercel → tu proyecto → Settings → Environment Variables → mirá su `DATABASE_URL`:
   **esa ya usa el usuario correcto** (`turnogol_app`).
4. Copiá la de Vercel a Railway, **pero cambiá el puerto**:
   Vercel usa `:6543`, Railway necesita `:5432`.
5. Guardá. Railway reinicia el worker solo.

**Nunca pegues esa cadena en un chat** — lleva la contraseña adentro. Si te trabás, pedí ayuda
campo por campo sin mostrar el valor.

### Cómo saber que salió bien
Pedime que lo verifique: miro quién está conectado a la base y te digo si el worker entra como
`turnogol_app` o sigue como `postgres`.

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
☐ 1. Los 3 secrets de GitHub          gratis      5 min
☐ 2. Supabase Pro                     US$25/mes   2 min   ← el más importante
☐ 3. Vercel Pro                       US$20/mes   2 min
☐ 4. Railway plan Hobby               US$5/mes    2 min
☐ 5. Usuario del worker en Railway    gratis     10 min

   Total: ≈ US$50/mes  ·  ~25 minutos de trabajo

☐ (a los 5 complejos) PITR            US$100/mes
```

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
