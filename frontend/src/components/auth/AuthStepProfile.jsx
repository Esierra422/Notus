import { useState } from 'react'
import { Button } from '../ui/Button'
import { formatPhoneNumber, extractPhoneNumber, validateBirthdate, formatBirthdateForDisplay } from '../../lib/inputFormatting'
import './AuthStepEmail.css'

export function AuthStepProfile({ field, label, onSave, onBack, onSkip }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isProfilePicture = field === 'profilePicture'
  const isBirthdate = field === 'birthdate'
  const isPhoneNumber = field === 'phoneNumber'
  const isGender = field === 'gender'

  const handleChange = (e) => {
    const newValue = e.target.value
    
    // Real-time formatting for phone
    if (isPhoneNumber) {
      setValue(formatPhoneNumber(newValue))
    } else {
      setValue(newValue)
    }
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!isProfilePicture && !value.trim()) {
      setError('Please enter a value.')
      return
    }
    
    let valueToSave = value.trim() || ''
    
    // Validate phone
    if (isPhoneNumber && valueToSave) {
      const extracted = extractPhoneNumber(valueToSave)
      if (!extracted) {
        setError('Phone number must be 10 digits.')
        return
      }
      valueToSave = extracted
    }
    
    // Validate birthdate
    if (isBirthdate && valueToSave) {
      const validated = validateBirthdate(valueToSave)
      if (!validated) {
        setError('Birthdate must be valid and not in the future.')
        return
      }
      valueToSave = validated
    }
    
    setLoading(true)
    try {
      await onSave(valueToSave)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const inputType = isBirthdate ? 'tel' : isProfilePicture ? 'url' : 'text'
  const inputPlaceholder = isProfilePicture
    ? 'Profile image URL (or skip)'
    : isGender
      ? 'e.g. male, female, non-binary, prefer not to say'
      : isBirthdate
        ? 'MM/DD/YYYY'
        : isPhoneNumber
          ? '(XXX) XXX-XXXX'
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
            onChange={handleChange}
            maxLength={isPhoneNumber ? 14 : undefined}
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
