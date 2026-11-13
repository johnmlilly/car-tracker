import type { ServiceRecordView } from '../shared/api'

export const SERVICE_GROUPS = ['Oil', 'Tires', 'Filters', 'Fluids', 'Inspections', 'Other'] as const
export type ServiceGroup = (typeof SERVICE_GROUPS)[number]

const GROUP_OF: Record<string, ServiceGroup> = {
  'Oil and filter change': 'Oil',
  'Tire rotation': 'Tires',
  'Engine air filter': 'Filters',
  'Cabin air filter': 'Filters',
  'Brake fluid': 'Fluids',
  'Engine coolant': 'Fluids',
  'Transmission fluid': 'Fluids',
  'Multi-point inspection': 'Inspections',
  'Drive belt inspection': 'Inspections',
  'Valve clearance inspection': 'Inspections',
  'Timing belt and water pump inspection': 'Inspections',
}

/** Filter group for a line's service; unmatched lines and unknown services are Other. */
export function serviceGroup(serviceName: string | null): ServiceGroup {
  return (serviceName && GROUP_OF[serviceName]) || 'Other'
}

export interface HistoryFilter {
  query: string
  /** null shows every group. */
  group: ServiceGroup | null
  hasReceipt: boolean
}

export const NO_FILTER: HistoryFilter = { query: '', group: null, hasReceipt: false }

function searchText(record: ServiceRecordView): string {
  return [record.shop ?? '', ...record.items.flatMap((i) => [i.description, i.serviceName ?? ''])]
    .join(' ')
    .toLowerCase()
}

export function filterRecords(records: ServiceRecordView[], filter: HistoryFilter): ServiceRecordView[] {
  const query = filter.query.trim().toLowerCase()
  return records.filter(
    (r) =>
      (!filter.hasReceipt || r.receipt !== null) &&
      (filter.group === null || r.items.some((i) => serviceGroup(i.serviceName) === filter.group)) &&
      (query === '' || searchText(r).includes(query)),
  )
}

/** The record's cost: its total, else the sum of known line amounts, else null. */
export function recordCost(record: ServiceRecordView): number | null {
  if (record.totalCents !== null) return record.totalCents
  const amounts = record.items.map((i) => i.amountCents).filter((a): a is number => a !== null)
  return amounts.length ? amounts.reduce((sum, a) => sum + a, 0) : null
}

export interface YearGroup {
  year: string
  records: ServiceRecordView[]
  totalCents: number
}

/** Records grouped by calendar year, newest year first, keeping input order inside a year. */
export function groupByYear(records: ServiceRecordView[]): YearGroup[] {
  const groups = new Map<string, ServiceRecordView[]>()
  for (const record of records) {
    const year = record.date.slice(0, 4)
    groups.set(year, [...(groups.get(year) ?? []), record])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, list]) => ({
      year,
      records: list,
      totalCents: list.reduce((sum, r) => sum + (recordCost(r) ?? 0), 0),
    }))
}

export interface HistoryStats {
  services: number
  spentCents: number
  /** Newest record date; null with no records. */
  lastDate: string | null
  receipts: number
}

export function historyStats(records: ServiceRecordView[]): HistoryStats {
  return {
    services: records.length,
    spentCents: records.reduce((sum, r) => sum + (recordCost(r) ?? 0), 0),
    lastDate: records.reduce<string | null>((latest, r) => (latest === null || r.date > latest ? r.date : latest), null),
    receipts: records.filter((r) => r.receipt !== null).length,
  }
}

/** Distinct tracked services on a record, in line order. */
export function recordServices(record: ServiceRecordView): string[] {
  return [...new Set(record.items.map((i) => i.serviceName).filter((n): n is string => n !== null))]
}

/** Desktop history columns: date, work, shop, miles, cost (the receipt cell sits beside them). */
export const HISTORY_COLUMNS = 'md:grid-cols-[84px_minmax(0,1fr)_150px_84px_84px]'
