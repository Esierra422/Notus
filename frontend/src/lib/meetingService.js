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
  deleteField,
} from 'firebase/firestore'
import { db } from './firebase'
import {
  getMembership,
  getUserMemberships,
  getOrg,
  MEMBERSHIP_STATES,
  membershipHasCapability,
  getCapabilityDeniedMessage,
} from './orgService'
import { createMeetingInviteNotifications } from './userNotificationService'
import { getTeamMembership, TEAM_STATES } from './teamService'
import { getUserDoc, getDisplayName } from './userService'

const MEETINGS_SUB = 'meetings'

export const MEETING_SCOPES = { org: 'org', team: 'team', private: 'private' }

/** Combined-calendar coloring: personal (private), org-wide, or team. */
export function meetingCalendarDisplaySource(meeting) {
  if (!meeting || meeting._todo || meeting._imported) return 'personal'
  if (meeting.scope === MEETING_SCOPES.private) return 'personal'
  if (meeting.scope === MEETING_SCOPES.team) return 'team'
  return 'org'
}

/** How the meeting row was created  -  used to filter video lobby “upcoming”. */
export const MEETING_CREATED_VIA = { calendar: 'calendar', instant: 'instant' }

/** Hide ad-hoc instant meetings from calendar grids and scheduled lists. */
export function isInstantMeetingRow(m) {
  return m?.createdVia === MEETING_CREATED_VIA.instant
}

export function filterOutInstantMeetings(list) {
  return (Array.isArray(list) ? list : []).filter((m) => !isInstantMeetingRow(m))
}

const VACANT_ROOM_END_MS = 5 * 60 * 1000
/**
 * Empty room, no vacantSince: only auto-end if the meeting row is at least this old (avoids racing a join).
 * Dormant listings past this window should disappear on the next lobby poll.
 */
const EMPTY_ROOM_MIN_MEETING_AGE_MS = 5 * 60 * 1000
/** Instant meetings: force-close after this long (stale participant docs, forgotten tabs). */
const INSTANT_ROOM_MAX_OPEN_MS = 90 * 60 * 1000
/**
 * Instant meetings that never got sessionStartedAt (abandoned / old clients): close so lobby doesn’t stick on “Running  - ”.
 */
const INSTANT_NO_SESSION_END_MS = 5 * 60 * 1000

function firestoreTimeToMs(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts.seconds === 'number') return ts.seconds * 1000
  return 0
}

/** True for ad-hoc / lobby “instant” rows; excludes explicit calendar-created meetings. */
function isInstantStyleMeeting(m) {
  if (m.createdVia === MEETING_CREATED_VIA.calendar) return false
  if (m.createdVia === MEETING_CREATED_VIA.instant) return true
  const t = String(m.title || '').trim().toLowerCase()
  if (m.createdVia == null && (t === 'instant meeting' || t === 'quick meeting')) return true
  return false
}

function mergeInvitedUserIds(data) {
  const fromIds = Array.isArray(data.invitedUserIds) ? data.invitedUserIds : []
  const fromScope = Array.isArray(data.scopeInviteList) ? data.scopeInviteList : []
  return [...new Set([...fromIds, ...fromScope].filter(Boolean))]
}

/** Display strings for meeting-invite bell notifications. */
async function getMeetingInviteNotificationContext(orgId, userId) {
  try {
    const [org, senderDoc] = await Promise.all([getOrg(orgId), getUserDoc(userId)])
    const orgName = (org?.name || '').trim() || 'Organization'
    const senderDisplayName = getDisplayName(senderDoc, userId).trim() || 'Someone'
    return { orgName, senderDisplayName }
  } catch {
    return { orgName: 'Organization', senderDisplayName: 'Someone' }
  }
}

/**
 * In-app copy + notification kind: calendar-only invites vs video / instant meeting invites.
 */
