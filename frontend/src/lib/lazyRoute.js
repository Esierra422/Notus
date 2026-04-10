import { lazy } from 'react'

const CHUNK_LOAD_RE =
  /Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

function isLikelyStaleChunkError(err) {
  const msg = String(err?.message ?? err ?? '')
  return CHUNK_LOAD_RE.test(msg)
}

/**
 * React.lazy wrapper: retries a few times when a route chunk fails (often stale cache after deploy).
 */
export function lazyRoute(factory) {
  return lazy(async () => {
    const maxAttempts = 3
    let lastErr
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await factory()
      } catch (e) {
        lastErr = e
        const retry = attempt < maxAttempts - 1 && isLikelyStaleChunkError(e)
        if (!retry) throw e
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
      }
    }
    throw lastErr
  })
}
