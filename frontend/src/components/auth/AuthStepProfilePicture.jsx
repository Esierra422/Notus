import { useState, useRef } from 'react'
import { Button } from '../ui/Button'
import { auth } from '../../lib/firebase'
import { compressImageToDataUrl } from '../../lib/imageUtils'
import './AuthStepEmail.css'

export function AuthStepProfilePicture({ onSave, onBack, onSkip }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    setError('')
    if (!selected) {
      setFile(null)
      setPreview('')
      return
    }
    if (!selected.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, GIF, etc.).')
      setFile(null)
      setPreview('')
      return
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.')
      setFile(null)
      setPreview('')
      return
    }
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (file) {
        const dataUrl = await compressImageToDataUrl(file)
        await onSave(dataUrl)
      } else {
        await onSave('')
      }
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setError('')
    setLoading(true)
    try {
      await onSkip()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-step-email">
      <h2 className="auth-step-title">Complete your profile</h2>
      <p className="auth-step-subtitle">Profile picture</p>
      <form onSubmit={handleSubmit} className="auth-step-form">
        <div className="auth-upload-area">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="auth-upload-input"
            disabled={loading}
          />
          {preview ? (
            <div className="auth-upload-preview">
              <img src={preview} alt="Preview" />
              <button
                type="button"
                className="auth-upload-change"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
              >
                Change photo
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="auth-upload-trigger"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
            >
              Choose a photo to upload
            </button>
          )}
        </div>
        {error && <p className="auth-error">{error}</p>}
        <div className="auth-step-profile-actions">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="auth-step-btn"
            disabled={loading}
          >
            {loading ? 'Uploading...' : 'Continue'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleSkip}
            className="auth-step-skip"
          >
            Skip
          </Button>
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
