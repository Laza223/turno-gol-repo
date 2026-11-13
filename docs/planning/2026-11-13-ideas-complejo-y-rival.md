# Ideas nuevas para el complejo y para RIVAL

**Fecha:** 2026-11-13. **Estado: ideas, ninguna decidida.** Salen de una ronda de ideas pedida por el founder, cruzada con lo que ya está anotado ([`docs/rival/ideas.md`](../rival/ideas.md), [`2026-11-08-ideas-del-founder.md`](2026-11-08-ideas-del-founder.md)) y con el código. De las diez, siete son nuevas y tres ya estaban anotadas sin construir. No se las sacó de la nada: "Clientes dormidos", por ejemplo, ya existe en `/jugadores` y por eso no está acá.

Antes de diseñar cualquiera, rige lo de siempre: los vetos de producto de `CLAUDE.md`, la decisión escrita del dueño para plata y lifecycle, y los textos por la skill `turnogol-copy`.

## Para el complejo

1. **Tarjeta de sellos (la fidelización que pidió el founder).** Cada N partidos jugados en el complejo, un premio que elige el dueño de una lista corta: turno gratis, gaseosa, descuento. El encargado lo marca como entregado. No hay puntos ni saldo. El jugador ve "te faltan 2" en su perfil. **Idea nueva.**
   - Roza dos vetos: "nada canjeable" en RIVAL y "sin saldo a favor" en abonados. Entra si es un premio del complejo y no puntos, pero **necesita OK escrito del dueño antes de diseñarla**.
2. **Lista de espera.** Turno ocupado, el jugador se anota en un toque, si se cancela le avisa al primero y, si no lo toma, pasa al siguiente. Ya estaba anotada con la prioridad más alta. No está construida.
3. **El reporte del lunes.** Un mail semanal al dueño con lo que el sistema hizo por él: reservas que entraron solas, cuántas fuera de su horario de atención, turnos recuperados. Ya estaba anotado. Hoy solo existe el resumen diario.
4. **Cumpleaños y eventos a pedido.** Botón "Festejá tu cumple" en la página del complejo: fecha, cantidad de gente y extras de una lista. Le llega al dueño como solicitud y, si acepta, se crea el evento de varias horas que la grilla ya soporta. **Idea nueva.**
5. **Turno fijo a pedido.** El jugador pide "todos los jueves a las 21", el dueño acepta en un toque y se crea el abonado. Ya estaba anotada. Después esos turnos fijos son los que se invitan a fundar club en RIVAL.

## Para RIVAL y el perfil del jugador

Ninguna está en el catálogo de RIVAL.

1. **Dar el presente.** Un QR en la cancha: cada jugador lo escanea al llegar y el partido le cuenta en su carrera. Hoy TurnoGol ve al que reserva y el partido son 10, así que cada partido puede sumar hasta 9 cuentas nuevas. No usa geolocalización.
2. **De guardia.** El jugador se anota como disponible ("esta semana juego, soy arquero"), con día y puesto de lista cerrada. El club al que le falta uno lo ve y lo contacta por el mismo camino de WhatsApp de v1, sin plata de por medio.
3. **Roles del plantel.** Capitán, DT, el que lleva la pelota, el del asado: lista cerrada con humor de potrero, visible en el club y en la figurita.
4. **El Ojeador.** Logro por traer jugadores que llegan a jugar su primer partido oficial ("Fichaste a 5"). El premio es estatus, nada canjeable.
5. **Objetivo de temporada.** El jugador se pone una meta privada ("20 partidos este verano") y el perfil le muestra el avance. Funciona con un solo complejo.

## Por dónde se empezaría (recomendación, sin decidir)

- **Complejo:** el reporte del lunes, porque es lo más barato de hacer y le muestra al dueño lo que TurnoGol hace por él. Después, la lista de espera.
- **RIVAL:** dar el presente, porque la media, la figura y la carrera solo le sirven al que tiene cuenta.
