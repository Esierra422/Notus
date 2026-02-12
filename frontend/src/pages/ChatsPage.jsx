import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, Link, useOutletContext } from 'react-router-dom'
import { getOrg, getMembership } from '../lib/orgService'
import {
  getOrCreateDM,
  createGroupChat,
  getOrCreateTeamChat,
  subscribeConversations,
  subscribeMessages,
  sendMessage as sendMessageApi,
  votePoll,
  endPoll,
  getOrgMembersForChat,
  getConversation,
  setTyping,
  subscribeTyping,
  clearTyping,
  markConversationRead,
  markMessagesDelivered,
  markMessagesRead,
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
} from '../components/ui/Icons'
import { MemberProfileModal } from '../components/member/MemberProfileModal'
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

function ChatListItem({ conv, title, avatar, isActive, lastPreview, lastTime, unreadCount, onClick, userDoc }) {
  const count = unreadCount || 0
  return (
    <li>
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
            {count > 0 && <span className="chats-list-unread">{count > 99 ? '99+' : count}</span>}
            {count === 0 && lastTime && <span className="chats-list-time">{formatTime(lastTime, userDoc)}</span>}
          </div>
          {lastPreview && <p className="chats-list-preview">{lastPreview}</p>}
        </div>
      </button>
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

  // Sync orgId from URL (ChatsPage only renders at /app/org/:orgId/chats)
  useEffect(() => {
    if (paramOrgId) setOrgId(paramOrgId)
  }, [paramOrgId])

  useEffect(() => {
    if (user) setLoading(false)
  }, [user])

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

  // Subscribe to conversations
  useEffect(() => {
    if (!orgId || !user?.uid) return
    return subscribeConversations(
      orgId,
      user.uid,
      (docs) => {
        setConversations(docs)
        setError('')
      },
      (err) => {
        setError(err?.message || 'Failed to load chats.')
      }
    )
  }, [orgId, user?.uid])

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

  // Mark conversation read when opening/viewing chat
  useEffect(() => {
    if (!orgId || !chatId || !user?.uid) return
    markConversationRead(orgId, chatId, user.uid).catch(() => {})
  }, [orgId, chatId, user?.uid])

  // Mark received messages as delivered, then read when viewing
  useEffect(() => {
    if (!orgId || !chatId || !user?.uid || !messages.length) return
    const toDeliver = messages.filter((m) => m.senderId !== user.uid && (m.status === 'sent' || !m.status))
    const toRead = messages.filter((m) => m.senderId !== user.uid && m.status === 'delivered')
    if (toDeliver.length) {
      markMessagesDelivered(orgId, chatId, toDeliver.map((m) => m.id)).catch(() => {})
    }
    if (toRead.length) {
      markMessagesRead(orgId, chatId, toRead.map((m) => m.id)).catch(() => {})
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

  const selectedConv = conversations.find((c) => c.id === chatId)

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

  const handleOpenChat = (id) => {
    navigate(`/app/org/${orgId}/chats/${id}`)
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    setError('')
    if (!messageText.trim() || !chatId || !user?.uid) return
    setSending(true)
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    typingDebounceRef.current = null
    try {
      await sendMessageApi(orgId, chatId, messageText.trim(), user.uid)
      setMessageText('')
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

  const sendWithAttachment = useCallback(async (attachment, text = '') => {
    if (!chatId || !user?.uid) return
    setError('')
    setSending(true)
    try {
      await sendMessageApi(orgId, chatId, text, user.uid, { attachment })
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
    sendTextMessage(`📎 Document: ${file.name}`)
  }, [sendTextMessage])

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
          <ul className="chats-list">
            {conversations.map((c) => (
              <ChatListItem
                key={c.id}
                conv={c}
                title={getConvTitle(c)}
                avatar={getConvAvatar(c)}
                isActive={c.id === chatId}
                lastPreview={c.lastMessagePreview}
                lastTime={c.lastMessageAt}
                unreadCount={c.unreadCount?.[user?.uid] ?? 0}
                onClick={() => handleOpenChat(c.id)}
                userDoc={userDoc}
              />
            ))}
            {conversations.length === 0 && <li className="chats-empty">No chats yet. Start a new one!</li>}
          </ul>
        </aside>
        <main className="chats-main">
          {chatId ? (
            <>
              <header className="chats-header">
                <h2
                  className={`chats-chat-name ${selectedConv?.type === CONV_TYPES.dm ? 'chats-chat-name-clickable' : ''}`}
                  onClick={selectedConv?.type === CONV_TYPES.dm ? () => {
                    const other = selectedConv.members?.find((id) => id !== user?.uid)
                    if (other) setProfileModalUserId(other)
                  } : undefined}
                  role={selectedConv?.type === CONV_TYPES.dm ? 'button' : undefined}
                  tabIndex={selectedConv?.type === CONV_TYPES.dm ? 0 : undefined}
                  onKeyDown={selectedConv?.type === CONV_TYPES.dm ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      const other = selectedConv.members?.find((id) => id !== user?.uid)
                      if (other) setProfileModalUserId(other)
                    }
                  } : undefined}
                >
                  {getConvTitle(selectedConv)}
                </h2>
                {(selectedConv?.type === CONV_TYPES.group || selectedConv?.type === CONV_TYPES.team) && (
                  <p className="chats-header-sub">{getMemberCount(selectedConv)} members</p>
                )}
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
              <div className="chats-messages" ref={messagesContainerRef}>
                {messages.length === 0 ? (
                  <p className="chats-messages-empty">No messages yet. Start the conversation!</p>
                ) : (
                  (() => {
                    const lastOwnIndex = messages.reduce((acc, m, idx) =>
                      m.senderId === user?.uid ? idx : acc, -1)
                    return messages.map((m, i) => {
                      const isOwn = m.senderId === user?.uid
                      const showStatus = isOwn && i === lastOwnIndex
                      const prev = messages[i - 1]
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
                      return (
                        <div key={m.id} className={`chats-message-row ${isOwn ? 'chats-message-own' : ''}`}>
                          <div className="chats-message-content">
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
                            <div className={`chats-bubble-wrap ${isOwn ? 'chats-bubble-own' : ''}`}>
                              {senderName && (
                                isOwn ? (
                                  <span className="chats-bubble-sender">{senderName}</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="chats-bubble-sender chats-bubble-sender-btn"
                                    onClick={() => setProfileModalUserId(m.senderId)}
                                  >
                                    {senderName}
                                  </button>
                                )
                              )}
                              <div className={`chats-bubble ${isOwn ? 'chats-bubble-own' : 'chats-bubble-other'}`}>
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
                              {m.attachment?.type !== 'poll' && m.text && <p className="chats-bubble-text">{m.text}</p>}
                              {ts && <span className="chats-bubble-time">{ts}</span>}
                            </div>
                          </div>
                            {isOwn && (
                              <div className="chats-message-avatar chats-message-avatar-own" title="You">
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setMessageImgErrors((e) => ({ ...e, [`${m.id}-avatar`]: true }))} />
                                ) : (
                                  <span className="chats-message-avatar-initial">{avatarInitial}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {showStatus && (
                            <span className="chats-bubble-status-below">
                              <MessageStatus status={m.status} />
                            </span>
                          )}
                        </div>
                      )
                    })
                  })()
                )}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSendMessage} className="chats-input-form" ref={attachmentMenuRef}>
                {error && <p className="auth-error">{error}</p>}
                <div className="chats-input-row">
                  <textarea
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
                    accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
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
          onOpenChat={handleOpenChat}
          userProfiles={userProfiles}
          setUserProfiles={setUserProfiles}
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
