# Prompt 2 — Configuración

> Pegar entero en una conversación nueva del proyecto `turnogol` de claude.ai/design.
> Adjuntar las capturas de las cinco pestañas: `desktop_admin_settings_perfil.png`,
> `settings_reservas`, `settings_horarios`, `settings_equipo`, `settings_facturacion`, y sus
> equivalentes `mobile_admin_*`.
> Hacela **después** de la Grilla: hereda lo que decidas ahí sobre pestañas y formularios.

---

## Quiénes usan esto

TurnoGol es un sistema para complejos de fútbol de Argentina. Esto es el **panel del complejo**, no
la app del jugador.

Configuración la toca **solo el dueño**, una vez por mes o menos. Marcelo tiene 35–60 años y un
nivel de tecnología de 2,5 sobre 5: nunca va a leer un manual y tiene miedo de tocar algo y romper
todo. Viene en un rato tranquilo de la mañana a cambiar el horario de cierre, subir el logo o darle
acceso a un encargado. El encargado que entra por error ve un aviso claro de que no tiene acceso, y
nada más.

El panel es una **herramienta de trabajo**: densidad alta, datos primero, decoración después.
Animaciones de hasta 200 ms y solo si cumplen una función. **La belleza acá es la eficiencia.**

## Qué te pido

Dos cosas, y el orden es la importancia:

1. **Que cada tarea sea más corta y que sobre menos.** El dueño describió la app con tres palabras:
   _"incoherente, incómoda"_ y con _"TANTO"_. Lo primero ya se arregló: la app pasó una auditoría de
   130 hallazgos y ahora cada cosa se llama igual en todas las pantallas. Lo segundo y lo tercero son
   tu trabajo. Para cada tarea de la tabla de abajo, **caminala paso a paso como si fueras Marcelo**:
   en cada paso, ¿sabe qué tocar?, ¿ve que el control existe?, ¿ve que avanzó?, ¿sabe qué le va a
   pasar al jugador o al encargado con lo que acaba de cambiar? Contá los pasos que hay hoy y
   proponé el camino más corto. Y para **cada bloque y cada campo** de las cinco pestañas contestá
   tres preguntas: ¿quién lo usa?, ¿cada cuánto?, ¿qué se rompe si lo sacamos? Lo que no sobreviva,
   sacalo o plegalo.
2. **Que se vea más moderna, más linda y más clara**, construyendo con los componentes de este
   proyecto y respetando sus guías. Tenés libertad total en layout, jerarquía, agrupación, espaciado,
   composición, estados vacíos, iconografía y microinteracciones.

**Cambiar el flujo sí; inventar funcionalidad no.** Cambiar el flujo es reordenar, fusionar o sacar
pasos, mover un campo o un bloque de lugar, cambiar qué se pregunta primero y qué se pliega, juntar
tres botones "Guardar" en uno. Funcionalidad nueva es un dato que la app no tiene, una preferencia
nueva, una pestaña nueva o un permiso que hoy no existe. Lo primero lo quiero; lo segundo lo marcás
aparte como "requiere decisión del dueño" en vez de dibujarlo como si existiera.

## Las tareas que esta pantalla tiene que resolver

Salen de una recorrida real del dueño por su propio complejo. "Cómo es hoy" está medido sobre el
código, no estimado.

| #   | Tarea                                                      | Cada cuánto              | Cómo es hoy                                                                                                                                                                                                             | Qué tiene que pasar                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C3  | Cambiar el horario de cierre, incluso pasada la medianoche | cada tanto               | Pestaña Horarios: un bloque "Horarios de apertura" con el horario general y "Personalizar" por día, y abajo otro bloque "Días cerrados" para agregar o sacar fechas.                                                    | El caso común se resuelve en **2 campos**: abre y cierra. Si cierra a las 2 AM, el turno de la 1 AM del sábado tiene que aparecer **dentro del sábado**, y eso se explica ahí.         |
| C4  | Subir la portada y el logo, y ver dónde aparecen           | una vez, y al cambiarlos | Pestaña Perfil: **cinco formularios apilados, cada uno con su propio botón Guardar**: email de la cuenta, logo y portada, datos de contacto, ubicación, y "Avisos" con la única preferencia de notificación.            | Si se piden dos imágenes, las dos hacen algo visible que se puede señalar, y un enlace "Ver mi perfil público" muestra el resultado.                                                   |
| C5  | Dar acceso a un encargado y saber qué va a ver             | una vez por empleado     | Pestaña Equipo: lista de miembros con rol (Administrador o Encargado) y estado. "Invitar" abre un diálogo con nombre, apellido, correo y rol, y un botón Enviar. Después: cambiar rol, desactivar, reenviar invitación. | **Antes** de invitar tiene que ser obvio qué va a poder ver esa persona. Hoy hay que saberlo de memoria.                                                                               |
| —   | Decidir la política de reservas                            | una vez por mes o menos  | Pestaña Reservas: si se pide seña y qué porcentaje (con atajos de 30, 50 y 100), si se aceptan reservas por internet, con cuántos días de anticipación, y hasta cuántas horas antes se puede cancelar.                  | Cada opción dice qué le pasa al jugador si la cambio. Nada se guarda solo.                                                                                                             |
| —   | Ver qué plan tengo y si MercadoPago está conectado         | una vez en la vida       | Pestaña Facturación: **seis bloques** en este orden: historial de facturas, activar plan, cambiar plan, correo del pagador de MercadoPago, cancelar suscripción, desconectar MercadoPago.                               | En 3 segundos: qué plan tengo, hasta cuándo, y si MercadoPago está conectado. Todo lo demás, plegado. Lo que se hace una vez en la vida no puede ocupar el mismo lugar que lo mensual. |
| —   | El encargado entra por error                               | ocasional                | Ve un aviso de que no tiene acceso.                                                                                                                                                                                     | Igual de claro, sin ofrecerle nada más.                                                                                                                                                |

