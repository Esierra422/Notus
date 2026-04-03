/**
 * Meeting service. Meetings belong to an organization.
 * One meeting has exactly one scope: org | team | private
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { getMembership, getUserMemberships, getOrg, MEMBERSHIP_STATES } from './orgService'
import { getTeamMembership, TEAM_STATES } from './teamService'

const MEETINGS_SUB = 'meetings'

export const MEETING_SCOPES = { org: 'org', team: 'team', private: 'private' }

function mergeInvitedUserIds(data) {
  const fromIds = Array.isArray(data.invitedUserIds) ? data.invitedUserIds : []
  const fromScope = Array.isArray(data.scopeInviteList) ? data.scopeInviteList : []
  return [...new Set([...fromIds, ...fromScope].filter(Boolean))]
}

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
  const videoRoomId = `notus_${orgId}_${meetingId}`
  const transcriptSessionId =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${meetingId}_${Date.now()}`

  const { scope, scopeTeamId, title, startAt, endAt } = data
  const invitedUserIds = mergeInvitedUserIds(data)
  const inviteOnly = data.inviteOnly === true
  const isVideoMeeting = data.isVideoMeeting !== false

  if (![MEETING_SCOPES.org, MEETING_SCOPES.team, MEETING_SCOPES.private].includes(scope)) {
    throw new Error('Invalid meeting scope.')
  }
  if (scope === MEETING_SCOPES.team && !scopeTeamId) throw new Error('Team scope requires scopeTeamId.')
  if (scope === MEETING_SCOPES.private) {
    const hasScopeList = Array.isArray(data.scopeInviteList)
    const hasInvited = Array.isArray(data.invitedUserIds)
    if (!hasScopeList && !hasInvited) {
      throw new Error('Private scope requires scopeInviteList or invitedUserIds array.')
    }
  }

  await setDoc(meetingRef, {
    orgId,
    title: title || 'Meeting',
    scope,
    scopeTeamId: scope === MEETING_SCOPES.team ? scopeTeamId : null,
    scopeInviteList: scope === MEETING_SCOPES.private ? invitedUserIds : [],
    invitedUserIds,
    inviteOnly,
    startAt: startAt || serverTimestamp(),
    endAt: endAt || null,
    createdBy: userId,
    createdAt: serverTimestamp(),
    videoRoomId,
    transcriptSessionId,
    isVideoMeeting,
  })

  return {
    id: meetingId,
    orgId,
    title: title || 'Meeting',
    scope,
    videoRoomId,
    transcriptSessionId,
    createdBy: userId,
    isVideoMeeting,
  }
}

/**
 * Update an org meeting/event. Only the creator may update.
 */
export async function updateMeeting(orgId, meetingId, userId, patch) {
  const ref = doc(db, 'organizations', orgId, MEETINGS_SUB, meetingId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Meeting not found.')
  const m = snap.data()
  if (m.createdBy !== userId) throw new Error('Only the organizer can update this event.')

  const data = {}
  if (patch.title !== undefined) {
    const t = String(patch.title || '').trim()
    if (t) data.title = t
  }
  if (patch.invitedUserIds !== undefined) {
    const ids = [...new Set((Array.isArray(patch.invitedUserIds) ? patch.invitedUserIds : []).filter(Boolean))]
    data.invitedUserIds = ids
    if (m.scope === MEETING_SCOPES.private) data.scopeInviteList = ids
  }
  if (patch.inviteOnly !== undefined) data.inviteOnly = patch.inviteOnly === true
  if (patch.isVideoMeeting !== undefined) data.isVideoMeeting = patch.isVideoMeeting !== false
  if (patch.startAt !== undefined && patch.startAt != null) data.startAt = patch.startAt

  if (Object.keys(data).length === 0) return
  await updateDoc(ref, data)
}

/** Stable Agora room id for an org meeting (works for older docs without videoRoomId). */
export function getMeetingVideoRoomId(meeting, orgId) {
  if (!meeting?.id || !orgId) return ''
  return meeting.videoRoomId || `notus_${orgId}_${meeting.id}`
}

/** Shared transcript session for this calendar row (all participants append here). */
export function getMeetingTranscriptSessionId(meeting, orgId) {
  if (!meeting?.id || !orgId) return ''
  return meeting.transcriptSessionId || `legacy_${orgId}_${meeting.id}`
}

/**
 * Upcoming / in-progress meetings the user can join (next ~7 days window start).
 */
export async function getUpcomingMeetingsForUserInOrg(userId, orgId, maxResults = 40) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  const windowStart = Timestamp.fromDate(new Date(Date.now() - 6 * 60 * 60 * 1000))
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const q = query(
    meetingsRef,
    where('startAt', '>=', windowStart),
    orderBy('startAt', 'asc'),
    limit(maxResults * 2)
  )
  const snapshot = await getDocs(q)
  const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  const accessible = []
  for (const m of meetings) {
    if (m.isVideoMeeting === false) continue
    if (await canAccessMeeting(m, userId, orgId)) accessible.push(m)
    if (accessible.length >= maxResults) break
  }
  return accessible
}

