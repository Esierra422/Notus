import { useState, useEffect, useRef, useCallback } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Notepad } from '../pages/Notepad'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import '../styles/variables.css'
import './AppLayout.css'
import './VideoCallPage.css'

import { getApiUrl, getEffectiveApiBase } from '../lib/apiConfig.js'
import { getFunctionsApp } from '../lib/firebase.js'
import { httpsCallable } from 'firebase/functions'

/** Fetch token from backend API or Firebase callable (production fallback). */
async function fetchVideoToken(channelName, uid) {
  const apiBase = getEffectiveApiBase()
  if (apiBase) {
    const url = `${getApiUrl('/api/video/token')}?channel=${encodeURIComponent(channelName)}&uid=${uid}`
    const res = await fetch(url)
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await res.json()
      if (res.ok) return data
      throw new Error(data.error || 'Failed to get token')
    }
    if (!res.ok) throw new Error(`Token request failed (${res.status})`)
    throw new Error('Server did not return JSON. Is the backend running and configured for video?')
  }
  const getAgoraToken = httpsCallable(getFunctionsApp(), 'getAgoraToken')
  const { data } = await getAgoraToken({ channel: channelName, uid })
  return data
}

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
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const AI_API_BASE = (import.meta.env.VITE_AI_WS_URL || '').replace(/\/$/, '')

