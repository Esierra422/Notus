import { useEffect } from 'react'
import { acquireScrollLock, releaseScrollLock } from '../lib/scrollLock'

/**
 * Lock background scroll while `locked` is true. Safe with nested modals (ref-counted).
 */
export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined
    acquireScrollLock()
    return () => releaseScrollLock()
  }, [locked])
}
