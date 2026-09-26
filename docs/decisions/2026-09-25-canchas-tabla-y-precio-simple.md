# Canchas: la lista pasa a tabla y el precio se carga con dos preguntas

**Fecha**: 2026-09-25 · **Estado**: implementada en `claude/refine-canchas-design-53400e`, sin commitear ·
**Decide**: el dueño (variante, alcance, aviso de pausa) + esta sesión (cómo)

## Origen

Registrado en `docs/gtm/ejecucion/10-aprendizajes.md` (2026-09-25). En el alta de El Vagón configurar
las canchas costó mucho y el founder tuvo que meterse. Lo que nadie entendió:

- **Las franjas horarias.** La plantilla rápida pedía elegir un modo ("Un precio" / "Día y noche" / "Por
  día"), cargar los precios y recién ahí tocar "Aplicar a toda la semana". Si no se aplicaba, no quedaba
  nada.
- **"Copiar precios de otra cancha".** Era un selector con un botón "Copiar", y no decía qué precio se
  copiaba.

Además, la vista tenía mucho ruido visual: un aviso de fotos arriba, tarjetas con cinco líneas por cancha
y dos maneras de decir el estado.

No hay `audit_logs` de cambios de canchas. La frecuencia sale de la evidencia que sí hay: se configura
en el alta (paso 3 del onboarding) y cuando algo se rompe, y ninguna cancha tiene foto. Por eso el orden
fue:

1. Cargar el precio sin ayuda.
2. Leer de un vistazo qué ve el jugador.
3. Pausar.
4. Las fotos.

## Qué se decide

Se eligió entre tres variantes, con láminas a 1280×650 y a 390 px, en claro y oscuro, con 2 y con
8 canchas. El dueño eligió **"la tabla de B con el editor de A"**.

1. **La lista es una tabla**, con una fila por cancha:
   - Miniatura y nombre.
   - El precio del turno en una línea ("$ 60.000 hasta las 18:00 · $ 84.000 desde las 18:00").
   - "En tu perfil", con el badge y lo que ve el jugador.
   - "Pausar"/"Reactivar" y "Editar".

   El precio y el hueco "Sin foto" abren el editor en su lugar. Cada fila mide 65 px (93 px la de una
   cancha que cobra distinto algún día): a 1280×650, con 8 canchas, la tabla termina en 756 px y las
   dos últimas quedan a un scroll corto.

2. **El editor es una página** en lugar de la lista: volver a "Canchas", la cancha como título, tres
   secciones y "Guardar" pegado al pie.
3. **El precio se carga con dos preguntas por sí o no**:
   - "¿Cobrás distinto a la noche?", con "desde las".
   - "¿Algún día cobrás distinto?", con los días en chips.

   Son hasta cuatro precios. Lo que se tipea ya vale: no hay "Aplicar". Debajo va **"Así queda la
   semana"**, una barra por día con cada tramo teñido según el precio y lo que falta en ámbar.

4. **"Igual que Cancha 1 y Cancha 2"** reemplaza al selector de copiar. Las canchas que cobran igual son
   una sola opción, cada una con su precio escrito, y la opción queda marcada mientras coincide.
5. **"Ajustar hora por hora"** es la grilla día × hora de siempre, plegada. Si lo cargado no entra en las
   dos preguntas (tres franjas en el día, cortes distintos según el día, más de dos grupos de días), las
   preguntas no se muestran. Se ve "se ajusta hora por hora" y un botón explícito "Pasar a un precio
   simple", que deja un solo precio y ofrece "Deshacer" (nada se guarda hasta "Guardar", pero la vuelta
   atrás no puede ser cancelar todo el form). Nunca se reescribe un precio en silencio:
   `readSimplePricing` vuelve a armar la grilla y la compara celda por celda.

   "¿Algún día cobrás distinto?" propone viernes a domingo, pero siempre deja al menos un día con el
   precio de siempre (un complejo que abre solo el fin de semana arranca con su último día como el
   distinto). Con un solo día abierto, la pregunta no aparece.

6. **Pausar no menciona la cuota** (decisión del dueño: "si quieren bajar una cancha van a facturación y
   listo"). El diálogo dice qué deja de pasar y lista los turnos por delante y los fijos. El aviso de
   facturación al **reactivar** por encima de las canchas facturadas no cambia: ni su copy ni cuándo
   aparece.

## Qué NO cambia

- **El formato de precios.** Sigue siendo JSONB con cortes horarios y un precio por franja. Las
  preguntas escriben la misma grilla día × hora, y esa grilla se comprime con `compressGridToRules` como
  antes. Los otros dos puntos acoplados al formato no se tocaron.
- **Server Actions, consultas y schema.** No se tocaron.
- **El gate de guardado.** Sin precio en alguna hora no se guarda, y el mensaje dice cuántas faltan.
- **El auto-relleno al abrir.** Una cancha vieja con huecos arranca completa, con aviso.

## Qué se va

`PricingSection` (la plantilla con "Aplicar" y el selector de copiar), reemplazada por
`price-setup/PriceSetup`. También se va el aviso "Ninguna de tus canchas tiene foto" de arriba de la
lista: lo reemplaza el hueco "Sin foto" de cada fila.

## Verificación

- Tests unitarios del modelo de precio simple (`tests/unit/price-model.test.ts`: ida y vuelta por el
  formato que se guarda, y los casos que tienen que quedar hora por hora) y del editor
  (`tests/unit/pricing-grid-render.test.tsx`).
- Stories con `play` en claro y oscuro.
- Capturas de la app real (dev local, complejo demo con el horario de El Vagón), con 2 y con 8 canchas,
  a 1280×650 y a 390 px, en claro y oscuro.
- La foto de regresión `admin-canchas.png` cambia a propósito y se regenera con `visual-baseline.yml`.