/**
 * Create an ad-hoc meeting starting now (org-wide) and return ids for video + transcript.
 */
export async function createInstantMeeting(orgId, userId, title = 'Instant meeting') {
  const endAt = Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000))
  return createMeeting(
    orgId,
    {
      scope: MEETING_SCOPES.org,
      title,
      startAt: serverTimestamp(),
      endAt,
      isVideoMeeting: true,
    },
    userId
  )
}

/**
 * Delete a meeting. Only the creator or org admin/owner may delete.
 */
export async function deleteMeeting(orgId, meetingId, userId) {
  const meetingRef = doc(db, 'organizations', orgId, MEETINGS_SUB, meetingId)
  const snap = await getDoc(meetingRef)
  if (!snap.exists()) throw new Error('Meeting not found.')

  const meeting = snap.data()
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('Not an active org member.')
  }

  const isCreator = meeting.createdBy === userId
  const isAdminOrOwner = orgMem.role === 'admin' || orgMem.role === 'owner'
  if (!isCreator && !isAdminOrOwner) {
    throw new Error('Only the meeting creator or an org admin can delete meetings.')
  }

  await deleteDoc(meetingRef)
}

/**
 * Check if user can access a meeting based on scope.
 */
export async function canAccessMeeting(meeting, userId, orgId) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return false

  const invited = Array.isArray(meeting.invitedUserIds) ? meeting.invitedUserIds.filter(Boolean) : []
  const inviteOnly = meeting.inviteOnly === true

  if (meeting.createdBy === userId) return true

  if (inviteOnly) {
    return invited.includes(userId)
  }

  if (invited.includes(userId)) return true

  if (meeting.scope === MEETING_SCOPES.org) return true
  if (meeting.scope === MEETING_SCOPES.team) {
    const teamMem = await getTeamMembership(orgId, meeting.scopeTeamId, userId)
    return teamMem?.state === TEAM_STATES.active
  }
  if (meeting.scope === MEETING_SCOPES.private) {
    const list = Array.isArray(meeting.scopeInviteList) ? meeting.scopeInviteList : []
    return list.includes(userId)
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
 * Org-scoped meetings the user is allowed to see (excludes invite-only meetings they are not on).
 */
export async function getOrgMeetingsForUser(orgId, userId) {
  const list = await getOrgMeetings(orgId)
  const out = []
  for (const m of list) {
    if (await canAccessMeeting(m, userId, orgId)) out.push(m)
  }
  return out
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

/**
 * Team-scoped meetings in a month the user can access (includes invited non-team members).
 */
export async function getMeetingsInRangeForUserInTeam(userId, orgId, teamId, year, month) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  const meetings = await getMeetingsInRange(orgId, year, month, null, null)
  const accessible = []
  for (const m of meetings) {
    if (m.scope !== MEETING_SCOPES.team || m.scopeTeamId !== teamId) continue
    if (await canAccessMeeting(m, userId, orgId)) {
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
