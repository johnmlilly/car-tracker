import type { DueItemView, ItemStatus, NextDueView, ScheduleItemView } from './api'
import { daysBetween, SOON_DAYS, SOON_MILES } from './schedule'

/** Progress through the current interval on one dimension. `remaining` < 0 is overdue. */
export type Countdown =
  | { kind: 'miles'; remaining: number; used: number; from: number; to: number }
  | { kind: 'days'; remaining: number; used: number; from: string; to: string }

const SEVERITY: Record<ItemStatus, number> = { overdue: 3, soon: 2, ok: 1, unknown: 0 }

function dimensionSeverity(c: Countdown): number {
  const soon = c.kind === 'miles' ? SOON_MILES : SOON_DAYS
  return c.remaining < 0 ? 3 : c.remaining <= soon ? 2 : 1
}

function milesCountdown(item: ScheduleItemView, estimate: number | null): Countdown | null {
  const { intervalMiles, lastDoneOdometer, nextDueMiles } = item
  if (!intervalMiles || lastDoneOdometer === null || nextDueMiles === null || estimate === null) {
    return null
  }
  return {
    kind: 'miles',
    remaining: nextDueMiles - estimate,
    used: (estimate - lastDoneOdometer) / intervalMiles,
    from: lastDoneOdometer,
    to: nextDueMiles,
  }
}

function daysCountdown(item: ScheduleItemView, today: string): Countdown | null {
  const { lastDoneDate, nextDueDate } = item
  if (lastDoneDate === null || nextDueDate === null) return null
  const span = daysBetween(lastDoneDate, nextDueDate)
  if (span <= 0) return null
  return {
    kind: 'days',
    remaining: daysBetween(today, nextDueDate),
    used: daysBetween(lastDoneDate, today) / span,
    from: lastDoneDate,
    to: nextDueDate,
  }
}

/**
 * The dimension that drives the item's status: the one with the worse status
 * (same thresholds as `computeStatus`), then the one further through its interval.
 * Null when neither dimension can be computed.
 */
export function countdown(
  item: ScheduleItemView,
  estimate: number | null,
  today: string,
): Countdown | null {
  const options = [milesCountdown(item, estimate), daysCountdown(item, today)].filter(
    (c): c is Countdown => c !== null,
  )
  if (options.length === 0) return null
  return options.reduce((best, c) => {
    const diff = dimensionSeverity(c) - dimensionSeverity(best)
    return diff > 0 || (diff === 0 && c.used > best.used) ? c : best
  })
}

/** Bar fill from 0 to 1. */
export function barFraction(c: Countdown): number {
  return Math.min(1, Math.max(0, c.used))
}

/** Countdown as a big number and its unit, e.g. { value: '340', unit: 'mi overdue' }. */
export function describeCountdown(c: Countdown): { value: string; unit: string } {
  const overdue = c.remaining < 0
  const amount = Math.abs(c.remaining)
  const tail = overdue ? 'overdue' : 'left'
  if (c.kind === 'miles') return { value: amount.toLocaleString('en-US'), unit: `mi ${tail}` }
  if (amount <= 60) return { value: String(amount), unit: `${amount === 1 ? 'day' : 'days'} ${tail}` }
  const months = Math.round(amount / 30.44)
  return { value: String(months), unit: `months ${tail}` }
}

/** One card on the vehicle grid: a schedule item or a leftover Minder item. */
export type GridEntry =
  | { kind: 'item'; item: ScheduleItemView; countdown: Countdown | null }
  | { kind: 'minder'; item: DueItemView }

function entryStatus(entry: GridEntry): ItemStatus {
  return entry.item.status
}

/** Minder-driven entries sort first within their status: the car has asked for them. */
function entryUsed(entry: GridEntry): number {
  if (entry.kind === 'minder' || entry.item.minderSince) return Number.POSITIVE_INFINITY
  return entry.countdown?.used ?? Number.NEGATIVE_INFINITY
}

/** Most urgent first: overdue, soon, ok, unknown; then further through the interval; then name. */
export function compareUrgency(a: GridEntry, b: GridEntry): number {
  return (
    SEVERITY[entryStatus(b)] - SEVERITY[entryStatus(a)] ||
    (entryUsed(b) === entryUsed(a) ? 0 : entryUsed(b) > entryUsed(a) ? 1 : -1) ||
    a.item.serviceName.localeCompare(b.item.serviceName)
  )
}

/** Grid entries for a vehicle, most urgent first. */
export function gridEntries(
  items: ScheduleItemView[],
  dueItems: DueItemView[],
  estimate: number | null,
  today: string,
): GridEntry[] {
  return [
    ...dueItems.map((item): GridEntry => ({ kind: 'minder', item })),
    ...items.map((item): GridEntry => ({ kind: 'item', item, countdown: countdown(item, estimate, today) })),
  ].sort(compareUrgency)
}

/** The most urgent entry with a known status, for the home card; null when none. */
export function pickNextDue(
  items: ScheduleItemView[],
  dueItems: DueItemView[],
  estimate: number | null,
  today: string,
): NextDueView | null {
  const first = gridEntries(items, dueItems, estimate, today).find(
    (e) => e.item.status !== 'unknown',
  )
  if (!first) return null
  if (first.kind === 'minder') {
    return {
      serviceName: first.item.serviceName,
      status: first.item.status,
      minder: first.item.since,
      countdown: null,
    }
  }
  return {
    serviceName: first.item.serviceName,
    status: first.item.status,
    minder: first.item.minderSince,
    countdown: first.countdown,
  }
}
