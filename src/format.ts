const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Formats a YYYY-MM-DD string without shifting it through the local timezone. */
export function formatDate(isoDate: string): string {
  return DATE_FORMAT.format(new Date(`${isoDate}T00:00:00Z`))
}

export function formatMiles(miles: number): string {
  return `${miles.toLocaleString('en-US')} mi`
}

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
