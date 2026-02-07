/**
 * Import external calendars (ICS files).
 * Stores imported events in Firestore under users/{userId}/importedCalendarEvents.
 */
import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import ICAL from 'ical.js'

const IMPORTED_EVENTS_SUB = 'importedCalendarEvents'

/**
 * Parse ICS string and return events with startAt, endAt, title, etc.
 */
function parseICSEvents(icsString, source = 'import') {
  const events = []
  try {
    const jcal = ICAL.parse(icsString)
    const comp = new ICAL.Component(jcal)
    const vevents = comp.getAllSubcomponents('vevent')

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent)
      const start = event.startDate
      const end = event.endDate

      if (!start) continue

      const startJs = start.toJSDate()
      const endJs = end ? end.toJSDate() : startJs

      events.push({
        title: event.summary || 'Untitled',
        description: event.description || '',
        startAt: Timestamp.fromDate(startJs),
        endAt: Timestamp.fromDate(endJs),
        source,
        uid: event.uid || `import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      })
    }
  } catch (err) {
    throw new Error('Invalid ICS file: ' + (err.message || 'Could not parse'))
  }
  return events
}

/**
 * Import events from an ICS file string. Saves to Firestore.
 */
export async function importICSFile(userId, icsString, sourceName = 'Imported calendar') {
  const events = parseICSEvents(icsString, sourceName)
  const ref = collection(db, 'users', userId, IMPORTED_EVENTS_SUB)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const twoYearsAgo = new Date(startOfMonth)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const twoYearsAhead = new Date(startOfMonth)
  twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2)

  let saved = 0
  for (const ev of events) {
    const ms = ev.startAt.toMillis()
    if (ms >= twoYearsAgo.getTime() && ms <= twoYearsAhead.getTime()) {
      await addDoc(ref, {
        ...ev,
        createdAt: Timestamp.now(),
      })
      saved++
    }
  }
  return { total: events.length, saved }
}

/**
 * Get imported events in a date range for the calendar view.
 */
export async function getImportedEventsInRange(userId, year, month) {
  const start = Timestamp.fromDate(new Date(year, month, 1, 0, 0, 0))
  const end = Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59, 999))
  const ref = collection(db, 'users', userId, IMPORTED_EVENTS_SUB)
  const q = query(ref, where('startAt', '>=', start), where('startAt', '<=', end))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data(), _imported: true }))
}
