/**
 * Meeting service. Meetings belong to an organization.
 * One meeting has exactly one scope: org | team | private
 */
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { getMembership, getUserMemberships, getOrg, MEMBERSHIP_STATES } from './orgService'
import { getTeamMembership, TEAM_STATES } from './teamService'

const MEETINGS_SUB = 'meetings'

export const MEETING_SCOPES = { org: 'org', team: 'team', private: 'private' }

/**
 * Create a meeting. Caller must have access to create in org.
 */
export async function createMeeting(orgId, data, userId) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('Must be org member to create meetings.')
  }

  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const meetingRef = doc(meetingsRef)
  const meetingId = meetingRef.id

  const { scope, scopeTeamId, scopeInviteList = [], title, startAt, endAt } = data
  if (![MEETING_SCOPES.org, MEETING_SCOPES.team, MEETING_SCOPES.private].includes(scope)) {
    throw new Error('Invalid meeting scope.')
  }
  if (scope === MEETING_SCOPES.team && !scopeTeamId) throw new Error('Team scope requires scopeTeamId.')
  if (scope === MEETING_SCOPES.private && !Array.isArray(scopeInviteList)) {
    throw new Error('Private scope requires scopeInviteList array.')
  }

  await setDoc(meetingRef, {
    orgId,
    title: title || 'Meeting',
    scope,
    scopeTeamId: scope === MEETING_SCOPES.team ? scopeTeamId : null,
    scopeInviteList: scope === MEETING_SCOPES.private ? scopeInviteList : [],
    startAt: startAt || serverTimestamp(),
    endAt: endAt || null,
    createdBy: userId,
    createdAt: serverTimestamp(),
  })

  return { id: meetingId, orgId, title: title || 'Meeting', scope }
}

/**
 * Check if user can access a meeting based on scope.
 */
export async function canAccessMeeting(meeting, userId, orgId) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return false

  if (meeting.scope === MEETING_SCOPES.org) return true
  if (meeting.scope === MEETING_SCOPES.team) {
    const teamMem = await getTeamMembership(orgId, meeting.scopeTeamId, userId)
    return teamMem?.state === TEAM_STATES.active
  }
  if (meeting.scope === MEETING_SCOPES.private) {
    return Array.isArray(meeting.scopeInviteList) && meeting.scopeInviteList.includes(userId)
  }
  return false
}

/**
 * Get org-scoped meetings for an org.
 */
export async function getOrgMeetings(orgId) {
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const q = query(meetingsRef, where('scope', '==', MEETING_SCOPES.org))
  const snapshot = await getDocs(q)
  const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  meetings.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bT - aT
  })
  return meetings
}

/**
 * Get team-scoped meetings for a team.
 */
export async function getTeamMeetings(orgId, teamId) {
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const q = query(
    meetingsRef,
    where('scope', '==', MEETING_SCOPES.team),
    where('scopeTeamId', '==', teamId)
  )
  const snapshot = await getDocs(q)
  const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  meetings.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bT - aT
  })
  return meetings
}

/**
 * Get all meetings user can access (for personal dashboard).
 * Fetches from all orgs user is active in, filters by access.
 */
export async function getMeetingsForUser(userId) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)

  const allMeetings = []
  for (const mem of activeOrgs) {
    const meetingsRef = collection(db, 'organizations', mem.orgId, MEETINGS_SUB)
    const snapshot = await getDocs(meetingsRef)
    const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    for (const m of meetings) {
      const canAccess = await canAccessMeeting(m, userId, mem.orgId)
      if (canAccess) {
        const org = await getOrg(mem.orgId)
        allMeetings.push({ ...m, _orgName: org?.name })
      }
    }
  }
  allMeetings.sort((a, b) => {
    const aTime = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bTime = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bTime - aTime
  })
  return allMeetings.slice(0, 20)
}