## Lo que hay hoy

Cinco pestañas, y solo esas: **Perfil · Reservas · Horarios · Equipo · Facturación**. Canchas ya no
está acá, es un espacio propio del menú. Avisos ya no es pestaña, se plegó dentro de Perfil.

**Qué está mal hoy.** Cada pestaña es un formulario largo con la misma cara. No se distingue lo que
se toca una vez en la vida (facturación) de lo que se toca cada tanto (horarios). Perfil tiene cinco
botones "Guardar" para una sola pantalla. Los bloques de Perfil no dicen para qué sirve cada imagen.
Equipo no muestra qué implica cada rol antes de invitar.

## Lo que te pido que pongas en duda

No digo que sobren. Digo que nadie preguntó. Para cada uno, las tres preguntas (quién, cada cuánto,
qué se rompe) y una decisión con su motivo:

- Cinco botones "Guardar" en Perfil. ¿Hace falta uno por bloque?
- El email de la cuenta dentro de Perfil, mezclado con los datos del complejo.
- La ubicación como formulario aparte de los datos de contacto.
- "Días cerrados" a la misma altura que el horario semanal.
- El historial de facturas ocupando el primer lugar de Facturación.
- Cancelar la suscripción y desconectar MercadoPago como bloques a la vista, siendo lo que menos
  veces se hace en la vida del complejo.

Si algo se queda, que sea porque una tarea de la tabla lo necesita.

## Vocabulario cerrado

Un término por estado, en toda la app. Estas son las palabras, no sinónimos:

| Cosa                  | Se dice                                                                        | Nunca                         |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| Los espacios del menú | Hoy · Grilla · Caja · Clientes · Canchas · Torneos · Métricas · Configuración  | Inicio, Ajustes, Preferencias |
| Los dos roles         | Administrador · Encargado                                                      | admin, manager, usuario       |
| La seña               | seña                                                                           | anticipo, depósito            |
| Quien reserva         | jugador si tiene cuenta, invitado si no                                        | cliente, usuario              |
| Acciones              | verbo primero y en voseo: "Guardar cambios", "Invitar al equipo", "Desactivar" | "Click aquí", "Ir a"          |

Plata siempre `$ 28.000`, con espacio y punto de miles. Fechas en castellano, formato medio:
"mié 2 de julio". Nada de formato ISO ni anglicismos de tablero.

## Color y superficie

Usá siempre los tokens del sistema (`bg-card`, `text-foreground`, `bg-primary`), nunca colores
nuevos. La marca es esmeralda para acciones, sobre superficies grises azuladas. **Claro y oscuro son
igual de importantes**: en claro la profundidad se hace con sombras en capas, en oscuro con vidrio
esmerilado. Nunca vidrio en claro. Contraste AA en los dos. Nada se comunica solo con color: todo
estado lleva color más ícono o texto.

## Reglas que no se negocian

1. **Cinco pestañas, y solo esas.** No agregues, no partas, no fusiones.
2. **El caso común de horarios se resuelve en 2 campos.** El raro queda plegado detrás, nunca
   delante. Misma idea en el resto: mostrar lo que se usa, esconder lo que casi nunca.
3. **Dos roles fijos.** No hay editor de permisos por casilla, y no lo inventes.
4. **Todo se guarda con un botón y un "Guardado" visible.** Nada que se guarde solo sin decirlo.
   Cuántos botones por pestaña lo decidís vos con las tres preguntas.
5. **Lo destructivo pide confirmación** (desactivar a alguien del equipo, cancelar la suscripción).
6. **Nunca un campo de texto libre sobre personas.** Es una restricción legal de datos personales,
   no una preferencia. Las etiquetas son una lista cerrada.
7. **44 px mínimo** en todo lo que se toca, y nada que dependa de pasar el mouse por encima.
8. **Como máximo 5 a 7 opciones a la vez** de la misma jerarquía; el resto se pliega. La
   información va en grupos de 3 o 4. La tarea principal de cada pestaña se completa en 3
   interacciones o menos desde que carga.
9. **Cambiar el flujo sí; inventar funcionalidad no.** Está definido arriba. Si creés que una de
   estas reglas está mal, decilo aparte con el argumento en vez de callarlo o de saltearla.

## Qué quiero recibir

1. **Cambios de flujo propuestos.** Una entrada por tarea de la tabla: cuántos pasos tiene hoy,
   cuántos quedan, qué se saca, qué se mueve, y qué necesitaría del código que hoy no existe, si
   algo.
2. **Lista de resta.** Cada bloque o campo que sacaste o plegaste, con las tres respuestas.
3. **Decisiones que no son tuyas.** Lo que cambia una regla de negocio o necesita un dato nuevo,
   listado aparte y sin dibujar.
4. **Las pantallas.** Escritorio a 1280 px y teléfono a 375 px, cada uno en claro y en oscuro,
   **para las cinco pestañas**. Más los dos vacíos: Equipo sin nadie más que el dueño, y Facturación
   con MercadoPago sin conectar. Y la vista que ve el encargado cuando entra sin permiso.
