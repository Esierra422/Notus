import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  getUserDoc,
  updateProfileField,
  PROFILE_FIELDS,
  getProfilePictureUrl,
  getDisplayName,
} from '../lib/userService'
import { getActiveMembership } from '../lib/orgService'
import { getOrg } from '../lib/orgService'
import { getTeamsForUserInOrg } from '../lib/teamService'
import { compressImageToDataUrl } from '../lib/imageUtils'
import { triggerProfileRefresh } from '../components/app'
import { validateBirthdate, formatBirthdateForDisplay } from '../lib/inputFormatting'
import { formatDate, getTimeZone, getLocale } from '../lib/dateUtils'
import { formatPhoneForDisplay, parseE164 } from '../lib/countryCodes'
import { PhoneInput } from '../components/ui/PhoneInput'
import {
  CameraIcon,
  PencilIcon,
  ArrowLeftIcon,
} from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './ProfilePage.css'

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member' }

/**
 * Profile page — top section always visible, account meta, quick actions, Notus preferences.
 */
export function ProfilePage() {
  const { user, setNavExtra } = useOutletContext() || {}
  const [userDoc, setUserDoc] = useState(null)
  const [membership, setMembership] = useState(null)
  const [org, setOrg] = useState(null)
  const [teams, setTeams] = useState([])
  const [file, setFile] = useState(null)
  const [localPreview, setLocalPreview] = useState('')
  const [imgLoadError, setImgLoadError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState({})
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [copied, setCopied] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (setNavExtra) setNavExtra(null)
  }, [setNavExtra])

  useEffect(() => {
    if (!user) return
    getUserDoc(user.uid).then((doc) => {
      setUserDoc(doc)
      setImgLoadError(false)
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    getActiveMembership(user.uid).then((mem) => {
      setMembership(mem)
      if (mem?.orgId) {
        getOrg(mem.orgId).then(setOrg)
        getTeamsForUserInOrg(mem.orgId, user.uid).then(setTeams)
      } else {
        setOrg(null)
        setTeams([])
      }
    })
  }, [user])

  const profilePicUrl = getProfilePictureUrl(userDoc, user)
  const showProfileImg = profilePicUrl && !imgLoadError
  const displayImg = localPreview || (showProfileImg ? profilePicUrl : null)
  const fullName = getDisplayName(userDoc, user?.uid ?? '', user)
  const email = (userDoc?.email || user?.email || '').trim()
  const roleLabel = membership ? ROLE_LABELS[membership.role] || membership.role : null

  const handleCopyEmail = async () => {
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

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

  const clearSuccess = () => setSaveSuccess(null)

  const startEditing = () => {
    const base = {}
    PROFILE_FIELDS.filter((f) => f.key !== 'profilePicture').forEach((f) => {
      base[f.key] = userDoc?.[f.key] ?? ''
    })
    setEditForm(base)
    setIsEditing(true)
    setError('')
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm({})
    setError('')
  }

  const handleSaveAll = async (e) => {
    e.preventDefault()
    if (!user || !userDoc) return
    setError('')
    setSaveSuccess(null)
    const updates = []
    for (const f of PROFILE_FIELDS) {
      if (f.key === 'profilePicture') continue
      const current = userDoc?.[f.key] ?? ''
      let next = (editForm[f.key] ?? '').trim()
      if (String(current) === String(next)) continue
      if (f.key === 'phoneNumber' && next) {
        if (!parseE164(next)) {
          setError('Please enter a valid phone number.')
          return
        }
      }
      if (f.key === 'birthdate' && next) {
        const validated = validateBirthdate(next)
        if (!validated) {
          setError('Birthdate must be valid and not in the future.')
          return
        }
        next = validated
      }
      updates.push([f.key, next])
    }
    if (updates.length === 0) {
      setIsEditing(false)
      setEditForm({})
      return
    }
    setSaving({ bulk: true })
    try {
      for (const [key, value] of updates) {
        await updateProfileField(user.uid, key, value)
      }
      setUserDoc((d) => {
        const next = { ...d }
        updates.forEach(([k, v]) => { next[k] = v })
        return next
      })
      setSaveSuccess('Changes saved.')
      if (updates.some(([k]) => ['firstName', 'lastName'].includes(k))) triggerProfileRefresh()
      setIsEditing(false)
      setEditForm({})
    } catch (err) {
      setError(err?.message || 'Failed to save.')
    } finally {
      setSaving({})
    }
  }

  const updateEditForm = (key, value) => setEditForm((f) => ({ ...f, [key]: value }))

  if (!user) return null

  const tz = getTimeZone(userDoc)
  const locale = getLocale(userDoc)
  const dateOpts = { timeZone: tz, locale }
  const createdAt = userDoc?.createdAt?.toDate?.() ?? userDoc?.createdAt
  const joinedDate = createdAt ? formatDate(createdAt, { ...dateOpts, year: 'numeric', month: 'short', day: 'numeric' }) : null
  const lastActive = userDoc?.lastActive?.toDate?.() ?? userDoc?.lastActive
  const lastActiveStr = lastActive ? formatDate(lastActive, { ...dateOpts, month: 'short', day: 'numeric' }) : null

  return (
    <main className="app-main profile-main">
      <Link to="/app" className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back
      </Link>
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

      {/* Header: cover + hero card */}
      <div className="profile-header">
        <div className="profile-cover" aria-hidden />
        <section className="profile-hero">
        <div className="profile-hero-inner">
          <div className="profile-avatar-wrap">
            {displayImg ? (
              <img
                src={displayImg}
                alt=""
                className="profile-avatar"
                onError={() => setImgLoadError(true)}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="profile-avatar-placeholder">
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <button
              type="button"
              className="profile-avatar-btn"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              title="Change photo"
              aria-label="Change photo"
            >
              <CameraIcon size={14} />
            </button>
            <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="profile-file-input" />
          </div>
          {file && (
            <form onSubmit={handleUpload} className="profile-photo-actions">
              <button type="submit" className="profile-btn profile-btn-primary" disabled={loading}>
                {loading ? 'Uploading…' : 'Save'}
              </button>
              <button type="button" className="profile-btn profile-btn-ghost" onClick={() => { setFile(null); setLocalPreview(''); }}>
                Cancel
              </button>
            </form>
          )}
          <h2 className="profile-hero-name">{fullName || email || 'User'}</h2>
          <button
            type="button"
            className="profile-hero-email"
            onClick={handleCopyEmail}
            title="Copy email"
          >
            {email || 'No email'}
            {copied && <span> · Copied!</span>}
          </button>
          <div className="profile-hero-badges">
            {roleLabel && <span className="profile-badge">{roleLabel}</span>}
            {org && <span className="profile-badge profile-badge-org">{org.name}</span>}
            {teams.length > 0 && <span className="profile-badge profile-badge-org">{teams.map((t) => t.name).join(', ')}</span>}
          </div>
          {joinedDate && (
            <div className="profile-hero-meta">
              <span>Joined {joinedDate}</span>
            </div>
          )}
        </div>
        </section>
      </div>

      {/* Personal information — always visible, pencil to edit */}
      <section className="profile-card">
        <div className="profile-card-header">
          <h3 className="profile-card-title">Personal information</h3>
          {!isEditing ? (
            <button
              type="button"
              className="profile-pencil-btn"
              onClick={startEditing}
              title="Edit"
              aria-label="Edit"
            >
              <PencilIcon size={16} />
            </button>
          ) : null}
        </div>
        {isEditing ? (
          <form onSubmit={handleSaveAll} className="profile-fields">
            <div className="profile-field">
              <label className="profile-label">Email</label>
              <p className="profile-value profile-value-readonly">{user.email || 'Not set'}</p>
            </div>
            {PROFILE_FIELDS.filter((f) => !['profilePicture'].includes(f.key)).map((field) => (
              <ProfileFieldEdit
                key={field.key}
                field={field}
                value={editForm[field.key] ?? ''}
                onChange={(v) => updateEditForm(field.key, v)}
              />
            ))}
            <div className="profile-save-row">
              <button
                type="button"
                className="profile-btn profile-btn-ghost"
                onClick={cancelEditing}
              >
                Cancel
              </button>
              <button type="submit" className="profile-btn profile-btn-primary" disabled={saving.bulk}>
                {saving.bulk ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-fields profile-fields-view">
            <div className="profile-field">
              <span className="profile-label">Email</span>
              <span className="profile-value">{user.email || 'Not set'}</span>
            </div>
            {PROFILE_FIELDS.filter((f) => !['profilePicture'].includes(f.key)).map((field) => (
              <ProfileFieldView
                key={field.key}
                field={field}
                value={userDoc?.[field.key] ?? ''}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

const LABEL_MAP = { firstName: 'First name', lastName: 'Last name', birthdate: 'Birthdate', phoneNumber: 'Phone number', gender: 'Gender' }
const OPTION_LABELS = { male: 'Male', female: 'Female', 'non-binary': 'Non-binary', 'prefer-not-to-say': 'Prefer not to say' }

function ProfileFieldView({ field, value }) {
  const isPhoneNumber = field.key === 'phoneNumber'
  const isBirthdate = field.key === 'birthdate'
  const displayValue = isBirthdate && value
    ? formatBirthdateForDisplay(value)
    : isPhoneNumber && value
      ? formatPhoneForDisplay(value)
      : value
  const label = LABEL_MAP[field.key] || field.label
  return (
    <div className="profile-field">
      <span className="profile-label">{label}</span>
      <span className="profile-value">{displayValue || '—'}</span>
    </div>
  )
}

function ProfileFieldEdit({ field, value, onChange }) {
  const isPhoneNumber = field.key === 'phoneNumber'
  const isBirthdate = field.key === 'birthdate'
  const label = LABEL_MAP[field.key] || field.label
  const options = field.options || []

  if (isPhoneNumber) {
    return (
      <div className="profile-field">
        <label className="profile-label">{label}</label>
        <PhoneInput value={value} onChange={onChange} />
      </div>
    )
  }

  return (
    <div className="profile-field">
      <label className="profile-label" htmlFor={`edit-${field.key}`}>{label}</label>
      {field.type === 'select' ? (
        <select
          id={`edit-${field.key}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="profile-input profile-select"
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{OPTION_LABELS[opt] || opt}</option>
          ))}
        </select>
      ) : (
        <input
          id={`edit-${field.key}`}
          type={isBirthdate ? 'date' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          max={isBirthdate ? new Date().toISOString().slice(0, 10) : undefined}
          placeholder={label}
          className="profile-input"
        />
      )}
    </div>
  )
}