function buildMeetingInviteNotificationPayload(title, { isInstant, isVideoMeeting }) {
  const t = (title || 'Meeting').trim() || 'Meeting'
  if (isInstant) {
    return {
      body: `${t}: Quick meeting. Open Video to join when you are ready.`,
      isInstant: true,
      inviteKind: 'video_meeting',
    }
  }
  if (isVideoMeeting === false) {
    return {
      body: `${t}: Calendar invite. This event appears in your Calendar for this organization.`,
      isInstant: false,
      inviteKind: 'calendar_event',
    }
  }
  return {
    body: `${t}: Meeting invite. Open Video to join, or use Calendar to view it on your schedule.`,
    isInstant: false,
    inviteKind: 'video_meeting',
  }
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
  const createdVia =
    data.createdVia === MEETING_CREATED_VIA.instant
      ? MEETING_CREATED_VIA.instant
      : MEETING_CREATED_VIA.calendar
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  const timeZone = typeof data.timeZone === 'string' && data.timeZone.trim() ? data.timeZone.trim() : null
  const recurrence = data.recurrence && typeof data.recurrence === 'object' ? data.recurrence : null

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

  if (scope === MEETING_SCOPES.team) {
    if (!membershipHasCapability(orgMem, 'scheduleTeamMeetings')) {
      throw new Error(getCapabilityDeniedMessage('scheduleTeamMeetings'))
    }
  } else if (!membershipHasCapability(orgMem, 'scheduleOrgMeetings')) {
    throw new Error(getCapabilityDeniedMessage('scheduleOrgMeetings'))
  }
  if (scope === MEETING_SCOPES.org && !inviteOnly && !membershipHasCapability(orgMem, 'orgCalendar')) {
    throw new Error(getCapabilityDeniedMessage('orgCalendar'))
  }
  if (scope === MEETING_SCOPES.team && !membershipHasCapability(orgMem, 'teamCalendar')) {
    throw new Error(getCapabilityDeniedMessage('teamCalendar'))
  }

  await setDoc(meetingRef, {
    orgId,
    title: title || 'Meeting',
    description: description || null,
    scope,
    scopeTeamId: scope === MEETING_SCOPES.team ? scopeTeamId : null,
    scopeInviteList: scope === MEETING_SCOPES.private ? invitedUserIds : [],
    invitedUserIds,
    inviteOnly,
    startAt: startAt || serverTimestamp(),
    endAt: endAt || null,
    timeZone,
    recurrence,
    createdBy: userId,
    createdAt: serverTimestamp(),
    videoRoomId,
    transcriptSessionId,
    isVideoMeeting,
    createdVia,
  })

  if (invitedUserIds.length) {
    const t = title || 'Meeting'
    const { body, isInstant, inviteKind } = buildMeetingInviteNotificationPayload(t, {
      isInstant: createdVia === MEETING_CREATED_VIA.instant,
      isVideoMeeting,
    })
    void (async () => {
      const ctx = await getMeetingInviteNotificationContext(orgId, userId)
      return createMeetingInviteNotifications({
        fromUid: userId,
        recipientUids: invitedUserIds,
        orgId,
        meetingId,
        title: t,
        body,
        senderDisplayName: ctx.senderDisplayName,
        orgName: ctx.orgName,
        isInstant,
        inviteKind,
      })
    })().catch(() => {})
  }

  return {
    id: meetingId,
    orgId,
    title: title || 'Meeting',
    description: description || null,
    scope,
    scopeTeamId: scope === MEETING_SCOPES.team ? scopeTeamId : null,
    invitedUserIds,
    inviteOnly,
    startAt: startAt || null,
    endAt: endAt || null,
    timeZone,
    recurrence,
    videoRoomId,
    transcriptSessionId,
    createdBy: userId,
    isVideoMeeting,
    createdVia,
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
  const orgMem = await getMembership(orgId, userId)
  const isAdminOrOwner =
    orgMem?.state === MEMBERSHIP_STATES.active &&
    (orgMem.role === 'owner' || orgMem.role === 'admin')
  if (m.createdBy !== userId && !isAdminOrOwner) {
    throw new Error('Only the organizer or an org admin can update this event.')
  }

  const data = {}
  let addedInviteeIds = []
  if (patch.title !== undefined) {
    const t = String(patch.title || '').trim()
    if (t) data.title = t
  }
  if (patch.description !== undefined) {
    data.description = String(patch.description || '').trim() || null
  }
  if (patch.invitedUserIds !== undefined) {
    const prevSet = new Set(mergeInvitedUserIds(m))
    const ids = [...new Set((Array.isArray(patch.invitedUserIds) ? patch.invitedUserIds : []).filter(Boolean))]
    addedInviteeIds = ids.filter((id) => !prevSet.has(id))
    data.invitedUserIds = ids
    if (m.scope === MEETING_SCOPES.private) data.scopeInviteList = ids
  }
  if (patch.inviteOnly !== undefined) {
    const nextInviteOnly = patch.inviteOnly === true
    if (
      !nextInviteOnly &&
      m.scope === MEETING_SCOPES.org &&
      !membershipHasCapability(orgMem, 'orgCalendar')
    ) {
      throw new Error(getCapabilityDeniedMessage('orgCalendar'))
    }
    data.inviteOnly = nextInviteOnly
  }
  if (patch.isVideoMeeting !== undefined) data.isVideoMeeting = patch.isVideoMeeting !== false
  if (patch.startAt !== undefined && patch.startAt != null) data.startAt = patch.startAt
  if (patch.endAt !== undefined) data.endAt = patch.endAt
  if (patch.timeZone !== undefined) {
    data.timeZone = typeof patch.timeZone === 'string' && patch.timeZone.trim() ? patch.timeZone.trim() : null
  }
  if (patch.recurrence !== undefined) {
    data.recurrence = patch.recurrence && typeof patch.recurrence === 'object' ? patch.recurrence : null
  }
  if (
    patch.scope !== undefined &&
    [MEETING_SCOPES.org, MEETING_SCOPES.team, MEETING_SCOPES.private].includes(patch.scope)
  ) {
    const nextScope = patch.scope
    const nextTeamId = nextScope === MEETING_SCOPES.team ? patch.scopeTeamId || null : null
    if (nextScope === MEETING_SCOPES.team && !nextTeamId) {
      throw new Error('Team scope requires a team.')
    }
    if (nextScope === MEETING_SCOPES.team && !membershipHasCapability(orgMem, 'scheduleTeamMeetings')) {
      throw new Error(getCapabilityDeniedMessage('scheduleTeamMeetings'))
    }
    if (nextScope === MEETING_SCOPES.team && !membershipHasCapability(orgMem, 'teamCalendar')) {
      throw new Error(getCapabilityDeniedMessage('teamCalendar'))
    }
    if (nextScope === MEETING_SCOPES.org && !membershipHasCapability(orgMem, 'scheduleOrgMeetings')) {
      throw new Error(getCapabilityDeniedMessage('scheduleOrgMeetings'))
    }
    if (nextScope === MEETING_SCOPES.private && !membershipHasCapability(orgMem, 'scheduleOrgMeetings')) {
      throw new Error(getCapabilityDeniedMessage('scheduleOrgMeetings'))
    }
    data.scope = nextScope
    data.scopeTeamId = nextTeamId
    if (nextScope === MEETING_SCOPES.private) {
      data.scopeTeamId = null
    }
    if (nextScope === MEETING_SCOPES.org || nextScope === MEETING_SCOPES.team) {
      data.scopeInviteList = []
    }
  } else if (patch.scopeTeamId !== undefined && m.scope === MEETING_SCOPES.team) {
    if (!membershipHasCapability(orgMem, 'scheduleTeamMeetings')) {
      throw new Error(getCapabilityDeniedMessage('scheduleTeamMeetings'))
    }
    if (!membershipHasCapability(orgMem, 'teamCalendar')) {
      throw new Error(getCapabilityDeniedMessage('teamCalendar'))
    }
    data.scopeTeamId = patch.scopeTeamId || null
  }
  if (patch.addRecurrenceExceptionAtMs != null) {
    const ms = Number(patch.addRecurrenceExceptionAtMs)
    if (Number.isFinite(ms)) {
      const existing = Array.isArray(m.recurrenceExceptions) ? [...m.recurrenceExceptions] : []
      existing.push(Timestamp.fromMillis(ms))
      data.recurrenceExceptions = existing
    }
  }

  if (Object.keys(data).length === 0) return

  const effectiveScope = data.scope !== undefined ? data.scope : m.scope
  const effectiveInvited =
    data.invitedUserIds !== undefined ? data.invitedUserIds : mergeInvitedUserIds(m)
  if (effectiveScope === MEETING_SCOPES.private) {
    data.scopeInviteList = [...new Set((Array.isArray(effectiveInvited) ? effectiveInvited : []).filter(Boolean))]
  }

  await updateDoc(ref, data)

  if (addedInviteeIds.length > 0) {
    const t = (data.title !== undefined ? data.title : m.title) || 'Meeting'
    const isVideoMeetingEffective =
      data.isVideoMeeting !== undefined ? data.isVideoMeeting !== false : m.isVideoMeeting !== false
    const isInstant = m.createdVia === MEETING_CREATED_VIA.instant
    const { body, isInstant: payloadInstant, inviteKind } = buildMeetingInviteNotificationPayload(t, {
      isInstant,
      isVideoMeeting: isVideoMeetingEffective,
    })
    void (async () => {
      const ctx = await getMeetingInviteNotificationContext(orgId, userId)
      return createMeetingInviteNotifications({
        fromUid: userId,
        recipientUids: addedInviteeIds,
        orgId,
        meetingId,
        title: t,
        body,
        senderDisplayName: ctx.senderDisplayName,
        orgName: ctx.orgName,
        isInstant: payloadInstant,
        inviteKind,
      })
    })().catch(() => {})
  }
}

/**
 * Invitee declines a calendar/video invite: removes self from invitedUserIds (and private scopeInviteList).
 * Firestore rules allow this narrow update for active org members who were on the list.
 */
export async function declineMeetingInvite(orgId, meetingId, userId) {
  const ref = doc(db, 'organizations', orgId, MEETINGS_SUB, meetingId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Meeting not found.')
  const m = snap.data()
  const invited = [...new Set((Array.isArray(m.invitedUserIds) ? m.invitedUserIds : []).filter(Boolean))]
  if (!invited.includes(userId)) {
    throw new Error('You are not on the invite list for this event.')
  }
  const next = invited.filter((id) => id !== userId)
  const patch = { invitedUserIds: next }
  if (m.scope === MEETING_SCOPES.private) {
    patch.scopeInviteList = next
  }
  await updateDoc(ref, patch)
}

/**
 * Hide one occurrence of a recurring series (calendar UI). Same auth as updateMeeting.
 */
export async function deleteMeetingOccurrence(orgId, meetingId, userId, occurrenceStartMs) {
  return updateMeeting(orgId, meetingId, userId, { addRecurrenceExceptionAtMs: occurrenceStartMs })
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
 * Future video meetings the user can join (start time not in the past).
 */
export async function getUpcomingMeetingsForUserInOrg(userId, orgId, maxResults = 40) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  const now = Date.now()
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const q = query(
    meetingsRef,
    where('startAt', '>=', Timestamp.fromMillis(now)),
    orderBy('startAt', 'asc'),
    limit(maxResults * 2)
  )
  const snapshot = await getDocs(q)
  const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  const accessible = []
  for (const m of meetings) {
    if (m.isVideoMeeting === false) continue
    if (m.createdVia === MEETING_CREATED_VIA.instant) continue
    const startMs = m.startAt?.toMillis?.() ?? 0
    if (startMs < now) continue
    if (await canAccessMeeting(m, userId, orgId)) accessible.push(m)
    if (accessible.length >= maxResults) break
  }
  return accessible
}

/**
 * Upcoming video meetings in org: only events whose start time is still in the future (now → horizon).
 * Past starts are excluded; use the Ongoing section for active rooms.
 * @param {number} horizonDays - include events with startAt <= now + horizonDays
 */
/**
 * @param {{ includeNonVideo?: boolean }} [options] - If includeNonVideo, calendar-only events are included (dashboard).
 */
export async function getUpcomingMeetingsInHorizonForUserInOrg(userId, orgId, horizonDays, maxResults = 60, options = {}) {
  const includeNonVideo = options.includeNonVideo === true
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  const now = Date.now()
  const horizonEndMs = now + Math.max(1, horizonDays) * 86400000
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const q = query(
    meetingsRef,
    where('startAt', '>=', Timestamp.fromMillis(now)),
    orderBy('startAt', 'asc'),
    limit(120)
  )
  const snapshot = await getDocs(q)
  const out = []
  for (const d of snapshot.docs) {
    const m = { id: d.id, ...d.data() }
    if (!includeNonVideo && m.isVideoMeeting === false) continue
    if (m.createdVia === MEETING_CREATED_VIA.instant) continue
    const startMs = m.startAt?.toMillis?.() ?? 0
    if (startMs < now) continue
    if (startMs > horizonEndMs) continue
    const calEndMs = m.endAt?.toMillis?.() ?? null
    if (calEndMs != null && calEndMs < now) continue
    if (!(await canAccessMeeting(m, userId, orgId))) continue
    out.push({ ...m, orgId })
    if (out.length >= maxResults) break
  }
  return out
}

/**
 * Upcoming meetings across all active orgs for the user (merged, sorted by start).
 * @param {{ includeNonVideo?: boolean }} [options]
 */
export async function getUpcomingMeetingsInHorizonForUser(userId, horizonDays, maxTotal = 80, options = {}) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  const rows = await Promise.all(
    activeOrgs.map(async (mem) => {
      const [part, org] = await Promise.all([
        getUpcomingMeetingsInHorizonForUserInOrg(userId, mem.orgId, horizonDays, 45, options),
        getOrg(mem.orgId),
      ])
      const name = org?.name
      return part.map((m) => ({ ...m, _orgName: name }))
    })
  )
  const merged = rows.flat()
  merged.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0))
  return merged.slice(0, maxTotal)
}

