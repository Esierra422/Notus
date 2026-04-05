import { useState, useEffect } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { getUserSummaries } from '../lib/meetingSummaryService'
import {
  getMeetingsForUserInOrg,
  getMeetingsForUser,
  getMeetingTranscriptSessionId,
} from '../lib/meetingService'
import { FileTextIcon } from '../components/ui/Icons'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './PreviousMeetingsPage.css'

function truncateText(text, max) {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max).trim()}…`
}

function formatRowTime(ts) {
  const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : ts)
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function groupRowsByDate(rows) {
  const groups = {}
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  for (const row of rows) {
    const ms = row.startAt?.toMillis?.() ?? (row.startAt?.seconds ? row.startAt.seconds * 1000 : 0)
    const d = new Date(ms)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    let label
    if (dayStart.getTime() === today.getTime()) label = 'Today'
    else if (dayStart.getTime() === yesterday.getTime()) label = 'Yesterday'
    else label = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    if (!groups[label]) groups[label] = []
    groups[label].push({ ...row, _ms: ms })
  }
  return groups
}

export function PreviousMeetingsPage() {
  const { user, activeOrgId } = useOutletContext() || {}
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    setLoading(true)
    setLoadError('')

    ;(async () => {
      try {
        const [summaries, meetings] = await Promise.all([
          getUserSummaries(user.uid),
          activeOrgId
            ? getMeetingsForUserInOrg(user.uid, activeOrgId, 300)
            : getMeetingsForUser(user.uid, 300),
        ])
        if (cancelled) return

        const videoMeetings = meetings.filter((m) => m.isVideoMeeting !== false)

        const summaryBySession = new Map()
        for (const s of summaries) {
          const sid = (s.transcriptSessionId || '').trim()
          if (sid) summaryBySession.set(sid, s)
        }

        const built = []
        const usedSummaryIds = new Set()

        for (const m of videoMeetings) {
          const orgId = m.orgId || m._orgId || activeOrgId || ''
          const sessionId = getMeetingTranscriptSessionId(m, orgId)
          const summary = sessionId ? summaryBySession.get(sessionId) : null
          if (summary) usedSummaryIds.add(summary.id)
          built.push({
            key: `m-${m.id}-${orgId}`,
            kind: 'meeting',
            meeting: m,
            orgId,
            meetingId: m.id,
            transcriptSessionId: sessionId || null,
            title: m.title || 'Meeting',
            startAt: m.startAt,
            summary,
            orgName: m._orgName,
          })
        }

        for (const s of summaries) {
          if (usedSummaryIds.has(s.id)) continue
          usedSummaryIds.add(s.id)
          built.push({
            key: `s-${s.id}`,
            kind: 'summary-only',
            meeting: null,
            meetingId: null,
            transcriptSessionId: (s.transcriptSessionId || '').trim() || null,
            title: s.title || 'Meeting summary',
            startAt: s.createdAt,
            summary: s,
            orgName: null,
          })
        }

        built.sort((a, b) => {
          const ta = a.startAt?.toMillis?.() ?? (a.startAt?.seconds ? a.startAt.seconds * 1000 : 0)
          const tb = b.startAt?.toMillis?.() ?? (b.startAt?.seconds ? b.startAt.seconds * 1000 : 0)
          return tb - ta
        })

        setRows(built)
      } catch (err) {
        console.error('[PreviousMeetings] Failed to load:', err.code, err.message)
        if (!cancelled) {
          setLoadError(
            err.message ||
              'Could not load meetings. If this persists, deploy Firestore indexes: firebase deploy --only firestore:indexes'
          )
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.uid, activeOrgId])

  if (loading) {
    return (
      <div className="prev-meetings-page">
        <div className="prev-meetings-loading">
          <div className="prev-meetings-spinner" />
          <p>Loading your meetings…</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="prev-meetings-page">
        <div className="prev-meetings-empty">
          <h2>Could not load meetings</h2>
          <p className="prev-meetings-error-text">{loadError}</p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="prev-meetings-page">
        <div className="prev-meetings-empty">
          <FileTextIcon size={48} className="prev-meetings-empty-icon" />
          <h2>No meetings yet</h2>
          <p>
            Video meetings you create or join appear here. AI summaries only show when one was generated (transcript
            long enough, AI backend configured, host ended with “End for everyone”).
          </p>
        </div>
      </div>
    )
  }

  const groups = groupRowsByDate(rows)
  const sortedGroupEntries = Object.entries(groups).sort((a, b) => {
    const maxA = Math.max(...a[1].map((x) => x._ms || 0))
    const maxB = Math.max(...b[1].map((x) => x._ms || 0))
    return maxB - maxA
  })

  const copyId = (id) => {
    if (!id || !navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(id).catch(() => {})
  }

  return (
    <div className="prev-meetings-page">
      {!activeOrgId && (
        <p className="prev-meetings-org-hint">
          Select an organization in the header to focus on one org, or browse meetings from all your organizations
          below.
        </p>
      )}
      {sortedGroupEntries.map(([dateLabel, items]) => (
        <div key={dateLabel} className="prev-meetings-group">
          <h2 className="prev-meetings-date-label">{dateLabel}</h2>
          <div className="prev-meetings-list">
            {items.map((row) => (
              <div key={row.key} className="prev-meetings-row">
                <div className="prev-meetings-row-main">
                  <div className="prev-meetings-row-header">
                    <h3 className="prev-meetings-card-title">{row.title}</h3>
                    <span className="prev-meetings-card-time">{formatRowTime(row.startAt)}</span>
                  </div>
                  {row.kind === 'meeting' && row.meetingId && (
                    <div className="prev-meetings-meeting-id-row">
                      <span className="prev-meetings-meeting-id-label">Meeting ID</span>
                      <code className="prev-meetings-meeting-id-code">{row.meetingId}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="prev-meetings-copy-btn"
                        onClick={() => copyId(row.meetingId)}
                      >
                        Copy
                      </Button>
                    </div>
                  )}
                  {row.orgName && <span className="prev-meetings-org-badge">{row.orgName}</span>}
                  {row.kind === 'summary-only' && (
                    <p className="prev-meetings-summary-only-note">Summary record (no linked calendar meeting).</p>
                  )}
                  {row.summary?.transcript && String(row.summary.transcript).trim() && (
                    <p className="prev-meetings-transcript-snippet">{truncateText(row.summary.transcript, 280)}</p>
                  )}
                </div>
                <div className="prev-meetings-row-actions">
                  {row.summary ? (
                    <div className="prev-meetings-action-links">
                      <Link to={`/app/meeting-summary/${row.summary.id}`} className="prev-meetings-summary-link">
                        View AI summary
                      </Link>
                      {row.summary.transcript && String(row.summary.transcript).trim() && (
                        <Link
                          to={`/app/meeting-summary/${row.summary.id}#meeting-transcript`}
                          className="prev-meetings-transcript-link"
                        >
                          Full transcript
                        </Link>
                      )}
                    </div>
                  ) : row.transcriptSessionId ? (
                    <div className="prev-meetings-action-links">
                      <Link
                        to={`/app/meeting-transcript/${encodeURIComponent(row.transcriptSessionId)}`}
                        className="prev-meetings-transcript-link"
                      >
                        View saved transcript
                      </Link>
                      <span className="prev-meetings-no-summary prev-meetings-no-summary--inline">
                        AI summary appears after the host uses “End for everyone” when notes generate successfully.
                      </span>
                    </div>
                  ) : (
                    <span className="prev-meetings-no-summary">
                      No AI summary yet — needs enough transcript and “End for everyone” with the AI backend connected.
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
