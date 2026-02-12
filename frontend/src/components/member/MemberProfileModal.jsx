/**
 * Reusable member profile modal – used in Admin and Chats.
 * Shows avatar, name, email, role, org, teams, timezone, language, joined, last active.
 * Message button: getOrCreateDM and navigate to that chat.
 */
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMembership, canManageOrg, MEMBERSHIP_ROLES } from '../../lib/orgService'
import { getTeamsForUserInOrg } from '../../lib/teamService'
import { getUserDoc, getDisplayName, getProfilePictureUrl } from '../../lib/userService'
import { getOrCreateDM } from '../../lib/conversationService'
import { formatDate, getTimeZone, getLocale } from '../../lib/dateUtils'
import { MessageSquareIcon, CalendarIcon, SettingsIcon, ClockIcon, MailIcon, GlobeIcon, BuildingIcon, UsersIcon } from '../ui/Icons'
import './MemberProfileModal.css'

const TZ_LABELS = { 'America/New_York': 'Eastern (ET)', 'America/Chicago': 'Central (CT)', 'America/Denver': 'Mountain (MT)', 'America/Los_Angeles': 'Pacific (PT)', 'Europe/London': 'London (GMT/BST)', 'Europe/Paris': 'Paris (CET)', 'Asia/Tokyo': 'Tokyo (JST)', 'UTC': 'UTC' }
const LANG_MAP = { en: 'English', es: 'Spanish', fr: 'French', de: 'German' }

