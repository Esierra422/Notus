import './InlineToast.css'

export function InlineToast({ message, tone = 'success' }) {
  if (!message) return null
  return (
    <div className={`notus-inline-toast notus-inline-toast--${tone}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}
