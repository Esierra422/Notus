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
 */
export async function createTeam(orgId, name, userId) {
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
