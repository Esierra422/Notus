import { useCallback, useEffect, useRef, useState } from 'react'

export function useInlineToast(timeoutMs = 2200) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const showToast = useCallback((message, tone = 'success') => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setToast({ message, tone })
    timerRef.current = window.setTimeout(() => {
      setToast(null)
      timerRef.current = null
    }, timeoutMs)
  }, [timeoutMs])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  return { toast, showToast, clearToast: () => setToast(null) }
}
