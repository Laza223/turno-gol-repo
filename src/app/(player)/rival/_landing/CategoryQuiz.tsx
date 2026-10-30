'use client'

import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { cssVars } from './css-vars'
import s from './landing.module.css'
import {
  QUIZ_BACKGROUNDS,
  QUIZ_FREQUENCIES,
  QUIZ_POSITIONS,
  startingCategory,
  type Category,
} from './quiz-table'
import { StatusChip } from './StatusChip'
import './quiz-transition.css'

interface Answers {
  frequency: number | null
  background: number | null
  position: number | null
}

const EMPTY: Answers = { frequency: null, background: null, position: null }

function resultOf(a: Answers): Category | null {
  if (a.frequency === null || a.background === null || a.position === null) return null
  return startingCategory(a.background, a.frequency)
}

/** Cambia el contenido con una View Transition; sin soporte o con movimiento reducido, al instante. */
function swap(update: () => void): Promise<void> {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof document.startViewTransition !== 'function' || calm) {
    update()
    return Promise.resolve()
  }
  return document
    .startViewTransition(() => flushSync(update))
    .updateCallbackDone.catch(() => undefined)
}

interface QuestionProps {
  legend: string
  name: string
  options: readonly string[]
  value: number | null
  onPick: (i: number) => void
}

function Question({ legend, name, options, value, onPick }: QuestionProps) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className={s.opts}>
        {options.map((label, i) => (
          <label key={label}>
            <input
              type="radio"
              name={name}
              value={i}
              checked={value === i}
              onChange={() => onPick(i)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * "Probá: ¿de qué categoría arrancarías?" La categoría todavía no existe: el quiz es una demo y no
 * guarda nada. El resultado reemplaza a las preguntas con una View Transition (`rival-quiz`).
 */
export function CategoryQuiz() {
  const [answers, setAnswers] = useState<Answers>(EMPTY)
  const formRef = useRef<HTMLFormElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  const category = resultOf(answers)

  function pick(key: keyof Answers, i: number) {
    const next = { ...answers, [key]: i }
    if (resultOf(next) === null) {
      setAnswers(next)
      return
    }
    void swap(() => setAnswers(next)).then(() => resultRef.current?.focus())
  }

  function again() {
    void swap(() => setAnswers(EMPTY)).then(() =>
      formRef.current?.querySelector<HTMLInputElement>('input')?.focus(),
    )
  }

  return (
    <form
      ref={formRef}
      className={category ? `${s.quiz} ${s.done}` : s.quiz}
      data-reveal=""
      style={cssVars({ '--rd': '90ms' })}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className={s.q}>
        <StatusChip piece="category" />
        <h3 style={{ marginTop: 10 }}>Probá: ¿de qué categoría arrancarías?</h3>
        <p style={{ color: 'var(--ink-2)', marginTop: 6, fontSize: 15 }}>
          La categoría todavía no existe. Esto es para que veas cómo va a ser.
        </p>
        <Question
          legend="¿Cuánto jugás?"
          name="frequency"
          options={QUIZ_FREQUENCIES}
          value={answers.frequency}
          onPick={(i) => pick('frequency', i)}
        />
        <Question
          legend="¿Dónde jugaste?"
          name="background"
          options={QUIZ_BACKGROUNDS}
          value={answers.background}
          onPick={(i) => pick('background', i)}
        />
        <Question
          legend="¿Tu puesto?"
          name="position"
          options={QUIZ_POSITIONS}
          value={answers.position}
          onPick={(i) => pick('position', i)}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {category
          ? `Cuando salga la categoría, arrancarías en ${category}, con el signo de pregunta hasta jugar 10 partidos oficiales.`
          : ''}
      </p>
      <div className={s.res}>
        <p className={s.kicker}>Cuando salga la categoría</p>
        <p className={s.big} ref={resultRef} tabIndex={-1}>
          Arrancarías en <b>{category ? `${category}?` : ''}</b>
        </p>
        <p>
          Nadie arranca más arriba de Quinta. El &quot;?&quot; se va con 10 partidos oficiales: la
          cancha no miente. Tu puesto no cambia la categoría: queda para tu figurita.
        </p>
        <div className={s.row}>
          <button type="button" className={s.ghost} onClick={again}>
            Probar de nuevo
          </button>
          <StatusChip piece="shareCards" prefix="Compartir: " />
        </div>
      </div>
      <p className={s.note}>No guardamos tus respuestas.</p>
    </form>
  )
}
