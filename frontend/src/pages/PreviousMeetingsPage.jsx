import { useState, useEffect, useMemo, useCallback } from 'react'
import { useOutletContext, Link, useParams } from 'react-router-dom'
import { getUserSummaries } from '../lib/meetingSummaryService'
import {
  getMeetingsForUserInOrg,
  getMeetingsForUser,
  getMeetingTranscriptSessionId,
} from '../lib/meetingService'
import { getMeetingTranscriptBySessionId } from '../lib/meetingSummaryService'
import { getActiveMemberships, getOrg } from '../lib/orgService'
import { FileTextIcon } from '../components/ui/Icons'
import { Button } from '../components/ui/Button'
import {
  downloadMeetingSummaryPdf,
  downloadMeetingSummaryDocx,
  downloadTranscriptPdf,
  downloadTranscriptDocx,
} from '../lib/exportMeetingDoc'
import '../styles/variables.css'
import './AppLayout.css'
import './PreviousMeetingsPage.css'

function truncateText(text, max) {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max).trim()}…`
}

function formatRowTime(ts) {
  const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : 0)
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function rowStartMs(row) {
  return row.startAt?.toMillis?.() ?? (row.startAt?.seconds ? row.startAt.seconds * 1000 : 0)
}

function groupRowsByDate(rows) {
  const groups = {}
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  for (const row of rows) {
    const ms = rowStartMs(row)
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
  const { orgId: routeOrgId } = useParams()
  const dataOrgId = routeOrgId || activeOrgId || null

  const videoBase = routeOrgId ? `/app/org/${routeOrgId}/video` : '/app/video'

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [datePreset, setDatePreset] = useState('all')
  const [recordFilter, setRecordFilter] = useState('all')
  const [orgPick, setOrgPick] = useState('all')
  const [orgNameById, setOrgNameById] = useState({})
  const [exportBusy, setExportBusy] = useState(null)

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    ;(async () => {
      const mems = await getActiveMemberships(user.uid)
      const entries = await Promise.all(
        mems.map(async (m) => [m.orgId, (await getOrg(m.orgId))?.name || m.orgId])
      )
      if (!cancelled) setOrgNameById(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    setLoading(true)
    setLoadError('')

    ;(async () => {
      try {
        const [summaries, meetings] = await Promise.all([
          getUserSummaries(user.uid),
          routeOrgId || dataOrgId
            ? getMeetingsForUserInOrg(user.uid, routeOrgId || dataOrgId, 400)
            : getMeetingsForUser(user.uid, 400),
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
          const orgId = m.orgId || m._orgId || routeOrgId || dataOrgId || ''
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
            orgId: s.orgId || null,
          })
        }

        built.sort((a, b) => rowStartMs(b) - rowStartMs(a))
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
  }, [user?.uid, dataOrgId, routeOrgId])

  const orgOptions = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const id = r.orgId || r.summary?.orgId
      if (!id) continue
      const name = r.orgName || orgNameById[id] || id
      m.set(id, name)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows, orgNameById])

  const filteredRows = useMemo(() => {
    let out = rows
    const q = search.trim().toLowerCase()
    if (q) {
      out = out.filter((r) => (r.title || '').toLowerCase().includes(q))
    }
    if (datePreset !== 'all') {
      const days = { '7d': 7, '30d': 30, '90d': 90 }[datePreset]
      const cut = Date.now() - days * 86400000
      out = out.filter((r) => rowStartMs(r) >= cut)
    }
    if (recordFilter === 'notes') {
      out = out.filter((r) => !!r.summary)
    } else if (recordFilter === 'no_notes') {
      out = out.filter((r) => r.kind === 'meeting' && !r.summary)
    } else if (recordFilter === 'orphan') {
      out = out.filter((r) => r.kind === 'summary-only')
    } else if (recordFilter === 'transcript') {
      out = out.filter(
        (r) =>
          (r.summary && String(r.summary.transcript || '').trim()) ||
          (r.transcriptSessionId && !r.summary)
      )
    }
    if (!routeOrgId && orgPick !== 'all') {
      out = out.filter((r) => (r.orgId || r.summary?.orgId) === orgPick)
    }
    return out
  }, [rows, search, datePreset, recordFilter, orgPick, routeOrgId])

  const runExport = useCallback(async (key, fn) => {
    setExportBusy(key)
    try {
      await fn()
    } catch (e) {
      console.warn('Export failed:', e)
    } finally {
      setExportBusy(null)
    }
  }, [])

  const copyId = (id) => {
    if (!id || !navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(id).catch(() => {})
  }

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

  return (
    <div className="prev-meetings-page prev-meetings-page--v2">
      <header className="prev-meetings-hero">
        <div className="prev-meetings-hero-text">
          <p className="prev-meetings-kicker">Meetings</p>
          <h1 className="prev-meetings-title">Past meetings & transcripts</h1>
          <p className="prev-meetings-lead">
            AI notes, full transcripts, and calendar-linked calls. Export to PDF or Word from any card that has notes.
          </p>
        </div>
        <Button as={Link} to={videoBase} variant="outline" size="sm" className="prev-meetings-back-video">
          ← Video room
        </Button>
      </header>

      {!routeOrgId && !activeOrgId && (
        <p className="prev-meetings-org-hint">
          Showing meetings from all your organizations. Select an org in the header to match the video room context.
        </p>
      )}

      {rows.length > 0 && (
        <div className="prev-meetings-toolbar">
          <label className="prev-meetings-search-wrap">
            <span className="visually-hidden">Search</span>
            <input
              type="search"
              className="prev-meetings-search"
              placeholder="Search by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="prev-meetings-filters">
            <span className="prev-meetings-filter-label">When</span>
            <select
              className="prev-meetings-select"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              aria-label="Date range"
            >
              <option value="all">Any time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <span className="prev-meetings-filter-label">Type</span>
            <select
              className="prev-meetings-select"
              value={recordFilter}
              onChange={(e) => setRecordFilter(e.target.value)}
              aria-label="Record type"
            >
              <option value="all">All records</option>
              <option value="notes">Has AI notes</option>
              <option value="no_notes">No AI notes yet</option>
              <option value="transcript">Has transcript / saved audio text</option>
              <option value="orphan">Notes only (no calendar row)</option>
            </select>
            {!routeOrgId && orgOptions.length > 1 && (
              <>
                <span className="prev-meetings-filter-label">Org</span>
                <select
                  className="prev-meetings-select"
                  value={orgPick}
                  onChange={(e) => setOrgPick(e.target.value)}
                  aria-label="Organization"
                >
                  <option value="all">All organizations</option>
                  {orgOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="prev-meetings-empty">
          <FileTextIcon size={48} className="prev-meetings-empty-icon" />
          <h2>No meetings yet</h2>
          <p>
            Start a call from the video room; when you’re done, AI notes appear here after the host uses{' '}
            <strong>End for everyone</strong> (with the AI backend connected).
          </p>
          <Button as={Link} to={videoBase} variant="primary" size="sm">
            Open video room
          </Button>
        </div>
      )}

      {rows.length > 0 && filteredRows.length === 0 && (
        <p className="prev-meetings-no-match">No meetings match your filters. Try clearing search or widening the date range.</p>
      )}

      {filteredRows.length > 0 &&
        Object.entries(
          groupRowsByDate(filteredRows)
        )
          .sort((a, b) => Math.max(...b[1].map((x) => x._ms || 0)) - Math.max(...a[1].map((x) => x._ms || 0)))
          .map(([dateLabel, items]) => (
            <div key={dateLabel} className="prev-meetings-group">
              <h2 className="prev-meetings-date-label">{dateLabel}</h2>
              <ul className="prev-meetings-list">
                {items.map((row) => (
                  <li key={row.key} className="prev-meetings-card">
                    <div className="prev-meetings-card-main">
                      <div className="prev-meetings-card-top">
                        <h3 className="prev-meetings-card-title">{row.title}</h3>
                        <time className="prev-meetings-card-time" dateTime={new Date(rowStartMs(row)).toISOString()}>
                          {formatRowTime(row.startAt)}
                        </time>
                      </div>
                      <div className="prev-meetings-card-meta">
                        {(row.orgName || row.orgId || row.summary?.orgId) && (
                          <span className="prev-meetings-pill">
                            {row.orgName || orgNameById[row.orgId || row.summary?.orgId] || 'Organization'}
                          </span>
                        )}
                        {row.summary && <span className="prev-meetings-pill prev-meetings-pill--accent">AI notes</span>}
                        {row.transcriptSessionId && !row.summary && (
                          <span className="prev-meetings-pill">Saved transcript</span>
                        )}
                        {row.kind === 'summary-only' && (
                          <span className="prev-meetings-pill prev-meetings-pill--muted">Notes only</span>
                        )}
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
                      {row.summary?.transcript && String(row.summary.transcript).trim() && (
                        <p className="prev-meetings-transcript-snippet">{truncateText(row.summary.transcript, 220)}</p>
                      )}
                    </div>
                    <div className="prev-meetings-card-actions">
                      {row.summary ? (
                        <>
                          <div className="prev-meetings-action-links">
                            <Link to={`/app/meeting-summary/${row.summary.id}`} className="prev-meetings-summary-link">
                              Open notes
                            </Link>
                            {row.summary.transcript && String(row.summary.transcript).trim() && (
                              <Link
                                to={`/app/meeting-summary/${row.summary.id}#meeting-transcript`}
                                className="prev-meetings-transcript-link"
                              >
                                Transcript
                              </Link>
                            )}
                          </div>
                          <div className="prev-meetings-export-row">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="prev-meetings-export-btn"
                              disabled={!!exportBusy}
                              onClick={() =>
                                runExport(`${row.key}-pdf`, () => downloadMeetingSummaryPdf(row.summary))
                              }
                            >
                              {exportBusy === `${row.key}-pdf` ? '…' : 'PDF'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="prev-meetings-export-btn"
                              disabled={!!exportBusy}
                              onClick={() =>
                                runExport(`${row.key}-docx`, () => downloadMeetingSummaryDocx(row.summary))
                              }
                            >
                              {exportBusy === `${row.key}-docx` ? '…' : 'Word'}
                            </Button>
                          </div>
                        </>
                      ) : row.transcriptSessionId ? (
                        <>
                          <div className="prev-meetings-action-links">
                            <Link
                              to={`/app/meeting-transcript/${encodeURIComponent(row.transcriptSessionId)}`}
                              className="prev-meetings-transcript-link"
                            >
                              Open transcript
                            </Link>
                            <span className="prev-meetings-no-summary prev-meetings-no-summary--inline">
                              AI notes after host ends the call for everyone.
                            </span>
                          </div>
                          <div className="prev-meetings-export-row">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="prev-meetings-export-btn"
                              disabled={!!exportBusy}
                              onClick={() =>
                                runExport(`${row.key}-tr-pdf`, async () => {
                                  const data = await getMeetingTranscriptBySessionId(row.transcriptSessionId)
                                  const title = row.title || 'Meeting transcript'
                                  await downloadTranscriptPdf(title, data?.text || '', data?.segments)
                                })
                              }
                            >
                              {exportBusy === `${row.key}-tr-pdf` ? '…' : 'Transcript PDF'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="prev-meetings-export-btn"
                              disabled={!!exportBusy}
                              onClick={() =>
                                runExport(`${row.key}-tr-docx`, async () => {
                                  const data = await getMeetingTranscriptBySessionId(row.transcriptSessionId)
                                  const title = row.title || 'Meeting transcript'
                                  await downloadTranscriptDocx(title, data?.text || '', data?.segments)
                                })
                              }
                            >
                              {exportBusy === `${row.key}-tr-docx` ? '…' : 'Transcript Word'}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <span className="prev-meetings-no-summary">No notes or saved transcript for this row yet.</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
    </div>
  )
}
