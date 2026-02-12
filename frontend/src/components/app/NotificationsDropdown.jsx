import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingInvitationsForEmail, acceptInvitation, rejectInvitation } from '../../lib/invitationService'
import {
  getPendingTeamInvitationsForEmail,
  acceptTeamInvitation,
  rejectTeamInvitation,
} from '../../lib/teamInvitationService'
import { BellIcon } from '../ui/Icons'
import './NotificationsDropdown.css'

export function NotificationsDropdown({ user }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [orgInvitations, setOrgInvitations] = useState([])
  const [teamInvitations, setTeamInvitations] = useState([])
  const [loading, setLoading] = useState(false)
  const [actioning, setActioning] = useState({})
  const containerRef = useRef(null)

  const invitations = [
    ...orgInvitations.map((i) => ({ ...i, type: 'org' })),
    ...teamInvitations.map((i) => ({ ...i, type: 'team' })),
  ].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))

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

  if (!user) return null

  const count = invitations.length

  return (
    <div className="notifications-dropdown" ref={containerRef}>
      <button
        type="button"
        className="notifications-trigger"
        onClick={() => setOpen(!open)}
        title="Notifications"
        aria-label={`Notifications${count ? ` (${count} pending)` : ''}`}
      >
        <BellIcon size={20} />
        {count > 0 && <span className="notifications-badge">{count}</span>}
      </button>
      {open && (
        <div className="notifications-panel">
          <h4 className="notifications-title">Notifications</h4>
          {loading ? (
            <p className="notifications-empty">Loading…</p>
          ) : invitations.length === 0 ? (
            <p className="notifications-empty">No new notifications</p>
          ) : (
            <ul className="notifications-list">
              {invitations.map((inv) => (
                <li key={`${inv.type}-${inv.id}`} className="notifications-item">
                  <p className="notifications-item-text">
                    {inv.type === 'org' ? (
                      <>
                        <strong>{inv.inviterName}</strong> invited you to join organization <strong>{inv.orgName}</strong>
                      </>
                    ) : (
                      <>
                        <strong>{inv.inviterName}</strong> invited you to join team <strong>{inv.teamName}</strong> in <strong>{inv.orgName}</strong>
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
