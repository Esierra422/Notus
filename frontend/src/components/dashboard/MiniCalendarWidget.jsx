import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadPersonalCalendarMonthForUser } from '../../lib/dashboardCalendarService'
import { formatCalendarDateQueryParam } from '../../lib/dateUtils'
import { CalendarIcon } from '../ui/Icons'
import './MiniCalendarWidget.css'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Consistent dot order in the mini grid */
const SOURCE_DOT_ORDER = ['personal', 'org', 'team']

function sourcesForDay(rowsByDate, key) {
  const set = rowsByDate[key]
  if (!set || set.size === 0) return []
  return SOURCE_DOT_ORDER.filter((s) => set.has(s))
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
      loadPersonalCalendarMonthForUser(userId, viewYear, viewMonth),
      loadPersonalCalendarMonthForUser(userId, nextMonth.y, nextMonth.m),
    ])
      .then(([currRows, nextRows]) => {
        setMeetings([...currRows, ...nextRows])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId, viewYear, viewMonth])

  /** dateKey -> Set of calendar sources present that day (personal | org | team) */
  const rowsByDate = {}
  for (const m of meetings) {
    if (m._todo && m.done) continue
    const ms = m.startAt?.toMillis?.() ?? m.startAt ?? 0
    if (!ms) continue
    const d = new Date(ms)
    const key = getDateKey(d)
    const src = m._calendarSource || 'personal'
    if (!rowsByDate[key]) rowsByDate[key] = new Set()
    rowsByDate[key].add(src)
  }

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

  const goToFullCalendar = (d) => {
    const qs = formatCalendarDateQueryParam(d)
    navigate(qs ? `/app/calendar?date=${qs}` : '/app/calendar')
  }

  const handleViewCalendar = (e) => {
    e.preventDefault()
    e.stopPropagation()
    goToFullCalendar(selectedDate)
  }

  const handleDayDoubleClick = (dayNum, e) => {
    e.preventDefault()
    e.stopPropagation()
    goToFullCalendar(new Date(viewYear, viewMonth, dayNum))
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
        <button type="button" className="mini-calendar-view-link" onClick={handleViewCalendar}>
          View Calendar →
        </button>
      </div>

      {loading ? (
        <p className="mini-calendar-loading">Loading…</p>
      ) : (
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
              const dotSources = sourcesForDay(rowsByDate, key)
              const hasEvents = dotSources.length > 0
              const isToday = key === todayKey
              const isSelected = key === selectedKey
              return (
                <button
                  type="button"
                  key={key}
                  className={`mini-calendar-cell ${isToday ? 'mini-calendar-cell-today' : ''} ${isSelected ? 'mini-calendar-cell-selected' : ''} ${hasEvents ? 'mini-calendar-cell-has-events' : ''}`}
                  onClick={(e) => handleDayClick(n, e)}
                  onDoubleClick={(e) => handleDayDoubleClick(n, e)}
                >
                  <span className="mini-calendar-cell-num">{n}</span>
                  <span className="mini-calendar-event-dots" aria-hidden>
                    {hasEvents ? (
                      dotSources.map((src) => (
                        <span
                          key={src}
                          className={`mini-calendar-event-dot mini-calendar-event-dot--${src}`}
                        />
                      ))
                    ) : (
                      <span className="mini-calendar-event-dot mini-calendar-event-dot--empty" />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mini-calendar-hint">
            <CalendarIcon size={14} className="mini-calendar-hint-icon" aria-hidden />
            <span>
              Dots match your personal calendar: <span className="mini-calendar-legend-personal">blue</span> personal
              (private, tasks, imports), <span className="mini-calendar-legend-org">gold</span> organization-wide,{' '}
              <span className="mini-calendar-legend-team">green</span> team. Use <strong>View Calendar</strong> or
              double-click a day.
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
