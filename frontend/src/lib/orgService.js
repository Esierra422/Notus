/**
 * Organization and membership services.
 * No invite codes or links — request/approve in app only.
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

const ORGS_COLLECTION = 'organizations'
const MEMBERSHIPS_COLLECTION = 'memberships'

export const MEMBERSHIP_STATES = { pending: 'pending', active: 'active', rejected: 'rejected', removed: 'removed' }
export const MEMBERSHIP_ROLES = { owner: 'owner', admin: 'admin', member: 'member' }

function membershipId(orgId, userId) {
  return `${orgId}_${userId}`
}

/**
 * Create organization and add creator as owner+active.
 */
export async function createOrg(name, userId) {
  const orgRef = doc(collection(db, ORGS_COLLECTION))
  const orgId = orgRef.id
  const trimmed = name.trim()
  await setDoc(orgRef, {
    name: trimmed,
    nameLower: trimmed.toLowerCase(),
    createdBy: userId,
    createdAt: serverTimestamp(),
  })

  const memRef = doc(db, MEMBERSHIPS_COLLECTION, membershipId(orgId, userId))
  await setDoc(memRef, {
    orgId,
    userId,
    role: MEMBERSHIP_ROLES.owner,
    state: MEMBERSHIP_STATES.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return { id: orgId, name: trimmed }
}

/**
 * Get organization by ID.
 */
export async function getOrg(orgId) {
  const ref = doc(db, ORGS_COLLECTION, orgId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Update organization fields. Requires owner/admin.
 */
export async function updateOrg(orgId, updates, userId) {
  const mem = await getMembership(orgId, userId)
  if (!mem || mem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('You must be an active member to update the org.')
  }
  if (mem.role !== MEMBERSHIP_ROLES.owner && mem.role !== MEMBERSHIP_ROLES.admin) {
    throw new Error('Only admins and owners can update the org.')
  }
  const ref = doc(db, ORGS_COLLECTION, orgId)
  const data = {}
  if (updates.description !== undefined) data.description = String(updates.description || '').trim()
  if (updates.imageUrl !== undefined) data.imageUrl = updates.imageUrl == null ? null : String(updates.imageUrl)
  if (updates.name !== undefined) {
    const name = String(updates.name || '').trim()
    data.name = name
    data.nameLower = name.toLowerCase()
  }
  if (Object.keys(data).length === 0) return
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

/**
 * Search organizations by name (prefix match, case-insensitive).
 */
export async function searchOrgsByName(searchTerm, limit = 10) {
  const search = searchTerm.trim().toLowerCase()
  if (!search) return []

  const q = query(
    collection(db, ORGS_COLLECTION),
    where('nameLower', '>=', search),
    where('nameLower', '<=', search + '\uf8ff')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get user's membership in an org.
 */
export async function getMembership(orgId, userId) {
  const ref = doc(db, MEMBERSHIPS_COLLECTION, membershipId(orgId, userId))
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Get all memberships for a user.
 */
export async function getUserMemberships(userId) {
  const q = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where('userId', '==', userId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Request to join org — create membership with state=pending.
 */
export async function requestToJoinOrg(orgId, userId) {
  const id = membershipId(orgId, userId)
  const ref = doc(db, MEMBERSHIPS_COLLECTION, id)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data()
    if (data.state === MEMBERSHIP_STATES.active) throw new Error('You are already a member.')
    if (data.state === MEMBERSHIP_STATES.pending) throw new Error('Request already pending.')
    if (data.state === MEMBERSHIP_STATES.rejected) throw new Error('Your request was rejected.')
  }

  await setDoc(ref, {
    orgId,
    userId,
    role: MEMBERSHIP_ROLES.member,
    state: MEMBERSHIP_STATES.pending,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    requestedAt: serverTimestamp(),
  })
}

/**
 * Get user's active org membership (if any). Returns first active.
 * @deprecated Prefer getActiveMemberships for multi-org support.
 */
export async function getActiveMembership(userId) {
  const memberships = await getUserMemberships(userId)
  return memberships.find((m) => m.state === MEMBERSHIP_STATES.active) || null
}

/**
 * Get all active org memberships for a user (for multi-org support).
 */
export async function getActiveMemberships(userId) {
  const memberships = await getUserMemberships(userId)
  return memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
}

/**
 * Get user's pending membership (if any).
 */
export async function getPendingMembership(userId) {
  const memberships = await getUserMemberships(userId)
  return memberships.find((m) => m.state === MEMBERSHIP_STATES.pending) || null
}

/**
 * Get all members of an org.
 */
export async function getOrgMembers(orgId) {
  const q = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where('orgId', '==', orgId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get pending join requests for an org.
 */
export async function getPendingRequests(orgId) {
  const q = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where('orgId', '==', orgId),
    where('state', '==', MEMBERSHIP_STATES.pending)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get rejected join requests for an org (for admin visibility).
 */
export async function getRejectedRequests(orgId) {
  const q = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where('orgId', '==', orgId),
    where('state', '==', MEMBERSHIP_STATES.rejected)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Approve, reject, or remove a membership. Requires owner/admin for approve/reject/remove.
 */
export async function updateMembershipState(orgId, userId, newState) {
  const allowed = [MEMBERSHIP_STATES.active, MEMBERSHIP_STATES.rejected, MEMBERSHIP_STATES.removed]
  if (!allowed.includes(newState)) {
    throw new Error('Invalid state')
  }
  const ref = doc(db, MEMBERSHIPS_COLLECTION, membershipId(orgId, userId))
  await updateDoc(ref, {
    state: newState,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Update a member's role. Requires owner/admin.
 */
export async function updateMembershipRole(orgId, userId, newRole) {
  if (![MEMBERSHIP_ROLES.owner, MEMBERSHIP_ROLES.admin, MEMBERSHIP_ROLES.member].includes(newRole)) {
    throw new Error('Invalid role')
  }
  const ref = doc(db, MEMBERSHIPS_COLLECTION, membershipId(orgId, userId))
  await updateDoc(ref, {
    role: newRole,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Check if user is owner or admin of org.
 */
export function canManageOrg(membership) {
  return membership && (membership.role === MEMBERSHIP_ROLES.owner || membership.role === MEMBERSHIP_ROLES.admin)
}
