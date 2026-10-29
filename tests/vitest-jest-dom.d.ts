import 'vitest'

// Vitest 5 trae sus propios tipos de matchers de browser mode
// (`@vitest/browser/jest-dom`), donde `toHaveTextContent` es de igualdad exacta y
// ya no acepta RegExp (para eso está `toMatchTextContent`, solo browser mode).
// Los tests unit corren con `@testing-library/jest-dom/vitest` (setup.ts), cuyo
// `toHaveTextContent` sí acepta RegExp, pero jest-dom 7 todavía augmenta la forma
// vieja `Assertion<T>` y esa firma no llega a la `Assertion<R, T>` de Vitest 5.
declare module 'vitest' {
  interface Assertion<R, T> {
    // `this` tipado solo para usar `T`: el merge de interfaces exige repetir los
    // dos type params y el lint no admite uno sin usar.
    toHaveTextContent(
      this: Assertion<R, T>,
      text: RegExp | string,
      options?: { normalizeWhitespace: boolean },
    ): R
  }
}
