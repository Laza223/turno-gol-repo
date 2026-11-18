# Push urgente, permiso con modal propio y recordatorio al jugador

Fecha: 2026-11-16. Decisor: Lazar, en el chat. Contexto e investigación: [`docs/planning/2026-11-16-push-urgente-y-permiso.md`](../planning/2026-11-16-push-urgente-y-permiso.md).

1. **Reservas y cancelaciones son avisos urgentes**: salen con prioridad alta y quedan fijos hasta que el staff los toca. También el aviso de la primera reserva del día.
2. **Se elimina el resumen diario** (push y mail opcional). El resumen semanal por mail no cambia.
3. **El permiso se pide con un modal propio** ("Habilitar notificaciones" abre el diálogo del dispositivo), nunca con el diálogo del navegador al entrar. Aparece una vez:
   - al staff, al llegar al panel después del onboarding;
   - a las cuentas de staff que ya existen, en su próxima entrada;
   - al jugador, después de registrarse.
4. Si el dispositivo ya recibe avisos (permiso concedido y suscripción registrada), no se muestra nada: ni modal ni cartel. Mientras un dispositivo no reciba avisos, se muestra un **cartel chico y fijo** que vuelve a abrir el modal. *Superado el 2026-11-17 por [`2026-11-17-panel-mobile-avisos-y-menu.md`](2026-11-17-panel-mobile-avisos-y-menu.md): el cartel se puede cerrar y solo sale en Hoy.*
5. **Se levanta el veto del recordatorio al jugador** (supera la línea "NO hay recordatorio 24hs al jugador en v1" del CLAUDE.md). El jugador recibe dos avisos por push: uno 24 horas antes del turno y otro 2 horas antes. Los mails al jugador no cambian.
