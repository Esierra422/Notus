import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useCopyFeedback } from '../hooks/useCopyFeedback.js'
import { createPortal } from 'react-dom'
import { useOutletContext, useSearchParams, useNavigate, useParams, Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
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
  X,
  Copy,
  Check,
  Info,
  RefreshCw,
  Users,
  Clock,
  Captions,
  FileText,
  Loader,
  Search,
  Hand,
  Paperclip,
  Send,
  UserPlus,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Settings,
  Shield,
} from 'lucide-react'

import * as videoApp from '../lib/videoAppService.js'
import { getUserDoc, getProfilePictureUrl, getDisplayName } from '../lib/userService.js'
import { getAiRestHttpBase } from '../lib/apiConfig.js'
import { generateMeetingSummary, getPastMeetingLobbyPreview } from '../lib/meetingSummaryService.js'
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
  MEETING_CREATED_VIA,
  updateMeeting,
} from '../lib/meetingService.js'
import {
  getActiveMemberships,
  getOrg,
  getMembership,
  MEMBERSHIP_STATES,
  getOrgMembers,
  membershipHasCapability,
} from '../lib/orgService.js'
import { getOrgTeams, getTeamMembership, getTeamMembers, TEAM_STATES } from '../lib/teamService.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import {
  subscribeMeetingChatMessages,
  sendMeetingChatMessage,
  toggleMeetingChatReaction,
  voteMeetingPoll,
  endMeetingPoll,
  MAX_FILE_BYTES,
} from '../lib/meetingRoomChatService.js'
import { MessageContextMenu } from '../components/chat/MessageContextMenu'
import { db } from '../lib/firebase.js'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  arrayUnion,
  deleteField,
  where,
} from 'firebase/firestore'

const Notepad = lazy(() => import('../pages/Notepad').then((m) => ({ default: m.Notepad })))
const CreateEventModal = lazy(() =>
  import('../components/calendar/CreateEventModal.jsx').then((m) => ({ default: m.CreateEventModal }))
)

function toFriendlyError(err) {
  const msg = err?.message || String(err)
  const prodHint =
    ' On the live site, deploy the backend to Render (free) and set VITE_API_URL. See README: Production video (free).'
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

/** Firestore meeting-chat listeners use composite indexes; avoid dumping long console URLs in the UI. */
function formatMeetingChatFirestoreError(err) {
  const msg = err?.message || String(err)
  if (/currently building|cannot be used yet/i.test(msg)) {
    return 'Meeting chat indexes are still building in Firebase (often 5–20 minutes). In Firebase Console open Firestore → Indexes, wait until every row for collection messages is Enabled, then refresh this page.'
  }
  if (/requires an index/i.test(msg)) {
    return 'Meeting chat needs Firestore composite indexes. From the repo root run: firebase deploy --only firestore:indexes, wait until indexes show Enabled, then refresh.'
  }
  const stripped = msg.replace(/https:\/\/console\.firebase\.google\.com\S*/g, '').replace(/\s+/g, ' ').trim()
  return stripped || 'Could not load meeting chat.'
}

/** Detect display-capture tracks (Chrome exposes displaySurface). Avoid resolution heuristics  -  720p cameras match “wide” HD and would stay “pinned share” forever. */
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
  } catch {
    /* ignore */
  }
  return false
}

/** Firestore roomState.raisedHands map key for a participant */
function meetingHandKey(firebaseUid, agoraUid) {
  if (firebaseUid) return `fb_${firebaseUid}`
  if (agoraUid != null && Number.isFinite(Number(agoraUid))) return `ag_${Number(agoraUid)}`
  return null
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

/** Merge consecutive transcript segments from the same speaker (streaming chunks). */
const TRANSCRIPT_MERGE_GAP_MS = 42000

function appendTranscriptLines(prev, { text, speaker, timeLabel, ts, segmentMs }) {
  const last = prev[prev.length - 1]
  const lastMs = last?._segmentMs
  const gapOk =
    last &&
    last.speaker === speaker &&
    typeof lastMs === 'number' &&
    segmentMs - lastMs <= TRANSCRIPT_MERGE_GAP_MS
  if (gapOk) {
    return [
      ...prev.slice(0, -1),
      {
        ...last,
        text: `${last.text} ${text}`.trim(),
        _segmentMs: segmentMs,
      },
    ]
  }
  const shortFragment =
    last &&
    last.speaker === speaker &&
    typeof text === 'string' &&
    text.trim().length > 0 &&
    text.trim().length <= 18 &&
    typeof lastMs === 'number' &&
    segmentMs - lastMs <= 180000
  if (shortFragment) {
    return [
      ...prev.slice(0, -1),
      {
        ...last,
        text: `${last.text} ${text.trim()}`.trim(),
        _segmentMs: segmentMs,
      },
    ]
  }
  return [
    ...prev,
    {
      id: `tr-${segmentMs}-${prev.length}`,
      text,
      speaker,
      timeLabel,
      ts,
      _segmentMs: segmentMs,
    },
  ]
}

/** Resolve Firestore invitedUserIds for instant meetings (bell notifications + invite-only list). */
async function resolveInstantMeetingRecipientIds({
  orgId,
  userId,
  visibility,
  teamId,
  orgNotify,
  teamNotify,
  pickIds,
}) {
  if (!orgId || !userId) return []
  if (visibility === 'invited') {
    return [...new Set((pickIds || []).filter(Boolean))]
  }
  if (visibility === 'org') {
    if (orgNotify === 'none') return []
    const raw = await getOrgMembers(orgId)
    return [
      ...new Set(
        raw
          .filter((m) => {
            const uid = m.userId || m.uid
            return m.state === MEMBERSHIP_STATES.active && uid && uid !== userId
          })
          .map((m) => m.userId || m.uid)
      ),
    ]
  }
  if (visibility === 'team' && teamId) {
    if (teamNotify === 'none') return []
    if (teamNotify === 'pick') return [...new Set((pickIds || []).filter(Boolean))]
    const raw = await getTeamMembers(orgId, teamId)
    return [
      ...new Set(
        raw
          .filter((m) => {
            const uid = m.userId || m.uid
            return m.state === TEAM_STATES.active && uid && uid !== userId
          })
          .map((m) => m.userId || m.uid)
      ),
    ]
  }
  return []
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
        · Running (start time unavailable)
      </span>
    )
  }
  // eslint-disable-next-line react-hooks/purity -- wall-clock elapsed label (interval tick forces re-render)
  const runningLabel = formatRunningDuration(Date.now() - ms) || '0s'
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
  const runningForLabel = ms ? formatRunningDuration(Date.now() - ms) : 'Not available'
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
  const topBarElapsed = ms ? formatRunningDuration(Date.now() - ms) : '0s'
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

const SPEECH_RMS_THRESHOLD = 0.014
const TARGET_SAMPLE_RATE = 16000

/** First token for captions like reference: "-[Abel] …" */
function shortCaptionSpeaker(name) {
  if (!name || typeof name !== 'string') return 'Speaker'
  const s = name.trim()
  if (!s) return 'Speaker'
  if (s.includes('@')) {
    const local = s.split('@')[0].trim()
    return local || 'Speaker'
  }
  const parts = s.split(/\s+/).filter(Boolean)
  return parts[0] || 'Speaker'
}

/** Drop ultra-short local lines that Whisper often invents on silence (mic noise / room tone). */
function looksLikeLocalSilenceHallucination(text, isLocal) {
  if (!isLocal || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 2 || t.length > 96) return false
  const lower = t.toLowerCase()
  const junk =
    /^(thanks?|thank you|thank you for watching|bye|goodbye|hi\.?|hello\.?|amen\.?|okay\.?|ok\.?)([\s,.!]*)$/i.test(
      t
    )
  const day = /^have a (great |good |nice )?day[\s,.!]*$/i.test(t)
  const combo =
    /^(thank you|thanks).{0,40}(bye|goodbye|day|watching)/i.test(t) && t.length < 90
  return junk || day || combo
}

const DEFAULT_ROOM_PREFS = {
  continuousMeetingChat: true,
  chatFileUploadsAllowed: true,
  hostVideoDefault: true,
  participantVideoDefault: true,
  audioComputerOnly: true,
}

