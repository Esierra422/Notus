import AgoraRTC from 'agora-rtc-sdk-ng'
import { getApiUrl, getEffectiveApiBase } from './apiConfig.js'
import { getFunctionsApp } from './firebase.js'
import { httpsCallable } from 'firebase/functions'

// --- RTC state ---
let client = null
let isClientInitialized = false
let micMuted = true
let videoMuted = true
let localAudioTrack = null
let localVideoTrack = null
let localUid = 0

// Callbacks the page sets to react to remote user changes
let onUserJoined = null
let onUserLeft = null
let onAudioPublished = null

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

  client.on('user-unpublished', (user) => {
    onUserLeft?.(user)
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

async function joinChannel(channelName) {
  initializeClient()
  const uid = Math.floor(Math.random() * 100000)
  localUid = uid
  const data = await fetchToken(channelName, uid)

  await client.join(data.appId, channelName, data.token, data.uid)

  localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack()
  localVideoTrack = await AgoraRTC.createCameraVideoTrack()

  await client.publish([localAudioTrack, localVideoTrack])
  localAudioTrack.setMuted(micMuted)
  localVideoTrack.setMuted(videoMuted)

  return { uid: data.uid, audioTrack: localAudioTrack, videoTrack: localVideoTrack }
}

async function leaveChannel() {
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
}

function toggleMic() {
  if (!localAudioTrack) return micMuted
  micMuted = !micMuted
  localAudioTrack.setMuted(micMuted)
  return micMuted
}

function toggleVideo() {
  if (!localVideoTrack) return videoMuted
  videoMuted = !videoMuted
  localVideoTrack.setMuted(videoMuted)
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

function getLocalUid() {
  return localUid
}

function setCallbacks({ onJoined, onLeft, onAudioPublished: onAudioPub }) {
  onUserJoined = onJoined || null
  onUserLeft = onLeft || null
  onAudioPublished = onAudioPub || null
}

export {
  fetchToken,
  getLocalAudioTrack,
  getLocalUid,
  getLocalVideoTrack,
  getMediaState,
  joinChannel,
  leaveChannel,
  setCallbacks,
  toggleMic,
  toggleVideo,
}
