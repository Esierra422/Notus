import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Copy to clipboard and expose a short-lived `copied` flag for checkmark UI.
 * @param {number} [resetMs=1600]
 */
export function useCopyFeedback(resetMs = 1600) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const copy = useCallback(
    async (text) => {
      const t = String(text ?? '').trim()
      if (!t) return false
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(t)
        } else {
          const ta = document.createElement('textarea')
          ta.value = t
          ta.setAttribute('readonly', '')
          ta.style.position = 'fixed'
          ta.style.left = '-9999px'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
        }
        clearTimer()
        setCopied(true)
        timerRef.current = window.setTimeout(() => {
          setCopied(false)
          timerRef.current = null
        }, resetMs)
        return true
      } catch {
        return false
      }
    },
    [resetMs, clearTimer]
  )

  const resetCopied = useCallback(() => {
    clearTimer()
    setCopied(false)
  }, [clearTimer])

  return { copied, copy, resetCopied }
}
