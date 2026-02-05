import { useState } from 'react'
import { Button } from '../ui/Button'
import './AuthStepEmail.css'

export function AuthStepProfile({ field, label, onSave, onBack, onSkip }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isProfilePicture = field === 'profilePicture'
  const isBirthdate = field === 'birthdate'
  const isGender = field === 'gender'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isProfilePicture && !value.trim()) {
      setError('Please enter a value.')
      return
    }
    setLoading(true)
    try {
      await onSave(value.trim() || '')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const inputType = isBirthdate ? 'date' : isProfilePicture ? 'url' : 'text'
  const inputPlaceholder = isProfilePicture
    ? 'Profile image URL (or skip)'
    : isGender
      ? 'e.g. male, female, non-binary, prefer not to say'
      : `Enter ${label.toLowerCase()}`

  return (
    <div className="auth-step-email">
      <h2 className="auth-step-title">Complete your profile</h2>
      <p className="auth-step-subtitle">{label}</p>
      <form onSubmit={handleSubmit} className="auth-step-form">
        {isGender ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="auth-input auth-select"
            disabled={loading}
          >
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non-binary">Non-binary</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </select>
        ) : (
          <input
            type={inputType}
            placeholder={inputPlaceholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="auth-input"
            disabled={loading}
          />
        )}
        {error && <p className="auth-error">{error}</p>}
        <div className="auth-step-profile-actions">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="auth-step-btn"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Continue'}
          </Button>
          {isProfilePicture && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSkip && onSkip()}
              className="auth-step-skip"
            >
              Skip
            </Button>
          )}
        </div>
      </form>
      {onBack && (
        <Button variant="ghost" onClick={onBack} className="auth-step-back">
          ← Back
        </Button>
      )}
    </div>
  )
}
