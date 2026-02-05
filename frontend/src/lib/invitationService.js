/**
 * Organization invitations by email.
 * Invite users by email; they see invites in notifications and accept/decline.
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
import { getOrg, getMembership, canManageOrg, MEMBERSHIP_STATES, MEMBERSHIP_ROLES } from './orgService'

const INVITATIONS_COLLECTION = 'organizationInvitations'

export const INVITATION_STATUS = { pending: 'pending', accepted: 'accepted', rejected: 'rejected' }

function membershipId(orgId, userId) {
  return `${orgId}_${userId}`
}

/**
 * Create an organization invitation. Caller must be active org member with admin/owner role.
 */
export async function createOrgInvitation(orgId, inviteeEmail, inviterId, inviterName, inviterEmail, orgName) {
  const email = inviteeEmail.trim().toLowerCase()
  if (!email) throw new Error('Email is required.')

  const [org, membership] = await Promise.all([
    getOrg(orgId),
    getMembership(orgId, inviterId),
  ])
  if (!org || !membership || membership.state !== MEMBERSHIP_STATES.active) {
    throw new Error('You must be an active member to invite.')
  }
  if (!canManageOrg(membership)) {
    throw new Error('Only admins and owners can invite members.')
  }

  const ref = doc(collection(db, INVITATIONS_COLLECTION))
  await setDoc(ref, {
    orgId,
    orgName: orgName || org.name,
    inviterId,
    inviterName: inviterName || 'Someone',
    inviterEmail: (inviterEmail || '').trim(),
    inviteeEmail: email,
    status: INVITATION_STATUS.pending,
    createdAt: serverTimestamp(),
  })
  return { id: ref.id }
}

/**
 * Get pending invitations for a user (by their email).
 */
export async function getPendingInvitationsForEmail(email) {
  if (!email) return []
  const emailLower = email.trim().toLowerCase()
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('inviteeEmail', '==', emailLower),
    where('status', '==', INVITATION_STATUS.pending)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Accept an invitation. Creates membership and marks invitation as accepted.
 * User's email must match inviteeEmail.
 */
export async function acceptInvitation(invitationId, userId, userEmail) {
  const ref = doc(db, INVITATIONS_COLLECTION, invitationId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Invitation not found.')
  const inv = { id: snap.id, ...snap.data() }
  if (inv.status !== INVITATION_STATUS.pending) {
    throw new Error('This invitation has already been responded to.')
  }
  const userEmailLower = (userEmail || '').trim().toLowerCase()
  if (userEmailLower !== inv.inviteeEmail) {
    throw new Error('This invitation was sent to a different email address.')
  }

  const memRef = doc(db, 'memberships', membershipId(inv.orgId, userId))
  await setDoc(memRef, {
    orgId: inv.orgId,
    userId,
    role: MEMBERSHIP_ROLES.member,
    state: MEMBERSHIP_STATES.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await updateDoc(ref, {
    status: INVITATION_STATUS.accepted,
    respondedAt: serverTimestamp(),
    acceptedBy: userId,
  })

  return { orgId: inv.orgId, orgName: inv.orgName }
}

/**
 * Reject an invitation.
 */
export async function rejectInvitation(invitationId, userId, userEmail) {
  const ref = doc(db, INVITATIONS_COLLECTION, invitationId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Invitation not found.')
  const inv = { id: snap.id, ...snap.data() }
  if (inv.status !== INVITATION_STATUS.pending) {
    throw new Error('This invitation has already been responded to.')
  }
  const userEmailLower = (userEmail || '').trim().toLowerCase()
  if (userEmailLower !== inv.inviteeEmail) {
    throw new Error('This invitation was sent to a different email address.')
  }

  await updateDoc(ref, {
    status: INVITATION_STATUS.rejected,
    respondedAt: serverTimestamp(),
    rejectedBy: userId,
  })
}
