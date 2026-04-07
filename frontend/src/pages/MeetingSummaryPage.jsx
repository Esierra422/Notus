import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import { Copy, Check, Send, Sparkles, Paperclip, Download } from 'lucide-react'
import {
  getSummary,
  askMeetingRecap,
  getSummaryTranscriptDisplaySegments,
  getSummaryTranscriptCopyText,
  formatSummarySegmentTime,
  labelForSummarySegment,
} from '../lib/meetingSummaryService'
import { fetchMeetingSharedDocuments } from '../lib/meetingRoomChatService'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { InlineToast } from '../components/ui/InlineToast'
import { useInlineToast } from '../hooks/useInlineToast.js'
import { ArrowLeftIcon, CalendarIcon, LayoutDashboardIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './MeetingSummaryPage.css'

function formatDate(ts) {
  if (!ts) return ''
  const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : ts)
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSharedFileTime(ts) {
  if (!ts) return ''
  const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : ts)
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function copyText(text, setCopied, key, onDone) {
  const t = String(text || '').trim()
  if (!t || !navigator.clipboard?.writeText) return
  navigator.clipboard.writeText(t).catch(() => {})
  setCopied(key)
  onDone?.()
  window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000)
}

function RecapCopyButton({ label, copied, onCopy, disabled }) {
  return (
    <button
      type="button"
      className="meeting-recap-copy-btn"
      onClick={onCopy}
      disabled={disabled}
      aria-label={copied ? 'Copied' : `Copy ${label}`}
    >
      {copied ? <Check size={16} strokeWidth={2.25} aria-hidden /> : <Copy size={16} strokeWidth={2.25} aria-hidden />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function MeetingSummaryPage() {
  const { summaryId } = useParams()
  const { user } = useOutletContext() || {}
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportBusy, setExportBusy] = useState(null)
  const [copiedSection, setCopiedSection] = useState(null)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiMessages, setAiMessages] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [sharedDocs, setSharedDocs] = useState([])
  const [sharedDocsLoading, setSharedDocsLoading] = useState(false)
  const [sharedDocsError, setSharedDocsError] = useState('')
  const { toast, showToast } = useInlineToast()

  useEffect(() => {
    if (!summaryId) return
    setLoading(true)
    getSummary(summaryId)
      .then((data) => {
        if (!data) setError('Summary not found.')
        else setSummary(data)
      })
      .catch((err) => {
        console.error('[MeetingSummaryPage] Error loading summary:', err)
        setError('Failed to load summary.')
      })
      .finally(() => setLoading(false))
  }, [summaryId])

  useEffect(() => {
    const ch = (summary?.channelName || '').trim()
    const uid = user?.uid
    if (!ch || !uid) {
      setSharedDocs([])
      setSharedDocsError('')
      setSharedDocsLoading(false)
      return undefined
    }
    let cancelled = false
    setSharedDocsLoading(true)
    setSharedDocsError('')
    fetchMeetingSharedDocuments(ch, uid)
      .then((docs) => {
        if (!cancelled) setSharedDocs(docs)
      })
      .catch((err) => {
        console.warn('[MeetingSummaryPage] Shared files:', err)
        if (!cancelled) {
          setSharedDocs([])
          setSharedDocsError(err?.message || 'Could not load shared files from the meeting chat.')
        }
      })
      .finally(() => {
        if (!cancelled) setSharedDocsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [summary?.channelName, user?.uid])

  const keyPointsText = summary?.keyPoints?.length
    ? summary.keyPoints.map((p) => `• ${p}`).join('\n')
    : ''
  const actionItemsText = summary?.actionItems?.length
    ? summary.actionItems.map((p) => `• ${p}`).join('\n')
    : ''

  const transcriptSegments = useMemo(
    () => (summary ? getSummaryTranscriptDisplaySegments(summary) : []),
    [summary]
  )
  const transcriptUniqueUids = useMemo(
    () => new Set(transcriptSegments.map((s) => s.uid).filter(Boolean)),
    [transcriptSegments]
  )
  const transcriptCopyText = useMemo(
    () => (summary ? getSummaryTranscriptCopyText(summary) : ''),
    [summary]
  )
  const hasTranscriptSection = transcriptSegments.length > 0
  const showSharedFilesSection =
    Boolean((summary?.channelName || '').trim() && user?.uid) &&
    (sharedDocsLoading || !!sharedDocsError || sharedDocs.length > 0)

  const sendAiQuestion = useCallback(async () => {
    const q = aiQuestion.trim()
    if (!q || aiLoading || !user?.uid) return
    const sessionId = (summary?.transcriptSessionId || '').trim()
    const channel = (summary?.channelName || '').trim()
    if (!sessionId && !channel) {
      setAiMessages((m) => [...m, { role: 'ai', text: 'This recap has no session id for search. Answers may be generic.' }])
    }
    setAiMessages((m) => [...m, { role: 'user', text: q }])
    setAiQuestion('')
    setAiLoading(true)
    const { answer, error: err } = await askMeetingRecap({
      channel,
      sessionId,
      uid: user.uid,
      orgId: (summary?.orgId || '').trim(),
      question: q,
    })
    setAiMessages((m) => [...m, { role: 'ai', text: err || answer || 'No response.' }])
    setAiLoading(false)
  }, [aiQuestion, aiLoading, user?.uid, summary])

  if (loading) {
    return (
      <div className="summary-page meeting-recap-page">
        <div className="summary-loading">
          <Skeleton lines={3} />
          <p>Loading recap…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="summary-page meeting-recap-page">
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
    <div className="summary-page meeting-recap-page">
      <InlineToast message={toast?.message} tone={toast?.tone} />
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

      <header className="meeting-recap-hero">
        <h1 className="meeting-recap-title">{summary.title}</h1>
        <p className="meeting-recap-meta-line">
          <span>{formatDate(summary.createdAt)}</span>
          {summary.participants?.length > 0 && (
            <span>
              · {summary.participants.length} participant{summary.participants.length !== 1 ? 's' : ''}
            </span>
          )}
          {summary.wordCount != null && <span>· {summary.wordCount.toLocaleString()} words transcribed</span>}
        </p>
        {summary.participants?.length > 0 && (
          <div className="meeting-recap-chips">
            {summary.participants.map((name, i) => (
              <span key={i} className="meeting-recap-chip">
                {name}
              </span>
            ))}
          </div>
        )}
        <div className="meeting-recap-hero-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!exportBusy}
            onClick={async () => {
              setExportBusy('pdf')
              try {
                const { downloadMeetingSummaryPdf } = await import('../lib/exportMeetingDoc')
                await downloadMeetingSummaryPdf(summary)
                showToast('PDF export completed.')
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
                const { downloadMeetingSummaryDocx } = await import('../lib/exportMeetingDoc')
                await downloadMeetingSummaryDocx(summary)
                showToast('Word export completed.')
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
        <a href="#recap-summary">Summary</a>
        {summary.keyPoints?.length > 0 && <a href="#recap-key-points">Key points</a>}
        {summary.actionItems?.length > 0 && <a href="#recap-actions">Action items</a>}
        {showSharedFilesSection && <a href="#meeting-shared-files">Shared files</a>}
        {hasTranscriptSection && <a href="#meeting-transcript">Transcript</a>}
        <a href="#recap-ask-ai">Ask AI</a>
      </div>

      <main className="meeting-recap-main">
        <section className="meeting-recap-panel" id="recap-summary">
          <div className="meeting-recap-panel-head">
            <h2 className="meeting-recap-panel-title">Summary</h2>
            <RecapCopyButton
              label="summary"
              copied={copiedSection === 'summary'}
              onCopy={() => copyText(summary.summary, setCopiedSection, 'summary', () => showToast('Summary copied.'))}
              disabled={!String(summary.summary || '').trim()}
            />
          </div>
          <div className="meeting-recap-panel-body meeting-recap-prose">{summary.summary || 'No summary is available yet.'}</div>
        </section>

        {summary.keyPoints?.length > 0 && (
          <section className="meeting-recap-panel" id="recap-key-points">
            <div className="meeting-recap-panel-head">
              <h2 className="meeting-recap-panel-title">Key points</h2>
              <RecapCopyButton
                label="key points"
                copied={copiedSection === 'keypoints'}
                onCopy={() => copyText(keyPointsText, setCopiedSection, 'keypoints', () => showToast('Key points copied.'))}
              />
            </div>
            <ul className="meeting-recap-key-list">
              {summary.keyPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        {summary.actionItems?.length > 0 && (
          <section className="meeting-recap-panel" id="recap-actions">
            <div className="meeting-recap-panel-head">
              <h2 className="meeting-recap-panel-title">Action items</h2>
              <RecapCopyButton
                label="action items"
                copied={copiedSection === 'actions'}
                onCopy={() => copyText(actionItemsText, setCopiedSection, 'actions', () => showToast('Action items copied.'))}
              />
            </div>
            <ul className="meeting-recap-action-list">
              {summary.actionItems.map((item, i) => (
                <li key={i}>
                  <span className="meeting-recap-action-dot" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {showSharedFilesSection && (
          <section className="meeting-recap-panel meeting-recap-panel--shared-files" id="meeting-shared-files">
            <div className="meeting-recap-panel-head">
              <h2 className="meeting-recap-panel-title">Shared files</h2>
            </div>
            <p className="meeting-recap-shared-files-lead">
              Files attached in the meeting chat (same room). Direct-message attachments only appear if you were part of
              that thread.
            </p>
            {sharedDocsLoading && <p className="meeting-recap-muted">Loading attachments…</p>}
            {sharedDocsError && <p className="auth-error meeting-recap-inline-error">{sharedDocsError}</p>}
            {sharedDocs.length > 0 && (
              <ul className="meeting-recap-shared-files-list">
                {sharedDocs.map((f) => (
                  <li key={f.id}>
                    <a
                      className="meeting-recap-shared-file-card"
                      href={`data:${f.mimeType};base64,${f.data}`}
                      download={f.fileName}
                    >
                      <span className="meeting-recap-shared-file-icon" aria-hidden>
                        <Paperclip size={18} strokeWidth={2.25} />
                      </span>
                      <span className="meeting-recap-shared-file-main">
                        <span className="meeting-recap-shared-file-name">{f.fileName}</span>
                        <span className="meeting-recap-shared-file-meta">
                          {f.senderName}
                          {formatSharedFileTime(f.createdAt) ? ` · ${formatSharedFileTime(f.createdAt)}` : ''}
                        </span>
                      </span>
                      <span className="meeting-recap-shared-file-action" aria-hidden>
                        <Download size={18} strokeWidth={2.25} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {hasTranscriptSection && (
          <section className="meeting-recap-panel meeting-recap-panel--transcript" id="meeting-transcript">
            <div className="meeting-recap-panel-head">
              <h2 className="meeting-recap-panel-title">Full transcript</h2>
              <RecapCopyButton
                label="transcript"
                copied={copiedSection === 'transcript'}
                onCopy={() => copyText(transcriptCopyText, setCopiedSection, 'transcript', () => showToast('Transcript copied.'))}
                disabled={!transcriptCopyText.trim()}
              />
            </div>
            <p className="meeting-recap-transcript-lead">
              Each block is one capture from the live transcript. Speaker labels use the video connection id when more
              than one person spoke.
            </p>
            <div className="meeting-recap-transcript-body">
              <ul className="meeting-recap-transcript-segments">
                {transcriptSegments.map((seg, i) => {
                  const timeShown = formatSummarySegmentTime(seg.timestamp)
                  const speakerLabel = labelForSummarySegment(seg, transcriptUniqueUids, summary.participants)
                  return (
                    <li key={i} className="meeting-recap-transcript-segment">
                      <div className="meeting-recap-transcript-segment-head">
                        {timeShown ? (
                          <time className="meeting-recap-transcript-time" dateTime={seg.timestamp || undefined}>
                            {timeShown}
                          </time>
                        ) : null}
                        <span className="meeting-recap-transcript-speaker">
                          <span className="meeting-recap-transcript-dash" aria-hidden>
                            -
                          </span>
                          [{speakerLabel}]
                        </span>
                      </div>
                      <p className="meeting-recap-transcript-segment-text">{seg.text}</p>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>
        )}

        <section className="meeting-recap-panel meeting-recap-panel--ai" id="recap-ask-ai">
          <div className="meeting-recap-panel-head meeting-recap-panel-head--ai">
            <h2 className="meeting-recap-panel-title">
              <Sparkles size={20} strokeWidth={2} className="meeting-recap-ai-icon" aria-hidden />
              Ask about this meeting
            </h2>
          </div>
          <p className="meeting-recap-ai-lead">
            Questions use the same AI search as during the call (when your backend and vector index are configured). Answers are
            best-effort from meeting context.
          </p>
          <div className="meeting-recap-ai-thread" role="log" aria-live="polite" aria-relevant="additions">
            {aiMessages.length === 0 && (
              <p className="meeting-recap-ai-empty">Try: “What decisions were made?” or “Who mentioned the deadline?”</p>
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
              placeholder="Ask a question about this meeting…"
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
