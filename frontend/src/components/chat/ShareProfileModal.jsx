/**
 * Share a user's profile with another org member.
 */
import { useState, useEffect } from 'react'
import { getOrgMembersForChat } from '../../lib/conversationService'
import { getOrCreateDM } from '../../lib/conversationService'
import { sendMessage } from '../../lib/conversationService'
import { getUserDoc, getDisplayName, getProfilePictureUrl } from '../../lib/userService'
import { XIcon } from '../ui/Icons'
import './ShareProfileModal.css'

export function ShareProfileModal({
  orgId,
  currentUserId,
  profileUserId,
  profileUserName,
  onClose,
}) {
  const [members, setMembers] = useState([])
  const [profiles, setProfiles] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(null)

  useEffect(() => {
    if (!orgId || !currentUserId) return
    getOrgMembersForChat(orgId, currentUserId).then(async (list) => {
      const filtered = list.filter((m) => m.userId !== profileUserId && m.userId !== currentUserId)
      setMembers(filtered)
      const loaded = {}
      await Promise.all(filtered.map(async (m) => {
        try {
          loaded[m.userId] = await getUserDoc(m.userId)
        } catch {
          loaded[m.userId] = null
        }
      }))
      setProfiles(loaded)
    })
  }, [orgId, currentUserId, profileUserId])

  const filtered = members.filter((m) => {
    const p = profiles[m.userId]
    const name = p ? getDisplayName(p, m.userId).toLowerCase() : ''
    const email = (p?.email || '').toLowerCase()
    const q = search.trim().toLowerCase()
    if (!q) return true
    return name.includes(q) || email.includes(q)
  })

  const handleShare = async (targetUserId) => {
    if (!orgId || !currentUserId || !profileUserId || !targetUserId) return
    setSending(targetUserId)
    try {
      const conv = await getOrCreateDM(orgId, currentUserId, targetUserId)
      await sendMessage(orgId, conv.id, `Profile shared: ${profileUserName}. View their profile from the org.`, currentUserId)
      onClose?.()
    } catch (err) {
      console.error('Share failed:', err)
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="share-profile-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="share-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-profile-header">
          <h3>Share profile</h3>
          <button type="button" className="share-profile-close" onClick={onClose} aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
        <p className="share-profile-desc">Share {profileUserName}&apos;s profile with:</p>
        <input
          type="text"
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="share-profile-input"
        />
        <ul className="share-profile-list">
          {filtered.map((m) => (
            <li key={m.userId}>
              <button
                type="button"
                className="share-profile-member"
                onClick={() => handleShare(m.userId)}
                disabled={sending !== null}
              >
                <div className="share-profile-avatar">
                  {(() => {
                    const p = profiles[m.userId]
                    const url = getProfilePictureUrl(p)
                    if (url) return <img src={url} alt="" referrerPolicy="no-referrer" />
                    return <span>{getDisplayName(p, m.userId)[0]?.toUpperCase() || '?'}</span>
                  })()}
                </div>
                <span className="share-profile-name">{getDisplayName(profiles[m.userId], m.userId)}</span>
                {sending === m.userId && <span className="share-profile-sending">Sharing…</span>}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="share-profile-empty">No members found.</li>}
        </ul>
      </div>
    </div>
  )
}
