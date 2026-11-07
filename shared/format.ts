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
