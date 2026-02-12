import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate, useOutletContext } from 'react-router-dom'
import { getOrg, getMembership } from '../lib/orgService'
import {
  getTeam,
  getTeamMembership,
  getTeamMembers,
  getPendingTeamRequests,
  getRejectedTeamRequests,
  updateTeamMembershipState,
  updateTeamMembershipRole,
  removeTeamMember,
  updateTeam,
  canManageTeam,
  canAccessTeam,
  TEAM_STATES,
  TEAM_ROLES,
} from '../lib/teamService'
import { createTeamInvitation, getRejectedTeamInvitations } from '../lib/teamInvitationService'
import { getUserDoc, getDisplayName, getMemberDisplayLine, getProfilePictureUrl } from '../lib/userService'
import { createMeeting, getTeamMeetings, MEETING_SCOPES } from '../lib/meetingService'
import { compressImageToDataUrl } from '../lib/imageUtils'
import { UsersIcon, PencilIcon, ArrowLeftIcon, SettingsIcon, XIcon, MoreVerticalIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './AppDashboardPage.css'
import './OrgPage.css'
import './OrgAdminPage.css'
import './Dashboard.css'
import './ProfilePage.css'
import './OrgProfilePage.css'
import { MemberProfileModal } from '../components/member/MemberProfileModal'

export function TeamPage() {
  const { orgId, teamId } = useParams()
  const navigate = useNavigate()
  const { user, setNavExtra } = useOutletContext() || {}
  const [org, setOrg] = useState(null)
  const [orgMembership, setOrgMembership] = useState(null)
  const [team, setTeam] = useState(null)
  const [teamMembership, setTeamMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [rejected, setRejected] = useState([])
  const [rejectedInvitations, setRejectedInvitations] = useState([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberMenuOpen, setMemberMenuOpen] = useState(null)
  const [profileModalMember, setProfileModalMember] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [userProfiles, setUserProfiles] = useState({})
  const [showCreateMeeting, setShowCreateMeeting] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [meetingError, setMeetingError] = useState('')
  const [loading, setLoading] = useState({})
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [savingOpenJoin, setSavingOpenJoin] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsAllowOpenJoin, setSettingsAllowOpenJoin] = useState(false)
  const imageInputRef = useRef(null)
  const memberMenuRef = useRef(null)

  useEffect(() => {
    if (!user || !orgId || !teamId) return
    const load = async () => {
      const [orgData, orgMem, teamData, teamMem] = await Promise.all([
        getOrg(orgId),
        getMembership(orgId, user.uid),
        getTeam(orgId, teamId),
        getTeamMembership(orgId, teamId, user.uid),
      ])
      if (!orgData || !orgMem || orgMem.state !== 'active') {
        navigate(`/app/org/${orgId}`)
        return
      }
      if (!teamData) {
        navigate(`/app/org/${orgId}`)
        return
      }
      if (!canAccessTeam(teamMem, orgMem)) {
        navigate(`/app/org/${orgId}`)
        return
      }
      setOrg(orgData)
      setOrgMembership(orgMem)
      setTeam(teamData)
      setTeamMembership(teamMem)
    }
    load()
  }, [user, orgId, teamId, navigate])

  useEffect(() => {
    if (!orgId || !teamId) return
    const load = async () => {
      const [membersData, pendingData, rejectedData, rejectedInvs] = await Promise.all([
        getTeamMembers(orgId, teamId),
        getPendingTeamRequests(orgId, teamId),
        getRejectedTeamRequests(orgId, teamId),
        getRejectedTeamInvitations(orgId, teamId).catch(() => []),
      ])
      setMembers(membersData.filter((m) => m.state === TEAM_STATES.active))
      setPending(pendingData)
      setRejected(rejectedData)
      setRejectedInvitations(rejectedInvs)
      const userIds = [...new Set([
        ...membersData.map((m) => m.userId),
        ...pendingData.map((p) => p.userId),
        ...rejectedData.map((r) => r.userId),
      ])]
      const profiles = {}
      await Promise.all(userIds.map(async (uid) => {
        profiles[uid] = await getUserDoc(uid)
      }))
      setUserProfiles(profiles)
    }
    load()
  }, [orgId, teamId])

  useEffect(() => {
    if (!orgId || !teamId) return
    const load = async () => {
      const list = await getTeamMeetings(orgId, teamId)
      setMeetings(list)
    }
    load()
  }, [orgId, teamId])

  const handleCreateMeeting = async (e) => {
    e.preventDefault()
    setMeetingError('')
    if (!newMeetingTitle.trim()) return
    setCreatingMeeting(true)
    try {
      await createMeeting(orgId, {
        title: newMeetingTitle.trim(),
        scope: MEETING_SCOPES.team,
        scopeTeamId: teamId,
      }, user.uid)
      setShowCreateMeeting(false)
      setNewMeetingTitle('')
      const list = await getTeamMeetings(orgId, teamId)
      setMeetings(list)
    } catch (err) {
      setMeetingError(err.message || 'Failed to create meeting.')
    } finally {
      setCreatingMeeting(false)
    }
  }

  const handleApprove = async (userId) => {
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateTeamMembershipState(orgId, teamId, userId, TEAM_STATES.active)
      setPending((p) => p.filter((m) => m.userId !== userId))
      setMembers((m) => [...m, { userId, role: 'member', state: TEAM_STATES.active }])
      const profile = await getUserDoc(userId)
      setUserProfiles((p) => ({ ...p, [userId]: profile }))
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleReject = async (userId) => {
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateTeamMembershipState(orgId, teamId, userId, TEAM_STATES.rejected)
      setPending((p) => p.filter((m) => m.userId !== userId))
      setRejected((r) => [...r, { userId }])
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleChangeRole = async (userId, newRole) => {
    setMemberMenuOpen(null)
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateTeamMembershipRole(orgId, teamId, userId, newRole, user.uid)
      setMembers((m) => m.map((x) => (x.userId === userId ? { ...x, role: newRole } : x)))
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleRemoveMember = async (userId) => {
    setMemberMenuOpen(null)
    if (!window.confirm('Remove this member from the team?')) return
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await removeTeamMember(orgId, teamId, userId, user.uid)
      setMembers((m) => m.filter((x) => x.userId !== userId))
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const startEditDesc = () => {
    setEditDesc(team?.description || '')
    setIsEditingDesc(true)
    setInviteError('')
  }

  const saveDesc = async (e) => {
    e?.preventDefault()
    setSavingDesc(true)
    setInviteError('')
    try {
      await updateTeam(orgId, teamId, { description: editDesc }, user.uid)
      setTeam((t) => (t ? { ...t, description: editDesc } : null))
      setIsEditingDesc(false)
    } catch (err) {
      setInviteError(err?.message || 'Failed to save.')
    } finally {
      setSavingDesc(false)
    }
  }

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
    setUploadingImage(true)
    setInviteError('')
    try {
      const dataUrl = await compressImageToDataUrl(file)
      await updateTeam(orgId, teamId, { imageUrl: dataUrl }, user.uid)
      setTeam((t) => (t ? { ...t, imageUrl: dataUrl } : null))
    } catch (err) {
      setInviteError(err?.message || 'Failed to upload image.')
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const handleRemoveImage = async () => {
    setUploadingImage(true)
    setInviteError('')
    try {
      await updateTeam(orgId, teamId, { imageUrl: null }, user.uid)
      setTeam((t) => (t ? { ...t, imageUrl: null } : null))
    } catch (err) {
      setInviteError(err?.message || 'Failed to remove image.')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleToggleOpenJoin = async (e) => {
    const next = e.target.checked
    setSavingOpenJoin(true)
    setInviteError('')
    try {
      await updateTeam(orgId, teamId, { allowOpenJoin: next }, user.uid)
      setTeam((t) => (t ? { ...t, allowOpenJoin: next } : null))
    } catch (err) {
      setInviteError(err?.message || 'Failed to update.')
    } finally {
      setSavingOpenJoin(false)
    }
  }

  const handleSaveSettings = async (e) => {
    e?.preventDefault()
    if (settingsAllowOpenJoin === !!team?.allowOpenJoin) {
      setShowSettingsModal(false)
      return
    }
    setSavingOpenJoin(true)
    setInviteError('')
    try {
      await updateTeam(orgId, teamId, { allowOpenJoin: settingsAllowOpenJoin }, user.uid)
      setTeam((t) => (t ? { ...t, allowOpenJoin: settingsAllowOpenJoin } : null))
      setShowSettingsModal(false)
    } catch (err) {
      setInviteError(err?.message || 'Failed to update.')
    } finally {
      setSavingOpenJoin(false)
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    const email = inviteEmail.trim()
    if (!email) {
      setInviteError('Enter an email address.')
      return
    }
    setInviteLoading(true)
    try {
      const inviterProfile = userProfiles[user?.uid] || null
      const inviterLabel = getMemberDisplayLine(inviterProfile, user?.uid, user, null)
      await createTeamInvitation(
        orgId,
        teamId,
        email,
        user.uid,
        inviterLabel || getDisplayName(inviterProfile, user?.uid),
        inviterProfile?.email || user?.email || '',
        team?.name || 'Team',
        org?.name || 'Organization'
      )
      setInviteSuccess(`Invitation sent to ${email}.`)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err?.message || 'Failed to send invitation.')
    } finally {
      setInviteLoading(false)
    }
  }

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  useEffect(() => {
    if (showSettingsModal && team) {
      setSettingsAllowOpenJoin(!!team.allowOpenJoin)
    }
  }, [showSettingsModal, team])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (memberMenuRef.current && !memberMenuRef.current.contains(e.target)) {
        setMemberMenuOpen(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const memberSearchLower = memberSearch.trim().toLowerCase()
  const filteredMembers = memberSearchLower
    ? members.filter((m) => {
        const profile = userProfiles[m.userId]
        const authUserForDisplay = m.userId === user?.uid ? user : null
        const fullName = (getDisplayName(profile, m.userId, authUserForDisplay) || '').toLowerCase()
        const email = ((profile?.email || authUserForDisplay?.email) || '').toLowerCase()
        return fullName.includes(memberSearchLower) || email.includes(memberSearchLower)
      })
    : members

  if (!org || !team) return null

  const isAdmin = canManageTeam(teamMembership, orgMembership)

  return (
    <main className="app-main org-admin-main profile-main team-profile-main">
      <Link to={`/app/org/${orgId}`} className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back to {org?.name}
      </Link>
      <div className="profile-header team-profile-header">
        <section className="profile-hero org-profile-hero">
          {isAdmin && (
            <button
              type="button"
              className="team-settings-btn"
              onClick={() => setShowSettingsModal(true)}
              title="Team settings"
              aria-label="Team settings"
            >
              <SettingsIcon size={20} />
            </button>
          )}
          <div className="profile-hero-inner">
            <div className="team-profile-avatar-block">
              <div className="org-profile-avatar-wrap">
                {team.imageUrl ? (
                  <img src={team.imageUrl} alt="" className="org-profile-avatar" />
                ) : (
                  <div className="profile-avatar-placeholder org-profile-avatar-placeholder">
                    <UsersIcon size={40} className="profile-team-icon" />
                  </div>
                )}
                {isAdmin && (
                  <>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="profile-file-input"
                      disabled={uploadingImage}
                    />
                    <button
                      type="button"
                      className="profile-avatar-btn org-profile-avatar-btn"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                      title="Change photo"
                      aria-label="Change photo"
                    >
                      <PencilIcon size={16} />
                    </button>
                  </>
                )}
              </div>
              {isAdmin && team.imageUrl && (
                <button
                  type="button"
                  className="org-profile-remove-photo"
                  onClick={handleRemoveImage}
                  disabled={uploadingImage}
                >
                  Remove photo
                </button>
              )}
            </div>
            <h2 className="profile-hero-name org-profile-name">{team.name}</h2>
            {org && <span className="profile-badge profile-badge-org">{org.name}</span>}
            {team.allowOpenJoin && <span className="profile-badge">Open to join</span>}
            <div className="profile-card-header" style={{ marginTop: 0, marginBottom: 0, width: '100%', justifyContent: 'center' }}>
              <h3 className="profile-card-title" style={{ margin: 0 }}>About</h3>
              {isAdmin && !isEditingDesc && (
                <button type="button" className="profile-pencil-btn" onClick={startEditDesc} title="Edit" aria-label="Edit">
                  <PencilIcon size={16} />
                </button>
              )}
            </div>
            {isEditingDesc ? (
              <form onSubmit={saveDesc} style={{ width: '100%' }}>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Team description…"
                  className="profile-input"
                  rows={3}
                  disabled={savingDesc}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div className="profile-save-row" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button type="button" className="profile-btn profile-btn-ghost" onClick={() => setIsEditingDesc(false)}>Cancel</button>
                  <button type="submit" className="profile-btn profile-btn-primary" disabled={savingDesc}>{savingDesc ? 'Saving…' : 'Save'}</button>
                </div>
              </form>
            ) : (
              <p className="profile-hero-meta" style={{ margin: 0, textAlign: 'left', width: '100%' }}>
                {team.description || 'No description yet.'}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Team settings modal */}
      {showSettingsModal && (
        <div
          className="team-settings-overlay"
          onClick={() => setShowSettingsModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="team-settings-title"
        >
          <div
            className="team-settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="team-settings-modal-header">
              <h3 id="team-settings-title">
                <SettingsIcon size={20} />
                Team settings
              </h3>
              <button
                type="button"
                className="team-settings-close"
                onClick={() => setShowSettingsModal(false)}
                aria-label="Close"
              >
                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSettings} className="team-settings-modal-body">
              <label className="profile-pref-row team-settings-row">
                <span>Allow anyone in the organization to join without an invite</span>
                <input
                  type="checkbox"
                  className="team-settings-checkbox"
                  checked={settingsAllowOpenJoin}
                  onChange={(e) => setSettingsAllowOpenJoin(e.target.checked)}
                  disabled={savingOpenJoin}
                />
              </label>
              <div className="team-settings-actions">
                <button
                  type="button"
                  className="profile-btn profile-btn-ghost"
                  onClick={() => setShowSettingsModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="profile-btn profile-btn-primary"
                  disabled={savingOpenJoin || settingsAllowOpenJoin === !!team?.allowOpenJoin}
                >
                  {savingOpenJoin ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite to team (admins only) */}
      {isAdmin && (
        <section className="profile-card">
          <h3 className="profile-card-title">Invite to team</h3>
          <form onSubmit={handleInvite} className="org-admin-invite-form">
            <input
              type="email"
              placeholder="Org member email (only people in the organization)"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess(''); }}
              className="org-admin-invite-input"
              disabled={inviteLoading}
            />
            <button type="submit" className="org-admin-btn org-admin-btn-approve" disabled={inviteLoading}>
              {inviteLoading ? 'Sending…' : 'Send invitation'}
            </button>
          </form>
          <p className="org-admin-invite-hint">Only people who are already in the organization can be invited to the team.</p>
          {inviteError && <p className="org-admin-error">{inviteError}</p>}
          {inviteSuccess && <p className="org-admin-success">{inviteSuccess}</p>}
        </section>
      )}

      {/* Meetings */}
      <section className="profile-card">
        <h3 className="profile-card-title">Meetings</h3>
        <p className="app-muted" style={{ marginBottom: '1rem' }}>Team-scoped meetings (visible to team members).</p>
        {teamMembership?.state === TEAM_STATES.active && (
          <div style={{ marginBottom: '1rem' }}>
            {!showCreateMeeting ? (
              <button
                type="button"
                className="org-admin-btn"
                onClick={() => setShowCreateMeeting(true)}
              >
                Create meeting
              </button>
            ) : (
              <form onSubmit={handleCreateMeeting} className="org-create-team-form">
                <input
                  type="text"
                  placeholder="Meeting title"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  className="auth-input"
                  disabled={creatingMeeting}
                />
                {meetingError && <p className="auth-error">{meetingError}</p>}
                <div className="org-create-team-btns">
                  <button
                    type="submit"
                    className="org-admin-btn org-admin-btn-approve"
                    disabled={creatingMeeting}
                  >
                    {creatingMeeting ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    className="org-admin-btn"
                    onClick={() => { setShowCreateMeeting(false); setMeetingError(''); setNewMeetingTitle(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {meetings.length === 0 ? (
          <p className="app-muted">No team meetings yet.</p>
        ) : (
          <ul className="meeting-list" style={{ marginBottom: 0 }}>
            {meetings.map((m) => (
              <li key={m.id} className="meeting-item">
                <span className="meeting-title">{m.title}</span>
                <span className="meeting-meta">{m.scope}</span>
              </li>
            ))}
            </ul>
        )}
      </section>

        {isAdmin && pending.length > 0 && (
          <section className="org-admin-section profile-card">
            <h3 className="profile-card-title">Pending join requests</h3>
            <ul className="member-list">
              {pending.map((req) => {
                const profile = userProfiles[req.userId]
                const authUserForDisplay = req.userId === user?.uid ? user : null
                const fullName = getDisplayName(profile, req.userId, authUserForDisplay)
                const email = (profile?.email || authUserForDisplay?.email || '').trim()
                const showEmail = email && fullName !== email
                const photoUrl = getProfilePictureUrl(profile, authUserForDisplay)
                const initials = fullName ? fullName.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2) : email?.[0]?.toUpperCase() || '?'
                return (
                  <li key={req.userId} className="member-card member-card-pending">
                    <div className="member-card-avatar">
                      {photoUrl ? (
                        <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                      ) : null}
                      <span className="member-card-initials" style={{ display: photoUrl ? 'none' : 'flex' }}>{initials}</span>
                    </div>
                    <div className="member-card-info">
                      <span className="member-card-name">{fullName || email}</span>
                      {showEmail && <span className="member-card-email">{email}</span>}
                      <span className="member-card-role">pending</span>
                    </div>
                    <div className="org-admin-actions">
                      <button
                        className="org-admin-btn org-admin-btn-approve"
                        onClick={() => handleApprove(req.userId)}
                        disabled={loading[req.userId]}
                      >
                        {loading[req.userId] ? '…' : 'Approve'}
                      </button>
                      <button
                        className="org-admin-btn org-admin-btn-reject"
                        onClick={() => handleReject(req.userId)}
                        disabled={loading[req.userId]}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {(isAdmin && rejected.length > 0) && (
          <section className="org-admin-section profile-card">
            <h3 className="profile-card-title">Rejected join requests</h3>
            <ul className="member-list">
              {rejected.map((req) => {
                const profile = userProfiles[req.userId]
                const fullName = getDisplayName(profile, req.userId)
                const email = (profile?.email || '').trim()
                return (
                  <li key={req.userId} className="member-card member-card-rejected">
                    <div className="member-card-avatar">
                      <span className="member-card-initials">{(fullName || email || '?')[0]?.toUpperCase()}</span>
                    </div>
                    <div className="member-card-info">
                      <span className="member-card-name">{fullName || email || `User ${req.userId.slice(0, 8)}…`}</span>
                      {email && fullName !== email && <span className="member-card-email">{email}</span>}
                      <span className="member-card-role member-card-role-rejected">rejected</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {(isAdmin && rejectedInvitations.length > 0) && (
          <section className="org-admin-section profile-card">
            <h3 className="profile-card-title">Rejected invitations</h3>
            <ul className="member-list">
              {rejectedInvitations.map((inv) => (
                <li key={inv.id} className="member-card member-card-rejected">
                  <div className="member-card-avatar">
                    <span className="member-card-initials">{(inv.inviteeEmail || '?')[0]?.toUpperCase()}</span>
                  </div>
                  <div className="member-card-info">
                    <span className="member-card-name">{inv.inviteeEmail || 'Unknown email'}</span>
                    <span className="member-card-role member-card-role-rejected">declined invite</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="org-admin-section profile-card org-admin-section-wide">
          <h3 className="profile-card-title">Members</h3>
          <input
            type="text"
            placeholder="Search members by name or email…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="org-admin-invite-input org-admin-search-input"
            style={{ marginBottom: '0.75rem' }}
          />
          <ul className="member-list">
            {filteredMembers.map((m) => {
              const profile = userProfiles[m.userId]
              const authUserForDisplay = m.userId === user?.uid ? user : null
              const fullName = getDisplayName(profile, m.userId, authUserForDisplay)
              const email = (profile?.email || authUserForDisplay?.email || '').trim()
              const showEmail = email && fullName !== email
              const photoUrl = getProfilePictureUrl(profile, authUserForDisplay)
              const initials = fullName ? fullName.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2) : email?.[0]?.toUpperCase() || '?'
              const isTeamAdmin = m.role === TEAM_ROLES.admin
              const isTeamMember = m.role === TEAM_ROLES.member
              const iAmTeamAdmin = teamMembership?.role === TEAM_ROLES.admin
              const iAmOrgAdmin = orgMembership?.role === 'owner' || orgMembership?.role === 'admin'
              const canMakeAdmin = (iAmTeamAdmin || iAmOrgAdmin) && isTeamMember
              const canMakeMember = (iAmTeamAdmin || iAmOrgAdmin) && isTeamAdmin
              const canRemove = (iAmTeamAdmin || iAmOrgAdmin) && m.userId !== user?.uid
              const isSelf = m.userId === user?.uid
              return (
                <li key={m.userId} className="member-card">
                  <div className="member-card-avatar">
                    {photoUrl ? (
                      <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                    ) : null}
                    <span className="member-card-initials" style={{ display: photoUrl ? 'none' : 'flex' }}>{initials}</span>
                  </div>
                  <div className="member-card-info">
                    <span className="member-card-name">{fullName || email}</span>
                    {showEmail && <span className="member-card-email">{email}</span>}
                    <span className="member-card-role">{m.role}</span>
                  </div>
                  {!isSelf && (canMakeAdmin || canMakeMember || canRemove) && (
                    <div
                      className="member-card-menu-wrapper"
                      ref={memberMenuOpen === m.userId ? memberMenuRef : undefined}
                    >
                      <button
                        type="button"
                        className="member-card-menu-trigger"
                        onClick={(e) => { e.stopPropagation(); setMemberMenuOpen(memberMenuOpen === m.userId ? null : m.userId) }}
                        disabled={loading[m.userId]}
                        title="Options"
                        aria-label="Member options"
                      >
                        <MoreVerticalIcon size={18} />
                      </button>
                      {memberMenuOpen === m.userId && (
                        <div className="member-card-menu-panel">
                          <button
                            type="button"
                            className="member-card-menu-item"
                            onClick={() => { setMemberMenuOpen(null); setProfileModalMember(m) }}
                          >
                            Profile
                          </button>
                          {canMakeAdmin && (
                            <button
                              type="button"
                              className="member-card-menu-item"
                              onClick={() => handleChangeRole(m.userId, TEAM_ROLES.admin)}
                            >
                              Make admin
                            </button>
                          )}
                          {canMakeMember && (
                            <button
                              type="button"
                              className="member-card-menu-item"
                              onClick={() => handleChangeRole(m.userId, TEAM_ROLES.member)}
                            >
                              Make member
                            </button>
                          )}
                          {canRemove && (
                            <button
                              type="button"
                              className="member-card-menu-item member-card-menu-item-danger"
                              onClick={() => handleRemoveMember(m.userId)}
                            >
                              Remove from team
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {memberSearch && filteredMembers.length === 0 && (
            <p className="app-muted">No members match "{memberSearch}"</p>
          )}
        </section>

        {profileModalMember && (
          <MemberProfileModal
            userId={profileModalMember.userId}
            orgId={orgId}
            org={org}
            currentUser={user}
            myMembership={orgMembership}
            userDoc={userProfiles[profileModalMember.userId]}
            memberData={{ role: profileModalMember.role }}
            onClose={() => setProfileModalMember(null)}
          />
        )}
    </main>
  )
}
