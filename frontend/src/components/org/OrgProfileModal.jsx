/**
 * Organization profile modal — shows org info in a pop-up.
 * Used from OrganizationsPage when clicking the info icon on an org card.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getOrg, getMembership, getOrgMembers, canManageOrg, MEMBERSHIP_STATES } from '../../lib/orgService'
import { getOrgTeams } from '../../lib/teamService'
import { BuildingIcon, UsersIcon, XIcon } from '../ui/Icons'
import './OrgProfileModal.css'

export function OrgProfileModal({ orgId, userId, onClose }) {
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    const load = async () => {
      setLoading(true)
      try {
        const [orgData, memData, membersData, teamsData] = await Promise.all([
          getOrg(orgId),
          userId ? getMembership(orgId, userId).catch(() => null) : Promise.resolve(null),
          getOrgMembers(orgId),
          getOrgTeams(orgId),
        ])
        setOrg(orgData || null)
        setMembership(memData || null)
        setMembers((membersData || []).filter((m) => m.state === MEMBERSHIP_STATES.active))
        setTeams(teamsData || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [orgId, userId])

  const isAdmin = membership ? canManageOrg(membership) : false

  if (!orgId) return null

  return (
    <div className="org-profile-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="org-profile-modal-title">
      <div className="org-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="org-profile-modal-header">
          <h3 id="org-profile-modal-title">Organization profile</h3>
          <button type="button" className="org-profile-modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
        <div className="org-profile-modal-body">
          {loading ? (
            <p className="org-profile-modal-loading">Loading…</p>
          ) : !org ? (
            <p className="org-profile-modal-error">Organization not found.</p>
          ) : (
            <>
              <div className="org-profile-modal-hero">
                <div className="org-profile-modal-avatar-wrap">
                  {org.imageUrl ? (
                    <img src={org.imageUrl} alt="" className="org-profile-modal-avatar" />
                  ) : (
                    <div className="org-profile-modal-avatar-placeholder">
                      <BuildingIcon size={40} />
                    </div>
                  )}
                </div>
                <h4 className="org-profile-modal-name">{org.name}</h4>
                <div className="org-profile-modal-badges">
                  <span className="org-profile-modal-badge">{members.length} members</span>
                  <span className="org-profile-modal-badge">{teams.length} teams</span>
                </div>
              </div>
              <div className="org-profile-modal-about">
                <h4 className="org-profile-modal-section-title">About</h4>
                <p className="org-profile-modal-desc">{org.description || 'No description yet.'}</p>
              </div>
              {teams.length > 0 && (
                <div className="org-profile-modal-teams">
                  <h4 className="org-profile-modal-section-title">
                    <UsersIcon size={18} /> Teams
                  </h4>
                  <ul className="org-profile-modal-teams-list">
                    {teams.map((team) => (
                      <li key={team.id}>
                        <Link to={`/app/org/${orgId}/teams/${team.id}`} className="org-profile-modal-team-link" onClick={onClose}>
                          {team.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="org-profile-modal-actions">
                <Link to={`/app/org/${orgId}/profile`} className="org-profile-modal-full-link" onClick={onClose}>
                  View full profile
                </Link>
                {isAdmin && (
                  <Link to={`/app/org/${orgId}/admin`} className="org-profile-modal-admin-link" onClick={onClose}>
                    Manage organization
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
