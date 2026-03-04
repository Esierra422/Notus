import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, Link, useOutletContext } from 'react-router-dom'
import { getOrg, getMembership, getActiveMemberships } from '../lib/orgService'
import { getBlockedUserIds } from '../lib/blockService'
import {
  getOrCreateDM,
  createGroupChat,
  getOrCreateTeamChat,
  subscribeConversations,
  subscribeConversationsMultiOrg,
  subscribeMessages,
  getMessages,
  sendMessage as sendMessageApi,
  votePoll,
  endPoll,
  getOrgMembersForChat,
  getConversation,
  setTyping,
  subscribeTyping,
  clearTyping,
  markConversationRead,
  markMessagesRead,
  deleteConversationForUser,
  archiveConversation,
  muteConversation,
  markConversationUnread,
  clearConversation,
  addReaction,
  deleteMessage,
  CONV_TYPES,
  MESSAGE_STATUS,
} from '../lib/conversationService'
import { createMeeting, MEETING_SCOPES } from '../lib/meetingService'
import { Timestamp } from 'firebase/firestore'
import { getOrgTeams, getTeamMembership, TEAM_STATES } from '../lib/teamService'
import { getUserDoc, getDisplayName, getProfilePictureUrl } from '../lib/userService'
import { getTimeZone, getLocale } from '../lib/dateUtils'
import { playSendSound } from '../lib/soundUtils'
import { Button } from '../components/ui/Button'
import {
  ImageIcon,
  CameraIcon,
  FileTextIcon,
  BarChartIcon,
  CalendarIcon,
  PlusIcon,
  MoreVerticalIcon,
  UsersIcon,
  StarIcon,
  SettingsIcon,
  LockIcon,
  BellOffIcon,
  ChevronDownIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from '../components/ui/Icons'
import { starMessage, unstarMessage, subscribeStarredForConversation } from '../lib/starService'
import { addToFavorites, removeFromFavorites, subscribeFavorites } from '../lib/favoritesService'
import {
  getLockedChatIds,
  setChatLocked,
  isChatLocked,
  hasPin,
  setPin,
  verifyPin,
} from '../lib/lockService'
import { MemberProfileModal } from '../components/member/MemberProfileModal'
import { ChatSettingsModal } from '../components/chat/ChatSettingsModal'
import { GroupChatSettingsModal } from '../components/chat/GroupChatSettingsModal'
import { LockChatModal } from '../components/chat/LockChatModal'
import { MessageContextMenu } from '../components/chat/MessageContextMenu'
import { ForwardMessageModal } from '../components/chat/ForwardMessageModal'
import { ShareProfileModal } from '../components/chat/ShareProfileModal'
import '../styles/variables.css'
import './AppLayout.css'
import './ChatsPage.css'

function formatTime(ts, userDoc) {
  if (!ts) return ''
  const ms = ts?.toMillis?.() ?? (typeof ts === 'number' ? ts : null)
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const locale = getLocale(userDoc)
  const tz = getTimeZone(userDoc)
  const opts = { locale, ...(tz && { timeZone: tz }) }
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(tz && { timeZone: tz }) })
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(tz && { timeZone: tz }) })
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric', ...(tz && { timeZone: tz }) })
}

function getMessageDateLabel(ms, userDoc) {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const locale = getLocale(userDoc)
  const tz = getTimeZone(userDoc)
  const opts = { locale, ...(tz && { timeZone: tz }) }
  const todayStr = now.toLocaleDateString(locale, opts)
  const msgDayStr = d.toLocaleDateString(locale, opts)
  if (msgDayStr === todayStr) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (msgDayStr === yesterday.toLocaleDateString(locale, opts)) return 'Yesterday'
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(tz && { timeZone: tz }) })
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric', ...(tz && { timeZone: tz }) })
}

function MessageStatus({ status }) {
  if (!status || status === MESSAGE_STATUS.sent) return <span>Sent</span>
  if (status === MESSAGE_STATUS.delivered) return <span>Delivered</span>
  return <span className="chats-status-read">Read</span>
}

const ATTACHMENT_OPTIONS = [
  { id: 'photos', label: 'Photos', Icon: ImageIcon, color: '#7dd3fc' },
  { id: 'camera', label: 'Camera', Icon: CameraIcon, color: '#fff' },
  { id: 'document', label: 'Document', Icon: FileTextIcon, color: '#7dd3fc' },
  { id: 'poll', label: 'Poll', Icon: BarChartIcon, color: '#fbbf24' },
  { id: 'event', label: 'Event', Icon: CalendarIcon, color: '#f87171' },
  { id: 'users', label: 'Profiles / Users', Icon: UsersIcon, color: '#a78bfa' },
]

