# Prompt 3 — Hoy

> Pegar entero en una conversación nueva del proyecto `turnogol` de claude.ai/design.
> Adjuntar `desktop_admin_dashboard.png` y `mobile_admin_dashboard.png`.
>
> ⚠️ **Antes de usar este prompt hay que regenerar esas dos capturas.** Las que están en
> `.design-sync/handoff/2026-09-11/capturas/` son de antes del rediseño de #300 y todavía muestran
> las tarjetas de plata que sacamos. Con Docker Desktop arriba:
> `pnpm supabase:start`, el servidor de desarrollo, y
> `MSYS_NO_PATHCONV=1 pnpm audit:corpus --solo=/dashboard`.
>
> Hacela **última**: hereda lo que decidas en Grilla y Configuración.

---

## Quiénes usan esto

TurnoGol es un sistema para complejos de fútbol de Argentina. Esto es el **panel del complejo**, no
la app del jugador.

"Hoy" la ve **solo el dueño**. Marcelo tiene 35–60 años y un nivel de tecnología de 2,5 sobre 5:
nunca va a leer un manual y tiene miedo de tocar algo y romper todo. Está en el complejo desde las
9, atiende el mostrador, y vuelve a las 17 para el pico de la noche. Es la primera pantalla que ve
al entrar. El encargado no la ve: rebota a la Grilla.

El panel es una **herramienta de trabajo**: densidad alta, datos primero, decoración después.
Animaciones de hasta 200 ms y solo si cumplen una función. **La belleza acá es la eficiencia.**

## Qué te pido

Rediseñá "Hoy" para que se vea **más moderna, más linda y más clara**, construyendo con los
componentes de este proyecto y respetando sus guías. Tenés libertad total en layout, jerarquía,
agrupación, espaciado, composición, estados vacíos, iconografía y microinteracciones.

No tenés libertad en lo de abajo. La app acaba de pasar una auditoría de coherencia de 130
hallazgos, y el objetivo es que **cada cosa se llame igual en todas las pantallas**.

## La pantalla

Marcelo vuelve al mostrador a las 17 y quiere responder en 5 segundos: **¿qué falta jugar y qué
tengo que resolver?**

Tres bloques, en este orden:

1. **Próximos turnos.** Una fila por cancha en servicio, en el mismo orden en que la Grilla dibuja
   sus columnas. Cada turno muestra la hora ("20:00-21:00"), quién es, "ahora" o "en 25 min" cuando
   arranca dentro de la hora, y su píldora de estado. Una cancha sin turnos dice "Libre el resto del
   día." — eso es un dato, no un vacío: es lo que el dueño usa para ofrecerle el horario a alguien.
   El subtítulo del bloque es la ocupación del día: "9 de 12 · 75% de ocupación".