const ROOM_STATE_CHUNK = 12

/**
 * Video meetings in this org the user may join whose Firestore room is still open (roomState/current exists and has no endedAt).
 * Scans recent meetings by start time, then checks room state in chunks (cheap enough for the lobby).
 *
 * @param {string} userId
 * @param {string} orgId
 * @param {{ lookbackDays?: number, maxMeetingsToCheck?: number }} [options]
 */
export async function getOngoingVideoMeetingsInOrg(userId, orgId, options = {}) {
  const lookbackDays = options.lookbackDays ?? 7
  const maxMeetingsToCheck = options.maxMeetingsToCheck ?? 80
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  const windowStart = Timestamp.fromDate(new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000))
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const q = query(
    meetingsRef,
    where('startAt', '>=', windowStart),
    orderBy('startAt', 'desc'),
    limit(maxMeetingsToCheck)
  )
  const snapshot = await getDocs(q)
  const accessChecks = await Promise.all(
    snapshot.docs.map(async (d) => {
      const m = { id: d.id, ...d.data() }
      if (m.isVideoMeeting === false) return null
      if (!(await canAccessMeeting(m, userId, orgId))) return null
      return m
    })
  )
  const candidates = accessChecks.filter(Boolean)

  const roomStateRef = (channel) => doc(db, 'videoChannels', channel, 'roomState', 'current')
  const openRooms = []
  for (let i = 0; i < candidates.length; i += ROOM_STATE_CHUNK) {
    const slice = candidates.slice(i, i + ROOM_STATE_CHUNK)
    const snaps = await Promise.all(slice.map((m) => getDoc(roomStateRef(getMeetingVideoRoomId(m, orgId)))))
    slice.forEach((m, j) => {
      const rs = snaps[j]
      if (!rs.exists()) return
      const data = rs.data() || {}
      if (data.endedAt) return
      openRooms.push({ ...m, orgId, _openRoomState: data })
    })
  }

  const ongoing = []
  for (let i = 0; i < openRooms.length; i += ROOM_STATE_CHUNK) {
    const slice = openRooms.slice(i, i + ROOM_STATE_CHUNK)
    const partSnaps = await Promise.all(
      slice.map((m) => getDocs(collection(db, 'videoChannels', getMeetingVideoRoomId(m, orgId), 'participants')))
    )
    slice.forEach((m, j) => {
      if (!partSnaps[j].empty) {
        const rsData = m._openRoomState || {}
        const sessionSt = rsData.sessionStartedAt ?? null
        const startAt = m.startAt ?? null
        const createdAt = m.createdAt ?? null
        const runningSince = sessionSt || startAt || createdAt
        const { _openRoomState, ...rest } = m
        ongoing.push({
          ...rest,
          _sessionStartedAt: runningSince,
          _participantCount: partSnaps[j].size,
        })
      }
    })
  }

  ongoing.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bT - aT
  })
  return ongoing
}

