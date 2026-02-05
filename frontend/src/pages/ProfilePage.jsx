import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getUserDoc, updateProfileField, PROFILE_FIELDS, getProfilePictureUrl } from '../lib/userService'
import { compressImageToDataUrl } from '../lib/imageUtils'
import { AppHeader, AppFooter, triggerProfileRefresh } from '../components/app'
import '../styles/variables.css'
import './AppLayout.css'
import './ProfilePage.css'

/**
 * Profile page — enterprise-level personal info management.
 * Single source of truth: users/{uid} in Firestore.
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [file, setFile] = useState(null)
  const [localPreview, setLocalPreview] = useState('')
  const [imgLoadError, setImgLoadError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState({})
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/login')
        return
      }
      setUser(u)
      const doc = await getUserDoc(u.uid)
      setUserDoc(doc)
      setImgLoadError(false)
    })
    return unsub
  }, [navigate])

  const profilePicUrl = getProfilePictureUrl(userDoc, user)
  const showProfileImg = profilePicUrl && !imgLoadError
  const displayImg = localPreview || (showProfileImg ? profilePicUrl : null)

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    setError('')
    setSaveSuccess(null)
    if (!selected) {
      setFile(null)
      setLocalPreview('')
      return
    }
    if (!selected.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, GIF).')
      return
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.')
      return
    }
    setFile(selected)
    setLocalPreview(URL.createObjectURL(selected))
    setImgLoadError(false)
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    setError('')
    setSaveSuccess(null)
    if (!file || !user) return
    setLoading(true)
    try {
      const dataUrl = await compressImageToDataUrl(file)
      await updateProfileField(user.uid, 'profilePicture', dataUrl)
      setUserDoc((d) => ({ ...d, profilePicture: dataUrl }))
      setFile(null)
      setLocalPreview(dataUrl)
      setImgLoadError(false)
      setSaveSuccess('Profile picture updated.')
      triggerProfileRefresh()
    } catch (err) {
      setError(err?.message || 'Upload failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveField = async (field, value) => {
    if (!user) return
    setError('')
    setSaveSuccess(null)
    setSaving((s) => ({ ...s, [field]: true }))
    try {
      await updateProfileField(user.uid, field, value)
      setUserDoc((d) => ({ ...d, [field]: value }))
      setSaveSuccess(`${field === 'firstName' ? 'First name' : field === 'lastName' ? 'Last name' : field} saved.`)
      if (field === 'firstName' || field === 'lastName') triggerProfileRefresh()
    } catch (err) {
      setError(err.message || 'Failed to save.')
    } finally {
      setSaving((s) => ({ ...s, [field]: false }))
    }
  }

  const clearSuccess = () => setSaveSuccess(null)

  if (!user) return null

  const editableFields = PROFILE_FIELDS.filter((f) => f.key !== 'profilePicture')

  return (
    <div className="app-layout">
      <AppHeader user={user} />
      <main className="app-main profile-main">
        <div className="profile-header">
          <h2>Your profile</h2>
          <p className="profile-subtitle">Your name and photo will appear on your account and where you collaborate.</p>
        </div>

        {saveSuccess && (
          <div className="profile-toast profile-toast-success" role="status">
            {saveSuccess}
            <button type="button" className="profile-toast-dismiss" onClick={clearSuccess} aria-label="Dismiss">×</button>
          </div>
        )}
        {error && (
          <div className="profile-toast profile-toast-error" role="alert">
            {error}
            <button type="button" className="profile-toast-dismiss" onClick={() => setError('')} aria-label="Dismiss">×</button>
          </div>
        )}

        <section className="profile-card">
          <h3 className="profile-card-title">Profile photo</h3>
          <div className="profile-photo-row">
            <div className="profile-photo-container">
              {displayImg ? (
                <>
                  <img
                    src={displayImg}
                    alt=""
                    className="profile-photo-img"
                    onError={() => setImgLoadError(true)}
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    className="profile-photo-change"
                    onClick={() => inputRef.current?.click()}
                    disabled={loading}
                  >
                    Change photo
                  </button>
                </>
              ) : (
                <div className="profile-photo-placeholder">
                  <span className="profile-photo-initial">
                    {user?.email?.[0]?.toUpperCase() || '?'}
                  </span>
                  <button
                    type="button"
                    className="profile-photo-upload"
                    onClick={() => inputRef.current?.click()}
                    disabled={loading}
                  >
                    Upload photo
                  </button>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="profile-file-input"
              />
            </div>
            {file && (
              <form onSubmit={handleUpload} className="profile-photo-actions">
                <button type="submit" className="profile-btn profile-btn-primary" disabled={loading}>
                  {loading ? 'Uploading...' : 'Save photo'}
                </button>
                <button type="button" className="profile-btn profile-btn-ghost" onClick={() => { setFile(null); setLocalPreview(''); }}>
                  Cancel
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="profile-card">
          <h3 className="profile-card-title">Personal information</h3>
          <div className="profile-fields">
            <div className="profile-field">
              <label className="profile-label">Email</label>
              <p className="profile-value profile-value-readonly">{user.email || 'Not set'}</p>
            </div>
            {editableFields.map((field) => (
              <ProfileFieldRow
                key={field.key}
                field={field}
                value={userDoc?.[field.key] ?? ''}
                onSave={(value) => handleSaveField(field.key, value)}
                saving={saving[field.key]}
              />
            ))}
          </div>
        </section>

        <div className="profile-footer">
          <Link to="/app" className="profile-back-link">← Back to dashboard</Link>
        </div>
      </main>
      <AppFooter />
    </div>
  )
}

function ProfileFieldRow({ field, value, onSave, saving }) {
  const [editValue, setEditValue] = useState(value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setEditValue(value ?? '')
  }, [value])

  const handleChange = (e) => {
    setEditValue(e.target.value)
    setDirty(true)
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!dirty) return
    onSave(editValue.trim())
    setDirty(false)
  }

  const options = field.options || []
  const optionLabels = { male: 'Male', female: 'Female', 'non-binary': 'Non-binary', 'prefer-not-to-say': 'Prefer not to say' }

  const labelMap = { firstName: 'First name', lastName: 'Last name', birthdate: 'Birthdate', phoneNumber: 'Phone number', gender: 'Gender' }
  const label = labelMap[field.key] || field.label

  return (
    <div className="profile-field">
      <label className="profile-label" htmlFor={`field-${field.key}`}>{label}</label>
      <form onSubmit={handleSave} className="profile-field-form">
        {field.type === 'select' ? (
          <select
            id={`field-${field.key}`}
            value={editValue}
            onChange={handleChange}
            className="profile-input profile-select"
            disabled={saving}
          >
            <option value="">Select...</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{optionLabels[opt] || opt}</option>
            ))}
          </select>
        ) : (
          <input
            id={`field-${field.key}`}
            type={field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : 'text'}
            value={editValue}
            onChange={handleChange}
            placeholder={label}
            className="profile-input"
            disabled={saving}
          />
        )}
        {dirty && (
          <button type="submit" className="profile-btn profile-btn-secondary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </form>
    </div>
  )
}
