# Manual del dueño — TurnoGol

> Para vos, Lazar. Panorama completo de la infraestructura: qué es cada pieza, para qué pagás cada cosa, qué se rompe si falla, y la rutina para manejar todo esto solo.
>
> **Escrito 2026-07-26.** Los precios son los vigentes a esa fecha en USD y **cambian**: confirmá en la web de cada servicio antes de pagar.
>
> 👉 **¿Buscás el paso a paso de qué pagar y dónde hacer clic?** Está en
> [`CHECKLIST-INFRAESTRUCTURA.md`](./CHECKLIST-INFRAESTRUCTURA.md). Este archivo explica *qué es*
> cada cosa; ese otro te dice *qué hacer*, con las URLs y en orden.

---

## 1. Las cinco piezas, en castellano

TurnoGol no es "una web". Son cinco cosas separadas que se hablan entre sí. Si entendés esto, entendés todo el resto.

```
    JUGADOR / ENCARGADO
            │
            ▼
    ┌────────────────┐        ┌─────────────────────────┐
    │   VERCEL       │◄──────►│  SUPABASE               │
    │   la web       │        │  la base de datos       │
    │ (turnogol.app) │        │  (+ login + tiempo real)│
    └────────────────┘        └───────────┬─────────────┘
                                          │
                              ┌───────────▼─────────────┐
                              │  RAILWAY                │
                              │  el empleado que        │
                              │  nunca duerme           │
                              └─────────────────────────┘

    Y los servicios de apoyo:
    MERCADOPAGO (cobra)   RESEND (manda mails)   CLOUDFLARE R2 (guarda fotos)
    UPSTASH (portero)     SENTRY (alarma)
```

### Vercel — la web
Donde vive `turnogol.app`. Cuando alguien entra, Vercel arma la página y la manda. **Es efímera**: se prende para atender un pedido y se apaga. No puede recordar nada ni hacer tareas de fondo.

### Supabase — la base de datos
El corazón. Guarda **todo**: complejos, canchas, reservas, pagos, caja, jugadores. También maneja el login (magic link del jugador, contraseña del encargado) y el "tiempo real" de la grilla (cuando entra una reserva, la grilla del admin se actualiza sola).

**Si Supabase muere, TurnoGol entero muere.** No hay copia. Por eso los backups no son opcionales.

### Railway — el empleado que nunca duerme
Vercel se apaga entre pedido y pedido, así que hay cosas que no puede hacer. Railway corre un programa **prendido 24/7** que hace 14 tareas de fondo:

| Tarea | Qué pasa si no corre |
|---|---|
| Procesar el aviso de pago de MercadoPago | **El jugador paga y la reserva nunca se confirma** |
| Liberar reservas sin pagar (6 min) | Canchas trabadas por gente que nunca pagó |
| Refrescar el permiso de cobro de MP | A las ~6 horas el complejo no puede cobrar más señas |
| Mandar los mails | No sale ninguna confirmación ni magic link |
| Generar los turnos de los abonados | El abonado no tiene su turno fijo |
| Cobrar la suscripción y reintentar | Se rompe tu propio cobro del SaaS |
| Reconciliar pagos y contabilidad | Pagos en el limbo, plata sin cuadrar |

Es **la pieza más crítica y la menos visible**. Si Railway se cae, la web sigue andando (parece que todo está bien) pero por atrás no se confirma ni un pago.

### Los de apoyo
- **MercadoPago** — cobra las señas de los jugadores (una cuenta por complejo, conectada por OAuth) y te cobra a vos la suscripción de los complejos (tu cuenta master).
- **Resend** — manda los mails. Si se cae, se guardan en cola y salen cuando vuelve. **No es urgente.**
- **Cloudflare R2** — guarda las fotos de canchas y logos.
- **Upstash** — el portero: frena a quien intente adivinar contraseñas a fuerza bruta, y cachea la disponibilidad para no golpear la base.
- **Sentry** — la alarma: te avisa cuando algo explota, con el detalle del error.

---

## 2. Qué pagar, cuánto y por qué

### Estado real (verificado 2026-07-26)

| Servicio | Plan actual | Problema |
|---|---|---|
| **Supabase** | 🔴 **FREE** | **Sin backups.** Y el free tier pausa el proyecto por inactividad (ya te pasó una vez) |
| **Vercel** | 🟡 Hobby (personal) | El plan Hobby **prohíbe uso comercial** en sus términos. TurnoGol cobra suscripciones |
| **Railway** | 🟢 Andando | El worker corre. Verificado: 8 conexiones activas |
| **El resto** | 🟢 Free tier | Alcanza de sobra para arrancar |

### La cuenta

