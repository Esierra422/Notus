import AgoraRTC from 'agora-rtc-sdk-ng'
import { getApiUrl, getEffectiveApiBase } from './apiConfig.js'
import { getFunctionsApp } from './firebase.js'
import { httpsCallable } from 'firebase/functions'
import { normalizeApiError } from './apiErrors.js'

// --- RTC state ---
let client = null
let isClientInitialized = false
let micMuted = false
let videoMuted = false
let localAudioTrack = null
let localVideoTrack = null
let localScreenTrack = null
/** Second RTC client: publishes screen while main client keeps camera + mic (Agora allows one video track per client). */
let screenShareClient = null
/** Agora UID used for the screen-share client (for Firestore participant doc). */
let screenShareJoinedUid = null
let localUid = 0
let joinState = 'idle' // idle | connecting | connected
let joinInFlightPromise = null

/** Derive a non-colliding publisher UID for screen share (same channel, second connection). */
const SCREEN_SHARE_UID_OFFSET = 1_000_000_000
function screenShareAgoraUidFromBase(baseUid) {
  const b = Number(baseUid)
  if (!Number.isFinite(b) || b < 0) return SCREEN_SHARE_UID_OFFSET
  const sum = b + SCREEN_SHARE_UID_OFFSET
  if (sum > 0xffffffff) return SCREEN_SHARE_UID_OFFSET + (Math.floor(b) % 1_000_000)
  return sum
}
// Callbacks the page sets to react to remote user changes
let onUserJoined = null
let onUserLeft = null
let onAudioPublished = null
/** Sync React state from client.remoteUsers when mute/unmute does not replace user object references. */
let onRemoteUsersRefresh = null
/** Fires when screen capture ends from the browser/OS so UI can clear banner + layout. */
let onScreenShareEnded = null

function initializeClient() {
  if (isClientInitialized) return
  client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
  setupEventListeners()
  isClientInitialized = true
}

function setupEventListeners() {
  /** Ensures tiles exist for remotes who join before any track is published (e.g. camera off). */
  client.on('user-joined', (user) => {
    onUserJoined?.(user)
  })

  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType)
    if (mediaType === 'video' || mediaType === 'audio') {
      // Audio-only (camera off) must still add the remote user; video-off must not remove them.
      onUserJoined?.(user)
      // Pull canonical remoteUsers from SDK so track mute / unpublish state matches UI (mic + share end).
      onRemoteUsersRefresh?.()
    }
    if (mediaType === 'audio') {
      user.audioTrack?.play()
      onAudioPublished?.(user)
    }
  })

  client.on('user-unpublished', (user, mediaType) => {
    // Audio: setMuted(true) triggers user-unpublished("audio") on remotes — must refresh tiles (mic icon).
    if (mediaType === 'video' || mediaType === 'audio') {
      onUserJoined?.(user)
      onRemoteUsersRefresh?.()
    }
  })

  client.on('user-info-updated', (_uid, msg) => {
    if (
      msg === 'mute-audio' ||
      msg === 'unmute-audio' ||
      msg === 'mute-video' ||
      msg === 'unmute-video'
    ) {
      onRemoteUsersRefresh?.()
    }
  })

  client.on('user-left', (user) => {
    onUserLeft?.(user)
  })
}

/** Best-effort teardown after a failed join (avoids stuck connecting/connected client). */
async function abandonJoinAttempt() {
  await stopScreenShare()
  if (localAudioTrack) {
    try {
      localAudioTrack.close()
    } catch {
      /* ignore */
    }
    localAudioTrack = null
  }
  if (localVideoTrack) {
    try {
      localVideoTrack.close()
    } catch {
      /* ignore */
    }
    localVideoTrack = null
  }
  if (client) {
    try {
      await client.leave()
    } catch {
      /* ignore */
    }
  }
  isClientInitialized = false
  client = null
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
      throw new Error(
        normalizeApiError(data.error || '', {
          status: res.status,
          fallback: 'Could not fetch a video access token.',
          actionHint: 'Confirm backend credentials and try again.',
        })
      )
    }
    if (!res.ok) {
      throw new Error(
        normalizeApiError('', {
          status: res.status,
          fallback: 'Video token request failed.',
          actionHint: 'Retry in a moment.',
        })
      )
    }
    throw new Error('Server did not return JSON. Is the backend running and configured for video?')
  }
  try {
    const getAgoraToken = httpsCallable(getFunctionsApp(), 'getAgoraToken')
    const { data } = await getAgoraToken({ channel: channelName, uid })
    return data
  } catch (err) {
    throw new Error(
      normalizeApiError(err, {
        fallback: 'Could not request an Agora token.',
        actionHint: 'Check Firebase Functions deployment and permissions.',
      })
    )
  }
}

