import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../../hooks/useScrollLock.js'
import { Timestamp } from 'firebase/firestore'
import { Button } from '../ui/Button'
import {
  getOrgMembers,
  getMembership,
  MEMBERSHIP_STATES,
  membershipHasCapability,
  getCapabilityDeniedMessage,
} from '../../lib/orgService'
import { getTeamsForUserInOrg, getTeamMembers, TEAM_STATES } from '../../lib/teamService'
import { createMeeting, updateMeeting, MEETING_SCOPES, MEETING_CREATED_VIA } from '../../lib/meetingService'
import { getUserDoc, getDisplayName, getProfilePictureUrl } from '../../lib/userService'
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

function untilDateStrFromValue(value) {
  const u = value?.until
  if (!u?.toMillis) return ''
  const d = new Date(u.toMillis())
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function RepeatModal({ isOpen, onClose, value, onSave, eventStartDateStr }) {
  const [frequency, setFrequency] = useState(value?.frequency || 'none')
  const [interval, setInterval] = useState(value?.interval || 1)
  const [byWeekday, setByWeekday] = useState(
    Array.isArray(value?.byWeekday) && value.byWeekday.length ? value.byWeekday : [new Date().getDay()]
  )
  const [untilMode, setUntilMode] = useState('never')
  const [untilDateStr, setUntilDateStr] = useState('')
  const [repeatWeeksCount, setRepeatWeeksCount] = useState(4)
  const [repeatFooterErr, setRepeatFooterErr] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setRepeatFooterErr('')
    setFrequency(value?.frequency || 'none')
    setInterval(value?.interval || 1)
    setByWeekday(
      Array.isArray(value?.byWeekday) && value.byWeekday.length ? value.byWeekday : [new Date().getDay()]
    )
    const hasUntil = !!(value?.until && typeof value.until.toMillis === 'function')
    const wk = value?.endAfterWeeks
    if (typeof wk === 'number' && wk >= 1) {
      setUntilMode('after_weeks')
      setRepeatWeeksCount(wk)
      setUntilDateStr('')
    } else if (hasUntil) {
      setUntilMode('on_date')
      setUntilDateStr(untilDateStrFromValue(value))
    } else {
      setUntilMode('never')
      setUntilDateStr('')
    }
  }, [isOpen, value])

  useScrollLock(isOpen)
  if (!isOpen) return null

  const toggleDay = (d) => {
    setByWeekday((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))
  }

  return (
    <div className="create-event-repeat-overlay" role="dialog" aria-modal="true" aria-label="Repeat">
      <button type="button" className="create-event-repeat-backdrop" onClick={onClose} aria-label="Close" />
      <div className="create-event-repeat-modal">
        <h3 className="create-event-repeat-title">Recurrence</h3>
        <label className="create-event-repeat-row">
          <span>Frequency</span>
          <select
            className="auth-input create-event-input create-event-repeat-select"
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
        {frequency !== 'none' && (
          <>
            <label className="create-event-repeat-row">
              <span>End repeat</span>
              <select
                className="auth-input create-event-input create-event-repeat-select"
                value={untilMode}
                onChange={(e) => {
                  setUntilMode(e.target.value)
                  setRepeatFooterErr('')
                }}
              >
                <option value="never">Never</option>
                <option value="after_weeks">After number of weeks</option>
                <option value="on_date">On date</option>
              </select>
            </label>
            {untilMode === 'after_weeks' && (
              <label className="create-event-repeat-row">
                <span>Number of weeks</span>
                <div className="create-event-repeat-weeks-field">
                  <input
                    type="number"
                    min={1}
                    max={520}
                    className="auth-input create-event-input create-event-repeat-weeks-input"
                    value={repeatWeeksCount}
                    onChange={(e) => setRepeatWeeksCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                  <span className="create-event-repeat-weeks-hint">Series ends after this many weeks from the event start date (inclusive span).</span>
                </div>
              </label>
            )}
            {untilMode === 'on_date' && (
              <label className="create-event-repeat-row">
                <span>Ends on</span>
                <input
                  type="date"
                  className="auth-input create-event-input create-event-repeat-date-input"
                  value={untilDateStr}
                  onChange={(e) => setUntilDateStr(e.target.value)}
                />
              </label>
            )}
          </>
        )}
        {repeatFooterErr && <p className="create-event-repeat-footer-err">{repeatFooterErr}</p>}
        <div className="create-event-repeat-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setRepeatFooterErr('')
              if (frequency === 'none') {
                onSave(null)
                onClose()
                return
              }
              if (untilMode === 'on_date' && !untilDateStr?.trim()) {
                setRepeatFooterErr('Choose an end date, or pick a different end option.')
                return
              }
              let untilTs = null
              let endAfterWeeks = null
              if (untilMode === 'on_date' && untilDateStr) {
                const [uy, um, ud] = untilDateStr.split('-').map(Number)
                if (uy && um && ud) {
                  untilTs = Timestamp.fromDate(new Date(uy, um - 1, ud, 23, 59, 59, 999))
                }
              } else if (untilMode === 'after_weeks') {
                const w = Math.max(1, parseInt(String(repeatWeeksCount), 10) || 1)
                const ds = (eventStartDateStr || '').trim()
                const [y, m, d] = ds.split('-').map(Number)
                if (!y || !m || !d) {
                  setRepeatFooterErr('Set the event start date on the previous screen, then try again.')
                  return
                }
                endAfterWeeks = w
                const startMid = new Date(y, m - 1, d, 0, 0, 0, 0)
                const end = new Date(startMid)
                end.setDate(end.getDate() + w * 7)
                end.setHours(23, 59, 59, 999)
                untilTs = Timestamp.fromDate(end)
              }
              onSave({
                frequency,
                interval,
                ...(frequency === 'weekly' ? { byWeekday: byWeekday.length ? byWeekday : [0] } : {}),
                ...(untilTs ? { until: untilTs } : {}),
                ...(untilMode === 'after_weeks' && endAfterWeeks != null ? { endAfterWeeks } : {}),
              })
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
  /** After a successful edit (updateMeeting). */
  onUpdated,
  /** When set, modal opens on the form step to edit this meeting (use series id for recurring). */
  editingMeeting = null,
  /** When set, used as fallback while loading the selected org (same as activeOrgId). */
  myOrgMembership,
  /** Orgs the user belongs to; used to resolve placement + org/team pickers (create flow). */
  orgOptions = null,
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
  /** org/team: everyone | none | pick (pick = edit-only custom list). personal: solo | emails */
  const [notifyPolicy, setNotifyPolicy] = useState('everyone')
  /** Search query for personal “invite people” picker (org members). */
  const [personalInviteSearch, setPersonalInviteSearch] = useState('')
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersFetchError, setMembersFetchError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [eventPlacement, setEventPlacement] = useState('org')
  const [createTeamId, setCreateTeamId] = useState(null)
  const [selectedOrgId, setSelectedOrgId] = useState(activeOrgId)
  const [modalOrgMembership, setModalOrgMembership] = useState(null)
  const [modalTeams, setModalTeams] = useState([])
  const [modalTeamMemberships, setModalTeamMemberships] = useState({})
  const [orgCtxLoading, setOrgCtxLoading] = useState(false)
  const openSessionRef = useRef(null)
  const editNotifySyncedKeyRef = useRef('')
  const prevPlacementForNotifyRef = useRef(null)
  /** Create flow: orgs where user may schedule org events; teams allowed for team calendar; personal uses personalOrgId only (no org UI). */
  const [placementSurvey, setPlacementSurvey] = useState({
    loading: false,
    orgChoices: [],
    teamChoices: [],
    personalOrgId: null,
  })
  const tzOptions = useMemo(() => safeTimeZones().sort(), [])

  const orgListForPlacement = useMemo(() => {
    if (Array.isArray(orgOptions) && orgOptions.length > 0) return orgOptions
    if (activeOrgId) return [{ orgId: activeOrgId, name: 'Organization' }]
    return []
  }, [orgOptions, activeOrgId])

  const editingStableKey = editingMeeting ? editingMeeting._seriesId || editingMeeting.id : null

  useEffect(() => {
    if (!isOpen) {
      openSessionRef.current = null
      return
    }
    const sessionKey = `${editingStableKey || 'new'}`
    if (openSessionRef.current === sessionKey) return
    openSessionRef.current = sessionKey
    if (editingMeeting) {
      setSelectedOrgId(editingMeeting._orgId || editingMeeting.orgId || activeOrgId)
    } else {
      setSelectedOrgId(activeOrgId)
    }
  }, [isOpen, activeOrgId, editingMeeting, editingStableKey])

  useEffect(() => {
    if (!isOpen || !user?.uid || editingMeeting) return
    if (orgListForPlacement.length === 0) {
      setPlacementSurvey({ loading: false, orgChoices: [], teamChoices: [], personalOrgId: null })
      return
    }
    let cancelled = false
    setPlacementSurvey((prev) => ({ ...prev, loading: true }))
    ;(async () => {
      const orgChoices = []
      const teamChoices = []
      let personalOrgId = null
      for (const o of orgListForPlacement) {
        try {
          const mem = await getMembership(o.orgId, user.uid)
          if (cancelled || !mem || mem.state !== MEMBERSHIP_STATES.active) continue
          const canSchedO = membershipHasCapability(mem, 'scheduleOrgMeetings')
          const canSchedT = membershipHasCapability(mem, 'scheduleTeamMeetings')
          const canOrgCal = membershipHasCapability(mem, 'orgCalendar')
          const canTeamCal = membershipHasCapability(mem, 'teamCalendar')
          if (canSchedO) {
            if (!personalOrgId) personalOrgId = o.orgId
            orgChoices.push({ orgId: o.orgId, name: o.name, canOrgCal })
          }
          if (canSchedT && canTeamCal) {
            const myTeams = await getTeamsForUserInOrg(o.orgId, user.uid)
            for (const t of myTeams) {
              teamChoices.push({
                orgId: o.orgId,
                teamId: t.id,
                teamName: t.name || 'Team',
                orgName: o.name,
              })
            }
          }
        } catch {
          /* skip org */
        }
      }
      if (!cancelled) {
        setPlacementSurvey({ loading: false, orgChoices, teamChoices, personalOrgId })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, user?.uid, editingMeeting, orgListForPlacement])

  useEffect(() => {
    if (!isOpen || editingMeeting || placementSurvey.loading) return
    const { personalOrgId, orgChoices, teamChoices } = placementSurvey
    const validPersonal =
      eventPlacement === 'personal' && !!personalOrgId && selectedOrgId === personalOrgId
    const validOrg = eventPlacement === 'org' && orgChoices.some((c) => c.orgId === selectedOrgId)
    const validTeam =
      eventPlacement === 'team' &&
      teamChoices.some((c) => c.orgId === selectedOrgId && c.teamId === createTeamId)
    if (validPersonal || validOrg || validTeam) return
    if (orgChoices.length > 0) {
      setEventPlacement('org')
      setSelectedOrgId(orgChoices[0].orgId)
      setCreateTeamId(null)
      return
    }
    if (teamChoices.length > 0) {
      setEventPlacement('team')
      const t0 = teamChoices[0]
      setSelectedOrgId(t0.orgId)
      setCreateTeamId(t0.teamId)
      return
    }
    if (personalOrgId) {
      setEventPlacement('personal')
      setSelectedOrgId(personalOrgId)
      setCreateTeamId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placement survey fields listed explicitly in deps
  }, [
    isOpen,
    editingMeeting,
    placementSurvey.loading,
    placementSurvey.personalOrgId,
    placementSurvey.orgChoices,
    placementSurvey.teamChoices,
    eventPlacement,
    selectedOrgId,
    createTeamId,
  ])

  useEffect(() => {
    if (!isOpen || !selectedOrgId || !user?.uid) {
      setModalOrgMembership(null)
      setModalTeams([])
      setModalTeamMemberships({})
      setOrgCtxLoading(false)
      return
    }
    let cancelled = false
    setOrgCtxLoading(true)
    setModalTeams([])
    setModalTeamMemberships({})
    setModalOrgMembership(null)
    ;(async () => {
      try {
        const [mem, userTeams] = await Promise.all([
          getMembership(selectedOrgId, user.uid),
          getTeamsForUserInOrg(selectedOrgId, user.uid),
        ])
        if (cancelled) return
        setModalOrgMembership(mem)
        setModalTeams(userTeams)
        if (!cancelled) {
          setModalTeamMemberships(
            Object.fromEntries(userTeams.map((t) => [t.id, { state: TEAM_STATES.active }]))
          )
        }
      } catch {
        if (!cancelled) {
          setModalOrgMembership(null)
          setModalTeams([])
          setModalTeamMemberships({})
        }
      } finally {
        if (!cancelled) setOrgCtxLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedOrgId, user?.uid])

  const effectiveMembership = modalOrgMembership ?? (selectedOrgId === activeOrgId ? myOrgMembership : null)

  const needMemberDirectory = useMemo(
    () =>
      (Boolean(editingMeeting) && eventPlacement !== 'personal') ||
      ((eventPlacement === 'org' || eventPlacement === 'team') && notifyPolicy === 'pick') ||
      (eventPlacement === 'personal' && notifyPolicy === 'emails'),
    [editingMeeting, eventPlacement, notifyPolicy]
  )

  const memberIdsKey = useMemo(() => members.map((m) => m.userId).sort().join(','), [members])

  useEffect(() => {
    if (!editingMeeting) editNotifySyncedKeyRef.current = ''
  }, [editingMeeting])

  useEffect(() => {
    editNotifySyncedKeyRef.current = ''
  }, [editingStableKey])

  useEffect(() => {
    if (!isOpen || editingMeeting) return
    const prev = prevPlacementForNotifyRef.current
    if (prev !== null && prev !== eventPlacement) {
      if (eventPlacement === 'personal') {
        setNotifyPolicy('solo')
        setInviteeIds([])
        setPersonalInviteSearch('')
      } else {
        setNotifyPolicy('everyone')
      }
    }
    prevPlacementForNotifyRef.current = eventPlacement
  }, [isOpen, editingMeeting, eventPlacement])

  useEffect(() => {
    if (!isOpen || !editingMeeting || eventPlacement === 'personal') return
    if (membersLoading || membersFetchError) return
    const syncKeyBase = `${editingStableKey}|${selectedOrgId}|${createTeamId}|${memberIdsKey}`
    if (editNotifySyncedKeyRef.current === syncKeyBase) return

    const allIds = new Set(members.map((m) => m.userId))
    const inv = new Set(inviteeIds)
    const sameSize = allIds.size === inv.size && [...allIds].every((id) => inv.has(id))
    if (sameSize && allIds.size > 0) setNotifyPolicy('everyone')
    else if (inviteeIds.length === 0) setNotifyPolicy('none')
    else setNotifyPolicy('pick')

    editNotifySyncedKeyRef.current = syncKeyBase
  }, [
    isOpen,
    editingMeeting,
    eventPlacement,
    membersLoading,
    membersFetchError,
    editingStableKey,
    selectedOrgId,
    createTeamId,
    memberIdsKey,
    inviteeIds,
    members,
  ])

  useEffect(() => {
    if (!isOpen) return
    setError('')
    const editId = editingMeeting?._seriesId || editingMeeting?.id
    if (editingMeeting && editId) {
      setFlowStep('form')
      setEventKind(editingMeeting.isVideoMeeting === false ? 'calendar' : 'video')
      setTitle(editingMeeting.title || '')
      setBio(typeof editingMeeting.description === 'string' ? editingMeeting.description : '')
      const st = editingMeeting.startAt?.toMillis?.() ?? 0
      const en = editingMeeting.endAt?.toMillis?.() ?? null
      const sd = st ? new Date(st) : new Date()
      const ed = en ? new Date(en) : sd
      setStartDateStr(`${sd.getFullYear()}-${pad2(sd.getMonth() + 1)}-${pad2(sd.getDate())}`)
      setEndDateStr(`${ed.getFullYear()}-${pad2(ed.getMonth() + 1)}-${pad2(ed.getDate())}`)
      setStartTimeStr(`${pad2(sd.getHours())}:${pad2(sd.getMinutes())}`)
      setEndTimeStr(`${pad2(ed.getHours())}:${pad2(ed.getMinutes())}`)
      setTimeZone(
        typeof editingMeeting.timeZone === 'string' && editingMeeting.timeZone.trim()
          ? editingMeeting.timeZone.trim()
          : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      )
      setRecurrence(
        editingMeeting.recurrence && typeof editingMeeting.recurrence === 'object'
          ? editingMeeting.recurrence
          : null
      )
      setInviteOnly(editingMeeting.inviteOnly === true)
      setInviteeIds(
        Array.isArray(editingMeeting.invitedUserIds) ? [...editingMeeting.invitedUserIds] : []
      )
      setNotifyPolicy(
        editingMeeting.scope === MEETING_SCOPES.private
          ? Array.isArray(editingMeeting.invitedUserIds) && editingMeeting.invitedUserIds.length > 0
            ? 'emails'
            : 'solo'
          : 'everyone'
      )
      setPersonalInviteSearch('')
      if (editingMeeting.scope === MEETING_SCOPES.team) {
        setEventPlacement('team')
        setCreateTeamId(editingMeeting.scopeTeamId || null)
      } else if (editingMeeting.scope === MEETING_SCOPES.private) {
        setEventPlacement('personal')
        setCreateTeamId(null)
      } else {
        setEventPlacement('org')
        setCreateTeamId(null)
      }
      return
    }
    setFlowStep('choose')
    setEventKind(null)
    setTitle('')
    setBio('')
    setStartTimeStr('09:00')
    setEndTimeStr('09:30')
    setRecurrence(null)
    setInviteOnly(false)
    setInviteeIds([])
    setNotifyPolicy('everyone')
    setPersonalInviteSearch('')
    editNotifySyncedKeyRef.current = ''
    prevPlacementForNotifyRef.current = null
    const base = defaultDate instanceof Date ? defaultDate : defaultDate ? new Date(defaultDate) : new Date()
    const ds = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`
    setStartDateStr(ds)
    setEndDateStr(ds)
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    } catch {
      setTimeZone('UTC')
    }
    setEventPlacement('org')
    setCreateTeamId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `editingStableKey` keys the draft; `editingMeeting` ref alone can churn.
  }, [isOpen, defaultDate, editingStableKey])

  useEffect(() => {
    if (!isOpen || !selectedOrgId) return
    const activeTeams = modalTeams.filter((t) => modalTeamMemberships[t.id]?.state === 'active')
    const editId = editingMeeting?._seriesId || editingMeeting?.id
    if (editingMeeting && editId) {
      if (editingMeeting.scope === MEETING_SCOPES.team) {
        const tid = editingMeeting.scopeTeamId
        if (tid && activeTeams.some((t) => t.id === tid)) {
          setCreateTeamId(tid)
        } else if (activeTeams.length) {
          setCreateTeamId(activeTeams[0].id)
        } else {
          setCreateTeamId(null)
        }
      }
      return
    }
    if (eventPlacement === 'team') {
      setCreateTeamId((prev) => {
        if (prev && activeTeams.some((t) => t.id === prev)) return prev
        return activeTeams[0]?.id ?? null
      })
    } else {
      setCreateTeamId(null)
    }
  }, [isOpen, selectedOrgId, modalTeams, modalTeamMemberships, editingMeeting, eventPlacement])

  useEffect(() => {
    if (!isOpen || !effectiveMembership || eventPlacement !== 'org') return
    if (!membershipHasCapability(effectiveMembership, 'orgCalendar')) {
      setInviteOnly(true)
    }
  }, [isOpen, effectiveMembership, eventPlacement])

  useEffect(() => {
    if (!isOpen || !selectedOrgId || !user?.uid || !needMemberDirectory) {
      setMembers([])
      setMembersFetchError(false)
      if (!needMemberDirectory) setMembersLoading(false)
      return
    }
    if (eventPlacement === 'team' && !createTeamId) {
      setMembers([])
      setMembersFetchError(false)
      setMembersLoading(false)
      return
    }
    let cancelled = false
    setMembersLoading(true)
    setMembersFetchError(false)
    ;(async () => {
      try {
        const raw =
          eventPlacement === 'team' && createTeamId
            ? await getTeamMembers(selectedOrgId, createTeamId)
            : await getOrgMembers(selectedOrgId)
        const activeState =
          eventPlacement === 'team' && createTeamId ? TEAM_STATES.active : MEMBERSHIP_STATES.active
        const active = raw.filter((m) => m.state === activeState && m.userId && m.userId !== user.uid)
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
          const seen = new Set()
          const unique = active.filter((mem) => {
            if (!mem.userId || seen.has(mem.userId)) return false
            seen.add(mem.userId)
            return true
          })
          setMembers(unique.map((mem) => ({ userId: mem.userId, profile: profiles[mem.userId] })))
        }
      } catch (e) {
        console.warn('CreateEventModal: could not load invitee list', e)
        if (!cancelled) {
          setMembers([])
          setMembersFetchError(true)
        }
      } finally {
        if (!cancelled) setMembersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedOrgId, user?.uid, eventPlacement, createTeamId, needMemberDirectory, notifyPolicy])

  useEffect(() => {
    if (notifyPolicy !== 'emails') setPersonalInviteSearch('')
  }, [notifyPolicy])

  const personalInviteSearchResults = useMemo(() => {
    if (eventPlacement !== 'personal' || notifyPolicy !== 'emails') return []
    const q = personalInviteSearch.trim().toLowerCase()
    const available = members.filter((m) => m.userId && !inviteeIds.includes(m.userId))
    if (!q) return available.slice(0, 48)
    return available.filter((m) => {
      const email = (m.profile?.email || '').trim().toLowerCase()
      const name = getDisplayName(m.profile, m.userId).toLowerCase()
      const first = (m.profile?.firstName || '').trim().toLowerCase()
      const last = (m.profile?.lastName || '').trim().toLowerCase()
      const full = `${first} ${last}`.trim()
      return (
        email.includes(q) ||
        name.includes(q) ||
        first.includes(q) ||
        last.includes(q) ||
        full.includes(q)
      )
    })
  }, [eventPlacement, notifyPolicy, members, inviteeIds, personalInviteSearch])

  useScrollLock(isOpen)
  if (!isOpen) return null

  const repeatSummary =
    !recurrence || recurrence.frequency === 'none'
      ? 'Never'
      : recurrence.frequency === 'daily'
        ? `Every ${recurrence.interval || 1} day(s)`
        : `Every ${recurrence.interval || 1} week(s)`

  const repeatEndSummary =
    recurrence && recurrence.frequency !== 'none'
      ? typeof recurrence.endAfterWeeks === 'number' && recurrence.endAfterWeeks >= 1
        ? `After ${recurrence.endAfterWeeks} week${recurrence.endAfterWeeks === 1 ? '' : 's'}`
        : recurrence.until && typeof recurrence.until.toMillis === 'function'
          ? new Date(recurrence.until.toMillis()).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'Never'
      : null

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

  const canScheduleOrg = Boolean(
    effectiveMembership && membershipHasCapability(effectiveMembership, 'scheduleOrgMeetings')
  )
  const canScheduleTeam = Boolean(
    effectiveMembership && membershipHasCapability(effectiveMembership, 'scheduleTeamMeetings')
  )
  const canOrgCalendar = Boolean(
    effectiveMembership && membershipHasCapability(effectiveMembership, 'orgCalendar')
  )
  const canTeamCalendar = Boolean(
    effectiveMembership && membershipHasCapability(effectiveMembership, 'teamCalendar')
  )
  const activeTeamsForCreate = modalTeams.filter((t) => modalTeamMemberships[t.id]?.state === 'active')
  const orgPlacementOk = inviteOnly || canOrgCalendar
  const teamPlacementOk = !!createTeamId && canTeamCalendar
  const placementOk =
    eventPlacement === 'team'
      ? teamPlacementOk && canScheduleTeam
      : eventPlacement === 'personal'
        ? canScheduleOrg
        : orgPlacementOk && canScheduleOrg

  const showPersonalOption = editingMeeting
    ? Boolean(effectiveMembership && membershipHasCapability(effectiveMembership, 'scheduleOrgMeetings'))
    : Boolean(placementSurvey.personalOrgId)

  const showOrgOption = editingMeeting
    ? Boolean(effectiveMembership && membershipHasCapability(effectiveMembership, 'scheduleOrgMeetings'))
    : placementSurvey.orgChoices.length > 0

  const showTeamOption = editingMeeting
    ? Boolean(
        effectiveMembership &&
          membershipHasCapability(effectiveMembership, 'scheduleTeamMeetings') &&
          membershipHasCapability(effectiveMembership, 'teamCalendar') &&
          (activeTeamsForCreate.length > 0 || editingMeeting.scope === MEETING_SCOPES.team)
      )
    : placementSurvey.teamChoices.length > 0

  const orgShowOnLabel =
    editingMeeting || !placementSurvey.orgChoices.length
      ? canOrgCalendar
        ? 'Organization calendar'
        : 'Organization (invited people only)'
      : placementSurvey.orgChoices.some((c) => c.canOrgCal)
        ? 'Organization calendar'
        : 'Organization (invited people only)'

  const teamPickerNeedsOrgLabel =
    !editingMeeting && new Set(placementSurvey.teamChoices.map((c) => c.orgId)).size > 1

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!title.trim() || !selectedOrgId || !user?.uid || !eventKind) return
    const editRealId = editingMeeting?._seriesId || editingMeeting?.id
    if (eventPlacement === 'team') {
      if (effectiveMembership && !canScheduleTeam) {
        setError(getCapabilityDeniedMessage('scheduleTeamMeetings'))
        return
      }
    } else if (eventPlacement === 'personal') {
      if (effectiveMembership && !canScheduleOrg) {
        setError(getCapabilityDeniedMessage('scheduleOrgMeetings'))
        return
      }
    } else if (effectiveMembership && !canScheduleOrg) {
      setError(getCapabilityDeniedMessage('scheduleOrgMeetings'))
      return
    }
    if (
      eventPlacement === 'org' &&
      effectiveMembership &&
      !inviteOnly &&
      !membershipHasCapability(effectiveMembership, 'orgCalendar')
    ) {
      setError(getCapabilityDeniedMessage('orgCalendar'))
      return
    }
    if (eventPlacement === 'team') {
      if (!createTeamId) {
        setError('Choose a team for this event.')
        return
      }
      if (effectiveMembership && !membershipHasCapability(effectiveMembership, 'teamCalendar')) {
        setError(getCapabilityDeniedMessage('teamCalendar'))
        return
      }
    }
    if (eventPlacement === 'personal' && notifyPolicy === 'emails' && inviteeIds.length === 0) {
      setError('Add at least one person to notify.')
      return
    }

    setSaving(true)
    try {
      const { startAt, endAt } = buildStartEnd()
      const scope =
        eventPlacement === 'team'
          ? MEETING_SCOPES.team
          : eventPlacement === 'personal'
            ? MEETING_SCOPES.private
            : MEETING_SCOPES.org
      const scopeTeamId = eventPlacement === 'team' ? createTeamId : null

      let resolvedInviteeIds = inviteeIds
      if (eventPlacement === 'org' || eventPlacement === 'team') {
        if (notifyPolicy === 'everyone') {
          const raw =
            eventPlacement === 'team' && createTeamId
              ? await getTeamMembers(selectedOrgId, createTeamId)
              : await getOrgMembers(selectedOrgId)
          const activeState =
            eventPlacement === 'team' && createTeamId ? TEAM_STATES.active : MEMBERSHIP_STATES.active
          resolvedInviteeIds = [
            ...new Set(
              raw
                .filter((m) => m.state === activeState && m.userId && m.userId !== user.uid)
                .map((m) => m.userId)
            ),
          ]
        } else if (notifyPolicy === 'none') {
          resolvedInviteeIds = []
        } else {
          resolvedInviteeIds = [...inviteeIds]
        }
      } else if (notifyPolicy === 'solo') {
        resolvedInviteeIds = []
      } else {
        resolvedInviteeIds = [...new Set(inviteeIds.filter((id) => id && id !== user.uid))]
      }

      if (editingMeeting && editRealId) {
        await updateMeeting(selectedOrgId, editRealId, user.uid, {
          title: title.trim(),
          description: bio.trim(),
          scope,
          scopeTeamId,
          startAt: Timestamp.fromDate(startAt),
          endAt: Timestamp.fromDate(endAt),
          invitedUserIds: resolvedInviteeIds,
          inviteOnly,
          isVideoMeeting: eventKind === 'video',
          timeZone: timeZone || null,
          recurrence: recurrence && recurrence.frequency !== 'none' ? recurrence : null,
        })
        onUpdated?.()
        onClose()
        return
      }
      const created = await createMeeting(
        selectedOrgId,
        {
          title: title.trim(),
          description: bio.trim(),
          scope,
          scopeTeamId,
          startAt: Timestamp.fromDate(startAt),
          endAt: Timestamp.fromDate(endAt),
          invitedUserIds: resolvedInviteeIds,
          inviteOnly,
          isVideoMeeting: eventKind === 'video',
          createdVia: MEETING_CREATED_VIA.calendar,
          timeZone: timeZone || null,
          recurrence: recurrence && recurrence.frequency !== 'none' ? recurrence : null,
        },
        user.uid
      )
      onCreated?.(created)
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save event.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="create-event-overlay" role="dialog" aria-modal="true" aria-labelledby="create-event-title">
      <div className="create-event-backdrop" onClick={() => !saving && onClose()} />
      <div className="create-event-modal create-event-modal--v2" onClick={(e) => e.stopPropagation()}>
        {!editingMeeting && flowStep === 'choose' && (
          <>
            <h2 id="create-event-title" className="create-event-heading">
              Create Event
            </h2>
            <p className="create-event-lead">Choose what you are scheduling; you can add details on the next step.</p>
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
                <span className="create-event-type-title">Calendar Event</span>
                <span className="create-event-type-desc">Block time, notes, and optional invites. No video room.</span>
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
                <span className="create-event-type-title">Video Meeting</span>
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
            {!editingMeeting && (
              <button
                type="button"
                className="create-event-back-link"
                onClick={() => setFlowStep('choose')}
                disabled={saving}
              >
                ← Back
              </button>
            )}
            <h2 id="create-event-title" className="create-event-heading">
              {editingMeeting
                ? eventKind === 'video'
                  ? 'Edit Video Meeting'
                  : 'Edit Calendar Event'
                : eventKind === 'video'
                  ? 'New Video Meeting'
                  : 'New Calendar Event'}
            </h2>
            <form className="create-event-form create-event-form--v2" onSubmit={handleSubmit}>
              {effectiveMembership && !canScheduleOrg && !canScheduleTeam && (
                <p className="create-event-cap-warning">
                  Your role is not allowed to create scheduled meetings here. Ask an organization admin to update your
                  capabilities.
                </p>
              )}
              {eventPlacement === 'org' &&
                effectiveMembership &&
                (canScheduleOrg || canScheduleTeam) &&
                !canOrgCalendar && (
                  <p className="create-event-cap-hint">
                    You can add events that are visible only to people you invite. Organization-wide visibility is
                    disabled for your role.
                  </p>
                )}
              <div className="create-event-main-card" role="group" aria-label="Event details and schedule">
                <div className="create-event-setting-row">
                  <span className="create-event-setting-label" id="create-event-title-label">
                    Title
                  </span>
                  <div className="create-event-setting-controls create-event-setting-controls--block">
                    <input
                      className="auth-input create-event-input create-event-field-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={eventKind === 'video' ? 'e.g. Design review' : 'e.g. Focus block'}
                      disabled={saving}
                      autoFocus
                      aria-labelledby="create-event-title-label"
                    />
                  </div>
                </div>
                <div className="create-event-setting-row create-event-setting-row--textarea">
                  <span className="create-event-setting-label" id="create-event-desc-label">
                    Description / bio
                  </span>
                  <div className="create-event-setting-controls create-event-setting-controls--block">
                    <textarea
                      className="auth-input create-event-textarea create-event-field-textarea"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Agenda, links, or context for invitees…"
                      rows={3}
                      disabled={saving}
                      aria-labelledby="create-event-desc-label"
                    />
                  </div>
                </div>
                <div className="create-event-setting-row">
                  <span className="create-event-setting-label">Show on</span>
                  <div className="create-event-setting-controls create-event-setting-controls--block">
                    <select
                      className="auth-input create-event-input create-event-setting-select create-event-modal-select"
                      value={eventPlacement}
                      onChange={(e) => {
                        const v = e.target.value
                        setEventPlacement(v)
                        if (!editingMeeting) {
                          if (v === 'team' && placementSurvey.teamChoices[0]) {
                            const t0 = placementSurvey.teamChoices[0]
                            setSelectedOrgId(t0.orgId)
                            setCreateTeamId(t0.teamId)
                          }
                          if (v === 'org' && placementSurvey.orgChoices.length === 1) {
                            setSelectedOrgId(placementSurvey.orgChoices[0].orgId)
                          }
                          if (v === 'personal' && placementSurvey.personalOrgId) {
                            setSelectedOrgId(placementSurvey.personalOrgId)
                          }
                        } else if (v === 'team' && activeTeamsForCreate[0]) {
                          setCreateTeamId(activeTeamsForCreate[0].id)
                        }
                        setError('')
                      }}
                      disabled={saving || (!editingMeeting && placementSurvey.loading)}
                      aria-label="Where to show this event"
                    >
                      {showPersonalOption && <option value="personal">Personal calendar</option>}
                      {showOrgOption && <option value="org">{orgShowOnLabel}</option>}
                      {showTeamOption && <option value="team">Team calendar</option>}
                    </select>
                  </div>
                </div>
                {eventPlacement === 'org' && !editingMeeting && placementSurvey.orgChoices.length > 1 && (
                  <div className="create-event-setting-row">
                    <span className="create-event-setting-label">Organization</span>
                    <div className="create-event-setting-controls create-event-setting-controls--block">
                      <select
                        className="auth-input create-event-input create-event-setting-select create-event-modal-select"
                        value={selectedOrgId || ''}
                        onChange={(e) => {
                          const id = e.target.value
                          setSelectedOrgId(id)
                          setCreateTeamId(null)
                          setError('')
                        }}
                        disabled={saving || orgCtxLoading}
                        aria-label="Organization for this event"
                      >
                        {placementSurvey.orgChoices.map((o) => (
                          <option key={o.orgId} value={o.orgId}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {eventPlacement === 'team' &&
                  (editingMeeting
                    ? activeTeamsForCreate.length > 0
                    : placementSurvey.teamChoices.length > 0) && (
                    <div className="create-event-setting-row">
                      <span className="create-event-setting-label">Team</span>
                      <div className="create-event-setting-controls create-event-setting-controls--block">
                        <select
                          className="auth-input create-event-input create-event-setting-select create-event-modal-select"
                          value={
                            editingMeeting
                              ? createTeamId || ''
                              : selectedOrgId && createTeamId
                                ? `${selectedOrgId}\t${createTeamId}`
                                : ''
                          }
                          onChange={(e) => {
                            const v = e.target.value
                            if (editingMeeting) {
                              setCreateTeamId(v || null)
                            } else {
                              const [oid, tid] = v.split('\t')
                              if (oid && tid) {
                                setSelectedOrgId(oid)
                                setCreateTeamId(tid)
                              }
                            }
                            setError('')
                          }}
                          disabled={saving || (!editingMeeting && orgCtxLoading) || (editingMeeting && !canTeamCalendar)}
                          aria-label="Team for this event"
                        >
                          {!editingMeeting && <option value="">Select team</option>}
                          {editingMeeting
                            ? activeTeamsForCreate.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))
                            : placementSurvey.teamChoices.map((c) => (
                                <option key={`${c.orgId}-${c.teamId}`} value={`${c.orgId}\t${c.teamId}`}>
                                  {teamPickerNeedsOrgLabel ? `${c.teamName} (${c.orgName})` : c.teamName}
                                </option>
                              ))}
                        </select>
                      </div>
                    </div>
                  )}
                {eventPlacement === 'team' && !canTeamCalendar && effectiveMembership && (
                  <div className="create-event-setting-inline-note">
                    Your role cannot add team calendar events. Ask an admin to enable team calendar access, or use the
                    organization calendar.
                  </div>
                )}
                <div className="create-event-setting-row create-event-setting-row--datetime">
                  <span className="create-event-setting-label">Starts</span>
                  <div className="create-event-setting-controls">
                    <input
                      type="date"
                      className="auth-input create-event-input create-event-input--compact create-event-input--in-row"
                      value={startDateStr}
                      onChange={(e) => setStartDateStr(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="time"
                      className="auth-input create-event-input create-event-input--compact create-event-input--in-row"
                      value={startTimeStr}
                      onChange={(e) => setStartTimeStr(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="create-event-setting-row create-event-setting-row--datetime">
                  <span className="create-event-setting-label">Ends</span>
                  <div className="create-event-setting-controls">
                    <input
                      type="date"
                      className="auth-input create-event-input create-event-input--compact create-event-input--in-row"
                      value={endDateStr}
                      onChange={(e) => setEndDateStr(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="time"
                      className="auth-input create-event-input create-event-input--compact create-event-input--in-row"
                      value={endTimeStr}
                      onChange={(e) => setEndTimeStr(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="create-event-setting-row">
                  <span className="create-event-setting-label">Time zone</span>
                  <div className="create-event-setting-controls create-event-setting-controls--block">
                    <select
                      className="auth-input create-event-input create-event-setting-select create-event-modal-select"
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
                  </div>
                </div>
                <div className="create-event-setting-row">
                  <span className="create-event-setting-label">Repeat</span>
                  <div className="create-event-setting-controls create-event-setting-controls--block">
                    <button
                      type="button"
                      className="create-event-setting-value-btn"
                      onClick={() => setRepeatOpen(true)}
                      disabled={saving}
                    >
                      {repeatSummary}
                    </button>
                  </div>
                </div>
                {repeatEndSummary !== null && (
                  <div className="create-event-setting-row">
                    <span className="create-event-setting-label">End repeat</span>
                    <div className="create-event-setting-controls create-event-setting-controls--block">
                      <button
                        type="button"
                        className="create-event-setting-value-btn"
                        onClick={() => setRepeatOpen(true)}
                        disabled={saving}
                      >
                        {repeatEndSummary}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {eventPlacement !== 'personal' && (
                <label className="create-event-toggle">
                  <input
                    type="checkbox"
                    className="notus-checkbox"
                    checked={inviteOnly}
                    onChange={(e) => {
                      const on = e.target.checked
                      if (!on && effectiveMembership && !membershipHasCapability(effectiveMembership, 'orgCalendar')) {
                        setError(getCapabilityDeniedMessage('orgCalendar'))
                        return
                      }
                      setError('')
                      setInviteOnly(on)
                    }}
                    disabled={saving || (effectiveMembership && !canOrgCalendar)}
                  />
                  <span>Only invited people can see this event</span>
                </label>
              )}
              {eventPlacement === 'personal' && (
                <p className="create-event-cap-hint create-event-cap-hint--tight">
                  Personal events are on your calendar. You can notify org members so they can accept or decline in their
                  Notification Center.
                </p>
              )}
              {eventPlacement !== 'personal' && effectiveMembership && !canOrgCalendar && (
                <p className="create-event-cap-hint create-event-cap-hint--tight">
                  Invite-only mode is required for your account.
                </p>
              )}

              {eventPlacement === 'personal' ? (
                <div className="create-event-invite-section">
                  <span className="create-event-invite-title">Send notifications</span>
                  <p className="create-event-invite-hint">
                    {eventKind === 'video'
                      ? 'Optional: add people from your organization. They get a bell notification and can join from Video or Calendar.'
                      : 'Optional: add people from your organization. They get a bell notification and can accept to add this to their calendar, or decline to dismiss it.'}
                  </p>
                  <label className="create-event-notify-row">
                    <input
                      type="radio"
                      name="personal-notify"
                      className="notus-checkbox"
                      checked={notifyPolicy === 'solo'}
                      onChange={() => {
                        setNotifyPolicy('solo')
                        setInviteeIds([])
                        setPersonalInviteSearch('')
                        setError('')
                      }}
                      disabled={saving}
                    />
                    <span>Just me (do not notify anyone else)</span>
                  </label>
                  <label className="create-event-notify-row">
                    <input
                      type="radio"
                      name="personal-notify"
                      className="notus-checkbox"
                      checked={notifyPolicy === 'emails'}
                      onChange={() => {
                        setNotifyPolicy('emails')
                        setError('')
                      }}
                      disabled={saving}
                    />
                    <span>Invite people (search by name or email; active org members only)</span>
                  </label>
                  {notifyPolicy === 'emails' && (
                    <div className="create-event-personal-invite-picker">
                      <label className="create-event-sr-only" htmlFor="create-event-personal-invite-search">
                        Search organization members
                      </label>
                      <input
                        id="create-event-personal-invite-search"
                        type="search"
                        className="auth-input create-event-input create-event-personal-invite-search"
                        value={personalInviteSearch}
                        onChange={(e) => {
                          setPersonalInviteSearch(e.target.value)
                          setError('')
                        }}
                        placeholder="Search by name or email…"
                        disabled={saving}
                        autoComplete="off"
                      />
                      {inviteeIds.length > 0 && (
                        <div className="create-event-invite-selected">
                          <span className="create-event-invite-selected-label">Notifying</span>
                          <ul className="create-event-invite-chip-list">
                            {inviteeIds.map((uid) => {
                              const row = members.find((m) => m.userId === uid)
                              const name = getDisplayName(row?.profile, uid)
                              const email = (row?.profile?.email || '').trim()
                              const photo = getProfilePictureUrl(row?.profile)
                              return (
                                <li key={uid} className="create-event-invite-chip">
                                  <div className="create-event-invite-chip-avatar" aria-hidden>
                                    {photo ? (
                                      <img src={photo} alt="" />
                                    ) : (
                                      <span>{(name || '?').slice(0, 1).toUpperCase()}</span>
                                    )}
                                  </div>
                                  <div className="create-event-invite-chip-text">
                                    <span className="create-event-invite-chip-name">{name}</span>
                                    {email ? (
                                      <span className="create-event-invite-chip-email">{email}</span>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    className="create-event-invite-chip-remove"
                                    onClick={() =>
                                      setInviteeIds((prev) => prev.filter((id) => id !== uid))
                                    }
                                    disabled={saving}
                                    aria-label={`Remove ${name}`}
                                  >
                                    ×
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                      <div className="create-event-invite-scroll create-event-invite-scroll--suggest">
                        {membersLoading ? (
                          <p className="app-muted create-event-muted">Loading members…</p>
                        ) : membersFetchError ? (
                          <p className="app-muted create-event-muted">
                            Couldn&apos;t load people. Check your connection and try again.
                          </p>
                        ) : members.length === 0 ? (
                          <p className="app-muted create-event-muted">No other active members in this organization.</p>
                        ) : personalInviteSearchResults.length === 0 ? (
                          <p className="app-muted create-event-muted">
                            {personalInviteSearch.trim()
                              ? 'No matches. Try another name or email.'
                              : inviteeIds.length >= members.length
                                ? 'Everyone available is already added.'
                                : 'Type to search, or browse the list below.'}
                          </p>
                        ) : (
                          <ul className="create-event-member-suggest-list">
                            {personalInviteSearchResults.map(({ userId: uid, profile }) => {
                              const name = getDisplayName(profile, uid)
                              const email = (profile?.email || '').trim() || 'Not provided'
                              const photo = getProfilePictureUrl(profile)
                              return (
                                <li key={uid} className="create-event-member-suggest-item">
                                  <div className="create-event-member-suggest-avatar" aria-hidden>
                                    {photo ? (
                                      <img src={photo} alt="" />
                                    ) : (
                                      <span>{(name || '?').slice(0, 1).toUpperCase()}</span>
                                    )}
                                  </div>
                                  <div className="create-event-member-suggest-text">
                                    <span className="create-event-member-suggest-name">{name}</span>
                                    <span className="create-event-member-suggest-email">{email}</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="create-event-member-add-btn"
                                    onClick={() => {
                                      setInviteeIds((prev) => (prev.includes(uid) ? prev : [...prev, uid]))
                                      setPersonalInviteSearch('')
                                      setError('')
                                    }}
                                    disabled={saving || inviteeIds.includes(uid)}
                                    aria-label={`Add ${name}`}
                                  >
                                    +
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="create-event-invite-section">
                  <span className="create-event-invite-title">Send notifications</span>
                  <p className="create-event-invite-hint">
                    {eventKind === 'video'
                      ? 'Bell notifications for this scheduled video event. Calendar visibility still follows the setting above (organization / team / invite-only).'
                      : 'Bell notifications for this calendar event. Who can see the event on the calendar still follows the setting above.'}
                  </p>
                  <label className="create-event-notify-row">
                    <input
                      type="radio"
                      name="org-team-notify"
                      className="notus-checkbox"
                      checked={notifyPolicy === 'everyone'}
                      onChange={() => {
                        setNotifyPolicy('everyone')
                        setInviteeIds(members.map((m) => m.userId))
                        setError('')
                      }}
                      disabled={saving}
                    />
                    <span>
                      {eventPlacement === 'team' && createTeamId
                        ? 'Everyone on this team (except you)'
                        : 'Everyone in this organization (except you)'}
                    </span>
                  </label>
                  <label className="create-event-notify-row">
                    <input
                      type="radio"
                      name="org-team-notify"
                      className="notus-checkbox"
                      checked={notifyPolicy === 'none'}
                      onChange={() => {
                        setNotifyPolicy('none')
                        setInviteeIds([])
                        setError('')
                      }}
                      disabled={saving}
                    />
                    <span>Don&apos;t send bell notifications</span>
                  </label>
                  {editingMeeting && (
                    <label className="create-event-notify-row">
                      <input
                        type="radio"
                        name="org-team-notify"
                        className="notus-checkbox"
                        checked={notifyPolicy === 'pick'}
                        onChange={() => {
                          setNotifyPolicy('pick')
                          setInviteeIds((prev) =>
                            prev.length ? prev : members.map((m) => m.userId)
                          )
                          setError('')
                        }}
                        disabled={saving}
                      />
                      <span>Only selected people</span>
                    </label>
                  )}
                  {notifyPolicy === 'pick' && (
                    <div className="create-event-invite-scroll create-event-invite-scroll--tight">
                      {membersLoading ? (
                        <p className="app-muted create-event-muted">Loading members…</p>
                      ) : membersFetchError ? (
                        <p className="app-muted create-event-muted">
                          Couldn&apos;t load people. Check your connection, then try closing and reopening this window.
                        </p>
                      ) : members.length === 0 ? (
                        <p className="app-muted create-event-muted">
                          {eventPlacement === 'team' && createTeamId
                            ? 'No other active people on this team yet.'
                            : 'No other active org members yet.'}
                        </p>
                      ) : (
                        <ul className="create-event-invite-list">
                          {members.map(({ userId: uid, profile }) => (
                            <li key={uid}>
                              <label className="create-event-invite-row">
                                <input
                                  type="checkbox"
                                  className="notus-checkbox notus-checkbox--sm"
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
                  )}
                </div>
              )}

              {error && <p className="create-event-error">{error}</p>}
              <div className="create-event-actions">
                <Button type="button" variant="ghost" onClick={() => !saving && onClose()} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    saving ||
                    (!editingMeeting && placementSurvey.loading) ||
                    orgCtxLoading ||
                    !effectiveMembership ||
                    !title.trim() ||
                    !(canScheduleOrg || canScheduleTeam) ||
                    !placementOk ||
                    (eventPlacement === 'personal' && notifyPolicy === 'emails' && inviteeIds.length === 0)
                  }
                >
                  {saving ? 'Saving…' : editingMeeting ? 'Save Changes' : 'Create'}
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
          eventStartDateStr={startDateStr}
        />
      </div>
    </div>,
    document.body
  )
}
