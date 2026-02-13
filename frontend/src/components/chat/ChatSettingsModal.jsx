/**
 * Chat settings / Contact view modal — email, video call, search, export, block, report, etc.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveMemberships } from '../../lib/orgService'
import { getOrg } from '../../lib/orgService'
import { getOrgTeams, getTeamMembership, TEAM_STATES } from '../../lib/teamService'
import { getUserDoc, getDisplayName, getProfilePictureUrl } from '../../lib/userService'
import { blockUser, unblockUser, isBlocked } from '../../lib/blockService'
import { createReport } from '../../lib/reportService'
import { VideoIcon, SearchIcon, StarIcon, BellIcon, LockIcon, BuildingIcon, UsersIcon, ShareIcon, DownloadIcon, BanIcon, FlagIcon, XIcon, UserIcon } from '../ui/Icons'
import './ChatSettingsModal.css'

export function ChatSettingsModal({
  orgId,
  chatId,
  userId,
  otherUserId,
  otherUserDoc,
  otherDisplayName,
  orgName,
  onClose,
  onStartVideoCall,
  onSearchInChat,
  onExportChat,
  onShareProfile,
  onViewFullProfile,
  starredMessages = [],
  onScrollToMessage,
  isLocked = false,
  onLockToggle,
  isMuted = false,
  onMuteToggle,
}) {
  const navigate = useNavigate()
  const [commonOrgs, setCommonOrgs] = useState([])
  const [commonTeams, setCommonTeams] = useState([])
  const [blocked, setBlocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [showReportForm, setShowReportForm] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [reportSending, setReportSending] = useState(false)
  const [blockLoading, setBlockLoading] = useState(false)
  const email = (otherUserDoc?.email || '').trim()

  useEffect(() => {
    if (!userId || !otherUserId) return
    const load = async () => {
      const [myMems, otherMems, b] = await Promise.all([
        getActiveMemberships(userId),
        getActiveMemberships(otherUserId),
        isBlocked(userId, otherUserId),
      ])
      setBlocked(b)
      const myOrgIds = new Set(myMems.map((m) => m.orgId))
      const common = otherMems.filter((m) => myOrgIds.has(m.orgId))
      const orgs = await Promise.all(common.map((m) => getOrg(m.orgId)))
      setCommonOrgs(orgs.filter(Boolean))

      const teams = []
      for (const o of orgs) {
        if (!o?.id) continue
        const teamList = await getOrgTeams(o.id)
        for (const t of teamList) {
          const [myTm, otherTm] = await Promise.all([
            getTeamMembership(o.id, t.id, userId),
            getTeamMembership(o.id, t.id, otherUserId),
          ])
          if (myTm?.state === TEAM_STATES.active && otherTm?.state === TEAM_STATES.active) {
            teams.push({ ...t, orgId: o.id })
          }
        }
      }
      setCommonTeams(teams)
    }
    load()
  }, [userId, otherUserId])

  const handleBlock = async () => {
    if (!userId || !otherUserId) return
    setBlockLoading(true)
    try {
      if (blocked) {
        await unblockUser(userId, otherUserId)
        setBlocked(false)
      } else {
        await blockUser(userId, otherUserId)
        setBlocked(true)
      }
    } catch (err) {
      console.error('Block error:', err)
    } finally {
      setBlockLoading(false)
    }
  }

  const handleReport = async (e) => {
    e?.preventDefault()
    if (!orgId || !userId || !otherUserId) return
    setReportSending(true)
    try {
      await createReport(orgId, userId, otherUserId, otherDisplayName, reportReason)
      setShowReportForm(false)
      setReportReason('')
    } catch (err) {
      console.error('Report error:', err)
    } finally {
      setReportSending(false)
    }
  }

  const handleVideoCall = () => {
    const channel = `dm-${[userId, otherUserId].sort().join('-')}`
    onStartVideoCall?.(channel)
    onClose?.()
  }

  const handleExport = (withMedia) => {
    onExportChat?.(withMedia)
    onClose?.()
  }

  return (
    <div className="chat-settings-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="chat-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-settings-header">
          <h3>{otherDisplayName || 'Contact'}</h3>
          <button type="button" className="chat-settings-close" onClick={onClose} aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
        <div className="chat-settings-body">
          <div className="chat-settings-profile">
            <div className="chat-settings-avatar">
              {otherUserDoc && getProfilePictureUrl(otherUserDoc) ? (
                <img src={getProfilePictureUrl(otherUserDoc)} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{otherDisplayName?.[0]?.toUpperCase() || '?'}</span>
              )}
            </div>
            <h4 className="chat-settings-name">{otherDisplayName || 'Unknown'}</h4>
            {email && <p className="chat-settings-email">{email}</p>}
          </div>

          <div className="chat-settings-actions-row">
            <button type="button" className="chat-settings-action-btn" onClick={handleVideoCall}>
              <VideoIcon size={20} />
              Video
            </button>
            <button
              type="button"
              className="chat-settings-action-btn"
              onClick={() => { onSearchInChat?.(); onClose?.() }}
            >
              <SearchIcon size={20} />
              Search
            </button>
          </div>

          <div className="chat-settings-section">
            <button
              type="button"
              className="chat-settings-row"
              onClick={() => {
                const first = starredMessages[0]
                if (first?.messageId && onScrollToMessage) {
                  onScrollToMessage(first.messageId)
                  onClose?.()
                }
              }}
              disabled={starredMessages.length === 0}
            >
              <StarIcon size={18} />
              <span>Starred messages</span>
              <span className="chat-settings-row-hint">
                {starredMessages.length === 0 ? 'None' : `${starredMessages.length}`}
              </span>
            </button>
            {starredMessages.length > 0 && (
              <div className="chat-settings-starred-list">
                {starredMessages.slice(0, 5).map((s) => (
                  <button
                    key={s.messageId}
                    type="button"
                    className="chat-settings-starred-item"
                    onClick={() => {
                      onScrollToMessage?.(s.messageId)
                      onClose?.()
                    }}
                  >
                    {s.textSnippet || '[Message]'}
                  </button>
                ))}
                {starredMessages.length > 5 && (
                  <span className="chat-settings-starred-more">
                    +{starredMessages.length - 5} more
                  </span>
                )}
              </div>
            )}
            <button
              type="button"
              className="chat-settings-row"
              onClick={() => onMuteToggle?.(!isMuted)}
            >
              <BellIcon size={18} />
              <span>Notifications</span>
              <span className="chat-settings-row-hint">{isMuted ? 'Muted' : 'On'}</span>
            </button>
            <div className="chat-settings-row chat-settings-row-with-toggle">
              <LockIcon size={18} />
              <div className="chat-settings-row-text">
                <span>Lock chat</span>
                <span className="chat-settings-row-sub">Lock and hide this chat on this device.</span>
              </div>
              <button
                type="button"
                className={`chat-settings-toggle ${isLocked ? 'on' : ''}`}
                onClick={() => onLockToggle?.(!isLocked)}
                aria-label={isLocked ? 'Unlock chat' : 'Lock chat'}
              />
            </div>
          </div>

          {(commonOrgs.length > 0 || commonTeams.length > 0) && (
            <div className="chat-settings-section">
              <h5 className="chat-settings-section-title">
                {commonOrgs.length} org{commonOrgs.length !== 1 ? 's' : ''} in common
                {commonTeams.length > 0 && ` · ${commonTeams.length} team${commonTeams.length !== 1 ? 's' : ''}`}
              </h5>
              {commonOrgs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="chat-settings-row chat-settings-row-link"
                  onClick={() => { navigate(`/app/org/${o.id}`); onClose?.() }}
                >
                  <BuildingIcon size={18} />
                  <span>{o.name}</span>
                </button>
              ))}
              {commonTeams.map((t) => (
                <button
                  key={`${t.orgId}-${t.id}`}
                  type="button"
                  className="chat-settings-row chat-settings-row-link"
                  onClick={() => { navigate(`/app/org/${t.orgId}/teams/${t.id}`); onClose?.() }}
                >
                  <UsersIcon size={18} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="chat-settings-section chat-settings-actions-green">
            <button type="button" className="chat-settings-link" onClick={() => { onViewFullProfile?.(); onClose?.() }}>
              <UserIcon size={18} />
              View full profile
            </button>
            <button type="button" className="chat-settings-link" onClick={() => { onShareProfile?.(); onClose?.() }}>
              <ShareIcon size={18} />
              Share profile
            </button>
            <button
              type="button"
              className="chat-settings-link"
              onClick={() => setShowExportOptions((e) => !e)}
            >
              <DownloadIcon size={18} />
              Export chat
            </button>
            {showExportOptions && (
              <div className="chat-settings-export-options">
                <button type="button" onClick={() => { handleExport(false); setShowExportOptions(false) }}>Without media</button>
                <button type="button" onClick={() => { handleExport(true); setShowExportOptions(false) }}>With media</button>
              </div>
            )}
          </div>

          <div className="chat-settings-section chat-settings-actions-red">
            <button
              type="button"
              className="chat-settings-link chat-settings-link-danger"
              onClick={handleBlock}
              disabled={blockLoading}
            >
              <BanIcon size={18} />
              {blocked ? 'Unblock' : 'Block'}
            </button>
            {!showReportForm ? (
              <button
                type="button"
                className="chat-settings-link chat-settings-link-danger"
                onClick={() => setShowReportForm(true)}
              >
                <FlagIcon size={18} />
                Report
              </button>
            ) : (
              <form onSubmit={handleReport} className="chat-settings-report-form">
                <input
                  type="text"
                  placeholder="Reason for report (optional)"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="auth-input"
                />
                <div className="chat-settings-report-actions">
                  <button type="button" onClick={() => setShowReportForm(false)}>Cancel</button>
                  <button type="submit" disabled={reportSending}>{reportSending ? 'Sending…' : 'Submit report'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
