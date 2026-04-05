import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getUpcomingMeetingsInHorizonForUser } from '../../lib/meetingService'
import { CalendarIcon } from '../ui/Icons'
import './UpcomingEventsWidget.css'

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
    getUpcomingMeetingsInHorizonForUser(userId, 14, 20, { includeNonVideo: true })
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
        <Link to="/app/calendar" className="dashboard-widget-link">
          Calendar →
        </Link>
      </div>
      {loading ? (
        <p className="upcoming-events-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="upcoming-events-muted">No scheduled events in the next two weeks.</p>
      ) : (
        <ul className="upcoming-events-list">
          {items.map((m) => (
            <li key={`${m.orgId}-${m.id}`} className="upcoming-events-row">
              <div className="upcoming-events-row-main">
                <span className="upcoming-events-title">
                  {m.title || 'Event'}
                  {m.isVideoMeeting === false ? <span className="upcoming-events-badge"> Calendar</span> : null}
                </span>
                {m._orgName && <span className="upcoming-events-org">{m._orgName}</span>}
              </div>
              <span className="upcoming-events-time">{formatStart(m.startAt, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