2. **Necesita tu atención.** Cuatro alertas posibles, cada una con su botón al lado: turno terminado
   sin cobrar ("Cobrar $ 16.000"), devoluciones pendientes ("Gestionar"), seña rechazada ("Ver
   reserva"), caja de ayer sin cerrar ("Cerrar caja de ayer"). Cuando está vacío, el texto es exacto
   y no se toca: **"Nada pendiente. Todo cobrado y cerrado."** Ese vacío es el premio del día.
3. **Mientras no estabas.** El registro de lo que pasó sin él: reserva por internet, cancelación,
   seña acreditada. Lo más reciente primero. Es el momento en que el sistema vendió solo.

Arriba de todo, mientras falte configurar algo, una lista de pasos iniciales que se puede descartar.

**Qué está mal hoy.** Se ve como tres tarjetas apiladas iguales. No hay jerarquía entre "lo que
viene" y "lo que tengo que resolver". En el teléfono, la lista de configuración inicial se come toda
la primera pantalla.

**Vacíos a diseñar:** día cerrado ("Hoy el complejo está cerrado."), ninguna cancha en servicio, y
"No queda nada por jugar hoy.".

## Lo que NO puede aparecer

Esto es lo más importante del prompt, porque es lo que acabamos de sacar:

- **Ninguna cifra de plata.** Lo cobrado y lo que te deben viven en Caja, que es donde se cobra.
  Hasta ayer esta pantalla repetía las tarjetas "Cobrado hoy" y "Deudas" con el mismo componente y
  el mismo dato que Caja muestra un clic más allá. Se sacaron a propósito. No las traigas de vuelta
  en ninguna forma.
- **Ningún gráfico.** Un gráfico es una herramienta de análisis; esto es un parte de situación. El
  análisis vive en Métricas.
- **Ningún botón de hacer.** Nada de "venta rápida" ni de accesos directos para reservar. Se decidió
  que no. Reservar vive en la Grilla, vender vive en Caja. La única acción visible es la que pide
  cada alerta, más el enlace de cada turno a su detalle.

## Vocabulario cerrado

Un término por estado, en toda la app. Estas son las palabras, no sinónimos:

| Cosa                      | Se dice                                                                                             | Nunca                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Los 9 estados de un turno | Esperando seña · Confirmada · Señada · Jugada · Sin cobrar · Ausente · Abonado · Torneo · Bloqueado | Pagando ahora, Pendiente, Reservado, No-show |
| Plata que debés devolver  | **Devolvés**                                                                                        | Reembolsos                                   |
| La seña                   | seña                                                                                                | anticipo, depósito                           |
| Quien reserva             | jugador si tiene cuenta, invitado si no                                                             | cliente, usuario                             |
| Turno fijo semanal        | abonado                                                                                             | suscripción                                  |
| Acciones                  | verbo primero y en voseo: "Cobrar $ 16.000", "Cerrar caja de ayer", "Ver reserva"                   | "Click aquí", "Ir a"                         |

Plata siempre `$ 16.000`, con espacio y punto de miles. Fechas en castellano, formato medio:
"mié 2 de julio". Nada de formato ISO ni anglicismos de tablero.

## El color dice el estado de la plata

El color comunica **el estado de la plata**; el ícono y el texto comunican **qué es la cosa**. Nada
se comunica solo con color: el 8 % de los varones es daltónico y la base de usuarios es casi toda
masculina.

| Estado               | Tono             | Qué significa                                  |
| -------------------- | ---------------- | ---------------------------------------------- |
| Esperando seña       | ámbar            | te deben la seña                               |
| Confirmada · Abonado | azul             | cobrás cuando llegue                           |
| Señada · Jugada      | verde            | plata asegurada o ya cobrada                   |
| Sin cobrar · Ausente | rojo             | se prestó el servicio y falta plata, o no vino |
| Torneo               | ámbar con rayado | ocupa cancha, no es la reserva de un jugador   |
| Bloqueado            | gris con rayado  | ocupa cancha, no es la reserva de un jugador   |

Usá siempre los tokens del sistema (`bg-card`, `text-foreground`, `bg-primary`), nunca colores
nuevos. La marca es esmeralda para acciones, sobre superficies grises azuladas. **Claro y oscuro son
igual de importantes**: en claro la profundidad se hace con sombras en capas, en oscuro con vidrio
esmerilado. Nunca vidrio en claro. Contraste AA en los dos.

## Reglas que no se negocian

1. **Ningún dato se repite entre pantallas.** Ver la sección "Lo que NO puede aparecer".
2. **El texto del vacío de "Necesita tu atención" es literal**, no lo mejores ni lo parafrasees.
3. **La píldora de estado es la misma** que en la Grilla y en Reservas. Sale de una sola tabla en el
   código. Si diseñás una nueva, tiene que reemplazar a esa, no convivir con ella.
4. **Las canchas se nombran en el mismo orden** que las columnas de la Grilla.
5. **44 px mínimo** en todo lo que se toca, y nada que dependa de pasar el mouse por encima.
6. **En el teléfono, lo operativo entra antes del pliegue.** Hoy la lista de configuración inicial
   se come la primera pantalla, y eso es un error a corregir.
7. **Nada nuevo funcionalmente.** Si tu diseño necesita un dato que la app no tiene, marcalo aparte
   en vez de dibujarlo como si existiera.

## Qué quiero recibir

Escritorio a 1280 px y teléfono a 375 px, cada uno en claro y en oscuro. El estado **lleno** es un
viernes con 4 canchas, turnos en varios estados y dos alertas activas. Más los tres vacíos de
arriba, y la variante con la lista de configuración inicial todavía visible.