async function joinChannel(channelName, options = {}) {
  if (joinState === 'connected') {
    throw new Error('Already connected to a call.')
  }
  if (joinState === 'connecting' && joinInFlightPromise) {
    return joinInFlightPromise
  }

  joinInFlightPromise = (async () => {
    joinState = 'connecting'
    initializeClient()
    const micOn = options.micOn !== false
    const videoOn = options.videoOn !== false
    micMuted = !micOn
    videoMuted = !videoOn
    const uid = Math.floor(Math.random() * 100000)
    localUid = uid
    const data = await fetchToken(channelName, uid)

    try {
      await client.join(data.appId, channelName, data.token, data.uid)

      if (localAudioTrack) {
        try {
          localAudioTrack.close()
        } catch (e) {
          console.warn('Stale audio track close:', e)
        }
        localAudioTrack = null
      }
      if (localVideoTrack) {
        try {
          localVideoTrack.close()
        } catch (e) {
          console.warn('Stale video track close:', e)
        }
        localVideoTrack = null
      }

      const toPublish = []

      try {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack()
        localAudioTrack.setMuted(micMuted)
        toPublish.push(localAudioTrack)
      } catch (e) {
        if (micOn) {
          throw new Error(
            'Microphone access failed. Check browser permissions, or turn the microphone off in the preview and try again.'
          )
        }
        console.warn('Microphone unavailable (joining without mic):', e)
        localAudioTrack = null
      }

      localVideoTrack = null
      if (videoOn) {
        try {
          localVideoTrack = await AgoraRTC.createCameraVideoTrack()
          localVideoTrack.setMuted(videoMuted)
          toPublish.push(localVideoTrack)
        } catch (e) {
          console.warn('Camera unavailable:', e)
          throw new Error(
            'Camera access failed. Turn the camera off in the preview to join audio-only, then turn video on from the toolbar if you want.'
          )
        }
      }

      if (toPublish.length) {
        await client.publish(toPublish)
      }

      joinState = 'connected'
      return { uid: data.uid, audioTrack: localAudioTrack, videoTrack: localVideoTrack }
    } catch (e) {
      await abandonJoinAttempt()
      throw e
    }
  })()

  try {
    return await joinInFlightPromise
  } catch (err) {
    joinState = 'idle'
    throw err
  } finally {
    joinInFlightPromise = null
  }
}

async function stopScreenShare() {
  if (localScreenTrack && screenShareClient) {
    try {
      await screenShareClient.unpublish([localScreenTrack])
    } catch (e) {
      console.warn('Screen client unpublish:', e)
    }
    try {
      localScreenTrack.close()
    } catch (e) {
      console.warn('Screen track close:', e)
    }
    localScreenTrack = null
  } else if (localScreenTrack) {
    try {
      localScreenTrack.close()
    } catch (e) {
      console.warn('Screen track close:', e)
    }
    localScreenTrack = null
  }
  if (screenShareClient) {
    try {
      await screenShareClient.leave()
    } catch (e) {
      console.warn('Screen client leave:', e)
    }
    screenShareClient = null
  }
  screenShareJoinedUid = null
}

