import { useState, useEffect, useRef, useCallback } from 'react'
import { useOutletContext, useSearchParams, useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  getActiveMemberships,
  getOrg,
  getMembership,
  canManageOrg,
  membershipHasCapability,
} from '../lib/orgService'
import { getTeamsForUserInOrg } from '../lib/teamService'
import {
  getMeetingsInRangeForUser,
  getMeetingsInRangeForUserInOrg,
  getMeetingsInRangeForUserInTeam,
  meetingCalendarDisplaySource,
  MEETING_CREATED_VIA,
} from '../lib/meetingService'
import { getImportedEventsInRange } from '../lib/calendarImportService'
import { expandMeetingsListForMonth } from '../lib/calendarRecurrence'
import { getTodosInRange, addTodo, toggleTodo, deleteTodo } from '../lib/todoService'
import { Button } from '../components/ui/Button'
import { Timestamp } from 'firebase/firestore'
import { getTimeZone, getLocale, parseCalendarDateQueryParam, formatCalendarDateQueryParam } from '../lib/dateUtils'
import { CreateEventModal } from '../components/calendar/CreateEventModal'
import { EventDetailModal } from '../components/calendar/EventDetailModal'
import '../styles/variables.css'
import './AppLayout.css'
import './CalendarPage.css'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const VIEWS = ['day', 'month', 'year']
/** Dot order for yearly grid source indicators (mini calendar uses MiniCalendarWidget) */
const CALENDAR_SOURCE_DOT_ORDER = ['personal', 'org', 'team']

function formatMeetingTime(startAt, userDoc) {
  if (!startAt) return ''
  const ms = startAt?.toMillis?.() ?? startAt
  const d = new Date(ms)
  const tz = getTimeZone(userDoc)
  const locale = getLocale(userDoc)
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(tz && { timeZone: tz }) })
}

function formatDateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function sourcesFromDayMeetings(dayMeetings) {
  const set = new Set()
  for (const m of dayMeetings || []) {
    if (m._todo && m.done) continue
    set.add(m._calendarSource || 'personal')
  }
  return CALENDAR_SOURCE_DOT_ORDER.filter((s) => set.has(s))
}

/** Calendar-scheduled video meetings: pulse before start, strong highlight during the event window. */
function scheduledVideoHighlightClass(m, nowMs) {
  if (m._todo || m._imported) return ''
  if (m.isVideoMeeting === false) return ''
  if (m.createdVia !== MEETING_CREATED_VIA.calendar) return ''
  const start = m.startAt?.toMillis?.() ?? 0
  if (!start) return ''
  const end = m.endAt?.toMillis?.() ?? null
  const windowEnd = end && end > start ? end : start + 60 * 60 * 1000
  if (nowMs >= start && nowMs < windowEnd) return 'calendar-meeting-item--video-live'
  const soonMs = 10 * 60 * 1000
  if (nowMs >= start - soonMs && nowMs < start) return 'calendar-meeting-item--video-soon'
  return ''
}

function meetingItemClasses(m, filter, nowMs = Date.now()) {
  const done = m._todo && m.done ? 'calendar-meeting-done' : ''
  const vid = scheduledVideoHighlightClass(m, nowMs)
  const base = `calendar-meeting-item calendar-meeting-item--btn ${done} ${vid}`.trim()
  if (filter === 'combined' && m._calendarSource) {
    return `${base} calendar-meeting-item--src-${m._calendarSource}`
  }
  return base
}

function mergeCreatedMeetingIntoState(prev, created, orgLabel) {
  if (!created?.id || !created.startAt?.toMillis) return prev
  const d = new Date(created.startAt.toMillis())
  const y = d.getFullYear()
  const m = d.getMonth()
  const augmented = {
    ...created,
    _orgName: orgLabel,
    _orgId: created.orgId,
    _calendarSource: meetingCalendarDisplaySource(created),
  }
  const without = prev.filter((row) => row.id !== created.id && row._seriesId !== created.id)
  const meetingRows = without.filter((x) => !x._todo && !x._imported)
  const otherRows = without.filter((x) => x._todo || x._imported)
  const newExpanded = expandMeetingsListForMonth([augmented], y, m)
  const merged = [...meetingRows, ...newExpanded]
  merged.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0))
  return [...merged, ...otherRows]
}