export function MemberProfileModal({
  userId,
  orgId,
  org,
  currentUser,
  myMembership,
  userDoc: initialUserDoc,
  memberData,
  onClose,
  showManage = false,
  onRoleChange,
  onRemoveMember,
  removeLabel = 'Remove from org',
}) {
  const navigate = useNavigate()
  const [userDoc, setUserDoc] = useState(initialUserDoc ?? null)
  const [targetMembership, setTargetMembership] = useState(null)
  const [teams, setTeams] = useState([])
  const [copied, setCopied] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [messageLoading, setMessageLoading] = useState(false)
  const manageRef = useRef(null)

  useEffect(() => {
    if (!userId || !orgId) return
    const load = async () => {
      const [doc, mem, teamList] = await Promise.all([
        initialUserDoc ? Promise.resolve(initialUserDoc) : getUserDoc(userId),
        getMembership(orgId, userId),
        getTeamsForUserInOrg(orgId, userId),
      ])
      setUserDoc(doc)
      setTargetMembership(mem)
      setTeams(teamList)
    }
    load()
  }, [userId, orgId, initialUserDoc])

  useEffect(() => {
    const handleClick = (e) => {
      if (manageRef.current && !manageRef.current.contains(e.target)) setManageOpen(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const handleCopyEmail = async () => {
    const email = (userDoc?.email || '').trim()
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleMessage = async () => {
    if (!currentUser?.uid || !orgId || !userId || userId === currentUser.uid) return
    setMessageLoading(true)
    try {
      const conv = await getOrCreateDM(orgId, currentUser.uid, userId)
      onClose?.()
      navigate(`/app/org/${orgId}/chats/${conv.id}`)
    } catch (err) {
      console.error('Failed to open DM:', err)
    } finally {
      setMessageLoading(false)
    }
  }

  const authUser = userId === currentUser?.uid ? currentUser : null
  const name = getDisplayName(userDoc, userId, authUser)
  const email = (userDoc?.email || authUser?.email || '').trim()
  const photoUrl = getProfilePictureUrl(userDoc, authUser)
  const initials = name ? name.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2) : email?.[0]?.toUpperCase() || '?'
  const displayRole = memberData?.role ?? targetMembership?.role
  const roleLabel = displayRole ? displayRole[0].toUpperCase() + displayRole.slice(1) : ''
  const timeZone = userDoc?.timeZone ? (TZ_LABELS[userDoc.timeZone] || userDoc.timeZone) : 'Browser default'
  const language = LANG_MAP[userDoc?.language] || userDoc?.language || '—'
  const memTz = getTimeZone(userDoc)
  const memLocale = getLocale(userDoc)
  const memDateOpts = { timeZone: memTz, locale: memLocale }
  const createdAt = memberData?.createdAt ?? (targetMembership?.createdAt?.toDate?.() ?? targetMembership?.createdAt)
  const joinedDate = createdAt ? formatDate(createdAt, { ...memDateOpts, year: 'numeric', month: 'short', day: 'numeric' }) : null
  const lastActive = userDoc?.lastActive?.toDate?.() ?? userDoc?.lastActive
  const lastActiveStr = lastActive ? formatDate(lastActive, { ...memDateOpts, month: 'short', day: 'numeric' }) : null

  const mRole = displayRole ?? targetMembership?.role
  const isOwner = mRole === MEMBERSHIP_ROLES.owner
  const isAdmin = mRole === MEMBERSHIP_ROLES.admin
  const isMember = mRole === MEMBERSHIP_ROLES.member
  const iAmOwner = myMembership?.role === MEMBERSHIP_ROLES.owner
  const iAmAdmin = myMembership?.role === MEMBERSHIP_ROLES.admin
  const canMakeAdmin = (iAmOwner && isMember) || (iAmAdmin && isMember)
  const canMakeMember = iAmOwner && isAdmin
  const canRemove = (iAmOwner && !isOwner) || (iAmAdmin && isMember)
  const isSelf = userId === currentUser?.uid

  return (
    <div className="member-profile-modal-backdrop" onClick={onClose}>
      <div className="member-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="member-profile-modal-header">
          <h4>Profile</h4>
          <button type="button" className="member-profile-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="member-profile-modal-body">
          <div className="member-profile-modal-top">
            <div className="member-profile-modal-avatar">
              {photoUrl ? (
                <img src={photoUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="member-profile-modal-initials">{initials}</span>
              )}
            </div>
            <div className="member-profile-modal-head">
              <p className="member-profile-modal-name">{name || email || 'Unknown'}</p>
              {roleLabel && <span className="member-profile-modal-role-badge">{roleLabel}</span>}
            </div>
          </div>

          <div className="member-profile-modal-meta">
            {email && (
              <div className="member-profile-modal-meta-item">
                <MailIcon size={16} className="member-profile-modal-meta-icon" />
                <div className="member-profile-modal-meta-content">
                  <span className="member-profile-modal-meta-label">Email</span>
                  <button type="button" className="member-profile-modal-email-copy" onClick={handleCopyEmail}>
                    {email}
                    {copied && <span className="member-profile-modal-copied"> · Copied</span>}
                  </button>
                </div>
              </div>
            )}
            <div className="member-profile-modal-meta-item">
              <ClockIcon size={16} className="member-profile-modal-meta-icon" />
              <div className="member-profile-modal-meta-content">
                <span className="member-profile-modal-meta-label">Time zone</span>
                <span className="member-profile-modal-meta-value">{timeZone}</span>
              </div>
            </div>
            <div className="member-profile-modal-meta-item">
              <GlobeIcon size={16} className="member-profile-modal-meta-icon" />
              <div className="member-profile-modal-meta-content">
                <span className="member-profile-modal-meta-label">Language</span>
                <span className="member-profile-modal-meta-value">{language}</span>
              </div>
            </div>
            {org && (
              <div className="member-profile-modal-meta-item">
                <BuildingIcon size={16} className="member-profile-modal-meta-icon" />
                <div className="member-profile-modal-meta-content">
                  <span className="member-profile-modal-meta-label">Organization</span>
                  <span className="member-profile-modal-meta-value">{org.name}</span>
                </div>
              </div>
            )}
            {teams.length > 0 && (
              <div className="member-profile-modal-meta-item">
                <UsersIcon size={16} className="member-profile-modal-meta-icon" />
                <div className="member-profile-modal-meta-content">
                  <span className="member-profile-modal-meta-label">Teams</span>
                  <span className="member-profile-modal-meta-value">{teams.map((t) => t.name).join(', ')}</span>
                </div>
              </div>
            )}
            {joinedDate && (
              <div className="member-profile-modal-meta-item">
                <CalendarIcon size={16} className="member-profile-modal-meta-icon" />
                <div className="member-profile-modal-meta-content">
                  <span className="member-profile-modal-meta-label">Joined</span>
                  <span className="member-profile-modal-meta-value">{joinedDate}</span>
                </div>
              </div>
            )}
            {lastActiveStr && (
              <div className="member-profile-modal-meta-item">
                <ClockIcon size={16} className="member-profile-modal-meta-icon" />
                <div className="member-profile-modal-meta-content">
                  <span className="member-profile-modal-meta-label">Last active</span>
                  <span className="member-profile-modal-meta-value">{lastActiveStr}</span>
                </div>
              </div>
            )}
          </div>

          <div className="member-profile-modal-actions">
            <button
              type="button"
              className="member-profile-modal-btn member-profile-modal-btn-primary"
              onClick={handleMessage}
              disabled={messageLoading || userId === currentUser?.uid}
            >
              <MessageSquareIcon size={18} />
              <span>{messageLoading ? 'Opening…' : 'Message'}</span>
            </button>
            <Link
              to="/app/calendar"
              className="member-profile-modal-btn member-profile-modal-btn-primary"
              onClick={onClose}
            >
              <CalendarIcon size={18} />
              <span>Schedule</span>
            </Link>
            {showManage && (
              <div className="member-profile-modal-manage-wrapper" ref={manageRef}>
                <button
                  type="button"
                  className="member-profile-modal-btn member-profile-modal-btn-manage"
                  onClick={(e) => { e.stopPropagation(); setManageOpen(!manageOpen) }}
                >
                  <SettingsIcon size={18} />
                  <span>Manage</span>
                </button>
                {manageOpen && (
                  <div className="member-profile-modal-manage-panel">
                    {canMakeAdmin && (
                      <button
                        type="button"
                        className="member-profile-modal-manage-item"
                        onClick={() => {
                          setManageOpen(false)
                          onRoleChange?.(userId, MEMBERSHIP_ROLES.admin)
                        }}
                      >
                        Make admin
                      </button>
                    )}
                    {canMakeMember && (
                      <button
                        type="button"
                        className="member-profile-modal-manage-item"
                        onClick={() => {
                          setManageOpen(false)
                          onRoleChange?.(userId, MEMBERSHIP_ROLES.member)
                        }}
                      >
                        Make member
                      </button>
                    )}
                    <Link
                      to={`/app/org/${orgId}/admin`}
                      className="member-profile-modal-manage-item"
                      onClick={() => { setManageOpen(false); onClose?.() }}
                    >
                      Add to team
                    </Link>
                    {canRemove && !isSelf && (
                      <button
                        type="button"
                        className="member-profile-modal-manage-item member-profile-modal-manage-item-danger"
                        onClick={() => {
                          onRemoveMember?.(userId)
                          setManageOpen(false)
                          onClose?.()
                        }}
                      >
                        {removeLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
