/**
 * Lock chat — PIN-protected chats. Data stored in localStorage.
 * Key format: notus_lock_* (scoped per userId for multi-account).
 */

const LOCKED_KEY = 'notus_locked_chats'
const PIN_KEY = 'notus_lock_pin'
const SALT = 'notus-chat-lock-v1'

function storageKey(userId, suffix) {
  return `${suffix}_${userId || 'anon'}`
}

function chatKey(orgId, convId) {
  return `${orgId}_${convId}`
}

async function hashPin(pin, salt) {
  const enc = new TextEncoder()
  const data = enc.encode(pin + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function getLockedChatIds(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId, LOCKED_KEY))
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function setChatLocked(userId, orgId, convId, locked) {
  const set = getLockedChatIds(userId)
  const key = chatKey(orgId, convId)
  if (locked) {
    set.add(key)
  } else {
    set.delete(key)
  }
  localStorage.setItem(storageKey(userId, LOCKED_KEY), JSON.stringify([...set]))
}

export function isChatLocked(userId, orgId, convId) {
  return getLockedChatIds(userId).has(chatKey(orgId, convId))
}

export function hasPin(userId) {
  try {
    return !!localStorage.getItem(storageKey(userId, PIN_KEY))
  } catch {
    return false
  }
}

export async function setPin(userId, pin) {
  if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 digits')
  const salt = SALT + (userId || '')
  const hash = await hashPin(pin, salt)
  localStorage.setItem(storageKey(userId, PIN_KEY), hash)
}

export async function verifyPin(userId, pin) {
  const stored = localStorage.getItem(storageKey(userId, PIN_KEY))
  if (!stored) return false
  const salt = SALT + (userId || '')
  const hash = await hashPin(pin, salt)
  return hash === stored
}
