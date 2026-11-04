# 07 — Objeciones probables y respuestas

> Documento vivo: después de cada demo perdida, anotar la objeción real (columna `objecion_principal` del CRM) y, si es nueva, sumarla acá con la respuesta que funcionó. Regla general: primero validar ("tiene lógica lo que decís"), después responder con mecánica del producto, nunca con promesas.

## Las del dueño clásico (WhatsApp + cuaderno)

**1. "Ya me arreglo con el WhatsApp / el cuaderno"**

> "Y te funciona, no lo discuto. Una sola pregunta: ¿cuántos turnos se jugaron anoche que nadie anotó como cobrados? Eso el cuaderno no te lo muestra. TurnoGol no te saca el WhatsApp: los fijos, el cobro por equipo, la caja y el buffet los llevás desde el celu, y al que te escribe de noche le mandás el link y reserva solo, las 24 hs. Si querés, también le pedís seña por MercadoPago."

**2. "Mis clientes no van a usar una app"**

> "No es una app, no bajan nada. Es un link que abre una página, como ver un menú por QR. Y ojo: tus fijos y los de siempre siguen igual que ahora, los cargás vos o el encargado en dos toques. El link es para el que te escribe a las 11 de la noche preguntando si tenés cancha — ese reserva solo y vos ni te enterás hasta que te suena el celu."

**3. "La seña me espanta clientes"**

> "Puede pasar, por eso es opcional: la prendés vos y elegís el porcentaje, o la dejás apagada y usás el sistema para ordenar la noche, la grilla y la caja. Ahora, pensalo al revés: el que no quiere dejar ni una seña, ¿qué tan seguro está de venir? La seña no espanta clientes — espanta a los que te cuelgan el turno." _(⚠️ HIPÓTESIS la última frase como argumento — medir si convence o irrita.)_

**4. "¿Cuánto sale?" (con cara de caro)**

> "$30.000 por cancha al mes, incluida la primera; pagando el año, 10% menos. Sin comisión por reserva: es fijo. Para que te des una idea, son unos $1.000 por cancha por día. Los primeros 30 días son gratis y sin tarjeta, así que la cuenta la hacés con tus números reales: ¿a cuánto está tu turno? ¿$[X]?"
>
> _(Fuente: `src/modules/billing/pricing.ts`. Es precio final, sin IVA aparte ([decisión del 2026-10-31](../decisions/2026-10-31-iva-precio-final.md)). No decir "se paga solo" ni "ya se pagó": no sabemos cuánto turno recupera cada uno.)_

**5. "No tengo tiempo de cargar todo / no me llevo con la tecnología"**

> "Cero problema, de eso nos ocupamos nosotros. Nos mandás una foto del cuaderno y los precios, y en 48 horas te lo dejamos andando. Al encargado lo entrenamos en 20 minutos. Vos solo mirá el celu cuando suene."

**6. "Lo tengo que hablar con mi socio"**

> "Perfecto. ¿Qué le va a preocupar a él? [escuchar, resolver] Hagamos esto: te dejamos un texto cortito para reenviarle [el de [03](./03-posicionamiento.md)] y coordinamos 15 minutos los tres en el complejo — con las canchas de ustedes ya cargadas se decide más fácil que por teléfono."

**7. "Ahora no, en [temporada baja/alta] veo"**

> Temporada alta: "Justo ahora es cuando más turnos te cuelgan y más plata perdés por turno. El sistema te lo dejamos andando nosotros, a vos te lleva cero tiempo." / Temporada baja: "Mejor: lo armamos tranquilos ahora y llegás a la temporada con todo andando y los fijos cargados. Además el mes gratis te cae en el mes flojo."

**8. "¿Y si se cae el sistema un sábado a la noche?"**

> "La grilla la seguís viendo desde cualquier celu, y el encargado puede anotar reservas a mano en el sistema igual que siempre. Y tenés un WhatsApp directo con nosotros, no un mail de soporte que contesta el lunes. [Honesto:] Es un sistema nuevo, no te vamos a decir que nunca va a tener un problema. Te decimos que del otro lado hay personas, no un robot."

**9. "¿Qué pasa con mis fijos de toda la vida?"**

> "Se cargan una vez y se repiten solos todas las semanas. Ves semana a semana quién pagó su sesión y quién todavía no. Nadie pierde su horario. [NO decir que se les cobra automático — el cobro lo registrás vos cuando te pagan. NO decir "saldo a favor" ni "deuda registrada": eliminados del producto.]"

**10. "¿Me hace la factura / sirve para AFIP?"**

> [Sin verso:] "No, facturación no hace — eso sigue como lo manejás hoy con tu contador. Lo que te da es el control interno: cuánto entró, cuánto salió, por dónde. La factura fiscal es otro carril."

## Las del que conoce el mercado

**11. "¿Ya lo usa alguien? ¿Quién?"**

> [Primeros clientes — honestidad total:] "Estás entre los primeros, no te vamos a mentir. Por eso el trato es cercano: 30 días gratis, te lo configuramos nosotros y tenés un WhatsApp directo con nosotros. No hay precio fundador: el precio es el mismo para todos." — [Con 3+ clientes:] nombrar complejos de la zona (con permiso) y ofrecer que los llame.

**12. "Ya uso ATC" / "Probé ATC y lo dejé"**

> Primero: "¿Qué te funcionó y qué no?" — Si recibe muchas reservas del marketplace de ATC: retirarse con elegancia ("entonces te está sirviendo, no te queremos hacer perder eso — quedate con nuestro contacto por si algo cambia"). Anotar como `no-ICP`. — Si lo usa a medias o lo dejó: "Es que ATC es para todos los deportes y está pensado para la compu. Esto es solo fútbol y lo manejás desde el celu. Sale menos por mes [verificar precio ATC vigente antes de afirmarlo] y te lo dejamos andando en un día. La carga inicial de tus datos la hacemos nosotros a mano, no perdés nada."

**13. "¿Me traés jugadores nuevos?"**

> [NO inflar:] "No, y el que te diga que sí te está vendiendo humo salvo que tenga una app con miles de pibes adentro. TurnoGol te ordena la demanda que YA tenés — el Instagram, los que te escriben, los de siempre — y hace que reserven solos, a cualquier hora. Traerte gente nueva es trabajo de tu Instagram, y ahí te dejamos textos listos para publicar que te van a servir."

**14. "¿Y si ustedes cierran? / ¿mis datos?"**

> "Tus datos son tuyos: los exportás cuando quieras [CSV]. Y la plata nunca pasa por nosotros — si usás la seña, va directo de tu cliente a tu MercadoPago. Si mañana TurnoGol desaparece, tu plata y tus clientes siguen siendo tuyos."

**15. "¿Me avisa por WhatsApp al cliente?"**

> [Honesto:] "Hoy el cliente recibe la confirmación por mail, y a vos la reserva te llega al celu como aviso al instante. Aviso por WhatsApp no hay por ahora — no te vendo lo que no está. [Si insiste mucho: anotarlo — es señal de demanda real para post-v1, no prometer fecha.]"

## Señales para NO perseguir

- Tres "no tengo tiempo" seguidos sin proponer fecha = no le interesa → break-up ([06 §6](./06-scripts.md)).
- Pide descuento antes de la demo = compara precio, no valor → baja prioridad.
- "Mandame TODO por escrito" sin querer charlar nunca = no decide él o no le duele → break-up.
- Complejo pádel-céntrico o dependiente del marketplace de ATC = `no-ICP`, salir bien y rápido.
