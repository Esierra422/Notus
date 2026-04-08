import { Readable } from 'stream'
import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

/** New transcript chunk — hook for persistence/RAG; currently logs only */
function onTranscript(channel, uid, text) {
  console.log(`[${channel}] Transcript (uid=${uid}): ${text}`)
}

const WHISPER_SAMPLE_RATE = 16000

/** Build 44-byte WAV header for 16kHz mono 16-bit PCM; then prepend to raw PCM buffer. */
function rawPcmToWavBuffer(rawPcm) {
  const pcm = Buffer.isBuffer(rawPcm) ? rawPcm : Buffer.from(rawPcm)
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  const writeStr = (offset, str) => header.write(str, offset, 'ascii')
  writeStr(0, 'RIFF')
  header.writeUInt32LE(36 + dataSize, 4)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)   // PCM
  header.writeUInt16LE(1, 22)   // mono
  header.writeUInt32LE(WHISPER_SAMPLE_RATE, 24)
  header.writeUInt32LE(WHISPER_SAMPLE_RATE * 2, 28) // byte rate
  header.writeUInt16LE(2, 32)  // block align
  header.writeUInt16LE(16, 34)
  writeStr(36, 'data')
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm])
}

/** WS: first frame JSON meta { channel, uid }; then 16kHz mono Int16 PCM → Whisper */
export function handleTranscriptionConnection(ws) {
  let channel = null
  let uid = null

  const transcribeAudio = async (rawPcm) => {
    if (!openai) {
      console.warn('OpenAI API key not configured. Set OPENAI_API_KEY in .env')
      return
    }
    try {
      const wavBuffer = rawPcmToWavBuffer(rawPcm)
      const audioStream = Readable.from(wavBuffer)
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
    if (!channel) {
      try {
        const str = typeof data === 'string' ? data : (Buffer.isBuffer(data) ? data.toString('utf-8') : String(data))
        const meta = JSON.parse(str)
        if (meta.type === 'meta') {
          channel = meta.channel
          uid = meta.uid
          console.log(`Transcription WS: channel=${channel}, uid=${uid}`)
        }
      } catch (e) {
        // not meta (e.g. binary); ignore until meta received
      }
    } else if (channel && (Buffer.isBuffer(data) || data instanceof ArrayBuffer)) {
      await transcribeAudio(data)
    }
  })

  ws.on('close', () => {
    console.log(`Transcription WS closed: channel=${channel}, uid=${uid}`)
  })
}
