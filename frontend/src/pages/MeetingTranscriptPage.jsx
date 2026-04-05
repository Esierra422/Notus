import { useState, useEffect } from 'react'
import { useOutletContext, useParams, Link } from 'react-router-dom'
import { getMeetingTranscriptBySessionId } from '../lib/meetingSummaryService'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        if (!data?.text) {
          setError(
            'No saved transcript for this session. It may have been cleared after an AI summary, or the meeting had no transcription.'
          )
          setText('')
        } else {
          setText(data.text)
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

  if (error && !text) {
    return (
      <div className="summary-page meeting-transcript-page">
        <div className="summary-error">
          <p>{error}</p>
          <Button as={Link} to="/app/previous-meetings" variant="outline" size="sm">
            <ArrowLeftIcon size={16} /> Previous meetings
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="summary-page meeting-transcript-page">
      <div className="summary-nav">
        <Button as={Link} to="/app/previous-meetings" variant="ghost" size="sm">
          <ArrowLeftIcon size={16} /> Previous meetings
        </Button>
      </div>
      <header className="meeting-transcript-header">
        <h1 className="summary-title">Meeting transcript</h1>
        <p className="meeting-transcript-meta">Session: <code>{sessionId}</code></p>
      </header>
      <section className="meeting-transcript-body" id="meeting-transcript">
        <p className="meeting-transcript-text">{text}</p>
      </section>
    </div>
  )
}
