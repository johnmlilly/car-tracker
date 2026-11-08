/** $99,999.99, the most any total or line amount can be. */
export const MAX_CENTS = 9_999_999

/**
 * Integer cents from dollars as typed: `12`, `12.5`, `12.34`, `$1,234.50`.
 * Null for anything else (negative, more than two decimals, over the max).
 */
export function parseDollarsToCents(text: string): number | null {
  const match = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  const dollars = Number(match[1].replace(/,/g, ''))
  const cents = dollars * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return cents <= MAX_CENTS ? cents : null
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}
