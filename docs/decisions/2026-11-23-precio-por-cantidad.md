# Tarifa por cantidad exacta de canchas

**23 de noviembre de 2026.** Decisión de Lazar. TurnoGol aplica una lista mensual por predio y un descuento del 20% por 12 meses prepagados. El alcance inicial es precio y facturación. La prueba y sus permisos conservan el comportamiento vigente.

| Canchas simultáneas | Gestión por mes | Asistente por mes |
| ---: | ---: | ---: |
| 1 | $45.000 | $25.000 |
| 2 | $65.000 | $25.000 |
| 3 | $80.000 | $35.000 |
| 4 | $95.000 | $35.000 |
| 5 | $110.000 | $35.000 |
| 6 | $125.000 | $45.000 |
| 7 | $135.000 | $45.000 |
| 8 o más | Cotización | Venta pendiente de Kapso |

El cobro de Plus queda en El Vagón por ahora. Con cinco canchas y bot son $145.000 al mes o $1.392.000 por 12 meses, según el ciclo de su mandato. El acceso y facturación de Meta para las demás sedes se habilitan cuando se complete el circuito de Kapso.

Se cuenta por capacidad simultánea al configurar la grilla. Dos F5 que forman una F7 cuentan dos. Los formatos que comparten superficie se operan en una configuración compatible hasta que la grilla pueda representar esos solapamientos.

## Publicación

1. Aplicar la migración 117 con el proceso de migraciones del repo. Agrega el nuevo catálogo inactivo. Verificar que el único catálogo activo siga siendo `turnogol`.
2. Desplegar la web y el worker que leen el catálogo asignado a cada mandato. Verificar que ambas versiones se encuentren en ejecución y que las suscripciones vigentes y las señas conserven sus circuitos.
3. Después del OK de Lazar en producción, activar el catálogo desde una transacción administrativa. El cambio habilita la web y los nuevos checkouts a la vez. Las suscripciones existentes conservan su `plan_id`.

```sql
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'turnogol-por-cantidad') THEN
    RAISE EXCEPTION 'Falta el catálogo de la migración 117';
  END IF;
END $$;

UPDATE plans
SET is_active = (slug = 'turnogol-por-cantidad')
WHERE slug IN ('turnogol', 'turnogol-por-cantidad');

COMMIT;
```

4. Comprobar en `/precios` que cinco canchas muestran $110.000 al mes y $1.056.000 en un pago anual. Probar un checkout de test antes de tomar un débito real.
5. Revisar El Vagón en Superadmin y Mercado Pago. Confirmar canchas, ciclo, bot y fecha del próximo débito. En **Acciones → Aplicar tarifa de lista**, verificar el importe de la confirmación. Si el mandato difiere del importe registrado o no tiene próxima fecha futura, la acción se detiene para revisión. Después de aplicar, comparar el importe remoto y el local. El script histórico de baja lineal sigue reservado a esa migración anterior.
6. Para 8+, acordar el precio por WhatsApp y guardarlo desde las acciones del complejo en prueba o en el plan gratis, sin un mandato previo, antes de que el dueño cree su checkout. La cotización guarda cantidad, precio y ciclo anual disponible con la misma bonificación. Si cambia la cantidad antes del pago, emitir una nueva cotización.

Para detener nuevas altas con la lista nueva, invertir la selección de catálogo en la misma transacción con la web y el worker compatibles en ejecución. Los mandatos ya registrados conservan la tarifa acordada. Antes de desplegar un runtime anterior, inventariar suscripciones que ya referencien el catálogo nuevo o cotizaciones y mantener un reconciliador compatible mientras sigan vigentes.
