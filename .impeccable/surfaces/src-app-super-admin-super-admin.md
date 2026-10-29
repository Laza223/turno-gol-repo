---
version: 1
slug: "src-app-super-admin-super-admin"
primary_target: "src/app/(super-admin)/super-admin"
related_targets: []
---

# Superadmin (src/app/(super-admin)/super-admin)

Spec visual vigente de la pantalla. Vivía en DESIGN.md › Components y se movió acá el 2026-10-29 sin cambios de contenido, para que DESIGN.md quede con lo que comparten todas las pantallas (tokens, reglas y componentes compartidos), que sigue mandando sobre esto. Esta pantalla todavía no tiene brief de `shape`.

## Superadmin (Pulso, Complejos y Jugadores)

`/super-admin`, solo para el dueño de la plataforma. Se rehizo el 2026-10-16, el día en que El Vagón publicó su link de reservas y el panel no mostró ni uno de los 10 jugadores ni de las 9 reservas online. Contesta "¿cómo viene la plataforma hoy y esta semana?" antes que "¿cuánto factura?". Va en el mismo mundo que el panel del complejo (esmeralda sobre slate): el violeta propio del super-admin se eliminó ("SuperAdmin" en la barra alcanza para saber dónde estás). No confundir con el violeta de TurnoGol Plus (ver Colors), que es otro uso y no identifica al panel. La navegación tiene tres entradas: Pulso, Complejos y Jugadores.

- **Pulso (portada):** "Hoy · 7 días · 30 días" en el encabezado (links, la ventana va en la URL). De arriba a abajo: cuatro `StatCard` (jugadores nuevos, reservas online, cargadas por el complejo, complejos con movimiento) con la ventana anterior como referencia en el subtítulo, sin porcentaje (mismo criterio que Métricas); los últimos 14 días en dos barras diarias (`DailyBars`); "Pide atención" solo si hay algo (pruebas que vencen, cobro trabado, tareas fallidas); "Lo último" (reservas online y jugadores nuevos, con link a cada uno); después Plata, Alta de complejos y la salud técnica plegada.
- **Cada bloque carga solo:** la actividad y el resto son dos lecturas con su propio `Suspense`, tope y aviso "No se pudo leer a tiempo". Una lectura lenta no tira la página.
- **Jugadores:** altas por día (30 días), lista con búsqueda y chips (Todos · Nuevos esta semana · Con reservas · Bloqueados) y el detalle con sus datos, sus complejos (etiquetas del enum y bloqueos) y sus reservas con el origen (Online / Cargada por el complejo). Nunca se muestra texto libre sobre una persona (ni el motivo de un bloqueo), y un jugador anonimizado aparece como "Jugador anonimizado", sin contacto.
- **Complejos:** la lista dice si el complejo está vivo (última reserva, reservas de 7 días con cuántas online, jugadores) en vez del slug. El detalle es `PageHeader` plano con pestañas Resumen · Suscripción · Historial · Acciones, y los enums se muestran traducidos.
- **Vocabulario:** Complejos, Altas, Ingreso mensual, Prueba, Perdido, Ajustes, Historial. Nada de Tenants, MRR, Signups, Trial, Churned ni Audit trail en pantalla.
