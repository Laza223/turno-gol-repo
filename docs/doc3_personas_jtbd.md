# DOC 3 — Personas & Jobs-to-be-Done
## TurnoGol: Los 3 Arquetipos Reales del Sistema

> **Propósito**: Definir con precisión quién usa TurnoGol, qué trabajo real viene a hacer,
> y qué lo haría abandonarlo. De aquí se derivan los features, no al revés.

> [!NOTE]
> TurnoGol tiene **dos productos** (B2B panel admin + B2C app del jugador) y **3 personas distintas**.
> Diseñar para "el usuario" sin especificar cuál es la causa #1 de features que no sirven a nadie.

> [!IMPORTANT]
> **¿Dónde está el "abonado"?** Un abonado NO es un tipo de usuario diferenciado. Es un jugador
> (Persona 3) que tiene un acuerdo comercial de turno fijo con un complejo específico.
> Desde el lado del sistema, usa la misma app, el mismo login, las mismas pantallas.
> La gestión del abonado (crear turno fijo, cobrar, pausar, cancelar) es 100% del lado admin
> (Marcelo/Rodrigo). ATC Sports confirma este modelo: el "abonado" es un tipo de turno en la
> grilla del admin, no un rol separado del jugador.

> [!NOTE]
> **¿Dónde están los "partidos abiertos"?** Fuera de scope v1. La funcionalidad de crear partidos
> públicos donde jugadores se suman (estilo marketplace social) es compleja y el volumen esperado
> en los primeros 50-200 complejos no justifica la inversión técnica. Se evalúa para v1.5.
> En v1, TurnoGol es un **sistema de gestión de canchas con reservas online** — igual que ATC.

---

## PERSONA 1 — El Dueño del Complejo

> El comprador. El que paga la suscripción. El que toma la decisión de adoptar TurnoGol.
> Si no le resolvemos el problema a él, no tenemos producto.

### Perfil
- **Nombre representativo**: Marcelo, 43 años
- **Rol en TurnoGol**: Admin Principal (buyer)
- **Complejo**: 4-6 canchas de fútbol 5, GBA o ciudad del interior

### Contexto diario
- Se despierta y lo primero que hace es ver el WhatsApp del complejo: ya tiene 8 mensajes de la noche anterior.
- Va al complejo a las 9hs. Atiende en el mostrador, a veces cocina algo para la cantina, supervisa el encargado.
- A las 11hs hay un pico de consultas de disponibilidad para el fin de semana.
- A las 14hs cierra "el mediodía" y vuelve a las 17hs para el pico de la noche (viernes=caos).
- Lleva la caja a mano o en una hoja de Excel básica.
- Los viernes a la noche tiene 6-8 turnos corridos. No puede parar.
- Termina el día a las 23-24hs.

### Tech literacy: 2.5/5
- Usa WhatsApp con fluidez total.
- Usa Instagram para ver stories y publicar fotos del complejo.
- Tiene Google Maps optimizado para su complejo.
- Nunca va a leer un manual. Aprende haciendo o preguntando.
- Se frustra rápido si algo no es intuitivo.
- Tiene miedo a "tocar algo y romper todo".

### Jobs-to-be-Done Primarios
> **1. Organización:** "Cuando estoy en el complejo un viernes a la noche con 3 personas esperando
> y el teléfono sonando, quiero confirmar y cobrar un turno en menos de 20 segundos desde el celu,
> para no hacer esperar a nadie y no cometer errores que después me cuesten plata."

> **2. Protección económica:** "Cuando un grupo reserva un turno de las 21hs y a las 20:30 me cancelan
> por WhatsApp, quiero que ya hayan pagado la seña online para no perder esa plata,
> porque ese horario ya no lo alquilo más."

### Jobs Secundarios (los que hace "de paso" y que también cubrimos)
| Job | Trigger | Resultado esperado |
|---|---|---|
| Monitorear el negocio | Domingo a la tarde, tranquilo en casa | Ver cuánto facturé esta semana y cuáles canchas rindieron más |
| Gestionar abonados | Principio de mes o cuando viene un cliente fijo | Crear/pausar/cancelar el turno fijo desde la grilla, registrar el pago manual |
| Saber quién le debe | Lunes a la mañana | Ver en una pantalla la lista de deudores y cuánto debe cada uno |
| Bloquear un horario | Viene un evento privado o feriado | Hacerlo en 30 segundos sin que quede disponible para otros |
| Ver el estado del día | Fin del día | Cuánto entró, cuánto falta cobrar, si cerró bien la caja |