/**
 * Ongoing video rooms across every org the user is active in (merged list).
 */
export async function getOngoingVideoMeetingsForUser(userId, options = {}) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  const perOrg = await Promise.all(
    activeOrgs.map(async (mem) => {
      const list = await getOngoingVideoMeetingsInOrg(userId, mem.orgId, options)
      const org = await getOrg(mem.orgId)
      const name = org?.name || 'Organization'
      return list.map((item) => ({ ...item, _orgName: name }))
    })
  )
  const merged = perOrg.flat()
  merged.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bT - aT
  })
  return merged
}

/**
 * End rooms that have zero Firestore participants when it’s safe: either `vacantSince` is set (last
 * person left) or the meeting is old enough that an empty room is almost certainly abandoned.
 * Runs from the video lobby poll so “LIVE” rows don’t stick forever after everyone left.
 */
export async function endInstantRoomsWithoutSessionClock(userId) {
  const now = Date.now()
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  for (const mem of activeOrgs) {
    const orgId = mem.orgId
    const orgMem = await getMembership(orgId, userId)
    if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) continue

    const windowStart = Timestamp.fromDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))
    const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
    const q = query(meetingsRef, where('startAt', '>=', windowStart), orderBy('startAt', 'desc'), limit(100))
    const snapshot = await getDocs(q)

    for (const d of snapshot.docs) {
      const m = { id: d.id, ...d.data() }
      if (m.isVideoMeeting === false) continue
      if (!isInstantStyleMeeting(m)) continue
      if (!(await canAccessMeeting(m, userId, orgId))) continue
      const channel = getMeetingVideoRoomId(m, orgId)
      const roomRef = doc(db, 'videoChannels', channel, 'roomState', 'current')
      const rs = await getDoc(roomRef)
      if (!rs.exists()) continue
      const rd = rs.data() || {}
      if (rd.endedAt) continue
      if (rd.sessionStartedAt) continue
      const startMs = firestoreTimeToMs(m.startAt) || firestoreTimeToMs(m.createdAt)
      if (!startMs || now - startMs < INSTANT_NO_SESSION_END_MS) continue
      try {
        await updateDoc(roomRef, {
          endedAt: serverTimestamp(),
          endedBy: 'instant-no-session-clock',
          vacantSince: deleteField(),
          sessionStartedAt: deleteField(),
        })
      } catch (e) {
        console.warn('[endInstantRoomsWithoutSessionClock]', channel, e?.message || e)
      }
    }
  }
}

