import express from 'express'
import cors from 'cors'
import { config } from './config/index.js'
import './lib/firebaseAdmin.js'
import routes from './routes/index.js'

const app = express()

app.use(cors({ origin: config.clientUrl }))
app.use(express.json())

app.use('/api', routes)

app.listen(config.port, () => {
  console.log(`Notus server running at http://localhost:${config.port}`)
})
