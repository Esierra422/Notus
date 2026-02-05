import { useState } from 'react'
import { Button } from '../ui/Button'
import './AuthStepEmail.css'

export function AuthStepPassword({ email, isSignUp, onSubmit, onBack }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!password) {
      setError('Please enter your password.')
      return
    }
    if (isSignUp) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }
    setLoading(true)
    try {
      await onSubmit(password)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-step-email">
      <h2 className="auth-step-title">
        {isSignUp ? 'Create password' : 'Enter password'}
      </h2>
      <p className="auth-step-subtitle">
        {isSignUp
          ? 'Choose a password (at least 6 characters).'
          : `Sign in as ${email}`}
      </p>
      <form onSubmit={handleSubmit} className="auth-step-form">
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="auth-input"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          disabled={loading}
        />
        {isSignUp && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="auth-input"
            autoComplete="new-password"
            disabled={loading}
          />
        )}
        {error && <p className="auth-error">{error}</p>}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="auth-step-btn"
          disabled={loading}
        >
          {loading ? (isSignUp ? 'Creating...' : 'Signing in...') : (isSignUp ? 'Create account' : 'Sign in')}
        </Button>
      </form>
      <Button variant="ghost" onClick={onBack} className="auth-step-back">
        ← Back
      </Button>
    </div>
  )
}
