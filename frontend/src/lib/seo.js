const DEFAULT_TITLE = 'Notus | Team Collaboration Platform'
const DEFAULT_DESCRIPTION =
  'Notus is an enterprise-ready collaboration platform for teams, combining chat, calendar, video meetings, AI summaries, and shared workspaces.'

function setMetaTag(attr, key, value) {
  const selector = `meta[${attr}="${key}"]`
  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', value)
}

export function applyPublicMeta({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = '/og-image.svg',
} = {}) {
  if (typeof document === 'undefined') return
  document.title = title
  setMetaTag('name', 'description', description)
  setMetaTag('property', 'og:title', title)
  setMetaTag('property', 'og:description', description)
  setMetaTag('property', 'og:url', `https://notusapp.com${path}`)
  setMetaTag('property', 'og:image', image)
  setMetaTag('name', 'twitter:title', title)
  setMetaTag('name', 'twitter:description', description)
  setMetaTag('name', 'twitter:image', image)
  let canonical = document.head.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', `https://notusapp.com${path}`)
}