export async function endAgedInstantVideoRooms(userId) {
  const now = Date.now()
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  for (const mem of activeOrgs) {
    const orgId = mem.orgId
    const orgMem = await getMembership(orgId, userId)
    if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) continue

    const windowStart = Timestamp.fromDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))
    const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
    const q = query(meetingsRef, where('startAt', '>=', windowStart), orderBy('startAt', 'desc'), limit(100))
    const snapshot = await getDocs(q)

    for (const d of snapshot.docs) {
      const m = { id: d.id, ...d.data() }
      if (m.isVideoMeeting === false) continue
      if (!isInstantStyleMeeting(m)) continue
      if (!(await canAccessMeeting(m, userId, orgId))) continue
      const channel = getMeetingVideoRoomId(m, orgId)
      const roomRef = doc(db, 'videoChannels', channel, 'roomState', 'current')
      const rs = await getDoc(roomRef)
      if (!rs.exists()) continue
      const rd = rs.data() || {}
      if (rd.endedAt) continue
      const rowStartMs = firestoreTimeToMs(m.startAt) || firestoreTimeToMs(m.createdAt)
      const sessionMs = firestoreTimeToMs(rd.sessionStartedAt)
      const anchorMs = Math.max(rowStartMs, sessionMs)
      if (!anchorMs || now - anchorMs < INSTANT_ROOM_MAX_OPEN_MS) continue
      try {
        await updateDoc(roomRef, {
          endedAt: serverTimestamp(),
          endedBy: 'instant-max-age',
          vacantSince: deleteField(),
          sessionStartedAt: deleteField(),
        })
        const partSnap = await getDocs(collection(db, 'videoChannels', channel, 'participants'))
        for (const pd of partSnap.docs) {
          try {
            await deleteDoc(pd.ref)
          } catch (e) {
            console.warn('[endAgedInstantVideoRooms] participant', channel, e?.message || e)
          }
        }
      } catch (e) {
        console.warn('[endAgedInstantVideoRooms]', channel, e?.message || e)
      }
    }
  }
}

