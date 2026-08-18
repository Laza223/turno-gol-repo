/**
 * Id de form deliberadamente inexistente, para desasociar un grupo de Radix del
 * `<form>` que lo contiene.
 *
 * El problema: `@radix-ui/react-radio-group` le cuelga un listener del evento
 * `reset` al form contenedor y, cuando se dispara, vuelve el valor del grupo al
 * que tenía AL MONTAR — `initialValueRef`, capturado una sola vez
 * (`node_modules/@radix-ui/react-radio-group/dist/index.mjs`, `RadioGroup`):
 *
 *     const initialValueRef = React.useRef(value)
 *     const reset = () => setValue(initialValueRef.current)
 *     associatedForm.addEventListener('reset', reset)
 *
 * React 19 resetea el `<form action={serverAction}>` automáticamente cuando la
 * action termina. Como el grupo es CONTROLADO, ese `setValue` es una llamada a
 * `onValueChange` → le pisa el estado al componente padre con el valor viejo.
 * En un form de configuración eso se ve como "no se guardó": el dueño elegía
 * "Requerir seña" en `/settings/reservas`, la action guardaba bien, y el form
 * volvía solo a "Sin seña" (bug reproducido en producción el 2026-08-18).
 *
 * Por qué desasociar es la verdad y no un parche: estos grupos NO son controles
 * nativos. El valor viaja al submit en un `<input type="hidden">` explícito que
 * pone cada consumidor; el input que Radix inyecta (`BubbleInput`) no se usa
 * para nada. Radix solo se cuelga del form porque DETECTA un form ancestro
 * (`control.closest('form')`); pasarle `form` con un id que no resuelve a un
 * `<form>` le dice que no pertenece a ninguno, y con eso no registra el
 * listener ni cuelga su input del submit.
 */
export const RADIX_DETACHED_FORM_ID = 'radix-detached-no-form'
