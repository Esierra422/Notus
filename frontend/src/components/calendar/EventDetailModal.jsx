import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Video } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { Button } from '../ui/Button'
import { MoreVerticalIcon } from '../ui/Icons'
import { getTimeZone, getLocale } from '../../lib/dateUtils'
import {
  deleteMeeting,
  deleteMeetingOccurrence,
  getMeetingVideoRoomId,
  MEETING_SCOPES,
  MEETING_CREATED_VIA,
} from '../../lib/meetingService'
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

function formatEndLine(startAt, endAt, userDoc) {
  const en = endAt?.toMillis?.() ?? endAt
  if (!en) return null
  const d = new Date(en)
  const tz = getTimeZone(userDoc)
  const locale = getLocale(userDoc)
  const s = d.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(tz && { timeZone: tz }),
  })
  return `Ends ${s}`
}

function scopePlacementLabel(scope) {
  if (scope === MEETING_SCOPES.team) return 'Team'
  if (scope === MEETING_SCOPES.private) return 'Personal'
  return 'Organization'
}

function visibilityDescription(item) {
  const scope = item?.scope
  if (scope === MEETING_SCOPES.private) {
    return 'Shown on your personal calendar and to people you invited by email (org members).'
  }
  if (item?.inviteOnly === true) {
    return 'Invite-only: only people who were included for notifications (and admins) see this event on the calendar.'
  }
  if (scope === MEETING_SCOPES.team) {
    return 'Visible to members of this team who have team calendar access.'
  }
  return 'Visible to organization members who have access to the organization calendar.'
}

function notificationsSummary(item) {
  const n = Array.isArray(item?.invitedUserIds) ? item.invitedUserIds.length : 0
  if (n === 0) {
    return 'No extra bell notifications were sent for this event (or they were cleared). Hosts can change this in Edit event.'
  }
  return `${n} account${n === 1 ? '' : 's'} may receive (or have received) in-app notifications for this event. Full recipient rules are set in Edit event.`
}

