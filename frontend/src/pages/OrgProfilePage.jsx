import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate, useOutletContext } from 'react-router-dom'
import { getOrg, getMembership, getOrgMembers, updateOrg, canManageOrg, MEMBERSHIP_STATES } from '../lib/orgService'
import { getOrgTeams } from '../lib/teamService'
import { compressImageToDataUrl } from '../lib/imageUtils'
import { BuildingIcon, PencilIcon, UsersIcon, ArrowLeftIcon, MoreVerticalIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './ProfilePage.css'
import './OrgPage.css'
import './OrgProfilePage.css'
import './OrgAdminPage.css'

export function OrgProfilePage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { user, setNavExtra } = useOutletContext() || {}
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [teamMenuOpen, setTeamMenuOpen] = useState(null)
  const teamMenuRef = useRef(null)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [error, setError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInputRef = useRef(null)

  useEffect(() => {
    if (!user || !orgId) return
    const load = async () => {
      const [orgData, memData] = await Promise.all([
        getOrg(orgId),
        getMembership(orgId, user.uid),
      ])
      if (!orgData) {
        navigate('/app')
        return
      }
      if (!memData || memData.state !== MEMBERSHIP_STATES.active) {
        navigate('/app')
        return
      }
      setOrg(orgData)
      setMembership(memData)
    }
    load()
  }, [user, orgId, navigate])

  useEffect(() => {
    if (!orgId) return
    const load = async () => {
      const [membersData, teamsData] = await Promise.all([
        getOrgMembers(orgId),
        getOrgTeams(orgId),
      ])
      setMembers(membersData.filter((m) => m.state === MEMBERSHIP_STATES.active))
      setTeams(teamsData)
    }
    load()
  }, [orgId])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target)) {
        setTeamMenuOpen(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const startEditDesc = () => {
    setEditDesc(org?.description || '')
    setIsEditingDesc(true)
    setError('')
  }

  const saveDesc = async (e) => {
    e?.preventDefault()
    setSavingDesc(true)
    setError('')
    try {
      await updateOrg(orgId, { description: editDesc }, user.uid)
      setOrg((o) => (o ? { ...o, description: editDesc } : null))
      setIsEditingDesc(false)
    } catch (err) {
      setError(err?.message || 'Failed to save.')
    } finally {
      setSavingDesc(false)
    }
  }

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
    setUploadingImage(true)
    setError('')
    try {
      const dataUrl = await compressImageToDataUrl(file)
      await updateOrg(orgId, { imageUrl: dataUrl }, user.uid)
      setOrg((o) => (o ? { ...o, imageUrl: dataUrl } : null))
    } catch (err) {
      setError(err?.message || 'Failed to upload image.')
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const handleRemoveImage = async () => {
    setUploadingImage(true)
    setError('')
    try {
      await updateOrg(orgId, { imageUrl: null }, user.uid)
      setOrg((o) => (o ? { ...o, imageUrl: null } : null))
    } catch (err) {
      setError(err?.message || 'Failed to remove image.')
    } finally {
      setUploadingImage(false)
    }
  }

  if (!org || !membership) return null

  const isAdmin = canManageOrg(membership)

  return (
    <main className="app-main profile-main org-profile-main">
      <Link to={`/app/org/${orgId}`} className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back to {org.name}
      </Link>
      <div className="profile-header org-profile-header">
        <div className="profile-cover org-profile-cover" aria-hidden />
        <section className="profile-hero org-profile-hero">
          <div className="profile-hero-inner">
            <div className="org-profile-avatar-block">
              <div className="org-profile-avatar-wrap">
                {org.imageUrl ? (
                  <img src={org.imageUrl} alt="" className="org-profile-avatar" />
                ) : (
                  <div className="profile-avatar-placeholder org-profile-avatar-placeholder">
                    <BuildingIcon size={40} />
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
              {isAdmin && org.imageUrl && (
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
            {error && <p className="profile-field-error org-profile-error">{error}</p>}
            <h2 className="profile-hero-name org-profile-name">{org.name}</h2>
            <div className="profile-hero-badges">
              <span className="profile-badge profile-badge-org">{members.length} members</span>
              <span className="profile-badge profile-badge-org">{teams.length} teams</span>
            </div>
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
                  placeholder="Organization description…"
                  className="profile-input"
                  rows={3}
                  disabled={savingDesc}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                {error && <p className="profile-field-error">{error}</p>}
                <div className="profile-save-row" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button type="button" className="profile-btn profile-btn-ghost" onClick={() => setIsEditingDesc(false)}>Cancel</button>
                  <button type="submit" className="profile-btn profile-btn-primary" disabled={savingDesc}>{savingDesc ? 'Saving…' : 'Save'}</button>
                </div>
              </form>
            ) : (
              <p className="profile-hero-meta" style={{ margin: 0, textAlign: 'left', width: '100%' }}>
                {org.description || 'No description yet.'}
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="profile-card org-profile-card">
        <h3 className="profile-card-title">
          <UsersIcon size={20} />
          Teams
        </h3>
        <ul className="org-teams-list">
          {teams.map((team) => (
            <li key={team.id} className="org-team-item">
              <Link to={`/app/org/${orgId}/teams/${team.id}`} className="org-team-link">
                {team.name}
              </Link>
              <div
                className="member-card-menu-wrapper org-team-menu-wrapper"
                ref={teamMenuOpen === team.id ? teamMenuRef : undefined}
              >
                <button
                  type="button"
                  className="member-card-menu-trigger"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setTeamMenuOpen(teamMenuOpen === team.id ? null : team.id) }}
                  title="Options"
                  aria-label="Team options"
                >
                  <MoreVerticalIcon size={18} />
                </button>
                {teamMenuOpen === team.id && (
                  <div className="member-card-menu-panel">
                    <Link
                      to={`/app/org/${orgId}/teams/${team.id}`}
                      className="member-card-menu-item"
                      onClick={() => setTeamMenuOpen(null)}
                    >
                      Profile
                    </Link>
                    {isAdmin && (
                      <Link
                        to={`/app/org/${orgId}/teams/${team.id}`}
                        className="member-card-menu-item"
                        onClick={() => setTeamMenuOpen(null)}
                      >
                        Manage
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
          {teams.length === 0 && (
            <li className="org-teams-empty">No teams yet</li>
          )}
        </ul>
      </section>

      {isAdmin && (
        <section className="profile-card org-profile-card">
          <h3 className="profile-card-title">
            <UsersIcon size={20} />
            Quick links
          </h3>
          <div className="profile-fields profile-fields-view">
            <Link to={`/app/org/${orgId}/admin`} className="profile-action profile-action-link org-profile-action">
              Manage organization
            </Link>
          </div>
        </section>
      )}
    </main>
  )
}
