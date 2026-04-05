import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useOutletContext, useSearchParams, useNavigate, useParams, Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Notepad } from '../pages/Notepad'
import '../styles/variables.css'
import './AppLayout.css'
import './VideoCallPage.css'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MessageSquare,
  Bot,
  LogOut,
  NotebookPen,
  Monitor,
  MoreVertical,
  Copy,
  Info,
  RefreshCw,
  Users,
  Clock,
} from 'lucide-react'

import * as videoApp from '../lib/videoAppService.js'
import { getUserDoc, getProfilePictureUrl } from '../lib/userService.js'
import { getAiRestHttpBase } from '../lib/apiConfig.js'
import { generateMeetingSummary } from '../lib/meetingSummaryService.js'
import {
  canAccessMeeting,
  createInstantMeeting,
  getMeetingTranscriptSessionId,
  getMeetingVideoRoomId,
  getOngoingVideoMeetingsInOrg,
  getOngoingVideoMeetingsForUser,
  resolveMeetingByIdAcrossOrgs,
  getUpcomingMeetingsInHorizonForUser,
  getUpcomingMeetingsInHorizonForUserInOrg,
  sweepVacantVideoRooms,
  closeStaleEmptyVideoRooms,
  endInstantRoomsWithoutSessionClock,
  endAgedInstantVideoRooms,
  purgeParticipantsForEndedRooms,
  dedupeOpenVideoRoomParticipants,
} from '../lib/meetingService.js'
import { getActiveMemberships, getOrg, getMembership, MEMBERSHIP_STATES } from '../lib/orgService.js'
import { CreateEventModal } from '../components/calendar/CreateEventModal.jsx'
import { db } from '../lib/firebase.js'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  arrayUnion,
  deleteField,
} from 'firebase/firestore'

function toFriendlyError(err) {
  const msg = err?.message || String(err)
  const prodHint = " On the live site, deploy the backend to Render (free) and set VITE_API_URL—see README: Production video (free)."
  if (/load failed|failed to fetch|network error|cors|access control/i.test(msg))
    return "Couldn't reach the video server." + prodHint
  if (/json|parse|unexpected token|invalid response/i.test(msg))
    return "Video server returned an invalid response." + prodHint
  if (/failed-precondition|not configured|Agora is not configured/i.test(msg))
    return "Video isn't configured for production." + prodHint
  if (/NOT_SUPPORTED|NotSupportedError|not supported/i.test(msg))
    return "This browser or page context does not support that action (e.g. screen sharing needs a secure site and a supported browser). Try Chrome or Edge on HTTPS."
  if (/Permission denied|NotAllowedError|NotReadableError/i.test(msg))
    return "Camera or microphone permission was blocked. Check browser settings and try again."
  return msg
}

/** Detect display-capture tracks (Chrome exposes displaySurface). */
function isLikelyScreenShareVideoTrack(videoTrack) {
  if (!videoTrack || typeof videoTrack.getMediaStreamTrack !== 'function') return false
  try {
    const ms = videoTrack.getMediaStreamTrack()
    if (!ms) return false
    const label = (ms.label || '').toLowerCase()
    if (label.includes('screen') || label.includes('display') || label.includes('window')) return true
    const s = typeof ms.getSettings === 'function' ? ms.getSettings() : {}
    const ds = s.displaySurface
    if (ds === 'monitor' || ds === 'window' || ds === 'browser') return true
    const { width: w, height: h } = s
    if (w && h && w >= 1280 && h >= 720 && w / h >= 1.45) return true
  } catch {
    /* ignore */
  }
  return false
}

