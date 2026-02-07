import { Link, useParams } from 'react-router-dom'
import { getUserDoc, getProfilePictureUrl } from '../../lib/userService'
import { getActiveMembership } from '../../lib/orgService'
import { subscribeConversations } from '../../lib/conversationService'
import { useState, useEffect } from 'react'
import { SettingsIcon, LayoutDashboardIcon, CalendarIcon, MessageSquareIcon, UserIcon } from '../ui/Icons'
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

function ChatsNavLink({ user, activeOrgId }) {
  const { orgId: routeOrgId, chatId: routeChatId } = useParams()
  const [navOrgId, setNavOrgId] = useState(null)
  const [unreadTotal, setUnreadTotal] = useState(0)

  const orgIdForSubscription = routeOrgId || activeOrgId

  useEffect(() => {
    if (!user?.uid) return
    getActiveMembership(user.uid).then((active) => {
      if (active?.orgId) setNavOrgId(active.orgId)
    })
  }, [user?.uid])

  useEffect(() => {
    if (!orgIdForSubscription || !user?.uid) {
      setUnreadTotal(0)
      return
    }
    const unsub = subscribeConversations(orgIdForSubscription, user.uid, (convs) => {
      const total = convs.reduce((sum, c) => {
        if (routeChatId && c.id === routeChatId) return sum
        return sum + (c.unreadCount?.[user.uid] ?? 0)
      }, 0)
      setUnreadTotal(total)
    })
    return unsub
  }, [orgIdForSubscription, user?.uid, routeChatId])

  return (
    <Link to={navOrgId ? `/app/org/${navOrgId}/chats` : '/app/chats'} className="app-nav-icon-btn" title="Chats" aria-label="Chats">
      <span className="app-nav-icon-wrap">
        <MessageSquareIcon size={20} />
        {unreadTotal > 0 && (
          <span className="app-nav-unread-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
        )}
      </span>
    </Link>
  )
}

export function AppHeader({ user, orgName, activeOrgId, isAdmin, navExtraOverride }) {
  const leftExtra = navExtraOverride !== undefined ? navExtraOverride : (orgName ? <span className="app-org-name">{orgName}</span> : null)

  return (
    <header className="app-header">
      <div className="app-header-left">
        <Link to="/app" className="app-logo">Notus</Link>
        {leftExtra && <span className="app-header-org">{leftExtra}</span>}
      </div>
      <nav className="app-nav">
        {user && (
          <>
            <Link to="/app" className="app-nav-icon-btn" title="Dashboard" aria-label="Dashboard">
              <LayoutDashboardIcon size={20} />
            </Link>
            <Link to="/app/calendar" className="app-nav-icon-btn" title="Calendar" aria-label="Calendar">
              <CalendarIcon size={20} />
            </Link>
            <ChatsNavLink user={user} activeOrgId={activeOrgId} />
            {isAdmin && activeOrgId && (
              <Link to={`/app/org/${activeOrgId}/admin`} className="app-nav-icon-btn" title="Admin" aria-label="Admin">
                <UserIcon size={20} />
              </Link>
            )}
          </>
        )}
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
