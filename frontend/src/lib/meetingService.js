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
  Timestamp,
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
 * Get meetings user can access within a specific org.
 */
export async function getMeetingsForUserInOrg(userId, orgId) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const snapshot = await getDocs(meetingsRef)
  const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  const accessible = []
  for (const m of meetings) {
    const canAccess = await canAccessMeeting(m, userId, orgId)
    if (canAccess) accessible.push(m)
  }
  accessible.sort((a, b) => {
    const aTime = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bTime = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bTime - aTime
  })
  return accessible.slice(0, 20)
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

/**
 * Get meetings in a date range for calendar view.
 * @param {string} orgId
 * @param {number} year
 * @param {number} month - 0-indexed
 * @param {string} [scope] - 'org' | 'team' | undefined (all)
 * @param {string} [scopeTeamId] - required if scope === 'team'
 */
export async function getMeetingsInRange(orgId, year, month, scope, scopeTeamId) {
  const start = Timestamp.fromDate(new Date(year, month, 1, 0, 0, 0))
  const end = Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59, 999))
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  let q
  if (scope === MEETING_SCOPES.team && scopeTeamId) {
    q = query(
      meetingsRef,
      where('scope', '==', MEETING_SCOPES.team),
      where('scopeTeamId', '==', scopeTeamId),
      where('startAt', '>=', start),
      where('startAt', '<=', end)
    )
  } else if (scope === MEETING_SCOPES.org) {
    q = query(
      meetingsRef,
      where('scope', '==', MEETING_SCOPES.org),
      where('startAt', '>=', start),
      where('startAt', '<=', end)
    )
  } else {
    q = query(
      meetingsRef,
      where('startAt', '>=', start),
      where('startAt', '<=', end)
    )
  }
  const snapshot = await getDocs(q)
  const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  meetings.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return aT - bT
  })
  return meetings
}

/**
 * Get meetings in range for a user within a specific org.
 */
export async function getMeetingsInRangeForUserInOrg(userId, orgId, year, month) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []
  const meetings = await getMeetingsInRange(orgId, year, month, null, null)
  const accessible = []
  for (const m of meetings) {
    const canAccess = await canAccessMeeting(m, userId, orgId)
    if (canAccess) {
      const org = await getOrg(orgId)
      accessible.push({ ...m, _orgName: org?.name })
    }
  }
  accessible.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return aT - bT
  })
  return accessible
}

/**
 * Get all meetings in range for a user (personal calendar - all orgs they can access).
 */
export async function getMeetingsInRangeForUser(userId, year, month) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  const allMeetings = []
  for (const mem of activeOrgs) {
    const meetings = await getMeetingsInRange(mem.orgId, year, month, null, null)
    for (const m of meetings) {
      const canAccess = await canAccessMeeting(m, userId, mem.orgId)
      if (canAccess) {
        const org = await getOrg(mem.orgId)
        allMeetings.push({ ...m, _orgName: org?.name })
      }
    }
  }
  allMeetings.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return aT - bT
  })
  return allMeetings
}
