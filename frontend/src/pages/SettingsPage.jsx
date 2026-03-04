import { useState, useEffect } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { registerForPush, removeTokenFromFirestore, isPushSupported } from '../lib/messagingService'
import { setNotificationsPushEnabled } from '../lib/userService'
import { PROFILE_UPDATED_EVENT } from '../components/app'
import { UserIcon, LockIcon, BellIcon, PaletteIcon, ClipboardIcon, LogOutIcon, VideoIcon, FileTextIcon, ArrowLeftIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './SettingsPage.css'

/**
 * Settings page — enterprise-level app preferences and account management.
 */
export function SettingsPage() {
  const navigate = useNavigate()
  const { user, userDoc, setNavExtra } = useOutletContext() || {}
  const [pushLoading, setPushLoading] = useState(false)
  const pushEnabled = userDoc?.notificationsPushEnabled === true
  const pushSupported = isPushSupported()

  useEffect(() => {
    if (setNavExtra) setNavExtra(null)
  }, [setNavExtra])

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
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <LockIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Connected accounts & Security</span>
                <span className="settings-card-desc">Manage linked accounts and security settings — coming soon</span>
              </div>
            </div>
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <LockIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Password</span>
                <span className="settings-card-desc">Change your password — coming soon</span>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Meeting settings</h3>
          <div className="settings-cards">
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <VideoIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Meeting preferences</span>
                <span className="settings-card-desc">Microphone, camera, and subtitles defaults — coming soon</span>
              </div>
            </div>
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <FileTextIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Transcript preferences</span>
                <span className="settings-card-desc">Auto-transcribe, language, and speaker labeling — coming soon</span>
              </div>
            </div>
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <ClipboardIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Storage & privacy</span>
                <span className="settings-card-desc">Transcript retention and download my data — coming soon</span>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Preferences</h3>
          <div className="settings-cards">
            {pushSupported ? (
              <div className="settings-card settings-card-link">
                <div className="settings-card-icon">
                  <BellIcon size={22} />
                </div>
                <div className="settings-card-content">
                  <span className="settings-card-title">Push notifications</span>
                  <span className="settings-card-desc">
                    Receive notifications for new messages and invites when the app is in the background.
                  </span>
                </div>
                <label className="settings-card-toggle" aria-label="Enable push notifications">
                  <input
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
                        } else {
                          await removeTokenFromFirestore(user.uid)
                          await setNotificationsPushEnabled(user.uid, false)
                        }
                        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
                      } catch (err) {
                        console.error(err)
                      } finally {
                        setPushLoading(false)
                      }
                    }}
                  />
                  <span className="settings-card-toggle-slider" />
                </label>
              </div>
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
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <PaletteIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Appearance</span>
                <span className="settings-card-desc">Theme and display — coming soon</span>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Data & privacy</h3>
          <div className="settings-cards">
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <ClipboardIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Export data</span>
                <span className="settings-card-desc">Download your data — coming soon</span>
              </div>
            </div>
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
