# 01 — Diagnóstico brutal: ¿qué tan vendible es TurnoGol hoy?

> Fuentes: doc1 (problema/mercado), doc2 (teardown ATC), doc4 (pricing), código real del repo (features verificadas). Fecha: julio 2026.

## Veredicto en una línea

**TurnoGol es vendible cara a cara, con el argumento de la plata (clavos y caja), a complejos de 3-6 canchas. No es vendible todavía por canales fríos masivos, y no compite aún donde ATC es fuerte (marketplace de jugadores).**

## Score honesto por dimensión

| Dimensión | Score | Por qué |
|---|---|---|
| Dolor del cliente | 8/10 | Real y cuantificable: clavos ($64-128k/mes perdidos en un complejo de 4 canchas según doc1 — ⚠️ HIPÓTESIS interna, validar con cada dueño), teléfono que no para, caja a ojo, abonados que deben. |
| Urgencia de compra | 4/10 | El dolor está **tolerado**. WhatsApp + cuaderno "funciona". El competidor #1 no es ATC: es el status quo. Nadie se levanta un lunes diciendo "hoy contrato un software de canchas". |
| Producto | 7/10 | Superficie competitiva real (ver lista abajo). Falta: aviso por WhatsApp al jugador, cobro automático de abonados, marketplace con tráfico. Onboarding <20 min es diferencial real vs 1-7 días de ATC. |
| Distribución | 1/10 | Cero marca, cero clientes, cero casos de éxito, cero red de jugadores. Todo por construir. Acá está el riesgo de muerte del proyecto, no en el código. |
| Moat | 2/10 | Nada impide que ATC copie features. El único moat temprano posible: densidad local (todos los complejos de una zona) + relación directa con dueños. |
| Pricing | 7/10 | Modelo validado por ATC (nadie que educar). Predio $55.000 vs ATC Base $60.500 (dato Q1 2025 — **verificar precio actual de ATC antes de usarlo en una venta**, con la inflación seguro cambió). +IVA 21% en checkout: decilo antes de que lo descubra en el checkout. |

## Lo que juega a favor (real, verificado en código)

✅ FIRME — esto existe y funciona hoy:

- **Reserva online por link** (`turnogol.app/[slug]`): el jugador no baja ninguna app, entra por link web. Mata la objeción "mis clientes no van a usar una app".
- **Seña por MercadoPago directo a la cuenta MP del complejo** (OAuth): TurnoGol no toca la plata. Porcentaje configurable, se puede apagar. Si el jugador no paga en minutos, el turno se libera solo.
- **No-show con castigo automático**: si te clavan, la seña queda para el complejo. Y al reincidente (2da ausencia en 90 días) el sistema le bloquea solo las reservas online en ese complejo por 14 días. **NO hay deuda de dinero por no-show** (modelo revertido 2026-07-11): el único costo para el jugador es la seña + el bloqueo.
- **Grilla en tiempo real, mobile-first**: la reserva entra y la ve el dueño desde el celu, esté donde esté. Push notification con cada reserva (con horario silencioso: de madrugada no suena, avisa a las 8).
- **Caja completa**: ingresos, gastos, cantina con stock y alertas, cierre diario. ATC no tiene gastos (doc2).
- **Abonados (turnos fijos)**: se generan solos cada semana, precio por sesión, control de quién pagó cada sesión. **OJO: el cobro es registrado a mano por el dueño, NO es débito automático — no prometer cobro automático. NO existe saldo a favor ni ledger de deudas** (eliminado, modelo ATC descartado).
- **Módulo Jugadores**: ficha de cada cliente del complejo con historial, stats, sus abonados y el indicador de bloqueo por ausencias.
- **Día operativo**: los turnos de madrugada (00:00-02:00) cuentan para la caja de la noche anterior. Detalle que las turneras genéricas no entienden y los complejos que cierran tarde sufren.
- **Onboarding self-service ~15-20 min** + trial 30 días sin tarjeta (ya construido en el producto).
- **Métricas**: dashboard con caja, ocupación, KPIs.

## Lo que juega en contra (no edulcorar)

1. **Cero prueba social.** Las primeras 20 ventas se hacen sin poder decir "lo usan X complejos". La respuesta honesta es "estás entrando primero, por eso te doy precio fundador y mi celular directo" — y a muchos no les va a alcanzar.
2. **ATC tiene el marketplace.** Un complejo que recibe demanda desde la app de ATC no puede reemplazar eso con TurnoGol hoy. **No pelear por esos clientes en los primeros 90 días.**
3. **Fútbol-only excluye complejos mixtos.** El pádel explotó en Argentina; un complejo con 4 de fútbol y 3 de pádel no puede gestionar la mitad de sus canchas con TurnoGol. Fuera del ICP inicial (ver [02-icp.md](./02-icp.md)).
4. **La seña exige que el complejo quiera cobrar seña.** Hay dueños que creen que la seña espanta clientes. El producto lo resuelve (es opcional y configurable) pero el argumento estrella se debilita con ellos. ⚠️ HIPÓTESIS a medir: % de dueños que rechazan la seña por principio.
5. **Sin WhatsApp automático al jugador** (v1 es email + push al admin). En Argentina el dueño va a preguntar por WhatsApp sí o sí. Respuesta honesta preparada en [07-objeciones.md](./07-objeciones.md).
6. **Founder solo.** Cada piloto son horas tuyas de carga y soporte. Más de 5 pilotos simultáneos y se degrada todo. El plan ([08](./08-plan-7-30-90.md)) respeta ese límite.
7. **SaaS en ARS con inflación**: el precio hay que tocarlo cada 3-6 meses (doc4 §5) y cada aumento es una conversación de retención.

## Los 3 errores que matan el proyecto (evitarlos > cualquier táctica)

1. **Vender a quien no va a activar.** Un dueño que paga pero cuyos jugadores nunca usan el link es churn seguro a 60 días. La activación (primera reserva online) es parte de la venta, no del soporte. Por eso el piloto incluye kit de lanzamiento obligatorio ([04](./04-oferta-piloto.md)).
2. **Prometer el futuro.** "Ya viene WhatsApp", "pronto cobro automático de abonados", "te vamos a traer jugadores". Cada una compra hoy y churnea mañana. Lista prohibida en [10-playbook-ia.md](./10-playbook-ia.md).
3. **Esconderse detrás del contenido/ads.** Postear es cómodo, prospectar incomoda. Si una semana tiene 10 posts y 0 conversaciones con dueños, la semana fue un fracaso.

## Conclusión operativa

- El wedge de venta es **la plata, no la tecnología**: "los clavos te cuestan $X por mes; con la seña, si te clavan, la seña queda para vos". Mecánico, verificable, sin prometer porcentajes inventados.
- El canal es **founder-led, hiperlocal, presencial**: WhatsApp/IG para abrir puerta, visita al complejo para cerrar.
- La meta de los primeros 90 días **no es 100 clientes**: es una máquina calibrada (mensajes que responden, demo que convierte, piloto que activa). 100 pagos realistas: 12-18 meses si la máquina funciona. ⚠️ HIPÓTESIS — se recalibra con las tasas reales del primer mes.
