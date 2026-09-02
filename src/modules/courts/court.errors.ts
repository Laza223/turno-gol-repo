export class CourtPhotoLimitError extends Error {
  name = 'CourtPhotoLimitError'
  constructor(max: number) {
    super(`No se pueden cargar más de ${max} fotos por cancha`)
  }
}

export class CourtPhotoOrderMismatchError extends Error {
  name = 'CourtPhotoOrderMismatchError'
  constructor() {
    super('El nuevo orden no coincide con las fotos existentes')
  }
}