| Servicio | Plan | Precio/mes | Qué comprás concretamente |
|---|---|---|---|
| **Supabase Pro** | Pro | **US$25** | Backups diarios (7 días), no se pausa nunca, 8 GB de base, soporte por email |
| **Vercel Pro** | Pro | **US$20** | Derecho a uso comercial, más ancho de banda, analytics |
| **Railway** | Hobby | **US$5** + uso | Que el worker no se apague nunca |
| Upstash | Free | **US$0** | 10.000 comandos/día — te sobra por años |
| Resend | Free | **US$0** | 3.000 mails/mes — con 10 complejos no lo llenás |
| Cloudflare R2 | Free | **US$0** | 10 GB de fotos |
| Sentry | Free | **US$0** | 5.000 errores/mes |
| MercadoPago | — | **US$0 fijo** | Cobra comisión por transacción, no abono |
| | | **≈ US$50/mes** | |

**Opcional, para cuando tengas plata entrando:**

| Extra | Precio/mes | Cuándo vale la pena |
|---|---|---|
| **PITR** (Supabase) | +US$100 | Restaura la base a *cualquier minuto*, no solo al backup de la noche. Con backup diario, un desastre a las 23:00 te hace perder el día entero de reservas. Con PITR, perdés 2 minutos |
| Proyecto de staging | +US$25 | Una copia de producción para probar sin miedo. Hoy probás contra tu máquina |

### La recomendación

**Pagar hoy: Supabase Pro + Vercel Pro + Railway ≈ US$50/mes.**

Con **1 solo complejo** en el plan Predio ($55.000 ARS/mes) ya cubrís toda la infraestructura del año.

**PITR (+US$100) todavía no.** El dato duro: **la base está vacía** — 0 complejos, 0 reservas, 0 pagos. Hoy no hay nada que restaurar. El backup diario de Pro alcanza hasta que tengas complejos facturando. **A los 5 complejos activos, activá PITR** — ahí un día perdido de reservas sí es plata y bronca de clientes.

Lo mismo con staging: útil, no urgente con 0 clientes.

---

## 3. Qué tenés que tocar vos

### 3.1 ✅ El usuario de la base — RESUELTO 2026-07-27

> **Ya está hecho.** Se deja escrito porque el diagnóstico original estaba **mal** y la
> corrección importa para la próxima vez.

**Lo que decía este manual y era falso:** que solo el worker de Railway entraba como `postgres`
y que *"la `DATABASE_URL` de la web ya usa `turnogol_app`"*. Mentira. `.env.production` probó que
**Vercel también entraba como `postgres` desde siempre**. El problema era el doble de grande que
lo reportado en la fase D5: no era el worker, era toda la plataforma.

**Por qué importaba:** `postgres` tiene el atributo `rolbypassrls`, que **saltea las 97 reglas de
aislamiento entre complejos** — ni siquiera el modo estricto (`FORCE ROW LEVEL SECURITY`, activo
en las 30 tablas) lo frena. Con la web corriendo así, lo único que separaba los datos de un
complejo de otro era que el código pidiera bien las cosas. Sin daño real: la base estaba vacía.

**Qué se hizo:** se le puso contraseña a `turnogol_app` (nunca había tenido una en producción —
la migración 037 lo deja anotado: *"se hace A MANO fuera de"*), y se cambió `DATABASE_URL` en
Vercel **y** en Railway.

**Estado verificado en producción (12:53 ART):**

| Quién | Usuario | ¿Saltea el aislamiento? |
|---|---|---|
| La web (Vercel) | `turnogol_app` | **No** ✅ |
| La cola de trabajos (Railway) | `turnogol_app` | **No** ✅ |
| Los workers de negocio (`WORKER_DATABASE_URL`) | `turnogol_worker` | Sí — **es correcto**, barre datos de todos los complejos por diseño |

Worker sano: 59 trabajos completados en 15 minutos, 0 fallados. La base pasó de responder en
779 ms a **117 ms**.

**⚠️ El gotcha que costó un deploy fallido.** Después de un `ALTER ROLE ... PASSWORD`, el pooler
de Supabase (Supavisor) **sigue sirviendo la credencial vieja durante varios minutos**. Toda
conexión falla con `28P01 password authentication failed` aunque la contraseña esté perfecta.
Pasó exactamente eso: contraseña puesta 15:23:35 UTC, build de Vercel muerto 15:28:25, **mismo
commit y mismo valor a las 15:35 → verde**.

**Si ves `28P01` justo después de cambiar una contraseña: no busques el error. Esperá 10 minutos
y reintentá.** Si el mensaje nombra el usuario nuevo, la variable llegó bien y solo se rechazó la
credencial; si nombrara el usuario viejo, el problema sería que el redeploy no tomó la variable.

