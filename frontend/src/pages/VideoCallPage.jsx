import { useState, useEffect, useRef, useCallback } from 'react'
import { useOutletContext, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Notepad } from '../pages/Notepad'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import '../styles/variables.css'
import './AppLayout.css'
import './VideoCallPage.css'
import { Mic, MicOff, Video, VideoOff, MessageSquare, Bot, LogOut, NotebookPen, Monitor, Shield, Captions } from 'lucide-react'

import * as videoApp from '../lib/videoAppService.js'
import { getUserDoc, getProfilePictureUrl } from '../lib/userService.js'
import { getEffectiveApiBase } from '../lib/apiConfig.js'
import { generateMeetingSummary } from '../lib/meetingSummaryService.js'
import {
  canAccessMeeting,
  createInstantMeeting,
  getMeetingTranscriptSessionId,
  getMeetingVideoRoomId,
} from '../lib/meetingService.js'
import { CreateEventModal } from '../components/calendar/CreateEventModal.jsx'
import { db } from '../lib/firebase.js'
import {
  collection,
  doc,
  getDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
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

/** RMS of Float32 samples; used to skip silent chunks (avoids Whisper "thank you for watching" etc on silence). */
function rms(samples) {
  if (!samples?.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

const SPEECH_RMS_THRESHOLD = 0.002
const TARGET_SAMPLE_RATE = 16000

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
  const [chatOpen, setChatOpen] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [askMeetingOpen, setAskMeetingOpen] = useState(false)
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
  const [localPreviewTrack, setLocalPreviewTrack] = useState(null)
  const [screenSharing, setScreenSharing] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [joinMeetingIdInput, setJoinMeetingIdInput] = useState('')
  const [joinByIdLoading, setJoinByIdLoading] = useState(false)
  const [roomAllowRemoteShare, setRoomAllowRemoteShare] = useState(true)
  const [hostPanelOpen, setHostPanelOpen] = useState(false)

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

  const effectiveAiBase = (() => {
    const u = (import.meta.env.VITE_AI_WS_URL || '').replace(/\/$/, '')
    if (u) return u
    return getEffectiveApiBase()
  })()



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
    setLocalPreviewTrack(null)
    setScreenSharing(false)
    setJoined(false)
  }, [])

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id == over.id) return

    setRemoteUsers((prev) => {
      const oldIndex = prev.findIndex((u) => u.uid === active.id)
      const newIndex = prev.findIndex((u) => u.uid === over.id)

      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const updateGridLayout = useCallback(() => {
    const container = document.querySelector('.video-streams')
    if (!container) return
    const count = remoteUsers.length + 1
    const narrow = typeof window !== 'undefined' && window.innerWidth < 640
    let cols = 1
    if (!narrow) {
      if (count > 1) cols = 2
      if (count > 4) cols = 3
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
    const orgId = searchParams.get('orgId')
    const mid = searchParams.get('meetingId')
    if (!orgId || !mid || !user?.uid) return
    let cancelled = false
    ;(async () => {
      try {
        const ref = doc(db, 'organizations', orgId, 'meetings', mid)
        const snap = await getDoc(ref)
        if (cancelled || !snap.exists()) return
        const m = { id: snap.id, ...snap.data() }
        const ok = await canAccessMeeting(m, user.uid, orgId)
        if (cancelled || !ok) return
        setSelectedMeeting(m)
        setChannelName(getMeetingVideoRoomId(m, m.orgId || orgId))
      } catch (e) {
        console.warn('Could not load meeting from link:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, user])

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

  const openPreJoinInstant = () => {
    if (!activeOrgId || !user?.uid) return
    setError('')
    setPreJoinMode('instant')
    setPreJoinMicOn(true)
    setPreJoinCamOn(true)
    setPreJoinAllowRemoteShare(true)
    setPreJoinPreviewError('')
    setPreJoinOpen(true)
  }

  const openPreJoinMeeting = () => {
    if (!selectedMeeting) {
      setError('Load a meeting first (paste a meeting ID), or use New meeting.')
      return
    }
    setError('')
    setPreJoinMode('meeting')
    setPreJoinMicOn(true)
    setPreJoinCamOn(true)
    setPreJoinAllowRemoteShare(true)
    setPreJoinPreviewError('')
    setPreJoinOpen(true)
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

  const executeJoin = async (meetingInput, { instantCreate, micOn, videoOn, allowRemoteScreenShare }) => {
    remoteEndHandledRef.current = false
    setError('')
    setLoading(true)
    try {
      let meeting = meetingInput
      if (instantCreate) {
        if (!activeOrgId || !user?.uid) {
          setError('Select an organization first.')
          return false
        }
        meeting = await createInstantMeeting(activeOrgId, user.uid)
        setSelectedMeeting(meeting)
        const orgForMeeting = meeting.orgId || activeOrgId
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
      const orgForMeeting = meeting.orgId || activeOrgId
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

      const { uid, audioTrack, videoTrack } = await videoApp.joinChannel(room, { micOn, videoOn })
      localUidRef.current = uid
      localVideoTrackRef.current = videoTrack
      setLocalPreviewTrack(videoTrack)

      // Transcription capture (only if VITE_AI_WS_URL points at FastAPI /ws/transcription)
      try {
        if (!transcriptionWsBase) {
          // Skip: avoids failed WS to Express (3001) and console spam
        } else {
        const CHUNK_DURATION_SEC = 15
        const protocol = transcriptionWsBase.startsWith('https') ? 'wss' : 'ws'
        const host = new URL(transcriptionWsBase).host
        const wsUrl = `${protocol}://${host}/ws/transcription`
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
        createdBy: meeting.createdBy || user.uid,
        transcriptSessionId: sessionId,
      })
      const media = videoApp.getMediaState()
      setMicEnabled(!media.micMuted)
      setCamEnabled(!media.videoMuted)
      setJoined(true)

      try {
        const userDoc = await getUserDoc(user.uid)
        const photoUrl = getProfilePictureUrl(userDoc, user) || null
        await setDoc(doc(db, 'videoChannels', room, 'participants', String(uid)), {
          displayName: user?.displayName || user?.email || 'Anonymous',
          photoUrl,
          firebaseUid: user.uid,
          joinedAt: serverTimestamp(),
        })
      } catch (e) {
        console.warn('Could not register participant name:', e)
      }

      try {
        const hostUid = meeting.createdBy || user.uid
        const roomStatePayload = { hostUid }
        if (user.uid === (meeting.createdBy || user.uid)) {
          roomStatePayload.allowRemoteScreenShare = allowRemoteScreenShare !== false
        }
        await setDoc(doc(db, 'videoChannels', room, 'roomState', 'current'), roomStatePayload, { merge: true })
      } catch (e) {
        console.warn('Could not init room state:', e)
      }
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
        if (!d.endedAt || remoteEndHandledRef.current) return
        if (d.endedBy === user.uid) return
        remoteEndHandledRef.current = true
        const uidToRemove = localUidRef.current
        const ch = channelName
        await cleanup()
        setJoinedMeetingMeta(null)
        setRemoteUsers([])
        setParticipantMeta({})
        setShowLeaveModal(false)
        setHostPanelOpen(false)
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

  const collectParticipantNames = () => [
    ...new Set(Object.values(participantMeta).map((m) => m.displayName).filter(Boolean)),
  ]

  const runSummaryIfConfigured = async (currentChannel, transcriptSessionId, currentParticipants) => {
    if (!effectiveAiBase || !currentChannel || !user?.uid || !transcriptSessionId) return
    setGeneratingSummary(true)
    try {
      const result = await generateMeetingSummary(effectiveAiBase, {
        channel: currentChannel,
        sessionId: transcriptSessionId,
        uid: user.uid,
        orgId: activeOrgId || '',
        participants: currentParticipants,
      })
      if (result.success && result.summaryId) {
        navigate(`/app/meeting-summary/${result.summaryId}`)
        return
      }
      if (result.error) console.warn('[Summary] Server returned error:', result.error)
    } catch (e) {
      console.warn('Meeting summary generation failed:', e)
    } finally {
      setGeneratingSummary(false)
    }
  }

  const teardownAfterCall = async () => {
    const uidToRemove = localUidRef.current
    const currentChannel = channelName
    await cleanup()
    setJoinedMeetingMeta(null)
    setRemoteUsers([])
    setParticipantMeta({})
    setHostPanelOpen(false)
    try {
      await deleteDoc(doc(db, 'videoChannels', currentChannel, 'participants', String(uidToRemove)))
    } catch (e) {
      console.warn('Could not remove participant:', e)
    }
    return { currentChannel, uidToRemove }
  }

  const leaveCallOnly = async () => {
    setShowLeaveModal(false)
    setLoading(true)
    await teardownAfterCall()
    setLoading(false)
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
        { endedAt: serverTimestamp(), endedBy: user.uid },
        { merge: true }
      )
    } catch (e) {
      console.warn('Could not signal end for all:', e)
    }
    await teardownAfterCall()
    setLoading(false)
    if (isHost) {
      await runSummaryIfConfigured(currentChannel, transcriptSessionId, currentParticipants)
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
        setLocalPreviewTrack(videoApp.getLocalVideoTrack())
        setCamEnabled(!videoApp.getMediaState().videoMuted)
      } else {
        const isHost = joinedMeetingMeta?.createdBy === user.uid
        if (!isHost && !roomAllowRemoteShare) {
          setError('The host has turned off screen sharing for participants.')
          return
        }
        const st = await videoApp.startScreenShare()
        setScreenSharing(true)
        setLocalPreviewTrack(st)
        setCamEnabled(true)
      }
    } catch (e) {
      setError(toFriendlyError(e) || 'Screen share failed.')
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

  const joinMeetingById = async () => {
    const id = joinMeetingIdInput.trim()
    if (!activeOrgId || !id || !user?.uid) return
    setJoinByIdLoading(true)
    setError('')
    try {
      const ref = doc(db, 'organizations', activeOrgId, 'meetings', id)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        setError('No meeting found with that ID in this organization.')
        return
      }
      const m = { id: snap.id, ...snap.data(), orgId: activeOrgId }
      const ok = await canAccessMeeting(m, user.uid, activeOrgId)
      if (!ok) {
        setError('You do not have access to this meeting.')
        return
      }
      if (m.isVideoMeeting === false) {
        setError('That event is not a video meeting.')
        return
      }
      setSelectedMeeting(m)
      setChannelName(getMeetingVideoRoomId(m, activeOrgId))
      setJoinMeetingIdInput('')
    } catch (e) {
      setError(e?.message || 'Could not load meeting.')
    } finally {
      setJoinByIdLoading(false)
    }
  }

  const confirmPreJoin = async () => {
    const ok = await executeJoin(preJoinMode === 'instant' ? null : selectedMeeting, {
      instantCreate: preJoinMode === 'instant',
      micOn: preJoinMicOn,
      videoOn: preJoinCamOn,
      allowRemoteScreenShare: preJoinAllowRemoteShare,
    })
    if (ok) setPreJoinOpen(false)
  }

  const toggleMic = () => {
    const muted = videoApp.toggleMic()
    setMicEnabled(!muted)
  }

  const toggleCam = () => {
    const muted = videoApp.toggleVideo()
    setCamEnabled(!muted)
  }

  const toggleNotepad = () => {
    setShowNotepad(!showNotepad)
  }

  const toggleChat = () => {
    setChatOpen(o => !o)
    if(askMeetingOpen) setAskMeetingOpen(false)
    if(transcriptOpen) setTranscriptOpen(false)
  }

  const toggleTranscript = () => {
    setTranscriptOpen(o => !o)
    if(chatOpen) setChatOpen(false)
    if(askMeetingOpen) setAskMeetingOpen(false)
  }

  const toggleBot = () => {
    setAskMeetingOpen(o => !o)
    if(chatOpen) setChatOpen(false)
    if(transcriptOpen) setTranscriptOpen(false)
  }

  const askMeeting = async () => {
    const q = meetingQuestion.trim()
    if (!q || askLoading) return
    if (!effectiveAiBase) {
      setMeetingHistory(h => [...h, { role: 'ai', text: 'No API URL configured for meeting Q&A (set VITE_API_URL or VITE_AI_WS_URL).' }])
      return
    }
    setMeetingHistory(h => [...h, { role: 'user', text: q }])
    setMeetingQuestion('')
    setAskLoading(true)
    try {
      const res = await fetch(`${effectiveAiBase}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelName,
          sessionId: joinedMeetingMeta?.transcriptSessionId || '',
          question: q,
          uid: user.uid,
          orgId: activeOrgId || '',
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

  if (!user) return null

  const localIsHost = Boolean(
    joinedMeetingMeta?.createdBy && user?.uid && joinedMeetingMeta.createdBy === user.uid
  )

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
                Start a new call with a quick preview, schedule from the calendar, or join with a meeting ID.
              </p>
            </div>
            {!activeOrgId ? (
              <p className="video-call-lobby-muted">
                Select an organization in the header, or{' '}
                <Link to="/app/organizations" className="video-call-lobby-link">
                  open Organizations
                </Link>{' '}
                to join one.
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
                      <Link to="/app/calendar?create=1" className="video-call-action-card-calendar-link">
                        Open calendar →
                      </Link>
                    </div>
                  </div>
                  <div className="video-call-action-card video-call-action-card--static">
                    <span className="video-call-action-card-kicker">ID</span>
                    <span className="video-call-action-card-title">Join meeting</span>
                    <span className="video-call-action-card-desc">Paste the meeting ID from the calendar event (Firestore document id).</span>
                    <div className="video-call-join-id-row">
                      <input
                        type="text"
                        className="auth-input video-call-join-id-input"
                        placeholder="Meeting ID"
                        value={joinMeetingIdInput}
                        onChange={(e) => setJoinMeetingIdInput(e.target.value)}
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
                  <Link to="/app/calendar" className="video-call-lobby-link">
                    calendar
                  </Link>
                  . Open an event from there to join with a link, or paste its meeting ID above.
                </p>
                <div className="video-call-previous-wrap">
                  <Link to="/app/previous-meetings" className="video-call-previous-link">
                    View previous meetings & summaries →
                  </Link>
                  <p className="video-call-lobby-hint">
                    After a call, use <strong>End for everyone</strong> as host to generate notes (when the AI backend is connected).
                  </p>
                </div>
              </>
            )}
          </div>
          {activeOrgId && user && (
            <CreateEventModal
              isOpen={scheduleModalOpen}
              onClose={() => setScheduleModalOpen(false)}
              user={user}
              activeOrgId={activeOrgId}
              defaultDate={null}
              onCreated={() => {}}
            />
          )}
          <VideoPreJoinModal
            isOpen={preJoinOpen}
            onClose={() => !loading && setPreJoinOpen(false)}
            title={
              preJoinMode === 'instant'
                ? `${user?.displayName || user?.email || 'Your'}'s meeting`
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
        <div className="video-call-room">
          <div className="video-call-room-body">
            <div className="video-call-main-column">
              <div className="video-area">
                <div
                  className={[
                    'video-streams',
                    remoteUsers.length + 1 === 1 && 'video-streams--solo',
                    remoteUsers.length + 1 === 3 && 'video-streams--triad',
                    remoteUsers.length + 1 >= 5 && 'video-streams--many',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-tile-count={remoteUsers.length + 1}
                >
                  <div className="video-streams__slot video-streams__slot--local">
                    <div className="video-player video-player-local" id="local-player">
                      <VideoParticipantLabel name="You" micOn={micEnabled} showHost={localIsHost} />
                      <LocalVideoTrack
                        track={localPreviewTrack}
                        camOn={camEnabled}
                        photoUrl={localPhotoUrl}
                        nameHint={user?.displayName || user?.email || 'You'}
                      />
                    </div>
                  </div>

                  <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext
                      items={remoteUsers.map((u) => u.uid)}
                      strategy={verticalListSortingStrategy}
                    >
                    {remoteUsers.map((u) => {
                      const meta = participantMeta[String(u.uid)]
                      const isRemoteHost = Boolean(
                        joinedMeetingMeta?.createdBy &&
                          meta?.firebaseUid &&
                          meta.firebaseUid === joinedMeetingMeta.createdBy
                      )
                      return (
                        <SortableRemoteVideo
                          key={u.uid}
                          user={u}
                          displayName={meta?.displayName}
                          photoUrl={meta?.photoUrl}
                          isHost={isRemoteHost}
                        />
                      )
                    })}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </div>
            {chatOpen && <VideoCallChat channelName={channelName} user={user} />}
            {transcriptOpen && <VideoCallTranscript channelName={channelName} />}
            {askMeetingOpen && (
          <div className="video-call-meeting-chat">
            <span className="video-call-meeting-chat-label">Ask about this meeting</span>
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
                placeholder="e.g. What is MCP?"
                value={meetingQuestion}
                onChange={(e) => setMeetingQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askMeeting()}
                disabled={askLoading || !effectiveAiBase}
              />
              <Button variant="primary" size="sm" onClick={askMeeting} disabled={askLoading || !meetingQuestion.trim() || !effectiveAiBase}>
                {askLoading ? '…' : 'Ask'}
              </Button>
            </div>
            {!effectiveAiBase && (
              <p className="video-call-meeting-chat-hint">Set VITE_API_URL or VITE_AI_WS_URL to enable meeting Q&A.</p>
            )}
          </div>
            )}
          </div>
          {joinedMeetingMeta?.createdBy === user?.uid && hostPanelOpen && (
            <div className="video-call-host-panel" role="region" aria-label="Host options">
              <span className="video-call-host-panel-label">Participant screen share</span>
              <label className="video-call-host-toggle">
                <input
                  type="checkbox"
                  checked={roomAllowRemoteShare}
                  onChange={(e) => setRemoteScreenShareAllowed(e.target.checked)}
                />
                <span>Allow others to share screen</span>
              </label>
              <button
                type="button"
                className="video-call-host-panel-dismiss"
                onClick={() => setHostPanelOpen(false)}
                aria-label="Close host options"
              >
                ×
              </button>
            </div>
          )}
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
              <Button className="video-call-control-btn" variant={chatOpen ? 'primary' : 'outline'} size="sm" onClick={toggleChat} aria-label="Chat">
                <MessageSquare size={20} strokeWidth={2.25} />
              </Button>
              <Button className="video-call-control-btn" variant={transcriptOpen ? 'primary' : 'outline'} size="sm" onClick={toggleTranscript} aria-label="Transcript">
                <Captions size={20} strokeWidth={2.25} />
              </Button>
              <Button className="video-call-control-btn" variant={askMeetingOpen ? 'primary' : 'outline'} size="sm" onClick={toggleBot} aria-label="Ask AI">
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
              {joinedMeetingMeta?.createdBy === user?.uid && (
                <Button
                  className="video-call-control-btn"
                  variant={hostPanelOpen ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setHostPanelOpen((o) => !o)}
                  aria-label="Host options"
                  aria-expanded={hostPanelOpen}
                >
                  <Shield size={20} strokeWidth={2.25} />
                </Button>
              )}
              <Button className="video-call-control-btn video-call-control-btn--leave" variant="primary" size="sm" onClick={onLeaveButtonClick} disabled={loading} aria-label="Leave call">
                <LogOut size={20} strokeWidth={2.25} />
              </Button>
            </div>
          </div>
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

function VideoParticipantLabel({ name, micOn, showHost }) {
  return (
    <div className="video-player-label">
      <span className="video-player-label-text">{name}</span>
      {showHost ? (
        <span className="video-player-label-host" title="Meeting host">
          Host
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

function RemoteVideoPlayer({ user, displayName, photoUrl, isHost }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!user?.videoTrack || !containerRef.current) return
    user.videoTrack.play(containerRef.current)
    return () => {
      user.videoTrack?.stop()
    }
  }, [user?.videoTrack])

  const label = displayName || `User ${user.uid}`
  const camOn = !!(user?.hasVideo && user?.videoTrack)
  const micOn = !!(user?.hasAudio && user?.audioTrack && !user.audioTrack.muted)

  return (
    <div className="video-player video-player-remote">
      <VideoParticipantLabel name={label} micOn={micOn} showHost={isHost} />
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

function VideoCallChat({ channelName, user }) {
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
    <div className="video-chat-panel">
      <div className="video-chat-header">In-call chat</div>
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

function VideoCallTranscript({ channelName }) {
  const [chunks, setChunks] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!channelName) return
    return onSnapshot(
      doc(db, 'meetingTranscripts', channelName),
      (snap) => {
        setChunks(snap.data()?.chunks ?? [])
      },
      (err) => console.error('Transcript listener error:', err)
    )
  }, [channelName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chunks])

  return (
    <div className="video-chat-panel">
      <div className="video-chat-header">Live Transcript</div>
      <div className="video-chat-messages">
        {chunks.map((chunk, i) => (
          <div key={i} className="video-chat-msg">
            <span className="video-chat-bubble">{chunk.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function SortableRemoteVideo({ user, displayName, photoUrl, isHost }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: user.uid })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  }

  return (
    <div
      ref={setNodeRef}
      className="video-streams__slot video-streams__slot--remote"
      style={style}
      {...attributes}
      {...listeners}
    >
      <RemoteVideoPlayer user={user} displayName={displayName} photoUrl={photoUrl} isHost={isHost} />
    </div>
  )
}
