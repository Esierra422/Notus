import { Timestamp } from 'firebase/firestore'

function firstWeeklyOccurrenceMs(startMs, targetWeekday) {
  const r = new Date(startMs)
  const d = new Date(r.getFullYear(), r.getMonth(), r.getDate(), r.getHours(), r.getMinutes(), 0, 0)
  let guard = 0
  while (d.getDay() !== targetWeekday && guard++ < 8) d.setDate(d.getDate() + 1)
  let ms = d.getTime()
  let g = 0
  while (ms < startMs && g++ < 520) {
    d.setDate(d.getDate() + 7)
    ms = d.getTime()
  }
  return ms
}

function makeVirtual(m, ms) {
  return {
    ...m,
    id: `${m.id}__${ms}`,
    _seriesId: m.id,
    _recurrenceInstance: true,
    startAt: Timestamp.fromMillis(ms),
  }
}

/**
 * Expand recurring meetings for one calendar month (weekly / daily).
 */
export function expandMeetingOccurrencesInMonth(m, year, month) {
  const rec = m.recurrence
  if (!rec || !rec.frequency || rec.frequency === 'none') {
    return [{ ...m, _seriesId: m.id, _recurrenceInstance: false }]
  }

  const startMs = m.startAt?.toMillis?.() ?? 0
  if (!startMs) return [{ ...m, _seriesId: m.id, _recurrenceInstance: false }]

  const monthStart = new Date(year, month, 1).getTime()
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()
  const interval = Math.max(1, parseInt(rec.interval, 10) || 1)
  const untilMs = rec.until?.toMillis?.() ?? null
  const endCap = untilMs != null ? Math.min(untilMs, monthEnd + 86400000 * 400) : monthEnd + 86400000 * 400

  const base = new Date(startMs)
  const weekdays =
    Array.isArray(rec.byWeekday) && rec.byWeekday.length
      ? [...new Set(rec.byWeekday.map(Number))]
      : [base.getDay()]

  if (rec.frequency === 'weekly') {
    const out = []
    for (const wd of weekdays) {
      let ms = firstWeeklyOccurrenceMs(startMs, wd)
      let steps = 0
      while (ms <= endCap && steps++ < 520) {
        if (ms >= monthStart && ms <= monthEnd) out.push(makeVirtual(m, ms))
        ms += interval * 7 * 86400000
      }
    }
    if (!out.length) return [{ ...m, _seriesId: m.id, _recurrenceInstance: false }]
    out.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0))
    const dedup = []
    const seen = new Set()
    for (const row of out) {
      const k = row.startAt?.toMillis?.() ?? 0
      if (seen.has(k)) continue
      seen.add(k)
      dedup.push(row)
    }
    return dedup
  }

  if (rec.frequency === 'daily') {
    const out = []
    let ms = startMs
    let guard = 0
    while (ms <= endCap && guard++ < 400) {
      if (ms >= monthStart && ms <= monthEnd) out.push(makeVirtual(m, ms))
      const d = new Date(ms)
      d.setDate(d.getDate() + interval)
      ms = d.getTime()
    }
    return out.length ? out : [{ ...m, _seriesId: m.id, _recurrenceInstance: false }]
  }

  return [{ ...m, _seriesId: m.id, _recurrenceInstance: false }]
}

export function expandMeetingsListForMonth(meetings, year, month) {
  const flat = []
  for (const m of meetings) {
    flat.push(...expandMeetingOccurrencesInMonth(m, year, month))
  }
  flat.sort((a, b) => (a.startAt?.toMillis?.() ?? 0) - (b.startAt?.toMillis?.() ?? 0))
  return flat
}
