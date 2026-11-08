import type { ServiceItemInput, ServiceRecordInput } from '../shared/api'
import { MAX_CENTS } from '../shared/money'
import { isIsoDate, todayInEastern } from '../shared/schedule'
import { MILES_MESSAGE, parseMiles } from './validate'

export const MAX_LINE_ITEMS = 30
export const MAX_SHOP_LENGTH = 100
export const MAX_DESCRIPTION_LENGTH = 200

const AMOUNT_MESSAGE = 'Enter an amount from $0 to $99,999.99.'

export type ServiceRecordParseResult =
  { ok: true; value: ServiceRecordInput } | { ok: false; fields: Record<string, string> }

/** Integer cents, `null` for null/absent, `undefined` when invalid. */
function parseCents(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_CENTS) {
    return undefined
  }
  return value
}

function parseItem(
  raw: unknown,
  index: number,
  fields: Record<string, string>,
): ServiceItemInput | null {
  const key = (name: string) => `items.${index}.${name}`
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fields[key('description')] = 'Enter a description.'
    return null
  }
  const { description, serviceId, amountCents } = raw as Record<string, unknown>
  let ok = true

  const text = typeof description === 'string' ? description.trim() : ''
  if (text === '') {
    fields[key('description')] = 'Enter a description.'
    ok = false
  } else if (text.length > MAX_DESCRIPTION_LENGTH) {
    fields[key('description')] = `Keep descriptions to ${MAX_DESCRIPTION_LENGTH} characters.`
    ok = false
  }

  const service =
    serviceId === null || serviceId === undefined
      ? null
      : typeof serviceId === 'number' && Number.isInteger(serviceId) && serviceId > 0
        ? serviceId
        : undefined
  if (service === undefined) {
    fields[key('serviceId')] = 'Pick a service from the list.'
    ok = false
  }

  const amount = parseCents(amountCents)
  if (amount === undefined) {
    fields[key('amountCents')] = AMOUNT_MESSAGE
    ok = false
  }

  return ok ? { description: text, serviceId: service!, amountCents: amount! } : null
}

/**
 * Validates a new service record body. `today` is YYYY-MM-DD in Eastern time.
 * Service ids are shape-checked here; the route checks they exist.
 */
export function parseServiceRecordInput(body: unknown, today: string): ServiceRecordParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, fields: { body: 'Expected a JSON object.' } }
  }
  const { date, odometer, shop, totalCents, items } = body as Record<string, unknown>
  const fields: Record<string, string> = {}

  if (typeof date !== 'string' || !isIsoDate(date)) {
    fields.date = 'Enter a valid date.'
  } else if (date > today) {
    fields.date = "Date can't be in the future."
  }

  const miles = parseMiles(odometer)
  if (miles === undefined) fields.odometer = MILES_MESSAGE

  let shopText: string | null = null
  if (shop !== null && shop !== undefined) {
    if (typeof shop !== 'string' || shop.trim().length > MAX_SHOP_LENGTH) {
      fields.shop = `Keep the shop name to ${MAX_SHOP_LENGTH} characters.`
    } else {
      shopText = shop.trim() || null
    }
  }

  const total = parseCents(totalCents)
  if (total === undefined) fields.totalCents = AMOUNT_MESSAGE

  const lines: ServiceItemInput[] = []
  if (!Array.isArray(items) || items.length === 0) {
    fields.items = 'Add at least one line item.'
  } else if (items.length > MAX_LINE_ITEMS) {
    fields.items = `Add up to ${MAX_LINE_ITEMS} line items.`
  } else {
    items.forEach((raw, index) => {
      const line = parseItem(raw, index, fields)
      if (line) lines.push(line)
    })
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return {
    ok: true,
    value: {
      date: date as string,
      odometer: miles as number | null,
      shop: shopText,
      totalCents: total as number | null,
      items: lines,
    },
  }
}

export interface ClosedDueRow {
  id: number
  serviceId: number
  loggedAt: string
}

export interface CoveringItem {
  id: number
  serviceId: number
  /** Date of the record the line belongs to. */
  date: string
}

/**
 * When a record is deleted, the Minder items it closed go to another record
 * that still covers them (same service, dated on or after the code's Eastern
 * date), pointing at that record's lowest-id matching line. Items no other
 * record covers reopen. `others` must exclude the record being deleted.
 */
export function reassignClosures(
  closed: ClosedDueRow[],
  others: CoveringItem[],
): { dueItemId: number; closedByServiceItemId: number }[] {
  return closed.flatMap((due) => {
    const logDate = todayInEastern(new Date(due.loggedAt))
    const covering = others
      .filter((item) => item.serviceId === due.serviceId && item.date >= logDate)
      .sort((a, b) => a.id - b.id)[0]
    return covering ? [{ dueItemId: due.id, closedByServiceItemId: covering.id }] : []
  })
}

export interface OpenDueRow {
  id: number
  serviceId: number
  loggedAt: string
}

/**
 * Open Minder due items a record closes: same service as one of its matched
 * lines, from a code logged on or before the record date (Eastern). A
 * backdated record never closes a code logged after the service.
 */
export function selectDueItemsToClose(
  openRows: OpenDueRow[],
  serviceIds: (number | null)[],
  recordDate: string,
): number[] {
  const covered = new Set(serviceIds.filter((id): id is number => id !== null))
  return openRows
    .filter(
      (row) =>
        covered.has(row.serviceId) && todayInEastern(new Date(row.loggedAt)) <= recordDate,
    )
    .map((row) => row.id)
    .sort((a, b) => a - b)
}
