import type { MileageSummary } from './api'
import { addMonths, daysBetween } from './schedule'

export const MIN_RATE_SPAN_DAYS = 14
export const RATE_WINDOW_MONTHS = 12

export interface Reading {
  date: string
  odometer: number
}

export function compareReadings(a: Reading, b: Reading): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.odometer - b.odometer
}

function pickAnchor(sorted: Reading[], latest: Reading): Reading | null {
  const candidates = sorted.filter(
    (r) => daysBetween(r.date, latest.date) >= MIN_RATE_SPAN_DAYS,
  )
  if (candidates.length === 0) return null
  const windowStart = addMonths(latest.date, -RATE_WINDOW_MONTHS)
  return candidates.find((r) => r.date >= windowStart) ?? candidates[candidates.length - 1]
}

/**
 * Current mileage from the latest reading plus the recent driving rate. The rate
 * comes from the oldest reading within a year of the latest that is at least two
 * weeks older, so one long gap or a same-week pair can't skew it.
 */
export function estimateMileage(readings: Reading[], today: string): MileageSummary | null {
  if (readings.length === 0) return null
  const sorted = [...readings].sort(compareReadings)
  const latest = sorted[sorted.length - 1]
  const anchor = pickAnchor(sorted, latest)

  const milesPerDay = anchor
    ? Math.max(0, latest.odometer - anchor.odometer) / daysBetween(anchor.date, latest.date)
    : null
  const elapsed = Math.max(0, daysBetween(latest.date, today))

  return {
    estimate: latest.odometer + Math.round((milesPerDay ?? 0) * elapsed),
    latest: { date: latest.date, odometer: latest.odometer },
    milesPerDay,
  }
}
