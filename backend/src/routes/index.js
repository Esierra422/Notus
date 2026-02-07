import { Router } from 'express'

const router = Router()

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Notus API is running' })
})

/**
 * Proxy to fetch ICS calendar from a URL (avoids CORS when the calendar server
 * does not send Access-Control-Allow-Origin).
 */
router.get('/calendar/fetch-ics', async (req, res) => {
  const url = req.query.url
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url query parameter' })
  }
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http and https URLs are allowed' })
    }
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Notus-Calendar-Import/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Calendar server returned ${resp.status}` })
    }
    const text = await resp.text()
    res.set('Content-Type', 'text/calendar; charset=utf-8')
    res.send(text)
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(408).json({ error: 'Request timeout' })
    }
    res.status(502).json({ error: err.message || 'Failed to fetch calendar' })
  }
})

// Future route modules:
// import authRoutes from './auth.js'
// import meetingRoutes from './meetings.js'
// import channelRoutes from './channels.js'
// router.use('/auth', authRoutes)
// router.use('/meetings', meetingRoutes)
// router.use('/channels', channelRoutes)

export default router
