import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { SettingsIcon, UserIcon } from '../ui/Icons'
import { getUserDoc, getDisplayName } from '../../lib/userService'
import { Avatar } from './Avatar'
import './AccountMenuDropdown.css'

export function AccountMenuDropdown({ user }) {
  const [open, setOpen] = useState(false)
  const [userDoc, setUserDoc] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!user?.uid) return
    getUserDoc(user.uid).then(setUserDoc)
  }, [user?.uid])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  if (!user) return null

  const displayName = getDisplayName(userDoc, user.uid, user)

  return (
    <div className="account-menu-dropdown" ref={containerRef}>
      <button
        type="button"
        className="account-menu-trigger account-menu-trigger-avatar"
        onClick={() => setOpen(!open)}
        title="Account menu"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar user={user} size={30} />
      </button>
      {open && (
        <div className="account-menu-panel">
          <div className="account-menu-header">
            <Avatar user={user} size={40} />
            <div className="account-menu-user">
              {displayName && <span className="account-menu-name">{displayName}</span>}
              <span className="account-menu-email">{user.email || 'Signed in'}</span>
            </div>
          </div>
          <div className="account-menu-list">
            <Link to="/app/profile" className="account-menu-item" onClick={() => setOpen(false)}>
              <UserIcon size={18} />
              <span>Profile</span>
            </Link>
            <Link to="/app/settings" className="account-menu-item" onClick={() => setOpen(false)}>
              <SettingsIcon size={18} />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
