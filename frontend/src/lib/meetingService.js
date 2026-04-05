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
} from './orgService'
import { createMeetingInviteNotifications } from './userNotificationService'
import { getTeamMembership, TEAM_STATES } from './teamService'

const MEETINGS_SUB = 'meetings'

export const MEETING_SCOPES = { org: 'org', team: 'team', private: 'private' }

/** How the meeting row was created — used to filter video lobby “upcoming”. */
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
 * Instant meetings that never got sessionStartedAt (abandoned / old clients): close so lobby doesn’t stick on “Running —”.
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

  if (!membershipHasCapability(orgMem, 'scheduleMeetings')) {
    throw new Error(
      'You do not have permission to create meetings or calendar events. Ask an organization admin to enable this for your role.'
    )
  }
  if (scope === MEETING_SCOPES.org && !inviteOnly && !membershipHasCapability(orgMem, 'orgCalendar')) {
    throw new Error(
      'You do not have permission to add events to the organization calendar. Use invite-only guests or ask an admin to enable org calendar access.'
    )
  }
  if (scope === MEETING_SCOPES.team && !membershipHasCapability(orgMem, 'teamCalendar')) {
    throw new Error(
      'You do not have permission to add events to team calendars. Ask an organization admin to enable this for your role.'
    )
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
    void createMeetingInviteNotifications({
      fromUid: userId,
      recipientUids: invitedUserIds,
      orgId,
      meetingId,
      title: t,
      body:
        createdVia === MEETING_CREATED_VIA.instant
          ? `${t}: quick meeting — open Video to join when you're ready.`
          : `${t}: you're invited${isVideoMeeting ? ' to a video meeting' : ''}. Open Calendar or Video to join.`,
      isInstant: createdVia === MEETING_CREATED_VIA.instant,
    }).catch(() => {})
  }

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
  const orgMem = await getMembership(orgId, userId)
  const isAdminOrOwner =
    orgMem?.state === MEMBERSHIP_STATES.active &&
    (orgMem.role === 'owner' || orgMem.role === 'admin')
  if (m.createdBy !== userId && !isAdminOrOwner) {
    throw new Error('Only the organizer or an org admin can update this event.')
  }

  const data = {}
  if (patch.title !== undefined) {
    const t = String(patch.title || '').trim()
    if (t) data.title = t
  }
  if (patch.description !== undefined) {
    data.description = String(patch.description || '').trim() || null
  }
  if (patch.invitedUserIds !== undefined) {
    const ids = [...new Set((Array.isArray(patch.invitedUserIds) ? patch.invitedUserIds : []).filter(Boolean))]
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
      throw new Error(
        'You cannot make this event visible to the whole organization without org calendar access for your role.'
      )
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
  const merged = []
  for (const mem of activeOrgs) {
    const part = await getUpcomingMeetingsInHorizonForUserInOrg(userId, mem.orgId, horizonDays, 45, options)
    for (const m of part) {
      const org = await getOrg(mem.orgId)
      merged.push({ ...m, _orgName: org?.name })
    }
  }
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
  return accessible.slice(0, maxResults)
}

/**
 * Get all meetings user can access (for personal dashboard).
 * Fetches from all orgs user is active in, filters by access.
 * @param {number} [maxResults=20]
 */
export async function getMeetingsForUser(userId, maxResults = 20) {
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
        allMeetings.push({ ...m, _orgName: org?.name, _orgId: mem.orgId })
      }
    }
  }
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
