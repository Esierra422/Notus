import { useState } from 'react'
import { Button } from '../ui/Button'
import { PhoneInput } from '../ui/PhoneInput'
import { validateBirthdate } from '../../lib/inputFormatting'
import { parseE164 } from '../../lib/countryCodes'
import './AuthStepEmail.css'

export function AuthStepProfile({ field, label, onSave, onBack, onSkip }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isProfilePicture = field === 'profilePicture'
  const isBirthdate = field === 'birthdate'
  const isPhoneNumber = field === 'phoneNumber'
  const isGender = field === 'gender'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!isProfilePicture && !value.trim()) {
      setError('Please enter a value.')
      return
    }
    
    let valueToSave = value.trim() || ''
    
    // Validate phone (E.164 from PhoneInput)
    if (isPhoneNumber && valueToSave) {
      if (!parseE164(valueToSave)) {
        setError('Please enter a valid phone number.')
        return
      }
    }
    
    // Validate birthdate (YYYY-MM-DD from date picker)
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

  return (
    <div className="auth-step-email">
      <h2 className="auth-step-title">Complete your profile</h2>
      <p className="auth-step-subtitle">{label}</p>
      <form onSubmit={handleSubmit} className="auth-step-form">
        {isGender ? (
          <select
            value={value}
            onChange={(e) => { setValue(e.target.value); setError('') }}
            className="auth-input auth-select"
            disabled={loading}
          >
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non-binary">Non-binary</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </select>
        ) : isPhoneNumber ? (
          <PhoneInput
            value={value}
            onChange={(v) => { setValue(v); setError('') }}
            disabled={loading}
          />
        ) : isBirthdate ? (
          <input
            type="date"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError('') }}
            max={new Date().toISOString().slice(0, 10)}
            className="auth-input"
            disabled={loading}
          />
        ) : (
          <input
            type={isProfilePicture ? 'url' : 'text'}
            placeholder={isProfilePicture ? 'Profile image URL (or skip)' : `Enter ${label.toLowerCase()}`}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError('') }}
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
