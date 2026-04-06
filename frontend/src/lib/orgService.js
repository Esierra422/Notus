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

/**
 * Primary title for member cards and profiles: custom role label when set, otherwise title-cased org role.
 */
export function getMembershipDisplayTitle(membershipLike) {
  if (!membershipLike || typeof membershipLike !== 'object') return ''
  const label =
    membershipLike.displayRoleName != null ? String(membershipLike.displayRoleName).trim() : ''
  if (label) return label
  const r = membershipLike.role
  if (!r || typeof r !== 'string') return ''
  const lower = r.toLowerCase()
  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : ''
}

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
  if (updates.bannerUrl !== undefined) data.bannerUrl = updates.bannerUrl == null ? null : String(updates.bannerUrl)
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
 * Approve, reject, or remove a membership.
 * Approve/reject: org owner/admin only. Remove: admin rules or `removeOrgMembers` capability (members only).
 */
export async function updateMembershipState(orgId, userId, newState, actorUserId) {
  const allowed = [MEMBERSHIP_STATES.active, MEMBERSHIP_STATES.rejected, MEMBERSHIP_STATES.removed]
  if (!allowed.includes(newState)) {
    throw new Error('Invalid state')
  }
  const actor = await getMembership(orgId, actorUserId)
  if (!actor || actor.state !== MEMBERSHIP_STATES.active) {
    throw new Error('Not allowed.')
  }
  if (newState === MEMBERSHIP_STATES.active || newState === MEMBERSHIP_STATES.rejected) {
    if (!canManageOrg(actor)) {
      throw new Error('Only organization admins can approve or reject join requests.')
    }
  }
  if (newState === MEMBERSHIP_STATES.removed) {
    const target = await getMembership(orgId, userId)
    if (!target) throw new Error('Member not found.')
    const targetIsOwner = target.role === MEMBERSHIP_ROLES.owner
    if (!canRemoveOrgMember(actor, target.role, targetIsOwner)) {
      throw new Error('You do not have permission to remove this member.')
    }
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
export async function updateMembershipRole(orgId, userId, newRole, actorUserId) {
  const actor = await getMembership(orgId, actorUserId)
  if (!canManageOrg(actor)) {
    throw new Error('Only organization admins can change roles.')
  }
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

/** Capability keys stored on `memberships.capabilities`. */
export const MEMBERSHIP_CAP_KEYS = {
  scheduleOrgMeetings: 'scheduleOrgMeetings',
  scheduleTeamMeetings: 'scheduleTeamMeetings',
  orgCalendar: 'orgCalendar',
  teamCalendar: 'teamCalendar',
  createTeams: 'createTeams',
  manageMembers: 'manageMembers',
  removeOrgMembers: 'removeOrgMembers',
  removeTeamMembers: 'removeTeamMembers',
  manageTeams: 'manageTeams',
}

export function normalizeMemberCapabilities(raw) {
  const base = {
    scheduleOrgMeetings: false,
    scheduleTeamMeetings: false,
    orgCalendar: false,
    teamCalendar: false,
    createTeams: false,
    manageMembers: false,
    removeOrgMembers: false,
    removeTeamMembers: false,
    manageTeams: false,
  }
  if (!raw || typeof raw !== 'object') return base
  for (const k of Object.keys(base)) {
    if (k in raw) base[k] = raw[k] === true
  }
  if (raw.scheduleMeetings === true && !('scheduleOrgMeetings' in raw) && !('scheduleTeamMeetings' in raw)) {
    base.scheduleOrgMeetings = true
    base.scheduleTeamMeetings = true
  }
  return base
}

/**
 * Open “manage member” UI (labels + capability toggles): admins or `manageMembers`.
 */
export function canOpenMemberManagement(actor) {
  return canManageOrg(actor) || membershipHasCapability(actor, 'manageMembers')
}

/**
 * Remove someone from the org (not owner). Admins follow role rules; others need `removeOrgMembers` for members only.
 */
export function canRemoveOrgMember(actor, targetRole, targetIsOwner) {
  if (!actor || actor.state !== MEMBERSHIP_STATES.active) return false
  if (targetIsOwner) return false
  if (canManageOrg(actor)) {
    if (targetRole === MEMBERSHIP_ROLES.admin) return actor.role === MEMBERSHIP_ROLES.owner
    return true
  }
  if (!membershipHasCapability(actor, 'removeOrgMembers')) return false
  return targetRole === MEMBERSHIP_ROLES.member
}

/**
 * Fine-grained permissions. Owners/admins always pass.
 * Legacy: no `capabilities` field → full calendar/scheduling; enterprise flags off.
 * With a capabilities object: scheduling split + explicit enterprise toggles.
 */
export function membershipHasCapability(membership, cap) {
  if (!membership || membership.state !== MEMBERSHIP_STATES.active) return false
  if (membership.role === MEMBERSHIP_ROLES.owner || membership.role === MEMBERSHIP_ROLES.admin) return true

  const raw = membership.capabilities

  if (raw == null || typeof raw !== 'object') {
    if (
      cap === 'manageMembers' ||
      cap === 'removeOrgMembers' ||
      cap === 'removeTeamMembers' ||
      cap === 'manageTeams' ||
      cap === 'createTeams'
    ) {
      return false
    }
    if (
      cap === 'scheduleMeetings' ||
      cap === 'scheduleOrgMeetings' ||
      cap === 'scheduleTeamMeetings' ||
      cap === 'orgCalendar' ||
      cap === 'teamCalendar'
    ) {
      return true
    }
    return false
  }

  const c = raw

  if (cap === 'scheduleOrgMeetings') {
    if (c.scheduleOrgMeetings === true) return true
    if ('scheduleOrgMeetings' in c) return false
    if (c.scheduleMeetings === true) return true
    if ('scheduleMeetings' in c) return false
    return false
  }

  if (cap === 'scheduleTeamMeetings') {
    if (c.scheduleTeamMeetings === true) return true
    if ('scheduleTeamMeetings' in c) return false
    if (c.scheduleMeetings === true) return true
    if ('scheduleMeetings' in c) return false
    return false
  }

  if (cap === 'scheduleMeetings') {
    return (
      membershipHasCapability({ ...membership, capabilities: c }, 'scheduleOrgMeetings') ||
      membershipHasCapability({ ...membership, capabilities: c }, 'scheduleTeamMeetings')
    )
  }

  // Require explicit true whenever a capabilities object exists (matches admin toggles + normalizeMemberCapabilities).
  // Missing keys are not treated as allow — that bypassed orgCalendar/teamCalendar off when keys were omitted in Firestore.
  if (cap === 'orgCalendar') {
    return c.orgCalendar === true
  }
  if (cap === 'teamCalendar') {
    return c.teamCalendar === true
  }

  const enterprise = ['createTeams', 'manageMembers', 'removeOrgMembers', 'removeTeamMembers', 'manageTeams']
  if (enterprise.includes(cap)) return c[cap] === true
  return false
}

/**
 * Custom label shown on member cards (does not replace owner/admin/member access — use role for that).
 */
export async function updateMemberDisplayRole(orgId, targetUserId, actorUserId, displayRoleName) {
  const actor = await getMembership(orgId, actorUserId)
  if (!canManageOrg(actor) && !membershipHasCapability(actor, 'manageMembers')) {
    throw new Error('You do not have permission to update this member’s label.')
  }
  const targetMem = await getMembership(orgId, targetUserId)
  if (targetMem?.role === MEMBERSHIP_ROLES.owner) {
    throw new Error('The organization owner’s role label cannot be changed here.')
  }
  const ref = doc(db, MEMBERSHIPS_COLLECTION, membershipId(orgId, targetUserId))
  await updateDoc(ref, {
    displayRoleName: String(displayRoleName || '').trim() || null,
    updatedAt: serverTimestamp(),
  })
}

/** Persist fine-grained capability flags (admins or people with `manageMembers`). */
export async function updateMemberCapabilities(orgId, targetUserId, actorUserId, capabilities) {
  const actor = await getMembership(orgId, actorUserId)
  if (!canManageOrg(actor) && !membershipHasCapability(actor, 'manageMembers')) {
    throw new Error('You do not have permission to update member capabilities.')
  }
  const targetMem = await getMembership(orgId, targetUserId)
  if (targetMem?.role === MEMBERSHIP_ROLES.owner) {
    throw new Error('Organization owners always have full access; capability flags are not editable for owners.')
  }
  const ref = doc(db, MEMBERSHIPS_COLLECTION, membershipId(orgId, targetUserId))
  const n = normalizeMemberCapabilities(capabilities)
  await updateDoc(ref, {
    capabilities: {
      scheduleOrgMeetings: n.scheduleOrgMeetings,
      scheduleTeamMeetings: n.scheduleTeamMeetings,
      orgCalendar: n.orgCalendar,
      teamCalendar: n.teamCalendar,
      createTeams: n.createTeams,
      manageMembers: n.manageMembers,
      removeOrgMembers: n.removeOrgMembers,
      removeTeamMembers: n.removeTeamMembers,
      manageTeams: n.manageTeams,
    },
    updatedAt: serverTimestamp(),
  })
}
