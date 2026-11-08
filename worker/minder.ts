import type { DueItemView, ScheduleItemView } from '../shared/api'
import { todayInEastern } from '../shared/schedule'
import { MAX_ODOMETER } from './baseline'

export interface MinderInput {
  code: string
  odometer: number | null
}

export type MinderParseResult =
  { ok: true; value: MinderInput } | { ok: false; fields: Record<string, string> }

export interface MinderLookupRow {
  code: string
  kind: 'main' | 'sub'
  serviceId: number
}

export type ResolveResult = { ok: true; serviceIds: number[] } | { ok: false; message: string }

const CODE_MESSAGE = 'Enter a code like A or B12.'

/** Uppercases and strips whitespace; sub-item digits come back sorted. Null if malformed. */
export function normalizeCode(raw: string): string | null {
  const compact = raw.replace(/\s+/g, '').toUpperCase()
  if (!/^[AB]\d*$/.test(compact)) return null
  const digits = compact.slice(1).split('')
  if (new Set(digits).size !== digits.length) return null
  return compact[0] + digits.sort().join('')
}

/** Validates a log-a-code body. Lookup checks happen later in `resolveServices`. */
export function parseMinderInput(body: unknown): MinderParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, fields: { body: 'Expected a JSON object.' } }
  }
  const { code, odometer } = body as Record<string, unknown>
  const fields: Record<string, string> = {}

  const normalized = typeof code === 'string' ? normalizeCode(code) : null
  if (normalized === null) fields.code = CODE_MESSAGE

  if (
    odometer !== undefined &&
    odometer !== null &&
    (typeof odometer !== 'number' ||
      !Number.isInteger(odometer) ||
      odometer < 0 ||
      odometer > MAX_ODOMETER)
  ) {
    fields.odometer = `Enter whole miles from 0 to ${MAX_ODOMETER.toLocaleString('en-US')}.`
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return {
    ok: true,
    value: { code: normalized as string, odometer: (odometer as number | null | undefined) ?? null },
  }
}

/** Maps a normalized code to the distinct service ids it opens. */
export function resolveServices(code: string, lookup: MinderLookupRow[]): ResolveResult {
  const ids = new Set<number>()
  const add = (kind: MinderLookupRow['kind'], part: string) => {
    const rows = lookup.filter((r) => r.kind === kind && r.code === part)
    rows.forEach((r) => ids.add(r.serviceId))
    return rows.length > 0
  }

  if (!add('main', code[0])) return { ok: false, message: CODE_MESSAGE }
  for (const digit of code.slice(1)) {
    if (!add('sub', digit)) {
      return { ok: false, message: `Sub-item ${digit} isn't in this car's Minder list.` }
    }
  }
  return { ok: true, serviceIds: [...ids].sort((a, b) => a - b) }
}

export interface OpenItemRow {
  serviceName: string
  logId: number
  code: string
  loggedAt: string
}

/** One overdue entry per service, dated from the earliest log that opened it. */
export function groupDueItems(rows: OpenItemRow[]): DueItemView[] {
  const earliest = new Map<string, OpenItemRow>()
  for (const row of rows) {
    const current = earliest.get(row.serviceName)
    if (
      !current ||
      row.loggedAt < current.loggedAt ||
      (row.loggedAt === current.loggedAt && row.logId < current.logId)
    ) {
      earliest.set(row.serviceName, row)
    }
  }
  return [...earliest.values()]
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName))
    .map((row) => ({
      serviceName: row.serviceName,
      status: 'overdue',
      since: { code: row.code, date: todayInEastern(new Date(row.loggedAt)) },
    }))
}

/**
 * Applies open Minder items to schedule items for the same service (always
 * overdue) and returns the Minder items that have no schedule item.
 */
export function mergeMinderStatus(
  items: ScheduleItemView[],
  due: DueItemView[],
): { items: ScheduleItemView[]; dueItems: DueItemView[] } {
  const byService = new Map(due.map((d) => [d.serviceName, d]))
  const merged = items.map((item) => {
    const open = byService.get(item.serviceName)
    if (!open) return item
    byService.delete(item.serviceName)
    return { ...item, status: 'overdue' as const, minderSince: open.since }
  })
  return { items: merged, dueItems: [...byService.values()] }
}
