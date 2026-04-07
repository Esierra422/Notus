import { useState, useEffect, useMemo, useRef } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock.js'
import {
  getMembership,
  updateMemberDisplayRole,
  updateMemberCapabilities,
  canManageOrg,
  membershipHasCapability,
  normalizeMemberCapabilities,
  canRemoveOrgMember,
  getMembershipDisplayTitle,
  MEMBERSHIP_ROLES,
} from '../../lib/orgService'
import { getTeamsForUserInOrg, orgAdminAddUserToTeam, removeTeamMember } from '../../lib/teamService'
import { getDisplayName, getProfilePictureUrl } from '../../lib/userService'
import { Button } from '../ui/Button'
import './MemberManageModal.css'

function capsEqual(a, b) {
  const n = normalizeMemberCapabilities({})
  return Object.keys(n).every((k) => a[k] === b[k])
}

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <div className="member-manage-toggle-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`member-manage-toggle ${checked ? 'member-manage-toggle--on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="member-manage-toggle-knob" />
      </button>
      <div className="member-manage-toggle-text">
        <span className="member-manage-toggle-label">{label}</span>
        {description && <span className="member-manage-toggle-desc">{description}</span>}
      </div>
    </div>
  )
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
  const [capabilities, setCapabilities] = useState(() => normalizeMemberCapabilities({}))
  const [teamSelected, setTeamSelected] = useState(() => new Set())

  const [initial, setInitial] = useState(null)

  const canEditCapabilities = canManageOrg(myMembership) || membershipHasCapability(myMembership, 'manageMembers')
  const canAssignTeams = canManageOrg(myMembership) || membershipHasCapability(myMembership, 'manageTeams')

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
        const caps = normalizeMemberCapabilities(mem?.capabilities || member?.capabilities)
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

  const isTargetOwner = role === MEMBERSHIP_ROLES.owner
  const isSelf = userId === currentUser?.uid
  const canRemove =
    !isSelf && canRemoveOrgMember(myMembership, role, isTargetOwner)

  const toggleCap = (key) => {
    setCapabilities((c) => ({ ...c, [key]: !c[key] }))
  }

  const dirty = useMemo(() => {
    if (!initial) return false
    if ((displayRoleName || '').trim() !== (initial.displayRoleName || '').trim()) return true
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
        if (!canEditCapabilities) throw new Error('You cannot update this member’s label.')
        await updateMemberDisplayRole(orgId, userId, currentUser.uid, displayRoleName)
      }
      if (!capsEqual(capabilities, initial.capabilities)) {
        if (!canEditCapabilities) throw new Error('You cannot update capabilities.')
        await updateMemberCapabilities(orgId, userId, currentUser.uid, capabilities)
      }
      const toAdd = [...teamSelected].filter((id) => !initial.teamIds.has(id))
      const toRemove = [...initial.teamIds].filter((id) => !teamSelected.has(id))
      if ((toAdd.length || toRemove.length) && !canAssignTeams) {
        throw new Error('You do not have permission to change team assignments.')
      }
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

  const setTeamInRoster = (teamId, inTeam) => {
    if (!canAssignTeams) return
    setTeamSelected((prev) => {
      const next = new Set(prev)
      if (inTeam) next.add(teamId)
      else next.delete(teamId)
      return next
    })
  }

  useScrollLock(Boolean(orgId && userId))

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
                <div className="member-manage-role-title">
                  {getMembershipDisplayTitle({ displayRoleName, role })}
                </div>
                {email && <div className="member-manage-email">{email}</div>}
              </div>
            </div>

            {error && <p className="member-manage-error">{error}</p>}

            <div className="member-manage-section">
              <label className="member-manage-label" htmlFor="member-display-role">
                Role label
              </label>
              <p className="member-manage-hint">
                Shown on member cards (e.g. &quot;Engineer&quot;, &quot;Lead&quot;). Does not change admin access by itself.
              </p>
              <input
                id="member-display-role"
                type="text"
                className="member-manage-input"
                value={displayRoleName}
                onChange={(e) => setDisplayRoleName(e.target.value)}
                placeholder="e.g. Product, Sales, Contractor"
                disabled={saving || !canEditCapabilities || isTargetOwner}
              />
            </div>

            <div className="member-manage-section member-manage-section--unified">
              <span className="member-manage-label">Access controls</span>
              <p className="member-manage-hint">
                Access is determined by the controls below. If at least one control is enabled, the member can open the admin tools
                they need to use that permission.
              </p>
              {isTargetOwner ? (
                <p className="member-manage-readonly">
                  Owner: full access. Transfer ownership is not available in this dialog.
                </p>
              ) : null}

              {!isTargetOwner && (
                <div className="member-manage-toggle-list">
                  <ToggleRow
                    label="Create scheduled meetings (organization)"
                    description="Schedule org-wide or private calendar events in this organization."
                    checked={capabilities.scheduleOrgMeetings}
                    onChange={(v) => toggleCap('scheduleOrgMeetings')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Create scheduled meetings (teams)"
                    description="Schedule events on team calendars."
                    checked={capabilities.scheduleTeamMeetings}
                    onChange={(v) => toggleCap('scheduleTeamMeetings')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Add to organization calendar"
                    description="Publish non–invite-only events visible to the org."
                    checked={capabilities.orgCalendar}
                    onChange={(v) => toggleCap('orgCalendar')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Add to team calendar"
                    description="Create and manage team-scoped calendar entries."
                    checked={capabilities.teamCalendar}
                    onChange={(v) => toggleCap('teamCalendar')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Create teams"
                    description="Create new teams in this organization."
                    checked={capabilities.createTeams}
                    onChange={(v) => toggleCap('createTeams')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Manage teams"
                    description="Edit team settings and add org members to teams from admin tools."
                    checked={capabilities.manageTeams}
                    onChange={(v) => toggleCap('manageTeams')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Manage other users"
                    description="Open manage-member, edit labels, and adjust capability toggles."
                    checked={capabilities.manageMembers}
                    onChange={(v) => toggleCap('manageMembers')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Remove users from organization"
                    description="Remove members (not owners or admins unless you are owner)."
                    checked={capabilities.removeOrgMembers}
                    onChange={(v) => toggleCap('removeOrgMembers')}
                    disabled={saving || !canEditCapabilities}
                  />
                  <ToggleRow
                    label="Remove users from teams"
                    description="Remove people from team rosters."
                    checked={capabilities.removeTeamMembers}
                    onChange={(v) => toggleCap('removeTeamMembers')}
                    disabled={saving || !canEditCapabilities}
                  />
                </div>
              )}
            </div>

            <div className="member-manage-section">
              <span className="member-manage-label">Teams</span>
              {!canAssignTeams && (
                <p className="member-manage-muted">You can view team membership but cannot change assignments.</p>
              )}
              {teams.length === 0 ? (
                <p className="member-manage-muted">No teams in this organization yet.</p>
              ) : (
                <div className="member-manage-toggle-list member-manage-team-toggle-list">
                  {teams.map((t) => (
                    <ToggleRow
                      key={t.id}
                      label={t.name}
                      checked={teamSelected.has(t.id)}
                      onChange={(v) => setTeamInRoster(t.id, v)}
                      disabled={saving || !canAssignTeams}
                    />
                  ))}
                </div>
              )}
            </div>

            {canRemove && (
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
              {confirmSave && dirty && <p className="member-manage-confirm-hint">Click Save again to apply changes.</p>}
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
