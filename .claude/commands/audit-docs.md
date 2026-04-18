Vas a ejecutar una auditoría forense completa de la documentación de TurnoGol.

## Contexto

TurnoGol es un SaaS B2B de gestión para complejos de fútbol en Argentina. Los 20 documentos en /docs/ cubren desde el problema de negocio hasta el runbook operativo. Esta auditoría es la última instancia antes de pasar a desarrollo. Si algo está mal, prefiero saberlo ahora que rehacer código después.

## Fase 1 — Lectura completa (NO escribas nada todavía)

1. Leé TODOS los archivos en /docs/ en orden numérico (doc1 a doc20)
2. Construí un modelo mental completo del producto
3. NO opines hasta haber leído todo — la auditoría parcial es peor que ninguna

## Fase 2 — Análisis por dimensión

Generá UN solo archivo: `docs/audit_report.md` con estas secciones:

### 1. CONSISTENCIA INTERNA
Contradicciones entre documentos. Para cada hallazgo:
- [DOC-X vs DOC-Y] — cita textual de cada doc — descripción del conflicto

### 2. LÓGICA DE NEGOCIO
Flujos que no cierran, edge cases sin cubrir, state machines con transiciones faltantes.
Severidad: BLOQUEANTE / ALTA / MEDIA / BAJA

### 3. VIABILIDAD TÉCNICA PARA V1
¿Hay algo over-engineered para un equipo de 1-3 personas? ¿Qué simplificarías?

### 4. GAPS DE ESPECIFICACIÓN
Cosas mencionadas pero nunca detalladas. Cosas necesarias para codear que no aparecen.

### 5. RIESGOS ESPECÍFICOS DE ARGENTINA
Inflación vs precios fijos, MercadoPago quirks, WhatsApp API limits, tech literacy de los dueños.

### 6. TABLA MAESTRA DE ISSUES
| ID | Doc(s) | Descripción | Severidad | Acción recomendada (1 línea) |

### 7. VEREDICTO
- ¿Esta documentación está lista para codear? SÍ o NO.
- Si NO: top 5 correcciones ordenadas por impacto antes de empezar.
- Si SÍ: top 5 riesgos a vigilar durante el desarrollo.

## Reglas

- Citá textualmente cuando encuentres un problema. No parafrases.
- No elogies. Tu trabajo es encontrar problemas, no validar.
- Si algo no está documentado en ningún doc, es un GAP — no lo inventes.
- Preferí marcar de más que dejar pasar algo. Falso positivo > falso negativo.
- El "abonado" NO es una persona separada (ya corregido en doc3). Es un modo del jugador.

$ARGUMENTS
