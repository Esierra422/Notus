/**
 * Context menu for a message — Reactions on top, then Reply, Forward, Copy, Info, Star, Delete
 */
import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ReplyIcon, ForwardIcon, ClipboardIcon, InfoIcon, StarIcon, TrashIcon } from '../ui/Icons'
import './MessageContextMenu.css'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏']
const MORE_REACTIONS = ['🔥', '😊', '😭', '👀', '🎉', '💯', '❤️‍🔥', '🤔']

function getCopyText(msg) {
  if (msg?.text) return msg.text
  if (msg?.attachment?.type === 'image') return '[Image]'
  if (msg?.attachment?.type === 'document') return `[Document: ${msg?.attachment?.fileName || 'File'}]`
  if (msg?.attachment?.type === 'poll') return `[Poll: ${msg?.attachment?.question || ''}]`
  return '[Message]'
}

export function MessageContextMenu({
  message,
  isStarred,
  isOwn,
  onReply,
  onForward,
  onCopy,
  onInfo,
  onStar,
  onDelete,
  onReactionSelect,
  onClose,
}) {
  const [showMoreReactions, setShowMoreReactions] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const text = getCopyText(message)

  const performClose = useCallback(() => {
    if (isExiting) return
    setIsExiting(true)
    setTimeout(() => onClose?.(), 200)
  }, [isExiting, onClose])

  const handleDimClick = useCallback(() => {
    performClose()
  }, [performClose])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') performClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [performClose])

  const handleCopy = () => {
    navigator.clipboard?.writeText(text)
    onCopy?.()
    onClose?.()
  }

  const handleReaction = (emoji) => {
    onReactionSelect?.(emoji)
    onClose?.()
  }

  const handleMenuAction = (fn) => {
    fn?.()
    onClose?.()
  }

  const allEmojis = showMoreReactions ? [...QUICK_REACTIONS, ...MORE_REACTIONS] : QUICK_REACTIONS

  return (
    <>
      {createPortal(
        <div
          className={`message-context-dim ${isExiting ? 'message-context-dim--exiting' : ''}`}
          onClick={handleDimClick}
          aria-hidden
        />,
        document.body
      )}
      {createPortal(
        <div
          className={`message-context-panel ${isExiting ? 'message-context-panel--exiting' : ''}`}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
        {/* Reaction emojis on top */}
        <div className="message-context-reactions message-context-reactions-enter">
          <div className="message-context-reactions-row">
            {allEmojis.map((emoji, i) => (
              <button
                key={emoji}
                type="button"
                className="message-context-emoji-btn"
                onClick={() => handleReaction(emoji)}
                style={{ animationDelay: `${i * 25}ms` }}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className="message-context-plus-btn"
              onClick={(e) => { e.stopPropagation(); setShowMoreReactions((v) => !v) }}
              title="More reactions"
              aria-label="More reactions"
            >
              +
            </button>
          </div>
        </div>
        {/* Context menu below */}
        <div className="message-context-menu message-context-menu-enter">
          <button type="button" className="message-context-item" onClick={() => handleMenuAction(onReply)} style={{ animationDelay: '50ms' }}>
            <span>Reply</span>
            <ReplyIcon size={18} />
          </button>
          <button type="button" className="message-context-item" onClick={() => handleMenuAction(onForward)} style={{ animationDelay: '75ms' }}>
            <span>Forward</span>
            <ForwardIcon size={18} />
          </button>
          <button type="button" className="message-context-item" onClick={handleCopy} style={{ animationDelay: '100ms' }}>
            <span>Copy</span>
            <ClipboardIcon size={18} />
          </button>
          <button type="button" className="message-context-item" onClick={() => handleMenuAction(onInfo)} style={{ animationDelay: '125ms' }}>
            <span>Info</span>
            <InfoIcon size={18} />
          </button>
          <button type="button" className="message-context-item" onClick={() => handleMenuAction(onStar)} style={{ animationDelay: '150ms' }}>
            <span>Star</span>
            <StarIcon size={18} className={isStarred ? 'starred' : ''} />
          </button>
          {isOwn && (
            <button
              type="button"
              className="message-context-item message-context-item-danger"
              onClick={() => handleMenuAction(onDelete)}
              style={{ animationDelay: '175ms' }}
            >
              <span>Delete</span>
              <TrashIcon size={18} />
            </button>
          )}
        </div>
      </div>,
        document.body
      )}
    </>
  )
}
