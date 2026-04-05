import { useState, useEffect } from 'react'
import { useOutletContext, useParams, Link } from 'react-router-dom'
import { getMeetingTranscriptBySessionId } from '../lib/meetingSummaryService'
import { downloadTranscriptPdf, downloadTranscriptDocx } from '../lib/exportMeetingDoc'
import { Button } from '../components/ui/Button'
import { ArrowLeftIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './MeetingSummaryPage.css'
import './MeetingTranscriptPage.css'

export function MeetingTranscriptPage() {
  const { sessionId: rawId } = useParams()
  const sessionId = rawId ? decodeURIComponent(rawId) : ''
  const { user } = useOutletContext()
  const [text, setText] = useState('')
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportBusy, setExportBusy] = useState(null)

  /* eslint-disable react-hooks/set-state-in-effect -- load gate matches MeetingSummaryPage */
  useEffect(() => {
    if (!sessionId) {
      setLoading(false)
      setError('Missing session.')
      return
    }
    if (!user?.uid) return
    let cancelled = false
    setLoading(true)
    setError('')
    getMeetingTranscriptBySessionId(sessionId)
      .then((data) => {
        if (cancelled) return
        if (!data?.text && !(Array.isArray(data?.segments) && data.segments.length)) {
          setError(
            'No saved transcript for this session. It may have been cleared after an AI summary, or the meeting had no transcription.'
          )
          setText('')
          setSegments([])
        } else {
          setText(data.text || '')
          setSegments(Array.isArray(data.segments) ? data.segments : [])
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[MeetingTranscriptPage]', err)
          setError('Could not load transcript.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, user?.uid])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className="summary-page meeting-transcript-page">
        <div className="summary-loading">
          <div className="summary-loading-spinner" />
          <p>Loading transcript…</p>
        </div>
      </div>
    )
  }

  if (error && !text && !segments.length) {
    return (
      <div className="summary-page meeting-transcript-page">
        <div className="summary-error">
          <p>{error}</p>
          <Button as={Link} to="/app/video/meetings" variant="outline" size="sm">
            <ArrowLeftIcon size={16} /> Past meetings
          </Button>
        </div>
      </div>
    )
  }

  const exportTitle = `Transcript ${sessionId.slice(0, 24)}${sessionId.length > 24 ? '…' : ''}`

  return (
    <div className="summary-page meeting-transcript-page">
      <div className="summary-nav">
        <Button as={Link} to="/app/video/meetings" variant="ghost" size="sm">
          <ArrowLeftIcon size={16} /> Past meetings
        </Button>
      </div>
      <header className="meeting-transcript-header">
        <h1 className="summary-title">Meeting transcript</h1>
        <p className="meeting-transcript-meta">Session: <code>{sessionId}</code></p>
        <div className="meeting-transcript-export-bar">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exportBusy}
            onClick={async () => {
              setExportBusy('pdf')
              try {
                await downloadTranscriptPdf(exportTitle, text, segments)
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
                await downloadTranscriptDocx(exportTitle, text, segments)
              } finally {
                setExportBusy(null)
              }
            }}
          >
            {exportBusy === 'docx' ? '…' : 'Download Word'}
          </Button>
        </div>
      </header>
      <section className="meeting-transcript-body" id="meeting-transcript" aria-label="Transcript content">
        {segments.length > 0 ? (
          <ul className="meeting-transcript-lines">
            {segments.map((s, i) => (
              <li key={i} className="meeting-transcript-line">
                <div className="meeting-transcript-line-meta">
                  {s.timeLabel ? <span className="meeting-transcript-time">{s.timeLabel}</span> : null}
                  {s.speaker ? <span className="meeting-transcript-speaker">{s.speaker}</span> : null}
                </div>
                <p className="meeting-transcript-line-text">{s.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meeting-transcript-text">{text}</p>
        )}
      </section>
    </div>
  )
}
