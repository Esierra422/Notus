/**
 * Reference-counted document scroll lock for modal overlays.
 * Freezes `.page-transition` and other scroll roots (see index.css `.notus-scroll-locked`).
 */

let lockCount = 0

function scrollbarGutterPx() {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
}

export function acquireScrollLock() {
  lockCount += 1
  if (lockCount !== 1) return

  const html = document.documentElement
  const gutter = scrollbarGutterPx()
  if (gutter > 0) {
    html.style.setProperty('--notus-scrollbar-gutter', `${gutter}px`)
  }

  html.classList.add('notus-scroll-locked')

  document.querySelectorAll('.page-transition').forEach((el) => {
    if (!el.hasAttribute('data-notus-saved-scroll')) {
      el.setAttribute('data-notus-saved-scroll', String(el.scrollTop))
    }
    el.style.overflow = 'hidden'
  })
}

export function releaseScrollLock() {
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount !== 0) return

  const html = document.documentElement
  html.classList.remove('notus-scroll-locked')
  html.style.removeProperty('--notus-scrollbar-gutter')

  document.querySelectorAll('.page-transition').forEach((el) => {
    const saved = el.getAttribute('data-notus-saved-scroll')
    el.removeAttribute('data-notus-saved-scroll')
    el.style.overflow = ''
    if (saved != null) {
      el.scrollTop = parseInt(saved, 10) || 0
    }
  })
}
