# 05 — Funnel completo: de lista fría a cliente pago

## Etapas (definiciones exactas — sin esto el CRM es humo)

| # | Etapa | Definición de entrada | Acción siguiente | Doc de apoyo |
|---|---|---|---|---|
| 0 | **Lista** | Complejo scoreado ≥6 en [02-icp.md](./02-icp.md) | Primer mensaje WA/IG o visita | [06 §1-3](./06-scripts.md) |
| 1 | **Contactado** | Primer mensaje enviado | Esperar 48h → follow-up | [06 §6](./06-scripts.md) |
| 2 | **Respondió** | Cualquier respuesta humana | Charla de dolor (5 preguntas) | [06 §4](./06-scripts.md) |
| 3 | **Charla de dolor** | Contó cómo maneja los turnos hoy | Proponer demo presencial | [06 §4](./06-scripts.md) |
| 4 | **Demo agendada** | Día + hora confirmados | Brief pre-demo + confirmación mismo día | [06 §5, §7](./06-scripts.md) |
| 5 | **Demo hecha** | Vio el producto (ideal: con SUS canchas cargadas) | Cierre de piloto en la misma demo | [04](./04-oferta-piloto.md) |
| 6 | **Piloto activo** | Wizard completo + MP conectado + link en bio | Seguimiento activación día 3/7/14/21 | [04](./04-oferta-piloto.md) |
| 7 | **Activado** | ⭐ Primera reserva online con seña (Aha) | Empujar hacia el número de éxito acordado | [04](./04-oferta-piloto.md) |
| 8 | **PAGO** | Suscripción cobrada | Pedir referido + caso de éxito | [06 §8](./06-scripts.md), [09](./09-contenido.md) |
| 9 | **Referidor** | Dio ≥1 contacto de otro dueño | Contactar mencionándolo | [06 §8](./06-scripts.md) |

**Estados de salida** (registrar SIEMPRE el motivo): `no-respondió` (re-contactar en 30 días), `no-ICP` (pádel, feliz con ATC — anotar para año 2), `no-ahora` (re-contactar con fecha), `piloto-muerto` (motivo del kill), `perdido-precio`, `perdido-otro`.

## Tasas esperadas — ⚠️ TODAS HIPÓTESIS hasta el primer mes de datos

| Paso | Tasa hipótesis | Con 100 contactados |
|---|---|---|
| Contactado → Respondió (WA/IG frío) | 25-35% | 30 |
| Respondió → Charla de dolor | 50% | 15 |
| Charla → Demo hecha | 50% | 7-8 |
| Demo → Piloto | 50% (la oferta [04] está diseñada para esto) | 4 |
| Piloto → Activado | 60-70% (con kit y setup done-for-you) | 3 |
| Activado → Pago | 60-70% | 2 |

**Lectura honesta: ~2 pagos por cada 100 contactos fríos.** Para 100 clientes eso serían ~5.000 contactos — inviable solo a pulso. La máquina se salva con: (a) visitas presenciales, que convierten varias veces más que el DM frío — ⚠️ HIPÓTESIS, medir por canal; (b) referidos, que se saltan las etapas 0-3; (c) densidad local (el complejo de la vuelta "ya lo usa el de tal lado"). **Por eso: cada pago DEBE producir un pedido de referido y un caso de éxito.**

## CRM mínimo (Google Sheet — no comprar herramientas)

Una fila por complejo. Columnas:

```
nombre | zona | canchas | score_icp | ig | telefono | canal_1er_contacto |
etapa | fecha_ultimo_toque | proxima_accion | fecha_proxima_accion |
dolor_principal (clavos/telefono/caja/abonados) | objecion_principal |
motivo_salida | referido_por | notas
```

Reglas:
- **Ninguna fila sin `proxima_accion` + fecha.** Un prospecto sin próxima acción es un prospecto perdido.
- Viernes: contar filas por etapa → tabla semanal de [08](./08-plan-7-30-90.md).
- `dolor_principal` y `objecion_principal` alimentan la calibración de [03](./03-posicionamiento.md) y [07](./07-objeciones.md).

## Cadencia operativa

- **20 contactos nuevos por semana** (4/día ma-vi). Menos que eso, el funnel se seca en 3 semanas.
- **Follow-up automático de agenda**: +2 días, +5 días, +12 días, luego break-up ([06 §6](./06-scripts.md)). El 80% de las respuestas llegan en los follow-ups, no en el primer mensaje. ⚠️ HIPÓTESIS.
- **Demos: presencial en el complejo siempre que se pueda.** Mejor horario de visita/llamada: 14:00-17:00 (complejo tranquilo, dueño presente antes del pico nocturno). ⚠️ HIPÓTESIS — validar y anotar el horario real de respuesta de la zona.
- **Demo con SUS datos**: antes de cada demo, cargar un tenant con las canchas/precios reales del complejo (sacados de su IG o de la charla). Ver el propio complejo funcionando vende más que cualquier slide. Costo: 20 min. Hacerlo SIEMPRE que la demo esté confirmada.

## El truco de la grilla viva (para pilotos)

Un piloto con grilla vacía parece muerto y el dueño no vuelve a entrar. En el setup, cargar como reservas manuales los turnos ya tomados del cuaderno de esa semana + los fijos. La grilla arranca llena → el sistema "ya es" el sistema del complejo desde el día 1. ✅ FIRME (reserva manual y abonados existen en el producto).
