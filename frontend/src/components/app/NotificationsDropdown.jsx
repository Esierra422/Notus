import { useState, useEffect, useRef, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingInvitationsForEmail, acceptInvitation, rejectInvitation } from '../../lib/invitationService'
import {
  getPendingTeamInvitationsForEmail,
  acceptTeamInvitation,
  rejectTeamInvitation,
} from '../../lib/teamInvitationService'
import {
  NOTIFICATION_TYPES,
  subscribeNotifications,
  subscribeUnreadNotificationCount,
  markNotificationRead,
} from '../../lib/userNotificationService'
import { declineMeetingInvite } from '../../lib/meetingService'
import { BellIcon } from '../ui/Icons'
import './NotificationsDropdown.css'

export function NotificationsDropdown({ user }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [orgInvitations, setOrgInvitations] = useState([])
  const [teamInvitations, setTeamInvitations] = useState([])
  const [inboxItems, setInboxItems] = useState([])
  const [unreadInboxCount, setUnreadInboxCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [actioning, setActioning] = useState({})
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()

  const invitations = [
    ...orgInvitations.map((i) => ({ ...i, type: 'org' })),
    ...teamInvitations.map((i) => ({ ...i, type: 'team' })),
  ].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))

  const pendingInviteCount = invitations.length
  const hasUnread = unreadInboxCount > 0 || pendingInviteCount > 0

  useEffect(() => {
    if (!user?.email) return
    const loadInvites = async () => {
      try {
        const [orgList, teamList] = await Promise.all([
          getPendingInvitationsForEmail(user.email),
          getPendingTeamInvitationsForEmail(user.email),
        ])
        setOrgInvitations(orgList)
        setTeamInvitations(teamList)
      } catch {
        /* ignore */
      }
    }
    loadInvites()
    const t = setInterval(loadInvites, 60_000)
    return () => clearInterval(t)
  }, [user?.email])

  useEffect(() => {
    if (!user?.uid) return
    return subscribeUnreadNotificationCount(user.uid, setUnreadInboxCount)
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    return subscribeNotifications(user.uid, 40, setInboxItems)
  }, [user?.uid])

  useEffect(() => {
    if (!open) {
      setLoading(false)
      return
    }
    if (!user?.email?.trim()) {
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [orgList, teamList] = await Promise.all([
          getPendingInvitationsForEmail(user.email),
          getPendingTeamInvitationsForEmail(user.email),
        ])
        if (!cancelled) {
          setOrgInvitations(orgList)
          setTeamInvitations(teamList)
        }
      } catch (e) {
        console.warn('Failed to refresh invitations', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.email, open])

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
    const firstAction = panelRef.current?.querySelector('button')
    firstAction?.focus()
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
    }
  }

  const handleAcceptOrg = async (inv) => {
    setActioning((a) => ({ ...a, [inv.id]: true }))
    try {
      const { orgId } = await acceptInvitation(inv.id, user.uid, user.email)
      setOrgInvitations((list) => list.filter((i) => i.id !== inv.id))
      setOpen(false)
      navigate(`/app/org/${orgId}/admin`)
    } catch (err) {
      console.error(err)
    } finally {
      setActioning((a) => ({ ...a, [inv.id]: false }))
    }
  }

  const handleDeclineOrg = async (inv) => {
    setActioning((a) => ({ ...a, [inv.id]: true }))
    try {
      await rejectInvitation(inv.id, user.uid, user.email)
      setOrgInvitations((list) => list.filter((i) => i.id !== inv.id))
    } catch (err) {
      console.error(err)
    } finally {
      setActioning((a) => ({ ...a, [inv.id]: false }))
    }
  }

  const handleAcceptTeam = async (inv) => {
    setActioning((a) => ({ ...a, [inv.id]: true }))
    try {
      const { orgId, teamId } = await acceptTeamInvitation(inv.id, user.uid, user.email)
      setTeamInvitations((list) => list.filter((i) => i.id !== inv.id))
      setOpen(false)
      navigate(`/app/org/${orgId}/teams/${teamId}`)
    } catch (err) {
      console.error(err)
    } finally {
      setActioning((a) => ({ ...a, [inv.id]: false }))
    }
  }

  const handleDeclineTeam = async (inv) => {
    setActioning((a) => ({ ...a, [inv.id]: true }))
    try {
      await rejectTeamInvitation(inv.id, user.uid, user.email)
      setTeamInvitations((list) => list.filter((i) => i.id !== inv.id))
    } catch (err) {
      console.error(err)
    } finally {
      setActioning((a) => ({ ...a, [inv.id]: false }))
    }
  }

  const handleMeetingInviteAccept = async (n) => {
    if (!user?.uid || !n.orgId || !n.meetingId) return
    setActioning((a) => ({ ...a, [n.id]: true }))
    try {
      await markNotificationRead(user.uid, n.id)
      setOpen(false)
      if (n.type === NOTIFICATION_TYPES.calendarEventInvite) {
        navigate(`/app/org/${encodeURIComponent(n.orgId)}/calendar`)
      } else {
        navigate(`/app/org/${encodeURIComponent(n.orgId)}/video?meetingId=${encodeURIComponent(n.meetingId)}`)
      }
    } catch (e) {
      console.warn(e)
    } finally {
      setActioning((a) => ({ ...a, [n.id]: false }))
    }
  }

  const handleMeetingInviteDecline = async (n) => {
    if (!user?.uid || !n.orgId || !n.meetingId) return
    setActioning((a) => ({ ...a, [n.id]: true }))
    try {
      try {
        await declineMeetingInvite(n.orgId, n.meetingId, user.uid)
      } catch (e) {
        console.warn('declineMeetingInvite', e)
      }
      await markNotificationRead(user.uid, n.id)
    } catch (e) {
      console.warn(e)
    } finally {
      setActioning((a) => ({ ...a, [n.id]: false }))
    }
  }

  const handleDismissInbox = async (n) => {
    if (!user?.uid) return
    try {
      await markNotificationRead(user.uid, n.id)
    } catch {
      /* ignore */
    }
  }

  if (!user) return null

  return (
    <div className="notifications-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={['notifications-trigger', hasUnread ? 'notifications-trigger--unread' : ''].filter(Boolean).join(' ')}
        onClick={() => setOpen(!open)}
        onKeyDown={handleTriggerKeyDown}
        title="Notifications"
        aria-label={`Notifications${hasUnread ? ' (unread)' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
      >
        <BellIcon size={20} />
        {hasUnread && <span className="notifications-unread-dot" aria-hidden />}
        {pendingInviteCount > 0 && (
          <span className="notifications-badge">{pendingInviteCount > 9 ? '9+' : pendingInviteCount}</span>
        )}
      </button>
      {open && (
        <div
          className="notifications-panel"
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          ref={panelRef}
          onKeyDown={handlePanelKeyDown}
        >
          <h4 className="notifications-title">Notifications</h4>
          {loading && (
            <p className="notifications-empty notifications-panel-hint">Updating invitations…</p>
          )}
          {inboxItems.filter((n) => !n.read).length > 0 && (
                <ul className="notifications-list notifications-list--inbox">
                  {inboxItems
                    .filter((n) => !n.read)
                    .map((n) => (
                      <li key={n.id} className="notifications-item">
                        <p className="notifications-item-text">
                          {(n.type === NOTIFICATION_TYPES.meetingInvite ||
                            n.type === NOTIFICATION_TYPES.instantMeetingInvite ||
                            n.type === NOTIFICATION_TYPES.calendarEventInvite) && (
                            <>
                              {(n.senderDisplayName || n.orgName) && (
                                <span className="notifications-item-from">
                                  {n.senderDisplayName ? (
                                    <>
                                      <strong>{n.senderDisplayName}</strong>
                                      {n.orgName ? (
                                        <>
                                          {' '}
                                          <span className="notifications-item-from-sep" aria-hidden>
                                            ·
                                          </span>{' '}
                                          {n.orgName}
                                        </>
                                      ) : null}
                                    </>
                                  ) : (
                                    <strong>{n.orgName}</strong>
                                  )}
                                </span>
                              )}
                              <strong>{n.title || 'Meeting'}</strong>
                              <br />
                              <span className="notifications-item-sub">{n.body}</span>
                            </>
                          )}
                          {n.type !== NOTIFICATION_TYPES.meetingInvite &&
                            n.type !== NOTIFICATION_TYPES.instantMeetingInvite &&
                            n.type !== NOTIFICATION_TYPES.calendarEventInvite && (
                              <span>{n.title || 'Notification'}</span>
                            )}
                        </p>
                        <div className="notifications-item-actions">
                          {(n.type === NOTIFICATION_TYPES.meetingInvite ||
                            n.type === NOTIFICATION_TYPES.instantMeetingInvite ||
                            n.type === NOTIFICATION_TYPES.calendarEventInvite) &&
                            n.orgId &&
                            n.meetingId && (
                            <button
                              type="button"
                              className="notifications-btn notifications-btn-accept"
                              onClick={() => handleMeetingInviteAccept(n)}
                              disabled={actioning[n.id]}
                            >
                              {actioning[n.id]
                                ? '…'
                                : n.type === NOTIFICATION_TYPES.calendarEventInvite
                                  ? 'Accept'
                                  : 'Join'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="notifications-btn notifications-btn-decline"
                            onClick={() =>
                              (n.type === NOTIFICATION_TYPES.calendarEventInvite ||
                                n.type === NOTIFICATION_TYPES.meetingInvite ||
                                n.type === NOTIFICATION_TYPES.instantMeetingInvite) &&
                              n.orgId &&
                              n.meetingId
                                ? handleMeetingInviteDecline(n)
                                : handleDismissInbox(n)
                            }
                            disabled={actioning[n.id]}
                          >
                            {n.type === NOTIFICATION_TYPES.calendarEventInvite ||
                            n.type === NOTIFICATION_TYPES.meetingInvite ||
                            n.type === NOTIFICATION_TYPES.instantMeetingInvite
                              ? 'Decline'
                              : 'Dismiss'}
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
              {invitations.length === 0 && inboxItems.filter((n) => !n.read).length === 0 ? (
                <p className="notifications-empty">You’re all caught up.</p>
              ) : null}
              {invitations.length > 0 && (
                <ul className="notifications-list">
                  {invitations.map((inv) => (
                    <li key={`${inv.type}-${inv.id}`} className="notifications-item">
                      <p className="notifications-item-text">
                        {inv.type === 'org' ? (
                          <>
                            <strong>{inv.inviterName}</strong> invited you to join organization{' '}
                            <strong>{inv.orgName}</strong>
                          </>
                        ) : (
                          <>
                            <strong>{inv.inviterName}</strong> invited you to join team <strong>{inv.teamName}</strong>{' '}
                            in <strong>{inv.orgName}</strong>
                          </>
                        )}
                      </p>
                      <div className="notifications-item-actions">
                        <button
                          type="button"
                          className="notifications-btn notifications-btn-accept"
                          onClick={() => (inv.type === 'org' ? handleAcceptOrg(inv) : handleAcceptTeam(inv))}
                          disabled={actioning[inv.id]}
                        >
                          {actioning[inv.id] ? '…' : 'Accept'}
                        </button>
                        <button
                          type="button"
                          className="notifications-btn notifications-btn-decline"
                          onClick={() => (inv.type === 'org' ? handleDeclineOrg(inv) : handleDeclineTeam(inv))}
                          disabled={actioning[inv.id]}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      )}
    </div>
  )
}
