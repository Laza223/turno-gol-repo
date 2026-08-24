# Monitor externo de uptime — cómo darlo de alta

> **Estado: dado de alta y verificado el 2026-08-24.** Hay dos monitores activos (`turnogol.app` y `turnogol.app/api/status`), cada 5 minutos, con aviso por mail. La alerta se probó de punta a punta: un monitor contra una ruta inexistente se detectó en 65 segundos y el mail *"Monitor is DOWN"* llegó a la casilla. Lo que sigue es la guía de cómo se hizo — sirve para rehacerlo o para agregar otro monitor.

## Qué es esto, en criollo

Un **monitor de uptime** es un servicio de afuera que le pega a una dirección de tu sitio cada X minutos y, si la respuesta no es la esperada, te manda un mail. Nada más que eso. La gracia es que vive **fuera** de tu infraestructura: si tu servidor se prende fuego, el que avisa no se prende fuego con él.

Por qué hace falta acá: TurnoGol tiene una sonda de salud que corre **adentro** del worker, así que cuando el worker se muere, la sonda se muere con él y nadie se entera. Eso pasó de verdad — el worker estuvo 26 minutos caído en producción y no llegó ningún aviso ([P-12](../qa/P12-worker-caido-2026-08-24.md)).

Ya está resuelta la mitad de código: `https://turnogol.app/api/status` ahora **responde 503 si el worker dejó de latir hace más de 15 minutos**. Falta la otra mitad, que es de consola y no de código: alguien que mire ese 503 y te escriba.

## Qué vas a tener cuando termines

Un mail tuyo cada vez que TurnoGol deje de estar sano, dentro de los ~5 minutos. Cubre tres cosas a la vez, porque `/api/status` las mira todas: que el sitio esté arriba, que la base responda, y que el worker de fondo esté vivo.

**Costo: $0.** El plan gratuito de UptimeRobot da 50 monitores con chequeo cada 5 minutos y no pide tarjeta.

## Paso a paso

### 1 · Crear la cuenta
Entrá a **uptimerobot.com** y tocá **"Register now"** (o "Get started free"). Pide email y contraseña; no pide tarjeta. Confirmá el mail que te llega.

> Usá un mail que mires. El monitor no sirve de nada si avisa a una casilla que abrís una vez por mes.

### 2 · Crear el monitor
Ya adentro, **"+ New monitor"** (el botón puede figurar como "Create monitor" o "Add new monitor" según la versión del panel).

Completá:

| Campo | Valor |
|---|---|
| **Monitor type** | `HTTP(s)` — el tipo por defecto |
| **URL** | `https://turnogol.app/api/status` |
| **Friendly name** | `TurnoGol — salud` |
| **Monitoring interval** | 5 minutos (es el mínimo del plan gratis) |

Todo lo demás va como viene por defecto.

### 3 · Que te avise a vos
En la misma pantalla, en la sección de alertas (**"Alert contacts to notify"** o similar), tildá tu email. Suele venir tildado por defecto, pero conviene mirarlo: es lo único que hace útil a todo esto.

Si querés que además te suene el celular, UptimeRobot tiene app para Android y iPhone: instalás, entrás con la misma cuenta y las alertas te llegan como notificación.

### 4 · Guardar y comprobar que funciona
Guardá. En un par de minutos el monitor tiene que aparecer en **verde / "Up"**.

Para probar que la alerta realmente llega, sin romper nada: creá **un segundo monitor** apuntando a `https://turnogol.app/api/no-existe`. Esa dirección no existe, así que va a dar error y en unos minutos te tiene que llegar el mail de "Monitor is DOWN". Cuando lo recibas, **borrá ese segundo monitor**. Un ensayo de 5 minutos que te ahorra descubrir el día del incidente que el mail nunca estuvo configurado.

## Cuando llegue una alerta, qué hacer

El mail dice que `/api/status` no contestó bien, pero no cuál de las piezas falló — eso es a propósito, porque la dirección es pública y no puede andar contando qué subsistema está caído.

Para ver el detalle:

1. **Mirá el sitio**: entrá a turnogol.app. Si el sitio anda, el problema es del worker o de la base, no del sitio.
2. **Mirá Sentry**: si el que falló es el latido del worker, hay un evento con el texto `worker heartbeat stale`. Desde la máquina de trabajo: `pnpm sentry:issues 24h`.
3. **Mirá Railway**: entrá al servicio `turno-gol-repo`. Si dice *"Service is offline"* o *"There is no active deployment"*, el worker está caído: se levanta con **Redeploy** del último deployment.

Tranquilo con el reloj: un worker caído **retrasa** trabajo, no lo pierde. Los jobs quedan guardados en la base y se procesan solos cuando vuelve — en el ensayo de P-12 se drenaron 26 trabajos acumulados en menos de dos minutos, sin ninguno fallado. Lo que sí duele es que nadie se entere durante horas: mientras tanto no salen mails a los jugadores, no expiran las reservas impagas (quedan slots bloqueados por gente que no pagó) y no corre la conciliación de pagos.

## Detalles finos

- **El monitor no necesita ninguna credencial.** `/api/status` es público a propósito: devuelve el semáforo (200 o 503) sin decir qué pieza falló. El detalle por subsistema exige el header `x-status-token`, y eso queda para vos, no para el monitor.
- **15 minutos de tolerancia, no 5.** El worker late cada 5 minutos y el endpoint aguanta tres latidos perdidos antes de gritar. Es para que un deploy del worker, que lo reinicia, no dispare una falsa alarma.
- **Alternativa equivalente**: Better Stack (ex Better Uptime) tiene plan gratuito con menos monitores pero avisos más ricos. Cualquiera sirve; lo que no sirve es no tener ninguno.
