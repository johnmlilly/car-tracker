export type ScheduleModel = 'interval' | 'minder'

export type ItemStatus = 'ok' | 'soon' | 'overdue' | 'unknown'

export interface Vehicle {
  id: number
  name: string
  scheduleModel: ScheduleModel
  attention: { soon: number; overdue: number } | null
  mileage: MileageSummary | null
}

export interface ScheduleItemView {
  id: number
  serviceName: string
  intervalMiles: number | null
  intervalMonths: number | null
  baselineDate: string | null
  baselineOdometer: number | null
  nextDueDate: string | null
  nextDueMiles: number | null
  status: ItemStatus
  /** Open Minder item for this service; null when none or not a Minder vehicle. */
  minderSince: { code: string; date: string } | null
}

export interface VehicleDetailResponse {
  vehicle: Vehicle
  today: string
  items: ScheduleItemView[]
  /** Open Minder items for services without a schedule item; empty for interval vehicles. */
  dueItems: DueItemView[]
}

export interface DueItemView {
  serviceName: string
  status: 'overdue'
  /** The earliest open log that opened this service. */
  since: { code: string; date: string }
}

export interface MinderLogView {
  id: number
  code: string
  loggedAt: string
  /** Eastern date of `loggedAt`, YYYY-MM-DD. */
  date: string
  odometer: number | null
  services: string[]
}

export interface MinderResponse {
  vehicle: { id: number; name: string }
  today: string
  mileage: MileageSummary | null
  /** Newest first. */
  logs: MinderLogView[]
}

export interface ScheduleItemResponse {
  item: ScheduleItemView
}

export interface VehiclesResponse {
  vehicles: Vehicle[]
}

export interface ErrorResponse {
  error: { message: string; fields?: Record<string, string> }
}

export interface MileageSummary {
  estimate: number
  latest: { date: string; odometer: number }
  milesPerDay: number | null
}

export interface OdometerReading {
  id: number
  date: string
  odometer: number
  source: 'manual' | 'record'
}

export interface OdometerResponse {
  vehicle: { id: number; name: string }
  today: string
  mileage: MileageSummary | null
  /** Newest first. */
  readings: OdometerReading[]
}
