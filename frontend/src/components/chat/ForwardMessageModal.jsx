/**
 * Modal to select a conversation to forward a message to.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SearchIcon, XIcon } from '../ui/Icons'
import './ForwardMessageModal.css'

export function ForwardMessageModal({
  message,
  conversations,
  orgNames,
  userProfiles,
  currentOrgId,
  currentChatId,
  user,
  blockedUserIds = [],
  getConvTitle,
  getConvAvatar,
  onForward,
  onClose,
}) {
  const [search, setSearch] = useState('')

  const filtered = conversations
    .filter((c) => !c.deletedBy?.[user?.uid])
    .filter((c) => c.orgId !== currentOrgId || c.id !== currentChatId)
    .filter((c) => {
      if (c.type !== 'dm') return true
      const other = c.members?.find((id) => id !== user?.uid)
      return !other || !blockedUserIds.includes(other)
    })
    .filter((c) => {
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      const title = getConvTitle(c).toLowerCase()
      const org = (orgNames[c.orgId] || '').toLowerCase()
      return title.includes(q) || org.includes(q)
    })

  const handleSelect = (conv) => {
    onForward?.(conv)
    onClose?.()
  }

  const text = message?.text || (message?.attachment?.type === 'image' ? '[Image]' : message?.attachment?.type === 'document' ? `[Document: ${message?.attachment?.fileName || 'File'}]` : '[Message]')

  return createPortal(
    <div className="forward-modal-dim" onClick={onClose} aria-hidden>
      <div className="forward-modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Forward message">
        <div className="forward-modal-head">
          <h3 className="forward-modal-title">Forward to</h3>
          <button type="button" className="forward-modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
        <p className="forward-modal-preview" title={text}>
          {text.length > 60 ? `${text.slice(0, 60)}…` : text}
        </p>
        <div className="forward-modal-search">
          <SearchIcon size={18} className="forward-modal-search-icon" />
          <input
            type="text"
            placeholder="Search chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="forward-modal-search-input"
            autoFocus
          />
        </div>
        <div className="forward-modal-list">
          {filtered.length === 0 ? (
            <p className="forward-modal-empty">No chats found</p>
          ) : (
            filtered.map((c) => (
              <button
                key={`${c.orgId}-${c.id}`}
                type="button"
                className="forward-modal-item"
                onClick={() => handleSelect(c)}
              >
                <div className="forward-modal-item-avatar">{getConvAvatar(c)}</div>
                <div className="forward-modal-item-content">
                  <span className="forward-modal-item-title">{getConvTitle(c)}</span>
                  {orgNames[c.orgId] && (
                    <span className="forward-modal-item-org">{orgNames[c.orgId]}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
