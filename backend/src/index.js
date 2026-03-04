import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { config } from './config/index.js'
import './lib/firebaseAdmin.js'
import routes from './routes/index.js'
import { handleTranscriptionConnection } from './ws/transcription.js'
import { handleCollaborationConnection } from './ws/collaboration.js'

const app = express()

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    if (config.clientOrigins.includes(origin)) return cb(null, origin)
    return cb(null, false)
  },
}))
app.use(express.json())

app.use('/api', routes)

const server = createServer(app)

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname
  
  if (pathname.startsWith('/ws/transcription')) {
    handleTranscriptionConnection(ws, req)
  } else if (pathname.startsWith('/ws/collab') || pathname === '/ws/collab') {
    handleCollaborationConnection(ws, req)
  } else {
    console.warn(`[WS] Unknown WebSocket path: ${pathname}`)
    ws.close()
  }
})

server.listen(config.port, () => {
  console.log(`Notus server running at http://localhost:${config.port}`)
})