**Cómo re-verificarlo cuando quieras**: pedímelo — miro `pg_stat_activity` y te digo con qué
usuario entra cada pieza. También lo caza `pnpm launch:check`.

**Nunca mandes una contraseña por chat.** Si te trabás, te guío campo por campo sin verla.

### 3.2 Los dos upgrades de plan

Supabase Pro y Vercel Pro se activan con la tarjeta desde el dashboard de cada uno. No hay nada que configurar después: los dos siguen andando igual, solo cambian los límites y aparecen los backups.

**Nada más.** El resto de la infraestructura no necesita que toques nada.

---

## 4. Tu rutina, como solopreneur

### Todos los días (2 minutos)
1. Abrí `turnogol.app` — ¿carga?
2. Mirá Sentry. ¿Hay errores nuevos? Si hay, mandámelos.

### Una vez por semana (10 minutos)
1. Railway → ¿el worker sigue "Active"? Si dice "Crashed", reiniciá y avisame.
2. Supabase → Reports → ¿la base crece razonable?
3. Panel super-admin de TurnoGol → tab Actividad → ¿hay avisos de reconciliación?

### Una vez por mes (30 minutos)
1. Revisá las facturas de los servicios (que ninguno se haya disparado).
2. Supabase → Backups → **que exista un backup reciente**.
3. Una vez por trimestre: probá restaurar un backup a un proyecto de prueba. **Un backup que nunca restauraste no es un backup, es una esperanza.**

### Cuando algo se rompe

| Síntoma | Casi seguro es | Qué hacer |
|---|---|---|
| La web no carga | Vercel o Supabase | Revisá el status de ambos servicios |
| La web anda pero los pagos no confirman | **El worker de Railway** | Railway → ¿Active? Reiniciá |
| No llegan mails | Resend | No es urgente: se encolan y salen solos |
| "No se puede cobrar la seña" | Token de MP vencido | El worker lo refresca cada 4 h. Si el worker estaba caído, se arregla solo al volver |
| Todo raro y no sabés qué | — | Captura del error + Sentry, y mandámelo |

### Regla de oro
**Nunca toques la base de datos a mano.** Ni desde el dashboard de Supabase, ni con SQL suelto. Todo cambio de datos pasa por la app o por una migración. Un `UPDATE` sin `WHERE` a las 2 AM es la forma más común de perder una empresa.

---

## 5. Cómo se cambia el código (el ciclo)

```
escribo código → PR → CI corre los tests → mergeo → Vercel deploya solo
                                                          │
                                    ⚠️ SI HAY MIGRACIÓN ───┘
                                    hay que aplicarla A MANO a la base
```

**El punto flojo, y el más importante de este manual:** cuando un cambio incluye una migración (algo que modifica la estructura de la base), el pipeline **NO la aplica a producción**. Vercel sube el código nuevo igual. Resultado: código nuevo hablándole a una base vieja.

**Ya pasó tres veces.** La última se encontró el 2026-07-26: producción estaba 7 migraciones atrás.

Por eso: **cada vez que mergees algo que toque la base, hay que aplicar la migración aparte.** Hoy lo hace Claude cuando se lo pedís. La fase **D7** de la auditoría existe para automatizar esto y que deje de depender de que alguien se acuerde.

### Antes de un lanzamiento importante
```bash
pnpm launch:check
```
Corre 20 verificaciones (variables de entorno, permisos de base, SSL, credenciales de MP, tests, build). Si dice que sí, salís tranquilo.

---

## 6. Los riesgos que aceptaste y conviene recordar

Están en `docs/launch/RISK_REGISTER.md`, firmados por vos. En criollo:

1. **Nunca probaste restaurar un backup.** Con Pro vas a tener backups; probá uno.
2. **No hay botón de pánico global.** Si algo sale muy mal, se apaga complejo por complejo, no todo de una.
3. **Si MercadoPago falla justo al reembolsar**, la cancelación se revierte entera y el jugador cree que canceló. Hay que mirarlo a mano los primeros días.
4. ~~Las fotos de cancha están rotas~~ → **resuelto 2026-07-26**: era un bug de la librería `@aws-sdk/client-s3`, arreglado río arriba (`@aws-sdk/checksums` 3.1000.16). Falta una prueba real de subida desde la UI.

---

## 7. Si te preguntan "¿y esto escala?"

Vercel + Supabase + Railway te aguantan **cientos de complejos** sin tocar nada. El día que no alcance (2+ años, con esa cantidad de clientes ya sos una empresa con equipo), no se reescribe nada: se mete la web en un contenedor y se corre al lado del worker. Mismo código.

**No sobre-construyas hoy.** El único agujero real era dónde corren los workers, y está resuelto.
