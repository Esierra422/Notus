import { Readable } from 'stream'
import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

/**
 * Called every time we have a new transcript segment.
 * This is where you push to your LLM context, vector DB, or meeting doc.
 * Right now: log only. Later: e.g. append to Firestore meeting transcript, or ingest into vector DB.
 */
function onTranscript(channel, uid, text) {
  console.log(`[${channel}] Transcript (uid=${uid}): ${text}`)
  // TODO: e.g. append to meeting transcript in Firestore, or add to vector DB for RAG
}

/**
 * Attach WebSocket handlers for the transcription connection.
 * First message = JSON { type: 'meta', channel, uid }. Rest = binary WAV chunks.
 */
export function handleTranscriptionConnection(ws) {
  let channel = null
  let uid = null

  const transcribeAudio = async (audioData) => {
    if (!openai) {
      console.warn('OpenAI API key not configured. Set OPENAI_API_KEY in .env')
      return
    }
    try {
      const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData)
      const audioStream = Readable.from(buffer)
      audioStream.path = 'audio.wav'

      const transcription = await openai.audio.transcriptions.create({
        file: audioStream,
        model: 'whisper-1',
        language: 'en',
      })
      const text = transcription.text.trim()
      if (text) {
        onTranscript(channel, uid, text)
      }
    } catch (error) {
      console.error('Whisper transcription error:', error.message)
    }
  }

  ws.on('message', async (data) => {
    if (!channel && Buffer.isBuffer(data)) {
      try {
        const str = data.toString('utf-8')
        const meta = JSON.parse(str)
        if (meta.type === 'meta') {
          channel = meta.channel
          uid = meta.uid
          console.log(`Transcription WS: channel=${channel}, uid=${uid}`)
        }
      } catch (e) {
        console.warn('Failed to parse WS metadata:', e)
      }
    } else if (channel && Buffer.isBuffer(data)) {
      await transcribeAudio(data)
    }
  })

  ws.on('close', () => {
    console.log(`Transcription WS closed: channel=${channel}, uid=${uid}`)
  })
}
