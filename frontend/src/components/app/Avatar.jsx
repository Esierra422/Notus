import { useState, useEffect } from 'react'
import { getUserDoc, getProfilePictureUrl } from '../../lib/userService'

const PROFILE_UPDATED_EVENT = 'notus:profileUpdated'

export function Avatar({ user, size = 32 }) {
  const [userDoc, setUserDoc] = useState(null)
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    if (!user?.uid) return
    getUserDoc(user.uid).then(setUserDoc)
  }, [user?.uid])
  useEffect(() => {
    const handler = () => {
      setImgError(false)
      if (user?.uid) getUserDoc(user.uid).then(setUserDoc)
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, handler)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler)
  }, [user?.uid])
  const src = !imgError && getProfilePictureUrl(userDoc, user)
  const initials = user?.email?.[0]?.toUpperCase() || user?.displayName?.[0]?.toUpperCase() || '?'
  return (
    <div className="app-avatar" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt=""
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="app-avatar-initials">{initials}</span>
      )}
    </div>
  )
}
