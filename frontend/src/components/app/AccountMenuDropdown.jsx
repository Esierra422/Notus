import { useState, useEffect, useRef, useId } from 'react'
import { Link } from 'react-router-dom'
import { SettingsIcon, UserIcon } from '../ui/Icons'
import { getUserDoc, getDisplayName } from '../../lib/userService'
import { Avatar } from './Avatar'
import './AccountMenuDropdown.css'

export function AccountMenuDropdown({ user }) {
  const [open, setOpen] = useState(false)
  const [userDoc, setUserDoc] = useState(null)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const menuId = useId()

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

  useEffect(() => {
    if (!open) return
    const firstItem = panelRef.current?.querySelector('.account-menu-item')
    firstItem?.focus()
  }, [open])

  const handleTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handlePanelKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(panelRef.current?.querySelectorAll('.account-menu-item') || [])
    if (!items.length) return
    e.preventDefault()
    const current = document.activeElement
    const idx = items.indexOf(current)
    const nextIdx = e.key === 'ArrowDown'
      ? (idx + 1 + items.length) % items.length
      : (idx - 1 + items.length) % items.length
    items[nextIdx]?.focus()
  }

  if (!user) return null

  const displayName = getDisplayName(userDoc, user.uid, user)

  return (
    <div className="account-menu-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-menu-trigger account-menu-trigger-avatar"
        onClick={() => setOpen(!open)}
        onKeyDown={handleTriggerKeyDown}
        title="Account menu"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
      >
        <Avatar user={user} size={30} />
      </button>
      {open && (
        <div className="account-menu-panel" id={menuId} role="menu" ref={panelRef} onKeyDown={handlePanelKeyDown}>
          <div className="account-menu-header">
            <Avatar user={user} size={40} />
            <div className="account-menu-user">
              {displayName && <span className="account-menu-name">{displayName}</span>}
              <span className="account-menu-email">{user.email || 'Signed in'}</span>
            </div>
          </div>
          <div className="account-menu-list">
            <Link to="/app/profile" className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <UserIcon size={18} />
              <span>Profile</span>
            </Link>
            <Link to="/app/settings" className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <SettingsIcon size={18} />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