export async function closeStaleEmptyVideoRooms(userId) {
  const now = Date.now()
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  for (const mem of activeOrgs) {
    const orgId = mem.orgId
    const orgMem = await getMembership(orgId, userId)
    if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) continue

    const windowStart = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
    const q = query(meetingsRef, where('startAt', '>=', windowStart), orderBy('startAt', 'desc'), limit(80))
    const snapshot = await getDocs(q)

    for (const d of snapshot.docs) {
      const m = { id: d.id, ...d.data() }
      if (m.isVideoMeeting === false) continue
      if (!(await canAccessMeeting(m, userId, orgId))) continue
      const channel = getMeetingVideoRoomId(m, orgId)
      const roomRef = doc(db, 'videoChannels', channel, 'roomState', 'current')
      const rs = await getDoc(roomRef)
      if (!rs.exists()) continue
      const rd = rs.data() || {}
      if (rd.endedAt) continue
      const partSnap = await getDocs(collection(db, 'videoChannels', channel, 'participants'))
      if (!partSnap.empty) continue
      const startMs = m.startAt?.toMillis?.() ?? 0
      const meetingAgeMs = startMs ? now - startMs : 0
      const hasVacantSince = !!(rd.vacantSince?.toMillis?.() ?? 0)
      if (!hasVacantSince && meetingAgeMs < EMPTY_ROOM_MIN_MEETING_AGE_MS) continue
      try {
        await updateDoc(roomRef, {
          endedAt: serverTimestamp(),
          endedBy: 'empty-room-sync',
          vacantSince: deleteField(),
          sessionStartedAt: deleteField(),
        })
      } catch (e) {
        console.warn('[closeStaleEmptyVideoRooms]', channel, e?.message || e)
      }
    }
  }
}

/**
 * Remove stale participant docs when the room is already ended (fixes lobby "LIVE" after a proper end).
 * Safe: only touches meetings the user can access; only runs when roomState.endedAt is set.
 */
/**
 * For open video rooms, delete duplicate Firestore participant docs per firebaseUid (keeps newest joinedAt).
 * Stale tabs or reconnects can leave extra Agora uid rows and inflate lobby participant counts.
 */
export async function dedupeOpenVideoRoomParticipants(userId) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  for (const mem of activeOrgs) {
    const orgId = mem.orgId
    const orgMem = await getMembership(orgId, userId)
    if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) continue

    const windowStart = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
    const q = query(meetingsRef, where('startAt', '>=', windowStart), orderBy('startAt', 'desc'), limit(80))
    const snapshot = await getDocs(q)

    for (const d of snapshot.docs) {
      const m = { id: d.id, ...d.data() }
      if (m.isVideoMeeting === false) continue
      if (!(await canAccessMeeting(m, userId, orgId))) continue
      const channel = getMeetingVideoRoomId(m, orgId)
      const roomRef = doc(db, 'videoChannels', channel, 'roomState', 'current')
      const rs = await getDoc(roomRef)
      if (!rs.exists()) continue
      if ((rs.data() || {}).endedAt) continue
      const partSnap = await getDocs(collection(db, 'videoChannels', channel, 'participants'))
      if (partSnap.size < 2) continue

      const byFb = new Map()
      for (const pd of partSnap.docs) {
        const fb = pd.data()?.firebaseUid
        if (!fb || typeof fb !== 'string') continue
        if (!byFb.has(fb)) byFb.set(fb, [])
        byFb.get(fb).push(pd)
      }
      for (const [, docs] of byFb) {
        if (docs.length < 2) continue
        docs.sort(
          (a, b) =>
            (b.data().joinedAt?.toMillis?.() ?? 0) - (a.data().joinedAt?.toMillis?.() ?? 0)
        )
        for (let i = 1; i < docs.length; i++) {
          try {
            await deleteDoc(docs[i].ref)
          } catch (e) {
            console.warn('[dedupeOpenVideoRoomParticipants]', channel, e?.message || e)
          }
        }
      }
    }
  }
}

export async function purgeParticipantsForEndedRooms(userId) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  for (const mem of activeOrgs) {
    const orgId = mem.orgId
    const orgMem = await getMembership(orgId, userId)
    if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) continue

    const windowStart = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
    const q = query(meetingsRef, where('startAt', '>=', windowStart), orderBy('startAt', 'desc'), limit(60))
    const snapshot = await getDocs(q)

    for (const d of snapshot.docs) {
      const m = { id: d.id, ...d.data() }
      if (m.isVideoMeeting === false) continue
      if (!(await canAccessMeeting(m, userId, orgId))) continue
      const channel = getMeetingVideoRoomId(m, orgId)
      const roomRef = doc(db, 'videoChannels', channel, 'roomState', 'current')
      const rs = await getDoc(roomRef)
      if (!rs.exists()) continue
      const rd = rs.data() || {}
      if (!rd.endedAt) continue
      const partSnap = await getDocs(collection(db, 'videoChannels', channel, 'participants'))
      if (partSnap.empty) continue
      for (const pd of partSnap.docs) {
        try {
          await deleteDoc(pd.ref)
        } catch (e) {
          console.warn('[purgeParticipantsForEndedRooms]', channel, e?.message || e)
        }
      }
    }
  }
}