/** Lobby list refresh (without full Firestore sweeps each tick). */
const VIDEO_LOBBY_ONGOING_POLL_MS = 8000
/** Heavy cleanup (vacant rooms, stale instant meetings, etc.)  -  not every poll. */
const VIDEO_LOBBY_SWEEP_INTERVAL_MS = 120000

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
    chatFileUploadsAllowed: o.chatFileUploadsAllowed !== false,
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
  const { user, setNavExtra, activeOrgId, setVideoCallSuppressAppHeader } = useOutletContext() || {}
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
  const participantMetaRef = useRef({})
  const userDisplayForTranscriptRef = useRef('You')
  const [localPhotoUrl, setLocalPhotoUrl] = useState(null)
  /** null = closed; which tab is active in the right-hand panel */
  const [sidePanelTab, setSidePanelTab] = useState(null)
  const [meetingQuestion, setMeetingQuestion] = useState('')
  const [meetingHistory, setMeetingHistory] = useState([])
  const [liveTranscriptLines, setLiveTranscriptLines] = useState([])
  /** Latest caption segment for overlay */
  const [liveSubtitleMeta, setLiveSubtitleMeta] = useState(null)
  const [showLiveSubtitles, setShowLiveSubtitles] = useState(true)
  const liveTranscriptEndRef = useRef(null)
  const [askLoading, setAskLoading] = useState(false)
  const [showNotepad, setShowNotepad] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [preJoinOpen, setPreJoinOpen] = useState(false)
  const [preJoinMode, setPreJoinMode] = useState('instant')
  const [preJoinMicOn, setPreJoinMicOn] = useState(true)
  const [preJoinCamOn, setPreJoinCamOn] = useState(true)
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
  const chatCallEndPolicy = (searchParams.get('endPolicy') || '').trim()
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [joinMeetingIdInput, setJoinMeetingIdInput] = useState('')
  const [joinByIdLoading, setJoinByIdLoading] = useState(false)
  const [ongoingMeetings, setOngoingMeetings] = useState([])
  const [ongoingMeetingsLoading, setOngoingMeetingsLoading] = useState(false)
  const [ongoingMeetingsError, setOngoingMeetingsError] = useState('')
  const ongoingHostLabelCacheRef = useRef(new Map())
  const upcomingFirstLoadRef = useRef(true)
  const [roomAllowRemoteShare, setRoomAllowRemoteShare] = useState(true)
  const [roomMediaPolicy, setRoomMediaPolicy] = useState({})
  const [hostMenuOpen, setHostMenuOpen] = useState(false)
  const [guestMenuOpen, setGuestMenuOpen] = useState(false)
  const [meetingInfoOpen, setMeetingInfoOpen] = useState(false)
  const {
    copied: hostMeetingIdCopied,
    copy: copyMeetingIdWithFeedback,
    resetCopied: resetHostMeetingIdCopyFeedback,
  } = useCopyFeedback(1600)
  /** Firestore roomState.sessionStartedAt  -  live duration in Meeting info */
  const [roomSessionStartedAt, setRoomSessionStartedAt] = useState(null)
  /** Organizer’s current Agora uid (written when host joins)  -  host badge when firebaseUid missing on participant doc */
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
  const [newMeetingTitleDraft, setNewMeetingTitleDraft] = useState('Quick meeting')
  const [newMeetingBioDraft, setNewMeetingBioDraft] = useState('')
  const [newMeetingVisibility, setNewMeetingVisibility] = useState('org')
  const [newMeetingTeamId, setNewMeetingTeamId] = useState('')
  const [newMeetingInviteeIds, setNewMeetingInviteeIds] = useState([])
  const [newMeetingMembers, setNewMeetingMembers] = useState([])
  const [newMeetingTeamsList, setNewMeetingTeamsList] = useState([])
  const [newMeetingMembersLoading, setNewMeetingMembersLoading] = useState(false)
  const [newMeetingMembersError, setNewMeetingMembersError] = useState('')
  /** Title used for instant meeting create + pre-join header after step 1. */
  const [preJoinInstantMeetingTitle, setPreJoinInstantMeetingTitle] = useState('Quick meeting')
  /** Orgs available for video (global page) or single org when route is /app/org/:orgId/video */
  const [videoUserOrgs, setVideoUserOrgs] = useState([])
  const [videoOrgsLoaded, setVideoOrgsLoaded] = useState(false)
  const [instantMeetingOrgId, setInstantMeetingOrgId] = useState('')
  /** Membership for the org used for instant meeting (route or selected org). */
  const [videoLobbyMembership, setVideoLobbyMembership] = useState(null)
  const [videoLobbyMemLoaded, setVideoLobbyMemLoaded] = useState(false)
  /** Membership for schedule modal org (may differ on global /video when org picker changes). */
  const [scheduleModalMembership, setScheduleModalMembership] = useState(null)
  const [videoRouteForbidden, setVideoRouteForbidden] = useState(false)
  const [roomPrefsDraft, setRoomPrefsDraft] = useState(() => ({ ...DEFAULT_ROOM_PREFS }))
  const [roomPrefsLive, setRoomPrefsLive] = useState(() => ({ ...DEFAULT_ROOM_PREFS }))
  const [roomPinnedAgoraUid, setRoomPinnedAgoraUid] = useState(null)
  const [localViewerPinAgoraUid, setLocalViewerPinAgoraUid] = useState(null)
  const [localAgoraUid, setLocalAgoraUid] = useState(null)
  /** roomState.raisedHands  -  map of handKey -> Timestamp */
  const [raisedHandsMap, setRaisedHandsMap] = useState({})
  const [hostHandsQueueOpen, setHostHandsQueueOpen] = useState(false)
  const [meetingPollModalOpen, setMeetingPollModalOpen] = useState(false)
  const [meetingPollQuestion, setMeetingPollQuestion] = useState('')
  const [meetingPollOptions, setMeetingPollOptions] = useState(['', ''])
  const [chatUnreadDot, setChatUnreadDot] = useState(false)
  const [hostHandsDot, setHostHandsDot] = useState(false)
  const handsSeenMaxOthersRef = useRef(0)
  const hostHandsBaselineDoneRef = useRef(false)
  const chatLastSeenMsRef = useRef(0)
  const chatMessagesDigestRef = useRef(0)
  const [meetingChatMessages, setMeetingChatMessages] = useState([])
  const [meetingChatLoadError, setMeetingChatLoadError] = useState('')
  const [roomKickMeta, setRoomKickMeta] = useState(null)
  const joinedAtMsRef = useRef(0)
  const [hostPrefsModalOpen, setHostPrefsModalOpen] = useState(false)
  const [hostPrefsDraft, setHostPrefsDraft] = useState(() => ({ ...DEFAULT_ROOM_PREFS }))
  const [hostPrefsSaving, setHostPrefsSaving] = useState(false)
  const [hostPrefsSaveError, setHostPrefsSaveError] = useState('')
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [upcomingMeetingsLoading, setUpcomingMeetingsLoading] = useState(false)
  const [upcomingReloadKey, setUpcomingReloadKey] = useState(0)
  const [pastLobbyRows, setPastLobbyRows] = useState([])
  const [pastLobbyLoading, setPastLobbyLoading] = useState(false)
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

  const scheduleOrgForModal = videoRouteOrgId || instantMeetingOrgId

  const localVideoTrackRef = useRef(null)
  const transcriptSessionIdRef = useRef(null)
  const localUidRef = useRef(0)
  const transcriptionWsRef = useRef(null)
  const audioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const pcmBufferRef = useRef([])
  const transcriptionChunksSentRef = useRef(0)
  const remoteEndHandledRef = useRef(false)
  /** Merge on-screen captions into one line per speaker burst (same window as transcript). */
  const subtitleUtteranceRef = useRef({ speaker: null, segmentMs: 0, accumulated: '' })
  const executeJoinRef = useRef(async () => false)

  /** Calendar-scheduled video: early guests wait until host admits or start time. */
  const [waitingRoomPayload, setWaitingRoomPayload] = useState(null)
  const [waitingLobbyCount, setWaitingLobbyCount] = useState(0)
  const [waitingRoomPreviewStream, setWaitingRoomPreviewStream] = useState(null)
  const [waitingRoomPreviewError, setWaitingRoomPreviewError] = useState('')
  const [waitingRoomMenuOpen, setWaitingRoomMenuOpen] = useState(false)
  const waitingRoomMenuRef = useRef(null)
  const waitingRoomAvRef = useRef({ mic: true, cam: true })
  const [waitingRoomUiMic, setWaitingRoomUiMic] = useState(true)
  const [waitingRoomUiCam, setWaitingRoomUiCam] = useState(true)
  const [participantsRosterOpen, setParticipantsRosterOpen] = useState(false)
  const [participantsRosterSearch, setParticipantsRosterSearch] = useState('')
  const [rosterRowMenuKey, setRosterRowMenuKey] = useState(null)
  const [invitePeopleModalOpen, setInvitePeopleModalOpen] = useState(false)
  const [newMeetingOrgNotify, setNewMeetingOrgNotify] = useState('everyone')
  const [newMeetingTeamNotify, setNewMeetingTeamNotify] = useState('everyone')
  const [newMeetingTeamPickMembers, setNewMeetingTeamPickMembers] = useState([])
  const [newMeetingTeamPickLoading, setNewMeetingTeamPickLoading] = useState(false)

  const videoBlockingOverlaysOpen = useMemo(
    () =>
      generatingSummary ||
      Boolean(waitingRoomPayload && !joined) ||
      showLeaveModal ||
      meetingInfoOpen ||
      hostPermissionsOpen ||
      hostHandsQueueOpen ||
      meetingPollModalOpen ||
      hostPrefsModalOpen ||
      hostPolicyModal != null ||
      hostConfirm != null,
    [
      generatingSummary,
      waitingRoomPayload,
      joined,
      showLeaveModal,
      meetingInfoOpen,
      hostPermissionsOpen,
      hostHandsQueueOpen,
      meetingPollModalOpen,
      hostPrefsModalOpen,
      hostPolicyModal,
      hostConfirm,
    ]
  )

  useScrollLock(videoBlockingOverlaysOpen)

  /** Live transcription WebSocket only when AI backend URL is set (Express has no /ws/transcription). */
  const transcriptionWsBase = (import.meta.env.VITE_AI_WS_URL || '').replace(/\/$/, '')

  /** HTTP(S) base for FastAPI /api/ask and /api/generate-summary (from VITE_AI_* only, not Express). */
  const aiRestBase = useMemo(() => getAiRestHttpBase(), [])

  useEffect(() => {
    participantMetaRef.current = participantMeta
  }, [participantMeta])

  useEffect(() => {
    userDisplayForTranscriptRef.current =
      (user?.displayName || user?.email || 'You').trim() || 'You'
  }, [user?.displayName, user?.email])

  useEffect(() => {
    if (!joined) {
      setLiveTranscriptLines([])
      setLiveSubtitleMeta(null)
      subtitleUtteranceRef.current = { speaker: null, segmentMs: 0, accumulated: '' }
    }
  }, [joined])

  useEffect(() => {
    if (sidePanelTab !== 'transcript') return
    liveTranscriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveTranscriptLines, sidePanelTab])

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
    if (!user?.uid) {
      setVideoLobbyMembership(null)
      setVideoLobbyMemLoaded(false)
      return
    }
    const oid = videoRouteOrgId || instantMeetingOrgId
    if (!oid) {
      setVideoLobbyMembership(null)
      setVideoLobbyMemLoaded(false)
      return
    }
    let cancelled = false
    setVideoLobbyMemLoaded(false)
    getMembership(oid, user.uid)
      .then((m) => {
        if (!cancelled) setVideoLobbyMembership(m)
      })
      .catch(() => {
        if (!cancelled) setVideoLobbyMembership(null)
      })
      .finally(() => {
        if (!cancelled) setVideoLobbyMemLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid, videoRouteOrgId, instantMeetingOrgId])

  useEffect(() => {
    if (!user?.uid || !scheduleOrgForModal) {
      setScheduleModalMembership(null)
      return
    }
    let cancelled = false
    getMembership(scheduleOrgForModal, user.uid).then((m) => {
      if (!cancelled) setScheduleModalMembership(m)
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid, scheduleOrgForModal])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  useEffect(() => {
    if (!setVideoCallSuppressAppHeader) return
    setVideoCallSuppressAppHeader(Boolean(joined && !generatingSummary))
    return () => setVideoCallSuppressAppHeader(false)
  }, [joined, generatingSummary, setVideoCallSuppressAppHeader])

  useEffect(() => {
    if (!joined) return undefined
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [joined])

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
    ongoingHostLabelCacheRef.current = new Map()

    const runLobbySweeps = async () => {
      const sweepResults = await Promise.allSettled([
        sweepVacantVideoRooms(user.uid),
        closeStaleEmptyVideoRooms(user.uid),
        endInstantRoomsWithoutSessionClock(user.uid),
        endAgedInstantVideoRooms(user.uid),
        purgeParticipantsForEndedRooms(user.uid),
        dedupeOpenVideoRoomParticipants(user.uid),
      ])
      for (const r of sweepResults) {
        if (r.status === 'rejected') console.warn('[video lobby sweep]', r.reason)
      }
    }

    const loadOngoing = async () => {
      const isFirstPaint = firstPoll
      if (firstPoll) {
        setOngoingMeetingsLoading(true)
        void runLobbySweeps()
      }
      setOngoingMeetingsError('')
      const cache = ongoingHostLabelCacheRef.current
      try {
        const list = videoRouteOrgId
          ? await getOngoingVideoMeetingsInOrg(user.uid, videoRouteOrgId)
          : await getOngoingVideoMeetingsForUser(user.uid)
        if (cancelled) return

        if (isFirstPaint) {
          const quickEnriched = list.map((m) => ({
            ...m,
            _hostLabel: !m.createdBy ? 'Organizer' : m.createdBy === user.uid ? 'You' : 'Host',
          }))
          setOngoingMeetings(quickEnriched)
          setOngoingMeetingsLoading(false)
        }

        const enrichOne = async (m) => {
          if (!m.createdBy) return { ...m, _hostLabel: 'Organizer' }
          if (m.createdBy === user.uid) return { ...m, _hostLabel: 'You' }
          const c = m.createdBy
          if (cache.has(c)) return { ...m, _hostLabel: cache.get(c) }
          try {
            const uDoc = await getUserDoc(c)
            const label = uDoc?.displayName || uDoc?.email || 'Organizer'
            cache.set(c, label)
            return { ...m, _hostLabel: label }
          } catch {
            cache.set(c, 'Organizer')
            return { ...m, _hostLabel: 'Organizer' }
          }
        }

        const enriched = await Promise.all(list.map(enrichOne))
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
    const sweepT = setInterval(() => {
      if (!cancelled) runLobbySweeps()
    }, VIDEO_LOBBY_SWEEP_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
      clearInterval(sweepT)
    }
  }, [user?.uid, joined, videoOrgsLoaded, videoRouteForbidden, videoUserOrgs.length, videoRouteOrgId])

  useEffect(() => {
    if (!user?.uid || joined || !videoOrgsLoaded || videoRouteForbidden || videoUserOrgs.length === 0) return
    let cancelled = false
    upcomingFirstLoadRef.current = true

    const loadUpcoming = async () => {
      if (upcomingFirstLoadRef.current) setUpcomingMeetingsLoading(true)
      try {
        const list = videoRouteOrgId
          ? await getUpcomingMeetingsInHorizonForUserInOrg(user.uid, videoRouteOrgId, upcomingHorizonDays)
          : await getUpcomingMeetingsInHorizonForUser(user.uid, upcomingHorizonDays)
        if (!cancelled) {
          setUpcomingMeetings(list)
          upcomingFirstLoadRef.current = false
        }
      } catch {
        if (!cancelled) setUpcomingMeetings([])
        upcomingFirstLoadRef.current = false
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
    upcomingReloadKey,
  ])

  useEffect(() => {
    if (!user?.uid || joined || !videoOrgsLoaded || videoRouteForbidden || videoUserOrgs.length === 0) return
    let cancelled = false
    const loadPast = async () => {
      setPastLobbyLoading(true)
      try {
        const rows = await getPastMeetingLobbyPreview(user.uid, {
          routeOrgId: videoRouteOrgId || null,
          limit: 4,
        })
        if (!cancelled) setPastLobbyRows(rows)
      } catch (e) {
        console.warn('[VideoCallPage] Past lobby preview:', e)
        if (!cancelled) setPastLobbyRows([])
      } finally {
        if (!cancelled) setPastLobbyLoading(false)
      }
    }
    loadPast()
    const t = setInterval(loadPast, 120000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [user?.uid, joined, videoOrgsLoaded, videoRouteForbidden, videoUserOrgs.length, videoRouteOrgId])

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

  const canStartInstantMeeting = useMemo(
    () =>
      videoLobbyMemLoaded &&
      videoLobbyMembership &&
      videoLobbyMembership.state === MEMBERSHIP_STATES.active &&
      (membershipHasCapability(videoLobbyMembership, 'scheduleOrgMeetings') ||
        membershipHasCapability(videoLobbyMembership, 'scheduleTeamMeetings')),
    [videoLobbyMemLoaded, videoLobbyMembership]
  )

  const canScheduleFromVideoLobby = useMemo(
    () =>
      scheduleModalMembership &&
      scheduleModalMembership.state === MEMBERSHIP_STATES.active &&
      (membershipHasCapability(scheduleModalMembership, 'scheduleOrgMeetings') ||
        membershipHasCapability(scheduleModalMembership, 'scheduleTeamMeetings')),
    [scheduleModalMembership]
  )

  const openPreJoinInstant = () => {
    if (!user?.uid || videoUserOrgs.length === 0) return
    if (videoLobbyMemLoaded && !canStartInstantMeeting) {
      setError('You do not have permission to start meetings. Ask an organization admin to enable scheduling for your role.')
      return
    }
    setError('')
    setRoomPrefsDraft({ ...DEFAULT_ROOM_PREFS })
    setNewMeetingTitleDraft('Quick meeting')
    setNewMeetingBioDraft('')
    setNewMeetingVisibility('org')
    setNewMeetingTeamId('')
    setNewMeetingInviteeIds([])
    setNewMeetingOrgNotify('everyone')
    setNewMeetingTeamNotify('everyone')
    setNewMeetingTeamPickMembers([])
    setNewMeetingMembersError('')
    setNewMeetingSettingsOpen(true)
  }

  useEffect(() => {
    if (!newMeetingSettingsOpen || !user?.uid) return
    if (!videoRouteOrgId && !videoOrgsLoaded) return
    const oid = videoRouteOrgId || instantMeetingOrgId
    if (!oid) {
      setNewMeetingMembers([])
      setNewMeetingTeamsList([])
      setNewMeetingMembersLoading(false)
      setNewMeetingMembersError('')
      return
    }
    let cancelled = false
    setNewMeetingMembersLoading(true)
    setNewMeetingMembersError('')
    ;(async () => {
      try {
        const [raw, teamsData] = await Promise.all([getOrgMembers(oid), getOrgTeams(oid)])
        const myTeams = []
        for (const t of teamsData) {
          try {
            const tm = await getTeamMembership(oid, t.id, user.uid)
            if (tm?.state === TEAM_STATES.active) myTeams.push(t)
          } catch {
            /* skip */
          }
        }
        const active = raw.filter((m) => {
          const uid = m.userId || m.uid
          return m.state === MEMBERSHIP_STATES.active && uid && uid !== user.uid
        })
        const profiles = {}
        await Promise.all(
          active.map(async (m) => {
            const uid = m.userId || m.uid
            try {
              profiles[uid] = await getUserDoc(uid)
            } catch {
              profiles[uid] = null
            }
          })
        )
        if (!cancelled) {
          setNewMeetingTeamsList(myTeams)
          setNewMeetingMembers(active.map((m) => ({ userId: m.userId || m.uid, profile: profiles[m.userId || m.uid] })))
        }
      } catch (e) {
        if (!cancelled) {
          setNewMeetingTeamsList([])
          setNewMeetingMembers([])
          setNewMeetingMembersError(toFriendlyError(e) || 'Could not load organization members.')
        }
      } finally {
        if (!cancelled) setNewMeetingMembersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [newMeetingSettingsOpen, videoRouteOrgId, instantMeetingOrgId, user?.uid, videoOrgsLoaded])

  useEffect(() => {
    if (!newMeetingSettingsOpen || newMeetingVisibility !== 'team' || newMeetingTeamNotify !== 'pick') {
      setNewMeetingTeamPickMembers([])
      return
    }
    const oid = videoRouteOrgId || instantMeetingOrgId
    const tid = newMeetingTeamId
    if (!oid || !tid || !user?.uid) return
    let cancelled = false
    setNewMeetingTeamPickLoading(true)
    ;(async () => {
      try {
        const raw = await getTeamMembers(oid, tid)
        const active = raw.filter((m) => {
          const uid = m.userId || m.uid
          return m.state === TEAM_STATES.active && uid && uid !== user.uid
        })
        const profiles = {}
        await Promise.all(
          active.map(async (m) => {
            const uid = m.userId || m.uid
            try {
              profiles[uid] = await getUserDoc(uid)
            } catch {
              profiles[uid] = null
            }
          })
        )
        if (!cancelled) {
          setNewMeetingTeamPickMembers(active.map((m) => ({ userId: m.userId || m.uid, profile: profiles[m.userId || m.uid] })))
        }
      } catch {
        if (!cancelled) setNewMeetingTeamPickMembers([])
      } finally {
        if (!cancelled) setNewMeetingTeamPickLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    newMeetingSettingsOpen,
    newMeetingVisibility,
    newMeetingTeamNotify,
    newMeetingTeamId,
    videoRouteOrgId,
    instantMeetingOrgId,
    user?.uid,
  ])

  const continueNewMeetingToPreJoin = async () => {
    if (!user?.uid) return
    const orgPick = videoRouteOrgId || instantMeetingOrgId
    if (!orgPick) {
      setError('Select an organization for this meeting.')
      return
    }
    if (newMeetingVisibility === 'team' && !newMeetingTeamId) {
      setError('Select a team for a team-only meeting.')
      return
    }
    if (newMeetingVisibility === 'invited' && newMeetingInviteeIds.length === 0) {
      setError('Pick at least one person to invite, or choose organization or team visibility.')
      return
    }
    if (
      newMeetingVisibility === 'team' &&
      newMeetingTeamNotify === 'pick' &&
      newMeetingInviteeIds.length === 0
    ) {
      setError('Select people to notify, choose “Everyone on team”, or turn off notifications.')
      return
    }
    setError('')
    try {
      const mem = await getMembership(orgPick, user.uid)
      if (!mem || mem.state !== MEMBERSHIP_STATES.active) {
        setError('You are not an active member of this organization.')
        return
      }
      if (
        newMeetingVisibility === 'team' &&
        !membershipHasCapability(mem, 'scheduleTeamMeetings')
      ) {
        setError(
          'You do not have permission to start team-visible meetings. Ask an admin to enable team scheduling for your role.'
        )
        return
      }
      if (
        newMeetingVisibility !== 'team' &&
        !membershipHasCapability(mem, 'scheduleOrgMeetings')
      ) {
        setError(
          'You do not have permission to start this type of meeting. Ask an admin to enable organization scheduling for your role.'
        )
        return
      }
      if (newMeetingVisibility === 'org' && !membershipHasCapability(mem, 'orgCalendar')) {
        setError(
          'You cannot start an organization-wide meeting without org calendar access. Choose team-only or invite specific people.'
        )
        return
      }
      if (newMeetingVisibility === 'team' && !membershipHasCapability(mem, 'teamCalendar')) {
        setError('You cannot start a team-visible meeting without team calendar access.')
        return
      }
    } catch {
      setError('Could not verify your permissions. Try again.')
      return
    }
    const t = newMeetingTitleDraft.trim() || 'Quick meeting'
    setPreJoinInstantMeetingTitle(t)
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
        setError('Load a meeting first (paste a meeting ID), or use New Meeting.')
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

  useEffect(() => {
    if (!preJoinOpen) return
    let disposed = false
    let stream = null
    if (!preJoinMicOn && !preJoinCamOn) {
      setPreJoinPreviewStream(null)
      setPreJoinPreviewError('')
      return () => {
        disposed = true
        setPreJoinPreviewStream(null)
      }
    }
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
    instantMeetingExtra,
    roomPrefsOverride,
    skipWaitingRoom = false,
  } = {}) => {
    remoteEndHandledRef.current = false
    setError('')
    setLiveTranscriptLines([])
    setLiveSubtitleMeta(null)
    subtitleUtteranceRef.current = { speaker: null, segmentMs: 0, accumulated: '' }
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
          title: (instantTitle && String(instantTitle).trim()) || 'Quick meeting',
          description: instantMeetingExtra?.description,
          visibility: instantMeetingExtra?.visibility || 'org',
          scopeTeamId: instantMeetingExtra?.scopeTeamId || null,
          invitedUserIds: instantMeetingExtra?.invitedUserIds || [],
          inviteOnly: instantMeetingExtra?.inviteOnly,
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
              'This meeting has ended. Only the organizer can reopen it. Ask them to join first, or start a new meeting.'
            )
            setLoading(false)
            return false
          }
        }
      } catch (e) {
        console.warn('Room state check failed:', e)
      }

      const organizerUidForWait = meeting.createdBy || preJoinRoomState.hostUid
      const startMsWait = meeting.startAt?.toMillis?.() ?? 0
      const isScheduledCalendarVideo =
        !instantCreate &&
        meeting.createdVia === MEETING_CREATED_VIA.calendar &&
        meeting.isVideoMeeting !== false &&
        startMsWait > 0
      const releasedMs = firestoreTimeToMs(preJoinRoomState.waitingRoomReleasedAt)
      const admissionOpen = releasedMs > 0 || Date.now() >= startMsWait
      const isEarlyNonHost =
        !skipWaitingRoom &&
        isScheduledCalendarVideo &&
        !admissionOpen &&
        organizerUidForWait &&
        user.uid !== organizerUidForWait

      if (isEarlyNonHost) {
        setWaitingRoomPayload({
          meeting,
          orgForMeeting,
          room,
          joinOptions: {
            micOn,
            videoOn,
            allowRemoteScreenShare,
            roomPrefsOverride,
          },
        })
        setLoading(false)
        return 'waiting'
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
        onScreenShareEnded: () => {
          setScreenSharing(false)
          setLocalScreenShareTrack(null)
          setLocalCameraTrack(videoApp.getLocalVideoTrack())
          setCamEnabled(!videoApp.getMediaState().videoMuted)
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
        const partRef = doc(db, 'videoChannels', room, 'participants', String(uid))
        await setDoc(partRef, {
          displayName: user?.displayName || user?.email || 'Anonymous',
          photoUrl,
          firebaseUid: user.uid,
          joinedAt: serverTimestamp(),
        })
        const partCol = collection(db, 'videoChannels', room, 'participants')
        const staleSnap = await getDocs(query(partCol, where('firebaseUid', '==', user.uid)))
        await Promise.all(
          staleSnap.docs
            .filter((d) => d.id !== String(uid))
            .map((d) => deleteDoc(d.ref).catch(() => {}))
        )
      } catch (e) {
        console.warn('Could not register participant name:', e)
      }

      // Transcription capture (only if VITE_AI_WS_URL points at FastAPI /ws/transcription)
      try {
        if (!transcriptionWsBase) {
          // Skip: avoids failed WS to Express (3001) and console spam
        } else {
        /** Shorter windows = lower latency to first caption (more round-trips; backend still dominates delay). */
        const CHUNK_DURATION_SEC = 1.25
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
        ws.onmessage = (event) => {
          if (typeof event.data !== 'string') return
          try {
            const msg = JSON.parse(event.data)
            if (msg?.type === 'transcript' && typeof msg.text === 'string' && msg.text.trim()) {
              const t = msg.text.trim()
              const agoraUid = msg.uid != null ? Number(msg.uid) : NaN
              const meta = Number.isFinite(agoraUid)
                ? participantMetaRef.current[String(agoraUid)]
                : null
              const isSelf = Number.isFinite(agoraUid) && localUidRef.current === agoraUid
              if (looksLikeLocalSilenceHallucination(t, isSelf)) {
                return
              }
              const speaker = isSelf
                ? userDisplayForTranscriptRef.current
                : meta?.displayName?.trim() ||
                  (Number.isFinite(agoraUid) ? `User ${agoraUid}` : 'Speaker')
              let timeLabel = ''
              try {
                timeLabel = msg.ts
                  ? new Date(msg.ts).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : new Date().toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
              } catch {
                timeLabel = ''
              }
              const segmentMs = msg.ts ? new Date(msg.ts).getTime() : Date.now()
              const tsIso = msg.ts || new Date().toISOString()
              setLiveTranscriptLines((prev) =>
                appendTranscriptLines(prev, { text: t, speaker, timeLabel, ts: tsIso, segmentMs })
              )
              const u = subtitleUtteranceRef.current
              const mergeCaption =
                u.speaker === speaker &&
                typeof u.segmentMs === 'number' &&
                segmentMs - u.segmentMs <= TRANSCRIPT_MERGE_GAP_MS
              if (mergeCaption) {
                u.accumulated = `${u.accumulated} ${t}`.trim()
                u.segmentMs = segmentMs
              } else {
                u.speaker = speaker
                u.segmentMs = segmentMs
                u.accumulated = t
              }
              setLiveSubtitleMeta({ text: u.accumulated, speaker, timeLabel })
            }
          } catch {
            /* non-JSON or unexpected shape */
          }
        }
        ws.onopen = () => {
          ws.send(
            JSON.stringify({ type: 'meta', channel: room, uid, sessionId: transcriptSessionIdRef.current })
          )
        }
        if (audioTrack) {
        /* Mic off or unavailable: skip local capture; WS can still receive remote transcripts. */
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
            const chunkRms = rms(chunk)
            const aboveThreshold = chunkRms >= SPEECH_RMS_THRESHOLD
            if (ws.readyState === WebSocket.OPEN && aboveThreshold) {
              const rawPcm = downsampleAndToInt16(chunk, captureRate, TARGET_SAMPLE_RATE)
              ws.send(rawPcm)
              transcriptionChunksSentRef.current += 1
            }
          }
        }

        source.connect(workletNode)
        workletNode.connect(ctx.destination)
        }
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
        meetingStartAt: meeting.startAt ?? null,
        createdVia: meeting.createdVia ?? null,
        isScheduledCalendarVideo:
          meeting.createdVia === MEETING_CREATED_VIA.calendar && meeting.isVideoMeeting !== false,
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

  executeJoinRef.current = executeJoin

  useEffect(() => {
    if (!waitingRoomPayload || !user?.uid) return undefined
    const { room, meeting, joinOptions } = waitingRoomPayload
    const roomStateDoc = doc(db, 'videoChannels', room, 'roomState', 'current')
    const waitingRef = doc(db, 'videoChannels', room, 'waiting', user.uid)
    const startMs = meeting.startAt?.toMillis?.() ?? 0
    let cancelled = false
    let completed = false

    const tryComplete = async () => {
      if (cancelled || completed) return
      completed = true
      try {
        await deleteDoc(waitingRef)
      } catch {
        /* ignore */
      }
      setWaitingRoomPayload(null)
      setLoading(true)
      await executeJoinRef.current(meeting, {
        ...joinOptions,
        micOn: waitingRoomAvRef.current.mic,
        videoOn: waitingRoomAvRef.current.cam,
        skipWaitingRoom: true,
      })
    }

    const unsub = onSnapshot(roomStateDoc, (snap) => {
      const d = snap.data() || {}
      if (firestoreTimeToMs(d.waitingRoomReleasedAt) > 0) void tryComplete()
    })

    const interval = setInterval(() => {
      if (Date.now() >= startMs) void tryComplete()
    }, 1000)

    ;(async () => {
      try {
        const ud = await getUserDoc(user.uid)
        const photoUrl = getProfilePictureUrl(ud, user) || null
        await setDoc(waitingRef, {
          displayName: user?.displayName || user?.email || 'Guest',
          photoUrl,
          firebaseUid: user.uid,
          requestedAt: serverTimestamp(),
        })
      } catch (e) {
        console.warn('Waiting room enqueue failed:', e)
      }
    })()

    return () => {
      cancelled = true
      unsub()
      clearInterval(interval)
      deleteDoc(waitingRef).catch(() => {})
    }
  }, [waitingRoomPayload, user])

  useEffect(() => {
    if (!waitingRoomPayload) {
      setWaitingRoomPreviewStream(null)
      setWaitingRoomPreviewError('')
      return
    }
    const m = waitingRoomPayload.joinOptions?.micOn !== false
    const c = waitingRoomPayload.joinOptions?.videoOn !== false
    waitingRoomAvRef.current = { mic: m, cam: c }
    setWaitingRoomUiMic(m)
    setWaitingRoomUiCam(c)
  }, [waitingRoomPayload])

  useEffect(() => {
    if (!waitingRoomPayload) return undefined
    let disposed = false
    let stream = null
    if (!waitingRoomUiMic && !waitingRoomUiCam) {
      setWaitingRoomPreviewStream(null)
      setWaitingRoomPreviewError('')
      return () => {
        disposed = true
        setWaitingRoomPreviewStream(null)
      }
    }
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: waitingRoomUiMic,
          video: waitingRoomUiCam ? { facingMode: 'user' } : false,
        })
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        setWaitingRoomPreviewStream(stream)
        setWaitingRoomPreviewError('')
      } catch (e) {
        if (!disposed) {
          setWaitingRoomPreviewStream(null)
          setWaitingRoomPreviewError(toFriendlyError(e) || 'Could not access camera or microphone.')
        }
      }
    })()
    return () => {
      disposed = true
      if (stream) stream.getTracks().forEach((t) => t.stop())
      setWaitingRoomPreviewStream(null)
    }
  }, [waitingRoomPayload, waitingRoomUiMic, waitingRoomUiCam])

  useEffect(() => {
    if (!waitingRoomMenuOpen) return
    const onDoc = (e) => {
      if (waitingRoomMenuRef.current && !waitingRoomMenuRef.current.contains(e.target)) {
        setWaitingRoomMenuOpen(false)
      }
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [waitingRoomMenuOpen])

  useEffect(() => {
    if (!participantsRosterOpen) {
      setParticipantsRosterSearch('')
      setRosterRowMenuKey(null)
    }
  }, [participantsRosterOpen])

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
        const rh =
          d.raisedHands && typeof d.raisedHands === 'object' && !Array.isArray(d.raisedHands) ? d.raisedHands : {}
        setRaisedHandsMap(rh)
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

  useEffect(() => {
    if (!meetingInfoOpen) resetHostMeetingIdCopyFeedback()
  }, [meetingInfoOpen, resetHostMeetingIdCopyFeedback])

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
        result.wordCount != null && result.wordCount < 70
          ? ' Speak longer next time (~1–2 minutes with the mic on) or use End for everyone as host so notes can run.'
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
      // For chat-call invites with endPolicy=any_leave, end room as soon as one participant leaves.
      // Otherwise keep existing behavior: close when room becomes empty.
      const shouldEndNow = chatCallEndPolicy === 'any_leave' ? true : left.empty
      if (shouldEndNow && user?.uid && rs.exists() && !rs.data()?.endedAt) {
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
        if (left.empty && meta?.transcriptSessionId) {
          await runSummaryIfConfigured(ch, meta.transcriptSessionId, names, meta.orgId)
        }
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
    if (!channelName || joinedMeetingMeta?.createdBy !== user?.uid) return false
    try {
      await updateDoc(doc(db, 'videoChannels', channelName, 'roomState', 'current'), {
        roomPrefs: normalizeRoomPrefs(prefs),
      })
      return true
    } catch (e) {
      console.warn('Could not save meeting preferences:', e)
      return false
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

  const getEffectiveChatFileAllowed = (fbUid) => {
    if (roomPrefsLive.chatFileUploadsAllowed === false) return false
    if (!fbUid) return true
    const v = roomMediaPolicy[fbUid]?.chatFileAllowed
    if (v === false) return false
    return true
  }

  const toggleMyRaisedHand = async () => {
    if (!channelName || !joined) return
    const key = meetingHandKey(user?.uid, localAgoraUid)
    if (!key) return
    const ref = doc(db, 'videoChannels', channelName, 'roomState', 'current')
    try {
      if (raisedHandsMap[key]) {
        await updateDoc(ref, { [`raisedHands.${key}`]: deleteField() })
      } else {
        await updateDoc(ref, { [`raisedHands.${key}`]: serverTimestamp() })
      }
    } catch (e) {
      console.warn('Raise hand update failed:', e)
    }
  }

  const hostLowerRaisedHand = async (handKey) => {
    if (!channelName || !localIsHost || !handKey) return
    try {
      await updateDoc(doc(db, 'videoChannels', channelName, 'roomState', 'current'), {
        [`raisedHands.${handKey}`]: deleteField(),
      })
    } catch (e) {
      console.warn('Lower hand failed:', e)
    }
  }

  const submitMeetingPoll = async () => {
    if (!channelName || !localIsHost || !user?.uid) return
    const q = meetingPollQuestion.trim()
    const opts = meetingPollOptions.map((o) => o.trim()).filter(Boolean)
    if (opts.length < 2) {
      setError('Add at least two poll options.')
      return
    }
    setError('')
    try {
      await sendMeetingChatMessage(channelName, user, {
        text: q || 'Poll',
        audienceType: 'everyone',
        attachment: { type: 'poll', question: q || 'Poll', options: opts },
      })
      setMeetingPollModalOpen(false)
      setMeetingPollQuestion('')
      setMeetingPollOptions(['', ''])
    } catch (e) {
      setError(e?.message || 'Could not start poll.')
    }
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
    const onClose = (e) => {
      if (hostMenuWrapRef.current && !hostMenuWrapRef.current.contains(e.target)) {
        setHostMenuOpen(false)
      }
    }
    /* Use click (not mousedown) so moving the pointer over video without pressing does not dismiss */
    document.addEventListener('click', onClose)
    return () => document.removeEventListener('click', onClose)
  }, [hostMenuOpen])

  useEffect(() => {
    if (!guestMenuOpen) return
    const onClose = (e) => {
      if (guestMenuWrapRef.current && !guestMenuWrapRef.current.contains(e.target)) {
        setGuestMenuOpen(false)
      }
    }
    document.addEventListener('click', onClose)
    return () => document.removeEventListener('click', onClose)
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
    if (camOk === false) {
      if (videoApp.getLocalVideoTrack() && !videoMuted) {
        void videoApp
          .toggleVideo()
          .then((muted) => {
            if (muted) setCamEnabled(false)
          })
          .catch(() => {})
      } else {
        setCamEnabled(false)
      }
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
    try {
      const orgPick = videoRouteOrgId || instantMeetingOrgId
      if (preJoinMode === 'instant') {
        if (!orgPick) {
          setError('Select an organization first.')
          return
        }
        if (!videoRouteOrgId && !videoOrgsLoaded) {
          setError('Still loading organizations. Please wait a moment.')
          return
        }
      }
      const isHostForPrefs =
        preJoinMode === 'instant' ||
        (preJoinMode === 'meeting' && selectedMeeting && user?.uid === selectedMeeting.createdBy)
      let instantExtra =
        preJoinMode === 'instant'
          ? {
              description: newMeetingBioDraft,
              visibility: newMeetingVisibility,
              scopeTeamId: newMeetingVisibility === 'team' ? newMeetingTeamId || null : null,
              invitedUserIds: newMeetingInviteeIds,
              inviteOnly: newMeetingVisibility === 'invited',
            }
          : undefined
      if (preJoinMode === 'instant' && user?.uid && orgPick) {
        try {
          const ids = await resolveInstantMeetingRecipientIds({
            orgId: orgPick,
            userId: user.uid,
            visibility: newMeetingVisibility,
            teamId: newMeetingTeamId || null,
            orgNotify: newMeetingOrgNotify,
            teamNotify: newMeetingTeamNotify,
            pickIds: newMeetingInviteeIds,
          })
          instantExtra = { ...instantExtra, invitedUserIds: ids }
        } catch (e) {
          setError(e?.message || 'Could not prepare notifications for this meeting.')
          return
        }
      }
      const ok = await executeJoin(preJoinMode === 'instant' ? null : selectedMeeting, {
        instantCreate: preJoinMode === 'instant',
        micOn: preJoinMicOn,
        videoOn: preJoinCamOn,
        allowRemoteScreenShare: true,
        instantTitle: preJoinMode === 'instant' ? preJoinInstantMeetingTitle : undefined,
        instantMeetingExtra: instantExtra,
        roomPrefsOverride: isHostForPrefs ? roomPrefsDraft : undefined,
      })
      if (ok === true || ok === 'waiting') setPreJoinOpen(false)
    } catch (e) {
      setError(toFriendlyError(e) || 'Could not start or join the meeting.')
    }
  }

  const copyHostMeetingId = () => {
    const id = joinedMeetingMeta?.meetingId
    if (!id) return
    if (!localIsHost && !roomShowMeetingIdForParticipants) return
    void copyMeetingIdWithFeedback(id)
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

  const toggleCam = async () => {
    if (user?.uid && getEffectiveCameraAllowed(user.uid) === false) {
      const { videoMuted } = videoApp.getMediaState()
      if (videoMuted) {
        setError('The host has restricted your camera.')
        return
      }
    }
    setError('')
    try {
      const muted = await videoApp.toggleVideo()
      setCamEnabled(!muted)
      const t = videoApp.getLocalVideoTrack()
      localVideoTrackRef.current = t
      setLocalCameraTrack(t)
    } catch (e) {
      setError(toFriendlyError(e) || 'Could not update camera.')
    }
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

  const toggleTranscriptPanel = () => {
    setSidePanelTab((t) => (t === 'transcript' ? null : 'transcript'))
  }

  const toggleLiveSubtitles = () => {
    setShowLiveSubtitles((v) => !v)
  }

  const askMeeting = async () => {
    const q = meetingQuestion.trim()
    if (!q || askLoading) return
    if (!aiRestBase) {
      setMeetingHistory(h => [
        ...h,
        { role: 'ai', text: 'No AI backend URL (set VITE_AI_WS_URL or VITE_AI_HTTP_URL to your ai-backend, e.g. http://localhost:8000).' },
      ])
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

  /** Big stage + filmstrip only for viewers when someone else shares (avoids hall-of-mirrors for the sharer). */
  const pinnedShareActive = Boolean(remoteScreenSharer)

  const screenShareBannerText = useMemo(() => {
    if (screenSharing && localScreenShareTrack) return 'You are sharing your screen'
    if (remoteScreenSharer) {
      const n = participantMeta[String(remoteScreenSharer.uid)]?.displayName
      return `${n || `User ${remoteScreenSharer.uid}`} is sharing their screen`
    }
    return null
  }, [screenSharing, localScreenShareTrack, remoteScreenSharer, participantMeta])

  const filmstripRemoteUsers = useMemo(() => {
    if (!remoteScreenSharer) return []
    return remoteUsers.filter((u) => u.uid !== remoteScreenSharer.uid)
  }, [remoteScreenSharer, remoteUsers])

  const effectiveSpotlightUid = useMemo(() => {
    if (roomPinnedAgoraUid != null && Number.isFinite(Number(roomPinnedAgoraUid))) return Number(roomPinnedAgoraUid)
    if (localViewerPinAgoraUid != null && Number.isFinite(Number(localViewerPinAgoraUid)))
      return Number(localViewerPinAgoraUid)
    return null
  }, [roomPinnedAgoraUid, localViewerPinAgoraUid])

  const spotlightRemoteUser = useMemo(() => {
    if (effectiveSpotlightUid == null) return null
    const pin = Number(effectiveSpotlightUid)
    return remoteUsers.find((u) => Number(u.uid) === pin) ?? null
  }, [remoteUsers, effectiveSpotlightUid])

  const spotlightValid = useMemo(() => {
    if (effectiveSpotlightUid == null || !joined) return false
    if (localAgoraUid != null && Number(effectiveSpotlightUid) === Number(localAgoraUid)) return true
    return !!spotlightRemoteUser
  }, [effectiveSpotlightUid, localAgoraUid, spotlightRemoteUser, joined])

  const spotlightIsLocal = Boolean(
    joined &&
      spotlightValid &&
      localAgoraUid != null &&
      effectiveSpotlightUid != null &&
      Number(effectiveSpotlightUid) === Number(localAgoraUid)
  )

  const spotlightLayoutActive = Boolean(joined && !pinnedShareActive && spotlightValid)

  const localIsHost = Boolean(
    joinedMeetingMeta?.createdBy && user?.uid && joinedMeetingMeta.createdBy === user.uid
  )

  useEffect(() => {
    if (!joined) {
      setRaisedHandsMap({})
      hostHandsBaselineDoneRef.current = false
      handsSeenMaxOthersRef.current = 0
      setHostHandsDot(false)
      setHostHandsQueueOpen(false)
    }
  }, [joined])

  useEffect(() => {
    if (!joined || !localIsHost) {
      setHostHandsDot(false)
      return
    }
    const myKey = meetingHandKey(user?.uid, localAgoraUid)
    const othersCount = Object.keys(raisedHandsMap).filter((k) => k !== myKey).length
    if (hostHandsQueueOpen) {
      handsSeenMaxOthersRef.current = othersCount
      setHostHandsDot(false)
      return
    }
    if (!hostHandsBaselineDoneRef.current) {
      handsSeenMaxOthersRef.current = othersCount
      hostHandsBaselineDoneRef.current = true
      return
    }
    if (othersCount > handsSeenMaxOthersRef.current) {
      setHostHandsDot(true)
      handsSeenMaxOthersRef.current = othersCount
    }
  }, [joined, localIsHost, raisedHandsMap, hostHandsQueueOpen, user?.uid, localAgoraUid])

  useEffect(() => {
    if (!joined || !channelName || !user?.uid || !roomPrefsLive.continuousMeetingChat) {
      setMeetingChatMessages([])
      setMeetingChatLoadError('')
      return undefined
    }
    return subscribeMeetingChatMessages(
      channelName,
      user.uid,
      (msgs) => {
        setMeetingChatMessages(msgs)
        setMeetingChatLoadError('')
      },
      (err) => {
        console.error('Meeting chat listener:', err)
        setMeetingChatLoadError(formatMeetingChatFirestoreError(err))
      }
    )
  }, [joined, channelName, user?.uid, roomPrefsLive.continuousMeetingChat])

  useEffect(() => {
    if (!joined) {
      chatMessagesDigestRef.current = 0
      chatLastSeenMsRef.current = 0
      setChatUnreadDot(false)
    }
  }, [joined])

  useEffect(() => {
    let maxOther = 0
    const uid = user?.uid
    for (const m of meetingChatMessages) {
      if (!uid || m.senderId === uid) continue
      const ms = firestoreTimeToMs(m.createdAt)
      if (ms > maxOther) maxOther = ms
    }
    chatMessagesDigestRef.current = maxOther
    if (joined && sidePanelTab !== 'messages' && maxOther > chatLastSeenMsRef.current) {
      setChatUnreadDot(true)
    }
  }, [meetingChatMessages, sidePanelTab, joined, user?.uid])

  useEffect(() => {
    if (sidePanelTab === 'messages' && roomPrefsLive.continuousMeetingChat) {
      chatLastSeenMsRef.current = Math.max(chatLastSeenMsRef.current, chatMessagesDigestRef.current, Date.now())
      setChatUnreadDot(false)
    }
  }, [sidePanelTab, roomPrefsLive.continuousMeetingChat])

  const myHandRaised = useMemo(() => {
    const k = meetingHandKey(user?.uid, localAgoraUid)
    return k ? !!raisedHandsMap[k] : false
  }, [raisedHandsMap, user?.uid, localAgoraUid])

  const meetingDmRecipients = useMemo(() => {
    const rows = []
    const seen = new Set()
    const hostId = joinedMeetingMeta?.createdBy
    if (hostId && hostId !== user?.uid && !seen.has(hostId)) {
      seen.add(hostId)
      rows.push({
        id: hostId,
        label: organizerDisplayForInfo || 'Host',
      })
    }
    for (const u of remoteUsers) {
      const m = participantMeta[String(u.uid)]
      const fid = m?.firebaseUid
      if (!fid || fid === user?.uid || seen.has(fid)) continue
      seen.add(fid)
      rows.push({ id: fid, label: m.displayName || `Member` })
    }
    rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return rows
  }, [remoteUsers, participantMeta, user?.uid, joinedMeetingMeta?.createdBy, organizerDisplayForInfo])

  const raisedHandByAgoraUid = useMemo(() => {
    const out = {}
    const rh = raisedHandsMap || {}
    for (const k of Object.keys(rh)) {
      if (k.startsWith('ag_')) {
        const n = Number(k.slice(3))
        if (Number.isFinite(n)) out[n] = true
      } else if (k.startsWith('fb_')) {
        const uid = k.slice(3)
        if (user?.uid && uid === user.uid && localAgoraUid != null) {
          out[localAgoraUid] = true
        }
        for (const ru of remoteUsers) {
          const m = participantMeta[String(ru.uid)]
          if (m?.firebaseUid === uid) out[ru.uid] = true
        }
      }
    }
    return out
  }, [raisedHandsMap, participantMeta, remoteUsers, user?.uid, localAgoraUid])

  const raisedHandsQueueSorted = useMemo(() => {
    const entries = Object.entries(raisedHandsMap || {})
    const resolveLabel = (key) => {
      if (key.startsWith('fb_')) {
        const uid = key.slice(3)
        if (user?.uid === uid) return user.displayName || user.email || 'You'
        const row = Object.values(participantMeta).find((m) => m.firebaseUid === uid)
        return row?.displayName || `Member ${uid.slice(0, 6)}…`
      }
      if (key.startsWith('ag_')) {
        const id = Number(key.slice(3))
        const m = participantMeta[String(id)]
        return m?.displayName || `User ${id}`
      }
      return key
    }
    return entries
      .map(([key, ts]) => ({
        key,
        label: resolveLabel(key),
        ms: firestoreTimeToMs(ts),
      }))
      .filter((x) => x.ms > 0)
      .sort((a, b) => a.ms - b.ms)
  }, [raisedHandsMap, participantMeta, user])

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
    if (!joined) return 0
    return 1 + remoteUsers.length
  }, [joined, remoteUsers.length])

  const hostCanManageWaitingRoom = Boolean(
    joined &&
      channelName &&
      localIsHost &&
      joinedMeetingMeta?.isScheduledCalendarVideo === true
  )

  useEffect(() => {
    if (!hostCanManageWaitingRoom) {
      setWaitingLobbyCount(0)
      return undefined
    }
    const col = collection(db, 'videoChannels', channelName, 'waiting')
    return onSnapshot(col, (snap) => setWaitingLobbyCount(snap.size))
  }, [hostCanManageWaitingRoom, channelName])

  const rosterRowsForModal = useMemo(() => {
    if (!user?.uid || !joined) return []
    const q = participantsRosterSearch.trim().toLowerCase()
    const rows = []
    if (localAgoraUid != null) {
      const dn = (user.displayName || user.email || 'You').trim() || 'You'
      rows.push({
        menuKey: 'roster-local',
        isLocal: true,
        agoraUid: localAgoraUid,
        displayName: dn,
        photoUrl: localPhotoUrl,
        remoteUser: null,
        meta: { firebaseUid: user.uid, displayName: dn },
      })
    }
    for (const ru of remoteUsers) {
      const meta = participantMeta[String(ru.uid)] || {}
      const dn = meta.displayName || `User ${ru.uid}`
      rows.push({
        menuKey: `roster-r-${ru.uid}`,
        isLocal: false,
        agoraUid: ru.uid,
        displayName: dn,
        photoUrl: meta.photoUrl,
        remoteUser: ru,
        meta,
      })
    }
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
    if (!q) return rows
    return rows.filter((r) => r.displayName.toLowerCase().includes(q))
  }, [
    user?.uid,
    joined,
    localAgoraUid,
    localPhotoUrl,
    remoteUsers,
    participantMeta,
    participantsRosterSearch,
  ])

  useEffect(() => {
    if (!rosterRowMenuKey) return
    const onDoc = (e) => {
      if (!e.target.closest('.video-roster-row-menu')) setRosterRowMenuKey(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [rosterRowMenuKey])

  if (!user) return null

  const calendarBasePath = videoRouteOrgId ? `/app/org/${videoRouteOrgId}/calendar` : '/app/calendar'
  const meetingsBasePath = videoRouteOrgId ? `/app/org/${videoRouteOrgId}/video/meetings` : '/app/video/meetings'

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
        const micEff = getEffectiveMicAllowed(fbUid)
        items.push({
          key: 'policy-mic',
          label: micEff ? 'Restrict microphone' : 'Allow microphone',
          onClick: () =>
            micEff
              ? setHostConfirm({
                  title: 'Restrict microphone?',
                  body: `Turn off the microphone for ${displayName}? They will be muted and cannot unmute until you allow it again.`,
                  onConfirm: async () => {
                    await patchParticipantMediaPolicy(fbUid, { micAllowed: false })
                  },
                })
              : setHostConfirm({
                  title: 'Allow microphone?',
                  body: `Let ${displayName} use their microphone again?`,
                  onConfirm: async () => {
                    await patchParticipantMediaPolicy(fbUid, { micAllowed: true })
                  },
                }),
        })
        const camEff = getEffectiveCameraAllowed(fbUid)
        items.push({
          key: 'policy-cam',
          label: camEff ? 'Restrict camera' : 'Allow camera',
          onClick: () =>
            camEff
              ? setHostConfirm({
                  title: 'Restrict camera?',
                  body: `Turn off video for ${displayName}? Their camera will stop and they cannot turn it on until you allow it.`,
                  onConfirm: async () => {
                    await patchParticipantMediaPolicy(fbUid, { cameraAllowed: false })
                  },
                })
              : setHostConfirm({
                  title: 'Allow camera?',
                  body: `Let ${displayName} turn their camera on again?`,
                  onConfirm: async () => {
                    await patchParticipantMediaPolicy(fbUid, { cameraAllowed: true })
                  },
                }),
        })
        if (roomPrefsLive.chatFileUploadsAllowed !== false) {
          const fileEff = getEffectiveChatFileAllowed(fbUid)
          items.push({
            key: 'policy-chatfile',
            label: fileEff ? 'Restrict chat file uploads' : 'Allow chat file uploads',
            onClick: () =>
              fileEff
                ? setHostConfirm({
                    title: 'Restrict chat file uploads?',
                    body: `Stop ${displayName} from attaching files in meeting chat?`,
                    onConfirm: async () => {
                      await patchParticipantMediaPolicy(fbUid, { chatFileAllowed: false })
                    },
                  })
                : setHostConfirm({
                    title: 'Allow chat file uploads?',
                    body: `Let ${displayName} attach files in meeting chat again?`,
                    onConfirm: async () => {
                      await patchParticipantMediaPolicy(fbUid, { chatFileAllowed: true })
                    },
                  }),
          })
        }
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

  const getMenuItemsForRosterRow = (row) => {
    if (row.isLocal) return buildLocalParticipantMenuItems()
    if (!row.remoteUser) return []
    return buildRemoteParticipantMenuItems(row.remoteUser, row.meta || {})
  }

  return (
    <main className={['app-main', 'video-call-main', !joined && 'video-call-main--lobby'].filter(Boolean).join(' ')}>
      {generatingSummary ? (
        <div className="video-call-generating-summary">
          <div className="video-call-generating-spinner" />
          <h2>Generating Meeting Summary</h2>
          <p>Hang on tight, this will only take a moment...</p>
        </div>
      ) : !joined ? (
        <>
          {waitingRoomPayload ? (
            <div
              className="video-prejoin-overlay video-waiting-room-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="video-waiting-room-title"
              aria-live="polite"
            >
              <button
                type="button"
                className="video-prejoin-backdrop"
                onClick={() => {
                  setWaitingRoomMenuOpen(false)
                  setWaitingRoomPayload(null)
                }}
                aria-label="Leave waiting room"
              />
              <div className="video-prejoin-modal video-waiting-room-modal" onClick={(e) => e.stopPropagation()}>
                <div className="video-waiting-room-modal__toolbar">
                  <span className="video-waiting-room-modal__toolbar-spacer" aria-hidden />
                  <div className="video-waiting-room-more" ref={waitingRoomMenuRef}>
                    <button
                      type="button"
                      className="video-waiting-room-more-btn"
                      aria-label="Waiting room options"
                      aria-expanded={waitingRoomMenuOpen}
                      onClick={(e) => {
                        e.stopPropagation()
                        setWaitingRoomMenuOpen((o) => !o)
                      }}
                    >
                      <MoreVertical size={20} strokeWidth={2.25} />
                    </button>
                    {waitingRoomMenuOpen && (
                      <div className="video-waiting-room-more-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="video-waiting-room-more-item"
                          onClick={() => {
                            setWaitingRoomMenuOpen(false)
                            setWaitingRoomPayload(null)
                          }}
                        >
                          Leave waiting room
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="video-prejoin-preview-wrap">
                  {waitingRoomPreviewError ? (
                    <div className="video-prejoin-preview-fallback">
                      <p>{waitingRoomPreviewError}</p>
                    </div>
                  ) : (
                    <WaitingRoomPreviewVideo stream={waitingRoomPreviewStream} camOn={waitingRoomUiCam} />
                  )}
                  {!waitingRoomPreviewError && !waitingRoomUiCam && (
                    <div className="video-prejoin-preview-fallback video-prejoin-preview-fallback--dim">
                      <p>{!waitingRoomUiMic && !waitingRoomUiCam ? 'Microphone and camera off' : 'Camera off'}</p>
                    </div>
                  )}
                  <div className="video-prejoin-preview-actions">
                    <button
                      type="button"
                      className={`video-prejoin-av-btn ${waitingRoomUiMic ? 'video-prejoin-av-btn--on' : ''}`}
                      aria-pressed={waitingRoomUiMic}
                      onClick={() => {
                        setWaitingRoomUiMic((v) => {
                          const n = !v
                          waitingRoomAvRef.current = { ...waitingRoomAvRef.current, mic: n }
                          return n
                        })
                      }}
                    >
                      {waitingRoomUiMic ? <Mic size={22} strokeWidth={2.25} /> : <MicOff size={22} strokeWidth={2.25} />}
                      <span>Audio</span>
                    </button>
                    <button
                      type="button"
                      className={`video-prejoin-av-btn ${waitingRoomUiCam ? 'video-prejoin-av-btn--on' : ''}`}
                      aria-pressed={waitingRoomUiCam}
                      onClick={() => {
                        setWaitingRoomUiCam((v) => {
                          const n = !v
                          waitingRoomAvRef.current = { ...waitingRoomAvRef.current, cam: n }
                          return n
                        })
                      }}
                    >
                      {waitingRoomUiCam ? <Video size={22} strokeWidth={2.25} /> : <VideoOff size={22} strokeWidth={2.25} />}
                      <span>Video</span>
                    </button>
                  </div>
                </div>
                <div className="video-waiting-room-modal__body">
                  <h2 id="video-waiting-room-title" className="video-prejoin-title video-waiting-room-modal__title">
                    {waitingRoomPayload.meeting.title || 'Meeting'}
                  </h2>
                  {formatMeetingStart(waitingRoomPayload.meeting) ? (
                    <p className="video-prejoin-sub video-waiting-room-modal__scheduled">
                      Scheduled: {formatMeetingStart(waitingRoomPayload.meeting)}
                    </p>
                  ) : null}
                  <p className="video-waiting-room-modal__status">
                    <Loader className="video-waiting-room-spinner" size={18} strokeWidth={2.5} aria-hidden />
                    <span>
                      Waiting for the host to admit you, or for the scheduled start time. Your mic and camera choices
                      here will carry over when you enter the room.
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="video-call-lobby video-call-lobby--wide">
            {!waitingRoomPayload ? (
              <>
            <div className="video-call-lobby-header">
              <h2 className="video-call-lobby-title">Video Meetings</h2>
              <p className="video-call-lobby-sub">
                {videoRouteOrgId
                  ? `${videoUserOrgs[0]?.name || 'This organization'}: start, schedule, or join with a meeting ID.`
                  : 'Across all your organizations: start a call (choose an org), schedule, or join with a meeting ID.'}
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
                    disabled={!videoLobbyMemLoaded || !canStartInstantMeeting}
                    title={
                      videoLobbyMemLoaded && !canStartInstantMeeting
                        ? 'You do not have permission to start meetings in this organization.'
                        : undefined
                    }
                  >
                    <span className="video-call-action-card-kicker">Start now</span>
                    <span className="video-call-action-card-title">New Meeting</span>
                    <span className="video-call-action-card-desc">
                      Opens a preview to turn your camera and microphone on or off, then starts a quick meeting.
                    </span>
                  </button>
                  <div className="video-call-action-card video-call-action-card--static">
                    <span className="video-call-action-card-kicker">Calendar</span>
                    <span className="video-call-action-card-title">Schedule Meeting</span>
                    <span className="video-call-action-card-desc">Add a dated event, optional video, and invite people.</span>
                    <div className="video-call-action-card-actions">
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={() => setScheduleModalOpen(true)}
                        disabled={!scheduleOrgForModal || !canScheduleFromVideoLobby}
                        title={
                          scheduleOrgForModal && !canScheduleFromVideoLobby
                            ? 'You do not have permission to schedule meetings. Ask an admin to enable scheduling for your role.'
                            : undefined
                        }
                      >
                        Schedule Here
                      </Button>
                      <Link to={`${calendarBasePath}?create=1`} className="video-call-action-card-calendar-link">
                        Open calendar →
                      </Link>
                    </div>
                  </div>
                  <div className="video-call-action-card video-call-action-card--static">
                    <span className="video-call-action-card-kicker">ID</span>
                    <span className="video-call-action-card-title">Join Meeting</span>
                    <span className="video-call-action-card-desc">
                      {videoRouteOrgId
                        ? 'Paste the meeting ID from the calendar event (document id in this organization).'
                        : 'Paste the meeting ID. We search every organization you belong to.'}
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
                        {joinByIdLoading ? '…' : 'Join'}
                      </Button>
                    </div>
                  </div>
                </div>

                <section className="video-call-lobby-panel video-call-ongoing-section" aria-labelledby="video-ongoing-heading">
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

                <section className="video-call-lobby-panel video-call-upcoming-section" aria-labelledby="video-upcoming-heading">
                  <div className="video-call-upcoming-header">
                    <h3 id="video-upcoming-heading" className="video-call-ongoing-heading">
                      Upcoming meetings
                    </h3>
                    <div className="video-call-upcoming-horizon-wrap" ref={upcomingHorizonWrapRef}>
                      <button
                        type="button"
                        className="video-call-upcoming-horizon-btn"
                        aria-label="Upcoming range"
                        aria-expanded={upcomingHorizonMenuOpen}
                        aria-haspopup="menu"
                        onClick={() => setUpcomingHorizonMenuOpen((o) => !o)}
                      >
                        <MoreVertical size={18} strokeWidth={2.25} aria-hidden />
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
                  <p className="video-call-ongoing-sub">
                    Calendar-scheduled video meetings only. Instant meetings are not shown here. Showing start times from
                    now through the next{' '}
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
                            Join Options
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="video-call-lobby-calendar-hint video-call-lobby-calendar-hint--in-panel">
                    Scheduled calls live on the{' '}
                    <Link to={calendarBasePath} className="video-call-lobby-link">
                      calendar
                    </Link>
                    . Open an event from there to join with a link, or paste its meeting ID above.
                  </p>
                </section>

                <section className="video-call-lobby-panel video-call-past-lobby-section" aria-labelledby="video-past-lobby-heading">
                  <h3 id="video-past-lobby-heading" className="video-call-ongoing-heading">
                    Past meetings & transcripts
                  </h3>
                  <p className="video-call-ongoing-sub">
                    Recent notes and saved transcripts. Open a row for the full recap, copy sections, exports, and Ask AI.
                  </p>
                  {pastLobbyLoading && pastLobbyRows.length === 0 ? (
                    <p className="video-call-lobby-muted">Loading recent meetings…</p>
                  ) : pastLobbyRows.length === 0 ? (
                    <p className="video-call-lobby-muted">
                      No past meetings yet. When you finish a call, the host can use <strong>End for everyone</strong> to generate
                      notes (with the AI backend connected).
                    </p>
                  ) : (
                    <ul className="video-call-past-lobby-list">
                      {pastLobbyRows.map((row) => (
                        <li key={row.key} className="video-call-past-lobby-row">
                          <div className="video-call-past-lobby-row-main">
                            <span className="video-call-past-lobby-title">{row.title}</span>
                            <span className="video-call-past-lobby-meta">
                              {formatMeetingStart({ startAt: row.startAt }) ? (
                                <span>{formatMeetingStart({ startAt: row.startAt })}</span>
                              ) : null}
                              {!videoRouteOrgId && row.orgName ? (
                                <span className="video-call-ongoing-org">{row.orgName}</span>
                              ) : null}
                              {row.hasAiNotes ? <span className="video-call-past-lobby-badge">AI notes</span> : null}
                              {row.transcriptOnly ? (
                                <span className="video-call-past-lobby-badge video-call-past-lobby-badge--muted">Transcript</span>
                              ) : null}
                              {!row.href ? <span className="video-call-past-lobby-badge video-call-past-lobby-badge--muted">No recap</span> : null}
                            </span>
                          </div>
                          {row.href ? (
                            <Button as={Link} to={row.href} variant="outline" size="sm" className="video-call-past-lobby-open">
                              Open
                            </Button>
                          ) : (
                            <span className="video-call-lobby-muted video-call-past-lobby-pending" aria-hidden>
                              …
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="video-call-past-lobby-footer">
                    <Button as={Link} to={meetingsBasePath} variant="primary" size="sm" className="video-call-past-lobby-view-all">
                      View all
                      <ChevronRight size={17} strokeWidth={2.25} aria-hidden />
                    </Button>
                    <p className="video-call-past-lobby-footnote">
                      Full list with search, filters, and exports lives on the dedicated past meetings page.
                    </p>
                  </div>
                </section>

                {error && <p className="auth-error video-call-lobby-error">{error}</p>}
              </>
            )}
              </>
            ) : null}
          </div>
          {scheduleOrgForModal && user && (
            <Suspense fallback={null}>
              <CreateEventModal
                isOpen={scheduleModalOpen}
                onClose={() => setScheduleModalOpen(false)}
                user={user}
                activeOrgId={scheduleOrgForModal}
                defaultDate={null}
                onCreated={() => setUpcomingReloadKey((k) => k + 1)}
                myOrgMembership={scheduleModalMembership}
                orgOptions={!videoRouteOrgId && videoUserOrgs.length > 1 ? videoUserOrgs : undefined}
              />
            </Suspense>
          )}
          <NewMeetingSettingsModal
            isOpen={newMeetingSettingsOpen}
            onClose={() => {
              if (!loading) {
                setNewMeetingSettingsOpen(false)
                setNewMeetingMembersError('')
              }
            }}
            titleValue={newMeetingTitleDraft}
            onTitleChange={setNewMeetingTitleDraft}
            bioValue={newMeetingBioDraft}
            onBioChange={setNewMeetingBioDraft}
            visibility={newMeetingVisibility}
            onVisibilityChange={setNewMeetingVisibility}
            teams={newMeetingTeamsList}
            teamId={newMeetingTeamId}
            onTeamIdChange={setNewMeetingTeamId}
            members={newMeetingMembers}
            membersLoading={newMeetingMembersLoading}
            membersError={newMeetingMembersError}
            inviteeIds={newMeetingInviteeIds}
            onInviteeIdsChange={setNewMeetingInviteeIds}
            onContinue={continueNewMeetingToPreJoin}
            orgOptions={!videoRouteOrgId && videoUserOrgs.length > 1 ? videoUserOrgs : null}
            selectedOrgId={instantMeetingOrgId}
            onOrgChange={setInstantMeetingOrgId}
            orgNotify={newMeetingOrgNotify}
            onOrgNotifyChange={setNewMeetingOrgNotify}
            teamNotify={newMeetingTeamNotify}
            onTeamNotifyChange={setNewMeetingTeamNotify}
            teamPickMembers={newMeetingTeamPickMembers}
            teamPickMembersLoading={newMeetingTeamPickLoading}
          />
          <VideoPreJoinModal
            isOpen={preJoinOpen}
            onClose={() => !loading && setPreJoinOpen(false)}
            error={error}
            title={
              preJoinMode === 'instant'
                ? preJoinInstantMeetingTitle || 'Quick meeting'
                : selectedMeeting?.title || 'Join Meeting'
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
            confirmLabel={preJoinMode === 'instant' ? 'Start Quick Meeting' : 'Join Meeting'}
            loading={loading}
            onConfirm={() => void confirmPreJoin()}
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
              {hostCanManageWaitingRoom && waitingLobbyCount > 0 && (
                <div className="video-waiting-host-banner" role="region" aria-label="Waiting room">
                  <span className="video-waiting-host-banner-text">
                    {waitingLobbyCount} {waitingLobbyCount === 1 ? 'person' : 'people'} in the waiting room
                  </span>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      try {
                        await updateDoc(doc(db, 'videoChannels', channelName, 'roomState', 'current'), {
                          waitingRoomReleasedAt: serverTimestamp(),
                        })
                      } catch (e) {
                        console.warn(e)
                        setError('Could not admit people from the waiting room.')
                      }
                    }}
                  >
                    Admit everyone
                  </Button>
                </div>
              )}
              {screenShareBannerText && (
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
                        raisedHand={!!raisedHandByAgoraUid[remoteScreenSharer.uid]}
                        stageLabel={`${
                          participantMeta[String(remoteScreenSharer.uid)]?.displayName ||
                          `User ${remoteScreenSharer.uid}`
                        } · Screen`}
                        mode="stage"
                      />
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
                              raisedHand={localAgoraUid != null && !!raisedHandByAgoraUid[localAgoraUid]}
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
                            raisedHand={!!raisedHandByAgoraUid[spotlightRemoteUser.uid]}
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
                          <VideoParticipantLabel
                            name="You"
                            micOn={micEnabled}
                            showHost={localIsHost}
                            raisedHand={localAgoraUid != null && !!raisedHandByAgoraUid[localAgoraUid]}
                          />
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
                              raisedHand={!!raisedHandByAgoraUid[u.uid]}
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
                            raisedHand={localAgoraUid != null && !!raisedHandByAgoraUid[localAgoraUid]}
                          />
                          <LocalVideoTrack
                            track={localCameraTrack}
                            camOn={camEnabled}
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
                              raisedHand={!!raisedHandByAgoraUid[u.uid]}
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
                                raisedHand={localAgoraUid != null && !!raisedHandByAgoraUid[localAgoraUid]}
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
                              raisedHand={!!raisedHandByAgoraUid[item.user.uid]}
                              mode="filmstrip"
                            />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
                {transcriptionWsBase &&
                  showLiveSubtitles &&
                  liveSubtitleMeta && (
                    <div
                      className="video-call-live-subtitles"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <p className="video-call-live-subtitles-line">
                        <span className="video-call-live-subtitles-dash" aria-hidden>
                          -
                        </span>
                        <span className="video-call-live-subtitles-bracket">
                          [{shortCaptionSpeaker(liveSubtitleMeta.speaker)}]
                        </span>
                        {liveSubtitleMeta.text ? (
                          <span className="video-call-live-subtitles-words">{liveSubtitleMeta.text}</span>
                        ) : null}
                      </p>
                    </div>
                  )}
              </div>
            </div>
            {sidePanelTab && (
              <aside className="video-call-side-panel" aria-label="In-meeting chat, transcript, and assistant">
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
                    aria-selected={sidePanelTab === 'transcript'}
                    className={[
                      'video-call-side-panel-tab',
                      sidePanelTab === 'transcript' && 'video-call-side-panel-tab--active',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSidePanelTab('transcript')}
                  >
                    Transcript
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
                      <div className="video-call-side-messages-wrap">
                        {meetingChatLoadError ? (
                          <p className="auth-error video-call-side-chat-error" role="alert">
                            {meetingChatLoadError}
                          </p>
                        ) : null}
                        <VideoCallChat
                          channelName={channelName}
                          user={user}
                          omitHeader
                          messages={meetingChatMessages}
                          participantMeta={participantMeta}
                          localPhotoUrl={localPhotoUrl}
                          localIsHost={localIsHost}
                          meetingHostUid={joinedMeetingMeta?.createdBy || ''}
                          dmRecipients={meetingDmRecipients}
                          fileUploadAllowed={
                            localIsHost
                              ? roomPrefsLive.chatFileUploadsAllowed !== false
                              : getEffectiveChatFileAllowed(user?.uid)
                          }
                        />
                      </div>
                    ) : (
                      <p className="video-call-side-panel-disabled">The host turned off continuous meeting chat.</p>
                    ))}
                  {sidePanelTab === 'ai' && (
                    <div className="video-call-meeting-chat video-call-meeting-chat--in-panel video-call-ask-ai">
                      <div className="video-call-meeting-chat-history video-call-ask-ai-history">
                        {meetingHistory.length === 0 && !askLoading ? (
                          <p className="video-call-ask-ai-empty">
                            Ask a question about this meeting using the field below. Answers use the live transcript when
                            available.
                          </p>
                        ) : null}
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
                      <div className="video-call-ask-ai-compose">
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
                          <p className="video-call-meeting-chat-hint">
                            Set VITE_AI_WS_URL or VITE_AI_HTTP_URL (ai-backend) to enable meeting Q&A.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {sidePanelTab === 'transcript' && (
                    <div className="video-call-transcript-panel">
                      {!transcriptionWsBase ? (
                        <p className="video-call-meeting-chat-hint">
                          Set <code className="video-call-transcript-code">VITE_AI_WS_URL</code> to your AI backend and
                          rebuild to enable live transcription, subtitles, and this panel.
                        </p>
                      ) : liveTranscriptLines.length === 0 ? (
                        <p className="video-call-transcript-empty">
                          Transcript lines appear a few seconds after you speak (short audio windows are sent to the AI).
                          Turn on your microphone.
                        </p>
                      ) : (
                        <div className="video-call-transcript-scroll" role="log" aria-live="polite" aria-relevant="additions">
                          {liveTranscriptLines.map((line) => (
                            <div key={line.id} className="video-call-transcript-line">
                              <p className="video-call-transcript-line-text">
                                {line.timeLabel ? (
                                  <span className="video-call-transcript-line-time">{line.timeLabel} </span>
                                ) : null}
                                <span className="video-call-transcript-line-prefix" aria-hidden>
                                  -[{shortCaptionSpeaker(line.speaker)}]{' '}
                                </span>
                                {line.text}
                              </p>
                            </div>
                          ))}
                          <span ref={liveTranscriptEndRef} className="video-call-transcript-end" aria-hidden />
                        </div>
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
              <span className="video-call-control-wrap">
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
                {chatUnreadDot && roomPrefsLive.continuousMeetingChat ? (
                  <span className="video-call-control-notify-dot" aria-hidden />
                ) : null}
              </span>
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
                variant={sidePanelTab === 'transcript' ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleTranscriptPanel}
                aria-label="Live transcript"
                title="Open live transcript"
              >
                <FileText size={20} strokeWidth={2.25} />
              </Button>
              <Button
                className="video-call-control-btn"
                variant={showLiveSubtitles && transcriptionWsBase ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleLiveSubtitles}
                disabled={!transcriptionWsBase}
                aria-label={showLiveSubtitles ? 'Hide subtitles' : 'Show subtitles'}
                title={
                  transcriptionWsBase
                    ? showLiveSubtitles
                      ? 'Hide on-screen subtitles'
                      : 'Show on-screen subtitles'
                    : 'Subtitles need the AI transcription service'
                }
              >
                <Captions size={20} strokeWidth={2.25} />
              </Button>
              {!localIsHost ? (
                <Button
                  className="video-call-control-btn"
                  variant={myHandRaised ? 'primary' : 'outline'}
                  size="sm"
                  onClick={toggleMyRaisedHand}
                  aria-label={myHandRaised ? 'Lower hand' : 'Raise hand'}
                  title={myHandRaised ? 'Lower hand' : 'Raise hand'}
                >
                  <Hand size={20} strokeWidth={2.25} />
                </Button>
              ) : (
                <span className="video-call-control-wrap">
                  <Button
                    className="video-call-control-btn"
                    variant={hostHandsQueueOpen ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setHostHandsQueueOpen(true)}
                    aria-label="Raised hands"
                    title="Open raised hands queue"
                  >
                    <Hand size={20} strokeWidth={2.25} />
                  </Button>
                  {hostHandsDot ? <span className="video-call-control-notify-dot" aria-hidden /> : null}
                </span>
              )}
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
                    <div className="video-host-dropdown video-host-dropdown--grid" role="menu">
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setParticipantsRosterOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        <Users className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Participants</span>
                      </button>
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setInvitePeopleModalOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        <UserPlus className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Invite</span>
                      </button>
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setMeetingInfoOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        <Info className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Meeting info</span>
                      </button>
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setHostPrefsDraft({ ...roomPrefsLive })
                          setHostPrefsSaveError('')
                          setHostPrefsModalOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        <Settings className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Preferences</span>
                      </button>
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setHostPermissionsOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        <Shield className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Permissions</span>
                      </button>
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setMeetingPollQuestion('')
                          setMeetingPollOptions(['', ''])
                          setMeetingPollModalOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        <BarChart3 className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Poll</span>
                      </button>
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setHostHandsQueueOpen(true)
                          setHostMenuOpen(false)
                        }}
                      >
                        <Hand className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Raised hands</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
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
                    <div className="video-host-dropdown video-host-dropdown--grid video-host-dropdown--grid-guest" role="menu">
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setParticipantsRosterOpen(true)
                          setGuestMenuOpen(false)
                        }}
                      >
                        <Users className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Participants</span>
                      </button>
                      <button
                        type="button"
                        className="video-host-grid-item"
                        role="menuitem"
                        onClick={() => {
                          setMeetingInfoOpen(true)
                          setGuestMenuOpen(false)
                        }}
                      >
                        <Info className="video-host-grid-icon" size={22} strokeWidth={2} aria-hidden />
                        <span className="video-host-grid-label">Meeting info</span>
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
                      {organizerDisplayForInfo || joinedMeetingMeta?.createdBy || 'Unknown'}
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
                        <code className="video-host-info-code">{joinedMeetingMeta?.meetingId || 'N/A'}</code>
                        {joinedMeetingMeta?.meetingId && (
                          <button
                            type="button"
                            className={['video-host-info-copy', hostMeetingIdCopied && 'video-host-info-copy--done']
                              .filter(Boolean)
                              .join(' ')}
                            onClick={copyHostMeetingId}
                            aria-label={hostMeetingIdCopied ? 'Meeting ID copied' : 'Copy meeting ID'}
                          >
                            {hostMeetingIdCopied ? (
                              <Check size={16} strokeWidth={2.5} aria-hidden />
                            ) : (
                              <Copy size={16} strokeWidth={2.25} aria-hidden />
                            )}
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
            <div
              className="video-host-overlay video-host-overlay--meeting-prefs"
              role="dialog"
              aria-modal="true"
              aria-labelledby="video-host-prefs-title"
            >
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                disabled={hostPrefsSaving}
                    onClick={() => {
                      if (hostPrefsSaving) return
                      setHostPrefsSaveError('')
                      setHostPrefsModalOpen(false)
                    }}
                  />
              <div className="video-host-modal video-host-modal--prefs video-host-modal--scroll">
                <h3 id="video-host-prefs-title" className="video-host-modal-title">
                  Meeting preferences
                </h3>
                <p className="video-host-modal-hint">
                  Meeting chat settings apply to everyone right away. Video toggles set the default camera state for people when they
                  join (they can still change their own camera).
                </p>
                {hostPrefsSaveError ? (
                  <p className="video-host-prefs-save-error" role="alert">
                    {hostPrefsSaveError}
                  </p>
                ) : null}
                <RoomPrefsFields
                  prefs={hostPrefsDraft}
                  onChange={(next) => {
                    setHostPrefsSaveError('')
                    setHostPrefsDraft(next)
                  }}
                  className="video-room-prefs--host-modal"
                />
                <div className="video-host-modal-footer">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={hostPrefsSaving}
                    onClick={() => {
                      if (hostPrefsSaving) return
                      setHostPrefsSaveError('')
                      setHostPrefsModalOpen(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={hostPrefsSaving}
                    onClick={async () => {
                      setHostPrefsSaving(true)
                      setHostPrefsSaveError('')
                      try {
                        const ok = await hostSaveRoomPrefs(hostPrefsDraft)
                        if (ok) {
                          setRoomPrefsLive(normalizeRoomPrefs(hostPrefsDraft))
                          setHostPrefsSaveError('')
                          setHostPrefsModalOpen(false)
                        } else {
                          setHostPrefsSaveError('Could not save meeting preferences. Check your connection and try again.')
                        }
                      } finally {
                        setHostPrefsSaving(false)
                      }
                    }}
                  >
                    {hostPrefsSaving ? 'Saving…' : 'Save'}
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
                  <button
                    type="button"
                    className="video-host-perm-category"
                    onClick={() => {
                      setHostPermissionsOpen(false)
                      setHostPolicyModal('chatfile')
                    }}
                  >
                    <span className="video-host-perm-category-label">Chat file uploads</span>
                    <span className="video-host-perm-category-desc">Meeting chat attachments per person</span>
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
          {localIsHost && hostHandsQueueOpen && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-hands-queue-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => setHostHandsQueueOpen(false)}
              />
              <div className="video-host-modal video-host-modal--scroll">
                <h3 id="video-hands-queue-title" className="video-host-modal-title">
                  Raised hands
                </h3>
                <p className="video-host-modal-hint">First in the list raised first. Lower a hand after you address them.</p>
                {raisedHandsQueueSorted.length === 0 ? (
                  <p className="video-host-modal-hint video-host-modal-hint--tight">No raised hands right now.</p>
                ) : (
                  <ul className="video-host-policy-list">
                    {raisedHandsQueueSorted.map(({ key, label }) => (
                      <li key={key} className="video-host-policy-row video-host-hands-row">
                        <span className="video-host-policy-name">
                          <Hand size={16} strokeWidth={2.25} className="video-host-hands-row-icon" aria-hidden />
                          {label}
                        </span>
                        <Button type="button" variant="outline" size="sm" onClick={() => hostLowerRaisedHand(key)}>
                          Lower
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="video-host-modal-footer">
                  <Button type="button" variant="primary" size="sm" onClick={() => setHostHandsQueueOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
          {localIsHost && meetingPollModalOpen && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-meeting-poll-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => setMeetingPollModalOpen(false)}
              />
              <div className="video-host-modal video-host-modal--scroll">
                <h3 id="video-meeting-poll-title" className="video-host-modal-title">
                  Start a meeting poll
                </h3>
                <p className="video-host-modal-hint">Everyone in the room will see this in chat and can vote until you end the poll.</p>
                <label className="video-meeting-poll-field">
                  <span className="video-meeting-poll-label">Question</span>
                  <input
                    type="text"
                    className="auth-input video-meeting-poll-input"
                    value={meetingPollQuestion}
                    onChange={(e) => setMeetingPollQuestion(e.target.value)}
                    placeholder="What should we do next?"
                  />
                </label>
                <p className="video-meeting-poll-label">Options (at least 2)</p>
                <ul className="video-meeting-poll-options">
                  {meetingPollOptions.map((opt, idx) => (
                    <li key={idx}>
                      <input
                        type="text"
                        className="auth-input video-meeting-poll-input"
                        value={opt}
                        onChange={(e) => {
                          const next = [...meetingPollOptions]
                          next[idx] = e.target.value
                          setMeetingPollOptions(next)
                        }}
                        placeholder={`Option ${idx + 1}`}
                      />
                    </li>
                  ))}
                </ul>
                <div className="video-meeting-poll-actions">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMeetingPollOptions((o) => [...o, ''])}
                    disabled={meetingPollOptions.length >= 8}
                  >
                    Add option
                  </Button>
                </div>
                <div className="video-host-modal-footer">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMeetingPollModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={submitMeetingPoll}>
                    Post poll
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
          {localIsHost && hostPolicyModal === 'chatfile' && (
            <div className="video-host-overlay" role="dialog" aria-modal="true" aria-labelledby="video-host-policy-chatfile-title">
              <button
                type="button"
                className="video-host-overlay-backdrop"
                aria-label="Close"
                onClick={() => !hostActionLoading && setHostPolicyModal(null)}
              />
              <div className="video-host-modal video-host-modal--scroll">
                <h3 id="video-host-policy-chatfile-title" className="video-host-modal-title">
                  Chat file uploads
                </h3>
                <p className="video-host-modal-hint">
                  Turn off uploads for the whole room in Meeting preferences, or restrict individuals here. Hosts can always
                  upload when the room allows files.
                </p>
                {!policyParticipantRows.some((r) => !r.isLocal) ? (
                  <p className="video-host-modal-hint video-host-modal-hint--tight">
                    When others join, they will appear here so you can allow or restrict file uploads in meeting chat.
                  </p>
                ) : null}
                <ul className="video-host-policy-list">
                  {policyParticipantRows.map((row) => {
                    if (row.isLocal) return null
                    const roomOff = roomPrefsLive.chatFileUploadsAllowed === false
                    const eff = row.firebaseUid ? getEffectiveChatFileAllowed(row.firebaseUid) : !roomOff
                    return (
                      <li key={row.firebaseUid || `agora-${row.agoraUid}`} className="video-host-policy-row">
                        <div className="video-host-policy-row-main">
                          <span className="video-host-policy-name">{row.displayName}</span>
                          {roomOff ? (
                            <span className="video-host-policy-badge">Room off</span>
                          ) : row.canManage ? (
                            <span className={eff ? 'video-host-policy-badge video-host-policy-badge--ok' : 'video-host-policy-badge'}>
                              {eff ? 'Can upload' : 'Cannot upload'}
                            </span>
                          ) : (
                            <span className="video-host-policy-badge video-host-policy-badge--pending">Not linked</span>
                          )}
                        </div>
                        {roomOff ? (
                          <p className="video-host-policy-unlinked">Enable “Allow chat file uploads” in Meeting preferences first.</p>
                        ) : row.canManage && row.firebaseUid ? (
                          <div className="video-host-policy-actions">
                            {eff ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={hostActionLoading}
                                onClick={() =>
                                  setHostConfirm({
                                    title: 'Restrict chat file uploads?',
                                    body: `Stop ${row.displayName} from attaching files in meeting chat?`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { chatFileAllowed: false })
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
                                    title: 'Allow chat file uploads?',
                                    body: `Let ${row.displayName} attach files in meeting chat again?`,
                                    onConfirm: async () => {
                                      await patchParticipantMediaPolicy(row.firebaseUid, { chatFileAllowed: true })
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
          <ParticipantsRosterModal
            isOpen={participantsRosterOpen}
            onClose={() => setParticipantsRosterOpen(false)}
            search={participantsRosterSearch}
            onSearchChange={setParticipantsRosterSearch}
            rows={rosterRowsForModal}
            inRoomCount={inRoomParticipantCount}
            menuOpenKey={rosterRowMenuKey}
            onMenuOpenChange={setRosterRowMenuKey}
            getMenuItemsForRow={getMenuItemsForRosterRow}
            localIsHost={localIsHost}
            hostActionLoading={hostActionLoading}
            onInvite={() => {
              setParticipantsRosterOpen(false)
              setInvitePeopleModalOpen(true)
            }}
            onMuteAllRequest={() =>
              setHostConfirm({
                title: 'Mute everyone?',
                body: 'Linked participants will be muted and cannot unmute until you allow their microphone again in Permissions or per person.',
                onConfirm: async () => {
                  for (const row of policyParticipantRows) {
                    if (row.isLocal || !row.firebaseUid) continue
                    await patchParticipantMediaPolicy(row.firebaseUid, { micAllowed: false })
                  }
                },
              })
            }
            onUnmuteAllRequest={() =>
              setHostConfirm({
                title: 'Allow microphones for everyone?',
                body: 'All linked participants will be able to unmute themselves (unless you restrict them again).',
                onConfirm: async () => {
                  for (const row of policyParticipantRows) {
                    if (row.isLocal || !row.firebaseUid) continue
                    await patchParticipantMediaPolicy(row.firebaseUid, { micAllowed: true })
                  }
                },
              })
            }
          />
          <InvitePeopleInMeetingModal
            isOpen={invitePeopleModalOpen}
            onClose={() => setInvitePeopleModalOpen(false)}
            orgId={joinedMeetingMeta?.orgId || videoRouteOrgId || instantMeetingOrgId || ''}
            meetingId={joinedMeetingMeta?.meetingId || ''}
            channelName={channelName}
            meetingTitle={joinedMeetingMeta?.meetingTitle || ''}
            userId={user?.uid}
            setError={setError}
          />
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
              <button
                type="button"
                className="video-call-leave-backdrop"
                aria-label="Dismiss"
                disabled={loading}
                onClick={() => !loading && setShowLeaveModal(false)}
              />
              <div className="video-call-leave-modal">
                <div className="video-call-leave-header">
                  <h3 id="video-leave-title" className="video-call-leave-title">
                    Leave meeting
                  </h3>
                  <p className="video-call-leave-desc">You are the host. Choose what happens for everyone else.</p>
                </div>
                <div className="video-call-leave-actions">
                  <div className="video-call-leave-actions-primary">
                    <Button
                      type="button"
                      variant="outline"
                      className="video-call-leave-choice-btn"
                      onClick={leaveCallOnly}
                      disabled={loading}
                    >
                      Leave (others stay)
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      className="video-call-leave-choice-btn video-call-leave-choice-btn--end"
                      onClick={endMeetingForAll}
                      disabled={loading}
                    >
                      End for everyone
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="video-call-leave-cancel"
                    onClick={() => !loading && setShowLeaveModal(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="video-call-leave-hint">
                  “End for everyone” closes the room for all participants and starts meeting notes when the AI backend is configured.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {showNotepad && (
        <Suspense fallback={null}>
          <Notepad />
        </Suspense>
      )}
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
      <label className="video-room-prefs-check-row">
        <input
          type="checkbox"
          className="video-room-prefs-checkbox"
          checked={prefs.chatFileUploadsAllowed !== false}
          onChange={(e) => set({ chatFileUploadsAllowed: e.target.checked })}
        />
        <span className="video-room-prefs-check-label">Allow chat file uploads</span>
        <span
          className="video-room-prefs-info"
          title="When off, no one can attach documents in meeting chat. You can still restrict individuals in Permissions."
        >
          <Info size={15} strokeWidth={2} aria-hidden />
        </span>
      </label>
      <p className="video-room-prefs-desc">Participants can share small files (~750KB max) in the in-meeting chat when this is on.</p>

      <h3 className="video-room-prefs-heading">Video</h3>
      <div className="video-room-prefs-toggles">
        <div className="video-room-prefs-toggle-row">
          <span className="video-room-prefs-toggle-label">Host</span>
          <button
            type="button"
            role="switch"
            aria-checked={hostOn}
            aria-label={hostOn ? 'Host camera default: on' : 'Host camera default: off'}
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
            aria-label={partOn ? 'Participant camera default: on' : 'Participant camera default: off'}
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

function WaitingRoomPreviewVideo({ stream, camOn }) {
  const videoRef = useRef(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream || null
    if (stream && camOn) el.play().catch(() => {})
    return () => {
      el.srcObject = null
    }
  }, [stream, camOn])
  return (
    <video
      ref={videoRef}
      className={['video-prejoin-preview-video', !camOn && 'video-prejoin-preview-video--hidden']
        .filter(Boolean)
        .join(' ')}
      autoPlay
      playsInline
      muted
    />
  )
}

function ParticipantsRosterModal({
  isOpen,
  onClose,
  search,
  onSearchChange,
  rows,
  inRoomCount,
  menuOpenKey,
  onMenuOpenChange,
  getMenuItemsForRow,
  localIsHost,
  hostActionLoading,
  onInvite,
  onMuteAllRequest,
  onUnmuteAllRequest,
}) {
  useScrollLock(isOpen)
  if (!isOpen) return null
  return (
    <div className="video-prejoin-overlay video-roster-overlay" role="dialog" aria-modal="true" aria-labelledby="video-roster-title">
      <button type="button" className="video-prejoin-backdrop" onClick={onClose} aria-label="Close" />
      <div className="video-prejoin-modal video-roster-modal">
        <div className="video-roster-head">
          <div>
            <h2 id="video-roster-title" className="video-prejoin-title">
              Participants
            </h2>
            <p className="video-roster-sub">
              <span className="video-roster-count">{inRoomCount}</span> in this meeting
            </p>
          </div>
          <button type="button" className="video-roster-close" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={2.25} />
          </button>
        </div>
        <div className="video-roster-search-wrap">
          <Search size={18} className="video-roster-search-icon" aria-hidden />
          <input
            type="search"
            className="auth-input video-roster-search-input"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search participants"
          />
        </div>
        <ul className="video-roster-list">
          {rows.map((row) => (
            <li key={row.menuKey} className="video-roster-row">
              <VideoParticipantAvatar photoUrl={row.photoUrl} nameHint={row.displayName} className="video-roster-avatar" />
              <div className="video-roster-row-text">
                <span className="video-roster-name">{row.displayName}</span>
                {row.isLocal ? <span className="video-roster-you">You</span> : null}
              </div>
              <div className="video-roster-row-menu">
                <ParticipantTileOverflow
                  menuKey={row.menuKey}
                  openKey={menuOpenKey}
                  onOpenChange={onMenuOpenChange}
                  variant="roster"
                  items={getMenuItemsForRow(row)}
                />
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 ? <p className="video-roster-empty">No one matches your search.</p> : null}
        {localIsHost ? (
          <div className="video-roster-footer">
            <div className="video-roster-footer-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="video-roster-footer-btn"
                disabled={hostActionLoading}
                onClick={onMuteAllRequest}
              >
                Mute all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="video-roster-footer-btn"
                disabled={hostActionLoading}
                onClick={onUnmuteAllRequest}
              >
                Allow mics
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="video-roster-footer-btn video-roster-footer-btn--primary"
                disabled={hostActionLoading}
                onClick={onInvite}
              >
                Invite
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function InvitePeopleInMeetingModal({
  isOpen,
  onClose,
  orgId,
  meetingId,
  channelName,
  meetingTitle,
  userId,
  setError,
}) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [existingInviteIds, setExistingInviteIds] = useState([])
  const [banner, setBanner] = useState(null)
  const { copied: joinLinkCopied, copy: copyTextToClipboard } = useCopyFeedback(2000)

  useEffect(() => {
    if (!isOpen || !orgId || !meetingId || !userId) return undefined
    let cancelled = false
    setLoading(true)
    setSearch('')
    setSelected(new Set())
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'organizations', orgId, 'meetings', meetingId))
        const data = snap.exists() ? snap.data() : {}
        const existing = Array.isArray(data.invitedUserIds) ? data.invitedUserIds : []
        if (!cancelled) setExistingInviteIds([...existing])
        const raw = await getOrgMembers(orgId)
        const active = raw.filter(
          (m) => m.state === MEMBERSHIP_STATES.active && m.userId && m.userId !== userId
        )
        const profiles = {}
        await Promise.all(
          active.map(async (m) => {
            try {
              profiles[m.userId] = await getUserDoc(m.userId)
            } catch {
              profiles[m.userId] = null
            }
          })
        )
        if (!cancelled) setMembers(active.map((m) => ({ userId: m.userId, profile: profiles[m.userId] })))
      } catch {
        if (!cancelled) setMembers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, orgId, meetingId, userId])

  const joinUrl =
    typeof window !== 'undefined' && orgId && meetingId
      ? `${window.location.origin}/app/org/${encodeURIComponent(orgId)}/video?meetingId=${encodeURIComponent(meetingId)}`
      : ''

  const copyJoinLink = async () => {
    if (!joinUrl) {
      setBanner({ type: 'err', text: 'No shareable link for this meeting.' })
      return
    }
    setBanner(null)
    const ok = await copyTextToClipboard(joinUrl)
    if (ok) {
      setBanner({ type: 'ok', text: 'Link copied to clipboard.' })
      window.setTimeout(() => setBanner(null), 3500)
    } else {
      setBanner({ type: 'err', text: 'Could not copy. Select the link and copy manually.' })
    }
  }

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(({ userId: uid, profile }) =>
      getDisplayName(profile, uid).toLowerCase().includes(q)
    )
  }, [members, search])

  const toggleUid = (uid) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const handleNotify = async () => {
    if (!orgId || !meetingId || !userId || selected.size === 0) return
    const add = [...selected]
    const newlyInvited = add.filter((id) => !existingInviteIds.includes(id))
    if (newlyInvited.length === 0) {
      setBanner({
        type: 'err',
        text: 'Everyone selected is already on the invite list. Choose others or copy the join link.',
      })
      window.setTimeout(() => setBanner(null), 5000)
      return
    }
    setSaving(true)
    setBanner(null)
    try {
      const merged = [...new Set([...existingInviteIds, ...add])]
      await updateMeeting(orgId, meetingId, userId, { invitedUserIds: merged })
      setBanner({ type: 'ok', text: `Notified ${newlyInvited.length} teammate(s). They’ll see a bell invitation.` })
      setExistingInviteIds(merged)
      setSelected(new Set())
      window.setTimeout(() => onClose(), 1200)
    } catch (e) {
      const msg = e?.message || 'Could not update invites.'
      setBanner({ type: 'err', text: msg })
      setError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  useScrollLock(isOpen)
  if (!isOpen) return null

  const canNotify = Boolean(orgId && meetingId && userId)

  return (
    <div className="video-prejoin-overlay" role="dialog" aria-modal="true" aria-labelledby="invite-in-meeting-title">
      <button type="button" className="video-prejoin-backdrop" onClick={() => !saving && onClose()} aria-label="Close" />
      <div className="video-prejoin-modal video-invite-in-meeting-modal video-invite-in-meeting-modal--enterprise">
        <h2 id="invite-in-meeting-title" className="video-prejoin-title video-invite-enterprise-title">
          Invite people
        </h2>
        {meetingTitle ? <p className="video-invite-enterprise-meeting-name">{meetingTitle}</p> : null}
        <p className="video-prejoin-sub video-invite-enterprise-desc">
          Copy the join link for email or chat, or notify teammates in Notus (bell + in-app link).
        </p>
        {banner && (
          <p
            className={[
              'video-invite-banner',
              banner.type === 'ok' ? 'video-invite-banner--ok' : 'video-invite-banner--err',
            ]
              .filter(Boolean)
              .join(' ')}
            role="status"
          >
            {banner.text}
          </p>
        )}
        {joinUrl ? (
          <div className="video-invite-link-block">
            <span className="video-invite-link-label">Join link</span>
            <div className="video-invite-link-input-row">
              <input
                type="text"
                readOnly
                className="auth-input video-invite-link-input"
                value={joinUrl}
                aria-label="Meeting join URL"
                onFocus={(e) => e.target.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={joinLinkCopied ? 'video-invite-link-copy-btn video-invite-link-copy-btn--done' : 'video-invite-link-copy-btn'}
                onClick={() => void copyJoinLink()}
                aria-label={joinLinkCopied ? 'Link copied' : 'Copy join link'}
              >
                {joinLinkCopied ? (
                  <>
                    <Check size={16} strokeWidth={2.5} aria-hidden />
                    <span>Copied</span>
                  </>
                ) : (
                  'Copy'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <p className="video-prejoin-sub video-invite-unavailable">
            This session has no calendar meeting id, so a web link can&apos;t be built. Use{' '}
            <strong>Meeting information</strong> to share the meeting ID, or schedule a video event from the calendar.
            {channelName ? (
              <>
                {' '}
                Room: <code className="video-invite-room-code">{channelName}</code>
              </>
            ) : null}
          </p>
        )}
        {canNotify ? (
          <>
            <div className="video-invite-divider" />
            <span className="video-invite-section-label">Notify organization members</span>
            <div className="video-roster-search-wrap video-invite-search">
              <Search size={18} className="video-roster-search-icon" aria-hidden />
              <input
                type="search"
                className="auth-input video-roster-search-input"
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search members"
              />
            </div>
            <div className="video-new-meeting-invite-scroll video-invite-member-scroll">
              {loading ? (
                <p className="video-prejoin-sub">Loading members…</p>
              ) : filteredMembers.length === 0 ? (
                <p className="video-prejoin-sub">No members match your search.</p>
              ) : (
                <ul className="video-new-meeting-invite-list video-invite-member-list">
                  {filteredMembers.map(({ userId: uid, profile }) => (
                    <li key={uid}>
                      <label className="video-new-meeting-invite-row video-invite-member-row">
                        <input type="checkbox" checked={selected.has(uid)} onChange={() => toggleUid(uid)} />
                        <VideoParticipantAvatar
                          photoUrl={getProfilePictureUrl(profile)}
                          nameHint={getDisplayName(profile, uid)}
                          className="video-invite-member-avatar"
                        />
                        <span className="video-invite-member-name">{getDisplayName(profile, uid)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p className="video-prejoin-sub video-invite-unavailable">
            In-app notifications need an organization meeting. Instant rooms without a saved meeting id can still use the
            link above when available.
          </p>
        )}
        <div className="video-prejoin-footer video-invite-footer">
          <Button type="button" variant="ghost" onClick={() => !saving && onClose()} disabled={saving}>
            {saving ? 'Please wait…' : 'Close'}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleNotify()}
            disabled={saving || !canNotify || selected.size === 0}
          >
            {saving ? 'Sending…' : 'Send invites'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function NewMeetingSettingsModal({
  isOpen,
  onClose,
  titleValue,
  onTitleChange,
  bioValue,
  onBioChange,
  visibility,
  onVisibilityChange,
  teams,
  teamId,
  onTeamIdChange,
  members,
  membersLoading,
  membersError,
  inviteeIds,
  onInviteeIdsChange,
  onContinue,
  orgOptions,
  selectedOrgId,
  onOrgChange,
  orgNotify,
  onOrgNotifyChange,
  teamNotify,
  onTeamNotifyChange,
  teamPickMembers,
  teamPickMembersLoading,
}) {
  useScrollLock(isOpen)
  if (!isOpen) return null
  return (
    <div className="video-prejoin-overlay" role="dialog" aria-modal="true" aria-labelledby="new-meeting-settings-title">
      <button type="button" className="video-prejoin-backdrop" onClick={onClose} aria-label="Close" />
      <div className="video-prejoin-modal video-new-meeting-settings-modal video-new-meeting-settings-modal--wide">
        <header className="video-new-meeting-shell-header">
          <h2 id="new-meeting-settings-title" className="video-new-meeting-shell-title">
            New meeting
          </h2>
          <p className="video-new-meeting-shell-lead">
            Set the title and who can join. You&apos;ll confirm camera and microphone on the next step.
          </p>
        </header>

        <div className="video-new-meeting-layout">
          <div className="video-new-meeting-layout__col video-new-meeting-layout__col--details">
            <p className="video-new-meeting-section-kicker">Meeting details</p>
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
            <label className="video-new-meeting-field">
              <span className="video-new-meeting-field-label">Description / agenda</span>
              <textarea
                className="auth-input video-new-meeting-bio"
                value={bioValue}
                onChange={(e) => onBioChange(e.target.value)}
                placeholder="Optional context for attendees…"
                rows={4}
              />
            </label>
          </div>

          <div className="video-new-meeting-layout__col video-new-meeting-layout__col--access">
            <p className="video-new-meeting-section-kicker">Access &amp; notifications</p>
            <fieldset className="video-new-meeting-fieldset video-new-meeting-fieldset--card video-new-meeting-fieldset--flush">
              <legend className="video-new-meeting-fieldset-legend">Who can see &amp; join</legend>
          <label className="video-new-meeting-radio">
            <input
              type="radio"
              name="nm-vis"
              checked={visibility === 'org'}
              onChange={() => {
                onVisibilityChange('org')
                onOrgNotifyChange('everyone')
              }}
            />
            <span>
              <strong>Organization</strong>: Anyone in the org who can access the org calendar can see and join.
            </span>
          </label>
          {visibility === 'org' && (
            <div className="video-new-meeting-notify-block">
              <span className="video-new-meeting-field-label video-new-meeting-field-label--inline">Bell notifications</span>
              <label className="video-new-meeting-radio video-new-meeting-radio--compact">
                <input
                  type="radio"
                  name="nm-org-notify"
                  checked={orgNotify === 'everyone'}
                  onChange={() => onOrgNotifyChange('everyone')}
                />
                <span>Everyone in the organization (except you)</span>
              </label>
              <label className="video-new-meeting-radio video-new-meeting-radio--compact">
                <input
                  type="radio"
                  name="nm-org-notify"
                  checked={orgNotify === 'none'}
                  onChange={() => onOrgNotifyChange('none')}
                />
                <span>Don&apos;t send notifications</span>
              </label>
            </div>
          )}
          <label className="video-new-meeting-radio">
            <input
              type="radio"
              name="nm-vis"
              checked={visibility === 'team'}
              onChange={() => {
                onVisibilityChange('team')
                onTeamNotifyChange('everyone')
              }}
              disabled={!teams?.length}
            />
            <span>
              <strong>Team</strong>: Only members of the selected team (with team calendar access).
            </span>
          </label>
          {visibility === 'team' && (
            <div className="video-new-meeting-scope-stack">
              <select
                className="auth-input video-new-meeting-org-select video-new-meeting-org-select--flush"
                value={teamId || ''}
                onChange={(e) => onTeamIdChange(e.target.value)}
              >
                <option value="">Select team</option>
                {(teams || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="video-new-meeting-notify-block">
                <span className="video-new-meeting-field-label video-new-meeting-field-label--inline">Bell notifications</span>
                <label className="video-new-meeting-radio video-new-meeting-radio--compact">
                  <input
                    type="radio"
                    name="nm-team-notify"
                    checked={teamNotify === 'everyone'}
                    onChange={() => onTeamNotifyChange('everyone')}
                  />
                  <span>Everyone on this team (except you)</span>
                </label>
                <label className="video-new-meeting-radio video-new-meeting-radio--compact">
                  <input
                    type="radio"
                    name="nm-team-notify"
                    checked={teamNotify === 'none'}
                    onChange={() => onTeamNotifyChange('none')}
                  />
                  <span>Don&apos;t send notifications</span>
                </label>
                <label className="video-new-meeting-radio video-new-meeting-radio--compact">
                  <input
                    type="radio"
                    name="nm-team-notify"
                    checked={teamNotify === 'pick'}
                    onChange={() => onTeamNotifyChange('pick')}
                  />
                  <span>Only selected people on the team</span>
                </label>
              </div>
              {teamNotify === 'pick' && teamId ? (
                <div className="video-new-meeting-invite-block video-new-meeting-invite-block--tight">
                  <span className="video-new-meeting-field-label">Choose people to notify</span>
                  <div className="video-new-meeting-invite-scroll">
                    {teamPickMembersLoading ? (
                      <p className="video-prejoin-sub">Loading team…</p>
                    ) : (
                      <ul className="video-new-meeting-invite-list">
                        {(teamPickMembers || []).map(({ userId: uid, profile }) => (
                          <li key={uid}>
                            <label className="video-new-meeting-invite-row">
                              <input
                                type="checkbox"
                                checked={inviteeIds.includes(uid)}
                                onChange={() =>
                                  onInviteeIdsChange((prev) =>
                                    prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
                                  )
                                }
                              />
                              <span>{getDisplayName(profile, uid)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <label className="video-new-meeting-radio">
            <input
              type="radio"
              name="nm-vis"
              checked={visibility === 'invited'}
              onChange={() => onVisibilityChange('invited')}
            />
            <span>
              <strong>Invite-only</strong>: Only selected people can see this meeting; they receive a notification.
            </span>
          </label>
            </fieldset>
          </div>

          {visibility === 'invited' ? (
            <div className="video-new-meeting-layout__full">
              <div className="video-new-meeting-invite-block video-new-meeting-invite-block--panel">
                <span className="video-new-meeting-field-label">Who can join</span>
                <div className="video-new-meeting-invite-scroll video-new-meeting-invite-scroll--tall">
                  {membersLoading ? (
                    <p className="video-prejoin-sub">Loading…</p>
                  ) : membersError ? (
                    <p className="auth-error video-new-meeting-members-error">{membersError}</p>
                  ) : (members || []).length === 0 ? (
                    <p className="video-prejoin-sub">
                      No other members to invite in this organization yet, or your account is the only active member.
                    </p>
                  ) : (
                    <ul className="video-new-meeting-invite-list">
                      {(members || []).map(({ userId: uid, profile }) => (
                        <li key={uid}>
                          <label className="video-new-meeting-invite-row">
                            <input
                              type="checkbox"
                              checked={inviteeIds.includes(uid)}
                              onChange={() =>
                                onInviteeIdsChange((prev) =>
                                  prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
                                )
                              }
                            />
                            <span>{getDisplayName(profile, uid)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="video-prejoin-footer video-new-meeting-footer">
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
  confirmLabel,
  loading,
  onConfirm,
  error,
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

  useScrollLock(isOpen)
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
              <p>{!micOn && !camOn ? 'Microphone and camera off' : 'Camera off'}</p>
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
        {error ? <p className="auth-error video-prejoin-join-error">{error}</p> : null}
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

function VideoParticipantLabel({ name, micOn, showHost, raisedHand, className }) {
  return (
    <div className={['video-player-label', className].filter(Boolean).join(' ')}>
      {showHost ? (
        <span className="video-player-label-host" title="Meeting host">
          Host
        </span>
      ) : null}
      <span className="video-player-label-text">{name}</span>
      {raisedHand ? (
        <span className="video-player-label-hand" title="Raised hand" aria-label="Raised hand">
          <Hand size={15} strokeWidth={2.25} />
        </span>
      ) : null}
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

/**
 * Agora LocalVideoTrack.play() may reject with AbortError when a new play starts before the
 * previous one finishes (benign; see goo.gl/LdLk22). SDK may still log a warning before rejecting.
 */
function playAgoraVideoInContainer(track, containerEl) {
  if (!track || !containerEl) return
  try {
    const ret = track.play(containerEl)
    if (ret != null && typeof ret.then === 'function') {
      void ret.catch(() => {
        /* AbortError / interrupted play  -  ignore */
      })
    }
  } catch {
    /* ignore */
  }
}

/** Double rAF defers play until after React layout/paint so play() is less often interrupted. */
function scheduleAgoraVideoPlay(track, getContainerEl) {
  let cancelled = false
  let raf1 = 0
  let raf2 = 0
  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => {
      if (cancelled) return
      const el = getContainerEl()
      if (!el?.isConnected) return
      playAgoraVideoInContainer(track, el)
    })
  })
  return () => {
    cancelled = true
    cancelAnimationFrame(raf1)
    cancelAnimationFrame(raf2)
  }
}

function LocalVideoTrack({ track, camOn, photoUrl, nameHint }) {
  const containerRef = useRef(null)
  useLayoutEffect(() => {
    if (!track) return undefined
    const cancelSchedule = scheduleAgoraVideoPlay(track, () => containerRef.current)
    return () => {
      cancelSchedule()
      try {
        track.stop()
      } catch {
        /* ignore */
      }
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

function RemoteVideoPlayer({ user, displayName, photoUrl, isHost, mode = 'tile', stageLabel, raisedHand }) {
  const containerRef = useRef(null)
  const videoTrack = user?.videoTrack
  useLayoutEffect(() => {
    if (!videoTrack) return undefined
    const cancelSchedule = scheduleAgoraVideoPlay(videoTrack, () => containerRef.current)
    return () => {
      cancelSchedule()
      try {
        videoTrack.stop()
      } catch {
        /* ignore */
      }
    }
  }, [videoTrack])

  const label = stageLabel || displayName || `User ${user.uid}`
  const hasRemoteVideo = !!(user?.videoTrack && user?.hasVideo && !user.videoTrack.muted)
  const camOn = hasRemoteVideo
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
        raisedHand={raisedHand}
        className={mode === 'stage' ? 'video-player-label--on-stage' : mode === 'filmstrip' ? 'video-player-label--filmstrip' : undefined}
      />
      <div className="video-player-stack">
        {user?.videoTrack ? (
          <div
            ref={containerRef}
            className={`video-track-container ${!camOn ? 'video-track-hidden' : ''}`}
            style={{ width: '100%', height: '100%' }}
          />
        ) : null}
        {!camOn && (
          <VideoParticipantAvatar photoUrl={photoUrl} nameHint={label} className="video-participant-avatar--cover" />
        )}
      </div>
    </div>
  )
}

function meetingChatMessageVisible(msg, thread, myUid) {
  if (!myUid) return false
  const aud = msg.audienceType || 'everyone'
  if (thread.kind === 'everyone') return aud !== 'direct'
  if (!thread.peerId) return false
  if (aud !== 'direct') return false
  return (
    (msg.senderId === myUid && msg.recipientId === thread.peerId) ||
    (msg.senderId === thread.peerId && msg.recipientId === myUid)
  )
}

function readMeetingChatFileAsPayload(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const result = r.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'))
        return
      }
      const i = result.indexOf(',')
      resolve({
        data: i >= 0 ? result.slice(i + 1) : result,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name || 'file',
        size: file.size,
      })
    }
    r.onerror = () => reject(new Error('Could not read file'))
    r.readAsDataURL(file)
  })
}

function VideoCallChat({
  channelName,
  user,
  omitHeader,
  messages,
  participantMeta,
  localPhotoUrl,
  localIsHost,
  meetingHostUid,
  dmRecipients,
  fileUploadAllowed,
}) {
  const myUid = user?.uid
  const [viewMode, setViewMode] = useState('everyone')
  const [directPeerId, setDirectPeerId] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const [audMenuOpen, setAudMenuOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [messageContextMsg, setMessageContextMsg] = useState(null)
  const bottomRef = useRef(null)
  const audMenuRef = useRef(null)
  const fileInputRef = useRef(null)

  const activeThread = useMemo(
    () => (viewMode === 'everyone' ? { kind: 'everyone' } : { kind: 'direct', peerId: directPeerId }),
    [viewMode, directPeerId]
  )

  const filteredMessages = useMemo(() => {
    if (!myUid) return []
    return messages.filter((m) => meetingChatMessageVisible(m, activeThread, myUid))
  }, [messages, activeThread, myUid])

  const directPeerLabel = useMemo(() => {
    if (!directPeerId) return ''
    return dmRecipients.find((r) => r.id === directPeerId)?.label || 'Participant'
  }, [directPeerId, dmRecipients])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredMessages.length, viewMode, directPeerId])

  useEffect(() => {
    if (!audMenuOpen) return
    const onDown = (e) => {
      if (audMenuRef.current && !audMenuRef.current.contains(e.target)) setAudMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [audMenuOpen])

  const pickAudience = (mode, peerId = '') => {
    setViewMode(mode)
    setDirectPeerId(peerId)
    setAudMenuOpen(false)
  }

  const resolveSenderMeta = useCallback((msg) => {
    const fallbackName = msg?.senderName || 'Member'
    if (!msg?.senderId) return { name: fallbackName, photoUrl: null }
    if (msg.senderId === user?.uid) return { name: 'You', photoUrl: localPhotoUrl || null }
    const row = Object.values(participantMeta || {}).find((m) => m?.firebaseUid === msg.senderId) || null
    return { name: row?.displayName || fallbackName, photoUrl: row?.photoUrl || null }
  }, [participantMeta, user?.uid, localPhotoUrl])

  const messageTimeLabel = useCallback((msg) => {
    const ms = firestoreTimeToMs(msg?.createdAt)
    if (!ms) return ''
    try {
      return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }, [])

  const handleComposerKeyDown = (e) => {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return
    e.preventDefault()
    if (!canSend || sending) return
    handleSend(e)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!channelName || !myUid || sending) return
    const text = input.trim()
    if (!text && !pendingFile) return
    if (viewMode === 'direct' && !directPeerId) {
      setChatError('Select a recipient before sending a direct message.')
      return
    }
    if (pendingFile && !fileUploadAllowed) {
      setChatError('File uploads are not allowed for you in this meeting.')
      return
    }
    setSending(true)
    setChatError('')
    try {
      let attachment
      if (pendingFile) {
        const payload = await readMeetingChatFileAsPayload(pendingFile)
        if (payload.size > MAX_FILE_BYTES) {
          throw new Error('File is too large for in-meeting chat (max ~750KB).')
        }
        attachment = {
          type: 'document',
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          data: payload.data,
          size: payload.size,
        }
      }
      await sendMeetingChatMessage(channelName, user, {
        text: text || (pendingFile ? `Sent ${pendingFile.name}` : ''),
        audienceType: viewMode === 'direct' ? 'direct' : 'everyone',
        recipientId: viewMode === 'direct' ? directPeerId : undefined,
        attachment,
        replyTo: replyTo
          ? {
            msgId: replyTo.id,
            senderId: replyTo.senderId,
            senderName: replyTo.senderName,
            text: replyTo.text,
            attachmentType: replyTo.attachment?.type || '',
            attachmentName: replyTo.attachment?.fileName || '',
          }
          : null,
      })
      setInput('')
      setPendingFile(null)
      setReplyTo(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setChatError(err?.message || 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  const onPickFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!fileUploadAllowed) {
      setChatError('File uploads are not allowed for you in this meeting.')
      return
    }
    setPendingFile(f)
    setChatError('')
  }

  const voteOnPoll = async (messageId, optionIndex) => {
    setChatError('')
    try {
      await voteMeetingPoll(channelName, messageId, myUid, optionIndex)
    } catch (err) {
      setChatError(err?.message || 'Could not record vote.')
    }
  }

  const hostEndPoll = async (messageId) => {
    setChatError('')
    try {
      await endMeetingPoll(channelName, messageId, myUid, meetingHostUid)
    } catch (err) {
      setChatError(err?.message || 'Could not end poll.')
    }
  }

  const canSend = (input.trim() || pendingFile) && (viewMode !== 'direct' || !!directPeerId)

  return (
    <div className={['video-zoom-chat', omitHeader && 'video-zoom-chat--embedded'].filter(Boolean).join(' ')}>
      {!omitHeader && <div className="video-zoom-chat__title">Meeting chat</div>}
      <div className="video-zoom-chat__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'everyone'}
          className={['video-zoom-chat__tab', viewMode === 'everyone' && 'video-zoom-chat__tab--active']
            .filter(Boolean)
            .join(' ')}
          onClick={() => pickAudience('everyone')}
        >
          <Users size={18} strokeWidth={2.25} aria-hidden />
          <span>Everyone</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'direct'}
          className={['video-zoom-chat__tab', viewMode === 'direct' && 'video-zoom-chat__tab--active']
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            setViewMode('direct')
            setAudMenuOpen(false)
            if (!directPeerId && dmRecipients.length === 1) setDirectPeerId(dmRecipients[0].id)
          }}
          title="Private message"
        >
          <UserPlus size={18} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {viewMode === 'direct' && (
        <div className="video-zoom-chat__dm-bar">
          <label className="video-zoom-chat__dm-label" htmlFor="video-zoom-dm-select">
            Message
          </label>
          <select
            id="video-zoom-dm-select"
            className="video-zoom-chat__dm-select auth-input"
            value={directPeerId}
            onChange={(e) => setDirectPeerId(e.target.value)}
          >
            <option value="">Select a person…</option>
            {dmRecipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="video-zoom-chat__scroll">
        <p className="video-zoom-chat__day">Today</p>
        {viewMode === 'everyone' && (
          <p className="video-zoom-chat__system">
            Messages sent to everyone are visible to all participants in this room. You can also message someone
            privately from the + tab.
          </p>
        )}
        {viewMode === 'direct' && !directPeerId && (
          <p className="video-zoom-chat__system">Pick a person above to see your direct thread.</p>
        )}
        {chatError && <p className="video-chat-error video-zoom-chat__error">{chatError}</p>}
        {filteredMessages.map((msg) => {
          const own = msg.senderId === myUid
          const att = msg.attachment
          const isPoll = att?.type === 'poll'
          const isDoc = att?.type === 'document'
          const sender = resolveSenderMeta(msg)
          const ts = messageTimeLabel(msg)
          const dmTag =
            msg.audienceType === 'direct'
              ? own
                ? `To ${dmRecipients.find((r) => r.id === msg.recipientId)?.label || 'participant'}`
                : `From ${msg.senderName || 'Member'}`
              : null
          return (
            <div
              key={msg.id}
              className={['video-zoom-chat__msg', own && 'video-zoom-chat__msg--own'].filter(Boolean).join(' ')}
            >
              <div className="video-zoom-chat__row">
                {!own && (
                  <div className="video-zoom-chat__avatar" title={sender.name || 'Member'}>
                    <VideoParticipantAvatar photoUrl={sender.photoUrl} nameHint={sender.name} />
                  </div>
                )}
                <div className={['video-zoom-chat__bubble-wrap', own && 'video-zoom-chat__bubble-wrap--own'].filter(Boolean).join(' ')}>
                  <div className="video-zoom-chat__bubble-top">
                    <span className="video-zoom-chat__sender">{own ? 'You' : (sender.name || 'Member')}</span>
                    {dmTag && <span className="video-zoom-chat__dm-tag">{dmTag}</span>}
                  </div>
                  <div className={['video-zoom-chat__bubble', own && 'video-zoom-chat__bubble--own'].filter(Boolean).join(' ')}>
                    {msg.replyTo?.msgId && (
                      <div className="video-zoom-chat__reply">
                        <span className="video-zoom-chat__reply-name">{msg.replyTo.senderName || 'Member'}</span>
                        <span className="video-zoom-chat__reply-text">
                          {(msg.replyTo.text ||
                            (msg.replyTo.attachmentType === 'document'
                              ? msg.replyTo.attachmentName
                                ? `Document: ${msg.replyTo.attachmentName}`
                                : 'Document'
                              : msg.replyTo.attachmentType === 'poll'
                                ? 'Poll'
                                : msg.replyTo.attachmentType === 'image'
                                  ? 'Image'
                                  : '') ||
                            '').slice(0, 90)}
                          {((msg.replyTo.text ||
                            (msg.replyTo.attachmentType === 'document'
                              ? msg.replyTo.attachmentName
                                ? `Document: ${msg.replyTo.attachmentName}`
                                : 'Document'
                              : msg.replyTo.attachmentType === 'poll'
                                ? 'Poll'
                                : msg.replyTo.attachmentType === 'image'
                                  ? 'Image'
                                  : '') ||
                            '')).length > 90 ? '…' : ''}
                        </span>
                      </div>
                    )}
                    {isPoll ? (
                      <div className="video-zoom-chat__poll">
                        <p className="video-zoom-chat__poll-q">{att.question}</p>
                        <ul className="video-zoom-chat__poll-options">
                          {(att.options || []).map((opt, idx) => {
                            const label = typeof opt === 'string' ? opt : opt.text || ''
                            const votes = Array.isArray(opt?.votes) ? opt.votes : []
                            const picked = votes.includes(myUid)
                            const ended = !!att.ended
                            return (
                              <li key={idx}>
                                <button
                                  type="button"
                                  className={[
                                    'video-zoom-chat__poll-opt',
                                    picked && 'video-zoom-chat__poll-opt--picked',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  disabled={ended || sending}
                                  onClick={() => voteOnPoll(msg.id, idx)}
                                >
                                  <span>{label}</span>
                                  <span className="video-zoom-chat__poll-count">{votes.length}</span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                        {ended && <p className="video-zoom-chat__poll-ended">Poll ended</p>}
                        {localIsHost && meetingHostUid && myUid === meetingHostUid && !ended && (
                          <button type="button" className="video-zoom-chat__poll-end" onClick={() => hostEndPoll(msg.id)}>
                            End poll
                          </button>
                        )}
                      </div>
                    ) : isDoc ? (
                      <a
                        className="video-zoom-chat__doc-bubble"
                        href={`data:${att.mimeType || 'application/octet-stream'};base64,${att.data || ''}`}
                        download={att.fileName || 'download'}
                      >
                        <span className="video-zoom-chat__doc-ic" aria-hidden>
                          <FileText size={18} strokeWidth={2.25} />
                        </span>
                        <span className="video-zoom-chat__doc-meta">
                          <span className="video-zoom-chat__doc-name">{att.fileName || 'Document'}</span>
                          <span className="video-zoom-chat__doc-sub">Download</span>
                        </span>
                      </a>
                    ) : (
                      msg.text ? <p className="video-zoom-chat__text">{msg.text}</p> : null
                    )}
                    <div className="video-zoom-chat__bubble-footer">
                      {ts && <span className="video-zoom-chat__time">{ts}</span>}
                      <button
                        type="button"
                        className="video-zoom-chat__more"
                        onClick={(e) => { e.stopPropagation(); setMessageContextMsg(msg) }}
                        aria-label="Message options"
                        title="Message options"
                      >
                        <MoreVertical size={16} strokeWidth={2.25} aria-hidden />
                      </button>
                    </div>
                  </div>
                  {(msg.reactions && Object.keys(msg.reactions).length > 0) && (
                    <div className="video-zoom-chat__reactions">
                      {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                        <button
                          key={`${msg.id}-${emoji}`}
                          type="button"
                          className={['video-zoom-chat__reaction-pill', (userIds || []).includes(user?.uid) && 'video-zoom-chat__reaction-pill--own']
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => toggleMeetingChatReaction(channelName, msg.id, user?.uid, emoji).catch(() => {})}
                          title={`${emoji} ${(userIds || []).length}`}
                        >
                          <span>{emoji}</span>
                          {(userIds || []).length > 1 && <span className="video-zoom-chat__reaction-count">{(userIds || []).length}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {own && (
                  <div className="video-zoom-chat__avatar video-zoom-chat__avatar--own" title="You">
                    <VideoParticipantAvatar photoUrl={localPhotoUrl} nameHint="You" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form className="video-zoom-chat__composer" onSubmit={handleSend}>
        {replyTo && (
          <div className="video-zoom-chat__replying">
            <span className="video-zoom-chat__replying-label">
              Replying to {replyTo.senderId === user?.uid ? 'your message' : (replyTo.senderName || 'Member')}
            </span>
            <span className="video-zoom-chat__replying-text">
              {((replyTo.text || (replyTo.attachment?.type === 'document' ? replyTo.attachment?.fileName || 'Document' : replyTo.attachment?.type === 'poll' ? 'Poll' : replyTo.attachment?.type === 'image' ? 'Image' : '')) || '').slice(0, 72)}
              {((replyTo.text || (replyTo.attachment?.type === 'document' ? replyTo.attachment?.fileName || 'Document' : replyTo.attachment?.type === 'poll' ? 'Poll' : replyTo.attachment?.type === 'image' ? 'Image' : '')) || '').length > 72 ? '…' : ''}
            </span>
            <button type="button" className="video-zoom-chat__replying-dismiss" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X size={16} strokeWidth={2.25} />
            </button>
          </div>
        )}
        <div className="video-zoom-chat__audience-wrap" ref={audMenuRef}>
          <button
            type="button"
            className="video-zoom-chat__audience-btn"
            onClick={() => setAudMenuOpen((o) => !o)}
            aria-expanded={audMenuOpen}
          >
            <span className="video-zoom-chat__audience-dot" aria-hidden />
            <span className="video-zoom-chat__audience-label">Who can see your messages?</span>
            <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
          </button>
          {audMenuOpen && (
            <div className="video-zoom-chat__audience-menu" role="menu">
              <button type="button" role="menuitem" className="video-zoom-chat__audience-item" onClick={() => pickAudience('everyone')}>
                Everyone
              </button>
              {dmRecipients.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="menuitem"
                  className="video-zoom-chat__audience-item"
                  onClick={() => pickAudience('direct', r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <textarea
          className="video-zoom-chat__textarea"
          placeholder={
            viewMode === 'everyone'
              ? 'Message everyone'
              : directPeerId
                ? `Message ${directPeerLabel}`
                : 'Select a recipient to start a direct message'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          disabled={sending}
          rows={3}
        />
        {pendingFile && (
          <p className="video-zoom-chat__pending-file">
            <Paperclip size={14} strokeWidth={2.25} aria-hidden /> {pendingFile.name}
            <button type="button" className="video-zoom-chat__pending-clear" onClick={() => setPendingFile(null)}>
              Remove
            </button>
          </p>
        )}
        <div className="video-zoom-chat__composer-bar">
          <div className="video-zoom-chat__composer-tools">
            <input ref={fileInputRef} type="file" className="video-zoom-chat__file-input" onChange={onPickFile} />
            <button
              type="button"
              className="video-zoom-chat__tool-btn"
              disabled={!fileUploadAllowed || sending}
              onClick={() => fileInputRef.current?.click()}
              title={fileUploadAllowed ? 'Attach file' : 'File uploads are not allowed'}
              aria-label="Attach file"
            >
              <Paperclip size={18} strokeWidth={2.25} />
            </button>
          </div>
          <button
            type="submit"
            className={['video-zoom-chat__send', canSend && !sending && 'video-zoom-chat__send--active']
              .filter(Boolean)
              .join(' ')}
            disabled={!canSend || sending}
            aria-label="Send message"
          >
            <Send size={20} strokeWidth={2.25} />
          </button>
        </div>
      </form>
      {messageContextMsg && (
        <MessageContextMenu
          message={messageContextMsg}
          isStarred={false}
          isOwn={messageContextMsg.senderId === user?.uid}
          showForward={false}
          showStar={false}
          showDelete={false}
          onReply={() => {
            setReplyTo(messageContextMsg)
            setMessageContextMsg(null)
          }}
          onCopy={() => setMessageContextMsg(null)}
          onInfo={() => setMessageContextMsg(null)}
          onReactionSelect={(emoji) => {
            toggleMeetingChatReaction(channelName, messageContextMsg.id, user?.uid, emoji).catch(() => {})
            setMessageContextMsg(null)
          }}
          onClose={() => setMessageContextMsg(null)}
        />
      )}
    </div>
  )
}

function ParticipantTileOverflow({ menuKey, openKey, onOpenChange, variant = 'tile', items }) {
  const open = openKey === menuKey
  const sz = variant === 'filmstrip' ? 16 : 18
  const isRoster = variant === 'roster'
  const btnRef = useRef(null)
  const [portalPos, setPortalPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !isRoster || !btnRef.current) {
      setPortalPos(null)
      return
    }
    const update = () => {
      const el = btnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const w = 268
      let left = r.right - w
      left = Math.max(10, Math.min(left, window.innerWidth - w - 10))
      const rowH = 48
      let top = r.bottom + 6
      const estH = Math.min(items.length * rowH + 16, 360)
      if (top + estH > window.innerHeight - 10) {
        top = Math.max(10, r.top - estH - 6)
      }
      setPortalPos({ top, left, width: w })
    }
    update()
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [open, isRoster, items.length])

  const menuItems = items.map((it) => (
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
  ))

  const portalMenu =
    open &&
    isRoster &&
    portalPos &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="video-tile-overflow-dropdown video-tile-overflow-dropdown--portal"
        style={{
          position: 'fixed',
          top: portalPos.top,
          left: portalPos.left,
          width: portalPos.width,
        }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        {menuItems}
      </div>,
      document.body
    )

  return (
    <div
      className={[
        'video-participant-menu-root',
        variant === 'filmstrip'
          ? 'video-tile-overflow--filmstrip'
          : variant === 'roster'
            ? 'video-tile-overflow--roster'
            : 'video-tile-overflow--tile',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        ref={btnRef}
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
      {open && !isRoster && (
        <div className="video-tile-overflow-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
          {menuItems}
        </div>
      )}
      {portalMenu}
    </div>
  )
}

