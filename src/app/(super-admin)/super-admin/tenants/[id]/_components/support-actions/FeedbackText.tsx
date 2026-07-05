import type { Feedback } from './constants'

/** Feedback inline de una sección: verde en éxito, rojo en error. */
export function FeedbackText({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
    <p
      role="status"
      className={`text-xs ${feedback.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
    >
      {feedback.text}
    </p>
  )
}