export async function sweepVacantVideoRooms(userId) {
  const now = Date.now()
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  for (const mem of activeOrgs) {
    const orgId = mem.orgId
    const orgMem = await getMembership(orgId, userId)
    if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) continue

    const windowStart = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
    const q = query(meetingsRef, where('startAt', '>=', windowStart), orderBy('startAt', 'desc'), limit(60))
    const snapshot = await getDocs(q)

    for (const d of snapshot.docs) {
      const m = { id: d.id, ...d.data() }
      if (m.isVideoMeeting === false) continue
      if (!(await canAccessMeeting(m, userId, orgId))) continue
      const channel = getMeetingVideoRoomId(m, orgId)
      const roomRef = doc(db, 'videoChannels', channel, 'roomState', 'current')
      const rs = await getDoc(roomRef)
      if (!rs.exists()) continue
      const rd = rs.data() || {}
      if (rd.endedAt) continue
      const partSnap = await getDocs(collection(db, 'videoChannels', channel, 'participants'))
      if (!partSnap.empty) continue
      const vs = rd.vacantSince?.toMillis?.() ?? 0
      if (!vs || now - vs < VACANT_ROOM_END_MS) continue
      try {
        await updateDoc(roomRef, {
          endedAt: serverTimestamp(),
          endedBy: 'vacant-timeout',
          vacantSince: deleteField(),
          sessionStartedAt: deleteField(),
        })
      } catch (e) {
        console.warn('[sweepVacantVideoRooms]', channel, e?.message || e)
      }
    }
  }
}

/**
 * Find a meeting by Firestore document id across orgs the user belongs to (first accessible match).
 */
export async function resolveMeetingByIdAcrossOrgs(userId, meetingId) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  const id = String(meetingId || '').trim()
  if (!id) return null
  for (const mem of activeOrgs) {
    const ref = doc(db, 'organizations', mem.orgId, MEETINGS_SUB, id)
    const snap = await getDoc(ref)
    if (!snap.exists()) continue
    const m = { id: snap.id, ...snap.data(), orgId: mem.orgId }
    if (await canAccessMeeting(m, userId, mem.orgId)) return m
  }
  return null
}

/**
 * Create an ad-hoc meeting starting now (org-wide) and return ids for video + transcript.
 * @param {string} orgId
 * @param {string} userId
 * @param {string | { title?: string }} titleOrOpts - legacy string title, or { title }
 */
export async function createInstantMeeting(orgId, userId, titleOrOpts = 'Quick meeting') {
  const opts = typeof titleOrOpts === 'string' ? { title: titleOrOpts } : titleOrOpts || {}
  const title = (opts.title && String(opts.title).trim()) || 'Quick meeting'
  const description = typeof opts.description === 'string' ? opts.description.trim() : ''
  const rawInvites = mergeInvitedUserIds({ invitedUserIds: opts.invitedUserIds || [] })
  const vis = opts.visibility === 'team' ? 'team' : opts.visibility === 'invited' ? 'invited' : 'org'
  let scope = MEETING_SCOPES.org
  let scopeTeamId = null
  let inviteOnly = false
  let invitedUserIds = []
  if (vis === 'team' && opts.scopeTeamId) {
    scope = MEETING_SCOPES.team
    scopeTeamId = opts.scopeTeamId
  } else if (vis === 'invited' && rawInvites.length) {
    inviteOnly = true
    invitedUserIds = rawInvites
  } else {
    invitedUserIds = rawInvites
    inviteOnly = opts.inviteOnly === true && rawInvites.length > 0
  }
  const endAt = Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000))
  return createMeeting(
    orgId,
    {
      scope,
      scopeTeamId,
      title,
      description,
      startAt: serverTimestamp(),
      endAt,
      isVideoMeeting: true,
      createdVia: MEETING_CREATED_VIA.instant,
      invitedUserIds,
      inviteOnly,
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
 * @param {number} [maxResults=20]
 */
export async function getMeetingsForUserInOrg(userId, orgId, maxResults = 20) {
  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  const fetchLimit = Math.min(500, Math.max(maxResults * 3, 40))
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const snapshot = await getDocs(
    query(meetingsRef, orderBy('startAt', 'desc'), limit(fetchLimit))
  )
  const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  const accessRows = await Promise.all(
    meetings.map(async (m) => ((await canAccessMeeting(m, userId, orgId)) ? m : null))
  )
  const accessible = accessRows.filter(Boolean)
  accessible.sort((a, b) => {
    const aTime = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bTime = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bTime - aTime
  })
  return accessible.slice(0, maxResults)
}

/**
 * Team-scoped upcoming meetings for the roster (user must pass canAccessMeeting).
 */
export async function getUpcomingTeamMeetingsForUser(userId, orgId, teamId, options = {}) {
  const maxResults = options.maxResults ?? 12
  const horizonDays = options.horizonDays ?? 90
  const now = Date.now()
  const horizonEnd = now + horizonDays * 24 * 60 * 60 * 1000
  const raw = await getTeamMeetings(orgId, teamId)
  const upcoming = []
  for (const m of raw) {
    if (isInstantMeetingRow(m)) continue
    if (!(await canAccessMeeting(m, userId, orgId))) continue
    const t = firestoreTimeToMs(m.startAt)
    if (t < now || t > horizonEnd) continue
    upcoming.push({ ...m, orgId })
  }
  upcoming.sort((a, b) => firestoreTimeToMs(a.startAt) - firestoreTimeToMs(b.startAt))
  return upcoming.slice(0, maxResults)
}

/**
 * Upcoming rows for a Team page: team-scoped + org-scoped scheduled rows visible to the user.
 * Includes calendar-only events and video meetings; excludes instant/quick meetings.
 */
export async function getUpcomingTeamAndOrgMeetingsForUserInOrg(userId, orgId, teamId, options = {}) {
  const maxResults = options.maxResults ?? 12
  const horizonDays = options.horizonDays ?? 30
  const now = Date.now()
  const horizonEnd = now + Math.max(1, horizonDays) * 24 * 60 * 60 * 1000

  const orgMem = await getMembership(orgId, userId)
  if (!orgMem || orgMem.state !== MEMBERSHIP_STATES.active) return []

  // Fetch a generous window, then filter by access and scope.
  const fetchLimit = Math.min(250, Math.max(80, maxResults * 12))
  const meetingsRef = collection(db, 'organizations', orgId, MEETINGS_SUB)
  const start = Timestamp.fromDate(new Date(now - 60_000)) // small grace to avoid clock edge
  const end = Timestamp.fromDate(new Date(horizonEnd))
  const snapshot = await getDocs(
    query(meetingsRef, where('startAt', '>=', start), where('startAt', '<=', end), orderBy('startAt', 'asc'), limit(fetchLimit))
  )
  const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data(), orgId }))

  const out = []
  for (const m of rows) {
    if (isInstantMeetingRow(m)) continue
    // Team page shows org-scope and the current team scope only.
    if (m.scope === MEETING_SCOPES.team && m.scopeTeamId !== teamId) continue
    if (m.scope && m.scope !== MEETING_SCOPES.org && m.scope !== MEETING_SCOPES.team) continue
    if (!(await canAccessMeeting(m, userId, orgId))) continue
    const t = firestoreTimeToMs(m.startAt)
    if (!t || t < now || t > horizonEnd) continue
    out.push(m)
  }
  out.sort((a, b) => firestoreTimeToMs(a.startAt) - firestoreTimeToMs(b.startAt))
  return out.slice(0, maxResults)
}

