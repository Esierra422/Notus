import { useState } from 'react'
import { Button } from '../ui/Button'
import './AuthStepEmail.css'

export function AuthStepEmail({ title = 'Enter email', onSubmit, onBack }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Please enter your email.')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <div className="auth-step-email">
      <h2 className="auth-step-title">{title}</h2>
      <p className="auth-step-subtitle">Enter your email to continue.</p>
      <form onSubmit={handleSubmit} className="auth-step-form">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-input"
          autoComplete="email"
        />
        {error && <p className="auth-error">{error}</p>}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="auth-step-btn"
        >
          Continue
        </Button>
      </form>
      <Button variant="ghost" onClick={onBack} className="auth-step-back">
        ← Back
      </Button>
    </div>
  )
}