### Miedos y fricciones con soluciones actuales
| Miedo | Origen |
|---|---|
| "Voy a perder datos si el sistema falla" | Mala experiencia pasada o historia de algún conocido |
| "Mis empleados no lo van a saber usar" | Resistencia al cambio del equipo |
| "No voy a poder configurarlo solo" | Baja confianza técnica |
| "Es caro para lo que uso" | No ve el ROI hasta que lo usa |
| "¿Qué pasa si dejan de dar soporte?" | Conoce empresas que desaparecieron |

### Objeciones a adoptar TurnoGol
| Objeción | Respuesta del sistema |
|---|---|
| "Ya tengo ATC" | "TurnoGol es más barato y tiene mejor UX. Probalo 30 días gratis." |
| "No tengo tiempo de configurarlo" | "Lo configurás en 20 min. La interfaz te guía paso a paso." |
| "¿Y si mis clientes no quieren reservar online?" | "Vos podés seguir cargando reservas manuales. Ellos pueden reservar si quieren." |
| "¿Y mis datos si me voy?" | "Exportás todo en CSV en cualquier momento." |
| "¿Le enseño esto al empleado?" | "El empleado lo aprende en 10 minutos. La interfaz es más simple que Instagram." |

### Canal de adquisición
- Instagram Ads (targeting geo por ciudad/partido)
- Google Search ("software gestión canchas fútbol [ciudad]")
- Boca a boca entre dueños de complejos (muy fuerte en este segmento)
- Email outreach directo del equipo de ventas

### Métricas de éxito para esta persona
- Tiempo en configurar el complejo: < 20 minutos
- Tiempo promedio para confirmar una reserva manual: < 30 segundos
- Porcentaje de turnos con seña pagada online: > 50% (indicador de que la reserva online adoptó)
- NPS de Marcelo a los 30 días: > 40

### Lo que lo haría abandonar TurnoGol
- Si el sistema falla en un viernes a la noche (momento de máxima tensión)
- Si el empleado no lo adopta y vuelven al WhatsApp por su cuenta
- Si las señas online generan más quilombo del que resuelven (chargebacks, reclamos)
- Si el onboarding le lleva más de 1 hora y necesita ayuda externa

---

## PERSONA 2 — El Encargado / Recepcionista

> El usuario diario más crítico. No compra TurnoGol, pero su adopción determina si funciona.
> Si el encargado odia el sistema, el dueño lo va a abandonar.
> **Esta persona es frecuentemente ignorada en el diseño y es la causa #1 de fracaso de adopción.**

### Perfil
- **Nombre representativo**: Rodrigo, 24 años
- **Rol en TurnoGol**: Recepcionista / Staff User
- **Contexto**: Trabaja tardes y noches en el complejo. A veces está solo.

### Contexto diario
- Llega a las 15hs o 17hs.
- Tiene el mostrador, el teléfono, el WhatsApp del complejo y a veces personas esperando al mismo tiempo.
- Su trabajo en las horas pico (especialmente los viernes) es muy estresante.
- En horas tranquilas, carga reservas para el día siguiente y anota en papel "por las dudas".
- Cuando hay dudas, llama al dueño. Si el dueño no atiende: improvisa.

### Tech literacy: 4/5
- Digital nativo. Usa todas las apps con fluidez.
- Aprende interfaces rápido.
- Prefiere shortcuts y gestos a menús largos.
- Le aburre lo repetitivo y le gusta cuando el sistema "hace solo" las cosas.

### Job-to-be-Done Primario
> "Cuando hay alguien en el mostrador esperando confirmar su turno y el teléfono suena al mismo tiempo,
> quiero ver de un vistazo si hay disponibilidad y confirmar en 15 segundos,
> para no hacer esperar a nadie y no equivocarme doblando una cancha."

### Jobs Secundarios
| Job | Trigger | Resultado esperado |
|---|---|---|
| Verificar disponibilidad rápido | Alguien pregunta en persona o por teléfono | Ver la grilla del día sin navegar 3 pantallas |
| Registrar una reserva manual | Alguien paga en efectivo en el mostrador | Cargarlo en 30 segundos con el mínimo de campos requeridos |
| Bloquear un horario urgente | "Cerramos esa cancha, hay que cambiar el piso" | Hacerlo sin llamar al dueño |
| Ver quién tiene turno ahora | En cualquier momento del día | Pantalla de "próximos turnos" sin tener que buscar |
| Registrar un cobro de cantina | Alguien compra una gaseosa | Sin salir del contexto de reservas |