/**
 * Get all meetings user can access (for personal dashboard).
 * Fetches from all orgs user is active in, filters by access.
 * @param {number} [maxResults=20]
 */
export async function getMeetingsForUser(userId, maxResults = 20) {
  const memberships = await getUserMemberships(userId)
  const activeOrgs = memberships.filter((m) => m.state === MEMBERSHIP_STATES.active)
  if (!activeOrgs.length) return []

  const n = activeOrgs.length
  const perOrgLimit = Math.min(500, Math.max(25, Math.ceil((maxResults * 1.5) / n)))

  const chunks = await Promise.all(
    activeOrgs.map(async (mem) => {
      const orgId = mem.orgId
      const [orgSnap, snapshot] = await Promise.all([
        getOrg(orgId),
        getDocs(
          query(
            collection(db, 'organizations', orgId, MEETINGS_SUB),
            orderBy('startAt', 'desc'),
            limit(perOrgLimit)
          )
        ),
      ])
      const orgName = orgSnap?.name || 'Organization'
      const meetings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      const rows = await Promise.all(
        meetings.map(async (m) => {
          if (!(await canAccessMeeting(m, userId, orgId))) return null
          return { ...m, _orgName: orgName, _orgId: orgId }
        })
      )
      return rows.filter(Boolean)
    })
  )
  const allMeetings = chunks.flat()
  allMeetings.sort((a, b) => {
    const aTime = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bTime = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return bTime - aTime
  })
  return allMeetings.slice(0, maxResults)
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
  const [meetings, org] = await Promise.all([
    getMeetingsInRange(orgId, year, month, null, null),
    getOrg(orgId),
  ])
  const orgName = org?.name
  const accessible = []
  for (const m of meetings) {
    if (isInstantMeetingRow(m)) continue
    const canAccess = await canAccessMeeting(m, userId, orgId)
    if (canAccess) {
      accessible.push({ ...m, _orgName: orgName })
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
  const perOrg = await Promise.all(
    activeOrgs.map(async (mem) => {
      const [meetings, org] = await Promise.all([
        getMeetingsInRange(mem.orgId, year, month, null, null),
        getOrg(mem.orgId),
      ])
      const orgName = org?.name
      const out = []
      for (const m of meetings) {
        if (isInstantMeetingRow(m)) continue
        if (await canAccessMeeting(m, userId, mem.orgId)) {
          out.push({ ...m, _orgName: orgName, _orgId: mem.orgId })
        }
      }
      return out
    })
  )
  const allMeetings = perOrg.flat()
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

  const [meetings, org] = await Promise.all([
    getMeetingsInRange(orgId, year, month, null, null),
    getOrg(orgId),
  ])
  const orgName = org?.name
  const accessible = []
  for (const m of meetings) {
    if (isInstantMeetingRow(m)) continue
    if (m.scope !== MEETING_SCOPES.team || m.scopeTeamId !== teamId) continue
    if (await canAccessMeeting(m, userId, orgId)) {
      accessible.push({ ...m, _orgName: orgName })
    }
  }
  accessible.sort((a, b) => {
    const aT = a.startAt?.toMillis?.() ?? a.startAt ?? 0
    const bT = b.startAt?.toMillis?.() ?? b.startAt ?? 0
    return aT - bT
  })
  return accessible
}
