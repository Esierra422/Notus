import { useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { UserIcon, LockIcon, BellIcon, PaletteIcon, ClipboardIcon, LogOutIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './SettingsPage.css'

/**
 * Settings page — enterprise-level app preferences and account management.
 */
export function SettingsPage() {
  const { user, setNavExtra } = useOutletContext() || {}

  useEffect(() => {
    if (setNavExtra) setNavExtra(null)
  }, [setNavExtra])

  if (!user) return null

  return (
    <main className="app-main settings-main">
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
                <span className="settings-card-title">Password</span>
                <span className="settings-card-desc">Change your password — coming soon</span>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Preferences</h3>
          <div className="settings-cards">
            <div className="settings-card settings-card-disabled">
              <div className="settings-card-icon">
                <BellIcon size={22} />
              </div>
              <div className="settings-card-content">
                <span className="settings-card-title">Notifications</span>
                <span className="settings-card-desc">Email and push notifications — coming soon</span>
              </div>
            </div>
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

        <div className="settings-footer">
          <Link to="/app" className="settings-back-link">← Back to dashboard</Link>
        </div>
    </main>
  )
}
