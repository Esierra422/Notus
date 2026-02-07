/**
 * User service — canonical user doc at users/{uid} only.
 *
 * Architecture (see Documentation/ARCHITECTURE.md):
 * - User profiles live ONLY at users/{uid}. uid from Firebase Auth.
 * - Do NOT create: googleUsers, emailUsers, profiles, usersByEmail, or
 *   any provider-specific user collections.
 * - Passwords are NEVER stored in Firestore. Firebase Auth only.
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const USERS_COLLECTION = 'users'

/**
 * Required user fields per Architecture. Passwords NEVER stored.
 */
export const USER_FIELDS = [
  'profilePicture',
  'email',
  'firstName',
  'lastName',
  'birthdate',
  'phoneNumber',
  'gender',
  'providers',
  'createdAt',
  'updatedAt',
  'onboardingComplete',
]

/**
 * Get user doc at users/{uid}.
 */
export async function getUserDoc(uid) {
  const ref = doc(db, USERS_COLLECTION, uid)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Get the profile picture URL for display. Single source of truth.
 * Priority: Firestore (uploaded/saved) > Auth photoURL (Google) > null
 */
export function getProfilePictureUrl(userDoc, authUser = null) {
  const fromDoc = userDoc?.profilePicture
  if (fromDoc && fromDoc !== 'skipped' && typeof fromDoc === 'string') {
    if (fromDoc.startsWith('data:') || fromDoc.startsWith('http')) return fromDoc
  }
  const fromAuth = authUser?.photoURL
  if (fromAuth && typeof fromAuth === 'string' && fromAuth.startsWith('http')) {
    return fromAuth
  }
  return null
}

/**
 * Format display label from user doc: first name + last name preferred, then email, never userId.
 * authUser: optional Firebase Auth user; when profile has no name and userId matches authUser.uid, use displayName.
 */
export function getDisplayName(userDoc, fallbackUserId = '', authUser = null) {
  if (!userDoc && !authUser) return fallbackUserId ? `User ${fallbackUserId.slice(0, 8)}…` : ''
  const first = (userDoc?.firstName || '').trim()
  const last = (userDoc?.lastName || '').trim()
  const name = `${first} ${last}`.trim()
  if (name) return name
  if (authUser?.uid === fallbackUserId && authUser?.displayName) return (authUser.displayName || '').trim()
  const email = (userDoc?.email || '').trim()
  if (email) return email
  return fallbackUserId ? `User ${fallbackUserId.slice(0, 8)}…` : ''
}

/**
 * Format full display: "First Last — email" (name, then email).
 * authUser: optional Firebase Auth user when profile has no name/email.
 */
export function getDisplayLabel(userDoc, fallbackUserId = '', authUser = null) {
  const first = (userDoc?.firstName || '').trim()
  const last = (userDoc?.lastName || '').trim()
  const name = `${first} ${last}`.trim()
  const email = (userDoc?.email || authUser?.email || '').trim()
  const displayName = (authUser?.displayName || '').trim()
  const parts = []
  if (name) parts.push(name)
  if (email) parts.push(email)
  if (parts.length > 0) return parts.join(' — ')
  if (displayName && !userDoc) return displayName
  return fallbackUserId ? `User ${fallbackUserId.slice(0, 8)}…` : ''
}

/**
 * Format member/request line: "First Last — email — role"
 */
export function getMemberDisplayLine(userDoc, userId, authUser, role) {
  const base = getDisplayLabel(userDoc, userId, authUser)
  return role ? `${base} — ${role}` : base
}

/**
 * Parse Firebase Auth displayName (e.g. from Google) into firstName and lastName.
 */
function parseDisplayName(displayName) {
  if (!displayName || typeof displayName !== 'string') return { firstName: '', lastName: '' }
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Ensure exactly one user doc at users/{uid}. Create if missing, update if exists.
 * Never store password. Providers array tracks auth methods used.
 * For Google/social sign-in: parses displayName into firstName/lastName, uses photoURL for profile picture.
 */
export async function ensureUserDoc(user, providers = []) {
  const uid = user.uid
  const ref = doc(db, USERS_COLLECTION, uid)
  const snap = await getDoc(ref)
  const { firstName: parsedFirst, lastName: parsedLast } = parseDisplayName(user.displayName)

  const base = {
    email: user.email || '',
    profilePicture: user.photoURL || '',
    providers: [...new Set([...(snap.data()?.providers || []), ...providers])],
    updatedAt: serverTimestamp(),
  }

  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      firstName: parsedFirst,
      lastName: parsedLast,
      birthdate: '',
      phoneNumber: '',
      gender: '',
      onboardingComplete: false,
      createdAt: serverTimestamp(),
    })
    return { created: true }
  }

  const existing = snap.data()
  const profilePicUpdate = existing.profilePicture && existing.profilePicture !== ''
    ? existing.profilePicture
    : (user.photoURL || existing.profilePicture || '')
  const firstName = (existing.firstName || '').trim() ? existing.firstName : parsedFirst
  const lastName = (existing.lastName || '').trim() ? existing.lastName : parsedLast
  await updateDoc(ref, {
    ...base,
    email: user.email || existing.email,
    profilePicture: profilePicUpdate,
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
  })
  return { created: false }
}

export const PROFILE_FIELDS = [
  { key: 'profilePicture', label: 'Profile picture', type: 'image' },
  { key: 'firstName', label: 'First name', type: 'text' },
  { key: 'lastName', label: 'Last name', type: 'text' },
  { key: 'birthdate', label: 'Birthdate', type: 'date' },
  { key: 'phoneNumber', label: 'Phone number', type: 'tel' },
  { key: 'gender', label: 'Gender', type: 'select', options: ['male', 'female', 'non-binary', 'prefer-not-to-say'] },
]

/**
 * Check if a profile field value is considered "filled".
 * profilePicture: filled when URL (uploaded) or 'skipped' (user chose skip).
 */
function isFieldFilled(key, val) {
  if (val === undefined || val === null) return false
  if (key === 'profilePicture') return !!(val && val !== '') // URL or 'skipped'
  return val !== ''
}

/**
 * Get first missing required profile field for onboarding.
 */
const PROFILE_FIELDS_ORDER = PROFILE_FIELDS

export function getNextProfileField(userDoc) {
  for (const { key, label } of PROFILE_FIELDS_ORDER) {
    const val = userDoc[key]
    if (!isFieldFilled(key, val)) return { key, label }
  }
  return null
}

/**
 * Count missing profile fields for step display.
 */
export function getMissingProfileFieldsCount(userDoc) {
  return PROFILE_FIELDS_ORDER.filter(({ key }) => {
    const val = userDoc[key]
    return !isFieldFilled(key, val)
  }).length
}

/**
 * Update a single profile field. When all required fields filled, set onboardingComplete.
 */
export async function updateProfileField(uid, field, value) {
  const ref = doc(db, USERS_COLLECTION, uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('User doc not found')

  const updates = {
    [field]: value,
    updatedAt: serverTimestamp(),
  }

  const currentData = { ...snap.data(), [field]: value }
  const allFilled = PROFILE_FIELDS_ORDER.every(({ key }) =>
    isFieldFilled(key, currentData[key])
  )
  if (allFilled) updates.onboardingComplete = true

  await updateDoc(ref, updates)
}
