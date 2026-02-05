import { Link } from 'react-router-dom'
import { getUserDoc, getProfilePictureUrl } from '../../lib/userService'
import { useState, useEffect } from 'react'
import { auth } from '../../lib/firebase'
import { SettingsIcon } from '../ui/Icons'
import { NotificationsDropdown } from './NotificationsDropdown'
import './AppHeader.css'


const PROFILE_UPDATED_EVENT = 'notus:profileUpdated'

export function triggerProfileRefresh() {
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
}

function Avatar({ user, size = 32 }) {
  const [userDoc, setUserDoc] = useState(null)
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    if (!user?.uid) return
    getUserDoc(user.uid).then(setUserDoc)
  }, [user?.uid])
  useEffect(() => {
    const handler = () => {
      setImgError(false)
      if (user?.uid) getUserDoc(user.uid).then(setUserDoc)
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, handler)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler)
  }, [user?.uid])
  const src = !imgError && getProfilePictureUrl(userDoc, user)
  const initials = user?.email?.[0]?.toUpperCase() || user?.displayName?.[0]?.toUpperCase() || '?'
  return (
    <div className="app-avatar" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt=""
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="app-avatar-initials">{initials}</span>
      )}
    </div>
  )
}

export function AppHeader({ user, navExtra }) {
  return (
    <header className="app-header">
      <Link to="/app" className="app-logo">Notus</Link>
      <nav className="app-nav">
        {navExtra}
        {user && (
          <div className="app-header-right">
            <NotificationsDropdown user={user} />
            <Link to="/app/settings" className="app-settings-btn" title="Settings" aria-label="Settings">
              <SettingsIcon size={20} />
            </Link>
            <Link to="/app/profile" className="app-avatar-link" title="Profile" aria-label="Profile">
              <Avatar user={user} />
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
