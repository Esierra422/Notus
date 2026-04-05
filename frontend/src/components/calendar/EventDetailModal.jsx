import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui/Button'
import { getTimeZone, getLocale } from '../../lib/dateUtils'
import { deleteMeeting, updateMeeting } from '../../lib/meetingService'
import { getOrgMembers, MEMBERSHIP_STATES } from '../../lib/orgService'
import { getUserDoc, getDisplayName } from '../../lib/userService'
import './EventDetailModal.css'

function formatWhen(startAt, userDoc) {
  if (!startAt) return ''
  const ms = startAt?.toMillis?.() ?? startAt
  const d = new Date(ms)
  const tz = getTimeZone(userDoc)
  const locale = getLocale(userDoc)
  return d.toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(tz && { timeZone: tz }),
  })
}

export function EventDetailModal({
  item,
  isOpen,
  onClose,
  user,
  userDoc,
  onUpdated,
  onDeleted,
}) {
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [inviteeIds, setInviteeIds] = useState([])
  const [inviteOnly, setInviteOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const isOrgMeeting = item && item.orgId && !item._imported && !item._todo
  const isCreator = isOrgMeeting && user?.uid && item.createdBy === user.uid
  const canVideo = isOrgMeeting && item.isVideoMeeting !== false

  useEffect(() => {
    if (!isOpen || !item) return
    setError('')
    if (isOrgMeeting) {
      setInviteeIds(Array.isArray(item.invitedUserIds) ? [...item.invitedUserIds] : [])
      setInviteOnly(item.inviteOnly === true)
    }
  }, [isOpen, item, isOrgMeeting])

  useEffect(() => {
    if (!isOpen || !isCreator || !item?.orgId || !user?.uid) {
      setMembers([])
      return
    }
    let cancelled = false
    setLoadingMembers(true)
    ;(async () => {
      try {
        const raw = await getOrgMembers(item.orgId)
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
        if (!cancelled) setLoadingMembers(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, isCreator, item?.orgId, user?.uid])

  if (!isOpen || !item) return null

  const handleSaveInvites = async (e) => {
    e.preventDefault()
    if (!isCreator || !item.orgId) return
    setSaving(true)
    setError('')
    try {
      await updateMeeting(item.orgId, item.id, user.uid, {
        invitedUserIds: inviteeIds,
        inviteOnly,
      })
      onUpdated?.()
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isOrgMeeting || !item.orgId || !user?.uid) return
    if (!window.confirm('Delete this event?')) return
    setDeleting(true)
    setError('')
    try {
      await deleteMeeting(item.orgId, item.id, user.uid)
      onDeleted?.(item.id)
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not delete.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="event-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
      <div className="event-detail-backdrop" onClick={() => !saving && !deleting && onClose()} />
      <div className="event-detail-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="event-detail-title" className="event-detail-heading">
          {item._todo ? 'Task' : item._imported ? 'Imported event' : item.title || 'Event'}
        </h2>
        {item._todo && (
          <>
            <p className="event-detail-meta">{item.title}</p>
            <p className="event-detail-muted">Tasks are managed from your personal calendar.</p>
          </>
        )}
        {item._imported && (
          <>
            <p className="event-detail-meta">{formatWhen(item.startAt, userDoc)}</p>
            <p className="event-detail-muted">Imported events cannot be edited here.</p>
          </>
        )}
        {isOrgMeeting && (
          <>
            <p className="event-detail-meta">{formatWhen(item.startAt, userDoc)}</p>
            {item._orgName && <p className="event-detail-org">{item._orgName}</p>}
            <div className="event-detail-badges">
              {item.isVideoMeeting === false && <span className="event-detail-badge">No video</span>}
              {item.inviteOnly && <span className="event-detail-badge">Invite only</span>}
            </div>
            {canVideo && (
              <Link
                className="event-detail-video-link"
                to={`/app/org/${encodeURIComponent(item.orgId)}/video?meetingId=${encodeURIComponent(item.id)}`}
                onClick={onClose}
              >
                Open in Video meetings
              </Link>
            )}
            {isCreator && (
              <form className="event-detail-edit" onSubmit={handleSaveInvites}>
                <span className="event-detail-section-label">Invites & visibility</span>
                <label className="event-detail-check">
                  <input
                    type="checkbox"
                    checked={inviteOnly}
                    onChange={(e) => setInviteOnly(e.target.checked)}
                    disabled={saving}
                  />
                  <span>Only invited people can see this</span>
                </label>
                <div className="event-detail-invite-scroll">
                  {loadingMembers ? (
                    <p className="event-detail-muted">Loading members…</p>
                  ) : (
                    <ul className="event-detail-invite-list">
                      {members.map(({ userId: uid, profile }) => (
                        <li key={uid}>
                          <label className="event-detail-invite-row">
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
                {error && <p className="event-detail-error">{error}</p>}
                <div className="event-detail-actions">
                  <Button type="button" variant="ghost" onClick={handleDelete} disabled={saving || deleting}>
                    {deleting ? 'Deleting…' : 'Delete event'}
                  </Button>
                  <div className="event-detail-actions-right">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                      Close
                    </Button>
                    <Button type="submit" variant="primary" disabled={saving}>
                      {saving ? 'Saving…' : 'Save invites'}
                    </Button>
                  </div>
                </div>
              </form>
            )}
            {!isCreator && (
              <div className="event-detail-actions event-detail-actions--single">
                <Button type="button" variant="primary" onClick={onClose}>
                  Close
                </Button>
              </div>
            )}
          </>
        )}
        {(item._todo || item._imported) && (
          <div className="event-detail-actions event-detail-actions--single">
            <Button type="button" variant="primary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
