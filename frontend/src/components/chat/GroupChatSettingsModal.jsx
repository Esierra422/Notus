/**
 * Group/Team chat settings modal — search, starred, notifications, export, members.
 */
import { useState, useEffect } from 'react'
import { getUserDoc, getDisplayName, getProfilePictureUrl } from '../../lib/userService'
import { SearchIcon, StarIcon, BellIcon, LockIcon, UsersIcon, DownloadIcon, XIcon } from '../ui/Icons'
import './ChatSettingsModal.css'

export function GroupChatSettingsModal({
  orgId,
  chatId,
  conv,
  orgName,
  userProfiles,
  onClose,
  onSearchInChat,
  onExportChat,
  starredMessages = [],
  onScrollToMessage,
  isLocked = false,
  onLockToggle,
  isMuted = false,
  onMuteToggle,
}) {
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [memberProfiles, setMemberProfiles] = useState({})
  const members = conv?.members || []

  useEffect(() => {
    const load = async () => {
      const loaded = {}
      for (const uid of members) {
        try {
          loaded[uid] = await getUserDoc(uid)
        } catch {
          loaded[uid] = userProfiles?.[uid] ?? null
        }
      }
      setMemberProfiles((prev) => ({ ...prev, ...loaded }))
    }
    load()
  }, [members.join(','), userProfiles])

  const handleExport = (withMedia) => {
    onExportChat?.(withMedia)
    onClose?.()
  }

  const title = conv?.name || (conv?.type === 'team' ? 'Team chat' : 'Group chat')

  return (
    <div className="chat-settings-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="chat-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-settings-header">
          <h3>{title}</h3>
          <button type="button" className="chat-settings-close" onClick={onClose} aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
        <div className="chat-settings-body">
          <div className="chat-settings-profile">
            <div className="chat-settings-avatar chat-settings-avatar-group">
              <UsersIcon size={32} />
            </div>
            <h4 className="chat-settings-name">{title}</h4>
            {orgName && <p className="chat-settings-email">{orgName}</p>}
          </div>

          <div className="chat-settings-actions-row">
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

          <div className="chat-settings-section">
            <h5 className="chat-settings-section-title">{members.length} members</h5>
            <div className="chat-settings-members-list">
              {members.map((uid) => {
                const p = memberProfiles[uid] ?? userProfiles?.[uid]
                const name = getDisplayName(p, uid)
                const avatarUrl = getProfilePictureUrl(p)
                return (
                  <div key={uid} className="chat-settings-member-row">
                    <div className="chat-settings-member-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span>{name?.[0]?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <span className="chat-settings-member-name">{name || 'Unknown'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="chat-settings-section chat-settings-actions-green">
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
        </div>
      </div>
    </div>
  )
}
