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

Rediseñá Configuración para que se vea **más moderna, más linda y más clara**, construyendo con los
componentes de este proyecto y respetando sus guías. Tenés libertad total en layout, jerarquía,
agrupación, espaciado, composición, estados vacíos, iconografía y microinteracciones.

No tenés libertad en lo de abajo. La app acaba de pasar una auditoría de coherencia de 130
hallazgos, y el objetivo es que **cada cosa se llame igual en todas las pantallas**.

## La pantalla

Cinco pestañas, y solo esas: **Perfil · Reservas · Horarios · Equipo · Facturación**. Canchas ya no
está acá, es un espacio propio del menú. Avisos ya no es pestaña, se plegó dentro de Perfil.

- **Perfil.** Datos del complejo, logo y portada, con un enlace "Ver mi perfil público" para ver
  dónde aparecen. Abajo, el bloque "Avisos" con la única preferencia de notificación.
- **Reservas.** La política del complejo: si se pide seña y qué porcentaje (con atajos de 30, 50 y
  100), si se aceptan reservas por internet, con cuántos días de anticipación, y hasta cuántas horas
  antes se puede cancelar.
- **Horarios.** Un horario general ("abre 08:00, cierra 23:00, vale para todos los días") y las
  excepciones por día plegadas detrás de "Personalizar", incluido cerrar un día entero y cerrar
  pasada la medianoche. El caso común se resuelve en 2 campos; el raro sigue siendo posible.
- **Equipo.** Lista de miembros con su rol (Administrador o Encargado) y su estado. Invitar por
  correo, cambiar rol, desactivar, reenviar invitación. Antes de invitar tiene que ser obvio qué va
  a poder ver esa persona.
- **Facturación.** El plan actual, el estado de la suscripción y la conexión con MercadoPago para
  cobrar las señas.

**Qué está mal hoy.** Cada pestaña es un formulario largo con la misma cara. No se distingue lo que
se toca una vez en la vida (facturación) de lo que se toca cada tanto (horarios). Los bloques de
Perfil no dicen para qué sirve cada imagen. Equipo no muestra qué implica cada rol antes de
invitar.

**Vacíos a diseñar:** Equipo sin nadie más que el dueño, y Facturación con MercadoPago sin conectar.

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
5. **Lo destructivo pide confirmación** (desactivar a alguien del equipo, por ejemplo).
6. **Nunca un campo de texto libre sobre personas.** Es una restricción legal de datos personales,
   no una preferencia. Las etiquetas son una lista cerrada.
7. **44 px mínimo** en todo lo que se toca, y nada que dependa de pasar el mouse por encima.
8. **Nada nuevo funcionalmente.** Si tu diseño necesita un dato que la app no tiene, marcalo aparte
   en vez de dibujarlo como si existiera.

## Qué quiero recibir

Escritorio a 1280 px y teléfono a 375 px, cada uno en claro y en oscuro, **para las cinco
pestañas**. Más los dos vacíos de arriba. Y la vista que ve el encargado cuando entra sin permiso.
