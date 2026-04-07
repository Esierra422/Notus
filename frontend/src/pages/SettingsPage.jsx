import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { registerForPush, removeTokenFromFirestore, isPushSupported } from '../lib/messagingService'
import {
  setNotificationsPushEnabled,
  getMeetingPreferences,
  getTranscriptPreferences,
  getTranscriptRetention,
  TRANSCRIPT_RETENTION_OPTIONS,
  setMeetingPreferences,
  setTranscriptPreferences,
  setTranscriptRetention,
  getAppearanceTheme,
  setAppearanceTheme,
} from '../lib/userService'
import { PROFILE_UPDATED_EVENT } from '../components/app'
import { UserIcon, LockIcon, BellIcon, PaletteIcon, ClipboardIcon, LogOutIcon, VideoIcon, FileTextIcon, ArrowLeftIcon } from '../components/ui/Icons'
import { Button } from '../components/ui/Button'
import { InlineToast } from '../components/ui/InlineToast'
import { useInlineToast } from '../hooks/useInlineToast.js'
import '../styles/variables.css'
import './AppLayout.css'
import './SettingsPage.css'

/**
 * Settings page: app preferences and account management.
 */
export function SettingsPage() {
  const navigate = useNavigate()
  const { user, userDoc, setNavExtra } = useOutletContext() || {}
  const [pushLoading, setPushLoading] = useState(false)
  const [openPanel, setOpenPanel] = useState('')
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [themeSaving, setThemeSaving] = useState(false)
  const [meetingPrefs, setMeetingPrefsState] = useState(() => getMeetingPreferences(userDoc || {}))
  const [transcriptPrefs, setTranscriptPrefsState] = useState(() => getTranscriptPreferences(userDoc || {}))
  const [transcriptRetention, setTranscriptRetentionValue] = useState(() => getTranscriptRetention(userDoc || {}))
  const [appearanceTheme, setAppearanceThemeState] = useState(() => getAppearanceTheme(userDoc || {}))
  const { toast, showToast } = useInlineToast()
  const pushEnabled = userDoc?.notificationsPushEnabled === true
  const pushSupported = isPushSupported()
  const hasPasswordProvider = useMemo(
    () => (user?.providerData || []).some((p) => p.providerId === 'password'),
    [user]
  )

  useEffect(() => {
    if (setNavExtra) setNavExtra(null)
  }, [setNavExtra])

  useEffect(() => {
    setMeetingPrefsState(getMeetingPreferences(userDoc || {}))
    setTranscriptPrefsState(getTranscriptPreferences(userDoc || {}))
    setTranscriptRetentionValue(getTranscriptRetention(userDoc || {}))
    setAppearanceThemeState(getAppearanceTheme(userDoc || {}))
  }, [userDoc])

  const handleSaveMeetingPrefs = async () => {
    if (!user?.uid) return
    setPrefsSaving(true)
    try {
      await setMeetingPreferences(user.uid, meetingPrefs)
      showToast('Meeting preferences saved.')
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
    } catch (err) {
      showToast(err?.message || 'Unable to save meeting preferences.', 'error')
    } finally {
      setPrefsSaving(false)
    }
  }

  const handleSaveTranscriptPrefs = async () => {
    if (!user?.uid) return
    setPrefsSaving(true)
    try {
      await setTranscriptPreferences(user.uid, transcriptPrefs)
      showToast('Transcript preferences saved.')
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
    } catch (err) {
      showToast(err?.message || 'Unable to save transcript preferences.', 'error')
    } finally {
      setPrefsSaving(false)
    }
  }

  const handleSaveRetention = async () => {
    if (!user?.uid) return
    setPrefsSaving(true)
    try {
      await setTranscriptRetention(user.uid, transcriptRetention)
      showToast('Storage and privacy preferences saved.')
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
    } catch (err) {
      showToast(err?.message || 'Unable to save storage and privacy settings.', 'error')
    } finally {
      setPrefsSaving(false)
    }
  }

  const handlePasswordUpdate = async (e) => {
    e.preventDefault()
    if (!user?.email) return
    setPasswordError('')
    if (!passwordForm.next || passwordForm.next.length < 8) {
      setPasswordError('Use at least 8 characters for the new password.')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    setPasswordSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordForm.current)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, passwordForm.next)
      setPasswordForm({ current: '', next: '', confirm: '' })
      showToast('Password updated successfully.')
    } catch (err) {
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect.')
      } else if (err?.code === 'auth/requires-recent-login') {
        setPasswordError('Please sign in again, then retry changing your password.')
      } else {
        setPasswordError(err?.message || 'Unable to update password.')
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleExportData = async () => {
    if (!user) return
    setExportLoading(true)
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        user: {
          uid: user.uid,
          email: user.email || '',
          profile: userDoc || {},
          meetingPreferences: getMeetingPreferences(userDoc || {}),
          transcriptPreferences: getTranscriptPreferences(userDoc || {}),
          transcriptRetention: getTranscriptRetention(userDoc || {}),
          notificationsPushEnabled: userDoc?.notificationsPushEnabled === true,
        },
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notus-data-export-${user.uid}-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast('Data export downloaded.')
    } catch (err) {
      showToast(err?.message || 'Unable to export data.', 'error')
    } finally {
      setExportLoading(false)
    }
  }

  const handleSaveAppearanceTheme = async () => {
    if (!user?.uid) return
    setThemeSaving(true)
    try {
      await setAppearanceTheme(user.uid, appearanceTheme)
      document.documentElement.setAttribute('data-theme', appearanceTheme)
      try {
        localStorage.setItem('notus_theme', appearanceTheme)
      } catch {}
      showToast('Appearance saved.')
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
    } catch (err) {
      showToast(err?.message || 'Unable to save appearance.', 'error')
    } finally {
      setThemeSaving(false)
    }
  }

  const handleSendTestNotification = async () => {
    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported in this browser.', 'error')
      return
    }
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        showToast('Notification permission was not granted.', 'error')
        return
      }
    }
    if (Notification.permission !== 'granted') {
      showToast('Enable browser notifications in your browser settings.', 'error')
      return
    }
    const note = new Notification('Notus notifications are enabled', {
      body: 'You will receive alerts for new messages and invites.',
      icon: '/favicon.svg',
    })
    setTimeout(() => note.close(), 5000)
    showToast('Test notification sent.')
  }

  if (!user) return null

  return (
    <main className="app-main settings-main">
        <Link to="/app" className="page-back-btn">
          <ArrowLeftIcon size={18} /> Back
        </Link>
        <div className="settings-header">
          <h2>Settings</h2>
          <p className="settings-subtitle">Manage your account and preferences.</p>
        </div>
        <InlineToast message={toast?.message} tone={toast?.tone} />

        <section className="settings-section">
          <h3 className="settings-section-title">Account</h3>
          <div className="settings-cards">
            <Link to="/app/profile" className="settings-card settings-card-link">
              <div className="settings-card-icon">
                <UserIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Profile</span>
                <span className="settings-card-desc">Edit your name, photo, and personal information</span>
              </div>
              <span className="settings-card-arrow">→</span>
            </Link>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Security</h3>
          <div className="settings-cards">
            <div className="settings-card">
              <div className="settings-card-icon">
                <LockIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Connected accounts & Security</span>
                <span className="settings-card-desc">
                  Signed in with {(user.providerData || []).map((p) => p.providerId).join(', ') || 'email'}.
                </span>
              </div>
            </div>
            <button
              type="button"
              className="settings-card settings-card-button settings-card-link"
              onClick={() => setOpenPanel((v) => (v === 'password' ? '' : 'password'))}
            >
              <div className="settings-card-icon">
                <LockIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Password</span>
                <span className="settings-card-desc">Change your password and recovery workflow.</span>
              </div>
              <span className="settings-card-arrow">{openPanel === 'password' ? '−' : '+'}</span>
            </button>
            {openPanel === 'password' ? (
              <div className="settings-panel">
                {hasPasswordProvider ? (
                  <form className="settings-panel-form" onSubmit={handlePasswordUpdate}>
                    <input
                      type="password"
                      className="auth-input"
                      placeholder="Current password"
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                    />
                    <input
                      type="password"
                      className="auth-input"
                      placeholder="New password"
                      value={passwordForm.next}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                    />
                    <input
                      type="password"
                      className="auth-input"
                      placeholder="Confirm new password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                    />
                    {passwordError ? <p className="auth-error">{passwordError}</p> : null}
                    <div className="settings-panel-actions">
                      <Button type="submit" variant="primary" size="sm" disabled={passwordSaving}>
                        {passwordSaving ? 'Saving…' : 'Save password'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="settings-panel-note">This account uses social sign-in. Password changes are managed by your provider.</p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Meeting settings</h3>
          <div className="settings-cards">
            <button
              type="button"
              className="settings-card settings-card-button settings-card-link"
              onClick={() => setOpenPanel((v) => (v === 'meeting' ? '' : 'meeting'))}
            >
              <div className="settings-card-icon">
                <VideoIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Meeting preferences</span>
                <span className="settings-card-desc">Microphone, camera, and subtitle defaults.</span>
              </div>
              <span className="settings-card-arrow">{openPanel === 'meeting' ? '−' : '+'}</span>
            </button>
            {openPanel === 'meeting' ? (
              <div className="settings-panel">
                <label className="settings-row-check"><input className="notus-checkbox notus-checkbox--sm" type="checkbox" checked={meetingPrefs.micOnByDefault} onChange={(e) => setMeetingPrefsState((p) => ({ ...p, micOnByDefault: e.target.checked }))} /> Microphone on by default</label>
                <label className="settings-row-check"><input className="notus-checkbox notus-checkbox--sm" type="checkbox" checked={meetingPrefs.camOnByDefault} onChange={(e) => setMeetingPrefsState((p) => ({ ...p, camOnByDefault: e.target.checked }))} /> Camera on by default</label>
                <label className="settings-row-check"><input className="notus-checkbox notus-checkbox--sm" type="checkbox" checked={meetingPrefs.subtitleToggle} onChange={(e) => setMeetingPrefsState((p) => ({ ...p, subtitleToggle: e.target.checked }))} /> Show subtitles by default</label>
                <div className="settings-panel-actions">
                  <Button type="button" variant="primary" size="sm" disabled={prefsSaving} onClick={handleSaveMeetingPrefs}>
                    Save meeting preferences
                  </Button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="settings-card settings-card-button settings-card-link"
              onClick={() => setOpenPanel((v) => (v === 'transcript' ? '' : 'transcript'))}
            >
              <div className="settings-card-icon">
                <FileTextIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Transcript preferences</span>
                <span className="settings-card-desc">Auto-transcribe, language, and speaker labeling.</span>
              </div>
              <span className="settings-card-arrow">{openPanel === 'transcript' ? '−' : '+'}</span>
            </button>
            {openPanel === 'transcript' ? (
              <div className="settings-panel">
                <label className="settings-row-field">
                  Default transcript language
                  <input type="text" className="auth-input" value={transcriptPrefs.language || 'en'} onChange={(e) => setTranscriptPrefsState((p) => ({ ...p, language: e.target.value }))} placeholder="en" />
                </label>
                <div className="settings-row-check-group">
                  <label className="settings-row-check"><input className="notus-checkbox notus-checkbox--sm" type="checkbox" checked={transcriptPrefs.autoTranscribe} onChange={(e) => setTranscriptPrefsState((p) => ({ ...p, autoTranscribe: e.target.checked }))} /> Auto-transcribe recordings</label>
                  <label className="settings-row-check"><input className="notus-checkbox notus-checkbox--sm" type="checkbox" checked={transcriptPrefs.speakerLabeling} onChange={(e) => setTranscriptPrefsState((p) => ({ ...p, speakerLabeling: e.target.checked }))} /> Enable speaker labeling</label>
                </div>
                <div className="settings-panel-actions">
                  <Button type="button" variant="primary" size="sm" disabled={prefsSaving} onClick={handleSaveTranscriptPrefs}>
                    Save transcript preferences
                  </Button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="settings-card settings-card-button settings-card-link"
              onClick={() => setOpenPanel((v) => (v === 'storage' ? '' : 'storage'))}
            >
              <div className="settings-card-icon">
                <ClipboardIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Storage & privacy</span>
                <span className="settings-card-desc">Transcript retention and personal data export.</span>
              </div>
              <span className="settings-card-arrow">{openPanel === 'storage' ? '−' : '+'}</span>
            </button>
            {openPanel === 'storage' ? (
              <div className="settings-panel">
                <label className="settings-row-field">
                  Transcript retention
                  <select className="auth-input" value={transcriptRetention} onChange={(e) => setTranscriptRetentionValue(e.target.value)}>
                    {TRANSCRIPT_RETENTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <div className="settings-panel-actions">
                  <Button type="button" variant="primary" size="sm" disabled={prefsSaving} onClick={handleSaveRetention}>
                    Save storage settings
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleExportData} disabled={exportLoading}>
                    {exportLoading ? 'Preparing…' : 'Export my data'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Preferences</h3>
          <div className="settings-cards">
            {pushSupported ? (
              <>
              <button
                type="button"
                className="settings-card settings-card-button settings-card-link"
                onClick={() => setOpenPanel((v) => (v === 'push' ? '' : 'push'))}
              >
                <div className="settings-card-icon">
                  <BellIcon size={22} />
                </div>
                <div className="settings-card-content">
                  <span className="settings-card-title">Push notifications</span>
                  <span className="settings-card-desc">
                    Receive notifications for new messages and invites when the app is in the background.
                  </span>
                </div>
                <span className="settings-card-arrow">{openPanel === 'push' ? '−' : '+'}</span>
              </button>
              {openPanel === 'push' ? (
                <div className="settings-panel">
                  <label className="settings-row-check" aria-label="Enable push notifications">
                    <input
                      className="notus-checkbox notus-checkbox--sm"
                      type="checkbox"
                      checked={pushEnabled}
                      disabled={pushLoading}
                      onChange={async (e) => {
                        const enabled = e.target.checked
                        setPushLoading(true)
                        try {
                          if (enabled) {
                            const { granted } = await registerForPush(user.uid)
                            await setNotificationsPushEnabled(user.uid, granted)
                            if (!granted) showToast('Notification permission was not granted.', 'error')
                          } else {
                            await removeTokenFromFirestore(user.uid)
                            await setNotificationsPushEnabled(user.uid, false)
                          }
                          window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
                        } catch (err) {
                          console.error(err)
                          showToast('Unable to update push notification settings.', 'error')
                        } finally {
                          setPushLoading(false)
                        }
                      }}
                    />
                    Enable browser notifications
                  </label>
                  <div className="settings-panel-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSendTestNotification}
                      disabled={pushLoading || !pushEnabled}
                    >
                      Send test notification
                    </Button>
                  </div>
                </div>
              ) : null}
              </>
            ) : (
              <div className="settings-card settings-card-disabled">
                <div className="settings-card-icon">
                  <BellIcon size={22} />
                </div>
                <div className="settings-card-content">
                  <span className="settings-card-title">Push notifications</span>
                  <span className="settings-card-desc">Not supported in this browser (requires HTTPS and Push API).</span>
                </div>
              </div>
            )}
            <button
              type="button"
              className="settings-card settings-card-button settings-card-link"
              onClick={() => setOpenPanel((v) => (v === 'appearance' ? '' : 'appearance'))}
            >
              <div className="settings-card-icon">
                <PaletteIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Appearance</span>
                <span className="settings-card-desc">Select dark or light mode for your workspace.</span>
              </div>
              <span className="settings-card-arrow">{openPanel === 'appearance' ? '−' : '+'}</span>
            </button>
            {openPanel === 'appearance' ? (
              <div className="settings-panel">
                <label className="settings-row-check">
                  <input
                    className="settings-radio"
                    type="radio"
                    name="appearanceTheme"
                    checked={appearanceTheme === 'dark'}
                    onChange={() => setAppearanceThemeState('dark')}
                  />
                  Dark mode
                </label>
                <label className="settings-row-check">
                  <input
                    className="settings-radio"
                    type="radio"
                    name="appearanceTheme"
                    checked={appearanceTheme === 'light'}
                    onChange={() => setAppearanceThemeState('light')}
                  />
                  Light mode
                </label>
                <div className="settings-panel-actions">
                  <Button type="button" variant="primary" size="sm" disabled={themeSaving} onClick={handleSaveAppearanceTheme}>
                    {themeSaving ? 'Saving…' : 'Save appearance'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Data & privacy</h3>
          <div className="settings-cards">
            <button
              type="button"
              className="settings-card settings-card-button settings-card-link"
              onClick={handleExportData}
              disabled={exportLoading}
            >
              <div className="settings-card-icon">
                <ClipboardIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Export data</span>
                <span className="settings-card-desc">
                  Download your profile and settings as a JSON file.
                </span>
              </div>
              <span className="settings-card-arrow">{exportLoading ? '…' : '↓'}</span>
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Session</h3>
          <div className="settings-cards">
            <button
              type="button"
              className="settings-card settings-card-button"
              onClick={async () => {
                await signOut(auth)
                navigate('/')
              }}
            >
              <div className="settings-card-icon">
                <LogOutIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Sign out</span>
                <span className="settings-card-desc">Sign out of your account</span>
              </div>
            </button>
          </div>
        </section>
    </main>
  )
}
