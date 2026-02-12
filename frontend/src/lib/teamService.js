/**
 * Team and team membership services.
 * Teams exist only inside organizations. See Documentation/ARCHITECTURE.md.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { getMembership, MEMBERSHIP_STATES } from './orgService'

const TEAMS_SUB = 'teams'
const TEAM_MEMBERSHIPS_SUB = 'teamMemberships'

export const TEAM_STATES = { pending: 'pending', active: 'active', rejected: 'rejected', removed: 'removed' }
export const TEAM_ROLES = { admin: 'admin', member: 'member' }

function teamMembershipId(teamId, userId) {
  return `${teamId}_${userId}`
}

/**
 * Create team in org. Caller must be active org member.
 * @param {boolean} [allowOpenJoin=false] - If true, any org member can join without invitation.
 */
export async function createTeam(orgId, name, userId, allowOpenJoin = false) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('You must be an org member to create a team.')
  }

  const teamsRef = collection(db, 'organizations', orgId, TEAMS_SUB)
  const teamRef = doc(teamsRef)
  const teamId = teamRef.id
  const trimmed = name.trim()
  await setDoc(teamRef, {
    name: trimmed,
    orgId,
    createdBy: userId,
    createdAt: serverTimestamp(),
    description: '',
    allowOpenJoin: Boolean(allowOpenJoin),
  })

  const memRef = doc(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB, teamMembershipId(teamId, userId))
  await setDoc(memRef, {
    teamId,
    userId,
    role: TEAM_ROLES.admin,
    state: TEAM_STATES.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return { id: teamId, name: trimmed }
}

/**
 * Get all teams in an org.
 */
export async function getOrgTeams(orgId) {
  const teamsRef = collection(db, 'organizations', orgId, TEAMS_SUB)
  const snapshot = await getDocs(teamsRef)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get a single team.
 */
export async function getTeam(orgId, teamId) {
  const ref = doc(db, 'organizations', orgId, TEAMS_SUB, teamId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Get user's membership in a team.
 */
export async function getTeamMembership(orgId, teamId, userId) {
  const ref = doc(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB, teamMembershipId(teamId, userId))
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Request to join team. User must be active org member.
 */
export async function requestToJoinTeam(orgId, teamId, userId) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('You must be an org member to join teams.')
  }

  const id = teamMembershipId(teamId, userId)
  const ref = doc(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB, id)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data()
    if (data.state === TEAM_STATES.active) throw new Error('You are already a member.')
    if (data.state === TEAM_STATES.pending) throw new Error('Request already pending.')
  }

  await setDoc(ref, {
    teamId,
    userId,
    role: TEAM_ROLES.member,
    state: TEAM_STATES.pending,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    requestedAt: serverTimestamp(),
  })
}

/**
 * Get teams the user is an active member of in the org.
 */
export async function getTeamsForUserInOrg(orgId, userId) {
  const membershipsRef = collection(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB)
  const q = query(
    membershipsRef,
    where('userId', '==', userId),
    where('state', '==', TEAM_STATES.active)
  )
  const snapshot = await getDocs(q)
  const memberships = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  const teams = await Promise.all(
    memberships.map((m) => getTeam(orgId, m.teamId))
  )
  return teams.filter(Boolean)
}

/**
 * Get all members of a team.
 */
export async function getTeamMembers(orgId, teamId) {
  const q = query(
    collection(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB),
    where('teamId', '==', teamId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get pending join requests for a team.
 */
export async function getPendingTeamRequests(orgId, teamId) {
  const q = query(
    collection(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB),
    where('teamId', '==', teamId),
    where('state', '==', TEAM_STATES.pending)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get rejected join requests for a team.
 */
export async function getRejectedTeamRequests(orgId, teamId) {
  const q = query(
    collection(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB),
    where('teamId', '==', teamId),
    where('state', '==', TEAM_STATES.rejected)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Update team membership role. Requires team admin or org admin/owner.
 * @param memberUserId - the user whose role is being changed
 * @param callerId - the user making the change (must be team admin or org admin/owner)
 */
export async function updateTeamMembershipRole(orgId, teamId, memberUserId, newRole, callerId) {
  if (![TEAM_ROLES.admin, TEAM_ROLES.member].includes(newRole)) {
    throw new Error('Invalid role')
  }
  const [orgMem, teamMem] = await Promise.all([
    getMembership(orgId, callerId),
    getTeamMembership(orgId, teamId, callerId),
  ])
  if (!canManageTeam(teamMem, orgMem)) {
    throw new Error('You do not have permission to update team members.')
  }
  const ref = doc(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB, teamMembershipId(teamId, memberUserId))
  await updateDoc(ref, { role: newRole, updatedAt: serverTimestamp() })
}

/**
 * Remove member from team. Requires team admin or org admin/owner.
 */
export async function removeTeamMember(orgId, teamId, userId, callerId) {
  const [orgMem, teamMem] = await Promise.all([
    getMembership(orgId, callerId),
    getTeamMembership(orgId, teamId, callerId),
  ])
  if (!canManageTeam(teamMem, orgMem)) {
    throw new Error('You do not have permission to remove team members.')
  }
  const ref = doc(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB, teamMembershipId(teamId, userId))
  await updateDoc(ref, { state: TEAM_STATES.removed, updatedAt: serverTimestamp() })
}

/**
 * Approve or reject a team membership request.
 */
export async function updateTeamMembershipState(orgId, teamId, userId, newState) {
  if (newState !== TEAM_STATES.active && newState !== TEAM_STATES.rejected) {
    throw new Error('Invalid state')
  }
  const ref = doc(db, 'organizations', orgId, TEAM_MEMBERSHIPS_SUB, teamMembershipId(teamId, userId))
  await updateDoc(ref, {
    state: newState,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Check if user can manage team (team admin or org admin/owner).
 */
export function canManageTeam(teamMembership, orgMembership) {
  if (teamMembership?.role === TEAM_ROLES.admin) return true
  if (orgMembership?.role === 'owner' || orgMembership?.role === 'admin') return true
  return false
}

/**
 * Check if user can access team page (active member or org admin/owner).
 */
export function canAccessTeam(teamMembership, orgMembership) {
  if (teamMembership?.state === TEAM_STATES.active) return true
  if (orgMembership?.role === 'owner' || orgMembership?.role === 'admin') return true
  return false
}

/**
 * Update team fields. Requires team admin or org admin/owner.
 */
export async function updateTeam(orgId, teamId, updates, userId) {
  const [orgMem, teamMem] = await Promise.all([
    getMembership(orgId, userId),
    getTeamMembership(orgId, teamId, userId),
  ])
  if (!canManageTeam(teamMem, orgMem)) {
    throw new Error('You do not have permission to update this team.')
  }
  const ref = doc(db, 'organizations', orgId, TEAMS_SUB, teamId)
  const data = {}
  if (updates.description !== undefined) data.description = String(updates.description || '').trim()
  if (updates.imageUrl !== undefined) data.imageUrl = updates.imageUrl == null ? null : String(updates.imageUrl)
  if (updates.name !== undefined) data.name = String(updates.name || '').trim()
  if (updates.allowOpenJoin !== undefined) data.allowOpenJoin = Boolean(updates.allowOpenJoin)
  if (Object.keys(data).length === 0) return
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}
