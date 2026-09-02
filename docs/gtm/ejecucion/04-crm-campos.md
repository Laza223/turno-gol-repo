# CRM: columnas y enums

> Google Sheet, una fila por complejo. Export CSV a `docs/gtm/data/crm.csv` (fuera de git). Regla: **ninguna fila sin `proxima_accion` + `fecha_proxima`**. Los teléfonos, nombres de dueños y montos viven solo en el Sheet.

## Encabezado CSV (copiar tal cual)

```
id,complejo,zona,canchas,futbol_puro,cierra_tarde,ig_activo,gestion_manual,demanda_alta,distancia_min,score_icp,dueno_presente,canal_1er_contacto,fecha_1er_contacto,etapa,fecha_ultimo_toque,proxima_accion,fecha_proxima,dolor_principal,dolor_secundario,fijos_n,colgados_sem,objecion_principal,precio_comunicado,precio_reaccion,vw_barato,vw_ganga,vw_caro,vw_demasiado,sena_reaccion,grupo_wa,referido_por,reenvio,motivo_salida,inducida,notas
```

## Campos

| Campo | Tipo / enum | Nota |
|---|---|---|
| `id` | `P1`, `D01`… `Dnn`, `L001`… (lista sin contactar) | Identificador anonimizado para citar en git |
| `complejo`, `zona` | texto | Solo en el Sheet |
| `canchas` | entero | Exactas; contar en Maps si no se sabe |
| `futbol_puro` | `si` / `no` / `mixto-menor` | mixto-menor = pádel ≤1 cancha |
| `cierra_tarde` | `si` / `no` / `?` | pasada la medianoche |
| `ig_activo` | `si` / `no` | posteó en 15 días |
| `gestion_manual` | `si` / `no` / `sistema:<cual>` | bio "reservas por WhatsApp", pizarra, etc. |
| `demanda_alta` | `si` / `no` / `?` | finde lleno, "se liberó cancha" |
| `distancia_min` | entero | minutos desde Luján |
| `score_icp` | 0-14 | según [`05-scorecard-icp.md`](05-scorecard-icp.md) |
| `dueno_presente` | `si` / `no` / `?` | |
| `canal_1er_contacto` | `wa` / `ig` / `visita` / `referido` / `conocido` / `llamada` | |
| `etapa` | `lista` · `contactado` · `respondio` · `charla` · `demo-agendada` · `demo-hecha` · `piloto-activo` · `activado-A1` · `activado-A2` · `pago` · `referidor` · `salida` | Definiciones en [GTM 05](../05-funnel.md) + A1/A2 |
| `proxima_accion`, `fecha_proxima` | texto, fecha | Obligatorios |
| `dolor_principal` | `A` seña/colgados · `B` plata/caja · `C` control/encargado · `D` fijos · `E` otro · `X` ocupación | Lo primero que nombró sin inducir |
| `dolor_secundario` | ídem | |
| `fijos_n` | entero | equipos con turno fijo |
| `colgados_sem` | entero | turnos colgados por semana que declaró |
| `objecion_principal` | `precio` · `tiempo` · `sena-cultural` · `empleado` · `socio` · `atc` · `datos` · `confianza-continuidad` · `no-necesito` · `otra:<txt>` | La nueva `confianza-continuidad` = "¿vas a estar?" |
| `precio_comunicado` | `si` / `no` | y cuál (monto en notas) |
| `precio_reaccion` | `acepta` · `duda` · `caro` · `no-dijo` | + textual en notas |
| `vw_*` | 4 enteros (ARS) | Van Westendorp; vacío si no se preguntó |
| `sena_reaccion` | `no-menciono` · `rechaza` · `acepta-chica` · `ya-cobra` · `quiere-30` | + textual en notas |
| `grupo_wa` | `si:<n>` / `no` / `?` | grupos de dueños |
| `referido_por` | id | quién lo trajo |
| `reenvio` | `si` / `no` / `?` | ¿reenvió el caso/mensaje? |
| `motivo_salida` | `no-respondio` · `no-icp` · `no-ahora` · `piloto-muerto:<motivo>` · `perdido-precio` · `perdido-otro:<txt>` | |
| `inducida` | `si` / `no` | ver [`03`](03-plantilla-entrevista-discovery.md) |
| `notas` | texto | Textuales; lo sensible solo acá |

## Resumen semanal (una fila por viernes, pestaña aparte)

```
semana,contactados,respondieron,charlas,demos_agendadas,demos_hechas,pilotos_nuevos,A1,A2,pagos,kills(motivo),objecion_top,dolor_top,referidos_pedidos,referidos_recibidos,horas
```

Ese resumen es lo que se copia (sin nombres) al panel [`00-README.md`](00-README.md).
