import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSummary } from '../lib/meetingSummaryService'
import { downloadMeetingSummaryPdf, downloadMeetingSummaryDocx } from '../lib/exportMeetingDoc'
import { Button } from '../components/ui/Button'
import { ArrowLeftIcon, CalendarIcon, LayoutDashboardIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './MeetingSummaryPage.css'

function formatDate(ts) {
  if (!ts) return ''
  const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : ts)
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function MeetingSummaryPage() {
  const { summaryId } = useParams()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportBusy, setExportBusy] = useState(null)

  useEffect(() => {
    if (!summaryId) return
    setLoading(true)
    getSummary(summaryId)
      .then(data => {
        if (!data) setError('Summary not found.')
        else setSummary(data)
      })
      .catch(err => {
        console.error('[MeetingSummaryPage] Error loading summary:', err)
        setError('Failed to load summary.')
      })
      .finally(() => setLoading(false))
  }, [summaryId])

  if (loading) {
    return (
      <div className="summary-page">
        <div className="summary-loading">
          <div className="summary-loading-spinner" />
          <p>Loading summary...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="summary-page">
        <div className="summary-error">
          <p>{error}</p>
          <Button as={Link} to="/app/video/meetings" variant="outline" size="sm">
            <ArrowLeftIcon size={16} /> Back to past meetings
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="summary-page">
      <div className="summary-nav">
        <Button as={Link} to="/app/video/meetings" variant="ghost" size="sm">
          <ArrowLeftIcon size={16} /> Past Meetings
        </Button>
        <div className="summary-nav-links">
          <Button as={Link} to="/app" variant="ghost" size="sm">
            <LayoutDashboardIcon size={16} /> Dashboard
          </Button>
          <Button as={Link} to="/app/calendar" variant="ghost" size="sm">
            <CalendarIcon size={16} /> Calendar
          </Button>
        </div>
      </div>

      <div className="summary-header">
        <h1 className="summary-title">{summary.title}</h1>
        <div className="summary-meta">
          <span className="summary-date">{formatDate(summary.createdAt)}</span>
          {summary.participants?.length > 0 && (
            <span className="summary-participants">
              {summary.participants.length} participant{summary.participants.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="summary-word-count">{summary.wordCount?.toLocaleString()} words transcribed</span>
        </div>
        {summary.participants?.length > 0 && (
          <div className="summary-participant-list">
            {summary.participants.map((name, i) => (
              <span key={i} className="summary-participant-chip">{name}</span>
            ))}
          </div>
        )}
        <div className="summary-export-bar">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exportBusy}
            onClick={async () => {
              setExportBusy('pdf')
              try {
                await downloadMeetingSummaryPdf(summary)
              } finally {
                setExportBusy(null)
              }
            }}
          >
            {exportBusy === 'pdf' ? '…' : 'Download PDF'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exportBusy}
            onClick={async () => {
              setExportBusy('docx')
              try {
                await downloadMeetingSummaryDocx(summary)
              } finally {
                setExportBusy(null)
              }
            }}
          >
            {exportBusy === 'docx' ? '…' : 'Download Word'}
          </Button>
        </div>
      </div>

      <div className="summary-body">
        <section className="summary-section">
          <h2>Summary</h2>
          <div className="summary-text">{summary.summary}</div>
        </section>

        {summary.keyPoints?.length > 0 && (
          <section className="summary-section">
            <h2>Key Points</h2>
            <ul className="summary-key-points">
              {summary.keyPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        {summary.actionItems?.length > 0 && (
          <section className="summary-section">
            <h2>Action Items</h2>
            <ul className="summary-action-items">
              {summary.actionItems.map((item, i) => (
                <li key={i}>
                  <span className="summary-action-bullet" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {summary.transcript && String(summary.transcript).trim() && (
          <section className="summary-section summary-section--transcript" id="meeting-transcript">
            <h2>Full Transcript</h2>
            <div className="summary-transcript-text summary-transcript-text--open">{summary.transcript}</div>
          </section>
        )}
      </div>
    </div>
  )
}
