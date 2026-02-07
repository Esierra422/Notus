import { useState, useEffect, useRef, useCallback } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import { useOutletContext } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './VideoCallPage.css'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export function VideoCallPage() {
  const { user, setNavExtra } = useOutletContext() || {}
  const [channelName, setChannelName] = useState('channel1')
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

  const cleanup = useCallback(async () => {
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