async function startScreenShare(channelName) {
  initializeClient()
  if (!client) {
    throw new Error('Not in a call.')
  }
  const ch = String(channelName || '').trim()
  if (!ch) {
    throw new Error('Missing channel.')
  }
  if (localScreenTrack && screenShareClient) {
    return localScreenTrack
  }

  const uidForScreen = screenShareAgoraUidFromBase(localUid)
  const data = await fetchToken(ch, uidForScreen)
  const ssClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

  let track
  try {
    try {
      track = await AgoraRTC.createScreenVideoTrack({}, 'disable')
    } catch {
      try {
        track = await AgoraRTC.createScreenVideoTrack({ optimizationMode: 'detail' }, 'disable')
      } catch {
        track = await AgoraRTC.createScreenVideoTrack()
      }
    }
    await ssClient.join(data.appId, ch, data.token, data.uid)
    await ssClient.publish([track])
  } catch (e) {
    try {
      track?.close?.()
    } catch (_) {
      /* ignore */
    }
    try {
      await ssClient.leave()
    } catch (_) {
      /* ignore */
    }
    throw e
  }

  screenShareClient = ssClient
  localScreenTrack = track
  screenShareJoinedUid = data.uid

  localScreenTrack.on('track-ended', () => {
    void (async () => {
      const endedScreenPublisherUid = screenShareJoinedUid
      try {
        await stopScreenShare()
      } catch (err) {
        console.warn('stopScreenShare after track-ended:', err)
      }
      try {
        onScreenShareEnded?.({ screenPublisherAgoraUid: endedScreenPublisherUid })
      } catch (err) {
        console.warn('onScreenShareEnded:', err)
      }
    })()
  })
  return localScreenTrack
}

/** Stop current share and open the picker again (another window or display). */
async function replaceScreenShareSource(channelName) {
  if (!localScreenTrack) return startScreenShare(channelName)
  await stopScreenShare()
  return startScreenShare(channelName)
}

function getIsScreenSharing() {
  return !!localScreenTrack
}

function getScreenSharePublisherUid() {
  return screenShareJoinedUid != null ? screenShareJoinedUid : null
}

async function leaveChannel() {
  joinState = 'idle'
  joinInFlightPromise = null
  await stopScreenShare()
  if (localAudioTrack) {
    localAudioTrack.close()
    localAudioTrack = null
  }
  if (localVideoTrack) {
    localVideoTrack.close()
    localVideoTrack = null
  }
  if (client) {
    try {
      await client.leave()
    } catch (e) {
      console.warn('client.leave:', e)
    }
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

async function toggleVideo() {
  initializeClient()
  if (!client) return videoMuted

  if (localVideoTrack) {
    videoMuted = !videoMuted
    localVideoTrack.setMuted(videoMuted)
    return videoMuted
  }

  if (videoMuted) {
    try {
      localVideoTrack = await AgoraRTC.createCameraVideoTrack()
      await client.publish([localVideoTrack])
      videoMuted = false
      localVideoTrack.setMuted(false)
      return false
    } catch (e) {
      console.warn('Could not start camera:', e)
      throw e
    }
  }

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

/** Current Agora remote users (empty if not in a channel). */
function getRemoteUsers() {
  if (!client) return []
  try {
    return client.remoteUsers?.slice() ?? []
  } catch {
    return []
  }
}

function setCallbacks({
  onJoined,
  onLeft,
  onAudioPublished: onAudioPub,
  onRemoteUsersRefresh: onRefresh,
  onScreenShareEnded: onShareEnd,
}) {
  onUserJoined = onJoined || null
  onUserLeft = onLeft || null
  onAudioPublished = onAudioPub || null
  onRemoteUsersRefresh = onRefresh || null
  onScreenShareEnded = onShareEnd || null
}

export {
  fetchToken,
  getIsScreenSharing,
  getLocalAudioTrack,
  getLocalUid,
  getLocalVideoTrack,
  getMediaState,
  getRemoteUsers,
  getScreenSharePublisherUid,
  joinChannel,
  leaveChannel,
  setCallbacks,
  startScreenShare,
  stopScreenShare,
  replaceScreenShareSource,
  toggleMic,
  toggleVideo,
}
