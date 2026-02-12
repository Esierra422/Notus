/**
 * Team invitations by email.
 * Invite org members to a team; they see invites in notifications and accept/decline.
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
import { getOrg, getMembership, getOrgMembers, MEMBERSHIP_STATES } from './orgService'
import { getTeam, getTeamMembership, canManageTeam, getTeamMembers, TEAM_STATES, TEAM_ROLES } from './teamService'
import { getUserDoc } from './userService'

const INVITATIONS_COLLECTION = 'teamInvitations'

export const TEAM_INVITATION_STATUS = { pending: 'pending', accepted: 'accepted', rejected: 'rejected' }

function teamMembershipId(teamId, userId) {
  return `${teamId}_${userId}`
}

/**
 * Create a team invitation. Caller must be team admin or org admin/owner.
 * Invitee must be an active org member (only people in the organization can be invited).
 */
export async function createTeamInvitation(orgId, teamId, inviteeEmail, inviterId, inviterName, inviterEmail, teamName, orgName) {
  const email = inviteeEmail.trim().toLowerCase()
  if (!email) throw new Error('Email is required.')

  const [org, team, membership, teamMembership, orgMembersList] = await Promise.all([
    getOrg(orgId),
    getTeam(orgId, teamId),
    getMembership(orgId, inviterId),
    getTeamMembership(orgId, teamId, inviterId),
    getOrgMembers(orgId),
  ])
  if (!org || !team || !membership || membership.state !== MEMBERSHIP_STATES.active) {
    throw new Error('You must be an active org member to invite.')
  }
  if (!canManageTeam(teamMembership, membership)) {
    throw new Error('Only team admins or org admins can invite to this team.')
  }

  const activeOrgMembers = orgMembersList.filter((m) => m.state === MEMBERSHIP_STATES.active)
  let inviteeUserId = null
  for (const m of activeOrgMembers) {
    const userDoc = await getUserDoc(m.userId)
    const memEmail = (userDoc?.email || '').trim().toLowerCase()
    if (memEmail === email) {
      inviteeUserId = m.userId
      break
    }
  }
  if (!inviteeUserId) {
    throw new Error('You can only invite people who are already in the organization. This email is not associated with an org member.')
  }

  const teamMembers = await getTeamMembers(orgId, teamId)
  const alreadyInTeam = teamMembers.some((m) => m.userId === inviteeUserId && m.state === TEAM_STATES.active)
  if (alreadyInTeam) {
    throw new Error('This person is already a member of the team.')
  }

  const pendingInTeam = teamMembers.some((m) => m.userId === inviteeUserId && m.state === TEAM_STATES.pending)
  if (pendingInTeam) {
    throw new Error('This person already has a pending request to join the team.')
  }

  const ref = doc(collection(db, INVITATIONS_COLLECTION))
  await setDoc(ref, {
    orgId,
    orgName: orgName || org.name,
    teamId,
    teamName: teamName || team.name,
    inviterId,
    inviterName: inviterName || 'Someone',
    inviterEmail: (inviterEmail || '').trim(),
    inviteeEmail: email,
    status: TEAM_INVITATION_STATUS.pending,
    createdAt: serverTimestamp(),
  })
  return { id: ref.id }
}

/**
 * Get pending team invitations for a user (by their email).
 */
export async function getPendingTeamInvitationsForEmail(email) {
  if (!email) return []
  const emailLower = email.trim().toLowerCase()
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('inviteeEmail', '==', emailLower),
    where('status', '==', TEAM_INVITATION_STATUS.pending)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Accept a team invitation. Creates team membership and marks invitation as accepted.
 */
export async function acceptTeamInvitation(invitationId, userId, userEmail) {
  const ref = doc(db, INVITATIONS_COLLECTION, invitationId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Invitation not found.')
  const inv = { id: snap.id, ...snap.data() }
  if (inv.status !== TEAM_INVITATION_STATUS.pending) {
    throw new Error('This invitation has already been responded to.')
  }
  const userEmailLower = (userEmail || '').trim().toLowerCase()
  if (userEmailLower !== inv.inviteeEmail) {
    throw new Error('This invitation was sent to a different email address.')
  }

  const orgMem = await getMembership(inv.orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('You must be an org member to join teams.')
  }

  const memRef = doc(db, 'organizations', inv.orgId, 'teamMemberships', teamMembershipId(inv.teamId, userId))
  await setDoc(memRef, {
    teamId: inv.teamId,
    userId,
    role: TEAM_ROLES.member,
    state: TEAM_STATES.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await updateDoc(ref, {
    status: TEAM_INVITATION_STATUS.accepted,
    respondedAt: serverTimestamp(),
    acceptedBy: userId,
  })

  return { orgId: inv.orgId, teamId: inv.teamId, teamName: inv.teamName }
}

/**
 * Get rejected team invitations for a team (invitations that were declined).
 */
export async function getRejectedTeamInvitations(orgId, teamId) {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('orgId', '==', orgId),
    where('teamId', '==', teamId),
    where('status', '==', TEAM_INVITATION_STATUS.rejected)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Reject a team invitation.
 */
export async function rejectTeamInvitation(invitationId, userId, userEmail) {
  const ref = doc(db, INVITATIONS_COLLECTION, invitationId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Invitation not found.')
  const inv = { id: snap.id, ...snap.data() }
  if (inv.status !== TEAM_INVITATION_STATUS.pending) {
    throw new Error('This invitation has already been responded to.')
  }
  const userEmailLower = (userEmail || '').trim().toLowerCase()
  if (userEmailLower !== inv.inviteeEmail) {
    throw new Error('This invitation was sent to a different email address.')
  }

  await updateDoc(ref, {
    status: TEAM_INVITATION_STATUS.rejected,
    respondedAt: serverTimestamp(),
    rejectedBy: userId,
  })
}
