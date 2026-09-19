# Tablero de hipótesis

> Se actualiza los viernes y cuando una evidencia mueve algo. Una hipótesis cambia de estado **solo** con una entrada en [`10-aprendizajes.md`](10-aprendizajes.md). Evidencia siempre con `(fecha, fuente)`. Recordar: un conteo real es FACT; la generalización al mercado sigue siendo HYPOTHESIS hasta que la decisión se tome con ese riesgo explícito.

## Wedges A / B / C / D — conteo de `dolor_principal` sin inducir

| Wedge | Definición | Nombrado 1.º (n) | Fuentes | Estado |
|---|---|---|---|---|
| **A** seña / colgados | "que no me cuelguen el turno" | 0 | | abierta |
| **B** plata / caja | "saber cuánto entró, quién debe" | 0 | | abierta |
| **C** control / encargado | "que funcione cuando no estoy" | 0 | | abierta |
| **D** fijos | "los de siempre: quién pagó, qué pasa si cancelan" | 0 | (DEMO-1, DEMO-2 preguntaron por fijos y cancelaciones — SIGNAL, inducción desconocida) | abierta, **puerta provisional (D2)** |
| **E** otro | | 0 | | |
| **X** ocupación | "llenar la cancha" | 0 | | |

**Regla de decisión (D2):** con 10 entrevistas no inducidas, si 3 de 5 nombran A antes que B/C/D, la puerta vuelve a A. Si E supera a todos, se abre un wedge nuevo. Si D/B/C suman ≥6 de 10, D2 se confirma provisionalmente (sigue siendo HYPOTHESIS sobre el mercado hasta que alguien pague).

## H1 — El dolor #1 es control (fijos/caja/encargado), no ocupación ni no-shows

| | |
|---|---|
| Estado | ABIERTA |
| Evidencia a favor | (2026-08, DEMO-1/2) preguntaron primero por fijos y cancelaciones — SIGNAL · (2026-07, dueño) "cierre de caja FUNDAMENTAL" — FACT de declaración · (2026-09-01, founder) "pagan empleados y aun así hay errores" — SIGNAL |
| Evidencia en contra | (2026-07, red team) interés espontáneo en grilla/control pero también en "me trae clientes" — SIGNAL |
| Umbral confirma | 6 de 10 entrevistas no inducidas nombran D/B/C primero |
| Umbral mata | 3 de 5 nombran A o X primero |
| Quién decide | Lazar, al D10 o el 2026-10-02 |

## H2 — La seña al ~10% enmarcada como compromiso la aceptan dueños y jugadores

| | |
|---|---|
| Estado | ABIERTA |
| Evidencia a favor | — |
| Evidencia en contra | (2026-08, DEMO-1) rechazo cultural al pago anticipado por MP, al 30% y sin encuadre — SIGNAL |
| Umbral confirma | ≥50% de los pilotos la prenden solos en 30 días; abandono en checkout con seña ≤ sin seña + 10 puntos |
| Umbral mata | 3 de 4 dueños la rechazan aun al 10% con encuadre "la parte de uno" |
| Quién decide | Lazar; afecta si "la plata va directo a tu MP" sigue siendo argumento |

## H3 — Los dueños se refieren entre sí por WhatsApp (loop principal de adquisición)

| | |
|---|---|
| Estado | ABIERTA |
| Evidencia a favor | (2026-09-01, founder) "se conocen, tienen grupos, coordinan precios" — HYPOTHESIS (sin registro) |
| Evidencia en contra | — |
| Umbral confirma | ≥1 grupo identificado + ≥1 reenvío hecho + ≥1 contacto "me lo pasó X" en 30 días |
| Umbral mata | P1 y ≥5 discovery dicen que no están en ningún grupo / no reenviarían |
| Quién decide | Lazar, 2026-10-02; define si referidos (D8) se opera o pasa a accesorio |

## H4 — El ICP 4-6 tiene masa en el corredor

| | |
|---|---|
| Estado | ABIERTA |
| Evidencia | (2026-09-01, teardown) Luján/Mercedes/Pilar sin cobertura en ATC ni hayPartido — FACT · red team: 16 complejos en Maps en Luján (jul-2026) — FACT sin desagregar por tamaño |
| Umbral confirma | ≥15 complejos con score ≥10 a ≤40 min |
| Umbral mata | <8 → ampliar a 3-6 o a otra zona |
| Quién decide | Lazar, con la lista (acción 5) |

## Hipótesis de precio (no numeradas: se resuelven con ofertas escritas y pagos reales; Van Westendorp descartado el 2026-09-17)

- HP1: $99.000 para 4-6 canchas se percibe como "menos de dos turnos". — abierta.
- HP2: el salto 3→4 (+57%) se percibe como injusto. — abierta.
- HP3: 1-2 canchas no es mercado para TurnoGol a $63.000. — abierta (no se prospecta; se registra si aparece).
- HP4 (2026-09-15, método cambiado el 2026-09-17): el precio lineal de $47.000 la primera cancha + $30.000 por cada extra ($137k-$197k a 4-6 canchas) se paga en el ICP. — abierta.
  - **Método:** preferencia revelada. Solo cuentan pagos y firmas con fecha sobre ofertas escritas. Van Westendorp queda descartado por decisión del founder.
  - **Evidencia:** (2026-09-17, prod) a la facturación medida de P-Vagón, $167k son ~0,9% de lo que entra y ~3× el valor central estimado — SIGNAL de que el complejo puede pagarlo, no de que lo vaya a pagar. Modelo y supuestos en [board §7](../board/2026-09-15-precio-por-cancha.md).
  - **Evidencia** (2026-09-17, founder + mercado): con el ticket promedio de Luján ($5.000 por jugador, contra los $6.000 de P-Vagón que es el más caro), un complejo promedio factura ~$3,2M por cancha, así que la lista queda en 1,0-1,1% de lo que factura en todos los tamaños — el techo de lo cómodo, no debajo. Segunda pasada del board en [§8](../board/2026-09-15-precio-por-cancha.md).
  - **Umbral confirma** (propuesto, a confirmar): al 2026-12-15, al menos 2 pagos a lista con como mucho 1 venta perdida por precio puro. P-Vagón puede ser uno. El anual prepago cuenta al pagarse; el mensual, en su primer cobro.
  - **Umbral mata** (propuesto, a confirmar): 3 o más ventas perdidas por precio puro, con la definición estricta de board §7.7 C, en 8 ofertas escritas o menos. Fallback: misma estructura a $35.000 + $16.000.
  - **Sin veredicto:** menos de 5 ofertas escritas al 2026-12-15. Es volumen y no precio; se extiende un mes.
  - **Puntos de control:** 2026-10-02 (cantidad de ofertas, junto con D3) · 2026-10-14 (oferta a P-Vagón) · 2026-10-31 (vence la preventa del anual de P-Vagón) · 2026-12-15 (veredicto).
  - **Si se confirma:** se implementa con el contrato de [board §5](../board/2026-09-15-precio-por-cancha.md), y resuelve HP2 de paso.

## Cerradas

| Hipótesis | Cerrada el | Cómo | Entrada en aprendizajes |
|---|---|---|---|
| — | | | |