function ChatAttachmentMenu({ onClose, onSelect, isClosing }) {
  return (
    <div className={`chats-attach-popover ${isClosing ? 'chats-attach-popover-closing' : ''}`} role="menu">
      <div className="chats-attach-grid">
        {ATTACHMENT_OPTIONS.map(({ id, label, Icon, color }) => (
          <button
            key={id}
            type="button"
            className="chats-attach-option"
            onClick={() => { onSelect?.(id); onClose?.() }}
            role="menuitem"
          >
            <span className="chats-attach-icon-wrap" style={{ color }}>
              <Icon size={24} />
            </span>
            <span className="chats-attach-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PollBubble({ message, isOwn, userId, onVote, onEndPoll }) {
  const poll = message.attachment
  if (!poll || poll.type !== 'poll') return null
  const options = poll.options || []
  const ended = !!poll.ended
  const totalVotes = options.reduce((sum, o) => sum + (o.votes?.length || 0), 0)
  const myVoteIndex = options.findIndex((o) => (o.votes || []).includes(userId))
  const isSender = message.senderId === userId

  return (
    <div className="chats-poll-bubble">
      <div className="chats-poll-header">
        <BarChartIcon size={18} className="chats-poll-icon" />
        <span className="chats-poll-question">{poll.question}</span>
      </div>
      <div className="chats-poll-options">
        {options.map((opt, i) => {
          const votes = opt.votes?.length || 0
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
          const voted = myVoteIndex === i
          const clickable = !ended
          return (
            <button
              key={i}
              type="button"
              className={`chats-poll-option ${voted ? 'chats-poll-option-voted' : ''} ${ended ? 'chats-poll-option-ended' : ''}`}
              onClick={() => !ended && onVote?.(i)}
              disabled={!clickable}
            >
              <span className="chats-poll-option-text">{opt.text || 'Option'}</span>
              {ended && (
                <span className="chats-poll-option-bar" style={{ width: `${pct}%` }} />
              )}
              {ended && (
                <span className="chats-poll-option-count">
                  {votes} {votes === 1 ? 'vote' : 'votes'}
                </span>
              )}
              {voted && !ended && <span className="chats-poll-check">✓</span>}
            </button>
          )
        })}
      </div>
      {ended && totalVotes > 0 && (
        <p className="chats-poll-total">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} total</p>
      )}
      {isSender && !ended && (
        <button
          type="button"
          className="chats-poll-end-btn"
          onClick={onEndPoll}
        >
          End poll
        </button>
      )}
    </div>
  )
}

function ChatListItem({
  conv,
  title,
  avatar,
  orgName,
  isActive,
  lastPreview,
  lastTime,
  unreadCount,
  isFavorite,
  isLocked,
  isMuted,
  isArchived,
  onClick,
  userDoc,
  onMenuAction,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const count = unreadCount || 0
  const isDM = conv?.type === CONV_TYPES.dm

  return (
    <li>
      <div className="chats-list-item-wrap" ref={menuRef}>
        <button
          type="button"
          className={`chats-list-item ${isActive ? 'chats-list-item-active' : ''}`}
          onClick={onClick}
        >
          <div className="chats-list-avatar">
            {avatar}
          </div>
          <div className="chats-list-content">
            <div className="chats-list-row">
              <span className="chats-list-title">{title}</span>
              {isFavorite && <StarIcon size={12} className="chats-list-fav-icon" title="Favorite" />}
              {isMuted && <BellOffIcon size={12} className="chats-list-muted-icon" title="Muted" />}
              <span className="chats-list-row-spacer" />
              {count > 0 && <span className="chats-list-unread">{count > 99 ? '99+' : count}</span>}
              {count === 0 && lastTime && <span className="chats-list-date">{formatTime(lastTime, userDoc)}</span>}
              <button
                type="button"
                className="chats-list-menu-btn"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
                aria-label="Chat options"
                title="Options"
              >
                <MoreVerticalIcon size={16} />
              </button>
            </div>
            {orgName && <p className="chats-list-org">{orgName}</p>}
            {lastPreview && <p className="chats-list-preview">{lastPreview}</p>}
          </div>
        </button>
        {menuOpen && (
          <div className="chats-list-menu-panel">
              <button type="button" onClick={() => { onMenuAction?.(count > 0 ? 'markRead' : 'markUnread'); setMenuOpen(false) }}>
                {count > 0 ? 'Mark as read' : 'Mark as unread'}
              </button>
              <button type="button" onClick={() => { onMenuAction?.(isArchived ? 'unarchive' : 'archive'); setMenuOpen(false) }}>
                {isArchived ? 'Unarchive' : 'Archive'}
              </button>
              <button type="button" onClick={() => { onMenuAction?.('mute'); setMenuOpen(false) }}>
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" onClick={() => { onMenuAction?.('lock'); setMenuOpen(false) }}>
                {isLocked ? 'Unlock chat' : 'Lock chat'}
              </button>
              <button type="button" onClick={() => { onMenuAction?.('favorite'); setMenuOpen(false) }}>
                {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>
              {isDM && <button type="button" onClick={() => { onMenuAction?.('block'); setMenuOpen(false) }}>Block</button>}
              <button type="button" onClick={() => { onMenuAction?.('clear'); setMenuOpen(false) }}>Clear chat</button>
              <button type="button" className="chats-list-menu-danger" onClick={() => { onMenuAction?.('delete'); setMenuOpen(false) }}>Delete chat</button>
            </div>
        )}
      </div>
    </li>
  )
}

function NewChatModal({
  orgId,
  userId,
  org,
  onClose,
  onOpenChat,
  userProfiles,
  setUserProfiles,
}) {
  const [step, setStep] = useState('picker') // 'picker' | 'group-select' | 'group-name' | 'team-select'
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState([])
  const [memberProfiles, setMemberProfiles] = useState({}) // Local profiles for immediate display
  const [imgErrors, setImgErrors] = useState({}) // Track failed image loads
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [groupName, setGroupName] = useState('')
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orgId || !userId) return
    setImgErrors({})
    setError('')
    getOrgMembersForChat(orgId, userId)
      .then(async (list) => {
        setMembers(list)
        const ids = list.map((m) => m.userId)
        const loaded = {}
        await Promise.all(ids.map(async (uid) => {
          try {
            loaded[uid] = await getUserDoc(uid)
          } catch {
            loaded[uid] = null
          }
        }))
        setMemberProfiles(loaded)
        setUserProfiles((prev) => ({ ...prev, ...loaded }))
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load members.')
      })
  }, [orgId, userId])

  useEffect(() => {
    if (!orgId || !userId || step !== 'team-select') return
    getOrgTeams(orgId).then(async (teamsList) => {
      setTeams(teamsList)
      const mems = {}
      for (const t of teamsList) {
        const m = await getTeamMembership(orgId, t.id, userId)
        if (m && m.state === TEAM_STATES.active) mems[t.id] = m
      }
      setTeamMemberships(mems)
    })
  }, [orgId, userId, step])

  const filteredMembers = members.filter((m) => {
    const p = memberProfiles[m.userId]
    const name = p ? getDisplayName(p, m.userId).toLowerCase() : ''
    const email = (p?.email || '').toLowerCase()
    const q = search.trim().toLowerCase()
    if (!q) return true
    return name.includes(q) || email.includes(q)
  })

  const getMemberProfile = (uid) => memberProfiles[uid] ?? userProfiles[uid]

  const handleStartDM = async (otherUserId) => {
    if (!userId || !otherUserId) return
    setError('')
    setLoading(true)
    try {
      const conv = await getOrCreateDM(orgId, userId, otherUserId)
      onOpenChat(conv.id)
      onClose()
    } catch (e) {
      const msg = e?.message || 'Failed to start chat.'
      const code = e?.code || e?.cause?.code
      if (code === 'permission-denied') {
        setError('Permission denied. Deploy rules: firebase deploy --only firestore:rules')
      } else if (code === 'failed-precondition') {
        setError('Index missing or building. Run: firebase deploy --only firestore:indexes')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleToggleGroupMember = (uid) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    )
  }

  const handleNewGroupNext = () => {
    if (selectedUserIds.length < 2) {
      setError('Select at least 2 people for a group chat.')
      return
    }
    setStep('group-name')
    setError('')
  }

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    if (!groupName.trim()) return
    setError('')
    setLoading(true)
    try {
      const conv = await createGroupChat(orgId, userId, groupName.trim(), selectedUserIds)
      onOpenChat(conv.id)
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to create group.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTeamChat = async (e) => {
    e.preventDefault()
    if (!selectedTeamId) return
    setError('')
    setLoading(true)
    try {
      const conv = await getOrCreateTeamChat(orgId, userId, selectedTeamId)
      onOpenChat(conv.id)
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to create team chat.')
    } finally {
      setLoading(false)
    }
  }

  const activeTeams = teams.filter((t) => teamMemberships[t.id])

  return (
    <div
      className="chats-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="chats-modal">
        <div className="chats-modal-header">
          <h3 className="chats-modal-title">New chat</h3>
          <button type="button" className="chats-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {step === 'picker' && (
          <>
            <div className="chats-modal-search">
              <input
                type="text"
                placeholder="Search members…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="chats-modal-input"
                autoFocus
              />
            </div>
            <div className="chats-modal-actions">
              {activeTeams.length > 0 && (
                <button
                  type="button"
                  className="chats-modal-action-btn"
                  onClick={() => { setStep('team-select'); setError(''); }}
                >
                  New team chat
                </button>
              )}
              <button
                type="button"
                className="chats-modal-action-btn"
                onClick={() => { setStep('group-select'); setSelectedUserIds([]); setError(''); }}
              >
                New group chat
              </button>
            </div>
            {error && <p className="auth-error" style={{ padding: '0 1.25rem 0.5rem', margin: 0 }}>{error}</p>}
            <ul className="chats-modal-list">
              {filteredMembers.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    className="chats-modal-member"
                    onClick={() => handleStartDM(m.userId)}
                    disabled={loading}
                  >
                    <div className="chats-modal-avatar">
                      {(() => {
                        const p = getMemberProfile(m.userId)
                        const url = !imgErrors[m.userId] && getProfilePictureUrl(p)
                        if (url) {
                          return (
                            <img
                              src={url}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={() => setImgErrors((e) => ({ ...e, [m.userId]: true }))}
                            />
                          )
                        }
                        return <span>{getDisplayName(p, m.userId)[0]?.toUpperCase() || '?'}</span>
                      })()}
                    </div>
                    <div className="chats-modal-member-info">
                      <span className="chats-modal-member-name">{getDisplayName(getMemberProfile(m.userId), m.userId)}</span>
                      {(() => {
                        const p = getMemberProfile(m.userId)
                        const hasName = (p?.firstName || p?.lastName) && `${(p?.firstName || '').trim()} ${(p?.lastName || '').trim()}`.trim()
                        if (hasName && p?.email) return <span className="chats-modal-member-email">{p.email}</span>
                        return null
                      })()}
                    </div>
                  </button>
                </li>
              ))}
              {filteredMembers.length === 0 && <li className="chats-modal-empty">No members found.</li>}
            </ul>
          </>
        )}
        {step === 'group-select' && (
          <>
            <p className="chats-modal-desc">Select members for the group (at least 2)</p>
            <ul className="chats-modal-list">
              {filteredMembers.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    className={`chats-modal-member chats-modal-member-selectable ${selectedUserIds.includes(m.userId) ? 'chats-modal-member-selected' : ''}`}
                    onClick={() => handleToggleGroupMember(m.userId)}
                  >
                    <div className="chats-modal-avatar">
                      {(() => {
                        const p = getMemberProfile(m.userId)
                        const url = !imgErrors[m.userId] && getProfilePictureUrl(p)
                        if (url) {
                          return (
                            <img
                              src={url}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={() => setImgErrors((e) => ({ ...e, [m.userId]: true }))}
                            />
                          )
                        }
                        return <span>{getDisplayName(p, m.userId)[0]?.toUpperCase() || '?'}</span>
                      })()}
                    </div>
                    <div className="chats-modal-member-info">
                      <span className="chats-modal-member-name">{getDisplayName(getMemberProfile(m.userId), m.userId)}</span>
                    </div>
                    {selectedUserIds.includes(m.userId) && <span className="chats-modal-check">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="chats-modal-footer">
              <Button variant="ghost" onClick={() => { setStep('picker'); setError(''); }}>Back</Button>
              <Button variant="primary" onClick={handleNewGroupNext} disabled={selectedUserIds.length < 2}>
                Next ({selectedUserIds.length} selected)
              </Button>
            </div>
          </>
        )}
        {step === 'group-name' && (
          <form onSubmit={handleCreateGroup} className="chats-modal-form">
            <p className="chats-modal-desc">Enter group name</p>
            <input
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="chats-modal-input"
              autoFocus
              required
            />
            {error && <p className="auth-error">{error}</p>}
            <div className="chats-modal-footer">
              <Button type="button" variant="ghost" onClick={() => setStep('group-select')}>Back</Button>
              <Button type="submit" variant="primary" disabled={loading || !groupName.trim()}>
                {loading ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        )}
        {step === 'team-select' && (
          <form onSubmit={handleCreateTeamChat} className="chats-modal-form">
            <p className="chats-modal-desc">Choose a team</p>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="chats-modal-select"
              required
            >
              <option value="">Select team…</option>
              {activeTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {error && <p className="auth-error">{error}</p>}
            <div className="chats-modal-footer">
              <Button type="button" variant="ghost" onClick={() => { setStep('picker'); setError(''); }}>Back</Button>
              <Button type="submit" variant="primary" disabled={loading || !selectedTeamId}>
                {loading ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function PollModal({ onClose, onSubmit, sending }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])

  const addOption = () => {
    if (options.length < 5) setOptions((o) => [...o, ''])
  }
  const removeOption = (i) => {
    if (options.length > 2) setOptions((o) => o.filter((_, j) => j !== i))
  }
  const updateOption = (i, v) => {
    setOptions((o) => { const n = [...o]; n[i] = v; return n })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const q = question.trim()
    const opts = options.map((o) => o.trim()).filter(Boolean)
    if (!q || opts.length < 2) return
    onSubmit({ question: q, options: opts })
    onClose()
  }

  return (
    <div className="chats-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="chats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chats-modal-header">
          <h3 className="chats-modal-title">Create poll</h3>
          <button type="button" className="chats-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="chats-modal-form">
          <label className="chats-modal-label">Question</label>
          <input
            type="text"
            placeholder="Ask a question…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="chats-modal-input"
            required
            autoFocus
          />
          <label className="chats-modal-label">Options</label>
          {options.map((opt, i) => (
            <div key={i} className="chats-modal-option-row">
              <input
                type="text"
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                className="chats-modal-input"
              />
              {options.length > 2 && (
                <button type="button" className="chats-modal-option-remove" onClick={() => removeOption(i)} aria-label="Remove">×</button>
              )}
            </div>
          ))}
          {options.length < 5 && (
            <button type="button" className="chats-modal-add-option" onClick={addOption}>+ Add option</button>
          )}
          <div className="chats-modal-footer">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={sending || !question.trim() || options.filter((o) => o.trim()).length < 2}>
              Send poll
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EventModal({ onClose, onSubmit, sending, userDoc }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    let text = `📅 Event: ${t}`
    if (date) {
      const d = new Date(date)
      const locale = getLocale(userDoc)
      const tz = getTimeZone(userDoc)
      const formatted = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', ...(tz && { timeZone: tz }) })
      text += `\n${formatted}`
      if (time) text += ` at ${time}`
    }
    onSubmit({ text, title: t, date: date || null, time: time || null })
    onClose()
  }

  return (
    <div className="chats-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="chats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chats-modal-header">
          <h3 className="chats-modal-title">Create event</h3>
          <button type="button" className="chats-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="chats-modal-form">
          <label className="chats-modal-label">Event title</label>
          <input
            type="text"
            placeholder="Event title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="chats-modal-input"
            required
            autoFocus
          />
          <label className="chats-modal-label">Date (optional)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="chats-modal-input"
          />
          <label className="chats-modal-label">Time (optional)</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="chats-modal-input"
          />
          <div className="chats-modal-footer">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={sending || !title.trim()}>
              Send event
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ChatsPage() {
  const navigate = useNavigate()
  const { orgId: paramOrgId, chatId } = useParams()
  const { user, userDoc, setNavExtra } = useOutletContext() || {}
  const [orgId, setOrgId] = useState(paramOrgId || null)
  const [orgIds, setOrgIds] = useState([])
  const [orgNames, setOrgNames] = useState({})
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [userProfiles, setUserProfiles] = useState({})
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [attachmentMenuClosing, setAttachmentMenuClosing] = useState(false)
  const attachmentMenuRef = useRef(null)
  const photosInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const documentInputRef = useRef(null)
  const [showPollModal, setShowPollModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [typers, setTypers] = useState([])
  const typingDebounceRef = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const [messageImgErrors, setMessageImgErrors] = useState({})
  const [profileModalUserId, setProfileModalUserId] = useState(null)
  const [chatSettingsUserId, setChatSettingsUserId] = useState(null)
  const [searchInChat, setSearchInChat] = useState('')
  const [showShareProfile, setShowShareProfile] = useState(false)
  const [shareProfileUserId, setShareProfileUserId] = useState(null)
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const [chatListFilter, setChatListFilter] = useState('')
  const [chatListSort, setChatListSort] = useState('recent') // 'recent' | 'name' | 'unread'
  const [showArchived, setShowArchived] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('chats_show_archived') ?? 'false')
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('chats_show_archived', JSON.stringify(showArchived))
    } catch (_) {}
  }, [showArchived])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('chats_show_favorites_only') ?? 'false')
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('chats_show_favorites_only', JSON.stringify(showFavoritesOnly))
    } catch (_) {}
  }, [showFavoritesOnly])
  const [blockedUserIds, setBlockedUserIds] = useState([])
  const [starredMap, setStarredMap] = useState(() => new Map())
  const [favoriteConvIds, setFavoriteConvIds] = useState(() => new Set())
  const [lockedChatIds, setLockedChatIds] = useState(() => new Set())
  const [lockModal, setLockModal] = useState(null) // { mode: 'create'|'unlock', orgId, convId, fromMenu: true }
  const [lockOverlayPin, setLockOverlayPin] = useState('')
  const [lockOverlayError, setLockOverlayError] = useState('')
  const [messageContextMsg, setMessageContextMsg] = useState(null)
  const [reactionRemoveTarget, setReactionRemoveTarget] = useState(null) // { msgId, emoji }
  const [replyTo, setReplyTo] = useState(null)
  const messageInputRef = useRef(null)
  const [filterSortOpen, setFilterSortOpen] = useState(false)
  const filterSortRef = useRef(null)
  const markedUnreadConvsRef = useRef(new Set())
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardMessage, setForwardMessage] = useState(null)

  // Sync orgId from URL (ChatsPage only renders at /app/org/:orgId/chats)
  useEffect(() => {
    if (paramOrgId) setOrgId(paramOrgId)
  }, [paramOrgId])

  useEffect(() => {
    if (user) setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user?.uid) return
    getBlockedUserIds(user.uid).then(setBlockedUserIds)
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    setLockedChatIds(getLockedChatIds(user.uid))
  }, [user?.uid])

  useEffect(() => {
    const handleClick = (e) => {
      if (filterSortRef.current && !filterSortRef.current.contains(e.target)) setFilterSortOpen(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    if (!reactionRemoveTarget) return
    const handler = (e) => {
      const target = e.target
      if (target.closest('.chats-reaction-wrap') || target.closest('.chats-reaction-remove-pill')) return
      setReactionRemoveTarget(null)
    }
    const id = setTimeout(() => document.addEventListener('click', handler), 100)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handler)
    }
  }, [reactionRemoveTarget])

  useEffect(() => {
    if (!user) return
    getActiveMemberships(user.uid).then(async (memberships) => {
      const ids = memberships.filter((m) => m.state === 'active').map((m) => m.orgId)
      setOrgIds(ids)
      const names = {}
      await Promise.all(ids.map(async (oid) => {
        const o = await getOrg(oid)
        if (o) names[oid] = o.name
      }))
      setOrgNames(names)
    })
  }, [user])

  // Ensure a group chat exists for each team the user is in (for teams created before this feature)
  useEffect(() => {
    if (!orgIds?.length || !user?.uid) return
    const ensure = async () => {
      for (const oid of orgIds) {
        try {
          const teams = await getOrgTeams(oid)
          for (const team of teams) {
            const mem = await getTeamMembership(oid, team.id, user.uid)
            if (mem?.state === TEAM_STATES.active) {
              getOrCreateTeamChat(oid, user.uid, team.id).catch(() => {})
            }
          }
        } catch (_) {}
      }
    }
    ensure()
  }, [orgIds.join(','), user?.uid])

  useEffect(() => {
    if (!user || !orgId) return
    const load = async () => {
      const [orgData, memData] = await Promise.all([
        getOrg(orgId),
        getMembership(orgId, user.uid),
      ])
      setOrg(orgData)
      setMembership(memData)
    }
    load()
  }, [user, orgId])

  // Subscribe to conversations from all orgs (unified list)
  useEffect(() => {
    if (!orgIds?.length || !user?.uid) return
    return subscribeConversationsMultiOrg(
      orgIds,
      user.uid,
      (docs) => {
        setConversations(docs)
        setError('')
      },
      (err) => {
        setError(err?.message || 'Failed to load chats.')
      }
    )
  }, [orgIds.join(','), user?.uid])

  // Subscribe to messages when chat selected
  useEffect(() => {
    if (!orgId || !chatId || !user?.uid) {
      setMessages([])
      return
    }
    return subscribeMessages(orgId, chatId, setMessages, (err) => {
      setError(err?.message || 'Failed to load messages.')
    })
  }, [orgId, chatId, user?.uid])

  // Subscribe to typing indicators
  useEffect(() => {
    if (!orgId || !chatId || !user?.uid) return
    return subscribeTyping(orgId, chatId, (ids) => {
      setTypers(ids.filter((id) => id !== user.uid))
    })
  }, [orgId, chatId, user?.uid])

  // Subscribe to starred messages for current conversation
  useEffect(() => {
    if (!orgId || !chatId || !user?.uid) return
    return subscribeStarredForConversation(user.uid, orgId, chatId, setStarredMap)
  }, [orgId, chatId, user?.uid])

  // Subscribe to favorites
  useEffect(() => {
    if (!user?.uid) return
    return subscribeFavorites(user.uid, setFavoriteConvIds)
  }, [user?.uid])

  // Mark conversation and messages as read when user is viewing this chat (unless they chose "Mark as unread")
  useEffect(() => {
    if (!orgId || !chatId || !user?.uid) return
    const key = `${orgId}_${chatId}`
    if (markedUnreadConvsRef.current.has(key)) return
    markConversationRead(orgId, chatId, user.uid).catch(() => {})
    const fromOthers = messages.filter((m) => m.senderId !== user.uid && m.status !== MESSAGE_STATUS.read)
    if (fromOthers.length) {
      markMessagesRead(orgId, chatId, fromOthers.map((m) => m.id)).catch(() => {})
    }
  }, [orgId, chatId, user?.uid, messages])

  // Load profiles for all conversation list members + selected chat + message senders
  const loadProfiles = useCallback(async (convs, selectedConv, msgs, existing) => {
    const ids = new Set()
    if (convs) convs.forEach((c) => c?.members?.forEach((id) => ids.add(id)))
    if (selectedConv?.members) selectedConv.members.forEach((id) => ids.add(id))
    if (msgs) msgs.forEach((m) => ids.add(m.senderId))
    const toLoad = [...ids].filter((id) => id && !existing[id])
    if (toLoad.length === 0) return
    const loaded = await Promise.all(toLoad.map(async (uid) => {
      try {
        return [uid, await getUserDoc(uid)]
      } catch {
        return [uid, null]
      }
    }))
    setUserProfiles((prev) => {
      const next = { ...prev }
      loaded.forEach(([uid, doc]) => { next[uid] = doc })
      return next
    })
  }, [])

  const selectedConv = conversations.find((c) => c.orgId === orgId && c.id === chatId)

  useEffect(() => {
    if (conversations.length || selectedConv || messages.length) {
      loadProfiles(conversations, selectedConv, messages, userProfiles)
    }
  }, [conversations, selectedConv?.id, messages.length, loadProfiles, userProfiles])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const check = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const threshold = 80
      setShowScrollToBottom(scrollHeight - scrollTop - clientHeight > threshold)
    }
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [chatId, messages.length])

  const getConvTitle = (conv) => {
    if (!conv) return '…'
    if (conv.type === CONV_TYPES.dm) {
      const other = conv.members?.find((id) => id !== user?.uid)
      if (!other) return '…'
      return getDisplayName(userProfiles[other], other, user?.uid === other ? user : null)
    }
    return conv.name || 'Group'
  }

  const getConvAvatar = (conv) => {
    if (!conv) return null
    if (conv.type === CONV_TYPES.dm) {
      const other = conv.members?.find((id) => id !== user?.uid)
      if (!other) return <span>?</span>
      const p = userProfiles[other]
      const url = getProfilePictureUrl(p, user?.uid === other ? user : null)
      const name = getDisplayName(p, other, user?.uid === other ? user : null)
      if (url) return <img src={url} alt="" referrerPolicy="no-referrer" />
      return <span>{name[0]?.toUpperCase() || '?'}</span>
    }
    const name = conv.name || 'Group'
    return <span>{name[0]?.toUpperCase()}</span>
  }

  const getMemberCount = (conv) => {
    if (!conv?.members) return 0
    return conv.members.length
  }

  const handleOpenChat = (conv) => {
    const oid = conv?.orgId ?? orgId
    if (!oid || !conv?.id) return
    navigate(`/app/org/${oid}/chats/${conv.id}`)
  }

  const handleExportChat = useCallback(async (withMedia) => {
    if (!orgId || !chatId || !user?.uid) return
    try {
      const msgs = await getMessages(orgId, chatId, 500)
      const title = selectedConv?.type === CONV_TYPES.dm
        ? getConvTitle(selectedConv)
        : (selectedConv?.name || 'Group')
      const safeTitle = title.replace(/[^a-z0-9]/gi, '-')
      if (withMedia) {
        const escape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        const blocks = msgs.map((m) => {
          const name = m.senderId === user.uid ? 'You' : escape(getDisplayName(userProfiles[m.senderId], m.senderId))
          const time = m.createdAt?.toMillis?.()
            ? new Date(m.createdAt.toMillis()).toLocaleString()
            : ''
          let body = ''
          if (m.text) body += `<p class="msg-text">${escape(m.text)}</p>`
          if (m.attachment?.type === 'image' && m.attachment?.data) {
            body += `<p class="msg-img"><img src="${m.attachment.data}" alt="Image" loading="lazy" /></p>`
          }
          if (m.attachment?.type === 'document' && m.attachment?.data) {
            body += `<p class="msg-doc"><a href="${escape(m.attachment.data)}" download="${escape(m.attachment?.fileName || 'document')}">${escape(m.attachment?.fileName || 'Document')}</a></p>`
          }
          if (m.attachment?.type === 'poll') {
            body += `<p class="msg-poll">[Poll: ${escape(m.attachment?.question || '')}]</p>`
          }
          if (!body) body = '<p class="msg-text"></p>'
          return `<div class="msg"><span class="msg-meta">[${escape(time)}] ${name}:</span>${body}</div>`
        })
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Chat: ${escape(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:1rem;max-width:600px}
.msg{margin:1rem 0;border-bottom:1px solid #eee;padding-bottom:0.5rem}
.msg-meta{font-size:0.85rem;color:#666}
.msg-text{margin:0.25rem 0}
.msg-img img{max-width:100%;max-height:300px;border-radius:8px}
.msg-doc a{color:#0066cc;text-decoration:underline}
.msg-poll{font-style:italic;color:#888;margin:0.25rem 0}
</style>
</head>
<body>
<h1>${escape(title)}</h1>
<p>Exported ${new Date().toLocaleString()}</p>
${blocks.join('\n')}
</body>
</html>`
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `chat-${safeTitle}.html`
        a.click()
        URL.revokeObjectURL(a.href)
      } else {
        const lines = msgs.map((m) => {
          const name = m.senderId === user.uid ? 'You' : getDisplayName(userProfiles[m.senderId], m.senderId)
          const time = m.createdAt?.toMillis?.()
            ? new Date(m.createdAt.toMillis()).toLocaleString()
            : ''
          let text = m.text || ''
          if (m.attachment?.type === 'image') text += ' [Image]'
          if (m.attachment?.type === 'document') text += ` [Document: ${m.attachment?.fileName || 'File'}]`
          if (m.attachment?.type === 'poll') text += ` [Poll: ${m.attachment?.question || ''}]`
          return `[${time}] ${name}: ${text}`
        })
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `chat-${safeTitle}.txt`
        a.click()
        URL.revokeObjectURL(a.href)
      }
    } catch (err) {
      setError(err?.message || 'Export failed.')
    }
  }, [orgId, chatId, user?.uid, selectedConv, userProfiles])

  const handleStartVideoCall = useCallback((channel) => {
    navigate(`/app/video?channel=${encodeURIComponent(channel)}`)
  }, [navigate])

  const handleChatMenuAction = useCallback(async (conv, action) => {
    if (!user?.uid) return
    const oid = conv?.orgId ?? orgId
    const cid = conv?.id
    if (!oid || !cid) return
    try {
      if (action === 'delete') {
        if (!window.confirm('Delete this chat? It will be removed from your list.')) return
        await deleteConversationForUser(oid, cid, user.uid)
        if (cid === chatId && oid === orgId) navigate(`/app/org/${oid}/chats`)
      } else if (action === 'archive') {
        await archiveConversation(oid, cid, user.uid, true)
      } else if (action === 'unarchive') {
        await archiveConversation(oid, cid, user.uid, false)
      } else if (action === 'mute') {
        const currentlyMuted = !!conv?.mutedBy?.[user.uid]
        await muteConversation(oid, cid, user.uid, !currentlyMuted)
      } else if (action === 'markRead') {
        markedUnreadConvsRef.current.delete(`${oid}_${cid}`)
        await markConversationRead(oid, cid, user.uid)
        if (oid === orgId && cid === chatId && messages.length) {
          const fromOthers = messages.filter((m) => m.senderId !== user.uid && m.status !== MESSAGE_STATUS.read)
          if (fromOthers.length) markMessagesRead(oid, cid, fromOthers.map((m) => m.id)).catch(() => {})
        }
      } else if (action === 'markUnread') {
        markedUnreadConvsRef.current.add(`${oid}_${cid}`)
        await markConversationUnread(oid, cid, user.uid)
      } else if (action === 'clear') {
        if (!window.confirm('Clear all messages? This cannot be undone.')) return
        await clearConversation(oid, cid, user.uid)
      } else if (action === 'block') {
        const other = conv?.type === CONV_TYPES.dm && conv.members?.find((id) => id !== user.uid)
        if (other) {
          const { blockUser } = await import('../lib/blockService')
          await blockUser(user.uid, other)
          setBlockedUserIds((prev) => [...prev, other])
          if (cid === chatId && oid === orgId) navigate(`/app/org/${oid}/chats`)
        }
      } else if (action === 'favorite') {
        const key = `${oid}_${cid}`
        const isFav = favoriteConvIds.has(key)
        if (isFav) {
          await removeFromFavorites(user.uid, oid, cid)
        } else {
          await addToFavorites(user.uid, oid, cid)
        }
      } else if (action === 'lock') {
        const key = `${oid}_${cid}`
        const locked = lockedChatIds.has(key)
        if (locked) {
          setLockModal({ mode: 'unlock', orgId: oid, convId: cid, fromMenu: true })
        } else {
          if (!hasPin(user.uid)) {
            setLockModal({ mode: 'create', orgId: oid, convId: cid, fromMenu: true })
          } else {
            setChatLocked(user.uid, oid, cid, true)
            setLockedChatIds(getLockedChatIds(user.uid))
          }
        }
      }
    } catch (err) {
      setError(err?.message || 'Action failed.')
    }
  }, [user?.uid, orgId, chatId, navigate, favoriteConvIds, lockedChatIds, messages])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    setError('')
    if (!messageText.trim() || !chatId || !user?.uid) return
    setSending(true)
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    typingDebounceRef.current = null
    try {
      await sendMessageApi(orgId, chatId, messageText.trim(), user.uid)
      markedUnreadConvsRef.current.delete(`${orgId}_${chatId}`)
      setMessageText('')
      setReplyTo(null)
      playSendSound()
      clearTyping(orgId, chatId, user.uid).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  // Debounced typing indicator
  const handleMessageTextChange = (e) => {
    const v = e.target.value
    setMessageText(v)
    if (!orgId || !chatId || !user?.uid) return
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    if (!v.trim()) {
      clearTyping(orgId, chatId, user.uid).catch(() => {})
      return
    }
    setTyping(orgId, chatId, user.uid, true).catch(() => {})
    typingDebounceRef.current = setTimeout(() => {
      clearTyping(orgId, chatId, user.uid).catch(() => {})
      typingDebounceRef.current = null
    }, 1500)
  }

  useEffect(() => {
    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
      if (orgId && chatId && user?.uid) clearTyping(orgId, chatId, user.uid).catch(() => {})
    }
  }, [orgId, chatId, user?.uid])

  const closeAttachmentMenu = useCallback(() => {
    setAttachmentMenuClosing(true)
    setTimeout(() => {
      setShowAttachmentMenu(false)
      setAttachmentMenuClosing(false)
    }, 150)
  }, [])

  useEffect(() => {
    if (!showAttachmentMenu) return
    const handleClickOutside = (e) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target)) {
        closeAttachmentMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAttachmentMenu, closeAttachmentMenu])

  const MAX_IMAGE_BASE64_SIZE = 450 * 1024 // ~450KB to stay under Firestore 1MB doc limit
  const MAX_DOCUMENT_BASE64_SIZE = 950 * 1024 // ~950KB; Firestore 1MB hard limit

  const sendWithAttachment = useCallback(async (attachment, text = '') => {
    if (!chatId || !user?.uid) return
    setError('')
    setSending(true)
    try {
      await sendMessageApi(orgId, chatId, text, user.uid, { attachment })
      markedUnreadConvsRef.current.delete(`${orgId}_${chatId}`)
      if (text) setMessageText('')
      playSendSound()
      clearTyping(orgId, chatId, user.uid).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to send.')
    } finally {
      setSending(false)
    }
  }, [orgId, chatId, user?.uid])

  const sendTextMessage = useCallback(async (text) => {
    if (!text?.trim() || !chatId || !user?.uid) return
    setError('')
    setSending(true)
    try {
      await sendMessageApi(orgId, chatId, text.trim(), user.uid)
      markedUnreadConvsRef.current.delete(`${orgId}_${chatId}`)
      setMessageText('')
      playSendSound()
      clearTyping(orgId, chatId, user.uid).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to send.')
    } finally {
      setSending(false)
    }
  }, [orgId, chatId, user?.uid])

  const handleAttachmentSelect = useCallback((id) => {
    closeAttachmentMenu()
    if (id === 'photos') photosInputRef.current?.click()
    else if (id === 'camera') cameraInputRef.current?.click()
    else if (id === 'document') documentInputRef.current?.click()
    else if (id === 'poll') setShowPollModal(true)
    else if (id === 'event') setShowEventModal(true)
    else if (id === 'users') setShowNewChat(true)
  }, [closeAttachmentMenu])

  const handlePhotosChange = useCallback((e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result
      if (base64.length > MAX_IMAGE_BASE64_SIZE) {
        setError('Image too large. Please use an image under ~400KB.')
        return
      }
      sendWithAttachment({ type: 'image', data: base64 })
    }
    reader.readAsDataURL(file)
  }, [sendWithAttachment])

  const handleDocumentChange = useCallback((e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const allowed = /\.(pdf|doc|docx|xls|xlsx|txt|csv)$/i.test(file.name)
    if (!allowed) {
      setError('File type not supported. Use PDF, Word, Excel, TXT, or CSV.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result
      if (base64.length > MAX_DOCUMENT_BASE64_SIZE) {
        setError('Document too large. Maximum is ~700KB (Firestore 1MB limit).')
        return
      }
      sendWithAttachment({ type: 'document', data: base64, fileName: file.name })
    }
    reader.readAsDataURL(file)
  }, [sendWithAttachment])

  const handlePollSubmit = useCallback(({ question, options }) => {
    sendWithAttachment({
      type: 'poll',
      question,
      options: options.map((t) => ({ text: t })),
    })
  }, [sendWithAttachment])

  const handleVotePoll = useCallback(async (msgId, optionIndex) => {
    if (!orgId || !chatId || !user?.uid) return
    setError('')
    try {
      await votePoll(orgId, chatId, msgId, user.uid, optionIndex)
    } catch (err) {
      setError(err?.message || 'Failed to vote.')
    }
  }, [orgId, chatId, user?.uid])

  const handleEndPoll = useCallback(async (msgId) => {
    if (!orgId || !chatId || !user?.uid) return
    setError('')
    try {
      await endPoll(orgId, chatId, msgId, user.uid)
    } catch (err) {
      setError(err?.message || 'Failed to end poll.')
    }
  }, [orgId, chatId, user?.uid])

  const handleStarMessage = useCallback(async (msgId, text, isStarred) => {
    if (!orgId || !chatId || !user?.uid) return
    setError('')
    try {
      if (isStarred) {
        await unstarMessage(user.uid, orgId, chatId, msgId)
      } else {
        await starMessage(user.uid, orgId, chatId, msgId, text || '')
      }
    } catch (err) {
      setError(err?.message || 'Failed to star message.')
    }
  }, [orgId, chatId, user?.uid])

  const handleScrollToMessage = useCallback((msgId) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const handleLockModalSubmit = useCallback(async (mode, pin) => {
    if (!lockModal || !user?.uid) return
    const { orgId: oid, convId: cid } = lockModal
    if (mode === 'create') {
      await setPin(user.uid, pin)
      setChatLocked(user.uid, oid, cid, true)
    } else {
      const ok = await verifyPin(user.uid, pin)
      if (!ok) throw new Error('Incorrect PIN')
      setChatLocked(user.uid, oid, cid, false)
    }
    setLockedChatIds(getLockedChatIds(user.uid))
    setLockModal(null)
  }, [lockModal, user?.uid])

  const handleForwardMessage = useCallback(async (targetConv) => {
    if (!forwardMessage || !user?.uid) return
    setError('')
    try {
      const text = forwardMessage.text || ''
      const att = forwardMessage.attachment
      const attachment = (att?.type === 'image' && att?.data) || (att?.type === 'document' && att?.data)
        ? { type: att.type, data: att.data, ...(att.fileName && { fileName: att.fileName }) }
        : undefined
      await sendMessageApi(targetConv.orgId, targetConv.id, text, user.uid, attachment ? { attachment } : {})
      playSendSound()
    } catch (err) {
      setError(err?.message || 'Failed to forward.')
    } finally {
      setForwardMessage(null)
      setShowForwardModal(false)
    }
  }, [forwardMessage, user?.uid])

  const handleMessageReaction = useCallback(async (msgId, emoji) => {
    if (!orgId || !chatId || !user?.uid) return
    try {
      await addReaction(orgId, chatId, msgId, user.uid, emoji)
      setMessageContextMsg(null)
      setReactionRemoveTarget(null)
    } catch (err) {
      setError(err?.message || 'Failed to add reaction.')
    }
  }, [orgId, chatId, user?.uid])

  const handleReactionClick = useCallback((m, emoji, e) => {
    e?.stopPropagation()
    const raw = (m.reactions && m.reactions[emoji]) || []
    const userIds = Array.isArray(raw) ? raw : Object.keys(raw || {})
    const hasOwn = userIds.some((id) => String(id) === String(user?.uid))
    if (hasOwn) {
      setReactionRemoveTarget((prev) =>
        prev?.msgId === m.id && prev?.emoji === emoji ? null : { msgId: m.id, emoji }
      )
    } else {
      handleMessageReaction(m.id, emoji)
    }
  }, [user?.uid, handleMessageReaction])

  const handleDeleteMessage = useCallback(async (msgId) => {
    if (!orgId || !chatId || !user?.uid) return
    if (!window.confirm('Delete this message?')) return
    try {
      await deleteMessage(orgId, chatId, msgId, user.uid)
      setMessageContextMsg(null)
    } catch (err) {
      setError(err?.message || 'Failed to delete.')
    }
  }, [orgId, chatId, user?.uid])

  const handleLockOverlayUnlock = useCallback(async (e) => {
    e?.preventDefault()
    if (!orgId || !chatId || !user?.uid) return
    setLockOverlayError('')
    const p = lockOverlayPin.replace(/\D/g, '')
    if (!p) {
      setLockOverlayError('Enter your PIN')
      return
    }
    const ok = await verifyPin(user.uid, p)
    if (!ok) {
      setLockOverlayError('Incorrect PIN')
      return
    }
    setChatLocked(user.uid, orgId, chatId, false)
    setLockedChatIds(getLockedChatIds(user.uid))
    setLockOverlayPin('')
    setLockOverlayError('')
  }, [orgId, chatId, user?.uid, lockOverlayPin])

  const handleEventSubmit = useCallback(async ({ text, title, date, time }) => {
    await sendTextMessage(text)
    if (!date || !orgId || !user?.uid || !chatId || !selectedConv) return
    try {
      const [year, month, day] = date.split('-').map(Number)
      const [hours = 0, minutes = 0] = time ? time.split(':').map(Number) : [0, 0]
      const startAt = Timestamp.fromDate(new Date(year, month - 1, day, hours, minutes, 0))
      const isTeam = selectedConv.type === CONV_TYPES.team && selectedConv.teamId
      const meetingData = {
        title,
        startAt,
        scope: isTeam ? MEETING_SCOPES.team : MEETING_SCOPES.private,
        ...(isTeam ? { scopeTeamId: selectedConv.teamId } : { scopeInviteList: selectedConv.members || [] }),
      }
      await createMeeting(orgId, meetingData, user.uid)
    } catch (err) {
      setError(err?.message || 'Event sent, but calendar sync failed.')
    }
  }, [orgId, chatId, user?.uid, selectedConv, sendTextMessage])

  const hasOrg = orgId && org
  const isMember = membership?.state === 'active'

  useEffect(() => {
    setNavExtra(undefined)
  }, [setNavExtra])

  if (loading && !user) {
    return (
      <main className="app-main app-main-center">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  if (!orgId) return null

  if (!org) {
    return (
      <main className="app-main app-main-center">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  if (!hasOrg || !isMember) {
    return (
      <main className="app-main">
        <h2>Chats</h2>
        <p className="app-muted">You need to be an active member of this organization to use chats.</p>
        <Button to="/app" variant="primary" size="md">Go to Dashboard</Button>
      </main>
    )
  }

  return (
    <div className="chats-layout">
      <div className="chats-container">
        <aside className="chats-sidebar">
          {error && (
            <p className="auth-error" style={{ padding: '0.5rem 1rem', margin: 0, fontSize: '0.85rem' }}>{error}</p>
          )}
          <div className="chats-sidebar-head">
            <h3 className="chats-sidebar-title">Chats</h3>
            <button
              type="button"
              className="chats-add-btn"
              onClick={() => setShowNewChat(true)}
              title="New chat"
            >
              +
            </button>
          </div>
          <div className="chats-search-row">
            <div className="chats-search-wrap">
              <SearchIcon size={16} className="chats-search-icon" />
              <input
                type="text"
                placeholder="Search chats"
                value={chatListFilter}
                onChange={(e) => setChatListFilter(e.target.value)}
                className="chats-search-input"
              />
            </div>
            <div className="chats-filter-sort-wrap" ref={filterSortRef}>
              <button
                type="button"
                className="chats-filter-sort-icon-btn"
                onClick={() => setFilterSortOpen((v) => !v)}
                aria-expanded={filterSortOpen}
                aria-haspopup="true"
                title="Filter and sort"
              >
                <SlidersHorizontalIcon size={18} />
              </button>
              {filterSortOpen && (
                <div className="chats-filter-sort-panel">
                  <div className="chats-filter-sort-section">
                    <span className="chats-filter-sort-label">Sort by</span>
                    <button type="button" className={chatListSort === 'recent' ? 'chats-filter-sort-opt active' : 'chats-filter-sort-opt'} onClick={() => { setChatListSort('recent'); setFilterSortOpen(false) }}>Recent</button>
                    <button type="button" className={chatListSort === 'name' ? 'chats-filter-sort-opt active' : 'chats-filter-sort-opt'} onClick={() => { setChatListSort('name'); setFilterSortOpen(false) }}>Name</button>
                    <button type="button" className={chatListSort === 'unread' ? 'chats-filter-sort-opt active' : 'chats-filter-sort-opt'} onClick={() => { setChatListSort('unread'); setFilterSortOpen(false) }}>Unread first</button>
                  </div>
                  <div className="chats-filter-sort-section">
                    <span className="chats-filter-sort-label">Filter</span>
                    {conversations.some((c) => c.archivedBy?.[user?.uid]) && (
                      <label className="chats-filter-sort-toggle">
                        <input
                          type="checkbox"
                          checked={showArchived}
                          onChange={(e) => setShowArchived(e.target.checked)}
                        />
                        <span className="chats-filter-sort-toggle-slider" />
                        <span className="chats-filter-sort-toggle-label">Show archived</span>
                      </label>
                    )}
                    {favoriteConvIds.size > 0 && (
                      <label className="chats-filter-sort-toggle">
                        <input
                          type="checkbox"
                          checked={showFavoritesOnly}
                          onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                        />
                        <span className="chats-filter-sort-toggle-slider" />
                        <span className="chats-filter-sort-toggle-label">Favorites only</span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {(() => {
            const filterLower = chatListFilter.trim().toLowerCase()
            const applyFilter = (list) => {
              let out = list.filter((c) => !c.deletedBy?.[user?.uid])
              out = out.filter((c) => {
                if (c.type !== CONV_TYPES.dm) return true
                const other = c.members?.find((id) => id !== user?.uid)
                return !other || !blockedUserIds.includes(other)
              })
              if (showFavoritesOnly) {
                out = out.filter((c) => favoriteConvIds.has(`${c.orgId}_${c.id}`))
              }
              if (filterLower) {
                out = out.filter((c) => {
                  const title = getConvTitle(c).toLowerCase()
                  const org = (orgNames[c.orgId] || '').toLowerCase()
                  return title.includes(filterLower) || org.includes(filterLower)
                })
              }
              return out
            }
            const applySort = (list) => {
              if (chatListSort === 'name') {
                return [...list].sort((a, b) => getConvTitle(a).localeCompare(getConvTitle(b)))
              }
              if (chatListSort === 'unread') {
                return [...list].sort((a, b) => {
                  const ua = a.unreadCount?.[user?.uid] ?? 0
                  const ub = b.unreadCount?.[user?.uid] ?? 0
                  return ub - ua
                })
              }
              return [...list].sort((a, b) => {
                const favA = favoriteConvIds.has(`${a.orgId}_${a.id}`) ? 1 : 0
                const favB = favoriteConvIds.has(`${b.orgId}_${b.id}`) ? 1 : 0
                if (favA !== favB) return favB - favA
                const ta = a.lastMessageAt?.toMillis?.() ?? 0
                const tb = b.lastMessageAt?.toMillis?.() ?? 0
                return tb - ta
              })
            }
            const base = conversations.filter((c) => !c.deletedBy?.[user?.uid])
            const activeList = applySort(applyFilter(base.filter((c) => !c.archivedBy?.[user?.uid])))
            const archivedList = applySort(applyFilter(base.filter((c) => c.archivedBy?.[user?.uid])))

            const renderItem = (c) => (
              <ChatListItem
                key={`${c.orgId}-${c.id}`}
                conv={c}
                title={getConvTitle(c)}
                avatar={getConvAvatar(c)}
                orgName={orgNames[c.orgId] || ''}
                isActive={c.orgId === orgId && c.id === chatId}
                lastPreview={c.lastMessagePreview}
                lastTime={c.lastMessageAt}
                unreadCount={c.unreadCount?.[user?.uid] ?? 0}
                isFavorite={favoriteConvIds.has(`${c.orgId}_${c.id}`)}
                isLocked={lockedChatIds.has(`${c.orgId}_${c.id}`)}
                isMuted={!!c.mutedBy?.[user?.uid]}
                isArchived={!!c.archivedBy?.[user?.uid]}
                onClick={() => handleOpenChat(c)}
                userDoc={userDoc}
                onMenuAction={(action) => handleChatMenuAction(c, action)}
              />
            )

            if (conversations.length === 0) {
              return (
                <ul className="chats-list">
                  <li className="chats-empty">No chats yet. Start a new one!</li>
                </ul>
              )
            }
            if (filterLower && activeList.length === 0 && archivedList.length === 0) {
              return (
                <ul className="chats-list">
                  <li className="chats-empty">No chats match your filter.</li>
                </ul>
              )
            }

            if (!showArchived) {
              return (
                <ul className="chats-list">
                  {activeList.map(renderItem)}
                  {activeList.length === 0 && <li className="chats-empty">No chats yet. Turn on “Show archived” in filter to see archived.</li>}
                </ul>
              )
            }

            return (
              <div className="chats-list-archived-wrapper">
                <ul className="chats-list chats-list-section">
                  <li className="chats-list-section-header">Chats</li>
                  {activeList.map(renderItem)}
                  {activeList.length === 0 && <li className="chats-empty">No chats</li>}
                </ul>
                <ul className="chats-list chats-list-archived">
                  <li className="chats-list-section-header">Archived</li>
                  {archivedList.map(renderItem)}
                  {archivedList.length === 0 && <li className="chats-empty">No archived chats</li>}
                </ul>
              </div>
            )
          })()}
        </aside>
        <main className={`chats-main ${messageContextMsg ? 'chats-main-context-open' : ''}`}>
          {chatId ? (
            <>
              <header className="chats-header">
                <div className="chats-header-info">
                  {selectedConv?.type === CONV_TYPES.dm && (() => {
                    const other = selectedConv.members?.find((id) => id !== user?.uid)
                    const p = other ? userProfiles[other] : null
                    const avatarUrl = p && getProfilePictureUrl(p)
                    return (
                      <button
                        type="button"
                        className="chats-header-avatar-btn"
                        onClick={() => other && setChatSettingsUserId(other)}
                        title="View profile"
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="chats-header-avatar" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="chats-header-avatar-initial">
                            {other ? (getDisplayName(userProfiles[other], other)[0]?.toUpperCase() || '?') : '?'}
                          </span>
                        )}
                      </button>
                    )
                  })()}
                  <div className="chats-header-text">
                    <h2
                      className={`chats-chat-name ${selectedConv?.type === CONV_TYPES.dm ? 'chats-chat-name-clickable' : ''}`}
                      onClick={selectedConv?.type === CONV_TYPES.dm ? () => {
                        const other = selectedConv.members?.find((id) => id !== user?.uid)
                        if (other) setChatSettingsUserId(other)
                      } : undefined}
                      role={selectedConv?.type === CONV_TYPES.dm ? 'button' : undefined}
                      tabIndex={selectedConv?.type === CONV_TYPES.dm ? 0 : undefined}
                      onKeyDown={selectedConv?.type === CONV_TYPES.dm ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          const other = selectedConv.members?.find((id) => id !== user?.uid)
                          if (other) setChatSettingsUserId(other)
                        }
                      } : undefined}
                    >
                      {getConvTitle(selectedConv)}
                    </h2>
                    {org && <p className="chats-header-org">{org.name}</p>}
                    {(selectedConv?.type === CONV_TYPES.group || selectedConv?.type === CONV_TYPES.team) && (
                      <p className="chats-header-sub">{getMemberCount(selectedConv)} members</p>
                    )}
                  </div>
                  {(selectedConv?.type === CONV_TYPES.group || selectedConv?.type === CONV_TYPES.team) && (
                    <button
                      type="button"
                      className="chats-header-settings-btn"
                      onClick={() => setShowGroupSettings(true)}
                      title="Group settings"
                      aria-label="Group settings"
                    >
                      <SettingsIcon size={20} />
                    </button>
                  )}
                </div>
                {typers.length > 0 && (
                  <div className="chats-typing">
                    <span>
                      {typers.length === 1
                        ? getDisplayName(userProfiles[typers[0]], typers[0], null)
                        : `${typers.length} people`}{' '}
                      typing
                    </span>
                    <div className="chats-typing-dots">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
              </header>
              {selectedConv?.archivedBy?.[user?.uid] && (
                <div className="chats-archived-banner">
                  <span>This chat is archived.</span>
                  <button
                    type="button"
                    className="chats-archived-banner-btn"
                    onClick={() => handleChatMenuAction(selectedConv, 'unarchive')}
                  >
                    Unarchive
                  </button>
                </div>
              )}
              {searchInChat && !lockedChatIds.has(`${orgId}_${chatId}`) && (
                <div className="chats-search-bar">
                  <input
                    type="text"
                    placeholder="Search in chat…"
                    value={searchInChat}
                    onChange={(e) => setSearchInChat(e.target.value)}
                    className="chats-search-input"
                    autoFocus
                  />
                  <button type="button" className="chats-search-close" onClick={() => setSearchInChat('')} aria-label="Close search">×</button>
                </div>
              )}
              {lockedChatIds.has(`${orgId}_${chatId}`) ? (
                <div className="chats-lock-overlay">
                  <LockIcon size={48} className="chats-lock-overlay-icon" />
                  <h3>This chat is locked</h3>
                  <p>Enter your PIN to view messages</p>
                  <form onSubmit={handleLockOverlayUnlock} className="chats-lock-overlay-form">
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="PIN"
                      value={lockOverlayPin}
                      onChange={(e) => setLockOverlayPin(e.target.value)}
                      className="auth-input chats-lock-pin"
                      maxLength={8}
                      autoFocus
                    />
                    {lockOverlayError && <p className="auth-error">{lockOverlayError}</p>}
                    <Button type="submit" variant="primary">Unlock</Button>
                  </form>
                </div>
              ) : (
              <div className="chats-chat-body">
              <div className="chats-messages" ref={messagesContainerRef}>
                {messages.length === 0 && !searchInChat ? (
                  <p className="chats-messages-empty">No messages yet. Start the conversation!</p>
                ) : (
                  (() => {
                    let filtered = searchInChat.trim()
                      ? messages.filter((m) => (m.text || '').toLowerCase().includes(searchInChat.trim().toLowerCase()))
                      : messages
                    filtered = filtered.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
                    const lastOwnIndex = filtered.reduce((acc, m, idx) =>
                      m.senderId === user?.uid ? idx : acc, -1)
                    const locale = getLocale(userDoc)
                    const tz = getTimeZone(userDoc)
                    const tzOpts = tz ? { timeZone: tz } : {}
                    let prevDateKey = ''
                    const items = []
                    filtered.forEach((m, i) => {
                      const ms = m.createdAt?.toMillis?.()
                      const dateKey = ms ? new Date(ms).toLocaleDateString(locale, tzOpts) : ''
                      if (dateKey && dateKey !== prevDateKey) {
                        items.push({ type: 'date', key: `date-${dateKey}`, label: getMessageDateLabel(ms, userDoc) })
                        prevDateKey = dateKey
                      }
                      items.push({ type: 'message', message: m, index: i })
                    })
                    return items.map((item) => {
                      if (item.type === 'date') {
                        return (
                          <div key={item.key} className="chats-date-separator">
                            <span>{item.label}</span>
                          </div>
                        )
                      }
                      const m = item.message
                      const i = item.index
                      const isOwn = m.senderId === user?.uid
                      const showStatus = isOwn && i === lastOwnIndex
                      const prev = filtered[i - 1]
                      const showSender = selectedConv?.type !== CONV_TYPES.dm && (!prev || prev.senderId !== m.senderId)
                      const senderName = showSender
                        ? (m.senderId === user?.uid ? 'You' : getDisplayName(userProfiles[m.senderId], m.senderId, user?.uid === m.senderId ? user : null))
                        : null
                      const senderProfile = userProfiles[m.senderId]
                      const avatarUrl = !messageImgErrors[`${m.id}-avatar`] && getProfilePictureUrl(senderProfile, m.senderId === user?.uid ? user : null)
                      const avatarInitial = (senderName || getDisplayName(senderProfile, m.senderId, m.senderId === user?.uid ? user : null) || '?')[0]?.toUpperCase()
                      const ts = m.createdAt?.toMillis?.()
                        ? new Date(m.createdAt.toMillis()).toLocaleTimeString(getLocale(userDoc), { hour: '2-digit', minute: '2-digit', ...(getTimeZone(userDoc) && { timeZone: getTimeZone(userDoc) }) })
                        : ''
                      const isStarred = starredMap.has(m.id)
                      return (
                        <div
                          key={m.id}
                          data-msg-id={m.id}
                          className={`chats-message-row ${isOwn ? 'chats-message-own' : ''} ${messageContextMsg?.id === m.id ? 'chats-message-row-context-open' : ''}`}
                        >
                          <div className={`chats-message-content ${isOwn ? 'chats-message-content-own' : ''}`}>
                            {!isOwn && (
                              <button
                                type="button"
                                className="chats-message-avatar chats-message-avatar-btn"
                                onClick={() => setProfileModalUserId(m.senderId)}
                                title="View profile"
                              >
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setMessageImgErrors((e) => ({ ...e, [`${m.id}-avatar`]: true }))} />
                                ) : (
                                  <span className="chats-message-avatar-initial">{avatarInitial}</span>
                                )}
                              </button>
                            )}
                            {isOwn ? (
                              <>
                                <div className="chats-own-top-row">
                                  <div className="chats-bubble-wrap chats-bubble-wrap-own">
                                    {senderName && <span className="chats-bubble-sender">{senderName}</span>}
                              <div className="chats-bubble chats-bubble-own">
                              {m.attachment?.type === 'poll' && (
                                <PollBubble
                                  message={m}
                                  isOwn={isOwn}
                                  userId={user?.uid}
                                  onVote={(optIdx) => handleVotePoll(m.id, optIdx)}
                                  onEndPoll={() => handleEndPoll(m.id)}
                                />
                              )}
                              {m.attachment?.type === 'image' && m.attachment?.data && (
                                <div className="chats-bubble-image-wrap">
                                  <img src={m.attachment.data} alt="" className="chats-bubble-image" referrerPolicy="no-referrer" />
                                </div>
                              )}
                              {m.attachment?.type === 'document' && m.attachment?.data && (
                                <a
                                  href={m.attachment.data}
                                  download={m.attachment.fileName || 'document'}
                                  className="chats-bubble-document"
                                >
                                  <FileTextIcon size={18} />
                                  <span>{m.attachment.fileName || 'Document'}</span>
                                </a>
                              )}
                              {m.attachment?.type !== 'poll' && m.text && <p className="chats-bubble-text">{m.text}</p>}
                              <div className="chats-bubble-footer">
                                {ts && <span className="chats-bubble-time">{ts}</span>}
                                <button
                                  type="button"
                                  className="chats-message-more-btn"
                                  onClick={(e) => { e.stopPropagation(); setMessageContextMsg(m) }}
                                  title="More options"
                                  aria-label="Message options"
                                >
                                  <MoreVerticalIcon size={14} />
                                </button>
                              </div>
                            </div>
                            {(m.reactions && Object.keys(m.reactions).length > 0) && (
                              <div className="chats-bubble-reactions-wrap">
                                {Object.entries(m.reactions).map(([emoji, userIds]) => {
                                  const showRemove = reactionRemoveTarget?.msgId === m.id && reactionRemoveTarget?.emoji === emoji
                                  return (
                                    <div key={emoji} className="chats-reaction-wrap">
                                      <button
                                        type="button"
                                        className={`chats-reaction-pill ${(userIds || []).includes(user?.uid) ? 'chats-reaction-own' : ''}`}
                                        onClick={(e) => handleReactionClick(m, emoji, e)}
                                        title={`${emoji} ${(userIds || []).length}`}
                                      >
                                        <span className="chats-reaction-emoji">{emoji}</span>
                                        {(userIds || []).length > 1 && (
                                          <span className="chats-reaction-count">{(userIds || []).length}</span>
                                        )}
                                      </button>
                                      {showRemove && (
                                        <div className="chats-reaction-remove-pill" onClick={(e) => e.stopPropagation()}>
                                          <span>Remove?</span>
                                          <button type="button" onClick={() => handleMessageReaction(m.id, emoji)}>Yes</button>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                                    </div>
                                    <div className="chats-message-avatar chats-message-avatar-own" title="You">
                                      {avatarUrl ? (
                                        <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setMessageImgErrors((e) => ({ ...e, [`${m.id}-avatar`]: true }))} />
                                      ) : (
                                        <span className="chats-message-avatar-initial">{avatarInitial}</span>
                                      )}
                                    </div>
                                  </div>
                                  {showStatus && (
                                    <span className="chats-bubble-status-below">
                                      <MessageStatus status={m.status} />
                                    </span>
                                  )}
                                </>
                              ) : (
                                <div className="chats-bubble-wrap">
                                  {senderName && (
                                    <button
                                      type="button"
                                      className="chats-bubble-sender chats-bubble-sender-btn"
                                      onClick={() => setProfileModalUserId(m.senderId)}
                                    >
                                      {senderName}
                                    </button>
                                  )}
                                  <div className="chats-bubble chats-bubble-other">
                                    {m.attachment?.type === 'poll' && (
                                      <PollBubble
                                        message={m}
                                        isOwn={isOwn}
                                        userId={user?.uid}
                                        onVote={(optIdx) => handleVotePoll(m.id, optIdx)}
                                        onEndPoll={() => handleEndPoll(m.id)}
                                      />
                                    )}
                                    {m.attachment?.type === 'image' && m.attachment?.data && (
                                      <div className="chats-bubble-image-wrap">
                                        <img src={m.attachment.data} alt="" className="chats-bubble-image" referrerPolicy="no-referrer" />
                                      </div>
                                    )}
                                    {m.attachment?.type === 'document' && m.attachment?.data && (
                                      <a
                                        href={m.attachment.data}
                                        download={m.attachment.fileName || 'document'}
                                        className="chats-bubble-document"
                                      >
                                        <FileTextIcon size={18} />
                                        <span>{m.attachment.fileName || 'Document'}</span>
                                      </a>
                                    )}
                                    {m.attachment?.type !== 'poll' && m.text && <p className="chats-bubble-text">{m.text}</p>}
                                    <div className="chats-bubble-footer">
                                      {ts && <span className="chats-bubble-time">{ts}</span>}
                                      <button
                                        type="button"
                                        className="chats-message-more-btn"
                                        onClick={(e) => { e.stopPropagation(); setMessageContextMsg(m) }}
                                        title="More options"
                                        aria-label="Message options"
                                      >
                                        <MoreVerticalIcon size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  {(m.reactions && Object.keys(m.reactions).length > 0) && (
                                    <div className="chats-bubble-reactions-wrap">
                                      {Object.entries(m.reactions).map(([emoji, userIds]) => {
                                        const showRemove = reactionRemoveTarget?.msgId === m.id && reactionRemoveTarget?.emoji === emoji
                                        return (
                                          <div key={emoji} className="chats-reaction-wrap">
                                            <button
                                              type="button"
                                              className={`chats-reaction-pill ${(userIds || []).includes(user?.uid) ? 'chats-reaction-own' : ''}`}
                                              onClick={(e) => handleReactionClick(m, emoji, e)}
                                              title={`${emoji} ${(userIds || []).length}`}
                                            >
                                              <span className="chats-reaction-emoji">{emoji}</span>
                                              {(userIds || []).length > 1 && (
                                                <span className="chats-reaction-count">{(userIds || []).length}</span>
                                              )}
                                            </button>
                                            {showRemove && (
                                              <div className="chats-reaction-remove-pill" onClick={(e) => e.stopPropagation()}>
                                                <span>Remove?</span>
                                                <button type="button" onClick={() => handleMessageReaction(m.id, emoji)}>Yes</button>
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                        </div>
                      )
                    })
                  })()
                )}
                <div ref={messagesEndRef} />
              </div>
              {showScrollToBottom && (
                <button
                  type="button"
                  className="chats-scroll-to-bottom"
                  onClick={scrollToBottom}
                  title="Scroll to latest messages"
                  aria-label="Scroll to latest messages"
                >
                  <ChevronDownIcon size={20} />
                </button>
              )}
              <form onSubmit={handleSendMessage} className="chats-input-form" ref={attachmentMenuRef}>
                {replyTo && (
                  <div className="chats-reply-preview">
                    <span className="chats-reply-label">Replying to {replyTo.senderId === user?.uid ? 'yourself' : getDisplayName(userProfiles[replyTo.senderId], replyTo.senderId)}</span>
                    <span className="chats-reply-text">{(replyTo.text || (replyTo.attachment?.type === 'image' ? '[Image]' : replyTo.attachment?.type === 'document' ? '[Document]' : '')).slice(0, 60)}{(replyTo.text || (replyTo.attachment?.type === 'image' ? '[Image]' : replyTo.attachment?.type === 'document' ? '[Document]' : '')).length > 60 ? '…' : ''}</span>
                    <button type="button" className="chats-reply-dismiss" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
                  </div>
                )}
                {error && <p className="auth-error">{error}</p>}
                <div className="chats-input-row">
                  <textarea
                    ref={messageInputRef}
                    placeholder="Type a message…"
                    value={messageText}
                    onChange={handleMessageTextChange}
                    onKeyDown={handleKeyDown}
                    className="chats-input chats-input-textarea"
                    disabled={sending}
                    rows={1}
                  />
                  <button
                    type="button"
                    className="chats-add-attach-btn"
                    onClick={() => setShowAttachmentMenu((v) => !v)}
                    title="Attach"
                    aria-label="Attach"
                    aria-expanded={showAttachmentMenu}
                  >
                    <PlusIcon size={22} />
                  </button>
                  <input
                    ref={photosInputRef}
                    type="file"
                    accept="image/*"
                    className="chats-file-input-hidden"
                    onChange={handlePhotosChange}
                    aria-hidden
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="chats-file-input-hidden"
                    onChange={handlePhotosChange}
                    aria-hidden
                  />
                  <input
                    ref={documentInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv"
                    className="chats-file-input-hidden"
                    onChange={handleDocumentChange}
                    aria-hidden
                  />
                  <Button type="submit" variant="primary" size="md" disabled={sending || !messageText.trim()}>
                    Send
                  </Button>
                </div>
                {showAttachmentMenu && (
                  <ChatAttachmentMenu
                    onClose={closeAttachmentMenu}
                    onSelect={handleAttachmentSelect}
                    isClosing={attachmentMenuClosing}
                  />
                )}
              </form>
              </div>
              )}
            </>
          ) : (
            <div className="chats-placeholder">
              <p>Select a chat from the list or start a new one.</p>
            </div>
          )}
        </main>
      </div>
      {showPollModal && (
        <PollModal
          onClose={() => setShowPollModal(false)}
          onSubmit={handlePollSubmit}
          sending={sending}
        />
      )}
      {showEventModal && (
        <EventModal
          onClose={() => setShowEventModal(false)}
          onSubmit={handleEventSubmit}
          sending={sending}
          userDoc={userDoc}
        />
      )}
      {showNewChat && (
        <NewChatModal
          orgId={orgId}
          userId={user?.uid}
          org={org}
          onClose={() => setShowNewChat(false)}
          onOpenChat={(id) => handleOpenChat({ orgId, id })}
          userProfiles={userProfiles}
          setUserProfiles={setUserProfiles}
        />
      )}
      {messageContextMsg && (
        <MessageContextMenu
          message={messageContextMsg}
          isStarred={starredMap.has(messageContextMsg?.id)}
          isOwn={messageContextMsg?.senderId === user?.uid}
          onReply={() => {
            setReplyTo(messageContextMsg)
            setMessageContextMsg(null)
            setTimeout(() => messageInputRef.current?.focus(), 100)
          }}
          onForward={() => {
            setForwardMessage(messageContextMsg)
            setMessageContextMsg(null)
            setShowForwardModal(true)
          }}
          onCopy={() => setMessageContextMsg(null)}
          onInfo={() => setProfileModalUserId(messageContextMsg?.senderId)}
          onStar={() => {
            handleStarMessage(messageContextMsg.id, messageContextMsg.text, starredMap.has(messageContextMsg.id))
            setMessageContextMsg(null)
          }}
          onDelete={() => handleDeleteMessage(messageContextMsg.id)}
          onReactionSelect={(emoji) => handleMessageReaction(messageContextMsg.id, emoji)}
          onClose={() => setMessageContextMsg(null)}
        />
      )}
      {showForwardModal && forwardMessage && (
        <ForwardMessageModal
          message={forwardMessage}
          conversations={conversations}
          orgNames={orgNames}
          userProfiles={userProfiles}
          currentOrgId={orgId}
          currentChatId={chatId}
          user={user}
          blockedUserIds={blockedUserIds}
          getConvTitle={getConvTitle}
          getConvAvatar={getConvAvatar}
          onForward={handleForwardMessage}
          onClose={() => { setShowForwardModal(false); setForwardMessage(null) }}
        />
      )}
      {lockModal && (
        <LockChatModal
          mode={lockModal.mode}
          onClose={() => setLockModal(null)}
          onSubmit={(pin) => handleLockModalSubmit(lockModal.mode, pin)}
        />
      )}
      {showGroupSettings && org && selectedConv && (selectedConv.type === CONV_TYPES.group || selectedConv.type === CONV_TYPES.team) && (
        <GroupChatSettingsModal
          orgId={orgId}
          chatId={chatId}
          conv={selectedConv}
          orgName={org.name}
          userProfiles={userProfiles}
          onClose={() => setShowGroupSettings(false)}
          onSearchInChat={() => setSearchInChat(' ')}
          onExportChat={handleExportChat}
          starredMessages={Array.from(starredMap.values())}
          onScrollToMessage={(msgId) => { setShowGroupSettings(false); handleScrollToMessage(msgId) }}
          isLocked={lockedChatIds.has(`${orgId}_${chatId}`)}
          onLockToggle={(locked) => {
            if (locked) {
              if (!hasPin(user?.uid)) setLockModal({ mode: 'create', orgId, convId: chatId })
              else { setChatLocked(user.uid, orgId, chatId, true); setLockedChatIds(getLockedChatIds(user.uid)) }
            } else {
              setLockModal({ mode: 'unlock', orgId, convId: chatId })
            }
          }}
          isMuted={!!selectedConv?.mutedBy?.[user?.uid]}
          onMuteToggle={(muted) => muteConversation(orgId, chatId, user?.uid, muted).catch((err) => setError(err?.message))}
        />
      )}
      {chatSettingsUserId && org && selectedConv?.type === CONV_TYPES.dm && (
        <ChatSettingsModal
          orgId={orgId}
          chatId={chatId}
          userId={user?.uid}
          otherUserId={chatSettingsUserId}
          otherUserDoc={userProfiles[chatSettingsUserId]}
          otherDisplayName={getDisplayName(userProfiles[chatSettingsUserId], chatSettingsUserId)}
          orgName={org.name}
          onClose={() => setChatSettingsUserId(null)}
          onStartVideoCall={handleStartVideoCall}
          onSearchInChat={() => setSearchInChat(' ')}
          onExportChat={handleExportChat}
          onShareProfile={() => { setShareProfileUserId(chatSettingsUserId); setShowShareProfile(true); setChatSettingsUserId(null) }}
          onViewFullProfile={() => { setProfileModalUserId(chatSettingsUserId); setChatSettingsUserId(null) }}
          starredMessages={Array.from(starredMap.values())}
          onScrollToMessage={(msgId) => { setChatSettingsUserId(null); handleScrollToMessage(msgId) }}
          isLocked={lockedChatIds.has(`${orgId}_${chatId}`)}
          onLockToggle={(locked) => {
            if (locked) {
              if (!hasPin(user?.uid)) setLockModal({ mode: 'create', orgId, chatId, convId: chatId })
              else { setChatLocked(user.uid, orgId, chatId, true); setLockedChatIds(getLockedChatIds(user.uid)) }
            } else {
              setLockModal({ mode: 'unlock', orgId, convId: chatId })
            }
          }}
          isMuted={!!selectedConv?.mutedBy?.[user?.uid]}
          onMuteToggle={(muted) => muteConversation(orgId, chatId, user?.uid, muted).catch((err) => setError(err?.message))}
        />
      )}
      {showShareProfile && shareProfileUserId && orgId && (
        <ShareProfileModal
          orgId={orgId}
          currentUserId={user?.uid}
          profileUserId={shareProfileUserId}
          profileUserName={getDisplayName(userProfiles[shareProfileUserId], shareProfileUserId)}
          onClose={() => { setShowShareProfile(false); setShareProfileUserId(null) }}
        />
      )}
      {profileModalUserId && org && (
        <MemberProfileModal
          userId={profileModalUserId}
          orgId={orgId}
          org={org}
          currentUser={user}
          myMembership={membership}
          userDoc={userProfiles[profileModalUserId]}
          onClose={() => setProfileModalUserId(null)}
          showManage={false}
        />
      )}
    </div>
  )
}
