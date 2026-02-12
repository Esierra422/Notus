import { Link, useParams } from 'react-router-dom'
import { subscribeConversations } from '../../lib/conversationService'
import { useState, useEffect } from 'react'
import { SettingsIcon, LayoutDashboardIcon, CalendarIcon, MessageSquareIcon, UserIcon, VideoIcon } from '../ui/Icons'
import { NotificationsDropdown } from './NotificationsDropdown'
import { Avatar } from './Avatar'
import './AppHeader.css'

export const PROFILE_UPDATED_EVENT = 'notus:profileUpdated'

export function triggerProfileRefresh() {
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
}

function ChatsNavLink({ user, activeOrgId }) {
  const { orgId: routeOrgId, chatId: routeChatId } = useParams()
  const [unreadTotal, setUnreadTotal] = useState(0)
  const orgIdForSubscription = routeOrgId || activeOrgId

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
    <Link to="/app/chats" className="app-nav-icon-btn" title="Chats" aria-label="Chats">
      <span className="app-nav-icon-wrap">
        <MessageSquareIcon size={20} />
        {unreadTotal > 0 && (
          <span className="app-nav-unread-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
        )}
      </span>
    </Link>
  )
}

function AdminNavLink({ isAdmin }) {
  if (!isAdmin) return null
  return (
    <Link to="/app/admin" className="app-nav-icon-btn" title="Admin" aria-label="Admin">
      <UserIcon size={20} />
    </Link>
  )
}

export function AppHeader({ user, orgName, activeOrgId, isAdmin, navExtraOverride, currentPageTitle }) {
  const pageLabel = currentPageTitle || 'Notus'
  const leftExtra = navExtraOverride !== undefined ? navExtraOverride : (
    <span className="app-page-title">{pageLabel}</span>
  )

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
            <Link to="/app/video" className="app-nav-icon-btn" title="Video Call" aria-label="Video Call">
              <VideoIcon size={20} />
            </Link>
            <ChatsNavLink user={user} activeOrgId={activeOrgId} />
            <AdminNavLink isAdmin={isAdmin} />
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