### Miedos concretos
| Miedo | Origen |
|---|---|
| "La pantalla se congela justo cuando estoy en el pico" | El peor momento posible para un sistema down |
| "Le cargo mal el turno a alguien y hay quilombo" | Errores de superposición son el problema más serio |
| "El dueño me ve usando papel en vez del sistema" | Conflicto interno si no adopta bien |
| "No entiendo algo y no puedo llamar al dueño" | Necesita resolver cosas solo |

### Objeciones / puntos de fricción
| Fricción | Solución en TurnoGol |
|---|---|
| "Tengo que hacer demasiados clics para registrar un turno" | Flujo de reserva manual en 3 pasos máximo desde la grilla |
| "La grilla en el celu es imposible de usar" | Diseño mobile-first con grilla táctil optimizada |
| "No sé si puedo hacer X o Y" (permisos) | Interfaz que solo muestra lo que el rol puede hacer (no confunde con lo que no puede) |

### Métricas de éxito para esta persona
- Tiempo promedio para cargar una reserva manual: < 30 segundos
- Tasa de errores de superposición de reservas: 0% (el sistema no lo permite)
- Adopción: que Rodrigo deje de usar papel en la primera semana

---

## PERSONA 3 — El Jugador

> El usuario principal del B2C. Puede jugar de forma espontánea o tener un turno fijo.
> Su experiencia en la app determina si las reservas online funcionan o mueren.

### Perfil
- **Nombre representativo**: Tomás, 26 años
- **Situación**: Juega cuando puede. A veces con grupo fijo, a veces espontáneo.

### Variantes de comportamiento

El "jugador" no es un perfil monolítico. Tiene dos modos de uso:

| Modo | Ejemplo | Cómo interactúa con TurnoGol |
|---|---|---|
| **Espontáneo** | Tomás quiere jugar el jueves, busca cancha | Busca disponibilidad → reserva → paga seña → juega |
| **Abonado** (turno fijo) | Tomás tiene turno fijo los viernes con su grupo | Recibe email recordatorio → va y juega. Si un viernes no puede → avisa al complejo o cancela su instancia |

> [!NOTE]
> **El "abonado" es un estado, no un tipo de usuario.** Un jugador puede ser abonado en un complejo
> y espontáneo en otro, simultáneamente. La creación y gestión del turno fijo la hace el admin
> (Marcelo/Rodrigo) desde el panel. El jugador solo ve "Mis turnos" — algunos serán espontáneos,
> otros serán instancias de su turno fijo.

> [!IMPORTANT]
> **En v1, el pago del abonado es manual.** El complejo cobra al jugador cuando va a jugar (efectivo,
> transferencia, o como arreglen). TurnoGol no interviene en el cobro del turno fijo — solo gestiona
> la reserva recurrente. Esto es exactamente como funciona ATC Sports: el admin maneja los pagos
> de abonados manualmente con sistema de "saldo a favor".

### Contexto
- Trabaja horarios irregulares. El miércoles a las 17hs decide que quiere jugar el jueves a la noche.
- Llama a 2-3 complejos que conoce. Uno no atiende. El otro no tiene lugar. El tercero cuesta el doble.
- A veces termina no jugando.
- **Si es abonado**: el fútbol del viernes es su momento de desconexión. La logística ya está resuelta: siempre juegan, misma cancha, mismo horario. Lo que NO quiere: incertidumbre sobre su turno.

### Tech literacy: 4/5
- Heavy user de apps. Paga todo con MercadoPago.
- Tiene alta expectativa de UX: compara con Airbnb, Rappi, Mercado Libre.
- Si una app le da fricción, la abandona por WhatsApp.

### Job-to-be-Done Primario (espontáneo)
> "Cuando el miércoles a la tarde me confirman que somos 8 para jugar el jueves,
> quiero encontrar una cancha libre en mi zona en ese horario y reservarla en 2 minutos desde el celu,
> para no perder 40 minutos llamando a complejos que no atienden."

### Job-to-be-Done Primario (abonado)
> "Cuando llega el jueves a la noche y alguno del grupo pregunta '¿seguro jugamos mañana?',
> quiero poder responder 'sí, ya está confirmado' sin tener que llamar al complejo,
> para no preocuparme por algo que debería ser automático."

