import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingInvitationsForEmail, acceptInvitation, rejectInvitation } from '../../lib/invitationService'
import { BellIcon } from '../ui/Icons'
import './NotificationsDropdown.css'

export function NotificationsDropdown({ user }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(false)
  const [actioning, setActioning] = useState({})
  const containerRef = useRef(null)

  useEffect(() => {
    if (!user?.email || !open) return
    const load = async () => {
      setLoading(true)
      try {
        const list = await getPendingInvitationsForEmail(user.email)
        setInvitations(list)
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

  const handleAccept = async (inv) => {
    setActioning((a) => ({ ...a, [inv.id]: true }))
    try {
      const { orgId } = await acceptInvitation(inv.id, user.uid, user.email)
      setInvitations((list) => list.filter((i) => i.id !== inv.id))
      setOpen(false)
      navigate(`/app/org/${orgId}`)
    } catch (err) {
      console.error(err)
    } finally {
      setActioning((a) => ({ ...a, [inv.id]: false }))
    }
  }

  const handleDecline = async (inv) => {
    setActioning((a) => ({ ...a, [inv.id]: true }))
    try {
      await rejectInvitation(inv.id, user.uid, user.email)
      setInvitations((list) => list.filter((i) => i.id !== inv.id))
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
                <li key={inv.id} className="notifications-item">
                  <p className="notifications-item-text">
                    <strong>{inv.inviterName}</strong> invited you to join <strong>{inv.orgName}</strong>
                  </p>
                  <div className="notifications-item-actions">
                    <button
                      type="button"
                      className="notifications-btn notifications-btn-accept"
                      onClick={() => handleAccept(inv)}
                      disabled={actioning[inv.id]}
                    >
                      {actioning[inv.id] ? '…' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      className="notifications-btn notifications-btn-decline"
                      onClick={() => handleDecline(inv)}
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
