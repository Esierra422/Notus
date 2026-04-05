import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Button } from '../ui/Button'
import { getOrgMembers, MEMBERSHIP_STATES } from '../../lib/orgService'
import { createMeeting, MEETING_SCOPES, MEETING_CREATED_VIA } from '../../lib/meetingService'
import { getUserDoc, getDisplayName } from '../../lib/userService'
import './CreateEventModal.css'

/**
 * Create an org calendar event (optional video meeting) with invites.
 */
export function CreateEventModal({
  isOpen,
  onClose,
  user,
  activeOrgId,
  defaultDate,
  onCreated,
}) {
  const [title, setTitle] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')
  const [isVideoMeeting, setIsVideoMeeting] = useState(true)
  const [inviteOnly, setInviteOnly] = useState(false)
  const [inviteeIds, setInviteeIds] = useState([])
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setTitle('')
    setTimeStr('')
    setIsVideoMeeting(true)
    setInviteOnly(false)
    setInviteeIds([])
    if (defaultDate) {
      const d = defaultDate instanceof Date ? defaultDate : new Date(defaultDate)
      setDateStr(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      )
    } else {
      const n = new Date()
      setDateStr(
        `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
      )
    }
  }, [isOpen, defaultDate])

  useEffect(() => {
    if (!isOpen || !activeOrgId || !user?.uid) {
      setMembers([])
      return
    }
    let cancelled = false
    setMembersLoading(true)
    ;(async () => {
      try {
        const raw = await getOrgMembers(activeOrgId)
        const active = raw.filter(
          (m) => m.state === MEMBERSHIP_STATES.active && m.userId && m.userId !== user.uid
        )
        const profiles = {}
        await Promise.all(
          active.map(async (m) => {
            try {
              profiles[m.userId] = await getUserDoc(m.userId)
            } catch {
              profiles[m.userId] = null
            }
          })
        )
        if (!cancelled) {
          setMembers(active.map((m) => ({ userId: m.userId, profile: profiles[m.userId] })))
        }
      } catch {
        if (!cancelled) setMembers([])
      } finally {
        if (!cancelled) setMembersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, activeOrgId, user?.uid])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!title.trim() || !activeOrgId || !user?.uid) return
    setSaving(true)
    try {
      let startAt
      if (dateStr && timeStr) {
        startAt = Timestamp.fromDate(new Date(`${dateStr}T${timeStr}:00`))
      } else if (dateStr) {
        const [y, mo, d] = dateStr.split('-').map(Number)
        startAt = Timestamp.fromDate(new Date(y, mo - 1, d, 9, 0, 0))
      }
      await createMeeting(
        activeOrgId,
        {
          title: title.trim(),
          scope: MEETING_SCOPES.org,
          ...(startAt && { startAt }),
          invitedUserIds: inviteeIds,
          inviteOnly,
          isVideoMeeting,
          createdVia: MEETING_CREATED_VIA.calendar,
        },
        user.uid
      )
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not create event.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="create-event-overlay" role="dialog" aria-modal="true" aria-labelledby="create-event-title">
      <div className="create-event-backdrop" onClick={() => !saving && onClose()} />
      <div className="create-event-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="create-event-title" className="create-event-heading">
          Create event
        </h2>
        <form className="create-event-form" onSubmit={handleSubmit}>
          <label className="create-event-label">
            <span>Title</span>
            <input
              className="auth-input create-event-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              disabled={saving}
              autoFocus
            />
          </label>
          <div className="create-event-row">
            <label className="create-event-label">
              <span>Date</span>
              <input
                type="date"
                className="auth-input create-event-input"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="create-event-label">
              <span>Time</span>
              <input
                type="time"
                className="auth-input create-event-input"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                disabled={saving}
              />
            </label>
          </div>
          <label className="create-event-toggle">
            <input
              type="checkbox"
              checked={isVideoMeeting}
              onChange={(e) => setIsVideoMeeting(e.target.checked)}
              disabled={saving}
            />
            <span>Video meeting (join from Video meetings & calendar)</span>
          </label>
          <label className="create-event-toggle">
            <input
              type="checkbox"
              checked={inviteOnly}
              onChange={(e) => setInviteOnly(e.target.checked)}
              disabled={saving}
            />
            <span>Only invited people can see this event</span>
          </label>
          <div className="create-event-invite-section">
            <span className="create-event-invite-title">Invite org members</span>
            <div className="create-event-invite-scroll">
              {membersLoading ? (
                <p className="app-muted create-event-muted">Loading members…</p>
              ) : (
                <ul className="create-event-invite-list">
                  {members.map(({ userId: uid, profile }) => (
                    <li key={uid}>
                      <label className="create-event-invite-row">
                        <input
                          type="checkbox"
                          checked={inviteeIds.includes(uid)}
                          onChange={() => {
                            setInviteeIds((prev) =>
                              prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
                            )
                          }}
                          disabled={saving}
                        />
                        <span>{getDisplayName(profile, uid)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {error && <p className="create-event-error">{error}</p>}
          <div className="create-event-actions">
            <Button type="button" variant="ghost" onClick={() => !saving && onClose()} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
              {saving ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
