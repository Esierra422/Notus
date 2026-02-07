import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMeetingsInRangeForUser } from '../../lib/meetingService'
import { getTodosInRange } from '../../lib/todoService'
import { CalendarIcon } from '../ui/Icons'
import './MiniCalendarWidget.css'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatTime(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  if (h === 0 && m === 0) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function isAllDay(ms) {
  if (!ms) return true
  const d = new Date(ms)
  return d.getHours() === 0 && d.getMinutes() === 0
}

function getDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MiniCalendarWidget({ userId }) {
  const navigate = useNavigate()
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(now)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  const todayKey = getDateKey(now)
  const selectedKey = getDateKey(selectedDate)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    const nextMonth = viewMonth === 11 ? { y: viewYear + 1, m: 0 } : { y: viewYear, m: viewMonth + 1 }
    Promise.all([
      getMeetingsInRangeForUser(userId, viewYear, viewMonth),
      getMeetingsInRangeForUser(userId, nextMonth.y, nextMonth.m),
      getTodosInRange(userId, viewYear, viewMonth).catch(() => []),
      getTodosInRange(userId, nextMonth.y, nextMonth.m).catch(() => []),
    ]).then(([currMeet, nextMeet, currTodo, nextTodo]) => {
      const todosAsEvents = [...currTodo, ...nextTodo].map((t) => ({
        id: t.id,
        title: t.text,
        startAt: t.dueDate,
        _todo: true,
        done: t.done,
      }))
      setMeetings([...currMeet, ...nextMeet, ...todosAsEvents])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [userId, viewYear, viewMonth])

  const byDate = {}
  for (const m of meetings) {
    const ms = m.startAt?.toMillis?.() ?? m.startAt ?? 0
    const d = new Date(ms)
    const key = getDateKey(d)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push({ ...m, _ms: ms })
  }

  const displayMeetings = byDate[selectedKey] || []
  const displayAllDay = displayMeetings.filter((m) => isAllDay(m._ms))
  const displayTimed = displayMeetings.filter((m) => !isAllDay(m._ms)).sort((a, b) => a._ms - b._ms)

  const goPrevMonth = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const goNextMonth = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const handleDayClick = (dayNum, e) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedDate(new Date(viewYear, viewMonth, dayNum))
  }

  const handleViewCalendar = (e) => {
    e.preventDefault()
    const d = selectedDate
    navigate(`/app/calendar?date=${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const gridDays = []
  for (let i = 0; i < firstDay; i++) gridDays.push(null)
  for (let i = 1; i <= daysInMonth; i++) gridDays.push(i)

  if (!userId) return null

  return (
    <div className="mini-calendar-widget">
      <div className="mini-calendar-header">
        <div className="mini-calendar-nav">
          <button type="button" className="mini-calendar-nav-btn" onClick={goPrevMonth} aria-label="Previous month">
            ←
          </button>
          <span className="mini-calendar-month-label">{MONTHS[viewMonth].slice(0, 3)} {viewYear}</span>
          <button type="button" className="mini-calendar-nav-btn" onClick={goNextMonth} aria-label="Next month">
            →
          </button>
        </div>
        <button
          type="button"
          className="mini-calendar-view-link"
          onClick={handleViewCalendar}
        >
          View calendar →
        </button>
      </div>

      {loading ? (
        <p className="mini-calendar-loading">Loading…</p>
      ) : (
        <>
          <div className="mini-calendar-grid-wrap">
            <div className="mini-calendar-dow">
              {DAYS.map((d) => (
                <span key={d} className="mini-calendar-dow-cell">{d.slice(0, 2)}</span>
              ))}
            </div>
            <div className="mini-calendar-grid">
              {gridDays.map((n, i) => {
                if (n === null) return <span key={`empty-${i}`} className="mini-calendar-cell mini-calendar-cell-empty" />
                const d = new Date(viewYear, viewMonth, n)
                const key = getDateKey(d)
                const hasEvents = (byDate[key] || []).length > 0
                const isToday = key === todayKey
                const isSelected = key === selectedKey
                return (
                  <button
                    type="button"
                    key={key}
                    className={`mini-calendar-cell ${isToday ? 'mini-calendar-cell-today' : ''} ${isSelected ? 'mini-calendar-cell-selected' : ''} ${hasEvents ? 'mini-calendar-cell-has-events' : ''}`}
                    onClick={(e) => handleDayClick(n, e)}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mini-calendar-events">
            <div className="mini-calendar-today">
              <div className="mini-calendar-today-header">
                <span className="mini-calendar-today-dow">
                  {selectedKey === todayKey ? 'TODAY' : DAYS[selectedDate.getDay()].toUpperCase()}
                </span>
                <span className="mini-calendar-today-date">{selectedDate.getDate()} {MONTHS[selectedDate.getMonth()].slice(0, 3)}</span>
              </div>
              <div className="mini-calendar-today-list">
                {displayMeetings.length === 0 ? (
                  <span className="mini-calendar-no-events">No meetings or tasks</span>
                ) : (
                  <>
                    {displayAllDay.slice(0, 3).map((m) => (
                      <div key={m.id} className="mini-calendar-event-pill">
                        <CalendarIcon size={14} className="mini-calendar-event-icon" />
                        <span className="mini-calendar-event-title">{m.title}{m._orgName ? ` · ${m._orgName}` : ''}</span>
                      </div>
                    ))}
                    {displayTimed.slice(0, 3).map((m) => (
                      <div key={m.id} className="mini-calendar-event-pill">
                        <CalendarIcon size={14} className="mini-calendar-event-icon" />
                        <span className="mini-calendar-event-title">{m.title}</span>
                        <span className="mini-calendar-event-time">{formatTime(m._ms)}</span>
                      </div>
                    ))}
                    {displayMeetings.length > 6 && (
                      <span className="mini-calendar-more">{displayMeetings.length - 6} more</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