export function EventDetailModal({
  item,
  isOpen,
  onClose,
  user,
  userDoc,
  canManageOrg = false,
  onUpdated,
  onDeleted,
  onEditEvent,
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [roomOpen, setRoomOpen] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deletePanelOpen, setDeletePanelOpen] = useState(false)
  const menuRef = useRef(null)

  const isOrgMeeting = item && item.orgId && !item._imported && !item._todo
  const isCreator = isOrgMeeting && user?.uid && item.createdBy === user.uid
  const canEdit = isOrgMeeting && user?.uid && (isCreator || canManageOrg)
  const canVideo = isOrgMeeting && item.isVideoMeeting !== false
  const isCalendarOnly = isOrgMeeting && item.isVideoMeeting === false
  const realMeetingId = item?._seriesId || item?.id
  const now = Date.now()
  const startMs = item?.startAt?.toMillis?.() ?? 0
  const endMs = item?.endAt?.toMillis?.() ?? null
  const scheduledEnded = endMs != null ? endMs < now : startMs > 0 && startMs < now - 60_000
  const showJoinVideo = canVideo && (!scheduledEnded || roomOpen === true)
  const isScheduledCalendarVideo =
    canVideo && item?.createdVia === MEETING_CREATED_VIA.calendar && startMs > 0

  const isRecurringSeries =
    item?.recurrence?.frequency && item.recurrence.frequency !== 'none'
  const isOneRecurrenceInstance = item?._recurrenceInstance === true && isRecurringSeries

  useEffect(() => {
    if (!isOpen || !item) return
    setError('')
    setMenuOpen(false)
    setDeletePanelOpen(false)
  }, [isOpen, item])

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [menuOpen])

  useEffect(() => {
    if (!deletePanelOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) setDeletePanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [deletePanelOpen, deleting])

  useEffect(() => {
    if (!isOpen || !isOrgMeeting || !canVideo || !item?.orgId || !realMeetingId) {
      setRoomOpen(null)
      return
    }
    let cancelled = false
    const channel = getMeetingVideoRoomId({ ...item, id: realMeetingId }, item.orgId)
    if (!channel) {
      setRoomOpen(false)
      return
    }
    ;(async () => {
      try {
        const rs = await getDoc(doc(db, 'videoChannels', channel, 'roomState', 'current'))
        if (cancelled) return
        if (!rs.exists()) {
          setRoomOpen(false)
          return
        }
        const d = rs.data() || {}
        setRoomOpen(!d.endedAt)
      } catch {
        if (!cancelled) setRoomOpen(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, isOrgMeeting, canVideo, item?.orgId, realMeetingId, item])

  if (!isOpen || !item) return null

  const runDeleteEntireSeries = async () => {
    if (!isOrgMeeting || !item.orgId || !user?.uid || !realMeetingId) return
    setDeleting(true)
    setError('')
    try {
      await deleteMeeting(item.orgId, realMeetingId, user.uid)
      onDeleted?.(realMeetingId)
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not delete.')
    } finally {
      setDeleting(false)
      setDeletePanelOpen(false)
    }
  }

  const runDeleteThisOccurrence = async () => {
    if (!isOrgMeeting || !item.orgId || !user?.uid || !realMeetingId) return
    const ms = item.startAt?.toMillis?.() ?? 0
    if (!ms) return
    setDeleting(true)
    setError('')
    try {
      await deleteMeetingOccurrence(item.orgId, realMeetingId, user.uid, ms)
      onUpdated?.()
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not remove this occurrence.')
    } finally {
      setDeleting(false)
      setDeletePanelOpen(false)
    }
  }

  const openDeleteFromMenu = () => {
    setMenuOpen(false)
    if (isRecurringSeries && isOneRecurrenceInstance) {
      setDeletePanelOpen(true)
    } else {
      if (window.confirm('Delete this event? This cannot be undone.')) {
        void runDeleteEntireSeries()
      }
    }
  }

  return (
    <div className="event-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
      <div className="event-detail-backdrop" onClick={() => !deleting && onClose()} />
      <div className="event-detail-modal event-detail-modal--v2" onClick={(e) => e.stopPropagation()}>
        <div className="event-detail-top">
          <h2 id="event-detail-title" className="event-detail-heading event-detail-heading--flex">
            <span className="event-detail-title-text">
              {item._todo ? 'Task' : item._imported ? 'Imported event' : item.title || 'Event'}
            </span>
            {canEdit && (
              <div className="event-detail-menu-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="event-detail-icon-btn"
                  aria-label="Event actions"
                  aria-expanded={menuOpen}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen((o) => !o)
                  }}
                  disabled={deleting}
                >
                  <MoreVerticalIcon size={20} />
                </button>
                {menuOpen && (
                  <div className="event-detail-menu-panel" role="menu">
                    <button
                      type="button"
                      className="event-detail-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        onEditEvent?.(item)
                      }}
                    >
                      Edit event
                    </button>
                    <button
                      type="button"
                      className="event-detail-menu-item event-detail-menu-item--danger"
                      role="menuitem"
                      onClick={openDeleteFromMenu}
                    >
                      Delete…
                    </button>
                  </div>
                )}
              </div>
            )}
          </h2>
        </div>

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
            <p className="event-detail-meta event-detail-meta--primary">{formatWhen(item.startAt, userDoc)}</p>
            {formatEndLine(item.startAt, item.endAt, userDoc) && (
              <p className="event-detail-meta-sub">{formatEndLine(item.startAt, item.endAt, userDoc)}</p>
            )}
            {item.description ? <p className="event-detail-description">{item.description}</p> : null}
            {item._orgName && <p className="event-detail-org">{item._orgName}</p>}
            {item._recurrenceInstance && (
              <p className="event-detail-muted">This is one occurrence of a repeating event.</p>
            )}

            <div className="event-detail-badges">
              {isCalendarOnly && <span className="event-detail-badge">Calendar only</span>}
              {canVideo && <span className="event-detail-badge event-detail-badge--video">Video</span>}
              {item.inviteOnly && <span className="event-detail-badge">Invite-only</span>}
              {item.recurrence?.frequency && item.recurrence.frequency !== 'none' && (
                <span className="event-detail-badge">Repeats</span>
              )}
            </div>

            <div className="event-detail-spec">
              <h3 className="event-detail-spec-title">Bio</h3>
              <dl className="event-detail-dl">
                <div className="event-detail-dl-row">
                  <dt>Placement</dt>
                  <dd>{scopePlacementLabel(item.scope)}</dd>
                </div>
                <div className="event-detail-dl-row">
                  <dt>Calendar visibility</dt>
                  <dd>{visibilityDescription(item)}</dd>
                </div>
                <div className="event-detail-dl-row">
                  <dt>Notifications</dt>
                  <dd>{notificationsSummary(item)}</dd>
                </div>
              </dl>
            </div>

            {canVideo && (
              <div className="event-detail-video-block">
                <h3 className="event-detail-spec-title">Video</h3>
                {isScheduledCalendarVideo && (
                  <p className="event-detail-muted event-detail-muted--tight">
                    Scheduled Notus video: if you join before the start time, you may wait in a lobby until the host
                    admits everyone or until the scheduled time—same idea as a professional waiting room.
                  </p>
                )}
                {showJoinVideo && (
                  <Link
                    className="event-detail-video-join-btn"
                    to={`/app/org/${encodeURIComponent(item.orgId)}/video?meetingId=${encodeURIComponent(realMeetingId)}`}
                    onClick={onClose}
                    aria-label="Join video meeting"
                    title="Join video meeting"
                  >
                    <Video size={22} strokeWidth={2.25} aria-hidden />
                  </Link>
                )}
                {canVideo && scheduledEnded && roomOpen === false && (
                  <div className="event-detail-past-block">
                    <p className="event-detail-muted">
                      This meeting has ended. You can’t join the room, but notes and transcripts may be available.
                    </p>
                    <Link className="event-detail-video-link" to="/app/video/meetings" onClick={onClose}>
                      Past meetings & transcripts →
                    </Link>
                  </div>
                )}
                {canVideo && scheduledEnded && roomOpen === null && (
                  <p className="event-detail-muted">Checking room status…</p>
                )}
              </div>
            )}

            {isCalendarOnly && (
              <div className="event-detail-calendar-block">
                <h3 className="event-detail-spec-title">Calendar</h3>
                <p className="event-detail-muted event-detail-muted--tight">
                  This is a time block without a Notus video room. Notifications and invites are configured in{' '}
                  <strong>Edit event</strong> (organization, team, or personal email invites).
                </p>
              </div>
            )}

            {error && <p className="event-detail-error">{error}</p>}

            <div className="event-detail-actions event-detail-actions--footer">
              {canEdit && (
                <Button type="button" variant="outline" onClick={() => onEditEvent?.(item)} disabled={deleting}>
                  Edit event
                </Button>
              )}
              <Button type="button" variant="primary" onClick={onClose} disabled={deleting}>
                Close
              </Button>
            </div>
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

      {deletePanelOpen && (
        <div className="event-detail-delete-popup-layer" aria-live="polite">
          <button
            type="button"
            className="event-detail-delete-popup-backdrop"
            aria-label="Close delete options"
            disabled={deleting}
            onClick={() => !deleting && setDeletePanelOpen(false)}
          />
          <div
            className="event-detail-delete-popup"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="event-delete-recurring-title"
            aria-describedby="event-delete-recurring-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="event-delete-recurring-title" className="event-detail-delete-popup-title">
              This is a repeating event.
            </p>
            <p id="event-delete-recurring-desc" className="event-detail-muted event-detail-delete-popup-lead">
              Do you want to delete this event only, or all future occurrences of this event?
            </p>
            <div className="event-detail-delete-popup-actions">
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={deleting}
                onClick={() => runDeleteThisOccurrence()}
              >
                {deleting ? 'Working…' : 'Delete this event only'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={deleting}
                onClick={() => {
                  if (
                    window.confirm(
                      'Are you sure you want to delete all future occurrences of this event? This cannot be undone.'
                    )
                  )
                    runDeleteEntireSeries()
                }}
              >
                {deleting ? 'Working…' : 'Delete all future events'}
              </Button>
              <Button type="button" variant="ghost" size="md" disabled={deleting} onClick={() => setDeletePanelOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