### Jobs Secundarios
| Job | Trigger | Resultado | Modo |
|---|---|---|---|
| Comparar precios entre complejos | Tiene opciones | Ver precio, distancia y disponibilidad | Espontáneo |
| Pagar la seña sin efectivo | Quiere asegurar el turno | MercadoPago en 2 clics | Espontáneo |
| Cancelar si se cae el partido | Los amigos no pueden ir | Sin cargo o con reintegro según política del complejo | Ambos |
| Cancelar una semana del turno fijo | Ese viernes no puede | Avisar al complejo o hacerlo desde la app, sin llamar | Abonado |
| Ver detalle de su turno fijo | Le llega el recordatorio | Confirmar hora, cancha, y cuánto paga | Abonado |

### Objeciones
| Objeción | Respuesta |
|---|---|
| "No quiero registrarme para reservar" | Magic link por email: sin contraseña, sin formulario largo |
| "¿Para qué uso la app si puedo llamar?" | Búsqueda de disponibilidad en tiempo real + reserva instantánea sin esperas |
| "¿Es seguro poner mi tarjeta?" | MercadoPago maneja el pago, TurnoGol nunca ve los datos de la tarjeta |

### Miedos
| Miedo | Impacto |
|---|---|
| "Reservé y no me guardaron el turno" | Necesita confirmación inmediata y visible |
| "Me llegan demasiadas notificaciones" | Si el email molesta → lo filtra → pierde los recordatorios útiles |
| "Pagué la seña y después cambió algo" | Necesita transparencia sobre la política de cancelación |

### Métricas de éxito
- Tiempo desde "busco cancha" hasta "turno confirmado": < 3 minutos (espontáneo)
- Tasa de conversión de búsqueda a reserva: > 30%
- Porcentaje que vuelve a reservar en 30 días: > 40%
- Puede cancelar su instancia de turno fijo en menos de 1 minuto (abonado)
- No tiene que llamar al complejo nunca para confirmar su turno (abonado)

---

## Mapa de Personas — Quién Usa Qué

| Feature / Módulo | Marcelo (Dueño) | Rodrigo (Encargado) | Tomás (Jugador) |
|---|:---:|:---:|:---:|
| Panel Admin - Grilla | ✅ | ✅ | |
| Panel Admin - Caja | ✅ | ✅ (limitada) | |
| Panel Admin - Reportes | ✅ | | |
| Panel Admin - Config | ✅ | | |
| Panel Admin - Abonados (gestión turnos fijos) | ✅ | ✅ (ver) | |
| App - Búsqueda de canchas | | | ✅ |
| App - Mis turnos (espontáneos + fijos) | | | ✅ |
| Email - Confirmación de reserva | | | ✅ |
| Email - Recordatorio 24hs | | | ✅ |

> [!NOTE]
> La columna "Tomás (Jugador)" cubre **ambos modos**: espontáneo y abonado.
> Un jugador con turno fijo ve sus instancias de abonado dentro de "Mis turnos"
> junto con sus reservas espontáneas. No hay una experiencia separada.

---

## Jerarquía de Personas (Quién Manda)

```
1️⃣  Marcelo (Dueño)        — Paga la suscripción. Si no está feliz, churn directo.
2️⃣  Rodrigo (Encargado)    — Usa el sistema todos los días. Su resistencia mata la adopción.
3️⃣  Tomás (Jugador)        — El volumen de reservas online. Puede ser espontáneo, abonado, o ambos.
```

> [!IMPORTANT]
> El error más común en SaaS B2B2C (como TurnoGol) es diseñar para el comprador (Marcelo) olvidando al usuario diario (Rodrigo). Si Rodrigo no adopta el sistema, Marcelo lo abandona. Todas las decisiones de UX del panel admin tienen que hacerse pensando en los dos.

> [!TIP]
> **¿Y el ingreso predecible del abonado?** Sigue siendo crítico para el negocio de Marcelo.
> Pero la gestión del abonado (crear, pausar, cancelar, cobrar manualmente) es responsabilidad del admin,
> no una experiencia diferenciada del jugador. El jugador solo ve el resultado: su turno confirmado.
> Por eso el abonado es un **job de Marcelo** (Doc 3 §1, jobs secundarios: "Gestionar abonados")
> implementado como funcionalidad del panel admin (US-ABO-001 a 005), no una persona separada.
