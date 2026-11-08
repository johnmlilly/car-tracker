import type { ItemStatus } from './api'

export const SOON_DAYS = 30
export const SOON_MILES = 1000
const DAY_MS = 86_400_000

export interface IntervalInput {
  intervalMiles: number | null
  intervalMonths: number | null
  lastDoneDate: string | null
  lastDoneOdometer: number | null
}

export interface DuePoint {
  nextDueDate: string | null
  nextDueMiles: number | null
}

/** Current calendar date in America/New_York as YYYY-MM-DD. */
export function todayInEastern(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Strict YYYY-MM-DD check that also rejects impossible dates like 2026-02-30. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Adds calendar months, clamping to the last day of the target month. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const targetMonthIndex = m - 1 + months
  const lastDay = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, targetMonthIndex, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS)
}

export interface LastDone {
  lastDoneDate: string | null
  lastDoneOdometer: number | null
}

/**
 * "Last done" from the one-time baseline and confirmed service records, per
 * dimension: the latest date and the highest odometer. A record without an
 * odometer advances only the date. Entry order doesn't matter.
 */
export function resolveLastDone(
  baseline: { baselineDate: string | null; baselineOdometer: number | null },
  records: { date: string; odometer: number | null }[],
): LastDone {
  let lastDoneDate = baseline.baselineDate
  let lastDoneOdometer = baseline.baselineOdometer
  for (const record of records) {
    if (lastDoneDate === null || record.date > lastDoneDate) lastDoneDate = record.date
    if (record.odometer !== null && (lastDoneOdometer === null || record.odometer > lastDoneOdometer)) {
      lastDoneOdometer = record.odometer
    }
  }
  return { lastDoneDate, lastDoneOdometer }
}

export function computeDue(item: IntervalInput): DuePoint {
  return {
    nextDueDate:
      item.lastDoneDate !== null && item.intervalMonths !== null
        ? addMonths(item.lastDoneDate, item.intervalMonths)
        : null,
    nextDueMiles:
      item.lastDoneOdometer !== null && item.intervalMiles !== null
        ? item.lastDoneOdometer + item.intervalMiles
        : null,
  }
}

const SEVERITY: Record<Exclude<ItemStatus, 'unknown'>, number> = { ok: 0, soon: 1, overdue: 2 }

/** Worse of the date and mileage statuses; `unknown` when neither can be computed. */
export function computeStatus(
  due: DuePoint,
  today: string,
  currentMiles: number | null,
): ItemStatus {
  const statuses: Exclude<ItemStatus, 'unknown'>[] = []

  if (due.nextDueDate !== null) {
    const daysLeft = daysBetween(today, due.nextDueDate)
    statuses.push(daysLeft < 0 ? 'overdue' : daysLeft <= SOON_DAYS ? 'soon' : 'ok')
  }
  if (due.nextDueMiles !== null && currentMiles !== null) {
    const milesLeft = due.nextDueMiles - currentMiles
    statuses.push(milesLeft < 0 ? 'overdue' : milesLeft <= SOON_MILES ? 'soon' : 'ok')
  }

  if (statuses.length === 0) return 'unknown'
  return statuses.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst))
}
