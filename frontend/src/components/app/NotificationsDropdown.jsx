import { useState, useEffect, useRef } from 'react'
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
    if (!user?.email || !open) return
    const load = async () => {
      setLoading(true)
      try {
        const [orgList, teamList] = await Promise.all([
          getPendingInvitationsForEmail(user.email),
          getPendingTeamInvitationsForEmail(user.email),
        ])
        setOrgInvitations(orgList)
        setTeamInvitations(teamList)
      } finally {
        setLoading(false)
      }
    }
    load()
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
      navigate(`/app/org/${encodeURIComponent(n.orgId)}/video?meetingId=${encodeURIComponent(n.meetingId)}`)
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
        type="button"
        className={['notifications-trigger', hasUnread ? 'notifications-trigger--unread' : ''].filter(Boolean).join(' ')}
        onClick={() => setOpen(!open)}
        title="Notifications"
        aria-label={`Notifications${hasUnread ? ' (unread)' : ''}`}
      >
        <BellIcon size={20} />
        {hasUnread && <span className="notifications-unread-dot" aria-hidden />}
        {pendingInviteCount > 0 && (
          <span className="notifications-badge">{pendingInviteCount > 9 ? '9+' : pendingInviteCount}</span>
        )}
      </button>
      {open && (
        <div className="notifications-panel">
          <h4 className="notifications-title">Notifications</h4>
          {loading ? (
            <p className="notifications-empty">Loading…</p>
          ) : (
            <>
              {inboxItems.filter((n) => !n.read).length > 0 && (
                <ul className="notifications-list notifications-list--inbox">
                  {inboxItems
                    .filter((n) => !n.read)
                    .map((n) => (
                      <li key={n.id} className="notifications-item">
                        <p className="notifications-item-text">
                          {(n.type === NOTIFICATION_TYPES.meetingInvite ||
                            n.type === NOTIFICATION_TYPES.instantMeetingInvite) && (
                            <>
                              <strong>{n.title || 'Meeting'}</strong>
                              <br />
                              <span className="notifications-item-sub">{n.body}</span>
                            </>
                          )}
                          {n.type !== NOTIFICATION_TYPES.meetingInvite &&
                            n.type !== NOTIFICATION_TYPES.instantMeetingInvite && (
                              <span>{n.title || 'Notification'}</span>
                            )}
                        </p>
                        <div className="notifications-item-actions">
                          {(n.type === NOTIFICATION_TYPES.meetingInvite ||
                            n.type === NOTIFICATION_TYPES.instantMeetingInvite) &&
                            n.orgId &&
                            n.meetingId && (
                            <button
                              type="button"
                              className="notifications-btn notifications-btn-accept"
                              onClick={() => handleMeetingInviteAccept(n)}
                              disabled={actioning[n.id]}
                            >
                              {actioning[n.id] ? '…' : 'Join'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="notifications-btn notifications-btn-decline"
                            onClick={() => handleDismissInbox(n)}
                            disabled={actioning[n.id]}
                          >
                            Dismiss
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
