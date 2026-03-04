import express from 'express'
import cors from 'cors'
import { config } from './config/index.js'
import './lib/firebaseAdmin.js'
import routes from './routes/index.js'

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

app.listen(config.port, () => {
  console.log(`Notus server running at http://localhost:${config.port}`)
})
