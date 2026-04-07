/**
 * Main dashboard calendar: same scope as Calendar “Personal” view  - 
 * org meetings (all orgs), imported ICS events, and tasks with due dates.
 */
import {
  getMeetingsInRangeForUser,
  meetingCalendarDisplaySource,
} from './meetingService'
import { getImportedEventsInRange } from './calendarImportService'
import { getTodosInRange } from './todoService'
import { expandMeetingsListForMonth } from './calendarRecurrence'

function monthsCoveringRange(start, end) {
  const out = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const endM = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= endM) {
    out.push({ year: cur.getFullYear(), month: cur.getMonth() })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

/**
 * One calendar month of rows, same shape as CalendarPage filter === 'personal'
 * (expanded recurrences for meetings; todos & imports tagged personal).
 */
export async function loadPersonalCalendarMonthForUser(userId, year, month) {
  const [meetingsList, importedList, todosList] = await Promise.all([
    getMeetingsInRangeForUser(userId, year, month),
    getImportedEventsInRange(userId, year, month),
    getTodosInRange(userId, year, month).catch(() => []),
  ])

  const todosAsEvents = todosList.map((t) => ({
    id: t.id,
    title: t.text,
    startAt: t.dueDate,
    _todo: true,
    done: t.done,
    _calendarSource: 'personal',
  }))

  const importedTagged = importedList.map((ev) => ({
    ...ev,
    _calendarSource: 'personal',
  }))

  const meetingsTagged = meetingsList.map((row) => ({
    ...row,
    _calendarSource: meetingCalendarDisplaySource(row),
  }))

  const meetingRows = meetingsTagged.filter((x) => !x._todo && !x._imported)
  const expandedMeetings = expandMeetingsListForMonth(meetingRows, year, month)
  const otherRows = [...importedTagged, ...todosAsEvents]

  return [...expandedMeetings, ...otherRows]
}

/**
 * Upcoming rows in the next `horizonDays`, sorted by start time.
 */
export async function getPersonalCalendarUpcomingInHorizon(userId, horizonDays = 14, maxResults = 40) {
  const now = Date.now()
  const horizonEnd = now + Math.max(1, horizonDays) * 86400000
  const months = monthsCoveringRange(new Date(now), new Date(horizonEnd))
  const parts = await Promise.all(
    months.map(({ year, month }) => loadPersonalCalendarMonthForUser(userId, year, month))
  )
  const flat = parts.flat()
  const upcoming = flat.filter((row) => {
    const ms = row.startAt?.toMillis?.() ?? row.startAt ?? 0
    if (!ms || ms < now || ms > horizonEnd) return false
    if (row._todo && row.done) return false
    return true
  })
  upcoming.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0))
  return upcoming.slice(0, maxResults)
}

/** Stable React key for an upcoming / calendar row */
export function dashboardCalendarRowKey(row) {
  const ms = row.startAt?.toMillis?.() ?? row.startAt ?? 0
  if (row._todo) return `todo-${row.id}-${ms}`
  if (row._imported) return `import-${row.id}-${ms}`
  const oid = row.orgId || row._orgId || 'm'
  return `${oid}-${row.id}-${ms}`
}