function formatMeetingStart(meeting) {
  const ms = meeting.startAt?.toMillis?.() ?? meeting.startAt
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Elapsed time label for an in-flight session (lobby + in-call info). */
function formatRunningDuration(elapsedMs) {
  if (elapsedMs == null || !Number.isFinite(elapsedMs) || elapsedMs < 0) return ''
  const totalSec = Math.floor(elapsedMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

function firestoreTimeToMs(t) {
  if (t == null) return 0
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (typeof t.seconds === 'number') return t.seconds * 1000
  return 0
}

/** Lobby row timer: prefers room session start, else meeting startAt. */
function OngoingRowRunningMeta({ since }) {
  const [, setTick] = useState(0)
  const ms = firestoreTimeToMs(since)
  useEffect(() => {
    if (!ms) return undefined
    const id = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [since, ms])
  if (!ms) {
    return (
      <span className="video-call-ongoing-running video-call-ongoing-running--muted" title="No start time on file">
        · Running —
      </span>
    )
  }
  // eslint-disable-next-line react-hooks/purity -- wall-clock elapsed label (interval tick forces re-render)
  const runningLabel = formatRunningDuration(Date.now() - ms) || '—'
  return (
    <span className="video-call-ongoing-running" title="Approximate active time for this room">
      · Running {runningLabel}
    </span>
  )
}

function MeetingRunningClockRow({ sessionStartedAt }) {
  const [, setTick] = useState(0)
  const ms = firestoreTimeToMs(sessionStartedAt)
  useEffect(() => {
    if (!ms) return undefined
    const id = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [sessionStartedAt, ms])
  // eslint-disable-next-line react-hooks/purity -- wall-clock elapsed label (interval tick forces re-render)
  const runningForLabel = ms ? formatRunningDuration(Date.now() - ms) : '—'
  return (
    <div>
      <dt>Running for</dt>
      <dd>{runningForLabel}</dd>
    </div>
  )
}

/** True if this Agora tile is the meeting organizer (Firestore meta and/or room hostAgoraUid). */
function participantIsMeetingHost(meta, agoraUid, meetingCreatedBy, hostAgoraUid) {
  if (!meetingCreatedBy) return false
  if (meta?.firebaseUid && meta.firebaseUid === meetingCreatedBy) return true
  if (hostAgoraUid != null && agoraUid != null && Number(hostAgoraUid) === Number(agoraUid)) return true
  return false
}

function InRoomTopBarTimer({ sessionStartedAt }) {
  const [, setTick] = useState(0)
  const ms = firestoreTimeToMs(sessionStartedAt)
  useEffect(() => {
    if (!ms) return undefined
    const id = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [sessionStartedAt, ms])
  // eslint-disable-next-line react-hooks/purity -- wall-clock elapsed label (interval tick forces re-render)
  const topBarElapsed = ms ? formatRunningDuration(Date.now() - ms) : '—'
  return (
    <span className="video-call-inroom-timer" title="Time in this session">
      <Clock size={16} strokeWidth={2.25} aria-hidden />
      <span className="video-call-inroom-timer-text">{topBarElapsed}</span>
    </span>
  )
}

/** RMS of Float32 samples; used to skip silent chunks (avoids Whisper "thank you for watching" etc on silence). */
function rms(samples) {
  if (!samples?.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

const SPEECH_RMS_THRESHOLD = 0.002
const TARGET_SAMPLE_RATE = 16000

const DEFAULT_ROOM_PREFS = {
  continuousMeetingChat: true,
  hostVideoDefault: true,
  participantVideoDefault: true,
  audioComputerOnly: true,
}

/** Lobby list refresh; sweeps run in parallel and do not block this interval. */
const VIDEO_LOBBY_ONGOING_POLL_MS = 4000

const UPCOMING_HORIZON_KEY = 'notus_video_upcoming_horizon_days'
const UPCOMING_HORIZON_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 2, label: '2 days' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
]

function normalizeRoomPrefs(p) {
  const o = p && typeof p === 'object' ? p : {}
  return {
    continuousMeetingChat: o.continuousMeetingChat !== false,
    hostVideoDefault: o.hostVideoDefault !== false,
    participantVideoDefault: o.participantVideoDefault !== false,
    audioComputerOnly: o.audioComputerOnly !== false,
  }
}

/** Downsample Float32 mono to target rate and convert to Int16 LE (raw PCM for Whisper). */
function downsampleAndToInt16(floatSamples, fromSampleRate, toSampleRate = TARGET_SAMPLE_RATE) {
  const ratio = fromSampleRate / toSampleRate
  const outLength = Math.floor(floatSamples.length / ratio)
  const int16 = new Int16Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const s = floatSamples[Math.floor(i * ratio)]
    const clamped = Math.max(-1, Math.min(1, s))
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return int16.buffer
}

export function VideoCallPage() {
  const { user, setNavExtra, activeOrgId } = useOutletContext() || {}
  const { orgId: videoRouteOrgId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [channelName, setChannelName] = useState('')
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const [remoteUsers, setRemoteUsers] = useState([])
  /** Agora uid -> { displayName, photoUrl } from Firestore participants */
  const [participantMeta, setParticipantMeta] = useState({})
  const [localPhotoUrl, setLocalPhotoUrl] = useState(null)
  /** null = closed; which tab is active in the right-hand panel */
  const [sidePanelTab, setSidePanelTab] = useState(null)
  const [meetingQuestion, setMeetingQuestion] = useState('')
  const [meetingHistory, setMeetingHistory] = useState([])
  const [askLoading, setAskLoading] = useState(false)
  const [showNotepad, setShowNotepad] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [preJoinOpen, setPreJoinOpen] = useState(false)
  const [preJoinMode, setPreJoinMode] = useState('instant')
  const [preJoinMicOn, setPreJoinMicOn] = useState(true)
  const [preJoinCamOn, setPreJoinCamOn] = useState(true)
  const [preJoinAllowRemoteShare, setPreJoinAllowRemoteShare] = useState(true)
  const [preJoinPreviewStream, setPreJoinPreviewStream] = useState(null)
  const [preJoinPreviewError, setPreJoinPreviewError] = useState('')
  /** While in-call: host + transcript session for summary + Ask AI RAG */
  const [joinedMeetingMeta, setJoinedMeetingMeta] = useState(null)
  /** Camera track for the “You” tile (stays separate while screen is published). */
  const [localCameraTrack, setLocalCameraTrack] = useState(null)
  /** Display track for the dedicated screen-share preview (not mixed into the camera tile). */
  const [localScreenShareTrack, setLocalScreenShareTrack] = useState(null)
  const [screenSharing, setScreenSharing] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [joinMeetingIdInput, setJoinMeetingIdInput] = useState('')
  const [joinByIdLoading, setJoinByIdLoading] = useState(false)
  const [ongoingMeetings, setOngoingMeetings] = useState([])
  const [ongoingMeetingsLoading, setOngoingMeetingsLoading] = useState(false)
  const [ongoingMeetingsError, setOngoingMeetingsError] = useState('')
  const [roomAllowRemoteShare, setRoomAllowRemoteShare] = useState(true)
  const [roomMediaPolicy, setRoomMediaPolicy] = useState({})
  const [hostMenuOpen, setHostMenuOpen] = useState(false)
  const [guestMenuOpen, setGuestMenuOpen] = useState(false)
  const [meetingInfoOpen, setMeetingInfoOpen] = useState(false)
  /** Firestore roomState.sessionStartedAt — live duration in Meeting info */
  const [roomSessionStartedAt, setRoomSessionStartedAt] = useState(null)
  /** Organizer’s current Agora uid (written when host joins) — host badge when firebaseUid missing on participant doc */
  const [roomHostAgoraUid, setRoomHostAgoraUid] = useState(null)
  /** Host opt-in: non-hosts may see meeting ID in Meeting information */
  const [roomShowMeetingIdForParticipants, setRoomShowMeetingIdForParticipants] = useState(false)
  const [organizerDisplayForInfo, setOrganizerDisplayForInfo] = useState('')
  const [hostPermissionsOpen, setHostPermissionsOpen] = useState(false)
  const [hostPolicyModal, setHostPolicyModal] = useState(null)
  const [hostConfirm, setHostConfirm] = useState(null)
  const [hostActionLoading, setHostActionLoading] = useState(false)
  const hostMenuWrapRef = useRef(null)
  const guestMenuWrapRef = useRef(null)
  const [newMeetingSettingsOpen, setNewMeetingSettingsOpen] = useState(false)
  const [newMeetingTitleDraft, setNewMeetingTitleDraft] = useState('Instant meeting')
  const [newMeetingAllowShareDraft, setNewMeetingAllowShareDraft] = useState(true)
  /** Title used for instant meeting create + pre-join header after step 1. */
  const [preJoinInstantMeetingTitle, setPreJoinInstantMeetingTitle] = useState('Instant meeting')
  /** Orgs available for video (global page) or single org when route is /app/org/:orgId/video */
  const [videoUserOrgs, setVideoUserOrgs] = useState([])
  const [videoOrgsLoaded, setVideoOrgsLoaded] = useState(false)
  const [instantMeetingOrgId, setInstantMeetingOrgId] = useState('')
  const [videoRouteForbidden, setVideoRouteForbidden] = useState(false)
  const [roomPrefsDraft, setRoomPrefsDraft] = useState(() => ({ ...DEFAULT_ROOM_PREFS }))
  const [roomPrefsLive, setRoomPrefsLive] = useState(() => ({ ...DEFAULT_ROOM_PREFS }))
  const [roomPinnedAgoraUid, setRoomPinnedAgoraUid] = useState(null)
  const [localViewerPinAgoraUid, setLocalViewerPinAgoraUid] = useState(null)
  const [localAgoraUid, setLocalAgoraUid] = useState(null)
  const [roomKickMeta, setRoomKickMeta] = useState(null)
  const joinedAtMsRef = useRef(0)
  const [hostPrefsModalOpen, setHostPrefsModalOpen] = useState(false)
  const [hostPrefsDraft, setHostPrefsDraft] = useState(() => ({ ...DEFAULT_ROOM_PREFS }))
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [upcomingMeetingsLoading, setUpcomingMeetingsLoading] = useState(false)
  const [upcomingHorizonMenuOpen, setUpcomingHorizonMenuOpen] = useState(false)
  const upcomingHorizonWrapRef = useRef(null)
  /** Which participant tile menu is open: "local" or `remote-${agoraUid}` */
  const [participantMenuKey, setParticipantMenuKey] = useState(null)
  const [upcomingHorizonDays, setUpcomingHorizonDays] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(UPCOMING_HORIZON_KEY) || '7', 10)
      return UPCOMING_HORIZON_OPTIONS.some((o) => o.days === v) ? v : 7
    } catch {
      return 7
    }
  })

  const localVideoTrackRef = useRef(null)
  const transcriptSessionIdRef = useRef(null)
  const localUidRef = useRef(0)
  const transcriptionWsRef = useRef(null)
  const audioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const pcmBufferRef = useRef([])
  const transcriptionChunksSentRef = useRef(0)
  const remoteEndHandledRef = useRef(false)

  /** Live transcription WebSocket only when AI backend URL is set (Express has no /ws/transcription). */
  const transcriptionWsBase = (import.meta.env.VITE_AI_WS_URL || '').replace(/\/$/, '')

  /** HTTP(S) base for /api/ask and /api/generate-summary (wss:// from env is mapped to https). */
  const aiRestBase = useMemo(() => getAiRestHttpBase(), [])



  const cleanup = useCallback(async () => {
    if (transcriptionWsRef.current) {
      try { transcriptionWsRef.current.close() } catch (e) { console.warn('Transcription WS close error:', e) }
      transcriptionWsRef.current = null
    }
    if (workletNodeRef.current && audioContextRef.current) {
      try { workletNodeRef.current.disconnect(); audioContextRef.current.close() } catch (e) { console.warn('AudioContext cleanup error:', e) }
      workletNodeRef.current = null
      audioContextRef.current = null
    }
    pcmBufferRef.current = []
    transcriptionChunksSentRef.current = 0
    try {
      await videoApp.leaveChannel()
    } catch (e) {
      console.warn('Cleanup error:', e)
    }
    localVideoTrackRef.current = null
    setLocalCameraTrack(null)
    setLocalScreenShareTrack(null)
    setScreenSharing(false)
    setRoomSessionStartedAt(null)
    setJoined(false)
  }, [])

  const updateGridLayout = useCallback(() => {
    const container = document.querySelector('.video-streams')
    if (!container) return
    const count = remoteUsers.length + 1
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200
    const narrow = w < 768
    let cols = 1
    if (count > 1) {
      if (narrow) {
        cols = Math.min(2, count)
      } else {
        cols = 2
        if (count > 4) cols = 3
      }
    }
    const rows = Math.ceil(count / cols)
    container.style.setProperty('--cols', String(cols))
    container.style.setProperty('--rows', String(rows))
  }, [remoteUsers])

  useEffect(() => {
    setMeetingHistory([])
    setMeetingQuestion('')
  }, [channelName])

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    setVideoOrgsLoaded(false)
    ;(async () => {
      if (videoRouteOrgId) {
        const m = await getMembership(videoRouteOrgId, user.uid)
        if (cancelled) return
        if (!m || m.state !== MEMBERSHIP_STATES.active) {
          setVideoRouteForbidden(true)
          setVideoUserOrgs([])
          setInstantMeetingOrgId('')
          setVideoOrgsLoaded(true)
          return
        }
        setVideoRouteForbidden(false)
        const org = await getOrg(videoRouteOrgId)
        const name = org?.name || 'Organization'
        setVideoUserOrgs([{ orgId: videoRouteOrgId, name }])
        setInstantMeetingOrgId(videoRouteOrgId)
        setVideoOrgsLoaded(true)
        return
      }
      setVideoRouteForbidden(false)
      const mems = await getActiveMemberships(user.uid)
      if (cancelled) return
      const active = mems.filter((x) => x.state === MEMBERSHIP_STATES.active)
      const rows = await Promise.all(
        active.map(async (mem) => ({
          orgId: mem.orgId,
          name: (await getOrg(mem.orgId))?.name || 'Organization',
        }))
      )
      setVideoUserOrgs(rows)
      setInstantMeetingOrgId((prev) => {
        if (prev && rows.some((r) => r.orgId === prev)) return prev
        return rows[0]?.orgId || ''
      })
      setVideoOrgsLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.uid, videoRouteOrgId])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  useEffect(() => {
    if (!user?.uid) {
      setLocalPhotoUrl(null)
      return
    }
    let cancelled = false
    getUserDoc(user.uid).then((doc) => {
      if (!cancelled) setLocalPhotoUrl(getProfilePictureUrl(doc, user))
    })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // Subscribe to participant display names for this channel (so we show names instead of "User 12345")
  useEffect(() => {
    if (!joined || !channelName) return
    const participantsRef = collection(db, 'videoChannels', channelName, 'participants')
    const unsub = onSnapshot(participantsRef, (snap) => {
      const map = {}
      snap.docs.forEach((d) => {
        const data = d.data() || {}
        map[d.id] = {
          displayName: data.displayName || `User ${d.id}`,
          photoUrl: typeof data.photoUrl === 'string' && data.photoUrl ? data.photoUrl : null,
          firebaseUid: typeof data.firebaseUid === 'string' ? data.firebaseUid : null,
        }
      })
      setParticipantMeta(map)
    }, (err) => console.warn('Participant names listener error:', err))
    return () => unsub()
  }, [joined, channelName])

  useEffect(() => {
    updateGridLayout()
  }, [remoteUsers, updateGridLayout])

  useEffect(() => {
    const onResize = () => updateGridLayout()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [updateGridLayout])

  useEffect(() => {
    if (!user?.uid || joined || !videoOrgsLoaded || videoRouteForbidden || videoUserOrgs.length === 0) return
    let cancelled = false
    let firstPoll = true
    const loadOngoing = async () => {
      const isFirstPaint = firstPoll
      if (firstPoll) setOngoingMeetingsLoading(true)
      setOngoingMeetingsError('')
      void Promise.allSettled([
        sweepVacantVideoRooms(user.uid),
        closeStaleEmptyVideoRooms(user.uid),
        endInstantRoomsWithoutSessionClock(user.uid),
        endAgedInstantVideoRooms(user.uid),
        purgeParticipantsForEndedRooms(user.uid),
        dedupeOpenVideoRoomParticipants(user.uid),
      ]).then((results) => {
        for (const r of results) {
          if (r.status === 'rejected') console.warn('[video lobby sweep]', r.reason)
        }
      })
      try {
        const list = videoRouteOrgId
          ? await getOngoingVideoMeetingsInOrg(user.uid, videoRouteOrgId)
          : await getOngoingVideoMeetingsForUser(user.uid)
        if (isFirstPaint && !cancelled) {
          const quickEnriched = list.map((m) => ({
            ...m,
            _hostLabel: !m.createdBy ? 'Organizer' : m.createdBy === user.uid ? 'You' : 'Host',
          }))
          setOngoingMeetings(quickEnriched)
          setOngoingMeetingsLoading(false)
        }
        const enriched = await Promise.all(
          list.map(async (m) => {
            if (!m.createdBy) return { ...m, _hostLabel: 'Organizer' }
            if (m.createdBy === user.uid) return { ...m, _hostLabel: 'You' }
            try {
              const u = await getUserDoc(m.createdBy)
              return {
                ...m,
                _hostLabel: u?.displayName || u?.email || 'Organizer',
              }
            } catch {
              return { ...m, _hostLabel: 'Organizer' }
            }
          })
        )
        if (!cancelled) setOngoingMeetings(enriched)
      } catch (e) {
        if (!cancelled) setOngoingMeetingsError(e?.message || 'Could not load ongoing meetings.')
      } finally {
        firstPoll = false
        if (!cancelled) setOngoingMeetingsLoading(false)
      }
    }
    loadOngoing()
    const t = setInterval(loadOngoing, VIDEO_LOBBY_ONGOING_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [user?.uid, joined, videoOrgsLoaded, videoRouteForbidden, videoUserOrgs.length, videoRouteOrgId])

  useEffect(() => {
    if (!user?.uid || joined || !videoOrgsLoaded || videoRouteForbidden || videoUserOrgs.length === 0) return
    let cancelled = false
    const loadUpcoming = async () => {
      setUpcomingMeetingsLoading(true)
      try {
        const list = videoRouteOrgId
          ? await getUpcomingMeetingsInHorizonForUserInOrg(user.uid, videoRouteOrgId, upcomingHorizonDays)
          : await getUpcomingMeetingsInHorizonForUser(user.uid, upcomingHorizonDays)
        if (!cancelled) setUpcomingMeetings(list)
      } catch {
        if (!cancelled) setUpcomingMeetings([])
      } finally {
        if (!cancelled) setUpcomingMeetingsLoading(false)
      }
    }
    loadUpcoming()
    const t = setInterval(loadUpcoming, 60000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [
    user?.uid,
    joined,
    videoOrgsLoaded,
    videoRouteForbidden,
    videoUserOrgs.length,
    videoRouteOrgId,
    upcomingHorizonDays,
  ])

  useEffect(() => {
    if (!upcomingHorizonMenuOpen) return
    const onDown = (e) => {
      if (upcomingHorizonWrapRef.current && !upcomingHorizonWrapRef.current.contains(e.target)) {
        setUpcomingHorizonMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [upcomingHorizonMenuOpen])

  useEffect(() => {
    if (!joined || !user?.uid || !roomKickMeta) return
    if (roomKickMeta.targetFirebaseUid !== user.uid) return
    const km = roomKickMeta.at?.toMillis?.() ?? 0
    if (km < joinedAtMsRef.current - 2000) return
    let cancelled = false
    ;(async () => {
      setError('You were removed from the meeting.')
      setLoading(true)
      await teardownAfterCall()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [joined, user?.uid, roomKickMeta])

  useEffect(() => {
    if (roomPinnedAgoraUid != null) setLocalViewerPinAgoraUid(null)
  }, [roomPinnedAgoraUid])

  useEffect(() => {
    if (!preJoinOpen || preJoinMode !== 'meeting' || !selectedMeeting?.orgId) return
    const room = getMeetingVideoRoomId(selectedMeeting, selectedMeeting.orgId)
    if (!room) return
    let cancelled = false
    getDoc(doc(db, 'videoChannels', room, 'roomState', 'current'))
      .then((snap) => {
        if (cancelled) return
        const p = snap.data()?.roomPrefs
        const prefs = p ? normalizeRoomPrefs(p) : null
        if (user?.uid === selectedMeeting.createdBy) {
          if (prefs) setRoomPrefsDraft({ ...prefs })
          else setRoomPrefsDraft({ ...DEFAULT_ROOM_PREFS })
        }
        if (!prefs) return
        const isCreator = user?.uid === selectedMeeting.createdBy
        if (isCreator) {
          setPreJoinCamOn(prefs.hostVideoDefault !== false)
        } else if (prefs.participantVideoDefault === false) {
          setPreJoinCamOn(false)
        } else {
          setPreJoinCamOn(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [preJoinOpen, preJoinMode, selectedMeeting, user?.uid])

  const openPreJoinInstant = () => {
    if (!user?.uid || videoUserOrgs.length === 0) return
    setError('')
    setRoomPrefsDraft({ ...DEFAULT_ROOM_PREFS })
    setNewMeetingTitleDraft('Instant meeting')
    setNewMeetingAllowShareDraft(true)
    setNewMeetingSettingsOpen(true)
  }

  const continueNewMeetingToPreJoin = () => {
    const orgPick = videoRouteOrgId || instantMeetingOrgId
    if (!orgPick) {
      setError('Select an organization for this meeting.')
      return
    }
    const t = newMeetingTitleDraft.trim() || 'Instant meeting'
    setPreJoinInstantMeetingTitle(t)
    setPreJoinAllowRemoteShare(newMeetingAllowShareDraft)
    setNewMeetingSettingsOpen(false)
    setPreJoinMode('instant')
    setPreJoinMicOn(true)
    setPreJoinCamOn(roomPrefsDraft.hostVideoDefault !== false)
    setPreJoinPreviewError('')
    setPreJoinOpen(true)
  }

  const openPreJoinForMeeting = useCallback(
    (meeting) => {
      if (!meeting) {
        setError('Load a meeting first (paste a meeting ID), or use New meeting.')
        return
      }
      setError('')
      setSelectedMeeting(meeting)
      const oid = meeting.orgId || videoRouteOrgId || instantMeetingOrgId
      if (oid) {
        setChannelName(getMeetingVideoRoomId(meeting, oid))
      }
      setPreJoinMode('meeting')
      setRoomPrefsDraft({ ...DEFAULT_ROOM_PREFS })
      setPreJoinMicOn(true)
      setPreJoinCamOn(true)
      setPreJoinAllowRemoteShare(true)
      setPreJoinPreviewError('')
      setPreJoinOpen(true)
    },
    [videoRouteOrgId, instantMeetingOrgId]
  )

  useEffect(() => {
    const mid = (searchParams.get('meetingId') || '').trim()
    if (!mid || !user?.uid) return
    const orgId = videoRouteOrgId || (searchParams.get('orgId') || '').trim() || null
    let cancelled = false
    ;(async () => {
      try {
        if (orgId) {
          const ref = doc(db, 'organizations', orgId, 'meetings', mid)
          const snap = await getDoc(ref)
          if (cancelled || !snap.exists()) return
          const m = { id: snap.id, ...snap.data(), orgId }
          const ok = await canAccessMeeting(m, user.uid, orgId)
          if (cancelled || !ok) return
          openPreJoinForMeeting(m)
        } else {
          const m = await resolveMeetingByIdAcrossOrgs(user.uid, mid)
          if (cancelled || !m) return
          openPreJoinForMeeting(m)
        }
      } catch (e) {
        console.warn('Could not load meeting from link:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, user, videoRouteOrgId, openPreJoinForMeeting])

  const openPreJoinMeeting = () => {
    openPreJoinForMeeting(selectedMeeting)
  }

  useEffect(() => {
    if (!preJoinOpen) return
    let disposed = false
    let stream = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: preJoinMicOn,
          video: preJoinCamOn ? { facingMode: 'user' } : false,
        })
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        setPreJoinPreviewStream(stream)
        setPreJoinPreviewError('')
      } catch (e) {
        if (!disposed) {
          setPreJoinPreviewStream(null)
          setPreJoinPreviewError(toFriendlyError(e) || 'Could not access camera or microphone.')
        }
      }
    })()
    return () => {
      disposed = true
      if (stream) stream.getTracks().forEach((t) => t.stop())
      setPreJoinPreviewStream(null)
    }
  }, [preJoinOpen, preJoinMicOn, preJoinCamOn])

  const executeJoin = async (meetingInput, {
    instantCreate,
    micOn,
    videoOn,
    allowRemoteScreenShare,
    instantTitle,
    roomPrefsOverride,
  }) => {
    remoteEndHandledRef.current = false
    setError('')
    setLoading(true)
    try {
      let meeting = meetingInput
      if (instantCreate) {
        const orgForInstant = videoRouteOrgId || instantMeetingOrgId
        if (!orgForInstant || !user?.uid) {
          setError('Select an organization first.')
          return false
        }
        meeting = await createInstantMeeting(orgForInstant, user.uid, {
          title: (instantTitle && String(instantTitle).trim()) || 'Instant meeting',
        })
        setSelectedMeeting(meeting)
        const orgForMeeting = meeting.orgId || orgForInstant
        setChannelName(getMeetingVideoRoomId(meeting, orgForMeeting) || meeting.videoRoomId)
      }
      if (!meeting) {
        setError('No meeting to join.')
        return false
      }
      if (meeting.isVideoMeeting === false) {
        setError('This calendar event is not a video meeting. Edit it on the calendar and enable “Video meeting”, or pick another event.')
        return false
      }
      const orgForMeeting = meeting.orgId || videoRouteOrgId || instantMeetingOrgId || activeOrgId
      if (!orgForMeeting) {
        setError('This meeting is not tied to an organization.')
        return false
      }
      const room = getMeetingVideoRoomId(meeting, orgForMeeting)
      const sessionId = getMeetingTranscriptSessionId(meeting, orgForMeeting)
      if (!room || !sessionId) {
        setError('This meeting is missing video room data. Try scheduling a new meeting from the calendar.')
        return false
      }
      transcriptSessionIdRef.current = sessionId
      setChannelName(room)

      if (!meeting.id) {
        setError('This meeting is missing an id.')
        setLoading(false)
        return false
      }
      const meetingFirestoreRef = doc(db, 'organizations', orgForMeeting, 'meetings', meeting.id)
      const roomStateDoc = doc(db, 'videoChannels', room, 'roomState', 'current')
      const [meetingResult, roomResult] = await Promise.allSettled([
        getDoc(meetingFirestoreRef),
        getDoc(roomStateDoc),
      ])
      if (meetingResult.status !== 'fulfilled') {
        console.warn('Meeting read failed:', meetingResult.reason)
        setError('Could not load meeting. Check your connection and try again.')
        setLoading(false)
        return false
      }
      const meetingSnap = meetingResult.value
      if (!meetingSnap.exists()) {
        setError('This meeting could not be found.')
        setLoading(false)
        return false
      }
      meeting = { id: meetingSnap.id, ...meetingSnap.data(), orgId: orgForMeeting }

      let preJoinRoomState = {}
      try {
        const preSnap = roomResult.status === 'fulfilled' ? roomResult.value : null
        preJoinRoomState = preSnap?.data?.() || {}
        const banned = Array.isArray(preJoinRoomState.bannedFirebaseUids)
          ? preJoinRoomState.bannedFirebaseUids
          : []
        if (banned.includes(user.uid)) {
          setError('You cannot join this meeting.')
          setLoading(false)
          return false
        }
        const organizerUid = meeting.createdBy || preJoinRoomState.hostUid
        if (preJoinRoomState.endedAt) {
          if (!organizerUid) {
            setError('This meeting has ended.')
            setLoading(false)
            return false
          }
          if (user.uid !== organizerUid) {
            setError(
              'This meeting has ended. Only the organizer can reopen it—ask them to join first, or start a new meeting.'
            )
            setLoading(false)
            return false
          }
        }
      } catch (e) {
        console.warn('Room state check failed:', e)
      }

      // Wire up remote user callbacks before joining
      videoApp.setCallbacks({
        onJoined: (remoteUser) => {
          setRemoteUsers((prev) => [
            ...prev.filter((u) => u.uid !== remoteUser.uid),
            remoteUser,
          ])
        },
        onLeft: (remoteUser) => {
          setRemoteUsers((prev) => prev.filter((u) => u.uid !== remoteUser.uid))
        },
        onRemoteUsersRefresh: () => {
          setRemoteUsers((prev) => {
            const clientUsers = videoApp.getRemoteUsers()
            const byUid = new Map(clientUsers.map((u) => [u.uid, u]))
            const ordered = []
            const used = new Set()
            for (const u of prev) {
              const fresh = byUid.get(u.uid)
              if (fresh) {
                ordered.push(fresh)
                used.add(u.uid)
              }
            }
            for (const u of clientUsers) {
              if (!used.has(u.uid)) ordered.push(u)
            }
            return ordered
          })
        },
        onAudioPublished: (remoteUser) => {
          // Connect remote audio to the transcription worklet so all voices are captured
          try {
            const ctx = audioContextRef.current
            const worklet = workletNodeRef.current
            if (ctx && worklet && remoteUser.audioTrack) {
              const remoteStream = new MediaStream([remoteUser.audioTrack.getMediaStreamTrack()])
              const remoteSource = ctx.createMediaStreamSource(remoteStream)
              remoteSource.connect(worklet)
            }
          } catch (e) {
            console.warn('Could not connect remote audio to transcription:', e)
          }
        },
      })

      // Clear before joining so the slate is clean, but won't wipe users discovered during join
      setRemoteUsers([])

      let resolvedOrganizerUid = meeting.createdBy || user.uid

      const { uid, audioTrack, videoTrack } = await videoApp.joinChannel(room, { micOn, videoOn })
      localUidRef.current = uid
      setLocalAgoraUid(uid)
      joinedAtMsRef.current = Date.now()
      localVideoTrackRef.current = videoTrack
      setLocalCameraTrack(videoTrack)

      /** Room state: only the organizer clears endedAt; anyone can clear vacantSince / lastKick. Session clock starts once per “open” period. */
      let userDocForParticipant = null
      const [postSnapResult, userDocResult] = await Promise.allSettled([
        getDoc(roomStateDoc),
        getUserDoc(user.uid),
      ])
      if (userDocResult.status === 'fulfilled') userDocForParticipant = userDocResult.value
      try {
        const postSnap =
          postSnapResult.status === 'fulfilled' ? postSnapResult.value : { data: () => ({}) }
        const rsExisting = postSnap.data() || {}
        const organizerUid = meeting.createdBy || rsExisting.hostUid || user.uid
        resolvedOrganizerUid = organizerUid
        const isOrganizer = user.uid === organizerUid
        const hostUid = organizerUid
        const hadEnded = !!rsExisting.endedAt

        const roomStatePayload = {
          hostUid,
          lastKick: deleteField(),
          vacantSince: deleteField(),
        }
        if (isOrganizer) {
          roomStatePayload.endedAt = deleteField()
          roomStatePayload.endedBy = deleteField()
          roomStatePayload.allowRemoteScreenShare = allowRemoteScreenShare !== false
          roomStatePayload.hostAgoraUid = uid
          if (hadEnded) {
            roomStatePayload.showMeetingIdForParticipants = deleteField()
          }
          if (roomPrefsOverride && typeof roomPrefsOverride === 'object') {
            roomStatePayload.roomPrefs = normalizeRoomPrefs(roomPrefsOverride)
          }
        }
        if (!rsExisting.sessionStartedAt || (isOrganizer && hadEnded)) {
          roomStatePayload.sessionStartedAt = serverTimestamp()
        }
        await setDoc(roomStateDoc, roomStatePayload, { merge: true })
      } catch (e) {
        console.warn('Could not open / reset room state:', e)
      }

      try {
        const photoUrl = getProfilePictureUrl(userDocForParticipant, user) || null
        await setDoc(doc(db, 'videoChannels', room, 'participants', String(uid)), {
          displayName: user?.displayName || user?.email || 'Anonymous',
          photoUrl,
          firebaseUid: user.uid,
          joinedAt: serverTimestamp(),
        })
      } catch (e) {
        console.warn('Could not register participant name:', e)
      }

      // Transcription capture (only if VITE_AI_WS_URL points at FastAPI /ws/transcription)
      try {
        if (!transcriptionWsBase) {
          // Skip: avoids failed WS to Express (3001) and console spam
        } else {
        const CHUNK_DURATION_SEC = 15
        const wsUrl = /^wss?:\/\//i.test(transcriptionWsBase)
          ? `${transcriptionWsBase.replace(/\/?$/, '')}/ws/transcription`
          : (() => {
              const protocol = transcriptionWsBase.startsWith('https') ? 'wss' : 'ws'
              const host = new URL(transcriptionWsBase).host
              return `${protocol}://${host}/ws/transcription`
            })()
        const ws = new WebSocket(wsUrl)
        transcriptionWsRef.current = ws
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => {
          ws.send(
            JSON.stringify({ type: 'meta', channel: room, uid, sessionId: transcriptSessionIdRef.current })
          )
        }
        const stream = new MediaStream([audioTrack.getMediaStreamTrack()])
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        audioContextRef.current = ctx
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {})
        }
        const captureRate = ctx.sampleRate
        const samplesPerChunkAtCapture = Math.floor(captureRate * CHUNK_DURATION_SEC)

        const workletCode = `
          class TranscriptionProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0]
              if (!input?.[0]) return true
              const left = input[0]
              const right = input[1]
              const mono = right ? new Float32Array(left.length) : left
              if (right) {
                for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2
              }
              this.port.postMessage({ samples: mono.slice(0) })
              return true
            }
          }
          registerProcessor('transcription-processor', TranscriptionProcessor)
        `
        const blob = new Blob([workletCode], { type: 'application/javascript' })
        const workletUrl = URL.createObjectURL(blob)
        await ctx.audioWorklet.addModule(workletUrl)
        URL.revokeObjectURL(workletUrl)

        const source = ctx.createMediaStreamSource(stream)
        const workletNode = new AudioWorkletNode(ctx, 'transcription-processor')
        workletNodeRef.current = workletNode
        pcmBufferRef.current = []

        workletNode.port.onmessage = (e) => {
          const { samples } = e.data
          if (!samples?.length) return
          pcmBufferRef.current.push(...samples)
          while (pcmBufferRef.current.length >= samplesPerChunkAtCapture) {
            const chunk = pcmBufferRef.current.splice(0, samplesPerChunkAtCapture)
            const isFirstChunk = transcriptionChunksSentRef.current === 0
            const chunkRms = rms(chunk)
            const aboveThreshold = chunkRms >= SPEECH_RMS_THRESHOLD
            if (ws.readyState === WebSocket.OPEN && (isFirstChunk || aboveThreshold)) {
              const rawPcm = downsampleAndToInt16(chunk, captureRate, TARGET_SAMPLE_RATE)
              ws.send(rawPcm)
              transcriptionChunksSentRef.current += 1
            }
          }
        }

        source.connect(workletNode)
        workletNode.connect(ctx.destination)
        }
      } catch (e) {
        console.warn('Audio capture for transcription failed:', e)
      }

      setJoinedMeetingMeta({
        createdBy: resolvedOrganizerUid,
        transcriptSessionId: sessionId,
        meetingId: meeting.id || null,
        meetingTitle: meeting.title || 'Meeting',
        orgId: orgForMeeting,
      })
      const media = videoApp.getMediaState()
      setMicEnabled(!media.micMuted)
      setCamEnabled(!media.videoMuted)
      setJoined(true)

      return true
    } catch (err) {
      setError(toFriendlyError(err) || 'Failed to join')
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!joined || !channelName || !user?.uid) return
    const ref = doc(db, 'videoChannels', channelName, 'roomState', 'current')
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        const d = snap.data() || {}
        setRoomAllowRemoteShare(d.allowRemoteScreenShare !== false)
        setRoomMediaPolicy(
          d.mediaPolicy && typeof d.mediaPolicy === 'object' && !Array.isArray(d.mediaPolicy) ? d.mediaPolicy : {}
        )
        setRoomPrefsLive(normalizeRoomPrefs(d.roomPrefs))
        setRoomSessionStartedAt(d.sessionStartedAt ?? null)
        const ha = d.hostAgoraUid
        setRoomHostAgoraUid(ha != null && Number.isFinite(Number(ha)) ? Number(ha) : null)
        setRoomShowMeetingIdForParticipants(d.showMeetingIdForParticipants === true)
        const pUid = d.pinnedAgoraUid
        const parsedPin = pUid == null || pUid === '' ? null : Number(pUid)
        setRoomPinnedAgoraUid(Number.isFinite(parsedPin) ? parsedPin : null)
        const lk = d.lastKick
        if (lk?.targetFirebaseUid && lk?.at) {
          setRoomKickMeta({ targetFirebaseUid: lk.targetFirebaseUid, at: lk.at })
        } else {
          setRoomKickMeta(null)
        }
        if (d.roomPrefs && normalizeRoomPrefs(d.roomPrefs).continuousMeetingChat === false) {
          setSidePanelTab((t) => (t === 'messages' ? null : t))
        }
        if (!d.endedAt || remoteEndHandledRef.current) return
        if (d.endedBy === user.uid) return
        const endedMs = d.endedAt?.toMillis?.() ?? 0
        const joinedMs = joinedAtMsRef.current || 0
        if (endedMs && joinedMs && endedMs < joinedMs) return
        remoteEndHandledRef.current = true
        const uidToRemove = localUidRef.current
        const ch = channelName
        await cleanup()
        setJoinedMeetingMeta(null)
        setRemoteUsers([])
        setParticipantMeta({})
        setShowLeaveModal(false)
        setHostMenuOpen(false)
        setGuestMenuOpen(false)
        setMeetingInfoOpen(false)
        setHostPermissionsOpen(false)
        setHostPolicyModal(null)
        setHostConfirm(null)
        setHostPrefsModalOpen(false)
        setParticipantMenuKey(null)
        setRoomPinnedAgoraUid(null)
        setLocalViewerPinAgoraUid(null)
        setLocalAgoraUid(null)
        setRoomKickMeta(null)
        setRoomPrefsLive({ ...DEFAULT_ROOM_PREFS })
        setRoomSessionStartedAt(null)
        setRoomHostAgoraUid(null)
        setRoomShowMeetingIdForParticipants(false)
        try {
          await deleteDoc(doc(db, 'videoChannels', ch, 'participants', String(uidToRemove)))
        } catch (e) {
          console.warn('Could not remove participant:', e)
        }
      },
      (err) => console.warn('Room state listener error:', err)
    )
    return () => unsub()
  }, [joined, channelName, user?.uid, cleanup])

  useEffect(() => {
    if (!joined || !joinedMeetingMeta?.createdBy) {
      setOrganizerDisplayForInfo('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const u = await getUserDoc(joinedMeetingMeta.createdBy)
        if (cancelled) return
        setOrganizerDisplayForInfo(
          u?.displayName || u?.email || joinedMeetingMeta.createdBy
        )
      } catch {
        if (!cancelled) setOrganizerDisplayForInfo(joinedMeetingMeta.createdBy || '')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [joined, joinedMeetingMeta?.createdBy])

  const collectParticipantNames = () => [
    ...new Set(Object.values(participantMeta).map((m) => m.displayName).filter(Boolean)),
  ]

  const runSummaryIfConfigured = async (currentChannel, transcriptSessionId, currentParticipants, summaryOrgId) => {
    if (!aiRestBase) {
      setError(
        'AI summary needs the FastAPI service URL. Set VITE_AI_WS_URL (or VITE_AI_HTTP_URL) in frontend env, rebuild, and redeploy hosting.'
      )
      return
    }
    if (!currentChannel || !user?.uid || !transcriptSessionId) {
      setError('Could not start summary: missing room or transcript session.')
      return
    }
    setGeneratingSummary(true)
    setError('')
    try {
      const result = await generateMeetingSummary(aiRestBase, {
        channel: currentChannel,
        sessionId: transcriptSessionId,
        uid: user.uid,
        orgId: summaryOrgId || videoRouteOrgId || instantMeetingOrgId || activeOrgId || '',
        participants: currentParticipants,
      })
      if (result.success && result.summaryId) {
        navigate(`/app/meeting-summary/${result.summaryId}`)
        return
      }
      const detail = result.error || 'Summary was not created.'
      const hint =
        result.wordCount != null && result.wordCount < 100
          ? ' Speak longer next time (about 100+ words of transcript) or check the microphone was on.'
          : ''
      setError(`${detail}${hint}`)
      console.warn('[Summary]', detail, result)
    } catch (e) {
      const msg = toFriendlyError(e) || 'Meeting summary failed.'
      setError(msg)
      console.warn('Meeting summary generation failed:', e)
    } finally {
      setGeneratingSummary(false)
    }
  }

  const teardownAfterCall = useCallback(async () => {
    const uidToRemove = localUidRef.current
    const currentChannel = channelName
    await cleanup()
    setJoinedMeetingMeta(null)
    setRemoteUsers([])
    setParticipantMeta({})
    setHostMenuOpen(false)
    setMeetingInfoOpen(false)
    setHostPermissionsOpen(false)
    setHostPolicyModal(null)
    setHostConfirm(null)
    setRoomPinnedAgoraUid(null)
    setLocalViewerPinAgoraUid(null)
    setLocalAgoraUid(null)
    setRoomKickMeta(null)
    setParticipantMenuKey(null)
    setHostPrefsModalOpen(false)
    setRoomPrefsLive({ ...DEFAULT_ROOM_PREFS })
    try {
      await deleteDoc(doc(db, 'videoChannels', currentChannel, 'participants', String(uidToRemove)))
      const left = await getDocs(collection(db, 'videoChannels', currentChannel, 'participants'))
      const rs = await getDoc(doc(db, 'videoChannels', currentChannel, 'roomState', 'current'))
      if (left.empty && rs.exists() && !rs.data()?.endedAt) {
        await setDoc(
          doc(db, 'videoChannels', currentChannel, 'roomState', 'current'),
          { vacantSince: serverTimestamp() },
          { merge: true }
        )
      }
    } catch (e) {
      console.warn('Could not remove participant:', e)
    }
    return { currentChannel, uidToRemove }
  }, [channelName, cleanup])

  const leaveCallOnly = async () => {
    setShowLeaveModal(false)
    setLoading(true)
    const meta = joinedMeetingMeta
    const ch = channelName
    const names = collectParticipantNames()
    await teardownAfterCall()
    setLoading(false)
    try {
      const left = await getDocs(collection(db, 'videoChannels', ch, 'participants'))
      const rs = await getDoc(doc(db, 'videoChannels', ch, 'roomState', 'current'))
      if (
        left.empty &&
        meta?.transcriptSessionId &&
        user?.uid &&
        rs.exists() &&
        !rs.data()?.endedAt
      ) {
      await setDoc(
        doc(db, 'videoChannels', ch, 'roomState', 'current'),
        {
          endedAt: serverTimestamp(),
          endedBy: user.uid,
          vacantSince: deleteField(),
          sessionStartedAt: deleteField(),
        },
        { merge: true }
      )
        await runSummaryIfConfigured(ch, meta.transcriptSessionId, names, meta.orgId)
      }
    } catch (e) {
      console.warn('Post-leave room finalize:', e)
    }
  }

  const endMeetingForAll = async () => {
    setShowLeaveModal(false)
    setLoading(true)
    const metaSnapshot = joinedMeetingMeta
    const transcriptSessionId = metaSnapshot?.transcriptSessionId
    const currentParticipants = collectParticipantNames()
    const currentChannel = channelName
    const isHost = Boolean(metaSnapshot?.createdBy && user?.uid && metaSnapshot.createdBy === user.uid)
    try {
      await setDoc(
        doc(db, 'videoChannels', currentChannel, 'roomState', 'current'),
        {
          endedAt: serverTimestamp(),
          endedBy: user.uid,
          sessionStartedAt: deleteField(),
        },
        { merge: true }
      )
    } catch (e) {
      console.warn('Could not signal end for all:', e)
    }
    await teardownAfterCall()
    setLoading(false)
    if (isHost) {
      await runSummaryIfConfigured(
        currentChannel,
        transcriptSessionId,
        currentParticipants,
        metaSnapshot?.orgId
      )
    }
  }

  const onLeaveButtonClick = () => {
    const isHost = Boolean(
      joinedMeetingMeta?.createdBy && user?.uid && joinedMeetingMeta.createdBy === user.uid
    )
    if (isHost) setShowLeaveModal(true)
    else leaveCallOnly()
  }

  const toggleScreenShare = async () => {
    setError('')
    try {
      if (videoApp.getIsScreenSharing()) {
        await videoApp.stopScreenShare()
        setScreenSharing(false)
        setLocalScreenShareTrack(null)
        setLocalCameraTrack(videoApp.getLocalVideoTrack())
        setCamEnabled(!videoApp.getMediaState().videoMuted)
      } else {
        const isHost = joinedMeetingMeta?.createdBy === user.uid
        if (
          !isHost &&
          user?.uid &&
          !getEffectiveScreenAllowedForParticipant(user.uid)
        ) {
          setError('The host has not allowed you to share your screen.')
          return
        }
        const st = await videoApp.startScreenShare()
        setScreenSharing(true)
        setLocalScreenShareTrack(st)
        setCamEnabled(true)
      }
    } catch (e) {
      setError(toFriendlyError(e) || 'Screen share failed.')
    }
  }

  const changeScreenShareSource = async () => {
    setError('')
    const isHost = joinedMeetingMeta?.createdBy === user.uid
    if (
      !isHost &&
      user?.uid &&
      !getEffectiveScreenAllowedForParticipant(user.uid)
    ) {
      setError('The host has not allowed you to share your screen.')
      return
    }
    try {
      const st = await videoApp.replaceScreenShareSource()
      setScreenSharing(true)
      setLocalScreenShareTrack(st)
      setCamEnabled(true)
    } catch (e) {
      setError(toFriendlyError(e) || 'Could not switch shared screen.')
    }
  }

  const setRemoteScreenShareAllowed = async (allowed) => {
    if (!channelName || joinedMeetingMeta?.createdBy !== user?.uid) return
    try {
      await updateDoc(doc(db, 'videoChannels', channelName, 'roomState', 'current'), {
        allowRemoteScreenShare: allowed,
      })
    } catch (e) {
      console.warn('Could not update screen share policy:', e)
    }
  }

  const patchParticipantMediaPolicy = async (firebaseUid, partial) => {
    if (!channelName || !firebaseUid) return
    const ref = doc(db, 'videoChannels', channelName, 'roomState', 'current')
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      const data = snap.exists() ? snap.data() : {}
      const mediaPolicy = { ...(data.mediaPolicy && typeof data.mediaPolicy === 'object' ? data.mediaPolicy : {}) }
      mediaPolicy[firebaseUid] = { ...(mediaPolicy[firebaseUid] || {}), ...partial }
      tx.set(ref, { mediaPolicy }, { merge: true })
    })
  }

  const hostSetPinnedAgoraUid = async (uidOrNull) => {
    if (!channelName || joinedMeetingMeta?.createdBy !== user?.uid) return
    try {
      await updateDoc(doc(db, 'videoChannels', channelName, 'roomState', 'current'), {
        pinnedAgoraUid: uidOrNull == null ? null : Number(uidOrNull),
      })
    } catch (e) {
      console.warn('Could not update spotlight pin:', e)
    }
  }

  const hostKickOrBanFirebaseUid = async (firebaseUid, { ban = false } = {}) => {
    if (!channelName || joinedMeetingMeta?.createdBy !== user?.uid || !firebaseUid) return
    if (firebaseUid === user.uid) return
    try {
      const ref = doc(db, 'videoChannels', channelName, 'roomState', 'current')
      if (ban) {
        await updateDoc(ref, {
          lastKick: { targetFirebaseUid: firebaseUid, at: serverTimestamp() },
          bannedFirebaseUids: arrayUnion(firebaseUid),
        })
      } else {
        await updateDoc(ref, {
          lastKick: { targetFirebaseUid: firebaseUid, at: serverTimestamp() },
        })
      }
    } catch (e) {
      console.warn('Kick/ban failed:', e)
    }
  }

  const hostSaveRoomPrefs = async (prefs) => {
    if (!channelName || joinedMeetingMeta?.createdBy !== user?.uid) return
    try {
      await updateDoc(doc(db, 'videoChannels', channelName, 'roomState', 'current'), {
        roomPrefs: normalizeRoomPrefs(prefs),
      })
    } catch (e) {
      console.warn('Could not save meeting preferences:', e)
    }
  }

  const getEffectiveMicAllowed = (fbUid) => {
    if (!fbUid) return true
    const v = roomMediaPolicy[fbUid]?.micAllowed
    if (v === false) return false
    return true
  }

  const getEffectiveCameraAllowed = (fbUid) => {
    if (!fbUid) return true
    const v = roomMediaPolicy[fbUid]?.cameraAllowed
    if (v === false) return false
    return true
  }

  const getEffectiveScreenAllowedForParticipant = (fbUid) => {
    if (!fbUid) return false
    const e = roomMediaPolicy[fbUid]?.screenAllowed
    if (e === true) return true
    if (e === false) return false
    return roomAllowRemoteShare !== false
  }

  const policyParticipantRows = useMemo(() => {
    const rows = []
    if (user?.uid) {
      rows.push({
        firebaseUid: user.uid,
        displayName: 'You',
        isLocal: true,
        canManage: true,
      })
    }
    for (const u of remoteUsers) {
      const meta = participantMeta[String(u.uid)]
      if (meta?.firebaseUid) {
        rows.push({
          firebaseUid: meta.firebaseUid,
          displayName: meta.displayName || `User ${u.uid}`,
          isLocal: false,
          canManage: true,
        })
      } else {
        rows.push({
          firebaseUid: null,
          agoraUid: u.uid,
          displayName: meta?.displayName || `User ${u.uid}`,
          isLocal: false,
          canManage: false,
        })
      }
    }
    return rows
  }, [user?.uid, remoteUsers, participantMeta])

  useEffect(() => {
    if (!hostMenuOpen) return
    const onDown = (e) => {
      if (hostMenuWrapRef.current && !hostMenuWrapRef.current.contains(e.target)) {
        setHostMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [hostMenuOpen])

  useEffect(() => {
    if (!guestMenuOpen) return
    const onDown = (e) => {
      if (guestMenuWrapRef.current && !guestMenuWrapRef.current.contains(e.target)) {
        setGuestMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [guestMenuOpen])

  useEffect(() => {
    if (!participantMenuKey) return
    const onDown = (e) => {
      if (e.target.closest('.video-participant-menu-root')) return
      setParticipantMenuKey(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [participantMenuKey])

  useEffect(() => {
    if (!joined || !user?.uid) return
    const micOk = getEffectiveMicAllowed(user.uid)
    const camOk = getEffectiveCameraAllowed(user.uid)
    const { micMuted, videoMuted } = videoApp.getMediaState()
    if (micOk === false && !micMuted) {
      videoApp.toggleMic()
      setMicEnabled(false)
    }
    if (camOk === false && !videoMuted) {
      videoApp.toggleVideo()
      setCamEnabled(false)
    }
  }, [joined, user?.uid, roomMediaPolicy, roomAllowRemoteShare])

  const joinMeetingById = async () => {
    let id = joinMeetingIdInput.trim()
    const fromQuery = id.match(/[?&]meetingId=([^&]+)/i)
    if (fromQuery) {
      try {
        id = decodeURIComponent(fromQuery[1]).trim()
      } catch {
        id = fromQuery[1].trim()
      }
    }
    if (!id || !user?.uid) return
    setJoinByIdLoading(true)
    setError('')
    try {
      if (videoRouteOrgId) {
        const ref = doc(db, 'organizations', videoRouteOrgId, 'meetings', id)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          setError('No meeting found with that ID in this organization.')
          return
        }
        const m = { id: snap.id, ...snap.data(), orgId: videoRouteOrgId }
        const ok = await canAccessMeeting(m, user.uid, videoRouteOrgId)
        if (!ok) {
          setError('You do not have access to this meeting.')
          return
        }
        if (m.isVideoMeeting === false) {
          setError('That event is not a video meeting.')
          return
        }
        openPreJoinForMeeting(m)
      } else {
        const m = await resolveMeetingByIdAcrossOrgs(user.uid, id)
        if (!m) {
          setError('No meeting found with that ID in any of your organizations.')
          return
        }
        if (m.isVideoMeeting === false) {
          setError('That event is not a video meeting.')
          return
        }
        openPreJoinForMeeting(m)
      }
      setJoinMeetingIdInput('')
    } catch (e) {
      setError(e?.message || 'Could not load meeting.')
    } finally {
      setJoinByIdLoading(false)
    }
  }

  const confirmPreJoin = async () => {
    const isHostForPrefs =
      preJoinMode === 'instant' ||
      (preJoinMode === 'meeting' && selectedMeeting && user?.uid === selectedMeeting.createdBy)
    const ok = await executeJoin(preJoinMode === 'instant' ? null : selectedMeeting, {
      instantCreate: preJoinMode === 'instant',
      micOn: preJoinMicOn,
      videoOn: preJoinCamOn,
      allowRemoteScreenShare: preJoinAllowRemoteShare,
      instantTitle: preJoinMode === 'instant' ? preJoinInstantMeetingTitle : undefined,
      roomPrefsOverride: isHostForPrefs ? roomPrefsDraft : undefined,
    })
    if (ok) setPreJoinOpen(false)
  }

  const copyHostMeetingId = () => {
    const id = joinedMeetingMeta?.meetingId
    if (!id || !navigator.clipboard?.writeText) return
    if (!localIsHost && !roomShowMeetingIdForParticipants) return
    navigator.clipboard.writeText(id).catch(() => {})
  }

  const toggleMic = () => {
    if (user?.uid && getEffectiveMicAllowed(user.uid) === false) {
      const { micMuted } = videoApp.getMediaState()
      if (micMuted) {
        setError('The host has restricted your microphone.')
        return
      }
    }
    setError('')
    const muted = videoApp.toggleMic()
    setMicEnabled(!muted)
  }

  const toggleCam = () => {
    if (user?.uid && getEffectiveCameraAllowed(user.uid) === false) {
      const { videoMuted } = videoApp.getMediaState()
      if (videoMuted) {
        setError('The host has restricted your camera.')
        return
      }
    }
    setError('')
    const muted = videoApp.toggleVideo()
    setCamEnabled(!muted)
  }

  const toggleNotepad = () => {
    setShowNotepad(!showNotepad)
  }

  const toggleChat = () => {
    if (!roomPrefsLive.continuousMeetingChat) return
    setSidePanelTab((t) => (t === 'messages' ? null : 'messages'))
  }

  const toggleBot = () => {
    setSidePanelTab((t) => (t === 'ai' ? null : 'ai'))
  }

  const askMeeting = async () => {
    const q = meetingQuestion.trim()
    if (!q || askLoading) return
    if (!aiRestBase) {
      setMeetingHistory(h => [...h, { role: 'ai', text: 'No API URL configured for meeting Q&A (set VITE_API_URL or VITE_AI_WS_URL).' }])
      return
    }
    setMeetingHistory(h => [...h, { role: 'user', text: q }])
    setMeetingQuestion('')
    setAskLoading(true)
    try {
      const res = await fetch(`${aiRestBase}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelName,
          sessionId: joinedMeetingMeta?.transcriptSessionId || '',
          question: q,
          uid: user.uid,
          orgId: joinedMeetingMeta?.orgId || videoRouteOrgId || instantMeetingOrgId || activeOrgId || '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const data = await res.json().catch(() => ({}))
      const answer = data.answer ?? data.error ?? (res.ok ? 'No answer.' : `Error ${res.status}`)
      setMeetingHistory(h => [...h, { role: 'ai', text: answer }])
    } catch (e) {
      setMeetingHistory(h => [...h, { role: 'ai', text: `Error: ${e.message}` }])
    } finally {
      setAskLoading(false)
    }
  }

  const remoteScreenSharer = useMemo(() => {
    if (screenSharing) return null
    return remoteUsers.find((u) => u.videoTrack && isLikelyScreenShareVideoTrack(u.videoTrack)) ?? null
  }, [remoteUsers, screenSharing])

  const pinnedShareActive = Boolean(
    (screenSharing && localScreenShareTrack) || remoteScreenSharer
  )

  const screenShareBannerText = useMemo(() => {
    if (screenSharing && localScreenShareTrack) return 'You are sharing your screen'
    if (remoteScreenSharer) {
      const n = participantMeta[String(remoteScreenSharer.uid)]?.displayName
      return `${n || `User ${remoteScreenSharer.uid}`} is sharing their screen`
    }
    return null
  }, [screenSharing, localScreenShareTrack, remoteScreenSharer, participantMeta])

  const filmstripRemoteUsers = useMemo(() => {
    if (!pinnedShareActive) return []
    if (remoteScreenSharer && !screenSharing) {
      return remoteUsers.filter((u) => u.uid !== remoteScreenSharer.uid)
    }
    return remoteUsers
  }, [pinnedShareActive, remoteScreenSharer, remoteUsers, screenSharing])

  const effectiveSpotlightUid = useMemo(() => {
    if (roomPinnedAgoraUid != null && Number.isFinite(Number(roomPinnedAgoraUid))) return Number(roomPinnedAgoraUid)
    if (localViewerPinAgoraUid != null && Number.isFinite(Number(localViewerPinAgoraUid)))
      return Number(localViewerPinAgoraUid)
    return null
  }, [roomPinnedAgoraUid, localViewerPinAgoraUid])

  const spotlightRemoteUser = useMemo(() => {
    if (effectiveSpotlightUid == null) return null
    return remoteUsers.find((u) => u.uid === effectiveSpotlightUid) ?? null
  }, [remoteUsers, effectiveSpotlightUid])

  const spotlightValid = useMemo(() => {
    if (effectiveSpotlightUid == null || !joined) return false
    if (localAgoraUid != null && effectiveSpotlightUid === localAgoraUid) return true
    return !!spotlightRemoteUser
  }, [effectiveSpotlightUid, localAgoraUid, spotlightRemoteUser, joined])

  const spotlightIsLocal = Boolean(
    joined && spotlightValid && localAgoraUid != null && effectiveSpotlightUid === localAgoraUid
  )

  const spotlightLayoutActive = Boolean(joined && !pinnedShareActive && spotlightValid)

  const localIsHost = Boolean(
    joinedMeetingMeta?.createdBy && user?.uid && joinedMeetingMeta.createdBy === user.uid
  )

  const spotlightFilmstripItems = useMemo(() => {
    if (!spotlightLayoutActive) return []
    const out = []
    if (!spotlightIsLocal) {
      out.push({ kind: 'local' })
    }
    for (const u of remoteUsers) {
      if (effectiveSpotlightUid != null && u.uid === effectiveSpotlightUid) continue
      out.push({ kind: 'remote', user: u })
    }
    return out
  }, [spotlightLayoutActive, spotlightIsLocal, remoteUsers, effectiveSpotlightUid])

  const inRoomParticipantCount = useMemo(() => {
    const fromFirestore = Object.keys(participantMeta).length
    const fromAgora = 1 + remoteUsers.length
    return Math.max(fromFirestore, fromAgora)
  }, [participantMeta, remoteUsers])

  if (!user) return null

  const calendarBasePath = videoRouteOrgId ? `/app/org/${videoRouteOrgId}/calendar` : '/app/calendar'
  const scheduleOrgForModal = videoRouteOrgId || instantMeetingOrgId

  const buildRemoteParticipantMenuItems = (u, meta) => {
    const agoraUid = u.uid
    const fbUid = meta?.firebaseUid
    const displayName = meta?.displayName || `User ${agoraUid}`
    const isTargetMeetingHost = participantIsMeetingHost(
      meta,
      agoraUid,
      joinedMeetingMeta?.createdBy,
      roomHostAgoraUid
    )
    const roomPinNum =
      roomPinnedAgoraUid != null && Number.isFinite(Number(roomPinnedAgoraUid)) ? Number(roomPinnedAgoraUid) : null
    const pinnedForEveryone = roomPinNum === agoraUid
    const someoneElseSpotlighted = roomPinNum != null && roomPinNum !== agoraUid
    const items = []

    if (roomPinNum == null) {
      const locallyPinned = localViewerPinAgoraUid != null && Number(localViewerPinAgoraUid) === agoraUid
      items.push({
        key: 'pin-local',
        label: locallyPinned ? 'Unpin for me' : 'Pin for me',
        onClick: () => setLocalViewerPinAgoraUid(locallyPinned ? null : agoraUid),
      })
    } else if (pinnedForEveryone) {
      items.push({ key: 'spotlit', label: 'Spotlighted for everyone', disabled: true, onClick: () => {} })
    }

    if (localIsHost && !isTargetMeetingHost) {
      if (!pinnedForEveryone) {
        items.push({
          key: 'spotlight-all',
          label: someoneElseSpotlighted ? 'Spotlight for everyone (replace)' : 'Spotlight for everyone',
          onClick: () => hostSetPinnedAgoraUid(agoraUid),
        })
      } else {
        items.push({
          key: 'clear-spotlight',
          label: 'Remove spotlight for everyone',
          onClick: () => hostSetPinnedAgoraUid(null),
        })
      }
      if (fbUid) {
        items.push({
          key: 'mute-all',
          label: 'Mute for everyone',
          onClick: () =>
            setHostConfirm({
              title: 'Mute this participant?',
              body: `${displayName} will be muted. They cannot unmute until you allow their microphone in Permissions.`,
              onConfirm: async () => {
                await patchParticipantMediaPolicy(fbUid, { micAllowed: false })
              },
            }),
        })
        items.push({
          key: 'cam-off',
          label: 'Turn off camera for everyone',
          onClick: () =>
            setHostConfirm({
              title: 'Turn off camera for this participant?',
              body: `${displayName} will lose video until you allow their camera again in Permissions.`,
              onConfirm: async () => {
                await patchParticipantMediaPolicy(fbUid, { cameraAllowed: false })
              },
            }),
        })
        items.push({
          key: 'kick',
          label: 'Remove from meeting',
          onClick: () =>
            setHostConfirm({
              title: 'Remove from meeting?',
              body: `${displayName} will be disconnected. They can rejoin with the link unless you ban them.`,
              onConfirm: async () => {
                await hostKickOrBanFirebaseUid(fbUid, { ban: false })
              },
            }),
        })
        items.push({
          key: 'ban',
          label: 'Ban from meeting',
          danger: true,
          onClick: () =>
            setHostConfirm({
              title: 'Ban this participant?',
              body: `${displayName} will be removed and cannot rejoin this room.`,
              onConfirm: async () => {
                await hostKickOrBanFirebaseUid(fbUid, { ban: true })
              },
            }),
        })
      } else {
        items.push({
          key: 'nolink',
          label: 'Host controls need a signed-in participant',
          disabled: true,
          onClick: () => {},
        })
      }
    }

    return items
  }

  const buildLocalParticipantMenuItems = () => {
    const agoraUid = localAgoraUid
    if (agoraUid == null) return []
    const roomPinNum =
      roomPinnedAgoraUid != null && Number.isFinite(Number(roomPinnedAgoraUid)) ? Number(roomPinnedAgoraUid) : null
    const items = []
    if (roomPinNum == null) {
      const locallyPinned = localViewerPinAgoraUid != null && Number(localViewerPinAgoraUid) === agoraUid
      items.push({
        key: 'pin-local-self',
        label: locallyPinned ? 'Unpin for me' : 'Pin for me',
        onClick: () => setLocalViewerPinAgoraUid(locallyPinned ? null : agoraUid),
      })
    }
    if (localIsHost) {
      if (roomPinNum == null) {
        items.push({
          key: 'spotlight-self',
          label: 'Spotlight my video for everyone',
          onClick: () => hostSetPinnedAgoraUid(agoraUid),
        })
      } else if (roomPinNum === agoraUid) {
        items.push({
          key: 'clear-spotlight-self',
          label: 'Remove spotlight for everyone',
          onClick: () => hostSetPinnedAgoraUid(null),
        })
      }
    }
    return items
  }

  return (
    <main className={['app-main', 'video-call-main', !joined && 'video-call-main--lobby'].filter(Boolean).join(' ')}>
      {generatingSummary ? (
        <div className="video-call-generating-summary">
          <div className="video-call-generating-spinner" />
          <h2>Generating meeting summary</h2>
          <p>Hang on tight, this will only take a moment...</p>
        </div>
      ) : !joined ? (
        <>
          <div className="video-call-lobby video-call-lobby--wide">
            <div className="video-call-lobby-header">
              <h2 className="video-call-lobby-title">Video meetings</h2>
              <p className="video-call-lobby-sub">
                {videoRouteOrgId
                  ? `${videoUserOrgs[0]?.name || 'This organization'} — start, schedule, or join with a meeting ID.`
                  : 'Across all your organizations — start a call (pick an org), schedule, or join with a meeting ID.'}
              </p>
            </div>
            {!videoOrgsLoaded ? (
              <p className="video-call-lobby-muted">Loading…</p>
            ) : videoRouteForbidden ? (
              <p className="video-call-lobby-muted">
                You do not have access to this organization.{' '}
                <Link to="/app" className="video-call-lobby-link">
                  Back to dashboard
                </Link>
              </p>
            ) : videoUserOrgs.length === 0 ? (
              <p className="video-call-lobby-muted">
                Join an organization first, or{' '}
                <Link to="/app/organizations" className="video-call-lobby-link">
                  open Organizations
                </Link>{' '}
                to get started.
              </p>
            ) : (
              <>
                <div className="video-call-action-cards">
                  <button
                    type="button"
                    className="video-call-action-card"
                    onClick={openPreJoinInstant}
                  >
                    <span className="video-call-action-card-kicker">Start now</span>
                    <span className="video-call-action-card-title">New meeting</span>
                    <span className="video-call-action-card-desc">
                      Opens a preview to turn your camera and microphone on or off, then starts an instant meeting.
                    </span>
                  </button>
                  <div className="video-call-action-card video-call-action-card--static">
                    <span className="video-call-action-card-kicker">Calendar</span>
                    <span className="video-call-action-card-title">Schedule meeting</span>
                    <span className="video-call-action-card-desc">Add a dated event, optional video, and invite people.</span>
                    <div className="video-call-action-card-actions">
                      <Button type="button" variant="primary" size="md" onClick={() => setScheduleModalOpen(true)}>
                        Schedule here
                      </Button>
                      <Link to={`${calendarBasePath}?create=1`} className="video-call-action-card-calendar-link">
                        Open calendar →
                      </Link>
                    </div>
                  </div>
                  <div className="video-call-action-card video-call-action-card--static">
                    <span className="video-call-action-card-kicker">ID</span>
                    <span className="video-call-action-card-title">Join meeting</span>
                    <span className="video-call-action-card-desc">
                      {videoRouteOrgId
                        ? 'Paste the meeting ID from the calendar event (document id in this organization).'
                        : 'Paste the meeting ID — we search every organization you belong to.'}
                    </span>
                    <div className="video-call-join-id-row">
                      <input
                        type="text"
                        className="auth-input video-call-join-id-input"
                        placeholder="Meeting ID"
                        value={joinMeetingIdInput}
                        onChange={(e) => setJoinMeetingIdInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && joinMeetingIdInput.trim() && !joinByIdLoading) {
                            e.preventDefault()
                            joinMeetingById()
                          }
                        }}
                        disabled={joinByIdLoading}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={joinMeetingById}
                        disabled={joinByIdLoading || !joinMeetingIdInput.trim()}
                      >
                        {joinByIdLoading ? '…' : 'Load'}
                      </Button>
                    </div>
                  </div>
                </div>

                <section className="video-call-ongoing-section" aria-labelledby="video-ongoing-heading">
                  <h3 id="video-ongoing-heading" className="video-call-ongoing-heading">
                    Ongoing meetings
                  </h3>
                  <p className="video-call-ongoing-sub">
                    {videoRouteOrgId
                      ? 'Join active rooms in this organization (refreshes every few seconds). Only meetings you can access are shown.'
                      : 'Join active rooms across all your organizations (refreshes every few seconds). Each row shows which org it belongs to.'}
                  </p>
                  {ongoingMeetingsLoading && ongoingMeetings.length === 0 ? (
                    <p className="video-call-lobby-muted">Loading ongoing meetings…</p>
                  ) : ongoingMeetingsError ? (
                    <p className="auth-error video-call-lobby-error">{ongoingMeetingsError}</p>
                  ) : ongoingMeetings.length === 0 ? (
                    <p className="video-call-lobby-muted">
                      No open rooms right now. When someone is in a call you can access, it will appear here.
                    </p>
                  ) : (
                    <ul className="video-call-ongoing-list">
                      {ongoingMeetings.map((m) => (
                        <li key={`${m.orgId || 'x'}-${m.id}`} className="video-call-ongoing-row">
                          <span className="video-call-ongoing-live video-call-ongoing-live--start" aria-label="Room open">
                            Live
                          </span>
                          <div className="video-call-ongoing-row-middle">
                            <span className="video-call-ongoing-title">{m.title || 'Meeting'}</span>
                            <span className="video-call-ongoing-meta">
                              {!videoRouteOrgId && m._orgName ? (
                                <span className="video-call-ongoing-org">{m._orgName}</span>
                              ) : null}
                              {m._hostLabel ? (
                                <span className="video-call-ongoing-host">Host: {m._hostLabel}</span>
                              ) : null}
                              {formatMeetingStart(m) ? <span>{formatMeetingStart(m)}</span> : null}
                              <OngoingRowRunningMeta since={m._sessionStartedAt} />
                              {typeof m._participantCount === 'number' ? (
                                <span
                                  className="video-call-ongoing-participants"
                                  title="People signed into this room (from Notus)"
                                >
                                  <Users size={14} strokeWidth={2.25} aria-hidden />
                                  {m._participantCount}
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="video-call-ongoing-join"
                            onClick={() => openPreJoinForMeeting(m)}
                            disabled={loading}
                          >
                            Join
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="video-call-upcoming-section" aria-labelledby="video-upcoming-heading">
                  <div className="video-call-upcoming-header">
                    <h3 id="video-upcoming-heading" className="video-call-upcoming-heading">
                      Upcoming meetings
                    </h3>
                    <div className="video-call-upcoming-horizon-wrap" ref={upcomingHorizonWrapRef}>
                      <button
                        type="button"
                        className="video-call-upcoming-horizon-btn"
                        aria-expanded={upcomingHorizonMenuOpen}
                        aria-haspopup="menu"
                        onClick={() => setUpcomingHorizonMenuOpen((o) => !o)}
                      >
                        <MoreVertical size={18} strokeWidth={2.25} />
                        <span>Upcoming range</span>
                      </button>
                      {upcomingHorizonMenuOpen && (
                        <div className="video-call-upcoming-horizon-menu" role="menu">
                          <div className="video-call-upcoming-horizon-menu-label">Show upcoming meetings</div>
                          {UPCOMING_HORIZON_OPTIONS.map((opt) => (
                            <button
                              key={opt.days}
                              type="button"
                              role="menuitem"
                              className={`video-call-upcoming-horizon-item ${upcomingHorizonDays === opt.days ? 'video-call-upcoming-horizon-item--active' : ''}`}
                              onClick={() => {
                                setUpcomingHorizonDays(opt.days)
                                try {
                                  localStorage.setItem(UPCOMING_HORIZON_KEY, String(opt.days))
                                } catch {
                                  /* ignore */
                                }
                                setUpcomingHorizonMenuOpen(false)
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="video-call-upcoming-sub">
                    Calendar-scheduled video meetings only (instant meetings are not listed here), with a start time
                    from now through the next{' '}
                    {UPCOMING_HORIZON_OPTIONS.find((o) => o.days === upcomingHorizonDays)?.label ||
                      `${upcomingHorizonDays} days`}
                    . Past starts are omitted; use Ongoing for rooms that still have people in them.
                  </p>
                  {upcomingMeetingsLoading && upcomingMeetings.length === 0 ? (
                    <p className="video-call-lobby-muted">Loading upcoming…</p>
                  ) : upcomingMeetings.length === 0 ? (
                    <p className="video-call-lobby-muted">No upcoming meetings in this range.</p>
                  ) : (
                    <ul className="video-call-upcoming-list">
                      {upcomingMeetings.map((m) => (
                        <li key={`${m.orgId || 'x'}-up-${m.id}`} className="video-call-upcoming-row">
                          <div className="video-call-upcoming-row-text">
                            <span className="video-call-upcoming-title">{m.title || 'Meeting'}</span>
                            <span className="video-call-upcoming-meta">
                              {!videoRouteOrgId && m._orgName ? (
                                <span className="video-call-ongoing-org">{m._orgName}</span>
                              ) : null}
                              {formatMeetingStart(m) ? <span>{formatMeetingStart(m)}</span> : null}
                            </span>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => openPreJoinForMeeting(m)} disabled={loading}>
                            Join options
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {selectedMeeting && (
                  <div className="video-call-lobby-ready">
                    <p className="video-call-lobby-ready-title">
                      Ready to join: <strong>{selectedMeeting.title || 'Meeting'}</strong>
                      {formatMeetingStart(selectedMeeting) ? (
                        <span className="video-call-lobby-ready-time"> · {formatMeetingStart(selectedMeeting)}</span>
                      ) : null}
                    </p>
                    <Button variant="primary" type="button" onClick={openPreJoinMeeting} disabled={loading}>
                      Join with audio &amp; video options…
                    </Button>
                  </div>
                )}

                {error && <p className="auth-error video-call-lobby-error">{error}</p>}
                <p className="video-call-lobby-muted video-call-lobby-calendar-hint">
                  Scheduled calls live on the{' '}
                  <Link to={calendarBasePath} className="video-call-lobby-link">
                    calendar
                  </Link>
                  . Open an event from there to join with a link, or paste its meeting ID above.
                </p>
                <div className="video-call-previous-wrap">
                  <Link to="/app/previous-meetings" className="video-call-previous-link">
                    View previous meetings →
                  </Link>
                  <p className="video-call-lobby-hint">
                    After a call, use <strong>End for everyone</strong> as host to generate notes (when the AI backend is connected).
                  </p>
                </div>
              </>
            )}
          </div>
          {scheduleOrgForModal && user && (
            <CreateEventModal
              isOpen={scheduleModalOpen}
              onClose={() => setScheduleModalOpen(false)}
              user={user}
              activeOrgId={scheduleOrgForModal}
              defaultDate={null}
              onCreated={() => {}}
            />
          )}
          <NewMeetingSettingsModal
            isOpen={newMeetingSettingsOpen}
            onClose={() => !loading && setNewMeetingSettingsOpen(false)}
            titleValue={newMeetingTitleDraft}
            onTitleChange={setNewMeetingTitleDraft}
            allowRemoteScreenShare={newMeetingAllowShareDraft}
            onAllowRemoteScreenShareChange={setNewMeetingAllowShareDraft}
            onContinue={continueNewMeetingToPreJoin}
            orgOptions={!videoRouteOrgId && videoUserOrgs.length > 1 ? videoUserOrgs : null}
            selectedOrgId={instantMeetingOrgId}
            onOrgChange={setInstantMeetingOrgId}
          />
          <VideoPreJoinModal
            isOpen={preJoinOpen}
            onClose={() => !loading && setPreJoinOpen(false)}
            title={
              preJoinMode === 'instant'
                ? preJoinInstantMeetingTitle || 'Instant meeting'
                : selectedMeeting?.title || 'Join meeting'
            }
            subtitle={
              preJoinMode === 'instant'
                ? 'Choose your microphone and camera before you start.'
                : 'Choose your microphone and camera before you enter the room.'
            }
            previewStream={preJoinPreviewStream}
            previewError={preJoinPreviewError}
            micOn={preJoinMicOn}
            camOn={preJoinCamOn}
            onToggleMic={() => setPreJoinMicOn((v) => !v)}
            onToggleCam={() => setPreJoinCamOn((v) => !v)}
            showHostOptions={
              preJoinMode === 'instant' ||
              (preJoinMode === 'meeting' && selectedMeeting && user?.uid === selectedMeeting.createdBy)
            }
            allowRemoteScreenShare={preJoinAllowRemoteShare}
            onAllowRemoteScreenShareChange={setPreJoinAllowRemoteShare}
            confirmLabel={preJoinMode === 'instant' ? 'Start meeting' : 'Join meeting'}
            loading={loading}
            onConfirm={confirmPreJoin}
          />
        </>
      ) : (
        <div className="video-call-room video-call-room--immersive">
          <div className="video-call-room-body video-call-room-body--immersive">
            <div className="video-call-main-column">
              <div className="video-call-inroom-topbar">
                <InRoomTopBarTimer sessionStartedAt={roomSessionStartedAt} />
                <span
                  className="video-call-participant-count"
                  role="status"
                  aria-live="polite"
                  aria-label={`${inRoomParticipantCount} ${inRoomParticipantCount === 1 ? 'participant' : 'participants'} in this meeting`}
                  title="People in this meeting"
                >
                  <Users size={17} strokeWidth={2.25} aria-hidden />
                  <span className="video-call-participant-count-num">{inRoomParticipantCount}</span>
                </span>
              </div>
              {pinnedShareActive && screenShareBannerText && (
                <div className="video-screen-share-banner" role="status">
                  <Monitor size={16} strokeWidth={2.5} aria-hidden />
                  <span>{screenShareBannerText}</span>
                </div>
              )}
              <div
                className={['video-area', (pinnedShareActive || spotlightLayoutActive) && 'video-area--pinned-share']
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="video-stage">
                  {pinnedShareActive ? (
                    <div className="video-stage__pin">
                      {screenSharing && localScreenShareTrack ? (
                        <>
                          <VideoParticipantLabel
                            className="video-player-label--on-stage"
                            name="Your screen"
                            micOn={micEnabled}
                            showHost={localIsHost}
                          />
                          <LocalScreenSharePreview track={localScreenShareTrack} videoOn={camEnabled} fill />
                        </>
                      ) : remoteScreenSharer ? (
                        <RemoteVideoPlayer
                          user={remoteScreenSharer}
                          displayName={participantMeta[String(remoteScreenSharer.uid)]?.displayName}
                          photoUrl={participantMeta[String(remoteScreenSharer.uid)]?.photoUrl}
                          isHost={participantIsMeetingHost(
                            participantMeta[String(remoteScreenSharer.uid)],
                            remoteScreenSharer.uid,
                            joinedMeetingMeta?.createdBy,
                            roomHostAgoraUid
                          )}
                          stageLabel={`${
                            participantMeta[String(remoteScreenSharer.uid)]?.displayName ||
                            `User ${remoteScreenSharer.uid}`
                          } · Screen`}
                          mode="stage"
                        />
                      ) : null}
                    </div>
                  ) : spotlightLayoutActive ? (
                    <div className="video-stage__pin">
                      {spotlightIsLocal ? (
                        <div className="video-spotlight-stage-wrap video-tile-wrap">
                          <div className="video-tile-chrome video-tile-chrome--stage">
                            <span className="video-tile-chrome-spacer" aria-hidden />
                            <ParticipantTileOverflow
                              menuKey="local-spotlight-main"
                              openKey={participantMenuKey}
                              onOpenChange={setParticipantMenuKey}
                              variant="tile"
                              items={buildLocalParticipantMenuItems()}
                            />
                          </div>
                          <div className="video-player video-player-local video-player--stage">
                            <VideoParticipantLabel
                              name="You"
                              micOn={micEnabled}
                              showHost={localIsHost}
                              className="video-player-label--on-stage"
                            />
                            <LocalVideoTrack
                              track={localCameraTrack}
                              camOn={camEnabled}
                              photoUrl={localPhotoUrl}
                              nameHint={user?.displayName || user?.email || 'You'}
                            />
                          </div>
                        </div>
                      ) : spotlightRemoteUser ? (
                        <div className="video-spotlight-stage-wrap video-tile-wrap">
                          <div className="video-tile-chrome video-tile-chrome--stage">
                            <span className="video-tile-chrome-spacer" aria-hidden />
                            <ParticipantTileOverflow
                              menuKey={`remote-spot-${spotlightRemoteUser.uid}`}
                              openKey={participantMenuKey}
                              onOpenChange={setParticipantMenuKey}
                              variant="tile"
                              items={buildRemoteParticipantMenuItems(
                                spotlightRemoteUser,
                                participantMeta[String(spotlightRemoteUser.uid)]
                              )}
                            />
                          </div>
                          <RemoteVideoPlayer
                            user={spotlightRemoteUser}
                            displayName={participantMeta[String(spotlightRemoteUser.uid)]?.displayName}
                            photoUrl={participantMeta[String(spotlightRemoteUser.uid)]?.photoUrl}
                            isHost={participantIsMeetingHost(
                              participantMeta[String(spotlightRemoteUser.uid)],
                              spotlightRemoteUser.uid,
                              joinedMeetingMeta?.createdBy,
                              roomHostAgoraUid
                            )}
                            mode="stage"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      className={[
                        'video-streams',
                        'video-streams--gallery-fill',
                        remoteUsers.length + 1 === 1 && 'video-streams--solo',
                        remoteUsers.length + 1 === 3 && 'video-streams--triad',
                        remoteUsers.length + 1 >= 5 && 'video-streams--many',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-tile-count={remoteUsers.length + 1}
                    >
                      <div className="video-streams__slot video-streams__slot--local video-tile-wrap">
                        <div className="video-tile-chrome video-tile-chrome--overlay video-tile-chrome--overlay-end">
                          <ParticipantTileOverflow
                            menuKey="local-gallery"
                            openKey={participantMenuKey}
                            onOpenChange={setParticipantMenuKey}
                            variant="tile"
                            items={buildLocalParticipantMenuItems()}
                          />
                        </div>
                        <div className="video-player video-player-local" id="local-player">
                          <VideoParticipantLabel name="You" micOn={micEnabled} showHost={localIsHost} />
                          <LocalVideoTrack
                            track={localCameraTrack}
                            camOn={camEnabled}
                            photoUrl={localPhotoUrl}
                            nameHint={user?.displayName || user?.email || 'You'}
                          />
                        </div>
                      </div>

                      {remoteUsers.map((u) => {
                        const meta = participantMeta[String(u.uid)]
                        const isRemoteHost = participantIsMeetingHost(
                          meta,
                          u.uid,
                          joinedMeetingMeta?.createdBy,
                          roomHostAgoraUid
                        )
                        return (
                          <div
                            key={u.uid}
                            className="video-streams__slot video-streams__slot--remote video-tile-wrap"
                          >
                            <div className="video-tile-chrome video-tile-chrome--overlay video-tile-chrome--overlay-end">
                              <ParticipantTileOverflow
                                menuKey={`remote-gallery-${u.uid}`}
                                openKey={participantMenuKey}
                                onOpenChange={setParticipantMenuKey}
                                variant="tile"
                                items={buildRemoteParticipantMenuItems(u, meta)}
                              />
                            </div>
                            <RemoteVideoPlayer
                              user={u}
                              displayName={meta?.displayName}
                              photoUrl={meta?.photoUrl}
                              isHost={isRemoteHost}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {pinnedShareActive && (
                  <div className="video-filmstrip" aria-label="Participants">
                    <div className="video-filmstrip__scroll">
                      <div className="video-filmstrip__item video-tile-wrap video-tile-wrap--filmstrip">
                        <ParticipantTileOverflow
                          menuKey="local-filmstrip-share"
                          openKey={participantMenuKey}
                          onOpenChange={setParticipantMenuKey}
                          variant="filmstrip"
                          items={buildLocalParticipantMenuItems()}
                        />
                        <div className="video-player video-player-local video-player--filmstrip">
                          <VideoParticipantLabel
                            className="video-player-label--filmstrip"
                            name="You"
                            micOn={micEnabled}
                            showHost={localIsHost}
                          />
                          <LocalVideoTrack
                            track={localCameraTrack}
                            camOn={screenSharing ? true : camEnabled}
                            photoUrl={localPhotoUrl}
                            nameHint={user?.displayName || user?.email || 'You'}
                          />
                        </div>
                      </div>
                      {filmstripRemoteUsers.map((u) => {
                        const meta = participantMeta[String(u.uid)]
                        const isRemoteHost = participantIsMeetingHost(
                          meta,
                          u.uid,
                          joinedMeetingMeta?.createdBy,
                          roomHostAgoraUid
                        )
                        return (
                          <div key={u.uid} className="video-filmstrip__item video-tile-wrap video-tile-wrap--filmstrip">
                            <ParticipantTileOverflow
                              menuKey={`remote-fs-share-${u.uid}`}
                              openKey={participantMenuKey}
                              onOpenChange={setParticipantMenuKey}
                              variant="filmstrip"
                              items={buildRemoteParticipantMenuItems(u, meta)}
                            />
                            <RemoteVideoPlayer
                              user={u}
                              displayName={meta?.displayName}
                              photoUrl={meta?.photoUrl}
                              isHost={isRemoteHost}
                              mode="filmstrip"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {spotlightLayoutActive && (
                  <div className="video-filmstrip" aria-label="Participants">
                    <div className="video-filmstrip__scroll">
                      {spotlightFilmstripItems.map((item) =>
                        item.kind === 'local' ? (
                          <div key="strip-local" className="video-filmstrip__item video-tile-wrap video-tile-wrap--filmstrip">
                            <ParticipantTileOverflow
                              menuKey="local-filmstrip-spot"
                              openKey={participantMenuKey}
                              onOpenChange={setParticipantMenuKey}
                              variant="filmstrip"
                              items={buildLocalParticipantMenuItems()}
                            />
                            <div className="video-player video-player-local video-player--filmstrip">
                              <VideoParticipantLabel
                                className="video-player-label--filmstrip"
                                name="You"
                                micOn={micEnabled}
                                showHost={localIsHost}
                              />
                              <LocalVideoTrack
                                track={localCameraTrack}
                                camOn={camEnabled}
                                photoUrl={localPhotoUrl}
                                nameHint={user?.displayName || user?.email || 'You'}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            key={item.user.uid}
                            className="video-filmstrip__item video-tile-wrap video-tile-wrap--filmstrip"
                          >
                            <ParticipantTileOverflow
                              menuKey={`remote-fs-spot-${item.user.uid}`}
                              openKey={participantMenuKey}
                              onOpenChange={setParticipantMenuKey}
                              variant="filmstrip"
                              items={buildRemoteParticipantMenuItems(item.user, participantMeta[String(item.user.uid)])}
                            />
                            <RemoteVideoPlayer
                              user={item.user}
                              displayName={participantMeta[String(item.user.uid)]?.displayName}
                              photoUrl={participantMeta[String(item.user.uid)]?.photoUrl}
                              isHost={participantIsMeetingHost(
                                participantMeta[String(item.user.uid)],
                                item.user.uid,
                                joinedMeetingMeta?.createdBy,
                                roomHostAgoraUid
                              )}
                              mode="filmstrip"
                            />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {sidePanelTab && (
              <aside className="video-call-side-panel" aria-label="In-meeting chat and assistant">
                <div className="video-call-side-panel-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sidePanelTab === 'messages'}
                    className={[
                      'video-call-side-panel-tab',
                      sidePanelTab === 'messages' && 'video-call-side-panel-tab--active',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!roomPrefsLive.continuousMeetingChat}
                    onClick={() => roomPrefsLive.continuousMeetingChat && setSidePanelTab('messages')}
                  >
                    Messages
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sidePanelTab === 'ai'}
                    className={[
                      'video-call-side-panel-tab',
                      sidePanelTab === 'ai' && 'video-call-side-panel-tab--active',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSidePanelTab('ai')}
                  >
                    Ask AI
                  </button>
                </div>
                <div className="video-call-side-panel-body">
                  {sidePanelTab === 'messages' &&
                    (roomPrefsLive.continuousMeetingChat ? (
                      <VideoCallChat channelName={channelName} user={user} omitHeader />
                    ) : (
                      <p className="video-call-side-panel-disabled">The host turned off continuous meeting chat.</p>
                    ))}
                  {sidePanelTab === 'ai' && (
                    <div className="video-call-meeting-chat video-call-meeting-chat--in-panel">
                      {meetingHistory.length > 0 && (
                        <div className="video-call-meeting-chat-history">
                          {meetingHistory.map((msg, i) => (
                            <div key={i} className={`video-call-meeting-chat-msg video-call-meeting-chat-msg--${msg.role}`}>
                              <span className="video-call-meeting-chat-msg-label">{msg.role === 'user' ? 'You' : 'AI'}</span>
                              <span className="video-call-meeting-chat-msg-text">{msg.text}</span>
                            </div>
                          ))}
                          {askLoading && (
                            <div className="video-call-meeting-chat-msg video-call-meeting-chat-msg--ai">
                              <span className="video-call-meeting-chat-msg-label">AI</span>
                              <span className="video-call-meeting-chat-msg-text">…</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="video-call-meeting-chat-row">
                        <input
                          type="text"
                          className="auth-input video-call-meeting-chat-input"
                          placeholder="e.g. What did we decide about the timeline?"
                          value={meetingQuestion}
                          onChange={(e) => setMeetingQuestion(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && askMeeting()}
                          disabled={askLoading || !aiRestBase}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={askMeeting}
                          disabled={askLoading || !meetingQuestion.trim() || !aiRestBase}
                        >
                          {askLoading ? '…' : 'Ask'}
                        </Button>
                      </div>
                      {!aiRestBase && (
                        <p className="video-call-meeting-chat-hint">Set VITE_API_URL or VITE_AI_WS_URL to enable meeting Q&A.</p>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
          <div className="video-call-controls-bar" role="toolbar" aria-label="Call controls">
            <div className="video-call-controls-bar-inner">
              <Button className="video-call-control-btn" variant={micEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleMic} aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}>
                {micEnabled ? <Mic size={20} strokeWidth={2.25} /> : <MicOff size={20} strokeWidth={2.25} />}
              </Button>
              <Button className="video-call-control-btn" variant={camEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleCam} aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'}>
                {camEnabled ? <Video size={20} strokeWidth={2.25} /> : <VideoOff size={20} strokeWidth={2.25} />}
              </Button>
              <Button className="video-call-control-btn" variant={showNotepad ? 'primary' : 'outline'} size="sm" onClick={toggleNotepad} aria-label="Notepad">
                <NotebookPen size={20} strokeWidth={2.25} />
              </Button>
              {!localIsHost && (
                <div className="video-host-more-wrap" ref={guestMenuWrapRef}>
                  <Button
                    className="video-call-control-btn"
                    variant={guestMenuOpen || meetingInfoOpen ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setGuestMenuOpen((o) => !o)}
                    aria-label="Meeting menu"
                    aria-expanded={guestMenuOpen}
                    aria-haspopup="menu"
                  >
                    <MoreVertical size={20} strokeWidth={2.25} />
                  </Button>
                  {guestMenuOpen && (
                    <div className="video-host-dropdown" role="menu">
                      <button
                        type="button"
                        className="video-host-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setMeetingInfoOpen(true)
                          setGuestMenuOpen(false)
                        }}
                      >
                        Meeting information
                      </button>
                    </div>
                  )}
                </div>
              )}
              <Button
                className="video-call-control-btn"
                variant={sidePanelTab === 'messages' ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleChat}
                aria-label="Chat"
                disabled={!roomPrefsLive.continuousMeetingChat}
                title={
                  !roomPrefsLive.continuousMeetingChat
                    ? 'Continuous meeting chat is off for this room'
                    : undefined
                }
              >
                <MessageSquare size={20} strokeWidth={2.25} />
              </Button>
              <Button
                className="video-call-control-btn"
                variant={sidePanelTab === 'ai' ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleBot}
                aria-label="Ask AI"
              >
                <Bot size={20} strokeWidth={2.25} />
              </Button>
              <Button
                className="video-call-control-btn"
                variant={screenSharing ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleScreenShare}
                disabled={loading}
                aria-label={screenSharing ? 'Stop sharing' : 'Share screen'}
              >
                <Monitor size={20} strokeWidth={2.25} />
              </Button>
              {screenSharing && (
                <Button
                  className="video-call-control-btn"
                  variant="outline"
                  size="sm"
                  onClick={changeScreenShareSource}
                  disabled={loading}
                  aria-label="Share a different screen or window"
                  title="Pick another display, window, or browser tab"
                >
                  <RefreshCw size={20} strokeWidth={2.25} />
                </Button>
              )}
              {joinedMeetingMeta?.createdBy === user?.uid && (
                <div className="video-host-more-wrap" ref={hostMenuWrapRef}>
                  <Button
                    className="video-call-control-btn"
                    variant={hostMenuOpen ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setHostMenuOpen((o) => !o)}
                    aria-label="Meeting menu"
                    aria-expanded={hostMenuOpen}
                    aria-haspopup="menu"
                  >
                    <MoreVertical size={20} strokeWidth={2.25} />
                  </Button>
                  {hostMenuOpen && (
                    <div className="video-host-dropdown" role="menu">
                      <button
                        type="button"
                        className="video-host-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setMeetingInfoOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        Meeting information
                      </button>
                      <button
                        type="button"
                        className="video-host-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setHostPrefsDraft({ ...roomPrefsLive })
                          setHostPrefsModalOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        Meeting preferences
                      </button>
                      <button
                        type="button"
                        className="video-host-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setHostPermissionsOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        Permissions
                      </button>
                    </div>
                  )}
                </div>
              )}
              <Button className="video-call-control-btn video-call-control-btn--leave" variant="primary" size="sm" onClick={onLeaveButtonClick} disabled={loading} aria-label="Leave call">
                <LogOut size={20} strokeWidth={2.25} />
              </Button>
            </div>
          </div>
          {joined && meetingInfoOpen && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-host-meeting-info-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => !hostActionLoading && setMeetingInfoOpen(false)}
              />
              <div className="video-host-modal video-host-modal--info">
                <h3 id="video-host-meeting-info-title" className="video-host-modal-title">
                  Meeting information
                </h3>
                <dl className="video-host-info-list">
                  <div>
                    <dt>Title</dt>
                    <dd>{joinedMeetingMeta?.meetingTitle || 'Meeting'}</dd>
                  </div>
                  <div>
                    <dt>Host</dt>
                    <dd>
                      {organizerDisplayForInfo || joinedMeetingMeta?.createdBy || '—'}
                      {joinedMeetingMeta?.createdBy && user?.uid === joinedMeetingMeta.createdBy ? (
                        <span className="video-host-info-you"> (you)</span>
                      ) : null}
                    </dd>
                  </div>
                  <MeetingRunningClockRow sessionStartedAt={roomSessionStartedAt} />
                  {(localIsHost || roomShowMeetingIdForParticipants) && (
                    <div>
                      <dt>Meeting ID</dt>
                      <dd className="video-host-info-row">
                        <code className="video-host-info-code">{joinedMeetingMeta?.meetingId || '—'}</code>
                        {joinedMeetingMeta?.meetingId && (
                          <button
                            type="button"
                            className="video-host-info-copy"
                            onClick={copyHostMeetingId}
                            aria-label="Copy meeting ID"
                          >
                            <Copy size={16} strokeWidth={2.25} />
                          </button>
                        )}
                      </dd>
                    </div>
                  )}
                  {!localIsHost && !roomShowMeetingIdForParticipants ? (
                    <div>
                      <dt>Meeting ID</dt>
                      <dd className="video-host-info-muted">Only the host can see the meeting ID unless they choose to show it to everyone.</dd>
                    </div>
                  ) : null}
                  {channelName ? (
                    <div>
                      <dt>Room</dt>
                      <dd>
                        <code className="video-host-info-code video-host-info-code--muted">{channelName}</code>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div
                  className={['video-host-modal-footer', localIsHost && 'video-host-modal-footer--split'].filter(Boolean).join(' ')}
                >
                  {localIsHost ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={hostActionLoading || !channelName}
                      onClick={() =>
                        setHostConfirm({
                          title: roomShowMeetingIdForParticipants
                            ? 'Hide meeting ID from participants?'
                            : 'Show meeting ID to everyone?',
                          body: roomShowMeetingIdForParticipants
                            ? 'Guests will no longer see the meeting ID in Meeting information.'
                            : 'All participants will be able to see and copy the meeting ID from Meeting information.',
                          onConfirm: async () => {
                            await updateDoc(doc(db, 'videoChannels', channelName, 'roomState', 'current'), {
                              showMeetingIdForParticipants: !roomShowMeetingIdForParticipants,
                            })
                          },
                        })
                      }
                    >
                      {roomShowMeetingIdForParticipants ? 'Hide meeting ID from participants' : 'Show meeting ID to everyone'}
                    </Button>
                  ) : null}
                  <Button type="button" variant="primary" size="sm" onClick={() => setMeetingInfoOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
          {localIsHost && hostPrefsModalOpen && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-host-prefs-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => !hostActionLoading && setHostPrefsModalOpen(false)}
              />
              <div className="video-host-modal video-host-modal--prefs video-host-modal--scroll">
                <h3 id="video-host-prefs-title" className="video-host-modal-title">
                  Meeting preferences
                </h3>
                <p className="video-host-modal-hint">
                  Changes apply to everyone in the room. Chat availability updates immediately.
                </p>
                <RoomPrefsFields prefs={hostPrefsDraft} onChange={setHostPrefsDraft} className="video-room-prefs--host-modal" />
                <div className="video-host-modal-footer">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHostPrefsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      await hostSaveRoomPrefs(hostPrefsDraft)
                      setHostPrefsModalOpen(false)
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
          {localIsHost && hostPermissionsOpen && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-host-perms-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => !hostActionLoading && setHostPermissionsOpen(false)}
              />
              <div className="video-host-modal">
                <h3 id="video-host-perms-title" className="video-host-modal-title">
                  Permissions
                </h3>
                <p className="video-host-modal-hint">
                  Choose a category. Every change is confirmed before it applies.
                </p>
                <div className="video-host-perm-categories">
                  <button
                    type="button"
                    className="video-host-perm-category"
                    onClick={() => {
                      setHostPermissionsOpen(false)
                      setHostPolicyModal('mic')
                    }}
                  >
                    <span className="video-host-perm-category-label">Microphone</span>
                    <span className="video-host-perm-category-desc">Who can speak (unmute)</span>
                  </button>
                  <button
                    type="button"
                    className="video-host-perm-category"
                    onClick={() => {
                      setHostPermissionsOpen(false)
                      setHostPolicyModal('camera')
                    }}
                  >
                    <span className="video-host-perm-category-label">Camera</span>
                    <span className="video-host-perm-category-desc">Who can turn video on</span>
                  </button>
                  <button
                    type="button"
                    className="video-host-perm-category"
                    onClick={() => {
                      setHostPermissionsOpen(false)
                      setHostPolicyModal('screen')
                    }}
                  >
                    <span className="video-host-perm-category-label">Share screen</span>
                    <span className="video-host-perm-category-desc">Default and per participant</span>
                  </button>
                </div>
                <div className="video-host-modal-footer">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHostPermissionsOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
          {localIsHost && hostPolicyModal === 'mic' && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-host-policy-mic-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => !hostActionLoading && setHostPolicyModal(null)}
              />
              <div className="video-host-modal video-host-modal--scroll">
                <h3 id="video-host-policy-mic-title" className="video-host-modal-title">
                  Microphone
                </h3>
                <p className="video-host-modal-hint">
                  Restricted users stay muted until you allow their mic again.
                </p>
                <ul className="video-host-policy-list">
                  {policyParticipantRows.map((row) => {
                    const eff = row.firebaseUid ? getEffectiveMicAllowed(row.firebaseUid) : true
                    return (
                      <li key={row.firebaseUid || `agora-${row.agoraUid}`} className="video-host-policy-row">
                        <div className="video-host-policy-row-main">
                          <span className="video-host-policy-name">{row.displayName}</span>
                          {row.canManage ? (
                            <span className={eff ? 'video-host-policy-badge video-host-policy-badge--ok' : 'video-host-policy-badge'}>
                              {eff ? 'Allowed' : 'Restricted'}
                            </span>
                          ) : (
                            <span className="video-host-policy-badge video-host-policy-badge--pending">Not linked</span>
                          )}
                        </div>
                        {row.canManage && row.firebaseUid ? (
                          <div className="video-host-policy-actions">
                            {eff ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={hostActionLoading}
                                onClick={() =>
                                  setHostConfirm({
                                    title: 'Restrict microphone?',
                                    body: `Turn off the microphone for ${row.displayName}? They will be muted and cannot unmute until you allow it again.`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { micAllowed: false })
                                    },
                                  })
                                }
                              >
                                Restrict
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={hostActionLoading}
                                onClick={() =>
                                  setHostConfirm({
                                    title: 'Allow microphone?',
                                    body: `Let ${row.displayName} use their microphone again?`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { micAllowed: true })
                                    },
                                  })
                                }
                              >
                                Allow
                              </Button>
                            )}
                          </div>
                        ) : (
                          <p className="video-host-policy-unlinked">This guest can’t be managed until their account is linked.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <div className="video-host-modal-footer">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHostPolicyModal(null)}>
                    Back
                  </Button>
                </div>
              </div>
            </div>
          )}
          {localIsHost && hostPolicyModal === 'camera' && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-host-policy-cam-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => !hostActionLoading && setHostPolicyModal(null)}
              />
              <div className="video-host-modal video-host-modal--scroll">
                <h3 id="video-host-policy-cam-title" className="video-host-modal-title">
                  Camera
                </h3>
                <p className="video-host-modal-hint">
                  Restricted users cannot turn their camera on until you allow it.
                </p>
                <ul className="video-host-policy-list">
                  {policyParticipantRows.map((row) => {
                    const eff = row.firebaseUid ? getEffectiveCameraAllowed(row.firebaseUid) : true
                    return (
                      <li key={row.firebaseUid || `agora-${row.agoraUid}`} className="video-host-policy-row">
                        <div className="video-host-policy-row-main">
                          <span className="video-host-policy-name">{row.displayName}</span>
                          {row.canManage ? (
                            <span className={eff ? 'video-host-policy-badge video-host-policy-badge--ok' : 'video-host-policy-badge'}>
                              {eff ? 'Allowed' : 'Restricted'}
                            </span>
                          ) : (
                            <span className="video-host-policy-badge video-host-policy-badge--pending">Not linked</span>
                          )}
                        </div>
                        {row.canManage && row.firebaseUid ? (
                          <div className="video-host-policy-actions">
                            {eff ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={hostActionLoading}
                                onClick={() =>
                                  setHostConfirm({
                                    title: 'Restrict camera?',
                                    body: `Turn off video for ${row.displayName}? Their camera will stop and they cannot turn it on until you allow it.`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { cameraAllowed: false })
                                    },
                                  })
                                }
                              >
                                Restrict
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={hostActionLoading}
                                onClick={() =>
                                  setHostConfirm({
                                    title: 'Allow camera?',
                                    body: `Let ${row.displayName} turn their camera on again?`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { cameraAllowed: true })
                                    },
                                  })
                                }
                              >
                                Allow
                              </Button>
                            )}
                          </div>
                        ) : (
                          <p className="video-host-policy-unlinked">This guest can’t be managed until their account is linked.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <div className="video-host-modal-footer">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHostPolicyModal(null)}>
                    Back
                  </Button>
                </div>
              </div>
            </div>
          )}
          {localIsHost && hostPolicyModal === 'screen' && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-host-policy-screen-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => !hostActionLoading && setHostPolicyModal(null)}
              />
              <div className="video-host-modal video-host-modal--scroll">
                <h3 id="video-host-policy-screen-title" className="video-host-modal-title">
                  Share screen
                </h3>
                <p className="video-host-modal-hint">
                  Default applies when you have not set a specific override for someone. Per-person rules always win.
                </p>
                <div className="video-host-screen-default">
                  <div className="video-host-screen-default-row">
                    <span className="video-host-screen-default-label">Default for participants</span>
                    <span className={roomAllowRemoteShare ? 'video-host-policy-badge video-host-policy-badge--ok' : 'video-host-policy-badge'}>
                      {roomAllowRemoteShare ? 'Can share' : 'Cannot share'}
                    </span>
                  </div>
                  <div className="video-host-policy-actions">
                    {roomAllowRemoteShare ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={hostActionLoading}
                        onClick={() =>
                          setHostConfirm({
                            title: 'Turn off screen sharing by default?',
                            body: 'Participants will not be able to start sharing unless you allow them individually below (or turn the default back on).',
                            onConfirm: async () => {
                              await setRemoteScreenShareAllowed(false)
                            },
                          })
                        }
                      >
                        Change default…
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={hostActionLoading}
                        onClick={() =>
                          setHostConfirm({
                            title: 'Allow screen sharing by default?',
                            body: 'Participants may share their screen unless you restrict someone below.',
                            onConfirm: async () => {
                              await setRemoteScreenShareAllowed(true)
                            },
                          })
                        }
                      >
                        Change default…
                      </Button>
                    )}
                  </div>
                </div>
                <h4 className="video-host-subheading">Participants</h4>
                {!policyParticipantRows.some((r) => !r.isLocal) ? (
                  <p className="video-host-modal-hint video-host-modal-hint--tight">
                    When others join, they will appear here so you can allow or restrict screen sharing by name.
                  </p>
                ) : null}
                <ul className="video-host-policy-list">
                  {policyParticipantRows.map((row) => {
                    if (row.isLocal) return null
                    const eff = row.firebaseUid ? getEffectiveScreenAllowedForParticipant(row.firebaseUid) : roomAllowRemoteShare
                    return (
                      <li key={row.firebaseUid || `agora-${row.agoraUid}`} className="video-host-policy-row">
                        <div className="video-host-policy-row-main">
                          <span className="video-host-policy-name">{row.displayName}</span>
                          {row.canManage ? (
                            <span className={eff ? 'video-host-policy-badge video-host-policy-badge--ok' : 'video-host-policy-badge'}>
                              {eff ? 'Can share' : 'Cannot share'}
                            </span>
                          ) : (
                            <span className="video-host-policy-badge video-host-policy-badge--pending">Not linked</span>
                          )}
                        </div>
                        {row.canManage && row.firebaseUid ? (
                          <div className="video-host-policy-actions">
                            {eff ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={hostActionLoading}
                                onClick={() =>
                                  setHostConfirm({
                                    title: 'Restrict screen sharing?',
                                    body: `Stop ${row.displayName} from sharing their screen? If they are sharing now, they will need to stop manually or you can ask them to.`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { screenAllowed: false })
                                    },
                                  })
                                }
                              >
                                Restrict
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={hostActionLoading}
                                onClick={() =>
                                  setHostConfirm({
                                    title: 'Allow screen sharing?',
                                    body: `Let ${row.displayName} share their screen?`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { screenAllowed: true })
                                    },
                                  })
                                }
                              >
                                Allow
                              </Button>
                            )}
                          </div>
                        ) : (
                          <p className="video-host-policy-unlinked">This guest can’t be managed until their account is linked.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <div className="video-host-modal-footer">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHostPolicyModal(null)}>
                    Back
                  </Button>
                </div>
              </div>
            </div>
          )}
          {localIsHost && hostConfirm && (
            <div
              className="video-host-overlay video-host-overlay--confirm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="video-host-confirm-title"
            >
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Cancel"
                onClick={() => !hostActionLoading && setHostConfirm(null)}
              />
              <div className="video-host-modal video-host-modal--confirm">
                <h3 id="video-host-confirm-title" className="video-host-modal-title">
                  {hostConfirm.title}
                </h3>
                <p className="video-host-confirm-body">{hostConfirm.body}</p>
                <div className="video-host-confirm-actions">
                  <Button type="button" variant="ghost" size="sm" disabled={hostActionLoading} onClick={() => setHostConfirm(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={hostActionLoading}
                    onClick={async () => {
                      if (!hostConfirm?.onConfirm) return
                      setHostActionLoading(true)
                      try {
                        await hostConfirm.onConfirm()
                        setHostConfirm(null)
                      } catch (e) {
                        console.warn('Host action failed:', e)
                      } finally {
                        setHostActionLoading(false)
                      }
                    }}
                  >
                    {hostActionLoading ? '…' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {showLeaveModal && (
            <div className="video-call-leave-overlay" role="dialog" aria-modal="true" aria-labelledby="video-leave-title">
              <div className="video-call-leave-backdrop" onClick={() => !loading && setShowLeaveModal(false)} />
              <div className="video-call-leave-modal">
                <h3 id="video-leave-title" className="video-call-leave-title">Leave meeting</h3>
                <p className="video-call-leave-desc">You are the host. Choose what happens for everyone else.</p>
                <div className="video-call-leave-actions">
                  <Button type="button" variant="ghost" onClick={() => !loading && setShowLeaveModal(false)} disabled={loading}>
                    Cancel
                  </Button>
                  <Button type="button" variant="outline" onClick={leaveCallOnly} disabled={loading}>
                    {loading ? 'Leaving…' : 'Leave (others stay)'}
                  </Button>
                  <Button type="button" variant="primary" onClick={endMeetingForAll} disabled={loading}>
                    {loading ? 'Ending…' : 'End for everyone'}
                  </Button>
                </div>
                <p className="video-call-leave-hint">“End for everyone” closes the room for all participants and starts meeting notes when the AI backend is configured.</p>
              </div>
            </div>
          )}
        </div>
      )}
      {showNotepad && <Notepad />}
    </main>
  )
}

function RoomPrefsFields({ prefs, onChange, className = '' }) {
  const set = (partial) => onChange({ ...prefs, ...partial })
  const hostOn = prefs.hostVideoDefault !== false
  const partOn = prefs.participantVideoDefault !== false
  return (
    <div className={['video-room-prefs', className].filter(Boolean).join(' ')}>
      <h3 className="video-room-prefs-heading">Meeting chat</h3>
      <label className="video-room-prefs-check-row">
        <input
          type="checkbox"
          className="video-room-prefs-checkbox"
          checked={prefs.continuousMeetingChat !== false}
          onChange={(e) => set({ continuousMeetingChat: e.target.checked })}
        />
        <span className="video-room-prefs-check-label">Enable continuous meeting chat</span>
        <span
          className="video-room-prefs-info"
          title="Invitees can use in-call chat before and after the meeting when this is on."
        >
          <Info size={15} strokeWidth={2} aria-hidden />
        </span>
      </label>
      <p className="video-room-prefs-desc">
        Invitees can use the meeting chat before and after the call, not only while you are connected.
      </p>

      <h3 className="video-room-prefs-heading">Video</h3>
      <div className="video-room-prefs-toggles">
        <div className="video-room-prefs-toggle-row">
          <span className="video-room-prefs-toggle-label">Host</span>
          <button
            type="button"
            role="switch"
            aria-checked={hostOn}
            className={`video-room-prefs-switch ${hostOn ? 'video-room-prefs-switch--on' : ''}`}
            onClick={() => set({ hostVideoDefault: !hostOn })}
          >
            <span className="video-room-prefs-switch-knob" />
          </button>
          <span className="video-room-prefs-switch-caption">{hostOn ? 'On' : 'Off'}</span>
        </div>
        <div className="video-room-prefs-toggle-row">
          <span className="video-room-prefs-toggle-label">Participants</span>
          <button
            type="button"
            role="switch"
            aria-checked={partOn}
            className={`video-room-prefs-switch ${partOn ? 'video-room-prefs-switch--on' : ''}`}
            onClick={() => set({ participantVideoDefault: !partOn })}
          >
            <span className="video-room-prefs-switch-knob" />
          </button>
          <span className="video-room-prefs-switch-caption">{partOn ? 'On' : 'Off'}</span>
        </div>
      </div>

      <h3 className="video-room-prefs-heading">Audio</h3>
      <label className="video-room-prefs-radio-row">
        <input type="radio" name="notus-room-audio" checked readOnly className="video-room-prefs-radio" />
        <span>Computer audio</span>
      </label>
    </div>
  )
}

function NewMeetingSettingsModal({
  isOpen,
  onClose,
  titleValue,
  onTitleChange,
  allowRemoteScreenShare,
  onAllowRemoteScreenShareChange,
  onContinue,
  orgOptions,
  selectedOrgId,
  onOrgChange,
}) {
  if (!isOpen) return null
  return (
    <div className="video-prejoin-overlay" role="dialog" aria-modal="true" aria-labelledby="new-meeting-settings-title">
      <button type="button" className="video-prejoin-backdrop" onClick={onClose} aria-label="Close" />
      <div className="video-prejoin-modal video-new-meeting-settings-modal">
        <div className="video-prejoin-header">
          <h2 id="new-meeting-settings-title" className="video-prejoin-title">
            New meeting
          </h2>
          <p className="video-prejoin-sub">Set a title and room options. Next you will choose your camera and microphone.</p>
        </div>
        {orgOptions && orgOptions.length > 1 && onOrgChange ? (
          <label className="video-new-meeting-field">
            <span className="video-new-meeting-field-label">Organization</span>
            <select
              className="auth-input video-new-meeting-org-select"
              value={selectedOrgId || ''}
              onChange={(e) => onOrgChange(e.target.value)}
            >
              {orgOptions.map((o) => (
                <option key={o.orgId} value={o.orgId}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="video-new-meeting-field">
          <span className="video-new-meeting-field-label">Meeting title</span>
          <input
            type="text"
            className="auth-input video-new-meeting-title-input"
            value={titleValue}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Team sync"
            maxLength={120}
          />
        </label>
        <label className="video-prejoin-host-option video-new-meeting-host-option">
          <input
            type="checkbox"
            checked={allowRemoteScreenShare}
            onChange={(e) => onAllowRemoteScreenShareChange(e.target.checked)}
          />
          <span>Allow participants to share their screen</span>
        </label>
        <div className="video-prejoin-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onContinue}>
            Continue to video
          </Button>
        </div>
      </div>
    </div>
  )
}

function VideoPreJoinModal({
  isOpen,
  onClose,
  title,
  subtitle,
  previewStream,
  previewError,
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  showHostOptions,
  allowRemoteScreenShare,
  onAllowRemoteScreenShareChange,
  confirmLabel,
  loading,
  onConfirm,
}) {
  const videoRef = useRef(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = previewStream || null
    if (previewStream && camOn) el.play().catch(() => {})
    return () => {
      el.srcObject = null
    }
  }, [previewStream, camOn])

  if (!isOpen) return null

  return (
    <div className="video-prejoin-overlay" role="dialog" aria-modal="true" aria-labelledby="video-prejoin-title">
      <button type="button" className="video-prejoin-backdrop" onClick={onClose} aria-label="Close" disabled={loading} />
      <div className="video-prejoin-modal">
        <div className="video-prejoin-header">
          <h2 id="video-prejoin-title" className="video-prejoin-title">
            {title}
          </h2>
          {subtitle && <p className="video-prejoin-sub">{subtitle}</p>}
        </div>
        <div className="video-prejoin-preview-wrap">
          {previewError ? (
            <div className="video-prejoin-preview-fallback">
              <p>{previewError}</p>
              <p className="video-prejoin-preview-hint">You can still join with your choices below; the call may ask for permission again.</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              className={`video-prejoin-preview-video ${!camOn ? 'video-prejoin-preview-video--hidden' : ''}`}
              autoPlay
              playsInline
              muted
            />
          )}
          {!previewError && !camOn && (
            <div className="video-prejoin-preview-fallback video-prejoin-preview-fallback--dim">
              <p>Camera off</p>
            </div>
          )}
          <div className="video-prejoin-preview-actions">
            <button
              type="button"
              className={`video-prejoin-av-btn ${micOn ? 'video-prejoin-av-btn--on' : ''}`}
              onClick={onToggleMic}
              aria-pressed={micOn}
            >
              {micOn ? <Mic size={22} strokeWidth={2.25} /> : <MicOff size={22} strokeWidth={2.25} />}
              <span>Audio</span>
            </button>
            <button
              type="button"
              className={`video-prejoin-av-btn ${camOn ? 'video-prejoin-av-btn--on' : ''}`}
              onClick={onToggleCam}
              aria-pressed={camOn}
            >
              {camOn ? <Video size={22} strokeWidth={2.25} /> : <VideoOff size={22} strokeWidth={2.25} />}
              <span>Video</span>
            </button>
          </div>
        </div>
        {showHostOptions && (
          <label className="video-prejoin-host-option">
            <input
              type="checkbox"
              checked={allowRemoteScreenShare}
              onChange={(e) => onAllowRemoteScreenShareChange(e.target.checked)}
            />
            <span>Allow participants to share their screen</span>
          </label>
        )}
        <div className="video-prejoin-footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Joining…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function VideoParticipantLabel({ name, micOn, showHost, className }) {
  return (
    <div className={['video-player-label', className].filter(Boolean).join(' ')}>
      {showHost ? (
        <span className="video-player-label-host" title="Meeting host">
          Host
        </span>
      ) : null}
      <span className="video-player-label-text">{name}</span>
      <span
        className={`video-player-label-mic ${micOn ? 'video-player-label-mic--on' : 'video-player-label-mic--off'}`}
        aria-label={micOn ? 'Microphone on' : 'Microphone muted'}
      >
        {micOn ? <Mic size={15} strokeWidth={2.25} /> : <MicOff size={15} strokeWidth={2.25} />}
      </span>
    </div>
  )
}

function VideoParticipantAvatar({ photoUrl, nameHint, className = '' }) {
  const initial = (nameHint || '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <div className={['video-participant-avatar', className].filter(Boolean).join(' ')}>
      {photoUrl ? (
        <img src={photoUrl} alt="" className="video-participant-avatar-img" />
      ) : (
        <span className="video-participant-avatar-initials">{initial}</span>
      )}
    </div>
  )
}

/** Screen share: no avatar overlay; when “video” is off, show black (muted publish). */
function LocalScreenSharePreview({ track, videoOn, fill }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!track || !containerRef.current) return
    track.play(containerRef.current)
    return () => {
      try {
        track.stop()
      } catch {
        /* track may already be closed after stopScreenShare */
      }
    }
  }, [track])

  return (
    <div className={['video-player-stack', fill && 'video-player-stack--fill'].filter(Boolean).join(' ')}>
      {track && (
        <div
          ref={containerRef}
          className={[
            'video-track-container',
            fill && 'video-track-container--contain',
            !videoOn ? 'video-track-hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  )
}

function LocalVideoTrack({ track, camOn, photoUrl, nameHint }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!track || !containerRef.current) return
    track.play(containerRef.current)
    return () => {
      track.stop()
    }
  }, [track])

  const showAvatar = !track || !camOn

  return (
    <div className="video-player-stack">
      {track && (
        <div
          ref={containerRef}
          className={`video-track-container ${!camOn ? 'video-track-hidden' : ''}`}
          style={{ width: '100%', height: '100%' }}
        />
      )}
      {showAvatar && (
        <VideoParticipantAvatar photoUrl={photoUrl} nameHint={nameHint} className="video-participant-avatar--cover" />
      )}
    </div>
  )
}

function RemoteVideoPlayer({ user, displayName, photoUrl, isHost, mode = 'tile', stageLabel }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!user?.videoTrack || !containerRef.current) return
    user.videoTrack.play(containerRef.current)
    return () => {
      user.videoTrack?.stop()
    }
  }, [user?.videoTrack])

  const label = stageLabel || displayName || `User ${user.uid}`
  const camOn = !!(user?.hasVideo && user?.videoTrack)
  const micOn = !!(user?.hasAudio && user?.audioTrack && !user.audioTrack.muted)

  const playerClass = [
    'video-player',
    'video-player-remote',
    mode === 'stage' && 'video-player--stage',
    mode === 'filmstrip' && 'video-player--filmstrip',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={playerClass}>
      <VideoParticipantLabel
        name={label}
        micOn={micOn}
        showHost={isHost}
        className={mode === 'stage' ? 'video-player-label--on-stage' : mode === 'filmstrip' ? 'video-player-label--filmstrip' : undefined}
      />
      <div className="video-player-stack">
        {user?.videoTrack && (
          <div
            ref={containerRef}
            className={`video-track-container ${!camOn ? 'video-track-hidden' : ''}`}
            style={{ width: '100%', height: '100%' }}
          />
        )}
        {!camOn && (
          <VideoParticipantAvatar photoUrl={photoUrl} nameHint={label} className="video-participant-avatar--cover" />
        )}
      </div>
    </div>
  )
}

function VideoCallChat({ channelName, user, omitHeader }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    const q = query(
      collection(db, 'videoChannels', channelName, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    )
    return onSnapshot(
      q,
      (snap) => {
        setChatError('')
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      (err) => {
        console.error('Chat listener error:', err)
        setChatError('Could not load messages: ' + err.message)
      }
    )
  }, [channelName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await addDoc(collection(db, 'videoChannels', channelName, 'messages'), {
        senderId: user.uid,
        senderName: user.displayName || user.email || 'Anonymous',
        text,
        createdAt: serverTimestamp(),
      })
      setInput('')
    } catch (err) {
      console.error('Failed to send message:', err)
      setChatError('Send failed: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={['video-chat-panel', omitHeader && 'video-chat-panel--embedded'].filter(Boolean).join(' ')}>
      {!omitHeader && <div className="video-chat-header">In-call chat</div>}
      <div className="video-chat-messages">
        {chatError && <p className="video-chat-error">{chatError}</p>}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`video-chat-msg ${msg.senderId === user.uid ? 'video-chat-msg-own' : ''}`}
          >
            {msg.senderId !== user.uid && (
              <span className="video-chat-sender">{msg.senderName}</span>
            )}
            <span className="video-chat-bubble">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="video-chat-form" onSubmit={handleSend}>
        <input
          className="video-chat-input"
          type="text"
          placeholder="Message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button className="video-chat-send" type="submit" disabled={!input.trim() || sending}>
          Send
        </button>
      </form>
    </div>
  )
}

function ParticipantTileOverflow({ menuKey, openKey, onOpenChange, variant = 'tile', items }) {
  const open = openKey === menuKey
  const sz = variant === 'filmstrip' ? 16 : 18
  return (
    <div
      className={[
        'video-participant-menu-root',
        variant === 'filmstrip' ? 'video-tile-overflow--filmstrip' : 'video-tile-overflow--tile',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="video-tile-overflow-btn"
        aria-label="Participant actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation()
          onOpenChange(open ? null : menuKey)
        }}
      >
        <MoreVertical size={sz} strokeWidth={2.25} />
      </button>
      {open && (
        <div className="video-tile-overflow-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={[
                'video-tile-overflow-item',
                it.danger && 'video-tile-overflow-item--danger',
                it.disabled && 'video-tile-overflow-item--disabled',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return
                it.onClick?.()
                onOpenChange(null)
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

