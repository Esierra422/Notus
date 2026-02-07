import { useState, useEffect, useRef } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { getActiveMembership, getOrg } from '../lib/orgService'
import { getOrgTeams, getTeamMembership } from '../lib/teamService'
import {
  getMeetingsInRange,
  getMeetingsInRangeForUser,
  createMeeting,
  MEETING_SCOPES,
} from '../lib/meetingService'
import { importICSFile, getImportedEventsInRange } from '../lib/calendarImportService'
import { getTodosInRange, addTodo, toggleTodo, deleteTodo } from '../lib/todoService'
import { Button } from '../components/ui/Button'
import { UploadIcon } from '../components/ui/Icons'
import { Timestamp } from 'firebase/firestore'
import '../styles/variables.css'
import './AppLayout.css'
import './CalendarPage.css'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const VIEWS = ['month', 'week', 'day']

function formatMeetingTime(startAt) {
  if (!startAt) return ''
  const ms = startAt?.toMillis?.() ?? startAt
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function CalendarPage() {
  const { user, setNavExtra } = useOutletContext()
  const [searchParams] = useSearchParams()
  const [activeOrgId, setActiveOrgId] = useState(null)
  const [org, setOrg] = useState(null)
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [meetings, setMeetings] = useState([])
  const [filter, setFilter] = useState('personal')
  const [scopeTeamId, setScopeTeamId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [showCreateMeeting, setShowCreateMeeting] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [newMeetingDate, setNewMeetingDate] = useState('')
  const [newMeetingTime, setNewMeetingTime] = useState('')
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [createError, setCreateError] = useState('')
  const [view, setView] = useState('month')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importUrl, setImportUrl] = useState('')
  const [importSourceName, setImportSourceName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const fileInputRef = useRef(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  useEffect(() => {
    const dateParam = searchParams.get('date')
    if (dateParam) {
      const [y, m, d] = dateParam.split('-').map(Number)
      if (y && m !== undefined && d) {
        setYear(y)
        setMonth(m)
        setSelectedDate(new Date(y, m, d))
      }
    }
  }, [searchParams])

  useEffect(() => {
    if (!user) return
    getActiveMembership(user.uid).then((active) => {
      if (active) setActiveOrgId(active.orgId)
      setLoading(false)
    })
  }, [user])

  useEffect(() => {
    if (!activeOrgId || !user) return
    const load = async () => {
      const [orgData, teamsData] = await Promise.all([
        getOrg(activeOrgId),
        getOrgTeams(activeOrgId),
      ])
      setOrg(orgData)
      setTeams(teamsData)
      const mems = {}
      for (const t of teamsData) {
        const m = await getTeamMembership(activeOrgId, t.id, user.uid)
        if (m) mems[t.id] = m
      }
      setTeamMemberships(mems)
    }
    load()
  }, [activeOrgId, user])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      try {
        let list = []
        const monthsToLoad = [{ year, month }]
        if (view === 'week') {
          const ref = new Date(year, month, 1)
          const ws = new Date(ref)
          ws.setDate(ref.getDate() - ref.getDay())
          const we = new Date(ws)
          we.setDate(ws.getDate() + 6)
          if (ws.getMonth() !== month || ws.getFullYear() !== year) {
            monthsToLoad.unshift({ year: ws.getFullYear(), month: ws.getMonth() })
          }
          if ((we.getMonth() !== month || we.getFullYear() !== year) && (we.getTime() !== ws.getTime())) {
            monthsToLoad.push({ year: we.getFullYear(), month: we.getMonth() })
          }
        }
        const seen = new Set()
        for (const { year: y, month: m } of monthsToLoad) {
          const key = `${y}-${m}`
          if (seen.has(key)) continue
          seen.add(key)
          let part = []
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
            }))
            part = [...meetingsList, ...importedList, ...todosAsEvents]
          } else if (filter === 'org' && activeOrgId) {
            const orgList = await getMeetingsInRange(activeOrgId, y, m, MEETING_SCOPES.org)
            const orgData = await getOrg(activeOrgId)
            part = orgList.map((ev) => ({ ...ev, _orgName: orgData?.name }))
          } else if (filter === 'team' && activeOrgId && scopeTeamId) {
            const teamList = await getMeetingsInRange(activeOrgId, y, m, MEETING_SCOPES.team, scopeTeamId)
            const orgData = await getOrg(activeOrgId)
            part = teamList.map((ev) => ({ ...ev, _orgName: orgData?.name }))
          }
          list = [...list, ...part]
        }
        list.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0))
        setMeetings(list)
      } catch (err) {
        console.error('Calendar load error:', err)
        setMeetings([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, activeOrgId, year, month, filter, scopeTeamId, view])

  const goPrev = () => {
    if (view === 'day') {
      const d = new Date(displayDate)
      d.setDate(d.getDate() - 1)
      setSelectedDate(d)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
    } else if (view === 'week') {
      const d = new Date(weekStart)
      d.setDate(d.getDate() - 7)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      setSelectedDate(d)
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
    } else if (view === 'week') {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + 7)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      setSelectedDate(d)
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
  }

  const refDate = selectedDate || new Date()
  const weekStart = new Date(refDate)
  weekStart.setDate(refDate.getDate() - refDate.getDay())
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

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

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const handleCellClick = (day) => {
    setSelectedDate(new Date(year, month, day))
  }

  const handleCreateMeeting = async (e) => {
    e.preventDefault()
    setCreateError('')
    if (!newMeetingTitle.trim() || !activeOrgId) return
    setCreatingMeeting(true)
    try {
      let startAt
      if (newMeetingDate && newMeetingTime) {
        const dt = new Date(`${newMeetingDate}T${newMeetingTime}:00`)
        startAt = Timestamp.fromDate(dt)
      } else if (selectedDate) {
        startAt = Timestamp.fromDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 9, 0, 0))
      }
      await createMeeting(activeOrgId, {
        title: newMeetingTitle.trim(),
        scope: MEETING_SCOPES.org,
        ...(startAt && { startAt }),
      }, user.uid)
      setShowCreateMeeting(false)
      setNewMeetingTitle('')
      setNewMeetingDate('')
      setNewMeetingTime('')
      if (filter === 'personal') {
        const [meetingsList, importedList, todosList] = await Promise.all([
          getMeetingsInRangeForUser(user.uid, year, month),
          getImportedEventsInRange(user.uid, year, month),
          getTodosInRange(user.uid, year, month).catch(() => []),
        ])
        const todosAsEvents = todosList.map((t) => ({
          id: t.id,
          title: t.text,
          startAt: t.dueDate,
          _todo: true,
          done: t.done,
        }))
        setMeetings([...meetingsList, ...importedList, ...todosAsEvents])
      } else if (filter === 'org' && activeOrgId) {
        const list = await getMeetingsInRange(activeOrgId, year, month, MEETING_SCOPES.org)
        const orgData = await getOrg(activeOrgId)
        setMeetings(list.map((m) => ({ ...m, _orgName: orgData?.name })))
      } else if (filter === 'team' && activeOrgId && scopeTeamId) {
        const list = await getMeetingsInRange(activeOrgId, year, month, MEETING_SCOPES.team, scopeTeamId)
        const orgData = await getOrg(activeOrgId)
        setMeetings(list.map((m) => ({ ...m, _orgName: orgData?.name })))
      }
    } catch (err) {
      setCreateError(err.message || 'Failed to create meeting.')
    } finally {
      setCreatingMeeting(false)
    }
  }

  useEffect(() => {
    if (typeof setNavExtra === 'function') setNavExtra(undefined)
  }, [setNavExtra])

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTaskText.trim() || !user?.uid || !selectedDate) return
    setAddingTask(true)
    try {
      const dueDate = Timestamp.fromDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0))
      const t = await addTodo(user.uid, newTaskText.trim(), dueDate)
      const todoEvent = { id: t.id, title: t.text, startAt: dueDate, _todo: true, done: false }
      setMeetings((prev) => [...prev, todoEvent].sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0)))
      setNewTaskText('')
      setShowAddTask(false)
    } catch {
      // ignore
    } finally {
      setAddingTask(false)
    }
  }

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

  const handleImportSubmit = async (e) => {
    e.preventDefault()
    setImportError('')
    setImportSuccess('')
    if (!user?.uid) return
    let icsString = ''
    let sourceName = importSourceName.trim() || 'Imported calendar'
    if (importFile) {
      icsString = await importFile.text()
      sourceName = importSourceName.trim() || importFile.name || 'Imported calendar'
    } else if (importUrl.trim()) {
      const url = importUrl.trim()
      try {
        const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
        const proxyUrl = apiBase ? `${apiBase}/api/calendar/fetch-ics?url=${encodeURIComponent(url)}` : `/api/calendar/fetch-ics?url=${encodeURIComponent(url)}`
        const res = await fetch(proxyUrl)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Failed to fetch calendar (${res.status})`)
        }
        icsString = await res.text()
        sourceName = importSourceName.trim() || new URL(url).hostname || 'Imported calendar'
      } catch (err) {
        setImportError(err.message || 'Could not fetch calendar URL. Ensure the backend is running and the URL is valid.')
        return
      }
    } else {
      setImportError('Select an ICS file or enter a calendar URL.')
      return
    }
    setImporting(true)
    try {
      const { total, saved } = await importICSFile(user.uid, icsString, sourceName)
      setImportSuccess(`Imported ${saved} events (${total} total).`)
      setImportFile(null)
      setImportUrl('')
      setImportSourceName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (filter === 'personal') {
        const [meetingsList, importedList, todosList] = await Promise.all([
          getMeetingsInRangeForUser(user.uid, year, month),
          getImportedEventsInRange(user.uid, year, month),
          getTodosInRange(user.uid, year, month).catch(() => []),
        ])
        const todosAsEvents = todosList.map((t) => ({
          id: t.id,
          title: t.text,
          startAt: t.dueDate,
          _todo: true,
          done: t.done,
        }))
        setMeetings([...meetingsList, ...importedList, ...todosAsEvents])
      }
    } catch (err) {
      setImportError(err.message || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const handleImportFileChange = (e) => {
    const f = e.target.files?.[0]
    setImportFile(f || null)
    if (f) setImportUrl('')
  }

  if (loading && !user) {
    return <p className="app-muted">Loading…</p>
  }

  return (
    <main className="app-main calendar-main">
      <div className="calendar-header-row">
        <h2 className="calendar-title">Calendar</h2>
        {activeOrgId && (
          <>
            {!showCreateMeeting ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setShowCreateMeeting(true)
                  if (selectedDate) {
                    setNewMeetingDate(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`)
                  }
                }}
              >
                Create meeting
              </Button>
            ) : (
              <form onSubmit={handleCreateMeeting} className="calendar-create-form">
                <input
                  type="text"
                  placeholder="Meeting title"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  className="auth-input calendar-create-input"
                  disabled={creatingMeeting}
                />
                <input
                  type="date"
                  value={newMeetingDate}
                  onChange={(e) => setNewMeetingDate(e.target.value)}
                  className="auth-input calendar-create-date"
                  disabled={creatingMeeting}
                />
                <input
                  type="time"
                  value={newMeetingTime}
                  onChange={(e) => setNewMeetingTime(e.target.value)}
                  className="auth-input calendar-create-time"
                  disabled={creatingMeeting}
                />
                <Button type="submit" variant="primary" size="md" disabled={creatingMeeting || !newMeetingTitle.trim()}>
                  {creatingMeeting ? 'Creating…' : 'Create'}
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={() => { setShowCreateMeeting(false); setCreateError(''); }}>
                  Cancel
                </Button>
                {createError && <span className="calendar-create-error">{createError}</span>}
              </form>
            )}
          </>
        )}
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <Button variant="ghost" size="md" onClick={goPrev}>←</Button>
          <Button variant="ghost" size="md" onClick={goToday}>Today</Button>
          <Button variant="ghost" size="md" onClick={goNext}>→</Button>
          <span className="calendar-month-label">{MONTHS[month]} {year}</span>
        </div>
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
        <div className="calendar-filters">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
            title="Import calendar (ICS)"
          >
            <UploadIcon size={16} /> Import
          </Button>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="calendar-filter-select"
          >
            <option value="personal">Personal</option>
            <option value="org" disabled={!activeOrgId}>Org</option>
            <option value="team" disabled={!activeOrgId}>Team</option>
          </select>
          {filter === 'team' && (
            <select
              value={scopeTeamId || ''}
              onChange={(e) => setScopeTeamId(e.target.value || null)}
              className="calendar-filter-select"
            >
              <option value="">Select team</option>
              {teams.filter((t) => teamMemberships[t.id]?.state === 'active').map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-grid-wrap">
          {loading ? (
            <p className="app-muted">Loading meetings…</p>
          ) : view === 'week' ? (
            <div className="calendar-week-view">
              {weekDays.map((d) => {
                const key = formatDateKey(d)
                const dayMeetings = meetingsByDay[key] || []
                const selected = selectedKey === key
                const today = formatDateKey(new Date()) === key
                return (
                  <div key={key} className={`calendar-week-day ${selected ? 'calendar-cell-selected' : ''} ${today ? 'calendar-cell-today' : ''}`}>
                    <button type="button" className="calendar-week-day-header" onClick={() => setSelectedDate(d)}>
                      <span className="calendar-week-day-name">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}</span>
                      <span className="calendar-week-day-num">{d.getDate()}</span>
                    </button>
                    <ul className="calendar-week-meetings">
                      {dayMeetings.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0)).map((m) => (
                        <li key={m.id} className={`calendar-meeting-item ${m._todo && m.done ? 'calendar-meeting-done' : ''}`} title={m.title}>
                          {m._todo && <input type="checkbox" checked={!!m.done} onChange={(e) => handleToggleTask(m.id, e.target.checked)} className="calendar-cell-task-check" aria-hidden />}
                          <span className="calendar-meeting-time">{m._todo ? '' : formatMeetingTime(m.startAt)}</span>
                          <span className="calendar-meeting-title">{m.title}</span>
                          {m._imported && <span className="calendar-meeting-imported">imported</span>}
                          {m._todo && <span className="calendar-meeting-task">task</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : view === 'day' ? (
            <div className="calendar-day-view">
              <div className="calendar-day-view-header">
                <button type="button" onClick={goPrev}>←</button>
                <span>{`${MONTHS[displayDate.getMonth()]} ${displayDate.getDate()}, ${displayDate.getFullYear()}`}</span>
                <button type="button" onClick={goNext}>→</button>
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
                        <div key={m.id} className={`calendar-meeting-item ${m._todo && m.done ? 'calendar-meeting-done' : ''}`} title={m.title}>
                          {m._todo && <input type="checkbox" checked={!!m.done} onChange={(e) => handleToggleTask(m.id, e.target.checked)} className="calendar-cell-task-check" aria-hidden />}
                          <span className="calendar-meeting-time">{m._todo ? '' : formatMeetingTime(m.startAt)}</span>
                          <span className="calendar-meeting-title">{m.title}</span>
                          {m._todo && <span className="calendar-meeting-task">task</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="calendar-day-header">{d}</div>
              ))}
              {Array.from({ length: rows * 7 }, (_, i) => {
                const cellIndex = i - blanks
                const day = cellIndex >= 1 && cellIndex <= daysInMonth ? cellIndex : null
                const key = day ? formatDateKey(new Date(year, month, day)) : null
                const dayMeetings = key ? (meetingsByDay[key] || []) : []
                const selected = selectedKey === key
                return (
                  <button
                    type="button"
                    key={i}
                    className={`calendar-cell ${day ? '' : 'calendar-cell-empty'} ${day && isToday(day) ? 'calendar-cell-today' : ''} ${selected ? 'calendar-cell-selected' : ''}`}
                    onClick={() => day && handleCellClick(day)}
                    disabled={!day}
                  >
                    {day && <span className="calendar-day-num">{day}</span>}
                    {dayMeetings.length > 0 && (
                      <ul className="calendar-day-meetings">
                        {dayMeetings.slice(0, 4).map((m) => (
                          <li key={m.id} className={`calendar-meeting-item ${m._todo && m.done ? 'calendar-meeting-done' : ''}`} title={m.title}>
                            {m._todo && <input type="checkbox" checked={!!m.done} onChange={(e) => { e.stopPropagation(); handleToggleTask(m.id, e.target.checked); }} className="calendar-cell-task-check" aria-hidden />}
                            <span className="calendar-meeting-time">{m._todo ? '' : formatMeetingTime(m.startAt)}</span>
                            <span className="calendar-meeting-title">{m.title}</span>
                            {m._orgName && <span className="calendar-meeting-org">{m._orgName}</span>}
                            {m._imported && <span className="calendar-meeting-imported">imported</span>}
                            {m._todo && <span className="calendar-meeting-task">task</span>}
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

        {selectedDate && (
          <aside className="calendar-detail-panel">
            <h3 className="calendar-detail-title">
              {selectedKey === formatDateKey(new Date()) ? 'Today' : MONTHS[selectedDate.getMonth()]} {selectedDate.getDate()}, {selectedDate.getFullYear()}
            </h3>
            {filter === 'personal' && (
              <div className="calendar-detail-tasks">
                {!showAddTask ? (
                  <Button variant="outline" size="sm" onClick={() => setShowAddTask(true)} className="calendar-add-task-btn">
                    + Add task
                  </Button>
                ) : (
                  <form onSubmit={handleAddTask} className="calendar-add-task-form">
                    <input
                      type="text"
                      placeholder="Task description"
                      value={newTaskText}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      className="auth-input calendar-add-task-input"
                      disabled={addingTask}
                      autoFocus
                    />
                    <div className="calendar-add-task-actions">
                      <Button type="submit" variant="primary" size="sm" disabled={addingTask || !newTaskText.trim()}>
                        Add
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setShowAddTask(false); setNewTaskText(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
            {selectedDayMeetings.length === 0 ? (
              <p className="calendar-detail-empty">
                {filter === 'personal' ? 'No meetings or tasks' : 'No meetings scheduled'}
              </p>
            ) : (
              <ul className="calendar-detail-list">
                {selectedDayMeetings.sort((a, b) => {
                  const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
                  const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
                  return aT - bT
                }).map((m) => (
                  <li key={m.id} className={`calendar-detail-item ${m._todo ? 'calendar-detail-task' : ''} ${m._todo && m.done ? 'calendar-detail-task-done' : ''}`}>
                    {m._todo ? (
                      <>
                        <input
                          type="checkbox"
                          checked={!!m.done}
                          onChange={(e) => handleToggleTask(m.id, e.target.checked)}
                          className="calendar-task-check"
                          aria-label={m.title}
                        />
                        <span className="calendar-detail-title-text">{m.title}</span>
                        <button type="button" className="calendar-task-delete" onClick={() => handleDeleteTask(m.id)} aria-label="Delete">×</button>
                      </>
                    ) : (
                      <>
                        <span className="calendar-detail-time">{formatMeetingTime(m.startAt) || 'All day'}</span>
                        <span className="calendar-detail-title-text">{m.title}</span>
                        {m._orgName && <span className="calendar-detail-org">{m._orgName}</span>}
                        {m._imported && <span className="calendar-meeting-imported">imported</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      {showImportModal && (
        <div className="calendar-import-overlay" onClick={() => !importing && setShowImportModal(false)}>
          <div className="calendar-import-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="calendar-import-title">Import calendar</h3>
            <p className="calendar-import-desc">Import events from an ICS file or public calendar URL (Google Calendar, Outlook, etc.).</p>
            <form onSubmit={handleImportSubmit} className="calendar-import-form">
              <div className="calendar-import-field">
                <label>ICS file</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ics,.ical"
                  onChange={handleImportFileChange}
                  className="auth-input"
                />
              </div>
              <div className="calendar-import-divider">or</div>
              <div className="calendar-import-field">
                <label>Calendar URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={importUrl}
                  onChange={(e) => { setImportUrl(e.target.value); if (e.target.value) setImportFile(null); }}
                  className="auth-input"
                />
              </div>
              <div className="calendar-import-field">
                <label>Source name (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Work calendar"
                  value={importSourceName}
                  onChange={(e) => setImportSourceName(e.target.value)}
                  className="auth-input"
                />
              </div>
              {importError && <p className="calendar-import-error">{importError}</p>}
              {importSuccess && <p className="calendar-import-success">{importSuccess}</p>}
              <div className="calendar-import-actions">
                <Button type="submit" variant="primary" disabled={importing || (!importFile && !importUrl.trim())}>
                  {importing ? 'Importing…' : 'Import'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setShowImportModal(false); setImportError(''); setImportSuccess(''); }} disabled={importing}>
                  Close
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
