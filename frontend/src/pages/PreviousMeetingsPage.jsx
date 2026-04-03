import { useState, useEffect } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { getUserSummaries } from '../lib/meetingSummaryService'
import { FileTextIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './PreviousMeetingsPage.css'

function groupByDate(summaries) {
  const groups = {}
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)

  for (const s of summaries) {
    const ms = s.createdAt?.toMillis?.() ?? (s.createdAt?.seconds ? s.createdAt.seconds * 1000 : s.createdAt)
    const d = new Date(ms)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    let label
    if (dayStart.getTime() === today.getTime()) label = 'Today'
    else if (dayStart.getTime() === yesterday.getTime()) label = 'Yesterday'
    else label = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    if (!groups[label]) groups[label] = []
    groups[label].push({ ...s, _ms: ms })
  }
  return groups
}

function formatTime(ts) {
  const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : ts)
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function PreviousMeetingsPage() {
  const { user } = useOutletContext()
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)
    setLoadError('')
    getUserSummaries(user.uid)
      .then((data) => {
        setSummaries(data)
      })
      .catch((err) => {
        console.error('[PreviousMeetings] Failed to load summaries:', err.code, err.message)
        setLoadError(err.message || 'Could not load summaries. If this persists, deploy Firestore indexes: firebase deploy --only firestore:indexes')
        setSummaries([])
      })
      .finally(() => setLoading(false))
  }, [user?.uid])

  if (loading) {
    return (
      <div className="prev-meetings-page">
        <div className="prev-meetings-loading">
          <div className="prev-meetings-spinner" />
          <p>Loading your meetings...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="prev-meetings-page">
        <div className="prev-meetings-empty">
          <h2>Could not load summaries</h2>
          <p className="prev-meetings-error-text">{loadError}</p>
        </div>
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <div className="prev-meetings-page">
        <div className="prev-meetings-empty">
          <FileTextIcon size={48} className="prev-meetings-empty-icon" />
          <h2>No meeting summaries yet</h2>
          <p>After you leave a video call with enough conversation, a summary will automatically be generated here.</p>
        </div>
      </div>
    )
  }

  const groups = groupByDate(summaries)
  const sortedGroupEntries = Object.entries(groups).sort((a, b) => {
    const maxA = Math.max(...a[1].map((x) => x._ms || 0))
    const maxB = Math.max(...b[1].map((x) => x._ms || 0))
    return maxB - maxA
  })

  return (
    <div className="prev-meetings-page">
      {sortedGroupEntries.map(([dateLabel, items]) => (
        <div key={dateLabel} className="prev-meetings-group">
          <h2 className="prev-meetings-date-label">{dateLabel}</h2>
          <div className="prev-meetings-list">
            {items.map(s => (
              <Link key={s.id} to={`/app/meeting-summary/${s.id}`} className="prev-meetings-card">
                <div className="prev-meetings-card-header">
                  <h3 className="prev-meetings-card-title">{s.title}</h3>
                  <span className="prev-meetings-card-time">{formatTime(s.createdAt)}</span>
                </div>
                <p className="prev-meetings-card-preview">
                  {(s.summary || '').slice(0, 150)}{(s.summary || '').length > 150 ? '...' : ''}
                </p>
                <div className="prev-meetings-card-footer">
                  {s.channelName && (
                    <span className="prev-meetings-card-channel">#{s.channelName}</span>
                  )}
                  {s.participants?.length > 0 && (
                    <span className="prev-meetings-card-participants">
                      {s.participants.length} participant{s.participants.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="prev-meetings-card-words">{s.wordCount?.toLocaleString()} words</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
