import { useState, useEffect, useMemo, useRef } from 'react'
import {
  getMembership,
  updateMemberDisplayRole,
  updateMemberCapabilities,
  updateMembershipRole,
  MEMBERSHIP_ROLES,
} from '../../lib/orgService'
import { getTeamsForUserInOrg, orgAdminAddUserToTeam, removeTeamMember } from '../../lib/teamService'
import { getDisplayName, getProfilePictureUrl } from '../../lib/userService'
import { Button } from '../ui/Button'
import './MemberManageModal.css'

function normCaps(c) {
  return {
    scheduleMeetings: c?.scheduleMeetings === true,
    orgCalendar: c?.orgCalendar === true,
    teamCalendar: c?.teamCalendar === true,
  }
}

function capsEqual(a, b) {
  return a.scheduleMeetings === b.scheduleMeetings && a.orgCalendar === b.orgCalendar && a.teamCalendar === b.teamCalendar
}

export function MemberManageModal({
  orgId,
  org,
  member,
  userDoc,
  currentUser,
  myMembership,
  teams,
  onClose,
  onSaved,
  onRemoveMember,
}) {
  const userId = member?.userId
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmSave, setConfirmSave] = useState(false)
  const prevDirtyRef = useRef(false)

  const [displayRoleName, setDisplayRoleName] = useState('')
  const [role, setRole] = useState(MEMBERSHIP_ROLES.member)
  const [capabilities, setCapabilities] = useState(normCaps({}))
  const [teamSelected, setTeamSelected] = useState(() => new Set())

  const [initial, setInitial] = useState(null)

  useEffect(() => {
    if (!orgId || !userId) return
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [mem, userTeams] = await Promise.all([
          getMembership(orgId, userId),
          getTeamsForUserInOrg(orgId, userId),
        ])
        if (cancelled) return
        const r = mem?.role || member?.role || MEMBERSHIP_ROLES.member
        const dr = (mem?.displayRoleName ?? member?.displayRoleName ?? '').trim()
        const caps = normCaps(mem?.capabilities || member?.capabilities)
        const tset = new Set((userTeams || []).map((t) => t.id))
        setRole(r)
        setDisplayRoleName(dr)
        setCapabilities(caps)
        setTeamSelected(tset)
        setInitial({
          displayRoleName: dr,
          role: r,
          capabilities: { ...caps },
          teamIds: new Set(tset),
        })
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load member.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, userId, member?.role, member?.displayRoleName])

  const authUser = userId === currentUser?.uid ? currentUser : null
  const name = getDisplayName(userDoc, userId, authUser)
  const photoUrl = getProfilePictureUrl(userDoc, authUser)
  const email = (userDoc?.email || authUser?.email || '').trim()
  const initials = name ? name.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2) : email?.[0]?.toUpperCase() || '?'

  const iAmOwner = myMembership?.role === MEMBERSHIP_ROLES.owner
  const iAmAdmin = myMembership?.role === MEMBERSHIP_ROLES.admin
  const isTargetOwner = role === MEMBERSHIP_ROLES.owner
  const isTargetAdmin = role === MEMBERSHIP_ROLES.admin
  const isTargetMember = role === MEMBERSHIP_ROLES.member
  const isSelf = userId === currentUser?.uid

  const canMakeAdmin = (iAmOwner && isTargetMember) || (iAmAdmin && isTargetMember)
  const canMakeMember = iAmOwner && isTargetAdmin
  const canRemove = (iAmOwner && !isTargetOwner) || (iAmAdmin && isTargetMember)

  const dirty = useMemo(() => {
    if (!initial) return false
    if ((displayRoleName || '').trim() !== (initial.displayRoleName || '').trim()) return true
    if (role !== initial.role) return true
    if (!capsEqual(capabilities, initial.capabilities)) return true
    if (initial.teamIds.size !== teamSelected.size) return true
    for (const id of teamSelected) {
      if (!initial.teamIds.has(id)) return true
    }
    return false
  }, [initial, displayRoleName, role, capabilities, teamSelected])

  useEffect(() => {
    if (prevDirtyRef.current && !dirty) setConfirmSave(false)
    prevDirtyRef.current = dirty
  }, [dirty])

  const handleSave = async () => {
    if (!userId || !currentUser?.uid || !initial) return
    if (!confirmSave) {
      setConfirmSave(true)
      return
    }
    setSaving(true)
    setError('')
    try {
      if ((displayRoleName || '').trim() !== (initial.displayRoleName || '').trim()) {
        await updateMemberDisplayRole(orgId, userId, currentUser.uid, displayRoleName)
      }
      if (role !== initial.role && !isTargetOwner) {
        await updateMembershipRole(orgId, userId, role)
      }
      if (!capsEqual(capabilities, initial.capabilities)) {
        await updateMemberCapabilities(orgId, userId, currentUser.uid, capabilities)
      }
      const toAdd = [...teamSelected].filter((id) => !initial.teamIds.has(id))
      const toRemove = [...initial.teamIds].filter((id) => !teamSelected.has(id))
      for (const teamId of toAdd) {
        await orgAdminAddUserToTeam(orgId, teamId, userId, currentUser.uid)
      }
      for (const teamId of toRemove) {
        await removeTeamMember(orgId, teamId, userId, currentUser.uid)
      }
      onSaved?.({
        userId,
        role,
        displayRoleName: (displayRoleName || '').trim() || null,
        capabilities,
      })
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Could not save changes.')
    } finally {
      setSaving(false)
      setConfirmSave(false)
    }
  }

  const toggleTeam = (teamId) => {
    setTeamSelected((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  const toggleCap = (key) => {
    setCapabilities((c) => ({ ...c, [key]: !c[key] }))
  }

  return (
    <div className="member-manage-backdrop" onClick={onClose}>
      <div className="member-manage-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="member-manage-title">
        <div className="member-manage-header">
          <h3 id="member-manage-title">Manage member</h3>
          <button type="button" className="member-manage-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {org?.name && <p className="member-manage-org">{org.name}</p>}

        {loading ? (
          <p className="member-manage-muted">Loading…</p>
        ) : (
          <>
            <div className="member-manage-profile">
              <div className="member-manage-avatar">
                {photoUrl ? <img src={photoUrl} alt="" referrerPolicy="no-referrer" /> : <span>{initials}</span>}
              </div>
              <div>
                <div className="member-manage-name">{name || email || 'Member'}</div>
                {email && <div className="member-manage-email">{email}</div>}
              </div>
            </div>

            {error && <p className="member-manage-error">{error}</p>}

            <div className="member-manage-section">
              <label className="member-manage-label" htmlFor="member-display-role">
                Role label
              </label>
              <p className="member-manage-hint">Shown on member cards (e.g. &quot;Engineer&quot;, &quot;Lead&quot;). Does not change admin access by itself.</p>
              <input
                id="member-display-role"
                type="text"
                className="member-manage-input"
                value={displayRoleName}
                onChange={(e) => setDisplayRoleName(e.target.value)}
                placeholder="e.g. Product, Sales, Contractor"
                disabled={saving}
              />
            </div>

            <div className="member-manage-section">
              <span className="member-manage-label">Organization access</span>
              {isTargetOwner ? (
                <p className="member-manage-readonly">Owner — full access. Transfer ownership is not available in this dialog.</p>
              ) : (
                <select
                  className="member-manage-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={saving || (!canMakeAdmin && !canMakeMember && !(iAmAdmin && isTargetAdmin))}
                >
                  <option value={MEMBERSHIP_ROLES.member}>Member</option>
                  <option value={MEMBERSHIP_ROLES.admin}>Admin</option>
                </select>
              )}
            </div>

            <div className="member-manage-section">
              <span className="member-manage-label">Capabilities</span>
              <p className="member-manage-hint">
                Controls creating scheduled meetings, publishing to the organization calendar, and adding team-calendar
                events (including chat → event and video). Owners and admins always have full access.
              </p>
              <label className="member-manage-check">
                <input
                  type="checkbox"
                  checked={capabilities.scheduleMeetings}
                  onChange={() => toggleCap('scheduleMeetings')}
                  disabled={saving || isTargetOwner}
                />
                Create scheduled meetings
              </label>
              <label className="member-manage-check">
                <input
                  type="checkbox"
                  checked={capabilities.orgCalendar}
                  onChange={() => toggleCap('orgCalendar')}
                  disabled={saving || isTargetOwner}
                />
                Add to organization calendar
              </label>
              <label className="member-manage-check">
                <input
                  type="checkbox"
                  checked={capabilities.teamCalendar}
                  onChange={() => toggleCap('teamCalendar')}
                  disabled={saving || isTargetOwner}
                />
                Add to team calendar
              </label>
            </div>

            <div className="member-manage-section">
              <span className="member-manage-label">Teams</span>
              {teams.length === 0 ? (
                <p className="member-manage-muted">No teams in this organization yet.</p>
              ) : (
                <ul className="member-manage-team-list">
                  {teams.map((t) => (
                    <li key={t.id}>
                      <label className="member-manage-check">
                        <input
                          type="checkbox"
                          checked={teamSelected.has(t.id)}
                          onChange={() => toggleTeam(t.id)}
                          disabled={saving}
                        />
                        {t.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canRemove && !isSelf && (
              <div className="member-manage-danger">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    if (window.confirm('Remove this member from the organization?')) {
                      onRemoveMember?.(userId)
                      onClose?.()
                    }
                  }}
                >
                  Remove from organization
                </Button>
              </div>
            )}

            <div className="member-manage-footer">
              {confirmSave && dirty && (
                <p className="member-manage-confirm-hint">Click Save again to apply changes.</p>
              )}
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? 'Saving…' : confirmSave && dirty ? 'Confirm save' : 'Save'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
