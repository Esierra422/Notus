import { useState, useEffect, useRef } from 'react'

/** IntersectionObserver → { ref, inView }; options: rootMargin, threshold, once */
export function useInView(options = {}) {
  const { rootMargin = '0px 0px -80px 0px', threshold = 0.1, once = true } = options
  const [inView, setInView] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin, threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin, threshold, once])

  return { ref, inView }
}
