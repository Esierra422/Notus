import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate, useOutletContext } from 'react-router-dom'
import {
  getOrg,
  getMembership,
  membershipHasCapability,
  getOrgMembers,
  getMembershipDisplayTitle,
  canManageOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
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
import {
  createMeeting,
  getUpcomingTeamMeetingsForUser,
  MEETING_SCOPES,
  MEETING_CREATED_VIA,
} from '../lib/meetingService'
import { compressImageToDataUrl } from '../lib/imageUtils'
import { formatMeetingRowWhen } from '../lib/dateUtils'
import { EventDetailModal } from '../components/calendar/EventDetailModal'
import {
  UsersIcon,
  PencilIcon,
  ArrowLeftIcon,
  SettingsIcon,
  XIcon,
  MoreVerticalIcon,
  CalendarIcon,
  VideoIcon,
  MessageSquareIcon,
  BuildingIcon,
} from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './OrgPage.css'
import './OrgAdminPage.css'
import './Dashboard.css'
import './OrgProfilePage.css'
import './TeamDashboard.css'
import { MemberProfileModal } from '../components/member/MemberProfileModal'

export function TeamPage() {
  const { orgId, teamId } = useParams()
  const navigate = useNavigate()
  const { user, userDoc, setNavExtra } = useOutletContext() || {}
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
  const [memberManageOpen, setMemberManageOpen] = useState(null)
  const [profileModalMember, setProfileModalMember] = useState(null)
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [upcomingMeetingsLoading, setUpcomingMeetingsLoading] = useState(true)
  const [eventDetailItem, setEventDetailItem] = useState(null)
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
  /** userId -> org membership fields for card labels */
  const [orgMemberMeta, setOrgMemberMeta] = useState({})
  const imageInputRef = useRef(null)
  const bannerInputRef = useRef(null)
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
    if (
      !orgId ||
      !teamId ||
      !org ||
      org.id !== orgId ||
      !team ||
      team.id !== teamId ||
      !orgMembership ||
      orgMembership.orgId !== orgId ||
      orgMembership.state !== MEMBERSHIP_STATES.active ||
      !canAccessTeam(teamMembership, orgMembership)
    ) {
      setMembers([])
      setPending([])
      setRejected([])
      setRejectedInvitations([])
      setOrgMemberMeta({})
      setUserProfiles({})
      return
    }
    const load = async () => {
      const [membersData, pendingData, rejectedData, rejectedInvs, orgMembersList] = await Promise.all([
        getTeamMembers(orgId, teamId),
        getPendingTeamRequests(orgId, teamId),
        getRejectedTeamRequests(orgId, teamId),
        getRejectedTeamInvitations(orgId, teamId).catch(() => []),
        getOrgMembers(orgId),
      ])
      const meta = {}
      for (const om of orgMembersList) {
        if (om.state === MEMBERSHIP_STATES.active) {
          meta[om.userId] = { displayRoleName: om.displayRoleName, role: om.role }
        }
      }
      setOrgMemberMeta(meta)
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
  }, [orgId, teamId, org, team, orgMembership, teamMembership])

  const reloadUpcomingMeetings = useCallback(async () => {
    if (!orgId || !teamId || !user?.uid) {
      setUpcomingMeetings([])
      setUpcomingMeetingsLoading(false)
      return
    }
    setUpcomingMeetingsLoading(true)
    try {
      const list = await getUpcomingTeamMeetingsForUser(user.uid, orgId, teamId)
      setUpcomingMeetings(list)
    } finally {
      setUpcomingMeetingsLoading(false)
    }
  }, [orgId, teamId, user?.uid])

  useEffect(() => {
    reloadUpcomingMeetings()
  }, [reloadUpcomingMeetings])

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
        createdVia: MEETING_CREATED_VIA.calendar,
      }, user.uid)
      setShowCreateMeeting(false)
      setNewMeetingTitle('')
      await reloadUpcomingMeetings()
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
      const [profile, om] = await Promise.all([getUserDoc(userId), getMembership(orgId, userId)])
      setUserProfiles((p) => ({ ...p, [userId]: profile }))
      if (om) {
        setOrgMemberMeta((prev) => ({
          ...prev,
          [userId]: { displayRoleName: om.displayRoleName, role: om.role },
        }))
      }
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

  const handleBannerChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
    setUploadingImage(true)
    setInviteError('')
    try {
      const dataUrl = await compressImageToDataUrl(file)
      await updateTeam(orgId, teamId, { bannerUrl: dataUrl }, user.uid)
      setTeam((t) => (t ? { ...t, bannerUrl: dataUrl } : null))
    } catch (err) {
      setInviteError(err?.message || 'Failed to upload banner.')
    } finally {
      setUploadingImage(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  const handleRemoveBanner = async () => {
    setUploadingImage(true)
    setInviteError('')
    try {
      await updateTeam(orgId, teamId, { bannerUrl: null }, user.uid)
      setTeam((t) => (t ? { ...t, bannerUrl: null } : null))
    } catch (err) {
      setInviteError(err?.message || 'Failed to remove banner.')
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
        setMemberManageOpen(null)
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

  if (!org || org.id !== orgId || !team || team.id !== teamId) return null

  const isAdmin =
    canManageTeam(teamMembership, orgMembership) ||
    membershipHasCapability(orgMembership, 'manageTeams')
  const canCreateTeamMeeting =
    orgMembership &&
    membershipHasCapability(orgMembership, 'scheduleTeamMeetings') &&
    membershipHasCapability(orgMembership, 'teamCalendar')

  const isOrgAdmin = canManageOrg(orgMembership)
  const teamRoleLabel = (tm) => (tm.role === TEAM_ROLES.admin ? 'Team admin' : 'Team member')

  return (
    <main className="app-main dashboard-main org-dashboard-main team-dashboard-main">
      <Link to={`/app/org/${orgId}`} className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back to {org?.name}
      </Link>

      <div className="dashboard-overview">
        <section className="dashboard-enterprise-hero team-dashboard-enterprise-hero">
          <div
            className={`dashboard-enterprise-banner${team.bannerUrl ? ' dashboard-enterprise-banner--image' : ''}`}
            style={team.bannerUrl ? { backgroundImage: `url(${team.bannerUrl})` } : undefined}
            role="img"
            aria-label=""
          >
            {isAdmin && (
              <>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBannerChange}
                  className="profile-file-input"
                  disabled={uploadingImage}
                />
                <button
                  type="button"
                  className="dashboard-enterprise-banner-edit"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={uploadingImage}
                  title="Change cover image"
                  aria-label="Change cover image"
                >
                  <PencilIcon size={16} />
                </button>
              </>
            )}
          </div>
          <div className="dashboard-enterprise-hero-body">
            <div className="dashboard-enterprise-hero-main">
              <div className="dashboard-enterprise-avatar-col">
                <div className="org-profile-avatar-wrap team-dashboard-enterprise-avatar-wrap">
                  {team.imageUrl ? (
                    <img src={team.imageUrl} alt="" className="dashboard-enterprise-avatar" />
                  ) : (
                    <div className="profile-avatar-placeholder org-profile-avatar-placeholder dashboard-enterprise-avatar-placeholder">
                      <UsersIcon size={36} className="profile-team-icon" />
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
                {isAdmin && team.bannerUrl && (
                  <button
                    type="button"
                    className="org-profile-remove-photo"
                    onClick={handleRemoveBanner}
                    disabled={uploadingImage}
                  >
                    Remove cover
                  </button>
                )}
              </div>
              <div className="dashboard-enterprise-hero-copy">
                <div className="dashboard-enterprise-title-row">
                  <h2 className="dashboard-enterprise-name">{team.name}</h2>
                  {isAdmin && (
                    <button
                      type="button"
                      className="dashboard-widget-link team-dashboard-settings-link dashboard-enterprise-settings"
                      onClick={() => setShowSettingsModal(true)}
                    >
                      <SettingsIcon size={16} />
                      Settings
                    </button>
                  )}
                </div>
                <p className="dashboard-enterprise-subtitle">Team · {org.name}</p>
                <div className="team-dashboard-profile-badges dashboard-enterprise-badges">
                  <span className="profile-badge profile-badge-org">{org.name}</span>
                  {team.allowOpenJoin && <span className="profile-badge">Open to join</span>}
                </div>
                <div className="team-dashboard-about-header">
                  <span className="team-dashboard-about-label">About</span>
                  {isAdmin && !isEditingDesc && (
                    <button type="button" className="profile-pencil-btn" onClick={startEditDesc} title="Edit" aria-label="Edit description">
                      <PencilIcon size={16} />
                    </button>
                  )}
                </div>
                {isEditingDesc ? (
                  <form onSubmit={saveDesc} className="team-dashboard-about-form">
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Team description…"
                      className="profile-input"
                      rows={3}
                      disabled={savingDesc}
                    />
                    <div className="profile-save-row team-dashboard-about-actions">
                      <button type="button" className="profile-btn profile-btn-ghost" onClick={() => setIsEditingDesc(false)}>Cancel</button>
                      <button type="submit" className="profile-btn profile-btn-primary" disabled={savingDesc}>{savingDesc ? 'Saving…' : 'Save'}</button>
                    </div>
                  </form>
                ) : (
                  <p className="team-dashboard-about-text">{team.description || 'No description yet.'}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="dashboard-stats">
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{members.length}</span>
            <span className="dashboard-stat-label">Team members</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{upcomingMeetings.length}</span>
            <span className="dashboard-stat-label">Upcoming</span>
          </div>
          {isAdmin && pending.length > 0 && (
            <a href="#team-dashboard-pending" className="dashboard-stat-card dashboard-stat-card-action team-dashboard-stat-pending">
              <span className="dashboard-stat-value">{pending.length}</span>
              <span className="dashboard-stat-label">Pending requests</span>
            </a>
          )}
        </div>

        <div className="dashboard-shortcuts">
          <Link to={`/app/org/${orgId}`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><BuildingIcon size={24} /></span>
            <span className="dashboard-shortcut-label">{org.name}</span>
            <span className="dashboard-shortcut-hint">Organization dashboard</span>
          </Link>
          <Link to={`/app/org/${orgId}/calendar`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><CalendarIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Calendar</span>
            <span className="dashboard-shortcut-hint">Org calendar — use Team view for this roster</span>
          </Link>
          <Link to={`/app/chats?org=${encodeURIComponent(orgId)}`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><MessageSquareIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Chats</span>
            <span className="dashboard-shortcut-hint">Messages in this organization</span>
          </Link>
          <Link to={`/app/org/${orgId}/video`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><VideoIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Video Call</span>
            <span className="dashboard-shortcut-hint">{org.name} meetings</span>
          </Link>
          {isOrgAdmin && (
            <Link to={`/app/org/${orgId}/admin`} className="dashboard-shortcut">
              <span className="dashboard-shortcut-icon"><SettingsIcon size={24} /></span>
              <span className="dashboard-shortcut-label">Organization admin</span>
              <span className="dashboard-shortcut-hint">Members, teams & invites</span>
            </Link>
          )}
        </div>

        <section className="dashboard-widget dashboard-widget-wide dashboard-upcoming-meetings-widget">
          <div className="dashboard-widget-header">
            <h3 className="dashboard-widget-title">
              <CalendarIcon size={20} />
              Upcoming meetings
            </h3>
          </div>
          <p className="dashboard-section-desc team-dashboard-meetings-desc">
            Scheduled team events and video meetings. Calendar-only items open details; video meetings open the lobby ready to join.
          </p>
          {teamMembership?.state === TEAM_STATES.active && (
            <div className="team-dashboard-meetings-actions">
              {!showCreateMeeting ? (
                <button
                  type="button"
                  className="org-admin-btn"
                  onClick={() => setShowCreateMeeting(true)}
                  disabled={!canCreateTeamMeeting}
                  title={
                    !canCreateTeamMeeting
                      ? 'You do not have permission to create team meetings. Ask an admin to enable scheduling and team calendar access.'
                      : undefined
                  }
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
                      {creatingMeeting ? 'Creating…' : 'Create'}
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
          {upcomingMeetingsLoading ? (
            <p className="dashboard-widget-empty">Loading…</p>
          ) : upcomingMeetings.length === 0 ? (
            <p className="dashboard-widget-empty">No upcoming team meetings.</p>
          ) : (
            <ul className="dashboard-upcoming-list">
              {upcomingMeetings.map((m) => {
                const isCalOnly = m.isVideoMeeting === false
                const joinId = m._seriesId || m.id
                return (
                  <li key={m.id} className="dashboard-upcoming-row">
                    <div className="dashboard-upcoming-row-main">
                      <span className="dashboard-upcoming-title">{m.title || 'Untitled'}</span>
                      <span className="dashboard-upcoming-when">{formatMeetingRowWhen(m.startAt, userDoc)}</span>
                    </div>
                    <div className="dashboard-upcoming-row-actions">
                      {isCalOnly ? (
                        <button
                          type="button"
                          className="org-admin-btn org-admin-btn-approve dashboard-upcoming-action-btn"
                          onClick={() => setEventDetailItem(m)}
                        >
                          Details
                        </button>
                      ) : (
                        <Link
                          className="org-admin-btn org-admin-btn-approve dashboard-upcoming-action-link"
                          to={`/app/org/${encodeURIComponent(orgId)}/video?meetingId=${encodeURIComponent(joinId)}`}
                        >
                          Join
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {isAdmin && (
          <section className="dashboard-widget dashboard-widget-wide">
            <div className="dashboard-widget-header">
              <h3 className="dashboard-widget-title">Invite to team</h3>
            </div>
            <form onSubmit={handleInvite} className="org-admin-invite-form team-dashboard-invite-form">
              <input
                type="email"
                placeholder="Org member email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess(''); }}
                className="org-admin-invite-input"
                disabled={inviteLoading}
              />
              <button type="submit" className="org-admin-btn org-admin-btn-approve" disabled={inviteLoading}>
                {inviteLoading ? 'Sending…' : 'Send invitation'}
              </button>
            </form>
            <p className="org-admin-invite-hint">Only people already in the organization can be invited.</p>
            {inviteError && <p className="org-admin-error">{inviteError}</p>}
            {inviteSuccess && <p className="org-admin-success">{inviteSuccess}</p>}
          </section>
        )}

        <section className="dashboard-widget dashboard-widget-wide" id="team-dashboard-members">
          <div className="dashboard-widget-header">
            <h3 className="dashboard-widget-title">
              <UsersIcon size={20} />
              Members
            </h3>
            {isOrgAdmin && (
              <Link to={`/app/org/${orgId}/admin`} className="dashboard-widget-link">Organization admin →</Link>
            )}
          </div>
          <p className="dashboard-section-desc team-dashboard-members-intro">
            Roster for this team. Organization role labels come from the org directory; team admins control this roster.
          </p>
          {members.length === 0 ? (
            <p className="dashboard-widget-empty">No active members yet.</p>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="org-admin-invite-input org-admin-search-input team-dashboard-member-search"
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
                  const om = orgMemberMeta[m.userId]
                  const orgLine = om ? getMembershipDisplayTitle(om) : ''
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
                        <span
                          className="member-card-role"
                          title={orgLine ? `Organization: ${orgLine}` : undefined}
                        >
                          {orgLine ? (
                            <>
                              {orgLine}
                              <span className="member-card-role-suffix"> · {teamRoleLabel(m)}</span>
                            </>
                          ) : (
                            teamRoleLabel(m)
                          )}
                        </span>
                      </div>
                      {(canMakeAdmin || canMakeMember || canRemove || !isSelf) && (
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
                                onClick={() => { setMemberMenuOpen(null); setMemberManageOpen(null); setProfileModalMember(m) }}
                              >
                                Profile
                              </button>
                              {(canMakeAdmin || canMakeMember || canRemove) && (
                                <>
                                  <button
                                    type="button"
                                    className="member-card-menu-item member-card-menu-item-submenu-trigger"
                                    onClick={() => setMemberManageOpen(memberManageOpen === m.userId ? null : m.userId)}
                                  >
                                    Manage
                                  </button>
                                  {memberManageOpen === m.userId && (
                                    <div className="member-card-menu-subpanel">
                                      {canMakeAdmin && (
                                        <button
                                          type="button"
                                          className="member-card-menu-item"
                                          onClick={() => { setMemberMenuOpen(null); setMemberManageOpen(null); handleChangeRole(m.userId, TEAM_ROLES.admin) }}
                                        >
                                          Make admin
                                        </button>
                                      )}
                                      {canMakeMember && (
                                        <button
                                          type="button"
                                          className="member-card-menu-item"
                                          onClick={() => { setMemberMenuOpen(null); setMemberManageOpen(null); handleChangeRole(m.userId, TEAM_ROLES.member) }}
                                        >
                                          Make member
                                        </button>
                                      )}
                                      {canRemove && (
                                        <button
                                          type="button"
                                          className="member-card-menu-item member-card-menu-item-danger"
                                          onClick={() => { setMemberMenuOpen(null); setMemberManageOpen(null); handleRemoveMember(m.userId) }}
                                        >
                                          Remove from team
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </>
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
                <p className="app-muted">No members match &quot;{memberSearch}&quot;</p>
              )}
            </>
          )}
        </section>

        {isAdmin && pending.length > 0 && (
          <section id="team-dashboard-pending" className="dashboard-widget">
            <div className="dashboard-widget-header">
              <h3 className="dashboard-widget-title">Pending join requests</h3>
            </div>
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
          <section className="dashboard-widget">
            <div className="dashboard-widget-header">
              <h3 className="dashboard-widget-title">Rejected join requests</h3>
            </div>
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
          <section className="dashboard-widget">
            <div className="dashboard-widget-header">
              <h3 className="dashboard-widget-title">Rejected invitations</h3>
            </div>
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
      </div>

      <EventDetailModal
        item={eventDetailItem}
        isOpen={Boolean(eventDetailItem)}
        onClose={() => setEventDetailItem(null)}
        user={user}
        userDoc={userDoc}
        canManageOrg={isOrgAdmin}
        onUpdated={() => reloadUpcomingMeetings()}
        onDeleted={() => {
          reloadUpcomingMeetings()
          setEventDetailItem(null)
        }}
      />

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

      {profileModalMember && (
        <MemberProfileModal
          userId={profileModalMember.userId}
          orgId={orgId}
          org={org}
          currentUser={user}
          myMembership={orgMembership}
          userDoc={userProfiles[profileModalMember.userId]}
          memberData={{}}
          onClose={() => setProfileModalMember(null)}
          orgRemoval={false}
          showManage={canManageTeam(teamMembership, orgMembership)}
          onRoleChange={async (uid, newRole) => {
            await handleChangeRole(uid, newRole)
            setProfileModalMember((prev) => (prev && prev.userId === uid ? { ...prev, role: newRole } : prev))
          }}
          onRemoveMember={(uid) => {
            handleRemoveMember(uid)
            setProfileModalMember(null)
          }}
          removeLabel="Remove from team"
        />
      )}
    </main>
  )
}
