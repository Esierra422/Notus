import { useState, useEffect, useRef, useCallback } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './VideoCallPage.css'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/** RMS of Float32 samples; used to skip silent chunks (avoids Whisper "thank you for watching" etc on silence). */
function rms(samples) {
  if (!samples?.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

const SPEECH_RMS_THRESHOLD = 0.01

/** Build a WAV file buffer from Float32 mono PCM (so every chunk is valid for Whisper). */
function float32ToWav(samples, sampleRate) {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true)   // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
  return buffer
}

export function VideoCallPage() {
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
  const CHUNK_DURATION_SEC = 3

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
      const url = API_BASE ? `${API_BASE}/api/video/token` : '/api/video/token'
      const res = await fetch(`${url}?channel=${encodeURIComponent(channelName)}&uid=${uid}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to get token')
        return
      }

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

      // Capture local audio as WAV chunks (each chunk valid for Whisper) and send over WebSocket
      try {
        const wsProtocol = (API_BASE && API_BASE.startsWith('https')) ? 'wss' : 'ws'
        const wsHost = API_BASE ? new URL(API_BASE).host : window.location.host
        const wsUrl = `${wsProtocol}://${wsHost}`
        const ws = new WebSocket(wsUrl)
        transcriptionWsRef.current = ws
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'meta', channel: channelName, uid }))
        }
        const stream = new MediaStream([audioTrack.getMediaStreamTrack()])
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        audioContextRef.current = ctx
        const sampleRate = ctx.sampleRate
        const samplesPerChunk = Math.floor(sampleRate * CHUNK_DURATION_SEC)

        const workletCode = `
          class TranscriptionProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0]
              if (!input?.[0]) return true
              const channel = input[0]
              this.port.postMessage({ samples: channel.slice(0) })
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
          while (pcmBufferRef.current.length >= samplesPerChunk) {
            const chunk = pcmBufferRef.current.splice(0, samplesPerChunk)
            if (rms(chunk) >= SPEECH_RMS_THRESHOLD && ws.readyState === WebSocket.OPEN) {
              const wav = float32ToWav(chunk, sampleRate)
              ws.send(wav)
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
      setError(err.message || 'Failed to join')
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
            {remoteUsers.map((user) => (
              <RemoteVideoPlayer key={user.uid} user={user} />
            ))}
          </div>
          <div className="video-call-controls">
            <Button variant={micEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleMic}>
              {micEnabled ? 'Mic on' : 'Mic off'}
            </Button>
            <Button variant={camEnabled ? 'outline' : 'primary'} size="sm" onClick={toggleCam}>
              {camEnabled ? 'Camera on' : 'Camera off'}
            </Button>
            <Button variant="primary" size="sm" onClick={leaveChannel} disabled={loading}>
              Leave
            </Button>
          </div>
        </div>
      )}
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