export function CalendarPage() {
  const { user, userDoc, setNavExtra } = useOutletContext() || {}
  const { orgId: routeOrgId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const pushCalendarDateToUrl = useCallback(
    (d) => {
      const qs = formatCalendarDateQueryParam(d)
      navigate(`${location.pathname}${qs ? `?date=${qs}` : ''}`, { replace: true })
    },
    [navigate, location.pathname]
  )
  const [activeOrgId, setActiveOrgId] = useState(routeOrgId || null)
  const [org, setOrg] = useState(null)
  const [teams, setTeams] = useState([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [meetings, setMeetings] = useState([])
  const [filter, setFilter] = useState(routeOrgId ? 'org' : 'personal')
  const [scopeTeamId, setScopeTeamId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [showCreateEventModal, setShowCreateEventModal] = useState(false)
  const [selectedEventItem, setSelectedEventItem] = useState(null)
  const [view, setView] = useState('month')
  const [myMembershipForCalendar, setMyMembershipForCalendar] = useState(null)
  const [orgPickerOptions, setOrgPickerOptions] = useState([])
  const [calendarReloadKey, setCalendarReloadKey] = useState(0)
  const [calendarNowMs, setCalendarNowMs] = useState(() => Date.now())
  const lastCreatedMeetingRef = useRef(null)
  const [editingMeetingDraft, setEditingMeetingDraft] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setCalendarNowMs(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const dateParam = searchParams.get('date')
    if (!dateParam) return
    const parsed = parseCalendarDateQueryParam(dateParam)
    if (parsed) {
      setYear(parsed.year)
      setMonth(parsed.monthIndex)
      setSelectedDate(parsed.selectedDate)
    }
  }, [searchParams])

  useEffect(() => {
    if (routeOrgId) {
      setActiveOrgId(routeOrgId)
      setFilter('org')
      setLoading(false)
    } else if (!user) return
    else {
      getActiveMemberships(user.uid).then((memberships) => {
        if (memberships[0]) setActiveOrgId(memberships[0].orgId)
        setLoading(false)
      })
    }
  }, [user, routeOrgId])

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    getActiveMemberships(user.uid).then(async (mems) => {
      const opts = await Promise.all(
        mems.map(async (m) => {
          const o = await getOrg(m.orgId)
          return { orgId: m.orgId, name: o?.name || 'Organization' }
        })
      )
      if (!cancelled) setOrgPickerOptions(opts)
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid || !activeOrgId) {
      setMyMembershipForCalendar(null)
      return
    }
    getMembership(activeOrgId, user.uid).then(setMyMembershipForCalendar)
  }, [user?.uid, activeOrgId])

  useEffect(() => {
    if (filter !== 'team' || !activeOrgId || !scopeTeamId) return
    const ok = teams.some((t) => t.id === scopeTeamId)
    if (!ok) setScopeTeamId(null)
  }, [activeOrgId, teams, scopeTeamId, filter])

  useEffect(() => {
    if (filter !== 'team' || !activeOrgId || scopeTeamId) return
    const first = teams[0]
    if (first) setScopeTeamId(first.id)
  }, [filter, activeOrgId, teams, scopeTeamId])

  useEffect(() => {
    if (!activeOrgId || !user) return
    const load = async () => {
      const [orgData, myTeams] = await Promise.all([
        getOrg(activeOrgId),
        getTeamsForUserInOrg(activeOrgId, user.uid),
      ])
      setOrg(orgData)
      setTeams(myTeams)
    }
    load()
  }, [activeOrgId, user])

  useEffect(() => {
    if (searchParams.get('create') !== '1' || !activeOrgId) return
    setEditingMeetingDraft(null)
    setShowCreateEventModal(true)
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    const qs = next.toString()
    navigate(`${location.pathname}${qs ? `?${qs}` : ''}`, { replace: true })
  }, [searchParams, activeOrgId, navigate, location.pathname])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      try {
        const loadMonthData = async (y, m) => {
          if (filter === 'personal') {
            const [meetingsList, importedList, todosList] = await Promise.all([
              getMeetingsInRangeForUser(user.uid, y, m),
              getImportedEventsInRange(user.uid, y, m),
              getTodosInRange(user.uid, y, m).catch(() => []),
            ])
            const todosAsEvents = todosList.map((t) => ({
              id: t.id,
              title: t.text,
              startAt: t.dueDate,
              _todo: true,
              done: t.done,
              _calendarSource: 'personal',
            }))
            const importedTagged = importedList.map((ev) => ({
              ...ev,
              _calendarSource: 'personal',
            }))
            const meetingsTagged = meetingsList.map((row) => ({
              ...row,
              _calendarSource: meetingCalendarDisplaySource(row),
            }))
            const taggedRows = [...meetingsTagged, ...importedTagged, ...todosAsEvents]
            const meetingRows = taggedRows.filter((x) => !x._todo && !x._imported)
            const otherRows = taggedRows.filter((x) => x._todo || x._imported)
            return [...expandMeetingsListForMonth(meetingRows, y, m), ...otherRows]
          }
          if (filter === 'combined' && activeOrgId) {
            const [meetingsList, importedList, todosList] = await Promise.all([
              getMeetingsInRangeForUserInOrg(user.uid, activeOrgId, y, m),
              getImportedEventsInRange(user.uid, y, m),
              getTodosInRange(user.uid, y, m).catch(() => []),
            ])
            const todosAsEvents = todosList.map((t) => ({
              id: t.id,
              title: t.text,
              startAt: t.dueDate,
              _todo: true,
              done: t.done,
              _calendarSource: 'personal',
            }))
            const importedTagged = importedList.map((ev) => ({
              ...ev,
              _calendarSource: 'personal',
            }))
            const meetingsTagged = meetingsList.map((row) => ({
              ...row,
              _calendarSource: meetingCalendarDisplaySource(row),
            }))
            const taggedRows = [...meetingsTagged, ...importedTagged, ...todosAsEvents]
            const meetingRows = taggedRows.filter((x) => !x._todo && !x._imported)
            const otherRows = taggedRows.filter((x) => x._todo || x._imported)
            return [...expandMeetingsListForMonth(meetingRows, y, m), ...otherRows]
          }
          if (filter === 'org' && activeOrgId) {
            const rows = await getMeetingsInRangeForUserInOrg(user.uid, activeOrgId, y, m)
            const tagged = rows.map((row) => ({
              ...row,
              _calendarSource: meetingCalendarDisplaySource(row),
            }))
            return expandMeetingsListForMonth(tagged, y, m)
          }
          if (filter === 'team' && activeOrgId && scopeTeamId) {
            const rows = await getMeetingsInRangeForUserInTeam(user.uid, activeOrgId, scopeTeamId, y, m)
            const tagged = rows.map((row) => ({
              ...row,
              _calendarSource: 'team',
            }))
            return expandMeetingsListForMonth(tagged, y, m)
          }
          return []
        }

        let monthsToLoad = [{ year, month }]
        if (view === 'year') {
          monthsToLoad = Array.from({ length: 12 }, (_, i) => ({ year, month: i }))
        }
        const seen = new Set()
        const monthKeys = monthsToLoad.filter(({ year: y, month: mo }) => {
          const k = `${y}-${mo}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        const monthParts = await Promise.all(monthKeys.map(({ year: y, month: mo }) => loadMonthData(y, mo)))
        let list = monthParts.flat()
        list.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0))
        const pending = lastCreatedMeetingRef.current
        if (pending?.id) {
          const has = list.some(
            (row) =>
              !row._todo &&
              !row._imported &&
              (row.id === pending.id || row._seriesId === pending.id)
          )
          if (!has) {
            list = mergeCreatedMeetingIntoState(list, pending, org?.name)
          }
          lastCreatedMeetingRef.current = null
        }
        setMeetings(list)
      } catch (err) {
        console.error('Calendar load error:', err)
        setMeetings([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, activeOrgId, year, month, filter, scopeTeamId, view, calendarReloadKey])

  const handleEventCreated = (created) => {
    if (created?.id) lastCreatedMeetingRef.current = created
    setCalendarReloadKey((k) => k + 1)
  }

  const goPrev = () => {
    if (view === 'day') {
      const d = new Date(displayDate)
      d.setDate(d.getDate() - 1)
      setSelectedDate(d)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      pushCalendarDateToUrl(d)
    } else if (view === 'year') {
      setYear((y) => y - 1)
    } else {
      if (month === 0) {
        setMonth(11)
        setYear((y) => y - 1)
      } else {
        setMonth((m) => m - 1)
      }
    }
  }

  const goNext = () => {
    if (view === 'day') {
      const d = new Date(displayDate)
      d.setDate(d.getDate() + 1)
      setSelectedDate(d)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      pushCalendarDateToUrl(d)
    } else if (view === 'year') {
      setYear((y) => y + 1)
    } else {
      if (month === 11) {
        setMonth(0)
        setYear((y) => y + 1)
      } else {
        setMonth((m) => m + 1)
      }
    }
  }

  const goToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setSelectedDate(now)
    pushCalendarDateToUrl(now)
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const blanks = firstDay
  const totalCells = blanks + daysInMonth
  const rows = Math.ceil(totalCells / 7)

  const meetingsByDay = {}
  for (const m of meetings) {
    const ms = m.startAt?.toMillis?.() ?? m.startAt
    if (!ms) continue
    const d = new Date(ms)
    const key = formatDateKey(d)
    if (!meetingsByDay[key]) meetingsByDay[key] = []
    meetingsByDay[key].push(m)
  }

  const isToday = (day) => {
    const now = new Date()
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day
  }

  const displayDate = selectedDate || new Date(year, month, 1)
  const selectedKey = formatDateKey(displayDate)
  const selectedDayMeetings = meetingsByDay[selectedKey] || []

  const handleCellClick = (day) => {
    const d = new Date(year, month, day)
    setSelectedDate(d)
    pushCalendarDateToUrl(d)
  }

  const handleYearMonthTitleClick = (mi) => {
    const d = new Date(year, mi, 1)
    setMonth(mi)
    setSelectedDate(d)
    setView('month')
    pushCalendarDateToUrl(d)
  }

  const handleYearDayClick = (mi, day) => {
    const d = new Date(year, mi, day)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelectedDate(d)
    setView('month')
    pushCalendarDateToUrl(d)
  }

  const handleYearDayDoubleClick = (mi, day) => {
    const d = new Date(year, mi, day)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelectedDate(d)
    setView('day')
    pushCalendarDateToUrl(d)
  }

  useEffect(() => {
    if (typeof setNavExtra === 'function') setNavExtra(undefined)
  }, [setNavExtra])

  const handleToggleTask = async (todoId, done) => {
    if (!user?.uid) return
    try {
      await toggleTodo(user.uid, todoId, done)
      setMeetings((prev) => prev.map((m) => (m.id === todoId && m._todo ? { ...m, done } : m)))
    } catch {
      // ignore
    }
  }

  const handleDeleteTask = async (todoId) => {
    if (!user?.uid) return
    try {
      await deleteTodo(user.uid, todoId)
      setMeetings((prev) => prev.filter((m) => !(m.id === todoId && m._todo)))
    } catch {
      // ignore
    }
  }

  if (loading && !user) {
    return <p className="app-muted">Loading…</p>
  }

  return (
    <main className="app-main calendar-main">
      <div className="calendar-header-row">
        <div className="calendar-title-block">
          <h2 className="calendar-title">Calendar</h2>
        </div>
        {activeOrgId && (
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setEditingMeetingDraft(null)
              setShowCreateEventModal(true)
            }}
            disabled={
              !!myMembershipForCalendar &&
              !membershipHasCapability(myMembershipForCalendar, 'scheduleOrgMeetings') &&
              !membershipHasCapability(myMembershipForCalendar, 'scheduleTeamMeetings')
            }
            title={
              myMembershipForCalendar &&
              !membershipHasCapability(myMembershipForCalendar, 'scheduleOrgMeetings') &&
              !membershipHasCapability(myMembershipForCalendar, 'scheduleTeamMeetings')
                ? 'You do not have permission to create events. Ask an org admin to enable org or team scheduling for your role.'
                : undefined
            }
          >
            Create Event
          </Button>
        )}
      </div>

      <p className="calendar-scope-hint">
        {routeOrgId
          ? org?.name
            ? `${org.name}: scheduled meetings and events`
            : 'Organization Calendar'
          : filter === 'personal'
            ? 'Your tasks, imported calendars, and scheduled meetings across organizations.'
            : filter === 'combined'
              ? org?.name
                ? `${org.name}: tasks, imported calendars, and all organization and team events you can access. Items are color coded by source.`
                : 'Select an organization to view all calendars together'
              : filter === 'team'
                ? 'Scheduled team events for the selected organization and team'
                : org?.name
                  ? `${org.name}: organization-wide scheduled events`
                  : 'Select an organization in the toolbar'}
      </p>

      <div className="calendar-toolbar">
        <div className="calendar-toolbar-top">
          <div className="calendar-toolbar-top-left">
            <Button variant="ghost" size="md" onClick={goPrev}>←</Button>
            <Button variant="ghost" size="md" onClick={goToday}>Today</Button>
            <Button variant="ghost" size="md" onClick={goNext}>→</Button>
          </div>
          <span className="calendar-month-label">
            {view === 'year'
              ? String(year)
              : view === 'day'
                ? `${MONTHS[displayDate.getMonth()]} ${displayDate.getDate()}, ${displayDate.getFullYear()}`
                : `${MONTHS[month]} ${year}`}
          </span>
          <div className="calendar-toolbar-top-right">
            <div className="calendar-view-switcher">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`calendar-view-btn ${view === v ? 'calendar-view-btn-active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="calendar-toolbar-bottom">
          <div className="calendar-source-tabs" role="tablist" aria-label="Calendar scope">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'combined'}
              className={`calendar-source-tab ${filter === 'combined' ? 'calendar-source-tab--active' : ''}`}
              onClick={() => setFilter('combined')}
              disabled={!activeOrgId && orgPickerOptions.length === 0}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'personal'}
              className={`calendar-source-tab ${filter === 'personal' ? 'calendar-source-tab--active' : ''}`}
              onClick={() => setFilter('personal')}
            >
              Personal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'org'}
              className={`calendar-source-tab ${filter === 'org' ? 'calendar-source-tab--active' : ''}`}
              onClick={() => setFilter('org')}
              disabled={!activeOrgId && orgPickerOptions.length === 0}
            >
              Organization
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'team'}
              className={`calendar-source-tab ${filter === 'team' ? 'calendar-source-tab--active' : ''}`}
              onClick={() => setFilter('team')}
              disabled={!activeOrgId || teams.length === 0}
            >
              Team
            </button>
          </div>
          <div className={`calendar-toolbar-context${filter === 'personal' ? ' calendar-toolbar-context--personal' : ''}`}>
            {filter !== 'personal' && filter !== 'combined' && org?.name && (routeOrgId || orgPickerOptions.length <= 1) && (
              <span className="calendar-context-org-label">{org.name}</span>
            )}
            {filter === 'combined' && org?.name && (routeOrgId || orgPickerOptions.length <= 1) && (
              <span className="calendar-context-org-label">{org.name}</span>
            )}
            {!routeOrgId && (filter === 'org' || filter === 'team' || filter === 'combined') && orgPickerOptions.length > 1 && (
              <label className="calendar-org-pick">
                <span className="visually-hidden">Organization</span>
                <select
                  className="calendar-filter-select"
                  value={activeOrgId || ''}
                  onChange={(e) => {
                    const id = e.target.value
                    setActiveOrgId(id || null)
                  }}
                >
                  {orgPickerOptions.map((o) => (
                    <option key={o.orgId} value={o.orgId}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {filter === 'team' && (
              <select
                value={scopeTeamId || ''}
                onChange={(e) => setScopeTeamId(e.target.value || null)}
                className="calendar-filter-select"
                aria-label="Team"
              >
                <option value="">Select team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="calendar-layout calendar-layout--full">
        <div className="calendar-grid-wrap">
          {loading ? (
            <p className="app-muted">Loading meetings…</p>
          ) : view === 'year' ? (
            <div className="calendar-year-view">
              <p className="calendar-year-legend app-muted">
                <span className="calendar-year-legend-item">
                  <span className="calendar-year-legend-dot calendar-year-legend-dot--personal" aria-hidden />
                  Personal
                </span>
                <span className="calendar-year-legend-item">
                  <span className="calendar-year-legend-dot calendar-year-legend-dot--org" aria-hidden />
                  Organization
                </span>
                <span className="calendar-year-legend-item">
                  <span className="calendar-year-legend-dot calendar-year-legend-dot--team" aria-hidden />
                  Team
                </span>
                <span className="calendar-year-legend-hint">
                  Click a day for month view, double-click for day view. Click a month name for that month.
                </span>
              </p>
              <div className="calendar-year-grid">
                {MONTHS.map((monthName, mi) => {
                  const fd = new Date(year, mi, 1).getDay()
                  const dim = new Date(year, mi + 1, 0).getDate()
                  const cells = []
                  for (let i = 0; i < fd; i++) cells.push(null)
                  for (let d = 1; d <= dim; d++) cells.push(d)
                  const now = new Date()
                  return (
                    <section key={monthName} className="calendar-year-month">
                      <button
                        type="button"
                        className="calendar-year-month-title"
                        onClick={() => handleYearMonthTitleClick(mi)}
                      >
                        {monthName}
                      </button>
                      <div className="calendar-year-dow" aria-hidden>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((L, i) => (
                          <span key={`${monthName}-dow-${i}`} className="calendar-year-dow-cell">{L}</span>
                        ))}
                      </div>
                      <div className="calendar-year-days">
                        {cells.map((day, idx) => {
                          if (day === null) {
                            return <span key={`${monthName}-e-${idx}`} className="calendar-year-day calendar-year-day--empty" />
                          }
                          const key = formatDateKey(new Date(year, mi, day))
                          const dayMeetings = meetingsByDay[key] || []
                          const dots = sourcesFromDayMeetings(dayMeetings)
                          const today =
                            now.getFullYear() === year && now.getMonth() === mi && now.getDate() === day
                          const selected =
                            selectedDate &&
                            selectedDate.getFullYear() === year &&
                            selectedDate.getMonth() === mi &&
                            selectedDate.getDate() === day
                          return (
                            <button
                              type="button"
                              key={`${mi}-${day}`}
                              className={`calendar-year-day ${today ? 'calendar-year-day--today' : ''} ${selected ? 'calendar-year-day--selected' : ''}`}
                              onClick={() => handleYearDayClick(mi, day)}
                              onDoubleClick={(e) => {
                                e.preventDefault()
                                handleYearDayDoubleClick(mi, day)
                              }}
                            >
                              <span className="calendar-year-day-num">{day}</span>
                              <span className="calendar-year-event-dots" aria-hidden>
                                {dots.length > 0 ? (
                                  dots.map((src) => (
                                    <span
                                      key={src}
                                      className={`calendar-year-event-dot calendar-year-event-dot--${src}`}
                                    />
                                  ))
                                ) : (
                                  <span className="calendar-year-event-dot calendar-year-event-dot--placeholder" />
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>
          ) : view === 'day' ? (
            <div className="calendar-day-view">
              <div className="calendar-day-view-header">
                <button type="button" className="calendar-day-nav-btn" onClick={goPrev}>←</button>
                <span className="calendar-day-view-title">{`${MONTHS[displayDate.getMonth()]} ${displayDate.getDate()}, ${displayDate.getFullYear()}`}</span>
                <button type="button" className="calendar-day-nav-btn" onClick={goNext}>→</button>
              </div>
              <div className="calendar-day-slots">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="calendar-hour-row">
                    <span className="calendar-hour-label">{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</span>
                    <div className="calendar-hour-content">
                      {selectedDayMeetings.filter((m) => {
                        if (m._todo) return h === 0
                        const ms = m.startAt?.toMillis?.() ?? m.startAt
                        return ms && new Date(ms).getHours() === h
                      }).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={meetingItemClasses(m, filter, calendarNowMs)}
                          title={m.title}
                          onClick={() => setSelectedEventItem(m)}
                        >
                          {m._todo && (
                            <input
                              type="checkbox"
                              checked={!!m.done}
                              className="calendar-cell-task-check"
                              onChange={(e) => {
                                e.stopPropagation()
                                handleToggleTask(m.id, e.target.checked)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Task done"
                            />
                          )}
                          <span className="calendar-meeting-time">{m._todo ? '' : formatMeetingTime(m.startAt, userDoc)}</span>
                          <span className="calendar-meeting-title">{m.title}</span>
                          {m._imported && <span className="calendar-meeting-imported">imported</span>}
                          {m._todo && <span className="calendar-meeting-task">task</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="calendar-grid"
              style={{ gridTemplateRows: `auto repeat(${rows}, minmax(96px, 1fr))` }}
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="calendar-day-header">{d}</div>
              ))}
              {Array.from({ length: rows * 7 }, (_, i) => {
                const day = (i >= blanks && i < blanks + daysInMonth) ? (i - blanks + 1) : null
                const key = day ? formatDateKey(new Date(year, month, day)) : null
                const dayMeetings = key ? (meetingsByDay[key] || []) : []
                const selected = selectedKey === key
                return (
                  <button
                    type="button"
                    key={i}
                    className={`calendar-cell ${day ? '' : 'calendar-cell-empty'} ${day && isToday(day) ? 'calendar-cell-today' : ''} ${selected ? 'calendar-cell-selected' : ''}`}
                    onClick={() => day && handleCellClick(day)}
                    onDoubleClick={(e) => {
                      if (!day) return
                      e.preventDefault()
                      const d = new Date(year, month, day)
                      setSelectedDate(d)
                      setView('day')
                      pushCalendarDateToUrl(d)
                    }}
                    disabled={!day}
                  >
                    {day && <span className="calendar-day-num">{day}</span>}
                    {dayMeetings.length > 0 && (
                      <ul className="calendar-day-meetings">
                        {dayMeetings.slice(0, 4).map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              className={meetingItemClasses(m, filter, calendarNowMs)}
                              title={m.title}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedEventItem(m)
                              }}
                            >
                              {m._todo && (
                                <input
                                  type="checkbox"
                                  checked={!!m.done}
                                  className="calendar-cell-task-check"
                                  onChange={(e) => {
                                    e.stopPropagation()
                                    handleToggleTask(m.id, e.target.checked)
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label="Task done"
                                />
                              )}
                              <span className="calendar-meeting-time">{m._todo ? '' : formatMeetingTime(m.startAt, userDoc)}</span>
                              <span className="calendar-meeting-title">{m.title}</span>
                              {m._orgName && <span className="calendar-meeting-org">{m._orgName}</span>}
                              {m._imported && <span className="calendar-meeting-imported">imported</span>}
                              {m._todo && <span className="calendar-meeting-task">task</span>}
                            </button>
                          </li>
                        ))}
                        {dayMeetings.length > 4 && (
                          <li className="calendar-meeting-more">+{dayMeetings.length - 4} more</li>
                        )}
                      </ul>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {activeOrgId && user && (
        <CreateEventModal
          isOpen={showCreateEventModal || !!editingMeetingDraft}
          onClose={() => {
            setShowCreateEventModal(false)
            setEditingMeetingDraft(null)
          }}
          user={user}
          activeOrgId={activeOrgId}
          defaultDate={selectedDate}
          editingMeeting={editingMeetingDraft}
          onCreated={handleEventCreated}
          onUpdated={() => setCalendarReloadKey((k) => k + 1)}
          myOrgMembership={myMembershipForCalendar}
          orgOptions={routeOrgId ? undefined : orgPickerOptions}
        />
      )}
      <EventDetailModal
        item={selectedEventItem}
        isOpen={!!selectedEventItem}
        onClose={() => setSelectedEventItem(null)}
        user={user}
        userDoc={userDoc}
        canManageOrg={canManageOrg(myMembershipForCalendar)}
        onUpdated={() => setCalendarReloadKey((k) => k + 1)}
        onEditEvent={(ev) => {
          setSelectedEventItem(null)
          setEditingMeetingDraft(ev)
          setShowCreateEventModal(true)
        }}
        onDeleted={(id) => {
          setMeetings((prev) => prev.filter((m) => m.id !== id && m._seriesId !== id))
          setSelectedEventItem(null)
        }}
      />
    </main>
  )
}
