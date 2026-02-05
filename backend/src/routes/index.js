import { Router } from 'express'

const router = Router()

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Notus API is running' })
})

// Future route modules:
// import authRoutes from './auth.js'
// import meetingRoutes from './meetings.js'
// import channelRoutes from './channels.js'
// router.use('/auth', authRoutes)
// router.use('/meetings', meetingRoutes)
// router.use('/channels', channelRoutes)

export default router
