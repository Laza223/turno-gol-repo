/**
 * Barrel de fixtures deterministas para Storybook. Todo lo que exportan estos
 * módulos son FUNCIONES (nunca objetos compartidos a nivel de módulo) —
 * llamarlas de nuevo en cada story para tener una copia fresca.
 */
export * from './ids'
export * from './clock'
export * from './tenant'
export * from './court'
export * from './player'
export * from './staff'
export * from './booking'
export * from './abonado'
export * from './cashflow'
export * from './metrics'
