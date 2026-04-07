import { useState, useEffect, useMemo, useCallback } from 'react'
import { useOutletContext, useParams, Link } from 'react-router-dom'
import { Copy, Check, Send, Sparkles } from 'lucide-react'
import { getMeetingTranscriptBySessionId, askMeetingRecap } from '../lib/meetingSummaryService'
import { Button } from '../components/ui/Button'
import { ArrowLeftIcon, CalendarIcon, LayoutDashboardIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './MeetingSummaryPage.css'
import './MeetingTranscriptPage.css'

function copyText(text, setCopied, key) {
  const t = String(text || '').trim()
  if (!t || !navigator.clipboard?.writeText) return
  navigator.clipboard.writeText(t).catch(() => {})
  setCopied(key)
  window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000)
}

function TranscriptCopyButton({ copied, onCopy, disabled }) {
  return (
    <button
      type="button"
      className="meeting-recap-copy-btn"
      onClick={onCopy}
      disabled={disabled}
      aria-label={copied ? 'Copied' : 'Copy transcript'}
    >
      {copied ? <Check size={16} strokeWidth={2.25} aria-hidden /> : <Copy size={16} strokeWidth={2.25} aria-hidden />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function MeetingTranscriptPage() {
  const { sessionId: rawId } = useParams()
  const sessionId = rawId ? decodeURIComponent(rawId) : ''
  const { user } = useOutletContext() || {}
  const [text, setText] = useState('')
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportBusy, setExportBusy] = useState(null)
  const [copiedSection, setCopiedSection] = useState(null)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiMessages, setAiMessages] = useState([])
  const [aiLoading, setAiLoading] = useState(false)

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

  const fullTranscriptText = useMemo(() => {
    if (segments.length > 0) {
      return segments
        .map((s) => {
          const head = [s.timeLabel, s.speaker].filter(Boolean).join(' · ')
          return head ? `[${head}] ${s.text || ''}` : s.text || ''
        })
        .join('\n\n')
    }
    return text || ''
  }, [segments, text])

  const sendAiQuestion = useCallback(async () => {
    const q = aiQuestion.trim()
    if (!q || aiLoading || !user?.uid) return
    setAiMessages((m) => [...m, { role: 'user', text: q }])
    setAiQuestion('')
    setAiLoading(true)
    const { answer, error: err } = await askMeetingRecap({
      channel: '',
      sessionId,
      uid: user.uid,
      orgId: '',
      question: q,
    })
    setAiMessages((m) => [...m, { role: 'ai', text: err || answer || 'No response.' }])
    setAiLoading(false)
  }, [aiQuestion, aiLoading, user?.uid, sessionId])

  if (loading) {
    return (
      <div className="summary-page meeting-recap-page meeting-transcript-page">
        <div className="summary-loading">
          <div className="summary-loading-spinner" />
          <p>Loading transcript…</p>
        </div>
      </div>
    )
  }

  if (error && !text && !segments.length) {
    return (
      <div className="summary-page meeting-recap-page meeting-transcript-page">
        <div className="summary-error">
          <p>{error}</p>
          <Button as={Link} to="/app/video/meetings" variant="outline" size="sm">
            <ArrowLeftIcon size={16} /> Past meetings
          </Button>
        </div>
      </div>
    )
  }

  const exportTitle = 'Meeting transcript'

  return (
    <div className="summary-page meeting-recap-page meeting-transcript-page">
      <nav className="meeting-recap-nav" aria-label="Breadcrumb">
        <Button as={Link} to="/app/video/meetings" variant="ghost" size="sm">
          <ArrowLeftIcon size={16} /> Past meetings
        </Button>
        <div className="meeting-recap-nav-links">
          <Button as={Link} to="/app" variant="ghost" size="sm">
            <LayoutDashboardIcon size={16} /> Dashboard
          </Button>
          <Button as={Link} to="/app/calendar" variant="ghost" size="sm">
            <CalendarIcon size={16} /> Calendar
          </Button>
        </div>
      </nav>

      <header className="meeting-transcript-hero meeting-recap-hero">
        <h1 className="meeting-recap-title">Saved transcript</h1>
        <p className="meeting-recap-meta-line">
          Transcript only. AI notes appear here after the host ends the meeting for everyone.
        </p>
        <details className="meeting-transcript-tech">
          <summary>Technical reference</summary>
          <p className="meeting-transcript-tech-body">
            Session ID <code>{sessionId}</code>
          </p>
        </details>
        <div className="meeting-recap-hero-actions meeting-transcript-export-bar">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exportBusy}
            onClick={async () => {
              setExportBusy('pdf')
              try {
                const { downloadTranscriptPdf } = await import('../lib/exportMeetingDoc')
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
                const { downloadTranscriptDocx } = await import('../lib/exportMeetingDoc')
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

      <div className="meeting-recap-toc" role="navigation" aria-label="On this page">
        <a href="#meeting-transcript">Transcript</a>
        <a href="#recap-ask-ai">Ask AI</a>
      </div>

      <main className="meeting-recap-main">
        <section className="meeting-recap-panel meeting-recap-panel--transcript" id="meeting-transcript">
          <div className="meeting-recap-panel-head">
            <h2 className="meeting-recap-panel-title">Full transcript</h2>
            <TranscriptCopyButton
              copied={copiedSection === 'tr'}
              onCopy={() => copyText(fullTranscriptText, setCopiedSection, 'tr')}
              disabled={!fullTranscriptText.trim()}
            />
          </div>
          {segments.length > 0 ? (
            <ul className="meeting-transcript-lines meeting-transcript-lines--recap">
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
            <div className="meeting-recap-transcript-scroll">{text}</div>
          )}
        </section>

        <section className="meeting-recap-panel meeting-recap-panel--ai" id="recap-ask-ai">
          <div className="meeting-recap-panel-head meeting-recap-panel-head--ai">
            <h2 className="meeting-recap-panel-title">
              <Sparkles size={20} strokeWidth={2} className="meeting-recap-ai-icon" aria-hidden />
              Ask about this transcript
            </h2>
          </div>
          <p className="meeting-recap-ai-lead">
            Uses the same meeting search as in-call Ask AI when your AI backend and index are available.
          </p>
          <div className="meeting-recap-ai-thread" role="log" aria-live="polite" aria-relevant="additions">
            {aiMessages.length === 0 && (
              <p className="meeting-recap-ai-empty">Try summarizing the discussion or asking who said what.</p>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`meeting-recap-ai-bubble meeting-recap-ai-bubble--${msg.role}`}>
                {msg.text}
              </div>
            ))}
            {aiLoading && <div className="meeting-recap-ai-bubble meeting-recap-ai-bubble--ai meeting-recap-ai-thinking">Thinking…</div>}
          </div>
          <div className="meeting-recap-ai-compose">
            <input
              type="text"
              className="meeting-recap-ai-input"
              placeholder="Ask a question…"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendAiQuestion()}
              disabled={aiLoading || !user?.uid}
              aria-label="Question for AI"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="meeting-recap-ai-send"
              disabled={aiLoading || !aiQuestion.trim() || !user?.uid}
              onClick={sendAiQuestion}
              aria-label="Send question"
            >
              <Send size={18} strokeWidth={2.25} aria-hidden />
            </Button>
          </div>
          {!user?.uid && <p className="meeting-recap-ai-signin">Sign in to use Ask AI.</p>}
        </section>
      </main>
    </div>
  )
}
