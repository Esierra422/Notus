import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const YDOC_UPDATE_DEBOUNCE_MS = 1000 // Debounce updates to persistent storage

/**
 * Map of room names to active Yjs documents and connections
 * Structure: { [roomName]: { ydoc, connections: Set<WebSocket>, updateTimeout } }
 */
const rooms = new Map()

/**
 * Persistence storage (in-memory for now; can be replaced with DB)
 * Structure: { [roomName]: Uint8Array }
 */
const persistence = new Map()

/**
 * Get or create a room
 */
function getRoom(roomName) {
  if (!rooms.has(roomName)) {
    const ydoc = new Y.Doc()
    
    rooms.set(roomName, {
      ydoc,
      connections: new Set(),
      updateTimeout: null,
    })
    
    // Restore from persistence if available
    if (persistence.has(roomName)) {
      Y.applyUpdate(ydoc, persistence.get(roomName))
    }
  }
  return rooms.get(roomName)
}

/**
 * Save document state to persistence (with debounce)
 */
function saveRoomState(roomName) {
  const room = rooms.get(roomName)
  if (!room) return
  
  if (room.updateTimeout) {
    clearTimeout(room.updateTimeout)
  }
  
  room.updateTimeout = setTimeout(() => {
    const state = Y.encodeStateAsUpdate(room.ydoc)
    persistence.set(roomName, state)
    console.log(`[Collab] Saved room state for: ${roomName}`)
  }, YDOC_UPDATE_DEBOUNCE_MS)
}

/**
 * Broadcast message to all connections in a room
 */
function broadcastToRoom(roomName, message, sender = null) {
  const room = getRoom(roomName)
  room.connections.forEach((ws) => {
    if (ws !== sender && ws.readyState === 1) { // 1 = OPEN
      ws.send(message)
    }
  })
}

/**
 * Send full document state to a new client
 */
function sendFullSync(ws, room) {
  const state = Y.encodeStateAsUpdate(room.ydoc)
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 1) // messageType: update
  encoding.writeVarUint8Array(encoder, state)
  if (ws.readyState === 1) {
    ws.send(encoding.toUint8Array(encoder))
  }
}

/**
 * Handle collaborative editing WebSocket connection
 */
export function handleCollaborationConnection(ws, req) {
  // Extract room name from URL query parameter
  const url = new URL(req.url, `http://${req.headers.host}`)
  const roomName = url.searchParams.get('room') || url.pathname.split('/').pop() || 'notus-notepad'
  
  const room = getRoom(roomName)
  
  console.log(`[Collab] New connection to room: ${roomName} (total: ${room.connections.size + 1})`)
  
  // Add connection to room
  room.connections.add(ws)
  
  // Send full document state to new client
  setTimeout(() => {
    if (ws.readyState === 1) {
      sendFullSync(ws, room)
    }
  }, 0)
  
  ws.on('message', (message) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(message))
      const messageType = decoding.readVarUint(decoder)
      
      if (messageType === 1) {
        // Update message - apply to document and broadcast
        const update = decoding.readVarUint8Array(decoder)
        Y.applyUpdate(room.ydoc, update)
        
        // Broadcast update to other clients
        broadcastToRoom(roomName, message, ws)
        
        // Save to persistence
        saveRoomState(roomName)
      }
    } catch (err) {
      console.error(`[Collab] Error processing message in ${roomName}:`, err)
    }
  })
  
  ws.on('close', () => {
    console.log(`[Collab] Connection closed for room: ${roomName}`)
    room.connections.delete(ws)
    
    // Clean up empty rooms
    if (room.connections.size === 0) {
      console.log(`[Collab] Room is now empty: ${roomName}`)
      // Keep room in memory with its state for reconnections
    }
  })
  
  ws.on('error', (err) => {
    console.error(`[Collab] WebSocket error in ${roomName}:`, err)
    room.connections.delete(ws)
  })
}

