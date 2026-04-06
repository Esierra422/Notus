import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  getPersonalCalendarUpcomingInHorizon,
  dashboardCalendarRowKey,
} from '../../lib/dashboardCalendarService'
import { CalendarIcon } from '../ui/Icons'
import './UpcomingEventsWidget.css'

const SOURCE_LABELS = { personal: 'Personal', org: 'Organization', team: 'Team' }

function formatStart(startAt, locale) {
  const ms = startAt?.toMillis?.() ?? 0
  if (!ms) return ''
  const d = new Date(ms)
  return d.toLocaleString(locale || undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function UpcomingEventsWidget({ userId, locale }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    getPersonalCalendarUpcomingInHorizon(userId, 14, 28)
      .then((list) => {
        if (!cancelled) setItems(list || [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!userId) return null

  return (
    <section className="dashboard-widget dashboard-widget-upcoming">
      <div className="dashboard-widget-header">
        <h3 className="dashboard-widget-title">
          <CalendarIcon size={20} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
          Upcoming events
        </h3>
        <Link to="/app/calendar" className="dashboard-widget-link" title="Opens your personal calendar (all orgs, imports, tasks)">
          Calendar →
        </Link>
      </div>
      {loading ? (
        <p className="upcoming-events-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="upcoming-events-muted">Nothing in the next two weeks on your personal calendar (meetings, imports, or tasks).</p>
      ) : (
        <ul className="upcoming-events-list">
          {items.map((m) => {
            const src = m._calendarSource || 'personal'
            const label = SOURCE_LABELS[src] || SOURCE_LABELS.personal
            return (
              <li
                key={dashboardCalendarRowKey(m)}
                className={`upcoming-events-row upcoming-events-row--src-${src}`}
              >
                <div className="upcoming-events-row-main">
                  <span className="upcoming-events-title">
                    {m._todo ? (m.title || m.text || 'Task') : m.title || 'Event'}
                    <span className="upcoming-events-source">{label}</span>
                    {m._todo ? <span className="upcoming-events-badge"> Task</span> : null}
                    {m._imported ? <span className="upcoming-events-badge"> Imported</span> : null}
                  </span>
                  {(m._orgName || m._todo || m._imported) && (
                    <span className="upcoming-events-org">
                      {m._orgName
                        ? m._orgName
                        : m._todo
                          ? 'Due date'
                          : m._imported
                            ? 'External calendar'
                            : ''}
                    </span>
                  )}
                </div>
                <span className="upcoming-events-time">{formatStart(m.startAt, locale)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