/** RMS of Float32 samples; used to skip silent chunks (avoids Whisper "thank you for watching" etc on silence). */
function rms(samples) {
  if (!samples?.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

const SPEECH_RMS_THRESHOLD = 0.01
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
  //video params
  const { user, setNavExtra } = useOutletContext() || {}
  const [searchParams] = useSearchParams()
  const channelFromUrl = searchParams.get('channel') || ''
  const [channelName, setChannelName] = useState(channelFromUrl || 'channel1')
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const [remoteUsers, setRemoteUsers] = useState([])
  const [meetingQuestion, setMeetingQuestion] = useState('')
  const [meetingAnswer, setMeetingAnswer] = useState('')
  const [askLoading, setAskLoading] = useState(false)

  //notepad param
  const [showNotepad, setShowNotepad] = useState(false)

  const clientRef = useRef(null)
  const localAudioRef = useRef(null)
  const localVideoRef = useRef(null)
  const localUidRef = useRef(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const transcriptionWsRef = useRef(null)
  const audioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const pcmBufferRef = useRef([])
  const transcriptionChunksSentRef = useRef(0)
  const CHUNK_DURATION_SEC = 15



  const cleanup = useCallback(async () => {
    if (transcriptionWsRef.current) {
      try {
        transcriptionWsRef.current.close()
      } catch (e) {
        console.warn('Transcription WS close error:', e)
      }
      transcriptionWsRef.current = null
    }
    if (workletNodeRef.current && audioContextRef.current) {
      try {
        workletNodeRef.current.disconnect()
        audioContextRef.current.close()
      } catch (e) {
        console.warn('AudioContext cleanup error:', e)
      }
      workletNodeRef.current = null
      audioContextRef.current = null
    }
    pcmBufferRef.current = []
    transcriptionChunksSentRef.current = 0
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch (e) {
        console.warn('MediaRecorder stop error:', e)
      }
      mediaRecorderRef.current = null
    }
    audioChunksRef.current = []
    const client = clientRef.current
    if (!client) return
    try {
      if (localAudioRef.current) {
        localAudioRef.current.close()
        localAudioRef.current = null
      }
      if (localVideoRef.current) {
        localVideoRef.current.close()
        localVideoRef.current = null
      }
      await client.leave()
    } catch (e) {
      console.warn('Cleanup error:', e)
    }
    clientRef.current = null
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

  useEffect(() => {
    if (channelFromUrl) setChannelName(channelFromUrl)
  }, [channelFromUrl])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const joinChannel = async () => {
    setError('')
    setLoading(true)
    try {
      const uid = Math.floor(Math.random() * 100000)
      localUidRef.current = uid
      const data = await fetchVideoToken(channelName, uid)

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType)
        if (mediaType === 'video') {
          setRemoteUsers((prev) => {
            if (prev.some((u) => u.uid === user.uid)) return prev
            return [...prev, user]
          })
        }
        if (mediaType === 'audio') {
          user.audioTrack?.play()
        }
      })

      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video') {
          setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid))
        }
      })

      await client.join(data.appId, channelName, data.token, data.uid)
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks()
      localAudioRef.current = audioTrack
      localVideoRef.current = videoTrack
      await client.publish([audioTrack, videoTrack])

      // Capture local audio: 16kHz mono, 10s chunks, raw Int16 PCM over WebSocket
      // Use AI backend WS when VITE_AI_WS_URL is set; otherwise use main API host
      try {
        const aiWsBase = (import.meta.env.VITE_AI_WS_URL || '').replace(/\/$/, '')
        let wsUrl
        if (aiWsBase) {
          const protocol = aiWsBase.startsWith('https') ? 'wss' : 'ws'
          const host = new URL(aiWsBase).host
          wsUrl = `${protocol}://${host}/ws/transcription`
        } else {
          const wsProtocol = (API_BASE && API_BASE.startsWith('https')) ? 'wss' : 'ws'
          const wsHost = API_BASE ? new URL(API_BASE).host : window.location.host
          wsUrl = `${wsProtocol}://${wsHost}`
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
            const aboveThreshold = rms(chunk) >= SPEECH_RMS_THRESHOLD
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

      setRemoteUsers([])
      setJoined(true)
    } catch (err) {
      setError(toFriendlyError(err) || 'Failed to join')
    } finally {
      setLoading(false)
    }
  }

  const leaveChannel = async () => {
    setLoading(true)
    await cleanup()
    setRemoteUsers([])
    setLoading(false)
  }

  const toggleMic = async () => {
    if (!localAudioRef.current) return
    const next = !micEnabled
    await localAudioRef.current.setEnabled(next)
    setMicEnabled(next)
  }

  const toggleCam = async () => {
    if (!localVideoRef.current) return
    const next = !camEnabled
    await localVideoRef.current.setEnabled(next)
    setCamEnabled(next)
  }

  const toggleNotepad = () => {
    setShowNotepad(!showNotepad)
  }

  const askMeeting = async () => {
    const q = meetingQuestion.trim()
    if (!q || askLoading) return
    if (!AI_API_BASE) {
      setMeetingAnswer('Set VITE_AI_WS_URL in .env to use meeting Q&A.')
      return
    }
    setAskLoading(true)
    setMeetingAnswer('')
    try {
      const res = await fetch(`${AI_API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName, question: q }),
      })
      const data = await res.json().catch(() => ({}))
      setMeetingAnswer(data.answer ?? data.error ?? (res.ok ? 'No answer.' : `Error ${res.status}`))
      setMeetingQuestion('')
    } catch (e) {
      setMeetingAnswer(`Error: ${e.message}`)
    } finally {
      setAskLoading(false)
    }
  }

  if (!user) return null

  return (
    <main className="app-main video-call-main">
      <div className="video-call-header">
        <h2>Video Call</h2>
      </div>

      {!joined ? (
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
        <div className="video-call-room">
          <div className="video-streams">
            <div className="video-player video-player-local" id="local-player">
              <span className="video-player-label">You</span>
              <LocalVideoTrack track={localVideoRef.current} enabled={camEnabled} uid={localUidRef.current} />
            </div>

            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={remoteUsers.map((u) => u.uid)}
                strategy={verticalListSortingStrategy} // vertical list; change to grid if needed
              >
              {remoteUsers.map((user) => (
                <SortableRemoteVideo key={user.uid} user={user} />
              ))}
              </SortableContext>
            </DndContext>
            {/*{remoteUsers.map((user) => (
              <RemoteVideoPlayer key={user.uid} user={user} />
            ))}*/}
                
          </div>
          <div className="video-call-controls">
            <Button variant={micEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleMic}>
              {micEnabled ? 'Mic on' : 'Mic off'}
            </Button>
            <Button variant={camEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleCam}>
              {camEnabled ? 'Camera on' : 'Camera off'}
            </Button>
            <Button variant={showNotepad ? 'primary' : 'outline'} size="sm" onClick={toggleNotepad}>
              {showNotepad ? 'Notepad' : 'Notepad'}
            </Button>        
            <Button variant="primary" size="sm" onClick={leaveChannel} disabled={loading}>
              Leave
            </Button>
          </div>
          <div className="video-call-meeting-chat">
            <span className="video-call-meeting-chat-label">Ask about this meeting</span>
            <div className="video-call-meeting-chat-row">
              <input
                type="text"
                className="auth-input video-call-meeting-chat-input"
                placeholder="e.g. What is MCP?"
                value={meetingQuestion}
                onChange={(e) => setMeetingQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askMeeting()}
                disabled={askLoading || !AI_API_BASE}
              />
              <Button variant="primary" size="sm" onClick={askMeeting} disabled={askLoading || !meetingQuestion.trim() || !AI_API_BASE}>
                {askLoading ? '…' : 'Ask'}
              </Button>
            </div>
            {meetingAnswer && (
              <div className="video-call-meeting-chat-answer">{meetingAnswer}</div>
            )}
            {!AI_API_BASE && (
              <p className="video-call-meeting-chat-hint">Set VITE_AI_WS_URL to enable.</p>
            )}
          </div>
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

function RemoteVideoPlayer({ user }) {
  const containerRef = useRef(null)
  useEffect(() => {
    console.log("RemoteVideoPlayer mount", user?.uid, user?.videoTrack)
    if (!user?.videoTrack || !containerRef.current) return
    user.videoTrack.play(containerRef.current)
    return () => {
      user.videoTrack?.stop()
    }
  }, [user])
  return (
    <div className="video-player video-player-remote">
      <span className="video-player-label">User {user.uid}</span>
      <div ref={containerRef} className="video-track-container" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

function SortableRemoteVideo({ user }) {
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
      <RemoteVideoPlayer user={user} />
    </div>
  )
}
