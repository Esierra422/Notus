import AgoraRTC from 'agora-rtc-sdk-ng'
import { getApiUrl, getEffectiveApiBase } from './apiConfig.js'
import { getFunctionsApp } from './firebase.js'
import { httpsCallable } from 'firebase/functions'

// --- RTC state ---
let client = null
let isClientInitialized = false
/** Start unmuted so local capture (e.g. transcription) works immediately; UI defaults should match. */
let micMuted = false
let videoMuted = false
let localAudioTrack = null
let localVideoTrack = null
let localScreenTrack = null
let localUid = 0

// Callbacks the page sets to react to remote user changes
let onUserJoined = null
let onUserLeft = null
let onAudioPublished = null
/** Fired when remote mute/video state changes so UI can re-read client.remoteUsers */
let onRemoteUsersRefresh = null

function initializeClient() {
  if (isClientInitialized) return
  client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
  setupEventListeners()
  isClientInitialized = true
}

function setupEventListeners() {
  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType)
    if (mediaType === 'video') {
      onUserJoined?.(user)
    }
    if (mediaType === 'audio') {
      user.audioTrack?.play()
      onAudioPublished?.(user)
    }
  })

  // Unpublishing one media type (e.g. camera before screen) is not a full leave.
  // Removing the tile here breaks remote screen share and camera swaps.
  client.on('user-unpublished', () => {
    onRemoteUsersRefresh?.()
  })

  client.on('user-left', (user) => {
    onUserLeft?.(user)
  })

  client.on('user-info-updated', () => {
    onRemoteUsersRefresh?.()
  })
}

async function fetchToken(channelName, uid) {
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

async function joinChannel(channelName, { micOn = true, videoOn = true } = {}) {
  initializeClient()
  const uid = Math.floor(Math.random() * 100000)
  localUid = uid
  const data = await fetchToken(channelName, uid)

  await client.join(data.appId, channelName, data.token, data.uid)

  micMuted = !micOn
  videoMuted = !videoOn

  localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack()
  localVideoTrack = await AgoraRTC.createCameraVideoTrack()

  await client.publish([localAudioTrack, localVideoTrack])
  localAudioTrack.setMuted(micMuted)
  localVideoTrack.setMuted(videoMuted)

  return { uid: data.uid, audioTrack: localAudioTrack, videoTrack: localVideoTrack }
}

async function stopScreenShare() {
  if (!client) {
    if (localScreenTrack) {
      try {
        localScreenTrack.close()
      } catch (e) {
        console.warn('Screen track close:', e)
      }
      localScreenTrack = null
    }
    return
  }
  if (localScreenTrack) {
    try {
      await client.unpublish([localScreenTrack])
    } catch (e) {
      console.warn('Screen unpublish:', e)
    }
    try {
      localScreenTrack.close()
    } catch (e) {
      console.warn('Screen track close:', e)
    }
    localScreenTrack = null
  }
  if (localVideoTrack) {
    try {
      await client.publish([localVideoTrack])
    } catch (e) {
      console.warn('Re-publish camera after screen share:', e)
    }
  }
}

async function startScreenShare() {
  initializeClient()
  if (!client || !localVideoTrack) {
    throw new Error('Join the call with your camera before sharing your screen.')
  }
  if (localScreenTrack) return localScreenTrack
  try {
    localScreenTrack = await AgoraRTC.createScreenVideoTrack({}, 'disable')
  } catch {
    try {
      localScreenTrack = await AgoraRTC.createScreenVideoTrack({ optimizationMode: 'detail' }, 'disable')
    } catch {
      localScreenTrack = await AgoraRTC.createScreenVideoTrack()
    }
  }
  await client.unpublish([localVideoTrack])
  await client.publish([localScreenTrack])
  localScreenTrack.on('track-ended', () => {
    stopScreenShare().catch(() => {})
  })
  return localScreenTrack
}

/** Stop current share and open the picker again (another window or display). */
async function replaceScreenShareSource() {
  if (!localScreenTrack) return startScreenShare()
  await stopScreenShare()
  return startScreenShare()
}

function getIsScreenSharing() {
  return !!localScreenTrack
}

async function leaveChannel() {
  await stopScreenShare().catch(() => {})
  if (localAudioTrack) {
    localAudioTrack.close()
    localAudioTrack = null
  }
  if (localVideoTrack) {
    localVideoTrack.close()
    localVideoTrack = null
  }
  if (client) {
    await client.leave()
  }
  // Reset so the next join starts fresh
  isClientInitialized = false
  client = null
  micMuted = false
  videoMuted = false
}

function toggleMic() {
  if (!localAudioTrack) return micMuted
  micMuted = !micMuted
  localAudioTrack.setMuted(micMuted)
  return micMuted
}

function toggleVideo() {
  const track = localScreenTrack || localVideoTrack
  if (!track) return videoMuted
  videoMuted = !videoMuted
  track.setMuted(videoMuted)
  return videoMuted
}

function getMediaState() {
  return { micMuted, videoMuted }
}

function getLocalAudioTrack() {
  return localAudioTrack
}

function getLocalVideoTrack() {
  return localVideoTrack
}

/** Camera track (not screen); for republish after screen share. */
function getLocalCameraTrack() {
  return localVideoTrack
}

function getLocalDisplayTrack() {
  return localScreenTrack || localVideoTrack
}

function getLocalUid() {
  return localUid
}

function setCallbacks({ onJoined, onLeft, onAudioPublished: onAudioPub, onRemoteUsersRefresh: onRefresh }) {
  onUserJoined = onJoined || null
  onUserLeft = onLeft || null
  onAudioPublished = onAudioPub || null
  onRemoteUsersRefresh = onRefresh || null
}

function getRemoteUsers() {
  if (!client) return []
  return client.remoteUsers.slice()
}

export {
  fetchToken,
  getIsScreenSharing,
  getLocalAudioTrack,
  getLocalCameraTrack,
  getLocalDisplayTrack,
  getLocalUid,
  getLocalVideoTrack,
  getMediaState,
  getRemoteUsers,
  joinChannel,
  leaveChannel,
  setCallbacks,
  startScreenShare,
  stopScreenShare,
  replaceScreenShareSource,
  toggleMic,
  toggleVideo,
}
