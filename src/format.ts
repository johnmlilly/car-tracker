import type { ItemStatus, MileageSummary, Vehicle } from '../shared/api'
import { formatDate, formatMiles } from '../shared/format'

export { formatDate, formatMiles }

/**
 * Joins the known parts of a date/mileage point, e.g. "Oct 1, 2026 or 71,000 mi"
 * for a due point or "Oct 1, 2025 at 61,000 mi" for a past service. Null when
 * neither part is known.
 */
export function formatPoint(
  date: string | null,
  miles: number | null,
  joiner: 'or' | 'at' = 'or',
): string | null {
  const parts = [date && formatDate(date), miles !== null ? formatMiles(miles) : null].filter(
    (p): p is string => Boolean(p),
  )
  return parts.length ? parts.join(` ${joiner} `) : null
}

export function formatInterval(miles: number | null, months: number | null): string {
  const parts = [
    miles !== null ? formatMiles(miles) : null,
    months !== null ? `${months} ${months === 1 ? 'month' : 'months'}` : null,
  ].filter((p): p is string => Boolean(p))
  return `Every ${parts.join(' or ')}`
}

/** Headline and source line for a vehicle's mileage, e.g. "~61,350 mi". */
export function describeMileage(mileage: MileageSummary | null): {
  headline: string
  detail: string | null
} {
  if (!mileage) return { headline: 'No mileage logged', detail: null }
  const { latest } = mileage
  if (mileage.milesPerDay === null || mileage.estimate === latest.odometer) {
    return { headline: formatMiles(latest.odometer), detail: `Logged ${formatDate(latest.date)}` }
  }
  return {
    headline: `~${formatMiles(mileage.estimate)}`,
    detail: `Estimated from ${formatMiles(latest.odometer)} on ${formatDate(latest.date)}`,
  }
}

/** Text paired with a status color. */
export function statusLabel(status: ItemStatus, hasLastDone: boolean): string {
  switch (status) {
    case 'ok':
      return 'OK'
    case 'soon':
      return 'Due soon'
    case 'overdue':
      return 'Overdue'
    case 'unknown':
      return hasLastDone ? 'Needs mileage' : 'Not set'
  }
}

export const SCHEDULE_LABELS: Record<Vehicle['scheduleModel'], string> = {
  minder: 'Interval schedule + Maintenance Minder',
  interval: 'Interval schedule',
}
