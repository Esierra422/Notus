import { useState, useEffect, useRef, useCallback } from 'react'
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Notepad } from '../pages/Notepad'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import '../styles/variables.css'
import './AppLayout.css'
import './VideoCallPage.css'
import { Mic, MicOff, Video, VideoOff, MessageSquare, Bot, LogOut, NotebookPen } from 'lucide-react'

import * as videoApp from '../lib/videoAppService.js'
import { getEffectiveApiBase } from '../lib/apiConfig.js'
import { generateMeetingSummary } from '../lib/meetingSummaryService.js'
import { db } from '../lib/firebase.js'
import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
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
  return msg
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
  const channelFromUrl = searchParams.get('channel') || ''
  const [channelName, setChannelName] = useState(channelFromUrl || 'channel1')
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const [remoteUsers, setRemoteUsers] = useState([])
  const [participantNames, setParticipantNames] = useState({})
  const [chatOpen, setChatOpen] = useState(false)
  const [askMeetingOpen, setAskMeetingOpen] = useState(false)
  const [meetingQuestion, setMeetingQuestion] = useState('')
  const [meetingHistory, setMeetingHistory] = useState([])
  const [askLoading, setAskLoading] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [showNotepad, setShowNotepad] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)

  const localVideoTrackRef = useRef(null)
  const localUidRef = useRef(0)
  const transcriptionWsRef = useRef(null)
  const audioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const pcmBufferRef = useRef([])
  const transcriptionChunksSentRef = useRef(0)
  const timeoutRef = useRef(null)

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
    var cols = 1
    if(count > 1) cols = 2
    if(count > 4) cols = 3
    const rows = Math.ceil(count / cols)
    container.style.setProperty('--cols', cols)
    container.style.setProperty('--rows', rows)
  }, [remoteUsers])

  const handleMouseMove = () => {
    setControlsVisible(true)
    if(timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, 2000)
  }

  useEffect(() => {
    if (channelFromUrl) setChannelName(channelFromUrl)
  }, [channelFromUrl])

  useEffect(() => {
    setMeetingHistory([])
    setMeetingQuestion('')
  }, [channelName])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

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
        map[d.id] = d.data()?.displayName || `User ${d.id}`
      })
      setParticipantNames(map)
    }, (err) => console.warn('Participant names listener error:', err))
    return () => unsub()
  }, [joined, channelName])

  useEffect(() => {
    updateGridLayout()
  }, [remoteUsers, updateGridLayout])

  const joinChannel = async () => {
    setError('')
    setLoading(true)
    try {
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

      const { uid, audioTrack, videoTrack } = await videoApp.joinChannel(channelName)
      localUidRef.current = uid
      localVideoTrackRef.current = videoTrack

      // Transcription capture
      try {
        const CHUNK_DURATION_SEC = 15
        let wsUrl
        if (effectiveAiBase) {
          const protocol = effectiveAiBase.startsWith('https') ? 'wss' : 'ws'
          const host = new URL(effectiveAiBase).host
          wsUrl = `${protocol}://${host}/ws/transcription`
        } else {
          const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
          wsUrl = `${wsProtocol}://${window.location.host}/ws/transcription`
        }
        const ws = new WebSocket(wsUrl)
        transcriptionWsRef.current = ws
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'meta', channel: channelName, uid }))
        }
        const stream = new MediaStream([audioTrack.getMediaStreamTrack()])
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        audioContextRef.current = ctx
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
            console.log(`[Transcription] chunk RMS: ${chunkRms.toFixed(6)}, threshold: ${SPEECH_RMS_THRESHOLD}, sending: ${isFirstChunk || aboveThreshold}`)
            if (ws.readyState === WebSocket.OPEN && (isFirstChunk || aboveThreshold)) {
              const rawPcm = downsampleAndToInt16(chunk, captureRate, TARGET_SAMPLE_RATE)
              ws.send(rawPcm)
              transcriptionChunksSentRef.current += 1
            }
          }
        }

        source.connect(workletNode)
        workletNode.connect(ctx.destination)
      } catch (e) {
        console.warn('Audio capture for transcription failed:', e)
      }

      setJoined(true)

      try {
        await setDoc(doc(db, 'videoChannels', channelName, 'participants', String(uid)), {
          displayName: user?.displayName || user?.email || 'Anonymous',
          joinedAt: serverTimestamp(),
        })
      } catch (e) {
        console.warn('Could not register participant name:', e)
      }
    } catch (err) {
      setError(toFriendlyError(err) || 'Failed to join')
    } finally {
      setLoading(false)
    }
  }

  const leaveChannel = async () => {
    setLoading(true)
    const uidToRemove = localUidRef.current
    const currentChannel = channelName
    const currentParticipants = [...new Set(Object.values(participantNames))]
    await cleanup()
    setRemoteUsers([])
    setParticipantNames((prev) => {
      const next = { ...prev }
      delete next[uidToRemove]
      return next
    })
    try {
      await deleteDoc(doc(db, 'videoChannels', currentChannel, 'participants', String(uidToRemove)))
    } catch (e) {
      console.warn('Could not remove participant:', e)
    }
    setLoading(false)

    // Generate post-meeting summary
    if (effectiveAiBase && currentChannel && user?.uid) {
      setGeneratingSummary(true)
      try {
        const result = await generateMeetingSummary(
          effectiveAiBase, currentChannel, user.uid, activeOrgId || '', currentParticipants
        )
        console.log('[Summary] generate-summary response:', result)
        if (result.success && result.summaryId) {
          navigate(`/app/meeting-summary/${result.summaryId}`)
          return
        }
        if (result.error) {
          console.warn('[Summary] Server returned error:', result.error)
        }
      } catch (e) {
        console.warn('Meeting summary generation failed:', e)
      }
      setGeneratingSummary(false)
    }
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
    if(askMeetingOpen) setAskMeetingOpen(o => !o)
  }

  const toggleBot = () => {
    setAskMeetingOpen(o => !o)
    if(chatOpen) setChatOpen(o => !o)
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
        body: JSON.stringify({ channel: channelName, question: q, uid: user.uid, orgId: activeOrgId || '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
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

  return (
    <main className="app-main video-call-main">
      {generatingSummary ? (
        <div className="video-call-generating-summary">
          <div className="video-call-generating-spinner" />
          <h2>Generating meeting summary</h2>
          <p>Hang on tight, this will only take a moment...</p>
        </div>
      ) : !joined ? (
        <div className="video-call-join">
          <input
            type="text"
            placeholder="Channel name"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            className="auth-input video-call-input"
            disabled={loading}
          />
          {error && <p className="auth-error">{error}</p>}
          <Button variant="primary" onClick={joinChannel} disabled={loading}>
            {loading ? 'Joining…' : 'Join call'}
          </Button>
        </div>
      ) : (
        <div className="video-call-room" onMouseMove={handleMouseMove}>
          <div className="video-area">
            <div className="video-streams">
              <div className="video-player video-player-local" id="local-player">
                <span className="video-player-label">You</span>
                <LocalVideoTrack track={localVideoTrackRef.current} enabled={camEnabled} uid={localUidRef.current} />
              </div>

              <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={remoteUsers.map((u) => u.uid)}
                  strategy={verticalListSortingStrategy}
                >
                {remoteUsers.map((u) => (
                  <SortableRemoteVideo key={u.uid} user={u} displayName={participantNames[String(u.uid)]} />
                ))}
                </SortableContext>
              </DndContext>
            </div>

          </div>            
          <div className="video-call-controls" style={{opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none'}}>
              <Button variant={micEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleMic}>
                {micEnabled ? <Mic size={36}/> : <MicOff size={36}/>}
              </Button>
              <Button variant={camEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleCam}>
                {camEnabled ? <Video size={36}/> : <VideoOff size={36}/>}
              </Button>
            <Button variant={showNotepad ? 'primary' : 'outline'} size="sm" onClick={toggleNotepad}>
                <NotebookPen size={36}/>
            </Button>        
              <Button variant={chatOpen ? 'primary' : 'outline'} size="sm" onClick={toggleChat}>
                <MessageSquare size={36}/>
              </Button>
              <Button variant={askMeetingOpen ? 'primary' : 'outline'} size="sm" onClick={toggleBot}>
                <Bot size={36}/>
              </Button>
              <Button variant="primary" size="sm" onClick={leaveChannel} disabled={loading}>
                <LogOut size={36}/>
              </Button>
            </div>
          {chatOpen && <VideoCallChat channelName={channelName} user={user} />}
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
      )}
      <div style={{ display: showNotepad ? 'block' : 'none' }}>
        <Notepad />
      </div>
    </main>
  )
}

function LocalVideoTrack({ track, enabled, uid }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!track || !containerRef.current) return
    track.play(containerRef.current)
    return () => {
      track.stop()
    }
  }, [track])
  if (!track) return <div className="video-track-placeholder" />
  return (
    <div
      ref={containerRef}
      className={`video-track-container ${!enabled ? 'video-track-hidden' : ''}`}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

function RemoteVideoPlayer({ user, displayName }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!user?.videoTrack || !containerRef.current) return
    user.videoTrack.play(containerRef.current)
    return () => {
      user.videoTrack?.stop()
    }
  }, [user?.videoTrack])  // depend on the track itself, not the user object reference
  const label = displayName || `User ${user.uid}`
  return (
    <div className="video-player video-player-remote">
      <span className="video-player-label">{label}</span>
      <div ref={containerRef} className="video-track-container" style={{ width: '100%', height: '100%' }} />
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

function SortableRemoteVideo({ user, displayName }) {
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
      style={style}
      {...attributes}
      {...listeners}
    >
      <RemoteVideoPlayer user={user} displayName={displayName} />
    </div>
  )
}
