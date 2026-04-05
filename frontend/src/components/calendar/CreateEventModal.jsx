import { useState, useEffect, useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Button } from '../ui/Button'
import { getOrgMembers, MEMBERSHIP_STATES, membershipHasCapability } from '../../lib/orgService'
import { createMeeting, MEETING_SCOPES, MEETING_CREATED_VIA } from '../../lib/meetingService'
import { getUserDoc, getDisplayName } from '../../lib/userService'
import './CreateEventModal.css'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function pad2(n) {
  return String(n).padStart(2, '0')
}

function safeTimeZones() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone')
    }
  } catch {
    /* ignore */
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Africa/Cairo',
    'Asia/Dubai',
    'Asia/Tokyo',
  ]
}

function RepeatModal({ isOpen, onClose, value, onSave }) {
  const [frequency, setFrequency] = useState(value?.frequency || 'none')
  const [interval, setInterval] = useState(value?.interval || 1)
  const [byWeekday, setByWeekday] = useState(
    Array.isArray(value?.byWeekday) && value.byWeekday.length ? value.byWeekday : [new Date().getDay()]
  )

  useEffect(() => {
    if (!isOpen) return
    setFrequency(value?.frequency || 'none')
    setInterval(value?.interval || 1)
    setByWeekday(
      Array.isArray(value?.byWeekday) && value.byWeekday.length ? value.byWeekday : [new Date().getDay()]
    )
  }, [isOpen, value])

  if (!isOpen) return null

  const toggleDay = (d) => {
    setByWeekday((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))
  }

  return (
    <div className="create-event-repeat-overlay" role="dialog" aria-modal="true" aria-label="Repeat">
      <button type="button" className="create-event-repeat-backdrop" onClick={onClose} aria-label="Close" />
      <div className="create-event-repeat-modal">
        <h3 className="create-event-repeat-title">Repeat</h3>
        <label className="create-event-repeat-row">
          <span>Frequency</span>
          <select
            className="auth-input create-event-input"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        {frequency === 'weekly' && (
          <>
            <p className="create-event-repeat-every">
              Every{' '}
              <input
                type="number"
                min={1}
                max={12}
                className="create-event-repeat-interval"
                value={interval}
                onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />{' '}
              week(s) on:
            </p>
            <div className="create-event-repeat-dow">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  className={`create-event-repeat-dow-btn ${byWeekday.includes(i) ? 'create-event-repeat-dow-btn--on' : ''}`}
                  onClick={() => toggleDay(i)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        {frequency === 'daily' && (
          <label className="create-event-repeat-row">
            <span>Every</span>
            <input
              type="number"
              min={1}
              max={30}
              className="create-event-repeat-interval"
              value={interval}
              onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
            <span>day(s)</span>
          </label>
        )}
        <div className="create-event-repeat-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onSave(
                frequency === 'none'
                  ? null
                  : {
                      frequency,
                      interval,
                      ...(frequency === 'weekly' ? { byWeekday: byWeekday.length ? byWeekday : [0] } : {}),
                      until: null,
                    }
              )
              onClose()
            }}
          >
            OK
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Create org calendar event — choose calendar vs video, bio, timezone, repeat, invites (notifications).
 */
export function CreateEventModal({
  isOpen,
  onClose,
  user,
  activeOrgId,
  defaultDate,
  onCreated,
  /** When set, enforces schedule/org-calendar capabilities for this org. */
  myOrgMembership,
}) {
  const [flowStep, setFlowStep] = useState(null)
  const [eventKind, setEventKind] = useState(null)
  const [title, setTitle] = useState('')
  const [bio, setBio] = useState('')
  const [startDateStr, setStartDateStr] = useState('')
  const [startTimeStr, setStartTimeStr] = useState('')
  const [endDateStr, setEndDateStr] = useState('')
  const [endTimeStr, setEndTimeStr] = useState('')
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [recurrence, setRecurrence] = useState(null)
  const [inviteOnly, setInviteOnly] = useState(false)
  const [inviteeIds, setInviteeIds] = useState([])
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tzOptions = useMemo(() => safeTimeZones().sort(), [])

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setFlowStep('choose')
    setEventKind(null)
    setTitle('')
    setBio('')
    setStartTimeStr('09:00')
    setEndTimeStr('09:30')
    setRecurrence(null)
    setInviteOnly(false)
    setInviteeIds([])
    const base = defaultDate instanceof Date ? defaultDate : defaultDate ? new Date(defaultDate) : new Date()
    const ds = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`
    setStartDateStr(ds)
    setEndDateStr(ds)
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    } catch {
      setTimeZone('UTC')
    }
  }, [isOpen, defaultDate])

  useEffect(() => {
    if (!isOpen || !myOrgMembership) return
    if (!membershipHasCapability(myOrgMembership, 'orgCalendar')) {
      setInviteOnly(true)
    }
  }, [isOpen, myOrgMembership])

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

  const repeatSummary =
    !recurrence || recurrence.frequency === 'none'
      ? 'Never'
      : recurrence.frequency === 'daily'
        ? `Every ${recurrence.interval || 1} day(s)`
        : `Every ${recurrence.interval || 1} week(s)`

  const buildStartEnd = () => {
    const [y, mo, d] = startDateStr.split('-').map(Number)
    const [sh, sm] = (startTimeStr || '9:00').split(':').map((x) => parseInt(x, 10))
    const startAt = new Date(y, mo - 1, d, sh || 0, sm || 0, 0, 0)
    const [y2, mo2, d2] = (endDateStr || startDateStr).split('-').map(Number)
    const [eh, em] = (endTimeStr || '10:00').split(':').map((x) => parseInt(x, 10))
    const endAt = new Date(y2, mo2 - 1, d2, eh || 0, em || 0, 0, 0)
    if (endAt.getTime() <= startAt.getTime()) {
      const bump = new Date(startAt)
      bump.setMinutes(bump.getMinutes() + 30)
      return { startAt, endAt: bump }
    }
    return { startAt, endAt }
  }

  const canSchedule =
    !myOrgMembership || membershipHasCapability(myOrgMembership, 'scheduleMeetings')
  const canOrgCalendar =
    !myOrgMembership || membershipHasCapability(myOrgMembership, 'orgCalendar')
  const orgWideOk = inviteOnly || canOrgCalendar

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!title.trim() || !activeOrgId || !user?.uid || !eventKind) return
    if (myOrgMembership && !membershipHasCapability(myOrgMembership, 'scheduleMeetings')) {
      setError('You do not have permission to create meetings or calendar events in this organization.')
      return
    }
    if (myOrgMembership && !inviteOnly && !membershipHasCapability(myOrgMembership, 'orgCalendar')) {
      setError('You cannot publish organization-wide events. Turn on “Only invited people” or ask an admin to enable org calendar access.')
      return
    }
    setSaving(true)
    try {
      const { startAt, endAt } = buildStartEnd()
      await createMeeting(
        activeOrgId,
        {
          title: title.trim(),
          description: bio.trim(),
          scope: MEETING_SCOPES.org,
          startAt: Timestamp.fromDate(startAt),
          endAt: Timestamp.fromDate(endAt),
          invitedUserIds: inviteeIds,
          inviteOnly,
          isVideoMeeting: eventKind === 'video',
          createdVia: MEETING_CREATED_VIA.calendar,
          timeZone: timeZone || null,
          recurrence: recurrence && recurrence.frequency !== 'none' ? recurrence : null,
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
      <div className="create-event-modal create-event-modal--v2" onClick={(e) => e.stopPropagation()}>
        {flowStep === 'choose' && (
          <>
            <h2 id="create-event-title" className="create-event-heading">
              Create event
            </h2>
            <p className="create-event-lead">Choose what you’re scheduling — you can add details on the next step.</p>
            <div className="create-event-type-grid">
              <button
                type="button"
                className="create-event-type-card"
                onClick={() => {
                  setEventKind('calendar')
                  setFlowStep('form')
                }}
              >
                <span className="create-event-type-kicker">Calendar</span>
                <span className="create-event-type-title">Calendar event</span>
                <span className="create-event-type-desc">Block time, notes, optional invites — no video room.</span>
              </button>
              <button
                type="button"
                className="create-event-type-card create-event-type-card--accent"
                onClick={() => {
                  setEventKind('video')
                  setFlowStep('form')
                }}
              >
                <span className="create-event-type-kicker">Video</span>
                <span className="create-event-type-title">Video meeting</span>
                <span className="create-event-type-desc">Scheduled call with a Notus video room and transcript.</span>
              </button>
            </div>
            <div className="create-event-actions">
              <Button type="button" variant="ghost" onClick={() => !saving && onClose()} disabled={saving}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {flowStep === 'form' && eventKind && (
          <>
            <button
              type="button"
              className="create-event-back-link"
              onClick={() => setFlowStep('choose')}
              disabled={saving}
            >
              ← Back
            </button>
            <h2 id="create-event-title" className="create-event-heading">
              {eventKind === 'video' ? 'New video meeting' : 'New calendar event'}
            </h2>
            <form className="create-event-form create-event-form--v2" onSubmit={handleSubmit}>
              {myOrgMembership && !canSchedule && (
                <p className="create-event-cap-warning">
                  Your role is not allowed to create scheduled meetings here. Ask an organization admin to update your
                  capabilities.
                </p>
              )}
              {myOrgMembership && canSchedule && !canOrgCalendar && (
                <p className="create-event-cap-hint">
                  You can add events that are visible only to people you invite. Organization-wide visibility is disabled
                  for your role.
                </p>
              )}
              <label className="create-event-label create-event-label--full">
                <span>Title</span>
                <input
                  className="auth-input create-event-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={eventKind === 'video' ? 'e.g. Design review' : 'e.g. Focus block'}
                  disabled={saving}
                  autoFocus
                />
              </label>
              <label className="create-event-label create-event-label--full">
                <span>Description / bio</span>
                <textarea
                  className="auth-input create-event-textarea"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Agenda, links, or context for invitees…"
                  rows={3}
                  disabled={saving}
                />
              </label>

              <div className="create-event-datetime-row">
                <div className="create-event-datetime-group">
                  <span className="create-event-datetime-label">Start</span>
                  <div className="create-event-datetime-pair">
                    <input
                      type="date"
                      className="auth-input create-event-input create-event-input--compact"
                      value={startDateStr}
                      onChange={(e) => setStartDateStr(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="time"
                      className="auth-input create-event-input create-event-input--compact"
                      value={startTimeStr}
                      onChange={(e) => setStartTimeStr(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
                <span className="create-event-datetime-arrow" aria-hidden>
                  →
                </span>
                <div className="create-event-datetime-group">
                  <span className="create-event-datetime-label">End</span>
                  <div className="create-event-datetime-pair">
                    <input
                      type="date"
                      className="auth-input create-event-input create-event-input--compact"
                      value={endDateStr}
                      onChange={(e) => setEndDateStr(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="time"
                      className="auth-input create-event-input create-event-input--compact"
                      value={endTimeStr}
                      onChange={(e) => setEndTimeStr(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              <label className="create-event-label create-event-label--full">
                <span>Time zone</span>
                <select
                  className="auth-input create-event-input"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  disabled={saving}
                >
                  {tzOptions.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>

              <div className="create-event-repeat-trigger">
                <span className="create-event-label-text">Repeat</span>
                <button
                  type="button"
                  className="auth-input create-event-repeat-btn"
                  onClick={() => setRepeatOpen(true)}
                  disabled={saving}
                >
                  {repeatSummary}
                </button>
              </div>

              <label className="create-event-toggle">
                <input
                  type="checkbox"
                  checked={inviteOnly}
                  onChange={(e) => {
                    const on = e.target.checked
                    if (!on && myOrgMembership && !membershipHasCapability(myOrgMembership, 'orgCalendar')) {
                      setError('Organization-wide events require org calendar access for your role.')
                      return
                    }
                    setError('')
                    setInviteOnly(on)
                  }}
                  disabled={saving || (myOrgMembership && !canOrgCalendar)}
                />
                <span>Only invited people can see this event</span>
              </label>
              {myOrgMembership && !canOrgCalendar && (
                <p className="create-event-cap-hint create-event-cap-hint--tight">
                  Invite-only mode is required for your account.
                </p>
              )}

              <div className="create-event-invite-section">
                <span className="create-event-invite-title">Invitees</span>
                <p className="create-event-invite-hint">Selected people get an in-app notification in the bell menu.</p>
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
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving || !title.trim() || !canSchedule || !orgWideOk}
                >
                  {saving ? 'Saving…' : 'Create'}
                </Button>
              </div>
            </form>
          </>
        )}

        <RepeatModal
          isOpen={repeatOpen}
          onClose={() => setRepeatOpen(false)}
          value={recurrence}
          onSave={setRecurrence}
        />
      </div>
    </div>
  )
}
